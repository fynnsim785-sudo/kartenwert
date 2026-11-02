import { GAMES, today, searchCards, getCard, getSets, getSet, hq } from './cards.js';
import { identify, checkPhoto } from './scan.js';
import { openScanner } from './live.js';
import { runProof } from './proof.js';
import { loadFeed, topCards, findFeedCard } from './feed.js';
import { countTo, flyToCollection, attachTilt, drawChart, enterPage, observeReveal, attachDrag } from './fx.js';
import { ICON } from './icons.js';
import * as market from './market.js';

const CENTS = 100;
const START_BALANCE = 1000;
const DEX_TOTAL = 1025;
const STORE = 'kartenwert.v1';
const TABS = ['home', 'scan', 'market', 'portfolio', 'profile'];
const view = document.getElementById('view');
const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');
const nf = new Intl.NumberFormat('de-DE');
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const state = load();
const ui = {
  tab: 'home', overview: 'overview', range: '1M', cardRange: 'MAX', filter: 'all', game: 'pokemon', allValuable: false,
  photo: null, source: null, found: [], status: null, q: '', sure: false, scanning: false, scanStep: '',
  searchView: 'sets', setLang: 'de', sets: {}, set: null, preview: null, shown: START_BALANCE,
  listings: [], auctions: [], catalog: [], marketReady: null, balance: null, mq: '', marketGame: 'all', open: null,
};
let feed = { topics: [], sets: [] };

// Dieselbe Karte in einer anderen Sprache zählt als dieselbe Karte.
function cardIdent(c) {
  const id = String(c.id);
  return c.game + ':' + (c.game === 'pokemon' ? id.slice(id.indexOf(':') + 1) : id);
}

// Räumt alte Doppelte auf. Gekaufte Doppelte bekommst du zum Kaufpreis zurück.
function removeDuplicates(s) {
  const keep = new Map();
  for (const c of s.cards) {
    const k = cardIdent(c), prev = keep.get(k);
    if (!prev) { keep.set(k, c); continue; }
    const drop = c.verified && !prev.verified ? prev : c;
    if (drop === prev) keep.set(k, c);
    if (drop.buyPrice != null) s.ledger += Math.round(drop.buyPrice * 100);
  }
  const left = new Set(keep.values());
  s.cards = s.cards.filter(c => left.has(c));
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE)); } catch { /* leerer Start */ }
  s = s || {};
  s.cards = s.cards || [];
  s.hashes = s.hashes || [];
  s.watch = s.watch || [];
  s.ledger = s.ledger || 0; // Käufe und Verkäufe mit dem App-Guthaben, in Cent
  s.events = s.events || [];
  s.name = s.name || 'Sammler';
  s.lastRefresh = s.lastRefresh || 0;
  if (s.cards.some(c => c.game === 'pokemon' && !c.setId)) s.lastRefresh = 0; // ältere Karten ergänzen
  if (!s.secret) s.secret = crypto.randomUUID() + crypto.randomUUID();
  removeDuplicates(s);
  return s;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { toast('Speichern ist in diesem Browser nicht möglich.'); }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cents = price => Math.round((price || 0) * CENTS);
