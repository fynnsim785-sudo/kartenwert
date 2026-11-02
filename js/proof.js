// Echtheitsprobe: Die Karte muss vor der Kamera zufällige Bewegungen machen und umgedreht werden.
// Ein Bild auf einem Monitor oder ein Foto aus dem Internet kann das nicht.
import { VISUAL_SURE, visualSearch, hashCanvas, hashUrl, distance, loadIndex } from './scan.js';
import { ICON } from './icons.js';

const TEXT = {
  tilt_left: 'Kippe die linke Kante von dir weg',
  tilt_right: 'Kippe die rechte Kante von dir weg',
  rotate_left: 'Drehe die Karte nach links',
  rotate_right: 'Drehe die Karte nach rechts',
  near: 'Halte die Karte näher an die Kamera',
  flip: 'Dreh die Karte um',
};
const MOVES = ['tilt_left', 'tilt_right', 'rotate_left', 'rotate_right', 'near'];
const VIRTUAL = /obs|virtual|manycam|snap camera|xsplit|vmix|ndi|splitcam|e2esoft|camtwist|mmhmm|fake/i;
const STEP_LIMIT = 25000;
const AW = 160, AH = 224, WIDEN = 1.7; // Auswertung in einem Ausschnitt, der größer ist als der Rahmen
const GRID_X = 26, GRID_Y = 36;

// Für das Hinzufügen zur Sammlung: eine zufällige Bewegung und einmal umdrehen.
export function quickSteps() {
  return [MOVES[crypto.getRandomValues(new Uint8Array(1))[0] % MOVES.length], 'flip'];
}

export function cameraAllowed(stream) {
  const track = stream.getVideoTracks()[0];
  return !(track && VIRTUAL.test(track.label || ''));
}

// Findet die Karte im Bild wieder und schätzt ihre Lage: Drehung, Größe, Kippen und Verschiebung.
function makeTracker(cw, ch) {
  let ref = null;
  const score = (g, p) => {
    const cos = Math.cos(p.r), sin = Math.sin(p.r);
    const sx = p.s * p.k, sy = p.s / p.k;
    const cx = AW / 2 + p.dx, cy = AH / 2 + p.dy;
    let n = 0, sum = 0, sq = 0, cross = 0;
    for (let i = 0; i < ref.length; i++) {
      const q = ref[i];
      const w = 1 + p.a * q.u + p.b * q.v;
      const x0 = q.u * cw * sx, y0 = q.v * ch * sy;
      const X = cx + (x0 * cos - y0 * sin) / w, Y = cy + (x0 * sin + y0 * cos) / w;
      if (X < 0 || Y < 0 || X >= AW - 1 || Y >= AH - 1) continue;
      const xi = X | 0, yi = Y | 0, fx = X - xi, fy = Y - yi;
      const at = yi * AW + xi;
      const v = (g[at] * (1 - fx) + g[at + 1] * fx) * (1 - fy) + (g[at + AW] * (1 - fx) + g[at + AW + 1] * fx) * fy;
      n++; sum += v; sq += v * v; cross += v * q.z;
    }
    if (n < ref.length * .6) return -1;
    const variance = sq - sum * sum / n;
    return variance > 1 ? cross / Math.sqrt(variance) : -1;
  };
  const STEPS = { r: .07, s: .06, k: .05, a: .08, b: .08, dx: 4, dy: 4 };
  const climb = (g, start) => {
    let best = { ...start }, top = score(g, best);
    for (const scale of [1, .5]) {
      for (let pass = 0; pass < 2; pass++) {
        for (const key of Object.keys(STEPS)) {
          for (const dir of [1, -1]) {
            const next = { ...best, [key]: best[key] + STEPS[key] * scale * dir };
            if (next.s < .5 || next.s > 2.2 || next.k < .6 || next.k > 1.5 || Math.abs(next.a) > .9 || Math.abs(next.b) > .9) continue;
            const v = score(g, next);
            if (v > top) { top = v; best = next; }
          }
        }
      }
    }
    return { pose: best, score: top };
  };
  let pose = { r: 0, s: 1, k: 1, a: 0, b: 0, dx: 0, dy: 0 };
  return {
    setReference(g) {
      const pts = [];
      let sum = 0;
      for (let y = 0; y < GRID_Y; y++) {
        for (let x = 0; x < GRID_X; x++) {
          const u = (x + .5) / GRID_X - .5, v = (y + .5) / GRID_Y - .5;
          const X = Math.round(AW / 2 + u * cw), Y = Math.round(AH / 2 + v * ch);
          const val = g[Y * AW + X];
          pts.push({ u, v, val });
          sum += val;
        }
      }
      const mean = sum / pts.length;
      let sq = 0;
      for (const p of pts) { p.z = p.val - mean; sq += p.z * p.z; }
      const norm = Math.sqrt(sq) || 1;
      for (const p of pts) p.z /= norm;
      ref = pts;
    },
    track(g, wide) {
      let res = climb(g, pose);
      if (wide) {
        // Regelmäßig im ganzen Ausschnitt neu suchen, falls die Suche an einer falschen Stelle hängt.
        let bestStart = null, top = -2;
        for (let deg = -120; deg <= 120; deg += 20) {
          for (const s of [.85, 1, 1.2, 1.45]) {
            const start = { r: deg * Math.PI / 180, s, k: 1, a: 0, b: 0, dx: 0, dy: 0 };
            const v = score(g, start);
            if (v > top) { top = v; bestStart = start; }
          }
        }
        const again = climb(g, bestStart);
        if (again.score > res.score) res = again;
      }
      if (res.score > .3) pose = res.pose;
      return res;
    },
    forget() { pose = { r: 0, s: 1, k: 1, a: 0, b: 0, dx: 0, dy: 0 }; },
  };
}

