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

  private val onError by EventDispatcher<Map<String, String>>()
  private val onEnded by EventDispatcher<Map<String, String>>()
  private val onProgress by EventDispatcher<Map<String, Any>>()
  private val onArrived by EventDispatcher<Map<String, String>>()
  private val onRouteChanged by EventDispatcher<Map<String, Any>>()
  private var preparedTrip: KNTrip? = null
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
    requestId++
    stopGuidance()
    showLoading()
    val prepared = KakaoRouteEngine.get(destination["previewId"] as? String ?: "")
    if (prepared == null) { fail("미리보기 경로가 만료됐습니다. 경로를 다시 확인해 주세요."); return }
    val activity = appContext.currentActivity as? AppCompatActivity
    if (activity == null) { fail("현재 화면에서 카카오 길안내를 사용할 수 없습니다."); return }
    priority = prepared.priority
    preparedTrip = prepared.trip
    onRouteChanged(prepared.result + mapOf("destinationKey" to destination["destinationKey"].toString()))
    startGuidance(activity, prepared.trip)
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
    after: KNRoute, afterLocation: KNLocation, reason: KNGuideRouteChangeReason) {
    naviView?.guidanceRouteChanged(guidance)
    emitRoute(guidance, after)
  }
  override fun guidanceGuideEnded(guidance: KNGuidance) {
    if (released || stopping) return
    val arrived = guidance.trip?.remainDist()?.let { it in 0..30 } == true
    if (arrived) onArrived(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString()))
    else onEnded(mapOf("reason" to "ended", "destinationKey" to lastDestination?.get("destinationKey").toString()))
  }
  override fun guidanceDidUpdateRoutes(guidance: KNGuidance, routes: List<KNRoute>, multi: KNMultiRouteInfo?) {
    naviView?.guidanceDidUpdateRoutes(guidance, routes, multi)
    routes.firstOrNull()?.let { emitRoute(guidance, it) }
  }
  private fun emitRoute(guidance: KNGuidance, route: KNRoute) {
    if (released || stopping || guidance.trip !== preparedTrip) return
    val path = KakaoRouteEngine.routePath(route) ?: return
    onRouteChanged(mapOf("destinationKey" to lastDestination?.get("destinationKey").toString(),
      "path" to path, "trafficSections" to KakaoRouteEngine.trafficSections(route),
      "totalDistance" to route.totalDist, "totalDuration" to route.totalTime))
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
