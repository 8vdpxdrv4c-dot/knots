import { useState } from "react";
import { useSearchParams } from "react-router";
import { DEFAULT_PHYSICS } from "../../../engine/sim/rope";
import { useIsClient } from "../../shared/hooks";
import { useCopy } from "../../shared/locale";
import { SLIDERS, physicsFromParams, writePhysics } from "./physicsParams";
import styles from "./tuner.module.css";

/**
 * The material playground, shown with `?tune` in the URL: a slider per rope constant. Letting go
 * of a slider writes the values to the URL, which re-bakes the knot and keeps them for a share.
 */
export function Tuner() {
  const [params, setParams] = useSearchParams();
  // Prerendered pages have no query string, so the panel only exists in the browser.
  if (!useIsClient() || !params.has("tune")) return null;
  return <TunerPanel initial={physicsFromParams(params)} onApply={apply} />;

  function apply(physics: typeof DEFAULT_PHYSICS) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        writePhysics(next, physics);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
}

function TunerPanel({
  initial,
  onApply,
}: {
  initial: typeof DEFAULT_PHYSICS;
  onApply: (p: typeof DEFAULT_PHYSICS) => void;
}) {
  const [physics, setPhysics] = useState(initial);
  const copy = useCopy();
  return (
    <section className={styles.tuner} aria-label={copy.ropeMaterial}>
      <h2>{copy.ropeMaterial}</h2>
      {SLIDERS.map(({ key, label, min, max, step }) => (
        <label key={key} data-changed={physics[key] !== DEFAULT_PHYSICS[key]}>
          <span>{copy.physics[key] ?? label}</span>
          <output>{physics[key]}</output>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={physics[key]}
            onChange={(e) => setPhysics({ ...physics, [key]: Number(e.target.value) })}
            onPointerUp={() => onApply(physics)}
            onKeyUp={() => onApply(physics)}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={() => {
          setPhysics(DEFAULT_PHYSICS);
          onApply(DEFAULT_PHYSICS);
        }}
      >
        {copy.resetDefaults}
      </button>
    </section>
  );
}
