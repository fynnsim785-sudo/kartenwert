// Kartendaten und Preise aus frei nutzbaren Quellen, ganz ohne Key.
export const GAMES = { pokemon: 'Pokémon', magic: 'Magic', yugioh: 'Yu-Gi-Oh!' };

export function today(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error('Card service is not responding (' + res.status + ')');
  return res.json();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- Pokémon (TCGdex, Cardmarket-Preise in Euro) ----------
// Sucht einen Marktpreis in den TCGplayer-Daten, die je nach Karte verschieden aufgebaut sind.
function dollarPrice(node) {
  if (!node || typeof node !== 'object') return null;
  const direct = num(node.marketPrice) ?? num(node.midPrice);
  if (direct != null) return direct;
  for (const v of Object.values(node)) {
    const found = dollarPrice(v);
    if (found != null) return found;
  }
  return null;
}

function pokemonPrice(card) {
  const list = (card.variants_detailed || []).map(v => v.pricing && v.pricing.cardmarket);
  if (card.pricing && card.pricing.cardmarket) list.push(card.pricing.cardmarket);
  const fallback = () => {
    const usd = dollarPrice((card.variants_detailed || []).map(v => v.pricing && v.pricing.tcgplayer))
      ?? dollarPrice(card.pricing && card.pricing.tcgplayer);
    return { price: usd != null ? usd * 0.9 : 0, hist: {} };
  };
  const pick = (m, f) => num(m[f]) ?? num(m[f + '-holo']);
  for (const m of list) {
    if (!m) continue;
    const price = pick(m, 'trend') ?? pick(m, 'avg');
    if (price == null) continue;
    const hist = {};
    const a30 = pick(m, 'avg30'), a7 = pick(m, 'avg7'), a1 = pick(m, 'avg1');
    if (a30 != null) hist[today(-30)] = a30;
    if (a7 != null) hist[today(-7)] = a7;
    if (a1 != null) hist[today(-1)] = a1;
    return { price, hist };
  }
  return fallback();
}

let extraPromise = null;
const extraImages = () => (extraPromise = extraPromise || fetch('index/extra-images.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));

async function pokemonDetail(lang, id) {
  const c = await getJson(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`);
  if (!c) return null;
  const { price, hist } = pokemonPrice(c);
  // Viele deutsche Karten haben kein eigenes Bild, dann hilft das englische.
  if (!c.image && lang !== 'en') {
    const en = await getJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`).catch(() => null);
    if (en && en.image) c.image = en.image;
  }
  // Hat TCGdex gar kein Bild, kommt es aus der zweiten Quelle (pokemontcg.io), soweit dort vorhanden.
  const extra = c.image ? '' : (await extraImages())[c.id] || '';
  return {
    game: 'pokemon', id: lang + ':' + c.id, name: c.name, number: String(c.localId || ''),
    set: (c.set && c.set.name) || '', image: c.image ? c.image + '/high.webp' : extra, price, hist,
    setId: (c.set && c.set.id) || '', rawId: c.id, dexId: c.dexId || [], rarity: c.rarity || '',
  };
}

// Pokémon-Sets mit Logo, die neuesten zuerst. Fehlende Logos kommen aus der englischen Liste.
export async function getSets(lang) {
  const [list, en] = await Promise.all([
    getJson(`https://api.tcgdex.net/v2/${lang}/sets`),
    lang === 'en' ? null : getJson('https://api.tcgdex.net/v2/en/sets').catch(() => null),
  ]);
  const logos = new Map((en || []).map(s => [s.id, s.logo]));
  return (list || [])
    .filter(s => !/^(A\d|B\d|P-A)/i.test(s.id)) // Sets der reinen Handy-App, ohne echte Karten
    .map(s => ({
      id: s.id, name: s.name, logo: s.logo || logos.get(s.id) || '',
      total: (s.cardCount && (s.cardCount.official || s.cardCount.total)) || 0,
    }))
    .reverse();
}

export async function getSet(lang, id) {
  const s = await getJson(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(id)}`);
  if (!s) return null;
  return {
    id: s.id, name: s.name,
    cards: (s.cards || []).map(c => ({ id: c.id, number: String(c.localId || ''), name: c.name, image: c.image ? c.image + '/low.webp' : '' })),
  };
}

const isJapanese = s => /[぀-ヿ一-鿿]/.test(s);

async function pokemonSearch(q) {
  // Namen unterscheiden sich je Sprache, deshalb in allen passenden Sprachen suchen.
  const langs = isJapanese(q) ? ['ja'] : ['en', 'de'];
  const lists = await Promise.all(langs.map(lang =>
    getJson(`https://api.tcgdex.net/v2/${lang}/cards?name=like:${encodeURIComponent(q)}&pagination:itemsPerPage=80`)
      .then(list => (list || []).map(c => ({ lang, id: c.id, number: String(c.localId || ''), hasImage: !!c.image })))
      .catch(() => [])));
  const seen = new Set();
  // Karten mit Bild zuerst, damit man die richtige leichter erkennt.
  return lists.flat().filter(h => !seen.has(h.id) && seen.add(h.id)).sort((a, b) => b.hasImage - a.hasImage);
}

