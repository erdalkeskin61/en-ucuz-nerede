/**
 * 🔔 Sıfır Sürtünmeli Web Push Fiyat Alarmı + PWA Testi (2026-11-06)
 *
 * Kapsam:
 *  1) `tracked.pushSubscription` şeması + addTracked / parseTrackedRow
 *  2) `pushCihazaGonder()` tekil cihaz gönderimi (VAPID payload sözleşmesi)
 *  3) 404/410 Gone → abonelik HER İKİ yerden sessizce temizlenir
 *  4) `checkAlarms()` hedef fiyat altına düşünce kişisel push'u tetikler
 *  5) PWA/SW/UI sözleşmeleri (beforeinstallprompt, iOS ipucu, safe-area,
 *     notificationclick, viewport-fit=cover, /api/takip)
 *
 * Ağ isteği YOK: `web-push.sendNotification`, fiyat kaynağı ve doğrulama mock'lanır.
 *
 *   node scripts/test-webpush-pwa.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import {
  addTracked, getTracked, removeTracked, pushAbonelikNormalize,
  pushAbonelikKaydet, pushAbonelikTemizle, closeDatabase,
} from '../src/store.js';
import { pushCihazaGonder } from '../src/push.js';
import { checkAlarms } from '../src/alarms.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

/* ------------------------------------------------------------------ */
// web-push ağını mock'la (gerçek VAPID isteği atılmaz).
const gercekSend = webpush.sendNotification;
let gonderimler = [];
let mockHata = null;
webpush.sendNotification = async (sub, payload, opts) => {
  let veri = {};
  try { veri = JSON.parse(payload); } catch { veri = { ham: payload }; }
  gonderimler.push({ sub, veri, opts });
  if (mockHata) {
    const e = new Error(mockHata === 410 ? 'Gone' : 'Not Found');
    e.statusCode = mockHata;
    throw e;
  }
  return { statusCode: 201, body: '' };
};

const abonelik = (ek = '') => ({
  endpoint: 'https://push.example.com/cihaz' + ek,
  keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'a' + 'y'.repeat(21) },
});

const olusturulan = [];

bolum('1) 🗄️ tracked şeması — pushSubscription / pushEndpoint');

const s1 = abonelik('-sema');
const kayit = addTracked({
  urun: '__TEST_WEBPUSH__ Ürün',
  modelKodu: '__TEST_WEBPUSH_MODEL__',
  hedefFiyat: 500,
  urunler: [{ site: 'trendyol', url: 'https://example.com/urun' }],
  pushSubscription: s1,
});
olusturulan.push(kayit.id);

kontrol('addTracked pushSubscription döndürür', !!kayit.pushSubscription);
kontrol('addTracked pushEndpoint döndürür', kayit.pushEndpoint === s1.endpoint);
const okunan = getTracked().find(t => t.id === kayit.id);
kontrol('SQLite kaydı aboneliği geri okur',
  okunan?.pushSubscription?.endpoint === s1.endpoint && okunan?.pushEndpoint === s1.endpoint);

const s2 = { endpoint: '', keys: { p256dh: '', auth: '' } };
kontrol('geçersiz abonelik normalize edilmez', pushAbonelikNormalize(s2) === null);
kontrol('eksik p256dh reddedilir',
  pushAbonelikNormalize({ endpoint: 'https://x', keys: { auth: 'a' } }) === null);

bolum('2) 📨 pushCihazaGonder — tekil cihaza VAPID sözleşmesi');

gonderimler = []; mockHata = null;
const r1 = await pushCihazaGonder(s1, {
  baslik: '🎉 Fiyat Düştü! Test Ürün',
  govde: 'Hedeflediğiniz 500,00 TL altına inerek 450,00 TL oldu (Trendyol). Satın almak için dokunun!',
  url: 'https://example.com/urun',
  etiket: 'eun-alarm-test',
  veri: { urunId: 'takip_test' },
});
kontrol('gönderim başarılı', r1.basarili === true && r1.hatali === false);
kontrol('tek istek gönderildi', gonderimler.length === 1, String(gonderimler.length));
kontrol('doğru endpoint kullanıldı', gonderimler[0]?.sub?.endpoint === s1.endpoint);
kontrol('p256dh/auth korunur',
  gonderimler[0]?.sub?.keys?.p256dh === s1.keys.p256dh && gonderimler[0]?.sub?.keys?.auth === s1.keys.auth);
kontrol('payload başlığı doğru', gonderimler[0]?.veri?.title === '🎉 Fiyat Düştü! Test Ürün');
kontrol('payload gövdesi hedef + yeni fiyat içerir',
  /Hedeflediğiniz/.test(gonderimler[0]?.veri?.body || '') &&
  /450/.test(gonderimler[0]?.veri?.body || ''));
