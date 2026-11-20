// Grafik Dashboard (D-48). Digambar sendiri dengan SVG (tanpa pustaka luar, aman untuk CSP).
// Grafik hanya MENAMPILKAN angka dari database (rpc_*overview / rpc_*overview_detail); tidak menghitung ulang total.
// Warna lewat kelas CSS yang memakai token --viz-* (app.css); teks lewat textContent (aman XSS).

import { h, MONTHS, MONTHS_SHORT, formatRupiah, formatPercent, plural } from '../utils.js';
import { onCleanup } from '../router.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

export function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  if (parent) parent.append(el);
  return el;
}

const reduceMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** "Rp 649 jt", "Rp 3,46 M" (label grafik). Angka lengkap selalu ada di tabel dan keterangan. */
export function compactRupiah(value) {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  const f = (x, d) => x.toLocaleString('id-ID', { maximumFractionDigits: d });
  if (a >= 999.5e9) return `Rp ${f(n / 1e12, 2)} T`;
  if (a >= 999.5e6) return `Rp ${f(n / 1e9, 2)} M`;
  if (a >= 1e6) return `Rp ${f(Math.round(n / 1e6), 0)} jt`;
  return formatRupiah(n);
}
const bare = (n) => compactRupiah(n).replace('Rp ', '');
const share = (part, whole) => (whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0);

