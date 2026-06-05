// Панель налаштувань Display: тема, розмір шрифту, шестірня, банер автоблокування.
window.VS = window.VS || {};

(function (VS) {
  "use strict";
  var C = VS.config;
  var U = VS.utils;
  var S = VS.store;
  var $ = U.$;

  var currentSize = 1;

  function applyTheme(theme) {
    if (theme === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
    S.set(C.LS_THEME, theme);
    var dk = $("theme-dark"), lt = $("theme-light");
    if (dk && lt) {
      if (theme === "light") { lt.classList.remove("off"); dk.classList.add("off"); }
      else { dk.classList.remove("off"); lt.classList.add("off"); }
    }
  }

  function getSize() { return currentSize; }

  // hooks: { onSizeChange: fn, onShowQr: fn }
  function init(hooks) {
    hooks = hooks || {};

    var theme = S.get(C.LS_THEME, "dark");
    currentSize = parseFloat(S.get(C.LS_SIZE, "1")) || 1;
    applyTheme(theme);
    $("size-range").value = currentSize;

    $("gear").addEventListener("click", function () { $("settings").classList.toggle("open"); });

    $("size-range").addEventListener("input", function () {
      currentSize = parseFloat($("size-range").value) || 1;
      S.set(C.LS_SIZE, $("size-range").value);
      if (hooks.onSizeChange) hooks.onSizeChange();
    });

    $("theme-dark").addEventListener("click", function () { applyTheme("dark"); });
    $("theme-light").addEventListener("click", function () { applyTheme("light"); });

    $("show-qr").addEventListener("click", function () {
      if (hooks.onShowQr) hooks.onShowQr();
      $("settings").classList.remove("open");
    });

    // Банер автоблокування (одноразовий)
    if (!S.get(C.LS_WAKE, null)) $("wake-hint").classList.add("show");
    $("wake-ok").addEventListener("click", function () {
      $("wake-hint").classList.remove("show");
      S.set(C.LS_WAKE, "1");
    });
  }

  VS.settings = { init: init, applyTheme: applyTheme, getSize: getSize };
})(window.VS);
