const els = {
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
  selectedTabsContainer: document.getElementById("selectedTabsContainer"),

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
let cachedSelectedTabs = []; // {id, title, index1}

function reflectMode() {
  els.modeBtn.textContent = currentMode === "random" ? "Random" : "Sequential";
}

function updateJitterLabel() {
  const pct = parseInt(els.jitterRange.value, 10) || 0;
  els.jitterLabel.textContent = `Timing Variance (±${pct}%)`;
  els.jitterValue.textContent = `${pct}%`;
}
// Listen for background state changes (human stop, loop finished, etc.)
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "STATE_CHANGED") return;
  refreshState();
});

function setJitter(on) {
  jitterOn = !!on;
  els.jitterToggle.classList.toggle("on", jitterOn);
  els.jitterToggle.textContent = jitterOn ? "ON" : "OFF";
  els.jitterToggle.setAttribute("aria-pressed", jitterOn ? "true" : "false");

  els.jitterRange.classList.toggle("slider-disabled", !jitterOn);

  // mutual exclusivity
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

  // mutual exclusivity
  if (rangeOn && jitterOn) {
    setJitter(false);
  }
}

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;
  els.useListToggle.classList.toggle("on", useSelectedTabs);
  els.useListToggle.textContent = useSelectedTabs ? "ON" : "OFF";
  els.useListToggle.setAttribute("aria-pressed", useSelectedTabs ? "true" : "false");
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

// ---- variance sliders ----

// auto-enable jitter when moving its slider
els.jitterRange.addEventListener("input", () => {
  if (!jitterOn) {
    setJitter(true);
  }
  updateJitterLabel();
});
els.jitterToggle.addEventListener("click", () => setJitter(!jitterOn));

// auto-enable range when moving either handle
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

function renderSelectedTabs() {
  if (!cachedSelectedTabs.length) {
    els.selectedTabsContainer.textContent = "No tabs selected.";
    return;
  }
  els.selectedTabsContainer.innerHTML = "";
  cachedSelectedTabs.forEach(tab => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "8px";
    row.style.marginBottom = "2px";

    const label = document.createElement("span");
    label.textContent = `#${tab.index1} ${tab.title || "(no title)"}`;
    label.style.flex = "1 1 auto";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.padding = "0 6px";
    btn.style.cursor = "pointer";
    btn.style.background = "#3a3f4a";
    btn.style.color = "#e8ecf1";
    btn.dataset.tabId = String(tab.id);

    row.appendChild(label);
    row.appendChild(btn);
    els.selectedTabsContainer.appendChild(row);
  });
}

els.useListToggle.addEventListener("click", () => {
  setUseSelectedTabs(!useSelectedTabs);
});

els.chooseTabsBtn.addEventListener("click", async () => {
  if (!selectingTabs) {
    selectingTabs = true;
    els.chooseTabsBtn.textContent = "Done choosing";
    await browser.runtime.sendMessage({ type: "START_SELECTION" });
  } else {
    selectingTabs = false;
    els.chooseTabsBtn.textContent = "Choose tabs";
    const res = await browser.runtime.sendMessage({ type: "STOP_SELECTION" });
    cachedSelectedTabs = (res && res.tabs) || [];
    renderSelectedTabs();
  }
});

els.selectedTabsContainer.addEventListener("click", async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const idStr = target.dataset.tabId;
  if (!idStr) return;
  const tabId = Number(idStr);
  const res = await browser.runtime.sendMessage({ type: "UNSELECT_TAB", tabId });
  cachedSelectedTabs = (res && res.tabs) || [];
  renderSelectedTabs();
});

// ---- state sync with background ----

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
    }
  }

  // pull current selected tab list
  const res = await browser.runtime.sendMessage({ type: "GET_SELECTED_TABS" });
  cachedSelectedTabs = (res && res.tabs) || [];
  renderSelectedTabs();
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
reflectMode();
refreshState();
