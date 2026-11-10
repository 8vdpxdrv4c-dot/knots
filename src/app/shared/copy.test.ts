import { expect, test } from "vitest";
import { knots } from "../../engine/knots";
import { poachersKnot } from "../../engine/knots/poachers-knot";
import { ZH_LIST_NAMES, imageAltFor, listEnglishName, pageCopy, siteNameFor } from "./copy";

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
  expect(imageAltFor(poachersKnot)).toBe(`打好的${poachersKnot.name}`);
});

test("the Chinese knot list pairs each usual name with the original English name", () => {
  expect(pageCopy("zh-CN").allKnots).toBe("全部绳结 / All knots");
  expect(ZH_LIST_NAMES).toEqual({
    overhand: "单结",
    "figure-eight": "八字结",
    bowline: "称人结",
    "clove-hitch": "双套结",
    zeppelin: "齐柏林结",
    "square-knot": "平结",
    "poachers-knot": "双圈索结",
  });
  for (const knot of knots) {
    expect(listEnglishName(knot)).toBe(
      {
        overhand: "Overhand knot",
        "figure-eight": "Figure-eight knot",
        bowline: "Bowline",
        "clove-hitch": "Clove hitch – rope end",
        zeppelin: "Zeppelin bend",
        "square-knot": "Square knot",
        "poachers-knot": "Poacher's knot",
      }[knot.id],
    );
    expect(knot.name.replaceAll("\u00a0", " ")).toContain(listEnglishName(knot));
  }
});

test("every knot page is simplified Chinese and keeps the safety notes", () => {
  for (const knot of knots) {
    expect(knot.name).toMatch(/[\u4e00-\u9fff]/);
    expect(knot.summary).toMatch(/[\u4e00-\u9fff]/);
    expect(knot.steps.every((step) => /[\u4e00-\u9fff]/.test(step.title))).toBe(true);
    expect(siteNameFor(knot.id)).toBe("轻松打绳结");
    expect(imageAltFor(knot)).toBe(`打好的${knot.name}`);
  }
  expect(knots.find((knot) => knot.id === "square-knot")?.summary).toContain(
    "不要用于承受重要载荷",
  );
  expect(knots.find((knot) => knot.id === "clove-hitch")?.summary).toContain("可能会滑脱");
  expect(knots.find((knot) => knot.id === "bowline")?.summary).toContain("不松脱、不咬死");
});
