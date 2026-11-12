// Overview divisi (U-07): hanya data divisi sendiri, hanya program Diajukan. Pop-up rincian: D-45.

import { h, icon } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { getYear } from '../store.js';
import { refresh } from '../router.js';
import { pageHead, errorBlock, skeletonStats, emptyState } from '../ui/components.js';
import { renderOverview } from './overview-render.js';
import { createOverviewDrill } from './finance-overview-detail.js';

export async function divisionOverviewView(main, ctx) {
  const code = ctx.params.code;
  main.append(pageHead({ title: `Overview ${ctx.division.name}`, subtitle: 'Ringkasan anggaran yang sudah diajukan divisi ini. Klik kartu atau baris untuk melihat rinciannya.' }));
  const body = h('div', { class: 'stack' }, skeletonStats(4));
  main.append(body);

  let d;
  let year;
  try {
    [d, year] = await Promise.all([rpc('rpc_overview_division', { p_division_code: code }), getYear()]);
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  if (d.program_count === 0 && d.draft_count === 0) {
    body.replaceChildren(h('div', { class: 'wm-card' }, emptyState({
      title: 'Belum ada data untuk Overview',
      text: ctx.readOnly ? 'Divisi ini belum mengisi program.' : 'Tambahkan program lalu Submit Pengajuan. Overview hanya menghitung program yang sudah diajukan.',
      action: ctx.readOnly ? null : h('a', { class: 'wm-btn wm-btn-primary', href: `#/d/${code}/new` }, icon('plus'), 'Tambah Program'),
      iconName: 'overview',
    })));
    return;
  }
  // D-45: kartu/baris bisa diklik seperti Overview Finance, isinya hanya program Diajukan divisi ini
  const drill = createOverviewDrill({ year, totals: { total: Number(d.total) || 0, count: d.program_count }, divisionCode: code });
  body.replaceChildren(...renderOverview(d, { year, programHref: (r) => `#/d/${code}/p/${r.id}`, drill }));
}
