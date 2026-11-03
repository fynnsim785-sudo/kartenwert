// Pack öffnen als echte 3D-Szene (WebGL2): Folie mit Glanz, Riss der dem Finger folgt, Karten, Licht und Fetzen.
// Ohne WebGL2 oder bei "weniger Bewegung" bleibt es bei der einfachen Fassung in packs.js.
import { makeSound } from './packsound.js';

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PW = 1, PH = 1.62, CW = .86, CH = 1.204, TEAR = .1;
const TEAR_Y = (.5 - TEAR) * PH;

const NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return vn(p)*.55+vn(p*2.1+7.)*.3+vn(p*4.3+3.)*.15;}
float tri(float x){return abs(fract(x)-.5)*2.;}
`;

const PACK_VS = `#version 300 es
in vec2 a;
uniform mat4 uVP,uM;
uniform float uSide,uBulge,uOpen,uTear,uDir,uStrip;
out vec2 vUv; out vec3 vP;
void main(){
  vec2 uv=a;
  float ex=1.-pow(abs(2.*uv.x-1.),3.), ey=1.-pow(abs(2.*uv.y-1.),4.);
  vec3 p=vec3((uv.x-.5)*${PW.toFixed(2)},(.5-uv.y)*${PH.toFixed(2)},uSide*uBulge*ex*ey*(1.+.14*sin(uv.x*9.+uv.y*5.)));
  if(uStrip<.5){
    float m=1.-smoothstep(${TEAR.toFixed(2)},.46,uv.y);
    p.z+=uSide*uOpen*m*m*.17*(.25+.75*(1.-pow(abs(2.*uv.x-1.),4.)));
  }else{
    float s=uDir>0.?uv.x:1.-uv.x;
    float pk=max(uTear*1.05-s,0.);
    float ang=min(pk*3.6,2.5);
    float dy=p.y-${TEAR_Y.toFixed(4)};
    p=vec3(p.x+uDir*pk*pk*.1,${TEAR_Y.toFixed(4)}+dy*cos(ang)+pk*pk*.3,p.z+dy*sin(ang)+pk*.2);
  }
  vec4 w=uM*vec4(p,1.);
  vUv=uv; vP=w.xyz;
  gl_Position=uVP*w;
}`;

const PACK_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vP;
uniform sampler2D uFront,uBack;
uniform vec3 uCam,uLight,uGlowCol;
uniform float uSide,uStrip,uTime,uHint,uGlow,uTear,uDir;
out vec4 o;
${NOISE}
void main(){
  float u=vUv.x,v=vUv.y;
  float zig=tri(u*26.)*.012;
  float edge=min(v-zig,(1.-v)-zig);
  float tearAt=${TEAR.toFixed(2)}+.012*tri(u*23.)+.008*(vn(vec2(u*38.,1.))-.5);
  float cut=uStrip<.5?v-tearAt:tearAt-v;
  float d=min(edge,cut);
  float cov=clamp(d/max(fwidth(d),1e-4)+.5,0.,1.);
  if(cov<.02)discard;
  bool outside=(uSide>0.)==gl_FrontFacing;
  vec3 V=normalize(uCam-vP);
  vec3 N=normalize(cross(dFdx(vP),dFdy(vP)));
  if(dot(N,V)<0.)N=-N;
  vec3 alb;
  float crimp=step(v,.075)+step(.925,v);
  if(outside){
    vec2 st=uSide>0.?vUv:vec2(1.-u,v);
    alb=uSide>0.?texture(uFront,st).rgb:texture(uBack,st).rgb;
    float e=.012;
    vec2 q=vUv*vec2(3.2,5.2);
    vec2 g=vec2(fbm(q+vec2(e*20.,0))-fbm(q-vec2(e*20.,0)),fbm(q+vec2(0,e*20.))-fbm(q-vec2(0,e*20.)));
    vec2 q2=vUv*vec2(26.,42.);
    vec2 g2=vec2(vn(q2+vec2(.2,0))-vn(q2-vec2(.2,0)),vn(q2+vec2(0,.2))-vn(q2-vec2(0,.2)));
    N=normalize(N+vec3(g*.42+g2*.05,0.)*(1.-crimp));
    if(crimp>.5)N=normalize(N+vec3(sin(u*260.)*.5,0.,0.));
    // Falten an den Ecken der Versiegelung
    float fold=smoothstep(.13,.075,v)+smoothstep(.87,.925,v);
    N=normalize(N+vec3(0.,sin(u*34.+v*8.)*.14*fold,0.));
    if(uSide<0.){ float seam=smoothstep(.055,.04,abs(u-.5)); N=normalize(N+vec3(sign(u-.5)*seam*.5,0.,0.)); alb*=1.-seam*.18; }
  }else{
    alb=vec3(.74,.77,.8)*(.72+.28*vn(vUv*vec2(240.,7.)));
  }
  vec3 L=normalize(uLight);
  vec3 H=normalize(L+V);
  float diff=max(dot(N,L),0.);
  float spec=pow(max(dot(N,H),0.),70.);
  vec3 R=reflect(-V,N);
  float env=pow(.5+.5*sin(R.x*5.+R.y*3.+1.),9.)+pow(.5+.5*sin(R.y*7.-R.x*2.),14.)*.5;
  vec3 col=alb*(.62+.5*diff)+(spec*.75+env*.13)*mix(vec3(1.),alb,.3);
  // Dunkler zu den Rändern hin, wo die Folie zusammenläuft
  col*=.8+.2*smoothstep(0.,.07,min(u,1.-u));
  // Weiße Risskante
  float torn=step(uDir>0.?u:1.-u,uTear*1.02);
  if(outside)col=mix(col,vec3(.93),smoothstep(.009,.002,cut)*.85*torn);
  // Licht aus der Öffnung
  float nearMouth=exp(-max(v-${TEAR.toFixed(2)},0.)*9.);
  col+=uGlowCol*uGlow*nearMouth*(outside?.3:1.25);
  // Hinweis: läuft die Risslinie entlang
  if(uHint>0.){
    float band=exp(-pow((v-tearAt)*90.,2.));
    float run=exp(-pow((fract(uTime*.55)*1.5-.25-u)*7.,2.));
    col+=vec3(1.)*band*run*uHint*.9;
  }
  o=vec4(col,cov);
}`;

const CARD_VS = `#version 300 es
in vec2 a;
uniform mat4 uVP,uM; uniform float uBend;
out vec2 vUv; out vec3 vP;
void main(){
  vec2 c=a-.5;
  vec3 p=vec3(c.x*${CW.toFixed(3)},-c.y*${CH.toFixed(3)},uBend*(c.x*c.x*.9+c.y*.14));
  vec4 w=uM*vec4(p,1.);
  vUv=a; vP=w.xyz;
  gl_Position=uVP*w;
}`;

