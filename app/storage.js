// ==========================================
// Tıbbi Not Defteri - Storage Module
// chrome.storage.local CRUD ve JSON export/import
// ==========================================

const NotStorage = {
  /**
   * Tüm notları getir
   */
  async getAll() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-all-notes' }, (response) => {
        resolve(response && response.success ? response.notes : []);
      });
    });
  },

  /**
   * Filtrelenmiş notları getir
   */
  async getFiltered(filter = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-notes', filter }, (response) => {
        resolve(response && response.success ? response.notes : []);
      });
    });
  },

  /**
   * Bugünün notlarını getir
   */
  async getToday() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-today-notes' }, (response) => {
        resolve(response && response.success ? response.notes : []);
      });
    });
  },

  /**
   * Not kaydet
   */
  async save(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'save-note', data }, (response) => {
        resolve(response && response.success ? response.note : null);
      });
    });
  },

  /**
   * Not güncelle
   */
  async update(data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'update-note', data }, (response) => {
        resolve(response && response.success ? response.note : null);
      });
    });
  },

  /**
   * Not sil
   */
  async delete(noteId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'delete-note', noteId }, (response) => {
        resolve(response && response.success);
      });
    });
  },

  /**
   * JSON olarak dışa aktar
   */
  async exportToJSON() {
    const notes = await this.getAll();
    const data = {
      app: 'Tıbbi Not Defteri',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      noteCount: notes.length,
      notes
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tibbi-notlar-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  },

  /**
   * JSON'dan içe aktar
   */
  async importFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const notes = data.notes || data;

          if (!Array.isArray(notes)) {
            reject(new Error('Geçersiz dosya formatı'));
            return;
          }

          chrome.runtime.sendMessage({ action: 'import-notes', data: notes }, (response) => {
            if (response && response.success) {
              resolve(notes.length);
            } else {
              reject(new Error('İçe aktarma başarısız'));
            }
          });
        } catch (err) {
          reject(new Error('JSON ayrıştırma hatası: ' + err.message));
        }
      };
      reader.readAsText(file);
    });
  },

  /**
   * Belirli bir güne ait notları getir
   */
  async getByDate(date) {
    const allNotes = await this.getAll();
    const dateStr = new Date(date).toDateString();
    return allNotes.filter(n => new Date(n.createdAt).toDateString() === dateStr);
  },

  /**
   * Tüm etiketleri ve sayılarını getir
   */
  async getAllTags() {
    const notes = await this.getAll();
    const tagMap = {};
    notes.forEach(note => {
      (note.tags || []).forEach(tag => {
        tagMap[tag] = (tagMap[tag] || 0) + 1;
      });
    });
    return Object.entries(tagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Notlu günleri getir (takvim için)
   */
  async getDaysWithNotes(year, month) {
    const notes = await this.getAll();
    const days = new Set();
    notes.forEach(note => {
      const d = new Date(note.createdAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        days.add(d.getDate());
      }
    });
    return days;
  }
};
