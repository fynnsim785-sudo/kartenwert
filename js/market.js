// Marktplatz: Punkte und Angebote liegen geschützt auf dem Server.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

async function rpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.message) || 'Der Marktplatz antwortet nicht.');
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
export const auctionCreate = (secret, card, start, hours) => rpc('kw_auction_create', { p_secret: secret, p_game: card.game, p_card_id: card.id, p_start: start, p_hours: hours });
export const bid = (secret, id, amount, ledger) => rpc('kw_bid', { p_secret: secret, p_auction: id, p_amount: amount, p_ledger: ledger });
export const auctionCancel = (secret, id) => rpc('kw_auction_cancel', { p_secret: secret, p_auction: id });
export const results = secret => rpc('kw_results_open', { p_secret: secret });
export const resultsDone = (secret, ids) => rpc('kw_results_done', { p_secret: secret, p_ids: ids });
