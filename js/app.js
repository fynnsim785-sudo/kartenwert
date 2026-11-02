import { GAMES, today, searchCards, getCard, getSets, getSet } from './cards.js';
import { identify, checkPhoto } from './scan.js';
import * as market from './market.js';

const POINTS_PER_EURO = 100;
const START_POINTS = 1000;
const DEX_TOTAL = 1025;
const STORE = 'kartenwert.v1';
const view = document.getElementById('view');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');
const nf = new Intl.NumberFormat('de-DE');
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3.5L9 5.500h6L16.500 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.500"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
};

const state = load();
const ui = {
  tab: 'home', overview: 'overview', range: '1M', cardRange: 'MAX', filter: 'all', game: 'pokemon', allValuable: false,
  photo: null, source: null, found: [], status: null, stream: null, q: '',
  searchView: 'sets', setLang: 'de', sets: {}, set: null, preview: null,
  listings: [], catalog: [], marketReady: null, points: null, mq: '', marketGame: 'all', open: null,
};

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE)); } catch { /* leerer Start */ }
  s = s || {};
  s.cards = s.cards || [];
  s.hashes = s.hashes || [];
  s.watch = s.watch || [];
  s.lastRefresh = s.lastRefresh || 0;
  if (s.cards.some(c => c.game === 'pokemon' && !c.setId)) s.lastRefresh = 0; // ältere Karten ergänzen
  if (!s.secret) s.secret = crypto.randomUUID() + crypto.randomUUID();
  return s;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { toast('Speichern ist in diesem Browser nicht möglich.'); }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pts = price => Math.round((price || 0) * POINTS_PER_EURO);
const eur = cents => money.format((cents || 0) / POINTS_PER_EURO);
const fmt = eur;
const pct = n => n.toFixed(2).replace('.', ',') + ' %';
const dateDe = d => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl.hidden = true; }, 3200);
}

