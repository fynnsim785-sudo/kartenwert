// Live-Scanner: erkennt Karten direkt im Kamerabild und nimmt sie automatisch auf.
import { VISUAL_SURE, visualSearch, cardFromKey, identify, checkPhoto, loadIndex } from './scan.js';
import { GAMES, getCard } from './cards.js';
import { MATCH_SURE, readRegion, compareCard } from './match.js';
import { ICON } from './icons.js';
import { cardFlight } from './fx.js';
import { runProof, quickSteps, cameraAllowed } from './proof.js';

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const LANGS = { de: 'Deutsch', en: 'Englisch', ja: 'Japanisch' };
const rawId = c => String(c.id).replace(/^[a-z]{2}:/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thumb = c => c.image || '';

export async function openScanner({ game, hashes, hasCard, onAdd, onGallery }) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-camera');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });

  if (!cameraAllowed(stream)) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error('virtual-camera');
  }

  const el = document.createElement('div');
  el.id = 'live';
  el.innerHTML = `
    <video playsinline autoplay muted></video>
    <div class="frame"><i></i><i></i><i></i><i></i></div>
    <div class="livetop">
      <button class="liveicon" data-live="close" aria-label="Schließen">${ICON.close}</button>
      <span class="livecount" hidden></span>
      <button class="liveicon" data-live="torch" aria-label="Licht" hidden>${ICON.torch}</button>
    </div>
    <p class="hint"><span class="hinttext">Karte in den Rahmen legen</span></p>
    <div class="liveactions">
      <button class="livelink" data-live="gallery">${ICON.gallery}<span>Galerie</span></button>
      <button class="shutter" data-live="shot" aria-label="Foto machen"><span></span></button>
      <span class="livegame">${esc(GAMES[game])}</span>
    </div>
    <div class="flash"></div>
    <div class="livehit" hidden></div>`;
  document.body.appendChild(el);
  document.body.classList.add('noscroll');

  const video = el.querySelector('video');
  const frame = el.querySelector('.frame');
  const hintBox = el.querySelector('.hint');
  const hintText = el.querySelector('.hinttext');
  const hint = {
    get textContent() { return hintText.textContent; },
    set textContent(t) {
      if (hintText.textContent !== t) hintText.textContent = t;
      hintBox.hidden = !t;
    },
  };
  const panel = el.querySelector('.livehit');
  const countEl = el.querySelector('.livecount');
  video.srcObject = stream;
  await video.play().catch(() => {});

  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (caps.torch) el.querySelector('[data-live="torch"]').hidden = false;
  let torch = false;
  let paused = false, closed = false, lastKey = '', misses = 0, session = 0, sessionValue = 0, prev = null;
  let busy = false;
  if (game === 'pokemon') loadIndex();

  // Rechnet den Rahmen auf dem Bildschirm in Bildpunkte der Kamera um.
  function frameRect() {
    const v = video.getBoundingClientRect(), f = frame.getBoundingClientRect();
    const s = Math.max(v.width / video.videoWidth, v.height / video.videoHeight);
    const ox = (v.width - video.videoWidth * s) / 2, oy = (v.height - video.videoHeight * s) / 2;
    return { x: (f.left - v.left - ox) / s, y: (f.top - v.top - oy) / s, w: f.width / s, h: f.height / s };
  }

  const probe = document.createElement('canvas');
  probe.width = 40; probe.height = 56;
  const px = probe.getContext('2d', { willReadFrequently: true });

  function looks(r) {
    px.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, 40, 56);
    const d = px.getImageData(0, 0, 40, 56).data;
    const g = new Float32Array(2240);
    let sum = 0, sq = 0, moved = 0;
    for (let i = 0; i < 2240; i++) {
      g[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
      sum += g[i]; sq += g[i] * g[i];
      if (prev) moved += Math.abs(g[i] - prev[i]);
    }
    const variance = sq / 2240 - (sum / 2240) ** 2;
    const motion = prev ? moved / 2240 : 99;
    prev = g;
    return { variance, motion };
  }

  function snap() {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    return new Promise(res => c.toBlob(res, 'image/jpeg', .92));
  }
  function crop() {
    const r = frameRect();
    const c = document.createElement('canvas');
    c.width = Math.round(r.w); c.height = Math.round(r.h);
    c.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', .94));
  }

  function lockFx() {
    frame.classList.add('locked');
    const f = el.querySelector('.flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    if (navigator.vibrate) navigator.vibrate(25);
  }

  function resume(text) {
    panel.hidden = true;
    panel.classList.remove('in');
    frame.classList.remove('locked');
    hint.textContent = text || 'Nächste Karte in den Rahmen legen';
    lastKey = ''; misses = 0; prev = null; paused = false;
  }

  function showHit(cards, blob) {
    const top = cards[0];
    hint.textContent = '';
    panel.innerHTML = `
      <div class="hitcard"><img src="${esc(thumb(top))}" alt=""></div>
      <div class="hitinfo">
        <h3>${esc(top.name)}</h3>
        <span class="muted small">${esc(top.set)}${top.number ? ' · #' + esc(top.number) : ''}</span>
        <b class="hitprice">${top.price ? money.format(top.price) : 'Kein Preis'}</b>
        ${hasCard(top) ? '<button class="btn" data-live="skip">Hast du schon · Weiter</button>' : '<button class="btn" data-live="add">Hinzufügen</button>'}
        ${hasCard(top) ? '' : '<button class="livelink dark" data-live="skip">Falsche Karte</button>'}
      </div>
      ${top.game === 'pokemon' ? `<div class="langs">${Object.entries(LANGS).map(([l, name]) => `<button data-live="lang" data-lang="${l}" class="${String(top.id).startsWith(l + ':') ? 'on' : ''}">${name}</button>`).join('')}</div>` : ''}
      ${cards.length > 1 ? `<div class="hitothers">${cards.slice(1).map((c, i) => `<button data-live="swap" data-i="${i + 1}"><img src="${esc(thumb(c))}" alt="${esc(c.set)}"></button>`).join('')}</div>` : ''}`;
    panel.hidden = false;
    panel.classList.remove('in'); void panel.offsetWidth; panel.classList.add('in');
    panel._cards = cards;
    panel._blob = blob;
    if (thumb(top)) cardFlight(frame.getBoundingClientRect(), panel.querySelector('.hitcard img'), thumb(top));
  }

  async function lock(key, hits) {
    paused = true;
    lockFx();
    hint.textContent = 'Erkannt';
    const region = readRegion(video, frameRect());
    const blob = await snap();
    // Der Fingerabdruck schlägt nur vor. Gezeigt wird, was dem Originalbild wirklich gleicht.
    const near = hits.filter(h => h.d <= hits[0].d + 14).slice(0, 20);
    const seenKey = new Set();
    const keys = near.filter(h => { const k = h.key.replace(/^[a-z]{2}:/, ''); return !seenKey.has(k) && seenKey.add(k); }).slice(0, 10);
    const cards = (await Promise.all(keys.map(h => cardFromKey(h.key)))).filter(Boolean);
    const scored = await Promise.all(cards.map(async c => ({ c, m: await compareCard(region, c.image) })));
    if (closed) return;
    // Dasselbe Motiv gibt es oft in mehreren Sprachen: Bei fast gleichem Wert gewinnt Deutsch, dann Englisch.
    const rankOf = s => s.m.blocks + s.m.whole * .2 + ({ de: .08, en: .04 }[String(s.c.id).split(':')[0]] || 0);
    const good = scored.filter(s => s.m && s.m.blocks >= MATCH_SURE).sort((a, b) => rankOf(b) - rankOf(a));
    if (!good.length) { resume('Karte wird gesucht …'); return; }
    showHit(good.map(s => s.c), blob);
  }

  async function tick() {
    if (paused || closed || busy || !video.videoWidth) return;
    busy = true;
    try {
      const r = frameRect();
      const { variance, motion } = looks(r);
      if (variance < 90) { hint.textContent = 'Karte in den Rahmen legen'; lastKey = ''; return; }
      if (motion > 9) { hint.textContent = 'Halte die Karte still'; lastKey = ''; return; }
      if (game !== 'pokemon') { hint.textContent = 'Halte still und tippe auf den Auslöser'; return; }
      hint.textContent = 'Karte wird erkannt …';
      const hits = await visualSearch(video, r.x, r.y, r.w, r.h, 8);
      if (paused || closed) return;
      const best = hits[0];
      if (best && best.d <= VISUAL_SURE) {
        if (best.key === lastKey) { await lock(best.key, hits); return; }
        lastKey = best.key;
      } else {
        lastKey = '';
        if (++misses > 7) hint.textContent = 'Nicht erkannt? Tippe auf den Auslöser';
      }
    } finally { busy = false; }
  }
  const timer = setInterval(tick, 400);

  function close() {
    closed = true;
    clearInterval(timer);
    stream.getTracks().forEach(t => t.stop());
    document.body.classList.remove('noscroll');
    el.remove();
  }

  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-live]');
    if (!b) return;
    const what = b.dataset.live;
    if (what === 'close') close();
    if (what === 'gallery') { close(); onGallery(); }
    if (what === 'torch') {
      torch = !torch;
      track.applyConstraints({ advanced: [{ torch }] }).catch(() => {});
      b.classList.toggle('on', torch);
    }
    if (what === 'skip') resume();
    if (what === 'lang') {
      // Dieselbe Karte in einer anderen Sprache: Bild und Preis kommen aus dem Katalog.
      const cards = panel._cards;
      const other = await getCard('pokemon', b.dataset.lang + ':' + rawId(cards[0])).catch(() => null);
      if (closed) return;
      if (!other) { b.textContent = 'Gibt es nicht'; b.disabled = true; return; }
      showHit([other, ...cards.slice(1)], panel._blob);
    }
    if (what === 'swap') {
      const cards = panel._cards, i = Number(b.dataset.i);
      showHit([cards[i], ...cards.filter((_, k) => k !== i)], panel._blob);
    }
    if (what === 'shot' && !paused) {
      paused = true;
      lockFx();
      hint.textContent = 'Karte wird gelesen …';
      const [blob, cut] = await Promise.all([snap(), crop()]);
      try {
        const { cards } = await identify(cut, game, t => { hint.textContent = t; });
        if (closed) return;
        if (cards.length) showHit(cards, blob);
        else resume('Nicht erkannt. Näher ran und von vorne fotografieren.');
      } catch { resume('Das hat nicht geklappt. Versuche es noch einmal.'); }
    }
    if (what === 'add') {
      const card = panel._cards[0];
      if (hasCard(card)) { resume('Du hast diese Karte schon.'); return; }
      b.disabled = true;
      const res = await checkPhoto(panel._blob, 'kamera', card, hashes);
      if (closed) return;
      if (res.level === 'block') { resume(res.reasons[0] || 'Foto abgelehnt.'); return; }
      // Erst die Probe beweist, dass die echte Karte vor der Kamera liegt.
      const proof = await runProof({ card, steps: quickSteps(), stream });
      if (closed) return;
      // Das Fenster bleibt offen: So ist der Grund zu lesen und ein neuer Versuch geht sofort.
      if (!proof.ok) {
        b.disabled = false;
        b.textContent = 'Nochmal versuchen';
        if (proof.reason) {
          const note = panel.querySelector('.hitnote') || panel.querySelector('.hitinfo').appendChild(Object.assign(document.createElement('p'), { className: 'hitnote' }));
          note.textContent = proof.reason;
        }
        return;
      }
      const from = panel.querySelector('.hitcard img');
      onAdd(card, res.hash, from);
      session++; sessionValue += card.price || 0;
      countEl.hidden = false;
      countEl.textContent = `${session} ${session === 1 ? 'Karte' : 'Karten'} · +${money.format(sessionValue)}`;
      countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
      resume();
    }
  });
  return { close };
}
