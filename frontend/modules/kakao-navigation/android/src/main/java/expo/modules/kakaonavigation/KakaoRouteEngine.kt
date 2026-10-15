package expo.modules.kakaonavigation

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.kakaomobility.knsdk.*
import com.kakaomobility.knsdk.common.gps.WGS84ToKATEC
import com.kakaomobility.knsdk.common.objects.KNPOI
import com.kakaomobility.knsdk.common.objects.KNPOIRPFlagType
import com.kakaomobility.knsdk.trip.kntrip.KNTrip
import com.kakaomobility.knsdk.trip.kntrip.knroute.KNRoute
import java.util.UUID
import kotlin.math.roundToInt

/** Prepared SDK trips are kept in memory: guidance uses the trip shown in preview. */
object KakaoRouteEngine {
  data class Prepared(val trip: KNTrip, val priority: KNRoutePriority, val route: KNRoute,
    val createdAt: Long, val result: Map<String, Any>)
  private val main = Handler(Looper.getMainLooper())
  private val previews = LinkedHashMap<String, Prepared>()
  private const val TTL = 5 * 60 * 1000L
  private var installed = false
  private var initialized = false
  private var initializing = false
  private val waiters = mutableListOf<Pair<() -> Unit, (String) -> Unit>>()

  @Synchronized fun get(id: String): Prepared? {
    previews.entries.removeAll { SystemClock.elapsedRealtime() - it.value.createdAt > TTL }
    return previews[id]
  }
  @Synchronized fun discard(id: String) { previews.remove(id) }
  @Synchronized private fun remember(id: String, prepared: Prepared) {
    previews[id] = prepared
    while (previews.size > 12) previews.remove(previews.keys.first())
  }
  private fun initialize(context: Context, success: () -> Unit, failure: (String) -> Unit) {
    if (initialized) { success(); return }
    waiters.add(success to failure)
    if (initializing) return
    val app = context.applicationContext as Application
    val key = app.packageManager.getApplicationInfo(app.packageName, 128)
      .metaData?.getString("com.pang3.KAKAO_NATIVE_APP_KEY").orEmpty()
    if (key.isBlank()) { finishInitialization("카카오 네이티브 앱 키가 없습니다."); return }
    initializing = true
    if (!installed) {
      KNSDK.install(app, "${app.filesDir.absolutePath}/kakao-navigation")
      installed = true
    }
    KNSDK.initializeWithAppKey(key, app.packageManager.getPackageInfo(app.packageName, 0).versionName ?: "1.0",
      null, null, KNLanguageType.KNLanguageType_KOREAN) { error ->
      main.post { finishInitialization(if (error == null) null else "카카오 SDK 초기화에 실패했습니다.") }
    }
  }
  private fun finishInitialization(error: String?) {
    initialized = error == null
    initializing = false
    val pending = waiters.toList(); waiters.clear()
    pending.forEach { if (error == null) it.first() else it.second(error) }
  }
  fun preview(context: Context, request: Map<String, Any?>,
    success: (Map<String, Any>) -> Unit, failure: (String) -> Unit) {
    main.post {
      var settled = false
      val timeout = Runnable { if (!settled) { settled = true; failure("SDK 경로 요청 시간이 초과됐습니다.") } }
      main.postDelayed(timeout, 45_000)
      val reject: (String) -> Unit = { message -> if (!settled) {
        settled = true; main.removeCallbacks(timeout); failure(message)
      } }
      val resolve: (Map<String, Any>) -> Unit = { result -> if (!settled) {
        settled = true; main.removeCallbacks(timeout); success(result)
      } }
      try {
        val lat = coordinate(request, "lat", 33.0..39.0)
        val lng = coordinate(request, "lng", 124.0..132.0)
        val startLat = coordinate(request, "startLat", 33.0..39.0)
        val startLng = coordinate(request, "startLng", 124.0..132.0)
        val priority = when (request["routePriority"] ?: "TIME") {
          "TIME" -> KNRoutePriority.KNRoutePriority_Time
          "DISTANCE" -> KNRoutePriority.KNRoutePriority_Distance
          "RECOMMEND" -> KNRoutePriority.KNRoutePriority_Recommand
          else -> throw IllegalArgumentException("지원하지 않는 경로 기준입니다.")
        }
        val multi = request["multiArrival"] == true
        initialize(context, {
          val start = poi("현재 위치", startLat, startLng, "")
          val goal = poi(request["name"] as? String ?: "목적지", lat, lng, request["address"] as? String ?: "")
          if (multi) goal.setRpFlagType(KNPOIRPFlagType.KNPOIRPFlagType_MP)
          KNSDK.makeTripWithStart(start, goal, null) { error, trip ->
            main.post {
              if (error != null || trip == null) { reject("SDK 경로 생성에 실패했습니다."); return@post }
              trip.routeWithPriority(priority, KNRouteAvoidOption.KNRouteAvoidOption_None.value) { routeError, routes ->
                main.post {
                  val route = routes?.firstOrNull()
                  val path = route?.let { routePath(it) }
                  if (routeError != null || route == null || path.isNullOrEmpty()) {
                    reject("SDK 경로를 찾지 못했습니다."); return@post
                  }
                  val id = UUID.randomUUID().toString()
                  val result = mapOf<String, Any>("sdkPreviewId" to id, "engine" to "kakao-sdk",
                    "mode" to "car", "path" to path, "trafficSections" to trafficSections(route), "totalDistance" to route.totalDist,
                    "totalDuration" to route.totalTime, "routePriority" to (request["routePriority"] ?: "TIME"),
                    "arrivalMode" to if (multi) "MULTI" else "DEFAULT",
                    "previewOrigin" to mapOf("lat" to startLat, "lng" to startLng),
                    "requestedDestination" to mapOf("lat" to lat, "lng" to lng),
                    "navigationDestination" to mapOf("lat" to path.last().getValue("latitude"),
                      "lng" to path.last().getValue("longitude")))
                  remember(id, Prepared(trip, priority, route, SystemClock.elapsedRealtime(), result))
                  if (!settled) resolve(result) else discard(id)
                }
              }
            }
          }
        }, reject)
      } catch (error: Exception) { reject(error.message ?: "경로 요청에 실패했습니다.") }
    }
  }
  fun routePath(route: KNRoute): List<Map<String, Double>>? = route.routePolylineWGS84()?.mapNotNull { point ->
    val lat = (point["y"] ?: point["latitude"] ?: point["lat"])?.toDouble() ?: return@mapNotNull null
    val lng = (point["x"] ?: point["longitude"] ?: point["lng"])?.toDouble() ?: return@mapNotNull null
    if (!lat.isFinite() || !lng.isFinite()) return@mapNotNull null
    mapOf("latitude" to lat, "longitude" to lng)
  }
  fun trafficSections(route: KNRoute): List<Map<String, Any>> =
    trafficSectionsFromPoints(route.routePolylineWGS84().orEmpty())

