const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.getElementById("score"),
  altitude: document.getElementById("altitude"),
  tapRate: document.getElementById("tap-rate"),
  neededRate: document.getElementById("needed-rate"),
  scoreboard: document.getElementById("scoreboard"),
  finalScore: document.getElementById("final-score"),
  finalPeak: document.getElementById("final-peak"),
  nicknameInput: document.getElementById("nickname-input"),
  scoreboardStatus: document.getElementById("scoreboard-status"),
  dailyBoard: document.getElementById("daily-board"),
  weeklyBoard: document.getElementById("weekly-board"),
  submitScore: document.getElementById("submit-score"),
  scoreboardRestart: document.getElementById("scoreboard-restart"),
  introScreen: document.getElementById("intro-screen"),
  panel: document.getElementById("status-panel"),
  title: document.getElementById("state-title"),
  message: document.getElementById("state-message"),
  restart: document.getElementById("restart"),
};

const SUPABASE_URL = "https://wbsqolqkqbdveurmkqhx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indic3FvbHFrcWJkdmV1cm1rcWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjE2NjcsImV4cCI6MjA5NjIzNzY2N30.NVG7GFlw0WOq0uJcoFYE8Rl8DOEd0Wwt6fC8jny0W1U";
const SCORE_FUNCTION_URL = "https://wbsqolqkqbdveurmkqhx.functions.supabase.co/submit-score";

const RULES = {
  ascendTapRate: 5,
  maxAscendTapRate: 9,
  pressureBaseGainPerSecond: 0.08,
  pressureAltitudeGainPerSecond: 0.22,
  pressureOvertapGainPerTap: 0.05,
  pressureDecayPerSecond: 0.75,
  pressureFallDecayPerSecond: 1.8,
  scoreMinTapRate: 10,
  descendMinTapRate: 1,
  tapWindowMs: 1000,
  fallAfterMs: 750,
  startingAltitude: 18,
  maxAltitude: 120,
  baseClimbPerSecond: 24,
  extraClimbPerTap: 7,
  slowDescentPerSecond: 18,
  fallPerSecond: 70,
  scoreHeightMultiplier: 0.12,
};

const CLOUDS = [
  { x: 0.14, y: 0.18, scale: 0.9, drift: 0.82 },
  { x: 0.72, y: 0.12, scale: 1.18, drift: 1.08 },
  { x: 0.42, y: 0.33, scale: 0.72, drift: 0.92 },
  { x: 0.82, y: 0.48, scale: 0.96, drift: 1.16 },
  { x: 0.22, y: 0.65, scale: 1.28, drift: 1.0 },
  { x: 0.58, y: 0.81, scale: 0.78, drift: 1.22 },
];

const DUCK_SOURCE = {
  anchorX: 650,
  anchorY: 620,
};

const DUCK_ASSETS = {
  body: {
    src: "assets/duck-body.png",
    x: 235,
    y: 168,
    width: 936,
    height: 874,
  },
  backWing: {
    src: "assets/duck-wing-back.png",
    x: 176,
    y: 169,
    width: 515,
    height: 590,
    pivotX: 625,
    pivotY: 585,
  },
  frontWing: {
    src: "assets/duck-wing-front.png",
    x: 407,
    y: 237,
    width: 362,
    height: 507,
    pivotX: 675,
    pivotY: 595,
  },
};

const state = {
  mode: "ready",
  altitude: RULES.startingAltitude,
  score: 0,
  bestHeight: RULES.startingAltitude,
  taps: [],
  lastTapAt: 0,
  tapRate: 0,
  requiredAscendTapRate: RULES.ascendTapRate,
  difficultyPressure: 0,
  verticalVelocity: 0,
  flapClock: 0,
  flapPower: 0,
  flightClock: 0,
  skyOffset: 0,
};

const scoreboard = {
  deviceId: "",
  nickname: "",
  dailyPeriodKey: "",
  weeklyPeriodKey: "",
  todayBest: 0,
  weekBest: 0,
  dailyTop: [],
  weeklyTop: [],
  pendingScore: 0,
  pendingPeakAltitude: 0,
  hasSubmittedCurrentScore: false,
  status: "Scoreboard offline",
};

