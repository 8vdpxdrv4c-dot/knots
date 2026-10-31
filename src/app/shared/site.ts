/** The site's public origin, for absolute links in share previews; the only place the domain lives. Switch it to the custom domain once that is attached in Cloudflare. */
export const SITE_URL = "https://knots-made-easy.pages.dev";
export const SITE_NAME = "Knots Made Easy";
export const SITE_DESCRIPTION =
  "See how knots are tied, step by step, with a physically simulated rope.";

/** A knot's page; the trailing slash matches the prerendered knots/<id>/index.html. */
export const knotPath = (id: string) => `/knots/${encodeURIComponent(id)}/`;
/** A knot's finished-state picture: the share preview and the picker card. Made by `pnpm thumbs`. */
export const knotImagePath = (id: string) => `/og/${encodeURIComponent(id)}.jpg`;
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href;