  /** trfSt belongs to the edge starting at that vertex. Keep the shared boundary vertex. */
  fun trafficSectionsFromPoints(points: List<Map<String, Number>>): List<Map<String, Any>> {
    val sections = mutableListOf<Map<String, Any>>()
    var state: Int? = null
    var path = mutableListOf<Map<String, Double>>()
    fun flush() { if (path.size >= 2) sections.add(mapOf("trafficState" to (state ?: 0), "path" to path.toList())) }
    fun position(point: Map<String, Number>): Map<String, Double>? {
      val lat = point["y"]?.toDouble() ?: return null
      val lng = point["x"]?.toDouble() ?: return null
      if (!lat.isFinite() || !lng.isFinite()) return null
      return mapOf("latitude" to lat, "longitude" to lng)
    }
    for (index in 0 until points.size - 1) {
      val start = position(points[index])
      val end = position(points[index + 1])
      if (start == null || end == null) { flush(); path = mutableListOf(); state = null; continue }
      val sdkState = points[index]["trfSt"]?.toInt() ?: 0
      // Existing map renderer uses REST's blocked=6; the SDK uses blocked=5.
      val nextState = when (sdkState) { 1, 2, 3, 4 -> sdkState; 5 -> 6; else -> 0 }
      if (state != nextState || path.isEmpty()) { flush(); state = nextState; path = mutableListOf(start) }
      path.add(end)
    }
    flush()
    return sections
  }
  private fun coordinate(request: Map<String, Any?>, key: String, range: ClosedFloatingPointRange<Double>): Double {
    val value = (request[key] as? Number)?.toDouble()
    require(value != null && value.isFinite() && value in range) { "현재 위치나 목적지 좌표가 올바르지 않습니다." }
    return value
  }
  private fun poi(name: String, lat: Double, lng: Double, address: String): KNPOI {
    val point = WGS84ToKATEC(lng, lat)
    return KNPOI(name, point.x.roundToInt(), point.y.roundToInt(), address)
  }
}
