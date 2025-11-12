// human-listener.js
(function () {
  let sentRecently = false;

  function ping() {
    if (sentRecently) return;
    sentRecently = true;
    try {
      browser.runtime.sendMessage({ type: "HUMAN_INPUT" });
    } catch (e) {}
    // throttle pings (avoid spamming background)
    setTimeout(() => { sentRecently = false; }, 500);
  }

  const events = [
    "keydown", "keyup", "keypress",
    "mousedown", "mouseup", "click", "dblclick", "contextmenu",
    "pointerdown", "pointerup",
    "wheel",
    "touchstart", "touchend"
  ];

  events.forEach(ev => window.addEventListener(ev, ping, { capture: true, passive: true }));
})();
