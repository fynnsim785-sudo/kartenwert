// Packs: Auswahl der Karten und die Öffnungs-Animation.
import { getSet, getCard } from './cards.js';
import { burst } from './fx.js';
import { playPackGL } from './packgl.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pack = (tier, lang, set, name, price, c1, c2, logo) => ({
  id: set, tier, lang, set, name, price, count: lang === 'ja' ? 5 : 10, colors: [c1, c2],
  logo: logo ? `https://assets.tcgdex.net/${lang}/${logo}/${set}/logo.png` : '',
});
export const PACKS = [
  pack('normal', 'en', 'sv08', 'Surging Sparks', 5, '#f4b41a', '#b5341c', 'sv'),
  pack('normal', 'en', 'sv08.5', 'Prismatic Evolutions', 8, '#e05fd0', '#3a2a8a', 'sv'),
  pack('normal', 'en', 'sv03.5', '151', 7, '#e8423a', '#1f4fa8', 'sv'),
  pack('normal', 'en', 'me01', 'Mega Evolution', 5, '#3fa0d8', '#16305a', 'me'),
  pack('normal', 'en', 'sv10', 'Destined Rivals', 5, '#d43a3a', '#2a1a40', 'sv'),
  pack('normal', 'en', 'sv09', 'Journey Together', 5, '#3fbf8a', '#16405a', 'sv'),
  pack('normal', 'en', 'sv07', 'Stellar Crown', 5, '#2b6fd6', '#17245f', 'sv'),
  pack('normal', 'en', 'sv06.5', 'Shrouded Fable', 6, '#6a3fa8', '#1a1030', 'sv'),
  pack('normal', 'en', 'sv06', 'Twilight Masquerade', 5, '#2e9e6b', '#123f4a', 'sv'),
  pack('normal', 'en', 'sv05', 'Temporal Forces', 5, '#2fb8c8', '#3a1f5a'),
  pack('normal', 'en', 'sv04.5', 'Paldean Fates', 7, '#e8b93a', '#2a1a4a', 'sv'),
  pack('normal', 'en', 'sv04', 'Paradox Rift', 5, '#8a3fd1', '#2a1650', 'sv'),
  pack('normal', 'en', 'sv03', 'Obsidian Flames', 5, '#e2521d', '#2a1412', 'sv'),
  pack('normal', 'en', 'sv02', 'Paldea Evolved', 5, '#3a8ee8', '#173a2a', 'sv'),
  pack('normal', 'en', 'sv01', 'Scarlet & Violet', 5, '#d43a2a', '#4a1a6a'),
  pack('normal', 'en', 'swsh12.5', 'Crown Zenith', 7, '#e8c35a', '#1a2a5a', 'swsh'),
  pack('normal', 'en', 'swsh11', 'Lost Origin', 5, '#5a3fa8', '#0f1a2a', 'swsh'),
  pack('normal', 'en', 'swsh9', 'Brilliant Stars', 6, '#e8a53a', '#3a1a0a', 'swsh'),
  pack('normal', 'en', 'swsh7', 'Evolving Skies', 8, '#3aa8e8', '#0f2a4a', 'swsh'),
  pack('ja', 'ja', 'SV7a', 'Paradise Dragona', 5, '#19a7a0', '#0f3e5c'),
  pack('ja', 'ja', 'SV6a', 'Night Wanderer', 6, '#3a3a6a', '#0f0f20'),
  pack('ja', 'ja', 'SV5a', 'Crimson Haze', 6, '#d42b4a', '#3d0f2a'),
  pack('ja', 'ja', 'SV9', 'Battle Partners', 6, '#e8723a', '#2a1a4a'),
  pack('ja', 'ja', 'SV4a', 'Raging Surf', 8, '#2f86d8', '#10305e'),
  pack('ja', 'ja', 'SV10', 'Glory of Team Rocket', 8, '#3a3a44', '#a3271e'),
  pack('ja', 'ja', 'SV2a', 'Pokémon Card 151', 10, '#e8423a', '#1f4fa8'),
  pack('ja', 'ja', 'SV8a', 'Terastal Festival', 10, '#c04fd8', '#2d6fd0'),
  pack('old', 'en', 'ecard1', 'Expedition', 50, '#c9772e', '#3f2413'),
  pack('old', 'en', 'base4', 'Base Set 2', 60, '#3f7fbf', '#1b2f52', 'base'),
  pack('old', 'en', 'gym1', 'Gym Heroes', 80, '#c8352e', '#3a1412', 'gym'),
  pack('old', 'en', 'base2', 'Jungle', 90, '#4f9a3a', '#16361a', 'base'),
  pack('old', 'en', 'base3', 'Fossil', 100, '#8d8778', '#2c2a25', 'base'),
  pack('old', 'en', 'gym2', 'Gym Challenge', 110, '#d4452a', '#2a0f0a', 'gym'),
  pack('old', 'en', 'neo2', 'Neo Discovery', 120, '#3a9ad8', '#0f2a40', 'neo'),
  pack('old', 'en', 'base5', 'Team Rocket', 130, '#3a3a44', '#0c0c10', 'base'),
  pack('old', 'en', 'neo3', 'Neo Revelation', 140, '#d8b23a', '#3a2a0a', 'neo'),
  pack('old', 'en', 'neo1', 'Neo Genesis', 160, '#d9b23c', '#5a3f10', 'neo'),
  pack('old', 'en', 'base1', 'Base Set', 200, '#e3b93a', '#a3271e', 'base'),
];
// Motiv jedes Packs: das Bild einer bekannten Karte aus genau diesem Set.
const ART = {
  sv08: 'en/sv/sv08/057', 'sv08.5': 'en/sv/sv08.5/028', 'sv03.5': 'en/sv/sv03.5/006', me01: 'en/me/me01/003', sv10: 'en/sv/sv10/039',
  sv09: 'en/sv/sv09/030', sv07: 'en/sv/sv07/030', 'sv06.5': 'en/sv/sv06.5/039', sv06: 'en/sv/sv06/135', sv05: 'en/sv/sv05/051',
  'sv04.5': 'en/sv/sv04.5/018', sv04: 'en/sv/sv04/058', sv03: 'en/sv/sv03/125', sv02: 'en/sv/sv02/063', sv01: 'en/sv/sv01/045',
  'swsh12.5': 'en/swsh/swsh12.5/018', swsh11: 'en/swsh/swsh11/052', swsh9: 'en/swsh/swsh9/017', swsh7: 'en/swsh/swsh7/28',
  SV7a: 'ja/SV/SV7a/011', SV6a: 'ja/SV/SV6a/032', SV5a: 'ja/SV/SV5a/052', SV9: 'ja/SV/SV9/045', SV4a: 'ja/SV/SV4a/115',
  SV10: 'ja/SV/SV10/039', SV2a: 'ja/SV/SV2a/006', SV8a: 'ja/SV/SV8a/093',
  ecard1: 'en/ecard/ecard1/6', base4: 'en/base/base4/4', gym1: 'en/gym/gym1/1', base2: 'en/base/base2/11', base3: 'en/base/base3/4',
  gym2: 'en/gym/gym2/2', neo2: 'en/neo/neo2/1', base5: 'en/base/base5/4', neo3: 'en/neo/neo3/20', neo1: 'en/neo/neo1/9', base1: 'en/base/base1/4',
};
for (const p of PACKS) p.art = `https://assets.tcgdex.net/${ART[p.id]}`;
export const packById = id => PACKS.find(p => p.id === id);

