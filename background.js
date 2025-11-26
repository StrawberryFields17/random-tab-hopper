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
  jitterPct: 0, // e.g. 0.25 for ±25%

  // custom range variance
  rangeEnabled: false,
  rangeMin: 0,
  rangeMax: 0,

  // selection mode
  useSelectedTabs: false,

  // random vs sequential
  mode: "random", // "random" | "sequential"
  nextSeqPos: 0,

  // whether any "human" activity should stop the run
  stopOnHuman: true,

  // history of hops (tab IDs) for ← / → navigation
  history: [],
  historyIndex: -1,
  suppressNextHistory: false
};

let selectedTabIds = new Set();
let selectionMode = false;
let selectionOriginTabId = null;

let rangeMarkedIds = new Set();

// tabs that were part of the last run's pool
let lastRunTabIds = new Set();

// ---------------- GREEN MARKER HELPERS ------

async function markTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "MARK_TAB" });
  } catch (_) {
    // may fail on about: pages, etc.
  }
}

async function unmarkTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "UNMARK_TAB" });
  } catch (_) {}
}

// Remove markers from range mode
async function clearRangeMarks() {
  const ids = [...rangeMarkedIds];
  for (const id of ids) {
    await unmarkTabVisual(id);
  }
  rangeMarkedIds.clear();
}

// Remove all markers from every tab (including old ones)
async function clearAllMarkers() {
  const allTabs = await browser.tabs.query({});
  for (const t of allTabs) {
    await unmarkTabVisual(t.id);
  }
  selectedTabIds.clear();
  rangeMarkedIds.clear();
  selectionMode = false;
  selectionOriginTabId = null;
  // lastRunTabIds is kept — user may still want to close those tabs
}

// ---------------- STATE BROADCAST ----------------

function broadcastStateChange() {
  try {
    browser.runtime
      .sendMessage({ type: "STATE_CHANGED" })
      .catch(() => {});
  } catch (_) {}
}

// ---------------- RUNNER CONTROL ----------------

function startRunner() {
  if (runState.running) return;
  runState.running = true;
  runState.paused = false;
  runState.nextSeqPos = 0;
  broadcastStateChange();
  scheduleNextHop(0);
}

async function stopRunner() {
  // Generic stop for any reason (Stop button, hotkey, timer, human input)
  // Range-mode green markers should disappear when the run ends,
  // but manual selection markers (manual list) must stay.
  runState.running = false;
  runState.paused = false;
  runState.windowId = null;
  runState.history = [];
  runState.historyIndex = -1;
  runState.suppressNextHistory = false;

  // Clear only the range-based markers.
  // Manual selection markers are tracked separately (selectedTabIds)
  // and are *not* in rangeMarkedIds, so they stay visible.
  await clearRangeMarks();

  broadcastStateChange();
}

function pauseRunner() {
  if (!runState.running || runState.paused) return Promise.resolve();
  runState.paused = true;
  broadcastStateChange();
  return Promise.resolve();
}

function resumeRunner() {
  if (!runState.running || !runState.paused) return Promise.resolve();
  runState.paused = false;
  broadcastStateChange();
  scheduleNextHop(0);
  return Promise.resolve();
}

function computeDelayMs() {
  const baseMs = Math.max(50, runState.seconds * 1000);

  if (runState.rangeEnabled) {
    const minOffset = Number(runState.rangeMin) || 0;
    const maxOffset = Number(runState.rangeMax) || 0;
    const lo = baseMs - maxOffset * 1000;
    const hi = baseMs + maxOffset * 1000;
    return Math.max(50, lo + Math.random() * (hi - lo));
  }

  if (runState.jitterEnabled && runState.jitterPct > 0) {
    const pct = Math.max(0, runState.jitterPct);
    const lo = baseMs * (1 - pct);
    const hi = baseMs * (1 + pct);
    return Math.max(50, lo + Math.random() * (hi - lo));
  }

  return baseMs;
}

