import { expect, test, type Page } from "@playwright/test";

type Win = Window & { cls: number; marker?: number };

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
};

test("a knot page bakes, plays, steps and scrubs", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/knots/overhand/");
  await expect(page.getByRole("heading", { name: "Overhand knot" })).toBeVisible();
  await expect(page.locator("[data-baked=true]")).toBeVisible({ timeout: 60_000 });

  // Reduced motion: the knot waits for the play button.
  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await expect(page.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^Step 4:/ }).click();
  await expect(page.getByLabel("Playback")).toContainText("Pull both ends to tighten");
  expect(errors).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the prerendered page has the whole layout, the poster and share tags", async ({ page }) => {
    await page.goto("/knots/zeppelin/");
    await expect(page.getByRole("heading", { name: "Zeppelin bend" })).toBeVisible();
    await expect(page.getByLabel("Playback")).toContainText("1/7");
    await expect(page.getByRole("button", { name: /^Step 7:/ })).toBeAttached();
    await expect(page.locator('img[src="/og/zeppelin.jpg"]').first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "All knots" }).getByRole("link")).toHaveCount(
      7,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/og\/zeppelin\.jpg$/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/knots\/zeppelin\/$/,
    );
  });
});

test("loading does not shift the layout", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Win).cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!e.hadRecentInput) (window as unknown as Win).cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/knots/bowline/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as Win).cls)).toBe(0);
});

test("the picker switches knots without a reload, and history works", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/knots/overhand/");
  await page.evaluate(() => ((window as unknown as Win).marker = 1));
  await page
    .getByRole("navigation", { name: "All knots" })
    .getByRole("link", { name: /^Bowline/ })
    .click();
  await expect(page).toHaveURL(/\/knots\/bowline\/$/);
  await expect(page.getByRole("heading", { name: "Bowline" })).toBeVisible();
  await expect(page).toHaveTitle(/Bowline/);
  expect(await page.evaluate(() => (window as unknown as Win).marker)).toBe(1);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Overhand knot" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("reset view returns the camera after a drag", async ({ page }) => {
  await page.goto("/knots/overhand/");
  const reset = page.getByRole("button", { name: "Reset view" });
  await expect(reset).toBeDisabled();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.width / 2 + 160, box.height / 2 - 60, { steps: 4 });
  await page.mouse.up();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toBeDisabled();
});

test("the poacher's knot page is simplified Chinese", async ({ page }) => {
  await page.goto("/knots/poachers-knot/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle(/双圈索结（Poacher's\s+knot） · 轻松打绳结/);
  await expect(page.getByRole("heading", { name: /双圈索结（Poacher's\s+knot）/ })).toBeVisible();
  await expect(page.locator("section p").filter({ hasText: "适合做套索和捆扎。" })).toBeVisible();
  await expect(page.getByLabel("播放控制")).toContainText("折出绳耳，把绳头搭在主绳上");
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  const knots = page.getByRole("navigation", { name: "全部绳结 / All knots" });
  await expect(knots).toBeVisible();
  await expect(knots.getByRole("link")).toHaveCount(7);
  await expect(knots.getByRole("link", { name: /双圈索结/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(knots.getByRole("link", { name: /双圈索结/ })).toContainText("Poacher's knot");
  await expect(knots.getByRole("link", { name: /单结/ })).toContainText("Overhand knot");
  await expect(knots.getByRole("link", { name: /称人结/ })).toContainText("Bowline");
  await expect(knots.getByRole("link", { name: /双套结/ })).toContainText("Clove hitch – rope end");
  await expect(page.getByRole("link", { name: "在 GitHub 上查看源码" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重置视角" })).toBeVisible();
  await expect(page.getByRole("button", { name: "分享这个绳结" })).toBeVisible();
  await expect(page.locator("footer")).toHaveText("由 @baz7c8 制作");

  await page.getByRole("button", { name: "第 6 步：完成：双圈索结" }).click();
  await expect(page.getByLabel("播放控制")).toContainText("完成：双圈索结");
});

test("old ?knot= links redirect and unknown pages are a 404", async ({ page }) => {
  await page.goto("/?knot=zeppelin");
  await expect(page).toHaveURL(/\/knots\/zeppelin\/$/);
  const response = await page.goto("/knots/no-such-knot/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /isn’t here/ })).toBeVisible();
});
