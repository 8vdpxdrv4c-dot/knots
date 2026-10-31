import type { KnotDef } from "../knots/types";
import { MaterialFrames } from "./frames";
import { DEFAULT_PHYSICS, FPS, RopeSim, type RopePhysics } from "./rope";

export interface BakeChunk {
  start: number;
  frames: Float32Array;
  /** Per-particle material normal, n * 3 floats per frame (all ropes one after another), to keep the strand twist on the rope. */
  normals: Float32Array;
}

export function frameCount(knot: KnotDef): number {
  return Math.round(knot.duration * FPS) + 1;
}

/** Runs the whole knot and hands back positions and normals in chunks of frames (n * 3 floats each). */
export function bake(
  knot: KnotDef,
  onChunk: (chunk: BakeChunk) => void,
  chunkSize = 30,
  physics: RopePhysics = DEFAULT_PHYSICS,
): void {
  const sim = new RopeSim(knot, physics);
  const materials = sim.ropes.map((r) => new MaterialFrames(r.count));
  const total = frameCount(knot);
  const stride = sim.n * 3;
  for (let start = 0; start < total; start += chunkSize) {
    const count = Math.min(chunkSize, total - start);
    const frames = new Float32Array(count * stride);
    const normals = new Float32Array(count * stride);
    for (let f = 0; f < count; f++) {
      if (start + f > 0) sim.step();
      frames.set(sim.x, f * stride);
      sim.ropes.forEach((r, k) => {
        materials[k].update(sim.x.subarray(r.start * 3, (r.start + r.count) * 3));
        normals.set(materials[k].normals, f * stride + r.start * 3);
      });
    }
    onChunk({ start, frames, normals });
  }
}
