# AGENTS.md

Інструкції для AI-агентів (Claude Code, Codex та ін.), що працюють із цим репозиторієм.
Це **єдине джерело** агентних інструкцій; `CLAUDE.md` лише підключає цей файл.

## Що це

«ВеликіСлова» (big-subtitles) — застосунок доступності для людей із порушеннями слуху/зору.
Помічник пише текст на телефоні (**Sender**) → текст з'являється великим шрифтом на
іншому екрані (**Display**, напр. iPad). Один статичний фронтенд, **без бекенду й БД**;
синхронізація через публічний MQTT-брокер по WebSocket. Деталі для людей — у `README.md`,
вихідна (історична) постановка — у `spec-velyki-slova-mvp.md`.
Спілкування/коміти/доки — українською.

## Запуск і перевірка

Збірки немає (статика). Тестів і лінтера немає — верифікація **ручна в браузері**.

```bash
py -m http.server 8000        # або: npx http-server -p 8000
```

- **Відкривати тільки через `http://localhost` або HTTPS, НЕ через `file://`** — код на
  ES-модулях, які браузер не вантажить з file:// (CORS).
- Сценарій перевірки (дві вкладки): вкладка A `…/?role=display` згенерує кімнату+ключ+QR;
  скопіювати посилання з-під QR (`?role=sender#room=…&k=…`) у вкладку B; надіслати рядок у B
  (Enter або «Відправити») → він має з'явитися в A < 1 с. Перевіряти: історію на обох боках,
  тему/розмір/висоту рядка, режими показу (суфлер/бігучка) і швидкість, кнопки очищення
  («Дисплей» / «Поле»), перезавантаження (кімната+ключ з localStorage, налаштування — з
  retained-повідомлення), коротку втрату мережі (статус «перепідключення»).
- Для прогону зручний будь-який браузерний MCP (wmux browser, Chrome DevTools, Playwright):
  дві вкладки display/sender; Sender відкривати за посиланням з-під QR (`#room=…&k=…`).
  Вводити в `textarea#input`, читати `#live` (`.vs-msg` у суфлері/бігучці) і
  `#history .line` на display.

## Критичні обмеження (звіряти кожну зміну)

- **Приймач — iPad Air 2 / Safari 15.** ES-модулі ОК (Safari 11+), optional chaining, flex
  `gap`, `inset` — ОК; **без top-level await** і обережно з новішими API (`Array.at`,
  `structuredClone`, regex lookbehind, `static {}` — Safari 15.4+/16.4+). Тестувати ментально
  під WebKit 15. Відоме: vendor MQTT.js викликає `Array.at()` у колбеку subscribe — на
  Safari < 15.4 помилка тиха й не ламає підписку.
- **Українська вводиться системною клавіатурою** (Gboard/голос). НЕ використовувати
  Web Speech API — застосунок бере вже готовий текст із поля.
- **Нічого не зберігати**, крім кімнати/ключа/налаштувань у `localStorage`. Уся криптологіка —
  лише в `utils/crypto.js`; не виносити її в інші модулі.
- **Шрифти.** Інтерфейс — **Andika** (Google Fonts, повна кирилиця). Великий live-текст
  (`#live`) навмисно — **Arial/Helvetica** (`css/display.css`). Перед заміною будь-якого шрифту
  перевіряти наявність кирилиці (багато «accessibility»-шрифтів, як-от Atkinson Hyperlegible,
  її не мають).
- **Жодних «магічних» чисел і рядків** поза `js/config.js`; **жодних кольорів** поза
  CSS-токенами в `css/base.css`; **жодних inline-стилів** у `index.html`.

## Модель безпеки (важливо при змінах протоколу)

- Брокер **публічний**. Будь-хто може підписатися на `velyki/#`, тож **назва кімнати не
  секрет** — її бачить кожен. Конфіденційність тримається **лише на E2E-ключі**
  (AES-GCM 256-біт), який несеться у фрагменті URL (`#…&k=`) і `localStorage` і ніколи не
  публікується на брокер.
