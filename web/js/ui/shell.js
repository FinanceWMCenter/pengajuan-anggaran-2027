// Kerangka halaman setelah masuk: menu samping + header + konten + footer (design-kit/reference/app-shell.html).

import { h, icon, initials } from '../utils.js';
import { onCleanup } from '../router.js';
import { siteFooter } from './components.js';

/**
 * @param {object} o
 * @param {Array<{group?:string, key?:string, label:string, icon:string, href:string}>} o.nav
 * @param {string} o.active key menu aktif
 * @param {string} o.pageTitle untuk remah roti
 * @param {{title:string, sub:string}} [o.context] kotak konteks di menu (mis. nama divisi)
 * @param {{name:string, role:string}} o.user
 * @param {Function} o.onLogout
 * @param {object} o.contacts
 * @returns {HTMLElement} elemen <main> untuk diisi halaman
 */
export function renderShell(root, { nav, active, pageTitle, context, user, onLogout, contacts, logoutLabel = 'Keluar' }) {
  const sidebar = h('aside', { class: 'wm-sidebar', id: 'sidebar', 'aria-label': 'Menu utama' });
  const backdrop = h('div', { class: 'wm-sidebar-backdrop', hidden: true });

  sidebar.append(
    h('a', { href: '#/', class: 'sidebar-brand' },
      h('img', { src: 'assets/logo-navy.png', alt: 'WM Center', width: 962, height: 646, class: 'wm-logo logo-auto' }),
      h('span', null, 'Pengajuan Anggaran 2027')),
    context ? h('div', { class: 'sidebar-context' }, h('b', null, context.title), h('span', null, context.sub)) : null,
  );
  const navEl = h('nav', null);
  for (const item of nav) {
    if (item.group) {
      navEl.append(h('div', { class: 'wm-nav-group' }, item.group));
      continue;
    }
    navEl.append(h('a', {
      class: 'wm-nav-item', href: item.href, 'aria-current': item.key === active ? 'page' : null,
      onclick: () => closeMobile(),
    }, icon(item.icon), h('span', { class: 'spacer' }, item.label)));
  }
  sidebar.append(navEl);
  sidebar.append(h('div', { class: 'sidebar-bottom' },
    h('button', { type: 'button', class: 'wm-nav-item w-full', onclick: onLogout }, icon('logout'), h('span', { class: 'spacer' }, logoutLabel))));

  const toggleBtn = h('button', {
    type: 'button', class: 'wm-btn wm-btn-outline', 'aria-label': 'Tampilkan atau sembunyikan menu samping',
    'aria-controls': 'sidebar', onclick: toggleSidebar,
  }, icon('menu'));
  // tombol menu tanpa padding besar
  toggleBtn.style.setProperty('padding', '0.5rem');

  const menuPanel = h('div', { class: 'menu-panel', hidden: true, role: 'menu' },
    h('div', { class: 'menu-info' }, user.role),
    h('button', { type: 'button', role: 'menuitem', onclick: onLogout }, icon('logout'), logoutLabel));
  const userBtn = h('button', {
    type: 'button', class: 'user-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: (e) => {
      e.stopPropagation();
      menuPanel.hidden = !menuPanel.hidden;
      userBtn.setAttribute('aria-expanded', String(!menuPanel.hidden));
    },
  },
  h('span', { class: 'user-meta only-md' }, h('b', null, user.name), h('span', null, user.role)),
  h('span', { class: 'wm-avatar', 'aria-hidden': 'true' }, initials(user.name)),
  h('span', { class: 'sr-only' }, `Menu pengguna ${user.name}`));

  const header = h('header', { class: 'wm-header' },
    h('div', { class: 'header-left' },
      toggleBtn,
      h('a', { href: '#/', class: 'only-sm' }, h('img', { src: 'assets/logo-navy.png', alt: 'WM Center', class: 'header-logo-sm logo-auto' })),
      h('div', { class: 'crumbs only-md' }, 'Anggaran 2027', icon('chevron-right', 'ic-sm'), h('b', null, pageTitle))),
    h('div', { class: 'menu-wrap' }, userBtn, menuPanel));

  const main = h('main', { class: 'wm-main stack', id: 'main', tabindex: '-1' });
  const watermark = h('div', { class: 'wm-watermark', 'aria-hidden': 'true' }, h('img', { src: 'assets/logo-navy.png', alt: '', class: 'logo-auto' }));

  root.replaceChildren(
    h('div', { class: 'top-gradient', 'aria-hidden': 'true' }),
    h('div', { class: 'wm-app' }, sidebar, backdrop,
      h('div', { class: 'wm-main-col' }, header, watermark, main, siteFooter(contacts, 'site-footer app-footer'))),
  );

  function isWide() { return window.matchMedia('(min-width: 768px)').matches; }
  function closeMobile() {
    sidebar.classList.remove('is-open');
    backdrop.hidden = true;
  }
  function toggleSidebar() {
    if (isWide()) {
      const root = document.documentElement;
      const hide = root.dataset.sidebar !== 'collapsed';
      if (hide) root.dataset.sidebar = 'collapsed'; else delete root.dataset.sidebar;
      try { localStorage.setItem('wm-sidebar', hide ? 'collapsed' : 'open'); } catch { /* abaikan */ }
    } else {
      const open = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', open);
      backdrop.hidden = !open;
    }
  }
  backdrop.addEventListener('click', closeMobile);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeMobile();
      menuPanel.hidden = true;
      userBtn.setAttribute('aria-expanded', 'false');
    }
  };
  const onDocClick = () => { menuPanel.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onDocClick);
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDocClick);
  });

  return main;
}

/** Halaman publik (Home, PIN): latar lembut, watermark, garis gradien atas, footer. */
export function renderPublic(root, contacts, { narrow = false } = {}) {
  const main = h('main', { class: `public-main${narrow ? ' public-narrow' : ''}`, id: 'main' });
  root.replaceChildren(
    h('div', { class: 'top-gradient', 'aria-hidden': 'true' }),
    h('div', { class: 'public-page' },
      h('div', { class: 'public-watermark', 'aria-hidden': 'true' }, h('img', { src: 'assets/logo-navy.png', alt: '', class: 'logo-auto' })),
      main,
      siteFooter(contacts)),
  );
  return main;
}
