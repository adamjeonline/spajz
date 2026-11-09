#!/usr/bin/env node
// (T)rustyShelf's community report: everything people around Boxshelf and (T)rustyShelf ask for, report, build and say,
// gathered from GitHub into one report, and the list of what is waiting for an answer from you. No AI: it collects and
// sorts (keyword rules); an AI (or you) reads to-answer.md and decides what to reply.
//
//   node scripts/community-report.js [--out community-report] [--since 2026-11-01] [--no-forks] [--no-search]
//        [--no-notifications] [--repos owner/repo,owner/repo] [--mine GGStonks/t-rustyshelf] [--me GGStonks]
//        [--depth 3] [--jobs 8] [--tone]
//
// What it reads (GitHub's API, with your `gh` sign-in or GITHUB_TOKEN):
//   - your own repository (--mine): its issues, pull requests and discussions, and its forks
//   - the Boxshelf repositories (--repos): every issue, pull request (its files and commits) and discussion
//   - for every conversation, every message: the opening post, all comments (every page), the replies under discussion
//     comments, pull request reviews and their code comments, with who, when and whether it was edited; 👍 counts
//   - every fork (and forks of forks): each branch's commits and files that aren't in the original, and the forks' own
//     conversations
//   - elsewhere on GitHub: repositories, issues / pull requests and code that mention Boxshelf, and projects built from it
//   - your GitHub notifications (last 30 days): anything that names or involves you is caught even outside the
//     repositories above (it never marks them as read)
//   - your repository's commit messages and release tags: what (T)rustyShelf already did about each conversation
// What it writes (in --out, which git ignores):
//   report.md       the report: waiting for your answer, done in (T)rustyShelf but not told yet, new since last time
//                   (threads, messages, edits), notifications, then everything by kind, forks and the rest of GitHub
//   to-answer.md    for the AI that answers: each thread that waits for you, with the whole conversation, what
//   to-answer.json  (T)rustyShelf did about it (commits, the release they're in), and how to post the reply
//   tone.md         how you write on GitHub, worked out from all your comments (rebuilt whenever you've posted a new one)
//   tone-rules.md   yours to edit: rules for replies that always apply (tone.md starts with them); made with the first one if missing
//   data.json       everything collected, for other tools
//   seen.json       what was there last time (every message's id), so "new" is exact
//   cache.json      what doesn't need asking again (README texts, fork work) while the repository hasn't changed
//   done.json       what was decided about each thread (yours, or the AI's, to edit): { "<link>": { "status": "done" | "skip" |
//                   "answered" | "later", "note": "…", "until": "<date>" } }: "skip" / "answered" take a thread off the waiting
//                   list (messages written after "until", when given, still count). The quick way to record a decision:
//                     node scripts/community-report.js --mark <link> skip "no reply needed: a thanks"   (until = now)
//                     node scripts/community-report.js --mark <link> clear                               (forget it)
// It also remembers what you said: your promises ("in the next release", "I'll add", "will do", …) are listed until a later
// message of yours in that thread says it's out, and discussions' polls are read with their votes.
// A thread waits for you when someone (not you, not a bot) wrote in it after your last message, or you never wrote in it.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');

// ---------- options ----------
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = path.resolve(String(opt('out', 'community-report')));
const REPOS = String(opt('repos', 'sassiestrhihno/boxshelf-beta,sassiestrhihno/boxshelf-source')).split(',').map(s => s.trim()).filter(Boolean);
const MINE = String(opt('mine', 'GGStonks/t-rustyshelf'));
const ME = String(opt('me', MINE.split('/')[0])), me = ME.toLowerCase();
const SINCE = opt('since', '') ? new Date(String(opt('since'))) : null;
const DEPTH = +opt('depth', 3) || 3, FORKS = !argv.includes('--no-forks'), SEARCH = !argv.includes('--no-search'), NOTIFY = !argv.includes('--no-notifications');
const JOBS = Math.max(1, +opt('jobs', 8) || 8), TONE_ALWAYS = argv.includes('--tone');
const WORD = String(opt('word', 'boxshelf')); // what "mentions Boxshelf" searches for
// "boxshelf" is also a shelf in games and furniture shops: a result counts only when it's about this app (no AI: words)
const ABOUT = /sassiestrhihno|boxshelf[-_ ](beta|source|linux)|\b(fork of|based on|port of)\b[^.\n]{0,40}\bbox ?shelf|\bbox ?shelf\b[^.\n]{0,80}\b(launcher|emulat|frontend|box ?art|retroarch|steam ?deck|ayn|thor|3d shelf|appimage)|\b(launcher|emulat|frontend|box ?art|retroarch|steam ?deck|appimage)\b[^.\n]{0,80}\bbox ?shelf/i;
const DERIVED = /sassiestrhihno|\b(fork of|based on|port of|built on|made from)\b[^.\n]{0,40}\bbox ?shelf|\bbox ?shelf\b[^.\n]{0,20}\b(fork|port)\b/i; // (a project made from Boxshelf's code)
const CODE_QUERIES = ['sassiestrhihno', '"boxshelf-beta"', '"boxshelf-source"']; // the app's own fingerprints (its forks' file headers, its package entries)
const isBot = a => !a || /\[bot\]$/i.test(a) || /^(github-actions|dependabot|copilot)$/i.test(a);
const isMe = a => String(a || '').toLowerCase() === me;
// the rules tone-rules.md starts with (yours to edit there: tone.md always puts them first)
const TONE_RULES = `# Rules for replies (edit this file to change them; tone.md always starts with them)

- Don't repeat what the comment right above already says: not the bug, the feature or the request being talked about (the person
  knows what they asked). Go straight to what's new and expand on it: it's done or out, why it happened, how to use it, what to
  try next, what to watch for.
`;

