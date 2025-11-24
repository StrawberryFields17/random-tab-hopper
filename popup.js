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

// state
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

  // mutual exclusivity with custom range
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

  // mutual exclusivity with jitter
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

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;
  els.useListToggle.classList.toggle("on", useSelectedTabs);
  els.useListToggle.textContent = useSelectedTabs ? "ON" : "OFF";
  els.useListToggle.setAttribute("aria-pressed", useSelectedTabs ? "true" : "false");

  if (useSelectedTabs) {
    els.rangeSection.classList.add("section-disabled");
    els.rangeNote.textContent = "Using manual tab list.";
    els.manualNote.textContent = `Manual tab list active (${manualCount} tab${
      manualCount === 1 ? "" : "s"
    } selected).`;
  } else {
    els.rangeSection.classList.remove("section-disabled");
    els.rangeNote.textContent = "Using tab range (manual tab list disabled).";
    els.manualNote.textContent = "Manual tab list disabled (using tab range).";
  }
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

async function closeIncludedTabs() {
  try {
    const res = await browser.runtime.sendMessage({
      type: "CLOSE_LAST_RUN_TABS",
    });
    if (!res) return;

    if (res.running) {
      alert(
        "Tabs were not closed because the hopper is currently running. Stop it first, then try again."
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

  // manual selection count
  const res = await browser.runtime.sendMessage({
    type: "GET_SELECTED_TABS",
  });
  const tabs = (res && res.tabs) || [];
  manualCount = tabs.length;

  if (useSelectedTabs) {
    els.manualNote.textContent = `Manual tab list active (${manualCount} tab${
      manualCount === 1 ? "" : "s"
    } selected).`;
  }
}

// ---------- variance events ----------

els.jitterToggle.addEventListener("click", () => {
  // Explicit toggle when the ON/OFF button is clicked
  setJitter(!jitterOn);
});

els.jitterRange.addEventListener("input", () => {
  // When the user moves the slider, make sure:
  // 1) the jitter mode is ON,
  // 2) the label/text are updated,
  // 3) the custom range mode is turned OFF (they are mutually exclusive).
  if (!jitterOn) {
    setJitter(true);
  } else {
    updateJitterLabel();
  }

  // Just in case, make sure custom range is disabled when tweaking the %
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

// ---------- manual list / chooser ----------

els.useListToggle.addEventListener("click", () => {
  setUseSelectedTabs(!useSelectedTabs);
});

els.chooseTabsBtn.addEventListener("click", async () => {
  selectingTabs = !selectingTabs;
  updateChooserButton();

  if (selectingTabs) {
    setUseSelectedTabs(true);

    // tell background we've started manual choosing
    await browser.runtime.sendMessage({
      type: "BEGIN_MANUAL_SELECT",
    });
  } else {
    await browser.runtime.sendMessage({
      type: "END_MANUAL_SELECT",
    });
    await refreshState();
  }
});

els.clearMarkersBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_MARKERS_AND_LIST" });
  selectingTabs = false;
  manualCount = 0;
  updateChooserButton();
  setUseSelectedTabs(false);
  await refreshState();
});

els.closeLastRunBtn.addEventListener("click", () => {
  closeIncludedTabs();
});

// ---------- mode switch ----------

els.modeSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-option");
  if (!btn) return;
  const mode = btn.dataset.mode === "sequential" ? "sequential" : "random";
  setMode(mode);
});

// ---------- hotkey overlay ----------

els.hotkeyHelpBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.add("visible");
});

els.hotkeyCloseBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.remove("visible");
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

  const jitterPct = (parseInt(els.jitterRange.value, 10) || 0) / 100.0;
  const rangeMin = parseFloat(els.minRange.value);
  const rangeMax = parseFloat(els.maxRange.value);

  await browser.runtime.sendMessage({
    type: "START",
    tabStart,
    tabEnd,
    seconds,
    totalMinutes,
    jitterEnabled: jitterOn && !rangeOn,
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

// ---------- global keyboard shortcuts inside popup -----

document.addEventListener(
  "keydown",
  async (e) => {
    const tag = (e.target && e.target.tagName) || "";
    const isInput =
      tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;

    // We still want Enter in number fields to start/resume
    const allowEnter = e.key === "Enter";

    if (isInput && !allowEnter) {
      return;
    }

    const state = await browser.runtime.sendMessage({ type: "GET_STATE" });

    switch (e.key) {
      case "Enter": {
        // Enter inside popup:
        // - if stopped → Start
        // - if paused → Resume
        // - if running → do nothing
        if (!state || !state.running) {
          // stopped
          els.startBtn.click();
        } else if (state.paused) {
          els.pauseResumeBtn.click();
        }
        break;
      }

      case "ArrowRight": {
        // jump to next included tab (while running)
        if (state && state.running) {
          await browser.runtime.sendMessage({ type: "JUMP_NEXT" });
        }
        break;
      }

      case "ArrowLeft": {
        // jump to previous included tab (while running)
        if (state && state.running) {
          await browser.runtime.sendMessage({ type: "JUMP_PREV" });
        }
        break;
      }

      case "c":
      case "C": {
        // Close included tabs of last run (when not running)
        if (!state || !state.running) {
          els.closeLastRunBtn.click();
        }
        break;
      }

      default:
        break;
    }
  },
  { capture: true } // ensure popup sees keys even when inputs have focus
);

// ---------- init ----------

updateDualSlider();
updateJitterLabel();
setJitter(false);
setRange(false);
setUseSelectedTabs(false);
updateChooserButton();
setMode("random");
refreshState();
