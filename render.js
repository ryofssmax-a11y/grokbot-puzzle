/* Grok Botパズル — canvas drawing (Grok Bot faces, field, previews, particles) */
(function () {
  'use strict';
  const L = GBLogic;
  const COLORS = { 1: '#ff5a6e', 2: '#3d8bff', 3: '#2fd47e', 4: '#ffc53d', 5: '#b46bff', 9: '#9ba1ad' };

  function shade(hex, f) { // f<0 darker, f>0 lighter
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const m = (c) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  const bodyColor = c => shade(COLORS[c], c === 9 ? -0.25 : -0.42);

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---- shapes ----
  const SHAPES = ['round', 'triangle', 'star', 'cloud', 'heart', 'square', 'diamond'];
  const SHAPE_JP = { round: '丸', triangle: '三角', star: '星', cloud: 'くも', heart: 'ハート', square: '四角', diamond: 'ダイヤ' };
  const PER_COLOR = { 1: 'heart', 2: 'round', 3: 'triangle', 4: 'star', 5: 'diamond' };
  let shapeMap = { 1: 'round', 2: 'round', 3: 'round', 4: 'round', 5: 'round' };
  const shapeOf = c => (c === 9 ? 'rock' : shapeMap[c] || 'round');
  function setShapes(mode, custom) {
    shapeMap = mode === 'perColor' ? { ...PER_COLOR } : mode === 'custom' ? { ...PER_COLOR, ...(custom || {}) } : { 1: 'round', 2: 'round', 3: 'round', 4: 'round', 5: 'round' };
  }
  // where the capsule eyes sit for each shape (fractions of the cell)
  const EYES = {
    round: [0.34, 0.66, 0.33, 0.34, 0.13], square: [0.34, 0.66, 0.32, 0.34, 0.13], cloud: [0.36, 0.64, 0.42, 0.28, 0.12],
    heart: [0.35, 0.65, 0.3, 0.3, 0.12], triangle: [0.41, 0.59, 0.5, 0.26, 0.1], star: [0.42, 0.58, 0.42, 0.22, 0.09],
    diamond: [0.4, 0.6, 0.36, 0.28, 0.1], rock: [0.34, 0.66, 0.5, 0.3, 0.13],
  };
  const BRIDGE = { round: 0.5, square: 0.55, cloud: 0.5, heart: 0.4, triangle: 0.3, star: 0.26, diamond: 0.3, rock: 0.5 };

  function roundedPoly(g, pts, r) {
    const n = pts.length;
    g.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    g.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q); g.arcTo(p[0], p[1], m[0], m[1], r); }
    g.closePath();
  }
  function shapePath(g, shape, s) {
    const P = (pts) => pts.map(([x, y]) => [x * s, y * s]);
    switch (shape) {
      case 'square': roundRect(g, s * 0.07, s * 0.07, s * 0.86, s * 0.86, s * 0.16); break;
      case 'triangle': roundedPoly(g, P([[0.5, 0.06], [0.95, 0.9], [0.05, 0.9]]), s * 0.13); break;
      case 'diamond': roundedPoly(g, P([[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]]), s * 0.1); break;
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.23 : 0.49; pts.push([0.5 + Math.cos(a) * rr, 0.55 + Math.sin(a) * rr]); }
        roundedPoly(g, P(pts), s * 0.06); break;
      }
      case 'heart':
        g.beginPath(); g.moveTo(s * 0.5, s * 0.93);
        g.bezierCurveTo(s * 0.12, s * 0.66, s * 0.0, s * 0.42, s * 0.12, s * 0.22);
        g.bezierCurveTo(s * 0.26, s * 0.02, s * 0.46, s * 0.1, s * 0.5, s * 0.24);
        g.bezierCurveTo(s * 0.54, s * 0.1, s * 0.74, s * 0.02, s * 0.88, s * 0.22);
        g.bezierCurveTo(s * 1.0, s * 0.42, s * 0.88, s * 0.66, s * 0.5, s * 0.93);
        g.closePath(); break;
      case 'cloud':
        g.beginPath();
        for (const [x, y, r] of [[0.3, 0.55, 0.22], [0.5, 0.4, 0.27], [0.72, 0.55, 0.22], [0.5, 0.68, 0.24], [0.2, 0.7, 0.15], [0.8, 0.7, 0.15]]) {
          g.moveTo(s * (x + r), s * y); g.arc(s * x, s * y, s * r, 0, Math.PI * 2);
        }
        break;
      case 'rock': roundedPoly(g, P([[0.3, 0.08], [0.72, 0.1], [0.94, 0.38], [0.88, 0.8], [0.6, 0.94], [0.2, 0.9], [0.05, 0.6], [0.1, 0.25]]), s * 0.1); break;
      default: roundRect(g, s * 0.05, s * 0.05, s * 0.9, s * 0.9, s * 0.42);
    }
  }

  // sprite cache: one canvas per (color, eye state, pixel size, shape)
  const cache = new Map();
  function sprite(c, eyes, px, shape) {
    shape = shape || shapeOf(c);
    const key = c + eyes + px + shape;
    let cv = cache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d'), s = px, base = COLORS[c];
    g.lineJoin = 'round';
    shapePath(g, shape, s);
    g.lineWidth = Math.max(1.5, s * 0.08); g.strokeStyle = shade(base, 0.15); g.stroke(); // rim (outside only once filled over)
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, shade(base, c === 9 ? -0.05 : -0.18)); grad.addColorStop(1, shade(base, c === 9 ? -0.4 : -0.6));
    g.fillStyle = grad; g.fill();
    g.save(); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.18)'; // glossy highlight
    g.beginPath(); g.ellipse(s * 0.36, s * 0.24, s * 0.2, s * 0.08, -0.3, 0, Math.PI * 2); g.fill();
    g.restore();
    const [e1, e2, ey, ehf, ewf] = EYES[shape] || EYES.round, ew = s * ewf, eh = s * ehf;
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    if (c === 9) { // garbage: sleepy closed eyes
      g.lineWidth = s * 0.06; g.lineCap = 'round';
      for (const ex of [e1, e2]) { g.beginPath(); g.arc(s * ex, s * ey, s * 0.08, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    } else if (eyes === 'c') { // blink
      for (const ex of [e1, e2]) { roundRect(g, s * ex - ew / 2, s * (ey + ehf / 2), ew, s * 0.06, s * 0.03); g.fill(); }
    } else {
      g.shadowColor = shade(base, 0.4); g.shadowBlur = s * 0.12;
      for (const ex of [e1, e2]) { roundRect(g, s * ex - ew / 2, s * ey, ew, eh, ew / 2); g.fill(); }
    }
    cache.set(key, cv);
    return cv;
  }

  function blinking(seed, now) { return ((now / 1000 + seed * 0.37) % 4.3) < 0.13; }
  const easeIn = t => t * t;

  class FieldView {
    constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.cs = 30; }
    resize(cs) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cs = cs; this.dpr = dpr;
      this.cv.width = Math.round(L.W * cs * dpr); this.cv.height = Math.round(L.VIS * cs * dpr);
      this.cv.style.width = L.W * cs + 'px'; this.cv.style.height = L.VIS * cs + 'px';
    }
    sy(y) { return (L.VIS - 1 - y) * this.cs; }
    piece(c, x, y, now, sx = 1, sy = 1, alpha = 1, seed = 0) {
      const g = this.g, cs = this.cs;
      const img = sprite(c, blinking(seed, now) ? 'c' : 'o', Math.round(cs * this.dpr));
      const w = cs * sx, h = cs * sy;
      g.globalAlpha = alpha;
      g.drawImage(img, x * cs + (cs - w) / 2, this.sy(y) + (cs - h), w, h);
      g.globalAlpha = 1;
    }
    draw(p, now) {
      const g = this.g, cs = this.cs, W = L.W, VIS = L.VIS;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, W * cs, VIS * cs);
      // background grid
      g.fillStyle = 'rgba(255,255,255,0.025)';
      for (let x = 0; x < W; x++) for (let y = 0; y < VIS; y++) if ((x + y) % 2) g.fillRect(x * cs, this.sy(y), cs, cs);
      // spawn marker
      g.strokeStyle = 'rgba(255,90,110,0.35)'; g.lineWidth = 2;
      const mx = L.SPAWN_X * cs + cs / 2, my = this.sy(L.SPAWN_Y) + cs / 2, r = cs * 0.18;
      g.beginPath(); g.moveTo(mx - r, my - r); g.lineTo(mx + r, my + r); g.moveTo(mx + r, my - r); g.lineTo(mx - r, my + r); g.stroke();

      const anim = p.anim, b = p.board;
      const hidden = new Set();       // cells drawn specially this frame
      const moving = [];
      if (anim && anim.kind === 'fall') {
        const t = Math.min(1, anim.t / anim.dur);
        for (const m of anim.moves) {
          hidden.add(L.idx(m.x, m.to));
          const prog = Math.min(1, t * anim.dur / Math.max(0.0001, m.dur));
          moving.push({ c: m.c, x: m.x, y: m.from + (m.to - m.from) * easeIn(prog) });
        }
      }
      let pop = null;
      if (anim && anim.kind === 'pop') { pop = anim; for (const c of anim.cells) hidden.add(L.idx(c.x, c.y)); }

      // bridges between connected same-colored resting pieces (merged look)
      for (let y = 0; y < VIS; y++) for (let x = 0; x < W; x++) {
        const i = L.idx(x, y), c = b[i];
        if (!L.isColor(c) || hidden.has(i)) continue;
        const bw = cs * BRIDGE[shapeOf(c)];
        g.fillStyle = bodyColor(c);
        if (x < W - 1 && b[i + 1] === c && !hidden.has(i + 1)) g.fillRect(x * cs + cs / 2, this.sy(y) + (cs - bw) / 2 + cs * 0.05, cs, bw);
        if (y < VIS - 1 && b[i + W] === c && !hidden.has(i + W)) g.fillRect(x * cs + (cs - bw) / 2, this.sy(y) - cs / 2, bw, cs);
      }
      // resting pieces (with landing squish)
      for (let y = 0; y < L.H; y++) for (let x = 0; x < W; x++) {
        const i = L.idx(x, y), c = b[i];
        if (!c || hidden.has(i)) continue;
        let sx = 1, sy = 1;
        const st = p.squish.get(i);
        if (st !== undefined) {
          const t = (now - st) / 220;
          if (t >= 1) p.squish.delete(i);
          else { const k = Math.sin(Math.PI * t); sy = 1 - 0.28 * k; sx = 1 + 0.16 * k; }
        }
        this.piece(c, x, y, now, sx, sy, 1, i + c);
      }
      for (const m of moving) this.piece(m.c, m.x, m.y, now);
      // popping pieces: bounce, flash, shrink
      if (pop) {
        const t = Math.min(1, pop.t / pop.dur);
        for (const c of pop.cells) {
          let s = t < 0.55 ? 1 + 0.28 * Math.sin((t / 0.55) * Math.PI) : 1 - (t - 0.55) / 0.45;
          const jump = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * cs * 0.18 : 0;
          s = Math.max(0.01, s);
          g.save(); g.translate(0, -jump);
          this.piece(c.c, c.x, c.y, now, s, s, 1, 0);
          if (Math.floor(t * 12) % 2 === 0) { // flash
            g.globalAlpha = 0.45; g.fillStyle = '#fff';
            roundRect(g, c.x * cs + cs * (1 - s) / 2, this.sy(c.y) + cs * (1 - s), cs * s, cs * s, cs * s * 0.42); g.fill();
            g.globalAlpha = 1;
          }
          g.restore();
        }
      }
      // falling pair + landing ghost
      if (p.pair) {
        const pr = p.pair, frac = L.shift(b, pr, 0, -1) ? p.fallT : 0;
        const ghost = L.place(b, L.hardDropY(b, pr)).moves;
        for (const m of ghost) {
          g.globalAlpha = 0.35; g.strokeStyle = COLORS[m.c]; g.lineWidth = 2;
          roundRect(g, m.x * cs + cs * 0.22, this.sy(m.to) + cs * 0.22, cs * 0.56, cs * 0.56, cs * 0.25); g.stroke();
          g.globalAlpha = 1;
        }
        const [cx, cy] = L.childPos(pr);
        this.piece(pr.a, pr.x, pr.y - frac, now, 1, 1, 1, 7);
        this.piece(pr.b, cx, cy - frac, now, 1, 1, 1, 3);
        // pivot marker
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath(); g.arc(pr.x * cs + cs / 2, this.sy(pr.y - frac) + cs * 0.9, cs * 0.05, 0, Math.PI * 2); g.fill();
      }
      // particles
      for (const q of p.particles) {
        g.globalAlpha = Math.max(0, Math.min(1, q.life));
        g.fillStyle = q.col;
        if (q.kind === 'conf') {
          g.save(); g.translate(q.x * cs, q.y * cs); g.rotate(q.rot);
          g.fillRect(-cs * 0.09, -cs * 0.045 * Math.abs(Math.cos(q.rot * 2)) - 1, cs * 0.18, cs * 0.09 * Math.abs(Math.cos(q.rot * 2)) + 2);
          g.restore();
        } else {
          g.beginPath(); g.arc(q.x * cs, q.y * cs, cs * (q.size || 0.09) * (0.5 + q.life), 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
      if (p.dead) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W * cs, VIS * cs); }
    }
  }

  // strip above each field: pending garbage (left) and NEXT / NEXT2 pairs (right)
  function drawStrip(cv, cs, pending, next1, next2, now) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = L.W * cs, h = Math.round(cs * 1.6);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const put = (c, x, y, s, seed) => g.drawImage(sprite(c, blinking(seed, now) ? 'c' : 'o', Math.round(s * dpr)), x, y, s, s);
    const s1 = cs * 0.72, s2 = cs * 0.52;
    const x1 = w - s1 - s2 - cs * 0.35, x2 = w - s2 - 2;
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = `700 ${Math.max(8, cs * 0.26)}px system-ui,sans-serif`;
    g.textAlign = 'center';
    if (next1) { put(next1[1], x1, h - 2 * s1 - 2, s1, 11); put(next1[0], x1, h - s1 - 2, s1, 5); }
    if (next2) { put(next2[1], x2, h - 2 * s2 - 2, s2, 2); put(next2[0], x2, h - s2 - 2, s2, 9); }
    g.fillText('NEXT', x1 - cs * 0.45, cs * 0.3);
    // garbage icons: big = 6, small = 1
    let x = 2, n = pending; const big = Math.floor(n / 6), small = n % 6;
    const icons = []; for (let i = 0; i < Math.min(big, 5); i++) icons.push(cs * 0.72);
    for (let i = 0; i < small && icons.length < 7; i++) icons.push(cs * 0.42);
    for (const s of icons) { put(9, x, h - s - 4, s, 0); x += s + 1; }
    if (big > 5) { g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText('×' + pending, x + 2, h - 6); }
  }

  window.GBRender = { COLORS, SHAPES, SHAPE_JP, PER_COLOR, sprite, shapeOf, setShapes, FieldView, drawStrip, roundRect };
})();
