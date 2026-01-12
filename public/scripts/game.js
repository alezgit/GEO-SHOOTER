// ============ AUDIO SYSTEM ============
class AudioManager {
  constructor() {
    this.sounds = {};
    this.bgMusic = null;
    this.isMuted = false;
    this.volume = 0.7;
    this.soundsLoaded = false;
  }

  async loadSounds() {
    const soundFiles = {
      bgMusic: "sounds/bg-music.mp3",
      collectPowerup: "sounds/collect-powerup.mp3",
      laserGunfire: "sounds/laser-gunfire.mp3",
      moveOverItem: "sounds/move-over-item.mp3",
      playerJoined: "sounds/player-joined.mp3",
      playerRespawn: "sounds/player-respawn.mp3",
      powerup: "sounds/powerup.mp3",
    };

    for (const [key, path] of Object.entries(soundFiles)) {
      try {
        const audio = new Audio(path);
        audio.volume = this.volume;

        if (key === "bgMusic") {
          audio.loop = true;
          this.bgMusic = audio;
        } else {
          this.sounds[key] = audio;
        }
      } catch (error) {
        console.warn(`Failed to load sound: ${path}`, error);
      }
    }

    this.soundsLoaded = true;
    console.log("Audio system initialized");
  }

  play(soundName, options = {}) {
    if (this.isMuted || !this.soundsLoaded) return;

    const sound = this.sounds[soundName];
    if (!sound) return;

    const audioClone = sound.cloneNode();
    audioClone.volume =
      options.volume !== undefined ? options.volume * this.volume : this.volume;

    audioClone.play().catch((err) => {
      console.warn(`Failed to play sound: ${soundName}`, err);
    });
  }

  playBgMusic() {
    if (this.isMuted || !this.bgMusic) return;

    this.bgMusic.volume = this.volume * 0.3;
    return this.bgMusic.play().catch((err) => {
      console.warn("Failed to play background music", err);
    });
  }

  stopBgMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic.currentTime = 0;
    }
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.bgMusic) {
      this.bgMusic.volume = vol * 0.3;
    }
    Object.values(this.sounds).forEach((sound) => {
      sound.volume = vol;
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.stopBgMusic();
    } else {
      if (gameState === "playing") {
        this.playBgMusic();
      }
    }

    return this.isMuted;
  }

  setMuted(state) {
    this.isMuted = Boolean(state);
    if (this.isMuted) {
      this.stopBgMusic();
    }
  }
}

const audioManager = new AudioManager();
let shouldResumeAudio = false;

document.getElementById("muteBtn").onclick = () => {
  const isMuted = audioManager.toggleMute();
  document.getElementById("muteBtn").textContent = isMuted ? "MUTED" : "SOUND";
};

document.getElementById("volumeSlider").oninput = (e) => {
  audioManager.setVolume(e.target.value / 100);
};

function restoreAudioState() {
  const stateRaw = localStorage.getItem("geo_audio_state");
  if (!stateRaw) return;

  let state;
  try {
    state = JSON.parse(stateRaw);
  } catch (err) {
    return;
  }

  if (typeof state.volume === "number") {
    audioManager.setVolume(state.volume);
    document.getElementById("volumeSlider").value = Math.round(
      state.volume * 100
    );
  }

  if (typeof state.muted === "boolean") {
    audioManager.setMuted(state.muted);
    document.getElementById("muteBtn").textContent = state.muted
      ? "MUTED"
      : "SOUND";
  }

  if (audioManager.bgMusic && typeof state.time === "number") {
    audioManager.bgMusic.currentTime = state.time;
  }

  shouldResumeAudio = Boolean(state.playing && !audioManager.isMuted);
}

audioManager.loadSounds().then(() => {
  restoreAudioState();
  if (shouldResumeAudio) {
    audioManager.playBgMusic();
  }
});

function resumeAudioOnInteraction() {
  if (!shouldResumeAudio || audioManager.isMuted || !audioManager.bgMusic)
    return;
  if (!audioManager.bgMusic.paused) return;
  audioManager.playBgMusic();
}

document.body.addEventListener("click", resumeAudioOnInteraction);
document.body.addEventListener("touchstart", resumeAudioOnInteraction);

// ============ GAME CODE ============
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const waitingScreen = document.getElementById("waitingScreen");
const gameEndScreen = document.getElementById("gameEndScreen");
const playerCountEl = document.getElementById("playerCount");
const readyStatusEl = document.getElementById("readyStatus");
const mapInfoEl = document.getElementById("mapInfo");
const scoreboardMapName = document.getElementById("mapName");
const scoreListEl = document.getElementById("scoreList");

let ws, roomId;
let gameState = "waiting";
let players = {};
let bullets = [];
let obstacles = [];
let movingObstacles = [];
let camps = [];
let specialZones = [];
let powerUps = [];
let currentMap = "training";
let gameLoopId = null;
let pendingGameStart = null;

const MAX_LIVES = 3;
const PLAYER_COLORS = [
  "#ff3b30",
  "#0a84ff",
  "#34c759",
  "#ff9f0a",
  "#bf5af2",
  "#64d2ff",
  "#ffd60a",
  "#ff375f",
  "#30d158",
  "#5e5ce6",
  "#64d2ff",
  "#ffcc00",
];
const getSpawnPoints = () => [
  { x: 100, y: 100 },
  { x: canvas.width - 100, y: 100 },
  { x: 100, y: canvas.height - 100 },
  { x: canvas.width - 100, y: canvas.height - 100 },
];

const CHARACTERS = {
  TANK: {
    name: "Tank",
    color: "#4CAF50",
    stats: { speed: 3, health: 150, damage: 35, fireRate: 1, bulletSpeed: 8 },
    ability: {
      name: "Shield",
      icon: "",
      cooldown: 20000,
      duration: 3000,
      effect: "shield",
    },
  },
  SNIPER: {
    name: "Sniper",
    color: "#2196F3",
    stats: { speed: 5, health: 80, damage: 60, fireRate: 1.6, bulletSpeed: 15 },
    ability: {
      name: "Piercing Shot",
      icon: "",
      cooldown: 12000,
      duration: 0,
      effect: "pierce",
    },
  },
  RUNNER: {
    name: "Runner",
    color: "#FFC107",
    stats: { speed: 7, health: 70, damage: 15, fireRate: 0.3, bulletSpeed: 10 },
    ability: {
      name: "Dash",
      icon: "",
      cooldown: 8000,
      duration: 300,
      effect: "dash",
    },
  },
  BALANCED: {
    name: "Balanced",
    color: "#9C27B0",
    stats: {
      speed: 5.5,
      health: 100,
      damage: 25,
      fireRate: 0.5,
      bulletSpeed: 10,
    },
    ability: {
      name: "Heal Burst",
      icon: "",
      cooldown: 15000,
      duration: 0,
      effect: "heal",
    },
  },
  ASSAULT: {
    name: "Assault",
    color: "#FF5722",
    stats: { speed: 6, health: 90, damage: 30, fireRate: 0.5, bulletSpeed: 12 },
    ability: {
      name: "Bullet Storm",
      icon: "",
      cooldown: 12000,
      duration: 0,
      effect: "storm",
    },
  },
};

