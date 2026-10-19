// v2 headless checks: fever effect, all-clear, achievements, records, shapes, reduced motion, perf, layout.
const path = require('path');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const URL = process.env.URL || 'http://127.0.0.1:8797/index.html';
const SS = path.join(__dirname, '..', 'screenshots') + '/';
const FR = '/tmp/gbp-fever/';
require('fs').mkdirSync(FR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [], out = {};
const FEVER = { rows: ['..4...', '..2...', '..3...', '..3.3.', '..424.', '.3432.', '.34331', '.32441', '123343', '113113'], pair: { x: 1, rot: 1, a: 4, b: 1 } };

async function page(br, w, h, touch = true) {
  const pg = await br.newPage();
  await pg.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h} pageerror: ${e.message}`));
  pg.on('dialog', d => d.accept());
  await pg.goto(URL, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' });
  return pg;
}
const startEndless = async pg => { await pg.click('[data-go=menu]'); await pg.click('#startEndless'); await sleep(400); };
const fire = (pg, setup) => pg.evaluate(({ rows, pair }) => {
  GBP.setBoard(0, rows); const p = GBP.game.players[0];
  p.pair = { ...pair, y: 11 }; p.fallT = 0; p.hardDrop();
}, setup);

(async () => {
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'], headless: 'new' });

  // 1) fever chain + achievement toast + GIF + perf (CPU throttled 4x ~ mid phone)
  {
    const pg = await page(br, 390, 844);
    await startEndless(pg);
    const cdp = await pg.target().createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await pg.evaluate(() => { const p = GBP.perf; p.frames = p.slow = p.worst = 0; GBP.FX.stats.maxParticles = 0; });
    await fire(pg, FEVER);
    let n = 0, feverShot = false, toastShot = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      const st = await pg.evaluate(() => ({ fever: document.getElementById('game').classList.contains('fever'), chain: GBP.game && GBP.game.players[0].chain, toast: !!document.querySelector('.toast:not(.out)') }));
      if (n < 60) await pg.screenshot({ path: FR + `f${String(n++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 80 });
      if (!feverShot && st.fever && st.chain >= 6) { await sleep(150); await pg.screenshot({ path: SS + 'v2_fever_chain.png' }); feverShot = true; }
      if (!toastShot && st.toast) { await pg.screenshot({ path: SS + 'v2_achievement_popup.png' }); toastShot = true; }
      if (feverShot && toastShot && n >= 60) break;
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    out.fever = await pg.evaluate(() => ({ maxChain: GBP.game.players[0].maxChain, unlocked: Object.keys(GBP.records().achievements),
      perf: { ...GBP.perf, worst: Math.round(GBP.perf.worst * 1000) + 'ms', maxParticles: GBP.FX.stats.maxParticles } }));
    out.fever.feverShot = feverShot; out.fever.toastShot = toastShot; out.fever.frames = n;
    // all clear on a fresh board
    await sleep(1500);
    const before = await pg.evaluate(() => GBP.game.players[0].score);
    await fire(pg, { rows: ['1.....', '11....'], pair: { x: 2, rot: 0, a: 1, b: 1 } });
    await pg.waitForFunction(() => document.getElementById('banner').textContent.includes('ぜんけし'), { timeout: 8000 }).catch(() => {});
    await sleep(250);
    await pg.screenshot({ path: SS + 'v2_allclear.png' });
    out.allClear = await pg.evaluate(b => ({ banner: document.getElementById('banner').textContent, allClears: GBP.game.players[0].allClears, gained: GBP.game.players[0].score - b }), before);
    await pg.close();
  }

  // 2) records: one real endless game (hard drops), plus a few logged games for display, then the screen
  {
    const pg = await page(br, 390, 844);
    await startEndless(pg);
    await pg.evaluate(() => { GBP.timeScale = 3; });
    for (let i = 0; i < 300 && !(await pg.evaluate(() => !!GBP.lastResult)); i++) { await pg.evaluate(i => GBP.act(['left', 'drop', 'right', 'drop', 'cw'][i % 5]), i); await sleep(30); }
    await sleep(1500);
    out.realGame = await pg.evaluate(() => ({ totalGames: GBP.records().totalGames, history: GBP.records().history.length, result: document.getElementById('result').classList.contains('active') }));
    await pg.evaluate(() => { // demo data so the screen shows every section (test-only)
      let r = GBP.records();
      const add = g => { r = GBRecords.addGame(r, { time: 95, cleared: 60, allClears: 0, ...g }).records; };
      add({ mode: 'endless', score: 48210, maxChain: 6 }); add({ mode: 'endless', score: 12030, maxChain: 4 });
      add({ mode: 'battle', level: 'normal', win: true, score: 8800, maxChain: 5 }); add({ mode: 'battle', level: 'strong', win: false, score: 3100, maxChain: 3 });
      add({ mode: 'battle', level: 'weak', win: true, score: 5100, maxChain: 4 });
      GBRecords.save(localStorage, r);
    });
    await pg.reload({ waitUntil: 'networkidle0' });
    await pg.click('[data-go=records]'); await sleep(300);
    await pg.screenshot({ path: SS + 'v2_records.png' });
    await pg.evaluate(() => { document.getElementById('records').scrollTop = 99999; }); await sleep(200);
    await pg.screenshot({ path: SS + 'v2_records_bottom.png' });
    out.records = await pg.evaluate(() => ({ top: document.querySelectorAll('#recTop li').length, badgesUnlocked: document.querySelectorAll('.badge:not(.locked)').length, history: document.querySelectorAll('#recHistory li').length, cpuRows: document.querySelectorAll('#recCpu tr').length - 1 }));
    await pg.click('#resetRecords'); await sleep(200);
    out.records.afterReset = await pg.evaluate(() => GBP.records().totalGames);
    await pg.close();
  }

  // 3) shapes setting + mixed-shape gameplay
  {
    const pg = await page(br, 390, 844);
    await pg.click('[data-open=settings]'); await sleep(150);
    await pg.select('#optShape', 'perColor'); await sleep(150);
    await pg.screenshot({ path: SS + 'v2_shapes_setting.png' });
    await pg.select('#optShape', 'custom'); await sleep(150);
    await pg.select('#customShapes select[data-color="2"]', 'cloud'); await sleep(150);
    await pg.screenshot({ path: SS + 'v2_shapes_custom.png' });
    out.shapes = await pg.evaluate(() => ({ pickers: document.querySelectorAll('#customShapes select').length, blue: GBRender.shapeOf(2), garbage: GBRender.shapeOf(9) }));
    await pg.select('#optShape', 'perColor');
    await pg.click('[data-close=settings]');
    await pg.evaluate(() => GBP.setAutoPlayer('normal'));
    await pg.click('[data-go=menu]'); await pg.click('[data-lv=normal]'); await pg.click('#startBattle');
    await pg.evaluate(() => { GBP.timeScale = 3; });
    await pg.waitForFunction(() => GBP.game && (GBP.game.players[0].pending + GBP.game.players[1].pending > 0 && GBP.game.players[0].placed > 14) || GBP.lastResult, { timeout: 120000, polling: 100 });
    await pg.evaluate(() => { GBP.timeScale = 1; }); await sleep(900);
    await pg.screenshot({ path: SS + 'v2_mixed_shapes.png' });
    await pg.close();
  }

  // 4) reduced motion + calm setting: no shake, no fever
  {
    const pg = await page(br, 390, 844);
    await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await startEndless(pg);
    await fire(pg, FEVER);
    let shook = false, fever = false;
    for (let i = 0; i < 40; i++) { const s = await pg.evaluate(() => ({ t: document.getElementById('arena').style.transform, f: document.getElementById('game').classList.contains('fever') })); shook ||= !!s.t; fever ||= s.f; await sleep(100); }
    out.reducedMotion = { shook, fever, maxChain: await pg.evaluate(() => GBP.game.players[0].maxChain) };
    await pg.close();
  }

  // 5) layout at three sizes: game (both modes, during an effect), records, settings
  for (const [w, h, t] of [[390, 844, true], [375, 667, true], [1280, 800, false]]) {
    const pg = await page(br, w, h, t);
    const res = {};
    const chk = (sel) => pg.evaluate((sel) => {
      const probs = [];
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width) return;
        if (r.right > innerWidth + 1 || r.left < -1) probs.push((el.id || el.className) + ' x-overflow');
        const e = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
        if (r.top >= 0 && r.bottom <= innerHeight && !(e === el || el.contains(e))) probs.push((el.id || el.dataset.act || el.textContent.slice(0, 8)) + ' covered');
      });
      return probs;
    }, sel);
    await startEndless(pg);
    await fire(pg, FEVER); await sleep(1800); // mid-effect
    res.endless = await chk('#controls .ctl, #pauseBtn');
    res.fieldVsControls = await pg.evaluate(() => document.getElementById('field0').getBoundingClientRect().bottom <= document.getElementById('controls').getBoundingClientRect().top + 1);
    await pg.screenshot({ path: SS + `v2_layout_endless_${w}x${h}.png` });
    await pg.evaluate(() => GBP.show('menu')); await pg.click('#startBattle'); await sleep(800);
    res.battle = await chk('#controls .ctl, #pauseBtn');
    await pg.evaluate(() => GBP.show('records')); await sleep(200);
    res.records = await chk('#records .btn, #topSeg button');
    await pg.screenshot({ path: SS + `v2_layout_records_${w}x${h}.png` });
    await pg.evaluate(() => { GBP.show('title'); document.getElementById('settings').classList.add('active'); });
    await pg.select('#optShape', 'custom'); await sleep(150);
    res.settings = await chk('#settings select, #settings input, #settings .btn');
    res.settingsFits = await pg.evaluate(() => { const r = document.querySelector('#settings .panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await pg.screenshot({ path: SS + `v2_layout_settings_${w}x${h}.png` });
    out[`layout ${w}x${h}`] = res;
    await pg.close();
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await br.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
