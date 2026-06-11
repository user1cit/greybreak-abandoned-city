"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  healthBar: document.getElementById("healthBar"),
  hungerBar: document.getElementById("hungerBar"),
  staminaBar: document.getElementById("staminaBar"),
  healthText: document.getElementById("healthText"),
  hungerText: document.getElementById("hungerText"),
  staminaText: document.getElementById("staminaText"),
  quests: document.getElementById("quests"),
  inventory: document.getElementById("inventory"),
  weapon: document.getElementById("weapon"),
  prompt: document.getElementById("prompt"),
  log: document.getElementById("messageLog"),
  settingsButton: document.getElementById("settingsButton"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  mouseSensitivityInput: document.getElementById("mouseSensitivity"),
  mouseSensitivityValue: document.getElementById("mouseSensitivityValue"),
  soundEnabled: document.getElementById("soundEnabled"),
  showHud: document.getElementById("showHud"),
  controlsList: document.getElementById("controlsList"),
  resetSettingsButton: document.getElementById("resetSettingsButton"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  startOverlay: document.getElementById("startOverlay"),
  startButton: document.getElementById("startButton"),
  endOverlay: document.getElementById("endOverlay"),
  endTitle: document.getElementById("endTitle"),
  endText: document.getElementById("endText"),
  restartButton: document.getElementById("restartButton")
};

const TAU = Math.PI * 2;
const FOV = Math.PI / 3;
const MAP_W = 30;
const MAP_H = 24;
const TILE = 1;
const MAX_VIEW = 22;
const DPR_CAP = 2;

const weapons = {
  pipe: {
    label: "Iron pipe",
    ammo: null,
    damage: [14, 22],
    range: 1.55,
    cooldown: 430,
    spread: 0.12,
    color: "#9ea49e"
  },
  pistol: {
    label: "Service pistol",
    ammo: "bullets",
    damage: [26, 38],
    range: 10,
    cooldown: 310,
    spread: 0.055,
    color: "#d3c7a4"
  },
  shotgun: {
    label: "Street sweeper",
    ammo: "shells",
    damage: [54, 74],
    range: 7.5,
    cooldown: 760,
    spread: 0.16,
    color: "#d77f55"
  }
};

const itemInfo = {
  food: { label: "Food", plural: "food", color: "#e6b85a" },
  water: { label: "Water", plural: "water", color: "#6ebad1" },
  aid: { label: "Aid", plural: "aid", color: "#e76d6d" },
  bullets: { label: "Bullets", plural: "bullets", color: "#cfc28b" },
  shells: { label: "Shells", plural: "shells", color: "#da8659" },
  battery: { label: "Battery", plural: "batteries", color: "#89c66f" },
  keycard: { label: "Transit key", plural: "transit keys", color: "#c891e8" },
  pistol: { label: "Pistol", plural: "pistols", color: "#d3c7a4" },
  shotgun: { label: "Shotgun", plural: "shotguns", color: "#d77f55" }
};

let map = [];
let entities = [];
let zBuffer = [];
let logicalWidth = 1;
let logicalHeight = 1;
let renderScale = 1;
let lastFrame = performance.now();
let audioContext = null;
let nextEntityId = 1;

const keys = new Set();
const mouse = {
  locked: false,
  sensitivity: 0.0022
};

const SETTINGS_KEY = "greybreak.settings.v1";
const controlMeta = [
  ["forward", "Move forward"],
  ["backward", "Move backward"],
  ["strafeLeft", "Strafe left"],
  ["strafeRight", "Strafe right"],
  ["turnLeft", "Turn left"],
  ["turnRight", "Turn right"],
  ["run", "Run"],
  ["interact", "Interact"],
  ["fire", "Fire"],
  ["useFood", "Use food"],
  ["useWater", "Use water"],
  ["useAid", "Use aid"],
  ["equipPipe", "Equip pipe"],
  ["equipPistol", "Equip pistol"],
  ["equipShotgun", "Equip shotgun"],
  ["settings", "Settings"]
];
const defaultSettings = {
  mouseSensitivity: 1,
  sound: true,
  showHud: true,
  controls: {
    forward: ["KeyW", "ArrowUp"],
    backward: ["KeyS", "ArrowDown"],
    strafeLeft: ["KeyA"],
    strafeRight: ["KeyD"],
    turnLeft: ["ArrowLeft"],
    turnRight: ["ArrowRight"],
    run: ["ShiftLeft", "ShiftRight"],
    interact: ["KeyE"],
    fire: ["Space"],
    useFood: ["Digit1"],
    useWater: ["Digit2"],
    useAid: ["Digit3"],
    equipPipe: ["Digit4"],
    equipPistol: ["Digit5"],
    equipShotgun: ["Digit6"],
    settings: ["Escape"]
  }
};
let settings = cloneSettings(defaultSettings);
let listeningForControl = null;

const player = {
  x: 4.5,
  y: 20.5,
  dir: 0,
  health: 100,
  hunger: 100,
  stamina: 100,
  radius: 0.2,
  inventory: {
    food: 1,
    water: 1,
    aid: 0,
    bullets: 10,
    shells: 0,
    battery: 0,
    keycard: 0
  },
  weapons: {
    pipe: true,
    pistol: false,
    shotgun: false
  },
  weapon: "pipe",
  lastShot: -9999,
  hurtPulse: 0,
  muzzle: 0
};

const flags = {
  started: false,
  gameOver: false,
  won: false,
  foodFound: false,
  waterFound: false,
  maraTalked: false,
  aidFound: false,
  batteryFound: false,
  relayPowered: false,
  tramOpen: false,
  exitReached: false,
  introLogged: false
};

const render = {
  horizonBob: 0,
  time: 0,
  weaponKick: 0,
  shake: 0
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function choice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyLabel(code) {
  const labels = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Space: "Space",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    Escape: "Esc"
  };
  if (labels[code]) return labels[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!stored || typeof stored !== "object") return cloneSettings(defaultSettings);
    const merged = cloneSettings(defaultSettings);
    if (Number.isFinite(stored.mouseSensitivity)) {
      merged.mouseSensitivity = clamp(stored.mouseSensitivity, 0.5, 2);
    }
    if (typeof stored.sound === "boolean") merged.sound = stored.sound;
    if (typeof stored.showHud === "boolean") merged.showHud = stored.showHud;
    if (stored.controls && typeof stored.controls === "object") {
      controlMeta.forEach(([action]) => {
        const value = stored.controls[action];
        if (Array.isArray(value) && value.every((code) => typeof code === "string")) {
          merged.controls[action] = value.length ? value.slice(0, 2) : defaultSettings.controls[action].slice();
        }
      });
    }
    return merged;
  } catch (error) {
    return cloneSettings(defaultSettings);
  }
}

function saveSettings(showMessage = false) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (showMessage) addMessage("Settings saved.");
  } catch (error) {
    if (showMessage) addMessage("Settings could not be saved in this browser.");
  }
}