const STORAGE_KEYS = {
  deviceId: "duckFlap.deviceId",
  nickname: "duckFlap.nickname",
  bestPrefix: "duckFlap.best",
};

let lastFrame = performance.now();
let view = { width: 720, height: 1080, dpr: 1 };
let introActive = true;

function initDuckAssets() {
  for (const layer of Object.values(DUCK_ASSETS)) {
    const image = new Image();
    layer.image = image;
    layer.ready = false;
    image.onload = () => {
      layer.ready = true;
    };
    image.src = layer.src;
  }
}

function areDuckAssetsReady() {
  return Object.values(DUCK_ASSETS).every((layer) => layer.ready);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getBaseAscendTapRate(altitude) {
  const altitudeRange = Math.max(1, RULES.maxAltitude - RULES.startingAltitude);
  const altitudeRatio = clamp(
    (altitude - RULES.startingAltitude) / altitudeRange,
    0,
    1
  );
  return clamp(
    RULES.ascendTapRate +
      altitudeRatio * (RULES.maxAscendTapRate - RULES.ascendTapRate),
    RULES.ascendTapRate,
    RULES.maxAscendTapRate
  );
}

function getRequiredAscendTapRate(altitude, pressure = state.difficultyPressure) {
  return Math.max(
    RULES.ascendTapRate,
    getBaseAscendTapRate(altitude) + Math.max(0, pressure)
  );
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SCORE_FUNCTION_URL);
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The game can still run if storage is unavailable.
  }
}

