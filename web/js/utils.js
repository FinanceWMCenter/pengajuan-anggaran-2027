// Utilitas umum: pembuat elemen DOM yang aman (anti-XSS), format Rupiah/tanggal, parsing angka.
// Aturan: data dari pengguna SELALU masuk lewat textContent (fungsi h()), tidak pernah lewat innerHTML.

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const UNIT_SUGGESTIONS = ['pcs', 'paket', 'orang', 'hari', 'kali', 'unit', 'bulan', 'lembar', 'set', 'porsi'];

// Batas aturan bisnis (sama dengan database; database tetap menjadi penentu akhir)
export const LIMITS = {
  namaMin: 3, namaMax: 150, picMin: 2, picMax: 100, uraianMin: 3, uraianMax: 200,
  satuanMax: 30, catatanMax: 300, maxRows: 200, qtyMax: 100000, hargaMax: 1000000000000,
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/**
 * Buat elemen. Anak berupa string selalu menjadi teks (aman dari XSS).
 * props: class, text, dataset, on<Event> (fungsi), atribut lain (string/boolean), value/checked (properti).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val === null || val === undefined || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'text') el.textContent = String(val);
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'value') el.value = val;
      else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'readOnly') el[key] = Boolean(val);
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  appendChildren(el, children);
  return el;
}

export function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Ikon dari sprite di index.html. Ikon dekoratif disembunyikan dari pembaca layar. */
export function icon(name, cls = 'ic') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

/** Escape untuk kasus langka yang butuh string HTML. Sebisa mungkin pakai h(). */
export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Angka & Rupiah
// ---------------------------------------------------------------------------

/** "1250000" -> "1.250.000" (titik ribuan). */
export function groupDigits(digits) {
  return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1250000 -> "Rp 1.250.000". Rupiah selalu bilangan bulat. */
export function formatRupiah(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return '-';
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp ${groupDigits(Math.abs(n))}`;
}

/** Ringkas untuk kartu: "Rp 312,3 jt", "Rp 5,2 M", "Rp 1,1 T". Di bawah 1 juta tampil penuh. */
export function formatRupiahShort(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const fmt = (x) => x.toLocaleString('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  if (abs >= 1e12) return `Rp ${fmt(n / 1e12)} T`;
  if (abs >= 1e9) return `Rp ${fmt(n / 1e9)} M`;
  if (abs >= 1e6) return `Rp ${fmt(n / 1e6)} jt`;
  return formatRupiah(n);
}

/** Angka biasa format Indonesia: 2.5 -> "2,5"; 1500 -> "1.500". */
export function formatNumber(value, maxDecimals = 2) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('id-ID', { maximumFractionDigits: maxDecimals });
}

export function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
}

/**
 * Teks rupiah -> bilangan bulat. "Rp 1.250.000" -> 1250000; "1.250.000,00" -> 1250000; "" -> null.
 * Mengembalikan NaN bila ada desimal bukan nol (Rupiah harus bulat).
 */
export function parseRupiah(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  let s = String(text).trim();
  if (s === '') return null;
  s = s.replace(/^rp\.?/i, '').replace(/\s+/g, '');
  // Buang desimal ",00" / ",0" di akhir (format Indonesia)
  const dec = s.match(/,(\d{1,2})$/);
  if (dec) {
    if (Number(dec[1]) !== 0) return NaN;
    s = s.slice(0, -dec[0].length);
  }
  if (!/^[\d.]+$/.test(s)) return NaN;
  const digits = s.replace(/\./g, '');
  if (digits === '') return null;
  return Number(digits);
}

/**
 * Teks qty -> angka. Koma = desimal ("2,5" -> 2.5). Titik ribuan dikenali ("1.000" -> 1000).
 * "2.5" juga diterima sebagai 2,5. Kosong -> null, tidak valid -> NaN.
 */
export function parseQty(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  let s = String(text).trim().replace(/\s+/g, '');
  if (s === '') return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d+)?$/.test(s)) s = s.replace(',', '.');
  else if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Subtotal sama persis dengan database: round(qty x harga), dihitung dengan BigInt agar tidak meleset. */
export function computeSubtotal(qty, harga) {
  const q = Number(qty);
  const p = Number(harga);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return 0;
  const qCents = BigInt(Math.round(q * 100));
  const price = BigInt(Math.round(p));
  return Number((qCents * price + 50n) / 100n);
}

export function hasMaxDecimals(n, max) {
  return Math.abs(Math.round(n * 10 ** max) - n * 10 ** max) < 1e-6;
}

// ---------------------------------------------------------------------------
// Tanggal (Asia/Jakarta)
// ---------------------------------------------------------------------------

const TZ = 'Asia/Jakarta';

/** "2027-01-15" (tanggal tanpa jam) -> "15 Jan 2027". */
export function formatDate(dateStr, long = false) {
  if (!dateStr) return '-';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  const names = long ? MONTHS : MONTHS_SHORT;
  return `${Number(m[3])} ${names[Number(m[2]) - 1]} ${m[1]}`;
}

/** Timestamp -> "15 Jan 2027 09:30" (WIB). */
export function formatDateTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${MONTHS_SHORT[Number(parts.month) - 1]} ${parts.year} ${parts.hour}:${parts.minute}`;
}

export function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace('.', ':');
}

export function monthName(n, year) {
  const name = MONTHS[Number(n) - 1] || '-';
  return year ? `${name} ${year}` : name;
}

export function quarterOf(month) {
  return Math.floor((Number(month) - 1) / 3) + 1;
}

// ---------------------------------------------------------------------------
// Lain-lain
// ---------------------------------------------------------------------------

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Untuk pencarian: huruf kecil, tanpa aksen, spasi dirapikan. */
export function normalize(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Cegah formula injection di Excel/CSV: sel teks yang diawali = + - @ tab CR diberi awalan '. */
export function sanitizeCell(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Kode acak kriptografis berisi digit (untuk saran PIN). */
export function randomDigits(length) {
  const out = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) out.push(buf[0] % 10);
  }
  return out.join('');
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(n, word) {
  return `${Number(n).toLocaleString('id-ID')} ${word}`;
}
