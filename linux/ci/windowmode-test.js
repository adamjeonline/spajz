// (T)rustyShelf's per-game window mode (main/windowmode.js). Run: node linux/ci/windowmode-test.js
//   - a saved config keeps a game's window mode ('borderless' / 'windowed') beside its emulator and name, and drops anything else
//   - the mode of a game is read from the config; only the games the shelf starts itself take one
//   - the PowerShell command is one safe line: the Windows helper's source has no single quote, the command quotes the game's
//     folder, and it is the helper's Run(<pid>, <folder>, <seconds>)
//   - the helper's C# compiles with a C# 5 compiler (the one Windows PowerShell's Add-Type uses), where a compiler is installed
// The window changes themselves are Win32 calls and can only be tried on Windows; nothing here touches a window.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const wm = require(path.join(ROOT, 'main', 'windowmode.js')), config = require(path.join(ROOT, 'main', 'config.js'));
try {
  const clean = config.normalize({ games: { a: { emulator: 'C:\\e.exe', window: 'borderless' }, b: { window: 'windowed' }, c: { window: 'fullscreen' }, d: { title: 'Name', window: 'windowed' }, e: { window: 5 } } }).games;
  check('a saved config keeps borderless / windowed beside the emulator and name', clean.a.window === 'borderless' && clean.a.emulator === 'C:\\e.exe' && clean.b.window === 'windowed' && clean.d.window === 'windowed' && clean.d.title === 'Name', JSON.stringify(clean));
  check('any other value is dropped (and a game with nothing left is dropped)', !clean.c && !clean.e, JSON.stringify(clean));
  check('a game\'s mode is read from the config, and is "" when unset or odd', wm.modeOf({ games: { a: { window: 'borderless' }, c: { window: 'zzz' } } }, 'a') === 'borderless' && wm.modeOf({ games: { c: { window: 'zzz' } } }, 'c') === '' && wm.modeOf({}, 'x') === '' && wm.modeOf(null, 'x') === '');
  check('the shelf-started games (Quiver, GOG, HoYoPlay, PC games folder, added by hand) take one; Steam and Epic do not', ['custom', 'quiver', 'gog', 'hoyoplay', 'folder'].every(s => wm.SOURCES.includes(s)) && !wm.SOURCES.includes('epic') && !wm.SOURCES.includes('steam'));
  check('the helper\'s source has no single quote (PowerShell takes it as one quoted string)', !/'/.test(wm.CSHARP), (wm.CSHARP.match(/'/g) || []).length);
  const cmd = wm.psScript(4321, "C:\\Games\\Bob's Game", 600);
  check('the command is Add-Type of that source, then BL.Run(pid, folder, seconds), the folder\'s quote doubled', /^\$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition '/.test(cmd) && /; \[BL\]::Run\(4321, 'C:\\Games\\Bob''s Game', 600\)$/.test(cmd), cmd.slice(-120));
  check('a bad process id becomes 0 (it never reaches the command as text)', /\[BL\]::Run\(0, /.test(wm.psScript('4321; calc', 'C:\\x')), wm.psScript('4321; calc', 'C:\\x').slice(-60));
  let mcs = ''; for (const c of ['mcs', 'csc']) { try { execFileSync('which', [c], { stdio: 'pipe' }); mcs = c; break; } catch {} }
  if (!mcs) console.log('SKIP  no C# compiler here: the helper\'s C# was not compiled');
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tswin-')); fs.writeFileSync(path.join(tmp, 'BL.cs'), wm.CSHARP);
    let out = '', ok = true; try { execFileSync(mcs, mcs === 'mcs' ? ['-langversion:5', '-target:library', '-out:' + path.join(tmp, 'BL.dll'), path.join(tmp, 'BL.cs')] : ['/target:library', '/langversion:5', '/out:' + path.join(tmp, 'BL.dll'), path.join(tmp, 'BL.cs')], { stdio: 'pipe' }); } catch (e) { ok = false; out = String(e.stdout || e.stderr || e.message); }
    check('the helper\'s C# compiles (C# 5)', ok && fs.existsSync(path.join(tmp, 'BL.dll')), out); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  check('borderless does nothing off Windows (and says so by returning false)', process.platform === 'win32' || wm.borderless(1234, '/x', () => {}) === false);
} catch (e) { check('the test ran to the end', false, e && e.stack); }
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
