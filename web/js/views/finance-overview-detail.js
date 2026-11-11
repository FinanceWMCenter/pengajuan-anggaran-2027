// Pop-up rincian Overview Finance (D-42): setiap kartu/baris bisa diklik untuk melihat rincian + totalnya.
// Semua angka berasal dari database (rpc_f_overview_detail, hanya program Diajukan). Total pop-up dicocokkan
// dengan angka yang diklik; bila berbeda (mis. ada divisi baru submit), tampil peringatan + tombol muat ulang.

import { h, icon, formatRupiah, formatPercent, formatNumber, formatDate, monthName, plural } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { refresh, onCleanup } from '../router.js';
import { openDialog } from '../ui/dialog.js';
import { dataTable, flash, errorBlock } from '../ui/components.js';

const sumBy = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
const sharePct = (part, whole) => (whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0);

function totalFooter(colspan, label, total, trailing = 0) {
  return [
    h('td', { colspan, class: 'cell-start' }, label),
    h('td', { class: 'cell-num' }, formatRupiah(total)),
    ...Array.from({ length: trailing }, () => h('td', null)),
  ];
}

/**
 * @param {object} o
 * @param {number} o.year
 * @param {Array} o.perDivisi d.per_divisi (dasar pop-up Per grup, termasuk divisi bernilai Rp 0)
 * @param {{total:number, count:number}} o.totals total keseluruhan di Overview
 */
