/* Grok Botパズル — "juice": shake, flash, chain popups, confetti, fever, banners, toasts.
 * Everything scales with the 演出 setting (flashy / normal / calm) and prefers-reduced-motion. */
(function () {
  'use strict';
  const S = GBSound, R = GBRender;
  const $ = (id) => document.getElementById(id);
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const PRESETS = {
    flashy: { shake: 1, flash: 0.55, punch: true, perCell: 7, cap: 320, confetti: 46, confettiAt: 3, fever: true, slowmo: true },
    normal: { shake: 0.5, flash: 0.3, punch: true, perCell: 5, cap: 180, confetti: 22, confettiAt: 4, fever: true, slowmo: false },
    calm:   { shake: 0, flash: 0, punch: false, perCell: 3, cap: 60, confetti: 0, confettiAt: 99, fever: false, slowmo: false },
  };
  const RAINBOW = ['#ff5a6e', '#ffb03d', '#ffe14d', '#3ee08a', '#3db8ff', '#8a6bff', '#ff6bd8'];

  const FX = {
    level: 'flashy',
    get reduced() { return mq.matches; },
    get cfg() {
      const c = PRESETS[this.level] || PRESETS.normal;
      return this.reduced ? { ...c, shake: 0, punch: false, slowmo: false, confetti: 0, flash: Math.min(c.flash, 0.15), fever: false } : c;
    },
    shakeAmp: 0, shakeT: 0, slowT: 0, feverT: 0, stats: { maxParticles: 0 },

    reset() {
      this.shakeAmp = 0; this.slowT = 0; this.feverT = 0;
      $('game').classList.remove('fever');
      $('arena').style.transform = '';
      $('banner').className = ''; $('flash').style.opacity = 0;
    },
    // time multiplier for slow-mo
    timeFactor() { return this.slowT > 0 ? 0.45 : 1; },
    update(dt) {
      const arena = $('arena');
      if (this.shakeAmp > 0.3) {
        this.shakeT += dt;
        const a = this.shakeAmp;
        arena.style.transform = `translate(${(Math.sin(this.shakeT * 71) * a).toFixed(1)}px,${(Math.cos(this.shakeT * 53) * a).toFixed(1)}px)`;
        this.shakeAmp *= Math.pow(0.002, dt); // fast decay
      } else if (this.shakeAmp) { this.shakeAmp = 0; arena.style.transform = ''; }
      if (this.slowT > 0) this.slowT -= dt;
      if (this.feverT > 0) { this.feverT -= dt; if (this.feverT <= 0) $('game').classList.remove('fever'); }
    },
    flash(op, color) {
      if (!op) return;
      const f = $('flash');
      f.style.background = color || '#fff';
      f.style.transition = 'none'; f.style.opacity = op;
      requestAnimationFrame(() => { f.style.transition = 'opacity .35s ease-out'; f.style.opacity = 0; });
    },
    shake(px) { this.shakeAmp = Math.max(this.shakeAmp, px * this.cfg.shake); },

    // particles when pieces pop (field units), capped per field
    burst(p, cells, chain) {
      const c = this.cfg, room = c.cap - p.particles.length;
      if (room <= 0) return;
      const per = Math.min(c.perCell + (c.punch ? Math.min(chain, 6) : 0), Math.max(1, Math.floor(room / Math.max(1, cells.length))));
      for (const cell of cells) for (let k = 0; k < per; k++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * (3 + chain * 0.6);
        const spark = k % 3 === 0 && chain >= 2;
        p.particles.push({ x: cell.x + 0.5, y: 12 - cell.y - 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1,
          col: spark ? '#fff' : R.COLORS[cell.c], size: spark ? 0.06 : 0.09, decay: spark ? 1.1 : 1.4 });
      }
      this.stats.maxParticles = Math.max(this.stats.maxParticles, p.particles.length);
    },
    confetti(p, n) {
      n = Math.min(n, this.cfg.cap - p.particles.length);
      for (let i = 0; i < n; i++) p.particles.push({ kind: 'conf', x: Math.random() * 6, y: -0.5 - Math.random() * 2, vx: (Math.random() - 0.5) * 3,
        vy: 0.5 + Math.random() * 1.5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12, life: 1.6, col: RAINBOW[i % RAINBOW.length] });
      this.stats.maxParticles = Math.max(this.stats.maxParticles, p.particles.length);
    },

    // chain step: popup + shake + flash + sound + confetti + fever
    chain(p, chain, isCpu) {
      const c = this.cfg;
      S.clear(chain);
      if (chain >= 2) {
        S.stinger(chain);
        this.popup(p.id, chain, isCpu);
        if (!isCpu) {
          this.shake(Math.min(2 + chain * 2.2, 16));
          this.flash(Math.min(c.flash, 0.08 * chain), chain >= 5 ? '#ffe7ff' : '#fff');
        }
        if (chain >= c.confettiAt) this.confetti(p, Math.round(c.confetti * (isCpu ? 0.4 : 1) * Math.min(1, chain / 5)));
        if (chain >= 5 && !isCpu && c.fever) this.fever();
      }
    },
    fever() {
      const first = this.feverT <= 0;
      this.feverT = 4.5;
      $('game').classList.add('fever');
      if (this.cfg.slowmo) this.slowT = 0.55;
      if (first) { S.fever(); this.banner('FEVER!!', 'fever'); }
    },
    popup(id, chain, isCpu) {
      const el = $('pop' + id), c = this.cfg;
      const size = Math.min(26 + chain * 6, 70) * (isCpu ? 0.55 : 1);
      el.textContent = chain + 'れんさ!';
      el.style.fontSize = size + 'px';
      el.className = 'popup t' + Math.min(chain, 5);
      void el.offsetWidth;
      el.classList.add(c.punch ? 'punch' : 'show');
    },
    allClear(p) {
      S.allclear();
      this.banner('ぜんけし!', 'allclear');
      this.flash(this.cfg.flash, '#fff8c8');
      this.confetti(p, this.cfg.confetti * 2);
      this.shake(10);
    },
    // banners (level up, fever, records) — queued so they don't overlap
    queue: [], showing: false,
    banner(text, cls) {
      this.queue.push([text, cls]);
      if (!this.showing) this.nextBanner();
    },
    nextBanner() {
      const item = this.queue.shift();
      if (!item) { this.showing = false; return; }
      this.showing = true;
      const b = $('banner');
      b.textContent = item[0]; b.className = ''; void b.offsetWidth; b.className = 'on ' + (item[1] || '') + (this.cfg.punch ? '' : ' calm');
      setTimeout(() => this.nextBanner(), 1300);
    },
    toast(a) {
      S.achieve();
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<span class="ic">${a.icon}</span><div><small>実績解除!</small><b>${a.name}</b></div>`;
      $('toasts').appendChild(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3200);
    },
  };
  window.GBFX = FX;
})();