const eur = c => money.format((c || 0) / CENTS);
const pct = n => n.toFixed(2).replace('.', ',') + ' %';
const dateDe = d => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
const small = url => (url || '').replace('/high.webp', '/low.webp');

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
  return dates.map(d => ({ d, v: cards.reduce((sum, c) => sum + cents(priceOn(c, d)), 0) }));
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
let chartCount = 0;
function chartSvg(points) {
  const W = 500, H = 270;
  const vals = points.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const list = points.length > 1 ? points : [{ v: points[0].v }, { v: points[0].v }];
  const xy = list.map((p, i) => [i / (list.length - 1) * W, H * .85 - (p.v - min) / (max - min) * (H * .72)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const lastY = xy[xy.length - 1][1] / H * 100;
  const color = list[list.length - 1].v < list[0].v ? 'var(--red)' : 'var(--chart)';
  const fillId = `chartfill${++chartCount}`;
  return `<div class="chartwrap"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Wertverlauf">
    <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.55"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs>
    <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#${fillId})"/>
    <path d="${line}" fill="none" style="stroke:${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <i class="chartdot" style="top:${lastY.toFixed(1)}%"></i></div>`;
}
function rangeButtons(attr, current) {
  return `<div class="ranges">${['1T', '7T', '1M', '3M', '6M', 'MAX'].map(r => `<button data-${attr}="${r}" class="${r === current ? 'on' : ''}">${r}</button>`).join('')}</div>`;
}
const cardImg = c => c.image ? `<img src="${esc(hq(c.image))}" alt="" loading="lazy" decoding="async">` : '<img alt="">';
const owned = card => state.cards.find(c => cardIdent(c) === cardIdent(card));
const hasCard = card => { const have = owned(card); return !!(have && have.verified); };

// Feld für ein Spiel: Farbe des Spiels, davor echte Kartenbilder aus dem Katalog.
function gameTile(key, name, target, on) {
  const cards = key === 'all' ? [] : (feed.topics.filter(t => t.game === key).flatMap(t => t.cards).filter(c => c.image).sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 3));
  return `<button class="game g-${key} ${on ? 'on' : ''}" data-pick-game="${key}" data-target="${target}">
    <b>${esc(name)}</b>
    <span class="gamefan">${cards.map(c => `<img src="${esc(hq(c.image))}" alt="" loading="lazy">`).join('')}</span>
  </button>`;
}

function openGames(target) {
  const current = { filter: ui.filter, game: ui.game, marketGame: ui.marketGame }[target];
  const withAll = target !== 'game';
  const tile = (key, name) => gameTile(key, name, target, current === key);
  modal.innerHTML = `<div class="sheet"><h3 class="center">Spiel auswählen</h3>
    <div class="games">${withAll ? tile('all', 'Alle Karten') : ''}${Object.entries(GAMES).map(([k, v]) => tile(k, v)).join('')}</div>
    <div class="btns"><button class="btn sec" data-close>Schließen</button></div></div>`;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; modal.innerHTML = ''; ui.open = null; ui.preview = null; }

// ---------- Entdecken ----------
const SKELETON_SHELF = `<div class="shelf">${'<div class="prod ghost"><div class="skeleton tall"></div><div class="skeleton line"></div></div>'.repeat(4)}</div>`;
const feedTile = c => `<button class="prod" data-feed="${esc(c.id)}">${cardImg(c)}
  <span class="name">${esc(c.name)}</span>
  <span class="price">${money.format(c.price || 0)}</span>
  <span class="sub">${esc(c.set)}</span></button>`;

function setsShelf() {
  if (!feed.sets.length) return '';
  return `<div class="head"><h2>Neue Sets</h2><button class="link" data-all-sets>Alle Sets</button></div>
    <div class="shelf stag">${feed.sets.map(s => `<button class="settile" data-set-open="${esc(s.id)}"><img src="${esc(s.logo)}.png" alt="${esc(s.name)}" loading="lazy"></button>`).join('')}</div>`;
}
function topicShelf(t) {
  if (!t.cards.length) return '';
  return `<div class="head"><h2>${esc(t.title)}</h2><button class="link" data-quick="${esc(t.q)}" data-quick-game="${esc(t.game)}">Alle</button></div>
    <div class="shelf stag">${t.cards.map(feedTile).join('')}</div>`;
}
function promoShelf() {
  const topics = feed.topics.filter(t => t.cards.some(c => c.image));
  if (!topics.length) return '';
  return `<div class="head"><h2>Entdecken</h2></div>
    <div class="shelf stag">${topics.map(t => `<button class="promo" data-quick="${esc(t.q)}" data-quick-game="${esc(t.game)}">
      <i class="promobg" style="background-image:url('${esc(small(t.cards.find(c => c.image).image))}')"></i>
      <b>${esc(t.title)}</b>
      <span class="fan">${t.cards.filter(c => c.image).slice(0, 3).map(c => `<img src="${esc(small(c.image))}" alt="" loading="lazy">`).join('')}</span>
    </button>`).join('')}</div>`;
}
function feedHtml(kind) {
  const top = topCards(feed, 10);
  const topBlock = top.length ? `<div class="head"><h2>Am teuersten</h2></div><div class="shelf stag">${top.map(feedTile).join('')}</div>`
    : `<div class="head"><h2>Am teuersten</h2></div>${SKELETON_SHELF}`;
  if (kind === 'home') return (ui.auctions.length ? `<div class="head"><h2>Auktionen</h2><button class="link" data-go="market">Alle</button></div><div class="shelf stag">${ui.auctions.slice(0, 8).map(auctionTile).join('')}</div>` : '') + promoShelf() + topBlock + setsShelf() + feed.topics.slice(0, 3).map(topicShelf).join('');
  if (kind === 'search') return topBlock;
  if (kind === 'market') return feed.topics.map(topicShelf).join('') || SKELETON_SHELF;
  return setsShelf() + topBlock;
}
function paintFeed() {
  const box = document.getElementById('feedbox');
  if (box) box.innerHTML = feedHtml(box.dataset.kind);
  const qf = document.getElementById('qfbox');
  if (qf) qf.innerHTML = Object.entries(GAMES).map(([k, v]) => gameTile(k, v, 'game', ui.game === k)).join('');
}
let feedTimer = null;
function feedChanged() {
  clearTimeout(feedTimer);
  feedTimer = setTimeout(paintFeed, 350);
}

const scanCta = title => `<button class="scancta" data-camera>${ICON.camera}<span>${title}</span></button>`;

// ---------- Start ----------
function itemRow(c, ch) {
  const kind = !ch || ch.diff === 0 ? 'flat' : ch.diff < 0 ? 'down' : '';
  return `<button class="item" data-open="${esc(c.key)}">${cardImg(c)}
    <span class="left"><span class="name">${esc(c.name)}</span><span class="sub">${esc(c.set)}</span></span>
    <span class="right">${money.format(c.price || 0)}<span class="pct ${kind}">${ch ? pct(ch.pct) : pct(0)}</span></span>
  </button>`;
}

function renderHome(animate = true) {
  const cards = counted();
  const points = series(cards, ui.range);
  const value = points[points.length - 1].v;
  const withChange = cards.map(c => ({ c, ch: change(series([c], ui.range)) }));
  const portfolioName = ui.filter === 'all' ? 'Alle Karten' : esc(GAMES[ui.filter]);
  const total = value + (ui.filter === 'all' ? freeBalance() : 0);
  const head = `
    <div class="tabs">
      <button data-overview="overview" class="${ui.overview === 'overview' ? 'on' : ''}">Übersicht</button>
      <button data-overview="performance" class="${ui.overview === 'performance' ? 'on' : ''}">Leistung</button>
      <span class="pill"><i>€</i>EUR</span>
    </div>
    <section class="value">
      <div class="label">Portfolio: <button class="link" data-games="filter">${portfolioName}</button></div>
      <div class="big" id="total">${eur(ui.shown)}</div>
      ${cards.length ? changeHtml(change(points), LABEL[ui.range]) : ''}
      ${cards.length && ui.filter === 'all' ? `<div class="split"><span>Karten <b>${eur(value)}</b></span><span>Frei <b>${eur(freeBalance())}</b></span>${cards.some(c => c.buyPrice != null) ? (p => `<span>${p < 0 ? 'Verlust' : 'Gewinn'} <b class="${p < 0 ? 'down' : 'up'}">${p < 0 ? '-' : '+'}${eur(Math.abs(p))}</b></span>`)(cards.reduce((s, c) => s + profitOf(c), 0)) : ''}</div>` : ''}
    </section>`;

  if (!cards.length) {
    view.innerHTML = `${head}${scanCta('Erste Karte scannen')}<div id="feedbox" data-kind="home">${feedHtml('home')}</div>`;
  } else if (ui.overview === 'performance') {
    const gain = withChange.filter(g => g.ch && g.ch.diff > 0).sort((a, b) => b.ch.pct - a.ch.pct);
    const loss = withChange.filter(g => g.ch && g.ch.diff < 0).sort((a, b) => a.ch.pct - b.ch.pct);
    const box = (title, list, empty) => `<section class="panel"><h2>${title}</h2><div class="rows">${list.length ? list.map(g => itemRow(g.c, g.ch)).join('') : `<div class="panelnote" style="padding-top:7px">${empty}</div>`}</div></section>`;
    view.innerHTML = `${head}${rangeButtons('range', ui.range)}
      ${box('Gewinner', gain, 'Keine Karte im Plus.')}
      ${box('Verlierer', loss, 'Keine Karte im Minus.')}`;
  } else {
    const valuable = [...withChange].sort((a, b) => (b.c.price || 0) - (a.c.price || 0));
    const visible = ui.allValuable ? valuable : valuable.slice(0, 5);
    const fan = valuable.filter(g => g.c.image).slice(0, 3);
    view.innerHTML = `${head}
      ${chartSvg(points)}
      ${rangeButtons('range', ui.range)}
      <section class="panel"><h2>Am wertvollsten</h2>
        <div class="rows stag">${visible.map(g => itemRow(g.c, g.ch)).join('')}</div>
        ${valuable.length > 5 ? `<button class="link viewall" data-all-valuable>${ui.allValuable ? 'Weniger' : 'Alle anzeigen'}</button>` : ''}
      </section>
      <button class="banner" data-go="portfolio"><span><b>${cards.length} ${cards.length === 1 ? 'Karte' : 'Karten'}</b><span>Ganze Sammlung ansehen</span></span>
        <span class="fan">${fan.map(g => `<img src="${esc(small(g.c.image))}" alt="">`).join('')}</span></button>
      <div id="feedbox" data-kind="home">${feedHtml('home')}</div>`;
  }
  countTo(document.getElementById('total'), ui.shown, total, eur);
  ui.shown = total;
  if (animate) drawChart(view);
}

function openCard(key) {
  const c = state.cards.find(x => x.key === key);
  if (!c) return;
  const points = series([c], ui.cardRange);
  const vals = points.map(p => p.v);
  ui.open = key;
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">${ICON.back}</button>
    ${c.image ? `<div class="holo"><img class="cardimg" src="${esc(hq(c.image))}" alt=""><span class="gloss"></span></div>` : ''}
    ${auctionTicker(c)}
    <div class="detail">
      ${c.verified ? '' : `<button class="star on" data-remove="${esc(c.key)}" aria-label="Nicht mehr merken">${ICON.star}</button>`}
      <div><h3>${esc(c.name)}</h3>
        <div class="muted small">${esc(GAMES[c.game])} · <span class="setname">${esc(c.set)}</span></div>
        <div class="muted small">${[c.rarity, c.number && '#' + c.number].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="pricebox"><div class="big">${money.format(c.price || 0)}</div>${changeHtml(change(points), '')}</div>
    </div>
    ${chartSvg(points)}
    <div class="axis"><span>${dateDe(points[0].d)}</span><span>Tief ${eur(Math.min(...vals))} · Hoch ${eur(Math.max(...vals))}</span><span>${dateDe(points[points.length - 1].d)}</span></div>
    ${rangeButtons('card-range', ui.cardRange)}
    <div class="head" style="margin-top:0"><h2>Dein Bestand</h2></div>
    ${c.buyPrice != null ? `<div class="profit ${profitOf(c) < 0 ? 'loss' : ''}">
        <div><span>Gekauft für</span><b>${money.format(c.buyPrice)}</b></div>
        <div><span>${profitOf(c) < 0 ? 'Verlust' : 'Gewinn'}</span><b>${profitOf(c) < 0 ? '-' : '+'}${eur(Math.abs(profitOf(c)))}</b></div>
      </div>
      <div class="btns"><button class="btn" data-sell-back="${esc(c.key)}"><span>Verkaufen · ${money.format(c.price || 0)}</span></button></div>`
      : `<p class="note ${c.verified ? 'ok' : 'warn'}" style="margin:0">${c.verified ? 'Gescannt' : 'Zählt nicht. Scanne oder kaufe die Karte.'}</p>`}
    ${c.verified && c.buyPrice == null && ui.marketReady ? `<div class="head"><h2>Verkaufen</h2></div>
      <div class="btns"><button class="btn" data-auction-form="${esc(c.key)}">Versteigern</button></div>
      <div class="fieldwrap" style="margin-top:10px"><input class="field" id="sellPrice" type="number" min="0.01" max="100000" step="0.01" value="${Math.max(0.01, c.price || 0).toFixed(2)}" aria-label="Preis in Euro"><span>€</span></div>
      <div class="btns"><button class="btn sec" data-sell="${esc(c.key)}">Zum Festpreis anbieten</button></div>` : ''}
    <div class="btns"><button class="btn sec" data-remove="${esc(c.key)}">Aus der Sammlung entfernen</button></div></div>`;
  modal.hidden = false;
  attachTilt(modal);
  drawChart(modal);
}

// Zeigt eine Karte, die noch nicht in der Sammlung ist.
function openPreview(card, note) {
  const have = owned(card);
  if (have && have.verified) { openCard(have.key); return; }
  ui.preview = card;
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">${ICON.back}</button>
    ${card.image ? `<div class="holo"><img class="cardimg" src="${esc(hq(card.image))}" alt=""><span class="gloss"></span></div>` : ''}
    ${auctionTicker(card)}
    <div class="detail">
      ${have ? `<button class="star on" data-remove="${esc(have.key)}" aria-label="Nicht mehr merken">${ICON.star}</button>` : '<button class="star" data-add-preview aria-label="Merken">' + ICON.star + '</button>'}
      <div><h3>${esc(card.name)}</h3>
        <div class="muted small">${esc(GAMES[card.game])} · <span class="setname">${esc(card.set)}</span></div>
        <div class="muted small">${[card.rarity, card.number && '#' + card.number].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="pricebox"><div class="big">${card.price ? money.format(card.price) : 'Kein Preis'}</div></div>
    </div>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="walletline"><span>Guthaben</span><b>${eur(freeBalance())}</b></div>
    <div class="btns">
      ${card.price ? `<button class="btn buy" data-buy-card ${cents(card.price) > freeBalance() ? 'disabled' : ''}>${cents(card.price) > freeBalance() ? 'Nicht genug Guthaben' : `Kaufen`}</button>` : ''}
      <button class="btn sec" data-go-scan>Scannen</button>
    </div></div>`;
  modal.hidden = false;
  attachTilt(modal);
}

// ---------- Suche und Sets ----------
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
  const dexValue = counted('pokemon').filter(c => (c.dexId || []).length).reduce((s, c) => s + (c.price || 0), 0);
  return `<div class="head"><h2>Sets</h2></div><div class="subtabs">
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
      : scanCta('Fang dein erstes Pokémon')}`;
}

function renderScan() {
  const photoUrl = ui.photo ? ui.photoUrl : null;
  let body;
  if (ui.found.length) {
    const tile = (c, i) => `
      <button class="tile" data-add="${i}" aria-label="${esc(c.name)} hinzufügen">${cardImg(c)}
        <span class="name">${esc(c.name)}</span>
        <span class="sub">${esc(GAMES[c.game])} · ${esc(c.set)}</span>
        ${c.rarity ? `<span class="sub">${esc(c.rarity)}</span>` : ''}
        <span class="val">${c.price ? money.format(c.price) : 'Kein Preis'}</span>
        <span class="qty">${hasCard(c) ? 'In deiner Sammlung' : c.number ? '#' + esc(c.number) : ''}</span>
        <span class="plus ${hasCard(c) ? 'has' : ''}">${hasCard(c) ? ICON.check : ICON.plus}</span>
      </button>`;
    const top = ui.found[0];
    body = ui.sure ? `
      <div class="hit pop">${cardImg(top)}
        <div class="info"><span class="tagline">Erkannt</span><h3>${esc(top.name)}</h3>
          <span class="muted small">${esc(top.set)}${top.number ? ' · #' + esc(top.number) : ''}</span>
          <span class="price">${top.price ? money.format(top.price) : 'Kein Preis'}</span>
          ${hasCard(top) ? '<button class="btn sec" disabled>In deiner Sammlung</button>' : '<button class="btn" data-add="0">Hinzufügen</button>'}</div>
      </div>
      ${ui.found.length > 1 ? `<div class="head" style="margin-top:0"><h2>Andere Versionen</h2></div>
      <div class="grid big stag">${ui.found.slice(1).map((c, i) => tile(c, i + 1)).join('')}</div>` : ''}`
      : `<div class="grid big stag">${ui.found.map(tile).join('')}</div>`;
  } else if (ui.searchView === 'set' && ui.game === 'pokemon') {
    body = setHtml();
  } else if (ui.searchView === 'dex' && ui.game === 'pokemon') {
    body = dexHtml();
  } else {
    body = `${scanCta('Karte scannen')}
      <div class="head"><h2>Schnellfilter</h2></div>
      <div class="qf" id="qfbox">${Object.entries(GAMES).map(([k, v]) => gameTile(k, v, 'game', ui.game === k)).join('')}</div>
      <div class="quick">${['Glurak', 'Pikachu', 'Mewtu', 'Evoli', 'Gengar', 'Lugia', 'Rayquaza'].map(q => `<button data-quick="${q}" data-quick-game="pokemon">${q}</button>`).join('')}</div>
      <div id="feedbox" data-kind="search">${feedHtml('search')}</div>
      ${ui.game === 'pokemon' ? setsHtml() : ''}`;
    if (ui.game === 'pokemon' && !ui.sets[ui.setLang]) loadSets(ui.setLang);
  }
  view.innerHTML = `
    <div class="searchbar">
      <button class="round cam-btn" data-camera aria-label="Karte scannen">${ICON.camera}</button>
      <div class="search">
        <input id="q" placeholder="Karten suchen" aria-label="Kartenname" value="${esc(ui.q)}">
        ${ui.q ? `<button data-clear-search aria-label="Suche löschen">${ICON.close}</button>` : `<button data-search aria-label="Suchen">${ICON.search}</button>`}
      </div>
      <button class="round" data-saved aria-label="Gemerkte Karten">${ICON.star}</button>
      <button class="round" data-games="game" aria-label="Spiel auswählen">${ICON.menu}</button>
    </div>
    <div class="filters">
      <button class="chip" data-games="game">${esc(GAMES[ui.game])}</button>
      <span>
        ${ui.found.length ? '<button class="link" data-show-sets>Zurück</button> · ' : ''}
        <button class="link" data-pick>Aus Galerie</button>
      </span>
    </div>
    <input id="file" type="file" accept="image/*" hidden>
    ${photoUrl ? `<div class="scanwrap ${ui.scanning ? 'scanning' : ''}"><img class="preview" src="${photoUrl}" alt="Dein Foto">${ui.scanning ? `<span id="scanstep">${esc(ui.scanStep || '')}</span>` : ''}</div>` : ''}
    ${ui.status ? `<div class="note ${ui.status.level || ''}">${esc(ui.status.text)}${ui.status.reasons && ui.status.reasons.length ? `<ul>${ui.status.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</div>` : ''}
    ${ui.scanning ? '' : body}`;
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
  ui.found = [];
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

async function openLive() {
  try {
    await openScanner({
      game: ui.game,
      hashes: state.hashes,
      hasCard,
      onAdd(card, hash, img) {
        if (!addToCollection(card, true, hash)) return;
        state.hashes.push(hash);
        save();
        flyToCollection(img, '+' + money.format(card.price || 0));
      },
      onGallery() {
        switchTab('scan');
        document.getElementById('file').click();
      },
    });
  } catch {
    toast('Kein Kamera-Zugriff. Wähle ein Foto aus der Galerie.');
  }
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
  ui.scanStep = 'Karte wird erkannt …';
  renderScan();
  window.scrollTo(0, 0);
  try {
    const { cards, sure } = await identify(blob, ui.game, text => {
      ui.scanStep = text;
      const el = document.getElementById('scanstep');
      if (el) el.textContent = text;
    });
    ui.found = cards;
    ui.sure = sure;
    ui.status = sure ? { text: 'Aus der Galerie: zählt nicht zur Sammlung.' }
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
  ui.photo = null;
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
  const have = owned(card);
  if (have) {
    if (have.verified || !verified) return false;
    state.cards = state.cards.filter(c => c !== have); // aus gemerkt wird gezählt
  }
  const hist = { ...(card.hist || {}) };
  hist[today()] = card.price;
  state.cards.unshift({ ...card, hist, verified, photoHash: photoHash || null, key: crypto.randomUUID(), addedAt: Date.now() });
  if (verified && card.buyPrice == null && !card.fromServer) logEvent('scan', card, cents(card.price));
  save();
  return true;
}

async function addFound(i, from) {
  const card = ui.found[i];
  if (!card) return;
  if (hasCard(card)) { openPreview(card, ''); return; }
  // Ohne Foto gibt es nichts zu prüfen: Dann kann man die Karte kaufen oder merken.
  if (!ui.photo) { openPreview(card, ''); return; }
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
  flyToCollection(from, verified ? '+' + money.format(card.price || 0) : '');
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
  const value = counted().reduce((s, c) => s + cents(c.price), 0);
  view.innerHTML = `
    <div class="tabs"><button class="on">Portfolio</button><span class="pill"><i>€</i>EUR</span></div>
    <section class="value">
      <div class="label">Kartenwert: <button class="link" data-games="filter">${ui.filter === 'all' ? 'Alle Karten' : esc(GAMES[ui.filter])}</button></div>
      <div class="big">${eur(value)}</div>
    </section>
    ${shown.length ? `<div class="head"><h2>${shown.length} ${shown.length === 1 ? 'Karte' : 'Karten'}</h2></div>
    <div class="grid big stag">${shown.map(c => `
      <button class="tile" data-open="${esc(c.key)}">${cardImg(c)}
        <span class="name">${esc(c.name)}</span>
        <span class="sub">${esc(GAMES[c.game])} · ${esc(c.set)}</span>
        ${c.rarity ? `<span class="sub">${esc(c.rarity)}</span>` : ''}
        <span class="val">${money.format(c.price || 0)}</span>
        ${c.buyPrice != null ? `<span class="tag ${profitOf(c) < 0 ? 'lossTag' : 'gainTag'}">${profitOf(c) < 0 ? '-' : '+'}${eur(Math.abs(profitOf(c)))}</span>` : c.verified ? '' : '<span class="tag">Zählt nicht</span>'}
      </button>`).join('')}</div>` : scanCta('Starte deine Sammlung')}
    <div id="feedbox" data-kind="portfolio">${feedHtml('portfolio')}</div>`;
}

function renderProfile() {
  const cards = counted('all');
  const value = cards.reduce((s, c) => s + cents(c.price), 0);
  const profit = cards.reduce((s, c) => s + profitOf(c), 0);
  const top = [...cards].sort((a, b) => (b.price || 0) - (a.price || 0));
  const dex = ownedDex().size;
  const bySet = new Map();
  for (const c of counted('pokemon')) {
    const e = bySet.get(c.setId) || { name: c.set, n: new Set(), v: 0 };
    e.n.add(c.rawId); e.v += cents(c.price);
    bySet.set(c.setId, e);
  }
  const started = [...bySet.values()].sort((a, b) => b.v - a.v).slice(0, 4);
  const games = Object.entries(GAMES).map(([k, label]) => ({ label, v: counted(k).reduce((s, c) => s + cents(c.price), 0), n: counted(k).length }));
  const when = at => new Date(at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  const KIND = { kauf: 'Gekauft', verkauf: 'Verkauft', scan: 'Gescannt' };
  view.innerHTML = `
    <div class="ptop">
      ${ui.editName ? `<div class="nameedit"><input id="nameInput" maxlength="18" value="${esc(state.name)}" aria-label="Dein Name"><button data-save-name aria-label="Speichern">${ICON.check}</button></div>`
        : `<button class="namebtn" data-edit-name><b>${esc(state.name)}</b>${ICON.edit}</button>`}
    </div>
    <div class="pstats">
      <div><span>Gesamt</span><b>${eur(value + freeBalance())}</b></div>
      <div><span>${profit < 0 ? 'Verlust' : 'Gewinn'}</span><b class="${profit < 0 ? 'down' : profit > 0 ? 'up' : ''}">${profit < 0 ? '-' : profit > 0 ? '+' : ''}${eur(Math.abs(profit))}</b></div>
      <div><span>Karten</span><b>${nf.format(cards.length)}</b></div>
    </div>
    <div class="head"><h2>Vitrine</h2>${top.length ? '<button class="link" data-go="portfolio">Alle</button>' : ''}</div>
    ${top.length ? `<div class="grid">${top.slice(0, 3).map(c => `<button class="tile" data-open="${esc(c.key)}">${cardImg(c)}<span class="name">${esc(c.name)}</span><span class="val">${money.format(c.price || 0)}</span></button>`).join('')}</div>`
      : scanCta('Karte scannen')}
    <div class="head"><h2>Fortschritt</h2></div>
    <div class="rows">
      <button class="prow" data-dex-go><span>Pokédex</span><em>${nf.format(dex)} / ${nf.format(DEX_TOTAL)}</em></button>
      ${started.map(s => `<div class="prow"><span>${esc(s.name)}</span><em>${s.n.size} · ${eur(s.v)}</em></div>`).join('')}
    </div>
    <div class="head"><h2>Spiele</h2></div>
    <div class="rows">${games.map(g => `<div class="prow"><span>${esc(g.label)}</span><em>${g.n} · ${eur(g.v)}</em></div>`).join('')}</div>
    ${state.events.length ? `<div class="head"><h2>Verlauf</h2></div>
      <div class="rows">${state.events.slice(0, 8).map(e => `<div class="item"><img src="${esc(e.image)}" alt="">
        <span class="left"><span class="name">${esc(e.name)}</span><span class="sub">${KIND[e.kind]} · ${when(e.at)}</span></span>
        <span class="right ${e.kind === 'kauf' ? '' : 'up'}">${e.kind === 'kauf' ? '-' : '+'}${eur(Math.abs(e.amount))}</span></div>`).join('')}</div>` : ''}
    <details class="facts"><summary><span>Infos</span>${ICON.chevron}</summary>
      <p>Das Guthaben ist nur eine Anzeige in der App. Du kannst es nicht abheben oder außerhalb der App ausgeben.</p>
      <p>Preise kommen von Cardmarket, TCGplayer, Scryfall und YGOPRODeck und können veraltet sein.</p>
      <p>Gekaufte und ersteigerte Karten sind nur digital. Zur Sammlung zählen Kamera-Scans mit Echtheitsprobe und Käufe, Galerie-Bilder nicht.</p>
      <p>Auktionen laufen nur mit App-Guthaben. Geprüft wird auf dem Gerät, von den Fotos bleibt nur ein Fingerabdruck auf dem Server.</p>
      <p>Sammlung und Name liegen nur auf diesem Gerät. Fotos werden nie hochgeladen.</p>
      <p>Version 1.5.2</p>
    </details>`;
}

// ---------- Markt ----------
async function syncMarket() {
  try {
    const me = await market.join(state.secret);
    ui.marketReady = !!me;
    if (me) {
      ui.balance = me.points;
      await pickResults();
      await loadAuctions();
    }
  } catch {
    ui.marketReady = false;
  }
}

// Holt beendete Auktionen ab: gewonnene Karten, Verkaufserlöse, zurückgekommene Karten.
let picking = false;
async function pickResults() {
  if (picking) return;
  picking = true;
  try {
    await collectResults();
  } finally { picking = false; }
}
async function collectResults() {
  const { points, results } = await market.results(state.secret);
  ui.balance = points;
  if (!results.length) return;
  for (const r of results) {
    const fresh = r.kind === 'sold' ? null : await getCard(r.game, r.card_id).catch(() => null);
    const card = { ...(fresh || fromListing(r)), hist: {}, fromServer: true };
    if (r.kind === 'won') {
      addToCollection({ ...card, wonFor: r.amount / CENTS }, true, null);
      logEvent('kauf', card, -r.amount);
      toast(`Auktion gewonnen: ${r.name}`);
    } else if (r.kind === 'sold') {
      logEvent('verkauf', card, r.amount);
      toast(`${r.name} versteigert für ${eur(r.amount)}`);
    } else {
      addToCollection(card, true, null);
      toast(`Kein Gebot: ${r.name} ist zurück in deiner Sammlung.`);
    }
  }
  save();
  await market.resultsDone(state.secret, results.map(r => r.id));
}

// Name und Bild kommen aus dem Katalog, nicht vom Anbieter. Unbekannte Karten werden nicht gezeigt.
async function loadAuctions() {
  const list = await market.auctions(state.secret);
  const now = Date.now();
  const checked = await Promise.all(list.map(async a => {
    const fresh = await getCard(a.game, a.card_id).catch(() => undefined);
    if (fresh === null) return null;
    if (fresh) { a.name = fresh.name; a.image = fresh.image; a.set_name = fresh.set; a.rarity = fresh.rarity; a.market_eur = fresh.price; }
    a.endsAt = now + a.ends_in * 1000;
    return a;
  }));
  ui.auctions = checked.filter(Boolean);
}

const timeLeft = endsAt => {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  if (s >= 86400) return `${Math.floor(s / 86400)} T ${Math.floor(s % 86400 / 3600)} Std`;
  if (s >= 3600) return `${Math.floor(s / 3600)} Std ${Math.floor(s % 3600 / 60)} Min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const endsSoon = a => a.endsAt - Date.now() < 3600 * 1000;
const auctionPrice = a => a.top_bid ?? a.start_price;
const minBid = a => (a.top_bid == null ? a.start_price : a.top_bid + Math.max(10, Math.ceil(a.top_bid * .05)));

function auctionTicker(card) {
  const a = ui.auctions.find(x => !x.mine && cardIdent({ game: x.game, id: x.card_id }) === cardIdent(card));
  if (!a) return '';
  return `<button class="ticker" data-auction="${esc(a.id)}">${ICON.flame}<span>${endsSoon(a) ? 'Auktion endet bald!' : 'Läuft als Auktion.'} Aktuelles Gebot: ${eur(auctionPrice(a))}</span></button>`;
}

function auctionTile(a) {
  return `<button class="prod auc" data-auction="${esc(a.id)}">${cardImg(a)}
    <span class="name">${esc(a.name)}</span>
    <span class="price">${eur(auctionPrice(a))}</span>
    <span class="sub ${endsSoon(a) ? 'down' : ''}" data-ends-at="${a.endsAt}">${timeLeft(a.endsAt)}</span></button>`;
}

function openAuction(id) {
  const a = ui.auctions.find(x => x.id === id);
  if (!a) { closeModal(); return; }
  const has = hasCard({ game: a.game, id: a.card_id });
  const least = minBid(a);
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">${ICON.back}</button>
    ${a.image ? `<div class="holo"><img class="cardimg" src="${esc(hq(a.image))}" alt=""><span class="gloss"></span></div>` : ''}
    ${endsSoon(a) ? `<div class="ticker">${ICON.flame}<span>Auktion endet bald! Aktuelles Gebot: ${eur(auctionPrice(a))}</span></div>` : ''}
    <div class="detail">
      <div><h3>${esc(a.name)}</h3>
        <div class="muted small">${esc(GAMES[a.game])} · <span class="setname">${esc(a.set_name)}</span></div>
        <div class="muted small">${[a.rarity, a.number && '#' + a.number].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="pricebox"><div class="big">${eur(auctionPrice(a))}</div>
        <div class="muted small">${a.bid_count} ${a.bid_count === 1 ? 'Gebot' : 'Gebote'}</div></div>
    </div>
    <div class="aucline"><span>Endet in</span><b data-ends-at="${a.endsAt}">${timeLeft(a.endsAt)}</b></div>
    ${a.market_eur ? `<div class="aucline"><span>Marktpreis</span><b>${money.format(a.market_eur)}</b></div>` : ''}
    <div class="aucline"><span>Dein Guthaben</span><b>${eur(freeBalance())}</b></div>
    ${a.mine ? `<div class="btns">${a.bid_count ? '<p class="note" style="margin:0">Deine Karte. Sie geht an das höchste Gebot.</p>' : `<button class="btn sec" data-auction-cancel="${esc(a.id)}">Auktion zurückziehen</button>`}</div>`
      : has ? '<p class="note" style="margin:12px 0 0">Du hast diese Karte schon.</p>'
      : `${a.leading ? '<p class="note ok" style="margin:12px 0 0">Du liegst vorn.</p>' : ''}
        <div class="fieldwrap" style="margin-top:10px"><input class="field" id="bidValue" type="number" min="${(least / CENTS).toFixed(2)}" max="100000" step="0.01" value="${(least / CENTS).toFixed(2)}" aria-label="Dein Gebot in Euro"><span>€</span></div>
        <div class="btns"><button class="btn" data-bid="${esc(a.id)}">Bieten</button></div>`}
    <p class="note" style="margin:12px 0 0">Nur digitale Karte, bezahlt mit App-Guthaben. Dein Gebot wird reserviert und kommt zurück, wenn dich jemand überbietet.</p>
  </div>`;
  modal.hidden = false;
  attachTilt(modal);
}

async function doBid(id) {
  const amount = Math.round(Number(document.getElementById('bidValue').value) * CENTS);
  try {
    const res = await market.bid(state.secret, id, amount, Math.min(0, state.ledger));
    ui.balance = res.points;
    await loadAuctions();
    toast('Gebot abgegeben.');
    openAuction(id);
    if (ui.tab === 'market') renderMarket();
  } catch (e) {
    toast(e.message);
    await loadAuctions().catch(() => {});
    if (!modal.hidden) openAuction(id);
  }
}

async function doAuctionCancel(id) {
  try {
    const l = await market.auctionCancel(state.secret, id);
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    addToCollection({ ...(fresh || fromListing(l)), fromServer: true }, true, null);
    closeModal();
    toast('Auktion zurückgezogen.');
    await showMarket();
  } catch (e) { toast(e.message); }
}

// Der Server würfelt die Aufgaben der Probe und merkt sich danach, dass die Karte geprüft ist.
async function ensureVerified(card) {
  const start = await market.proofStart(state.secret, card);
  if (start.verified) return true;
  const proof = await runProof({ card, steps: start.steps });
  if (!proof.ok) {
    if (proof.reason) toast(proof.reason);
    return false;
  }
  const res = await market.proofFinish(state.secret, start.nonce, proof.frames);
  if (!res.verified) { toast(res.error || 'Die Probe wurde abgelehnt.'); return false; }
  return true;
}

function openAuctionForm(key) {
  const c = state.cards.find(x => x.key === key);
  if (!c) return;
  ui.auctionHours = 24;
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-open="${esc(c.key)}" aria-label="Zurück">${ICON.back}</button>
    <h3 class="center">Versteigern</h3>
    <div class="hit" style="margin-top:12px">${cardImg(c)}<div class="info"><h3>${esc(c.name)}</h3><span class="muted small">${esc(c.set)}</span>
      <span class="muted small">Marktpreis ${money.format(c.price || 0)}</span></div></div>
    <div class="head" style="margin-top:0"><h2>Startpreis</h2></div>
    <div class="fieldwrap"><input class="field" id="auctionStart" type="number" min="0.01" max="100000" step="0.01" value="${Math.max(0.01, (c.price || 0) * .5).toFixed(2)}" aria-label="Startpreis in Euro"><span>€</span></div>
    <div class="head"><h2>Laufzeit</h2></div>
    <div class="ranges hours">${[[1, '1 Std'], [24, '1 Tag'], [72, '3 Tage']].map(([h, t]) => `<button data-hours="${h}" class="${h === 24 ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="btns"><button class="btn" data-auction-create="${esc(c.key)}">Karte prüfen und starten</button></div>
    <p class="note" style="margin:12px 0 0">Zum Schluss zeigst du die echte Karte vor der Kamera. Wer am meisten bietet, bekommt die digitale Karte, du das App-Guthaben.</p>
  </div>`;
  modal.hidden = false;
}

async function doAuctionCreate(key) {
  const c = state.cards.find(x => x.key === key);
  const start = Math.round(Number(document.getElementById('auctionStart').value) * CENTS);
  if (!c) return;
  if (!(start >= 1 && start <= 10000000)) { toast('Gib einen Startpreis von 0,01 € bis 100.000 € ein.'); return; }
  try {
    if (!await ensureVerified(c)) return;
    await market.auctionCreate(state.secret, c, start, ui.auctionHours || 24);
    state.cards = state.cards.filter(x => x.key !== key);
    save();
    closeModal();
    toast('Deine Auktion läuft.');
    switchTab('market');
  } catch (e) { toast(e.message); }
}
const freeBalance = () => (ui.balance ?? START_BALANCE) + state.ledger;

function logEvent(kind, card, amount) {
  state.events.unshift({ kind, name: card.name, image: small(card.image), amount, at: Date.now() });
  state.events = state.events.slice(0, 30);
}
const profitOf = c => (c.buyPrice != null ? cents(c.price) - cents(c.buyPrice) : 0);

// Kauft eine Karte zum aktuellen Marktpreis vom App-Guthaben.
async function buyCard(from) {
  const seen = ui.preview;
  if (!seen) return;
  if (hasCard(seen)) { toast('Du hast diese Karte schon.'); return; }
  const fresh = await getCard(seen.game, seen.id).catch(() => null) || seen;
  const price = cents(fresh.price);
  if (!price) { toast('Für diese Karte gibt es keinen Preis.'); return; }
  if (price > freeBalance()) { toast('Nicht genug Guthaben.'); return; }
  state.ledger -= price;
  // Kurve beginnt erst mit dem Kauf, davor gehörte dir die Karte nicht.
  addToCollection({ ...fresh, hist: {}, buyPrice: fresh.price, boughtAt: Date.now() }, true, null);
  logEvent('kauf', fresh, -price);
  save();
  flyToCollection(from, '');
  closeModal();
  toast(`${fresh.name} gekauft. Neues Guthaben: ${eur(freeBalance())}`);
  renderTab();
}

// Verkauft eine gekaufte Karte zum aktuellen Marktpreis zurück.
async function sellBack(key) {
  const c = state.cards.find(x => x.key === key);
  if (!c || c.buyPrice == null) return;
  const fresh = await getCard(c.game, c.id).catch(() => null);
  if (fresh && fresh.price) c.price = fresh.price;
  const value = cents(c.price);
  state.ledger += value;
  logEvent('verkauf', c, value);
  state.cards = state.cards.filter(x => x.key !== key);
  save();
  closeModal();
  const profit = value - cents(c.buyPrice);
  toast(`Verkauft für ${eur(value)}. ${profit >= 0 ? 'Gewinn' : 'Verlust'}: ${eur(Math.abs(profit))}`);
  renderTab();
}

function feat(item, attr, price) {
  return `<button class="feat" data-${attr}="${esc(item.id)}"><span class="pic">${item.image ? `<img src="${esc(small(item.image))}" alt="" loading="lazy">` : ''}</span>
    <span class="txt"><span class="name">${esc(item.name)}</span><span class="sub">${esc(item.set_name ?? item.set)} - ${esc(GAMES[item.game])}</span><span class="price">${price}</span></span></button>`;
}
function prod(l) {
  return `<button class="prod" data-listing="${esc(l.id)}">${cardImg(l)}
    <span class="name">${esc(l.name)}</span>
    <span class="price">${eur(l.price)}</span>
    <span class="sub">${l.market_eur ? 'Markt ' + money.format(l.market_eur) : esc(GAMES[l.game])}</span></button>`;
}
function section(title, key, items, empty) {
  const open = ui.marketAll === key;
  return `<div class="head"><h2>${title}</h2>${items.length > 2 ? `<button class="link" data-market-all="${key}">${open ? 'Weniger' : 'Alle anzeigen'}</button>` : ''}</div>
    ${items.length ? `<div class="shelf stag ${open ? 'open' : ''}">${items.map(prod).join('')}</div>` : `<div class="panelnote">${empty}</div>`}`;
}

function renderMarket() {
  const q = ui.mq.trim().toLowerCase();
  const list = ui.listings.filter(l => (ui.marketGame === 'all' || l.game === ui.marketGame) && (!q || l.name.toLowerCase().includes(q)));
  const top = [...list].sort((a, b) => b.price - a.price).slice(0, 6);
  const watched = list.filter(l => state.watch.includes(l.id));
  const catalog = ui.catalog.filter(c => ui.marketGame === 'all' || c.game === ui.marketGame);
  const featured = top.length ? top.map(l => feat(l, 'listing', eur(l.price)))
    : (catalog.length ? catalog : topCards(feed, 8)).map(c => feat(c, ui.catalog.includes(c) ? 'catalog' : 'feed', money.format(c.price || 0)));
  view.innerHTML = `
    <div class="searchbar">
      <div class="search"><span class="ic">${ICON.search}</span>
        <input id="mq" placeholder="Karten suchen" aria-label="Karten suchen" value="${esc(ui.mq)}">
        ${ui.mq ? `<button data-clear-market aria-label="Suche löschen">${ICON.close}</button>` : ''}
      </div>
      <button class="round" data-games="marketGame" aria-label="Spiel auswählen">${ICON.menu}</button>
    </div>
    <div class="points"><span>Freies Guthaben <b>${eur(freeBalance())}</b></span><span>${ui.marketGame === 'all' ? '' : esc(GAMES[ui.marketGame])}</span></div>
    ${ui.auctions.length ? `<div class="head"><h2>Auktionen</h2></div>
      <div class="shelf stag">${ui.auctions.filter(a => (ui.marketGame === 'all' || a.game === ui.marketGame) && (!q || a.name.toLowerCase().includes(q))).map(auctionTile).join('')}</div>` : ''}
    <div class="head"><h2>Empfohlen</h2></div>
    ${featured.length ? `<div class="shelf stag">${featured.join('')}</div>` : SKELETON_SHELF}
    ${watched.length ? section('Merkliste', 'watch', watched, '') : ''}
    ${list.length ? section('Neu im Angebot', 'new', list, '') : ''}
    ${ui.marketReady === false && !list.length ? '<p class="marketoff"><b>Angebote von anderen kommen bald.</b></p>' : ''}
    <div id="feedbox" data-kind="market">${feedHtml('market')}</div>`;
}

function openListing(id) {
  const l = ui.listings.find(x => x.id === id);
  if (!l) return;
  const watching = state.watch.includes(id);
  const already = hasCard({ game: l.game, id: l.card_id });
  modal.innerHTML = `<div class="sheet">
    <button class="back" data-close aria-label="Zurück">${ICON.back}</button>
    ${l.image ? `<div class="holo"><img class="cardimg" src="${esc(hq(l.image))}" alt=""><span class="gloss"></span></div>` : ''}
    <div class="detail">
      <div><h3>${esc(l.name)}</h3>
        <div class="muted small">${esc(GAMES[l.game])} · ${esc(l.set_name)}</div>
        <div class="muted small">${l.number ? '#' + esc(l.number) : ''}</div></div>
      <div class="pricebox"><div class="big">${eur(l.price)}</div>
        <div class="muted small">${l.market_eur ? 'Marktpreis ' + money.format(l.market_eur) : ''}</div></div>
    </div>
    <p class="note">Nur digitale Karte. Bezahlt wird mit deinem App-Guthaben (${eur(freeBalance())}).</p>
    <div class="btns">
      ${l.mine ? `<button class="btn sec" data-cancel="${esc(l.id)}">Angebot zurückziehen</button>` : `<button class="btn" data-buy="${esc(l.id)}" ${already || l.price > freeBalance() ? 'disabled' : ''}>${already ? 'In deiner Sammlung' : l.price > freeBalance() ? 'Nicht genug Guthaben' : 'Kaufen'}</button>`}
      ${l.mine ? '' : `<button class="btn sec" data-watch="${esc(l.id)}">${watching ? 'Von Merkliste entfernen' : 'Merken'}</button>`}
    </div></div>`;
  modal.hidden = false;
  attachTilt(modal);
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
  for (const l of ui.listings.slice(0, 30)) {
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    if (fresh) { l.market_eur = fresh.price; l.name = fresh.name; l.image = fresh.image; }
    if (ui.tab !== 'market') return;
  }
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
  const price = Math.round(Number(document.getElementById('sellPrice').value) * CENTS);
  if (!c || !c.verified || !(price >= 1 && price <= 10000000)) { toast('Gib einen Preis von 0,01 € bis 100.000 € ein.'); return; }
  try {
    if (!await ensureVerified(c)) return;
    await market.sell(state.secret, c, price);
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
  const wanted = ui.listings.find(x => x.id === id);
  if (wanted && hasCard({ game: wanted.game, id: wanted.card_id })) { toast('Du hast diese Karte schon.'); return; }
  try {
    const l = await market.buy(state.secret, id);
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    addToCollection({ ...(fresh || fromListing(l)), fromServer: true }, true, null);
    state.watch = state.watch.filter(w => w !== id);
    save();
    flyToCollection(modal.querySelector('.cardimg'), '');
    closeModal();
    toast(l.name + ' gekauft.');
    await showMarket();
  } catch (e) { toast(e.message); }
}

async function doCancel(id) {
  try {
    const l = await market.cancel(state.secret, id);
    const fresh = await getCard(l.game, l.card_id).catch(() => null);
    addToCollection({ ...(fresh || fromListing(l)), fromServer: true }, true, null);
    closeModal();
    toast(hasCard({ game: l.game, id: l.card_id }) ? 'Angebot zurückgezogen.' : 'Karte ist zurück in deiner Sammlung.');
    await showMarket();
  } catch (e) { toast(e.message); }
}

// ---------- Preise aktualisieren ----------
async function refreshPrices() {
  if (Date.now() - state.lastRefresh < 3 * 3600 * 1000) return;
  let changed = false;
  for (const c of state.cards) {
    const fresh = await getCard(c.game, c.id).catch(() => null);
    if (fresh) {
      Object.assign(c, { price: fresh.price, setId: fresh.setId, rawId: fresh.rawId, dexId: fresh.dexId, rarity: fresh.rarity });
      c.hist = c.buyPrice != null ? { ...c.hist, [today()]: fresh.price } : { ...fresh.hist, ...c.hist, [today()]: fresh.price };
      changed = true;
    }
    await new Promise(r => setTimeout(r, 120));
  }
  if (changed) {
    state.lastRefresh = Date.now();
    save();
    if (modal.hidden && ['home', 'portfolio', 'profile'].includes(ui.tab)) renderTab();
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

function moveIndicator() {
  const btn = document.querySelector(`#nav [data-tab="${ui.tab}"]`);
  const bar = document.getElementById('navbar');
  if (btn && bar) {
    const r = btn.getBoundingClientRect();
    bar.style.transform = `translateX(${r.left + r.width / 2 - 14}px)`;
  }
}

function switchTab(tab) {
  const direction = TABS.indexOf(tab) >= TABS.indexOf(ui.tab) ? 1 : -1;
  ui.tab = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  moveIndicator();
  renderTab();
  enterPage(view, direction);
  window.scrollTo(0, 0);
}

function pickGame(target, key) {
  ui[target] = key;
  closeModal();
  if (target === 'filter') renderTab();
  if (target === 'game') { ui.found = []; ui.status = null; ui.q = ''; renderScan(); }
  if (target === 'marketGame') {
    ui.catalog = [];
    if (key !== 'all') {
      loadCatalog(key === 'magic' ? 'Sol Ring' : key === 'yugioh' ? 'Blue-Eyes' : 'Glurak').then(() => { if (ui.tab === 'market') renderMarket(); });
    }
    renderMarket();
  }
}

document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) switchTab(b.dataset.tab);
});

