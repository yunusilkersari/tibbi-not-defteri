// ==========================================
// Tıbbi Not Defteri - Background Service Worker
// ==========================================

// Uzantı kurulduğunda context menu oluştur
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-notebook',
    title: '📋 Deftere Aktar',
    contexts: ['selection']
  });

  // Ilk kurulumda bos liste yazma; once PC arsivinden, sonra buluttan kurtar.
  restoreFromDiskArchive({ reason: 'installed' }).then(() => initCloudSync());
  // Buyuk arsiv kurtarmasi native host parcali aktarim veya GitHub Gist ile yapilir.
});

// Context menu tıklandığında
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-notebook' && info.selectionText) {
    if (await isDisabled()) return; // uzantı kapalıysa kaydetme
    saveNote({
      content: info.selectionText,
      sourceUrl: tab.url,
      sourceTitle: tab.title,
      captureMethod: 'context-menu'
    });
  }
});

// Uzantı kullanıcı tarafından kapatılmış mı? (preferences.enabled === false)
async function isDisabled() {
  const result = await chrome.storage.local.get('preferences');
  return !!(result.preferences && result.preferences.enabled === false);
}

// Klavye kısayolları
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (await isDisabled()) return; // uzantı kapalıysa kısayolları yok say
  if (command === 'capture-selection') {
    // Alt+Q: Seçili metni yakala
    chrome.tabs.sendMessage(tab.id, { action: 'capture-selection' });
  } else if (command === 'parse-last-response') {
    // Alt+1: Son AI yanıtını paragraflara böl
    chrome.tabs.sendMessage(tab.id, { action: 'parse-last-response' });
  } else if (command === 'capture-full-response') {
    // Alt+2: Son AI yanıtının tamamını aktar
    chrome.tabs.sendMessage(tab.id, { action: 'capture-full-response' });
  } else if (command === 'capture-qa') {
    // Alt+3: Okunan cevabı sorusuyla birlikte aktar
    chrome.tabs.sendMessage(tab.id, { action: 'capture-qa' });
  }
});

// Content script'ten gelen mesajları dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'save-note') {
    saveNote(message.data).then((note) => {
      sendResponse({ success: true, note, duplicate: !!(note && note.duplicate) });
    });
    return true; // async response
  }

  if (message.action === 'get-notes') {
    getNotes(message.filter).then((notes) => {
      sendResponse({ success: true, notes });
    });
    return true;
  }

  if (message.action === 'get-today-notes') {
    getTodayNotes().then((notes) => {
      sendResponse({ success: true, notes });
    });
    return true;
  }

  if (message.action === 'update-note') {
    updateNote(message.data).then((note) => {
      sendResponse({ success: true, note });
    });
    return true;
  }

  if (message.action === 'delete-note') {
    deleteNote(message.noteId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'get-all-notes') {
    getAllNotes().then((notes) => {
      sendResponse({ success: true, notes });
    });
    return true;
  }

  if (message.action === 'import-notes') {
    importNotes(message.data).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'open-notebook') {
    chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'sync-get-status') {
    getCloudSyncStatus().then(sendResponse);
    return true;
  }

  if (message.action === 'sync-set-config') {
    setCloudSyncConfig(message.data || {}).then(sendResponse);
    return true;
  }

  if (message.action === 'sync-now') {
    cloudFullSync({ reason: 'manual' }).then(sendResponse);
    return true;
  }

  if (message.action === 'sync-disconnect') {
    disconnectCloudSync().then(sendResponse);
    return true;
  }
});

// ==========================================
// Veri İşlemleri
// ==========================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ==========================================
// Arşiv güvenliği yardımcıları (tombstone + birleştirme)
// Silinen notlar (deleted:true) kullanıcıya gösterilmez ama diske/buluta
// taşınır; "liste boşaldı" diye ASLA toplu silme olmaz.
// ==========================================
function _visible(notes) {
  return (notes || []).filter(n => n && !n.deleted);
}

