// The PC games folder (Settings → PC games → PC games folder): every folder in it is a game, named after the folder.
// How each one starts is worked out from what's inside:
//   - on Linux a program made for Linux wins (an AppRun, a start script, an AppImage, a Linux program); otherwise the
//     game's Windows program, which then runs through Wine / Proton (main/linuxpc.js)
//   - on Windows its Windows program
// When a folder holds several, the program can be chosen in Settings (programs: { "<folder>": "<path inside it>" }).
// Folders an Epic Games install made (they hold .egstore) are left out: those games come with the Epic account.
// A folder of the player's own copies (ownDir) can hold a game for this player alone (one that keeps its saves in its own
// folder): a folder there with the same name is used instead of the shared one.
'use strict';
const fs = require('fs');
const path = require('path');

const isLinux = process.platform === 'linux';
const crypto = require('crypto');
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'game';
// a folder's game id: readable, from its name; a name the readable part can't tell apart (letters beyond a–z, "Half-Life"
// next to "Half Life") gets a short fingerprint of the full name too
const idOf = (folder, used) => { let id = 'pc-' + slug(folder);
  if (/[^\x00-\x7f]/.test(folder) || used.has(id)) id += '-' + crypto.createHash('sha1').update(folder).digest('hex').slice(0, 8);
  used.add(id); return id; };
const entries = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const statOf = p => { try { return fs.statSync(p); } catch { return null; } };
const isExec = p => { const s = statOf(p); return !!s && s.isFile() && (s.mode & 0o111) !== 0; };
function isElf(p) { let fd; try { fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); return b[0] === 0x7f && b.toString('latin1', 1, 4) === 'ELF'; } catch { return false; } finally { if (fd != null) try { fs.closeSync(fd); } catch {} } }
// a folder's words, for telling its own program from helpers ("Hollow Knight" → hollow, knight)
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
const sharesWord = (name, folder) => { const w = new Set(words(folder)); return words(name).some(x => w.has(x)); };
const HELPER = /^(unins.*|uninstall.*|setup.*|install.*|update.*|crash.*|.*crashhandler.*|vc_?redist.*|.*\.so(\.\d+)*)$/i;
const SKIP_DIR = /^(squashfs-root|lib|lib32|lib64|libs|plugins|share|_?redist|_commonredist|directx|.*_original|backups?|old|mods?|saves?|logs?|cache|\.egstore)$/i;

// the Linux programs in a game's folder, best first: [{ rel, native: true }]
//   1. an AppRun (an unpacked AppImage), 2. a start script (.sh, the shortest name first), 3. an AppImage,
//   4. a Linux program at the top (one sharing a word with the folder's name first), 5. one in a subfolder sharing a word
function linuxPrograms(dir, folder) {
  const ranked = [];
  for (const e of entries(dir)) {
    const p = path.join(dir, e.name), n = e.name;
    if (e.isDirectory() || HELPER.test(n)) continue;
    if (n === 'AppRun' && isExec(p)) ranked.push([0, 0, n]);
    else if (/\.sh$/i.test(n) && isExec(p)) ranked.push([1, n.length, n]); // (started directly: one without its execute bit can't be)
    else if (/\.appimage$/i.test(n) && isExec(p)) ranked.push([2, n.length, n]);
    else if (isExec(p) && !/\.[a-z0-9]{1,4}$/i.test(n.replace(/\.x86_64$/i, '')) && isElf(p)) ranked.push([sharesWord(n, folder) ? 3 : 4, n.length, n]);
  }
  for (const e of entries(dir)) {
    if (!e.isDirectory() || SKIP_DIR.test(e.name)) continue;
    for (const f of entries(path.join(dir, e.name))) {
      const p = path.join(dir, e.name, f.name);
      if (f.isFile() && sharesWord(f.name, folder) && !HELPER.test(f.name) && isExec(p) && isElf(p)) ranked.push([5, f.name.length, path.join(e.name, f.name)]);
    }
  }
  return ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(r => ({ rel: r[2], native: true }));
}
// the Windows programs in a game's folder (two folders deep), best first: the shallowest (a game's own program sits at its
// top or in bin\win_x64; a bigger helper hides deeper, like MTGA_Data\Plugins\ZFGameBrowser.exe), then one sharing a word
// with the folder's name, then the biggest. On Linux a batch file can be chosen too (Wine runs it: a game's own launch
// script, setting things up before the game), after the programs; on Windows Node can't start one without a shell.
const WIN_PROGRAM = isLinux ? /\.(exe|bat)$/i : /\.exe$/i;
function windowsPrograms(dir, folder) {
  const found = [];
  const walk = (d, depth) => { for (const e of entries(d)) { const p = path.join(d, e.name);
    if (e.isFile() && WIN_PROGRAM.test(e.name) && !HELPER.test(e.name)) found.push({ rel: path.relative(dir, p), bat: /\.bat$/i.test(e.name) ? 1 : 0, depth, word: sharesWord(e.name, folder) ? 0 : 1, size: (statOf(p) || {}).size || 0 });
    else if (e.isDirectory() && depth < 2 && !SKIP_DIR.test(e.name)) walk(p, depth + 1); } };
  walk(dir, 0);
  return found.sort((a, b) => a.bat - b.bat || a.depth - b.depth || a.word - b.word || b.size - a.size).slice(0, 40).map(f => ({ rel: f.rel, native: false }));
}
// every program a game could start with, the one Špajz would pick first
const programsIn = (dir, folder) => [...(isLinux ? linuxPrograms(dir, folder) : []), ...windowsPrograms(dir, folder)];

// the games in the PC games folder: [{ id, source: 'folder', title, dir, exe, native, own, programs: [{ rel, native }] }]
// opts: { gamesDir, ownDir, programs: { folder: rel }, skip: folders already on the shelf another way (Epic installs) }
function scan({ gamesDir, ownDir, programs = {}, skip = [] } = {}) {
  if (!gamesDir) return [];
  const own = new Set(entries(ownDir || '').filter(e => e.isDirectory()).map(e => e.name)), out = [], used = new Set();
  const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } }, taken = new Set(skip.filter(Boolean).map(real));
  for (const e of entries(gamesDir).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) { // (in name order: ids stay the same between scans)
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const folder = e.name, mine = own.has(folder), dir = path.join(mine ? ownDir : gamesDir, folder);
    if (statOf(path.join(gamesDir, folder, '.egstore')) || taken.has(real(path.join(gamesDir, folder)))) continue; // (an Epic Games install)
    const progs = programsIn(dir, folder); if (!progs.length) continue;
    const chosen = progs.find(p => p.rel === programs[folder]) || progs[0];
    out.push({ id: idOf(folder, used), source: 'folder', title: folder, dir, exe: path.join(dir, chosen.rel), native: chosen.native, own: mine, programs: progs });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
module.exports = { scan, programsIn };
