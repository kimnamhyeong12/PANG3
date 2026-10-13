package expo.modules.kakaonavigation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import com.kakaomobility.knsdk.KNSDK

/** Owns the route notification so removal of the Android task can clean it up without JS. */
class RouteGuidanceService : Service() {
  companion object {
    private const val CHANNEL = "route"
    private const val ID = 54031
    private const val PREFS = "pang3-route-lifecycle"
    private const val REMOVED = "task-removed"
    private var running = false

    fun wasTaskRemoved(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(REMOVED, false)
    fun beginSession(context: Context) { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(REMOVED, false).commit() }
    fun show(context: Context, title: String, body: String) {
      if (wasTaskRemoved(context)) return
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "경로 안내", NotificationManager.IMPORTANCE_LOW))
      clearLegacyNotification(context)
      if (running) manager.notify(ID, notification(context, title, body))
      else context.startForegroundService(Intent(context, RouteGuidanceService::class.java).putExtra("title", title).putExtra("body", body))
    }
    fun stop(context: Context) {
      context.stopService(Intent(context, RouteGuidanceService::class.java))
      context.getSystemService(NotificationManager::class.java).cancel(ID)
      clearLegacyNotification(context)
    }
    private fun clearLegacyNotification(context: Context) {
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.activeNotifications.filter { it.tag == "fieldwork-route-guidance" }.forEach { manager.cancel(it.tag, it.id) }
    }
    private fun notification(context: Context, title: String, body: String): Notification {
      val builder = Notification.Builder(context, CHANNEL)
        .setSmallIcon(context.applicationInfo.icon).setContentTitle(title).setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body)).setOngoing(true).setOnlyAlertOnce(true)
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        builder.setContentIntent(PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      return builder.build()
    }
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null || wasTaskRemoved(this)) { stopSelf(); return START_NOT_STICKY }
    startForeground(ID, notification(this, intent.getStringExtra("title").orEmpty(), intent.getStringExtra("body").orEmpty()))
    running = true
    return START_NOT_STICKY
  }
  override fun onTaskRemoved(rootIntent: Intent?) {
    // Home/background transitions do not invoke this callback.
    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(REMOVED, true).commit()
    try { runCatching { KNSDK.sharedGuidance()?.stop() } } finally {
      stopForeground(STOP_FOREGROUND_REMOVE)
      clearLegacyNotification(this)
      stopSelf()
    }
    super.onTaskRemoved(rootIntent)
  }
  override fun onDestroy() {
    running = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
