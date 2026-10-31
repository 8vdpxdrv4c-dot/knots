import { useRef, useState, useSyncExternalStore } from "react";
import { KnotViewer } from "../../../engine/render/viewer";
import { useMountEffect } from "../../shared/hooks";
import { ResetViewIcon } from "../../shared/ui/icons";
import styles from "./viewer.module.css";

/** Starts what the viewer shows; returns a cleanup. Call `onDrawn` once the first frame is on screen. */
export type StartViewer = (viewer: KnotViewer, onDrawn: () => void) => () => void;

/**
 * The 3D view: a full-screen canvas with the knot's picture over it until the first frame is drawn,
 * so the page is never empty and nothing moves when the scene appears. Remount it to start over.
 * `onViewer` hands out the viewer (and null when it is gone), e.g. for a ResetViewButton elsewhere.
 */
export function ViewerCanvas({
  poster,
  start,
  onViewer,
}: {
  poster: string;
  start: StartViewer;
  onViewer?: (viewer: KnotViewer | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useMountEffect(() => {
    const v = new KnotViewer(canvas.current!);
    const stop = start(v, () => setDrawn(true));
    onViewer?.(v);
    return () => {
      onViewer?.(null);
      stop();
      v.dispose();
    };
  });

  return (
    <>
      <canvas
        ref={canvas}
        className={styles.scene}
        aria-label="3D view of the rope. Drag to turn it, scroll or pinch to zoom."
      />
      <img className={styles.poster} src={poster} alt="" data-hidden={drawn} decoding="async" />
    </>
  );
}

const noViewer = () => () => {};

/**
 * Eases the camera back to where it started; dimmed while the view is already there. Rendered
 * before the viewer exists too (disabled), so the page's layout is the same before and after.
 */
export function ResetViewButton({ viewer }: { viewer: KnotViewer | null }) {
  const isDefault = useSyncExternalStore(
    viewer?.onViewChange ?? noViewer,
    () => viewer?.isDefaultView() ?? true,
    () => true,
  );
  return (
    <button
      type="button"
      className={styles.reset}
      aria-label="Reset view"
      title="Reset view"
      disabled={isDefault}
      onClick={() => viewer?.resetView()}
    >
      <ResetViewIcon />
    </button>
  );
}
