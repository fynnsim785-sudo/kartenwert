// Kleine Animationen. Wer weniger Bewegung eingestellt hat, sieht sie nicht.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Zählt einen Betrag sanft hoch oder runter.
export function countTo(el, from, to, format) {
  if (!el) return;
  if (calm() || from === to) { el.textContent = format(to); return; }
  const start = performance.now(), ms = 300;
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - (1 - t) ** 3;
    if (!el.isConnected) return;
    el.textContent = format(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Lässt eine Karte in die Sammlung fliegen.
export function flyToCollection(img, label) {
  const target = document.querySelector('#nav [data-tab="portfolio"]');
  if (!target) return;
  const bump = () => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
  if (calm() || !img) { bump(); return; }
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const clone = img.cloneNode();
  clone.className = 'flyer';
  Object.assign(clone.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(clone);
  const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2;
  clone.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: .5 },
  ], { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { clone.remove(); bump(); };
  if (label) {
    const tag = document.createElement('div');
    tag.className = 'gainfloat';
    tag.textContent = label;
    Object.assign(tag.style, { left: a.left + a.width / 2 + 'px', top: a.top + 'px' });
    document.body.appendChild(tag);
    tag.addEventListener('animationend', () => tag.remove());
  }
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    Object.assign(s.style, { left: a.left + a.width / 2 + 'px', top: a.top + a.height / 2 + 'px' });
    document.body.appendChild(s);
    const angle = (i / 12) * Math.PI * 2, far = 50 + Math.random() * 60;
    s.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * far}px,${Math.sin(angle) * far}px) scale(.2)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 240, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => s.remove();
  }
}

// Karte kippt mit dem Finger oder der Maus, dazu ein Glanz wie bei Holo-Karten.
export function attachTilt(root) {
  const card = root.querySelector('.holo');
  if (!card || calm()) return;
  const move = e => {
    const r = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    card.style.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg');
    card.style.setProperty('--ry', ((x - .5) * 10).toFixed(2) + 'deg');
    card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    card.classList.add('active');
  };
  const leave = () => {
    card.classList.remove('active');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerdown', move);
  card.addEventListener('pointerleave', leave);
  card.addEventListener('pointerup', leave);
}

// Kurve zeichnet sich von links nach rechts.
export function drawChart(root) {
  if (calm()) return;
  const chart = root.querySelector('.chartwrap');
  if (!chart) return;
  chart.animate([{ clipPath: 'inset(-20px 100% -20px 0)' }, { clipPath: 'inset(-20px -20px -20px 0)' }], { duration: 1050, easing: 'cubic-bezier(.3,.7,.2,1)' });
}

// Abschnitte gleiten beim Scrollen weich ins Bild.
const revealer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('seen'); revealer.unobserve(e.target); }
  }
}, { rootMargin: '0px 0px -30px 0px' }) : null;

export function observeReveal(root) {
  if (!revealer || calm()) return;
  root.querySelectorAll('.head, .shelf, .rows, .banner, .achievements, .sets, .grid').forEach(el => {
    if (el.classList.contains('seen')) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight) { el.classList.add('seen'); return; }
    el.classList.add('reveal');
    revealer.observe(el);
  });
}

// Fenster lässt sich nach unten wegziehen.
export function attachDrag(sheet, onClose) {
  if (!sheet || calm()) return;
  let startY = null, dy = 0;
  sheet.addEventListener('pointerdown', e => {
    if (sheet.scrollTop > 0 || e.target.closest('.holo, input, button')) return;
    startY = e.clientY; dy = 0;
  });
  sheet.addEventListener('pointermove', e => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
    sheet.style.transition = 'none';
  });
  const end = () => {
    if (startY == null) return;
    startY = null;
    sheet.style.transition = '';
    if (dy > 110) onClose();
    else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

// Karte dreht sich aus dem Rahmen an ihren Platz.
export function cardFlight(fromRect, toEl, src) {
  if (calm() || !toEl) return;
  const to = toEl.getBoundingClientRect();
  if (!to.width) return;
  const img = document.createElement('img');
  img.src = src;
  img.className = 'flyer';
  Object.assign(img.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
  document.body.appendChild(img);
  toEl.style.visibility = 'hidden';
  const sx = fromRect.width / to.width, sy = fromRect.height / to.height;
  const dx = fromRect.left - to.left + (fromRect.width - to.width) / 2, dy = fromRect.top - to.top + (fromRect.height - to.height) / 2;
  img.animate([
    { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` },
    { transform: 'translate(0,0) scale(1)' },
  ], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => { img.remove(); toEl.style.visibility = ''; };
}

// Lichtring und Funken im Moment der Erkennung.
export function burst(x, y, colors = ['#3dffb5', '#22d3ff', '#8b5cff', '#ff4fc3']) {
  if (calm()) return;
  const ring = document.createElement('i');
  ring.className = 'ringburst';
  Object.assign(ring.style, { left: x + 'px', top: y + 'px' });
  document.body.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    Object.assign(s.style, { left: x + 'px', top: y + 'px', background: colors[i % colors.length] });
    document.body.appendChild(s);
    const a = (i / 26) * Math.PI * 2 + Math.random() * .3, far = 90 + Math.random() * 130;
    s.animate([
      { transform: 'translate(0,0) scale(1.2)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * far}px,${Math.sin(a) * far}px) scale(.1)`, opacity: 0 },
    ], { duration: 620 + Math.random() * 380, easing: 'cubic-bezier(.08,.75,.25,1)' }).onfinish = () => s.remove();
  }
}

// Eingang einer neuen Seite mit Richtung.
export function enterPage(el, direction) {
  el.classList.remove('enter');
  void el.offsetWidth;
  el.classList.add('enter');
  if (calm()) return;
  el.animate([
    { transform: `translateX(${direction * 8}px)`, opacity: .3 },
    { transform: 'translateX(0)', opacity: 1 },
  ], { duration: 130, easing: 'ease-out' });
}
