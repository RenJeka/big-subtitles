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
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED, DEFAULT_LINEHEIGHT,
  MOTION_SCROLL_RESUME_MS,
  SEP_COLOR, SEP_TELE_CHAR, SEP_MARQUEE_CHAR
} from "../config.js";
import { fit } from "../utils/fit-text.js";
import { innerSize, prefersReducedMotion } from "../utils/utils.js";
import { logEvent } from "../utils/debug-log.js"; // ТИМЧАСОВО: діагностика бага суфлера на Safari 15

const ALL_MODE_CLASSES = ["mode-fit", "mode-scroll", "mode-tele", "mode-marquee"];

// px/с для заданого режиму та рівня швидкості.
function pxPerSec(mode, speed) {
  if (mode === MODE_MARQUEE) return MARQUEE_PX_BASE + (speed - 1) * MARQUEE_PX_STEP;
  return TELE_PX_BASE + (speed - 1) * TELE_PX_STEP;
}

// Розмір шрифту (px) для scroll/tele/marquee залежно від розміру контейнера і scale.
function scrollFontPx(wrapEl, size) {
  const base = Math.min(wrapEl.clientWidth, wrapEl.clientHeight);
  return Math.max(FIT_MIN_FONT_PX, Math.round(size * SCROLL_FONT_RATIO * base));
}

/**
 * Creates and returns a live-view controller that renders committed text on #live
 * according to the active mode (fit / scroll / tele / marquee).
 * @param {HTMLElement} liveEl - #live text element
 * @param {HTMLElement} wrapEl - #live-wrap container
 * @param {()=>number} getSize - returns current scale factor (SIZE_MIN..SIZE_MAX)
 */
// Перетворює крок (1–30) у CSS-значення line-height.
function lhValue(step) {
  return 0.8 + (step - 1) * 0.05;
}

