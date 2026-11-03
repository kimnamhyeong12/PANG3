package expo.modules.kakaonavigation

import android.app.Activity
import android.util.Log

/** Refresh the window's SurfaceView transparency hint after React overlays are mounted. */
object GuidanceOverlayDrawing {
  fun refresh(activity: Activity?, reason: String) {
    val root = activity?.window?.decorView ?: return
    root.post {
      if (!root.isAttachedToWindow) return@post
      root.parent?.requestTransparentRegion(root)
      root.requestLayout()
      root.invalidate()
      Log.i("PANG3MapSurface", "Refreshed guidance overlay drawing region: $reason")
    }
  }
}
