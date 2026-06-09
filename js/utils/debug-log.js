// ТИМЧАСОВИЙ діагностичний логер: дослідження бага «стопору» анімації суфлера/бігучки
// на iPad Air 2 / Safari 15. Кільцевий буфер подій + dumpLog() у текст для копіювання.
// Прибрати разом з інструментуванням у live-view.js після фіксу.
const MAX = 1000;
const buf = [];

function now() {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}
let t0 = now();

/**
 * Appends one diagnostic record to the ring buffer.
 * @param {string} tag short event name
 * @param {object|null} data flat key→value map (numbers are rounded on dump)
 */
export function logEvent(tag, data) {
  buf.push({ t: now() - t0, tag: tag, data: data || null });
  if (buf.length > MAX) buf.shift();
}

/** Clears the buffer and resets the time origin. */
export function clearLog() {
  buf.length = 0;
  t0 = now();
}

function envHeader() {
  const lines = [];
  lines.push("=== big-subtitles debug log ===");
  lines.push("when:     " + new Date().toISOString());
  lines.push("ua:       " + (navigator.userAgent || "?"));
  lines.push("viewport: " + window.innerWidth + "x" + window.innerHeight +
    "  dpr=" + (window.devicePixelRatio || "?"));
  lines.push("records:  " + buf.length + (buf.length >= MAX ? " (буфер переповнено — старі обрізано)" : ""));
  lines.push("legend:   *_computed = getComputedStyle (підозрюваний), *_analytic = аналітика з часу");
  lines.push("================================");
  return lines.join("\n");
}

function fmt(v) {
  if (v == null) return "";
  const parts = [];
  Object.keys(v).forEach(function (k) {
    let val = v[k];
    if (typeof val === "number" && isFinite(val)) val = Math.round(val * 1000) / 1000;
    parts.push(k + "=" + val);
  });
  return parts.join("  ");
}

/** @returns {string} full human-readable dump (env header + all records). */
export function dumpLog() {
  const lines = [envHeader()];
  for (let i = 0; i < buf.length; i++) {
    const r = buf[i];
    lines.push(r.t.toFixed(1).padStart(10) + "ms  " + r.tag.padEnd(16) + fmt(r.data));
  }
  return lines.join("\n");
}
