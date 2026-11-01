// Renders the stargazer rope's pictures with the real rope: a straight strip that tiles along the
// rope, the rope's end, and each single-rope knot finished. Top view, transparent background, at PX pixels per
// rope diameter. Driven by stargazer-sprites.mjs, which saves window.sprites to public/stargazers/.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { figureEight } from "../src/engine/knots/figure-eight";
import { overhand } from "../src/engine/knots/overhand";
import type { KnotDef, RopeDef } from "../src/engine/knots/types";
import { createRopeMaterial } from "../src/engine/render/ropeMaterial";
import { RopeMesh } from "../src/engine/render/ropeMesh";
import { KEY_LIGHT } from "../src/engine/render/stage";
import { type BakeChunk, bake, firstFrame } from "../src/engine/sim/bake";
import { particleCount } from "../src/engine/sim/rope";

const PX = 32; // pixels per rope diameter; the page reads the same number
const KNOTS = [overhand, figureEight]; // the knots in src/app/features/stargazers/layout.ts
const D = (rope: RopeDef) => 2 * rope.radius * 1.08; // drawn diameter: ropeMesh's VISUAL_SCALE

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
  new RoomEnvironment(),
  0.04,
).texture;
scene.environmentIntensity = 0.9;
const key = new THREE.DirectionalLight("#fff4e8", 2.6);
key.position.copy(KEY_LIGHT);
scene.add(key, new THREE.HemisphereLight("#fff4e6", "#a8875c", 0.35));
const material = createRopeMaterial("#c39f6a", renderer.capabilities.getMaxAnisotropy());

/** A top-down picture `w`×`h` diameters of `knot`'s rope around `center`, with `axis` (in the table's xz) pointing right. */
function shoot(
  knot: KnotDef,
  p: Float32Array,
  nrm: Float32Array,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  w: number,
  h: number,
) {
  const rope = knot.ropes[0];
  const d = D(rope);
  const mesh = new RopeMesh(particleCount(rope), rope, material);
  mesh.update(p, nrm);
  scene.add(mesh);
  renderer.setSize(w * PX, h * PX);
  const camera = new THREE.OrthographicCamera(
    (-w * d) / 2,
    (w * d) / 2,
    (h * d) / 2,
    (-h * d) / 2,
    0.01,
    2,
  );
  camera.up.set(axis.z, 0, -axis.x); // so the camera's right is `axis`
  camera.position.copy(center).setY(1);
  camera.lookAt(center.x, 0, center.z);
  renderer.render(scene, camera);
  scene.remove(mesh);
  const out = document.createElement("canvas");
  out.width = w * PX;
  out.height = h * PX;
  out.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
  return out;
}

const at = (p: Float32Array, i: number) => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);

// The strip: a whole number of strand turns (ropeMesh's LAY is 7 radii a turn), so it tiles.
const straight = firstFrame(overhand);
const R = overhand.ropes[0].radius;
const strip = shoot(
  overhand,
  straight.frames,
  straight.normals,
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 0, 0),
  Math.round((6 * 7 * R) / D(overhand.ropes[0])),
  2,
);

/** Fade a picture's rope out over `left`/`right` diameters at its sides, to melt into the strip. */
function fade(picture: HTMLCanvasElement, w: number, left: number, right: number) {
  const ctx = picture.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, picture.width, 0);
  g.addColorStop(0, left ? "rgba(0,0,0,0)" : "#000");
  g.addColorStop(left / w, "#000");
  g.addColorStop(1 - right / w, "#000");
  g.addColorStop(1, right ? "rgba(0,0,0,0)" : "#000");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, picture.width, picture.height);
  return picture;
}

/**
 * Turns and shifts a knot picture so the rope going in on the left and out on the right both sit
 * on its middle line: then the page can lay it over its rope without a step at either side.
 * Measures the solid rope (not its soft shadow) a little in from each edge.
 */