// ---------------------------------------------------------------------------
// Keterangan melayang (hover / fokus keyboard)
// ---------------------------------------------------------------------------
let tipEl = null;
function tip() {
  if (!tipEl || !tipEl.isConnected) {
    tipEl = h('div', { class: 'chart-tip', role: 'status', hidden: true });
    document.body.append(tipEl);
  }
  return tipEl;
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }
function showTip(evt, title, lines) {
  const t = tip();
  t.replaceChildren(h('b', null, title), ...lines.filter(Boolean).map((l) => h('span', null, l)));
  t.hidden = false;
  let x; let y;
  if (evt && 'clientX' in evt && evt.clientX) { x = evt.clientX; y = evt.clientY; } else {
    const r = evt.currentTarget.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top;
  }
  const w = t.offsetWidth; const hh = t.offsetHeight;
  t.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2))}px`;
  t.style.top = `${y - hh - 12 < 8 ? y + 16 : y - hh - 12}px`;
}
export function bindTip(node, title, lines = []) {
  const show = (e) => showTip(e, title, lines);
  node.addEventListener('pointerenter', show);
  node.addEventListener('pointermove', show);
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hideTip);
}

// ---------------------------------------------------------------------------
// Kontrol
// ---------------------------------------------------------------------------
/** Tombol bersebelahan (mis. Grafik | Tabel). */
export function segmented(items, initial, onPick, label) {
  const wrap = h('div', { class: 'seg-toggle', role: 'group', 'aria-label': label });
  for (const it of items) {
    const b = h('button', { type: 'button', 'aria-pressed': String(it.value === initial) }, it.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(it.value);
    });
    wrap.append(b);
  }
  return wrap;
}

/** Tombol kuartal dengan sorotan yang bergeser. */
function chartTabs(items, initial, onPick, label) {
  const ind = h('span', { class: 'chart-tab-ind', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'chart-tabs', role: 'group', 'aria-label': label }, ind);
  const move = () => {
    const b = wrap.querySelector('.chart-tab[aria-pressed="true"]');
    if (!b) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.left = `${b.offsetLeft}px`; ind.style.top = `${b.offsetTop}px`;
    ind.style.width = `${b.offsetWidth}px`; ind.style.height = `${b.offsetHeight}px`;
  };
  for (const it of items) {
    const b = h('button', { type: 'button', class: 'chart-tab', 'aria-pressed': String(it.value === initial), 'aria-label': it.aria || null }, it.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.chart-tab').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      move();
      onPick(it.value);
    });
    wrap.append(b);
  }
  requestAnimationFrame(move);
  if (window.ResizeObserver) { const ro = new ResizeObserver(move); ro.observe(wrap); onCleanup(() => ro.disconnect()); }
  return wrap;
}

/** Kartu bagian Dashboard: judul + tombol Grafik | Tabel. Tabel lama tetap ada (sumber angka lengkap). */
export function chartSection({ title, subtitle, chart, table, tools = [] }) {
  const chartPane = h('div', { class: 'chart-pane is-chart' }, chart);
  const tablePane = table ? h('div', { class: 'chart-pane is-table', hidden: true }, table) : null;
  const toggle = table ? segmented([{ label: 'Grafik', value: 'g' }, { label: 'Tabel', value: 't' }], 'g', (v) => {
    chartPane.hidden = v !== 'g'; tablePane.hidden = v !== 't'; hideTip();
  }, `Tampilan ${title}`) : null;
  return h('section', { class: 'wm-card card-table chart-card' },
    h('div', { class: 'card-head' },
      h('div', null, h('h2', { class: 'wm-card-title' }, title), subtitle ? h('p', { class: 'wm-card-subtitle' }, subtitle) : null),
      h('div', { class: 'chart-tools' }, tools, toggle)),
    chartPane, tablePane);
}

// ---------------------------------------------------------------------------
// Bagian grafik bersama
// ---------------------------------------------------------------------------
/** Kepala angka (label kecil, angka besar yang bergulir, keterangan). */
function valueHead() {
  const label = h('div', { class: 'chart-label' });
  const value = h('div', { class: 'chart-value' });
  const sub = h('div', { class: 'chart-sub' });
  let cur = null; let raf = 0;
  const setValue = (v) => {
    const from = cur ?? v; cur = v; cancelAnimationFrame(raf);
    if (reduceMotion() || from === v) { value.textContent = compactRupiah(v); value.title = formatRupiah(v); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 260); const e = 1 - (1 - k) ** 3;
      value.textContent = compactRupiah(from + (v - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    value.title = formatRupiah(v);
    raf = requestAnimationFrame(step);
  };
  onCleanup(() => cancelAnimationFrame(raf));
  return {
    el: h('div', { class: 'chart-head' }, label, value, sub),
    set(l, v, ...subParts) { label.textContent = l; setValue(v); sub.replaceChildren(...subParts); },
  };
}

function monthAxis(xOf, W) {
  const m = h('div', { class: 'chart-months', 'aria-hidden': 'true' });
  [0, 3, 6, 9, 11].forEach((i) => {
    const s = h('span', null, MONTHS_SHORT[i]);
    s.style.left = `${(xOf(i) / W) * 100}%`;
    s.style.transform = i === 0 ? 'none' : i === 11 ? 'translateX(-100%)' : 'translateX(-50%)';
    m.append(s);
  });
  return m;
}

/** Penggeser: pointer/sentuh/panah memilih bulan; klik/Enter memilih. */
function scrubber(svg, W, xOf, { onHover, onLeave, onPick }) {
  let cur = null;
  const at = (e) => {
    const r = svg.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0; for (let i = 1; i < 12; i += 1) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
    return best;
  };
  svg.setAttribute('tabindex', '0');
  svg.classList.add('chart-scrub');
  svg.addEventListener('pointermove', (e) => { cur = at(e); onHover(cur); });
  svg.addEventListener('pointerleave', () => { cur = null; onLeave(); });
  svg.addEventListener('blur', () => { cur = null; onLeave(); });
  svg.addEventListener('click', (e) => { cur = at(e); onPick(cur); });
  svg.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && cur !== null) { e.preventDefault(); onPick(cur); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    cur = Math.max(0, Math.min(11, (cur ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)));
    onHover(cur);
  });
}

/** Kurva halus "monotone": tidak pernah melewati titik data (tidak bergelombang palsu). */
function monoPath(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const hx = (i) => pts[i + 1][0] - pts[i][0];
  const sl = (i) => (pts[i + 1][1] - pts[i][1]) / hx(i);
  const t = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const s0 = sl(i - 1); const s1 = sl(i); const h0 = hx(i - 1); const h1 = hx(i);
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  t[0] = n > 2 ? (3 * sl(0) - t[1]) / 2 : sl(0);
  t[n - 1] = n > 2 ? (3 * sl(n - 2) - t[n - 2]) / 2 : sl(n - 2);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const dx = hx(i) / 3;
    d += `C${pts[i][0] + dx},${pts[i][1] + dx * t[i]} ${pts[i + 1][0] - dx},${pts[i + 1][1] - dx * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function drawIn(line, area) {
  if (reduceMotion()) return;
  const L = line.getTotalLength();
  if (!L) return;
  line.style.strokeDasharray = `${L}`;
  line.style.strokeDashoffset = `${L}`;
  if (area) area.style.opacity = '0';
  line.getBoundingClientRect();
  line.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.22, 0.8, 0.3, 1)';
  line.style.strokeDashoffset = '0';
  if (area) { area.style.transition = 'opacity 0.8s ease 0.25s'; area.style.opacity = '1'; }
  const t = setTimeout(() => { line.style.strokeDasharray = ''; line.style.strokeDashoffset = ''; }, 950);
  onCleanup(() => clearTimeout(t));
}

