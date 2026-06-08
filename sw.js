// ============================================================
// Tıbbi Not Defteri — Service Worker (çevrimdışı çalışma)
// ------------------------------------------------------------
// - Uygulama kabuğunu önbelleğe alır → internetsiz açılır.
// - GitHub API (senkron) İSTEKLERİNİ ASLA önbelleğe almaz; hep canlı.
// - "stale-while-revalidate": önce önbellekten gösterir, arka planda
//   yeni sürümü indirip önbelleği günceller.
// ============================================================
var CACHE = 'tibbi-defter-v3';

// Uygulama kabuğu (kökten göreli yollar; alt klasör barındırmada da çalışır)
var CORE = [
  './',
  './index.html',
  './app/app.css',
  './app/storage.js',
  './app/app.js',
  './mobile-shim.js',
  './mobile-settings.js',
  './mobile.css',
  './manifest.webmanifest',
  './icons/icon128.png',
  './icons/icon192.png',
  './icons/icon512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Tek tek ekle: biri 404 olsa bile kurulum bozulmasın
      return Promise.all(CORE.map(function (url) {
        return cache.add(url).catch(function () { /* yoksay */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // GitHub API (senkron) ve diğer API çağrıları → ASLA önbellek, hep ağ
  if (url.hostname === 'api.github.com' || url.hostname === 'gist.githubusercontent.com') {
    return; // tarayıcı normal ağ isteğini yapsın
  }

  // stale-while-revalidate
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
