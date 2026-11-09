// (T)rustyShelf's per-game window mode, through the real app's IPC on a virtual screen (xvfb-run), in a made-up home folder.
//   node linux/ci/windowmode-app-test.js <TrustyShelf-…-linux.AppImage>
// A program added by hand: game:window saves borderless / windowed / the game's own with the game in the settings file, refuses a
// game the shelf doesn't start itself and an unknown one, and a bad value is stored as the game's own.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxwin-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const argsFile = path.join(HOME, 'xemu-args.txt');
const xemu = mk('.local/bin/xemu', `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${argsFile}"\nsleep 7\nexit 0\n`, true);
const prog = mk('Games/Moon Forge/MoonForge.sh', '#!/bin/sh\nexit 0\n', true);
const rom = mk('Emulation/roms/xbox/Halo - Combat Evolved (USA).iso', 'x');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: false, quiver: false, custom: [{ id: 'moon', title: 'Moon Forge', exe: prog, args: '' }] },
  systems: { xbox: { enabled: true, emulator: xemu, romDirs: [path.dirname(rom)] } } }, null, 2));

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
  check('the AppImage exists', fs.existsSync(img), img);
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9338'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9338)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(2000);
    await p.ev('window.trustyshelf.scan()'); await sleep(1500);
    const set = async (id, w) => p.ev(`window.trustyshelf.gameWindow(${JSON.stringify(id)}, ${JSON.stringify(w)}).then(r => ({ ok: true, r }), e => ({ ok: false, msg: String(e.message) }))`);
    const cfgGame = async () => (await p.ev('window.trustyshelf.getConfig()')).config.games || {};
    const a = await set('custom-moon', 'borderless'), g1 = await cfgGame();
    check('a program added by hand takes "borderless", saved with the game', a.ok && a.r.window === 'borderless' && g1['custom-moon'] && g1['custom-moon'].window === 'borderless', JSON.stringify({ a, g1 }));
    const b = await set('custom-moon', 'windowed'), g2 = await cfgGame();
    check('...then "windowed"', b.ok && g2['custom-moon'].window === 'windowed', JSON.stringify(g2));
    const c = await set('custom-moon', 'fullscreen'), g3 = await cfgGame();
    check('a value that isn\'t a mode means "the game\'s own": nothing stays saved for the game', c.ok && c.r.window === '' && !g3['custom-moon'], JSON.stringify({ c, g3 }));
    const d = await set('custom-nope', 'borderless');
    check('a game that isn\'t on the shelf is refused with a message', !d.ok && /isn't one the shelf starts itself/.test(d.msg), JSON.stringify(d));
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-winmode.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-winmode.txt'), appOut);
    try { if (p) p.close(); } catch {}
    try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
