import { APP_BASE } from "./base";

/** Public origin of the Chinese classroom build. Paths keep `APP_BASE`, so shares stay on this site. */
export const SITE_ORIGIN = "https://www.3dfans.site";
export const SITE_URL = `${SITE_ORIGIN}${APP_BASE.replace(/\/$/, "")}`;
export const SITE_NAME = "Knots Made Easy";
export const SITE_DESCRIPTION =
  "See how knots are tied, step by step, with a physically simulated rope.";

/** A knot's page; the trailing slash matches the prerendered knots/<id>/index.html. */
export const knotPath = (id: string) => `/knots/${encodeURIComponent(id)}/`;
/** A knot's finished-state picture: the share preview and the picker card. Made by `pnpm thumbs`. */
export const knotImagePath = (id: string) =>
  `${import.meta.env.BASE_URL}og/${encodeURIComponent(id)}.jpg`;
export const REPO_URL = "https://github.com/behnamazimi/knots";
export const STARGAZERS_PATH = "/stargazers/";
/** The stars on the stargazer rope, written by tools/stargazers.mjs; the dev server shows mock stars. */
export const STARGAZERS_DATA = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}tools/stargazers.mock.json`
  : `${import.meta.env.BASE_URL}stargazers.json`;

/** Absolute URL for a router path (`/knots/...`) or a public asset that already includes the base. */
export const absoluteUrl = (path: string) => {
  const base = import.meta.env.BASE_URL;
  const pathname = path.startsWith(base) ? path : `${base.replace(/\/$/, "")}${path}`;
  return new URL(pathname, SITE_ORIGIN).href;
};
