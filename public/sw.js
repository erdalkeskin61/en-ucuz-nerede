/**
 * Service worker (PWA) — 2026-10-28.
 *
 * Amaç: uygulama kabuğunu zayıf bağlantıda hızlı açmak. Fiyat verisi ASLA
 * önbelleğe alınmaz (bayat fiyat yanıltıcı olur).
 *
 * Strateji (v2 — düzeltme):
 *  - HTML, JS, CSS, JSON: **network-first**. Önceki sürüm cache-first idi ve
 *    güncelleme yayınlandığında tarayıcı ESKİ app.js'i çalıştırmaya devam ediyordu
 *    (2026-10-28: yeni eklenen `sepetDevamEt` fonksiyonu "tanımsız" görünüyordu).
 *    Ağ varsa her zaman taze kod gelir; ağ yoksa önbellekten açılır (çevrimdışı çalışır).
 *  - Görseller/vendor kütüphanesi: cache-first (nadiren değişir, bant genişliği önemli).
 *  - `/api/*`: hiç önbelleklenmez.
 */
const SURUM = 'eun-v5';
const KABUK_DOSYALARI = [
  '/',
  '/style.css',
  '/app.js',
  '/tarayici.js',
  '/erisim.js',
  '/tema.js',
  '/manifest.json',
  // Grafik kütüphanesi artık yerel (2026-10-28): CDN yok, çevrimdışı da çalışır.
  '/vendor/chart.umd.min.js',
];

/** Ağdan taze kod gelmesi gereken yollar (network-first). */
function tazeOlmali(pathname) {
  return pathname === '/' ||
    /\.(?:html|js|css|json)$/i.test(pathname) && !pathname.startsWith('/vendor/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SURUM)
      .then((cache) => cache.addAll(KABUK_DOSYALARI.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => { /* bir dosya yoksa kurulum yine de tamamlansın */ })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((anahtarlar) => Promise.all(
        anahtarlar.filter(k => k !== SURUM).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const istek = event.request;
  if (istek.method !== 'GET') return;

  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;

  // API ve iş uçları: her zaman ağ (fiyat bayatlamasın)
  if (url.pathname.startsWith('/api/')) return;

  // Kod/HTML: network-first, başarısızsa önbellek
  if (tazeOlmali(url.pathname) || istek.mode === 'navigate') {
    event.respondWith(
      fetch(istek)
        .then((yanit) => {
          if (yanit && yanit.status === 200) {
            const kopya = yanit.clone();
            caches.open(SURUM).then(c => c.put(istek, kopya)).catch(() => {});
          }
          return yanit;
        })
        .catch(() => caches.match(istek).then(r => r || caches.match('/'))),
    );
    return;
  }

  // Görsel / vendor: cache-first + arka planda tazeleme
  event.respondWith(
    caches.match(istek).then((onbellek) => {
      const agdan = fetch(istek)
        .then((yanit) => {
          if (yanit && yanit.status === 200) {
            const kopya = yanit.clone();
            caches.open(SURUM).then(c => c.put(istek, kopya)).catch(() => {});
          }
          return yanit;
        })
        .catch(() => onbellek);
      return onbellek || agdan;
    }),
  );
});

/* ================= 🔔 Web Push (2026-11-01) =================
 *
 * Sunucu `web-push` ile VAPID imzalı bildirim gönderir; burada yalnızca gösterim
 * ve tıklama yönetilir. Tıklamada açık bir sekme varsa ona odaklanılır, yoksa
 * bildirimin `data.url` adresi yeni sekmede açılır.
 */

self.addEventListener('push', (event) => {
  let veri = {};
  try {
    veri = event.data ? event.data.json() : {};
  } catch {
    veri = { title: 'En Ucuz Nerede?', body: event.data ? event.data.text() : '' };
  }

  const baslik = String(veri.title || '🏷️ En Ucuz Nerede?').slice(0, 120);
  const govde = String(veri.body || '').slice(0, 240);
  const url = String(veri.url || '/');

  event.waitUntil(
    self.registration.showNotification(baslik, {
      body: govde,
      icon: veri.icon || '/ikon-192.png',
      badge: veri.badge || '/ikon-192.png',
      tag: veri.tag || 'eun-fiyat',
      renotify: false,
      data: { url, ...(veri.data || {}) },
      vibrate: [80, 40, 80],
    }).catch(() => {
      // Görsel yüklenemezse ikonsuz göster (bildirim kaybolmasın).
      return self.registration.showNotification(baslik, { body: govde, data: { url }, tag: veri.tag || 'eun-fiyat' });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hedef = event.notification?.data?.url || '/';
  let hedefUrl;
  try {
    hedefUrl = new URL(hedef, self.location.origin);
  } catch {
    hedefUrl = new URL('/', self.location.origin);
  }
  // Güvenlik: yalnızca kendi origin'imize yönlendir.
  if (hedefUrl.origin !== self.location.origin) hedefUrl = new URL('/', self.location.origin);

  event.waitUntil((async () => {
    const istemciler = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const istemci of istemciler) {
      try {
        if (new URL(istemci.url).origin !== self.location.origin) continue;
        await istemci.focus();
        if ('navigate' in istemci) await istemci.navigate(hedefUrl.href);
        return;
      } catch { /* sonraki istemci */ }
    }
    await self.clients.openWindow(hedefUrl.href);
  })());
});

// Push aboneliği tarayıcı tarafından yenilenirse sunucuya haber ver.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const yeni = await self.registration.pushManager.subscribe(event.oldSubscription?.options || { userVisibleOnly: true });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: yeni.toJSON() }),
      });
    } catch { /* sessizce geç; kullanıcı yeniden açabilir */ }
  })());
});
