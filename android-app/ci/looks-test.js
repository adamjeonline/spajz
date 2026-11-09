// (T)rustyShelf's saved looks (Settings → Display → Looks) and the Installed filter, the page side, on the demo page as Windows.
// Run (after node copy-web.js): node ci/looks-test.js www ../out/looks
//   - Looks: Save the current look keeps the theme, size, clock, order and filter under "Look 1" (saved in the settings, with a
//     one-line summary); Update replaces it (asks twice); Apply puts the saved settings back (and reloads the screen); Delete asks twice
//   - the Sort panel's filter row has "Installed" only when some game is greyed (?notinst=1: an Epic game that isn't installed);
//     choosing it hides the greyed game and is saved with the filter
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/looks');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = `http://localhost:${server.address().port}/index.html?platform=windows&shelf=1&pcx=1`;
  try {
    // ---- the Installed filter ----
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); await page.goto(base + '&notinst=1'); await page.waitForTimeout(6000);
    const f = await page.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms)), key = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const t = [...document.querySelectorAll('#tabs .tab')].find(x => x.textContent.trim() === 'PC'); if (t) t.click(); await w(1500);
      const opts = () => [...document.querySelectorAll('#spFilter .sp-opt')].map(x => x.textContent), foot = () => document.getElementById('spFoot').textContent, num = () => +(/^(\d+) game/.exec(foot()) || [])[1];
      key('g'); await w(900); const out = { opts: opts(), before: num() };
      const b = [...document.querySelectorAll('#spFilter .sp-opt')].find(x => x.textContent === 'Installed'); if (b) b.click(); await w(1500);
      out.after = num(); out.on = (document.querySelector('#spFilter .sp-opt.on') || {}).textContent; await w(900);
      out.saved = ((await trustyshelf.getConfig()).config.ui || {}).filter; return out; });
    check('the filter row has "Installed" when a game is greyed', f.opts.includes('Installed'), JSON.stringify(f.opts));
    check('choosing it hides the greyed game (one game fewer) and is saved with the filter', f.on === 'Installed' && f.after === f.before - 1 && f.saved === 'installed', JSON.stringify(f));
    await page.screenshot({ path: path.join(OUT, 'installed-filter.png') });
    await ctx.close();
    const ctx0 = await browser.newContext({ viewport: { width: 1280, height: 720 } }), p0 = await ctx0.newPage(); await p0.goto(base); await p0.waitForTimeout(6000);
    const none = await p0.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms)); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); await w(900); return [...document.querySelectorAll('#spFilter .sp-opt')].map(x => x.textContent); });
    check('with every game installed there is no "Installed" filter to clutter the list', !none.includes('Installed') && none.includes('Favorites'), JSON.stringify(none));
    await ctx0.close();

    // ---- Looks ----
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } }), p2 = await ctx2.newPage(), errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message)); await p2.goto(base); await p2.waitForTimeout(6000);
    // record every config the Settings screen saves (the reload at the end of Apply wipes the demo's memory)
    await p2.evaluate(() => { const o = trustyshelf.saveConfig; trustyshelf.saveConfig = async c => { try { sessionStorage.setItem('lastSaved', JSON.stringify(c)); } catch (e) {} return o(c); }; });
    const L1 = await p2.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms));
      const rowsOf = () => [...document.querySelectorAll('#bss .bss-row, #bss .bss-head')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
      const row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      const open = async () => { Setup.open({ page: 'looks' }); for (let i = 0; i < 40 && !document.querySelector('#bss .bss-row'); i++) await w(150); await w(1000); Setup.key(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); await w(1200); };
      const close = async () => { if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(800); } };
      const out = {};
      const c = (await trustyshelf.getConfig()).config; Object.assign(c.ui, { theme: 'oled', uiScale: 1.15, clock: 'time', sort: 'year', filter: 'fav', music: 'night' }); await trustyshelf.saveConfig(c);
      await open(); out.empty = rowsOf();
      row('Save the current look').click(); await w(1400); out.afterSave = rowsOf();
      const saved = ((await trustyshelf.getConfig()).config.ui || {}).looks || []; out.saved = saved;
      // update needs two presses
      row('Update Look 1').click(); await w(500); const still = ((await trustyshelf.getConfig()).config.ui.looks || [])[0]; out.firstPress = still && still.set.theme;
      await close(); return out; });
    check('the Looks page starts empty, with Save the current look', L1.empty.some(r => /Save the current look/.test(r)) && L1.empty.some(r => /No looks saved yet/.test(r)), JSON.stringify(L1.empty));
    check('Save the current look adds "Look 1" with a summary (theme, size, clock, order)', L1.afterSave.some(r => /^Look 1Theme OLED.*Large.*Time only.*by year/.test(r)) && L1.afterSave.some(r => /Rename Look 1/.test(r)) && L1.afterSave.some(r => /Update Look 1/.test(r)) && L1.afterSave.some(r => /Delete Look 1/.test(r)), JSON.stringify(L1.afterSave));
    check('the look is kept in the settings: name and the plain values', L1.saved.length === 1 && L1.saved[0].name === 'Look 1' && L1.saved[0].set.theme === 'oled' && L1.saved[0].set.uiScale === 1.15 && L1.saved[0].set.clock === 'time' && L1.saved[0].set.sort === 'year' && L1.saved[0].set.filter === 'fav' && L1.saved[0].set.music === 'night', JSON.stringify(L1.saved));
    // change the settings, then apply the look: the saved config gets the look's values back, and the screen reloads
    const L2 = await p2.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms));
      const row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      const c = (await trustyshelf.getConfig()).config; Object.assign(c.ui, { theme: 'forest', uiScale: 1.3, clock: 'off', sort: 'az', filter: 'all', music: 'off' }); await trustyshelf.saveConfig(c);
      Setup.open({ page: 'looks' }); for (let i = 0; i < 40 && !document.querySelector('#bss .bss-row'); i++) await w(150); await w(1000); Setup.key(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); await w(1200);
      sessionStorage.removeItem('lastSaved'); window.__reloadMark = 1; row('Look 1').click(); return true; });
    await p2.waitForTimeout(5000);
    const reloaded = await p2.evaluate(() => window.__reloadMark !== 1), last = await p2.evaluate(() => JSON.parse(sessionStorage.getItem('lastSaved') || 'null'));
    check('Update did nothing on the first press (it asks twice)', L1.firstPress === 'oled');
    check('Apply puts the look\'s settings back (theme, size, clock, order, filter, music) in what is saved…', last && last.ui.theme === 'oled' && last.ui.uiScale === 1.15 && last.ui.clock === 'time' && last.ui.sort === 'year' && last.ui.filter === 'fav' && last.ui.music === 'night', JSON.stringify(last && last.ui && { t: last.ui.theme, s: last.ui.uiScale, c: last.ui.clock, o: last.ui.sort, f: last.ui.filter, m: last.ui.music }));
    check('…and keeps the look itself, and reloads the screen', last && last.ui.looks.length === 1 && reloaded, JSON.stringify({ reloaded, looks: last && last.ui.looks.length }));
    // after the reload: delete (twice)
    await p2.waitForTimeout(3000);
    const L3 = await p2.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms));
      const c = (await trustyshelf.getConfig()).config; c.ui.looks = [{ name: 'Look 1', set: { theme: 'oled' } }, { name: 'Evening', set: { theme: 'forest', sort: 'recent' } }]; await trustyshelf.saveConfig(c);
      const row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      const rowsOf = () => [...document.querySelectorAll('#bss .bss-row, #bss .bss-head')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
      Setup.open({ page: 'looks' }); for (let i = 0; i < 40 && !document.querySelector('#bss .bss-row'); i++) await w(150); await w(1000); Setup.key(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); await w(1200);
      const out = { two: rowsOf() }; row('Delete Evening').click(); await w(400); out.one = ((await trustyshelf.getConfig()).config.ui.looks || []).map(l => l.name);
      row('Delete Evening').click(); await w(1200); out.two2 = ((await trustyshelf.getConfig()).config.ui.looks || []).map(l => l.name); out.after = rowsOf(); return out; });
    check('two looks are listed; Delete asks twice, then removes just that one', L3.two.some(r => /^EveningTheme/.test(r)) && JSON.stringify(L3.one) === JSON.stringify(['Look 1', 'Evening']) && JSON.stringify(L3.two2) === JSON.stringify(['Look 1']) && !L3.after.some(r => /Evening/.test(r)), JSON.stringify(L3));
    await p2.screenshot({ path: path.join(OUT, 'looks.png') });
    check('No script errors', !errors.length && !errs2.length, errors.concat(errs2).slice(0, 3).join(' | '));
    await ctx2.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