function level(picture: HTMLCanvasElement) {
  const { width: W, height: H } = picture;
  const x0 = Math.round(PX * 0.6);
  const x1 = W - x0;
  const middle = (c: HTMLCanvasElement, x: number) => {
    const { data } = c.getContext("2d")!.getImageData(x, 0, 1, H);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < H; y++)
      if (data[y * 4 + 3] > 200) {
        sum += y;
        n++;
      }
    return sum / n;
  };
  const draw = (from: HTMLCanvasElement, turn: number, dy: number) => {
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d")!;
    ctx.translate(W / 2, H / 2 + dy);
    ctx.rotate(turn);
    ctx.drawImage(from, -W / 2, -H / 2);
    ctx.resetTransform(); // fade() draws on this context next
    return out;
  };
  const level = draw(picture, -Math.atan2(middle(picture, x1) - middle(picture, x0), x1 - x0), 0);
  return draw(level, 0, H / 2 - (middle(level, x0) + middle(level, x1)) / 2);
}

/** `def`'s rope at the end of its bake, and the particles that touch a distant part of it. */
function finished(def: KnotDef) {
  const rope = def.ropes[0];
  const n = particleCount(rope);
  let last: BakeChunk | null = null;
  bake(def, (chunk) => (last = chunk));
  const end = last!.frames.length;
  const p = last!.frames.slice(end - n * 3);
  const nrm = last!.normals.slice(end - n * 3);
  const close: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (Math.abs(i - j) > 8 && at(p, i).distanceTo(at(p, j)) < 2.5 * rope.radius) {
        close.push(i);
        break;
      }
  const d = D(rope);
  const perD = (n - 1) / (rope.length / d); // particles in a diameter
  return { rope, n, p, nrm, close, d, perD };
}

/**
 * A knot tied in the rope, laid along the line through the rope either side of it, cropped to the
 * knot and STUB diameters of rope either side. The rope runs on past the picture's edges, so it
 * fades out there instead of stopping short.
 */
const STUB = 2.5;
function inline(def: KnotDef) {
  const { p, nrm, close, d, perD, n } = finished(def);
  const ia = Math.max(close[0] - Math.round(8 * perD), 0);
  const ib = Math.min(close[close.length - 1] + Math.round(8 * perD), n - 1);
  const a = at(p, ia);
  const axis = at(p, ib).sub(a).setY(0).normalize();
  const middle = close
    .reduce((c, i) => c.add(at(p, i)), new THREE.Vector3())
    .divideScalar(close.length);
  // On the line through the rope either side, so the stubs line up with the strip.
  const center = a.clone().addScaledVector(axis, middle.clone().sub(a).dot(axis));
  const body = bounds(p, close[0], close[close.length - 1], center, axis, d, 0);
  const w = body.w + 2 * Math.ceil(STUB);
  const h = body.h + 2;
  return fade(level(shoot(def, p, nrm, center, axis, w, h)), w, 1.5, 1.5);
}

/** The smallest even size in diameters that holds particles `ia`..`ib` round `center`, plus `pad`. */
function bounds(
  p: Float32Array,
  ia: number,
  ib: number,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  d: number,
  pad: number,
) {
  const side = new THREE.Vector3(-axis.z, 0, axis.x);
  let along = 0;
  let across = 0;
  for (let i = ia; i <= ib; i++) {
    const v = at(p, i).sub(center).setY(0);
    along = Math.max(along, Math.abs(v.dot(axis)));
    across = Math.max(across, Math.abs(v.dot(side)));
  }
  return { w: 2 * Math.ceil(along / d + pad), h: 2 * Math.ceil(across / d + pad) };
}

// The rope's end, as the knot page draws it: crimped sleeve and cut strands. The end of the rope
// sits TIP diameters from the picture's left edge; the page reads the same number.
const TIP = 5;
const n = particleCount(overhand.ropes[0]);
const endX = straight.frames[(n - 1) * 3];
const tip = shoot(
  overhand,
  straight.frames,
  straight.normals,
  new THREE.Vector3(endX + (6 / 2 - TIP) * D(overhand.ropes[0]), 0, 0),
  new THREE.Vector3(1, 0, 0),
  6,
  3,
);

const pictures = Object.fromEntries(KNOTS.map((k) => [k.id, inline(k)]));
(window as unknown as { sprites: Record<string, string> }).sprites = {
  rope: strip.toDataURL("image/png"),
  tip: fade(tip, 6, 1.5, 0).toDataURL("image/png"),
  ...Object.fromEntries(Object.entries(pictures).map(([id, c]) => [id, c.toDataURL("image/png")])),
};
document.body.append(strip, tip, ...Object.values(pictures));