function createDeviceId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `duck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeNickname(value, fallback) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return cleaned || fallback;
}

function defaultNickname(deviceId) {
  return `Duck ${deviceId.slice(-4).toUpperCase()}`;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalMondayKey(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return getLocalDateKey(monday);
}

function bestStorageKey(periodType, periodKey) {
  return `${STORAGE_KEYS.bestPrefix}.${periodType}.${periodKey}.${scoreboard.deviceId}`;
}

function loadLocalBest(periodType, periodKey) {
  return Number(storageGet(bestStorageKey(periodType, periodKey)) || 0);
}

function saveLocalBest(periodType, periodKey, score) {
  storageSet(bestStorageKey(periodType, periodKey), String(score));
}

function updatePeriodKeys() {
  scoreboard.dailyPeriodKey = getLocalDateKey();
  scoreboard.weeklyPeriodKey = getLocalMondayKey();
}

function ensurePlayerIdentity() {
  let deviceId = storageGet(STORAGE_KEYS.deviceId);
  if (!deviceId) {
    deviceId = createDeviceId();
    storageSet(STORAGE_KEYS.deviceId, deviceId);
  }

  scoreboard.deviceId = deviceId;

  let nickname = storageGet(STORAGE_KEYS.nickname);
  if (!nickname) {
    nickname = defaultNickname(deviceId);
    storageSet(STORAGE_KEYS.nickname, nickname);
  }

  scoreboard.nickname = sanitizeNickname(nickname, defaultNickname(deviceId));
}

function saveNicknameFromInput() {
  const nickname = sanitizeNickname(ui.nicknameInput.value, scoreboard.nickname);
  scoreboard.nickname = nickname;
  storageSet(STORAGE_KEYS.nickname, nickname);
  updateScoreboardUI();
}

function setScoreboardStatus(message) {
  scoreboard.status = message;
  ui.scoreboardStatus.textContent = message;
}

function updatePersonalBests() {
  scoreboard.todayBest = loadLocalBest("daily", scoreboard.dailyPeriodKey);
  scoreboard.weekBest = loadLocalBest("weekly", scoreboard.weeklyPeriodKey);
}

function renderBoard(list, rows) {
  list.innerHTML = "";
  const entries = rows.slice(0, 3);

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.textContent = "No scores yet";
    list.appendChild(empty);
    return;
  }

  for (const row of entries) {
    const item = document.createElement("li");
    item.textContent = `${row.nickname || "Duck"} ${Number(row.score) || 0}`;
    list.appendChild(item);
  }
}

function updateScoreboardUI() {
  ui.finalScore.textContent = scoreboard.pendingScore.toString();
  ui.finalPeak.textContent = scoreboard.pendingPeakAltitude.toString();
  if (document.activeElement !== ui.nicknameInput) {
    ui.nicknameInput.value = scoreboard.nickname;
  }
  ui.scoreboardStatus.textContent = scoreboard.status;
  ui.submitScore.disabled = scoreboard.hasSubmittedCurrentScore;
  renderBoard(ui.dailyBoard, scoreboard.dailyTop);
  renderBoard(ui.weeklyBoard, scoreboard.weeklyTop);
}

async function fetchLeaderboard(periodType, periodKey) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/leaderboard_scores`);
  url.searchParams.set("select", "nickname,score,peak_altitude,played_at");
  url.searchParams.set("period_type", `eq.${periodType}`);
  url.searchParams.set("period_key", `eq.${periodKey}`);
  url.searchParams.set("order", "score.desc,played_at.asc");
  url.searchParams.set("limit", "3");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Leaderboard read failed: ${response.status}`);
  }

  return response.json();
}

async function refreshOnlineScoreboard() {
  updatePeriodKeys();
  updatePersonalBests();

  if (!isSupabaseConfigured()) {
    setScoreboardStatus("Scoreboard offline");
    updateScoreboardUI();
    return;
  }

  try {
    setScoreboardStatus("Loading scores");
    const [dailyTop, weeklyTop] = await Promise.all([
      fetchLeaderboard("daily", scoreboard.dailyPeriodKey),
      fetchLeaderboard("weekly", scoreboard.weeklyPeriodKey),
    ]);
    scoreboard.dailyTop = dailyTop;
    scoreboard.weeklyTop = weeklyTop;
    setScoreboardStatus("Online scoreboard");
  } catch {
    setScoreboardStatus("Scoreboard offline");
  }

  updateScoreboardUI();
}

async function submitScore(score, peakAltitude) {
  saveNicknameFromInput();
  updatePeriodKeys();

  const dailyBest = loadLocalBest("daily", scoreboard.dailyPeriodKey);
  const weeklyBest = loadLocalBest("weekly", scoreboard.weeklyPeriodKey);
  const improvedDaily = score > dailyBest;
  const improvedWeekly = score > weeklyBest;

  if (improvedDaily) {
    saveLocalBest("daily", scoreboard.dailyPeriodKey, score);
  }

  if (improvedWeekly) {
    saveLocalBest("weekly", scoreboard.weeklyPeriodKey, score);
  }

  updatePersonalBests();
  updateScoreboardUI();

  if (!isSupabaseConfigured()) {
    setScoreboardStatus(improvedDaily || improvedWeekly ? "Saved on device" : "Scoreboard offline");
    scoreboard.hasSubmittedCurrentScore = true;
    updateScoreboardUI();
    return;
  }

  if (!improvedDaily && !improvedWeekly) {
    setScoreboardStatus("Score did not beat your best");
    scoreboard.hasSubmittedCurrentScore = true;
    updateScoreboardUI();
    return;
  }

  try {
    setScoreboardStatus("Uploading score");
    updateScoreboardUI();

    const response = await fetch(SCORE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        score,
        peakAltitude,
        deviceId: scoreboard.deviceId,
        nickname: scoreboard.nickname,
        dailyPeriodKey: scoreboard.dailyPeriodKey,
        weeklyPeriodKey: scoreboard.weeklyPeriodKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`Score upload failed: ${response.status}`);
    }

    const result = await response.json();
    scoreboard.dailyTop = result.dailyTop || [];
    scoreboard.weeklyTop = result.weeklyTop || [];
    scoreboard.todayBest = Number(result.personalBests?.daily ?? scoreboard.todayBest);
    scoreboard.weekBest = Number(result.personalBests?.weekly ?? scoreboard.weekBest);
    scoreboard.hasSubmittedCurrentScore = true;
    setScoreboardStatus("Score uploaded");
  } catch {
    setScoreboardStatus("Upload failed; saved on device");
    await refreshOnlineScoreboard();
    scoreboard.hasSubmittedCurrentScore = true;
  }

  updateScoreboardUI();
}

function initScoreboard() {
  ensurePlayerIdentity();
  updatePeriodKeys();
  updatePersonalBests();
  updateScoreboardUI();
}

function showScoreboard(finalScore, peakAltitude) {
  scoreboard.pendingScore = finalScore;
  scoreboard.pendingPeakAltitude = peakAltitude;
  scoreboard.hasSubmittedCurrentScore = false;
  scoreboard.nickname = sanitizeNickname(
    storageGet(STORAGE_KEYS.nickname),
    defaultNickname(scoreboard.deviceId)
  );
  setScoreboardStatus(isSupabaseConfigured() ? "Ready to submit" : "Scoreboard offline");
  ui.scoreboard.classList.remove("is-hidden");
  updateScoreboardUI();
  void refreshOnlineScoreboard();
}

function hideScoreboard() {
  ui.scoreboard.classList.add("is-hidden");
}

function hideIntro() {
  introActive = false;
  ui.introScreen.classList.add("is-hidden");
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  view = {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    dpr,
  };
  canvas.width = Math.round(view.width * dpr);
  canvas.height = Math.round(view.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetGame(startNow = false) {
  state.mode = startNow ? "playing" : "ready";
  state.altitude = RULES.startingAltitude;
  state.score = 0;
  state.bestHeight = RULES.startingAltitude;
  state.taps = [];
  state.lastTapAt = 0;
  state.tapRate = 0;
  state.difficultyPressure = 0;
  state.requiredAscendTapRate = getRequiredAscendTapRate(state.altitude);
  state.verticalVelocity = 0;
  state.flapClock = 0;
  state.flapPower = 0;
  state.flightClock = 0;
  state.skyOffset = 0;
  hideScoreboard();

  if (startNow) {
    registerTap();
    hidePanel();
  } else if (introActive) {
    hidePanel();
  } else {
    showPanel(
      "How Far Will Your Duck Fly by Wulfzxx.underground",
      "Score only grows above 10 taps per second. Higher altitude and fast climbing keep raising the needed tap rate with no fixed cap.",
      "Start"
    );
  }
}

function showPanel(title, message, buttonText) {
  ui.title.textContent = title;
  ui.message.textContent = message;
  ui.restart.textContent = buttonText;
  ui.panel.classList.remove("is-hidden");
}

function hidePanel() {
  ui.panel.classList.add("is-hidden");
}

function startFromIntro() {
  if (!introActive) {
    return;
  }
  hideIntro();
  resetGame(true);
}

function registerTap() {
  const now = performance.now();
  if (state.mode === "ready") {
    resetGame(true);
    return;
  }

  if (state.mode === "landed") {
    return;
  }

  state.taps.push(now);
  state.lastTapAt = now;
  state.flapPower = Math.min(1, state.flapPower + 0.34);
}

function handlePointerDown(event) {
  if (introActive) {
    startFromIntro();
    return;
  }

  if (event.target.closest(".scoreboard, .status-panel")) {
    return;
  }
  registerTap();
}

function updateTapRate(now) {
  const oldestAllowed = now - RULES.tapWindowMs;
  while (state.taps.length && state.taps[0] < oldestAllowed) {
    state.taps.shift();
  }
  state.tapRate = state.taps.length / (RULES.tapWindowMs / 1000);
}

function updateDifficultyPressure(dt, hasStoppedFlapping) {
  const altitudeRatio = clamp(state.altitude / RULES.maxAltitude, 0, 1);
  const requiredRate = state.requiredAscendTapRate;
  const tapsAboveNeed = Math.max(0, state.tapRate - requiredRate);
  const isClimbing =
    state.mode === "playing" &&
    !hasStoppedFlapping &&
    state.verticalVelocity > 0 &&
    state.tapRate > requiredRate;

  if (isClimbing) {
    const gain =
      RULES.pressureBaseGainPerSecond +
      altitudeRatio * RULES.pressureAltitudeGainPerSecond +
      tapsAboveNeed * RULES.pressureOvertapGainPerTap;
    state.difficultyPressure = Math.max(0, state.difficultyPressure + gain * dt);
    return;
  }

  const decay = hasStoppedFlapping
    ? RULES.pressureFallDecayPerSecond
    : RULES.pressureDecayPerSecond;
  state.difficultyPressure = Math.max(0, state.difficultyPressure - decay * dt);
}

function simulate(dt, now) {
  updateTapRate(now);

  const timeSinceTap = now - state.lastTapAt;
  const hasStoppedFlapping = timeSinceTap > RULES.fallAfterMs;
  state.requiredAscendTapRate = getRequiredAscendTapRate(state.altitude);
  const tapEnergy = clamp(state.tapRate / state.requiredAscendTapRate, 0, 1.5);
  const targetFlapPower = hasStoppedFlapping ? 0 : clamp(tapEnergy, 0.16, 1);

  state.flightClock += dt;
  state.flapPower += (targetFlapPower - state.flapPower) * Math.min(1, dt * 7);
  state.flapClock += dt * (7.5 + state.tapRate * 2.4) * (0.35 + state.flapPower);

  if (state.mode !== "playing") {
    updateDifficultyPressure(dt, true);
    state.requiredAscendTapRate = getRequiredAscendTapRate(state.altitude);
    state.verticalVelocity = 0;
    state.skyOffset += dt * 18;
    return;
  }

  if (hasStoppedFlapping) {
    state.verticalVelocity = -RULES.fallPerSecond;
  } else if (state.tapRate >= state.requiredAscendTapRate) {
    state.verticalVelocity =
      RULES.baseClimbPerSecond +
      (state.tapRate - state.requiredAscendTapRate) * RULES.extraClimbPerTap;
  } else if (state.tapRate >= RULES.descendMinTapRate) {
    state.verticalVelocity = -RULES.slowDescentPerSecond;
  } else {
    state.verticalVelocity = -RULES.fallPerSecond * 0.78;
  }

  updateDifficultyPressure(dt, hasStoppedFlapping);
  state.requiredAscendTapRate = getRequiredAscendTapRate(state.altitude);

  state.altitude = Math.min(
    RULES.maxAltitude,
    state.altitude + state.verticalVelocity * dt
  );
  state.requiredAscendTapRate = getRequiredAscendTapRate(state.altitude);

  const climbMotion = Math.max(20, Math.abs(state.verticalVelocity) * 0.74);
  const altitudeMotion = state.altitude * 0.18;
  state.skyOffset += dt * (climbMotion + altitudeMotion);

  if (state.altitude > state.bestHeight) {
    state.bestHeight = state.altitude;
  }

  if (state.tapRate > RULES.scoreMinTapRate) {
    state.score += Math.max(0, state.altitude) * RULES.scoreHeightMultiplier * dt;
  }

  if (state.altitude <= 0) {
    state.altitude = 0;
    state.mode = "landed";
    state.flapPower = 0;
    const finalScore = Math.floor(state.score);
    const peakAltitude = Math.floor(state.bestHeight);
    hidePanel();
    showScoreboard(finalScore, peakAltitude);
  }
}

function drawSky() {
  const { width, height } = view;
  const altitudeRatio = state.altitude / RULES.maxAltitude;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  gradient.addColorStop(0, "#45aef4");
  gradient.addColorStop(0.48, "#8bd7ff");
  gradient.addColorStop(1, "#e4f8ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawClouds(width, height, altitudeRatio);
  drawSpeedLines(width, height);
  drawGround(width, height, altitudeRatio);
}

function drawClouds(width, height, altitudeRatio) {
  ctx.save();
  ctx.globalAlpha = 0.88;

  for (const cloud of CLOUDS) {
    const travel = (state.skyOffset * cloud.drift) % (height + 180);
    const x = cloud.x * width + Math.sin(state.flightClock * cloud.drift) * 18;
    const y = ((cloud.y * height + travel) % (height + 180)) - 120;
    const scale = cloud.scale * (0.82 + altitudeRatio * 0.18);
    drawCloud(x, y, scale);
  }

  ctx.restore();
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.ellipse(-42, 12, 42, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(-8, -2, 38, 29, 0, 0, Math.PI * 2);
  ctx.ellipse(30, 10, 48, 24, 0, 0, Math.PI * 2);
  ctx.ellipse(62, 16, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpeedLines(width, height) {
  const intensity = clamp((Math.abs(state.verticalVelocity) - 12) / 70, 0, 1);
  if (intensity <= 0.02) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = 0.18 * intensity;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  for (let i = 0; i < 12; i += 1) {
    const x = ((i * 79 + state.skyOffset * 0.42) % (width + 80)) - 40;
    const y = ((i * 163 + state.skyOffset * 1.7) % (height + 140)) - 70;
    const length = 28 + intensity * 42 + (i % 3) * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 10, y + length);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGround(width, height, altitudeRatio) {
  const lowAltitude = clamp(1 - state.altitude / 34, 0, 1);
  const groundHeight = 34 + lowAltitude * height * 0.26;
  const horizonY = height - groundHeight;

  ctx.save();
  ctx.fillStyle = `rgba(80, 183, 90, ${0.22 + lowAltitude * 0.7})`;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, horizonY + 24);
  ctx.quadraticCurveTo(width * 0.24, horizonY - 18, width * 0.48, horizonY + 10);
  ctx.quadraticCurveTo(width * 0.75, horizonY + 38, width, horizonY - 4);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgba(51, 136, 68, ${0.12 + lowAltitude * 0.52})`;
  for (let i = 0; i < 10; i += 1) {
    const x = (i / 9) * width;
    const y = horizonY + 20 + Math.sin(i * 1.7) * 18;
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 20, -0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  if (altitudeRatio < 0.16) {
    ctx.fillStyle = `rgba(80, 53, 30, ${(0.16 - altitudeRatio) * 2.2})`;
    ctx.fillRect(0, height - 12, width, 12);
  }

  ctx.restore();
}

