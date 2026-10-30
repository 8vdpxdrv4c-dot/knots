import type { KnotDef } from "./types";

// The rope lies along x from -0.6 (standing end) to 0.6 (working end); the camera looks from +z.
// `at` is the fraction along the rope, so a point starts at x = at * 1.2 - 0.6.
const R = 0.012;

export const overhand: KnotDef = {
  id: "overhand",
  name: "Overhand knot",
  summary:
    "The simplest knot and the base of many others. Use it as a stopper at the end of a rope.",
  rope: { length: 1.2, radius: R },
  duration: 7.2,
  steps: [
    { t: 0, title: "Lay the rope out straight" },
    { t: 0.4, title: "Make a loop: bring the working end over the standing part" },
    { t: 2.5, title: "Tuck the end under and up through the loop" },
    { t: 4.2, title: "Pull both ends to tighten" },
    { t: 6.2, title: "Done: an overhand knot" },
  ],
  guides: [
    // Phase 1: lift the working half into a loop that crosses over the standing part at x = -0.08.
    { at: 0.5, grab: 0.4, path: [{ t: 4.0 }] },
    {
      at: 0.554,
      grab: 0.5,
      path: [{ t: 1.3, p: [0.04, 0.03, 0.04] }, { t: 1.9, p: [0.03, R, 0.045] }, { t: 2.4 }],
    },
    {
      at: 0.665,
      grab: 0.6,
      path: [{ t: 1.4, p: [-0.02, 0.07, 0.13] }, { t: 2.0, p: [-0.035, R, 0.13] }, { t: 3.6 }],
    },
    {
      at: 0.775,
      grab: 0.7,
      path: [{ t: 1.5, p: [-0.1, 0.07, 0.08] }, { t: 2.1, p: [-0.11, R, 0.065] }, { t: 2.4 }],
    },
    {
      at: 1,
      grab: 0.4,
      path: [
        { t: 1.0, p: [0.32, 0.09, 0.14] },
        { t: 1.6, p: [0.02, 0.1, 0.13] },
        { t: 2.0, p: [-0.08, 0.07, 0.0] },
        { t: 2.3, p: [-0.07, 0.03, -0.1] },
        { t: 2.5, p: [-0.06, R, -0.14] },
      ],
    },

    // Phase 2: lift the standing part inside the loop, and pass the end under it and up through.
    {
      at: 0.467,
      grab: 2.5,
      path: [{ t: 2.8, p: [-0.04, 0.065, 0] }, { t: 3.6 }, { t: 3.9, p: [-0.04, R, 0] }],
    },
    {
      at: 1,
      grab: 2.5,
      path: [
        { t: 2.85, p: [-0.04, R, -0.07] },
        { t: 3.15, p: [-0.04, R, 0.0] },
        { t: 3.35, p: [-0.04, R, 0.045] },
        { t: 3.65, p: [-0.03, 0.12, 0.05] },
        { t: 3.95, p: [0.08, 0.12, 0.03] },
        { t: 4.2, p: [0.2, 0.06, 0.0] },
      ],
    },

    // Phase 3: pull both ends hard, so the knot cinches: thick stiff rope takes a couple of hundred newtons.
    {
      at: 0,
      grab: 4.2,
      compliance: 0.001,
      force: 250,
      path: [{ t: 5.4, p: [-0.65, 0.04, 0] }, { t: 6.2 }],
    },
    {
      at: 1,
      grab: 4.2,
      compliance: 0.001,
      force: 250,
      path: [{ t: 5.4, p: [0.65, 0.04, 0] }, { t: 6.2 }],
    },
  ],
};
