// Режим Sender (телефон): textarea з debounce-публікацією, Enter фіксує рядок.
// Sender є «адміністратором» налаштувань Display: надсилає тему + розмір через MQTT.
// Sender також має власну локальну тему (не синхронізується).
import {
  DEBOUNCE_MS, FOCUS_DELAY_MS,
  MSG_TYPE_LIVE, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  DEFAULT_THEME, DEFAULT_SIZE, DEFAULT_MODE, DEFAULT_SPEED, HISTORY_LIMIT,
  LS_SENDER_THEME, LS_PUSH_THEME, LS_SIZE, LS_MODE, LS_SPEED,
  SPEED_MIN, SPEED_MAX, SIZE_MIN, SIZE_MAX, SIZE_STEP,
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  ROLE_SENDER
} from "./config.js";
import { $, show, resolveRoom, saveRoom, resolveKey, saveKey, setStatus, initQrModal, openQrModal, bindOutsideClose } from "./utils.js";
import { connect, encode } from "./mqtt-client.js";
import { initKey, encrypt } from "./crypto.js";
import * as store from "./store.js";

export function init() {
  show("screen-sender");

  // ===================== Тема Sender (локальна) =====================
  let senderTheme = store.get(LS_SENDER_THEME, DEFAULT_THEME);

  function updateSenderThemeBtns(theme) {
    const dk = $("sender-theme-dark"), lt = $("sender-theme-light");
    if (!dk || !lt) return;
    if (theme === "light") { lt.className = ""; dk.className = "secondary outline"; }
    else { dk.className = ""; lt.className = "secondary outline"; }
  }

  function applySenderTheme(theme) {
    senderTheme = theme;
    store.set(LS_SENDER_THEME, theme);
    document.documentElement.setAttribute("data-theme", theme);
    updateSenderThemeBtns(theme);
  }

  // ===================== Налаштування Display (передаються через MQTT) =====================
  let displayTheme = store.get(LS_PUSH_THEME, DEFAULT_THEME);
  let displaySize  = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;
  let displayMode  = store.get(LS_MODE, DEFAULT_MODE);
  let displaySpeed = parseInt(store.get(LS_SPEED, String(DEFAULT_SPEED)), 10) || DEFAULT_SPEED;

  function updateDisplayThemeBtns(theme) {
    const dk = $("sender-display-theme-dark"), lt = $("sender-display-theme-light");
    if (!dk || !lt) return;
    if (theme === "light") { lt.className = ""; dk.className = "secondary outline"; }
    else { dk.className = ""; lt.className = "secondary outline"; }
  }

  const SENDER_MODE_BTN_IDS = {
    [MODE_FIT]: "sender-mode-fit",
    [MODE_SCROLL]: "sender-mode-scroll",
    [MODE_TELE]: "sender-mode-tele",
    [MODE_MARQUEE]: "sender-mode-marquee"
  };

  function updateDisplayModeBtns(mode) {
    Object.keys(SENDER_MODE_BTN_IDS).forEach((m) => {
      const btn = $(SENDER_MODE_BTN_IDS[m]);
      if (btn) btn.className = (m === mode) ? "" : "secondary outline";
    });
    const speedRow = $("sender-speed-row");
    if (speedRow) {
      const show = (mode === MODE_TELE || mode === MODE_MARQUEE);
      speedRow.classList.toggle("hidden", !show);
    }
  }

  // Застосувати поточний стан UI-контролів
  applySenderTheme(senderTheme);
  updateDisplayThemeBtns(displayTheme);
  updateDisplayModeBtns(displayMode);

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

  // E2E-ключ обов'язковий: без нього Display не зможе дешифрувати наш текст.
  const key = resolveKey();
  if (!key) {
    $("input").value = "";
    $("input").placeholder = "Немає ключа. Відскануйте QR з дисплея.";
    $("input").disabled = true;
    setStatus($("status-sender"), "err", "немає ключа");
    return;
  }
  saveKey(key);
  initKey(key, "encrypt");

  // QR-модал (той самий, що і на Display)
  initQrModal(room, key);

  // ===================== MQTT =====================
  const conn = connect(room, ROLE_SENDER, null, $("status-sender"));

  function publishSettings() {
    if (!conn || !conn.client) return;
    const json = JSON.stringify({
      type: MSG_TYPE_SETTINGS,
      size: displaySize,
      displayTheme,
      mode: displayMode,
      speed: displaySpeed
    });
    encrypt(json).then((payload) => conn.client.publish(conn.topic, payload, { retain: true, qos: 0 }));
  }

  function publish(type, text, retain) {
    if (!conn || !conn.client) return;
    encrypt(encode(type, text)).then((payload) =>
      conn.client.publish(conn.topic, payload, { retain: !!retain, qos: 0 }));
  }

  // При кожному (пере)підключенні — одразу надіслати актуальні налаштування.
  // Це гарантує пріоритет Sender навіть якщо Display змінив щось локально.
  if (conn && conn.client) {
    conn.client.on("connect", publishSettings);
  }

  // ===================== UI налаштувань Sender =====================
  $("sender-gear").addEventListener("click", () => {
    $("sender-history-panel").classList.remove("open");
    $("sender-settings").classList.toggle("open");
  });

  $("sender-history-btn").addEventListener("click", () => {
    $("sender-settings").classList.remove("open");
    $("sender-history-panel").classList.toggle("open");
  });

  // Закривати панелі кліком поза ними (кнопки-перемикачі ігноруємо).
  bindOutsideClose($("sender-settings"), $("sender-gear"), $("sender-history-btn"));
  bindOutsideClose($("sender-history-panel"), $("sender-history-btn"), $("sender-gear"));

  // Розмір тексту на Display
  function updateSenderSize(delta) {
    displaySize = Math.round((displaySize + delta) * 100) / 100;
    if (displaySize > SIZE_MAX) displaySize = SIZE_MAX;
    if (displaySize < SIZE_MIN) displaySize = SIZE_MIN;
    store.set(LS_SIZE, String(displaySize));
    publishSettings();
  }

  $("sender-size-minus").addEventListener("click", () => updateSenderSize(-SIZE_STEP));
  $("sender-size-plus").addEventListener("click", () => updateSenderSize(SIZE_STEP));

  // Режим показу на Display
  function setDisplayMode(mode) {
    displayMode = mode;
    store.set(LS_MODE, mode);
    updateDisplayModeBtns(mode);
    publishSettings();
  }
  Object.keys(SENDER_MODE_BTN_IDS).forEach((m) => {
    const btn = $(SENDER_MODE_BTN_IDS[m]);
    if (btn) btn.addEventListener("click", () => setDisplayMode(m));
  });

  // Швидкість авто-руху на Display
  function updateDisplaySpeed(delta) {
    displaySpeed += delta;
    if (displaySpeed > SPEED_MAX) displaySpeed = SPEED_MAX;
    if (displaySpeed < SPEED_MIN) displaySpeed = SPEED_MIN;
    store.set(LS_SPEED, String(displaySpeed));
    publishSettings();
  }
  $("sender-speed-minus").addEventListener("click", () => updateDisplaySpeed(-1));
  $("sender-speed-plus").addEventListener("click", () => updateDisplaySpeed(1));

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

  // ===================== Історія Sender =====================
  const historyEl = $("sender-history");
  const historyPanel = $("sender-history-panel");
  const historyEmpty = $("sender-history-empty");

  function updateEmptyHint() {
    if (historyEl.children.length > 0) {
      historyEmpty.classList.add("hidden");
    } else {
      historyEmpty.classList.remove("hidden");
    }
  }

  function appendSenderLine(text) {
    text = (text || "").replace(/\n+$/, "");
    if (!text.trim().length) return;
    const d = document.createElement("div");
    d.className = "line line-enter";
    d.textContent = text;
    historyEl.appendChild(d);
    requestAnimationFrame(() => d.classList.remove("line-enter"));
    while (historyEl.children.length > HISTORY_LIMIT) {
      historyEl.removeChild(historyEl.firstChild);
    }
    historyEl.scrollTop = historyEl.scrollHeight;
    updateEmptyHint();
  }

  historyEl.addEventListener("click", function (e) {
    var line = e.target;
    while (line && line !== historyEl) {
      if (line.classList && line.classList.contains("line")) break;
      line = line.parentElement;
    }
    if (!line || line === historyEl) return;
    input.value = line.textContent;
    historyPanel.classList.remove("open");
    scheduleLive();
    input.focus();
  });

  updateEmptyHint();

  // ===================== Введення тексту =====================
  const input = $("input");
  let timer = null;

  // Live надсилаємо завжди. Плавність суфлера/бігучки гарантує Display: у режимах руху
  // він ІГНОРУЄ live й оновлює потік лише по commit (кнопка/Enter). Тож блокувати live
  // на боці Sender не потрібно — інакше при розсинхроні режиму текст міг зовсім не йти.
  function scheduleLive() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => publish(MSG_TYPE_LIVE, input.value, true), DEBOUNCE_MS);
  }

  input.addEventListener("input", scheduleLive);

  function commitLine() {
    const line = input.value;
    if (timer) { clearTimeout(timer); timer = null; }
    if (line.trim().length) {
      publish(MSG_TYPE_COMMIT, line, false);
      appendSenderLine(line);
    }
    input.value = "";
    publish(MSG_TYPE_LIVE, "", true); // очистити retained live
    input.focus();
  }

  // Enter (без Shift) — зафіксувати рядок в історію дисплея
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitLine();
    }
  });

  $("send-btn").addEventListener("click", commitLine);

  $("clear-btn").addEventListener("click", () => {
    input.value = "";
    if (timer) { clearTimeout(timer); timer = null; }
    publish(MSG_TYPE_LIVE, "", true);
    input.focus();
  });

  // ===================== Висота під клавіатуру =====================
  // Екранна клавіатура на телефоні не зменшує layout viewport → кнопки ховаються під нею.
  // Прив'язуємо висоту екрана Sender до visualViewport, щоб кнопки лишались видимими.
  function bindViewport() {
    const vv = window.visualViewport;
    if (!vv) return; // старі браузери — fallback на CSS height:100%
    const screen = $("screen-sender");
    const apply = () => {
      screen.style.height = vv.height + "px";
      screen.style.transform = "translateY(" + vv.offsetTop + "px)";
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
  }
  bindViewport();

  // Фокус на полі для виклику клавіатури
  setTimeout(() => input.focus(), FOCUS_DELAY_MS);
}
