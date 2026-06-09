// Автомасштаб тексту: підбирає найбільший розмір шрифту, що вміщається в доступній площі.
import { FIT_MIN_FONT_PX, FIT_HEIGHT_RATIO, FIT_MAX_STEPS } from "./config.js";

// Бінарний пошук розміру: el вписується в availW × availH з урахуванням scale (0..1).
// Caller відповідає за передачу вже вирахуваних розмірів (без padding контейнера).
export function fit(el, availW, availH, scale) {
  if (!el.textContent) { el.style.fontSize = ""; return; }
  scale = scale || 1;
  const maxFont = Math.floor(availH * FIT_HEIGHT_RATIO * scale);
  let lo = FIT_MIN_FONT_PX, hi = Math.max(FIT_MIN_FONT_PX, maxFont), best = FIT_MIN_FONT_PX;
  for (let step = 0; step < FIT_MAX_STEPS && lo <= hi; step++) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = mid + "px";
    if (el.scrollHeight <= availH && el.scrollWidth <= availW) {
      best = mid; lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = best + "px";
}