const shuffle = list => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
};

// Wert eines Packs im Verhältnis zum Preis, im Schnitt etwa 78 %.
// Karten lassen sich zum Marktpreis zurückverkaufen: Läge der Schnitt über 100 %, wäre das eine Gelddruckmaschine.
function luck() {
  const r = Math.random();
  if (r < .03) return 1.5 + Math.random();
  if (r < .25) return .9 + Math.random() * .3;
  return .45 + Math.random() * .4;
}

// Nimmt die billigsten Karten und tauscht sie gegen wertvollere, solange der Wert des Packs es erlaubt.
function choose(cards, count, budget) {
  const asc = [...cards].sort((a, b) => (a.price || 0) - (b.price || 0));
  const chosen = asc.slice(0, count);
  let sum = chosen.reduce((s, c) => s + (c.price || 0), 0);
  for (const c of asc.slice(count).reverse()) {
    const low = chosen[0];
    if (sum - (low.price || 0) + (c.price || 0) > budget) continue;
    sum += (c.price || 0) - (low.price || 0);
    chosen[0] = c;
    chosen.sort((a, b) => (a.price || 0) - (b.price || 0));
  }
  return chosen;
}

async function inBatches(list, size, job) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(...await Promise.all(list.slice(i, i + size).map(job)));
  return out;
}

