// Bild-Fingerabdruck einer Karte. Der Index und der Scanner nutzen genau denselben Code.
const COS = (() => {
  const t = new Float64Array(32 * 8);
  for (let x = 0; x < 32; x++) for (let u = 0; u < 8; u++) t[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 64);
  return t;
})();

function grayPixels(source, sx, sy, sw, sh, W, H) {
  let cur = source, cx = sx, cy = sy, cw = sw, ch = sh;
  while (cw > W * 2 || ch > H * 2) {
    const nw = Math.max(W, Math.ceil(cw / 2)), nh = Math.max(H, Math.ceil(ch / 2));
    const step = document.createElement('canvas');
    step.width = nw; step.height = nh;
    const c = step.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
    cur = step; cx = 0; cy = 0; cw = nw; ch = nh;
  }
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const c = out.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingQuality = 'high';
  c.drawImage(cur, cx, cy, cw, ch, 0, 0, W, H);
  const d = c.getImageData(0, 0, W, H).data;
  const g = new Float64Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  return g;
}

// Wahrnehmungs-Fingerabdruck: bleibt bei Licht und leichter Unschärfe weitgehend gleich.
function pHash(g) {
  const co = new Float64Array(64);
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let s = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += g[y * 32 + x] * COS[x * 8 + u] * COS[y * 8 + v];
    co[v * 8 + u] = s;
  }
  co[0] = 0;
  const sorted = [...co].sort((a, b) => a - b);
  const mid = sorted[32];
  const bits = new Uint32Array(2);
  for (let i = 0; i < 64; i++) if (co[i] > mid) bits[i >> 5] |= 1 << (i & 31);
  return bits;
}

function dHashBits(g) {
  const bits = new Uint32Array(2);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (g[y * 9 + x] > g[y * 9 + x + 1]) { const i = y * 8 + x; bits[i >> 5] |= 1 << (i & 31); }
  }
  return bits;
}

// Vier 32-Bit-Zahlen: zwei für das Kartenbild (Art), zwei für die ganze Karte.
export function fingerprint(source, sx, sy, sw, sh) {
  const art = pHash(grayPixels(source, sx + sw * .08, sy + sh * .1, sw * .84, sh * .42, 32, 32));
  const whole = dHashBits(grayPixels(source, sx, sy, sw, sh, 9, 8));
  return Uint32Array.of(art[0], art[1], whole[0], whole[1]);
}

const pop = n => {
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

// Sucht die ähnlichsten Karten im Index. Kleiner Abstand heißt: sieht gleich aus.
export function nearest(index, queries, limit = 40) {
  const n = index.length >> 2;
  const dist = new Uint16Array(n).fill(9999);
  for (const q of queries) {
    for (let i = 0; i < n; i++) {
      const p = i << 2;
      const art = pop(index[p] ^ q[0]) + pop(index[p + 1] ^ q[1]);
      const whole = pop(index[p + 2] ^ q[2]) + pop(index[p + 3] ^ q[3]);
      const score = art * 2 + whole;
      if (score < dist[i]) dist[i] = score;
    }
  }
  const order = [];
  for (let i = 0; i < n; i++) if (dist[i] < 90) order.push(i);
  order.sort((a, b) => dist[a] - dist[b]);
  return order.slice(0, limit).map(i => ({ i, d: dist[i] }));
}
