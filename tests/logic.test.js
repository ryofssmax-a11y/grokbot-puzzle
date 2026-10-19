const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');
const { W, idx } = L;

// build a board from rows written top-to-bottom ('.' empty, 1-5 colors, 'G' garbage)
function board(rows) {
  const b = L.newBoard();
  rows.slice().reverse().forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch !== '.') b[idx(x, y)] = ch === 'G' ? L.GARBAGE : +ch;
  }));
  return b;
}
const count = b => b.reduce((s, c) => s + (c ? 1 : 0), 0);

test('4 connected same colors clear, 3 do not', () => {
  assert.equal(L.resolve(board(['11....', '11....'])).chain, 1);
  assert.equal(count(L.resolve(board(['11....', '11....'])).board), 0);
  assert.equal(L.resolve(board(['1.....', '11....'])).chain, 0);
  assert.equal(L.resolve(board(['1111..'])).chain, 1);           // horizontal line
  assert.equal(L.resolve(board(['1.....', '2.....', '11.1..'])).chain, 0); // not connected
});

test('hidden row 13 never clears', () => {
  const b = L.newBoard();
  for (let x = 0; x < 6; x++) for (let y = 0; y < 11; y++) b[idx(x, y)] = 2 + ((x + y) % 2);  // no groups
  b[idx(0, 11)] = 1; b[idx(0, 12)] = 1; b[idx(1, 11)] = 1; b[idx(1, 12)] = 1;
  assert.equal(L.findGroups(b).length, 0);
});

test('multi-chain: 2 and 3 chains with correct scores', () => {
  // red 3 + blue on top + red trigger -> 2 chain
  const two = board([
    '2.....',
    '2.....',
    '12....',
    '12....',
    '11....',
  ]);
  const r2 = L.resolve(two);
  assert.equal(r2.chain, 2);
  // step1: 4 pieces, 1 color, chain1 -> 10*4*1 = 40; step2: 4 pieces chain2 -> 10*4*8 = 320
  assert.deepEqual(r2.steps.map(s => s.score), [40, 320]);
  assert.equal(r2.score, 360 + L.ALL_CLEAR_BONUS); // board ends empty -> all clear
  assert.equal(r2.allClear, true);
  assert.equal(count(r2.board), 0);

  const three = board([
    '32....',
    '23....',
    '21....',
    '111...',
    '233...',
  ]);
  const r3 = L.resolve(three);
  assert.equal(r3.chain, 3);
  assert.deepEqual(r3.steps.map(s => s.score), [40, 320, 640]);
});

test('scoring: color bonus and group bonus', () => {
  // two colors cleared at once (4 + 5 pieces): 10*9*(0 + 3 + 2)
  const r = L.resolve(board(['11.222', '11..22']));
  assert.equal(r.chain, 1);
  assert.equal(r.score, 10 * 9 * (3 + 2) + L.ALL_CLEAR_BONUS);
  assert.equal(L.stepScore(1, [{ color: 1, cells: new Array(11) }]), 10 * 11 * 10);
  assert.equal(L.stepScore(4, [{ color: 1, cells: new Array(4) }]), 10 * 4 * 32);
});

test('garbage next to a clear is removed, garbage itself never groups', () => {
  const r = L.resolve(board(['G.....', '11G...', '11....']));
  assert.equal(count(r.board), 0);
  assert.equal(L.resolve(board(['GG....', 'GG....'])).chain, 0);
});

test('garbage calculation and offsetting', () => {
  assert.deepEqual(L.garbageFromScore(360, 0), { count: 5, carry: 10 });
  assert.deepEqual(L.garbageFromScore(60, 10), { count: 1, carry: 0 });
  assert.deepEqual(L.offsetGarbage(10, 4), { pending: 6, send: 0 });
  assert.deepEqual(L.offsetGarbage(3, 8), { pending: 0, send: 5 });
  const d = L.dropGarbage(L.newBoard(), 14, L.rng(1)).board;
  assert.equal(count(d), 14);
  for (let x = 0; x < W; x++) { const h = L.height(d, x); assert.ok(h === 2 || h === 3); }
});

test('game over when the spawn cell (3rd column, 12th row) is filled', () => {
  const b = L.newBoard();
  assert.equal(L.isDead(b), false);
  for (let y = 0; y < 12; y++) b[idx(2, y)] = y % 2 ? 1 : 2;
  assert.equal(L.isDead(b), true);
});

