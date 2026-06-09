// Режим Sender (телефон): Enter фіксує рядок і надсилає на Display.
// Sender є «адміністратором» налаштувань Display: надсилає тему + розмір через MQTT.
// Sender також має власну локальну тему (не синхронізується).
import {
  FOCUS_DELAY_MS,
  MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  DEFAULT_THEME, DEFAULT_SIZE, DEFAULT_MODE, DEFAULT_SPEED,
  LS_SENDER_THEME, LS_PUSH_THEME, LS_SIZE, LS_MODE, LS_SPEED,
  SPEED_MIN, SPEED_MAX, SIZE_MIN, SIZE_MAX, SIZE_STEP,
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  ROLE_SENDER
} from "../config.js";
import { $, show, resolveRoom, saveRoom, resolveKey, saveKey, setStatus, initQrModal, openQrModal, bindOutsideClose, createHistory, highlightModeButtons } from "../utils/utils.js";
import { connect, encode } from "../utils/mqtt-client.js";
import { initKey, encrypt } from "../utils/crypto.js";
import * as store from "../utils/store.js";

const MODE_BTN_IDS = {
  [MODE_FIT]:     "sender-mode-fit",
  [MODE_SCROLL]:  "sender-mode-scroll",
  [MODE_TELE]:    "sender-mode-tele",
  [MODE_MARQUEE]: "sender-mode-marquee",
};

function updateThemeBtns(darkId, lightId, theme) {
  const dk = $(darkId), lt = $(lightId);
  if (!dk || !lt) return;
  if (theme === "light") { lt.className = ""; dk.className = "secondary outline"; }
  else                   { dk.className = ""; lt.className = "secondary outline"; }
}

function bindViewport() {
  const vv = window.visualViewport;
  if (!vv) return; // старі браузери — fallback на CSS height:100%
  const screen = $("screen-sender");
  const apply = () => {
    screen.style.height    = vv.height + "px";
    screen.style.transform = "translateY(" + vv.offsetTop + "px)";
  };
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  apply();
}

