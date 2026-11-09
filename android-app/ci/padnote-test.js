// (T)rustyShelf: Settings → Controller says what to do when a PlayStation pad does nothing while Steam is open (Steam Input takes
// it), asked on Boxshelf's issue 1. On the demo page. Run (after node copy-web.js): node ci/padnote-test.js www ../out/padnote
//   - Windows: the row is there, its card explains it, How says the short version
//   - Android: no such row (no Steam there)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const WWW = path.resolve(process.argv[2] || 'www'), OUT = path.resolve(process.argv[3] || '../out/padnote');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(WWW, u === '/' ? 'index.html' : u);
  if (!p.startsWith(WWW)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
const look = async page => page.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms));
  Setup.open({ page: 'pad' }); for (let i = 0; i < 40 && !document.querySelector('#bss .bss-row'); i++) await w(150); await w(900);
  const row = [...document.querySelectorAll('#bss .bss-row')].find(r => ((r.querySelector('.nm') || {}).textContent || '') === 'PlayStation pad does nothing?');
  const out = { row: !!row };
  if (row) { row.click(); await w(700); out.card = (document.querySelector('#bss .bss-info') || {}).textContent || ''; // (the row picked: its card shows what it says)
    out.toast = [...document.querySelectorAll('#bss .bss-toast, #toast, .bss-toast')].map(x => x.textContent).join(' | '); }
  if (window.Settings && Settings.isOpen && Settings.isOpen()) { await Settings.close(); await w(700); }
  return out; });
server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const base = `http://localhost:${server.address().port}/index.html`;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?platform=windows&shelf=1'); await page.waitForTimeout(5000);
    const a = await look(page);
    check('Windows: Settings → Controller has "PlayStation pad does nothing?"', a.row, JSON.stringify(a));
    check('…its card explains Steam Input and where to turn it off', /Steam Input/.test(a.card) && /Settings → Controller/.test(a.card), a.card);
    check('…and How says the short version', /turn off Steam Input for PlayStation controllers/.test(a.toast), a.toast);
    await page.screenshot({ path: path.join(OUT, 'padnote.png') });
    check('No script errors (Windows)', !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } }), p2 = await ctx2.newPage(), errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(base + '?platform=android&shelf=1'); await p2.waitForTimeout(5000);
    const b = await look(p2);
    check('Android: no such row (no Steam there)', !b.row, JSON.stringify(b));
    check('No script errors (Android)', !errs2.length, errs2.slice(0, 3).join(' | '));
    await ctx2.close();
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  await browser.close(); server.close();
  console.log(fails ? fails + ' check(s) failed' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
