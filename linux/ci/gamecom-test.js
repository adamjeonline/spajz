// (T)rustyShelf's Game.com shelf (asked on Boxshelf's issue 11), on the real app on a virtual screen (xvfb-run), in a made-up home
// folder. Run: node linux/ci/gamecom-test.js <TrustyShelf-…-linux.AppImage or the unpacked app>
// A pretend MAME (~/.local/bin/mame: writes down the options it got and the folder it was started in, runs 4 s, closes) and a game in
// ~/Emulation/roms/gamecom. Checks: detection finds MAME and the folder, the Game.com shelf shows the game with MAME as its
// emulator, Play starts MAME with the Game.com driver and the game in its first cartridge slot (gamecom -cart1 <game>
// -skip_gameinfo) from MAME's own folder, no script errors.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxgcom-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const argsFile = path.join(HOME, 'mame-args.txt');
const mame = mk('.local/bin/mame', `#!/bin/sh\n{ echo "PWD=$PWD"; for a in "$@"; do echo "$a"; done; } > "${argsFile}"\nsleep 4\nexit 0\n`, true);
const rom = mk('Emulation/roms/gamecom/Lights Out (USA).tgc', 'x'.repeat(4096));
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
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9345'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9345)); await p.send('Runtime.enable'); await p.send('Page.enable');
    for (let i = 0; i < 90; i++) { if (await p.ev('!!(window.Shelf && window.trustyshelf)').catch(() => false)) break; await sleep(500); }
    await sleep(1500);
    const det = await p.ev('window.trustyshelf.detect()').catch(e => ({ error: e.message })), d = (det.systems || {}).gamecom || {};
    check('detection finds MAME and the Game.com folder', d.emulator === mame && (d.romDirs || []).includes(path.dirname(rom)), JSON.stringify(d));
    await p.ev(`(async () => { const c = (await trustyshelf.getConfig()).config; c.systems.gamecom = { ...(c.systems.gamecom || {}), enabled: true, emulator: ${JSON.stringify(mame)}, romDirs: [${JSON.stringify(path.dirname(rom))}] }; await trustyshelf.saveConfig(c); })()`);
    const lib = await p.ev('window.trustyshelf.scan()'), sh = lib.find(s => s.id === 'gamecom');
    check('a Game.com shelf with the game, MAME as its emulator', !!sh && sh.name === 'Game.com' && sh.games.some(g => /Lights Out/.test(g.title)) && /MAME/.test(sh.emulatorName || ''), JSON.stringify(sh && { name: sh.name, emu: sh.emulatorName, games: sh.games.map(g => g.title) }));
    await p.ev('window.Shelf && Shelf.refresh && Shelf.refresh(true)').catch(() => {}); await sleep(2500); await shot(p, 'gamecom-1-shelf');
    await p.ev(`window.trustyshelf.launchGame('gamecom', ${JSON.stringify(rom)})`).catch(e => e.message);
    let a = null; for (let i = 0; i < 40 && !a; i++) { await sleep(500); try { a = fs.readFileSync(argsFile, 'utf8').split('\n').filter(Boolean); } catch {} }
    check('Play starts MAME with the Game.com driver and the game in its first cartridge slot', !!a && a[1] === 'gamecom' && a[2] === '-cart1' && a[3] === rom && a[4] === '-skip_gameinfo', JSON.stringify(a));
    check('…from MAME\'s own folder (where it finds its roms folder and mame.ini)', !!a && a[0] === 'PWD=' + path.dirname(mame), a && a[0]);
    await sleep(5000);
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-gamecom.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-gamecom.txt'), appOut);
    try { if (p) p.close(); } catch {} try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
