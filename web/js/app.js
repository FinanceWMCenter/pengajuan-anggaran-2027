// Titik masuk aplikasi: daftar rute, pengecekan akses (PIN gate), dan kerangka halaman.

import { addRoute, matchRoute, parseHash, startRouter, navigate, refresh } from './router.js';
import { rpc, setAuthExpiredHandler, isConfigured, MESSAGES } from './api.js';
import { getSession, clearSession, canAccessDivision, isFinance, clearDivisionDrafts } from './session.js';
import { getContacts, findDivision, FALLBACK_CONTACTS } from './store.js';
import { renderShell, renderPublic } from './ui/shell.js';
import { errorBlock, flash } from './ui/components.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { notificationBell } from './ui/notifications.js';
import { h } from './utils.js';

import { loginView, homePathFor } from './views/login.js';
import { divisionSummaryView } from './views/division-summary.js';
import { programFormView } from './views/program-form.js';
import { programDetailView } from './views/program-detail.js';
import { divisionOverviewView } from './views/overview-division.js';
import { financeOverviewView } from './views/finance-overview.js';
import { financeProgramsView } from './views/finance-programs.js';
import { financeDivisionsView } from './views/finance-divisions.js';
import { financeMasterView } from './views/finance-master.js';
import { financeLogView } from './views/finance-log.js';
import { financeExportView } from './views/finance-export.js';

const root = document.getElementById('app');

// ---------------------------------------------------------------------------
// Rute (01_BLUEPRINT.md bagian 4)
// ---------------------------------------------------------------------------
// Satu halaman masuk untuk semua (D-38). '/finance' dipertahankan agar tautan lama tetap jalan.
addRoute('/', { access: 'login', view: loginView });
addRoute('/finance', { access: 'login', view: loginView });
addRoute('/d/:code', { access: 'division', nav: 'summary', title: 'Ringkasan Program', view: divisionSummaryView });
addRoute('/d/:code/overview', { access: 'division', nav: 'overview', title: 'Overview', view: divisionOverviewView });
addRoute('/d/:code/new', { access: 'division', nav: 'new', title: 'Tambah Program', view: programFormView, writable: true });
addRoute('/d/:code/p/:id', { access: 'division', nav: 'summary', title: 'Detail Program', view: programDetailView });
addRoute('/d/:code/p/:id/edit', { access: 'division', nav: 'summary', title: 'Ubah Program', view: programFormView, writable: true });
addRoute('/finance/overview', { access: 'finance', nav: 'f-overview', title: 'Overview Finance', view: financeOverviewView });
addRoute('/finance/programs', { access: 'finance', nav: 'f-programs', title: 'Semua Program', view: financeProgramsView });
addRoute('/finance/p/:id', { access: 'finance', nav: 'f-programs', title: 'Detail Program', view: programDetailView });
addRoute('/finance/divisions', { access: 'finance', nav: 'f-divisions', title: 'Divisi & PIN', view: financeDivisionsView });
addRoute('/finance/master', { access: 'finance', nav: 'f-master', title: 'Kategori', view: financeMasterView });
addRoute('/finance/log', { access: 'finance', nav: 'f-log', title: 'Log Riwayat', view: financeLogView });
addRoute('/finance/export', { access: 'finance', nav: 'f-export', title: 'Export Data', view: financeExportView });

// ---------------------------------------------------------------------------
// Sesi berakhir di tengah jalan -> kembali ke PIN gate rute yang sama (data form aman di autosave)
// ---------------------------------------------------------------------------
// Beberapa permintaan bisa gagal hampir bersamaan; tangani SEKALI saja (jeda 3 detik) supaya
// halaman PIN tidak dirender ulang saat pengguna sedang mengetik PIN.
let lastExpiredAt = 0;
setAuthExpiredHandler(() => {
  const now = Date.now();
  if (now - lastExpiredAt < 3000) return;
  lastExpiredAt = now;
  setTimeout(() => {
    toast(MESSAGES.AUTH_EXPIRED, 'warning');
    refresh();
  }, 0);
});

async function logout() {
  const s = getSession();
  const ok = await confirmDialog({ title: 'Keluar dari portal?', message: 'Anda perlu memasukkan PIN lagi untuk masuk.', confirmLabel: 'Keluar' });
  if (!ok) return;
  try { await rpc('rpc_logout'); } catch { /* sesi di server akan kedaluwarsa sendiri */ }
  if (s?.role === 'division' && s.division) clearDivisionDrafts(s.division.code);
  clearSession();
  navigate('/', { force: true });
}

