// Tampilan Dashboard bersama (divisi dan Finance), D-48: kartu ringkasan, Ringkasan (akumulasi), Per bulan
// (grafik + tabel), bagian khusus Finance (extra), kategori program & kebutuhan (tabel), Top program.
// Semua angka dari database (rpc_overview_division / rpc_f_overview); klik membuka pop-up rincian (drill, D-42/D-45).

import { h, formatRupiah, formatPercent, monthName, plural } from '../utils.js';
import { brandPanel, statCard, dataTable, flash } from '../ui/components.js';
import { chartSection, cumulativeChart, monthlyChart } from '../ui/charts.js';

function bar(pct, alt = false) {
  const el = h('div', { class: `table-bar${alt ? ' is-2' : ''}`, role: 'img', 'aria-label': formatPercent(pct) });
  el.style.setProperty('width', `${Math.max(0, Math.min(100, Number(pct) || 0))}%`);
  return el;
}

function card(title, subtitle, table) {
  return h('section', { class: 'wm-card card-table' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, title), subtitle ? h('p', { class: 'wm-card-subtitle' }, subtitle) : null)),
    table);
}

export const QUARTER_NAMES = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Okt-Des)'];

/**
 * @param {object} d hasil rpc_overview_division / rpc_f_overview
 * @param {object} o {year, finance:boolean, drill:object, extra?:Node[]}
 *   extra = bagian khusus Finance (Per grup, Per divisi × bulan), disisipkan setelah Per bulan.
 */