// Stellt den Inhalt zusammen, bevor Geld abgebucht wird. Karten, die man schon hat, kommen nicht vor.
export async function rollPack(def, isOwned) {
  const set = await getSet(def.lang, def.set).catch(() => null);
  if (!set) throw new Error('The pack cannot be loaded right now.');
  const pool = shuffle(set.cards.filter(c => c.image && !isOwned({ game: 'pokemon', id: `${def.lang}:${c.id}` })));
  if (pool.length < def.count) throw new Error('You already own almost every card in this pack.');
  const details = await inBatches(pool.slice(0, def.count * 3 + 6), 8, c => getCard('pokemon', `${def.lang}:${c.id}`).catch(() => null));
  const cards = details.filter(c => c && c.image);
  if (cards.length < def.count) throw new Error('The pack cannot be loaded right now.');
  const chosen = choose(cards, def.count, def.price * luck());
  await Promise.all(chosen.map(c => new Promise(done => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = img.onerror = done;
    img.src = c.image;
    setTimeout(done, 6000);
  })));
  return chosen;
}

// Wie ein echter Booster: Motiv über die ganze Folie, unten nur der Name des Packs.
// Lange Namen kommen auf zwei Zeilen, damit die Schrift groß bleibt.
export function nameLines(name) {
  const words = name.split(' ');
  if (name.length <= 9 || words.length < 2) return [name];
  let best = [name], worst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const w = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (w < worst) { worst = w; best = [words.slice(0, i).join(' '), words.slice(i).join(' ')]; }
  }
  return best;
}

export function packFace(def) {
  const lines = nameLines(def.name);
  const size = Math.min(17, 128 / Math.max(...lines.map(l => l.length), 5)); // in Prozent der Packbreite
  return `<div class="pk-face" style="--p1:${def.colors[0]};--p2:${def.colors[1]}">
    <i class="pk-blur" style="background-image:url('${esc(def.art)}/low.webp')"></i>
    <i class="pk-stripe a"></i><i class="pk-stripe b"></i>
    <i class="pk-pic" style="background-image:url('${esc(def.art)}/high.webp')"></i>
    <i class="pk-veil"></i>
    <i class="pk-crimp top"></i><i class="pk-crimp bot"></i><i class="pk-fold"></i>
    <div class="pk-art">
      <i class="pk-band"></i>
      ${def.logo ? `<img src="${esc(def.logo)}" alt="${esc(def.name)}">` : `<b class="pk-jp" style="font-size:${size.toFixed(1)}cqw">${lines.map(esc).join('<br>')}</b>`}
    </div>
    <i class="pk-sheen"></i>
  </div>`;
}

