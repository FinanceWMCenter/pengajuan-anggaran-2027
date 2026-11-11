// Overview Finance (F-03, PRD 5.7): versi seluruh perusahaan + per divisi, per grup, status pengisian, top 10.

import { h, icon, formatRupiah, formatPercent, plural } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { getYear } from '../store.js';
import { refresh } from '../router.js';
import { pageHead, errorBlock, skeletonStats, dataTable, flash } from '../ui/components.js';
import { renderOverview } from './overview-render.js';
import { createOverviewDrill } from './finance-overview-detail.js';

export async function financeOverviewView(main) {
  main.append(pageHead({
    title: 'Overview Finance',
    subtitle: 'Seluruh pengajuan anggaran 2027 dari semua divisi. Klik kartu atau baris untuk melihat rinciannya.',
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

  const filled = d.division_count - d.belum_mengisi.length;
  const total = Number(d.total) || 0;
  const drill = createOverviewDrill({ year, perDivisi: d.per_divisi, totals: { total, count: d.program_count } });
  const pctBar = (pct) => {
    const el = h('div', { class: 'table-bar', role: 'img', 'aria-label': formatPercent(pct) });
    el.style.setProperty('width', `${Math.max(0, Math.min(100, Number(pct) || 0))}%`);
    return el;
  };

  const statusCard = h('section', { class: 'wm-card' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('h2', { class: 'wm-card-title' }, 'Status pengisian'),
        h('p', { class: 'wm-card-subtitle' }, `${filled} dari ${d.division_count} divisi sudah punya pengajuan Diajukan`))),
    d.belum_mengisi.length
      ? h('ul', { class: 'm-0' }, d.belum_mengisi.map((x) => h('li', { class: 'small' },
        h('a', { href: `#/d/${x.code}` }, x.name), ' ',
        h('span', { class: 'wm-badge is-warning' }, 'Belum mengisi'),
        x.draft_count ? h('span', { class: 'muted xsmall' }, ` · ${plural(x.draft_count, 'draft')}`) : null)))
      : flash('success', 'Semua divisi sudah mengisi minimal satu pengajuan.'));

  body.replaceChildren(
    ...renderOverview(d, { year, finance: true, programHref: (r) => `#/finance/p/${r.id}`, drill }),
    h('div', { class: 'grid-2' },
      h('section', { class: 'wm-card card-table' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, 'Per grup'), h('p', { class: 'wm-card-subtitle' }, 'Rollup divisi per grup (mis. Human Resource = 5 divisi)'))),
        dataTable({
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
        })),
      statusCard),
    h('section', { class: 'wm-card card-table' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, 'Per divisi'), h('p', { class: 'wm-card-subtitle' }, 'Klik baris untuk melihat program divisi tersebut'))),
      dataTable({
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
      })),
  );
}