// ============ IMPROVED MAPS ============
const MAPS = {
  // Level 1: Simple open arena - great for beginners
  training: {
    name: "Training Ground",
    icon: "",
    difficulty: 1,
    description: "Open arena perfect for learning",
    background: "#0a0e1a",
    gridColor: "rgba(100, 255, 100, 0.05)",
    hasMovingWalls: false,
    generateObstacles: () => {
      return [
        // Just 4 small cover spots
        { x: 250, y: 280, w: 80, h: 80, color: "#2d5a27" },
        { x: 770, y: 280, w: 80, h: 80, color: "#2d5a27" },
        { x: 510, y: 150, w: 80, h: 60, color: "#2d5a27" },
        { x: 510, y: 440, w: 80, h: 60, color: "#2d5a27" },
      ];
    },
    generateZones: () => [],
  },

  // Level 2: Classic arena with more cover
  arena: {
    name: "Classic Arena",
    icon: "",
    difficulty: 2,
    description: "Balanced combat with cover",
    background: "#0a0e1a",
    gridColor: "rgba(255, 255, 255, 0.05)",
    hasMovingWalls: false,
    generateObstacles: () => {
      return [
        // Center structure
        {
          x: canvas.width / 2 - 60,
          y: canvas.height / 2 - 60,
          w: 120,
          h: 120,
          color: "#37474F",
        },
        // Corner covers
        { x: 150, y: 120, w: 100, h: 25, color: "#37474F" },
        { x: 850, y: 120, w: 100, h: 25, color: "#37474F" },
        { x: 150, y: 505, w: 100, h: 25, color: "#37474F" },
        { x: 850, y: 505, w: 100, h: 25, color: "#37474F" },
        // Side pillars
        { x: 350, y: 200, w: 25, h: 100, color: "#455A64" },
        { x: 725, y: 350, w: 25, h: 100, color: "#455A64" },
        { x: 350, y: 350, w: 25, h: 100, color: "#455A64" },
        { x: 725, y: 200, w: 25, h: 100, color: "#455A64" },
      ];
    },
    generateZones: () => [],
  },

  // Level 3: Urban Warfare - Collapsing buildings and danger zones
  urban: {
    name: "Urban Warfare",
    icon: "",
    difficulty: 3,
    description: "Collapsing buildings and toxic zones",
    background: "#0f0f15",
    gridColor: "rgba(200, 200, 100, 0.04)",
    hasMovingWalls: false,
    generateObstacles: () => {
      return [
        // Building ruins - top left (far from spawn)
        { x: 200, y: 180, w: 120, h: 80, color: "#3a3a2a" },
        { x: 230, y: 260, w: 60, h: 60, color: "#4a4a3a" },
        // Building ruins - top right (far from spawn)
        { x: 780, y: 180, w: 120, h: 80, color: "#3a3a2a" },
        { x: 810, y: 260, w: 60, h: 60, color: "#4a4a3a" },
        // Central rubble
        { x: 480, y: 250, w: 140, h: 40, color: "#5a5a4a" },
        { x: 500, y: 290, w: 40, h: 80, color: "#6a6a5a" },
        { x: 560, y: 290, w: 40, h: 80, color: "#6a6a5a" },
        // Building ruins - bottom left (far from spawn)
        { x: 200, y: 410, w: 120, h: 80, color: "#3a3a2a" },
        { x: 230, y: 330, w: 60, h: 60, color: "#4a4a3a" },
        // Building ruins - bottom right (far from spawn)
        { x: 780, y: 410, w: 120, h: 80, color: "#3a3a2a" },
        { x: 810, y: 330, w: 60, h: 60, color: "#4a4a3a" },
      ];
    },
    generateMovingObstacles: () => {
      return [
        // Falling debris (vertical movement)
        {
          x: 350,
          y: 150,
          w: 80,
          h: 25,
          color: "#6a5a4a",
          glowColor: "#aa8a6a",
          damageOnTouch: 20,
          vx: 0,
          vy: 1.5,
          minX: 350,
          maxX: 350,
          minY: 150,
          maxY: 400,
          isDangerous: true,
        },
        {
          x: 670,
          y: 400,
          w: 80,
          h: 25,
          color: "#6a5a4a",
          glowColor: "#aa8a6a",
          damageOnTouch: 20,
          vx: 0,
          vy: -1.5,
          minX: 670,
          maxX: 670,
          minY: 200,
          maxY: 400,
          isDangerous: true,
        },
      ];
    },
    generateZones: () => [
      // Toxic waste zones (damage over time)
      {
        x: 150,
        y: 300,
        w: 100,
        h: 100,
        type: "damage",
        color: "#88ff00",
        intensity: 0.15,
      },
      {
        x: 850,
        y: 300,
        w: 100,
        h: 100,
        type: "damage",
        color: "#88ff00",
        intensity: 0.15,
      },
    ],
    allowHealingPads: false,
  },

  // Level 4: Crossfire - All walls appear and disappear randomly
  crossfire: {
    name: "Crossfire",
    icon: "",
    difficulty: 4,
    description: "Walls materialize and dematerialize",
    background: "#120a1a",
    gridColor: "rgba(200, 100, 255, 0.05)",
    hasMovingWalls: false,
    hasDisappearingWalls: true,
    generateObstacles: () => [],
    generateMovingObstacles: () => createCrossfireWalls(),
    generateZones: () => [],
    allowHealingPads: false,
  },

  // Level 5: The Pit - Rotating barriers and gravity anomalies
  thepit: {
    name: "The Pit",
    icon: "",
    difficulty: 5,
    description: "Rotating barriers and gravity zones",
    background: "#1a1010",
    gridColor: "rgba(255, 150, 150, 0.06)",
    hasMovingWalls: false,
    hasRotatingWalls: true, // Special flag for rotating obstacles
    generateObstacles: () => {
      const obstacles = [];
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Outer ring walls (far from spawns at 100,100 etc)
      const numSegments = 8;
      const outerRadius = 280;

      for (let i = 0; i < numSegments; i++) {
        const angle = (i / numSegments) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * outerRadius - 30;
        const y = centerY + Math.sin(angle) * outerRadius - 30;
        obstacles.push({ x, y, w: 60, h: 60, color: "#5a3a3a" });
      }

      // Center elevated platform
      obstacles.push({
        x: centerX - 70,
        y: centerY - 70,
        w: 140,
        h: 140,
        color: "#8a5a5a",
      });

      return obstacles;
    },
    generateMovingObstacles: () => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const obstacles = [];

      // Rotating barriers around center (4 arms)
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const radius = 150;
        obstacles.push({
          x: centerX + Math.cos(angle) * radius - 80,
          y: centerY + Math.sin(angle) * radius - 15,
          w: 160,
          h: 30,
          color: "#cc4444",
          glowColor: "#ff6666",
          damageOnTouch: 15,
          vx: 0,
          vy: 0,
          minX: 0,
          maxX: canvas.width,
          minY: 0,
          maxY: canvas.height,
          isDangerous: true,
          isRotating: true,
          rotationSpeed: 0.015, // radians per frame
          rotationAngle: angle,
          rotationRadius: radius,
          rotationCenter: { x: centerX, y: centerY },
        });
      }

      return obstacles;
    },
    generateZones: () => [
      // Central gravity well (pulls players in slowly)
      {
        x: canvas.width / 2 - 90,
        y: canvas.height / 2 - 90,
        w: 180,
        h: 180,
        type: "gravity",
        color: "#ff4444",
        pull: 0.05,
      },
    ],
    allowHealingPads: false,
  },

  // Level 6: DEATH ZONE - Moving walls that damage players!
  deathzone: {
    name: "Death Zone",
    icon: "",
    difficulty: 6,
    description: "Beware of moving deadly walls!",
    background: "#1a0505",
    gridColor: "rgba(255, 0, 0, 0.08)",
    hasMovingWalls: true,
    generateObstacles: () => {
      // Static obstacles - moved away from spawn corners (spawns at 100,100 etc)
      return [
        { x: 200, y: 180, w: 60, h: 60, color: "#4a1a1a" },
        { x: canvas.width - 260, y: 180, w: 60, h: 60, color: "#4a1a1a" },
        { x: 200, y: canvas.height - 240, w: 60, h: 60, color: "#4a1a1a" },
        {
          x: canvas.width - 260,
          y: canvas.height - 240,
          w: 60,
          h: 60,
          color: "#4a1a1a",
        },
        // Center safe zone marker
        {
          x: canvas.width / 2 - 40,
          y: canvas.height / 2 - 40,
          w: 80,
          h: 80,
          color: "#2a2a2a",
        },
      ];
    },
    generateMovingObstacles: () => {
      return [
        // Horizontal movers
        {
          x: 200,
          y: 180,
          w: 150,
          h: 25,
          color: "#8B0000",
          glowColor: "#FF4500",
          damageOnTouch: 15,
          vx: 2,
          vy: 0,
          minX: 150,
          maxX: 800,
          minY: 180,
          maxY: 180,
          isDangerous: true,
        },
        {
          x: 750,
          y: 445,
          w: 150,
          h: 25,
          color: "#8B0000",
          glowColor: "#FF4500",
          damageOnTouch: 15,
          vx: -2,
          vy: 0,
          minX: 150,
          maxX: 800,
          minY: 445,
          maxY: 445,
          isDangerous: true,
        },
        // Vertical movers
        {
          x: 280,
          y: 250,
          w: 25,
          h: 120,
          color: "#8B0000",
          glowColor: "#FF4500",
          damageOnTouch: 15,
          vx: 0,
          vy: 1.5,
          minX: 280,
          maxX: 280,
          minY: 200,
          maxY: 400,
          isDangerous: true,
        },
        {
          x: 795,
          y: 200,
          w: 25,
          h: 120,
          color: "#8B0000",
          glowColor: "#FF4500",
          damageOnTouch: 15,
          vx: 0,
          vy: -1.5,
          minX: 795,
          maxX: 795,
          minY: 200,
          maxY: 400,
          isDangerous: true,
        },
        // Diagonal crusher
        {
          x: 500,
          y: 100,
          w: 100,
          h: 30,
          color: "#660000",
          glowColor: "#FF0000",
          damageOnTouch: 25,
          vx: 1,
          vy: 1,
          minX: 400,
          maxX: 600,
          minY: 100,
          maxY: 250,
          isDangerous: true,
        },
        {
          x: 500,
          y: 500,
          w: 100,
          h: 30,
          color: "#660000",
          glowColor: "#FF0000",
          damageOnTouch: 25,
          vx: -1,
          vy: -1,
          minX: 400,
          maxX: 600,
          minY: 370,
          maxY: 520,
          isDangerous: true,
        },
      ];
    },
    generateZones: () => [],
    allowHealingPads: false,
  },
};

