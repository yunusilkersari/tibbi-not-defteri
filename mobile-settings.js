// ============================================================
// Tıbbi Not Defteri — Mobil arayüz davranışları
// (Senkron ayar penceresi, kayan + buton, çekmece menü)
// app/app.js'e DOKUNMAZ; sadece mobil-özel öğeleri yönetir.
// ============================================================
(function () {
  'use strict';

  var SYNC = window.__DEFTER_SYNC__;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Kayan (+) buton → mevcut "Yeni Not" akışını çağır ----------
  var fab = $('mobileFab');
  if (fab) fab.addEventListener('click', function () {
    var btn = $('newNoteBtn');
    if (btn) btn.click();
  });

  // ============================================================
  // Çekmece (drawer) menü — telefonda sidebar üstte açılır
  // ============================================================
  var sidebar = $('sidebar');
  var backdrop = document.createElement('div');
  backdrop.className = 'mobile-backdrop';
  document.body.appendChild(backdrop);

  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }
  function closeDrawer() { if (sidebar) sidebar.classList.add('collapsed'); }

  // ---------- Mobile read font size ----------
  var FONT_KEY = 'defterMobileReadFontSize';
  var FONT_MIN = 15;
  var FONT_MAX = 24;
  var FONT_DEFAULT = 17;

  function clampFontSize(value) {
    value = parseInt(value, 10);
    if (!Number.isFinite(value)) value = FONT_DEFAULT;
    return Math.max(FONT_MIN, Math.min(FONT_MAX, value));
  }

  function getStoredFontSize() {
    try {
      return clampFontSize(localStorage.getItem(FONT_KEY));
    } catch (e) {
      return FONT_DEFAULT;
    }
  }

  function setStoredFontSize(value) {
    try {
      localStorage.setItem(FONT_KEY, String(value));
    } catch (e) {
      // localStorage can be unavailable in some embedded contexts.
    }
  }

  function applyReadFontSize(value) {
    var size = clampFontSize(value);
    document.documentElement.style.setProperty('--mobile-read-font-size', size + 'px');
    setStoredFontSize(size);

    var label = $('mobileReadFontValue');
    if (label) label.textContent = size + 'px';

    var minus = $('mobileReadFontMinus');
    var plus = $('mobileReadFontPlus');
    if (minus) minus.disabled = size <= FONT_MIN;
    if (plus) plus.disabled = size >= FONT_MAX;
  }

  function mountReadFontControl() {
    if ($('mobileReadFontControl')) return;
    var widthControl = $('readModalWidthControl');
    var header = widthControl ? widthControl.parentElement : null;
    if (!header) return;

    var control = document.createElement('div');
    control.className = 'mobile-read-font-control';
    control.id = 'mobileReadFontControl';
    control.innerHTML =
      '<button type="button" class="mobile-read-font-btn" id="mobileReadFontMinus" aria-label="Yaziyi kucult">A-</button>' +
      '<span class="mobile-read-font-value" id="mobileReadFontValue"></span>' +
      '<button type="button" class="mobile-read-font-btn" id="mobileReadFontPlus" aria-label="Yaziyi buyut">A+</button>';

    widthControl.insertAdjacentElement('afterend', control);

    $('mobileReadFontMinus').addEventListener('click', function () {
      applyReadFontSize(getStoredFontSize() - 1);
    });
    $('mobileReadFontPlus').addEventListener('click', function () {
      applyReadFontSize(getStoredFontSize() + 1);
    });
  }

  mountReadFontControl();
  applyReadFontSize(getStoredFontSize());

  // Açılışta telefonda sidebar kapalı başlasın (notlar öne çıksın)
  if (isMobile() && sidebar) sidebar.classList.add('collapsed');

  // sidebar 'collapsed' durumu değişince arka planı eşitle (kim değiştirirse değiştirsin)
  if (sidebar && 'MutationObserver' in window) {
    new MutationObserver(function () {
      var open = isMobile() && !sidebar.classList.contains('collapsed');
      backdrop.classList.toggle('show', open);
    }).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  }
  backdrop.addEventListener('click', closeDrawer);

  // Bir seçim yapılınca çekmeceyi kapat (filtre / etiket / takvim günü)
  ['tagCloud', 'calDays'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { if (isMobile()) closeDrawer(); });
  });
  document.querySelectorAll('.filter-btn').forEach(function (b) {
    b.addEventListener('click', function () { if (isMobile()) closeDrawer(); });
  });

  // ============================================================
  // Senkron ayar penceresi
  // ============================================================
  var modal = $('syncModal');
  function openModal() {
    if (!SYNC) return;
    var info = SYNC.getInfo();
    $('syncGistId').value = info.gistId || '';
    $('syncToken').value = '';
    $('syncToken').placeholder = info.hasToken ? '(kayıtlı — değiştirmek için yeni gir)' : 'ghp_… veya github_pat_…';
    renderStatus(info.status);
    modal.style.display = 'flex';
  }
  function closeModal() { modal.style.display = 'none'; }

  var openBtn = $('syncSettingsBtn');
  if (openBtn) openBtn.addEventListener('click', openModal);
  $('syncModalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  // Bağlan / kaydet
  $('syncSaveBtn').addEventListener('click', function () {
    var token = $('syncToken').value.trim();
    var gistId = $('syncGistId').value.trim();
    var info = SYNC.getInfo();

    if (!token && !info.hasToken) {
      alert('Lütfen önce GitHub token girin (yalnızca "gist" izinli).');
      return;
    }
    // Token boş ama kayıtlıysa: sadece yeniden senkronla
    if (!token && info.hasToken) {
      SYNC.syncNow();
      closeModal();
      return;
    }
    $('syncSaveBtn').disabled = true;
    SYNC.setConfig({ token: token, gistId: gistId })
      .then(function () {
        var i = SYNC.getInfo();
        $('syncGistId').value = i.gistId || '';
        if (i.status && i.status.state === 'hata') {
          alert('Bağlanılamadı: ' + (i.status.error || 'bilinmeyen hata') +
                '\n\nToken doğru mu ve "gist" izni var mı kontrol edin.');
        } else {
          alert('Bağlandı! ✓\nGist ID kaydedildi. Diğer cihazda da aynı Gist ID + token ile bağlanabilirsiniz.');
          closeModal();
        }
      })
      .catch(function (e) { alert('Hata: ' + e.message); })
      .finally(function () { $('syncSaveBtn').disabled = false; });
  });

  // Şimdi senkronla
  $('syncNowBtn').addEventListener('click', function () {
    if (!SYNC.isConfigured()) { alert('Önce bağlanın.'); return; }
    SYNC.syncNow();
  });

  // Bağlantıyı kes
  $('syncDisconnectBtn').addEventListener('click', function () {
    if (!confirm('Bulut bağlantısı kesilsin mi? Notlar telefonda kalır, sadece senkron durur.')) return;
    SYNC.disconnect().then(function () {
      $('syncToken').value = '';
      $('syncGistId').value = '';
      renderStatus({ state: 'kapali' });
    });
  });

  // ============================================================
  // Durum göstergesi (nokta + metin)
  // ============================================================
  var COLORS = {
    kapali: '#777',
    cevrimdisi: '#777',
    senkron: 'var(--accent-warning)',
    tamam: 'var(--accent-primary)',
    hata: 'var(--accent-danger)'
  };
  var LABELS = {
    kapali: 'kapalı (yalnızca telefonda)',
    cevrimdisi: 'çevrimdışı — internet gelince senkronlanır',
    senkron: 'senkronlanıyor…',
    tamam: 'senkron açık ✓',
    hata: 'hata'
  };

  function renderStatus(status) {
    status = status || { state: 'kapali' };
    var dot = $('syncStatusDot');
    if (dot) dot.style.background = COLORS[status.state] || '#777';
    var txt = $('syncStatusText');
    if (txt) {
      var label = LABELS[status.state] || status.state;
      if (status.state === 'tamam' && status.lastSync) {
        var d = new Date(status.lastSync);
        label += ' — son: ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      }
      if (status.state === 'hata' && status.error) label += ': ' + status.error;
      txt.textContent = 'Durum: ' + label;
    }
  }

  if (SYNC) {
    SYNC.onStatus(renderStatus);
    renderStatus(SYNC.getInfo().status);
  }
})();