function renderLogin(contacts, ctx) {
  return loginView(renderPublic(root, contacts, { narrow: true }), ctx);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
let renderSeq = 0;
async function render() {
  const myRender = ++renderSeq;
  window.scrollTo(0, 0);
  const contacts = isConfigured() ? await getContacts() : FALLBACK_CONTACTS;
  if (myRender !== renderSeq) return; // sudah ada navigasi yang lebih baru

  if (!isConfigured()) {
    const main = renderPublic(root, contacts, { narrow: true });
    main.append(errorBlock(MESSAGES.CONFIG));
    return;
  }

  const { path, query } = parseHash();
  const match = matchRoute(path);
  if (!match) {
    const main = renderPublic(root, contacts, { narrow: true });
    main.append(flash('warning', ['Halaman tidak ditemukan. ', h('a', { href: '#/' }, 'Kembali ke beranda'), '.']));
    return;
  }
  const { route, params } = match;
  const ctx = { params, query, contacts, path };

  try {
    if (route.access === 'login') {
      const s = getSession();
      if (s) { navigate(homePathFor(s), { replace: true }); return; } // sudah masuk -> halaman sendiri
      await renderLogin(contacts, ctx);
      return;
    }

    if (route.access === 'division') {
      const division = await findDivision(params.code);
      if (myRender !== renderSeq) return;
      if (!division) {
        const main = renderPublic(root, contacts, { narrow: true });
        main.append(flash('warning', ['Divisi tidak ditemukan. ', h('a', { href: '#/' }, 'Kembali ke halaman masuk'), '.']));
        return;
      }
      ctx.division = division;
      if (!canAccessDivision(params.code)) {
        await renderLogin(contacts, { ...ctx, returnTo: path, wanted: division });
        return;
      }
      const s = getSession();
      ctx.session = s;
      ctx.readOnly = s.role === 'finance';
      if (route.writable && ctx.readOnly) {
        const main = divisionShell(ctx, route);
        main.append(flash('info', 'Finance tidak mengubah program lewat form divisi. Untuk merevisi item, buka detail program.'));
        return;
      }
      await route.view(divisionShell(ctx, route), ctx);
      return;
    }

    if (route.access === 'finance') {
      if (!isFinance()) {
        await renderLogin(contacts, { ...ctx, returnTo: path, financeOnly: true });
        return;
      }
      ctx.session = getSession();
      ctx.readOnly = true;
      ctx.finance = true;
      await route.view(financeShell(ctx, route), ctx);
    }
  } catch (e) {
    console.error(e);
    const main = root.querySelector('#main') || renderPublic(root, contacts, { narrow: true });
    main.replaceChildren(errorBlock('Halaman gagal dimuat. Muat ulang halaman; bila berlanjut, hubungi Finance.', () => refresh()));
  }
}

function divisionShell(ctx, route) {
  const s = ctx.session;
  const code = ctx.params.code;
  const nav = [
    { key: 'summary', label: 'Ringkasan Program', icon: 'list', href: `#/d/${code}` },
    { key: 'overview', label: 'Overview', icon: 'overview', href: `#/d/${code}/overview` },
  ];
  if (!ctx.readOnly) nav.push({ key: 'new', label: 'Tambah Program', icon: 'plus', href: `#/d/${code}/new` });
  if (ctx.readOnly) {
    nav.push({ group: 'Finance' });
    nav.push({ key: 'back', label: 'Kembali ke Finance', icon: 'arrow-left', href: '#/finance/overview' });
  }
  return renderShell(root, {
    nav,
    active: route.nav,
    pageTitle: route.title,
    context: { title: ctx.division.name, sub: ctx.readOnly ? 'Dilihat oleh Finance (hanya lihat)' : ctx.division.group_name },
    user: {
      name: s.actor_name || (s.role === 'finance' ? 'Finance' : ctx.division.name),
      role: s.role === 'finance' ? 'Finance' : `PIC ${ctx.division.name}`,
    },
    onLogout: () => logout(),
    contacts: ctx.contacts,
    headerExtra: notificationBell(s),
  });
}

function financeShell(ctx, route) {
  const s = ctx.session;
  return renderShell(root, {
    nav: [
      { key: 'f-overview', label: 'Overview', icon: 'overview', href: '#/finance/overview' },
      { key: 'f-programs', label: 'Semua Program', icon: 'list', href: '#/finance/programs' },
      { group: 'Pengaturan' },
      { key: 'f-divisions', label: 'Divisi & PIN', icon: 'key', href: '#/finance/divisions' },
      { key: 'f-master', label: 'Kategori', icon: 'tag', href: '#/finance/master' },
      { group: 'Laporan' },
      { key: 'f-log', label: 'Log Riwayat', icon: 'activity', href: '#/finance/log' },
      { key: 'f-export', label: 'Export Data', icon: 'download', href: '#/finance/export' },
    ],
    active: route.nav,
    pageTitle: route.title,
    context: { title: 'Finance', sub: 'Akses semua divisi' },
    user: { name: s.actor_name || 'Finance', role: 'Finance' },
    onLogout: () => logout(),
    contacts: ctx.contacts,
    headerExtra: notificationBell(s),
  });
}

startRouter(render);