const CROSS_FIRE_WALL_COUNT = 12;
const CROSS_FIRE_PHASE_BASE = 2600;
const SPAWN_SAFE_RADIUS = 80;

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function rectCircleOverlap(rect, circle) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function isWallPlacementSafe(
  x,
  y,
  w,
  h,
  skipObs = null,
  extraWalls = null,
  includeMoving = true
) {
  const rect = { x, y, w, h };

  for (const spawn of getSpawnPoints()) {
    if (
      rectCircleOverlap(rect, { x: spawn.x, y: spawn.y, r: SPAWN_SAFE_RADIUS })
    )
      return false;
  }

  for (const player of Object.values(players)) {
    if (!player || player.isRespawning || player.health <= 0) continue;
    if (rectCircleOverlap(rect, { x: player.x, y: player.y, r: player.r + 15 }))
      return false;
  }

  for (const obs of obstacles) {
    if (rectsOverlap(rect, obs)) return false;
  }

  if (extraWalls) {
    for (const obs of extraWalls) {
      if (rectsOverlap(rect, obs)) return false;
    }
  }

  if (includeMoving) {
    for (const obs of movingObstacles) {
      if (obs === skipObs) continue;
      if (rectsOverlap(rect, obs)) return false;
    }
  }

  return true;
}

function findSafeWallPlacement(
  w,
  h,
  skipObs = null,
  extraWalls = null,
  includeMoving = true
) {
  const margin = 70;
  for (let attempts = 0; attempts < 80; attempts++) {
    const x = margin + Math.random() * (canvas.width - w - margin * 2);
    const y = margin + Math.random() * (canvas.height - h - margin * 2);
    if (isWallPlacementSafe(x, y, w, h, skipObs, extraWalls, includeMoving)) {
      return { x, y };
    }
  }
  return null;
}

function createCrossfireWalls() {
  const walls = [];
  for (let i = 0; i < CROSS_FIRE_WALL_COUNT; i++) {
    const isVertical = Math.random() > 0.5;
    const w = isVertical ? 26 + Math.random() * 16 : 120 + Math.random() * 140;
    const h = isVertical ? 120 + Math.random() * 160 : 26 + Math.random() * 16;
    const pos = findSafeWallPlacement(w, h, null, walls, false);
    if (!pos) continue;

    walls.push({
      x: pos.x,
      y: pos.y,
      w,
      h,
      color: "#aa44cc",
      glowColor: "#ff66ff",
      damageOnTouch: 0,
      vx: 0,
      vy: 0,
      minX: pos.x,
      maxX: pos.x,
      minY: pos.y,
      maxY: pos.y,
      isDangerous: false,
      isPhasing: true,
      isCrossfireWall: true,
      phaseInterval: CROSS_FIRE_PHASE_BASE + Math.random() * 2200,
      phaseOffset: i * 350,
    });
  }

  return walls;
}

function repositionCrossfireWall(obs) {
  const pos = findSafeWallPlacement(obs.w, obs.h, obs, null, true);
  if (!pos) {
    obs.visible = false;
    return;
  }
  obs.x = pos.x;
  obs.y = pos.y;
  obs.minX = pos.x;
  obs.maxX = pos.x;
  obs.minY = pos.y;
  obs.maxY = pos.y;
}

const DROP_TYPES = {
  ABILITY: {
    icon: "⚡",
    color: "#FFD700",
    effect: "recharge_ability",
    duration: 12000,
    radius: 20,
  },
  SPEED: {
    icon: "💨",
    color: "#00BCD4",
    effect: "speed_boost",
    duration: 10000,
    radius: 20,
    boostDuration: 5000,
  },
  HEALTH: {
    icon: "❤️",
    color: "#4CAF50",
    effect: "heal",
    duration: 8000,
    radius: 20,
    healAmount: 30,
  },
};

const ARENA_EVENTS = {
  INFERNO: {
    name: "Fire Tempest",
    icon: "",
    duration: 15000,
    backgroundTint: "rgba(255, 69, 0, 0.25)",
    wallColor: "#8B0000",
    gridColor: "rgba(255, 100, 0, 0.15)",
  },
  BLIZZARD: {
    name: "Ice Blizzard",
    icon: "",
    duration: 18000,
    backgroundTint: "rgba(0, 191, 255, 0.2)",
    wallColor: "#4682B4",
    gridColor: "rgba(200, 230, 255, 0.1)",
    particleColor: "#E0F7FF",
  },
  GRAVITY_CHAOS: {
    name: "Gravity Chaos",
    icon: "",
    duration: 8000,
    backgroundTint: "rgba(156, 39, 176, 0.2)",
    wallColor: "#7B1FA2",
    gridColor: "rgba(200, 100, 255, 0.1)",
  },
};

let currentEvent = null;
let eventStartTime = 0;
let activeDrops = [];

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  if (
    width > 0 &&
    height > 0 &&
    (canvas.width !== width || canvas.height !== height)
  ) {
    canvas.width = width;
    canvas.height = height;
  }
}

function mapAllowsDrops() {
  const map = MAPS[currentMap];
  return !map || map.allowDrops !== false;
}

function mapAllowsHealingPads() {
  const map = MAPS[currentMap];
  return !map || map.allowHealingPads !== false;
}

function initEnvironment(mapKey = "training") {
  currentMap = mapKey;
  const map = MAPS[mapKey];

  obstacles = map.generateObstacles();
  movingObstacles = map.generateMovingObstacles
    ? map.generateMovingObstacles()
    : [];

  // Initialize special wall mechanics
  movingObstacles.forEach((obs, i) => {
    if (obs.isPhasing) {
      obs.visible = true;
      obs.lastPhaseTime = Date.now() + (obs.phaseOffset || 0);
    }
    if (obs.isRotating) {
      obs.currentAngle = obs.rotationAngle;
    }
  });

  specialZones = map.generateZones();
  camps = [];
  activeDrops = [];

  if (mapInfoEl) {
    mapInfoEl.textContent = `Map: ${map.name}`;
  }
}

function updateScoreboard() {
  const sortedPlayers = Object.values(players).sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths
  );

  scoreListEl.innerHTML = "";

  sortedPlayers.forEach((player, i) => {
    const char = CHARACTERS[player.character];
    const displayName = player.name || char.name;
    const livesDots =
      player.lives > 0
        ? Array.from(
            { length: player.lives },
            () => '<span class="life-dot"></span>'
          ).join("")
        : "-";
    const li = document.createElement("li");
    li.className = player.lives <= 0 ? "eliminated" : "";

    li.innerHTML = `
            <span class="player-name" style="color: ${
              player.color || char.color
            }">${i + 1}. ${displayName}</span>
            <span class="player-stats" style="color: ${
              player.color || char.color
            }">${livesDots}</span>
          `;

    scoreListEl.appendChild(li);
  });
}

