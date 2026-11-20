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

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sisipkan dropdown (data validation "list") ke file .xlsx buatan SheetJS. SheetJS versi gratis tidak bisa
 * menulis data validation, jadi XML sheet diubah langsung di dalam zip (pustaka CFB bawaan SheetJS).
 * Hanya menambah elemen <dataValidations>; isi sel tidak berubah.
 */
export function addListValidation(XLSX, bytes, sheetPath, { sqref, formula, errorTitle, error, promptTitle, prompt }) {
  const { CFB } = XLSX;
  const zip = CFB.read(new Uint8Array(bytes), { type: 'array' });
  const idx = zip.FullPaths.findIndex((p) => p.endsWith(`/${sheetPath}`));
  if (idx < 0) throw new Error(`Sheet ${sheetPath} tidak ditemukan`);
  const entry = zip.FileIndex[idx];
  const xml = new TextDecoder().decode(entry.content);
  if (xml.includes('<dataValidations')) throw new Error('Sheet sudah punya data validation');
  const dv = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"`
    + ` errorStyle="stop" errorTitle="${xmlEsc(errorTitle)}" error="${xmlEsc(error)}" promptTitle="${xmlEsc(promptTitle)}" prompt="${xmlEsc(prompt)}"`
    + ` sqref="${sqref}"><formula1>${xmlEsc(formula)}</formula1></dataValidation></dataValidations>`;
  // Urutan elemen worksheet (OOXML): dataValidations sesudah sheetData/autoFilter/mergeCells/conditionalFormatting,
  // sebelum hyperlinks/printOptions/pageMargins/.../ignoredErrors/drawing/tableParts/extLst.
  const after = xml.search(/<(hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[\s>/]|<\/worksheet>/);
  if (after < 0 || xml.indexOf('</sheetData>') < 0 || after < xml.indexOf('</sheetData>')) throw new Error('Struktur sheet tidak dikenali');
  entry.content = new TextEncoder().encode(xml.slice(0, after) + dv + xml.slice(after));
  entry.size = entry.content.length;
  return CFB.write(zip, { fileType: 'zip', type: 'array', compression: true });
}

/**
 * Buat isi template kebutuhan (.xlsx). Kolom Kategori berupa dropdown dari sheet "Daftar Kategori";
 * daftarnya diambil dari master data saat template diunduh (kategori aktif saja), jadi selalu mengikuti
 * penambahan/penonaktifan kategori oleh Finance.
 * @returns {{ bytes: ArrayBuffer|Uint8Array, dropdown: boolean }}
 */
export function buildTemplate(XLSX, itemCategories) {
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  ws['!cols'] = [{ wch: 40 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Kebutuhan');

  const cats = XLSX.utils.aoa_to_sheet([['Kategori (pilihan dropdown di kolom Kategori)'], ...itemCategories.map((c) => [c.name])]);
  cats['!cols'] = [{ wch: 44 }];
  XLSX.utils.book_append_sheet(wb, cats, 'Daftar Kategori');

  const guide = XLSX.utils.aoa_to_sheet([
    ['Petunjuk pengisian template kebutuhan'],
    [''],
    ['1. Isi di sheet "Kebutuhan", mulai baris ke-2. Jangan ubah judul kolom di baris 1.'],
    ['2. Uraian: 3-200 karakter. Contoh: Snack peserta pelatihan'],
    ['3. Kategori: klik sel di kolom Kategori lalu pilih dari tanda panah (dropdown). Daftarnya ada di sheet "Daftar Kategori". Tidak ada kategori "Lain-lain".'],
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

  const plain = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  if (!itemCategories.length) return { bytes: plain, dropdown: false };
  try {
    // Kebutuhan = sheet pertama (sheet1.xml). Dropdown untuk semua baris isian (baris 2 s.d. maxRows+1).
    const bytes = addListValidation(XLSX, plain, 'xl/worksheets/sheet1.xml', {
      sqref: `B2:B${LIMITS.maxRows + 1}`,
      formula: `'Daftar Kategori'!$A$2:$A$${itemCategories.length + 1}`,
      errorTitle: 'Kategori tidak dikenal',
      error: 'Pilih kategori dari daftar (tanda panah). Kategori tidak ada? Hubungi Finance.',
      promptTitle: 'Kategori',
      prompt: 'Pilih dari daftar (tanda panah)',
    });
    return { bytes, dropdown: true };
  } catch {
    return { bytes: plain, dropdown: false }; // tetap bisa dipakai: kategori diketik/salin dari sheet Daftar Kategori
  }
}

/** Unduh template Excel kosong untuk diisi divisi. */
export async function downloadTemplate(itemCategories, divisionName) {
  const XLSX = await loadXLSX();
  const { bytes } = buildTemplate(XLSX, itemCategories);
  const safeName = String(divisionName || 'divisi').replace(/[^A-Za-z0-9-]+/g, '_');
  downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Template_Kebutuhan_Anggaran2027_${safeName}.xlsx`);
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

/**
 * Unduh RAB Gabungan (D-52) sebagai .xlsx: lembar "Ringkasan" (program per divisi + total) dan
 * "Rincian Item" (semua baris kebutuhan). Angka dari database; teks aman dari formula injection.
 * @param {object} d hasil rpc_f_rab_detail
 * @param {(n:number)=>string} bulan nama bulan
 */
export async function exportRab(d, bulan) {
  const XLSX = await loadXLSX();
  const S = (v) => sanitizeCell(v ?? '');
  const STATUS = { diajukan: 'Diajukan', draft: 'Draft (tidak dihitung)' };
  const progById = new Map(d.programs.map((p) => [p.id, p]));
  const money = (ws, cols, fromRow) => {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = fromRow; r <= range.e.r; r += 1) {
      for (const c of cols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') cell.z = '#,##0';
      }
    }
  };

  const head1 = ['Divisi', 'Nama Program', 'Bulan', 'Kategori Program', 'PIC', 'Status', 'Jumlah Baris', 'Total (Rp)'];
  const rows1 = d.programs.map((p) => [S(p.division_name), S(p.nama_program), bulan(p.periode_bulan), S(p.program_category_name), S(p.pic_nama), STATUS[p.status] || p.status, Number(p.item_count), Number(p.total)]);
  const sheet1 = XLSX.utils.aoa_to_sheet([
    ['RAB Gabungan', S(d.name)],
    ['Catatan', S(d.note || '-')],
    ['Total (hanya program Diajukan)', Number(d.total)],
    ['Jumlah program', `${d.program_count} Diajukan${d.draft_count ? `, ${d.draft_count} draft tidak dihitung` : ''}`],
    ['Diunduh', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'],
    [],
    head1,
    ...rows1,
    ['TOTAL DIAJUKAN', '', '', '', '', '', '', Number(d.total)],
  ]);
  money(sheet1, [1], 2);
  money(sheet1, [7], 7);
  sheet1['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 11 }, { wch: 26 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 16 }];

  const head2 = ['Divisi', 'Nama Program', 'Bulan', 'Status', 'No', 'Uraian', 'Kategori Kebutuhan', 'Qty', 'Satuan', 'Harga Satuan (Rp)', 'Subtotal (Rp)', 'Catatan'];
  const rows2 = d.items.map((i) => {
    const p = progById.get(i.program_id) || {};
    return [S(p.division_name), S(p.nama_program), bulan(p.periode_bulan), STATUS[p.status] || p.status, Number(i.urutan), S(i.uraian), S(i.item_category_name || ''),
      i.qty == null ? '' : Number(i.qty), S(i.satuan || ''), i.harga_satuan == null ? '' : Number(i.harga_satuan), Number(i.subtotal), S(i.catatan || '')];
  });
  const sheet2 = XLSX.utils.aoa_to_sheet([head2, ...rows2, ['TOTAL DIAJUKAN', '', '', '', '', '', '', '', '', '', Number(d.total), 'Baris Draft tidak dihitung']]);
  money(sheet2, [9, 10], 1);
  sheet2['!cols'] = [{ wch: 26 }, { wch: 36 }, { wch: 11 }, { wch: 20 }, { wch: 5 }, { wch: 36 }, { wch: 24 }, { wch: 7 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 28 }];
  if (rows2.length) sheet2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows2.length, c: head2.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet1, 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, sheet2, 'Rincian Item');
  const safeName = String(d.name || 'RAB').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'RAB';
  XLSX.writeFile(wb, `RAB_Gabungan_${safeName}.xlsx`, { compression: true });
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
