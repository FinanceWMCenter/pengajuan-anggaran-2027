// Dialog modal yang dapat diakses keyboard (Esc menutup, fokus terjebak di dalam, fokus kembali setelah tutup).
// Mengikuti pola design kit: lapisan yang menggulir + kartu di dalamnya (bukan satu elemen flex + gulir).

import { h } from '../utils.js';

let openCount = 0;

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.description]
 * @param {Node|Node[]|string} [o.body]
 * @param {Array<{label:string, value:any, variant?:string, autofocus?:boolean, validate?:Function}>} o.actions
 * @param {boolean} [o.dismissible=true] Esc / klik latar = batal (null)
 * @param {boolean} [o.wide]
 * @param {boolean} [o.danger]
 * @returns {Promise<any>} value tombol yang diklik, atau null bila dibatalkan
 */
export function openDialog({ title, description, body, actions = [], dismissible = true, wide = false, xwide = false, danger = false, onOpen = null }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleId = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;
    const descId = description ? `${titleId}-desc` : null;
    const openedAt = Date.now();
    let closed = false;
    let validating = false;

    const buttons = actions.map((a) => h('button', {
      type: 'button',
      class: `wm-btn ${a.variant ? `wm-btn-${a.variant}` : 'wm-btn-outline'}`,
      onclick: async () => {
        // Klik dobel: tombol tidak dieksekusi dua kali (BUG-021)
        if (closed || validating) return;
        if (a.validate) {
          validating = true;
          let ok = false;
          try { ok = await a.validate(); } finally { validating = false; }
          if (!ok) return;
        }
        close(a.value);
      },
    }, a.label));

    const card = h('div', {
      class: `wm-modal-card${wide ? ' is-wide' : ''}${xwide ? ' is-xwide' : ''}${danger ? ' is-danger' : ''}`,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': descId,
    },
    h('div', null,
      h('h2', { id: titleId }, title),
      description ? h('p', { class: 'dialog-desc', id: descId }, description) : null),
    body ? h('div', { class: 'dialog-body' }, body) : null,
    buttons.length ? h('div', { class: 'wm-modal-actions' }, buttons) : null);

    const overlay = h('div', { class: 'wm-modal' }, h('div', { class: 'wm-modal-inner' }, card));

    function onKey(e) {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Tab') {
        const focusables = [...card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.disabled && el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    overlay.addEventListener('mousedown', (e) => {
      // Klik kedua dari klik dobel yang membuka dialog jatuh ke latar: jangan langsung menutup (BUG-021)
      if (Date.now() - openedAt < 400) return;
      if (e.target === overlay || e.target === overlay.firstChild) {
        if (dismissible) close(null);
      }
    });

    function close(value) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      openCount -= 1;
      if (openCount <= 0) { openCount = 0; document.body.classList.remove('has-modal'); }
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      resolve(value);
    }

    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    openCount += 1;
    document.body.classList.add('has-modal');
    if (onOpen) onOpen(close); // pemanggil boleh menutup dialog sendiri (mis. saat pindah halaman)

    const autofocusIdx = actions.findIndex((a) => a.autofocus);
    const firstInput = card.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();
    else if (autofocusIdx >= 0) buttons[autofocusIdx].focus();
    else if (buttons[0]) buttons[0].focus();
  });
}

/** Konfirmasi ya/tidak. Untuk tindakan berbahaya: tombol merah, fokus awal di "Batal". */
export async function confirmDialog({ title, message, body, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = false, wide = false }) {
  const result = await openDialog({
    title, description: message, body, wide, danger,
    actions: [
      { label: cancelLabel, value: false, autofocus: danger },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary', autofocus: !danger },
    ],
  });
  return result === true;
}

/** Minta alasan wajib (mis. hapus oleh Finance). Mengembalikan teks alasan atau null. */
export async function reasonDialog({ title, message, label = 'Alasan', minLength = 10, maxLength = 500, confirmLabel = 'Hapus', danger = true }) {
  const id = `reason-${Math.random().toString(36).slice(2, 8)}`;
  const textarea = h('textarea', { class: 'wm-textarea', id, rows: 3, maxlength: maxLength, required: true });
  const err = h('p', { class: 'wm-error', role: 'alert' });
  const counter = h('p', { class: 'wm-hint' }, `Minimal ${minLength} karakter.`);
  textarea.addEventListener('input', () => {
    err.textContent = '';
    textarea.classList.remove('is-invalid');
    counter.textContent = `${textarea.value.trim().length} karakter (minimal ${minLength}).`;
  });
  const body = h('div', { class: 'wm-field' },
    h('label', { class: 'wm-label', for: id }, label, h('span', { class: 'wm-required' }, '*wajib')),
    textarea, counter, err);
  const result = await openDialog({
    title, description: message, body, danger,
    actions: [
      { label: 'Batal', value: null },
      {
        label: confirmLabel, value: 'ok', variant: danger ? 'danger' : 'primary',
        validate: () => {
          if (textarea.value.trim().length < minLength) {
            err.textContent = `Alasan wajib diisi minimal ${minLength} karakter.`;
            textarea.classList.add('is-invalid');
            textarea.focus();
            return false;
          }
          return true;
        },
      },
    ],
  });
  return result === 'ok' ? textarea.value.trim() : null;
}

/** Pesan informasi dengan satu tombol. */
export function alertDialog({ title, message, body, okLabel = 'Mengerti' }) {
  return openDialog({ title, description: message, body, actions: [{ label: okLabel, value: true, variant: 'primary', autofocus: true }] });
}
