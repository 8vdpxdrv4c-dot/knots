import type { KnotDef } from "../knots/types";

/** Fills the knot sheet in index.html. Each card is a plain link to ?knot=<id>, so a switch reloads the page. */
export function createPicker(knots: KnotDef[], currentId: string) {
  const dialog = document.getElementById("picker") as HTMLDialogElement;
  const list = document.getElementById("knot-list")!;
  for (const k of knots) {
    const a = document.createElement("a");
    a.href = `?knot=${encodeURIComponent(k.id)}`;
    if (k.id === currentId) a.setAttribute("aria-current", "page");
    const name = document.createElement("strong");
    name.textContent = k.name;
    const summary = document.createElement("span");
    summary.textContent = k.summary;
    a.append(name, summary);
    const li = document.createElement("li");
    li.append(a);
    list.append(li);
  }
  document.getElementById("pick")!.onclick = () => dialog.showModal();
  document.getElementById("close-picker")!.onclick = () => dialog.close();
  // The sheet fills the dialog, so a click on the dialog itself is a click on the backdrop.
  // Braces matter: an onclick that returns false cancels the click, and the knot links stop working.
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
}
