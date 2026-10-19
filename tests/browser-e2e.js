// Headless Chrome checks: layout at 3 sizes, inputs, chain popup, CPU match to completion, console errors.
// usage: node tests/browser-e2e.js  (needs puppeteer-core; URL env var to override)
const path = require('path');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = process.env.URL || 'http://127.0.0.1:8797/index.html';
const SS = path.join(__dirname, '..', 'screenshots') + '/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const results = {};

async function newPage(br, w, h, touch) {
  const pg = await br.newPage();
  await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h} console: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h} pageerror: ${e.message}`));
  await pg.goto(URL, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => localStorage.clear());
  return pg;
}

// every control reachable, nothing overlapping, fields inside the viewport
function layoutCheck(pg) {
  return pg.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const out = [];
    document.querySelectorAll('#controls .ctl, #pauseBtn').forEach(b => {
      const q = b.getBoundingClientRect(), el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      if (!(el === b || b.contains(el))) out.push('covered:' + b.dataset.act);
      if (q.bottom > innerHeight || q.right > innerWidth || q.left < 0) out.push('offscreen:' + (b.dataset.act || 'pause'));
    });
    const ctl = r('controls'), hud = document.querySelector('.hud').getBoundingClientRect();
    for (const id of ['field0', 'field1', 'strip0', 'strip1']) {
      const f = r(id); if (!f.width) continue;
      if (f.bottom > ctl.top + 1) out.push(id + ' overlaps controls');
      if (f.top < hud.bottom - 1) out.push(id + ' overlaps hud');
      if (f.left < 0 || f.right > innerWidth) out.push(id + ' offscreen');
    }
    if (r('field0').width && r('field1').width && r('field0').right > r('field1').left) out.push('fields overlap');
    return { problems: out, field0: Math.round(r('field0').width) + 'x' + Math.round(r('field0').height), field1: Math.round(r('field1').width) + 'x' + Math.round(r('field1').height) };
  });
}

(async () => {
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], headless: 'new' });

  // ---------- layouts ----------
  for (const [w, h, touch] of [[390, 844, true], [375, 667, true], [1280, 800, false]]) {
    const pg = await newPage(br, w, h, touch);
    await sleep(500);
    if (w === 390) await pg.screenshot({ path: SS + 'title.png' });
    await pg.click('[data-go=menu]'); await sleep(200);
    if (w === 390) await pg.screenshot({ path: SS + 'menu.png' });
    await pg.click('#startEndless'); await sleep(600);
    const endless = await layoutCheck(pg);
    await pg.screenshot({ path: SS + `layout_endless_${w}x${h}.png` });
    await pg.evaluate(() => { GBP.show('menu'); });
    await pg.click('[data-lv=strong]'); await pg.click('#startBattle'); await sleep(1500);
    const battle = await layoutCheck(pg);
    await pg.screenshot({ path: SS + `layout_battle_${w}x${h}.png` });
    results[`layout ${w}x${h}`] = { endless, battle };
    await pg.close();
  }

  // ---------- inputs (buttons, swipe, keyboard) ----------
  {
    const pg = await newPage(br, 390, 844, true);
    await pg.click('[data-go=menu]'); await pg.click('#startEndless'); await sleep(400);
    const pos = () => pg.evaluate(() => { const p = GBP.game.players[0].pair; return p && { x: p.x, y: p.y, rot: p.rot }; });
    const log = {};
    const p0 = await pos();
    await pg.tap('[data-act=left]'); await sleep(80); log.btnLeft = (await pos()).x === p0.x - 1;
    await pg.tap('[data-act=cw]'); await sleep(80); log.btnRotate = (await pos()).rot === 1;
    await pg.tap('[data-act=ccw]'); await sleep(80); log.btnRotateCcw = (await pos()).rot === 0;
    const f = await pg.evaluate(() => { const r = document.getElementById('field0').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3, cs: r.width / 6 }; });
    // swipe right by ~2 columns
    let before = await pos();
    await pg.touchscreen.touchStart(f.x, f.y);
    for (let i = 1; i <= 8; i++) { await pg.touchscreen.touchMove(f.x + i * f.cs * 0.25, f.y); await sleep(16); }
    await pg.touchscreen.touchEnd(); await sleep(80);
    log.swipeRight2 = (await pos()).x - before.x;
    // tap rotates
    before = await pos();
    await pg.touchscreen.tap(f.x, f.y); await sleep(80);
    log.tapRotate = (await pos()).rot !== before.rot;
    // quick flick down = hard drop (new pair spawns)
    const placedBefore = await pg.evaluate(() => GBP.game.players[0].placed);
    await pg.touchscreen.touchStart(f.x, f.y);
    for (let i = 1; i <= 4; i++) { await pg.touchscreen.touchMove(f.x, f.y + i * f.cs * 0.6); await sleep(10); }
    await pg.touchscreen.touchEnd(); await sleep(100);
    log.flickHardDrop = (await pg.evaluate(() => GBP.game.players[0].placed)) === placedBefore + 1;
    await sleep(600);
    // keyboard
    before = await pos();
    await pg.keyboard.press('ArrowRight'); await sleep(50); log.keyRight = (await pos()).x === before.x + 1;
    await pg.keyboard.press('z'); await sleep(50); log.keyZ = (await pos()).rot === 3;
    const pl = await pg.evaluate(() => GBP.game.players[0].placed);
    await pg.keyboard.press('Space'); await sleep(100); log.keySpace = (await pg.evaluate(() => GBP.game.players[0].placed)) === pl + 1;
    // pause
    await pg.tap('#pauseBtn'); await sleep(100); log.pause = await pg.evaluate(() => GBP.game.paused && document.getElementById('pause').classList.contains('active'));
    await pg.tap('#resumeBtn'); await sleep(100);
    // random short game with button taps until game over, then the result screen
    await pg.evaluate(() => { GBP.timeScale = 3; });
    const acts = ['left', 'right', 'cw', 'ccw', 'drop'];
    for (let i = 0; i < 400; i++) {
      if (await pg.evaluate(() => !!(GBP.lastResult))) break;
      const a = acts[Math.floor(Math.random() * acts.length)];
      await pg.evaluate(a => GBP.act(a), a); await sleep(25);
    }
    await sleep(1600);
    log.reachedResult = await pg.evaluate(() => document.getElementById('result').classList.contains('active'));
    log.result = await pg.evaluate(() => GBP.lastResult);
    await pg.screenshot({ path: SS + 'result.png' });
    results.inputs = log;
    await pg.close();
  }

  // ---------- endless chain popup + GIF frames ----------
  {
    const pg = await newPage(br, 390, 844, true);
    await pg.click('[data-go=menu]'); await pg.click('#startEndless'); await sleep(500);
    await pg.evaluate(() => {
      GBP.setBoard(0, [
        '.3....', '.3....', '.4.2..', '24.32.', '11.423', '313441', '331211',
      ]);
    });
    // trigger: red/yellow pair into column 3 -> 4-chain
    const chainInfo = await pg.evaluate(() => {
      const g = GBP.game, p = g.players[0];
      p.pair = { x: 2, y: 11, rot: 0, a: 1, b: 4 }; p.score = 12340;
      return GBLogic.resolve(GBLogic.place(p.board, GBLogic.hardDropY(p.board, p.pair)).board).chain;
    });
    await sleep(400);
    await pg.evaluate(() => { GBP.timeScale = 0.6; GBP.game.players[0].hardDrop(); });
    const frames = [];
    const t0 = Date.now(); let shot = false, n = 0;
    while (Date.now() - t0 < 4200) {
      const f = SS + `../.gif/f${String(n++).padStart(3, '0')}.png`;
      frames.push(f);
      await pg.screenshot({ path: f, clip: await pg.evaluate(() => { const r = document.getElementById('side0').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }) });
      if (!shot && await pg.evaluate(() => { const e = document.getElementById('pop0'); return e.textContent.startsWith(String(Math.max(2, GBP.game.players[0].chain))) && e.classList.contains('show') && GBP.game.players[0].chain >= 3; })) {
        await sleep(120); await pg.screenshot({ path: SS + 'endless_chain.png' }); shot = true;
      }
    }
    results.chainPopup = { expectedChain: chainInfo, maxChainAfter: await pg.evaluate(() => GBP.game.players[0].maxChain), screenshot: shot, gifFrames: frames.length };
    await pg.close();
  }

  // ---------- CPU battle: mid-game screenshot, then run to completion ----------
  for (const lv of ['weak', 'normal', 'strong']) {
    const pg = await newPage(br, 390, 844, true);
    await pg.evaluate(() => GBP.setAutoPlayer('normal'));
    await pg.click('[data-go=menu]'); await pg.click(`[data-lv=${lv}]`); await pg.click('#startBattle');
    if (lv === 'strong') {
      await pg.evaluate(() => { GBP.timeScale = 2.5; });
      await pg.waitForFunction(() => GBP.game && (GBP.game.players[1].maxChain >= 3 || GBP.game.players[0].pending + GBP.game.players[1].pending > 0) || GBP.lastResult, { timeout: 120000, polling: 50 });
      await sleep(300);
      await pg.evaluate(() => { GBP.timeScale = 1; }); await sleep(400);
      await pg.screenshot({ path: SS + 'cpu_battle.png' });
    }
    await pg.evaluate(() => { GBP.timeScale = 6; });
    const t0 = Date.now();
    await pg.waitForFunction(() => !!GBP.lastResult, { timeout: 300000, polling: 250 });
    await sleep(300);
    results['battle ' + lv] = { ...(await pg.evaluate(() => ({ ...GBP.lastResult,  }))), wallSec: Math.round((Date.now() - t0) / 1000), resultScreen: await pg.evaluate(() => document.getElementById('result').classList.contains('active')) };
    await pg.close();
  }

  console.log(JSON.stringify(results, null, 1));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await br.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
