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
    activeFilter: window.__DEFTER_DESKTOP__ ? 'all' : 'today',
    activeTag: null,
    searchQuery: '',
    editingNoteId: null,
    deletingNoteId: null,
    readingNoteId: null,
    readingNoteIndex: -1,
    readModalNotes: [],
    readModalFullscreen: false,
    readAllMode: false,
    readAllDayNo: null,
    readAllTotalDays: 0,
    renderList: [],
    renderedCount: 0
  };

  // Liste performansı: çok not olduğunda kademeli render
  const NOTES_PAGE_SIZE = 50;

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
    'ai-qa': 'Soru+Cevap',
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
    readModalSlide: document.getElementById('readModalSlide'),
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
    syncFilterButtons();
    updateTopbar();
    renderCalendar();
    await refreshAll();
    bindEvents();
    checkDiskError();
  }

  function syncFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === state.activeFilter);
    });
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
    document.getElementById('exportMdBtn').addEventListener('click', handleExportMarkdown);
    document.getElementById('exportCsvBtn').addEventListener('click', handleExportCSV);
    document.getElementById('printBtn').addEventListener('click', handlePrint);
    DOM.importBtn.addEventListener('click', () => DOM.importFile.click());
    DOM.importFile.addEventListener('change', handleImport);

    // Yerel kayıt hatası banner'ı
    document.getElementById('diskErrorClose').addEventListener('click', () => setDiskErrorBanner(false));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.diskSaveError) {
        setDiskErrorBanner(!!changes.diskSaveError.newValue);
      }
    });

    // Edit Modal
    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editModalCancel').addEventListener('click', closeEditModal);
    document.getElementById('editModalSave').addEventListener('click', handleEditSave);

    // Zengin metin araç çubuğu
    document.getElementById('editToolbar').addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.rich-btn');
      if (!btn) return;
      e.preventDefault(); // editör seçimini/odağını koru
      DOM.editContent.focus();
      const cmd = btn.dataset.cmd;
      if (cmd === 'formatBlock') {
        document.execCommand('formatBlock', false, btn.dataset.value);
      } else {
        document.execCommand(cmd, false, null);
      }
    });

    // New Note Modal
    document.getElementById('newNoteModalClose').addEventListener('click', closeNewNoteModal);
    document.getElementById('newNoteModalCancel').addEventListener('click', closeNewNoteModal);
    document.getElementById('newNoteModalSave').addEventListener('click', handleNewNoteSave);

    // Delete Modal
    document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteModalConfirm').addEventListener('click', handleDeleteConfirm);

    // Read modal body ve overlay'i focusable yap
    const readModalBody = DOM.readModal.querySelector('.modal-body');
    if (readModalBody) {
      readModalBody.setAttribute('tabindex', '0');
      readModalBody.style.outline = 'none';
    }
    DOM.readModal.setAttribute('tabindex', '-1');
    DOM.readModal.style.outline = 'none';

    // Okuma modalı klavye fonksiyonu
    function handleReadModalKeydown(e) {
      // Read modal açık değilse işlem yapma
      if (DOM.readModal.style.display === 'none') return;

      const activeEl = document.activeElement;
      const isSlider = activeEl === DOM.readModalWidthSlider;

      // Sol/sağ ok: notlar arası geçiş (toplu modda tüm arşiv; ← geri/daha eski, → ileri/daha yeni)
      if (state.readModalNotes.length > 0 && !isSlider) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          navigateReadModal(-1);
          return;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          navigateReadModal(1);
          return;
        }
      }

      // ArrowUp/ArrowDown: İçeriği kaydır
      // Gerçek scrollable elemanı bul ve programatik olarak kaydır
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const scrollTarget = findScrollableElement();
        if (scrollTarget) {
          const delta = e.key === 'ArrowDown' ? 60 : -60;
          scrollTarget.scrollBy({ top: delta, behavior: 'auto' });
        }
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        const scrollTarget = findScrollableElement();
        if (scrollTarget) {
          e.preventDefault();
          const delta = e.key === 'PageDown' ? scrollTarget.clientHeight * 0.85 : -scrollTarget.clientHeight * 0.85;
          scrollTarget.scrollBy({ top: delta, behavior: 'auto' });
        }
      } else if (e.key === 'Home' && !isSlider) {
        const scrollTarget = findScrollableElement();
        if (scrollTarget) {
          e.preventDefault();
          scrollTarget.scrollTop = 0;
        }
      } else if (e.key === 'End' && !isSlider) {
        const scrollTarget = findScrollableElement();
        if (scrollTarget) {
          e.preventDefault();
          scrollTarget.scrollTop = scrollTarget.scrollHeight;
        }
      } else if (e.key === ' ') {
        const isEditing = activeEl &&
          (activeEl.tagName === 'TEXTAREA' ||
           (activeEl.tagName === 'INPUT' && activeEl.type !== 'range'));
        if (!isEditing) {
          e.preventDefault();
          const scrollTarget = findScrollableElement();
          if (scrollTarget) {
            const direction = e.shiftKey ? -1 : 1;
            scrollTarget.scrollBy({ top: direction * scrollTarget.clientHeight * 0.85, behavior: 'auto' });
          }
        }
      }
    }

    // Modal içindeki gerçek scrollable elemanı bul
    // (.modal-body veya #readModalContent — hangisi gerçekten taşıyorsa)
    function findScrollableElement() {
      const mb = DOM.readModal.querySelector('.modal-body');
      if (!mb) return null;
      // modal-body scroll edilebilir mi?
      if (mb.scrollHeight > mb.clientHeight + 1) return mb;
      // İçerideki content div scroll edilebilir mi?
      const content = mb.querySelector('#readModalContent');
      if (content && content.scrollHeight > content.clientHeight + 1) return content;
      // Hiçbiri değilse yine de modal-body'yi döndür
      return mb;
    }

    // Klavye kontrolleri
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEditModal();
        closeNewNoteModal();
        closeDeleteModal();
        closeReadModal();
      }
      handleReadModalKeydown(e);
    }, { passive: false });

    // Tam ekrandayken kullanıcının tıklamalarıyla odağın kaybolmasını önleme
    // (document.documentElement fullscreen kullanıldığı için tüm DOM erişilebilir,
    //  ama odak yine de butonlara veya overlay'e düşebilir)
    DOM.readModal.addEventListener('click', (e) => {
      if (document.fullscreenElement) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(activeTag)) {
          focusReadModalBody();
        }
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

    // Read Modal — Kopyala
    document.getElementById('readModalCopyBtn').addEventListener('click', () => {
      const note = state.readModalNotes[state.readingNoteIndex];
      if (note) copyNoteText(note);
    });

    // Read Modal Navigation (not not; toplu modda tüm arşiv üzerinde)
    DOM.readModalPrev.addEventListener('click', () => navigateReadModal(-1));
    DOM.readModalNext.addEventListener('click', () => navigateReadModal(1));

    // ==========================================
    // Dokunmatik kaydırma ile not geçişi (mobil)
    // Parmağı takip eden sürükleme; bırakınca kayarak geçiş ya da geri yaylanma.
    // Yatay kaydırma = not değiştir; dikey kaydırma = normal okuma kaydırması (engellenmez).
    // ==========================================
    (function setupReadSwipe() {
      const body = DOM.readModal.querySelector('.modal-body');
      const slide = DOM.readModalSlide;
      if (!body || !slide) return;

      body.style.touchAction = 'pan-y';   // dikey kaydırma native kalsın, yatay bize gelsin
      body.style.overflowX = 'hidden';    // kayarken yanlardan taşmayı kırp

      let startX = 0, startY = 0, dx = 0, w = 0;
      let axis = null;          // null | 'h' | 'v'
      let dragging = false;
      let animating = false;

      const atStart = () => state.readingNoteIndex <= 0;
      const atEnd = () => state.readingNoteIndex >= state.readModalNotes.length - 1;

      function paint(x, withTransition) {
        slide.style.transition = withTransition
          ? 'transform 0.22s cubic-bezier(.22,.61,.36,1), opacity 0.22s'
          : 'none';
        slide.style.transform = x ? 'translateX(' + x + 'px)' : '';
        slide.style.opacity = w ? String(Math.max(0.4, 1 - Math.abs(x) / (w * 1.5))) : '1';
      }

      function springBack() {
        paint(0, true);
        setTimeout(() => { slide.style.transition = 'none'; slide.style.opacity = '1'; }, 240);
      }

      // direction: -1 önceki (daha eski), +1 sonraki (daha yeni)
      function commit(direction) {
        animating = true;
        const out = direction === 1 ? -w : w;     // sonraki: sola çık; önceki: sağa çık
        slide.style.transition = 'transform 0.16s ease-out, opacity 0.16s ease-out';
        slide.style.transform = 'translateX(' + out + 'px)';
        slide.style.opacity = '0';
        setTimeout(() => {
          navigateReadModal(direction);           // yeni notu yerleştir (render + nav + odak)
          slide.style.transition = 'none';
          slide.style.transform = 'translateX(' + (-out) + 'px)';   // yeni içeriği karşı kenara koy
          slide.style.opacity = '0';
          void slide.offsetWidth;                 // reflow (geçişi tetiklemek için)
          slide.style.transition = 'transform 0.2s cubic-bezier(.22,.61,.36,1), opacity 0.2s';
          slide.style.transform = '';
          slide.style.opacity = '1';
          setTimeout(() => { slide.style.transition = 'none'; animating = false; }, 220);
        }, 160);
      }

      body.addEventListener('touchstart', (e) => {
        if (animating || DOM.readModal.style.display === 'none') return;
        if (e.touches.length !== 1 || state.readModalNotes.length < 2) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0; axis = null; dragging = false;
        w = body.clientWidth || window.innerWidth || 1;
      }, { passive: true });

      body.addEventListener('touchmove', (e) => {
        if (animating || !e.touches.length || state.readModalNotes.length < 2) return;
        const ddx = e.touches[0].clientX - startX;
        const ddy = e.touches[0].clientY - startY;
        if (axis === null) {
          if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;   // yön henüz belirsiz
          axis = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
          if (axis === 'h') dragging = true;
        }
        if (axis !== 'h') return;                 // dikey: normal okuma kaydırmasına bırak
        e.preventDefault();
        dx = ddx;
        if ((dx > 0 && atStart()) || (dx < 0 && atEnd())) dx *= 0.28;   // kenarda direnç
        paint(dx, false);
      }, { passive: false });

      function endDrag() {
        if (!dragging) { axis = null; return; }
        dragging = false;
        const threshold = Math.max(60, w * 0.18);
        const blocked = (dx > 0 && atStart()) || (dx < 0 && atEnd());
        if (!blocked && Math.abs(dx) > threshold) {
          commit(dx > 0 ? -1 : 1);
        } else {
          springBack();
        }
        axis = null;
      }
      body.addEventListener('touchend', endDrag, { passive: true });
      body.addEventListener('touchcancel', endDrag, { passive: true });
    })();

    // Overlay'e (dışarıya) tıklayınca kapat (tam ekranda değilken)
    DOM.readModal.addEventListener('click', (e) => {
      if (e.target === DOM.readModal && !state.readModalFullscreen) {
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
    // Slider üzerinde iken ok tuşlarının slider değerini değiştirmesini engelle
    // ve odağı modal body'ye geri ver, böylece ok tuşları içeriği kaydırır
    DOM.readModalWidthSlider.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        // Slider'dan odağı al ve modal body'ye ver
        DOM.readModalWidthSlider.blur();
        focusReadModalBody();
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

    // Topbar toplu oku (görünen tüm notları tek akışta, tam ekran)
    document.getElementById('topbarReadAll').addEventListener('click', openReadAll);

    // Theme toggle
    DOM.themeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.topbar-theme-btn');
      if (!btn) return;
      const theme = btn.dataset.theme;
      setTheme(theme);
      savePreferences();
    });

    // Fullscreen change event (ESC çıkışı algılama + tam ekrana girişte odak ayarla)
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        state.readModalFullscreen = false;
        updateFullscreenIcon(false);
      } else {
        // Tam ekrana girildikten sonra odağı modal body'ye ver
        // Çift rAF ile tarayıcının render geçişini tamamlamasını bekliyoruz
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            focusReadModalBody();
          });
        });
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

    // Mevcut kartları ve "daha fazla" butonunu temizle
    DOM.notesContainer.querySelectorAll('.note-card, .load-more-btn').forEach(c => c.remove());

    // Boş durum
    if (notes.length === 0) {
      DOM.notesEmpty.classList.remove('hidden');
      const emptyTitle = DOM.notesEmpty.querySelector('.notes-empty-title');
      const emptyText = DOM.notesEmpty.querySelector('.notes-empty-text');
      const isTodayView = state.activeFilter === 'today' &&
        !state.searchQuery && !state.selectedDate && !state.activeTag;
      if (isTodayView) {
        if (emptyTitle) emptyTitle.textContent = 'Bugün için henüz not yok';
        if (emptyText) emptyText.innerHTML =
          'Yeni güne temiz başladınız. Eski notlarınız duruyor — ' +
          '<strong>Tüm Notlar</strong> filtresinden veya takvimden ulaşabilirsiniz.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Not bulunamadı';
        if (emptyText) emptyText.innerHTML =
          'Bu filtre/aramaya uygun not yok. <strong>Tüm Notlar</strong>’a dönüp tekrar deneyin.';
      }
      return;
    }

    DOM.notesEmpty.classList.add('hidden');

    // İlk grubu render et, kalanı "Daha fazla göster" ile
    state.renderList = notes;
    state.renderedCount = 0;
    renderNextBatch();
  }

  // Sonraki not grubunu ekle (kademeli render)
  function renderNextBatch() {
    const start = state.renderedCount;
    const end = Math.min(start + NOTES_PAGE_SIZE, state.renderList.length);

    // Önceki "daha fazla" butonunu kaldır
    const oldBtn = DOM.notesContainer.querySelector('.load-more-btn');
    if (oldBtn) oldBtn.remove();

    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      fragment.appendChild(createNoteCard(state.renderList[i], i));
    }
    DOM.notesContainer.appendChild(fragment);
    state.renderedCount = end;

    // Kalan varsa buton ekle
    if (state.renderedCount < state.renderList.length) {
      const remaining = state.renderList.length - state.renderedCount;
      const btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.textContent = `Daha fazla göster (${remaining} kaldı)`;
      btn.addEventListener('click', renderNextBatch);
      DOM.notesContainer.appendChild(btn);
    }
  }

  function createNoteCard(note, index) {
    const card = document.createElement('div');
    card.className = `note-card${note.isStarred ? ' starred' : ''}`;
    card.style.animationDelay = `${Math.min(index, 12) * 0.04}s`;
    card.dataset.noteId = note.id;

    const time = new Date(note.createdAt);
    const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

    const methodLabel = CAPTURE_METHODS[note.captureMethod] || note.captureMethod || 'Bilinmiyor';

    // Content truncation check
    const plainContent = typeof note.content === 'string' ? note.content : '';
    const safeContentHtml = note.contentHtml ? sanitizeRichHtml(note.contentHtml) : '';
    const isTruncated = plainContent.length > 500;

    let sourceHtml = '';
    const safeSourceUrl = safeExternalUrl(note.sourceUrl);
    if (safeSourceUrl) {
      let displayUrl = note.sourceTitle;
      if (!displayUrl) {
        try { displayUrl = new URL(safeSourceUrl).hostname; }
        catch (e) { displayUrl = safeSourceUrl; }
      }
      sourceHtml = `
        <div class="note-card-source">
          <span>🔗</span>
          <a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(safeSourceUrl)}">${escapeHtml(displayUrl)}</a>
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
          <span class="note-card-method">${escapeHtml(methodLabel)}</span>
        </div>
        <div class="note-card-actions">
          <button class="note-card-action star-btn ${note.isStarred ? 'starred' : ''}" data-action="star" title="Yıldızla">
            ${note.isStarred ? '⭐' : '☆'}
          </button>
          <button class="note-card-action read-fullscreen-btn" data-action="readFullscreen" title="Tam Ekranda Oku">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
          </button>
          <button class="note-card-action read-btn" data-action="read" title="Oku">📖</button>
          <button class="note-card-action" data-action="copy" title="Panoya Kopyala">📋</button>
          <button class="note-card-action" data-action="edit" title="Düzenle">✏️</button>
          <button class="note-card-action delete-btn" data-action="delete" title="Sil">🗑️</button>
        </div>
      </div>
      <div class="note-card-content ${isTruncated ? 'truncated' : ''}">${safeContentHtml || escapeHtml(plainContent)}</div>
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
        case 'readFullscreen':
          openReadModalFullscreen(note);
          break;
        case 'copy':
          copyNoteText(note, action);
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
    // Zengin metin editörü: varsa HTML, yoksa düz metni satır sonlarıyla göster
    DOM.editContent.innerHTML = note.contentHtml
      ? sanitizeRichHtml(note.contentHtml)
      : escapeHtml(note.content || '').replace(/\n/g, '<br>');
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

    const contentHtml = sanitizeRichHtml(DOM.editContent.innerHTML);
    const contentText = (DOM.editContent.innerText || '').trim();

    await NotStorage.update({
      id: state.editingNoteId,
      content: contentText,
      contentHtml,
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
    state.readAllMode = false;
    applyReadAllChrome(false);
    // Navigasyon için listeyi ESKİDEN YENİYE sırala:
    // Önceki = daha eski, Sonraki = daha yeni (toplu okuma ile tutarlı).
    const allCurrentNotes = (await getCurrentNoteList())
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    state.readModalNotes = allCurrentNotes;
    state.readingNoteIndex = allCurrentNotes.findIndex(n => n.id === note.id);
    if (state.readingNoteIndex === -1) state.readingNoteIndex = 0;

    renderReadModalNote(note);
    updateReadModalNav();
    DOM.readModal.style.display = '';
    focusReadModalBody();
  }

  // Direkt tam ekranda okuma
  async function openReadModalFullscreen(note) {
    state.readAllMode = false;
    applyReadAllChrome(false);
    state.readModalNotes = [note];
    state.readingNoteIndex = 0;
    renderReadModalNote(note);
    updateReadModalNav();
    if (window.__DEFTER_MOBILE__) {
      // Mobil (standalone PWA): native fullscreen YERINE CSS sinifi.
      // Anlik gecis — siyah/beyaz flash ve yavas native gecis OLMAZ.
      state.readModalFullscreen = true;
      updateFullscreenIcon(true);   // <html>'e 'reading-fs' ekler
      DOM.readModal.style.display = '';
      focusReadModalBody();
    } else {
      DOM.readModal.style.display = '';
      focusReadModalBody();
      try {
        await document.documentElement.requestFullscreen();
        state.readModalFullscreen = true;
        updateFullscreenIcon(true);
      } catch (e) {
        // Tam ekran reddedilirse normal pencere modunda aç
      }
    }
    const allCurrentNotes = (await getCurrentNoteList())
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (allCurrentNotes.length) {
      state.readModalNotes = allCurrentNotes;
      state.readingNoteIndex = allCurrentNotes.findIndex(n => n.id === note.id);
      if (state.readingNoteIndex === -1) state.readingNoteIndex = 0;
      updateReadModalNav();
    }
  }

  // ==========================================
  // Toplu Okuma — TÜM arşiv, not not (en ESKİ günden itibaren)
  // Mevcut tekli okuyucuyu kullanır: ←/→ notları çevirir, gün sınırını otomatik geçer.
  // İçeriğin başında gün rozeti gösterilir (gün geçişi görünür olsun).
  // ==========================================
  async function openReadAll() {
    // TÜM notları al, ESKİDEN YENİYE sırala (ilk gün önce; → = ileri/daha yeni).
    const all = (await NotStorage.getAll())
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!all.length) { showAppToast('⚠️ Okunacak not yok'); return; }

    // Gün numaralandırması (rozet: "Gün X / Y")
    const dayNo = new Map();
    all.forEach((n) => {
      const k = new Date(n.createdAt).toDateString();
      if (!dayNo.has(k)) dayNo.set(k, dayNo.size + 1);
    });
    state.readAllDayNo = dayNo;
    state.readAllTotalDays = dayNo.size;

    state.readAllMode = true;
    state.readModalNotes = all;
    state.readingNoteIndex = 0; // ilk gün, ilk not

    applyReadAllChrome(true);
    renderReadModalNote(all[0]);
    updateReadModalNav();
    if (window.__DEFTER_MOBILE__) {
      // Mobil: CSS ile aninda tam ekran (native fullscreen yok — flash yok)
      state.readModalFullscreen = true;
      updateFullscreenIcon(true);
      DOM.readModal.style.display = '';
      focusReadModalBody();
    } else {
      DOM.readModal.style.display = '';
      focusReadModalBody();
      try {
        await document.documentElement.requestFullscreen();
        state.readModalFullscreen = true;
        updateFullscreenIcon(true);
      } catch (e) {
        // tam ekran reddedilirse pencere modunda aç
      }
    }
  }

  // Toplu/tekil moda göre modal başlık ve "Düzenle" butonunu ayarla.
  // Alt navigasyon her iki modda görünür: tekil modda not, toplu modda GÜN geçişi.
  function applyReadAllChrome(isAll) {
    const title = DOM.readModal.querySelector('.modal-title');
    const editBtn = document.getElementById('readModalEditBtn');
    if (title) title.textContent = isAll ? '📖 Toplu Okuma' : '📖 Notu Oku';
    if (editBtn) editBtn.style.display = isAll ? 'none' : '';
  }

  // Ok tuşlarıyla scroll için modal body'ye odaklan
  function focusReadModalBody() {
    const mb = DOM.readModal.querySelector('.modal-body');
    if (mb) {
      // #readModalContent'teki overflow-y:auto'yu kaldır
      // Böylece tek scroll konteyneri .modal-body olur ve ok tuşları onu kaydırır
      const content = mb.querySelector('#readModalContent');
      if (content) {
        content.style.overflowY = 'visible';
        content.style.maxHeight = 'none';
      }
      requestAnimationFrame(() => {
        mb.focus({ preventScroll: true });
      });
    }
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
      DOM.readModalContent.innerHTML = sanitizeRichHtml(note.contentHtml);
    } else {
      DOM.readModalContent.textContent = note.content;
    }

    // Toplu modda: içeriğin başına gün rozeti (gün otomatik geçişi görünür olsun)
    if (state.readAllMode) {
      const dayNum = state.readAllDayNo ? state.readAllDayNo.get(time.toDateString()) : null;
      const banner = document.createElement('div');
      banner.className = 'read-all-day';
      banner.textContent = dayNum
        ? `${dateStr} · Gün ${dayNum} / ${state.readAllTotalDays}`
        : dateStr;
      DOM.readModalContent.insertBefore(banner, DOM.readModalContent.firstChild);
    }

    if (note.userNote) {
      DOM.readModalUserNote.style.display = 'block';
      DOM.readModalUserNote.textContent = '💬 ' + note.userNote;
    } else {
      DOM.readModalUserNote.style.display = 'none';
    }

    const safeSourceUrl = safeExternalUrl(note.sourceUrl);
    if (safeSourceUrl) {
      DOM.readModalSource.style.display = 'block';
      DOM.readModalSource.innerHTML = `🔗 <a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary); text-decoration:none;">${escapeHtml(note.sourceTitle || safeSourceUrl)}</a>`;
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

  // Document kökünü tam ekrana al — Top Layer izolasyonundan kaçınır
  // DOM ağacının tamamı erişilebilir kalır, hiçbir eleman inert olmaz
  async function enterReadFullscreen() {
    if (window.__DEFTER_MOBILE__) {
      // Mobil: CSS ile aninda tam ekran (native fullscreen yok)
      state.readModalFullscreen = true;
      updateFullscreenIcon(true);
      focusReadModalBody();
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      state.readModalFullscreen = true;
      updateFullscreenIcon(true);

      // Render geçişi tamamlandıktan sonra odağı .modal-body'ye ver
      // Odak doğru yere düşünce tarayıcının yerel ok tuşu kaydırması çalışır
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusReadModalBody();
        });
      });
    } catch (err) {
      console.warn('Fullscreen error:', err);
    }
  }

  function toggleReadFullscreen() {
    const isFull = window.__DEFTER_MOBILE__ ? state.readModalFullscreen : !!document.fullscreenElement;
    if (!isFull) {
      enterReadFullscreen();
    } else if (window.__DEFTER_MOBILE__) {
      // Mobil: sinifi kaldir (pencere moduna don)
      state.readModalFullscreen = false;
      updateFullscreenIcon(false);
    } else {
      // Tam ekrandan çık
      document.exitFullscreen().then(() => {
        state.readModalFullscreen = false;
        updateFullscreenIcon(false);
      });
    }
  }

  function updateFullscreenIcon(isFullscreen) {
    // Yalnızca NOT OKUMA tam ekranında arka plan arayüzünü (app-layout) gizle.
    // Topbar "Tam Ekran" butonu bu fonksiyonu çağırmadığından o modda reading-fs
    // eklenmez ve defter görünür kalır (beyaz ekran olmaz).
    document.documentElement.classList.toggle('reading-fs', isFullscreen);
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
    // Masaüstü native tam ekrandaysa önce çık; mobilde 'reading-fs' sinifi
    // finishCloseReadModal -> updateFullscreenIcon(false) ile zaten kalkar.
    if (!window.__DEFTER_MOBILE__ && document.fullscreenElement) {
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
    state.readAllMode = false;
    state.readAllDayNo = null;
    applyReadAllChrome(false);
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
  // Kopyala / Markdown / CSV / Yazdır
  // ==========================================
  async function copyNoteText(note, btn) {
    try {
      await navigator.clipboard.writeText(note.content || '');
      showAppToast('📋 Not panoya kopyalandı');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      }
    } catch (e) {
      showAppToast('❌ Kopyalanamadı', 'error');
    }
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    return new Date().toISOString().split('T')[0];
  }

  async function handleExportMarkdown() {
    const notes = await getCurrentNoteList();
    if (!notes.length) { showAppToast('⚠️ Dışa aktarılacak not yok', 'error'); return; }

    const md = notes.map(n => {
      const d = new Date(n.createdAt);
      const head = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
                   ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      let block = `## ${head}\n\n${n.content || ''}\n`;
      if (n.userNote) block += `\n> 💬 ${n.userNote}\n`;
      if (n.tags && n.tags.length) block += `\nEtiketler: ${n.tags.map(t => '#' + t).join(' ')}\n`;
      if (n.sourceUrl) block += `\nKaynak: ${n.sourceTitle || n.sourceUrl} — ${n.sourceUrl}\n`;
      return block;
    }).join('\n---\n\n');

    const header = `# Tıbbi Notlar\n\n${notes.length} not • ${new Date().toLocaleString('tr-TR')}\n\n---\n\n`;
    downloadFile(`tibbi-notlar-${dateStamp()}.md`, header + md, 'text/markdown;charset=utf-8');
    showAppToast(`📄 ${notes.length} not Markdown olarak indirildi`);
  }

  async function handleExportCSV() {
    const notes = await getCurrentNoteList();
    if (!notes.length) { showAppToast('⚠️ Dışa aktarılacak not yok', 'error'); return; }

    const esc = (v) => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`;
    const rows = [['Tarih', 'Saat', 'Icerik', 'Etiketler', 'KisiselNot', 'Kaynak', 'Yontem']];
    notes.forEach(n => {
      const d = new Date(n.createdAt);
      rows.push([
        d.toLocaleDateString('tr-TR'),
        d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        n.content || '',
        (n.tags || []).join(', '),
        n.userNote || '',
        n.sourceUrl || '',
        CAPTURE_METHODS[n.captureMethod] || n.captureMethod || ''
      ]);
    });
    // UTF-8 BOM — Excel Türkçe karakterleri doğru göstersin
    const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
    downloadFile(`tibbi-notlar-${dateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    showAppToast(`📊 ${notes.length} not CSV olarak indirildi`);
  }

  async function handlePrint() {
    const notes = await getCurrentNoteList();
    if (!notes.length) { showAppToast('⚠️ Yazdırılacak not yok', 'error'); return; }

    const win = window.open('', '_blank');
    if (!win) { showAppToast('⚠️ Açılır pencere engellendi', 'error'); return; }

    const body = notes.map(n => {
      const d = new Date(n.createdAt);
      const meta = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
                   ' · ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const content = n.contentHtml ? sanitizeRichHtml(n.contentHtml) : escapeHtml(n.content || '').replace(/\n/g, '<br>');
      const tags = (n.tags && n.tags.length) ? `<div class="pt-tags">${n.tags.map(t => '#' + escapeHtml(t)).join(' ')}</div>` : '';
      const src = n.sourceUrl ? `<div class="pt-src">Kaynak: ${escapeHtml(n.sourceTitle || n.sourceUrl)}</div>` : '';
      const un = n.userNote ? `<div class="pt-un">💬 ${escapeHtml(n.userNote)}</div>` : '';
      return `<article class="pt-note"><div class="pt-meta">${meta}</div><div class="pt-content">${content}</div>${un}${tags}${src}</article>`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Tıbbi Notlar</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#111;max-width:800px;margin:24px auto;padding:0 16px;line-height:1.6;}
        h1{font-size:22px;border-bottom:2px solid #00a884;padding-bottom:8px;}
        .pt-note{padding:14px 0;border-bottom:1px solid #ddd;page-break-inside:avoid;}
        .pt-meta{font-size:12px;color:#00a884;font-weight:600;margin-bottom:6px;}
        .pt-content img{max-width:100%;height:auto;}
        .pt-un{margin-top:8px;font-style:italic;color:#555;}
        .pt-tags{margin-top:6px;font-size:12px;color:#00a884;}
        .pt-src{margin-top:4px;font-size:11px;color:#888;}
        @media print{ body{margin:0;} }
      </style></head><body>
      <h1>Tıbbi Notlar — ${notes.length} not</h1>
      ${body}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // ==========================================
  // Yerel kayıt hatası uyarısı
  // ==========================================
  async function checkDiskError() {
    try {
      const r = await chrome.storage.local.get('diskSaveError');
      setDiskErrorBanner(!!r.diskSaveError);
    } catch (e) { /* yoksay */ }
  }

  function setDiskErrorBanner(show) {
    const banner = document.getElementById('diskErrorBanner');
    if (banner) banner.classList.toggle('hidden', !show);
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
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // Not kaynakları yalnızca normal web bağlantısı olabilir. İçe aktarılan
  // javascript:/data: URL'lerini ve bozuk adresleri tıklanabilir yapma.
  function safeExternalUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch (e) {
      return '';
    }
  }

  // Zengin editör HTML'ini güvenli biçim etiketleriyle sınırla
  function sanitizeRichHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const allowed = new Set([
      'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BR',
      'A', 'BLOCKQUOTE', 'PRE', 'CODE', 'DIV', 'SPAN', 'IMG', 'TABLE',
      'THEAD', 'TBODY', 'TR', 'TH', 'TD'
    ]);
    tmp.querySelectorAll('*').forEach((el) => {
      if (!allowed.has(el.tagName)) {
        // İzinsiz etiketi çöz: içeriğini yerine koy
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach((attr) => {
        const n = attr.name.toLowerCase();
        const v = (attr.value || '').trim();
        // Yalnız güvenli bağlantılar, görseller ve sunum için sınırlı nitelikler.
        if (el.tagName === 'A' && n === 'href' && safeExternalUrl(v)) return;
        if (el.tagName === 'IMG' && n === 'alt') return;
        if (el.tagName === 'IMG' && n === 'src' && /^(https?:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(v)) return;
        if ((el.tagName === 'TH' || el.tagName === 'TD') && (n === 'colspan' || n === 'rowspan') && /^\d{1,2}$/.test(v)) return;
        el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return tmp.innerHTML;
  }

  // ==========================================
  // Başlat
  // ==========================================
  document.addEventListener('DOMContentLoaded', init);
})();
