// E2E-шифрування payload (AES-GCM, 256-біт). Уся криптологіка ізольована тут.
// Брокер публічний → текст шифрується у браузері перед публікацією і
// дешифрується у браузері на іншому боці. Ключ ніколи не йде на сервер.
// Сумісність із Safari 15: лише нативний Web Crypto (crypto.subtle,
// crypto.getRandomValues, btoa/atob); без generateKey/exportKey і top-level await.
import { KEY_BYTES, IV_BYTES, PAYLOAD_SEP } from "./config.js";

// ===================== base64url ↔ байти =====================
// Без padding, url-safe алфавіт (-/_) — безпечно для будь-якого транспорту.
function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ===================== Ключ =====================
// Випадковий 256-біт ключ як base64url-рядок (синхронно, без subtle.generateKey).
export function makeKeyB64() {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

let _keyPromise = null; // Promise<CryptoKey>

// usage: "encrypt" (Sender) | "decrypt" (Display)
export function initKey(b64, usage) {
  _keyPromise = crypto.subtle.importKey(
    "raw", b64urlDecode(b64), { name: "AES-GCM" }, false, [usage]
  );
  return _keyPromise;
}

// ===================== encrypt / decrypt =====================
const enc = new TextEncoder();
const dec = new TextDecoder();

// Повертає рядок base64url(iv)+"."+base64url(ciphertext). Свіжий IV на кожен виклик.
export async function encrypt(plaintext) {
  const key = await _keyPromise;
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return b64urlEncode(iv) + PAYLOAD_SEP + b64urlEncode(new Uint8Array(ct));
}

// Повертає відкритий рядок або null при будь-якій помилці (хибний ключ,
// підміна, чужий/некоректний формат) — щоб такі повідомлення тихо ігнорувались.
export async function decrypt(payload) {
  try {
    const key = await _keyPromise;
    const i = payload.indexOf(PAYLOAD_SEP);
    if (i < 0) return null;
    const iv = b64urlDecode(payload.slice(0, i));
    const ct = b64urlDecode(payload.slice(i + 1));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return dec.decode(pt);
  } catch (e) {
    return null;
  }
}
