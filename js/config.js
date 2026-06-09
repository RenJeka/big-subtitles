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
// Налаштування: Sender надсилає Display розмір + тему + режим показу + швидкість + висоту рядка
// (payload: {type, size, displayTheme, mode, speed, lineHeight}, retain:true)
export const MSG_TYPE_SETTINGS = "settings";

// ===================== Присутність (presence) =====================
// Кожна роль публікує retained-маркер у власну тему velyki/<room>/presence/<role>
// і підписується на тему партнера. LWT/закриття вкладки очищають маркер.
export const PRESENCE_INFIX = "/presence/";
export const PRESENCE_ONLINE = "1";
export const PRESENCE_OFFLINE = ""; // порожній payload очищає retained (LWT і вихід)

// ===================== Тема налаштувань =====================
// Налаштування (settings) публікуються в ОКРЕМУ тему velyki/<room>/settings із
// власним retain. Інакше retained-слот цієї теми затирав би retained-`live`
// (на тему припадає рівно один retained-payload), і перезавантажений Display не
// отримував би актуальних налаштувань Sender.
export const SETTINGS_INFIX = "/settings";

// ===================== Ключі localStorage =====================

export const LS_ROOM = "velyki.room";
export const LS_THEME = "velyki.theme";         // тема Display (локальна)
export const LS_SIZE = "velyki.size";            // розмір тексту Display
export const LS_WAKE = "velyki.wakeDismissed";
export const LS_SENDER_THEME = "velyki.senderTheme"; // власна тема Sender
export const LS_PUSH_THEME = "velyki.pushTheme";     // тема Display, яку Sender хоче надіслати
export const LS_MODE = "velyki.mode";    // режим показу live-тексту Display
export const LS_SPEED = "velyki.speed";      // швидкість авто-руху (суфлер/бігуча строка)
export const LS_LINEHEIGHT = "velyki.lineheight"; // висота рядка live-тексту
export const LS_KEY = "velyki.key";      // E2E-ключ кімнати (base64url, парний до LS_ROOM)

// ===================== E2E-шифрування (AES-GCM) =====================
// Брокер публічний → payload шифрується у браузері. Ключ не публікується ніколи:
// несеться у фрагменті QR-URL (#…&k=) і персиститься поряд із кімнатою.
export const KEY_BYTES = 32;   // 256-біт ключ AES-GCM
export const IV_BYTES = 12;    // свіжий IV на кожне повідомлення (GCM)
export const PAYLOAD_SEP = "."; // base64url(iv) + "." + base64url(ciphertext)

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

// ===================== Режими показу live-тексту =====================

// fit — автомасштаб (поточний); scroll — фіксований розмір + ручний скрол;
// tele — суфлер (вертикальна авто-прокрутка); marquee — бігуча строка (горизонтальна).
export const MODE_FIT = "fit";
export const MODE_SCROLL = "scroll";
export const MODE_TELE = "tele";
export const MODE_MARQUEE = "marquee";

// Швидкість авто-руху (рівні; ➖/➕ крок = 1): від «дуже повільно» до «дуже швидко».
export const SPEED_MIN = 1;
export const SPEED_MAX = 12;
export const DEFAULT_SPEED = 2;

// Маппінг рівня швидкості → px/сек: pxPerSec = base + (speed-1)*step.
export const TELE_PX_BASE = 8;      // рівень 1 ≈ 8 px/с («дуже повільно»)
export const TELE_PX_STEP = 12;     // рівень 6 ≈ 68 px/с, рівень 12 ≈ 140 px/с
export const MARQUEE_PX_BASE = 30;  // бігучка трохи жвавіша за суфлер
export const MARQUEE_PX_STEP = 24;

// Висота рядка live-тексту (кроки 1–30): lh = 0.8 + (step-1)*0.05.
// Крок 1 → 0.80; крок 10 (дефолт) → 1.25; крок 30 → 2.25.
export const LINEHEIGHT_MIN = 1;
export const LINEHEIGHT_MAX = 30;
export const DEFAULT_LINEHEIGHT = 10;

// Фіксований шрифт у scroll/tele/marquee:
// fontPx = max(FIT_MIN_FONT_PX, round(size * SCROLL_FONT_RATIO * min(wrapW, wrapH)))
export const SCROLL_FONT_RATIO = 0.18;

// ===================== Розмір тексту Display =====================

// Масштаб тексту (0..N): межі та крок кнопок ➖/➕.
// SIZE_MAX > 1 — користувач може робити текст помітно більшим за «вписаний» максимум.
export const SIZE_MIN = 0.35;
export const SIZE_MAX = 3;
export const SIZE_STEP = 0.05;

// ===================== QR-код =====================

export const QR_SIZE = 220;  // ширина й висота QR-коду (px)
export const QR_CORRECT_LEVEL = "M";  // рівень корекції помилок

// ===================== UI / таймінги =====================

// Скільки рядків історії тримати в пам'яті Display
export const HISTORY_LIMIT = 10;
// Затримка перед публікацією live-тексту (ms) (live-typing.deprecated.js)
// export const DEBOUNCE_MS = 150;
// Затримка після orientationchange перед refit (ms)
export const ORIENTATION_DELAY_MS = 300;
// Затримка перед фокусом textarea у sender (ms)
export const FOCUS_DELAY_MS = 300;
// Скільки чекати після останньої дії користувача, перш ніж відновити авто-рух
// суфлера/бігучки після ручного скролу назад (ms).
export const MOTION_SCROLL_RESUME_MS = 5000;

// ===================== Значення за замовчуванням =====================

export const DEFAULT_THEME = "dark";
export const DEFAULT_SIZE = "1";
export const DEFAULT_MODE = MODE_SCROLL; // типовий режим — прокрутка з фіксованим розміром

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
