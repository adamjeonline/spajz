// Špajz: Export everything / Import everything (Settings → System), asked for in Boxshelf's issue 18: a big
// collection's art and manuals take days to download, so they can be carried to another PC (or a second install) whole.
// Kept free of Electron (main.js passes in what it knows), so linux/ci/dataexport-test.js runs it on its own.
//
// An export is one folder, "Špajz export <date>", holding:
//   data/          the data folder: settings, favourites, play history, box art database, caches of art, PC covers …
//                  (not the browser engine's caches, logs or sign-ins: cookies, Epic's login, the phone pairing)
//   app/<name>/    the app folder's Library (art kept in Špajz's folder), themes, Custom themes, Guides,
//                  Magazines and Songs, and an art library kept elsewhere as app/Library-elsewhere
//   rom-art/<console>/<n>/   art and manuals kept next to the games (each console's covers / manuals folders)
//   manifest.json  what's where, and where it came from
// An import copies an export back: nothing is deleted, files of the same name are replaced (config.json is kept as
// config-before-import-<date>.json first); art from next to the games goes to the same folder if this PC has it, else
// to the same console's folder in the same place on the list. The app then starts again on the imported settings.
'use strict';
const fs = require('fs'), fsp = fs.promises, path = require('path');

const SKIP = /^(cache|code cache|gpucache|dawngraphitecache|dawnwebgpucache|grshadercache|shadercache|blob_storage|crashpad|logs|session storage|shared dictionary|sharedstorage|dictionaries|dips|trust tokens.*|cookies.*|network persistent state|transportsecurity|preferences|local state|devtoolsactiveport|padwatch|legendary|companion\.json|.*\.log|.*\.tmp|singleton.*|lockfile)$/i;
const APP_DIRS = ['Library', 'themes', 'Custom themes', 'Guides', 'Magazines', 'Songs'];
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const inside = (p, root) => { const a = path.resolve(p).toLowerCase(), b = path.resolve(root).toLowerCase(); return a === b || a.startsWith(b + path.sep); };
// what's left out is decided at the data folder's top level only (inside Local Storage, *.log files are its data)
const topSkip = root => { const r = path.resolve(root); return src => path.resolve(path.dirname(src)) !== r || !SKIP.test(path.basename(src)); };
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');

async function size(p) { let n = 0, files = 0; const walk = async d => { let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory()) await walk(f); else if (e.isFile()) { try { n += (await fsp.stat(f)).size; files++; } catch {} } } }; if (isDir(p)) await walk(p); else { try { n = (await fsp.stat(p)).size; files = 1; } catch {} } return { bytes: n, files }; }
async function copy(src, dst, filter) { await fsp.mkdir(path.dirname(dst), { recursive: true }); await fsp.cp(src, dst, { recursive: true, force: true, errorOnExist: false, preserveTimestamps: true, filter: filter || (() => true) }); }

// the art kept next to each console's games: [{ console, n, path }] (not what's already inside the app folder or the library)
function romArt(cfg, artDirsFor, appRoot, artLib) {
  const out = [];
  for (const [id, sc] of Object.entries((cfg && cfg.systems) || {})) {
    let n = 0;
    for (const d of [...(artDirsFor(sc) || []), ...((sc && sc.romDirs) || []).map(r => path.join(r, 'manuals'))].filter(Boolean)) { // (and a manuals folder of your own beside the games)
      if (!isDir(d) || inside(d, appRoot) || (artLib && inside(d, artLib)) || out.some(o => path.resolve(o.path) === path.resolve(d))) continue;
      out.push({ console: id, n: n++, path: d });
    }
  }
  return out;
}