kontrol('payload URL ürün mağaza linki', gonderimler[0]?.veri?.url === 'https://example.com/urun');
kontrol('payload etiketi taşınır', gonderimler[0]?.veri?.tag === 'eun-alarm-test');
kontrol('payload data.urunId', gonderimler[0]?.veri?.data?.urunId === 'takip_test');
kontrol('TTL + high urgency', gonderimler[0]?.opts?.TTL === 3600 && gonderimler[0]?.opts?.urgency === 'high');

const gecersiz = await pushCihazaGonder({ endpoint: '', keys: {} }, { baslik: 'x' });
kontrol('geçersiz abonelik sessizce hata döner', gecersiz.basarili === false && gecersiz.temizlendi === false);

bolum('3) 🧹 404/410 Gone — abonelik iki yerden temizlenir');

// Genel kayıt + takip kaydı aynı endpoint'i göstersin.
pushAbonelikKaydet(s1);
mockHata = 410;
const r410 = await pushCihazaGonder(s1, { baslik: 'gone testi' });
mockHata = null;
kontrol('410 hata olarak raporlanır', r410.basarili === false && r410.kod === 410);
kontrol('410 temizlendi işaretlenir', r410.temizlendi === true);
const temizKayit = getTracked().find(t => t.id === kayit.id);
kontrol('takip kaydındaki abonelik temizlendi',
  temizKayit?.pushSubscription == null && temizKayit?.pushEndpoint == null);

// 404 ayrıca denenir (aynı sözleşme).
const s404 = abonelik('-404');
const k404 = addTracked({
  urun: '__TEST_WEBPUSH_404__',
  hedefFiyat: 100,
  urunler: [{ site: 'hepsiburada', url: 'https://example.com/404' }],
  pushSubscription: s404,
});
olusturulan.push(k404.id);
mockHata = 404;
const r404 = await pushCihazaGonder(s404, { baslik: 'not found testi' });
mockHata = null;
kontrol('404 temizlendi', r404.kod === 404 && r404.temizlendi === true);
kontrol('404 takip kaydı temizlendi',
  getTracked().find(t => t.id === k404.id)?.pushSubscription == null);

// elle temizlik yardımcısı idempotent olmalı
kontrol('pushAbonelikTemizle ikinci kez 0 döner', pushAbonelikTemizle(s404.endpoint) === 0);

bolum('4) 🎯 checkAlarms — hedef altına düşünce kişisel push tetiklenir');

const sAlarm = abonelik('-alarm');
const alarmKayit = addTracked({
  urun: '__TEST_WEBPUSH_ALARM__ Kulaklık',
  modelKodu: '__TEST_WEBPUSH_ALARM_MODEL__',
  hedefFiyat: 500,
  urunler: [{ site: 'trendyol', url: 'https://example.com/alarm' }],
  pushSubscription: sAlarm,
});
olusturulan.push(alarmKayit.id);

gonderimler = []; mockHata = null;
const alarmSonuc = await checkAlarms({
  sadeceId: alarmKayit.id,
  sessiz: true,
  kanallariAtla: true,
  fiyatKaynagi: async () => [{
    site: 'trendyol',
    siteName: 'Trendyol',
    url: 'https://example.com/alarm',
    pricing: { toplam: 449.9, kampanyaKosullu: [], kupon: null },
    product: { inStock: true, afiliyeUrl: 'https://example.com/alarm?ref=eun' },
  }],
  dogrulamaKaynagi: async () => ({ toplam: 449.9, kupon: null }),
});

const rapor = alarmSonuc.sonuclar?.[0];
const hedefBildirim = rapor?.bildirimler?.find(b => b.tur === 'hedef');
kontrol('checkAlarms tamamlandı', alarmSonuc.tamam === true);
kontrol('hedef tetiklendi', !!hedefBildirim);
kontrol('kişisel push başarılı', hedefBildirim?.pushCihaz?.basarili === true);
kontrol('tek cihaza tek istek', gonderimler.length === 1, String(gonderimler.length));
kontrol('push başlığı 🎉 Fiyat Düştü içerir',
  /🎉 Fiyat Düştü!/.test(gonderimler[0]?.veri?.title || ''));
kontrol('push gövdesi hedef + yeni fiyat + mağaza içerir',
  /Hedeflediğiniz/.test(gonderimler[0]?.veri?.body || '') &&
  /449,90/.test(gonderimler[0]?.veri?.body || '') &&
  /Trendyol/.test(gonderimler[0]?.veri?.body || ''));
