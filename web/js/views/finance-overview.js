// Dashboard Finance (D-48, dulu "Overview Finance" F-03): ringkasan seluruh perusahaan + grafik + per grup + per divisi × bulan.
// Angka dari rpc_f_overview; peta Divisi × Bulan dari rpc_f_overview_detail (data yang sama dengan pop-up rincian),
// dicocokkan dengan total per divisi & per bulan dari database. Bila berbeda (data baru berubah) tampil peringatan + muat ulang.

import { h, icon, formatRupiah, formatPercent } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { getYear } from '../store.js';
import { refresh } from '../router.js';
import { pageHead, errorBlock, skeletonStats, dataTable, flash, loadingBlock } from '../ui/components.js';
import { chartSection, groupPie, divisionHeatmap } from '../ui/charts.js';
import { renderOverview } from './overview-render.js';
import { createOverviewDrill } from './finance-overview-detail.js';

export async function financeOverviewView(main) {
  main.append(pageHead({
    title: 'Dashboard',
    subtitle: 'Seluruh pengajuan anggaran 2027 dari semua divisi. Klik kartu, grafik, atau baris untuk melihat rinciannya.',
    actions: [
      h('a', { class: 'wm-btn wm-btn-outline', href: '#/finance/programs' }, icon('list'), 'Semua Program'),
      h('a', { class: 'wm-btn wm-btn-outline', href: '#/finance/export' }, icon('download'), 'Export Excel'),
    ],
  }));
  const body = h('div', { class: 'stack' }, skeletonStats(4));
  main.append(body);

  let d;
  let year;
  try {
    [d, year] = await Promise.all([rpc('rpc_f_overview'), getYear()]);
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const total = Number(d.total) || 0;
  const drill = createOverviewDrill({ year, perDivisi: d.per_divisi, totals: { total, count: d.program_count } });
  const pctBar = (pct) => {
    const el = h('div', { class: 'table-bar', role: 'img', 'aria-label': formatPercent(pct) });
    el.style.setProperty('width', `${Math.max(0, Math.min(100, Number(pct) || 0))}%`);
    return el;
  };
  const divisionsOf = (groupName) => d.per_divisi.filter((x) => x.group_name === groupName).length;

  // Per grup: pie + tabel
  const groupSection = chartSection({
    title: 'Per grup',
    subtitle: 'Rollup divisi per grup · klik irisan atau nama grup untuk rincian',
    chart: groupPie({ groups: d.per_grup, divisionsOf, total, onPick: (r) => drill.group(r) }),
    table: dataTable({
      columns: [
        { label: 'Grup', cls: 'cell-start', render: (r) => r.name },
        { label: 'Divisi', render: (r) => String(r.division_count) },
        { label: 'Program', render: (r) => String(r.count) },
        { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
        { label: '%', cls: 'cell-num', render: (r) => formatPercent(r.pct) },
      ],
      rows: d.per_grup,
      onRowClick: (r) => drill.group(r),
      rowClickable: (r) => r.count > 0,
    }),
  });

  // Per divisi × bulan: peta warna (memuat rincian) + tabel Per divisi
  const heatHolder = h('div', null, loadingBlock('Memuat peta divisi per bulan…'));
  const sortHolder = h('div', { class: 'chart-sort' });
  const divisionSection = chartSection({
    title: 'Per divisi × bulan',
    subtitle: 'Makin gelap makin besar · kolom Total = peringkat divisi · klik kotak untuk rincian',
    chart: heatHolder,
    tools: [sortHolder],
    table: dataTable({
      onRowClick: (r) => drill.division(r),
      columns: [
        { label: 'Divisi', cls: 'cell-start', render: (r) => r.name },
        { label: 'Grup', cls: 'cell-start', render: (r) => r.group_name },
        { label: 'Program', render: (r) => String(r.count) },
        { label: 'Draft', render: (r) => String(r.draft_count) },
        { label: 'Total', cls: 'cell-num', render: (r) => formatRupiah(r.total) },
        { label: '%', cls: 'cell-num', render: (r) => formatPercent(r.pct) },
        { label: 'Porsi', cls: 'cell-bar', render: (r) => pctBar(r.pct) },
      ],
      rows: d.per_divisi,
      footer: [h('td', { colspan: 2, class: 'cell-start' }, 'TOTAL'), h('td', null, String(d.program_count)), h('td', null, String(d.draft_count)),
        h('td', { class: 'cell-num' }, formatRupiah(total)), h('td', { class: 'cell-num' }, total ? '100%' : '0%'), h('td', null)],
    }),
  });

  body.replaceChildren(...renderOverview(d, { year, finance: true, drill, extra: [groupSection, divisionSection] }));

  const loadHeat = async () => {
    heatHolder.replaceChildren(loadingBlock('Memuat peta divisi per bulan…'));
    let detail;
    try {
      detail = await drill.data();
    } catch (e) {
      heatHolder.replaceChildren(errorBlock(errorMessage(e), loadHeat));
      return;
    }
    const cells = new Map(); const counts = new Map();
    for (const p of detail.programs) {
      if (!cells.has(p.division_code)) { cells.set(p.division_code, Array(12).fill(0)); counts.set(p.division_code, Array(12).fill(0)); }
      cells.get(p.division_code)[p.periode_bulan - 1] += Number(p.total) || 0;
      counts.get(p.division_code)[p.periode_bulan - 1] += 1;
    }
    // Cocokkan dengan angka database: total per divisi dan per bulan harus sama persis
    const monthly = d.per_bulan.map((r) => Number(r.total) || 0);
    const rowsOk = d.per_divisi.every((x) => (cells.get(x.code) || []).reduce((a, v) => a + v, 0) === (Number(x.total) || 0));
    const colsOk = monthly.every((v, i) => [...cells.values()].reduce((a, row) => a + row[i], 0) === v);
    const heat = divisionHeatmap({
      divisions: d.per_divisi, cells, counts, monthly, total,
      onCell: (r, m, expected) => drill.divisionMonth(r, m, expected),
      onDivision: (r) => drill.division(r),
    });
    sortHolder.replaceChildren(heat.sortControl);
    heatHolder.replaceChildren(
      rowsOk && colsOk ? '' : flash('warning', [
        'Angka di peta berbeda dengan Dashboard karena data baru saja berubah. Muat ulang untuk melihat angka terbaru.',
        h('div', { class: 'flash-actions' }, h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => refresh() }, icon('refresh'), 'Muat ulang')),
      ]),
      heat.el,
    );
  };
  if (d.program_count > 0) loadHeat();
  else heatHolder.replaceChildren(h('p', { class: 'chart-empty' }, 'Belum ada program Diajukan.'));
}
