package expo.modules.kakaonavigation

import com.kakaomobility.knsdk.KNCarFuel
import com.kakaomobility.knsdk.KNSDK
import com.kakaomobility.knsdk.api.objects.KNPoiAroundData
import com.kakaomobility.knsdk.common.objects.KNError
import com.kakaomobility.knsdk.common.util.FloatPoint
import com.kakaomobility.knsdk.common.util.DoublePoint
import com.kakaomobility.knsdk.common.util.IntPoint
import com.kakaomobility.knsdk.common.util.MBR
import kotlin.math.hypot

/** Use the SDK's nearby facility categories rather than keyword matching. */
object NearbyPlaceQuery {
  private const val RADIUS = 5000

  fun search(category: String, center: FloatPoint, visibleBounds: MBR? = null, completion: (KNError?, List<KNPoiAroundData>) -> Unit) {
    // Official SDK category codes: OilSt=10, Parking=20.
    val code = when (category) {
      "gas" -> 10
      "parking" -> 20
      else -> throw IllegalArgumentException("지원하지 않는 주변 장소입니다.")
    }
    val bounds = visibleBounds ?: MBR(IntPoint(center.x.toInt() - RADIUS, center.y.toInt() - RADIUS),
      IntPoint(center.x.toInt() + RADIUS, center.y.toInt() + RADIUS))
    KNSDK.reqPoiSearchAround(code, KNCarFuel.KNCarFuel_Gasoline,
      DoublePoint(center.x.toDouble(), center.y.toDouble()), bounds) { error, result ->
      val places = if (error != null) emptyList() else result?.poiList.orEmpty()
        .filter { visibleBounds != null || hypot(it.x - center.x, it.y - center.y) <= RADIUS }
        .sortedBy { hypot(it.x - center.x, it.y - center.y) }
      completion(error, places)
    }
  }
}
