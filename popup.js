// popup.js — UI logic for Random Tab Hopper

const els = {
  rangeSection: document.getElementById("rangeSection"),
  manualSection: document.getElementById("manualSection"),
  rangeNote: document.getElementById("rangeNote"),
  manualNote: document.getElementById("manualNote"),

  tabStart: document.getElementById("tabStart"),
  tabEnd: document.getElementById("tabEnd"),
  seconds: document.getElementById("seconds"),

  jitterLabel: document.getElementById("jitterLabel"),
  jitterToggle: document.getElementById("jitterToggle"),
  jitterRange: document.getElementById("jitterRange"),
  jitterValue: document.getElementById("jitterValue"),

  rangeToggle: document.getElementById("rangeToggle"),
  minRange: document.getElementById("minRange"),
  maxRange: document.getElementById("maxRange"),
  minLabel: document.getElementById("minLabel"),
  maxLabel: document.getElementById("maxLabel"),
  trackFill: document.getElementById("trackFill"),

  useListToggle: document.getElementById("useListToggle"),
  chooseTabsBtn: document.getElementById("chooseTabsBtn"),
  clearMarkersBtn: document.getElementById("clearMarkersBtn"),

  totalMinutes: document.getElementById("totalMinutes"),
  modeBtn: document.getElementById("modeBtn"),
  stopOnHuman: document.getElementById("stopOnHuman"),

  startBtn: document.getElementById("startBtn"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status")
};

// ---------------- STATE ----------------

let currentMode = "random";
let jitterOn = false;
let rangeOn = false;

let useSelectedTabs = false;
let selectingTabs = false;
let manualCount = 0;

// ---------------- UI HELPERS ----------------

function reflectMode() {
  els.modeBtn.textContent = currentMode === "random" ? "Random" : "Sequential";
}

function updateJitterLabel() {
  const pct = parseInt(els.jitterRange.value, 10) || 0;
  els.jitterLabel.textContent = `Timing Variance (±${pct}%)`;
  els.jitterValue.textContent = `${pct}%`;
}

function setJitter(on) {
  jitterOn = !!on;
  els.jitterToggle.classList.toggle("on", jitterOn);
  els.jitterToggle.textContent = jitterOn ? "ON" : "OFF";
  els.jitterToggle.setAttribute("aria-pressed", jitterOn);

  els.jitterRange.classList.toggle("slider-disabled", !jitterOn);

  if (jitterOn && rangeOn) setRange(false);
  updateJitterLabel();
}

function setRange(on) {
  rangeOn = !!on;
  els.rangeToggle.classList.toggle("on", rangeOn);
  els.rangeToggle.textContent = rangeOn ? "ON" : "OFF";
  els.rangeToggle.setAttribute("aria-pressed", rangeOn);

  els.minRange.classList.toggle("disabled", !rangeOn);
  els.maxRange.classList.toggle("disabled", !rangeOn);

  if (rangeOn && jitterOn) setJitter(false);
}

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;
  els.useListToggle.classList.toggle("on", useSelectedTabs);
  els.useListToggle.textContent = useSelectedTabs ? "ON" : "OFF";
  els.useListToggle.setAttribute("aria-pressed", useSelectedTabs);

  if (useSelectedTabs) {
    els.rangeSection.classList.add("section-disabled");
    els.tabStart.disabled = true;
    els.tabEnd.disabled = true;
    els.rangeNote.textContent = "Using manual tab list (tab range disabled).";
  } else {
    els.rangeSection.classList.remove("section-disabled");
    els.tabStart.disabled = false;
    els.tabEnd.disabled = false;
    els.rangeNote.textContent = "Using tab range (manual tab list disabled).";
  }

  updateManualNote();
}

function updateManualNote() {
  if (useSelectedTabs) {
    if (manualCount > 0)
      els.manualNote.textContent = `Manual tab list active (${manualCount} selected)`;
    else
      els.manualNote.textContent = "Manual tab list active (no tabs selected yet)";
  } else {
    els.manualNote.textContent = "Manual tab list disabled (using tab range).";
  }
}

