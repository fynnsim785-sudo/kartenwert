// Geräusche beim Pack öffnen. Alles wird erzeugt, es gibt keine Tondateien.
// Folie knistert, weil viele winzige Klicks kurz nacheinander kommen: Genau so entsteht das Knistern hier auch.
export function soundEngine(ctx, out = ctx.destination) {
  const rate = ctx.sampleRate;
  const master = ctx.createGain();
  master.gain.value = .9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9; limiter.ratio.value = 12; limiter.attack.value = .002; limiter.release.value = .12;
  master.connect(limiter); limiter.connect(out);

  // Kleiner Raum: Ohne Hall klingt jedes Geräusch wie aus dem Nichts.
  const room = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(rate * .32), rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < d.length; i++) {
      low += (Math.random() * 2 - 1 - low) * .35;
      d[i] = low * Math.exp(-i / (rate * .06));
    }
  }
  room.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = .32;
  room.connect(wet); wet.connect(master);
  const bus = ctx.createGain();
  bus.connect(master); bus.connect(room);

  const noise = ctx.createBuffer(1, rate * 2, rate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Kurze Klicks in verschiedenen Längen
  const grains = [];
  for (let k = 0; k < 18; k++) {
    const len = Math.floor(rate * (.0025 + Math.random() ** 2 * .024));
    const b = ctx.createBuffer(1, len, rate);
    const d = b.getChannelData(0);
    const fall = len * (.12 + Math.random() * .3);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (rate * .00025)) * Math.exp(-i / fall);
    grains.push(b);
  }
  const now = () => ctx.currentTime;
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function grain(t, level, freq, q = 2, dest = bus) {
    const s = ctx.createBufferSource(); s.buffer = pick(grains);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level * 3.2;
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(Math.max(t, now()));
  }
  // Knistern: zufällige Klicks, meist hell, manchmal dumpfer
  function crackle(t, count, spread, level) {
    for (let i = 0; i < count; i++) {
      const dumpf = Math.random() < .22;
      grain(t + Math.random() ** 1.3 * spread, level * (.25 + Math.random() ** 2 * .9), dumpf ? 700 + Math.random() * 900 : 2200 + Math.random() * 7000, dumpf ? 1.2 : 1.5 + Math.random() * 3);
    }
  }
  function air(t, dur, level, from, to, q = .8, type = 'bandpass', swell = false) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + (swell ? dur * .55 : Math.min(.008, dur * .2)));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + .02);
  }
  function tone(t, freq, dur, level, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + .02);
  }
  // Glocke: Obertöne, die nicht genau passen, klingen nach Metall statt nach Piepton
  function bell(t, freq, level) {
    tone(t, freq, 1.1, level);
    tone(t, freq * 2.76, .6, level * .32);
    tone(t, freq * 5.4, .28, level * .14);
  }
  // Karton auf Karton: leiser Klick mit etwas Körper
  function cardTick(t, level) {
    grain(t, level, 2600 + Math.random() * 1600, 1.4);
    grain(t, level * .7, 620 + Math.random() * 300, 1);
  }

  // Reißen besteht aus zwei Schichten: einer Kette dicht folgender Knackser (die Folie gibt Stück für Stück nach)
  // und einem dumpfen Rauschen, wenn sich das Material dehnt. Beides wandert mit dem Riss von links nach rechts.
  let rip = null, carry = 0, zip = 0;
  function ripBed() {
    if (rip) return rip;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    pan.connect(bus);
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = .9;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(pan);
    s.start();
    rip = { g, pan, f };
    return rip;
  }

  return {
    master,
    tearing(level, where = 0) {
      const bed = ripBed(), t = now();
      if (bed.pan.pan) bed.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, where)), t, .02);
      bed.g.gain.setTargetAtTime(level * .18, t, .015);
      bed.f.frequency.setTargetAtTime(500 + level * 700, t, .03);
      // Knackserkette: je schneller gerissen wird, desto dichter, mit leicht unregelmäßigem Takt
      zip += (40 + level * 420) * .016 * (level > .02 ? 1 : 0);
      while (zip >= 1) {
        zip -= 1;
        const at = t + Math.random() * .016;
        grain(at, .16 + level * .4 + Math.random() * .12, 3000 + Math.random() * 3500, 3, bed.pan);
        if (Math.random() < .35) grain(at, .1 + level * .25, 900 + Math.random() * 700, 1.4, bed.pan);
      }
      // Dazwischen einzelne lautere Knister
      carry += level * 1.6;
      while (carry >= 1) {
        carry -= 1;
        grain(t + Math.random() * .016, .25 + Math.random() * .55, 2000 + Math.random() * 7500, 2, bed.pan);
      }
    },
    // Letztes Stück Folie gibt nach, mit einem kurzen Luftstoß
    rip() {
      const t = now();
      if (rip) rip.g.gain.setTargetAtTime(0, t + .04, .03);
      crackle(t, 56, .17, .55);
      air(t, .13, .5, 6000, 900, .7);
      air(t + .02, .09, .3, 260, 120, .9, 'lowpass');
    },
    // Weicher Aufprall einer gefüllten Folientüte
    thud() {
      const t = now();
      air(t, .09, 1, 320, 110, .7, 'lowpass');
      tone(t, 118, .1, .5);
      crackle(t, 16, .09, .5);
    },
    rustle(level = 1) { crackle(now(), Math.round(6 + level * 20), .15 + level * .4, .12 + level * .2); },
    // Karten rutschen aus der Folie
    slide() {
      const t = now();
      air(t, .3, .5, 1100, 2100, .7, 'bandpass', true);
      crackle(t, 14, .28, .3);
      cardTick(t + .28, .35);
    },
    // Leere Folie wird zerknüllt und fällt
    crumple() {
      const t = now();
      crackle(t, 58, .5, .3);
      air(t, .28, .14, 2400, 700, .6, 'bandpass', true);
    },
    whoosh() { air(now(), .34, .5, 420, 1900, .9, 'bandpass', true); },
    // Daumen läuft über den Kartenstapel
    riffle(count = 10, ms = 30) {
      const t = now();
      for (let i = 0; i < count; i++) cardTick(t + i * ms / 1000 + Math.random() * .004, .34 + i / count * .28);
      air(t, count * ms / 1000 + .05, .1, 1300, 2500, .7, 'bandpass', true);
    },
    // Karte wird weggeschnippt
    flick() {
      const t = now();
      grain(t, 1, 3200, 1.3);
      grain(t, .7, 900, 1);
      air(t + .004, .17, .65, 2600, 500, .8);
    },
    // Karte dreht sich um
    flip() {
      const t = now();
      air(t, .16, .45, 800, 3000, 1.1, 'bandpass', true);
      cardTick(t + .17, .6);
    },
    // Aufdecken: Bei Treffern Glocken und tiefes Anschwellen, sonst nur ein leiser Ton
    reveal(big) {
      const t = now();
      if (!big) { bell(t, 880, .07); bell(t + .08, 1318.5, .05); return; }
      tone(t, 65.4, 1, .26);
      [523.25, 783.99, 1046.5, 1567.98].forEach((f, i) => bell(t + i * .085, f, .12));
      air(t, 1, .05, 5000, 11000, .5, 'highpass', true);
    },
    tick() { cardTick(now(), .9); },
    stopRip() { if (rip) rip.g.gain.setTargetAtTime(0, now(), .02); },
  };
}

