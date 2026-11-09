// Uji unit utilitas frontend (tanpa browser). Jalankan: node tests/js/utils.test.mjs
import {
  formatRupiah, formatRupiahShort, parseRupiah, parseQty, computeSubtotal, sanitizeCell,
  formatDate, formatDateTime, groupDigits, hasMaxDecimals, escapeHTML, quarterOf, monthName,
} from '../../web/js/utils.js';

let pass = 0;
let fail = 0;
function eq(actual, expected, name) {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass += 1; console.log(`LULUS ${name}`); } else { fail += 1; console.log(`GAGAL ${name}: dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
}

eq(formatRupiah(1250000), 'Rp 1.250.000', 'F-26 format Rupiah');
eq(formatRupiah(0), 'Rp 0', 'format Rupiah nol');
eq(formatRupiah(null), '-', 'format Rupiah kosong');
eq(formatRupiah('5250000'), 'Rp 5.250.000', 'format Rupiah dari teks (numeric JSON)');
eq(formatRupiahShort(312300000), 'Rp 312,3 jt', 'ringkas juta');
eq(formatRupiahShort(5200000000), 'Rp 5,2 M', 'ringkas miliar');
eq(formatRupiahShort(950000), 'Rp 950.000', 'ringkas di bawah sejuta = penuh');
eq(groupDigits('1000000000000'), '1.000.000.000.000', 'pemisah ribuan 1 triliun');

eq(parseRupiah('Rp 1.250.000'), 1250000, 'F-26 tempel "Rp 1.250.000" dibersihkan');
eq(parseRupiah('1.250.000,00'), 1250000, 'Rupiah dengan ,00');
eq(parseRupiah('150000'), 150000, 'Rupiah tanpa titik');
eq(parseRupiah(''), null, 'Rupiah kosong = null');
eq(Number.isNaN(parseRupiah('1.250.000,50')), true, 'Rupiah desimal bukan nol ditolak');
eq(Number.isNaN(parseRupiah('abc')), true, 'Rupiah bukan angka ditolak');

eq(parseQty('2,5'), 2.5, 'qty koma desimal');
eq(parseQty('2.5'), 2.5, 'qty titik desimal');
eq(parseQty('1.000'), 1000, 'qty titik ribuan');
eq(parseQty('1.000,25'), 1000.25, 'qty ribuan + desimal');
eq(parseQty(''), null, 'qty kosong');
eq(Number.isNaN(parseQty('dua')), true, 'qty bukan angka');
eq(hasMaxDecimals(2.55, 2), true, 'qty 2 desimal boleh');
eq(hasMaxDecimals(1.255, 2), false, 'qty 3 desimal ditolak');

eq(computeSubtotal(2.5, 100000), 250000, 'D-04 subtotal 2,5 x 100.000');
eq(computeSubtotal(0.07, 15), 1, 'subtotal dibulatkan seperti database (1,05 -> 1)');
eq(computeSubtotal(0.1, 15), 2, 'subtotal 1,5 -> 2 (pembulatan setengah ke atas)');
eq(computeSubtotal(100000, 1000000000000), 100000000000000000, 'subtotal maksimum tanpa meleset');

eq(sanitizeCell('=HYPERLINK("http://x","klik")'), '\'=HYPERLINK("http://x","klik")', 'S-11 formula = diberi awalan');
eq(sanitizeCell('+62 812'), "'+62 812", 'S-11 awalan +');
eq(sanitizeCell('-cmd'), "'-cmd", 'S-11 awalan -');
eq(sanitizeCell('@SUM(A1)'), "'@SUM(A1)", 'S-11 awalan @');
eq(sanitizeCell('Snack peserta'), 'Snack peserta', 'teks biasa tidak diubah');
eq(sanitizeCell(-5), -5, 'angka tidak diubah');

eq(escapeHTML('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'S-10 escape HTML');
eq(formatDate('2027-01-15'), '15 Jan 2027', 'format tanggal');
eq(formatDate('2027-01-15', true), '15 Januari 2027', 'format tanggal panjang');
eq(formatDateTime('2027-01-14T17:30:00Z'), '15 Jan 2027 00:30', 'D-05 waktu tampil WIB (bukan UTC)');
eq(quarterOf(12), 4, 'kuartal Desember = Q4');
eq(monthName(3, 2027), 'Maret 2027', 'nama bulan');

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) process.exit(1);
