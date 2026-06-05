// Точка входу: визначає режим за ?role= або показує стартовий екран.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var U = VS.utils;

  function boot() {
    var role = U.getQueryParam("role");
    if (role === "display") { VS.display.init(); return; }
    if (role === "sender") { VS.sender.init(); return; }

    // стартовий екран
    U.show("screen-start");
    U.$("btn-display").addEventListener("click", function () { VS.display.init(); });
    U.$("btn-sender").addEventListener("click", function () { VS.sender.init(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.VS);
