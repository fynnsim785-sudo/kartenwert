// Foto-Scanner (Texterkennung läuft auf dem Gerät) und Foto-Prüfung.
import { searchCards, findByNumber, getCard } from './cards.js';
import { fingerprint, nearest } from './fingerprint.js';

export const VISUAL_SURE = 46; // Abstand im Bild-Index, bis zu dem ein Treffer als sicher gilt (Nicht-Karten liegen ab etwa 51)

let indexPromise = null;
export function loadIndex() {
  indexPromise = indexPromise || Promise.all([
    fetch('index/pokemon.bin').then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }),
    fetch('index/pokemon.txt').then(r => { if (!r.ok) throw new Error(); return r.text(); }),
  ]).then(([bin, text]) => ({ hashes: new Uint32Array(bin), ids: text.split('\n') }))
    .catch(() => { indexPromise = null; return null; });
  return indexPromise;
}

// Sucht die Karte nur anhand ihres Aussehens, unabhängig von Sprache und Text.
export async function visualSearch(source, x, y, w, h, limit = 10) {
  const idx = await loadIndex();
  if (!idx) return [];
  const queries = [[0, 0, 1], [0, 0, .95], [.02, 0, .96], [-.02, 0, .96], [0, .02, .96], [0, -.02, .96]].map(([dx, dy, s]) => {
    const sw = w * s, sh = h * s;
    return fingerprint(source, x + (w - sw) / 2 + w * dx, y + (h - sh) / 2 + h * dy, sw, sh);
  });
  return nearest(idx.hashes, queries, limit).map(r => ({ key: idx.ids[r.i], d: r.d }));
}

// Lädt die Karte zu einem Index-Treffer, wenn möglich auf Deutsch.
export async function cardFromKey(key) {
  const [lang, ...rest] = key.split(':');
  const id = rest.join(':');
  if (lang === 'en') {
    const de = await getCard('pokemon', 'de:' + id).catch(() => null);
    if (de) return de;
  }
  return getCard('pokemon', key).catch(() => null);
}

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const SURE_DISTANCE = 21; // bis hierhin gilt ein Treffer als sicher erkannt
const AI_MARKERS = ['c2pa', 'midjourney', 'dall-e', 'dall·e', 'stable diffusion', 'stablediffusion', 'firefly',
  'openai', 'chatgpt', 'gemini', 'imagen', 'novelai', 'trainedalgorithmicmedia', 'comfyui'];
const STOP = new Set(['basis', 'phase', 'stage', 'basic', 'entwicklung', 'evolves', 'from', 'pokemon', 'pokémon',
  'trainer', 'energie', 'energy', 'kp', 'hp', 'schwäche', 'resistenz', 'rückzug', 'illus', 'weakness', 'resistance', 'retreat']);
const JP_STOP = /たね|進化|ポケモン|トレーナー|にげる|弱点|抵抗力/g;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Die Texterkennung konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild nicht ladbar'));
    img.src = url;
  });
}

// Fingerabdruck eines Bilds: 64 Bit aus Helligkeitsunterschieden.
function dHash(source, w, h) {
  // In Stufen verkleinern, sonst ändert schon JPEG-Rauschen den Fingerabdruck.
  let cur = source, cw = w, ch = h;
  while (cw > 18 || ch > 16) {
    const nw = Math.max(9, Math.ceil(cw / 2)), nh = Math.max(8, Math.ceil(ch / 2));
    const step = document.createElement('canvas');
    step.width = nw; step.height = nh;
    const sx = step.getContext('2d');
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = step; cw = nw; ch = nh;
  }
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, cw, ch, 0, 0, 9, 8);
  const d = x.getImageData(0, 0, 9, 8).data;
  let out = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const a = (row * 9 + col) * 4, b = a + 4;
      const la = d[a] * .3 + d[a + 1] * .59 + d[a + 2] * .11;
      const lb = d[b] * .3 + d[b + 1] * .59 + d[b + 2] * .11;
      out += la > lb ? '1' : '0';
    }
  }
  return out;
}

