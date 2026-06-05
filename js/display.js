// Режим Display (iPad): великий автомасштабований live-текст, історія, QR.
// Тема/розмір/банер делеговано в settings, автомасштаб — у fit-text.
// Глобал `QRCode` приходить із CDN-скрипта (підключений у index.html).
import { HISTORY_LIMIT } from "./config.js";
import { $, show, resolveRoom, makeToken, saveRoom } from "./utils.js";
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
  let qrMinimized = false;

  const fitLive = () => fit(liveEl, liveWrap, settings.getSize());

  function setLive(text) {
    if (text && text.length) {
      liveEl.classList.remove("placeholder");
      liveEl.textContent = text;
    } else {
      liveEl.classList.add("placeholder");
      liveEl.textContent = "Очікую текст…";
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

  const minimizeQr = () => { $("qr-box").classList.add("minimized"); qrMinimized = true; };
  const showQr = () => { $("qr-box").classList.remove("minimized"); qrMinimized = false; };

  connect(room, (raw) => {
    const msg = decode(raw);
    if (msg.type === "commit") {
      appendLine(msg.text);
      setLive("");
    } else {
      setLive(msg.text || "");
    }
    // згорнути QR після першого реального тексту
    if (!qrMinimized && msg.text && msg.text.trim().length) minimizeQr();
  }, $("status-display"));

  // ---- QR ----
  const senderUrl = location.origin + location.pathname + "?role=sender#room=" + room;
  $("qr-link").textContent = senderUrl;
  try {
    if (typeof QRCode !== "undefined") {
      new QRCode($("qr"), { text: senderUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } else {
      $("qr").textContent = "QR недоступний — відкрийте посилання нижче вручну.";
    }
  } catch (e) {
    $("qr").textContent = "QR недоступний — відкрийте посилання нижче вручну.";
  }
  $("qr-toggle").addEventListener("click", minimizeQr);

  // ---- Налаштування (тема/розмір/банер/QR) ----
  settings.init({ onSizeChange: fitLive, onShowQr: showQr });

  window.addEventListener("resize", fitLive);
  window.addEventListener("orientationchange", () => setTimeout(fitLive, 300));

  fitLive();
}
