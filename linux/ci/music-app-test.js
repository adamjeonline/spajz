// (T)rustyShelf's own menu music, on the real AppImage on a virtual screen (xvfb-run), in a made-up home folder.
//   node linux/ci/music-app-test.js <TrustyShelf-…-linux.AppImage>
// A WAV file in ~/TrustyShelf/Music: the app lists it, and with Menu music set to Your music the page plays it from disk through
// the app's own file address (bsfile://), with the volume up. Off stops it. Screenshots go to linux-test-out/.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxmusic-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const argsFile = path.join(HOME, 'xemu-args.txt');
const xemu = mk('.local/bin/xemu', `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${argsFile}"\nsleep 7\nexit 0\n`, true);
const wav = (() => { const rate = 8000, n = rate * 6, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 2000), 44 + i * 2); return b; })();
mk('TrustyShelf/Music/Test Tune.wav', wav);
const rom = mk('Emulation/roms/xbox/Halo - Combat Evolved (USA).iso', 'x');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: true, music: 'own', musicLevel: .6, startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
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
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9337'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9337)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(2000);
    const list = await p.ev('window.trustyshelf.musicList()').catch(e => ({ error: e.message }));
    check('the app lists the WAV in the Music folder as a file address', Array.isArray(list) && list.length === 1 && list[0].name === 'Test Tune' && /^bsfile:\/\/local\//.test(list[0].url), JSON.stringify(list));
    await p.ev('Shelf.sound({ enabled: true, music: "own", musicLevel: .6 })');
    let st = null; for (let i = 0; i < 40; i++) { await sleep(300); st = await p.ev('UserMusic.state()'); if (st && st.playing && st.volume > 0.05) break; }
    check('Your music plays the file from disk (bsfile address, volume up)', !!st && st.playing && st.track === 'Test Tune' && /^bsfile:\/\//.test(st.src) && st.volume > 0.05, JSON.stringify(st));
    await shot(p, 'music-1-playing');
    await p.ev('Shelf.sound({ music: "off" })'); await sleep(2500);
    const off = await p.ev('UserMusic.state()');
    check('Off stops it', !!off && !off.playing && !off.src, JSON.stringify(off));
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-music.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-music.txt'), appOut);
    try { if (p) p.close(); } catch {}
    try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
