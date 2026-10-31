import type { KnotDef } from "../knots/types";
import { bake } from "./bake";
import type { RopePhysics } from "./rope";

self.onmessage = (e: MessageEvent<{ knot: KnotDef; physics: RopePhysics }>) => {
  bake(
    e.data.knot,
    (chunk) => self.postMessage(chunk, { transfer: [chunk.frames.buffer, chunk.normals.buffer] }),
    30,
    e.data.physics,
  );
};
