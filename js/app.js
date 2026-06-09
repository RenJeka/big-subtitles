// Точка входу: визначає режим за ?role= або показує стартовий екран.
// Підключається як <script type="module"> — виконується після парсингу DOM.
import { ROLE_DISPLAY, ROLE_SENDER } from "./config.js";
import { $, show, getQueryParam } from "./utils/utils.js";
import * as display from "./screens/display.js";
import * as sender from "./screens/sender.js";

function boot() {
  const role = getQueryParam("role");
  if (role === ROLE_DISPLAY) { display.init(); return; }
  if (role === ROLE_SENDER) { sender.init(); return; }

  // стартовий екран
  show("screen-start");
  $("btn-display").addEventListener("click", () => display.init());
  $("btn-sender").addEventListener("click", () => sender.init());
}

boot();

