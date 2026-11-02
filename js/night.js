// Nachtsicht für den Scanner: Holt mehr Licht aus der Kamera und legt mehrere Bilder übereinander.
// Das mittelt das Rauschen weg, danach wird das Bild aufgehellt. Ganz ohne Licht sieht aber keine Kamera etwas.
const DARK_ON = 55, DARK_OFF = 90, BRIGHT = 140;
const MAX_W = 1280, MAX_GAIN = 12;

export function createNight(video, track) {
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const meter = document.createElement('canvas');
  meter.width = 64; meter.height = 36;
  const mx = meter.getContext('2d', { willReadFrequently: true });
  const grab = document.createElement('canvas');
  const gx = grab.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas');
  const ox = out.getContext('2d');
  let on = false, raised = false, level = 255, avg = null, frames = 0, gain = 1, image = null;

  function measure() {
    mx.drawImage(video, 0, 0, 64, 36);
    const d = mx.getImageData(16, 8, 32, 20).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
    return sum / (d.length / 4);
  }

  // Längere Belichtung, soweit das Gerät sie anbietet. Nicht jede Kamera erlaubt das.
  function exposure(more) {
    const wish = {};
    if (caps.exposureMode && caps.exposureMode.includes('continuous')) wish.exposureMode = 'continuous';
    if (caps.exposureCompensation) wish.exposureCompensation = more ? caps.exposureCompensation.max : Math.max(0, caps.exposureCompensation.min);
    if (Object.keys(wish).length) track.applyConstraints({ advanced: [wish] }).catch(() => {});
  }

  function stackFrame() {
    const w = Math.min(MAX_W, video.videoWidth), h = Math.round(w * video.videoHeight / video.videoWidth);
    if (grab.width !== w || grab.height !== h || !avg) {
      grab.width = out.width = w; grab.height = out.height = h;
      avg = new Float32Array(w * h * 3); frames = 0;
      image = ox.createImageData(w, h);
    }
    gx.drawImage(video, 0, 0, w, h);
    const d = gx.getImageData(0, 0, w, h).data;
    // Ändert sich auch nur eine Stelle (Karte bewegt, Finger drauf), fängt das Übereinanderlegen neu an.
    // Sonst bliebe das alte Bild sichtbar und ein Finger fiele zu spät auf.
    if (frames) {
      const GX = 12, GY = 8, diff = new Float32Array(GX * GY), count = new Float32Array(GX * GY);
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const cell = Math.floor(y * GY / h) * GX + Math.floor(x * GX / w);
          diff[cell] += d[(y * w + x) * 4 + 1] - avg[(y * w + x) * 3 + 1];
          count[cell]++;
        }
      }
      const limit = Math.max(1.2, level * .1);
      if (diff.some((v, i) => Math.abs(v / (count[i] || 1)) > limit)) frames = 0;
    }
    const a = Math.max(.16, 1 / (frames + 1));
    for (let p = 0, i = 0; p < avg.length; p += 3, i += 4) {
      avg[p] += (d[i] - avg[p]) * a;
      avg[p + 1] += (d[i + 1] - avg[p + 1]) * a;
      avg[p + 2] += (d[i + 2] - avg[p + 2]) * a;
    }
    frames++;
  }

  return {
    get on() { return on; },
    get level() { return level; },
    get scale() { return out.width / video.videoWidth; },
    get preview() { return Math.min(6, gain); },
    update() {
      if (!video.videoWidth) return;
      level = measure();
      if (!on && level < DARK_ON) {
        on = true; frames = 0;
        if (!raised) { raised = true; exposure(true); }
      } else if (on && level > DARK_OFF) { on = false; avg = null; gain = 1; }
      // Erst bei viel Licht zurückstellen, sonst springt die Belichtung ständig hin und her.
      if (raised && level > BRIGHT) { raised = false; exposure(false); }
      if (on) stackFrame();
    },
    restart() { frames = 0; },
    // Fertiges, aufgehelltes Bild.
    render() {
      if (!avg || !frames) return null;
      const samples = [];
      for (let p = 0; p < avg.length; p += 300) samples.push(avg[p] * .3 + avg[p + 1] * .59 + avg[p + 2] * .11);
      samples.sort((x, y) => x - y);
      const black = samples[Math.floor(samples.length * .02)];
      const bright = samples[Math.floor(samples.length * .98)];
      gain = Math.min(MAX_GAIN, Math.max(1, 235 / Math.max(1, bright - black)));
      const px = image.data;
      for (let p = 0, i = 0; p < avg.length; p += 3, i += 4) {
        px[i] = (avg[p] - black) * gain;
        px[i + 1] = (avg[p + 1] - black) * gain;
        px[i + 2] = (avg[p + 2] - black) * gain;
        px[i + 3] = 255;
      }
      ox.putImageData(image, 0, 0);
      return out;
    },
  };
}