test('pair movement is blocked by walls and pieces', () => {
  const b = L.newBoard();
  let p = L.spawnPair([1, 2]);
  p = L.shift(b, p, -1, 0); p = L.shift(b, p, -1, 0);
  assert.equal(p.x, 0);
  assert.equal(L.shift(b, p, -1, 0), null);
  const d = L.hardDropY(b, p);
  assert.equal(d.y, 0);
  const placed = L.place(b, d).board;
  assert.equal(placed[idx(0, 0)], 1); assert.equal(placed[idx(0, 1)], 2);
});

test('rotation, wall kick, floor kick and quick turn', () => {
  const b = L.newBoard();
  // right wall kick: pivot at x=5, rotating so the child goes right pushes the pivot left
  let p = { x: 5, y: 5, rot: 0, a: 1, b: 2 };
  let q = L.rotate(b, p, 1);
  assert.deepEqual([q.x, q.rot], [4, 1]);
  // left wall kick
  q = L.rotate(b, { x: 0, y: 5, rot: 0, a: 1, b: 2 }, -1);
  assert.deepEqual([q.x, q.rot], [1, 3]);
  // floor kick: child going below the floor lifts the pivot
  q = L.rotate(b, { x: 2, y: 0, rot: 1, a: 1, b: 2 }, 1);
  assert.deepEqual([q.y, q.rot], [1, 2]);
  // 1-wide well: both sides blocked -> quick 180° turn
  const w = L.newBoard();
  for (let y = 0; y < 8; y++) { w[idx(1, y)] = 3; w[idx(3, y)] = 4; }
  q = L.rotate(w, { x: 2, y: 3, rot: 0, a: 1, b: 2 }, 1);
  assert.equal(q.rot, 2);
  assert.ok(L.fits(w, q));
  // split pair: horizontal pair over uneven ground drops independently
  const u = L.newBoard(); u[idx(3, 0)] = 3; u[idx(3, 1)] = 4;
  const r = L.place(u, { x: 2, y: 5, rot: 1, a: 1, b: 2 }).board;
  assert.equal(r[idx(2, 0)], 1); assert.equal(r[idx(3, 2)], 2);
});

test('pair sequence is deterministic and uses the configured colors', () => {
  const s1 = L.pairSequence(42, 5), s2 = L.pairSequence(42, 5);
  for (let i = 0; i < 50; i++) { assert.deepEqual(s1(i), s2(i)); for (const c of s1(i)) assert.ok(c >= 1 && c <= 5); }
  assert.ok(s1(0).every(c => c <= 3) && s1(1).every(c => c <= 3));
});

test('AI returns legal moves and avoids dying', () => {
  const r = L.rng(9);
  for (const lv of ['weak', 'normal', 'strong']) for (let k = 0; k < 10; k++) {
    const b = L.newBoard();
    for (let x = 0; x < W; x++) for (let y = 0; y < Math.floor(r() * 9); y++) b[idx(x, y)] = 1 + Math.floor(r() * 4);
    const s = L.resolve(b).board;
    const m = L.chooseMove(s, [[1, 2], [3, 4]], lv, { numColors: 4 }, r);
    assert.ok(L.placements(s, 1, 2).some(p => p.x === m.x && p.rot === m.rot), lv + ' legal');
  }
  const tall = L.newBoard();
  for (let y = 0; y < 10; y++) tall[idx(2, y)] = 1 + (y % 2) + 2 * ((y >> 1) % 2);
  for (const lv of ['normal', 'strong']) {
    const m = L.chooseMove(tall, [[1, 2], [3, 4]], lv, {}, L.rng(1));
    assert.equal(L.isDead(L.resolve(L.placeAt(tall, m.x, m.rot, 1, 2)).board), false);
  }
});

test('strong AI fires a 2-chain when garbage is pending', () => {
  const b = board(['313...', '113...']);
  const m = L.chooseMove(b, [[1, 3], [4, 4]], 'strong', { numColors: 4, pending: 12 }, L.rng(2));
  assert.ok(L.resolve(L.placeAt(b, m.x, m.rot, 1, 3)).chain >= 2);
});

test('all-clear bonus only when the field is completely empty after a chain', () => {
  const r = L.resolve(board(['11....', '11....']));
  assert.equal(r.allClear, true);
  assert.equal(r.score, 40 + 2100);
  const r2 = L.resolve(board(['11....', '11...2']));
  assert.equal(r2.allClear, false);
  assert.equal(r2.score, 40);
  assert.equal(L.resolve(L.newBoard()).allClear, false); // no chain, no bonus
  assert.equal(L.garbageFromScore(L.ALL_CLEAR_BONUS, 0).count, 30);
});
