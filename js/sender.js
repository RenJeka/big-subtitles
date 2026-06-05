// Режим Sender (телефон): textarea з debounce-публікацією, Enter фіксує рядок.
// Sender є «адміністратором» налаштувань Display: надсилає тему + розмір через MQTT.
// Sender також має власну локальну тему (не синхронізується).
import {
  DEBOUNCE_MS, FOCUS_DELAY_MS,
  MSG_TYPE_LIVE, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  DEFAULT_THEME, DEFAULT_SIZE,
  LS_SENDER_THEME, LS_PUSH_THEME, LS_SIZE
} from "./config.js";
import { $, show, resolveRoom, saveRoom, setStatus, initQrModal, openQrModal } from "./utils.js";
import { connect, encode } from "./mqtt-client.js";
import * as store from "./store.js";

export function init() {
  show("screen-sender");

  // ===================== Тема Sender (локальна) =====================
  let senderTheme = store.get(LS_SENDER_THEME, DEFAULT_THEME);

  function updateSenderThemeBtns(theme) {
    const dk = $("sender-theme-dark"), lt = $("sender-theme-light");
    if (!dk || !lt) return;
    if (theme === "light") { lt.classList.remove("off"); dk.classList.add("off"); }
    else { dk.classList.remove("off"); lt.classList.add("off"); }
  }

  function applySenderTheme(theme) {
    senderTheme = theme;
    store.set(LS_SENDER_THEME, theme);
    if (theme === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
    updateSenderThemeBtns(theme);
  }

  // ===================== Налаштування Display (передаються через MQTT) =====================
  let displayTheme = store.get(LS_PUSH_THEME, DEFAULT_THEME);
  let displaySize  = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;

  function updateDisplayThemeBtns(theme) {
    const dk = $("sender-display-theme-dark"), lt = $("sender-display-theme-light");
    if (!dk || !lt) return;
    if (theme === "light") { lt.classList.remove("off"); dk.classList.add("off"); }
    else { dk.classList.remove("off"); lt.classList.add("off"); }
  }

  // Застосувати поточний стан UI-контролів
  applySenderTheme(senderTheme);
  updateDisplayThemeBtns(displayTheme);
  const sizeRange = $("sender-size-range");
  if (sizeRange) sizeRange.value = displaySize;

  // ===================== Кімната =====================
  const room = resolveRoom();
  if (!room) {
    $("input").value = "";
    $("input").placeholder = "Немає кімнати. Відскануйте QR з дисплея.";
    $("input").disabled = true;
    setStatus($("status-sender"), "err", "немає кімнати");
    return;
  }
  saveRoom(room);

  // QR-модал (той самий, що і на Display)
  initQrModal(room);

  // ===================== MQTT =====================
  const conn = connect(room, null, $("status-sender"));

  function publishSettings() {
    if (!conn || !conn.client) return;
    const payload = JSON.stringify({ type: MSG_TYPE_SETTINGS, size: displaySize, displayTheme });
    conn.client.publish(conn.topic, payload, { retain: true, qos: 0 });
  }

  function publish(type, text, retain) {
    if (!conn || !conn.client) return;
    conn.client.publish(conn.topic, encode(type, text), { retain: !!retain, qos: 0 });
  }

  // При кожному (пере)підключенні — одразу надіслати актуальні налаштування.
  // Це гарантує пріоритет Sender навіть якщо Display змінив щось локально.
  if (conn && conn.client) {
    conn.client.on("connect", publishSettings);
  }

  // ===================== UI налаштувань Sender =====================
  $("sender-gear").addEventListener("click", () =>
    $("sender-settings").classList.toggle("open")
  );

  // Розмір тексту на Display
  if (sizeRange) {
    sizeRange.addEventListener("input", () => {
      displaySize = parseFloat(sizeRange.value) || 1;
      store.set(LS_SIZE, String(displaySize));
      publishSettings();
    });
  }

  // Власна тема Sender
  $("sender-theme-dark").addEventListener("click",  () => applySenderTheme("dark"));
  $("sender-theme-light").addEventListener("click", () => applySenderTheme("light"));

  // Тема Display (команда на перевизначення)
  $("sender-display-theme-dark").addEventListener("click", () => {
    displayTheme = "dark";
    store.set(LS_PUSH_THEME, displayTheme);
    updateDisplayThemeBtns(displayTheme);
    publishSettings();
  });
  $("sender-display-theme-light").addEventListener("click", () => {
    displayTheme = "light";
    store.set(LS_PUSH_THEME, displayTheme);
    updateDisplayThemeBtns(displayTheme);
    publishSettings();
  });

  // Показати QR з налаштувань
  $("sender-show-qr").addEventListener("click", () => {
    openQrModal();
    $("sender-settings").classList.remove("open");
  });

  // ===================== Введення тексту =====================
  const input = $("input");
  let timer = null;

  function scheduleLive() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => publish(MSG_TYPE_LIVE, input.value, true), DEBOUNCE_MS);
  }

  input.addEventListener("input", scheduleLive);

  // Enter (без Shift) — зафіксувати рядок в історію дисплея
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const line = input.value;
      if (timer) { clearTimeout(timer); timer = null; }
      if (line.trim().length) publish(MSG_TYPE_COMMIT, line, false);
      input.value = "";
      publish(MSG_TYPE_LIVE, "", true); // очистити retained live
    }
  });

  $("clear-btn").addEventListener("click", () => {
    input.value = "";
    if (timer) { clearTimeout(timer); timer = null; }
    publish(MSG_TYPE_LIVE, "", true);
    input.focus();
  });

  // Фокус на полі для виклику клавіатури
  setTimeout(() => input.focus(), FOCUS_DELAY_MS);
}
