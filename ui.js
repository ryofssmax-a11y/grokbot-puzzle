/* Grok Botパズル — screens, layout, input, main loop */
(function () {
  'use strict';
  const L = GBLogic, R = GBRender, S = GBSound;
  const $ = (id) => document.getElementById(id);
  const LEVEL_JP = { weak: 'よわい', normal: 'ふつう', strong: 'つよい' };

  // ---- settings / storage ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gbp-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gbp-' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const settings = { sound: store.get('sound', true), colors: store.get('colors', 4) };
  S.on = settings.sound;
  $('optSound').checked = settings.sound;
  $('optColors').value = String(settings.colors);
  $('optSound').onchange = (e) => { settings.sound = S.on = e.target.checked; store.set('sound', settings.sound); };
  $('optColors').onchange = (e) => { settings.colors = +e.target.value; store.set('colors', settings.colors); updateHi(); };
  const hiKey = () => 'hi' + settings.colors;
  function updateHi() { $('hiScore').textContent = store.get(hiKey(), 0).toLocaleString(); }

  // ---- screens ----
  let current = 'title';
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    current = id;
    if (id === 'menu') updateHi();
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
    sfx: (name, arg) => { const f = S[name]; if (f && !(name === 'move' && game && game.players[0].cpu)) f(arg); },
    chain: (p, step) => {
      if (step.chain >= 2) popup(p.id, step.chain + 'れんさ!');
    },
    spawn: () => {},
    end: (res) => {
      if (res.mode === 'battle') res.win ? S.win() : S.lose(); else S.lose();
      setTimeout(() => showResult(res), 1100);
    },
  };
  function popup(id, text) {
    const el = $('pop' + id);
    el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function showResult(res) {
    $('resTitle').textContent = res.mode === 'battle' ? (res.win ? 'かち！' : 'まけ…') : 'ゲームオーバー';
    $('resScore').textContent = res.score.toLocaleString();
    $('resChain').textContent = res.maxChain + ' れんさ';
    if (res.mode === 'endless') {
      const hi = store.get(hiKey(), 0), isNew = res.score > hi;
      if (isNew) store.set(hiKey(), res.score);
      $('resHiLabel').textContent = 'ハイスコア';
      $('resHi').innerHTML = Math.max(hi, res.score).toLocaleString() + (isNew ? '<span class="new">NEW!</span>' : '');
    } else {
      $('resHiLabel').textContent = '相手';
      $('resHi').textContent = 'CPU ' + LEVEL_JP[res.level];
    }
    drawFace($('resultFace'), res.win === false || res.mode === 'endless' ? 9 : 2, 0);
    window.GBP.lastResult = res;
    game = null;
    show('result');
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
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * (window.GBP.timeScale || 1);
    last = now;
    if (game) {
      game.update(dt);
      const me = game.players[0];
      $('score').textContent = me.score.toLocaleString();
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
