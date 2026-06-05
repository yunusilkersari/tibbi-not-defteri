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
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // OpenAI ChatGPT
    chatgpt: {
      hostname: ['chat.openai.com', 'chatgpt.com'],
      responseSelector: '[data-message-author-role="assistant"] .markdown',
      fallbackSelector: '.agent-turn .markdown, .text-message .markdown',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Anthropic Claude
    claude: {
      hostname: ['claude.ai'],
      responseSelector: '[data-is-streaming="false"] .font-claude-message, .font-claude-message',
      fallbackSelector: '.prose, .claude-message',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // xAI Grok
    grok: {
      hostname: ['grok.com', 'x.com'],
      responseSelector: '[data-testid="message-text"], [data-testid="assistantMessage"], .message-bubble .markdown, .message-text .markdown',
      fallbackSelector: '.markdown, .prose, .response-content, article .break-words, [class*="message"] [class*="markdown"], [class*="response"] p',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Microsoft Copilot
    copilot: {
      hostname: ['copilot.microsoft.com'],
      responseSelector: '.ac-textBlock, cib-message-group[source="bot"] .ac-textBlock',
      fallbackSelector: '[data-content]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Perplexity
    perplexity: {
      hostname: ['www.perplexity.ai', 'perplexity.ai'],
      responseSelector: '.prose .markdown',
      fallbackSelector: '.prose',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote, table'
    },
    // Generic fallback - herhangi bir sayfa
    generic: {
      hostname: [],
      responseSelector: '.markdown, .prose, [class*="markdown"], [class*="response"], [class*="answer"], [class*="message-content"], article',
      fallbackSelector: 'main, #content, .content, [role="main"]',
      paragraphSelector: 'p, li, pre, h1, h2, h3, h4, h5, h6, blockquote'
    }
  };

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
   * HTML'i temizle — gereksiz boşlukları, script/style etiketlerini kaldır
   */
  function cleanHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    // Tehlikeli etiketleri kaldır
    temp.querySelectorAll('script, style, iframe, object, embed').forEach(el => el.remove());
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
    getFullResponse
  };
})();
