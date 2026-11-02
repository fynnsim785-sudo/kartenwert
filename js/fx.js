// Kleine Animationen. Wer weniger Bewegung eingestellt hat, sieht sie nicht.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Zählt einen Betrag sanft hoch oder runter.
export function countTo(el, from, to, format) {
  if (!el) return;
  if (calm() || from === to) { el.textContent = format(to); return; }
  const start = performance.now(), ms = 700;
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
    { transform: `translate(${dx * .35}px,${dy * .15 - 70}px) scale(.85) rotate(-9deg)`, opacity: 1, offset: .45 },
    { transform: `translate(${dx}px,${dy}px) scale(.12) rotate(14deg)`, opacity: .4 },
  ], { duration: 680, easing: 'cubic-bezier(.45,.05,.4,1)' }).onfinish = () => { clone.remove(); bump(); };
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
    card.style.setProperty('--rx', ((.5 - y) * 22).toFixed(2) + 'deg');
    card.style.setProperty('--ry', ((x - .5) * 22).toFixed(2) + 'deg');
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
  const chart = root.querySelector('.chart');
  if (!chart) return;
  chart.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 950, easing: 'cubic-bezier(.3,.7,.2,1)' });
}

// Eingang einer neuen Seite mit Richtung.
export function enterPage(el, direction) {
  el.classList.remove('enter');
  void el.offsetWidth;
  el.classList.add('enter');
  if (calm()) return;
  el.animate([
    { transform: `translateX(${direction * 22}px)`, opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
  ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
