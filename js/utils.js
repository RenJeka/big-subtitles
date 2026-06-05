// Дрібні хелпери: DOM, генерація токена, парсинг URL, кімната, статус, QR-модал.
import { LS_ROOM, LS_KEY, TOKEN_ALPHABET, TOKEN_LENGTH, QR_SIZE, QR_CORRECT_LEVEL, TEXT_QR_UNAVAILABLE } from "./config.js";
import * as store from "./store.js";

export function $(id) { return document.getElementById(id); }

export function show(screenId) {
  const screens = document.querySelectorAll(".screen");
  for (let i = 0; i < screens.length; i++) screens[i].classList.remove("active");
  $(screenId).classList.add("active");
}

// Випадковий токен кімнати (base62, довжина TOKEN_LENGTH — єдиний «секрет» парування).
export function makeToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

export function getHashParam(name) {
  const parts = location.hash.replace(/^#/, "").split("&");
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split("=");
    if (kv[0] === name) return decodeURIComponent(kv[1] || "");
  }
  return null;
}

export function getQueryParam(name) {
  const parts = location.search.replace(/^\?/, "").split("&");
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split("=");
    if (kv[0] === name) return decodeURIComponent(kv[1] || "");
  }
  return null;
}

// Кімната: спершу з #room=, інакше з localStorage.
export function resolveRoom() {
  let room = getHashParam("room");
  if (!room) room = store.get(LS_ROOM, null);
  return room || null;
}

export function saveRoom(room) {
  store.set(LS_ROOM, room);
}

// E2E-ключ (base64url): спершу з #…&k=, інакше з localStorage. Парний до кімнати.
export function resolveKey() {
  let key = getHashParam("k");
  if (!key) key = store.get(LS_KEY, null);
  return key || null;
}

export function saveKey(key) {
  store.set(LS_KEY, key);
}

// Оновити індикатор з'єднання. state: "ok" | "err" | "" (нейтральний).
export function setStatus(el, state, text) {
  el.classList.remove("is-connected", "is-error");
  if (state === "ok") el.classList.add("is-connected");
  if (state === "err") el.classList.add("is-error");
  el.querySelector(".txt").textContent = text;
}

// Закривати панель (прибирати клас "open") за кліком поза нею.
// ignoreEls — кнопки-перемикачі панелі: клік по них не закриває (інакше той самий
// клік, що відкрив панель, одразу б її закрив).
export function bindOutsideClose(panelEl, ...ignoreEls) {
  document.addEventListener("click", (e) => {
    if (!panelEl.classList.contains("open")) return;
    if (panelEl.contains(e.target)) return;
    for (let i = 0; i < ignoreEls.length; i++) {
      if (ignoreEls[i] && ignoreEls[i].contains(e.target)) return;
    }
    panelEl.classList.remove("open");
  });
}

// ===================== QR-модал =====================
// Лінива ініціалізація: QR генерується лише раз (при першому відкритті).
let _qrReady = false;

export function initQrModal(room, keyB64) {
  const senderUrl = location.origin + location.pathname + "?role=sender#room=" + room + "&k=" + keyB64;
  $("qr-link").textContent = senderUrl;
  try {
    if (typeof QRCode !== "undefined") {
      new QRCode($("qr"), {
        text: senderUrl,
        width: QR_SIZE, height: QR_SIZE,
        correctLevel: QRCode.CorrectLevel[QR_CORRECT_LEVEL]
      });
    } else {
      $("qr").textContent = TEXT_QR_UNAVAILABLE;
    }
  } catch (e) {
    $("qr").textContent = TEXT_QR_UNAVAILABLE;
  }
  // Закрити за кліком поза модального вікна
  const modal = $("qr-modal");
  modal.addEventListener("click", (e) => { if (e.target === modal) closeQrModal(); });
  $("qr-modal-close").addEventListener("click", closeQrModal);
  _qrReady = true;
}

export function openQrModal() {
  if (!_qrReady) return;
  $("qr-modal").classList.add("open");
}

export function closeQrModal() {
  $("qr-modal").classList.remove("open");
}
