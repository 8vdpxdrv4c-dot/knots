// Renders a knot as a film, frame by frame, with the real rope: a scripted camera, step captions and
// a title. Driven by film.mjs, which asks for each frame through window.renderFrame(i). Time here is
// the film's own clock, not the wall clock, so every frame is drawn exactly as asked.
import * as THREE from "three";
import { knots } from "../src/engine/knots";
import { Timeline } from "../src/engine/playback/timeline";
import { createRopeMaterial } from "../src/engine/render/ropeMaterial";
import { RopeMesh } from "../src/engine/render/ropeMesh";
import { createPropMesh, createStage } from "../src/engine/render/stage";

const q = new URLSearchParams(location.search);
const knot = knots.find((k) => k.id === q.get("knot"))!;
const W = Number(q.get("w") ?? 1920);
const H = Number(q.get("h") ?? 1080);
const FPS = Number(q.get("fps") ?? 30);
// Three cuts: "full" is the whole tutorial with step captions; "hands" is a fast, captionless run
// that shows the invisible hands doing the pulling (the rope is simulated, nothing is keyframed);
// "cinch" is just the last pull, close up, for a short satisfying loop.
const CUT = q.get("cut") ?? "full";
const SPEED = Number(q.get("speed") ?? { full: 1, hands: 1.8, cinch: 1 }[CUT]); // sim s per film s
const LEAD = { full: 0.8, hands: 0.3, cinch: 0.3 }[CUT]!; // film seconds at the start pose
const HOLD = Number(q.get("hold") ?? { full: 3.2, hands: 1.8, cinch: 1.8 }[CUT]); // on the finished knot

const canvas = document.getElementById("gl") as HTMLCanvasElement;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const stage = createStage(canvas);
stage.controls.enabled = false;

const timeline = new Timeline(knot, () => {});
const anisotropy = stage.renderer.capabilities.getMaxAnisotropy();
const materials = new Map<string, THREE.Material>();
const ropes = knot.ropes.map((def, k) => {
  const color = def.color ?? "#c39f6a";
  if (!materials.has(color)) materials.set(color, createRopeMaterial(color, anisotropy));
  const mesh = new RopeMesh(timeline.counts[k], def, materials.get(color)!);
  stage.scene.add(mesh);
  return mesh;
});
for (const prop of knot.props ?? []) stage.scene.add(createPropMesh(prop));

// The cinch cut starts a moment before the last pull; the others start at the beginning.
const simStart = CUT === "cinch" ? Math.max(0, knot.steps[knot.steps.length - 2].t - 1) : 0;
const tieEnd = LEAD + (timeline.duration - simStart) / SPEED;
const total = tieEnd + HOLD;
const frames = Math.round(total * FPS);

// Camera keys: [film time, azimuth°, elevation°, distance m]. Slow drift while tying, a push in as
// it cinches, then a low, closer orbit over the finished knot.
const keys: [number, number, number, number][] =
  CUT === "cinch"
    ? [
        [0, -14, 37, 0.46],
        [tieEnd, 12, 31, 0.38],
        [total, 24, 28, 0.35],
      ]
    : [
        [0, -22, 36, 0.82],
        [tieEnd * 0.5, 2, 42, 0.68],
        [tieEnd, 12, 39, 0.6],
        [total, 34, 31, 0.55],
      ];
const ramp = (x: number) => Math.min(Math.max(x, 0), 1);
const home = new THREE.Vector3(0.02, 0.02, 0.04); // the cinch cut moves this onto the knot
const target = home.clone();

/** Where the finished rope is thickest: the knot itself, which the camera settles on at the end. */
function knotCentre() {
  const p = timeline.sample(timeline.duration).positions;
  const n = p.length / 3;
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < n; i++) {
    let count = 0;
    for (let j = 0; j < n; j++) {
      const dx = p[3 * i] - p[3 * j];
      const dz = p[3 * i + 2] - p[3 * j + 2];
      if (dx * dx + dz * dz < 0.05 * 0.05) count++;
    }
    if (count > bestCount) [best, bestCount] = [i, count];
  }
  return new THREE.Vector3(p[3 * best], 0.02, p[3 * best + 2]);
}

/** Cardinal-spline value of key column `c` at film time `t`, so the camera never stops at a key. */
function along(t: number, c: 1 | 2 | 3) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const [t0, ...a] = keys[i];
  const [t1, ...b] = keys[i + 1];
  const slope = (j: number) => {
    const lo = keys[Math.max(j - 1, 0)];
    const hi = keys[Math.min(j + 1, keys.length - 1)];
    const dt = hi[0] - lo[0];
    // End keys ease in and out; inner keys carry the camera through.
    return j === 0 || j === keys.length - 1 ? 0 : (hi[c] - lo[c]) / dt;
  };
  const h = t1 - t0;
  const s = Math.min(Math.max((t - t0) / h, 0), 1);
  const [p0, p1] = [a[c - 1], b[c - 1]];
  const [m0, m1] = [slope(i) * h, slope(i + 1) * h];
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1
  );
}

let centre = home;
const smooth = (x: number) => x * x * (3 - 2 * x);

function placeCamera(t: number) {
  // Drift from the table's middle onto the knot while it cinches and through the closing shot.
  target.lerpVectors(home, centre, smooth(ramp((t - tieEnd * 0.6) / (total - tieEnd * 0.6))));
  const az = (along(t, 1) * Math.PI) / 180;
  const el = (along(t, 2) * Math.PI) / 180;
  const d = along(t, 3);
  stage.camera.position.set(
    target.x + d * Math.sin(az) * Math.cos(el),
    target.y + d * Math.sin(el),
    target.z + d * Math.cos(az) * Math.cos(el),
  );
  stage.camera.lookAt(target);
}

