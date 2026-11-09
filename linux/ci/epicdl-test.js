// (T)rustyShelf's Epic download manager (main/epicdl.js), run against a pretend legendary that installs slowly and prints legendary's
// progress lines. Run: node linux/ci/epicdl-test.js
//   - installs run one at a time, in order; progress, speed and time left come through
//   - Pause stops the running install (its process ends) and the next one starts; Resume puts it back in the queue; it goes on
//   - Stop (Cancel) leaves an item that can be resumed; Remove drops it (and stops it if it is running)
//   - a failing install says why; a game asked for twice isn't added twice; Move puts one ahead of another
//   - the list is kept: a new manager finds it, an install that was running comes back paused
// Nothing here touches the network or a real Epic account.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const epicdl = require(path.join(ROOT, 'main', 'epicdl.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (f()) return true; } catch {} await sleep(40); } return false; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsdl-'));
const fake = path.join(tmp, 'legendary');
fs.writeFileSync(fake, `#!/bin/sh
cmd=$1; app=$2
if [ "$cmd" = install ]; then
  base=""; prev=""; for a in "$@"; do [ "$prev" = "--base-path" ] && base="$a"; prev="$a"; done
  [ -n "$base" ] && mkdir -p "$base/$app-folder"
  echo "$app $*" >> "${tmp}/runs.txt"
  if [ "$app" = FailApp ]; then echo "ERROR: boom, no space left" >&2; exit 1; fi
  i=1; while [ $i -le 10 ]; do echo "[DLManager] INFO: = Progress: $((i*10)).00% (1/2), Running for 00:00:0$i, ETA: 00:00:0$((10-i))"; echo " + Download	- 5.00 MiB/s (raw) / 4.00 MiB/s (decompressed)"; sleep 0.2; i=$((i+1)); done
  exit 0
fi
exit 0
`, { mode: 0o755 });
const run = (bin, args, { onLine } = {}) => { // (as main/linuxpc.js runLegendary: a promise of { code, err }, with the child on .proc)
  let proc = null; const pr = new Promise(res => { let err = ''; const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }); proc = p; let b = '';
    p.stdout.on('data', c => { b += c.toString(); const parts = b.split(/\r?\n|\r/); b = parts.pop(); for (const l of parts) onLine && onLine(l); });
    p.stderr.on('data', c => { err += c.toString(); }); p.on('close', code => res({ code, err })); p.on('error', e => res({ code: -1, err: e.message })); }); pr.proc = proc; return pr; };
const unfinished = []; const events = [];
const make = (file = path.join(tmp, 'downloads.json')) => epicdl.create({ file, bin: () => fake, run, appRe: /^[\w.-]{1,120}$/, noteUnfinished: (d, a, f) => unfinished.push([a, f]), onChange: (l, j) => events.push({ l, j }), onSettled: () => {}, log: () => {} });
const st = (m, app) => { const i = m.list().find(x => x.appName === app); return i ? i.state : null; };
const base = path.join(tmp, 'games');

