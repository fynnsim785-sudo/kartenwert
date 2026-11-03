// Findet die Karte im Kamerabild und zieht sie gerade.
// Schräg gehaltene, gedrehte oder nicht mittig liegende Karten werden so wie ein flacher Scan verglichen.

// Graustufen eines Bildausschnitts in kleiner Auflösung.
function grayOf(source, r, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  // leicht weichzeichnen, damit Rauschen und Muster keine Kanten vortäuschen
  const b = new Float32Array(g.length);
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const i = y * W + xx;
    b[i] = (g[i] * 4 + g[i - 1] + g[i + 1] + g[i - W] + g[i + W]) / 8;
  }
  return b;
}

// Passt eine Gerade durch Kantenpunkte. Ausreißer (Finger, Muster im Hintergrund) fallen heraus.
function fitLine(pts) {
  if (pts.length < 8) return null;
  let best = null, bestIn = [];
  for (let k = 0; k < 70; k++) {
    const p = pts[Math.floor(Math.random() * pts.length)], q = pts[Math.floor(Math.random() * pts.length)];
    if (p === q || Math.abs(q.t - p.t) < 4) continue;
    const a = (q.s - p.s) / (q.t - p.t), b = p.s - a * p.t;
    const inl = pts.filter(o => Math.abs(o.s - (a * o.t + b)) < 2.2);
    if (inl.length > bestIn.length) { bestIn = inl; best = { a, b }; }
  }
  if (!best || bestIn.length < Math.max(8, pts.length * .42)) return null;
  // Feinabgleich mit allen passenden Punkten
  let st = 0, ss = 0, stt = 0, sts = 0;
  for (const o of bestIn) { st += o.t; ss += o.s; stt += o.t * o.t; sts += o.t * o.s; }
  const n = bestIn.length, den = n * stt - st * st;
  if (Math.abs(den) < 1e-6) return best;
  const a = (n * sts - st * ss) / den;
  return { a, b: (ss - a * st) / n, support: n / pts.length };
}

// Liefert die vier Ecken (oben links, oben rechts, unten rechts, unten links) in Bildpunkten der Quelle, oder null.
export function findCard(source, frame) {
  const SW = source.videoWidth || source.width, SH = source.videoHeight || source.height;
  const pad = .24;
  const r = {
    x: Math.max(0, frame.x - frame.w * pad), y: Math.max(0, frame.y - frame.h * pad),
  };
  r.w = Math.min(SW, frame.x + frame.w * (1 + pad)) - r.x;
  r.h = Math.min(SH, frame.y + frame.h * (1 + pad)) - r.y;
  if (r.w < 40 || r.h < 40) return null;
  const H = 240, W = Math.round(H * r.w / r.h);
  const g = grayOf(source, r, W, H);
  const gx = (x, y) => g[y * W + x + 1] - g[y * W + x - 1];
  const gy = (x, y) => g[(y + 1) * W + x] - g[(y - 1) * W + x];

  // Strahlen von außen nach innen: die erste deutliche Kante ist der Kartenrand.
  const RAYS = 26;
  function scan(side) {
    const pts = [];
    const vertical = side === 'left' || side === 'right';
    const len = vertical ? W : H, across = vertical ? H : W;
    for (let k = 0; k < RAYS; k++) {
      const t = Math.round(across * (.2 + .6 * k / (RAYS - 1)));
      const vals = [];
      let top = 0;
      for (let s = 2; s < len * .48; s++) {
        const pos = side === 'left' || side === 'top' ? s : len - 1 - s;
        const x = vertical ? pos : t, y = vertical ? t : pos;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) { vals.push(0); continue; }
        const along = vertical ? Math.abs(gx(x, y)) : Math.abs(gy(x, y));
        const cross = vertical ? Math.abs(gy(x, y)) : Math.abs(gx(x, y));
        const v = along > cross * .8 ? along : 0;
        vals.push(v);
        if (v > top) top = v;
      }
      if (top < 16) continue;
      const i = vals.findIndex(v => v >= top * .55);
      if (i < 0) continue;
      const s = i + 2;
      pts.push({ t, s: side === 'left' || side === 'top' ? s : len - 1 - s });
    }
    return fitLine(pts);
  }
  const left = scan('left'), right = scan('right'), top = scan('top'), bottom = scan('bottom');
  if (!left || !right || !top || !bottom) return null;
  // Senkrechte Kanten: x = a·y + b, waagerechte: y = a·x + b
  const meet = (v, h) => {
    const den = 1 - v.a * h.a;
    if (Math.abs(den) < 1e-6) return null;
    const x = (v.a * h.b + v.b) / den;
    return [x, h.a * x + h.b];
  };
  const quad = [meet(left, top), meet(right, top), meet(right, bottom), meet(left, bottom)];
  if (quad.some(q => !q)) return null;
  const k = r.h / H;
  const pts = quad.map(([x, y]) => [r.x + x * k, r.y + y * k]);
  // Prüfen, ob das wirklich wie eine Karte aussieht
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const w = (dist(pts[0], pts[1]) + dist(pts[3], pts[2])) / 2, h = (dist(pts[0], pts[3]) + dist(pts[1], pts[2])) / 2;
  const ratio = w / h;
  if (ratio < .56 || ratio > .9) return null;
  if (w * h < frame.w * frame.h * .28 || w * h > frame.w * frame.h * 2.1) return null;
  if (Math.abs(dist(pts[0], pts[1]) - dist(pts[3], pts[2])) > w * .35) return null;
  if (Math.abs(dist(pts[0], pts[3]) - dist(pts[1], pts[2])) > h * .35) return null;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const signs = [0, 1, 2, 3].map(i => Math.sign(cross(pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4])));
  if (!signs.every(s => s === signs[0] && s !== 0)) return null;
  return pts;
}

