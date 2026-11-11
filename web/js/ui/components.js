// Komponen kecil yang dipakai di banyak halaman.

import { h, icon, formatRupiah, formatRupiahShort } from '../utils.js';

export function statusBadge(status) {
  return status === 'diajukan'
    ? h('span', { class: 'wm-badge is-good' }, 'Diajukan')
    : h('span', { class: 'wm-badge' }, 'Draft');
}

export function activeBadge(isActive) {
  return isActive
    ? h('span', { class: 'wm-badge is-good' }, 'Aktif')
    : h('span', { class: 'wm-badge' }, 'Nonaktif');
}

export function pageHead({ title, subtitle, actions = [], badge = null }) {
  return h('div', { class: 'head-row' },
    h('div', null,
      h('div', { class: 'title-line' }, h('h1', { class: 'wm-page-title' }, title), badge),
      subtitle ? h('p', { class: 'wm-page-sub' }, subtitle) : null),
    actions.length ? h('div', { class: 'head-actions' }, actions) : null);
}

/** Panel merek (satu per halaman): angka utama. */
/** Atribut untuk elemen non-tombol yang membuka pop-up saat diklik (mouse, sentuh, Enter, Spasi). */
function clickableProps(fn) {
  return {
    tabindex: 0,
    'aria-haspopup': 'dialog',
    onclick: (e) => { if (!e.target.closest('a, button')) fn(); },
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  };
}

export function brandPanel({ label, value, note, iconName = 'coins', onClick = null }) {
  return h('div', { class: `wm-card wm-card-brand${onClick ? ' is-clickable' : ''}`, ...(onClick ? { role: 'button', ...clickableProps(onClick) } : {}) },
    h('div', { class: 'brand-label' }, icon(iconName), label),
    h('div', { class: 'brand-value', title: formatRupiah(value) }, formatRupiahShort(value)),
    h('div', { class: 'brand-note' }, note ?? formatRupiah(value)));
}

export function statCard({ label, value, note, iconName = 'layers', chip = '', isText = false, href = null, onClick = null }) {
  const tag = href ? 'a' : 'div';
  return h(tag, { class: `wm-stat${onClick ? ' is-clickable' : ''}`, href, ...(onClick ? { role: 'button', ...clickableProps(onClick) } : {}) },
    h('div', { class: 'wm-stat-label' }, h('span', { class: `wm-chip ${chip}` }, icon(iconName)), label),
    h('div', { class: `wm-stat-value${isText ? ' is-text' : ''}` }, value),
    note ? h('div', { class: 'wm-stat-note' }, note) : null);
}

export function skeletonStats(n = 4) {
  return h('div', { class: 'stats' }, Array.from({ length: n }, () => h('div', { class: 'wm-stat' },
    h('span', { class: 'skeleton' }), h('span', { class: 'skeleton is-lg' }))));
}

export function emptyState({ title, text, action = null, iconName = 'inbox' }) {
  return h('div', { class: 'empty-state' }, icon(iconName, 'ic-lg'), h('h3', null, title), text ? h('p', null, text) : null, action);
}

export function flash(type, content, iconName) {
  const map = { info: 'info', warning: 'alert', error: 'alert', success: 'check-circle' };
  return h('div', { class: `wm-flash is-${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(iconName || map[type] || 'info'), h('div', null, content));
}

export function loadingBlock(text = 'Memuat data…') {
  return h('div', { class: 'page-loading', role: 'status' }, text);
}

export function errorBlock(message, onRetry) {
  return h('div', { class: 'page-error' }, flash('error', [
    message,
    onRetry ? h('div', { class: 'flash-actions' }, h('button', { type: 'button', class: 'wm-btn wm-btn-outline wm-btn-sm', onclick: onRetry }, icon('refresh'), 'Coba lagi')) : null,
  ]));
}

/** Tautan kontak Finance (WA + email) */
export function contactLinks(c) {
  return [
    h('a', { href: c.wa_link, target: '_blank', rel: 'noopener noreferrer' }, `WhatsApp ${c.wa}`),
    ' atau email ',
    h('a', { href: `mailto:${c.email_2}` }, c.email_2),
  ];
}

/** Alert "kategori tidak ditemukan" di bawah dropdown kategori (BR-10, 09_MASTER_DATA 7). */
export function categoryHelp(c) {
  return h('p', { class: 'cat-help' }, 'Kategori tidak ditemukan? Hubungi Finance WM Center untuk menambahkannya: ', contactLinks(c), '.');
}

export function siteFooter(c, cls = 'site-footer') {
  // Spasi di antara bagian penting: memberi titik potong baris supaya tidak meluber di HP 360px.
  const sep = () => [' ', h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), ' '];
  return h('footer', { class: cls },
    'Kendala atau pertanyaan? Hubungi Finance WM Center', sep(),
    h('a', { href: `mailto:${c.email_1}` }, c.email_1), sep(),
    h('a', { href: `mailto:${c.email_2}` }, c.email_2), sep(),
    h('a', { href: c.wa_link, target: '_blank', rel: 'noopener noreferrer', class: 'nowrap' }, `WhatsApp ${c.wa}`));
}

/** Tabel sederhana dalam kartu. columns: [{label, cls?, render(row)->Node|string}]. customRow(row) -> sel <td> untuk baris khusus (subtotal), atau null. */
export function dataTable({ columns, rows, footer = null, empty = 'Belum ada data.', rowClass = null, caption = null, onRowClick = null, rowClickable = null, customRow = null }) {
  const thead = h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', class: c.thCls || null }, c.label))));
  const rowProps = (r, i) => {
    const cls = rowClass ? rowClass(r, i) : null;
    if (!onRowClick || (rowClickable && !rowClickable(r, i))) return { class: cls };
    return { class: cls ? `${cls} is-clickable` : 'is-clickable', ...clickableProps(() => onRowClick(r, i)) };
  };
  const tbody = h('tbody', null, rows.length
    ? rows.map((r, i) => {
      const special = customRow ? customRow(r, i) : null;
      return special
        ? h('tr', { class: 'is-subtotal' }, special)
        : h('tr', rowProps(r, i), columns.map((c) => h('td', { class: c.cls || null }, c.render(r, i))));
    })
    : h('tr', null, h('td', { colspan: columns.length, class: 'table-empty' }, empty)));
  const tfoot = footer ? h('tfoot', null, h('tr', null, footer)) : null;
  return h('div', { class: 'wm-table-wrap' }, h('table', { class: 'wm-table' }, caption ? h('caption', { class: 'sr-only' }, caption) : null, thead, tbody, tfoot));
}

export function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('is-loading', loading);
  btn.disabled = loading;
  btn.setAttribute('aria-busy', String(loading));
}
