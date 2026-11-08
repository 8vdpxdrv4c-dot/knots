import { useState } from "react";
import { useCopy } from "../../shared/locale";
import { absoluteUrl } from "../../shared/site";
import { CheckIcon, ShareIcon } from "../../shared/ui/icons";
import styles from "./player.module.css";

/** Shares a link to this knot's page: the system share sheet on touch devices, a copied link elsewhere. */
export function ShareButton({ name, path }: { name: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCopy();

  async function share() {
    const url = absoluteUrl(path);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({
          title: copy.shareTitle(name),
          text: copy.shareText(name),
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
        aria-label={copy.share}
        title={copy.share}
        onClick={share}
      >
        {copied ? <CheckIcon /> : <ShareIcon />}
      </button>
      {copied && (
        <span role="status" className={styles.toast}>
          {copy.linkCopied}
        </span>
      )}
    </span>
  );
}
