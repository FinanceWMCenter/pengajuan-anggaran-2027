// Log riwayat (F-05): siapa, kapan, apa, alasan. Hanya bisa dibaca, tidak bisa diubah.

import { h, formatDateTime, formatRupiah, monthName } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { refresh } from '../router.js';
import { pageHead, dataTable, errorBlock, loadingBlock } from '../ui/components.js';
import { openDialog } from '../ui/dialog.js';

const ACTIONS = {
  create: 'Buat draft', update: 'Ubah', submit: 'Submit', delete: 'Hapus', pin_reset: 'Atur/reset PIN',
  master_pin_change: 'Ganti master PIN', category_change: 'Ubah kategori', export: 'Export',
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
        { label: 'Aksi', render: (r) => h('span', { class: `wm-badge${r.action === 'delete' ? ' is-critical' : r.action === 'submit' ? ' is-good' : ''}` }, ACTIONS[r.action] || r.action) },
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
  if (r.entity_type === 'settings') return 'Master PIN diganti';
  return r.entity_id || '';
}

function showDetail(r) {
  const data = { waktu: formatDateTime(r.occurred_at), aktor: r.actor_name, peran: r.actor_role, aksi: r.action, alasan: r.reason, sebelum: r.old_data, sesudah: r.new_data };
  openDialog({
    title: `${ACTIONS[r.action] || r.action} · ${formatDateTime(r.occurred_at)}`,
    description: 'Snapshot data sebelum dan sesudah (untuk pemulihan manual bila diperlukan).',
    wide: true,
    body: h('pre', { class: 'json-view' }, JSON.stringify(data, null, 2)),
    actions: [{ label: 'Tutup', value: true, variant: 'primary', autofocus: true }],
  });
}
