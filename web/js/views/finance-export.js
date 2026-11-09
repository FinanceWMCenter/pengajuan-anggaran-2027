// Export Excel/CSV (F-06). Data dihitung di database; sel diberi pengaman formula injection (S-11).

import { h, icon, formatRupiah } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { pageHead, flash, setLoading } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { exportRows } from '../excel.js';

const COLUMNS = [
  { label: 'Divisi', value: (r) => r.divisi, width: 24 },
  { label: 'Grup', value: (r) => r.grup, width: 20 },
  { label: 'Nama Program', value: (r) => r.nama_program, width: 36 },
  { label: 'Kategori Program', value: (r) => r.kategori_program, width: 22 },
  { label: 'Bulan', value: (r) => r.bulan, width: 7 },
  { label: 'Kuartal', value: (r) => r.kuartal, width: 8 },
  { label: 'PIC', value: (r) => r.pic, width: 18 },
  { label: 'Status', value: (r) => r.status, width: 10 },
  { label: 'Tanggal Pengajuan', value: (r) => r.tanggal_pengajuan, width: 14 },
  { label: 'Kategori Baris', value: (r) => r.kategori_baris, width: 22 },
  { label: 'Uraian', value: (r) => r.uraian, width: 36 },
  { label: 'Qty', value: (r) => (r.qty === null ? null : Number(r.qty)), width: 8 },
  { label: 'Satuan', value: (r) => r.satuan, width: 10 },
  { label: 'Harga Satuan', value: (r) => (r.harga_satuan === null ? null : Number(r.harga_satuan)), width: 14 },
  { label: 'Subtotal', value: (r) => (r.subtotal === null ? null : Number(r.subtotal)), width: 14 },
  { label: 'Catatan', value: (r) => r.catatan, width: 30 },
];

export async function financeExportView(main) {
  main.append(pageHead({ title: 'Export Data', subtitle: 'Unduh seluruh data program dan baris kebutuhan (satu baris per kebutuhan)' }));

  const status = h('select', { class: 'wm-select', id: 'ex-status' },
    h('option', { value: 'diajukan' }, 'Hanya Diajukan (sesuai Overview)'),
    h('option', { value: 'all' }, 'Semua (Diajukan + Draft)'),
    h('option', { value: 'draft' }, 'Hanya Draft'));
  const result = h('div', null);
  const xlsxBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-primary', onclick: (e) => run('xlsx', e.currentTarget) }, icon('download'), 'Unduh Excel (.xlsx)');
  const csvBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-outline', onclick: (e) => run('csv', e.currentTarget) }, icon('sheet'), 'Unduh CSV');

  main.append(
    h('section', { class: 'wm-card' },
      h('div', { class: 'wm-form-grid cols-2' },
        h('div', { class: 'wm-field' }, h('label', { class: 'wm-label', for: 'ex-status' }, 'Data yang diunduh'), status,
          h('p', { class: 'wm-hint' }, 'Kolom: divisi, grup, nama program, kategori program, bulan, kuartal, PIC, status, tanggal pengajuan, kategori baris, uraian, qty, satuan, harga, subtotal, catatan.'))),
      h('div', { class: 'form-actions' }, csvBtn, xlsxBtn)),
    result,
    flash('info', 'Export juga berfungsi sebagai cadangan mingguan yang mudah dibaca. Untuk cadangan lengkap database, ikuti panduan backup (pg_dump) di 08_SETUP_GUIDE.md.'),
  );

  async function run(format, btn) {
    setLoading(btn, true);
    try {
      const rows = await rpc('rpc_f_export', { p_filters: { status: status.value } });
      const total = rows.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
      const stamp = new Date().toISOString().slice(0, 10);
      await exportRows(rows, COLUMNS, format, `Anggaran2027_${status.value}_${stamp}`);
      result.replaceChildren(flash('success', `File berisi ${rows.length.toLocaleString('id-ID')} baris dengan total subtotal ${formatRupiah(total)}. Export tercatat di log.`));
      toast('File sedang diunduh.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setLoading(btn, false);
    }
  }
}
