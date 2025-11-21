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

  // custom variance range
  rangeEnabled: false,
  rangeMin: 1.0,
  rangeMax: 2.0,

  // manual tab list
  useSelectedTabs: false,

  // mode: "random" or "sequential"
  mode: "random",
  nextSeqPos: 0,

  // lifetime control
  stopDeadline: null,
  remainingMs: 0,
  nextTimeoutId: null,

  // human input stop
  stopOnHuman: true,
  _activatingByCode: false,

  // history of visited tabs (for left/right keys)
  history: [],
  historyIndex: -1,
};

/**
 * History limits
 */
// How many steps back the left-arrow can go from the most recent tab
const MAX_HISTORY_BACK_STEPS = 10;

// Hard cap for total stored history entries (just for memory safety)
const MAX_HISTORY_ENTRIES = 200;

let selectedTabIds = new Set();
let selectionMode = false;
let selectionOriginTabId = null;

let rangeMarkedIds = new Set();

// tabs that were part of the last run's pool
let lastRunTabIds = new Set();

// ---------------- GREEN MARKER HELPERS ----------------

async function markTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "MARK_TAB" });
  } catch (_) {
    // may fail on about: or special pages; ignore
  }
}

async function unmarkTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "UNMARK_TAB" });
  } catch (_) {
    // may fail on about: or special pages; ignore
  }
}

async function clearRangeMarks() {
  const ids = [...rangeMarkedIds];
  for (const id of ids) {
    await unmarkTabVisual(id);
  }
  rangeMarkedIds.clear();
}

// ---------------- STATE BROADCAST ----------------

function broadcastStateChange() {
  const { running, paused, windowId, stopDeadline, remainingMs } = runState;
  browser.runtime.sendMessage({
    type: "STATE_CHANGED",
    running,
    paused,
    windowId,
    stopDeadline,
    remainingMs,
  });
}

// ---------------- TIMING ----------------

function computeDelayMs() {
  const base = runState.seconds;

  if (runState.rangeEnabled) {
    const r = Math.random() < 0.5 ? -1 : 1;
    const mag =
      Math.random() * (runState.rangeMax - runState.rangeMin) +
      runState.rangeMin;
    return Math.max(50, (base + r * mag) * 1000);
  }

  if (runState.jitterEnabled) {
    const p = runState.jitterPct;
    const min = base * (1 - p);
    const max = base * (1 + p);
    return (Math.random() * (max - min) + min) * 1000;
  }

  return base * 1000;
}

function scheduleNextHop(delayMs) {
  if (!runState.running || runState.paused) return;

  const remain = Math.max(0, runState.stopDeadline - Date.now());
  if (remain <= 0) {
    stopRunner();
    return;
  }

  const d = Math.min(remain, delayMs);

  runState.nextTimeoutId = setTimeout(async () => {
    await hopOnce();
    if (!runState.running || runState.paused) return;

    const r = Math.max(0, runState.stopDeadline - Date.now());
    if (r <= 0) {
      stopRunner();
      return;
    }

    scheduleNextHop(Math.min(r, computeDelayMs()));
  }, d);
}

// ---------------- HOP LOGIC ----------------

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
        const idx1 = t.index + 1;
        return idx1 >= runState.tabStart && idx1 <= runState.tabEnd;
      });
    }

    if (!list.length) return;

    let next;
    if (runState.mode === "sequential") {
      // ensure nextSeqPos is in range
      if (runState.nextSeqPos < 0 || runState.nextSeqPos >= list.length) {
        runState.nextSeqPos = 0;
      }
      next = list[runState.nextSeqPos];
      runState.nextSeqPos = (runState.nextSeqPos + 1) % list.length;
    } else {
      // random
      next = list[Math.floor(Math.random() * list.length)];
    }

    if (!next) return;

    // mark that we are activating by code to avoid stop-on-human triggering
    runState._activatingByCode = true;
    try {
      await browser.tabs.update(next.id, { active: true });
      await browser.windows.update(runState.windowId, { focused: true });
    } finally {
      runState._activatingByCode = false;
    }

    // If we previously went backwards in history, drop all "forward" entries.
    if (
      runState.historyIndex >= 0 &&
      runState.historyIndex < runState.history.length - 1
    ) {
      runState.history = runState.history.slice(0, runState.historyIndex + 1);
    }

    // Append this tab to history
    runState.history.push(next.id);

    // Hard cap total history length
    if (runState.history.length > MAX_HISTORY_ENTRIES) {
      runState.history.shift();
    }

    // We are now at the end of the history
    runState.historyIndex = runState.history.length - 1;
  } catch (e) {
    console.error("hopOnce error:", e);
  }
}

