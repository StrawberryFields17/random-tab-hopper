const els = {
  tabStart: document.getElementById("tabStart"),
  tabEnd: document.getElementById("tabEnd"),
  seconds: document.getElementById("seconds"),
  jitterRange: document.getElementById("jitterRange"),
  jitterValue: document.getElementById("jitterValue"),
  useMinMaxBtn: document.getElementById("useMinMaxBtn"),
  delayMinRange: document.getElementById("delayMinRange"),
  delayMaxRange: document.getElementById("delayMaxRange"),
  totalMinutes: document.getElementById("totalMinutes"),
  modeBtn: document.getElementById("modeBtn"),
  stopOnHuman: document.getElementById("stopOnHuman"),
  startBtn: document.getElementById("startBtn"),
  pauseResumeBtn: document.getElementById("pauseResumeBtn"),
  stopBtn: document.getElementById("stopBtn"),
  status: document.getElementById("status"),
};

let currentMode = "random";
let useMinMax = false;

function reflectMode() {
  els.modeBtn.textContent = currentMode === "random" ? "Random" : "Sequential";
}

function reflectUseMinMax() {
  if (useMinMax) {
    els.useMinMaxBtn.classList.add("toggle-on");
    els.useMinMaxBtn.textContent = "ON";
  } else {
    els.useMinMaxBtn.classList.remove("toggle-on");
    els.useMinMaxBtn.textContent = "OFF";
  }
}

els.modeBtn.addEventListener("click", () => {
  currentMode = currentMode === "random" ? "sequential" : "random";
  reflectMode();
});

els.useMinMaxBtn.addEventListener("click", () => {
  useMinMax = !useMinMax;
  reflectUseMinMax();
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
    if (lastParams.delayMin != null) els.delayMinRange.value = lastParams.delayMin;
    if (lastParams.delayMax != null) els.delayMaxRange.value = lastParams.delayMax;
    if (lastParams.mode) { currentMode = lastParams.mode; reflectMode(); }
    useMinMax = !!lastParams.useOverride;
    reflectUseMinMax();
    els.stopOnHuman.checked = !!lastParams.stopOnHuman;
  } else {
    reflectMode();
    reflectUseMinMax();
  }
}

els.startBtn.addEventListener("click", async () => {
  const tabStart = parseInt(els.tabStart.value, 10);
  const tabEnd = parseInt(els.tabEnd.value, 10);
  const seconds = parseFloat(els.seconds.value);
  const totalMinutes = parseFloat(els.totalMinutes.value);
  const jitterPct = Math.max(0, Math.min(100, parseFloat(els.jitterRange.value))) / 100;
  const delayMin = parseFloat(els.delayMinRange.value);
  const delayMax = parseFloat(els.delayMaxRange.value);

  await browser.runtime.sendMessage({
    type: "START",
    tabStart,
    tabEnd,
    seconds,
    totalMinutes,
    jitterPct,
    useOverride: useMinMax,
    delayMin,
    delayMax,
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
