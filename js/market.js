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
export const sell = (secret, card, price, photoHash) => rpc('kw_sell', {
  p_secret: secret, p_game: card.game, p_card_id: card.id, p_name: card.name, p_set: card.set || '',
  p_number: card.number || '', p_image: card.image || '', p_price: price, p_photo_hash: photoHash || null,
});
