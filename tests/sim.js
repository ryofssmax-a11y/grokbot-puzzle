// Simulated games: CPU solo (max chain per level) and CPU-vs-CPU battles to completion.
const L = require('../logic.js');
const GAMES = +process.env.GAMES || 5, PAIRS = +process.env.PAIRS || 120;

function solo(level, seed) {
  const seq = L.pairSequence(seed, 4), rnd = L.rng(seed * 7 + 1);
  let b = L.newBoard(), maxChain = 0, score = 0, t = 0, i = 0;
  for (; i < PAIRS; i++) {
    const t0 = Date.now();
    const m = L.chooseMove(b, [seq(i), seq(i + 1)], level, { numColors: 4 }, rnd);
    t = Math.max(t, Date.now() - t0);
    const p = { x: m.x, y: L.SPAWN_Y, rot: m.rot, a: seq(i)[0], b: seq(i)[1] };
    const r = L.resolve(L.place(b, p).board);
    b = r.board; score += r.score; maxChain = Math.max(maxChain, r.chain);
    if (L.isDead(b)) break;
  }
  return { maxChain, score, pairs: i, slowest: t, died: L.isDead(b) };
}

function battle(lv1, lv2, seed) {
  const seq = L.pairSequence(seed, 4), rnd = L.rng(seed);
  const P = [lv1, lv2].map(level => ({ level, b: L.newBoard(), i: 0, pending: 0, carry: 0, maxChain: 0 }));
  for (let turn = 0; turn < 2000; turn++) {
    const me = P[turn % 2], op = P[1 - turn % 2];
    const m = L.chooseMove(me.b, [seq(me.i), seq(me.i + 1)], me.level, { numColors: 4, pending: me.pending, battle: true }, rnd);
    const pr = seq(me.i++);
    const r = L.resolve(L.place(me.b, { x: m.x, y: L.SPAWN_Y, rot: m.rot, a: pr[0], b: pr[1] }).board);
    me.b = r.board; me.maxChain = Math.max(me.maxChain, r.chain);
    if (r.score) {
      const g = L.garbageFromScore(r.score, me.carry); me.carry = g.carry;
      const o = L.offsetGarbage(me.pending, g.count); me.pending = o.pending; op.pending += o.send;
    }
    if (me.pending) { const n = Math.min(30, me.pending); me.pending -= n; me.b = L.dropGarbage(me.b, n, rnd).board; }
    if (L.isDead(me.b)) return { winner: 1 - turn % 2, turns: turn, chains: P.map(p => p.maxChain) };
  }
  return { winner: -1 };
}

const out = {};
for (const lv of ['weak', 'normal', 'strong']) {
  const rs = []; for (let g = 0; g < GAMES; g++) rs.push(solo(lv, 1000 + g));
  out[lv] = {
    avgMaxChain: +(rs.reduce((s, r) => s + r.maxChain, 0) / GAMES).toFixed(2),
    maxChains: rs.map(r => r.maxChain).join(','),
    avgScore: Math.round(rs.reduce((s, r) => s + r.score, 0) / GAMES),
    deaths: rs.filter(r => r.died).length, slowestMoveMs: Math.max(...rs.map(r => r.slowest)),
  };
  console.log(lv, JSON.stringify(out[lv]));
}
if (!process.env.NOBATTLE) {
  const res = { 'strong-vs-weak': [0, 0], 'strong-vs-normal': [0, 0], 'normal-vs-weak': [0, 0] };
  for (const k of Object.keys(res)) {
    const [a, b] = k.split('-vs-');
    for (let g = 0; g < GAMES; g++) { const r = battle(a, b, 50 + g); if (r.winner >= 0) res[k][r.winner]++; }
  }
  console.log('battles (wins A,B):', JSON.stringify(res));
}