export function renderOverview(d, { year, finance = false, drill, extra = [] }) {
  const blocks = [];
  const total = Number(d.total) || 0;

  if (d.draft_count > 0) {
    blocks.push(flash('info', `${plural(d.draft_count, 'draft')} belum dihitung. Hanya program berstatus Diajukan yang masuk ke angka di bawah.`));
  }

  // Kartu ringkasan (tetap seperti sebelumnya, bisa diklik)
  blocks.push(h('div', { class: 'stats' },
    brandPanel({ label: `Total anggaran ${year}`, value: total, note: `${formatRupiah(total)} · ${plural(d.program_count, 'program diajukan')}`, onClick: d.program_count > 0 ? () => drill.all() : null }),
    statCard({ label: 'Jumlah program', value: String(d.program_count), note: 'berstatus Diajukan', iconName: 'layers', onClick: d.program_count > 0 ? () => drill.all() : null }),
    statCard({ label: 'Rata-rata per program', value: formatRupiah(d.average), note: 'total dibagi jumlah program', iconName: 'coins', chip: 'is-secondary' }),
    statCard({
      label: 'Bulan terbesar', iconName: 'calendar', chip: 'is-orange', isText: true,
      value: d.top_month ? monthName(d.top_month.bulan, year) : '-',
      note: d.top_month ? `${formatRupiah(d.top_month.total)} · ${plural(d.top_month.count, 'program')}` : 'belum ada data',
      onClick: d.top_month ? () => drill.month(d.top_month) : null,
    }),
    statCard({
      label: 'Kategori program terbesar', iconName: 'tag', isText: true,
      value: d.top_program_category ? d.top_program_category.name : '-',
      note: d.top_program_category ? `${formatRupiah(d.top_program_category.total)} · ${formatPercent(d.top_program_category.pct)}` : 'belum ada data',
      onClick: d.top_program_category ? () => drill.programCategory(d.top_program_category) : null,
    }),
    statCard({
      label: 'Kategori kebutuhan terbesar', iconName: 'box', chip: 'is-secondary', isText: true,
      value: d.top_item_category ? d.top_item_category.name : '-',
      note: d.top_item_category ? `${formatRupiah(d.top_item_category.total)} · ${formatPercent(d.top_item_category.pct)}` : 'belum ada data',
      onClick: d.top_item_category ? () => drill.itemCategory(d.top_item_category) : null,
    }),
    statCard({
      label: 'Program terbesar', iconName: 'trend-down', chip: 'is-orange', isText: true,
      value: d.top_program ? d.top_program.nama_program : '-',
      note: d.top_program ? `${formatRupiah(d.top_program.total)}${finance ? ` · ${d.top_program.division_name}` : ''}` : 'belum ada data',
      onClick: d.top_program ? () => drill.program(d.top_program) : null,
    })));

  const monthly = d.per_bulan.map((r) => Number(r.total) || 0);
  const counts = d.per_bulan.map((r) => Number(r.count) || 0);

  // Ringkasan: akumulasi sepanjang tahun (jumlah berjalan dari total per bulan database)
  let cum = 0; let cumCount = 0;
  const cumRows = d.per_bulan.map((r) => { cum += Number(r.total) || 0; cumCount += Number(r.count) || 0; return { ...r, cum, cumCount }; });
  blocks.push(chartSection({
    title: `Ringkasan anggaran ${year}`,
    subtitle: 'Akumulasi sepanjang tahun · klik titik untuk rincian program',
    chart: cumulativeChart({ monthly, counts, total, count: d.program_count, year, onPick: (m, expected) => drill.upToMonth(m, expected) }),
    table: dataTable({
      caption: 'Akumulasi anggaran per bulan',
      columns: [
        { label: 'Bulan', cls: 'cell-start', render: (r) => monthName(r.bulan) },
        { label: 'Anggaran bulan ini', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
        { label: 'Akumulasi', cls: 'cell-num', render: (r) => formatRupiah(r.cum) },
        { label: '% dari total', cls: 'cell-num', render: (r) => formatPercent(total ? Math.round((r.cum * 1000) / total) / 10 : 0) },
      ],
      rows: cumRows,
      onRowClick: (r) => drill.upToMonth(r.bulan, { total: r.cum, count: r.cumCount }),
      rowClickable: (r) => r.cumCount > 0,
      footer: [h('td', { class: 'cell-start' }, 'TOTAL'), h('td', { class: 'cell-num' }, formatRupiah(total)), h('td', { class: 'cell-num' }, formatRupiah(total)), h('td', { class: 'cell-num' }, total ? '100%' : '0%')],
    }),
  }));

  // Per bulan: batang + garis % (grafik) atau tabel
  const topMonth = d.top_month ? d.top_month.bulan : null;
  blocks.push(chartSection({
    title: 'Per bulan',
    subtitle: 'Klik batang untuk rincian bulan · pilih Q1–Q4 untuk menyalakan kuartal, klik lagi untuk rinciannya',
    chart: monthlyChart({
      rows: d.per_bulan, total, count: d.program_count, year,
      onMonth: (r) => drill.month(r),
      onQuarter: (q) => drill.quarter(d.per_kuartal[q], QUARTER_NAMES[q]),
    }),
    table: dataTable({
      caption: 'Anggaran per bulan',
      columns: [
        { label: 'Bulan', cls: 'cell-start', render: (r) => [monthName(r.bulan), r.bulan === topMonth ? [' ', h('span', { class: 'wm-badge is-warning' }, 'Terbesar')] : null] },
        { label: 'Program', render: (r) => String(r.count) },
        { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
        { label: '%', cls: 'cell-num', render: (r) => formatPercent(r.pct) },
        { label: 'Porsi', cls: 'cell-bar', render: (r) => bar(r.pct) },
      ],
      rows: d.per_bulan,
      rowClass: (r) => (r.bulan === topMonth ? 'is-highlight' : null),
      onRowClick: (r) => drill.month(r),
      rowClickable: (r) => r.count > 0,
      footer: [h('td', { class: 'cell-start' }, 'TOTAL'), h('td', null, String(d.program_count)), h('td', { class: 'cell-num' }, formatRupiah(total)), h('td', { class: 'cell-num' }, total ? '100%' : '0%'), h('td', null)],
    }),
  }));

  blocks.push(...extra);

  const catTable = (rows, countLabel, countKey, alt, onRowClick) => dataTable({
    columns: [
      { label: 'Kategori', cls: 'cell-start', render: (r) => r.name },
      { label: countLabel, render: (r) => String(r[countKey]) },
      { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
      { label: '%', cls: 'cell-num', render: (r) => formatPercent(r.pct) },
      { label: 'Porsi', cls: 'cell-bar', render: (r) => bar(r.pct, alt) },
    ],
    rows, empty: 'Belum ada program diajukan.', onRowClick,
  });
  blocks.push(h('div', { class: 'grid-2' },
    card('Per kategori program', 'Kategori besar program · klik baris untuk rincian', catTable(d.per_kategori_program, 'Program', 'count', false, (r) => drill.programCategory(r))),
    card('Per kategori kebutuhan', 'Kategori baris kebutuhan · klik baris untuk rincian', catTable(d.per_kategori_baris, 'Baris', 'item_count', true, (r) => drill.itemCategory(r)))));

  blocks.push(card('Top program', `${d.top_programs.length} program dengan anggaran terbesar · klik baris untuk rincian`, dataTable({
    columns: [
      { label: 'No', render: (_, i) => String(i + 1) },
      { label: 'Program', cls: 'cell-start', render: (r) => r.nama_program },
      finance ? { label: 'Divisi', cls: 'cell-start', render: (r) => r.division_name } : null,
      { label: 'Bulan', render: (r) => monthName(r.periode_bulan) },
      { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
    ].filter(Boolean),
    rows: d.top_programs, empty: 'Belum ada program diajukan.',
    onRowClick: (r) => drill.program(r),
  })));

  return blocks;
}
