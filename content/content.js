// ==========================================
// Tıbbi Not Defteri - Content Script (Ana)
// Alt+Q, Alt+1, Alt+2 kısayolları ve AI paragraf paneli
// ==========================================

(function () {
  'use strict';

  // ==========================================
  // Aç/Kapa durumu — diğer içerik scriptleri de bunu kullanır
  // (window.__TND_isEnabled). Varsayılan: açık.
  // ==========================================
  let __tndEnabled = true;
  window.__TND_isEnabled = () => __tndEnabled;

  // Kapatıldığında çağrılacak gizleme kancaları (her script kendi gizleyicisini ekler)
  window.__TND_hideHooks = window.__TND_hideHooks || [];
  window.__TND_hideAllButtons = () => {
    window.__TND_hideHooks.forEach((fn) => { try { fn(); } catch (e) { /* yoksay */ } });
  };

  chrome.storage.local.get('preferences', (result) => {
    const prefs = result.preferences || {};
    __tndEnabled = prefs.enabled !== false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.preferences) {
      const prefs = changes.preferences.newValue || {};
      __tndEnabled = prefs.enabled !== false;
      // Kapatıldıysa sayfadaki butonları hemen gizle
      if (!__tndEnabled && typeof window.__TND_hideAllButtons === 'function') {
        window.__TND_hideAllButtons();
      }
    }
  });

  // ==========================================
  // Background'dan gelen mesajları dinle
  // ==========================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Uzantı kapalıysa kısayol/menü tetiklerini yok say
    if (!__tndEnabled) {
      sendResponse({ success: false, disabled: true });
      return true;
    }

    switch (message.action) {
      case 'capture-selection':
        handleCaptureSelection();
        sendResponse({ success: true });
        break;

      case 'parse-last-response':
        handleParseLastResponse();
        sendResponse({ success: true });
        break;

      case 'capture-full-response':
        handleCaptureFullResponse();
        sendResponse({ success: true });
        break;

      case 'capture-qa':
        handleCaptureQA();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // ==========================================
  // Alt+3: O an okunan cevabı sorusuyla birlikte aktar
  // ==========================================
  function handleCaptureQA() {
    if (!window.__TND_QA) {
      showToast('⚠️ Bu sayfada Soru+Cevap kaydı desteklenmiyor', 'error');
      return;
    }
    const answer = window.__TND_QA.getMostVisibleAnswer();
    if (!answer) {
      showToast('⚠️ Ekranda bir AI cevabı bulunamadı', 'error');
      return;
    }
    window.__TND_QA.saveAnswer(answer);
  }

  // ==========================================
  // Alt+Q: Seçili metni deftere aktar
  // ==========================================
  function handleCaptureSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (!text) {
      showToast('⚠️ Önce bir metin seçin', 'error');
      return;
    }

    // Seçimin HTML içeriğini al
    let contentHtml = '';
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const temp = document.createElement('div');
      temp.appendChild(fragment);
      // Resimleri mutlak URL'ye çevir
      temp.querySelectorAll('img').forEach(img => {
        if (img.src) img.setAttribute('src', img.src);
      });
      contentHtml = temp.innerHTML;
    }

    // Güvenlik: kayıttan önce HTML'i temizle
    if (contentHtml && window.__TND_sanitizeHtml) {
      contentHtml = window.__TND_sanitizeHtml(contentHtml);
    }

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: text,
        contentHtml: contentHtml || text,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        captureMethod: 'shortcut-altq'
      }
    }, (response) => {
      if (response && response.success) {
        showToast(response.duplicate ? '✅ Bu not zaten defterde kayıtlı' : '✅ Not deftere aktarıldı!', 'success');
      }
    });
  }

  // ==========================================
  // Alt+1: Son AI yanıtını paragraflara böl
  // ==========================================
  function handleParseLastResponse() {
    if (!window.__TND_AIParser) {
      showToast('⚠️ AI ayrıştırıcı yüklenemedi', 'error');
      return;
    }

    const data = window.__TND_AIParser.parseResponseToParagraphs();
    if (!data || data.paragraphs.length === 0) {
      showToast('⚠️ AI yanıtı bulunamadı', 'error');
      return;
    }

    showParagraphPanel(data);
  }

  // ==========================================
  // Alt+2: Son AI yanıtının tamamını aktar
  // ==========================================
  function handleCaptureFullResponse() {
    if (!window.__TND_AIParser) {
      showToast('⚠️ AI ayrıştırıcı yüklenemedi', 'error');
      return;
    }

    const data = window.__TND_AIParser.getFullResponse();
    if (!data || !data.text) {
      showToast('⚠️ AI yanıtı bulunamadı', 'error');
      return;
    }

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: data.text,
        contentHtml: data.html || data.text,
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        captureMethod: 'shortcut-alt2-full'
      }
    }, (response) => {
      if (response && response.success) {
        showToast(response.duplicate ? '✅ Bu yanıt zaten defterde kayıtlı' : '✅ Tam yanıt deftere aktarıldı!', 'success');
      }
    });
  }

  // ==========================================
  // Paragraf Seçim Paneli (Alt+1 için)
  // ==========================================
  function showParagraphPanel(data) {
    // Mevcut paneli kaldır
    removeExistingPanel();

    const selectedParagraphs = new Set();

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'tnd-root tnd-ai-overlay';
    overlay.addEventListener('click', () => closeParagraphPanel(overlay, panel));

    // Panel
    const panel = document.createElement('div');
    panel.className = 'tnd-root tnd-ai-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'tnd-ai-panel-header';
    header.innerHTML = `
      <div class="tnd-ai-panel-title">
        <span class="tnd-ai-panel-title-icon">🔬</span>
        <span class="tnd-ai-panel-title-text">AI Yanıtı — ${data.paragraphs.length} Paragraf</span>
      </div>
      <div class="tnd-ai-panel-actions">
        <button class="tnd-ai-panel-btn tnd-select-all-btn">☑ Tümünü Seç</button>
        <button class="tnd-ai-panel-btn tnd-save-selected-btn" disabled>💾 Seçilenleri Kaydet</button>
        <button class="tnd-ai-panel-btn tnd-ai-panel-btn-close tnd-close-btn">✕</button>
      </div>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'tnd-ai-panel-body';

    data.paragraphs.forEach((para, index) => {
      const card = document.createElement('div');
      card.className = 'tnd-para-card';
      card.style.position = 'relative';

      const checkbox = document.createElement('div');
      checkbox.className = 'tnd-para-checkbox';
      checkbox.addEventListener('click', () => {
        toggleParagraph(index, checkbox, card, selectedParagraphs, panel);
      });

      const content = document.createElement('div');
      content.className = 'tnd-para-content';
      content.textContent = para.text;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'tnd-para-save-btn';
      saveBtn.innerHTML = '📋 Aktar';
      saveBtn.addEventListener('click', () => {
        saveSingleParagraph(para, data, saveBtn, card);
      });

      card.appendChild(checkbox);
      card.appendChild(content);
      card.appendChild(saveBtn);
      body.appendChild(card);
    });

    // Footer
    const footer = document.createElement('div');
    footer.className = 'tnd-ai-panel-footer';
    footer.innerHTML = `
      <span class="tnd-ai-panel-footer-info">
        Kaynak: ${data.sourceTitle} • Platform: ${data.platform}
      </span>
      <span class="tnd-ai-panel-footer-info">
        Seçili: <span class="tnd-ai-panel-footer-count tnd-selected-count">0</span> / ${data.paragraphs.length}
      </span>
    `;

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Animasyon
    requestAnimationFrame(() => {
      overlay.classList.add('tnd-visible');
      panel.classList.add('tnd-visible');
    });

    // Event listeners
    const closeBtn = header.querySelector('.tnd-close-btn');
    closeBtn.addEventListener('click', () => closeParagraphPanel(overlay, panel));

    const selectAllBtn = header.querySelector('.tnd-select-all-btn');
    let allSelected = false;
    selectAllBtn.addEventListener('click', () => {
      allSelected = !allSelected;
      const checkboxes = body.querySelectorAll('.tnd-para-checkbox');
      const cards = body.querySelectorAll('.tnd-para-card');
      checkboxes.forEach((cb, i) => {
        if (allSelected) {
          cb.classList.add('tnd-checked');
          cards[i].classList.add('tnd-selected');
          selectedParagraphs.add(i);
        } else {
          cb.classList.remove('tnd-checked');
          cards[i].classList.remove('tnd-selected');
          selectedParagraphs.delete(i);
        }
      });
      selectAllBtn.innerHTML = allSelected ? '☐ Seçimi Kaldır' : '☑ Tümünü Seç';
      updateSelectedCount(panel, selectedParagraphs);
      updateSaveButtonState(panel, selectedParagraphs);
    });

    const saveSelectedBtn = header.querySelector('.tnd-save-selected-btn');
    saveSelectedBtn.addEventListener('click', () => {
      saveSelectedParagraphs(data, selectedParagraphs, overlay, panel);
    });

    // ESC ile kapat
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeParagraphPanel(overlay, panel);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function toggleParagraph(index, checkbox, card, selectedParagraphs, panel) {
    if (selectedParagraphs.has(index)) {
      selectedParagraphs.delete(index);
      checkbox.classList.remove('tnd-checked');
      card.classList.remove('tnd-selected');
    } else {
      selectedParagraphs.add(index);
      checkbox.classList.add('tnd-checked');
      card.classList.add('tnd-selected');
    }
    updateSelectedCount(panel, selectedParagraphs);
    updateSaveButtonState(panel, selectedParagraphs);
  }

  function updateSelectedCount(panel, selectedParagraphs) {
    const countEl = panel.querySelector('.tnd-selected-count');
    if (countEl) countEl.textContent = selectedParagraphs.size;
  }

  function updateSaveButtonState(panel, selectedParagraphs) {
    const saveBtn = panel.querySelector('.tnd-save-selected-btn');
    if (saveBtn) {
      saveBtn.disabled = selectedParagraphs.size === 0;
      saveBtn.style.opacity = selectedParagraphs.size === 0 ? '0.4' : '1';
    }
  }

  function saveSingleParagraph(para, data, saveBtn, card) {
    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: para.text,
        contentHtml: para.html || para.text,
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        captureMethod: 'ai-paragraph'
      }
    }, (response) => {
      if (response && response.success) {
        saveBtn.classList.add('tnd-saved');
        saveBtn.innerHTML = response.duplicate ? '✓ Zaten var' : '✓ Kaydedildi';
        card.classList.add('tnd-saved');
      }
    });
  }

  function saveSelectedParagraphs(data, selectedParagraphs, overlay, panel) {
    if (selectedParagraphs.size === 0) return;

    // Seçilen paragrafları sıralı olarak birleştir (tek not)
    const sortedIndexes = Array.from(selectedParagraphs).sort((a, b) => a - b);
    const combinedText = sortedIndexes
      .map(index => data.paragraphs[index].text)
      .join('\n\n');

    const combinedHtml = sortedIndexes
      .map(index => {
        const p = data.paragraphs[index];
        const tag = p.tag || 'p';
        return p.html ? `<${tag}>${p.html}</${tag}>` : `<p>${p.text}</p>`;
      })
      .join('');

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: combinedText,
        contentHtml: combinedHtml,
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        captureMethod: 'ai-paragraph-batch'
      }
    }, (response) => {
      if (response && response.success) {
        showToast(response.duplicate
          ? '✅ Bu paragraflar zaten defterde kayıtlı'
          : `✅ ${sortedIndexes.length} paragraf tek not olarak aktarıldı!`, 'success');
        closeParagraphPanel(overlay, panel);
      }
    });
  }

  function closeParagraphPanel(overlay, panel) {
    overlay.classList.remove('tnd-visible');
    panel.classList.remove('tnd-visible');
    setTimeout(() => {
      overlay.remove();
      panel.remove();
    }, 350);
  }

  function removeExistingPanel() {
    document.querySelectorAll('.tnd-ai-overlay, .tnd-ai-panel').forEach(el => el.remove());
  }

  function showToast(message, type) {
    if (window.__TND_showToast) {
      window.__TND_showToast(message, type);
    }
  }
})();