// Projektion vom Einheitsquadrat (0..1) auf die vier Ecken.
function squareTo(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
}

// Zieht die Karte gerade. Rundherum bleibt ein schmaler Rand, wie ihn der Bildvergleich erwartet.
export function straighten(source, corners, CW = 250, CH = 350, margin = .16) {
  const map = squareTo(corners);
  const mw = Math.round(CW * margin), mh = Math.round(CH * margin);
  const OW = CW + mw * 2, OH = CH + mh * 2;
  // Ausschnitt der Quelle einmal lesen, so groß wie nötig
  const ring = [[-margin, -margin], [1 + margin, -margin], [1 + margin, 1 + margin], [-margin, 1 + margin]].map(([u, v]) => map(u, v));
  const SW = source.videoWidth || source.width, SH = source.videoHeight || source.height;
  const bx = Math.max(0, Math.floor(Math.min(...ring.map(p => p[0])))), by = Math.max(0, Math.floor(Math.min(...ring.map(p => p[1]))));
  const ex = Math.min(SW, Math.ceil(Math.max(...ring.map(p => p[0])))), ey = Math.min(SH, Math.ceil(Math.max(...ring.map(p => p[1]))));
  const bw = ex - bx, bh = ey - by;
  if (bw < 10 || bh < 10) return null;
  const scale = Math.min(1, (OH * 1.6) / bh);
  const rw = Math.max(1, Math.round(bw * scale)), rh = Math.max(1, Math.round(bh * scale));
  const read = document.createElement('canvas');
  read.width = rw; read.height = rh;
  const rx = read.getContext('2d', { willReadFrequently: true });
  rx.drawImage(source, bx, by, bw, bh, 0, 0, rw, rh);
  const src = rx.getImageData(0, 0, rw, rh).data;
  const out = document.createElement('canvas');
  out.width = OW; out.height = OH;
  const ox = out.getContext('2d', { willReadFrequently: true });
  const img = ox.createImageData(OW, OH);
  const px = img.data;
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const [sx, sy] = map((x - mw + .5) / CW, (y - mh + .5) / CH);
      const fx = (sx - bx) * scale - .5, fy = (sy - by) * scale - .5;
      const o = (y * OW + x) * 4;
      px[o + 3] = 255;
      if (fx < 0 || fy < 0 || fx >= rw - 1 || fy >= rh - 1) continue;
      const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy;
      const i00 = (iy * rw + ix) * 4, i10 = i00 + 4, i01 = i00 + rw * 4, i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        px[o + ch] = (src[i00 + ch] * (1 - ax) + src[i10 + ch] * ax) * (1 - ay) + (src[i01 + ch] * (1 - ax) + src[i11 + ch] * ax) * ay;
      }
    }
  }
  ox.putImageData(img, 0, 0);
  return { canvas: out, rect: { x: mw, y: mh, w: CW, h: CH } };
}
