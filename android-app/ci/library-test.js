// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): most of this file is Boxshelf's
// android-app/ci/library-test.js; modified for (T)rustyShelf: the hidden shelf tiles check is by supalii
// (https://github.com/supalii/boxshelf-source).
// Device test pass "library" (beta.7), run by web-device-test.js: the demo page as Windows on a 1920x1080 TV.
//   Details, redone in Settings' look: Close in the header, section labels, no empty fact rows, the hint bar shows what
//   Details does (Back; not the shelf's Letter / Shuffle), and the buttons leave most of the panel to the game.
//   Filters from your own library: a decade and a genre keep only those games.
//   Collections: Details → Collections, a new one typed in, becomes a shelf of its own with that game; Settings → Shelf →
//   Collections lists it. Screenshots: library-*.png.
'use strict';
const path = require('path');

module.exports = async function libraryPass({ browser, base, check, OUT }) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const pause = ms => page.waitForTimeout(ms);
  try {
    await page.goto(base + '?platform=windows&shelf=1');
    await page.waitForFunction(() => window.Shelf && Shelf._qs && Shelf._qs().g && window.Setup, null, { timeout: 90000, polling: 250 });
    await pause(2000);
    // to a game (past the Shuffle / emulator tiles), then Details
    for (let i = 0; i < 6; i++) { if (await page.evaluate(() => { const g = Shelf._lib.cur(); return !!g && g.kind === 'rom'; })) break; await page.keyboard.press('ArrowRight'); await pause(600); }
    await page.keyboard.press('i'); await pause(1200);
    await page.screenshot({ path: path.join(OUT, 'library-details.png') });
    const d = await page.evaluate(() => {
      const det = document.getElementById('details'), act = det.querySelector('.d-actions'), r = det.getBoundingClientRect(), a = act.getBoundingClientRect();
      const rows = [...document.querySelectorAll('#dGrid > div')].map(x => ({ k: x.querySelector('dt').textContent, v: x.querySelector('dd').textContent.trim() }));
      return { open: Shelf.getMode() === 'details', closeInHero: !!det.querySelector('.d-hero #dClose'), info: !document.getElementById('dSecInfo').hidden,
        rows, empty: rows.filter(x => !x.v).length, hints: [...document.querySelectorAll('#hints .lab')].map(x => x.textContent), actShare: a.height / r.height, width: r.width,
        cols: !document.getElementById('dCols').hidden };
    });
    check('Details (Windows): Close sits in the header, Game info has a section label, and no fact row is left empty',
      d.open && d.closeInHero && d.info && d.rows.length > 0 && d.empty === 0, JSON.stringify({ open: d.open, closeInHero: d.closeInHero, info: d.info, rows: d.rows.length, empty: d.empty }));
    check('Details (Windows): the hint bar shows what Details does (Back), not the shelf\'s Letter or Shuffle',
      d.hints.includes('Back') && !d.hints.includes('Letter') && !d.hints.includes('Shuffle'), JSON.stringify(d.hints));
    check('Details (Windows): the panel is roomy (over 600 px on a 1080p TV) and the buttons take under half of it; Collections is there',
      d.width > 600 && d.actShare < .5 && d.cols, JSON.stringify({ width: Math.round(d.width), actShare: d.actShare.toFixed(2), cols: d.cols }));
    await page.keyboard.press('Escape'); await pause(900);
    // Surprise and emulator entries are shelf tiles, not ROM/PC games, but they must use the same hide/restore flow.
    async function hideTile(kind) {
      const item = await page.evaluate(kind => {
        const tile = (Shelf._lib.shelves().find(s => s.id === 'gc') || { tiles: [] }).tiles.find(t => t.kind === kind);
        if (!tile || !Shelf._lib.select(tile.id)) return null;
        return Shelf._lib.cur();
      }, kind);
      if (!item || item.kind !== kind) return { found: false, kind };
      await page.keyboard.press('i');
      await page.waitForFunction(() => Shelf.getMode() === 'details' && document.getElementById('dHide') && !document.getElementById('dHide').hidden, null, { timeout: 10000 });
      await page.locator('#dMoreBtn').click();
      await page.waitForFunction(() => { const b = document.getElementById('dHide'); return b && b.getClientRects().length > 0; }, null, { timeout: 10000 });
      await page.locator('#dHide').click();
      await page.waitForFunction(id => Shelf.hiddenList().some(g => g.id === id) &&
        !Shelf._lib.shelves().some(s => s.tiles.some(t => t.id === id)), item.id, { timeout: 10000 });
      const hidden = await page.evaluate(id => Shelf.hiddenList().some(g => g.id === id), item.id);
      await page.evaluate(id => Shelf.setHidden(id, false), item.id);
      await page.waitForFunction(id => Shelf._lib.shelves().some(s => s.tiles.some(t => t.id === id)), item.id, { timeout: 10000 });
      return { found: true, id: item.id, hidden, restored: true };
    }
    const hiddenRandom = await hideTile('random');
    check('Hide from shelf: Surprise me can be hidden from Details, listed, and restored',
      hiddenRandom.found && hiddenRandom.hidden && hiddenRandom.restored, JSON.stringify(hiddenRandom));
    const hiddenEmulator = await hideTile('emulator');
    check('Hide from shelf: the emulator .exe tile can be hidden from Details, listed, and restored',
      hiddenEmulator.found && hiddenEmulator.hidden && hiddenEmulator.restored, JSON.stringify(hiddenEmulator));
    // filters: a decade and a genre from the library itself
    const f = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), L = Shelf._lib, list = L.filters(), dec = list.find(x => /^dec:/.test(x[0])), gen = list.find(x => /^genre:/.test(x[0]));
      const out = { decades: list.filter(x => /^dec:/.test(x[0])).length, genres: list.filter(x => /^genre:/.test(x[0])).length };
      if (dec) { L.filter(dec[0]); await w(500); const d0 = +dec[0].slice(4); const gs = L.games(); out.dec = { n: gs.length, ok: gs.length > 0 && gs.every(g => g.year >= d0 && g.year < d0 + 10) }; }
      if (gen) { L.filter(gen[0]); await w(500); const n = gen[0].slice(6); const gs = L.games(); out.gen = { n: gs.length, ok: gs.length > 0 && gs.every(g => g.genres.includes(n)) }; }
      L.filter('all'); await w(500); return out; });
    check('Filters: the library\'s own decades and genres are offered, and each keeps only its games',
      f.decades > 0 && f.genres > 0 && f.dec && f.dec.ok && f.gen && f.gen.ok, JSON.stringify(f));
    // collections: Details → Collections → New collection (typed) → a shelf of its own with this game
    const g0 = await page.evaluate(() => Shelf._lib.cur());
    await page.evaluate(g => Setup.open({ page: 'collections', id: g.id, title: g.title }), g0);
    await page.waitForFunction(() => /New collection/.test((document.getElementById('bss') || {}).innerText || ''), null, { timeout: 30000 });
    await pause(700);
    // (the page opens on its first row, New collection: Enter starts typing in it, as on a keyboard)
    await page.keyboard.press('Enter'); await pause(500); await page.keyboard.type('Couch co-op'); await pause(200); await page.keyboard.press('Enter'); await pause(1200);
    const c = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const col = Shelf._lib.shelves().find(s => s.col), out = { tabs: [...document.querySelectorAll('#tabs > *')].map(e => e.textContent.trim()), col: col ? { name: col.name, ids: col.ids } : null };
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(900); }
      Setup.open({ page: 'shelf' }); await w(1200); const row = [...document.querySelectorAll('#bss .bss-row')].find(x => /^Collections/.test(x.innerText.trim())); if (row) { row.click(); await w(900); }
      out.manage = (document.getElementById('bss') || {}).innerText || ''; return out; });
    await page.screenshot({ path: path.join(OUT, 'library-collections.png') });
    check('Collections: a new one typed in from Details becomes a shelf (its own tab) with that game on it',
      !!c.col && c.col.name === 'Couch co-op' && c.col.ids.includes(g0.id) && c.tabs.some(t => /Couch co-op/.test(t)), JSON.stringify({ col: c.col, tabs: c.tabs }));
    check('Collections: Settings → Shelf → Collections lists it to rename or delete', /Couch co-op/.test(c.manage) && /Delete Couch co-op/.test(c.manage), c.manage.slice(0, 300));
    check('Library pass (Windows page): no script errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('Library pass ran to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e); }
  await ctx.close();
};
