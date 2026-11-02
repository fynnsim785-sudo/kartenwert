// Erkennt, ob die Kamera auf einen Bildschirm schaut.
// Ein Bildschirm besteht aus einem regelmäßigen Punktraster. Die Kamera sieht es als scharfe Spitzen im Frequenzbild,
// gedruckte Karten und normale Motive haben solche Spitzen in diesem Bereich kaum.
const N = 256;
const MIN_R = 18, MAX_R = 102; // Muster mit einer Länge von etwa 2,5 bis 14 Kamerapunkten
export const SCREEN_LIMIT = 40; // Simuliert: Karten meist unter 21, Bildschirme ab etwa 59. Ein Druckraster genau an der Auflösungsgrenze kann höher liegen.

const WINDOW = (() => {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
  return w;
})();

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

const canvas = document.createElement('canvas');
canvas.width = canvas.height = N;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Frontal gefilmt liegt das Raster genau waagerecht und senkrecht. Kanten im Bild erzeugen dort auch Werte,
// aber breit verteilt: Nur eine schmale Spitze gegenüber den Nachbarn zählt.
const AXIS_WEIGHT = 4;
function axisPeak(re, im) {
  let best = 0;
  for (const horizontal of [true, false]) {
    const line = new Float32Array(MAX_R + 8);
    for (let r = 1; r < line.length; r++) {
      let sum = 0;
      for (let side = 0; side < 3; side++) {
        const at = horizontal ? side * N + r : r * N + side;
        sum += Math.hypot(re[at], im[at]);
      }
      line[r] = sum;
    }
    for (let r = MIN_R; r <= MAX_R; r++) {
      const near = [];
      for (let k = 2; k <= 6; k++) near.push(line[r - k], line[r + k]);
      near.sort((x, y) => x - y);
      const ratio = line[r] / (near[5] || 1);
      if (ratio > best) best = ratio;
    }
  }
  return best;
}

// Wert für ein Kamerabild: je höher, desto eher ein Bildschirm. null, wenn das Bild zu klein ist.
export function screenScore(video, r) {
  if (r.w < N || r.h < N) return null;
  // Ohne Skalieren lesen, sonst verschwindet das Raster.
  const sx = Math.round(r.x + r.w / 2 - N / 2), sy = Math.round(r.y + r.h / 2 - N / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, sx, sy, N, N, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const re = new Float32Array(N * N), im = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = (y * N + x) * 4;
      re[y * N + x] = (d[p] * .299 + d[p + 1] * .587 + d[p + 2] * .114) * WINDOW[x] * WINDOW[y];
    }
  }
  const rr = new Float32Array(N), ri = new Float32Array(N);
  for (let y = 0; y < N; y++) {
    const at = y * N;
    rr.set(re.subarray(at, at + N)); ri.set(im.subarray(at, at + N));
    fft(rr, ri);
    re.set(rr, at); im.set(ri, at);
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ri[y] = im[y * N + x]; }
    fft(rr, ri);
    for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ri[y]; }
  }
  // Jeden Ring mit seinem eigenen Mittelwert vergleichen, nur die stärkste Spitze zählt.
  const rings = Array.from({ length: MAX_R + 1 }, () => []);
  for (let y = 0; y < N; y++) {
    const fy = y < N / 2 ? y : y - N;
    for (let x = 0; x < N / 2; x++) {
      const radius = Math.round(Math.hypot(x, fy));
      if (radius < MIN_R || radius > MAX_R) continue;
      // Die Achsen enthalten Kanten aus dem Bild selbst.
      if (x < 3 || Math.abs(fy) < 3) continue;
      rings[radius].push(Math.hypot(re[y * N + x], im[y * N + x]));
    }
  }
  let peak = 0;
  for (let radius = MIN_R; radius <= MAX_R; radius++) {
    const list = rings[radius].sort((a, b) => a - b);
    if (list.length < 8) continue;
    const median = list[list.length >> 1] || 1;
    const ratio = list[list.length - 1] / median;
    if (ratio > peak) peak = ratio;
  }
  return Math.max(peak, axisPeak(re, im) * AXIS_WEIGHT);
}
