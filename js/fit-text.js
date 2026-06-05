// Автомасштаб тексту: підбирає найбільший розмір шрифту, що вміщається в контейнер.
window.VS = window.VS || {};

(function (VS) {
  "use strict";

  // Бінарний пошук розміру: el вписується у container з урахуванням scale (0..1).
  function fit(el, container, scale) {
    var text = el.textContent;
    if (!text) { el.style.fontSize = ""; return; }
    scale = scale || 1;
    var max = Math.floor(container.clientHeight * 0.9 * scale);
    var min = 18;
    var lo = min, hi = Math.max(min, max), best = min;
    for (var step = 0; step < 18 && lo <= hi; step++) {
      var mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = mid + "px";
      if (el.scrollHeight <= container.clientHeight && el.scrollWidth <= container.clientWidth) {
        best = mid; lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    el.style.fontSize = best + "px";
  }

  VS.fitText = { fit: fit };
})(window.VS);
