// Aksi program yang dipakai di beberapa halaman: hapus (divisi: konfirmasi; Finance: alasan wajib).

import { h, formatRupiah, monthName } from '../utils.js';
import { rpc, errorMessage } from '../api.js';
import { confirmDialog, reasonDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { isFinance } from '../session.js';

/** @returns {Promise<boolean>} true bila terhapus */
export async function deleteProgram(program) {
  const summary = h('dl', { class: 'dialog-summary' },
    h('dt', null, 'Program'), h('dd', null, program.nama_program),
    program.division_name ? [h('dt', null, 'Divisi'), h('dd', null, program.division_name)] : null,
    h('dt', null, 'Periode'), h('dd', null, monthName(program.periode_bulan, 2027)),
    h('dt', null, 'Total'), h('dd', null, formatRupiah(program.total)));

  let reason = null;
  if (isFinance()) {
    reason = await reasonDialog({
      title: 'Hapus program ini?',
      message: 'Sebagai Finance, alasan penghapusan wajib diisi dan tercatat di log. Tindakan ini tidak bisa dibatalkan dari layar ini.',
      label: 'Alasan penghapusan',
      confirmLabel: 'Hapus program',
    });
    if (reason === null) return false;
  } else {
    const ok = await confirmDialog({
      title: 'Hapus program ini?',
      message: 'Hapus program ini? Tindakan ini tercatat di log dan tidak bisa dibatalkan dari layar ini.',
      body: summary,
      confirmLabel: 'Hapus program',
      danger: true,
    });
    if (!ok) return false;
  }

  try {
    await rpc('rpc_delete_program', { p_id: program.id, p_reason: reason });
    toast(`Program "${program.nama_program}" sudah dihapus.`, 'success');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}
