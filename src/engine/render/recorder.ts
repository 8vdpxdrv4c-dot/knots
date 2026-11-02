import * as THREE from "three";
import type { Step, Vec3 } from "../knots/types";
import {
  PRESETS,
  formatKnot,
  knotOf,
  presetOf,
  toGuide,
  type Recording,
  type Track,
} from "../record/recording";
import { MaterialFrames } from "../sim/frames";
import { FPS, RopeSim, type Hand, type SimState } from "../sim/rope";
import { createRopeMaterial } from "./ropeMaterial";
import { RopeMesh } from "./ropeMesh";
import { createPropMesh, createStage } from "./stage";
import { NATURAL_ROPE } from "./viewer";

const STORAGE_KEY = "knot-recorder-v2";
const PICK_PX = 24; // how near the pointer a point of rope must be to put a hand on it
const DOT_PX = 16; // how near a hand's dot must be to grab the dot
const RELEASE = 0.3; // seconds a hand takes to let go, as a guide does at its last key
const HOLD = 0.1; // every move ends with this still moment, so moves join without a jerk
const LIFT_STEP = 0.005; // metres per W/S press or wheel notch
const PICK_UP = 3; // a new hand plans to lift its point this many radii, like fingers picking it up
const MAX_HEIGHT = 0.2;
const UNDO_DEPTH = 200;
const ACCENT = "#b9522c";
const STEM = 0.09; // the selected hand's lift handle stands this far above its dot
const HANDLE_PX = 18; // how near the lift handle's tip a press must be

/** How hard a hand pulls: a light hand (the guide default), a firm one, or a cinching pull. */
export const GRIPS = {
  light: {},
  firm: { force: 60 },
  pull: { force: 250, compliance: 0.001 },
} as const;
export type Grip = keyof typeof GRIPS;
export const DURATIONS = [0.5, 1, 2];

/** A hand on the rope: where it is now (`hand.target`), where the next move takes it, and its moves so far. */
interface HandState {
  id: number;
  grip: Grip;
  hand: Hand;
  plan: Vec3;
  track: Track;
}

export interface HandView {
  id: number;
  grip: Grip;
  height: number;
  /** Its dot was moved: the next move takes it there. */
  planned: boolean;
}

export interface RecorderSnapshot {
  time: number;
  preset: string;
  moves: number;
  steps: Step[];
  hands: HandView[];
  selected: number | null;
  grip: Grip;
  duration: number;
  speed: number;
  /** "move" while a move plays, "replay" while the whole recording plays back. */
  busy: "move" | "replay" | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Where the selected hand is going, in metres. */
  plan: Vec3 | null;
  code: string;
}

/** The marks drawn for one hand. */
interface Marks {
  dot: THREE.Mesh;
  ghost: THREE.Mesh;
  arrow: THREE.Mesh;
  drop: THREE.Line; // from the dot down to the table, to show its height
  link: THREE.Line; // from where the hand is to where it is going
  stem: THREE.Mesh; // the lift handle's shaft
}

/** What undo goes back to, and what a reload restores. */
interface Saved {
  preset: string;
  sim: SimState;
  hands: HandState[];
  letting: Hand[];
  guides: Recording["guides"];
  steps: Step[];
  nextId: number;
}

/**
 * The knot playground. Click the rope to put a hand on it; a hand holds its point until you let it
 * go. With time stopped, drag hands' dots to where they should go (W/S for height), as many as you
 * like, then play the move: they all go there together over the move's duration. Every hand is
 * recorded as a guide, and the recording replays as the app bakes it.
 */
