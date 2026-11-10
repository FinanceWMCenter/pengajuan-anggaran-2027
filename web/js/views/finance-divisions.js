// Divisi & PIN (F-02): atur/reset PIN divisi (6 digit), ganti PIN Finance (6 digit). Semua PIN unik (D-38).
// PIN baru ditampilkan SATU KALI. Database hanya menyimpan hash; PIN lama tidak bisa dilihat.

import { h, icon, formatRupiah, formatDateTime, randomDigits } from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { refresh } from '../router.js';
import { pageHead, dataTable, errorBlock, loadingBlock, flash, setLoading } from '../ui/components.js';
import { openDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export async function financeDivisionsView(main) {
  main.append(pageHead({ title: 'Divisi & PIN', subtitle: 'Atur PIN tiap divisi dan PIN Finance. Setiap PIN unik karena PIN menentukan siapa yang masuk.' }));
  const body = h('div', { class: 'stack' }, loadingBlock());
  main.append(body);

  let divisions;
  try {
    divisions = await rpc('rpc_f_list_divisions');
  } catch (e) {
    body.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  body.replaceChildren(
    flash('info', 'PIN divisi dibagikan TERPISAH dari link portal (mis. lewat WhatsApp pribadi ke PIC). Mengganti PIN otomatis mengeluarkan semua orang yang sedang masuk di divisi itu.'),
    h('section', { class: 'wm-card card-table' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'wm-card-title' }, 'PIN divisi'), h('p', { class: 'wm-card-subtitle' }, `${divisions.length} divisi`))),
      dataTable({
        caption: 'Daftar divisi dan status PIN',
        columns: [
          { label: 'Divisi', cls: 'cell-start cell-name', render: (d) => h('a', { href: `#/d/${d.code}` }, d.name) },
          { label: 'Grup', cls: 'cell-start', render: (d) => d.group_name },
          { label: 'Diajukan', render: (d) => String(d.count_diajukan) },
          { label: 'Draft', render: (d) => String(d.count_draft) },
          { label: 'Total diajukan', cls: 'cell-num', render: (d) => formatRupiah(d.total_diajukan) },
          { label: 'PIN', render: (d) => (d.has_pin ? h('span', { class: 'wm-badge is-good' }, 'Sudah diatur') : h('span', { class: 'wm-badge is-warning' }, 'Belum ada')) },
          { label: 'PIN terakhir diganti', cls: 'nowrap', render: (d) => formatDateTime(d.pin_updated_at) },
          { label: 'Terakhir masuk', cls: 'nowrap', render: (d) => formatDateTime(d.last_login_at) },
          { label: 'Aksi', cls: 'cell-actions', render: (d) => h('button', { type: 'button', class: 'wm-btn-text', onclick: () => setDivisionPin(d) }, d.has_pin ? 'Reset PIN' : 'Atur PIN') },
        ],
        rows: divisions,
      })),
    masterPinCard(),
  );
}

async function setDivisionPin(d) {
  const input = h('input', {
    class: 'wm-input num', id: 'new-pin', type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'off',
    value: randomDigits(6), 'aria-describedby': 'new-pin-hint new-pin-err',
  });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); err.textContent = ''; input.classList.remove('is-invalid'); });
  const err = h('p', { class: 'wm-error', id: 'new-pin-err', role: 'alert' });
  const body = h('div', { class: 'stack-sm' },
    h('div', { class: 'wm-field' },
      h('label', { class: 'wm-label', for: 'new-pin' }, 'PIN baru (6 digit angka)', h('span', { class: 'wm-required' }, '*wajib')),
      h('div', { class: 'row' }, input, h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => { input.value = randomDigits(6); } }, icon('refresh'), 'Acak')),
      h('p', { class: 'wm-hint', id: 'new-pin-hint' }, 'Disarankan memakai PIN acak. PIN harus berbeda dari PIN divisi lain dan PIN Finance, karena PIN menentukan divisi saat masuk.'),
      err));

  const fail = (msg) => {
    err.textContent = msg;
    input.classList.add('is-invalid');
    input.focus();
    return false;
  };
  let saved = null;
  const choice = await openDialog({
    title: `${d.has_pin ? 'Reset' : 'Atur'} PIN ${d.name}`,
    description: d.has_pin ? 'PIN lama langsung tidak berlaku dan semua sesi divisi ini dikeluarkan.' : 'Buat PIN untuk divisi ini.',
    body,
    actions: [
      { label: 'Batal', value: null },
      {
        label: 'Simpan PIN', value: 'ok', variant: 'primary',
        validate: async () => {
          if (!/^\d{6}$/.test(input.value)) return fail('PIN harus 6 digit angka.');
          try {
            await rpc('rpc_f_set_division_pin', { p_division_id: d.id, p_new_pin: input.value });
            saved = input.value;
            return true;
          } catch (e) {
            return fail(e instanceof ApiError ? e.message : errorMessage(e)); // mis. PIN sudah dipakai: dialog tetap terbuka
          }
        },
      },
    ],
  });
  if (choice !== 'ok' || !saved) return;
  await showPinOnce(`PIN baru ${d.name}`, saved);
  refresh();
}