(async () => {
  try {
    const m = make();
    const a = m.add({ appName: 'AppA', title: 'Game A', baseDir: base }), b = m.add({ appName: 'AppB', title: 'Game B', baseDir: base }), c = m.add({ appName: 'AppC', title: 'Game C', baseDir: base });
    check('the first install starts at once, the others wait in order (one at a time)', st(m, 'AppA') === 'installing' && st(m, 'AppB') === 'queued' && st(m, 'AppC') === 'queued' && m.list().filter(i => i.state === 'installing').length === 1, JSON.stringify(m.list().map(i => i.appName + ':' + i.state)));
    check('adding the same game again changes nothing (no second entry)', m.add({ appName: 'AppB', title: 'Game B', baseDir: base }).id === b.id && m.list().length === 3);
    check('legendary is asked for the game, into its folder, for Windows, with the answers given up front', await until(() => fs.existsSync(path.join(tmp, 'runs.txt')) && /AppA install AppA --base-path .*games --platform Windows --skip-dlcs --skip-sdl -y/.test(fs.readFileSync(path.join(tmp, 'runs.txt'), 'utf8'))), fs.existsSync(path.join(tmp, 'runs.txt')) && fs.readFileSync(path.join(tmp, 'runs.txt'), 'utf8'));
    check('progress, speed and time left come through while it runs', await until(() => { const i = m.list().find(x => x.appName === 'AppA'); return i && i.pct >= 20 && i.pct < 100 && i.eta; }), JSON.stringify(m.list()[0]));
    check('the install that is running is also what the older single-install call sees', m.job() && m.job().appName === 'AppA' && m.job().state === 'installing', JSON.stringify(m.job()));
    // pause the running one: it stops, the next starts
    const pidBefore = a.id; m.pause(a.id);
    check('Pause stops the running install: it is paused, with its progress kept', st(m, 'AppA') === 'paused' && m.list()[0].pct > 0, JSON.stringify(m.list()[0]));
    check('…and the next one in the queue starts by itself', await until(() => st(m, 'AppB') === 'installing'), JSON.stringify(m.list().map(i => i.appName + ':' + i.state)));
    check('the paused install\'s folder is noted as not finished (legendary goes on from there)', unfinished.some(([app, fin]) => app === 'AppA' && fin === false), JSON.stringify(unfinished));
    // resume it: back in the queue, runs after the others
    m.resume(pidBefore);
    check('Resume puts it back in the queue, at its place (the one running goes on)', st(m, 'AppA') === 'queued' && st(m, 'AppB') === 'installing', JSON.stringify(m.list().map(i => i.appName + ':' + i.state)));
    check('every install finishes, in turn', await until(() => ['AppA', 'AppB', 'AppC'].every(x => st(m, x) === 'done'), 40000), JSON.stringify(m.list().map(i => i.appName + ':' + i.state + ':' + i.pct)));
    const order = fs.readFileSync(path.join(tmp, 'runs.txt'), 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')[0]);
    check('they ran in that order: A, B (A paused), A again (its place in the queue is before C), then C', JSON.stringify(order) === JSON.stringify(['AppA', 'AppB', 'AppA', 'AppC']), JSON.stringify(order));
    check('a finished install is noted as finished', unfinished.some(([app, fin]) => app === 'AppC' && fin === true));
    // failure
    m.add({ appName: 'FailApp', title: 'Fail Game', baseDir: base });
    check('a failing install says why (legendary\'s own message)', await until(() => st(m, 'FailApp') === 'failed') && /boom, no space left/.test(m.list().find(x => x.appName === 'FailApp').error), JSON.stringify(m.list().find(x => x.appName === 'FailApp')));
    check('a failed install can be put back in the queue', m.resume(m.list().find(x => x.appName === 'FailApp').id) === true && ['queued', 'installing'].includes(st(m, 'FailApp')));
    await until(() => st(m, 'FailApp') === 'failed');
    // order: D runs, E and F wait; F moved up goes before E
    m.clearDone(); m.add({ appName: 'AppD', title: 'D', baseDir: base }); const e = m.add({ appName: 'AppE', title: 'E', baseDir: base }), f = m.add({ appName: 'AppF', title: 'F', baseDir: base });
    check('Move puts a waiting game ahead of another', m.move(f.id, -1) === true && m.list().map(i => i.appName).join() === 'AppD,AppF,AppE', m.list().map(i => i.appName).join());
    check('a running install can\'t be moved', m.move(m.list()[0].id, 1) === false);
    // stop a waiting one, then resume it
    check('Stop on a waiting game leaves it stopped, in the list', m.stop(e.id) === true && st(m, 'AppE') === 'cancelled');
    check('…and Resume brings it back', m.resume(e.id) === true && st(m, 'AppE') === 'queued');
    // remove the running one
    const runningId = m.current().id; m.remove(runningId);
    check('Remove on the running install stops it and drops it; the next starts', !m.list().some(i => i.id === runningId) && await until(() => ['AppF', 'AppE'].some(x => st(m, x) === 'installing')), JSON.stringify(m.list().map(i => i.appName + ':' + i.state)));
    // persistence: a new manager on the same file finds the list; the running one comes back paused
    await sleep(1500); const running = m.current(); const file = path.join(tmp, 'downloads.json');
    const m2 = make(file);
    check('the list is kept: a new manager finds the games, and an install that was running is paused', m2.list().length === m.list().length && (!running || m2.list().find(x => x.appName === running.appName).state === 'paused'), JSON.stringify({ was: m.list().map(i => i.appName + ':' + i.state), now: m2.list().map(i => i.appName + ':' + i.state) }));
    check('Clear finished takes the finished and failed ones off, not the waiting', (() => { const n = m.clearDone(); return m.list().every(i => ['queued', 'installing', 'paused'].includes(i.state)) && n >= 0; })());
    check('a bad game name is refused', (() => { try { m.add({ appName: 'bad name; rm -rf', title: 'x', baseDir: base }); return false; } catch (err) { return /Unknown Epic game/.test(err.message); } })());
    for (const i of m.list()) m.remove(i.id); await sleep(400);
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
