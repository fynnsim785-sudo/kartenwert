// Echte Karten mit echten Preisen für die Entdecken-Bereiche. Wird einen Tag lang gespeichert.
import { searchCards, getSets } from './cards.js';

const STORE = 'kartenwert.feed.v2';
const DAY = 24 * 3600 * 1000;
export const TOPICS = [
  { game: 'pokemon', q: 'Charizard', title: 'Charizard' },
  { game: 'pokemon', q: 'Pikachu', title: 'Pikachu' },
  { game: 'pokemon', q: 'Mewtwo', title: 'Mewtwo' },
  { game: 'pokemon', q: 'Eevee', title: 'Eevee' },
  { game: 'pokemon', q: 'Gengar', title: 'Gengar' },
  { game: 'magic', q: 'Sol Ring', title: 'Magic: Sol Ring' },
  { game: 'yugioh', q: 'Blue-Eyes White Dragon', title: 'Yu-Gi-Oh!: Blue-Eyes' },
];

let memory = null;
function read() {
  if (memory) return memory;
  try { memory = JSON.parse(localStorage.getItem(STORE)); } catch { /* neu laden */ }
  return memory;
}
function write(feed) {
  memory = feed;
  try { localStorage.setItem(STORE, JSON.stringify(feed)); } catch { /* bleibt im Speicher */ }
}

const slim = c => ({ game: c.game, id: c.id, name: c.name, set: c.set, number: c.number, image: c.image, price: c.price, hist: c.hist, setId: c.setId, rawId: c.rawId, dexId: c.dexId, rarity: c.rarity });

// Liefert sofort, was da ist, und meldet neue Themen über onUpdate.
export function loadFeed(onUpdate) {
  const cached = read();
  if (cached && Date.now() - cached.at < DAY && cached.topics.length === TOPICS.length) return cached;
  const feed = { at: Date.now(), topics: [], sets: (cached && cached.sets) || [] };
  memory = feed;
  (async () => {
    getSets('en').then(sets => {
      feed.sets = sets.filter(s => s.logo).slice(0, 10);
      write(feed);
      onUpdate();
    }).catch(() => {});
    for (const t of TOPICS) {
      const cards = await searchCards(t.game, t.q, '', 10).catch(() => []);
      const list = cards.filter(c => c.image && c.price).sort((a, b) => b.price - a.price).slice(0, 8).map(slim);
      feed.topics.push({ title: t.title, game: t.game, q: t.q, cards: list });
      write(feed);
      onUpdate();
    }
  })();
  return feed;
}

export function topCards(feed, limit = 8) {
  const all = feed.topics.flatMap(t => t.cards);
  const seen = new Set();
  return all.filter(c => !seen.has(c.id) && seen.add(c.id)).sort((a, b) => b.price - a.price).slice(0, limit);
}

export function findFeedCard(feed, id) {
  for (const t of feed.topics) {
    const c = t.cards.find(x => x.id === id);
    if (c) return c;
  }
  return null;
}
