/* ASZK site: language switch (BM / EN), hub maps, shared text helpers.
   Works with or without Supabase. cms.js (admin + database) builds on window.SITE. */
(function () {
  'use strict';

  var S = window.SITE = {};
  var EN = window.EN_TEXT || {};
  var EN_NAV = window.EN_NAV || [];
  var cfg = window.CMS_CONFIG || {};
  var configured = !!(cfg.url && cfg.anonKey);

  S.lang = 'ms';
  S.db = {};        // saved values from the database  (key -> value)
  S.pending = {};   // unsaved edits in admin mode
  S.base = {};      // original Malay text found in the page
  S.els = {};       // data-key  -> element
  S.imgs = {};      // data-img  -> element

  var listeners = [];
  S.onLang = function (fn) { listeners.push(fn); };

  /* ---------- key helpers: English rows are stored as "en:<key>" ---------- */
  function dbk(k, lang) { return (lang === 'en' ? 'en:' : '') + k; }
  S.dk = function (k) { return dbk(k, S.lang); };

  S.value = function (k, lang) {
    lang = lang || S.lang;
    var d = dbk(k, lang);
    if (S.pending[d] !== undefined) return S.pending[d];
    if (S.db[d] !== undefined) return S.db[d];
    if (lang === 'en' && EN[k] !== undefined) return EN[k];
    return S.base[k];
  };

  /* ---------- sanitizer: only simple inline formatting survives ---------- */
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, SPAN: 1, A: 1, SMALL: 1 };
  function clean(src, out) {
    src.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName;
      if (t === 'SCRIPT' || t === 'STYLE') return;
      if (ALLOWED[t]) {
        var el = document.createElement(t.toLowerCase());
        if (t === 'A') {
          var h = n.getAttribute('href') || '';
          if (/^(tel:|mailto:|https?:|#)/i.test(h)) el.setAttribute('href', h);
        }
        if (t === 'SPAN') {
          var c = n.getAttribute('class') || '';
          if (/^[\w -]{1,60}$/.test(c)) el.setAttribute('class', c);
        }
        if (t !== 'BR') clean(n, el);
        out.appendChild(el);
      } else {
        if ((t === 'DIV' || t === 'P') && out.childNodes.length) out.appendChild(document.createElement('br'));
        clean(n, out);
      }
    });
  }
  S.sanitize = function (html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var box = document.createElement('div');
    clean(doc.body, box);
    return box.innerHTML;
  };

  S.syncLinks = function () {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      var n = a.textContent.replace(/[^\d+]/g, '');
      if (n) a.setAttribute('href', 'tel:' + n);
    });
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var m = a.textContent.trim();
      if (m) a.setAttribute('href', 'mailto:' + m);
    });
  };

  /* ---------- database rows ---------- */
  S.setDb = function (rows) {
    (rows || []).forEach(function (r) {
      var k = r.key;
      if (k.indexOf('img_') === 0 || k.indexOf('map_') === 0) S.db[k] = r.value || '';
      else S.db[k] = S.sanitize(r.value || '');
    });
  };

  /* ---------- hub maps ---------- */
  function mapQuery(card) {
    var key = card.getAttribute('data-map');
    var v = S.pending[key] !== undefined ? S.pending[key] : S.db[key];
    return (v && String(v).trim()) || card.getAttribute('data-default');
  }

  S.renderMaps = function () {
    var hl = S.lang === 'en' ? 'en' : 'ms';
    document.querySelectorAll('[data-map]').forEach(function (card) {
      var q = mapQuery(card), e = encodeURIComponent(q);
      var src = 'https://www.google.com/maps?q=' + e + '&z=17&hl=' + hl + '&output=embed';
      var f = card.querySelector('iframe');
      if (f && f.getAttribute('src') !== src) f.setAttribute('src', src);
      var o = card.querySelector('[data-act="open"]');
      if (o) o.setAttribute('href', 'https://www.google.com/maps/search/?api=1&query=' + e);
      var d = card.querySelector('[data-act="dir"]');
      if (d) d.setAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=' + e);
    });
  };

  // Accepts "lat,lng", a full Google Maps URL, or an address. Returns {q} or {err}.
  S.parseMapInput = function (t) {
    t = (t || '').trim();
    if (!t) return { q: '' };
    if (/^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(t)) return { q: t.replace(/\s+/g, '') };
    if (/^https?:\/\//i.test(t)) {
      if (/goo\.gl|maps\.app/i.test(t)) return { err: 'short' };
      var m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (m) return { q: m[1] + ',' + m[2] };
      m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) return { q: m[1] + ',' + m[2] };
      m = t.match(/[?&](?:q|query|ll|destination)=([^&#]+)/);
      if (m) { try { return { q: decodeURIComponent(m[1].replace(/\+/g, ' ')) }; } catch (e) {} }
      m = t.match(/\/maps\/place\/([^\/@?]+)/);
      if (m) { try { return { q: decodeURIComponent(m[1].replace(/\+/g, ' ')) }; } catch (e) {} }
      return { err: 'url' };
    }
    return { q: t.slice(0, 300) };
  };

  /* ---------- render everything for the current language ---------- */
  var ui = { ms: {}, en: {} };

  S.render = function () {
    var lang = S.lang;
    document.documentElement.lang = lang;

    Object.keys(S.els).forEach(function (k) {
      var el = S.els[k], v = S.value(k);
      if (v !== undefined && el.innerHTML !== v) el.innerHTML = v;
    });

    Object.keys(S.imgs).forEach(function (k) {
      var v = S.pending[k] !== undefined ? S.pending[k] : S.db[k];
      if (v && /^(https?:\/\/|images\/)/.test(v) && S.imgs[k].getAttribute('src') !== v) S.imgs[k].setAttribute('src', v);
    });

    document.title = ui[lang].title;
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', ui[lang].desc);
    var links = document.querySelectorAll('#menu a');
    links.forEach(function (a, i) { var t = ui[lang].nav[i]; if (t) a.textContent = t; });
    document.querySelectorAll('.map-frame iframe').forEach(function (f) { f.setAttribute('title', lang === 'en' ? 'Hub location map' : 'Peta lokasi hab'); });
    document.querySelectorAll('.langpill button').forEach(function (b) {
      var on = b.getAttribute('data-lang') === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    S.renderMaps();
    S.syncLinks();
  };

  S.setLang = function (l) {
    if (l !== 'ms' && l !== 'en') return;
    S.lang = l;
    try { localStorage.setItem('aszk_lang', l); } catch (e) {}
    S.render();
    listeners.forEach(function (fn) { try { fn(l); } catch (e) { console.error(e); } });
  };

  /* ---------- start ---------- */
  document.querySelectorAll('[data-key]').forEach(function (e) {
    var k = e.getAttribute('data-key');
    S.els[k] = e;
    S.base[k] = e.innerHTML;
  });
  document.querySelectorAll('[data-img]').forEach(function (e) { S.imgs[e.getAttribute('data-img')] = e; });

  var msNav = [];
  document.querySelectorAll('#menu a').forEach(function (a) { msNav.push(a.textContent); });
  var md0 = document.querySelector('meta[name="description"]');
  ui.ms = { title: document.title, desc: md0 ? md0.getAttribute('content') : '', nav: msNav };
  ui.en = {
    title: 'ASZK Logistics | Logistics & Parcel Delivery',
    desc: 'ASZK Logistics – logistics, parcel handling and last-mile delivery in Segamat, Batu Pahat and Semenyih, Malaysia.',
    nav: EN_NAV
  };

  var fromUrl = (location.search.match(/[?&]lang=(ms|en)/) || [])[1];
  var saved = null;
  try { saved = localStorage.getItem('aszk_lang'); } catch (e) {}
  S.lang = fromUrl || (saved === 'en' ? 'en' : 'ms');

  document.querySelectorAll('.langpill button').forEach(function (b) {
    b.addEventListener('click', function () { S.setLang(b.getAttribute('data-lang')); });
  });

  S.render();
  if (!configured) document.documentElement.classList.remove('cms-wait');
})();