// ---------------- RUNNER CONTROL ----------------

function startRunner() {
  if (runState.running) return;
  runState.running = true;
  runState.paused = false;

  runState.remainingMs = runState.totalMinutes * 60_000;
  runState.stopDeadline = Date.now() + runState.remainingMs;

  broadcastStateChange();
  scheduleNextHop(0);
}

async function stopRunner() {
  if (runState.nextTimeoutId) {
    clearTimeout(runState.nextTimeoutId);
    runState.nextTimeoutId = null;
  }

  // auto-clear range markers when stopping a range run
  if (!runState.useSelectedTabs) {
    await clearRangeMarks();
  }

  runState.running = false;
  runState.paused = false;
  runState.windowId = null;
  runState.stopDeadline = null;
  runState.remainingMs = 0;

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

  runState.stopDeadline = Date.now() + (runState.remainingMs || 0);
  broadcastStateChange();
  scheduleNextHop(0);
}

// ---------------- SELECTION MODE ----------------

async function handleStartSelection() {
  selectionMode = true;

  // ALWAYS add and mark the current active tab as soon as choosing starts
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const id = tabs[0].id;
      selectionOriginTabId = id;

      selectedTabIds.add(id);
      await markTabVisual(id);
    }
  } catch (_) {}

  return { ok: true };
}

async function handleStopSelection() {
  selectionMode = false;
  selectionOriginTabId = null;
  return { ok: true };
}

async function handleGetSelectedTabs() {
  const tabs = await browser.tabs.query({ windowId: runState.windowId });
  tabs.sort((a, b) => a.index - b.index);
  const set = new Set(selectedTabIds);
  const list = tabs.filter((t) => set.has(t.id));
  return { tabs: list };
}

// Snapshot which tabs are part of this run
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
      const idx = t.index + 1;
      return idx >= runState.tabStart && idx <= runState.tabEnd;
    });
  }

  for (const t of list) {
    lastRunTabIds.add(t.id);
  }
}

// ---------------- GET STATE ----------------

async function handleGetState() {
  const last = await browser.storage.local.get("lastParams");
  return {
    running: runState.running,
    paused: runState.paused,
    windowId: runState.windowId,
    stopDeadline: runState.stopDeadline,
    remainingMs: runState.remainingMs,
    lastParams: last.lastParams || null,
  };
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
  runState.rangeMax = Number(msg.rangeMax) || runState.rangeMin;

  if (runState.rangeEnabled && runState.jitterEnabled) {
    runState.jitterEnabled = false;
  }

  runState.useSelectedTabs = !!msg.useSelectedTabs;
  runState.mode = msg.mode === "sequential" ? "sequential" : "random";
  runState.stopOnHuman = !!msg.stopOnHuman;

  runState.nextSeqPos = 0;

  const win = await browser.windows.getCurrent();
  runState.windowId = win.id;

  // reset history for this run
  runState.history = [];
  runState.historyIndex = -1;

  // Store persistently for popup restore
  await browser.storage.local.set({ lastParams: msg });

  // Clear old range marks
  await clearRangeMarks();

  // Mark range tabs with green orb if using range mode
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

  // snapshot tabs included in this run as "last run tabs"
  await snapshotLastRunTabs();

  startRunner();
  return { ok: true };
}

// ---------------- HOTKEYS: NEXT / PREV / SPACE / CLOSE_LAST_RUN_TABS ----------------

