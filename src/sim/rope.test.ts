import { describe, expect, test } from "vitest";
import type { KnotDef } from "../knots/types";
import { RopeSim, sampleHermite } from "./rope";

const still: KnotDef = {
  id: "still",
  name: "Still",
  summary: "",
  rope: { length: 0.5, radius: 0.01 },
  duration: 1,
  steps: [],
  guides: [],
};

describe("sampleHermite", () => {
  test("passes through every key and holds still on repeated points", () => {
    const times = [0, 1, 2, 3];
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 0],
      [2, 1, 0],
    ];
    for (let k = 0; k < times.length; k++)
      expect(sampleHermite(times, pts, times[k])).toEqual(pts[k]);
    expect(sampleHermite(times, pts, 1.5)).toEqual([1, 0, 0]);
  });
});

describe("RopeSim", () => {
  test("a rope lying on the table stays put and keeps its length", () => {
    const sim = new RopeSim(still);
    const before = sim.x.slice();
    for (let f = 0; f < 60; f++) sim.step();
    for (let i = 0; i < sim.x.length; i++) expect(sim.x[i]).toBeCloseTo(before[i], 4);
  });

  test("is deterministic", () => {
    const knot: KnotDef = {
      ...still,
      guides: [{ at: 1, grab: 0, path: [{ t: 0.5, p: [0, 0.2, 0.1] }] }],
    };
    const a = new RopeSim(knot);
    const b = new RopeSim(knot);
    for (let f = 0; f < 40; f++) {
      a.step();
      b.step();
    }
    expect(a.x).toEqual(b.x);
  });

  test("rope dropped onto itself does not pass through", () => {
    // Lift the end high over the middle and let go. It may land on top or spring off, but no two
    // distant parts of the rope may ever overlap on the way.
    const knot: KnotDef = {
      ...still,
      guides: [
        {
          at: 1,
          grab: 0,
          path: [
            { t: 0.4, p: [0.02, 0.15, 0] },
            { t: 0.5, p: [0, 0.1, 0] },
          ],
        },
      ],
    };
    const sim = new RopeSim(knot);
    let closest = Infinity;
    for (let f = 0; f < 90; f++) {
      sim.step();
      for (let i = 0; i < sim.n; i++)
        for (let j = i + 8; j < sim.n; j++) {
          const d = Math.hypot(
            sim.x[i * 3] - sim.x[j * 3],
            sim.x[i * 3 + 1] - sim.x[j * 3 + 1],
            sim.x[i * 3 + 2] - sim.x[j * 3 + 2],
          );
          closest = Math.min(closest, d);
        }
    }
    // Contact keeps centres a diameter (2r) apart; well under that means rope passed through rope.
    expect(closest).toBeGreaterThan(1.8 * sim.radius);
  });
});
