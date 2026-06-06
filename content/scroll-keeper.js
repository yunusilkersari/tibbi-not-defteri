// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması
// AI sohbetinde yukarıdaki bir yanıtı okurken yeni mesaj gönderince
// sayfanın seni en alta çekmesini engeller / okuduğun yere döndürür.
// Modlar (preferences.scrollMode): 'lock' | 'button' | 'off'
//
// - Konteyner, gerçek scroll olayının hedefinden (e.target) öğrenilir.
// - Konum, okunan MESAJ ELEMANI çapa alınarak korunur (içerik büyüse de kaymaz);
//   eleman kaybolursa piksel konumuna düşülür.
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
  let savedTop = null;          // piksel yedeği (yukarıdayken)
  let anchorEl = null;          // okunan mesaj elemanı (çapa)
  let anchorOffset = 0;         // çapanın konteyner üstüne göre konumu (px)
  let lastUserScroll = 0;
  let restoring = false;
  let learnedContainer = null;
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
      clearAnchor();
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
  // Scroll yardımcıları
  // ==========================================
  function docScroller() { return document.scrollingElement || document.documentElement; }
  function isDoc(c) {
    return c === document.scrollingElement || c === document.documentElement || c === document.body;
  }
  function getTop(c) { return isDoc(c) ? (window.scrollY || document.documentElement.scrollTop) : c.scrollTop; }
  function setTop(c, v) { if (isDoc(c)) window.scrollTo(0, v); else c.scrollTop = v; }
  function maxScroll(c) {
    const sh = isDoc(c) ? document.documentElement.scrollHeight : c.scrollHeight;
    const ch = isDoc(c) ? window.innerHeight : c.clientHeight;
    return sh - ch;
  }
  function isNearBottom(c) { return maxScroll(c) - getTop(c) < 90; }
  function containerTop(c) { return isDoc(c) ? 0 : c.getBoundingClientRect().top; }

  function answerEls() {
    return (window.__TND_AIParser && window.__TND_AIParser.getAnswerElements)
      ? window.__TND_AIParser.getAnswerElements() : [];
  }
  function questionEls() {
    return (window.__TND_AIParser && window.__TND_AIParser.getQuestionElements)
      ? window.__TND_AIParser.getQuestionElements() : [];
  }
  function messageEls() {
    return answerEls().concat(questionEls());
  }

  function isConversationScroller(c) {
    if (!c) return false;
    if (isDoc(c)) return maxScroll(c) > 40;
    if (c.nodeType !== 1) return false;
    if (maxScroll(c) < 40) return false;
    const ans = answerEls();
    return ans.length > 0 && ans.some(a => c.contains(a));
  }

  const instantApplied = new WeakSet();
  function forceInstantScroll(c) {
    // Yumuşak (animasyonlu) kaydırmayı kapat -> kilit sırasında salınım/parlama azalır
    if (mode !== 'lock' || !c || !c.style) return;
    try {
      if (!instantApplied.has(c)) {
        c.style.scrollBehavior = 'auto';
        instantApplied.add(c);
      }
    } catch (e) { /* yoksay */ }
  }

  function rememberContainer(c) {
    if (isDoc(c)) {
      if (!learnedContainer || !learnedContainer.isConnected) learnedContainer = c;
    } else {
      learnedContainer = c;
    }
    forceInstantScroll(c);
  }

  function container() {
    if (learnedContainer && (isDoc(learnedContainer) || learnedContainer.isConnected)) return learnedContainer;
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
  // Çapa (okunan mesaj elemanı)
  // ==========================================
  function pickAnchor(c) {
    const refTop = containerTop(c);
    let best = null, bestDist = Infinity;
    messageEls().forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      // Görünür alanın üstüne en yakın, hâlâ görünen eleman
      if (r.bottom <= refTop + 4) return;
      const dist = Math.abs(r.top - refTop);
      if (dist < bestDist) { bestDist = dist; best = el; }
    });
    if (best) {
      anchorEl = best;
      anchorOffset = best.getBoundingClientRect().top - refTop;
    }
  }

  function restoreByAnchor(c) {
    if (!anchorEl || !anchorEl.isConnected) return false;
    const refTop = containerTop(c);
    const cur = anchorEl.getBoundingClientRect().top - refTop;
    const delta = cur - anchorOffset;
    if (Math.abs(delta) > 2) {
      restoring = true;
      setTop(c, getTop(c) + delta);
    }
    return true;
  }

  function clearAnchor() {
    savedTop = null;
    anchorEl = null;
  }

  // ==========================================
  // Olaylar
  // ==========================================
  function onUserScroll() { lastUserScroll = Date.now(); }

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onScroll(e) {
    if (!active()) return;

    let c = e.target;
    if (c === document || c === window || !c || c.nodeType === 9) c = docScroller();
    if (!isConversationScroller(c)) return;

    rememberContainer(c);

    if (restoring) { restoring = false; return; }

    const userActive = Date.now() - lastUserScroll < 300;
    if (userActive) { updateAnchor(c); return; }

    // Programatik (site kaynaklı) kaydırma
    if (savedTop == null && !anchorEl) return;

    if (mode === 'lock') {
      const ok = restoreByAnchor(c);
      if (!ok && savedTop != null && getTop(c) > savedTop + 4) {
        restoring = true;
        setTop(c, savedTop);
      }
      showGoBottom();
    } else if (mode === 'button') {
      if (isNearBottom(c) && savedTop != null && getTop(c) > savedTop + 60) {
        showReturn();
      }
    }
  }

  function updateAnchor(c) {
    if (isNearBottom(c)) {
      clearAnchor();
      hideButton();
    } else {
      savedTop = getTop(c);
      pickAnchor(c);
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
      clearAnchor();
      setTop(c, maxScroll(c) + 400);
      hideButton();
    };
    b.style.display = 'flex';
  }

  function showReturn() {
    if (mode !== 'button' || !active()) return;
    const b = getButton();
    b.innerHTML = '<span class="tnd-scroll-ic">↩</span> Okuduğun yere dön';
    b.onclick = () => {
      const c = container();
      if (!restoreByAnchor(c) && savedTop != null) setTop(c, savedTop);
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
      // Metin kutusuna yazarken (boşluk/ok dahil) kaydırma sayma
      if (isTypingTarget(e.target)) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
        onUserScroll();
      }
    }, { capture: true });

    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }
})();
