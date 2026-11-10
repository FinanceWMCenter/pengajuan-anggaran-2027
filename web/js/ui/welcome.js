// Animasi selamat datang setelah PIN benar (D-41).
// Buka: dua panel biru menutup layar dari kiri-kanan, logo putih, centang oranye tergambar, nama muncul huruf demi huruf.
// Tutup: layar biru menyusut menjadi bulatan menuju ikon akun di kanan atas, lalu ikon akun berdenyut oranye sekali.
// Bisa dilewati (klik/ketuk/tombol apa pun). Mode "kurangi gerakan": hanya fade singkat.
// Lapisan ini murni hiasan: bila ada yang gagal, lapisan langsung dibuang dan aplikasi tetap jalan.

import { h } from '../utils.js';

const SPEED = 0.82;          // seluruh animasi dipercepat ~18% (permintaan Finance)
const AUTO_CLOSE = 1800;     // mulai menutup otomatis (ms, sebelum dikali SPEED)
const SAFETY_MS = 6000;      // apa pun yang terjadi, lapisan dibuang setelah ini
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Nama dipecah per kata (tidak terpotong di tengah kata) lalu per huruf. */
function splitName(name) {
  const words = String(name).split(' ').filter(Boolean);
  return words.flatMap((w, i) => [
    h('span', { class: 'welcome-word' }, [...w].map((c) => h('span', { class: 'welcome-ch' }, c))),
    i < words.length - 1 ? ' ' : null,
  ]);
}

/** Titik tengah ikon akun yang terlihat; bila belum ada, pojok kanan atas. */
function avatarTarget() {
  const av = [...document.querySelectorAll('.wm-avatar')].find((e) => e.getBoundingClientRect().width > 0);
  if (av) {
    const r = av.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: av };
  }
  return { x: window.innerWidth - 32, y: 32, el: null };
}

/**
 * Tampilkan animasi selamat datang. Panggil SEBELUM pindah halaman, supaya halaman divisi
 * dimuat di belakang lapisan selama animasi berjalan.
 * @param {{name: string, sub?: string}} o
 */
export function playWelcome({ name, sub }) {
  let overlay = null;
  const anims = [];
  const timers = [];
  let closing = false;
  let removed = false;

  const remove = () => {
    if (removed) return;
    removed = true;
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey, true);
    if (overlay) overlay.remove();
  };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const an = (el, frames, o) => {
    if (!el || typeof el.animate !== 'function') return null;
    const a = el.animate(frames, { fill: 'both', easing: EASE, ...o, duration: o.duration * SPEED, delay: (o.delay || 0) * SPEED });
    anims.push(a);
    return a;
  };
  function onKey() { close(); }

  try {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const subText = sub && sub !== name ? `${sub} · Anggaran 2027` : 'Anggaran 2027';

    const left = h('div', { class: 'welcome-half is-left' });
    const right = h('div', { class: 'welcome-half is-right' });
    const layer = h('div', { class: 'welcome-layer' }, left, right);

    const ring = svg('circle', { class: 'welcome-ring', cx: 32, cy: 32, r: 28, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, transform: 'rotate(-90 32 32)' });
    const tick = svg('path', { class: 'welcome-tick', d: 'M21 33l7 7 15-16', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 });
    const check = svg('svg', { class: 'welcome-check', width: 64, height: 64, viewBox: '0 0 64 64', fill: 'none', 'aria-hidden': 'true' });
    check.append(svg('circle', { class: 'welcome-ring-bg', cx: 32, cy: 32, r: 28 }), ring, tick);

    const logo = h('img', { class: 'welcome-logo', src: 'assets/logo-white.png', alt: '' });
    const hello = h('div', { class: 'welcome-hello' }, 'Selamat datang,');
    const nameEl = h('div', { class: 'welcome-name' }, splitName(name));
    const subEl = h('div', { class: 'welcome-sub' }, subText);
    const content = h('div', { class: 'welcome-content' }, h('div', { class: 'welcome-inner' }, logo, check, hello, nameEl, subEl));
    const skip = h('div', { class: 'welcome-skip', 'aria-hidden': 'true' }, 'klik untuk lewati');
    const live = h('span', { class: 'sr-only' }, `Selamat datang, ${name}`);

    overlay = h('div', { class: `welcome${reduce ? ' is-reduced' : ''}`, role: 'status', 'aria-live': 'polite', onclick: () => close() },
      layer, content, skip, live);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey, true);
    later(remove, SAFETY_MS);

    if (reduce) {
      an(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      later(() => close(), 1000);
      return;
    }

    // ---- Buka (seperti gerbang) ----
    an(left, [{ transform: 'translateX(-101%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.76,0,.24,1)' });
    an(right, [{ transform: 'translateX(101%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.76,0,.24,1)' });
    an(content, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 380 });
    an(logo, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 400 });
    an(ring, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: 450, easing: 'cubic-bezier(.65,0,.35,1)' });
    an(tick, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 320, delay: 880, easing: 'ease-out' });
    an(hello, [{ opacity: 0 }, { opacity: 0.8 }], { duration: 300, delay: 700 });
    nameEl.querySelectorAll('.welcome-ch').forEach((c, i) => an(c, [{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 800 + i * 22 }));
    an(subEl, [{ opacity: 0 }, { opacity: 0.75 }], { duration: 300, delay: 1050 });
    later(() => close(), AUTO_CLOSE * SPEED);
  } catch {
    remove();
  }

  // ---- Tutup (menyusut ke ikon akun) ----
  function close() {
    if (closing || removed || !overlay) return;
    closing = true;
    try {
      anims.forEach((a) => a.finish());
      if (overlay.classList.contains('is-reduced')) {
        const a = an(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
        if (a) a.finished.then(remove, remove); else remove();
        return;
      }
      const t = avatarTarget();
      const w = window.innerWidth; const hgt = window.innerHeight;
      const rMax = Math.ceil(Math.max(Math.hypot(t.x, t.y), Math.hypot(w - t.x, t.y), Math.hypot(t.x, hgt - t.y), Math.hypot(w - t.x, hgt - t.y))) + 2;
      const content = overlay.querySelector('.welcome-content');
      const skip = overlay.querySelector('.welcome-skip');
      const layer = overlay.querySelector('.welcome-layer');
      overlay.classList.add('is-closing'); // klik tembus ke halaman di belakang
      an(content, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 260 });
      an(skip, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      const shrink = an(layer, [{ clipPath: `circle(${rMax}px at ${t.x}px ${t.y}px)` }, { clipPath: `circle(0px at ${t.x}px ${t.y}px)` }], { duration: 950, delay: 160, easing: 'cubic-bezier(.55,0,.25,1)' });
      if (t.el) {
        an(t.el, [
          { boxShadow: '0 0 0 0 rgba(239,132,34,.75)', transform: 'scale(1)' },
          { boxShadow: '0 0 0 6px rgba(239,132,34,.35)', transform: 'scale(1.12)', offset: 0.4 },
          { boxShadow: '0 0 0 12px rgba(239,132,34,0)', transform: 'scale(1)' },
        ], { duration: 700, delay: 1050, fill: 'none' });
      }
      if (shrink) shrink.finished.then(remove, remove); else remove();
    } catch {
      remove();
    }
  }

  return { close };
}
