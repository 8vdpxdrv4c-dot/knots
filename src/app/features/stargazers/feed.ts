import type { Star } from "./rope";

/**
 * The stargazer feed `tools/stargazers.mjs` writes: the first star's time (epoch seconds), then per
 * star [login, GitHub user id, seconds since the previous star].
 */
export type Feed = { v: 1; t0: number; s: [login: string, id: number, dt: number][] };

/** The feed → stars in the shape of GitHub's stargazers API, oldest first. */
export function decodeFeed(feed: Feed): Star[] {
  let t = feed.t0;
  return feed.s.map(([login, id, dt]) => ({
    starred_at: new Date((t += dt) * 1000).toISOString(),
    user: {
      login,
      id,
      avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
      html_url: `https://github.com/${login}`,
    },
  }));
}
