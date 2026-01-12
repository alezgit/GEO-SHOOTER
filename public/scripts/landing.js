// ========== MOBILE DETECTION ==========
function isMobile() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (window.innerWidth <= 768 && "ontouchstart" in window)
  );
}

if (isMobile()) {
  window.location.href = "/phone";
}

// ========== CANVAS SETUP ==========
const canvas = document.getElementById("lightCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ========== TRAIL SYSTEM ==========
const trailPoints = [];
const maxTrailLength = 50;

class TrailPoint {
  constructor(x, y, intensity) {
    this.x = x;
    this.y = y;
    this.intensity = intensity;
    this.life = 1;
    this.baseRadius = 60 + intensity * 100;
  }

  update() {
    this.life -= 0.012;
    return this.life > 0;
  }

  get radius() {
    return this.baseRadius * (0.5 + this.life * 0.5);
  }

  get alpha() {
    return this.life * this.intensity * 0.7;
  }
}

// ========== STATE MANAGEMENT ==========
const State = {
  OFF: "off",
  WAKE: "wake",
  READY: "ready",
  POWER_ON: "power_on",
};

let currentState = State.OFF;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let targetGlow = 0,
  currentGlow = 0;
let interactionTime = 0;
let lastMoveTime = 0;
let hasInteracted = false;

// ========== DOM ELEMENTS ==========
const intro = document.getElementById("intro");
const gameTitle = document.getElementById("gameTitle");
const powerBtn = document.getElementById("powerBtn");
const crtFlash = document.getElementById("crtFlash");
const cursorLight = document.getElementById("cursorLight");
const hintText = document.getElementById("hintText");

// ========== WEB AUDIO API ==========
let audioCtx = null;
let humOscillator = null;
let humGain = null;

function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  humOscillator = audioCtx.createOscillator();
  humGain = audioCtx.createGain();

  humOscillator.type = "sine";
  humOscillator.frequency.setValueAtTime(60, audioCtx.currentTime);
  humGain.gain.setValueAtTime(0, audioCtx.currentTime);

  const harmonic = audioCtx.createOscillator();
  const harmonicGain = audioCtx.createGain();
  harmonic.type = "sine";
  harmonic.frequency.setValueAtTime(120, audioCtx.currentTime);
  harmonicGain.gain.setValueAtTime(0, audioCtx.currentTime);

  humOscillator.connect(humGain);
  harmonic.connect(harmonicGain);
  humGain.connect(audioCtx.destination);
  harmonicGain.connect(audioCtx.destination);

  humOscillator.start();
  harmonic.start();

  humOscillator._harmonic = harmonic;
  humOscillator._harmonicGain = harmonicGain;
}

function setHumVolume(volume) {
  if (!humGain) return;
  const maxVol = 0.012;
  humGain.gain.setTargetAtTime(volume * maxVol, audioCtx.currentTime, 0.1);
  if (humOscillator._harmonicGain) {
    humOscillator._harmonicGain.gain.setTargetAtTime(
      volume * maxVol * 0.25,
      audioCtx.currentTime,
      0.1
    );
  }
}

function playPowerOnSound() {
  if (!audioCtx) initAudio();

  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);

  oscGain.gain.setValueAtTime(0.18, now);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.4);

  const bufferSize = audioCtx.sampleRate * 0.15;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  const noiseGain = audioCtx.createGain();
  const noiseFilter = audioCtx.createBiquadFilter();

  noise.buffer = noiseBuffer;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(2500, now);
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.15);
}

// ========== STATE TRANSITIONS ==========
function setState(newState) {
  if (currentState === newState) return;

  currentState = newState;

  switch (newState) {
    case State.WAKE:
      intro.classList.remove("powered-off");
      intro.classList.add("wake");
      gameTitle.classList.add("glowing");
      hintText.style.color = "rgba(255,255,255,0)";
      break;

    case State.READY:
      powerBtn.classList.add("visible");
      break;

    case State.POWER_ON:
      triggerPowerOn();
      break;
  }
}

function triggerPowerOn() {
  playPowerOnSound();
  setHumVolume(0);

  intro.classList.add("powering-on");
  crtFlash.classList.add("active");

  currentGlow = 1;
  document.documentElement.style.setProperty("--glow-intensity", "1");

  setTimeout(() => {
    intro.classList.add("hidden");

    setTimeout(() => {
      window.location.href = "/pc";
    }, 300);
  }, 400);
}

// ========== MOUSE TRACKING ==========
let mouseVelocity = 0;
let prevMouseX = mouseX,
  prevMouseY = mouseY;
let frameCount = 0;

