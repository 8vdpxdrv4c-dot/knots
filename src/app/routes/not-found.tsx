import { Link } from "react-router";
import { knotPath } from "../shared/site";
import { knots } from "../../engine/knots";
import styles from "./not-found.module.css";

export const meta = () => [{ title: "Not found · Knots Made Easy" }];

export function NotFound() {
  return (
    <main className={styles.page}>
      <h1>This knot isn’t here</h1>
      <p>
        Try the <Link to={knotPath(knots[0].id)}>{knots[0].name.toLowerCase()}</Link> instead.
      </p>
    </main>
  );
}

export default NotFound;
