// popup.js — UI logic

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

let currentMode = "random";
let jitterOn = false;
let rangeOn = false;

let useSelectedTabs = false;
let selectingTabs = false;
let manualCount = 0;

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
  els.jitterToggle.setAttribute("aria-pressed", jitterOn ? "true" : "false");

  els.jitterRange.classList.toggle("slider-disabled", !jitterOn);

  if (jitterOn && rangeOn) {
    setRange(false);
  }
  updateJitterLabel();
}

function setRange(on) {
  rangeOn = !!on;
  els.rangeToggle.classList.toggle("on", rangeOn);
  els.rangeToggle.textContent = rangeOn ? "ON" : "OFF";
  els.rangeToggle.setAttribute("aria-pressed", rangeOn ? "true" : "false");

  [els.minRange, els.maxRange].forEach(r => {
    r.classList.toggle("disabled", !rangeOn);
  });

  if (rangeOn && jitterOn) {
    setJitter(false);
  }
}

function updateManualNote() {
  if (useSelectedTabs) {
    if (manualCount > 0) {
      els.manualNote.textContent =
        `Manual tab list active (${manualCount} tab${manualCount === 1 ? "" : "s"} selected).`;
    } else {
      els.manualNote.textContent =
        "Manual tab list active, but no tabs selected yet.";
    }
  } else {
    els.manualNote.textContent = "Manual tab list disabled (using tab range).";
  }
}

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;
  els.useListToggle.classList.toggle("on", useSelectedTabs);
  els.useListToggle.textContent = useSelectedTabs ? "ON" : "OFF";
  els.useListToggle.setAttribute("aria-pressed", useSelectedTabs ? "true" : "false");

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

function updateDualSlider(from) {
  const minR = els.minRange;
  const maxR = els.maxRange;
  const step = parseFloat(minR.step) || 0.5;

  let minVal = parseFloat(minR.value);
  let maxVal = parseFloat(maxR.value);

  if (from === "min" && minVal > maxVal - step) {
    minVal = maxVal - step;
    minR.value = minVal.toFixed(1);
  }
  if (from === "max" && maxVal < minVal + step) {
    maxVal = minVal + step;
    maxR.value = maxVal.toFixed(1);
  }

  minVal = parseFloat(minR.value);
  maxVal = parseFloat(maxR.value);

  const lo = parseFloat(minR.min);
  const hi = parseFloat(minR.max);

  const leftPct  = ((minVal - lo) / (hi - lo)) * 100;
  const rightPct = 100 - ((maxVal - lo) / (hi - lo)) * 100;

  els.trackFill.style.left = `${leftPct}%`;
  els.trackFill.style.right = `${rightPct}%`;

  els.minLabel.textContent = `${minVal.toFixed(1)}s`;
  els.maxLabel.textContent = `${maxVal.toFixed(1)}s`;
}

function updateChooserButton() {
  if (selectingTabs) {
    els.chooseTabsBtn.textContent = "Choosing...";
    els.chooseTabsBtn.classList.remove("btn-chooser-idle");
    els.chooseTabsBtn.classList.add("btn-chooser-active");
  } else {
    els.chooseTabsBtn.textContent = "Choose tabs";
    els.chooseTabsBtn.classList.remove("btn-chooser-active");
    els.chooseTabsBtn.classList.add("btn-chooser-idle");
  }
}

// ---- variance sliders ----

els.jitterRange.addEventListener("input", () => {
  if (!jitterOn) setJitter(true);
  updateJitterLabel();
});
els.jitterToggle.addEventListener("click", () => setJitter(!jitterOn));

["input", "change"].forEach(ev => {
  els.minRange.addEventListener(ev, () => {
    if (!rangeOn) setRange(true);
    updateDualSlider("min");
  });
  els.maxRange.addEventListener(ev, () => {
    if (!rangeOn) setRange(true);
    updateDualSlider("max");
  });
});
els.rangeToggle.addEventListener("click", () => setRange(!rangeOn));

// ---- manual tab list UI ----

els.useListToggle.addEventListener("click", () => {
  setUseSelectedTabs(!useSelectedTabs);
});

els.chooseTabsBtn.addEventListener("click", async () => {
  if (!selectingTabs) {
    // entering selection mode:
    // 1) make sure manual list is ON
    setUseSelectedTabs(true);

    selectingTabs = true;
    updateChooserButton();
    await browser.runtime.sendMessage({ type: "START_SELECTION" });
  } else {
    // leaving selection mode manually
    selectingTabs = false;
    updateChooserButton();
    const res = await browser.runtime.sendMessage({ type: "STOP_SELECTION" });
    manualCount = (res && typeof res.count === "number") ? res.count : 0;
    updateManualNote();
  }
});

