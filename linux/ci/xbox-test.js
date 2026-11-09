// (T)rustyShelf's original Xbox shelf (xemu), on the real AppImage on a virtual screen (xvfb-run), in a made-up home folder.
//   node linux/ci/xbox-test.js <TrustyShelf-…-linux.AppImage>
// An Xbox game in ~/Emulation/roms/xbox and a pretend xemu (~/.local/bin/xemu: writes down the options it was given, runs
// 7 s, closes). Checks: detection finds xemu and the folder, the Xbox shelf shows the game in its own case, Play starts
// xemu with -full-screen -dvd_path <game>, the shelf comes back after, no script errors. Screenshots go to linux-test-out/.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxxbox-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const argsFile = path.join(HOME, 'xemu-args.txt');
const xemu = mk('.local/bin/xemu', `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${argsFile}"\nsleep 7\nexit 0\n`, true);
const rom = mk('Emulation/roms/xbox/Halo - Combat Evolved (USA).iso', 'x');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: false, quiver: false, custom: [] },
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
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9341'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9341)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(2000);
    const det = await p.ev('window.trustyshelf.detect()').catch(e => ({ error: e.message }));
    const xb = det && det.systems && det.systems.xbox || {};
    check('detection finds xemu and the Xbox games folder', xb.emulator === xemu && (xb.romDirs || []).includes(path.dirname(rom)), JSON.stringify(xb));
    const key = async (k, vk) => { for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: vk }); };
    let g = await p.ev('Shelf._qs().g');
    for (let i = 0; i < 4 && !/Halo/.test(String(g)); i++) { await key('ArrowRight', 39); await sleep(1200); g = await p.ev('Shelf._qs().g'); }
    const word = await p.ev('(document.getElementById("sysWord") || {}).textContent || ""').catch(() => '');
    await shot(p, 'xbox-1-shelf');
    check('the Xbox shelf shows the game from ~/Emulation/roms/xbox', ready && /Halo/.test(String(g)) && /Xbox/.test(word), JSON.stringify({ game: g, shelf: word }));
    await key('Enter', 13);
    let args = null; for (let i = 0; i < 60 && !args; i++) { await sleep(500); try { args = fs.readFileSync(argsFile, 'utf8').split('\n').filter(Boolean); } catch {} }
    check('Play starts xemu full screen with the game as its disc (-full-screen -dvd_path <game>)', !!args && args[0] === '-full-screen' && args[1] === '-dvd_path' && args[2] === rom, JSON.stringify(args));
    let back = false; for (let i = 0; i < 50 && !back; i++) { await sleep(500); back = await p.ev('document.visibilityState === "visible" && !document.body.classList.contains("aside") && Shelf.getMode() === "browse"').catch(() => false); }
    await sleep(1500); await shot(p, 'xbox-2-back');
    check('back on the shelf after xemu closes', back, await p.ev('[document.visibilityState, document.body.className, Shelf.getMode()].join(" | ")').catch(e => e.message));
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-xbox.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-xbox.txt'), appOut);
    try { if (p) p.close(); } catch {}
    try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
