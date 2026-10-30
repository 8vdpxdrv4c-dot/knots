import type { Guide, KnotDef, Vec3 } from "../knots/types";

/** Frames per second of the baked timeline. */
export const FPS = 60;
const SUBSTEPS = 24;
const H = 1 / (FPS * SUBSTEPS);
const GRAVITY = 9.81;
const ROPE_MASS = 0.35; // kg: 1.2 m of 24 mm laid rope
const BEND_STIFFNESS = 0.004; // N·m²: stiffer makes the rope shake and the knot crawl along it
const FRICTION = 0.6; // one coefficient for sticking and sliding, so contacts never stick-slip and judder
const AIR_DAMPING = 2; // 1/s
// Fraction of each particle's velocity pulled toward its neighbours' every substep: internal
// friction that kills wobble along the rope without slowing the rope as a whole.
const INTERNAL_DAMPING = 0.02;
// Guides are stiff springs, never hard pins, so a guide that asks for more rope than exists lags instead of stretching it.
const GUIDE_COMPLIANCE = 2.5e-4;
const RELEASE = 0.3; // seconds a guide takes to let go
const GUIDE_MAX_FORCE = 5; // N: enough to move a free end, not to drag the rope across the table

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
 * Rope as a chain of particles solved with small-step XPBD: stretch, bending,
 * self-collision with Coulomb friction, and a table with friction. Deterministic.
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

    this.solveGuides();
    // Sweep both ways so tension travels the whole chain in one substep.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n - 1; i++) this.solveLink(i, i + 1, this.spacing, 0);
      for (let i = n - 2; i >= 0; i--) this.solveLink(i, i + 1, this.spacing, 0);
    }
    // Alternate direction every substep: a one-way sweep biases tight bends into pushing rope
    // along itself, which reels the rope through a knot.
    if (this.flip) for (let i = n - 2; i >= 1; i--) this.solveBend(i);
    else for (let i = 1; i < n - 1; i++) this.solveBend(i);
    this.flip = !this.flip;
    // Two contact passes: one leaves visible overlap where several strands press together.
    this.solveCollisions();
    this.solveCollisions();
    this.solveGround();

    for (let i = 0; i < n * 3; i++) v[i] = (x[i] - prev[i]) / H;
    for (let i = 3; i < n * 3 - 3; i++)
      v[i] += INTERNAL_DAMPING * ((v[i - 3] + v[i + 3]) / 2 - v[i]);
  }

  /** Curvature at particle i: pulls it toward the midpoint of its neighbours (XPBD, from EI). */
  private solveBend(i: number): void {
    const { x, w } = this;
    const a = (i - 1) * 3;
    const b = i * 3;
    const c = (i + 1) * 3;
    const dx = (x[a] + x[c]) / 2 - x[b];
    const dy = (x[a + 1] + x[c + 1]) / 2 - x[b + 1];
    const dz = (x[a + 2] + x[c + 2]) / 2 - x[b + 2];
    const C = Math.hypot(dx, dy, dz);
    if (C < 1e-12) return;
    // Energy EI/2·κ²·ds with κ = 2C/ds² gives compliance ds³ / (4·EI).
    const alpha = this.spacing ** 3 / (4 * BEND_STIFFNESS) / (H * H);
    const wb = w[i];
    const wsum = wb + 0.25 * (w[i - 1] + w[i + 1]);
    const s = C / (wsum + alpha);
    const nx = dx / C;
    const ny = dy / C;
    const nz = dz / C;
    x[b] += nx * s * wb;
    x[b + 1] += ny * s * wb;
    x[b + 2] += nz * s * wb;
    for (const [o, wi] of [
      [a, w[i - 1]],
      [c, w[i + 1]],
    ]) {
      x[o] -= nx * s * wi * 0.5;
      x[o + 1] -= ny * s * wi * 0.5;
      x[o + 2] -= nz * s * wi * 0.5;
    }
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
    const { x, w } = this;
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
      const reach = GUIDE_MAX_FORCE * w[g.index] * H * H;
      const step = Math.hypot(dx, dy, dz) * k;
      if (step > reach) k *= reach / step;
      x[i] += dx * k;
      x[i + 1] += dy * k;
      x[i + 2] += dz * k;
    }
  }

  private solveLink(a: number, b: number, rest: number, compliance: number): void {
    const { x, w } = this;
    const wsum = w[a] + w[b] + compliance / (H * H);
    if (wsum === 0) return;
    const ia = a * 3;
    const ib = b * 3;
    const dx = x[ia] - x[ib];
    const dy = x[ia + 1] - x[ib + 1];
    const dz = x[ia + 2] - x[ib + 2];
    const d = Math.hypot(dx, dy, dz);
    if (d === 0) return;
    const s = (d - rest) / (d * wsum);
    x[ia] -= dx * s * w[a];
    x[ia + 1] -= dy * s * w[a];
    x[ia + 2] -= dz * s * w[a];
    x[ib] += dx * s * w[b];
    x[ib + 1] += dy * s * w[b];
    x[ib + 2] += dz * s * w[b];
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
