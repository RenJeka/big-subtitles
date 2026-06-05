// Панель налаштувань Display: тема, розмір шрифту, шестірня, банер автоблокування.
import { LS_THEME, LS_SIZE, LS_WAKE, DEFAULT_THEME, DEFAULT_SIZE } from "./config.js";
import * as store from "./store.js";
import { $ } from "./utils.js";

let currentSize = 1;

export function applyTheme(theme) {
  if (theme === "light") document.body.classList.add("theme-light");
  else document.body.classList.remove("theme-light");
  store.set(LS_THEME, theme);
  const dk = $("theme-dark"), lt = $("theme-light");
  if (dk && lt) {
    if (theme === "light") { lt.classList.remove("off"); dk.classList.add("off"); }
    else { dk.classList.remove("off"); lt.classList.add("off"); }
  }
}

export function getSize() { return currentSize; }

// hooks: { onSizeChange, onShowQr }
export function init(hooks = {}) {
  const theme = store.get(LS_THEME, DEFAULT_THEME);
  currentSize = parseFloat(store.get(LS_SIZE, DEFAULT_SIZE)) || 1;
  applyTheme(theme);
  $("size-range").value = currentSize;

  $("gear").addEventListener("click", () => $("settings").classList.toggle("open"));

  $("size-range").addEventListener("input", () => {
    currentSize = parseFloat($("size-range").value) || 1;
    store.set(LS_SIZE, $("size-range").value);
    if (hooks.onSizeChange) hooks.onSizeChange();
  });

  $("theme-dark").addEventListener("click", () => applyTheme("dark"));
  $("theme-light").addEventListener("click", () => applyTheme("light"));

  $("show-qr").addEventListener("click", () => {
    if (hooks.onShowQr) hooks.onShowQr();
    $("settings").classList.remove("open");
  });

  // Банер автоблокування (одноразовий)
  if (!store.get(LS_WAKE, null)) $("wake-hint").classList.add("show");
  $("wake-ok").addEventListener("click", () => {
    $("wake-hint").classList.remove("show");
    store.set(LS_WAKE, "1");
  });
}