function spawnDrop() {
  if (gameState !== "playing") return;
  if (!mapAllowsDrops()) return;
  if (activeDrops.length >= 2) return;

  const dropKeys = Object.keys(DROP_TYPES);
  const randomKey = dropKeys[Math.floor(Math.random() * dropKeys.length)];
  const dropType = DROP_TYPES[randomKey];

  let x,
    y,
    attempts = 0;
  do {
    x = 150 + Math.random() * (canvas.width - 300);
    y = 150 + Math.random() * (canvas.height - 300);
    attempts++;
  } while (attempts < 50 && isColliding(x, y, dropType.radius));

  activeDrops.push({
    type: randomKey,
    x,
    y,
    spawnTime: Date.now(),
    ...dropType,
  });

  audioManager.play("powerup", { volume: 0.4 });
}

function startDropSpawning() {
  if (!mapAllowsDrops()) return;
  const scheduleNextDrop = () => {
    if (gameState !== "playing") return;
    if (!mapAllowsDrops()) return;
    const delay = 8000 + Math.random() * 4000;
    setTimeout(() => {
      spawnDrop();
      scheduleNextDrop();
    }, delay);
  };

  setTimeout(() => {
    spawnDrop();
    scheduleNextDrop();
  }, 6000);
}

// --- HEALING PADS DISABLED ---
function spawnHealingPad() {
  return;
}

function startHealingPadSpawning() {
  return;
}
// -----------------------------

function startArenaEvents() {
  const scheduleNextEvent = () => {
    if (gameState !== "playing") return;
    const delay = 25000 + Math.random() * 15000;

    setTimeout(() => {
      spawnArenaEvent();
      scheduleNextEvent();
    }, delay);
  };

  setTimeout(() => {
    spawnArenaEvent();
    scheduleNextEvent();
  }, 30000);
}

function spawnArenaEvent() {
  if (gameState !== "playing") return;
  if (currentEvent) return;

  const eventKeys = Object.keys(ARENA_EVENTS);
  const randomKey = eventKeys[Math.floor(Math.random() * eventKeys.length)];
  const eventData = ARENA_EVENTS[randomKey];

  currentEvent = { type: randomKey, ...eventData };
  eventStartTime = Date.now();

  ws.send(
    JSON.stringify({
      type: "arena_event",
      event: randomKey,
      name: eventData.name,
      icon: eventData.icon,
      duration: eventData.duration,
    })
  );

  setTimeout(() => {
    currentEvent = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "arena_event_end" }));
    }
  }, eventData.duration);
}

function isColliding(x, y, r) {
  for (const obs of obstacles) {
    if (checkCollision({ x, y, r }, obs)) return true;
  }
  for (const obs of movingObstacles) {
    // Skip invisible phasing walls
    if (obs.isPhasing && !obs.visible) continue;
    if (checkCollision({ x, y, r }, obs)) return true;
  }
  return false;
}

initEnvironment();

// Update map info display
function updateMapInfo() {
  const map = MAPS[currentMap];
  const mapInfoEl = document.getElementById("mapInfo");
  if (map && mapInfoEl) {
    mapInfoEl.textContent = map.name;
  }
}

function initCustomMapSelect() {
  const mapSelect = document.getElementById("mapSelect");
  const mapSelectList = document.getElementById("mapSelectList");
  const mapSelectLabel = document.getElementById("mapSelectLabel");
  const mapSelectButton = document.getElementById("mapSelectButton");

  if (!mapSelect || !mapSelectList || !mapSelectLabel || !mapSelectButton)
    return;

  const setLabelFromSelect = () => {
    const selected = mapSelect.options[mapSelect.selectedIndex];
    mapSelectLabel.textContent = selected ? selected.textContent : "Select map";
  };

  mapSelectList.innerHTML = "";
  Array.from(mapSelect.options).forEach((opt) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opt.textContent;
    btn.dataset.value = opt.value;
    btn.onclick = () => {
      mapSelect.value = opt.value;
      setLabelFromSelect();
      mapSelectList.classList.remove("open");
      mapSelectButton.setAttribute("aria-expanded", "false");
      mapSelect.dispatchEvent(new Event("change"));
    };
    li.appendChild(btn);
    mapSelectList.appendChild(li);
  });

  setLabelFromSelect();

  mapSelectButton.onclick = () => {
    const isOpen = mapSelectList.classList.toggle("open");
    mapSelectButton.setAttribute("aria-expanded", String(isOpen));
  };

  document.addEventListener("click", (event) => {
    if (
      !mapSelectButton.contains(event.target) &&
      !mapSelectList.contains(event.target)
    ) {
      mapSelectList.classList.remove("open");
      mapSelectButton.setAttribute("aria-expanded", "false");
    }
  });
}

// Map selector change handler
document.getElementById("mapSelect").onchange = (e) => {
  currentMap = e.target.value;
  initEnvironment(currentMap);
  updateMapInfo();
  const mapSelectLabel = document.getElementById("mapSelectLabel");
  if (mapSelectLabel && e.target.selectedIndex >= 0) {
    mapSelectLabel.textContent =
      e.target.options[e.target.selectedIndex].textContent;
  }

  // Update waiting screen map info
  const map = MAPS[currentMap];
  const waitingMapInfo = document.querySelector("#waitingScreen p#mapInfo");
  if (waitingMapInfo) {
    waitingMapInfo.textContent = map.name;
  }

  // Update scoreboard map info
  scoreboardMapName.textContent = `Map: ${map.name}`;
};

// Initialize map info on load
updateMapInfo();
initCustomMapSelect();
window.addEventListener("resize", () => {
  if (gameState === "playing") {
    resizeCanvasToDisplaySize();
  }
});

async function initQrCode() {
  const qrImg = document.getElementById("qrCode");
  if (!qrImg || typeof qrcode !== "function") return;

  let baseUrl = window.location.origin;
  try {
    const response = await fetch("/server-info", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.baseUrl === "string") {
        baseUrl = data.baseUrl;
      }
      if (data && Array.isArray(data.ips) && data.ips.length) {
        if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
          const protocol =
            data.protocol || window.location.protocol.replace(":", "");
          const port = data.port || window.location.port;
          baseUrl = `${protocol}://${data.ips[0]}:${port}`;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to resolve server info, using current origin", err);
  }

  const controllerUrl = `${baseUrl}/phone`;
  const qr = qrcode(0, "M");
  qr.addData(controllerUrl);
  qr.make();
  qrImg.innerHTML = qr.createImgTag(6, 0);
  qrImg.setAttribute("aria-label", `QR code for ${controllerUrl}`);
  qrImg.setAttribute("data-url", controllerUrl);

  const qrLink = document.getElementById("qrLink");
  if (qrLink) {
    qrLink.textContent = controllerUrl;
  }
}

initQrCode();

const ambientAudio = document.getElementById("ambientAudio");
const ambientAudioLabel = document.getElementById("ambientAudioLabel");
if (ambientAudio && ambientAudioLabel) {
  ambientAudioLabel.onclick = () => {
    ambientAudio.classList.toggle("compact");
  };
}

let startPhase = 0;

document.getElementById("connectBtn").onclick = () => {
  const connectBtn = document.getElementById("connectBtn");
  const mapSelectButton = document.getElementById("mapSelectButton");
  const mapSelectList = document.getElementById("mapSelectList");

  if (startPhase === 0) {
    roomId = document.getElementById("room").value.trim() || "war123";
    currentMap = document.getElementById("mapSelect").value;

    document.getElementById("room").disabled = true;
    connectBtn.disabled = true;
    connectBtn.textContent = "Connecting...";

    const serverUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host;

    ws = new WebSocket(serverUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          role: "pc",
          room: roomId,
          map: currentMap,
        })
      );
      const status = document.getElementById("status");
      status.textContent = "Connected";
      status.style.color = "#00ff88";

      document.body.classList.add("start-armed");
      connectBtn.disabled = false;
      connectBtn.textContent = "Start the game";
      startPhase = 1;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleServerMessage(data);
      } catch (err) {
        console.error("Error:", err);
      }
    };

    ws.onclose = () => {
      document.getElementById("status").textContent = "Disconnected";
      document.getElementById("status").style.color = "#ff4444";
      gameState = "waiting";
      waitingScreen.style.display = "block";
      document.body.classList.add("start-screen");
      document.body.classList.remove("start-armed");
      document.getElementById("mainContainer").style.display = "none";
      document.getElementById("mapSelect").disabled = false;
      if (mapSelectButton) mapSelectButton.disabled = false;
      if (mapSelectList) mapSelectList.classList.remove("open");
      connectBtn.disabled = false;
      connectBtn.textContent = "Create the arena";
      document.getElementById("room").disabled = false;
      startPhase = 0;
      pendingGameStart = null;
      audioManager.stopBgMusic();
    };
    return;
  }

  if (startPhase === 1) {
    startPhase = 2;
    connectBtn.textContent = "Waiting for players...";
    connectBtn.disabled = true;
    if (mapSelectList) mapSelectList.classList.remove("open");

    // Enable audio on user interaction
    audioManager.playBgMusic().catch(() => {
      console.log("Audio will start when game begins");
    });

    if (pendingGameStart) {
      const pending = pendingGameStart;
      pendingGameStart = null;
      beginGame(pending);
    }
    return;
  }
};