export function createOverviewDrill({ year, perDivisi, totals }) {
  let detail = null;
  let isOpen = false;
  const load = () => {
    if (!detail) detail = rpc('rpc_f_overview_detail').catch((e) => { detail = null; throw e; });
    return detail;
  };

  /**
   * @param {object} o {title, description, expected:{total, count?}, build:(data, linkTo)=>{nodes, total, count?}}
   */
  function show({ title, description, expected, build }) {
    if (isOpen) return;
    isOpen = true;
    const holder = h('div', { class: 'drill' });
    let closeDialog = () => {};
    // Tautan di dalam pop-up: tutup dulu pop-up-nya, lalu pindah halaman
    const linkTo = (href, label) => h('a', { href, onclick: () => closeDialog(null) }, label);

    const render = async () => {
      holder.replaceChildren(h('p', { class: 'page-loading' }, 'Memuat rincian...'));
      try {
        const data = await load();
        const view = build(data, linkTo);
        const differs = Number(expected.total) !== view.total
          || (expected.count !== undefined && Number(expected.count) !== view.count);
        holder.replaceChildren(
          differs ? flash('warning', [
            'Angka di rincian berbeda dengan Overview karena data baru saja berubah. Muat ulang untuk melihat angka terbaru.',
            h('div', { class: 'flash-actions' }, h('button', {
              type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm',
              onclick: () => { closeDialog(null); refresh(); },
            }, icon('refresh'), 'Muat ulang')),
          ]) : '',
          ...view.nodes,
        );
      } catch (e) {
        holder.replaceChildren(errorBlock(errorMessage(e), render));
      }
    };

    openDialog({
      title,
      description,
      body: holder,
      xwide: true,
      actions: [{ label: 'Tutup', value: null, variant: 'primary', autofocus: true }],
      onOpen: (close) => {
        closeDialog = close;
        onCleanup(() => close(null)); // pindah halaman / tombol Back: pop-up ikut tertutup
      },
    }).finally(() => { isOpen = false; });
    render();
  }

  /** Tabel daftar program; hide = kolom yang sudah jelas dari judul pop-up. */
  function programTable(rows, linkTo, hide = {}) {
    const columns = [
      { label: 'Tgl Pengajuan', cls: 'nowrap', render: (p) => formatDate(p.tanggal_pengajuan) },
      hide.division ? null : { label: 'Divisi', cls: 'cell-start', render: (p) => p.division_name },
      { label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => linkTo(`#/finance/p/${p.id}`, p.nama_program) },
      hide.category ? null : { label: 'Kategori', cls: 'cell-start', render: (p) => p.program_category_name },
      hide.month ? null : { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
      { label: 'PIC', cls: 'cell-start', render: (p) => p.pic_nama },
      { label: 'Total', cls: 'cell-num', render: (p) => formatRupiah(p.total) },
    ].filter(Boolean);
    const total = sumBy(rows, 'total');
    return {
      total,
      count: rows.length,
      nodes: [dataTable({
        columns, rows, empty: 'Belum ada program Diajukan.',
        footer: totalFooter(columns.length - 1, `TOTAL · ${plural(rows.length, 'program')}`, total),
      })],
    };
  }

  const summary = (count, unit, total) => `${plural(Number(count), unit)} · ${formatRupiah(total)}`;

  return {
    all() {
      show({
        title: `Semua program diajukan ${year}`,
        description: summary(totals.count, 'program', totals.total),
        expected: totals,
        build: (data, linkTo) => programTable(data.programs, linkTo),
      });
    },

    month(r) {
      show({
        title: monthName(r.bulan, year),
        description: summary(r.count, 'program', r.total),
        expected: { total: r.total, count: r.count },
        build: (data, linkTo) => programTable(data.programs.filter((p) => p.periode_bulan === r.bulan), linkTo, { month: true }),
      });
    },

    quarter(r, label) {
      const months = [1, 2, 3].map((n) => (r.kuartal - 1) * 3 + n);
      show({
        title: `${label} ${year}`,
        description: summary(r.count, 'program', r.total),
        expected: { total: r.total, count: r.count },
        build: (data) => {
          const rows = data.programs.filter((p) => months.includes(p.periode_bulan));
          const byDiv = new Map();
          for (const p of rows) {
            if (!byDiv.has(p.division_code)) byDiv.set(p.division_code, { name: p.division_name, group: p.group_name, total: 0, m: {} });
            const x = byDiv.get(p.division_code);
            x.total += Number(p.total);
            x.m[p.periode_bulan] = (x.m[p.periode_bulan] || 0) + Number(p.total);
          }
          const list = [...byDiv.values()].sort((a, z) => z.total - a.total || a.name.localeCompare(z.name));
          const total = sumBy(rows, 'total');
          const monthTotal = (m) => sumBy(rows.filter((p) => p.periode_bulan === m), 'total');
          return {
            total,
            count: rows.length,
            nodes: [dataTable({
              columns: [
                { label: 'Divisi', cls: 'cell-start', render: (x) => x.name },
                { label: 'Grup', cls: 'cell-start', render: (x) => x.group },
                ...months.map((m) => ({ label: monthName(m), cls: 'cell-num', render: (x) => formatRupiah(x.m[m] || 0) })),
                { label: 'Total', cls: 'cell-num', render: (x) => formatRupiah(x.total) },
                { label: '%', cls: 'cell-num', render: (x) => formatPercent(sharePct(x.total, total)) },
              ],
              rows: list,
              footer: [
                h('td', { colspan: 2, class: 'cell-start' }, 'TOTAL'),
                ...months.map((m) => h('td', { class: 'cell-num' }, formatRupiah(monthTotal(m)))),
                h('td', { class: 'cell-num' }, formatRupiah(total)),
                h('td', { class: 'cell-num' }, total ? '100%' : '0%'),
              ],
            })],
          };
        },
      });
    },

    group(r) {
      show({
        title: `Grup ${r.name}`,
        description: summary(r.count, 'program', r.total),
        expected: { total: r.total, count: r.count },
        build: (data) => {
          const rows = data.programs.filter((p) => p.group_name === r.name);
          const total = sumBy(rows, 'total');
          const list = perDivisi.filter((x) => x.group_name === r.name).map((x) => {
            const own = rows.filter((p) => p.division_code === x.code);
            return { name: x.name, count: own.length, total: sumBy(own, 'total') };
          }).sort((a, z) => z.total - a.total || a.name.localeCompare(z.name));
          return {
            total,
            count: rows.length,
            nodes: [dataTable({
              columns: [
                { label: 'Divisi', cls: 'cell-start', render: (x) => x.name },
                { label: 'Program', render: (x) => String(x.count) },
                { label: 'Total', cls: 'cell-num', render: (x) => formatRupiah(x.total) },
                { label: '% dalam grup', cls: 'cell-num', render: (x) => formatPercent(sharePct(x.total, total)) },
              ],
              rows: list,
              footer: [
                h('td', { class: 'cell-start' }, 'TOTAL'),
                h('td', null, String(rows.length)),
                h('td', { class: 'cell-num' }, formatRupiah(total)),
                h('td', { class: 'cell-num' }, total ? '100%' : '0%'),
              ],
            })],
          };
        },
      });
    },

    division(r) {
      show({
        title: r.name,
        description: summary(r.count, 'program', r.total),
        expected: { total: r.total, count: r.count },
        build: (data, linkTo) => {
          const view = programTable(data.programs.filter((p) => p.division_code === r.code), linkTo, { division: true });
          view.nodes.push(h('p', { class: 'drill-foot' },
            r.draft_count ? `${plural(r.draft_count, 'draft')} tidak dihitung. ` : '',
            linkTo(`#/d/${r.code}`, 'Buka halaman divisi')));
          return view;
        },
      });
    },

    programCategory(r) {
      show({
        title: `Kategori program: ${r.name}`,
        description: summary(r.count, 'program', r.total),
        expected: { total: r.total, count: r.count },
        build: (data, linkTo) => programTable(data.programs.filter((p) => p.program_category_id === r.id), linkTo, { category: true }),
      });
    },

    itemCategory(r) {
      show({
        title: `Kategori kebutuhan: ${r.name}`,
        description: summary(r.item_count, 'baris', r.total),
        expected: { total: r.total, count: r.item_count },
        build: (data, linkTo) => {
          const programs = new Map(data.programs.map((p) => [p.id, p]));
          const rows = data.items.filter((i) => i.item_category_id === r.id);
          const total = sumBy(rows, 'subtotal');
          const columns = [
            { label: 'Tgl Pengajuan', cls: 'nowrap', render: (i) => formatDate(programs.get(i.program_id)?.tanggal_pengajuan) },
            { label: 'Divisi', cls: 'cell-start', render: (i) => programs.get(i.program_id)?.division_name },
            { label: 'Nama Program', cls: 'cell-start cell-name', render: (i) => linkTo(`#/finance/p/${i.program_id}`, programs.get(i.program_id)?.nama_program || '-') },
            { label: 'Bulan', render: (i) => monthName(programs.get(i.program_id)?.periode_bulan) },
            { label: 'Uraian', cls: 'cell-start', render: (i) => i.uraian },
            { label: 'Qty', cls: 'num', render: (i) => formatNumber(i.qty) },
            { label: 'Satuan', render: (i) => i.satuan },
            { label: 'Harga', cls: 'cell-num', render: (i) => formatRupiah(i.harga_satuan) },
            { label: 'Subtotal', cls: 'cell-num', render: (i) => formatRupiah(i.subtotal) },
            { label: 'Catatan', cls: 'cell-start', render: (i) => i.catatan || '' },
          ];
          return {
            total,
            count: rows.length,
            nodes: [dataTable({
              columns, rows,
              footer: totalFooter(columns.length - 2, `TOTAL · ${plural(rows.length, 'baris')}`, total, 1),
            })],
          };
        },
      });
    },

    program(r) {
      show({
        title: r.nama_program,
        description: `${r.division_name} · ${monthName(r.periode_bulan, year)} · ${formatRupiah(r.total)}`,
        expected: { total: r.total },
        build: (data, linkTo) => {
          const p = data.programs.find((x) => x.id === r.id);
          const rows = data.items.filter((i) => i.program_id === r.id).sort((a, z) => a.urutan - z.urutan);
          const total = sumBy(rows, 'subtotal');
          const columns = [
            { label: 'Uraian', cls: 'cell-start', render: (i) => i.uraian },
            { label: 'Kategori', cls: 'cell-start', render: (i) => i.item_category_name || '-' },
            { label: 'Qty', cls: 'num', render: (i) => formatNumber(i.qty) },
            { label: 'Satuan', render: (i) => i.satuan },
            { label: 'Harga', cls: 'cell-num', render: (i) => formatRupiah(i.harga_satuan) },
            { label: 'Subtotal', cls: 'cell-num', render: (i) => formatRupiah(i.subtotal) },
            { label: 'Catatan', cls: 'cell-start', render: (i) => i.catatan || '' },
          ];
          return {
            total,
            nodes: [
              p ? h('dl', { class: 'dialog-summary drill-info' },
                h('dt', null, 'Divisi'), h('dd', null, p.division_name),
                h('dt', null, 'Kategori'), h('dd', null, p.program_category_name),
                h('dt', null, 'PIC'), h('dd', null, p.pic_nama),
                h('dt', null, 'Tgl Pengajuan'), h('dd', null, formatDate(p.tanggal_pengajuan))) : '',
              dataTable({
                columns, rows,
                footer: totalFooter(columns.length - 2, `TOTAL · ${plural(rows.length, 'baris')}`, total, 1),
              }),
              h('p', { class: 'drill-foot' }, linkTo(`#/finance/p/${r.id}`, 'Buka halaman program')),
            ],
          };
        },
      });
    },
  };
}
