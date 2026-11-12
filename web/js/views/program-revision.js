// Revisi item oleh Finance dan tampilan riwayat per item (D-43).
// Perubahan dikumpulkan dulu di layar, lalu dikirim sekaligus lewat "Submit Revisi". Database tetap penentu akhir.

import { h, formatRupiah, formatNumber, formatDateTime, parseQty, computeSubtotal, LIMITS } from '../utils.js';
import { openDialog, reasonDialog, alertDialog } from '../ui/dialog.js';
import { moneyInput } from '../ui/inputs.js';
import { fromServerItem, validateItem } from './program-form.js';

const REASON_MIN = 10;
const REASON_MAX = 500;

// ---------------------------------------------------------------------------
// Riwayat per item
// ---------------------------------------------------------------------------
const TYPE_LABEL = { ubah: 'Diubah', tambah: 'Ditambahkan', hapus: 'Dihapus' };
const empty = (v) => v === null || v === undefined || v === '';
const text = (v) => (empty(v) ? '(kosong)' : String(v));
const num = (v) => (empty(v) ? '(kosong)' : formatNumber(v));
const money = (v) => (empty(v) ? '(kosong)' : formatRupiah(v));

const FIELDS = [
  { key: 'uraian', label: 'Uraian', fmt: text },
  { key: 'item_category_id', show: 'item_category_name', label: 'Kategori', fmt: text },
  { key: 'qty', label: 'Qty', fmt: num },
  { key: 'satuan', label: 'Satuan', fmt: text },
  { key: 'harga_satuan', label: 'Harga satuan', fmt: money },
  { key: 'subtotal', label: 'Subtotal', fmt: money },
  { key: 'catatan', label: 'Catatan', fmt: text },
];

export function changeLines(entry) {
  const o = entry.old_data || {};
  const n = entry.new_data || {};
  return FIELDS
    .filter((f) => (o[f.key] ?? null) !== (n[f.key] ?? null))
    .map((f) => h('div', { class: 'history-change' },
      h('span', { class: 'muted' }, `${f.label}: `),
      f.fmt(o[f.show || f.key]), ' → ', h('b', null, f.fmt(n[f.show || f.key]))));
}

export function itemLine(d) {
  return h('div', { class: 'history-change' },
    `${text(d.uraian)} · ${text(d.item_category_name)} · ${num(d.qty)} ${text(d.satuan)} × ${money(d.harga_satuan)} = `,
    h('b', null, money(d.subtotal)));
}

export function historyList(entries) {
  return h('ul', { class: 'history-list' }, entries.map((e) => h('li', null,
    h('div', { class: 'history-meta' },
      h('b', null, e.actor_label), ` · ${formatDateTime(e.occurred_at)} WIB · `, TYPE_LABEL[e.change_type] || e.change_type),
    e.change_type === 'ubah' ? changeLines(e) : itemLine(e.new_data || e.old_data || {}),
    e.reason ? h('div', { class: 'history-reason' }, h('span', { class: 'muted' }, 'Alasan: '), e.reason) : null)));
}

/** Kelompokkan riwayat per item_id (urutan terbaru dulu tetap dipertahankan). */
export function groupHistory(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.item_id)) map.set(e.item_id, []);
    map.get(e.item_id).push(e);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Kumpulan revisi yang belum dikirim
// ---------------------------------------------------------------------------
let addSeq = 0;

function clean(form) {
  const q = parseQty(form.qty);
  return {
    uraian: String(form.uraian || '').trim(),
    item_category_id: form.item_category_id ? Number(form.item_category_id) : null,
    qty: q === null || Number.isNaN(q) ? null : q,
    satuan: String(form.satuan || '').trim(),
    harga_satuan: form.harga_satuan ?? null,
    catatan: String(form.catatan || '').trim(),
  };
}

const sameItem = (a, b) => ['uraian', 'item_category_id', 'qty', 'satuan', 'harga_satuan', 'catatan']
  .every((k) => (a[k] ?? '') === (b[k] ?? ''));

/**
 * @param {object} o
 * @param {object} o.program program dari server
 * @param {object} o.master daftar kategori
 * @param {Function} o.onChange dipanggil setiap daftar revisi berubah
 */
