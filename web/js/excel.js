// Excel: template + impor file kebutuhan (D-34) dan export data Finance.
// Pustaka SheetJS disimpan di web/vendor (versi dipatok 0.20.3) dan baru dimuat saat dibutuhkan.
// File yang diunggah hanya dibaca di browser; TIDAK dikirim/disimpan di server (D-24).

import { sanitizeCell, parseQty, parseRupiah, normalize, LIMITS } from './utils.js';

let loading = null;

export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX tidak tersedia')));
      s.onerror = () => { loading = null; reject(new Error('Gagal memuat pustaka Excel')); };
      document.head.append(s);
    });
  }
  return loading;
}

export const TEMPLATE_HEADERS = ['Uraian', 'Kategori', 'Qty', 'Satuan', 'Harga Satuan', 'Catatan'];

/** Unduh template Excel kosong untuk diisi divisi. */
export async function downloadTemplate(itemCategories, divisionName) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  ws['!cols'] = [{ wch: 40 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Kebutuhan');

  const cats = XLSX.utils.aoa_to_sheet([['Kategori (salin persis ke kolom Kategori)'], ...itemCategories.map((c) => [c.name])]);
  cats['!cols'] = [{ wch: 44 }];
  XLSX.utils.book_append_sheet(wb, cats, 'Daftar Kategori');

  const guide = XLSX.utils.aoa_to_sheet([
    ['Petunjuk pengisian template kebutuhan'],
    [''],
    ['1. Isi di sheet "Kebutuhan", mulai baris ke-2. Jangan ubah judul kolom di baris 1.'],
    ['2. Uraian: 3-200 karakter. Contoh: Snack peserta pelatihan'],
    ['3. Kategori: pilih persis salah satu nama di sheet "Daftar Kategori". Tidak ada kategori "Lain-lain".'],
    ['4. Qty: angka lebih dari 0, maksimal 2 angka di belakang koma. Contoh: 2 atau 2,5'],
    ['5. Satuan: contoh pcs, paket, orang, hari, kali, unit, bulan, lembar, set, porsi'],
    ['6. Harga Satuan: angka rupiah tanpa titik/Rp juga boleh. Contoh: 150000'],
    ['7. Catatan: opsional, maksimal 300 karakter'],
    [`8. Maksimal ${LIMITS.maxRows} baris per program.`],
    ['9. Di portal: buka langkah 2 (Daftar Kebutuhan) > Unggah File Excel. Periksa baris bertanda merah sebelum menyimpan.'],
    [''],
    ['Kategori tidak ada? Hubungi Finance WM Center (WhatsApp +62 852-8454-5564 / finance@wmcenter.id).'],
  ]);
  guide['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk');

  const safeName = String(divisionName || 'divisi').replace(/[^A-Za-z0-9-]+/g, '_');
  XLSX.writeFile(wb, `Template_Kebutuhan_Anggaran2027_${safeName}.xlsx`, { compression: true });
}

const HEADER_ALIASES = {
  uraian: ['uraian', 'uraian kebutuhan', 'kebutuhan', 'deskripsi', 'nama barang'],
  kategori: ['kategori', 'kategori baris', 'kategori kebutuhan'],
  qty: ['qty', 'jumlah', 'kuantitas', 'volume'],
  satuan: ['satuan', 'unit'],
  harga: ['harga satuan', 'harga satuan (rp)', 'harga', 'harga (rp)'],
  catatan: ['catatan', 'keterangan', 'note'],
};

function cellText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Baca file Excel/CSV menjadi baris kebutuhan.
 * @returns {Promise<{rows: Array, errors: string[], truncated: boolean}>}
 */
export async function parseImportFile(file, itemCategories) {
  const XLSX = await loadXLSX();
  if (file.size > 5 * 1024 * 1024) return { rows: [], errors: ['File terlalu besar (maksimal 5 MB).'], truncated: false };
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buf, { type: 'array', cellFormula: false, cellHTML: false });
  } catch {
    return { rows: [], errors: ['File tidak bisa dibaca. Pastikan formatnya .xlsx, .xls, atau .csv.'], truncated: false };
  }
  const sheetName = wb.SheetNames.find((n) => normalize(n) === 'kebutuhan') || wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });

  // Cari baris judul (10 baris pertama) yang memuat "uraian"
  let headerIdx = -1;
  let map = null;
  for (let i = 0; i < Math.min(aoa.length, 10); i += 1) {
    const cells = aoa[i].map((c) => normalize(cellText(c)));
    const m = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) m[key] = idx;
    }
    if (m.uraian !== undefined) { headerIdx = i; map = m; break; }
  }
  if (headerIdx < 0) {
    return { rows: [], errors: ['Kolom "Uraian" tidak ditemukan. Gunakan template dari tombol "Unduh Template Excel".'], truncated: false };
  }

  const catByName = new Map(itemCategories.map((c) => [normalize(c.name), c]));
  const rows = [];
  let truncated = false;
  for (let i = headerIdx + 1; i < aoa.length; i += 1) {
    const r = aoa[i];
    const get = (k) => (map[k] === undefined ? '' : r[map[k]]);
    const uraian = cellText(get('uraian'));
    const kategori = cellText(get('kategori'));
    const qtyRaw = get('qty');
    const satuan = cellText(get('satuan'));
    const hargaRaw = get('harga');
    const catatan = cellText(get('catatan'));
    if (!uraian && !kategori && cellText(qtyRaw) === '' && !satuan && cellText(hargaRaw) === '' && !catatan) continue;
    if (rows.length >= LIMITS.maxRows) { truncated = true; break; }

    const notes = [];
    let catId = null;
    if (kategori) {
      const cat = catByName.get(normalize(kategori));
      if (cat) catId = cat.id;
      else notes.push(`Kategori "${kategori}" tidak dikenal`);
    }
    const qty = typeof qtyRaw === 'number' ? qtyRaw : parseQty(cellText(qtyRaw));
    const harga = typeof hargaRaw === 'number' ? hargaRaw : parseRupiah(cellText(hargaRaw));
    rows.push({
      uraian,
      item_category_id: catId,
      qty: qty === null || Number.isNaN(qty) ? cellText(qtyRaw) : String(qty).replace('.', ','),
      satuan,
      harga_satuan: harga === null || Number.isNaN(harga) ? null : Math.round(harga),
      harga_invalid: Number.isNaN(harga) || (typeof harga === 'number' && harga !== Math.round(harga)),
      catatan,
      import_notes: notes,
      source_row: i + 1,
    });
  }
  return { rows, errors: [], truncated };
}

/** Export baris datar ke .xlsx atau .csv (aman dari formula injection - S-11). */
export async function exportRows(rows, columns, format, filenameBase) {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => sanitizeCell(c.value(r))));

  if (format === 'csv') {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...body].map((row) => row.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${filenameBase}.csv`);
    return;
  }

  const XLSX = await loadXLSX();
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = columns.map((c) => ({ wch: c.width || 14 }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: columns.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Anggaran 2027');
  XLSX.writeFile(wb, `${filenameBase}.xlsx`, { compression: true });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
