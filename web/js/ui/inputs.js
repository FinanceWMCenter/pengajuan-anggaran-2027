// Input khusus: Rupiah dengan pemisah ribuan otomatis (kursor tidak melompat).

import { h, groupDigits } from '../utils.js';

/**
 * Input Rupiah. Pengguna mengetik angka saja; tampil "1.250.000". Nilai = bilangan bulat atau null.
 * Tempel "Rp 1.250.000" otomatis dibersihkan (F-26).
 */
export function moneyInput({ value = null, onChange, id, ariaLabel, cls = 'wm-input' }) {
  const input = h('input', {
    class: `${cls} num`, type: 'text', inputmode: 'numeric', autocomplete: 'off', id, 'aria-label': ariaLabel,
    value: value === null || value === undefined ? '' : groupDigits(Math.round(Number(value))),
  });
  input.addEventListener('input', () => {
    const pos = input.selectionStart ?? input.value.length;
    let before = input.value.slice(0, pos);
    let raw = input.value;
    // Buang desimal ",00" bila menempel "1.250.000,00"
    raw = raw.replace(/,\d{0,2}$/, '');
    before = before.length > raw.length ? raw : before;
    const digitsBefore = before.replace(/\D/g, '').length;
    let digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
    input.value = digits ? groupDigits(digits) : '';
    let count = 0;
    let caret = 0;
    while (caret < input.value.length && count < digitsBefore) {
      if (/\d/.test(input.value[caret])) count += 1;
      caret += 1;
    }
    try { input.setSelectionRange(caret, caret); } catch { /* abaikan */ }
    onChange(digits ? Number(digits) : null);
  });
  return input;
}
