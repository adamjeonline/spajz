// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0). Written by Thanks2111
// (https://github.com/Thanks2111) in their Boxshelf fork (branch portugues): the Brazilian Portuguese interface. Brought into
// Špajz as a language you choose (the app's Settings → Display → Language: the phone page gets the dictionary only then), English by default.
// Boxshelf em português: traduz a interface enquanto ela é desenhada.
// Os textos em inglês continuam no código; este arquivo troca o que aparece na tela (texto, dicas, campos,
// textos desenhados em canvas e caixas de alerta) usando o dicionário de i18n-pt-data.js.
// Para voltar ao inglês: localStorage "bs.lang" = "en" (Configurações não têm essa opção ainda).
(function () {
  'use strict';
  if (window.__bsI18n) return;
  var DATA = window.__BS_PT;
  var off = false;
  try { off = localStorage.getItem('bs.lang') === 'en'; } catch (e) { /* sem armazenamento: segue em português */ }
  if (!DATA || off) return;

  var exact = new Map();
  Object.keys(DATA.d).forEach(function (k) { exact.set(k, DATA.d[k]); });
  var lower = new Map();
  exact.forEach(function (v, k) { var l = k.toLowerCase(); if (!lower.has(l)) lower.set(l, v); });
  var done = new Set();
  exact.forEach(function (v) { done.add(v); });

  // Modelos com partes que mudam (${...} no código): ^...$ para o texto inteiro, sem âncoras para trechos.
  var tpls = DATA.t.map(function (t) {
    return { full: new RegExp('^' + t[0] + '$'), fullI: new RegExp('^' + t[0] + '$', 'i'), litL: t[2].toLowerCase(), part: new RegExp(t[0], 'g'), out: t[1], lit: t[2] };
  });
  // Trechos fixos de duas palavras ou mais, para textos montados a partir de vários pedaços.
  var frags = [];
  exact.forEach(function (v, k) { if (k.length >= 8 && /\s/.test(k) && /[A-Za-z]{3}/.test(k)) frags.push([k, v]); });
  frags.sort(function (a, b) { return b[0].length - a[0].length; });

  function fill(out, m) {
    var s = '';
    for (var i = 0; i < out.length; i++) {
      var p = out[i];
      if (typeof p === 'string') { s += p; continue; }
      var v = m[p.g + 1];
      if (v === undefined) v = '';
      if (p.o) {
        var one = v === p.a ? 0 : v === p.b ? 1 : (v === '' || v === '1' ? 0 : 1);
        s += p.o[one];
      } else s += tr(v);
    }
    return s;
  }

  var memo = new Map();
  function tr(text) {
    if (!text) return text;
    var key = text.replace(/\s+/g, ' ').trim();
    if (!key || !/[A-Za-z]/.test(key) || done.has(key)) return text;
    var hit = memo.get(key);
    if (hit === undefined) {
      hit = exact.get(key);
      if (hit === undefined) {
        for (var i = 0; i < tpls.length; i++) {
          var t = tpls[i];
          if (key.indexOf(t.lit) < 0) continue;
          var m = t.full.exec(key);
          if (m) { hit = fill(t.out, m); break; }
        }
      }
      if (hit === undefined && key === key.toUpperCase() && /[A-Z]{3}/.test(key)) hit = caps(key);
      if (hit === undefined) hit = pieces(key);
      if (memo.size > 20000) memo.clear();
      memo.set(key, hit);
      if (hit !== null) done.add(hit);
    }
    if (hit === null) return text;
    var lead = /^\s*/.exec(text)[0], tail = /\s*$/.exec(text)[0];
    return lead + hit + tail;
  }
  // Texto todo em maiúsculas (capas e letreiros): procura sem diferenciar maiúsculas e devolve em maiúsculas.
  function caps(key) {
    var l = key.toLowerCase(), v = lower.get(l);
    if (v !== undefined) return v.toUpperCase();
    for (var i = 0; i < tpls.length; i++) {
      var t = tpls[i];
      if (l.indexOf(t.litL) < 0) continue;
      var m = t.fullI.exec(key);
      if (m) return fill(t.out, m).toUpperCase();
    }
    return undefined;
  }
  // Texto montado de vários pedaços: troca os trechos conhecidos dentro dele.
  function pieces(key) {
    var s = key, changed = false;
    for (var i = 0; i < tpls.length; i++) {
      var t = tpls[i];
      if (s.indexOf(t.lit) < 0 || t.lit.length < 6) continue;
      t.part.lastIndex = 0;
      var n = s.replace(t.part, function () { changed = true; return fill(t.out, arguments); });
      s = n;
    }
    var g = s.replace(/(\d[\d.,]*) of (\d[\d.,]*)/g, '$1 de $2');
    if (g !== s) { s = g; changed = true; }
    for (var j = 0; j < frags.length; j++) {
      if (s.indexOf(frags[j][0]) >= 0) { s = s.split(frags[j][0]).join(frags[j][1]); changed = true; }
    }
    return changed ? s : null;
  }

  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip', 'data-label'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.isContentEditable || (e.hasAttribute && e.hasAttribute('data-no-tr'))) return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || v.length > 4000 || !/[A-Za-z]{2}/.test(v)) return;
    var p = n.parentNode;
    if (!p || skipEl(p)) return;
    var t = tr(v);
    if (t !== v) n.nodeValue = t;
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a && /[A-Za-z]{2}/.test(a)) { var t = tr(a); if (t !== a) el.setAttribute(ATTRS[i], t); }
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) {
      var tv = tr(el.value); if (tv !== el.value) el.value = tv;
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (SKIP[n.tagName]) continue;
      else doAttrs(n);
    }
  }

  var obs = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') { if (r.target.nodeType === 1 && !skipEl(r.target)) doAttrs(r.target); }
      else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
    }
  });
  function start() {
    walk(document.documentElement);
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
    if (document.title) document.title = tr(document.title);
  }
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);

  // Textos desenhados em canvas (museu, manuais e caixas montados pelo Boxshelf).
  try {
    var C = CanvasRenderingContext2D.prototype;
    ['fillText', 'strokeText', 'measureText'].forEach(function (f) {
      var orig = C[f];
      C[f] = function (text) { if (typeof text === 'string') arguments[0] = tr(text); return orig.apply(this, arguments); };
    });
    if (window.OffscreenCanvasRenderingContext2D) {
      var O = OffscreenCanvasRenderingContext2D.prototype;
      ['fillText', 'strokeText', 'measureText'].forEach(function (f) {
        var orig = O[f];
        O[f] = function (text) { if (typeof text === 'string') arguments[0] = tr(text); return orig.apply(this, arguments); };
      });
    }
  } catch (e) { /* sem canvas */ }
  ['alert', 'confirm', 'prompt'].forEach(function (f) {
    var orig = window[f];
    if (typeof orig === 'function') window[f] = function (msg) { if (typeof msg === 'string') arguments[0] = tr(msg); return orig.apply(window, arguments); };
  });

  document.documentElement && document.documentElement.setAttribute('lang', 'pt-BR');
  window.__bsI18n = { tr: tr, lang: 'pt-BR' };
})();
