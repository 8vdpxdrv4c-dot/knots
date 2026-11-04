import { useState } from "react";
import { Link } from "react-router";
import { useMountEffect } from "../../shared/hooks";
import { StarIcon } from "../../shared/ui/icons";
import { markPromptSeen, promptSeen } from "./prompt";
import styles from "./stargazers.module.css";

/** How long a visitor looks at a knot before the prompt appears. */
const DELAY_MS = 10_000;

/**
 * Asks for a star once, ten seconds in, and never to someone who has already seen it or visited the
 * stargazer rope. `repoUrl` is the repository, `to` the rope's page.
 */
export function StarPrompt({ repoUrl, to }: { repoUrl: string; to: string }) {
  const [open, setOpen] = useState(false);
  useMountEffect(() => {
    if (promptSeen()) return;
    const id = setTimeout(() => {
      if (promptSeen()) return;
      markPromptSeen();
      setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(id);
  });
  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <aside className={styles.prompt} aria-label="Join the stargazer rope">
      <p>
        <strong>Enjoying it?</strong> Star the repo and your face joins the rope.
      </p>
      <div>
        <a
          className={styles.promptStar}
          href={repoUrl}
          target="_blank"
          rel="noopener"
          onClick={close}
        >
          <StarIcon /> Star on GitHub
        </a>
        <Link to={to}>See the rope</Link>
        <button type="button" onClick={close}>
          Not now
        </button>
      </div>
    </aside>
  );
}
