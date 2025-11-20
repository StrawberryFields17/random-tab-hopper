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
        // Next included tab immediately
        safeSend({ type: "HOTKEY_NEXT" });
        e.preventDefault();
        break;

      case "ArrowLeft":
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
        // Resume
        safeSend({ type: "HOTKEY_RESUME" });
        break;

      case "s":
      case "S":
        // Stop
        safeSend({ type: "HOTKEY_STOP" });
        break;

      default:
        // (No default HUMAN_INPUT — mouse clicks no longer stop)
        break;
    }
  },
  { capture: true } // REQUIRED so arrow keys are not swallowed by page scripts
);
