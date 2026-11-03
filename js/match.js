// Vergleicht das Kamerabild direkt mit dem Originalbild einer Karte.
// Der Fingerabdruck findet Kandidaten, erst dieser Vergleich sagt, ob es wirklich dieselbe Karte ist.
// Grenze für die Bildteile. Simuliert gemessen: andere Karten höchstens .54 (99 % unter .42), dieselbe Karte bei Glanz und Unschärfe ab .55.
export const MATCH_SURE = .55;
// Ab hier gilt eine Karte als die richtige, auch wenn ein Teil verdeckt ist.
export const COVER_HINT = .4;

const SW = 150, SH = 210, WIDEN = 1.3; // Ausschnitt um den Rahmen
const GX = 28, GY = 18; // Messpunkte im Kartenmotiv
// Grenzen für verdeckte Stellen.
const COVER_LIMIT = .7, COVER_CELLS = 3, COVER_VISIBLE = .7;
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
      const data = x.getImageData(0, 0, 100, 140).data;
      const gray = toGray(data, 100, 140);
      gray.rgb = data;
      resolve(gray);
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
  const data = x.getImageData(0, 0, SW, SH).data;
  return { gray: toGray(data, SW, SH), rgb: data, cw: SW / WIDEN * r.w / (r.h * SW / SH), ch: SH / WIDEN };
}

// Löst die Gleichungen der Lichtanpassung.
function solve(m, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let top = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[top][i])) top = r;
    [m[i], m[top]] = [m[top], m[i]]; [b[i], b[top]] = [b[top], b[i]];
    const d = m[i][i] || 1e-6;
    for (let r = i + 1; r < n; r++) {
      const f = m[r][i] / d;
      for (let k = i; k < n; k++) m[r][k] -= f * m[i][k];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let v = b[i];
    for (let k = i + 1; k < n; k++) v -= m[i][k] * x[k];
    x[i] = v / (m[i][i] || 1e-6);
  }
  return x;
}

// Passt das Originalbild an das Licht im Kamerabild an, auch an Verlauf und hellen Fleck auf der Karte.
function fitLight(pts, ch) {
  const feats = p => { const o = p.off[ch]; return [o, o * p.u, o * p.v, o * p.u * p.u, o * p.v * p.v, o * p.u * p.v, 1]; };
  const model = (w, p) => feats(p).reduce((sum, f, i) => sum + f * w[i], 0);
  let keep = pts, w = [1, 0, 0, 0, 0, 0, 0];
  for (let round = 0; round < 3; round++) {
    const m = w.map(() => w.map(() => 0)), b = w.map(() => 0);
    for (const p of keep) {
      const f = feats(p);
      for (let i = 0; i < f.length; i++) {
        b[i] += f[i] * p.cam[ch];
        for (let k = 0; k < f.length; k++) m[i][k] += f[i] * f[k];
      }
    }
    w = solve(m, b);
    // Finger und Glanz sollen die Anpassung nicht verziehen.
    keep = pts.map(p => ({ p, e: Math.abs(model(w, p) - p.cam[ch]) })).sort((x, y) => x.e - y.e)
      .slice(0, Math.ceil(pts.length * .6)).map(x => x.p);
  }
  return p => model(w, p);
}

const CX = 14, CY = 20, PER = 4; // Raster über die ganze Karte
const areaOf = v => (v < .11 ? 'Name' : v < .56 ? 'Bild' : v < .89 ? 'Text' : 'Logo oder Nummer');

// Legt die Karte genauer auf das Kamerabild, sonst sehen feine Schrift und Kanten wie Fehler aus.
function refinePose(region, whole, pose) {
  let best = pose, top = ncc(region.gray, whole, pose, region.cw, region.ch);
  for (const scale of [1, .5, .25]) {
    for (let again = 0; again < 2; again++) {
      for (const [key, step] of [['s', .012], ['dx', 1.2], ['dy', 1.2], ['r', .012]]) {
        for (const dir of [1, -1]) {
          const next = { ...best, [key]: best[key] + step * scale * dir };
          const v = ncc(region.gray, whole, next, region.cw, region.ch);
          if (v > top) { top = v; best = next; }
        }
      }
    }
  }
  return best;
}