// ---------- GitHub ----------
function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { return ''; }
}
// --mark <link> <status> [note]: what was decided about a thread, kept in done.json (until = now: someone writing later brings
// it back); --mark <link> clear forgets it. No network: it only edits the file
if (argv.includes('--mark')) {
  const i = argv.indexOf('--mark'), link = argv[i + 1], status = argv[i + 2], note = argv.slice(i + 3).filter(a => !a.startsWith('--')).join(' ');
  if (!link || !status || !/^https:\/\/github\.com\//.test(link)) { console.error('--mark <link> <done|skip|answered|later|clear> [note]'); process.exit(2); }
  if (!['done', 'skip', 'answered', 'later', 'clear'].includes(status)) { console.error('status: done, skip, answered, later or clear'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, 'done.json'); let d = {}; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  if (status === 'clear') delete d[link]; else d[link] = { status, ...(note ? { note } : {}), until: new Date().toISOString() };
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n'); console.log(status === 'clear' ? `Forgot ${link}` : `${link}: ${status}${note ? ` (${note})` : ''}, until now`); process.exit(0);
}
const TOKEN = token(); if (!TOKEN) { console.error('No GitHub sign-in: run `gh auth login` or set GITHUB_TOKEN.'); process.exit(2); }
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'trustyshelf-community-report', Accept: 'application/vnd.github+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// at most JOBS requests at the same time (only the requests themselves wait for a turn, so nothing can block itself)
const slots = (() => { let active = 0; const q = []; const next = () => { if (active >= JOBS || !q.length) return; active++; const { fn, res, rej } = q.shift(); fn().then(res, rej).finally(() => { active--; next(); }); }; return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); }); })();
let calls = 0;
async function http(url, init = {}, tries = 4) {
  for (let t = 0; ; t++) {
    calls++; let r; try { r = await slots(() => fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } })); } catch (e) { if (t >= tries) throw e; await sleep(2000 * (t + 1)); continue; }
    if ((r.status === 403 || r.status === 429) && t < tries && (r.headers.get('x-ratelimit-remaining') === '0' || r.headers.get('retry-after'))) { // rate limits: wait as GitHub says, then again
      const reset = +r.headers.get('x-ratelimit-reset'), after = +r.headers.get('retry-after');
      const ms = after ? after * 1000 : reset ? Math.max(1000, reset * 1000 - Date.now() + 1000) : 15000 * (t + 1);
      if (ms > 15 * 60e3) throw new Error(`rate limit for ${Math.round(ms / 60e3)} min: ${url}`);
      console.error(`  (rate limit: waiting ${Math.round(ms / 1000)} s)`); await sleep(ms); continue; }
    if (r.status >= 500 && t < tries) { await sleep(3000 * (t + 1)); continue; }
    return r;
  }
}
async function rest(p) { const r = await http(p.startsWith('http') ? p : 'https://api.github.com/' + p); if ([403, 404, 409, 410, 422].includes(r.status)) return null; if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); }
async function restAll(p, max = 2000) { // every page (Link: next)
  const out = []; let url = 'https://api.github.com/' + p + (p.includes('?') ? '&' : '?') + 'per_page=100';
  while (url && out.length < max) { const r = await http(url); if (!r.ok) { if ([403, 404, 409, 422].includes(r.status)) return out; throw new Error(`${r.status} ${url}`); }
    const j = await r.json(); out.push(...(Array.isArray(j) ? j : j.items || [])); const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') || ''); url = m ? m[1] : null; }
  return out;
}
async function gql(query, variables) {
  const r = await http('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query, variables }), headers: { 'Content-Type': 'application/json' } });
  const j = await r.json(); if (j.errors && !j.data) throw new Error(j.errors.map(e => e.message).join('; ')); return j.data;
}

// ---------- one conversation, every message ----------
const A = 'author { login }';
const MSG = `id ${A} body createdAt lastEditedAt url`;
const CMT = `${MSG} isMinimized`;
const REACT = 'reactionGroups { content reactors { totalCount } }';
const MORE = 'totalCount pageInfo { hasNextPage endCursor }';
const F = {
  Issue: `id number title body url state createdAt updatedAt closedAt lastEditedAt ${A} labels(first:10){nodes{name}} ${REACT}
    comments(first:100){ ${MORE} nodes{ ${CMT} reactions{totalCount} } }`,
  PullRequest: `id number title body url state merged createdAt updatedAt lastEditedAt ${A} headRefName headRepository{nameWithOwner} baseRefName labels(first:10){nodes{name}} ${REACT}
    comments(first:100){ ${MORE} nodes{ ${CMT} reactions{totalCount} } }
    reviews(first:50){ ${MORE} nodes{ ${MSG} state comments(first:100){ ${MORE} nodes{ ${CMT} path } } } }
    files(first:100){ nodes{ path additions deletions } } commits(first:100){ nodes{ commit{ oid messageHeadline } } } additions deletions`,
  Discussion: `id number title body url createdAt updatedAt lastEditedAt closed ${A} category{name} upvoteCount ${REACT} answer{ url } poll{ question totalVoteCount options(first:20){ nodes{ option totalVoteCount } } }
    comments(first:100){ ${MORE} nodes{ ${CMT} upvoteCount replies(first:100){ ${MORE} nodes{ ${CMT} } } } }`,
};
const LIST = { issues: ['issues', 'Issue', 40], pulls: ['pullRequests', 'PullRequest', 20], discussions: ['discussions', 'Discussion', 30] };
const listQuery = kind => { const [field, type, n] = LIST[kind];
  return `query($o:String!,$n:String!,$a:String){ repository(owner:$o,name:$n){ ${field}(first:${n},after:$a,orderBy:{field:CREATED_AT,direction:ASC}){ pageInfo{hasNextPage endCursor} nodes{ ${F[type]} } } } }`; };
// a connection that has more than one page: the rest of it, through the node that holds it
async function rest_of(nodeId, type, field, sel, conn) {
  const nodes = [...conn.nodes]; let pi = conn.pageInfo;
  while (pi && pi.hasNextPage) {
    const d = await gql(`query($id:ID!,$a:String){ node(id:$id){ ... on ${type} { ${field}(first:100,after:$a){ pageInfo{hasNextPage endCursor} nodes{ ${sel} } } } } }`, { id: nodeId, a: pi.endCursor });
    const c = d && d.node && d.node[field]; if (!c) break; nodes.push(...c.nodes); pi = c.pageInfo;
  }
  return nodes;
}
async function complete(type, x) { // every page of every list inside one conversation
  if (x.comments && x.comments.pageInfo && x.comments.pageInfo.hasNextPage)
    x.comments.nodes = await rest_of(x.id, type, 'comments', type === 'Discussion' ? `${CMT} upvoteCount replies(first:100){ ${MORE} nodes{ ${CMT} } }` : `${CMT} reactions{totalCount}`, x.comments);
  if (type === 'Discussion') for (const c of x.comments.nodes) if (c.replies && c.replies.pageInfo && c.replies.pageInfo.hasNextPage) c.replies.nodes = await rest_of(c.id, 'DiscussionComment', 'replies', CMT, c.replies);
  if (type === 'PullRequest') {
    if (x.reviews && x.reviews.pageInfo && x.reviews.pageInfo.hasNextPage) x.reviews.nodes = await rest_of(x.id, 'PullRequest', 'reviews', `${MSG} state comments(first:100){ ${MORE} nodes{ ${CMT} path } }`, x.reviews);
    for (const rv of (x.reviews && x.reviews.nodes) || []) if (rv.comments && rv.comments.pageInfo && rv.comments.pageInfo.hasNextPage) rv.comments.nodes = await rest_of(rv.id, 'PullRequestReview', 'comments', `${CMT} path`, rv.comments);
  }
  return x;
}
async function conversations(full, kinds, extra = {}) {
  const [o, n] = full.split('/');
  const per = await Promise.all(kinds.map(async kind => {
    const out = []; let a = null; const [field, type] = LIST[kind];
    for (let page = 0; page < 100; page++) {
      let d; try { d = await gql(listQuery(kind), { o, n, a }); } catch (e) { console.error(`  ${full} ${kind}: ${e.message}`); break; }
      const conn = d && d.repository && d.repository[field]; if (!conn) break;
      out.push(...await Promise.all(conn.nodes.map(async x => Object.assign(item(full, kind, await complete(type, x)), extra))));
      if (!conn.pageInfo.hasNextPage) break; a = conn.pageInfo.endCursor;
    }
    return out;
  }));
  return per.flat();
}
async function oneThread(full, number, kind) { // a single issue / pull request / discussion (one found through a notification)
  const [o, n] = full.split('/');
  if (kind === 'discussions') { const d = await gql(`query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ discussion(number:$num){ ${F.Discussion} } } }`, { o, n, num: number }).catch(() => null);
    const x = d && d.repository && d.repository.discussion; return x ? item(full, 'discussions', await complete('Discussion', x)) : null; }
  const d = await gql(`query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ issueOrPullRequest(number:$num){ __typename ... on Issue { ${F.Issue} } ... on PullRequest { ${F.PullRequest} } } } }`, { o, n, num: number }).catch(() => null);
  const x = d && d.repository && d.repository.issueOrPullRequest; if (!x) return null;
  return item(full, x.__typename === 'PullRequest' ? 'pulls' : 'issues', await complete(x.__typename, x));
}
const plus = x => ((x.reactionGroups || []).find(g => g.content === 'THUMBS_UP') || { reactors: { totalCount: 0 } }).reactors.totalCount + (x.upvoteCount || 0);
const who = x => (x && x.author && x.author.login) || 'ghost';
function item(repo, kind, x) {
  const k = kind === 'pulls' ? 'pull' : kind === 'issues' ? 'issue' : 'discussion';
  const m = (y, type, more = {}) => ({ id: y.id, type, author: who(y), at: y.createdAt, edited: y.lastEditedAt || '', url: y.url, body: y.body || '', ...(y.isMinimized ? { hidden: true } : {}), ...more });
  const messages = [m(x, 'post')];
  for (const c of (x.comments && x.comments.nodes) || []) {
    messages.push(m(c, 'comment'));
    for (const r of (c.replies && c.replies.nodes) || []) messages.push(m(r, 'reply', { parent: c.id, parentUrl: c.url }));
  }
  for (const rv of (x.reviews && x.reviews.nodes) || []) {
    if ((rv.body || '').trim()) messages.push(m(rv, 'review', { state: rv.state }));
    for (const c of (rv.comments && rv.comments.nodes) || []) messages.push(m(c, 'code comment', { path: c.path }));
  }
  messages.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const comments = messages.filter(y => y.type !== 'post').map(y => ({ author: y.author, body: y.body, at: y.at, url: y.url, ...(y.type === 'reply' ? { reply: true } : {}), type: y.type, id: y.id }));
  return {
    key: x.url, repo, kind: k, number: x.number, title: x.title, url: x.url, nodeId: x.id,
    author: who(x), created: x.createdAt, updated: x.updatedAt, state: x.merged ? 'merged' : x.closed ? 'closed' : String(x.state || 'open').toLowerCase(),
    labels: ((x.labels && x.labels.nodes) || []).map(l => l.name), category: x.category && x.category.name, plus: plus(x), answered: !!(x.answer && x.answer.url),
    ...(x.poll ? { poll: { question: x.poll.question, votes: x.poll.totalVoteCount, options: ((x.poll.options && x.poll.options.nodes) || []).map(o => ({ option: o.option, votes: o.totalVoteCount })) } } : {}),
    body: x.body || '', messages, comments, commentCount: comments.length,
    ...(k === 'pull' ? { head: `${(x.headRepository || {}).nameWithOwner || '?'}:${x.headRefName}`, base: x.baseRefName, additions: x.additions, deletions: x.deletions,
      files: ((x.files && x.files.nodes) || []).map(f => `${f.path} (+${f.additions} −${f.deletions})`), commits: ((x.commits && x.commits.nodes) || []).map(c => c.commit.messageHeadline) } : {}),
  };
}

// ---------- forks: what each branch has that the original doesn't ----------
async function forksOf(full, depth, seen) {
  if (depth <= 0) return [];
  const list = await restAll(`repos/${full}/forks?sort=newest`, 1000), out = [];
  for (const f of list) { if (seen.has(f.full_name)) continue; seen.add(f.full_name); out.push({ full: f.full_name, parent: full, owner: f.owner.login, pushed: f.pushed_at, created: f.created_at, issues: f.has_issues, discussions: f.has_discussions, stars: f.stargazers_count, description: f.description || '' }); }
  const deeper = await Promise.all(list.filter(f => f.forks_count && out.some(o => o.full === f.full_name)).map(f => forksOf(f.full_name, depth - 1, seen)));
  return out.concat(...deeper);
}
async function forkWork(root, rootBranch, fork, cache) {
  // never pushed to since it was made (GitHub keeps the original's last push date then): nothing of its own, no need to ask
  if (!(new Date(fork.pushed) > new Date(fork.created))) return [];
  const c0 = cache.work[fork.full]; if (c0 && c0.pushed === fork.pushed && c0.root === root) return c0.work; // (unchanged since last time)
  const branches = await restAll(`repos/${fork.full}/branches`, 300);
  const [fo, fr] = fork.full.split('/');
  const work = (await Promise.all(branches.map(async b => {
    const c = await rest(`repos/${root}/compare/${encodeURIComponent(rootBranch)}...${fo}:${fr}:${encodeURIComponent(b.name)}`);
    if (!c || !c.ahead_by) return null;
    return { branch: b.name, ahead: c.ahead_by, behind: c.behind_by, url: `https://github.com/${fork.full}/compare/${encodeURIComponent(rootBranch)}...${encodeURIComponent(b.name)}`,
      commits: (c.commits || []).map(x => ({ sha: x.sha.slice(0, 9), author: (x.author && x.author.login) || (x.commit.author && x.commit.author.name), date: x.commit.author && x.commit.author.date, message: x.commit.message.split('\n')[0], body: x.commit.message.split('\n').slice(1).join('\n').trim().slice(0, 1500) })),
      files: (c.files || []).map(f => ({ path: f.filename, status: f.status, add: f.additions, del: f.deletions })) };
  }))).filter(Boolean);
  // the same commits on several branches: one entry, the branch that has the most of them first
  work.sort((a, b) => b.ahead - a.ahead); const shas = new Set(), keep = [];
  for (const w of work) { const fresh = w.commits.filter(c => !shas.has(c.sha)); if (!fresh.length) continue; fresh.forEach(c => shas.add(c.sha)); keep.push(w); }
  cache.work[fork.full] = { pushed: fork.pushed, root, work: keep };
  return keep;
}
// which forks have conversations at all: one question for up to 40 of them
async function convCounts(fulls) {
  const out = {};
  for (let i = 0; i < fulls.length; i += 40) {
    const part = fulls.slice(i, i + 40);
    const q = `query{ ${part.map((f, j) => { const [o, n] = f.split('/'); return `r${j}: repository(owner:${JSON.stringify(o)},name:${JSON.stringify(n)}){ nameWithOwner hasIssuesEnabled hasDiscussionsEnabled issues{totalCount} pullRequests{totalCount} discussions{totalCount} }`; }).join(' ')} }`;
    let d = null; try { d = await gql(q, {}); } catch (e) { console.error('  fork counts:', e.message); }
    part.forEach((f, j) => { const r = d && d[`r${j}`]; out[f] = r ? [...(r.issues.totalCount ? ['issues'] : []), ...(r.pullRequests.totalCount ? ['pulls'] : []), ...(r.hasDiscussionsEnabled && r.discussions.totalCount ? ['discussions'] : [])] : ['issues', 'pulls']; });
  }
  return out;
}

// ---------- sorting what people say (keyword rules, no AI) ----------
const RULES = [
  ['bug', /\b(crash(es|ed|ing)?|freez(e|es|ing)|frozen|black screen|not work(ing)?|does(n'?t| not) work|won'?t (start|launch|open|load)|error|fail(s|ed|ing)?|broken|bug|irresponsive|unresponsive|stuck|wrong|can'?t|cannot|unable)\b/i],
  ['feature', /\b(add(ed|ing)?|support(s|ed|ing)?|feature|suggestion|would be (great|nice|awesome|cool)|it would be|option to|ability to|allow(s|ing)?|please (add|make|include)|request|wish|could you|can you|idea|integrat)\b/i],
  ['removal', /\b(remove|get rid of|disable|turn off|hide|without the|no longer show)\b/i],
  ['change', /\b(change|improve|instead|should|rename|better|tweak|adjust|make it|replace|move)\b/i],
  ['question', /(\?\s*$|\bhow (do|can|to)\b|\bis (it|there) (possible|a way)\b)/im],
];
function kindOf(it) {
  const L = it.labels.map(l => l.toLowerCase()), text = `${it.title}\n${it.body}`;
  if (L.some(l => /bug/.test(l))) return 'bug';
  if (L.some(l => /enhancement|feature|idea/.test(l)) || /idea|feature/i.test(it.category || '')) return 'feature';
  if (it.kind === 'pull') return 'code';
  for (const [k, re] of RULES) if (re.test(it.title)) return k; // the title says it best
  for (const [k, re] of RULES) if (re.test(text)) return k;
  return 'other';
}
// the sentences where someone asks for or reports something (template lines and quoted text left out)
const ASK = /\b(would|could|can you|please|add|support|feature|wish|want|need|should|instead|option|allow|crash|freez|black screen|not work|doesn'?t work|can'?t|cannot|error|fail|broken|bug|stuck|missing|request|ability)\b/i;
function asks(text) {
  const clean = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').split(/\r?\n/)
    .filter(l => !/^\s*>/.test(l) && !/^\s*\*\*(Boxshelf version|What happened|What you expected|How to make it happen again|Your setup|Problem report)\*\*/i.test(l) && !/^#+\s/.test(l)).join(' ');
  return clean.split(/(?<=[.!?])\s+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 12 && s.length < 400 && ASK.test(s)).slice(0, 6);
}
// a short "thanks / it works" message, which may need no answer (the AI decides)
const THANKS = /^(\s*(thanks?|thank you|thx|great( job)?|awesome|perfect|nice|cool|wow|got it working|it works?|works( now| perfectly)?)\b[^?]{0,160})$/i;

// ---------- what your repository already did ----------
const ROOT = path.join(__dirname, '..');
function myCommits() {
  try {
    return execFileSync('git', ['log', '--all', '--date=iso-strict', '--format=%H%x1f%ad%x1f%s%x1f%B%x1e'], { encoding: 'utf8', maxBuffer: 128 << 20, cwd: ROOT })
      .split('\x1e').map(s => s.replace(/^\n/, '')).filter(Boolean).map(s => { const [sha, date, subject, body] = s.split('\x1f'); return { sha, date: new Date(date).toISOString(), subject, msg: `${subject}\n${body || ''}` }; }); // (dates in UTC, like GitHub's)
  } catch { return null; }
}
function fetchTags() { // the release tags are made on GitHub: bring them here first (from the remote that is your repository), so "in which release" is right
  try { const remote = execFileSync('git', ['remote', '-v'], { encoding: 'utf8', cwd: ROOT }).split('\n').map(l => l.split(/\s+/)).find(([, url]) => url && url.replace(/\.git$/, '').toLowerCase().endsWith('/' + MINE.toLowerCase()));
    if (remote) execFileSync('git', ['fetch', '--tags', '--quiet', remote[0]], { cwd: ROOT, timeout: 60000, stdio: 'ignore' }); } catch (e) { console.error('  release tags not fetched:', e.message.split('\n')[0]); }
}
const tagCache = {};
function releaseOf(sha) { // the first release tag (vA.B.C.D) that holds a commit, or ''
  if (sha in tagCache) return tagCache[sha];
  let t = ''; try { t = execFileSync('git', ['tag', '--contains', sha, '--sort=creatordate', '--list', 'v*'], { encoding: 'utf8', cwd: ROOT }).split('\n').filter(Boolean)[0] || ''; } catch {}
  return (tagCache[sha] = t);
}
function latestRelease() { try { return execFileSync('git', ['tag', '--sort=-creatordate', '--list', 'v*'], { encoding: 'utf8', cwd: ROOT }).split('\n').filter(Boolean)[0] || ''; } catch { return ''; } }
function patternsFor(it) {
  const n = it.number, short = it.repo.split('/')[1], mineRepo = it.repo === MINE;
  if (mineRepo) return [new RegExp(`\\b(fix(es|ed)?|close[sd]?|resolve[sd]?)\\s+(${MINE.replace('/', '\\/')})?#${n}\\b`, 'i'), new RegExp(`${short}(#|/issues/|/pull/|/discussions/)${n}\\b`, 'i'), new RegExp(`\\(T\\)rustyShelf('s)? (issue|pull request|discussion) #?${n}\\b`, 'i')];
  return it.kind === 'pull' ? [new RegExp(`pull request #?${n}\\b`, 'i'), new RegExp(`${short}[^\\n]{0,40}pull/${n}\\b`, 'i')]
    : it.kind === 'issue' ? [new RegExp(`\\bissues?\\s+(\\d+\\s*(,|and|/|&)\\s*)*${n}\\b`, 'i'), new RegExp(`${short}/issues/${n}\\b`, 'i')]
    : [new RegExp(`${short}/discussions/${n}\\b`, 'i')];
}
// "issue 17", "issues 11 and 13", "Boxshelf-source's issue 1": which repository's issues a commit message names. The words just
// before say which (a part of a repository's name: "source", "beta", "rustyshelf"); none: the first of --repos (Boxshelf's own)
function issueRefs(msg) {
  const out = new Set(), names = [MINE, ...REPOS].map(r => [r, r.split('/')[1].toLowerCase().split(/[-_]/).filter(w => w.length > 3 && w !== 'boxshelf')]);
  for (const m of String(msg).matchAll(/([^\n]{0,40}?)\bissues?\s+#?(\d+(?:\s*(?:,|and|\/|&)\s*#?\d+)*)\b/gi)) {
    const ctx = m[1].toLowerCase(), hit = names.find(([, words]) => words.some(w => ctx.includes(w))), repo = hit ? hit[0] : REPOS[0];
    for (const n of m[2].match(/\d+/g)) out.add(`${repo}#${n}`);
  }
  return out;
}
function mentioned(it, commits) { // → { level: 'mentioned' | 'maybe' | '', commits: [...] }
  if (!commits) return { level: '', commits: [] };
  const pats = patternsFor(it), ref = `${it.repo}#${it.number}`;
  const hit = commits.filter(c => it.kind === 'issue' && it.repo !== MINE ? (issueRefs(c.msg).has(ref) || pats[1].test(c.msg)) : pats.some(re => re.test(c.msg)));
  if (hit.length) return { level: 'mentioned', commits: hit };
  if (it.kind === 'discussion' && it.repo !== MINE) { // commit messages name a discussion by what it asked for: two of its title's words in one that says "discussion"
    const words = it.title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !/^(support|with|from|that|this|games?|based|custom|their)$/.test(w));
    const maybe = commits.filter(c => /discussion/i.test(c.msg) && words.filter(w => c.msg.toLowerCase().includes(w)).length >= Math.min(2, words.length));
    if (maybe.length && words.length) return { level: 'maybe', commits: maybe };
  }
  return { level: '', commits: [] };
}

// ---------- what you said you'd do ----------
// a message of yours that promises something (it'll be in the next release, you'll add / fix / look at it) stays "open" until a
// later message of yours in the same conversation says it's out (released, "it's out", "is in <version>", "shipped")
const PROMISE = /\b(next release|upcoming release|next version|going into the next|will be (in|added|fixed)|i'?ll (add|fix|look|make|check|follow|do|try|bring|work)|will do|on my list|haven'?t forgotten|i'm (going to|beginning to) (add|work|look))\b/i;
const TOLD_OUT = /\b(it'?s out|is out|out now|released|shipped|it'?s in (the )?(\(T\)rustyShelf )?\d+\.\d+|is in (the )?(\(T\)rustyShelf )?\d+\.\d+(\.\d+)*( release)?|out in \d+\.\d+|in the (\(T\)rustyShelf )?\d+\.\d+(\.\d+)* release|release \(?v?\d+\.\d+|releases\/tag\/v?\d+)\b/i;
function promisesOf(it) {
  const mine = it.messages.filter(m => isMe(m.author)), open = [];
  // (an offer that waits for the other person isn't a promise: "if …, tell me … and I'll look")
  const COND = /^\s*if\b|\b(tell me|let me know)\b[^.!?]{0,120}\band i'?ll\b/i;
  for (const m of mine) { const t = plain(m.body), said = t.split(/(?<=[.!?])\s+/).filter(x => PROMISE.test(x) && !COND.test(x)); if (!said.length) continue;
    const told = mine.some(x => String(x.at) > String(m.at) && TOLD_OUT.test(plain(x.body)));
    if (!told) open.push({ at: m.at, url: m.url, text: said.join(' ').slice(0, 300) }); }
  return open;
}

// ---------- how you write (tone.md) ----------
// what someone actually wrote: no quoted text, no code blocks, no tags, and no e-mail tail (a reply sent by e-mail carries the
// message it answers: "On … wrote:", "Il … ha scritto:", "Le … a écrit :", "Am … schrieb …:", "El … escribió:", and GitHub's footer)
const MAIL_TAIL = /^\s*(on|il|le|am|el|em|op|w dniu)\b.{5,200}\b(wrote|ha scritto|a écrit|schrieb|escribió|escreveu|schreef|napisał)\b.{0,80}:\s*$/i;
function plain(s) {
  const lines = String(s || '').replace(/```[\s\S]*?```/g, ' ').split(/\r?\n/), cut = lines.findIndex(l => MAIL_TAIL.test(l) || /^\s*Reply to this email directly/i.test(l));
  return (cut > 0 ? lines.slice(0, cut) : lines).filter(l => !/^\s*>/.test(l)).join('\n').replace(/<[^>]+>/g, ' ').trim();
}
function toneMd(mine, at, rules) {
  const texts = mine.map(m => plain(m.body)).filter(Boolean), n = texts.length;
  const pct = f => n ? Math.round(100 * texts.filter(f).length / n) : 0;
  const words = texts.map(t => t.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b), q = p => words[Math.min(words.length - 1, Math.floor(p * words.length))] || 0;
  const sents = texts.flatMap(t => t.split(/(?<=[.!?])\s+/).filter(s => s.trim()));
  const sentLen = sents.length ? Math.round(sents.reduce((a, s) => a + s.split(/\s+/).length, 0) / sents.length) : 0;
  const count = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const openers = count(texts, t => { const w = t.split(/\s+/).filter(Boolean).slice(0, 4), out = []; // (up to the first punctuation mark, at most 4 words)
    for (const x of w) { out.push(x); if (/[,.!:?]$/.test(x)) break; } return out.length === 4 && !/[,.!:?]$/.test(out[3]) ? out.slice(0, 3).join(' ') + ' …' : out.join(' '); }).slice(0, 12);
  const lastSent = t => { const s = t.split(/(?<=[.!?])\s+/).filter(x => x.trim()); return s[s.length - 1] || ''; };
  const ending = count(texts, t => { const l = lastSent(t);
    return /\?$/.test(l) && /\b(try|tell me|let me know|could you|can you)\b/i.test(l) ? 'asks them to try it / tell how it goes (a question)'
      : /\b(tell me|let me know)\b/i.test(l) ? 'invites them to tell you how it goes' : /\bfeel free|welcome\b/i.test(l) ? 'invites them to open issues / pull requests'
      : /\b(glad|thanks|thank you|have fun|keep it up)\b/i.test(l) ? 'thanks / warm sign-off' : /\?$/.test(l) ? 'another question' : 'a plain statement of what is done'; });
  const PHR = [['the (T)rustyShelf fork', /the \(T\)rustyShelf fork/i], ['"(T)rustyShelf" by name', /\(T\)rustyShelf/], ['a Settings → path', /Settings →/], ['a version or release', /\b\d+\.\d+(\.\d+){0,2}\b|\brelease\b/i],
    ['"tell me" / "let me know"', /\b(tell me|let me know)\b/i], ['"could you try"', /\bcould you\b|\btry\b/i], ['"feel free"', /\bfeel free\b/i], ['an exclamation mark', /!/], ['a question mark', /\?/],
    ['contractions (it\'s, I\'ll, don\'t)', /\b\w+'(s|re|ll|d|ve|t|m)\b/i], ['"I" (first person)', /\bI\b/], ['a link', /https?:\/\/|\]\(/], ['markdown (bold, lists, code)', /\*\*|^\s*[-*]\s|`/m], ['emoji', /\p{Extended_Pictographic}/u],
    ['a long dash (— or –)', /[—–]/], ['honesty about limits ("I can only", "couldn\'t test")', /\b(can only|cannot test|can't test|couldn't|haven't been able|not on a real)\b/i], ['credit to other people ("by …", "thanks to")', /\bby [A-Z@]\w+|\bthanks to\b|\bcredited\b/]];
  const L = [`# How ${ME} writes on GitHub`, '',
    `Worked out from all ${n} of ${ME}'s comments and replies collected by scripts/community-report.js (rebuilt whenever a new one appears; last ${String(at).slice(0, 16).replace('T', ' ')} UTC). The opening posts of ${ME}'s own pull requests are left out: they're technical write-ups, not replies to people.`, '',
    ...(rules ? ['## Rules ' + ME + ' set (always follow these)', '', rules.replace(/^#[^\n]*\n+/, '').trim(), ''] : []),
    '## In short', ''];
  if (!n) { L.push('No comments yet.'); return L.join('\n') + '\n'; }
  const greet = pct(t => /^\s*(hey|hi|hello)\b/i.test(t)), ex = pct(t => /!/.test(t)), ctr = pct(t => /\b\w+'(s|re|ll|d|ve|t|m)\b/i.test(t)), md = pct(t => /\*\*|^\s*[-*]\s|`/m.test(t)), emo = pct(t => /\p{Extended_Pictographic}/u.test(t)), dash = pct(t => /[—–]/.test(t));
  L.push(`- Short and plain: most replies are ${q(.25)}–${q(.75)} words (median ${q(.5)}), in sentences of about ${sentLen} words. One paragraph, rarely two.`);
  L.push(`- Friendly and direct, written in the first person, like talking to someone: contractions in ${ctr}% of replies${greet >= 20 ? `; opens with "Hey" / "Hi" in ${greet}%` : ''}.`);
  L.push(`- Goes straight to what's new (it's done or out, why it happened, how to use it), in everyday words, without restating what the person just wrote; says where to find it (a Settings → path in ${pct(t => /Settings →/.test(t))}%), names the fork as "the (T)rustyShelf fork" (${pct(t => /the \(T\)rustyShelf fork/i.test(t))}%) and the version or release it's in (${pct(t => /\b\d+\.\d+(\.\d+){0,2}\b|\brelease\b/i.test(t))}%).`);
  L.push(`- Ends by asking the person to try it and say how it goes, or with a warm line (see "How replies end" below).`);
  L.push(`- Exclamation marks in ${ex}% of replies, for warmth ("Good idea!", "Thanks!", "It's out now!")${emo ? '' : '; no emoji'}${md <= 15 ? '; almost no markdown (no headings, bold or lists)' : ''}${dash <= 5 ? '; no long dashes: commas, colons and full stops instead' : ''}.`);
  if (pct(t => /\b(can only|cannot test|can't test|couldn't|haven't been able|not on a real)\b/i.test(t))) L.push('- Honest about what couldn\'t be checked (for example only Linux at hand), and asks the person to confirm on their machine.');
  if (pct(t => /\bby [A-Z@]\w+|\bthanks to\b|\bcredited\b/.test(t))) L.push('- Credits people by name when their work or idea is used.');
  L.push('- Doesn\'t oversell: no marketing words, no promises of dates.', '');
  L.push('## How replies open', '', '| Opening | Replies |', '|---|---|', ...openers.map(([k, v]) => `| ${k.replace(/\|/g, '\\|')} | ${v} |`), '');
  L.push('## How replies end', '', '| Last sentence | Replies |', '|---|---|', ...ending.map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('## Habits (share of replies)', '', '| Has | % |', '|---|---|', ...PHR.map(([k, re]) => `| ${k} | ${pct(t => re.test(t))} |`), '');
  L.push(`## All ${ME}'s comments (newest first)`, '');
  for (const m of [...mine].sort((a, b) => String(b.at).localeCompare(String(a.at)))) L.push(`### ${String(m.at).slice(0, 16).replace('T', ' ')} · ${m.where} · [link](${m.url})`, '', plain(m.body).split('\n').map(l => '> ' + l).join('\n'), '');
  return L.join('\n') + '\n';
}

// ---------- the report ----------
const esc = s => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const day = s => String(s || '').slice(0, 10), when = s => String(s || '').slice(0, 16).replace('T', ' ');
function excerpt(s, n = 280) { const t = String(s || '').replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; }
const KIND_NAME = { bug: 'Bugs people report (fix)', feature: 'Features people ask for (add)', change: 'Changes people ask for (modify)', removal: 'Things people want gone (remove)', question: 'Questions', code: 'Pull requests (code someone wrote)', other: 'Other' };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const kindsFor = r => [...(r.has_issues ? ['issues'] : []), 'pulls', ...(r.has_discussions ? ['discussions'] : [])];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(); console.log(`Community report → ${OUT}`);
  const data = { at: new Date().toISOString(), me: ME, mine: MINE, repos: [], items: [], forks: [], notifications: { threads: [], other: [] }, elsewhere: { repos: [], conversations: [], code: [], projects: [], skipped: [] } };
  const cacheFile = path.join(OUT, 'cache.json'), cache = readJson(cacheFile, {}); cache.readme = cache.readme || {}; cache.work = cache.work || {};
  const known = new Set([...REPOS, MINE]);

  // ---- everything that doesn't depend on anything else, at the same time ----
  const reposP = Promise.all([MINE, ...REPOS].map(async full => {
    const r = await rest(`repos/${full}`); if (!r) { console.error(`  ${full}: not found`); return null; }
    const own = full === MINE, info = { full, own, branch: r.default_branch, issues: r.has_issues, discussions: r.has_discussions, stars: r.stargazers_count, forks: r.forks_count, pushed: r.pushed_at };
    const got = await conversations(full, kindsFor(r), own ? { own: true } : {});
    console.log(`  ${full}${own ? ' (yours)' : ''}: ${got.length} issues / pull requests / discussions, ${got.reduce((a, it) => a + it.messages.length, 0)} messages`);
    return { info, got };
  }));
  const searchP = SEARCH ? (async () => {
    const [repos, convs] = await Promise.all([restAll(`search/repositories?q=${encodeURIComponent(WORD)}+in:name,description,readme`, 300), restAll(`search/issues?q=${encodeURIComponent(WORD)}`, 300)]);
    await Promise.all(repos.map(async r => { // its README too (a description alone rarely says what it is), asked again only when the repository changed
      if (REPOS.includes(r.full_name) || r.full_name === MINE) return;
      const c = cache.readme[r.full_name];
      if (c && c.pushed === r.pushed_at) { r._readme = c.text; return; }
      let text = ''; try { const x = await rest(`repos/${r.full_name}/readme`); text = x && x.content ? Buffer.from(x.content, 'base64').toString('utf8').slice(0, 20000) : ''; } catch {}
      cache.readme[r.full_name] = { pushed: r.pushed_at, text }; r._readme = text;
    }));
    const by = new Map();
    for (const q of CODE_QUERIES) { try { for (const c of await restAll(`search/code?q=${encodeURIComponent(q)}`, 200)) { const r = c.repository && c.repository.full_name; if (!r) continue; if (!by.has(r)) by.set(r, new Set()); by.get(r).add(c.path); } } catch (e) { console.error(`  code search ${q}: ${e.message}`); } await sleep(1200); }
    return { repos, convs, code: by };
  })() : null;
  const notesP = NOTIFY ? restAll(`notifications?all=true&since=${new Date(Date.now() - 30 * 864e5).toISOString()}`, 500).catch(e => { console.error('  notifications:', e.message); return []; }) : null;

  const repoRes = (await reposP).filter(Boolean);
  for (const { info, got } of repoRes) { data.repos.push(info); data.items.push(...got); }

  if (FORKS) {
    const seen = new Set(known), roots = data.repos;
    const lists = await Promise.all(roots.map(root => forksOf(root.full, DEPTH, seen).then(forks => ({ root, forks }))));
    const all = lists.flatMap(({ root, forks }) => forks.filter(f => f.full !== MINE).map(f => Object.assign(f, { root: root.full, rootBranch: root.branch, ofMine: root.own })));
    const counts = await convCounts(all.map(f => f.full));
    await Promise.all(all.map(async f => {
      const [work, own] = await Promise.all([forkWork(f.root, f.rootBranch, f, cache), counts[f.full].length ? conversations(f.full, counts[f.full], { fork: f.full, ...(f.ofMine ? { forkOfMine: true } : {}) }) : []]);
      f.work = work; data.items.push(...own); known.add(f.full);
      delete f.rootBranch; f.conversations = own.length;
    }));
    data.forks.push(...all);
    for (const { root } of lists) { const fs_ = all.filter(f => f.root === root.full); console.log(`  forks of ${root.full}: ${fs_.length} (${fs_.filter(f => f.work.length).length} with commits of their own, ${fs_.reduce((a, f) => a + f.conversations, 0)} conversations)`); }
  }

  if (searchP) {
    const s = await searchP, isKnown = r => known.has(r) || data.forks.some(f => f.full === r);
    for (const r of s.repos) { if (isKnown(r.full_name)) continue;
      const text = `${r.full_name} ${r.description || ''} ${r._readme || ''}`, about = ABOUT.test(text);
      (about ? data.elsewhere.repos : data.elsewhere.skipped).push({ full: r.full_name, url: r.html_url, description: r.description || '', stars: r.stargazers_count, pushed: r.pushed_at, fork: r.fork, derived: about && DERIVED.test(text) }); }
    for (const i of s.convs) { const repo = (i.repository_url || '').split('/repos/')[1]; if (isKnown(repo)) continue;
      const c = { repo, url: i.html_url, title: i.title, kind: i.pull_request ? 'pull' : 'issue', state: i.state, author: i.user && i.user.login, created: i.created_at, body: i.body || '' };
      (ABOUT.test(`${c.repo} ${c.title} ${c.body}`) ? data.elsewhere.conversations : data.elsewhere.skipped).push(c); }
    data.elsewhere.code = [...s.code].filter(([repo]) => !isKnown(repo)).map(([repo, files]) => ({ repo, url: `https://github.com/${repo}`, files: [...files].slice(0, 10) }));
    // projects built from Boxshelf that aren't GitHub forks (a copy, a port): their recent commits and conversations, like a fork's
    // (only projects that say they're made from Boxshelf: a catalog that lists it, like an AppImage package manager, isn't one)
    await Promise.all([...new Set(data.elsewhere.repos.filter(r => r.derived && !r.fork).map(r => r.full))].map(async full => {
      const r = await rest(`repos/${full}`); if (!r) return;
      const [commits, own] = await Promise.all([restAll(`repos/${full}/commits`, 40), conversations(full, kindsFor(r), { fork: full + ' (related project)' })]);
      data.items.push(...own);
      data.elsewhere.projects.push({ full, url: r.html_url, description: r.description || '', pushed: r.pushed_at, stars: r.stargazers_count,
        commits: commits.slice(0, 40).map(x => ({ sha: x.sha.slice(0, 9), author: (x.author && x.author.login) || (x.commit.author && x.commit.author.name), date: x.commit.author && x.commit.author.date, message: x.commit.message.split('\n')[0] })) });
    }));
    console.log(`  elsewhere: ${data.elsewhere.repos.length} repositories, ${data.elsewhere.conversations.length} issues / pull requests, ${data.elsewhere.code.length} repositories with code, ${data.elsewhere.projects.length} related projects read (${data.elsewhere.skipped.length} results about something else left out)`);
  }

  // ---- notifications: anything that involves you; a conversation not read above is read now ----
  if (notesP) {
    const notes = await notesP, byKey = new Map(data.items.map(it => [it.key, it]));
    await Promise.all(notes.map(async nt => {
      const repo = nt.repository && nt.repository.full_name, type = nt.subject && nt.subject.type, title = nt.subject && nt.subject.title;
      const base = { repo, type, title, reason: nt.reason, unread: !!nt.unread, updated: nt.updated_at };
      if (!['Issue', 'PullRequest', 'Discussion'].includes(type)) { data.notifications.other.push(base); return; }
      let key = '', num = 0;
      if (nt.subject.url) { const m = /\/repos\/([^/]+\/[^/]+)\/(issues|pulls)\/(\d+)/.exec(nt.subject.url); if (m) { num = +m[3]; key = `https://github.com/${m[1]}/${m[2] === 'pulls' ? 'pull' : 'issues'}/${num}`; } }
      let it = key ? byKey.get(key) : [...byKey.values()].find(x => x.repo === repo && x.kind === 'discussion' && x.title === title);
      if (!it && type === 'Discussion' && repo) { // a discussion: found by its title among the repository's latest
        const [o, n] = repo.split('/'); const d = await gql(`query($o:String!,$n:String!){ repository(owner:$o,name:$n){ discussions(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){ nodes{ number title } } } }`, { o, n }).catch(() => null);
        const hit = d && d.repository && d.repository.discussions.nodes.find(x => x.title === title); if (hit) num = hit.number;
        if (num) it = await oneThread(repo, num, 'discussions');
      } else if (!it && num) it = await oneThread(repo, num, type === 'PullRequest' ? 'pulls' : 'issues');
      if (it && !byKey.has(it.key)) { it.via = 'notification'; byKey.set(it.key, it); data.items.push(it); }
      data.notifications.threads.push({ ...base, key: it ? it.key : key || '' });
    }));
    console.log(`  notifications: ${data.notifications.threads.length} about conversations (${data.notifications.threads.filter(x => x.unread).length} unread), ${data.notifications.other.length} other`);
  }

  // ---- sort, mark, compare with last time ----
  fetchTags(); const commits = myCommits(), seenFile = path.join(OUT, 'seen.json'), doneFile = path.join(OUT, 'done.json');
  const before = readJson(seenFile, null), done = readJson(doneFile, {});
  if (!fs.existsSync(doneFile)) fs.writeFileSync(doneFile, JSON.stringify({ '(example) https://github.com/owner/repo/issues/1': { status: 'done', note: 'what was done, or why not', until: '2026-01-01' } }, null, 2) + '\n');
  const prevMsgs = before && before.messages; // (an older seen.json counted comments only: then a message is new when it's newer than that report)
  const isNewMsg = m => prevMsgs ? !(m.id in prevMsgs) : before ? String(m.at) > String(before.at) : false;
  const wasEdited = m => !!(prevMsgs && m.id in prevMsgs && m.edited && m.edited !== prevMsgs[m.id]);
  const release = latestRelease();
  for (const it of data.items) {
    it.type = kindOf(it); it.asks = [...asks(`${it.title}. ${it.body}`), ...it.comments.filter(c => !isMe(c.author)).flatMap(c => asks(c.body).map(s => `${c.author}: ${s}`))].slice(0, 8);
    const men = mentioned(it, commits); it.mine = men.level;
    it.done = men.commits.slice(0, 8).map(c => ({ sha: c.sha.slice(0, 9), date: c.date, subject: c.subject, release: releaseOf(c.sha) }));
    const d = done[it.key] || {}; it.status = d.status || ''; it.note = d.note || '';
    const had = !!(before && before.items && it.key in before.items);
    it.isNew = before ? !had : false;
    for (const m of it.messages) { m.isNew = !it.isNew && isNewMsg(m); m.wasEdited = wasEdited(m); }
    it.hasNewComments = it.messages.some(m => m.isNew);
    // waiting for you: written (by someone else, not a bot) after your last message in this conversation, or you never wrote here
    const lastMine = it.messages.filter(m => isMe(m.author)).reduce((a, m) => (String(m.at) > a ? String(m.at) : a), '');
    it.lastMine = lastMine;
    it.waiting = it.messages.filter(m => !isMe(m.author) && !isBot(m.author) && !m.hidden && String(m.at) > lastMine && !(m.type === 'post' && isMe(it.author)))
      .filter(m => !(['skip', 'answered'].includes(it.status) && (!d.until || String(m.at) <= String(d.until))));
    for (const m of it.waiting) if (THANKS.test(plain(m.body))) m.thanks = true;
    // done in (T)rustyShelf after your last message here: maybe they don't know yet
    it.notTold = it.done.filter(c => String(c.date) > lastMine && !isMe(it.author));
    it.promises = ['done', 'skip'].includes(it.status) ? [] : promisesOf(it); // (what you said you'd do here, not told as out yet)
  }
  const shown = data.items.filter(it => !SINCE || new Date(it.updated || it.created) >= SINCE);

  // ---- tone.md: rebuilt whenever you've written something new (or it isn't there yet) ----
  const where = it => it.repo === MINE ? `(T)rustyShelf ${it.kind} #${it.number}` : `${it.fork ? `${it.fork} (fork)` : it.repo.split('/')[1]} ${it.kind} #${it.number}`;
  const mineMsgs = data.items.flatMap(it => it.messages.filter(m => isMe(m.author) && !(m.type === 'post' && it.kind === 'pull')).map(m => ({ ...m, where: `${where(it)}: ${it.title}` })));
  const toneHash = crypto.createHash('sha1').update(mineMsgs.map(m => m.id + (m.edited || '')).sort().join(',')).digest('hex');
  const rulesFile = path.join(OUT, 'tone-rules.md');
  if (!fs.existsSync(rulesFile)) fs.writeFileSync(rulesFile, TONE_RULES);
  const rules = (() => { try { return fs.readFileSync(rulesFile, 'utf8'); } catch { return ''; } })();
  const rulesHash = crypto.createHash('sha1').update(rules).digest('hex');
  const toneFile = path.join(OUT, 'tone.md'), toneNew = TONE_ALWAYS || !fs.existsSync(toneFile) || !before || before.tone !== toneHash || before.toneRules !== rulesHash;
  if (toneNew) fs.writeFileSync(toneFile, toneMd(mineMsgs, data.at, rules));

  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data, null, 1));
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  fs.writeFileSync(seenFile, JSON.stringify({ version: 2, at: data.at, tone: toneHash, toneRules: rulesHash,
    items: Object.fromEntries(data.items.map(it => [it.key, it.messages.length - 1])), messages: Object.fromEntries(data.items.flatMap(it => it.messages.map(m => [m.id, m.edited || '']))),
    forks: Object.fromEntries(data.forks.map(f => [f.full, f.work.flatMap(w => w.commits.map(c => c.sha))])) }, null, 1));

  // ---- to-answer.md / to-answer.json: for the AI that answers ----
  const waitingItems = data.items.filter(it => it.waiting.length).sort((a, b) => String(b.waiting[b.waiting.length - 1].at).localeCompare(String(a.waiting[a.waiting.length - 1].at)));
  const notToldItems = data.items.filter(it => !it.waiting.length && it.notTold.length && !['skip', 'answered'].includes(it.status));
  const howToReply = (it, m) => it.kind === 'discussion'
    ? { how: 'discussion', discussionId: it.nodeId, replyToId: m && m.type === 'reply' ? m.parent : m && m.type === 'comment' ? m.id : null,
        command: `gh api graphql -f query='mutation($d:ID!,$r:ID,$b:String!){addDiscussionComment(input:{discussionId:$d,replyToId:$r,body:$b}){comment{url}}}' -f d=${it.nodeId}${m && m.type !== 'post' ? ` -f r=${m.type === 'reply' ? m.parent : m.id}` : ''} -f b="$(cat reply.md)"` }
    : { how: it.kind, command: `gh ${it.kind === 'pull' ? 'pr' : 'issue'} comment ${it.number} -R ${it.repo} --body-file reply.md` };
  const answerJson = waitingItems.map(it => ({ key: it.key, where: where(it), title: it.title, kind: it.kind, type: it.type, state: it.state, yours: it.repo === MINE, decided: it.status ? { status: it.status, note: it.note } : null, promises: it.promises, poll: it.poll || null, markedAnswered: !!it.answered,
    waiting: it.waiting.map(m => ({ author: m.author, at: m.at, url: m.url, type: m.type, text: plain(m.body), body: m.body, thanks: !!m.thanks, isNew: m.isNew })),
    reply: howToReply(it, it.waiting[it.waiting.length - 1]), doneInTrustyShelf: it.done, conversation: it.messages.map(m => ({ author: m.author, at: m.at, type: m.type, url: m.url, text: plain(m.body) })) }));
  const promised = data.items.filter(it => it.promises.length);
  fs.writeFileSync(path.join(OUT, 'to-answer.json'), JSON.stringify({ at: data.at, me: ME, latestRelease: release, tone: 'tone.md', threads: answerJson, promised: promised.map(it => ({ key: it.key, where: where(it), title: it.title, promises: it.promises })),
    notTold: notToldItems.map(it => ({ key: it.key, where: where(it), title: it.title, lastMine: it.lastMine, done: it.notTold, reply: howToReply(it, null) })) }, null, 1));
  const T = [`# Waiting for an answer from ${ME}`, '', `Made ${when(data.at)} UTC by scripts/community-report.js. Latest (T)rustyShelf release: ${release || '(none)'}.`, '',
    `For the AI that answers: reply in ${ME}'s voice, as described in tone.md (next to this file; it starts with the rules ${ME} set, then quotes all of ${ME}'s comments). For each thread below: read the whole conversation, check what (T)rustyShelf already did (commits, and the release they're in, or "not released yet"), and decide whether a reply is needed (a plain "thanks, it works" may need none). Post with the command given (the reply's text in reply.md). After posting, run the script again: the thread leaves this list and tone.md is rebuilt.`, ''];
  if (!waitingItems.length) T.push('Nothing is waiting for an answer.', '');
  for (const it of waitingItems) {
    const last = it.waiting[it.waiting.length - 1];
    T.push(`## [${esc(it.title)}](${it.url})`, '', `${where(it)} · ${it.kind === 'pull' ? 'pull request' : it.kind} · ${it.state} · ${it.type}${it.repo === MINE ? ' · **your repository**' : ''}${it.via ? ' · found through your notifications' : ''}`, '');
    if (it.note || it.status) T.push(`Decided before: ${it.status || ''}${it.note ? ` (${esc(it.note)})` : ''}`, '');
    if (it.promises.length) T.push(`You promised here: ${it.promises.map(p => `"${esc(p.text)}" (${when(p.at)})`).join('; ')}`, '');
    if (it.poll) T.push(`Poll: ${esc(it.poll.question)}: ${it.poll.options.map(o => `${esc(o.option)} ${o.votes}`).join(', ')} (${it.poll.votes} votes)`, '');
    if (it.answered) T.push('Marked as answered on GitHub.', '');
    T.push(`Waiting: ${it.waiting.map(m => `${m.author} (${when(m.at)}${m.isNew ? ', new' : ''}${m.thanks ? ', a thanks' : ''})`).join(', ')}${it.lastMine ? ` · your last message: ${when(it.lastMine)}` : ' · you haven\'t written here yet'}`, '');
    T.push(it.done.length ? `(T)rustyShelf did: ${it.done.map(c => `${c.sha} "${esc(c.subject)}" (${day(c.date)}, ${c.release ? 'in ' + c.release : 'not released yet'})`).join('; ')}` : '(T)rustyShelf did: nothing that names this thread in a commit (check by hand: it may be done under another name).', '');
    T.push(`Reply: \`${howToReply(it, last).command}\``, '', 'Conversation:', '');
    for (const m of it.messages) T.push(`- **${m.author}**${isMe(m.author) ? ' (you)' : ''}, ${when(m.at)}, ${m.type}${m.type === 'reply' ? ' (under a comment)' : ''}${m.path ? ` on ${m.path}` : ''}${it.waiting.includes(m) ? ' · **waiting**' : ''} · [link](${m.url})`, '', plain(m.body).split('\n').map(l => '  > ' + l).join('\n') || '  > (empty)', '');
  }
  if (notToldItems.length) {
    T.push('# Done in (T)rustyShelf after your last message, maybe not told yet', '');
    for (const it of notToldItems) T.push(`- [${esc(it.title)}](${it.url}) · ${where(it)} · ${it.notTold.map(c => `${c.sha} "${esc(c.subject)}" (${day(c.date)}, ${c.release || 'not released yet'})`).join('; ')} · your last message ${it.lastMine ? when(it.lastMine) : 'none'} · reply: \`${howToReply(it, null).command}\``);
    T.push('');
  }
  if (promised.length) {
    T.push('# Promised by you, not told as out yet', '', 'Your messages that say something will come (the next release, "I\'ll add …"), with no later message of yours in that thread saying it\'s out. When it ships, tell them; when it won\'t, say so, or `--mark <link> skip "why"`.', '');
    for (const it of promised) T.push(`- [${esc(it.title)}](${it.url}) · ${where(it)}: ${it.promises.map(p => `"${esc(p.text)}" (${when(p.at)}, [link](${p.url}))`).join('; ')}`);
    T.push('');
  }
  fs.writeFileSync(path.join(OUT, 'to-answer.md'), T.join('\n') + '\n');

  // ---- report.md ----
  const L = [], status = it => [it.status ? `**${it.status}**${it.note ? ` (${esc(it.note)})` : ''}` : '', it.mine === 'mentioned' ? 'named in (T)rustyShelf commits' : it.mine === 'maybe' ? 'maybe done (a commit names a discussion like it)' : ''].filter(Boolean).join(' · ') || 'open';
  L.push(`# Boxshelf and (T)rustyShelf community report`, '', `Made ${when(data.at)} UTC by scripts/community-report.js in ${Math.round((Date.now() - t0) / 1000)} s (no AI: collected and sorted by keyword rules)${SINCE ? `, showing what changed since ${day(SINCE.toISOString())}` : ''}.`, '');
  L.push(`Read: ${data.repos.map(r => `${r.full}${r.own ? ' (yours)' : ''} (${r.stars}★, ${r.forks} forks)`).join(', ')}; ${data.forks.length} forks; ${data.items.length} conversations with ${data.items.reduce((a, it) => a + it.messages.length, 0)} messages; ${data.notifications.threads.length} notifications; ${calls} API calls.${toneNew ? ' tone.md rebuilt (new comments from you).' : ''}`, '');
  L.push(`## Waiting for your answer (${waitingItems.length})`, '', waitingItems.length ? 'Everything is in to-answer.md, with the whole conversations and how to reply.' : 'Nothing.', '');
  for (const it of waitingItems) { L.push(`- [${esc(it.title)}](${it.url}) · ${where(it)}${it.repo === MINE ? ' · **your repository**' : ''} · ${it.type}`);
    for (const m of it.waiting) L.push(`  - ${m.author}, ${when(m.at)}${m.isNew ? ' · **new**' : ''}${m.thanks ? ' · a thanks' : ''}: ${esc(excerpt(plain(m.body), 400))} ([link](${m.url}))`); }
  if (waitingItems.length) L.push('');
  if (notToldItems.length) { L.push(`## Done in (T)rustyShelf, maybe not told yet (${notToldItems.length})`, ''); for (const it of notToldItems) L.push(`- [${esc(it.title)}](${it.url}) · ${where(it)} · ${it.notTold.map(c => `${c.sha} ${esc(c.subject)} (${c.release || 'not released yet'})`).join('; ')}`); L.push(''); }
  const promisedR = data.items.filter(it => it.promises.length);
  if (promisedR.length) { L.push(`## Promised by you, not told as out yet (${promisedR.length})`, ''); for (const it of promisedR) L.push(`- [${esc(it.title)}](${it.url}) · ${where(it)}: ${it.promises.map(p => `"${esc(excerpt(p.text, 160))}" (${day(p.at)})`).join('; ')}`); L.push(''); }
  const open = shown.filter(it => !['done', 'skip'].includes(it.status) && it.state !== 'closed' && it.state !== 'merged' || (it.kind === 'pull' && !it.mine && !it.status));
  if (before) {
    L.push(`## New since the last report (${when(before.at)} UTC)`, '');
    const newThreads = shown.filter(it => it.isNew), newMsgs = shown.flatMap(it => it.messages.filter(m => m.isNew).map(m => ({ it, m }))), edits = shown.flatMap(it => it.messages.filter(m => m.wasEdited).map(m => ({ it, m })));
    const others = newMsgs.filter(x => !isMe(x.m.author)), yours = newMsgs.filter(x => isMe(x.m.author));
    if (!newThreads.length && !newMsgs.length && !edits.length) L.push('Nothing new.', '');
    if (newThreads.length) { L.push(`New conversations (${newThreads.length}):`, ''); for (const it of newThreads) L.push(`- [${esc(it.title)}](${it.url}) · ${where(it)} · by ${it.author} on ${when(it.created)} · ${it.type}: ${esc(excerpt(it.body, 300))}`); L.push(''); }
    if (others.length) { L.push(`New messages from other people (${others.length}):`, ''); for (const { it, m } of others) L.push(`- ${m.author}, ${when(m.at)}, in [${esc(it.title)}](${it.url}) (${where(it)}): ${esc(excerpt(plain(m.body), 300))} ([link](${m.url}))`); L.push(''); }
    if (yours.length) { L.push(`New messages from you (${yours.length}):`, ''); for (const { it, m } of yours) L.push(`- ${when(m.at)}, in [${esc(it.title)}](${it.url}) (${where(it)}): ${esc(excerpt(m.body, 160))}`); L.push(''); }
    if (edits.length) { L.push(`Edited since last time (${edits.length}):`, ''); for (const { it, m } of edits) L.push(`- ${m.author}, edited ${when(m.edited)}, in [${esc(it.title)}](${it.url}): ${esc(excerpt(m.body, 200))} ([link](${m.url}))`); L.push(''); }
  }
  if (NOTIFY) {
    const un = data.notifications.threads.filter(x => x.unread), outside = data.notifications.threads.filter(x => !x.key || data.items.find(it => it.key === x.key && it.via === 'notification'));
    L.push(`## Your GitHub notifications, last 30 days (${data.notifications.threads.length} about conversations, ${un.length} unread)`, '');
    if (outside.length) { L.push('Conversations found only through notifications (read above, outside the repositories this report covers):', ''); for (const x of outside) L.push(`- ${x.repo} ${x.type}: ${esc(x.title)} (${x.reason}${x.unread ? ', unread' : ''}, ${when(x.updated)})${x.key ? ` · ${x.key}` : ''}`); L.push(''); }
    if (un.length) { L.push('Unread:', ''); for (const x of un) L.push(`- ${x.repo} ${x.type}: ${esc(x.title)} (${x.reason}, ${when(x.updated)})${x.key ? ` · ${x.key}` : ''}`); L.push(''); }
    if (data.notifications.other.length) { L.push('Other notifications (builds, releases):', ''); for (const x of data.notifications.other.slice(0, 15)) L.push(`- ${x.repo} ${x.type}: ${esc(x.title)} (${x.reason}${x.unread ? ', unread' : ''}, ${when(x.updated)})`); L.push(''); }
  }
  L.push('## At a glance', '', '| Kind | Open | Of which not named in (T)rustyShelf yet |', '|---|---|---|');
  for (const k of Object.keys(KIND_NAME)) { const a = open.filter(it => it.type === k); if (a.length) L.push(`| ${KIND_NAME[k]} | ${a.length} | ${a.filter(it => !it.mine && !it.status).length} |`); }
  const forkCommits = data.forks.reduce((a, f) => a + f.work.reduce((b, w) => b + w.commits.length, 0), 0);
  L.push(`| Fork commits not in the original | ${forkCommits} (in ${data.forks.filter(f => f.work.length).length} forks) | |`, '');
  for (const k of Object.keys(KIND_NAME)) {
    const list = shown.filter(it => it.type === k).sort((a, b) => (b.repo === MINE) - (a.repo === MINE) || (!!a.status - !!b.status) || (!!a.mine - !!b.mine) || (b.plus - a.plus) || (b.comments.length - a.comments.length) || String(b.created).localeCompare(a.created));
    if (!list.length) continue;
    L.push(`## ${KIND_NAME[k]} (${list.length})`, '');
    for (const it of list) {
      L.push(`### [${esc(it.title)}](${it.url})`, '', `${where(it)} · ${it.state} · by ${it.author || '?'} on ${day(it.created)} · 👍 ${it.plus} · ${it.comments.length} comments${it.labels.length ? ' · ' + it.labels.join(', ') : ''}${it.category ? ' · ' + it.category : ''} · status: ${status(it)}${it.waiting.length ? ' · **waiting for your answer**' : ''}`, '');
      if (excerpt(it.body)) L.push(`> ${excerpt(it.body)}`, '');
      if (it.poll) L.push(`Poll: ${esc(it.poll.question)}: ${it.poll.options.map(o => `${esc(o.option)} ${o.votes}`).join(', ')} (${it.poll.votes} votes)`, '');
      if (it.asks.length) { L.push('What is asked / reported:'); for (const a of it.asks) L.push(`- ${esc(a)}`); L.push(''); }
      if (it.done.length) L.push(`(T)rustyShelf: ${it.done.map(c => `${c.sha} ${esc(c.subject)} (${c.release || 'not released yet'})`).join('; ')}`, '');
      if (it.kind === 'pull') { L.push(`Code: ${it.head} → ${it.base}, +${it.additions} −${it.deletions}${it.commits.length ? `; commits: ${it.commits.slice(0, 8).map(esc).join(' · ')}` : ''}`, ''); if (it.files.length) L.push(`Files: ${it.files.slice(0, 20).map(esc).join(', ')}`, ''); }
    }
  }
  L.push('## Forks: work not in the original', '');
  const withWork = data.forks.filter(f => f.work.length).sort((a, b) => String(b.pushed).localeCompare(a.pushed));
  if (!withWork.length) L.push('No fork has commits of its own.', '');
  const lastForks = (before && before.forks) || {}, allMsgs = commits ? commits.map(c => c.msg).join('\0') : '';
  for (const f of withWork) {
    const named = allMsgs && new RegExp(`\\b${f.owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(allMsgs);
    L.push(`### [${f.full}](https://github.com/${f.full}) (fork of ${f.root}${f.parent !== f.root ? ` via ${f.parent}` : ''}${f.ofMine ? ', **a fork of yours**' : ''}, last push ${day(f.pushed)})${named ? ' · its owner is named in (T)rustyShelf commits (ported?)' : ''}`, '');
    if (f.description) L.push(`> ${esc(f.description)}`, '');
    for (const w of f.work) {
      L.push(`Branch \`${w.branch}\`: ${w.ahead} commits ahead, ${w.behind} behind · [compare](${w.url})`, '');
      for (const c of w.commits) L.push(`- ${c.sha} ${esc(c.message)} (${c.author || '?'}, ${day(c.date)})${before && !(lastForks[f.full] || []).includes(c.sha) ? ' · **new**' : ''}${commits && commits.some(x => x.sha.startsWith(c.sha)) ? ' · in (T)rustyShelf' : ''}`);
      L.push('', `Files: ${w.files.slice(0, 30).map(x => `${x.path} (${x.status}, +${x.add} −${x.del})`).join(', ')}${w.files.length > 30 ? ` and ${w.files.length - 30} more` : ''}`, '');
    }
  }
  const noWork = data.forks.filter(f => !f.work.length); if (noWork.length) L.push(`Forks with nothing of their own: ${noWork.map(f => f.full + (before && !(f.full in lastForks) ? ' (**new**)' : '')).join(', ')}.`, '');
  if (SEARCH) {
    L.push('## Elsewhere on GitHub', '');
    if (data.elsewhere.repos.length) { L.push('Repositories:', ''); for (const r of data.elsewhere.repos) L.push(`- [${r.full}](${r.url})${r.fork ? ' (fork)' : ''} · ${r.stars}★ · ${day(r.pushed)}${r.description ? ' · ' + esc(r.description) : ''}`); L.push(''); }
    if (data.elsewhere.conversations.length) { L.push('Issues and pull requests that mention it:', ''); for (const c of data.elsewhere.conversations) L.push(`- [${esc(c.title)}](${c.url}) · ${c.repo} ${c.kind} · ${c.state} · ${c.author || '?'} on ${day(c.created)}${excerpt(c.body, 160) ? ' · ' + esc(excerpt(c.body, 160)) : ''}`); L.push(''); }
    if (data.elsewhere.projects.length) { L.push('Projects built from Boxshelf (not GitHub forks): their latest commits', '');
      for (const p of data.elsewhere.projects) { L.push(`- [${p.full}](${p.url}) · ${p.stars}★ · last push ${day(p.pushed)}${p.description ? ' · ' + esc(p.description) : ''}`); for (const c of p.commits.slice(0, 15)) L.push(`  - ${c.sha} ${esc(c.message)} (${c.author || '?'}, ${day(c.date)})`); } L.push(''); }
    if (data.elsewhere.code.length) { L.push('Code that mentions it:', ''); for (const c of data.elsewhere.code) L.push(`- [${c.repo}](${c.url}): ${c.files.map(esc).join(', ')}`); L.push(''); }
    if (!data.elsewhere.repos.length && !data.elsewhere.conversations.length && !data.elsewhere.code.length) L.push('Nothing outside the repositories and forks above.', '');
    if (data.elsewhere.skipped.length) L.push(`(${data.elsewhere.skipped.length} search results were about other things called box shelf, and are left out; they're in data.json under elsewhere.skipped.)`, '');
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n') + '\n');
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)} s, ${calls} API calls: ${path.join(OUT, 'report.md')}`);
  console.log(`  waiting for your answer: ${waitingItems.length} conversations (${waitingItems.reduce((a, it) => a + it.waiting.length, 0)} messages) → ${path.join(OUT, 'to-answer.md')}${toneNew ? ' · tone.md rebuilt' : ''}`);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
