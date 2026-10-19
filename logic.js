/* Grok Botパズル — pure game logic (no DOM). Works in browser, Web Worker and Node.
 * Board: flat Uint8Array, index = y*W + x, y=0 is the bottom row.
 * Rows 0..11 are visible, row 12 is the hidden spawn row (never clears). */
(function (root) {
  'use strict';
  const W = 6, H = 13, VIS = 12, GARBAGE = 9, SPAWN_X = 2, SPAWN_Y = 11;
  const OFS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // child offset per rotation: up, right, down, left

  const idx = (x, y) => y * W + x;
  const newBoard = () => new Uint8Array(W * H);
  const cloneBoard = b => b.slice();
  function get(b, x, y) {
    if (x < 0 || x >= W || y < 0) return 255;   // wall / floor
    if (y >= H) return 0;                       // above the board is open
    return b[idx(x, y)];
  }
  const isColor = c => c >= 1 && c <= 5;
  function height(b, x) { let y = 0; while (y < H && b[idx(x, y)]) y++; return y; }
  const ALL_CLEAR_BONUS = 2100; // = 30 garbage in battle
  const isEmpty = b => { for (let i = 0; i < b.length; i++) if (b[i]) return false; return true; };
  const isDead = b => b[idx(SPAWN_X, SPAWN_Y)] !== 0;

  /* ---------- falling pair ---------- */
  function childPos(p) { const o = OFS[p.rot]; return [p.x + o[0], p.y + o[1]]; }
  function fits(b, p) { const c = childPos(p); return get(b, p.x, p.y) === 0 && get(b, c[0], c[1]) === 0; }
  const spawnPair = colors => ({ x: SPAWN_X, y: SPAWN_Y, rot: 0, a: colors[0], b: colors[1] });
  function shift(b, p, dx, dy) { const q = { ...p, x: p.x + dx, y: p.y + dy }; return fits(b, q) ? q : null; }
  // rotate with wall/floor kick; if both sides are blocked (1-wide well) do a quick 180° turn
  function rotate(b, p, dir) {
    const tryRot = rot => {
      const q = { ...p, rot }; if (fits(b, q)) return q;
      const o = OFS[rot], k = { ...q, x: p.x - o[0], y: p.y - o[1] };   // kick pivot away from the child
      return fits(b, k) ? k : null;
    };
    return tryRot((p.rot + dir + 4) % 4) || tryRot((p.rot + 2) % 4);
  }
  function hardDropY(b, p) { let q = p, n; while ((n = shift(b, q, 0, -1))) q = n; return q; }

  // lock a pair: each piece falls independently in its column. returns {board, moves:[{x,from,to,c}]}
  function place(b, p) {
    const nb = cloneBoard(b), c = childPos(p);
    const pieces = [[p.x, p.y, p.a], [c[0], c[1], p.b]].sort((u, v) => u[1] - v[1]);
    const moves = [];
    for (const [x, y, col] of pieces) {
      const h = height(nb, x);
      if (h < H) { nb[idx(x, h)] = col; moves.push({ x, from: y, to: h, c: col }); }
    }
    return { board: nb, moves };
  }
  // fast placement by column/rotation (used by the AI); returns board or null if illegal
  function placeAt(b, x, rot, a, c2) {
    const cx = x + OFS[rot][0];
    if (x < 0 || x >= W || cx < 0 || cx >= W) return null;
    const nb = cloneBoard(b);
    const drop = (px, col) => { const h = height(nb, px); if (h < H) nb[idx(px, h)] = col; };
    if (rot === 2) { drop(cx, c2); drop(x, a); } else { drop(x, a); drop(cx, c2); }
    return nb;
  }

  /* ---------- gravity / clearing ---------- */
  function gravity(b) { // in place, returns moves
    const moves = [];
    for (let x = 0; x < W; x++) {
      let w = 0;
      for (let y = 0; y < H; y++) {
        const c = b[idx(x, y)];
        if (!c) continue;
        if (w !== y) { b[idx(x, w)] = c; b[idx(x, y)] = 0; moves.push({ x, from: y, to: w, c }); }
        w++;
      }
    }
    return moves;
  }

  const stack = new Int16Array(W * H), seen = new Uint8Array(W * H);
  // groups of >=4 same-colored, orthogonally connected pieces inside the visible rows
  function findGroups(b) {
    seen.fill(0);
    const groups = [];
    for (let i = 0; i < W * VIS; i++) {
      const c = b[i];
      if (!isColor(c) || seen[i]) continue;
      let sp = 0; const cells = [];
      stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const j = stack[--sp]; cells.push(j);
        const x = j % W, y = (j / W) | 0;
        if (x > 0 && !seen[j - 1] && b[j - 1] === c) { seen[j - 1] = 1; stack[sp++] = j - 1; }
        if (x < W - 1 && !seen[j + 1] && b[j + 1] === c) { seen[j + 1] = 1; stack[sp++] = j + 1; }
        if (y > 0 && !seen[j - W] && b[j - W] === c) { seen[j - W] = 1; stack[sp++] = j - W; }
        if (y < VIS - 1 && !seen[j + W] && b[j + W] === c) { seen[j + W] = 1; stack[sp++] = j + W; }
      }
      if (cells.length >= 4) groups.push({ color: c, cells });
    }
    return groups;
  }

  const CHAIN_POWER = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
  const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
  const groupBonus = n => (n <= 4 ? 0 : n >= 11 ? 10 : n - 3);
  function stepScore(chain, groups) {
    const count = groups.reduce((s, g) => s + g.cells.length, 0);
    const colors = new Set(groups.map(g => g.color)).size;
    const cp = CHAIN_POWER[Math.min(chain, CHAIN_POWER.length) - 1] ?? 0;
    const bonus = cp + COLOR_BONUS[colors] + groups.reduce((s, g) => s + groupBonus(g.cells.length), 0);
    return 10 * count * Math.min(999, Math.max(1, bonus));
  }

  // one chain step, in place. returns null when nothing clears.
  function clearStep(b, chain) {
    const groups = findGroups(b);
    if (!groups.length) return null;
    const cleared = new Set();
    for (const g of groups) for (const j of g.cells) cleared.add(j);
    const garbage = new Set(); // garbage next to a cleared piece is cleared too
    for (const j of cleared) {
      const x = j % W, y = (j / W) | 0;
      for (const [dx, dy] of OFS) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < VIS && b[idx(nx, ny)] === GARBAGE) garbage.add(idx(nx, ny));
      }
    }
    const removed = [...cleared, ...garbage].map(j => ({ x: j % W, y: (j / W) | 0, c: b[j] }));
    for (const r of removed) b[idx(r.x, r.y)] = 0;
    const score = stepScore(chain, groups);
    const moves = gravity(b);
    return { chain, groups, removed, score, moves };
  }

  // full chain resolution with step records (for animation). does not mutate input.
  function resolve(b) {
    const nb = cloneBoard(b), steps = [];
    let chain = 0, score = 0, s;
    while ((s = clearStep(nb, chain + 1))) { chain++; score += s.score; s.board = cloneBoard(nb); steps.push(s); }
    const allClear = chain > 0 && isEmpty(nb);
    if (allClear) score += ALL_CLEAR_BONUS;
    return { board: nb, chain, score, steps, allClear };
  }
  // fast version for the AI (mutates b)
  function resolveFast(b) {
    let chain = 0, score = 0, g;
    while ((g = findGroups(b)).length) {
      chain++; score += stepScore(chain, g);
      for (const gr of g) for (const j of gr.cells) {
        b[j] = 0;
        const x = j % W, y = (j / W) | 0;
        if (x > 0 && b[j - 1] === GARBAGE) b[j - 1] = 0;
        if (x < W - 1 && b[j + 1] === GARBAGE) b[j + 1] = 0;
        if (y > 0 && b[j - W] === GARBAGE) b[j - W] = 0;
        if (y < VIS - 1 && b[j + W] === GARBAGE) b[j + W] = 0;
      }
      gravity(b);
    }
    return { chain, score };
  }

  /* ---------- garbage (おじゃま) ---------- */
  const GARBAGE_RATE = 70;
  function garbageFromScore(score, carry) {
    const t = score + (carry || 0);
    return { count: Math.floor(t / GARBAGE_RATE), carry: t % GARBAGE_RATE };
  }
  // outgoing garbage first cancels what is pending against us; the rest goes to the opponent
  function offsetGarbage(pending, outgoing) {
    const cancel = Math.min(pending, outgoing);
    return { pending: pending - cancel, send: outgoing - cancel };
  }
  // drop n garbage pieces (full rows first, the remainder in random distinct columns)
  function dropGarbage(b, n, rnd) {
    const nb = cloneBoard(b), moves = [];
    const per = new Array(W).fill(Math.floor(n / W));
    const cols = [0, 1, 2, 3, 4, 5];
    for (let i = W - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; }
    for (let i = 0; i < n % W; i++) per[cols[i]]++;
    for (let x = 0; x < W; x++) for (let k = 0; k < per[x]; k++) {
      const h = height(nb, x);
      if (h < H) { nb[idx(x, h)] = GARBAGE; moves.push({ x, from: H + k, to: h, c: GARBAGE }); }
    }
    return { board: nb, moves };
  }

  /* ---------- randomness / pair sequence ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // deterministic shared sequence: both players in a battle get the same pairs
  function pairSequence(seed, numColors) {
    const r = rng(seed), list = [];
    return i => {
      while (list.length <= i) {
        const n = list.length < 2 ? Math.min(3, numColors) : numColors; // first two pairs use 3 colors
        list.push([1 + Math.floor(r() * n), 1 + Math.floor(r() * n)]);
      }
      return list[i];
    };
  }

  /* ---------- CPU AI ---------- */
  const AI_LEVELS = {
    weak:   { depth: 1, pot: 0, conn: 6,  noise: 120, randomPick: 0.45, fireMin: 1 },
    normal: { depth: 1, pot: 2, conn: 10, noise: 25,  randomPick: 0,    fireMin: 3 },
    strong: { depth: 2, pot: 3, conn: 12, noise: 4,   randomPick: 0,    fireMin: 6, beam: 22, battleFireMin: 3, counterAt: 1 },
  };

  function placements(b, a, c2) {
    const list = [];
    const open = x => b[idx(x, SPAWN_Y)] === 0;
    for (let rot = 0; rot < 4; rot++) {
      if (a === c2 && rot >= 2) continue; // symmetric pair
      for (let x = 0; x < W; x++) {
        const cx = x + OFS[rot][0];
        if (cx < 0 || cx >= W) continue;
        // reachability: every column between spawn and target must be open at the spawn row
        const lo = Math.min(SPAWN_X, x, cx), hi = Math.max(SPAWN_X, x, cx);
        let ok = true;
        for (let k = lo; k <= hi; k++) if (!open(k)) { ok = false; break; }
        if (ok) list.push({ x, rot });
      }
    }
    return list;
  }

  // "virtual drop": best chain we could trigger by adding 1..maxN pieces of one color to one column
  function potential(b, maxN, numColors) {
    let best = 0;
    for (let x = 0; x < W; x++) {
      const h = height(b, x);
      if (h >= VIS - 1) continue;
      for (let c = 1; c <= numColors; c++) {
        // only colors that touch the column surface can start something
        if (get(b, x - 1, h) !== c && get(b, x + 1, h) !== c && get(b, x, h - 1) !== c) continue;
        const nb = cloneBoard(b);
        for (let n = 1; n <= maxN && h + n <= VIS; n++) {
          nb[idx(x, h + n - 1)] = c;
          const r = resolveFast(cloneBoard(nb));
          if (r.chain) { const v = r.chain - (n - 1) * 0.35; if (v > best) best = v; break; }
        }
      }
    }
    return best;
  }

  function evalBoard(b, cfg, numColors) {
    let v = 0, total = 0;
    for (let y = 0; y < VIS; y++) for (let x = 0; x < W; x++) {
      const c = b[idx(x, y)];
      if (!c) continue;
      total++;
      if (!isColor(c)) continue;
      if (x < W - 1 && b[idx(x + 1, y)] === c) v += cfg.conn;
      if (y < VIS - 1 && b[idx(x, y + 1)] === c) v += cfg.conn;
    }
    const hs = []; for (let x = 0; x < W; x++) hs.push(height(b, x));
    const avg = hs.reduce((s, h) => s + h, 0) / W;
    for (const h of hs) v -= (h - avg) * (h - avg) * 3;
    for (const x of [1, 2, 3]) if (hs[x] >= 9) v -= (hs[x] - 8) * (x === 2 ? 600 : 200);
    if (cfg.pot) { const p = potential(b, cfg.pot, numColors); v += p * p * 45; }
    return v;
  }

  // ctx: {pending, numColors}. returns placement value for a board after a pair was placed
  function scorePlacement(b, cfg, ctx) {
    const nb = cloneBoard(b);
    const r = resolveFast(nb);
    if (isDead(nb)) return { v: -1e9, board: nb, chain: r.chain };
    if (r.chain) {
      let total = 0; for (let i = 0; i < W * VIS; i++) if (nb[i]) total++;
      let hmax = 0; for (let x = 0; x < W; x++) hmax = Math.max(hmax, height(nb, x));
      const before = []; for (let x = 0; x < W; x++) before.push(height(b, x));
      const danger = before[2] >= 9 || Math.max(...before) >= 11;
      const fireMin = ctx.battle && cfg.battleFireMin ? cfg.battleFireMin : cfg.fireMin;
      const need = r.chain >= fireMin || danger || (ctx.pending >= (cfg.counterAt || 6) && r.chain >= 2) || (cfg.fireMin > 1 && total + r.chain * 4 > 50 && r.chain >= 2);
      if (need) return { v: 1e5 + r.score, board: nb, chain: r.chain, fired: true };
      return { v: evalBoard(nb, cfg, ctx.numColors) - 900 * (fireMin - r.chain), board: nb, chain: r.chain };
    }
    return { v: null, board: nb, chain: 0 };
  }

  function chooseMove(board, pairs, level, ctx, rand) {
    const cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    rand = rand || Math.random;
    ctx = { pending: 0, numColors: 4, ...ctx };
    const [a, c2] = pairs[0];
    const list = placements(board, a, c2);
    if (!list.length) return { x: SPAWN_X, rot: 0 };
    if (cfg.randomPick && rand() < cfg.randomPick) {
      const safe = list.filter(m => { const nb = placeAt(board, m.x, m.rot, a, c2); resolveFast(nb); return !isDead(nb) && height(nb, 2) < 10; });
      const pool = safe.length ? safe : list;
      return pool[Math.floor(rand() * pool.length)];
    }
    const quick = cfgQuick(cfg);
    const scored = list.map(m => {
      const nb = placeAt(board, m.x, m.rot, a, c2);
      const s = scorePlacement(nb, cfg, ctx);
      if (s.v === null) s.v = evalBoard(s.board, cfg.depth > 1 ? quick : cfg, ctx.numColors);
      return { m, s };
    });
    if (cfg.depth > 1 && pairs[1]) {
      scored.sort((p, q) => q.s.v - p.s.v);
      const [na, nc] = pairs[1];
      scored.slice(0, cfg.beam).forEach(e => {
        if (e.s.fired || e.s.v <= -1e8) return;
        let best = -Infinity;
        for (const m2 of placements(e.s.board, na, nc)) {
          const b2 = placeAt(e.s.board, m2.x, m2.rot, na, nc);
          const s2 = scorePlacement(b2, cfg, ctx);
          const v = s2.v === null ? evalBoard(s2.board, cfg, ctx.numColors) : s2.v * (s2.fired ? 0.97 : 1);
          if (v > best) best = v;
        }
        e.s.v = Math.max(e.s.v * 0.2, best) + 1; // small bonus: keep searched lines ahead of unsearched ones
      });
      scored.slice(cfg.beam).forEach(e => { if (!e.s.fired) e.s.v -= 1e4; });
    }
    let bestE = null, bestV = -Infinity;
    for (const e of scored) { const v = e.s.v + rand() * cfg.noise; if (v > bestV) { bestV = v; bestE = e; } }
    return bestE.m;
  }
  const cfgQuick = cfg => ({ ...cfg, pot: 0 });

  const api = {
    W, H, VIS, GARBAGE, SPAWN_X, SPAWN_Y, OFS, GARBAGE_RATE, AI_LEVELS,
    idx, newBoard, cloneBoard, get, height, isDead, isColor, isEmpty, ALL_CLEAR_BONUS,
    childPos, fits, spawnPair, shift, rotate, hardDropY, place, placeAt,
    gravity, findGroups, stepScore, clearStep, resolve, resolveFast,
    garbageFromScore, offsetGarbage, dropGarbage, rng, pairSequence,
    placements, potential, evalBoard, chooseMove,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GBLogic = api;
})(typeof self !== 'undefined' ? self : this);
