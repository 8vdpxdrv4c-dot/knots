import type { KnotDef } from "./knots/types";
import type { Player } from "./playback/player";
import { Timeline } from "./playback/timeline";
import { DEFAULT_PHYSICS, type RopePhysics } from "./sim/rope";

/** One knot being watched: its frames baking in a worker and the playback over them. */
export interface KnotSession {
  readonly knot: KnotDef;
  readonly timeline: Timeline;
  readonly player: Player;
  /** Stops the bake; call when the knot is left or re-baked. */
  dispose(): void;
}

/**
 * Starts baking `knot` and feeds the progress to `player`. Browser only (it starts a worker);
 * the player itself can be made anywhere, so prerendered pages show the same first state.
 */
export function createKnotSession(
  knot: KnotDef,
  player: Player,
  physics: RopePhysics = DEFAULT_PHYSICS,
): KnotSession {
  const timeline = new Timeline(knot, () => player.setReady(timeline.ready), physics);
  return { knot, timeline, player, dispose: () => timeline.dispose() };
}