const moveTo = (node, x, y = 0) => { node.style.transform = `translate(${x}px, ${y}px)`; };
const gradient = (svg, top = 'chart-stop-top', bottom = 'chart-stop-bottom') => {
  const id = `chart-grad-${(uid += 1)}`;
  const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svgEl('defs', {}, svg));
  svgEl('stop', { offset: '0%', class: top }, g);
  svgEl('stop', { offset: '100%', class: bottom }, g);
  return `url(#${id})`;
};
const empty = () => h('p', { class: 'chart-empty' }, 'Belum ada program Diajukan.');

// ---------------------------------------------------------------------------
// 1) Ringkasan: akumulasi sepanjang tahun
// ---------------------------------------------------------------------------
/**
 * @param {{monthly:number[], counts:number[], total:number, count:number, year:number, onPick:(month:number, expected:{total:number,count:number})=>void}} o
 */
export function cumulativeChart({ monthly, counts, total, count, year, onPick }) {
  if (!(total > 0)) return empty();
  onCleanup(hideTip);
  const cum = []; const cumCount = [];
  monthly.reduce((a, v, i) => (cum[i] = a + v), 0);
  counts.reduce((a, v, i) => (cumCount[i] = a + v), 0);
  const W = 640; const H = 150; const PX = 8; const T = 10; const PH = 136;
  const xOf = (i) => PX + i * ((W - 2 * PX) / 11);
  const Y = (v) => T + (1 - v / total) * (PH - 6);
  const head = valueHead();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `Akumulasi anggaran ${year}. Panah kiri dan kanan memilih bulan, Enter membuka rincian.` });
  const fill = gradient(svg);
  const pathTo = (n) => monoPath(cum.slice(0, n + 1).map((v, i) => [xOf(i), Y(v)]));
  svgEl('path', { d: pathTo(11), class: 'chart-line-bg' }, svg);
  const area = svgEl('path', { fill }, svg);
  const line = svgEl('path', { class: 'chart-line' }, svg);
  const cross = svgEl('line', { x1: 0, x2: 0, y1: 0, y2: T + PH, class: 'chart-cross glide' }, svg);
  const dot = svgEl('circle', { cx: 0, cy: 0, r: 5, class: 'chart-dot glide' }, svg);
  let anchor = 11;
  const show = (i, hover) => {
    if (i === 11 && !hover) head.set('Total anggaran diajukan', cum[i], h('b', null, plural(count, 'program')), ` diajukan · Januari–Desember ${year}`);
    else head.set(`s.d. akhir ${MONTHS[i]} ${year}`, cum[i], h('b', null, formatPercent(share(cum[i], total))), ` dari total · ${plural(cumCount[i], 'program')}${hover ? ' · klik untuk rincian' : ''}`);
    moveTo(dot, xOf(i), Y(cum[i]));
  };
  const draw = () => {
    const p = pathTo(anchor);
    line.setAttribute('d', p);
    area.setAttribute('d', `${p}L${xOf(anchor)},${T + PH}L${xOf(0)},${T + PH}Z`);
    cross.style.opacity = '0';
    show(anchor, false);
  };
  scrubber(svg, W, xOf, {
    onHover: (i) => { cross.style.opacity = '1'; moveTo(cross, xOf(i)); show(i, true); },
    onLeave: draw,
    onPick: (i) => onPick(i + 1, { total: cum[i], count: cumCount[i] }),
  });
  const tabs = chartTabs([
    { label: 'Q1', value: 2, aria: 'Sampai akhir Maret' }, { label: 'Q2', value: 5, aria: 'Sampai akhir Juni' },
    { label: 'Q3', value: 8, aria: 'Sampai akhir September' }, { label: '1 Thn', value: 11, aria: 'Setahun' },
  ], 11, (v) => { anchor = v; draw(); }, 'Akumulasi sampai akhir kuartal');
  dot.classList.remove('glide');
  draw();
  requestAnimationFrame(() => { dot.classList.add('glide'); drawIn(line, area); });
  return h('div', { class: 'chart-block' }, head.el, h('div', { class: 'chart-frame' }, svg, monthAxis(xOf, W)), tabs);
}

