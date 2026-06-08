// Контролер показу великого live-тексту (#live) за обраним режимом.
// fit — автомасштаб; scroll — фіксований розмір + ручний скрол;
// tele/marquee — авто-рух ЧИСТОЮ CSS-анімацією (без JS у циклі).
//
// Модель руху (tele/marquee) — БЕЗПЕРЕРВНИЙ ПОТІК атомарних повідомлень:
//  • кожна відправка додає окремий видимий блок (.vs-msg) у кінець потоку —
//    повідомлення не зливаються в один текст і лишаються розрізнюваними;
//  • потік рухається в одному напрямку (вгору в суфлері, ліворуч у бігучці);
//    нове повідомлення «під'їжджає» слідом за попереднім, НЕ перериваючи його —
//    обидва можуть бути видимі одночасно (як стрічка чату/новин);
//  • коли нових повідомлень немає — потік ЗАСТИГАЄ на останньому видимому блоці
//    (animation-fill-mode: forwards тримає кінцевий кадр).
//
// Ручний скрол назад (tele/marquee): щойно користувач починає скролити/свайпати,
// авто-рух ПАУЗИТЬСЯ — перемикаємось на нативний overflow-скрол, конвертуючи поточний
// transform-зсув у еквівалентний scrollTop/scrollLeft (координата вмісту під верхньою/
// лівою межею = -tx = scroll). Через MOTION_SCROLL_RESUME_MS бездіяльності рух
// ВІДНОВЛЮЄТЬСЯ з поточної позиції тією ж швидкістю (зворотна конвертація). Нове
// повідомлення під час паузи лише тихо додається в кінець потоку — паузу не зриває.
//
// Стратегія руху: жодного requestAnimationFrame. Рух виконує CSS @keyframes
// (linear) на композиторі GPU. JS лише на КОЖНУ зміну вмісту (нове повідомлення/
// розмір/швидкість) вимірює сумарну геометрію потоку (scrollWidth/scrollHeight)
// і ПРОДОВЖУЄ рух із поточної позиції до нової кінцевої точки (--vs-from/--vs-to/
// --vs-dur через від'ємний animation-delay) — без стрибків і перезапусків з нуля.
import {
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  TELE_PX_BASE, TELE_PX_STEP, MARQUEE_PX_BASE, MARQUEE_PX_STEP,
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED,
  MOTION_SCROLL_RESUME_MS
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
  let hasContent = false; // чи є у потоці хоч одне повідомлення (.vs-msg)
  let animating = false;  // чи триває рух потоку до поточної кінцевої точки
  let scrubbing = false;  // користувач вручну скролить — авто-рух на паузі
  let resumeTimer = null; // таймер відновлення авто-руху після бездіяльності

  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  // Геометрія руху для поточного СУМАРНОГО вмісту потоку: вхід з-за межі екрана
  // (from) до кінцевої ВИДИМОЇ позиції (to), де останній (найновіший) блок
  // повністю видимий. Якщо потік коротший за екран — застигає вирівняним
  // до початку (to=0); якщо довший — видно «хвіст» із найновішим повідомленням.
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

  // Поточний зсув #live (px) із матриці трансформації — щоб продовжити рух без
  // стрибка при додаванні нового повідомлення / зміні швидкості/розміру.
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

  // Тримати потік застиглим у кінцевій (видимій) позиції — без анімації.
  function restStatic() {
    liveEl.style.animation = "none";
    liveEl.style.transform = hasContent ? axisTransform(motionEndpoints().to) : "";
  }

  // Налаштувати CSS-анімацію руху під поточний СУМАРНИЙ вміст потоку й швидкість.
  // ЄДИНЕ місце, де читаємо layout (scrollHeight/scrollWidth) — і лише на ЗМІНУ
  // вмісту/розміру/швидкості, а не щокадрово. Далі рух веде CSS сам.
  // continueFromCurrent — продовжити з поточної позиції (нове повідомлення подовжило
  // потік / змінилась швидкість/розмір), а не запускати з початку.
  function setMotionAnim(continueFromCurrent) {
    if (!hasContent) {                  // нема тексту — нема руху
      liveEl.style.animation = "none";
      liveEl.style.transform = "";
      return;
    }
    const ep = motionEndpoints();
    const dur = Math.max(1, ep.distance / pxPerSec(mode, speed)); // сек, сталий px/с

    // Продовження: обчислюємо пройдену частку p від поточного зсуву й вносимо її як
    // від'ємний animation-delay у ті самі keyframes (full from→to). Так рух не «стрибає»
    // на старт при додаванні повідомлення / зміні швидкості/розміру.
    let delay = 0;
    if (continueFromCurrent && ep.distance > 0) {
      const cur = readTranslate();
      if (cur != null) {
        let p = (ep.from - cur) / ep.distance;
        // Затиснути в [0,1], а НЕ скидати на старт. Раніше p>=1 (потік застиг біля
        // кінцевої точки) скидало p=0 → анімація перезапускалася з-за нижньої межі,
        // і додавання повідомлення «обривало» рух та гнало весь стек знизу вгору.
        // Тепер p=1 → від'ємний delay = -dur → анімація одразу на кінцевому кадрі
        // (рух продовжується з поточної позиції, без стрибка вниз).
        if (p < 0) p = 0;
        else if (p > 1) p = 1;
        delay = -p * dur;
      }
    }

    liveEl.style.setProperty("--vs-from", ep.from + "px");
    liveEl.style.setProperty("--vs-to", ep.to + "px");
    liveEl.style.setProperty("--vs-dur", dur + "s");
    // Перезапустити анімацію, щоб нові значення застосувались. Один reflow на зміну
    // вмісту (не на кадр): inline-"none" → reflow → повний inline-shorthand із delay.
    // «1 forwards» — рух до нової кінцевої точки; кінцевий кадр лишається застиглим,
    // доки наступне повідомлення не подовжить потік і не продовжить рух далі.
    const name = (mode === MODE_MARQUEE) ? "vs-marquee" : "vs-tele";
    liveEl.style.animation = "none";
    void liveEl.offsetWidth;
    liveEl.style.animation = name + " " + dur + "s linear " + delay + "s 1 forwards";
  }

  // Рух дограв до поточної кінцевої точки → застигнути на ній (forwards тримає кадр).
  // Якщо тим часом надійшло нове повідомлення, рух уже продовжено далі раніше —
  // ця стара анімація завершується через animationcancel, а не animationend.
  function onMotionEnd() {
    if (!isMotion() || !animating) return;
    animating = false;
    restStatic();
  }
  liveEl.addEventListener("animationend", onMotionEnd);

  // ---- Ручний скрол назад + автопауза/автовідновлення ----

  // Чи є що скролити (потік довший за екран по осі руху).
  function hasOverflow() {
    return (mode === MODE_MARQUEE)
      ? liveEl.scrollWidth > wrapEl.clientWidth
      : liveEl.scrollHeight > wrapEl.clientHeight;
  }

  // Поточна scroll-позиція по осі руху.
  function readScroll() {
    return (mode === MODE_MARQUEE) ? wrapEl.scrollLeft : wrapEl.scrollTop;
  }
  function writeScroll(px) {
    if (mode === MODE_MARQUEE) wrapEl.scrollLeft = px; else wrapEl.scrollTop = px;
  }
  function setWrapScrollable(on) {
    if (mode === MODE_MARQUEE) {
      wrapEl.style.overflowX = on ? "auto" : "hidden";
    } else {
      wrapEl.style.overflowY = on ? "auto" : "hidden";
    }
    wrapEl.style.webkitOverflowScrolling = on ? "touch" : "";
  }

  // Увійти в ручний скрол: застигнути анімацію й перевести позицію в нативний скрол.
  // Координата вмісту під верхньою/лівою межею = -tx (при русі) = scroll (при скролі).
  function enterScrub() {
    const tx = readTranslate();
    animating = false;
    scrubbing = true;
    liveEl.style.animation = "none";
    liveEl.style.transform = "none";
    setWrapScrollable(true);
    writeScroll(Math.max(0, tx == null ? 0 : -tx));
  }

  function armResumeTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(resume, MOTION_SCROLL_RESUME_MS);
  }
  function clearResumeTimer() {
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }

  // Відновити авто-рух із поточної scroll-позиції (зворотна конвертація → transform).
  function resume() {
    clearResumeTimer();
    if (!scrubbing) return;
    if (!isMotion() || !hasContent) { scrubbing = false; setWrapScrollable(false); return; }
    const s = readScroll();
    scrubbing = false;
    setWrapScrollable(false);
    writeScroll(0);
    const ep = motionEndpoints();
    let tx = -s;
    if (tx > 0) tx = 0;
    if (tx < ep.to) tx = ep.to;
    liveEl.style.transform = axisTransform(tx); // continueFromCurrent прочитає його
    animating = true;
    setMotionAnim(true);
  }

  // Старт жесту скролу (touch/колесо): спинити рух і завести таймер відновлення.
  function onScrollIntent() {
    if (!isMotion() || prefersReducedMotion() || !hasContent || !hasOverflow()) return;
    if (!scrubbing) enterScrub();
    armResumeTimer();
  }
  // Продовження скролу (зокрема інерційний скрол iOS без touch-подій) — тримати паузу.
  function onScrollMove() {
    if (scrubbing) armResumeTimer();
  }
  wrapEl.addEventListener("touchstart", onScrollIntent, { passive: true });
  wrapEl.addEventListener("wheel", onScrollIntent, { passive: true });
  wrapEl.addEventListener("touchmove", onScrollMove, { passive: true });
  wrapEl.addEventListener("scroll", onScrollMove, { passive: true });

  // Додати окремий видимий блок повідомлення в кінець потоку показу.
  function appendMessage(text) {
    const el = document.createElement("div");
    el.className = "vs-msg";
    el.textContent = text;
    liveEl.appendChild(el);
  }

  // Скинути всі inline-стилі/змінні, які виставляли різні режими.
  function resetStyles() {
    liveEl.style.fontSize = "";
    liveEl.style.transform = "";
    liveEl.style.animation = "";
    liveEl.style.removeProperty("--vs-from");
    liveEl.style.removeProperty("--vs-to");
    liveEl.style.removeProperty("--vs-dur");
    wrapEl.style.overflowX = "";
    wrapEl.style.overflowY = "";
    wrapEl.style.webkitOverflowScrolling = "";
    wrapEl.scrollTop = 0;
    wrapEl.scrollLeft = 0;
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
      // tele / marquee — щойно скинутий потік (після зміни режиму): порожньо, без руху.
      applyMotionFont();
      restStatic();
    }
  }

  return {
    // fit/scroll: показ поточного (live) тексту під час набору.
    setText(text) {
      if (isMotion()) return; // у режимах руху контент керується через showLine
      liveEl.textContent = text;
      render();
    },

    // tele/marquee: додати одну відправку в кінець безперервного потоку показу.
    // Потік рухається в одному напрямку; нове повідомлення наздоганяє попереднє,
    // НЕ перериваючи його руху — обидва можуть бути видимі одночасно (як стрічка
    // чату/новин). Коли потік порожній — старт іде з-за межі екрана.
    showLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      const wasEmpty = !hasContent;
      appendMessage(text);
      hasContent = true;
      applyMotionFont();
      // Користувач читає старе (ручний скрол): тихо лишаємо нове в кінці потоку,
      // не зриваючи паузу — автопрокрутка наздожене його після відновлення.
      if (scrubbing) return;
      if (prefersReducedMotion()) {
        animating = false;
        liveEl.style.animation = "none";
        liveEl.style.transform = "";
        return;
      }
      animating = true;
      setMotionAnim(!wasEmpty); // перше повідомлення — старт з-за екрана; наступні — продовжити рух
    },

    setMode(m) {
      m = m || DEFAULT_MODE;
      if (m === mode) return;
      clearResumeTimer();
      scrubbing = false;
      mode = m;
      if (isMotion()) { liveEl.textContent = ""; hasContent = false; animating = false; } // нова сесія показу
      render();
    },
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      // На льоту змінюємо темп лише активного руху; застигле чекає наступного повідомлення.
      if (isMotion() && animating) setMotionAnim(true);
    },
    refresh() {
      if (isMotion()) {
        applyMotionFont();
        if (scrubbing) return;              // ручний скрол — не чіпати позицію/overflow
        if (animating) setMotionAnim(true); // рух триває — продовжити з поточної позиції
        else restStatic();                  // застигле — оновити позицію під новий розмір
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
