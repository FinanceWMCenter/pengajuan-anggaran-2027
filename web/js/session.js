// Sesi login (token) disimpan di sessionStorage: hilang saat tab ditutup. PIN TIDAK pernah disimpan.

const KEY = 'wm-anggaran-sesi';
const NAME_KEY = 'wm-anggaran-nama';
const DRAFT_PREFIX = 'wm-anggaran-draft:';

let current = load();

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token || !s.expires_at || new Date(s.expires_at) <= new Date()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function getSession() {
  if (current && new Date(current.expires_at) <= new Date()) clearSession();
  return current;
}

/** data dari rpc_login / rpc_login_finance: {token, role, division?, actor_name, expires_at} */
export function setSession(data) {
  current = {
    token: data.token,
    role: data.role,
    division: data.division ? { code: data.division.code, name: data.division.name } : null,
    actor_name: data.actor_name || null,
    expires_at: data.expires_at,
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(current)); } catch { /* mode privat: sesi hanya di memori */ }
  return current;
}

export function clearSession() {
  current = null;
  try { sessionStorage.removeItem(KEY); } catch { /* abaikan */ }
}

export function isFinance() {
  return getSession()?.role === 'finance';
}

/** Sesi berlaku untuk halaman divisi ini? (sesi divisi miliknya, atau sesi Finance = lihat saja) */
export function canAccessDivision(code) {
  const s = getSession();
  if (!s) return false;
  return s.role === 'finance' || (s.role === 'division' && s.division?.code === code);
}

// Nama pengisi terakhir di perangkat ini (kenyamanan saja, opsional)
export function getRememberedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function rememberName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch { /* abaikan */ }
}

// Draft lokal (autosave) - hanya data form, tanpa token/PIN
export function draftKey(divisionCode, programId) {
  return `${DRAFT_PREFIX}${divisionCode}:${programId || 'baru'}`;
}
export function readDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
export function writeDraft(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
export function removeDraft(key) {
  try { localStorage.removeItem(key); } catch { /* abaikan */ }
}
/** Saat logout: hapus semua draft lokal divisi itu (05_SECURITY_MODEL 5). */
export function clearDivisionDrafts(divisionCode) {
  try {
    const prefix = `${DRAFT_PREFIX}${divisionCode}:`;
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  } catch { /* abaikan */ }
}
