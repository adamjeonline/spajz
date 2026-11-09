// (T)rustyShelf's own menu music, the page side (renderer/usermusic.js), on the demo page as Windows.
// Run (after node copy-web.js): node ci/usermusic-test.js www ../out/usermusic
//   - Settings → Sound: "Your music" is a Menu music choice, with the Music folder and Reload music rows
//   - picking it plays one of the tracks (a real audio element, the volume fading up), another when it ends, never the same
//     twice running; "Off" stops it
//   - an empty Music folder (?music=0) plays nothing and the choice says so
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/usermusic');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });

server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const base = `http://localhost:${server.address().port}/index.html?platform=windows&shelf=1`;
    // ---- tracks in the folder ----
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); await page.goto(base); await page.waitForTimeout(5000);
    const st = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const out = {}, row = n => [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === n);
      const c = (await trustyshelf.getConfig()).config; c.ui.sound = true; c.ui.music = 'own'; c.ui.musicLevel = .5; await trustyshelf.saveConfig(c);
      Setup.open({ page: 'sound' }); for (let i = 0; i < 40 && !row('Menu music'); i++) await w(150); await w(500);
      out.rows = { music: !!row('Menu music'), folder: !!row('Music folder'), reload: !!row('Reload music') };
      out.menuRow = ((row('Menu music') || {}).textContent || '');
      if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(800); }
      Shelf.sound({ enabled: true, music: 'own', musicLevel: .5 });
      let s = null; for (let i = 0; i < 60; i++) { await w(250); s = UserMusic.state(); if (s.playing && s.volume > 0.05) break; }
      out.playing = s; out.count = UserMusic.count();
      Shelf.sound({ music: 'off' }); await w(2500); out.stopped = UserMusic.state();
      return out; });
    check('Settings → Sound: Menu music (showing Your music), the Music folder row and Reload music', st.rows.music && st.rows.folder && st.rows.reload && /Your music/.test(st.menuRow), JSON.stringify({ rows: st.rows, menu: st.menuRow }));
    check('Your music plays one of the tracks (an audio element from a file address, the volume faded up)', st.playing && st.playing.playing && /^Track [ABC]$/.test(st.playing.track) && st.playing.volume > 0.05 && /^blob:/.test(st.playing.src) && st.count === 3, JSON.stringify(st.playing));
    check('Off stops it (nothing playing, the audio released)', st.stopped && !st.stopped.playing && !st.stopped.src, JSON.stringify(st.stopped));
    // ---- the tracks follow one another (they're 2-4 s long here), none twice in a row ----
    const sh = await page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const picks = [];
      Shelf.sound({ music: 'own', musicLevel: .5 });
      for (let i = 0; i < 160 && picks.length < 6; i++) { await w(250); const s = UserMusic.state(); if (s.playing && s.track && picks[picks.length - 1] !== s.track) picks.push(s.track); }
      Shelf.sound({ music: 'off' }); await w(1500); return picks; });
    check('the tracks follow one another and none repeats straight away', sh.length >= 4 && sh.every((t, i) => i === 0 || t !== sh[i - 1]) && new Set(sh).size === 3, JSON.stringify(sh));
    check('No script errors (tracks present)', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
    // ---- an empty folder ----
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } }), p2 = await ctx2.newPage(), errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(base + '&music=0'); await p2.waitForTimeout(5000);
    const em = await p2.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
      const c = (await trustyshelf.getConfig()).config; c.ui.sound = true; c.ui.music = 'own'; await trustyshelf.saveConfig(c); Shelf.sound({ enabled: true, music: 'own', musicLevel: .5 }); await w(2500);
      return { state: UserMusic.state(), listed: (await trustyshelf.musicList()).length }; });
    check('An empty Music folder plays nothing', em.listed === 0 && !em.state.playing && em.state.count === 0, JSON.stringify(em));
    check('No script errors (empty folder)', !errs2.length, errs2.slice(0, 3).join(' | '));
    await ctx2.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
});
