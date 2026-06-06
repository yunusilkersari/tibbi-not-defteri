// ==========================================
// Tıbbi Not Defteri - AI Response Parser
// Gemini, ChatGPT, Claude gibi AI chat arayüzlerinden
// son yanıtı algılayıp paragraflara bölen modül
// ==========================================

(function () {
  'use strict';

  // AI platformlarının DOM yapıları
  const AI_SELECTORS = {
    // Google Gemini
    gemini: {
      hostname: ['gemini.google.com'],
      responseSelector: 'message-content.model-response-text',
      fallbackSelector: '.response-container .markdown, .model-response-text, [data-message-author-role="model"]',
      userSelector: 'user-query .query-text, .query-text, [data-message-author-role="user"]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // OpenAI ChatGPT
    chatgpt: {
      hostname: ['chat.openai.com', 'chatgpt.com'],
      responseSelector: '[data-message-author-role="assistant"] .markdown',
      fallbackSelector: '.agent-turn .markdown, .text-message .markdown',
      userSelector: '[data-message-author-role="user"] .whitespace-pre-wrap, [data-message-author-role="user"]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Anthropic Claude
    claude: {
      hostname: ['claude.ai'],
      responseSelector: '[data-is-streaming="false"] .font-claude-message, .font-claude-message',
      fallbackSelector: '.prose, .claude-message',
      userSelector: '[data-testid="user-message"], .font-user-message',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // xAI Grok
    grok: {
      hostname: ['grok.com', 'x.com'],
      responseSelector: '[data-testid="message-text"], [data-testid="assistantMessage"], .message-bubble .markdown, .message-text .markdown',
      fallbackSelector: '.markdown, .prose, .response-content, article .break-words, [class*="message"] [class*="markdown"], [class*="response"] p',
      userSelector: '[data-testid="user-message"], .items-end .message-bubble, [class*="user"] .message-bubble',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Microsoft Copilot
    copilot: {
      hostname: ['copilot.microsoft.com'],
      responseSelector: '.ac-textBlock, cib-message-group[source="bot"] .ac-textBlock',
      fallbackSelector: '[data-content]',
      userSelector: 'cib-message-group[source="user"] .ac-textBlock, [data-author="user"]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Perplexity
    perplexity: {
      hostname: ['www.perplexity.ai', 'perplexity.ai'],
      responseSelector: '.prose .markdown',
      fallbackSelector: '.prose',
      userSelector: '[class*="query"], h1.group\\/query',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Generic fallback - herhangi bir sayfa
    generic: {
      hostname: [],
      responseSelector: '.markdown, .prose, [class*="markdown"], [class*="response"], [class*="answer"], [class*="message-content"], article',
      fallbackSelector: 'main, #content, .content, [role="main"]',
      userSelector: '[data-message-author-role="user"], [data-testid="user-message"]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote'
    }
  };

  // Platform seçicisi başarısız olduğunda denenecek genel kullanıcı-mesajı seçicileri
  const GENERIC_USER_SELECTOR =
    '[data-message-author-role="user"], [data-testid="user-message"], .font-user-message, ' +
    'user-query .query-text, .query-text';

  /**
   * Mevcut sayfanın hangi AI platformuna ait olduğunu belirle
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [name, config] of Object.entries(AI_SELECTORS)) {
      if (name === 'generic') continue;
      if (config.hostname.some(h => hostname.includes(h))) {
        return { name, ...config };
      }
    }
    return { name: 'generic', ...AI_SELECTORS.generic };
  }

  /**
   * Sayfadaki son AI yanıtını bul
   */
  function findLastResponse() {
    const platform = detectPlatform();

    // Ana seçiciyi dene
    let responses = document.querySelectorAll(platform.responseSelector);

    // Fallback seçiciyi dene
    if (responses.length === 0 && platform.fallbackSelector) {
      responses = document.querySelectorAll(platform.fallbackSelector);
    }

    if (responses.length === 0) return null;

    // Son yanıtı al
    const lastResponse = responses[responses.length - 1];
    return {
      element: lastResponse,
      platform: platform.name,
      paragraphSelector: platform.paragraphSelector
    };
  }

  /**
   * Son yanıtı paragraflara böl
   */
  function parseResponseToParagraphs() {
    const response = findLastResponse();
    if (!response) return null;

    const { element, platform, paragraphSelector } = response;

    // Paragrafları topla
    const paragraphElements = element.querySelectorAll(paragraphSelector);
    const paragraphs = [];

    if (paragraphElements.length > 0) {
      paragraphElements.forEach((el) => {
        const text = el.textContent.trim();
        if (text.length > 5) { // Çok kısa metinleri atla
          paragraphs.push({
            text: text,
            html: el.innerHTML,
            tag: el.tagName.toLowerCase()
          });
        }
      });
    }

    // Eğer paragraf bulunamazsa, metni satır satır böl
    if (paragraphs.length === 0) {
      const fullText = element.textContent.trim();
      const lines = fullText.split(/\n\n+/).filter(l => l.trim().length > 5);
      lines.forEach((line) => {
        paragraphs.push({
          text: line.trim(),
          html: line.trim(),
          tag: 'p'
        });
      });
    }

    return {
      paragraphs,
      fullText: element.textContent.trim(),
      platform,
      sourceUrl: window.location.href,
      sourceTitle: document.title
    };
  }

  /**
   * Son yanıtın tam metnini al
   */
  function getFullResponse() {
    const response = findLastResponse();
    if (!response) return null;

    // Resimleri mutlak URL'ye çevir
    const clone = response.element.cloneNode(true);
    clone.querySelectorAll('img').forEach(img => {
      if (img.src) img.setAttribute('src', img.src); // relative → absolute
    });

    return {
      text: response.element.textContent.trim(),
      html: cleanHtml(clone.innerHTML),
      platform: response.platform,
      sourceUrl: window.location.href,
      sourceTitle: document.title
    };
  }

  /**
   * Belirli bir cevap elementinden hemen önce gelen kullanıcı sorusunu bul.
   * Önce platforma özel seçici, bulunamazsa genel seçiciler denenir.
   * Doküman sırasında cevaptan önce gelen son kullanıcı mesajı = ilgili soru.
   */
  function findQuestionFor(answerEl, platform) {
    const selectors = [platform.userSelector, GENERIC_USER_SELECTOR].filter(Boolean);
    for (const sel of selectors) {
      let best = null;
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      nodes.forEach((u) => {
        // Cevabın içindeki/iç içe geçmiş elemanları atla
        if (u === answerEl || u.contains(answerEl) || answerEl.contains(u)) return;
        const pos = answerEl.compareDocumentPosition(u);
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
          best = u; // doküman sırasında en son "önceki" = en yakın soru
        }
      });
      if (best) {
        const text = cleanQuestionText(best.textContent);
        if (text) return text;
      }
    }
    return '';
  }

  /**
   * Kullanıcı mesajının başındaki gizli (ekran okuyucu) arayüz etiketlerini at.
   * Ör. ChatGPT'nin "Siz şunu dediniz:" / "You said:" sr-only etiketi.
   */
  function cleanQuestionText(text) {
    if (!text) return '';
    let t = text.trim();
    const prefixes = [
      'Siz şunu dediniz:', 'Siz şunu dediniz',
      'You said:', 'You said',
      'Şunu dediniz:', 'Sen dedin ki:',
      'Sen:', 'Siz:'
    ];
    for (const p of prefixes) {
      if (t.toLowerCase().startsWith(p.toLowerCase())) {
        t = t.slice(p.length).trim();
        break;
      }
    }
    return t;
  }

  /**
   * Bir cevap elementinden Soru + Cevap paketi oluştur.
   * Sohbet içindeki herhangi bir AI yanıtının yanındaki butondan çağrılır.
   */
  function buildQA(answerEl) {
    if (!answerEl) return null;
    const platform = detectPlatform();
    const questionText = findQuestionFor(answerEl, platform);

    // Resimleri mutlak URL'ye çevir
    const clone = answerEl.cloneNode(true);
    clone.querySelectorAll('img').forEach((img) => {
      if (img.src) img.setAttribute('src', img.src);
    });

    return {
      questionText,
      answerText: answerEl.textContent.trim(),
      answerHtml: cleanHtml(clone.innerHTML),
      platform: platform.name,
      sourceUrl: window.location.href,
      sourceTitle: document.title
    };
  }

  /**
   * Sayfadaki tüm AI cevap elementlerini doküman sırasıyla döndür.
   * Her cevabın yanına "kaydet" butonu iliştirmek için kullanılır.
   */
  function getAnswerElements() {
    const platform = detectPlatform();
    let els = document.querySelectorAll(platform.responseSelector);
    if (els.length === 0 && platform.fallbackSelector) {
      els = document.querySelectorAll(platform.fallbackSelector);
    }
    return Array.from(els);
  }

  /**
   * Sayfadaki tüm kullanıcı sorusu elementlerini döndür.
   * İç içe eşleşmelerde en içteki (asıl metni taşıyan) element tutulur,
   * böylece her soru için tek bir buton ankrajı kalır.
   */
  function getQuestionElements() {
    const platform = detectPlatform();
    const selectors = [platform.userSelector, GENERIC_USER_SELECTOR].filter(Boolean);
    let arr = [];
    for (const sel of selectors) {
      try {
        const found = Array.from(document.querySelectorAll(sel));
        if (found.length) { arr = found; break; }
      } catch (e) { /* geçersiz seçici, sonrakini dene */ }
    }
    // İç içe geçenleri ele: başka bir eşleşmeyi içeren atalar düşürülür
    return arr.filter(el => !arr.some(other => other !== el && el.contains(other)));
  }

  /**
   * Belirli bir sorudan hemen sonra gelen ilk AI cevabını bul.
   */
  function findAnswerFor(questionEl) {
    if (!questionEl) return null;
    const answers = getAnswerElements(); // doküman sırasında
    for (const a of answers) {
      if (a === questionEl || a.contains(questionEl) || questionEl.contains(a)) continue;
      const pos = questionEl.compareDocumentPosition(a);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return a;
    }
    return null;
  }

  /**
   * HTML'i temizle — gereksiz boşlukları, script/style etiketlerini kaldır
   */
  function cleanHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    // Tehlikeli etiketleri kaldır
    temp.querySelectorAll('script, style, iframe, object, embed, link, meta, noscript').forEach(el => el.remove());
    // Olay attribute'larını (onclick, onerror...) ve javascript: URL'lerini temizle
    temp.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = (attr.value || '').trim();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                   /^\s*(javascript|data:text\/html|vbscript):/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    // Gereksiz boş satırları temizle
    let cleaned = temp.innerHTML;
    cleaned = cleaned.replace(/(\s*<br\s*\/?>\s*){3,}/gi, '<br><br>');
    return cleaned;
  }

  // Global erişim için expose et
  window.__TND_AIParser = {
    detectPlatform,
    findLastResponse,
    parseResponseToParagraphs,
    getFullResponse,
    findQuestionFor,
    buildQA,
    getAnswerElements,
    getQuestionElements,
    findAnswerFor,
    cleanHtml
  };

  // Diğer içerik scriptleri kayıttan önce HTML temizlemek için kullanır
  window.__TND_sanitizeHtml = cleanHtml;
})();
