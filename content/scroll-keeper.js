// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması
// AI sohbetinde yukarıdaki bir yanıtı okurken yeni mesaj gönderince
// sayfanın seni en alta çekmesini engeller / okuduğun yere döndürür.
// Modlar (preferences.scrollMode): 'lock' | 'button' | 'off'
// ==========================================

(function () {
  'use strict';

  const AI_HOSTS = [
    'gemini.google.com',
    'chat.openai.com', 'chatgpt.com',
    'claude.ai',
    'grok.com', 'x.com',
    'copilot.microsoft.com',
    'perplexity.ai'
  ];
  if (!AI_HOSTS.some(h => window.location.hostname.includes(h))) return;

  let mode = 'lock';        // varsayılan: kilit
  let masterEnabled = true; // uzantı genel aç/kapa
  let savedTop = null;      // kullanıcının yukarıdaki okuma konumu
  let lastUserScroll = 0;
  let restoring = false;
  let cachedContainer = null;
  let btn = null;

  // ==========================================
  // Tercihleri yükle / izle
  // ==========================================
  chrome.storage.local.get('preferences', (r) => {
    applyPrefs(r.preferences);
    start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.preferences) return;
    applyPrefs(changes.preferences.newValue);
    if (mode === 'off' || !masterEnabled) {
      savedTop = null;
      hideButton();
    }
  });

  function applyPrefs(prefs) {
    const p = prefs || {};
    mode = p.scrollMode || 'lock';
    masterEnabled = p.enabled !== false;
  }

  function active() {
    return masterEnabled && mode !== 'off';
  }

  // ==========================================
  // Kaydırma konteynerini bul (mesajların scroll edilebilir atası)
  // ==========================================
  function isDocScroller(c) {
    return c === document.scrollingElement || c === document.documentElement || c === document.body;
  }
  function getTop(c) {
    return isDocScroller(c) ? (window.scrollY || document.documentElement.scrollTop) : c.scrollTop;
  }
  function setTop(c, v) {
    if (isDocScroller(c)) window.scrollTo(0, v);
    else c.scrollTop = v;
  }
  function scrollHeightOf(c) {
    return isDocScroller(c) ? document.documentElement.scrollHeight : c.scrollHeight;
  }
  function clientHeightOf(c) {
    return isDocScroller(c) ? window.innerHeight : c.clientHeight;
  }
  function isNearBottom(c) {
    return scrollHeightOf(c) - getTop(c) - clientHeightOf(c) < 90;
  }

  function findScrollContainer() {
    let ref = null;
    if (window.__TND_AIParser && window.__TND_AIParser.getAnswerElements) {
      const answers = window.__TND_AIParser.getAnswerElements();
      if (answers.length) ref = answers[answers.length - 1];
    }
    if (!ref) ref = document.querySelector('main') || document.body;

    let el = ref;
    while (el && el !== document.documentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8) {
        return el;
      }
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function container() {
    if (cachedContainer && cachedContainer.isConnected) return cachedContainer;
    cachedContainer = findScrollContainer();
    return cachedContainer;
  }

  // ==========================================
  // Kullanıcı kaydırma niyeti
  // ==========================================
  function onUserScroll() {
    lastUserScroll = Date.now();
    updateAnchor();
  }

  function updateAnchor() {
    if (!active()) return;
    const c = container();
    if (!c) return;
    if (isNearBottom(c)) {
      // En altta: takip moduna dön
      savedTop = null;
      hideButton();
    } else {
      savedTop = getTop(c);
      if (mode === 'lock') showGoBottom();
    }
  }

  // ==========================================
  // Scroll olayı: programatik (sitenin) alta kaymayı yakala
  // ==========================================
  function onScroll() {
    if (!active()) return;
    const c = container();
    if (!c) return;

    if (restoring) { restoring = false; return; }

    const userActive = Date.now() - lastUserScroll < 250;
    if (userActive) { updateAnchor(); return; }

    // Buradan sonrası: programatik (site kaynaklı) kaydırma
    if (savedTop == null) return;

    if (mode === 'lock') {
      // Aşağı zıpladıysa okuma konumuna geri yapıştır
      if (getTop(c) > savedTop + 4) {
        restoring = true;
        setTop(c, savedTop);
        showGoBottom();
      }
    } else if (mode === 'button') {
      // Alta zıpladıysa "geri dön" butonunu göster
      if (isNearBottom(c) && getTop(c) > savedTop + 60) {
        showReturn();
      }
    }
  }

  // ==========================================
  // Yüzen buton (moda göre değişir)
  // ==========================================
  function getButton() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.className = 'tnd-root tnd-scroll-btn';
    btn.type = 'button';
    btn.style.display = 'none';
    document.body.appendChild(btn);
    return btn;
  }

  function showGoBottom() {
    if (mode !== 'lock' || !active()) return;
    const b = getButton();
    b.innerHTML = '<span class="tnd-scroll-ic">⤓</span> Yeni yanıtlara git';
    b.onclick = () => {
      const c = container();
      savedTop = null;
      setTop(c, scrollHeightOf(c));
      hideButton();
    };
    b.style.display = 'flex';
  }

  function showReturn() {
    if (mode !== 'button' || !active()) return;
    const b = getButton();
    b.innerHTML = '<span class="tnd-scroll-ic">↩</span> Okuduğun yere dön';
    b.onclick = () => {
      if (savedTop != null) {
        const c = container();
        setTop(c, savedTop);
      }
      hideButton();
    };
    b.style.display = 'flex';
  }

  function hideButton() {
    if (btn) btn.style.display = 'none';
  }

  // ==========================================
  // Başlat
  // ==========================================
  function start() {
    ['wheel', 'touchmove', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, onUserScroll, { passive: true, capture: true }));

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
        onUserScroll();
      }
    }, { capture: true });

    // Tüm scroll olaylarını capture aşamasında yakala (konteyner + döküman)
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    // Konteyner sayfa yüklendikçe değişebilir; arada bir tazele
    setInterval(() => { cachedContainer = null; }, 2000);
  }
})();
