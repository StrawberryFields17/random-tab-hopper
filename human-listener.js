// human-listener.js — content script for page hotkeys

(function () {
  if (window.__random_tab_hopper_listener_installed) return;
  window.__random_tab_hopper_listener_installed = true;

  function safeSend(message) {
    try {
      browser.runtime.sendMessage(message);
    } catch (e) {
      console.error("Random Tab Hopper sendMessage failed:", e);
    }
  }

  function isEditableElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    const type = (el.type || "").toLowerCase();

    if (el.isContentEditable) return true;

    if (tag === "INPUT") {
      const blocked = [
        "text",
        "search",
        "email",
        "url",
        "password",
        "number",
        "tel",
        "date",
        "datetime-local",
        "month",
        "time",
        "week",
      ];
      return blocked.includes(type);
    }

    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    return false;
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const key = e.key;
      const target = e.target;

      // ignore with modifier keys
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // ignore when typing in inputs/textareas/contenteditable
      if (isEditableElement(target)) return;

      switch (key) {
        case "ArrowRight":
        case "Right":
          e.preventDefault();
          safeSend({ type: "HOTKEY_NEXT" });
          break;

        case "ArrowLeft":
        case "Left":
          e.preventDefault();
          safeSend({ type: "HOTKEY_PREV" });
          break;

        // S = stop
        case "s":
        case "S":
          e.preventDefault();
          safeSend({ type: "HOTKEY_STOP" });
          break;

        // P = toggle pause/resume
        case "p":
        case "P":
          e.preventDefault();
          safeSend({ type: "HOTKEY_TOGGLE_PAUSE" });
          break;

        // Enter:
        // - if stopped: start with last settings
        // - if paused: resume
        case "Enter":
          e.preventDefault();
          safeSend({ type: "HOTKEY_ENTER" });
          break;

        // C = close included tabs from last run
        case "c":
        case "C":
          e.preventDefault();
          safeSend({ type: "CLOSE_LAST_RUN_TABS" });
          break;

        // Space: generic "human input" stop, if enabled
        case " ":
          safeSend({ type: "SPACE_STOP" });
          break;

        default:
          break;
      }
    },
    { capture: true }
  );
})();
