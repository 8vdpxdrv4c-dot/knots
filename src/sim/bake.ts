import type { KnotDef } from "../knots/types";
import { MaterialFrames } from "./frames";
import { FPS, RopeSim } from "./rope";

export interface BakeChunk {
  start: number;
  frames: Float32Array;
  /** Per-particle material normal, n * 3 floats per frame, to keep the strand twist on the rope. */
  normals: Float32Array;
}

export function frameCount(knot: KnotDef): number {
  return Math.round(knot.duration * FPS) + 1;
}

/** Runs the whole knot and hands back positions and normals in chunks of frames (n * 3 floats each). */
export function bake(knot: KnotDef, onChunk: (chunk: BakeChunk) => void, chunkSize = 30): void {
  const sim = new RopeSim(knot);
  const material = new MaterialFrames(sim.n);
  const total = frameCount(knot);
  const stride = sim.n * 3;
  for (let start = 0; start < total; start += chunkSize) {
    const count = Math.min(chunkSize, total - start);
    const frames = new Float32Array(count * stride);
    const normals = new Float32Array(count * stride);
    for (let f = 0; f < count; f++) {
      if (start + f > 0) sim.step();
      material.update(sim.x);
      frames.set(sim.x, f * stride);
      normals.set(material.normals, f * stride);
    }
    onChunk({ start, frames, normals });
  }
}
