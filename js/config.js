// Глобальні константи застосунку.
// Усі модулі спілкуються через єдиний namespace window.VS.
window.VS = window.VS || {};

VS.config = {
  // MQTT-брокер (публічний, EMQX, WebSocket-Secure)
  BROKER: "wss://broker.emqx.io:8084/mqtt",
  TOPIC_PREFIX: "velyki/",

  // Ключі localStorage
  LS_ROOM: "velyki.room",
  LS_THEME: "velyki.theme",
  LS_SIZE: "velyki.size",
  LS_WAKE: "velyki.wakeDismissed",

  // Поведінка
  HISTORY_LIMIT: 10,   // скільки рядків історії тримати в пам'яті Display
  DEBOUNCE_MS: 150     // затримка перед публікацією live-тексту
};