// Restart button handler
document.getElementById("restartBtn").onclick = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "restart_game", room: roomId }));
  }
  restartGame();
};

function restartGame() {
  // Reset game state
  gameState = "waiting";
  players = {};
  bullets = [];
  movingObstacles = [];
  camps = [];
  activeDrops = [];
  currentEvent = null;
  startPhase = 0;
  pendingGameStart = null;

  // Reset UI
  gameEndScreen.classList.remove("visible");
  waitingScreen.style.display = "block";
  scoreListEl.innerHTML = "";

  // Exit fullscreen mode
  document.getElementById("mainContainer").classList.remove("fullscreen-mode");
  document.getElementById("mainTitle").classList.remove("hidden");
  document.getElementById("controls").style.display = "flex";
  document.body.classList.add("start-screen");
  document.body.classList.remove("start-armed");
  document.getElementById("mainContainer").style.display = "none";

  // Re-enable controls
  document.getElementById("mapSelect").disabled = false;
  document.getElementById("room").disabled = false;
  document.getElementById("connectBtn").disabled = false;
  document.getElementById("connectBtn").textContent = "Create the arena";
  const mapSelectButton = document.getElementById("mapSelectButton");
  if (mapSelectButton) mapSelectButton.disabled = false;

  // Reset status
  const status = document.getElementById("status");
  status.textContent = "Not connected";
  status.style.color = "#fff";

  // Reinitialize environment with current map
  currentMap = document.getElementById("mapSelect").value;
  initEnvironment(currentMap);

  audioManager.stopBgMusic();
}

function showGameEndScreen(winner, allPlayers) {
  gameEndScreen.classList.add("visible");

  const trophyIcon = document.getElementById("trophyIcon");
  const endTitle = document.getElementById("endTitle");
  const winnerName = document.getElementById("winnerName");
  const winnerStats = document.getElementById("winnerStats");
  const finalScoreList = document.getElementById("finalScoreList");

  if (winner) {
    const char = CHARACTERS[winner.character];
    const winnerColor = winner.color || char.color;
    trophyIcon.textContent = "";
    endTitle.textContent = "WINNER!";
    endTitle.style.color = winnerColor;
    winnerName.textContent = winner.name || char.name;
    winnerName.style.color = winnerColor;
    winnerStats.textContent = "";
  } else {
    trophyIcon.textContent = "DRAW";
    endTitle.textContent = "DRAW!";
    endTitle.style.color = "#ff6666";
    winnerName.textContent = "All players eliminated";
    winnerName.style.color = "#aaa";
    winnerStats.textContent = "";
  }

  // Final scores
  finalScoreList.innerHTML = "";
  const sortedPlayers = Object.values(allPlayers).sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths
  );

  sortedPlayers.forEach((p, i) => {
    const char = CHARACTERS[p.character];
    const medal = i === 0 ? "1" : i === 1 ? "2" : i === 2 ? "3" : "";
    const displayName = p.name || char.name;
    const row = document.createElement("div");
    row.className = "score-row";
    row.style.color = p.lives > 0 ? p.color || char.color : "#888";
    row.innerHTML = `
            <span>${medal} ${displayName}</span>
            <span></span>
          `;
    finalScoreList.appendChild(row);
  });
}

function beginGame(data) {
  gameState = "playing";
  waitingScreen.style.display = "none";
  gameEndScreen.classList.remove("visible");
  document.body.classList.remove("start-screen");
  document.body.classList.remove("start-armed");
  document.getElementById("mainContainer").style.display = "flex";

  document.getElementById("mainContainer").classList.add("fullscreen-mode");
  document.getElementById("mainTitle").classList.add("hidden");
  document.getElementById("controls").style.display = "none";

  resizeCanvasToDisplaySize();
  requestAnimationFrame(resizeCanvasToDisplaySize);

  const mapToUse = data.map || currentMap;
  currentMap = mapToUse;
  initEnvironment(mapToUse);

  if (mapAllowsDrops()) {
    startDropSpawning();
  }
  startArenaEvents();
  if (mapAllowsHealingPads()) {
    startHealingPadSpawning();
  }

  audioManager.playBgMusic();

  const spawnPoints = getSpawnPoints();
  data.players.forEach((p, i) => {
    const spawn = spawnPoints[i % spawnPoints.length];
    const char = CHARACTERS[p.character];

    const playerName = p.name || "";
    const playerColor = PLAYER_COLORS[i % PLAYER_COLORS.length];
    players[p.id] = {
      id: p.id,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      r: 20,
      character: p.character,
      name: playerName,
      color: playerColor,
      health: char.stats.health,
      maxHealth: char.stats.health,
      kills: 0,
      deaths: 0,
      lives: MAX_LIVES,
      lastShot: 0,
      lastHitBy: null,
      isRespawning: false,
      abilityCooldown: 0,
      abilityActive: false,
      abilityEndTime: 0,
      pierceNextShot: false,
      dashDirection: { x: 0, y: 0 },
      lastDamageWall: 0,
    };
  });

  updateScoreboard();

  // Create the player list with the new 'dropCollected' field
  const playerList = Object.values(players).map((p) => {
    const pData = {
      id: p.id,
      lives: p.lives,
      health: p.health,
      maxHealth: p.maxHealth,
      abilityCooldown: p.abilityCooldown,
      abilityActive: p.abilityActive,
      dropCollected: p.dropCollected, // Send the flag
    };
    p.dropCollected = null; // Clear it so it doesn't trigger twice
    return pData;
  });
  ws.send(JSON.stringify({ type: "game_update", players: playerList }));
}

function handleServerMessage(data) {
  switch (data.type) {
    case "player_joined":
      playerCountEl.textContent = `${data.totalPlayers} player${
        data.totalPlayers > 1 ? "s" : ""
      } connected`;
      audioManager.play("playerJoined", { volume: 0.5 });
      break;

    case "character_selected":
      readyStatusEl.textContent = `${data.playerId.slice(-4)} selected ${
        data.character
      }`;
      break;

    case "game_start":
      if (startPhase < 2) {
        pendingGameStart = data;
        return;
      }

      beginGame(data);
      break;

    case "player_move":
      if (gameState !== "playing") break;
      if (players[data.playerId]) {
        const char = CHARACTERS[players[data.playerId].character];
        const player = players[data.playerId];
        let speedMod = 1;

        if (player.speedBoostEnd && Date.now() < player.speedBoostEnd)
          speedMod = 2;
        if (player.frozen && player.frozen.canMove === false) speedMod = 0;
        if (
          player.abilityActive &&
          CHARACTERS[player.character].ability.effect === "dash"
        )
          speedMod = 4;

        players[data.playerId].vx =
          -data.ax * char.stats.speed * 0.15 * speedMod;
        players[data.playerId].vy =
          data.ay * char.stats.speed * 0.15 * speedMod;
      }
      break;

    case "player_shoot":
      if (gameState !== "playing") break;
      if (players[data.playerId]) shoot(data.playerId);
      break;

    case "player_ability":
      if (gameState !== "playing") break;
      if (players[data.playerId]) activateAbility(data.playerId);
      break;

    case "player_action":
      if (gameState !== "playing") break;
      const player = players[data.playerId];
      if (!player) break;

      if (data.action === "blow" && player.onFire) {
        delete player.onFire;
        ws.send(
          JSON.stringify({
            type: "player_status",
            playerId: player.id,
            status: "clear",
            message: "Fire extinguished.",
          })
        );
      }

      if (data.action === "shake" && player.frozen) {
        delete player.frozen;
        delete player.blizzardExposure;
        ws.send(
          JSON.stringify({
            type: "player_status",
            playerId: player.id,
            status: "clear",
            message: "Broke free from ice.",
          })
        );
      }
      break;

    case "player_left":
      delete players[data.playerId];
      updateScoreboard();
      break;
  }
}

