/**
 * @deprecated live-typing — публікація тексту при кожному натисканні клавіші
 *
 * Цей файл зберігає логіку «живого набору»: Sender публікував MQTT-повідомлення
 * типу MSG_TYPE_LIVE з debounce 150 мс при кожній зміні textarea; Display показував
 * їх у режимі MODE_FIT (Авто-розмір) під час набору.
 *
 * Вимкнено: текст тепер відправляється лише по кнопці «Відправити» або Enter.
 *
 * Щоб повторно підключити:
 *   1. В sender.js: відновити імпорт DEBOUNCE_MS та MSG_TYPE_LIVE, додати timer,
 *      scheduleLive(), слухач input→scheduleLive, виклик scheduleLive() у history-callback,
 *      а також publish(MSG_TYPE_LIVE,"",true) у commitLine() та clear-btn.
 *   2. В display.js: відновити імпорт MODE_FIT, додати ignoreNextEmptyLive,
 *      isLiveTypingMode() і else-блок обробки live в onMessage.
 *   3. Видалити цей файл.
 */

// ── Sender-сторона (було у js/sender.js) ────────────────────────────────────

// Імпорти, що були потрібні:
// import { DEBOUNCE_MS, MSG_TYPE_LIVE, ... } from "./config.js";

// Стан debounce-таймера:
// let timer = null;

// Публікація live-тексту з debounce (скасовує попередній таймер при кожному вводі):
// function scheduleLive() {
//   if (timer) clearTimeout(timer);
//   timer = setTimeout(() => publish(MSG_TYPE_LIVE, input.value, true), DEBOUNCE_MS);
// }

// Слухач на textarea (викликати після оголошення input):
// input.addEventListener("input", scheduleLive);

// У history-callback — надіслати live при підстановці тексту з історії:
// scheduleLive(); // після: input.value = text; $("sender-history-panel").classList.remove("open");

// У commitLine() — скасувати pending live і очистити retained-слот на брокері:
// if (timer) { clearTimeout(timer); timer = null; }     // перед publish(MSG_TYPE_COMMIT,...)
// publish(MSG_TYPE_LIVE, "", true);                      // після: input.value = "";

// У clear-btn handler — очистити retained live при ручному очищенні поля:
// if (timer) { clearTimeout(timer); timer = null; }
// publish(MSG_TYPE_LIVE, "", true);

// ── Display-сторона (було у js/display.js) ──────────────────────────────────

// Імпорт, що був потрібний:
// import { MODE_FIT, ... } from "./config.js";

// Прапор: після commit Sender шле порожній live (очищає retained-поле на брокері);
// у fit/scroll ми лишаємо відправлений текст на екрані — наступний порожній live пропускаємо:
// let ignoreNextEmptyLive = false;

// Режим живого набору — тільки MODE_FIT («Авто-розмір»):
// function isLiveTypingMode() {
//   return settings.getMode() === MODE_FIT;
// }

// Блок обробки MSG_TYPE_LIVE у onMessage (після else if MSG_TYPE_COMMIT):
// } else {
//   // live-текст (набір) — лише для «Авто-розмір». У «Прокрутці» й режимах руху
//   // ігноруємо: там текст оновлюється тільки по commit («Відправити»).
//   if (isLiveTypingMode()) {
//     const t = msg.text || "";
//     if (t === "" && ignoreNextEmptyLive) {
//       ignoreNextEmptyLive = false; // порожній live після commit — показане лишаємо
//     } else {
//       ignoreNextEmptyLive = false;
//       setLive(t);
//     }
//   }
// }

// У commit-гілці onMessage — скинути прапор після показу:
// ignoreNextEmptyLive = true; // після: setLive(msg.text);
