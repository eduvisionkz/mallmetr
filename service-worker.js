// MalMetr service worker — қосымша қабығын кэштеу, интернетсіз жұмыс
const VERSION = 'malmetr-v1.1.0';
const MODEL_CACHE = 'malmetr-models-v1'; // нұсқа жаңарғанда AI модельді қайта жүктемеу үшін бөлек
// AI модель файлдары (vendor/tf.min.js, vendor/coco-ssd.js, models/coco-ssd/*) орнату кезінде жүктелмейді:
// оларды пайдаланушы AI көмекшіні қосқанда бір рет жүктейді, содан кейін төмендегі fetch өңдеушісі кэштейді.
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/ui.js', './js/expr.js', './js/models.js', './js/geometry.js',
  './js/viewer.js', './js/session.js', './js/scanner.js', './js/measure.js', './js/modelview.js',
  './js/lab.js', './js/defense.js', './js/charts.js', './js/scheme.js', './js/ai/detector.js', './js/ai/segment.js',
  './vendor/qrcode.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== MODEL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Бет навигациясы: алдымен желі (жаңа нұсқа үшін), болмаса кэш
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // AI модель мен кітапханалар өзгермейді: тек кэштен (бар болса), желіні қайталамау
  if (url.pathname.includes('/models/') || url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(MODEL_CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Қалған ресурстар: алдымен кэш, фонда жаңарту
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
