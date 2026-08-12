// ==========================================
// Tıbbi Not Defteri - AI Seçici Ayarları
// customSelectors'ı chrome.storage.local'a kaydeder; ai-parser bunları okur.
// ==========================================

// Varsayılan seçiciler (yalnızca placeholder/gösterim için — ai-parser kendi
// varsayılanlarını kullanır; buradakiler kullanıcıya referans olsun diye).
const PLATFORMS = [
  {
    key: 'gemini', label: 'Google Gemini (gemini.google.com)',
    response: 'message-content.model-response-text',
    user: 'user-query .query-text, .query-text'
  },
  {
    key: 'chatgpt', label: 'ChatGPT (chatgpt.com)',
    response: '[data-message-author-role="assistant"] .markdown',
    user: '[data-message-author-role="user"]'
  },
  {
    key: 'claude', label: 'Claude (claude.ai)',
    response: '.font-claude-message',
    user: '[data-testid="user-message"]'
  },
  {
    key: 'grok', label: 'Grok (grok.com)',
    response: '[data-testid="message-text"]',
    user: '[data-testid="user-message"]'
  }
];

const container = document.getElementById('platforms');
const statusEl = document.getElementById('status');

// Platform kartlarını oluştur
PLATFORMS.forEach((p) => {
  const card = document.createElement('div');
  card.className = 'platform';
  card.innerHTML = `
    <h2>${p.label}</h2>
    <div class="field">
      <label>AI cevabı seçicisi (responseSelector)</label>
      <input type="text" id="${p.key}-response" placeholder="${escapeAttr(p.response)}">
    </div>
    <div class="field">
      <label>Kullanıcı sorusu seçicisi (userSelector)</label>
      <input type="text" id="${p.key}-user" placeholder="${escapeAttr(p.user)}">
      <div class="hint">Varsayılan: <code>${escapeHtml(p.user)}</code></div>
    </div>
  `;
  container.appendChild(card);
});

// Kayıtlı değerleri yükle
chrome.storage.local.get(['customSelectors', 'preferences'], (result) => {
  const custom = result.customSelectors || {};
  PLATFORMS.forEach((p) => {
    const c = custom[p.key] || {};
    if (c.responseSelector) document.getElementById(`${p.key}-response`).value = c.responseSelector;
    if (c.userSelector) document.getElementById(`${p.key}-user`).value = c.userSelector;
  });

  // Görsel gömme tercihi (varsayılan: açık)
  const prefs = result.preferences || {};
  document.getElementById('embedImages').checked = prefs.embedImages !== false;

  // Kaydırma modu (varsayılan: kilit)
  document.getElementById('scrollMode').value = prefs.scrollMode || 'lock';
});

// Kaydet
document.getElementById('saveBtn').addEventListener('click', () => {
  const custom = {};
  PLATFORMS.forEach((p) => {
    const resp = document.getElementById(`${p.key}-response`).value.trim();
    const user = document.getElementById(`${p.key}-user`).value.trim();
    if (resp || user) {
      custom[p.key] = {};
      if (resp) custom[p.key].responseSelector = resp;
      if (user) custom[p.key].userSelector = user;
    }
  });
  const embedImages = document.getElementById('embedImages').checked;
  const scrollMode = document.getElementById('scrollMode').value;

  chrome.storage.local.get('preferences', (r) => {
    const prefs = r.preferences || {};
    prefs.embedImages = embedImages;
    prefs.scrollMode = scrollMode;
    chrome.storage.local.set({ customSelectors: custom, preferences: prefs }, () => {
      showStatus('✅ Kaydedildi. İlgili AI sekmesini yenileyin.');
    });
  });
});

// Sıfırla
document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.remove('customSelectors', () => {
    PLATFORMS.forEach((p) => {
      document.getElementById(`${p.key}-response`).value = '';
      document.getElementById(`${p.key}-user`).value = '';
    });
    showStatus('↩️ Varsayılana sıfırlandı. İlgili AI sekmesini yenileyin.');
  });
});

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

