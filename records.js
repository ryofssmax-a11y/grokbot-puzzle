/* Grok Botパズル — play records & achievements (pure; storage is injected) */
(function (root) {
  'use strict';
  const VERSION = 1, TOP = 10, HISTORY = 50;
  const LEVELS = ['weak', 'normal', 'strong'];

  const ACHIEVEMENTS = [
    { id: 'first_clear', icon: '✨', name: 'はじめの一歩', desc: 'はじめてGrok Botを消した', test: (g) => g.cleared > 0 },
    { id: 'chain3', icon: '🔗', name: '3れんさ', desc: '3れんさを出した', test: (g) => g.maxChain >= 3 },
    { id: 'chain5', icon: '🔥', name: 'はじめての5れんさ', desc: '5れんさを出した', test: (g) => g.maxChain >= 5 },
    { id: 'chain7', icon: '🌈', name: '7れんさマスター', desc: '7れんさを出した', test: (g) => g.maxChain >= 7 },
    { id: 'allclear', icon: '🧹', name: 'ぜんけし', desc: 'フィールドを全部消した', test: (g) => g.allClears > 0 },
    { id: 'score10k', icon: '🥉', name: '1万点', desc: '1回で10,000点', test: (g) => g.score >= 10000 },
    { id: 'score100k', icon: '🏆', name: '10万点', desc: '1回で100,000点', test: (g) => g.score >= 100000 },
    { id: 'beat_weak', icon: '🙂', name: 'よわいに勝った', desc: 'CPUよわいに勝利', test: (g) => g.mode === 'battle' && g.win && g.level === 'weak' },
    { id: 'beat_normal', icon: '😎', name: 'ふつうに勝った', desc: 'CPUふつうに勝利', test: (g) => g.mode === 'battle' && g.win && g.level === 'normal' },
    { id: 'beat_strong', icon: '👑', name: 'つよいに勝った', desc: 'CPUつよいに勝利', test: (g) => g.mode === 'battle' && g.win && g.level === 'strong' },
    { id: 'games10', icon: '🎮', name: 'じょうれん', desc: '10回あそんだ', test: (g, r) => r.totalGames >= 10 },
    { id: 'pieces1000', icon: '💎', name: '1000個消し', desc: '合計1,000個消した', test: (g, r) => r.totalCleared >= 1000 },
  ];

  function empty() {
    const cpu = {}; for (const l of LEVELS) cpu[l] = { win: 0, lose: 0 };
    return { v: VERSION, top: { endless: [], battle: [] }, bestChain: 0, totalGames: 0, playTime: 0, totalCleared: 0, cpu, history: [], achievements: {} };
  }
  function load(storage) {
    try {
      const r = JSON.parse(storage.getItem('gbp-records'));
      if (r && r.v === VERSION) { const e = empty(); return { ...e, ...r, cpu: { ...e.cpu, ...r.cpu }, top: { ...e.top, ...r.top } }; }
    } catch (e) { /* broken or missing */ }
    return empty();
  }
  function save(storage, r) { try { storage.setItem('gbp-records', JSON.stringify(r)); } catch (e) { /* full / private */ } }

  // g: {mode, level, score, maxChain, win, time, cleared, allClears, colors, date}
  // returns {records, rank (1-based or 0), newBest, unlocked:[achievement]}
  function addGame(rec, g) {
    const r = JSON.parse(JSON.stringify(rec));
    const date = g.date || Date.now();
    r.totalGames++; r.playTime += g.time || 0; r.totalCleared += g.cleared || 0;
    r.bestChain = Math.max(r.bestChain, g.maxChain || 0);
    if (g.mode === 'battle' && r.cpu[g.level]) r.cpu[g.level][g.win ? 'win' : 'lose']++;
    const list = r.top[g.mode] || (r.top[g.mode] = []);
    const prevBest = list.length ? list[0].score : 0;
    const lvl = g.mode === 'battle' ? g.level || null : null;
    const entry = { score: g.score, maxChain: g.maxChain, date, level: lvl, colors: g.colors || 4 };
    list.push(entry);
    list.sort((a, b) => b.score - a.score || a.date - b.date);
    list.length = Math.min(list.length, TOP);
    const rank = list.indexOf(entry) + 1;
    r.history.unshift({ date, mode: g.mode, level: lvl, score: g.score, maxChain: g.maxChain, result: g.mode === 'battle' ? (g.win ? 'win' : 'lose') : 'over' });
    r.history.length = Math.min(r.history.length, HISTORY);
    const unlocked = checkAchievements(r, g, date);
    return { records: r, rank, newBest: g.score > 0 && g.score > prevBest, unlocked };
  }
  // also used mid-game (partial g) so badges pop the moment they are earned
  function checkAchievements(r, g, date) {
    const out = [];
    for (const a of ACHIEVEMENTS) {
      if (r.achievements[a.id]) continue;
      if (a.test({ cleared: 0, maxChain: 0, allClears: 0, score: 0, ...g }, r)) { r.achievements[a.id] = date || Date.now(); out.push(a); }
    }
    return out;
  }

  const api = { ACHIEVEMENTS, LEVELS, TOP, HISTORY, empty, load, save, addGame, checkAchievements };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GBRecords = api;
})(typeof self !== 'undefined' ? self : this);
