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
  closeLastRunBtn: document.getElementById("closeLastRunBtn"),

  totalMinutes: document.getElementById("totalMinutes"),
  stopOnHuman: document.getElementById("stopOnHuman"),

  startBtn: document.getElementById("startBtn"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status"),

  modeSwitch: document.getElementById("modeSwitch"),

  hotkeyHelpBtn: document.getElementById("hotkeyHelpBtn"),
  hotkeyPanel: document.getElementById("hotkeyPanel"),
  hotkeyCloseBtn: document.getElementById("hotkeyCloseBtn"),
};

// ---------- state ----------

let currentMode = "random";
let jitterOn = false;
let rangeOn = false;

let useSelectedTabs = false;
let selectingTabs = false;
let manualCount = 0;

// ---------- helpers ----------

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

  if (jitterOn && rangeOn) setRange(false);

  updateJitterLabel();
}

function setRange(on) {
  rangeOn = !!on;
  els.rangeToggle.classList.toggle("on", rangeOn);
  els.rangeToggle.textContent = rangeOn ? "ON" : "OFF";
  els.rangeToggle.setAttribute("aria-pressed", rangeOn ? "true" : "false");

  [els.minRange, els.maxRange].forEach((r) => {
    r.classList.toggle("disabled", !rangeOn);
  });

  if (rangeOn && jitterOn) setJitter(false);
}

function updateDualSlider(from) {
  const minR = els.minRange;
  const maxR = els.maxRange;
  const step = parseFloat(minR.step) || 0.5;

  let minVal = parseFloat(minR.value);
  let maxVal = parseFloat(maxR.value);

  if (Number.isNaN(minVal)) minVal = parseFloat(minR.min) || 0.5;
  if (Number.isNaN(maxVal)) maxVal = parseFloat(maxR.max) || 30;

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
  const hi = parseFloat(maxR.max);
  const span = hi - lo || 1;

  const leftPct = ((minVal - lo) / span) * 100;
  const rightPct = 100 - ((maxVal - lo) / span) * 100;

  els.trackFill.style.left = `${leftPct}%`;
  els.trackFill.style.right = `${rightPct}%`;

  els.minLabel.textContent = `${minVal.toFixed(1)}s`;
  els.maxLabel.textContent = `${maxVal.toFixed(1)}s`;
}

function updateManualNote() {
  if (useSelectedTabs) {
    if (manualCount > 0) {
      els.manualNote.textContent = `Manual tab list active (${manualCount} tab${
        manualCount === 1 ? "" : "s"
      } selected).`;
    } else {
      els.manualNote.textContent =
        "Manual tab list active, but no tabs selected yet.";
    }
  } else {
    els.manualNote.textContent =
      "Manual tab list disabled (using tab range).";
  }
}

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;

  els.useListToggle.classList.toggle("on", useSelectedTabs);
  els.useListToggle.textContent = useSelectedTabs ? "ON" : "OFF";
  els.useListToggle.setAttribute(
    "aria-pressed",
    useSelectedTabs ? "true" : "false"
  );

  if (useSelectedTabs) {
    els.rangeSection.classList.add("section-disabled");
    els.tabStart.disabled = true;
    els.tabEnd.disabled = true;
    els.rangeNote.textContent = "Using manual tab list (tab range disabled).";
  } else {
    els.rangeSection.classList.remove("section-disabled");
    els.tabStart.disabled = false;
    els.tabEnd.disabled = false;
    els.rangeNote.textContent =
      "Using tab range (manual tab list disabled).";
  }

  updateManualNote();
}

function updateChooserButton() {
  if (selectingTabs) {
    els.chooseTabsBtn.textContent = "Choosing...";
    els.chooseTabsBtn.classList.add("btn-chooser-active");
    els.chooseTabsBtn.classList.remove("btn-chooser-idle");
  } else {
    els.chooseTabsBtn.textContent = "Choose";
    els.chooseTabsBtn.classList.remove("btn-chooser-active");
    els.chooseTabsBtn.classList.add("btn-chooser-idle");
  }
}

