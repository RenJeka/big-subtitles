// Транспорт (MQTT по WebSocket) + протокол повідомлень.
// Глобал `mqtt` приходить із CDN-скрипта MQTT.js (підключений у index.html).
import {
  BROKER, TOPIC_PREFIX, CLIENT_ID_PREFIX,
  RECONNECT_PERIOD_MS, CONNECT_TIMEOUT_MS, KEEPALIVE_SEC,
  MSG_TYPE_LIVE
} from "./config.js";
import { setStatus } from "./utils.js";

// Протокол повідомлень у темі velyki/<room>:
//   { type: "live",   text: "..." } — поточний рядок (publish з retain:true)
//   { type: "commit", text: "..." } — зафіксувати рядок в історію (без retain)
export function encode(type, text) { return JSON.stringify({ type, text }); }

export function decode(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.type === "string") return o;
  } catch (e) {}
  // Сумісність: голий текст трактуємо як live
  return { type: MSG_TYPE_LIVE, text: raw };
}

// Підключитися до брокера. onMessage===null → лише публікація (Sender).
// Повертає { client, topic } або null, якщо бібліотека недоступна.
export function connect(room, onMessage, statusEl) {
  if (typeof mqtt === "undefined") {
    setStatus(statusEl, "err", "немає бібліотеки MQTT");
    return null;
  }
  const topic = TOPIC_PREFIX + room;
  const clientId = CLIENT_ID_PREFIX + Math.random().toString(16).slice(2, 10);
  const client = mqtt.connect(BROKER, {
    clientId,
    clean: true,
    reconnectPeriod: RECONNECT_PERIOD_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    keepalive: KEEPALIVE_SEC
  });

  client.on("connect", () => {
    setStatus(statusEl, "ok", "з'єднано");
    if (onMessage) client.subscribe(topic);
  });
  client.on("reconnect", () => setStatus(statusEl, "", "перепідключення…"));
  client.on("offline", () => setStatus(statusEl, "", "немає мережі…"));
  client.on("close", () => setStatus(statusEl, "", "роз'єднано…"));
  client.on("error", () => setStatus(statusEl, "err", "помилка з'єднання"));

  if (onMessage) {
    client.on("message", (t, payload) => {
      if (t !== topic) return;
      onMessage(payload.toString());
    });
  }

  return { client, topic };
}

