import { expect, test } from "@playwright/test";

test("overhand knot bakes, plays and scrubs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overhand knot" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-baked", "true", { timeout: 15_000 });

  // The bar redraws on the next frame, so wait for each change instead of reading it right away.
  const play = page.locator("#play");
  const before = (await play.getAttribute("aria-pressed"))!;
  const after = before === "true" ? "false" : "true";
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", after);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", before);

  await page.getByRole("button", { name: /^Step 4:/ }).click();
  await expect(page.locator("#step-title")).toHaveText("Pull both ends to tighten");

  expect(errors).toEqual([]);
});
