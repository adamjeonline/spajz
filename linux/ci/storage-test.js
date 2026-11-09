// (T)rustyShelf's PC game storage view (main/storage.js). Run: node linux/ci/storage-test.js
//   - each game's folder is matched to the drive it is on (the longest mount that holds it; a Windows path by its drive letter)
//   - drives and the games on them are listed biggest first, each drive with its free and total space
//   - a game with no folder, a folder that isn't there, or a folder already listed is left out
// Made-up mounts and folders; nothing here reads this PC's real disks (the free space comes from a stand-in).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const storage = require(path.join(ROOT, 'main', 'storage.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsstor-'));
const mk = p => { const f = path.join(tmp, p); fs.mkdirSync(f, { recursive: true }); return f; };
(async () => {
  try {
    const mounts = ['/dev/nvme0n1p2 / ext4 rw 0 0', `/dev/sda1 ${tmp}/Games ext4 rw 0 0`, `/dev/mmcblk0p1 ${tmp}/SD\\040Card btrfs rw 0 0`, 'tmpfs /run tmpfs rw 0 0'].join('\n');
    check('the longest mount that holds the folder wins (a games drive inside the root drive)', storage.mountOf(`${tmp}/Games/Elden Ring`, mounts) === `${tmp}/Games` && storage.mountOf(`${tmp}/Other/x`, mounts) === '/');
    check('a mount with a space in its name ("\\040") is read right, and a folder named like its start is not on it', storage.mountOf(`${tmp}/SD Card/Epic/G`, mounts) === `${tmp}/SD Card` && storage.mountOf(`${tmp}/Games2/x`, mounts) === '/');
    check('a Windows path is on its drive, whatever the case', storage.mountOf('D:\\Games\\Celeste', '') === 'D:\\' && storage.mountOf('c:\\Program Files\\x', '') === 'c:\\');
    const a = mk('Games/Big Game'), b = mk('Games/Small Game'), c = mk('SD Card/Epic/Mid Game'), d = mk('Other/Root Game');
    const games = [{ id: 'g1', title: 'Big Game', source: 'epic', dir: a, bytes: 5e9 }, { id: 'g2', title: 'Small Game', source: 'folder', dir: b, bytes: 1e9 }, { id: 'g3', title: 'Mid Game', source: 'epic', dir: c, bytes: 3e9 },
      { id: 'g4', title: 'Root Game', source: 'steam', dir: d, bytes: 2e9 }, { id: 'g5', title: 'No Folder', source: 'gog', dir: '', bytes: 9e9 }, { id: 'g6', title: 'Gone', source: 'gog', dir: path.join(tmp, 'nope'), bytes: 9e9 },
      { id: 'g7', title: 'Same folder again', source: 'epic', dir: a, bytes: 5e9 }];
    const space = async root => ({ free: root === '/' ? 100e9 : 40e9, total: root === '/' ? 500e9 : 200e9 });
    const r = await storage.summary(games, { mountsText: mounts, statfs: space });
    const names = r.drives.map(x => x.root.replace(tmp, '<tmp>')), by = Object.fromEntries(r.drives.map(x => [x.root.replace(tmp, '<tmp>'), x]));
    check('three drives: the games drive first (5 + 1 GB), then the card (3 GB), then the root (2 GB)', JSON.stringify(names) === JSON.stringify(['<tmp>/Games', '<tmp>/SD Card', '/']), JSON.stringify(names));
    check('each drive lists its games biggest first, with the drive\'s total for them', by['<tmp>/Games'].games.map(g => g.title).join() === 'Big Game,Small Game' && by['<tmp>/Games'].gamesBytes === 6e9 && by['/'].games.map(g => g.title).join() === 'Root Game', JSON.stringify(r.drives.map(x => [x.root, x.gamesBytes, x.games.map(g => g.title)])));
    check('each drive has its free and total space', by['/'].free === 100e9 && by['/'].total === 500e9 && by['<tmp>/Games'].total === 200e9, JSON.stringify(r.drives.map(x => [x.free, x.total])));
    check('a game with no folder, a folder that isn\'t there, and a folder already listed are left out', !JSON.stringify(r).includes('No Folder') && !JSON.stringify(r).includes('Gone') && !JSON.stringify(r).includes('Same folder again'));
    const none = await storage.summary([], { mountsText: mounts, statfs: space });
    check('no games gives no drives (not an error)', Array.isArray(none.drives) && none.drives.length === 0);
    const real = await storage.summary([{ id: 'x', title: 'Real', source: 'folder', dir: a, bytes: 7 }]);
    check('the real free space is read when none is handed in (statfs)', real.drives.length === 1 && typeof real.drives[0].free === 'number' && real.drives[0].total > 0, JSON.stringify(real.drives[0]));
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
