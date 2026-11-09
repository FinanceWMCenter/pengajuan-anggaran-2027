// Detail program (PRD 5.5): info + tabel kebutuhan read-only + total. Dipakai divisi dan Finance.

import { h, icon, formatRupiah, formatNumber, formatDate, formatDateTime, monthName } from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { getYear } from '../store.js';
import { refresh, navigate } from '../router.js';
import { pageHead, statusBadge, dataTable, errorBlock, loadingBlock, flash } from '../ui/components.js';
import { deleteProgram } from './program-actions.js';

export async function programDetailView(main, ctx) {
  const id = ctx.params.id;
  const financeRoute = !ctx.params.code;
  main.append(loadingBlock());

  let p;
  let year;
  try {
    [p, year] = await Promise.all([rpc('rpc_get_program', { p_id: id }), getYear()]);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') {
      main.replaceChildren(flash('warning', ['Program tidak ditemukan. Mungkin sudah dihapus. ',
        h('a', { href: financeRoute ? '#/finance/programs' : `#/d/${ctx.params.code}` }, 'Kembali ke daftar'), '.']));
      return;
    }
    main.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const readOnly = ctx.readOnly;
  const backHref = financeRoute ? '#/finance/programs' : `#/d/${p.division_code}`;
  const base = `#/d/${p.division_code}`;

  const actions = [
    readOnly ? null : h('a', { class: 'wm-btn wm-btn-primary', href: `${base}/p/${p.id}/edit` }, icon('pencil'), 'Edit'),
    readOnly ? null : h('a', { class: 'wm-btn wm-btn-outline', href: `${base}/new?dari=${p.id}` }, icon('copy'), 'Duplikat'),
    h('button', {
      type: 'button', class: 'wm-btn wm-btn-outline', onclick: async () => {
        if (await deleteProgram(p)) navigate(backHref.slice(1), { force: true });
      },
    }, icon('trash'), 'Hapus'),
    h('a', { class: 'wm-btn wm-btn-outline', href: backHref }, icon('arrow-left'), 'Kembali'),
  ].filter(Boolean);

  const info = h('dl', { class: 'info-grid' },
    item('Divisi', p.division_name),
    item('Kategori program', p.program_category_name),
    item('Periode', monthName(p.periode_bulan, year)),
    item('PIC / Penanggung jawab', p.pic_nama),
    item('Tanggal pengajuan', p.tanggal_pengajuan ? `Diajukan pada ${formatDate(p.tanggal_pengajuan, true)}` : 'Belum diajukan (draft)'),
    item('Terakhir diubah', `${formatDateTime(p.updated_at)}${p.updated_by_name ? ` oleh ${p.updated_by_name}` : ''}`));

  const columns = [
    { label: 'No', render: (_, i) => String(i + 1) },
    { label: 'Uraian kebutuhan', cls: 'cell-start cell-name', render: (r) => r.uraian || h('span', { class: 'muted' }, '(belum diisi)') },
    { label: 'Kategori', render: (r) => r.item_category_name || h('span', { class: 'text-danger' }, 'Belum dipilih') },
    { label: 'Qty', cls: 'cell-num', render: (r) => (r.qty === null ? '-' : formatNumber(r.qty)) },
    { label: 'Satuan', render: (r) => r.satuan || '-' },
    { label: 'Harga satuan', cls: 'cell-num', render: (r) => formatRupiah(r.harga_satuan) },
    { label: 'Subtotal', cls: 'cell-num', render: (r) => formatRupiah(r.subtotal) },
    { label: 'Catatan', cls: 'cell-start', render: (r) => r.catatan || '' },
  ];

  main.replaceChildren(
    pageHead({ title: p.nama_program, subtitle: `${p.division_name} · ${monthName(p.periode_bulan, year)}`, actions, badge: statusBadge(p.status) }),
    p.status === 'draft' && !readOnly ? flash('info', 'Program ini masih draft dan belum dihitung di total. Klik Edit lalu Submit Pengajuan bila sudah lengkap.') : null,
    h('section', { class: 'wm-card' }, h('div', { class: 'card-head' }, h('h2', { class: 'wm-card-title' }, 'Info program')), info),
    h('section', { class: 'wm-card card-table' },
      h('div', { class: 'card-head' },
        h('div', null, h('h2', { class: 'wm-card-title' }, 'Daftar kebutuhan'), h('p', { class: 'wm-card-subtitle' }, `${p.items.length} baris`)),
        h('div', { class: 'num strong' }, `Total ${formatRupiah(p.total)}`)),
      dataTable({
        columns, rows: p.items, empty: 'Belum ada baris kebutuhan.', caption: 'Daftar kebutuhan',
        footer: [h('td', { colspan: 6, class: 'cell-start' }, 'TOTAL ANGGARAN PROGRAM'), h('td', { class: 'cell-num' }, formatRupiah(p.total)), h('td', null)],
      })),
  );
}

function item(label, value) {
  return h('div', null, h('dt', null, label), h('dd', null, value));
}
