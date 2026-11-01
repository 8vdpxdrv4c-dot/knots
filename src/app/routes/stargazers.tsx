import { Link } from "react-router";
import { STARGAZER_PICTURES, StargazerRope } from "../features/stargazers";
import { REPO_URL, SITE_NAME, STARGAZERS_DATA } from "../shared/site";
import { iconButtonClass } from "../shared/ui/IconButton";
import { CloseIcon, GitHubIcon } from "../shared/ui/icons";

export const meta = () => [
  { title: `Stargazer rope · ${SITE_NAME}` },
  { name: "description", content: "Every GitHub star ties a knot on one rope." },
];

// Fetched with the page, not once the rope's script has started: the rope pictures and the feed.
export const links = () => [
  ...STARGAZER_PICTURES.map((href) => ({
    rel: "preload",
    as: "image",
    href,
    fetchPriority: "high",
  })),
  { rel: "preload", as: "fetch", href: STARGAZERS_DATA, crossOrigin: "anonymous" },
];

export default function StargazersRoute() {
  return (
    <>
      <StargazerRope src={STARGAZERS_DATA} repoUrl={REPO_URL} />
      <header
        style={{
          position: "fixed",
          top: 12,
          left: 16,
          right: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Link className={iconButtonClass} to="/" aria-label="Back to the knots">
          <CloseIcon />
        </Link>
        <a
          className={iconButtonClass}
          href={REPO_URL}
          target="_blank"
          rel="noopener"
          aria-label="View source on GitHub"
        >
          <GitHubIcon />
        </a>
      </header>
    </>
  );
}
