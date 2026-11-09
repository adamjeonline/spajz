// Linux build, test 3: PC games without Steam (main/linuxpc.js, main/pcfolder.js), the real AppImage on a virtual screen,
// in a made-up home.
//   xvfb-run -a node linux/ci/pc-test.js <(T)rustyShelf-…-linux.AppImage>
// Set up: (T)rustyShelf's own legendary folder (data/legendary) signed in, with one Epic game installed into the PC games folder;
// a pretend legendary (~/.local/bin/legendary: answers launch / list --json and install like the real one), a pretend
// Proton (GE-Proton-Test), the anti-cheat runtime in (T)rustyShelf's tools folder, and a pretend umu-run that writes down how
// it was started (its arguments, folder and Wine variables), runs 6 s and closes. The PC games folder holds a Windows
// game (with a bigger helper program deeper in), a Linux game (with an own copy in the player's folder that wins), a game
// with two programs (one chosen in Settings) and the Epic install. A Windows program added by hand too.
// Checks: the shelf (folder games, the Epic game once, the Epic library's uninstalled game greyed after the background
// refresh), how each game starts (umu-run arguments, prefixes named after the games, Epic's sign-in arguments, the
// Linux game's own home), Play on an uninstalled game offers to install it, and the Exit hold. Screenshots: linux-test-out/.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const img = path.resolve(process.argv[2] || '');
const OUT = path.resolve('linux-test-out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bxpc-'));
const mk = (p, body, exec) => { const f = path.join(HOME, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); if (exec) fs.chmodSync(f, 0o755); return f; };
const at = (...p) => path.join(HOME, ...p);
const gamesDir = at('Games', 'PC'), ownDir = at('Mine'), gameHome = at('GameHome');
// the Epic game, installed by legendary into the PC games folder (no .egstore: left out by its install path)
const gameDir = at('Games', 'PC', 'Test Epic Game'); mk('Games/PC/Test Epic Game/Binaries/Game.exe', 'MZ');
const legDir = at('TrustyShelf', 'data', 'legendary');
mk('TrustyShelf/data/legendary/installed.json', JSON.stringify({ FakeApp: { app_name: 'FakeApp', title: 'Test Epic Game', install_path: gameDir, executable: 'Binaries/Game.exe', platform: 'Windows', is_dlc: false, install_size: 123456789 } }));
mk('TrustyShelf/data/legendary/user.json', JSON.stringify({ displayName: 'Tester', account_id: 'x' }));
const proton = at('.steam', 'root', 'compatibilitytools.d', 'GE-Proton-Test'); mk('.steam/root/compatibilitytools.d/GE-Proton-Test/proton', '#!/bin/sh\nexit 0\n', true);
mk('TrustyShelf/tools/runtimes/eac_runtime/v2/lib64/easyanticheat_x64.so', 'x');
const launchJson = JSON.stringify({ game_executable: 'Binaries/Game.exe', game_directory: gameDir, working_directory: path.join(gameDir, 'Binaries'), game_parameters: ['-windowed'], egl_parameters: ['-AUTH_PASSWORD=fake-code', '-epicenv=Prod'], user_parameters: [], environment: { FROM_LEGENDARY: '1' } });
const listJson = JSON.stringify([{ app_name: 'FakeApp', app_title: 'Test Epic Game', metadata: { keyImages: [] } }, { app_name: 'Other', app_title: 'Not Installed Game', metadata: { keyImages: [] } }]);
const installArgs = at('legendary-install.txt');
mk('.local/bin/legendary', `#!/bin/sh\necho "$LEGENDARY_CONFIG_PATH" > "${HOME}/legendary-config.txt"\ncase "$*" in\n  *launch*--json*) echo '${launchJson}' ;;\n  *list*--json*) echo '${listJson}' ;;\n  install*) echo "$*" > "${installArgs}" ;;\n  *) exit 0 ;;\nesac\n`, true);
const umuOut = at('umu-run.txt');
mk('.local/bin/umu-run', `#!/bin/sh\necho "umu-run: starting $1"\n{ echo "PWD=$PWD"; echo "WINEPREFIX=$WINEPREFIX"; echo "PROTONPATH=$PROTONPATH"; echo "STORE=$STORE"; echo "GAMEID=$GAMEID"; echo "FROM_LEGENDARY=$FROM_LEGENDARY"; echo "PROTON_EAC_RUNTIME=$PROTON_EAC_RUNTIME"; echo "LD_PRELOAD=[$LD_PRELOAD]"; echo "SteamGameId=$SteamGameId"; echo "PROTON_ENABLE_NVAPI=$PROTON_ENABLE_NVAPI"; echo "OWN_VAR=$OWN_VAR"; for a in "$@"; do echo "ARG=$a"; done; } >> "${umuOut}"\necho --- >> "${umuOut}"\nsleep 6\necho x >> "${umuOut}.ended"\nexit 0\n`, true);
// the PC games folder
const winExe = mk('Games/PC/Win Game/WinGame.exe', 'MZ'); mk('Games/PC/Win Game/Data/Plugins/BigHelper.exe', 'MZ' + 'x'.repeat(5000));
mk('Games/PC/Two Programs/a.exe', 'MZ'); const twoB = mk('Games/PC/Two Programs/b.exe', 'MZ');
mk('Games/PC/Native Game/start.sh', '#!/bin/sh\nexit 0\n', true); // (the shared copy; the player's own copy wins)
const nativeOut = at('native-ran.txt'), ownNative = mk('Mine/Native Game/start.sh', `#!/bin/sh\necho "PWD=$PWD HOME=$HOME XDG=$XDG_CONFIG_HOME LD=$LD_LIBRARY_PATH" > "${nativeOut}"\nsleep 3\n`, true);
const tool = mk('Tools/Tool.exe', 'MZ');
mk('TrustyShelf/data/config.json', JSON.stringify({ setupDone: true,
  ui: { bootIntro: 'off', sound: false, music: 'off', startFullscreen: true, openInto: 'last', autoCovers: false, lastSeenVersion: require('../../package.json').version.replace('+', '.') },
  steam: { enabled: false }, pc: { epic: true, quiver: false, gamesDir, userGamesDir: ownDir, homeDir: gameHome, programs: { 'Two Programs': 'b.exe' }, run: { 'pc-two-programs': { prefix: at('Own Prefix'), env: { OWN_VAR: 'yes' } } }, custom: [{ id: 'tool', title: 'Test Tool', exe: tool, args: '' }] }, systems: {} }, null, 2));
