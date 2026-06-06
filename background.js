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

  // İlk kurulumda boş veri yapısı oluştur
  chrome.storage.local.get(['notes'], (result) => {
    if (!result.notes) {
      chrome.storage.local.set({ notes: [] });
    }
  });
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
});

// ==========================================
// Veri İşlemleri
// ==========================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
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
  const result = await chrome.storage.local.get(['notes', 'preferences']);
  const notes = result.notes || [];
  const prefs = result.preferences || {};

  // Yinelenen koruması: aynı içerikli not zaten kayıtlıysa yenisini ekleme
  const newContent = (data.content || '').trim();
  if (newContent) {
    const existing = notes.find(n => (n.content || '').trim() === newContent);
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

  return note;
}

async function getNotes(filter = {}) {
  const result = await chrome.storage.local.get(['notes']);
  let notes = result.notes || [];

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
  const result = await chrome.storage.local.get(['notes']);
  const notes = result.notes || [];
  return notes.filter(n => new Date(n.createdAt).toDateString() === today);
}

async function getAllNotes() {
  const result = await chrome.storage.local.get(['notes']);
  return result.notes || [];
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
    return notes[index];
  }

  return null;
}

async function deleteNote(noteId) {
  const result = await chrome.storage.local.get(['notes']);
  const notes = (result.notes || []).filter(n => n.id !== noteId);
  await chrome.storage.local.set({ notes });
  updateBadge();
  autoSaveToDisk();
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
let saveToDiskTimeout = null;

function autoSaveToDisk() {
  clearTimeout(saveToDiskTimeout);
  saveToDiskTimeout = setTimeout(async () => {
    try {
      const notes = await getAllNotes();
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
