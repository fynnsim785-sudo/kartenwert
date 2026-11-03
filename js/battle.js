// Kämpfe gegen andere Spieler: Warteschlange, Team-Auswahl und der Kampf selbst.
// Die Regeln laufen auf dem Server (kw_battle_move). Energie-Karten werden hier aus der Sammlung bezahlt und verschwinden.
import * as market from './market.js';
import { battleStats } from './cards.js';
import { ICON } from './icons.js';

const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
const TYPE_COLOR = {
  Grass: '#3d9a4f', Fire: '#e0533b', Water: '#3a7fd5', Lightning: '#e3ae0b', Psychic: '#9a58b8', Fighting: '#bb6430',
  Darkness: '#3a3f47', Metal: '#86929b', Fairy: '#de7fae', Dragon: '#a8862c', Colorless: '#b9bdbb',
};
// Energie-Karten im Markt: die günstigsten Basis-Energien mit Bild (wenige Cent)
const ENERGY_IDS = { Grass: 'sm1/164', Fire: 'sm1/165', Water: 'xy1/134', Lightning: 'sm1/167', Psychic: 'xy12/95', Fighting: 'xy12/96', Darkness: 'sm1/170', Metal: 'xy1/139' };
export const ENERGY_CARDS = TYPES.map(t => {
  const [set, n] = ENERGY_IDS[t].split('/');
  const series = set.replace(/\d+$/, '');
  return { type: t, id: `en:${set}-${n}`, image: `https://assets.tcgdex.net/en/${series}/${set}/${n}/high.webp` };
});
// Typ einer Energie-Karte aus dem Namen, in allen drei Sprachen der App
const ENERGY_WORDS = {
  Grass: /grass|pflanze|草/i, Fire: /fire|feuer|炎/i, Water: /water|wasser|水/i, Lightning: /lightning|elektro|雷/i,
  Psychic: /psychic|psycho|超/i, Fighting: /fighting|kampf|闘/i, Darkness: /darkness|finsternis|悪/i, Metal: /metal|metall|鋼/i,
};

let ctx = null; // { state, save, toast, isEnergy, onClose }
let box = null, timer = 0, tick = 0;
const ui = { view: 'lobby', lobby: null, battle: null, busy: false, picking: [], shown: null };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = url => (url || '').replace('/high.webp', '/low.webp');
const dot = t => `<i class="bt-e" style="--c:${TYPE_COLOR[t] || TYPE_COLOR.Colorless}" title="${esc(t)}"></i>`;

// ---------- Energie ----------
export function energyType(card) {
  if (!ctx.isEnergy(card)) return '';
  return TYPES.find(t => ENERGY_WORDS[t].test(card.name || '')) || '';
}
function energyPool() {
  const pool = Object.fromEntries(TYPES.map(t => [t, []]));
  for (const c of ctx.state.cards) {
    const t = c.verified && energyType(c);
    if (t) pool[t].push(c.key);
  }
  return pool;
}
// Welche Energie-Karten eine Attacke kostet: erst die farbigen, dann für Farblos die Sorte, von der am meisten da ist.
function payment(cost) {
  const pool = energyPool(), take = [];
  for (const t of cost.filter(t => t !== 'Colorless')) {
    if (!pool[t] || !pool[t].length) return null;
    take.push(pool[t].pop());
  }
  for (let i = cost.filter(t => t === 'Colorless').length; i > 0; i--) {
    const best = TYPES.reduce((a, t) => (pool[t].length > pool[a].length ? t : a), TYPES[0]);
    if (!pool[best].length) return null;
    take.push(pool[best].pop());
  }
  return take;
}

// ---------- Team ----------
// Kampfwerte werden einmal geladen und an der Karte gespeichert.
async function statsOf(card) {
  if (card.bt !== undefined) return card.bt;
  card.bt = await battleStats(card).catch(() => undefined);
  if (card.bt === undefined) return null; // Netzfehler: beim nächsten Mal noch einmal versuchen
  ctx.save();
  return card.bt;
}
const teamCards = () => (ctx.state.battleTeam || []).map(k => ctx.state.cards.find(c => c.key === k && c.verified)).filter(Boolean);
async function teamPayload() {
  const out = [];
  for (const c of teamCards()) {
    const s = await statsOf(c);
    if (s) out.push({ name: c.name, image: c.image || '', ...s });
  }
  return out;
}