export class KnotRecorder {
  private readonly stage: ReturnType<typeof createStage>;
  private readonly clock = new THREE.Timer();
  private readonly listeners = new Set<() => void>();
  private readonly materials = new Map<string, THREE.Material>();
  private preset = PRESETS[0].name;
  private guides: Recording["guides"] = [];
  private steps: Step[] = [];
  private sim!: RopeSim;
  private live: RopeSim | null = null; // the edited simulation, set aside while a replay plays
  private hands: HandState[] = [];
  private nextId = 1;
  private selected: number | null = null;
  private undoStack: Saved[] = [];
  private redoStack: Saved[] = [];
  private readonly marks = new Map<number, Marks>();
  private readonly arrowGeometry = new THREE.ConeGeometry(0.013, 0.03, 20);
  private readonly stemGeometry = new THREE.CylinderGeometry(0.003, 0.003, 1, 10);
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: ACCENT,
    depthTest: false,
    transparent: true,
    opacity: 0.6,
  });
  private meshes: RopeMesh[] = [];
  private props: THREE.Mesh[] = [];
  private frames: MaterialFrames[] = [];
  private buffers: { positions: Float32Array; normals: Float32Array }[] = [];
  private readonly dots = new THREE.Group();
  private readonly dotGeometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly dotMaterial = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false });
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT,
    depthTest: false,
    transparent: true,
    opacity: 0.35,
  });
  private grip: Grip = "light";
  private duration = 1;
  private speed = 1;
  private busy: RecorderSnapshot["busy"] = null;
  private move: { start: number; end: number; from: Map<HandState, Vec3> } | null = null;
  private replayEnd = 0;
  private carry = 0;
  /** A dot dragged across the table at `height`, or the lift handle dragged up and down. */
  private dragging:
    | { state: HandState; height: number; lift?: undefined }
    | { state: HandState; height: number; lift: { grabY: number; startY: number } }
    | null = null;
  private snapshot!: RecorderSnapshot;
  private shownTime = -1;
  private version = 0;
  private code = { version: -1, text: "" };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.stage = createStage(canvas);
    this.stage.scene.add(this.dots);
    const saved = load();
    this.reset(saved?.preset ?? PRESETS[0].name);
    if (saved && saved.sim.x.length === this.sim.n * 3) this.apply(saved);
    this.publish();
    // Before the orbit controls, so a press on the rope or a dot is ours, not a turn of the view.
    canvas.addEventListener("pointerdown", this.onDown, { capture: true });
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false, capture: true });
    window.addEventListener("keydown", this.onKey);
    this.stage.renderer.setAnimationLoop((now) => this.frame(now));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Starts over from another layout. */
  setPreset(name: string) {
    if (this.busy) return;
    this.checkpoint();
    this.reset(name);
    this.changed();
  }

  clear() {
    this.setPreset(this.preset);
  }

  setGrip(grip: Grip) {
    this.grip = grip;
    this.publish();
  }

  setDuration(seconds: number) {
    this.duration = seconds;
    this.publish();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.publish();
  }

  select(id: number | null) {
    this.selected = id;
    this.publish();
  }

  /** Plays the planned move: every hand goes to its dot together, over `seconds`. */
  play(seconds = this.duration) {
    if (this.busy) return;
    this.checkpoint();
    const start = this.sim.time;
    const from = new Map<HandState, Vec3>();
    for (const s of this.hands) {
      if (same(s.plan, s.hand.target)) continue;
      from.set(s, [...s.hand.target]);
      // A hand that has been still since its last key holds there until now, then moves.
      const last = s.track.keys.at(-1)?.t ?? s.track.grab;
      if (last < start - 1e-6) s.track.keys.push({ t: start, p: [...s.hand.target] });
    }
    this.move = { start, end: start + seconds, from };
    this.busy = "move";
    this.publish();
  }

  /** Lets time run with every hand still, for the rope to settle or a hand to finish letting go. */
  wait() {
    for (const s of this.hands) s.plan = [...s.hand.target];
    this.play(0.5);
  }

  /** Lets go of a hand: it opens over a moment of running time (the next move or wait). */
  letGo(id = this.selected) {
    const s = this.hands.find((h) => h.id === id);
    if (!s || this.busy) return;
    this.checkpoint();
    s.hand.release = this.sim.time + RELEASE;
    this.guides.push(toGuide(s.track, s.hand.release));
    this.hands = this.hands.filter((h) => h !== s);
    if (this.selected === id) this.selected = this.hands.at(-1)?.id ?? null;
    this.changed();
  }

  /** Raises (1) or lowers (-1) the selected hand's dot. */
  lift(direction: number) {
    const s = this.hands.find((h) => h.id === this.selected);
    if (!s || this.busy) return;
    const floor = radiusOf(this.preset, s.track.rope);
    s.plan[1] = Math.min(MAX_HEIGHT, Math.max(floor, s.plan[1] + direction * LIFT_STEP));
    if (this.dragging?.state === s) this.dragging.height = s.plan[1];
    this.changed();
  }

  markStep(title: string) {
    this.steps.push({ t: Number(this.sim.time.toFixed(2)), title });
    this.changed();
  }

  undo() {
    this.travel(this.undoStack, this.redoStack);
  }

  redo() {
    this.travel(this.redoStack, this.undoStack);
  }

  /** Puts the selected hand's dot at an exact place (metres; y is the height). */
  setPlan(axis: 0 | 1 | 2, value: number) {
    const s = this.hands.find((h) => h.id === this.selected);
    if (!s || this.busy || !Number.isFinite(value)) return;
    const floor = radiusOf(this.preset, s.track.rope);
    s.plan[axis] = axis === 1 ? Math.min(MAX_HEIGHT, Math.max(floor, value)) : value;
    this.changed();
  }

  /** Goes back (or forward) to the state on top of `from`, keeping the present on `to`. */
  private travel(from: Saved[], to: Saved[]) {
    const saved = from.pop();
    if (!saved || this.busy) return;
    to.push(this.save());
    if (saved.preset !== this.preset) this.reset(saved.preset);
    this.apply(saved);
    this.changed();
  }

  /** Plays everything recorded from the start in a fresh simulation, as the app will bake it. */
  replay() {
    if (this.busy) return;
    const knot = knotOf(this.recording());
    this.live = this.sim;
    this.sim = new RopeSim(knot);
    this.replayEnd = knot.duration;
    this.busy = "replay";
    this.publish();
  }

  /** Back from a replay to where the editing was. */
  stopReplay() {
    if (this.busy !== "replay" || !this.live) return;
    this.sim = this.live;
    this.live = null;
    this.busy = null;
    this.publish();
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown, { capture: true });
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel, { capture: true });
    window.removeEventListener("keydown", this.onKey);
    this.stage.renderer.setAnimationLoop(null);
    this.clearScene();
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.marks.values()) for (const l of [m.drop, m.link]) l.geometry.dispose();
    for (const m of [
      this.stemGeometry,
      this.dotMaterial,
      this.ghostMaterial,
      this.lineMaterial,
      this.dotGeometry,
      this.arrowGeometry,
    ])
      m.dispose();
    this.stage.dispose();
  }

  /** Everything recorded so far; hands still holding are written as letting go now. */
  private recording(): Recording {
    const release = this.sim.time + RELEASE;
    const open = this.hands.map((s) => toGuide(s.track, Math.max(release, s.track.grab + RELEASE)));
    return { preset: this.preset, guides: [...this.guides, ...open], steps: this.steps };
  }

  /** A fresh start from preset `name`: the rope laid out, no hands. */
  private reset(name: string) {
    this.preset = name;
    this.guides = [];
    this.steps = [];
    this.hands = [];
    this.selected = null;
    this.clearScene();
    const knot = knotOf({ preset: name, guides: [], steps: [] });
    this.sim = new RopeSim(knot);
    const anisotropy = this.stage.renderer.capabilities.getMaxAnisotropy();
    this.meshes = knot.ropes.map((def, k) => {
      const color = def.color ?? NATURAL_ROPE;
      if (!this.materials.has(color))
        this.materials.set(color, createRopeMaterial(color, anisotropy));
      const mesh = new RopeMesh(this.sim.ropes[k].count, def, this.materials.get(color)!);
      this.stage.scene.add(mesh);
      return mesh;
    });
    this.props = (knot.props ?? []).map(createPropMesh);
    for (const p of this.props) this.stage.scene.add(p);
    this.frames = this.sim.ropes.map((r) => new MaterialFrames(r.count));
    this.buffers = this.sim.ropes.map((r) => ({
      positions: new Float32Array(r.count * 3),
      normals: new Float32Array(r.count * 3),
    }));
  }

  private save(): Saved {
    return structuredClone({
      preset: this.preset,
      sim: this.sim.save(),
      hands: this.hands,
      letting: [...this.sim.hands].filter((h) => h.release !== undefined),
      guides: this.guides,
      steps: this.steps,
      nextId: this.nextId,
    });
  }

  private apply(saved: Saved) {
    const s = structuredClone(saved);
    this.sim.restore(s.sim);
    this.sim.hands.clear();
    for (const h of [...s.hands.map((h) => h.hand), ...s.letting]) this.sim.hands.add(h);
    this.hands = s.hands;
    this.guides = s.guides;
    this.steps = s.steps;
    this.nextId = s.nextId;
    if (!this.hands.some((h) => h.id === this.selected))
      this.selected = this.hands.at(-1)?.id ?? null;
  }

  private checkpoint() {
    this.redoStack = [];
    this.undoStack.push(this.save());
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
  }

  private clearScene() {
    for (const o of [...this.meshes, ...this.props]) {
      this.stage.scene.remove(o);
      o.geometry.dispose();
    }
    for (const p of this.props) (p.material as THREE.Material).dispose();
    this.meshes = [];
    this.props = [];
  }

  private frame(now: number) {
    this.clock.update(now);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.busy) {
      this.carry += dt * this.speed;
      for (let i = 0; this.busy && this.carry >= 1 / FPS && i < 4; i++) {
        this.carry -= 1 / FPS;
        this.tick();
      }
    } else this.carry = 0;
    this.draw();
    this.stage.render(now);
    if (Math.floor(this.sim.time * 10) !== this.shownTime || this.busy !== this.snapshot.busy)
      this.publish();
  }

  /** One frame of a playing move or replay. */
  private tick() {
    const move = this.move;
    if (this.busy === "move" && move) {
      // Each hand eases from where it was to its dot, starting and stopping at rest: the curve a
      // guide follows between two keys that it holds still at.
      const t = this.sim.time + 1 / FPS;
      const u = Math.min(1, Math.max(0, (t - move.start) / (move.end - move.start || 1)));
      const e = u * u * (3 - 2 * u);
      for (const [s, from] of move.from)
        s.hand.target = from.map((c, i) => c + (s.plan[i] - c) * e) as Vec3;
      this.sim.step();
      if (this.sim.time >= move.end + HOLD - 1e-9) {
        for (const s of move.from.keys()) {
          s.hand.target = [...s.plan];
          s.track.keys.push({ t: move.end, p: [...s.plan] });
        }
        this.move = null;
        this.busy = null;
        this.changed();
      }
    } else if (this.busy === "replay") {
      this.sim.step();
      if (this.sim.time >= this.replayEnd) this.stopReplay();
    }
  }

  private draw() {
    this.sim.ropes.forEach((r, k) => {
      const x = this.sim.x.subarray(r.start * 3, (r.start + r.count) * 3);
      this.frames[k].update(x);
      this.buffers[k].positions.set(x);
      this.buffers[k].normals.set(this.frames[k].normals);
      this.meshes[k].update(this.buffers[k].positions, this.buffers[k].normals);
    });
    // Every hand: a dot where it is going, a line down to the table under it, and while it has
    // not got there, a faint dot where it is and a line between. The selected one has a bigger
    // dot and a lift handle above it.
    const replaying = this.busy === "replay";
    for (const [id, m] of this.marks)
      if (replaying || !this.hands.some((s) => s.id === id)) {
        this.dots.remove(m.dot, m.ghost, m.arrow, m.drop, m.link, m.stem);
        for (const l of [m.drop, m.link]) l.geometry.dispose();
        this.marks.delete(id);
      }
    if (replaying) return;
    for (const s of this.hands) {
      const m = this.marks.get(s.id) ?? this.addMarks(s.id);
      const selected = s.id === this.selected;
      const [x, y, z] = s.plan;
      m.dot.position.set(x, y, z);
      m.dot.scale.setScalar(selected ? 0.012 : 0.008);
      m.ghost.position.set(...s.hand.target);
      m.ghost.visible = m.link.visible = !same(s.plan, s.hand.target);
      setLine(m.drop, [x, y, z], [x, 0, z]);
      setLine(m.link, s.hand.target, s.plan);
      m.arrow.visible = m.stem.visible = selected && !this.busy;
      m.arrow.position.set(x, y + STEM, z);
      m.stem.position.set(x, y + STEM / 2, z);
      m.stem.scale.set(1, STEM, 1);
    }
  }

  private addMarks(id: number): Marks {
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, size = 1) => {
      const m = new THREE.Mesh(geometry, material);
      m.scale.setScalar(size);
      return m;
    };
    const line = () =>
      new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(6), 3),
        ),
        this.lineMaterial,
      );
    const m: Marks = {
      dot: mesh(this.dotGeometry, this.dotMaterial),
      ghost: mesh(this.dotGeometry, this.ghostMaterial, 0.006),
      arrow: mesh(this.arrowGeometry, this.dotMaterial),
      drop: line(),
      link: line(),
      stem: mesh(this.stemGeometry, this.dotMaterial),
    };
    for (const o of Object.values(m)) {
      o.renderOrder = 1;
      o.frustumCulled = false;
      this.dots.add(o);
    }
    this.marks.set(id, m);
    return m;
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest("input, textarea, select, button")) return;
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    const action = {
      KeyW: () => this.lift(1),
      ArrowUp: () => this.lift(1),
      KeyS: () => this.lift(-1),
      ArrowDown: () => this.lift(-1),
      Space: () => this.play(),
      Enter: () => this.play(),
      Backspace: () => this.letGo(),
      Delete: () => this.letGo(),
      Escape: () => this.select(null),
    }[e.code];
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (action) action();
    else if (digit) this.select(this.hands[Number(digit[1]) - 1]?.id ?? this.selected);
    else return;
    e.preventDefault();
  };

  /** On a dot: select it and drag it. On the rope: select the hand there, or put a new hand on it. */
  private onDown = (e: PointerEvent) => {
    if (this.busy || e.button !== 0) return;
    const lifting = this.hands.find((s) => s.id === this.selected && this.onHandle(e, s));
    if (lifting) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const grabY = this.onStem(e, lifting)?.y ?? lifting.plan[1] + STEM;
      this.dragging = {
        state: lifting,
        height: lifting.plan[1],
        lift: { grabY, startY: lifting.plan[1] },
      };
      this.stage.controls.enabled = false;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = "ns-resize";
      return;
    }
    let state = this.dotAt(e);
    if (!state) {
      const index = this.ropeAt(e);
      if (index < 0) return;
      state = this.hands.find((s) => s.hand.index === index) ?? this.addHand(index);
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    this.selected = state.id;
    this.dragging = { state, height: state.plan[1] };
    this.stage.controls.enabled = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = "grabbing";
    this.publish();
  };

  private onMove = (e: PointerEvent) => {
    const drag = this.dragging;
    if (!drag) {
      if (this.busy || e.buttons !== 0) return;
      const selected = this.hands.find((s) => s.id === this.selected);
      this.canvas.style.cursor =
        selected && this.onHandle(e, selected)
          ? "ns-resize"
          : this.dotAt(e) || this.ropeAt(e) >= 0
            ? "pointer"
            : "";
      return;
    }
    if (drag.lift) {
      const hit = this.onStem(e, drag.state);
      if (!hit) return;
      const floor = radiusOf(this.preset, drag.state.track.rope);
      const y = drag.lift.startY + hit.y - drag.lift.grabY;
      drag.state.plan[1] = Math.min(MAX_HEIGHT, Math.max(floor, y));
      drag.height = drag.state.plan[1];
      this.publish();
      return;
    }
    const point = this.onPlane(e, drag.height);
    if (point) drag.state.plan = [point.x, drag.height, point.z];
  };

  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = null;
    this.stage.controls.enabled = true;
    this.canvas.style.cursor = "pointer";
    this.changed();
  };

  /** The wheel raises or lowers a dot while it is dragged. */
  private onWheel = (e: WheelEvent) => {
    if (!this.dragging) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.lift(-Math.sign(e.deltaY));
  };

  private addHand(index: number): HandState {
    this.checkpoint();
    const k = this.sim.ropes.findIndex((r) => index < r.start + r.count);
    const r = this.sim.ropes[k];
    const x = this.sim.x;
    const at: Vec3 = [x[index * 3], x[index * 3 + 1], x[index * 3 + 2]];
    const grip = GRIPS[this.grip];
    const hand: Hand = { index, target: [...at], ...grip };
    this.sim.hands.add(hand);
    const state: HandState = {
      id: this.nextId++,
      grip: this.grip,
      hand,
      plan: [at[0], Math.max(at[1], PICK_UP * radiusOf(this.preset, k)), at[2]],
      track: {
        rope: k,
        at: (index - r.start) / (r.count - 1),
        grab: this.sim.time,
        keys: [],
        ...grip,
      },
    };
    this.hands.push(state);
    this.changed();
    return state;
  }

  /** Whether the pointer is on hand `s`'s lift handle. */
  private onHandle(e: PointerEvent, s: HandState): boolean {
    return this.screenDistance(e, [s.plan[0], s.plan[1] + STEM, s.plan[2]]) < HANDLE_PX;
  }

  /** Where the pointer's ray meets the upright plane through hand `s`'s dot, facing the camera. */
  private onStem(e: PointerEvent, s: HandState): THREE.Vector3 | null {
    const cam = this.stage.camera.position;
    const normal = new THREE.Vector3(cam.x - s.plan[0], 0, cam.z - s.plan[2]).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal,
      new THREE.Vector3(...s.plan),
    );
    return this.ray(e).intersectPlane(plane, new THREE.Vector3());
  }

  /** The hand whose dot is under the pointer. */
  private dotAt(e: PointerEvent): HandState | null {
    let best: HandState | null = null;
    let bestDist = DOT_PX;
    for (const s of this.hands) {
      const d = this.screenDistance(e, s.plan);
      if (d < bestDist) [best, bestDist] = [s, d];
    }
    return best;
  }

  /** The particle nearest the pointer on screen, preferring rope on top; -1 if none is near. */
  private ropeAt(e: PointerEvent): number {
    let best = -1;
    let bestScore = PICK_PX;
    const x = this.sim.x;
    for (let i = 0; i < this.sim.n; i++) {
      const p: Vec3 = [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]];
      const score = this.screenDistance(e, p) - p[1] * 100;
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    return best;
  }

  private screenDistance(e: PointerEvent, p: Vec3): number {
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(...p).project(this.stage.camera);
    const px = ((v.x + 1) / 2) * rect.width + rect.left;
    const py = ((1 - v.y) / 2) * rect.height + rect.top;
    return Math.hypot(px - e.clientX, py - e.clientY);
  }

  /** Where the pointer's ray meets the level plane at `height`. */
  private onPlane(e: PointerEvent, height: number): THREE.Vector3 | null {
    return this.ray(e).intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
      new THREE.Vector3(),
    );
  }

  private ray(e: PointerEvent): THREE.Ray {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, this.stage.camera);
    return caster.ray;
  }

  private changed() {
    this.version++;
    if (!this.busy) store(this.save());
    this.publish();
  }

  private publish() {
    this.shownTime = Math.floor(this.sim.time * 10);
    if (this.code.version !== this.version)
      this.code = { version: this.version, text: formatKnot(knotOf(this.recording())) };
    this.snapshot = {
      time: this.sim.time,
      preset: this.preset,
      moves: this.guides.length + this.hands.length,
      steps: [...this.steps],
      hands: this.hands.map((s) => ({
        id: s.id,
        grip: s.grip,
        height: s.plan[1],
        planned: !same(s.plan, s.hand.target),
      })),
      selected: this.selected,
      grip: this.grip,
      duration: this.duration,
      speed: this.speed,
      busy: this.busy,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      plan: ((p) => (p ? [...p] : null))(
        this.hands.find((h) => h.id === this.selected)?.plan,
      ) as Vec3 | null,
      code: this.code.text,
    };
    this.listeners.forEach((l) => l());
  }
}

function setLine(line: THREE.Line, a: Vec3, b: Vec3) {
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  attr.setXYZ(0, ...a);
  attr.setXYZ(1, ...b);
  attr.needsUpdate = true;
}

const same = (a: Vec3, b: Vec3) => a.every((c, i) => Math.abs(c - b[i]) < 1e-6);

function radiusOf(preset: string, rope: number): number {
  return presetOf({ preset, guides: [], steps: [] }).ropes[rope].radius;
}

function load(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    return saved?.sim && Array.isArray(saved.hands) ? saved : null;
  } catch {
    return null;
  }
}

function store(saved: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private windows and full storage: the work just isn't kept across reloads.
  }
}
