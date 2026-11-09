// Špajz's PC game storage (Settings → PC games → Storage): every installed PC game that has a folder, with its size,
// grouped by the drive it is on, with each drive's free space. Sizes are the ones already known (Steam's own, or the folder
// size measured in the background by main/dirsize.js); nothing is walked here. Kept free of Electron, so
// linux/ci/storage-test.js runs it on made-up folders.
// The idea of a storage screen (every game with its size, source and folder, per drive) comes from the Playnite "Storage"
// add-on (MIT) as the TyroShelf fork has it; this is written for Špajz's own games and settings.
'use strict';
const fs = require('fs');
const path = require('path');

// the mount point a folder is on: Windows, its drive; Linux, the longest mount in /proc/self/mounts that holds it
function mountOf(p, mountsText) {
  const raw = String(p || '');
  if (process.platform === 'win32' || /^[A-Za-z]:[\\/]/.test(raw)) { const w = path.win32.resolve(raw); return path.win32.parse(w).root || w; }
  const full = path.resolve(raw);
  let text = mountsText; if (text == null) { try { text = fs.readFileSync('/proc/self/mounts', 'utf8'); } catch { text = ''; } }
  let best = '/';
  for (const line of String(text).split('\n')) {
    const m = line.split(' '); if (m.length < 2) continue;
    const mp = m[1].replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\134/g, '\\');
    if ((full === mp || full.startsWith(mp.endsWith('/') ? mp : mp + '/')) && mp.length > best.length) best = mp;
  }
  return best;
}
async function space(p) { try { const s = await fs.promises.statfs(p); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return { free: null, total: null }; } }

// games: [{ id, title, source, dir, bytes }] → { drives: [{ root, free, total, gamesBytes, games: [...] }] } biggest drive use first, each
// drive's games biggest first; games with no folder (or a folder that isn't there) are left out
async function summary(games, { mountsText, statfs = space } = {}) {
  const by = new Map(), seen = new Set();
  for (const g of Array.isArray(games) ? games : []) {
    const dir = g && g.dir ? path.resolve(String(g.dir)) : ''; if (!dir || seen.has(dir.toLowerCase())) continue;
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    seen.add(dir.toLowerCase());
    const root = mountOf(dir, mountsText); if (!by.has(root)) by.set(root, { root, games: [], gamesBytes: 0 });
    const d = by.get(root), bytes = Math.max(0, +g.bytes || 0);
    d.games.push({ id: String(g.id || ''), title: String(g.title || path.basename(dir)).slice(0, 120), source: String(g.source || ''), dir, bytes }); d.gamesBytes += bytes;
  }
  const drives = [...by.values()];
  for (const d of drives) { Object.assign(d, await statfs(d.root)); d.games.sort((a, b) => b.bytes - a.bytes || a.title.localeCompare(b.title)); }
  drives.sort((a, b) => b.gamesBytes - a.gamesBytes || a.root.localeCompare(b.root));
  return { drives };
}

module.exports = { summary, mountOf };
