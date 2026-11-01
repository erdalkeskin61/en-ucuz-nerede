/**
 * 🔔 Web Push (PWA native) — 2026-11-01
 *
 * E-posta/Telegram'dan BAĞIMSIZ çalışır: tarayıcı aboneliği SQLite'ta tutulur,
 * fiyat alarmı tetiklendiğinde `web-push` ile VAPID imzalı bildirim gönderilir.
 *
 * VAPID anahtarları:
 *  - İlk çalışmada otomatik üretilir ve `settings` tablosunda (`webpush`) saklanır;
 *    böylece yeniden başlatmada abonelikler geçersizleşmez.
 *  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` ortam değişkenleri verilirse onlar
 *    kullanılır (anahtarları yedekten geri yüklemek için).
 *
 * DÜRÜSTLÜK: gönderim hatası yutulmaz; sonuç `{basarili, hatali, detay}` olarak
 * döner. 404/410 (abonelik ölmüş) kayıtları temizlenir.
 */
import webpush from 'web-push';
import { getSettings, saveSettings, pushAbonelikler, pushAbonelikSil } from './store.js';

let hazir = null;

/** Ayar nesnesinden VAPID anahtarlarını döndürür; yoksa üretip kaydeder. */
export function vapidAnahtarlari() {
  const s = getSettings();
  const envPublic = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = String(process.env.VAPID_PRIVATE_KEY || '').trim();

  let publicKey = envPublic || s.webpush?.publicKey || '';
  let privateKey = envPrivate || s.webpush?.privateKey || '';
  let subject = String(s.webpush?.subject || process.env.VAPID_SUBJECT || '').trim();

  if (!publicKey || !privateKey) {
    const uretilen = webpush.generateVAPIDKeys();
    publicKey = uretilen.publicKey;
    privateKey = uretilen.privateKey;
  }
  if (!subject) {
    // VAPID "sub" alanı bir iletişim adresi olmalı (mailto: veya https:).
    subject = s.alarmEmail ? `mailto:${s.alarmEmail}` : 'mailto:destek@enucuznerede.app';
  }

  // Anahtarlar değiştiyse (ilk üretim ya da env) kalıcılaştır.
  if (s.webpush?.publicKey !== publicKey || s.webpush?.privateKey !== privateKey || s.webpush?.subject !== subject) {
    try { saveSettings({ webpush: { publicKey, privateKey, subject } }); } catch { /* yoksay */ }
  }
  return { publicKey, privateKey, subject };
}

/** web-push'u bir kez yapılandırır. */
export function pushHazirla() {
  if (hazir) return hazir;
  const k = vapidAnahtarlari();
  webpush.setVapidDetails(k.subject, k.publicKey, k.privateKey);
  hazir = { ...k, abone: pushAbonelikler().length };
  return hazir;
}

/**
 * Tüm kayıtlı cihazlara bildirim gönderir.
 *
 * @param {{baslik:string, govde:string, url?:string, etiket?:string, veri?:object}} bildirim
 * @returns {Promise<{basarili:number, hatali:number, abone:number, detay:Array}>}
 */
export async function pushGonder(bildirim = {}) {
  const abonelikler = pushAbonelikler();
  if (!abonelikler.length) return { basarili: 0, hatali: 0, abone: 0, detay: [] };

  try { pushHazirla(); } catch (e) {
    return { basarili: 0, hatali: abonelikler.length, abone: abonelikler.length, detay: [{ hata: String(e.message || e) }] };
  }

  const payload = JSON.stringify({
    title: String(bildirim.baslik || 'En Ucuz Nerede?').slice(0, 120),
    body: String(bildirim.govde || '').slice(0, 240),
    url: bildirim.url || '/',
    tag: bildirim.etiket || 'eun-fiyat',
    data: bildirim.veri || null,
    icon: '/ikon-192.png',
    badge: '/ikon-192.png',
    ts: Date.now(),
  });

  const detay = [];
  let basarili = 0;
  let hatali = 0;

  await Promise.all(abonelikler.map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, payload, { TTL: 3600, urgency: 'normal' });
      basarili++;
      detay.push({ endpoint: a.endpoint.slice(-18), durum: 'ok' });
    } catch (e) {
      hatali++;
      const kod = Number(e?.statusCode || 0);
      // 404/410: abonelik kalıcı olarak geçersiz → kaydı temizle.
      if (kod === 404 || kod === 410) pushAbonelikSil(a.endpoint);
      detay.push({ endpoint: a.endpoint.slice(-18), durum: 'hata', kod, hata: String(e.message || e).slice(0, 100) });
    }
  }));

  return { basarili, hatali, abone: abonelikler.length, detay };
}

/** Hata ayıklama/test için kısa durum. */
export function pushDurum() {
  try {
    const k = vapidAnahtarlari();
    return {
      abone: pushAbonelikler().length,
      publicKey: k.publicKey,
      subject: k.subject,
      hazir: true,
    };
  } catch (e) {
    return { abone: 0, publicKey: null, subject: null, hazir: false, hata: String(e.message || e) };
  }
}
