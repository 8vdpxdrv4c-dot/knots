/** One entry of GitHub's stargazers API (`Accept: application/vnd.github.star+json`). */
export type Star = {
  starred_at: string;
  user: { login: string; avatar_url: string; html_url: string };
};

/** How many stars were given by `time` (stars sorted by date). */
export const countAt = (stars: readonly Star[], time: number) => {
  let n = 0;
  while (n < stars.length && Date.parse(stars[n].starred_at) <= time) n++;
  return n;
};

// Rope lengths, in rope diameters.
const LEAD = 8; // bare rope before the first knot and after the last
const TIGHT = 5; // knot to knot for stars given moments apart: the knot and its avatars just fit
const STEP = 3.2; // extra rope each time the wait between two stars doubles, past the usual wait
const LOOSE = 34; // the most rope one lull gets, however long it was

/** A steady random number in [0, 1) for star `i`, so its knot never moves as stars arrive. */
export const jitter = (i: number, salt = 0) => {
  const h = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * Rope between two knots for a wait of `wait`, where `usual` is this repo's typical wait between
 * stars: tight for a burst, a fixed step more each time the wait doubles, capped. On a log scale
 * a quiet week reads clearly longer than a quiet hour without becoming a long empty swipe, and
 * measuring against the repo's own pace makes it read the same for a repo with 5 stars a year or
 * 1,000 a day: tight means busier than usual, loose means quieter.
 */
export const gapFor = (wait: number, usual: number) =>
  Math.min(TIGHT + STEP * Math.log2(1 + Math.max(wait, 0) / usual), LOOSE);

/**
 * Where each of the first `shown` knots sits along the rope, in rope diameters from its start,
 * given every star's time in ms (sorted). Spacing comes from the wait since the star before,
 * with a little hand-tied wobble. The usual wait is the median over all stars, so knots don't
 * move while the rope replays.
 */
export function ropeLayout(times: readonly number[], shown: number) {
  const waits = times.slice(1).map((t, i) => t - times[i]);
  const sorted = [...waits].sort((a, b) => a - b);
  const usual = Math.max(sorted[Math.floor(sorted.length / 2)] ?? 0, 60_000); // at least a minute
  const knots: number[] = [];
  let s = LEAD;
  for (let i = 0; i < Math.min(shown, times.length); i++) {
    if (i > 0) s += gapFor(waits[i - 1], usual) * (0.88 + 0.24 * jitter(i));
    knots.push(s);
  }
  return { knots, end: (knots[knots.length - 1] ?? 0) + LEAD };
}

/** The band the rope may use, in canvas px (below the intro panel, above the timeline bar). */
export type Band = { top: number; bottom: number };

// Pictures of the real rope, a finished overhand knot and the rope's end, made by
// tools/stargazer-sprites.mjs at PX pixels per rope diameter; the end sits TIP diameters into
// its picture. Drawing them is far cheaper than building the 3D rope.
const PX = 32;
const TIP = 5;
const image = (src: string) => Object.assign(new Image(), { src });
const AVATAR = 2.4; // avatar radius, in rope diameters: bigger than a knot, so people come first
const SPARE = 7; // loop size in the loose pile of rope left for new stars, in rope diameters
const ACCENT = "#b9522c";
const POP = 420; // ms for a new knot to pop in
const PULSE = 1800; // ms of rings round a found knot
/** Frame-rate-independent easing: the share of the way to close in `dt` ms, `rate` per 60 Hz frame. */
const ease = (rate: number, dt: number) => 1 - (1 - rate) ** (dt / (1000 / 60));
/** Overshoots a little and settles, like a knot snapping tight. */
const popOut = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;

/**
 * The stars as one long rope wandering across the page, oldest first: each star is a small
 * overhand knot with the stargazer's avatar tied beside it. Knots crowd together in a burst of
 * stars and spread apart in a lull (`gapFor`); past the newest star a loose pile of spare rope
 * waits for the next ones. It opens on the newest stars and swipes (or wheels) back through the older ones.
 *
 * It only redraws when something moved or changed, so an idle page costs nothing. Runs its own
 * loop until `dispose`.
 */
export class StarRope {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 7; // rope diameter on screen, px
  private y0 = 0; // the middle of the rope's wander
  private sway = 0; // how far it wanders up and down
  private stars: Star[] = [];
  private times: number[] = [];
  private shown = 0; // stars tied so far
  private layoutCache: ReturnType<typeof ropeLayout> = { knots: [], end: 0 };
  private born = new Map<number, number>(); // when each knot was tied, for its pop-in
  private faces = new Map<number, { img: HTMLImageElement; cut: HTMLCanvasElement | null }>();
  private spots: { i: number; x: number; y: number }[] = []; // avatars drawn last frame, for hover
  private hovered = -1;
  private hoverGrow = 0; // 0 → 1 as the hovered avatar grows
  private found = -1; // the star someone searched for: centred and marked with its number
  private foundAt = 0;
  private target: number | null = null; // scroll position to glide to
  private scroll = 0; // rope position (px along it) at the screen's left edge
  private velocity = 0; // px per ms, after a swipe
  private follow = true; // keep the newest stars and the spare rope in view as stars arrive
  private drag: { x: number; scroll: number; moved: number; last: number; at: number } | null =
    null;
  private strip: HTMLCanvasElement | null = null; // the rope picture twice over, so slices never wrap
  private knot = image("/stargazers/overhand.png");
  private tip = image("/stargazers/tip.png");
  private dirty = true; // something changed: draw the next frame
  private last = 0;
  private frame = 0;
  private resize = new ResizeObserver(() => this.layout());
  private listeners: [string, EventListener][] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private band: () => Band,
  ) {
    this.ctx = canvas.getContext("2d")!;
    const rope = image("/stargazers/rope.png");
    rope.onload = () => {
      this.strip = document.createElement("canvas");
      this.strip.width = rope.width * 2;
      this.strip.height = rope.height;
      const c = this.strip.getContext("2d")!;
      c.drawImage(rope, 0, 0);
      c.drawImage(rope, rope.width, 0);
      this.dirty = true;
    };
    for (const img of [this.knot, this.tip]) img.onload = () => (this.dirty = true);

    this.on("pointerdown", (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, scroll: this.scroll, moved: 0, last: e.clientX, at: e.timeStamp };
      this.velocity = 0;
    });
    this.on("pointermove", (e: PointerEvent) => {
      const d = this.drag;
      if (!d) return;
      d.moved = Math.max(d.moved, Math.abs(e.clientX - d.x));
      // A smoothed release speed, so a flick carries on at the speed it was going.
      const v = (d.last - e.clientX) / Math.max(e.timeStamp - d.at, 1);
      this.velocity = this.velocity * 0.6 + v * 0.4;
      [d.last, d.at] = [e.clientX, e.timeStamp];
      this.scroll = d.scroll - (e.clientX - d.x);
      if (d.moved > 4) [this.follow, this.target] = [false, null];
      this.dirty = true;
    });
    this.on("pointerup", (e: PointerEvent) => {
      if (this.drag && (this.drag.moved < 5 || e.timeStamp - this.drag.at > 80)) this.velocity = 0;
      // Cleared after the click that follows, so the click can tell a swipe from a tap.
      setTimeout(() => (this.drag = null));
    });
    this.on("wheel", (e: WheelEvent) => {
      e.preventDefault();
      this.scroll += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.velocity = 0;
      [this.follow, this.target] = [false, null];
      this.dirty = true;
    });
    this.resize.observe(canvas);
    const loop = (now: number) => {
      const dt = Math.min(now - (this.last || now), 64);
      this.last = now;
      if (this.step(now, dt) || this.dirty) {
        this.dirty = false;
        this.draw(now);
      }
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private on<E extends Event>(type: string, fn: (e: E) => void) {
    this.canvas.addEventListener(type, fn as EventListener, { passive: false });
    this.listeners.push([type, fn as EventListener]);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    for (const [type, fn] of this.listeners) this.canvas.removeEventListener(type, fn);
  }

  /** Whether the press that just ended was a swipe rather than a tap. */
  get swiped() {
    return (this.drag?.moved ?? 0) >= 5;
  }

  setStars(stars: Star[]) {
    this.stars = stars;
    this.times = stars.map((s) => Date.parse(s.starred_at));
    this.relayout();
  }

  /** Show the first `n` stars: the rope grows knot by knot, each popping in, and the view follows. */
  setCount(n: number) {
    if (n === this.shown) return;
    const now = performance.now();
    for (let i = this.shown; i < n; i++) this.born.set(i, now);
    this.follow = true;
    this.shown = n;
    this.relayout();
  }

  /** Glide to star `i` (it must be shown), centre it and mark it with its knot number. */
  find(i: number) {
    const { knots } = this.layoutCache;
    if (i < 0 || i >= knots.length) return;
    this.found = i;
    this.foundAt = performance.now();
    this.follow = false;
    this.velocity = 0;
    this.target = knots[i] * this.t - this.w / 2;
  }

  /** The star whose avatar is under a point (canvas px), or null. */
  pick(mx: number, my: number) {
    let best = (this.t * AVATAR + 3) ** 2;
    let hit = -1;
    for (const s of this.spots) {
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
      if (d < best) [best, hit] = [d, s.i];
    }
    if (hit !== this.hovered) [this.hovered, this.hoverGrow, this.dirty] = [hit, 0, true];
    return hit === -1 ? null : this.stars[hit];
  }

  private relayout() {
    this.layoutCache = ropeLayout(this.times, this.shown);
    this.dirty = true;
  }

  private layout() {
    this.dpr = devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.t = this.w < 600 ? 6 : 7;
    this.faces.forEach((f) => (f.cut = null)); // re-cut at the new size
    this.fit();
    this.dirty = true;
  }

  /** Fit the rope's wander to the band, which changes when the intro panel grows. */
  private fit() {
    const { top, bottom } = this.band();
    const y0 = (top + bottom) / 2;
    // Room above and below for a knot, its tie and its avatar.
    const sway = Math.max(0, (bottom - top) / 2 - this.t * (AVATAR * 2 + 2.5));
    if (y0 !== this.y0 || sway !== this.sway) [this.y0, this.sway, this.dirty] = [y0, sway, true];
  }

  /** Moves the view on by `dt` ms; returns whether anything is still moving. */
  private step(now: number, dt: number) {
    this.fit();
    const before = this.scroll;
    const end = this.layoutCache.end * this.t;
    const min = -this.t * 4;
    const max = Math.max(min, end + SPARE * 4.4 * this.t - this.w);
    if (this.target !== null) {
      const goal = Math.min(Math.max(this.target, min), max);
      this.scroll += (goal - this.scroll) * ease(0.1, dt);
    } else if (this.follow) this.scroll += (max - this.scroll) * ease(0.12, dt);
    else if (!this.drag) {
      this.scroll += this.velocity * dt;
      this.velocity *= Math.exp(-dt / 325); // a flick glides out over about a second
      if (Math.abs(this.velocity) < 0.01) this.velocity = 0;
      if (this.scroll < min) this.scroll += (min - this.scroll) * ease(0.2, dt);
      if (this.scroll > max) this.scroll += (max - this.scroll) * ease(0.2, dt);
    }
    if (Math.abs(this.scroll - before) < 0.05) this.scroll = before;
    let moving = this.scroll !== before;
    if (this.hovered !== -1 && this.hoverGrow < 1) {
      this.hoverGrow = Math.min(1, this.hoverGrow + dt / 160);
      moving = true;
    }
    for (const [i, at] of this.born) {
      if (now - at < POP) moving = true;
      else this.born.delete(i);
    }
    return moving || (this.found !== -1 && now - this.foundAt < PULSE);
  }

  /**
   * The rope's wander: a few slow waves of different lengths, so it never repeats or reads as a
   * pattern. It lies still.
   */
  private wander(s: number) {
    const t = this.t;
    return (
      this.y0 +
      this.sway *
        (0.5 * Math.sin(s / (47 * t) + 1.3) +
          0.32 * Math.sin(s / (19 * t) + 4.1) +
          0.18 * Math.sin(s / (8.3 * t) + 2.2))
    );
  }

  /** Screen point and angle of the rope `s` px along it. */
  private point(s: number): [number, number, number] {
    const y = this.wander(s);
    return [s - this.scroll, y, Math.atan(this.wander(s + 1) - y)];
  }

  /** Star `i`'s avatar cut into a circle once, at `r` px, so drawing it is one plain copy. */
  private face(i: number, r: number) {
    let f = this.faces.get(i);
    if (!f) {
      const img = image(`${this.stars[i].user.avatar_url}&s=96`);
      f = { img, cut: null };
      img.onload = () => (this.dirty = true);
      this.faces.set(i, f);
    }
    if (!f.cut && f.img.complete && f.img.naturalWidth) {
      const size = Math.ceil(r * 2 * this.dpr * 1.6); // room for the hover and found sizes
      const cut = document.createElement("canvas");
      cut.width = cut.height = size;
      const c = cut.getContext("2d")!;
      c.beginPath();
      c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      c.clip();
      c.drawImage(f.img, 0, 0, size, size);
      f.cut = cut;
    }
    return f.cut;
  }

  private draw(now: number) {
    const { ctx, t } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.times.length) return;
    const { knots, end: endD } = this.layoutCache;
    const end = endD * t;
    const strip = this.strip;
    const from = Math.max(this.scroll - t * 6, 0);
    const to = Math.min(this.scroll + this.w + t * 6, end);

    /** One slice of the rope picture from (x0, y0) to (x1, y1), `s` px into its pattern. */
    const lay = (x0: number, y0: number, x1: number, y1: number, s: number) => {
      if (!strip) return;
      if (Math.max(x0, x1) < -t * 2 || Math.min(x0, x1) > this.w + t * 2) return;
      const l = Math.hypot(x1 - x0, y1 - y0);
      const scale = PX / t;
      const a = Math.atan2(y1 - y0, x1 - x0);
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      ctx.setTransform(
        c * this.dpr,
        sn * this.dpr,
        -sn * this.dpr,
        c * this.dpr,
        x0 * this.dpr,
        y0 * this.dpr,
      );
      ctx.drawImage(
        strip,
        (s * scale) % (strip.width / 2),
        0,
        l * scale,
        strip.height,
        0,
        -t,
        l + 0.8,
        2 * t,
      );
    };
    const reset = () => ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // The rope.
    for (let s = from; s < to; s += t * 2) {
      const [x0, y0] = this.point(s);
      const [x1, y1] = this.point(Math.min(s + t * 2, to));
      lay(x0, y0, x1, y1, s);
    }
    // Spare rope dropped in a loose pile past the newest knot: uneven loops that wander and
    // cross, as rope lands when it's let fall, and a smooth curve into it.
    const [ex, ey, ea] = this.point(end);
    const R = SPARE * t;
    // The pile's top meets the rope's height, so the rope runs straight into it.
    const [px, py] = [ex + R * 0.9, ey + R * 0.8];
    const loop = (a: number): [number, number] => {
      const r = R * (1 + 0.22 * Math.sin(1.3 * a + 0.7) + 0.12 * Math.sin(2.9 * a + 2.1));
      const cx = px + t * 2.2 * Math.sin(0.45 * a + 1.1);
      const cy = py + t * 1.6 * Math.cos(0.6 * a + 0.4);
      return [cx - r * Math.cos(a), cy - r * 0.8 * Math.sin(a)];
    };
    const pile: [number, number][] = [];
    const START = Math.PI / 2; // the top of the first loop, heading right like the rope coming in
    const [sx0, sy0] = loop(START);
    const c1 = [ex + Math.cos(ea) * t * 4, ey + Math.sin(ea) * t * 4];
    const c2 = [sx0 - t * 4, sy0];
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      const v = 1 - u;
      pile.push([
        ex * v ** 3 + 3 * c1[0] * v * v * u + 3 * c2[0] * v * u * u + sx0 * u ** 3,
        ey * v ** 3 + 3 * c1[1] * v * v * u + 3 * c2[1] * v * u * u + sy0 * u ** 3,
      ]);
    }
    for (let a = START + 0.1; a <= START + Math.PI * 2 * 4.6; a += 0.1) pile.push(loop(a));
    // The end flops out of the pile: it turns gradually away from the middle and runs out past
    // the loops, so its cut end lies in the open.
    let [lx, ly] = pile[pile.length - 1];
    const [qx, qy] = pile[pile.length - 2];
    let dir = Math.atan2(ly - qy, lx - qx);
    for (let k = 0; k < 16; k++) {
      const out = Math.atan2(ly - py, lx - px);
      const turn = Math.atan2(Math.sin(out - dir), Math.cos(out - dir));
      dir += turn * 0.18;
      [lx, ly] = [lx + Math.cos(dir) * t, ly + Math.sin(dir) * t];
      pile.push([lx, ly]);
    }
    let along = end;
    let [ax0, ay0] = [ex, ey];
    for (const [x1, y1] of pile) {
      lay(ax0, ay0, x1, y1, along);
      along += Math.hypot(x1 - ax0, y1 - ay0);
      [ax0, ay0] = [x1, y1];
    }
    reset();

    // The rope's real ends: its start, and its end flopped out of the spare pile.
    if (this.tip.complete && this.tip.naturalWidth) {
      const tw = (this.tip.width / PX) * t;
      const th = (this.tip.height / PX) * t;
      // The start points back along the rope's own slope, so it carries on the rope's line.
      const [sx, sy, sa] = this.point(0);
      for (const [x, y, a] of [
        [sx, sy, sa + Math.PI],
        [lx, ly, dir],
      ]) {
        if (x < -tw || x > this.w + tw) continue;
        ctx.translate(x, y);
        ctx.rotate(a);
        if (Math.cos(a) < 0) ctx.scale(1, -1); // pointing left: mirror, so its light stays on top
        ctx.drawImage(this.tip, -TIP * t, -th / 2, tw, th);
        reset();
      }
    }

    // Each star: its knot on the rope, its avatar tied beside it, alternating above and below.
    // New knots pop in: they grow from nothing with a little overshoot.
    const kw = (this.knot.width / PX) * t;
    const kh = (this.knot.height / PX) * t;
    const r = t * AVATAR;
    const pop = (i: number) => {
      const at = this.born.get(i);
      return at === undefined ? 1 : popOut(Math.min((now - at) / POP, 1));
    };
    this.spots = [];
    ctx.strokeStyle = "rgb(35 32 28 / 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const tied: [number, number, number, number][] = []; // knot x, y, angle, star
    knots.forEach((k, i) => {
      const s = k * t;
      if (s < this.scroll - r * 3 || s > this.scroll + this.w + r * 3) return;
      const [x, y] = this.point(s);
      // Turned to the rope either side of it, so both ends of the knot lie on the rope.
      const a = Math.atan2(this.wander(s + t * 2.5) - this.wander(s - t * 2.5), t * 5);
      // Alternating sides, each tie a little longer or shorter and leaning a little, by hand.
      const side = i % 2 ? 1 : -1;
      const off = (t * 1.3 + r + jitter(i, 1) * t * 1.6) * pop(i);
      const lean = a + (jitter(i, 2) - 0.5) * 0.7;
      const ax = x - Math.sin(lean) * off * side;
      const ay = y + Math.cos(lean) * off * side;
      ctx.moveTo(x, y);
      ctx.lineTo(ax, ay);
      tied.push([x, y, a, i]);
      this.spots.push({ i, x: ax, y: ay });
    });
    ctx.stroke();
    if (this.knot.complete && this.knot.naturalWidth)
      for (const [x, y, a, i] of tied) {
        const p = pop(i);
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.drawImage(this.knot, (-kw / 2) * p, (-kh / 2) * p, kw * p, kh * p);
        reset();
      }

    // Avatars, the searched-for star last so it sits on top of its neighbours.
    this.spots.sort((a, b) => Number(a.i === this.found) - Number(b.i === this.found));
    const grow = 1 - (1 - this.hoverGrow) ** 3;
    for (const { i, x, y } of this.spots) {
      const found = i === this.found;
      const hover = i === this.hovered;
      const rr = r * pop(i) * (found ? 1.6 : 1 + (hover ? 0.35 * grow : 0));
      if (rr < 0.5) continue;
      const cut = this.face(i, r);
      if (cut) ctx.drawImage(cut, x - rr, y - rr, rr * 2, rr * 2);
      else {
        ctx.fillStyle = "#d8cfc2";
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = found || hover || i === this.shown - 1 ? ACCENT : "#fffdf9";
      ctx.lineWidth = found || hover ? 2.5 : 2;
      ctx.stroke();
      if (found) {
        // Rings pulse out from the found avatar for a moment.
        const age = now - this.foundAt;
        for (let k = 0; k < 3; k++) {
          const u = (age - k * 260) / 900;
          if (u <= 0 || u >= 1) continue;
          ctx.globalAlpha = 1 - u;
          ctx.beginPath();
          ctx.arc(x, y, rr + u * r * 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // A tag with the knot's number above the avatar.
        const label = `#${i + 1}`;
        ctx.font = "800 14px ui-sans-serif, system-ui, sans-serif";
        const w = ctx.measureText(label).width + 18;
        const ty = y - rr - 32;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, ty, w, 24, 12);
        ctx.fill();
        ctx.fillStyle = "#fffdf9";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, ty + 12);
      }
    }

    // A note on the spare rope, above the pile and the rope coming into it.
    const top = Math.min(...pile.map(([, y]) => y), ey);
    ctx.fillStyle = ACCENT;
    ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("your knot goes here", px, top - t * 1.5); // moves with the pile
  }
}
