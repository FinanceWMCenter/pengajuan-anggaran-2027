// RAB Gabungan (D-52, tahap 1, hanya Finance): kelompok program dari satu/beberapa divisi untuk satu kegiatan.
// Tidak mengubah program maupun angka Dashboard. Semua total dihitung di database (rpc_f_rab_*).

import { h, icon, formatRupiah, formatPercent, monthName, plural, normalize, MONTHS } from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { refresh, navigate } from '../router.js';
import { getYear } from '../store.js';
import { pageHead, statusBadge, dataTable, errorBlock, loadingBlock, emptyState, flash, brandPanel, statCard, consolidationBadge, setLoading } from '../ui/components.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { exportRab } from '../excel.js';

const isNotFound = (e) => e instanceof ApiError && e.code === 'NOT_FOUND';

function monthRange(min, max, year) {
  if (!min) return '-';
  return min === max ? monthName(min, year) : `${monthName(min)}–${monthName(max, year)}`;
}

// ---------------------------------------------------------------------------
// Form nama + catatan (buat baru / ubah)
// ---------------------------------------------------------------------------
async function nameDialog({ title, description, group = null, confirmLabel }) {
  const uid = Math.random().toString(36).slice(2, 8);
  const name = h('input', { class: 'wm-input', id: `rab-nama-${uid}`, maxlength: 80, value: group ? group.name : '', placeholder: 'Contoh: JAKIM 2027', autocomplete: 'off' });
  const note = h('input', { class: 'wm-input', id: `rab-catatan-${uid}`, maxlength: 200, value: group && group.note ? group.note : '', placeholder: 'Opsional, misalnya tujuan atau tanggal kegiatan', autocomplete: 'off' });
  const nameErr = h('p', { class: 'wm-error', role: 'alert' });
  const noteErr = h('p', { class: 'wm-error', role: 'alert' });
  const formErr = h('p', { class: 'wm-error', role: 'alert' });
  [name, note].forEach((x) => x.addEventListener('input', () => { nameErr.textContent = ''; noteErr.textContent = ''; formErr.textContent = ''; }));
  let saved = null;
  const body = h('div', { class: 'stack-sm' },
    h('div', { class: 'wm-field' }, h('label', { class: 'wm-label', for: name.id }, 'Nama RAB Gabungan', h('span', { class: 'wm-required' }, '*wajib')), name, nameErr),
    h('div', { class: 'wm-field' }, h('label', { class: 'wm-label', for: note.id }, 'Catatan'), note, noteErr),
    formErr);
  const ok = await openDialog({
    title, description, body,
    actions: [
      { label: 'Batal', value: null },
      {
        label: confirmLabel, value: 'ok', variant: 'primary',
        validate: async () => {
          if (name.value.trim().length < 3) { nameErr.textContent = 'Nama minimal 3 karakter.'; name.focus(); return false; }
          try {
            saved = await rpc('rpc_f_rab_save', { p_group_id: group ? group.id : null, p_name: name.value, p_note: note.value });
            return true;
          } catch (e) {
            if (e instanceof ApiError && e.code === 'VALIDATION') {
              (e.field === 'note' ? noteErr : e.field === 'name' ? nameErr : formErr).textContent = e.message;
            } else formErr.textContent = errorMessage(e);
            return false;
          }
        },
      },
    ],
  });
  return ok === 'ok' ? saved : null;
}

