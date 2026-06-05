// ==========================================
// Tıbbi Not Defteri - Ana Uygulama Script
// Takvim, not kartları, arama, filtreleme, CRUD
// ==========================================

(function () {
  'use strict';

  // ==========================================
  // Uygulama Durumu
  // ==========================================
  const state = {
    currentDate: new Date(),
    selectedDate: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    activeFilter: 'all',
    activeTag: null,
    searchQuery: '',
    editingNoteId: null,
    deletingNoteId: null,
    readingNoteId: null,
    readingNoteIndex: -1,
    readModalNotes: [],
    readModalFullscreen: false
  };

  // ==========================================
  // Türkçe Tarih Yardımcıları
  // ==========================================
  const MONTHS_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const DAYS_TR = [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
  ];

  const CAPTURE_METHODS = {
    'shortcut-altq': 'Alt+Q',
    'floating-button': 'Buton',
    'context-menu': 'Sağ Tık',
    'shortcut-alt2-full': 'Alt+2',
    'ai-paragraph': 'AI Paragraf',
    'ai-paragraph-batch': 'AI Toplu',
    'quick-note': 'Hızlı Not',
    'manual': 'Manuel'
  };

  // ==========================================
  // DOM Referansları
  // ==========================================
  const DOM = {
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    menuToggle: document.getElementById('menuToggle'),
    newNoteBtn: document.getElementById('newNoteBtn'),

    // Calendar
    calMonth: document.getElementById('calMonth'),
    calDays: document.getElementById('calDays'),
    calPrev: document.getElementById('calPrev'),
    calNext: document.getElementById('calNext'),

    // Search
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),

    // Tags
    tagCloud: document.getElementById('tagCloud'),

    // Stats
    statTotal: document.getElementById('statTotal'),
    statToday: document.getElementById('statToday'),
    statStarred: document.getElementById('statStarred'),

    // Topbar
    topbarDay: document.getElementById('topbarDay'),
    topbarDate: document.getElementById('topbarDate'),
    topbarNoteCount: document.getElementById('topbarNoteCount'),

    // Notes
    notesContainer: document.getElementById('notesContainer'),
    notesEmpty: document.getElementById('notesEmpty'),

    // Data actions
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),

    // Modals
    editModal: document.getElementById('editModal'),
    editContent: document.getElementById('editContent'),
    editUserNote: document.getElementById('editUserNote'),
    editTags: document.getElementById('editTags'),

    newNoteModal: document.getElementById('newNoteModal'),
    newNoteContent: document.getElementById('newNoteContent'),
    newNoteTags: document.getElementById('newNoteTags'),

    deleteModal: document.getElementById('deleteModal'),

    readModal: document.getElementById('readModal'),
    readModalDialog: document.getElementById('readModalDialog'),
    readModalContent: document.getElementById('readModalContent'),
    readModalUserNote: document.getElementById('readModalUserNote'),
    readModalSource: document.getElementById('readModalSource'),
    readModalTags: document.getElementById('readModalTags'),
    readModalMeta: document.getElementById('readModalMeta'),
    readModalPrev: document.getElementById('readModalPrev'),
    readModalNext: document.getElementById('readModalNext'),
    readModalCounter: document.getElementById('readModalCounter'),
    readModalFullscreen: document.getElementById('readModalFullscreen'),
    readModalWidthControl: document.getElementById('readModalWidthControl'),
    readModalWidthSlider: document.getElementById('readModalWidthSlider'),
    readModalWidthValue: document.getElementById('readModalWidthValue'),
    themeToggle: document.getElementById('themeToggle')
  };

  // ==========================================
  // Başlatma
  // ==========================================
  async function init() {
    await loadPreferences();
    updateTopbar();
    renderCalendar();
    await refreshAll();
    bindEvents();
  }

  // ==========================================
  // Event Binding
  // ==========================================
  function bindEvents() {
    // Sidebar toggle
    DOM.sidebarToggle.addEventListener('click', toggleSidebar);
    DOM.menuToggle.addEventListener('click', toggleSidebar);

    // Calendar nav
    DOM.calPrev.addEventListener('click', () => {
      state.calendarMonth--;
      if (state.calendarMonth < 0) {
        state.calendarMonth = 11;
        state.calendarYear--;
      }
      renderCalendar();
    });

    DOM.calNext.addEventListener('click', () => {
      state.calendarMonth++;
      if (state.calendarMonth > 11) {
        state.calendarMonth = 0;
        state.calendarYear++;
      }
      renderCalendar();
    });

    // Search
    let searchTimeout;
    DOM.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      state.searchQuery = DOM.searchInput.value.trim();
      DOM.searchClear.style.display = state.searchQuery ? 'flex' : 'none';
      searchTimeout = setTimeout(() => renderNotes(), 300);
    });

    DOM.searchClear.addEventListener('click', () => {
      DOM.searchInput.value = '';
      state.searchQuery = '';
      DOM.searchClear.style.display = 'none';
      renderNotes();
    });

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.filter;
        state.selectedDate = null;
        state.activeTag = null;
        renderCalendar();
        renderNotes();
        updateTopbar();
      });
    });

    // New Note
    DOM.newNoteBtn.addEventListener('click', openNewNoteModal);

    // Export/Import
    DOM.exportBtn.addEventListener('click', handleExport);
    DOM.importBtn.addEventListener('click', () => DOM.importFile.click());
    DOM.importFile.addEventListener('change', handleImport);

    // Edit Modal
    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editModalCancel').addEventListener('click', closeEditModal);
    document.getElementById('editModalSave').addEventListener('click', handleEditSave);

    // New Note Modal
    document.getElementById('newNoteModalClose').addEventListener('click', closeNewNoteModal);
    document.getElementById('newNoteModalCancel').addEventListener('click', closeNewNoteModal);
    document.getElementById('newNoteModalSave').addEventListener('click', handleNewNoteSave);

    // Delete Modal
    document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteModalConfirm').addEventListener('click', handleDeleteConfirm);

    // ESC ile modalları kapat, sol/sağ ok ile notlar arası geçiş
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEditModal();
        closeNewNoteModal();
        closeDeleteModal();
        closeReadModal();
      }
      // Read modal açıkken sol/sağ ok: notlar arası geçiş
      if (DOM.readModal.style.display !== 'none' && state.readModalNotes.length > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateReadModal(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateReadModal(1);
        }
      }
    });

    // Read modal body'yi focusable yap (ok tuşlarıyla scroll için)
    const readModalBody = DOM.readModal.querySelector('.modal-body');
    if (readModalBody) {
      readModalBody.setAttribute('tabindex', '-1');
      readModalBody.style.outline = 'none';
    }

    // Read modal içinde herhangi bir yere tıklayınca odağı body'ye ver
    // böylece ok tuşları her zaman scroll yapar
    DOM.readModal.addEventListener('mouseup', () => {
      if (readModalBody) {
        setTimeout(() => readModalBody.focus(), 150);
      }
    });

    // Read Modal
    document.getElementById('readModalClose').addEventListener('click', closeReadModal);
    document.getElementById('readModalCloseBtn').addEventListener('click', closeReadModal);
    document.getElementById('readModalEditBtn').addEventListener('click', () => {
      const noteId = state.readingNoteId;
      closeReadModal();
      if (noteId) {
        NotStorage.getAll().then(notes => {
          const note = notes.find(n => n.id === noteId);
          if (note) openEditModal(note);
        });
      }
    });

    // Read Modal Navigation
    DOM.readModalPrev.addEventListener('click', () => navigateReadModal(-1));
    DOM.readModalNext.addEventListener('click', () => navigateReadModal(1));

    // Overlay'e (dışarıya) tıklayınca kapat (tam ekranda değilken)
    DOM.readModal.addEventListener('click', (e) => {
      if (e.target === DOM.readModal && !document.fullscreenElement) {
        closeReadModal();
      }
    });

    // Fullscreen toggle
    DOM.readModalFullscreen.addEventListener('click', toggleReadFullscreen);

    // Width slider toggle (açılır/kapanır panel)
    document.getElementById('widthToggleBtn').addEventListener('click', () => {
      const panel = document.getElementById('widthSliderPanel');
      panel.classList.toggle('open');
    });

    // Width slider
    DOM.readModalWidthSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      DOM.readModalWidthValue.textContent = val + '%';
      DOM.readModal.style.setProperty('--read-modal-width', val + '%');
      savePreferences();
    });
    // Slider'dan odağı kaldır (ok tuşlarının içeriği kaydırmasını sağla)
    DOM.readModalWidthSlider.addEventListener('mouseup', () => {
      DOM.readModalWidthSlider.blur();
    });
    DOM.readModalWidthSlider.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    });

    // Topbar tam ekran
    document.getElementById('topbarFullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    // Theme toggle
    DOM.themeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.topbar-theme-btn');
      if (!btn) return;
      const theme = btn.dataset.theme;
      setTheme(theme);
      savePreferences();
    });

    // Fullscreen change event (ESC çıkışı algılama)
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        state.readModalFullscreen = false;
        updateFullscreenIcon(false);
      }
    });

    // Storage değişikliklerini dinle (diğer sekmelerden gelen güncellemeler)
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.notes) {
        refreshAll();
      }
    });
  }

  // ==========================================
  // Sidebar
  // ==========================================
  function toggleSidebar() {
    DOM.sidebar.classList.toggle('collapsed');
  }

  // ==========================================
  // Topbar
  // ==========================================
  function updateTopbar() {
    const now = new Date();
    const dayName = DAYS_TR[now.getDay()];
    const day = now.getDate();
    const month = MONTHS_TR[now.getMonth()];
    const year = now.getFullYear();

    if (state.selectedDate) {
      const sd = new Date(state.selectedDate);
      const sdDayName = DAYS_TR[sd.getDay()];
      const sdDay = sd.getDate();
      const sdMonth = MONTHS_TR[sd.getMonth()];
      const sdYear = sd.getFullYear();
      DOM.topbarDay.textContent = `${sdDay} ${sdMonth}`;
      DOM.topbarDate.textContent = `${sdDayName}, ${sdYear}`;
    } else {
      DOM.topbarDay.textContent = `${day} ${month}`;
      DOM.topbarDate.textContent = `${dayName}, ${year}`;
    }
  }

  // ==========================================
  // Takvim
  // ==========================================
  async function renderCalendar() {
    const year = state.calendarYear;
    const month = state.calendarMonth;

    DOM.calMonth.textContent = `${MONTHS_TR[month]} ${year}`;

    const daysWithNotes = await NotStorage.getDaysWithNotes(year, month);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Pazartesi'den başlat (0=Pzt, 6=Pzr)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    // Önceki ayın günleri
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    DOM.calDays.innerHTML = '';

    const today = new Date();
    const todayStr = today.toDateString();

    // Önceki ay günleri
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const el = createDayEl(day, true);
      DOM.calDays.appendChild(el);
    }

    // Bu ay günleri
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isToday = date.toDateString() === todayStr;
      const isSelected = state.selectedDate && new Date(state.selectedDate).toDateString() === date.toDateString();
      const hasNotes = daysWithNotes.has(d);

      const el = createDayEl(d, false, isToday, isSelected, hasNotes);

      el.addEventListener('click', () => {
        state.selectedDate = date.toISOString();
        state.activeFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-filter="all"]').classList.add('active');
        renderCalendar();
        renderNotes();
        updateTopbar();
      });

      DOM.calDays.appendChild(el);
    }

    // Sonraki ay günleri
    const totalCells = DOM.calDays.children.length;
    const remainingCells = totalCells > 35 ? 42 - totalCells : 35 - totalCells;
    for (let d = 1; d <= remainingCells; d++) {
      const el = createDayEl(d, true);
      DOM.calDays.appendChild(el);
    }
  }

  function createDayEl(day, isOtherMonth, isToday = false, isSelected = false, hasNotes = false) {
    const el = document.createElement('div');
    el.className = 'calendar-day';
    el.textContent = day;

    if (isOtherMonth) el.classList.add('other-month');
    if (isToday) el.classList.add('today');
    if (isSelected) el.classList.add('selected');
    if (hasNotes) el.classList.add('has-notes');

    return el;
  }

  // ==========================================
  // Not Kartlarını Render Et
  // ==========================================
  async function renderNotes() {
    let notes;

    if (state.searchQuery) {
      notes = await NotStorage.getFiltered({ search: state.searchQuery });
    } else if (state.selectedDate) {
      notes = await NotStorage.getByDate(state.selectedDate);
    } else if (state.activeFilter === 'today') {
      notes = await NotStorage.getToday();
    } else if (state.activeFilter === 'starred') {
      notes = await NotStorage.getFiltered({ starred: true });
    } else if (state.activeTag) {
      notes = await NotStorage.getFiltered({ tag: state.activeTag });
    } else {
      notes = await NotStorage.getAll();
    }

    // Not sayısını güncelle
    DOM.topbarNoteCount.textContent = `${notes.length} not`;

    // Boş durum
    if (notes.length === 0) {
      DOM.notesEmpty.classList.remove('hidden');
      // Remove existing cards
      DOM.notesContainer.querySelectorAll('.note-card').forEach(c => c.remove());
      return;
    }

    DOM.notesEmpty.classList.add('hidden');

    // Not kartlarını oluştur
    const fragment = document.createDocumentFragment();
    notes.forEach((note, index) => {
      const card = createNoteCard(note, index);
      fragment.appendChild(card);
    });

    // Mevcut kartları temizle
    DOM.notesContainer.querySelectorAll('.note-card').forEach(c => c.remove());
    DOM.notesContainer.appendChild(fragment);
  }

  function createNoteCard(note, index) {
    const card = document.createElement('div');
    card.className = `note-card${note.isStarred ? ' starred' : ''}`;
    card.style.animationDelay = `${index * 0.04}s`;
    card.dataset.noteId = note.id;

    const time = new Date(note.createdAt);
    const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

    const methodLabel = CAPTURE_METHODS[note.captureMethod] || note.captureMethod;

    // Content truncation check
    const isTruncated = note.content.length > 500;

    let sourceHtml = '';
    if (note.sourceUrl) {
      const displayUrl = note.sourceTitle || new URL(note.sourceUrl).hostname;
      sourceHtml = `
        <div class="note-card-source">
          <span>🔗</span>
          <a href="${escapeHtml(note.sourceUrl)}" target="_blank" title="${escapeHtml(note.sourceUrl)}">${escapeHtml(displayUrl)}</a>
        </div>
      `;
    }

    let tagsHtml = '';
    if (note.tags && note.tags.length > 0) {
      tagsHtml = `
        <div class="note-card-tags">
          ${note.tags.map(tag => `<span class="note-tag">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    }

    let userNoteHtml = '';
    if (note.userNote) {
      userNoteHtml = `<div class="note-card-user-note">${escapeHtml(note.userNote)}</div>`;
    }

    card.innerHTML = `
      <div class="note-card-header">
        <div class="note-card-meta">
          <span class="note-card-time">${timeStr} · ${dateStr}</span>
          <span class="note-card-method">${methodLabel}</span>
        </div>
        <div class="note-card-actions">
          <button class="note-card-action star-btn ${note.isStarred ? 'starred' : ''}" data-action="star" title="Yıldızla">
            ${note.isStarred ? '⭐' : '☆'}
          </button>
          <button class="note-card-action read-btn" data-action="read" title="Oku">📖</button>
          <button class="note-card-action" data-action="edit" title="Düzenle">✏️</button>
          <button class="note-card-action delete-btn" data-action="delete" title="Sil">🗑️</button>
        </div>
      </div>
      <div class="note-card-content ${isTruncated ? 'truncated' : ''}">${note.contentHtml ? note.contentHtml : escapeHtml(note.content)}</div>
      ${isTruncated ? '<button class="note-card-expand visible" data-action="expand">Devamını göster ↓</button>' : ''}
      ${userNoteHtml}
      <div class="note-card-footer">
        ${sourceHtml}
        ${tagsHtml}
      </div>
    `;

    // Event delegation
    card.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;

      switch (action.dataset.action) {
        case 'star':
          handleStar(note);
          break;
        case 'read':
          openReadModal(note);
          break;
        case 'edit':
          openEditModal(note);
          break;
        case 'delete':
          openDeleteModal(note.id);
          break;
        case 'expand':
          const content = card.querySelector('.note-card-content');
          content.classList.toggle('expanded');
          content.classList.toggle('truncated');
          action.textContent = content.classList.contains('expanded') ? 'Daralt ↑' : 'Devamını göster ↓';
          break;
      }
    });

    return card;
  }

  // ==========================================
  // Not İşlemleri
  // ==========================================
  async function handleStar(note) {
    await NotStorage.update({ id: note.id, isStarred: !note.isStarred });
    await refreshAll();
  }

  // ==========================================
  // Edit Modal
  // ==========================================
  function openEditModal(note) {
    state.editingNoteId = note.id;
    DOM.editContent.value = note.content;
    DOM.editUserNote.value = note.userNote || '';
    DOM.editTags.value = (note.tags || []).join(', ');
    DOM.editModal.style.display = '';
  }

  function closeEditModal() {
    DOM.editModal.style.display = 'none';
    state.editingNoteId = null;
  }

  async function handleEditSave() {
    if (!state.editingNoteId) return;

    const tags = DOM.editTags.value
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    await NotStorage.update({
      id: state.editingNoteId,
      content: DOM.editContent.value,
      userNote: DOM.editUserNote.value,
      tags
    });

    closeEditModal();
    await refreshAll();
    showAppToast('✅ Not güncellendi');
  }

  // ==========================================
  // New Note Modal
  // ==========================================
  function openNewNoteModal() {
    DOM.newNoteContent.value = '';
    DOM.newNoteTags.value = '';
    DOM.newNoteModal.style.display = '';
    DOM.newNoteContent.focus();
  }

  function closeNewNoteModal() {
    DOM.newNoteModal.style.display = 'none';
  }

  async function handleNewNoteSave() {
    const content = DOM.newNoteContent.value.trim();
    if (!content) return;

    const tags = DOM.newNoteTags.value
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    await NotStorage.save({
      content,
      tags,
      sourceTitle: 'Manuel Not',
      captureMethod: 'manual'
    });

    closeNewNoteModal();
    await refreshAll();
    showAppToast('✅ Yeni not eklendi');
  }

  // ==========================================
  // Delete Modal
  // ==========================================
  function openDeleteModal(noteId) {
    state.deletingNoteId = noteId;
    DOM.deleteModal.style.display = '';
  }

  function closeDeleteModal() {
    DOM.deleteModal.style.display = 'none';
    state.deletingNoteId = null;
  }

  async function handleDeleteConfirm() {
    if (!state.deletingNoteId) return;

    await NotStorage.delete(state.deletingNoteId);
    closeDeleteModal();
    await refreshAll();
    showAppToast('🗑️ Not silindi');
  }

  // ==========================================
  // Read Modal
  // ==========================================
  async function openReadModal(note) {
    // Mevcut not listesini al (navigasyon için)
    const allCurrentNotes = await getCurrentNoteList();
    state.readModalNotes = allCurrentNotes;
    state.readingNoteIndex = allCurrentNotes.findIndex(n => n.id === note.id);
    if (state.readingNoteIndex === -1) state.readingNoteIndex = 0;

    renderReadModalNote(note);
    updateReadModalNav();
    DOM.readModal.style.display = '';
    focusReadModalBody();
  }

  // Ok tuşlarıyla scroll için modal body'ye odaklan
  function focusReadModalBody() {
    const mb = DOM.readModal.querySelector('.modal-body');
    if (mb) setTimeout(() => mb.focus(), 100);
  }

  function renderReadModalNote(note) {
    state.readingNoteId = note.id;

    const time = new Date(note.createdAt);
    const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const methodLabel = CAPTURE_METHODS[note.captureMethod] || note.captureMethod;

    DOM.readModalMeta.textContent = `${timeStr} · ${dateStr} · ${methodLabel}`;
    DOM.readModalMeta.style.cssText = 'font-size:12px; color:var(--accent-primary); font-weight:500;';

    if (note.contentHtml) {
      DOM.readModalContent.innerHTML = note.contentHtml;
    } else {
      DOM.readModalContent.textContent = note.content;
    }

    if (note.userNote) {
      DOM.readModalUserNote.style.display = 'block';
      DOM.readModalUserNote.textContent = '💬 ' + note.userNote;
    } else {
      DOM.readModalUserNote.style.display = 'none';
    }

    if (note.sourceUrl) {
      DOM.readModalSource.style.display = 'block';
      DOM.readModalSource.innerHTML = `🔗 <a href="${escapeHtml(note.sourceUrl)}" target="_blank" style="color:var(--accent-primary); text-decoration:none;">${escapeHtml(note.sourceTitle || note.sourceUrl)}</a>`;
    } else {
      DOM.readModalSource.style.display = 'none';
    }

    if (note.tags && note.tags.length > 0) {
      DOM.readModalTags.style.display = 'flex';
      DOM.readModalTags.innerHTML = note.tags.map(t => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('');
    } else {
      DOM.readModalTags.style.display = 'none';
    }

    // Modal body scroll'u en üste al
    const modalBody = DOM.readModalContent.closest('.modal-body');
    if (modalBody) modalBody.scrollTop = 0;
  }

  function updateReadModalNav() {
    const total = state.readModalNotes.length;
    const idx = state.readingNoteIndex;

    DOM.readModalPrev.disabled = idx <= 0;
    DOM.readModalNext.disabled = idx >= total - 1;
    DOM.readModalCounter.textContent = `${idx + 1} / ${total}`;
  }

  function navigateReadModal(direction) {
    const newIndex = state.readingNoteIndex + direction;
    if (newIndex < 0 || newIndex >= state.readModalNotes.length) return;

    state.readingNoteIndex = newIndex;
    const note = state.readModalNotes[newIndex];
    renderReadModalNote(note);
    updateReadModalNav();
    focusReadModalBody();
  }

  function toggleReadFullscreen() {
    if (!document.fullscreenElement) {
      // Tam ekrana geç
      DOM.readModal.requestFullscreen().then(() => {
        state.readModalFullscreen = true;
        updateFullscreenIcon(true);
        focusReadModalBody();
      }).catch(err => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      // Tam ekrandan çık
      document.exitFullscreen().then(() => {
        state.readModalFullscreen = false;
        updateFullscreenIcon(false);
      });
    }
  }

  function updateFullscreenIcon(isFullscreen) {
    if (isFullscreen) {
      DOM.readModalFullscreen.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>';
      DOM.readModalFullscreen.title = 'Küçült (ESC)';
    } else {
      DOM.readModalFullscreen.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
      DOM.readModalFullscreen.title = 'Tam Ekran';
    }
  }

  // Mevcut filtreleme durumuna göre not listesini getir
  async function getCurrentNoteList() {
    if (state.searchQuery) {
      return await NotStorage.getFiltered({ search: state.searchQuery });
    } else if (state.selectedDate) {
      return await NotStorage.getByDate(state.selectedDate);
    } else if (state.activeFilter === 'today') {
      return await NotStorage.getToday();
    } else if (state.activeFilter === 'starred') {
      return await NotStorage.getFiltered({ starred: true });
    } else if (state.activeTag) {
      return await NotStorage.getFiltered({ tag: state.activeTag });
    } else {
      return await NotStorage.getAll();
    }
  }

  function closeReadModal() {
    // Tam ekrandaysa önce çık
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => {
        finishCloseReadModal();
      });
    } else {
      finishCloseReadModal();
    }
  }

  function finishCloseReadModal() {
    DOM.readModal.style.display = 'none';
    state.readingNoteId = null;
    state.readingNoteIndex = -1;
    state.readModalNotes = [];
    state.readModalFullscreen = false;
    updateFullscreenIcon(false);
  }

  // ==========================================
  // Tercihler (Preferences)
  // ==========================================
  async function loadPreferences() {
    try {
      const result = await chrome.storage.local.get('preferences');
      const prefs = result.preferences || {};

      // Tema
      const theme = prefs.theme || 'dark';
      setTheme(theme);

      // İçerik genişliği
      const width = prefs.readModalWidth || 65;
      DOM.readModalWidthSlider.value = width;
      DOM.readModalWidthValue.textContent = width + '%';
      DOM.readModal.style.setProperty('--read-modal-width', width + '%');
    } catch (e) {
      console.warn('Tercihler yüklenemedi:', e);
    }
  }

  function savePreferences() {
    const prefs = {
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      readModalWidth: parseInt(DOM.readModalWidthSlider.value, 10)
    };
    chrome.storage.local.set({ preferences: prefs });
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Toggle butonlarını güncelle
    DOM.themeToggle.querySelectorAll('.topbar-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  // ==========================================
  // Export / Import
  // ==========================================
  async function handleExport() {
    await NotStorage.exportToJSON();
    showAppToast('💾 Notlar JSON olarak dışa aktarıldı');
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const count = await NotStorage.importFromJSON(file);
      showAppToast(`📥 ${count} not içe aktarıldı`);
      await refreshAll();
    } catch (err) {
      showAppToast(`❌ Hata: ${err.message}`, 'error');
    }

    DOM.importFile.value = '';
  }

  // ==========================================
  // Etiket Bulutu
  // ==========================================
  async function renderTags() {
    const tags = await NotStorage.getAllTags();

    if (tags.length === 0) {
      DOM.tagCloud.innerHTML = '<div class="tag-empty">Henüz etiket yok</div>';
      return;
    }

    DOM.tagCloud.innerHTML = tags.map(tag => `
      <div class="tag-item ${state.activeTag === tag.name ? 'active' : ''}" data-tag="${escapeHtml(tag.name)}">
        #${escapeHtml(tag.name)}
        <span class="tag-count">(${tag.count})</span>
      </div>
    `).join('');

    DOM.tagCloud.querySelectorAll('.tag-item').forEach(item => {
      item.addEventListener('click', () => {
        const tagName = item.dataset.tag;
        if (state.activeTag === tagName) {
          state.activeTag = null;
        } else {
          state.activeTag = tagName;
        }
        state.selectedDate = null;
        state.activeFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-filter="all"]').classList.add('active');
        renderTags();
        renderNotes();
      });
    });
  }

  // ==========================================
  // İstatistikler
  // ==========================================
  async function updateStats() {
    const allNotes = await NotStorage.getAll();
    const todayNotes = await NotStorage.getToday();
    const starredNotes = allNotes.filter(n => n.isStarred);

    DOM.statTotal.textContent = allNotes.length;
    DOM.statToday.textContent = todayNotes.length;
    DOM.statStarred.textContent = starredNotes.length;
  }

  // ==========================================
  // Tüm Verileri Yenile
  // ==========================================
  async function refreshAll() {
    await Promise.all([
      renderNotes(),
      renderCalendar(),
      renderTags(),
      updateStats()
    ]);
  }

  // ==========================================
  // Uygulama Toast
  // ==========================================
  function showAppToast(message) {
    const existing = document.querySelector('.app-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ==========================================
  // Yardımcılar
  // ==========================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================
  // Başlat
  // ==========================================
  document.addEventListener('DOMContentLoaded', init);
})();
