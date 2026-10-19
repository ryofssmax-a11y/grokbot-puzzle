/* Grok Botパズル — game controller: players, timing, animations, CPU, garbage exchange */
(function () {
  'use strict';
  const L = GBLogic;

  // ---- CPU brain (Web Worker with a synchronous fallback) ----
  const AI = {
    worker: null, cbs: new Map(), id: 0,
    init() {
      try {
        this.worker = new Worker('ai-worker.js');
        this.worker.onmessage = (e) => { const cb = this.cbs.get(e.data.id); this.cbs.delete(e.data.id); cb && cb(e.data.m); };
        this.worker.onerror = () => { this.worker = null; };
      } catch (e) { this.worker = null; }
    },
    request(job, cb) {
      const id = ++this.id, seed = (Math.random() * 1e9) | 0;
      if (this.worker) { this.cbs.set(id, cb); this.worker.postMessage({ id, ...job, board: Array.from(job.board), seed }); }
      else setTimeout(() => cb(L.chooseMove(job.board, job.pairs, job.level, job.ctx, L.rng(seed))), 0);
    },
  };

  const CPU_SPEED = { // seconds per input, thinking delay, how it drops
    weak: { step: 0.3, think: 0.9, drop: 'soft' },
    normal: { step: 0.15, think: 0.45, drop: 'soft' },
    strong: { step: 0.1, think: 0.3, drop: 'soft' },
  };
  class CpuCtl {
    constructor(level, game) { this.level = level; this.game = game; this.cfg = CPU_SPEED[level]; this.req = 0; }
    onSpawn(p) {
      this.target = null; this.wait = this.cfg.think; this.acc = 0; this.actions = 0;
      const id = ++this.req, g = this.game;
      AI.request({ board: p.board, pairs: [g.seq(p.i - 1), g.seq(p.i)], level: this.level, ctx: { pending: p.pending, numColors: g.numColors, battle: g.mode === 'battle' } },
        (m) => { if (id === this.req) this.target = m; });
    }
    update(p, dt) {
      if (!this.target) return;
      if ((this.wait -= dt) > 0) return;
      this.acc += dt;
      while (p.pair && this.acc >= this.cfg.step) { this.acc -= this.cfg.step; this.act(p); }
    }
    act(p) {
      const t = this.target;
      if (++this.actions > 24) return p.hardDrop();
      if (p.pair.rot !== t.rot) return p.rotate((t.rot - p.pair.rot + 4) % 4 === 3 ? -1 : 1);
      if (p.pair.x !== t.x) return p.move(Math.sign(t.x - p.pair.x));
      if (this.cfg.drop === 'hard') p.hardDrop(); else if (this.cfg.drop === 'soft') p.soft = true;
    }
  }

  // ---- one field ----
  class Player {
    constructor(game, id, cpu) {
      Object.assign(this, {
        game, id, cpu, board: L.newBoard(), i: 0, score: 0, maxChain: 0, chain: 0, pending: 0, carry: 0,
        placed: 0, dead: false, pair: null, anim: null, fallT: 0, lockT: 0, lockResets: 0, soft: false,
        squish: new Map(), particles: [], state: 'spawn',
      });
    }
    get busy() { return !this.pair; }
    update(dt) {
      for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 9 * dt; q.life -= dt * 1.4; }
      this.particles = this.particles.filter(q => q.life > 0);
      if (this.dead) return;
      if (this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= this.anim.dur) { const a = this.anim; this.anim = null; a.done && a.done(); }
        return;
      }
      if (this.state === 'spawn') this.spawn();
      else if (this.state === 'fall') this.fall(dt);
      else if (this.state === 'check') this.check();
    }
    spawn() {
      this.pair = L.spawnPair(this.game.seq(this.i++));
      this.fallT = 0; this.lockT = 0; this.lockResets = 0; this.soft = false;
      this.state = 'fall';
      if (this.cpu) this.cpu.onSpawn(this);
      this.game.onSpawn(this);
    }
    fall(dt) {
      if (this.cpu) this.cpu.update(this, dt);
      if (!this.pair) return;
      const interval = this.soft ? Math.min(0.03, this.game.gravity(this)) : this.game.gravity(this);
      if (L.shift(this.board, this.pair, 0, -1)) {
        this.fallT += dt / interval;
        while (this.fallT >= 1) {
          const n = L.shift(this.board, this.pair, 0, -1);
          if (!n) { this.fallT = 0; break; }
          this.pair = n; this.fallT -= 1; this.lockT = 0;
        }
      } else {
        this.fallT = 0; this.lockT += dt;
        if (this.lockT >= (this.soft ? 0.06 : 0.5)) this.lock();
      }
    }
    // ---- inputs ----
    resetLock() { if (this.lockT > 0 && this.lockResets < 12) { this.lockT = 0; this.lockResets++; } }
    move(dx) {
      if (!this.pair) return false;
      const n = L.shift(this.board, this.pair, dx, 0);
      if (n) { this.pair = n; this.resetLock(); this.game.sfx('move'); }
      return !!n;
    }
    rotate(dir) {
      if (!this.pair) return false;
      const n = L.rotate(this.board, this.pair, dir);
      if (n) { this.pair = n; this.resetLock(); this.game.sfx('rotate'); }
      return !!n;
    }
    stepDown() {
      if (!this.pair) return;
      const n = L.shift(this.board, this.pair, 0, -1);
      if (n) { this.pair = n; this.fallT = 0; this.score += 1; } else this.lockT = 1;
    }
    hardDrop() {
      if (!this.pair) return;
      const d = L.hardDropY(this.board, this.pair);
      this.score += 2 * (this.pair.y - d.y);
      this.pair = d; this.lock();
    }
    lock() {
      const r = L.place(this.board, this.pair);
      this.pair = null; this.board = r.board; this.placed++;
      this.game.sfx('drop');
      this.animFall(r.moves, () => { this.chain = 0; this.state = 'check'; });
    }
    animFall(moves, done) {
      let dur = 0.04;
      for (const m of moves) { m.dur = m.from === m.to ? 0.01 : 0.05 + Math.sqrt(Math.abs(m.from - m.to)) * 0.055; dur = Math.max(dur, m.dur); }
      this.state = 'anim';
      this.anim = { kind: 'fall', t: 0, dur, moves, done: () => {
        const now = performance.now();
        for (const m of moves) this.squish.set(L.idx(m.x, m.to), now);
        done();
      } };
    }
    check() {
      const nb = L.cloneBoard(this.board);
      const step = L.clearStep(nb, this.chain + 1);
      if (step) {
        this.chain = step.chain;
        this.state = 'anim';
        this.game.sfx('clear', step.chain);
        this.game.onChainStep(this, step);
        this.anim = { kind: 'pop', t: 0, dur: 0.5, cells: step.removed, done: () => {
          for (const c of step.removed) for (let k = 0; k < 7; k++) {
            const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
            this.particles.push({ x: c.x + 0.5, y: L.VIS - c.y - 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1, col: GBRender.COLORS[c.c] });
          }
          this.board = nb; this.score += step.score;
          this.animFall(step.moves, () => { this.state = 'check'; });
        } };
        return;
      }
      if (this.chain) this.maxChain = Math.max(this.maxChain, this.chain);
      this.chain = 0;
      if (this.pending > 0) {
        const n = Math.min(30, this.pending);
        this.pending -= n;
        const r = L.dropGarbage(this.board, n, Math.random);
        this.board = r.board;
        this.game.sfx('garbage');
        this.animFall(r.moves, () => this.afterTurn());
      } else this.afterTurn();
    }
    afterTurn() {
      if (L.isDead(this.board)) { this.dead = true; this.state = 'dead'; this.game.onDead(this); }
      else this.state = 'spawn';
    }
  }

  // ---- a match (endless or battle) ----
  class Game {
    constructor(opts) {
      this.mode = opts.mode; this.level = opts.level || 'normal'; this.numColors = opts.numColors || 4;
      this.hooks = opts.hooks || {};
      const seqFn = L.pairSequence(opts.seed ?? ((Math.random() * 1e9) | 0), this.numColors);
      this.seq = seqFn;
      this.players = [new Player(this, 0, opts.autoPlayer ? new CpuCtl(opts.autoPlayer, this) : null)];
      if (this.mode === 'battle') this.players.push(new Player(this, 1, new CpuCtl(this.level, this)));
      this.time = 0; this.over = false; this.paused = false;
    }
    gravity(p) {
      if (this.mode === 'endless') { const lv = this.levelOf(p); return Math.max(0.07, 0.7 * Math.pow(0.86, lv - 1)); }
      return Math.max(0.2, 0.6 - Math.floor(this.time / 45) * 0.05); // battle speeds up slowly
    }
    levelOf(p) { return Math.min(20, 1 + Math.floor(p.placed / 20)); }
    update(dt) {
      if (this.paused || this.over) return;
      this.time += dt;
      for (const p of this.players) p.update(dt);
    }
    sfx(name, arg) { if (this.hooks.sfx) this.hooks.sfx(name, arg); }
    onSpawn(p) { this.hooks.spawn && this.hooks.spawn(p); }
    onChainStep(p, step) {
      if (this.mode === 'battle') {
        const opp = this.players[1 - p.id];
        const g = L.garbageFromScore(step.score, p.carry);
        p.carry = g.carry;
        const o = L.offsetGarbage(p.pending, g.count);
        p.pending = o.pending; opp.pending += o.send;
      }
      this.hooks.chain && this.hooks.chain(p, step);
    }
    onDead(p) {
      if (this.over) return;
      this.over = true;
      const me = this.players[0];
      const opp = this.players[1];
      const result = { mode: this.mode, level: this.level, score: me.score, maxChain: me.maxChain, cpuMaxChain: opp ? opp.maxChain : null, cpuScore: opp ? opp.score : null, win: this.mode === 'battle' ? p.id === 1 : null, time: this.time };
      this.hooks.end && this.hooks.end(result);
    }
  }

  window.GBGame = { Game, Player, CpuCtl, AI };
})();