// ---------------------------------------------------------------------------
// 2) Per bulan: batang + angka, garis % (pita terpisah, skala sendiri).
//    Gaya D-54: batang bergradasi bersudut atas membulat, garis ungu halus tanpa titik
//    (titik hanya di bulan yang ditunjuk), garis bantu tipis pada angka bulat.
// ---------------------------------------------------------------------------
/** Jarak garis bantu yang bulat (1 / 2 / 2,5 / 5 × 10^n), kira-kira 3 garis sampai batang tertinggi. */
export function niceStep(max) {
  if (!(max > 0)) return 0;
  const raw = max / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Batang dengan sudut atas membulat; bawahnya tetap rata di garis dasar. */
function barPath(x, y, w, hgt, r) {
  if (!(hgt > 0)) return '';
  const rr = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hgt}Z`;
}

function growBar(node, x, w, base, hgt, delay) {
  if (reduceMotion() || !(hgt > 0)) return;
  node.setAttribute('d', '');
  const t0 = performance.now() + delay;
  const step = (now) => {
    const k = Math.max(0, Math.min(1, (now - t0) / 520)); const e = 1 - (1 - k) ** 3;
    const hh = hgt * e;
    node.setAttribute('d', barPath(x, base - hh, w, hh, 6));
    if (k < 1) requestAnimationFrame(step); // langkah terakhir (k = 1) selalu tinggi penuh yang tepat
  };
  requestAnimationFrame(step);
}

/**
 * @param {{rows:Array<{bulan:number,count:number,total:number,pct:number}>, total:number, count:number, year:number,
 *          onMonth:(row)=>void, onQuarter:(q:number)=>void}} o  rows = per_bulan dari database
 */
export function monthlyChart({ rows, total, count, year, onMonth, onQuarter }) {
  if (!(total > 0)) return empty();
  onCleanup(hideTip);
  const vals = rows.map((r) => Number(r.total) || 0);
  const max = Math.max(...vals);
  const top = vals.indexOf(max);
  const W = 780; const H = 330; const PL = 16; const PR = 40; // kanan: ruang label garis bantu
  const band = (W - PL - PR) / 12; const bw = band * 0.56;
  const xOf = (i) => PL + band * i + band / 2;
  const L0 = 34; const L1 = 96; const B0 = 132; const B1 = 296;
  const pcts = rows.map((r) => Number(r.pct) || 0);
  const pmax = Math.max(...pcts); const pmin = Math.min(...pcts);
  const yL = (p) => L1 - (pmax === pmin ? 0.5 : (p - pmin) / (pmax - pmin)) * (L1 - L0);
  const yB = (v) => B1 - (max ? (v / max) * (B1 - B0) : 0);
  const head = valueHead();
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg chart-svg-wide', role: 'img', 'aria-label': `Anggaran per bulan ${year} (batang) dan porsi dari total setahun (garis). Panah kiri dan kanan memilih bulan, Enter membuka rincian.` });
  const barFill = gradient(svg, 'chart-bar-top', 'chart-bar-bottom');
  const areaFill = gradient(svg, 'chart-area-top', 'chart-area-bottom');
  const hl = svgEl('rect', { x: 0, y: 6, width: band * 3, height: H - 12, rx: 10, class: 'chart-hl' }, svg);
  const cols = vals.map((_, i) => svgEl('rect', { x: xOf(i) - band / 2 + 3, y: 12, width: band - 6, height: H - 20, rx: 8, class: 'chart-col' }, svg));
  const text = (x, y, s, cls, anchor = 'middle') => { const t = svgEl('text', { x, y, 'text-anchor': anchor, class: cls }, svg); t.textContent = s; return t; };
  const step = niceStep(max);
  for (let k = 1; step > 0 && k * step < max; k += 1) {
    const gy = yB(k * step);
    svgEl('line', { x1: PL, x2: W - PR + 6, y1: gy, y2: gy, class: 'chart-grid' }, svg);
    text(W - 2, gy + 3.5, bare(k * step), 'chart-grid-label', 'end');
  }
  svgEl('line', { x1: PL, x2: W - PR + 6, y1: B1, y2: B1, class: 'chart-base' }, svg);
  const bars = []; const vLabels = []; const pLabels = []; const rings = []; const axes = []; const geo = [];
  vals.forEach((v, i) => {
    const hgt = v > 0 ? Math.max(2, B1 - yB(v)) : 0;
    const x = xOf(i) - bw / 2;
    geo.push([x, hgt]);
    bars.push(svgEl('path', { d: barPath(x, B1 - hgt, bw, hgt, 6), fill: barFill, class: 'chart-bar' }, svg));
    vLabels.push(text(xOf(i), B1 - hgt - 8, bare(v), i === top ? 'chart-val is-top' : 'chart-val'));
    axes.push(text(xOf(i), H - 10, MONTHS_SHORT[i], 'chart-axis'));
  });
  const pts = pcts.map((p, i) => [xOf(i), yL(p)]);
  const lineD = monoPath(pts); // kurva monoton: selalu tepat melewati setiap titik %
  const area = svgEl('path', { d: `${lineD}L${xOf(11)},${L1 + 22}L${xOf(0)},${L1 + 22}Z`, fill: areaFill }, svg);
  const pline = svgEl('path', { d: lineD, class: 'chart-line2' }, svg);
  pts.forEach(([x, y], i) => {
    rings.push(svgEl('circle', { cx: x, cy: y, r: 5, class: 'chart-ring' }, svg));
    pLabels.push(text(x, y - 11, formatPercent(pcts[i]), 'chart-pct'));
  });
  let range = null;
  const paint = (hov) => {
    if (range && hov === null) { hl.classList.add('is-on'); moveTo(hl, xOf(range[0]) - band / 2); } else hl.classList.remove('is-on');
    vals.forEach((_, i) => {
      const dim = hov !== null ? i !== hov : range ? !range.includes(i) : false;
      [bars[i], vLabels[i], pLabels[i]].forEach((n) => n.classList.toggle('is-dim', dim));
      [cols[i], rings[i], pLabels[i], axes[i]].forEach((n) => n.classList.toggle('is-on', i === hov));
    });
  };
  const rest = () => {
    if (range) {
      const q = range[0] / 3;
      const s = range.reduce((a, i) => a + vals[i], 0); const c = range.reduce((a, i) => a + (Number(rows[i].count) || 0), 0);
      head.set(`Q${q + 1} ${year} · ${MONTHS_SHORT[range[0]]}–${MONTHS_SHORT[range[2]]}`, s, h('b', null, formatPercent(share(s, total))), ` dari total · ${plural(c, 'program')} · klik batang yang menyala atau Q${q + 1} lagi untuk rincian`);
    } else {
      head.set(`Total 1 tahun · ${year}`, total, h('b', null, plural(count, 'program')), ` · bulan terbesar ${MONTHS[top]} (${compactRupiah(max)})`);
    }
    paint(null);
  };
  scrubber(svg, W, xOf, {
    onHover: (i) => {
      if (range && range.includes(i)) { rest(); return; }
      head.set(`${MONTHS[i]} ${year}`, vals[i], h('b', null, formatPercent(pcts[i])), ` dari total · ${plural(Number(rows[i].count) || 0, 'program')} · klik untuk rincian`);
      paint(i);
    },
    onLeave: rest,
    onPick: (i) => {
      if (range && range.includes(i)) onQuarter(range[0] / 3);
      else if (vals[i] > 0) onMonth(rows[i]);
    },
  });
  const quarters = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  const tabs = chartTabs([
    ...quarters.map((m, q) => ({ label: `Q${q + 1}`, value: m, aria: `Kuartal ${q + 1}` })),
    { label: '1 Thn', value: null, aria: 'Setahun' },
  ], null, (v) => {
    if (v && range === v) { onQuarter(v[0] / 3); return; } // klik kedua pada kuartal yang sama = rincian
    range = v; rest();
  }, 'Pilih kuartal');
  const legend = h('div', { class: 'chart-legend' },
    h('span', null, h('i', { class: 'is-bar' }), 'Anggaran per bulan (batang)'),
    h('span', null, h('i', { class: 'is-line' }), '% dari total setahun (garis)'));
  hl.style.transition = 'none';
  rest();
  requestAnimationFrame(() => {
    hl.style.transition = '';
    bars.forEach((b, i) => growBar(b, geo[i][0], bw, B1, geo[i][1], i * 30));
    drawIn(pline, area);
  });
  return h('div', { class: 'chart-block' }, head.el, legend, h('div', { class: 'chart-scroll' }, svg), tabs);
}

// ---------------------------------------------------------------------------
// 3) Per grup: pie (gradasi biru merek menurut urutan besar; disorot oranye)
// ---------------------------------------------------------------------------
const TINT = [100, 82, 66, 54, 44, 35, 27, 20];
/**
 * @param {{groups:Array<{name:string,count:number,total:number,pct:number}>, divisionsOf:(name:string)=>number, total:number, onPick:(row)=>void}} o
 */
export function groupPie({ groups, divisionsOf, total, onPick }) {
  if (!(total > 0)) return empty();
  onCleanup(hideTip);
  const sorted = groups.filter((g) => Number(g.total) > 0).sort((a, b) => Number(b.total) - Number(a.total) || a.name.localeCompare(b.name));
  const color = (k) => `color-mix(in srgb, var(--viz-1) ${TINT[Math.min(k, TINT.length - 1)]}%, var(--card))`;
  const S = 260; const c = S / 2; const r = 120;
  const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, class: 'chart-pie', role: 'img', 'aria-label': 'Pie anggaran per grup' });
  const slices = []; const rows = [];
  const light = (name) => {
    sorted.forEach((g, k) => {
      const on = name === g.name;
      slices[k].style.fill = on ? 'var(--viz-2)' : color(k);
      slices[k].classList.toggle('is-dim', Boolean(name) && !on);
      rows[k].classList.toggle('is-on', on);
    });
  };
  let a0 = -Math.PI / 2;
  const legend = h('div', { class: 'pie-legend' });
  sorted.forEach((g, k) => {
    const v = Number(g.total);
    const a1 = a0 + (v / total) * Math.PI * 2;
    const p = (ang) => `${c + r * Math.cos(ang)},${c + r * Math.sin(ang)}`;
    const d = sorted.length === 1 ? `M${c},${c - r}A${r},${r} 0 1 1 ${c - 0.01},${c - r}Z` : `M${c},${c}L${p(a0)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}Z`;
    const n = divisionsOf(g.name);
    const s = svgEl('path', { d, class: 'chart-slice', tabindex: 0, role: 'button', 'aria-label': `${g.name}: ${formatRupiah(v)}, ${formatPercent(g.pct)}` }, svg);
    s.style.fill = color(k);
    bindTip(s, g.name, [`${formatRupiah(v)} · ${formatPercent(g.pct)}`, n > 1 ? `${n} divisi · klik untuk rincian` : 'Klik untuk daftar program']);
    s.addEventListener('pointerenter', () => light(g.name));
    s.addEventListener('pointerleave', () => light(null));
    s.addEventListener('click', () => onPick(g));
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g); } });
    slices.push(s);
    if (v / total > 0.08 && k < 4) {
      const mid = (a0 + a1) / 2;
      const t = svgEl('text', { x: c + r * 0.64 * Math.cos(mid), y: c + r * 0.64 * Math.sin(mid) + 4, 'text-anchor': 'middle', class: `chart-slice-label${k < 3 ? ' is-light' : ''}` }, svg);
      t.textContent = formatPercent(g.pct);
    }
    a0 = a1;
    const sw = h('i', { class: 'pie-swatch' }); sw.style.background = color(k);
    const row = h('button', { type: 'button', class: 'pie-row' }, sw,
      h('span', { class: 'pie-name' }, g.name, n > 1 ? h('small', null, ` ${n} divisi`) : null),
      h('b', null, compactRupiah(v)), h('span', { class: 'pie-pct' }, formatPercent(g.pct)));
    row.addEventListener('click', () => onPick(g));
    row.addEventListener('pointerenter', () => light(g.name));
    row.addEventListener('pointerleave', () => light(null));
    row.addEventListener('focus', () => light(g.name));
    row.addEventListener('blur', () => light(null));
    rows.push(row);
    legend.append(row);
  });
  return h('div', { class: 'pie-wrap' }, h('div', { class: 'pie-figure' }, svg), legend);
}

// ---------------------------------------------------------------------------
// 4) Per divisi × bulan: peta warna + kolom total (peringkat)
// ---------------------------------------------------------------------------
/**
 * @param {{divisions:Array, cells:Map<string, number[]>, counts:Map<string, number[]>, monthly:number[], total:number,
 *          onCell:(div, month:number, expected)=>void, onDivision:(div)=>void}} o
 *   divisions = per_divisi (total & jumlah dari database); cells = jumlah total program per divisi per bulan.
 * @returns {{el:HTMLElement, sortControl:HTMLElement}}
 */
export function divisionHeatmap({ divisions, cells, counts, monthly, total, onCell, onDivision }) {
  onCleanup(hideTip);
  const max = Math.max(0, ...[...cells.values()].flat());
  const maxDiv = Math.max(0, ...divisions.map((d) => Number(d.total) || 0));
  const grid = h('div', { class: 'heat', role: 'table', 'aria-label': 'Anggaran per divisi per bulan' });
  const jt = (v) => (v <= 0 ? '' : v < 5e5 ? '<1' : Math.round(v / 1e6).toLocaleString('id-ID'));
  const render = (order) => {
    hideTip();
    const list = order === 'besar' ? [...divisions].sort((a, b) => Number(b.total) - Number(a.total) || a.name.localeCompare(b.name)) : divisions;
    const head = h('div', { class: 'heat-row heat-head', role: 'row' },
      h('span', { class: 'heat-name', role: 'columnheader' }, 'Divisi'),
      ...MONTHS_SHORT.map((m) => h('span', { class: 'heat-m', role: 'columnheader' }, m)),
      h('span', { class: 'heat-total', role: 'columnheader' }, 'Total setahun'));
    const body = list.map((d, idx) => {
      const vals = cells.get(d.code) || Array(12).fill(0);
      const cnt = counts.get(d.code) || Array(12).fill(0);
      const name = h('button', { type: 'button', class: 'heat-name', role: 'rowheader', title: d.name }, d.name,
        h('small', null, order === 'besar' ? `#${idx + 1} · ${d.group_name}` : d.group_name));
      name.addEventListener('click', () => onDivision(d));
      const monthCells = vals.map((v, i) => {
        const label = `${d.name}, ${MONTHS[i]}: ${formatRupiah(v)}`;
        if (!(v > 0)) return h('span', { class: 'heat-c is-zero', role: 'cell', 'aria-label': label });
        const k = 0.1 + 0.9 * Math.sqrt(v / max);
        const cell = h('button', { type: 'button', class: `heat-c${k > 0.6 ? ' is-strong' : ''}`, role: 'cell', 'aria-label': label }, jt(v));
        cell.style.background = `color-mix(in srgb, var(--viz-1) ${Math.round(k * 100)}%, var(--card))`;
        bindTip(cell, `${d.name} · ${MONTHS[i]}`, [formatRupiah(v), `${plural(cnt[i], 'program')} · klik untuk rincian`]);
        cell.addEventListener('click', () => onCell(d, i + 1, { total: v, count: cnt[i] }));
        return cell;
      });
      const bar = h('i'); bar.style.width = `${maxDiv ? (Number(d.total) / maxDiv) * 100 : 0}%`;
      const tot = h('button', { type: 'button', class: 'heat-total', role: 'cell', 'aria-label': `${d.name} setahun: ${formatRupiah(d.total)}` },
        h('span', { class: 'heat-bar' }, bar), h('b', null, compactRupiah(d.total)));
      bindTip(tot, d.name, [`${formatRupiah(d.total)} · ${formatPercent(d.pct)} dari total`, `${plural(Number(d.count) || 0, 'program')}`]);
      tot.addEventListener('click', () => onDivision(d));
      return h('div', { class: 'heat-row', role: 'row' }, name, ...monthCells, tot);
    });
    const foot = h('div', { class: 'heat-row heat-foot', role: 'row' },
      h('span', { class: 'heat-name', role: 'rowheader' }, 'Total'),
      ...monthly.map((v) => h('span', { class: 'heat-m', role: 'cell', title: formatRupiah(v) }, jt(v) || '0')),
      h('span', { class: 'heat-total', role: 'cell', title: formatRupiah(total) }, h('b', null, compactRupiah(total))));
    grid.replaceChildren(head, ...body, foot);
  };
  render('grup');
  const sortControl = segmented([{ label: 'Urut grup', value: 'grup' }, { label: 'Terbesar', value: 'besar' }], 'grup', render, 'Urutan divisi');
  const legend = h('div', { class: 'heat-legend' }, h('span', null, 'Rp 0'), h('i', { 'aria-hidden': 'true' }), h('span', null, compactRupiah(max)),
    h('span', null, '· angka di kotak dalam juta rupiah · kotak kosong = tidak ada anggaran'));
  return { el: h('div', { class: 'chart-block' }, h('div', { class: 'heat-scroll' }, grid), legend), sortControl };
}