// Prüft die Farbe der Rückseite: Pokémon blau, Magic und Yu-Gi-Oh! braun.
function looksLikeBack(card, r, g, b) {
  const old = String(card.id || '').startsWith('ja:');
  if (card.game === 'pokemon') return b >= r - 5 || (old && r > b + 10);
  return r >= b + 6 && g >= b - 5;
}

function reached(step, pose) {
  if (step === 'tilt_left') return pose.a <= -.1;
  if (step === 'tilt_right') return pose.a >= .1;
  if (step === 'rotate_left') return pose.r <= -.5;
  if (step === 'rotate_right') return pose.r >= .5;
  if (step === 'near') return pose.s >= 1.2;
  return false;
}

// Passt das Kamerabild zur Karte, die geprüft werden soll?
async function sameCard(card, video, r) {
  if (card.game === 'pokemon' && await loadIndex()) {
    const hits = await visualSearch(video, r.x, r.y, r.w, r.h, 12);
    const want = String(card.id).replace(/^[a-z]{2}:/, '');
    if (hits.some(h => h.d <= VISUAL_SURE + 6 && String(h.key).replace(/^[a-z]{2}:/, '') === want)) return true;
  }
  const official = card.image ? await hashUrl(card.image) : null;
  if (!official) return card.game === 'yugioh' || !card.image; // Diese Quelle erlaubt keinen Bildvergleich.
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
  c.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return distance(hashCanvas(c), official) <= 24;
}

