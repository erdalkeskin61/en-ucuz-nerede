/**
 * 🔔 Web Push + 📤 Sepet Paylaşımı testleri — 2026-11-01
 *
 * Kapsam:
 *  1) Web Push: VAPID anahtarları, abonelik CRUD, sw.js push/notificationclick,
 *     alarm tetikleyicisinde bildirim başlığı/gövdesi, ön yüz abonelik akışı.
 *  2) Sepet paylaşımı: SQLite kaydı, kısa link, herkese açık salt okunur okuma,
 *     WhatsApp metin biçimi, süre temizliği.
 *
 * Kullanım:
 *   node scripts/test-push-paylas.mjs
 *   node scripts/test-push-paylas.mjs --canli   (sunucu açık olmalı)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import {
  pushAbonelikKaydet, pushAbonelikler, pushAbonelikSil, pushIstatistik,
  sepetPaylasKaydet, sepetPaylasAl, sepetPaylasTemizle, closeDatabase,
} from '../src/store.js';
import { pushDurum, pushGonder, vapidAnahtarlari } from '../src/push.js';

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
const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/* ---------------------------------------------------------------- */
bolum('1) Web Push — VAPID ve abonelik deposu');
const d = pushDurum();
kontrol('push hazır', d.hazir === true, d.hata);
kontrol('VAPID public anahtarı üretildi', typeof d.publicKey === 'string' && d.publicKey.length >= 80, String(d.publicKey?.length));
kontrol('VAPID subject geçerli biçimde', /^(mailto:|https:)/.test(String(d.subject)), d.subject);
const k1 = vapidAnahtarlari();
const k2 = vapidAnahtarlari();
kontrol('anahtarlar kalıcı (yeniden üretilmiyor)', k1.publicKey === k2.publicKey);

const testEndpoint = 'https://push.test.invalid/' + Date.now();
kontrol('abonelik kaydedildi',
  pushAbonelikKaydet({ endpoint: testEndpoint, keys: { p256dh: 'p'.repeat(65), auth: 'a'.repeat(22) } }) === true);
kontrol('abonelik listede', pushAbonelikler().some(a => a.endpoint === testEndpoint));
kontrol('aynı endpoint ikinci kez eklenmez (UPSERT)',
  pushAbonelikKaydet({ endpoint: testEndpoint, keys: { p256dh: 'q'.repeat(65), auth: 'b'.repeat(22) } }) === true
  && pushAbonelikler().filter(a => a.endpoint === testEndpoint).length === 1);
kontrol('geçersiz abonelik reddedilir',
  pushAbonelikKaydet({ endpoint: '', keys: {} }) === false);
kontrol('abone sayacı', pushIstatistik().abone >= 1, String(pushIstatistik().abone));

// Geçersiz anahtar → dürüst hata (sessiz yutma yok)
const gonderim = await pushGonder({ baslik: 't', govde: 'g' });
kontrol('gönderim sonuç raporluyor', typeof gonderim.basarili === 'number' && typeof gonderim.hatali === 'number');
kontrol('abone sayısı raporlanıyor', gonderim.abone >= 1, String(gonderim.abone));
kontrol('hatalı abonelik detayda', gonderim.detay.some(x => x.durum === 'hata'));

kontrol('abonelik silindi', pushAbonelikSil(testEndpoint) === true);
kontrol('silinen abonelik listede yok', !pushAbonelikler().some(a => a.endpoint === testEndpoint));

/* ---------------------------------------------------------------- */
bolum('2) Service Worker ve ön yüz sözleşmesi');
const sw = oku('public/sw.js');
const app = oku('public/app.js');
const html = oku('public/index.html');
const alarms = oku('src/alarms.js');
const server = oku('server.js');

