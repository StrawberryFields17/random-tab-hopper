// content.js — detects Space key and marks/unmarks selected tabs

let originalTitle = document.title;
let markedByHopper = false;

// Listen for messages from background to mark/unmark this tab
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "MARK_TAB") {
    if (!markedByHopper) {
      originalTitle = document.title;
      document.title = "🟢 " + originalTitle;
      markedByHopper = true;
    }
  }

  if (msg.type === "UNMARK_TAB") {
    if (markedByHopper) {
      document.title = originalTitle;
      markedByHopper = false;
    }
  }
});

// Detect Space key as human input, unless typing in a field
document.addEventListener("keydown", (event) => {
  // Only care about Space key
  if (!(event.code === "Space" || event.key === " ")) return;

  const target = event.target;
  const tag = target && target.tagName;
  const editable = target && (target.isContentEditable === true);

  // ignore when typing in inputs / textareas / editable content
  if (editable || tag === "INPUT" || tag === "TEXTAREA") {
    return;
  }

  try {
    browser.runtime.sendMessage({ type: "SPACE_STOP" }).catch(() => {});
  } catch (e) {
    // ignore if browser.* not available
  }
});
