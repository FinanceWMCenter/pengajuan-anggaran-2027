// Log riwayat (F-05): siapa, kapan, apa, alasan. Hanya bisa dibaca, tidak bisa diubah.

import { h, formatDateTime, formatRupiah, monthName } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { refresh } from '../router.js';
import { pageHead, dataTable, errorBlock, loadingBlock } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';
import { changeLines, itemLine } from './program-revision.js';

const ACTIONS = {
  create: 'Buat draft', update: 'Ubah', submit: 'Submit', revise: 'Revisi Finance', delete: 'Hapus', pin_reset: 'Atur/reset PIN',
  master_pin_change: 'Ganti PIN Finance', category_change: 'Ubah kategori', export: 'Export',
};
const ROLES = { division: 'Divisi', finance: 'Finance', system: 'Sistem' };

export async function financeLogView(main) {
  main.append(pageHead({ title: 'Log Riwayat', subtitle: 'Semua perubahan data, PIN, kategori, dan export tercatat di sini' }));

  let divisions = [];
  try { divisions = await rpc('rpc_f_list_divisions'); } catch { divisions = []; }

  const fAction = h('select', { class: 'wm-select', 'aria-label': 'Filter aksi' }, h('option', { value: '' }, 'Semua aksi'), Object.entries(ACTIONS).map(([v, l]) => h('option', { value: v }, l)));
  const fDiv = h('select', { class: 'wm-select', 'aria-label': 'Filter divisi' }, h('option', { value: '' }, 'Semua divisi'), divisions.map((d) => h('option', { value: String(d.id) }, d.name)));
  const fFrom = h('input', { class: 'wm-input', type: 'date', 'aria-label': 'Dari tanggal' });
  const fTo = h('input', { class: 'wm-input', type: 'date', 'aria-label': 'Sampai tanggal' });
  const holder = h('div', null, loadingBlock());
  const note = h('span', null);
  main.append(h('div', { class: 'stack-sm' }, h('div', { class: 'filter-bar' }, fAction, fDiv, fFrom, fTo), h('div', { class: 'filter-foot' }, note, h('span', null, 'Menampilkan maksimal 500 entri terbaru'))), holder);

  async function load() {
    holder.replaceChildren(loadingBlock());
    let rows;
    try {
      rows = await rpc('rpc_f_audit_log', {
        p_filters: { action: fAction.value || null, division_id: fDiv.value || null, date_from: fFrom.value || null, date_to: fTo.value || null, limit: 500 },
      });
    } catch (e) {
      holder.replaceChildren(errorBlock(errorMessage(e), load));
      return;
    }
    note.textContent = `${rows.length} entri`;
    holder.replaceChildren(dataTable({
      caption: 'Log riwayat',
      columns: [
        { label: 'Waktu (WIB)', cls: 'nowrap', render: (r) => formatDateTime(r.occurred_at) },
        { label: 'Aktor', cls: 'cell-start', render: (r) => [ROLES[r.actor_role] || r.actor_role, r.actor_name ? h('div', { class: 'xsmall muted' }, r.actor_name) : null] },
        { label: 'Divisi', cls: 'cell-start', render: (r) => r.division_name || '-' },
        { label: 'Aksi', render: (r) => h('span', { class: `wm-badge${r.action === 'delete' ? ' is-critical' : r.action === 'submit' ? ' is-good' : r.action === 'revise' ? ' is-warning' : ''}` }, ACTIONS[r.action] || r.action) },
        { label: 'Data', cls: 'cell-start', render: (r) => describe(r) },
        { label: 'Alasan', cls: 'cell-start', render: (r) => r.reason || '' },
        { label: 'Detail', render: (r) => h('button', { type: 'button', class: 'wm-btn-text', onclick: () => showDetail(r) }, 'Lihat') },
      ],
      rows,
      empty: 'Tidak ada entri untuk filter ini.',
    }));
  }
  [fAction, fDiv, fFrom, fTo].forEach((x) => x.addEventListener('change', load));
  load();
}