export function createRevision({ program, master, onChange }) {
  const edits = new Map();   // id item -> {op:'ubah', item, view, reason} atau {op:'hapus', reason}
  const added = [];          // {key, item, view, reason}

  const categoryName = (id) => master.item_categories.find((c) => c.id === Number(id))?.name || null;
  const viewOf = (item) => ({ ...item, item_category_name: categoryName(item.item_category_id), subtotal: computeSubtotal(item.qty, item.harga_satuan) });
  const count = () => edits.size + added.length;
  const removedCount = () => [...edits.values()].filter((e) => e.op === 'hapus').length;
  const finalCount = () => program.items.length - removedCount() + added.length;

  function previewTotal() {
    let total = Number(program.total);
    for (const it of program.items) {
      const e = edits.get(it.id);
      if (e?.op === 'hapus') total -= Number(it.subtotal);
      else if (e?.op === 'ubah') total += e.view.subtotal - Number(it.subtotal);
    }
    return added.reduce((s, a) => s + a.view.subtotal, total);
  }

  /** Dialog isi item + alasan. Hasil {item, reason} atau null bila dibatalkan. */
  function itemDialog({ title, description, initial, original = null, reason = '', keepCategory = null }) {
    const form = { ...initial };
    const allowed = new Set(master.item_categories.filter((c) => c.is_active || c.id === keepCategory).map((c) => c.id));
    const uid = Math.random().toString(36).slice(2, 8);
    const errs = {};
    const errEl = (f) => { errs[f] = h('p', { class: 'wm-error', role: 'alert' }); return errs[f]; };
    const field = (id, label, input, err, required = true, extra = null) => h('div', { class: 'wm-field' },
      h('label', { class: 'wm-label', for: `${id}-${uid}` }, label, required ? h('span', { class: 'wm-required' }, '*wajib') : null), input, extra, err);

    const subtotal = h('b', { class: 'num' });
    const refreshSubtotal = () => {
      const q = parseQty(form.qty);
      subtotal.textContent = formatRupiah(q === null || Number.isNaN(q) ? 0 : computeSubtotal(q, form.harga_satuan ?? 0));
    };
    const onInput = (key, el, get) => el.addEventListener('input', () => {
      form[key] = get();
      if (errs[key]) errs[key].textContent = '';
      el.classList.remove('is-invalid');
      refreshSubtotal();
    });

    const uraian = h('input', { class: 'wm-input', id: `r-uraian-${uid}`, type: 'text', maxlength: LIMITS.uraianMax, value: form.uraian });
    const kategori = h('select', { class: 'wm-select', id: `r-kategori-${uid}` }, h('option', { value: '' }, 'Pilih kategori'),
      master.item_categories.filter((c) => allowed.has(c.id)).map((c) => h('option', { value: String(c.id) }, c.is_active ? c.name : `${c.name} (nonaktif)`)));
    kategori.value = form.item_category_id ? String(form.item_category_id) : '';
    const qty = h('input', { class: 'wm-input num', id: `r-qty-${uid}`, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: form.qty });
    const satuan = h('input', { class: 'wm-input', id: `r-satuan-${uid}`, type: 'text', maxlength: LIMITS.satuanMax, value: form.satuan });
    const harga = moneyInput({
      value: form.harga_satuan, id: `r-harga-${uid}`,
      onChange: (v) => { form.harga_satuan = v; if (errs.harga_satuan) errs.harga_satuan.textContent = ''; harga.classList.remove('is-invalid'); refreshSubtotal(); },
    });
    const catatan = h('input', { class: 'wm-input', id: `r-catatan-${uid}`, type: 'text', maxlength: LIMITS.catatanMax, value: form.catatan });
    const alasan = h('textarea', { class: 'wm-textarea', id: `r-alasan-${uid}`, rows: 3, maxlength: REASON_MAX });
    alasan.value = reason;
    const inputs = { uraian, item_category_id: kategori, qty, satuan, harga_satuan: harga, catatan };

    onInput('uraian', uraian, () => uraian.value);
    kategori.addEventListener('change', () => { form.item_category_id = kategori.value ? Number(kategori.value) : null; errs.item_category_id.textContent = ''; kategori.classList.remove('is-invalid'); });
    onInput('qty', qty, () => qty.value);
    onInput('satuan', satuan, () => satuan.value);
    onInput('catatan', catatan, () => catatan.value);
    alasan.addEventListener('input', () => { errs.reason.textContent = ''; alasan.classList.remove('is-invalid'); });
    refreshSubtotal();

    const formError = h('p', { class: 'wm-error', role: 'alert' });
    const body = h('div', { class: 'stack-sm' },
      h('div', { class: 'wm-form-grid cols-2' },
        field('r-uraian', 'Uraian kebutuhan', uraian, errEl('uraian')),
        field('r-kategori', 'Kategori', kategori, errEl('item_category_id')),
        field('r-qty', 'Qty', qty, errEl('qty')),
        field('r-satuan', 'Satuan', satuan, errEl('satuan')),
        field('r-harga', 'Harga satuan (Rp)', harga, errEl('harga_satuan')),
        field('r-catatan', 'Catatan', catatan, errEl('catatan'), false)),
      h('p', { class: 'revise-subtotal' }, 'Subtotal: ', subtotal),
      field('r-alasan', 'Alasan revisi', alasan, errEl('reason'), true, h('p', { class: 'wm-hint' }, `Minimal ${REASON_MIN} karakter. Alasan ini terlihat oleh divisi.`)),
      formError);

    const validate = () => {
      formError.textContent = '';
      const e = validateItem(form, true, allowed);
      for (const [k, msg] of Object.entries(e)) { errs[k].textContent = msg; inputs[k].classList.add('is-invalid'); }
      let ok = Object.keys(e).length === 0;
      if (alasan.value.trim().length < REASON_MIN) {
        errs.reason.textContent = `Alasan wajib diisi minimal ${REASON_MIN} karakter.`;
        alasan.classList.add('is-invalid');
        ok = false;
      }
      if (ok && original && sameItem(clean(form), original)) {
        formError.textContent = 'Belum ada yang diubah pada item ini.';
        ok = false;
      }
      if (!ok) body.querySelector('.is-invalid')?.focus();
      return ok;
    };

    return openDialog({
      title, description, body, wide: true,
      actions: [{ label: 'Batal', value: null }, { label: 'Simpan ke daftar revisi', value: 'ok', variant: 'primary', validate }],
    }).then((v) => (v === 'ok' ? { item: clean(form), reason: alasan.value.trim() } : null));
  }

  /** Item server dalam bentuk yang sama dengan hasil clean(), untuk membandingkan "sudah berubah atau belum". */
  const originalOf = (it) => clean(fromServerItem(it));

  async function reviseItem(it) {
    const pending = edits.get(it.id);
    const res = await itemDialog({
      title: 'Revisi item',
      description: it.uraian || '',
      initial: fromServerItem(pending?.op === 'ubah' ? { ...it, ...pending.item } : it),
      original: originalOf(it),
      reason: pending?.reason || '',
      keepCategory: it.item_category_id,
    });
    if (!res) return;
    edits.set(it.id, { op: 'ubah', item: res.item, view: viewOf(res.item), reason: res.reason });
    onChange();
  }

  async function removeItem(it) {
    if (finalCount() <= 1) {
      await alertDialog({ title: 'Item tidak bisa dihapus', message: 'Program harus punya minimal satu item. Bila programnya dibatalkan, gunakan tombol Hapus program.' });
      return;
    }
    const reason = await reasonDialog({
      title: 'Hapus item?',
      message: `"${it.uraian}" akan dihapus setelah Anda klik Submit Revisi.`,
      label: 'Alasan revisi',
      confirmLabel: 'Tandai hapus',
    });
    if (reason === null) return;
    edits.set(it.id, { op: 'hapus', reason });
    onChange();
  }

  function undoItem(id) {
    edits.delete(id);
    onChange();
  }

  async function addItem() {
    if (finalCount() >= LIMITS.maxRows) {
      await alertDialog({ title: 'Baris sudah penuh', message: `Maksimal ${LIMITS.maxRows} baris per program.` });
      return;
    }
    const res = await itemDialog({
      title: 'Tambah item',
      initial: { uraian: '', item_category_id: null, qty: '', satuan: '', harga_satuan: null, catatan: '' },
    });
    if (!res) return;
    addSeq += 1;
    added.push({ key: `a${addSeq}`, item: res.item, view: viewOf(res.item), reason: res.reason });
    onChange();
  }

  async function editAdded(key) {
    const a = added.find((x) => x.key === key);
    const res = await itemDialog({
      title: 'Ubah item baru',
      initial: fromServerItem(a.item),
      reason: a.reason,
      keepCategory: a.item.item_category_id,
    });
    if (!res) return;
    a.item = res.item;
    a.view = viewOf(res.item);
    a.reason = res.reason;
    onChange();
  }

  function undoAdded(key) {
    added.splice(added.findIndex((x) => x.key === key), 1);
    onChange();
  }

  function payload() {
    return [
      ...[...edits.entries()].map(([id, e]) => (e.op === 'hapus'
        ? { op: 'hapus', id, reason: e.reason }
        : { op: 'ubah', id, reason: e.reason, item: e.item })),
      ...added.map((a) => ({ op: 'tambah', reason: a.reason, item: a.item })),
    ];
  }

  function clear() {
    edits.clear();
    added.length = 0;
  }

  return { edits, added, count, previewTotal, reviseItem, removeItem, undoItem, addItem, editAdded, undoAdded, payload, clear };
}
