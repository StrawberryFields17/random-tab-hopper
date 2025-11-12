const els = {
  tabStart: document.getElementById("tabStart"),
  tabEnd: document.getElementById("tabEnd"),
  seconds: document.getElementById("seconds"),
  jitterRange: document.getElementById("jitterRange"),
  jitterValue: document.getElementById("jitterValue"),
  delayMin: document.getElementById("delayMin"),
  delayMax: document.getElementById("delayMax"),
  totalMinutes: document.getElementById("totalMinutes"),
  modeBtn: document.getElementById("modeBtn"),
  stopOnHuman: document.getElementById("stopOnHuman"),
  startBtn: document.getElementById("startBtn"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status")
};

let currentMode = "random";
function reflectMode() {
  els.modeBtn.textContent = currentMode === "random" ? "Random" : "Sequential";
}

els.modeBtn.addEventListener("click", () => {
  currentMode = (currentMode === "random") ? "sequential" : "random";
  reflectMode();
});

els.jitterRange.addEventListener("input", () => {
  els.jitterValue.textContent = `${els.jitterRange.value}%`;
});

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
      els.jitterValue.textContent = `${pct}%`;
    }
    if (lastParams.useOverride != null) {
      // We don't need a separate checkbox; using non-empty min<max triggers override.
    }
    if (lastParams.delayMin != null) els.delayMin.value = lastParams.delayMin;
    if (lastParams.delayMax != null) els.delayMax.value = lastParams.delayMax;
    if (lastParams.mode === "random" || lastParams.mode === "sequential") {
      currentMode = lastParams.mode;
      reflectMode();
    }
    if (lastParams.stopOnHuman != null) els.stopOnHuman.checked = !!lastParams.stopOnHuman;
  } else {
    reflectMode();
    els.jitterValue.textContent = `${els.jitterRange.value}%`;
  }
}

els.startBtn.addEventListener("click", async () => {
  const tabStart = parseInt(els.tabStart.value, 10);
  const tabEnd = parseInt(els.tabEnd.value, 10);
  const seconds = parseFloat(els.seconds.value);
  const totalMinutes = parseFloat(els.totalMinutes.value);
  const jitterPct = Math.max(0, Math.min(100, parseFloat(els.jitterRange.value))) / 100;

  // Min/Max override detection
  let delayMin = parseFloat(els.delayMin.value);
  let delayMax = parseFloat(els.delayMax.value);
  const hasMin = !Number.isNaN(delayMin);
  const hasMax = !Number.isNaN(delayMax);
  const useOverride = hasMin && hasMax && delayMin > 0 && delayMax > delayMin;

  if ([tabStart, tabEnd, seconds, totalMinutes].some(Number.isNaN)) {
    alert("Please provide valid numbers for range, seconds, and total minutes.");
    return;
  }
  if (tabStart < 1 || tabEnd < tabStart) {
    alert("Invalid tab range.");
    return;
  }
  if (seconds <= 0 || totalMinutes <= 0) {
    alert("Seconds and Total minutes must be > 0.");
    return;
  }
  if (useOverride && delayMin <= 0) {
    alert("Min delay must be > 0.");
    return;
  }

  await browser.runtime.sendMessage({
    type: "START",
    tabStart, tabEnd,
    seconds, totalMinutes,
    jitterPct,
    useOverride,
    delayMin: useOverride ? delayMin : undefined,
    delayMax: useOverride ? delayMax : undefined,
    mode: currentMode,
    stopOnHuman: !!els.stopOnHuman.checked
  });

  await refreshState();
});

els.pauseResumeBtn.addEventListener("click", async () => {
  const { running, paused } = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!running) return;
  await browser.runtime.sendMessage({ type: paused ? "RESUME" : "PAUSE" });
  await refreshState();
});

els.stopBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "STOP" });
  await refreshState();
});

refreshState();
