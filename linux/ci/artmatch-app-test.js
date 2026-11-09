// (T)rustyShelf's Art match (its issue #2) on the real app, on a virtual screen (xvfb-run), in a made-up home folder with a PS2 mod
// named after its serial. Run: node linux/ci/artmatch-app-test.js <TrustyShelf-…-linux.AppImage or the unpacked trustyshelf>
//   - art:matchSearch answers for a console game (and says whether the LaunchBox database is there); not for anything else
//   - art:matchSet keeps the name picked with the game in the settings; the library gives it with the game; '' clears it
//   - the game's art is fetched again in the background (the log says so) without downloading the LaunchBox database
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxam-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const emu = mk('.local/bin/pcsx2-qt', '#!/bin/sh\nexit 0\n', true), rom = mk('Emulation/roms/ps2/DBZBT4B13REV5.iso', 'x'.repeat(2048));
const data = path.join(HOME, 'TrustyShelf', 'data');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: false, quiver: false, custom: [] }, systems: { ps2: { enabled: true, emulator: emu, romDirs: [path.dirname(rom)] } } }, null, 2));
async function cdp(url) {
  const ws = new WebSocket(url); let id = 0; const wait = new Map(), events = [];
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method) events.push(d); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result ? r.result.result.value : undefined; };
  return { send, ev, events, close: () => ws.close() };
}
async function pageTarget(port) {
  for (let i = 0; i < 120; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); const t = l.find(x => x.type === 'page' && /index\.html/.test(x.url)); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(500); }
  throw new Error('the (T)rustyShelf page never came up');
}
const shot = async (p, name) => { try { const r = await p.send('Page.captureScreenshot', { format: 'png' }); if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); } catch {} };


(async () => {
  check('the app exists', fs.existsSync(img), img);
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9343'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9343)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(1500);
    const game = async () => { const lib = await p.ev('window.trustyshelf.scan()'); const s = lib.find(x => x.id === 'ps2'); return s && s.games.find(g => g.kind === 'rom'); };
    const g = await game();
    check('the PS2 mod is on the shelf, under its serial name', !!g && /DBZBT4B13REV5/i.test(g.title) && !g.artName, JSON.stringify(g && { id: g.id, title: g.title }));
    const r = await p.ev(`window.trustyshelf.artMatchSearch(${JSON.stringify(g.id)}, 'budokai tenkaichi')`);
    check('art:matchSearch answers for it (a list) and says the LaunchBox database isn\'t downloaded here', r && Array.isArray(r.list) && r.index === 'missing', JSON.stringify(r).slice(0, 300));
    const bad = await p.ev(`window.trustyshelf.artMatchSearch('pc:something', 'x').then(() => 'allowed', e => String(e.message))`);
    check('…and refuses anything that isn\'t a console game', /isn't a console game/.test(bad), bad);
    const set = await p.ev(`window.trustyshelf.artMatchSet(${JSON.stringify(g.id)}, '  Dragon Ball Z:   Budokai Tenkaichi 3 ')`);
    const saved = ((await p.ev('window.trustyshelf.getConfig()')).config.games || {})[g.id];
    check('art:matchSet keeps the name picked with the game (tidied) in the settings', set && set.artName === 'Dragon Ball Z: Budokai Tenkaichi 3' && saved && saved.artName === 'Dragon Ball Z: Budokai Tenkaichi 3', JSON.stringify({ set: set && set.artName, saved }));
    const g2 = await game();
    check('the library gives the game with its art match (Details shows it)', g2 && g2.artName === 'Dragon Ball Z: Budokai Tenkaichi 3' && g2.title === g.title, JSON.stringify(g2 && { title: g2.title, artName: g2.artName }));
    const logf = path.join(data, 'trustyshelf.log'), logT = () => { try { return fs.readFileSync(logf, 'utf8'); } catch { return ''; } };
    let fetched = false; for (let i = 0; i < 40 && !fetched; i++) { await sleep(500); fetched = /Art match: fetched again|Art match: fetching again failed/.test(logT()); }
    check('its art is fetched again in the background (the log says so)', /Art match: .*"Dragon Ball Z: Budokai Tenkaichi 3"/.test(logT()) && fetched, logT().split('\n').filter(l => /Art match|LaunchBox/.test(l)).slice(-4).join(' | '));
    check('…without downloading the LaunchBox database for it', !/LaunchBox: download|Downloading LaunchBox|launchbox.*Metadata\.zip/i.test(logT()), logT().split('\n').filter(l => /LaunchBox/i.test(l)).slice(-3).join(' | '));
    await p.ev(`window.trustyshelf.artMatchSet(${JSON.stringify(g.id)}, '')`);
    const g3 = await game(), saved3 = ((await p.ev('window.trustyshelf.getConfig()')).config.games || {})[g.id];
    check('an empty name puts it back to automatic (nothing left in the settings)', g3 && !g3.artName && !saved3, JSON.stringify({ artName: g3 && g3.artName, saved3 }));
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(data, 'trustyshelf.log'), path.join(OUT, 'trustyshelf-artmatch.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-artmatch.txt'), appOut);
    try { if (p) p.close(); } catch {} try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
