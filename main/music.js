// Špajz: your own menu music. Audio files (mp3, ogg, oga, opus, wav, flac, m4a, aac, weba) in <Špajz folder>\Music\
// (sub-folders too); audio files in the Songs folder count as well, so ones dropped there are found. The shelf plays them,
// shuffled, as its menu music (Settings → Sound → Menu music → Your music). This side only lists the folders: each file is
// played by the page straight from disk, through the app's own file address (no file is copied or read here).
// The idea of playing your own files as menu music comes from the TyroShelf fork; this is written for Špajz's own code.
'use strict';
const path = require('path');
const fs = require('fs');
const { appRoot } = require('./paths');

const MAX_FILES = 500;
const EXT = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|weba)$/i;
const DIRS = ['Music', 'Songs'];
const folder = () => path.join(appRoot(), DIRS[0]);
const folders = () => DIRS.map(d => path.join(appRoot(), d));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// → [{ name, file }] (file: the full path), the Music folder first, each in natural order; at most MAX_FILES
function list() {
  const out = [], seen = new Set();
  try { fs.mkdirSync(folder(), { recursive: true }); } catch {}
  for (const root of folders()) {
    const walk = (dir, depth) => {
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      ents.sort((a, b) => natural(a.name, b.name));
      for (const e of ents) {
        if (out.length >= MAX_FILES || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (depth < 3) walk(full, depth + 1); }
        else if (EXT.test(e.name) && !seen.has(full.toLowerCase())) { seen.add(full.toLowerCase()); out.push({ name: e.name.replace(EXT, '').replace(/[_]+/g, ' ').trim(), file: full }); }
      }
    };
    walk(root, 0);
  }
  return out;
}

module.exports = { list, folder, folders, EXT, MAX_FILES };
