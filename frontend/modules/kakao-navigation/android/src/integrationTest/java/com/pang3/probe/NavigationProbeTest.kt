package com.pang3.probe

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import android.util.Log
import expo.modules.kakaonavigation.KakaoRouteEngine
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Read-only SDK route queries. Run through the host app to use its registered app key. */
class NavigationProbeTest {
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
      assertEquals(if (multi) "MULTI" else "DEFAULT", data["arrivalMode"])
      Log.i("PANG3RouteProbe", JSONObject(mapOf("place" to point["name"], "priority" to priority,
        "multi" to multi, "distance" to data["totalDistance"], "duration" to data["totalDuration"],
        "arrival" to data["navigationDestination"], "rpFlag" to prepared.trip.goal.rpFlag)).toString())
      KakaoRouteEngine.discard(id)
      assertNull(KakaoRouteEngine.get(id))
    }
  }
}
