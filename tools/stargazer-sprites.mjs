// Saves the stargazer rope's pictures (real rope strip, rope end, each finished knot) to
// public/stargazers/. Run: node tools/stargazer-sprites.mjs. Rerun after changing how rope looks.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const out = new URL("../public/stargazers/", import.meta.url);
mkdirSync(out, { recursive: true });
const server = await createServer({
  root: new URL(".", import.meta.url).pathname,
  server: { port: 5179 },
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error(e));
await page.goto("http://localhost:5179/stargazer-sprites.html", { waitUntil: "commit" }); // the bakes block "load"
const sprites = await (
  await page.waitForFunction(() => window.sprites, null, { timeout: 600_000 })
).jsonValue();
for (const [name, url] of Object.entries(sprites)) {
  const path = new URL(`${name}.png`, out).pathname;
  writeFileSync(path, Buffer.from(url.split(",")[1], "base64"));
  console.log(path);
}
await browser.close();
await server.close();