async function handleHotkeyNext() {
  if (!runState.running || runState.paused) return { ok: false };

  if (runState.nextTimeoutId) {
    clearTimeout(runState.nextTimeoutId);
    runState.nextTimeoutId = null;
  }

  await hopOnce();

  if (runState.running && !runState.paused) {
    const r = Math.max(0, runState.stopDeadline - Date.now());
    if (r <= 0) {
      await stopRunner();
    } else {
      scheduleNextHop(Math.min(r, computeDelayMs()));
    }
  }
  return { ok: true };
}

async function handleHotkeyPrev() {
  if (!runState.running) return { ok: false };
  if (runState.history.length === 0) return { ok: false };

  const len = runState.history.length;

  // Make sure historyIndex is sane; if not, snap it to the latest tab
  if (runState.historyIndex < 0 || runState.historyIndex >= len) {
    runState.historyIndex = len - 1;
  }

  // You can go back at most MAX_HISTORY_BACK_STEPS from the *latest* tab
  const minIndex = Math.max(0, len - 1 - MAX_HISTORY_BACK_STEPS);

  // Already as far back as allowed? Then left-arrow does nothing.
  if (runState.historyIndex <= minIndex) {
    return { ok: false };
  }

  // Step one position back, but never past minIndex
  let newIndex = runState.historyIndex - 1;
  if (newIndex < minIndex) {
    newIndex = minIndex;
  }

  const tabId = runState.history[newIndex];

  try {
    runState._activatingByCode = true;
    try {
      await browser.tabs.update(tabId, { active: true });
      if (runState.windowId != null) {
        await browser.windows.update(runState.windowId, { focused: true });
      }
    } finally {
      runState._activatingByCode = false;
    }

    runState.historyIndex = newIndex;

    // Cancel any scheduled hop and reschedule
    if (runState.nextTimeoutId) {
      clearTimeout(runState.nextTimeoutId);
      runState.nextTimeoutId = null;
    }

    if (runState.running && !runState.paused) {
      const r = Math.max(0, runState.stopDeadline - Date.now());
      if (r <= 0) {
        await stopRunner();
      } else {
        scheduleNextHop(Math.min(r, computeDelayMs()));
      }
    }

    return { ok: true };
  } catch (e) {
    console.error("handleHotkeyPrev error:", e);
    return { ok: false };
  }
}

async function closeLastRunTabs() {
  const ids = [...lastRunTabIds];
  if (!ids.length) return { closed: 0, running: runState.running };

  const allTabs = await browser.tabs.query({});
  const idSet = new Set(ids);
  let closed = 0;

  for (const t of allTabs) {
    if (idSet.has(t.id)) {
      try {
        await browser.tabs.remove(t.id);
        closed++;
      } catch (_) {
        // tab might already be gone; ignore
      }
    }
  }

  lastRunTabIds.clear();
  return { closed, running: runState.running };
}

// ---------------- MESSAGE HANDLER ----------------

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== "string") return;

  // Space / general human input can stop the run
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
        originTabId: selectionOriginTabId,
      });

    case "HOTKEY_NEXT":
      return handleHotkeyNext();

    case "HOTKEY_PREV":
      return handleHotkeyPrev();

    case "CLOSE_LAST_RUN_TABS":
      return closeLastRunTabs();

    default:
      break;
  }
});

// clear all markers helper for "Clear all markers" button
async function clearAllMarkers() {
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    await unmarkTabVisual(t.id);
  }
  selectedTabIds.clear();
  rangeMarkedIds.clear();
}

// ---------------- TAB ACTIVATION WATCHER ----------------

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const id = activeInfo.tabId;

  if (selectionMode) {
    // toggle inclusion while choosing tabs
    if (selectedTabIds.has(id)) {
      selectedTabIds.delete(id);
      await unmarkTabVisual(id);
    } else {
      selectedTabIds.add(id);
      await markTabVisual(id);
    }
    return;
  }

  // human-triggered activities can optionally stop
  if (!runState._activatingByCode && runState.running && runState.stopOnHuman) {
    await stopRunner();
  }
});
