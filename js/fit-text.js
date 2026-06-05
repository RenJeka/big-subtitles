// Автомасштаб тексту: підбирає найбільший розмір шрифту, що вміщається в контейнер.

// Бінарний пошук розміру: el вписується у container з урахуванням scale (0..1).
export function fit(el, container, scale) {
  const text = el.textContent;
  if (!text) { el.style.fontSize = ""; return; }
  scale = scale || 1;
  const max = Math.floor(container.clientHeight * 0.9 * scale);
  const min = 18;
  let lo = min, hi = Math.max(min, max), best = min;
  for (let step = 0; step < 18 && lo <= hi; step++) {
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
