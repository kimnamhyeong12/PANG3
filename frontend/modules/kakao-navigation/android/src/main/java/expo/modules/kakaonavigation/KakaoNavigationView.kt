package expo.modules.kakaonavigation

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.kakaomobility.knsdk.KNLanguageType
import com.kakaomobility.knsdk.KNRouteAvoidOption
import com.kakaomobility.knsdk.KNRoutePriority
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.gps.WGS84ToKATEC
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.guidance.knguidance.*
import com.kakaomobility.knsdk.guidance.knguidance.citsguide.KNGuide_Cits
import com.kakaomobility.knsdk.guidance.knguidance.common.KNLocation
import com.kakaomobility.knsdk.guidance.knguidance.locationguide.KNGuide_Location
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.KNGuide_Route
import com.kakaomobility.knsdk.guidance.knguidance.routeguide.objects.KNMultiRouteInfo
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.KNGuide_Safety
import com.kakaomobility.knsdk.guidance.knguidance.safetyguide.objects.KNSafety
import com.kakaomobility.knsdk.guidance.knguidance.voiceguide.KNGuide_Voice
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import com.kakaomobility.knsdk.map.uicustomsupport.renewal.theme.base.KNMapRouteTheme
import com.kakaomobility.knsdk.ui.view.KNNaviView
import com.kakaomobility.knsdk.ui.view.KNNaviView_GuideStateDelegate
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.roundToInt

