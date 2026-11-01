/**
 * Anlık sonuç (stale-while-revalidate) testleri — 2026-10-29
 *
 * Kritik iddialar:
 *  1) Anahtar normalizasyonu: aynı ürünün farklı biçimleri AYNI kaydı bulmalı
 *     (izleme parametreleri/şema/www/sıra/fragment fark etmez).
 *  2) TTL: süresi geçmiş snapshot "anlık" sayılmaz (bayat veri güncel gibi sunulmaz).
 *  3) Yazılan snapshot geri okunabilir (SQLite).
 *  4) Fiyat farkı hesabı: değişen / yeni / kaybolan siteler doğru.
 *  5) `yasMetni` Türkçe ve doğru.
 *  6) Ön yüz: anlık sonuç hemen çiziliyor, tazeleme sırasında kartlar korunuyor,
 *     hata durumunda "güncellenemedi" deniyor (sessiz bayat veri yok).
 *
 * Test verisi geçici bir URL ile yazılır ve sonunda SİLİNİR.
 */
import { anahtarCikar, anlikAl, anlikYaz, fiyatFarki, yasMetni, anlikIstatistik, snapshotKapat } from '../src/anlikOnbellek.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

/* ---------- 1) Anahtar normalizasyonu ---------- */
const A = anahtarCikar('https://www.trendyol.com/logitech-g102-p-123');
const varyantlar = [
  'https://www.trendyol.com/logitech-g102-p-123/',
  'http://trendyol.com/logitech-g102-p-123',
  'https://trendyol.com/logitech-g102-p-123#yorumlar',
  'https://www.trendyol.com/logitech-g102-p-123?utm_source=x&utm_medium=y&utm_campaign=z',
  'https://www.trendyol.com/logitech-g102-p-123?gclid=abc&fbclid=def',
  '  https://WWW.Trendyol.com/logitech-g102-p-123  ',
];
for (const v of varyantlar) {
  kontrol(`aynı anahtar: ${v.slice(0, 52)}`, anahtarCikar(v) === A, anahtarCikar(v));
}

// Ürün kimliği taşıyan parametreler KORUNUR
const P1 = anahtarCikar('https://www.trendyol.com/x-p-1?boutiqueId=61&merchantId=1');
const P2 = anahtarCikar('https://www.trendyol.com/x-p-1?merchantId=1&boutiqueId=61');
kontrol('parametre sırası anahtarı değiştirmez', P1 === P2, `${P1} ≠ ${P2}`);
kontrol('parametre var/yok farklı üründür', anahtarCikar('https://www.trendyol.com/x-p-1') !== P1);
kontrol('geçersiz URL null', anahtarCikar('bu bir url değil') === null);
kontrol('boş URL null', anahtarCikar('') === null);

/* ---------- 2) yasMetni ---------- */
kontrol('az önce', yasMetni(0) === 'az önce');
kontrol('az önce (30 sn)', yasMetni(30000) === 'az önce');
kontrol('12 dk önce', yasMetni(12 * 60000) === '12 dk önce', yasMetni(12 * 60000));
kontrol('2 sa 5 dk önce', yasMetni(125 * 60000) === '2 sa 5 dk önce', yasMetni(125 * 60000));
kontrol('3 sa önce (tam)', yasMetni(180 * 60000) === '3 sa önce', yasMetni(180 * 60000));

/* ---------- 3) Yaz / oku ---------- */
const TEST_URL = 'https://ornek-test-snapshot.test/urun-' + Date.now();
const sahteSonuc = {
  kaynak: { site: 'ornek', urun: 'Test Ürün', modelKodu: 'T1' },
  sonuclar: [
    { site: 'a', siteName: 'A', status: 'found', enUcuz: true,
      product: { url: 'https://a/u', title: 'Test', sellingPrice: 1000, pricing: { toplam: 1000 } } },
    { site: 'b', siteName: 'B', status: 'found',
      product: { url: 'https://b/u', title: 'Test', sellingPrice: 1100, pricing: { toplam: 1100 } } },
  ],
  ozet: { enUcuzFiyat: 1000, enUcuzSite: 'A' },
};

