import { h, icon } from '../utils.js';

const ICONS = { success: 'check-circle', error: 'alert', warning: 'alert', info: 'info' };

/** Notifikasi singkat di bawah layar. type: success | error | warning | info */
export function toast(message, type = 'info', ms = 4500) {
  const area = document.getElementById('toast-area');
  if (!area) return;
  const el = h('div', { class: `toast is-${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(ICONS[type] || 'info'), h('div', null, message));
  area.append(el);
  setTimeout(() => el.remove(), type === 'error' ? Math.max(ms, 7000) : ms);
}