export function distance(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

export async function hashBlob(blob) {
  const bmp = await createImageBitmap(blob);
  const h = dHash(bmp, bmp.width, bmp.height);
  bmp.close();
  return h;
}

export const hashCanvas = c => dHash(c, c.width, c.height);

export async function hashUrl(url) {
  try {
    const img = await loadImage(url);
    return dHash(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return null; // Quelle erlaubt keinen Vergleich (z. B. Yu-Gi-Oh!-Bilder)
  }
}

// Schneidet die Karte aus dem Foto, indem sie sich vom einfarbigen Hintergrund abhebt.
export function cropCard(source, w, h) {
  const S = 220 / Math.max(w, h);
  const sw = Math.round(w * S), sh = Math.round(h * S);
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sx = small.getContext('2d', { willReadFrequently: true });
  sx.drawImage(source, 0, 0, sw, sh);
  const d = sx.getImageData(0, 0, sw, sh).data;
  const at = (x, y) => (y * sw + x) * 4;
  const edge = [];
  for (let x = 0; x < sw; x++) edge.push(at(x, 0), at(x, sh - 1));
  for (let y = 0; y < sh; y++) edge.push(at(0, y), at(sw - 1, y));
  const bg = [0, 1, 2].map(k => edge.map(i => d[i + k]).sort((a, b) => a - b)[edge.length >> 1]);
  const on = (x, y) => {
    const i = at(x, y);
    return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 70;
  };
  const rows = Array(sh).fill(0), cols = Array(sw).fill(0);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (on(x, y)) { rows[y]++; cols[x]++; }
  const span = (arr, need) => {
    const hit = arr.map((n, i) => (n >= need ? i : -1)).filter(i => i >= 0);
    return hit.length ? [hit[0], hit[hit.length - 1]] : null;
  };
  const r = span(rows, sw * .22), c = span(cols, sh * .22);
  const out = document.createElement('canvas');
  let box = { x: 0, y: 0, w, h };
  if (r && c) {
    const bw = (c[1] - c[0] + 1) / S, bh = (r[1] - r[0] + 1) / S;
    if (bw * bh > w * h * .15 && bw * bh < w * h * .97) box = { x: c[0] / S, y: r[0] / S, w: bw, h: bh };
  }
  const scale = Math.min(1, 1400 / Math.max(box.w, box.h));
  out.width = Math.round(box.w * scale);
  out.height = Math.round(box.h * scale);
  const ox = out.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out;
}

// Sucht im Dateikopf nach KI-Spuren.
async function findAiMarker(blob) {
  const buf = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  let text = '';
  for (let i = 0; i < buf.length; i++) text += String.fromCharCode(buf[i]);
  const lower = text.toLowerCase();
  return AI_MARKERS.find(m => lower.includes(m)) || null;
}

// Ergebnis: ok = zählt, warn = aus der Galerie und zählt nicht, block = abgelehnt.
// Nur ein direkt in der App aufgenommenes Foto kann zeigen, dass die Karte wirklich vor der Kamera liegt.
export async function checkPhoto(blob, source, card, knownHashes = []) {
  const reasons = [];
  let level = source === 'kamera' ? 'ok' : 'warn';
  const bmp = await createImageBitmap(blob);
  const hash = dHash(bmp, bmp.width, bmp.height);
  bmp.close();

  const ai = await findAiMarker(blob);
  if (ai) { level = 'block'; reasons.push('Das Bild wurde mit KI erstellt.'); }
  if (card && card.image) {
    const official = await hashUrl(card.image);
    // Echte Fotos haben immer etwas Hintergrund und liegen damit weit vom offiziellen Bild entfernt.
    if (official != null && distance(hash, official) <= 8) {
      level = 'block';
      reasons.push('Das ist das Kartenbild aus dem Internet.');
    }
  }
  if (knownHashes.some(k => distance(hash, k) <= 2)) {
    level = 'block';
    reasons.push('Dieses Foto wurde schon benutzt.');
  }
  return { level, reasons, hash };
}

// Bereitet die Texte aus der Erkennung zu Suchbegriffen auf.
export function parseText(text) {
  // Der Schrägstrich wird oft als | oder 7 gelesen, z. B. 1367189 statt 136/189.
  const m = text.match(/\b(\d{1,3})\s*[/|\\]\s*(\d{1,3})\b/) || text.match(/\b(\d{1,3})7(\d{3})\b/);
  const number = m ? m[1] : '';
  const total = m ? m[2] : '';
  const queries = [];
  const add = q => { if (q.length >= 4 && !queries.includes(q)) queries.push(q); };
  for (const line of text.split('\n').slice(0, 12)) {
    const words = line.replace(/[^\p{L}' -]/gu, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w.toLowerCase()) && /^\p{Lu}\p{Ll}/u.test(w));
    if (!words.length) continue;
    if (words.length > 1 && words.length <= 4) add(words.join(' '));
    add(words.reduce((a, b) => (b.length > a.length ? b : a)));
  }
  return { number, total, queries: queries.slice(0, 4) };
}

function parseJapanese(text) {
  const runs = text.replace(JP_STOP, ' ').match(/[぀-ヿ一-鿿]{2,}/g) || [];
  return [...new Set(runs)].sort((a, b) => b.length - a.length).slice(0, 3);
}

async function rank(cards, hashes) {
  const seen = new Set();
  const unique = cards.filter(c => !seen.has(c.id) && seen.add(c.id));
  const scored = await Promise.all(unique.map(async c => {
    const h = c.image ? await hashUrl(c.image) : null;
    return { c, d: h ? Math.min(...hashes.map(x => distance(x, h))) : 64 };
  }));
  return scored.sort((a, b) => a.d - b.d);
}

function band(crop, top, height) {
  const c = document.createElement('canvas');
  c.width = crop.width * 2;
  c.height = Math.round(crop.height * height) * 2;
  c.getContext('2d').drawImage(crop, 0, crop.height * top, crop.width, crop.height * height, 0, 0, c.width, c.height);
  return c;
}

// Erkennt die Karte auf einem Foto. sure sagt, ob das Kartenbild wirklich zum Foto passt.
export async function identify(blob, game, onStep = () => {}) {
  // Zuerst über das Aussehen suchen, das dauert nur einen Moment.
  let visual = [];
  if (game === 'pokemon') {
    onStep('Karte wird erkannt …');
    const pic = await createImageBitmap(blob);
    const a = cropCard(pic, pic.width, pic.height);
    const b = cropCard(a, a.width, a.height);
    const cardLikeCut = [b, a].find(c => c.width / c.height > .62 && c.width / c.height < .8);
    const hits = await visualSearch(cardLikeCut || pic, 0, 0, cardLikeCut ? cardLikeCut.width : pic.width, cardLikeCut ? cardLikeCut.height : pic.height);
    pic.close();
    visual = hits;
    if (hits.length && hits[0].d <= VISUAL_SURE) {
      const near = hits.filter(h => h.d <= hits[0].d + 10).slice(0, 8);
      const cards = (await Promise.all(near.map(h => cardFromKey(h.key)))).filter(Boolean);
      const seen = new Set();
      const unique = cards.filter(c => !seen.has(c.id) && seen.add(c.id));
      if (unique.length) return { cards: unique, sure: true, best: hits[0].d, text: '' };
    }
  }
  if (!window.Tesseract) {
    onStep('Wird vorbereitet …');
    await loadScript(TESSERACT);
  }
  onStep('Karte wird gelesen …');
  const bmp = await createImageBitmap(blob);
  // Zweimal schneiden, falls um die Karte mehrere Hintergrundfarben liegen.
  const first = cropCard(bmp, bmp.width, bmp.height);
  const second = cropCard(first, first.width, first.height);
  const whole = document.createElement('canvas');
  whole.width = bmp.width;
  whole.height = bmp.height;
  whole.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  // Nur ein Ausschnitt im Kartenformat kann wirklich die Karte sein.
  const cardLike = c => c.width / c.height > .62 && c.width / c.height < .8;
  const cut = [second, first, whole].find(cardLike) || whole;
  const hashes = [whole, first, second].filter(c => c === whole || cardLike(c)).map(c => dHash(c, c.width, c.height));
  // Kleine Fotos vergrößern, damit die Schrift lesbar wird.
  const zoom = Math.min(4, Math.max(1, 1200 / cut.width));
  const crop = document.createElement('canvas');
  crop.width = Math.round(cut.width * zoom);
  crop.height = Math.round(cut.height * zoom);
  const zx = crop.getContext('2d');
  zx.imageSmoothingQuality = 'high';
  zx.drawImage(cut, 0, 0, crop.width, crop.height);

  const { data } = await window.Tesseract.recognize(crop, 'deu+eng');
  let found = (await Promise.all(visual.slice(0, 6).map(h => cardFromKey(h.key)))).filter(Boolean);
  const bottom = await window.Tesseract.recognize(band(crop, .88, .12), 'eng');
  const parsed = parseText(data.text || '');
  const num = parseText(bottom.data.text || '').number ? parseText(bottom.data.text || '') : parsed;

  onStep('Karte wird gesucht …');
  if (game === 'pokemon' && num.number && num.total) {
    found = found.concat(await findByNumber(num.number, num.total).catch(() => []));
  }
  for (const q of parsed.queries) {
    const cards = await searchCards(game, q, num.number).catch(() => []);
    found = found.concat(cards);
    if (cards.length) break;
  }
  let scored = await rank(found, hashes);

  // Passt nichts, ist die Karte oft japanisch.
  if (game === 'pokemon' && (!scored.length || scored[0].d > SURE_DISTANCE)) {
    onStep('Japanische Schrift wird geprüft …');
    const jp = await window.Tesseract.recognize(band(crop, 0, .14), 'jpn');
    for (const q of parseJapanese(jp.data.text || '')) {
      const cards = await searchCards(game, q, num.number, 20).catch(() => []);
      found = found.concat(cards);
      if (cards.length) break;
    }
    scored = await rank(found, hashes);
  }
  const sure = scored.length > 0 && scored[0].d <= SURE_DISTANCE;
  return { cards: scored.slice(0, 12).map(s => s.c), sure, best: scored.length ? scored[0].d : null, text: data.text || '' };
}
