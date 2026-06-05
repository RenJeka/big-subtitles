// Автомасштаб тексту: підбирає найбільший розмір шрифту, що вміщається в контейнер.
import { FIT_MIN_FONT_PX, FIT_HEIGHT_RATIO, FIT_MAX_STEPS } from "./config.js";

// Бінарний пошук розміру: el вписується у container з урахуванням scale (0..1).
export function fit(el, container, scale) {
  const text = el.textContent;
  if (!text) { el.style.fontSize = ""; return; }
  scale = scale || 1;
  const max = Math.floor(container.clientHeight * FIT_HEIGHT_RATIO * scale);
  let lo = FIT_MIN_FONT_PX, hi = Math.max(FIT_MIN_FONT_PX, max), best = FIT_MIN_FONT_PX;
  for (let step = 0; step < FIT_MAX_STEPS && lo <= hi; step++) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = mid + "px";
    if (el.scrollHeight <= container.clientHeight && el.scrollWidth <= container.clientWidth) {
      best = mid; lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = best + "px";
}
