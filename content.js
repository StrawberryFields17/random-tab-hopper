// content.js — detects Space key as "human input" to stop hopping

document.addEventListener("keydown", (event) => {
  // Only care about Space key
  if (!(event.code === "Space" || event.key === " ")) return;

  // Ignore when typing in inputs / textareas / editable content
  const target = event.target;
  const tag = target && target.tagName;
  const editable = target && (target.isContentEditable === true);

  if (editable || tag === "INPUT" || tag === "TEXTAREA") {
    return;
  }

  // Signal background to stop if "stop on human input" is enabled
  try {
    browser.runtime.sendMessage({ type: "SPACE_STOP" }).catch(() => {});
  } catch (e) {
    // ignore if browser.* not available for some reason
  }
});