const out = document.createElement("canvas");
out.width = W;
out.height = H;
const ctx = out.getContext("2d")!;
const INK = "#23201c";
const MUTED = "#6d665c";
const ACCENT = "#b9522c";
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const offsets = knot.ropes.map((_, k) => timeline.counts.slice(0, k).reduce((a, b) => a + b, 0));
const dot = new THREE.Vector3();

/** A soft glowing dot on every point of rope a guide is holding at `sim`. */
function drawHands(sim: number, positions: Float32Array, u: number) {
  for (const g of knot.guides) {
    const end = g.path[g.path.length - 1].t;
    if (sim < g.grab || sim > end) continue;
    const rope = g.rope ?? 0;
    const i = offsets[rope] + Math.round(g.at * (timeline.counts[rope] - 1));
    dot.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]).project(stage.camera);
    const x = ((dot.x + 1) / 2) * W;
    const y = ((1 - dot.y) / 2) * H;
    // Fades in as the hand closes and out as it lets go.
    const alpha = ramp((sim - g.grab) / 0.2) * ramp((end - sim) / 0.3);
    const r = 28 * u;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, `rgba(185,82,44,${0.7 * alpha})`);
    glow.addColorStop(1, "rgba(185,82,44,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    ctx.strokeStyle = `rgba(255,253,249,${0.95 * alpha})`;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function overlay(v: number, sim: number, positions: Float32Array) {
  // A soft vignette pulls the eye to the middle.
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
  g.addColorStop(0, "rgba(70,50,30,0)");
  g.addColorStop(1, "rgba(70,50,30,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const u = H / 1080;
  const done = v >= tieEnd;
  ctx.textBaseline = "alphabetic";
  if (CUT === "hands") drawHands(sim, positions, u);
  const address = () => {
    ctx.globalAlpha = ramp((v - tieEnd - 0.4) / 0.6);
    ctx.fillStyle = INK;
    ctx.font = `600 ${38 * u}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("knots-made-easy.pages.dev", W / 2, H - 70 * u);
    ctx.textAlign = "left";
  };

  if (CUT === "hands") {
    ctx.globalAlpha = ramp((v - 0.1) / 0.4);
    ctx.fillStyle = ACCENT;
    ctx.font = `600 ${22 * u}px ${FONT}`;
    ctx.letterSpacing = `${2.2 * u}px`;
    ctx.fillText(`${knot.name.toUpperCase()} · SIMULATED ROPE`, 72 * u, 96 * u);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = INK;
    ctx.font = `650 ${84 * u}px ${FONT}`;
    ctx.fillText("No keyframes.", 72 * u, 186 * u);
    ctx.fillStyle = MUTED;
    ctx.font = `500 ${34 * u}px ${FONT}`;
    ctx.fillText("Invisible hands pull. Physics does the rest.", 72 * u, 236 * u);
    ctx.globalAlpha = 1;
    if (done) address();
  } else if (CUT === "cinch") {
    ctx.globalAlpha = ramp((v - 0.1) / 0.4);
    ctx.fillStyle = INK;
    ctx.font = `650 ${44 * u}px ${FONT}`;
    ctx.fillText(knot.name, 72 * u, H - 72 * u);
    ctx.globalAlpha = 1;
    if (done) address();
  } else {
    // Title, top left.
    ctx.globalAlpha = ramp((v - 0.2) / 0.7);
    ctx.fillStyle = ACCENT;
    ctx.font = `600 ${22 * u}px ${FONT}`;
    ctx.letterSpacing = `${2.2 * u}px`;
    ctx.fillText("KNOTS MADE EASY", 72 * u, 96 * u);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = INK;
    ctx.font = `650 ${72 * u}px ${FONT}`;
    ctx.fillText(knot.name, 72 * u, 176 * u);

    // The step being tied, bottom centre; the address replaces it on the finished knot.
    ctx.textAlign = "center";
    const steps = knot.steps;
    let i = 0;
    while (i < steps.length - 1 && sim >= steps[i + 1].t) i++;
    if (!done) {
      const next = steps[i + 1]?.t ?? Infinity;
      ctx.globalAlpha = ramp((sim - steps[i].t + 0.3) / 0.4) * ramp((next - sim) / 0.3 + 0.1);
      ctx.fillStyle = MUTED;
      ctx.font = `600 ${24 * u}px ${FONT}`;
      ctx.fillText(`${i + 1} / ${steps.length}`, W / 2, H - 120 * u);
      ctx.fillStyle = INK;
      ctx.font = `560 ${40 * u}px ${FONT}`;
      ctx.fillText(steps[i].title, W / 2, H - 70 * u);
    } else address();
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }
}

while (timeline.ready < timeline.duration) await new Promise((r) => setTimeout(r, 100));
centre = knotCentre();
if (CUT === "cinch") home.copy(centre); // close up from the first frame

Object.assign(window, {
  film: { frames, fps: FPS, seconds: total },
  renderFrame(i: number) {
    const v = i / FPS;
    const sim = Math.min(simStart + Math.max((v - LEAD) * SPEED, 0), timeline.duration);
    const { positions, normals } = timeline.sample(sim);
    let o = 0;
    ropes.forEach((rope, k) => {
      const end = o + timeline.counts[k] * 3;
      rope.update(positions.subarray(o, end), normals.subarray(o, end));
      o = end;
    });
    placeCamera(v);
    stage.renderer.render(stage.scene, stage.camera);
    ctx.globalAlpha = 1; // a fade left over from the last frame would blend it into this one
    ctx.drawImage(canvas, 0, 0, W, H);
    overlay(v, sim, positions);
    return out.toDataURL("image/jpeg", 0.96);
  },
});
