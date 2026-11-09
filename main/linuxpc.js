// (Linux) PC games without Steam: Windows games through Wine or Proton, and Epic Games through legendary.
// Linux only; main.js calls it behind linux.isLinux. Windows keeps main/pcgames.js exactly as it is.
//
//   - Runners: the Proton and Wine builds already on the PC, found where Steam, Lutris and the distro put them. Proton
//     runs through umu-run when it's installed (the Steam Linux Runtime and protonfixes), else through Proton's own
//     script. Each game gets a Wine prefix of its own, named after the game, in the prefixes folder.
//   - Every Proton start gets the options a game store's launcher sets: the anti-cheat runtimes (Easy Anti-Cheat,
//     BattlEye), NVAPI, an empty LD_PRELOAD and Steam's ids at 0.
//   - Native games can be given a home of their own (Settings → PC games → Game data folder): their saves and settings
//     then live there instead of in the account's home.
//   - Epic: legendary (an open-source Epic Games client) keeps Špajz's own Epic sign-in and install list in
//     data/legendary; the account's whole library is kept in data/epic-library.json so games that aren't installed can
//     be shown too. `legendary launch --json` gives a game's program, folder and Epic's sign-in arguments; Špajz starts
//     the game itself, so the quit combo, Home menu and play time work as for any game.
// Every path Špajz starts comes from these lists, never from the screen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

let log = () => {}, dataDir = '', appRoot = '', fetchBuf = null;
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isExec = p => { try { fs.accessSync(p, fs.constants.X_OK); return isFile(p); } catch { return false; } };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'game';
const H = () => os.homedir();
const which = name => { for (const d of String(process.env.PATH || '').split(':').filter(Boolean)) { const f = path.join(d, name); if (isExec(f)) return f; } return null; };
const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() || e.isSymbolicLink()).map(e => path.join(d, e.name)); } catch { return []; } };
const APP = /^[\w.-]{1,120}$/; // (an Epic app name: the only thing the screen may name)
const root = () => appRoot || path.join(H(), 'TrustyShelf');
const toolsDir = () => path.join(root(), 'tools');

// opts.fetchBuf(url) → Buffer | null: downloads (main.js gives Electron's net, which follows redirects)
function init(opts = {}) { dataDir = opts.dataDir || ''; appRoot = opts.appRoot || ''; if (opts.log) log = opts.log; if (opts.fetchBuf) fetchBuf = opts.fetchBuf; }