function activateAbility(playerId) {
  const player = players[playerId];
  if (!player || player.health <= 0) return;

  const char = CHARACTERS[player.character];
  const ability = char.ability;
  const now = Date.now();

  if (now < player.abilityCooldown) return;

  player.abilityCooldown = now + ability.cooldown;

  switch (ability.effect) {
    case "shield":
      player.abilityActive = true;
      player.abilityEndTime = now + ability.duration;
      break;

    case "pierce":
      player.pierceNextShot = true;
      player.abilityActive = true;
      player.abilityEndTime = now + 5000;
      break;

    case "dash":
      player.abilityActive = true;
      player.abilityEndTime = now + ability.duration;
      player.dashDirection = { x: player.vx, y: player.vy };
      break;

    case "heal":
      player.health = Math.min(
        player.maxHealth,
        player.health + player.maxHealth * 0.3
      );
      audioManager.play("collectPowerup", { volume: 0.6 });
      break;

    case "storm": {
      const bulletCount = 18;
      const speed = char.stats.bulletSpeed;
      const angleStep = (Math.PI * 2) / bulletCount;
      for (let i = 0; i < bulletCount; i++) {
        const angle = i * angleStep;
        bullets.push({
          x: player.x + Math.cos(angle) * 30,
          y: player.y + Math.sin(angle) * 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          owner: playerId,
          damage: char.stats.damage,
          color: player.color || char.color,
          pierce: false,
        });
      }
      audioManager.play("laserGunfire", { volume: 0.75 });
      break;
    }
  }

  ws.send(
    JSON.stringify({
      type: "game_update",
      players: [
        {
          id: playerId,
          abilityCooldown: player.abilityCooldown,
          abilityActive: player.abilityActive,
        },
      ],
    })
  );
}

function shoot(playerId) {
  const player = players[playerId];
  if (!player || player.health <= 0) return;

  const char = CHARACTERS[player.character];
  const now = Date.now();

  if (now - player.lastShot < char.stats.fireRate * 1000) return;
  player.lastShot = now;

  let closestEnemy = null;
  let closestDist = Infinity;

  for (const enemy of Object.values(players)) {
    if (
      enemy.id === playerId ||
      enemy.health <= 0 ||
      enemy.lives <= 0 ||
      enemy.isRespawning
    )
      continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < closestDist) {
      closestDist = dist;
      closestEnemy = enemy;
    }
  }

  let dirX, dirY;

  if (closestEnemy) {
    const dx = closestEnemy.x - player.x;
    const dy = closestEnemy.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    dirX = dx / len;
    dirY = dy / len;
  } else if (Math.abs(player.vx) > 0.5 || Math.abs(player.vy) > 0.5) {
    const len = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    dirX = player.vx / len;
    dirY = player.vy / len;
  } else {
    dirX = 1;
    dirY = 0;
  }

  const isPiercing = player.pierceNextShot;
  if (isPiercing) {
    player.pierceNextShot = false;
    player.abilityActive = false;
  }

  const playerColor = player.color || char.color;
  bullets.push({
    x: player.x + dirX * 30,
    y: player.y + dirY * 30,
    vx: dirX * char.stats.bulletSpeed,
    vy: dirY * char.stats.bulletSpeed,
    owner: playerId,
    damage: char.stats.damage,
    color: playerColor,
    pierce: isPiercing,
  });

  audioManager.play("laserGunfire", { volume: 0.4 });
}

function isInZone(player, zone) {
  return (
    player.x > zone.x &&
    player.x < zone.x + zone.w &&
    player.y > zone.y &&
    player.y < zone.y + zone.h
  );
}