- Шифруються `commit`, `clear`, `settings`. **Presence-маркери не шифруються** (`"1"`/`""`).
- Відомі обмеження (свідомо не виправлені): немає захисту від **повторного відтворення**
  старих шифротекстів і від підробки presence; шифротекст не прив'язаний до теми.
- Значення кімнати/ключа з URL і localStorage **валідуються** (`ROOM_PATTERN`/`KEY_PATTERN`
  у `config.js`, `resolveRoom`/`resolveKey` в `utils.js`): некоректні ігноруються, щоб не
  отримати MQTT-тему з wildcard (`+`, `#`, `/`) чи битий ключ.
- Сторонні **скрипти** — лише self-host у `js/vendor/` (не CDN): сторонній скрипт має доступ
  до ключа. Виняток, що лишається: **Pico CSS** і шрифт Andika вантажаться з CDN
  (стилі до ключа доступу не мають). Версії — `js/vendor/README.md`.

## Архітектура

Один HTML, **три екрани** в одному коді; режим визначає `app.js` за `?role=display|sender`,
інакше — стартовий екран із кнопками. `index.html` містить розмітку всіх трьох екранів
(`#screen-start`, `#screen-display`, `#screen-sender`), спільний `#qr-modal`, SVG-спрайт
іконок і підключає **лише точку входу** `<script type="module" src="js/app.js">`.
Бібліотеки MQTT.js і qrcodejs — класичні скрипти з `js/vendor/`, що дають глобали
`mqtt` / `QRCode` (у модулях — через `typeof mqtt`).

**ES-модулі, явні `import`/`export`.** Шар залежностей:

| Модуль | Відповідальність |
|---|---|
| `config.js` | **Усі** константи: брокер, теми MQTT, presence, ключі localStorage, шифрування (`KEY_BYTES`/`IV_BYTES`), валідація (`ROOM_PATTERN`/`KEY_PATTERN`), ролі, типи повідомлень, режими/швидкості/висота рядка, fit-text/QR, таймінги, UI-тексти, значення за замовчуванням |
| `utils/store.js` | Безпечна обгортка над localStorage (`get/set` з fallback) |
| `utils/utils.js` | DOM (`$`, `show`, `innerSize`, `prefersReducedMotion`), `makeToken`, парсинг URL, `resolveRoom`/`saveRoom`, `resolveKey`/`saveKey` (з валідацією), `setStatus`, `bindOutsideClose`, `createHistory` (віджет історії Display/Sender), `highlightModeButtons`, QR-модал (`initQrModal`/`openQrModal`/`closeQrModal`) |
| `utils/crypto.js` | E2E-шифрування (AES-GCM через Web Crypto): `makeKeyB64`/`initKey`/`encrypt`/`decrypt` |
| `utils/fit-text.js` | `fit()`: бінарний пошук найбільшого шрифту, що вміщається у контейнер |
| `utils/mqtt-client.js` | `connect/encode/decode` + presence (LWT/retained-маркери). **Уся MQTT-специфіка тут**: заміна транспорту має не виходити за цей файл |
| `components/live-view.js` | `createLiveView()`: показ тексту за режимом (fit/scroll/tele/marquee). Авто-рух суфлера/бігучки — **чиста CSS-анімація**: JS лише раз на зміну контенту вимірює геометрію й задає `--vs-from/--vs-to/--vs-dur`. Ручний скрол паузить рух, через `MOTION_SCROLL_RESUME_MS` рух відновлюється |
| `components/settings.js` | Панель Display: тема, розмір, режим, швидкість, висота рядка, шестірня/історія, банер автоблокування. `init(hooks)`: `onSizeChange`/`onModeChange`/`onSpeedChange`/`onLineHeightChange`/`onShowQr`; `applyRemoteSettings()` — для `settings` від Sender |
| `screens/display.js` | Режим Display, `init()`: кімната+ключ, live-view, історія, підписка, QR |
| `screens/sender.js` | Режим Sender, `init()`: поле вводу, відправка, очищення, керування налаштуваннями Display |
| `app.js` | Точка входу, `boot()` |

