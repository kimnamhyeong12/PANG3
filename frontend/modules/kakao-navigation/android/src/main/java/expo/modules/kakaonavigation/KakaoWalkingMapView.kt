package expo.modules.kakaonavigation

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.GeomagneticField
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.Choreographer
import android.view.Surface
import android.view.ViewGroup
import android.view.WindowManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.kakao.vectormap.*
import com.kakao.vectormap.camera.CameraPosition
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.TransformMethod
import com.kakao.vectormap.route.*
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.hypot

/** Walking route display only. Routing remains the Kakao walking REST API. */
class KakaoWalkingMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
  SensorEventListener, DefaultLifecycleObserver {
  override val shouldUseAndroidLayout = true
  private val onError by EventDispatcher<Map<String, String>>()
  private val onReady by EventDispatcher<Map<String, Boolean>>()
  private val onMapPress by EventDispatcher<Map<String, Boolean>>()
  private val handler = Handler(Looper.getMainLooper())
  private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rotationSensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    ?: sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
  private var mapView: MapView? = null
  private var map: KakaoMap? = null
  private var owner: LifecycleOwner? = null
  private var active = true
  private var resumed = false
  private var following = true
  private var headingFollow = true
  private var heading: Double? = null
  private var magneticDeclination = 0f
  private val rotationMatrix = FloatArray(9)
  private val displayMatrix = FloatArray(9)
  private var position: LatLng? = null
  private var route = emptyList<LatLng>()
  private var currentLabel: Label? = null
  private var destinationLabel: Label? = null
  private val routeArrowBitmap by lazy {
    val density = resources.displayMetrics.density
    val width = (12 * density).toInt().coerceAtLeast(12)
    val height = (5 * density).toInt().coerceAtLeast(5)
    Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 1.5f * density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
      }
      // Route textures run along their horizontal axis, from the first point to the last.
      val chevron = Path().apply {
        moveTo(width * 0.35f, height * 0.18f)
        lineTo(width * 0.65f, height * 0.5f)
        lineTo(width * 0.35f, height * 0.82f)
      }
      Canvas(bitmap).drawPath(chevron, paint)
    }
  }
  private var lastRenderedHeading = Double.NaN
  private var lastHeadingLogAt = 0L
  private val choreographer by lazy { Choreographer.getInstance() }
  private var headingFramePosted = false
  private var lastHeadingFrameNanos = 0L
  private val headingFrame = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      headingFramePosted = false
      val kakaoMap = map
      val target = heading
      if (kakaoMap == null || target == null || !active || !resumed || !headingFollow || !following) {
        lastHeadingFrameNanos = 0L
        return
      }
      val elapsed = if (lastHeadingFrameNanos == 0L) 16.0 else (frameTimeNanos - lastHeadingFrameNanos) / 1_000_000.0
      lastHeadingFrameNanos = frameTimeNanos
      lastRenderedHeading = WalkingHeading.nextFrame(lastRenderedHeading, target, elapsed)
      currentLabel?.rotateTo(Math.toRadians(lastRenderedHeading).toFloat())
      // Heading changes only rotate the existing camera: retain position, zoom and tilt.
      kakaoMap.moveCamera(CameraUpdateFactory.rotateTo(Math.toRadians(WalkingHeading.normalize(-lastRenderedHeading))))
      val now = SystemClock.elapsedRealtime()
      if (now - lastHeadingLogAt >= 2000) {
        lastHeadingLogAt = now
        val displayed = lastRenderedHeading.toInt()
        kakaoMap.getCameraPosition { camera ->
          Log.d("PANG3WalkingHeading", "heading=$displayed camera=${Math.toDegrees(camera.rotationAngle).toInt()} tilt=${Math.toDegrees(camera.tiltAngle).toInt()} zoom=${camera.zoomLevel}")
        }
      }
      if (abs(WalkingHeading.difference(target, lastRenderedHeading)) > 0.02) queueHeadingFrame()
      else lastHeadingFrameNanos = 0L
    }
  }

  private fun queueHeadingFrame() {
    if (headingFramePosted || !active || !resumed || !following || !headingFollow || map == null || heading == null) return
    headingFramePosted = true
    choreographer.postFrameCallback(headingFrame)
  }
  private var touchX = 0f
  private var touchY = 0f
  private var dragged = false
  private var lastRecenter = 0
  private var lastOverview = 0
  private val returnToLocation = Runnable { if (active && resumed) { following = true; followCamera(true) } }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    Log.i("PANG3WalkingMap", "Attaching walking map")
    val activity = appContext.currentActivity ?: return
    owner = activity as? LifecycleOwner
    owner?.lifecycle?.addObserver(this)
    if (mapView == null) {
      try {
        val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        val key = info.metaData?.getString("com.pang3.KAKAO_NATIVE_APP_KEY").orEmpty()
        require(key.isNotBlank()) { "카카오 지도 앱 키가 필요합니다." }
        KakaoMapSdk.init(context.applicationContext, key)
        val view = MapView(activity)
        mapView = view
        addView(view, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        view.start(object : MapLifeCycleCallback() {
          override fun onMapDestroy() { map = null }
          override fun onMapError(error: Exception) { Log.e("PANG3WalkingMap", "Walking map failed", error); onError(mapOf("message" to "도보 지도를 시작하지 못했습니다. 앱 키와 네트워크를 확인해 주세요.")) }
        }, object : KakaoMapReadyCallback() {
          override fun getPosition(): LatLng = this@KakaoWalkingMapView.position ?: this@KakaoWalkingMapView.route.firstOrNull() ?: LatLng.from(37.5665, 126.978)
          override fun getZoomLevel(): Int = 17
          override fun onMapReady(kakaoMap: KakaoMap) {
            Log.i("PANG3WalkingMap", "Walking map ready")
            map = kakaoMap
            kakaoMap.setBuildingHeightScale(1f)
            updateCameraPadding()
            drawRoute(); drawPosition(); followCamera(true)
            if (active) resumeMap()
            onReady(mapOf("headingAvailable" to (rotationSensor != null)))
          }
        })
      } catch (error: Exception) { onError(mapOf("message" to (error.message ?: "도보 지도 초기화 실패"))) }
    }
    if (active) resumeMap()
  }

  fun setPosition(value: Map<String, Double>?) {
    val lat = value?.get("lat") ?: return
    val lng = value["lng"] ?: return
    if (!lat.isFinite() || !lng.isFinite() || abs(lat) > 90 || abs(lng) > 180) return
    position = LatLng.from(lat, lng)
    magneticDeclination = GeomagneticField(lat.toFloat(), lng.toFloat(), 0f, System.currentTimeMillis()).declination
    drawPosition(); followCamera(false)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val view = mapView ?: return
    val mapWidth = right - left
    val mapHeight = bottom - top
    if (changed) Log.i("PANG3WalkingMap", "Layout host=${mapWidth}x${mapHeight} child=${view.width}x${view.height}")
    if (mapWidth <= 0 || mapHeight <= 0) return
    view.measure(MeasureSpec.makeMeasureSpec(mapWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(mapHeight, MeasureSpec.EXACTLY))
    view.layout(0, 0, mapWidth, mapHeight)
    updateCameraPadding()
    for (index in 0 until view.childCount) {
      val child = view.getChildAt(index)
      child.measure(MeasureSpec.makeMeasureSpec(mapWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(mapHeight, MeasureSpec.EXACTLY))
      child.layout(0, 0, mapWidth, mapHeight)
    }
  }

  private fun updateCameraPadding() {
    if (height > 0) map?.setPadding(0, (height * 0.32).toInt(), 0, (height * 0.08).toInt())
  }

  fun setRoute(value: List<Map<String, Double>>) {
    route = value.mapNotNull { point ->
      val lat = point["lat"]; val lng = point["lng"]
      if (lat == null || lng == null || !lat.isFinite() || !lng.isFinite() || abs(lat) > 90 || abs(lng) > 180) null else LatLng.from(lat, lng)
    }
    drawRoute()
  }

  private fun markerBitmap(color: Int): Bitmap {
    val size = (28 * resources.displayMetrics.density).toInt().coerceAtLeast(28)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = Color.WHITE; canvas.drawCircle(size / 2f, size / 2f, size * 0.46f, paint)
    paint.color = color; canvas.drawCircle(size / 2f, size / 2f, size * 0.32f, paint)
    return bitmap
  }

  private fun drawPosition() {
    val target = position ?: return
    val kakaoMap = map ?: return
    if (currentLabel == null) currentLabel = kakaoMap.labelManager?.layer?.addLabel(
      LabelOptions.from("walking-current", target).setTransform(TransformMethod.AbsoluteRotation_Decal).setStyles(directionBitmap()))
    else currentLabel?.moveTo(target)
  }

  private fun directionBitmap(): Bitmap {
    val size = (42 * resources.displayMetrics.density).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = Color.argb(45, 15, 35, 65)
    canvas.drawOval(size * 0.1f, size * 0.53f, size * 0.9f, size * 0.93f, paint)
    val arrow = Path().apply {
      moveTo(size * 0.5f, size * 0.1f)
      lineTo(size * 0.84f, size * 0.84f)
      lineTo(size * 0.5f, size * 0.68f)
      lineTo(size * 0.16f, size * 0.84f)
      close()
    }
    paint.color = Color.WHITE
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = size * 0.09f
    paint.strokeJoin = Paint.Join.ROUND
    canvas.drawPath(arrow, paint)
    paint.style = Paint.Style.FILL
    paint.color = Color.rgb(36, 119, 243)
    canvas.drawPath(arrow, paint)
    val facet = Path().apply {
      moveTo(size * 0.5f, size * 0.1f)
      lineTo(size * 0.84f, size * 0.84f)
      lineTo(size * 0.5f, size * 0.68f)
      close()
    }
    paint.color = Color.rgb(17, 77, 190)
    canvas.drawPath(facet, paint)
    return bitmap
  }

  private fun drawRoute() {
    val kakaoMap = map ?: return
    val layer = kakaoMap.routeLineManager?.layer ?: return
    layer.removeAll()
    destinationLabel?.remove(); destinationLabel = null
    if (route.size < 2) return
    val density = resources.displayMetrics.density
    val pattern = RouteLinePattern.from(routeArrowBitmap, 56f * density)
    val styles = RouteLineStyles.from(
      RouteLineStyle.from(7f * density, Color.rgb(36, 119, 243), 2f * density, Color.WHITE, pattern))
    layer.addRouteLine(RouteLineOptions.from(RouteLineSegment.from(route, styles)))
    destinationLabel = kakaoMap.labelManager?.layer?.addLabel(
      LabelOptions.from("walking-destination", route.last()).setStyles(markerBitmap(Color.rgb(227, 77, 89))))
  }

  private fun followCamera(resetZoom: Boolean) {
    val kakaoMap = map ?: return
    val target = position ?: return
    if (!following || !active || !resumed) return
    val zoom = if (resetZoom) 17 else kakaoMap.cameraPosition?.zoomLevel ?: 17
    // Rotate the map against the compass bearing so the direction ahead is screen-up.
    val displayed = if (lastRenderedHeading.isNaN()) heading ?: 0.0 else lastRenderedHeading
    val rotation = if (headingFollow) Math.toRadians(WalkingHeading.normalize(-displayed)) else 0.0
    currentLabel?.rotateTo(Math.toRadians(displayed).toFloat())
    val update = CameraUpdateFactory.newCameraPosition(
      CameraPosition.from(CameraPosition.Builder().setPosition(target).setZoomLevel(zoom)
        .setTiltAngle(Math.toRadians(45.0)).setRotationAngle(rotation)))
    kakaoMap.moveCamera(update)
    queueHeadingFrame()
  }

  fun recenter(request: Int) {
    if (request == lastRecenter) return
    lastRecenter = request; handler.removeCallbacks(returnToLocation)
    following = true; followCamera(true)
  }

  fun overview(request: Int) {
    if (request == lastOverview) return
    lastOverview = request
    if (route.size < 2) return
    following = false
    map?.moveCamera(CameraUpdateFactory.fitMapPoints((route + listOfNotNull(position)).toTypedArray(), 120, 18))
    scheduleReturn()
  }

  fun setHeadingFollow(value: Boolean) { headingFollow = value; followCamera(false) }
  fun setActive(value: Boolean) { active = value; if (value && isAttachedToWindow) resumeMap() else pauseMap() }
  private fun resumeMap() {
    if (resumed) return
    // Lifecycle observers can receive onResume before the child map is created.
    val view = mapView ?: return
    resumed = true; view.resume()
    rotationSensor?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    // Never leave a paused drag timer owning the camera after returning to the app.
    following = true; followCamera(true)
  }
  private fun pauseMap() {
    choreographer.removeFrameCallback(headingFrame); headingFramePosted = false; lastHeadingFrameNanos = 0L
    resumed = false; sensors.unregisterListener(this); handler.removeCallbacks(returnToLocation); mapView?.pause()
  }
  private fun scheduleReturn() { handler.removeCallbacks(returnToLocation); handler.postDelayed(returnToLocation, 5000) }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> { touchX = event.x; touchY = event.y; dragged = false; handler.removeCallbacks(returnToLocation) }
      MotionEvent.ACTION_POINTER_DOWN -> { dragged = true; following = false }
      MotionEvent.ACTION_MOVE -> if (hypot(event.x - touchX, event.y - touchY) > 8 * resources.displayMetrics.density) { dragged = true; following = false }
      MotionEvent.ACTION_UP -> { if (dragged || !following) scheduleReturn(); if (!dragged) onMapPress(mapOf("tapped" to true)) }
      MotionEvent.ACTION_CANCEL -> if (dragged || !following) scheduleReturn()
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!active || !resumed || !headingFollow) return
    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
    @Suppress("DEPRECATION")
    val rotation = (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
    val axes = when (rotation) {
      Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
      Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
      Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
      else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
    }
    SensorManager.remapCoordinateSystem(rotationMatrix, axes.first, axes.second, displayMatrix)
    val next = WalkingHeading.normalize(WalkingHeading.fromDisplayMatrix(displayMatrix) + magneticDeclination)
    heading = next
    queueHeadingFrame()
  }
  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  override fun onResume(owner: LifecycleOwner) { if (active) resumeMap() }
  override fun onPause(owner: LifecycleOwner) { pauseMap() }
  override fun onDestroy(owner: LifecycleOwner) { release() }
  override fun onDetachedFromWindow() { release(); super.onDetachedFromWindow() }
  fun release() {
    pauseMap(); owner?.lifecycle?.removeObserver(this); owner = null
    mapView?.finish(); mapView?.let { removeView(it) }; mapView = null; map = null
    currentLabel = null; destinationLabel = null
  }
}
