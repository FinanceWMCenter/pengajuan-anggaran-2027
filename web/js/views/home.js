// Home: pilih divisi (dikelompokkan per grup). Tidak menampilkan angka apa pun (A-01).

import { h, icon, normalize } from '../utils.js';
import { getDivisions } from '../store.js';
import { errorMessage } from '../api.js';
import { errorBlock, emptyState, loadingBlock } from '../ui/components.js';
import { refresh } from '../router.js';

export async function homeView(main) {
  main.append(
    h('div', { class: 'brand-head' },
      h('img', { src: 'assets/logo-navy.png', alt: 'WM Center', width: 962, height: 646, class: 'logo-auto' }),
      h('h1', null, 'Pengajuan Anggaran 2027'),
      h('p', null, 'Pilih divisi Anda untuk mengisi program dan anggaran.')),
  );

  const search = h('input', {
    class: 'wm-input', type: 'search', placeholder: 'Cari divisi…', 'aria-label': 'Cari divisi', autocomplete: 'off',
  });
  const list = h('div', { class: 'division-list' }, loadingBlock('Memuat daftar divisi…'));
  main.append(h('div', { class: 'home-search' }, icon('search'), search), list);
  main.append(h('p', { class: 'home-finance-link' }, h('a', { href: '#/finance' }, icon('lock', 'ic-sm'), ' Masuk sebagai Finance')));

  let groups;
  try {
    groups = await getDivisions();
  } catch (e) {
    list.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const card = (d) => h('a', { class: 'division-card', href: `#/d/${d.code}` },
    icon('building'), h('span', null, d.name), icon('chevron-right', 'ic chev'));

  function draw() {
    const q = normalize(search.value);
    const blocks = [];
    let singles = []; // grup berisi 1 divisi: tampil tanpa sub-judul, digabung dalam satu baris kartu
    const flushSingles = () => {
      if (singles.length) blocks.push(h('section', { class: 'group-block', 'aria-label': 'Divisi lainnya' }, h('div', { class: 'division-grid' }, singles.map(card))));
      singles = [];
    };
    for (const g of groups) {
      const all = g.divisions || [];
      const divs = all.filter((d) => !q || normalize(d.name).includes(q) || normalize(g.name).includes(q));
      if (divs.length === 0) continue;
      if (all.length === 1) { singles.push(divs[0]); continue; }
      flushSingles();
      blocks.push(h('section', { class: 'group-block', 'aria-label': g.name },
        h('h2', { class: 'group-title' }, g.name),
        h('div', { class: 'division-grid' }, divs.map(card))));
    }
    flushSingles();
    list.replaceChildren(...(blocks.length ? blocks : [emptyState({ title: 'Divisi tidak ditemukan', text: 'Coba kata kunci lain.', iconName: 'search' })]));
  }
  search.addEventListener('input', draw);
  draw();
}
