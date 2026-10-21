package expo.modules.kakaonavigation

import android.content.Context
import android.graphics.Color
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Lifecycle
import com.kakaomobility.knsdk.*
import com.kakaomobility.knsdk.common.gps.KNGPSData
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.util.FloatPoint
import com.kakaomobility.knsdk.guidance.knguidance.*
import com.kakaomobility.knsdk.guidance.knguidance.citsguide.KNGuide_Cits
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.guidance.knguidance.locationguide.KNGuide_Location
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.KNGuide_Route
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNDirection
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNMultiRouteInfo
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.KNGuide_Safety
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.objects.*
import com.kakaomobility.knsdk.guidance.knguidance.voiceguide.KNGuide_Voice
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import com.kakaomobility.knsdk.map.knmapview.KNMapView
import com.kakaomobility.knsdk.map.knmapview.idl.KNMapRouteProperties
import com.kakaomobility.knsdk.map.knmapview.idl.KNMarkerEventListener
import com.kakaomobility.knsdk.map.knmaprenderer.objects.KNMapCameraUpdate
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.KNMapMarker
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.theme.base.KNMapTheme
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.theme.base.KNMapRouteTheme
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.hypot

/** A bare SDK map; guidance data feeds PANG3's own controls and cards. */
class KakaoNavigationView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
  KNGuidance_GuideStateDelegate, KNGuidance_LocationGuideDelegate,
  KNGuidance_RouteGuideDelegate, KNGuidance_SafetyGuideDelegate,
  KNGuidance_VoiceGuideDelegate, KNGuidance_CitsGuideDelegate {
  override val shouldUseAndroidLayout = true
  private val onError by EventDispatcher<Map<String, String>>()
  private val onMapPress by EventDispatcher<Map<String, Boolean>>()
  private val onEnded by EventDispatcher<Map<String, String>>()
  private val onProgress by EventDispatcher<Map<String, Any>>()
  private val onArrived by EventDispatcher<Map<String, String>>()
  private val onRouteChanged by EventDispatcher<Map<String, Any>>()
  private val onSafetyUpdate by EventDispatcher<Map<String, Any>>()
  private val onManeuverUpdate by EventDispatcher<Map<String, Any>>()
  private val onNearbyError by EventDispatcher<Map<String, String>>()
  private var currentDirection: KNDirection? = null
  private var nextDirection: KNDirection? = null
  private var safetiesOnGuide: List<KNSafety> = emptyList()
  private var routeSafeties: List<KNSafety> = emptyList()
  private var aroundSafeties: List<KNSafety> = emptyList()
  private var currentGuideLocation: KNLocation? = null
  private var preparedTrip: KNTrip? = null
  private var priority = KNRoutePriority.KNRoutePriority_Recommand
  private val avoidOptions = KNRouteAvoidOption.KNRouteAvoidOption_None.value
  private var mapView: KNMapView? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var requestId = 0
  private var mapActive = true
  private var rendererResumed = false
  private var mapBinding = false
  private var needsSurfaceRestore = false
  private var released = false
  private var stopping = false
  private var map3D = true
  private var following = true
  private var lastGps: KNGPSData? = null
  private var initialPosition: FloatPoint? = null
  private var cameraInitialized = false
  private var lastDestination: Map<String, Any?>? = null
  private var nearbyCategory: String? = null
  private var nearbyRequestId = 0
  private var nearbyOrigin: FloatPoint? = null
  private var nearbyLoading = false
  private var nearbyRetryAfter = 0L
  private val nearbyMarkers = mutableListOf<KNMapMarker>()
  private val safetyMarkers = mutableMapOf<String, KNMapMarker>()
  private val signs = NavigationMapSigns(context)
  private val lifecycle = object : DefaultLifecycleObserver {
    override fun onResume(owner: LifecycleOwner) { syncMapRendering() }
    override fun onPause(owner: LifecycleOwner) { pauseMapRendering() }
  }

  init { orientation = VERTICAL; showLoading() }

  // App tabs do not pause the Activity. Manage the GL surface separately from guidance.
  fun setMapActive(active: Boolean) {
    if (mapActive == active) return
    mapActive = active
    val map = mapView ?: return
    if (!active) {
      needsSurfaceRestore = true
      pauseMapRendering()
    }
    map.visibility = if (active) View.VISIBLE else View.INVISIBLE
    if (active) map.post {
      if (mapView === map && !released && mapActive) {
        if (!restoreMapIfNeeded()) {
          syncMapRendering()
          followCamera(true)
        }
      }
    }
  }

  override fun onDetachedFromWindow() {
    if (mapView != null && !released) needsSurfaceRestore = true
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    post { if (!released && mapActive) restoreMapIfNeeded() }
  }

  private fun restoreMapIfNeeded(): Boolean {
    val map = mapView ?: return false
    if (mapBinding || (!needsSurfaceRestore && map.isInitialize())) return false
    val guidance = KNSDK.sharedGuidance() ?: return false
    if (!owns(guidance)) return false
    val activity = appContext.currentActivity as? AppCompatActivity ?: return false
    val destination = lastDestination ?: return false
    val route = guidance.routesOnGuide?.firstOrNull() ?: return false
    needsSurfaceRestore = false
    bindGuidanceMap(activity, requestId, destination, route, false)
    return true
  }

  private fun syncMapRendering() {
    val map = mapView ?: return
    if (!map.isInitialize()) return
    val shouldResume = mapActive && lifecycleOwner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true
    if (shouldResume && !rendererResumed) {
      map.onResume()
      rendererResumed = true
    } else if (!shouldResume) pauseMapRendering()
  }

  private fun pauseMapRendering() {
    if (!rendererResumed) return
    mapView?.onPause()
    rendererResumed = false
  }

  private fun owns(guidance: KNGuidance) = !released && !stopping && preparedTrip != null && guidance.trip === preparedTrip

  fun start(destination: Map<String, Any?>) {
    if (RouteGuidanceService.wasTaskRemoved(context)) {
      release(); onEnded(mapOf("reason" to "task_removed")); return
    }
    if (!released && destination == lastDestination) return
    lastDestination = destination
    released = false
    val generation = ++requestId
    stopGuidance()
    showLoading()
    val prepared = KakaoRouteEngine.get(destination["previewId"] as? String ?: "")
      ?: run { fail("미리보기 경로가 만료됐습니다. 경로를 다시 확인해 주세요."); return }
    val activity = appContext.currentActivity as? AppCompatActivity
      ?: run { fail("현재 화면에서 카카오 길안내를 사용할 수 없습니다."); return }
    priority = prepared.priority
    preparedTrip = prepared.trip
    initialPosition = prepared.route.routePolylineWGS84()?.firstOrNull()?.let { point ->
      val lng = point["x"]?.toDouble(); val lat = point["y"]?.toDouble()
      if (lng == null || lat == null) null else KNSDK.convertWGS84ToKATEC(lng, lat).let { FloatPoint(it.x.toFloat(), it.y.toFloat()) }
    }
    bindGuidanceMap(activity, generation, destination, prepared.route, true)
  }

  private fun bindGuidanceMap(activity: AppCompatActivity, generation: Int,
    destination: Map<String, Any?>, route: KNRoute, startGuidance: Boolean) {
    mapBinding = true
    needsSurfaceRestore = false
    pauseMapRendering()
    lifecycleOwner?.lifecycle?.removeObserver(lifecycle)
    rendererResumed = false
    nearbyRequestId++; nearbyLoading = false; nearbyOrigin = null
    clearNearbyMarkers()
    safetyMarkers.clear()
    val map = KNMapView(activity)
    mapView = map
    map.visibility = if (mapActive) View.VISIBLE else View.INVISIBLE
    lifecycleOwner = activity
    removeAllViews()
    addView(map, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    // React Native cards sit above this surface; the SDK creates no navigation UI.
    map.setZOrderMediaOverlay(true)
    var touchX = 0f; var touchY = 0f; var dragged = false
    map.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> { touchX = event.x; touchY = event.y; dragged = false }
        MotionEvent.ACTION_POINTER_DOWN -> { following = false; dragged = true }
        MotionEvent.ACTION_MOVE -> if (hypot(event.x - touchX, event.y - touchY) > 8 * resources.displayMetrics.density) { following = false; dragged = true }
        MotionEvent.ACTION_UP -> { if (!following) refreshNearbyIfNeeded(true); if (!dragged) onMapPress(mapOf("tapped" to true)) }
      }
      false
    }
    KNSDK.bindingMapView(map, KNMapTheme.driveDay()) { error ->
      post {
        if (released || generation != requestId || mapView !== map) return@post
        mapBinding = false
        if (error != null) { fail("카카오 지도를 초기화하지 못했습니다."); return@post }
        // Register only after binding has created the GLSurfaceView render thread.
        // addObserver immediately dispatches onResume for an already resumed Activity.
        activity.lifecycle.addObserver(lifecycle)
        map.isVisibleBuilding = true
        map.isVisibleTraffic = true
        KNSDK.isShowBuilding = true
        map.knMarkerEventListener = object : KNMarkerEventListener {
          override fun onSingleTapped(mapView: KNMapView?, marker: KNMapMarker) {
            mapView?.getMarkers()?.forEach { if (it !== marker) it.isVisibleCalloutBubble = false }
            marker.isVisibleCalloutBubble = !marker.isVisibleCalloutBubble
          }
          override fun onDoubleTapped(mapView: KNMapView?, marker: KNMapMarker) = Unit
          override fun onLongPressed(mapView: KNMapView?, marker: KNMapMarker) = Unit
          override fun onCalloutBubbleSelected(mapView: KNMapView?, marker: KNMapMarker) = Unit
          override fun onMarkerAnimateEnded(mapView: KNMapView?, marker: KNMapMarker) = Unit
        }
        map.routeProperties = KNMapRouteProperties().apply {
          isVisible = true; isVisibleRGArrow = true; theme = trafficTheme()
        }
        map.userLocation?.apply { isVisibleGuideLine = false; guideLineColor = Color.TRANSPARENT }
        updateRoute(route)
        following = true
        followCamera(true)
        val guidance = KNSDK.sharedGuidance()
          ?: run { fail("길안내를 시작할 수 없습니다."); return@post }
        if (!startGuidance) {
          lastGps?.let { updateVehicle(map, it) }
          followCamera(true)
          refreshNearbyIfNeeded(true)
          Log.i("PANG3MapSurface", "Restored map without restarting guidance")
          return@post
        }
        guidance.guideStateDelegate = this
        guidance.locationGuideDelegate = this
        guidance.routeGuideDelegate = this
        guidance.safetyGuideDelegate = this
        guidance.voiceGuideDelegate = this
        guidance.citsGuideDelegate = this
        guidance.excludedSafeties = guidance.excludedSafeties.orEmpty() + KNSafetyCode.KNSafetyCode_Hump.value
        KakaoRouteEngine.get(destination["previewId"] as? String ?: "")?.let {
          onRouteChanged(it.result + mapOf("destinationKey" to destination["destinationKey"].toString()))
        }
        preparedTrip?.let { guidance.startWithTrip(it, priority, avoidOptions) }
        refreshNearbyIfNeeded(true)
      }
    }
  }

  private fun updateRoute(route: KNRoute?) {
    if (route == null) return
    mapView?.setRoute(route)
    routeSafeties = route.safetyList().orEmpty()
    updateSafetyMarkers()
  }

  fun setMap3D(enabled: Boolean) {
    if (map3D == enabled) return
    map3D = enabled
    KNSDK.setBuildingFlat(!enabled)
    val map = mapView ?: return
    if (following) followCamera(true)
    else map.moveCamera(KNMapCameraUpdate().tiltTo(if (enabled) 50f else 0f), false, false)
  }

  private var lastRecenterRequest = 0
  fun recenter(request: Int) {
    if (request <= lastRecenterRequest) return
    lastRecenterRequest = request
    following = true
    followCamera(true)
  }

  private fun updateVehicle(map: KNMapView, gps: KNGPSData) {
    if (!gps.valid) return
    map.gpsOrigin = gps
    map.gpsMatched = gps
    map.userLocation?.apply {
      coordinate = FloatPoint(gps.pos.x.toFloat(), gps.pos.y.toFloat())
      angle = gps.angle.toFloat()
      isVisible = true
      isVisibleGuideLine = false
    }
  }

  private fun followCamera(immediate: Boolean) {
    if (!following || !mapActive) return
    val map = mapView ?: return
    if (!map.isInitialize()) return
    val gps = lastGps?.takeIf { it.valid }
    val pos = gps?.pos?.let { FloatPoint(it.x.toFloat(), it.y.toFloat()) } ?: initialPosition ?: return
    val zoom = GuidanceCameraPolicy.zoom(gps?.speed ?: 0)
    val update = KNMapCameraUpdate().targetTo(pos).anchorTo(FloatPoint(0.5f, 0.66f))
      .bearingTo(gps?.angle?.toFloat() ?: 0f).tiltTo(if (map3D) 50f else 0f).zoomTo(zoom)
    KNSDK.setBuildingFlat(!map3D)
    if (immediate || !cameraInitialized) map.moveCamera(update, true, false)
    else map.animateCamera(update, 700L, true, false)
    cameraInitialized = true
  }

  fun setNearbyCategory(category: String?) {
    val next = category?.takeIf { it == "gas" || it == "parking" }
    if (next == nearbyCategory) return
    nearbyCategory = next
    nearbyRequestId++
    nearbyLoading = false
    nearbyRetryAfter = 0L
    nearbyOrigin = null
    clearNearbyMarkers()
    refreshNearbyIfNeeded(true)
  }

  private fun clearNearbyMarkers() {
    val map = mapView
    nearbyMarkers.forEach { map?.removeMarker(it) }
    nearbyMarkers.clear()
  }

  private fun refreshNearbyIfNeeded(force: Boolean = false) {
    val category = nearbyCategory ?: return
    val map = mapView ?: return
    if (!map.isInitialize() || nearbyLoading || SystemClock.elapsedRealtime() < nearbyRetryAfter) return
    val pos = if (following) lastGps?.pos?.let { FloatPoint(it.x.toFloat(), it.y.toFloat()) } ?: initialPosition else map.coordinate
    if (pos == null) return
    if (!force && nearbyOrigin?.let { hypot(pos.x - it.x, pos.y - it.y) < 500f } == true) return
    nearbyOrigin = FloatPoint(pos.x, pos.y)
    nearbyLoading = true
    val token = ++nearbyRequestId
    val generation = requestId
    NearbyPlaceQuery.search(category, pos, map.getMapDrawMbr()) { error, places ->
      post {
        if (released || generation != requestId || token != nearbyRequestId || mapView !== map) return@post
        nearbyLoading = false
        if (error != null) {
          Log.w("PANG3Nearby", "Nearby category=$category failed with SDK code=${error.code}")
          nearbyOrigin = null
          nearbyRetryAfter = SystemClock.elapsedRealtime() + 30_000
          onNearbyError(mapOf("message" to "주변 장소를 불러오지 못했습니다. 다시 선택해 주세요.")); return@post
        }
        clearNearbyMarkers()
        places.forEach { poi ->
          val marker = KNMapMarker(FloatPoint(poi.x.toFloat(), poi.y.toFloat())).apply {
            icon = signs.place(category)
            callOutBubbleUpdate = KNMapMarker.KNMapCalloutBubbleUpdate.Builder()
              .setTitle(poi.name).setSubTitle(poi.rnaddr.orEmpty().ifBlank { poi.addr.orEmpty() }).build()
            isVisibleCalloutBubble = false
          }
          map.addMarker(marker)
          nearbyMarkers.add(marker)
        }
      }
    }
  }

  private fun updateSafetyMarkers() {
    val map = mapView ?: return
    if (!map.isInitialize()) return
    val origin = lastGps?.pos?.let { FloatPoint(it.x.toFloat(), it.y.toFloat()) } ?: initialPosition ?: return
    val entries = (routeSafeties + aroundSafeties + safetiesOnGuide).distinctBy { it.safetyId }
      .filter { it.code != KNSafetyCode.KNSafetyCode_Hump && !it.passed && hypot(it.location.pos.x - origin.x, it.location.pos.y - origin.y) < 5000.0 }
      .sortedBy { hypot(it.location.pos.x - origin.x, it.location.pos.y - origin.y) }.take(160)
    val keys = entries.map { it.safetyId.toString() }.toSet()
    safetyMarkers.keys.filter { it !in keys }.toList().forEach { key -> safetyMarkers.remove(key)?.let { map.removeMarker(it) } }
    entries.forEach { safety ->
      val key = safety.safetyId.toString()
      if (key !in safetyMarkers) {
        val marker = KNMapMarker(FloatPoint(safety.location.pos.x.toFloat(), safety.location.pos.y.toFloat())).apply {
          icon = signs.safety(safety.code.name, (safety as? KNSafety_Camera)?.speedLimit ?: 0)
          callOutBubbleUpdate = KNMapMarker.KNMapCalloutBubbleUpdate.Builder().setTitle(safetyLabel(safety.code.name.removePrefix("KNSafetyCode_"))).build()
          isVisibleCalloutBubble = false
        }
        map.addMarker(marker); safetyMarkers[key] = marker
      }
    }
  }

  private fun trafficTheme() = KNMapRouteTheme.trafficDay().apply {
    lineColors.apply {
      normal = Color.parseColor("#16A34A"); trafficJamModerate = Color.parseColor("#FACC15")
      trafficJamHeavy = Color.parseColor("#F97316"); trafficJamVeryHeavy = Color.parseColor("#DC2626")
      unknown = Color.parseColor("#9CA3AF"); blocked = Color.parseColor("#64748B")
    }
  }

  private fun showLoading() {
    removeAllViews()
    addView(TextView(context).apply { text = "카카오 길안내를 준비하고 있습니다…"; gravity = Gravity.CENTER; textSize = 17f },
      ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }
  private fun fail(message: String) { onError(mapOf("message" to message)) }
  fun release() {
    val windowRoot = appContext.currentActivity?.window?.decorView
    released = true; requestId++; stopGuidance()
    // Removing a GL SurfaceView can leave the underlying retained WebView's
    // transparent region/damage stale. Rebuild it after the removal is committed.
    windowRoot?.post {
      windowRoot.parent?.requestTransparentRegion(windowRoot)
      windowRoot.requestLayout()
      windowRoot.invalidate()
      Log.i("PANG3MapSurface", "Released guidance surface; refreshed window drawing region")
    }
  }
  private fun stopGuidance() {
    stopping = true
    mapBinding = false
    val guidance = KNSDK.sharedGuidance()
    // Never clear delegates belonging to a newer view/session.
    if (guidance?.guideStateDelegate === this) {
      guidance.stop()
      guidance.guideStateDelegate = null; guidance.locationGuideDelegate = null
      guidance.routeGuideDelegate = null; guidance.safetyGuideDelegate = null
      guidance.voiceGuideDelegate = null; guidance.citsGuideDelegate = null
    }
    clearSafety()
    pauseMapRendering()
    lifecycleOwner?.lifecycle?.removeObserver(lifecycle)
    lifecycleOwner = null
    mapView?.setOnTouchListener(null)
    nearbyRequestId++; nearbyLoading = false; nearbyOrigin = null
    clearNearbyMarkers()
    safetyMarkers.clear(); routeSafeties = emptyList(); aroundSafeties = emptyList()
    mapView = null
    removeAllViews()
    cameraInitialized = false; lastGps = null; initialPosition = null
    stopping = false
  }

  override fun guidanceGuideStarted(guidance: KNGuidance) {
    if (!owns(guidance)) return
    updateRoute(guidance.routesOnGuide?.firstOrNull())
  }
  override fun guidanceCheckingRouteChange(guidance: KNGuidance) = Unit
  override fun guidanceRouteUnchanged(guidance: KNGuidance) = Unit
  override fun guidanceRouteUnchangedWithError(guidance: KNGuidance, error: KNError) = Unit
  override fun guidanceOutOfRoute(guidance: KNGuidance) = Unit
  override fun guidanceRouteChanged(guidance: KNGuidance, before: KNRoute, beforeLocation: KNLocation,
    after: KNRoute, afterLocation: KNLocation, reason: KNGuideRouteChangeReason) {
    if (!owns(guidance)) return
    clearSafety()
    updateRoute(after)
    emitRoute(guidance, after)
  }
  override fun guidanceGuideEnded(guidance: KNGuidance) {
    if (!owns(guidance)) return
    val arrived = guidance.trip?.remainDist()?.let { it in 0..30 } == true
    if (arrived) onArrived(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString()))
    else onEnded(mapOf("reason" to "ended", "destinationKey" to lastDestination?.get("destinationKey").toString()))
  }
  override fun guidanceDidUpdateRoutes(guidance: KNGuidance, routes: List<KNRoute>, multi: KNMultiRouteInfo?) {
    if (!owns(guidance)) return
    clearSafety()
    updateRoute(routes.firstOrNull())
    routes.firstOrNull()?.let { emitRoute(guidance, it) }
  }
  private fun emitRoute(guidance: KNGuidance, route: KNRoute) {
    if (!owns(guidance)) return
    val path = KakaoRouteEngine.routePath(route) ?: return
    onRouteChanged(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "path" to path, "trafficSections" to KakaoRouteEngine.trafficSections(route),
      "totalDistance" to route.totalDist, "totalDuration" to route.totalTime))
  }
  override fun guidanceDidUpdateIndoorRoute(guidance: KNGuidance, route: KNRoute?) = Unit
  override fun guidanceDidUpdateLocation(guidance: KNGuidance, location: KNGuide_Location) {
    if (!owns(guidance)) return
    val gps = location.gpsMatched
    val map = mapView ?: return
    currentGuideLocation = location.location
    if (gps.valid) lastGps = gps
    updateVehicle(map, gps)
    location.location?.let { map.cullPassedRoute(it, false) }
    followCamera(false)
    updateSafetyMarkers()
    refreshNearbyIfNeeded()
    emitSafety()
    emitManeuver()
    val trip = guidance.trip ?: return
    val distance = trip.remainDist()
    val duration = trip.remainTime()
    if (distance < 0 || duration < 0) return
    onProgress(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "distance" to distance, "duration" to duration, "speed" to gps.speed.coerceAtLeast(0), "speedValid" to (gps.valid && gps.speedTrust)))
  }
  override fun guidanceDidUpdateRouteGuide(guidance: KNGuidance, route: KNGuide_Route) {
    if (!owns(guidance)) return
    currentDirection = route.curDirection
    nextDirection = route.nextDirection
    emitManeuver()
  }
  private fun emitManeuver() {
    val origin = currentGuideLocation
    val current = currentDirection
    val primary = if (current?.rgCode?.name == "KNRGCode_Start" && nextDirection != null) nextDirection else current
    fun payload(direction: KNDirection?, from: KNLocation?): Map<String, Any>? {
      if (direction == null || from?.route == null || direction.location.route != from.route) return null
      val distance = from.distToLocation(direction.location)
      if (distance < 0) return null
      return mapOf("code" to direction.rgCode.name.removePrefix("KNRGCode_"), "distance" to distance,
        "road" to (direction.directionNames?.firstOrNull { it.isNotBlank() } ?: direction.nodeName.orEmpty()))
    }
    val first = payload(primary, origin)
    val following = if (primary === nextDirection) null else payload(nextDirection, primary?.location)
    onManeuverUpdate(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "visible" to (first != null)) + (first?.let { mapOf("primary" to it) } ?: emptyMap()) +
      (following?.let { mapOf("secondary" to it) } ?: emptyMap()))
  }
  override fun guidanceDidUpdateSafetyGuide(guidance: KNGuidance, safety: KNGuide_Safety?) {
    if (!owns(guidance)) return
    // Use only on-route guidance, not all nearby cameras on other roads.
    safetiesOnGuide = safety?.safetiesOnGuide?.toList() ?: emptyList()
    updateSafetyMarkers()
    emitSafety()
  }
  private fun clearSafety() {
    safetiesOnGuide = emptyList()
    currentGuideLocation = null
    currentDirection = null
    nextDirection = null
    onManeuverUpdate(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(), "visible" to false))
    onSafetyUpdate(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(), "visible" to false))
  }
  private fun emitSafety() {
    val location = currentGuideLocation
    val entries = if (location?.route == null) emptyList() else safetiesOnGuide.mapNotNull { safety ->
      if (safety.code == KNSafetyCode.KNSafetyCode_Hump) return@mapNotNull null
      if (safety.passed || safety.location.route != location.route) return@mapNotNull null
      val distance = location.distToLocation(safety.location)
      if (distance !in 0..1500) return@mapNotNull null
      val code = safety.code.name.removePrefix("KNSafetyCode_")
      val kind: String
      val label: String
      when {
        safety is KNSafety_Section || code.contains("SpeedViolationSection") -> { kind = "section"; label = "구간 단속" }
        safety is KNSafety_Camera && code.contains("SignalAndSpeed") -> { kind = "camera"; label = "신호·과속 단속" }
        safety is KNSafety_Camera && code.contains("MovableSpeed") -> { kind = "camera"; label = "이동식 단속" }
        safety is KNSafety_Camera && code.contains("Speed") -> { kind = "camera"; label = "과속 단속" }
        safety is KNSafety_Camera && code == "SignalViolationCamera" -> { kind = "camera"; label = "신호 단속" }
        code == "ChildrenProtectionZone" -> { kind = "school"; label = "어린이 보호구역" }
        code == "SharpTurnSection" -> { kind = "caution"; label = "급커브" }
        else -> { kind = "caution"; label = safetyLabel(code) }
      }
      mapOf<String, Any>("id" to safety.safetyId, "kind" to kind, "label" to label,
        "distance" to distance, "speedLimit" to ((safety as? KNSafety_Camera)?.speedLimit ?: 0),
        "overSpeed" to ((safety as? KNSafety_Camera)?.onViolation ?: false))
    }
    val notice = entries.sortedWith(compareBy<Map<String, Any>>(
      { if (it["kind"] == "camera" || it["kind"] == "section") 0 else 1 },
      { it["distance"] as Int })).firstOrNull()
    onSafetyUpdate(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "visible" to (notice != null)) + (notice ?: emptyMap()))
  }
  override fun guidanceDidUpdateAroundSafeties(guidance: KNGuidance, safeties: List<KNSafety>?) {
    if (!owns(guidance)) return
    aroundSafeties = safeties.orEmpty()
    updateSafetyMarkers()
  }
  override fun shouldPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice, data: MutableList<ByteArray>): Boolean = true
  override fun willPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice) = Unit
  override fun didFinishPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice) = Unit
  override fun didUpdateCitsGuide(guidance: KNGuidance, cits: KNGuide_Cits) = Unit
}
