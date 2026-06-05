// Режим Display (iPad): великий автомасштабований текст, історія, QR, налаштування.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;
  var U = VS.utils;
  var M = VS.mqtt;
  var $ = U.$;

  function applyTheme(theme) {
    if (theme === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
    try { localStorage.setItem(C.LS_THEME, theme); } catch (e) {}
    var dk = $("theme-dark"), lt = $("theme-light");
    if (dk && lt) {
      if (theme === "light") { lt.classList.remove("off"); dk.classList.add("off"); }
      else { dk.classList.remove("off"); lt.classList.add("off"); }
    }
  }

  function init() {
    U.show("screen-display");

    var room = U.resolveRoom();
    if (!room) { room = U.makeToken(); }
    U.saveRoom(room);
    if (location.hash.indexOf("room=") === -1) {
      location.hash = "room=" + room;
    }

    // Налаштування з localStorage
    var theme, size;
    try { theme = localStorage.getItem(C.LS_THEME) || "dark"; } catch (e) { theme = "dark"; }
    try { size = parseFloat(localStorage.getItem(C.LS_SIZE)) || 1; } catch (e) { size = 1; }
    applyTheme(theme);
    $("size-range").value = size;

    var historyEl = $("history");
    var liveEl = $("live");
    var liveWrap = $("live-wrap");
    var history = [];

    function render() {
      historyEl.innerHTML = "";
      for (var i = 0; i < history.length; i++) {
        var d = document.createElement("div");
        d.className = "line";
        d.textContent = history[i];
        historyEl.appendChild(d);
      }
      historyEl.scrollTop = historyEl.scrollHeight;
      fitLive();
    }

    // Бінарний пошук найбільшого розміру шрифту, що вміщається у контейнер.
    function fitLive() {
      var text = liveEl.textContent;
      if (!text) { liveEl.style.fontSize = ""; return; }
      var scale = parseFloat($("size-range").value) || 1;
      var max = Math.floor(liveWrap.clientHeight * 0.9 * scale);
      var min = 18;
      var lo = min, hi = Math.max(min, max), best = min;
      for (var step = 0; step < 18 && lo <= hi; step++) {
        var mid = Math.floor((lo + hi) / 2);
        liveEl.style.fontSize = mid + "px";
        if (liveEl.scrollHeight <= liveWrap.clientHeight && liveEl.scrollWidth <= liveWrap.clientWidth) {
          best = mid; lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      liveEl.style.fontSize = best + "px";
    }

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

    function pushHistory(text) {
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      history.push(text);
      while (history.length > C.HISTORY_LIMIT) history.shift();
      render();
    }

    var qrMinimized = false;

    M.connect(room, function (raw) {
      var msg = M.decode(raw);
      if (msg.type === "commit") {
        pushHistory(msg.text);
        setLive("");
      } else {
        setLive(msg.text || "");
      }
      // згорнути QR після першого реального тексту
      if (!qrMinimized && msg.text && msg.text.trim().length) {
        $("qr-box").classList.add("minimized");
        qrMinimized = true;
      }
    }, $("status-display"));

    // ---- QR ----
    var senderUrl = location.origin + location.pathname + "?role=sender#room=" + room;
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

    $("qr-toggle").addEventListener("click", function () {
      $("qr-box").classList.add("minimized");
      qrMinimized = true;
    });
    $("show-qr").addEventListener("click", function () {
      $("qr-box").classList.remove("minimized");
      qrMinimized = false;
      $("settings").classList.remove("open");
    });

    // ---- Налаштування ----
    $("gear").addEventListener("click", function () { $("settings").classList.toggle("open"); });
    $("size-range").addEventListener("input", function () {
      try { localStorage.setItem(C.LS_SIZE, $("size-range").value); } catch (e) {}
      fitLive();
    });
    $("theme-dark").addEventListener("click", function () { applyTheme("dark"); });
    $("theme-light").addEventListener("click", function () { applyTheme("light"); });

    // ---- Банер автоблокування ----
    var dismissed;
    try { dismissed = localStorage.getItem(C.LS_WAKE); } catch (e) { dismissed = null; }
    if (!dismissed) $("wake-hint").classList.add("show");
    $("wake-ok").addEventListener("click", function () {
      $("wake-hint").classList.remove("show");
      try { localStorage.setItem(C.LS_WAKE, "1"); } catch (e) {}
    });

    window.addEventListener("resize", fitLive);
    window.addEventListener("orientationchange", function () { setTimeout(fitLive, 300); });

    render();
  }

  VS.display = { init: init, applyTheme: applyTheme };
})(window.VS);