function describe(r) {
  const p = r.new_data || r.old_data;
  if (r.entity_type === 'program' && p) return `${p.nama_program} · ${monthName(p.periode_bulan)} · ${formatRupiah(p.total)}`;
  if (r.entity_type === 'category' && p) return `${p.kind === 'program' ? 'Kategori program' : 'Kategori baris'}: ${p.name} (${p.is_active ? 'aktif' : 'nonaktif'})`;
  if (r.entity_type === 'export' && r.new_data) return `Status: ${r.new_data.status}, ${r.new_data.row_count} baris`;
  if (r.entity_type === 'division') return 'PIN divisi diatur ulang';
  if (r.entity_type === 'settings') return 'PIN Finance diganti';
  return r.entity_id || '';
}

// ---------------------------------------------------------------------------
// Detail satu entri: ringkasan yang mudah dibaca + data mentah di bagian tertutup
// ---------------------------------------------------------------------------
const actorLabel = (r) => {
  const base = r.actor_role === 'finance' ? 'Finance' : r.actor_role === 'division' ? (r.division_name || 'Divisi') : 'Sistem';
  return r.actor_name ? `${base} (${r.actor_name})` : base;
};
const STATUS = { draft: 'Draft', diajukan: 'Diajukan' };
const INFO_FIELDS = [
  { key: 'nama_program', label: 'Nama program', fmt: (v) => v },
  { key: 'program_category_name', label: 'Kategori program', fmt: (v) => v },
  { key: 'periode_bulan', label: 'Periode', fmt: (v) => monthName(v) },
  { key: 'pic_nama', label: 'PIC', fmt: (v) => v },
  { key: 'status', label: 'Status', fmt: (v) => STATUS[v] || v },
];
const TYPE = { ubah: 'Diubah', tambah: 'Ditambahkan', hapus: 'Dihapus' };

/** Cocokkan item lama-baru: lewat id bila ada yang sama; data lama (id berganti tiap simpan) lewat nomor urut. */
function itemChanges(oldItems, newItems) {
  const oldIds = new Set(oldItems.map((i) => i.id));
  const key = newItems.some((i) => oldIds.has(i.id)) ? (i) => i.id : (i) => `no-${i.urutan}`;
  const oldMap = new Map(oldItems.map((i) => [key(i), i]));
  const newKeys = new Set(newItems.map(key));
  const out = [];
  for (const n of newItems) {
    const o = oldMap.get(key(n));
    if (!o) { out.push({ type: 'tambah', item: n }); continue; }
    const lines = changeLines({ old_data: o, new_data: n });
    if (lines.length) out.push({ type: 'ubah', item: n, lines });
  }
  for (const o of oldItems) if (!newKeys.has(key(o))) out.push({ type: 'hapus', item: o });
  return out;
}

const section = (title, ...content) => h('div', { class: 'log-section' }, h('h3', { class: 'log-section-title' }, title), ...content);

function programBody(r) {
  const o = r.old_data;
  const n = r.new_data;
  const p = n || o || {};
  const parts = [];
  if (o && n) {
    const info = INFO_FIELDS.filter((f) => (o[f.key] ?? null) !== (n[f.key] ?? null))
      .map((f) => h('div', { class: 'history-change' }, h('span', { class: 'muted' }, `${f.label}: `), f.fmt(o[f.key]), ' → ', h('b', null, f.fmt(n[f.key]))));
    if (info.length) parts.push(section('Info program yang berubah', ...info));
    const changes = itemChanges(o.items || [], n.items || []);
    parts.push(changes.length
      ? section(`Item yang berubah (${changes.length})`, h('ul', { class: 'history-list' }, changes.map((c) => h('li', null,
        h('div', { class: 'history-meta' }, h('b', null, c.item.uraian || '(tanpa uraian)'), ` · ${TYPE[c.type]}`),
        c.type === 'ubah' ? c.lines : itemLine(c.item)))))
      : (info.length ? null : h('p', { class: 'muted' }, 'Tidak ada perubahan isi (hanya disimpan ulang).')));
  } else {
    const items = p.items || [];
    parts.push(section(o ? `Isi program yang dihapus (${items.length} item)` : `Isi program (${items.length} item)`,
      items.length ? h('ul', { class: 'history-list' }, items.map((i) => h('li', null, itemLine(i)))) : h('p', { class: 'muted' }, 'Belum ada item.')));
  }
  return parts.filter(Boolean);
}

