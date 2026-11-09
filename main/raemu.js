// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): most of this file is Boxshelf's
// main/raemu.js; modified for Špajz (DuckStation, RetroArch and Flycast, for any console).
'use strict';
// Per console: will RetroAchievements actually work in its emulator? Reads each emulator's own
// settings (portable folder first, then the usual Windows places). Never returns tokens.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const emucfg = require('./emucfg'); // where each emulator keeps its settings: one answer for the tweaks and this check

const exists = p => fsp.access(p).then(() => true, () => false);
async function readText(p) { try { return (await fsp.readFile(p, 'utf8')).replace(/^﻿/, ''); } catch { return null; } }

// { section(lowercase): { key(lowercase): value } }
function parseIni(text) {
  const out = {}; let cur = out[''] = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === ';' || line[0] === '#') continue;
    const sec = /^\[(.+)\]$/.exec(line); if (sec) { cur = out[sec[1].trim().toLowerCase()] = out[sec[1].trim().toLowerCase()] || {}; continue; }
    const i = line.indexOf('='); if (i < 1) continue;
    cur[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
const truthy = v => /^(true|1|yes|on)$/i.test(String(v == null ? '' : v).trim());

async function firstExisting(list) { for (const p of list) if (p && await exists(p)) return p; return null; }

// (Documents may be the OneDrive one: Windows moves it there when OneDrive backs it up)
async function dolphinIni(exe, env) {
  return firstExisting(emucfg.dolphinUserDirs(exe, env).map(r => path.join(r, 'Config', 'RetroAchievements.ini')));
}
async function checkDolphin(exe, env) {
  const f = await dolphinIni(exe, env); if (!f) return { state: 'unknown', user: '', detail: 'Dolphin settings not found (run Dolphin once)' };
  const a = parseIni(await readText(f)).achievements || {};
  const extra = truthy(a.hardcoreenabled) ? 'Hardcore mode on' : '';
  if (!truthy(a.enabled)) return { state: 'off', user: a.username || '', detail: 'Achievements are turned off in Dolphin' };
  if (!a.apitoken) return { state: 'signed-out', user: a.username || '', detail: 'Not signed in to RetroAchievements in Dolphin' };
  return { state: 'ok', user: a.username || '', detail: extra };
}

async function ppssppSystem(exe, env) {
  const dir = path.dirname(exe);
  const cands = [path.join(dir, 'memstick')];
  const inst = await readText(path.join(dir, 'installed.txt'));
  if (inst && inst.trim()) cands.push(inst.split(/\r?\n/)[0].trim());
  for (const d of emucfg.docsDirs(env)) cands.push(path.join(d, 'PPSSPP'));
  for (const m of cands) { const sys = path.join(m, 'PSP', 'SYSTEM'); if (await exists(path.join(sys, 'ppsspp.ini'))) return sys; }
  return null;
}
async function checkPpsspp(exe, env) {
  const sys = await ppssppSystem(exe, env); if (!sys) return { state: 'unknown', user: '', detail: 'PPSSPP settings not found (run PPSSPP once)' };
  const a = parseIni(await readText(path.join(sys, 'ppsspp.ini'))).achievements || {};
  const user = a.achievementsusername || '';
  if (!truthy(a.achievementsenable)) return { state: 'off', user, detail: 'Achievements are turned off in PPSSPP' };
  if (!(await exists(path.join(sys, 'ppsspp_retroachievements.dat')))) return { state: 'signed-out', user, detail: 'Not signed in to RetroAchievements in PPSSPP' };
  return { state: 'ok', user, detail: truthy(a.achievementschallengemode) ? 'Hardcore mode on' : '' };
}

async function pcsx2Ini(exe, env) {
  return firstExisting(emucfg.pcsx2Inis(exe, env));
}
async function checkPcsx2(exe, env) {
  const f = await pcsx2Ini(exe, env); if (!f) return { state: 'unknown', user: '', detail: 'PCSX2 settings not found (run PCSX2 once)' };
  const a = parseIni(await readText(f)).achievements || {};
  if (!truthy(a.enabled)) return { state: 'off', user: a.username || '', detail: 'Achievements are turned off in PCSX2' };
  if (!a.token) return { state: 'signed-out', user: a.username || '', detail: 'Not signed in to RetroAchievements in PCSX2' };
  return { state: 'ok', user: a.username || '', detail: truthy(a.challengemode) ? 'Hardcore mode on' : '' };
}

// (Špajz, asked for in Boxshelf's discussions: portable emulators) DuckStation, RetroArch and Flycast too, for any
// console they're set up for, each read from its portable folder first (beside the program), then where an installed copy
// keeps its settings (Windows, then Linux and its Flatpak)
const homeOf = env => env.USERPROFILE || env.HOME || require('os').homedir();
const localOf = env => env.LOCALAPPDATA || path.join(homeOf(env), 'AppData', 'Local'), roamOf = env => env.APPDATA || path.join(homeOf(env), 'AppData', 'Roaming');
async function duckIni(exe, env) {
  const dir = path.dirname(exe), h = homeOf(env);
  return firstExisting([...(await exists(path.join(dir, 'portable.txt')) ? [path.join(dir, 'settings.ini')] : []), path.join(localOf(env), 'DuckStation', 'settings.ini'),
    ...emucfg.docsDirs(env).map(d => path.join(d, 'DuckStation', 'settings.ini')), path.join(h, '.local', 'share', 'duckstation', 'settings.ini'),
    path.join(h, '.var', 'app', 'org.duckstation.DuckStation', 'data', 'duckstation', 'settings.ini')]);
}
async function checkDuck(exe, env) { // ([Cheevos] Enabled / Username / Token / ChallengeMode, as DuckStation's settings.cpp reads them)
  const f = await duckIni(exe, env); if (!f) return { state: 'unknown', user: '', detail: 'DuckStation settings not found (run DuckStation once)' };
  const a = parseIni(await readText(f)).cheevos || {}, user = a.username || '';
  if (!truthy(a.enabled)) return { state: 'off', user, detail: 'Achievements are turned off in DuckStation' };
  if (!a.token) return { state: 'signed-out', user, detail: 'Not signed in to RetroAchievements in DuckStation' };
  return { state: 'ok', user, detail: truthy(a.challengemode) ? 'Hardcore mode on' : '' };
}
// retroarch.cfg: `key = "value"` lines
function parseCfg(text) { const o = {}; for (const raw of String(text || '').split(/\r?\n/)) { const m = /^\s*([a-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/i.exec(raw); if (m) o[m[1].toLowerCase()] = m[2]; } return o; }
async function raCfg(exe, env) {
  const h = homeOf(env);
  return firstExisting([path.join(path.dirname(exe), 'retroarch.cfg'), path.join(roamOf(env), 'RetroArch', 'retroarch.cfg'), path.join(h, '.config', 'retroarch', 'retroarch.cfg'),
    path.join(h, '.var', 'app', 'org.libretro.RetroArch', 'config', 'retroarch', 'retroarch.cfg')]);
}
async function checkRetroArch(exe, env) {
  const f = await raCfg(exe, env); if (!f) return { state: 'unknown', user: '', detail: 'RetroArch settings not found (run RetroArch once)' };
  const c = parseCfg(await readText(f)), user = c.cheevos_username || '';
  if (!truthy(c.cheevos_enable)) return { state: 'off', user, detail: 'Achievements are turned off in RetroArch' };
  if (!user || !(c.cheevos_token || c.cheevos_password)) return { state: 'signed-out', user, detail: 'Not signed in to RetroAchievements in RetroArch' };
  return { state: 'ok', user, detail: truthy(c.cheevos_hardcore_mode_enable) ? 'Hardcore mode on' : '' };
}
async function flycastCfg(exe, env) {
  const h = homeOf(env);
  return firstExisting([path.join(path.dirname(exe), 'emu.cfg'), path.join(roamOf(env), 'flycast', 'emu.cfg'), path.join(h, '.config', 'flycast', 'emu.cfg'),
    path.join(h, '.var', 'app', 'org.flycast.Flycast', 'config', 'flycast', 'emu.cfg')]);
}
async function checkFlycast(exe, env) { // ([achievements] Enabled / UserName / Token / HardcoreMode, as Flycast's option.cpp names them)
  const f = await flycastCfg(exe, env); if (!f) return { state: 'unknown', user: '', detail: 'Flycast settings not found (run Flycast once)' };
  const a = parseIni(await readText(f)).achievements || {}, user = a.username || '';
  if (!truthy(a.enabled)) return { state: 'off', user, detail: 'Achievements are turned off in Flycast' };
  if (!a.token) return { state: 'signed-out', user, detail: 'Not signed in to RetroAchievements in Flycast' };
  return { state: 'ok', user, detail: truthy(a.hardcoremode) ? 'Hardcore mode on' : '' };
}

const EMU = { Dolphin: checkDolphin, PPSSPP: checkPpsspp, PCSX2: checkPcsx2, DuckStation: checkDuck, RetroArch: checkRetroArch, Flycast: checkFlycast };
const SYSTEMS = [['gc', 'Dolphin'], ['wii', 'Dolphin'], ['psp', 'PPSSPP'], ['ps2', 'PCSX2']];
// which of those a console's program is, by its name (a portable copy keeps its usual program name)
const KINDS = [[/dolphin/i, 'Dolphin'], [/ppsspp/i, 'PPSSPP'], [/pcsx2/i, 'PCSX2'], [/duckstation/i, 'DuckStation'], [/^retroarch/i, 'RetroArch'], [/flycast/i, 'Flycast']];
const kindOf = exe => { const n = path.basename(String(exe || '')); const k = KINDS.find(([re]) => re.test(n)); return k ? k[1] : null; };

// cfg: the app config; supported: RA console ids (main/ra.js CONSOLE_ID); env: for tests
async function check(cfg, supported, env = process.env) {
  const raUser = String((cfg && cfg.ra && cfg.ra.user) || '').trim();
  const memo = new Map(); // gc and wii often share one Dolphin
  // the four consoles always listed, and every other console RetroAchievements covers whose emulator can be read
  const exeOf = id => String((cfg && cfg.systems && cfg.systems[id] && cfg.systems[id].emulator) || '').trim();
  const rows = SYSTEMS.map(([system, def]) => [system, kindOf(exeOf(system)) || def]);
  for (const id of Object.keys((cfg && cfg.systems) || {})) if (!rows.some(r => r[0] === id) && supported[id] && kindOf(exeOf(id))) rows.push([id, kindOf(exeOf(id))]);
  return Promise.all(rows.map(async ([system, emulator]) => {
    const base = { system, emulator };
    if (!supported[system]) return { ...base, state: 'unsupported', user: '', detail: system === 'wii' ? 'Few Wii games have achievement sets yet' : 'RetroAchievements does not cover this console' };
    const exe = String((cfg && cfg.systems && cfg.systems[system] && cfg.systems[system].emulator) || '').trim();
    if (!exe) return { ...base, state: 'no-emulator', user: '', detail: `No ${emulator} set up for this console` };
    const key = emulator + '|' + path.resolve(exe);
    if (!memo.has(key)) memo.set(key, EMU[emulator](exe, env).catch(() => ({ state: 'unknown', user: '', detail: `Could not read ${emulator} settings` })));
    const r = { ...base, ...(await memo.get(key)) };
    if (r.state === 'ok' && raUser && r.user && r.user.toLowerCase() !== raUser.toLowerCase())
      return { ...r, state: 'other-user', detail: `${emulator} is signed in as ${r.user}, not ${raUser}` };
    return r;
  }));
}

module.exports = { check, parseIni, parseCfg, kindOf };