const CARD_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vP;
uniform sampler2D uTex,uBack;
uniform vec3 uCam,uLight;
uniform float uDim,uHolo,uTime,uAura;
out vec4 o;
${NOISE}
vec3 rainbow(float h){return .5+.5*cos(6.2831*(h+vec3(0.,.33,.67)));}
void main(){
  vec2 s=vec2(${CW.toFixed(3)},${CH.toFixed(3)});
  vec2 q=abs(vUv-.5)*s-(s*.5-.04);
  float d=length(max(q,0.))+min(max(q.x,q.y),0.)-.04;
  float cov=clamp(-d/max(fwidth(d),1e-4)+.5,0.,1.);
  if(cov<.02)discard;
  vec3 V=normalize(uCam-vP);
  vec3 N=normalize(cross(dFdx(vP),dFdy(vP)));
  if(dot(N,V)<0.)N=-N;
  vec3 col;
  if(gl_FrontFacing){
    col=texture(uTex,vUv).rgb;
    vec3 H=normalize(normalize(uLight)+V);
    float gloss=pow(max(dot(N,H),0.),36.);
    col=col*(.88+.16*max(dot(N,normalize(uLight)),0.))+gloss*.28;
    if(uHolo>0.){
      vec3 R=reflect(-V,N);
      float h=dot(vUv,vec2(1.4,1.))*1.7+R.x*1.6+R.y*1.1;
      float bands=.45+.55*sin(dot(vUv,vec2(21.,-13.))+R.x*14.);
      vec3 foil=rainbow(h)*bands;
      vec2 cell=floor(vUv*vec2(70.,98.));
      float tw=h21(cell);
      float sparkle=step(.965,tw)*pow(.5+.5*sin(uTime*3.5+tw*40.+R.x*22.),8.);
      col+=uHolo*(foil*.2*(col+.12)+sparkle*.9);
    }
  }else{
    col=texture(uBack,vec2(1.-vUv.x,vUv.y)).rgb;
    vec3 H=normalize(normalize(uLight)+V);
    vec3 R=reflect(-V,N);
    float goldMask=smoothstep(.12,.3,col.r-col.b)*smoothstep(.35,.65,col.r);
    float sweep=pow(.5+.5*sin(R.x*9.+R.y*6.+uTime*.7+vUv.y*4.),7.);
    col+=goldMask*(sweep*.9+pow(max(dot(N,H),0.),24.)*.6)*vec3(1.,.86,.5);
    col+=pow(max(dot(N,H),0.),40.)*.12;
    vec2 cell=floor(vUv*vec2(46.,64.));
    float tw=h21(cell+3.);
    col+=goldMask*step(.93,tw)*pow(.5+.5*sin(uTime*4.+tw*50.+R.x*20.),10.)*1.2;
    col+=vec3(1.,.8,.3)*uAura*(.18+.2*sin(uTime*5.))*smoothstep(.0,-.09,d)*smoothstep(-.09,-.0,d)*5.;
  }
  o=vec4(col*uDim,cov);
}`;

const BG_VS = `#version 300 es
out vec2 vN;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vN=p*2.-1.;gl_Position=vec4(vN,0.,1.);}`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 vN;
uniform float uTime,uAspect,uRays,uGlow,uRing,uRingA,uFlash;
uniform vec2 uPos;
uniform vec4 uShadow;
uniform vec3 uTint,uRayCol;
out vec4 o;
${NOISE}
void main(){
  vec2 p=vec2(vN.x*uAspect,vN.y);
  vec2 c=vec2(uPos.x*uAspect,uPos.y);
  float base=exp(-dot(p*vec2(.8,.6),p*vec2(.8,.6))*1.1);
  float neb=fbm(p*1.4+vec2(uTime*.03,-uTime*.02));
  vec3 col=vec3(.012,.015,.02)+uTint*(.12+.2*neb)*base+vec3(.05,.055,.065)*base;
  vec2 r=p-c; float l=length(r); float an=atan(r.y,r.x);
  float rays=pow(vn(vec2(an*5.+3.,uTime*.25)),2.)*.7+pow(vn(vec2(an*13.-5.,-uTime*.4)),3.)*.9;
  col+=uRayCol*uRays*rays*exp(-l*1.25);
  col+=uRayCol*uGlow*exp(-l*l*3.2);
  float ring=exp(-pow((l-uRing)*11.,2.))*uRingA;
  col+=uRayCol*ring;
  vec2 sp=vec2(uShadow.x*uAspect,uShadow.y);
  vec2 sd=(p-sp)/vec2(uShadow.z*uAspect,uShadow.z*.22);
  col*=1.-uShadow.w*exp(-dot(sd,sd)*2.2);
  col+=vec3(uFlash);
  col*=1.-.32*dot(vN,vN)*.5;
  col+=(h21(vN*311.+uTime)-.5)*.012;
  o=vec4(col,1.);
}`;

const SPARK_VS = `#version 300 es
in vec3 aPos; in float aSize; in vec4 aCol; in vec2 aKind;
uniform mat4 uVP; uniform float uPx;
out vec4 vCol; out vec2 vKind;
void main(){vCol=aCol;vKind=aKind;gl_Position=uVP*vec4(aPos,1.);gl_PointSize=aSize*uPx/gl_Position.w;}`;

const SPARK_FS = `#version 300 es
precision highp float;
in vec4 vCol; in vec2 vKind;
out vec4 o;
void main(){
  vec2 c=gl_PointCoord-.5;
  float a;
  if(vKind.x<.5){float d=length(c)*2.;a=pow(max(1.-d,0.),2.2);}
  else{
    float cs=cos(vKind.y),sn=sin(vKind.y);
    vec2 r=vec2(c.x*cs-c.y*sn,c.x*sn+c.y*cs);
    a=step(abs(r.x),.46*abs(cos(vKind.y*1.7))+.06)*step(abs(r.y),.24);
  }
  if(a<=0.)discard;
  o=vCol*vec4(1.,1.,1.,a);
}`;

// ---------- Matrizen ----------
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
  }
  return o;
}
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const S = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
const RX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const RY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const RZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const chain = (...m) => m.reduce(mul, I());
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

// ---------- Weichzeichner für Bewegung ----------
const outCubic = t => 1 - (1 - t) ** 3;
const inCubic = t => t * t * t;
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = t => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const outElastic = t => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Texturen ----------
function loadImage(url) {
  return new Promise(resolve => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 8000);
  });
}

