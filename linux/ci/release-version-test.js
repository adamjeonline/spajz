// The release workflow's version rules (scripts/release-version.js). Run: node linux/ci/release-version-test.js
'use strict';
const path = require('path');
const { decide } = require(path.join(__dirname, '..', '..', 'scripts', 'release-version.js'));
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || detail == null ? '' : '  -> ' + JSON.stringify(detail))); if (!ok) fails++; };
const tags = ['v2.12.4.281', 'v2.12.4.283', 'v2.12.4.0', 'v2.4.15.0', 'v1.82.0.7', 'not-a-tag', 'v3.0.0-beta'];
const t = (msg, tg = tags, pkg = '1.82.0-beta.10') => decide(msg, tg, pkg);

check('No phrase: no build', t('Fix the museum\'s camera').build === false, t('Fix the museum\'s camera'));
check('"For version 2.4.16": 2.4.16.0', t('Add PC on Android\n\nFor version 2.4.16').version === '2.4.16.0', t('For version 2.4.16'));
check('"For version" of a version already released (.0 there): stops with a message', t('For version 2.4.15').build === false && /already released/.test(t('For version 2.4.15').error || ''), t('For version 2.4.15'));
check('"For build": the next build of the newest version released (2.12.4.283 → .284)', t('Tweak the splash. For build').version === '2.12.4.284', t('For build'));
check('"For build 2.12.4.283": the next build of that version (the number is only a reference)', t('For build 2.12.4.283').version === '2.12.4.284', t('For build 2.12.4.283'));
check('"For build 2.4.15": that version\'s next build (.1)', t('for build 2.4.15').version === '2.4.15.1', t('for build 2.4.15'));
check('"For build 9.9.9": a version with no build yet starts at .0', t('For build 9.9.9').version === '9.9.9.0', t('For build 9.9.9'));
check('"For build" with no release yet: package.json\'s version, first build', t('For build', []).version === '1.82.0.0', t('For build', []));
check('"For build" inside a sentence ("for build systems") doesn\'t count', t('Notes for build systems').build === false, t('Notes for build systems'));
check('"For builds" doesn\'t count', t('Docs for builds').build === false, t('Docs for builds'));
check('"For version" wins over "For build"', t('For build\nFor version 5.0.0').version === '5.0.0.0', t('For build\nFor version 5.0.0'));
check('"For version 2.5.0.3" (four numbers) isn\'t a version', t('For version 2.5.0.3').build === false, t('For version 2.5.0.3'));
check('A trailing period after the version works', t('Ready. For version 2.5.0.').version === '2.5.0.0', t('Ready. For version 2.5.0.'));
check('kind: "For version" is a release', t('For version 2.4.16').kind === 'release', t('For version 2.4.16'));
check('kind: "For build" is a build', t('For build').kind === 'build', t('For build'));
check('kind: "For build 9.9.9" (its first build, .0) is still a build, not a release', t('For build 9.9.9').kind === 'build' && t('For build 9.9.9').version === '9.9.9.0', t('For build 9.9.9'));
check('kind: no phrase is none', t('Fix the museum').kind === 'none', t('Fix the museum'));
console.log(fails ? `${fails} check(s) failed` : 'all passed');
process.exit(fails ? 1 : 0);
