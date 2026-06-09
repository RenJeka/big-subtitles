// Транспорт (MQTT по WebSocket) + протокол повідомлень.
// Глобал `mqtt` приходить із CDN-скрипта MQTT.js (підключений у index.html).
import {
  BROKER, TOPIC_PREFIX, CLIENT_ID_PREFIX,
  RECONNECT_PERIOD_MS, CONNECT_TIMEOUT_MS, KEEPALIVE_SEC,
  MSG_TYPE_LIVE, ROLE_DISPLAY, ROLE_SENDER,
  PRESENCE_INFIX, PRESENCE_ONLINE, PRESENCE_OFFLINE, SETTINGS_INFIX,
  TEXT_STATUS_CONNECTED, TEXT_STATUS_WAITING, TEXT_STATUS_RECONNECT,
  TEXT_STATUS_OFFLINE, TEXT_STATUS_CLOSED, TEXT_STATUS_ERROR, TEXT_STATUS_NO_MQTT
} from "../config.js";
import { setStatus } from "./utils.js";

// Протокол повідомлень у темі velyki/<room>:
//   { type: "live",   text: "..." } — поточний рядок (publish з retain:true)
//   { type: "commit", text: "..." } — зафіксувати рядок в історію (без retain)
export function encode(type, text) { return JSON.stringify({ type, text }); }

export function decode(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.type === "string") return o;
  } catch (e) { }
  // Сумісність: голий текст трактуємо як live
  return { type: MSG_TYPE_LIVE, text: raw };
}

// Підключитися до брокера. onMessage===null → лише публікація даних (Sender),
// але presence-підписка діє завжди — обидві ролі стежать за присутністю партнера.
// Зелене «з'єднано» = брокер + партнер на зв'язку; інакше «очікування пристрою…».
/**
 * Connects an MQTT client for the given room, manages presence with the peer, and subscribes to message and settings topics when a message handler is provided.
 * @param {string} room - Room identifier appended to the topic prefix.
 * @param {string} role - Local participant role (e.g., sender or display); determines peer role and presence topics.
 * @param {(payload: string) => void|null} onMessage - Optional callback invoked with incoming payload strings from the main topic or settings topic; if falsy, message subscriptions are not created.
 * @param {HTMLElement|null} statusEl - Optional DOM element used to display connection/status messages.
 * @param {(connected: boolean) => void|undefined} onPeerConnectionChange - Optional callback called with `true` when a peer is detected online and `false` when offline.
 * @returns {{ client: import("mqtt").MqttClient, topic: string, settingsTopic: string } | null} An object containing the MQTT client and the room's main and settings topics, or `null` if the MQTT library is not available.
 */
export function connect(room, role, onMessage, statusEl, onPeerConnectionChange) {

  if (typeof mqtt === "undefined") {
    setStatus(statusEl, "err", TEXT_STATUS_NO_MQTT);
    return null;
  }

  const topic = TOPIC_PREFIX + room;
  const settingsTopic = topic + SETTINGS_INFIX; // окремий retained-слот під налаштування
  const peerRole = role === ROLE_DISPLAY ? ROLE_SENDER : ROLE_DISPLAY;
  const ownPresenceTopic = topic + PRESENCE_INFIX + role;
  const peerPresenceTopic = topic + PRESENCE_INFIX + peerRole;

  const clientId = CLIENT_ID_PREFIX + Math.random().toString(16).slice(2, 10);
  const client = mqtt.connect(BROKER, {
    clientId,
    clean: true,
    reconnectPeriod: RECONNECT_PERIOD_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    keepalive: KEEPALIVE_SEC,
    // Last Will: при аварійному розриві брокер очистить наш маркер присутності.
    will: { topic: ownPresenceTopic, payload: PRESENCE_OFFLINE, qos: 0, retain: true }
  });

  // Статус залежить від двох умов: з'єднання з брокером і присутності партнера.
  let brokerConnected = false;
  let peerOnline = false;

  function refreshStatus() {
    if (brokerConnected) {
      if (peerOnline) {
        setStatus(statusEl, "ok", TEXT_STATUS_CONNECTED);
        if (onPeerConnectionChange) onPeerConnectionChange(true);
      } else {
        setStatus(statusEl, "", TEXT_STATUS_WAITING);
        if (onPeerConnectionChange) onPeerConnectionChange(false);
      }
    }
  }

  client.on("connect", () => {
    brokerConnected = true;
    // Оголосити власну присутність (retain — щоб партнер дізнався, навіть приєднавшись пізніше).
    client.publish(ownPresenceTopic, PRESENCE_ONLINE, { retain: true, qos: 0 });
    client.subscribe(peerPresenceTopic);
    // Display (onMessage!==null) слухає і потік тексту, і налаштування (окремі теми).
    if (onMessage) {
      client.subscribe(topic);
      client.subscribe(settingsTopic);
    }
    refreshStatus();
  });
  client.on("reconnect", () => {
    brokerConnected = false;
    setStatus(statusEl, "", TEXT_STATUS_RECONNECT);
  });
  client.on("offline", () => {
    brokerConnected = false; peerOnline = false;
    setStatus(statusEl, "", TEXT_STATUS_OFFLINE);
  });
  client.on("close", () => {
    brokerConnected = false; peerOnline = false;
    setStatus(statusEl, "", TEXT_STATUS_CLOSED);
  });
  client.on("error", () => setStatus(statusEl, "err", TEXT_STATUS_ERROR));

  client.on("message", (t, payload) => {
    if (t === peerPresenceTopic) {
      peerOnline = payload.toString() === PRESENCE_ONLINE;
      refreshStatus();
    } else if ((t === topic || t === settingsTopic) && onMessage) {
      // Обидві теми несуть зашифрований payload; тип (live/commit/settings)
      // визначає вже сам onMessage після дешифрування.
      onMessage(payload.toString());
    }
  });

  // Чисте закриття вкладки: одразу очистити маркер (LWT покриває лише крах/мережу).
  window.addEventListener("pagehide", () => {
    client.publish(ownPresenceTopic, PRESENCE_OFFLINE, { retain: true, qos: 0 });
  });

  return { client, topic, settingsTopic };
}