function setMode(mode) {
  currentMode = mode === "sequential" ? "sequential" : "random";
  const buttons = els.modeSwitch.querySelectorAll(".mode-option");
  buttons.forEach((btn) => {
    const isActive = btn.dataset.mode === currentMode;
    btn.classList.toggle("active", isActive);
  });
}

// ---------- variance events ----------

els.jitterToggle.addEventListener("click", () => {
  setJitter(!jitterOn);
});

els.jitterRange.addEventListener("input", () => {
  // Moving the slider:
  // 1) ensures jitter is ON
  // 2) updates the label/value
  // 3) disables custom range (mutually exclusive)
  if (!jitterOn) {
    setJitter(true);
  } else {
    updateJitterLabel();
  }

  if (rangeOn) {
    setRange(false);
  }
});

["input", "change"].forEach((ev) => {
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

// ---------- manual list + choosing ----------

els.useListToggle.addEventListener("click", () => {
  setUseSelectedTabs(!useSelectedTabs);
});

els.chooseTabsBtn.addEventListener("click", async () => {
  if (!selectingTabs) {
    setUseSelectedTabs(true);
    selectingTabs = true;
    updateChooserButton();
    await browser.runtime.sendMessage({ type: "START_SELECTION" });
  } else {
    selectingTabs = false;
    updateChooserButton();
    const res = await browser.runtime.sendMessage({
      type: "STOP_SELECTION",
    });
    manualCount =
      res && typeof res.count === "number" ? res.count : 0;
    updateManualNote();
  }
});

els.clearMarkersBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_ALL_MARKERS" });
  manualCount = 0;
  selectingTabs = false;
  updateChooserButton();
  updateManualNote();
});

// ---------- cleanup: close included tabs (last run) ----------

async function closeIncludedTabs() {
  try {
    const res = await browser.runtime.sendMessage({
      type: "CLOSE_LAST_RUN_TABS",
    });
    if (!res) return;

    if (res.running) {
      alert(
        "Stop the current run first, then click “Close included tabs” again."
      );
    } else if (!res.hadLastRun) {
      alert("There is no previous run to close tabs from.");
    } else {
      alert(
        `Closed ${res.closedCount} tab${
          res.closedCount === 1 ? "" : "s"
        } from the last run.`
      );
    }
  } catch (e) {
    console.error("Error closing last run tabs:", e);
  }
}

els.closeLastRunBtn.addEventListener("click", closeIncludedTabs);

// ---------- hotkeys overlay ----------

els.hotkeyHelpBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.add("visible");
});

els.hotkeyCloseBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.remove("visible");
});

// ---------- mode switch ----------

els.modeSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-option");
  if (!btn) return;
  const mode = btn.dataset.mode === "sequential" ? "sequential" : "random";
  setMode(mode);
});

// ---------- controls ----------

els.startBtn.addEventListener("click", async () => {
  const tabStart = parseInt(els.tabStart.value, 10);
  const tabEnd = parseInt(els.tabEnd.value, 10);
  const seconds = parseFloat(els.seconds.value);
  const totalMinutes = parseFloat(els.totalMinutes.value);

  if (
    [tabStart, tabEnd, seconds, totalMinutes].some(Number.isNaN) ||
    tabStart < 1 ||
    tabEnd < tabStart ||
    seconds <= 0 ||
    totalMinutes <= 0
  ) {
    alert(
      "Please enter valid values for tab range, seconds per tab, and total minutes."
    );
    return;
  }

  // If manual tab list is enabled, make sure there is actually a list.
  // First ask the background for the current selection; if that is empty,
  // try to rebuild it from green-dot markers in the tab titles.
  if (useSelectedTabs) {
    try {
      let res = await browser.runtime.sendMessage({
        type: "GET_SELECTED_TABS",
      });
      let tabs = (res && res.tabs) || [];

      if (!tabs.length) {
        res = await browser.runtime.sendMessage({
          type: "SYNC_SELECTED_FROM_MARKERS",
        });
        tabs = (res && res.tabs) || [];
      }

      manualCount = tabs.length;
      updateManualNote();

      if (!tabs.length) {
        alert(
          'Manual tab list is enabled, but no tabs are selected.\n\n' +
            'Click "Choose", select one or more tabs (they\'ll get a 🟢 in the title), ' +
            'then click "Choose" again to finish.'
        );
        return;
      }
    } catch (err) {
      console.error("Failed to resolve manual tab list:", err);
    }
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
    stopOnHuman: !!els.stopOnHuman.checked,
  });

  selectingTabs = false;
  updateChooserButton();

  await refreshState();
});

