// Режим Display (iPad): великий автомасштабований live-текст, історія, QR-модал.
// Тема/розмір/банер делеговано в settings, автомасштаб — у fit-text.
import {
  HISTORY_LIMIT, ORIENTATION_DELAY_MS, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  TEXT_PLACEHOLDER, ROLE_DISPLAY
} from "./config.js";
import { $, show, resolveRoom, makeToken, saveRoom, initQrModal, openQrModal } from "./utils.js";
import { connect, decode } from "./mqtt-client.js";
import { fit } from "./fit-text.js";
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
  const liveEl = $("live");
  const liveWrap = $("live-wrap");

  const fitLive = () => fit(liveEl, liveWrap, settings.getSize());

  function setLive(text) {
    if (text && text.length) {
      liveEl.classList.remove("placeholder");
      liveEl.textContent = text;
    } else {
      liveEl.classList.add("placeholder");
      liveEl.textContent = TEXT_PLACEHOLDER;
    }
    fitLive();
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
    fitLive();
  }

  connect(room, ROLE_DISPLAY, (raw) => {
    const msg = decode(raw);
    if (msg.type === MSG_TYPE_SETTINGS) {
      // Sender надіслав налаштування — застосувати (Sender має пріоритет)
      settings.applyRemoteSettings(msg.size, msg.displayTheme);
      fitLive();
    } else if (msg.type === MSG_TYPE_COMMIT) {
      appendLine(msg.text);
      setLive("");
    } else {
      setLive(msg.text || "");
    }
  }, $("status-display"));

  // ---- QR (модальний) ----
  initQrModal(room);

  // ---- Налаштування (тема/розмір/банер/QR) ----
  settings.init({ onSizeChange: fitLive, onShowQr: openQrModal });

  window.addEventListener("resize", fitLive);
  window.addEventListener("orientationchange", () => setTimeout(fitLive, ORIENTATION_DELAY_MS));

  fitLive();
}