// Aynı updatedAt değerine sahip iki farklı kayıt nadiren de olsa cihazlar
// arasında oluşabilir. Nesne anahtar sırasından bağımsız, deterministik bir
// bağlayıcı kullanarak bütün istemcilerin aynı kaydı seçmesini sağla.
function _canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(_canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + _canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function _newerRecord(a, b) {
  const at = Date.parse((a && (a.updatedAt || a.createdAt)) || 0) || 0;
  const bt = Date.parse((b && (b.updatedAt || b.createdAt)) || 0) || 0;
  if (at !== bt) return bt > at ? b : a;
  if (!!a.deleted !== !!b.deleted) return b.deleted ? b : a;
  return _canonical(b) > _canonical(a) ? b : a;
}

// chrome.storage'daki HAM notlar (tombstone'lar DAHİL) — diske/buluta giderken kullanılır
async function _rawNotes() {
  const r = await chrome.storage.local.get(['notes']);
  return r.notes || [];
}

// id'ye göre birleştirme; aynı id'de daha yeni updatedAt kazanır (tombstone dahil)
function _mergeById(localArr, incomingArr) {
  const byId = {};
  (localArr || []).forEach(n => { if (n && n.id) byId[n.id] = n; });
  (incomingArr || []).forEach(r => {
    if (!r || !r.id) return;
    const l = byId[r.id];
    if (!l) { byId[r.id] = r; return; }
    byId[r.id] = _newerRecord(l, r);
  });
  return Object.keys(byId).map(k => byId[k])
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

// İçerik imzası (sıra-bağımsız değişiklik tespiti)
function _sig(arr) {
  return (arr || []).map(_canonical).sort().join('|');
}

// ==========================================
// Görselleri kalıcı gömme (data-URL)
// Uzak görseller kaynak sayfa gidince kırılmasın diye base64'e çevrilir.
// Depolama şişmesine karşı: en çok 10 görsel, her biri en fazla 1.5MB.
// ==========================================
const IMG_MAX_COUNT = 10;
const IMG_MAX_BYTES = 1.5 * 1024 * 1024;

async function inlineImagesInHtml(html) {
  if (!html || html.indexOf('<img') === -1) return html;

  const srcRegex = /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
  const urls = new Set();
  let m;
  while ((m = srcRegex.exec(html)) !== null) {
    const url = m[2] || m[3];
    if (url && !/^data:/i.test(url)) urls.add(url);
  }
  if (urls.size === 0) return html;

  const map = {};
  let count = 0;
  for (const url of urls) {
    if (count >= IMG_MAX_COUNT) break;
    count++;
    try {
      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) map[url] = dataUrl;
    } catch (e) {
      // başarısızsa orijinal URL kalır
    }
  }

  let out = html;
  Object.keys(map).forEach((url) => {
    out = out.split(url).join(map[url]);
  });
  return out;
}

async function fetchAsDataUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const type = resp.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) return null;

    const buf = await resp.arrayBuffer();
    if (buf.byteLength > IMG_MAX_BYTES) return null;

    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } finally {
    clearTimeout(timer);
  }
}

async function saveNote(data) {
  let result = await chrome.storage.local.get(['notes', 'preferences']);
  if (!result.notes || result.notes.length === 0) {
    await restoreFromDiskArchive({ reason: 'before-save' });
    result = await chrome.storage.local.get(['notes', 'preferences']);
  }
  const notes = result.notes || [];
  const prefs = result.preferences || {};

  // Yinelenen koruması: aynı içerikli not zaten kayıtlıysa yenisini ekleme
  const newContent = (data.content || '').trim();
  if (newContent) {
    const existing = _visible(notes).find(n => (n.content || '').trim() === newContent);
    if (existing) {
      return { ...existing, duplicate: true };
    }
  }

  // Görselleri kalıcı kaydet (data-URL) — tercih kapalı değilse
  let contentHtml = data.contentHtml || '';
  if (contentHtml && prefs.embedImages !== false) {
    try {
      contentHtml = await inlineImagesInHtml(contentHtml);
    } catch (err) {
      console.warn('Görsel gömme hatası:', err);
    }
  }

  const note = {
    id: generateId(),
    content: data.content || '',
    contentHtml: contentHtml,
    sourceUrl: data.sourceUrl || '',
    sourceTitle: data.sourceTitle || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: data.tags || [],
    isStarred: false,
    userNote: '',
    captureMethod: data.captureMethod || 'manual'
  };

  notes.unshift(note);
  await chrome.storage.local.set({ notes });

  // Badge güncelle ve PC'ye kaydet
  updateBadge();
  autoSaveToDisk();
  scheduleCloudPush();

  return note;
}