// Findet eine Karte über ihre Nummer wie 58/165, auch wenn der Name nicht lesbar ist.
const rawSets = {};
export async function findByNumber(number, total) {
  const bare = s => String(s).replace(/^0+/, '');
  const found = [];
  await Promise.all(['de', 'en', 'ja'].map(async lang => {
    rawSets[lang] = rawSets[lang] || await getJson(`https://api.tcgdex.net/v2/${lang}/sets`).catch(() => null) || [];
    const sets = rawSets[lang].filter(s => s.cardCount && bare(s.cardCount.official) === bare(total)).slice(0, 4);
    await Promise.all(sets.map(async s => {
      const full = await getJson(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(s.id)}`).catch(() => null);
      const hit = full && (full.cards || []).find(c => bare(c.localId) === bare(number));
      if (hit) {
        const card = await pokemonDetail(lang, hit.id).catch(() => null);
        if (card) found.push(card);
      }
    }));
  }));
  return found;
}

// Größte Fassung eines Kartenbilds. Ältere gespeicherte Karten werden so ebenfalls scharf.
export function hq(url) {
  return (url || '')
    .replace('/low.webp', '/high.webp')
    .replace(/cards\.scryfall\.io\/(small|normal)\//, 'cards.scryfall.io/large/')
    .replace('/images/cards_small/', '/images/cards/');
}

// ---------- Magic (Scryfall) ----------
function magicCard(c) {
  const img = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {};
  const p = c.prices || {};
  const usd = num(p.usd) ?? num(p.usd_foil);
  const price = num(p.eur) ?? num(p.eur_foil) ?? (usd != null ? usd * 0.9 : 0);
  return {
    game: 'magic', id: c.id, name: c.printed_name || c.name, number: String(c.collector_number || ''),
    set: c.set_name || '', image: img.large || img.normal || img.small || '', price, hist: {},
  };
}

// ---------- Yu-Gi-Oh! (YGOPRODeck) ----------
function yugiohCard(c) {
  const img = (c.card_images && c.card_images[0]) || {};
  const prices = (c.card_prices && c.card_prices[0]) || {};
  const set = (c.card_sets && c.card_sets[0]) || {};
  return {
    game: 'yugioh', id: String(c.id), name: c.name, number: set.set_code || '',
    set: set.set_name || '', image: img.image_url || img.image_url_small || '', price: num(prices.cardmarket_price) ?? 0, hist: {},
  };
}

// Sucht Karten. number filtert z. B. nach 136 aus "136/189", wenn vorhanden.
export async function searchCards(game, q, number = '', limit = 9) {
  q = q.trim();
  if (q.length < 2) return [];
  if (game === 'pokemon') {
    let hits = await pokemonSearch(q);
    const bare = s => s.replace(/^0+/, '');
    if (number) {
      const exact = hits.filter(h => bare(h.number) === bare(number));
      if (exact.length) hits = exact;
    }
    const cards = await Promise.all(hits.slice(0, limit).map(h => pokemonDetail(h.lang, h.id).catch(() => null)));
    return cards.filter(Boolean);
  }
  if (game === 'magic') {
    let r = await getJson(`https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(q)}`);
    if (!r) r = await getJson(`https://api.scryfall.com/cards/search?unique=prints&q=${encodeURIComponent(q + ' lang:any')}`);
    if (!r) return [];
    let cards = r.data.map(magicCard);
    if (number) {
      const exact = cards.filter(c => c.number.replace(/^0+/, '') === number.replace(/^0+/, ''));
      if (exact.length) cards = exact;
    }
    return cards.slice(0, limit);
  }
  let r = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${limit}&offset=0&fname=${encodeURIComponent(q)}`);
  if (!r) r = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${limit}&offset=0&language=de&fname=${encodeURIComponent(q)}`);
  return r ? r.data.map(yugiohCard) : [];
}

// Holt den aktuellen Stand einer einzelnen Karte.
export async function getCard(game, id) {
  if (game === 'pokemon') {
    const [lang, ...rest] = id.split(':');
    return pokemonDetail(lang, rest.join(':'));
  }
  if (game === 'magic') {
    const c = await getJson(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
    return c ? magicCard(c) : null;
  }
  const r = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(id)}`);
  return r && r.data[0] ? yugiohCard(r.data[0]) : null;
}
