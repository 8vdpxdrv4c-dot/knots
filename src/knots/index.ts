import { bowline } from "./bowline";
import { cloveHitch } from "./clove-hitch";
import { figureEight } from "./figure-eight";
import { overhand } from "./overhand";
import type { KnotDef } from "./types";
import { zeppelin } from "./zeppelin";

/** Every knot in the app, in menu order. Add new knots here. */
export const knots: KnotDef[] = [overhand, figureEight, bowline, cloveHitch, zeppelin];
