// Тонка обгортка над localStorage із безпечним fallback.
// Прибирає розсипані по модулях try/catch.
window.VS = window.VS || {};

(function (VS) {
  "use strict";

  function get(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function set(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  VS.store = { get: get, set: set };
})(window.VS);