// Zeigt das Kartenbild groß, ein Tipp schließt es wieder.
function openZoom(src) {
  const box = document.createElement('div');
  box.id = 'zoom';
  box.innerHTML = `<img src="${esc(src)}" alt="">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('cardimg')) { openZoom(e.target.src); return; }
  const b = e.target.closest('button');
  if (!b) { if (e.target === modal) closeModal(); return; }
  if (b.closest('#live')) return;
  const d = b.dataset;
  if (d.range) { ui.range = d.range; renderHome(); }
  else if (d.overview) { ui.overview = d.overview; renderHome(); }
  else if (d.cardRange) { ui.cardRange = d.cardRange; openCard(ui.open); }
  else if (d.games) openGames(d.games);
  else if (d.pickGame) pickGame(d.target, d.pickGame);
  else if (d.go) switchTab(d.go);
  else if ('allValuable' in d) { ui.allValuable = !ui.allValuable; renderHome(false); }
  else if (d.open) openCard(d.open);
  else if ('close' in d) closeModal();
  else if (d.remove) {
    state.cards = state.cards.filter(c => c.key !== d.remove);
    save(); closeModal(); renderTab();
  }
  else if ('saved' in d) {
    ui.found = state.cards.filter(c => !c.verified);
    ui.q = ''; ui.photo = null; ui.sure = false;
    ui.status = ui.found.length ? null : { text: 'Noch nichts gemerkt.' };
    renderScan();
  }
  else if ('camera' in d) openLive();
  else if ('pick' in d) document.getElementById('file').click();
  else if ('search' in d) manualSearch();
  else if ('clearSearch' in d) { ui.q = ''; ui.found = []; ui.status = null; ui.photo = null; ui.searchView = 'sets'; renderScan(); }
  else if ('showSets' in d) { ui.searchView = 'sets'; ui.found = []; ui.status = null; ui.photo = null; ui.q = ''; renderScan(); }
  else if ('allSets' in d) { ui.searchView = 'sets'; switchTab('scan'); }
  else if (d.quick) {
    ui.game = d.quickGame || 'pokemon';
    ui.q = d.quick;
    ui.tab !== 'scan' ? switchTab('scan') : renderScan();
    manualSearch();
  }
  else if (d.setLang) { ui.setLang = d.setLang; renderScan(); }
  else if ('dexGo' in d) { ui.searchView = 'dex'; ui.status = null; ui.found = []; switchTab('scan'); }
  else if ('dex' in d) { ui.searchView = 'dex'; ui.status = null; renderScan(); window.scrollTo(0, 0); }
  else if (d.set) openSet(d.set);
  else if (d.setOpen) { ui.setLang = 'de'; if (ui.tab !== 'scan') switchTab('scan'); openSet(d.setOpen); }
  else if (d.setCard) openSetCard(d.setCard);
  else if (d.feed) { const c = findFeedCard(feed, d.feed); if (c) openPreview(c, ''); }
  else if ('goScan' in d) { closeModal(); openLive(); }
  else if ('addPreview' in d) {
    const card = ui.preview;
    addToCollection(card, false, null);
    flyToCollection(modal.querySelector('.cardimg'), '');
    closeModal();
    toast(card.name + ' gemerkt. Sie zählt noch nicht.');
  }
  else if ('buyCard' in d) buyCard(modal.querySelector('.cardimg'));
  else if (d.sellBack) sellBack(d.sellBack);
  else if ('editName' in d) { ui.editName = true; renderProfile(); document.getElementById('nameInput')?.select(); }
  else if ('saveName' in d) saveName();
  else if (d.add) addFound(Number(d.add), b.querySelector('img') || b.closest('.hit')?.querySelector('img'));
  else if (d.sell) doSell(d.sell);
  else if (d.listing) openListing(d.listing);
  else if (d.catalog) {
    const c = ui.catalog.find(x => x.id === d.catalog);
    if (c) openPreview(c, '');
  }
  else if (d.marketAll) { ui.marketAll = ui.marketAll === d.marketAll ? null : d.marketAll; renderMarket(); }
  else if ('clearMarket' in d) { ui.mq = ''; ui.catalog = []; renderMarket(); }
  else if (d.watch) {
    state.watch = state.watch.includes(d.watch) ? state.watch.filter(w => w !== d.watch) : [...state.watch, d.watch];
    save(); openListing(d.watch); renderMarket();
  }
  else if (d.auctionForm) openAuctionForm(d.auctionForm);
  else if (d.hours) {
    ui.auctionHours = Number(d.hours);
    modal.querySelectorAll('[data-hours]').forEach(x => x.classList.toggle('on', x === b));
  }
  else if (d.auctionCreate) doAuctionCreate(d.auctionCreate);
  else if (d.auction) openAuction(d.auction);
  else if (d.bid) doBid(d.bid);
  else if (d.auctionCancel) doAuctionCancel(d.auctionCancel);
  else if (d.buy) doBuy(d.buy);
  else if (d.cancel) doCancel(d.cancel);
});

document.addEventListener('change', e => {
  if (e.target.id === 'file' && e.target.files[0]) usePhoto(e.target.files[0], 'datei');
});
// Bilder blenden weich ein, sobald sie geladen sind.
document.addEventListener('load', e => {
  if (e.target.tagName === 'IMG') e.target.classList.add('ok');
}, true);
// Fehlt ein Set-Logo, steht dort der Name des Sets.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  img.classList.add('ok');
  if (!img.closest('.set')) return;
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
  if (e.target.id === 'nameInput') saveName();
});
window.addEventListener('resize', moveIndicator);

function saveName() {
  const input = document.getElementById('nameInput');
  const name = input ? input.value.trim().slice(0, 18) : '';
  if (name) { state.name = name; save(); }
  ui.editName = false;
  renderProfile();
}

// Neue Inhalte gleiten beim Scrollen ein, neue Fenster lassen sich wegziehen.
let revealFrame = 0;
new MutationObserver(() => {
  cancelAnimationFrame(revealFrame);
  revealFrame = requestAnimationFrame(() => observeReveal(view));
}).observe(view, { childList: true, subtree: true });
new MutationObserver(() => attachDrag(modal.querySelector('.sheet'), closeModal)).observe(modal, { childList: true });

const navbar = document.createElement('span');
navbar.id = 'navbar';
document.getElementById('nav').appendChild(navbar);

feed = loadFeed(feedChanged);
renderHome();
enterPage(view, 1);
moveIndicator();
syncMarket().then(() => { if (ui.tab === 'home' && modal.hidden) renderHome(false); });
refreshPrices();

// Restzeiten laufen sichtbar weiter, offene Auktionen werden regelmäßig neu geladen.
setInterval(() => {
  document.querySelectorAll('[data-ends-at]').forEach(x => { x.textContent = timeLeft(Number(x.dataset.endsAt)); });
}, 1000);
setInterval(async () => {
  if (!ui.marketReady || document.hidden || !['market', 'home'].includes(ui.tab) || !modal.hidden || document.getElementById('live')) return;
  try {
    await pickResults();
    await loadAuctions();
    if (ui.tab === 'market') renderMarket();
    else paintFeed();
  } catch { /* beim nächsten Mal wieder */ }
}, 20000);
