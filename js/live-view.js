// Контролер показу великого live-тексту (#live) за обраним режимом.
// Інкапсулює весь рендер: автомасштаб (fit), прокрутка, суфлер, бігуча строка.
// fit() лишається у fit-text.js і викликається звідси для режиму "fit".
//
// Суфлер/бігучка працюють у накопичувальному режимі: текст додається через
// appendLine() БЕЗ перезапуску анімації (без скидання позиції) — звідси плавність.
// Анімація не циклічна, а клемпиться в кінці; коли додається новий рядок,
// з'являється куди прокручувати далі — без ривків.
import {
  MODE_FIT, MODE_SCROLL, MODE_TELE, MODE_MARQUEE,
  TELE_PX_BASE, TELE_PX_STEP, MARQUEE_PX_BASE, MARQUEE_PX_STEP,
  SCROLL_FONT_RATIO, FIT_MIN_FONT_PX, DEFAULT_MODE, DEFAULT_SPEED,
  MARQUEE_SEP, ACCUMULATE_MAX_CHARS
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
// getSize — функція, що повертає поточний масштаб (SIZE_MIN..SIZE_MAX).
export function createLiveView(liveEl, wrapEl, getSize) {
  let mode = DEFAULT_MODE;
  let speed = DEFAULT_SPEED;
  let rafId = null;
  let pos = 0;       // поточне зміщення (px) для tele/marquee
  let lastTs = 0;
  let buffer = "";   // накопичений текст для tele/marquee
  let minPos = 0;    // кешована нижня межа зсуву; оновлюється ЛИШЕ при зміні контенту/розміру

  function isMotion() { return mode === MODE_TELE || mode === MODE_MARQUEE; }

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

  function applyMotionFont() {
    liveEl.style.fontSize = scrollFontPx(wrapEl, getSize()) + "px";
  }

  // Виміряти межу зсуву. ЄДИНЕ місце, де читаємо layout (scrollHeight/scrollWidth) —
  // викликається лише при зміні контенту/шрифту/розміру, НЕ щокадрово.
  function measure() {
    if (mode === MODE_MARQUEE) {
      minPos = Math.min(0, wrapEl.clientWidth - liveEl.scrollWidth);
    } else if (mode === MODE_TELE) {
      minPos = Math.min(0, wrapEl.clientHeight - liveEl.scrollHeight);
    } else {
      minPos = 0;
    }
  }

  // Запис лише transform (translate3d → композитний шар GPU, без repaint/reflow).
  function writeTransform() {
    liveEl.style.transform = (mode === MODE_MARQUEE)
      ? "translate3d(" + pos + "px,0,0)"
      : "translate3d(0," + pos + "px,0)";
  }

  // Один крок анімації: рух уверх (tele) / уліво (marquee) з клемпом у кінці.
  // У циклі НЕ читаємо layout — лише пишемо transform. Дійшовши до кінця (minPos),
  // зупиняємось до появи нового тексту; appendLine() перезапустить рух.
  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    pos -= pxPerSec(mode, speed) * dt;
    if (pos <= minPos) {
      pos = minPos;
      writeTransform();
      rafId = null; lastTs = 0; // догнали кінець — спимо, нуль навантаження
      return;
    }
    writeTransform();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId) return;
    if (prefersReducedMotion()) {
      // Поважаємо reduced-motion: статичний показ без авто-руху (скрол через CSS).
      liveEl.style.transform = "";
      return;
    }
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }

  // Повний (пере)рендер поточного режиму. Buffer НЕ чистить — лише відображає його.
  function render() {
    stopAnim();
    resetStyles();
    ALL_MODE_CLASSES.forEach((c) => wrapEl.classList.remove(c));
    wrapEl.classList.add("mode-" + mode);

    if (mode === MODE_FIT) {
      fit(liveEl, wrapEl, getSize());
    } else if (mode === MODE_SCROLL) {
      applyMotionFont();
    } else {
      // tele / marquee — показати накопичений буфер. Стартуємо з pos=0: контент видно
      // одразу (зверху/зліва), а рух починається, лише коли він переростає екран —
      // як живі субтитри (без довгого «порожнього» розгону й відчуття «застрягло»).
      liveEl.textContent = buffer;
      pos = 0;
      applyMotionFont();
      measure();
      writeTransform();
      startLoop();
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

    // tele/marquee: додати зафіксований рядок до потоку БЕЗ перезапуску анімації.
    appendLine(text) {
      if (!isMotion()) return;
      text = (text || "").replace(/\n+$/, "");
      if (!text.trim().length) return;
      const sep = (mode === MODE_MARQUEE) ? MARQUEE_SEP : "\n";
      buffer = buffer ? (buffer + sep + text) : text;
      liveEl.textContent = buffer; // додано в кінці — pos не чіпаємо

      const trimmed = trimLeading(buffer);
      if (trimmed !== buffer) {
        // Компенсувати зсув від обрізання початку, щоб видима частина не смикнулась.
        const horiz = (mode === MODE_MARQUEE);
        const before = horiz ? liveEl.scrollWidth : liveEl.scrollHeight;
        liveEl.textContent = trimmed;
        const after = horiz ? liveEl.scrollWidth : liveEl.scrollHeight;
        pos += (before - after);
        buffer = trimmed;
      }
      measure();
      if (pos < minPos) pos = minPos; // обрізання могло вкоротити контент
      if (!rafId) startLoop();
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
      // Швидкість зчитується в циклі; перезапуск не обов'язковий, лише підстрахуємо,
      // якщо цикл ще не активний (напр. щойно вийшли з reduced-motion).
      if (!rafId && isMotion()) startLoop();
    },
    // Перелаштунок під зміну розміру/контейнера. У режимах руху НЕ скидаємо позицію
    // (інакше зміна розміру або push налаштувань/reconnect смикали б прокрутку на старт);
    // лише оновлюємо шрифт і тримаємо цикл активним.
    refresh() {
      if (isMotion()) {
        applyMotionFont();
        measure();
        if (pos < minPos) pos = minPos;
        writeTransform();
        if (!rafId) startLoop();
      } else {
        render();
      }
    }
  };
}
