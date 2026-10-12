package expo.modules.kakaonavigation

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KakaoNavigationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KakaoNavigation")

    View(KakaoNavigationView::class) {
      Events("onError", "onEnded")

      Prop("destination") { view: KakaoNavigationView, destination: Map<String, Any?> ->
        view.start(destination)
      }

      OnViewDestroys { view: KakaoNavigationView ->
        view.release()
      }
    }
  }
}