kontrol('sw: push olayı', /addEventListener\('push'/.test(sw));
kontrol('sw: notificationclick olayı', /addEventListener\('notificationclick'/.test(sw));
kontrol('sw: bildirim tıklaması data.url kullanıyor', /notification\?\.data\?\.url/.test(sw));
kontrol('sw: yalnızca kendi origin', /hedefUrl\.origin !== self\.location\.origin/.test(sw));
kontrol('sw: açık sekme varsa odaklan', /clients\.matchAll/.test(sw) && /istemci\.focus\(\)/.test(sw));
kontrol('sw: pushsubscriptionchange', /pushsubscriptionchange/.test(sw));
kontrol('sw sürümü v5', /const SURUM = 'eun-v5'/.test(sw));

kontrol('HTML: push düğmesi', /id="pushBtn"[^>]*>🔔 Bu Cihaza Bildirim Gönder</.test(html));
kontrol('HTML: takip alanı kimliği', /id="takipAlani"/.test(html));
kontrol('app: izin isteği', /Notification\.requestPermission\(\)/.test(app));
kontrol('app: VAPID anahtarı alınıyor', /api\/push\/vapid-key/.test(app));
kontrol('app: pushManager.subscribe', /pushManager\.subscribe\(/.test(app));
kontrol('app: abonelik sunucuya kaydediliyor', /api\/push\/subscribe/.test(app));
kontrol('app: base64url dönüşümü', /base64UrlToUint8Array/.test(app));
kontrol('app: test bildirimi', /api\/push\/test/.test(app));
kontrol('app: desteklenmeyen tarayıcı dürüst uyarı',
  /web bildirimlerini desteklemiyor/.test(app));

kontrol('alarm: push başlığı "Fiyat Düştü"', /🏷️ Fiyat Düştü:/.test(alarms));
kontrol('alarm: eski ➔ yeni fiyat gövdesi', /➔ \$\{formatTL\(dogrulanmis\.toplam\)\}/.test(alarms));
kontrol('alarm: site adı gövdede', /\(\$\{hedefAsan\.siteName\}\)/.test(alarms));
kontrol('alarm: push kanalı bildirimleriGonder içinde', /kanal: 'push'/.test(alarms));
kontrol('alarm: pushGonder import', /from '\.\/push\.js'/.test(alarms));

kontrol('sunucu: vapid-key ucu', /app\.get\('\/api\/push\/vapid-key'/.test(server));
kontrol('sunucu: subscribe ucu', /app\.post\('\/api\/push\/subscribe'/.test(server));
kontrol('sunucu: unsubscribe ucu', /app\.post\('\/api\/push\/unsubscribe'/.test(server));
kontrol('sunucu: push test ucu', /app\.post\('\/api\/push\/test'/.test(server));

/* ---------------------------------------------------------------- */
bolum('3) Sepet paylaşımı — depo');
const ornekSepet = {
  enIyiAnahtar: 'akilliBolunmus',
  enIyiToplam: 1250.75,
  kazanc: 120.5,
  tekMagazaToplam: 1371.25,
  senaryolar: {
    akilliBolunmus: {
      etiket: 'Akıllı bölünmüş',
      toplam: 1250.75,
      gruplar: [
        { site: 'trendyol', siteName: 'Trendyol', toplam: 800.25, araToplam: 800.25, kargo: 0, urunler: [{ ad: 'Ürün A', fiyat: 400.1, url: 'https://www.trendyol.com/a-p-1' }] },
        { site: 'hepsiburada', siteName: 'Hepsiburada', toplam: 450.5, araToplam: 450.5, kargo: 0, urunler: [{ ad: 'Ürün B', fiyat: 450.5, url: 'https://www.hepsiburada.com/b-p-2' }] },
      ],
    },
  },
};
const id = sepetPaylasKaydet(ornekSepet);
kontrol('sepet kaydedildi', typeof id === 'string' && id.length >= 6, String(id));
const okunan = sepetPaylasAl(id);
kontrol('sepet geri okunuyor', !!okunan);
kontrol('toplam korunuyor', okunan?.sepet?.enIyiToplam === 1250.75, String(okunan?.sepet?.enIyiToplam));
kontrol('gruplar korunuyor', okunan?.sepet?.senaryolar?.akilliBolunmus?.gruplar?.length === 2);
kontrol('oluşturma zamanı var', Number.isFinite(okunan?.created_at));
kontrol('geçersiz kimlik null', sepetPaylasAl('kisa') === null);
kontrol('yol geçersizliği reddedilir', sepetPaylasAl('../../etc/passwd') === null);
kontrol('süre temizliği çalışıyor (0 gün → siler)', sepetPaylasTemizle(0) >= 1);
kontrol('temizlik sonrası kayıt yok', sepetPaylasAl(id) === null);

/* ---------------------------------------------------------------- */
bolum('4) Sepet paylaşımı — sunucu ve arayüz');
const paylasHtml = oku('public/sepet-paylas.html');
kontrol('sunucu: paylaş ucu', /app\.post\('\/api\/sepet\/paylas'/.test(server));
kontrol('sunucu: herkese açık okuma ucu', /app\.get\('\/api\/sepet\/paylas\/:id'/.test(server));
kontrol('sunucu: paylaşım sayfası rotası', /app\.get\('\/sepet\/paylas\/:id'/.test(server));
kontrol('sunucu: erişim anahtarı muafiyeti (yalnız GET)',
  /req\.method === 'GET' && \/\^\\\/api\\\/sepet\\\/paylas/.test(server));
kontrol('sunucu: 200 KB boyut sınırı', /200_000/.test(server));
kontrol('sunucu: bulunamayan sepet 404', /Paylaşılan sepet bulunamadı/.test(server));

kontrol('HTML: paylaş butonu', /id="sepetWhatsappBtn"[^>]*>💬 WhatsApp ile Paylaş</.test(html));
kontrol('HTML: link butonu', /id="sepetLinkBtn"/.test(html));
kontrol('HTML: kopyala butonu', /id="sepetKopyaBtn"/.test(html));
kontrol('app: WhatsApp metni başlığı', /En Ucuz Nerede\? — Sepet Özeti/.test(app));
kontrol('app: toplam + tasarruf satırı', /📦 Toplam Tutar:/.test(app) && /Tasarruf!/.test(app));
kontrol('app: mağaza satırı biçimi', /• \$\{g\.siteName\}: \$\{adlar\} \(\$\{tl\(g\.toplam\)\}\)/.test(app));
kontrol('app: paylaşım linki satırı', /🔗 Listeyi İncele:/.test(app));
kontrol('app: wa.me linki', /wa\.me\/\?text=/.test(app));
kontrol('app: paylaşım sıfırlama', /function sepetPaylasSifirla/.test(app));

kontrol('paylaşım sayfası: salt okunur', /salt okunur/.test(paylasHtml));
kontrol('paylaşım sayfası: API çağrısı', /\/api\/sepet\/paylas\//.test(paylasHtml));
kontrol('paylaşım sayfası: toplam kartı', /paylas-toplam-kart/.test(paylasHtml));
kontrol('paylaşım sayfası: ürün linkleri', /rel="noopener sponsored"/.test(paylasHtml));
kontrol('paylaşım sayfası: XSS kaçışı', /const esc =/.test(paylasHtml));
kontrol('paylaşım sayfası: fiyat biçimi tr-TR', /toLocaleString\('tr-TR'/.test(paylasHtml));

const css = oku('public/style.css');
kontrol('CSS: push düğmesi', /\.push-btn\s*\{/.test(css));
kontrol('CSS: paylaş kartı', /\.sepet-paylas-kart\s*\{/.test(css));
kontrol('CSS: WhatsApp düğmesi', /\.paylas-btn\.wa\s*\{/.test(css));

/* ---------------------------------------------------------------- */
bolum('5) Canlı uçlar (opsiyonel)');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const h = { 'Content-Type': 'application/json' };
  if (config.erisimAnahtari) h['x-erisim-anahtari'] = config.erisimAnahtari;
  try {
    const v = await (await fetch(taban + '/api/push/vapid-key', { headers: h })).json();
    kontrol('canlı: VAPID anahtarı', typeof v.publicKey === 'string' && v.publicKey.length > 80, String(v.publicKey?.length));

    const p = await (await fetch(taban + '/api/sepet/paylas', {
      method: 'POST', headers: h, body: JSON.stringify({ sepet: ornekSepet }),
    })).json();
    kontrol('canlı: paylaşım oluşturuldu', typeof p.id === 'string' && /\/sepet\/paylas\//.test(p.path || ''), JSON.stringify(p));

    // Herkese açık okuma: erişim anahtarı GÖNDERİLMEDEN
    const pub = await fetch(taban + '/api/sepet/paylas/' + p.id);
    const pd = await pub.json();
    kontrol('canlı: anahtarsız okuma 200', pub.status === 200, String(pub.status));
    kontrol('canlı: sepet verisi doğru', pd?.sepet?.enIyiToplam === 1250.75, String(pd?.sepet?.enIyiToplam));

    const sayfa = await fetch(taban + '/sepet/paylas/' + p.id);
    const sayfaMetni = await sayfa.text();
    kontrol('canlı: paylaşım sayfası 200', sayfa.status === 200, String(sayfa.status));
    kontrol('canlı: sayfa HTML', /<html/i.test(sayfaMetni) && /paylas-sayfa/.test(sayfaMetni), sayfaMetni.slice(0, 60));

    const yok = await fetch(taban + '/sepet/paylas/gecersizkimlik');
    kontrol('canlı: geçersiz sepet 404', yok.status === 404, String(yok.status));

    // Temizlik: test kaydını sil
    sepetPaylasTemizle(0);
  } catch (e) {
    kontrol('canlı uçlara erişilebildi', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı test için: --canli');
}

closeDatabase();
console.log(`\nPUSH-PAYLAS ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