// ---------- Ablauf ----------
export function openBattle(context) {
  ctx = context;
  if (box) return;
  box = document.createElement('div');
  box.id = 'battle';
  box.innerHTML = '<div class="bt-in"></div>';
  document.body.appendChild(box);
  document.body.classList.add('noscroll');
  box.addEventListener('click', onClick);
  ui.view = 'lobby'; ui.lobby = null; ui.battle = null; ui.shown = null;
  render();
  poll();
}

async function close() {
  clearTimeout(timer);
  if (ui.lobby && ui.lobby.queued) market.queueLeave(ctx.state.secret).catch(() => {});
  box.remove();
  box = null;
  document.body.classList.remove('noscroll');
  ctx.onClose();
}

// Fragt den Server regelmäßig ab: in der Lobby alle 2 Sekunden, im Kampf öfter.
async function poll() {
  clearTimeout(timer);
  if (!box) return;
  try {
    if (ui.view === 'fight' && ui.battle) {
      const b = await market.battle(ctx.state.secret, ui.battle.id);
      if (box) show(b);
    } else if (ui.view === 'lobby') {
      ui.lobby = await market.lobby(ctx.state.secret);
      if (ui.lobby.battle) {
        ui.view = 'fight';
        show(await market.battle(ctx.state.secret, ui.lobby.battle));
      } else render();
    }
  } catch (e) {
    if (ui.view === 'lobby' && !ui.lobby) { ui.offline = e.message; render(); }
  }
  if (!box) return;
  const mine = ui.battle && ui.battle.status === 'live' && ui.battle.turn === ui.battle.side;
  timer = setTimeout(poll, ui.view === 'fight' ? (mine ? 3000 : 1200) : 2000);
}

function show(b) {
  const before = ui.battle;
  ui.battle = b;
  if (!before || before.version !== b.version || before.status !== b.status) {
    render();
    if (before && before.version !== b.version) animate(b.state.last, b.side);
  } else updateClock();
}

async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || ui.busy) return;
  const d = b.dataset;
  if ('btClose' in d) close();
  else if ('btTeam' in d) { ui.view = 'pick'; ui.picking = [...(ctx.state.battleTeam || [])]; render(); loadPickStats(); }
  else if (d.btPick) togglePick(d.btPick);
  else if ('btPickDone' in d) { ctx.state.battleTeam = ui.picking.slice(0, 3); ctx.save(); ui.view = 'lobby'; render(); }
  else if ('btPickCancel' in d) { ui.view = 'lobby'; render(); }
  else if ('btJoin' in d) run(join);
  else if ('btLeave' in d) run(async () => { await market.queueLeave(ctx.state.secret); ui.lobby.queued = false; render(); });
  else if (d.btConnect) run(() => connect(d.btConnect));
  else if (d.btAttack) run(() => attack(Number(d.btAttack)));
  else if (d.btSwitch) run(() => send('switch', Number(d.btSwitch)));
  else if ('btForfeit' in d) { if (confirm('Give up this battle?')) run(() => send('forfeit', 0)); }
  else if ('btDone' in d) { ui.view = 'lobby'; ui.battle = null; ui.lobby = null; render(); poll(); }
  else if ('btEnergy' in d) { close(); ctx.goEnergy(); }
}

async function run(job) {
  ui.busy = true;
  box.classList.add('busy');
  try { await job(); } catch (e) { ctx.toast(e.message); } finally {
    ui.busy = false;
    if (box) box.classList.remove('busy');
  }
}

async function join() {
  const team = await teamPayload();
  if (!team.length) { ctx.toast('Choose your team first.'); return; }
  const r = await market.queueJoin(ctx.state.secret, team);
  if (r.battle) { ui.view = 'fight'; show(await market.battle(ctx.state.secret, r.battle)); poll(); return; }
  ui.lobby = { ...(ui.lobby || { waiting: [] }), queued: true, tag: r.tag };
  ui.queuedAt = Date.now();
  render();
}

async function connect(id) {
  const team = await teamPayload();
  if (!team.length) { ctx.toast('Choose your team first.'); return; }
  const r = await market.connect(ctx.state.secret, id, team);
  ui.view = 'fight';
  show(await market.battle(ctx.state.secret, r.battle));
  poll();
}