export function init() {
  show("screen-sender");

  // ===================== Стан =====================
  let senderTheme  = store.get(LS_SENDER_THEME, DEFAULT_THEME);
  let displayTheme = store.get(LS_PUSH_THEME, DEFAULT_THEME);
  let displaySize  = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;
  let displayMode  = store.get(LS_MODE, DEFAULT_MODE);
  let displaySpeed = parseInt(store.get(LS_SPEED, String(DEFAULT_SPEED)), 10) || DEFAULT_SPEED;

  // ===================== Синхронізація стану → UI =====================
  function applySenderTheme(theme) {
    senderTheme = theme;
    store.set(LS_SENDER_THEME, theme);
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeBtns("sender-theme-dark", "sender-theme-light", theme);
  }

  function applyDisplayTheme(theme) {
    displayTheme = theme;
    store.set(LS_PUSH_THEME, theme);
    updateThemeBtns("sender-display-theme-dark", "sender-display-theme-light", theme);
  }

  function applyDisplaySize(size) {
    displaySize = size;
    store.set(LS_SIZE, String(size));
    const el = $("sender-size-value");
    if (el) el.textContent = Math.round(size * 100) + "%";
  }

  function applyDisplayMode(mode) {
    displayMode = mode;
    store.set(LS_MODE, mode);
    highlightModeButtons(MODE_BTN_IDS, mode);
    const speedRow = $("sender-speed-row");
    if (speedRow) speedRow.classList.toggle("hidden", mode !== MODE_TELE && mode !== MODE_MARQUEE);
  }

  function applyDisplaySpeed(speed) {
    displaySpeed = speed;
    store.set(LS_SPEED, String(speed));
    const el = $("sender-speed-value");
    if (el) el.textContent = speed + "/" + SPEED_MAX;
  }

  // Початковий стан UI (тема показується навіть у стані помилки — до перевірки кімнати)
  applySenderTheme(senderTheme);
  applyDisplayTheme(displayTheme);
  applyDisplayMode(displayMode);
  applyDisplaySize(displaySize);
  applyDisplaySpeed(displaySpeed);

  // ===================== Кімната та ключ =====================
  const room = resolveRoom();
  if (!room) {
    $("input").value       = "";
    $("input").placeholder = "Немає кімнати. Відскануйте QR з дисплея.";
    $("input").disabled    = true;
    setStatus($("status-sender"), "err", "немає кімнати");
    return;
  }
  saveRoom(room);

  const key = resolveKey();
  if (!key) {
    $("input").value       = "";
    $("input").placeholder = "Немає ключа. Відскануйте QR з дисплея.";
    $("input").disabled    = true;
    setStatus($("status-sender"), "err", "немає ключа");
    return;
  }
  saveKey(key);
  initKey(key, "encrypt");
  initQrModal(room, key);

  // ===================== MQTT =====================
  const conn = connect(room, ROLE_SENDER, null, $("status-sender"));

  function publishSettings() {
    if (!conn?.client) return;
    const json = JSON.stringify({
      type: MSG_TYPE_SETTINGS,
      size: displaySize,
      displayTheme,
      mode: displayMode,
      speed: displaySpeed,
    });
    // Окрема тема velyki/<room>/settings — щоб retained-налаштування не затирались
    // retained-`live` (на одну тему припадає лише один retained-payload).
    encrypt(json).then((payload) =>
      conn.client.publish(conn.settingsTopic, payload, { retain: true, qos: 0 }));
  }

  function publish(type, text, retain) {
    if (!conn?.client) return;
    encrypt(encode(type, text)).then((payload) =>
      conn.client.publish(conn.topic, payload, { retain: !!retain, qos: 0 }));
  }

  // При кожному (пере)підключенні — надіслати актуальні налаштування.
  if (conn?.client) conn.client.on("connect", publishSettings);

  // ===================== Обробники налаштувань =====================
  $("sender-gear").addEventListener("click", () => {
    $("sender-history-panel").classList.remove("open");
    $("sender-settings").classList.toggle("open");
  });
  $("sender-history-btn").addEventListener("click", () => {
    $("sender-settings").classList.remove("open");
    $("sender-history-panel").classList.toggle("open");
  });
  bindOutsideClose($("sender-settings"),      $("sender-gear"),        $("sender-history-btn"));
  bindOutsideClose($("sender-history-panel"), $("sender-history-btn"), $("sender-gear"));

  $("sender-theme-dark").addEventListener( "click", () => applySenderTheme("dark"));
  $("sender-theme-light").addEventListener("click", () => applySenderTheme("light"));

  $("sender-display-theme-dark").addEventListener( "click", () => { applyDisplayTheme("dark");  publishSettings(); });
  $("sender-display-theme-light").addEventListener("click", () => { applyDisplayTheme("light"); publishSettings(); });

  $("sender-size-minus").addEventListener("click", () => {
    applyDisplaySize(Math.max(SIZE_MIN, Math.round((displaySize - SIZE_STEP) * 100) / 100));
    publishSettings();
  });
  $("sender-size-plus").addEventListener("click", () => {
    applyDisplaySize(Math.min(SIZE_MAX, Math.round((displaySize + SIZE_STEP) * 100) / 100));
    publishSettings();
  });

  Object.keys(MODE_BTN_IDS).forEach((m) => {
    const btn = $(MODE_BTN_IDS[m]);
    if (btn) btn.addEventListener("click", () => { applyDisplayMode(m); publishSettings(); });
  });

  $("sender-speed-minus").addEventListener("click", () => {
    applyDisplaySpeed(Math.max(SPEED_MIN, displaySpeed - 1));
    publishSettings();
  });
  $("sender-speed-plus").addEventListener("click", () => {
    applyDisplaySpeed(Math.min(SPEED_MAX, displaySpeed + 1));
    publishSettings();
  });

  $("sender-show-qr").addEventListener("click", () => {
    openQrModal();
    $("sender-settings").classList.remove("open");
  });

  // ===================== Введення тексту =====================
  const input = $("input");

  const history = createHistory($("sender-history"), $("sender-history-empty"), (text) => {
    input.value = text;
    $("sender-history-panel").classList.remove("open");
    input.focus();
  });

  function commitLine() {
    const line = input.value;
    if (line.trim().length) {
      publish(MSG_TYPE_COMMIT, line, false);
      history.append(line);
    }
    input.value = "";
    input.focus();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitLine(); }
  });
  $("send-btn").addEventListener(  "click", commitLine);
  $("clear-btn").addEventListener( "click", () => { input.value = ""; input.focus(); });

  // ===================== Viewport та фокус =====================
  bindViewport();
  setTimeout(() => input.focus(), FOCUS_DELAY_MS);
}
