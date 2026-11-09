// (T)rustyShelf's Neo Geo Pocket and Neo Geo Pocket Color shelves (asked on Boxshelf's issue 11), on the real app on a virtual
// screen (xvfb-run), in a made-up home folder. Run: node linux/ci/ngp-test.js <TrustyShelf-…-linux.AppImage or the unpacked app>
// A pretend RetroArch (~/.local/bin/retroarch: writes down the options it got, runs 4 s, closes) with Beetle NeoPop in its cores
// folder, one game in ~/Emulation/roms/ngp and one in ~/Emulation/roms/ngpc. Checks: detection finds RetroArch and both folders,
// each console has its own shelf with its game, Play starts RetroArch full screen with the Beetle NeoPop core and the game, the
// shelf comes back, no script errors.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxngp-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const argsFile = path.join(HOME, 'retroarch-args.txt');
const ra = mk('.local/bin/retroarch', `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${argsFile}"\nsleep 4\nexit 0\n`, true);
const core = mk('.config/retroarch/cores/mednafen_ngp_libretro.so', 'not a real core');
const color = mk('Emulation/roms/ngpc/Metal Slug - 1st Mission (World).ngc', 'x'.repeat(4096)), mono = mk("Emulation/roms/ngp/Neo Geo Cup '98 (World).ngp", 'x'.repeat(4096));
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: false, quiver: false, custom: [] }, systems: {} }, null, 2));
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
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9344'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9344)); await p.send('Runtime.enable'); await p.send('Page.enable');
    for (let i = 0; i < 90; i++) { if (await p.ev('!!(window.Shelf && window.trustyshelf)').catch(() => false)) break; await sleep(500); }
    await sleep(1500);
    const det = await p.ev('window.trustyshelf.detect()').catch(e => ({ error: e.message }));
    const a = (det.systems || {}).ngp || {}, b = (det.systems || {}).ngpc || {};
    check('detection finds RetroArch for both, and each folder for its own console', a.emulator === ra && b.emulator === ra && (a.romDirs || []).includes(path.dirname(mono)) && (b.romDirs || []).includes(path.dirname(color)) && !(a.romDirs || []).includes(path.dirname(color)), JSON.stringify({ ngp: a, ngpc: b }));
    await p.ev(`(async () => { const c = (await trustyshelf.getConfig()).config; c.systems.ngp = { ...(c.systems.ngp || {}), enabled: true, emulator: ${JSON.stringify(ra)}, romDirs: [${JSON.stringify(path.dirname(mono))}] };
      c.systems.ngpc = { ...(c.systems.ngpc || {}), enabled: true, emulator: ${JSON.stringify(ra)}, romDirs: [${JSON.stringify(path.dirname(color))}] }; await trustyshelf.saveConfig(c); })()`);
    const lib = await p.ev('window.trustyshelf.scan()'), sh = id => lib.find(s => s.id === id);
    check('a Neo Geo Pocket shelf with its game', !!sh('ngp') && sh('ngp').name === 'Neo Geo Pocket' && sh('ngp').games.some(g => /Neo Geo Cup/.test(g.title)), JSON.stringify(sh('ngp') && { name: sh('ngp').name, games: sh('ngp').games.map(g => g.title) }));
    check('a Neo Geo Pocket Color shelf with its game (and not the other\'s)', !!sh('ngpc') && sh('ngpc').name === 'Neo Geo Pocket Color' && sh('ngpc').games.some(g => /Metal Slug/.test(g.title)) && !sh('ngpc').games.some(g => /Neo Geo Cup/.test(g.title)), JSON.stringify(sh('ngpc') && { name: sh('ngpc').name, games: sh('ngpc').games.map(g => g.title) }));
    await p.ev('window.Shelf && Shelf.refresh && Shelf.refresh(true)').catch(() => {}); await sleep(2500); await shot(p, 'ngp-1-shelf');
    const play = async (sys, file) => { try { fs.unlinkSync(argsFile); } catch {} await p.ev(`window.trustyshelf.launchGame(${JSON.stringify(sys)}, ${JSON.stringify(file)})`).catch(e => e.message);
      let args = null; for (let i = 0; i < 40 && !args; i++) { await sleep(500); try { args = fs.readFileSync(argsFile, 'utf8').split('\n').filter(Boolean); } catch {} } return args; };
    const x = await play('ngpc', color);
    check('Play (Color): RetroArch full screen with the Beetle NeoPop core and the game', !!x && x[0] === '-f' && x[1] === '-L' && x[2] === core && x[3] === color, JSON.stringify(x));
    for (let i = 0; i < 30; i++) { await sleep(500); if (!(await p.ev('window.trustyshelf.isRunning ? window.trustyshelf.isRunning() : false').catch(() => false))) break; }
    await sleep(3500);
    const y = await play('ngp', mono);
    check('Play (Neo Geo Pocket): the same core, its own game', !!y && y[1] === '-L' && y[2] === core && y[3] === mono, JSON.stringify(y));
    await sleep(5000);
    const log = (() => { try { return fs.readFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), 'utf8'); } catch { return ''; } })();
    check('the log names the core it used', /RetroArch launch: ngpc mednafen_ngp_libretro\.so/.test(log) && /RetroArch launch: ngp mednafen_ngp_libretro\.so/.test(log), log.split('\n').filter(l => /RetroArch|launch/i.test(l)).slice(-4).join(' | '));
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-ngp.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-ngp.txt'), appOut);
    try { if (p) p.close(); } catch {} try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
