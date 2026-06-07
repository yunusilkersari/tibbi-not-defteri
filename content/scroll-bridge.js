// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması Köprüsü (ISOLATED world)
// MAIN world'deki scroll-patch.js, chrome.storage'a erişemez. Bu köprü
// preferences'i okuyup {enabled, mode} bilgisini postMessage ile MAIN'e iletir.
// ==========================================
(function () {
  'use strict';

  function post(prefs) {
    const p = prefs || {};
    window.postMessage({
      source: 'TND_SCROLL',
      type: 'config',
      enabled: p.enabled !== false,
      mode: (p.scrollMode === 'off') ? 'off' : 'lock'
    }, '*');
  }

  function sendCurrent() {
    try {
      chrome.storage.local.get('preferences', (r) => post(r && r.preferences));
    } catch (e) { /* extension context yok -> yoksay */ }
  }

  // İlk değer
  sendCurrent();

  // Tercih değişince güncelle
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.preferences) post(changes.preferences.newValue);
    });
  } catch (e) { /* yoksay */ }

  // MAIN bizden önce yüklendiyse config ister -> cevapla
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const m = e.data;
    if (m && m.source === 'TND_SCROLL' && m.type === 'request') sendCurrent();
  });
})();