// ---------- Werte und Kurve ----------
function priceOn(card, date) {
  const dates = Object.keys(card.hist || {}).sort();
  let value = null;
  for (const d of dates) { if (d <= date) value = card.hist[d]; }
  return value ?? (dates.length ? card.hist[dates[0]] : card.price) ?? 0;
}
function counted(filter = ui.filter) {
  return state.cards.filter(c => c.verified && (filter === 'all' || c.game === filter));
}
function series(cards, range) {
  const days = { '1T': 1, '7T': 7, '1M': 30, '3M': 90, '6M': 180, MAX: 100000 }[range];
  const from = today(-days);
  const set = new Set([today()]);
  for (const c of cards) for (const d of Object.keys(c.hist || {})) if (d >= from) set.add(d);
  const dates = [...set].sort();
  return dates.map(d => ({ d, v: cards.reduce((sum, c) => sum + pts(priceOn(c, d)), 0) }));
}
function change(points) {
  if (points.length < 2) return null;
  const first = points[0].v, last = points[points.length - 1].v;
  return { diff: last - first, pct: first > 0 ? (last - first) / first * 100 : 0 };
}
const LABEL = { '1T': 'seit gestern', '7T': 'in den letzten 7 Tagen', '1M': 'in den letzten 30 Tagen', '3M': 'in den letzten 90 Tagen', '6M': 'in den letzten 180 Tagen', MAX: 'insgesamt' };
function changeHtml(ch, label) {
  if (!ch) return '<div class="change none">Noch keine Preisänderung</div>';
  return `<div class="change ${ch.diff < 0 ? 'down' : ''}">${ch.diff < 0 ? '-' : '+'}${eur(Math.abs(ch.diff))} ${label}</div>`;
}
function chartSvg(points) {
  const W = 500, H = 270;
  const vals = points.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const list = points.length > 1 ? points : [{ v: points[0].v }, { v: points[0].v }];
  const xy = list.map((p, i) => [i / (list.length - 1) * W, H * .85 - (p.v - min) / (max - min) * (H * .72)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Wertverlauf">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00c48c" stop-opacity=".28"/><stop offset="1" stop-color="#00c48c" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#g)"/><path d="${line}" fill="none" stroke="#00b583" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function rangeButtons(attr, current) {
  return `<div class="ranges">${['1T', '7T', '1M', '3M', '6M', 'MAX'].map(r => `<button data-${attr}="${r}" class="${r === current ? 'on' : ''}">${r}</button>`).join('')}</div>`;
}
// In Listen reicht das kleine Bild, das lädt deutlich schneller.
const cardImg = c => c.image ? `<img src="${esc(c.image.replace('/high.webp', '/low.webp'))}" alt="" loading="lazy">` : '<img alt="">';
const qtyOf = card => state.cards.filter(c => c.id === card.id).length;

function openGames(target) {
  const current = { filter: ui.filter, game: ui.game, marketGame: ui.marketGame }[target];
  const withAll = target !== 'game';
  const tile = (key, name) => `<button class="game ${current === key ? 'on' : ''}" data-pick-game="${key}" data-target="${target}">${esc(name)}</button>`;
  modal.innerHTML = `<div class="sheet"><h3 class="center">Spiel auswählen</h3>
    <div class="games">${withAll ? tile('all', 'Alle Karten') : ''}${Object.entries(GAMES).map(([k, v]) => tile(k, v)).join('')}</div>
    <div class="btns"><button class="btn sec" data-close>Schließen</button></div></div>`;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; modal.innerHTML = ''; ui.open = null; ui.preview = null; }

// ---------- Start ----------
function itemRow(c, ch) {
  const kind = !ch || ch.diff === 0 ? 'flat' : ch.diff < 0 ? 'down' : '';
  return `<button class="item" data-open="${esc(c.key)}">${cardImg(c)}
    <span class="left"><span class="name">${esc(c.name)}</span><span class="sub">${esc(c.set)}</span></span>
    <span class="right">${money.format(c.price || 0)}<span class="pct ${kind}">${ch ? pct(ch.pct) : pct(0)}</span></span>
  </button>`;
}

function renderHome() {
  const cards = counted();
  const points = series(cards, ui.range);
  const value = points[points.length - 1].v;
  const withChange = cards.map(c => ({ c, ch: change(series([c], ui.range)) }));
  const portfolioName = ui.filter === 'all' ? 'Alle Karten' : esc(GAMES[ui.filter]);
  const total = value + (ui.filter === 'all' ? freePoints() : 0);
  const head = `
    <div class="tabs">
      <button data-overview="overview" class="${ui.overview === 'overview' ? 'on' : ''}">Übersicht</button>
      <button data-overview="performance" class="${ui.overview === 'performance' ? 'on' : ''}">Leistung</button>
      <span class="pill"><i>€</i>EUR</span>
    </div>
    <section class="value">
      <div class="label">Guthaben · <button class="link" data-games="filter">${portfolioName}</button></div>
      <div class="big">${eur(total)}</div>
      ${cards.length ? changeHtml(change(points), LABEL[ui.range]) : ''}
      ${cards.length && ui.filter === 'all' ? `<div class="split"><span>Karten <b>${eur(value)}</b></span><span>Frei <b>${eur(freePoints())}</b></span></div>` : ''}
    </section>`;

  if (!cards.length) {
    view.innerHTML = `${head}
      <div class="start"><img src="icon.svg" alt=""><b>Deine Sammlung ist leer</b>
        <p>Fotografiere eine Karte und sieh ihren Preis.</p>
        <button class="btn" data-go="scan">Karte scannen</button></div>`;
    return;
  }

  if (ui.overview === 'performance') {
    const gain = withChange.filter(g => g.ch && g.ch.diff > 0).sort((a, b) => b.ch.pct - a.ch.pct);
    const loss = withChange.filter(g => g.ch && g.ch.diff < 0).sort((a, b) => a.ch.pct - b.ch.pct);
    const box = (title, list, empty) => `<div class="head"><h2>${title}</h2></div><div class="rows">${list.length ? list.map(g => itemRow(g.c, g.ch)).join('') : `<div class="panelnote" style="padding-top:7px">${empty}</div>`}</div>`;
    view.innerHTML = `${head}${rangeButtons('range', ui.range)}
      ${box('Gewinner', gain, 'Keine Karte im Plus.')}
      ${box('Verlierer', loss, 'Keine Karte im Minus.')}`;
    return;
  }

  const valuable = [...withChange].sort((a, b) => (b.c.price || 0) - (a.c.price || 0));
  const visible = ui.allValuable ? valuable : valuable.slice(0, 4);
  const fan = valuable.filter(g => g.c.image).slice(0, 3);
  view.innerHTML = `${head}
    ${chartSvg(points)}
    ${rangeButtons('range', ui.range)}
    <div class="head" style="margin-top:6px"><h2>Am wertvollsten</h2></div>
    <div class="rows">${visible.map(g => itemRow(g.c, g.ch)).join('')}</div>
    ${valuable.length > 4 ? `<button class="link viewall" data-all-valuable>${ui.allValuable ? 'Weniger' : 'Alle anzeigen'}</button>` : ''}
    <button class="banner" data-go="portfolio"><span><b>${cards.length} ${cards.length === 1 ? 'Karte' : 'Karten'}</b><span>Ganze Sammlung ansehen</span></span>
      <span class="fan">${fan.map(g => `<img src="${esc(g.c.image.replace('/high.webp', '/low.webp'))}" alt="">`).join('')}</span></button>`;
}

function openCard(key) {
  const c = state.cards.find(x => x.key === key);
  if (!c) return;
  const points = series([c], ui.cardRange);
  const vals = points.map(p => p.v);
  ui.open = key;
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">←</button>
    ${c.image ? `<img class="cardimg" src="${esc(c.image)}" alt="">` : ''}
    <div class="detail">
      <div><h3>${esc(c.name)}</h3>
        <div class="muted small">${esc(GAMES[c.game])} · ${esc(c.set)}</div>
        <div class="muted small">${[c.rarity, c.number && '#' + c.number].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="pricebox"><div class="big">${money.format(c.price || 0)}</div>${changeHtml(change(points), '')}</div>
    </div>
    ${chartSvg(points)}
    <div class="axis"><span>${dateDe(points[0].d)}</span><span>Tief ${eur(Math.min(...vals))} · Hoch ${eur(Math.max(...vals))}</span><span>${dateDe(points[points.length - 1].d)}</span></div>
    ${rangeButtons('card-range', ui.cardRange)}
    <div class="head" style="margin-top:0"><h2>Dein Bestand</h2></div>
    <p class="note ${c.verified ? 'ok' : 'warn'}" style="margin:0">${c.verified ? 'Anzahl: ' + state.cards.filter(x => x.id === c.id && x.verified).length : 'Zählt nicht. Scanne die Karte mit der Kamera.'}</p>
    ${c.verified && ui.marketReady ? `<div class="head"><h2>Verkaufen</h2></div>
      <div class="fieldwrap"><input class="field" id="sellPrice" type="number" min="0.01" max="100000" step="0.01" value="${Math.max(0.01, c.price || 0).toFixed(2)}" aria-label="Preis in Euro"><span>€</span></div>
      <div class="btns"><button class="btn" data-sell="${esc(c.key)}">Anbieten</button></div>` : ''}
    <div class="btns"><button class="btn sec" data-remove="${esc(c.key)}">Aus der Sammlung entfernen</button></div></div>`;
  modal.hidden = false;
}

// Zeigt eine Karte aus Sets oder Empfehlungen, die noch nicht in der Sammlung ist.
function openPreview(card, note) {
  ui.preview = card;
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">←</button>
    ${card.image ? `<img class="cardimg" src="${esc(card.image)}" alt="">` : ''}
    <div class="detail">
      <div><h3>${esc(card.name)}</h3>
        <div class="muted small">${esc(GAMES[card.game])} · ${esc(card.set)}</div>
        <div class="muted small">${[card.rarity, card.number && '#' + card.number].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="pricebox"><div class="big">${card.price ? money.format(card.price) : 'Kein Preis'}</div></div>
    </div>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="btns"><button class="btn" data-go-scan>Mit Kamera scannen</button>
    <button class="btn sec" data-add-preview>Nur merken (zählt nicht)</button></div></div>`;
  modal.hidden = false;
}

// ---------- Suche, Scanner, Sets ----------
function stopCamera() {
  if (ui.stream) ui.stream.getTracks().forEach(t => t.stop());
  ui.stream = null;
}

function ownedInSet(setId) {
  return counted('pokemon').filter(c => c.setId === setId);
}
function ownedDex() {
  const map = new Map();
  for (const c of counted('pokemon')) for (const n of c.dexId || []) if (!map.has(n)) map.set(n, c);
  return map;
}

function setsHtml() {
  const sets = ui.sets[ui.setLang];
  const dex = ownedDex();
  const dexValue = [...new Set(counted('pokemon').filter(c => (c.dexId || []).length))].reduce((s, c) => s + (c.price || 0), 0);
  return `<div class="subtabs">
      <button data-set-lang="de" class="${ui.setLang === 'de' ? 'on' : ''}">Deutsch</button>
      <button data-set-lang="en" class="${ui.setLang === 'en' ? 'on' : ''}">Englisch</button>
      <button data-set-lang="ja" class="${ui.setLang === 'ja' ? 'on' : ''}">Japanisch</button>
    </div>
    <div class="sets">
      <button class="set ${dex.size ? '' : 'none'}" data-dex>
        <span class="logo"><span class="dex">POKÉDEX</span></span>
        <span class="bar"><i style="width:${dex.size / DEX_TOTAL * 100}%"></i></span>
        <span class="line"><span>${nf.format(dex.size)}/${nf.format(DEX_TOTAL)}</span><b>${money.format(dexValue)}</b></span>
      </button>
      ${(sets || []).map(s => {
        const own = ownedInSet(s.id);
        const distinct = new Set(own.map(c => c.rawId)).size;
        const value = own.reduce((sum, c) => sum + (c.price || 0), 0);
        return `<button class="set ${distinct ? '' : 'none'}" data-set="${esc(s.id)}" aria-label="${esc(s.name)}">
          <span class="logo">${s.logo ? `<img src="${esc(s.logo)}.png" alt="${esc(s.name)}" loading="lazy">` : `<span>${esc(s.name)}</span>`}</span>
          <span class="bar"><i style="width:${distinct / Math.max(1, s.total) * 100}%"></i></span>
          <span class="line"><span>${distinct}/${s.total}</span><b>${money.format(value)}</b></span>
        </button>`;
      }).join('')}
      ${sets ? '' : '<div class="skeleton"></div>'.repeat(5)}
    </div>`;
}

function setHtml() {
  const s = ui.set;
  if (!s) return '<div class="sets"><div class="skeleton"></div><div class="skeleton"></div></div>';
  const own = new Set(ownedInSet(s.id).map(c => c.rawId));
  return `<div class="head" style="margin-top:4px"><h2>${esc(s.name)} · ${own.size}/${s.cards.length}</h2><button class="link" data-show-sets>Alle Sets</button></div>
    <div class="grid">${s.cards.map(c => `
      <button class="tile ${own.has(c.id) ? '' : 'dim'}" data-set-card="${esc(c.id)}">${cardImg(c)}
        <span class="name">${esc(c.name)}</span><span class="sub">#${esc(c.number)}</span>
      </button>`).join('')}</div>`;
}

function dexHtml() {
  const dex = [...ownedDex().entries()].sort((a, b) => a[0] - b[0]);
  return `<div class="head" style="margin-top:4px"><h2>Pokédex · ${dex.length}/${nf.format(DEX_TOTAL)}</h2><button class="link" data-show-sets>Alle Sets</button></div>
    ${dex.length ? `<div class="grid">${dex.map(([n, c]) => `
      <button class="tile" data-open="${esc(c.key)}">${cardImg(c)}<span class="name">${esc(c.name)}</span><span class="sub">Nr. ${n}</span></button>`).join('')}</div>`
      : '<div class="empty">Noch kein Pokémon.</div>'}`;
}

function renderScan() {
  const photoUrl = ui.photo ? ui.photoUrl : null;
  let body;
  if (ui.found.length) {
    const tile = (c, i) => `
      <button class="tile" data-add="${i}" aria-label="${esc(c.name)} hinzufügen">${cardImg(c)}
        <span class="name">${esc(c.name)}</span>
        <span class="sub">${esc(c.set)}</span>
        <span class="val">${c.price ? money.format(c.price) : 'Kein Preis'}</span>
        <span class="qty">${c.number ? '#' + esc(c.number) + ' · ' : ''}Anz. ${qtyOf(c)}</span>
        <span class="plus">+</span>
      </button>`;
    const top = ui.found[0];
    body = ui.sure ? `
      <div class="hit">${cardImg(top)}
        <div class="info"><span class="tagline">Erkannt</span><h3>${esc(top.name)}</h3>
          <span class="muted small">${esc(top.set)}${top.number ? ' · #' + esc(top.number) : ''}</span>
          <span class="price">${top.price ? money.format(top.price) : 'Kein Preis'}</span>
          <button class="btn" data-add="0">Hinzufügen</button></div>
      </div>
      ${ui.found.length > 1 ? `<div class="head" style="margin-top:0"><h2>Falsche Karte? Andere Treffer</h2></div>
      <div class="grid">${ui.found.slice(1).map((c, i) => tile(c, i + 1)).join('')}</div>` : ''}`
      : `<div class="grid">${ui.found.map(tile).join('')}</div>`;
  } else if (ui.game !== 'pokemon') {
    body = '<div class="empty">Suche nach dem Namen oder fotografiere die Karte.</div>';
  } else if (ui.searchView === 'set') {
    body = setHtml();
  } else if (ui.searchView === 'dex') {
    body = dexHtml();
  } else {
    body = setsHtml();
    if (!ui.sets[ui.setLang]) loadSets(ui.setLang);
  }
  view.innerHTML = `
    <div class="searchbar">
      <button class="round cam-btn" data-camera aria-label="Karte fotografieren">${ICON.camera}</button>
      <div class="search">
        <input id="q" placeholder="Karten suchen" aria-label="Kartenname" value="${esc(ui.q)}">
        ${ui.q ? `<button data-clear-search aria-label="Suche löschen">${ICON.close}</button>` : `<button data-search aria-label="Suchen">${ICON.search}</button>`}
      </div>
      <button class="round" data-games="game" aria-label="Spiel auswählen">${ICON.menu}</button>
    </div>
    <div class="filters">
      <button class="chip" data-games="game">${esc(GAMES[ui.game])}</button>
      <span>
        ${ui.found.length ? '<button class="link" data-show-sets>Sets anzeigen</button> · ' : ''}
        <button class="link" data-pick>Aus Galerie</button>
      </span>
    </div>
    <input id="file" type="file" accept="image/*" hidden>
    ${ui.stream ? '<video id="cam" class="cam" autoplay playsinline muted></video><div class="btns" style="margin:0 0 10px"><button class="btn" data-shot>Foto machen</button></div>' : photoUrl ? `<div class="scanwrap ${ui.scanning ? 'scanning' : ''}"><img class="preview" src="${photoUrl}" alt="Dein Foto">${ui.scanning ? `<span id="scanstep">${esc(ui.scanStep || '')}</span>` : ''}</div>` : ''}
    ${ui.status ? `<div class="note ${ui.status.level || ''}">${esc(ui.status.text)}${ui.status.reasons && ui.status.reasons.length ? `<ul>${ui.status.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</div>` : ''}
    ${ui.scanning ? '' : body}`;
  const video = document.getElementById('cam');
  if (video) video.srcObject = ui.stream;
}

async function loadSets(lang) {
  if (ui.sets[lang] || loadSets.busy) return;
  loadSets.busy = true;
  try {
    ui.sets[lang] = await getSets(lang);
  } catch (e) {
    ui.status = { level: 'warn', text: e.message };
    ui.sets[lang] = [];
  }
  loadSets.busy = false;
  if (ui.tab === 'scan' && ui.searchView === 'sets' && !ui.found.length) renderScan();
}

async function openSet(id) {
  ui.searchView = 'set';
  ui.set = null;
  ui.status = null;
  renderScan();
  window.scrollTo(0, 0);
  try {
    ui.set = await getSet(ui.setLang, id);
  } catch (e) { toast(e.message); }
  if (!ui.set) { ui.searchView = 'sets'; }
  if (ui.tab === 'scan') renderScan();
}

async function openSetCard(rawId) {
  try {
    const card = await getCard('pokemon', ui.setLang + ':' + rawId);
    if (card) openPreview(card, '');
  } catch (e) { toast(e.message); }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Dieser Browser kann die Kamera nicht öffnen. Wähle ein Foto aus.');
    return;
  }
  try {
    ui.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
    ui.photo = null;
    ui.status = null;
    ui.found = [];
    renderScan();
  } catch {
    toast('Kein Kamera-Zugriff. Wähle ein Foto aus.');
  }
}

function takeShot() {
  const video = document.getElementById('cam');
  if (!video || !video.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  c.toBlob(blob => { stopCamera(); usePhoto(blob, 'kamera'); }, 'image/jpeg', 0.92);
}

async function usePhoto(blob, source) {
  if (ui.photoUrl) URL.revokeObjectURL(ui.photoUrl);
  ui.photo = blob;
  ui.photoUrl = URL.createObjectURL(blob);
  ui.source = source;
  ui.found = [];
  ui.status = null;
  ui.sure = false;
  ui.scanning = true;
  ui.scanStep = 'Karte wird gelesen …';
  renderScan();
  try {
    const { cards, sure } = await identify(blob, ui.game, text => {
      ui.scanStep = text;
      const el = document.getElementById('scanstep');
      if (el) el.textContent = text;
    });
    ui.found = cards;
    ui.sure = sure;
    ui.status = sure ? (source === 'kamera' ? null : { text: 'Aus der Galerie: Du siehst den Preis, aber nur Kamera-Fotos zählen zum Guthaben.' })
      : cards.length ? { level: 'warn', text: 'Nicht sicher erkannt. Welche Karte ist es?' }
      : { level: 'warn', text: 'Keine Karte erkannt. Gib den Namen ein, oder fotografiere sie näher und von vorne.' };
  } catch (e) {
    ui.status = { level: 'warn', text: e.message };
  }
  ui.scanning = false;
  if (ui.tab === 'scan') renderScan();
}

async function manualSearch() {
  const input = document.getElementById('q');
  ui.q = input.value;
  if (ui.q.trim().length < 2) return;
  ui.status = { text: 'Wird gesucht …' };
  ui.found = [];
  ui.sure = false;
  renderScan();
  try {
    ui.found = await searchCards(ui.game, ui.q, '', 24);
    ui.status = ui.found.length ? null : { level: 'warn', text: 'Nichts gefunden. Probiere den englischen oder japanischen Namen.' };
  } catch (e) {
    ui.status = { level: 'warn', text: e.message };
  }
  renderScan();
}

function addToCollection(card, verified, photoHash) {
  const hist = { ...(card.hist || {}) };
  hist[today()] = card.price;
  state.cards.unshift({ ...card, hist, verified, photoHash: photoHash || null, key: crypto.randomUUID(), addedAt: Date.now() });
  save();
}

async function addFound(i) {
  const card = ui.found[i];
  if (!card) return;
  if (!ui.photo) {
    addToCollection(card, false, null);
    toast(card.name + ' gemerkt. Sie zählt noch nicht.');
    ui.found = [];
    ui.status = null;
    renderScan();
    return;
  }
  const res = await checkPhoto(ui.photo, ui.source, card, state.hashes);
  if (res.level === 'block') {
    ui.status = { level: 'block', text: 'Foto abgelehnt.', reasons: res.reasons };
    renderScan();
    return;
  }
  const verified = res.level === 'ok';
  addToCollection(card, verified, res.hash);
  if (verified) state.hashes.push(res.hash);
  save();
  ui.found = [];
  ui.photo = null;
  ui.sure = false;
  ui.status = verified
    ? { level: 'ok', text: `${card.name} hinzugefügt: +${money.format(card.price || 0)}` }
    : { level: 'warn', text: `${card.name} gemerkt. Galerie-Fotos zählen nicht zum Guthaben.` };
  renderScan();
}

// ---------- Portfolio und Profil ----------
function renderPortfolio() {
  const shown = state.cards.filter(c => ui.filter === 'all' || c.game === ui.filter);
  const value = counted().reduce((s, c) => s + pts(c.price), 0);
  view.innerHTML = `
    <div class="tabs"><button class="on">Portfolio</button><span class="pill"><i>€</i>EUR</span></div>
    <section class="value">
      <div class="label">Kartenwert · <button class="link" data-games="filter">${ui.filter === 'all' ? 'Alle Karten' : esc(GAMES[ui.filter])}</button></div>
      <div class="big">${eur(value)}</div>
    </section>
    <div class="head"><h2>${shown.length} ${shown.length === 1 ? 'Karte' : 'Karten'}</h2></div>
    ${shown.length ? `<div class="grid">${shown.map(c => `
      <button class="tile" data-open="${esc(c.key)}">${cardImg(c)}
        <span class="name">${esc(c.name)}</span>
        <span class="sub">${esc(c.set)}</span>
        <span class="val">${money.format(c.price || 0)}</span>
        ${c.verified ? '' : '<span class="tag">Zählt nicht</span>'}
      </button>`).join('')}</div>` : '<div class="empty">Noch keine Karten.</div>'}`;
}

function renderProfile() {
  view.innerHTML = `
    <div class="brand"><img src="icon.svg" alt=""><span><b>KartenWert</b><span class="muted small">Version 1.0.1</span></span></div>
    <div class="stats">
      <div class="stat"><span class="muted small">Freies Guthaben</span><b>${fmt(freePoints())}</b></div>
      <div class="stat"><span class="muted small">Gezählte Karten</span><b>${nf.format(counted('all').length)}</b></div>
    </div>
    <div class="head"><h2>Gut zu wissen</h2></div>
    <div class="facts">
      <p>Das Guthaben ist nur eine Anzeige in der App. Du kannst es nicht abheben oder außerhalb der App ausgeben.</p>
      <p>Die Kartenpreise kommen von Cardmarket, Scryfall und YGOPRODeck und können veraltet sein.</p>
      <p>Im Markt erhältst du nur eine digitale Karte, keine echte.</p>
      <p>Nur direkt in der App aufgenommene Fotos zählen. Bilder aus der Galerie zeigen nur den Preis.</p>
      <p>Deine Sammlung liegt nur auf diesem Gerät. Fotos werden nicht hochgeladen.</p>
    </div>`;
}

// ---------- Markt ----------
async function syncMarket() {
  try {
    const me = await market.join(state.secret);
    ui.marketReady = !!me;
    if (me) ui.points = me.points;
  } catch {
    ui.marketReady = false;
  }
}
const freePoints = () => ui.points ?? START_POINTS;

function feat(item, attr, price) {
  return `<button class="feat" data-${attr}="${esc(item.id)}"><span class="pic">${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : ''}</span>
    <span class="txt"><span class="name">${esc(item.name)}</span><span class="sub">${esc(item.set_name ?? item.set)} - ${esc(GAMES[item.game])}</span><span class="price">${price}</span></span></button>`;
}
function prod(l) {
  return `<button class="prod" data-listing="${esc(l.id)}">${cardImg(l)}
    <span class="name">${esc(l.name)}</span>
    <span class="price">${fmt(l.price)}</span>
    <span class="sub">${l.market_eur ? 'Markt ' + money.format(l.market_eur) : esc(GAMES[l.game])}</span></button>`;
}
function section(title, key, items, empty) {
  const open = ui.marketAll === key;
  return `<div class="head"><h2>${title}</h2>${items.length > 2 ? `<button class="link" data-market-all="${key}">${open ? 'Weniger' : 'Alle anzeigen'}</button>` : ''}</div>
    ${items.length ? `<div class="shelf ${open ? 'open' : ''}">${items.map(prod).join('')}</div>` : `<div class="panelnote">${empty}</div>`}`;
}

function renderMarket() {
  const q = ui.mq.trim().toLowerCase();
  const list = ui.listings.filter(l => (ui.marketGame === 'all' || l.game === ui.marketGame) && (!q || l.name.toLowerCase().includes(q)));
  const top = [...list].sort((a, b) => b.price - a.price).slice(0, 6);
  const watched = list.filter(l => state.watch.includes(l.id));
  const catalog = ui.catalog.filter(c => ui.marketGame === 'all' || c.game === ui.marketGame);
  view.innerHTML = `
    <div class="searchbar">
      <div class="search"><span class="ic">${ICON.search}</span>
        <input id="mq" placeholder="Karten suchen" aria-label="Karten suchen" value="${esc(ui.mq)}">
        ${ui.mq ? `<button data-clear-market aria-label="Suche löschen">${ICON.close}</button>` : ''}
      </div>
      <button class="round" data-games="marketGame" aria-label="Spiel auswählen">${ICON.menu}</button>
    </div>
    <div class="points"><span>Freies Guthaben <b>${fmt(freePoints())}</b></span><span>${ui.marketGame === 'all' ? '' : esc(GAMES[ui.marketGame])}</span></div>
    <div class="head"><h2>Empfohlen</h2></div>
    ${top.length ? `<div class="shelf">${top.map(l => feat(l, 'listing', fmt(l.price))).join('')}</div>`
      : catalog.length ? `<div class="shelf">${catalog.map(c => feat(c, 'catalog', money.format(c.price || 0))).join('')}</div>`
      : `<div class="panelnote">${ui.marketReady === null ? 'Wird geladen …' : 'Keine Karten gefunden.'}</div>`}
    ${watched.length ? section('Merkliste', 'watch', watched, '') : ''}
    ${section('Neu im Angebot', 'new', list, ui.marketReady === false ? 'Der Markt ist noch nicht verbunden.' : 'Noch keine Angebote.')}`;
}

function openListing(id) {
  const l = ui.listings.find(x => x.id === id);
  if (!l) return;
  const watching = state.watch.includes(id);
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">←</button>
    ${l.image ? `<img class="cardimg" src="${esc(l.image)}" alt="">` : ''}
    <div class="detail">
      <div><h3>${esc(l.name)}</h3>
        <div class="muted small">${esc(GAMES[l.game])} · ${esc(l.set_name)}</div>
        <div class="muted small">${l.number ? '#' + esc(l.number) : ''}</div></div>
      <div class="pricebox"><div class="big">${fmt(l.price)}</div>
        <div class="muted small">${l.market_eur ? 'Marktpreis ' + money.format(l.market_eur) : ''}</div></div>
    </div>
    <p class="note">Nur digitale Karte. Bezahlt wird mit deinem App-Guthaben (${fmt(freePoints())}).</p>
    <div class="btns">
      ${l.mine ? `<button class="btn sec" data-cancel="${esc(l.id)}">Angebot zurückziehen</button>` : `<button class="btn" data-buy="${esc(l.id)}" ${l.price > freePoints() ? 'disabled' : ''}>${l.price > freePoints() ? 'Nicht genug Guthaben' : 'Kaufen'}</button>`}
      ${l.mine ? '' : `<button class="btn sec" data-watch="${esc(l.id)}">${watching ? 'Von Merkliste entfernen' : 'Merken'}</button>`}
    </div></div>`;
  modal.hidden = false;
}

async function loadCatalog(q) {
  const game = ui.marketGame === 'all' ? 'pokemon' : ui.marketGame;
  const cards = await searchCards(game, q).catch(() => []);
  ui.catalog = cards.filter(c => c.image && c.price).sort((a, b) => b.price - a.price);
}

async function showMarket() {
  renderMarket();
  await syncMarket();
  if (ui.marketReady) {
    try { ui.listings = await market.listings(state.secret); } catch (e) { toast(e.message); }
  }
  // Echte Preise und Empfehlungen zuerst laden, dann einmal zeichnen.
  for (const l of ui.listings.slice(0, 30)) {
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    if (fresh) l.market_eur = fresh.price;
    if (ui.tab !== 'market') return;
  }
  if (!ui.catalog.length) await loadCatalog('Glurak');
  if (ui.tab === 'market') renderMarket();
}

async function searchMarket() {
  ui.mq = document.getElementById('mq').value;
  renderMarket();
  if (ui.mq.trim().length >= 2) {
    await loadCatalog(ui.mq);
    if (ui.tab === 'market') renderMarket();
  }
}

async function doSell(key) {
  const c = state.cards.find(x => x.key === key);
  const price = Math.round(Number(document.getElementById('sellPrice').value) * POINTS_PER_EURO);
  if (!c || !c.verified || !(price >= 1 && price <= 10000000)) { toast('Gib einen Preis von 0,01 € bis 100.000 € ein.'); return; }
  try {
    await market.sell(state.secret, c, price, c.photoHash);
    state.cards = state.cards.filter(x => x.key !== key);
    save();
    closeModal();
    toast('Deine Karte ist jetzt im Markt.');
    switchTab('market');
  } catch (e) { toast(e.message); }
}

function fromListing(l) {
  return { game: l.game, id: l.card_id, name: l.name, set: l.set_name, number: l.number, image: l.image, price: l.market_eur || 0, hist: {} };
}

async function doBuy(id) {
  try {
    const l = await market.buy(state.secret, id);
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    addToCollection(fresh || fromListing(l), true, null);
    state.watch = state.watch.filter(w => w !== id);
    save();
    closeModal();
    toast(l.name + ' gekauft.');
    await showMarket();
  } catch (e) { toast(e.message); }
}

async function doCancel(id) {
  try {
    const l = await market.cancel(state.secret, id);
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    addToCollection(fresh || fromListing(l), true, l.photo_hash);
    closeModal();
    toast('Karte ist zurück in deiner Sammlung.');
    await showMarket();
  } catch (e) { toast(e.message); }
}

// ---------- Preise aktualisieren ----------
async function refreshPrices() {
  if (Date.now() - state.lastRefresh < 6 * 3600 * 1000) return;
  let changed = false;
  for (const c of state.cards) {
    const fresh = await getCard(c.game, c.id).catch(() => null);
    if (fresh) {
      Object.assign(c, { price: fresh.price, setId: fresh.setId, rawId: fresh.rawId, dexId: fresh.dexId, rarity: fresh.rarity });
      c.hist = { ...fresh.hist, ...c.hist, [today()]: fresh.price };
      changed = true;
    }
    await new Promise(r => setTimeout(r, 120));
  }
  if (changed) {
    state.lastRefresh = Date.now();
    save();
    if (ui.tab === 'home' && modal.hidden) renderHome();
  }
}

// ---------- Bedienung ----------
function renderTab() {
  if (ui.tab === 'home') renderHome();
  if (ui.tab === 'scan') renderScan();
  if (ui.tab === 'market') showMarket();
  if (ui.tab === 'portfolio') renderPortfolio();
  if (ui.tab === 'profile') renderProfile();
}

function switchTab(tab) {
  if (ui.tab === 'scan' && tab !== 'scan') stopCamera();
  ui.tab = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  renderTab();
  window.scrollTo(0, 0);
}

function pickGame(target, key) {
  ui[target] = key;
  closeModal();
  if (target === 'filter') renderTab();
  if (target === 'game') { ui.found = []; ui.status = null; renderScan(); }
  if (target === 'marketGame') {
    if (key !== 'all') {
      loadCatalog(key === 'magic' ? 'Black Lotus' : key === 'yugioh' ? 'Blue-Eyes' : 'Glurak').then(() => { if (ui.tab === 'market') renderMarket(); });
    }
    renderMarket();
  }
}

document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) switchTab(b.dataset.tab);
});

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) { if (e.target === modal) closeModal(); return; }
  const d = b.dataset;
  if (d.range) { ui.range = d.range; renderHome(); }
  else if (d.overview) { ui.overview = d.overview; renderHome(); }
  else if (d.cardRange) { ui.cardRange = d.cardRange; openCard(ui.open); }
  else if (d.games) openGames(d.games);
  else if (d.pickGame) pickGame(d.target, d.pickGame);
  else if (d.go) switchTab(d.go);
  else if ('allValuable' in d) { ui.allValuable = !ui.allValuable; renderHome(); }
  else if (d.open) openCard(d.open);
  else if ('close' in d) closeModal();
  else if (d.remove) {
    state.cards = state.cards.filter(c => c.key !== d.remove);
    save(); closeModal(); renderTab();
  }
  else if ('camera' in d) startCamera();
  else if ('shot' in d) takeShot();
  else if ('pick' in d) document.getElementById('file').click();
  else if ('search' in d) manualSearch();
  else if ('clearSearch' in d) { ui.q = ''; ui.found = []; ui.status = null; renderScan(); }
  else if ('showSets' in d) { ui.searchView = 'sets'; ui.found = []; ui.status = null; renderScan(); }
  else if (d.setLang) { ui.setLang = d.setLang; renderScan(); }
  else if ('dex' in d) { ui.searchView = 'dex'; ui.status = null; renderScan(); window.scrollTo(0, 0); }
  else if (d.set) openSet(d.set);
  else if (d.setCard) openSetCard(d.setCard);
  else if ('goScan' in d) { closeModal(); startCamera(); }
  else if ('addPreview' in d) {
    const card = ui.preview;
    addToCollection(card, false, null);
    closeModal();
    toast(card.name + ' gemerkt. Sie zählt noch nicht.');
  }
  else if (d.add) addFound(Number(d.add));
  else if (d.sell) doSell(d.sell);
  else if (d.listing) openListing(d.listing);
  else if (d.catalog) {
    const c = ui.catalog.find(x => x.id === d.catalog);
    if (c) openPreview(c, 'Gerade nicht im Angebot.');
  }
  else if (d.marketAll) { ui.marketAll = ui.marketAll === d.marketAll ? null : d.marketAll; renderMarket(); }
  else if ('clearMarket' in d) { ui.mq = ''; renderMarket(); }
  else if (d.watch) {
    state.watch = state.watch.includes(d.watch) ? state.watch.filter(w => w !== d.watch) : [...state.watch, d.watch];
    save(); openListing(d.watch); renderMarket();
  }
  else if (d.buy) doBuy(d.buy);
  else if (d.cancel) doCancel(d.cancel);
});

document.addEventListener('change', e => {
  if (e.target.id === 'file' && e.target.files[0]) {
    stopCamera();
    usePhoto(e.target.files[0], 'datei');
  }
});
// Fehlt ein Set-Logo, steht dort der Name des Sets.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.closest('.set')) return;
  const name = document.createElement('span');
  name.textContent = img.alt;
  img.replaceWith(name);
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'q') ui.q = e.target.value;
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'q') manualSearch();
  if (e.target.id === 'mq') searchMarket();
});

renderHome();
syncMarket().then(() => { if (ui.tab === 'home' && modal.hidden) renderHome(); });
refreshPrices();
