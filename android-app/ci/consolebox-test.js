// (T)rustyShelf's console box art for PC games (asked for in Boxshelf's discussions). Run: node ci/consolebox-test.js
//   - main/covers.js consoleBox: a PC game's title is looked up in the box art database's console platforms, newest first
//     (PS5, Xbox Series X|S, PS4, Xbox One, Switch); only a front scan counts; a title with none gives nothing
//   - renderer/img-tools.js rebrand: the console's band across the top is measured and painted over with a Steam band of
//     the same height (a white PS5 band, a green Xbox band, a red Switch band with a wide logo); the artwork stays
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };

(async () => {
  try {
    // ---- the lookup (Electron's net isn't used by it: a stand-in while covers.js loads) ----
    const Mod = require('module'), load0 = Mod._load; Mod._load = function (r, ...x) { return r === 'electron' ? { net: {} } : load0.call(this, r, ...x); };
    let covers; try { covers = require(path.join(ROOT, 'main', 'covers.js')); } finally { Mod._load = load0; }
    const g = (id, name) => ({ id, name, n: covers.norm(name) }), front = (file, region = 'North America') => ({ type: 'Box - Front', file, region });
    covers._setIndex({ games: { 'Sony Playstation 5': [g('1', "Baldur's Gate 3")], 'Microsoft Xbox Series X/S': [g('2', "Baldur's Gate 3"), g('4', 'Starfield')], 'Sony Playstation 4': [g('5', 'Hades')], 'Microsoft Xbox One': [], 'Nintendo Switch': [g('3', 'Hades'), g('6', 'Celeste')] },
      images: { 1: [front('ps5/bg3.jpg'), { type: 'Box - Back', file: 'ps5/bg3-back.jpg', region: 'North America' }, { type: 'Box - Spine', file: 'ps5/bg3-spine.jpg', region: 'North America' }], 2: [front('xsx/bg3.jpg')], 3: [front('sw/hades.jpg')], 4: [{ type: 'Box - Back', file: 'xsx/sf-back.jpg' }], 5: [front('ps4/hades.jpg')], 6: [front('sw/celeste.jpg')] } });
    const bg3 = covers.consoleBox("Baldur's Gate 3", ''), hades = covers.consoleBox('Hades', ''), celeste = covers.consoleBox('Celeste', '');
    check('Console box: the newest release first (Baldur\'s Gate 3: PS5, before Xbox Series X|S)', bg3 && bg3.plat === 'ps5' && /ps5\/bg3\.jpg$/.test(bg3.url) && /^https:\/\/images\.launchbox-app\.com\//.test(bg3.url), JSON.stringify(bg3));
    check('Console box: the release\'s back and spine come with it when scanned (none when not)', /bg3-back\.jpg$/.test(bg3.back) && /bg3-spine\.jpg$/.test(bg3.spine) && hades && !hades.back && !hades.spine, JSON.stringify({ bg3, hades }));
    check('Console box: PS4 comes before Switch (Hades), and a Switch-only game gets its Switch box (Celeste)', hades && hades.plat === 'ps4' && celeste && celeste.plat === 'sw', JSON.stringify({ hades, celeste }));
    check('Console box: a release with no front scan, or no console release at all, gives nothing', covers.consoleBox('Starfield', '') === null && covers.consoleBox('Portal 2', '') === null && covers.consoleBox('', '') === null);
    check('Console box: the platforms are kept in the box art database too', ['Microsoft Xbox Series X/S', 'Microsoft Xbox One', 'Sony Playstation 5'].every(p => covers.PC_BOX_PLATS.some(x => x[1] === p)), JSON.stringify(covers.PC_BOX_PLATS));
    covers._setIndex(null);

    // ---- the rebrand, in a browser (the hidden helper window's own script) ----
    const { chromium } = require('playwright');
    const SRC = fs.readFileSync(path.join(ROOT, 'renderer', 'img-tools.js'), 'utf8');
    const b = await chromium.launch(); const page = await b.newPage(); await page.setContent('<body></body>');
    await page.evaluate(src => { window.wum = { onModel(f) { window.__job = f; }, done(err, out) { window.__out = { err, out }; } }; (0, eval)(src); }, SRC);
    const res = await page.evaluate(async () => {
      const make = (w, h, band, frac, logo, word) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d23c3c'); gr.addColorStop(.5, '#3c8cd2'); gr.addColorStop(1, '#2d9b46'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 37},70%,${30 + i % 40}%)`; x.fillRect((i * 97) % w, h * .2 + (i * 53) % (h * .7), 60, 40); }
        const bh = Math.round(h * frac); x.fillStyle = band; x.fillRect(0, 0, w, bh); x.fillStyle = logo; x.font = `bold ${bh * .55}px sans-serif`; x.textBaseline = 'middle'; x.fillText(word, bh * .4, bh / 2);
        return new Promise(r => c.toBlob(bl => bl.arrayBuffer().then(a => r({ data: new Uint8Array(a), bh })), 'image/png')); };
      const out = [];
      for (const [plat, band, frac, logo, word] of [['ps5', '#f4f5f7', .105, '#111', 'PS5'], ['xsx', '#107c10', .12, '#fff', 'XBOX SERIES X'], ['sw', '#e60012', .1, '#fff', 'NINTENDO SWITCH']]) {
        const { data, bh } = await make(600, 760, band, frac, logo, word); window.__out = null; await window.__job({ mode: 'rebrand', data, plat });
        const o = window.__out; if (!o || o.err) { out.push({ plat, err: o && o.err }); continue; }
        const im = new Image(); im.src = o.out[0]; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const px = (X, Y) => [...x.getImageData(X, Y, 1, 1).data].slice(0, 3);
        let end = 0; for (let y = 0; y < im.height * .25; y++) { const p = px(5, y); if (p[0] + p[1] + p[2] < 150 || (p[2] > 200 && p[1] > 150 && p[0] < 140)) end = y + 1; else if (end) break; } // (dark Steam blue, then its light-blue edge)
        out.push({ plat, bandWas: bh, steamBand: end, size: [im.width, im.height], below: px(300, bh + 30) }); }
      return out; });
    // a spine (a red band with the console's name running down it, then a white spine with the title) and a back with no band
    const more = await page.evaluate(async () => {
      const shot = async (c, plat, part) => { const data = await new Promise(r => c.toBlob(bl => bl.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png')); window.__out = null; await window.__job({ mode: 'rebrand', plat, part, data });
        const im = new Image(); im.src = window.__out.out[0]; await im.decode(); const k = document.createElement('canvas'); k.width = im.width; k.height = im.height; const x = k.getContext('2d'); x.drawImage(im, 0, 0); return x; };
      const sp = document.createElement('canvas'); sp.width = 60; sp.height = 760; let x = sp.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 60, 760); x.fillStyle = '#e60012'; x.fillRect(0, 0, 60, 99);
      x.save(); x.translate(30, 8); x.rotate(Math.PI / 2); x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.textBaseline = 'middle'; x.fillText('SWITCH', 0, 0); x.restore();
      x.save(); x.translate(30, 160); x.rotate(Math.PI / 2); x.fillStyle = '#222'; x.font = 'bold 26px sans-serif'; x.textBaseline = 'middle'; x.fillText('Some Game Title', 0, 0); x.restore();
      const s2 = await shot(sp, 'sw', 'spine'), dark = y => { const p = s2.getImageData(3, y, 1, 1).data; return p[0] + p[1] + p[2] < 200; }, red = y => { const p = s2.getImageData(2, y, 1, 1).data; return p[0] > 180 && p[1] < 80; };
      let redLeft = 0; for (let y = 0; y < 110; y++) if (red(y)) redLeft++;
      const bk = document.createElement('canvas'); bk.width = 600; bk.height = 760; x = bk.getContext('2d'); const gr = x.createLinearGradient(0, 0, 600, 0); gr.addColorStop(0, '#3a7bd5'); gr.addColorStop(1, '#00d2a0'); x.fillStyle = gr; x.fillRect(0, 0, 600, 760);
      for (let i = 0; i < 30; i++) { x.fillStyle = `hsl(${i * 47},60%,50%)`; x.fillRect((i * 83) % 600, (i * 41) % 700, 50, 30); }
      const b2 = await shot(bk, 'ps5', 'back'), top = b2.getImageData(300, 20, 1, 1).data;
      return { spineDarkTop: dark(40), redLeft, backTop: [...top].slice(0, 3) }; });
    check('Rebrand (spine): the red band with the console\'s name becomes a Steam band (no red left at the top)', more.spineDarkTop && more.redLeft <= 3, JSON.stringify(more));
    check('Rebrand (back): a back with no band of its own is kept as it is (no Steam band painted over its artwork)', !(more.backTop[0] + more.backTop[1] + more.backTop[2] < 150), JSON.stringify(more));
    for (const r of res) check(`Rebrand (${r.plat}): the console band (${r.bandWas} px) becomes a Steam band of the same height; the picture keeps its size`,
      !r.err && Math.abs(r.steamBand - r.bandWas) <= 3 && r.size[0] === 600 && r.size[1] === 760, JSON.stringify(r));
    await b.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
