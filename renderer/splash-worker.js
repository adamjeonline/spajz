// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): this file is the same as Boxshelf's
// renderer/splash-worker.js apart from the app's name (Špajz).
// Špajz start-up logo, drawn in its own thread (an OffscreenCanvas in a worker).
// It is drawn still at first, while the shelf loads behind it (the first second of a launch keeps the whole PC busy),
// and the light only sweeps across once the shelf is ready ("play"), so nothing else is competing for those frames.
let ctx = null, cv = null, W = 0, H = 0, fs = 0, dpr = 1, family = 'sans-serif', L = null;
const WORD = 'Špajz';
const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3), inOut = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function layout() { ctx.font = `${family === 'SpajzLogo' ? '900 ' : '800 '}${fs}px ${family}`; const sp = fs * .015, ws = [...WORD].map(c => ctx.measureText(c).width); return { ws, sp, total: ws.reduce((a, b) => a + b, 0) + sp * (WORD.length - 1) }; }
// (the logo's colours: RUSTY in rust, (T) and SHELF in steel; a gradient fill, the light's sweep, covers every letter alike)
const STEEL = '#f4e7c9', RUST = '#e4503a', isRusty = i => i === 0; // (Špajz: Š in tomato red, PAJZ in cream)
function word(x0, y, fill) { let x = x0; [...WORD].forEach((c, i) => { ctx.fillStyle = fill || (isRusty(i) ? RUST : STEEL); ctx.fillText(c, x, y); x += L.ws[i] + L.sp; }); }
function draw(p) { // p: 0 = still, 0..1 = the sweep
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'middle'; ctx.font = `${family === 'SpajzLogo' ? '900 ' : '800 '}${fs}px ${family}`;
  const x0 = (W - L.total) / 2, y = H * .46; ctx.globalAlpha = 1; word(x0, y);
  if (p > 0 && p < 1) { const g = inOut(p), cx = x0 - L.total * .3 + g * L.total * 1.6, band = L.total * .16, gr = ctx.createLinearGradient(cx - band, 0, cx + band, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.shadowColor = 'rgba(170,186,255,.75)'; ctx.shadowBlur = 18; word(x0, y, gr); ctx.restore(); }
  const l = ease(p), lw = Math.min(200, W * .18) * (.25 + .75 * (p >= 1 ? 1 : l)), ly = y + fs * .78, lg = ctx.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
  lg.addColorStop(0, 'rgba(170,186,255,0)'); lg.addColorStop(.5, 'rgba(170,186,255,.75)'); lg.addColorStop(1, 'rgba(170,186,255,0)'); ctx.fillStyle = lg; ctx.fillRect(W / 2 - lw / 2, ly, lw, 2);
}
const DUR = 1000; let t0 = 0, last = 0, gaps = [];
function frame(now) { if (!t0) { t0 = now; last = now; } gaps.push(now - last); last = now; const p = (now - t0) / DUR; draw(Math.min(1, p));
  if (p < 1) requestAnimationFrame(frame); else { gaps.shift(); const s = gaps.slice().sort((a, b) => a - b); postMessage({ done: true, frames: gaps.length, avg: Math.round(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length) * 10) / 10, max: Math.round(s[s.length - 1] || 0), slow: gaps.filter(g => g > 25).length }); } }
onmessage = async e => {
  const d = e.data;
  if (d.play) { if (L) requestAnimationFrame(frame); else postMessage({ done: true, frames: 0 }); return; }
  cv = d.canvas; ctx = cv.getContext('2d'); W = d.w; H = d.h; fs = d.fs; dpr = d.dpr; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  try { const fl = [new FontFace('SpajzLogo', 'url(fonts/fraunces-spajz.woff2)', { weight: '900' })]; /* Fraunces, the logo's face */ await Promise.race([Promise.all(fl.map(f => f.load())).then(() => { fl.forEach(f => self.fonts.add(f)); family = 'SpajzLogo'; }), new Promise(r => setTimeout(r, 300))]); } catch (x) {}
  L = layout(); draw(0); requestAnimationFrame(() => postMessage({ ready: true })); // once this is on screen the page's own copy steps aside
};