function actionPressed(action) {
  return settings.controls[action].some((code) => keys.has(code));
}

function actionMatches(event, action) {
  return settings.controls[action].includes(event.code);
}

function applySettings() {
  mouse.sensitivity = 0.0022 * settings.mouseSensitivity;
  document.getElementById("shell").classList.toggle("hud-hidden", !settings.showHud);
  ui.mouseSensitivityInput.value = String(settings.mouseSensitivity);
  ui.mouseSensitivityValue.textContent = `${settings.mouseSensitivity.toFixed(1)}x`;
  ui.soundEnabled.checked = settings.sound;
  ui.showHud.checked = settings.showHud;
}

function renderSettingsControls() {
  ui.controlsList.textContent = "";
  controlMeta.forEach(([action, label]) => {
    const row = document.createElement("div");
    row.className = "control-row";
    const name = document.createElement("div");
    name.className = "control-label";
    name.textContent = label;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.dataset.action = action;
    button.textContent = listeningForControl === action ?
      "Press a key..." :
      settings.controls[action].map(keyLabel).join(" / ");
    if (listeningForControl === action) button.classList.add("listening");
    button.addEventListener("click", () => {
      listeningForControl = action;
      renderSettingsControls();
    });
    row.append(name, button);
    ui.controlsList.appendChild(row);
  });
}

function openSettings() {
  listeningForControl = null;
  keys.clear();
  ui.settingsOverlay.classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
  applySettings();
  renderSettingsControls();
}

function closeSettings() {
  listeningForControl = null;
  ui.settingsOverlay.classList.add("hidden");
  renderSettingsControls();
}

function normalizeAngle(angle) {
  angle %= TAU;
  if (angle < -Math.PI) angle += TAU;
  if (angle > Math.PI) angle -= TAU;
  return angle;
}

function distance(a, b, c, d) {
  return Math.hypot(a - c, b - d);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  logicalWidth = Math.max(320, Math.floor(window.innerWidth));
  logicalHeight = Math.max(240, Math.floor(window.innerHeight));
  canvas.width = Math.floor(logicalWidth * dpr);
  canvas.height = Math.floor(logicalHeight * dpr);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderScale = Math.max(1, Math.floor(logicalWidth / 520));
}

function setCell(x, y, value) {
  if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
    map[y][x] = value;
  }
}

function getCell(x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return "#";
  return map[ty][tx];
}

function isSolidCell(cell) {
  return cell === "#" || cell === "D" || cell === "L";
}

function isSolidAt(x, y) {
  return isSolidCell(getCell(x, y));
}

function rectWalls(x, y, w, h) {
  for (let ix = x; ix < x + w; ix += 1) {
    setCell(ix, y, "#");
    setCell(ix, y + h - 1, "#");
  }
  for (let iy = y; iy < y + h; iy += 1) {
    setCell(x, iy, "#");
    setCell(x + w - 1, iy, "#");
  }
}

function lineWall(x1, y1, x2, y2) {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  setCell(x, y, "#");
  while (x !== x2 || y !== y2) {
    if (x !== x2) x += dx;
    if (y !== y2) y += dy;
    setCell(x, y, "#");
  }
}

function makeMap() {
  map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => "."));
  for (let x = 0; x < MAP_W; x += 1) {
    setCell(x, 0, "#");
    setCell(x, MAP_H - 1, "#");
  }
  for (let y = 0; y < MAP_H; y += 1) {
    setCell(0, y, "#");
    setCell(MAP_W - 1, y, "#");
  }

  rectWalls(2, 2, 9, 7);
  setCell(6, 8, "D");
  setCell(10, 5, "D");

  rectWalls(13, 2, 8, 7);
  setCell(16, 8, "D");

  rectWalls(22, 2, 6, 7);
  setCell(24, 8, "D");

  rectWalls(2, 11, 9, 5);
  setCell(10, 13, "D");
  setCell(5, 11, "D");

  rectWalls(13, 12, 8, 7);
  setCell(17, 12, "D");
  setCell(20, 15, "D");

  rectWalls(22, 14, 7, 8);
  setCell(22, 17, "L");

  rectWalls(2, 18, 8, 5);
  setCell(9, 20, "D");

  lineWall(12, 9, 12, 14);
  setCell(12, 11, ".");
  lineWall(4, 10, 9, 10);
  setCell(7, 10, ".");
  lineWall(15, 10, 20, 10);
  setCell(18, 10, ".");
  lineWall(21, 9, 21, 13);
  setCell(21, 11, ".");
  lineWall(11, 20, 18, 20);
  setCell(14, 20, ".");
  setCell(15, 20, ".");
}

function makeEntity(type, x, y, data = {}) {
  const entity = {
    id: `e${nextEntityId++}`,
    type,
    x,
    y,
    z: 0,
    size: 0.8,
    alive: true,
    active: true,
    bob: Math.random() * TAU,
    ...data
  };
  entities.push(entity);
  return entity;
}

function makeEntities() {
  entities = [];
  nextEntityId = 1;

  makeEntity("npc", 6.5, 20.4, {
    name: "Mara",
    size: 0.9,
    dialogIndex: 0
  });

  makeEntity("item", 3.5, 20.3, { item: "food", amount: 1, name: "sealed beans", size: 0.45 });
  makeEntity("item", 4.5, 19.35, { item: "water", amount: 1, name: "rainwater bottle", size: 0.45 });
  makeEntity("item", 7.8, 19.4, { item: "bullets", amount: 8, name: "loose rounds", size: 0.42 });

  makeEntity("item", 4.4, 5.6, { item: "food", amount: 2, name: "market rations", size: 0.48 });
  makeEntity("item", 8.2, 3.7, { item: "water", amount: 2, name: "water crate", size: 0.5 });
  makeEntity("item", 9.2, 6.5, { item: "pistol", amount: 1, name: "service pistol", size: 0.5 });
  makeEntity("item", 15.2, 5.6, { item: "aid", amount: 1, name: "clinic aid kit", quest: "aid", size: 0.55 });
  makeEntity("item", 18.4, 6.2, { item: "aid", amount: 1, name: "field dressing", size: 0.48 });
  makeEntity("item", 15.5, 15.6, { item: "battery", amount: 1, name: "tram battery", quest: "battery", size: 0.62 });
  makeEntity("item", 18.2, 14.4, { item: "shotgun", amount: 1, name: "street sweeper", size: 0.58 });
  makeEntity("item", 18.8, 16.5, { item: "shells", amount: 6, name: "shell pouch", size: 0.45 });
  makeEntity("item", 5.6, 13.2, { item: "water", amount: 1, name: "canteen", size: 0.44 });
  makeEntity("item", 8.2, 14.1, { item: "bullets", amount: 12, name: "ammo tin", size: 0.45 });

  makeEntity("relay", 24.8, 4.6, { name: "radio relay", size: 1.1 });
  makeEntity("exit", 26.2, 18.1, { name: "tram tunnel", size: 1 });

  [
    [12.7, 6.6],
    [14.5, 10.8],
    [20.5, 11.5],
    [11.2, 17.6],
    [24.4, 12.1],
    [18.4, 21.2],
    [3.8, 12.3],
    [26.1, 7.2]
  ].forEach(([x, y], index) => {
    makeEntity("enemy", x, y, {
      name: index % 3 === 0 ? "Ash drifter" : "Glass-eyed raider",
      size: index % 3 === 0 ? 0.9 : 0.82,
      health: index % 3 === 0 ? 58 : 46,
      maxHealth: index % 3 === 0 ? 58 : 46,
      speed: index % 3 === 0 ? 1.15 : 1.38,
      damage: index % 3 === 0 ? 12 : 9,
      cooldown: 0,
      notice: 0,
      wanderAngle: rand(-Math.PI, Math.PI),
      stun: 0
    });
  });
}

