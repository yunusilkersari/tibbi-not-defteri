// ==========================================
// Tıbbi Not Defteri - Floating Button
// Metin seçildiğinde yanında beliren yakalama butonu
// ==========================================

(function () {
  'use strict';

  let floatBtn = null;
  let hideTimeout = null;

  function createFloatButton() {
    if (floatBtn) return floatBtn;

    floatBtn = document.createElement('div');
    floatBtn.className = 'tnd-root tnd-float-btn';
    floatBtn.innerHTML = `
      <span class="tnd-float-btn-icon">📋</span>
      <span class="tnd-float-btn-text">Deftere Aktar</span>
      <span class="tnd-float-btn-shortcut">Alt+Q</span>
    `;

    floatBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      captureSelection();
    });

    document.body.appendChild(floatBtn);
    return floatBtn;
  }

  function showFloatButton(x, y) {
    const btn = createFloatButton();
    clearTimeout(hideTimeout);

    // Ekran sınırlarını kontrol et
    const btnWidth = 200;
    const btnHeight = 36;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x + window.scrollX + 8;
    let posY = y + window.scrollY - btnHeight - 8;

    if (posX + btnWidth > viewportWidth + window.scrollX) {
      posX = x + window.scrollX - btnWidth - 8;
    }
    if (posY < window.scrollY + 8) {
      posY = y + window.scrollY + 20;
    }

    btn.style.left = posX + 'px';
    btn.style.top = posY + 'px';

    requestAnimationFrame(() => {
      btn.classList.add('tnd-visible');
    });
  }

  function hideFloatButton() {
    if (!floatBtn) return;
    floatBtn.classList.remove('tnd-visible');
  }

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (!text) return;

    // Seçimin HTML içeriğini al
    let contentHtml = '';
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const temp = document.createElement('div');
      temp.appendChild(fragment);
      temp.querySelectorAll('img').forEach(img => {
        if (img.src) img.setAttribute('src', img.src);
      });
      contentHtml = temp.innerHTML;
    }

    hideFloatButton();

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: text,
        contentHtml: contentHtml || text,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        captureMethod: 'floating-button'
      }
    }, (response) => {
      if (response && response.success) {
        showToast('✅ Not deftere aktarıldı!', 'success');
      } else {
        showToast('❌ Kayıt başarısız oldu', 'error');
      }
    });
  }

  // Metin seçimi algılama
  document.addEventListener('mouseup', (e) => {
    // Kendi elementlerimize tıklandıysa atla
    if (e.target.closest('.tnd-root') || e.target.closest('.tnd-float-btn') || e.target.closest('.tnd-ai-panel')) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 3) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showFloatButton(rect.right, rect.top);
      } else {
        hideFloatButton();
      }
    }, 10);
  });

  // Sayfa tıklandığında butonu gizle
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.tnd-float-btn')) {
      hideTimeout = setTimeout(hideFloatButton, 150);
    }
  });

  // Scroll'da gizle
  document.addEventListener('scroll', () => {
    hideFloatButton();
  }, { passive: true });

  // Toast bildirimi göster (global erişim için)
  window.__TND_showToast = showToast;

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.tnd-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `tnd-root tnd-toast tnd-toast-${type}`;
    toast.innerHTML = `
      <span class="tnd-toast-icon">${type === 'success' ? '✅' : '❌'}</span>
      <span class="tnd-toast-text">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'tnd-toast-out 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
})();
