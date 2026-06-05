// Глобальні константи застосунку.

// MQTT-брокер (публічний, EMQX, WebSocket-Secure)
export const BROKER = "wss://broker.emqx.io:8084/mqtt";
export const TOPIC_PREFIX = "velyki/";

// Ключі localStorage
export const LS_ROOM = "velyki.room";
export const LS_THEME = "velyki.theme";
export const LS_SIZE = "velyki.size";
export const LS_WAKE = "velyki.wakeDismissed";

// Поведінка
export const HISTORY_LIMIT = 10;  // скільки рядків історії тримати в пам'яті Display
export const DEBOUNCE_MS = 150;   // затримка перед публікацією live-тексту
