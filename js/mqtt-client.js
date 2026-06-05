// Транспорт (MQTT по WebSocket) + протокол повідомлень.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;
  var U = VS.utils;

  // Протокол повідомлень у темі velyki/<room>:
  //   { type: "live",   text: "..." } — поточний рядок (publish з retain:true)
  //   { type: "commit", text: "..." } — зафіксувати рядок в історію (без retain)
  function encode(type, text) { return JSON.stringify({ type: type, text: text }); }

  function decode(raw) {
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.type === "string") return o;
    } catch (e) {}
    // Сумісність: голий текст трактуємо як live
    return { type: "live", text: raw };
  }

  // Підключитися до брокера. onMessage===null → лише публікація (Sender).
  // Повертає { client, topic } або null, якщо бібліотека недоступна.
  function connect(room, onMessage, statusEl) {
    if (typeof mqtt === "undefined") {
      U.setStatus(statusEl, "err", "немає бібліотеки MQTT");
      return null;
    }
    var topic = C.TOPIC_PREFIX + room;
    var clientId = "velyki_" + Math.random().toString(16).slice(2, 10);
    var client = mqtt.connect(C.BROKER, {
      clientId: clientId,
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 8000,
      keepalive: 30
    });

    client.on("connect", function () {
      U.setStatus(statusEl, "ok", "з'єднано");
      if (onMessage) client.subscribe(topic);
    });
    client.on("reconnect", function () { U.setStatus(statusEl, "", "перепідключення…"); });
    client.on("offline", function () { U.setStatus(statusEl, "", "немає мережі…"); });
    client.on("close", function () { U.setStatus(statusEl, "", "роз'єднано…"); });
    client.on("error", function () { U.setStatus(statusEl, "err", "помилка з'єднання"); });

    if (onMessage) {
      client.on("message", function (t, payload) {
        if (t !== topic) return;
        onMessage(payload.toString());
      });
    }

    return { client: client, topic: topic };
  }

  VS.mqtt = { connect: connect, encode: encode, decode: decode };
})(window.VS);
