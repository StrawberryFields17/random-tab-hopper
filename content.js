// content.js — detects Space key and marks/unmarks selected tabs

// We keep a best-effort copy of the "base" title,
// but unmarking will ALWAYS strip a leading 🟢 from the current title.
let baseTitle = document.title;

// Handle messages from the background script
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "MARK_TAB") {
    // Only add the marker if it's not already there
    if (!document.title.startsWith("🟢")) {
      // Strip any stray leading marker first, then store as base
      baseTitle = document.title.replace(/^🟢\s*/, "");
      document.title = "🟢 " + baseTitle;
    }
  }

  if (msg.type === "UNMARK_TAB") {
    // Always strip any leading 🟢 from the CURRENT title.
    // This makes Clear work even for very old tabs or titles we didn't track.
    if (document.title.startsWith("🟢")) {
      document.title = document.title.replace(/^🟢\s*/, "");
    } else {
      // Fallback: also clean up our stored baseTitle just in case
      const cleaned = baseTitle.replace(/^🟢\s*/, "");
      if (cleaned !== baseTitle) {
        baseTitle = cleaned;
        document.title = cleaned;
      }
    }
  }
});

// Detect Space key as "human input" (outside text fields)
document.addEventListener("keydown", (event) => {
  if (!(event.code === "Space" || event.key === " ")) return;

  const target = event.target;
  const tag = target && target.tagName;
  const editable = target && (target.isContentEditable === true);

  // Ignore when typing in inputs/textareas or editable content
  if (editable || tag === "INPUT" || tag === "TEXTAREA") {
    return;
  }

  try {
    browser.runtime.sendMessage({ type: "SPACE_STOP" }).catch(() => {});
  } catch (e) {
    // ignore
  }
});