function resetGame() {
  makeMap();
  makeEntities();
  keys.clear();
  Object.assign(player, {
    x: 4.5,
    y: 20.5,
    dir: 0,
    health: 100,
    hunger: 100,
    stamina: 100,
    inventory: {
      food: 1,
      water: 1,
      aid: 0,
      bullets: 10,
      shells: 0,
      battery: 0,
      keycard: 0
    },
    weapons: {
      pipe: true,
      pistol: false,
      shotgun: false
    },
    weapon: "pipe",
    lastShot: -9999,
    hurtPulse: 0,
    muzzle: 0
  });
  Object.assign(flags, {
    started: false,
    gameOver: false,
    won: false,
    foodFound: false,
    waterFound: false,
    maraTalked: false,
    aidFound: false,
    batteryFound: false,
    relayPowered: false,
    tramOpen: false,
    exitReached: false,
    introLogged: false
  });
  ui.endOverlay.classList.add("hidden");
  ui.startOverlay.classList.remove("hidden");
  clearMessages();
  updateQuestFlags();
  updateHud();
}

function ensureAudio() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
}

function blip(frequency, duration = 0.06, gain = 0.035, type = "square") {
  if (!audioContext || flags.gameOver || !settings.sound) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const amp = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function addMessage(text, kind = "info") {
  const line = document.createElement("div");
  line.className = `message ${kind}`;
  line.textContent = text;
  ui.log.prepend(line);
  while (ui.log.children.length > 4) {
    ui.log.lastChild.remove();
  }
  window.setTimeout(() => {
    line.style.opacity = "0";
    line.style.transform = "translateY(8px)";
  }, 4300);
  window.setTimeout(() => line.remove(), 5200);
}

function clearMessages() {
  ui.log.textContent = "";
}

function inventoryCount(item) {
  return player.inventory[item] || 0;
}

function addInventory(item, amount = 1) {
  if (item === "pistol") {
    player.weapons.pistol = true;
    player.weapon = "pistol";
    player.inventory.bullets += 8;
    addMessage("Service pistol acquired. Eight rounds tucked into the grip.");
    blip(360, 0.08, 0.04, "triangle");
    return;
  }
  if (item === "shotgun") {
    player.weapons.shotgun = true;
    player.weapon = "shotgun";
    addMessage("Street sweeper acquired. It is loud, ugly, and useful.");
    blip(260, 0.1, 0.045, "triangle");
    return;
  }
  player.inventory[item] = inventoryCount(item) + amount;
  const info = itemInfo[item] || { label: item };
  addMessage(`${info.label} +${amount}`);
  blip(440, 0.055, 0.03, "sine");
}

function useItem(item) {
  if (!flags.started || flags.gameOver) return;
  ensureAudio();
  if (inventoryCount(item) <= 0) {
    addMessage(`No ${itemInfo[item].plural} left.`);
    return;
  }

  if (item === "food") {
    player.inventory.food -= 1;
    player.hunger = clamp(player.hunger + 34, 0, 100);
    player.health = clamp(player.health + 3, 0, 100);
    addMessage("Food steadies your hands.");
    blip(520, 0.07, 0.035, "sine");
  } else if (item === "water") {
    player.inventory.water -= 1;
    player.stamina = clamp(player.stamina + 42, 0, 100);
    player.hunger = clamp(player.hunger + 6, 0, 100);
    addMessage("Water cuts through the dust.");
    blip(620, 0.075, 0.03, "sine");
  } else if (item === "aid") {
    player.inventory.aid -= 1;
    player.health = clamp(player.health + 42, 0, 100);
    addMessage("Bandages and antiseptic buy you another chance.");
    blip(700, 0.08, 0.035, "triangle");
  }
  updateHud();
}

function equipWeapon(weapon) {
  if (!player.weapons[weapon]) return;
  player.weapon = weapon;
  addMessage(`${weapons[weapon].label} ready.`);
  updateHud();
}

function updateQuestFlags() {
  flags.foodFound = flags.foodFound || inventoryCount("food") > 1;
  flags.waterFound = flags.waterFound || inventoryCount("water") > 1;
  flags.aidFound = flags.aidFound || inventoryCount("aid") > 0;
  flags.batteryFound = flags.batteryFound || inventoryCount("battery") > 0 || flags.relayPowered;
}

function questList() {
  const supplyDone = flags.foodFound && flags.waterFound;
  return [
    {
      title: "Secure supplies",
      text: supplyDone ? "Food and water are packed." : "Gather food and water before crossing the city.",
      done: supplyDone
    },
    {
      title: "Mara's transit key",
      text: flags.maraTalked ? "Mara handed over the tram key." : "Find Mara in the safehouse and hear the city plan.",
      done: flags.maraTalked
    },
    {
      title: "Clinic cache",
      text: flags.aidFound ? "Clinic aid recovered." : "Search the green clinic for an aid kit.",
      done: flags.aidFound
    },
    {
      title: "Power the relay",
      text: flags.relayPowered ? "The radio relay is alive." : "Carry the depot battery to the north radio room.",
      done: flags.relayPowered
    },
    {
      title: "Dead tram line",
      text: flags.exitReached ? "You reached the tram tunnel." : "Open the station gate after the relay is powered.",
      done: flags.exitReached
    }
  ];
}

function updateHud() {
  updateQuestFlags();
  ui.healthBar.style.width = `${clamp(player.health, 0, 100)}%`;
  ui.hungerBar.style.width = `${clamp(player.hunger, 0, 100)}%`;
  ui.staminaBar.style.width = `${clamp(player.stamina, 0, 100)}%`;
  ui.healthText.textContent = Math.ceil(clamp(player.health, 0, 100));
  ui.hungerText.textContent = Math.ceil(clamp(player.hunger, 0, 100));
  ui.staminaText.textContent = Math.ceil(clamp(player.stamina, 0, 100));

  const activeWeapon = weapons[player.weapon];
  const ammoText = activeWeapon.ammo ? `${inventoryCount(activeWeapon.ammo)} ${activeWeapon.ammo}` : "no ammo";
  ui.weapon.textContent = `${activeWeapon.label} / ${ammoText}`;

  ui.quests.textContent = "";
  questList().forEach((quest) => {
    const node = document.createElement("div");
    node.className = quest.done ? "quest complete" : "quest";
    node.innerHTML = `<div class="quest-title">${quest.done ? "Done" : "Open"}: ${quest.title}</div><div class="quest-text">${quest.text}</div>`;
    ui.quests.appendChild(node);
  });

  ui.inventory.textContent = "";
  [
    ["food", "Food"],
    ["water", "Water"],
    ["aid", "Aid"]
  ].forEach(([item, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${label} ${inventoryCount(item)}`;
    button.addEventListener("click", () => useItem(item));
    ui.inventory.appendChild(button);
  });
  [
    ["pipe", "Pipe"],
    ["pistol", "Pistol"],
    ["shotgun", "Shotgun"]
  ].forEach(([weapon, label]) => {
    if (!player.weapons[weapon]) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = player.weapon === weapon ? `${label} *` : label;
    button.addEventListener("click", () => equipWeapon(weapon));
    ui.inventory.appendChild(button);
  });
}

function canOccupy(x, y) {
  const r = player.radius;
  return !isSolidAt(x - r, y - r) &&
    !isSolidAt(x + r, y - r) &&
    !isSolidAt(x - r, y + r) &&
    !isSolidAt(x + r, y + r);
}

function movePlayer(dx, dy) {
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (canOccupy(nx, player.y)) player.x = nx;
  if (canOccupy(player.x, ny)) player.y = ny;
}

function castRay(angle, maxDistance = MAX_VIEW) {
  const rayDirX = Math.cos(angle);
  const rayDirY = Math.sin(angle);
  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);

  const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
  const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));
  let stepX;
  let stepY;
  let sideDistX;
  let sideDistY;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (player.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - player.x) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (player.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - player.y) * deltaDistY;
  }

  let hit = false;
  let side = 0;
  let distanceTravelled = 0;
  let cell = ".";

  while (!hit && distanceTravelled < maxDistance) {
    if (sideDistX < sideDistY) {
      distanceTravelled = sideDistX;
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      distanceTravelled = sideDistY;
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    cell = mapY < 0 || mapY >= MAP_H || mapX < 0 || mapX >= MAP_W ? "#" : map[mapY][mapX];
    hit = isSolidCell(cell);
  }

  const rawDistance = Math.max(0.0001, distanceTravelled);
  const hitX = player.x + rayDirX * rawDistance;
  const hitY = player.y + rayDirY * rawDistance;
  const texture = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
  return {
    hit,
    distance: rawDistance,
    corrected: rawDistance * Math.cos(normalizeAngle(angle - player.dir)),
    side,
    cell,
    mapX,
    mapY,
    hitX,
    hitY,
    texture
  };
}

function lineOfSightTo(x, y) {
  const angle = Math.atan2(y - player.y, x - player.x);
  const dist = distance(player.x, player.y, x, y);
  const ray = castRay(angle, dist + 0.2);
  return !ray.hit || ray.distance > dist - 0.2;
}

function colorForWall(cell, mapX, mapY, side, texture) {
  let base;
  if (cell === "D") base = [124, 91, 58];
  else if (cell === "L") base = [170, 78, 53];
  else if (mapX >= 13 && mapX <= 20 && mapY <= 8) base = [78, 116, 103];
  else if (mapX >= 22 && mapY <= 9) base = [101, 106, 93];
  else if (mapX >= 13 && mapX <= 20 && mapY >= 12 && mapY <= 18) base = [86, 81, 101];
  else if (mapX >= 22 && mapY >= 14) base = [121, 95, 63];
  else if (mapX <= 11 && mapY <= 9) base = [111, 65, 59];
  else base = [84, 89, 88];

  const stripe = texture > 0.47 && texture < 0.53 ? 18 : 0;
  const shade = side ? 0.72 : 0.95;
  return `rgb(${Math.floor((base[0] + stripe) * shade)}, ${Math.floor((base[1] + stripe) * shade)}, ${Math.floor((base[2] + stripe) * shade)})`;
}

function drawSkyAndFloor(horizon) {
  const w = logicalWidth;
  const h = logicalHeight;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#17191c");
  sky.addColorStop(0.55, "#353433");
  sky.addColorStop(1, "#4d4038");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  ctx.fillStyle = "rgba(227, 187, 88, 0.08)";
  for (let i = 0; i < 9; i += 1) {
    const y = horizon * (0.16 + i * 0.085) + Math.sin(render.time * 0.2 + i) * 2;
    ctx.fillRect(0, y, w, 1);
  }

  const floor = ctx.createLinearGradient(0, horizon, 0, h);
  floor.addColorStop(0, "#3b3832");
  floor.addColorStop(0.55, "#242628");
  floor.addColorStop(1, "#111313");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.fillStyle = "rgba(227, 187, 88, 0.18)";
  const center = w / 2 + Math.sin(player.dir) * 20;
  for (let y = horizon + 30; y < h; y += 46) {
    const width = (y - horizon) * 0.38;
    ctx.fillRect(center - width / 2, y, width, 2);
  }
}

function renderWorld() {
  const w = logicalWidth;
  const h = logicalHeight;
  const horizon = h * 0.48 + render.horizonBob + Math.sin(render.time * 7) * render.shake;
  const screenDist = (w / 2) / Math.tan(FOV / 2);
  const colWidth = renderScale;
  zBuffer = [];

  drawSkyAndFloor(horizon);

  for (let x = 0; x < w; x += colWidth) {
    const cameraX = (x / w) - 0.5;
    const rayAngle = player.dir + cameraX * FOV;
    const ray = castRay(rayAngle);
    const corrected = Math.max(0.0001, ray.corrected);
    const wallHeight = Math.min(h * 2, screenDist / corrected);
    const y = horizon - wallHeight / 2;
    const shade = clamp(1 - corrected / MAX_VIEW, 0.16, 1);
    const wallColor = colorForWall(ray.cell, ray.mapX, ray.mapY, ray.side, ray.texture);

    ctx.fillStyle = wallColor;
    ctx.globalAlpha = 0.72 + shade * 0.28;
    ctx.fillRect(x, y, colWidth + 1, wallHeight);
    ctx.globalAlpha = 1;

    const seam = ray.texture > 0.08 && ray.texture < 0.12;
    if (seam || ray.cell === "L") {
      ctx.fillStyle = ray.cell === "L" ? "rgba(255, 197, 79, 0.22)" : "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(x, y, Math.max(1, colWidth), wallHeight);
    }
    if (ray.cell === "D" || ray.cell === "L") {
      const mid = y + wallHeight * 0.48;
      ctx.fillStyle = ray.cell === "L" ? "rgba(255, 219, 101, 0.75)" : "rgba(26, 18, 12, 0.52)";
      ctx.fillRect(x, mid, colWidth + 1, Math.max(2, wallHeight * 0.025));
    }

    for (let i = 0; i < colWidth; i += 1) {
      zBuffer[x + i] = corrected;
    }
  }
}

function spriteScreenData(entity) {
  const dx = entity.x - player.x;
  const dy = entity.y - player.y;
  const dist = Math.hypot(dx, dy);
  const angle = normalizeAngle(Math.atan2(dy, dx) - player.dir);
  if (Math.abs(angle) > FOV * 0.72 || dist < 0.05) return null;
  const screenDist = (logicalWidth / 2) / Math.tan(FOV / 2);
  const size = (screenDist / dist) * entity.size;
  const x = (0.5 + angle / FOV) * logicalWidth;
  const bob = Math.sin(render.time * 4 + entity.bob) * Math.min(8, size * 0.04);
  const y = logicalHeight * 0.48 - size * 0.5 + bob + (entity.z || 0);
  return { x, y, size, dist, angle };
}

function drawItemSprite(entity, x, y, size) {
  const item = itemInfo[entity.item] || { color: "#ddd" };
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.5, size * 0.28, size * 0.08, 0, 0, TAU);
  ctx.fill();

  if (entity.item === "water") {
    ctx.fillStyle = item.color;
    ctx.fillRect(-size * 0.14, -size * 0.18, size * 0.28, size * 0.48);
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fillRect(-size * 0.06, -size * 0.12, size * 0.05, size * 0.34);
    ctx.fillStyle = "#d6eff5";
    ctx.fillRect(-size * 0.09, -size * 0.27, size * 0.18, size * 0.09);
  } else if (entity.item === "food") {
    ctx.fillStyle = item.color;
    ctx.fillRect(-size * 0.23, -size * 0.08, size * 0.46, size * 0.34);
    ctx.fillStyle = "#7ecb86";
    ctx.fillRect(-size * 0.2, -size * 0.03, size * 0.4, size * 0.06);
  } else if (entity.item === "aid") {
    ctx.fillStyle = "#f1f0e6";
    ctx.fillRect(-size * 0.25, -size * 0.2, size * 0.5, size * 0.42);
    ctx.fillStyle = item.color;
    ctx.fillRect(-size * 0.05, -size * 0.16, size * 0.1, size * 0.34);
    ctx.fillRect(-size * 0.18, -size * 0.04, size * 0.36, size * 0.1);
  } else if (entity.item === "battery") {
    ctx.fillStyle = "#1a2218";
    ctx.fillRect(-size * 0.24, -size * 0.22, size * 0.48, size * 0.46);
    ctx.fillStyle = item.color;
    ctx.fillRect(-size * 0.15, -size * 0.12, size * 0.3, size * 0.22);
    ctx.fillStyle = "#e3bb58";
    ctx.fillRect(-size * 0.08, -size * 0.31, size * 0.16, size * 0.08);
  } else if (entity.item === "pistol" || entity.item === "shotgun") {
    ctx.fillStyle = item.color;
    ctx.fillRect(-size * 0.32, -size * 0.06, size * 0.58, size * 0.12);
    ctx.fillRect(-size * 0.05, size * 0.02, size * 0.14, size * 0.24);
    if (entity.item === "shotgun") ctx.fillRect(size * 0.17, -size * 0.03, size * 0.28, size * 0.06);
  } else {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemySprite(entity, x, y, size) {
  const hurt = entity.hurtTime && performance.now() - entity.hurtTime < 120;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52, size * 0.28, size * 0.08, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = hurt ? "#e7d2bf" : "#565d5f";
  ctx.fillRect(-size * 0.18, -size * 0.22, size * 0.36, size * 0.5);
  ctx.fillStyle = hurt ? "#f16868" : "#3b3f40";
  ctx.fillRect(-size * 0.24, size * 0.06, size * 0.12, size * 0.36);
  ctx.fillRect(size * 0.12, size * 0.06, size * 0.12, size * 0.36);
  ctx.fillStyle = hurt ? "#ffe0b2" : "#76736a";
  ctx.beginPath();
  ctx.arc(0, -size * 0.36, size * 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f1c85b";
  ctx.fillRect(-size * 0.08, -size * 0.38, size * 0.045, size * 0.035);
  ctx.fillRect(size * 0.035, -size * 0.38, size * 0.045, size * 0.035);

  ctx.fillStyle = "#1b1f1f";
  ctx.fillRect(-size * 0.18, size * 0.28, size * 0.12, size * 0.28);
  ctx.fillRect(size * 0.06, size * 0.28, size * 0.12, size * 0.28);

  const hpWidth = size * 0.46;
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(-hpWidth / 2, -size * 0.66, hpWidth, Math.max(2, size * 0.035));
  ctx.fillStyle = "#d95f5f";
  ctx.fillRect(-hpWidth / 2, -size * 0.66, hpWidth * clamp(entity.health / entity.maxHealth, 0, 1), Math.max(2, size * 0.035));
  ctx.restore();
}

function drawNpcSprite(entity, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52, size * 0.28, size * 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#7b8c72";
  ctx.fillRect(-size * 0.18, -size * 0.18, size * 0.36, size * 0.48);
  ctx.fillStyle = "#b88a68";
  ctx.beginPath();
  ctx.arc(0, -size * 0.35, size * 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#5d3e35";
  ctx.fillRect(-size * 0.18, -size * 0.48, size * 0.36, size * 0.15);
  ctx.fillStyle = "#d2e0a0";
  ctx.fillRect(-size * 0.11, -size * 0.2, size * 0.22, size * 0.05);
  ctx.restore();
}

function drawRelaySprite(entity, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = flags.relayPowered ? "#8be2c4" : "#d8ac42";
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.55);
  ctx.lineTo(-size * 0.2, size * 0.42);
  ctx.lineTo(size * 0.2, size * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -size * 0.47, size * 0.11, 0, TAU);
  ctx.stroke();
  if (flags.relayPowered) {
    ctx.strokeStyle = "rgba(139, 226, 196, 0.65)";
    ctx.beginPath();
    ctx.arc(0, -size * 0.47, size * 0.28 + Math.sin(render.time * 8) * size * 0.04, -0.8, 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExitSprite(entity, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = flags.tramOpen ? "rgba(139, 226, 196, 0.55)" : "rgba(217, 95, 95, 0.42)";
  ctx.fillRect(-size * 0.32, -size * 0.38, size * 0.64, size * 0.76);
  ctx.fillStyle = "#161717";
  ctx.fillRect(-size * 0.23, -size * 0.28, size * 0.46, size * 0.56);
  ctx.fillStyle = flags.tramOpen ? "#8be2c4" : "#e3bb58";
  ctx.fillRect(-size * 0.2, -size * 0.32, size * 0.4, size * 0.06);
  ctx.restore();
}

function renderSprites() {
  const visible = entities
    .filter((entity) => entity.active && entity.alive)
    .map((entity) => ({ entity, screen: spriteScreenData(entity) }))
    .filter((entry) => entry.screen)
    .sort((a, b) => b.screen.dist - a.screen.dist);

  visible.forEach(({ entity, screen }) => {
    const left = Math.floor(screen.x - screen.size / 2);
    const right = Math.floor(screen.x + screen.size / 2);
    const center = Math.floor(clamp(screen.x, 0, logicalWidth - 1));
    const z = zBuffer[center] || Infinity;
    if (screen.dist > z + 0.35 && screen.size < logicalHeight * 1.7) return;

    ctx.globalAlpha = clamp(1 - screen.dist / 24, 0.18, 1);
    if (right > 0 && left < logicalWidth) {
      if (entity.type === "item") drawItemSprite(entity, screen.x, screen.y + screen.size * 0.08, screen.size);
      else if (entity.type === "enemy") drawEnemySprite(entity, screen.x, screen.y + screen.size * 0.08, screen.size);
      else if (entity.type === "npc") drawNpcSprite(entity, screen.x, screen.y + screen.size * 0.08, screen.size);
      else if (entity.type === "relay") drawRelaySprite(entity, screen.x, screen.y + screen.size * 0.08, screen.size);
      else if (entity.type === "exit") drawExitSprite(entity, screen.x, screen.y + screen.size * 0.08, screen.size);
    }
    ctx.globalAlpha = 1;
  });
}

function currentTarget() {
  const activeItems = entities.filter((e) => e.active && e.alive);
  const findItem = (item) => activeItems.find((e) => e.type === "item" && e.item === item);
  if (!(flags.foodFound && flags.waterFound)) return findItem(!flags.foodFound ? "food" : "water") || findItem("food") || findItem("water");
  if (!flags.maraTalked) return activeItems.find((e) => e.type === "npc");
  if (!flags.aidFound) return findItem("aid");
  if (!flags.batteryFound) return findItem("battery");
  if (!flags.relayPowered) return activeItems.find((e) => e.type === "relay");
  return activeItems.find((e) => e.type === "exit");
}

function renderCompass() {
  const target = currentTarget();
  if (!target || !flags.started || flags.gameOver) return;
  const angle = normalizeAngle(Math.atan2(target.y - player.y, target.x - player.x) - player.dir);
  const dist = distance(player.x, player.y, target.x, target.y);
  const center = logicalWidth / 2;
  const x = clamp(center + (angle / (FOV / 2)) * (logicalWidth * 0.28), 80, logicalWidth - 80);
  const y = 76;
  ctx.save();
  ctx.fillStyle = "rgba(11, 13, 13, 0.62)";
  ctx.strokeStyle = "rgba(245, 240, 223, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 68, y - 16, 136, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e3bb58";
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x - 7, y + 4);
  ctx.lineTo(x + 7, y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f5f0df";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.ceil(dist)}m`, x, y + 15);
  ctx.restore();
}

function renderWeapon() {
  const w = logicalWidth;
  const h = logicalHeight;
  const weapon = weapons[player.weapon];
  const bob = Math.sin(render.time * 8) * (keys.size ? 4 : 1);
  const kick = render.weaponKick;
  ctx.save();
  ctx.translate(w * 0.54, h - 64 + bob + kick);
  ctx.rotate(-0.05 + kick * 0.002);

  if (player.weapon === "pipe") {
    ctx.fillStyle = "#3a3d3c";
    ctx.fillRect(-34, -16, 92, 12);
    ctx.fillStyle = "#9ea49e";
    ctx.fillRect(-22, -20, 84, 8);
  } else if (player.weapon === "pistol") {
    ctx.fillStyle = "#18191a";
    ctx.fillRect(-28, -34, 76, 26);
    ctx.fillStyle = weapon.color;
    ctx.fillRect(-18, -44, 82, 18);
    ctx.fillStyle = "#3d3630";
    ctx.fillRect(8, -10, 20, 48);
  } else {
    ctx.fillStyle = "#221b17";
    ctx.fillRect(-55, -28, 128, 16);
    ctx.fillStyle = weapon.color;
    ctx.fillRect(-36, -41, 122, 12);
    ctx.fillStyle = "#4b3325";
    ctx.fillRect(-12, -12, 34, 52);
  }

  if (player.muzzle > 0) {
    ctx.globalAlpha = clamp(player.muzzle / 0.08, 0, 1);
    ctx.fillStyle = "#ffe17c";
    ctx.beginPath();
    ctx.moveTo(70, -42);
    ctx.lineTo(126, -58);
    ctx.lineTo(92, -26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderDamageOverlay() {
  if (player.hurtPulse <= 0 && player.hunger > 18) return;
  const danger = Math.max(player.hurtPulse, player.hunger < 18 ? (18 - player.hunger) / 32 : 0);
  ctx.save();
  ctx.globalAlpha = clamp(danger, 0, 0.42);
  ctx.fillStyle = "#9d2e2e";
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.restore();
}

function renderFrame() {
  renderWorld();
  renderSprites();
  renderCompass();
  renderWeapon();
  renderDamageOverlay();
}

function findInteractable() {
  let best = null;
  let bestDist = 1.35;
  for (const entity of entities) {
    if (!entity.active || !entity.alive) continue;
    if (!["item", "npc", "relay", "exit"].includes(entity.type)) continue;
    const dist = distance(player.x, player.y, entity.x, entity.y);
    if (dist > bestDist) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(entity.y - player.y, entity.x - player.x) - player.dir));
    if (angle > 0.72 && dist > 0.65) continue;
    if (!lineOfSightTo(entity.x, entity.y)) continue;
    best = entity;
    bestDist = dist;
  }
  return best;
}

function doorInFront() {
  const ray = castRay(player.dir, 1.45);
  if (ray.hit && (ray.cell === "D" || ray.cell === "L")) return ray;
  return null;
}

function pickup(entity) {
  if (!entity.active) return;
  entity.active = false;
  addInventory(entity.item, entity.amount || 1);
  if (entity.item === "food") flags.foodFound = true;
  if (entity.item === "water") flags.waterFound = true;
  if (entity.quest === "aid" || entity.item === "aid") flags.aidFound = true;
  if (entity.quest === "battery" || entity.item === "battery") flags.batteryFound = true;
  updateHud();
}

function talkToMara() {
  if (!flags.maraTalked) {
    flags.maraTalked = true;
    player.inventory.keycard += 1;
    addMessage("Mara: The relay opens the tram grid. Take my transit key.");
    blip(330, 0.08, 0.035, "triangle");
  } else if (!flags.relayPowered) {
    addMessage("Mara: Battery first, relay second, tram gate last. Keep breathing.");
  } else {
    addMessage("Mara: The station lock should answer that key now.");
  }
  updateHud();
}

function useRelay() {
  if (flags.relayPowered) {
    addMessage("The radio relay hisses with a living signal.");
    return;
  }
  if (inventoryCount("battery") <= 0) {
    addMessage("The relay has no power cell.");
    return;
  }
  player.inventory.battery -= 1;
  flags.relayPowered = true;
  addMessage("Battery seated. A rescue pulse climbs into the ash.");
  blip(220, 0.15, 0.05, "sawtooth");
  window.setTimeout(() => blip(440, 0.12, 0.04, "sawtooth"), 120);
  updateHud();
}

function tryExit() {
  if (!flags.tramOpen) {
    addMessage("The tram tunnel is sealed by a station gate.");
    return;
  }
  flags.exitReached = true;
  winGame();
}

function interact() {
  if (!flags.started || flags.gameOver) return;
  ensureAudio();
  const entity = findInteractable();
  if (entity) {
    if (entity.type === "item") pickup(entity);
    else if (entity.type === "npc") talkToMara();
    else if (entity.type === "relay") useRelay();
    else if (entity.type === "exit") tryExit();
    return;
  }

  const door = doorInFront();
  if (!door) {
    addMessage("Nothing useful within reach.");
    return;
  }
  if (door.cell === "L") {
    if (!flags.relayPowered) {
      addMessage("Station gate refuses the key. The city relay is still dead.");
      return;
    }
    if (inventoryCount("keycard") <= 0) {
      addMessage("The station gate wants a transit key.");
      return;
    }
    flags.tramOpen = true;
    addMessage("Transit key accepted. The station gate grinds open.");
    blip(180, 0.12, 0.04, "sawtooth");
  } else {
    addMessage("Door opened.");
    blip(160, 0.06, 0.035, "square");
  }
  setCell(door.mapX, door.mapY, ".");
  updateHud();
}

function autoPickupNearby() {
  for (const entity of entities) {
    if (!entity.active || !entity.alive || entity.type !== "item") continue;
    if (distance(player.x, player.y, entity.x, entity.y) < 0.42) pickup(entity);
  }
}

function selectedTarget(weapon) {
  let best = null;
  let bestScore = Infinity;
  for (const enemy of entities) {
    if (!enemy.active || !enemy.alive || enemy.type !== "enemy") continue;
    const dist = distance(player.x, player.y, enemy.x, enemy.y);
    if (dist > weapon.range) continue;
    const angle = Math.abs(normalizeAngle(Math.atan2(enemy.y - player.y, enemy.x - player.x) - player.dir));
    const tolerance = weapon.spread + enemy.size / Math.max(8, dist * 9);
    if (angle > tolerance) continue;
    if (!lineOfSightTo(enemy.x, enemy.y)) continue;
    const score = angle * 8 + dist * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

function fireWeapon() {
  if (!flags.started || flags.gameOver) return;
  ensureAudio();
  const now = performance.now();
  const weapon = weapons[player.weapon];
  if (now - player.lastShot < weapon.cooldown) return;
  if (weapon.ammo && inventoryCount(weapon.ammo) <= 0) {
    addMessage(`${weapon.label} is dry.`);
    blip(90, 0.07, 0.035, "square");
    player.lastShot = now - weapon.cooldown * 0.5;
    return;
  }

  player.lastShot = now;
  render.weaponKick = player.weapon === "shotgun" ? 18 : 10;
  render.shake = player.weapon === "shotgun" ? 7 : 4;
  player.muzzle = weapon.ammo ? 0.08 : 0.02;
  if (weapon.ammo) player.inventory[weapon.ammo] -= 1;

  const target = selectedTarget(weapon);
  if (target) {
    const damage = Math.floor(rand(weapon.damage[0], weapon.damage[1]));
    target.health -= damage;
    target.notice = 3;
    target.stun = player.weapon === "shotgun" ? 0.35 : 0.16;
    target.hurtTime = now;
    addMessage(`${target.name} hit for ${damage}.`);
    blip(player.weapon === "pipe" ? 140 : 115, 0.075, 0.055, "sawtooth");
    if (target.health <= 0) {
      killEnemy(target);
    }
  } else {
    blip(player.weapon === "pipe" ? 120 : 180, 0.055, 0.035, weapon.ammo ? "sawtooth" : "square");
  }
  updateHud();
}

function killEnemy(enemy) {
  enemy.alive = false;
  enemy.active = false;
  addMessage(`${enemy.name} drops into the dust.`);
  if (Math.random() < 0.38) {
    makeEntity("item", enemy.x, enemy.y, {
      item: Math.random() < 0.62 ? "bullets" : "water",
      amount: Math.random() < 0.62 ? 5 : 1,
      name: "scavenged supplies",
      size: 0.42
    });
  }
}

function hurtPlayer(amount, reason) {
  player.health = clamp(player.health - amount, 0, 100);
  player.hurtPulse = 0.7;
  render.shake = Math.max(render.shake, 7);
  if (reason) addMessage(reason, "danger");
  blip(80, 0.08, 0.045, "sawtooth");
  if (player.health <= 0) loseGame();
  updateHud();
}

function updateEnemies(dt) {
  for (const enemy of entities) {
    if (!enemy.active || !enemy.alive || enemy.type !== "enemy") continue;
    const dist = distance(player.x, player.y, enemy.x, enemy.y);
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.stun = Math.max(0, enemy.stun - dt);
    enemy.notice = Math.max(0, enemy.notice - dt);

    const seesPlayer = dist < 8.5 && lineOfSightTo(enemy.x, enemy.y);
    if (seesPlayer) enemy.notice = 3;

    if (dist < 0.72 && enemy.cooldown <= 0) {
      enemy.cooldown = 1.25;
      hurtPlayer(enemy.damage, `${enemy.name} claws through your coat.`);
      continue;
    }

    if (enemy.stun > 0) continue;

    let angle = enemy.wanderAngle;
    let speed = enemy.speed * 0.38;
    if (enemy.notice > 0 && dist > 0.68) {
      angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      speed = enemy.speed;
    } else if (Math.random() < dt * 0.55) {
      enemy.wanderAngle += rand(-0.9, 0.9);
    }

    const dx = Math.cos(angle) * speed * dt;
    const dy = Math.sin(angle) * speed * dt;
    const radius = 0.22;
    const canX = !isSolidAt(enemy.x + dx - radius, enemy.y) && !isSolidAt(enemy.x + dx + radius, enemy.y);
    const canY = !isSolidAt(enemy.x, enemy.y + dy - radius) && !isSolidAt(enemy.x, enemy.y + dy + radius);
    if (canX) enemy.x += dx;
    else enemy.wanderAngle += Math.PI * 0.5;
    if (canY) enemy.y += dy;
    else enemy.wanderAngle -= Math.PI * 0.5;
  }
}

function updatePrompt() {
  if (!flags.started || flags.gameOver) {
    ui.prompt.classList.remove("visible");
    return;
  }
  const entity = findInteractable();
  const door = doorInFront();
  let text = "";
  if (entity) {
    if (entity.type === "item") text = `Grab ${entity.name}`;
    else if (entity.type === "npc") text = `Speak with ${entity.name}`;
    else if (entity.type === "relay") text = flags.relayPowered ? "Inspect radio relay" : "Power radio relay";
    else if (entity.type === "exit") text = "Enter tram tunnel";
  } else if (door) {
    text = door.cell === "L" ? "Open station gate" : "Open door";
  }
  ui.prompt.textContent = text;
  ui.prompt.classList.toggle("visible", Boolean(text));
}

function updatePlayer(dt) {
  let forward = 0;
  let strafe = 0;
  if (actionPressed("forward")) forward += 1;
  if (actionPressed("backward")) forward -= 1;
  if (actionPressed("strafeLeft")) strafe -= 1;
  if (actionPressed("strafeRight")) strafe += 1;
  if (actionPressed("turnLeft")) player.dir -= dt * 2.2;
  if (actionPressed("turnRight")) player.dir += dt * 2.2;
  player.dir = normalizeAngle(player.dir);

  const moving = Math.abs(forward) + Math.abs(strafe) > 0;
  const running = moving && actionPressed("run") && player.stamina > 1 && player.hunger > 4;
  const speed = running ? 4.05 : 2.35;
  const len = Math.hypot(forward, strafe) || 1;
  forward /= len;
  strafe /= len;

  const dirX = Math.cos(player.dir);
  const dirY = Math.sin(player.dir);
  const sideX = Math.cos(player.dir + Math.PI / 2);
  const sideY = Math.sin(player.dir + Math.PI / 2);
  const dx = (dirX * forward + sideX * strafe) * speed * dt;
  const dy = (dirY * forward + sideY * strafe) * speed * dt;
  movePlayer(dx, dy);

  if (running) {
    player.stamina = clamp(player.stamina - dt * 27, 0, 100);
    player.hunger = clamp(player.hunger - dt * 0.28, 0, 100);
  } else {
    const regen = player.hunger < 20 ? 6 : 18;
    player.stamina = clamp(player.stamina + dt * regen, 0, 100);
  }
  player.hunger = clamp(player.hunger - dt * (moving ? 0.12 : 0.065), 0, 100);
  if (player.hunger <= 0) {
    player.health = clamp(player.health - dt * 4.8, 0, 100);
    if (Math.random() < dt * 0.45) addMessage("Starvation is eating into your strength.", "danger");
    if (player.health <= 0) loseGame();
  }

  render.horizonBob = moving ? Math.sin(render.time * (running ? 13 : 9)) * (running ? 9 : 5) : 0;
  autoPickupNearby();
}

function update(dt) {
  if (!flags.started || flags.gameOver) return;
  render.time += dt;
  render.weaponKick *= Math.pow(0.02, dt);
  render.shake *= Math.pow(0.01, dt);
  player.hurtPulse = Math.max(0, player.hurtPulse - dt * 1.8);
  player.muzzle = Math.max(0, player.muzzle - dt);
  updatePlayer(dt);
  updateEnemies(dt);
  updatePrompt();
  updateHud();
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  render.time += flags.started && !flags.gameOver ? 0 : dt;
  renderFrame();
  requestAnimationFrame(loop);
}

function loseGame() {
  if (flags.gameOver) return;
  flags.gameOver = true;
  flags.won = false;
  ui.endTitle.textContent = "Greybreak Keeps You";
  ui.endText.textContent = "The city goes quiet around your last signal.";
  ui.endOverlay.classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
}

function winGame() {
  if (flags.gameOver) return;
  flags.gameOver = true;
  flags.won = true;
  updateHud();
  ui.endTitle.textContent = "Signal Sent";
  ui.endText.textContent = "The tram tunnel opens under a living radio pulse. Greybreak is still ruined, but you are not staying buried in it.";
  ui.endOverlay.classList.remove("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
}

function startGame() {
  flags.started = true;
  ui.startOverlay.classList.add("hidden");
  ensureAudio();
  if (!flags.introLogged) {
    flags.introLogged = true;
    addMessage("Greybreak emergency channel: weak signal, unknown survivors.");
    addMessage("Mara is waiting in the safehouse.");
  }
}

function requestMouseLock() {
  if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (error) {
    mouse.locked = false;
  }
}

function keyUse(event) {
  if (event.repeat) return;
  if (actionMatches(event, "settings")) {
    event.preventDefault();
    if (ui.settingsOverlay.classList.contains("hidden")) openSettings();
    else closeSettings();
    return;
  }
  if (!ui.settingsOverlay.classList.contains("hidden")) return;
  if (actionMatches(event, "interact")) interact();
  if (actionMatches(event, "fire")) {
    event.preventDefault();
    fireWeapon();
  }
  if (actionMatches(event, "useFood")) useItem("food");
  if (actionMatches(event, "useWater")) useItem("water");
  if (actionMatches(event, "useAid")) useItem("aid");
  if (actionMatches(event, "equipPipe")) equipWeapon("pipe");
  if (actionMatches(event, "equipPistol")) equipWeapon("pistol");
  if (actionMatches(event, "equipShotgun")) equipWeapon("shotgun");
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (listeningForControl) {
    event.preventDefault();
    settings.controls[listeningForControl] = [event.code];
    listeningForControl = null;
    keys.clear();
    applySettings();
    renderSettingsControls();
    saveSettings();
    return;
  }
  keys.add(event.code);
  keyUse(event);
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
document.addEventListener("pointerlockchange", () => {
  mouse.locked = document.pointerLockElement === canvas;
});
document.addEventListener("mousemove", (event) => {
  if (!mouse.locked || !flags.started || flags.gameOver) return;
  player.dir = normalizeAngle(player.dir + event.movementX * mouse.sensitivity);
});
canvas.addEventListener("click", () => {
  if (!ui.settingsOverlay.classList.contains("hidden")) return;
  if (!flags.started) {
    startGame();
    return;
  }
  if (!mouse.locked) requestMouseLock();
  fireWeapon();
});
ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", resetGame);
ui.settingsButton.addEventListener("click", openSettings);
ui.closeSettingsButton.addEventListener("click", closeSettings);
ui.saveSettingsButton.addEventListener("click", () => {
  saveSettings(true);
  closeSettings();
});
ui.resetSettingsButton.addEventListener("click", () => {
  settings = cloneSettings(defaultSettings);
  keys.clear();
  applySettings();
  renderSettingsControls();
  saveSettings(true);
});
ui.mouseSensitivityInput.addEventListener("input", () => {
  settings.mouseSensitivity = Number(ui.mouseSensitivityInput.value);
  applySettings();
  saveSettings();
});
ui.soundEnabled.addEventListener("change", () => {
  settings.sound = ui.soundEnabled.checked;
  saveSettings();
});
ui.showHud.addEventListener("change", () => {
  settings.showHud = ui.showHud.checked;
  applySettings();
  saveSettings();
});
ui.settingsOverlay.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

ui.inventory.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

resize();
settings = loadSettings();
applySettings();
renderSettingsControls();
resetGame();
requestAnimationFrame((now) => {
  lastFrame = now;
  requestAnimationFrame(loop);
});
