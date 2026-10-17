package expo.modules.kakaonavigation

/** SDK zoom is a scale: larger values show more road ahead. */
internal object GuidanceCameraPolicy {
  fun zoom(speedKmh: Int): Float = when {
    speedKmh < 30 -> 0.65f
    speedKmh < 60 -> 0.9f
    speedKmh < 90 -> 1.3f
    else -> 1.8f
  }
}
