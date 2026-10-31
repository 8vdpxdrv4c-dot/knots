import { DEFAULT_PHYSICS, type RopePhysics } from "../../../engine/sim/rope";

export const SLIDERS: {
  key: keyof RopePhysics;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "bend", label: "Bending stiffness (N·m²)", min: 0.002, max: 0.05, step: 0.001 },
  { key: "twist", label: "Twist stiffness (N·m²)", min: 0.001, max: 0.04, step: 0.001 },
  { key: "mass", label: "Rope mass (kg)", min: 0.2, max: 5, step: 0.1 },
  { key: "friction", label: "Friction", min: 0.1, max: 1.2, step: 0.05 },
  { key: "airDamping", label: "Air damping (1/s)", min: 0, max: 20, step: 0.5 },
  { key: "internalDamping", label: "Internal damping", min: 0, max: 0.5, step: 0.01 },
];

/** Rope physics from the URL (`?tune&bend=0.015&mass=1.5`), defaults for anything left out. */
export function physicsFromParams(params: URLSearchParams): RopePhysics {
  const p = { ...DEFAULT_PHYSICS };
  for (const { key } of SLIDERS) {
    const v = Number(params.get(key));
    if (params.has(key) && Number.isFinite(v) && v >= 0) p[key] = v;
  }
  return p;
}

/** Writes `physics` into `params`, leaving out values that equal the defaults. */
export function writePhysics(params: URLSearchParams, physics: RopePhysics) {
  for (const { key } of SLIDERS) {
    if (physics[key] === DEFAULT_PHYSICS[key]) params.delete(key);
    else params.set(key, String(physics[key]));
  }
}
