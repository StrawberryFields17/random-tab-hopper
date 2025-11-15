// background.js — core logic for Random Tab Hopper

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

  // timing variance (percentage)
  jitterEnabled: false,
  jitterPct: 0.25,

  // custom variance range (seconds around base)
  rangeEnabled: false,
  rangeMin: 1.0,
  rangeMax: 2.0,

  // manual tab list mode
  useSelectedTabs: false,

  // mode
  mode: "random",
  nextIndex1: null,
  nextSeqPos: 0,

  // lifetime
  stopDeadline: null,
  remainingMs: 0,
  nextTimeoutId: null,

  // human input stop
  stopOnHuman: true,
  _activatingByCode: false
};

let selectedTabIds = new Set();
let selectionMode = false;
let rangeMarkedIds = new Set();

// ---- helpers for green markers ----

async function markTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "MARK_TAB" });
  } catch (e) {}
}

async function unmarkTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "UNMARK_TAB" });
  } catch (e) {}
}

async function clearRangeMarks() {
  if (!rangeMarkedIds.size) return;
  const ids = Array.from(rangeMarkedIds);
  for (const id of ids) {
    await unmarkTabVisual(id);
  }
  rangeMarkedIds.clear();
}

async function clearAllMarkers() {
  const ids = new Set([...selectedTabIds, ...rangeMarkedIds]);
  for (const id of ids) {
    await unmarkTabVisual(id);
  }
  selectedTabIds.clear();
  rangeMarkedIds.clear();
}

function broadcastStateChange() {
  try {
    browser.runtime.sendMessage({ type: "STATE_CHANGED" }).catch(() => {});
  } catch (_) {}
}

// ---- messages from popup/content ----

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== "string") return;

  if ((msg.type === "HUMAN_INPUT" || msg.type === "SPACE_STOP") &&
      runState.running && runState.stopOnHuman) {
    return stopRunner().then(() => ({ ok: true }));
  }

  switch (msg.type) {
    case "START":
      return handleStart(msg);
    case "STOP":
      return stopRunner().then(() => ({ ok: true }));
    case "PAUSE":
      return pauseRunner().then(() => ({ ok: true }));
    case "RESUME":
      return resumeRunner().then(() => ({ ok: true }));
    case "GET_STATE":
      return handleGetState();

    case "START_SELECTION":
      return handleStartSelection();
    case "STOP_SELECTION":
      selectionMode = false;
      return handleStopSelection();
    case "GET_SELECTED_TABS":
      return handleGetSelectedTabs();
    case "UNSELECT_TAB":
      if (typeof msg.tabId === "number") {
        selectedTabIds.delete(msg.tabId);
        unmarkTabVisual(msg.tabId);
      }
      return handleGetSelectedTabs();

    case "CLEAR_ALL_MARKERS":
      return clearAllMarkers().then(() => ({ ok: true }));

    default:
      return;
  }
});

// ---- selection mode + human-stop on tab change ----

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const id = activeInfo.tabId;

  if (selectionMode) {
    // In selection mode: clicking a tab toggles in manual list
    if (selectedTabIds.has(id)) {
      selectedTabIds.delete(id);
      unmarkTabVisual(id);
    } else {
      selectedTabIds.add(id);
      markTabVisual(id);
    }
    return;
  }

  if (!runState.running || !runState.stopOnHuman) return;
  if (runState._activatingByCode) return;
  await stopRunner();
});

// ---- handlers ----

async function handleStartSelection() {
  selectionMode = true;

  // Also add the currently active tab to the selection once,
  // so you can start selecting from the tab you’re on.
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length) {
      const id = tabs[0].id;
      if (!selectedTabIds.has(id)) {
        selectedTabIds.add(id);
        await markTabVisual(id);
      }
    }
  } catch (_) {}

  return { ok: true };
}

async function handleStart(msg) {
  await stopRunner();

  runState.tabStart = Math.max(1, parseInt(msg.tabStart || 1, 10));
  runState.tabEnd = Math.max(runState.tabStart, parseInt(msg.tabEnd || runState.tabStart, 10));

  runState.seconds = Math.max(0.1, Number(msg.seconds || 5));
  runState.totalMinutes = Math.max(0.1, Number(msg.totalMinutes || 1));

  runState.jitterEnabled = !!msg.jitterEnabled;
  runState.jitterPct = Math.max(0, Math.min(1, Number(msg.jitterPct ?? 0)));

  runState.rangeEnabled = !!msg.rangeEnabled;
  runState.rangeMin = Math.max(0.1, Number(msg.rangeMin ?? 1.0));
  runState.rangeMax = Math.max(runState.rangeMin, Number(msg.rangeMax ?? runState.rangeMin));

  if (runState.rangeEnabled && runState.jitterEnabled) {
    runState.jitterEnabled = false;
  }

  runState.useSelectedTabs = !!msg.useSelectedTabs;
  runState.mode = (msg.mode === "sequential") ? "sequential" : "random";
  runState.stopOnHuman = !!msg.stopOnHuman;
  runState.nextIndex1 = null;
  runState.nextSeqPos = 0;

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
      useSelectedTabs: runState.useSelectedTabs,
      mode: runState.mode,
      stopOnHuman: runState.stopOnHuman
    }
  });

  // Update green dots for range mode
  await clearRangeMarks();
  if (!runState.useSelectedTabs && runState.windowId != null) {
    const allTabs = await browser.tabs.query({ windowId: runState.windowId });
    if (allTabs.length) {
      allTabs.sort((a, b) => a.index - b.index);
      const maxIndex1 = allTabs[allTabs.length - 1].index + 1;
      const start = Math.min(runState.tabStart, maxIndex1);
      const end   = Math.min(runState.tabEnd,   maxIndex1);
      if (end >= start) {
        for (const t of allTabs) {
          const idx1 = t.index + 1;
          if (idx1 >= start && idx1 <= end) {
            await markTabVisual(t.id);
            rangeMarkedIds.add(t.id);
          }
        }
      }
    }
  }

  startRunner();
  return { ok: true };
}