// Für die Szene: startet den Ton erst, wenn er gebraucht wird, und merkt sich die Stummschaltung.
export function makeSound() {
  let ctx = null, engine = null, muted = false;
  try { muted = localStorage.getItem('kartenwert.packton') === 'aus'; } catch { /* egal */ }
  function ready() {
    if (engine) return engine;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      engine = soundEngine(ctx);
      engine.master.gain.value = muted ? 0 : .9;
    } catch { ctx = null; engine = null; }
    return engine;
  }
  const play = name => (...args) => {
    const e = ready();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (e) e[name](...args);
  };
  return {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('kartenwert.packton', muted ? 'aus' : 'an'); } catch { /* egal */ }
      if (engine) engine.master.gain.value = muted ? 0 : .9;
    },
    tearing: play('tearing'), rip: play('rip'), thud: play('thud'), rustle: play('rustle'), slide: play('slide'),
    crumple: play('crumple'), whoosh: play('whoosh'), riffle: play('riffle'), flick: play('flick'), flip: play('flip'),
    reveal: play('reveal'), tick: play('tick'),
    stopRip: () => { if (engine) engine.stopRip(); },
    stop() {
      if (ctx) { try { ctx.close(); } catch { /* egal */ } }
      ctx = null; engine = null;
    },
  };
}
