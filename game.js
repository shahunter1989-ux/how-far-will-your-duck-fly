const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.getElementById("score"),
  altitude: document.getElementById("altitude"),
  tapRate: document.getElementById("tap-rate"),
  panel: document.getElementById("status-panel"),
  title: document.getElementById("state-title"),
  message: document.getElementById("state-message"),
  restart: document.getElementById("restart"),
};

const RULES = {
  ascendTapRate: 4,
  descendMinTapRate: 1,
  tapWindowMs: 1000,
  fallAfterMs: 750,
  maxAltitude: 120,
  baseClimbPerSecond: 24,
  extraClimbPerTap: 7,
  slowDescentPerSecond: 18,
  fallPerSecond: 70,
  scoreHeightMultiplier: 0.12,
};

const state = {
  mode: "ready",
  altitude: 18,
  score: 0,
  bestHeight: 18,
  taps: [],
  lastTapAt: 0,
  tapRate: 0,
  duckTilt: 0,
  rippleClock: 0,
};

let lastFrame = performance.now();
let view = { width: 720, height: 1080, dpr: 1 };

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
  state.altitude = 18;
  state.score = 0;
  state.bestHeight = 18;
  state.taps = [];
  state.lastTapAt = 0;
  state.tapRate = 0;
  state.duckTilt = 0;
  state.rippleClock = 0;
  if (startNow) {
    registerTap();
    hidePanel();
  } else {
    showPanel(
      "How Far Will Your Duck Flap?",
      "Keep at least 4 taps per second to climb. Between 1 and 3 taps per second, the duck descends. Stop tapping and it drops fast.",
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

function registerTap() {
  const now = performance.now();
  if (state.mode === "ready" || state.mode === "gameover") {
    resetGame(true);
    return;
  }

  state.taps.push(now);
  state.lastTapAt = now;
  state.duckTilt = Math.min(1, state.duckTilt + 0.22);
}

function updateTapRate(now) {
  const oldestAllowed = now - RULES.tapWindowMs;
  while (state.taps.length && state.taps[0] < oldestAllowed) {
    state.taps.shift();
  }
  state.tapRate = state.taps.length / (RULES.tapWindowMs / 1000);
}

function simulate(dt, now) {
  updateTapRate(now);
  state.rippleClock += dt;
  state.duckTilt *= Math.pow(0.04, dt);

  if (state.mode !== "playing") {
    return;
  }

  const timeSinceTap = now - state.lastTapAt;
  let verticalVelocity;

  if (timeSinceTap > RULES.fallAfterMs) {
    verticalVelocity = -RULES.fallPerSecond;
  } else if (state.tapRate >= RULES.ascendTapRate) {
    verticalVelocity =
      RULES.baseClimbPerSecond +
      (state.tapRate - RULES.ascendTapRate) * RULES.extraClimbPerTap;
  } else if (state.tapRate >= RULES.descendMinTapRate) {
    verticalVelocity = -RULES.slowDescentPerSecond;
  } else {
    verticalVelocity = -RULES.fallPerSecond * 0.78;
  }

  state.altitude = Math.min(
    RULES.maxAltitude,
    state.altitude + verticalVelocity * dt
  );

  if (state.altitude > state.bestHeight) {
    state.bestHeight = state.altitude;
  }

  state.score += Math.max(0, state.altitude) * RULES.scoreHeightMultiplier * dt;

  if (state.altitude <= 0) {
    state.altitude = 0;
    state.mode = "gameover";
    showPanel(
      "Splashdown",
      `Final score ${Math.floor(state.score)}. Peak altitude ${Math.floor(state.bestHeight)} m.`,
      "Play Again"
    );
  }
}

function drawPond() {
  const { width, height } = view;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#116979");
  gradient.addColorStop(0.52, "#0d5666");
  gradient.addColorStop(1, "#173f35");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 15; i += 1) {
    const x = ((i * 137 + state.rippleClock * 18) % (width + 120)) - 60;
    const y = ((i * 223 + Math.sin(state.rippleClock + i) * 26) % height);
    ctx.strokeStyle = i % 2 ? "#9bd9d0" : "#f1c76c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 42 + (i % 4) * 15, 10 + (i % 3) * 6, -0.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  drawReeds(width * 0.08, height * 0.72, 1);
  drawReeds(width * 0.9, height * 0.38, -1);
}

function drawReeds(x, y, direction) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i += 1) {
    const offset = i * 8 * direction;
    ctx.strokeStyle = "#2f6f46";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(offset, 86);
    ctx.quadraticCurveTo(offset + 12 * direction, 35, offset + 4 * direction, 0);
    ctx.stroke();
    ctx.fillStyle = "#b16d35";
    ctx.fillRect(offset - 4, -8, 8, 26);
  }
  ctx.restore();
}

function drawDuck() {
  const { width, height } = view;
  const altitudeRatio = state.altitude / RULES.maxAltitude;
  const x = width * 0.5 + Math.sin(state.rippleClock * 1.6) * 18;
  const y = height * 0.52 + Math.cos(state.rippleClock * 1.1) * 10;
  const scale = Math.min(width, height) / 380;
  const duckScale = scale * (0.86 + altitudeRatio * 0.34);
  const shadowScale = scale * (1.25 - altitudeRatio * 0.7);
  const liftOffset = altitudeRatio * 26;

  ctx.save();
  ctx.translate(x, y + 24);
  ctx.scale(shadowScale, shadowScale);
  ctx.fillStyle = `rgba(3, 10, 12, ${0.44 - altitudeRatio * 0.26})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 54, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y - liftOffset);
  ctx.rotate(Math.sin(state.duckTilt * Math.PI) * -0.16);
  ctx.scale(duckScale, duckScale);

  ctx.fillStyle = "#ffd257";
  ctx.beginPath();
  ctx.ellipse(0, 0, 54, 39, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2b93c";
  ctx.beginPath();
  ctx.ellipse(-24, 7, 26, 17, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffe188";
  ctx.beginPath();
  ctx.ellipse(36, -18, 27, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff7d3c";
  ctx.beginPath();
  ctx.moveTo(58, -18);
  ctx.lineTo(88, -7);
  ctx.lineTo(57, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#132025";
  ctx.beginPath();
  ctx.arc(44, -25, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 66 + altitudeRatio * 14, 0.18, Math.PI * 1.45);
  ctx.stroke();

  ctx.restore();
}

function drawAltitudeMeter() {
  const { width, height } = view;
  const meterHeight = Math.min(360, height * 0.36);
  const x = width - 26;
  const y = height * 0.5 - meterHeight / 2;
  const fill = meterHeight * (state.altitude / RULES.maxAltitude);

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
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
  drawPond();
  drawAltitudeMeter();
  drawDuck();
}

function updateHud() {
  ui.score.textContent = Math.floor(state.score).toString();
  ui.altitude.textContent = Math.floor(state.altitude).toString();
  ui.tapRate.textContent = state.tapRate.toFixed(1);
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
window.addEventListener("pointerdown", registerTap, { passive: true });
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    registerTap();
  }
});
ui.restart.addEventListener("click", (event) => {
  event.stopPropagation();
  resetGame(true);
});

resize();
resetGame(false);
requestAnimationFrame(frame);
