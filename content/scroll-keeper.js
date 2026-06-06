// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması
// AI sohbetinde yukarıdaki bir yanıtı okurken yeni mesaj gönderince
// sayfanın seni en alta çekmesini engeller / okuduğun yere döndürür.
// Modlar (preferences.scrollMode): 'lock' | 'button' | 'off'
//
// Konteyner, GERÇEK scroll olayının hedefinden (e.target) öğrenilir —
// böylece Gemini gibi iç içe scroll yapan arayüzlerde de doğru çalışır.
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

  let mode = 'lock';
  let masterEnabled = true;
  let savedTop = null;        // okuma konumu (yukarıdayken)
  let lastUserScroll = 0;
  let restoring = false;
  let learnedContainer = null; // scroll olaylarından öğrenilen gerçek konteyner
  let btn = null;

  // ==========================================
  // Tercihler
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
  // Scroll yardımcıları (element veya döküman)
  // ==========================================
  function docScroller() {
    return document.scrollingElement || document.documentElement;
  }
  function isDoc(c) {
    return c === document.scrollingElement || c === document.documentElement || c === document.body;
  }
  function getTop(c) {
    return isDoc(c) ? (window.scrollY || document.documentElement.scrollTop) : c.scrollTop;
  }
  function setTop(c, v) {
    if (isDoc(c)) window.scrollTo(0, v);
    else c.scrollTop = v;
  }
  function maxScroll(c) {
    const sh = isDoc(c) ? document.documentElement.scrollHeight : c.scrollHeight;
    const ch = isDoc(c) ? window.innerHeight : c.clientHeight;
    return sh - ch;
  }
  function isNearBottom(c) {
    return maxScroll(c) - getTop(c) < 90;
  }

  function answerEls() {
    return (window.__TND_AIParser && window.__TND_AIParser.getAnswerElements)
      ? window.__TND_AIParser.getAnswerElements()
      : [];
  }

  // e.target bir "sohbet" scroller'ı mı? (AI cevabı içeriyor mu)
  function isConversationScroller(c) {
    if (!c) return false;
    if (isDoc(c)) {
      // döküman scroller'ı: sayfa kendisi kayıyorsa
      return maxScroll(c) > 40;
    }
    if (c.nodeType !== 1) return false;
    if (maxScroll(c) < 40) return false;
    const ans = answerEls();
    return ans.length > 0 && ans.some(a => c.contains(a));
  }

  function rememberContainer(c) {
    // Element scroller'ı tercih et; döküman scroller'ı yalnızca başka yoksa
    if (isDoc(c)) {
      if (!learnedContainer || !learnedContainer.isConnected) learnedContainer = c;
    } else {
      learnedContainer = c;
    }
  }

  function container() {
    if (learnedContainer && (isDoc(learnedContainer) || learnedContainer.isConnected)) {
      return learnedContainer;
    }
    return guessContainer();
  }

  function guessContainer() {
    const ans = answerEls();
    let ref = ans.length ? ans[ans.length - 1] : (document.querySelector('main') || document.body);
    let el = ref;
    while (el && el !== document.documentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8) return el;
      el = el.parentElement;
    }
    return docScroller();
  }

  // ==========================================
  // Olaylar
  // ==========================================
  function onUserScroll() {
    lastUserScroll = Date.now();
  }

  function onScroll(e) {
    if (!active()) return;

    let c = e.target;
    if (c === document || c === window || !c) c = docScroller();
    if (c.nodeType === 9) c = docScroller(); // document node
    if (!isConversationScroller(c)) return;

    rememberContainer(c);

    if (restoring) { restoring = false; return; }

    const userActive = Date.now() - lastUserScroll < 300;
    if (userActive) {
      updateAnchor(c);
      return;
    }

    // Programatik (site kaynaklı) kaydırma
    if (savedTop == null) return;

    if (mode === 'lock') {
      if (getTop(c) > savedTop + 4) {
        restoring = true;
        setTop(c, savedTop);
        showGoBottom();
      }
    } else if (mode === 'button') {
      if (isNearBottom(c) && getTop(c) > savedTop + 60) {
        showReturn();
      }
    }
  }

  function updateAnchor(c) {
    if (isNearBottom(c)) {
      savedTop = null;
      hideButton();
    } else {
      savedTop = getTop(c);
      if (mode === 'lock') showGoBottom();
    }
  }

  // ==========================================
  // Yüzen buton
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
      setTop(c, maxScroll(c) + 200);
      hideButton();
    };
    b.style.display = 'flex';
  }

  function showReturn() {
    if (mode !== 'button' || !active()) return;
    const b = getButton();
    b.innerHTML = '<span class="tnd-scroll-ic">↩</span> Okuduğun yere dön';
    b.onclick = () => {
      if (savedTop != null) setTop(container(), savedTop);
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

    // Tüm scroll olaylarını capture aşamasında yakala (her elemandan)
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }
})();
