// (T)rustyShelf's Art match (its issue #2: a ROM hack named after its serial gets no art), the box art side (main/covers.js), on a
// made-up LaunchBox index: no network. Run: node linux/ci/artmatch-test.js
//   - the search lists a console's games whose names hold every word typed, the exact name first, with its pictures
//   - nothing typed, or a console the index hasn't, finds nothing; one game listed twice is listed once (the one with more art)
//   - with an art match picked, the game's box art candidates are the picked game's, though its own name matches nothing
//   - without one, nothing changes; the settings keep the match (tidied), and drop one that isn't text
'use strict';
const path = require('path');
// (covers.js asks Electron for its network module: a stand-in, nothing here goes online)
{ const Mod = require('module'), load0 = Mod._load; Mod._load = function (r, ...x) { return r === 'electron' ? { net: {} } : load0.call(this, r, ...x); }; }
const covers = require(path.join(__dirname, '..', '..', 'main', 'covers.js')), { norm } = require(path.join(__dirname, '..', '..', 'main', 'lbindex.js'));
const config = require(path.join(__dirname, '..', '..', 'main', 'config.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const plat = covers.LAUNCHBOX.ps2, g = (id, name) => ({ id, name, n: norm(name) });
const idx = { v: 9, at: Date.now(), games: { [plat]: [g(1, 'Dragon Ball Z: Budokai Tenkaichi 3'), g(2, 'Dragon Ball Z: Budokai Tenkaichi 2'), g(3, 'Dragon Ball Z: Budokai 3'), g(4, 'Tekken 5'), g(5, 'Dragon Ball Z: Budokai Tenkaichi 3')] },
  images: { 1: [{ type: 'Box - Front', file: 'DBZBT3-front.jpg', region: 'North America' }, { type: 'Box - Back', file: 'DBZBT3-back.jpg', region: 'North America' }, { type: 'Box - Spine', file: 'DBZBT3-spine.jpg', region: 'North America' }],
    2: [{ type: 'Box - Front', file: 'DBZBT2-front.jpg', region: 'North America' }], 3: [], 4: [{ type: 'Box - Front', file: 'T5.jpg', region: 'North America' }], 5: [] } };
covers._setIndex(idx);
(async () => {
  try {
    const r = await covers.artMatches('ps2', 'budokai tenkaichi', { libretro: false });
    check('the search lists the games whose names hold every word typed (not Budokai 3, not Tekken)', r.length === 2 && r.every(x => /Tenkaichi/.test(x.name)), JSON.stringify(r));
    check('one game listed twice is listed once, the one with the box art (its front as the thumbnail, its pictures counted)', r.filter(x => x.name === 'Dragon Ball Z: Budokai Tenkaichi 3').length === 1 && r.find(x => x.name === 'Dragon Ball Z: Budokai Tenkaichi 3').pictures === 3 && /images\.launchbox-app\.com\/DBZBT3-front\.jpg$/.test(r.find(x => x.name === 'Dragon Ball Z: Budokai Tenkaichi 3').thumb), JSON.stringify(r));
    const e = await covers.artMatches('ps2', 'Dragon Ball Z: Budokai Tenkaichi 3', { libretro: false });
    check('the exact name comes first', e[0] && e[0].name === 'Dragon Ball Z: Budokai Tenkaichi 3', JSON.stringify(e.map(x => x.name)));
    check('nothing typed finds nothing; a console the index hasn\'t, nothing', !(await covers.artMatches('ps2', '   ', { libretro: false })).length && !(await covers.artMatches('nes', 'tenkaichi', { libretro: false })).length);
    // the mod: its own name (from its serial and file name) matches nothing
    const mod = { id: 'ps2:/games/ps2/SLUS_219.78.DBZBT4B13REV5.iso', title: 'DBZBT4B13REV5', file: '/games/ps2/SLUS_219.78.DBZBT4B13REV5.iso' };
    const opts = { index: idx, libretro: false, tdb: false, wiki: false };
    covers.setArtName(() => '');
    const before = await covers.candidates('ps2', mod, 'front', opts);
    check('without an art match the mod gets no box art (its name is nobody\'s)', before.length === 0, JSON.stringify(before.map(c => c.url)));
    covers.setArtName(x => (x.id === mod.id ? 'Dragon Ball Z: Budokai Tenkaichi 3' : ''));
    const front = await covers.candidates('ps2', mod, 'front', opts), back = await covers.candidates('ps2', mod, 'back', opts), spine = await covers.candidates('ps2', mod, 'spine', opts);
    check('with the art match, the front, back and spine are the picked game\'s', front.some(c => /DBZBT3-front/.test(c.url)) && back.some(c => /DBZBT3-back/.test(c.url)) && spine.some(c => /DBZBT3-spine/.test(c.url)), JSON.stringify({ front: front.map(c => c.url), back: back.map(c => c.url) }));
    check('the art match is for that game only: another game keeps its own lookup', (await covers.candidates('ps2', { id: 'ps2:/games/ps2/Tekken 5.iso', title: 'Tekken 5', file: '/games/ps2/Tekken 5.iso' }, 'front', opts)).some(c => /T5\.jpg/.test(c.url)));
    check('artGame gives the picked name, and keeps the game\'s own for showing', covers.artGame(mod).title === 'Dragon Ball Z: Budokai Tenkaichi 3' && covers.artGame(mod).shownTitle === 'DBZBT4B13REV5' && covers.artGame({ id: 'x', title: 'Y' }).title === 'Y');
    covers.setArtName(null);
    // the settings file
    const c = config.normalize({ games: { [mod.id]: { artName: '  Dragon   Ball Z: Budokai Tenkaichi 3 ' }, 'ps2:/b.iso': { artName: 5 }, 'ps2:/c.iso': { artName: 'x'.repeat(300) } } }).games;
    check('the settings keep the art match, tidied; drop one that isn\'t text; cut a long one at 120', c[mod.id] && c[mod.id].artName === 'Dragon Ball Z: Budokai Tenkaichi 3' && !c['ps2:/b.iso'] && c['ps2:/c.iso'].artName.length === 120, JSON.stringify(c));
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
