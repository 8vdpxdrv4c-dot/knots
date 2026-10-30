import type { KnotDef } from "../knots/types";

export interface PlayerState {
  time: number;
  ready: number;
  duration: number;
  playing: boolean;
  loop: boolean;
}

export interface PlayerActions {
  togglePlay(): void;
  seek(time: number): void;
  setSpeed(speed: number): void;
  toggleLoop(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Wires the playback bar in index.html. Returns a function that redraws it from state. */
export function createControls(knot: KnotDef, duration: number, actions: PlayerActions) {
  const play = $<HTMLButtonElement>("play");
  const scrub = $<HTMLInputElement>("scrub");
  const loop = $<HTMLButtonElement>("loop");
  const ready = $("ready");
  const played = $("played");
  const clock = $("clock");
  const stepNum = $("step-num");
  const stepTitle = $("step-title");
  const ticks = $("ticks");

  $("knot-name").textContent = knot.name;
  $("knot-summary").textContent = knot.summary;
  document.title = `${knot.name} · Knots Made Easy`;
  scrub.max = String(duration);

  const tickButtons = knot.steps.map((step, i) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.style.left = `${(step.t / duration) * 100}%`;
    button.setAttribute("aria-label", `Step ${i + 1}: ${step.title}`);
    button.title = step.title;
    button.onclick = () => actions.seek(step.t);
    li.append(button);
    ticks.append(li);
    return button;
  });

  const stepAt = (time: number) => {
    let i = 0;
    while (i < knot.steps.length - 1 && time >= knot.steps[i + 1].t) i++;
    return i;
  };

  play.onclick = actions.togglePlay;
  loop.onclick = actions.toggleLoop;
  scrub.oninput = () => actions.seek(Number(scrub.value));
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="speed"]'))
    radio.onchange = () => actions.setSpeed(Number(radio.value));

  document.addEventListener("keydown", (e) => {
    // Let focused controls handle their own keys.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (e.key === " ") {
      e.preventDefault();
      actions.togglePlay();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const i = stepAt(Number(scrub.value)) + (e.key === "ArrowRight" ? 1 : -1);
      const step = knot.steps[Math.min(Math.max(i, 0), knot.steps.length - 1)];
      actions.seek(step.t);
    }
  });

  let lastStep = -1;
  return (s: PlayerState) => {
    const t = Math.min(s.time, duration);
    play.setAttribute("aria-pressed", String(s.playing));
    play.setAttribute("aria-label", s.playing ? "Pause" : "Play");
    loop.setAttribute("aria-pressed", String(s.loop));
    if (document.activeElement !== scrub) scrub.value = String(t);
    scrub.setAttribute("aria-valuetext", `${t.toFixed(1)} of ${duration.toFixed(1)} seconds`);
    played.style.width = `${(t / duration) * 100}%`;
    ready.style.width = `${(s.ready / duration) * 100}%`;
    clock.textContent = `${t.toFixed(1)}s`;
    const step = stepAt(t);
    if (step !== lastStep) {
      lastStep = step;
      stepNum.textContent = `${step + 1}/${knot.steps.length}`;
      stepTitle.textContent = knot.steps[step].title;
      tickButtons.forEach((b, i) =>
        i === step ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"),
      );
    }
  };
}
