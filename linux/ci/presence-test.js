// (T)rustyShelf's Discord Rich Presence (main/presence.js): against a fake Discord socket on this machine (a made-up
// XDG_RUNTIME_DIR). Run: node linux/ci/presence-test.js
//   - on, with an id: the handshake (v 1, the id) is sent, then "Playing <title>" with the shelf's name and a start time
//   - a game closing clears it (activity null)
//   - off, or no id: nothing is sent at all
'use strict';
if (process.platform === 'win32') { console.log('skipped on Windows (the pipe test is for Linux)'); process.exit(0); }
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tspresence-')); process.env.XDG_RUNTIME_DIR = dir;
const presence = require(path.join(__dirname, '..', '..', 'main', 'presence.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 400))); if (!ok) fails++; };
const got = []; let sockets = 0;
function parse(buf, out) { while (buf.length >= 8) { const len = buf.readInt32LE(4); if (buf.length < 8 + len) break; out.push({ op: buf.readInt32LE(0), msg: JSON.parse(buf.slice(8, 8 + len).toString()) }); buf = buf.slice(8 + len); } return buf; }
const fake = net.createServer(s => { sockets++; let buf = Buffer.alloc(0); s.on('data', d => { buf = Buffer.concat([buf, d]); const frames = []; buf = parse(buf, frames);
  for (const f of frames) { got.push(f); if (f.op === 0) { const body = Buffer.from(JSON.stringify({ evt: 'READY', cmd: 'DISPATCH', data: { v: 1 } })); const h = Buffer.alloc(8); h.writeInt32LE(1, 0); h.writeInt32LE(body.length, 4); s.write(Buffer.concat([h, body])); } } }); s.on('error', () => {}); });
const sockPath = path.join(dir, 'discord-ipc-0');
fake.listen(sockPath, async () => {
  try {
    presence.configure({ enabled: true, appId: '123456789012345678' });
    presence.setGame('Super Mario Sunshine', 'GameCube');
    await new Promise(r => setTimeout(r, 900));
    const hs = got.find(f => f.op === 0), act = got.filter(f => f.msg && f.msg.cmd === 'SET_ACTIVITY').pop();
    check('the handshake carries the application id (v 1)', !!hs && hs.msg.v === 1 && hs.msg.client_id === '123456789012345678', JSON.stringify(hs));
    check('"Playing <title>" with the shelf\'s name and a start time', !!act && act.msg.args.activity.details === 'Playing Super Mario Sunshine' && act.msg.args.activity.state === 'GameCube' && typeof act.msg.args.activity.timestamps.start === 'number', JSON.stringify(act));
    presence.clear(); await new Promise(r => setTimeout(r, 400));
    const last = got.filter(f => f.msg && f.msg.cmd === 'SET_ACTIVITY').pop();
    check('a game closing clears it (activity null)', last && last.msg.args.activity === null, JSON.stringify(last));
    const playing = () => got.filter(f => f.msg && f.msg.args && f.msg.args.activity && /^Playing/.test(f.msg.args.activity.details || '')).length;
    presence.configure({ enabled: false, appId: '123456789012345678' }); await new Promise(r => setTimeout(r, 300)); const n = playing();
    presence.setGame('Nothing', 'x'); await new Promise(r => setTimeout(r, 400));
    check('switched off: no "Playing" is sent (the clear that switching off sends is fine)', playing() === n, playing() - n);
    presence.configure({ enabled: true, appId: '' }); presence.setGame('Nothing', 'x'); await new Promise(r => setTimeout(r, 400));
    check('on but no application id: no "Playing" is sent', playing() === n, playing() - n);
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  presence.configure({ enabled: false }); fake.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
});
