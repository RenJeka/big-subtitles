// Режим Sender (телефон): textarea з debounce-публікацією, Enter фіксує рядок.
import { DEBOUNCE_MS, FOCUS_DELAY_MS, MSG_TYPE_LIVE, MSG_TYPE_COMMIT } from "./config.js";
import { $, show, resolveRoom, saveRoom, setStatus } from "./utils.js";
import { connect, encode } from "./mqtt-client.js";

export function init() {
  show("screen-sender");
  document.body.classList.remove("theme-light"); // sender завжди темний

  const room = resolveRoom();
  if (!room) {
    $("input").value = "";
    $("input").placeholder = "Немає кімнати. Відскануйте QR з дисплея.";
    $("input").disabled = true;
    setStatus($("status-sender"), "err", "немає кімнати");
    return;
  }
  saveRoom(room);

  const conn = connect(room, null, $("status-sender"));
  const input = $("input");

  function publish(type, text, retain) {
    if (!conn || !conn.client) return;
    conn.client.publish(conn.topic, encode(type, text), { retain: !!retain, qos: 0 });
  }

  // debounce live-публікації
  let timer = null;
  function scheduleLive() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => publish(MSG_TYPE_LIVE, input.value, true), DEBOUNCE_MS);
  }

  input.addEventListener("input", scheduleLive);

  // Enter (без Shift) — зафіксувати рядок в історію дисплея
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const line = input.value;
      if (timer) { clearTimeout(timer); timer = null; }
      if (line.trim().length) publish(MSG_TYPE_COMMIT, line, false);
      input.value = "";
      publish(MSG_TYPE_LIVE, "", true); // очистити retained live
    }
  });

  $("clear-btn").addEventListener("click", () => {
    input.value = "";
    if (timer) { clearTimeout(timer); timer = null; }
    publish(MSG_TYPE_LIVE, "", true);
    input.focus();
  });

  // фокус на полі для виклику клавіатури
  setTimeout(() => input.focus(), FOCUS_DELAY_MS);
}

