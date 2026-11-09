// (T)rustyShelf's HoYoPlay shelf and the administrator-rights start. Run: node linux/ci/hoyoplay-test.js
//   - HoYoPlay's registry list (reg.exe's text, REG_SZ and REG_BINARY values) gives its installed games with their program
//     found in the install folder or one folder inside it; games with no program, an unknown code or no folder are left out
//   - a program whose manifest asks for administrator rights is recognised, and the PowerShell command that starts it with
//     Windows' prompt quotes its path and options safely
// The registry text is made up here (reg.exe's own layout); nothing reads this PC's registry.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + String(detail).slice(0, 500))); if (!ok) fails++; };
const Mod = require('module'), load0 = Mod._load; Mod._load = function (r, ...x) { return r === 'electron' ? { shell: {} } : load0.call(this, r, ...x); };
const pcg = require(path.join(ROOT, 'main', 'pcgames.js')), launcher = require(path.join(ROOT, 'main', 'launcher.js'));
Mod._load = load0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tshoyo-'));
const mk = (p, body) => { const f = path.join(tmp, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body == null ? 'x' : body); return f; };
const hex = s => Buffer.from(s + '\0', 'utf8').toString('hex').toUpperCase();
try {
  const genshin = mk('Games/Genshin Impact/Genshin Impact Game/GenshinImpact.exe'), star = mk('Games/StarRail/StarRail.exe'), zzz = mk('Games/ZZZ/ZenlessZoneZero.exe');
  mk('Games/Other/Other.exe'); fs.mkdirSync(path.join(tmp, 'Games/Empty'), { recursive: true });
  const key = (name, biz, dir, bin) => `HKEY_CURRENT_USER\\Software\\Cognosphere\\HYP\\1_0\\${name}\r\n    GameBiz    ${bin ? 'REG_BINARY' : 'REG_SZ'}    ${bin ? hex(biz) : biz}\r\n    GameInstallPath    ${bin ? 'REG_BINARY' : 'REG_SZ'}    ${bin ? hex(dir) : dir}\r\n    Other    REG_DWORD    0x1\r\n\r\n`;
  const text = 'HKEY_CURRENT_USER\\Software\\Cognosphere\\HYP\r\n\r\n' + key('hk4e_global', 'hk4e_global', path.join(tmp, 'Games/Genshin Impact'), true) + key('hkrpg_global', 'hkrpg_global', path.join(tmp, 'Games/StarRail'), false)
    + key('nap_cn', 'nap_cn', path.join(tmp, 'Games/ZZZ'), true) + key('mystery', 'xyz_global', path.join(tmp, 'Games/Other'), false) + key('bh3_global', 'bh3_global', path.join(tmp, 'Games/Empty'), false)
    + key('gone', 'hk4e_cn', path.join(tmp, 'Games/Missing'), false);
  const tree = pcg.parseReg(text), g = pcg.hoyoFromTree(tree), by = Object.fromEntries(g.map(x => [x.title, x]));
  check('binary values are decoded (hex of the text and its closing zero byte)', Object.values(Object.fromEntries(tree)).some(v => v['gamebiz#text'] === 'hk4e_global'), JSON.stringify([...tree.values()][1]));
  check('Genshin Impact is found: its program is in the folder inside the install folder', by['Genshin Impact'] && by['Genshin Impact'].exe === genshin && by['Genshin Impact'].source === 'hoyoplay', JSON.stringify(by));
  check('Honkai: Star Rail (a plain string value) is found, and the Chinese Zenless Zone Zero says (China)', by['Honkai: Star Rail'] && by['Honkai: Star Rail'].exe === star && by['Zenless Zone Zero (China)'] && by['Zenless Zone Zero (China)'].exe === zzz, JSON.stringify(Object.keys(by)));
  check('an unknown game code, a folder with no program and a folder that is gone are left out', g.length === 3 && !g.some(x => /Impact 3rd/.test(x.title)), JSON.stringify(g.map(x => x.title)));
  check('each game has a stable id, the program, no options, and its folder (for its size)', g.every(x => /^hoyo-/.test(x.id) && x.args === '' && fs.existsSync(x.exe) && fs.existsSync(x.dir)), JSON.stringify(g));
  // administrator rights
  const adm = mk('apps/admin.exe', 'MZ…<requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>…'), plain = mk('apps/plain.exe', 'MZ…<requestedExecutionLevel level="asInvoker"/>…');
  check('a program that asks for administrator rights is recognised, one that doesn\'t is not, a missing one is not', launcher.needsAdmin(adm) === true && launcher.needsAdmin(plain) === false && launcher.needsAdmin(path.join(tmp, 'nope.exe')) === false);
  const cmd = launcher.elevatedScript("C:\\Games\\Bob's Game\\game.exe", ['-a', "it's here", 'two words']);
  check('the PowerShell command asks for Windows\' prompt (RunAs), waits for the program, and doubles quotes inside a path or option',
    /Start-Process -FilePath 'C:\\Games\\Bob''s Game\\game\.exe' -WorkingDirectory 'C:\\Games\\Bob''s Game' -Verb RunAs -ArgumentList @\('-a','it''s here','two words'\) -PassThru; \$p\.WaitForExit\(\)$/.test(cmd), cmd);
  check('with no options there is no ArgumentList', !/ArgumentList/.test(launcher.elevatedScript('C:\\x\\a.exe', [])));
} catch (e) { check('the test ran to the end', false, e && e.stack); }
finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
