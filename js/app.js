// Точка входу: визначає режим за ?role= або показує стартовий екран.
// Підключається як <script type="module"> — виконується після парсингу DOM.
import { $, show, getQueryParam } from "./utils.js";
import * as display from "./display.js";
import * as sender from "./sender.js";

function boot() {
  const role = getQueryParam("role");
  if (role === "display") { display.init(); return; }
  if (role === "sender") { sender.init(); return; }

  // стартовий екран
  show("screen-start");
  $("btn-display").addEventListener("click", () => display.init());
  $("btn-sender").addEventListener("click", () => sender.init());
}

boot();
