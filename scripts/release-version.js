#!/usr/bin/env node
// (T)rustyShelf's release builds (.github/workflows/build-release-check.yml): whether a push is built, and as which version A.B.C.DDDD
// (A.B.C the version, DDDD the build of it), from the pushed commit's message and the release tags already there (vA.B.C.DDDD).
//
//   "For version 2.4.15"           → 2.4.15.0, a new version (stops if v2.4.15.0 is already there)
//   "For build"                    → the next build of the newest version released (2.12.4.283 → 2.12.4.284)
//   "For build 2.12.4" / "2.12.4.x" → the next build of that version (its first is .0); the number after it is only a reference
//   neither                        → no build
// The phrases can be anywhere in the message, in any case. "For build" counts only as a phrase of its own (followed by a
// version, punctuation or the end of a line), so a sentence like "for build systems" doesn't start one.
//
//   node scripts/release-version.js "<commit message>" <file listing the tags, one per line> [package.json version]
// Prints GitHub Actions outputs: build=true|false, kind=release|build|none (a "For version" commit is a release, a "For build"
// one a build), version, tag, semver, code (Android), reason. Exits 1 when the version asked
// for can't be built.
'use strict';
const fs = require('fs');

const VERSION_RE = /\bfor version\s+v?(\d+)\.(\d+)\.(\d+)(?!\.?\d)/i; // (a 4th number isn't a version: "2.5.0." ending a sentence is)
const BUILD_RE = /\bfor build(?:\s+v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?)?(?=[ \t]*(?:$|[.,;:!?)\]]))/im;

// the release tags: [{ v: [A, B, C], d: DDDD }]
function parseTags(lines) {
  return lines.map(t => /^v(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(t).trim())).filter(Boolean).map(m => ({ v: [+m[1], +m[2], +m[3]], d: +m[4] }));
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const cmpV = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const nextBuild = (tags, v) => tags.filter(t => same(t.v, v)).reduce((m, t) => Math.max(m, t.d), -1) + 1;

function decide(message, tagLines, pkgVersion) {
  const tags = parseTags(tagLines), msg = String(message || '');
  let m = VERSION_RE.exec(msg);
  if (m) {
    const v = [+m[1], +m[2], +m[3]];
    if (tags.some(t => same(t.v, v) && t.d === 0)) return { build: false, error: `v${v.join('.')}.0 is already released: use "For build" for the next build of it, or a new version` };
    return { build: true, kind: 'release', version: [...v, 0].join('.'), reason: `new version ${v.join('.')}` };
  }
  m = BUILD_RE.exec(msg);
  if (m) {
    let v;
    if (m[1] != null) v = [+m[1], +m[2], +m[3]];
    else if (tags.length) v = tags.slice().sort((a, b) => cmpV(b.v, a.v))[0].v; // (the newest version released)
    else { const p = /^(\d+)\.(\d+)\.(\d+)/.exec(String(pkgVersion || '')); if (!p) return { build: false, error: 'no release yet and no version in package.json: start with "For version A.B.C"' }; v = [+p[1], +p[2], +p[3]]; }
    const d = nextBuild(tags, v);
    return { build: true, version: [...v, d].join('.'), kind: 'build', reason: d ? `build ${d} of ${v.join('.')}` : `first build of ${v.join('.')}` };
  }
  return { build: false, kind: 'none', reason: 'no "For version" / "For build" in the commit message' };
}

module.exports = { decide, parseTags };

if (require.main === module) {
  const [msg, tagFile, pkgVersion] = process.argv.slice(2);
  const lines = tagFile ? fs.readFileSync(tagFile === '-' ? 0 : tagFile, 'utf8').split(/\r?\n/) : [];
  const r = decide(msg, lines, pkgVersion);
  const n = r.version ? r.version.split('.').map(Number) : null;
  // semver: the form npm and electron-builder take (A.B.C+DDDD); code: Android's versionCode, newer for every build
  // (A ≤ 20, B and C ≤ 99, DDDD ≤ 9999 keep it under Google Play's 2100000000)
  const code = n && n[0] <= 20 && n[1] <= 99 && n[2] <= 99 && n[3] <= 9999 ? ((n[0] * 100 + n[1]) * 100 + n[2]) * 10000 + n[3] : '';
  if (n && !code) { console.error(`${r.version} is too big for an Android version code`); process.exit(1); }
  const out = [`build=${r.build}`, `kind=${r.kind || 'none'}`, `version=${r.version || ''}`, `tag=${r.version ? 'v' + r.version : ''}`, `semver=${n ? n.slice(0, 3).join('.') + '+' + n[3] : ''}`,
    `code=${code}`, `reason=${(r.error || r.reason || '').replace(/\n/g, ' ')}`];
  console.log(out.join('\n'));
  if (r.error) { console.error(r.error); process.exit(1); }
}