kontrol('yazma başarılı', anlikYaz(TEST_URL, sahteSonuc) === true);
const okunan = anlikAl(TEST_URL);
kontrol('geri okunabilir', !!okunan);
kontrol('payload korunur', okunan.payload.sonuclar.length === 2);
kontrol('urun adı saklanır', okunan.urun === 'Test Ürün');
kontrol('en ucuz saklanır', okunan.enUcuz === 1000);
kontrol('yaş 0', okunan.yasMs < 5000, String(okunan.yasMs));

// Normalize edilmiş varyant aynı kaydı bulur
kontrol('varyant URL aynı snapshot\'ı bulur',
  !!anlikAl(TEST_URL + '?utm_source=test'), 'utm atılmalı');

/* ---------- 4) TTL ---------- */
// Yazma ile okuma aynı milisaniyeye denk gelebilir; en az birkaç ms beklenir
// (aksi hâlde yas=0 ≤ maxYas=1 olur ve test rastgele kırılır).
await new Promise((r) => setTimeout(r, 8));
kontrol('TTL dışı (maxYasMs=1) kayıt dönmez', anlikAl(TEST_URL, { maxYasMs: 1 }) === null);
kontrol('TTL=0 → özellik kapalı', anlikAl(TEST_URL, { maxYasMs: 0 }) === null);

// Yaşlandırılmış kayıt: 30 saat önce (varsayılan TTL 5 saat)
try {
  const db = new DatabaseSync(path.join(config.dataDir, 'en_ucuz_nerede.db'));
  db.prepare('UPDATE snapshot SET ts = ? WHERE anahtar = ?').run(Date.now() - 30 * 3600 * 1000, anahtarCikar(TEST_URL));
  db.close();
} catch { /* yok say */ }
kontrol('30 saatlik kayıt varsayılan TTL (5 sa) dışında', anlikAl(TEST_URL) === null);
kontrol('30 saatlik kayıt geniş TTL ile okunur', !!anlikAl(TEST_URL, { maxYasMs: 48 * 3600 * 1000 }));

// 2 saatlik kayıt TTL İÇİNDE olmalı (5 sa) — SWR penceresi
try {
  const db = new DatabaseSync(path.join(config.dataDir, 'en_ucuz_nerede.db'));
  db.prepare('UPDATE snapshot SET ts = ? WHERE anahtar = ?').run(Date.now() - 2 * 3600 * 1000, anahtarCikar(TEST_URL));
  db.close();
} catch { /* yok say */ }
kontrol('2 saatlik kayıt 5 sa TTL içinde (SWR penceresi)', !!anlikAl(TEST_URL));

// Temizle
try {
  const db = new DatabaseSync(path.join(config.dataDir, 'en_ucuz_nerede.db'));
  db.prepare('DELETE FROM snapshot WHERE anahtar = ?').run(anahtarCikar(TEST_URL));
  db.close();
} catch { /* yok say */ }

/* ---------- 5) fiyatFarki ---------- */
const eskiS = {
  sonuclar: [
    { site: 'a', siteName: 'A', status: 'found', product: { pricing: { toplam: 1000 } } },
    { site: 'b', siteName: 'B', status: 'found', product: { pricing: { toplam: 1100 } } },
    { site: 'c', siteName: 'C', status: 'found', product: { pricing: { toplam: 1200 } } },
  ],
};
const yeniS = {
  sonuclar: [
    { site: 'a', siteName: 'A', status: 'found', product: { pricing: { toplam: 900 } } },   // düştü
    { site: 'b', siteName: 'B', status: 'found', product: { pricing: { toplam: 1150 } } },  // arttı
    { site: 'd', siteName: 'D', status: 'found', product: { pricing: { toplam: 800 } } },   // yeni
    // 'c' kayboldu
  ],
};
const fark = fiyatFarki(eskiS, yeniS);
kontrol('2 site değişti', fark.degisen.length === 2, String(fark.degisen.length));
const aDeg = fark.degisen.find(x => x.site === 'a');
kontrol('A fiyatı 1000→900', aDeg?.eski === 1000 && aDeg?.yeni === 900);
kontrol('A farkı -100', aDeg?.fark === -100, String(aDeg?.fark));
kontrol('A yüzdesi -%10', aDeg?.yuzde === -10, String(aDeg?.yuzde));
kontrol('1 yeni mağaza', fark.yeni.length === 1 && fark.yeni[0].site === 'd');
kontrol('1 kaybolan mağaza', fark.kaybolan.length === 1 && fark.kaybolan[0].site === 'c');

