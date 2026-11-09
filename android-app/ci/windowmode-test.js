// (T)rustyShelf's per-game window mode, the page side (Details → Window), on the demo page as Windows (?pcx=1: a Quiver game on the
// Custom shelf, an Epic, GOG and Ubisoft games on the PC shelf).
// Run (after node copy-web.js): node ci/windowmode-test.js www ../out/windowmode
//   - a Quiver game's Details has a Window button: it starts on "the game's own", each press goes on (borderless → windowed → the
//     game's own), says what it means, and the choice is saved with the game
//   - a GOG game has it too; an Epic game and a Ubisoft game (started by their own launchers) have none
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/windowmode');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); await page.goto(`http://localhost:${server.address().port}/index.html?platform=windows&shelf=1&pcx=1`); await page.waitForTimeout(6000);
    const r = await page.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms)), key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const tab = async n => { const t = [...document.querySelectorAll('#tabs .tab')].find(x => x.textContent.trim() === n); if (t) t.click(); await w(1500); return !!t; };
      const go = async t => { for (let i = 0; i < 14 && Shelf._qs().g !== t; i++) { key('ArrowRight'); await w(300); } for (let i = 0; i < 14 && Shelf._qs().g !== t; i++) { key('ArrowLeft'); await w(300); } return Shelf._qs().g === t; };
      const btn = () => document.getElementById('dWindow'), seen = () => !!btn() && !btn().hidden, text = () => (btn() || {}).textContent || '';
      const cfg = async id => ((await trustyshelf.getConfig()).config.games || {})[id];
      const out = {};
      // a Quiver game on the Custom shelf
      out.customTab = await tab('Custom'); out.found = await go('Quarantine'); key('i'); await w(900);
      out.quiver = { visible: seen(), first: text() };
      const id = (Shelf._lib.cur() || {}).id; out.id = id;
      const steps = [];
      for (let i = 0; i < 3; i++) { btn().click(); await w(700); steps.push({ text: text(), saved: ((await cfg(id)) || {}).window || '', toast: ((document.getElementById('toast') || {}).textContent || '') }); }
      out.steps = steps; out.calls = (window.__winCalls || []).map(c => c.w);
      key('Escape'); await w(900);
      // an Epic game on the PC shelf, and a Steam game
      out.pcTab = await tab('PC'); out.epic = await go('Ember Trail'); key('i'); await w(900); out.epicBtn = seen();
      key('Escape'); await w(900); out.gog = await go('Lantern Keep'); key('i'); await w(900); out.gogBtn = seen();
      key('Escape'); await w(900); out.ubi = await go('Harbor Run'); key('i'); await w(900); out.ubiBtn = seen();
      return out; });
    check('a Quiver game\'s Details has a Window button, starting on "the game\'s own"', r.found && r.quiver.visible && /^Window: the game's own$/.test(r.quiver.first), JSON.stringify(r.quiver));
    check('each press goes on: borderless → windowed → the game\'s own, saved with the game each time, with a plain toast',
      r.steps.length === 3 && /borderless/.test(r.steps[0].text) && r.steps[0].saved === 'borderless' && /Its frame comes off/.test(r.steps[0].toast)
      && /windowed/.test(r.steps[1].text) && r.steps[1].saved === 'windowed'
      && /the game's own/.test(r.steps[2].text) && r.steps[2].saved === '' && JSON.stringify(r.calls) === JSON.stringify(['borderless', 'windowed', '']), JSON.stringify(r.steps));
    check('a GOG game (the shelf starts it itself) has the button; an Epic and a Ubisoft game (their launchers start them) do not',
      r.epic && r.gog && r.ubi && r.gogBtn === true && r.epicBtn === false && r.ubiBtn === false, JSON.stringify({ epic: r.epicBtn, gog: r.gogBtn, ubisoft: r.ubiBtn, found: [r.epic, r.gog, r.ubi] }));
    await page.screenshot({ path: path.join(OUT, 'windowmode.png') });
    check('No script errors', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
