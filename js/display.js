// Режим Display (iPad): великий автомасштабований live-текст, історія, QR.
// Тема/розмір/банер делеговано в VS.settings, автомасштаб — у VS.fitText.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;
  var U = VS.utils;
  var M = VS.mqtt;
  var F = VS.fitText;
  var ST = VS.settings;
  var $ = U.$;

  function init() {
    U.show("screen-display");

    var room = U.resolveRoom();
    if (!room) { room = U.makeToken(); }
    U.saveRoom(room);
    if (location.hash.indexOf("room=") === -1) {
      location.hash = "room=" + room;
    }

    var historyEl = $("history");
    var liveEl = $("live");
    var liveWrap = $("live-wrap");
    var qrMinimized = false;

    function fitLive() { F.fit(liveEl, liveWrap, ST.getSize()); }

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
      var d = document.createElement("div");
      d.className = "line line-enter";
      d.textContent = text;
      historyEl.appendChild(d);
      requestAnimationFrame(function () { d.classList.remove("line-enter"); });
      while (historyEl.children.length > C.HISTORY_LIMIT) {
        historyEl.removeChild(historyEl.firstChild);
      }
      historyEl.scrollTop = historyEl.scrollHeight;
      fitLive();
    }

    function minimizeQr() { $("qr-box").classList.add("minimized"); qrMinimized = true; }
    function showQr() { $("qr-box").classList.remove("minimized"); qrMinimized = false; }

    M.connect(room, function (raw) {
      var msg = M.decode(raw);
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
    $("qr-toggle").addEventListener("click", minimizeQr);

    // ---- Налаштування (тема/розмір/банер/QR) ----
    ST.init({ onSizeChange: fitLive, onShowQr: showQr });

    window.addEventListener("resize", fitLive);
    window.addEventListener("orientationchange", function () { setTimeout(fitLive, 300); });

    fitLive();
  }

  VS.display = { init: init };
})(window.VS);
