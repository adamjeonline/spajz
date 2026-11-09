// (T)rustyShelf: PC covers made by the app itself show on the shelf (its issue #1: with Settings → PC games → Console box art on,
// the covers went back to the made-up cases). On the real app, on a virtual screen (xvfb-run), in a made-up home folder.
//   node linux/ci/consolebox-app-test.js <TrustyShelf-…-linux.AppImage or the unpacked trustyshelf>
//   - a console box made for a PC game (data/pc-console-covers) is that game's cover, and the picture really loads on the page
//   - an automatic PC poster (data/pc-covers-auto) loads too
//   - Console box art off: the console box isn't used any more
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxbox-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const moon = mk('Games/Moon Forge/MoonForge.sh', '#!/bin/sh\nexit 0\n', true), star = mk('Games/Star Field/StarField.sh', '#!/bin/sh\nexit 0\n', true);
const data = path.join(HOME, 'TrustyShelf', 'data');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: false, quiver: false, consoleBox: true, custom: [{ id: 'moon', title: 'Moon Forge', exe: moon, args: '' }, { id: 'star', title: 'Star Field', exe: star, args: '' }] }, systems: {} }, null, 2));
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
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9342'], { env: { ...process.env, HOME, APPIMAGE_EXTRACT_AND_RUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9342)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(1500);
    // a real JPEG, drawn by the page, saved where the app keeps the console boxes and the automatic posters
    const jpg = Buffer.from(await p.ev(`(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 84; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 60, 84); x.fillStyle = '#fff'; x.fillRect(8, 8, 44, 10); return c.toDataURL('image/jpeg', .9).split(',')[1]; })()`), 'base64');
    fs.mkdirSync(path.join(data, 'pc-console-covers'), { recursive: true }); fs.writeFileSync(path.join(data, 'pc-console-covers', 'custom-moon.jpg'), jpg);
    fs.mkdirSync(path.join(data, 'pc-covers-auto'), { recursive: true }); fs.writeFileSync(path.join(data, 'pc-covers-auto', 'custom-star.jpg'), jpg);
    const front = async t => { const lib = await p.ev('window.trustyshelf.scan()'); for (const s of lib) { const g = (s.games || []).find(x => x.title === t); if (g) return (g.art && g.art.front) || ''; } return null; };
    const loads = u => p.ev(`new Promise(res => { const i = new Image(); i.onload = () => res({ ok: true, w: i.naturalWidth }); i.onerror = () => res({ ok: false }); i.src = ${JSON.stringify(u)}; setTimeout(() => res({ ok: false, timeout: true }), 8000); })`);
    const status = u => p.ev(`fetch(${JSON.stringify(u)}).then(r => r.status, e => 'error ' + e.message)`);
    const m = await front('Moon Forge'), s = await front('Star Field');
    check('Console box art on: the console box made for a PC game is its cover', /pc-console-covers/.test(decodeURIComponent(m || '')), m);
    const ml = m ? await loads(m) : { ok: false }, ms = m ? await status(m) : 0;
    check('…and the picture really shows on the page (it used to be refused, so the shelf fell back to the made-up case)', ml.ok && ml.w === 60 && ms === 200, JSON.stringify({ ml, ms }));
    check('an automatic PC poster is the cover of a game with no other', /pc-covers-auto/.test(decodeURIComponent(s || '')), s);
    const sl = s ? await loads(s) : { ok: false }, ss = s ? await status(s) : 0;
    check('…and it really shows on the page too', sl.ok && ss === 200, JSON.stringify({ sl, ss }));
    // switched off: the console box isn't used
    await p.ev(`(async () => { const c = (await window.trustyshelf.getConfig()).config; c.pc.consoleBox = false; await window.trustyshelf.saveConfig(c); })()`);
    const m2 = await front('Moon Forge');
    check('Console box art off: the console box isn\'t the cover any more', !/pc-console-covers/.test(decodeURIComponent(m2 || '')), m2);
    await shot(p, 'consolebox-shelf');
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    fs.writeFileSync(path.join(OUT, 'app-output-consolebox.txt'), appOut);
    try { if (p) p.close(); } catch {} try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
