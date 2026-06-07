// ==========================================
// Tıbbi Not Defteri - Kaydırma Koruması (MAIN world monkey-patch)
// AI sohbetinde yukarıdaki bir yanıtı okurken, akış (streaming) sırasında
// sitenin seni programatik olarak en alta çekmesini engeller.
//
// Mimari: "Native Scroll Paradox"
//  - Kullanıcının fare tekeri / klavye / KAYDIRMA ÇUBUĞU eylemleri tarayıcının
//    C++ compositor'unda işlenir; JS'teki scrollTop setter'ını veya scrollTo'yu
//    ASLA çağırmaz. Site ise kaydırmak için bu JS API'lerini çağırmak ZORUNDA.
//  - Bu script MAIN world'de bu API'leri sarmalar. Kilit açıkken yalnızca sitenin
//    "dibe çek" çağrılarını yutar (NO-OP). Kullanıcının fiziksel kaydırması hiçbir
//    zaman engellenmez -> jitter yok, scrollbar tamamen serbest.
//
// {enabled, mode} bilgisi ISOLATED world'deki scroll-bridge.js'ten postMessage
// ile gelir (chrome.storage MAIN world'de erişilemez).
// ==========================================
(function () {
  'use strict';
  if (window.__TND_scrollPatched) return;
  window.__TND_scrollPatched = true;

  // manifest "matches" zaten AI hostlarıyla sınırlı; ek güvenlik kapısı.
  const AI_HOSTS = [
    'gemini.google.com', 'chat.openai.com', 'chatgpt.com',
    'claude.ai', 'grok.com', 'x.com', 'copilot.microsoft.com', 'perplexity.ai'
  ];
  if (!AI_HOSTS.some(h => location.hostname.includes(h))) return;

  // --- Durum ---
  let enabled = true;   // bridge'ten: preferences.enabled
  let lockMode = true;  // bridge'ten: preferences.scrollMode === 'lock'
  let locked = false;   // kullanıcı yukarı kaydırdı -> kilit aktif
  let lockedC = null;   // kilitlenen kaydırma konteyneri
  const TOL = 48;       // "dipteyim" toleransı (px)

  function on() { return enabled && lockMode; }

  // --- Orijinal API referansları (yamadan ÖNCE sakla) ---
  const D = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const oScrollTo = Element.prototype.scrollTo;
  const oScrollBy = Element.prototype.scrollBy;
  const oScroll = Element.prototype.scroll;
  const oSIV = Element.prototype.scrollIntoView;
  const oSIVIN = Element.prototype.scrollIntoViewIfNeeded; // Blink'e özel, olmayabilir
  const oWinScrollTo = window.scrollTo.bind(window);
  const oWinScrollBy = window.scrollBy.bind(window);

  // --- Geometri yardımcıları ---
  function isDocEl(el) {
    return el === document.documentElement || el === document.body ||
           el === document.scrollingElement;
  }
  function topOf(el) {
    if (isDocEl(el)) return window.scrollY || (document.scrollingElement || document.documentElement).scrollTop;
    return D.get.call(el);
  }
  function heightOf(el) { return isDocEl(el) ? document.documentElement.scrollHeight : el.scrollHeight; }
  function clientOf(el) { return isDocEl(el) ? window.innerHeight : el.clientHeight; }
  function distToBottom(el, top) {
    if (top == null) top = topOf(el);
    return heightOf(el) - top - clientOf(el);
  }
  // Hedef konum, içeriği TOL kadar dibe çekiyor mu?
  function pullsToBottom(el, targetTop) { return distToBottom(el, targetTop) <= TOL; }
  // Bu eleman, kilitlediğimiz konteynerin kendisi mi?
  function isLockedContainer(el) {
    if (!locked || !lockedC) return false;
    if (el === lockedC) return true;
    return isDocEl(lockedC) && isDocEl(el);
  }

  // --- Argüman çözümleyiciler ---
  function topFromArgs(args) {
    const a0 = args[0];
    if (a0 && typeof a0 === 'object') return typeof a0.top === 'number' ? a0.top : null;
    if (args.length >= 2 && typeof args[1] === 'number') return args[1];
    return null;
  }

  // ==========================================
  // YAMA 1: Element.prototype.scrollTop (setter)
  // Getter'a DOKUNMUYORUZ (native kalır -> okuma maliyeti sıfır).
  // ==========================================
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    enumerable: D.enumerable,
    get: D.get,
    set(val) {
      if (on() && isLockedContainer(this) && pullsToBottom(this, val)) return; // NO-OP
      D.set.call(this, val);
    }
  });

  // ==========================================
  // YAMA 2: scrollTo / scroll (mutlak konum)
  // ==========================================
  function wrapAbs(orig) {
    return function (...args) {
      if (on() && isLockedContainer(this)) {
        const t = topFromArgs(args);
        if (t != null && pullsToBottom(this, t)) return; // dibe scrollTo -> yut
      }
      return orig.apply(this, args);
    };
  }
  Element.prototype.scrollTo = wrapAbs(oScrollTo);
  if (oScroll) Element.prototype.scroll = wrapAbs(oScroll);

  // ==========================================
  // YAMA 3: scrollBy (göreli)
  // ==========================================
  Element.prototype.scrollBy = function (...args) {
    if (on() && isLockedContainer(this)) {
      const d = topFromArgs(args);
      if (d != null && d > 0 && pullsToBottom(this, topOf(this) + d)) return;
    }
    return oScrollBy.apply(this, args);
  };

  // ==========================================
  // YAMA 4: scrollIntoView (yeni mesajı görünüme getirme)
  // Yalnızca eleman görünür alanın ALTINDAysa (bizi aşağı çekecekse) engelle;
  // yukarıdaki bir alıntıya/atıfa gitmeye izin ver.
  // ==========================================
  function blockSIV(el) {
    if (!on() || !locked || !lockedC || isDocEl(lockedC)) return false;
    if (!lockedC.contains || !lockedC.contains(el)) return false;
    const r = el.getBoundingClientRect();
    const viewBottom = lockedC.getBoundingClientRect().bottom;
    return r.top >= viewBottom - 4; // eleman altta -> aşağı çeker -> yut
  }
  Element.prototype.scrollIntoView = function (...args) {
    if (blockSIV(this)) return;
    return oSIV.apply(this, args);
  };
  if (oSIVIN) {
    Element.prototype.scrollIntoViewIfNeeded = function (...args) {
      if (blockSIV(this)) return;
      return oSIVIN.apply(this, args);
    };
  }

  // ==========================================
  // YAMA 5: window.scrollTo / scrollBy (Claude/Grok gibi doc-kaydıranlar)
  // ==========================================
  window.scrollTo = function (...args) {
    if (on() && locked && lockedC && isDocEl(lockedC)) {
      const sc = document.scrollingElement || document.documentElement;
      const t = topFromArgs(args);
      if (t != null && pullsToBottom(sc, t)) return;
    }
    return oWinScrollTo(...args);
  };
  window.scrollBy = function (...args) {
    if (on() && locked && lockedC && isDocEl(lockedC)) {
      const sc = document.scrollingElement || document.documentElement;
      const d = topFromArgs(args);
      if (d != null && d > 0 && pullsToBottom(sc, topOf(sc) + d)) return;
    }
    return oWinScrollBy(...args);
  };

  // ==========================================
  // KİLİT DURUM MAKİNESİ — pasif scroll dinleyici
  // Sadece "dipte miyim?" okur; ASLA setTop çağırmaz (tug-of-war yok).
  // ==========================================
  function plausibleScroller(el) {
    if (isDocEl(el)) return heightOf(el) - clientOf(el) > 60;
    if (!el || el.nodeType !== 1) return false;
    return el.scrollHeight - el.clientHeight > 60;
  }
  document.addEventListener('scroll', (e) => {
    if (!on()) { setLock(false); return; }
    let el = e.target;
    if (el === document || el === window || !el || el.nodeType === 9) {
      el = document.scrollingElement || document.documentElement;
    }
    if (!plausibleScroller(el)) return;
    if (distToBottom(el) > TOL) { lockedC = el; setLock(true); }      // yukarıda -> kilitle
    else if (el === lockedC || isDocEl(el)) { setLock(false); }       // dibe indi -> serbest
  }, { capture: true, passive: true });

  function setLock(v) {
    if (v === locked) return;
    locked = v;
    if (!v) lockedC = null;
    updateButton();
  }

  // ==========================================
  // "Yeni yanıtlara git" butonu (CSS content.css'ten gelir)
  // ==========================================
  let btn = null;
  function ensureBtn() {
    if (btn && btn.isConnected) return btn;
    btn = document.createElement('button');
    btn.className = 'tnd-root tnd-scroll-btn';
    btn.type = 'button';
    btn.style.display = 'none';
    btn.innerHTML = '<span class="tnd-scroll-ic">⤓</span> Yeni yanıtlara git';
    btn.addEventListener('click', () => {
      const c = lockedC || document.scrollingElement || document.documentElement;
      setLock(false); // önce kilidi aç, yoksa kendi kaydırmamız da bloklanır
      const target = heightOf(c) - clientOf(c) + 600;
      if (isDocEl(c)) oWinScrollTo(0, target); else D.set.call(c, target);
    });
    (document.body || document.documentElement).appendChild(btn);
    return btn;
  }
  function updateButton() {
    if (!on() || !locked) { if (btn) btn.style.display = 'none'; return; }
    ensureBtn().style.display = 'flex';
  }

  // ==========================================
  // ISOLATED köprüden config (enabled / mode)
  // ==========================================
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const m = e.data;
    if (!m || m.source !== 'TND_SCROLL' || m.type !== 'config') return;
    enabled = m.enabled !== false;
    lockMode = m.mode !== 'off';
    if (!on()) setLock(false);
  });
  // Köprü bizden önce yüklendiyse config'i iste.
  window.postMessage({ source: 'TND_SCROLL', type: 'request' }, '*');

  console.debug('[TND] Kaydırma koruması MAIN world\'e yerleşti (native scroll paradox aktif).');
})();
