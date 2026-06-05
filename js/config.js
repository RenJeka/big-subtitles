// Глобальні константи застосунку.
// Усі «магічні» числа, рядки та налаштування зібрані тут.

// ===================== MQTT / Брокер =====================

// MQTT-брокер (публічний, EMQX, WebSocket-Secure)
export const BROKER = "wss://broker.emqx.io:8084/mqtt";
export const TOPIC_PREFIX = "velyki/";

// Префікс MQTT-clientId (+ 8 hex-символів випадкових)
export const CLIENT_ID_PREFIX = "velyki_";

// Параметри з'єднання
export const RECONNECT_PERIOD_MS = 2000;
export const CONNECT_TIMEOUT_MS = 8000;
export const KEEPALIVE_SEC = 30;

// Типи повідомлень протоколу
export const MSG_TYPE_LIVE = "live";
export const MSG_TYPE_COMMIT = "commit";
// Налаштування: Sender надсилає Display розмір + тему (retain:true)
export const MSG_TYPE_SETTINGS = "settings";

// ===================== Присутність (presence) =====================
// Кожна роль публікує retained-маркер у власну тему velyki/<room>/presence/<role>
// і підписується на тему партнера. LWT/закриття вкладки очищають маркер.
export const PRESENCE_INFIX = "/presence/";
export const PRESENCE_ONLINE = "1";
export const PRESENCE_OFFLINE = ""; // порожній payload очищає retained (LWT і вихід)

// ===================== Ключі localStorage =====================

export const LS_ROOM = "velyki.room";
export const LS_THEME = "velyki.theme";         // тема Display (локальна)
export const LS_SIZE = "velyki.size";            // розмір тексту Display
export const LS_WAKE = "velyki.wakeDismissed";
export const LS_SENDER_THEME = "velyki.senderTheme"; // власна тема Sender
export const LS_PUSH_THEME = "velyki.pushTheme";     // тема Display, яку Sender хоче надіслати

// ===================== Ролі / екрани =====================

export const ROLE_DISPLAY = "display";
export const ROLE_SENDER = "sender";

// ===================== Токен кімнати =====================

// Алфавіт base62 для генерації токена
export const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// Довжина токена (24 символи — єдиний «секрет» парування)
export const TOKEN_LENGTH = 24;

// ===================== Автомасштаб (fit-text) =====================

// Мінімальний розмір шрифту (px)
export const FIT_MIN_FONT_PX = 18;
// Частка висоти контейнера, що використовується для max-розміру
export const FIT_HEIGHT_RATIO = 0.9;
// Максимальна кількість ітерацій бінарного пошуку
export const FIT_MAX_STEPS = 18;

// ===================== QR-код =====================

export const QR_SIZE = 220;  // ширина й висота QR-коду (px)
export const QR_CORRECT_LEVEL = "M";  // рівень корекції помилок

// ===================== UI / таймінги =====================

// Скільки рядків історії тримати в пам'яті Display
export const HISTORY_LIMIT = 10;
// Затримка перед публікацією live-тексту (ms)
export const DEBOUNCE_MS = 150;
// Затримка після orientationchange перед refit (ms)
export const ORIENTATION_DELAY_MS = 300;
// Затримка перед фокусом textarea у sender (ms)
export const FOCUS_DELAY_MS = 300;

// ===================== Значення за замовчуванням =====================

export const DEFAULT_THEME = "dark";
export const DEFAULT_SIZE = "1";

// ===================== UI-тексти =====================

export const TEXT_PLACEHOLDER = "Очікую текст…";
export const TEXT_QR_UNAVAILABLE = "QR недоступний — відкрийте посилання нижче вручну.";

// Тексти індикатора з'єднання
export const TEXT_STATUS_CONNECTED = "з'єднано";          // обидва пристрої на зв'язку (зелено)
export const TEXT_STATUS_WAITING = "очікування пристрою…"; // на брокері, але пари ще немає
export const TEXT_STATUS_RECONNECT = "перепідключення…";
export const TEXT_STATUS_OFFLINE = "немає мережі…";
export const TEXT_STATUS_CLOSED = "роз'єднано…";
export const TEXT_STATUS_ERROR = "помилка з'єднання";
export const TEXT_STATUS_NO_MQTT = "немає бібліотеки MQTT";
