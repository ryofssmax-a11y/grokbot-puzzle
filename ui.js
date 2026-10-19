/* Grok Botパズル — screens, layout, input, main loop */
(function () {
  'use strict';
  const L = GBLogic, R = GBRender, S = GBSound, FX = GBFX, REC = GBRecords;
  const $ = (id) => document.getElementById(id);
  const LEVEL_JP = { weak: 'よわい', normal: 'ふつう', strong: 'つよい' };

  // ---- settings / storage ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gbp-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gbp-' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const settings = { sound: store.get('sound', true), colors: store.get('colors', 4), fx: store.get('fx', 'flashy'),
    shape: store.get('shape', 'round'), custom: store.get('customShapes', { ...R.PER_COLOR }) };
  S.on = settings.sound;
  FX.level = settings.fx;
  R.setShapes(settings.shape, settings.custom);
  $('optFx').value = settings.fx;
  $('optFx').onchange = (e) => { settings.fx = FX.level = e.target.value; store.set('fx', settings.fx); };
  $('optShape').value = settings.shape;
  $('optShape').onchange = (e) => { settings.shape = e.target.value; store.set('shape', settings.shape); applyShapes(); };
  const COLOR_JP = { 1: 'あか', 2: 'あお', 3: 'みどり', 4: 'きいろ', 5: 'むらさき' };
  function mini(c, size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size * 2;
    cv.getContext('2d').drawImage(R.sprite(c, 'o', size * 2), 0, 0);
    return cv;
  }
  function applyShapes() {
    R.setShapes(settings.shape, settings.custom);
    const pv = $('shapePreview'); pv.innerHTML = '';
    for (const c of [1, 2, 3, 4, 5, 9]) pv.appendChild(mini(c, 40));
    const box = $('customShapes');
    box.classList.toggle('on', settings.shape === 'custom');
    box.innerHTML = '';
    if (settings.shape !== 'custom') return;
    for (const c of [1, 2, 3, 4, 5]) {
      const lab = document.createElement('div'); lab.style.display = 'flex'; lab.style.alignItems = 'center'; lab.style.gap = '6px';
      lab.appendChild(mini(c, 30)); lab.appendChild(document.createTextNode(COLOR_JP[c]));
      const sel = document.createElement('select'); sel.dataset.color = c;
      for (const sh of R.SHAPES) { const o = document.createElement('option'); o.value = sh; o.textContent = R.SHAPE_JP[sh]; sel.appendChild(o); }
      sel.value = settings.custom[c] || 'round';
      sel.onchange = () => { settings.custom[c] = sel.value; store.set('customShapes', settings.custom); applyShapes(); };
      box.appendChild(lab); box.appendChild(sel);
    }
  }
  applyShapes();
  $('optSound').checked = settings.sound;
  $('optColors').value = String(settings.colors);
  $('optSound').onchange = (e) => { settings.sound = S.on = e.target.checked; store.set('sound', settings.sound); };
  $('optColors').onchange = (e) => { settings.colors = +e.target.value; store.set('colors', settings.colors); updateHi(); };
  // ---- records ----
  let records = REC.load(localStorage);
  // migrate the v1 single high score
  for (const k of ['hi4', 'hi5']) { const v = store.get(k, 0); if (v && !records.top.endless.some(e => e.score === v)) { records.top.endless.push({ score: v, maxChain: 0, date: Date.now(), colors: +k[2] }); records.top.endless.sort((a, b) => b.score - a.score); REC.save(localStorage, records); } }
  const bestScore = (mode) => (records.top[mode][0] || { score: 0 }).score;
  function updateHi() { $('hiScore').textContent = bestScore('endless').toLocaleString(); }
  function unlockLive(partial) {
    const got = REC.checkAchievements(records, partial);
    if (got.length) { REC.save(localStorage, records); got.forEach((a, i) => setTimeout(() => FX.toast(a), i * 700)); }
  }
  const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const fmtTime = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分${Math.floor(sec % 60)}秒`; };
  let topMode = 'endless';
  function renderRecords() {
    const r = records;
    $('recSummary').innerHTML = [
      ['あそんだ回数', r.totalGames + '回'], ['プレイ時間', fmtTime(r.playTime)],
      ['消したGrok Bot', r.totalCleared.toLocaleString() + '個'], ['最大れんさ', r.bestChain + 'れんさ'],
    ].map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
    $('recCpu').innerHTML = '<tr><th>CPU</th><th>勝ち</th><th>負け</th><th>勝率</th></tr>' + REC.LEVELS.map(l => {
      const c = r.cpu[l], n = c.win + c.lose;
      return `<tr><td>${LEVEL_JP[l]}</td><td>${c.win}</td><td>${c.lose}</td><td>${n ? Math.round(c.win / n * 100) + '%' : '-'}</td></tr>`;
    }).join('');
    document.querySelectorAll('#topSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === topMode));
    const top = r.top[topMode];
    $('recTop').innerHTML = top.length ? top.map((e, i) => `<li><span class="rk">${i + 1}</span><b>${e.score.toLocaleString()}</b><small>${e.maxChain}れんさ${e.level ? '・' + LEVEL_JP[e.level] : ''}・${fmtDate(e.date)}</small></li>`).join('')
      : '<li class="empty-note">まだ記録がありません</li>';
    $('recBadges').innerHTML = REC.ACHIEVEMENTS.map(a => {
      const on = r.achievements[a.id];
      return `<div class="badge ${on ? '' : 'locked'}" title="${a.desc}"><span class="ic">${on ? a.icon : '🔒'}</span>${a.name}</div>`;
    }).join('');
    const RES = { win: '<span class="res-win">かち</span>', lose: '<span class="res-lose">まけ</span>', over: 'おわり' };
    $('recHistory').innerHTML = r.history.length ? r.history.map(h => `<li><small>${fmtDate(h.date)}</small><span>${h.mode === 'battle' ? 'CPU ' + LEVEL_JP[h.level] : 'とことん'}</span><b>${h.score.toLocaleString()}</b><span>${h.maxChain}れんさ</span><span>${RES[h.result]}</span></li>`).join('')
      : '<li class="empty-note">まだ履歴がありません</li>';
  }
  document.querySelectorAll('#topSeg button').forEach(b => b.onclick = () => { topMode = b.dataset.mode; renderRecords(); });
  $('resetRecords').onclick = () => {
    if (!confirm('記録と実績をすべて消します。よろしいですか？')) return;
    records = REC.empty(); REC.save(localStorage, records); store.set('hi4', 0); store.set('hi5', 0); renderRecords(); updateHi();
  };

  // ---- screens ----
  let current = 'title';
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    current = id;
    if (id === 'menu') updateHi();
    if (id === 'records') renderRecords();
    if (id === 'game') layout();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-open],[data-close]');
    if (!t) return;
    S.unlock();
    if (t.dataset.go) { if (game && t.dataset.go !== 'game') endGame(); show(t.dataset.go); }
    if (t.dataset.open) $(t.dataset.open).classList.add('active');
    if (t.dataset.close) $(t.dataset.close).classList.remove('active');
  });
  let level = store.get('level', 'normal');
  const segBtns = document.querySelectorAll('#levelSeg button');
  function setLevel(lv) { level = lv; store.set('level', lv); segBtns.forEach(b => b.classList.toggle('on', b.dataset.lv === lv)); }
  segBtns.forEach(b => b.onclick = () => setLevel(b.dataset.lv));
  setLevel(level);

  // ---- game lifecycle ----
  let game = null, lastOpts = null, autoPlayer = null;
  const views = [new R.FieldView($('field0')), new R.FieldView($('field1'))];
  let cs = [30, 18];

  function startGame(opts) {
    S.unlock();
    lastOpts = opts;
    game = new GBGame.Game({ ...opts, numColors: settings.colors, autoPlayer, hooks });
    FX.reset();
    shownScore = 0; recordBeaten = false; prevBest = bestScore('endless');
    $('game').classList.toggle('battle', opts.mode === 'battle');
    $('cpuTag').textContent = 'CPU ' + (LEVEL_JP[opts.level] || '');
    $('pause').classList.remove('active');
    show('game');
  }
  function endGame() { game = null; $('pause').classList.remove('active'); }
  $('startEndless').onclick = () => startGame({ mode: 'endless' });
  $('startBattle').onclick = () => startGame({ mode: 'battle', level });
  $('retryBtn').onclick = () => startGame(lastOpts);
  $('pauseBtn').onclick = () => setPause(true);
  $('resumeBtn').onclick = () => setPause(false);
  $('restartBtn').onclick = () => startGame(lastOpts);
  $('quitBtn').onclick = () => { endGame(); show('title'); };
  function setPause(on) { if (!game || game.over) return; game.paused = on; $('pause').classList.toggle('active', on); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

  const hooks = {
    sfx: (name, arg) => { if (name === 'clear') return; const f = S[name]; if (f && !(name === 'move' && game && game.players[0].cpu)) f(arg); },
    chain: (p, step) => FX.chain(p, step.chain, p.id === 1),
    burst: (p, cells, chain) => FX.burst(p, cells, chain),
    chainEnd: (p, chain) => { if (p.id === 0 && !p.cpu) unlockLive({ maxChain: chain, cleared: p.cleared, score: p.score }); },
    allclear: (p) => { if (p.id === 0) { FX.allClear(p); if (!p.cpu) unlockLive({ allClears: 1 }); } },
    levelup: (p, lv) => { if (p.id === 0 && game.mode === 'endless') { S.levelup(); FX.banner('LEVEL UP!  Lv ' + lv, 'level'); } },
    spawn: () => {},
    end: (res) => {
      if (res.mode === 'battle') res.win ? S.win() : S.lose(); else S.lose();
      setTimeout(() => showResult(res), 1100);
    },
  };
  function showResult(res) {
    $('resTitle').textContent = res.mode === 'battle' ? (res.win ? 'かち！' : 'まけ…') : 'ゲームオーバー';
    $('resScore').textContent = res.score.toLocaleString();
    $('resChain').textContent = res.maxChain + ' れんさ';
    const auto = game && game.players[0].cpu; // automated test runs don't pollute records
    const prev = bestScore(res.mode);
    let added = { rank: 0, newBest: false, unlocked: [] };
    if (!auto) { added = REC.addGame(records, res); records = added.records; REC.save(localStorage, records); }
    if (res.mode === 'endless') {
      $('resHiLabel').textContent = added.rank ? `ハイスコア（${added.rank}位）` : 'ハイスコア';
      $('resHi').innerHTML = Math.max(prev, res.score).toLocaleString() + (added.newBest ? '<span class="new">NEW!</span>' : '');
      if (added.newBest && !recordBeaten) S.fanfare();
    } else {
      $('resHiLabel').textContent = '相手';
      $('resHi').textContent = 'CPU ' + LEVEL_JP[res.level];
    }
    drawFace($('resultFace'), res.win === false || res.mode === 'endless' ? 9 : 2, 0);
    window.GBP.lastResult = res;
    game = null;
    show('result');
    added.unlocked.forEach((a, i) => setTimeout(() => FX.toast(a), 400 + i * 700));
  }

  // ---- layout: fit fields to the screen ----
  function layout() {
    const gameEl = $('game');
    if (!gameEl.classList.contains('active')) return;
    const arena = $('arena').getBoundingClientRect();
    const availH = arena.height - 4, availW = arena.width - 4;
    const battle = gameEl.classList.contains('battle');
    const rows = L.VIS + 1.6; // field + strip
    if (battle) {
      const ratio = 0.6;
      const c = Math.floor(Math.min((availW - 12) / (L.W * (1 + ratio)), availH / rows));
      cs = [c, Math.floor(c * ratio)];
    } else {
      cs = [Math.floor(Math.min(availW / L.W, availH / rows, 60)), 18];
    }
    views[0].resize(cs[0]); views[1].resize(cs[1]);
  }
  window.addEventListener('resize', layout);

  // ---- main loop ----
  let last = performance.now(), shownScore = 0, recordBeaten = false, prevBest = 0;
  const perf = { frames: 0, slow: 0, worst: 0 };
  function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    if (game && !game.paused) { perf.frames++; if (raw > 1 / 45) perf.slow++; perf.worst = Math.max(perf.worst, raw); }
    FX.update(raw);
    const dt = raw * (window.GBP.timeScale || 1) * FX.timeFactor();
    last = now;
    if (game) {
      game.update(dt);
      const me = game.players[0];
      // score roll-up
      const diff = me.score - shownScore;
      shownScore = diff > 3 ? shownScore + Math.max(1, Math.ceil(diff * Math.min(1, raw * 7))) : me.score;
      const sc = $('score');
      sc.textContent = shownScore.toLocaleString();
      sc.classList.toggle('rolling', diff > 200 && settings.fx !== 'calm');
      if (game.mode === 'endless' && !recordBeaten && prevBest > 0 && me.score > prevBest && !me.cpu) {
        recordBeaten = true; S.fanfare(); FX.banner('ハイスコア更新!', 'record');
      }
      $('hudInfo').textContent = game.mode === 'endless'
        ? `Lv ${game.levelOf(me)}　最大 ${Math.max(me.maxChain, me.chain)}れんさ`
        : `CPU ${game.players[1].score.toLocaleString()}`;
      game.players.forEach((p, i) => {
        views[i].draw(p, now);
        R.drawStrip($('strip' + i), cs[i], p.pending, game.seq(p.i), game.seq(p.i + 1), now);
      });
    }
    if (current === 'title') drawMascot(now);
    requestAnimationFrame(frame);
  }

  // ---- mascot (title) ----
  function drawFace(cv, c, now, squash = 0) {
    const g = cv.getContext('2d'), w = cv.width;
    g.clearRect(0, 0, w, w);
    const s = w * 0.8, img = R.sprite(c, ((now / 1000) % 3.2) < 0.14 ? 'c' : 'o', Math.round(s));
    g.drawImage(img, (w - s * (1 + squash)) / 2, w - s * (1 - squash) - w * 0.05, s * (1 + squash), s * (1 - squash));
  }
  function drawMascot(now) {
    const cv = $('mascot'), g = cv.getContext('2d'), w = cv.width;
    const t = (now / 1000) % 1.1, hop = Math.max(0, Math.sin(t / 1.1 * Math.PI * 2)) ;
    const squash = t > 0.55 && t < 0.75 ? Math.sin((t - 0.55) / 0.2 * Math.PI) * 0.12 : 0;
    g.clearRect(0, 0, w, w);
    const s = w * 0.62, img = R.sprite(2, ((now / 1000) % 3.4) < 0.15 ? 'c' : 'o', Math.round(s));
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(w / 2, w * 0.93, s * 0.4 * (1 - hop * 0.3), s * 0.06, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(img, (w - s * (1 + squash)) / 2, w * 0.92 - s * (1 - squash) - hop * w * 0.2, s * (1 + squash), s * (1 - squash));
    const minis = [1, 3, 4];
    minis.forEach((c, k) => {
      const ms = w * 0.17, ph = ((now / 1000) * 1.6 + k * 0.7) % 2;
      const y = w * 0.9 - ms - Math.abs(Math.sin(ph * Math.PI)) * w * 0.12;
      g.drawImage(R.sprite(c, 'o', Math.round(ms)), k === 0 ? w * 0.02 : k === 1 ? w * 0.81 : w * 0.1, k === 2 ? y - w * 0.45 : y, ms, ms);
    });
  }

  // ---- input: buttons ----
  const me = () => (game && !game.paused && !game.over ? game.players[0] : null);
  function act(a) {
    const p = me(); if (!p || p.cpu) return;
    if (a === 'left') p.move(-1); else if (a === 'right') p.move(1);
    else if (a === 'cw') p.rotate(1); else if (a === 'ccw') p.rotate(-1);
    else if (a === 'drop') p.hardDrop(); else if (a === 'down') p.stepDown();
  }
  document.querySelectorAll('.ctl').forEach(btn => {
    let timer = null;
    const a = btn.dataset.act, repeat = a === 'left' || a === 'right';
    const stop = () => { clearTimeout(timer); timer = null; };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); S.unlock(); act(a);
      if (repeat) { const loop = (d) => { timer = setTimeout(() => { act(a); loop(55); }, d); }; loop(180); }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, stop));
  });

  // ---- input: swipe on the field area ----
  let touch = null;
  $('arena').addEventListener('pointerdown', (e) => {
    if (!me()) return;
    S.unlock();
    touch = { x: e.clientX, y: e.clientY, t: performance.now(), ax: e.clientX, ay: e.clientY, moved: false };
    $('arena').setPointerCapture && $('arena').setPointerCapture(e.pointerId);
  });
  $('arena').addEventListener('pointermove', (e) => {
    if (!touch) return;
    const p = me(); if (!p) return;
    const step = cs[0] * 0.85;
    while (e.clientX - touch.ax >= step) { p.move(1); touch.ax += step; touch.moved = true; }
    while (touch.ax - e.clientX >= step) { p.move(-1); touch.ax -= step; touch.moved = true; }
    const vstep = cs[0] * 0.7;
    while (e.clientY - touch.ay >= vstep && Math.abs(e.clientY - touch.y) > Math.abs(e.clientX - touch.x)) { p.stepDown(); touch.ay += vstep; touch.moved = true; }
    if (Math.abs(e.clientY - touch.ay) > vstep * 2) touch.ay = e.clientY - vstep; // don't let upward drags accumulate
  });
  function endTouch(e) {
    if (!touch) return;
    const p = me(), dt = performance.now() - touch.t, dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (p) {
      if (dy > cs[0] * 1.2 && dt < 220 && Math.abs(dx) < dy) p.hardDrop();       // quick flick down
      else if (!touch.moved && Math.hypot(dx, dy) < 12 && dt < 350) p.rotate(1); // tap
    }
    touch = null;
  }
  $('arena').addEventListener('pointerup', endTouch);
  $('arena').addEventListener('pointercancel', () => { touch = null; });

  // ---- input: keyboard ----
  document.addEventListener('keydown', (e) => {
    if (current !== 'game') return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { setPause(!(game && game.paused)); return; }
    const p = me(); if (!p || p.cpu) return;
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'cw', x: 'cw', X: 'cw', z: 'ccw', Z: 'ccw', ' ': 'drop' };
    if (e.key === 'ArrowDown') { p.soft = true; e.preventDefault(); return; }
    const a = map[e.key];
    if (a) { e.preventDefault(); if (a === 'drop' && e.repeat) return; if ((a === 'cw' || a === 'ccw') && e.repeat) return; act(a); }
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'ArrowDown') { const p = me(); if (p) p.soft = false; } });

  // ---- debug / test hooks (used by automated tests) ----
  window.GBP = {
    timeScale: 1,
    get game() { return game; },
    start: startGame, show, layout,
    setAutoPlayer(lv) { autoPlayer = lv; },
    perf, FX, records: () => records,
    setBoard(i, rows) { // rows top-to-bottom like the unit tests
      const b = L.newBoard();
      rows.slice().reverse().forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') b[L.idx(x, y)] = ch === 'G' ? L.GARBAGE : +ch; }));
      game.players[i].board = b;
    },
    act,
  };

  // ---- PWA ----
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  GBGame.AI.init();
  updateHi();
  requestAnimationFrame(frame);
})();
