// Дрібні хелпери: DOM, генерація токена, парсинг URL, кімната, статус.
import { LS_ROOM, TOKEN_ALPHABET, TOKEN_LENGTH } from "./config.js";
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

// Оновити індикатор з'єднання. state: "ok" | "err" | "" (нейтральний).
export function setStatus(el, state, text) {
  el.classList.remove("is-connected", "is-error");
  if (state === "ok") el.classList.add("is-connected");
  if (state === "err") el.classList.add("is-error");
  el.querySelector(".txt").textContent = text;
}
