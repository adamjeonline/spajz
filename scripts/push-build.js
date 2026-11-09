#!/usr/bin/env node
// (T)rustyShelf: push a build and get on with the next thing. GitHub takes about 3 minutes to build; nothing here sits waiting
// for that, except when it has to.
//
//   node scripts/push-build.js "Build: what it is"   makes the empty "For build" commit on top of what's committed, pushes it
//                                                    to your repository, says where its run is, and returns at once
//   node scripts/push-build.js --status              the latest runs of Build/release check as they are now (never waits)
//   node scripts/push-build.js --wait                waits for the latest run to finish and says how it went (exit 1: failed)
//   node scripts/push-build.js "…" --dry-run         says what it would do, and does nothing
// Options: --repo owner/name (default GGStonks/t-rustyshelf), --trailer "Co-Authored-By: …" (or TS_COMMIT_TRAILER), the
// commit's author from GIT_AUTHOR_* / GIT_COMMITTER_* when set, else git's own settings.
//
// The one wait: before pushing, a run that's still going is waited for. The workflow runs one at a time (its concurrency
// group): a push while one runs is kept waiting, and the push after that would set it aside, so a build could be skipped.
// It refuses when there are changes not committed yet: they wouldn't be in the build.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const REPO = String(opt('repo', 'GGStonks/t-rustyshelf')), DRY = argv.includes('--dry-run');
const TRAILER = String(opt('trailer', process.env.TS_COMMIT_TRAILER || '') || '');
const title = argv.find((a, i) => !a.startsWith('--') && !['--repo', '--trailer'].includes(argv[i - 1]));
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', o.quiet ? 'ignore' : 'inherit'], ...o }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const runs = (n = 3) => JSON.parse(sh('gh', ['run', 'list', '-R', REPO, '-L', String(n), '--workflow', 'build-release-check.yml', '--json', 'databaseId,status,conclusion,headSha,displayTitle,createdAt,url']));
const jobsOf = id => { try { return JSON.parse(sh('gh', ['run', 'view', String(id), '-R', REPO, '--json', 'jobs'])).jobs || []; } catch { return []; } };
const line = r => `${r.headSha.slice(0, 7)} ${r.status === 'completed' ? r.conclusion : r.status} · ${r.displayTitle.split('\n')[0].slice(0, 70)} · ${r.url}`;
const busy = r => r && r.status !== 'completed';

async function waitFor(r, why) {
  if (!busy(r)) return r;
  process.stdout.write(`${why}: ${line(r)}\n  waiting`);
  for (;;) { await sleep(15000); const now = runs(10).find(x => x.databaseId === r.databaseId) || r; process.stdout.write('.'); if (!busy(now)) { process.stdout.write('\n'); return now; } }
}
function report(r) {
  console.log(line(r));
  for (const j of jobsOf(r.databaseId)) console.log(`  ${j.name}: ${j.conclusion || j.status}`);
  return r.conclusion === 'success';
}

(async () => {
  if (argv.includes('--status')) { for (const r of runs(3)) { console.log(line(r)); if (busy(r)) for (const j of jobsOf(r.databaseId)) console.log(`  ${j.name}: ${j.conclusion || j.status}`); } return; }
  if (argv.includes('--wait')) { const r = runs(1)[0]; if (!r) { console.log('No runs yet.'); return; } process.exit(report(await waitFor(r, 'Still going')) ? 0 : 1); }
  if (!title) { console.error('Say what the build is: node scripts/push-build.js "Build: what it is"'); process.exit(2); }
  if (/\bfor (build|version)\b/i.test(title)) { console.error('The title already holds "For build" / "For version": leave that to this script.'); process.exit(2); }
  const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) { console.error('Changes not committed yet (they would not be in the build): commit them first.\n' + dirty); process.exit(2); }
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = sh('git', ['remote', '-v']).split('\n').map(l => l.split(/\s+/)).find(([, url, kind]) => kind === '(push)' && url && url.replace(/\.git$/, '').toLowerCase().endsWith('/' + REPO.toLowerCase()));
  if (!remote) { console.error(`No git remote points to ${REPO}.`); process.exit(2); }
  const msg = `${title}\n\nFor build\n${TRAILER ? `\n${TRAILER}\n` : ''}`;
  if (DRY) { console.log(`Would wait for a run still going, then commit (empty) on ${branch}:\n---\n${msg}---\nand push to ${remote[0]} (${REPO}).`); return; }
  const last = runs(1)[0];
  if (busy(last)) { const done = await waitFor(last, 'A run is still going (a new push now could set it aside)'); console.log(`  it ended: ${done.conclusion}`); }
  sh('git', ['commit', '--allow-empty', '-q', '-F', '-'], { input: msg, stdio: ['pipe', 'pipe', 'inherit'] });
  const sha = sh('git', ['rev-parse', 'HEAD']);
  sh('git', ['push', '-q', remote[0], branch]);
  console.log(`Pushed ${sha.slice(0, 7)} "${title}" to ${REPO}.`);
  for (let i = 0; i < 12; i++) { await sleep(5000); const r = runs(5).find(x => x.headSha === sha); if (r) { console.log(`Its run: ${r.url}\nCarry on: \`node scripts/push-build.js --status\` shows how it's going, and the next build push waits for it only if it's still running.`); return; } }
  console.log('Its run hasn\'t shown up yet; `node scripts/push-build.js --status` will show it.');
})().catch(e => { console.error(e && e.message || e); process.exit(1); });
