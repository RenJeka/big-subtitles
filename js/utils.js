// Дрібні хелпери: DOM, генерація токена, парсинг URL, кімната, статус.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;

  function $(id) { return document.getElementById(id); }

  function show(screenId) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
    $(screenId).classList.add("active");
  }

  // Випадковий токен кімнати: 24 символи base62 (єдиний «секрет» парування).
  function makeToken() {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function getHashParam(name) {
    var h = location.hash.replace(/^#/, "");
    var parts = h.split("&");
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split("=");
      if (kv[0] === name) return decodeURIComponent(kv[1] || "");
    }
    return null;
  }

  function getQueryParam(name) {
    var s = location.search.replace(/^\?/, "");
    var parts = s.split("&");
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split("=");
      if (kv[0] === name) return decodeURIComponent(kv[1] || "");
    }
    return null;
  }

  // Кімната: спершу з #room=, інакше з localStorage.
  function resolveRoom() {
    var room = getHashParam("room");
    if (!room) { try { room = localStorage.getItem(C.LS_ROOM); } catch (e) {} }
    return room || null;
  }

  function saveRoom(room) {
    try { localStorage.setItem(C.LS_ROOM, room); } catch (e) {}
  }

  // Оновити індикатор з'єднання. state: "ok" | "err" | "" (нейтральний).
  function setStatus(el, state, text) {
    el.classList.remove("is-connected", "is-error");
    if (state === "ok") el.classList.add("is-connected");
    if (state === "err") el.classList.add("is-error");
    el.querySelector(".txt").textContent = text;
  }

  VS.utils = {
    $: $,
    show: show,
    makeToken: makeToken,
    getHashParam: getHashParam,
    getQueryParam: getQueryParam,
    resolveRoom: resolveRoom,
    saveRoom: saveRoom,
    setStatus: setStatus
  };
})(window.VS);