// Fiyat değişmediyse boş
const ayni = fiyatFarki(eskiS, eskiS);
kontrol('değişiklik yoksa boş liste', ayni.degisen.length === 0 && ayni.yeni.length === 0 && ayni.kaybolan.length === 0);

/* ---------- 6) İstatistik ---------- */
const ist = anlikIstatistik();
kontrol('istatistik adet sayı', typeof ist.adet === 'number');
kontrol('istatistik TTL dakika (300)', ist.ttlDakika === 300, String(ist.ttlDakika));

/* ---------- 7) Sunucu entegrasyonu (kaynak düzeyi) ---------- */
const server = fs.readFileSync('server.js', 'utf8');
kontrol('POST /api/compare anlık yolu var', /anlikAl\(url\)/.test(server));
kontrol('anlık sonuç yanıtta dönüyor', /sonuc: anlik\.payload/.test(server));
kontrol('arka plan tazeleme başlatılıyor', /karsilastirmaCalistir\(url, job, formatSonuc\)\s*\n\s*\.then\(\(yeni\)/.test(server));
kontrol('tazeleme farkı hesaplanıyor', /fiyatFarki\(anlik\.payload, yeni\)/.test(server));
kontrol('tazeleme hatası ayrı raporlanıyor', /tazelemeHatasi/.test(server));
kontrol('snapshot tarama sonunda yazılıyor', /anlikYaz\(url, result\)/.test(server));
kontrol('tazeleme sürerken de iptal edilebilir', /job\.status !== 'running' && !job\.tazeleniyor/.test(server));
kontrol('tazelenen iş budanmıyor', /!j\.tazeleniyor/.test(server));
kontrol('poll yanıtı sürüm/tazeleme alanları içeriyor', /surum: job\.surum/.test(server) && /tazeleniyor: !!job\.tazeleniyor/.test(server));
kontrol('taze zorlama (taze:true) önbelleği atlar', /req\.body\?\.taze === true/.test(server));

/* ---------- 9) Dürüstlük: eksik/boş tarama önbelleğe YAZILMAZ ---------- */
kontrol('iptal edilen tarama snapshot olmaz', /!result\.ozet\?\.iptalEdildi/.test(server));
kontrol('taranmayan site varsa snapshot olmaz', /taranmayanSiteSayisi > 0/.test(server));
kontrol('hiç bulunamayan sonuç snapshot olmaz', /bulunanVar/.test(server) && /if \(tamTarama && bulunanVar\)/.test(server));

/* ---------- 8) Ön yüz davranışı ---------- */
const app = fs.readFileSync('public/app.js', 'utf8');
kontrol('anlık sonuç poll beklemeden çiziliyor',
  /\(data\.anlik \|\| data\.stale\) && onbellekSonuc/.test(app)
  && /data\.onbellekSonuc \|\| data\.sonuc/.test(app));
kontrol('canlı birleştirme fonksiyonu var', /function anlikBirlestir/.test(app));
kontrol('birleştirmede kart kaybolmuyor (eski korunur)', /eskiSonuc\.sonuclar\.map\(r => guncel\.get\(r\.site\) \|\| r\)/.test(app));
kontrol('en ucuz birleşik listede yeniden hesaplanıyor', /enUcuz = r;/.test(app));
kontrol('tazeleme sırasında oyumaya devam', /if \(job\.tazeleniyor\)/.test(app));
kontrol('hata durumunda dürüst mesaj', /Fiyatlar güncellenemedi/.test(app));
kontrol('yaş bilgisi gösteriliyor', /Hafızadan gösteriliyor/.test(app) && /canlı kontrol ediliyor/.test(app));
kontrol('canlı çizimde ağır paneller atlanıyor', /if \(!opts\.canli\)/.test(app));
kontrol('dönen gösterge stili var', fs.readFileSync('public/style.css', 'utf8').includes('eunDon'));
kontrol('hareket azaltma desteği var', /prefers-reduced-motion/.test(fs.readFileSync('public/style.css', 'utf8')));

snapshotKapat();
console.log(`ANLIK ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exitCode = gecen === toplam ? 0 : 1;
