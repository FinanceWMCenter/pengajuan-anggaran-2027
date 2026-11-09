// Hash router sederhana (#/...), cocok untuk GitHub Pages statis.
// Mendukung "penjaga keluar" (leave guard) agar form dengan perubahan belum tersimpan tidak hilang.

const routes = [];
let renderFn = () => {};
let leaveGuard = null;
let cleanups = [];
let currentHash = '';
let ignoreNext = false;

/** Daftarkan rute. pattern contoh: '/d/:code/p/:id' */
export function addRoute(pattern, def) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  routes.push({ pattern, regex, keys, ...def });
}

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function matchRoute(path) {
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

/** Penjaga keluar: fungsi async yang mengembalikan true bila boleh pindah halaman. */
export function setLeaveGuard(fn) {
  leaveGuard = fn;
}

/** Fungsi yang dijalankan sebelum halaman berikutnya dirender (lepas listener, dsb.). */
export function onCleanup(fn) {
  cleanups.push(fn);
}

function runCleanups() {
  const fns = cleanups;
  cleanups = [];
  leaveGuard = null;
  fns.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

export function navigate(path, { replace = false, force = false } = {}) {
  const target = `#${path}`;
  if (force) leaveGuard = null;
  if (replace) {
    history.replaceState(null, '', target);
    handleChange();
  } else if (location.hash === target) {
    handleChange();
  } else {
    location.hash = target;
  }
}

/** Ganti alamat tanpa merender ulang (mis. setelah draft baru tersimpan: /new -> /p/:id/edit). */
export function replacePathSilently(path) {
  history.replaceState(null, '', `#${path}`);
  currentHash = location.hash;
}

/** Render ulang halaman saat ini (tanpa menanyakan penjaga). */
export function refresh() {
  runCleanups();
  currentHash = location.hash;
  renderFn();
}

async function handleChange() {
  if (ignoreNext) {
    ignoreNext = false;
    return;
  }
  if (leaveGuard && location.hash !== currentHash) {
    const ok = await leaveGuard();
    if (!ok) {
      ignoreNext = true;
      history.replaceState(null, '', currentHash || '#/');
      ignoreNext = false;
      return;
    }
  }
  refresh();
}

export function startRouter(render) {
  renderFn = render;
  window.addEventListener('hashchange', handleChange);
  currentHash = location.hash;
  refresh();
}
