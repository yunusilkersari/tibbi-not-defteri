// ==========================================
// Tıbbi Not Defteri - Soru+Cevap Kaydet Butonları
// Sohbetteki HER sorunun yanında beliren, o soruyu ve
// onun AI cevabını tek not olarak kaydeden buton.
// Ayrıca Alt+3: o an okunan cevabı sorusuyla kaydeder.
// ==========================================

(function () {
  'use strict';

  // AI sohbet sayfası değilse hiç çalışma (her sayfaya buton koymayalım)
  const AI_HOSTS = [
    'gemini.google.com',
    'chat.openai.com', 'chatgpt.com',
    'claude.ai',
    'grok.com', 'x.com',
    'copilot.microsoft.com',
    'perplexity.ai'
  ];
  const hostname = window.location.hostname;
  if (!AI_HOSTS.some(h => hostname.includes(h))) return;

  let activeQuestion = null; // butonun şu an bağlı olduğu soru elementi
  let hideTimer = null;
  let saveBtn = null;

  // ==========================================
  // Sabit konumlu paylaşılan buton (soruya ankrajlı)
  // ==========================================
  function getButton() {
    if (saveBtn) return saveBtn;

    saveBtn = document.createElement('button');
    saveBtn.className = 'tnd-root tnd-qa-btn';
    saveBtn.type = 'button';
    saveBtn.innerHTML = `
      <span class="tnd-qa-btn-icon">💾</span>
      <span class="tnd-qa-btn-text">Soru+Cevap Kaydet</span>
    `;

    saveBtn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    saveBtn.addEventListener('mouseleave', scheduleHide);

    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeQuestion) {
        showToast('⚠️ Soru bulunamadı', 'error');
        return;
      }
      const answer = window.__TND_AIParser.findAnswerFor(activeQuestion);
      if (!answer) {
        showToast('⚠️ Bu sorunun cevabı bulunamadı', 'error');
        return;
      }
      saveAnswer(answer);
    });

    document.body.appendChild(saveBtn);
    return saveBtn;
  }

  function positionButton(el) {
    const btn = getButton();
    const rect = el.getBoundingClientRect();
    const bw = btn.offsetWidth || 165;

    // Tercihen sorunun sağına; taşıyorsa soluna koy
    let left = rect.right + 8;
    if (left + bw > window.innerWidth - 8) {
      left = rect.left - bw - 8;
    }
    if (left < 8) left = 8;

    let top = rect.top;
    top = Math.min(Math.max(8, top), window.innerHeight - 44);

    btn.style.left = left + 'px';
    btn.style.right = 'auto';
    btn.style.top = top + 'px';
  }

  function showButton() {
    getButton().classList.add('tnd-visible');
  }

  function hideButton() {
    if (saveBtn) saveBtn.classList.remove('tnd-visible');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideButton, 280);
  }

  // ==========================================
  // Her soru elementine hover olaylarını bağla
  // ==========================================
  function attach(el) {
    if (!el || el.dataset.tndQaAttached) return;
    el.dataset.tndQaAttached = '1';

    el.addEventListener('mouseenter', () => {
      // Uzantı kapalıysa butonu gösterme
      if (window.__TND_isEnabled && !window.__TND_isEnabled()) return;
      activeQuestion = el;
      clearTimeout(hideTimer);
      positionButton(el);
      showButton();
    });
    el.addEventListener('mouseleave', scheduleHide);
  }

  function scan() {
    if (!window.__TND_AIParser) return;
    const questions = window.__TND_AIParser.getQuestionElements();
    questions.forEach(attach);
  }

  // ==========================================
  // Kaydetme (cevap elementinden Soru+Cevap notu üret)
  // ==========================================
  function saveAnswer(answerEl) {
    if (!answerEl || !window.__TND_AIParser) {
      showToast('⚠️ Cevap bulunamadı', 'error');
      return;
    }

    const qa = window.__TND_AIParser.buildQA(answerEl);
    if (!qa || !qa.answerText) {
      showToast('⚠️ Cevap okunamadı', 'error');
      return;
    }

    const hasQuestion = qa.questionText && qa.questionText.length > 0;

    // Düz metin (arama / önizleme için)
    const contentText = hasQuestion
      ? `❓ Soru:\n${qa.questionText}\n\n💬 Cevap:\n${qa.answerText}`
      : qa.answerText;

    // HTML (defterde şık görünüm — uygulama contentHtml'i render ediyor)
    const questionBlock = hasQuestion
      ? `<div class="tnd-qa-question" style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #00d4aa;background:rgba(0,212,170,0.08);border-radius:0 8px 8px 0;">
           <div style="font-size:12px;font-weight:700;color:#00d4aa;margin-bottom:4px;letter-spacing:.3px;">❓ SORU</div>
           <div style="white-space:pre-wrap;">${escapeHtml(qa.questionText)}</div>
         </div>`
      : '';

    const contentHtml = `${questionBlock}<div class="tnd-qa-answer">${qa.answerHtml}</div>`;

    const btn = getButton();
    btn.classList.add('tnd-saving');

    chrome.runtime.sendMessage({
      action: 'save-note',
      data: {
        content: contentText,
        contentHtml: contentHtml,
        sourceUrl: qa.sourceUrl,
        sourceTitle: qa.sourceTitle,
        captureMethod: 'ai-qa'
      }
    }, (response) => {
      btn.classList.remove('tnd-saving');
      if (response && response.success) {
        flashSaved(btn);
        showToast(hasQuestion
          ? '✅ Soru + cevap deftere aktarıldı!'
          : '✅ Cevap deftere aktarıldı!', 'success');
      } else {
        showToast('❌ Kayıt başarısız oldu', 'error');
      }
    });
  }

  // ==========================================
  // Alt+3 için: o an ekranda okunan (merkeze en yakın) cevap
  // ==========================================
  function getMostVisibleAnswer() {
    if (!window.__TND_AIParser) return null;
    const answers = window.__TND_AIParser.getAnswerElements();
    const vh = window.innerHeight;
    let best = null;
    let bestScore = Infinity;
    answers.forEach((a) => {
      const r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.height === 0) return; // ekran dışı
      const center = r.top + r.height / 2;
      const score = Math.abs(center - vh / 2);
      if (score < bestScore) { bestScore = score; best = a; }
    });
    // Hiçbiri görünmüyorsa son cevaba düş
    if (!best && answers.length) best = answers[answers.length - 1];
    return best;
  }

  function flashSaved(btn) {
    btn.classList.add('tnd-saved');
    const textEl = btn.querySelector('.tnd-qa-btn-text');
    const iconEl = btn.querySelector('.tnd-qa-btn-icon');
    const prevText = textEl ? textEl.textContent : '';
    const prevIcon = iconEl ? iconEl.textContent : '';
    if (textEl) textEl.textContent = 'Kaydedildi';
    if (iconEl) iconEl.textContent = '✓';
    setTimeout(() => {
      btn.classList.remove('tnd-saved');
      if (textEl) textEl.textContent = prevText;
      if (iconEl) iconEl.textContent = prevIcon;
    }, 1600);
  }

  // ==========================================
  // Yardımcılar
  // ==========================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type) {
    if (window.__TND_showToast) {
      window.__TND_showToast(message, type);
    }
  }

  // ==========================================
  // Sohbet değiştikçe yeni soruları yakala
  // ==========================================
  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  // Scroll ederken konumlanmış buton bayatlamasın
  window.addEventListener('scroll', hideButton, { passive: true, capture: true });

  // İlk tarama
  scheduleScan();

  // ==========================================
  // Alt+3 (content.js → background) için dışa aç
  // ==========================================
  window.__TND_QA = {
    saveAnswer,
    getMostVisibleAnswer
  };

  // Kapatılınca bu butonu gizle
  window.__TND_hideHooks = window.__TND_hideHooks || [];
  window.__TND_hideHooks.push(hideButton);
})();
