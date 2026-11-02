// Vergleicht das Kamerabild direkt mit dem Originalbild einer Karte.
// Der Fingerabdruck findet Kandidaten, erst dieser Vergleich sagt, ob es wirklich dieselbe Karte ist.
// Grenze für die Bildteile. Simuliert gemessen: andere Karten höchstens .54 (99 % unter .42), dieselbe Karte bei Glanz und Unschärfe ab .55.
export const MATCH_SURE = .55;

const SW = 150, SH = 210, WIDEN = 1.3; // Ausschnitt um den Rahmen
const GX = 28, GY = 18; // Messpunkte im Kartenmotiv
const images = new Map();

function loadOfficial(url) {
  if (images.has(url)) return images.get(url);
  const job = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 100; c.height = 140;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, 100, 140);
      resolve(toGray(x.getImageData(0, 0, 100, 140).data, 100, 140));
    };
    img.onerror = () => resolve(null); // Quelle erlaubt keinen Vergleich
    img.src = url;
  });
  images.set(url, job);
  return job;
}

function toGray(d, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  return g;
}

// Messpunkte auf dem Originalbild, normiert für den Vergleich.
function samples(off, u0, u1, v0, v1, nx, ny) {
  const pts = [];
  let sum = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const u = u0 + (u1 - u0) * (x + .5) / nx, v = v0 + (v1 - v0) * (y + .5) / ny;
      const val = off[Math.floor(v * 140) * 100 + Math.floor(u * 100)];
      pts.push({ u: u - .5, v: v - .5, val });
      sum += val;
    }
  }
  const mean = sum / pts.length;
  let sq = 0;
  for (const p of pts) { p.z = p.val - mean; sq += p.z * p.z; }
  const norm = Math.sqrt(sq) || 1;
  for (const p of pts) p.z /= norm;
  return pts;
}

function ncc(g, pts, p, cw, ch) {
  const cos = Math.cos(p.r), sin = Math.sin(p.r);
  let n = 0, sum = 0, sq = 0, cross = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    const x0 = q.u * cw * p.s, y0 = q.v * ch * p.s;
    const X = SW / 2 + p.dx + x0 * cos - y0 * sin, Y = SH / 2 + p.dy + x0 * sin + y0 * cos;
    if (X < 0 || Y < 0 || X >= SW - 1 || Y >= SH - 1) continue;
    const xi = X | 0, yi = Y | 0, fx = X - xi, fy = Y - yi, at = yi * SW + xi;
    const v = (g[at] * (1 - fx) + g[at + 1] * fx) * (1 - fy) + (g[at + SW] * (1 - fx) + g[at + SW + 1] * fx) * fy;
    n++; sum += v; sq += v * v; cross += v * q.z;
  }
  if (n < pts.length * .8) return -1;
  const variance = sq - sum * sum / n;
  return variance > 1 ? cross / Math.sqrt(variance) : -1;
}

// Sucht die beste Lage der Karte im Ausschnitt: Größe, Verschiebung und leichte Drehung.
function bestPose(g, pts, cw, ch) {
  let best = { r: 0, s: 1, dx: 0, dy: 0 }, top = -2;
  for (let s = .66; s <= 1.56; s += .06) {
    for (let dy = -24; dy <= 24; dy += 6) {
      for (let dx = -18; dx <= 18; dx += 6) {
        const v = ncc(g, pts, { r: 0, s, dx, dy }, cw, ch);
        if (v > top) { top = v; best = { r: 0, s, dx, dy }; }
      }
    }
  }
  for (const scale of [1, .5, .25]) {
    for (const [key, step] of [['s', .03], ['dx', 3], ['dy', 3], ['r', .05]]) {
      for (const dir of [1, -1]) {
        const next = { ...best, [key]: best[key] + step * scale * dir };
        const v = ncc(g, pts, next, cw, ch);
        if (v > top) { top = v; best = next; }
      }
    }
  }
  return { pose: best, score: top };
}

// Liest den Ausschnitt einmal, damit mehrere Karten mit demselben Bild verglichen werden.
export function readRegion(source, r) {
  const h = r.h * WIDEN, w = h * SW / SH;
  const c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(source, r.x + r.w / 2 - w / 2, r.y + r.h / 2 - h / 2, w, h, 0, 0, SW, SH);
  return { gray: toGray(x.getImageData(0, 0, SW, SH).data, SW, SH), cw: SW / WIDEN * r.w / (r.h * SW / SH), ch: SH / WIDEN };
}

// Ergebnis: art = Übereinstimmung des Motivs, whole = der ganzen Karte. null, wenn kein Vergleich möglich ist.
export async function compareCard(region, imageUrl) {
  if (!imageUrl) return null;
  const off = await loadOfficial(imageUrl.replace('/high.webp', '/low.webp'));
  if (!off) return null;
  const art = samples(off, .08, .92, .1, .52, GX, GY);
  const { pose, score } = bestPose(region.gray, art, region.cw, region.ch);
  const whole = samples(off, .03, .97, .03, .97, 30, 42);
  // Teilstücke einzeln prüfen: Ein grober Farbverlauf kann zufällig passen, sechs Bildteile nicht.
  const parts = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const pts = samples(off, .08 + col * .28, .08 + (col + 1) * .28, .1 + row * .21, .1 + (row + 1) * .21, 12, 12);
      parts.push(ncc(region.gray, pts, pose, region.cw, region.ch));
    }
  }
  parts.sort((x, y) => x - y);
  const blocks = (parts[1] + parts[2] + parts[3]) / 3; // ohne die besten zwei, damit Glanz und Finger wenig stören
  return { art: score, blocks, whole: ncc(region.gray, whole, pose, region.cw, region.ch) };
}