function update() {
  if (gameState !== "playing") return;

  const now = Date.now();

  // Update moving obstacles
  movingObstacles.forEach((obs) => {
    // Handle rotating obstacles
    if (obs.isRotating) {
      obs.currentAngle += obs.rotationSpeed;
      const center = obs.rotationCenter;
      obs.x =
        center.x + Math.cos(obs.currentAngle) * obs.rotationRadius - obs.w / 2;
      obs.y =
        center.y + Math.sin(obs.currentAngle) * obs.rotationRadius - obs.h / 2;
      return;
    }

    // Handle phasing obstacles (appear/disappear)
    if (obs.isPhasing) {
      const elapsed = now - obs.lastPhaseTime;
      if (elapsed >= obs.phaseInterval) {
        obs.visible = !obs.visible;
        obs.lastPhaseTime = now;
        if (obs.visible && obs.isCrossfireWall) {
          repositionCrossfireWall(obs);
        }
      }
      return;
    }

    // Normal moving obstacles
    obs.x += obs.vx;
    obs.y += obs.vy;

    // Bounce off boundaries
    if (obs.x <= obs.minX || obs.x >= obs.maxX) obs.vx *= -1;
    if (obs.y <= obs.minY || obs.y >= obs.maxY) obs.vy *= -1;

    // Keep in bounds
    obs.x = Math.max(obs.minX, Math.min(obs.maxX, obs.x));
    obs.y = Math.max(obs.minY, Math.min(obs.maxY, obs.y));
  });

  Object.values(players).forEach((player) => {
    if (player.health <= 0 && player.lives > 0 && !player.isRespawning) {
      player.isRespawning = true;
      player.lives--;
      player.deaths++;

      if (player.lastHitBy && players[player.lastHitBy]) {
        players[player.lastHitBy].kills++;
      }

      updateScoreboard();

      ws.send(
        JSON.stringify({
          type: "game_update",
          players: Object.values(players).map((p) => ({
            id: p.id,
            lives: p.lives,
            health: p.health,
            maxHealth: p.maxHealth,
            kills: p.kills,
            deaths: p.deaths,
          })),
        })
      );

      if (player.lives <= 0) {
        player.isRespawning = false;
        checkGameEnd();
      } else {
        const playerId = player.id;
        setTimeout(() => {
          if (!players[playerId]) return;
          const p = players[playerId];

          const spawnPoints = getSpawnPoints();
          const spawn =
            spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
          p.x = spawn.x;
          p.y = spawn.y;
          p.health = p.maxHealth;
          p.abilityActive = false;
          p.isRespawning = false;
          p.abilityCooldown = Date.now() + 2000;
          p.lastHitBy = null;

          audioManager.play("playerRespawn", { volume: 0.5 });

          ws.send(
            JSON.stringify({
              type: "game_update",
              players: [
                {
                  id: p.id,
                  health: p.health,
                  maxHealth: p.maxHealth,
                  lives: p.lives,
                },
              ],
            })
          );
        }, 3000);
      }
    }

    if (player.health <= 0 || player.lives <= 0) return;

    if (player.abilityActive && now > player.abilityEndTime) {
      player.abilityActive = false;
    }

    const newX = player.x + player.vx;
    const newY = player.y + player.vy;

    let canMoveX = true,
      canMoveY = true;

    // Check static obstacles
    for (const obs of obstacles) {
      if (checkCollision({ x: newX, y: player.y, r: player.r }, obs))
        canMoveX = false;
      if (checkCollision({ x: player.x, y: newY, r: player.r }, obs))
        canMoveY = false;
    }

    // Check moving obstacles (dangerous walls)
    for (const obs of movingObstacles) {
      // Skip invisible phasing walls
      if (obs.isPhasing && !obs.visible) continue;

      if (checkCollision({ x: newX, y: player.y, r: player.r }, obs))
        canMoveX = false;
      if (checkCollision({ x: player.x, y: newY, r: player.r }, obs))
        canMoveY = false;

      // Damage on touch
      if (
        obs.isDangerous &&
        checkCollision({ x: player.x, y: player.y, r: player.r + 5 }, obs)
      ) {
        if (now - player.lastDamageWall > 500) {
          // Damage every 500ms
          player.lastDamageWall = now;
          if (
            !player.abilityActive ||
            CHARACTERS[player.character].ability.effect !== "shield"
          ) {
            player.health -= obs.damageOnTouch;
            ws.send(
              JSON.stringify({
                type: "player_status",
                playerId: player.id,
                status: "damage",
                message: `-${obs.damageOnTouch} HP from wall!`,
              })
            );
          }
        }
      }
    }

    if (canMoveX)
      player.x = Math.max(player.r, Math.min(canvas.width - player.r, newX));
    if (canMoveY)
      player.y = Math.max(player.r, Math.min(canvas.height - player.r, newY));

    player.vx *= 0.92;
    player.vy *= 0.92;

    // Arena events
    if (currentEvent) {
      if (currentEvent.type === "INFERNO") {
        let touchingWall = false;
        for (const obs of obstacles) {
          const closestX = Math.max(obs.x, Math.min(player.x, obs.x + obs.w));
          const closestY = Math.max(obs.y, Math.min(player.y, obs.y + obs.h));
          const dx = player.x - closestX;
          const dy = player.y - closestY;
          if (Math.sqrt(dx * dx + dy * dy) < player.r + 10) {
            touchingWall = true;
            break;
          }
        }

        if (touchingWall && !player.onFire) {
          player.onFire = { startTime: Date.now(), damage: 8 };
          ws.send(
            JSON.stringify({
              type: "player_status",
              playerId: player.id,
              status: "on_fire",
              message: "YOU ARE ON FIRE! BLOW TO EXTINGUISH!",
            })
          );
        }
      }

      if (currentEvent.type === "BLIZZARD") {
        let protectedByWall = false;
        for (const obs of obstacles) {
          if (
            obs.x < player.x &&
            obs.x + obs.w > 0 &&
            obs.y < player.y &&
            obs.y + obs.h > player.y
          ) {
            protectedByWall = true;
            break;
          }
        }

        if (!protectedByWall) {
          if (!player.blizzardExposure) player.blizzardExposure = 0;
          player.blizzardExposure += 1;

          if (player.blizzardExposure > 180 && !player.frozen) {
            player.frozen = { startTime: Date.now(), canMove: false };
            ws.send(
              JSON.stringify({
                type: "player_status",
                playerId: player.id,
                status: "frozen",
                message: "YOU ARE FROZEN! SHAKE TO BREAK FREE!",
              })
            );
          }
        } else if (player.blizzardExposure) {
          player.blizzardExposure = Math.max(0, player.blizzardExposure - 2);
        }

        if (player.frozen && player.frozen.canMove === false) {
          player.vx = 0;
          player.vy = 0;
        }
      }
    }

    if (player.onFire) player.health -= player.onFire.damage / 60;

    // Special zones
    specialZones.forEach((zone) => {
      if (isInZone(player, zone)) {
        if (zone.type === "heal")
          player.health = Math.min(player.maxHealth, player.health + 0.3);
        else if (
          zone.type === "damage" &&
          (!player.abilityActive ||
            CHARACTERS[player.character].ability.effect !== "shield")
        ) {
          player.health -= 0.2;
        }
      }
    });

    // Power-up drops
    activeDrops = activeDrops.filter((drop) => {
      const dx = player.x - drop.x;
      const dy = player.y - drop.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < player.r + drop.radius) {
        // Apply effects locally
        if (drop.effect === "recharge_ability") {
          player.abilityCooldown = 0;
          player.dropCollected = "ABILITY";
        } else if (drop.effect === "speed_boost") {
          player.speedBoostEnd = Date.now() + drop.boostDuration;
        } else if (drop.effect === "heal") {
          player.health = Math.min(
            player.maxHealth,
            player.health + drop.healAmount
          );
        }

        audioManager.play("collectPowerup", { volume: 0.6 });

        // 1. Send Game Update (Stats)
        ws.send(
          JSON.stringify({
            type: "game_update",
            players: [
              {
                id: player.id,
                abilityCooldown: player.abilityCooldown,
                health: player.health,
                dropCollected: drop.type,
                powerUpCollected: drop.type,
                powerUpSuccess: true,
              },
            ],
          })
        );

        // 2. Send Status Update (Controller Trigger)
        if (drop.effect === "recharge_ability") {
          ws.send(
            JSON.stringify({
              type: "status", // <--- CHANGED THIS: Matches controller code
              playerId: player.id,
              status: "ability_ready",
              message: "Ability recharged.",
            })
          );
        }

        return false; // Remove drop
      }

      return Date.now() - drop.spawnTime < drop.duration;
    });
  });

  // Update bullets
  bullets = bullets.filter((bullet) => {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;

    if (
      bullet.x < 0 ||
      bullet.x > canvas.width ||
      bullet.y < 0 ||
      bullet.y > canvas.height
    )
      return false;

    if (!bullet.pierce) {
      for (const obs of [...obstacles, ...movingObstacles]) {
        if (
          bullet.x > obs.x &&
          bullet.x < obs.x + obs.w &&
          bullet.y > obs.y &&
          bullet.y < obs.y + obs.h
        )
          return false;
      }
    }

    for (let player of Object.values(players)) {
      if (
        player.id === bullet.owner ||
        player.health <= 0 ||
        player.isRespawning ||
        player.lives <= 0
      )
        continue;

      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < player.r) {
        if (
          player.abilityActive &&
          (CHARACTERS[player.character].ability.effect === "shield" ||
            CHARACTERS[player.character].ability.effect === "dash")
        )
          return false;

        player.health -= bullet.damage;
        player.lastHitBy = bullet.owner;
        return false;
      }
    }

    return true;
  });

  checkGameEnd();
}

function checkGameEnd() {
  if (gameState !== "playing") return;

  const alivePlayers = Object.values(players).filter((p) => p.lives > 0);
  const totalPlayers = Object.keys(players).length;

  if (totalPlayers > 1 && alivePlayers.length === 1) {
    gameState = "ended";
    const winner = alivePlayers[0];

    audioManager.stopBgMusic();
    showGameEndScreen(winner, players);

    ws.send(
      JSON.stringify({
        type: "game_end",
        winner: winner.id,
        character: winner.character,
        characterName: CHARACTERS[winner.character].name,
        kills: winner.kills,
        deaths: winner.deaths,
      })
    );
  }

  if (totalPlayers > 1 && alivePlayers.length === 0) {
    gameState = "ended";

    audioManager.stopBgMusic();
    showGameEndScreen(null, players);

    ws.send(
      JSON.stringify({
        type: "game_end",
        winner: null,
        isDraw: true,
      })
    );
  }
}

