// Дрібні хелпери: DOM, генерація токена, парсинг URL, кімната, статус, QR-модал, доступність.
import { LS_ROOM, LS_KEY, TOKEN_ALPHABET, TOKEN_LENGTH, QR_SIZE, QR_CORRECT_LEVEL, TEXT_QR_UNAVAILABLE, HISTORY_LIMIT } from "../config.js";
import * as store from "./store.js";

/**
 * Get a DOM element by its id.
 * @param {string} id - The id of the element to retrieve.
 * @returns {Element|null} The element with the given id, or `null` if none exists.
 */
export function $(id) { return document.getElementById(id); }

export function show(screenId) {
  const screens = document.querySelectorAll(".screen");
  for (let i = 0; i < screens.length; i++) screens[i].classList.remove("active");
  $(screenId).classList.add("active");
}

// Внутрішній розмір елемента без CSS-padding: { w, h } у пікселях.
export function innerSize(el) {
  const s = getComputedStyle(el);
  return {
    w: el.clientWidth  - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
    h: el.clientHeight - parseFloat(s.paddingTop)  - parseFloat(s.paddingBottom)
  };
}

// Чи увімкнено «reduce motion» в системних налаштуваннях.
export function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Випадковий токен кімнати (base62, довжина TOKEN_LENGTH — єдиний «секрет» парування).
export function makeToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

export function getHashParam(name) {
  const parts = location.hash.replace(/^#/, "").split("&");
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split("=");
    if (kv[0] === name) return decodeURIComponent(kv[1] || "");
  }
  return null;
}

export function getQueryParam(name) {
  const parts = location.search.replace(/^\?/, "").split("&");
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split("=");
    if (kv[0] === name) return decodeURIComponent(kv[1] || "");
  }
  return null;
}

// Кімната: спершу з #room=, інакше з localStorage.
export function resolveRoom() {
  let room = getHashParam("room");
  if (!room) room = store.get(LS_ROOM, null);
  return room || null;
}

export function saveRoom(room) {
  store.set(LS_ROOM, room);
}

// E2E-ключ (base64url): спершу з #…&k=, інакше з localStorage. Парний до кімнати.
export function resolveKey() {
  let key = getHashParam("k");
  if (!key) key = store.get(LS_KEY, null);
  return key || null;
}

export function saveKey(key) {
  store.set(LS_KEY, key);
}

// Оновити індикатор з'єднання. state: "ok" | "err" | "" (нейтральний).
export function setStatus(el, state, text) {
  el.classList.remove("is-connected", "is-error");
  if (state === "ok") el.classList.add("is-connected");
  if (state === "err") el.classList.add("is-error");
  el.querySelector(".txt").textContent = text;
}

// Закривати панель (прибирати клас "open") за кліком поза нею.
// ignoreEls — кнопки-перемикачі панелі: клік по них не закриває (інакше той самий
/**
 * Closes a panel when the user clicks outside of it.
 *
 * Adds a document-level click handler that removes the "open" class from the given panel element when a click occurs outside the panel and outside any provided ignore elements.
 *
 * @param {Element} panelEl - The panel element to close by removing its "open" class.
 * @param {...Element} ignoreEls - Additional elements that should be treated as inside the panel (clicks on them will not close the panel).
 */
export function bindOutsideClose(panelEl, ...ignoreEls) {
  document.addEventListener("click", (e) => {
    if (!panelEl.classList.contains("open")) return;
    if (panelEl.contains(e.target)) return;
    for (let i = 0; i < ignoreEls.length; i++) {
      if (ignoreEls[i] && ignoreEls[i].contains(e.target)) return;
    }
    panelEl.classList.remove("open");
  });
}

// ===================== Історія (спільний віджет Display/Sender) =====================
// Список рядків у DOM (джерело істини): append додає рядок з анімацією входу, обрізає
// буфер до HISTORY_LIMIT і керує заглушкою «порожньо». Клік по рядку → onPick(text).
/**
 * Create and manage a scrollable history list with click-to-pick entries.
 *
 * Appends text entries (trimming trailing newlines and ignoring blank/whitespace-only values),
 * animates new lines with a "line-enter" class, enforces a maximum number of entries by
 * removing oldest items (HISTORY_LIMIT), keeps the container scrolled to the bottom, and
 * toggles the `hidden` class on the provided empty-state element based on whether the list
 * has entries. Clicking a history line invokes `onPick` with the line's text content.
 *
 * @param {HTMLElement} listEl - Container element that holds history line elements.
 * @param {HTMLElement} emptyEl - Element shown when the history is empty; this function toggles its `hidden` class.
 * @param {(text: string) => void} onPick - Callback invoked with the text content when a history line is clicked.
 * @returns {{ append: (text: string) => void }} An object with `append(text)` to add a new history entry.
 */
