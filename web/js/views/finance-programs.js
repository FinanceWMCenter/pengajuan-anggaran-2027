// Semua Program (F-04): tabel lintas divisi + filter + hapus dengan alasan wajib.

import { h, formatRupiah, formatDate, monthName, MONTHS, normalize } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { refresh } from '../router.js';
import { pageHead, statusBadge, dataTable, errorBlock, loadingBlock, emptyState } from '../ui/components.js';
import { deleteProgram } from './program-actions.js';

const FILTER_KEY = 'wm-anggaran-filter-finance';

export async function financeProgramsView(main) {
  main.append(pageHead({ title: 'Semua Program', subtitle: 'Seluruh program dari semua divisi. Finance dapat menghapus dengan alasan wajib.' }));
  const body = h('div', { class: 'stack' }, loadingBlock());
  main.append(body);

  let programs;
  try {
    programs = await rpc('rpc_f_list_programs');
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }
  if (programs.length === 0) {
    body.replaceChildren(h('div', { class: 'wm-card' }, emptyState({ title: 'Belum ada program', text: 'Belum ada divisi yang mengisi program.' })));
    return;
  }

  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}'); } catch { saved = {}; }
  const uniq = (key, label) => [...new Map(programs.map((p) => [p[key], p[label]])).entries()];
  const sel = (aria, all, options, value) => {
    const s = h('select', { class: 'wm-select', 'aria-label': aria }, h('option', { value: '' }, all), options.map(([v, l]) => h('option', { value: String(v) }, l)));
    s.value = value || '';
    return s;
  };
  const fSearch = h('input', { class: 'wm-input', type: 'search', placeholder: 'Cari nama program atau PIC…', 'aria-label': 'Cari program', value: saved.q || '' });
  const fDiv = sel('Filter divisi', 'Semua divisi', uniq('division_code', 'division_name'), saved.d);
  const fMonth = sel('Filter bulan', 'Semua bulan', MONTHS.map((m, i) => [i + 1, m]), saved.m);
  const fCat = sel('Filter kategori', 'Semua kategori', uniq('program_category_id', 'program_category_name'), saved.c);
  const fStatus = sel('Filter status', 'Semua status', [['diajukan', 'Diajukan'], ['draft', 'Draft']], saved.s);
  const countNote = h('span', null);
  const reset = h('button', { type: 'button', class: 'wm-btn-text', onclick: () => { [fSearch, fDiv, fMonth, fCat, fStatus].forEach((x) => { x.value = ''; }); draw(); } }, 'Reset filter');
  const holder = h('div', null);
  body.replaceChildren(h('div', { class: 'stack-sm' }, h('div', { class: 'filter-bar' }, fSearch, fDiv, fMonth, fCat, fStatus), h('div', { class: 'filter-foot' }, countNote, reset)), holder);
  [fSearch, fDiv, fMonth, fCat, fStatus].forEach((x) => x.addEventListener('input', draw));

  function draw() {
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify({ q: fSearch.value, d: fDiv.value, m: fMonth.value, c: fCat.value, s: fStatus.value })); } catch { /* abaikan */ }
    const q = normalize(fSearch.value);
    const rows = programs.filter((p) => (!q || normalize(p.nama_program).includes(q) || normalize(p.pic_nama).includes(q))
      && (!fDiv.value || p.division_code === fDiv.value)
      && (!fMonth.value || String(p.periode_bulan) === fMonth.value)
      && (!fCat.value || String(p.program_category_id) === fCat.value)
      && (!fStatus.value || p.status === fStatus.value));
    const totalDiajukan = rows.filter((p) => p.status === 'diajukan').reduce((s, p) => s + Number(p.total), 0);
    const draftRows = rows.filter((p) => p.status === 'draft');
    const totalDraft = draftRows.reduce((s, p) => s + Number(p.total), 0);
    const onlyDraft = fStatus.value === 'draft';
    countNote.textContent = `Menampilkan ${rows.length} dari ${programs.length} program`;
    holder.replaceChildren(rows.length ? dataTable({
      caption: 'Semua program',
      columns: [
        { label: 'Divisi', cls: 'cell-start', render: (p) => p.division_name },
        { label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => h('a', { href: `#/finance/p/${p.id}` }, p.nama_program) },
        { label: 'Kategori', render: (p) => p.program_category_name },
        { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
        { label: 'PIC', cls: 'cell-start', render: (p) => p.pic_nama },
        { label: 'Total (Rp)', cls: 'cell-num', render: (p) => formatRupiah(p.total) },
        { label: 'Status', render: (p) => statusBadge(p.status) },
        { label: 'Tgl Pengajuan', cls: 'nowrap', render: (p) => formatDate(p.tanggal_pengajuan) },
        {
          label: 'Aksi', cls: 'cell-actions', render: (p) => [
            h('a', { class: 'wm-btn-text', href: `#/finance/p/${p.id}` }, 'Lihat'),
            h('button', { type: 'button', class: 'wm-btn-text is-danger', onclick: async () => { if (await deleteProgram(p)) refresh(); } }, 'Hapus'),
          ],
        },
      ],
      rows,
      footer: [
        h('td', { colspan: 5, class: 'cell-start' }, onlyDraft ? 'TOTAL DRAFT (belum dihitung)' : 'TOTAL DIAJUKAN (sesuai filter)'),
        h('td', { class: 'cell-num' }, formatRupiah(onlyDraft ? totalDraft : totalDiajukan)),
        h('td', { colspan: 3, class: 'cell-start xsmall' }, !onlyDraft && draftRows.length ? `+ ${draftRows.length} draft ${formatRupiah(totalDraft)} (belum dihitung)` : ''),
      ],
    }) : h('div', { class: 'wm-card' }, emptyState({ title: 'Tidak ada program yang cocok', text: 'Ubah atau reset filter.', iconName: 'search' })));
  }
  draw();
}
