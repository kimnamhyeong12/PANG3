package expo.modules.kakaonavigation

import android.content.Context
import android.graphics.*

/** PANG3 artwork drawn from SDK data; no SDK UI assets are extracted or copied. */
internal class NavigationMapSigns(context: Context) {
  private val density = context.resources.displayMetrics.density
  private val cache = mutableMapOf<String, Bitmap>()
  private val navy = Color.parseColor("#10285B")
  private val blue = Color.parseColor("#2477F3")

  fun place(category: String): Bitmap = image("place:$category", if (category == "parking") "P" else "", blue, false)

  fun safety(code: String, limit: Int): Bitmap {
    val speed = limit.takeIf { it in 1..200 }
    val text = when {
      speed != null -> speed.toString()
      code.contains("Hump") -> "턱"
      code.contains("Children") -> "어린이"
      code.contains("Camera") || code.contains("ViolationSection") -> "단속"
      code.contains("RestArea") -> "쉼터"
      else -> "!"
    }
    return image("safety:$text", text, if (speed != null) Color.parseColor("#C75B66") else navy, true)
  }

  private fun image(key: String, text: String, color: Int, outlined: Boolean): Bitmap = cache.getOrPut(key) {
    val size = (34 * density).toInt().coerceAtLeast(34)
    Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also { bitmap ->
      val canvas = Canvas(bitmap)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG)
      val center = size / 2f
      paint.color = Color.WHITE
      canvas.drawCircle(center, center, center - density, paint)
      paint.color = color
      if (outlined) {
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 2.5f * density
        canvas.drawCircle(center, center, center - 3 * density, paint)
        paint.style = Paint.Style.FILL
      } else canvas.drawCircle(center, center, center - 2.5f * density, paint)
      paint.color = if (outlined) navy else Color.WHITE
      if (key == "place:gas") {
        canvas.save()
        canvas.scale(size / 34f, size / 34f)
        paint.color = Color.WHITE
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.8f
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        canvas.drawRoundRect(10f, 8f, 21f, 26f, 1.5f, 1.5f, paint)
        canvas.drawLine(8f, 26f, 23f, 26f, paint)
        canvas.drawRect(13f, 11f, 18f, 16f, paint)
        val hose = Path().apply {
          moveTo(21f, 17f); lineTo(23f, 17f)
          cubicTo(26f, 17f, 23f, 24f, 26f, 24f)
          cubicTo(28f, 24f, 27f, 19f, 27f, 15f)
          lineTo(24f, 12f)
        }
        canvas.drawPath(hose, paint)
        canvas.drawLine(24f, 12f, 23f, 11f, paint)
        canvas.restore()
        return@also
      }
      paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      paint.textAlign = Paint.Align.CENTER
      paint.textSize = (if (text.length > 2) 9f else if (text.length == 2) 12f else 17f) * density
      canvas.drawText(text, center, center - (paint.ascent() + paint.descent()) / 2, paint)
    }
  }
}

internal fun safetyLabel(code: String): String = when {
  code.contains("SpeedViolationSection") -> "구간 단속"
  code.contains("SignalAndSpeed") -> "신호·과속 단속"
  code.contains("MovableSpeed") -> "이동식 단속"
  code.contains("Speed") && code.contains("Camera") -> "과속 단속"
  code.contains("SignalViolation") -> "신호 단속"
  code.contains("Buslane") -> "버스전용차로 단속"
  code.contains("ParkingViolation") -> "주정차 단속"
  code.contains("Overload") || code.contains("Cargo") -> "화물차 단속"
  code.contains("OldDiesel") -> "노후 경유차 단속"
  code.contains("SeatBelt") -> "안전벨트 단속"
  code.contains("Camera") -> "교통 카메라"
  code == "Hump" -> "과속 방지턱"
  code == "ChildrenProtectionZone" -> "어린이 보호구역"
  code.contains("Accident") -> "사고 주의"
  code.contains("SharpTurn") -> "급커브"
  code.contains("FallingRocks") -> "낙석 주의"
  code.contains("Fog") -> "안개 주의"
  code.contains("Frozen") -> "결빙 주의"
  code.contains("Slipping") -> "미끄럼 주의"
  code.contains("Railroad") -> "철도 건널목"
  code.contains("RoadNarrows") -> "도로 좁아짐"
  code.contains("Downhill") -> "급경사 내리막"
  code.contains("Uphill") -> "오르막"
  code.contains("Animals") -> "야생동물 주의"
  code.contains("RestArea") -> "졸음 쉼터"
  code.contains("HeightLimit") -> "높이 제한"
  code.contains("WeightLimit") -> "중량 제한"
  code.contains("Flood") -> "침수 주의"
  code.contains("Falling") -> "추락 주의"
  code.contains("CautionSignals") -> "신호 주의"
  code.contains("Tolling") -> "요금소"
  else -> "안전 운전 주의"
}
