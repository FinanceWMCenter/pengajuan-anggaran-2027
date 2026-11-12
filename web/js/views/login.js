// Halaman masuk tunggal (D-38): cukup ketik PIN 6 digit; sistem menentukan akunnya (divisi atau Finance).
// Dihiasi pita nama divisi yang bergerak pelan dari kanan ke kiri (D-39), berhenti saat disentuh/disorot,
// dan diam bila perangkat meminta "kurangi gerakan".

import { h, icon } from '../utils.js';
import { rpc, errorMessage, MESSAGES } from '../api.js';
import { getSession, setSession, clearSession, forgetRememberedName } from '../session.js';
import { getDivisions } from '../store.js';
import { createPinPad } from '../ui/pin-pad.js';
import { contactLinks } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { playWelcome } from '../ui/welcome.js';
import { navigate, onCleanup } from '../router.js';

/** Halaman awal untuk sesi yang sudah masuk. */
export function homePathFor(session) {
  if (!session) return '/';
  return session.role === 'finance' ? '/finance/overview' : `/d/${session.division.code}`;
}

/** Apakah sesi boleh membuka alamat ini? */
function canOpen(session, path) {
  if (!path || path === '/' || path === '/finance') return false;
  if (session.role === 'finance') return path.startsWith('/finance/') || path.startsWith('/d/');
  return path === `/d/${session.division.code}` || path.startsWith(`/d/${session.division.code}/`);
}

/**
 * @param {HTMLElement} main
 * @param {object} ctx  {contacts, returnTo?, wanted?: {name}}  wanted = divisi pada alamat yang ingin dibuka
 */
export async function loginView(main, ctx) {
  const { contacts } = ctx;
  main.classList.add('login-main');
  forgetRememberedName(); // D-46: cukup PIN, tanpa kolom nama

  const existing = getSession();
  const groupByCode = new Map(); // untuk teks kecil di animasi selamat datang (diisi saat daftar divisi dimuat)
  let note = null;
  if (ctx.wanted && existing && existing.role === 'division') {
    note = h('p', { class: 'login-note' }, icon('info', 'ic-sm'), ` Anda sedang masuk sebagai ${existing.division.name}. Halaman ini milik ${ctx.wanted.name}; masukkan PIN ${ctx.wanted.name} untuk membukanya.`);
  } else if (ctx.wanted) {
    note = h('p', { class: 'login-note' }, icon('info', 'ic-sm'), ` Masukkan PIN untuk membuka halaman ${ctx.wanted.name}.`);
  } else if (ctx.financeOnly) {
    note = h('p', { class: 'login-note' }, icon('info', 'ic-sm'), ' Halaman ini khusus Finance. Masukkan PIN Finance.');
  }

  const pad = createPinPad({
    length: 6,
    label: 'PIN',
    onSubmit: async (pin) => {
      let res;
      try {
        res = await rpc('rpc_login_pin', { p_pin: pin }, { auth: false });
      } catch (e) {
        return { ok: false, message: errorMessage(e) };
      }
      if (!res || !res.ok) return { ok: false, message: MESSAGES[res?.error] || MESSAGES.PIN_WRONG };

      if (existing) clearSession();
      const s = setSession(res);
      const target = ctx.returnTo && canOpen(s, ctx.returnTo) ? ctx.returnTo : homePathFor(s);
      if (ctx.returnTo && target !== ctx.returnTo && s.role === 'division') {
        toast(`PIN ini milik ${s.division.name}. Anda masuk ke ${s.division.name}.`, 'info');
      }
      // Animasi selamat datang (D-41), kecuali saat kembali ke form yang sedang diisi (sesi habis di tengah)
      if (!/\/(new|edit)(\?|$)/.test(target)) {
        try {
          playWelcome(s.role === 'finance'
            ? { name: 'Finance', sub: 'Akses semua divisi' }
            : { name: s.division.name, sub: groupByCode.get(s.division.code) });
        } catch { /* hiasan saja: abaikan */ }
      }
      navigate(target, { replace: true, force: true });
      return { ok: true };
    },
  });

  const marquee = h('div', { class: 'marquee', 'aria-hidden': 'true' });

  // Layar lebar: 2 kolom (kiri: logo, judul, pita; kanan: kartu PIN). HP/tablet: bertumpuk.
  main.append(
    h('div', { class: 'login-hero' },
      h('div', { class: 'brand-head login-brand' },
        h('img', { src: 'assets/logo-navy.png', alt: 'WM Center', width: 962, height: 646, class: 'logo-auto' }),
        h('h1', null, 'Pengajuan Anggaran 2027'),
        h('p', null, 'Portal pengajuan program dan anggaran divisi')),
      marquee),
    h('section', { class: 'wm-login-card pin-card login-card', 'aria-labelledby': 'login-title' },
      h('h2', { class: 'pin-title', id: 'login-title' }, 'Masukkan PIN'),
      h('p', { class: 'pin-sub' }, '6 digit dari Finance. Divisi Anda terbaca otomatis.'),
      note,
      pad.el,
      h('div', { class: 'pin-help' }, h('b', null, 'Lupa PIN? '), 'Hubungi Finance: ', contactLinks(contacts), '.')),
  );
  pad.focus();

  // Pita nama divisi (dekoratif). Gagal memuat = pita disembunyikan, login tetap berjalan.
  try {
    const groups = await getDivisions();
    groups.forEach((g) => (g.divisions || []).forEach((d) => groupByCode.set(d.code, g.name)));
    const names = groups.flatMap((g) => (g.divisions || []).map((d) => d.name));
    buildMarquee(marquee, names);
  } catch {
    marquee.hidden = true;
  }
}

function buildMarquee(el, names) {
  if (!names.length) { el.hidden = true; return; }
  const list = () => h('ul', { class: 'marquee-list' }, names.map((n) => h('li', null, n)));
  const track = h('div', { class: 'marquee-track' }, list(), list());
  el.replaceChildren(track);

  // Kecepatan tetap +/- 40 px per detik, berapa pun panjang daftar dan lebar layar
  const setDuration = () => {
    const w = track.firstChild.getBoundingClientRect().width;
    if (w > 0) el.style.setProperty('--marquee-duration', `${Math.max(20, Math.round(w / 40))}s`);
  };
  requestAnimationFrame(setDuration);
  window.addEventListener('resize', setDuration);
  onCleanup(() => window.removeEventListener('resize', setDuration));

  // Di HP tidak ada "hover": ketuk pita untuk berhenti/jalan
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') el.classList.toggle('is-paused');
  });
}
