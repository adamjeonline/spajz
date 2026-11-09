// (T)rustyShelf's box art card on Android (Boxshelf's issue 9), in a browser on the adapter's pretend device (?fakeNative=1).
// Run (after node copy-web.js): node ci/android-artcard-test.js www ../out/android-artcard
//   - a box art run shows Android's own progress card, and the quick menu gets the Box art download row (Pause / Resume /
//     Cancel, as the art card has on Windows)
//   - Pause holds the run (no new pictures are started), Resume carries on
//   - Cancel drops what's still queued: the run ends
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/android-artcard');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });

server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 853, height: 480 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = `http://localhost:${server.address().port}/index.html?fakeNative=1`;
    await page.goto(url); await page.waitForTimeout(4000);
    // three consoles with games, then the shelf
    await page.evaluate(async () => { const api = window.trustyshelf, info = await api.getConfig(), det = await api.detect(), c = info.config;
      for (const id of ['gc', 'psx', 'snes']) { c.systems[id].romDirs = [await api.pick({ kind: 'folder' })]; c.systems[id].emulator = det.systems[id].emulator; }
      c.setupDone = true; c.ui.autoCovers = false; await api.saveConfig(c); });
    await page.goto(url); await page.waitForTimeout(6000);
    const r = await page.evaluate(async () => { const api = window.trustyshelf, wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
      const own = () => document.querySelector('.bs-artcard'), shown = () => !!document.querySelector('.bs-artcard.show');
      const done = () => +((/(\d+)\s*\/\s*\d+/.exec((own() || {}).textContent || '') || [0, -1])[1]); // (Android's own card: "12/73")
      window.__fakeArt.lat = 3000; // (slow pictures: the run lasts long enough to pause)
      out.queued = (await api.artFetchNow()).queued;
      for (let i = 0; i < 40 && !(shown() && window.BS_artOn().on); i++) await wait(150);
      await wait(800);
      out.ownCard = shown(); out.ownText = ((own() || {}).textContent || '').replace(/\s+/g, ' '); out.sharedCard = !!document.querySelector('.art-card.on'); out.state = window.BS_artOn();
      // Pause (what the quick menu row's Pause does): what was on its way finishes, nothing new starts
      await window.BS_artCmd('pause'); await wait(4000);
      const p0 = done(); await wait(3500); out.pausedStill = done() === p0; out.pausedState = window.BS_artOn();
      // the quick menu has the Box art download row while the run is there
      window.Shelf.quickMenu(); await wait(900); out.row = [...document.querySelectorAll('.qm-row')].map(e => e.textContent).find(t => /Box art download/.test(t)) || '';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(600);
      // Resume carries on
      await window.BS_artCmd('resume'); for (let i = 0; i < 30 && done() <= p0 && window.BS_artOn().on; i++) await wait(250); out.resumed = done() > p0 || !window.BS_artOn().on;
      // Cancel drops the rest: the run ends
      const total = +((/\d+\s*\/\s*(\d+)/.exec((own() || {}).textContent || '') || [0, 0])[1]), before = done(), f0 = window.__fakeArt.fetch.length; await window.BS_artCmd('cancel');
      for (let i = 0; i < 60 && window.BS_artOn().on; i++) await wait(250);
      out.ended = !window.BS_artOn().on; const f1 = window.__fakeArt.fetch.length; await wait(3000); out.stopped = window.__fakeArt.fetch.length === f1; out.doneAtCancel = before; out.total = total;
      window.__fakeArt.lat = 40; return out; });
    check('Box art run on Android: its own progress card shows (the shared desktop card doesn\'t), and the quick menu has a Box art download row',
      r.queued > 6 && r.ownCard && /\d+\s*\/\s*\d+/.test(r.ownText) && !r.sharedCard && r.state.on && /Box art download/.test(r.row), JSON.stringify(r));
    check('Pause holds the run (no new pictures start); Resume carries on', r.pausedStill && r.pausedState.paused && /paused/.test(r.pausedState.text) && r.resumed, JSON.stringify(r));
    check('Cancel drops the rest: the run ends and no more pictures are fetched', r.ended && r.stopped && r.doneAtCancel >= 0 && r.doneAtCancel < r.total, JSON.stringify(r));
    await page.screenshot({ path: path.join(OUT, 'android-artcard.png') });
    check('No script errors', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
});