async function getNotes(filter = {}) {
  const raw = await rawNotesWithDiskRestore();
  let notes = _visible(raw);

  if (filter.date) {
    const filterDate = new Date(filter.date).toDateString();
    notes = notes.filter(n => new Date(n.createdAt).toDateString() === filterDate);
  }

  if (filter.tag) {
    notes = notes.filter(n => n.tags.includes(filter.tag));
  }

  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    notes = notes.filter(n =>
      n.content.toLowerCase().includes(searchLower) ||
      n.userNote.toLowerCase().includes(searchLower) ||
      n.tags.some(t => t.toLowerCase().includes(searchLower))
    );
  }

  if (filter.starred) {
    notes = notes.filter(n => n.isStarred);
  }

  return notes;
}

async function getTodayNotes() {
  const today = new Date().toDateString();
  const raw = await rawNotesWithDiskRestore();
  const notes = _visible(raw);
  return notes.filter(n => new Date(n.createdAt).toDateString() === today);
}

async function getAllNotes() {
  const raw = await rawNotesWithDiskRestore();
  return _visible(raw);
}

async function updateNote(data) {
  const result = await chrome.storage.local.get(['notes']);
  const notes = result.notes || [];
  const index = notes.findIndex(n => n.id === data.id);

  if (index !== -1) {
    notes[index] = {
      ...notes[index],
      ...data,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ notes });
    autoSaveToDisk();
    scheduleCloudPush();
    return notes[index];
  }

  return null;
}

async function deleteNote(noteId) {
  // Silme = tombstone (içeriği boşalt, deleted işaretle). Böylece silme
  // diske/buluta taşınır ve birleştirmede not geri DİRİLMEZ; ama "liste
  // boşaldı" diye toplu silme olmaz (mezar taşı olmadan silme yok).
  const result = await chrome.storage.local.get(['notes']);
  const notes = result.notes || [];
  const i = notes.findIndex(n => n.id === noteId);
  if (i !== -1) {
    notes[i] = {
      id: notes[i].id,
      createdAt: notes[i].createdAt,
      updatedAt: new Date().toISOString(),
      deleted: true
    };
    await chrome.storage.local.set({ notes });
  }
  updateBadge();
  autoSaveToDisk();
  scheduleCloudPush();
}

async function importNotes(importedNotes) {
  const result = await chrome.storage.local.get(['notes']);
  const existing = result.notes || [];
  const existingIds = new Set(existing.map(n => n.id));
  const newNotes = importedNotes.filter(n => !existingIds.has(n.id));
  const allNotes = [...newNotes, ...existing];
  await chrome.storage.local.set({ notes: allNotes });
  updateBadge();
  autoSaveToDisk();
  scheduleCloudPush();
}

async function updateBadge() {
  const todayNotes = await getTodayNotes();
  const count = todayNotes.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#00d4aa' });
}

// ==========================================
// Otomatik PC'ye Kaydetme (Native Messaging)
// Her değişiklikte data/notlar.json güncellenir
// ==========================================

const NATIVE_HOST_NAME = 'com.tibbi.notdefteri';
const GIST_FILE_NAME = 'notlar.json';

let cloudConfig = null;
let cloudStatus = { state: 'kapali', lastSync: null, error: null };
let cloudInitPromise = null;
let cloudSyncPromise = null;
let cloudPushTimeout = null;
let diskRestorePromise = null;
let saveToDiskTimeout = null;

function setCloudStatus(state, error = null) {
  cloudStatus = {
    state,
    lastSync: state === 'tamam' ? new Date().toISOString() : cloudStatus.lastSync,
    error
  };
  chrome.storage.local.set({ syncStatus: cloudStatus }).catch(() => {});
}

function nativeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'Bos native host yaniti' });
        }
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

