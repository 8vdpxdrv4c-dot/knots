import { expect, test } from "vitest";
import { knots } from "../../engine/knots";
import { poachersKnot } from "../../engine/knots/poachers-knot";
import { imageAltFor, isZhKnot, pageCopy, siteNameFor } from "./copy";

test("the poacher's knot page is simplified Chinese and keeps its English name", () => {
  expect(poachersKnot.name).toBe("双圈索结（Poacher's\u00A0knot）");
  expect(poachersKnot.summary).toBe(
    "双反手活套，也称偷猎者结：绳圈受力后会滑紧并牢牢咬住。适合做套索和捆扎。",
  );
  expect(poachersKnot.steps.map((step) => step.title)).toEqual([
    "折出绳耳，把绳头搭在主绳上",
    "绳头从两股下方绕过，再拉到贴实",
    "紧挨着再缠一圈：先从两股上方越过，再从下方绕回",
    "把两圈并拢，再把绳头向左回穿这两圈",
    "绳耳向一侧拉，两端向另一侧拉，把结收紧",
    "完成：双圈索结",
  ]);
  expect(poachersKnot.steps.map((step) => step.t)).toEqual([0, 0.3, 3.37, 8.02, 10.32, 11.23]);
  expect(siteNameFor(poachersKnot.id)).toBe("轻松打绳结");
  expect(imageAltFor(poachersKnot)).toBe("打好的双圈索结（Poacher's\u00A0knot）");
  expect(pageCopy("zh-CN").creditBefore + "@baz7c8" + pageCopy("zh-CN").creditAfter).toBe(
    "由 @baz7c8 制作",
  );
});

test("other knot pages stay in English", () => {
  const en = pageCopy("en");
  expect(en.allKnots).toBe("All knots");
  expect(en.play).toBe("Play");
  expect(en.pause).toBe("Pause");
  expect(en.creditBefore).toBe("made by ");
  for (const knot of knots) {
    if (isZhKnot(knot.id)) continue;
    expect(knot.name).toMatch(/^[A-Za-z]/);
    expect(knot.summary).not.toMatch(/[\u4e00-\u9fff]/);
    expect(siteNameFor(knot.id)).toBe("Knots Made Easy");
    expect(imageAltFor(knot)).toBe(`A finished ${knot.name.toLowerCase()}`);
  }
});