// Vorderseite wie ein echter Booster: Motiv über die ganze Folie, unten schräg nur der Name des Packs.
function drawFront(def, logo, art) {
  const W = 640, H = 1037;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W * .7, H);
  g.addColorStop(0, def.colors[0]); g.addColorStop(1, def.colors[1]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // Motiv: Das Kartenbild ist breit, das Pack hoch. Damit das ganze Pokémon samt Gesicht zu sehen ist, steht das Bild
  // fast in voller Breite in der Mitte. Darüber und darunter füllt dasselbe Bild unscharf die Folie.
  if (art) {
    const ax = art.width * .085, ay = art.height * .11, aw = art.width * .83, ah = art.height * .41;
    x.save();
    x.filter = 'blur(18px) saturate(1.25) brightness(.9)';
    const bw = ah * W / H;
    x.drawImage(art, ax + (aw - bw) / 2, ay, bw, ah, -40, -40, W + 80, H + 80);
    x.restore();
    const sw = aw * .82, sh = ah;
    const dh = W * sh / sw, top = H * .42 - dh / 2;
    const pic = document.createElement('canvas');
    pic.width = W; pic.height = Math.round(dh);
    const px = pic.getContext('2d');
    px.drawImage(art, ax + (aw - sw) / 2, ay, sw, sh, 0, 0, W, pic.height);
    px.globalCompositeOperation = 'destination-in';
    const fade = px.createLinearGradient(0, 0, 0, pic.height);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.1, '#000'); fade.addColorStop(.9, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    px.fillStyle = fade; px.fillRect(0, 0, W, pic.height);
    x.drawImage(pic, 0, top);
  } else {
    x.save();
    x.translate(W / 2, H * .45);
    [-.32, 0, .32].forEach((a, i) => {
      x.save();
      x.rotate(a);
      x.translate((i - 1) * 30, Math.abs(i - 1) * 8);
      x.fillStyle = 'rgba(255,255,255,.2)';
      x.strokeStyle = 'rgba(255,255,255,.65)';
      x.lineWidth = 5;
      x.beginPath(); x.roundRect(-58, -82, 116, 164, 10); x.fill(); x.stroke();
      x.restore();
    });
    x.restore();
  }
  // Farbschleier unten in den Setfarben, damit der Name lesbar bleibt
  const veil = x.createLinearGradient(0, H * .66, 0, H);
  veil.addColorStop(0, 'rgba(0,0,0,0)'); veil.addColorStop(1, def.colors[1]);
  x.fillStyle = veil; x.fillRect(0, H * .66, W, H * .34);
  x.save();
  x.translate(W / 2, H * .82);
  x.rotate(-.05);
  if (logo) {
    const s = Math.min(W * .86 / logo.width, H * .18 / logo.height);
    const w = logo.width * s, h = logo.height * s;
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
    x.drawImage(logo, -w / 2, -h / 2, w, h);
  } else {
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 84;
    x.font = `italic 900 ${size}px Lato, system-ui, sans-serif`;
    while (x.measureText(def.name).width > W * .84 && size > 36) { size -= 4; x.font = `italic 900 ${size}px Lato, system-ui, sans-serif`; }
    x.lineJoin = 'round';
    x.lineWidth = 12; x.strokeStyle = '#10204f'; x.strokeText(def.name, 0, 0);
    x.fillStyle = '#fff'; x.fillText(def.name, 0, 0);
  }
  x.restore();
  return c;
}

function drawBack(def) {
  const W = 512, H = 830;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, def.colors[1]); g.addColorStop(1, def.colors[0]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.textAlign = 'center';
  x.font = '700 26px Lato, system-ui, sans-serif';
  x.fillText(def.name, W * .25, H * .46);
  x.font = '500 20px Lato, system-ui, sans-serif';
  x.fillText(`${def.count} cards`, W * .25, H * .5);
  x.fillText('KartenWert', W * .75, H * .48);
  return c;
}

// Rückseite der verdeckten Karten: Nachtblau mit Goldprägung, Guilloche-Muster wie auf Geldscheinen und Wappen in der Mitte.
function drawCardBack() {
  const W = 512, H = 717;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const gold = (y0, y1) => {
    const gr = x.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#fff4c2'); gr.addColorStop(.35, '#f0c45a'); gr.addColorStop(.6, '#b07a22'); gr.addColorStop(1, '#f6d77c');
    return gr;
  };
  // Grund
  const base = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * .7);
  base.addColorStop(0, '#16385a'); base.addColorStop(.55, '#0b1d33'); base.addColorStop(1, '#050c17');
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  // Rand
  x.fillStyle = gold(0, H);
  x.beginPath(); x.roundRect(10, 10, W - 20, H - 20, 26); x.fill();
  x.fillStyle = base;
  x.beginPath(); x.roundRect(22, 22, W - 44, H - 44, 18); x.fill();
  x.strokeStyle = 'rgba(240,196,90,.55)'; x.lineWidth = 2;
  x.beginPath(); x.roundRect(34, 34, W - 68, H - 68, 12); x.stroke();
  // Guilloche: viele feine Wellenkreise
  x.save();
  x.beginPath(); x.roundRect(36, 36, W - 72, H - 72, 10); x.clip();
  x.translate(W / 2, H / 2);
  for (let k = 0; k < 26; k++) {
    x.strokeStyle = k % 2 ? 'rgba(240,196,90,.16)' : 'rgba(120,200,220,.12)';
    x.lineWidth = 1.2;
    x.beginPath();
    const r0 = 70 + k * 11, amp = 9 + (k % 5) * 3, lobes = 12 + (k % 3) * 6;
    for (let i = 0; i <= 720; i++) {
      const t = i / 720 * Math.PI * 2;
      const r = r0 + amp * Math.sin(lobes * t + k * .7);
      const px = Math.cos(t) * r * .82, py = Math.sin(t) * r * 1.12;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.stroke();
  }
  // Strahlen hinter dem Wappen
  for (let i = 0; i < 32; i++) {
    x.rotate(Math.PI * 2 / 32);
    x.fillStyle = i % 2 ? 'rgba(240,196,90,.22)' : 'rgba(240,196,90,.07)';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-9, -170); x.lineTo(9, -170); x.fill();
  }
  x.restore();
  // Eckverzierungen
  const corner = (cx, cy, sx, sy) => {
    x.save(); x.translate(cx, cy); x.scale(sx, sy);
    x.strokeStyle = gold(-30, 30); x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 46); x.quadraticCurveTo(0, 0, 46, 0); x.stroke();
    x.fillStyle = gold(-10, 10);
    x.beginPath(); x.moveTo(16, 6); x.lineTo(22, 16); x.lineTo(16, 26); x.lineTo(10, 16); x.closePath(); x.fill();
    x.restore();
  };
  corner(46, 46, 1, 1); corner(W - 46, 46, -1, 1); corner(46, H - 46, 1, -1); corner(W - 46, H - 46, -1, -1);
  // Wappen
  x.save();
  x.translate(W / 2, H / 2);
  x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 22;
  x.fillStyle = gold(-118, 118);
  x.beginPath(); x.arc(0, 0, 118, 0, Math.PI * 2); x.fill();
  x.shadowBlur = 0;
  const inner = x.createRadialGradient(-20, -30, 10, 0, 0, 110);
  inner.addColorStop(0, '#1d4f78'); inner.addColorStop(1, '#081628');
  x.fillStyle = inner;
  x.beginPath(); x.arc(0, 0, 104, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(240,196,90,.7)'; x.lineWidth = 2;
  x.beginPath(); x.arc(0, 0, 94, 0, Math.PI * 2); x.stroke();
  // Sterne im Ring
  x.fillStyle = gold(-100, 100);
  for (let i = 0; i < 12; i++) {
    const t = i / 12 * Math.PI * 2 - Math.PI / 2;
    x.save(); x.translate(Math.cos(t) * 82, Math.sin(t) * 82); x.rotate(t);
    x.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.4 : 6; const a = k / 10 * Math.PI * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.fill(); x.restore();
  }
  x.font = '900 120px Lato, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#3d2608';
  x.strokeText('K', 0, 6);
  x.fillStyle = gold(-55, 60);
  x.fillText('K', 0, 6);
  x.restore();
  x.fillStyle = gold(H - 120, H - 80);
  x.font = '800 22px Lato, system-ui, sans-serif';
  x.textAlign = 'center';
  x.fillText('K A R T E N W E R T', W / 2, H - 92);
  x.fillText('★  ★  ★', W / 2, 104);
  return c;
}

