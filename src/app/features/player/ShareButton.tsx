import { useState } from "react";
import { absoluteUrl } from "../../shared/site";
import { CheckIcon, ShareIcon } from "../../shared/ui/icons";
import styles from "./player.module.css";

/** Shares a link to this knot's page: the system share sheet on touch devices, a copied link elsewhere. */
export function ShareButton({ name, path }: { name: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = absoluteUrl(path);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({
          title: `${name} · Knots Made Easy`,
          text: `${name}, step by step`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // The share sheet was dismissed, or the clipboard is blocked: nothing to do.
    }
  }

  return (
    <span className={styles.shareWrap}>
      <button
        type="button"
        className={styles.share}
        aria-label="Share this knot"
        title="Share this knot"
        onClick={share}
      >
        {copied ? <CheckIcon /> : <ShareIcon />}
      </button>
      {copied && (
        <span role="status" className={styles.toast}>
          Link copied
        </span>
      )}
    </span>
  );
}
