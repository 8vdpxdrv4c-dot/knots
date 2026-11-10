import { useState } from "react";
import { useSearchParams } from "react-router";
import { knots } from "../../engine/knots";
import type { KnotDef } from "../../engine/knots/types";
import { Player } from "../../engine/playback/player";
import type { KnotViewer } from "../../engine/render/viewer";
import { createKnotSession } from "../../engine/session";
import { KnotPicker } from "../features/picker";
import { PlayerBar, ShareButton } from "../features/player";
import { Tuner, physicsFromParams } from "../features/tuner";
import { ResetViewButton, ViewerCanvas, type StartViewer } from "../features/viewer";
import { pageCopy } from "../shared/copy";
import { useMountEffect } from "../shared/hooks";
import { LocaleProvider, localeForKnot } from "../shared/locale";
import { knotImagePath, knotPath } from "../shared/site";
import { iconButtonClass } from "../shared/ui/IconButton";
import { EyeIcon, EyeOffIcon } from "../shared/ui/icons";
import styles from "./KnotScreen.module.css";

/** A knot's whole page: the 3D view, its name and summary, the player, the picker and the links. */
export function KnotScreen({ knot }: { knot: KnotDef }) {
  const [params] = useSearchParams();
  const physics = physicsFromParams(params);
  // A new knot or rope material starts a fresh session (viewer, bake, player) by remounting.
  return <Session key={`${knot.id} ${JSON.stringify(physics)}`} knot={knot} physics={physics} />;
}

function Session({
  knot,
  physics,
}: {
  knot: KnotDef;
  physics: ReturnType<typeof physicsFromParams>;
}) {
  // Plain data, so the prerendered page shows the same first step and duration as the browser.
  const [player] = useState(() => Player.forKnot(knot));
  const [viewer, setViewer] = useState<KnotViewer | null>(null);
  const [clean, setClean] = useState(false);
  const start: StartViewer = (viewer, onDrawn) => {
    const session = createKnotSession(knot, player, physics);
    viewer.show(session, onDrawn);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) player.play();
    return session.dispose;
  };

  const locale = localeForKnot(knot.id);
  const copy = pageCopy(locale);
  // H hides or shows every control, for a clean view of the rope.
  useMountEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || document.querySelector("dialog[open]")) return;
      setClean((c) => !c);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <LocaleProvider locale={locale}>
      <div className={styles.page} data-clean={clean} data-locale={locale}>
        <ViewerCanvas poster={knotImagePath(knot.id)} start={start} onViewer={setViewer} />
        <header className={styles.top}>
          <button
            type="button"
            className={`${iconButtonClass} ${styles.hide}`}
            aria-label={clean ? copy.showControls : copy.hideControls}
            title={clean ? copy.showControls : copy.hideControls}
            aria-pressed={clean}
            onClick={(e) => {
              setClean(!clean);
              // After a mouse click, give Space back to play/pause.
              if (e.detail > 0) e.currentTarget.blur();
            }}
          >
            {clean ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </header>
        <div className={styles.chrome}>
          <KnotPicker knots={knots} currentId={knot.id} />
        </div>
        <section className={`${styles.intro} ${styles.chrome}`}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1>{knot.name}</h1>
          <p className={styles.summary}>{knot.summary}</p>
        </section>
        <div className={styles.chrome}>
          <PlayerBar
            player={player}
            steps={knot.steps}
            extra={
              <>
                <ShareButton name={knot.name} path={knotPath(knot.id)} />
                <ResetViewButton viewer={viewer} />
              </>
            }
          />
          <Tuner />
        </div>
        <footer className={`${styles.credit} ${styles.chrome}`}>
          {copy.creditBefore}
          <a href="https://x.com/baz7c8" target="_blank" rel="noopener">
            @baz7c8
          </a>
          {copy.creditAfter}
        </footer>
      </div>
    </LocaleProvider>
  );
}