function drawPlainCard(card) {
  const c = document.createElement('canvas');
  c.width = 430; c.height = 602;
  const x = c.getContext('2d');
  x.fillStyle = '#20262a'; x.fillRect(0, 0, 430, 602);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = '700 30px Lato, system-ui, sans-serif';
  x.fillText(card.name, 215, 300, 390);
  return c;
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// Startet die Szene. Gibt false zurück, wenn dieses Gerät sie nicht zeigen kann.
export async function playPackGL({ def, cards, paid, isHit, summary, onClose }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const box = document.createElement('div');
  box.id = 'packopen';
  box.className = 'gl';
  box.innerHTML = `
    <canvas class="pk-gl"></canvas>
    <button class="pk-sound" aria-label="Sound on or off"></button>
    <button class="pk-skip" hidden>Skip</button>
    <p class="pk-hint" hidden>Swipe across the top of the pack to tear it open</p>
    <div class="pk-info" hidden></div>`;
  const canvas = box.querySelector('canvas');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return false;

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const cache = {};
    return { p, u: n => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
  }
  let packP, cardP, bgP, sparkP;
  try {
    packP = compile(PACK_VS, PACK_FS);
    cardP = compile(CARD_VS, CARD_FS);
    bgP = compile(BG_VS, BG_FS);
    sparkP = compile(SPARK_VS, SPARK_FS);
  } catch (e) {
    console.warn('Pack-Animation: einfache Fassung', e);
    return false;
  }

  function texture(source) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }

  function grid(nx, ny, warp = 1) {
    const verts = [], idx = [];
    for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) verts.push(x / nx, (y / ny) ** warp);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const a = y * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vao, count: idx.length };
  }
  for (const pr of [packP, cardP]) { gl.bindAttribLocation(pr.p, 0, 'a'); gl.linkProgram(pr.p); }
  const packMesh = grid(52, 90, 1.5);
  const cardMesh = grid(12, 16);

  // Bilder laden, bevor irgendetwas erscheint.
  const [logo, art, ...images] = await Promise.all([loadImage(def.logo), loadImage(def.art && `${def.art}/high.webp`), ...cards.map(c => loadImage(c.image))]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const texFront = texture(drawFront(def, logo, art));
  const texBack = texture(drawBack(def));
  const texCardBack = texture(drawCardBack());
  const texCards = images.map((img, i) => texture(img || drawPlainCard(cards[i])));

  document.body.appendChild(box);
  document.body.classList.add('noscroll');
  const hint = box.querySelector('.pk-hint');
  const info = box.querySelector('.pk-info');
  const skip = box.querySelector('.pk-skip');
  const soundBtn = box.querySelector('.pk-sound');
  const sfx = makeSound();
  const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z" fill="currentColor"/><path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/></svg>';
  const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z" fill="currentColor"/><path d="M16 9.500l5 5M21 9.500l-5 5"/></svg>';
  const showSound = () => { soundBtn.innerHTML = sfx.muted ? SOUND_OFF : SOUND_ON; };
  showSound();
  soundBtn.addEventListener('pointerdown', e => e.stopPropagation());
  soundBtn.addEventListener('pointerup', e => e.stopPropagation());
  soundBtn.addEventListener('click', () => { sfx.toggle(); showSound(); });
  skip.addEventListener('pointerdown', e => e.stopPropagation());
  skip.addEventListener('pointerup', e => e.stopPropagation());

  // ---------- Szene ----------
  const tint = rgb(def.colors[0]);
  const scene = {
    time: 0, timeScale: 1, shake: 0, zoom: 0,
    rays: 0, glow: 0, ring: 0, ringA: 0, flash: 0, rayCol: [1, .93, .78], hint: 0, mouth: 0,
    px: 0, py: 0, smoothPx: 0, smoothPy: 0,
    pack: { show: true, x: 0, y: -4, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, bulge: .075, open: 0, tear: 0, dir: 1, sway: 0 },
    strip: { free: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0 },
    group: { show: true, x: 0, y: .016, z: 0, s: 1, fan: 0, spread: 0, rx: 0 },
    attached: true, top: 0, dragX: 0, dragY: 0, dragging: false, showCards: false, focusTilt: 0,
    cards: cards.map((c, i) => ({
      // Alle Karten kommen verdeckt aus dem Pack und werden einzeln aufgedeckt
      i, data: c, tex: texCards[i], hit: isHit(c), reveal: true, ry: Math.PI,
      x: 0, y: 0, z: 0, rx: 0, rz: 0, s: 1, bend: 0, free: false, gone: false, vx: 0, vy: 0, vz: 0, wz: 0, wy: 0, holo: 0, aura: 0,
    })),
  };

  // Partikel
  const MAX_SPARKS = 700;
  const sparks = [];
  const sparkData = new Float32Array(MAX_SPARKS * 10);
  const sparkVao = gl.createVertexArray();
  const sparkBuf = gl.createBuffer();
  gl.bindVertexArray(sparkVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sparkData.byteLength, gl.DYNAMIC_DRAW);
  const locs = { aPos: 3, aSize: 1, aCol: 4, aKind: 2 };
  let off = 0;
  for (const [name, n] of Object.entries(locs)) {
    const at = gl.getAttribLocation(sparkP.p, name);
    if (at >= 0) { gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, n, gl.FLOAT, false, 40, off); }
    off += n * 4;
  }
  function spawn(o) {
    if (sparks.length >= MAX_SPARKS) sparks.shift();
    sparks.push({ kind: 0, life: 1, age: 0, size: 30, grav: 0, drag: 1.2, col: [1, 1, 1], spin: 0, wob: 0, ...o });
  }
  function shreds(x, y, z, n, power = 1) {
    const cols = [rgb(def.colors[0]), rgb(def.colors[1]), [.92, .94, .96], [1, 1, 1]];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (.3 + Math.random() * 1.7) * power;
      spawn({
        kind: 1, x: x + (Math.random() - .5) * .9, y, z, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v * 1.15 + .35, vz: (Math.random() - .3) * v,
        life: 1.1 + Math.random() * 1.2, size: 34 + Math.random() * 46, grav: 2.3, drag: 1.5, col: cols[i % 4], spin: Math.random() * 6, wob: 6 + Math.random() * 9,
      });
    }
  }
  function goldBurst(x, y, n, power = 1, cols = [[1, .85, .4], [1, .95, .7], [1, .7, .2], [1, 1, 1]]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (.4 + Math.random() ** 1.6 * 3.4) * power;
      spawn({
        x, y, z: .25, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: (Math.random() - .5) * v * .5,
        life: .6 + Math.random() * .9, size: 20 + Math.random() * 52, grav: .9, drag: 2, col: cols[i % cols.length],
      });
    }
  }

  // Bewegungen
  const tweens = [];
  const tw = (ms, fn, ease = outCubic) => new Promise(res => tweens.push({ t: 0, ms, fn, ease, res }));
  const wait = ms => tw(ms, () => {}, t => t);
  let closed = false, raf = 0, last = performance.now(), dprCap = Math.min(2, devicePixelRatio || 1), slowFrames = 0;
  let width = 0, height = 0, vp = I(), vis = { w: 1, h: 1 }, camD = 5, cam = [0, 0, 5], fit = 1;
  const FOV = 30 * Math.PI / 180;

  function resize() {
    const w = box.clientWidth || innerWidth, h = box.clientHeight || innerHeight;
    const pw = Math.round(w * dprCap), ph = Math.round(h * dprCap);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    width = pw; height = ph;
    const aspect = w / h;
    const visH = Math.max(PH / .56, (PW / .66) / aspect);
    camD = visH / (2 * Math.tan(FOV / 2));
    vis = { h: visH, w: visH * aspect };
    // Karten dürfen größer sein als das Pack, solange unten Platz für den Text bleibt.
    fit = Math.min(.84 * vis.w / CW, .6 * vis.h / CH);
  }
  addEventListener('resize', resize);
  resize();

  const project = (x, y, z) => {
    const m = vp;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [cx / cw, cy / cw];
  };

  function packMatrix() {
    const p = scene.pack;
    return chain(T(p.x, p.y, p.z), RZ(p.rz), RY(p.ry), RX(p.rx), S(p.sx, p.sy, 1));
  }

  function cardMatrix(c) {
    const g = scene.group, n = cards.length;
    if (c.free) return chain(T(c.x, c.y, c.z), S(g.s), RZ(c.rz), RY(c.ry), RX(c.rx));
    const k = c.i - scene.top;
    const fan = g.fan * ((n - 1) / 2 - c.i) / Math.max(1, n - 1) * 1.5;
    const off = T(c.x, c.y - k * g.spread * .013, c.z - k * (.0014 + g.spread * .018));
    // Solange die Karten im Pack stecken, bewegen sie sich mit ihm.
    const p = scene.pack;
    const holder = scene.attached ? chain(T(p.x, p.y, p.z), RZ(p.rz), RY(p.ry), RX(p.rx)) : I();
    return chain(holder, T(g.x, g.y, g.z), RX(g.rx), S(g.s * c.s), T(0, -1.05, 0), RZ(fan), T(0, 1.05, 0), off, RZ(c.rz), RY(c.ry), RX(c.rx));
  }

  function step(dt) {
    scene.time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      t.t += dt * 1000;
      const k = Math.min(1, t.t / t.ms);
      t.fn(t.ease(k), k);
      if (k >= 1) { tweens.splice(i, 1); t.res(); }
    }
    scene.smoothPx += (scene.px - scene.smoothPx) * (1 - Math.exp(-dt * 7));
    scene.smoothPy += (scene.py - scene.smoothPy) * (1 - Math.exp(-dt * 7));
    scene.shake *= Math.exp(-dt * 7);
    scene.flash *= Math.exp(-dt * 6);
    scene.ringA *= Math.exp(-dt * 3.2);
    scene.ring += dt * 2.3;

    const p = scene.pack;
    if (p.sway > 0) {
      p.ry = (Math.sin(scene.time * .9) * .13 + scene.smoothPx * .55) * p.sway + (1 - p.sway) * p.ry;
      p.rx = (Math.sin(scene.time * .7) * .05 - scene.smoothPy * .4) * p.sway + (1 - p.sway) * p.rx;
      p.y = Math.sin(scene.time * 1.5) * .018 * p.sway + (1 - p.sway) * p.y;
    }
    const st = scene.strip;
    if (st.free) {
      st.vy -= 3.7 * dt;
      st.vx *= Math.exp(-dt * .5); st.vz *= Math.exp(-dt * .5);
      st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
      st.rx += st.wx * dt; st.ry += st.wy * dt; st.rz += st.wz * dt;
    }
    // Karten folgen ihrem Platz, die oberste auch dem Finger
    for (const c of scene.cards) {
      if (c.free) {
        c.vy -= 2.6 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rz += c.wz * dt; c.ry += c.wy * dt;
        if (Math.abs(c.x) > vis.w * 1.1 || c.y < -vis.h) c.gone = true;
      }
    }
    const top = scene.cards[scene.top];
    if (top && !top.free && scene.deal) {
      const k = 1 - Math.exp(-dt * (scene.dragging ? 28 : 11));
      top.x += (scene.dragX - top.x) * k;
      top.y += (scene.dragY - top.y) * k;
      const tiltY = scene.dragging ? top.x * .34 : scene.smoothPx * .5 + Math.sin(scene.time * 1.1) * .07;
      const tiltX = scene.dragging ? 0 : -scene.smoothPy * .4 + Math.cos(scene.time * .9) * .045;
      top.rz += ((scene.dragging ? -top.x * .2 : 0) - top.rz) * k;
      if (!top.flipping) top.ry += ((top.reveal && !top.flipped ? Math.PI : 0) + tiltY - top.ry) * k;
      top.rx += (tiltX - top.rx) * k;
      top.bend = top.x * .22;
    }
    if (scene.tease) {
      scene.teaseT = (scene.teaseT || 0) + dt;
      if (scene.teaseT > 1.9) {
        scene.teaseT = 0;
        for (let i = 0; i < 9; i++) spawn({ x: p.x + (Math.random() - .5) * PW * .9, y: p.y + TEAR_Y + .02, z: .06, vx: (Math.random() - .5) * .4, vy: .25 + Math.random() * .5, life: .7 + Math.random() * .6, size: 14 + Math.random() * 20, drag: 1.2, col: [1, .85, .4] });
        tw(360, (t, raw) => { p.rz = Math.sin(raw * Math.PI * 6) * (1 - raw) * .035; }, k => k);
        sfx.rustle(.5);
      }
    }
    // Staub schwebt immer ein wenig
    if (Math.random() < dt * 9) {
      spawn({ x: (Math.random() - .5) * vis.w, y: -vis.h * .55, z: -1 + Math.random() * 1.2, vx: (Math.random() - .5) * .08, vy: .16 + Math.random() * .22, life: 5 + Math.random() * 4, size: 7 + Math.random() * 16, drag: 0, col: [.55 + tint[0] * .3, .55 + tint[1] * .3, .55 + tint[2] * .3], ambient: true });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vy -= s.grav * dt;
      const dr = Math.exp(-dt * s.drag);
      s.vx *= dr; s.vy *= dr; s.vz *= dr;
      s.x += s.vx * dt + (s.wob ? Math.sin(scene.time * s.wob + s.spin) * dt * .35 : 0);
      s.y += s.vy * dt; s.z += s.vz * dt;
      s.spin += (s.wob || 0) * dt;
    }
  }

  function render() {
    resize();
    gl.viewport(0, 0, width, height);
    const aspect = width / height;
    const shakeX = (Math.random() - .5) * scene.shake * .09, shakeY = (Math.random() - .5) * scene.shake * .09;
    const camY = -vis.h * .055 + shakeY;
    cam = [shakeX + scene.smoothPx * .03, camY - scene.smoothPy * .03, camD - scene.zoom];
    vp = mul(perspective(FOV, aspect, .1, 60), T(-cam[0], -cam[1], -cam[2]));
    const light = [scene.smoothPx * 2.2 + Math.sin(scene.time * .6) * .7, .9 - scene.smoothPy * 1.6, 2.1];

    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // Hintergrund
    gl.useProgram(bgP.p);
    const focus = scene.deal ? project(0, scene.group.y, 0) : project(scene.pack.x, scene.pack.y + TEAR_Y * scene.pack.sy, 0);
    gl.uniform1f(bgP.u('uTime'), scene.time);
    gl.uniform1f(bgP.u('uAspect'), aspect);
    gl.uniform1f(bgP.u('uRays'), scene.rays);
    gl.uniform1f(bgP.u('uGlow'), scene.glow);
    gl.uniform1f(bgP.u('uRing'), scene.ring);
    gl.uniform1f(bgP.u('uRingA'), scene.ringA);
    gl.uniform1f(bgP.u('uFlash'), scene.flash);
    gl.uniform2f(bgP.u('uPos'), focus[0], focus[1]);
    const shadowAt = scene.deal ? project(0, scene.group.y - CH * scene.group.s * .5 - .1, -.3) : project(scene.pack.x, scene.pack.y - PH * .5 - .1, -.3);
    const shadowW = scene.deal ? CW * scene.group.s / vis.w * 1.1 : PW / vis.w * 1.2;
    gl.uniform4f(bgP.u('uShadow'), shadowAt[0], shadowAt[1], shadowW, scene.pack.show && scene.pack.y > -1 ? .5 : scene.deal ? .35 : 0);
    gl.uniform3fv(bgP.u('uTint'), tint);
    gl.uniform3fv(bgP.u('uRayCol'), scene.rayCol);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    // Pack: Vorder- und Rückseite, je Körper und Streifen
    const p = scene.pack;
    gl.useProgram(packP.p);
    gl.bindVertexArray(packMesh.vao);
    gl.uniformMatrix4fv(packP.u('uVP'), false, vp);
    gl.uniform3fv(packP.u('uCam'), cam);
    gl.uniform3fv(packP.u('uLight'), light);
    gl.uniform3fv(packP.u('uGlowCol'), scene.rayCol);
    gl.uniform1f(packP.u('uTime'), scene.time);
    gl.uniform1f(packP.u('uBulge'), p.bulge);
    gl.uniform1f(packP.u('uOpen'), p.open);
    gl.uniform1f(packP.u('uTear'), p.tear);
    gl.uniform1f(packP.u('uDir'), p.dir);
    gl.uniform1f(packP.u('uGlow'), scene.mouth);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texFront);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texBack);
    gl.uniform1i(packP.u('uFront'), 0);
    gl.uniform1i(packP.u('uBack'), 1);
    if (p.show) {
      const mBody = packMatrix();
      gl.uniformMatrix4fv(packP.u('uM'), false, mBody);
      gl.uniform1f(packP.u('uStrip'), 0);
      gl.uniform1f(packP.u('uHint'), scene.hint);
      for (const side of [-1, 1]) {
        gl.uniform1f(packP.u('uSide'), side);
        gl.drawElements(gl.TRIANGLES, packMesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    const st = scene.strip;
    if (p.show || st.free) {
      const mStrip = st.free ? chain(T(st.x, st.y, st.z), RZ(st.rz), RY(st.ry), RX(st.rx), T(0, -TEAR_Y, 0)) : packMatrix();
      gl.uniformMatrix4fv(packP.u('uM'), false, mStrip);
      gl.uniform1f(packP.u('uStrip'), 1);
      gl.uniform1f(packP.u('uHint'), st.free ? 0 : scene.hint);
      for (const side of [-1, 1]) {
        gl.uniform1f(packP.u('uSide'), side);
        gl.drawElements(gl.TRIANGLES, packMesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }

    // Karten von hinten nach vorn
    if (scene.showCards) {
      gl.useProgram(cardP.p);
      gl.bindVertexArray(cardMesh.vao);
      gl.uniformMatrix4fv(cardP.u('uVP'), false, vp);
      gl.uniform3fv(cardP.u('uCam'), cam);
      gl.uniform3fv(cardP.u('uLight'), light);
      gl.uniform1f(cardP.u('uTime'), scene.time);
      gl.uniform1i(cardP.u('uTex'), 0);
      gl.uniform1i(cardP.u('uBack'), 1);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texCardBack);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = scene.cards.length - 1; i >= 0; i--) {
        const c = scene.cards[i];
        if (c.gone) continue;
        gl.uniformMatrix4fv(cardP.u('uM'), false, cardMatrix(c));
        gl.bindTexture(gl.TEXTURE_2D, c.tex);
        gl.uniform1f(cardP.u('uBend'), c.bend);
        gl.uniform1f(cardP.u('uHolo'), c.holo);
        gl.uniform1f(cardP.u('uAura'), c.aura);
        const k = c.i - scene.top;
        gl.uniform1f(cardP.u('uDim'), c.free || k <= 0 ? 1 : Math.max(.62, 1 - k * .1 * scene.group.spread));
        // Sobald das Pack weg ist, zählt nur die Reihenfolge, sonst schneiden sich gekippte Karten mit der nächsten.
        if (c.free || scene.deal) gl.disable(gl.DEPTH_TEST);
        gl.drawElements(gl.TRIANGLES, cardMesh.count, gl.UNSIGNED_SHORT, 0);
        if (c.free || scene.deal) gl.enable(gl.DEPTH_TEST);
      }
    }

    // Funken und Fetzen
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(sparkP.p);
    let n = 0;
    for (const s of sparks) {
      const left = 1 - s.age / s.life;
      const a = s.ambient ? Math.min(left * 3, 1) * Math.min(s.age, 1) * .22 : Math.min(left * 2, 1) * (s.kind ? .55 + .45 * Math.sin(s.spin * 1.5) : 1);
      sparkData.set([s.x, s.y, s.z, s.size, s.col[0], s.col[1], s.col[2], Math.max(a, 0), s.kind, s.spin], n * 10);
      n++;
    }
    gl.uniformMatrix4fv(sparkP.u('uVP'), false, vp);
    gl.uniform1f(sparkP.u('uPx'), height / 800 * 1.0);
    gl.bindVertexArray(sparkVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sparkData.subarray(0, n * 10));
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function frame(now) {
    if (closed) return;
    const raw = (now - last) / 1000;
    last = now;
    // Langsame Geräte bekommen weniger Bildpunkte, damit es flüssig bleibt.
    if (raw > .034) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 28 && dprCap > 1) { dprCap = Math.max(1, dprCap - .5); slowFrames = 0; }
    step(Math.min(raw, .05) * scene.timeScale);
    render();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  let lastRustle = 0;
  function pointerLook(e) {
    const r = box.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width * 2 - 1, ny = (e.clientY - r.top) / r.height * 2 - 1;
    const moved = Math.hypot(nx - scene.px, ny - scene.py);
    scene.px = nx; scene.py = ny;
    const now = performance.now();
    if (scene.pack.sway > .5 && moved > .05 && now - lastRustle > 110) { lastRustle = now; sfx.rustle(Math.min(1, moved * 4)); }
  }
  box.addEventListener('pointermove', pointerLook);

  function finish() {
    closed = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    sfx.stop();
    box.remove();
    document.body.classList.remove('noscroll');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    onClose();
  }

  // ---------- Ablauf ----------
  async function enter() {
    const p = scene.pack;
    scene.hint = 0;
    tw(1050, (t, raw) => {
      p.y = lerp(-vis.h * .95, 0, t);
      p.ry = lerp(-Math.PI * 3, 0, outCubic(raw));
      p.rz = lerp(-.5, 0, t);
      p.rx = lerp(.5, 0, t);
    }, outBack);
    await wait(700);
    sfx.whoosh();
    await wait(250);
    sfx.thud();
    scene.shake = .55;
    scene.ring = .05; scene.ringA = .35; scene.rayCol = [.8, .85, .95];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = .6 + Math.random() * 1.2;
      spawn({ x: Math.cos(a) * .45, y: Math.sin(a) * .7, z: .1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .5 + Math.random() * .4, size: 14 + Math.random() * 28, drag: 3.4, col: [.8, .85, .95] });
    }
    // Stauchen und zurückfedern
    await tw(320, (t, raw) => {
      const s = Math.sin(raw * Math.PI * 2.2) * (1 - raw) * .05;
      p.sx = 1 + s; p.sy = 1 - s;
    }, t => t);
    p.sx = 1; p.sy = 1;
    tw(500, t => { p.sway = t; }, inOut);
    hint.hidden = false;
    scene.hint = 1;
    scene.tease = scene.cards.some(c => c.hit);
  }

  function waitForTear() {
    return new Promise(resolve => {
      const p = scene.pack;
      let startX = null, target = 0, dragged = false, auto = false, finished = false, lastX = 0;
      const shredAt = () => {
        const s = p.dir > 0 ? p.tear : 1 - p.tear;
        return [p.x + (s - .5) * PW, p.y + TEAR_Y];
      };
      const follow = setInterval(() => {
        if (closed) { clearInterval(follow); return; }
        const before = p.tear;
        p.tear += (target - p.tear) * .34;
        const speed = Math.abs(p.tear - before);
        scene.zoom = p.tear * camD * .05;
        sfx.tearing(Math.min(1, speed * 16), ((p.dir > 0 ? p.tear : 1 - p.tear) - .5) * 1.4);
        scene.mouth = Math.max(scene.mouth, p.tear * .5);
        if (speed > .004) {
          const [x, y] = shredAt();
          for (let i = 0; i < 2; i++) {
            spawn({ kind: 1, x, y, z: .03, vx: (Math.random() - .5) * .8 + p.dir * .5, vy: .5 + Math.random() * 1, vz: Math.random() * .6, life: .7 + Math.random() * .6, size: 24 + Math.random() * 28, grav: 2.4, drag: 1.4, col: Math.random() < .5 ? [.95, .96, .98] : tint, spin: Math.random() * 6, wob: 10 });
          }
          scene.shake = Math.max(scene.shake, speed * 4);
          if (navigator.vibrate && Math.random() < .25) navigator.vibrate(4);
        }
        if (p.tear > .985 && !finished) {
          finished = true;
          clearInterval(follow);
          sfx.stopRip();
          box.removeEventListener('pointerdown', down);
          box.removeEventListener('pointermove', move);
          box.removeEventListener('pointerup', up);
          box.removeEventListener('pointercancel', up);
          p.tear = 1;
          resolve();
        }
      }, 16);
      const down = e => {
        startX = e.clientX; lastX = e.clientX; dragged = false;
        try { box.setPointerCapture(e.pointerId); } catch { /* egal */ }
      };
      const move = e => {
        if (startX == null || auto) return;
        const dx = e.clientX - startX;
        if (!dragged && Math.abs(dx) > 8) {
          dragged = true;
          p.dir = dx > 0 ? 1 : -1;
          scene.hint = 0;
          hint.hidden = true;
          tw(160, t => { p.sway *= 1 - t; }, t => t);
        }
        if (!dragged) return;
        lastX = e.clientX;
        const widthPx = box.clientWidth / vis.w * PW;
        target = Math.max(target, Math.min(1, Math.max(0, dx * p.dir) / (widthPx * 1.05)));
      };
      const up = () => {
        if (startX == null) return;
        startX = null;
        // Antippen oder Loslassen reißt fertig auf.
        if (!dragged) { p.dir = lastX > box.clientWidth / 2 ? -1 : 1; scene.hint = 0; hint.hidden = true; tw(160, t => { p.sway *= 1 - t; }, t => t); }
        auto = true;
        tw(520, t => { target = Math.max(target, t * 1.02); }, inOut);
      };
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
  }

  async function ripOff() {
    const p = scene.pack, st = scene.strip;
    p.sway = 0;
    scene.showCards = true;
    scene.tease = false;
    tw(600, t => { scene.zoom = lerp(scene.zoom, 0, t); }, outCubic);
    // Streifen reißt ab und fliegt weg
    Object.assign(st, {
      free: true, x: p.x, y: p.y + TEAR_Y, z: p.z + .02,
      vx: p.dir * (1.5 + Math.random() * .5), vy: 1.9, vz: 1.1, rx: 0, ry: 0, rz: 0,
      wx: 2 + Math.random() * 2, wy: p.dir * (2 + Math.random() * 3), wz: -p.dir * (3.5 + Math.random() * 2),
    });
    sfx.rip();
    if (navigator.vibrate) navigator.vibrate([22, 28, 14]);
    scene.shake = 1;
    scene.flash = .16;
    const hasHit = scene.cards.some(c => c.hit);
    scene.rayCol = hasHit ? [1, .84, .42] : [.9, .96, 1];
    shreds(p.x, p.y + TEAR_Y, .05, 46, 1.15);
    // Kurz einfrieren, dann wirkt der Riss wuchtiger
    scene.timeScale = .22;
    await tw(110, t => { scene.mouth = lerp(.5, 1, t); }, t => t);
    scene.timeScale = 1;
    tw(420, t => { p.open = t; }, outElastic);
    tw(600, t => { scene.rays = t * .5; scene.glow = t * .38; }, outCubic);
    tw(480, t => { p.rx = t * -.1; p.ry = -p.dir * t * .05; }, inOut);
    await wait(380);
  }

  async function pullOut() {
    const p = scene.pack, g = scene.group;
    const cardsOnly = scene.cards;
    const y0 = g.y;
    const fromRx = p.rx, fromRy = p.ry;
    await tw(160, t => { p.rx = lerp(fromRx, 0, t); p.ry = lerp(fromRy, 0, t); }, inOut);
    scene.attached = false;
    sfx.slide();
    // Stoßweise herausziehen, das Pack rutscht dagegen nach unten
    cardsOnly.forEach((c, i) => { tw(520 + i * 12, t => { c.y = t * (i % 2 ? .012 : -.008) * Math.min(i, 5); c.rz = t * (i % 2 ? .012 : -.012); }, outCubic); });
    await tw(420, t => { g.y = lerp(y0, y0 + .27, t); p.y = lerp(0, -.1, t); scene.mouth = lerp(1, 1.5, t); }, t => outBack(t));
    scene.shake = .35;
    await wait(170);
    sfx.slide();
    await tw(560, t => { cardsOnly.forEach((c, i) => { c.y = -Math.sin(t * Math.PI) * .07 * i / cardsOnly.length; }); g.y = lerp(y0 + .27, y0 + .62, t); p.y = lerp(-.1, -.42, t); scene.rays = lerp(.5, .85, t); scene.glow = lerp(.38, .5, t); }, inOut);
    scene.shake = .25;
    await wait(200);
    // Leeres Pack fällt weg, Karten ziehen nach vorn
    sfx.crumple();
    sfx.whoosh();
    const fall = p.dir;
    tw(760, t => {
      p.y = lerp(-.42, -vis.h * 1.15, t);
      p.rz = fall * t * .9;
      p.rx = lerp(0, -.9, t);
      p.ry = lerp(0, fall * 1.3, t);
    }, inCubic);
    tw(500, t => { scene.mouth = (1 - t) * 1.5; }, t => t);
    const gy = g.y;
    await tw(720, t => { g.y = lerp(gy, 0, t); g.s = lerp(1, fit, t); }, outBack);
    p.show = false;
    cardsOnly.forEach(c => { c.y = 0; c.rz = 0; });
    tw(500, t => { scene.rays = lerp(.85, .22, t); scene.glow = lerp(.5, .16, t); }, outCubic);
    // Fächer auf, damit man alle Karten einmal sieht, und wieder zu
    await wait(70);
    sfx.riffle(cards.length, 40);
    const fanS = fit * Math.min(.72, .62 * vis.w / (CW * fit * 1.5));
    await tw(460, t => { g.fan = t; g.rx = -t * .08; g.s = lerp(fit, fanS, t); g.y = lerp(0, .2, t); }, outBack);
    goldBurst(0, 0, 24, .7, [scene.rayCol]);
    await wait(240);
    sfx.riffle(cards.length, 24);
    await tw(300, t => { g.fan = 1 - t; g.rx = -.08 * (1 - t); g.s = lerp(fanS, fit, t); g.y = lerp(.2, 0, t); }, inOut);
    tw(320, t => { g.spread = t; }, outBack);
    scene.deal = true;
  }

  function countUp(el, to, ms) {
    const t0 = performance.now();
    const tick = now => {
      if (closed || !el.isConnected) return;
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = money.format(to * outCubic(k));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showInfo(c, covered) {
    info.hidden = false;
    info.classList.remove('in'); void info.offsetWidth; info.classList.add('in');
    if (covered) {
      const label = c.hit ? 'Something special …' : c.i === cards.length - 1 ? 'The last card' : `Card ${c.i + 1} of ${cards.length}`;
      info.innerHTML = `<b class="pk-name">${label}</b><span class="pk-sub">Tap to reveal</span>`;
      return;
    }
    const i = c.i;
    info.innerHTML = `<b class="pk-name">${esc(c.data.name)}</b>
      <span class="pk-sub">${[c.data.rarity, c.data.set].filter(Boolean).map(esc).join(' · ')}</span>
      <b class="pk-price ${c.hit ? 'hit' : ''}">${c.data.price ? money.format(c.data.price) : 'No price'}</b>
      <span class="pk-sub">${i + 1} of ${cards.length} · Swipe or tap</span>`;
    if (c.hit && c.data.price) countUp(info.querySelector('.pk-price'), c.data.price, 900);
  }

  async function flip(c) {
    c.flipping = true;
    info.hidden = true;
    c.aura = 0;
    // Anlauf: Die Karte zieht sich zurück, dann dreht sie sich
    await tw(190, t => { c.s = lerp(1, .92, t); c.ry = Math.PI + t * .25; }, inOut);
    sfx.flip();
    sfx.reveal(c.hit);
    if (navigator.vibrate) navigator.vibrate(c.hit ? [30, 40, 70] : 25);
    tw(560, t => { c.s = lerp(.92, c.hit ? 1.06 : 1.02, t); }, outBack);
    await tw(560, t => { c.ry = lerp(Math.PI + .25, 0, t); }, outBack);
    c.flipped = true;
    c.flipping = false;
    if (c.hit) {
      scene.rayCol = [1, .84, .42];
      scene.flash = .4;
      scene.shake = .9;
      scene.ring = .1; scene.ringA = 1;
      goldBurst(0, 0, 130, 1.2);
      tw(650, (t, raw) => { scene.zoom = Math.sin(raw * Math.PI) * camD * .09; }, t => t);
      tw(500, t => { c.holo = t; }, outCubic);
      tw(700, t => { scene.rays = lerp(.22, 1.1, t); scene.glow = lerp(.16, .42, t); }, outCubic);
      scene.timeScale = .35;
      await wait(70);
      scene.timeScale = 1;
    } else {
      scene.ring = .1; scene.ringA = .45;
      goldBurst(0, 0, 30, .7, [scene.rayCol]);
    }
  }

  function deal() {
    return new Promise(resolve => {
      let busy = false, startX = null, startY = null, moved = false;
      const worldPerPx = () => vis.w / box.clientWidth;
      const enterCard = () => {
        const c = scene.cards[scene.top];
        c.x = 0; c.y = 0;
        scene.dragX = 0; scene.dragY = 0;
        if (c.reveal && !c.flipped) {
          c.aura = c.hit ? 1 : c.i === cards.length - 1 ? .35 : 0;
          showInfo(c, true);
          // Goldener Schimmer, der ankündigt, dass es gut wird
          if (c.hit) {
            scene.rayCol = [1, .84, .42];
            tw(500, t => { scene.rays = lerp(.22, .6, t); scene.glow = lerp(.16, .32, t); }, outCubic);
            for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; spawn({ x: Math.cos(a) * .7 * fit, y: Math.sin(a) * .9 * fit, z: .2, vx: Math.cos(a) * .15, vy: .35 + Math.random() * .4, life: 1 + Math.random(), size: 16 + Math.random() * 24, drag: .3, col: [1, .85, .4] }); }
          }
        } else {
          tw(320, t => { scene.rays = lerp(scene.rays, c.hit ? .9 : .22, t); scene.glow = lerp(scene.glow, c.hit ? .34 : .16, t); }, t => t);
          showInfo(c, false);
        }
      };
      const throwCard = async (dir, power = 1) => {
        if (busy) return;
        busy = true;
        const c = scene.cards[scene.top], g = scene.group;
        const m = cardMatrix(c);
        c.x = m[12]; c.y = m[13]; c.z = m[14];
        c.free = true;
        c.vx = dir * (vis.w * 1.5) * power;
        c.vy = .9 + Math.abs(scene.dragY) * 2;
        c.vz = .9;
        c.wz = -dir * 3.4;
        c.wy = dir * 3.2;
        sfx.flick();
        c.holo = c.holo * .6;
        scene.dragging = false;
        scene.dragX = 0; scene.dragY = 0;
        await wait(110);
        scene.top++;
        if (scene.top >= scene.cards.length) {
          stop();
          await wait(180);
          resolve();
          return;
        }
        g.spread = g.spread; // Stapel bleibt, die nächste rückt nach
        const next = scene.cards[scene.top];
        tw(260, t => { next.s = lerp(.96, 1, t); }, outBack);
        enterCard();
        busy = false;
      };
      const down = e => {
        startX = e.clientX; startY = e.clientY; moved = false;
        try { box.setPointerCapture(e.pointerId); } catch { /* egal */ }
      };
      const move = e => {
        if (startX == null || busy) return;
        const c = scene.cards[scene.top];
        if (!c || (c.reveal && !c.flipped)) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.abs(dx) > 6) moved = true;
        if (!moved) return;
        scene.dragging = true;
        scene.dragX = dx * worldPerPx() / scene.group.s * 1.1;
        scene.dragY = -dy * worldPerPx() / scene.group.s * .5;
      };
      const up = async e => {
        if (startX == null || busy) return;
        const dx = e.clientX - startX;
        startX = null;
        const c = scene.cards[scene.top];
        if (!c) return;
        if (c.reveal && !c.flipped) {
          if (c.flipping) return;
          busy = true;
          await flip(c);
          showInfo(c, false);
          busy = false;
          return;
        }
        if (moved && Math.abs(dx) < box.clientWidth * .16) {
          // Nicht weit genug: Karte federt zurück.
          scene.dragging = false; scene.dragX = 0; scene.dragY = 0;
          return;
        }
        throwCard(moved ? Math.sign(dx) : 1, moved ? 1.2 : 1);
      };
      const stop = () => {
        box.removeEventListener('pointerdown', down);
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
      };
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
      skip.hidden = false;
      skip.onclick = () => { stop(); resolve(); };
      enterCard();
    });
  }

  (async () => {
    await enter();
    await waitForTear();
    await ripOff();
    await pullOut();
    await deal();
    // Übersicht liegt über der laufenden Szene.
    scene.showCards = false;
    scene.pack.show = false;
    scene.strip.free = false;
    scene.deal = false;
    tweens.length = 0;
    tw(500, t => { scene.rays = lerp(scene.rays, .16, t); scene.glow = lerp(scene.glow, .1, t); }, t => t);
    info.remove(); skip.remove(); hint.remove();
    summary(box, finish, () => sfx.tick());
  })();
  return true;
}
