/**
 * Smooth PCB silhouette morphing in world coordinates.
 *
 * Two triangular maps give the board a changing taper and curved, asymmetric
 * edges. A final positive affine transform changes its aspect and shear.
 * This is a deformation of the entire board, rather than a moving outline:
 * traces, pads, mounting holes and components use the same coordinate map.
 *
 * On the original domain |x| <= 480, |z| <= 312, the Jacobian determinant is
 * at least 0.2103. The map therefore has no folds. More strongly, each of the
 * two triangular stages is monotone in its own input, so the whole mapping
 * is one-to-one on the board. Its conservative extents are |x| < 776 and
 * |z| < 536 at every time, with surface displacement bounded by 22.
 */
export const morphEnvelope = Object.freeze({
  halfWidth: 800,
  halfDepth: 560,
  maxHeight: 24,
  minJacobian: 0.21,
  sourceHalfWidth: 480,
  sourceHalfDepth: 312
});

export function deformBoardPoint(x, z, time = 0) {
  const u = x / 480;
  const v = z / 312;
  const t = Number.isFinite(time) ? time : 0;

  // 8–13 second cycles give visibly different silhouettes within 4–6 seconds.
  const taper = 0.36 * Math.sin(t * 0.71 + 0.30);
  const bow = 0.16 * Math.sin(t * 0.49 + 0.90);
  const fan = 0.19 * Math.sin(t * 0.61 + 1.70);
  const curve = 0.12 * Math.sin(t * 0.83 + 2.50);

  // First triangular map: du1/du >= 0.64 over the source board.
  const u1 = u * (1 + taper * v) + bow * (v * v - 0.33);
  // Second triangular map: dv1/dv at fixed u1 is >= 0.7212.
  const v1 = v * (1 + fan * u1) + curve * (u1 * u1 - 0.40);

  const scaleX = 0.82 + 0.18 * Math.sin(t * 0.64 + 0.20);
  const scaleZ = 0.88 + 0.16 * Math.sin(t * 0.57 + 2.20);
  const shearX = 0.10 * Math.sin(t * 0.46 + 0.40);
  const shearZ = 0.11 * Math.sin(t * 0.59 + 2.80);

  return {
    x: 480 * scaleX * (u1 + shearX * v1),
    z: 312 * scaleZ * (v1 + shearZ * u1)
  };
}

/** Top-surface height, evaluated using the already-deformed X/Z position. */
export function boardSurfaceHeight(x, z, time = 0) {
  const t = Number.isFinite(time) ? time : 0;
  return 11 * Math.sin(x * 0.0034 + t * 0.57) * Math.cos(z * 0.0044 - t * 0.42)
    + 8 * Math.sin(z * 0.0027 + x * 0.0019 - t * 0.69)
    + 3 * Math.sin(x * 0.0041 - z * 0.0032 + t * 0.44);
}