els.pauseResumeBtn.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!state || !state.running) return;
  await browser.runtime.sendMessage({
    type: state.paused ? "RESUME" : "PAUSE",
  });
  await refreshState();
});

els.stopBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "STOP" });
  await refreshState();
});

// ---------- keyboard shortcuts inside popup ----------

document.addEventListener(
  "keydown",
  async (e) => {
    const key = e.key;

    try {
      if (key === "Enter") {
        const state = await browser.runtime.sendMessage({
          type: "GET_STATE",
        });
        if (!state || !state.running) {
          els.startBtn.click();
        } else if (state.paused) {
          await browser.runtime.sendMessage({ type: "RESUME" });
          await refreshState();
        }
        return;
      }

      if (key === "ArrowRight" || key === "Right") {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_NEXT" });
        return;
      }

      if (key === "ArrowLeft" || key === "Left") {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_PREV" });
        return;
      }

      if (key === "c" || key === "C") {
        const state = await browser.runtime.sendMessage({
          type: "GET_STATE",
        });
        if (!state || !state.running) {
          e.preventDefault();
          els.closeLastRunBtn.click();
        }
      }
    } catch (err) {
      console.error("Popup key handler error:", err);
    }
  },
  { capture: true }
);

// ---------- init ----------

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
    if (lastParams.totalMinutes != null)
      els.totalMinutes.value = lastParams.totalMinutes;

    if (typeof lastParams.jitterPct === "number") {
      els.jitterRange.value = Math.round(
        Number(lastParams.jitterPct) * 100
      );
      updateJitterLabel();
    }

    if (lastParams.rangeMin != null)
      els.minRange.value = lastParams.rangeMin;
    if (lastParams.rangeMax != null)
      els.maxRange.value = lastParams.rangeMax;
    updateDualSlider();

    const savedRangeOn = !!lastParams.rangeEnabled;
    const savedJitterOn = !!lastParams.jitterEnabled && !savedRangeOn;
    setRange(savedRangeOn);
    setJitter(savedJitterOn);

    if (lastParams.mode) setMode(lastParams.mode);
    if (lastParams.stopOnHuman != null) {
      els.stopOnHuman.checked = !!lastParams.stopOnHuman;
    }
    if (lastParams.useSelectedTabs != null) {
      setUseSelectedTabs(!!lastParams.useSelectedTabs);
    }
  }

  const sel = await browser.runtime.sendMessage({ type: "GET_SELECTED_TABS" });
  const tabs = (sel && sel.tabs) || [];
  manualCount = tabs.length;
  updateManualNote();

  const selState = await browser.runtime.sendMessage({
    type: "GET_SELECTION_STATE",
  });
  selectingTabs = !!(selState && selState.selecting);
  if (selectingTabs) {
    setUseSelectedTabs(true);
  }
  updateChooserButton();
}

updateDualSlider();
updateJitterLabel();
setJitter(false);
setRange(false);
setUseSelectedTabs(false);
updateChooserButton();
setMode("random");
refreshState();