async function attack(i) {
  const b = ui.battle, me = b.state.p[b.side - 1];
  const atk = me.team[me.active].attacks[i];
  const pay = payment(atk.cost);
  if (!pay) { ctx.toast('Not enough energy for this attack.'); return; }
  await send('attack', i);
  // Die Energie ist verbraucht und verschwindet aus der Sammlung.
  if (pay.length) {
    const gone = new Set(pay);
    ctx.state.cards = ctx.state.cards.filter(c => !gone.has(c.key));
    ctx.save();
    render();
  }
}

async function send(kind, index) {
  const b = await market.move(ctx.state.secret, ui.battle.id, ui.battle.version, kind, index);
  show(b);
  poll();
}

// ---------- Team-Auswahl ----------
function togglePick(key) {
  const i = ui.picking.indexOf(key);
  if (i >= 0) ui.picking.splice(i, 1);
  else if (ui.picking.length < 3) ui.picking.push(key);
  render();
}
// Lädt die Kampfwerte nach und nach, damit die Auswahl sofort erscheint.
async function loadPickStats() {
  const list = pickable();
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).filter(c => c.bt === undefined).map(statsOf));
    if (!box || ui.view !== 'pick') return;
    render();
  }
}
function pickable() {
  const seen = new Set();
  return ctx.state.cards.filter(c => {
    if (!c.verified || c.game !== 'pokemon' || ctx.isEnergy(c) || c.bt === null || c.bt === false) return false;
    const k = c.rawId || c.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Darstellung ----------
function render() {
  if (!box) return;
  const inner = box.querySelector('.bt-in');
  inner.innerHTML = ui.view === 'pick' ? pickHtml() : ui.view === 'fight' && ui.battle ? fightHtml() : lobbyHtml();
  box.dataset.view = ui.view;
}

function header(title, back = 'btClose') {
  return `<header class="bt-top"><button class="bt-icon" data-${back.replace(/[A-Z]/g, m => '-' + m.toLowerCase())} aria-label="Back">${ICON.back}</button><h1>${title}</h1><span></span></header>`;
}

function energyBar() {
  const pool = energyPool();
  return `<div class="bt-energy">${TYPES.map(t => `<span class="bt-chip">${dot(t)}<b>${pool[t].length}</b></span>`).join('')}</div>`;
}

function lobbyHtml() {
  const team = teamCards();
  const l = ui.lobby;
  const waiting = l ? l.waiting : [];
  const slots = [0, 1, 2].map(i => team[i]
    ? `<div class="bt-slot"><img src="${esc(low(team[i].image))}" alt=""><span>${esc(team[i].name)}</span></div>`
    : '<div class="bt-slot empty"><i>' + ICON.plus + '</i></div>').join('');
  const since = ui.queuedAt ? Math.floor((Date.now() - ui.queuedAt) / 1000) : 0;
  return `${header('Battle')}
    <section class="bt-sec">
      <div class="bt-head"><h2>Your team</h2><button class="bt-link" data-bt-team>${team.length ? 'Edit' : 'Choose'}</button></div>
      <button class="bt-slots" data-bt-team>${slots}</button>
    </section>
    <section class="bt-sec">
      <div class="bt-head"><h2>Energy</h2><button class="bt-link" data-bt-energy>Buy energy</button></div>
      ${energyBar()}
      <p class="bt-note">Attacks cost energy cards from your collection. Used energy is gone.</p>
    </section>
    <section class="bt-sec">
      ${l && l.queued
        ? `<div class="bt-wait"><i class="bt-pulse"></i><div><b>Waiting for an opponent</b><span>You are listed as ${esc(l.tag)} · <em data-since>${clock(since)}</em></span></div><button class="bt-btn sec" data-bt-leave>Leave</button></div>`
        : `<button class="bt-btn" data-bt-join ${team.length ? '' : 'disabled'}>Join queue</button>`}
    </section>
    <section class="bt-sec">
      <div class="bt-head"><h2>Players waiting</h2><span class="bt-count">${waiting.length}</span></div>
      ${!l ? (ui.offline ? `<p class="bt-empty">${esc(ui.offline)}</p>` : '<div class="bt-skel"></div><div class="bt-skel"></div>')
        : waiting.length ? `<div class="bt-list">${waiting.map(w => `
          <div class="bt-row">
            <div class="bt-who"><b>${esc(w.tag)}</b><span>${w.team.length} Pokémon · ${w.team.reduce((s, m) => s + m.hp, 0)} HP</span></div>
            <div class="bt-mini">${w.team.map(m => m.image ? `<img src="${esc(low(m.image))}" alt="${esc(m.name)}">` : '<i></i>').join('')}</div>
            <button class="bt-btn small" data-bt-connect="${esc(w.id)}" ${team.length ? '' : 'disabled'}>Connect</button>
          </div>`).join('')}</div>`
        : '<p class="bt-empty">Nobody is waiting right now. Join the queue and others can connect to you.</p>'}
    </section>`;
}

function pickHtml() {
  const list = pickable();
  return `${header('Choose your team', 'btPickCancel')}
    <p class="bt-note pad">Pick up to 3 Pokémon. The first one starts the battle.</p>
    ${list.length ? `<div class="bt-grid">${list.map(c => {
      const n = ui.picking.indexOf(c.key);
      const s = c.bt;
      return `<button class="bt-card ${n >= 0 ? 'on' : ''}" data-bt-pick="${esc(c.key)}">
        <img src="${esc(low(c.image))}" alt="" loading="lazy">
        ${n >= 0 ? `<em>${n + 1}</em>` : ''}
        <span class="bt-cname">${esc(c.name)}</span>
        <span class="bt-cstat">${s ? `${dot(s.type)}${s.hp} HP` : '<i class="bt-load"></i>'}</span>
      </button>`;
    }).join('')}</div>`
      : '<p class="bt-empty">You have no Pokémon yet. Open a pack first.</p>'}
    <div class="bt-foot"><button class="bt-btn" data-bt-pick-done ${ui.picking.length ? '' : 'disabled'}>Use ${ui.picking.length || ''} Pokémon</button></div>`;
}

const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function hpBar(m) {
  const p = Math.max(0, m.hp) / m.max * 100;
  return `<div class="bt-hp"><i style="width:${p}%" class="${p <= 25 ? 'low' : p <= 50 ? 'mid' : ''}"></i></div><span class="bt-hpnum">${m.hp} / ${m.max} HP</span>`;
}

function lastText(last, side, me, op) {
  if (!last) return 'The battle begins.';
  const who = last.side === side ? 'You' : op.tag;
  if (last.kind === 'attack') return `<b>${esc(last.name)}</b> used <b>${esc(last.attack)}</b>${last.damage ? ` · ${last.damage} damage` : ''}${last.weak ? ' · <span class="bt-weak">Weakness ×2</span>' : ''}${last.ko ? ` · ${esc(last.target)} is knocked out` : ''}`;
  if (last.kind === 'switch') return `${who === 'You' ? 'You sent out' : esc(who) + ' sent out'} <b>${esc(last.name)}</b>`;
  if (last.kind === 'forfeit') return last.side === side ? 'You gave up.' : `${esc(op.tag)} gave up.`;
  if (last.kind === 'timeout') return last.side === side ? 'You ran out of time.' : `${esc(op.tag)} ran out of time.`;
  return '';
}

function fightHtml() {
  const b = ui.battle, side = b.side;
  const me = b.state.p[side - 1], op = b.state.p[2 - side];
  const mine = me.team[me.active], theirs = op.team[op.active];
  const myTurn = b.status === 'live' && b.turn === side;
  if (b.status === 'done') {
    const won = b.winner === side;
    return `${header('Battle', 'btDone')}
      <div class="bt-result ${won ? 'win' : 'lose'}">
        <div class="bt-rmons">${(won ? me : op).team.map(m => m.image ? `<img src="${esc(low(m.image))}" alt="" class="${m.hp > 0 ? '' : 'ko'}">` : '').join('')}</div>
        <h2>${won ? 'You won' : 'You lost'}</h2>
        <p>${lastText(b.state.last, side, me, op)}</p>
        <p class="bt-vs">${esc(me.tag)} vs ${esc(op.tag)}</p>
        <button class="bt-btn" data-bt-done>Back to lobby</button>
      </div>`;
  }
  const pool = energyPool();
  return `<header class="bt-top"><button class="bt-icon" data-bt-close aria-label="Back">${ICON.back}</button>
      <h1>${esc(op.tag)}</h1><span class="bt-turn ${myTurn ? 'mine' : ''}">${myTurn ? 'Your turn' : 'Their turn'} · <em data-clock>${clock(b.left)}</em></span></header>
    <section class="bt-side op">
      <div class="bt-bench">${op.team.map((m, i) => `<span class="${i === op.active ? 'act' : ''} ${m.hp > 0 ? '' : 'ko'}">${m.image ? `<img src="${esc(low(m.image))}" alt="">` : ''}</span>`).join('')}</div>
      <div class="bt-active" data-mon="op">
        ${theirs.image ? `<img src="${esc(theirs.image)}" alt="">` : '<div class="bt-noimg"></div>'}
        <div class="bt-info"><span class="bt-name">${esc(theirs.name)}${dot(theirs.type)}</span>${hpBar(theirs)}${theirs.weak ? `<span class="bt-wk">Weak ${dot(theirs.weak)}</span>` : ''}</div>
      </div>
    </section>
    <p class="bt-log">${lastText(b.state.last, side, me, op)}</p>
    <section class="bt-side me">
      <div class="bt-active" data-mon="me">
        ${mine.image ? `<img src="${esc(mine.image)}" alt="">` : '<div class="bt-noimg"></div>'}
        <div class="bt-info"><span class="bt-name">${esc(mine.name)}${dot(mine.type)}</span>${hpBar(mine)}</div>
      </div>
      <div class="bt-attacks">${mine.attacks.map((a, i) => {
        const can = myTurn && payment(a.cost);
        return `<button class="bt-atk" data-bt-attack="${i}" ${can ? '' : 'disabled'}>
          <span class="bt-cost">${a.cost.length ? a.cost.map(dot).join('') : '<small>Free</small>'}</span>
          <b>${esc(a.name)}</b><span class="bt-dmg">${a.damage || '–'}</span></button>`;
      }).join('')}</div>
      <div class="bt-bench mine">${me.team.map((m, i) => i === me.active ? '' : `<button class="bt-swap ${m.hp > 0 ? '' : 'ko'}" data-bt-switch="${i}" ${myTurn && m.hp > 0 ? '' : 'disabled'}>
          ${m.image ? `<img src="${esc(low(m.image))}" alt="">` : ''}<span>${m.hp > 0 ? 'Switch' : 'KO'}</span></button>`).join('')}</div>
      <div class="bt-energy small">${TYPES.filter(t => pool[t].length).map(t => `<span class="bt-chip">${dot(t)}<b>${pool[t].length}</b></span>`).join('') || '<span class="bt-note">No energy left. <button class="bt-link" data-bt-energy>Buy energy</button></span>'}</div>
      <button class="bt-forfeit" data-bt-forfeit>Give up</button>
    </section>`;
}

function updateClock() {
  if (!box) return;
  const el = box.querySelector('[data-clock]');
  if (el && ui.battle) el.textContent = clock(ui.battle.left);
  const since = box.querySelector('[data-since]');
  if (since && ui.queuedAt) since.textContent = clock(Math.floor((Date.now() - ui.queuedAt) / 1000));
}
// Sekundenanzeige läuft zwischen den Abfragen weiter.
setInterval(() => {
  if (!box) return;
  if (ui.battle && ui.battle.status === 'live' && ui.battle.left > 0) ui.battle.left--;
  updateClock();
}, 1000);

// Kurze Bewegung beim Angriff: Angreifer stößt vor, Ziel wackelt, Schaden steigt auf.
function animate(last, side) {
  if (!last || !box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (last.kind !== 'attack') return;
  const mine = last.side === side;
  const from = box.querySelector(`[data-mon="${mine ? 'me' : 'op'}"] img`);
  const to = box.querySelector(`[data-mon="${mine ? 'op' : 'me'}"]`);
  if (from) from.animate([{ transform: 'none' }, { transform: `translateY(${mine ? -18 : 18}px) scale(1.03)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,.7,.4,1)' });
  if (!to) return;
  setTimeout(() => {
    to.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 300 });
    if (last.damage) {
      const n = document.createElement('span');
      n.className = 'bt-float' + (last.weak ? ' weak' : '');
      n.textContent = '-' + last.damage;
      to.appendChild(n);
      n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(-8px)', offset: .25 }, { opacity: 0, transform: 'translateY(-32px)' }], { duration: 900, easing: 'ease-out' }).onfinish = () => n.remove();
    }
    if (navigator.vibrate) navigator.vibrate(mine ? 12 : [18, 30, 18]);
  }, 140);
}
