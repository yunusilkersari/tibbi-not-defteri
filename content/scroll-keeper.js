// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması (Kilit)
// AI sohbetinde yukarıdaki bir yanıtı okurken, yeni mesaj/akış sırasında
// sayfanın seni en alta çekmesini engeller. Senin kendi kaydırman
// (fare tekeri, kaydırma çubuğu, klavye) HER ZAMAN serbesttir.
//
// Mantık: Sitenin "alta çekmesi", içerik o an büyürken (streaming) gelen
// ve aşağı yönlü olan kaydırmadır. Bunu MutationObserver ile ayırt edip
// yalnızca onu geri alırız; diğer tüm kaydırmalar kullanıcıya aittir.
// Mod (preferences.scrollMode): 'lock' | 'off'
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

  let mode = 'lock';            // 'lock' | 'off'
  let masterEnabled = true;
  let savedTop = null;          // okuma konumu (piksel)
  let anchorEl = null;          // okunan mesaj elemanı (çapa)
  let anchorOffset = 0;
  let lastUserScroll = 0;       // wheel/touch/klavye zamanı
  let lastMutation = 0;         // içerik son ne zaman büyüdü (streaming)
  let restoring = false;
  let learnedContainer = null;
  let observer = null;
  let observedTarget = null;
  let btn = null;

  const USER_WINDOW = 300;      // ms
  const STREAM_WINDOW = 450;    // ms

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
    mode = (p.scrollMode === 'off') ? 'off' : 'lock'; // 'button' eski değeri de kilit say
    masterEnabled = p.enabled !== false;
  }

  function active() { return masterEnabled && mode === 'lock'; }

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
  function messageEls() { return answerEls().concat(questionEls()); }

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
    if (!active() || !c || !c.style) return;
    try {
      if (!instantApplied.has(c)) { c.style.scrollBehavior = 'auto'; instantApplied.add(c); }
    } catch (e) { /* yoksay */ }
  }

  function rememberContainer(c) {
    if (isDoc(c)) {
      if (!learnedContainer || !learnedContainer.isConnected) learnedContainer = c;
    } else {
      learnedContainer = c;
    }
    forceInstantScroll(c);
    ensureObserver();
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
  // İçerik büyümesini izle (streaming tespiti)
  // ==========================================
  function ensureObserver() {
    let target = (learnedContainer && !isDoc(learnedContainer) && learnedContainer.isConnected)
      ? learnedContainer
      : (document.querySelector('main') || document.body);
    if (!target || target === observedTarget) return;
    if (observer) observer.disconnect();
    observedTarget = target;
    observer = new MutationObserver(() => { lastMutation = Date.now(); });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  // ==========================================
  // Çapa (okunan mesaj elemanı)
  // ==========================================
  function pickAnchor(c) {
    const refTop = containerTop(c);
    let best = null, bestDist = Infinity;
    messageEls().forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.bottom <= refTop + 4) return;
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
    savedTop = getTop(c);
    return true;
  }

  function clearAnchor() { savedTop = null; anchorEl = null; }

  // ==========================================
  // Kullanıcı niyeti (wheel/touch/klavye) — yardımcı sinyal
  // ==========================================
  function onUserScroll() { lastUserScroll = Date.now(); }
  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  // ==========================================
  // Ana scroll işleyici
  // ==========================================
  function onScroll(e) {
    if (!active()) return;

    let c = e.target;
    if (c === document || c === window || !c || c.nodeType === 9) c = docScroller();
    if (!isConversationScroller(c)) return;

    rememberContainer(c);

    if (restoring) { restoring = false; return; }

    const userActive = Date.now() - lastUserScroll < USER_WINDOW;
    const streaming = Date.now() - lastMutation < STREAM_WINDOW;

    // Sitenin akış sırasında ALTA çekmesi mi? (kullanıcı tetiklemediyse ve aşağı yönlüyse)
    if (!userActive && streaming && savedTop != null && getTop(c) > savedTop + 24) {
      const ok = restoreByAnchor(c);
      if (!ok && getTop(c) > savedTop + 4) {
        restoring = true;
        setTop(c, savedTop);
        savedTop = getTop(c);
      }
      showGoBottom();
      return;
    }

    // Diğer tüm kaydırmalar kullanıcıya aittir → çapayı güncelle (scrollbar dahil serbest)
    updateAnchor(c);
  }

  function updateAnchor(c) {
    if (isNearBottom(c)) {
      clearAnchor();
      hideButton();
    } else {
      savedTop = getTop(c);
      pickAnchor(c);
      showGoBottom();
    }
  }

  // ==========================================
  // "Yeni yanıtlara git" butonu
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
    if (!active()) return;
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

  function hideButton() { if (btn) btn.style.display = 'none'; }

  // ==========================================
  // Başlat
  // ==========================================
  function start() {
    ['wheel', 'touchmove', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, onUserScroll, { passive: true, capture: true }));

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
        onUserScroll();
      }
    }, { capture: true });

    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    ensureObserver();
  }
})();
