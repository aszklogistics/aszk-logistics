/* ASZK site editor: loads content from Supabase and lets a logged-in admin edit it in place. */
(function () {
  'use strict';

  var cfg = window.CMS_CONFIG || {};
  var ready = cfg.url && cfg.anonKey && window.supabase && /^https?:\/\//.test(cfg.url);
  if (!ready) {
    document.documentElement.classList.remove('cms-wait');
    return; // static mode
  }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var BUCKET = 'site-images';
  var editing = false;
  var dirty = new Map();      // key -> 'text' | image url
  var els = {};               // key -> element
  var imgEls = {};            // img key -> element
  var galleryEl = document.getElementById('gallery');
  var galleryRows = [];
  var bar = null, saveBtn = null, toastEl = null;

  /* ---------- sanitizer: only simple inline formatting survives ---------- */
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, BR: 1, SPAN: 1, A: 1 };
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
        if (t !== 'BR') clean(n, el);
        out.appendChild(el);
      } else {
        if ((t === 'DIV' || t === 'P') && out.childNodes.length) out.appendChild(document.createElement('br'));
        clean(n, out);
      }
    });
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var box = document.createElement('div');
    clean(doc.body, box);
    return box.innerHTML;
  }

  function syncLinks() {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      var n = a.textContent.replace(/[^\d+]/g, '');
      if (n) a.setAttribute('href', 'tel:' + n);
    });
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var m = a.textContent.trim();
      if (m) a.setAttribute('href', 'mailto:' + m);
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cms-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, isErr ? 6000 : 2500);
  }

  /* ---------- apply saved content ---------- */
  function applyContent(rows) {
    rows.forEach(function (r) {
      if (r.key.indexOf('img_') === 0) {
        if (imgEls[r.key] && r.value) imgEls[r.key].src = r.value;
      } else if (els[r.key]) {
        els[r.key].innerHTML = sanitize(r.value || '');
      }
    });
    syncLinks();
  }

  /* ---------- images ---------- */
  function resizeImage(file, max) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        var png = file.type === 'image/png';
        var ctx = c.getContext('2d');
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) {
          URL.revokeObjectURL(url);
          b ? res({ blob: b, ext: png ? '.png' : '.jpg', type: png ? 'image/png' : 'image/jpeg' })
            : rej(new Error('Gagal memproses gambar'));
        }, png ? 'image/png' : 'image/jpeg', 0.85);
      };
      img.onerror = function () { rej(new Error('Fail bukan gambar yang sah')); };
      img.src = url;
    });
  }

  function uploadImage(file, folder) {
    return resizeImage(file, 1600).then(function (r) {
      var path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + r.ext;
      return sb.storage.from(BUCKET).upload(path, r.blob, { contentType: r.type, upsert: false })
        .then(function (u) {
          if (u.error) throw u.error;
          var url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          return { url: url, path: path };
        });
    });
  }

  function pickFiles(multiple) {
    return new Promise(function (res) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
      inp.onchange = function () { res(Array.prototype.slice.call(inp.files || [])); };
      inp.click();
    });
  }

  /* ---------- gallery ---------- */
  function renderGallery() {
    if (!galleryEl) return;
    if (!galleryRows.length && !editing) return; // keep the static fallback
    galleryEl.innerHTML = '';
    galleryRows.forEach(function (r) {
      var a = document.createElement('a');
      a.href = r.url;
      var im = document.createElement('img');
      im.loading = 'lazy'; im.src = r.url; im.alt = r.caption || 'Gambar galeri ASZK Logistics';
      a.appendChild(im);
      if (editing) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'cms-del'; b.textContent = '✕'; b.title = 'Padam gambar';
        b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); deletePhoto(r); };
        a.appendChild(b);
      }
      galleryEl.appendChild(a);
    });
    if (editing) {
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'cms-add'; add.textContent = '+ Tambah gambar';
      add.onclick = addPhotos;
      galleryEl.appendChild(add);
    }
  }

  function deletePhoto(r) {
    if (!confirm('Padam gambar ini daripada galeri?')) return;
    sb.from('gallery').delete().eq('id', r.id).then(function (d) {
      if (d.error) { toast('Gagal memadam: ' + d.error.message, true); return; }
      if (r.path) sb.storage.from(BUCKET).remove([r.path]);
      galleryRows = galleryRows.filter(function (x) { return x.id !== r.id; });
      renderGallery();
      toast('Gambar dipadam');
    });
  }

  function addPhotos() {
    pickFiles(true).then(function (files) {
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          toast('Memuat naik ' + f.name + '…');
          return uploadImage(f, 'gallery').then(function (u) {
            var max = galleryRows.reduce(function (m, x) { return Math.max(m, x.sort || 0); }, 0);
            return sb.from('gallery').insert({ url: u.url, path: u.path, caption: '', sort: max + 1 }).select().single();
          }).then(function (r) {
            if (r.error) throw r.error;
            galleryRows.push(r.data);
            renderGallery();
          });
        });
      });
      return chain.then(function () { if (files.length) toast('Gambar ditambah ✔'); });
    }).catch(function (e) { toast('Gagal: ' + (e.message || e), true); });
  }

  /* ---------- edit mode ---------- */
  function markDirty() {
    if (saveBtn) {
      saveBtn.disabled = dirty.size === 0;
      saveBtn.textContent = dirty.size ? 'Simpan (' + dirty.size + ')' : 'Simpan';
    }
  }

  function save() {
    if (!dirty.size) return;
    saveBtn.disabled = true;
    var now = new Date().toISOString();
    var rows = [];
    dirty.forEach(function (v, k) {
      rows.push({ key: k, value: v === 'text' ? sanitize(els[k].innerHTML) : v, updated_at: now });
    });
    sb.from('site_content').upsert(rows, { onConflict: 'key' }).then(function (r) {
      if (r.error) { toast('Gagal menyimpan: ' + r.error.message, true); markDirty(); return; }
      dirty.clear(); markDirty(); syncLinks();
      toast('Semua perubahan disimpan ✔');
    });
  }

  function enableEditing() {
    editing = true;
    document.body.classList.add('cms-editing');

    Object.keys(els).forEach(function (k) {
      var el = els[k];
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('input', function () { dirty.set(k, 'text'); markDirty(); });
      el.addEventListener('paste', function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      });
    });

    Object.keys(imgEls).forEach(function (k) {
      var im = imgEls[k];
      im.title = 'Klik untuk menukar gambar';
      im.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        pickFiles(false).then(function (files) {
          if (!files[0]) return;
          toast('Memuat naik gambar…');
          return uploadImage(files[0], 'site').then(function (u) {
            im.src = u.url; dirty.set(k, u.url); markDirty();
            toast('Gambar ditukar. Tekan Simpan untuk kekalkan.');
          });
        }).catch(function (err) { toast('Gagal: ' + (err.message || err), true); });
      });
    });

    // block link navigation while editing (except the top menu)
    document.addEventListener('click', function (e) {
      if (!editing) return;
      var a = e.target.closest && e.target.closest('a');
      if (a && !a.closest('.cms-bar') && !a.closest('header.site nav')) e.preventDefault();
    }, true);

    bar = document.createElement('div');
    bar.className = 'cms-bar';
    bar.innerHTML =
      '<span class="cms-msg"><b>Mod Pentadbir</b> · Klik mana-mana teks untuk mengedit. Klik gambar untuk menukar. Galeri: gunakan ✕ dan “+ Tambah gambar” (disimpan terus).</span>' +
      '<span class="cms-actions">' +
      '<button type="button" id="cms-save" disabled>Simpan</button>' +
      '<a href="index.html" id="cms-view">Lihat sebagai pelawat</a>' +
      '<button type="button" id="cms-out">Log keluar</button></span>';
    document.body.appendChild(bar);
    saveBtn = bar.querySelector('#cms-save');
    saveBtn.addEventListener('click', save);
    bar.querySelector('#cms-out').addEventListener('click', function () {
      if (dirty.size && !confirm('Ada perubahan belum disimpan. Log keluar juga?')) return;
      dirty.clear();
      sb.auth.signOut().then(function () { location.href = 'index.html'; });
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------- start ---------- */
  function init() {
    document.querySelectorAll('[data-key]').forEach(function (e) { els[e.getAttribute('data-key')] = e; });
    document.querySelectorAll('[data-img]').forEach(function (e) { imgEls[e.getAttribute('data-img')] = e; });

    var wantEdit = /[?&]edit=1/.test(location.search);

    return Promise.all([
      sb.from('site_content').select('key,value'),
      sb.from('gallery').select('*').order('sort', { ascending: true }).order('id', { ascending: true })
    ]).then(function (r) {
      if (!r[0].error && r[0].data) applyContent(r[0].data);
      if (!r[1].error && r[1].data) galleryRows = r[1].data;
      if (!wantEdit) return;
      return sb.auth.getSession().then(function (s) {
        if (!s.data || !s.data.session) { location.href = 'admin.html'; return; }
        return sb.rpc('is_admin').then(function (a) {
          if (a.data === true) enableEditing();
          else toast('Akaun ini bukan pentadbir laman web.', true);
        });
      });
    }).catch(function (e) {
      console.error(e);
    }).then(function () {
      renderGallery();
      document.documentElement.classList.remove('cms-wait');
    });
  }

  init();
})();
