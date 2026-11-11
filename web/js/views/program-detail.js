// Detail program (PRD 5.5): info + tabel kebutuhan + total. Dipakai divisi dan Finance.
// Finance dapat merevisi item program Diajukan (D-43); riwayat per item terlihat oleh Finance dan divisi pemilik.

import { h, icon, formatRupiah, formatNumber, formatDate, formatDateTime, monthName, plural } from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { getYear, getMaster } from '../store.js';
import { refresh, navigate, setLeaveGuard, onCleanup } from '../router.js';
import { pageHead, statusBadge, revisedBadge, dataTable, errorBlock, loadingBlock, flash, setLoading } from '../ui/components.js';
import { confirmDialog, openDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { deleteProgram } from './program-actions.js';
import { createRevision, groupHistory, historyList } from './program-revision.js';

export async function programDetailView(main, ctx) {
  const id = ctx.params.id;
  const financeRoute = !ctx.params.code;
  main.append(loadingBlock());

  let p;
  let year;
  let history;
  let master = null;
  const isFinance = ctx.session.role === 'finance';
  try {
    [p, year, history] = await Promise.all([
      rpc('rpc_get_program', { p_id: id }),
      getYear(),
      rpc('rpc_program_item_history', { p_id: id }).catch(() => null), // detail tetap tampil walau riwayat gagal dimuat
    ]);
    if (isFinance && p.status === 'diajukan') master = await getMaster({ refresh: true });
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
  const byItem = groupHistory(history || []);
  const revisedItems = new Set((history || []).filter((e) => e.actor_role === 'finance').map((e) => e.item_id));
  const currentIds = new Set(p.items.map((i) => i.id));
  const canRevise = isFinance && p.status === 'diajukan';

  const itemsHolder = h('div', { class: 'stack-sm' });
  const rev = canRevise ? createRevision({ program: p, master, onChange: drawItems }) : null;
  let busy = false;

  if (rev) {
    const beforeUnload = (e) => { if (rev.count() > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    onCleanup(() => window.removeEventListener('beforeunload', beforeUnload));
    setLeaveGuard(async () => {
      if (rev.count() === 0) return true;
      return confirmDialog({
        title: 'Tinggalkan halaman?',
        message: 'Revisi yang belum di-submit akan hilang.',
        confirmLabel: 'Tinggalkan', cancelLabel: 'Tetap di sini',
      });
    });
  }

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

  function historyToggle(entries) {
    return h('button', {
      type: 'button', class: 'wm-btn-text history-toggle', 'aria-expanded': 'false',
      onclick: (e) => {
        const btn = e.currentTarget;
        const row = btn.closest('tr').nextElementSibling;
        row.hidden = !row.hidden;
        btn.setAttribute('aria-expanded', String(!row.hidden));
      },
    }, icon('history', 'ic-sm'), `Riwayat (${entries.length})`);
  }

  function revisionButtons(r) {
    const btn = (label, onclick, danger = false) => h('button', { type: 'button', class: `wm-btn-text${danger ? ' is-danger' : ''}`, onclick }, label);
    if (r._state === 'tambah') return [btn('Ubah', () => rev.editAdded(r._key)), btn('Batalkan', () => rev.undoAdded(r._key))];
    if (r._state === 'ubah') return [btn('Ubah', () => rev.reviseItem(r._orig)), btn('Batalkan', () => rev.undoItem(r.id))];
    if (r._state === 'hapus') return [btn('Batalkan', () => rev.undoItem(r.id))];
    return [btn('Revisi', () => rev.reviseItem(r._orig)), btn('Hapus', () => rev.removeItem(r._orig), true)];
  }

  const PENDING_LABEL = { ubah: 'Akan diubah', hapus: 'Akan dihapus', tambah: 'Item baru' };

  function drawItems() {
    const showHistory = p.items.some((i) => byItem.has(i.id));
    const columns = [
      { label: 'No', render: (r) => String(r._no) },
      {
        label: 'Uraian kebutuhan', cls: 'cell-start cell-name',
        render: (r) => [
          r.uraian || h('span', { class: 'muted' }, '(belum diisi)'),
          revisedItems.has(r.id) || r._state ? h('div', { class: 'item-marks' },
            revisedItems.has(r.id) ? revisedBadge() : null,
            r._state ? h('span', { class: 'wm-badge is-warning' }, PENDING_LABEL[r._state]) : null) : null,
        ],
      },
      { label: 'Kategori', render: (r) => r.item_category_name || h('span', { class: 'text-danger' }, 'Belum dipilih') },
      { label: 'Qty', cls: 'cell-num', render: (r) => (r.qty === null ? '-' : formatNumber(r.qty)) },
      { label: 'Satuan', render: (r) => r.satuan || '-' },
      { label: 'Harga satuan', cls: 'cell-num', render: (r) => formatRupiah(r.harga_satuan) },
      { label: 'Subtotal', cls: 'cell-num', render: (r) => formatRupiah(r.subtotal) },
      { label: 'Catatan', cls: 'cell-start', render: (r) => r.catatan || '' },
      showHistory ? { label: 'Riwayat', render: (r) => (byItem.has(r.id) ? historyToggle(byItem.get(r.id)) : '') } : null,
      canRevise ? { label: 'Aksi', cls: 'cell-actions', render: (r) => revisionButtons(r) } : null,
    ].filter(Boolean);

    const rows = [];
    let no = 0;
    for (const it of p.items) {
      no += 1;
      const pending = rev?.edits.get(it.id);
      rows.push({ ...it, ...(pending?.op === 'ubah' ? pending.view : {}), id: it.id, _no: no, _state: pending?.op || null, _orig: it });
      if (byItem.has(it.id)) {
        rows.push({ custom: { props: { class: 'is-history', hidden: true }, cells: [h('td', { colspan: columns.length, class: 'cell-start' }, historyList(byItem.get(it.id)))] } });
      }
    }
    for (const a of rev?.added || []) {
      no += 1;
      rows.push({ ...a.view, _no: no, _state: 'tambah', _key: a.key });
    }

    const pendingCount = rev ? rev.count() : 0;
    const shownTotal = pendingCount ? rev.previewTotal() : p.total;
    const table = h('section', { class: 'wm-card card-table' },
      h('div', { class: 'card-head' },
        h('div', null, h('h2', { class: 'wm-card-title' }, 'Daftar kebutuhan'), h('p', { class: 'wm-card-subtitle' }, `${p.items.length} baris`)),
        h('div', { class: 'head-actions' },
          canRevise ? h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => rev.addItem() }, icon('plus'), 'Tambah Item') : null,
          h('div', { class: 'num strong' }, `Total ${formatRupiah(shownTotal)}`))),
      dataTable({
        columns, rows, empty: 'Belum ada baris kebutuhan.', caption: 'Daftar kebutuhan',
        customRow: (r) => r.custom || null,
        rowClass: (r) => (r._state ? `is-rev-${r._state}` : null),
        footer: [
          h('td', { colspan: 6, class: 'cell-start' }, pendingCount ? 'TOTAL SETELAH REVISI (belum disimpan)' : 'TOTAL ANGGARAN PROGRAM'),
          h('td', { class: 'cell-num' }, formatRupiah(shownTotal)),
          h('td', { colspan: columns.length - 7 }),
        ],
      }));

    const bar = pendingCount ? h('div', { class: 'revise-bar', 'aria-live': 'polite' },
      h('div', null,
        h('b', null, `${plural(pendingCount, 'perubahan')} belum disimpan`),
        h('div', { class: 'xsmall muted' }, `Total ${formatRupiah(p.total)} → ${formatRupiah(shownTotal)}`)),
      h('div', { class: 'head-actions' },
        h('button', {
          type: 'button', class: 'wm-btn wm-btn-outline',
          onclick: async () => {
            if (await confirmDialog({ title: 'Batalkan semua revisi?', message: 'Semua perubahan yang belum di-submit akan hilang.', confirmLabel: 'Batalkan semua', cancelLabel: 'Kembali', danger: true })) {
              rev.clear();
              drawItems();
            }
          },
        }, 'Batalkan semua'),
        h('button', { type: 'button', class: 'wm-btn wm-btn-primary', onclick: (e) => submitRevision(e.currentTarget) }, icon('send'), 'Submit Revisi'))) : null;

    itemsHolder.replaceChildren(...[table, bar].filter(Boolean));
  }

  async function submitRevision(btn) {
    if (busy) return;
    busy = true;
    try {
      const ok = await confirmDialog({
        title: 'Submit revisi?',
        message: `Perubahan langsung tersimpan dan ${p.division_name} mendapat notifikasi.`,
        body: h('dl', { class: 'dialog-summary' },
          h('dt', null, 'Program'), h('dd', null, p.nama_program),
          h('dt', null, 'Jumlah perubahan'), h('dd', null, String(rev.count())),
          h('dt', null, 'Total sebelum'), h('dd', null, formatRupiah(p.total)),
          h('dt', null, 'Total sesudah'), h('dd', null, formatRupiah(rev.previewTotal()))),
        confirmLabel: 'Submit Revisi',
      });
      if (!ok) return;
      setLoading(btn, true);
      await rpc('rpc_f_revise_items', { p_program_id: p.id, p_expected_updated_at: p.updated_at, p_changes: rev.payload() });
      rev.clear();
      toast('Revisi tersimpan', 'success');
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        const reload = await openDialog({
          title: 'Program sudah berubah',
          description: 'Program ini baru saja diubah. Muat ulang untuk melihat versi terbaru, lalu ulangi revisi Anda. Revisi yang belum di-submit akan hilang.',
          actions: [{ label: 'Tetap di sini', value: false }, { label: 'Muat ulang', value: true, variant: 'primary', autofocus: true }],
        });
        if (reload) { rev.clear(); refresh(); }
      } else {
        toast(e instanceof ApiError && e.code === 'VALIDATION' ? e.message : errorMessage(e), 'error');
      }
    } finally {
      busy = false;
      if (btn.isConnected) setLoading(btn, false);
    }
  }

  // Item yang sudah dihapus: riwayatnya tetap bisa dibuka
  const removed = [...byItem.entries()].filter(([itemId]) => !currentIds.has(itemId));
  const removedSection = removed.length ? h('details', { class: 'wm-card removed-items' },
    h('summary', null, `Item yang sudah dihapus (${removed.length})`),
    removed.map(([itemId, entries]) => {
      const last = entries.find((e) => e.old_data) || entries[0];
      return h('div', { class: 'removed-item', 'data-item': itemId }, h('b', null, (last.old_data || last.new_data || {}).uraian || '-'), historyList(entries));
    })) : null;

  const badge = [statusBadge(p.status), revisedItems.size ? revisedBadge() : null];
  drawItems();
  main.replaceChildren(...[
    pageHead({ title: p.nama_program, subtitle: `${p.division_name} · ${monthName(p.periode_bulan, year)}`, actions, badge }),
    p.status === 'draft' && !readOnly ? flash('info', 'Program ini masih draft dan belum dihitung di total. Klik Edit lalu Submit Pengajuan bila sudah lengkap.') : null,
    !isFinance && revisedItems.size ? flash('info', `Finance sudah merevisi ${plural(revisedItems.size, 'item')} pada program ini. Klik Riwayat pada item untuk melihat perubahan dan alasannya.`) : null,
    history === null ? flash('warning', 'Riwayat item belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.') : null,
    h('section', { class: 'wm-card' }, h('div', { class: 'card-head' }, h('h2', { class: 'wm-card-title' }, 'Info program')), info),
    itemsHolder,
    removedSection,
  ].filter(Boolean));
}

function item(label, value) {
  return h('div', null, h('dt', null, label), h('dd', null, value));
}
