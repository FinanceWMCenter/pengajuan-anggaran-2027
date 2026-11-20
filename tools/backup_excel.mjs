// Gabungkan CSV hasil tools/backup_baca.sql menjadi satu file Excel yang mudah dibaca (D-49).
// Dipanggil otomatis oleh tools\backup.ps1:  node tools/backup_excel.mjs <folder_csv> <file.xlsx> <label>
// Memakai pustaka Excel yang sudah ada di proyek (web/vendor/xlsx.full.min.js), tanpa unduhan baru.
// Semua teks ditulis sebagai TEKS (tidak pernah menjadi rumus Excel).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX = createRequire(import.meta.url)(path.join(here, '..', 'web', 'vendor', 'xlsx.full.min.js'));
const [, , csvDir, outFile, label = 'DEV'] = process.argv;
if (!csvDir || !outFile) { console.error('Pakai: node tools/backup_excel.mjs <folder_csv> <file.xlsx> [label]'); process.exit(1); }

/** Pembaca CSV standar (RFC 4180): kutip ganda, koma & baris baru di dalam kutip. */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const SHEETS = [
  ['1_ringkasan_divisi.csv', 'Ringkasan Divisi'],
  ['2_program.csv', 'Program'],
  ['3_rincian_kebutuhan.csv', 'Rincian Kebutuhan'],
  ['4_riwayat_revisi_item.csv', 'Riwayat Revisi Item'],
  ['5_log_riwayat.csv', 'Log Riwayat'],
  ['6_master_data.csv', 'Master Data'],
  ['7_rab_gabungan.csv', 'RAB Gabungan', true], // D-52; opsional (database tanpa 05b_rab_gabungan.sql)
];
const NUMERIC = new Set(['Program Diajukan', 'Draft', 'Bulan (angka)', 'Jumlah Baris', 'No', 'Qty', 'Urutan']);
const isMoney = (h) => /\(Rp\)$/.test(h);

const wb = XLSX.utils.book_new();
const counts = {};
for (const [file, name, optional] of SHEETS) {
  const p = path.join(csvDir, file);
  if (!fs.existsSync(p)) {
    if (optional) continue;
    console.error(`File tidak ada: ${p}`); process.exit(1);
  }
  const [head, ...body] = parseCsv(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
  counts[name] = body.length;
  const ws = {};
  const width = head.map((h) => Math.min(48, Math.max(8, h.length + 2)));
  head.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: h }; });
  body.forEach((r, ri) => {
    r.forEach((v, c) => {
      const h = head[c] || '';
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c });
      if (v === '') return;
      if ((isMoney(h) || NUMERIC.has(h)) && /^-?\d+(\.\d+)?$/.test(v)) {
        ws[addr] = { t: 'n', v: Number(v), z: isMoney(h) ? '#,##0' : (v.includes('.') ? '0.##' : '0') };
        width[c] = Math.max(width[c], Math.min(20, v.length + 6));
      } else {
        ws[addr] = { t: 's', v }; // teks selalu teks, tidak pernah rumus
        width[c] = Math.max(width[c], Math.min(48, v.length + 2));
      }
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(body.length, 1), c: Math.max(head.length - 1, 0) } });
  ws['!cols'] = width.map((wch) => ({ wch }));
  if (body.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: head.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, name);
}

// Lembar Info di depan: kapan dibuat, isi, catatan
const now = new Date();
const info = XLSX.utils.aoa_to_sheet([
  ['Backup Pengajuan Anggaran 2027 (salinan yang bisa dibaca)'],
  [],
  ['Sumber', label],
  ['Dibuat', now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'],
  ['File pemulihan lengkap', path.basename(outFile).replace(/\.xlsx$/i, '.dump') + ' (untuk memulihkan database; simpan juga)'],
  [],
  ['Lembar', 'Isi', 'Jumlah baris'],
  ['Ringkasan Divisi', 'Jumlah program & total per divisi (Diajukan dan Draft), baris TOTAL di bawah', counts['Ringkasan Divisi'] - 1],
  ['Program', 'Semua program dengan kondisi terakhir: status, bulan, PIC, total, direvisi Finance', counts.Program],
  ['Rincian Kebutuhan', 'Setiap baris kebutuhan: uraian, kategori, qty, satuan, harga, subtotal', counts['Rincian Kebutuhan']],
  ['Riwayat Revisi Item', 'Perubahan per item setelah program diajukan (siapa, kapan, apa, alasan)', counts['Riwayat Revisi Item']],
  ['Log Riwayat', 'Semua aksi tercatat (simpan, submit, hapus, revisi, ganti PIN, export)', counts['Log Riwayat']],
  ['Master Data', 'Kategori program, kategori kebutuhan, daftar divisi', counts['Master Data']],
  ...(counts['RAB Gabungan'] !== undefined ? [['RAB Gabungan', 'Kelompok program per kegiatan buatan Finance (tidak mengubah total Dashboard)', counts['RAB Gabungan']]] : []),
  [],
  ['Catatan', 'Total program = jumlah subtotal barisnya. Total Dashboard hanya menghitung status Diajukan.'],
  ['Catatan', 'Teks yang diawali = + - @ diberi tanda \' di depan supaya tidak dijalankan sebagai rumus.'],
  ['Catatan', 'Hash PIN, token login, dan catatan percobaan login sengaja tidak ikut (rahasia).'],
]);
info['!cols'] = [{ wch: 26 }, { wch: 90 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wb, info, 'Info');
wb.SheetNames = ['Info', ...wb.SheetNames.filter((n) => n !== 'Info')];

fs.writeFileSync(outFile, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
console.log(`Excel: ${outFile}`);
for (const [n, c] of Object.entries(counts)) console.log(`  ${n}: ${n === 'Ringkasan Divisi' ? c - 1 : c} baris`);