// Gezackte Kanten wie bei einer echten Folie. Die Risslinie teilt das Pack in Streifen und Körper.
const TEAR_Y = 13;
function zigzag(y, amp, teeth, seed) {
  const pts = [];
  for (let i = 0; i <= teeth; i++) {
    const wobble = seed ? ((Math.sin(i * seed) + 1) / 2) * amp : (i % 2 ? amp : 0);
    pts.push([i / teeth * 100, y + wobble]);
  }
  return pts;
}
const poly = pts => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
const topEdge = zigzag(0, 1.3, 26), botEdge = zigzag(98.7, 1.3, 26), tearLine = zigzag(TEAR_Y, 1.6, 22, 2.7);
export const PACK_CLIP = poly([...topEdge, ...[...botEdge].reverse()]);
const CLIP_TOP = poly([...topEdge, ...[...tearLine].reverse()]);
const CLIP_BODY = poly([...tearLine, ...[...botEdge].reverse()]);

const wait = ms => new Promise(r => setTimeout(r, calm() ? 0 : ms));
// Spielt eine Bewegung ab und lässt das Element danach im Endzustand stehen.
function move(el, frames, opts) {
  const last = frames[frames.length - 1];
  const run = el.animate(frames, { fill: 'both', ...opts, duration: calm() ? 1 : opts.duration });
  return run.finished.catch(() => {}).then(() => {
    if (!el.isConnected) return;
    if (last.transform) el.style.transform = last.transform;
    if (last.opacity != null) el.style.opacity = last.opacity;
    run.cancel();
  });
}

// Zeigt die 3D-Fassung, sonst die einfache.
export async function playPack(args) {
  const hit = c => (c.price || 0) >= Math.max(1, args.paid * .15);
  const summary = (box, finish, tick) => showSummary(box, args, finish, tick);
  const shown = await playPackGL({ ...args, isHit: hit, summary }).catch(e => { console.warn(e); return false; });
  if (!shown) playSimple(args);
}

