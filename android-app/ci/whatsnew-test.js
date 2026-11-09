// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): this file is the same as Boxshelf's
// android-app/ci/whatsnew-test.js apart from the app's name ((T)rustyShelf).
// Device test pass "whatsnew" (beta.7), run by web-device-test.js: the demo page as Windows on a 1920x1080 TV.
//   The first start of a new version shows its highlights once (a card over the dimmed shelf: left / right move between
//   its buttons, the shelf doesn't move behind it, Esc closes, the version is remembered); a fresh install shows nothing.
//   A newer version on GitHub: a card with the release's highlights as plain text (no Markdown or HTML), shown once;
//   See what's new opens Settings → System → What's new with its notes, its download and this version's notes.
//   Screenshots: whatsnew-*.png.
'use strict';
const path = require('path');

module.exports = async function whatsNewPass({ browser, base, check, OUT }) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const pause = ms => page.waitForTimeout(ms);
  const ready = async q => { await page.goto(base + q); await page.waitForFunction(() => window.Shelf && Shelf._qs && Shelf._qs().g && window.Setup, null, { timeout: 90000, polling: 250 }); };
  const card = () => page.evaluate(() => { const c = document.querySelector('.note-card'); if (!c) return null;
    return { wide: c.classList.contains('wide'), title: (c.querySelector('.nc-title') || {}).textContent || '', items: [...c.querySelectorAll('.nc-list li')].map(l => l.textContent), html: c.innerHTML,
      lit: [...c.querySelectorAll('.nc-btns .btn')].findIndex(b => b.classList.contains('pad-focus')), mode: Shelf.getMode(), sel: (Shelf._lib.cur() || {}).id }; });
  try {
    // What's new after updating
    await ready('?platform=windows&shelf=1&ver=1.82.0-beta.8');
    let c = null; for (let i = 0; i < 40 && !c; i++) { await pause(300); c = await card(); }
    await pause(400); await page.screenshot({ path: path.join(OUT, 'whatsnew-card.png') });
    await page.keyboard.press('ArrowRight'); await pause(250); const c2 = await card();
    await page.keyboard.press('ArrowLeft'); await pause(250);
    await page.keyboard.press('Escape'); await pause(600);
    const after = await page.evaluate(async () => ({ gone: !document.querySelector('.note-card'), mode: Shelf.getMode(), seen: (await window.trustyshelf.getConfig()).config.ui.lastSeenVersion }));
    check('What\'s new: the first start of a new version shows its highlights over the dimmed shelf',
      !!c && c.wide && /What's new in 1\.82\.0-beta\.8/.test(c.title) && c.items.length >= 3 && c.mode === 'note', JSON.stringify(c && { title: c.title, items: c.items.length, mode: c.mode }));
    check('What\'s new: right lights the other button (the shelf behind stays put), Esc closes it and the version is remembered',
      !!c2 && c2.lit === 1 && c2.sel === c.sel && after.gone && after.mode === 'browse' && after.seen === '1.82.0-beta.8', JSON.stringify({ lit: c2 && c2.lit, same: c2 && c2.sel === c.sel, ...after }));

    // a fresh install (the first run): no card, the version is just remembered
    await page.goto(base + '?platform=windows&ver=1.82.0-beta.8'); await page.waitForSelector('#setup.on', { timeout: 90000 }); await pause(7000);
    const fresh = await page.evaluate(async () => ({ card: !!document.querySelector('.note-card'), seen: (await window.trustyshelf.getConfig()).config.ui.lastSeenVersion }));
    check('What\'s new: a fresh install shows no card (it remembers the version for next time)', !fresh.card && fresh.seen === '1.82.0-beta.8', JSON.stringify(fresh));

    // a newer version out
    await ready('?platform=windows&shelf=1&update=newer');
    let u = null; for (let i = 0; i < 60 && !u; i++) { await pause(300); u = await card(); }
    await page.screenshot({ path: path.join(OUT, 'whatsnew-update.png') });
    // the fork's own releases: the app is one release behind, the newest release's real notes (renderer/whatsnew.js) are the release's text
    const rel = await page.evaluate(() => ({ v: BS_WHATSNEW[0].version, hl: BS_WHATSNEW[0].highlights })), cut = t => t.length > 140 ? t.slice(0, 137) + '…' : t, vre = rel.v.replace(/\./g, '\\.');
    check('Update: a newer version shows a card with its highlights as plain text (no Markdown or HTML from the release)',
      !!u && !u.wide && new RegExp(vre + ' is out').test(u.title) && u.items.length === 3 && u.items[0] === cut(rel.hl[0]) && u.items[1] === cut(rel.hl[1]) && !/\*\*|&lt;b|<b>/.test(u.html),
      JSON.stringify(u && { title: u.title, items: u.items }));
    await page.keyboard.press('Enter'); await pause(1800);
    const st = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: path.join(OUT, 'whatsnew-settings.png') });
    check('Update: See what\'s new opens Settings → System → What\'s new with the new version\'s notes, its download and this version\'s notes',
      /What.s new/.test(st) && new RegExp('New: \\(T\\)rustyShelf ' + vre, 'i').test(st) && new RegExp('Get \\(T\\)rustyShelf ' + vre, 'i').test(st) && st.includes(rel.hl[0].slice(0, 40)), st.split('\n').filter(l => /new|\(T\)rustyShelf|Video/i.test(l)).slice(0, 6).join(' | '));
    await page.evaluate(() => window.Settings && Settings.close && Settings.close()); await pause(600);
    await ready('?platform=windows&shelf=1&update=newer'); await pause(7500);
    check('Update: the same version\'s card isn\'t shown twice', !(await card()));
    // (beta.8) a Steam Deck in Desktop Mode, (T)rustyShelf not started by Steam: a card says once how to get the controller in
    // games (start from Steam), and its button adds (T)rustyShelf to Steam. Started by Steam: no card
    await ready('?platform=windows&shelf=1&deck=desktop'); let dk = null; for (let w = 0; w < 40 && !dk; w++) { await pause(400); dk = await card(); }
    if (dk) { await page.screenshot({ path: path.join(OUT, 'whatsnew-deck.png') }); await page.keyboard.press('Enter'); await pause(900); }
    const added = await page.evaluate(() => window.__added || 0);
    await ready('?platform=windows&shelf=1&deck=steam'); await pause(13000); const dk2 = await card();
    check('Steam Deck: in Desktop Mode outside Steam a card explains the controller and adds (T)rustyShelf to Steam; started by Steam, no card',
      !!dk && /Steam Deck/i.test(dk.html) && /from Steam/i.test(dk.title) && added === 1 && !dk2, JSON.stringify({ dk: dk && dk.title, added, dk2: dk2 && dk2.title }));
    check('What\'s new pass: no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  } catch (e) { check('What\'s new pass ran to the end', false, e.message.split('\n')[0]); try { await page.screenshot({ path: path.join(OUT, 'whatsnew-fail.png') }); } catch {} }
  await ctx.close();
};
