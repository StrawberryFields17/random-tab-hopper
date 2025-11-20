// human-listener.js
// Listens for keyboard input and sends signals to the background script.

function safeSend(msg) {
  try {
    browser.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {}
}

document.addEventListener(
  "keydown",
  (e) => {
    if (e.repeat) return; // ignore held-down keys

    // Do not trigger hotkeys while typing in any input field
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      return;
    }

    switch (e.key) {
      case " ":
        // Spacebar -> stop on human input
        safeSend({ type: "SPACE_STOP" });
        break;

      case "ArrowRight":
      case "Right": // some layouts send "Right"
        // Next included tab immediately
        safeSend({ type: "HOTKEY_NEXT" });
        e.preventDefault();
        break;

      case "ArrowLeft":
      case "Left": // some layouts send "Left"
        // Previous tab from history
        safeSend({ type: "HOTKEY_PREV" });
        e.preventDefault();
        break;

      case "p":
      case "P":
        // Pause
        safeSend({ type: "HOTKEY_PAUSE" });
        break;

      case "Enter":
        // Resume (when content page has focus)
        safeSend({ type: "HOTKEY_RESUME" });
        break;

      case "s":
      case "S":
        // Stop
        safeSend({ type: "HOTKEY_STOP" });
        break;

      default:
        // No default HUMAN_INPUT here: mouse and other keys won't stop the run
        break;
    }
  },
  { capture: true } // capture phase so page scripts can't swallow the arrow keys
);