// Clear everything: manual selection + range marks + all green orbs
els.clearMarkersBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_ALL_MARKERS" });
  manualCount = 0;
  selectingTabs = false;
  updateChooserButton();
  updateManualNote();
});

// ---- listen for background state changes (human stop, loop finished, etc.) ----
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "STATE_CHANGED") return;
  refreshState();
});

// ---- state sync ----

async function refreshState() {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  const { running, paused, lastParams } = state || {};

  if (running) {
    els.status.textContent = paused ? "Paused" : "Running…";
    els.status.className = `status ${paused ? "paused" : "running"}`;
    els.pauseResumeBtn.textContent = paused ? "Resume" : "Pause";
  } else {
    els.status.textContent = "Stopped";
    els.status.className = "status stopped";
    els.pauseResumeBtn.textContent = "Pause";
  }

  if (lastParams) {
    if (lastParams.tabStart != null) els.tabStart.value = lastParams.tabStart;
    if (lastParams.tabEnd != null) els.tabEnd.value = lastParams.tabEnd;
    if (lastParams.seconds != null) els.seconds.value = lastParams.seconds;
    if (lastParams.totalMinutes != null) els.totalMinutes.value = lastParams.totalMinutes;

    if (lastParams.jitterPct != null) {
      const pct = Math.round(Number(lastParams.jitterPct) * 100);
      els.jitterRange.value = pct;
      updateJitterLabel();
    }

    if (lastParams.rangeMin != null) els.minRange.value = lastParams.rangeMin;
    if (lastParams.rangeMax != null) els.maxRange.value = lastParams.rangeMax;
    updateDualSlider();

    const savedRangeOn = !!lastParams.rangeEnabled;
    const savedJitterOn = !!lastParams.jitterEnabled && !savedRangeOn;
    setRange(savedRangeOn);
    setJitter(savedJitterOn);

    if (lastParams.mode === "random" || lastParams.mode === "sequential") {
      currentMode = lastParams.mode;
      reflectMode();
    }

    if (lastParams.stopOnHuman != null) {
      els.stopOnHuman.checked = !!lastParams.stopOnHuman;
    }

    if (lastParams.useSelectedTabs != null) {
      setUseSelectedTabs(!!lastParams.useSelectedTabs);
    } else {
      setUseSelectedTabs(false);
    }
  } else {
    setUseSelectedTabs(false);
  }

  // current manual selection count
  const res = await browser.runtime.sendMessage({ type: "GET_SELECTED_TABS" });
  const tabs = (res && res.tabs) || [];
  manualCount = tabs.length;
  updateManualNote();

  // Sync "Choosing…" state with background
  const selState = await browser.runtime.sendMessage({ type: "GET_SELECTION_STATE" });
  selectingTabs = !!(selState && selState.selecting);
  updateChooserButton();
}

// ---- controls ----

els.modeBtn.addEventListener("click", () => {
  currentMode = currentMode === "random" ? "sequential" : "random";
  reflectMode();
});

els.startBtn.addEventListener("click", async () => {
  const tabStart = parseInt(els.tabStart.value, 10);
  const tabEnd = parseInt(els.tabEnd.value, 10);
  const seconds = parseFloat(els.seconds.value);
  const totalMinutes = parseFloat(els.totalMinutes.value);

  if ([tabStart, tabEnd, seconds, totalMinutes].some(Number.isNaN) ||
      tabStart < 1 || tabEnd < tabStart || seconds <= 0 || totalMinutes <= 0) {
    alert("Please enter valid values for tab range, seconds per tab, and total minutes.");
    return;
  }

  const jitterPct = (parseInt(els.jitterRange.value, 10) || 0) / 100.0;
  const rangeMin = parseFloat(els.minRange.value);
  const rangeMax = parseFloat(els.maxRange.value);

  await browser.runtime.sendMessage({
    type: "START",
    tabStart,
    tabEnd,
    seconds,
    totalMinutes,
    jitterEnabled: jitterOn,
    jitterPct,
    rangeEnabled: rangeOn,
    rangeMin,
    rangeMax,
    useSelectedTabs,
    mode: currentMode,
    stopOnHuman: !!els.stopOnHuman.checked
  });

  // Starting the script also ends "Choosing…" mode
  selectingTabs = false;
  updateChooserButton();

  await refreshState();
});

els.pauseResumeBtn.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!state || !state.running) return;
  await browser.runtime.sendMessage({ type: state.paused ? "RESUME" : "PAUSE" });
  await refreshState();
});

els.stopBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "STOP" });
  await refreshState();
});

// init
updateDualSlider();
updateJitterLabel();
setJitter(false);
setRange(false);
setUseSelectedTabs(false);
updateChooserButton();
reflectMode();
refreshState();
