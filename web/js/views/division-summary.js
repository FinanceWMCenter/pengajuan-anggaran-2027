// Ringkasan Program divisi: kartu ringkas, filter, tabel program + total (PRD 5.3).

import { h, icon, formatRupiah, formatDate, monthName, MONTHS, normalize, plural } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { getMaster } from '../store.js';
import { refresh } from '../router.js';
import {
  pageHead, brandPanel, statCard, statusBadge, emptyState, dataTable, errorBlock, skeletonStats,
} from '../ui/components.js';
import { deleteProgram } from './program-actions.js';

const FILTER_KEY = 'wm-anggaran-filter-ringkasan';

export async function divisionSummaryView(main, ctx) {
  const code = ctx.params.code;
  const readOnly = ctx.readOnly;
  const base = `#/d/${code}`;

  main.append(pageHead({
    title: ctx.division.name,
    subtitle: readOnly ? 'Ringkasan program (dilihat oleh Finance)' : 'Ringkasan program dan anggaran 2027 divisi Anda',
    actions: readOnly ? [] : [h('a', { class: 'wm-btn wm-btn-primary', href: `${base}/new` }, icon('plus'), 'Tambah Program')],
  }));
  const body = h('div', { class: 'stack' }, skeletonStats(3));
  main.append(body);

  let data;
  let master;
  try {
    [data, master] = await Promise.all([rpc('rpc_list_programs', { p_division_code: code }), getMaster()]);
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const s = data.summary;
  const stats = h('div', { class: 'stats' },
    brandPanel({ label: 'Total anggaran diajukan', value: s.total_diajukan, note: `${formatRupiah(s.total_diajukan)} · ${plural(s.count_diajukan, 'program')}` }),
    statCard({ label: 'Program diajukan', value: String(s.count_diajukan), note: 'dihitung di total', iconName: 'send', chip: 'is-secondary' }),
    statCard({ label: 'Draft', value: String(s.count_draft), note: s.count_draft ? 'belum diajukan, tidak dihitung di total' : 'tidak ada draft', iconName: 'clipboard', chip: 'is-orange' }));

  if (data.programs.length === 0) {
    body.replaceChildren(stats, h('div', { class: 'wm-card' }, emptyState({
      title: 'Belum ada program',
      text: readOnly ? 'Divisi ini belum mengisi program.' : 'Belum ada program. Klik + Tambah Program untuk mulai.',
      action: readOnly ? null : h('a', { class: 'wm-btn wm-btn-primary', href: `${base}/new` }, icon('plus'), 'Tambah Program'),
    })));
    return;
  }

  // ---- Filter (diingat selama tab terbuka) ----
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(`${FILTER_KEY}:${code}`) || '{}'); } catch { saved = {}; }
  const fSearch = h('input', { class: 'wm-input', type: 'search', placeholder: 'Cari nama program atau PIC…', 'aria-label': 'Cari nama program', value: saved.q || '' });
  const fMonth = h('select', { class: 'wm-select', 'aria-label': 'Filter bulan' },
    h('option', { value: '' }, 'Semua bulan'), MONTHS.map((m, i) => h('option', { value: String(i + 1) }, m)));
  const usedCats = [...new Map(data.programs.map((p) => [p.program_category_id, p.program_category_name])).entries()];
  const fCat = h('select', { class: 'wm-select', 'aria-label': 'Filter kategori program' },
    h('option', { value: '' }, 'Semua kategori'), usedCats.map(([id, name]) => h('option', { value: String(id) }, name)));
  const fStatus = h('select', { class: 'wm-select', 'aria-label': 'Filter status' },
    h('option', { value: '' }, 'Semua status'), h('option', { value: 'diajukan' }, 'Diajukan'), h('option', { value: 'draft' }, 'Draft'));
  fMonth.value = saved.m || '';
  fCat.value = saved.c || '';
  fStatus.value = saved.s || '';
  const resetBtn = h('button', { type: 'button', class: 'wm-btn-text', onclick: () => { fSearch.value = ''; fMonth.value = ''; fCat.value = ''; fStatus.value = ''; draw(); } }, 'Reset filter');
  const countNote = h('span', null);
  const filterBar = h('div', { class: 'filter-bar' }, fSearch, fMonth, fCat, fStatus);
  const tableHolder = h('div', null);

  body.replaceChildren(stats, h('div', { class: 'stack-sm' }, filterBar, h('div', { class: 'filter-foot' }, countNote, resetBtn)), tableHolder);
  [fSearch, fMonth, fCat, fStatus].forEach((el) => el.addEventListener('input', draw));

  function draw() {
    const q = normalize(fSearch.value);
    try {
      sessionStorage.setItem(`${FILTER_KEY}:${code}`, JSON.stringify({ q: fSearch.value, m: fMonth.value, c: fCat.value, s: fStatus.value }));
    } catch { /* abaikan */ }
    const rows = data.programs.filter((p) => (!q || normalize(p.nama_program).includes(q) || normalize(p.pic_nama).includes(q))
      && (!fMonth.value || String(p.periode_bulan) === fMonth.value)
      && (!fCat.value || String(p.program_category_id) === fCat.value)
      && (!fStatus.value || p.status === fStatus.value));
    const totalDiajukan = rows.filter((p) => p.status === 'diajukan').reduce((sum, p) => sum + Number(p.total), 0);
    const draftRows = rows.filter((p) => p.status === 'draft');
    const totalDraft = draftRows.reduce((sum, p) => sum + Number(p.total), 0);
    countNote.textContent = `Menampilkan ${rows.length} dari ${data.programs.length} program`;

    const columns = [
      { label: 'No', render: (_, i) => String(i + 1) },
      { label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => h('a', { href: `${base}/p/${p.id}` }, p.nama_program) },
      { label: 'Kategori', render: (p) => p.program_category_name },
      { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
      { label: 'PIC', cls: 'cell-start', render: (p) => p.pic_nama },
      { label: 'Total (Rp)', cls: 'cell-num', render: (p) => formatRupiah(p.total) },
      { label: 'Status', render: (p) => statusBadge(p.status) },
      { label: 'Tgl Pengajuan', cls: 'nowrap', render: (p) => formatDate(p.tanggal_pengajuan) },
      {
        label: 'Aksi', cls: 'cell-actions', render: (p) => [
          h('a', { class: 'wm-btn-text', href: `${base}/p/${p.id}` }, 'Lihat'),
          readOnly ? null : h('a', { class: 'wm-btn-text', href: `${base}/p/${p.id}/edit` }, 'Edit'),
          readOnly ? null : h('a', { class: 'wm-btn-text', href: `${base}/new?dari=${p.id}` }, 'Duplikat'),
          h('button', { type: 'button', class: 'wm-btn-text is-danger', onclick: async () => { if (await deleteProgram(p)) refresh(); } }, 'Hapus'),
        ],
      },
    ];
    // Baris total = hanya Diajukan (sama dengan kartu & Overview). Draft disebut terpisah.
    const onlyDraft = fStatus.value === 'draft';
    const footer = [
      h('td', { colspan: 5, class: 'cell-start' }, onlyDraft ? 'TOTAL DRAFT (belum dihitung)' : 'TOTAL DIAJUKAN'),
      h('td', { class: 'cell-num' }, formatRupiah(onlyDraft ? totalDraft : totalDiajukan)),
      h('td', { colspan: 3, class: 'cell-start xsmall' },
        !onlyDraft && draftRows.length ? `+ ${draftRows.length} draft ${formatRupiah(totalDraft)} (belum dihitung)` : ''),
    ];
    tableHolder.replaceChildren(rows.length
      ? dataTable({ columns, rows, footer, caption: `Daftar program ${ctx.division.name}` })
      : h('div', { class: 'wm-card' }, emptyState({ title: 'Tidak ada program yang cocok', text: 'Ubah atau reset filter untuk melihat program lain.', iconName: 'search' })));
  }
  draw();
}