// Sucht Stellen, an denen das Kamerabild nicht zum Original passt: Dort liegt etwas auf der Karte.
// Verglichen wird der Mittelwert je Feld. Feine Schrift mittelt sich weg, ein Finger nicht.
function coverage(off, region, p) {
  const none = { covered: [], top: 0, typical: 0 };
  if (!off.rgb || !region.rgb) return none;
  const cos = Math.cos(p.r), sin = Math.sin(p.r), pts = [];
  for (let y = 0; y < CY * PER; y++) {
    for (let x = 0; x < CX * PER; x++) {
      const u = .015 + .97 * (x + .5) / (CX * PER), v = .015 + .97 * (y + .5) / (CY * PER);
      const at = (Math.floor(v * 140) * 100 + Math.floor(u * 100)) * 4;
      if (off.rgb[at + 3] < 250) continue; // abgerundete Ecke
      const x0 = (u - .5) * region.cw * p.s, y0 = (v - .5) * region.ch * p.s;
      const X = Math.round(SW / 2 + p.dx + x0 * cos - y0 * sin), Y = Math.round(SH / 2 + p.dy + x0 * sin + y0 * cos);
      const inside = X >= 0 && Y >= 0 && X < SW && Y < SH;
      const c = (Y * SW + X) * 4;
      // Überstrahlte Stellen verraten nichts über die Karte: auslassen statt als Fehler zählen
      if (inside && Math.max(region.rgb[c], region.rgb[c + 1], region.rgb[c + 2]) >= 250) continue;
      pts.push({
        u: u - .5, v: v - .5, cell: Math.floor(y / PER) * CX + Math.floor(x / PER), inside, X, Y,
        off: [off.rgb[at], off.rgb[at + 1], off.rgb[at + 2]],
        cam: inside ? [region.rgb[c], region.rgb[c + 1], region.rgb[c + 2]] : [0, 0, 0],
      });
    }
  }
  const seen = pts.filter(q => q.inside);
  if (seen.length < 50) return none;
  const linear = [0, 1, 2].map(ch => fitLight(seen, ch));
  // Kameras biegen die Helligkeit (Kontrast, überstrahlte Lichter). Eine Kurve je Farbkanal gleicht das aus.
  // Der Mittelwert pro Helligkeitsstufe ist robust gegen einen Finger, solange er nicht die halbe Karte bedeckt.
  const fits = linear.map((lin, ch) => {
    const BINS = 12, groups = Array.from({ length: BINS }, () => []);
    let lo = Infinity, hi = -Infinity;
    for (const q of seen) { const v = lin(q); if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = Math.max(1, hi - lo);
    const binOf = v => Math.min(BINS - 1, Math.max(0, Math.floor((v - lo) / span * BINS)));
    for (const q of seen) groups[binOf(lin(q))].push(q.cam[ch]);
    const curve = groups.map((g, i) => {
      if (g.length < 6) return null;
      g.sort((x, y) => x - y);
      return g[Math.floor(g.length / 2)] - (lo + span * (i + .5) / BINS);
    });
    // Lücken mit Nachbarn füllen
    for (let i = 0; i < BINS; i++) if (curve[i] == null) curve[i] = curve.slice(0, i).reverse().find(v => v != null) ?? curve.slice(i).find(v => v != null) ?? 0;
    return q => {
      const v = lin(q), f = (v - lo) / span * BINS - .5;
      const i = Math.max(0, Math.min(BINS - 2, Math.floor(f))), t = Math.max(0, Math.min(1, f - i));
      return v + curve[i] * (1 - t) + curve[i + 1] * t;
    };
  });
  // Der Kontrast im Bild ist der Maßstab, damit dunkle und helle Aufnahmen gleich zählen.
  let sum = 0, sq = 0;
  for (const q of seen) { const v = fits[1](q); sum += v; sq += v * v; }
  const sd = Math.sqrt(Math.max(1, sq / seen.length - (sum / seen.length) ** 2));
  // Jedes Feld darf ein paar Bildpunkte verrutscht sein (schräg gehaltene Karte, ungenaue Kanten).
  // Ein Finger bleibt auch verschoben auffällig, eine leicht versetzte Schrift nicht.
  const SHIFTS = [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]];
  const byCell = Array.from({ length: CX * CY }, () => []);
  for (const q of pts) byCell[q.cell].push(q);
  const predicted = new Map(seen.map(q => [q, [fits[0](q), fits[1](q), fits[2](q)]]));
  const cells = byCell.map(list => {
    if (!list.length) return 0;
    const out = list.filter(q => !q.inside).length;
    if (out > list.length / 2) return 9; // außerhalb des Bildes
    let best = Infinity;
    for (const [sx, sy] of SHIFTS) {
      const sum = [0, 0, 0];
      let n = 0;
      for (const q of list) {
        if (!q.inside) continue;
        const X = Math.min(SW - 1, Math.max(0, q.X + sx)), Y = Math.min(SH - 1, Math.max(0, q.Y + sy)), c = (Y * SW + X) * 4;
        const pr = predicted.get(q);
        for (let ch = 0; ch < 3; ch++) sum[ch] += region.rgb[c + ch] - pr[ch];
        n++;
      }
      // stärkster Farbkanal: ein Finger auf gelbem Rand fällt nur im Blau auf
      const e = n ? Math.max(Math.abs(sum[0]), Math.abs(sum[1]), Math.abs(sum[2])) / n / sd : 0;
      if (e < best) best = e;
    }
    return best;
  });
  const typical = [...cells].sort((x, y) => x - y)[Math.floor(cells.length / 2)];
  const limit = Math.max(COVER_LIMIT, typical * 3);
  const stillVisible = group => {
    const inGroup = new Set(group);
    let n = 0, so = 0, sc = 0, oo = 0, cc = 0, oc = 0;
    for (const q of pts) {
      if (!q.inside || !inGroup.has(q.cell)) continue;
      const o = q.off[1], c = q.cam[1];
      n++; so += o; sc += c; oo += o * o; cc += c * c; oc += o * c;
    }
    if (n < 8) return false;
    const vo = oo - so * so / n, vc = cc - sc * sc / n;
    if (vo / n < 60 || vc <= 0) return false; // einfarbige Stelle: nichts zum Vergleichen
    return (oc - so * sc / n) / Math.sqrt(vo * vc) > COVER_VISIBLE;
  };
  // Zusammenhängende auffällige Felder: Einzelne Ausreißer durch Glanz oder Rauschen zählen nicht.
  const seenCell = new Uint8Array(cells.length), hit = new Set();
  let largest = 0;
  cells.forEach((e, start) => {
    if (e <= limit || seenCell[start]) return;
    const group = [start];
    seenCell[start] = 1;
    for (let g = 0; g < group.length; g++) {
      const i = group[g], col = i % CX;
      for (const k of [col > 0 ? i - 1 : -1, col < CX - 1 ? i + 1 : -1, i - CX, i + CX]) {
        if (k >= 0 && k < cells.length && !seenCell[k] && cells[k] > limit) { seenCell[k] = 1; group.push(k); }
      }
    }
    // Sieht man das Motiv unter der Stelle noch, ist es Glanz und nichts liegt auf der Karte.
    if (stillVisible(group)) return;
    largest = Math.max(largest, group.length);
    if (group.length >= COVER_CELLS) group.forEach(i => hit.add(areaOf((Math.floor(i / CX) + .5) / CY)));
  });
  return { covered: [...hit], largest, typical };
}

// Ergebnis: covered = verdeckte Bereiche der Karte. art = Übereinstimmung des Motivs, whole = der ganzen Karte. null, wenn kein Vergleich möglich ist.
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
  const cover = coverage(off, region, refinePose(region, whole, pose));
  return { art: score, blocks, whole: ncc(region.gray, whole, pose, region.cw, region.ch), covered: cover.covered, largest: cover.largest, typical: cover.typical };
}
