// Input PIN seperti di HP: titik per digit + keypad angka. Bisa juga diketik dari keyboard fisik.
// Otomatis dikirim saat semua digit terisi.

import { h, icon } from '../utils.js';

/**
 * @param {object} o
 * @param {number} o.length jumlah digit (6 divisi, 8 Finance)
 * @param {(pin:string)=>Promise<{ok:boolean, message?:string}>} o.onSubmit
 * @param {string} [o.label] label untuk pembaca layar
 * @returns {{el: HTMLElement, focus: Function, reset: Function}}
 */
export function createPinPad({ length, onSubmit, label = 'PIN' }) {
  let value = '';
  let busy = false;
  let visible = false;

  const dots = h('div', { class: 'pin-dots', role: 'img', 'aria-label': `${label}: 0 dari ${length} digit terisi` });
  const message = h('p', { class: 'pin-message', role: 'alert', 'aria-live': 'assertive' });

  // Input tersembunyi agar keyboard fisik / pembaca layar / pengelola sandi tetap bisa dipakai
  const hidden = h('input', {
    type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: length,
    class: 'sr-only', 'aria-label': `${label} (${length} digit angka)`,
  });

  const keys = [];
  const keypad = h('div', { class: 'pin-keypad' });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((d) => keypad.append(makeKey(d)));
  const toggleBtn = h('button', { type: 'button', class: 'pin-key is-fn', onclick: toggleVisible, 'aria-pressed': 'false' }, 'Lihat');
  keypad.append(toggleBtn);
  keypad.append(makeKey('0'));
  const backBtn = h('button', { type: 'button', class: 'pin-key is-fn', 'aria-label': 'Hapus satu digit', onclick: () => backspace() }, icon('backspace'));
  keypad.append(backBtn);
  keys.push(toggleBtn, backBtn);

  function makeKey(d) {
    const b = h('button', { type: 'button', class: 'pin-key', onclick: () => press(d) }, d);
    keys.push(b);
    return b;
  }

  function render() {
    dots.replaceChildren(...Array.from({ length }, (_, i) => {
      const filled = i < value.length;
      return h('span', { class: `pin-dot${filled ? ' is-filled' : ''}` }, visible && filled ? value[i] : '');
    }));
    dots.classList.toggle('is-visible', visible);
    dots.setAttribute('aria-label', `${label}: ${value.length} dari ${length} digit terisi`);
    hidden.value = value;
  }

  function setBusy(b) {
    busy = b;
    keys.forEach((k) => { k.disabled = b; });
    hidden.disabled = b;
  }

  function press(d) {
    if (busy || value.length >= length) return;
    value += d;
    message.textContent = '';
    message.className = 'pin-message';
    dots.classList.remove('is-error');
    render();
    if (value.length === length) submit();
  }

  function backspace() {
    if (busy) return;
    value = value.slice(0, -1);
    render();
  }

  function toggleVisible() {
    visible = !visible;
    toggleBtn.textContent = visible ? 'Sembunyi' : 'Lihat';
    toggleBtn.setAttribute('aria-pressed', String(visible));
    render();
  }

  async function submit() {
    setBusy(true);
    message.className = 'pin-message muted';
    message.textContent = 'Memeriksa PIN…';
    let result;
    try {
      result = await onSubmit(value);
    } catch (e) {
      result = { ok: false, message: e?.message || 'Terjadi kendala. Coba lagi.' };
    }
    setBusy(false);
    if (result && result.ok) {
      message.textContent = '';
      return;
    }
    message.className = 'pin-message text-danger';
    message.textContent = result?.message || 'PIN salah. Coba lagi.';
    dots.classList.remove('is-error');
    void dots.offsetWidth; // ulang animasi getar
    dots.classList.add('is-error');
    value = '';
    render();
    focus();
  }

  hidden.addEventListener('input', () => {
    const digits = hidden.value.replace(/\D/g, '').slice(0, length);
    value = digits;
    render();
    if (value.length === length && !busy) submit();
  });

  const el = h('div', { class: 'pin-pad' }, hidden, dots, message, keypad);

  // Keyboard fisik saat fokus di area PIN (bukan di kolom nama)
  el.addEventListener('keydown', (e) => {
    if (e.target === hidden) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
  });

  function focus() {
    // Di HP jangan memunculkan keyboard sistem (keypad di layar sudah ada)
    if (window.matchMedia('(pointer: fine)').matches) hidden.focus({ preventScroll: true });
  }

  function reset() {
    value = '';
    message.textContent = '';
    render();
  }

  render();
  return { el, focus, reset };
}
