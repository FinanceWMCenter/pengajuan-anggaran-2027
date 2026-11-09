// Satu pintu pemanggilan database: POST /rest/v1/rpc/<fungsi> (PostgREST Supabase).
// Menambahkan token, menangkap error jaringan/server, dan menerjemahkan kode error ke pesan Indonesia.
// Tidak pernah menampilkan pesan SQL mentah ke pengguna.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getSession, clearSession } from './session.js';

export const MESSAGES = {
  AUTH_REQUIRED: 'Sesi berakhir. Masukkan PIN lagi.',
  AUTH_EXPIRED: 'Sesi berakhir. Masukkan PIN lagi.',
  FORBIDDEN: 'Anda tidak punya akses untuk tindakan ini.',
  NOT_FOUND: 'Data tidak ditemukan. Mungkin sudah dihapus.',
  CONFLICT: 'Program ini sudah diubah oleh orang lain. Muat ulang untuk melihat versi terbaru.',
  NETWORK: 'Koneksi bermasalah. Data Anda aman di perangkat ini, coba lagi.',
  SERVER: 'Server sedang bermasalah. Coba lagi beberapa saat; bila berlanjut, hubungi Finance.',
  CONFIG: 'Aplikasi belum terhubung ke database (file config.js belum diisi). Hubungi Finance.',
  PIN_WRONG: 'PIN salah. Coba lagi.',
  PIN_NOT_SET: 'PIN untuk divisi ini belum diatur. Hubungi Finance.',
  VALIDATION: 'Ada isian yang belum sesuai.',
};

export class ApiError extends Error {
  constructor(code, message, field = null, detail = null) {
    super(message || MESSAGES[code] || MESSAGES.SERVER);
    this.code = code;
    this.field = field;
    this.detail = detail;
  }
}

export function isConfigured() {
  return /^https?:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('ISI-PROJECT') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('ISI-');
}

/** Pendengar sesi berakhir (dipasang oleh app.js untuk mengarahkan ke PIN gate). */
let onAuthExpired = () => {};
export function setAuthExpiredHandler(fn) {
  onAuthExpired = fn;
}

/**
 * Panggil fungsi RPC.
 * @param {string} name nama fungsi (mis. 'rpc_list_programs')
 * @param {object} args argumen bernama (tanpa p_token; ditambahkan otomatis bila auth=true)
 * @param {{auth?: boolean}} opts
 */
export async function rpc(name, args = {}, { auth = true } = {}) {
  if (!isConfigured()) throw new ApiError('CONFIG');

  const body = { ...args };
  if (auth) {
    const s = getSession();
    if (!s) {
      onAuthExpired();
      throw new ApiError('AUTH_REQUIRED');
    }
    body.p_token = s.token;
  }

  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  // Kunci lama (JWT "eyJ...") dikirim juga sebagai Bearer; kunci publishable baru cukup di header apikey.
  if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('NETWORK');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    const raw = (data && typeof data.message === 'string') ? data.message : '';
    const err = toApiError(raw, res.status);
    if (err.code === 'AUTH_EXPIRED' || err.code === 'AUTH_REQUIRED') {
      clearSession();
      onAuthExpired();
    }
    if (err.code === 'SERVER') console.error(`[rpc ${name}] HTTP ${res.status}`, data); // untuk diagnosa, bukan untuk pengguna
    throw err;
  }
  return data;
}

function toApiError(raw, status) {
  if (raw.startsWith('VALIDATION:')) {
    const rest = raw.slice('VALIDATION:'.length);
    const idx = rest.indexOf(':');
    const field = idx >= 0 ? rest.slice(0, idx) : rest;
    const msg = idx >= 0 ? rest.slice(idx + 1) : MESSAGES.VALIDATION;
    return new ApiError('VALIDATION', msg, field);
  }
  if (['AUTH_REQUIRED', 'AUTH_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'].includes(raw)) {
    return new ApiError(raw);
  }
  if (status === 0 || status === 502 || status === 503 || status === 504) return new ApiError('NETWORK');
  return new ApiError('SERVER', null, null, raw);
}

/** Pesan ramah untuk error apa pun (termasuk error JavaScript tak terduga). */
export function errorMessage(err) {
  if (err instanceof ApiError) return err.message;
  console.error(err);
  return 'Terjadi kendala di aplikasi. Muat ulang halaman; bila berlanjut, hubungi Finance.';
}