export function createHistory(listEl, emptyEl, onPick) {
  /**
   * Updates the empty-state hint visibility based on whether the list has items.
   *
   * Toggles the "hidden" class on the empty element: hides it when the list has one or more children, shows it when the list is empty.
   */
  function updateEmptyHint() {
    emptyEl.classList.toggle("hidden", listEl.children.length > 0);
  }
  /**
   * Append a text entry to the history list and maintain the empty-state hint and size limit.
   *
   * If `text` ends with one or more newlines they are trimmed; if the trimmed text is empty or only
   * whitespace no entry is added. Otherwise a new `.line` element is appended (an enter animation
   * is triggered), oldest entries are removed while the list exceeds `HISTORY_LIMIT`, the list is
   * scrolled to the bottom, and the empty-state hint is updated.
   * @param {string} text - The text to append to the history; trailing newlines will be removed.
   */
  function append(text) {
    text = (text || "").replace(/\n+$/, "");
    if (!text.trim().length) return;
    const d = document.createElement("div");
    d.className = "line line-enter";
    d.textContent = text;
    listEl.appendChild(d);
    requestAnimationFrame(() => d.classList.remove("line-enter"));
    while (listEl.children.length > HISTORY_LIMIT) {
      listEl.removeChild(listEl.firstChild);
    }
    listEl.scrollTop = listEl.scrollHeight;
    updateEmptyHint();
  }
  listEl.addEventListener("click", (e) => {
    let line = e.target;
    while (line && line !== listEl) {
      if (line.classList && line.classList.contains("line")) break;
      line = line.parentElement;
    }
    if (line && line !== listEl) onPick(line.textContent);
  });
  updateEmptyHint();
  return {
    append,
    /** Видаляє всі рядки та відображає заглушку «порожньо». */
    clear() {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      updateEmptyHint();
    }
  };
}

// Підсвітити активну кнопку режиму показу: активна — без класу, решта — "secondary outline".
/**
 * Set visual state for mode buttons by clearing classes on the active mode and applying "secondary outline" to the others.
 * @param {Object.<string,string>} btnIds - Map from mode name to DOM element id for that mode's button.
 * @param {string} mode - The currently active mode key whose button should be highlighted.
 */
export function highlightModeButtons(btnIds, mode) {
  Object.keys(btnIds).forEach((m) => {
    const btn = $(btnIds[m]);
    if (btn) btn.className = (m === mode) ? "" : "secondary outline";
  });
}

// ===================== QR-модал =====================
// Лінива ініціалізація: QR генерується лише раз (при першому відкритті).
let _qrReady = false;

export function initQrModal(room, keyB64) {
  const senderUrl = location.origin + location.pathname + "?role=sender#room=" + room + "&k=" + keyB64;
  $("qr-link").textContent = senderUrl;
  try {
    if (typeof QRCode !== "undefined") {
      new QRCode($("qr"), {
        text: senderUrl,
        width: QR_SIZE, height: QR_SIZE,
        correctLevel: QRCode.CorrectLevel[QR_CORRECT_LEVEL]
      });
    } else {
      $("qr").textContent = TEXT_QR_UNAVAILABLE;
    }
  } catch (e) {
    $("qr").textContent = TEXT_QR_UNAVAILABLE;
  }
  // Закрити за кліком поза модального вікна
  const modal = $("qr-modal");
  modal.addEventListener("click", (e) => { if (e.target === modal) closeQrModal(); });
  $("qr-modal-close").addEventListener("click", closeQrModal);
  _qrReady = true;
}

export function openQrModal() {
  if (!_qrReady) return;
  $("qr-modal").classList.add("open");
}

export function closeQrModal() {
  $("qr-modal").classList.remove("open");
}