function handleMouseMove(e) {
  if (!hasInteracted) {
    hasInteracted = true;
    initAudio();
  }

  mouseX = e.clientX;
  mouseY = e.clientY;

  // Update cursor light position
  cursorLight.style.left = mouseX + "px";
  cursorLight.style.top = mouseY + "px";

  // Calculate velocity
  const dx = mouseX - prevMouseX;
  const dy = mouseY - prevMouseY;
  mouseVelocity = Math.sqrt(dx * dx + dy * dy);
  prevMouseX = mouseX;
  prevMouseY = mouseY;

  // Track interaction time
  const now = Date.now();
  if (now - lastMoveTime < 200) {
    interactionTime += now - lastMoveTime;
  } else {
    interactionTime = Math.max(0, interactionTime - 500);
  }
  lastMoveTime = now;

  // State transitions
  if (currentState === State.OFF && mouseVelocity > 3) {
    setState(State.WAKE);
  }

  if (currentState === State.WAKE && interactionTime > 1000) {
    setState(State.READY);
  }

  // Calculate glow
  if (currentState !== State.OFF) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dist = Math.sqrt(
      Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
    );
    const maxDist = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));

    const proximityFactor = 1 - dist / maxDist;
    const velocityBonus = Math.min(mouseVelocity / 40, 0.35);

    targetGlow = Math.min(1, proximityFactor * 0.6 + velocityBonus + 0.25);

    // Add trail point every few frames
    if (frameCount % 3 === 0 && mouseVelocity > 2) {
      const intensity = Math.min(1, 0.4 + currentGlow * 0.6);
      trailPoints.push(new TrailPoint(mouseX, mouseY, intensity));

      if (trailPoints.length > maxTrailLength) {
        trailPoints.shift();
      }
    }
  }
}

// ========== RENDER CANVAS ==========
function drawLightCanvas() {
  // Start with full black
  ctx.fillStyle = "#020204";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Use 'destination-out' to cut holes in the black
  ctx.globalCompositeOperation = "destination-out";

  // Draw trail points (older = more faded holes)
  for (let i = trailPoints.length - 1; i >= 0; i--) {
    const point = trailPoints[i];
    if (!point.update()) {
      trailPoints.splice(i, 1);
      continue;
    }

    const gradient = ctx.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      point.radius
    );
    gradient.addColorStop(0, `rgba(255, 255, 255, ${point.alpha})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${point.alpha * 0.4})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw cursor light (strongest reveal)
  if (currentState !== State.OFF) {
    const cursorRadius = 80 + currentGlow * 120;
    const cursorAlpha = 0.4 + currentGlow * 0.5;

    const cursorGradient = ctx.createRadialGradient(
      mouseX,
      mouseY,
      0,
      mouseX,
      mouseY,
      cursorRadius
    );
    cursorGradient.addColorStop(0, `rgba(255, 255, 255, ${cursorAlpha})`);
    cursorGradient.addColorStop(
      0.3,
      `rgba(255, 255, 255, ${cursorAlpha * 0.6})`
    );
    cursorGradient.addColorStop(
      0.7,
      `rgba(255, 255, 255, ${cursorAlpha * 0.2})`
    );
    cursorGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = cursorGradient;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, cursorRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw title glow reveal
  if (currentGlow > 0.05) {
    const titleRect = gameTitle.getBoundingClientRect();
    const titleCenterX = titleRect.left + titleRect.width / 2;
    const titleCenterY = titleRect.top + titleRect.height / 2;
    const titleRadius =
      Math.max(titleRect.width, titleRect.height) * 0.7 + currentGlow * 200;

    const titleAlpha = currentGlow * 0.75;

    const titleGradient = ctx.createRadialGradient(
      titleCenterX,
      titleCenterY,
      0,
      titleCenterX,
      titleCenterY,
      titleRadius
    );
    titleGradient.addColorStop(0, `rgba(255, 255, 255, ${titleAlpha})`);
    titleGradient.addColorStop(0.4, `rgba(255, 255, 255, ${titleAlpha * 0.5})`);
    titleGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = titleGradient;
    ctx.beginPath();
    ctx.arc(titleCenterX, titleCenterY, titleRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

// ========== ANIMATION LOOP ==========
function animate() {
  frameCount++;

  // Smooth glow
  const glowSpeed = 0.06;
  currentGlow += (targetGlow - currentGlow) * glowSpeed;

  // Decay if not moving
  if (Date.now() - lastMoveTime > 250 && currentState !== State.POWER_ON) {
    targetGlow *= 0.94;
  }

  // Apply glow to title
  document.documentElement.style.setProperty(
    "--glow-intensity",
    currentGlow.toFixed(4)
  );

  // Scale cursor light
  const cursorScale = 0.8 + currentGlow * 1.2;
  cursorLight.style.transform = `translate(-50%, -50%) scale(${cursorScale})`;

  // Audio
  if (currentState === State.WAKE || currentState === State.READY) {
    setHumVolume(currentGlow);
  }

  // Decay interaction time
  if (Date.now() - lastMoveTime > 800 && currentState === State.WAKE) {
    interactionTime = Math.max(0, interactionTime - 40);
  }

  // Render
  drawLightCanvas();

  requestAnimationFrame(animate);
}

// ========== EVENT LISTENERS ==========
document.addEventListener("mousemove", handleMouseMove);

powerBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentState === State.READY) {
    setState(State.POWER_ON);
  }
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("visibilitychange", () => {
  if (document.hidden && humGain) {
    setHumVolume(0);
  }
});

// ========== INITIALIZE ==========
animate();
