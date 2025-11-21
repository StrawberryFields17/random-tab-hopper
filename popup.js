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

  minRange: document.getElementById("minRange"),
  maxRange: document.getElementById("maxRange"),
  rangeSlider: document.getElementById("rangeSlider"),

  totalMinutes: document.getElementById("totalMinutes"),
  stopOnHuman: document.getElementById("stopOnHuman"),

  startBtn: document.getElementById("startBtn"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status"),

  modeRandom: document.getElementById("modeRandom"),
  modeSequential: document.getElementById("modeSequential"),

  useSelectedTabsToggle: document.getElementById("useSelectedTabsToggle"),
  chooseTabsBtn: document.getElementById("chooseTabsBtn"),

  clearMarkersBtn: document.getElementById("clearMarkersBtn"),

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
  const pct = Math.round(
    (parseInt(els.jitterRange.value, 10) || 0) * 1.0
  );
  els.jitterValue.textContent = `${pct}%`;
}

function setJitter(on) {
  jitterOn = !!on;
  els.jitterToggle.checked = jitterOn;
  els.jitterRange.disabled = !jitterOn;
  els.jitterLabel.classList.toggle("active", jitterOn);
}

function setRange(on) {
  rangeOn = !!on;
  els.minRange.disabled = !rangeOn;
  els.maxRange.disabled = !rangeOn;
  els.rangeSlider.classList.toggle("disabled", !rangeOn);
}

function updateDualSlider() {
  const min = parseFloat(els.minRange.value);
  const max = parseFloat(els.maxRange.value);

  els.rangeSlider.min = 0;
  els.rangeSlider.max = 100;
  els.rangeSlider.valueLow = min;
  els.rangeSlider.valueHigh = max;
}

function setMode(mode) {
  currentMode = mode === "sequential" ? "sequential" : "random";

  els.modeRandom.classList.toggle("active", currentMode === "random");
  els.modeSequential.classList.toggle("active", currentMode === "sequential");
}

function setUseSelectedTabs(on) {
  useSelectedTabs = !!on;
  els.useSelectedTabsToggle.checked = useSelectedTabs;

  els.rangeSection.style.display = useSelectedTabs ? "none" : "block";
  els.manualSection.style.display = useSelectedTabs ? "block" : "none";
}

function updateManualNote() {
  if (!useSelectedTabs) {
    els.manualNote.textContent = "";
    return;
  }

  if (manualCount === 0) {
    els.manualNote.textContent =
      "No tabs selected yet. Use “Choose tabs…” to pick tabs.";
  } else {
    els.manualNote.textContent =
      manualCount === 1
        ? "1 tab currently selected."
        : `${manualCount} tabs currently selected.`;
  }
}

function updateChooserButton() {
  if (!useSelectedTabs) {
    els.chooseTabsBtn.textContent = "Choose tabs…";
    els.chooseTabsBtn.disabled = true;
    return;
  }

  els.chooseTabsBtn.disabled = false;
  els.chooseTabsBtn.textContent = selectingTabs
    ? "Stop choosing"
    : "Choose tabs…";
}

// ---------- hotkey help panel ----------

els.hotkeyHelpBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.add("open");
});

els.hotkeyCloseBtn.addEventListener("click", () => {
  els.hotkeyPanel.classList.remove("open");
});

// ---------- refresh from background ----------

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

    if (lastParams.jitterPct != null) {
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

    if (lastParams.mode === "sequential") {
      setMode("sequential");
    } else {
      setMode("random");
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
  updateManualNote();

  // choosing state
  const selState = await browser.runtime.sendMessage({
    type: "GET_SELECTION_STATE",
  });
  selectingTabs = !!(selState && selState.selecting);

  if (selectingTabs) {
    setUseSelectedTabs(true);
  }
  updateChooserButton();
}

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

els.modeRandom.addEventListener("click", () => setMode("random"));
els.modeSequential.addEventListener("click", () => setMode("sequential"));

els.jitterToggle.addEventListener("change", () => {
  setJitter(els.jitterToggle.checked);
});

els.jitterRange.addEventListener("input", () => {
  updateJitterLabel();
});

els.rangeSlider.addEventListener("input", (e) => {
  const { valueLow, valueHigh } = e.target;
  els.minRange.value = valueLow;
  els.maxRange.value = valueHigh;
});

els.minRange.addEventListener("change", updateDualSlider);
els.maxRange.addEventListener("change", updateDualSlider);

els.useSelectedTabsToggle.addEventListener("change", () => {
  setUseSelectedTabs(els.useSelectedTabsToggle.checked);
  updateChooserButton();
});

els.chooseTabsBtn.addEventListener("click", async () => {
  if (!useSelectedTabs) return;

  if (!selectingTabs) {
    await browser.runtime.sendMessage({ type: "START_SELECTION" });
    selectingTabs = true;
  } else {
    await browser.runtime.sendMessage({ type: "STOP_SELECTION" });
    selectingTabs = false;
  }
  updateChooserButton();
  await refreshState();
});

els.clearMarkersBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "CLEAR_ALL_MARKERS" });
  await refreshState();
});

// ---------- global keyboard shortcuts inside popup ----------

document.addEventListener(
  "keydown",
  async (e) => {
    const key = e.key;
    const code = e.code;
    const kc = e.keyCode || e.which;

    const isRight =
      key === "ArrowRight" ||
      code === "ArrowRight" ||
      kc === 39 ||
      key === "Right" ||
      code === "Right";

    const isLeft =
      key === "ArrowLeft" ||
      code === "ArrowLeft" ||
      kc === 37 ||
      key === "Left" ||
      code === "Left";

    try {
      // Enter: start when stopped, resume when paused
      if (key === "Enter") {
        const state = await browser.runtime.sendMessage({
          type: "GET_STATE",
        });
        if (!state || !state.running) {
          // same as clicking Start
          els.startBtn.click();
        } else if (state.paused) {
          // resume current run
          await browser.runtime.sendMessage({ type: "HOTKEY_RESUME" });
          await refreshState();
        }
        return;
      }

      // P = pause run (only makes sense when running)
      if (key === "p" || key === "P") {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_PAUSE" });
        await refreshState();
        return;
      }

      // S = stop run
      if (key === "s" || key === "S") {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_STOP" });
        await refreshState();
        return;
      }

      // Arrow keys in popup: same HOTKEY_NEXT/PREV as on page
      if (isRight) {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_NEXT" });
        return;
      }

      if (isLeft) {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "HOTKEY_PREV" });
        return;
      }

      // C = "Close included tabs" from last run
      if (key === "c" || key === "C") {
        e.preventDefault();
        await browser.runtime.sendMessage({ type: "CLOSE_LAST_RUN_TABS" });
        return;
      }
    } catch (err) {
      console.error("Popup key handler error:", err);
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
