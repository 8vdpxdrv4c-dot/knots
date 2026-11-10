import { useRef } from "react";
import { Link } from "react-router";
import type { KnotDef } from "../../../engine/knots/types";
import { useMountEffect } from "../../shared/hooks";
import { useCopy } from "../../shared/locale";
import { knotPath } from "../../shared/site";
import styles from "./picker.module.css";

/** A short, scrollable list of every knot, fixed on the right of the page. */
export function KnotPicker({ knots, currentId }: { knots: KnotDef[]; currentId: string }) {
  const copy = useCopy();
  const current = useRef<HTMLAnchorElement>(null);
  useMountEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  });

  return (
    <nav className={styles.rail} aria-labelledby="knot-list-title">
      <h2 id="knot-list-title">{copy.allKnots}</h2>
      <ul>
        {knots.map((k) => (
          <li key={k.id}>
            <Link
              ref={k.id === currentId ? current : undefined}
              to={knotPath(k.id)}
              aria-current={k.id === currentId ? "page" : undefined}
            >
              {k.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