async function showPinOnce(title, pin) {
  const copyBtn = h('button', {
    type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm',
    onclick: async () => {
      try { await navigator.clipboard.writeText(pin); toast('PIN disalin.', 'success'); } catch { toast('Tidak bisa menyalin otomatis. Catat secara manual.', 'warning'); }
    },
  }, icon('copy'), 'Salin PIN');
  await alertDialog({
    title,
    message: 'PIN ini hanya tampil SEKALI. Simpan di password manager, lalu bagikan ke PIC secara pribadi (terpisah dari link portal).',
    body: h('div', null, h('div', { class: 'pin-reveal', 'aria-label': `PIN: ${pin.split('').join(' ')}` }, pin), h('div', { class: 'row' }, copyBtn)),
    okLabel: 'Sudah saya catat',
  });
}

function masterPinCard() {
  // PIN lama boleh 6-8 digit (PIN Finance lama dulu 8 digit); PIN baru selalu 6 digit (D-38)
  const mk = (id, label, max) => {
    const input = h('input', { class: 'wm-input num', id, type: 'password', inputmode: 'numeric', maxlength: max, autocomplete: 'off' });
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, max); });
    return { input, field: h('div', { class: 'wm-field' }, h('label', { class: 'wm-label', for: id }, label, h('span', { class: 'wm-required' }, '*wajib')), input) };
  };
  const oldPin = mk('m-old', 'PIN Finance saat ini', 8);
  const newPin = mk('m-new', 'PIN Finance baru (6 digit)', 6);
  const confirmPin = mk('m-confirm', 'Ulangi PIN Finance baru', 6);
  const err = h('p', { class: 'wm-error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'wm-btn wm-btn-primary' }, icon('key'), 'Ganti PIN Finance');
  const form = h('form', { class: 'stack-sm', novalidate: true },
    h('div', { class: 'wm-form-grid cols-2' }, oldPin.field, h('div', null), newPin.field, confirmPin.field),
    err, h('div', { class: 'form-actions' }, btn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!/^\d{6,8}$/.test(oldPin.input.value)) { err.textContent = 'Isi PIN Finance saat ini.'; oldPin.input.focus(); return; }
    if (!/^\d{6}$/.test(newPin.input.value)) { err.textContent = 'PIN Finance baru harus 6 digit angka.'; newPin.input.focus(); return; }
    if (newPin.input.value !== confirmPin.input.value) { err.textContent = 'Ulangan PIN Finance baru tidak sama.'; confirmPin.input.focus(); return; }
    setLoading(btn, true);
    try {
      await rpc('rpc_f_set_master_pin', { p_old_pin: oldPin.input.value, p_new_pin: newPin.input.value });
      [oldPin, newPin, confirmPin].forEach((x) => { x.input.value = ''; });
      toast('PIN Finance berhasil diganti. Sesi Finance lain sudah dikeluarkan.', 'success');
    } catch (ex) {
      err.textContent = ex instanceof ApiError ? ex.message : errorMessage(ex);
    } finally {
      setLoading(btn, false);
    }
  });
  return h('section', { class: 'wm-card' },
    h('div', { class: 'card-head' }, h('div', null,
      h('h2', { class: 'wm-card-title' }, 'PIN Finance'),
      h('p', { class: 'wm-card-subtitle' }, 'Ganti PIN Finance awal setelah go-live, dan ganti berkala. Jangan dibagikan.'))),
    form);
}
