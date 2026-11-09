// How much room a game's folder takes (the PC games folder's games, Epic installs Epic doesn't size), for the size
// shown under a game's name and in Details. Measured in the background, never while the shelf waits: `du` where there
// is one (another process: the main thread never walks the files), else an asynchronous walk. Kept in
// data/dir-sizes.json, measured again when the folder changes (its own modification time) or after a week.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const WEEK = 7 * 24 * 3600e3;
let file = '', cache = {}, log = () => {}, onMeasured = () => {}, busy = false, saveT = null;
const queue = new Set();

function init(opts = {}) {
  file = path.join(opts.dataDir || '', 'dir-sizes.json');
  if (opts.log) log = opts.log;
  if (opts.onMeasured) onMeasured = opts.onMeasured;
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && typeof j === 'object') cache = j; } catch {}
}
const mtimeOf = d => { try { return Math.floor(fs.statSync(d).mtimeMs); } catch { return -1; } };

// the folder's size in bytes as last measured (0 when not yet); one that's missing or out of date is measured soon
function get(dir) {
  if (!dir || !path.isAbsolute(dir)) return 0;
  const c = cache[dir], m = mtimeOf(dir);
  if (m < 0) return 0;
  if (!c || c.mtime !== m || Date.now() - c.at > WEEK) { queue.add(dir); setImmediate(drain); }
  return c ? c.bytes : 0;
}

// `du` prints bytes with -b (GNU, Linux); BSD / macOS du counts kilobytes with -k
function viaDu(dir) {
  const gnu = process.platform === 'linux';
  return new Promise(res => execFile('du', [gnu ? '-sb' : '-sk', dir], { timeout: 10 * 60e3, maxBuffer: 1 << 20 }, (err, out) => {
    const n = parseInt(String(out || '').split(/\s/)[0], 10);
    res(Number.isFinite(n) ? (gnu ? n : n * 1024) : null); // (a file it couldn't read still gives the total of the rest)
  }));
}
async function viaWalk(dir) {
  let total = 0, seen = 0;
  const walk = async d => {
    let list; try { list = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) { try { total += (await fs.promises.stat(p)).size; } catch {} }
      if (++seen % 500 === 0) await new Promise(r => setImmediate(r)); // (let the shelf through between batches)
    }
  };
  await walk(dir);
  return total;
}

// one folder at a time; the shelf hears once a batch is done
async function drain() {
  if (busy || !queue.size) return;
  busy = true; let changed = 0;
  try {
    while (queue.size) {
      const dir = queue.values().next().value; queue.delete(dir);
      const m = mtimeOf(dir); if (m < 0) continue;
      const t0 = Date.now();
      const bytes = process.platform === 'win32' ? await viaWalk(dir) : (await viaDu(dir)) ?? await viaWalk(dir);
      const was = cache[dir] && cache[dir].bytes;
      cache[dir] = { bytes, mtime: m, at: Date.now() };
      if (bytes !== was) changed++;
      if (Date.now() - t0 > 2000) log('Game size measured:', path.basename(dir), Math.round(bytes / 1048576), 'MB in', Date.now() - t0, 'ms');
    }
  } finally {
    busy = false;
    clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(file + '.tmp', JSON.stringify(cache)); fs.renameSync(file + '.tmp', file); } catch (e) { log('Game sizes not kept', e.message); } }, 1000);
    if (changed) try { onMeasured(); } catch {}
  }
}
module.exports = { init, get };
