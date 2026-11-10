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
  await page.goto("knots/overhand/");
  await expect(page.getByRole("heading", { name: /单结（Overhand knot）/ })).toBeVisible();
  await expect(page.locator("[data-baked=true]")).toBeVisible({ timeout: 60_000 });

  // Reduced motion: the knot waits for the play button.
  const play = page.getByRole("button", { name: "播放" });
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await expect(page.getByRole("button", { name: "暂停" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^第 4 步：/ }).click();
  await expect(page.getByLabel("播放控制")).toContainText("两端对拉收紧");
  expect(errors).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the prerendered page has the whole layout, the poster and share tags", async ({ page }) => {
    await page.goto("knots/zeppelin/");
    await expect(page.getByRole("heading", { name: /齐柏林结（Zeppelin bend）/ })).toBeVisible();
    await expect(page.getByLabel("播放控制")).toContainText("1/7");
    await expect(page.getByRole("button", { name: /^第 7 步：/ })).toBeAttached();
    await expect(
      page.locator('img[src="/projects/knots-made-easy-zh/og/zeppelin.jpg"]').first(),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "全部绳结 / All knots" }).getByRole("link"),
    ).toHaveCount(7);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/og\/zeppelin\.jpg$/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.3dfans.site/projects/knots-made-easy-zh/knots/zeppelin/",
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
  await page.goto("knots/bowline/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as Win).cls)).toBe(0);
});

test("the picker switches knots without a reload, and history works", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("knots/overhand/");
  await page.evaluate(() => ((window as unknown as Win).marker = 1));
  await page
    .getByRole("navigation", { name: "全部绳结 / All knots" })
    .getByRole("link", { name: /Bowline/ })
    .click();
  await expect(page).toHaveURL(/\/knots\/bowline\/$/);
  await expect(page.getByRole("heading", { name: /称人结（Bowline）/ })).toBeVisible();
  await expect(page).toHaveTitle(/Bowline/);
  expect(await page.evaluate(() => (window as unknown as Win).marker)).toBe(1);

  await page.goBack();
  await expect(page.getByRole("heading", { name: /单结（Overhand knot）/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("reset view returns the camera after a drag", async ({ page }) => {
  await page.goto("knots/overhand/");
  const reset = page.getByRole("button", { name: "重置视角" });
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

test("the public entry is the localized poacher's knot and stays on the subpath", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page).toHaveURL(/\/projects\/knots-made-easy-zh\/?$/);
  await expect(page.getByRole("heading", { name: /双圈索结/ })).toBeVisible();
  const hrefs = await page
    .locator("nav a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/projects\/knots-made-easy-zh\/knots\//);
  }
});

test("the poacher's knot page is simplified Chinese", async ({ page }) => {
  await page.goto("knots/poachers-knot/");
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
  await expect(page.getByRole("link", { name: "3Dfans" })).toHaveAttribute(
    "href",
    "https://www.3dfans.site/",
  );
  await expect(page.getByText("@baz7c8")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重置视角" })).toBeVisible();
  await expect(page.getByRole("button", { name: "分享这个绳结" })).toBeVisible();

  await page.getByRole("button", { name: "第 6 步：完成：双圈索结" }).click();
  await expect(page.getByLabel("播放控制")).toContainText("完成：双圈索结");
});

test("every knot page is Chinese, branded, and has no author credit", async ({ page }) => {
  const pages: [string, RegExp, RegExp][] = [
    ["knots/overhand/", /单结（Overhand knot）/, /防止绳子从孔里滑脱/],
    ["knots/figure-eight/", /八字结（Figure-eight knot）/, /更容易解开/],
    ["knots/bowline/", /称人结（Bowline）/, /不松脱、不咬死/],
    ["knots/clove-hitch/", /双套结（Clove hitch – rope end）/, /可能会滑脱/],
    ["knots/zeppelin/", /齐柏林结（Zeppelin bend）/, /重载下仍然可靠/],
    ["knots/square-knot/", /平结（Square knot）/, /不要用于承受重要载荷/],
    ["knots/poachers-knot/", /双圈索结（Poacher's knot）/, /适合做套索和捆扎/],
  ];
  for (const [path, heading, summary] of pages) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("link", { name: "3Dfans" })).toHaveAttribute(
      "href",
      "https://www.3dfans.site/",
    );
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(summary)).toBeVisible();
    await expect(page.getByText("@baz7c8")).toHaveCount(0);
    await expect(page.getByLabel("播放控制")).toBeVisible();
  }
});

test("old ?knot= links redirect and unknown pages are a 404", async ({ page }) => {
  await page.goto("?knot=zeppelin");
  await expect(page).toHaveURL(/\/projects\/knots-made-easy-zh\/knots\/zeppelin\/$/);
  const response = await page.goto("knots/no-such-knot/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "这里没有这个绳结" })).toBeVisible();
});
