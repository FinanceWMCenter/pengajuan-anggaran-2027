// Kategori (F-07): tambah kategori baru, aktif/nonaktifkan. Tidak ada hapus atau ganti nama (D-31). Tidak ada "Lain-lain".

import { h, icon } from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { getMaster } from '../store.js';
import { refresh } from '../router.js';
import { pageHead, dataTable, errorBlock, loadingBlock, activeBadge, flash } from '../ui/components.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export async function financeMasterView(main) {
  main.append(pageHead({ title: 'Kategori', subtitle: 'Kategori program dan kategori baris kebutuhan' }));
  const body = h('div', { class: 'stack' }, loadingBlock());
  main.append(body);

  let master;
  try {
    master = await getMaster({ refresh: true });
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  body.replaceChildren(
    flash('info', 'Kategori tidak bisa dihapus atau diganti nama agar data lama tetap konsisten. Kategori yang dinonaktifkan tidak muncul di pilihan baru, tetapi tetap tampil di program lama. Kategori "Lain-lain" tidak diperbolehkan.'),
    h('div', { class: 'grid-2' },
      categoryCard('program', 'Kategori program', 'Dipilih di langkah 1 (Event, Training, …)', master.program_categories),
      categoryCard('item', 'Kategori baris kebutuhan', 'Dipilih per baris di tabel kebutuhan', master.item_categories)),
  );
}

function categoryCard(kind, title, subtitle, rows) {
  const addBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-primary wm-btn-sm', onclick: () => addCategory(kind, title) }, icon('plus'), 'Tambah');
  return h('section', { class: 'wm-card card-table' },
    h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, title), h('p', { class: 'wm-card-subtitle' }, subtitle)), addBtn),
    dataTable({
      caption: title,
      columns: [
        { label: 'Nama', cls: 'cell-start', render: (c) => c.name },
        { label: 'Status', render: (c) => activeBadge(c.is_active) },
        { label: 'Aksi', cls: 'cell-actions', render: (c) => h('button', { type: 'button', class: `wm-btn-text${c.is_active ? ' is-danger' : ''}`, onclick: () => toggle(kind, c) }, c.is_active ? 'Nonaktifkan' : 'Aktifkan') },
      ],
      rows,
      rowClass: (c) => (c.is_active ? null : 'is-dim'),
    }));
}

async function addCategory(kind, title) {
  const input = h('input', { class: 'wm-input', id: 'cat-name', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Contoh: Sertifikasi' });
  const err = h('p', { class: 'wm-error', role: 'alert' });
  input.addEventListener('input', () => { err.textContent = ''; input.classList.remove('is-invalid'); });
  let created = null;
  const result = await openDialog({
    title: `Tambah ${title.toLowerCase()}`,
    description: 'Nama harus spesifik. Setelah dibuat, nama tidak bisa diubah atau dihapus (hanya bisa dinonaktifkan).',
    body: h('div', { class: 'wm-field' }, h('label', { class: 'wm-label', for: 'cat-name' }, 'Nama kategori', h('span', { class: 'wm-required' }, '*wajib')), input, err),
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Simpan', value: 'ok', variant: 'primary',
        validate: async () => {
          const name = input.value.trim();
          if (name.length < 2) { err.textContent = 'Nama kategori minimal 2 karakter.'; input.classList.add('is-invalid'); input.focus(); return false; }
          try {
            created = await rpc('rpc_f_upsert_category', { p_kind: kind, p_id: null, p_name: name, p_is_active: true });
            return true;
          } catch (e) {
            err.textContent = e instanceof ApiError ? e.message : errorMessage(e);
            input.classList.add('is-invalid');
            input.focus();
            return false;
          }
        },
      },
    ],
  });
  if (result === 'ok' && created) {
    toast(`Kategori "${created.name}" ditambahkan.`, 'success');
    refresh();
  }
}

async function toggle(kind, c) {
  const deactivate = c.is_active;
  const ok = await confirmDialog({
    title: `${deactivate ? 'Nonaktifkan' : 'Aktifkan'} "${c.name}"?`,
    message: deactivate
      ? 'Kategori tidak akan muncul di pilihan baru. Program lama yang memakainya tetap aman dan tetap tampil.'
      : 'Kategori akan muncul lagi di pilihan divisi.',
    confirmLabel: deactivate ? 'Nonaktifkan' : 'Aktifkan',
    danger: deactivate,
  });
  if (!ok) return;
  try {
    await rpc('rpc_f_upsert_category', { p_kind: kind, p_id: c.id, p_name: null, p_is_active: !c.is_active });
    toast(`Kategori "${c.name}" ${deactivate ? 'dinonaktifkan' : 'diaktifkan'}.`, 'success');
    refresh();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}
