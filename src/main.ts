import "./style.css";
import * as THREE from "three";
import { knots } from "./knots";
import { createRopeMaterial } from "./render/ropeMaterial";
import { RopeMesh } from "./render/ropeMesh";
import { createStage } from "./render/stage";
import { Timeline } from "./timeline";
import { createControls, type PlayerState } from "./ui/controls";

const LOOP_REST = 1.2; // seconds to show the finished knot before looping

const knot =
  knots.find((k) => k.id === new URLSearchParams(location.search).get("knot")) ?? knots[0];
const stage = createStage(document.getElementById("scene") as HTMLCanvasElement);
const timeline = new Timeline(knot, () => {
  if (timeline.ready >= timeline.duration) document.body.dataset.baked = "true";
});
const rope = new RopeMesh(
  timeline.n,
  knot.rope,
  createRopeMaterial("#c39f6a", stage.renderer.capabilities.getMaxAnisotropy()),
);
stage.scene.add(rope);

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
    rope.update(positions, normals);
  }
  rope.visible = timeline.baked > 0;
  draw(state);
  stage.render();
});
