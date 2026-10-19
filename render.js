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

  // sprite cache: one canvas per (color, eye state, pixel size)
  const cache = new Map();
  function sprite(c, eyes, px) {
    const key = c + eyes + px;
    let cv = cache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d'), s = px, base = COLORS[c];
    const pad = s * 0.05;
    roundRect(g, pad, pad, s - 2 * pad, s - 2 * pad, s * 0.42);
    const grad = g.createLinearGradient(0, pad, 0, s - pad);
    grad.addColorStop(0, shade(base, c === 9 ? -0.05 : -0.18)); grad.addColorStop(1, shade(base, c === 9 ? -0.4 : -0.6));
    g.fillStyle = grad; g.fill();
    g.lineWidth = Math.max(1, s * 0.045); g.strokeStyle = shade(base, 0.15); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; // glossy highlight
    g.beginPath(); g.ellipse(s * 0.36, s * 0.24, s * 0.2, s * 0.08, -0.3, 0, Math.PI * 2); g.fill();
    // capsule eyes (two tall rounded rectangles)
    const ew = s * 0.13, eh = s * 0.34, ey = s * 0.33;
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    if (c === 9) { // garbage: sleepy closed eyes
      g.lineWidth = s * 0.06; g.lineCap = 'round';
      for (const ex of [0.34, 0.66]) { g.beginPath(); g.arc(s * ex, s * 0.5, s * 0.08, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    } else if (eyes === 'c') { // blink
      for (const ex of [0.34, 0.66]) { roundRect(g, s * ex - ew / 2, s * 0.5, ew, s * 0.06, s * 0.03); g.fill(); }
    } else {
      g.shadowColor = shade(base, 0.4); g.shadowBlur = s * 0.12;
      for (const ex of [0.34, 0.66]) { roundRect(g, s * ex - ew / 2, ey, ew, eh, ew / 2); g.fill(); }
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
      const bw = cs * 0.5;
      for (let y = 0; y < VIS; y++) for (let x = 0; x < W; x++) {
        const i = L.idx(x, y), c = b[i];
        if (!L.isColor(c) || hidden.has(i)) continue;
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
        g.globalAlpha = Math.max(0, q.life);
        g.fillStyle = q.col;
        g.beginPath(); g.arc(q.x * cs, q.y * cs, cs * 0.09 * (0.5 + q.life), 0, Math.PI * 2); g.fill();
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

  window.GBRender = { COLORS, sprite, FieldView, drawStrip, roundRect };
})();
