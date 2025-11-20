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
    if (e.repeat) return;

    // Don't capture when typing into inputs
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      return;
    }

    // Normalize arrow detection
    const key = e.key;
    const code = e.code;
    const kc = e.keyCode || e.which;

    const isRight =
      key === "ArrowRight" ||
      key === "Right" ||
      code === "ArrowRight" ||
      kc === 39;

    const isLeft =
      key === "ArrowLeft" ||
      key === "Left" ||
      code === "ArrowLeft" ||
      kc === 37;

    // Arrow keys
    if (isRight) {
      safeSend({ type: "HOTKEY_NEXT" });
      e.preventDefault();
      return;
    }

    if (isLeft) {
      safeSend({ type: "HOTKEY_PREV" });
      e.preventDefault();
      return;
    }

    // Other hotkeys
    switch (e.key) {
      case " ":
        safeSend({ type: "SPACE_STOP" });
        break;

      case "p":
      case "P":
        safeSend({ type: "HOTKEY_PAUSE" });
        break;

      case "Enter":
        safeSend({ type: "HOTKEY_RESUME" });
        break;

      case "s":
      case "S":
        safeSend({ type: "HOTKEY_STOP" });
        break;
    }
  },
  { capture: true } // Required so websites don't block arrow keys
);
