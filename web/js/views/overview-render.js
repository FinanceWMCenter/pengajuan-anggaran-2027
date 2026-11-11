// Tampilan Overview bersama (divisi dan Finance): kartu ringkasan + tabel + batang sederhana (PRD 5.6, 5.7).

import { h, formatRupiah, formatPercent, monthName, plural } from '../utils.js';
import { brandPanel, statCard, dataTable, flash } from '../ui/components.js';

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

/**
 * @param {object} d hasil rpc_overview_division / rpc_f_overview
 * @param {object} o {year, finance:boolean, programHref:(row)=>string, drill?:object}
 *   drill (hanya Finance, D-42): kartu/baris menjadi bisa diklik dan membuka pop-up rincian.
 *   Tanpa drill (Overview divisi) tampilan dan perilakunya tidak berubah.
 */
export function renderOverview(d, { year, finance = false, programHref, drill = null }) {
  const blocks = [];
  const total = Number(d.total) || 0;

  if (d.draft_count > 0) {
    blocks.push(flash('info', `${plural(d.draft_count, 'draft')} belum dihitung. Hanya program berstatus Diajukan yang masuk ke angka di bawah.`));
  }

  // Kartu
  blocks.push(h('div', { class: 'stats' },
    brandPanel({ label: `Total anggaran ${year}`, value: total, note: `${formatRupiah(total)} · ${plural(d.program_count, 'program diajukan')}`, onClick: drill && d.program_count > 0 ? () => drill.all() : null }),
    statCard({ label: 'Jumlah program', value: String(d.program_count), note: 'berstatus Diajukan', iconName: 'layers', onClick: drill && d.program_count > 0 ? () => drill.all() : null }),
    statCard({ label: 'Rata-rata per program', value: formatRupiah(d.average), note: 'total dibagi jumlah program', iconName: 'coins', chip: 'is-secondary' }),
    statCard({
      label: 'Bulan terbesar', iconName: 'calendar', chip: 'is-orange', isText: true,
      value: d.top_month ? monthName(d.top_month.bulan, year) : '-',
      note: d.top_month ? `${formatRupiah(d.top_month.total)} · ${plural(d.top_month.count, 'program')}` : 'belum ada data',
      onClick: drill && d.top_month ? () => drill.month(d.top_month) : null,
    }),
    statCard({
      label: 'Kategori program terbesar', iconName: 'tag', isText: true,
      value: d.top_program_category ? d.top_program_category.name : '-',
      note: d.top_program_category ? `${formatRupiah(d.top_program_category.total)} · ${formatPercent(d.top_program_category.pct)}` : 'belum ada data',
      onClick: drill && d.top_program_category ? () => drill.programCategory(d.top_program_category) : null,
    }),
    statCard({
      label: 'Kategori kebutuhan terbesar', iconName: 'box', chip: 'is-secondary', isText: true,
      value: d.top_item_category ? d.top_item_category.name : '-',
      note: d.top_item_category ? `${formatRupiah(d.top_item_category.total)} · ${formatPercent(d.top_item_category.pct)}` : 'belum ada data',
      onClick: drill && d.top_item_category ? () => drill.itemCategory(d.top_item_category) : null,
    }),
    statCard({
      label: 'Program terbesar', iconName: 'trend-down', chip: 'is-orange', isText: true,
      value: d.top_program ? d.top_program.nama_program : '-',
      note: d.top_program ? `${formatRupiah(d.top_program.total)}${finance ? ` · ${d.top_program.division_name}` : ''}` : 'belum ada data',
      onClick: drill && d.top_program ? () => drill.program(d.top_program) : null,
    })));

  // Per bulan (sorot bulan terbesar)
  const topMonth = d.top_month ? d.top_month.bulan : null;
  blocks.push(card('Per bulan', `Januari-Desember ${year}${topMonth ? ` · bulan terbesar ${monthName(topMonth)}` : ''}`, dataTable({
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
    onRowClick: drill ? (r) => drill.month(r) : null,
    rowClickable: (r) => r.count > 0,
    footer: [h('td', { class: 'cell-start' }, 'TOTAL'), h('td', null, String(d.program_count)), h('td', { class: 'cell-num' }, formatRupiah(total)), h('td', { class: 'cell-num' }, total ? '100%' : '0%'), h('td', null)],
  })));

  const quarterNames = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Okt-Des)'];
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
    card('Per kuartal', null, dataTable({
      columns: [
        { label: 'Kuartal', cls: 'cell-start', render: (r) => quarterNames[r.kuartal - 1] },
        { label: 'Program', render: (r) => String(r.count) },
        { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
        { label: '%', cls: 'cell-num', render: (r) => formatPercent(r.pct) },
      ],
      rows: d.per_kuartal,
      onRowClick: drill ? (r) => drill.quarter(r, quarterNames[r.kuartal - 1]) : null,
      rowClickable: (r) => r.count > 0,
    })),
    card('Top program', `${d.top_programs.length} program dengan anggaran terbesar`, dataTable({
      columns: [
        { label: 'No', render: (_, i) => String(i + 1) },
        { label: 'Program', cls: 'cell-start', render: (r) => (drill ? r.nama_program : h('a', { href: programHref(r) }, r.nama_program)) },
        finance ? { label: 'Divisi', cls: 'cell-start', render: (r) => r.division_name } : null,
        { label: 'Bulan', render: (r) => monthName(r.periode_bulan) },
        { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
      ].filter(Boolean),
      rows: d.top_programs, empty: 'Belum ada program diajukan.',
      onRowClick: drill ? (r) => drill.program(r) : null,
    }))));

  blocks.push(h('div', { class: 'grid-2' },
    card('Per kategori program', 'Kategori besar program', catTable(d.per_kategori_program, 'Program', 'count', false, drill ? (r) => drill.programCategory(r) : null)),
    card('Per kategori kebutuhan', 'Kategori baris kebutuhan', catTable(d.per_kategori_baris, 'Baris', 'item_count', true, drill ? (r) => drill.itemCategory(r) : null))));

  return blocks;
}
