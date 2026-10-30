import { describe, expect, test } from "vitest";
import { bake, frameCount } from "../sim/bake";
import { particleCount } from "../sim/rope";
import { knots } from ".";

describe.each(knots)("$name", (knot) => {
  const n = particleCount(knot.rope);
  const total = frameCount(knot);
  const all = new Float32Array(total * n * 3);
  bake(knot, (c) => all.set(c.frames, c.start * n * 3));
  const spacing = knot.rope.length / (n - 1);
  const endDistance = (f: number) => {
    const a = f * n * 3;
    const b = a + (n - 1) * 3;
    return Math.hypot(all[a] - all[b], all[a + 1] - all[b + 1], all[a + 2] - all[b + 2]);
  };
  /** First and last particle touching distant rope in frame f: the stretch of rope inside the knot. */
  const knotRange = (f: number) => {
    const a = f * n * 3;
    let lo = n;
    let hi = -1;
    for (let i = 0; i < n; i++)
      for (let j = i + 4; j < n; j++) {
        const d = Math.hypot(
          all[a + i * 3] - all[a + j * 3],
          all[a + i * 3 + 1] - all[a + j * 3 + 1],
          all[a + i * 3 + 2] - all[a + j * 3 + 2],
        );
        if (d < 2.6 * knot.rope.radius) {
          lo = Math.min(lo, i);
          hi = Math.max(hi, j);
        }
      }
    return [lo, hi];
  };

  test("stays finite and never overstretches", () => {
    expect(all.every(Number.isFinite)).toBe(true);
    let worst = 0;
    for (let f = 0; f < total; f++)
      for (let i = 0; i < n - 1; i++) {
        const a = f * n * 3 + i * 3;
        worst = Math.max(
          worst,
          Math.hypot(all[a] - all[a + 3], all[a + 1] - all[a + 4], all[a + 2] - all[a + 5]),
        );
      }
    expect(worst / spacing).toBeLessThan(1.5);
  });

  test("ties: pulled ends stay well short of the rope length", () => {
    // An untied rope pulled from both ends straightens to nearly its full length.
    let widest = 0;
    for (let f = Math.floor(total * 0.6); f < total; f++) widest = Math.max(widest, endDistance(f));
    expect(widest).toBeLessThan(0.9 * knot.rope.length);
  });

  test("cinches: little rope is left inside the knot at the end", () => {
    // An open loop keeps most of the rope inside the knot.
    const [lo, hi] = knotRange(total - 1);
    expect(hi).toBeGreaterThan(lo);
    // A loose knot with an open eye keeps about 0.4 of the rope in it; a cinched one about 0.28.
    expect((hi - lo) * spacing).toBeLessThan(0.32 * knot.rope.length);
  });

  test("the knot stays where it was tied while it is pulled tight", () => {
    // Hands pull away from the knot from both sides; the knot sliding along the table means one
    // side is pulled harder or further than the other.
    const centre = (f: number) => {
      const [lo, hi] = knotRange(f);
      let x = 0;
      let z = 0;
      for (let i = lo; i <= hi; i++) {
        x += all[f * n * 3 + i * 3];
        z += all[f * n * 3 + i * 3 + 2];
      }
      return [x / (hi - lo + 1), z / (hi - lo + 1)];
    };
    const [x0, z0] = centre(Math.floor(total * 0.6));
    const [x1, z1] = centre(total - 1);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeLessThan(6 * knot.rope.radius);
  });

  test("rope never passes through rope, even under the hardest pull", () => {
    let closest = Infinity;
    for (let f = 0; f < total; f++)
      for (let i = 0; i < n; i++)
        for (let j = i + 8; j < n; j++) {
          const a = f * n * 3 + i * 3;
          const b = f * n * 3 + j * 3;
          closest = Math.min(
            closest,
            Math.hypot(all[a] - all[b], all[a + 1] - all[b + 1], all[a + 2] - all[b + 2]),
          );
        }
    // Contact keeps centres a diameter (2r) apart; well under that means one strand went through another.
    expect(closest).toBeGreaterThan(1.5 * knot.rope.radius);
  });

  test("steps are in time order and inside the timeline", () => {
    const ts = knot.steps.map((s) => s.t);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(ts.every((t) => t >= 0 && t <= knot.duration)).toBe(true);
  });
});

describe.each(knots)("$name strand twist", (knot) => {
  test("material normals stay square to the rope and twist smoothly along it", () => {
    const n = particleCount(knot.rope);
    let worstDot = 0;
    let worstTwist = 0;
    let worstSmoothTwist = 0;
    bake(knot, ({ frames, normals }) => {
      const tangent = (o: number) => {
        const a = Math.max(o - 3, 0);
        const b = Math.min(o + 3, frames.length - 3);
        const v = [0, 1, 2].map((c) => frames[b + c] - frames[a + c]);
        const l = Math.hypot(...v);
        return v.map((x) => x / l);
      };
      for (let f = 0; f < frames.length / (n * 3); f++)
        for (let i = 2; i < n - 1; i++) {
          const o = f * n * 3 + i * 3;
          const t = tangent(o);
          const tp = tangent(o - 3);
          const nn = [normals[o], normals[o + 1], normals[o + 2]];
          worstDot = Math.max(worstDot, Math.abs(t[0] * nn[0] + t[1] * nn[1] + t[2] * nn[2]));
          // Turn the previous normal by the bend (tp -> t); what angle is left is twist.
          const ax = [
            tp[1] * t[2] - tp[2] * t[1],
            tp[2] * t[0] - tp[0] * t[2],
            tp[0] * t[1] - tp[1] * t[0],
          ];
          const sin = Math.hypot(...ax);
          const cos = tp[0] * t[0] + tp[1] * t[1] + tp[2] * t[2];
          let p = [normals[o - 3], normals[o - 2], normals[o - 1]];
          if (sin > 1e-9) {
            const k = ax.map((x) => x / sin);
            const kd = (k[0] * p[0] + k[1] * p[1] + k[2] * p[2]) * (1 - cos);
            const kp = [
              k[1] * p[2] - k[2] * p[1],
              k[2] * p[0] - k[0] * p[2],
              k[0] * p[1] - k[1] * p[0],
            ];
            p = p.map((x, j) => x * cos + kp[j] * sin + k[j] * kd);
          }
          const c = p[0] * nn[0] + p[1] * nn[1] + p[2] * nn[2];
          const twist = Math.acos(Math.min(1, Math.max(-1, c)));
          worstTwist = Math.max(worstTwist, twist);
          // Sharp pinches under a guide (> 15° per segment) are exempt from the tight limit.
          if (cos > Math.cos(Math.PI / 12)) worstSmoothTwist = Math.max(worstSmoothTwist, twist);
        }
    });
    expect(worstDot).toBeLessThan(0.05);
    // Neighbouring particles twist less than 10° apart, so strands never look loosened.
    expect(worstSmoothTwist).toBeLessThan(Math.PI / 18);
    expect(worstTwist).toBeLessThan(Math.PI / 6);
  });
});
