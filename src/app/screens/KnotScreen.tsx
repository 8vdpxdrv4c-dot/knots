import { useState } from "react";
import { useSearchParams } from "react-router";
import { knots } from "../../engine/knots";
import type { KnotDef } from "../../engine/knots/types";
import { Player } from "../../engine/playback/player";
import type { KnotViewer } from "../../engine/render/viewer";
import { createKnotSession } from "../../engine/session";
import { KnotPicker } from "../features/picker";
import { PlayerBar } from "../features/player";
import { Tuner, physicsFromParams } from "../features/tuner";
import { ResetViewButton, ViewerCanvas, type StartViewer } from "../features/viewer";
import { knotImagePath } from "../shared/site";
import { iconButtonClass } from "../shared/ui/IconButton";
import { GitHubIcon } from "../shared/ui/icons";
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
  const start: StartViewer = (viewer, onDrawn) => {
    const session = createKnotSession(knot, player, physics);
    viewer.show(session, onDrawn);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) player.play();
    return session.dispose;
  };

  return (
    <>
      <ViewerCanvas poster={knotImagePath(knot.id)} start={start} onViewer={setViewer} />
      <header className={styles.top}>
        <KnotPicker knots={knots} currentId={knot.id} />
        <a
          className={iconButtonClass}
          href="https://github.com/behnamazimi/knots-made-easy"
          target="_blank"
          rel="noopener"
          aria-label="View source on GitHub"
        >
          <GitHubIcon />
        </a>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>Knots made easy</p>
        <h1>{knot.name}</h1>
        <p className={styles.summary}>{knot.summary}</p>
      </section>
      <PlayerBar player={player} steps={knot.steps} extra={<ResetViewButton viewer={viewer} />} />
      <Tuner />
      <footer className={styles.credit}>
        made by{" "}
        <a href="https://x.com/baz7c8" target="_blank" rel="noopener">
          @baz7c8
        </a>
      </footer>
    </>
  );
}
