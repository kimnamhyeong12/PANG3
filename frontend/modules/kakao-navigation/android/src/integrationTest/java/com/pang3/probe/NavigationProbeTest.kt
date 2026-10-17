package com.pang3.probe

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import android.util.Log
import expo.modules.kakaonavigation.KakaoRouteEngine
import expo.modules.kakaonavigation.NearbyPlaceQuery
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.common.util.FloatPoint
import com.kakaomobility.knsdk.common.util.MBR
import com.kakaomobility.knsdk.common.util.IntPoint
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Read-only SDK route queries. Run through the host app to use its registered app key. */
class NavigationProbeTest {
  @Test
  fun testNearbyFacilitySearch() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val ready = CountDownLatch(1)
    var initializationError: String? = null
    var previewId: String? = null
    KakaoRouteEngine.preview(instrumentation.targetContext,
      mapOf("name" to "nearby-probe", "startLat" to 35.0640682, "startLng" to 128.9837168,
        "lat" to 35.0636823232284, "lng" to 128.985493965177, "routePriority" to "TIME"),
      { previewId = it["sdkPreviewId"] as String; ready.countDown() },
      { initializationError = it; ready.countDown() })
    assertTrue("SDK initialization timed out", ready.await(60, TimeUnit.SECONDS))
    assertNull(initializationError, initializationError)
    val origin = KNSDK.convertWGS84ToKATEC(128.9837168, 35.0640682)
    val center = FloatPoint(origin.x.toFloat(), origin.y.toFloat())
    try {
      for (category in listOf("gas", "parking", "parking-local")) {
        val done = CountDownLatch(1)
        var sdkError: String? = null
        var count = 0
        var outsideRadius = false
        instrumentation.runOnMainSync {
          val visibleBounds = if (category == "parking-local") MBR(
            IntPoint(center.x.toInt() - 1000, center.y.toInt() - 1000),
            IntPoint(center.x.toInt() + 1000, center.y.toInt() + 1000)) else null
          NearbyPlaceQuery.search(if (category == "parking-local") "parking" else category, center, visibleBounds) { error, places ->
            sdkError = error?.let { "SDK error code=${it.code}" }
            count = places.size
            if (category.startsWith("parking")) places.forEach { Log.i("PANG3NearbyProbe", "query=$category parking=${it.name} address=${it.rnaddr.orEmpty().ifBlank { it.addr.orEmpty() }}") }
            outsideRadius = places.any { kotlin.math.hypot(it.x - center.x, it.y - center.y) > 5000f }
            Log.i("PANG3NearbyProbe", "category=$category count=$count error=$sdkError")
            done.countDown()
          }
        }
        assertTrue("$category lookup timed out", done.await(30, TimeUnit.SECONDS))
        assertNull("$category: $sdkError", sdkError)
        assertTrue("Expected real $category places near Dadae-dong", count > 0)
        assertFalse("Results must stay within 5 km", outsideRadius)
      }
    } finally { previewId?.let { KakaoRouteEngine.discard(it) } }
  }

  @Test
  fun testTrafficSectionBoundaries() {
    val points = listOf(4, 4, 1, 5, 0, 0).mapIndexed { index, state ->
      mapOf<String, Number>("x" to 129.0 + index * 0.001, "y" to 35.0, "trfSt" to state)
    }
    val sections = KakaoRouteEngine.trafficSectionsFromPoints(points)
    assertEquals(listOf(4, 1, 6, 0), sections.map { it["trafficState"] })
    val paths = sections.map { it["path"] as List<*> }
    assertEquals(listOf(3, 2, 2, 2), paths.map { it.size })
    for (index in 0 until paths.size - 1) assertEquals(paths[index].last(), paths[index + 1].first())
  }
  @Test
  fun testDefaultAndMultiArrival() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val cases = listOf(
      mapOf("name" to "library", "startLat" to 35.153863853563315, "startLng" to 128.99917820891798,
        "lat" to 35.1538830767717, "lng" to 128.997466947464),
      mapOf("name" to "dasun", "startLat" to 35.0640682, "startLng" to 128.9837168,
        "lat" to 35.0636823232284, "lng" to 128.985493965177))
    for (point in cases) for (priority in listOf("TIME", "RECOMMEND")) for (multi in listOf(false, true)) {
      val done = CountDownLatch(1)
      var result: Map<String, Any>? = null
      var failure: String? = null
      KakaoRouteEngine.preview(instrumentation.targetContext,
        point + mapOf("routePriority" to priority, "multiArrival" to multi),
        { result = it; done.countDown() }, { failure = it; done.countDown() })
      assertTrue("SDK route callback timed out", done.await(60, TimeUnit.SECONDS))
      assertNull(failure, failure)
      val data = requireNotNull(result)
      val id = data.getValue("sdkPreviewId") as String
      val prepared = requireNotNull(KakaoRouteEngine.get(id))
      assertSame("Guidance must reuse the prepared SDK trip", prepared, KakaoRouteEngine.get(id))
      assertTrue((data.getValue("path") as List<*>).isNotEmpty())
      val traffic = data.getValue("trafficSections") as List<*>
      assertTrue("Traffic sections must cover the real SDK route", traffic.isNotEmpty())
      assertEquals(if (multi) "MULTI" else "DEFAULT", data["arrivalMode"])
      Log.i("PANG3RouteProbe", JSONObject(mapOf("place" to point["name"], "priority" to priority,
        "multi" to multi, "distance" to data["totalDistance"], "duration" to data["totalDuration"],
        "arrival" to data["navigationDestination"], "rpFlag" to prepared.trip.goal.rpFlag,
        "trafficStates" to traffic.map { (it as Map<*, *>)["trafficState"] })).toString())
      KakaoRouteEngine.discard(id)
      assertNull(KakaoRouteEngine.get(id))
    }
  }
}
