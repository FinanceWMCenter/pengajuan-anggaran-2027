// Form program 2 langkah (PRD 5.4): 1) Info Program  2) Daftar Kebutuhan.
// Dipakai untuk: tambah baru (#/d/:code/new), duplikat (#/d/:code/new?dari=:id), ubah (#/d/:code/p/:id/edit).
// Fitur: validasi per kolom, autosave lokal, Simpan Draft, Submit, alert program mirip, alert kategori tidak ada,
//        impor file Excel (D-34), peringatan keluar halaman, deteksi konflik edit.

import {
  h, icon, formatRupiah, formatNumber, formatDate, formatDateTime, formatTime, monthName, MONTHS,
  parseQty, computeSubtotal, hasMaxDecimals, debounce, UNIT_SUGGESTIONS, LIMITS,
} from '../utils.js';
import { rpc, errorMessage, ApiError } from '../api.js';
import { getMaster, getYear } from '../store.js';
import { draftKey, readDraft, writeDraft, removeDraft } from '../session.js';
import { navigate, setLeaveGuard, onCleanup, replacePathSilently, refresh } from '../router.js';
import { pageHead, statusBadge, categoryHelp, flash, errorBlock, loadingBlock, setLoading } from '../ui/components.js';
import { moneyInput } from '../ui/inputs.js';
import { openDialog, confirmDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { downloadTemplate, parseImportFile } from '../excel.js';

let keySeq = 0;
const newKey = () => `r${++keySeq}`;

function emptyItem() {
  return { key: newKey(), uraian: '', item_category_id: null, qty: '', satuan: '', harga_satuan: null, catatan: '' };
}

export function fromServerItem(it) {
  return {
    id: it.id ?? null,   // identitas item di database, supaya riwayatnya menyambung (D-43)
    key: newKey(),
    uraian: it.uraian || '',
    item_category_id: it.item_category_id ?? null,
    qty: it.qty === null || it.qty === undefined ? '' : formatNumber(it.qty).replace(/\./g, ''),
    satuan: it.satuan || '',
    harga_satuan: it.harga_satuan ?? null,
    catatan: it.catatan || '',
  };
}

function isEmptyItem(it) {
  return !String(it.uraian || '').trim() && !it.item_category_id && !String(it.qty || '').trim()
    && !String(it.satuan || '').trim() && (it.harga_satuan === null || it.harga_satuan === undefined) && !String(it.catatan || '').trim();
}

function itemSubtotal(it) {
  const q = parseQty(it.qty);
  if (q === null || Number.isNaN(q) || it.harga_satuan === null || it.harga_satuan === undefined) return 0;
  return computeSubtotal(q, it.harga_satuan);
}

// ---------------------------------------------------------------------------
// Validasi (cermin aturan database; database tetap penentu akhir)
// ---------------------------------------------------------------------------
function validateHeader(hd, allowedProgramCats) {
  const e = {};
  const nama = String(hd.nama_program || '').trim();
  if (!nama) e.nama_program = 'Wajib diisi';
  else if (nama.length < LIMITS.namaMin || nama.length > LIMITS.namaMax) e.nama_program = `Nama program ${LIMITS.namaMin}-${LIMITS.namaMax} karakter`;
  if (!hd.program_category_id) e.program_category_id = 'Wajib diisi';
  else if (!allowedProgramCats.has(Number(hd.program_category_id))) e.program_category_id = 'Kategori ini sudah tidak tersedia. Pilih kategori lain.';
  if (!hd.periode_bulan) e.periode_bulan = 'Wajib diisi';
  const pic = String(hd.pic_nama || '').trim();
  if (!pic) e.pic_nama = 'Wajib diisi';
  else if (pic.length < LIMITS.picMin || pic.length > LIMITS.picMax) e.pic_nama = `Nama PIC ${LIMITS.picMin}-${LIMITS.picMax} karakter`;
  return e;
}

export function validateItem(it, full, allowedItemCats) {
  const e = {};
  const uraian = String(it.uraian || '').trim();
  const satuan = String(it.satuan || '').trim();
  const catatan = String(it.catatan || '').trim();
  const qty = parseQty(it.qty);

  if (uraian.length > LIMITS.uraianMax) e.uraian = `Maksimal ${LIMITS.uraianMax} karakter`;
  else if (full && uraian.length < LIMITS.uraianMin) e.uraian = uraian ? `Minimal ${LIMITS.uraianMin} karakter` : 'Wajib diisi';

  if (it.item_category_id && !allowedItemCats.has(Number(it.item_category_id))) e.item_category_id = 'Kategori sudah tidak tersedia';
  else if (full && !it.item_category_id) e.item_category_id = 'Pilih kategori untuk baris ini';

  if (Number.isNaN(qty)) e.qty = 'Harus angka';
  else if (qty !== null && (qty <= 0 || qty > LIMITS.qtyMax)) e.qty = 'Lebih dari 0, maks 100.000';
  else if (qty !== null && !hasMaxDecimals(qty, 2)) e.qty = 'Maksimal 2 desimal';
  else if (full && qty === null) e.qty = 'Wajib diisi';

  if (satuan.length > LIMITS.satuanMax) e.satuan = `Maksimal ${LIMITS.satuanMax} karakter`;
  else if (full && !satuan) e.satuan = 'Wajib diisi';

  if (it.harga_invalid) e.harga_satuan = 'Harga tidak valid';
  else if (it.harga_satuan !== null && it.harga_satuan !== undefined && (it.harga_satuan < 0 || it.harga_satuan > LIMITS.hargaMax)) e.harga_satuan = 'Maksimal Rp1 triliun';
  else if (full && (it.harga_satuan === null || it.harga_satuan === undefined)) e.harga_satuan = 'Wajib diisi';

  if (catatan.length > LIMITS.catatanMax) e.catatan = `Maksimal ${LIMITS.catatanMax} karakter`;
  return e;
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------
export async function programFormView(main, ctx) {
  const code = ctx.params.code;
  const editId = ctx.params.id || null;
  const fromId = editId ? null : (ctx.query.get('dari') || null);
  const base = `#/d/${code}`;

  main.append(loadingBlock('Menyiapkan form…'));

  let master;
  let program = null;
  let year;
  try {
    [master, year] = await Promise.all([getMaster({ refresh: true }), getYear()]);
    if (editId || fromId) program = await rpc('rpc_get_program', { p_id: editId || fromId });
  } catch (e) {
    main.replaceChildren(errorBlock(errorMessage(e), () => refresh()));
    return;
  }

  const isEdit = Boolean(editId);
  const isDuplicate = Boolean(fromId);
  const lsKey = draftKey(code, editId);

  // Kategori yang boleh dipakai: aktif + kategori lama yang sudah melekat di program ini (D-31)
  const origProgramCat = isEdit ? program.program_category_id : null;
  const origItemCats = new Set(isEdit ? program.items.map((i) => i.item_category_id).filter(Boolean) : []);
  const allowedProgramCats = new Set(master.program_categories.filter((c) => c.is_active || c.id === origProgramCat).map((c) => c.id));
  const allowedItemCats = new Set(master.item_categories.filter((c) => c.is_active || origItemCats.has(c.id)).map((c) => c.id));
  const activeItemCats = master.item_categories.filter((c) => c.is_active);

  const state = {
    id: isEdit ? program.id : null,
    status: isEdit ? program.status : 'draft',
    tanggal_pengajuan: isEdit ? program.tanggal_pengajuan : null,
    updated_at: isEdit ? program.updated_at : null,
    header: program ? {
      nama_program: program.nama_program,
      program_category_id: allowedProgramCats.has(program.program_category_id) ? program.program_category_id : null,
      periode_bulan: program.periode_bulan,
      pic_nama: program.pic_nama,
    } : { nama_program: '', program_category_id: null, periode_bulan: null, pic_nama: '' },
    items: program && program.items.length ? program.items.map(fromServerItem) : [emptyItem()],
    step: isEdit ? 2 : 1,
    dirty: false,
    headerErrors: {},
    itemErrors: {},       // key -> {field: msg}
    similar: [],
    similarAckFor: null,  // nama+bulan yang sudah dikonfirmasi "Tetap lanjut"
    busy: false,
  };
  if (isDuplicate) {
    state.items = state.items.map((it) => ({ ...it, id: null, item_category_id: allowedItemCats.has(Number(it.item_category_id)) ? it.item_category_id : null }));
  }
  const submitted = state.status === 'diajukan';

  // ---- Autosave lokal ----
  const autosaveNote = h('span', { class: 'autosave-note', 'aria-live': 'polite' });
  const saveLocal = debounce(() => {
    if (!state.dirty) return;
    const ok = writeDraft(lsKey, {
      saved_at: new Date().toISOString(), program_id: state.id, base_updated_at: state.updated_at,
      header: state.header, items: state.items.map(({ key, ...rest }) => rest), step: state.step,
    });
    if (ok) autosaveNote.textContent = `Tersimpan di perangkat ini pukul ${formatTime()}`;
  }, 800);

  function markDirty() {
    state.dirty = true;
    saveLocal();
  }

  // ---- Penjaga keluar halaman ----
  const beforeUnload = (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  };
  window.addEventListener('beforeunload', beforeUnload);
  onCleanup(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    saveLocal.cancel();
  });
  setLeaveGuard(async () => {
    if (!state.dirty) return true;
    return confirmDialog({
      title: 'Tinggalkan form?',
      message: 'Perubahan belum disimpan ke server. Isian tetap tersimpan di perangkat ini dan bisa dipulihkan saat Anda membuka form ini lagi.',
      confirmLabel: 'Tinggalkan', cancelLabel: 'Tetap di sini',
    });
  });

  // ---- Kerangka ----
  const title = isEdit ? 'Ubah Program' : (isDuplicate ? 'Duplikat Program' : 'Tambah Program');
  const subtitle = isEdit ? program.nama_program : `${ctx.division.name} · Anggaran ${year}`;
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'Langkah pengisian' });
  const banners = h('div', { class: 'stack-sm' });
  const content = h('div', null);
  main.replaceChildren(
    pageHead({ title, subtitle, badge: isEdit ? statusBadge(state.status) : null }),
    stepper, banners, content);

  // Banner: duplikat
  if (isDuplicate) {
    banners.append(flash('info', `Ini salinan dari "${program.nama_program}" (${monthName(program.periode_bulan)}). Ubah periode bulan dan isian lain bila perlu, lalu simpan sebagai program baru.`));
  }
  // Banner: pulihkan draft lokal
  const local = readDraft(lsKey);
  if (local && local.header) {
    const same = JSON.stringify({ h: local.header, i: local.items }) === JSON.stringify({ h: state.header, i: state.items.map(({ key, ...r }) => r) });
    if (same) removeDraft(lsKey);
    else {
      const restoreBanner = flash('warning', [
        h('b', null, 'Ada isian yang belum disimpan ke server'),
        ` dari ${formatDateTime(local.saved_at)} di perangkat ini.`,
        h('div', { class: 'flash-actions' },
          h('button', {
            type: 'button', class: 'wm-btn wm-btn-primary wm-btn-sm',
            onclick: () => {
              state.header = { ...state.header, ...local.header };
              state.items = (local.items && local.items.length ? local.items : [{}]).map((it) => ({ ...emptyItem(), ...it, key: newKey() }));
              if (isEdit && local.base_updated_at) state.updated_at = local.base_updated_at;
              state.step = local.step === 2 && Object.keys(validateHeader(state.header, allowedProgramCats)).length === 0 ? 2 : 1;
              state.dirty = true;
              restoreBanner.remove();
              renderStep();
              toast('Isian dipulihkan. Jangan lupa simpan.', 'info');
            },
          }, 'Pulihkan'),
          h('button', {
            type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm',
            onclick: async () => {
              if (await confirmDialog({ title: 'Buang isian ini?', message: 'Isian yang belum disimpan di perangkat ini akan dihapus.', confirmLabel: 'Buang', danger: true })) {
                removeDraft(lsKey);
                restoreBanner.remove();
              }
            },
          }, 'Buang')),
      ]);
      banners.append(restoreBanner);
    }
  }
  const similarHolder = h('div', null);

  // ---- Alert program mirip (BR-09) ----
  async function checkSimilar() {
    const nama = String(state.header.nama_program || '').trim();
    if (nama.length < LIMITS.namaMin) { state.similar = []; drawSimilar(); return; }
    try {
      state.similar = await rpc('rpc_check_similar', { p_nama: nama, p_bulan: state.header.periode_bulan ? Number(state.header.periode_bulan) : null, p_exclude_id: state.id });
    } catch {
      state.similar = [];
    }
    drawSimilar();
  }
  function similarList() {
    return h('ul', null, state.similar.map((s) => h('li', null,
      `${s.nama_program} (${monthName(s.periode_bulan)}${s.status === 'draft' ? ', draft' : ''})`,
      s.same_month ? h('b', null, ' · bulan sama') : null)));
  }
  function drawSimilar() {
    similarHolder.replaceChildren(state.similar.length
      ? flash('warning', [
        state.similar.length === 1
          ? `Ada program yang mirip: ${state.similar[0].nama_program} (${monthName(state.similar[0].periode_bulan)}). Pastikan ini bukan duplikat.`
          : 'Ada beberapa program yang mirip. Pastikan ini bukan duplikat:',
        state.similar.length > 1 ? similarList() : null,
      ])
      : '');
  }

  // =========================================================================
  // Langkah 1: Info Program
  // =========================================================================
  function renderStep1() {
    const hd = state.header;
    const errs = state.headerErrors;
    const fieldErr = (f) => h('p', { class: 'wm-error', id: `err-${f}`, role: errs[f] ? 'alert' : null }, errs[f] || '');

    const nama = h('input', {
      class: `wm-input${errs.nama_program ? ' is-invalid' : ''}`, id: 'f-nama', type: 'text', maxlength: LIMITS.namaMax,
      value: hd.nama_program, 'aria-describedby': 'err-nama_program', 'aria-invalid': errs.nama_program ? 'true' : null,
      placeholder: 'Contoh: Training Service Excellence Batch 1',
    });
    const progCats = master.program_categories.filter((c) => allowedProgramCats.has(c.id));
    const kategori = h('select', { class: `wm-select${errs.program_category_id ? ' is-invalid' : ''}`, id: 'f-kategori', 'aria-describedby': 'err-program_category_id' },
      h('option', { value: '' }, 'Pilih kategori program'),
      progCats.map((c) => h('option', { value: String(c.id) }, c.is_active ? c.name : `${c.name} (nonaktif)`)));
    kategori.value = hd.program_category_id ? String(hd.program_category_id) : '';
    const bulan = h('select', { class: `wm-select${errs.periode_bulan ? ' is-invalid' : ''}`, id: 'f-bulan', 'aria-describedby': 'err-periode_bulan' },
      h('option', { value: '' }, 'Pilih bulan'),
      MONTHS.map((m, i) => h('option', { value: String(i + 1) }, `${m} ${year}`)));
    bulan.value = hd.periode_bulan ? String(hd.periode_bulan) : '';
    const pic = h('input', {
      class: `wm-input${errs.pic_nama ? ' is-invalid' : ''}`, id: 'f-pic', type: 'text', maxlength: LIMITS.picMax,
      value: hd.pic_nama, 'aria-describedby': 'err-pic_nama', autocomplete: 'name', placeholder: 'Nama penanggung jawab program',
    });
    const tanggal = h('input', {
      class: 'wm-input', id: 'f-tanggal', type: 'text', readOnly: true, tabindex: '-1',
      value: state.tanggal_pengajuan ? `Diajukan pada ${formatDate(state.tanggal_pengajuan, true)}` : 'Terisi otomatis saat Anda submit',
    });

    const nextBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-primary' }, 'Lanjut', icon('chevron-right'));
    const updateNext = () => {
      nextBtn.disabled = Object.keys(validateHeader(state.header, allowedProgramCats)).length > 0;
    };
    const onField = (field, el, getter) => {
      el.addEventListener('input', () => {
        state.header[field] = getter();
        if (state.headerErrors[field]) {
          delete state.headerErrors[field];
          el.classList.remove('is-invalid');
          const pe = document.getElementById(`err-${field}`);
          if (pe) pe.textContent = '';
        }
        markDirty();
        updateNext();
      });
    };
    onField('nama_program', nama, () => nama.value);
    onField('program_category_id', kategori, () => (kategori.value ? Number(kategori.value) : null));
    onField('periode_bulan', bulan, () => (bulan.value ? Number(bulan.value) : null));
    onField('pic_nama', pic, () => pic.value);
    nama.addEventListener('blur', () => {
      const e = validateHeader(state.header, allowedProgramCats).nama_program;
      if (e && nama.value.trim()) {
        state.headerErrors.nama_program = e;
        nama.classList.add('is-invalid');
        document.getElementById('err-nama_program').textContent = e;
      }
      checkSimilar();
    });
    bulan.addEventListener('change', checkSimilar);

    nextBtn.addEventListener('click', async () => {
      const e = validateHeader(state.header, allowedProgramCats);
      if (Object.keys(e).length) {
        state.headerErrors = e;
        renderStep();
        return;
      }
      await checkSimilar();
      const ackKey = `${String(state.header.nama_program).trim().toLowerCase()}|${state.header.periode_bulan}`;
      if (state.similar.length && state.similarAckFor !== ackKey) {
        const choice = await openDialog({
          title: 'Ada program yang mirip',
          description: 'Pastikan program ini bukan duplikat dari program yang sudah ada di divisi Anda.',
          body: similarList(),
          actions: [
            { label: 'Periksa lagi', value: false, autofocus: true },
            { label: 'Tetap lanjut', value: true, variant: 'primary' },
          ],
        });
        if (!choice) return;
        state.similarAckFor = ackKey;
      }
      state.step = 2;
      saveLocal();
      renderStep();
    });

    const field = (id, label, input, err, extra = null, required = true) => h('div', { class: 'wm-field' },
      h('label', { class: 'wm-label', for: id }, label, required ? h('span', { class: 'wm-required' }, '*wajib') : null),
      input, extra, err);

    const card = h('section', { class: 'wm-card', 'aria-labelledby': 'step1-title' },
      h('div', { class: 'card-head' },
        h('div', null, h('h2', { class: 'wm-card-title', id: 'step1-title' }, 'Langkah 1 dari 2: Info Program'),
          h('p', { class: 'wm-card-subtitle' }, 'Semua kolom wajib diisi. Tabel kebutuhan bisa diisi setelah info lengkap.'))),
      h('div', { class: 'wm-form-grid cols-2' },
        field('f-nama', 'Nama event / program', nama, fieldErr('nama_program'), similarHolder),
        field('f-kategori', 'Kategori program', kategori, fieldErr('program_category_id'), categoryHelp(ctx.contacts)),
        field('f-tanggal', 'Tanggal pengajuan', tanggal, null, h('p', { class: 'wm-hint' }, 'Tanggal dikunci dan mengikuti tanggal submit (WIB).'), false),
        field('f-bulan', 'Periode event', bulan, fieldErr('periode_bulan'), h('p', { class: 'wm-hint' }, 'Satu program = satu bulan. Event lintas bulan diinput sebagai beberapa program (pakai Duplikat).')),
        field('f-pic', 'PIC / Penanggung jawab', pic, fieldErr('pic_nama'))),
      h('div', { class: 'form-actions' },
        h('a', { class: 'wm-btn wm-btn-outline', href: isEdit ? `${base}/p/${state.id}` : base }, 'Batal'),
        nextBtn));

    content.replaceChildren(card);
    updateNext();
    drawSimilar();
    const firstErr = card.querySelector('.is-invalid');
    (firstErr || nama).focus();
  }

  // =========================================================================
  // Langkah 2: Daftar Kebutuhan
  // =========================================================================
  let rowsHolder;
  let totalValue;
  let addBtn;
  let errorSummary;
  const rowRefs = new Map(); // key -> {el, subtotal, inputs:{}, errs:{}}

  function renderStep2() {
    const hd = state.header;
    const catName = master.program_categories.find((c) => c.id === Number(hd.program_category_id))?.name || '-';
    const summary = h('section', { class: 'wm-card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'program-summary-line' },
          h('span', null, 'Program: ', h('b', null, hd.nama_program)),
          h('span', null, 'Periode: ', h('b', null, monthName(hd.periode_bulan, year))),
          h('span', null, 'Kategori: ', h('b', null, catName)),
          h('span', null, 'PIC: ', h('b', null, hd.pic_nama))),
        h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => { state.step = 1; renderStep(); } }, icon('pencil'), 'Ubah info')));

    errorSummary = h('div', null);
    rowsHolder = h('div', { class: 'items-body' });

    const fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) importFile(f);
    });
    const templateBtn = h('button', {
      type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm',
      onclick: async (e) => {
        const btn = e.currentTarget;
        setLoading(btn, true);
        try { await downloadTemplate(activeItemCats, ctx.division.name); } catch { toast('Template gagal dibuat. Coba lagi.', 'error'); }
        setLoading(btn, false);
      },
    }, icon('download'), 'Unduh Template Excel');
    const uploadBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => fileInput.click() }, icon('upload'), 'Unggah File Excel');
    addBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: () => addRow(true) }, icon('plus'), 'Tambah baris');

    const editor = h('section', { class: 'items-editor', 'aria-labelledby': 'step2-title' },
      h('div', { class: 'items-scroll' },
        h('div', { class: 'items-inner' },
          h('div', { class: 'items-head', 'aria-hidden': 'true' },
            h('span', null, 'No'), h('span', null, 'Uraian kebutuhan *'), h('span', null, 'Kategori *'), h('span', null, 'Qty *'),
            h('span', null, 'Satuan *'), h('span', null, 'Harga satuan (Rp) *'), h('span', { class: 'item-subtotal' }, 'Subtotal'),
            h('span', null, 'Catatan'), h('span', null, 'Aksi')),
          rowsHolder)),
      h('div', { class: 'items-toolbar' }, addBtn, h('span', { class: 'spacer' }), templateBtn, uploadBtn, fileInput));

    totalValue = h('div', { class: 'total-value', 'aria-live': 'polite' });
    const draftBtn = submitted ? null : h('button', { type: 'button', class: 'wm-btn wm-btn-outline', onclick: (e) => save(false, e.currentTarget) }, 'Simpan Draft');
    const submitBtn = h('button', { type: 'button', class: 'wm-btn wm-btn-primary', onclick: (e) => save(true, e.currentTarget) },
      icon(submitted ? 'check-circle' : 'send'), submitted ? 'Simpan Perubahan' : 'Submit Pengajuan');
    const totalBar = h('div', { class: 'total-bar' },
      h('div', null, h('div', { class: 'total-label' }, 'Total anggaran program'), totalValue, autosaveNote),
      h('div', { class: 'total-actions' },
        h('button', { type: 'button', class: 'wm-btn wm-btn-outline', onclick: () => { state.step = 1; renderStep(); } }, icon('arrow-left'), 'Kembali ke info'),
        draftBtn, submitBtn));

    content.replaceChildren(h('div', { class: 'stack' },
      summary,
      h('div', null,
        h('div', { class: 'card-head' },
          h('div', null,
            h('h2', { class: 'wm-card-title', id: 'step2-title' }, 'Langkah 2 dari 2: Daftar Kebutuhan'),
            h('p', { class: 'wm-card-subtitle' }, submitted
              ? 'Program sudah diajukan. Perubahan harus lengkap dan valid; tanggal pengajuan tidak berubah.'
              : 'Isi baris kebutuhan. Simpan Draft boleh belum lengkap; Submit butuh semua baris lengkap.'))),
        errorSummary,
        editor,
        categoryHelp(ctx.contacts)),
      totalBar));

    drawRows();
  }

  function drawRows() {
    rowRefs.clear();
    rowsHolder.replaceChildren(...state.items.map((it, idx) => makeRow(it, idx)));
    if (state.items.length === 0) rowsHolder.append(h('div', { class: 'items-empty' }, 'Belum ada baris. Klik "Tambah baris" atau unggah file Excel.'));
    updateTotals();
    addBtn.disabled = state.items.length >= LIMITS.maxRows;
  }

  function makeRow(it, idx) {
    const errs = state.itemErrors[it.key] || {};
    const id = (f) => `i-${it.key}-${f}`;
    const errEl = (f) => h('p', { class: 'field-error', id: `${id(f)}-err` }, errs[f] || '');
    const cls = (f, base = 'wm-input') => `${base}${errs[f] ? ' is-invalid' : ''}`;
    const label = (f, text) => h('label', { class: 'cell-label', for: id(f) }, text);

    const uraian = h('input', { class: cls('uraian'), id: id('uraian'), type: 'text', maxlength: LIMITS.uraianMax, value: it.uraian, 'aria-label': `Uraian baris ${idx + 1}`, 'aria-describedby': `${id('uraian')}-err` });
    const itemCats = master.item_categories.filter((c) => c.is_active || (allowedItemCats.has(c.id) && Number(it.item_category_id) === c.id));
    const kategori = h('select', { class: cls('item_category_id', 'wm-select'), id: id('item_category_id'), 'aria-label': `Kategori baris ${idx + 1}`, 'aria-describedby': `${id('item_category_id')}-err` },
      h('option', { value: '' }, 'Pilih kategori'),
      itemCats.map((c) => h('option', { value: String(c.id) }, c.is_active ? c.name : `${c.name} (nonaktif)`)));
    kategori.value = it.item_category_id ? String(it.item_category_id) : '';
    const qty = h('input', { class: `${cls('qty')} num`, id: id('qty'), type: 'text', inputmode: 'decimal', value: it.qty, 'aria-label': `Qty baris ${idx + 1}`, 'aria-describedby': `${id('qty')}-err`, autocomplete: 'off' });
    const satuan = h('input', { class: cls('satuan'), id: id('satuan'), type: 'text', maxlength: LIMITS.satuanMax, value: it.satuan, list: 'satuan-saran', 'aria-label': `Satuan baris ${idx + 1}`, 'aria-describedby': `${id('satuan')}-err` });
    const harga = moneyInput({
      value: it.harga_satuan, id: id('harga_satuan'), ariaLabel: `Harga satuan baris ${idx + 1}`, cls: cls('harga_satuan'),
      onChange: (v) => { it.harga_satuan = v; it.harga_invalid = false; changed('harga_satuan'); },
    });
    harga.setAttribute('aria-describedby', `${id('harga_satuan')}-err`);
    const catatan = h('input', { class: cls('catatan'), id: id('catatan'), type: 'text', maxlength: LIMITS.catatanMax, value: it.catatan, 'aria-label': `Catatan baris ${idx + 1}` });
    const subtotal = h('span', { class: 'num' }, formatRupiah(itemSubtotal(it)));

    const row = h('div', { class: `item-row${Object.keys(errs).length ? ' has-error' : ''}`, role: 'group', 'aria-label': `Baris ${idx + 1}` },
      h('div', { class: 'item-no c-no' }, h('span', { class: 'sr-only' }, 'Baris '), `${idx + 1}`),
      h('div', { class: 'c-uraian' }, label('uraian', 'Uraian kebutuhan *'), uraian, errEl('uraian')),
      h('div', { class: 'c-kategori' }, label('item_category_id', 'Kategori *'), kategori, errEl('item_category_id')),
      h('div', { class: 'c-qty' }, label('qty', 'Qty *'), qty, errEl('qty')),
      h('div', { class: 'c-satuan' }, label('satuan', 'Satuan *'), satuan, errEl('satuan')),
      h('div', { class: 'c-harga' }, label('harga_satuan', 'Harga satuan (Rp) *'), harga, errEl('harga_satuan')),
      h('div', { class: 'item-subtotal c-subtotal' }, h('span', { class: 'cell-label' }, 'Subtotal'), subtotal),
      h('div', { class: 'c-catatan' }, label('catatan', 'Catatan'), catatan, errEl('catatan')),
      h('div', { class: 'item-actions c-actions' },
        h('button', { type: 'button', class: 'icon-btn', title: 'Duplikat baris', 'aria-label': `Duplikat baris ${idx + 1}`, onclick: () => duplicateRow(it.key) }, icon('copy')),
        h('button', { type: 'button', class: 'icon-btn is-danger', title: 'Hapus baris', 'aria-label': `Hapus baris ${idx + 1}`, onclick: () => removeRow(it.key) }, icon('trash'))));

    const inputs = { uraian, item_category_id: kategori, qty, satuan, harga_satuan: harga, catatan };
    function changed(field) {
      const e = state.itemErrors[it.key];
      if (e && e[field]) {
        delete e[field];
        inputs[field].classList.remove('is-invalid');
        const pe = document.getElementById(`${id(field)}-err`);
        if (pe) pe.textContent = '';
        if (Object.keys(e).length === 0) { delete state.itemErrors[it.key]; row.classList.remove('has-error'); }
      }
      subtotal.textContent = formatRupiah(itemSubtotal(it));
      updateTotals();
      markDirty();
    }
    uraian.addEventListener('input', () => { it.uraian = uraian.value; changed('uraian'); });
    kategori.addEventListener('change', () => { it.item_category_id = kategori.value ? Number(kategori.value) : null; changed('item_category_id'); });
    qty.addEventListener('input', () => { it.qty = qty.value; changed('qty'); });
    satuan.addEventListener('input', () => { it.satuan = satuan.value; changed('satuan'); });
    catatan.addEventListener('input', () => { it.catatan = catatan.value; changed('catatan'); });

    // Enter di baris terakhir = tambah baris baru (desktop)
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && state.items[state.items.length - 1] === it) {
        e.preventDefault();
        addRow(true);
      }
    });

    rowRefs.set(it.key, { el: row, inputs });
    return row;
  }

  function updateTotals() {
    const total = state.items.reduce((s, it) => s + itemSubtotal(it), 0);
    if (totalValue) totalValue.textContent = formatRupiah(total);
    return total;
  }

  function addRow(focus) {
    if (state.items.length >= LIMITS.maxRows) {
      toast(`Maksimal ${LIMITS.maxRows} baris per program.`, 'warning');
      return;
    }
    const it = emptyItem();
    state.items.push(it);
    markDirty();
    drawRows();
    if (focus) rowRefs.get(it.key)?.inputs.uraian.focus();
  }

  function duplicateRow(key) {
    if (state.items.length >= LIMITS.maxRows) { toast(`Maksimal ${LIMITS.maxRows} baris per program.`, 'warning'); return; }
    const idx = state.items.findIndex((x) => x.key === key);
    const copy = { ...state.items[idx], id: null, key: newKey() };
    state.items.splice(idx + 1, 0, copy);
    markDirty();
    drawRows();
    rowRefs.get(copy.key)?.inputs.uraian.focus();
  }

  async function removeRow(key) {
    const idx = state.items.findIndex((x) => x.key === key);
    const it = state.items[idx];
    if (!isEmptyItem(it)) {
      const ok = await confirmDialog({ title: `Hapus baris ${idx + 1}?`, message: it.uraian ? `"${it.uraian}" akan dihapus dari tabel.` : 'Baris ini akan dihapus dari tabel.', confirmLabel: 'Hapus baris', danger: true });
      if (!ok) return;
    }
    state.items.splice(idx, 1);
    delete state.itemErrors[key];
    if (state.items.length === 0) state.items.push(emptyItem());
    markDirty();
    drawRows();
  }

  // ---- Impor Excel (D-34) ----
  async function importFile(file) {
    let result;
    try {
      result = await parseImportFile(file, activeItemCats);
    } catch {
      toast('File gagal dibaca. Coba lagi atau gunakan template.', 'error');
      return;
    }
    if (result.errors.length) {
      await alertDialog({ title: 'File tidak bisa dipakai', message: result.errors.join(' ') });
      return;
    }
    if (result.rows.length === 0) {
      await alertDialog({ title: 'Tidak ada baris', message: 'File tidak berisi baris kebutuhan. Isi mulai baris ke-2 di sheet "Kebutuhan".' });
      return;
    }
    const existing = state.items.filter((it) => !isEmptyItem(it));
    let mode = 'replace';
    if (existing.length) {
      mode = await openDialog({
        title: `Muat ${result.rows.length} baris dari file?`,
        description: `Tabel sudah berisi ${existing.length} baris. Pilih cara memuat baris dari file.`,
        actions: [
          { label: 'Batal', value: null },
          { label: 'Ganti semua baris', value: 'replace', variant: 'outline' },
          { label: 'Tambahkan di bawah', value: 'append', variant: 'primary', autofocus: true },
        ],
      });
      if (!mode) return;
    }
    const imported = result.rows.map((r) => ({
      key: newKey(), uraian: r.uraian, item_category_id: r.item_category_id, qty: r.qty, satuan: r.satuan,
      harga_satuan: r.harga_satuan, harga_invalid: r.harga_invalid, catatan: r.catatan, import_notes: r.import_notes,
    }));
    let merged = mode === 'append' ? [...existing, ...imported] : imported;
    let cut = false;
    if (merged.length > LIMITS.maxRows) { merged = merged.slice(0, LIMITS.maxRows); cut = true; }
    state.items = merged;
    // Tandai baris yang belum valid (F-18)
    state.itemErrors = {};
    let bad = 0;
    for (const it of imported) {
      const e = validateItem(it, true, allowedItemCats);
      if (it.import_notes && it.import_notes.length) e.item_category_id = it.import_notes.join('; ');
      if (Object.keys(e).length) { state.itemErrors[it.key] = e; bad += 1; }
    }
    markDirty();
    drawRows();
    showErrorSummary(bad ? `${bad} baris dari file perlu diperbaiki (ditandai merah).` : null);
    toast(`${imported.length} baris dimuat dari file.${cut || result.truncated ? ` Dibatasi ${LIMITS.maxRows} baris.` : ''} Periksa lalu simpan.`, bad ? 'warning' : 'success');
  }

  function showErrorSummary(text) {
    if (!errorSummary) return;
    errorSummary.replaceChildren(text ? flash('error', text) : '');
  }

  // ---- Simpan (draft / submit / simpan perubahan) ----
  // Kunci sejak tombol ditekan sampai selesai (termasuk selama dialog konfirmasi terbuka),
  // supaya klik dobel / ketukan ganda tidak pernah menyimpan dua kali (BUG-021).
  async function save(isSubmit, btn) {
    if (state.busy) return;
    state.busy = true;
    try {
      await doSave(isSubmit, btn);
    } finally {
      state.busy = false;
    }
  }

  async function doSave(isSubmit, btn) {
    const full = isSubmit || submitted;

    const hErr = validateHeader(state.header, allowedProgramCats);
    if (Object.keys(hErr).length) {
      state.headerErrors = hErr;
      state.step = 1;
      renderStep();
      toast('Lengkapi info program dulu.', 'error');
      return;
    }

    const filled = state.items.filter((it) => !isEmptyItem(it));
    state.itemErrors = {};
    let bad = 0;
    for (const it of filled) {
      const e = validateItem(it, full, allowedItemCats);
      if (Object.keys(e).length) { state.itemErrors[it.key] = e; bad += 1; }
    }
    if (full && filled.length === 0) {
      drawRows();
      showErrorSummary('Tambahkan minimal satu kebutuhan sebelum submit');
      toast('Tambahkan minimal satu kebutuhan sebelum submit', 'error');
      return;
    }
    if (bad) {
      drawRows();
      showErrorSummary(`${bad} baris perlu diperbaiki (ditandai merah)${full ? '. Baris tanpa kategori tidak bisa disubmit.' : '.'}`);
      focusFirstError();
      toast('Periksa baris yang ditandai merah.', 'error');
      return;
    }
    showErrorSummary(null);

    if (isSubmit && !submitted) {
      const total = filled.reduce((s, it) => s + itemSubtotal(it), 0);
      const ok = await confirmDialog({
        title: 'Kirim pengajuan?',
        message: 'Setelah dikirim, tanggal pengajuan terkunci pada hari ini. Program masih bisa diubah setelahnya.',
        body: h('dl', { class: 'dialog-summary' },
          h('dt', null, 'Program'), h('dd', null, state.header.nama_program),
          h('dt', null, 'Periode'), h('dd', null, monthName(state.header.periode_bulan, year)),
          h('dt', null, 'Jumlah baris'), h('dd', null, String(filled.length)),
          h('dt', null, 'Total'), h('dd', null, formatRupiah(total))),
        confirmLabel: 'Kirim Pengajuan',
      });
      if (!ok) return;
    }

    const sent = filled;
    const payload = {
      id: state.id,
      expected_updated_at: state.updated_at,
      nama_program: String(state.header.nama_program).trim(),
      program_category_id: Number(state.header.program_category_id),
      periode_bulan: Number(state.header.periode_bulan),
      pic_nama: String(state.header.pic_nama).trim(),
      submit: Boolean(isSubmit),
      items: sent.map((it) => {
        const q = parseQty(it.qty);
        return {
          id: it.id || null,
          uraian: String(it.uraian || '').trim(),
          item_category_id: it.item_category_id ? Number(it.item_category_id) : null,
          qty: q === null || Number.isNaN(q) ? null : q,
          satuan: String(it.satuan || '').trim(),
          harga_satuan: it.harga_satuan ?? null,
          catatan: String(it.catatan || '').trim(),
        };
      }),
    };

    setLoading(btn, true);
    try {
      const res = await rpc('rpc_save_program', { p_payload: payload });
      removeDraft(lsKey);
      state.dirty = false;
      saveLocal.cancel();
      if (isSubmit && !submitted) {
        toast('Pengajuan berhasil dikirim', 'success');
        navigate(`/d/${code}/p/${res.id}`, { force: true });
      } else if (submitted) {
        toast('Perubahan tersimpan', 'success');
        navigate(`/d/${code}/p/${res.id}`, { force: true });
      } else {
        // Draft: tetap di form, alamat berubah ke mode ubah
        const wasNew = !state.id;
        state.id = res.id;
        state.updated_at = res.updated_at;
        state.items = res.items.length ? res.items.map(fromServerItem) : [emptyItem()];
        if (wasNew) {
          removeDraft(draftKey(code, null));
          replacePathSilently(`/d/${code}/p/${res.id}/edit`);
        }
        autosaveNote.textContent = `Draft tersimpan di server pukul ${formatTime()}`;
        drawRows();
        toast('Draft tersimpan. Anda bisa melanjutkannya nanti dari Ringkasan Program.', 'success');
      }
    } catch (e) {
      handleSaveError(e, sent);
    } finally {
      setLoading(btn, false);
    }
  }

  function handleSaveError(e, sent) {
    if (e instanceof ApiError && e.code === 'VALIDATION' && e.field) {
      const m = e.field.match(/^items\.(\d+)\.(\w+)$/);
      if (m) {
        const it = sent[Number(m[1]) - 1];
        if (it) {
          state.itemErrors[it.key] = { ...(state.itemErrors[it.key] || {}), [m[2]]: e.message };
          drawRows();
          showErrorSummary(e.message);
          focusFirstError();
        }
      } else if (['nama_program', 'program_category_id', 'periode_bulan', 'pic_nama'].includes(e.field)) {
        state.headerErrors = { [e.field]: e.message };
        state.step = 1;
        renderStep();
      } else {
        showErrorSummary(e.message);
      }
      toast(e.message, 'error');
      return;
    }
    if (e instanceof ApiError && e.code === 'CONFLICT') {
      saveLocal(); // pastikan isian tersimpan di perangkat
      openDialog({
        title: 'Program sudah diubah orang lain',
        description: 'Program ini sudah diubah oleh orang lain. Muat ulang untuk melihat versi terbaru. Isian Anda tetap tersimpan di perangkat ini dan bisa dipulihkan.',
        actions: [
          { label: 'Tetap di sini', value: false },
          { label: 'Muat ulang', value: true, variant: 'primary', autofocus: true },
        ],
      }).then((reload) => {
        if (reload) { state.dirty = false; refresh(); }
      });
      return;
    }
    if (e instanceof ApiError && e.code === 'NETWORK') saveLocal();
    toast(errorMessage(e), 'error');
  }

  function focusFirstError() {
    for (const it of state.items) {
      const errs = state.itemErrors[it.key];
      if (!errs) continue;
      const ref = rowRefs.get(it.key);
      const field = ['uraian', 'item_category_id', 'qty', 'satuan', 'harga_satuan', 'catatan'].find((f) => errs[f]);
      if (ref && field) {
        ref.inputs[field].focus();
        ref.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
  }

  function renderStep() {
    const s1 = state.step === 1;
    stepper.replaceChildren(
      h('li', { class: s1 ? 'is-active' : 'is-done', 'aria-current': s1 ? 'step' : null }, h('span', { class: 'step-no' }, '1'), 'Info Program'),
      h('li', { class: 'step-sep', 'aria-hidden': 'true' }),
      h('li', { class: s1 ? '' : 'is-active', 'aria-current': s1 ? null : 'step' }, h('span', { class: 'step-no' }, '2'), 'Daftar Kebutuhan'));
    if (s1) renderStep1(); else renderStep2();
    window.scrollTo({ top: 0 });
  }

  // Saran satuan (boleh ketik bebas - A-10)
  main.append(h('datalist', { id: 'satuan-saran' }, UNIT_SUGGESTIONS.map((u) => h('option', { value: u }))));

  renderStep();
  if (isDuplicate) checkSimilar();
}
