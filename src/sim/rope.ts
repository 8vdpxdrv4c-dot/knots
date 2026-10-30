import type { Guide, KnotDef, Vec3 } from "../knots/types";

/** Frames per second of the baked timeline. */
export const FPS = 60;
const SUBSTEPS = 24;
const H = 1 / (FPS * SUBSTEPS);
const GRAVITY = 9.81;
const ROPE_MASS = 1.0; // kg: heavier than real laid rope, which reads as light on screen
const BEND_STIFFNESS = 0.03; // N·m²
const CONTACT_ROUNDS = 4; // fewer lets a hard pull drag rope through rope inside the knot
const TWIST_STIFFNESS = 0.022; // N·m²: about 0.75 EI, as for a solid rod; the lay makes it softer still
// Rotary inertia of each segment, inflated past the real m·r²/4: the real value makes the
// stiff bend mode ring faster than the substep can follow, which shows as shaking.
const SEG_INERTIA = 1e-5; // kg·m²
const FRICTION = 0.6; // one coefficient for sticking and sliding, so contacts never stick-slip and judder
const AIR_DAMPING = 6; // 1/s
// Fraction of each particle's velocity pulled toward its neighbours' every substep: internal
// friction that kills wobble along the rope without slowing the rope as a whole.
const INTERNAL_DAMPING = 0.1;
// Guides are stiff springs, never hard pins, so a guide that asks for more rope than exists lags instead of stretching it.
const GUIDE_COMPLIANCE = 2.5e-4;
const RELEASE = 0.3; // seconds a guide takes to let go
const GUIDE_MAX_FORCE = 10; // N: enough to lift stiff rope, not to drag it across the table

/** Particles along the rope. Spacing below the radius leaves no gap for other rope to slip through. */
export function particleCount(rope: KnotDef["rope"]): number {
  return Math.ceil(rope.length / (0.8 * rope.radius)) + 1;
}

interface GuideState {
  def: Guide;
  index: number;
  times: number[];
  points: Vec3[] | null; // filled in when the guide grabs
  target: Vec3 | null; // null while inactive
  handsOff: boolean; // another guide takes this point when this one ends, so keep a firm grip
}

/**
 * Rope as a Cosserat rod solved with small-step XPBD: particles joined by segments that each
 * carry an orientation, so bending and twist are real torques between segments (position-based
 * Cosserat rods, Kugelstadt & Schömer 2016). Plus self-collision with Coulomb friction and a
 * table with friction. Deterministic.
 */
export class RopeSim {
  readonly n: number;
  readonly radius: number;
  readonly spacing: number;
  readonly x: Float64Array;
  time = 0;
  private flip = false;
  private readonly prev: Float64Array;
  private readonly v: Float64Array;
  private readonly w: Float64Array;
  /** Inverse mass the length solve sees: a held particle is anchored by the hand, so it moves less. */
  private readonly wHeld: Float64Array;
  // Scratch for the length solve, one entry per link.
  private readonly dir: Float64Array;
  private readonly rhs: Float64Array;
  private readonly cp: Float64Array;
  private readonly lam: Float64Array;
  /** Segment orientations as quaternions (x, y, z, w); each segment's local z runs along the rope. */
  private readonly q: Float64Array;
  private readonly qPrev: Float64Array;
  private readonly om: Float64Array; // segment angular velocity, body frame
  private readonly invMass: number;
  private readonly skip: number;
  private readonly guides: GuideState[];

