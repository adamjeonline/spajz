// (T)rustyShelf's portable emulators (asked for in Boxshelf's discussions). Run: node linux/ci/portable-test.js
//   - Find emulators in a folder (main/detect.js emulatorsIn): programs four folders deep in the folder picked are found,
//     per console; deeper ones and other files aren't
//   - RetroAchievements (main/raemu.js): DuckStation, RetroArch and Flycast are read from their portable folders (beside
//     the program), for whichever console they're set up for; turned off / signed out are told apart
// Uses this platform's own program names (main/systems.js), in a made-up folder; never reads your real settings.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const { CONSOLES } = require(path.join(ROOT, 'main', 'systems.js'));
const detect = require(path.join(ROOT, 'main', 'detect.js')), raemu = require(path.join(ROOT, 'main', 'raemu.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsportable-'));
const mk = (p, body) => { const f = path.join(tmp, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body || ''); return f; };
const name = (id, re) => (CONSOLES.find(c => c.id === id).exeNames || []).find(n => !n.startsWith('re:') && (!re || re.test(n)));

(async () => {
  try {
    // a USB stick's emulators folder: DuckStation and PCSX2 at different depths, Dolphin too deep, a readme
    const duck = mk(`Stick/Emulators/DuckStation/${name('psx', /duckstation/i)}`), pcsx2 = mk(`Stick/Emulators/PCSX2 Portable/bin/${name('ps2', /pcsx2/i)}`);
    mk(`Stick/Emulators/a/b/c/d/e/${name('gc', /dolphin/i)}`); mk('Stick/Emulators/readme.txt', 'hi');
    const r = detect.emulatorsIn(path.join(tmp, 'Stick'));
    check('Find emulators in a folder: DuckStation (PS1) and PCSX2 (PS2) are found where they are, Dolphin five folders down isn\'t',
      r.systems.psx === duck && r.systems.ps2 === pcsx2 && !r.systems.gc, JSON.stringify(r.systems));
    // (Boxshelf's issue 17) DeSmuME for the DS and VisualBoyAdvance-M for the Game Boys are found too
    const desmume = mk(`Stick/Emulators/DeSmuME/${name('nds', /desmume/i)}`), vbam = mk(`Stick/Emulators/VBA-M/${name('gba', /visualboy/i)}`);
    const r2 = detect.emulatorsIn(path.join(tmp, 'Stick'));
    check('Find emulators in a folder: DeSmuME for the DS, VisualBoyAdvance-M for the Game Boy Advance, Game Boy and Game Boy Color', r2.systems.nds === desmume && r2.systems.gba === vbam && r2.systems.gb === vbam && r2.systems.gbc === vbam, JSON.stringify(r2.systems));
    { // the Windows names, as Windows sees the list (versioned DeSmuME builds, VBA-M, DuckStation's ARM64 build)
      const out = require('child_process').execFileSync(process.execPath, ['-e', `Object.defineProperty(process, 'platform', { value: 'win32' }); const C = require(${JSON.stringify(path.join(ROOT, 'main', 'systems.js'))}).CONSOLES; process.stdout.write(JSON.stringify(Object.fromEntries(['psx', 'nds', 'gba', 'gb'].map(id => [id, C.find(c => c.id === id).exeNames]))))`], { encoding: 'utf8' });
      const L = JSON.parse(out), hits = (id, f) => L[id].some(n => n.startsWith('re:') ? new RegExp(n.slice(3), 'i').test(f) : n.toLowerCase() === f.toLowerCase());
      const want = [['nds', 'DeSmuME_0.9.13_x64.exe'], ['nds', 'DeSmuME-VS2022-x64-Release.exe'], ['nds', 'melonDS.exe'], ['gba', 'visualboyadvance-m.exe'], ['gb', 'VisualBoyAdvance-M.exe'], ['psx', 'duckstation-qt-ARM64-ReleaseLTCG.exe'], ['psx', 'duckstation-qt-x64-ReleaseLTCG.exe']];
      const miss = want.filter(([id, f]) => !hits(id, f));
      check('Windows: DeSmuME (versioned builds), VisualBoyAdvance-M and DuckStation\'s builds are names detection knows', !miss.length, JSON.stringify(miss)); }
    check('Find emulators in a folder: a folder that isn\'t there finds nothing (no error)', JSON.stringify(detect.emulatorsIn(path.join(tmp, 'nope')).systems) === '{}');

    // RetroAchievements in portable copies
    const env = { HOME: tmp, USERPROFILE: tmp, APPDATA: path.join(tmp, 'roam'), LOCALAPPDATA: path.join(tmp, 'local') };
    mk('Stick/Emulators/DuckStation/portable.txt'); mk('Stick/Emulators/DuckStation/settings.ini', '[Cheevos]\nEnabled = true\nUsername = alice\nToken = abc123\nChallengeMode = true\n');
    const ra = mk(`Stick/Emulators/RetroArch/${name('snes', /retroarch/i)}`); mk('Stick/Emulators/RetroArch/retroarch.cfg', 'cheevos_enable = "true"\ncheevos_username = "alice"\ncheevos_token = "tok"\n');
    const fly = mk(`Stick/Emulators/Flycast/${name('dreamcast', /flycast/i)}`); mk('Stick/Emulators/Flycast/emu.cfg', '[achievements]\nEnabled = yes\nUserName = alice\nToken =\n');
    const ra2 = mk(`Stick/Emulators/RetroArch2/${name('snes', /retroarch/i)}`); mk('Stick/Emulators/RetroArch2/retroarch.cfg', 'cheevos_enable = "false"\ncheevos_username = "alice"\n');
    const cfg = { ra: { user: 'alice' }, systems: { psx: { emulator: duck }, snes: { emulator: ra }, dreamcast: { emulator: fly }, nes: { emulator: ra2 }, ps2: { emulator: ra } } };
    const supported = { gc: 1, wii: 1, psp: 1, ps2: 1, psx: 1, snes: 1, dreamcast: 1, nes: 1 };
    const rows = await raemu.check(cfg, supported, env), by = Object.fromEntries(rows.map(x => [x.system, x]));
    check('RetroAchievements: a portable DuckStation (portable.txt) is read beside its program: signed in, hardcore on',
      by.psx && by.psx.emulator === 'DuckStation' && by.psx.state === 'ok' && by.psx.user === 'alice' && /Hardcore/.test(by.psx.detail), JSON.stringify(by.psx));
    check('RetroAchievements: a portable RetroArch (retroarch.cfg beside it) is read for the console it runs: signed in', by.snes && by.snes.emulator === 'RetroArch' && by.snes.state === 'ok', JSON.stringify(by.snes));
    check('RetroAchievements: Flycast with achievements on but no sign-in says signed out', by.dreamcast && by.dreamcast.emulator === 'Flycast' && by.dreamcast.state === 'signed-out', JSON.stringify(by.dreamcast));
    check('RetroAchievements: RetroArch with achievements off says off', by.nes && by.nes.state === 'off', JSON.stringify(by.nes));
    check('RetroAchievements: PS2 run in RetroArch is read as RetroArch, not PCSX2', by.ps2 && by.ps2.emulator === 'RetroArch' && by.ps2.state === 'ok', JSON.stringify(by.ps2));
    check('RetroAchievements: the four usual consoles are still listed (GameCube with no emulator set says so)', by.gc && by.gc.state === 'no-emulator' && by.wii && by.psp, JSON.stringify(rows.map(x => x.system)));
    check('RetroAchievements: no token or password ever comes back', !JSON.stringify(rows).includes('abc123') && !JSON.stringify(rows).includes('tok"'), JSON.stringify(rows).slice(0, 300));
  } catch (e) { check('the test ran to the end', false, e && e.stack); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  console.log(fails ? `${fails} failed` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
