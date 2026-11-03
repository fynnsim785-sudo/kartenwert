// Marktplatz: Punkte und Angebote liegen geschützt auf dem Server.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Der Server meldet Fehler auf Deutsch. Die App ist englisch, deshalb wird hier übersetzt.
const MESSAGES = {
  'Ungültiges Gerät': 'Invalid device.',
  'Gerät unbekannt': 'Unknown device.',
  'Diese Karte kann nicht eingetragen werden.': 'This card cannot be registered.',
  'Für heute sind genug Pack-Karten eingetragen.': 'Enough pack cards registered for today.',
  'Neue Geräte können erst nach einer Stunde anbieten.': 'New devices can only list cards after one hour.',
  'Neue Geräte können erst nach einer Stunde bieten.': 'New devices can only bid after one hour.',
  'Erworbene Karten kannst du erst nach 24 Stunden wieder anbieten.': 'Cards you acquired can be listed again after 24 hours.',
  'Die Prüfung ist abgelaufen. Prüfe die Karte noch einmal.': 'The check has expired.',
  'Diese Karte ist schon im Angebot.': 'This card is already listed.',
  'Du kannst höchstens 20 Karten gleichzeitig anbieten.': 'You can list at most 20 cards at once.',
  'Das Angebot enthält ungültige Angaben.': 'The offer contains invalid data.',
  'Diese Karte ist nicht geprüft.': 'This card cannot be sold. Only cards from packs can be auctioned.',
  'Diese Karte ist nicht mehr im Angebot.': 'This card is no longer listed.',
  'Du kannst deine eigene Karte nicht kaufen.': 'You cannot buy your own card.',
  'Du hast diese Karte schon.': 'You already have this card.',
  'Du hast nicht genug Guthaben.': 'You do not have enough balance.',
  'Dieses Angebot lässt sich nicht zurückziehen.': 'This offer cannot be withdrawn.',
  'Diese Laufzeit gibt es nicht.': 'This duration does not exist.',
  'Gib einen Startpreis von 0,01 € bis 100.000 € ein.': 'Enter a starting price from €0.01 to €100,000.',
  'Du kannst höchstens 3 Auktionen gleichzeitig laufen lassen.': 'You can run at most 3 auctions at once.',
  'Du kannst höchstens 5 Auktionen am Tag starten.': 'You can start at most 5 auctions per day.',
  'Diese Auktion ist vorbei.': 'This auction has ended.',
  'Du kannst nicht auf deine eigene Karte bieten.': 'You cannot bid on your own card.',
  'Zu viele Gebote. Warte einen Moment.': 'Too many bids. Please wait a moment.',
  'Du bietest schon auf diese Karte.': 'You are already bidding on this card.',
  'Dein Gebot ist zu niedrig.': 'Your bid is too low.',
  'Du kannst höchstens 3 Auktionen am Tag zurückziehen.': 'You can withdraw at most 3 auctions per day.',
  'Mit Geboten lässt sich die Auktion nicht mehr zurückziehen.': 'An auction with bids cannot be withdrawn.',
};
const english = msg => MESSAGES[msg] || (msg && !/[äöüß]|\b(der|die|das|ist|nicht)\b/i.test(msg) ? msg : 'Something went wrong. Please try again.');

async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data && data.message ? english(data.message) : 'The marketplace is not responding.');
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

// Liefert null, solange die Tabellen auf dem Server noch fehlen.
export async function join(secret) {
  try {
    return await rpc('kw_join', { p_secret: secret });
  } catch (e) {
    if (e.status === 404 || e.code === 'PGRST202') return null;
    throw e;
  }
}

export const listings = secret => rpc('kw_listings_open', { p_secret: secret });
export const buy = (secret, id) => rpc('kw_buy', { p_secret: secret, p_listing: id });
export const cancel = (secret, id) => rpc('kw_cancel', { p_secret: secret, p_listing: id });
export const sell = (secret, card, price) => rpc('kw_sell', { p_secret: secret, p_game: card.game, p_card_id: card.id, p_price: price });

// Echtheitsprobe
export const proofStart = (secret, card) => rpc('kw_proof_start', {
  p_secret: secret, p_game: card.game, p_card_id: card.id, p_name: card.name, p_set: card.set || '',
  p_number: card.number || '', p_image: card.image || '',
});
export const proofFinish = (secret, nonce, frames) => rpc('kw_proof_finish', { p_secret: secret, p_nonce: nonce, p_frames: frames });

// Auktionen
export const auctions = secret => rpc('kw_auctions_open', { p_secret: secret });
// Meldet eine Karte aus einem Pack an den Server, damit sie später versteigert werden kann. Ungeprüft.
export const packClaim = (secret, card) => rpc('kw_pack_claim', {
  p_secret: secret, p_game: card.game, p_card_id: card.id, p_name: card.name, p_set: card.set || '', p_number: card.number || '', p_image: card.image || '',
});
export const auctionCreate =(secret, card, start, hours) => rpc('kw_auction_create', { p_secret: secret, p_game: card.game, p_card_id: card.id, p_start: start, p_hours: hours });
export const bid = (secret, id, amount, ledger) => rpc('kw_bid', { p_secret: secret, p_auction: id, p_amount: amount, p_ledger: ledger });
export const auctionCancel = (secret, id) => rpc('kw_auction_cancel', { p_secret: secret, p_auction: id });
export const results = secret => rpc('kw_results_open', { p_secret: secret });
export const resultsDone = (secret, ids) => rpc('kw_results_done', { p_secret: secret, p_ids: ids });
