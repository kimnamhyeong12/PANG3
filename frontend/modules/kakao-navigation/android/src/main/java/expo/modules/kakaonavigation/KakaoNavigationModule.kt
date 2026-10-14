package expo.modules.kakaonavigation

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class KakaoNavigationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KakaoNavigation")

    AsyncFunction("previewRoute") { request: Map<String, Any?>, promise: Promise ->
      KakaoRouteEngine.preview(requireNotNull(appContext.reactContext), request,
        { promise.resolve(it) }, { promise.reject("SDK_ROUTE_ERROR", it, null) })
    }
    Function("isPreviewAvailable") { id: String -> KakaoRouteEngine.get(id) != null }
    Function("discardPreview") { id: String -> KakaoRouteEngine.discard(id) }

    Function("beginRouteSession") { RouteGuidanceService.beginSession(requireNotNull(appContext.reactContext)) }
    Function("wasRouteTaskRemoved") { RouteGuidanceService.wasTaskRemoved(requireNotNull(appContext.reactContext)) }
    Function("showRouteNotification") { title: String, body: String ->
      RouteGuidanceService.show(requireNotNull(appContext.reactContext), title, body)
    }
    Function("stopRouteNotification") { RouteGuidanceService.stop(requireNotNull(appContext.reactContext)) }

    View(KakaoNavigationView::class) {
      Events("onError", "onEnded", "onProgress", "onArrived", "onRouteChanged")

      Prop("destination") { view: KakaoNavigationView, destination: Map<String, Any?> ->
        view.start(destination)
      }

      OnViewDestroys { view: KakaoNavigationView ->
        view.release()
      }
    }
  }
}
