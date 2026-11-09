// (T)rustyShelf's Epic download manager, install status and storage view, on the real AppImage on a virtual screen (xvfb-run), in a
// made-up home folder with a pretend, slow legendary and a pretend signed-in Epic account.
//   node linux/ci/epicdl-app-test.js <TrustyShelf-…-linux.AppImage>
//   - two installs asked for: one downloads, the other waits; the list reaches the page, Settings → PC games → Downloads and the
//     quick menu's Epic downloads row; Pause stops one and the next starts; Resume goes on
//   - Details → Installation (game:install): an installed Epic game set to "not installed" is greyed (the shelf says installed:false),
//     a not-installed one set to "installed" isn't; both go back to "as found"
//   - Settings → PC games → Storage lists the installed game's folder with its drive's space
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxdl-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const at = (...p) => path.join(HOME, ...p);
const gamesDir = at('Games', 'PC'), gameDir = at('Games', 'PC', 'Installed Game'); mk('Games/PC/Installed Game/Bin/Game.exe', 'MZ' + 'x'.repeat(4000));
mk('TrustyShelf/data/legendary/installed.json', JSON.stringify({ InstApp: { app_name: 'InstApp', title: 'Installed Game', install_path: gameDir, executable: 'Bin/Game.exe', platform: 'Windows', is_dlc: false, install_size: 4000 } }));
mk('TrustyShelf/data/legendary/user.json', JSON.stringify({ displayName: 'Tester', account_id: 'x' }));
const listJson = JSON.stringify([{ app_name: 'InstApp', app_title: 'Installed Game', metadata: { keyImages: [] } }, { app_name: 'SlowOne', app_title: 'Slow One', metadata: { keyImages: [] } }, { app_name: 'SlowTwo', app_title: 'Slow Two', metadata: { keyImages: [] } }, { app_name: 'WaitApp', app_title: 'Waiting Game', metadata: { keyImages: [] } }]);
mk('.local/bin/legendary', `#!/bin/sh
case "$1" in
  list) echo '${listJson}' ;;
  install) base=""; prev=""; for a in "$@"; do [ "$prev" = "--base-path" ] && base="$a"; prev="$a"; done; [ -n "$base" ] && mkdir -p "$base/$2-folder"; echo "$2" >> "${at('installs.txt')}"
    i=1; while [ $i -le 100 ]; do echo "[DLManager] INFO: = Progress: $i.00% (1/2), Running for 00:00:$i, ETA: 00:01:$((100-i))"; echo " + Download	- 5.00 MiB/s (raw)"; sleep 0.5; i=$((i+1)); done ;;
  *) exit 0 ;;
esac
`, true);
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: true, quiver: false, gamesDir, custom: [] }, systems: {} }, null, 2));
async function cdp(url) {
  const ws = new WebSocket(url); let id = 0; const wait = new Map(), events = [];
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method) events.push(d); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result && r.result.result.value; };
  return { send, ev, events, close: () => ws.close() };
}
async function pageTarget(port) {
  for (let i = 0; i < 120; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); const t = l.find(x => x.type === 'page' && /index\.html/.test(x.url)); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(500); }
  throw new Error('the (T)rustyShelf page never came up');
}
const shot = async (p, name) => { try { const r = await p.send('Page.captureScreenshot', { format: 'png' }); if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); } catch {} };


