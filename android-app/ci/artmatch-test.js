// (T)rustyShelf's Art match (its issue #2), the page side: Details → Art match and Settings' Art match page, on the demo page as
// Windows (a pretend box art database: renderer/mock.js). Run (after node copy-web.js): node ci/artmatch-test.js www ../out/artmatch
//   - a console game's Details has "Art match: automatic"; it opens the page, which searches under the game's own name
//   - searching another name lists the database's games (LaunchBox with its pictures, libretro); Use keeps it with the game and
//     the button says so; Back to automatic clears it
//   - a PC game has no Art match button, and neither has Android (the app there has none)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/artmatch');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
const PAGE = `(() => {
  window.__w = ms => new Promise(res => setTimeout(res, ms));
  window.__key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  window.__rows = () => [...document.querySelectorAll('#bss .bss-row, #bss .bss-head')].map(r => r.textContent.replace(/\\s+/g, ' ').trim());
  window.__row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
  window.__btn = () => document.getElementById('dArtMatch');
  window.__closeSettings = async () => { if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await __w(900); } };
  window.__toRom = async () => { for (let i = 0; i < 8; i++) { const g = Shelf._lib.cur(); if (g && g.kind === 'rom') return g; __key('ArrowRight'); await __w(500); } return Shelf._lib.cur(); };
  window.__details = async () => { __key('i'); await __w(1000); };
})()`;
server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = `http://localhost:${server.address().port}/index.html`;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); await page.goto(base + '?platform=windows&shelf=1&pcx=1'); await page.waitForTimeout(6000);
    await page.evaluate(PAGE);
    const a = await page.evaluate(async () => {
      const g = await __toRom(); await __details(); const out = { title: g && g.title, id: g && g.id, visible: !!__btn() && !__btn().hidden, text: __btn() ? __btn().textContent : '' };
      __btn().click(); await __w(1800); out.firstRows = __rows(); out.searched = (window.__amSearch || []).map(x => x.term);
      await __closeSettings(); return out; });
    check('a console game\'s Details has "Art match: automatic"', a.visible && a.text === 'Art match: automatic', JSON.stringify(a));
    check('…which opens the Art match page and searches under the game\'s own name', a.firstRows.some(r => /^Search for/.test(r)) && a.searched[0] === a.title, JSON.stringify({ rows: a.firstRows, searched: a.searched }));
    const b = await page.evaluate(async id => {
      Setup.open({ page: 'artmatch', id, title: 'Test', term: 'budokai tenkaichi', current: '' }); await __w(1800); const rows = __rows();
      const r = __row('Dragon Ball Z: Budokai Tenkaichi 3'); if (r) r.click(); await __w(1500);
      return { rows, set: window.__amSet || [], saved: ((await trustyshelf.getConfig()).config.games || {})[id], open: !!(window.Settings && Settings.isOpen && Settings.isOpen()), toast: (document.getElementById('toast') || {}).textContent || '' }; }, a.id);
    check('another name lists the database\'s games: LaunchBox ones with their pictures, and libretro\'s, not other games', b.rows.some(r => /^Dragon Ball Z: Budokai Tenkaichi 3LaunchBox · 12 pictures/.test(r)) && b.rows.some(r => /^Dragon Ball Z - Budokai Tenkaichi 3libretro/.test(r)) && !b.rows.some(r => /Budokai 3LaunchBox/.test(r)) && !b.rows.some(r => /Back to automatic/.test(r)), JSON.stringify(b.rows));
    check('Use keeps it with the game (in the settings), closes Settings and says so', b.set.length === 1 && b.set[0].name === 'Dragon Ball Z: Budokai Tenkaichi 3' && b.saved && b.saved.artName === 'Dragon Ball Z: Budokai Tenkaichi 3' && !b.open && /its art comes from "Dragon Ball Z: Budokai Tenkaichi 3"/.test(b.toast), JSON.stringify(b));
    const c = await page.evaluate(async id => {
      __key('Escape'); await __w(600); __key('Escape'); await __w(600); await __details(); const text = __btn() ? __btn().textContent : '';
      __btn().click(); await __w(1800); const rows = __rows(); const r = __row('Back to automatic'); if (r) r.click(); await __w(1500);
      return { text, rows, set: window.__amSet || [], saved: ((await trustyshelf.getConfig()).config.games || {})[id] }; }, a.id);
    check('the button then shows the game picked', /^Art match: Dragon Ball Z: Budokai Tenk…$/.test(c.text), c.text);
    check('Back to automatic is offered, and clears it', c.rows.some(r => /^Back to automatic/.test(r)) && c.set.length === 2 && c.set[1].name === '' && !(c.saved && c.saved.artName), JSON.stringify({ rows: c.rows.slice(0, 4), set: c.set, saved: c.saved }));
    const d = await page.evaluate(async () => {
      await __closeSettings(); __key('Escape'); await __w(600);
      const t = [...document.querySelectorAll('#tabs .tab')].find(x => x.textContent.trim() === 'PC'); if (t) t.click(); await __w(1500);
      for (let i = 0; i < 14 && Shelf._qs().g !== 'Ember Trail'; i++) { __key('ArrowRight'); await __w(300); }
      await __details(); return { game: Shelf._qs().g, hidden: !__btn() || __btn().hidden }; });
    check('a PC game has no Art match button', d.game === 'Ember Trail' && d.hidden, JSON.stringify(d));
    await page.screenshot({ path: path.join(OUT, 'artmatch.png') });
    check('No script errors (Windows)', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
    // Android: no Art match
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } }), p2 = await ctx2.newPage(), errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(base + '?fakeNative=1'); await p2.waitForTimeout(4000);
    await p2.evaluate(async () => { const api = window.trustyshelf, c = (await api.getConfig()).config, det = await api.detect(); const d = await api.pick({ kind: 'folder' }); c.systems.gc.romDirs = [d]; c.systems.gc.emulator = det.systems.gc.emulator; c.setupDone = true; await api.saveConfig(c); await api.scan(); });
    await p2.goto(base + '?fakeNative=1'); await p2.waitForFunction(() => window.Shelf && Shelf._qs && Shelf._qs().g, null, { timeout: 90000, polling: 250 }); await p2.waitForTimeout(1500);
    await p2.evaluate(PAGE);
    const e = await p2.evaluate(async () => { const g = await __toRom(); await __details(); return { rom: !!g && g.kind === 'rom', hidden: !__btn() || __btn().hidden, api: !!trustyshelf.artMatchSearch }; });
    check('Android: no Art match (the app there has none)', e.rom && e.hidden && !e.api, JSON.stringify(e));
    check('No script errors (Android)', !errs2.length, errs2.slice(0, 3).join(' | '));
    await ctx2.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