/** Kakao's navigation UI lives in the existing React Native map screen. */
class KakaoNavigationView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
  KNGuidance_GuideStateDelegate,
  KNGuidance_LocationGuideDelegate,
  KNGuidance_RouteGuideDelegate,
  KNGuidance_SafetyGuideDelegate,
  KNGuidance_VoiceGuideDelegate,
  KNGuidance_CitsGuideDelegate,
  KNNaviView_GuideStateDelegate {

  companion object {
    private var sdkInstalled = false
  }

  private val onError by EventDispatcher<Map<String, String>>()
  private val onEnded by EventDispatcher<Map<String, String>>()
  private val onProgress by EventDispatcher<Map<String, Any>>()
  private val onArrived by EventDispatcher<Map<String, String>>()
  private var priority = KNRoutePriority.KNRoutePriority_Recommand
  private val avoidOptions = KNRouteAvoidOption.KNRouteAvoidOption_None.value
  private var naviView: KNNaviView? = null
  private var requestId = 0
  private var released = false
  private var stopping = false
  private var lastDestination: Map<String, Any?>? = null

  init {
    orientation = VERTICAL
    showLoading()
  }

  fun start(destination: Map<String, Any?>) {
    if (RouteGuidanceService.wasTaskRemoved(context)) {
      release()
      onEnded(mapOf("reason" to "task_removed"))
      return
    }
    if (destination == lastDestination) return
    lastDestination = destination
    released = false
    val id = ++requestId
    stopGuidance()
    showLoading()
    priority = when (destination["routePriority"] ?: "RECOMMEND") {
      "RECOMMEND" -> KNRoutePriority.KNRoutePriority_Recommand
      "TIME" -> KNRoutePriority.KNRoutePriority_Time
      "DISTANCE" -> KNRoutePriority.KNRoutePriority_Distance
      else -> { fail("지원하지 않는 경로 기준입니다."); return }
    }

    val activity = appContext.currentActivity as? AppCompatActivity
    if (activity == null) { fail("현재 화면에서 카카오 길안내를 사용할 수 없습니다."); return }
    val latitude = (destination["lat"] as? Number)?.toDouble()
    val longitude = (destination["lng"] as? Number)?.toDouble()
    val startLatitude = (destination["startLat"] as? Number)?.toDouble()
    val startLongitude = (destination["startLng"] as? Number)?.toDouble()
    if (latitude == null || longitude == null || latitude !in 33.0..39.0 || longitude !in 124.0..132.0 ||
      startLatitude == null || startLongitude == null || startLatitude !in 33.0..39.0 || startLongitude !in 124.0..132.0) {
      fail("현재 위치나 목적지 좌표가 올바르지 않습니다.")
      return
    }
    val appKey = activity.packageManager.getApplicationInfo(activity.packageName, 128)
      .metaData?.getString("com.pang3.KAKAO_NATIVE_APP_KEY").orEmpty()
    if (appKey.isBlank()) { fail("카카오 네이티브 앱 키가 빌드에 등록되지 않았습니다."); return }

    synchronized(KNSDK) {
      if (!sdkInstalled) {
        KNSDK.install(activity.application, "${activity.filesDir.absolutePath}/kakao-navigation")
        sdkInstalled = true
      }
    }
    KNSDK.initializeWithAppKey(appKey,
      activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "1.0",
      null, null, KNLanguageType.KNLanguageType_KOREAN) { error ->
      activity.runOnUiThread {
        if (!isCurrent(id)) return@runOnUiThread
        if (error != null) { fail("카카오 SDK 초기화 실패: ${error.msg}"); return@runOnUiThread }
        val start = poi("현재 위치", startLongitude, startLatitude, "")
        val goal = poi(destination["name"] as? String ?: "목적지", longitude, latitude,
          destination["address"] as? String ?: "")
        KNSDK.makeTripWithStart(start, goal, null) { tripError, trip ->
          activity.runOnUiThread {
            if (!isCurrent(id)) return@runOnUiThread
            if (tripError != null || trip == null) {
              fail("경로 생성 실패: ${tripError?.msg ?: "알 수 없는 오류"}")
              return@runOnUiThread
            }
            trip.routeWithPriority(priority, avoidOptions) { routeError, _ ->
              activity.runOnUiThread {
                if (!isCurrent(id)) return@runOnUiThread
                if (routeError != null) { fail("경로 탐색 실패: ${routeError.msg}"); return@runOnUiThread }
                startGuidance(activity, trip)
              }
            }
          }
        }
      }
    }
  }

  private fun isCurrent(id: Int) = !released && id == requestId

  private fun poi(name: String, longitude: Double, latitude: Double, address: String): KNPOI {
    val point = WGS84ToKATEC(longitude, latitude)
    return KNPOI(name, point.x.roundToInt(), point.y.roundToInt(), address)
  }

  private fun startGuidance(activity: AppCompatActivity, trip: KNTrip) {
    val guidance = KNSDK.sharedGuidance() ?: run { fail("길안내를 시작할 수 없습니다."); return }
    guidance.guideStateDelegate = this
    guidance.locationGuideDelegate = this
    guidance.routeGuideDelegate = this
    guidance.safetyGuideDelegate = this
    guidance.voiceGuideDelegate = this
    guidance.citsGuideDelegate = this
    naviView = KNNaviView(activity).also { view ->
      removeAllViews()
      addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      view.guideStateDelegate = this
      // The UI SDK switches themes between driving/overview and day/night.
      // Keep traffic colors in all four themes so starting guidance cannot hide them.
      view.mapComponent.setRouteTheme(
        trafficTheme(false), trafficTheme(true), trafficTheme(false), trafficTheme(true)
      )
      view.initWithGuidance(guidance, trip, priority, avoidOptions)
    }
    guidance.startWithTrip(trip, priority, avoidOptions)
  }

  private fun trafficTheme(night: Boolean): KNMapRouteTheme {
    return (if (night) KNMapRouteTheme.trafficNight() else KNMapRouteTheme.trafficDay()).apply {
      lineColors.apply {
        normal = Color.parseColor("#16A34A")
        trafficJamModerate = Color.parseColor("#FACC15")
        trafficJamHeavy = Color.parseColor("#F97316")
        trafficJamVeryHeavy = Color.parseColor("#DC2626")
        unknown = Color.parseColor("#9CA3AF")
        blocked = Color.parseColor("#64748B")
      }
    }
  }

  private fun showLoading() {
    removeAllViews()
    addView(TextView(context).apply {
      text = "카카오 길안내를 준비하고 있습니다…"
      gravity = Gravity.CENTER
      textSize = 17f
    }, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  private fun fail(message: String) {
    onError(mapOf("message" to message))
  }

  fun release() {
    released = true
    requestId++
    stopGuidance()
  }

  private fun stopGuidance() {
    stopping = true
    KNSDK.sharedGuidance()?.apply {
      stop()
      guideStateDelegate = null
      locationGuideDelegate = null
      routeGuideDelegate = null
      safetyGuideDelegate = null
      voiceGuideDelegate = null
      citsGuideDelegate = null
    }
    naviView?.guideStateDelegate = null
    naviView = null
    stopping = false
  }

  override fun naviViewGuideState(state: KNGuideState) = Unit
  override fun naviViewGuideEnded() {
    if (!released && !stopping) onEnded(mapOf("reason" to "ended", "destinationKey" to lastDestination?.get("destinationKey").toString()))
  }
  override fun guidanceGuideStarted(guidance: KNGuidance) { naviView?.guidanceGuideStarted(guidance) }
  override fun guidanceCheckingRouteChange(guidance: KNGuidance) { naviView?.guidanceCheckingRouteChange(guidance) }
  override fun guidanceRouteUnchanged(guidance: KNGuidance) { naviView?.guidanceRouteUnchanged(guidance) }
  override fun guidanceRouteUnchangedWithError(guidance: KNGuidance, error: KNError) { naviView?.guidanceRouteUnchangedWithError(guidance, error) }
  override fun guidanceOutOfRoute(guidance: KNGuidance) { naviView?.guidanceOutOfRoute(guidance) }
  override fun guidanceRouteChanged(guidance: KNGuidance, before: KNRoute, beforeLocation: KNLocation,
    after: KNRoute, afterLocation: KNLocation, reason: KNGuideRouteChangeReason) { naviView?.guidanceRouteChanged(guidance) }
  override fun guidanceGuideEnded(guidance: KNGuidance) {
    if (released || stopping) return
    val arrived = guidance.trip?.remainDist()?.let { it in 0..30 } == true
    if (arrived) onArrived(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString()))
    else onEnded(mapOf("reason" to "ended", "destinationKey" to lastDestination?.get("destinationKey").toString()))
  }
  override fun guidanceDidUpdateRoutes(guidance: KNGuidance, routes: List<KNRoute>, multi: KNMultiRouteInfo?) {
    naviView?.guidanceDidUpdateRoutes(guidance, routes, multi)
  }
  override fun guidanceDidUpdateIndoorRoute(guidance: KNGuidance, route: KNRoute?) { naviView?.guidanceDidUpdateIndoorRoute(guidance, route) }
  override fun guidanceDidUpdateLocation(guidance: KNGuidance, location: KNGuide_Location) {
    naviView?.guidanceDidUpdateLocation(guidance, location)
    if (released || stopping || location.location == null) return
    val trip = guidance.trip ?: return
    val distance = trip.remainDist()
    val duration = trip.remainTime()
    if (distance < 0 || duration < 0) return
    onProgress(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "distance" to distance, "duration" to duration))
  }
  override fun guidanceDidUpdateRouteGuide(guidance: KNGuidance, route: KNGuide_Route) { naviView?.guidanceDidUpdateRouteGuide(guidance, route) }
  override fun guidanceDidUpdateSafetyGuide(guidance: KNGuidance, safety: KNGuide_Safety?) { naviView?.guidanceDidUpdateSafetyGuide(guidance, safety) }
  override fun guidanceDidUpdateAroundSafeties(guidance: KNGuidance, safeties: List<KNSafety>?) { naviView?.guidanceDidUpdateAroundSafeties(guidance, safeties) }
  override fun shouldPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice, data: MutableList<ByteArray>): Boolean = true
  override fun willPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice) { naviView?.willPlayVoiceGuide(guidance, voice) }
  override fun didFinishPlayVoiceGuide(guidance: KNGuidance, voice: KNGuide_Voice) { naviView?.didFinishPlayVoiceGuide(guidance, voice) }
  override fun didUpdateCitsGuide(guidance: KNGuidance, cits: KNGuide_Cits) { naviView?.didUpdateCitsGuide(guidance, cits) }
}
