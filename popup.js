const els = {
  tabStart: document.getElementById("tabStart"),
  tabEnd: document.getElementById("tabEnd"),
  seconds: document.getElementById("seconds"),
  jitterRange: document.getElementById("jitterRange"),
  jitterValue: document.getElementById("jitterValue"),
  useMinMaxBtn: document.getElementById("useMinMaxBtn"),
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
  status: document.getElementById("status"),
};

let currentMode = "random";
let useMinMax = false; // OFF by default

function reflectMode(){ els.modeBtn.textContent = (currentMode === "random" ? "Random" : "Sequential"); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function setUseMinMax(on){
  useMinMax = !!on;
  els.useMinMaxBtn.classList.toggle("on", useMinMax);
  els.useMinMaxBtn.textContent = useMinMax ? "ON" : "OFF";
  [els.minRange, els.maxRange].forEach(r => r.classList.toggle("disabled", !useMinMax));
}

els.useMinMaxBtn.addEventListener("click", ()=> setUseMinMax(!useMinMax));

els.jitterRange.addEventListener("input", ()=>{
  els.jitterValue.textContent = `${els.jitterRange.value}%`;
});

function updateDualSlider(from){
  const minR = els.minRange, maxR = els.maxRange;
  const minStep = parseFloat(minR.step) || 0.5;

  // keep min <= max - step
  if (from === "min" && parseFloat(minR.value) > parseFloat(maxR.value) - minStep){
    minR.value = (parseFloat(maxR.value) - minStep).toFixed(1);
  }
  if (from === "max" && parseFloat(maxR.value) < parseFloat(minR.value) + minStep){
    maxR.value = (parseFloat(minR.value) + minStep).toFixed(1);
  }

  const min = parseFloat(minR.value);
  const max = parseFloat(maxR.value);
  const lo = parseFloat(minR.min), hi = parseFloat(minR.max);
  const leftPct  = ((min - lo) / (hi - lo)) * 100;
  const rightPct = 100 - ((max - lo) / (hi - lo)) * 100;

  els.trackFill.style.left = `${leftPct}%`;
  els.trackFill.style.right = `${rightPct}%`;
  els.minLabel.textContent = `${min.toFixed(1)}s`;
  els.maxLabel.textContent = `${max.toFixed(1)}s`;
}
["input","change"].forEach(ev=>{
  els.minRange.addEventListener(ev, ()=> updateDualSlider("min"));
  els.maxRange.addEventListener(ev, ()=> updateDualSlider("max"));
});
updateDualSlider();        // init visuals
setUseMinMax(false);       // default OFF
reflectMode();

async function refreshState(){
  const { running, paused, lastParams } = await browser.runtime.sendMessage({ type:"GET_STATE" });

  if (running){
    els.status.textContent = paused ? "Paused" : "Running…";
    els.status.className = `status ${paused ? "paused":"running"}`;
    els.pauseResumeBtn.textContent = paused ? "Resume" : "Pause";
  } else {
    els.status.textContent = "Stopped";
    els.status.className = "status stopped";
    els.pauseResumeBtn.textContent = "Pause";
  }

  if (lastParams){
    if (lastParams.tabStart != null) els.tabStart.value = lastParams.tabStart;
    if (lastParams.tabEnd != null) els.tabEnd.value = lastParams.tabEnd;
    if (lastParams.seconds != null) els.seconds.value = lastParams.seconds;
    if (lastParams.totalMinutes != null) els.totalMinutes.value = lastParams.totalMinutes;

    if (lastParams.jitterPct != null){
      const pct = Math.round(Number(lastParams.jitterPct) * 100);
      els.jitterRange.value = pct; els.jitterValue.textContent = `${pct}%`;
    }

    if (lastParams.delayMin != null) els.minRange.value = lastParams.delayMin;
    if (lastParams.delayMax != null) els.maxRange.value = lastParams.delayMax;
    updateDualSlider();

    setUseMinMax(!!lastParams.useOverride);
    if (lastParams.mode) { currentMode = lastParams.mode; reflectMode(); }
    if (lastParams.stopOnHuman != null) els.stopOnHuman.checked = !!lastParams.stopOnHuman;
  }
}
refreshState();

els.modeBtn.addEventListener("click", ()=>{
  currentMode = (currentMode === "random") ? "sequential" : "random";
  reflectMode();
});

els.startBtn.addEventListener("click", async ()=>{
  const tabStart = parseInt(els.tabStart.value, 10);
  const tabEnd = parseInt(els.tabEnd.value, 10);
  const seconds = parseFloat(els.seconds.value);
  const totalMinutes = parseFloat(els.totalMinutes.value);
  const jitterPct = clamp(parseFloat(els.jitterRange.value)/100, 0, 1);
  const delayMin = parseFloat(els.minRange.value);
  const delayMax = parseFloat(els.maxRange.value);

  if ([tabStart,tabEnd,seconds,totalMinutes].some(Number.isNaN) || tabStart<1 || tabEnd<tabStart || seconds<=0 || totalMinutes<=0){
    alert("Please enter valid numbers: range (≥1), seconds per tab (>0), total minutes (>0).");
    return;
  }

  await browser.runtime.sendMessage({
    type:"START",
    tabStart, tabEnd,
    seconds, totalMinutes,
    jitterPct,
    useOverride: !!useMinMax,
    delayMin, delayMax,
    mode: currentMode,
    stopOnHuman: !!els.stopOnHuman.checked
  });

  await refreshState();
});

els.pauseResumeBtn.addEventListener("click", async ()=>{
  const { running, paused } = await browser.runtime.sendMessage({ type:"GET_STATE" });
  if (!running) return;
  await browser.runtime.sendMessage({ type: paused ? "RESUME":"PAUSE" });
  await refreshState();
});

els.stopBtn.addEventListener("click", async ()=>{
  await browser.runtime.sendMessage({ type:"STOP" });
  await refreshState();
});
