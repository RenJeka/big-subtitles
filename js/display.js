// Режим Display (iPad): великий автомасштабований live-текст, історія, QR-модал.
// Тема/розмір/банер делеговано в settings, автомасштаб — у fit-text.
import {
  HISTORY_LIMIT, ORIENTATION_DELAY_MS, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  TEXT_PLACEHOLDER, ROLE_DISPLAY
} from "./config.js";
import { $, show, resolveRoom, makeToken, saveRoom, initQrModal, openQrModal } from "./utils.js";
import { connect, decode } from "./mqtt-client.js";
import { createLiveView } from "./live-view.js";
import * as settings from "./settings.js";

export function init() {
  show("screen-display");

  let room = resolveRoom();
  if (!room) room = makeToken();
  saveRoom(room);
  if (location.hash.indexOf("room=") === -1) {
    location.hash = "room=" + room;
  }

  const historyEl = $("history");
  const historyPanel = $("history-panel");
  const historyEmpty = $("history-empty");
  const liveEl = $("live");
  const liveWrap = $("live-wrap");

  const liveView = createLiveView(liveEl, liveWrap, settings.getSize);

  function setLive(text) {
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
    const msg = decode(raw);
    if (msg.type === MSG_TYPE_SETTINGS) {
      // Sender надіслав налаштування — застосувати (Sender має пріоритет)
      settings.applyRemoteSettings(msg.size, msg.displayTheme, msg.mode, msg.speed);
      syncView();
      liveView.refresh();
    } else if (msg.type === MSG_TYPE_COMMIT) {
      appendLine(msg.text);
      setLive("");
    } else {
      setLive(msg.text || "");
    }
  }, $("status-display"));

  // ---- QR (модальний) ----
  initQrModal(room);

  // ---- Налаштування (тема/розмір/режим/швидкість/банер/QR) ----
  settings.init({
    onSizeChange: () => liveView.refresh(),
    onModeChange: () => { syncView(); },
    onSpeedChange: () => { liveView.setSpeed(settings.getSpeed()); },
    onShowQr: openQrModal
  });

  window.addEventListener("resize", () => liveView.refresh());
  window.addEventListener("orientationchange", () => setTimeout(() => liveView.refresh(), ORIENTATION_DELAY_MS));

  syncView();
  setLive("");
  updateEmptyHint();
}

