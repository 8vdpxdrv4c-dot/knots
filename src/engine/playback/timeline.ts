import type { KnotDef } from "../knots/types";
import { firstFrame, frameCount, type BakeChunk } from "../sim/bake";
import { DEFAULT_PHYSICS, FPS, particleCount, type RopePhysics } from "../sim/rope";

/**
 * Baked frames of one knot. The simulation fills it from a worker while the user
 * watches; playback and scrubbing only ever read from here.
 */
export class Timeline {
  /** Particles in all ropes together. */
  readonly n: number;
  /** Particles of each rope, in order; a frame holds the ropes one after another. */
  readonly counts: number[];
  readonly duration: number;
  baked = 0;
  private readonly total: number;
  private readonly frames: Float32Array;
  private readonly normals: Float32Array;
  private readonly out = { positions: new Float32Array(0), normals: new Float32Array(0) };
  private readonly worker: Worker;

  constructor(knot: KnotDef, onProgress: () => void, physics: RopePhysics = DEFAULT_PHYSICS) {
    this.counts = knot.ropes.map(particleCount);
    this.n = this.counts.reduce((a, b) => a + b, 0);
    this.total = frameCount(knot);
    this.duration = (this.total - 1) / FPS;
    this.frames = new Float32Array(this.total * this.n * 3);
    this.normals = new Float32Array(this.total * this.n * 3);
    this.out = { positions: new Float32Array(this.n * 3), normals: new Float32Array(this.n * 3) };
    const worker = (this.worker = new Worker(new URL("../sim/worker.ts", import.meta.url), {
      type: "module",
    }));
    const store = ({ start, frames, normals }: BakeChunk) => {
      this.frames.set(frames, start * this.n * 3);
      this.normals.set(normals, start * this.n * 3);
      this.baked = start + frames.length / (this.n * 3);
    };
    // The start pose is ready at once, so the rope shows while the worker bakes the rest.
    store(firstFrame(knot, physics));
    worker.onmessage = (e: MessageEvent<BakeChunk>) => {
      store(e.data);
      if (this.baked >= this.total) worker.terminate();
      onProgress();
    };
    worker.postMessage({ knot, physics });
  }

  /** Stops baking; for a timeline that is being replaced. */
  dispose(): void {
    this.worker.terminate();
  }

  /** Seconds that are ready to play. */
  get ready(): number {
    return Math.max(0, (this.baked - 1) / FPS);
  }

  /** Rope positions and material normals at `time`, blended between frames so slow motion stays smooth. */
  sample(time: number): { positions: Float32Array; normals: Float32Array } {
    const stride = this.n * 3;
    const f = Math.min(Math.max(time, 0), this.ready) * FPS;
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.baked - 1);
    const a = f - i;
    const { frames, normals, out } = this;
    for (let k = 0; k < stride; k++) {
      out.positions[k] = frames[i * stride + k] * (1 - a) + frames[j * stride + k] * a;
      out.normals[k] = normals[i * stride + k] * (1 - a) + normals[j * stride + k] * a;
    }
    return out;
  }
}
