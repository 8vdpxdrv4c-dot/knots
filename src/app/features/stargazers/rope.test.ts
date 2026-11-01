import { describe, expect, it } from "vitest";
import { countAt, gapFor, jitter, ropeLayout } from "./rope";

const HOUR = 36e5;
// 300 stars an uneven while apart: bursts of minutes to lulls of days.
const times = [0];
for (let i = 1; i < 300; i++) times.push(times[i - 1] + 2 ** (jitter(i, 7) * 12) * 60_000);
const user = { login: "", avatar_url: "", html_url: "" };
const stars = times.map((t) => ({ starred_at: new Date(t).toISOString(), user }));

describe("stargazer rope", () => {
  it("counts the stars given by a date", () => {
    const t = (i: number) => Date.parse(stars[i].starred_at);
    expect(countAt(stars, t(0) - 1)).toBe(0);
    expect(countAt(stars, t(9))).toBe(10);
    expect(countAt(stars, Infinity)).toBe(stars.length);
  });

  it("spaces knots by the wait between stars, on a log scale, capped", () => {
    const usual = HOUR;
    expect(gapFor(60_000, usual)).toBeLessThan(gapFor(usual, usual)); // a burst is tighter
    expect(gapFor(33 * HOUR, usual)).toBeGreaterThan(gapFor(8 * HOUR, usual)); // a lull is looser
    // Each doubling of the wait adds about the same rope, well past the usual wait.
    const step = (h: number) => gapFor(2 * h * HOUR, usual) - gapFor(h * HOUR, usual);
    expect(step(64)).toBeCloseTo(step(128), 1);
    expect(gapFor(365 * 24 * HOUR, usual)).toBe(gapFor(10 * 365 * 24 * HOUR, usual)); // capped
  });

  it("reads the same at any pace: only waits relative to the usual one matter", () => {
    const times = [0, 1, 1.1, 3, 9, 9.2, 30, 31].map((h) => h * HOUR);
    const slow = times.map((t) => t * 100);
    expect(ropeLayout(slow, 8).knots).toEqual(ropeLayout(times, 8).knots);
  });

  it("never moves a knot as the rope replays", () => {
    const all = ropeLayout(times, times.length).knots;
    expect(ropeLayout(times, 100).knots).toEqual(all.slice(0, 100));
    expect(all.slice(1).every((k, i) => k > all[i])).toBe(true);
  });
});
