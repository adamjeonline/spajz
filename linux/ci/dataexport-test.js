// (T)rustyShelf's Export everything / Import everything (main/dataexport.js; Boxshelf's issue 18). Run: node linux/ci/dataexport-test.js
//   - an export has the settings and downloads (not the browser engine's caches, logs or sign-ins), the app folder's
//     Library / themes, and the art kept next to each console's games, with a manifest
//   - an import puts them all back on a fresh install (the settings it had kept as a backup file), art next to the games
//     where it was; art with nowhere to go is said, not lost
// Everything in a made-up folder.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const dx = require(path.join(ROOT, 'main', 'dataexport.js')), paths = require(path.join(ROOT, 'main', 'paths.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsexport-'));
const mk = (p, body) => { const f = path.join(tmp, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body == null ? 'x' : body); return f; };
const has = p => fs.existsSync(path.join(tmp, p)), read = p => fs.readFileSync(path.join(tmp, p), 'utf8');

(async () => {
  try {
    // PC one: an install with its downloads, and a games folder elsewhere with art beside the games
    const romDir = path.join(tmp, 'Games', 'gc');
    const cfg = { systems: { gc: { romDirs: [romDir] }, psx: { romDirs: [path.join(tmp, 'Games', 'psx-gone')] } } };
    mk('A/data/config.json', JSON.stringify(cfg)); mk('A/data/boxart-cache/launchbox-Nintendo_GameCube.json', '{"big":1}'); mk('A/data/Local Storage/leveldb/000003.log', 'ui');
    mk('A/data/Cache/Cache_Data/f_000001'); mk('A/data/Cookies'); mk('A/data/legendary/user.json', '{"token":"secret"}'); mk('A/data/trustyshelf.log'); mk('A/data/companion.json', '{"pair":"secret"}');
    mk('A/Library/Games/covers/Mario.png', 'cover'); mk('A/themes/gc/logo.png'); mk('Games/gc/Mario (USA).iso'); mk('Games/gc/covers/Mario (USA).png', 'beside'); mk('Games/gc/manuals/Mario (USA)/1.jpg', 'page');
    fs.mkdirSync(path.join(tmp, 'out'));
    const steps = [];
    const r = await dx.exportAll({ dest: path.join(tmp, 'out'), appRoot: path.join(tmp, 'A'), dataDir: path.join(tmp, 'A', 'data'), cfg, artDirsFor: paths.artDirsFor, artLib: '', version: '1.0.2.0', onStep: s => steps.push(s.label) });
    const ex = path.relative(tmp, r.dir), man = JSON.parse(read(path.join(ex, 'manifest.json')));
    check('Export: settings, the box art database and the UI\'s saved state are in it', has(`${ex}/data/config.json`) && has(`${ex}/data/boxart-cache/launchbox-Nintendo_GameCube.json`) && has(`${ex}/data/Local Storage/leveldb/000003.log`), ex);
    check('Export: the browser engine\'s cache, cookies, the log, Epic\'s sign-in and the phone pairing are left out', !has(`${ex}/data/Cache`) && !has(`${ex}/data/Cookies`) && !has(`${ex}/data/trustyshelf.log`) && !has(`${ex}/data/legendary`) && !has(`${ex}/data/companion.json`));
    check('Export: the app folder\'s Library and themes, and the art and manuals next to the GameCube games', has(`${ex}/app/Library/Games/covers/Mario.png`) && has(`${ex}/app/themes/gc/logo.png`) && man.romArt.some(a => a.console === 'gc') && has(path.join(ex, man.romArt.find(a => a.console === 'gc' && /covers$/.test(a.path)).rel, 'Mario (USA).png')), JSON.stringify(man.romArt));
    check('Export: each step is said as it goes, and the size and file count come back', steps.length >= 4 && r.files >= 7 && r.bytes > 0, JSON.stringify({ steps, files: r.files }));

    // PC two: a fresh install; the same games folder, its art gone
    fs.rmSync(path.join(tmp, 'Games', 'gc', 'covers'), { recursive: true }); fs.rmSync(path.join(tmp, 'Games', 'gc', 'manuals'), { recursive: true });
    mk('B/data/config.json', '{"systems":{}}');
    const im = await dx.importAll({ src: r.dir, appRoot: path.join(tmp, 'B'), dataDir: path.join(tmp, 'B', 'data'), artDirsFor: paths.artDirsFor, artLib: '', readCfg: () => JSON.parse(read('B/data/config.json')) });
    const backups = fs.readdirSync(path.join(tmp, 'B', 'data')).filter(f => /^config-before-import-/.test(f));
    check('Import: the export\'s settings and downloads are in place, the settings it had kept as a backup file', JSON.parse(read('B/data/config.json')).systems.gc && has('B/data/boxart-cache/launchbox-Nintendo_GameCube.json') && backups.length === 1 && read(`B/data/${backups[0]}`) === '{"systems":{}}', JSON.stringify(backups));
    check('Import: the Library and themes, and the art and manuals back next to the GameCube games', has('B/Library/Games/covers/Mario.png') && has('B/themes/gc/logo.png') && read('Games/gc/covers/Mario (USA).png') === 'beside' && has('Games/gc/manuals/Mario (USA)/1.jpg'));
    check('Import: nothing that was left out of the export appears (no sign-ins)', !has('B/data/legendary') && !has('B/data/companion.json'));
    // a folder that isn't an export
    let err = ''; try { await dx.importAll({ src: path.join(tmp, 'Games'), appRoot: path.join(tmp, 'B'), dataDir: path.join(tmp, 'B', 'data'), artDirsFor: paths.artDirsFor }); } catch (e) { err = e.message; }
    check('Import: a folder that isn\'t an export is turned away with a message (nothing copied)', /isn't a \(T\)rustyShelf export/.test(err), err);
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
