// ============================================================
// Tıbbi Not Defteri — Masaüstü (WebView2) Uyumluluk Katmanı
// ------------------------------------------------------------
// Amaç: app/app.html, app.js, storage.js dosyalarına HİÇ DOKUNMADAN
// defteri masaüstü penceresinde birebir çalıştırmak.
//
// Bu script, sayfanın kendi scriptlerinden ÖNCE (document-created
// aşamasında) WebView2 tarafından enjekte edilir. Uzantı ortamındaki
// chrome.runtime / chrome.storage API'lerini taklit eder:
//   - Notlar bellekte tutulur (başlangıçta __DEFTER_INITIAL__'dan gelir).
//   - Kalıcılık (kaydet/yükle) PowerShell host'a postMessage ile yapılır;
//     host data/notlar.json'u günceller (uzantıyla AYNI dosya).
//   - Dış değişiklikler (uzantı not eklerse) host'tan 'sync' mesajıyla
//     gelir ve chrome.storage.onChanged dinleyicileri tetiklenir →
//     app.js otomatik olarak listeyi yeniler (canlı senkron).
// ============================================================
(function () {
  'use strict';

  // WebView2 köprüsü (PowerShell host ile haberleşme kanalı)
  var bridge = (window.chrome && window.chrome.webview) ? window.chrome.webview : null;

  // Bellekteki not listesi. Başlangıç verisi host tarafından enjekte edilir.
  var _notes = (window.__DEFTER_INITIAL__ && Array.isArray(window.__DEFTER_INITIAL__.notes))
    ? window.__DEFTER_INITIAL__.notes
    : [];
  var _loaded = !!(window.__DEFTER_INITIAL__ && Array.isArray(window.__DEFTER_INITIAL__.notes));
  var _loadPromise = null;

  // chrome.storage.onChanged dinleyicileri
  var _changeListeners = [];

  // ---- Tercihler: localStorage (tema, okuma genişliği) ----
  function _getPrefs() {
    try { return JSON.parse(localStorage.getItem('defter_preferences') || '{}'); }
    catch (e) { return {}; }
  }
  function _setPrefs(p) {
    try { localStorage.setItem('defter_preferences', JSON.stringify(p)); } catch (e) {}
  }

  // ---- Kalıcılık: notları PowerShell host'a gönder (kısa debounce) ----
  var _saveTimer = null;
  function _persist() {
    if (!bridge) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      try { bridge.postMessage(JSON.stringify({ type: 'save', notes: _notes })); }
      catch (e) { /* yoksay */ }
    }, 350);
  }

  // ============================================================
  // Veri mantığı — background.js ile birebir aynı davranış
  // ============================================================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  }

  // Silinen notlar (tombstone: deleted:true) app.js'e GÖSTERİLMEZ.
  // Tombstone'lar buluttan/notlar.json'dan gelebilir (telefon/PC senkronu).
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
    // Yinelenen koruması: aynı içerikli not zaten varsa yenisini ekleme
    var newContent = (data.content || '').trim();
    if (newContent) {
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

  function _deleteNote(id) {
    // Silme = tombstone (içeriği boşalt, deleted işaretle). Böylece silme
    // buluta/telefona taşınır ve birleşmede not geri DİRİLMEZ.
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
  // chrome.runtime.sendMessage taklidi (storage.js bunu çağırır)
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
        resp = { success: true }; break; // masaüstünde zaten defterdeyiz
      default:
        resp = { success: false, error: 'Bilinmeyen işlem: ' + action };
    }
    if (typeof callback === 'function') {
      // chrome.runtime gibi asenkron davran (mikro-görev)
      Promise.resolve().then(function () { callback(resp); });
    }
    return true;
  }

  var _rawSendMessage = sendMessage;
  sendMessage = function (message, callback) {
    if (typeof callback === 'function') {
      _ensureLoaded().then(function () {
        _rawSendMessage(message, callback);
      });
      return true;
    }
    return _ensureLoaded().then(function () {
      return new Promise(function (resolve) {
        _rawSendMessage(message, resolve);
      });
    });
  };

  // ============================================================
  // chrome.storage.local taklidi (tercihler + disk hatası bayrağı)
  // ============================================================
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

  // ============================================================
  // chrome nesnesini kur — webview kanalını EZME
  // ============================================================
  window.chrome = window.chrome || {};
  window.chrome.runtime = window.chrome.runtime || {};
  window.chrome.runtime.sendMessage = sendMessage;
  window.chrome.runtime.lastError = undefined;
  window.chrome.runtime.getURL = function (p) { return p; };
  window.chrome.storage = { local: storageLocal, onChanged: onChanged };

  // ============================================================
  // Veri yükleme: notlar.json'u sanal host'tan FETCH ile çek.
  // postMessage/script kanallarının boyut sınırı yok burada → 2MB+ veri sorunsuz.
  // ============================================================
  function _loadFromUrl() {
    if (!window.__DEFTER_DATA_URL__) {
      _loaded = true;
      return Promise.resolve(false);
    }
    return fetch(window.__DEFTER_DATA_URL__, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Array.isArray(d.notes)) {
          _notes = d.notes;
          _emitNotesChanged();
          return true;
        }
        return false;
      })
      .catch(function () { return false; })
      .then(function (ok) {
        _loaded = true;
        return ok;
      });
  }

  function _ensureLoaded() {
    if (_loaded) return Promise.resolve(true);
    if (!_loadPromise) {
      _loadPromise = _loadFromUrl().then(function (ok) {
        _loadPromise = null;
        return ok;
      });
    }
    return _loadPromise;
  }

  // PowerShell host'tan gelen mesajlar
  if (bridge) {
    bridge.addEventListener('message', function (e) {
      var data = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return; }
      }
      if (data && data.type === 'reload') {
        _loaded = false;
        _loadPromise = _loadFromUrl(); // dosya degisti -> tazele
      } else if (data && data.type === 'sync' && Array.isArray(data.notes)) {
        _notes = data.notes; _loaded = true; _emitNotesChanged(); // eski yol (yedek)
      }
    });
  }

  // Açılışta notları fetch ile yükle
  _ensureLoaded();

  // Hata ayıklama için
  window.__DEFTER_DESKTOP__ = true;
})();
