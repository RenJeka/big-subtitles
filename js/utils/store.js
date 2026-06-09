// Тонка обгортка над localStorage із безпечним fallback.

export function get(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function set(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}
