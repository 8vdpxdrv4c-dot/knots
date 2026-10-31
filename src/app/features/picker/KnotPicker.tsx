import { useRef } from "react";
import { Link } from "react-router";
import type { KnotDef } from "../../../engine/knots/types";
import { knotImagePath, knotPath } from "../../shared/site";
import { CloseIcon, MenuIcon } from "../../shared/ui/icons";
import styles from "./picker.module.css";

/** The "All knots" button and its sheet: a grid of cards, each a link to a knot's page. */
export function KnotPicker({ knots, currentId }: { knots: KnotDef[]; currentId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <MenuIcon />
        All knots
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="picker-title"
        // The sheet fills the dialog, so a click on the dialog itself is a click on the backdrop.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className={styles.sheet}>
          <div className={styles.head}>
            <h2 id="picker-title">Pick a knot</h2>
            <button type="button" className={styles.close} aria-label="Close" onClick={close}>
              <CloseIcon />
            </button>
          </div>
          <ul className={styles.grid}>
            {knots.map((k) => (
              <li key={k.id}>
                <Link
                  to={knotPath(k.id)}
                  className={styles.card}
                  aria-current={k.id === currentId ? "page" : undefined}
                  onClick={close}
                >
                  <img src={knotImagePath(k.id)} alt="" width={1200} height={630} loading="lazy" />
                  <strong>{k.name}</strong>
                  <span>{k.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
