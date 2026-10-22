package expo.modules.kakaonavigation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path

/** Upright destination artwork shared by the walking and driving maps. */
internal object DestinationPin {
  const val ANCHOR_Y = 66f / 72f

  fun bitmap(context: Context): Bitmap {
    val density = context.resources.displayMetrics.density
    return Bitmap.createBitmap((56 * density).toInt(), (72 * density).toInt(), Bitmap.Config.ARGB_8888).also { bitmap ->
      val canvas = Canvas(bitmap)
      canvas.scale(density, density)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG)
      // Matte A-style location pin: no label, gradient, gloss or highlight.
      paint.color = Color.argb(22, 16, 40, 91)
      canvas.drawOval(17f, 63f, 39f, 70f, paint)
      val shape = Path().apply {
        moveTo(28f, 66f)
        cubicTo(23f, 54f, 9f, 39f, 9f, 27f)
        cubicTo(9f, 2f, 47f, 2f, 47f, 27f)
        cubicTo(47f, 39f, 33f, 54f, 28f, 66f)
        close()
      }
      paint.color = Color.rgb(227, 77, 89)
      canvas.drawPath(shape, paint)
      paint.color = Color.WHITE
      canvas.drawCircle(28f, 26f, 8.5f, paint)
    }
  }
}
