// Špajz's Epic download manager: a queue of `legendary install` runs, one at a time. Each item shows how far it is, its
// speed and the time left; it can be paused (the process is stopped: legendary keeps what it downloaded and goes on from there
// when it's resumed), stopped, moved up the queue or removed. The queue is kept in data/epic-downloads.json, so a restart finds
// it as it was (an install that was running comes back paused).
// The idea of a queue with pause / resume / stop comes from Playnite's Unified Download Manager add-on (MIT) and the TyroShelf
// fork's download manager; this is written for Špajz's own legendary code (main/linuxpc.js), and knows nothing of
// Electron: legendary is run through what linuxpc.js hands in, so linux/ci/epicdl-test.js runs it with a pretend legendary.
'use strict';
const fs = require('fs');
const path = require('path');

const STATES = ['queued', 'installing', 'paused', 'done', 'failed', 'cancelled'];
const LIVE = new Set(['queued', 'installing', 'paused']);

// o: { file, bin() → legendary's program or null, run(bin, args, { onLine }) → a promise of { code, err } with .proc, appRe,
//      noteUnfinished(dirs, appName, finished), onChange(list, job), onSettled(item), log }
function create(o) {
  const log = o.log || (() => {}), appRe = o.appRe || /^[\w.-]{1,120}$/;
  let items = [], seq = 0, cur = null, last = null, notify = o.onChange || (() => {}), saveT = null;

  const view = i => ({ id: i.id, appName: i.appName, title: i.title, pct: i.pct, speed: i.speed, eta: i.eta, state: i.status, error: i.error, update: !!i.update, baseDir: i.baseDir, added: i.added });
  const list = () => items.map(view);
  // what the older single-install UI asks for: the install that's running, else the one that last changed
  const job = () => { const i = cur || (last && !last.removed ? last : null); return i ? view(i) : null; };
  function save() { // at most once a second (progress arrives many times a second: a debounce would never get to write during an install)
    if (saveT) return; saveT = setTimeout(() => {
      saveT = null; try { fs.mkdirSync(path.dirname(o.file), { recursive: true }); const d = JSON.stringify(items.map(i => ({ id: i.id, appName: i.appName, title: i.title, baseDir: i.baseDir, update: !!i.update, status: i.status, pct: i.pct, error: i.error, added: i.added })));
        fs.writeFileSync(o.file + '.tmp', d); fs.renameSync(o.file + '.tmp', o.file); } catch (e) { log('Epic downloads not kept', e.message); }
    }, 300); if (saveT.unref) saveT.unref();
  }
  const change = i => { if (i && !i.removed) last = i; save(); try { notify(list(), job()); } catch {} };
  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(o.file, 'utf8')); if (!Array.isArray(j)) return;
      items = j.filter(i => i && appRe.test(String(i.appName))).slice(-200).map(i => ({ id: +i.id || ++seq, appName: String(i.appName), title: String(i.title || i.appName).slice(0, 120), baseDir: String(i.baseDir || ''), update: !!i.update,
        status: STATES.includes(i.status) ? (i.status === 'installing' ? 'paused' : i.status) : 'failed', pct: Math.max(0, Math.min(100, +i.pct || 0)), speed: '', eta: '', error: String(i.error || '').slice(0, 200), added: +i.added || 0 }));
      seq = items.reduce((m, i) => Math.max(m, i.id), 0);
    } catch { /* none yet */ }
  }
  const find = id => items.find(i => i.id === +id);
  const kill = i => { const p = i && i.proc; if (p) { try { p.kill('SIGTERM'); } catch {} } };

  function pump() {
    if (cur) return;
    const it = items.find(i => i.status === 'queued'); if (it) begin(it);
  }
  function begin(it) {
    const bin = o.bin();
    if (!bin) { it.status = 'failed'; it.error = 'legendary not found: Settings → PC games → Get legendary.'; change(it); return pump(); }
    const update = it.update, baseDir = it.baseDir;
    if (!update) try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) { it.status = 'failed'; it.error = `Can't use ${baseDir} for games: ${e.message}`.slice(0, 200); change(it); return pump(); }
    // (the folders that appear in baseDir while it installs are this game's: left off the PC games folder's games until it's done)
    const listDir = () => { try { return fs.readdirSync(baseDir); } catch { return []; } }, before = new Set(update ? [] : listDir());
    const newDirs = () => update ? [] : listDir().filter(n => !before.has(n)).map(n => path.join(baseDir, n));
    it.status = 'installing'; it.error = ''; it.speed = ''; it.eta = ''; it.newDirs = newDirs; cur = it;
    log(update ? 'Epic: updating' : 'Epic: installing', it.appName, update ? '' : 'into ' + baseDir);
    const onLine = l => {
      let m = /Progress:\s*([\d.]+)%.*?ETA:\s*([\d:]+)/.exec(l); if (m) { it.pct = Math.min(100, +m[1]); it.eta = m[2]; change(it); return; }
      m = /\+ Download\s*-\s*([\d.]+ \w+\/s)/.exec(l); if (m) it.speed = m[1];
    };
    const p = o.run(bin, update ? ['install', it.appName, '--update-only', '--skip-dlcs', '--skip-sdl', '-y'] : ['install', it.appName, '--base-path', baseDir, '--platform', 'Windows', '--skip-dlcs', '--skip-sdl', '-y'], { onLine });
    it.proc = p.proc; change(it);
    p.then(r => {
      const was = it.status; // 'installing', or 'paused' / 'cancelled' when it was stopped from here
      it.proc = null; if (cur === it) cur = null;
      const finished = was === 'installing' && r.code === 0;
      try { o.noteUnfinished(newDirs(), it.appName, finished); } catch {}
      if (was === 'installing') {
        if (r.code === 0) { it.status = 'done'; it.pct = 100; log('Epic: installed', it.appName); }
        else { it.status = 'failed'; const e = ((r.err || '').match(/ERROR: (.+)/g) || []).pop(); it.error = e ? e.replace(/^ERROR: /, '').slice(0, 200) : 'The install stopped.'; log('Epic install failed', it.appName, it.error); }
      }
      it.speed = ''; it.eta = ''; delete it.newDirs;
      change(it); try { if (o.onSettled) o.onSettled(view(it)); } catch {}
      pump();
    });
  }

  // a game to install (or update): at the end of the queue; one already waiting or running isn't added twice, a paused one goes on
  function add({ appName, title, baseDir, update = false }) {
    appName = String(appName || ''); if (!appRe.test(appName)) throw new Error('Unknown Epic game.');
    const live = items.find(i => i.appName === appName && LIVE.has(i.status));
    if (live) { if (live.status === 'paused') resume(live.id); return view(live); }
    items = items.filter(i => i.appName !== appName); // (an earlier finished or failed try is replaced)
    const it = { id: ++seq, appName, title: String(title || appName).slice(0, 120), baseDir: String(baseDir || ''), update: !!update, status: 'queued', pct: 0, speed: '', eta: '', error: '', added: Date.now() };
    items.push(it); change(it); pump(); return view(it);
  }
  function pause(id) {
    const it = find(id); if (!it) return false;
    if (it.status === 'installing') { it.status = 'paused'; kill(it); log('Epic: paused', it.appName); change(it); return true; } // (its handler frees the slot and starts the next one)
    if (it.status === 'queued') { it.status = 'paused'; change(it); return true; }
    return false;
  }
  function resume(id) {
    const it = find(id); if (!it || !['paused', 'failed', 'cancelled'].includes(it.status)) return false;
    it.status = 'queued'; it.error = ''; change(it); pump(); return true;
  }
  function stop(id) { // like Cancel: it stays in the list, and can be resumed (legendary goes on from where it stopped)
    const it = find(id); if (!it || !LIVE.has(it.status)) return false;
    const was = it.status; it.status = 'cancelled'; if (was === 'installing') { kill(it); log('Epic: install cancelled', it.appName); } change(it); return true;
  }
  function remove(id) {
    const it = find(id); if (!it) return false;
    if (it.status === 'installing') { it.removed = true; it.status = 'cancelled'; kill(it); }
    items = items.filter(i => i !== it); if (last === it) last = null; change(null); return true;
  }
  function move(id, delta) { // among the ones that haven't started: up (-1) or down (+1)
    const it = find(id); if (!it || it.status === 'installing' || it.status === 'done') return false;
    const idx = items.indexOf(it), step = delta < 0 ? -1 : 1; let j = idx + step;
    while (items[j] && (items[j].status === 'installing' || items[j].status === 'done')) j += step; // (not over a running or finished one)
    if (!items[j]) return false; [items[idx], items[j]] = [items[j], items[idx]]; change(null); return true;
  }
  function clearDone() { const n = items.length; items = items.filter(i => LIVE.has(i.status)); if (items.length !== n) change(null); return n - items.length; }

  load(); if (items.some(i => i.status === 'paused')) save();
  return { add, pause, resume, stop, remove, move, clearDone, list, job, current: () => (cur ? view(cur) : null), setNotify: fn => { notify = typeof fn === 'function' ? fn : () => {}; },
    cancelCurrent: () => (cur ? stop(cur.id) : false), unfinishedDirs: () => (cur && cur.newDirs ? cur.newDirs() : []), pump };
}

module.exports = { create, STATES };