// → { dir, bytes, files, parts }
async function exportAll({ dest, appRoot, dataDir, cfg, artDirsFor, artLib, version, onStep = () => {} }) {
  if (!dest || !isDir(dest)) throw new Error('Choose a folder to export to.');
  const dir = path.join(dest, `Špajz export ${stamp()}`); await fsp.mkdir(dir, { recursive: true });
  const manifest = { app: 'Špajz', version: version || '', at: new Date().toISOString(), from: { appRoot, dataDir }, parts: [], romArt: [] };
  const steps = [], art = romArt(cfg, artDirsFor, appRoot, artLib);
  steps.push(['Settings and downloads', async () => { await copy(dataDir, path.join(dir, 'data'), topSkip(dataDir)); manifest.parts.push('data'); }]);
  for (const name of APP_DIRS) { const p = path.join(appRoot, name); if (isDir(p)) steps.push([name, async () => { await copy(p, path.join(dir, 'app', name)); manifest.parts.push('app/' + name); }]); }
  if (artLib && isDir(artLib) && !inside(artLib, appRoot)) steps.push(['Art library', async () => { await copy(artLib, path.join(dir, 'app', 'Library-elsewhere')); manifest.parts.push('app/Library-elsewhere'); manifest.artLib = artLib; }]);
  for (const a of art) steps.push([`${a.console} art next to the games`, async () => { const rel = path.join('rom-art', a.console, String(a.n)); await copy(a.path, path.join(dir, rel)); manifest.romArt.push({ ...a, rel }); }]);
  for (let i = 0; i < steps.length; i++) { onStep({ i: i + 1, of: steps.length, label: steps[i][0] }); await steps[i][1](); }
  await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const s = await size(dir); return { dir, ...s, parts: manifest.parts.length + manifest.romArt.length };
}

// → { files, parts, skipped: [what had nowhere to go] }
async function importAll({ src, appRoot, dataDir, artDirsFor, artLib, readCfg, onStep = () => {} }) {
  let manifest; try { manifest = JSON.parse(await fsp.readFile(path.join(src, 'manifest.json'), 'utf8')); } catch { throw new Error('That folder isn\'t a Špajz export (no manifest.json in it).'); }
  if (manifest.app !== 'Špajz' && manifest.app !== 'Boxshelf') throw new Error('That folder isn\'t a Špajz export.');
  const steps = [], skipped = [];
  if (isDir(path.join(src, 'data'))) steps.push(['Settings and downloads', async () => {
    const cfgNow = path.join(dataDir, 'config.json'); if (fs.existsSync(cfgNow)) await fsp.copyFile(cfgNow, path.join(dataDir, `config-before-import-${stamp()}.json`));
    await copy(path.join(src, 'data'), dataDir, topSkip(path.join(src, 'data'))); }]);
  for (const name of APP_DIRS) { const p = path.join(src, 'app', name); if (isDir(p)) steps.push([name, () => copy(p, path.join(appRoot, name))]); }
  const elsewhere = path.join(src, 'app', 'Library-elsewhere');
  if (isDir(elsewhere)) steps.push(['Art library', () => copy(elsewhere, artLib && !inside(artLib, appRoot) ? artLib : path.join(appRoot, 'Library'))]);
  // art from next to the games: the folder it came from when this PC has it, else that console's folder in the same place
  const cfg = (readCfg && readCfg()) || {};
  for (const a of manifest.romArt || []) {
    steps.push([`${a.console} art next to the games`, async () => {
      const from = path.join(src, a.rel); if (!isDir(from)) return;
      let to = isDir(path.dirname(a.path)) ? a.path : null;
      if (!to) { const sc = cfg.systems && cfg.systems[a.console]; const list = sc ? (artDirsFor(sc) || []).filter(d => d && !inside(d, appRoot) && !(artLib && inside(d, artLib))) : []; to = list[a.n] || list[0] || null; if (to && !isDir(path.dirname(to))) to = null; }
      if (!to) { skipped.push(`${a.console}: ${a.path}`); return; }
      await copy(from, to);
    }]);
  }
  for (let i = 0; i < steps.length; i++) { onStep({ i: i + 1, of: steps.length, label: steps[i][0] }); await steps[i][1](); }
  return { parts: steps.length, skipped, from: manifest.at };
}

module.exports = { exportAll, importAll, romArt, SKIP };