kontrol('push URL afiliye linki kullanır',
  gonderimler[0]?.veri?.url === 'https://example.com/alarm?ref=eun',
  String(gonderimler[0]?.veri?.url));
kontrol('kişisel abonelik kaybolmadı (updateTracked korur)',
  getTracked().find(t => t.id === alarmKayit.id)?.pushSubscription?.endpoint === sAlarm.endpoint);
kontrol('sonHedefBildirimi yazıldı',
  !!getTracked().find(t => t.id === alarmKayit.id)?.sonHedefBildirimi);

bolum('5) 📱 PWA / UI / Service Worker sözleşmeleri');

const indexHtml = oku('public/index.html');
const swJs = oku('public/sw.js');
const appJs = oku('public/app.js');
const pwaJs = oku('public/pwa-install.js');
const css = oku('public/style.css');
const manifest = JSON.parse(oku('public/manifest.json'));
const serverJs = oku('server.js');
const pushJs = oku('src/push.js');
const storeJs = oku('src/store.js');

kontrol('viewport-fit=cover (çentik uyumu)', /viewport-fit=cover/.test(indexHtml));
kontrol('pwa-install.js sayfaya bağlı', /src="\/pwa-install\.js"/.test(indexHtml));
kontrol('manifest standalone', manifest.display === 'standalone');
kontrol('manifest start_url pwa=1', manifest.start_url.includes('pwa=1'));
kontrol('SW sürümü v6+', /eun-v([6-9]|\d{2,})/.test(swJs));
kontrol('SW notificationclick var', /notificationclick/.test(swJs));
kontrol('SW açık sekmeye odaklanır', /\.focus\(\)/.test(swJs));
kontrol('SW sekme yoksa openWindow', /clients\.openWindow/.test(swJs));
kontrol('SW pushsubscriptionchange var', /pushsubscriptionchange/.test(swJs));

kontrol('PWA beforeinstallprompt yakalanır', /beforeinstallprompt/.test(pwaJs));
kontrol('PWA iOS UA testi', /iphone\|ipad\|ipod/i.test(pwaJs));
kontrol('PWA 10 saniye gecikme', /10000|10 saniye/.test(pwaJs));
kontrol('PWA localStorage kapatma hafızası', /localStorage/.test(pwaJs));
kontrol('PWA standalone modda açılmaz', /display-mode:\s*standalone/.test(pwaJs));
kontrol('PWA gerçek prompt çağrısı', /\.prompt\(\)/.test(pwaJs));

kontrol('kartta Fiyat Alarmı düğmesi', /🔔 Fiyat Alarmı/.test(appJs));
kontrol('alarm VAPID anahtarını alır', /\/api\/push\/vapid-key/.test(appJs));
kontrol('pushManager.subscribe kullanılır', /pushManager\.subscribe/.test(appJs));
kontrol('alarm POST /api/takip', /\/api\/takip/.test(appJs));
kontrol('e-posta/şifre istenmez notu', /E-posta, telefon veya şifre gerekmez/.test(appJs));
kontrol('/api/takip sunucuda tanımlı', /'\/api\/takip'/.test(serverJs));
kontrol('sunucu pushSubscription alır', /pushSubscription/.test(serverJs));

kontrol('alarm popover stili var', /\.alarm-popover\s*\{/.test(css));
kontrol('PWA alt çekmece stili var', /\.pwa-kurulum\s*\{/.test(css));
kontrol('safe-area-inset-bottom kullanılır', /env\(safe-area-inset-bottom/.test(css));
kontrol('mobilde popover alt çekmece', /@media \(max-width: 640px\)[\s\S]*\.alarm-popover/.test(css));

kontrol('push.js 404/410 temizliği', /404/.test(pushJs) && /410/.test(pushJs) && /pushAbonelikTemizle/.test(pushJs));
kontrol('store pushSubscription kolonu', /pushSubscription/.test(storeJs));
kontrol('store pushEndpoint kolonu', /pushEndpoint/.test(storeJs));
kontrol('store endpoint index', /idx_tracked_push_endpoint/.test(storeJs));
kontrol('GET /api/tracked push anahtarlarını sızdırmaz',
  /const \{ pushSubscription, \.\.\.kalan \} = t/.test(serverJs) && /pushAlarm: !!pushSubscription/.test(serverJs));

/* ------------------------------------------------------------------ */
// temizlik
for (const id of olusturulan) {
  try { removeTracked(id); } catch { /* yoksay */ }
}
try { pushAbonelikTemizle(s1.endpoint); } catch { /* yoksay */ }

webpush.sendNotification = gercekSend;
closeDatabase();

console.log(`\n${gecen}/${toplam} test geçti`);
if (hatalar.length) {
  console.log(`\nBaşarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
