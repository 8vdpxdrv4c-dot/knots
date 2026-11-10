import { useNavigate } from "react-router";
import { knots } from "../../engine/knots";
import { poachersKnot } from "../../engine/knots/poachers-knot";
import { KnotScreen } from "../screens/KnotScreen";
import { useMountEffect } from "../shared/hooks";
import { knotMeta } from "../shared/meta";
import { knotPath } from "../shared/site";

// The public entry is the localized poacher's knot. Its own page stays at /knots/poachers-knot/.
export const meta = () => knotMeta(poachersKnot);

export default function Home() {
  const navigate = useNavigate();
  // Links from before knots had their own pages used ?knot=<id>; send them to that page.
  useMountEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("knot");
    if (!id || !knots.some((k) => k.id === id)) return;
    params.delete("knot");
    const rest = params.toString().replace("tune=", "tune");
    navigate(`${knotPath(id)}${rest ? `?${rest}` : ""}`, { replace: true });
  });
  return <KnotScreen knot={poachersKnot} />;
}
