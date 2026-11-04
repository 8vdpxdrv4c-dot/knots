const KEY = "stargazer-prompt-seen";
// Where storage is blocked, remember for this page load only.
let seenHere = false;

/** Whether the stargazer prompt was shown, or the stargazer page visited, on this device. */
export function promptSeen() {
  try {
    return seenHere || localStorage.getItem(KEY) === "1";
  } catch {
    return seenHere;
  }
}

export function markPromptSeen() {
  seenHere = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Blocked storage: the module flag above has to do.
  }
}
