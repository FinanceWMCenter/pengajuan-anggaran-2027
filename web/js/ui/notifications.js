// Lonceng notifikasi di header (D-43). Divisi: revisi/hapus oleh Finance. Finance: perubahan oleh divisi pada program Diajukan.
// Dimuat ulang setiap pindah halaman. Bila gagal dimuat, halaman tetap berjalan normal.

import { h, icon, formatDateTime } from '../utils.js';
import { rpc } from '../api.js';
import { navigate, onCleanup } from '../router.js';

function message(n, isFinance) {
  const name = `"${n.program_name}"`;
  const who = isFinance ? n.division_name : 'Finance';
  if (n.kind === 'hapus_program') return `${who} menghapus program ${name}`;
  if (n.kind === 'revisi_finance') return `Finance merevisi ${n.item_count} item pada ${name}`;
  if (n.item_count > 0 && n.info_changed) return `${who} mengubah ${n.item_count} item dan info program pada ${name}`;
  if (n.item_count > 0) return `${who} mengubah ${n.item_count} item pada ${name}`;
  return `${who} mengubah info program pada ${name}`;
}

export function notificationBell(session) {
  const isFinance = session.role === 'finance';
  const pathOf = (n) => (isFinance ? `/finance/p/${n.program_id}` : `/d/${session.division.code}/p/${n.program_id}`);

  const count = h('span', { class: 'bell-count', hidden: true });
  const list = h('div', { class: 'bell-list' }, h('p', { class: 'bell-empty' }, 'Memuat...'));
  const markAll = h('button', { type: 'button', class: 'wm-btn-text', hidden: true, onclick: async () => { await mark(null); await load(); } }, 'Tandai semua dibaca');
  const panel = h('div', { class: 'bell-panel', hidden: true, role: 'region', 'aria-label': 'Notifikasi', onclick: (e) => e.stopPropagation() },
    h('div', { class: 'bell-head' }, h('b', null, 'Notifikasi'), markAll),
    list);
  const srCount = h('span', { class: 'sr-only' }, 'Notifikasi');
  const btn = h('button', {
    type: 'button', class: 'bell-btn', 'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); setOpen(panel.hidden); },
  }, icon('bell'), count, srCount);

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  async function mark(id) {
    try {
      await rpc('rpc_notifications_read', { p_id: id });
    } catch { /* tetap lanjut; penanda belum dibaca muncul lagi saat dimuat ulang */ }
  }

  function row(n) {
    const content = [
      h('span', { class: 'bell-msg' }, message(n, isFinance)),
      h('span', { class: 'bell-time' }, `${formatDateTime(n.created_at)} WIB`),
    ];
    const cls = `bell-item${n.read_at ? '' : ' is-unread'}`;
    if (n.kind === 'hapus_program') {
      return h('button', {
        type: 'button', class: cls,
        onclick: async () => { if (!n.read_at) { await mark(n.id); } await load(); },
      }, content);
    }
    return h('a', {
      class: cls, href: `#${pathOf(n)}`,
      onclick: async (e) => {
        e.preventDefault();
        setOpen(false);
        if (!n.read_at) await mark(n.id);
        navigate(pathOf(n));
      },
    }, content);
  }

  function show(data) {
    const unread = Number(data.unread) || 0;
    count.hidden = unread === 0;
    count.textContent = unread > 99 ? '99+' : String(unread);
    srCount.textContent = unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi';
    markAll.hidden = unread === 0;
    list.replaceChildren(...(data.items.length ? data.items.map(row) : [h('p', { class: 'bell-empty' }, 'Belum ada notifikasi.')]));
  }

  async function load() {
    try {
      show(await rpc('rpc_notifications'));
    } catch {
      count.hidden = true;
      list.replaceChildren(h('p', { class: 'bell-empty' }, 'Notifikasi belum bisa dimuat.'));
    }
  }

  const close = () => setOpen(false);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  onCleanup(() => {
    document.removeEventListener('click', close);
    document.removeEventListener('keydown', onKey);
  });

  load();
  return h('div', { class: 'bell-wrap' }, btn, panel);
}
