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
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED
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
  let message = "";   // поточне атомарне повідомлення для tele/marquee (одна відправка)

  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  // Поточний зсув #live (px) із матриці трансформації — щоб продовжити рух без стрибка
  // на початок при зміні швидкості/розміру.
  function readTranslate() {
    const t = getComputedStyle(liveEl).transform;
    if (!t || t === "none") return null;
    const inner = t.slice(t.indexOf("(") + 1, t.lastIndexOf(")"));
    const v = inner.split(",").map(function (n) { return parseFloat(n); });
    if (t.indexOf("matrix3d") === 0) {
      return (mode === MODE_MARQUEE) ? v[12] : v[13];
    }
    return (mode === MODE_MARQUEE) ? v[4] : v[5]; // matrix(a,b,c,d,tx,ty)
  }

  // Налаштувати CSS-анімацію руху під поточний контент/швидкість.
  // ЄДИНЕ місце, де читаємо layout (scrollHeight/scrollWidth) — і лише на ЗМІНУ
  // контенту/розміру, а не щокадрово. Далі рух веде CSS сам.
  // continueFromCurrent — продовжити з поточної позиції (зміна швидкості/розміру),
  // а не запускати з початку.
  function setMotionAnim(continueFromCurrent) {
    if (!message) {                     // нема тексту — нема руху
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

    // Продовження: обчислюємо пройдену частку p від поточного зсуву й вносимо її як
    // від'ємний animation-delay у ті самі keyframes (full from→to). Так рух не «стрибає»
    // на старт, а цілісність нескінченного циклу зберігається.
    let delay = 0;
    if (continueFromCurrent && distance > 0) {
      const cur = readTranslate();
      if (cur != null) {
        let p = (from - cur) / distance;
        if (p < 0 || p >= 1) p = 0;
        delay = -p * dur;
      }
    }

    liveEl.style.setProperty("--vs-from", from + "px");
    liveEl.style.setProperty("--vs-to", to + "px");
    liveEl.style.setProperty("--vs-dur", dur + "s");
    // Перезапустити анімацію, щоб нові значення застосувались. Один reflow на зміну
    // контенту (не на кадр): inline-"none" → reflow → повний inline-shorthand із delay.
    const name = (mode === MODE_MARQUEE) ? "vs-marquee" : "vs-tele";
    liveEl.style.animation = "none";
    void liveEl.offsetWidth;
    liveEl.style.animation = name + " " + dur + "s linear " + delay + "s infinite";
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
      // tele / marquee — показати поточне повідомлення, рух веде CSS-анімація.
      liveEl.textContent = message;
      applyMotionFont();
      setMotionAnim();
    }
  }

  return {
    // fit/scroll: показ поточного (live) тексту під час набору.
    setText(text) {
      if (isMotion()) return; // у режимах руху контент керується через showLine
      liveEl.textContent = text;
      render();
    },

    // tele/marquee: показати одну відправку як окреме атомарне повідомлення —
    // нова відправка ЗАМІНЮЄ попередню (без накопичення), рух стартує з початку.
    showLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      message = text;
      liveEl.textContent = message;
      applyMotionFont();
      setMotionAnim();
    },

    setMode(m) {
      m = m || DEFAULT_MODE;
      if (m === mode) return;
      mode = m;
      if (isMotion()) message = ""; // нова сесія показу — без попереднього повідомлення
      render();
    },
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      if (isMotion()) setMotionAnim(true); // нова швидкість — продовжити з поточної позиції
    },
    refresh() {
      if (isMotion()) {
        applyMotionFont();
        setMotionAnim(true); // зміна розміру/геометрії — рух продовжується, а не з початку
      } else if (mode === MODE_SCROLL) {
        // Зберегти позицію прокрутки при зміні розміру (текст лишається на місці).
        const prev = wrapEl.scrollHeight;
        const ratio = prev > 0 ? wrapEl.scrollTop / prev : 0;
        render();
        wrapEl.scrollTop = ratio * wrapEl.scrollHeight;
      } else {
        render(); // fit — перерахунок вписаного шрифту
      }
    }
  };
}
