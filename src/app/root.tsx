import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
} from "react-router";
import { SITE_DESCRIPTION, SITE_NAME } from "./shared/site";
import "./styles/global.css";
import type { Route } from "./+types/root";

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const lang = pathname === "/" || pathname.startsWith("/knots/") ? "zh-CN" : "en";
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
    : "出了点问题";
  return (
    <main
      style={{ display: "grid", placeContent: "center", height: "100dvh", textAlign: "center" }}
    >
      <h1>{message}</h1>
      <p>
        <a href={import.meta.env.BASE_URL}>回到绳结</a>
      </p>
    </main>
  );
}
