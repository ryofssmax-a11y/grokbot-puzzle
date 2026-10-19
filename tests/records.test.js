const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../records.js');

const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const game = (o) => ({ mode: 'endless', score: 1000, maxChain: 2, time: 60, cleared: 20, allClears: 0, ...o });

test('stats accumulate: games, play time, cleared, best chain, cpu wins/losses', () => {
  let r = R.empty();
  r = R.addGame(r, game({ score: 500, maxChain: 3, time: 30, cleared: 12 })).records;
  r = R.addGame(r, game({ mode: 'battle', level: 'strong', win: true, maxChain: 6, time: 90, cleared: 40 })).records;
  r = R.addGame(r, game({ mode: 'battle', level: 'strong', win: false })).records;
  r = R.addGame(r, game({ mode: 'battle', level: 'weak', win: true })).records;
  assert.equal(r.totalGames, 4);
  assert.equal(r.playTime, 30 + 90 + 60 + 60);
  assert.equal(r.totalCleared, 12 + 40 + 20 + 20);
  assert.equal(r.bestChain, 6);
  assert.deepEqual(r.cpu.strong, { win: 1, lose: 1 });
  assert.deepEqual(r.cpu.weak, { win: 1, lose: 0 });
  assert.equal(r.history.length, 4);
  assert.equal(r.history[0].level, 'weak'); // newest first
  assert.equal(r.history[1].result, 'lose');
});

test('top 10 per mode, sorted, with rank and new-best flag', () => {
  let r = R.empty(), res;
  for (let i = 1; i <= 12; i++) { res = R.addGame(r, game({ score: i * 100, date: i })); r = res.records; }
  assert.equal(r.top.endless.length, 10);
  assert.equal(r.top.endless[0].score, 1200);
  assert.equal(r.top.endless[9].score, 300);
  assert.equal(res.rank, 1); assert.equal(res.newBest, true);
  res = R.addGame(r, game({ score: 50 }));
  assert.equal(res.rank, 0); assert.equal(res.newBest, false);
  res = R.addGame(r, game({ score: 650 }));
  assert.equal(res.rank, 7);
  assert.equal(r.top.battle.length, 0);
});

test('history is capped', () => {
  let r = R.empty();
  for (let i = 0; i < 60; i++) r = R.addGame(r, game({})).records;
  assert.equal(r.history.length, R.HISTORY);
});

test('achievements unlock once, with the right conditions', () => {
  let r = R.empty();
  let res = R.addGame(r, game({ maxChain: 5, score: 12000 }));
  const ids = res.unlocked.map(a => a.id);
  assert.ok(ids.includes('chain5') && ids.includes('chain3') && ids.includes('score10k') && ids.includes('first_clear'));
  assert.ok(!ids.includes('chain7') && !ids.includes('score100k') && !ids.includes('beat_strong'));
  r = res.records;
  res = R.addGame(r, game({ maxChain: 5 }));
  assert.equal(res.unlocked.length, 0); // no repeats
  r = res.records;
  assert.deepEqual(R.addGame(r, game({ mode: 'battle', level: 'strong', win: false })).unlocked.map(a => a.id), []);
  assert.deepEqual(R.addGame(r, game({ mode: 'battle', level: 'strong', win: true })).unlocked.map(a => a.id), ['beat_strong']);
  assert.ok(R.addGame(r, game({ allClears: 1, score: 100000 })).unlocked.some(a => a.id === 'score100k'));
  // live check with a partial game object
  const live = R.checkAchievements(R.empty(), { allClears: 1 });
  assert.deepEqual(live.map(a => a.id), ['allclear']);
});

test('load/save round-trip and recovery from bad data', () => {
  const st = memStore();
  assert.equal(R.load(st).totalGames, 0);
  const r = R.addGame(R.empty(), game({})).records;
  R.save(st, r);
  assert.equal(R.load(st).totalGames, 1);
  st.setItem('gbp-records', '{broken');
  assert.equal(R.load(st).totalGames, 0);
});
