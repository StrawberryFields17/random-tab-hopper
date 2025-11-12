// background.js — MV2
let runState = {
  running: false,
  paused: false,
  windowId: null,

  // range
  tabStart: 1,
  tabEnd: 1,

  // timing
  seconds: 5,          // base seconds
  jitterPct: 0.25,     // 0..1 (from slider)
  useOverride: false,  // if true, use delayMin/delayMax instead of seconds±jitter
  delayMin: 4,         // seconds (override)
  delayMax: 8,         // seconds (override)

  // mode
  mode: "random",      // "random" | "sequential"
  nextIndex1: null,

  // lifecycle
  totalMinutes: 1,
  stopDeadline: null,  // timestamp (ms)
  remainingMs: 0,
  nextTimeoutId: null,

  // human input
  stopOnHuman: true,
  _activatingByCode: false // internal flag to ignore our own tab activations
};

// Listen for user-input pings from content script
browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.type === "HUMAN_INPUT" && runState.running && runState.stopOnHuman) {
    await stopRunner();
    return { ok: true };
  }

  switch (msg?.type) {
    case "START": {
      await stopRunner();

      runState.tabStart      = Math.max(1, parseInt(msg.tabStart || 1, 10));
      runState.tabEnd        = Math.max(runState.tabStart, parseInt(msg.tabEnd || runState.tabStart, 10));
      runState.seconds       = Math.max(0.1, Number(msg.seconds || 5));
      runState.totalMinutes  = Math.max(0.1, Number(msg.totalMinutes || 1));

      // jitter & overrides
      runState.jitterPct     = Math.max(0, Math.min(1, Number(msg.jitterPct ?? 0.25)));
      runState.useOverride   = !!msg.useOverride;
      runState.delayMin      = Math.max(0.1, Number(msg.delayMin ?? 4));
      runState.delayMax      = Math.max(runState.delayMin, Number(msg.delayMax ?? 8));

      // mode + behavior
      runState.mode          = (msg.mode === "sequential") ? "sequential" : "random";
      runState.stopOnHuman   = !!msg.stopOnHuman;
      runState.nextIndex1    = null;

      const win = await browser.windows.getCurrent();
      runState.windowId = win.id;

      await browser.storage.local.set({
        lastParams: {
          tabStart: runState.tabStart,
          tabEnd: runState.tabEnd,
          seconds: runState.seconds,
          totalMinutes: runState.totalMinutes,
          jitterPct: runState.jitterPct,
          useOverride: runState.useOverride,
          delayMin: runState.delayMin,
          delayMax: runState.delayMax,
          mode: runState.mode,
          stopOnHuman: runState.stopOnHuman
        }
      });

      startRunner();
      return { ok: true };
    }

    case "STOP":
      await stopRunner();
      return { ok: true };

    case "PAUSE":
      await pauseRunner();
      return { ok: true };

    case "RESUME":
      await resumeRunner();
      return { ok: true };

    case "GET_STATE": {
      const stored = await browser.storage.local.get("lastParams");
      return {
        running: runState.running,
        paused: runState.paused,
        lastParams: stored?.lastParams || null
      };
    }
  }
});

// Also stop if user manually changes active tab (and toggle enabled).
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (!runState.running || !runState.stopOnHuman) return;
  if (runState._activatingByCode) return; // ignore our own switch
  // Any manual activation counts as human intervention
  await stopRunner();
});

function startRunner() {
  if (runState.running) return;
  runState.running = true;
  runState.paused = false;

  runState.remainingMs = runState.totalMinutes * 60 * 1000;
  runState.stopDeadline = Date.now() + runState.remainingMs;

  scheduleNextHop(0);
}

async function stopRunner() {
  if (runState.nextTimeoutId) {
    clearTimeout(runState.nextTimeoutId);
    runState.nextTimeoutId = null;
  }
  runState.running = false;
  runState.paused = false;
  runState.windowId = null;
  runState.stopDeadline = null;
  runState.remainingMs = 0;
  runState.nextIndex1 = null;
}

async function pauseRunner() {
  if (!runState.running || runState.paused) return;
  runState.paused = true;
  if (runState.nextTimeoutId) {
    clearTimeout(runState.nextTimeoutId);
    runState.nextTimeoutId = null;
  }
  runState.remainingMs = Math.max(0, runState.stopDeadline - Date.now());
}

async function resumeRunner() {
  if (!runState.running || !runState.paused) return;
  runState.paused = false;
  runState.stopDeadline = Date.now() + runState.remainingMs;
  scheduleNextHop(0);
}

function computeDelayMs() {
  // If min/max override is enabled, use that exact range
  if (runState.useOverride) {
    const lowMs  = Math.max(50, runState.delayMin * 1000);
    const highMs = Math.max(lowMs, runState.delayMax * 1000);
    return randInt(lowMs, highMs);
  }
  // Otherwise use base seconds ± jitter%
  const base = runState.seconds * 1000;
  const low  = Math.max(50, base * (1 - runState.jitterPct));
  const high = Math.max(low, base * (1 + runState.jitterPct));
  return randInt(Math.floor(low), Math.floor(high));
}

function scheduleNextHop(delayMs) {
  if (!runState.running || runState.paused) return;

  const remaining = Math.max(0, runState.stopDeadline - Date.now());
  if (remaining <= 0) {
    stopRunner();
    return;
  }
  const delay = Math.min(delayMs, remaining);

  runState.nextTimeoutId = setTimeout(async () => {
    await hopOnce();
    if (!runState.running || runState.paused) return;

    const rem = Math.max(0, runState.stopDeadline - Date.now());
    if (rem <= 0) {
      stopRunner();
      return;
    }
    scheduleNextHop(Math.min(computeDelayMs(), rem));
  }, delay);
}

async function hopOnce() {
  try {
    if (!runState.running || runState.paused || runState.windowId == null) return;

    const tabs = await browser.tabs.query({ windowId: runState.windowId });
    if (!tabs.length) return;

    tabs.sort((a, b) => a.index - b.index);
    const maxIndex1 = tabs[tabs.length - 1].index + 1;

    const start = Math.min(runState.tabStart, maxIndex1);
    const end   = Math.min(runState.tabEnd,   maxIndex1);
    if (end < start) return;

    let targetIndex1;
    if (runState.mode === "sequential") {
      if (runState.nextIndex1 == null || runState.nextIndex1 < start || runState.nextIndex1 > end) {
        runState.nextIndex1 = start;
      }
      targetIndex1 = runState.nextIndex1;
      runState.nextIndex1 = (targetIndex1 >= end) ? start : (targetIndex1 + 1);
    } else {
      targetIndex1 = randInt(start, end);
    }

    const targetTab = tabs.find(t => t.index === (targetIndex1 - 1));
    if (!targetTab) return;

    await browser.windows.update(runState.windowId, { focused: true });

    // mark that we're about to activate by code so onActivated doesn't stop us
    runState._activatingByCode = true;
    try {
      await browser.tabs.update(targetTab.id, { active: true });
    } finally {
      // small timeout to ensure our own activation event passes
      setTimeout(() => { runState._activatingByCode = false; }, 100);
    }
  } catch {
    // ignore transient errors
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