(async () => {
  check('the AppImage exists', fs.existsSync(img), img);
  const env = { ...process.env, HOME, PATH: path.join(HOME, '.local', 'bin') + ':' + process.env.PATH, APPIMAGE_EXTRACT_AND_RUN: '1' }; delete env.LEGENDARY_CONFIG_PATH;
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9339'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let appOut = ''; app.stdout.on('data', d => appOut += d); app.stderr.on('data', d => appOut += d);
  let p;
  try {
    p = await cdp(await pageTarget(9339)); await p.send('Runtime.enable'); await p.send('Page.enable');
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    await sleep(2500);
    await p.ev('window.__q = []; window.trustyshelf.onEpicQueue(l => window.__q.push(l.map(i => i.appName + ":" + i.state).join(",")))');
    const lib = await p.ev('window.trustyshelf.epicLibrary()');
    check('the Epic library is read: the installed game, and the ones to install', lib && lib.games && lib.games.length === 4 && lib.games.find(g => g.appName === 'InstApp').installed === true, JSON.stringify(lib).slice(0, 300));
    // two installs: one downloads, the other waits
    await p.ev('window.trustyshelf.epicInstall("SlowOne", "Slow One", false)'); await p.ev('window.trustyshelf.epicInstall("SlowTwo", "Slow Two", false)'); await sleep(1800);
    let q = await p.ev('window.trustyshelf.epicDownloads()');
    check('two installs asked for: the first downloads (with progress), the second waits its turn', q.length === 2 && q[0].state === 'installing' && q[0].pct > 0 && q[1].state === 'queued', JSON.stringify(q));
    const L = await p.ev('window.trustyshelf.pcLinux()');
    check('Settings\' view of the PC games has the list too, and the running install', L && Array.isArray(L.downloads) && L.downloads.length === 2 && L.job && L.job.state === 'installing', JSON.stringify(L && { d: L.downloads && L.downloads.length, job: L.job }));
    check('the page was told of every change (events carried the list)', (await p.ev('window.__q.length')) >= 3 && /SlowOne:installing,SlowTwo:queued/.test((await p.ev('window.__q')).join('|')), JSON.stringify(await p.ev('window.__q')).slice(0, 300));
    // Settings → PC games → Downloads
    const pageRows = async (name, shotName) => p.ev(`(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); Setup.open({ page: 'pc' }); await w(2500); if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(700); }
      Setup.open({ page: ${JSON.stringify(name)} }); for (let i = 0; i < 40 && !document.querySelector('#bss .bss-row'); i++) await w(150); await w(1200);
      Setup.key(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); await w(1200);
      const rows = [...document.querySelectorAll('#bss .bss-row, #bss .bss-head')].map(r => r.textContent.replace(/\\s+/g, ' ').trim()); return rows; })()`).then(async rows => { if (shotName) await shot(p, shotName); await p.ev('(async () => { if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await new Promise(r => setTimeout(r, 700)); } })()'); return rows; });
    const dl = await pageRows('epicdl', 'epicdl-1-settings');
    check('Settings → PC games → Downloads lists the running install (with its progress), the waiting one, and what to do with them', dl.some(r => /Slow One.*%/.test(r)) && dl.some(r => /Slow Two.*Waiting/.test(r)) && dl.some(r => /Pause/.test(r)) && dl.some(r => /Move up Slow Two/.test(r)) && dl.some(r => /Remove Slow One/.test(r)), JSON.stringify(dl).slice(0, 600));
    // the quick menu's row
    const qm = await p.ev(`(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); Shelf.quickMenu(); await w(900); const l = [...document.querySelectorAll('.qm-lbl')].find(x => x.textContent === 'Epic downloads'); const v = l && l.nextElementSibling; const out = { row: !!l, val: v ? v.textContent : '' }; if (Shelf.quickMenuOpen()) Shelf.homeButton(); await w(500); return out; })()`);
    check('the quick menu has an Epic downloads row saying what is downloading', qm.row && /Installing Slow One/.test(qm.val) && /\+1/.test(qm.val), JSON.stringify(qm));
    // pause: the next starts
    const id1 = q[0].id; await p.ev(`window.trustyshelf.epicPause(${id1})`); await sleep(1500);
    q = await p.ev('window.trustyshelf.epicDownloads()');
    check('Pause stops the first and the second starts', q.find(i => i.id === id1).state === 'paused' && q.find(i => i.appName === 'SlowTwo').state === 'installing', JSON.stringify(q.map(i => i.appName + ':' + i.state)));
    await p.ev(`window.trustyshelf.epicResume(${id1})`); await sleep(500);
    q = await p.ev('window.trustyshelf.epicDownloads()');
    check('Resume puts it back in the list, waiting for its turn (the other one is still downloading)', q.find(i => i.id === id1).state === 'queued' && q.find(i => i.appName === 'SlowTwo').state === 'installing', JSON.stringify(q.map(i => i.appName + ':' + i.state)));
    // installation status
    const lib1 = await p.ev('window.trustyshelf.scan()'), pc = s => (lib1.find(x => x.id === 'pc') || { games: [] }).games.find(g => g.title === s);
    const inst = pc('Installed Game'), wait = pc('Waiting Game');
    check('the shelf has the installed Epic game (not greyed) and a greyed one that isn\'t installed', inst && inst.installed !== false && wait && wait.installed === false, JSON.stringify({ inst: inst && inst.installed, wait: wait && wait.installed }));
    await p.ev(`window.trustyshelf.gameInstall(${JSON.stringify(inst.id)}, 'notinstalled')`); await p.ev(`window.trustyshelf.gameInstall(${JSON.stringify(wait.id)}, 'installed')`);
    const lib2 = await p.ev('window.trustyshelf.scan()'), pc2 = s => (lib2.find(x => x.id === 'pc') || { games: [] }).games.find(g => g.title === s);
    check('Installation set by hand: the installed game is now "not installed" (greyed), the other "installed"', pc2('Installed Game').installed === false && pc2('Waiting Game').installed !== false, JSON.stringify({ a: pc2('Installed Game').installed, b: pc2('Waiting Game').installed }));
    await p.ev(`window.trustyshelf.gameInstall(${JSON.stringify(inst.id)}, '')`); await p.ev(`window.trustyshelf.gameInstall(${JSON.stringify(wait.id)}, '')`);
    const lib3 = await p.ev('window.trustyshelf.scan()'), pc3 = s => (lib3.find(x => x.id === 'pc') || { games: [] }).games.find(g => g.title === s);
    check('…and back to "as found": nothing stays saved', pc3('Installed Game').installed !== false && pc3('Waiting Game').installed === false && !((await p.ev('window.trustyshelf.getConfig()')).config.games || {})[inst.id], JSON.stringify({ a: pc3('Installed Game').installed, b: pc3('Waiting Game').installed }));
    const bad = await p.ev(`window.trustyshelf.gameInstall('steam-1', 'installed').then(() => 'allowed', e => String(e.message))`);
    check('Installation is for Epic games only', /isn't an Epic game/.test(bad), bad);
    // storage
    const st = await p.ev('window.trustyshelf.pcStorage()');
    const found = (st.drives || []).flatMap(d => d.games.map(g => ({ ...g, root: d.root, free: d.free, total: d.total }))).find(g => g.title === 'Installed Game');
    check('Storage lists the installed game\'s folder with its drive and the drive\'s space', !!found && found.dir === gameDir && found.source === 'epic' && found.total > 0 && found.free >= 0, JSON.stringify(st).slice(0, 400));
    const sr = await pageRows('pcstorage', 'epicdl-2-storage');
    check('Settings → PC games → Storage shows the drive and the game', sr.some(r => /free of/.test(r)) && sr.some(r => /Installed Game/.test(r)), JSON.stringify(sr).slice(0, 400));
    for (const i of await p.ev('window.trustyshelf.epicDownloads()')) await p.ev(`window.trustyshelf.epicRemove(${i.id})`);
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  finally {
    try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'trustyshelf-epicdl.log')); } catch {}
    fs.writeFileSync(path.join(OUT, 'app-output-epicdl.txt'), appOut);
    try { if (p) p.close(); } catch {} try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
