// Špajz: your own menu music, played in the page. The files come from api.musicList() as addresses (main/music.js: the
// audio files in the Music folder beside the app); they play one after another in a shuffled order, fading in and out, and
// stop whenever the menu music does (a game starts, the window hides, sound is off). Skips a file it can't play.
// UserMusic.start({ level, master }): level = Settings' music volume (0-1), master = the interface volume (0-1);
// called again on every shelf change like Sound.ambientStart (the same call just takes the new volume).
/* global */
(function () {
  'use strict';
  const api = window.trustyshelf;
  let list = null, loading = null, order = [], pos = -1, last = -1, el = null, want = false, vol = 0, target = 0, fadeT = 0, fails = 0, name = '', stopT = 0;

  function load(force) {
    if (!api || !api.musicList) return Promise.resolve([]);
    if (list && !force) return Promise.resolve(list);
    if (loading) return loading;
    loading = (async () => { try { const l = await api.musicList(); list = Array.isArray(l) ? l.filter(x => x && x.url) : []; } catch { list = []; } order = []; pos = -1; fails = 0; loading = null; return list; })();
    return loading;
  }
  function reshuffle() {
    order = list.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (order.length > 1 && order[0] === last) { const j = 1 + Math.floor(Math.random() * (order.length - 1)); [order[0], order[j]] = [order[j], order[0]]; } // (never the same track twice running)
    pos = -1;
  }
  const volumeFor = (level, master) => Math.max(0, Math.min(1, (+level || 0) * 1.4 * (master == null ? .7 : +master)));
  function ramp() { // volume eases toward its target (fades in over ~1.5 s, out over ~0.6 s)
    if (fadeT) return;
    fadeT = setInterval(() => {
      if (!el) { clearInterval(fadeT); fadeT = 0; return; }
      const step = target > vol ? .03 : .08; vol = Math.abs(target - vol) <= step ? target : vol + Math.sign(target - vol) * step;
      try { el.volume = Math.max(0, Math.min(1, vol)); } catch {}
      if (vol === target) { clearInterval(fadeT); fadeT = 0; if (target === 0 && !want) release(); }
    }, 50);
  }
  function release() { if (!el) return; try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} el = null; name = ''; }
  function nextTrack() {
    if (!want || !list || !list.length) return;
    if (pos + 1 >= order.length) reshuffle();
    pos++; last = order[pos]; const t = list[last]; name = t.name || '';
    if (!el) { el = new Audio(); el.preload = 'auto'; el.volume = 0; vol = 0; el.addEventListener('ended', nextTrack); el.addEventListener('error', () => { if (++fails <= list.length) nextTrack(); else { want = false; release(); } }); }
    el.src = t.url;
    const p = el.play(); if (p && p.catch) p.catch(() => { if (++fails <= list.length) setTimeout(nextTrack, 200); });
    ramp();
  }

  function start(o) {
    o = o || {}; clearTimeout(stopT); target = volumeFor(o.level, o.master);
    if (want && el) { ramp(); return; } // already playing: just the new volume
    want = true;
    load().then(l => { if (!want || !l.length) return; if (!el) { fails = 0; nextTrack(); } else ramp(); });
  }
  function stop(quick) {
    want = false; target = 0;
    if (!el) return;
    if (quick) { vol = 0; release(); return; }
    ramp();
  }
  function reload() { return load(true).then(l => { if (want && l.length && !el) nextTrack(); return l.length; }); }
  window.UserMusic = { start, stop, reload, count: () => (list ? list.length : 0),
    state: () => ({ playing: !!(el && !el.paused), track: name, count: list ? list.length : 0, volume: Math.round(vol * 100) / 100, src: el ? el.src : '' }) };
})();
