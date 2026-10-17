package expo.modules.kakaonavigation

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.app.DownloadManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.DocumentsContract
import java.io.File

object ReportDownloads {
  private const val REPORT_FOLDER = "외근도우미/다운로드"

  fun openFolder(context: Context): Boolean {
    val folder = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents",
      "primary:${Environment.DIRECTORY_DOWNLOADS}/$REPORT_FOLDER")
    val view = Intent(Intent.ACTION_VIEW).setDataAndType(folder, DocumentsContract.Document.MIME_TYPE_DIR)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(DocumentsContract.EXTRA_INITIAL_URI, folder)
    try { context.startActivity(view); return true }
    catch (_: android.content.ActivityNotFoundException) { }
    catch (_: SecurityException) { }
    // Some manufacturers do not expose a directory-view activity.
    try {
      context.startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      return false
    } catch (_: android.content.ActivityNotFoundException) { return false }
    catch (_: SecurityException) { return false }
  }

  fun save(context: Context, sourceUri: String, requestedName: String): String {
    require(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { "다운로드 폴더 저장은 Android 10 이상에서 지원됩니다." }
    val source = Uri.parse(sourceUri)
    require(source.scheme == "file") { "앱에서 받은 보고서만 저장할 수 있습니다." }
    val file = File(requireNotNull(source.path)).canonicalFile
    require(file.toPath().startsWith(context.cacheDir.canonicalFile.toPath())) { "앱 캐시의 보고서만 저장할 수 있습니다." }
    val name = requestedName.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(160)
    require(name.endsWith(".hwpx", ignoreCase = true) && file.isFile) { "보고서 파일을 확인해 주세요." }
    val resolver = context.contentResolver
    // MediaStore allocates a unique filename when the display name already exists.
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, name)
      put(MediaStore.Downloads.MIME_TYPE, "application/hwp+zip")
      put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$REPORT_FOLDER/")
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val destination = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
    try {
      requireNotNull(resolver.openOutputStream(destination)).use { output -> file.inputStream().use { it.copyTo(output) } }
      resolver.update(destination, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
      return destination.toString()
    } catch (error: Exception) {
      resolver.delete(destination, null, null)
      throw error
    }
  }
}