  constructor(knot: KnotDef) {
    const { length, radius } = knot.rope;
    this.n = particleCount(knot.rope);
    this.radius = radius;
    this.spacing = length / (this.n - 1);
    // Particles closer than a diameter along the rope always touch, so they never collide.
    this.skip = Math.ceil((2 * radius) / this.spacing);
    this.invMass = this.n / ROPE_MASS;
    this.x = new Float64Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.x[i * 3] = -length / 2 + i * this.spacing;
      this.x[i * 3 + 1] = radius;
    }
    this.prev = this.x.slice();
    this.v = new Float64Array(this.n * 3);
    this.w = new Float64Array(this.n).fill(this.invMass);
    this.wHeld = this.w.slice();
    this.dir = new Float64Array((this.n - 1) * 3);
    this.rhs = new Float64Array(this.n - 1);
    this.cp = new Float64Array(this.n - 1);
    this.lam = new Float64Array(this.n - 1);
    // Quarter turn about y takes local z onto the rope's +x.
    this.q = new Float64Array((this.n - 1) * 4);
    for (let j = 0; j < this.n - 1; j++) {
      this.q[j * 4 + 1] = Math.SQRT1_2;
      this.q[j * 4 + 3] = Math.SQRT1_2;
    }
    this.qPrev = this.q.slice();
    this.om = new Float64Array((this.n - 1) * 3);
    this.guides = knot.guides.map((def) => ({
      def,
      index: Math.round(def.at * (this.n - 1)),
      times: [def.grab, ...def.path.map((k) => k.t)],
      points: null,
      target: null,
      handsOff: false,
    }));
    for (const g of this.guides) {
      const end = g.times[g.times.length - 1];
      g.handsOff = this.guides.some(
        (o) => o !== g && o.index === g.index && Math.abs(o.times[0] - end) < 0.05,
      );
    }
  }

  /** Advances one frame (1 / FPS seconds). */
  step(): void {
    for (let s = 0; s < SUBSTEPS; s++) this.substep();
  }

  private substep(): void {
    const { n, x, prev, v } = this;
    this.time += H;
    this.updateGuides();

    const damp = Math.exp(-AIR_DAMPING * H);
    for (let i = 0; i < n * 3; i += 3) {
      prev[i] = x[i];
      prev[i + 1] = x[i + 1];
      prev[i + 2] = x[i + 2];
      v[i + 1] -= GRAVITY * H;
      x[i] += v[i] * damp * H;
      x[i + 1] += v[i + 1] * damp * H;
      x[i + 2] += v[i + 2] * damp * H;
    }

    const { q, qPrev, om } = this;
    for (let j = 0; j < n - 1; j++) {
      const o = j * 4;
      for (let c = 0; c < 4; c++) qPrev[o + c] = q[o + c];
      const v = j * 3;
      // q += h/2 · q ⊗ (0, ω)
      addMul(q, o, q, o, om[v] * damp, om[v + 1] * damp, om[v + 2] * damp, 0.5 * H);
      normalize(q, o);
    }

    this.solveGuides();
    // Alternate direction every substep: a one-way sweep biases tight bends into pushing rope
    // along itself, which reels the rope through a knot.
    if (this.flip) for (let j = n - 3; j >= 0; j--) this.solveBendTwist(j);
    else for (let j = 0; j < n - 2; j++) this.solveBendTwist(j);
    if (this.flip) for (let j = n - 2; j >= 0; j--) this.solveStretchShear(j);
    else for (let j = 0; j < n - 1; j++) this.solveStretchShear(j);
    this.flip = !this.flip;
    // Length and contact take turns: contact inside a tight knot pushes rope apart.
    for (let round = 0; round < CONTACT_ROUNDS; round++) {
      this.solveLengths();
      this.solveLengths(); // a second Newton step for links that turned a lot this substep
      this.solveCollisions();
    }
    this.solveGround();

    for (let i = 0; i < n * 3; i++) v[i] = (x[i] - prev[i]) / H;
    for (let j = 0; j < n - 1; j++) {
      // ω = 2·Im(q̄prev ⊗ q) / h, taking the short way round
      const r = relative(qPrev, j * 4, q, j * 4);
      const sgn = r[3] < 0 ? -2 / H : 2 / H;
      om[j * 3] = r[0] * sgn;
      om[j * 3 + 1] = r[1] * sgn;
      om[j * 3 + 2] = r[2] * sgn;
    }
    for (let i = 3; i < n * 3 - 3; i++)
      v[i] += INTERNAL_DAMPING * ((v[i - 3] + v[i + 3]) / 2 - v[i]);
  }

  /** Bending and twist between segments j and j+1: drives their relative rotation to zero. */
  private solveBendTwist(j: number): void {
    const { q } = this;
    const a = j * 4;
    const b = a + 4;
    const r = relative(q, a, q, b); // Darboux vector Ω = Im(q̄a ⊗ qb) ≈ curvature·ds/2
    const sgn = r[3] < 0 ? -1 : 1;
    // Energy EI/2·κ²·ds with Ω = κ·ds/2 gives compliance ds / (4·EI) on Ω. Rotating either
    // segment by θ moves Ω by θ/2, so each counts as inverse mass 1 / (4·I).
    const ds = this.spacing;
    const wsum = 2 / (4 * SEG_INERTIA);
    const bend = ds / (4 * BEND_STIFFNESS) / (H * H);
    const twist = ds / (4 * TWIST_STIFFNESS) / (H * H);
    const lx = (-sgn * r[0]) / (wsum + bend);
    const ly = (-sgn * r[1]) / (wsum + bend);
    const lz = (-sgn * r[2]) / (wsum + twist);
    const k = 1 / (4 * SEG_INERTIA);
    addMul(q, b, q, b, lx, ly, lz, k);
    addMul(q, a, q, a, lx, ly, lz, -k);
    normalize(q, a);
    normalize(q, b);
  }

  /** Keeps segment j's orientation pointing along the rope, which carries bending onto the particles. */
  private solveStretchShear(j: number): void {
    const { x, w, q } = this;
    const pa = j * 3;
    const pb = pa + 3;
    const o = j * 4;
    const [qx, qy, qz, qw] = [q[o], q[o + 1], q[o + 2], q[o + 3]];
    // d3: the segment's local z in the world
    const d0 = 2 * (qx * qz + qw * qy);
    const d1 = 2 * (qy * qz - qw * qx);
    const d2 = qw * qw - qx * qx - qy * qy + qz * qz;
    const ds = this.spacing;
    const g0 = (x[pb] - x[pa]) / ds - d0;
    const g1 = (x[pb + 1] - x[pa + 1]) / ds - d1;
    const g2 = (x[pb + 2] - x[pa + 2]) / ds - d2;
    const wsum = (w[j] + w[j + 1]) / (ds * ds) + 1 / SEG_INERTIA;
    const l0 = -g0 / wsum;
    const l1 = -g1 / wsum;
    const l2 = -g2 / wsum;
    const ka = w[j] / ds;
    const kb = w[j + 1] / ds;
    x[pa] -= l0 * ka;
    x[pa + 1] -= l1 * ka;
    x[pa + 2] -= l2 * ka;
    x[pb] += l0 * kb;
    x[pb + 1] += l1 * kb;
    x[pb + 2] += l2 * kb;
    // World rotation λ × d3 / I turns d3 toward the rope; q += ½ (0, θ) ⊗ q.
    const t0 = (l1 * d2 - l2 * d1) / SEG_INERTIA / 2;
    const t1 = (l2 * d0 - l0 * d2) / SEG_INERTIA / 2;
    const t2 = (l0 * d1 - l1 * d0) / SEG_INERTIA / 2;
    q[o] += qw * t0 + t1 * qz - t2 * qy;
    q[o + 1] += qw * t1 + t2 * qx - t0 * qz;
    q[o + 2] += qw * t2 + t0 * qy - t1 * qx;
    q[o + 3] -= t0 * qx + t1 * qy + t2 * qz;
    normalize(q, o);
  }

  private updateGuides(): void {
    for (const g of this.guides) {
      const { times } = g;
      if (this.time < times[0] || this.time > times[times.length - 1]) {
        g.target = null;
        continue;
      }
      if (!g.points) {
        const i = g.index * 3;
        const points: Vec3[] = [[this.x[i], this.x[i + 1], this.x[i + 2]]];
        for (const k of g.def.path) points.push(k.p ?? points[points.length - 1]);
        g.points = points;
      }
      g.target = sampleHermite(times, g.points, this.time);
    }
  }

  private solveGuides(): void {
    const { x, w, wHeld } = this;
    wHeld.set(w);
    for (const g of this.guides) {
      if (!g.target) continue;
      const i = g.index * 3;
      // Over the last moments the grip softens, like fingers opening, so tension eases out.
      const left = (g.times[g.times.length - 1] - this.time) / RELEASE;
      const grip = g.handsOff ? 1 : Math.min(1, Math.max(left, 0)) ** 2 + 1e-6;
      const alpha = (g.def.compliance ?? GUIDE_COMPLIANCE) / grip / (H * H);
      let k = w[g.index] / (w[g.index] + alpha);
      const dx = g.target[0] - x[i];
      const dy = g.target[1] - x[i + 1];
      const dz = g.target[2] - x[i + 2];
      // A hand pulls with limited force: a target the rope cannot reach makes the guide lag
      // behind it instead of yanking the whole rope.
      const reach = (g.def.force ?? GUIDE_MAX_FORCE) * w[g.index] * H * H;
      const step = Math.hypot(dx, dy, dz) * k;
      if (step > reach) k *= reach / step;
      else wHeld[g.index] = (w[g.index] * alpha) / (w[g.index] + alpha);
      x[i] += dx * k;
      x[i + 1] += dy * k;
      x[i + 2] += dz * k;
    }
  }

  /**
   * Every link's length in one direct solve. The links form a chain, so the system is
   * tridiagonal and solves in linear time (Thomas algorithm). Unlike link-by-link passes it
   * cannot fall behind, so even a hard pull leaves the rope its length (after Deul et al. 2018).
   */
  private solveLengths(): void {
    const { n, x, wHeld: w, dir, rhs, cp, lam, spacing } = this;
    const m = n - 1;
    for (let i = 0; i < m; i++) {
      const a = i * 3;
      const dx = x[a + 3] - x[a];
      const dy = x[a + 4] - x[a + 1];
      const dz = x[a + 5] - x[a + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-12;
      dir[a] = dx / d;
      dir[a + 1] = dy / d;
      dir[a + 2] = dz / d;
      rhs[i] = spacing - d;
    }
    // Forward sweep. Diagonal w_i + w_i+1; links i and i+1 share particle i+1.
    let prevC = 0;
    let prevD = 0;
    for (let i = 0; i < m; i++) {
      const a = i * 3;
      const off =
        i > 0
          ? -w[i] * (dir[a] * dir[a - 3] + dir[a + 1] * dir[a - 2] + dir[a + 2] * dir[a - 1])
          : 0;
      const den = w[i] + w[i + 1] - off * prevC;
      const up =
        i < m - 1
          ? -w[i + 1] * (dir[a] * dir[a + 3] + dir[a + 1] * dir[a + 4] + dir[a + 2] * dir[a + 5])
          : 0;
      prevC = cp[i] = up / den;
      prevD = lam[i] = (rhs[i] - off * prevD) / den;
    }
    for (let i = m - 2; i >= 0; i--) lam[i] -= cp[i] * lam[i + 1];
    for (let j = 0; j < n; j++) {
      const o = j * 3;
      for (let c = 0; c < 3; c++) {
        let g = 0;
        if (j < m) g -= dir[o + c] * lam[j];
        if (j > 0) g += dir[o - 3 + c] * lam[j - 1];
        x[o + c] += w[j] * g;
      }
    }
  }

  private solveCollisions(): void {
    const { n, x, prev, w, skip } = this;
    const minD = 2 * this.radius;
    // shortcut: O(n²) pair test, fine for ~150 particles; add a spatial hash for much longer ropes.
    for (let a = 0; a < n; a++) {
      const ia = a * 3;
      for (let b = a + skip; b < n; b++) {
        const ib = b * 3;
        const dx = x[ia] - x[ib];
        const dy = x[ia + 1] - x[ib + 1];
        const dz = x[ia + 2] - x[ib + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minD * minD || d2 === 0) continue;
        const wsum = w[a] + w[b];
        if (wsum === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        const pen = minD - d;
        const ka = w[a] / wsum;
        const kb = w[b] / wsum;
        x[ia] += nx * pen * ka;
        x[ia + 1] += ny * pen * ka;
        x[ia + 2] += nz * pen * ka;
        x[ib] -= nx * pen * kb;
        x[ib + 1] -= ny * pen * kb;
        x[ib + 2] -= nz * pen * kb;

        // Friction: cancel relative sliding this substep, up to the Coulomb limit.
        let rx = x[ia] - prev[ia] - (x[ib] - prev[ib]);
        let ry = x[ia + 1] - prev[ia + 1] - (x[ib + 1] - prev[ib + 1]);
        let rz = x[ia + 2] - prev[ia + 2] - (x[ib + 2] - prev[ib + 2]);
        const rn = rx * nx + ry * ny + rz * nz;
        rx -= rn * nx;
        ry -= rn * ny;
        rz -= rn * nz;
        const f = frictionFactor(Math.hypot(rx, ry, rz), pen);
        x[ia] -= rx * f * ka;
        x[ia + 1] -= ry * f * ka;
        x[ia + 2] -= rz * f * ka;
        x[ib] += rx * f * kb;
        x[ib + 1] += ry * f * kb;
        x[ib + 2] += rz * f * kb;
      }
    }
  }

  private solveGround(): void {
    const { n, x, prev, radius } = this;
    for (let a = 0; a < n; a++) {
      const i = a * 3;
      if (x[i + 1] >= radius) continue;
      const pen = radius - x[i + 1];
      x[i + 1] = radius;
      const rx = x[i] - prev[i];
      const rz = x[i + 2] - prev[i + 2];
      const f = frictionFactor(Math.hypot(rx, rz), pen);
      x[i] -= rx * f;
      x[i + 2] -= rz * f;
    }
  }
}

/** Fraction of tangential slide to cancel, given how hard the contact pushed. */
function frictionFactor(slide: number, push: number): number {
  if (slide === 0) return 0;
  return Math.min(1, (FRICTION * push) / slide);
}

/** Smooth path through keys: starts and ends at rest, and stops dead on repeated points (holds). */
export function sampleHermite(times: number[], points: Vec3[], t: number): Vec3 {
  const last = times.length - 1;
  let k = 0;
  while (k < last - 1 && t > times[k + 1]) k++;
  if (last === 0) return [...points[0]];
  const dt = times[k + 1] - times[k];
  const u = dt > 0 ? Math.min(1, Math.max(0, (t - times[k]) / dt)) : 1;
  const m1 = velocity(times, points, k);
  const m2 = velocity(times, points, k + 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const p1 = points[k];
  const p2 = points[k + 1];
  return [0, 1, 2].map(
    (c) => h00 * p1[c] + h10 * dt * m1[c] + h01 * p2[c] + h11 * dt * m2[c],
  ) as Vec3;
}

function velocity(times: number[], points: Vec3[], k: number): Vec3 {
  const last = times.length - 1;
  if (k === 0 || k === last) return [0, 0, 0];
  const [a, p, b] = [points[k - 1], points[k], points[k + 1]];
  if (same(a, p) || same(p, b)) return [0, 0, 0];
  const dt = times[k + 1] - times[k - 1];
  return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
}

function same(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Im and Re of q̄a ⊗ qb, as [x, y, z, w]. */
function relative(qa: Float64Array, a: number, qb: Float64Array, b: number): number[] {
  const [ax, ay, az, aw] = [-qa[a], -qa[a + 1], -qa[a + 2], qa[a + 3]];
  const [bx, by, bz, bw] = [qb[b], qb[b + 1], qb[b + 2], qb[b + 3]];
  return [
    aw * bx + bw * ax + ay * bz - az * by,
    aw * by + bw * ay + az * bx - ax * bz,
    aw * bz + bw * az + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** out[o] += s · q[p] ⊗ (0, v): turns q by a body-frame rotation. */
function addMul(
  out: Float64Array,
  o: number,
  q: Float64Array,
  p: number,
  vx: number,
  vy: number,
  vz: number,
  s: number,
): void {
  const [x, y, z, w] = [q[p], q[p + 1], q[p + 2], q[p + 3]];
  out[o] += s * (w * vx + y * vz - z * vy);
  out[o + 1] += s * (w * vy + z * vx - x * vz);
  out[o + 2] += s * (w * vz + x * vy - y * vx);
  out[o + 3] -= s * (x * vx + y * vy + z * vz);
}

function normalize(q: Float64Array, o: number): void {
  const l = Math.hypot(q[o], q[o + 1], q[o + 2], q[o + 3]);
  q[o] /= l;
  q[o + 1] /= l;
  q[o + 2] /= l;
  q[o + 3] /= l;
}