export function createLiveView(liveEl, wrapEl, getSize) {
  let mode            = DEFAULT_MODE;
  let speed           = DEFAULT_SPEED;
  let lineHeightStep  = DEFAULT_LINEHEIGHT;
  let hasContent = false; // чи є у потоці хоч одне повідомлення (.vs-msg)
  let animating = false;  // чи триває рух потоку до поточної кінцевої точки
  let scrubbing = false;  // користувач вручну скролить — авто-рух на паузі
  let resumeTimer = null; // таймер відновлення авто-руху після бездіяльності

  // ТИМЧАСОВО (діагностика): паралельне аналітичне відстеження поточного зсуву,
  // незалежне від getComputedStyle. effStart — «віртуальний» момент старту з
  // урахуванням від'ємного delay (може бути в минулому); рух лінійний.
  let dbgMsgN = 0, animSeq = 0;
  let effStart = 0, animFrom = 0, animTo = 0, animDurMs = 0;
  function nowMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
  function analyticOffset() {
    if (!animDurMs) return null;
    let p = (nowMs() - effStart) / animDurMs;
    if (p < 0) p = 0; else if (p > 1) p = 1;
    return animFrom + (animTo - animFrom) * p;
  }
  function rawTransform() {
    try {
      const t = getComputedStyle(liveEl).transform;
      return (!t || t === "none") ? "none" : t.replace(/\s+/g, "");
    } catch (e) { return "ERR:" + e; }
  }

  /** @returns {boolean} true when current mode produces continuous stream motion */
  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

  /** Sets #live font-size for motion modes based on container dimensions and scale. */
  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  /**
   * Returns animation endpoints for the current stream: stream enters from off-screen
   * (from) and stops when the newest block is fully visible (to=0 if stream fits, else negative).
   * @returns {{from:number, to:number, distance:number}} offsets in px along the motion axis
   */
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

  /** @param {number} px @returns {string} CSS translate3d along the motion axis (Y for tele, X for marquee) */
  function axisTransform(px) {
    return (mode === MODE_MARQUEE)
      ? "translate3d(" + px + "px,0,0)"
      : "translate3d(0," + px + "px,0)";
  }

  /**
   * Reads the current #live transform offset from the computed matrix so animation
   * can resume from the current position without a visible jump.
   * @returns {number|null} translate px along the motion axis, or null if no transform is active
   */
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

  /** Cancels animation and holds #live at the final visible position (no motion). */
  function restStatic() {
    liveEl.style.animation = "none";
    liveEl.style.transform = hasContent ? axisTransform(motionEndpoints().to) : "";
    animDurMs = 0; // ТИМЧАСОВО: зупиняємо аналітичний відлік
    logEvent("restStatic", { hasContent: hasContent, to: hasContent ? motionEndpoints().to : "" });
  }

  /**
   * Configures and (re)starts the CSS keyframe animation so the stream scrolls at
   * constant px/s to its new endpoint. Uses a negative animation-delay to resume
   * from the current position when continueFromCurrent is true, avoiding jumps.
   * @param {boolean} continueFromCurrent - true to resume mid-stream; false to start from off-screen
   */
  function setMotionAnim(continueFromCurrent) {
    if (!hasContent) {                  // нема тексту — нема руху
      liveEl.style.animation = "none";
      liveEl.style.transform = "";
      logEvent("setAnim-skip", { reason: "noContent" });
      return;
    }
    const ep = motionEndpoints();
    const dur = Math.max(1, ep.distance / pxPerSec(mode, speed)); // сек, сталий px/с

    // ТИМЧАСОВО (діагностика): зчитуємо позицію ДВОМА способами для порівняння.
    const curComputed = readTranslate();         // через getComputedStyle (підозрюваний)
    const curAnalytic = analyticOffset();         // через час старту (еталон)
    const rawT = rawTransform();
    const prevAnim = liveEl.style.animation || "";

    // Продовження: обчислюємо пройдену частку p від поточного зсуву й вносимо її як
    // від'ємний animation-delay у ті самі keyframes (full from→to). Так рух не «стрибає»
    // на старт при додаванні повідомлення / зміні швидкості/розміру.
    let delay = 0, pUsed = null;
    if (continueFromCurrent && ep.distance > 0) {
      const cur = curComputed;
      if (cur != null) {
        let p = (ep.from - cur) / ep.distance;
        // Затиснути в [0,1], а НЕ скидати на старт. Раніше p>=1 (потік застиг біля
        // кінцевої точки) скидало p=0 → анімація перезапускалася з-за нижньої межі,
        // і додавання повідомлення «обривало» рух та гнало весь стек знизу вгору.
        // Тепер p=1 → від'ємний delay = -dur → анімація одразу на кінцевому кадрі
        // (рух продовжується з поточної позиції, без стрибка вниз).
        if (p < 0) p = 0;
        else if (p > 1) p = 1;
        pUsed = p;
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

    // ТИМЧАСОВО (діагностика): оновлюємо аналітичний стан і логуємо все.
    animSeq++;
    animDurMs = dur * 1000;
    animFrom = ep.from;
    animTo = ep.to;
    effStart = nowMs() + delay * 1000; // delay<0 → старт у минулому
    logEvent("setAnim", {
      seq: animSeq, contFrom: continueFromCurrent,
      from: ep.from, to: ep.to, dist: ep.distance, dur: dur, delay: delay,
      pUsed: pUsed == null ? "null" : pUsed,
      cur_computed: curComputed == null ? "null" : curComputed,
      cur_analytic: curAnalytic == null ? "null" : curAnalytic,
      diff: (curComputed != null && curAnalytic != null) ? (curComputed - curAnalytic) : "n/a",
      rawT: rawT, prevAnim: '"' + prevAnim + '"',
      sH: liveEl.scrollHeight, cH: wrapEl.clientHeight,
      sW: liveEl.scrollWidth, cW: wrapEl.clientWidth,
      kids: liveEl.children.length, speed: speed
    });
  }

  /**
   * animationend handler: marks stream as no longer animating and freezes it at endpoint.
   * If a new message arrived mid-flight the old animation fires animationcancel instead,
   * so this handler is already superseded in that case.
   */
  function onMotionEnd(e) {
    logEvent("animationend", { anim: e && e.animationName, animating: animating, raw: rawTransform() });
    if (!isMotion() || !animating) return;
    animating = false;
    restStatic();
  }
  liveEl.addEventListener("animationend", onMotionEnd);
  // ТИМЧАСОВО (діагностика): фіксуємо весь життєвий цикл CSS-анімації, зокрема
  // animationcancel — щоб побачити, чи скасування старої анімації не «вбиває» нову.
  liveEl.addEventListener("animationstart", function (e) {
    logEvent("animationstart", { anim: e.animationName, raw: rawTransform() });
  });
  liveEl.addEventListener("animationcancel", function (e) {
    logEvent("animationcancel", { anim: e.animationName, animating: animating, raw: rawTransform() });
  });

  // ---- Ручний скрол назад + автопауза/автовідновлення ----

  /** @returns {boolean} true when the stream is longer than the visible area along the motion axis */
  function hasOverflow() {
    return (mode === MODE_MARQUEE)
      ? liveEl.scrollWidth > wrapEl.clientWidth
      : liveEl.scrollHeight > wrapEl.clientHeight;
  }

  /** @returns {number} current scroll offset of wrapEl along the motion axis */
  function readScroll() {
    return (mode === MODE_MARQUEE) ? wrapEl.scrollLeft : wrapEl.scrollTop;
  }

  /** @param {number} px Sets wrapEl scroll offset along the motion axis. */
  function writeScroll(px) {
    if (mode === MODE_MARQUEE) wrapEl.scrollLeft = px; else wrapEl.scrollTop = px;
  }

  /** @param {boolean} on Enables or disables native overflow-scroll on wrapEl along the motion axis. */
  function setWrapScrollable(on) {
    if (mode === MODE_MARQUEE) {
      wrapEl.style.overflowX = on ? "auto" : "hidden";
    } else {
      wrapEl.style.overflowY = on ? "auto" : "hidden";
    }
    wrapEl.style.webkitOverflowScrolling = on ? "touch" : "";
  }

  /**
   * Transitions from CSS animation to native scroll for manual scrubbing.
   * Converts the current transform offset (−tx) to an equivalent scrollTop/Left so
   * the visible position does not jump when the user starts swiping back.
   */
  function enterScrub() {
    const tx = readTranslate();
    logEvent("enterScrub", { tx: tx == null ? "null" : tx, analytic: analyticOffset() });
    animating = false;
    scrubbing = true;
    liveEl.style.animation = "none";
    liveEl.style.transform = "none";
    setWrapScrollable(true);
    writeScroll(Math.max(0, tx == null ? 0 : -tx));
  }

  /** Resets (or starts) the inactivity timer that will restore auto-motion after scrubbing ends. */
  function armResumeTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(resume, MOTION_SCROLL_RESUME_MS);
  }

  /** Cancels the pending auto-resume timer. */
  function clearResumeTimer() {
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }

  /**
   * Converts the current native scroll position back to a CSS transform and
   * restarts animation from that position, resuming auto-motion after scrubbing ends.
   */
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
    logEvent("resume", { scroll: s, tx: tx, epTo: ep.to });
    animating = true;
    setMotionAnim(true);
  }

  /** touchstart/wheel handler: pauses auto-motion and arms the resume timer. */
  function onScrollIntent() {
    if (!isMotion() || prefersReducedMotion() || !hasContent || !hasOverflow()) return;
    if (!scrubbing) enterScrub();
    armResumeTimer();
  }

  /** touchmove/scroll handler: resets the resume timer to sustain the pause during inertial scroll. */
  function onScrollMove() {
    if (scrubbing) armResumeTimer();
  }
  wrapEl.addEventListener("touchstart", onScrollIntent, { passive: true });
  wrapEl.addEventListener("wheel", onScrollIntent, { passive: true });
  wrapEl.addEventListener("touchmove", onScrollMove, { passive: true });
  wrapEl.addEventListener("scroll", onScrollMove, { passive: true });

  /** @param {string} text Appends a .vs-msg div with text to the end of the motion stream. */
  function appendMessage(text) {
    if (liveEl.children.length > 0) {
      const sep = document.createElement("div");
      sep.className = "vs-sep";
      sep.textContent = mode === MODE_TELE ? SEP_TELE_CHAR : SEP_MARQUEE_CHAR;
      sep.style.color = SEP_COLOR;
      liveEl.appendChild(sep);
    }
    const el = document.createElement("div");
    el.className = "vs-msg";
    el.textContent = text;
    liveEl.appendChild(el);
  }

  /**
   * Resets all inline styles and CSS custom properties written by any display mode.
   */
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

  /**
   * Resets DOM state, applies the current mode class, and initialises mode-specific layout.
   */
  function render() {
    resetStyles();
    liveEl.style.lineHeight = lhValue(lineHeightStep);
    ALL_MODE_CLASSES.forEach((c) => wrapEl.classList.remove(c));
    wrapEl.classList.add("mode-" + mode);

    if (mode === MODE_FIT) {
      const { w, h } = innerSize(wrapEl);
      fit(liveEl, w, h, getSize());
    } else if (mode === MODE_SCROLL) {
      applyMotionFont();
    } else {
      // tele / marquee — щойно скинутий потік (після зміни режиму): порожньо, без руху.
      applyMotionFont();
      restStatic();
    }
  }

  function doRefresh() {
    if (isMotion()) {
      applyMotionFont();
      if (scrubbing) return;
      if (animating) setMotionAnim(true);
      else restStatic();
    } else if (mode === MODE_SCROLL) {
      const prev = wrapEl.scrollHeight;
      const ratio = prev > 0 ? wrapEl.scrollTop / prev : 0;
      render();
      wrapEl.scrollTop = ratio * wrapEl.scrollHeight;
    } else {
      render();
    }
  }

  return {
    /**
     * (fit/scroll) Replaces #live content with text and re-fits or re-renders.
     * @param {string} text
     */
    setText(text) {
      if (isMotion()) return; // у режимах руху контент керується через showLine
      liveEl.textContent = text;
      render();
    },

    /**
     * (tele/marquee) Appends one committed message as a new stream block and
     * starts or continues motion toward the new endpoint.
     * @param {string} text
     */
    showLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      const wasEmpty = !hasContent;
      appendMessage(text);
      hasContent = true;
      applyMotionFont();
      dbgMsgN++;
      logEvent("showLine", {
        msgN: dbgMsgN, len: text.length, wasEmpty: wasEmpty,
        scrubbing: scrubbing, prm: prefersReducedMotion(), animating: animating,
        kids: liveEl.children.length, mode: mode
      });
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

    /** 
     * Switches to mode m; resets stream for motion modes and re-renders. 
     * @param {string} m 
     */
    setMode(m) {
      m = m || DEFAULT_MODE;
      if (m === mode) return;
      clearResumeTimer();
      scrubbing = false;
      mode = m;
      if (isMotion()) { liveEl.textContent = ""; hasContent = false; animating = false; } // нова сесія показу
      render();
    },

    /** 
     * Updates motion speed and immediately adjusts ongoing animation tempo. 
     * @param {number} s 
     */
    setSpeed(s) {
      speed = s || DEFAULT_SPEED;
      // На льоту змінюємо темп лише активного руху; застигле чекає наступного повідомлення.
      if (isMotion() && animating) setMotionAnim(true);
    },

    /** Re-applies layout for the current mode (called on resize, orientation change, or size change). */
    refresh() {
      doRefresh();
    },

    /**
     * Updates line-height step and immediately re-applies layout.
     * @param {number} step integer 1–30
     */
    setLineHeight(step) {
      lineHeightStep = step || DEFAULT_LINEHEIGHT;
      liveEl.style.lineHeight = lhValue(lineHeightStep);
      doRefresh();
    }
  };
}
