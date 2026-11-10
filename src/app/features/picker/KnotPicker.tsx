import { useRef } from "react";
import { Link } from "react-router";
import type { KnotDef } from "../../../engine/knots/types";
import { useMountEffect } from "../../shared/hooks";
import { ZH_LIST_NAMES, listEnglishName } from "../../shared/copy";
import { useCopy, useLocale } from "../../shared/locale";
import { knotPath } from "../../shared/site";
import styles from "./picker.module.css";

/** A short, scrollable list of every knot, fixed on the right of the page. */
export function KnotPicker({ knots, currentId }: { knots: KnotDef[]; currentId: string }) {
  const copy = useCopy();
  const bilingual = useLocale() === "zh-CN";
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
              {bilingual ? (
                <>
                  <span className={styles.primary}>{ZH_LIST_NAMES[k.id] ?? k.name}</span>
                  <span className={styles.secondary}>{listEnglishName(k)}</span>
                </>
              ) : (
                k.name
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