function drawDuck() {
  const { width, height } = view;
  const altitudeRatio = state.altitude / RULES.maxAltitude;
  const fallRatio = clamp(-state.verticalVelocity / RULES.fallPerSecond, 0, 1);
  const flapWave = Math.sin(state.flapClock);
  const x = width * 0.5;
  const y =
    height * 0.5 -
    altitudeRatio * height * 0.12 +
    Math.sin(state.flightClock * 2.2) * (5 + state.flapPower * 7);
  const shadowScale = Math.min(width, height) / 410;
  const duckScale = (Math.min(width, height) / 2250) * (0.95 + altitudeRatio * 0.12);
  const tilt = state.mode === "landed"
    ? 0
    : -0.08 - state.flapPower * 0.08 + fallRatio * 0.38;

  drawDuckShadow(x, height, shadowScale, altitudeRatio);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(duckScale, duckScale);

  if (areDuckAssetsReady()) {
    drawLayeredDuck(flapWave, fallRatio);
  } else {
    drawFallbackMallard(flapWave, fallRatio);
  }

  ctx.restore();
}

function drawDuckShadow(x, height, scale, altitudeRatio) {
  const lowAltitude = clamp(1 - altitudeRatio * 2.8, 0, 1);
  if (lowAltitude <= 0.02) {
    return;
  }

  ctx.save();
  ctx.translate(x, height - 48);
  ctx.scale(scale * (0.75 + lowAltitude * 0.8), scale * (0.24 + lowAltitude * 0.22));
  ctx.fillStyle = `rgba(33, 72, 48, ${0.1 + lowAltitude * 0.26})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 72, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLayeredDuck(flapWave, fallRatio) {
  const beat = (flapWave + 1) * 0.5;
  const belowNeed = clamp(
    (state.requiredAscendTapRate - state.tapRate) / state.requiredAscendTapRate,
    0,
    1
  );
  const isFalling = state.mode === "playing" && fallRatio > 0.65 && state.tapRate < 0.5;
  const activeArc = 0.2 + state.flapPower * 1.04;
  const beatMotion = isFalling || state.mode === "landed" ? 0 : beat * activeArc;
  const softTuck = state.mode === "landed" ? 0.38 : belowNeed * 0.24;
  const fallTuck = isFalling ? 0.68 : fallRatio * 0.28;
  const frontAngle = beatMotion + softTuck + fallTuck + 0.02;
  const backAngle = frontAngle * 0.88 - 0.08;
  const wingTravel = beatMotion * 96 + fallTuck * 18;

  drawRotatedDuckLayer(DUCK_ASSETS.backWing, backAngle, -wingTravel * 0.1, wingTravel * 0.72);
  drawDuckLayer(DUCK_ASSETS.body);
  drawRotatedDuckLayer(DUCK_ASSETS.frontWing, frontAngle, wingTravel * 0.14, wingTravel);
}

function drawDuckLayer(layer) {
  ctx.drawImage(
    layer.image,
    layer.x - DUCK_SOURCE.anchorX,
    layer.y - DUCK_SOURCE.anchorY,
    layer.width,
    layer.height
  );
}

function drawRotatedDuckLayer(layer, angle, offsetX = 0, offsetY = 0) {
  const pivotX = layer.pivotX - DUCK_SOURCE.anchorX;
  const pivotY = layer.pivotY - DUCK_SOURCE.anchorY;
  ctx.save();
  ctx.translate(pivotX + offsetX, pivotY + offsetY);
  ctx.rotate(angle);
  ctx.drawImage(
    layer.image,
    layer.x - layer.pivotX,
    layer.y - layer.pivotY,
    layer.width,
    layer.height
  );
  ctx.restore();
}

function drawFallbackMallard(flapWave, fallRatio) {
  const wingAngle = ((flapWave + 1) * 0.5) * (0.35 + state.flapPower * 0.72) + fallRatio * 0.42;

  ctx.save();
  ctx.rotate(wingAngle);
  ctx.fillStyle = "#f1d7a8";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-260, -210, -440, -55, -230, 140);
  ctx.bezierCurveTo(-135, 95, -55, 48, 28, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#f3d6a2";
  ctx.beginPath();
  ctx.ellipse(-110, 105, 230, 120, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#08a843";
  ctx.beginPath();
  ctx.ellipse(165, -70, 102, 96, 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffae00";
  ctx.beginPath();
  ctx.ellipse(270, -46, 92, 35, 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(198, -92, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#23130d";
  ctx.beginPath();
  ctx.arc(204, -90, 12, 0, Math.PI * 2);
  ctx.fill();
}

function drawAltitudeMeter() {
  const { width, height } = view;
  const meterHeight = Math.min(360, height * 0.36);
  const x = width - 26;
  const y = height * 0.5 - meterHeight / 2;
  const fill = meterHeight * (state.altitude / RULES.maxAltitude);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(23, 60, 84, 0.24)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + meterHeight);
  ctx.stroke();

  ctx.strokeStyle = state.altitude < 20 ? "#ff715b" : "#ffd257";
  ctx.beginPath();
  ctx.moveTo(x, y + meterHeight);
  ctx.lineTo(x, y + meterHeight - fill);
  ctx.stroke();
  ctx.restore();
}

function render() {
  drawSky();
  drawAltitudeMeter();
  drawDuck();
}

function updateHud() {
  ui.score.textContent = Math.floor(state.score).toString();
  ui.altitude.textContent = Math.floor(state.altitude).toString();
  ui.tapRate.textContent = state.tapRate.toFixed(1);
  ui.neededRate.textContent = state.requiredAscendTapRate.toFixed(1);
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  simulate(dt, now);
  render();
  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("pointerdown", handlePointerDown, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    if (introActive) {
      startFromIntro();
      return;
    }
    registerTap();
  }
});
ui.restart.addEventListener("click", (event) => {
  event.stopPropagation();
  resetGame(true);
});
ui.submitScore.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!scoreboard.hasSubmittedCurrentScore) {
    void submitScore(scoreboard.pendingScore, scoreboard.pendingPeakAltitude);
  }
});
ui.scoreboardRestart.addEventListener("click", (event) => {
  event.stopPropagation();
  resetGame(true);
});
ui.nicknameInput.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    if (!scoreboard.hasSubmittedCurrentScore) {
      void submitScore(scoreboard.pendingScore, scoreboard.pendingPeakAltitude);
    }
  }
});

initDuckAssets();
resize();
resetGame(false);
initScoreboard();
requestAnimationFrame(frame);
