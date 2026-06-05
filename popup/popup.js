// ==========================================
// Tıbbi Not Defteri - Popup Script
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Tarih göster
  const dateEl = document.getElementById('currentDate');
  const now = new Date();
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  dateEl.textContent = now.toLocaleDateString('tr-TR', options);

  // Tema yükle
  await loadTheme();

  // İstatistikleri yükle
  await loadStats();

  // Son notları yükle
  await loadRecentNotes();

  // Hızlı not ekleme
  const quickNoteBtn = document.getElementById('quickNoteBtn');
  const quickNoteInput = document.getElementById('quickNoteInput');

  quickNoteBtn.addEventListener('click', async () => {
    const text = quickNoteInput.value.trim();
    if (!text) return;

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: text,
        sourceUrl: '',
        sourceTitle: 'Hızlı Not',
        captureMethod: 'quick-note'
      }
    }, async (response) => {
      if (response && response.success) {
        quickNoteInput.value = '';
        quickNoteBtn.innerHTML = '<span>✅</span> Kaydedildi!';
        quickNoteBtn.style.background = 'rgba(0, 212, 170, 0.25)';
        setTimeout(() => {
          quickNoteBtn.innerHTML = '<span>📝</span> Kaydet';
          quickNoteBtn.style.background = '';
        }, 1500);
        await loadStats();
        await loadRecentNotes();
      }
    });
  });

  // Enter ile kaydet
  quickNoteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      quickNoteBtn.click();
    }
  });

  // Not defterini aç
  document.getElementById('openNotebook').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'open-notebook' });
    window.close();
  });

  // Tema değiştirme
  document.getElementById('popupThemeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.popup-theme-btn');
    if (!btn) return;
    const theme = btn.dataset.theme;
    applyTheme(theme);
    // Tercihi kaydet
    chrome.storage.local.get('preferences', (result) => {
      const prefs = result.preferences || {};
      prefs.theme = theme;
      chrome.storage.local.set({ preferences: prefs });
    });
  });
});

async function loadStats() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get-all-notes' }, (response) => {
      if (response && response.success) {
        const notes = response.notes;
        const today = new Date().toDateString();
        const todayNotes = notes.filter(n => new Date(n.createdAt).toDateString() === today);
        const starred = notes.filter(n => n.isStarred);

        document.getElementById('todayCount').textContent = todayNotes.length;
        document.getElementById('totalCount').textContent = notes.length;
        document.getElementById('starredCount').textContent = starred.length;
      }
      resolve();
    });
  });
}

async function loadRecentNotes() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get-all-notes' }, (response) => {
      const container = document.getElementById('recentNotes');
      container.innerHTML = '';

      if (!response || !response.success || response.notes.length === 0) {
        container.innerHTML = '<div class="popup-empty">Henüz not yok. Bir metin seçip Alt+Q basın!</div>';
        resolve();
        return;
      }

      const recentNotes = response.notes.slice(0, 5);

      recentNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'popup-note-item';

        const time = new Date(note.createdAt);
        const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        let sourceName = note.sourceTitle || 'Bilinmeyen Kaynak';
        if (sourceName.length > 30) sourceName = sourceName.substring(0, 30) + '...';

        const contentPreview = note.content.length > 100
          ? note.content.substring(0, 100) + '...'
          : note.content;

        item.innerHTML = `
          <div class="popup-note-content">${escapeHtml(contentPreview)}</div>
          <div class="popup-note-meta">
            <span class="popup-note-source">${escapeHtml(sourceName)}</span>
            <span class="popup-note-time">${timeStr}</span>
          </div>
        `;

        container.appendChild(item);
      });

      resolve();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadTheme() {
  try {
    const result = await chrome.storage.local.get('preferences');
    const prefs = result.preferences || {};
    const theme = prefs.theme || 'dark';
    applyTheme(theme);
  } catch (e) {
    // varsayılan koyu tema
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  // Toggle butonlarını güncelle
  document.querySelectorAll('.popup-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}
