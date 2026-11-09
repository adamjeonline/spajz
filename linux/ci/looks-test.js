// (T)rustyShelf's saved looks (Settings → Display → Looks) as the settings file keeps them (main/config.js). Run: node linux/ci/looks-test.js
//   - a look keeps its name (tidied, at most 40 characters) and plain values only; anything else is dropped
//   - at most 20 looks; a missing or wrong `looks` is an empty list; the order is kept
//   - a settings file that passes through twice (saved and read again) comes out the same
'use strict';
const path = require('path');
const config = require(path.join(__dirname, '..', '..', 'main', 'config.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const looksOf = ui => config.normalize({ ui }).ui.looks;

let l = looksOf({ looks: [{ name: '  Couch   night ', set: { theme: 'oled', uiScale: 1.15, clock24: true, music: 'own', bad: { x: 1 }, 'x y': 1, arr: [1] } }, { name: '', set: {} }, { name: 5 }, null, 'x'] });
check('a look keeps its tidied name and its plain values', l.length === 2 && l[0].name === 'Couch night' && JSON.stringify(l[0].set) === JSON.stringify({ theme: 'oled', uiScale: 1.15, clock24: true, music: 'own' }), JSON.stringify(l));
check('a look with no name is called Look; objects, lists and odd key names are left out', l[1].name === 'Look' && JSON.stringify(l[1].set) === '{}' && !('bad' in l[0].set) && !('arr' in l[0].set) && !('x y' in l[0].set), JSON.stringify(l));
check('a name is cut at 40 characters', looksOf({ looks: [{ name: 'x'.repeat(100), set: {} }] })[0].name.length === 40);
check('a value that is too long is left out', !('theme' in looksOf({ looks: [{ name: 'a', set: { theme: 'x'.repeat(200) } }] })[0].set));
check('at most 20 looks are kept, in order', (() => { const r = looksOf({ looks: Array.from({ length: 30 }, (_, i) => ({ name: 'L' + i, set: {} })) }); return r.length === 20 && r[0].name === 'L0' && r[19].name === 'L19'; })());
check('no looks, or a wrong value, is an empty list', JSON.stringify(looksOf({})) === '[]' && JSON.stringify(looksOf({ looks: 'x' })) === '[]' && JSON.stringify(looksOf({ looks: { a: 1 } })) === '[]');
const once = config.normalize({ ui: { looks: [{ name: 'A', set: { theme: 'forest', sort: 'year', filter: 'dec:1990' } }] } });
check('passing through twice changes nothing', JSON.stringify(config.normalize(JSON.parse(JSON.stringify(once))).ui.looks) === JSON.stringify(once.ui.looks));
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
