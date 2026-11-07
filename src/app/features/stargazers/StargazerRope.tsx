import { useMemo, useRef, useState } from "react";
import { useMountEffect } from "../../shared/hooks";
import { knotPath } from "../../shared/site";
import { PauseIcon, PlayIcon, SearchIcon } from "../../shared/ui/icons";
import { type Feed, decodeFeed } from "./feed";
import { knotFor, ropeLayout } from "./layout";
import { markPromptSeen } from "./prompt";
import { type Star, StarRope, countAt } from "./rope";
import styles from "./stargazers.module.css";

/** How long the replay takes: a beat per star, so a few stars don't crawl, up to six seconds. */
const playMs = (stars: number) => Math.min(800 + stars * 150, 6000);
/** The replay ties only the newest stars, slowly enough to watch; the older ones are already on the rope. */
const REPLAY = 50;
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const WEEK = 7 * 864e5;
const avatar = (s: Star, size: number) => `${s.user.avatar_url}&s=${size}`;
/** "Bowline · 4% of stargazers" */
const knotLine = (s: Star) => {
  const kind = knotFor(s.user.id);
  return `${kind.name} · ${Math.round(kind.odds * 100)}% of stargazers`;
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en", { dateStyle: "medium" });
const month = (t: number) =>
  new Date(t).toLocaleDateString("en", { month: "short", year: "numeric" });

/**
 * Every GitHub star as a knot on one rope, with a timeline that replays how the stars piled up.
 * `src` is the stargazer feed (see `Feed`), refreshed by the stargazers GitHub Action.
 */
export function StargazerRope({ src, repoUrl }: { src: string; repoUrl: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const intro = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const rope = useRef<StarRope>(null);
  const raf = useRef(0);
  const [stars, setStars] = useState<Star[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ star: Star; x: number; y: number } | null>(null);
  const [onSlot, setOnSlot] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ index: number } | "missing" | null>(null);

  const first = stars.length ? Date.parse(stars[0].starred_at) : 0;
  const last = stars.length ? Date.parse(stars[stars.length - 1].starred_at) : 0;
  const count = countAt(stars, time);

  const seek = (t: number, list = stars, along?: number) => {
    setTime(t);
    rope.current?.setCount(countAt(list, t), along);
  };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  const play = (list = stars) => {
    // Along the rope at an even speed that eases to a stop, not evenly through the dates: a burst
    // of stars would tie dozens of knots in one frame and a quiet month would stall.
    const times = list.map((s) => Date.parse(s.starred_at));
    const n = times.length;
    // Carry on from a paused replay, else start REPLAY stars before the newest.
    const mid = time > times[0] && time < times[n - 1];
    const i0 = mid ? Math.max(countAt(list, time) - 1, 0) : Math.max(n - REPLAY, 0);
    const { knots } = ropeLayout(times, n);
    /** The date at which the replay is `s` diameters along the rope, between its two stars. */
    const timeAt = (s: number) => {
      let i = i0;
      while (i < n - 1 && knots[i + 1] <= s) i++;
      if (i === n - 1) return times[i];
      return times[i] + ((times[i + 1] - times[i]) * (s - knots[i])) / (knots[i + 1] - knots[i]);
    };
    const ms = playMs(n - i0);
    const t0 = performance.now();
    setPlaying(true);
    const tick = (now: number) => {
      // rAF's timestamp can be a little before t0 on the first frame.
      const u = Math.min(Math.max((now - t0) / ms, 0), 1);
      // Starts brisk (1.6× the average speed) and eases to 0.4× by the newest knot, where the
      // rope's own spring brings it to rest.
      const s = knots[i0] + (knots[n - 1] - knots[i0]) * (u + 0.6 * u * (1 - u));
      seek(timeAt(s), list, u < 1 ? s : undefined);
      if (u < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useMountEffect(() => {
    markPromptSeen(); // Someone on the rope page needs no nudge toward it.
    // The rope runs the full width, below the intro panel and above the timeline bar.
    const band = () => ({
      top: intro.current!.getBoundingClientRect().bottom + 8,
      bottom: bar.current!.getBoundingClientRect().top - 8,
    });
    const r = new StarRope(canvas.current!, band);
    rope.current = r;
    fetch(src)
      .then((res) => res.json() as Promise<Feed>)
      .then((feed) => {
        const list = decodeFeed(feed);
        r.setStars(list);
        setStars(list);
        setLoaded(true);
        if (!list.length) return;
        if (matchMedia("(prefers-reduced-motion: reduce)").matches)
          seek(Date.parse(list[list.length - 1].starred_at), list);
        else play(list);
      })
      .catch(() => {});
    return () => {
      cancelAnimationFrame(raf.current);
      r.dispose();
    };
  });

  /** Find a stargazer by username (exact, then the first that starts with it) and go to their knot. */
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.trim().replace(/^@/, "").toLowerCase();
    if (!name) return;
    const login = (s: Star) => s.user.login.toLowerCase();
    let index = stars.findIndex((s) => login(s) === name);
    if (index < 0) index = stars.findIndex((s) => login(s).startsWith(name));
    if (index < 0) return setFound("missing");
    stop();
    seek(last, stars); // every knot tied, so theirs is on the rope
    rope.current?.find(index);
    setFound({ index });
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top] as const;
  };

  // The cumulative-stars curve behind the scrubber, in a 100×40 box; built once, not every frame.
  const curve = useMemo(
    () =>
      stars
        .map((s, i) => {
          const x = ((Date.parse(s.starred_at) - first) / (last - first || 1)) * 100;
          return `${x.toFixed(2)},${(40 - ((i + 1) / stars.length) * 36).toFixed(2)}`;
        })
        .join(" "),
    [stars, first, last],
  );
  const playedPct = ((time - first) / (last - first || 1)) * 100;
  const latest = stars.slice(Math.max(count - 5, 0), count).reverse();
  // The next round number to reach, and how far along from the last one.
  const goal = MILESTONES.find((m) => m > count) ?? count + 1;
  const prev = [...MILESTONES].reverse().find((m) => m <= count) ?? 0;
  const progress = ((count - prev) / (goal - prev)) * 100;
  // Stars in the week up to the newest one (not the clock, so the page renders the same anywhere).
  const thisWeek = stars.filter((s) => last - Date.parse(s.starred_at) < WEEK).length;
  const hit = found && found !== "missing" ? stars[found.index] : null;

  return (
    <>
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        aria-label={`A rope with ${count} knots, one per GitHub star, in date order`}
        onPointerMove={(e) => {
          const [x, y] = point(e);
          const star = rope.current?.pick(x, y);
          setHover(star ? { star, x: e.clientX, y: e.clientY } : null);
          setOnSlot(!star && !!rope.current?.overSlot(x, y));
        }}
        onPointerLeave={() => {
          rope.current?.pick(-1e9, -1e9);
          setHover(null);
          setOnSlot(false);
        }}
        onClick={() => {
          if (rope.current?.swiped) return;
          if (hover) window.open(hover.star.user.html_url, "_blank", "noopener");
          else if (onSlot) window.open(repoUrl, "_blank", "noopener");
        }}
        style={{ cursor: hover || onSlot ? "pointer" : "grab" }}
      />
      {hover && (
        <div className={styles.tip} style={{ left: hover.x, top: hover.y }}>
          <strong>@{hover.star.user.login}</strong>
          <span>{knotLine(hover.star)}</span>
          <span>starred {day(hover.star.starred_at)}</span>
        </div>
      )}

      <section ref={intro} className={styles.hud}>
        <p className={styles.eyebrow}>Stargazer rope</p>
        <h1 className={styles.total}>
          <strong>{loaded ? count.toLocaleString() : "…"}</strong> {count === 1 ? "knot" : "knots"}{" "}
          tied
        </h1>
        <div
          className={styles.goal}
          role="progressbar"
          aria-label={`Next milestone: ${goal.toLocaleString()} knots`}
          aria-valuemin={prev}
          aria-valuemax={goal}
          aria-valuenow={count}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.goalText}>
          <span>{(goal - count).toLocaleString()} to go</span>
          <span>🏁 {goal.toLocaleString()}</span>
        </p>

        {latest.length > 0 && (
          <div className={styles.faces} aria-label="Latest stargazers">
            {latest.map((s) => (
              <img key={s.user.login} src={avatar(s, 48)} alt={`@${s.user.login}`} />
            ))}
            {thisWeek > 0 && thisWeek < count && (
              <span className={styles.chip}>+{thisWeek} this week</span>
            )}
          </div>
        )}

        <form className={styles.search} onSubmit={search} role="search">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFound(null);
            }}
            placeholder="Find your knot"
            aria-label="Find your knot by GitHub username"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </form>
        {hit && found !== "missing" && found && (
          <div className={styles.badge} aria-live="polite">
            <img src={avatar(hit, 64)} alt="" />
            <strong>#{(found.index + 1).toLocaleString()}</strong>
            <span>
              @{hit.user.login}
              <br />
              {day(hit.starred_at)}
            </span>
            <a className={styles.learn} href={knotPath(knotFor(hit.user.id).id)}>
              {knotLine(hit)} <b>Learn it →</b>
            </a>
          </div>
        )}
        {found === "missing" && (
          <p className={styles.missing} aria-live="polite">
            Not on the rope yet. Tie yours ★
          </p>
        )}
      </section>

      <div ref={bar} className={styles.timeline} aria-label="Star timeline">
        <button
          type="button"
          className={styles.play}
          disabled={!stars.length}
          aria-pressed={playing}
          aria-label={playing ? "Pause" : "Replay the stars"}
          onClick={() => (playing ? stop() : play())}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className={styles.track}>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <clipPath id="played">
              <rect width={Math.max(playedPct, 0)} height="40" />
            </clipPath>
            <polygon className={styles.area} points={`0,40 ${curve} 100,40`} />
            <polygon
              className={styles.areaPlayed}
              points={`0,40 ${curve} 100,40`}
              clipPath="url(#played)"
            />
          </svg>
          <input
            type="range"
            className={styles.scrub}
            min={first}
            max={last}
            value={time}
            disabled={!stars.length}
            aria-label="Date"
            aria-valuetext={`${count} stars by ${month(time)}`}
            onChange={(e) => {
              stop();
              seek(Number(e.target.value));
            }}
          />
        </div>
        <p className={styles.count}>
          <strong>{count} ★</strong>
          <span>{stars.length ? month(time) : loaded ? "Be the first" : "…"}</span>
        </p>
        <a className={styles.cta} href={repoUrl} target="_blank" rel="noopener">
          ★ Tie knot #{(stars.length + 1).toLocaleString()}
        </a>
      </div>
    </>
  );
}
