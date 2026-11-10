import { Link } from "react-router";
import { knotPath } from "../shared/site";
import styles from "./not-found.module.css";

export const meta = () => [{ title: "Not found · Knots Made Easy" }];

export function NotFound() {
  return (
    <main className={styles.page}>
      <h1>This knot isn’t here</h1>
      <p>
        Try the <Link to={knotPath("poachers-knot")}>双圈索结（Poacher's knot）</Link> instead.
      </p>
    </main>
  );
}

export default NotFound;
