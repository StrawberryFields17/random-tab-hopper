// background.js — MV2

let runState = {
  running: false,
  paused: false,
  windowId: null,

  // tab range
  tabStart: 1,
  tabEnd: 1,

  // base timing
  seconds: 5,
  totalMinutes: 1,

  // timing variance (percentage, ±%)
  jitterEnabled: false,
  jitterPct: 0.25, // 25% => 0.25

  // custom variance range (seconds, around base)
  rangeEnabled: false,
  rangeMin: 1, // seconds
  rangeMax: 2, // seconds

  // mode
  mode: "random", // "random" | "sequential"
  nextIndex1: null,

  // lifetime
  stopDeadline: null,
  remainingMs: 0,
  nextTimeoutId: null,

  // human input stop
  stopOnHuman: true,
  _activatingByCode: false
};

// Listen for messages (from popup + content script)
browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.type === "HUMAN_INPUT" && runState.running && runState.stopOnHuman) {
    await stopRunner();
    return { ok: true };
  }

  switch (msg?.type) {
    case "START": {
      await stopRunner();

      runState.tabStart = Math.max(1, parseInt(msg.tabStart || 1, 10));
      runState.tabEnd   = Math.max(runState.tabStart, parseInt(msg.tabEnd || runState.tabStart, 10));

      runState.seconds      = Math.max(0.1, Number(msg.seconds || 5));
      runState.totalMinutes = Math.max(0.1, Number(msg.totalMinutes || 1));

      // timing variance (percentage)
      runState.jitterEnabled = !!msg.jitterEnabled;
      runState.jitterPct     = Math.max(0, Math.min(1, Number(msg.jitterPct ?? 0.0)));

      // range variance (seconds around base)
      runState.rangeEnabled = !!msg.rangeEnabled;
      runState.rangeMin     = Math.max(0.1, Number(msg.rangeMin ?? 1));
      runState.rangeMax     = Math.max(runState.rangeMin, Number(msg.rangeMax ?? runState.rangeMin));

      // safeguard: if both accidentally true, prefer range
      if (runState.rangeEnabled && runState.jitterEnabled) {
        runState.jitterEnabled = false;
      }

      runState.mode        = (msg.mode === "sequential") ? "sequential" : "random";
      runState.stopOnHuman = !!msg.stopOnHuman;
      runState.nextIndex1  = null;

      const win = await browser.windows.getCurrent();
      runState.windowId = win.id;

      await browser.storage.local.set({
        lastParams: {
          tabStart: runState.tabStart,
          tabEnd: runState.tabEnd,
          seconds: runState.seconds,
          totalMinutes: runState.totalMinutes,
          jitterEnabled: runState.jitterEnabled,
          jitterPct: runState.jitterPct,
          rangeEnabled: runState.rangeEnabled,
          rangeMin: runState.rangeMin,
          rangeMax: runState.rangeMax,
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

    default:
      return;
  }
});

// Stop on manual tab activation (if enabled)
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (!runState.running || !runState.stopOnHuman) return;
  if (runState._activatingByCode) return;
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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function computeDelayMs() {
  const base = runState.seconds;

  // 1) Range variance (seconds) – around base, earlier OR later
  if (runState.rangeEnabled) {
    const minOffset = runState.rangeMin;
    const maxOffset = runState.rangeMax;
    const mag = randFloat(minOffset, maxOffset);
    const sign = Math.random() < 0.5 ? -1 : 1;
    const seconds = Math.max(0.05, base + sign * mag);
    return seconds * 1000;
  }

  // 2) Timing variance (percentage)
  if (runState.jitterEnabled && runState.jitterPct > 0) {
    const p = runState.jitterPct;
    const low = Math.max(0.05, base * (1 - p));
    const high = base * (1 + p);
    const seconds = randFloat(low, high);
    return seconds * 1000;
  }

  // 3) No variance
  return base * 1000;
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

    runState._activatingByCode = true;
    try {
      await browser.tabs.update(targetTab.id, { active: true });
    } finally {
      setTimeout(() => { runState._activatingByCode = false; }, 100);
    }
  } catch {
    // ignore transient errors
  }
}