// Alles im Überblick, gemeinsam für beide Fassungen. Die beste Karte steht groß oben.
function showSummary(box, { def, cards, paid, canAgain, onAgain }, finish, tick) {
  const value = cards.reduce((s, c) => s + (c.price || 0), 0);
  const diff = value - paid;
  const best = [...cards].sort((a, b) => (b.price || 0) - (a.price || 0));
  const isGood = c => (c.price || 0) >= Math.max(1, paid * .15);
  const end = document.createElement('div');
  end.className = 'pk-sum';
  end.innerHTML = `<div class="pk-sumin">
    <p class="pk-sumtitle">${esc(def.name)}</p>
    <button class="pk-hero ${isGood(best[0]) ? 'good' : ''}" data-pk="zoom" aria-label="View card"><img src="${esc(best[0].image)}" alt=""></button>
    <div class="pk-heroinfo"><b class="pk-name">${esc(best[0].name)}</b><span class="pk-sub">${esc(best[0].rarity || best[0].set || '')}</span><b class="pk-price ${isGood(best[0]) ? 'hit' : ''}">${best[0].price ? money.format(best[0].price) : 'No price'}</b></div>
    <div class="pk-totals">
      <span>Value<b data-count>${money.format(0)}</b></span>
      <span>Paid<b>${money.format(paid)}</b></span>
      <span>Result<b class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${money.format(Math.abs(diff))}</b></span>
    </div>
    <div class="pk-grid n${cards.length}">${best.map((c, i) => `<button class="pk-thumb ${isGood(c) ? 'good' : ''} ${i ? '' : 'on'}" data-pk-card="${i}"><img src="${esc(c.image)}" alt="${esc(c.name)}"><span>${c.price ? money.format(c.price) : '–'}</span></button>`).join('')}</div>
    <div class="pk-actions">
      <button class="pk-again" data-pk="again" ${canAgain() ? '' : 'disabled'}>${canAgain() ? `Another pack · ${money.format(paid)}` : 'Not enough balance'}</button>
      <button class="pk-done" data-pk="close">Done</button>
    </div>
    <p class="pk-sub pk-saved">The cards are now in your collection.</p>
  </div>`;
  box.appendChild(end);
  const hero = end.querySelector('.pk-hero');
  const heroInfo = end.querySelector('.pk-heroinfo');
  const zoomed = () => {
    if (calm()) return;
    hero.animate([{ transform: 'rotateY(-70deg) scale(.86)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,1.25,.4,1)' });
  };
  // Hauptkarte kommt zuerst, dann werden die anderen ausgeteilt.
  if (!calm()) hero.animate([{ transform: 'translateY(-30px) rotateY(-90deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'backwards' });
  end.querySelectorAll('.pk-thumb').forEach((t, i) => {
    const delay = calm() ? 0 : 220 + i * 62;
    t.animate([{ transform: 'translateY(46px) rotateY(80deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: calm() ? 1 : 380, delay, easing: 'cubic-bezier(.2,1.25,.4,1)', fill: 'backwards' });
    if (tick && !calm()) setTimeout(() => { if (end.isConnected) tick(); }, delay);
  });
  // Wert zählt hoch
  const counter = end.querySelector('[data-count]');
  const t0 = performance.now(), span = calm() ? 1 : 900;
  const run = now => {
    if (!counter.isConnected) return;
    const k = Math.min(1, (now - t0) / span);
    counter.textContent = money.format(value * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
  end.addEventListener('click', e => {
    const pick = e.target.closest('[data-pk-card]');
    if (pick) {
      const c = best[Number(pick.dataset.pkCard)];
      end.querySelectorAll('.pk-thumb').forEach(t => t.classList.toggle('on', t === pick));
      hero.classList.toggle('good', isGood(c));
      hero.querySelector('img').src = c.image;
      heroInfo.innerHTML = `<b class="pk-name">${esc(c.name)}</b><span class="pk-sub">${esc(c.rarity || c.set || '')}</span><b class="pk-price ${isGood(c) ? 'hit' : ''}">${c.price ? money.format(c.price) : 'No price'}</b>`;
      if (tick) tick();
      zoomed();
      return;
    }
    const b = e.target.closest('[data-pk]');
    if (!b || b.dataset.pk === 'zoom') return;
    finish();
    if (b.dataset.pk === 'again') onAgain();
  });
}

function playSimple({ def, cards, paid, canAgain, onAgain, onClose }) {
  const box = document.createElement('div');
  box.id = 'packopen';
  box.innerHTML = `
    <div class="pk-rays" hidden></div>
    <button class="pk-skip" hidden>Skip</button>
    <div class="pk-center">
      <div class="pk-back" style="clip-path:${CLIP_BODY}"></div>
      <div class="pk-beam"></div>
      <div class="pk-stack">${cards.map((c, i) => `<div class="pk-card" style="z-index:${cards.length - i}"><img src="${esc(c.image)}" alt="" draggable="false"></div>`).join('')}</div>
      <div class="pk-front" style="clip-path:${CLIP_BODY}">${packFace(def)}</div>
      <div class="pk-top" style="clip-path:${CLIP_TOP}">${packFace(def)}</div>
      <i class="pk-tearhint"></i>
    </div>
    <p class="pk-hint">Swipe across the top of the pack to tear it open</p>
    <div class="pk-info" hidden></div>`;
  document.body.appendChild(box);
  document.body.classList.add('noscroll');

  const center = box.querySelector('.pk-center');
  const stack = box.querySelector('.pk-stack');
  const front = box.querySelector('.pk-front');
  const back = box.querySelector('.pk-back');
  const beam = box.querySelector('.pk-beam');
  const top = box.querySelector('.pk-top');
  const hint = box.querySelector('.pk-hint');
  const info = box.querySelector('.pk-info');
  const rays = box.querySelector('.pk-rays');
  const skip = box.querySelector('.pk-skip');
  const tearHint = box.querySelector('.pk-tearhint');
  const cardEls = [...stack.children];
  cardEls.forEach((el, i) => { el.style.transform = `translateY(${Math.min(i, 5) * 1.5}px) rotate(${i % 2 ? .5 : -.5}deg)`; });

  function finish() {
    box.remove();
    document.body.classList.remove('noscroll');
    onClose();
  }

  // Schritt 1: Das Pack kommt rein und lässt sich neigen.
  const shine = e => {
    const r = center.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    center.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
    center.style.setProperty('--ry', `${(x * 20).toFixed(2)}deg`);
    box.style.setProperty('--sx', `${50 + x * 90}%`);
  };

  // Schritt 2: Aufreißen. Der Streifen folgt dem Finger, bis er abreißt.
  function waitForTear() {
    return new Promise(resolve => {
      let start = null, dir = 1, moved = false, done = false;
      const setTear = t => {
        top.style.transformOrigin = dir > 0 ? '100% 13%' : '0% 13%';
        top.style.transform = `rotate(${(-dir * t * 13).toFixed(2)}deg) translateY(${(-t * 8).toFixed(1)}px)`;
        beam.style.opacity = (t * .55).toFixed(2);
      };
      const complete = () => {
        if (done) return;
        done = true;
        box.removeEventListener('pointerdown', down);
        box.removeEventListener('pointermove', over);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
        resolve(dir);
      };
      const over = e => {
        if (start == null) { shine(e); return; }
        const dx = e.clientX - start;
        if (Math.abs(dx) > 6) moved = true;
        if (!moved) return;
        dir = dx >= 0 ? 1 : -1;
        const t = Math.min(1, Math.abs(dx) / (center.offsetWidth * .62));
        setTear(t);
        if (t >= 1) complete();
      };
      const down = e => { start = e.clientX; moved = false; };
      const up = async () => {
        if (start == null) return;
        start = null;
        // Antippen reißt das Pack ebenfalls auf, für alle, die nicht wischen wollen.
        const steps = calm() ? 1 : 10;
        for (let i = 1; i <= steps; i++) { setTear(i / steps); await wait(26); }
        complete();
      };
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointermove', over);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
  }

  // Schritt 3: Karten kommen heraus, das leere Pack fällt weg.
  async function openUp(dir) {
    center.classList.remove('idle');
    hint.hidden = true;
    tearHint.remove();
    if (navigator.vibrate) navigator.vibrate([18, 30, 12]);
    const from = top.style.transform;
    move(top, [
      { transform: from, opacity: 1 },
      { transform: `translate(${dir * 90}px,-70px) rotate(${-dir * 38}deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${dir * 210}px,70vh) rotate(${dir * 190}deg)`, opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.3,.1,.6,1)' });
    center.style.transform = 'none';
    await move(center, [
      { transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(-5px,3px) rotate(-1.4deg)' },
      { transform: 'translate(5px,-2px) rotate(1.2deg)' }, { transform: 'translate(-2px,1px) rotate(-.5deg)' },
      { transform: 'translate(0,0) rotate(0)' },
    ], { duration: 300, easing: 'linear' });
    beam.style.opacity = '.55';
    await wait(140);

    const packH = center.offsetHeight, cardH = stack.offsetHeight;
    const homeTop = stack.offsetTop;
    // Stoßweise herausziehen, wie mit der Hand.
    await move(stack, [{ transform: 'translateY(0)' }, { transform: `translateY(${-packH * .13}px)` }], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
    await wait(120);
    await move(stack, [{ transform: `translateY(${-packH * .13}px)` }, { transform: `translateY(${-packH * .36}px)` }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
    await wait(180);

    move(beam, [{ opacity: .55 }, { opacity: 0 }], { duration: 280 });
    const fall = [{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: `translateY(${packH * 1.25}px) rotate(7deg)`, opacity: 0 }];
    move(front, fall, { duration: 620, easing: 'cubic-bezier(.5,0,.9,.6)' });
    move(back, fall, { duration: 620, easing: 'cubic-bezier(.5,0,.9,.6)' });
    // Zur Mitte des Bildschirms und ein Stück größer.
    const middle = packH / 2 - (homeTop + cardH / 2) - 34;
    await move(stack, [{ transform: `translateY(${-packH * .36}px) scale(1)` }, { transform: `translateY(${middle}px) scale(1.14)` }], { duration: 640, easing: 'cubic-bezier(.3,1.25,.5,1)' });
    front.remove(); back.remove(); beam.remove(); top.remove();
  }

  const isHit = c => (c.price || 0) >= Math.max(1, paid * .15);

  // Schritt 4: Karte für Karte aufdecken, die wertvollste kommt zuletzt.
  function deal() {
    return new Promise(resolve => {
      let i = 0, busy = false, startX = null;
      const show = () => {
        const c = cards[i], hit = isHit(c);
        info.hidden = false;
        info.innerHTML = `<b class="pk-name">${esc(c.name)}</b>
          <span class="pk-sub">${[c.rarity, c.set].filter(Boolean).map(esc).join(' · ')}</span>
          <b class="pk-price ${hit ? 'hit' : ''}">${c.price ? money.format(c.price) : 'No price'}</b>
          <span class="pk-sub">${i + 1} of ${cards.length} · Tap to continue</span>`;
        rays.hidden = !hit;
        if (hit) {
          const r = stack.getBoundingClientRect();
          burst(r.left + r.width / 2, r.top + r.height / 2, ['#ffd85c', '#fff3c4', '#ffb300', '#ffffff']);
          move(cardEls[i], [
            { transform: 'scale(.92)' }, { transform: 'scale(1.08) rotate(-1deg)', offset: .5 }, { transform: 'scale(1)' },
          ], { duration: 520, easing: 'cubic-bezier(.2,1.4,.4,1)' });
          if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
        }
      };
      const next = async dir => {
        if (busy) return;
        busy = true;
        const el = cardEls[i];
        rays.hidden = true;
        const gone = move(el, [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dir * 118}vw,-34px) rotate(${dir * 26}deg)`, opacity: 1 },
        ], { duration: 300, easing: 'cubic-bezier(.4,0,.7,.4)' });
        i++;
        if (i >= cards.length) {
          await gone;
          box.removeEventListener('pointerdown', down);
          box.removeEventListener('pointerup', up);
          resolve();
          return;
        }
        cardEls.slice(i).forEach((c, k) => { c.style.transform = `translateY(${Math.min(k, 5) * 1.5}px) rotate(${(i + k) % 2 ? .5 : -.5}deg)`; });
        show();
        await gone;
        el.remove();
        busy = false;
      };
      const down = e => { startX = e.clientX; };
      const up = e => {
        if (startX == null || e.target.closest('.pk-skip')) return;
        const dx = e.clientX - startX;
        startX = null;
        next(dx < -24 ? -1 : 1);
      };
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointerup', up);
      show();
      skip.onclick = () => {
        box.removeEventListener('pointerdown', down);
        box.removeEventListener('pointerup', up);
        resolve();
      };
    });
  }

  // Schritt 5: Alles im Überblick.
  function summary() {
    center.remove(); rays.remove(); info.remove(); skip.remove(); hint.remove();
    showSummary(box, { def, cards, paid, canAgain, onAgain }, finish);
  }

  (async () => {
    await move(center, [
      { transform: 'translateY(70vh) rotate(-10deg) scale(.7)', opacity: 0 },
      { transform: 'translateY(-14px) rotate(2deg) scale(1.03)', opacity: 1, offset: .72 },
      { transform: 'translateY(0) rotate(0) scale(1)', opacity: 1 },
    ], { duration: 720, easing: 'cubic-bezier(.2,.8,.3,1)' });
    center.style.transform = '';
    center.classList.add('idle');
    const dir = await waitForTear();
    await openUp(dir);
    skip.hidden = false;
    await deal();
    summary();
  })();
}