// Ergebnis: { ok: true, frames } oder { ok: false, reason }. frames: Fingerabdrücke, nie die Bilder selbst.
export async function runProof({ card, steps, stream }) {
  const own = !stream;
  try {
    if (own) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { ok: false, reason: 'Diese Probe braucht eine Kamera.' };
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    }
  } catch {
    return { ok: false, reason: 'Kein Zugriff auf die Kamera.' };
  }
  if (!cameraAllowed(stream)) {
    if (own) stream.getTracks().forEach(t => t.stop());
    return { ok: false, reason: 'Eine virtuelle Kamera ist nicht erlaubt.' };
  }

  const el = document.createElement('div');
  el.id = 'live';
  el.className = 'proof';
  el.innerHTML = `
    <video playsinline autoplay muted></video>
    <div class="frame"><i></i><i></i><i></i><i></i></div>
    <div class="livetop">
      <button class="liveicon" data-p="close" aria-label="Abbrechen">${ICON.close}</button>
      <span class="pvdots">${steps.map(() => '<i></i>').join('')}</span>
      <span class="liveicon"></span>
    </div>
    <div class="pvbox">
      <p class="pvtitle">Echtheitsprobe</p>
      <p class="pvtext">Bewege die echte Karte so, wie es hier steht.</p>
      <button class="btn" data-p="start">Los</button>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('noscroll');
  const video = el.querySelector('video');
  const frame = el.querySelector('.frame');
  const titleEl = el.querySelector('.pvtitle');
  const textEl = el.querySelector('.pvtext');
  const startBtn = el.querySelector('[data-p="start"]');
  const dots = [...el.querySelectorAll('.pvdots i')];
  video.srcObject = stream;
  startBtn.hidden = true;
  await Promise.race([video.play().catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
  startBtn.hidden = false;

  const canvas = document.createElement('canvas');
  canvas.width = AW; canvas.height = AH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gray = new Float32Array(AW * AH);
  let prev = null;
  let colors = { r: 0, g: 0, b: 0 };

  function frameRect() {
    const v = video.getBoundingClientRect(), f = frame.getBoundingClientRect();
    const s = Math.max(v.width / video.videoWidth, v.height / video.videoHeight);
    const ox = (v.width - video.videoWidth * s) / 2, oy = (v.height - video.videoHeight * s) / 2;
    return { x: (f.left - v.left - ox) / s, y: (f.top - v.top - oy) / s, w: f.width / s, h: f.height / s };
  }
  const regionOf = r => {
    // Der Ausschnitt behält dasselbe Seitenverhältnis wie die Auswertung.
    const h = r.h * WIDEN, w = h * AW / AH;
    return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
  };

  // Liest das aktuelle Bild und misst Unterschiede zum vorigen.
  function read() {
    const a = regionOf(frameRect());
    ctx.drawImage(video, a.x, a.y, a.w, a.h, 0, 0, AW, AH);
    const d = ctx.getImageData(0, 0, AW, AH).data;
    let moved = 0, sum = 0, sq = 0, cr = 0, cg = 0, cb = 0, cn = 0, en = 0;
    const x0 = AW * .3, x1 = AW * .7, y0 = AH * .3, y1 = AH * .7;
    // Die Rückseite hat in der Mitte ein Motiv, ihre Grundfarbe zeigen die Seitenränder der Karte.
    const edgeTop = AH * .24, edgeBottom = AH * .76;
    for (let i = 0, y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++, i++) {
        const p = i * 4;
        const v = d[p] * .3 + d[p + 1] * .59 + d[p + 2] * .11;
        if (prev) moved += Math.abs(v - prev[i]);
        gray[i] = v;
        if (x > x0 && x < x1 && y > y0 && y < y1) { sum += v; sq += v * v; cn++; }
        if (y > edgeTop && y < edgeBottom && ((x > AW * .23 && x < AW * .3) || (x > AW * .7 && x < AW * .77))) { cr += d[p]; cg += d[p + 1]; cb += d[p + 2]; en++; }
      }
    }
    prev = prev || new Float32Array(AW * AH);
    prev.set(gray);
    colors = { r: cr / en, g: cg / en, b: cb / en };
    return { variance: sq / cn - (sum / cn) ** 2, motion: moved / (AW * AH) };
  }
  // Fingerabdruck mit etwas Umgebung, damit zwei Besitzer derselben Karte verschiedene Werte haben.
  function snapHash() {
    const r = frameRect();
    const a = { x: r.x - r.w * .12, y: r.y - r.h * .12, w: r.w * 1.24, h: r.h * 1.24 };
    const c = document.createElement('canvas');
    c.width = 320; c.height = Math.round(320 * a.h / a.w);
    c.getContext('2d').drawImage(video, a.x, a.y, a.w, a.h, 0, 0, c.width, c.height);
    return hashCanvas(c);
  }

  // Bewegt sich das Handy statt der Karte, sagt der Lagesensor das.
  let spin = { x: 0, y: 0, z: 0 }, lastMotion = 0, hasGyro = false;
  const onMotion = e => {
    const rate = e.rotationRate;
    if (!rate || rate.alpha == null) return;
    hasGyro = true;
    const now = e.timeStamp;
    const dt = lastMotion ? Math.min(.1, (now - lastMotion) / 1000) : 0;
    lastMotion = now;
    spin.x += rate.beta * dt; spin.y += rate.gamma * dt; spin.z += rate.alpha * dt;
  };
  const phoneTurned = () => hasGyro && Math.hypot(spin.x, spin.y, spin.z) > 30;

  return new Promise(resolve => {
    let timer = null, finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      window.removeEventListener('devicemotion', onMotion);
      if (own) stream.getTracks().forEach(t => t.stop());
      el.remove();
      if (!document.getElementById('live')) document.body.classList.remove('noscroll');
      resolve(result);
    }

    async function begin() {
      startBtn.hidden = true;
      try {
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission().catch(() => {});
      } catch { /* ohne Sensor geht es trotzdem */ }
      window.addEventListener('devicemotion', onMotion);

      const frames = [];
      const r0 = frameRect();
      const tracker = makeTracker(r0.w / regionOf(r0).w * AW, r0.h / regionOf(r0).h * AH);
      let phase = 'hold', stepIndex = 0, calm = 0, streak = 0, ticks = 0, phaseAt = Date.now();
      let liveDiff = 0, liveCount = 0, busy = false;

      const say = (title, text) => {
        if (titleEl.textContent !== title) titleEl.textContent = title;
        if (textEl.textContent !== text) textEl.textContent = text;
      };
      const nextStep = () => {
        streak = 0;
        phaseAt = Date.now();
        spin = { x: 0, y: 0, z: 0 };
        phase = 'step';
      };
      say('Karte in den Rahmen', 'Halte sie kurz still.');

      async function tick() {
        if (busy || finished || !video.videoWidth) return;
        busy = true;
        try {
          ticks++;
          const { variance, motion } = read();
          if (phase !== 'hold' && Date.now() - phaseAt > STEP_LIMIT) {
            finish({ ok: false, reason: 'Die Zeit ist abgelaufen. Versuche es noch einmal.' });
            return;
          }
          if (phase === 'hold') {
            liveDiff += motion; liveCount++;
            if (variance < 90 || motion > 9) { calm = 0; return; }
            if (++calm < 8) return;
            if (liveCount > 3 && liveDiff / liveCount < .01) {
              finish({ ok: false, reason: 'Das Kamerabild steht still. Das ist keine echte Kamera.' });
              return;
            }
            const r = frameRect();
            say('Karte wird geprüft', 'Einen Moment …');
            if (!await sameCard(card, video, r)) {
              finish({ ok: false, reason: 'Das ist nicht die richtige Karte.' });
              return;
            }
            read();
            tracker.setReference(gray);
            frames.push(snapHash());
            nextStep();
            return;
          }
          const step = steps[stepIndex];
          const res = tracker.track(gray, ticks % 3 === 0);          dots.forEach((d, i) => d.classList.toggle('on', i < stepIndex));
          if (step === 'flip') {
            if (phase === 'step') {
              say(`Schritt ${stepIndex + 1} von ${steps.length}`, TEXT.flip);
              if (res.score < .5 && variance > 60 && looksLikeBack(card, colors.r, colors.g, colors.b)) {
                if (++streak >= 3) {
                  frames.push(snapHash());
                  streak = 0;
                  phase = 'front';
                  phaseAt = Date.now();
                  tracker.forget();
                }
              } else streak = 0;
            } else {
              say(`Schritt ${stepIndex + 1} von ${steps.length}`, 'Zeig wieder die Vorderseite');
              if (res.score >= .6) {
                if (++streak >= 3) {
                  dots.forEach(d => d.classList.add('on'));
                  finish({ ok: true, frames });
                }
              } else streak = 0;
            }
            return;
          }
          if (phoneTurned()) {
            say(`Schritt ${stepIndex + 1} von ${steps.length}`, 'Bewege die Karte, nicht das Handy');
            streak = 0;
            if (Math.hypot(spin.x, spin.y, spin.z) > 60) spin = { x: 0, y: 0, z: 0 };
            return;
          }
          say(`Schritt ${stepIndex + 1} von ${steps.length}`, TEXT[step]);
          frame.dataset.step = step;
          if (res.score >= .45 && reached(step, res.pose)) {
            if (++streak >= 2) {
              frames.push(snapHash());
              stepIndex++;
              tracker.forget();
              nextStep();
            }
          } else streak = 0;
        } finally { busy = false; }
      }
      timer = setInterval(tick, 130);
    }

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      if (b.dataset.p === 'close') finish({ ok: false, reason: '' });
      if (b.dataset.p === 'start') begin();
    });
  });
}
