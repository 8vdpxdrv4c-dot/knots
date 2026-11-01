// Inline icons: no requests, inherit the text colour. Size and stroke come from the `.icon` class.
type IconProps = { className?: string };
const icon = (path: string, filled = false) =>
  function Icon({ className }: IconProps) {
    return (
      <svg
        className={`icon${filled ? " icon-filled" : ""}${className ? ` ${className}` : ""}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    );
  };

export const MenuIcon = icon("M4 6h16M4 12h16M4 18h10");
export const CloseIcon = icon("M6 6l12 12M18 6L6 18");
export const PlayIcon = icon("M8 5.5v13l10.5-6.5z", true);
export const PauseIcon = icon("M7 5h3.5v14H7zM13.5 5H17v14h-3.5z", true);
export const LoopIcon = icon("M7 7h9.5l-2-2M17 17H7.5l2 2M4 12a5 5 0 0 1 3-5M20 12a5 5 0 0 1-3 5");
/** A circular arrow round a dot: back to the starting view. */
export const ResetViewIcon = icon("M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.2h3.2M12 11.2v1.6");
export const StarIcon = icon(
  "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
);
/** A magnifying glass: search. */
export const SearchIcon = icon("M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20");
export const GitHubIcon = icon(
  "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1-.07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z",
  true,
);
