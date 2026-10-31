import { describe, expect, test } from "vitest";
import type { KnotDef, Prop } from "../knots/types";
import { RopeSim, sampleHermite } from "./rope";

const still: KnotDef = {
  id: "still",
  name: "Still",
  summary: "",
  ropes: [
    {
      length: 0.5,
      radius: 0.01,
      start: [
        [-0.25, 0.01, 0],
        [0.25, 0.01, 0],
      ],
    },
  ],
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
    expect(closest).toBeGreaterThan(1.8 * 0.01);
  });
});

describe.each(["cylinder", "capsule"] as const)("two ropes and a %s pole", (kind) => {
  const r = 0.01;
  const pole: Prop = { kind, a: [0.1, 0.0, 0.12], b: [0.1, 0.15, 0.12], radius: 0.02 };
  const knot: KnotDef = {
    ...still,
    duration: 2.5,
    ropes: [
      // Lies along x on the table.
      {
        length: 0.6,
        radius: r,
        start: [
          [-0.3, r, 0],
          [0.3, r, 0],
        ],
      },
      // Starts above the first rope, bent at one end, and drops across it.
      {
        length: 0.5,
        radius: r,
        start: [
          [-0.15, 0.06, -0.2],
          [-0.15, 0.06, 0.15],
          [-0.15, 0.06, 0.3],
        ],
      },
    ],
    props: [pole],
    // The first rope's end is dragged straight through the pole.
    guides: [
      {
        rope: 0,
        at: 1,
        grab: 0.6,
        path: [
          { t: 1.0, p: [0.3, r, 0.12] },
          { t: 2.0, p: [0, r, 0.12] },
        ],
      },
    ],
  };
  const sim = new RopeSim(knot);
  const [a, b] = sim.ropes;
  let ropeGap = Infinity;
  let poleGap = Infinity;
  let crossing = Infinity; // how far the dropped rope ends above the first at the crossing
  for (let f = 0; f < 150; f++) {
    sim.step();
    for (let i = a.start; i < a.start + a.count; i++) {
      for (let j = b.start; j < b.start + b.count; j++)
        ropeGap = Math.min(
          ropeGap,
          Math.hypot(...[0, 1, 2].map((c) => sim.x[i * 3 + c] - sim.x[j * 3 + c])),
        );
    }
    for (let i = 0; i < sim.n; i++) {
      // Distance to the pole's axis, for particles beside it.
      const h = sim.x[i * 3 + 1];
      if (h > 0 && h < 0.15)
        poleGap = Math.min(poleGap, Math.hypot(sim.x[i * 3] - 0.1, sim.x[i * 3 + 2] - 0.12));
    }
  }
  for (let j = b.start; j < b.start + b.count; j++)
    if (Math.abs(sim.x[j * 3] + 0.15) < 0.01 && Math.abs(sim.x[j * 3 + 2]) < 0.02)
      crossing = Math.min(crossing, sim.x[j * 3 + 1]);

  test("the dropped rope rests on the other without passing through", () => {
    expect(ropeGap).toBeGreaterThan(1.8 * r); // centres stay a diameter apart
    expect(ropeGap).toBeLessThan(2.4 * r); // and they did touch
    expect(crossing).toBeGreaterThan(2.5 * r); // still above the first rope at the crossing
  });

  test("a rope dragged at the pole is stopped by it", () => {
    expect(poleGap).toBeGreaterThan(0.99 * (pole.radius + r));
    expect(poleGap).toBeLessThan(pole.radius + 1.3 * r); // it did press on it
  });

  test("ropes keep their own length", () => {
    for (const [rope, def] of [
      [a, knot.ropes[0]],
      [b, knot.ropes[1]],
    ] as const) {
      const last = (rope.start + rope.count - 1) * 3;
      let len = 0;
      for (let i = rope.start * 3; i < last; i += 3)
        len += Math.hypot(...[0, 1, 2].map((c) => sim.x[i + 3 + c] - sim.x[i + c]));
      expect(len / def.length).toBeCloseTo(1, 1);
    }
  });
});
