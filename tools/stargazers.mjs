// Writes public/stargazers.json from the repo's GitHub stargazers, in the compact feed the stargazer
// rope reads: {"v":1,"t0":<first star, epoch s>,"s":[[login, user id, seconds since the previous star], …]}.
// About 30 bytes a star. Knots stay once tied: someone who unstars keeps their knot and number.
// Run by .github/workflows/stargazers.yml; locally: GITHUB_TOKEN=$(gh auth token) node tools/stargazers.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FILE = new URL("../public/stargazers.json", import.meta.url);

/** [{login, id, time (ms)}] → the feed, one star per line so a new star is a one-line diff. */
export function encode(stars) {
  const sorted = [...stars].sort((a, b) => a.time - b.time);
  const t0 = Math.floor((sorted[0]?.time ?? 0) / 1000);
  let prev = t0;
  const rows = sorted.map(({ login, id, time }) => {
    const t = Math.floor(time / 1000);
    const row = JSON.stringify([login, id, t - prev]);
    prev = t;
    return row;
  });
  return `{"v":1,"t0":${t0},"s":[\n${rows.join(",\n")}\n]}\n`;
}

/** The feed → [{login, id, time (ms)}]. */
export function decode(feed) {
  if (feed?.v !== 1) return [];
  let t = feed.t0;
  return feed.s.map(([login, id, dt]) => ({ login, id, time: (t += dt) * 1000 }));
}

/** Everyone already on the rope plus the current stargazers, by user id: the first star's time, the latest login. */
export function merge(tied, current) {
  const byId = new Map(tied.map((s) => [s.id, s]));
  for (const s of current) {
    const had = byId.get(s.id);
    byId.set(s.id, had ? { ...had, login: s.login } : s);
  }
  return [...byId.values()];
}

// shortcut: fetches every page each run (100 stars a call); fetch only the newest pages past ~50k stars.
async function stargazers(repo, token) {
  const stars = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github.star+json",
          "x-github-api-version": "2022-11-28",
          ...(token && { authorization: `Bearer ${token}` }),
        },
      },
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    const list = await res.json();
    for (const { starred_at, user } of list)
      if (user) stars.push({ login: user.login, id: user.id, time: Date.parse(starred_at) });
    if (list.length < 100) return stars;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY ?? "behnamazimi/knots";
  let tied = [];
  try {
    tied = decode(JSON.parse(readFileSync(FILE, "utf8")));
  } catch {} // no file yet: start a fresh rope
  const all = merge(tied, await stargazers(repo, process.env.GITHUB_TOKEN));
  writeFileSync(FILE, encode(all));
  console.log(`${all.length} knots (${all.length - tied.length} new)`);
}
