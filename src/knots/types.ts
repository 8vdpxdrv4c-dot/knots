export type Vec3 = [number, number, number];

/** A point a guide passes through. Leave out `p` to hold still at the previous point. */
export interface GuideKey {
  t: number;
  p?: Vec3;
}

/**
 * An invisible pin that moves one point of the rope. The physics does the rest:
 * the rope sags, drags on the table, collides with itself and cinches.
 */
export interface Guide {
  /** Where on the rope: 0 is the standing end, 1 is the working end. */
  at: number;
  /** Seconds. The guide grabs the rope wherever it is at this moment. */
  grab: number;
  /** Targets after the grab, in time order. The guide lets go at the last key. */
  path: GuideKey[];
  /** Softness of the pull (XPBD compliance, m/N). Leave it out for a firm grip; larger values pull like a spring. */
  compliance?: number;
  /** Strongest pull in newtons. Leave it out for a light hand; cinching stiff rope needs more. */
  force?: number;
}

export interface Step {
  t: number;
  title: string;
}

/**
 * Everything that makes one knot. Adding a knot means adding one of these;
 * the rope starts straight along the x axis, lying on the table at y = 0.
 */
export interface KnotDef {
  id: string;
  name: string;
  summary: string;
  rope: { length: number; radius: number };
  duration: number;
  steps: Step[];
  guides: Guide[];
}
