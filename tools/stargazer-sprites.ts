// Renders the stargazer rope's two pictures with the real rope: a straight strip that tiles
// along the rope, and a finished overhand knot. Top view, transparent background, at PX pixels per
// rope diameter. Driven by stargazer-sprites.mjs, which saves window.sprites to public/stargazers/.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { overhand } from "../src/engine/knots/overhand";
import { createRopeMaterial } from "../src/engine/render/ropeMaterial";
import { RopeMesh } from "../src/engine/render/ropeMesh";
import { KEY_LIGHT } from "../src/engine/render/stage";
import { type BakeChunk, bake, firstFrame } from "../src/engine/sim/bake";
import { particleCount } from "../src/engine/sim/rope";

const PX = 32; // pixels per rope diameter; the page reads the same number
const rope = overhand.ropes[0];
const R = rope.radius;
const D = 2 * R * 1.08; // drawn diameter: ropeMesh's VISUAL_SCALE
const n = particleCount(rope);

let last: BakeChunk | null = null;
bake(overhand, (chunk) => (last = chunk));
const stride = n * 3;
const end = last!.frames.length;
const knot = { p: last!.frames.slice(end - stride), nrm: last!.normals.slice(end - stride) };
const straight = firstFrame(overhand);

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

/** A top-down picture `w`×`h` diameters around `center`, with `axis` (in the table's xz) pointing right. */
function shoot(
  p: Float32Array,
  nrm: Float32Array,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  w: number,
  h: number,
) {
  const mesh = new RopeMesh(n, rope, material);
  mesh.update(p, nrm);
  scene.add(mesh);
  renderer.setSize(w * PX, h * PX);
  const camera = new THREE.OrthographicCamera(
    (-w * D) / 2,
    (w * D) / 2,
    (h * D) / 2,
    (-h * D) / 2,
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
const strip = shoot(
  straight.frames,
  straight.normals,
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 0, 0),
  Math.round((6 * 7 * R) / D),
  2,
);

// The knot: the particles that touch a distant part of the rope, and the rope a little either side.
const close: number[] = [];
for (let i = 0; i < n; i++)
  for (let j = 0; j < n; j++)
    if (Math.abs(i - j) > 8 && at(knot.p, i).distanceTo(at(knot.p, j)) < 2.5 * R) {
      close.push(i);
      break;
    }
const gap = Math.round((3 * D) / (rope.length / (n - 1))); // particles in three diameters
const a = at(knot.p, Math.max(close[0] - gap, 0));
const b = at(knot.p, Math.min(close[close.length - 1] + gap, n - 1));
const axis = b.clone().sub(a).setY(0).normalize();
const middle = close
  .reduce((c, i) => c.add(at(knot.p, i)), new THREE.Vector3())
  .divideScalar(close.length);
// On the line through the rope either side, so the stubs line up with the strip.
const center = a.clone().addScaledVector(axis, middle.clone().sub(a).dot(axis));
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
 * Shifts a knot picture so the rope going in on the left and out on the right sits on its middle
 * line: then the page can lay it over its rope without a step at either side. Measures the solid
 * rope (not its soft shadow) a little in from each edge; the rope there is already level.
 */
function level(picture: HTMLCanvasElement) {
  const { width: W, height: H } = picture;
  const { data } = picture.getContext("2d")!.getImageData(0, 0, W, H);
  const middle = (x: number) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < H; y++)
      if (data[(y * W + x) * 4 + 3] > 200) {
        sum += y;
        n++;
      }
    return sum / n;
  };
  const rope = (middle(Math.round(PX * 0.6)) + middle(W - Math.round(PX * 0.6))) / 2;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  out.getContext("2d")!.drawImage(picture, 0, H / 2 - rope);
  return out;
}

const picture = fade(level(shoot(knot.p, knot.nrm, center, axis, 8, 5)), 8, 1.5, 1.5);
// The rope's end, as the knot page draws it: crimped sleeve and cut strands. The end of the rope
// sits TIP diameters from the picture's left edge; the page reads the same number.
const TIP = 5;
const endX = straight.frames[(n - 1) * 3];
const tip = shoot(
  straight.frames,
  straight.normals,
  new THREE.Vector3(endX + (6 / 2 - TIP) * D, 0, 0),
  new THREE.Vector3(1, 0, 0),
  6,
  3,
);

(window as unknown as { sprites: Record<string, string> }).sprites = {
  rope: strip.toDataURL("image/png"),
  overhand: picture.toDataURL("image/png"),
  tip: fade(tip, 6, 1.5, 0).toDataURL("image/png"),
};
document.body.append(strip, picture, tip);
