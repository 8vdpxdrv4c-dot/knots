// Where each star's knot sits on the rope and which knot it is. No imports, so
// tools/readme-rope.mjs can run it in Node as it is.

/**
 * The knots a star can tie, commonest first, with the share of stargazers who tie each. Only
 * knots tied in the middle of a rope: one that ends in a loop or a hitch shows its rope end.
 */
export const KNOT_KINDS = [
  { id: "overhand", name: "Overhand knot", odds: 0.75 },
  { id: "figure-eight", name: "Figure-eight knot", odds: 0.25 },
] as const;
export type KnotKind = (typeof KNOT_KINDS)[number];

/** The knot a GitHub user ties: always the same for their user id, the rarer knots for fewer people. */
export function knotFor(id: number): KnotKind {
  let u = (Math.imul(id, 2654435761) >>> 0) / 2 ** 32; // spreads ids evenly over [0, 1)
  for (const kind of KNOT_KINDS) if ((u -= kind.odds) < 0) return kind;
  return KNOT_KINDS[0];
}

// Rope lengths, in rope diameters.
const LEAD = 8; // bare rope before the first knot and after the last
const TIGHT = 5; // knot to knot for stars given moments apart: the knot and its avatars just fit
const STEP = 3.2; // extra rope each time the wait between two stars doubles, past the usual wait
const LOOSE = 34; // the most rope one lull gets, however long it was

/** A steady random number in [0, 1) for star `i`, so its knot never moves as stars arrive. */
export const jitter = (i: number, salt = 0) => {
  const h = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * Rope between two knots for a wait of `wait`, where `usual` is this repo's typical wait between
 * stars: tight for a burst, a fixed step more each time the wait doubles, capped. On a log scale
 * a quiet week reads clearly longer than a quiet hour without becoming a long empty swipe, and
 * measuring against the repo's own pace makes it read the same for a repo with 5 stars a year or
 * 1,000 a day: tight means busier than usual, loose means quieter.
 */
export const gapFor = (wait: number, usual: number) =>
  Math.min(TIGHT + STEP * Math.log2(1 + Math.max(wait, 0) / usual), LOOSE);

/**
 * Where each of the first `shown` knots sits along the rope, in rope diameters from its start,
 * given every star's time in ms (sorted). Spacing comes from the wait since the star before,
 * with a little hand-tied wobble. The usual wait is the median over all stars, so knots don't
 * move while the rope replays.
 */
export function ropeLayout(times: readonly number[], shown: number) {
  const waits = times.slice(1).map((t, i) => t - times[i]);
  const sorted = [...waits].sort((a, b) => a - b);
  const usual = Math.max(sorted[Math.floor(sorted.length / 2)] ?? 0, 60_000); // at least a minute
  const knots: number[] = [];
  let s = LEAD;
  for (let i = 0; i < Math.min(shown, times.length); i++) {
    if (i > 0) s += gapFor(waits[i - 1], usual) * (0.88 + 0.24 * jitter(i));
    knots.push(s);
  }
  return { knots, end: (knots[knots.length - 1] ?? 0) + LEAD };
}
