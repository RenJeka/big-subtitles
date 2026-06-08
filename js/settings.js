// Панель налаштувань Display: тема, розмір, режим показу, швидкість, банер автоблокування.
import {
  LS_THEME, LS_SIZE, LS_WAKE, LS_MODE, LS_SPEED,
  DEFAULT_THEME, DEFAULT_SIZE, DEFAULT_MODE, DEFAULT_SPEED,
  SPEED_MIN, SPEED_MAX, SIZE_MIN, SIZE_MAX, SIZE_STEP,
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE
} from "./config.js";
import * as store from "./store.js";
import { $, highlightModeButtons } from "./utils.js";

let currentSize = 1;
let currentMode = DEFAULT_MODE;
let currentSpeed = DEFAULT_SPEED;

const MODE_BTN_IDS = {
  [MODE_FIT]: "mode-fit",
  [MODE_SCROLL]: "mode-scroll",
  [MODE_TELE]: "mode-tele",
  [MODE_MARQUEE]: "mode-marquee"
};

// Показати поточний розмір тексту у відсотках (1 = 100%).
function updateSizeValue() {
  const el = $("size-value");
  if (el) el.textContent = Math.round(currentSize * 100) + "%";
}

// Показати поточний рівень швидкості у форматі «рівень/макс».
function updateSpeedValue() {
  const el = $("speed-value");
  if (el) el.textContent = currentSpeed + "/" + SPEED_MAX;
}

// Підсвітити активну кнопку режиму (активна — без класу, решта — secondary outline).
function updateModeBtns(mode) {
  highlightModeButtons(MODE_BTN_IDS, mode);
  // Швидкість має сенс лише для авто-руху (суфлер/бігуча строка).
  const speedRow = $("speed-row");
  if (speedRow) {
    speedRow.classList.toggle("hidden", !(mode === MODE_TELE || mode === MODE_MARQUEE));
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  store.set(LS_THEME, theme);
  const dk = $("theme-dark"), lt = $("theme-light");
  if (dk && lt) {
    if (theme === "light") { lt.className = ""; dk.className = "secondary outline"; }
    else { dk.className = ""; lt.className = "secondary outline"; }
  }
}

export function getSize() { return currentSize; }
export function getMode() { return currentMode; }
export function getSpeed() { return currentSpeed; }

// Застосувати налаштування, надіслані Sender по MQTT (не публікувати назад).
// Оновлює UI (тема, кнопки режиму) + зберігає в localStorage.
export function applyRemoteSettings(size, displayTheme, mode, speed) {
  currentSize = parseFloat(size) || 1;
  store.set(LS_SIZE, String(currentSize));
  updateSizeValue();
  if (displayTheme != null) {
    applyTheme(displayTheme);
  }
  if (mode != null) {
    currentMode = mode;
    store.set(LS_MODE, mode);
    updateModeBtns(mode);
  }
  if (speed != null) {
    currentSpeed = parseInt(speed, 10) || DEFAULT_SPEED;
    store.set(LS_SPEED, String(currentSpeed));
    updateSpeedValue();
  }
}

// hooks: { onSizeChange }
export function init(hooks = {}) {
  const theme = store.get(LS_THEME, DEFAULT_THEME);
  currentSize = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;
  currentMode = store.get(LS_MODE, DEFAULT_MODE);
  currentSpeed = parseInt(store.get(LS_SPEED, String(DEFAULT_SPEED)), 10) || DEFAULT_SPEED;
  applyTheme(theme);
  updateModeBtns(currentMode);
  updateSizeValue();
  updateSpeedValue();

  $("gear").addEventListener("click", function () {
    var hp = $("history-panel");
    if (hp) hp.classList.remove("open");
    $("settings").classList.toggle("open");
  });

  var histBtn = $("history-btn");
  if (histBtn) {
    histBtn.addEventListener("click", function () {
      $("settings").classList.remove("open");
      $("history-panel").classList.toggle("open");
    });
  }

  function updateSize(delta) {
    currentSize = Math.round((currentSize + delta) * 100) / 100;
    if (currentSize > SIZE_MAX) currentSize = SIZE_MAX;
    if (currentSize < SIZE_MIN) currentSize = SIZE_MIN;
    store.set(LS_SIZE, String(currentSize));
    updateSizeValue();
    if (hooks.onSizeChange) hooks.onSizeChange();
  }

  $("size-minus").addEventListener("click", () => updateSize(-SIZE_STEP));
  $("size-plus").addEventListener("click", () => updateSize(SIZE_STEP));

  // Режим показу
  function setMode(mode) {
    currentMode = mode;
    store.set(LS_MODE, mode);
    updateModeBtns(mode);
    if (hooks.onModeChange) hooks.onModeChange();
  }
  Object.keys(MODE_BTN_IDS).forEach((m) => {
    const btn = $(MODE_BTN_IDS[m]);
    if (btn) btn.addEventListener("click", () => setMode(m));
  });

  // Швидкість авто-руху
  function updateSpeed(delta) {
    currentSpeed += delta;
    if (currentSpeed > SPEED_MAX) currentSpeed = SPEED_MAX;
    if (currentSpeed < SPEED_MIN) currentSpeed = SPEED_MIN;
    store.set(LS_SPEED, String(currentSpeed));
    updateSpeedValue();
    if (hooks.onSpeedChange) hooks.onSpeedChange();
  }
  $("speed-minus").addEventListener("click", () => updateSpeed(-1));
  $("speed-plus").addEventListener("click", () => updateSpeed(1));

  $("theme-dark").addEventListener("click", () => applyTheme("dark"));
  $("theme-light").addEventListener("click", () => applyTheme("light"));

  $("show-qr").addEventListener("click", () => {
    if (hooks.onShowQr) hooks.onShowQr();
    $("settings").classList.remove("open");
  });

  // Банер автоблокування (одноразовий)
  if (!store.get(LS_WAKE, null)) $("wake-hint").classList.add("show");
  $("wake-ok").addEventListener("click", () => {
    $("wake-hint").classList.remove("show");
    store.set(LS_WAKE, "1");
  });
}
