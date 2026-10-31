import { useEffect, useSyncExternalStore } from "react";

/**
 * Runs `effect` once after mount, with its cleanup on unmount. The one sanctioned effect: for
 * starting and stopping things outside React (a WebGL viewer, a worker, a document listener).
 * Remount with a `key` to start over instead of adding dependencies.
 */
// eslint-disable-next-line react-hooks/exhaustive-deps
export const useMountEffect = (effect: () => void | (() => void)) => useEffect(effect, []);

const noop = () => () => {};
/** False while prerendering and hydrating, true after; for parts that only exist in the browser. */
export const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
