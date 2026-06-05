// Контролер показу великого live-тексту (#live) за обраним режимом.
// Інкапсулює весь рендер: автомасштаб (fit), прокрутка, суфлер, бігуча строка.
// fit() лишається у fit-text.js і викликається звідси для режиму "fit".
import {
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  TELE_PX_BASE, TELE_PX_STEP, MARQUEE_PX_BASE, MARQUEE_PX_STEP,
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED
} from "./config.js";
import { fit } from "./fit-text.js";

const ALL_MODE_CLASSES = ["mode-fit", "mode-scroll", "mode-tele", "mode-marquee"];

// Чи просить система зменшити рух (вимикаємо авто-прокрутку/бігучку).
function prefersReducedMotion() {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Рівень швидкості → px/сек для відповідного режиму.
function pxPerSec(mode, speed) {
  if (mode === MODE_MARQUEE) return MARQUEE_PX_BASE + (speed - 1) * MARQUEE_PX_STEP;
  return TELE_PX_BASE + (speed - 1) * TELE_PX_STEP;
}

// Фіксований розмір шрифту для scroll/tele/marquee від налаштування розміру.
function scrollFontPx(wrapEl, size) {
  const base = Math.min(wrapEl.clientWidth, wrapEl.clientHeight);
  return Math.max(FIT_MIN_FONT_PX, Math.round(size * SCROLL_FONT_RATIO * base));
}

// liveEl — елемент тексту (#live); wrapEl — контейнер (#live-wrap);
// getSize — функція, що повертає поточний масштаб (0.35..1).
export function createLiveView(liveEl, wrapEl, getSize) {
  let mode = DEFAULT_MODE;
  let speed = DEFAULT_SPEED;
  let rafId = null;
  let pos = 0;       // поточне зміщення (px) для tele/marquee
  let lastTs = 0;

  function stopAnim() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    lastTs = 0;
  }

  // Скинути всі inline-стилі, які виставляли різні режими.
  function resetStyles() {
    liveEl.style.fontSize = "";
    liveEl.style.transform = "";
    wrapEl.scrollTop = 0;
  }

  function startAnim() {
    stopAnim();
    if (prefersReducedMotion()) {
      // Поважаємо reduced-motion: статичний показ без авто-руху.
      liveEl.style.transform = "";
      return;
    }
    pos = (mode === MODE_MARQUEE) ? wrapEl.clientWidth : wrapEl.clientHeight;
    const tick = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      pos -= pxPerSec(mode, speed) * dt;
      if (mode === MODE_MARQUEE) {
        if (pos <= -liveEl.scrollWidth) pos = wrapEl.clientWidth;
        liveEl.style.transform = "translateX(" + pos + "px)";
      } else {
        if (pos <= -liveEl.scrollHeight) pos = wrapEl.clientHeight;
        liveEl.style.transform = "translateY(" + pos + "px)";
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function render() {
    stopAnim();
    resetStyles();
    ALL_MODE_CLASSES.forEach((c) => wrapEl.classList.remove(c));
    wrapEl.classList.add("mode-" + mode);

    if (mode === MODE_FIT) {
      fit(liveEl, wrapEl, getSize());
      return;
    }
    // scroll / tele / marquee — фіксований розмір шрифту.
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
    if (mode === MODE_TELE || mode === MODE_MARQUEE) {
      startAnim();
    }
  }

  return {
    setText(text) {
      liveEl.textContent = text;
      render();
    },
    setMode(m) {
      if (m === mode) return;
      mode = m || DEFAULT_MODE;
      render();
    },
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      // Швидкість зчитується в циклі; перезапуск не обов'язковий, але оновимо рендер,
      // якщо анімація не активна (напр. щойно ввімкнули reduced-motion).
      if (!rafId && (mode === MODE_TELE || mode === MODE_MARQUEE)) render();
    },
    refresh() { render(); }
  };
}