// ---------------------------------------------------------------------------
// Halaman daftar RAB Gabungan
// ---------------------------------------------------------------------------
export async function financeRabListView(main) {
  const createBtn = h('button', {
    type: 'button', class: 'wm-btn wm-btn-primary', onclick: async () => {
      const g = await nameDialog({ title: 'RAB Gabungan baru', description: 'Setelah dibuat, tambahkan program lewat tombol "Tambah program".', confirmLabel: 'Buat' });
      if (g) { toast(`RAB Gabungan "${g.name}" dibuat.`, 'success'); navigate(`/finance/rab/${g.id}`); }
    },
  }, icon('layers'), 'RAB Gabungan baru');
  main.append(pageHead({
    title: 'RAB Gabungan',
    subtitle: 'Kumpulan program dari satu atau beberapa divisi untuk kegiatan yang sama. Hanya terlihat oleh Finance dan tidak mengubah angka Dashboard.',
    actions: [createBtn],
  }));
  const body = h('div', { class: 'stack' }, loadingBlock());
  main.append(body);

  let d;
  let year;
  try {
    [d, year] = await Promise.all([rpc('rpc_f_rab_list'), getYear()]);
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const stats = h('div', { class: 'stats' },
    brandPanel({ label: 'Total semua RAB Gabungan', value: d.total, note: `${formatRupiah(d.total)} · hanya program Diajukan`, iconName: 'layers' }),
    statCard({ label: 'Jumlah RAB Gabungan', value: String(d.groups.length), note: 'dibuat Finance', iconName: 'layers' }),
    statCard({ label: 'Program terkonsolidasi', value: String(d.member_count), note: `dari ${plural(d.all_program_count, 'program')}`, iconName: 'list', chip: 'is-secondary' }));

  if (!d.groups.length) {
    body.replaceChildren(stats, h('div', { class: 'wm-card' }, emptyState({
      title: 'Belum ada RAB Gabungan',
      text: 'Klik "RAB Gabungan baru", beri nama kegiatan (misalnya JAKIM 2027), lalu tambahkan program dari divisi-divisi terkait.',
      iconName: 'layers',
    })));
    return;
  }

  body.replaceChildren(stats, h('div', { class: 'rab-grid' }, d.groups.map((g) => h('a', { class: 'wm-card rab-card', href: `#/finance/rab/${g.id}` },
    h('h2', { class: 'rab-card-title' }, g.name),
    g.note ? h('p', { class: 'rab-card-note' }, g.note) : null,
    h('div', { class: 'rab-card-total num' }, formatRupiah(g.total)),
    h('p', { class: 'rab-card-meta' }, [
      plural(g.program_count, 'program diajukan'),
      g.draft_count ? ` · ${plural(g.draft_count, 'draft')}` : '',
      ` · ${plural(g.divisions.length, 'divisi')}`,
      ` · ${monthRange(g.month_min, g.month_max, year)}`,
    ].join('')),
    g.divisions.length ? h('div', { class: 'rab-chips' }, g.divisions.map((n) => h('span', { class: 'rab-chip' }, n))) : h('p', { class: 'rab-card-meta' }, 'Belum ada program')))));
}

// ---------------------------------------------------------------------------
// Halaman detail satu RAB Gabungan
// ---------------------------------------------------------------------------
export async function financeRabDetailView(main, ctx) {
  const id = Number(ctx.params.id);
  main.append(loadingBlock());
  let d;
  let year;
  try {
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('NOT_FOUND');
    [d, year] = await Promise.all([rpc('rpc_f_rab_detail', { p_group_id: id, p_export: false }), getYear()]);
  } catch (e) {
    if (isNotFound(e)) {
      main.replaceChildren(flash('warning', ['RAB Gabungan tidak ditemukan. Mungkin sudah dihapus. ', h('a', { href: '#/finance/rab' }, 'Kembali ke daftar'), '.']));
      return;
    }
    main.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const group = { id: d.id, name: d.name, note: d.note };
  const itemsOf = (pid) => d.items.filter((i) => i.program_id === pid);

  // ---- Aksi kepala halaman ----
  const exportBtn = h('button', {
    type: 'button', class: 'wm-btn wm-btn-outline', onclick: async (e) => {
      const btn = e.currentTarget;
      setLoading(btn, true);
      try {
        const fresh = await rpc('rpc_f_rab_detail', { p_group_id: id, p_export: true }); // dicatat di Log
        await exportRab(fresh, (n) => monthName(n));
        toast('File Excel sedang diunduh.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
      setLoading(btn, false);
    },
  }, icon('download'), 'Unduh Excel');
  const actions = [
    h('button', { type: 'button', class: 'wm-btn wm-btn-primary', onclick: () => addProgramsDialog(group) }, icon('layers'), 'Tambah program'),
    exportBtn,
    h('button', {
      type: 'button', class: 'wm-btn wm-btn-outline', onclick: async () => {
        const g = await nameDialog({ title: 'Ubah nama RAB Gabungan', group, confirmLabel: 'Simpan' });
        if (g) { toast('Nama RAB Gabungan diperbarui.', 'success'); refresh(); }
      },
    }, icon('pencil'), 'Ubah nama'),
    h('button', {
      type: 'button', class: 'wm-btn wm-btn-outline is-danger-text', onclick: async () => {
        const ok = await confirmDialog({
          title: `Hapus RAB Gabungan "${d.name}"?`,
          message: `Hanya kelompoknya yang dihapus. ${d.member_count ? `Semua ${plural(d.member_count, 'program')} tetap ada di divisi masing-masing` : 'Tidak ada program di dalamnya'} dan angka Dashboard tidak berubah.`,
          confirmLabel: 'Hapus RAB Gabungan', danger: true,
        });
        if (!ok) return;
        try {
          await rpc('rpc_f_rab_delete', { p_group_id: id });
          toast('RAB Gabungan dihapus. Program tetap ada.', 'success');
          navigate('/finance/rab', { force: true });
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
      },
    }, icon('trash'), 'Hapus'),
    h('a', { class: 'wm-btn wm-btn-outline', href: '#/finance/rab' }, icon('arrow-left'), 'Kembali'),
  ];

  // ---- Kartu ringkasan ----
  const topCat = d.per_kategori_baris[0];
  const stats = h('div', { class: 'stats' },
    brandPanel({ label: 'Total RAB Gabungan', value: d.total, note: `${formatRupiah(d.total)} · ${plural(d.program_count, 'program diajukan')}`, iconName: 'layers' }),
    statCard({ label: 'Divisi terlibat', value: String(d.divisions.length), note: d.divisions.length ? d.divisions.join(', ') : 'belum ada', iconName: 'users' }),
    statCard({ label: 'Periode', value: monthRange(d.month_min, d.month_max, year), note: d.months.length ? plural(d.months.length, 'bulan') : 'belum ada', iconName: 'calendar', chip: 'is-orange', isText: true }),
    statCard({ label: 'Kebutuhan terbesar', value: topCat ? topCat.name : '-', note: topCat ? `${formatRupiah(topCat.total)} · ${formatPercent(topCat.pct)}` : 'belum ada program Diajukan', iconName: 'box', chip: 'is-secondary', isText: true }));

  // ---- Tabel program, dikelompokkan per divisi dengan subtotal ----
  const divOrder = [...new Set(d.programs.map((p) => p.division_code))];
  const perDiv = new Map(d.per_divisi.map((x) => [x.division_code, x]));
  const rows = [];
  divOrder.forEach((code) => {
    d.programs.filter((p) => p.division_code === code).forEach((p) => rows.push(p));
    rows.push({ _sub: perDiv.get(code) });
  });
  const programTable = d.programs.length ? dataTable({
    caption: `Program dalam ${d.name}`,
    columns: [
      { label: 'Divisi', cls: 'cell-start', render: (p) => p.division_name },
      { label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => h('a', { href: `#/finance/p/${p.id}` }, p.nama_program) },
      { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
      { label: 'Kategori', cls: 'cell-start', render: (p) => p.program_category_name },
      { label: 'PIC', cls: 'cell-start', render: (p) => p.pic_nama },
      { label: 'Status', render: (p) => statusBadge(p.status) },
      { label: 'Total (Rp)', cls: 'cell-num', render: (p) => [formatRupiah(p.total), p.status === 'draft' ? h('div', { class: 'xsmall muted' }, 'tidak dihitung') : null] },
      {
        label: 'Aksi', cls: 'cell-actions', render: (p) => h('button', {
          type: 'button', class: 'wm-btn-text is-danger', title: 'Lepas dari RAB Gabungan ini (program tidak dihapus)',
          onclick: () => removeProgram(p),
        }, 'Keluarkan'),
      },
    ],
    rows,
    customRow: (r) => (r._sub ? [
      h('td', { colspan: 6, class: 'cell-start' }, `Subtotal ${r._sub.division_name} · ${plural(r._sub.count, 'program diajukan')}${r._sub.draft_count ? ` (+${r._sub.draft_count} draft)` : ''}`),
      h('td', { class: 'cell-num' }, formatRupiah(r._sub.total)),
      h('td', null),
    ] : null),
    onRowClick: (p) => programItemsDialog(p),
    rowClickable: (p) => !p._sub,
    footer: [
      h('td', { colspan: 6, class: 'cell-start' }, `TOTAL · ${plural(d.program_count, 'program diajukan')}${d.draft_count ? ` (+${d.draft_count} draft tidak dihitung)` : ''}`),
      h('td', { class: 'cell-num' }, formatRupiah(d.total)),
      h('td', null),
    ],
  }) : h('div', { class: 'card-empty' }, emptyState({ title: 'Belum ada program', text: 'Klik "Tambah program" untuk memilih program dari semua divisi.', iconName: 'layers' }));

  const card = (title, subtitle, content) => h('section', { class: 'wm-card card-table' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, title), subtitle ? h('p', { class: 'wm-card-subtitle' }, subtitle) : null)),
    content);

  const perDivTable = dataTable({
    caption: 'Per divisi',
    columns: [
      { label: 'Divisi', cls: 'cell-start', render: (x) => x.division_name },
      { label: 'Program', render: (x) => String(x.count) },
      { label: 'Total (Rp)', cls: 'cell-num', render: (x) => formatRupiah(x.total) },
      { label: '%', cls: 'cell-num', render: (x) => formatPercent(x.pct) },
    ],
    rows: d.per_divisi,
    empty: 'Belum ada program.',
    footer: [h('td', { class: 'cell-start' }, 'TOTAL'), h('td', null, String(d.program_count)), h('td', { class: 'cell-num' }, formatRupiah(d.total)), h('td', { class: 'cell-num' }, d.total > 0 ? '100%' : '0%')],
  });
  const perCatTable = dataTable({
    caption: 'Per kategori kebutuhan',
    columns: [
      { label: 'Kategori kebutuhan', cls: 'cell-start', render: (x) => x.name },
      { label: 'Baris', render: (x) => String(x.item_count) },
      { label: 'Total (Rp)', cls: 'cell-num', render: (x) => formatRupiah(x.total) },
      { label: '%', cls: 'cell-num', render: (x) => formatPercent(x.pct) },
    ],
    rows: d.per_kategori_baris,
    empty: 'Belum ada program Diajukan.',
    footer: [h('td', { class: 'cell-start' }, 'TOTAL'), h('td', null, String(d.per_kategori_baris.reduce((a, x) => a + Number(x.item_count), 0))), h('td', { class: 'cell-num' }, formatRupiah(d.total)), h('td', { class: 'cell-num' }, d.total > 0 ? '100%' : '0%')],
  });

  const excludedSection = h('details', { class: 'wm-card rab-excluded', open: d.excluded.length ? true : null },
    h('summary', null, `Bukan bagian gabungan ini (${d.excluded.length})`),
    d.excluded.length ? dataTable({
      caption: 'Program yang dikeluarkan',
      columns: [
        { label: 'Divisi', cls: 'cell-start', render: (p) => p.division_name },
        { label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => [h('a', { href: `#/finance/p/${p.id}` }, p.nama_program), p.other_group ? h('div', { class: 'item-marks' }, consolidationBadge(p.other_group)) : null] },
        { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
        { label: 'Status', render: (p) => statusBadge(p.status) },
        { label: 'Total (Rp)', cls: 'cell-num', render: (p) => formatRupiah(p.total) },
        {
          label: 'Aksi', cls: 'cell-actions', render: (p) => (p.other_group
            ? h('span', { class: 'xsmall muted' }, 'Sudah di gabungan lain')
            : h('button', { type: 'button', class: 'wm-btn-text', onclick: () => addPrograms([p.id], `${p.nama_program} dimasukkan lagi.`) }, 'Masukkan lagi')),
        },
      ],
      rows: d.excluded,
    }) : h('p', { class: 'rab-excluded-note muted small' }, 'Program yang dikeluarkan muncul di sini. Program tetap utuh di divisinya dan bisa dimasukkan lagi.'));

  main.replaceChildren(
    pageHead({ title: d.name, subtitle: d.note || 'RAB Gabungan', actions }),
    d.draft_count ? flash('info', `${plural(d.draft_count, 'draft')} ikut ditampilkan tetapi belum dihitung. Hanya program berstatus Diajukan yang masuk total.`) : null,
    stats,
    card('Program dalam RAB Gabungan', 'Dikelompokkan per divisi. Klik baris untuk melihat rincian item; klik nama untuk membuka halaman program.', programTable),
    h('p', { class: 'xsmall muted rab-live-note' }, 'Total diambil langsung dari data program terbaru. Bila divisi atau Finance merevisi item, angka di sini ikut berubah.'),
    h('div', { class: 'grid-2' }, card('Per divisi', null, perDivTable), card('Per kategori kebutuhan', 'Hanya program Diajukan', perCatTable)),
    excludedSection,
  );

  // ---- Aksi ----
  async function addPrograms(ids, okMessage) {
    try {
      await rpc('rpc_f_rab_add', { p_group_id: id, p_program_ids: ids });
      toast(okMessage, 'success');
      refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function removeProgram(p) {
    const ok = await confirmDialog({
      title: `Keluarkan "${p.nama_program}"?`,
      message: `Program hanya dilepas dari ${d.name} dan dipindah ke daftar "Bukan bagian gabungan ini". Program tidak dihapus dan angka Dashboard tidak berubah.`,
      confirmLabel: 'Keluarkan', danger: true,
    });
    if (!ok) return;
    try {
      await rpc('rpc_f_rab_remove', { p_group_id: id, p_program_id: p.id });
      toast(`${p.nama_program} dikeluarkan dari ${d.name}.`, 'success');
      refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  function programItemsDialog(p) {
    const items = itemsOf(p.id);
    openDialog({
      title: p.nama_program,
      description: `${p.division_name} · ${monthName(p.periode_bulan, year)} · ${p.program_category_name} · PIC ${p.pic_nama}`,
      wide: true,
      body: h('div', { class: 'drill stack-sm' },
        h('div', { class: 'item-marks' }, statusBadge(p.status), p.status === 'draft' ? h('span', { class: 'xsmall muted' }, ' Draft tidak dihitung di total') : null),
        dataTable({
          caption: `Rincian ${p.nama_program}`,
          columns: [
            { label: 'No', render: (i) => String(i.urutan) },
            { label: 'Uraian', cls: 'cell-start', render: (i) => i.uraian || '-' },
            { label: 'Kategori', cls: 'cell-start', render: (i) => i.item_category_name || '-' },
            { label: 'Qty', cls: 'cell-num', render: (i) => (i.qty == null ? '-' : String(i.qty).replace('.', ',')) },
            { label: 'Satuan', render: (i) => i.satuan || '-' },
            { label: 'Harga (Rp)', cls: 'cell-num', render: (i) => (i.harga_satuan == null ? '-' : formatRupiah(i.harga_satuan)) },
            { label: 'Subtotal (Rp)', cls: 'cell-num', render: (i) => formatRupiah(i.subtotal) },
          ],
          rows: items,
          empty: 'Program ini belum punya baris kebutuhan.',
          footer: [h('td', { colspan: 6, class: 'cell-start' }, `TOTAL · ${plural(items.length, 'baris')}`), h('td', { class: 'cell-num' }, formatRupiah(p.total))],
        }),
        h('p', { class: 'drill-foot' }, h('a', { href: `#/finance/p/${p.id}` }, 'Buka halaman program'))),
      actions: [{ label: 'Tutup', value: true, variant: 'primary', autofocus: true }],
      onOpen: (close) => window.addEventListener('hashchange', () => close(null), { once: true }),
    });
  }

  async function addProgramsDialog() {
    let all;
    try {
      all = await rpc('rpc_f_rab_candidates', { p_group_id: id });
    } catch (e) {
      toast(errorMessage(e), 'error');
      return;
    }
    const picked = new Set();
    const uniq = (key, label) => [...new Map(all.map((p) => [p[key], p[label]])).entries()];
    const sel = (aria, first, options) => h('select', { class: 'wm-select', 'aria-label': aria }, h('option', { value: '' }, first), options.map(([v, l]) => h('option', { value: String(v) }, l)));
    const fSearch = h('input', { class: 'wm-input', type: 'search', placeholder: 'Cari nama program atau PIC…', 'aria-label': 'Cari program', autocomplete: 'off' });
    const fDiv = sel('Filter divisi', 'Semua divisi', uniq('division_code', 'division_name'));
    const fMonth = sel('Filter bulan', 'Semua bulan', MONTHS.map((m, i) => [i + 1, m]));
    const fStatus = sel('Filter status', 'Semua status', [['diajukan', 'Diajukan'], ['draft', 'Draft']]);
    const count = h('p', { class: 'small muted', 'aria-live': 'polite' });
    const err = h('p', { class: 'wm-error', role: 'alert' });
    const holder = h('div', { class: 'rab-pick' });

    function draw() {
      const q = normalize(fSearch.value);
      const rows = all.filter((p) => (!q || normalize(p.nama_program).includes(q) || normalize(p.pic_nama).includes(q) || normalize(p.division_name).includes(q))
        && (!fDiv.value || p.division_code === fDiv.value)
        && (!fMonth.value || String(p.periode_bulan) === fMonth.value)
        && (!fStatus.value || p.status === fStatus.value));
      holder.replaceChildren(dataTable({
        caption: 'Pilih program',
        columns: [
          {
            label: 'Pilih', render: (p) => h('input', {
              type: 'checkbox', id: `rab-pick-${p.id}`, 'aria-label': `Pilih ${p.nama_program}`,
              disabled: p.other_group ? true : null, checked: picked.has(p.id) ? true : null,
              onchange: (e) => { if (e.target.checked) picked.add(p.id); else picked.delete(p.id); updateCount(); },
            }),
          },
          {
            label: 'Nama Program', cls: 'cell-start cell-name', render: (p) => [
              h('label', { for: `rab-pick-${p.id}` }, p.nama_program),
              p.other_group ? h('div', { class: 'item-marks' }, h('span', { class: 'xsmall muted' }, 'Sudah masuk '), consolidationBadge(p.other_group)) : null,
              p.excluded ? h('div', { class: 'xsmall muted' }, 'Pernah dikeluarkan dari gabungan ini') : null,
            ],
          },
          { label: 'Divisi', cls: 'cell-start', render: (p) => p.division_name },
          { label: 'Bulan', render: (p) => monthName(p.periode_bulan) },
          { label: 'Status', render: (p) => statusBadge(p.status) },
          { label: 'Total (Rp)', cls: 'cell-num', render: (p) => formatRupiah(p.total) },
        ],
        rows,
        rowClass: (p) => (p.other_group ? 'is-muted' : null),
        empty: all.length ? 'Tidak ada program yang cocok dengan filter.' : 'Semua program sudah ada di RAB Gabungan ini.',
      }));
    }
    function updateCount() {
      err.textContent = '';
      const add = all.filter((p) => picked.has(p.id) && p.status === 'diajukan').reduce((a, p) => a + Number(p.total), 0);
      count.textContent = picked.size ? `${plural(picked.size, 'program')} dipilih · menambah ${formatRupiah(add)} ke total (draft tidak dihitung)` : 'Belum ada program yang dipilih.';
    }
    [fSearch, fDiv, fMonth, fStatus].forEach((x) => x.addEventListener('input', draw));
    draw();
    updateCount();

    const result = await openDialog({
      title: `Tambah program ke ${d.name}`,
      description: 'Semua pengajuan dari semua divisi. Program yang sudah masuk RAB Gabungan lain tidak bisa dipilih (satu program hanya satu gabungan).',
      xwide: true,
      body: h('div', { class: 'stack-sm' }, h('div', { class: 'filter-bar' }, fSearch, fDiv, fMonth, fStatus), holder, count, err),
      actions: [
        { label: 'Batal', value: null },
        {
          label: 'Tambahkan', value: 'ok', variant: 'primary',
          validate: async () => {
            if (!picked.size) { err.textContent = 'Pilih minimal satu program.'; return false; }
            try {
              await rpc('rpc_f_rab_add', { p_group_id: id, p_program_ids: [...picked] });
              return true;
            } catch (e) {
              err.textContent = errorMessage(e);
              return false;
            }
          },
        },
      ],
    });
    if (result === 'ok') {
      toast(`${plural(picked.size, 'program')} ditambahkan ke ${d.name}.`, 'success');
      refresh();
    }
  }
}
