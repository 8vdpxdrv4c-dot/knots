import { Link } from "react-router";
import { knotPath } from "../shared/site";
import styles from "./not-found.module.css";

export const meta = () => [{ title: "没有找到 · 轻松打绳结" }];

export function NotFound() {
  return (
    <main className={styles.page}>
      <h1>这里没有这个绳结</h1>
      <p>
        改看<Link to={knotPath("poachers-knot")}>双圈索结（Poacher's knot）</Link>。
      </p>
    </main>
  );
}

export default NotFound;