// ---------- Wine and Proton builds ----------
// Proton: a folder with a `proton` script (Steam's own builds, GE-Proton, UMU-Proton, distro builds such as CachyOS's)
const PROTON_DIRS = () => [
  path.join(H(), '.steam', 'root', 'compatibilitytools.d'), path.join(H(), '.local', 'share', 'Steam', 'compatibilitytools.d'),
  path.join(H(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam', 'compatibilitytools.d'),
  '/usr/share/steam/compatibilitytools.d', '/usr/local/share/steam/compatibilitytools.d', path.join(toolsDir(), 'proton')];
const STEAM_COMMON = () => [path.join(H(), '.steam', 'steam', 'steamapps', 'common'), path.join(H(), '.local', 'share', 'Steam', 'steamapps', 'common')];
// Wine: a build folder with bin/wine (Lutris' runners, Špajz's tools/wine), and the system's wine
const WINE_DIRS = () => [path.join(H(), '.local', 'share', 'lutris', 'runners', 'wine'), path.join(toolsDir(), 'wine')];
// newest first: "GE-Proton11-5" before "GE-Proton10-4", "Proton 9.0" before "Proton 8.0"
const verKey = n => (String(n).match(/\d+/g) || []).map(x => x.padStart(6, '0')).join('.');
const newestFirst = (a, b, name) => verKey(name(b)).localeCompare(verKey(name(a)));
function runners() {
  const out = [], seen = new Set();
  const add = r => { let real = r.path; try { real = fs.realpathSync(r.path); } catch {} if (seen.has(real)) return; seen.add(real); out.push(r); };
  const protons = [];
  for (const d of PROTON_DIRS()) for (const p of ls(d)) if (isFile(path.join(p, 'proton'))) protons.push(p);
  for (const d of STEAM_COMMON()) for (const p of ls(d)) if (/^proton/i.test(path.basename(p)) && isFile(path.join(p, 'proton'))) protons.push(p);
  protons.sort((a, b) => newestFirst(a, b, path.basename));
  for (const p of protons) add({ id: 'proton:' + p, kind: 'proton', name: path.basename(p), path: p });
  const wineName = w => path.basename(path.dirname(path.dirname(w)));
  const wines = [];
  for (const d of WINE_DIRS()) for (const p of ls(d)) if (isExec(path.join(p, 'bin', 'wine'))) wines.push(path.join(p, 'bin', 'wine'));
  wines.sort((a, b) => newestFirst(a, b, wineName));
  for (const w of wines) add({ id: 'wine:' + w, kind: 'wine', name: wineName(w), path: w });
  const sys = which('wine'); if (sys) add({ id: 'wine:' + sys, kind: 'wine', name: 'Wine (system)', path: sys });
  return out;
}
// a runner from its id (Settings keeps the id), or the best one found: Proton first (it brings DXVK and VKD3D), the
// newest GE-Proton or UMU-Proton before Valve's builds, then Wine
function pickRunner(id, list = runners()) {
  if (id) { const r = list.find(x => x.id === id); if (r) return r; }
  return list.find(r => r.kind === 'proton' && /ge-proton|umu-proton/i.test(r.name)) || list.find(r => r.kind === 'proton') || list[0] || null;
}
const umuRun = () => which('umu-run') || [path.join(H(), '.local', 'bin', 'umu-run'), '/usr/bin/umu-run', '/usr/local/bin/umu-run'].find(isExec) || null;
const steamRoot = () => [path.join(H(), '.steam', 'steam'), path.join(H(), '.local', 'share', 'Steam')].find(isDir) || '';

// ---------- prefixes ----------
const prefixRoot = custom => custom && path.isAbsolute(custom) ? custom : path.join(root(), 'Prefixes');
// a game's prefix folder: its name, readable ("Rocket League®" → "Rocket League"), safe as a folder name
const prefixName = title => String(title || '').replace(/[®™©]/g, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Game';
const prefixFor = (title, custom) => path.join(prefixRoot(custom), prefixName(title));

// ---------- the environment a game starts with ----------
// Špajz's environment without what belongs to Špajz's own AppImage (its folder on the library and program paths: a
// game would load Špajz's copies of GTK, libnotify…), then the game's own variables
function cleanEnv(extra = {}) {
  const e = { ...process.env }, own = process.env.APPDIR;
  for (const k of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete e[k];
  for (const k of ['LD_LIBRARY_PATH', 'PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR']) if (own && e[k]) { e[k] = e[k].split(':').filter(p => p && !p.startsWith(own)).join(':'); if (!e[k]) delete e[k]; }
  return { ...e, ...extra };
}
// a native game's own home (Settings → PC games → Game data folder): its saves and settings go there. The XDG folders
// follow it, so a game that uses them ends up there too. {} when there's none.
function gameHome(dir) {
  if (!dir || !path.isAbsolute(dir)) return {};
  const x = { HOME: dir, XDG_CONFIG_HOME: path.join(dir, '.config'), XDG_DATA_HOME: path.join(dir, '.local', 'share'), XDG_CACHE_HOME: path.join(dir, '.cache'), XDG_STATE_HOME: path.join(dir, '.local', 'state') };
  for (const d of Object.values(x)) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }
  return x;
}
// the anti-cheat runtimes: Špajz's tools/runtimes, or Steam's own copies
const runtimeDir = (name, steamName) => [path.join(toolsDir(), 'runtimes', name), ...STEAM_COMMON().map(c => path.join(c, steamName))].find(isDir) || '';
// What every Proton start gets: the anti-cheat runtimes (Easy Anti-Cheat and BattlEye: without them a game such as Rocket
// League waits on an empty Wine window), NVAPI (DLSS / Reflex on NVIDIA), LD_PRELOAD emptied (the Steam overlay's library
// from the session would be loaded into the game) and Steam's app ids at 0.
function protonEnv(title) {
  const e = { LD_PRELOAD: '', STEAM_COMPAT_APP_ID: '0', SteamAppId: '0', SteamGameId: 'trustyshelf-' + slug(title).replace(/-/g, ''), PROTON_ENABLE_NVAPI: '1', DXVK_NVAPI_ALLOW_OTHER_DRIVERS: '1' };
  const eac = runtimeDir('eac_runtime', 'Proton EasyAntiCheat Runtime'); if (eac) e.PROTON_EAC_RUNTIME = eac;
  const be = runtimeDir('battleye_runtime', 'Proton BattlEye Runtime'); if (be) e.PROTON_BATTLEYE_RUNTIME = be;
  return e;
}

// the command that runs a Windows program: { cmd, args, env, cwd, how }. env is the full environment for the child.
//   proton + umu-run: WINEPREFIX / STEAM_COMPAT_DATA_PATH = the prefix, PROTONPATH = the build
//   proton alone:     <build>/proton waitforexitandrun <exe>
//   wine:             <wine> <exe>, WINEPREFIX = the prefix
function windowsCommand({ exe, args = [], cwd, runner, prefix, env = {}, gameId, store }) {
  if (!runner) throw new Error('No Wine or Proton found. Install Wine, or a Proton build (GE-Proton) with Steam or ProtonUp-Qt.');
  try { fs.mkdirSync(prefix, { recursive: true }); } catch (e) { throw new Error(`Can't make the Wine prefix ${prefix}: ${e.message}`); }
  const base = cleanEnv(env), dir = cwd || path.dirname(exe);
  if (runner.kind === 'proton') {
    const pe = { ...base, WINEPREFIX: prefix, STEAM_COMPAT_DATA_PATH: prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot() || prefix, STEAM_COMPAT_INSTALL_PATH: dir, PROTONPATH: runner.path };
    const umu = umuRun();
    if (umu) return { cmd: umu, args: [exe, ...args], cwd: dir, env: { ...pe, GAMEID: gameId || 'umu-0', STORE: store || 'none', UMU_RUNTIME_UPDATE: pe.UMU_RUNTIME_UPDATE || '1' }, how: `${runner.name} (umu-run)` };
    return { cmd: path.join(runner.path, 'proton'), args: ['waitforexitandrun', exe, ...args], cwd: dir, env: pe, how: runner.name };
  }
  return { cmd: runner.path, args: [exe, ...args], cwd: dir, env: { ...base, WINEPREFIX: prefix }, how: runner.name };
}
// umu-run's Steam Linux Runtime isn't there yet: the first Proton start downloads it (about 700 MB) before the game shows
const umuNeedsRuntime = () => { if (!umuRun()) return false; try { return !fs.readdirSync(path.join(H(), '.local', 'share', 'umu'), { withFileTypes: true }).some(e => e.isDirectory() && /^steamrt/.test(e.name)); } catch { return true; } };
// end whatever is left in a prefix (wineserver) once its game has closed or been forced
function endPrefix(runner, prefix) {
  if (!runner || !prefix) return;
  const ws = runner.kind === 'wine' ? path.join(path.dirname(runner.path), 'wineserver') : path.join(runner.path, 'files', 'bin', 'wineserver');
  const pfx = runner.kind === 'proton' && isDir(path.join(prefix, 'pfx')) ? path.join(prefix, 'pfx') : prefix;
  if (isExec(ws)) try { execFile(ws, ['-k'], { env: { ...process.env, WINEPREFIX: pfx }, timeout: 10000 }, () => {}); } catch {}
}
const isWindowsProgram = exe => /\.(exe|msi|bat|lnk)$/i.test(String(exe || ''));

// ---------- umu's game ids (protonfixes): asked once per game, kept in data/umu-ids.json ----------
let umuIds = null; const umuFile = () => path.join(dataDir, 'umu-ids.json');
function umuId(store, codename) {
  if (!umuIds) umuIds = readJson(umuFile()) || {};
  const k = store + ':' + codename, e = umuIds[k];
  if (e && (e.id || Date.now() - e.at < 7 * 864e5)) return Promise.resolve(e.id || null);
  return new Promise(res => {
    const rq = https.get(`https://umu.openwinecomponents.org/umu_api.php?store=${encodeURIComponent(store)}&codename=${encodeURIComponent(codename)}`, { headers: { 'User-Agent': 'TrustyShelf' }, timeout: 4000 }, r => {
      let b = ''; r.setEncoding('utf8'); r.on('data', c => { b += c; if (b.length > 1e5) rq.destroy(); });
      r.on('end', () => { let id = null; try { const j = JSON.parse(b); const x = Array.isArray(j) ? j[0] : j; if (x && /^umu-[\w.-]{1,40}$/.test(String(x.umu_id || ''))) id = x.umu_id; } catch {}
        umuIds[k] = { id, at: Date.now() }; try { fs.writeFileSync(umuFile(), JSON.stringify(umuIds)); } catch {} res(id); }); });
    rq.on('timeout', () => rq.destroy(new Error('timeout'))); rq.on('error', () => res(null));
  });
}

// ---------- legendary (Epic Games) ----------
// legendary itself: the one chosen in Settings, one on the PATH, then Špajz's own tools/legendary (Get legendary)
const LEGENDARY = { version: '0.21.1', url: 'https://github.com/derrod/legendary/releases/download/0.21.1/legendary_linux_x64', sha256: 'dbed33bbe96031e65858233e4badf0a1d401bb6cb0cc995d1237cf3a0c826a45' };
function legendaryBin(custom) {
  if (custom && isExec(custom)) return custom;
  return which('legendary') || [path.join(toolsDir(), 'legendary')].find(isExec) || null;
}
// Settings → PC games → Get legendary: its release from GitHub, checked against the SHA-256 GitHub publishes for it
async function getLegendary() {
  if (!fetchBuf) throw new Error("Can't download here.");
  const buf = await fetchBuf(LEGENDARY.url);
  if (!buf) throw new Error("Couldn't download legendary. Check the internet connection.");
  if (crypto.createHash('sha256').update(buf).digest('hex') !== LEGENDARY.sha256) throw new Error('The legendary download was damaged. Try again.');
  const dest = path.join(toolsDir(), 'legendary');
  fs.mkdirSync(toolsDir(), { recursive: true }); fs.writeFileSync(dest + '.tmp', buf, { mode: 0o755 }); fs.renameSync(dest + '.tmp', dest);
  log('legendary', LEGENDARY.version, 'downloaded to', dest); return dest;
}
// legendary's folder (Špajz's Epic sign-in and install list)
const legendaryConfig = () => ({ dir: process.env.LEGENDARY_CONFIG_PATH && isDir(process.env.LEGENDARY_CONFIG_PATH) ? process.env.LEGENDARY_CONFIG_PATH : path.join(dataDir, 'legendary') });
function runLegendary(bin, args, { ms = 60000, onLine } = {}) {
  let proc = null; // (the executor runs at once: the child is known before the promise is returned, for Cancel)
  const pr = new Promise(res => {
    const cfg = legendaryConfig(); try { fs.mkdirSync(cfg.dir, { recursive: true }); } catch {}
    let out = '', err = '', done = false;
    const env = { ...cleanEnv(), LEGENDARY_CONFIG_PATH: cfg.dir, PYTHONUNBUFFERED: '1' };
    let p; try { p = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return res({ code: -1, out: '', err: e.message }); }
    proc = p;
    const t = ms ? setTimeout(() => { try { p.kill('SIGTERM'); } catch {} }, ms) : null;
    const lines = (buf, s) => { if (!onLine) return buf + s; buf += s; const parts = buf.split(/\r?\n|\r/); const rest = parts.pop(); for (const l of parts) try { onLine(l); } catch {} return rest; };
    let ob = '', eb = '';
    p.stdout.on('data', c => { const s = c.toString(); if (out.length < 32e6) out += s; ob = lines(ob, s); });
    p.stderr.on('data', c => { const s = c.toString(); if (err.length < 2e6) err += s; eb = lines(eb, s); });
    const fin = code => { if (done) return; done = true; if (t) clearTimeout(t); res({ code, out, err }); };
    p.on('error', e => { err += e.message; fin(-1); }); p.on('close', fin);
  });
  pr.proc = proc;
  return pr;
}
// the signed-in account's name (never its tokens), or null
function epicAccount() { const u = readJson(path.join(legendaryConfig().dir, 'user.json')); return u && (u.displayName || u.account_id) ? String(u.displayName || 'Epic account').slice(0, 80) : null; }
// Epic's own box art among a game's store pictures: the tall box, else the wide one; '' when there's none
function boxArt(keyImages) {
  const imgs = Array.isArray(keyImages) ? keyImages : [], pick = t => imgs.find(i => i && i.type === t && typeof i.url === 'string' && /^https:\/\//.test(i.url));
  const i = pick('DieselGameBoxTall') || pick('OfferImageTall') || pick('DieselGameBox'); return i ? i.url : '';
}
const epicCover = app => { const m = readJson(path.join(legendaryConfig().dir, 'metadata', app + '.json')); return boxArt(m && m.metadata && m.metadata.keyImages); };
// the installed Epic games: legendary's installed.json (read, never written); DLC and games whose folder is gone left out
function epicInstalled() {
  const j = readJson(path.join(legendaryConfig().dir, 'installed.json')); if (!j || typeof j !== 'object') return [];
  const out = [];
  for (const [app, g] of Object.entries(j).slice(0, 2000)) {
    if (!g || typeof g !== 'object' || g.is_dlc || !APP.test(app)) continue;
    const dir = String(g.install_path || ''); if (!dir || !isDir(dir)) continue;
    out.push({ id: 'epic-' + slug(app), source: 'epic', installed: true, title: String(g.title || app).trim().slice(0, 120), appName: app, dir, exe: g.executable ? path.join(dir, String(g.executable)) : '', platform: String(g.platform || 'Windows'), coverUrl: epicCover(app), installSize: +g.install_size || 0 });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}
// every game the account owns, as last read from Epic (data/epic-library.json), installed or not: the installed ones from
// epicInstalled, the others with installed: false (the shelf shows them greyed; Play offers to install them)
const libraryFile = () => path.join(dataDir, 'epic-library.json');
const libraryAge = () => { const c = readJson(libraryFile()); return c && c.at ? Date.now() - c.at : Infinity; };
function epicOwned() {
  const inst = epicInstalled(), have = new Set(inst.map(g => g.appName)), c = readJson(libraryFile());
  const rest = (c && Array.isArray(c.games) ? c.games : []).filter(g => g && APP.test(String(g.appName)) && !have.has(g.appName))
    .map(g => ({ id: 'epic-' + slug(g.appName), source: 'epic', installed: false, title: String(g.title || g.appName).slice(0, 120), appName: g.appName, dir: '', exe: '', coverUrl: typeof g.cover === 'string' ? g.cover : '' }));
  return [...inst, ...rest].sort((a, b) => a.title.localeCompare(b.title));
}
// ask Epic for the account's library (legendary list) and keep it; [{ appName, title, installed, cover }]
async function epicLibrary(bin) {
  const r = await runLegendary(bin, ['list', '--json'], { ms: 120000 });
  if (r.code !== 0) return { error: epicAccount() ? "Couldn't get your Epic library. Check the internet connection." : 'Sign in to Epic Games first.' };
  let list = []; try { list = JSON.parse(r.out); } catch { return { error: "Couldn't read the Epic library." }; }
  const games = [];
  for (const g of Array.isArray(list) ? list.slice(0, 5000) : []) {
    const app = String(g && g.app_name || ''); if (!APP.test(app)) continue;
    games.push({ appName: app, title: String(g.app_title || app).slice(0, 120), cover: boxArt(g.metadata && g.metadata.keyImages) });
  }
  games.sort((a, b) => a.title.localeCompare(b.title));
  if (!epicAccount()) return { error: 'Sign in to Epic Games first.' }; // (signed out while Epic was answering: nothing is kept)
  try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(libraryFile() + '.tmp', JSON.stringify({ at: Date.now(), games })); fs.renameSync(libraryFile() + '.tmp', libraryFile()); } catch (e) { log('Epic library not kept', e.message); }
  const have = new Set(epicInstalled().map(g => g.appName));
  return { games: games.map(g => ({ ...g, installed: have.has(g.appName) })) };
}
// sign in with the code from Epic's login page (main.js shows it and reads the code); { ok, name } or { error }
async function epicSignIn(bin, code) {
  if (!/^[\w-]{8,200}$/.test(String(code || ''))) return { error: "Epic didn't give a sign-in code. Try again." };
  const r = await runLegendary(bin, ['auth', '--code', String(code)], { ms: 60000 });
  const name = epicAccount();
  if (r.code === 0 && name) { log('Epic: signed in'); return { ok: true, name }; }
  log('Epic sign-in failed', r.code, (r.err || '').split('\n').filter(l => /ERROR|error/.test(l)).slice(-2).join(' | ').replace(/[\w-]{24,}/g, '…'));
  return { error: "Couldn't sign in to Epic Games. Try again in a moment." };
}
async function epicSignOut(bin) { const r = await runLegendary(bin, ['auth', '--delete'], { ms: 30000 }); try { fs.unlinkSync(libraryFile()); } catch {} log('Epic: signed out', r.code); return { ok: !epicAccount() }; }
// The installs and updates are a queue run one at a time (main/epicdl.js): { id, appName, title, pct, speed, eta, state: 'queued' |
// 'installing' | 'paused' | 'done' | 'failed' | 'cancelled' }. main.js hands in how to find legendary and who to tell (epicHooks).
const epicdl = require('./epicdl');
let dl = null, hooks = { bin: null, onChange: null, onSettled: null };
function epicHooks(h) { hooks = { ...hooks, ...(h || {}) }; }
function downloads() {
  if (!dl) dl = epicdl.create({ file: path.join(dataDir, 'epic-downloads.json'), bin: () => (hooks.bin ? hooks.bin() : legendaryBin()), run: (bin, args, o) => runLegendary(bin, args, { ms: 0, onLine: o && o.onLine }), appRe: APP,
    noteUnfinished: (dirs, app, finished) => noteUnfinished(dirs, app, finished), onChange: (l, j) => { if (hooks.onChange) hooks.onChange(l, j); }, onSettled: it => { if (hooks.onSettled) hooks.onSettled(it); }, log: (...a) => log(...a) });
  return dl;
}
const epicJob = () => downloads().job();
const epicDownloads = () => downloads().list();
// the folders of Epic installs not finished yet (downloading now, or stopped half way: legendary picks them up next time),
// kept in data/epic-unfinished.json: { "<folder>": "<app name>" }. They aren't games of the PC games folder.
const unfinishedFile = () => path.join(dataDir, 'epic-unfinished.json');
function epicUnfinished() {
  const m = readJson(unfinishedFile()) || {}, done = new Set(epicInstalled().map(g => path.resolve(g.dir)));
  return [...Object.keys(m).filter(d => !done.has(path.resolve(d))), ...downloads().unfinishedDirs()];
}
function noteUnfinished(dirs, appName, finished) {
  const m = readJson(unfinishedFile()) || {};
  if (finished) { for (const [d, a] of Object.entries(m)) if (a === appName) delete m[d]; }
  else for (const d of dirs) m[d] = appName; // (stopped again after picking up: the folder noted the first time stays noted)
  try { fs.writeFileSync(unfinishedFile(), JSON.stringify(m)); } catch (e) { log('Epic: unfinished installs not kept', e.message); }
}
// where Epic games install: the folder chosen for them, else the PC games folder, else <Špajz>/Epic Games
const epicInstallDir = (custom, gamesDir) => [custom, gamesDir].find(d => d && path.isAbsolute(d)) || path.join(root(), 'Epic Games');
// (bin and onChange: from the older single-install call; main.js now hands both in once, through epicHooks)
function epicInstall(bin, appName, title, baseDir, onChange, update = false) {
  if (!APP.test(String(appName || ''))) throw new Error('Unknown Epic game.');
  if (bin && !hooks.bin) hooks.bin = () => bin;
  if (onChange && !hooks.onChange) hooks.onChange = (l, j) => onChange(j);
  return downloads().add({ appName, title, baseDir, update });
}
const epicCancel = () => downloads().cancelCurrent();
const epicPause = id => downloads().pause(id), epicResume = id => downloads().resume(id), epicStop = id => downloads().stop(id), epicRemove = id => downloads().remove(id);
const epicMove = (id, d) => downloads().move(id, d), epicClearDone = () => downloads().clearDone();
async function epicUninstall(bin, appName) {
  if (!APP.test(String(appName || ''))) throw new Error('Unknown Epic game.');
  const r = await runLegendary(bin, ['uninstall', appName, '-y'], { ms: 300000 });
  log('Epic: uninstall', appName, r.code); return { ok: r.code === 0 };
}
// how to start an installed Epic game: legendary hands over its program and Epic's sign-in arguments (online; an update
// waiting is skipped for now; offline when Epic can't be reached and the game allows it); { exe, args, cwd, env, offline, outdated }
async function epicLaunchInfo(bin, appName) {
  let outdated = false;
  const ask = async (off, skip) => { const r = await runLegendary(bin, ['launch', appName, '--json', ...(off ? ['--offline'] : []), ...(skip ? ['--skip-version-check'] : [])], { ms: 45000 });
    if (r.code !== 0) { if (/out of date/i.test(r.err)) outdated = true; return null; } try { return JSON.parse(r.out); } catch { return null; } };
  let off = !epicAccount(), j = await ask(off, false);
  if (!j && !off && outdated) { j = await ask(false, true); if (j) log('Epic: an update is available, starting this version', appName); }
  if (!j && !off) { off = true; j = await ask(true, false); if (j) log('Epic: offline launch (Epic not reachable)', appName); }
  if (!j || !j.game_executable || !j.game_directory) throw new Error(epicAccount() ? "Couldn't get the game ready with Epic. Check the internet connection, or that the game is still installed." : 'Sign in to Epic Games in Settings → PC games first.');
  const strs = a => (Array.isArray(a) ? a : []).map(String).filter(Boolean).slice(0, 200);
  const env = {}; if (j.environment && typeof j.environment === 'object') for (const [k, v] of Object.entries(j.environment)) if (/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(k)) env[k] = String(v);
  return { exe: path.join(String(j.game_directory), String(j.game_executable)), args: [...strs(j.game_parameters), ...strs(j.egl_parameters), ...strs(j.user_parameters)], cwd: String(j.working_directory || j.game_directory), env, offline: off, outdated };
}

module.exports = { init, runners, pickRunner, windowsCommand, cleanEnv, gameHome, protonEnv, umuNeedsRuntime, endPrefix, isWindowsProgram, prefixFor, prefixRoot, prefixName, umuRun, umuId,
  legendaryBin, getLegendary, legendaryConfig, epicAccount, epicInstalled, epicOwned, epicLibrary, libraryAge, epicSignIn, epicSignOut, epicInstall, epicCancel, epicUninstall, epicJob, epicInstallDir, epicUnfinished, epicLaunchInfo,
  epicHooks, epicDownloads, epicPause, epicResume, epicStop, epicRemove, epicMove, epicClearDone, runLegendary };
