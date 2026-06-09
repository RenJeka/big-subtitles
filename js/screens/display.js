// Режим Display (iPad): великий автомасштабований live-текст, історія, QR-модал.
// Тема/розмір/банер делеговано в settings, автомасштаб — у fit-text.
import {
  ORIENTATION_DELAY_MS, MSG_TYPE_COMMIT, MSG_TYPE_SETTINGS,
  TEXT_PLACEHOLDER, ROLE_DISPLAY, MODE_TELE, MODE_MARQUEE
} from "../config.js";
import { $, show, resolveRoom, makeToken, saveRoom, resolveKey, saveKey, initQrModal, openQrModal, closeQrModal, bindOutsideClose, createHistory } from "../utils/utils.js";
import { connect, decode } from "../utils/mqtt-client.js";
import { makeKeyB64, initKey, decrypt } from "../utils/crypto.js";
import { createLiveView } from "../components/live-view.js";
import * as settings from "../components/settings.js";

function isMotionMode() {
  const m = settings.getMode();
  return m === MODE_TELE || m === MODE_MARQUEE;
}

export function init() {
  show("screen-display");

  // ===================== Кімната та ключ =====================
  let room = resolveRoom();
  if (!room) room = makeToken();
  saveRoom(room);

  let key = resolveKey();
  if (!key) key = makeKeyB64();
  saveKey(key);
  initKey(key, "decrypt");

  if (location.hash.indexOf("room=") === -1) {
    location.hash = "room=" + room + "&k=" + key;
  }

  // ===================== Live-view та історія =====================
  const liveEl    = $("live");
  const liveWrap  = $("live-wrap");
  const liveView  = createLiveView(liveEl, liveWrap, settings.getSize);
  let   lastText  = ""; // для fit/scroll; tele/marquee керує власним потоком

  function setLive(text) {
    lastText = text || "";
    if (text && text.length) {
      liveEl.classList.remove("placeholder");
      liveView.setText(text);
    } else {
      liveEl.classList.add("placeholder");
      liveView.setText(TEXT_PLACEHOLDER);
    }
  }

  function syncView() {
    liveView.setMode(settings.getMode());
    liveView.setSpeed(settings.getSpeed());
    // У fit/scroll відновити останній live-текст; tele/marquee стартує з порожнього потоку.
    if (!isMotionMode()) setLive(lastText);
    else liveEl.classList.remove("placeholder");
  }

  // Клік по рядку в історії: fit/scroll показує його як live,
  // tele/marquee — як поточне атомарне повідомлення.
  const historyPanel = $("history-panel");
  const history = createHistory($("history"), $("history-empty"), (text) => {
    if (isMotionMode()) liveView.showLine(text);
    else setLive(text);
    historyPanel.classList.remove("open");
  });

  // ===================== MQTT =====================
  connect(room, ROLE_DISPLAY, (raw) => {
    // Дешифруємо у браузері; null = хибний ключ / підміна / чужий формат → тихо ігноруємо.
    decrypt(raw).then((json) => {
      if (json === null) return;
      const msg = decode(json);
      if (msg.type === MSG_TYPE_SETTINGS) {
        settings.applyRemoteSettings(msg.size, msg.displayTheme, msg.mode, msg.speed);
        syncView();
        liveView.refresh();
      } else if (msg.type === MSG_TYPE_COMMIT) {
        history.append(msg.text);
        if (isMotionMode()) liveView.showLine(msg.text);
        else setLive(msg.text);
      }
      // MSG_TYPE_LIVE ігнорується — Display показує лише зафіксовані рядки (commit).
    });
  }, $("status-display"), (isConnected) => {
    if (isConnected) closeQrModal();
  });

  // ===================== QR та налаштування =====================
  initQrModal(room, key);
  openQrModal();

  settings.init({
    onSizeChange:  () => liveView.refresh(),
    onModeChange:  syncView,
    onSpeedChange: () => liveView.setSpeed(settings.getSpeed()),
    onShowQr:      openQrModal,
  });

  // ===================== Панелі та resize =====================
  bindOutsideClose($("settings"),     $("gear"),        $("history-btn"));
  bindOutsideClose($("history-panel"), $("history-btn"), $("gear"));

  window.addEventListener("resize",            () => liveView.refresh());
  window.addEventListener("orientationchange", () => setTimeout(() => liveView.refresh(), ORIENTATION_DELAY_MS));

  syncView();
  setLive("");
}