function base64ToBytes(base64) {
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readDiskArchiveText() {
  const info = await nativeMessage({ action: 'disk-info' });
  if (!info || !info.success || !info.exists || !info.bytes || !info.noteCount) {
    return { success: false, info, notes: [] };
  }

  const parts = [];
  let offset = 0;
  const chunkSize = 550000;
  while (offset < info.bytes) {
    const part = await nativeMessage({ action: 'disk-read', offset, length: chunkSize });
    if (!part || !part.success) {
      throw new Error((part && part.error) || 'PC arsivi okunamadi.');
    }
    if (part.chunk) parts.push(base64ToBytes(part.chunk));
    offset = part.nextOffset;
    if (part.done) break;
  }

  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const all = new Uint8Array(total);
  let cursor = 0;
  parts.forEach((p) => {
    all.set(p, cursor);
    cursor += p.length;
  });
  return { success: true, info, text: new TextDecoder('utf-8').decode(all) };
}

async function restoreFromDiskArchive({ force = false, reason = 'auto' } = {}) {
  if (diskRestorePromise) return diskRestorePromise;
  diskRestorePromise = (async () => {
    try {
      const current = await chrome.storage.local.get(['notes']);
      const local = current.notes || [];
      if (!force && local.length > 0) {
        return { success: true, skipped: true, reason, count: local.length };
      }

      const disk = await readDiskArchiveText();
      if (!disk.success || !disk.text) {
        return { success: false, skipped: true, reason, error: 'PC arsivinde okunacak not yok.' };
      }

      const parsed = JSON.parse(disk.text);
      const incoming = Array.isArray(parsed) ? parsed : (parsed.notes || []);
      if (!incoming.length) {
        return { success: false, skipped: true, reason, error: 'PC arsivi bos.' };
      }

      const merged = _mergeById(local, incoming);
      if (_sig(merged) !== _sig(local)) {
        await chrome.storage.local.set({ notes: merged, diskRestoreStatus: { at: Date.now(), count: merged.length, reason } });
        updateBadge();
      }
      return { success: true, restored: true, reason, count: merged.length };
    } catch (err) {
      await chrome.storage.local.set({ diskRestoreStatus: { at: Date.now(), error: err.message, reason } }).catch(() => {});
      return { success: false, reason, error: err.message };
    } finally {
      diskRestorePromise = null;
    }
  })();
  return diskRestorePromise;
}

async function rawNotesWithDiskRestore() {
  const first = await chrome.storage.local.get(['notes']);
  if (Array.isArray(first.notes) && first.notes.length > 0) return first.notes;
  await restoreFromDiskArchive({ reason: 'on-demand' });
  const second = await chrome.storage.local.get(['notes']);
  return second.notes || [];
}

async function loadNativeSyncConfig(force = false) {
  if (cloudConfig && !force) return cloudConfig;
  const response = await nativeMessage({ action: 'sync-get-config' });
  if (!response || !response.success) {
    cloudConfig = null;
    return null;
  }
  cloudConfig = {
    token: response.token || '',
    gistId: response.gistId || '',
    fileName: response.fileName || GIST_FILE_NAME,
    diskCount: response.diskCount || 0
  };
  return cloudConfig;
}

function cloudPublicStatus(extra = {}) {
  return {
    success: true,
    configured: !!(cloudConfig && cloudConfig.token && cloudConfig.gistId),
    hasToken: !!(cloudConfig && cloudConfig.token),
    gistId: (cloudConfig && cloudConfig.gistId) || '',
    fileName: (cloudConfig && cloudConfig.fileName) || GIST_FILE_NAME,
    diskCount: (cloudConfig && cloudConfig.diskCount) || 0,
    status: cloudStatus,
    ...extra
  };
}

async function getCloudSyncStatus() {
  await loadNativeSyncConfig(true);
  if (cloudConfig && cloudConfig.token && cloudConfig.gistId) {
    ensureCloudAlarm();
  }
  return cloudPublicStatus();
}

async function setCloudSyncConfig(data) {
  await loadNativeSyncConfig(true);
  const token = (data.token || '').trim();
  const gistId = (data.gistId || '').trim();
  if (!token && !(cloudConfig && cloudConfig.token)) {
    return { success: false, error: 'GitHub token gerekli.' };
  }

  setCloudStatus('senkron');
  const saved = await nativeMessage({
    action: 'sync-set-config',
    token,
    gistId,
    fileName: GIST_FILE_NAME
  });
  if (!saved || !saved.success) {
    setCloudStatus('hata', (saved && saved.error) || 'Senkron ayari kaydedilemedi.');
    return { success: false, error: cloudStatus.error, status: cloudStatus };
  }

  cloudConfig = {
    token: saved.token || token || (cloudConfig && cloudConfig.token) || '',
    gistId: saved.gistId || '',
    fileName: saved.fileName || GIST_FILE_NAME,
    diskCount: saved.diskCount || 0
  };

  // Ilk kurulum: Gist ID bos ise mevcut PC arsivini native host dogrudan
  // Gist'e yukler. Boylece 2MB+ notlar extension'a native mesajla donmez.
  if (!cloudConfig.gistId) {
    const pushed = await nativeMessage({ action: 'sync-push-disk' });
    if (!pushed || !pushed.success) {
      setCloudStatus('hata', (pushed && pushed.error) || 'Gist olusturulamadi.');
      return { success: false, error: cloudStatus.error, status: cloudStatus };
    }
    cloudConfig.gistId = pushed.gistId || '';
    cloudConfig.fileName = pushed.fileName || GIST_FILE_NAME;
    cloudConfig.diskCount = pushed.diskCount || cloudConfig.diskCount || 0;
  }

  ensureCloudAlarm();
  return cloudFullSync({ reason: 'config' });
}

async function disconnectCloudSync() {
  clearTimeout(cloudPushTimeout);
  cloudConfig = null;
  await nativeMessage({ action: 'sync-clear-config' });
  try { chrome.alarms.clear('cloud-sync'); } catch (e) {}
  setCloudStatus('kapali');
  return cloudPublicStatus({ configured: false, hasToken: false, gistId: '' });
}

function cloudHeaders() {
  return {
    'Authorization': 'Bearer ' + cloudConfig.token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function notesPayload(notes) {
  return JSON.stringify({
    app: 'Tibbi Not Defteri',
    version: '1.3.0-cloud',
    updatedAt: new Date().toISOString(),
    notes
  }, null, 2);
}

function parseCloudNotes(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.notes)) return data.notes;
  } catch (e) {}
  return [];
}

