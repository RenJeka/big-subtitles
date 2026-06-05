// Режим Sender (телефон): textarea з debounce-публікацією, Enter фіксує рядок.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;
  var U = VS.utils;
  var M = VS.mqtt;
  var $ = U.$;

  function init() {
    U.show("screen-sender");
    document.body.classList.remove("theme-light"); // sender завжди темний

    var room = U.resolveRoom();
    if (!room) {
      $("input").value = "";
      $("input").placeholder = "Немає кімнати. Відскануйте QR з дисплея.";
      $("input").disabled = true;
      U.setStatus($("status-sender"), "err", "немає кімнати");
      return;
    }
    U.saveRoom(room);

    var conn = M.connect(room, null, $("status-sender"));
    var input = $("input");

    function publish(type, text, retain) {
      if (!conn || !conn.client) return;
      conn.client.publish(conn.topic, M.encode(type, text), { retain: !!retain, qos: 0 });
    }

    // debounce live-публікації
    var timer = null;
    function scheduleLive() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        publish("live", input.value, true);
      }, C.DEBOUNCE_MS);
    }

    input.addEventListener("input", scheduleLive);

    // Enter (без Shift) — зафіксувати рядок в історію дисплея
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        var line = input.value;
        if (timer) { clearTimeout(timer); timer = null; }
        if (line.trim().length) publish("commit", line, false);
        input.value = "";
        publish("live", "", true); // очистити retained live
      }
    });

    $("clear-btn").addEventListener("click", function () {
      input.value = "";
      if (timer) { clearTimeout(timer); timer = null; }
      publish("live", "", true);
      input.focus();
    });

    // фокус на полі для виклику клавіатури
    setTimeout(function () { input.focus(); }, 300);
  }

  VS.sender = { init: init };
})(window.VS);
