# Android guidance map migration

The embedded vehicle guidance screen now creates `KNMapView` and binds it with
`KNSDK.bindingMapView`. The dependency is `knsdk:1.12.8-hotfix02`, without the
prebuilt `knsdk_ui` navigation screen. No SDK view IDs, hidden controls, or
pre-draw visibility overrides remain in the module.

## Responsibilities

- `KNGuidance` remains responsible for routing, rerouting, matched GPS, voice,
  remaining distance/time, maneuver instructions, and safety data.
- PANG3 connects route changes to `setRoute` and location updates to the vehicle
  marker, camera, and `cullPassedRoute`.
- Existing React Native maneuver cards, footer, mode controls, and safety badge
  are retained. The speed display uses SDK GPS speed and shows a dash when GPS
  speed is unavailable or untrusted.
- Camera following pauses on map drag/pinch and resumes with the existing
  location button. 2D/3D affects camera tilt and building rendering directly.
  Speed-dependent zoom is PANG3 policy, not a copy of Kakao's internal camera.
- Route `safetyList()` and nearby safety callbacks populate map markers. Only
  on-route guidance data drives the foreground safety warning. Unknown safety
  types have a generic warning rather than disappearing. Artwork is PANG3's
  own compact signs, not extracted Kakao assets.
- Speed bumps are explicitly excluded from SDK safety guidance, map markers,
  and foreground warnings. Enforcement badges show only the speed limit and
  remaining distance; their descriptive text/camera icon are omitted. The
  current speed number uses size 48 (previously 34).
- Gas/parking buttons use `reqPoiSearchAround` with the official facility codes
  (gas=10, parking=20) near the current map/vehicle
  position and the map draw bounds, matching the previous UI SDK search scope.
  Results are not truncated to 30 places; the 5 km radius is only a fallback
  when no visible bounds are supplied. Gas markers use a fuel-pump icon.
  Search errors are surfaced and automatic retries are throttled.
- Activity lifecycle pauses/resumes the map surface. A stale map initialization
  or nearby query cannot update a replacement session. Cleanup stops guidance
  only if that view still owns the SDK delegates.

## Validation

- Android module compilation and arm64 debug APK assembly passed.
- `single-place-map-test.cjs`, `maneuver-guide-test.cjs`, and
  `safety-guide-test.cjs` passed, including speed validity/session isolation.
- Installed on the connected SM-S908N. Observed live route/turn cards, extruded
  3D buildings, a flat 2D view after one toggle, vehicle position, and SDK-sourced
  hump markers. Fixed a real-device startup crash by registering the map's
  lifecycle observer only after renderer binding. Map sign callouts now start
  closed and open on tap.
- Nearby-search follow-up: replaced keyword search with the dedicated SDK
  facility search. `testNearbyFacilitySearch` passed on the connected SM-X610:
  28 gas stations and 13 parking facilities returned near the fixed Dadae-dong
  test coordinate, without SDK errors; results were checked against the 5 km
  radius and 30-result limit. Updated app installed on that device.
- Real-device checks are required for moving GPS, route-deviation rerouting,
  spoken guidance, camera continuity, and safety warning timing. A static phone
  check cannot establish real-driving equivalence or a performance improvement.

## Official references

- https://developers.kakaomobility.com/en/reference/android-ref-kotlin/class-KNMapView.html
- https://developers.kakaomobility.com/reference/android-ref-kotlin/class-KNRoute
- https://developers.kakaomobility.com/en/reference/android-ref-kotlin/class-KNGPSData.html
- https://devtalk.kakao.com/t/sdk-or-sdk-with-ui/144157

This migration does not change commercial SDK partnership requirements.

## Tab return regression (2026-10-17)

- Reproduced black native map after opening Reports and returning to Map while
  guidance cards/progress remained alive. Merely resuming GL rendering was not sufficient.
- The JS screen now passes map visibility separately from the guidance session.
  Returning from another tab rebuilds/binds the map surface and restores the
  current guidance route and vehicle without calling guidance.stop/startWithTrip.
  Surface reattachment uses the same restoration path. Activity pause/resume stays guarded.
- Verified on the connected Galaxy SM-S908N: two Reports round trips, then Group
  and Settings round trips retained the rendered 3D map/route. Updated hook tests
  cover active/inactive map props with the same guidance destination retained.

## Nearby parking coverage regression

- The old UI SDK passes getMapDrawMbr() to reqPoiSearchAround. The migrated
  implementation incorrectly queried a fixed 10 km-wide box then applied a
  5 km circle and a 30-place client cap.
- Real device comparison near Dadae-dong: the wide request returned 13 major
  parking POIs without Samhwan. A 2 km-wide local bounds request returned 23,
  including Samhwan apartment underground parking, Samhwan rear-gate public
  parking and NicePark Samhwan shopping-area parking. No SDK errors.
- The native map now passes its actual draw bounds and retains every returned
  result. The updated real SDK diagnostic test passed on SM-S908N.
