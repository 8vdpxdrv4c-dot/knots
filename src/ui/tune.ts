import { DEFAULT_PHYSICS, type RopePhysics } from "../sim/rope";

const SLIDERS: { key: keyof RopePhysics; label: string; min: number; max: number; step: number }[] =
  [
    { key: "bend", label: "Bending stiffness (N·m²)", min: 0.002, max: 0.05, step: 0.001 },
    { key: "twist", label: "Twist stiffness (N·m²)", min: 0.001, max: 0.04, step: 0.001 },
    { key: "mass", label: "Rope mass (kg)", min: 0.2, max: 5, step: 0.1 },
    { key: "friction", label: "Friction", min: 0.1, max: 1.2, step: 0.05 },
    { key: "airDamping", label: "Air damping (1/s)", min: 0, max: 20, step: 0.5 },
    { key: "internalDamping", label: "Internal damping", min: 0, max: 0.5, step: 0.01 },
  ];

/** Rope physics from the URL (`?tune&bend=0.015&mass=1.5`), defaults for anything left out. */
export function physicsFromUrl(): RopePhysics {
  const params = new URLSearchParams(location.search);
  const p = { ...DEFAULT_PHYSICS };
  for (const { key } of SLIDERS) {
    const v = Number(params.get(key));
    if (params.has(key) && Number.isFinite(v) && v >= 0) p[key] = v;
  }
  return p;
}

/**
 * The material playground, shown with `?tune` in the URL: a slider per rope constant. Letting go of
 * a slider re-bakes the knot with the new values, and the URL keeps them for a reload or a share.
 */
export function createTuner(onChange: (physics: RopePhysics) => void) {
  if (!new URLSearchParams(location.search).has("tune")) return;
  const physics = physicsFromUrl();
  const panel = document.createElement("section");
  panel.className = "tuner";
  panel.setAttribute("aria-label", "Rope material");
  const title = document.createElement("h2");
  title.textContent = "Rope material";
  panel.append(title);

  const apply = () => {
    const params = new URLSearchParams(location.search);
    for (const { key } of SLIDERS) {
      if (physics[key] === DEFAULT_PHYSICS[key]) params.delete(key);
      else params.set(key, String(physics[key]));
    }
    history.replaceState(null, "", `?${params.toString().replace("tune=", "tune")}`);
    onChange({ ...physics });
  };

  const inputs = SLIDERS.map(({ key, label, min, max, step }) => {
    const row = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("output");
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min, max, step, value: String(physics[key]) });
    const show = () => {
      value.textContent = String(physics[key]);
      row.classList.toggle("changed", physics[key] !== DEFAULT_PHYSICS[key]);
    };
    input.oninput = () => {
      physics[key] = Number(input.value);
      show();
    };
    input.onchange = apply;
    show();
    row.append(name, value, input);
    panel.append(row);
    return { input, show, key };
  });

  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset to defaults";
  reset.onclick = () => {
    Object.assign(physics, DEFAULT_PHYSICS);
    for (const { input, show, key } of inputs) {
      input.value = String(physics[key]);
      show();
    }
    apply();
  };
  panel.append(reset);
  document.body.append(panel);
}
