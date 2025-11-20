// human-listener.js
// Listens for keyboard / mouse input and sends signals to the background script.

function safeSend(msg) {
  try {
    browser.runtime.sendMessage(msg).catch(() => {});
  } catch (_) {}
}

document.addEventListener(
  "keydown",
  (e) => {
    if (e.repeat) return; // ignore held-down keys

    switch (e.key) {
      case " ": // spacebar -> stop on human input (old behavior)
        safeSend({ type: "SPACE_STOP" });
        break;

      case "ArrowRight":
        // Hotkey: go to next tab immediately
        safeSend({ type: "HOTKEY_NEXT" });
        e.preventDefault();
        break;

      case "ArrowLeft":
        // Hotkey: go back to previously shown tab
        safeSend({ type: "HOTKEY_PREV" });
        e.preventDefault();
        break;

      case "p":
      case "P":
        // Hotkey: pause
        safeSend({ type: "HOTKEY_PAUSE" });
        break;

      case "Enter":
        // Hotkey: resume
        safeSend({ type: "HOTKEY_RESUME" });
        break;

      default:
        // Any other key counts as "human input" (for optional auto-stop)
        safeSend({ type: "HUMAN_INPUT" });
        break;
    }
  },
  true
);

// Mouse clicks still count as human input
document.addEventListener(
  "mousedown",
  () => {
    safeSend({ type: "HUMAN_INPUT" });
  },
  true
);
