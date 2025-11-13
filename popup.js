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

  // visual dimming
  els.jitterRange.classList.toggle("slider-disabled", !jitterOn);

  // keep modes mutually exclusive
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

  // actually enable/disable inputs
  [els.minRange, els.maxRange].forEach(r => {
    r.disabled = !rangeOn;
    r.classList.toggle("disabled", !rangeOn);
  });

  // keep modes mutually exclusive
  if (rangeOn && jitterOn) {
    setJitter(false);
  }
}

// auto-enable jitter when moving its slider
els.jitterRange.addEventListener("input", () => {
  if (!jitterOn) {
    setJitter(true);
  }
  updateJitterLabel();
});

els.jitterToggle.addEventListener("click", () => setJitter(!jitterOn));

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

// auto-enable range when moving either handle
["input", "change"].forEach(ev => {
  els.minRange.addEventListener(ev, () => {
    if (!rangeOn) {
      setRange(true);
    }
    updateDualSlider("min");
  });
  els.maxRange.addEventListener(ev, () => {
    if (!rangeOn) {
      setRange(true);
    }
    updateDualSlider("max");
  });
});

// Initial visuals
updateDualSlider();
updateJitterLabel();
setJitter(false);
setRange(false);
reflectMode();

async function refreshState() {
  const { running, paused, lastParams } = await browser.runtime.sendMessage({ type: "GET_STATE" });

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

    // restore modes (still mutually exclusive)
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
  }
}

els.modeBtn.addEventListener("click", () => {
  currentMode = (currentMode === "random") ? "sequential" : "random";
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
    mode: currentMode,
    stopOnHuman: !!els.stopOnHuman.checked
  });

  await refreshState();
});

els.pauseResumeBtn.addEventListener("click", async () => {
  const { running, paused } = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!running) return;
  await browser.runtime.sendMessage({ type: "RESUME" });
  if (paused) {
    await browser.runtime.sendMessage({ type: "RESUME" });
  } else {
    await browser.runtime.sendMessage({ type: "PAUSE" });
  }
  await refreshState();
});

els.stopBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "STOP" });
  await refreshState();
});

refreshState();