**Стилі** (`css/`) розбито на партіали; `css/styles.css` — **вхідна точка**, що лише
підключає їх через `@import` (дзеркало `app.js`): `base.css` (токени — у т.ч. кольори
`--sep`, `--btn-clear-*`; reset, каркас, утиліти `.hidden`/`.btn-emoji`/`.icon-inline`/
`.svg-sprite`), `start.css`, `components.css` (статус/тулбар/панель налаштувань/степер),
`display.css` (панель історії — спільна з Sender, live-текст, режими, банер), `sender.css`,
`qr-modal.css`. Над ними — **Pico CSS** (класи кнопок `secondary outline`).
`?v=N` у `@import` та в `<link>` — інвалідатор кеша (зараз `v=12`); бампати разом при зміні
стилів. Іконки: зовнішні SVG у `assets/` (через `<img>`) і спрайт `<symbol>` в `index.html`
(через `<use href="#…">`, колір — `currentColor`).

## Протокол

Payload — `base64url(iv) + "." + base64url(ciphertext)` від AES-GCM над JSON.

| Повідомлення | Тема | Хто → кому | retain |
|---|---|---|---|
| `{ "type":"commit", "text":"…" }` | `velyki/<room>` | Sender → Display: рядок у live та історію | ні |
| `{ "type":"clear" }` | `velyki/<room>` | Sender → Display: очистити live та історію | ні |
| `{ "type":"settings", "size", "displayTheme", "mode", "speed", "lineHeight" }` | `velyki/<room>/settings` | Sender → Display; публікується при кожному (пере)підключенні й зміні | так |
| `"1"` / `""` (**без шифрування**) | `velyki/<room>/presence/<role>` | кожна роль про себе; LWT і `pagehide` очищають | так |

- `settings` — в **окремій темі**, щоб мати власний retained-слот: перезавантажений Display
  одразу отримує актуальні налаштування. Тип повідомлення визначає обробник після дешифрування.
- `live` (`MSG_TYPE_LIVE`) — застарілий «живий набір»: Sender його не шле, Display ігнорує.
- Display тримає історію (останні `HISTORY_LIMIT` = 10 рядків) у самому DOM (`#history`).
  Sender має власну історію відправленого. Тап по рядку: на Display — показати знову, на
  Sender — повернути в поле вводу.
- Display сам закриває QR-модал, коли бачить Sender онлайн.

**Парування:** Display генерує кімнату-токен (24 символи base62) + E2E-ключ, кладе їх у
`localStorage` і `#room=…&k=…`, показує QR із повним Sender-URL. Sender бере кімнату й ключ
із фрагмента URL або з `localStorage`; без них поле вводу блокується з підказкою.

## Як розширювати

- **Новий екран:** секція в `index.html` + `js/screens/<name>.js` з `export function init(){…}` +
  імпорт у `app.js` і гілка в `boot()`; стилі — окремий партіал у `css/` + `@import` у
  `styles.css` (і бамп `?v=`).
- **Нове налаштування Display:** константи/ключ LS у `config.js` → UI в обох панелях
  (`index.html`) → `settings.js` (локально + `applyRemoteSettings`) → `sender.js`
  (`publishSettings`) → таблиця протоколу тут і в `README.md`.
- **Інший транспорт** — лише `utils/mqtt-client.js`, зберігши `connect/encode/decode`.
- Тримати сумісність із Safari 15 і не покладатися на `file://`.

## Git

Гілка `main` — основна; працювати у feature-гілці й комітити лише на прохання користувача.
Артефакти перевірки (`.playwright-mcp/`, `display-*.png`, логи) — у `.gitignore`.
