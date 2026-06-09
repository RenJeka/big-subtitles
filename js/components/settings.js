// Панель налаштувань Display: тема, розмір, режим показу, швидкість, банер автоблокування.
import {
  LS_THEME, LS_SIZE, LS_WAKE, LS_MODE, LS_SPEED, LS_LINEHEIGHT,
  DEFAULT_THEME, DEFAULT_SIZE, DEFAULT_MODE, DEFAULT_SPEED, DEFAULT_LINEHEIGHT,
  SPEED_MIN, SPEED_MAX, SIZE_MIN, SIZE_MAX, SIZE_STEP, LINEHEIGHT_MIN, LINEHEIGHT_MAX,
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE
} from "../config.js";
import * as store from "../utils/store.js";
import { $, highlightModeButtons } from "../utils/utils.js";

let currentSize       = 1;
let currentMode       = DEFAULT_MODE;
let currentSpeed      = DEFAULT_SPEED;
let currentLineHeight = DEFAULT_LINEHEIGHT;

const MODE_BTN_IDS = {
  [MODE_FIT]:     "mode-fit",
  [MODE_SCROLL]:  "mode-scroll",
  [MODE_TELE]:    "mode-tele",
  [MODE_MARQUEE]: "mode-marquee",
};

// Відображають поточний стан у мітках UI.
function updateSizeValue() {
  const el = $("size-value");
  if (el) el.textContent = Math.round(currentSize * 100) + "%";
}

function updateSpeedValue() {
  const el = $("speed-value");
  if (el) el.textContent = currentSpeed + "/" + SPEED_MAX;
}

function updateLineHeightValue() {
  const el = $("lh-value");
  if (el) el.textContent = currentLineHeight + "/" + LINEHEIGHT_MAX;
}

// Підсвічує активний режим і показує/ховає рядок швидкості.
function updateModeBtns(mode) {
  highlightModeButtons(MODE_BTN_IDS, mode);
  // Швидкість має сенс лише для авто-руху (суфлер/бігуча строка).
  const speedRow = $("speed-row");
  if (speedRow) speedRow.classList.toggle("hidden", mode !== MODE_TELE && mode !== MODE_MARQUEE);
}

// Задає тему на <html>, зберігає в localStorage і оновлює кнопки вибору теми.
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  store.set(LS_THEME, theme);
  const dk = $("theme-dark"), lt = $("theme-light");
  if (dk && lt) {
    if (theme === "light") { lt.className = ""; dk.className = "secondary outline"; }
    else                   { dk.className = ""; lt.className = "secondary outline"; }
  }
}

export function getSize()       { return currentSize;       }
export function getMode()       { return currentMode;       }
export function getSpeed()      { return currentSpeed;      }
export function getLineHeight() { return currentLineHeight; }

// Застосувати налаштування, надіслані Sender по MQTT (не публікувати назад).
export function applyRemoteSettings(size, displayTheme, mode, speed, lineHeight) {
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
  if (lineHeight != null) {
    currentLineHeight = parseInt(lineHeight, 10) || DEFAULT_LINEHEIGHT;
    store.set(LS_LINEHEIGHT, String(currentLineHeight));
    updateLineHeightValue();
  }
}

// hooks: { onSizeChange, onModeChange, onSpeedChange, onLineHeightChange, onShowQr }
export function init(hooks = {}) {
  const theme   = store.get(LS_THEME, DEFAULT_THEME);
  currentSize   = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;
  currentMode   = store.get(LS_MODE, DEFAULT_MODE);
  currentSpeed  = parseInt(store.get(LS_SPEED, String(DEFAULT_SPEED)), 10) || DEFAULT_SPEED;
  currentLineHeight = parseInt(store.get(LS_LINEHEIGHT, String(DEFAULT_LINEHEIGHT)), 10) || DEFAULT_LINEHEIGHT;
  applyTheme(theme);
  updateModeBtns(currentMode);
  updateSizeValue();
  updateSpeedValue();
  updateLineHeightValue();

  $("gear").addEventListener("click", () => {
    $("history-panel")?.classList.remove("open");
    $("settings").classList.toggle("open");
  });

  $("history-btn")?.addEventListener("click", () => {
    $("settings").classList.remove("open");
    $("history-panel").classList.toggle("open");
  });

  function updateSize(delta) {
    currentSize = Math.min(SIZE_MAX, Math.max(SIZE_MIN,
      Math.round((currentSize + delta) * 100) / 100));
    store.set(LS_SIZE, String(currentSize));
    updateSizeValue();
    hooks.onSizeChange?.();
  }
  $("size-minus").addEventListener("click", () => updateSize(-SIZE_STEP));
  $("size-plus").addEventListener( "click", () => updateSize(SIZE_STEP));

  function setMode(mode) {
    currentMode = mode;
    store.set(LS_MODE, mode);
    updateModeBtns(mode);
    hooks.onModeChange?.();
  }
  Object.keys(MODE_BTN_IDS).forEach((m) => {
    const btn = $(MODE_BTN_IDS[m]);
    if (btn) btn.addEventListener("click", () => setMode(m));
  });

  function updateSpeed(delta) {
    currentSpeed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, currentSpeed + delta));
    store.set(LS_SPEED, String(currentSpeed));
    updateSpeedValue();
    hooks.onSpeedChange?.();
  }
  $("speed-minus").addEventListener("click", () => updateSpeed(-1));
  $("speed-plus").addEventListener( "click", () => updateSpeed(1));

  function updateLineHeight(delta) {
    currentLineHeight = Math.min(LINEHEIGHT_MAX, Math.max(LINEHEIGHT_MIN, currentLineHeight + delta));
    store.set(LS_LINEHEIGHT, String(currentLineHeight));
    updateLineHeightValue();
    hooks.onLineHeightChange?.();
  }
  $("lh-minus").addEventListener("click", () => updateLineHeight(-1));
  $("lh-plus").addEventListener( "click", () => updateLineHeight(1));

  $("theme-dark").addEventListener( "click", () => applyTheme("dark"));
  $("theme-light").addEventListener("click", () => applyTheme("light"));

  $("show-qr").addEventListener("click", () => {
    hooks.onShowQr?.();
    $("settings").classList.remove("open");
  });

  // Банер автоблокування (одноразовий)
  if (!store.get(LS_WAKE, null)) $("wake-hint").classList.add("show");
  $("wake-ok").addEventListener("click", () => {
    $("wake-hint").classList.remove("show");
    store.set(LS_WAKE, "1");
  });
}
