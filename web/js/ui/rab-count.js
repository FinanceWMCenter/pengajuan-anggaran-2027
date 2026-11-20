// Angka oranye di menu "RAB Gabungan" = jumlah saran otomatis yang menunggu (D-53, hanya Finance).
// Disimpan sebentar (60 detik) supaya tidak dihitung ulang di setiap pindah halaman; dibuang setelah aksi RAB Gabungan.

import { h } from '../utils.js';
import { rpc } from '../api.js';

let cache = null; // { at, n }

export function invalidateRabCount() {
  cache = null;
}

export function rabCountBadge() {
  const el = h('span', { class: 'wm-count', hidden: true });
  const show = (n) => {
    el.textContent = String(n);
    el.hidden = !n;
    el.title = `${n} saran RAB Gabungan menunggu ditinjau`;
    el.setAttribute('aria-label', el.title);
  };
  if (cache && Date.now() - cache.at < 60000) show(cache.n);
  else {
    rpc('rpc_f_rab_suggest_count')
      .then((n) => { cache = { at: Date.now(), n: Number(n) || 0 }; show(cache.n); })
      .catch(() => { /* angka saja; gagal = tidak ditampilkan */ });
  }
  return el;
}