function updateChooserButton() {
  if (selectingTabs) {
    els.chooseTabsBtn.textContent = "Choosing...";
    els.chooseTabsBtn.classList.add("btn-chooser-active");
    els.chooseTabsBtn.classList.remove("btn-chooser-idle");
  } else {
    els.chooseTabsBtn.textContent = "Choose tabs";
    els.chooseTabsBtn.classList.add("btn-chooser-idle");
    els.chooseTabsBtn.classList.remove("btn-chooser-active");
  }
}

// ---------------- VARIANCE SLIDERS ----------------
// (unchanged, omitted for brevity — same as your version)

// ---------------- MANUAL SELECTION ----------------

els.useListToggle.addEventListener("click", () => {
  setUseSelectedTabs(!useSelectedTabs);
});

els.chooseTabsBtn.addEventListener("click", async () => {
  if (!selectingTabs) {
    // ALWAYS turn on manual list when choosing tabs
    setUseSelectedTabs(true);

    selectingTabs = true;
    updateChooserButton();

    await browser.runtime.sendMessage({ type: "START_SELECTION" });
  } else {
    selectingTabs = false;
    updateChooserButton();

    const res = await browser.runtime.sendMessage({ type: "STOP_SELECTION" });
    manualCount = res.count || 0;
    updateManualNote();
  }
});

// ---------------- CLEAR MARKERS ----------------

els.clearMarkersBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_ALL_MARKERS" });

  manualCount = 0;
  selectingTabs = false;
  updateChooserButton();
  updateManualNote();
});

// ---------------- STATE SYNC ----------------

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_CHANGED") refreshState();
});

async function refreshState() {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  const { running, paused, lastParams } = state || {};

  if (running) {
    els.status.textContent = paused ? "Paused" : "Running…";
    els.status.className = paused ? "status paused" : "status running";
    els.pauseResumeBtn.textContent = paused ? "Resume" : "Pause";
  } else {
    els.status.textContent = "Stopped";
    els.status.className = "status stopped";
    els.pauseResumeBtn.textContent = "Pause";
  }

  if (lastParams) {
    els.tabStart.value = lastParams.tabStart;
    els.tabEnd.value = lastParams.tabEnd;
    els.seconds.value = lastParams.seconds;
    els.totalMinutes.value = lastParams.totalMinutes;

    els.jitterRange.value = lastParams.jitterPct * 100;
    updateJitterLabel();

    els.minRange.value = lastParams.rangeMin;
    els.maxRange.value = lastParams.rangeMax;
    setRange(lastParams.rangeEnabled);
    setJitter(lastParams.jitterEnabled);

    currentMode = lastParams.mode;
    reflectMode();

    els.stopOnHuman.checked = !!lastParams.stopOnHuman;

    // restore manual-list mode exactly as it was
    setUseSelectedTabs(!!lastParams.useSelectedTabs);
  }

  const res = await browser.runtime.sendMessage({ type: "GET_SELECTED_TABS" });
  manualCount = (res.tabs || []).length;
  updateManualNote();

  // sync "choosing" state
  const sel = await browser.runtime.sendMessage({ type: "GET_SELECTION_STATE" });
  selectingTabs = !!sel.selecting;

  // choosing ALWAYS forces manual-list ON
  if (selectingTabs) {
    setUseSelectedTabs(true);
  }

  updateChooserButton();
}

// ---------------- CONTROLS ----------------

els.startBtn.addEventListener("click", async () => {
  const params = {
    type: "START",
    tabStart: parseInt(els.tabStart.value),
    tabEnd: parseInt(els.tabEnd.value),
    seconds: parseFloat(els.seconds.value),
    totalMinutes: parseFloat(els.totalMinutes.value),
    jitterEnabled: jitterOn,
    jitterPct: parseInt(els.jitterRange.value) / 100,
    rangeEnabled: rangeOn,
    rangeMin: parseFloat(els.minRange.value),
    rangeMax: parseFloat(els.maxRange.value),
    useSelectedTabs,
    mode: currentMode,
    stopOnHuman: els.stopOnHuman.checked
  };

  selectingTabs = false;
  updateChooserButton();

  await browser.runtime.sendMessage(params);
  refreshState();
});

els.pauseResumeBtn.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!state.running) return;

  await browser.runtime.sendMessage({
    type: state.paused ? "RESUME" : "PAUSE"
  });

  refreshState();
});

els.stopBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "STOP" });
  refreshState();
});

// ---------------- INIT ----------------

updateChooserButton();
reflectMode();
refreshState();
