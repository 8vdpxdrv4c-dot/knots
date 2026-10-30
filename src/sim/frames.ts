/**
 * A "which way is up" direction carried by each particle from frame to frame, so the rope's
 * twist belongs to the material: strands stay put as the rope bends instead of spinning
 * around it. Each frame, every normal is turned with its own tangent and blended with its
 * neighbours, which keeps the twist smooth along the rope like a rope's torsional stiffness.
 */
export class MaterialFrames {
  readonly normals: Float64Array;
  private readonly n: number;
  private readonly t: Float64Array;
  private readonly prevT: Float64Array;
  private readonly tmp = [0, 0, 0];

  constructor(n: number) {
    this.n = n;
    this.normals = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) this.normals[i * 3 + 1] = 1; // the rope starts along x, so up works
    this.t = new Float64Array(n * 3);
    this.prevT = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) this.prevT[i * 3] = 1;
  }

  update(x: Float64Array): void {
    const { n, t, prevT, normals: N, tmp } = this;
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0) * 3;
      const b = Math.min(i + 1, n - 1) * 3;
      const dx = x[b] - x[a];
      const dy = x[b + 1] - x[a + 1];
      const dz = x[b + 2] - x[a + 2];
      const len = Math.hypot(dx, dy, dz) || 1;
      t[i * 3] = dx / len;
      t[i * 3 + 1] = dy / len;
      t[i * 3 + 2] = dz / len;
    }
    // Carry each normal through its own tangent's turn since the last frame.
    for (let i = 0; i < n; i++) {
      rotate(tmp, N, i * 3, prevT, i * 3, t, i * 3);
      N.set(tmp, i * 3);
    }
    prevT.set(t);
    // Forward and backward sweeps spread twist both ways along the rope.
    for (let pass = 0; pass < 12; pass++) {
      for (let i = 0; i < n; i++) this.relax(i);
      for (let i = n - 1; i >= 0; i--) this.relax(i);
    }
  }

  private relax(i: number): void {
    const { n, normals: N, t, tmp } = this;
    const o = i * 3;
    // Low self-weight means stiff torsion: neighbours quickly agree on the twist.
    let x = 0.25 * N[o];
    let y = 0.25 * N[o + 1];
    let z = 0.25 * N[o + 2];
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= n) continue;
      // Turn the neighbour's normal by the bend between the two tangents, so bending is not twist.
      rotate(tmp, N, j * 3, t, j * 3, t, o);
      x += tmp[0];
      y += tmp[1];
      z += tmp[2];
    }
    const dot = x * t[o] + y * t[o + 1] + z * t[o + 2];
    x -= dot * t[o];
    y -= dot * t[o + 1];
    z -= dot * t[o + 2];
    const len = Math.hypot(x, y, z);
    if (len < 1e-9) return; // keep the old normal if this one is degenerate
    N[o] = x / len;
    N[o + 1] = y / len;
    N[o + 2] = z / len;
  }
}

/** Writes v (at vi) turned by the smallest rotation that takes tangent `from` (at fi) to `to` (at ti). */
function rotate(
  out: number[],
  v: Float64Array,
  vi: number,
  from: Float64Array,
  fi: number,
  to: Float64Array,
  ti: number,
): void {
  const ax = from[fi + 1] * to[ti + 2] - from[fi + 2] * to[ti + 1];
  const ay = from[fi + 2] * to[ti] - from[fi] * to[ti + 2];
  const az = from[fi] * to[ti + 1] - from[fi + 1] * to[ti];
  const sin = Math.hypot(ax, ay, az);
  const cos = from[fi] * to[ti] + from[fi + 1] * to[ti + 1] + from[fi + 2] * to[ti + 2];
  const px = v[vi];
  const py = v[vi + 1];
  const pz = v[vi + 2];
  if (sin < 1e-9) {
    out[0] = px;
    out[1] = py;
    out[2] = pz;
    return;
  }
  const kx = ax / sin;
  const ky = ay / sin;
  const kz = az / sin;
  const kd = (kx * px + ky * py + kz * pz) * (1 - cos);
  out[0] = px * cos + (ky * pz - kz * py) * sin + kx * kd;
  out[1] = py * cos + (kz * px - kx * pz) * sin + ky * kd;
  out[2] = pz * cos + (kx * py - ky * px) * sin + kz * kd;
}