function scheduleNextHop(delayMs) {
  if (!runState.running || runState.paused) return;

  const d = Math.max(10, delayMs);
  setTimeout(async () => {
    if (!runState.running || runState.paused) return;

    try {
      await hopOnce();
    } catch (e) {
      console.error("Hop failed:", e);
    }

    if (!runState.running) return;

    const now = Date.now();
    if (!runState.tStop) return;

    const remaining = runState.tStop - now;
    if (remaining <= 0) {
      stopRunner();
      return;
    }

    scheduleNextHop(Math.min(remaining, computeDelayMs()));
  }, d);
}

async function hopOnce() {
  try {
    if (!runState.running || runState.paused || runState.windowId == null)
      return;

    const tabs = await browser.tabs.query({ windowId: runState.windowId });
    if (!tabs.length) return;

    tabs.sort((a, b) => a.index - b.index);

    let list;
    if (runState.useSelectedTabs && selectedTabIds.size > 0) {
      const set = new Set(selectedTabIds);
      list = tabs.filter((t) => set.has(t.id));
    } else {
      list = tabs.filter((t) => {
        const idx = t.index + 1;
        return idx >= runState.tabStart && idx <= runState.tabEnd;
      });
    }

    if (!list.length) return;

    let next;
    if (runState.mode === "sequential") {
      if (!Array.isArray(runState.seqOrder) || !runState.seqOrder.length) {
        runState.seqOrder = list.map((t) => t.id);
        runState.nextSeqPos = 0;
      }

      if (runState.nextSeqPos >= runState.seqOrder.length) {
        runState.nextSeqPos = 0;
      }

      const tid = runState.seqOrder[runState.nextSeqPos];
      runState.nextSeqPos++;

      next = list.find((t) => t.id === tid) || list[0];
    } else {
      next = list[Math.floor(Math.random() * list.length)];
    }

    if (!next) return;

    await browser.tabs.update(next.id, { active: true });
    await browser.windows.update(runState.windowId, { focused: true });

    // IMPORTANT: history is updated only in the onActivated listener.
  } catch (e) {
    console.error("hopOnce error:", e);
  }
}

function jumpHistory(offset) {
  if (!runState.running || !runState.history.length) return;

  // We only allow going back / forward within the last 10 visited tabs.
  const maxHistoryWindow = 10;
  const maxIndex = runState.history.length - 1;
  const minIndex = Math.max(0, maxIndex - (maxHistoryWindow - 1));

  let newIndex = runState.historyIndex + offset;
  if (newIndex > maxIndex) newIndex = maxIndex;
  if (newIndex < minIndex) newIndex = minIndex;

  if (newIndex === runState.historyIndex) return;

  const tabId = runState.history[newIndex];
  runState.historyIndex = newIndex;

  // Tell the onActivated listener not to push this activation into history again.
  runState.suppressNextHistory = true;

  browser.tabs
    .update(tabId, { active: true })
    .catch(() => {});
}

// ---------------- LAST RUN SNAPSHOT ----------------

async function snapshotLastRunTabs() {
  lastRunTabIds.clear();

  if (runState.windowId == null) return;

  const allTabs = await browser.tabs.query({ windowId: runState.windowId });
  allTabs.sort((a, b) => a.index - b.index);

  let list;

  if (runState.useSelectedTabs && selectedTabIds.size > 0) {
    const set = new Set(selectedTabIds);
    list = allTabs.filter((t) => set.has(t.id));
  } else {
    list = allTabs.filter((t) => {
      const idx1 = t.index + 1;
      return idx1 >= runState.tabStart && idx1 <= runState.tabEnd;
    });
  }

  for (const t of list) {
    lastRunTabIds.add(t.id);
  }
}

// ---------------- START HOP RUN ----------------

