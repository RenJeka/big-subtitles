// Контролер показу великого live-тексту (#live) за обраним режимом.
// fit — автомасштаб; scroll — фіксований розмір + ручний скрол;
// tele/marquee — авто-рух ЧИСТОЮ CSS-анімацією (без JS у циклі).
//
// Модель руху (tele/marquee) — ЧЕРГА атомарних повідомлень:
//  • кожне повідомлення проходить рух РІВНО ОДИН раз (без зациклення);
//  • нова відправка під час показу НЕ перериває поточну, а стає в чергу й
//    програється після неї («додавати в кінець»);
//  • коли черга порожня — останнє повідомлення ЗАСТИГАЄ видимим
//    (animation-fill-mode: forwards тримає кінцевий кадр).
//
// Стратегія руху: жодного requestAnimationFrame. Рух виконує CSS @keyframes
// (linear, один прохід) на композиторі GPU. JS лише ОДИН раз на зміну контенту/
// розміру/швидкості вимірює геометрію й задає CSS-змінні --vs-from/--vs-to/--vs-dur,
// а перехід до наступного повідомлення черги слухає через подію `animationend`.
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

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// liveEl — елемент тексту (#live); wrapEl — контейнер (#live-wrap);
// getSize — функція, що повертає поточний масштаб (SIZE_MIN..SIZE_MAX).
export function createLiveView(liveEl, wrapEl, getSize) {
  let mode = DEFAULT_MODE;
  let speed = DEFAULT_SPEED;
  let current = "";    // повідомлення, що зараз показується/застигло на екрані
  let queue = [];      // повідомлення, що чекають своєї черги (tele/marquee)
  let playing = false; // триває рух поточного повідомлення (ще не дограло)

  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  // Геометрія руху для поточного контенту: вхід з-за межі екрана (from) до кінцевої
  // ВИДИМОЇ позиції (to). Якщо текст уміщається — застигає вирівняним до початку (to=0);
  // якщо ні — застигає кінцем (показано «хвіст», який щойно прокрутили).
  function motionEndpoints() {
    let from, to;
    if (mode === MODE_MARQUEE) {
      from = wrapEl.clientWidth;
      to = Math.min(0, wrapEl.clientWidth - liveEl.scrollWidth);
    } else {
      from = wrapEl.clientHeight;
      to = Math.min(0, wrapEl.clientHeight - liveEl.scrollHeight);
    }
    return { from: from, to: to, distance: from - to };
  }

  function axisTransform(px) {
    return (mode === MODE_MARQUEE)
      ? "translate3d(" + px + "px,0,0)"
      : "translate3d(0," + px + "px,0)";
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

  // Тримати поточне повідомлення застиглим у кінцевій (видимій) позиції — без анімації.
  function restStatic() {
    liveEl.style.animation = "none";
    liveEl.style.transform = current ? axisTransform(motionEndpoints().to) : "";
  }

  // Налаштувати CSS-анімацію руху під поточний контент/швидкість (ОДИН прохід + forwards).
  // ЄДИНЕ місце, де читаємо layout (scrollHeight/scrollWidth) — і лише на ЗМІНУ
  // контенту/розміру, а не щокадрово. Далі рух веде CSS сам.
  // continueFromCurrent — продовжити з поточної позиції (зміна швидкості/розміру),
  // а не запускати з початку.
  function setMotionAnim(continueFromCurrent) {
    if (!current) {                     // нема тексту — нема руху
      liveEl.style.animation = "none";
      liveEl.style.transform = "";
      return;
    }
    const ep = motionEndpoints();
    const dur = Math.max(1, ep.distance / pxPerSec(mode, speed)); // сек, сталий px/с

    // Продовження: обчислюємо пройдену частку p від поточного зсуву й вносимо її як
    // від'ємний animation-delay у ті самі keyframes (full from→to). Так рух не «стрибає»
    // на старт при зміні швидкості/розміру.
    let delay = 0;
    if (continueFromCurrent && ep.distance > 0) {
      const cur = readTranslate();
      if (cur != null) {
        let p = (ep.from - cur) / ep.distance;
        if (p < 0 || p >= 1) p = 0;
        delay = -p * dur;
      }
    }

    liveEl.style.setProperty("--vs-from", ep.from + "px");
    liveEl.style.setProperty("--vs-to", ep.to + "px");
    liveEl.style.setProperty("--vs-dur", dur + "s");
    // Перезапустити анімацію, щоб нові значення застосувались. Один reflow на зміну
    // контенту (не на кадр): inline-"none" → reflow → повний inline-shorthand із delay.
    // «1 forwards» — рівно один прохід, кінцевий (видимий) кадр лишається застиглим.
    const name = (mode === MODE_MARQUEE) ? "vs-marquee" : "vs-tele";
    liveEl.style.animation = "none";
    void liveEl.offsetWidth;
    liveEl.style.animation = name + " " + dur + "s linear " + delay + "s 1 forwards";
  }

  // Почати показ одного повідомлення (з початку). За reduced-motion — статично, без руху.
  function playMotion(text) {
    current = text;
    liveEl.textContent = current;
    applyMotionFont();
    if (prefersReducedMotion()) {
      playing = false;
      liveEl.style.animation = "none";
      liveEl.style.transform = "";
      return;
    }
    playing = true;
    setMotionAnim(false);
  }

  // Поточне повідомлення дограло → взяти наступне з черги або застигнути на останньому.
  function onMotionEnd() {
    if (!isMotion() || !playing) return;
    if (queue.length) {
      playMotion(queue.shift());
    } else {
      playing = false; // черга порожня — останнє лишається видимим (forwards тримає кадр)
    }
  }
  liveEl.addEventListener("animationend", onMotionEnd);

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
      // tele / marquee — показати поточне повідомлення (рух / застигле — за станом).
      liveEl.textContent = current;
      applyMotionFont();
      if (playing) setMotionAnim(false);
      else restStatic();
    }
  }

  return {
    // fit/scroll: показ поточного (live) тексту під час набору.
    setText(text) {
      if (isMotion()) return; // у режимах руху контент керується через showLine
      liveEl.textContent = text;
      render();
    },

    // tele/marquee: поставити одну відправку у чергу показу. Якщо зараз нічого не
    // рухається — починаємо одразу; інакше повідомлення чекає й програється по черзі
    // (поточне НЕ переривається).
    showLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      if (playing) { queue.push(text); return; }
      playMotion(text);
    },

    setMode(m) {
      m = m || DEFAULT_MODE;
      if (m === mode) return;
      mode = m;
      if (isMotion()) { queue = []; current = ""; playing = false; } // нова сесія показу
      render();
    },
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      // На льоту змінюємо темп лише активного руху; застигле повідомлення стоїть.
      if (isMotion() && playing) setMotionAnim(true);
    },
    refresh() {
      if (isMotion()) {
        applyMotionFont();
        if (playing) setMotionAnim(true); // рух триває — продовжити з поточної позиції
        else restStatic();                // застигле — оновити позицію під новий розмір
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