// ==========================================
// Bulut Senkron Ayarlari
// ==========================================
function sendBg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: 'Yanit alinamadi' });
    });
  });
}

function syncLabel(status) {
  status = status || { state: 'kapali' };
  const labels = {
    kapali: 'kapali',
    senkron: 'senkronlaniyor...',
    tamam: 'senkron acik',
    hata: 'hata'
  };
  let label = labels[status.state] || status.state || 'bilinmiyor';
  if (status.state === 'tamam' && status.lastSync) {
    label += ' - son: ' + new Date(status.lastSync).toLocaleString('tr-TR');
  }
  if (status.state === 'hata' && status.error) label += ': ' + status.error;
  return label;
}

function renderSyncInfo(info) {
  const urlInput = document.getElementById('syncSunucuUrl');
  const kullaniciInput = document.getElementById('syncKullanici');
  const parolaInput = document.getElementById('syncParola');
  const hint = document.getElementById('syncSunucuHint');
  const statusText = document.getElementById('syncStatusText');
  if (!urlInput || !kullaniciInput || !parolaInput || !hint || !statusText) return;

  const kurulu = !!(info && info.configured);
  urlInput.value = (info && info.sunucuUrl) || '';
  kullaniciInput.value = (info && info.kullanici) || '';
  parolaInput.value = '';
  parolaInput.placeholder = kurulu
    ? '(kayitli - degistirmek icin yeni parola girin)'
    : 'sunucu giris parolasi';
  hint.textContent = kurulu
    ? 'Sunucu kayitli: ' + info.sunucuUrl
    : 'Kayitli sunucu yok.';
  statusText.textContent = 'Durum: ' + syncLabel(info && info.status);
}

async function loadSyncInfo() {
  const info = await sendBg({ action: 'sync-get-status' });
  renderSyncInfo(info);
  return info;
}

function initCloudSyncSettings() {
  const saveBtn = document.getElementById('syncSaveBtn');
  const nowBtn = document.getElementById('syncNowBtn');
  const disconnectBtn = document.getElementById('syncDisconnectBtn');
  if (!saveBtn || !nowBtn || !disconnectBtn) return;

  loadSyncInfo();

  saveBtn.addEventListener('click', async () => {
    const sunucuUrl = document.getElementById('syncSunucuUrl').value.trim();
    const kullanici = document.getElementById('syncKullanici').value.trim();
    const parola = document.getElementById('syncParola').value.trim();
    saveBtn.disabled = true;
    document.getElementById('syncStatusText').textContent = 'Durum: senkronlaniyor...';
    const result = await sendBg({
      action: 'sync-set-config',
      data: { sunucuUrl, kullanici, parola }
    });
    renderSyncInfo(result);
    if (!result.success) showStatus('Sunucu senkron hatasi: ' + (result.error || 'bilinmeyen hata'));
    else showStatus('Sunucu senkronu kaydedildi.');
    saveBtn.disabled = false;
  });

  nowBtn.addEventListener('click', async () => {
    nowBtn.disabled = true;
    document.getElementById('syncStatusText').textContent = 'Durum: senkronlaniyor...';
    const result = await sendBg({ action: 'sync-now' });
    renderSyncInfo(result);
    if (!result.success) showStatus('Senkron hatasi: ' + (result.error || 'bilinmeyen hata'));
    else showStatus('Senkron tamamlandi.');
    nowBtn.disabled = false;
  });

  disconnectBtn.addEventListener('click', async () => {
    if (!confirm('Bulut baglantisi kesilsin mi? Notlar yerelde kalir, yalnizca otomatik senkron durur.')) return;
    const result = await sendBg({ action: 'sync-disconnect' });
    renderSyncInfo(result);
    showStatus('Bulut baglantisi kesildi.');
  });
}

initCloudSyncSettings();
