// Контролер показу великого live-тексту (#live) за обраним режимом.
// fit — автомасштаб; scroll — фіксований розмір + ручний скрол;
// tele/marquee — авто-рух ЧИСТОЮ CSS-анімацією (без JS у циклі).
//
// Стратегія руху: жодного requestAnimationFrame. Рух виконує CSS @keyframes
// (linear infinite) на композиторі GPU. JS лише ОДИН раз на зміну контенту/розміру/
// швидкості вимірює геометрію й задає CSS-змінні --vs-from/--vs-to/--vs-dur. Під час
// самого руху браузер нічого не перераховує — звідси максимальна плавність.
import {
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  TELE_PX_BASE, TELE_PX_STEP, MARQUEE_PX_BASE, MARQUEE_PX_STEP,
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED,
  MARQUEE_SEP, ACCUMULATE_MAX_CHARS
} from "./config.js";
import { fit } from "./fit-text.js";

const ALL_MODE_CLASSES = ["mode-fit", "mode-scroll", "mode-tele", "mode-marquee"];

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
// getSize — функція, що повертає поточний масштаб (SIZE_MIN..SIZE_MAX).
export function createLiveView(liveEl, wrapEl, getSize) {
  let mode = DEFAULT_MODE;
  let speed = DEFAULT_SPEED;
  let buffer = "";   // накопичений текст для tele/marquee

  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  // Налаштувати CSS-анімацію руху під поточний контент/швидкість.
  // ЄДИНЕ місце, де читаємо layout (scrollHeight/scrollWidth) — і лише на ЗМІНУ
  // контенту/розміру, а не щокадрово. Далі рух веде CSS сам.
  function setMotionAnim() {
    if (!buffer) {                      // нема тексту — нема руху
      liveEl.style.animation = "none";
      liveEl.style.transform = "";
      return;
    }
    let from, to, distance;
    if (mode === MODE_MARQUEE) {
      const sw = liveEl.scrollWidth;
      from = wrapEl.clientWidth; to = -sw; distance = wrapEl.clientWidth + sw;
    } else {
      const sh = liveEl.scrollHeight;
      from = wrapEl.clientHeight; to = -sh; distance = wrapEl.clientHeight + sh;
    }
    const dur = Math.max(1, distance / pxPerSec(mode, speed)); // сек, сталий px/с
    liveEl.style.setProperty("--vs-from", from + "px");
    liveEl.style.setProperty("--vs-to", to + "px");
    liveEl.style.setProperty("--vs-dur", dur + "s");
    // Перезапустити анімацію, щоб нові значення застосувались. Один reflow на зміну
    // контенту (не на кадр): inline-"none" → reflow → "" (повертає клас із keyframes).
    liveEl.style.animation = "none";
    void liveEl.offsetWidth;
    liveEl.style.animation = "";
  }

  // Скинути всі inline-стилі/змінні, які виставляли різні режими.
  function resetStyles() {
    liveEl.style.fontSize = "";
    liveEl.style.transform = "";
    liveEl.style.animation = "";
    liveEl.style.removeProperty("--vs-from");
    liveEl.style.removeProperty("--vs-to");
    liveEl.style.removeProperty("--vs-dur");
    wrapEl.scrollTop = 0;
  }

  function render() {
    resetStyles();
    ALL_MODE_CLASSES.forEach((c) => wrapEl.classList.remove(c));
    wrapEl.classList.add("mode-" + mode);

    if (mode === MODE_FIT) {
      fit(liveEl, wrapEl, getSize());
    } else if (mode === MODE_SCROLL) {
      applyMotionFont();
    } else {
      // tele / marquee — показати накопичений буфер, рух веде CSS-анімація.
      liveEl.textContent = buffer;
      applyMotionFont();
      setMotionAnim();
    }
  }

  // Обрізати початок буфера по межі рядка/роздільника, якщо перевищено ліміт.
  function trimLeading(buf) {
    if (buf.length <= ACCUMULATE_MAX_CHARS) return buf;
    let cut = buf.length - ACCUMULATE_MAX_CHARS;
    const sep = (mode === MODE_MARQUEE) ? MARQUEE_SEP : "\n";
    const idx = buf.indexOf(sep, cut);
    if (idx !== -1) cut = idx + sep.length;
    return buf.slice(cut);
  }

  return {
    // fit/scroll: показ поточного (live) тексту під час набору.
    setText(text) {
      if (isMotion()) return; // у режимах руху контент керується через appendLine
      liveEl.textContent = text;
      render();
    },

    // tele/marquee: додати зафіксований рядок до потоку й переналаштувати CSS-анімацію.
    appendLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      const sep = (mode === MODE_MARQUEE) ? MARQUEE_SEP : "\n";
      buffer = buffer ? (buffer + sep + text) : text;
      buffer = trimLeading(buffer);
      liveEl.textContent = buffer;
      applyMotionFont();
      setMotionAnim();
    },

    setMode(m) {
      m = m || DEFAULT_MODE;
      if (m === mode) return;
      mode = m;
      if (isMotion()) buffer = ""; // нова сесія накопичення
      render();
    },
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      if (isMotion()) setMotionAnim();
    },
    refresh() {
      if (isMotion()) { applyMotionFont(); setMotionAnim(); }
      else render();
    }
  };
}
