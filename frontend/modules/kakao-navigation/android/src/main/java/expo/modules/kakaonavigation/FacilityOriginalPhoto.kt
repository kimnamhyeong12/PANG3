package expo.modules.kakaonavigation

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.File
import java.util.UUID

/** Read the explicitly selected document, without enumerating the user's gallery. */
object FacilityOriginalPhoto {
  fun read(context: Context, uriText: String): Map<String, Any> {
    val selected = Uri.parse(uriText)
    require(selected.scheme == "content") { "휴대폰 파일 선택창에서 원본 사진을 선택해 주세요." }
    val resolver = context.contentResolver
    val candidates = linkedSetOf<Uri>()
    if (Build.VERSION.SDK_INT >= 29) {
      // A document grant can be translated to its MediaStore URI. Asking for the
      // original here preserves GPS, unlike the redacted copy from Photo Picker.
      val media = runCatching { MediaStore.getMediaUri(context, selected) }.getOrNull()
      if (media != null) candidates.add(MediaStore.setRequireOriginal(media))
      candidates.add(MediaStore.setRequireOriginal(selected))
    }
    candidates.add(selected)
    var tooLarge = false
    var readable = false
    for (uri in candidates) {
      val bytes = runCatching {
        resolver.openInputStream(uri)?.use { input ->
          val output = java.io.ByteArrayOutputStream()
          val buffer = ByteArray(8192)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            if (output.size() + count > 15 * 1024 * 1024) { tooLarge = true; return@use null }
            output.write(buffer, 0, count)
          }
          output.toByteArray()
        }
      }.getOrNull() ?: continue
      readable = true
      val extension = when {
        bytes.size >= 3 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() && bytes[2] == 0xff.toByte() -> ".jpg"
        bytes.size >= 8 && bytes.take(8).toByteArray().contentEquals(byteArrayOf(137.toByte(),80,78,71,13,10,26,10)) -> ".png"
        else -> continue
      }
      val gps = runCatching { ExifInterface(ByteArrayInputStream(bytes)).latLong }.getOrNull() ?: continue
      val lat = gps[0]; val lng = gps[1]
      if (!lat.isFinite() || !lng.isFinite() || kotlin.math.abs(lat) > 90 || kotlin.math.abs(lng) > 180 || (lat == 0.0 && lng == 0.0)) continue
      val name = runCatching {
        resolver.query(selected, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) cursor.getString(0) else null
        }
      }.getOrNull()?.takeIf { it.endsWith(extension, true) || (extension == ".jpg" && it.endsWith(".jpeg", true)) } ?: "facility-photo$extension"
      val directory = File(context.cacheDir, "facility-originals").apply { mkdirs() }
      val target = File(directory, "${UUID.randomUUID()}$extension")
      try { target.writeBytes(bytes) } catch (error: Exception) { target.delete(); throw error }
      return mapOf("uri" to Uri.fromFile(target).toString(), "fileName" to name,
        "exif" to mapOf("GPSLatitude" to kotlin.math.abs(lat), "GPSLatitudeRef" to if (lat < 0) "S" else "N",
          "GPSLongitude" to kotlin.math.abs(lng), "GPSLongitudeRef" to if (lng < 0) "W" else "E"))
    }
    if (tooLarge) throw IllegalArgumentException("15MB 이하의 사진을 선택해 주세요.")
    if (!readable) throw IllegalArgumentException("선택한 원본 사진을 읽지 못했습니다. 파일이 휴대폰에 저장되어 있는지 확인해 주세요.")
    throw IllegalArgumentException("선택한 파일에서 촬영 위치를 확인하지 못했습니다. 위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.")
  }
}
