// ============================================================
// Tıbbi Not Defteri — Mobil (PWA) Uyumluluk + Senkron Katmanı
// ------------------------------------------------------------
// Amaç: app/app.html, app.js, storage.js dosyalarına HİÇ DOKUNMADAN
// defteri telefonda (PWA) birebir çalıştırmak.
//
// Masaüstündeki desktop-shim.js ile AYNI sözleşme:
//   - chrome.runtime.sendMessage  → CRUD
//   - chrome.storage.local        → tercihler + notlar
//   - chrome.storage.onChanged    → canlı tazeleme (app.js refreshAll)
//
// Masaüstünden FARKI (kalıcılık):
//   - Notlar telefonun IndexedDB'sinde tutulur (ÇEVRİMDIŞI çalışır).
//   - İsteğe bağlı bulut: özel bir GitHub Gist ile çift yönlü senkron.
//   - Silmeler "tombstone" (deleted:true) ile işaretlenir → bir cihazda
//     silinen not diğerinden geri DİRİLMEZ. app.js bunları hiç görmez.
//
// Bu script, app/storage.js ve app/app.js'den ÖNCE yüklenmelidir.
// ============================================================
(function () {
  'use strict';

  // ============================================================
  // 0) Küçük IndexedDB sarmalayıcısı (anahtar-değer deposu)
  // ============================================================
  var DB_NAME = 'tibbi-defter';
  var DB_VER = 1;
  var STORE = 'kv';
  var _dbPromise = null;

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _dbPromise;
  }

  function _idbGet(key) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function _idbSet(key, val) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // ============================================================
  // 1) Durum
  // ============================================================
  var _notes = [];          // tombstone'lar DAHİL (deleted:true olanlar burada durur)
  var _config = null;       // { token, gistId, fileName }
  var _changeListeners = [];

  var _idbSaveTimer = null;
  var _gistPushTimer = null;
  var _pollTimer = null;
  var _lastGistContent = null; // son çekilen ham içerik (gereksiz birleşmeyi önler)

  var _status = { state: 'kapali', lastSync: null, error: null }; // senkron durumu
  var _statusListeners = [];

  var GIST_FILE = 'notlar.json';

  // ============================================================
  // 2) Veri mantığı — background.js / desktop-shim ile birebir aynı
  // ============================================================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  // app.js'e SADECE silinmemiş notlar gösterilir
  function _visible() {
    return _notes.filter(function (n) { return !n.deleted; });
  }

  function _filterNotes(notes, filter) {
    filter = filter || {};
    var out = notes;
    if (filter.date) {
      var fd = new Date(filter.date).toDateString();
      out = out.filter(function (n) { return new Date(n.createdAt).toDateString() === fd; });
    }
    if (filter.tag) {
      out = out.filter(function (n) { return (n.tags || []).includes(filter.tag); });
    }
    if (filter.search) {
      var s = filter.search.toLowerCase();
      out = out.filter(function (n) {
        return (n.content || '').toLowerCase().includes(s) ||
               (n.userNote || '').toLowerCase().includes(s) ||
               (n.tags || []).some(function (t) { return t.toLowerCase().includes(s); });
      });
    }
    if (filter.starred) {
      out = out.filter(function (n) { return n.isStarred; });
    }
    return out;
  }

  function _todayNotes(notes) {
    var t = new Date().toDateString();
    return notes.filter(function (n) { return new Date(n.createdAt).toDateString() === t; });
  }

  function _saveNote(data) {
    data = data || {};
    var newContent = (data.content || '').trim();
    if (newContent) {
      // yinelenen koruması: yalnızca GÖRÜNEN (silinmemiş) notlara bak
      var ex = _visible().find(function (n) { return (n.content || '').trim() === newContent; });
      if (ex) return Object.assign({}, ex, { duplicate: true });
    }
    var note = {
      id: generateId(),
      content: data.content || '',
      contentHtml: data.contentHtml || '',
      sourceUrl: data.sourceUrl || '',
      sourceTitle: data.sourceTitle || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: data.tags || [],
      isStarred: false,
      userNote: '',
      captureMethod: data.captureMethod || 'manual'
    };
    _notes.unshift(note);
    _persist();
    return note;
  }

  function _updateNote(data) {
    var i = _notes.findIndex(function (n) { return n.id === data.id; });
    if (i === -1) return null;
    _notes[i] = Object.assign({}, _notes[i], data, { updatedAt: new Date().toISOString() });
    _persist();
    return _notes[i];
  }

  // Silme = tombstone. İçeriği boşaltıp deleted işaretliyoruz (bulutta yer kaplamasın).
  function _deleteNote(id) {
    var i = _notes.findIndex(function (n) { return n.id === id; });
    if (i === -1) return;
    _notes[i] = {
      id: _notes[i].id,
      createdAt: _notes[i].createdAt,
      updatedAt: new Date().toISOString(),
      deleted: true
    };
    _persist();
  }

  function _importNotes(imported) {
    var ids = {};
    _notes.forEach(function (n) { ids[n.id] = true; });
    var fresh = (imported || []).filter(function (n) { return !ids[n.id]; });
    _notes = fresh.concat(_notes);
    _persist();
  }

  // ============================================================
  // 3) Kalıcılık: IndexedDB'ye yaz (hızlı) + buluta gönder (debounce)
  // ============================================================
  function _persist() {
    // IndexedDB'ye kaydet (kısa debounce)
    clearTimeout(_idbSaveTimer);
    _idbSaveTimer = setTimeout(function () {
      _idbSet('notes', _notes).catch(function (e) { console.warn('IDB kayıt hatası', e); });
    }, 150);

    // Buluta gönder (daha uzun debounce — gereksiz istek olmasın)
    if (_config && _config.token && _config.gistId) {
      clearTimeout(_gistPushTimer);
      _gistPushTimer = setTimeout(function () { _gistPush(); }, 1500);
    }
  }

  // ============================================================
  // 4) chrome.* TAKLİDİ (storage.js / app.js bunları çağırır)
  // ============================================================
  function sendMessage(message, callback) {
    var resp;
    var action = message && message.action;
    switch (action) {
      case 'get-all-notes':
        resp = { success: true, notes: _visible() }; break;
      case 'get-notes':
        resp = { success: true, notes: _filterNotes(_visible(), message.filter) }; break;
      case 'get-today-notes':
        resp = { success: true, notes: _todayNotes(_visible()) }; break;
      case 'save-note': {
        var saved = _saveNote(message.data);
        resp = { success: true, note: saved, duplicate: !!(saved && saved.duplicate) }; break;
      }
      case 'update-note':
        resp = { success: true, note: _updateNote(message.data) }; break;
      case 'delete-note':
        _deleteNote(message.noteId); resp = { success: true }; break;
      case 'import-notes':
        _importNotes(message.data); resp = { success: true }; break;
      case 'open-notebook':
        resp = { success: true }; break; // mobilde zaten defterdeyiz
      default:
        resp = { success: false, error: 'Bilinmeyen işlem: ' + action };
    }
    if (typeof callback === 'function') {
      Promise.resolve().then(function () { callback(resp); });
    }
    return true;
  }

  // ---- Tercihler: localStorage (tema, okuma genişliği) ----
  function _getPrefs() {
    try { return JSON.parse(localStorage.getItem('defter_preferences') || '{}'); }
    catch (e) { return {}; }
  }
  function _setPrefs(p) {
    try { localStorage.setItem('defter_preferences', JSON.stringify(p)); } catch (e) {}
  }

  var storageLocal = {
    get: function (keys, callback) {
      var all = { preferences: _getPrefs(), diskSaveError: null, notes: _visible() };
      var result = {};
      if (typeof keys === 'string') {
        result[keys] = all[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach(function (k) { result[k] = all[k]; });
      } else if (keys && typeof keys === 'object') {
        Object.keys(keys).forEach(function (k) {
          result[k] = (all[k] !== undefined ? all[k] : keys[k]);
        });
      } else {
        result = all;
      }
      if (typeof callback === 'function') {
        Promise.resolve().then(function () { callback(result); });
      }
      return Promise.resolve(result);
    },
    set: function (obj, callback) {
      if (obj && obj.preferences) _setPrefs(obj.preferences);
      if (typeof callback === 'function') Promise.resolve().then(callback);
      return Promise.resolve();
    },
    remove: function (keys, callback) {
      if (typeof callback === 'function') Promise.resolve().then(callback);
      return Promise.resolve();
    }
  };

  var onChanged = {
    addListener: function (cb) { if (typeof cb === 'function') _changeListeners.push(cb); },
    removeListener: function (cb) {
      var i = _changeListeners.indexOf(cb);
      if (i !== -1) _changeListeners.splice(i, 1);
    },
    hasListener: function (cb) { return _changeListeners.indexOf(cb) !== -1; }
  };

  function _emitNotesChanged() {
    var changes = { notes: { newValue: _visible() } };
    _changeListeners.forEach(function (cb) {
      try { cb(changes, 'local'); } catch (e) { /* yoksay */ }
    });
  }

  // chrome nesnesini kur
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.runtime.sendMessage = sendMessage;
  window.chrome.runtime.lastError = undefined;
  window.chrome.runtime.getURL = function (p) { return p; };
  window.chrome.storage = { local: storageLocal, onChanged: onChanged };

  // ============================================================
  // 5) Birleştirme (merge) — id'ye göre, updatedAt ile son-yazan-kazanır
  // ============================================================
  function _ts(n) { return Date.parse(n && (n.updatedAt || n.createdAt) || 0) || 0; }

  function _merge(localArr, remoteArr) {
    var byId = {};
    localArr.forEach(function (n) { if (n && n.id) byId[n.id] = n; });
    remoteArr.forEach(function (r) {
      if (!r || !r.id) return;
      var l = byId[r.id];
      if (!l) { byId[r.id] = r; return; }
      byId[r.id] = (_ts(r) > _ts(l)) ? r : l;
    });
    var out = Object.keys(byId).map(function (k) { return byId[k]; });
    // En yeni üstte (app.js sırayı korur)
    out.sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return out;
  }

  // ============================================================
  // 6) GitHub Gist senkronu
  // ============================================================
  function _setStatus(state, error) {
    _status = { state: state, lastSync: _status.lastSync, error: error || null };
    if (state === 'tamam') _status.lastSync = new Date().toISOString();
    _statusListeners.forEach(function (cb) { try { cb(_status); } catch (e) {} });
  }

  function _headers() {
    return {
      'Authorization': 'Bearer ' + _config.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function _notesPayload() {
    return JSON.stringify({
      app: 'Tıbbi Not Defteri',
      version: '1.0-mobile',
      updatedAt: new Date().toISOString(),
      notes: _notes
    }, null, 2);
  }

  function _parseGistNotes(text) {
    try {
      var data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.notes)) return data.notes;
    } catch (e) {}
    return [];
  }

  // Buluttan çek + birleştir
  function _gistPull() {
    if (!_config || !_config.token || !_config.gistId) return Promise.resolve(false);
    if (!navigator.onLine) return Promise.resolve(false);
    _setStatus('senkron');
    return fetch('https://api.github.com/gists/' + _config.gistId, { headers: _headers() })
      .then(function (res) {
        if (!res.ok) throw new Error('Gist okunamadı (HTTP ' + res.status + ')');
        return res.json();
      })
      .then(function (gist) {
        var file = gist.files && gist.files[_config.fileName || GIST_FILE];
        if (!file) return false;
        // Büyük dosyalarda content kesilmiş olabilir → raw_url'den al
        var getText = file.truncated && file.raw_url
          ? fetch(file.raw_url).then(function (r) { return r.text(); })
          : Promise.resolve(file.content || '');
        return getText.then(function (text) {
          if (text === _lastGistContent) { _setStatus('tamam'); return false; }
          _lastGistContent = text;
          var remote = _parseGistNotes(text);
          var merged = _merge(_notes, remote);
          var changed = JSON.stringify(merged) !== JSON.stringify(_notes);
          _notes = merged;
          return _idbSet('notes', _notes).then(function () {
            if (changed) _emitNotesChanged();
            _setStatus('tamam');
            return changed;
          });
        });
      })
      .catch(function (e) { _setStatus('hata', e.message); return false; });
  }

  // Buluta yaz
  function _gistPush() {
    if (!_config || !_config.token || !_config.gistId) return Promise.resolve(false);
    if (!navigator.onLine) { _setStatus('cevrimdisi'); return Promise.resolve(false); }
    _setStatus('senkron');
    var body = { files: {} };
    body.files[_config.fileName || GIST_FILE] = { content: _notesPayload() };
    return fetch('https://api.github.com/gists/' + _config.gistId, {
      method: 'PATCH',
      headers: _headers(),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('Gist yazılamadı (HTTP ' + res.status + ')');
      _lastGistContent = _notesPayload();
      _setStatus('tamam');
      return true;
    }).catch(function (e) { _setStatus('hata', e.message); return false; });
  }

  // İlk kurulumda: token var ama gistId yok → yeni özel gist oluştur
  function _gistCreate() {
    _setStatus('senkron');
    var body = {
      description: 'Tıbbi Not Defteri — notlar (özel)',
      public: false,
      files: {}
    };
    body.files[GIST_FILE] = { content: _notesPayload() };
    return fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('Gist oluşturulamadı (HTTP ' + res.status + ')');
      return res.json();
    }).then(function (gist) {
      _config.gistId = gist.id;
      _config.fileName = GIST_FILE;
      return _idbSet('gistConfig', _config).then(function () {
        _lastGistContent = _notesPayload();
        _setStatus('tamam');
        return gist.id;
      });
    }).catch(function (e) { _setStatus('hata', e.message); throw e; });
  }

  function _startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    if (!_config || !_config.token || !_config.gistId) return;
    _pollTimer = setInterval(function () {
      if (document.hidden) return; // arka plandayken boşuna isteme
      _gistPull();
    }, 20000); // 20 sn
  }

  function _fullSync() {
    // Önce çek-birleştir, sonra yereldeki birleşmiş hali geri yaz
    return _gistPull().then(function () { return _gistPush(); });
  }

  // ============================================================
  // 7) Ayar arayüzü için dışa açılan API (mobile-settings.js kullanır)
  // ============================================================
  window.__DEFTER_SYNC__ = {
    isConfigured: function () { return !!(_config && _config.token && _config.gistId); },
    getInfo: function () {
      return {
        hasToken: !!(_config && _config.token),
        gistId: (_config && _config.gistId) || '',
        status: _status
      };
    },
    // { token, gistId? } — gistId boşsa yeni gist oluşturur
    setConfig: function (opts) {
      opts = opts || {};
      _config = {
        token: (opts.token || '').trim(),
        gistId: (opts.gistId || '').trim(),
        fileName: GIST_FILE
      };
      return _idbSet('gistConfig', _config).then(function () {
        if (!_config.token) { _setStatus('kapali'); return; }
        var step = _config.gistId ? _fullSync() : _gistCreate().then(function () { return _gistPush(); });
        return step.then(function () { _startPolling(); });
      });
    },
    disconnect: function () {
      _config = null;
      if (_pollTimer) clearInterval(_pollTimer);
      _setStatus('kapali');
      return _idbSet('gistConfig', null);
    },
    syncNow: function () { return _fullSync(); },
    onStatus: function (cb) { if (typeof cb === 'function') _statusListeners.push(cb); }
  };

  // ============================================================
  // 8) Açılış: IndexedDB'den yükle → app.js'i tazele → buluttan çek
  // ============================================================
  (function boot() {
    Promise.all([_idbGet('notes'), _idbGet('gistConfig')]).then(function (vals) {
      var savedNotes = vals[0];
      var savedConfig = vals[1];
      if (Array.isArray(savedNotes)) {
        _notes = savedNotes;
        _emitNotesChanged(); // app.js DOMContentLoaded'da boş başlasa bile burada dolar
      }
      if (savedConfig && savedConfig.token) {
        _config = savedConfig;
        _setStatus('tamam');
        _gistPull().then(function () { _startPolling(); });
      } else {
        _setStatus('kapali');
      }
    }).catch(function (e) { console.warn('Mobil shim açılış hatası', e); });

    // Çevrimiçi olunca bir kez senkronla
    window.addEventListener('online', function () {
      if (window.__DEFTER_SYNC__.isConfigured()) _fullSync();
    });
    // Sekme tekrar öne gelince taze veriyi çek
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && window.__DEFTER_SYNC__.isConfigured()) _gistPull();
    });
  })();

  window.__DEFTER_MOBILE__ = true;
})();
