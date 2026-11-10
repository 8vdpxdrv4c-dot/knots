import { cp, copyFile } from "node:fs/promises";
import type { Config } from "@react-router/dev/config";
import { knots } from "./src/engine/knots";
import { APP_BASE } from "./src/app/shared/base";
import { STARGAZERS_PATH, knotPath } from "./src/app/shared/site";

export default {
  appDirectory: "src/app",
  // Served at https://www.3dfans.site/projects/knots-made-easy-zh/
  basename: APP_BASE,
  // A static site: every knot page is prerendered to HTML, then runs as a client-side app.
  ssr: false,
  prerender: ["/", STARGAZERS_PATH, ...knots.map((k) => knotPath(k.id))],
  async buildEnd({ reactRouterConfig: { buildDirectory } }) {
    const client = `${buildDirectory}/client`;
    const site = `${client}${APP_BASE}`;
    // Hashed bundles and public files are emitted at the client root. Copy them under the
    // basename so one directory is the whole site for that subpath.
    await cp(`${client}/assets`, `${site}assets`, { recursive: true });
    await cp(`${client}/og`, `${site}og`, { recursive: true });
    await cp(`${client}/stargazers`, `${site}stargazers`, { recursive: true });
    await copyFile(`${client}/stargazers.json`, `${site}stargazers.json`);
    // Hosts serve 404.html for unknown paths; the SPA shell then shows the not-found page.
    // With a basename, React Router writes that shell to client/index.html, not __spa-fallback.html.
    await copyFile(`${client}/index.html`, `${site}404.html`);
    // `wrangler pages dev` looks for 404.html at the output root when previewing build/client.
    await copyFile(`${client}/index.html`, `${client}/404.html`);
  },
} satisfies Config;
