import expo.modules.kakaonavigation.WalkingHeading;

public class WalkingHeadingTest {
  private static void close(double actual, double expected) {
    if (Math.abs(WalkingHeading.difference(actual, expected)) > 0.001)
      throw new AssertionError("Expected " + expected + ", got " + actual);
  }

  public static void main(String[] args) {
    for (double bearing : new double[] {0, 45, 90, 180, 270, 359}) {
      for (double pitch : new double[] {0, 45, 80, 89.99, 90, 100}) {
        double c = Math.cos(Math.toRadians(bearing)), s = Math.sin(Math.toRadians(bearing));
        double cp = Math.cos(Math.toRadians(pitch)), sp = Math.sin(Math.toRadians(pitch));
        float[] matrix = {(float)c, (float)(s*cp), (float)(-s*sp),
          (float)-s, (float)(c*cp), (float)(-c*sp), 0, (float)sp, (float)cp};
        close(WalkingHeading.fromDisplayMatrix(matrix), bearing);
      }
    }
    close(WalkingHeading.difference(1, 359), 2);
    for (int fps : new int[] {60, 90, 120}) {
      double displayed = 0;
      int changedFrames = 0;
      for (int frame = 1; frame <= fps * 4; frame++) {
        double target = frame * 5.0 / fps;
        double next = WalkingHeading.nextFrame(displayed, target, 1000.0 / fps);
        double step = WalkingHeading.difference(next, displayed);
        if (step <= 0 || step > 0.15) throw new AssertionError("Stepped/paused slow turn at " + fps + " Hz: " + step);
        if (step > 0.01) changedFrames++;
        displayed = next;
      }
      if (changedFrames < fps * 3 || displayed < 19.4) throw new AssertionError("Slow turn lagged at " + fps + " Hz");
      double settled = 0;
      for (int frame = 0; frame < fps; frame++) settled = WalkingHeading.nextFrame(settled, 90, 1000.0 / fps);
      if (Math.abs(settled - 90) > 0.02) throw new AssertionError("Frame-rate dependent settling");
    }
    double acrossNorth = WalkingHeading.nextFrame(359, 1, 16);
    if (acrossNorth <= 359 || acrossNorth >= 360) throw new AssertionError("North crossing took the long way");
    close(WalkingHeading.nextFrame(45, 45, 16), 45);
    System.out.println("Walking heading passed: upright bearings, north wrap and smooth 60/90/120 Hz turns");
  }
}