function checkCollision(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function draw() {
  const map = MAPS[currentMap];

  // Clear and draw background
  ctx.fillStyle = map.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = map.gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i < canvas.height; i += 50) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(canvas.width, i);
    ctx.stroke();
  }

  // Special zones
  specialZones.forEach((zone) => {
    ctx.fillStyle = zone.color + "30";
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.setLineDash([]);
    ctx.font = "bold 24px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = zone.color;
    const icon =
      zone.type === "speed"
        ? "⚡"
        : zone.type === "damage"
        ? "☠️"
        : zone.type === "heal"
        ? "💚"
        : "🌀";
    ctx.fillText(icon, zone.x + zone.w / 2, zone.y + zone.h / 2);
  });

  // Static obstacles
  obstacles.forEach((obs) => {
    ctx.fillStyle = obs.color;
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

    if (currentEvent && currentEvent.type === "INFERNO") {
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = "#546E7A";
      ctx.lineWidth = 2;
    }
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
  });

  // Moving obstacles (dangerous walls)
  movingObstacles.forEach((obs) => {
    // Skip invisible phasing walls
    if (obs.isPhasing && !obs.visible) return;

    // Apply transparency to phasing walls based on time
    let alpha = 1;
    if (obs.isPhasing) {
      const elapsed = Date.now() - obs.lastPhaseTime;
      const progress = elapsed / obs.phaseInterval;
      // Fade in/out effect
      if (obs.visible) {
        alpha =
          progress < 0.2
            ? progress / 0.2
            : progress > 0.8
            ? (1 - progress) / 0.2
            : 1;
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow effect
    ctx.shadowColor = obs.glowColor;
    ctx.shadowBlur = 15;
    ctx.fillStyle = obs.color;
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    ctx.shadowBlur = 0;

    // Danger stripes
    ctx.strokeStyle = obs.glowColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

    // Warning pattern
    ctx.fillStyle = obs.glowColor + "60";
    const stripeWidth = 10;
    ctx.save();
    ctx.beginPath();
    ctx.rect(obs.x, obs.y, obs.w, obs.h);
    ctx.clip();
    for (let i = -obs.w; i < obs.w + obs.h; i += stripeWidth * 2) {
      ctx.beginPath();
      ctx.moveTo(obs.x + i, obs.y);
      ctx.lineTo(obs.x + i + obs.h, obs.y + obs.h);
      ctx.lineTo(obs.x + i + obs.h + stripeWidth, obs.y + obs.h);
      ctx.lineTo(obs.x + i + stripeWidth, obs.y);
      ctx.fill();
    }
    ctx.restore();

    // Danger icon (not for phasing walls)
    if (!obs.isPhasing) {
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 16px "Segoe UI"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", obs.x + obs.w / 2, obs.y + obs.h / 2);
    }

    ctx.restore(); // Restore global alpha
  });

  // Power-up drops
  activeDrops.forEach((drop) => {
    const age = Date.now() - drop.spawnTime;
    const pulse = 1 + Math.sin(age / 200) * 0.2;
    const alpha =
      age > drop.duration - 2000 ? Math.sin(age / 100) * 0.5 + 0.5 : 1;

    ctx.globalAlpha = alpha;
    ctx.shadowColor = drop.color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = drop.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = drop.color + "60";
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.radius * pulse * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 20px "Segoe UI"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(drop.icon, drop.x, drop.y);

    ctx.globalAlpha = 1;
  });
  ctx.shadowBlur = 0;

  // Bullets
  bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.color;
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = bullet.pierce ? 25 : 15;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.pierce ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();

    if (bullet.pierce) {
      ctx.strokeStyle = bullet.color + "60";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 3, bullet.y - bullet.vy * 3);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
  });
  ctx.shadowBlur = 0;

  // Arena events overlay
  if (currentEvent) {
    ctx.fillStyle = currentEvent.backgroundTint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentEvent.type === "INFERNO") {
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * canvas.width;
        const y = canvas.height - ((Date.now() / 10 + i * 50) % canvas.height);
        ctx.fillStyle = `rgba(255, ${100 + Math.random() * 100}, 0, 0.6)`;
        ctx.beginPath();
        ctx.arc(x, y, 5 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // NEW CODE
    if (currentEvent.type === "BLIZZARD") {
      // 1. Initialize particles array if needed
      if (!currentEvent.particles) currentEvent.particles = [];

      // 2. Spawn new particles (up to limit)
      // We spawn them from all 4 sides randomly
      if (currentEvent.particles.length < 150) {
        const side = Math.floor(Math.random() * 4); // 0:Top, 1:Right, 2:Bottom, 3:Left
        let p = { x: 0, y: 0, vx: 0, vy: 0, life: 100 + Math.random() * 50 };
        const speed = 2 + Math.random() * 3;

        // Pick start position based on side
        switch (side) {
          case 0: // Top
            p.x = Math.random() * canvas.width;
            p.y = -10;
            break;
          case 1: // Right
            p.x = canvas.width + 10;
            p.y = Math.random() * canvas.height;
            break;
          case 2: // Bottom
            p.x = Math.random() * canvas.width;
            p.y = canvas.height + 10;
            break;
          case 3: // Left
            p.x = -10;
            p.y = Math.random() * canvas.height;
            break;
        }

        // Calculate velocity towards center (Battle Arena feel)
        const angle = Math.atan2(
          canvas.height / 2 - p.y,
          canvas.width / 2 - p.x
        );
        // Add some randomness to angle so they don't all meet perfectly in the middle
        p.vx = Math.cos(angle + (Math.random() - 0.5)) * speed;
        p.vy = Math.sin(angle + (Math.random() - 0.5)) * speed;

        currentEvent.particles.push(p);
      }

      // 3. Update and Draw
      ctx.fillStyle = currentEvent.particleColor;
      for (let i = currentEvent.particles.length - 1; i >= 0; i--) {
        let p = currentEvent.particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        // Draw
        ctx.globalAlpha = Math.max(0, p.life / 50); // Fade out
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.globalAlpha = 1.0;

        // Remove dead particles
        if (p.life <= 0) currentEvent.particles.splice(i, 1);
      }
    }

    if (currentEvent.type === "GRAVITY_CHAOS") {
      ctx.strokeStyle = currentEvent.gridColor;
      ctx.lineWidth = 2;
      const waveOffset = Math.sin(Date.now() / 200) * 20;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i + waveOffset, 0);
        ctx.lineTo(i - waveOffset, canvas.height);
        ctx.stroke();
      }
    }
  }

  // Players
  Object.values(players).forEach((player) => {
    if (player.lives <= 0) {
      ctx.fillStyle = "#666";
      ctx.font = "bold 40px 'Segoe UI'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("X", player.x, player.y);
      return;
    }

    if (player.health <= 0) {
      return;
    }

    const char = CHARACTERS[player.character];
    const ability = char.ability;
    const playerColor = player.color || char.color;

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(
      player.x,
      player.y + player.r + 5,
      player.r,
      player.r * 0.3,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Shield effect
    if (player.abilityActive && ability.effect === "shield") {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Dash trail
    if (player.abilityActive && ability.effect === "dash") {
      ctx.fillStyle = playerColor + "40";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(
          player.x - player.vx * i * 5,
          player.y - player.vy * i * 5,
          player.r * (1 - i * 0.2),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Pierce indicator
    if (player.pierceNextShot) {
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Fire effect
    if (player.onFire) {
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = player.r + Math.random() * 10;
        ctx.fillStyle = `rgba(255, ${100 + Math.random() * 100}, 0, ${
          0.5 + Math.random() * 0.5
        })`;
        ctx.beginPath();
        ctx.arc(
          player.x + Math.cos(angle) * dist,
          player.y + Math.sin(angle) * dist - Math.random() * 20,
          3 + Math.random() * 4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Frozen effect
    if (player.frozen) {
      ctx.strokeStyle = "#00BFFF";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#00BFFF";
      ctx.shadowBlur = 15;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(
          player.x + Math.cos(angle) * (player.r + 10),
          player.y + Math.sin(angle) * (player.r + 10)
        );
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Player shape
    ctx.fillStyle = playerColor;
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 20;
    ctx.beginPath();

    const r = player.r,
      x = player.x,
      y = player.y;

    if (player.character === "TANK") {
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = x + r * Math.cos(angle),
          py = y + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (player.character === "SNIPER") {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.9, y + r * 0.7);
      ctx.lineTo(x - r * 0.9, y + r * 0.7);
      ctx.closePath();
    } else if (player.character === "RUNNER") {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (player.character === "BALANCED") {
      for (let i = 0; i < 5; i++) {
        const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
        const px = x + r * Math.cos(angle),
          py = y + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (player.character === "ASSAULT") {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.shadowBlur = 0; // Reset shadow

    // Health bar
    const barWidth = 50,
      barHeight = 6;
    const healthPercent = player.health / player.maxHealth;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(
      player.x - barWidth / 2,
      player.y - player.r - 15,
      barWidth,
      barHeight
    );

    ctx.fillStyle =
      healthPercent > 0.6
        ? "#4CAF50"
        : healthPercent > 0.3
        ? "#FFC107"
        : "#F44336";
    ctx.fillRect(
      player.x - barWidth / 2,
      player.y - player.r - 15,
      barWidth * healthPercent,
      barHeight
    );

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      player.x - barWidth / 2,
      player.y - player.r - 15,
      barWidth,
      barHeight
    );

    // Lives
    ctx.fillStyle = "#ff4444";
    const dotRadius = 7;
    const dotSpacing = 18;
    const totalWidth = (player.lives - 1) * dotSpacing;
    for (let i = 0; i < player.lives; i++) {
      const dotX = player.x - totalWidth / 2 + i * dotSpacing;
      const dotY = player.y - player.r - 30;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name
    ctx.fillStyle = playerColor;
    ctx.font = "bold 12px 'Segoe UI'";
    ctx.textBaseline = "bottom";
    const displayName = player.name || char.name;
    ctx.fillText(displayName, player.x, player.y - player.r - 42);

    // Ability cooldown
    const cooldownRemaining = Math.max(0, player.abilityCooldown - Date.now());
    if (cooldownRemaining > 0) {
      const cooldownPercent = cooldownRemaining / ability.cooldown;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(
        player.x,
        player.y,
        player.r,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * cooldownPercent
      );
      ctx.closePath();
      ctx.fill();
    }
  });
}

function loop() {
  update();
  draw();
  gameLoopId = requestAnimationFrame(loop);
}

loop();
