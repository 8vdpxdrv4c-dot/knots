# Knots Made Easy

Vite + TypeScript + vanilla three.js app that animates knot tying. No UI framework, no physics library. The rope is simulated, not keyframed: invisible "guide" pins pull points of the rope along authored paths and physics does the rest (sagging, friction, collisions, cinching).

## Start here: what are you changing?

| Task | Read first | Don't need |
| --- | --- | --- |
| Add or tune a knot | `knots/types.ts`, `knots/overhand.ts` (template), `knots/index.ts` | sim, render |
| Rope physics (stiffness, contact, friction, guides) | `sim/rope.ts`, `sim/rope.test.ts`, "Gotchas" below | render, ui |
| Ropes, props or other engine features | "Multi-rope layout" below, `sim/rope.ts`, `sim/bake.ts`, `timeline.ts`, `main.ts` | ropeMesh internals |
| How rope looks (strands, ends, shading, props, lights) | `render/ropeMesh.ts`, `render/ropeMaterial.ts`, `render/stage.ts` | sim |
| Twist along the rope / normals | `sim/frames.ts`, strand-twist test in `knots/knots.test.ts` | rest of sim |
| Player UI (buttons, scrubber, steps) | `ui/controls.ts`, `index.html`, `src/style.css`, `main.ts` | sim, render |
| A failing knot test | `knots/knots.test.ts` (what each test asserts), then the knot's guides | render |

Run `pnpm test` after anything in `sim/` or `knots/`; nothing else needs the long bake. Look at rendering changes in the browser (`pnpm dev`), since no test covers how it looks.

## Commands

- `pnpm dev` – dev server (`.claude/launch.json` uses port 5173)
- `pnpm test` – vitest (sim + knot tests; bakes real knots, takes ~10 s)
- `pnpm build` – `tsc --noEmit && vite build`
- `pnpm lint` (oxlint), `pnpm format` (oxfmt), `pnpm test:e2e` (Playwright smoke test in `e2e/`, dev server on 5174)

All of tests, `tsc --noEmit`, oxlint and oxfmt must pass before committing.

## How it is wired

```
knots/*.ts (KnotDef data)
   │  main.ts picks one via ?knot=<id> (default: first in knots/index.ts)
   ▼
Timeline (src/timeline.ts) ── posts KnotDef to ──▶ sim/worker.ts ──▶ sim/bake.ts
   ▲  holds all baked frames; sample(t) blends        │ RopeSim.step() per frame (60 fps)
   │  neighbouring frames                              │ MaterialFrames per rope → normals
   └──────── chunks of {frames, normals} ◀─────────────┘
main.ts render loop → RopeMesh.update(positions, normals) per rope → stage.render()
ui/controls.ts: play/pause, scrub, speed, loop, step ticks (reads KnotDef.steps)
```

Frames are baked in a Web Worker while the user watches; playback waits at the edge of what is baked. Playback and scrubbing only read baked frames, so the sim never runs on the main thread.

### Files

- `src/knots/types.ts` – the data model: `KnotDef` (`ropes[]`, optional `props[]`, `guides[]`, `steps[]`, `duration`), `RopeDef` (length, radius, `start` polyline), `Prop` (capsule/cylinder), `Guide` (`rope?`, `at` = fraction along that rope, `grab` time, `path` keys, optional `compliance`/`force`).
- `src/knots/overhand.ts` – the only real knot; a good template. `src/knots/index.ts` lists knots in menu order.
- `src/sim/rope.ts` – `RopeSim`: position-based Cosserat rod, small-step XPBD (24 substeps per frame). Per substep: guides, bend/twist, stretch/shear, then rounds of (tridiagonal direct length solve + self/rope-rope collision), then table and prop contact. Deterministic. Also `sampleHermite` (guide paths) and `particleCount`.
- `src/sim/bake.ts` – runs a whole knot, emits chunks of frames/normals. `src/sim/frames.ts` – `MaterialFrames`: per-rope parallel-transported normals so rope twist stays with the material.
- `src/timeline.ts` – main-thread frame store, `counts` per rope, `sample(time)`.
- `src/render/ropeMesh.ts` – three-strand laid-rope geometry rebuilt around the centreline every frame, plus cut ends/sleeves. `ropeMaterial.ts` – rope material and textures. `stage.ts` – renderer, camera, lights, table, and `createPropMesh`.
- `src/ui/controls.ts` – DOM controls; `index.html` + `src/style.css` hold the markup/styles.

### Multi-rope layout (important when touching the sim)

All ropes live in one particle array and one segment array, one rope after another. Segment `j` joins particles `j` and `j+1` unless `end[j]` marks `j` as the last particle of its rope (a break). Stretch, bend/twist, the length solve, velocity smoothing and the collision `skip` rule must never cross a break. Baked frames hold all ropes back to back; `Timeline.counts[k]` gives each rope's slice, and `main.ts` gives each `RopeMesh` its slice via `subarray`. Radius, spacing and mass are per particle/segment.

Props are static: `solveProps` pushes particles out and applies friction, once per substep after the table. A particle exactly on a prop's core is skipped.

## Adding a knot

Data only: write a `KnotDef` in `src/knots/`, add it to `knots/index.ts`. Do not add knot-specific code to the engine. Guide `at` is a fraction along its rope; the table is at y = 0, ropes rest at y = radius; the camera looks from +z. Every knot in the list is run through `src/knots/knots.test.ts`, which assumes **one rope** and a knot that ties and cinches; a multi-rope knot needs its own tests.

## Gotchas

- Physics constants in `rope.ts` were tuned with metrics sweeps; change them deliberately and re-run the full tests. The existing overhand must keep baking bit-identically unless a change is intended.
- Rope-vs-prop and rope-vs-rope no-pass-through tests live in `src/sim/rope.test.ts` (a test knot with two ropes and a pole). `RopeMesh` contact shading only considers its own rope.
- `RopeDef.start` must be about as long as `length` (the constructor throws otherwise).
- Collision is an O(n²) pair test: fine for a few hundred particles, add a spatial hash for much more.
