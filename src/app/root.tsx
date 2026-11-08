import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
} from "react-router";
import { isZhKnot } from "./shared/copy";
import { SITE_DESCRIPTION, SITE_NAME } from "./shared/site";
import "./styles/global.css";
import type { Route } from "./+types/root";

export function Layout({ children }: { children: React.ReactNode }) {
  const knotId = useLocation().pathname.match(/\/knots\/([^/]+)/)?.[1] ?? "";
  const lang = isZhKnot(decodeURIComponent(knotId)) ? "zh-CN" : "en";
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ece7de" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const meta = () => [
  { title: SITE_NAME },
  { name: "description", content: SITE_DESCRIPTION },
];

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong";
  return (
    <main
      style={{ display: "grid", placeContent: "center", height: "100dvh", textAlign: "center" }}
    >
      <h1>{message}</h1>
      <p>
        <a href="/">Back to the knots</a>
      </p>
    </main>
  );
}