const ended = () => { try { return fs.readFileSync(umuOut + '.ended', 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
// the n-th game has closed, and (T)rustyShelf has had a moment to see it go
const gameOver = async n => { for (let i = 0; i < 40 && ended() < n; i++) await sleep(500); await sleep(1500); return ended() >= n; };
const runs = () => { try { return fs.readFileSync(umuOut, 'utf8').split('---\n').filter(Boolean).map(b => { const o = { args: [] }; for (const l of b.split('\n').filter(Boolean)) { const [k, ...v] = l.split('='); if (k === 'ARG') o.args.push(v.join('=')); else o[k] = v.join('='); } return o; }); } catch { return []; } };

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
  const env = { ...process.env, HOME, PATH: path.join(HOME, '.local', 'bin') + ':' + process.env.PATH, APPIMAGE_EXTRACT_AND_RUN: '1' };
  delete env.LEGENDARY_CONFIG_PATH;
  const app = spawn(img, ['--no-sandbox', '--remote-debugging-port=9335'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let p;
  try {
    p = await cdp(await pageTarget(9335));
    let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await p.ev('!!(window.Shelf && Shelf._qs && Shelf._qs().g)').catch(() => false); if (!ready) await sleep(500); }
    check('(T)rustyShelf reports Linux to the page', (await p.ev('window.bsPlatform && bsPlatform.os')) === 'linux');
    // the shelf: the folder's games, the Epic game once; after the background refresh of the Epic library, its uninstalled game
    let shelves = await p.ev('window.trustyshelf.scan()'), pcShelf, ng;
    for (let i = 0; i < 20; i++) { pcShelf = (shelves || []).find(s => s.id === 'pc'); ng = pcShelf && pcShelf.games.find(g => g.title === 'Not Installed Game'); if (ng) break; await sleep(500); shelves = await p.ev('window.trustyshelf.scan()'); }
    const custom = (shelves || []).find(s => s.id === 'custom'), titles = (pcShelf ? pcShelf.games : []).map(g => g.title + ':' + g.source).sort();
    check('the PC shelf has the PC games folder\'s games and the Epic game (once, not also as a folder)', JSON.stringify(titles) === JSON.stringify(['Native Game:folder', 'Not Installed Game:epic', 'Test Epic Game:epic', 'Two Programs:folder', 'Win Game:folder']), JSON.stringify(titles));
    const eg = pcShelf && pcShelf.games.find(g => g.title === 'Test Epic Game');
    check('an Epic game that isn\'t installed is on the shelf, marked not installed (greyed); installed ones aren\'t', !!ng && ng.installed === false && !!eg && eg.installed !== false, JSON.stringify({ ng, eg }));
    // sizes: Epic's own for its install, the folder's (measured in the background) for a PC games folder game
    let wg = null; for (let i = 0; i < 20; i++) { wg = ((await p.ev('window.trustyshelf.scan()')).find(s => s.id === 'pc') || { games: [] }).games.find(g => g.title === 'Win Game'); if (wg && wg.sizeBytes) break; await sleep(500); }
    check('PC games show their size: an Epic install and a folder game', !!eg && eg.sizeBytes > 0 && !!wg && wg.sizeBytes >= 5000 && !ng.sizeBytes, JSON.stringify({ eg: eg && eg.sizeBytes, wg: wg && wg.sizeBytes, ng: ng && ng.sizeBytes }));
    check('the Windows program added by hand is on the Custom shelf', !!custom && custom.games.some(g => g.title === 'Test Tool'));
    const L = await p.ev('window.trustyshelf.pcLinux()');
    check('Settings sees the Proton build, umu-run, legendary, the Epic account and installs into the PC games folder', !!L && L.runners.some(r => r.name === 'GE-Proton-Test') && L.umu && L.legendary && L.epicAccount === 'Tester' && L.epicDir === gamesDir, JSON.stringify(L));
    const F = await p.ev('window.trustyshelf.pcFolderGames()');
    const two = (F || []).find(g => g.folder === 'Two Programs'), win = (F || []).find(g => g.folder === 'Win Game');
    check('Settings lists the folder games\' programs (the chosen one, a Windows program first over a bigger helper deeper in)', !!two && two.chosen === 'b.exe' && two.programs.length === 2 && !!win && win.chosen === 'WinGame.exe', JSON.stringify(F));
    const play = async g => p.ev(`window.trustyshelf.launchPc(${JSON.stringify(g ? g.id : '')}).then(r => ({ ok: true, r }), e => ({ error: e.message }))`);
    const byTitle = t => pcShelf.games.find(g => g.title === t);
    // Play the Epic game
    const r1 = await play(eg);
    await sleep(2500); const a = runs()[0] || {};
    check('Play starts the Epic game through umu-run with legendary\'s program and sign-in arguments', !!r1 && r1.ok && a.args && a.args[0] === path.join(gameDir, 'Binaries', 'Game.exe') && a.args.includes('-windowed') && a.args.includes('-AUTH_PASSWORD=fake-code'), JSON.stringify({ r1, a }));
    check('…in a prefix named after the game, with Proton, legendary\'s environment, STORE=egs, from the game\'s folder', a.WINEPREFIX === at('TrustyShelf', 'Prefixes', 'Test Epic Game') && a.PROTONPATH === proton && a.STORE === 'egs' && a.FROM_LEGENDARY === '1' && a.PWD === path.join(gameDir, 'Binaries'), JSON.stringify(a));
    check('…with the anti-cheat runtime from TrustyShelf\'s tools, NVAPI, an empty LD_PRELOAD and Steam\'s ids', a.PROTON_EAC_RUNTIME === at('TrustyShelf', 'tools', 'runtimes', 'eac_runtime') && a.PROTON_ENABLE_NVAPI === '1' && a.LD_PRELOAD === '[]' && a.SteamGameId === 'trustyshelf-testepicgame', JSON.stringify(a));
    check('the game\'s output goes to data/logs/last-pc-game.log', fs.existsSync(at('TrustyShelf', 'data', 'logs', 'last-pc-game.log')) && /umu-run: starting/.test(fs.readFileSync(at('TrustyShelf', 'data', 'logs', 'last-pc-game.log'), 'utf8')));
    check('legendary used TrustyShelf\'s own folder', fs.readFileSync(at('legendary-config.txt'), 'utf8').trim() === legDir);
    await shot(p, 'pc-1-playing');
    check('the game is over when umu-run exits', await gameOver(1));
    // the PC games folder's Windows games
    const r2 = await play(byTitle('Win Game'));
    await sleep(2500); const b = runs()[1] || {};
    check('a Windows game in the PC games folder runs through Proton in a prefix named after it, from its folder', !!r2 && r2.ok && b.args && b.args[0] === winExe && b.WINEPREFIX === at('TrustyShelf', 'Prefixes', 'Win Game') && b.STORE === 'none' && b.PWD === path.dirname(winExe) && !!b.PROTON_EAC_RUNTIME, JSON.stringify({ r2, b }));
    await gameOver(2);
    const r3 = await play(byTitle('Two Programs'));
    await sleep(2500); const c = runs()[2] || {};
    check('a folder game with several programs starts the one chosen in Settings', !!r3 && r3.ok && c.args && c.args[0] === twoB, JSON.stringify({ r3, c }));
    check('…with its own way of running (pc.run): its own prefix and variables', c.WINEPREFIX === at('Own Prefix') && c.OWN_VAR === 'yes' && b.OWN_VAR === '', JSON.stringify({ c, b }));
    await gameOver(3);
    // the program added by hand
    const tg = custom && custom.games.find(g => g.title === 'Test Tool');
    const r4 = await play(tg);
    await sleep(2500); const d = runs()[3] || {};
    check('a Windows program added by hand runs through Proton in a prefix of its own', !!r4 && r4.ok && d.args && d.args[0] === tool && d.WINEPREFIX === at('TrustyShelf', 'Prefixes', 'Test Tool'), JSON.stringify({ r4, d }));
    await gameOver(4);
    // the Linux game: the player's own copy, run as it is with the game data folder as its home
    const r5 = await play(byTitle('Native Game'));
    await sleep(1500); const nat = fs.existsSync(nativeOut) ? fs.readFileSync(nativeOut, 'utf8') : '';
    check('a Linux game runs natively from the player\'s own copy, with the game data folder as its home, without TrustyShelf\'s libraries', !!r5 && r5.ok && nat.includes('PWD=' + path.dirname(ownNative)) && nat.includes('HOME=' + gameHome + ' ') && nat.includes('XDG=' + path.join(gameHome, '.config')) && !/mount_|appimage_extracted/.test(nat), JSON.stringify({ r5, nat }));
    for (let i = 0; i < 12; i++) { await sleep(500); if (await p.ev('window.trustyshelf.launchPc("x").then(() => true, e => !/already running/i.test(e.message))').catch(() => false)) break; }
    await sleep(1000);
    // an Epic game that isn't installed: launch refuses; Play on the shelf offers to install it, Install starts legendary
    const r6 = await play(ng);
    check('starting an uninstalled Epic game is refused', !!r6 && /isn't installed/.test(r6.error || ''), JSON.stringify(r6));
    await p.ev(`Shelf._play(${JSON.stringify(ng ? ng.id : '')})`); await sleep(900); await shot(p, 'pc-3-install');
    const dlg = await p.ev('(() => { const e = document.querySelector(".buildpick.on"); return e ? e.innerText : "" })()');
    await p.ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), 1');
    let inst = ''; for (let i = 0; i < 20 && !inst; i++) { await sleep(300); try { inst = fs.readFileSync(installArgs, 'utf8'); } catch {} }
    check('Play on it shows "Not installed yet" with Install; Install has legendary install it into the PC games folder', /not installed yet/i.test(dlg) && /Install/.test(dlg) && /install Other --base-path/.test(inst) && inst.includes(gamesDir), JSON.stringify({ dlg, inst }));
    // Box art → PC games: the gallery, and the Settings row that opens it
    const n = await p.ev('Shelf.pcArtCount()');
    check('Settings counts the PC games for their covers', !!n && n.total >= 6, JSON.stringify(n));
    await p.ev('Shelf.pcGallery(), 1'); await sleep(1200);
    const gal = await p.ev('(() => { const g = document.querySelector(".pcgallery.on"); return g ? [...g.querySelectorAll(".cp-tile")].map(t => t.textContent) : null })()');
    check('the PC games gallery shows every PC game with where its cover comes from', Array.isArray(gal) && gal.length === n.total && gal.some(t => /Test Epic Game/.test(t)), JSON.stringify(gal));
    await shot(p, 'pc-4-gallery');
    await p.ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), 1'); await sleep(600);
    // the lower bar's Exit, held: the card shows, letting go keeps (T)rustyShelf open
    const hasBtn = await p.ev('!!document.querySelector("#hints .hint-exit")');
    await p.ev('Shelf._exit.start(), 1'); await sleep(900); await shot(p, 'pc-5-exit-hold');
    const card = await p.ev('(() => { const e = document.querySelector(".holdexit.on"); return e ? e.textContent : "" })()');
    await p.ev('Shelf._exit.cancel(), 1'); await sleep(500);
    const gone = await p.ev('!document.querySelector(".holdexit.on") && !Shelf._exit.open()');
    check('the lower bar has an Exit button; holding shows "Hold for 3 seconds to exit…", letting go keeps (T)rustyShelf open', hasBtn && /Hold for 3 seconds to exit/.test(card) && gone, JSON.stringify({ hasBtn, card, gone }));
    const lib = await p.ev('window.trustyshelf.epicLibrary()');
    check('the Epic library lists owned games, installed or not', !!lib && Array.isArray(lib.games) && lib.games.length === 2 && lib.games.find(g => g.appName === 'FakeApp').installed && !lib.games.find(g => g.appName === 'Other').installed, JSON.stringify(lib));
    // Settings → PC games, and the Epic library page
    await p.ev('window.trustyshelf.getConfig().then(inf => { Settings.show(inf, { page: "pc" }); return true; })'); await sleep(2500); await shot(p, 'pc-2-settings');
    const txt = await p.ev('document.body.innerText');
    check('Settings → PC games shows the PC games folder, Wine / Proton, the game data folder and the Epic account, and no other launcher', /PC games folder/.test(txt) && /Run Windows games with/.test(txt) && /Game data folder/.test(txt) && /Signed in as Tester/.test(txt) && !/Show installed GOG games/.test(txt) && !/heroic/i.test(txt), (txt.match(/PC games[\s\S]{0,600}/) || [''])[0]);
    const errs = p.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => JSON.stringify(e.params.exceptionDetails).slice(0, 200));
    check('no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the test ran to the end', false, e && e.stack || e); }
  try { if (p) p.close(); } catch {}
  try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {}
  try { fs.copyFileSync(path.join(HOME, 'TrustyShelf', 'data', 'trustyshelf.log'), path.join(OUT, 'pc-trustyshelf.log')); } catch {}
  console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
  process.exit(fails ? 1 : 0);
})();
