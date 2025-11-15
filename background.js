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

  // mode
  mode: "random",
  nextIndex1: null,
  nextSeqPos: 0,

  // lifetime control
  stopDeadline: null,
  remainingMs: 0,
  nextTimeoutId: null,

  // human input stop
  stopOnHuman: true,
  _activatingByCode: false
};

let selectedTabIds = new Set();
let selectionMode = false;
let selectionOriginTabId = null;

let rangeMarkedIds = new Set();

// ---------------- GREEN MARKER HELPERS ----------------

async function markTabVisual(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "MARK_TAB" });
  } catch (_) {}
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

// Remove all markers from every tab (including very old ones)
async function clearAllMarkers() {
  const allTabs = await browser.tabs.query({});
  for (const t of allTabs) {
    await unmarkTabVisual(t.id);
  }
  selectedTabIds.clear();
  rangeMarkedIds.clear();
  selectionMode = false;
  selectionOriginTabId = null;
}

function broadcastStateChange() {
  try {
    browser.runtime.sendMessage({ type: "STATE_CHANGED" }).catch(() => {});
  } catch (_) {}
}

// ---------------- MESSAGE HANDLER ----------------

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== "string") return;

  if ((msg.type === "SPACE_STOP" || msg.type === "HUMAN_INPUT") &&
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
        originTabId: selectionOriginTabId
      });

    default:
      return;
  }
});

// ---------------- TAB ACTIVATION LISTENER ----------------

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const id = activeInfo.tabId;

  if (selectionMode) {
    // toggle inclusion
    if (selectedTabIds.has(id)) {
      selectedTabIds.delete(id);
      await unmarkTabVisual(id);
    } else {
      selectedTabIds.add(id);
      await markTabVisual(id);
    }
    return;
  }

  // normal hop-running behavior
  if (!runState.running || !runState.stopOnHuman) return;
  if (runState._activatingByCode) return;

  await stopRunner();
});

// ---------------- START SELECTION ----------------

async function handleStartSelection() {
  selectionMode = true;

  // auto-add current tab
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const id = tabs[0].id;
      selectionOriginTabId = id;

      if (!selectedTabIds.has(id)) {
        selectedTabIds.add(id);
        await markTabVisual(id);
      }
    }
  } catch (_) {}

  return { ok: true };
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

  if (runState.rangeEnabled && runState.jitterEnabled)
    runState.jitterEnabled = false;

  runState.useSelectedTabs = !!msg.useSelectedTabs;
  runState.mode = msg.mode === "sequential" ? "sequential" : "random";
  runState.stopOnHuman = !!msg.stopOnHuman;

  runState.nextSeqPos = 0;

  const win = await browser.windows.getCurrent();
  runState.windowId = win.id;

  // Store persistently
  await browser.storage.local.set({ lastParams: msg });

  // prepare visual marking for range mode
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

// ---------------- STOP SELECTION ----------------

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
  return all.filter(t => idSet.has(t.id)).map(t => ({
    id: t.id,
    title: t.title,
    index1: t.index + 1,
    windowId: t.windowId
  }));
}

// ---------------- RUNNER LOGIC ----------------

function startRunner() {
  if (runState.running) return;
  runState.running = true;
  runState.paused = false;

  runState.remainingMs = runState.totalMinutes * 60000;
  runState.stopDeadline = Date.now() + runState.remainingMs;

  broadcastStateChange();
  scheduleNextHop(0);
}

async function stopRunner() {
  if (runState.nextTimeoutId)
    clearTimeout(runState.nextTimeoutId);

  // auto-clear range markers
  if (!runState.useSelectedTabs)
    await clearRangeMarks();

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

  if (runState.nextTimeoutId)
    clearTimeout(runState.nextTimeoutId);

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

function computeDelayMs() {
  const base = runState.seconds;

  if (runState.rangeEnabled) {
    const r = Math.random() < 0.5 ? -1 : 1;
    const mag = Math.random() * (runState.rangeMax - runState.rangeMin) + runState.rangeMin;
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
  if (remain <= 0) return stopRunner();

  const d = Math.min(remain, delayMs);

  runState.nextTimeoutId = setTimeout(async () => {
    await hopOnce();
    if (!runState.running || runState.paused) return;

    const r = Math.max(0, runState.stopDeadline - Date.now());
    if (r <= 0) return stopRunner();

    scheduleNextHop(Math.min(r, computeDelayMs()));
  }, d);
}

async function hopOnce() {
  try {
    if (!runState.running || runState.paused || runState.windowId == null) return;

    const tabs = await browser.tabs.query({ windowId: runState.windowId });
    tabs.sort((a, b) => a.index - b.index);

    let list;
    if (runState.useSelectedTabs && selectedTabIds.size > 0) {
      const set = new Set(selectedTabIds);
      list = tabs.filter(t => set.has(t.id));
    } else {
      list = tabs.filter(t => {
        const idx = t.index + 1;
        return idx >= runState.tabStart && idx <= runState.tabEnd;
      });
    }

    if (list.length === 0) return;

    let next;
    if (runState.mode === "sequential") {
      next = list[runState.nextSeqPos];
      runState.nextSeqPos = (runState.nextSeqPos + 1) % list.length;
    } else {
      next = list[Math.floor(Math.random() * list.length)];
    }

    await browser.windows.update(runState.windowId, { focused: true });

    runState._activatingByCode = true;
    try {
      await browser.tabs.update(next.id, { active: true });
    } finally {
      setTimeout(() => (runState._activatingByCode = false), 120);
    }
  } catch (e) {
    console.error("hopOnce error:", e);
  }
}
