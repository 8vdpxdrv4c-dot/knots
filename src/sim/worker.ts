import type { KnotDef } from "../knots/types";
import { bake } from "./bake";

self.onmessage = (e: MessageEvent<KnotDef>) => {
  bake(e.data, (chunk) =>
    self.postMessage(chunk, { transfer: [chunk.frames.buffer, chunk.normals.buffer] }),
  );
};
