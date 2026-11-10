import { useState } from "react";
import { Link } from "react-router";
import { useMountEffect } from "../../shared/hooks";
import { useCopy } from "../../shared/locale";
import { StarIcon } from "../../shared/ui/icons";
import { type Feed, decodeFeed } from "./feed";
import styles from "./stargazers.module.css";

/** The pill that leads to the stargazer rope, with room for the latest three stargazers' faces, so loading them moves nothing. */
export function StargazerLink({
  to,
  src,
  className,
}: {
  to: string;
  src: string;
  className: string;
}) {
  const [faces, setFaces] = useState<string[]>([]);
  const copy = useCopy();
  useMountEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => r.json() as Promise<Feed>)
      .then(
        (feed) =>
          alive &&
          setFaces(
            decodeFeed(feed)
              .slice(-3)
              .map((s) => `${s.user.avatar_url}&s=40`),
          ),
      )
      .catch(() => {}); // The pill works without faces.
    return () => {
      alive = false;
    };
  });
  return (
    <Link className={className} to={to}>
      <StarIcon />
      <span>
        {[
          copy.stargazerLead,
          copy.stargazerRest ? (
            <span key="rest" className={styles.rope}>
              {copy.stargazerRest}
            </span>
          ) : null,
        ]}
      </span>
      <span className={styles.pillFaces} aria-hidden="true">
        {[0, 1, 2].map((i) =>
          faces[i] ? (
            <img key={faces[i]} src={faces[i]} alt="" width={20} height={20} />
          ) : (
            <i key={i} />
          ),
        )}
      </span>
    </Link>
  );
}