async function handleStart(msg) {
  selectionMode = false;
  selectionOriginTabId = null;

  await stopRunner();

  runState.tabStart = parseInt(msg.tabStart, 10) || 1;
  runState.tabEnd = parseInt(msg.tabEnd, 10) || runState.tabStart;

  runState.seconds = Number(msg.seconds) || 1;
  runState.totalMinutes = Number(msg.totalMinutes) || 1;

  runState.jitterEnabled = !!msg.jitterEnabled;
  runState.jitterPct = Number(msg.jitterPct) || 0;

  runState.rangeEnabled = !!msg.rangeEnabled;
  runState.rangeMin = Number(msg.rangeMin) || 0;
  runState.rangeMax = Number(msg.rangeMax) || 0;

  if (runState.rangeEnabled) {
    runState.jitterEnabled = false;
  }

  runState.useSelectedTabs = !!msg.useSelectedTabs;
  runState.mode = msg.mode === "sequential" ? "sequential" : "random";
  runState.stopOnHuman = !!msg.stopOnHuman;

  const totalMs = Math.max(500, runState.totalMinutes * 60 * 1000);
  runState.tStop = Date.now() + totalMs;

  runState.seqOrder = null;
  runState.nextSeqPos = 0;

  const win = await browser.windows.getCurrent();
  runState.windowId = win.id;

  runState.history = [];
  runState.historyIndex = -1;
  runState.suppressNextHistory = false;

  await browser.storage.local.set({ lastParams: msg });

  await clearRangeMarks();

  if (!runState.useSelectedTabs) {
    const allTabs = await browser.tabs.query({ windowId: runState.windowId });
    allTabs.sort((a, b) => a.index - b.index);

    for (const t of allTabs) {
      const idx1 = t.index + 1;
      if (idx1 >= runState.tabStart && idx1 <= runState.tabEnd) {
        await markTabVisual(t.id);
        rangeMarkedIds.add(t.id);
      }
    }
  }

  await snapshotLastRunTabs();

  startRunner();
  return { ok: true };
}

// ---------------- GET STATE ----------------

async function handleGetState() {
  const last = await browser.storage.local.get("lastParams");
  return {
    running: runState.running,
    paused: runState.paused,
    lastParams: last.lastParams || null
  };
}

async function restartFromLastParams() {
  const stored = await browser.storage.local.get("lastParams");
  const params = stored.lastParams;
  if (!params) {
    return { ok: false, reason: "no_last_params" };
  }
  return handleStart(params);
}

// ---------------- SELECTION HELPERS ----------------

async function handleStopSelection() {
  const list = await getSelectedTabsMeta();
  return { ok: true, count: list.length, tabs: list };
}

async function handleGetSelectedTabs() {
  const tabs = await getSelectedTabsMeta();
  return { tabs };
}

async function getSelectedTabsMeta() {
  if (!selectedTabIds.size) return [];
  const all = await browser.tabs.query({});
  const idSet = new Set(selectedTabIds);
  return all
    .filter((t) => idSet.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      index1: t.index + 1,
      windowId: t.windowId
    }));
}

// Rebuild manual selection from green-dot markers in titles
async function syncSelectedFromMarkers() {
  const all = await browser.tabs.query({});
  selectedTabIds.clear();

  for (const t of all) {
    if (typeof t.title === "string" && t.title.startsWith("🟢")) {
      selectedTabIds.add(t.id);
    }
  }

  const tabs = await getSelectedTabsMeta();
  return { tabs };
}

// ---------------- RUNNER LOGIC / HOTKEYS ----------------

async function handleHotkeyNext() {
  if (!runState.running || runState.windowId == null) {
    return { ok: false };
  }

  const lastIndex = runState.history.length - 1;

  // If we've gone back with ←, walk forward through history first.
  if (
    runState.history.length > 0 &&
    runState.historyIndex >= 0 &&
    runState.historyIndex < lastIndex
  ) {
    jumpHistory(+1);
    return { ok: true };
  }

  // Otherwise: force a fresh hop (new random/sequential tab)
  await hopOnce();
  return { ok: true };
}

function handleHotkeyPrev() {
  if (!runState.running) return { ok: false };
  if (!runState.history.length) return { ok: false };

  jumpHistory(-1);
  return { ok: true };
}

// ---------------- CLOSE LAST RUN TABS ----------------

async function closeLastRunTabs() {
  if (!lastRunTabIds.size) {
    return { closed: 0, running: runState.running, hadLastRun: false };
  }
  if (runState.running) {
    return {
      closed: 0,
      running: true,
      hadLastRun: true
    };
  }

  const allTabs = await browser.tabs.query({});
  const idSet = new Set(lastRunTabIds);
  let closed = 0;
  for (const t of allTabs) {
    if (idSet.has(t.id)) {
      try {
        await browser.tabs.remove(t.id);
        closed++;
      } catch (_) {}
    }
  }

  lastRunTabIds.clear();
  return { closed, running: false };
}