async function handleGetState() {
  const stored = await browser.storage.local.get("lastParams");
  return {
    running: runState.running,
    paused: runState.paused,
    lastParams: stored?.lastParams || null
  };
}

async function handleStopSelection() {
  const tabsMeta = await getSelectedTabsMeta();
  return { ok: true, count: tabsMeta.length, tabs: tabsMeta };
}

async function handleGetSelectedTabs() {
  const tabsMeta = await getSelectedTabsMeta();
  return { tabs: tabsMeta };
}

async function getSelectedTabsMeta() {
  if (!selectedTabIds.size) return [];
  const allTabs = await browser.tabs.query({});
  const idSet = new Set(selectedTabIds);
  return allTabs
    .filter(t => idSet.has(t.id))
    .map(t => ({
      id: t.id,
      title: t.title,
      index1: t.index + 1,
      windowId: t.windowId
    }));
}

// ---- runner control ----

function startRunner() {
  if (runState.running) return;
  runState.running = true;
  runState.paused = false;

  runState.remainingMs = runState.totalMinutes * 60 * 1000;
  runState.stopDeadline = Date.now() + runState.remainingMs;
  broadcastStateChange();
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
  runState.nextSeqPos = 0;
  broadcastStateChange();
}

async function pauseRunner() {
  if (!runState.running || runState.paused) return;
  runState.paused = true;
  if (runState.nextTimeoutId) {
    clearTimeout(runState.nextTimeoutId);
    runState.nextTimeoutId = null;
  }
  runState.remainingMs = Math.max(0, runState.stopDeadline - Date.now());
  broadcastStateChange();
}

async function resumeRunner() {
  if (!runState.running || !runState.paused) return;
  runState.paused = false;
  runState.stopDeadline = Date.now() + runState.remainingMs;
  broadcastStateChange();
  scheduleNextHop(0);
}

// ---- timing ----

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function computeDelayMs() {
  const base = runState.seconds;

  if (runState.rangeEnabled) {
    const mag = randFloat(runState.rangeMin, runState.rangeMax);
    const sign = Math.random() < 0.5 ? -1 : 1;
    const seconds = Math.max(0.05, base + sign * mag);
    return seconds * 1000;
  }

  if (runState.jitterEnabled && runState.jitterPct > 0) {
    const p = runState.jitterPct;
    const low = Math.max(0.05, base * (1 - p));
    const high = base * (1 + p);
    const seconds = randFloat(low, high);
    return seconds * 1000;
  }

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

    const allTabs = await browser.tabs.query({ windowId: runState.windowId });
    if (!allTabs.length) return;

    allTabs.sort((a, b) => a.index - b.index);

    let candidateTabs;

    if (runState.useSelectedTabs && selectedTabIds.size > 0) {
      const idSet = new Set(selectedTabIds);
      candidateTabs = allTabs.filter(t => idSet.has(t.id));
    } else {
      const maxIndex1 = allTabs[allTabs.length - 1].index + 1;
      const start = Math.min(runState.tabStart, maxIndex1);
      const end   = Math.min(runState.tabEnd,   maxIndex1);
      if (end < start) return;

      candidateTabs = allTabs.filter(t => {
        const idx1 = t.index + 1;
        return idx1 >= start && idx1 <= end;
      });
    }

    if (!candidateTabs.length) return;

    let targetTab;

    if (runState.mode === "sequential") {
      if (runState.nextSeqPos < 0 || runState.nextSeqPos >= candidateTabs.length) {
        runState.nextSeqPos = 0;
      }
      targetTab = candidateTabs[runState.nextSeqPos];
      runState.nextSeqPos = (runState.nextSeqPos + 1) % candidateTabs.length;
    } else {
      const idx = randInt(0, candidateTabs.length - 1);
      targetTab = candidateTabs[idx];
    }

    if (!targetTab) return;

    await browser.windows.update(runState.windowId, { focused: true });

    runState._activatingByCode = true;
    try {
      await browser.tabs.update(targetTab.id, { active: true });
    } finally {
      setTimeout(() => { runState._activatingByCode = false; }, 100);
    }
  } catch (e) {
    console.error("hopOnce error:", e);
  }
}
