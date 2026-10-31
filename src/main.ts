import * as THREE from "three";
import { knots } from "./knots";
import { createRopeMaterial } from "./render/ropeMaterial";
import { RopeMesh } from "./render/ropeMesh";
import { createPropMesh, createStage } from "./render/stage";
import { Timeline } from "./timeline";
import { createPicker } from "./ui/picker";
import { createControls, type PlayerState } from "./ui/controls";
import { createTuner, physicsFromUrl } from "./ui/tune";

const LOOP_REST = 1.2; // seconds to show the finished knot before looping

const knot =
  knots.find((k) => k.id === new URLSearchParams(location.search).get("knot")) ?? knots[0];
const stage = createStage(document.getElementById("scene") as HTMLCanvasElement);
const onProgress = () => {
  if (timeline.ready >= timeline.duration) document.body.dataset.baked = "true";
};
let timeline = new Timeline(knot, onProgress, physicsFromUrl());
const materials = new Map<string, THREE.MeshPhysicalMaterial>();
const ropes = knot.ropes.map((def, k) => {
  const color = def.color ?? "#c39f6a";
  if (!materials.has(color))
    materials.set(color, createRopeMaterial(color, stage.renderer.capabilities.getMaxAnisotropy()));
  const mesh = new RopeMesh(timeline.counts[k], def, materials.get(color)!);
  stage.scene.add(mesh);
  return mesh;
});
for (const prop of knot.props ?? []) stage.scene.add(createPropMesh(prop));

const state: PlayerState = {
  time: 0,
  ready: 0,
  duration: timeline.duration,
  playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  loop: false,
};
let speed = 1;

const draw = createControls(knot, timeline.duration, {
  togglePlay() {
    if (!state.playing && state.time >= timeline.duration) state.time = 0;
    state.playing = !state.playing;
  },
  seek(time) {
    state.time = Math.min(time, timeline.duration);
  },
  setSpeed(s) {
    speed = s;
  },
  toggleLoop() {
    state.loop = !state.loop;
  },
});

createPicker(knots, knot.id);
createTuner((physics) => {
  // Same knot, so the rope meshes and frame counts stay; only the baked frames are replaced.
  timeline.dispose();
  delete document.body.dataset.baked;
  timeline = new Timeline(knot, onProgress, physics);
  state.time = 0;
  state.playing = true;
});

const clock = new THREE.Timer();
stage.renderer.setAnimationLoop((now) => {
  clock.update(now);
  state.ready = timeline.ready;
  if (state.playing && timeline.baked > 0) {
    // Wait at the edge of what has been simulated so far.
    const limit = state.ready < timeline.duration ? state.ready : timeline.duration + LOOP_REST;
    state.time = Math.min(state.time + clock.getDelta() * speed, limit);
    if (state.time >= timeline.duration + (state.loop ? LOOP_REST : 0)) {
      if (state.loop) state.time = 0;
      else state.playing = false;
    }
  }
  if (timeline.baked > 0) {
    const { positions, normals } = timeline.sample(state.time);
    let o = 0;
    ropes.forEach((rope, k) => {
      const end = o + timeline.counts[k] * 3;
      rope.update(positions.subarray(o, end), normals.subarray(o, end));
      o = end;
    });
  }
  for (const rope of ropes) rope.visible = timeline.baked > 0;
  draw(state);
  stage.render();
});