// ---------------- MESSAGE HANDLER ----------------

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== "string") return;

  if (
    (msg.type === "SPACE_STOP" || msg.type === "HUMAN_INPUT") &&
    runState.running &&
    runState.stopOnHuman
  ) {
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
      selectionOriginTabId = null;
      return handleStopSelection();

    case "GET_SELECTED_TABS":
      return handleGetSelectedTabs();

    case "SYNC_SELECTED_FROM_MARKERS":
      return syncSelectedFromMarkers();

    case "UNSELECT_TAB":
      if (typeof msg.tabId === "number") {
        selectedTabIds.delete(msg.tabId);
        unmarkTabVisual(msg.tabId);
      }
      return handleGetSelectedTabs();

    case "CLEAR_ALL_MARKERS":
      return clearAllMarkers().then(() => ({ ok: true }));

    case "GET_SELECTION_STATE":
      return Promise.resolve({
        selecting: selectionMode,
        originTabId: selectionOriginTabId
      });

    case "CLOSE_LAST_RUN_TABS":
      return closeLastRunTabs();

    case "HOTKEY_NEXT":
      return handleHotkeyNext();

    case "HOTKEY_PREV":
      return handleHotkeyPrev();

    // P on pages: toggle pause / resume
    case "HOTKEY_TOGGLE_PAUSE":
      if (!runState.running) {
        return Promise.resolve({ ok: false, reason: "not_running" });
      }
      if (runState.paused) {
        return resumeRunner().then(() => ({ ok: true, state: "running" }));
      }
      return pauseRunner().then(() => ({ ok: true, state: "paused" }));

    // Legacy explicit pause/resume (popup etc.)
    case "HOTKEY_PAUSE":
      return pauseRunner().then(() => ({ ok: true }));

    case "HOTKEY_RESUME":
      return resumeRunner().then(() => ({ ok: true }));

    // Enter on pages:
    // - if stopped: restart last run from stored params
    // - if paused: resume
    case "HOTKEY_ENTER":
      if (!runState.running) {
        return restartFromLastParams();
      }
      if (runState.paused) {
        return resumeRunner().then(() => ({ ok: true, state: "running" }));
      }
      return Promise.resolve({ ok: true, state: "running" });

    case "HOTKEY_STOP":
      return stopRunner().then(() => ({ ok: true }));

    default:
      return;
  }
});

// ---------------- TAB ACTIVATION LISTENER ----------------

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const id = activeInfo.tabId;

  if (selectionMode) {
    if (selectedTabIds.has(id)) {
      selectedTabIds.delete(id);
      await unmarkTabVisual(id);
    } else {
      selectedTabIds.add(id);
      await markTabVisual(id);
    }
    return;
  }

  if (!runState.running) return;

  // If this activation comes from a history jump, don't record it again.
  if (runState.suppressNextHistory) {
    runState.suppressNextHistory = false;
    return;
  }

  const tabs = await browser.tabs.query({ windowId: runState.windowId });
  tabs.sort((a, b) => a.index - b.index);
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  // Trim any "future" history if we had gone backwards
  runState.history = runState.history.slice(0, runState.historyIndex + 1);

  // Avoid pushing duplicate consecutive IDs
  if (runState.history[runState.history.length - 1] === id) {
    runState.historyIndex = runState.history.length - 1;
    return;
  }

  runState.history.push(id);

  // Optional cap so it doesn't grow without bound (logic still uses last 10)
  const MAX_STORED = 50;
  if (runState.history.length > MAX_STORED) {
    const extra = runState.history.length - MAX_STORED;
    runState.history.splice(0, extra);
    runState.historyIndex = runState.history.length - 1;
  } else {
    runState.historyIndex = runState.history.length - 1;
  }
});

// ---------------- START SELECTION ----------------

async function handleStartSelection() {
  selectionMode = true;

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    if (tabs.length > 0) {
      const id = tabs[0].id;
      selectionOriginTabId = id;

      selectedTabIds.add(id);
      await markTabVisual(id);
    }
  } catch (_) {}

  return { ok: true };
}
