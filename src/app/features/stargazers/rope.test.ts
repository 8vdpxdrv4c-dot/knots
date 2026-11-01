import { describe, expect, it } from "vitest";
import stars from "../../../../public/stargazers.json";
import { countAt, groupDays, ropeLayout } from "./rope";

describe("stargazer rope", () => {
  it("counts the stars given by a date", () => {
    const t = (i: number) => Date.parse(stars[i].starred_at);
    expect(countAt(stars, t(0) - 1)).toBe(0);
    expect(countAt(stars, t(9))).toBe(10);
    expect(countAt(stars, Infinity)).toBe(stars.length);
  });

  it("groups stars by day, keeping every star", () => {
    const star = (starred_at: string) => ({
      starred_at,
      user: { login: "", avatar_url: "", html_url: "" },
    });
    const days = groupDays([
      star("2026-01-01T09:00:00Z"),
      star("2026-01-01T23:00:00Z"),
      star("2026-01-04T01:00:00Z"),
    ]);
    expect(days).toEqual([
      { date: "2026-01-01", start: 0, count: 2 },
      { date: "2026-01-04", start: 2, count: 1 },
    ]);
    expect(groupDays(stars).reduce((n, d) => n + d.count, 0)).toBe(stars.length);
  });

  it("gives each star about the same rope, steady as stars arrive, and every day the same gap", () => {
    const day = (start: number, count: number) => ({ date: "", start, count });
    const { knots } = ropeLayout([day(0, 50)], 50);
    expect(knots).toHaveLength(50);
    const gaps = knots.slice(1).map((k, i) => k - knots[i]);
    expect(Math.min(...gaps)).toBeGreaterThan(0);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(3); // uneven, not wild
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(10); // not uniform
    expect(ropeLayout([day(0, 50)], 20).knots).toEqual(knots.slice(0, 20)); // knots never move
    const { spans } = ropeLayout([day(0, 1), day(1, 1), day(2, 1)], 3);
    expect(spans[1].from - spans[0].to).toBeCloseTo(spans[2].from - spans[1].to);
  });
});
