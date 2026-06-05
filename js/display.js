// Режим Display (iPad): великий автомасштабований live-текст, історія, QR-модал.
// Тема/розмір/банер делеговано в settings, автомасштаб — у fit-text.
import {
  HISTORY_LIMIT, ORIENTATION_DELAY_MS, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  TEXT_PLACEHOLDER, ROLE_DISPLAY, MODE_TELE, MODE_MARQUEE
} from "./config.js";
import { $, show, resolveRoom, makeToken, saveRoom, resolveKey, saveKey, initQrModal, openQrModal, closeQrModal, bindOutsideClose } from "./utils.js";
import { connect, decode } from "./mqtt-client.js";
import { makeKeyB64, initKey, decrypt } from "./crypto.js";
import { createLiveView } from "./live-view.js";
import * as settings from "./settings.js";

export function init() {
  show("screen-display");

  let room = resolveRoom();
  if (!room) room = makeToken();
  saveRoom(room);

  // E2E-ключ: відновити з localStorage/URL або згенерувати новий (один раз).
  let key = resolveKey();
  if (!key) key = makeKeyB64();
  saveKey(key);
  initKey(key, "decrypt");

  if (location.hash.indexOf("room=") === -1) {
    location.hash = "room=" + room + "&k=" + key;
  }

  const historyEl = $("history");
  const historyPanel = $("history-panel");
  const historyEmpty = $("history-empty");
  const liveEl = $("live");
  const liveWrap = $("live-wrap");

  const liveView = createLiveView(liveEl, liveWrap, settings.getSize);
  let lastText = ""; // останній live-текст (для fit/scroll; tele/marquee накопичує сам)
  // Після commit Sender шле порожній live (очищає retained-поле) — у fit/scroll ми лишаємо
  // відправлене повідомлення на екрані, тож наступний порожній live пропускаємо.
  let ignoreNextEmptyLive = false;

  function isMotionMode() {
    const m = settings.getMode();
    return m === MODE_TELE || m === MODE_MARQUEE;
  }

  function setLive(text) {
    lastText = text || "";
    if (text && text.length) {
      liveEl.classList.remove("placeholder");
      liveView.setText(text);
    } else {
      liveEl.classList.add("placeholder");
      liveView.setText(TEXT_PLACEHOLDER);
    }
  }

  // Застосувати поточний режим/швидкість із settings до контролера показу.
  function syncView() {
    liveView.setMode(settings.getMode());
    liveView.setSpeed(settings.getSpeed());
    // У fit/scroll відновити останній live-текст; tele/marquee стартує з порожнього потоку.
    if (!isMotionMode()) setLive(lastText);
  }

  // Оновлює видимість заглушки «Поки що порожньо».
  function updateEmptyHint() {
    if (historyEl.children.length > 0) {
      historyEmpty.classList.add("hidden");
    } else {
      historyEmpty.classList.remove("hidden");
    }
  }

  // Додає один рядок в історію (DOM — джерело істини), анімуючи лише новий.
  function appendLine(text) {
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

  // Вибір елемента з історії → показати на екрані.
  historyEl.addEventListener("click", function (e) {
    var line = e.target;
    while (line && line !== historyEl) {
      if (line.classList && line.classList.contains("line")) break;
      line = line.parentElement;
    }
    if (!line || line === historyEl) return;
    setLive(line.textContent);
    historyPanel.classList.remove("open");
  });

  connect(room, ROLE_DISPLAY, (raw) => {
    // Дешифруємо у браузері; null = хибний ключ / підміна / чужий формат → тихо ігноруємо.
    decrypt(raw).then((json) => {
      if (json === null) return;
      const msg = decode(json);
      if (msg.type === MSG_TYPE_SETTINGS) {
        // Sender надіслав налаштування — застосувати (Sender має пріоритет)
        settings.applyRemoteSettings(msg.size, msg.displayTheme, msg.mode, msg.speed);
        syncView();
        liveView.refresh();
      } else if (msg.type === MSG_TYPE_COMMIT) {
        appendLine(msg.text); // запис в історію лишається в усіх режимах
        if (isMotionMode()) {
          liveView.appendLine(msg.text); // суфлер/бігучка: додати у безперервний потік
        } else {
          // fit/scroll: відправлене повідомлення лишається на екрані (не стираємо).
          setLive(msg.text);
          ignoreNextEmptyLive = true;
        }
      } else {
        // live-текст (набір) — лише для fit/scroll; у режимах руху ігноруємо.
        if (!isMotionMode()) {
          const t = msg.text || "";
          if (t === "" && ignoreNextEmptyLive) {
            ignoreNextEmptyLive = false; // це порожній live після commit — показане лишаємо
          } else {
            ignoreNextEmptyLive = false;
            setLive(t);
          }
        }
      }
    });
  }, $("status-display"), (isConnected) => {
    if (isConnected) closeQrModal();
  });

  // ---- QR (модальний) ----
  initQrModal(room, key);
  openQrModal();

  // ---- Налаштування (тема/розмір/режим/швидкість/банер/QR) ----
  settings.init({
    onSizeChange: () => liveView.refresh(),
    onModeChange: () => { syncView(); },
    onSpeedChange: () => { liveView.setSpeed(settings.getSpeed()); },
    onShowQr: openQrModal
  });

  // Закривати панелі кліком поза ними (кнопки-перемикачі ігноруємо).
  bindOutsideClose($("settings"), $("gear"), $("history-btn"));
  bindOutsideClose($("history-panel"), $("history-btn"), $("gear"));

  window.addEventListener("resize", () => liveView.refresh());
  window.addEventListener("orientationchange", () => setTimeout(() => liveView.refresh(), ORIENTATION_DELAY_MS));

  syncView();
  setLive("");
  updateEmptyHint();
}