async function fetchCloudNotes() {
  if (!cloudConfig || !cloudConfig.token || !cloudConfig.gistId) return [];
  const res = await fetch('https://api.github.com/gists/' + cloudConfig.gistId, {
    headers: cloudHeaders()
  });
  if (!res.ok) throw new Error('Gist okunamadi (HTTP ' + res.status + ')');
  const gist = await res.json();
  const files = gist.files || {};
  const fileName = cloudConfig.fileName || GIST_FILE_NAME;
  const file = files[fileName] || Object.values(files).find(f => f && f.filename && f.filename.endsWith('.json'));
  if (!file) return [];
  let text = file.content || '';
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { cache: 'no-store' });
    if (!raw.ok) throw new Error('Gist ham dosya okunamadi (HTTP ' + raw.status + ')');
    text = await raw.text();
  }
  return parseCloudNotes(text);
}

async function pushCloudNotes(notes) {
  if (!cloudConfig || !cloudConfig.token || !cloudConfig.gistId) return false;
  const fileName = cloudConfig.fileName || GIST_FILE_NAME;
  const body = { files: {} };
  body.files[fileName] = { content: notesPayload(notes) };
  const res = await fetch('https://api.github.com/gists/' + cloudConfig.gistId, {
    method: 'PATCH',
    headers: cloudHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Gist yazilamadi (HTTP ' + res.status + ')');
  return true;
}

async function saveMergedNotes(notes) {
  await chrome.storage.local.set({ notes });
  updateBadge();
  autoSaveToDisk();
}

async function cloudFullSync({ reason = 'auto' } = {}) {
  if (cloudSyncPromise) return cloudSyncPromise;
  cloudSyncPromise = (async () => {
    try {
      await loadNativeSyncConfig();
      if (!cloudConfig || !cloudConfig.token) {
        setCloudStatus('kapali');
        return cloudPublicStatus({ configured: false });
      }
      if (!cloudConfig.gistId) {
        const pushed = await nativeMessage({ action: 'sync-push-disk' });
        if (!pushed || !pushed.success) throw new Error((pushed && pushed.error) || 'Gist olusturulamadi.');
        cloudConfig.gistId = pushed.gistId || '';
        cloudConfig.fileName = pushed.fileName || GIST_FILE_NAME;
        cloudConfig.diskCount = pushed.diskCount || cloudConfig.diskCount || 0;
      }

      setCloudStatus('senkron');
      let local = await _rawNotes();
      let remote = await fetchCloudNotes();

      // Extension reinstall sonrasi chrome.storage bos olabilir. Gist de bos ise
      // ama PC arsivinde not varsa, buyuk dosyayi native host dogrudan Gist'e iter.
      if (local.length === 0 && remote.length === 0 && cloudConfig.diskCount > 0) {
        const pushed = await nativeMessage({ action: 'sync-push-disk' });
        if (!pushed || !pushed.success) throw new Error((pushed && pushed.error) || 'Disk arsivi Gist e yuklenemedi.');
        cloudConfig.gistId = pushed.gistId || cloudConfig.gistId;
        cloudConfig.fileName = pushed.fileName || cloudConfig.fileName || GIST_FILE_NAME;
        cloudConfig.diskCount = pushed.diskCount || cloudConfig.diskCount;
        remote = await fetchCloudNotes();
      }

      const merged = _mergeById(local, remote);
      if (_sig(merged) !== _sig(local)) {
        await saveMergedNotes(merged);
      }
      await pushCloudNotes(merged);
      setCloudStatus('tamam');
      return cloudPublicStatus({ changed: _sig(merged) !== _sig(local), reason });
    } catch (err) {
      setCloudStatus('hata', err.message);
      return cloudPublicStatus({ success: false, error: err.message, reason });
    } finally {
      cloudSyncPromise = null;
    }
  })();
  return cloudSyncPromise;
}

function scheduleCloudPush() {
  clearTimeout(cloudPushTimeout);
  cloudPushTimeout = setTimeout(() => {
    loadNativeSyncConfig().then((cfg) => {
      if (cfg && cfg.token && cfg.gistId) cloudFullSync({ reason: 'local-change' });
    }).catch(() => {});
  }, 2500);
}

function ensureCloudAlarm() {
  try {
    if (chrome.alarms) chrome.alarms.create('cloud-sync', { periodInMinutes: 1 });
  } catch (e) {}
}

function initCloudSync() {
  if (cloudInitPromise) return cloudInitPromise;
  cloudInitPromise = (async () => {
    const cfg = await loadNativeSyncConfig(true);
    if (cfg && cfg.token) {
      ensureCloudAlarm();
      return cloudFullSync({ reason: 'startup' });
    }
    setCloudStatus('kapali');
    return cloudPublicStatus();
  })().finally(() => { cloudInitPromise = null; });
  return cloudInitPromise;
}

if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    restoreFromDiskArchive({ reason: 'startup' }).then(() => initCloudSync());
  });
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === 'cloud-sync') cloudFullSync({ reason: 'alarm' });
  });
}

restoreFromDiskArchive({ reason: 'startup' }).then(() => initCloudSync());

function autoSaveToDisk() {
  clearTimeout(saveToDiskTimeout);
  saveToDiskTimeout = setTimeout(async () => {
    try {
      const notes = await _rawNotes(); // tombstone'lar DAHİL diske gider
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { action: 'save', notes },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Yerel kaydetme bağlantısı yok:', chrome.runtime.lastError.message);
            chrome.storage.local.set({ diskSaveError: { at: Date.now(), msg: chrome.runtime.lastError.message } });
          } else if (response && response.success) {
            console.log(`✅ ${response.count} not lokale kaydedildi`);
            chrome.storage.local.set({ diskSaveError: null });
          } else {
            chrome.storage.local.set({ diskSaveError: { at: Date.now(), msg: (response && response.error) || 'Bilinmeyen hata' } });
          }
        }
      );
    } catch (err) {
      console.error('Otomatik kaydetme hatası:', err);
    }
  }, 2000);
}
