// (T)rustyShelf's own menu music, the folder side (main/music.js). Run: node linux/ci/music-test.js
//   audio files in the Music folder are listed (sub-folders too, natural order), other files and dotfiles are not, audio
//   in the Songs folder counts as well, a file seen twice is listed once, and the list stops at the cap.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const paths = require(path.join(ROOT, 'main', 'paths.js')), music = require(path.join(ROOT, 'main', 'music.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsmusic-')); paths.setAppRoot(tmp);
const mk = p => { const f = path.join(tmp, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); return f; };
try {
  check('the Music folder is made when it isn\'t there, and an empty folder lists nothing', music.list().length === 0 && fs.existsSync(path.join(tmp, 'Music')));
  mk('Music/Track 10.mp3'); mk('Music/Track 2.mp3'); mk('Music/Album/01 First_Song.ogg'); mk('Music/Album/cover.jpg'); mk('Music/notes.txt'); mk('Music/.hidden.mp3');
  mk('Music/Loud.WAV'); mk('Music/a.flac'); mk('Music/b.m4a'); mk('Music/c.opus'); mk('Music/d.aac'); mk('Music/e.weba'); mk('Music/f.oga'); mk('Songs/Old Tune.mp3'); mk('Songs/theme.mid');
  const l = music.list(), names = l.map(t => t.name);
  check('every audio type is listed (mp3 ogg oga opus wav flac m4a aac weba), nothing else', ['Track 2', 'Track 10', '01 First Song', 'Loud', 'a', 'b', 'c', 'd', 'e', 'f', 'Old Tune'].every(n => names.includes(n)) && !names.some(n => /cover|notes|hidden|theme/.test(n)), JSON.stringify(names));
  check('the Music folder comes first, in natural order (Track 2 before Track 10); underscores become spaces', names.indexOf('Track 2') < names.indexOf('Track 10') && names.indexOf('Track 10') < names.indexOf('Old Tune') && names.includes('01 First Song'), JSON.stringify(names));
  check('each entry carries the file\'s full path', l.every(t => path.isAbsolute(t.file) && fs.existsSync(t.file)), JSON.stringify(l[0]));
  check('the same file isn\'t listed twice', new Set(l.map(t => t.file.toLowerCase())).size === l.length);
  for (let i = 0; i < 600; i++) mk(`Music/many/m${String(i).padStart(4, '0')}.mp3`);
  check(`the list stops at ${music.MAX_FILES} files`, music.list().length === music.MAX_FILES, music.list().length);
} catch (e) { check('the test ran to the end', false, e && e.stack); }
finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
