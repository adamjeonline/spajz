// (T)rustyShelf's PC shelf on Android, in a browser on the adapter's pretend device (?fakeNative=1&fakePc=1).
// Run (after node copy-web.js): node ci/android-pc-test.js www ../out/android-pc
//   - the PC folder's files (GameNative's Frontend sync format: <title>.steam / .epic …, the id inside; or [id] in the
//     name) are the shelf's games; other files aren't
//   - GameNative is started with app.gamenative.LAUNCH_GAME, the id as a number (app_id) and the store (game_source)
//   - DroidDeck with com.droiddeck.launcher.LAUNCH_GAME and the id; a game from another store is turned away with a message
//   - any other app picked in Settings gets the game the standard way (VIEW with its file)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/android-pc');
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
    await page.goto(`http://localhost:${server.address().port}/index.html?fakeNative=1&fakePc=1`); await page.waitForTimeout(5000);
    const r = await page.evaluate(async () => {
      const api = window.trustyshelf, wait = ms => new Promise(res => setTimeout(res, ms)), info = await api.getConfig(), det = await api.detect(), c = info.config;
      const dir = await api.pick({ kind: 'folder' }); // (the PC folder: picked first on this pretend device)
      c.systems.pc = Object.assign(c.systems.pc || {}, { enabled: true, romDirs: [dir], emulator: det.systems.pc && det.systems.pc.emulator });
      c.setupDone = true; await api.saveConfig(c);
      const lib = await api.scan(), pc = lib.find(s => s.id === 'pc') || { games: [] };
      const file = t => (pc.games.find(g => g.title === t) || {}).file;
      const launch = async (t) => { const n = window.__fakeLaunches.length; let err = ''; try { await api.launchGame('pc', file(t)); } catch (e) { err = e.message; } await wait(1800); return { req: window.__fakeLaunches[n] || null, err }; };
      const out = { emulator: c.systems.pc.emulator, titles: pc.games.map(g => g.title).sort(), consoles: info.consoles.map(x => x.id) };
      out.gnSteam = await launch('Hollow Knight'); out.gnEpic = await launch('Celeste'); out.gnNamed = await launch('Portal 2');
      c.systems.pc.emulator = 'DroidDeck (com.droiddeck.launcher)'; await api.saveConfig(c);
      out.ddSteam = await launch('Hollow Knight'); out.ddEpic = await launch('Celeste');
      c.systems.pc.emulator = 'Winlator (com.winlator)'; await api.saveConfig(c);
      out.other = await launch('Hollow Knight');
      return out;
    });
    check('PC is one of the Android consoles, and GameNative is found as its app', r.consoles.includes('pc') && /GameNative \(app\.gamenative\)/.test(r.emulator || ''), JSON.stringify({ consoles: r.consoles.length, emulator: r.emulator }));
    check('The PC shelf: the GameNative files are its games (a [id] dropped from the title); other files aren\'t', JSON.stringify(r.titles) === JSON.stringify(['Celeste', 'Hollow Knight', 'Portal 2']), JSON.stringify(r.titles));
    const gn = x => x.req && x.req.pkg === 'app.gamenative' && x.req.action === 'app.gamenative.LAUNCH_GAME' && /MainActivity$/.test(x.req.activity || '');
    check('GameNative: a Steam game starts with LAUNCH_GAME, app_id as a number and game_source STEAM', gn(r.gnSteam) && r.gnSteam.req.extras.app_id === 367520 && r.gnSteam.req.extras.game_source === 'STEAM', JSON.stringify(r.gnSteam));
    check('GameNative: an Epic game with its own id and EPIC', gn(r.gnEpic) && r.gnEpic.req.extras.app_id === 9876 && r.gnEpic.req.extras.game_source === 'EPIC', JSON.stringify(r.gnEpic));
    check('GameNative: an id taken from the file\'s name ([620])', gn(r.gnNamed) && r.gnNamed.req.extras.app_id === 620, JSON.stringify(r.gnNamed));
    check('DroidDeck: a Steam game starts with its LAUNCH_GAME and the id', r.ddSteam.req && r.ddSteam.req.pkg === 'com.droiddeck.launcher' && r.ddSteam.req.action === 'com.droiddeck.launcher.LAUNCH_GAME' && r.ddSteam.req.extras.app_id === 367520 && !('game_source' in r.ddSteam.req.extras), JSON.stringify(r.ddSteam));
    check('DroidDeck: an Epic game is turned away with a message that names GameNative (nothing started)', !r.ddEpic.req && /Steam games only/.test(r.ddEpic.err) && /GameNative/.test(r.ddEpic.err), JSON.stringify(r.ddEpic));
    check('Another app picked in Settings gets the game the standard way (VIEW with its file)', r.other.req && r.other.req.pkg === 'com.winlator' && r.other.req.action === 'android.intent.action.VIEW' && /Hollow%20Knight\.steam|Hollow Knight\.steam/.test(decodeURIComponent(r.other.req.data || '')), JSON.stringify(r.other));
    await page.screenshot({ path: path.join(OUT, 'android-pc-shelf.png') });
    check('No script errors', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
});
