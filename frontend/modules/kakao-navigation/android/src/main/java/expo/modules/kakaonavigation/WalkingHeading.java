package expo.modules.kakaonavigation;

/** Heading math kept independent of Android so standing, upright and slow turns can be tested. */
public final class WalkingHeading {
  private WalkingHeading() {}

  public static double normalize(double degrees) {
    return (degrees % 360.0 + 360.0) % 360.0;
  }

  public static double difference(double next, double previous) {
    return normalize(next - previous + 180.0) - 180.0;
  }

  public static double fromDisplayMatrix(float[] matrix) {
    // The display's top edge becomes vertical when held upright. Its right edge
    // still defines the horizontal viewing direction, without the azimuth singularity.
    if (Math.hypot(matrix[0], matrix[3]) > 0.5) {
      return normalize(Math.toDegrees(Math.atan2(-matrix[3], matrix[0])));
    }
    return normalize(Math.toDegrees(Math.atan2(matrix[1], matrix[4])));
  }

  public static double nextFrame(double current, double target, double elapsedMillis) {
    if (Double.isNaN(current)) return normalize(target);
    double delta = difference(target, current);
    if (Math.abs(delta) < 0.02) return normalize(target);
    // Time based interpolation behaves the same on 60/90/120 Hz displays.
    double blend = 1.0 - Math.exp(-Math.max(0, Math.min(elapsedMillis, 100)) / 85.0);
    return normalize(current + delta * blend);
  }
}
