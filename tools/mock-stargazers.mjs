// Writes public/stargazers.json: fake stars in the stargazer feed over 90 days, marked as mock so the
// first real run of tools/stargazers.mjs replaces them. About
// 10 a day (fewer at weekends), a few big days of 50 or so from a launch post or a share, and a
// few quiet stretches with none.
// Run: node tools/mock-stargazers.mjs
import { writeFileSync } from "node:fs";
import { encode } from "./stargazers.mjs";

let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const poisson = (rate) => {
  let n = 0;
  for (let p = Math.exp(-rate), q = rand(); q > p; q *= rand()) n++;
  return n;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

const DAY = 86_400_000;
const days = 90;
const start = Date.parse("2026-08-03");
// [day, extra stars that day]: a usual day brings about 10; a launch post or a share brings 50.
const bursts = [
  [18, 48],
  [19, 18],
  [47, 46],
  [48, 12],
  [71, 22],
];
// Days nobody starred: a quiet weekend, a slow week, a lone dead day.
const quiet = new Set([30, 31, 32, 33, 58, 59, 80]);
const adjectives = [
  "swift",
  "quiet",
  "brave",
  "lucky",
  "tidy",
  "salty",
  "rusty",
  "sunny",
  "fuzzy",
  "clever",
  "bold",
  "calm",
  "wild",
  "mellow",
  "nimble",
];
const nouns = [
  "sailor",
  "rigger",
  "climber",
  "hiker",
  "otter",
  "falcon",
  "coder",
  "bosun",
  "angler",
  "scout",
  "weaver",
  "fox",
  "heron",
  "camper",
  "tinker",
];

const seen = new Set();
const stars = [];
for (let d = 0; d < days; d++) {
  const weekend = new Date(start + d * DAY).getUTCDay() % 6 === 0;
  let rate = quiet.has(d) ? 0 : weekend ? 6 : 10;
  for (const [d0, extra] of bursts) if (d === d0) rate += extra;
  for (let n = poisson(rate); n > 0; n--) {
    let login;
    do login = `${pick(adjectives)}-${pick(nouns)}${rand() < 0.5 ? Math.floor(rand() * 99) : ""}`;
    while (seen.has(login));
    seen.add(login);
    const id = 1000 + Math.floor(rand() * 9_000_000);
    stars.push({ login, id, time: Math.floor(start + (d + rand()) * DAY) });
  }
}
stars.sort((a, b) => a.time - b.time);
// Two quiet weeks before the newest 5 stars: everything older moves 14 days back, so the rope shows
// what a long lull looks like right where it opens.
for (const star of stars.slice(0, -5)) star.time -= 14 * DAY;
writeFileSync(
  new URL("../public/stargazers.json", import.meta.url),
  encode(stars).replace('{"v":1,', '{"v":1,"mock":true,'),
);
console.log(`${stars.length} stars`);
