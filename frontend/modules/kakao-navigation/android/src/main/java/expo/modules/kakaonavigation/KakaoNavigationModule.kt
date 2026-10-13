package expo.modules.kakaonavigation

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KakaoNavigationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KakaoNavigation")

    Function("beginRouteSession") { RouteGuidanceService.beginSession(requireNotNull(appContext.reactContext)) }
    Function("wasRouteTaskRemoved") { RouteGuidanceService.wasTaskRemoved(requireNotNull(appContext.reactContext)) }
    Function("showRouteNotification") { title: String, body: String ->
      RouteGuidanceService.show(requireNotNull(appContext.reactContext), title, body)
    }
    Function("stopRouteNotification") { RouteGuidanceService.stop(requireNotNull(appContext.reactContext)) }

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