function otherBody(r) {
  const o = r.old_data || {};
  const n = r.new_data || {};
  if (r.entity_type === 'category') {
    const lines = [h('div', null, `${n.kind === 'program' ? 'Kategori program' : 'Kategori baris'}: `, h('b', null, n.name))];
    if (r.old_data && o.name !== n.name) lines.push(h('div', { class: 'history-change' }, h('span', { class: 'muted' }, 'Nama: '), o.name, ' → ', h('b', null, n.name)));
    if (r.old_data && o.is_active !== n.is_active) lines.push(h('div', { class: 'history-change' }, h('span', { class: 'muted' }, 'Status: '), o.is_active ? 'aktif' : 'nonaktif', ' → ', h('b', null, n.is_active ? 'aktif' : 'nonaktif')));
    if (!r.old_data) lines.push(h('div', { class: 'muted' }, 'Kategori baru'));
    return lines;
  }
  if (r.entity_type === 'export') return [h('div', null, `Data: ${n.status === 'all' ? 'semua status' : (STATUS[n.status] || n.status)} · ${n.row_count} baris`)];
  if (r.entity_type === 'division') return [h('div', null, `PIN ${r.division_name || 'divisi'} diatur ulang${n.via ? ` (lewat ${n.via})` : ''}`)];
  if (r.entity_type === 'settings') return [h('div', null, `PIN Finance diganti${n.via ? ` (lewat ${n.via})` : ''}`)];
  return [];
}

function showDetail(r) {
  const isProgram = r.entity_type === 'program';
  const p = r.new_data || r.old_data || {};
  const reasons = r.action === 'revise' && r.reason ? r.reason.split(' | ') : null;
  const summary = h('dl', { class: 'dialog-summary' },
    h('dt', null, 'Waktu'), h('dd', null, `${formatDateTime(r.occurred_at)} WIB`),
    h('dt', null, 'Oleh'), h('dd', null, actorLabel(r)),
    r.division_name ? [h('dt', null, 'Divisi'), h('dd', null, r.division_name)] : null,
    isProgram ? [h('dt', null, 'Program'), h('dd', null, `${p.nama_program || '-'}${p.periode_bulan ? ` · ${monthName(p.periode_bulan)}` : ''}`)] : null,
    isProgram ? [h('dt', null, 'Total'), h('dd', null, r.old_data && r.new_data && Number(r.old_data.total) !== Number(r.new_data.total)
      ? [formatRupiah(r.old_data.total), ' → ', h('b', null, formatRupiah(r.new_data.total))]
      : formatRupiah(p.total))] : null,
    r.reason ? [h('dt', null, 'Alasan'), h('dd', null, reasons && reasons.length > 1 ? h('ul', { class: 'log-reasons' }, reasons.map((x) => h('li', null, x))) : r.reason)] : null);

  const raw = { waktu: formatDateTime(r.occurred_at), aktor: r.actor_name, peran: r.actor_role, aksi: r.action, alasan: r.reason, sebelum: r.old_data, sesudah: r.new_data };
  openDialog({
    title: `${ACTIONS[r.action] || r.action} · ${formatDateTime(r.occurred_at)}`,
    wide: true,
    body: h('div', { class: 'log-detail' },
      summary,
      ...(isProgram ? programBody(r) : otherBody(r)),
      h('details', { class: 'tech-data' },
        h('summary', null, 'Data teknis (untuk pemulihan manual)'),
        h('pre', { class: 'json-view' }, JSON.stringify(raw, null, 2)))),
    actions: [{ label: 'Tutup', value: true, variant: 'primary', autofocus: true }],
  });
}
