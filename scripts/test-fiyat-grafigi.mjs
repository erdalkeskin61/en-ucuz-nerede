/**
 * 30 günlük fiyat grafiği testleri (2026-10-28).
 *
 * Kapsam:
 *  1) UYDURMA VERİ YOK: geçmiş boşsa timeline boş döner (eskiden 30 sahte nokta üretiliyordu)
 *  2) Timeline uzunluğu = gerçek gözlem günü sayısı (30 değil)
 *  3) yeterliVeri eşiği (>= 3 gün) ve dürüst "neden" metni
 *  4) Yorum metni gerçek pencereyi söyler ("Son N günün"), "30 günün" demez
 *  5) 30 günden eski kayıtlar pencereye girmez
 *  6) Ön yüz bağlantısı: sonucGoster → fiyatGrafiginiYukle çağrısı var
 *
 * Test verisi geçici bir productId ile yazılır ve sonunda SİLİNİR.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getPriceAnalytics, addPricePoint } from '../src/store.js';
import { config } from '../src/config.js';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

const PID = '__test_grafik_' + Date.now();
const dbYolu = path.join(config.dataDir, 'en_ucuz_nerede.db');

const gunOnce = (n) => new Date(Date.now() - n * 86400000).toISOString();
const temizle = () => {
  try {
    const db = new DatabaseSync(dbYolu);
    db.prepare('DELETE FROM price_history WHERE product_id = ?').run(PID);
    db.close();
  } catch { /* yok say */ }
};

try {
  /* ---- 1) Geçmiş yoksa UYDURMA YOK ---- */
  const bos = getPriceAnalytics(PID, { currentPrice: 500 });
  kontrol('geçmiş yoksa timeline BOŞ (sahte nokta yok)', Array.isArray(bos.timeline) && bos.timeline.length === 0,
    `uzunluk ${bos.timeline?.length}`);
  kontrol('geçmiş yoksa summary null', bos.summary === null);
  kontrol('geçmiş yoksa yeterliVeri false', bos.yeterliVeri === false);
  kontrol('geçmiş yoksa dürüst açıklama var', typeof bos.neden === 'string' && bos.neden.includes('henüz fiyat geçmişi yok'));
  kontrol('geçmiş yoksa gunSayisi 0', bos.gunSayisi === 0);

  /* ---- 2) Tek gün: 1 nokta, "30 gün" iddiası YOK ---- */
  addPricePoint({ productId: PID, site: 'robo90', price: 900, netPrice: 900, ts: gunOnce(0) });
  addPricePoint({ productId: PID, site: 'filamentsan', price: 950, netPrice: 950, ts: gunOnce(0) });
  const tek = getPriceAnalytics(PID, { currentPrice: 900 });
  kontrol('tek gün → tek nokta', tek.timeline.length === 1, `uzunluk ${tek.timeline.length}`);
  kontrol('tek gün → yeterliVeri false', tek.yeterliVeri === false);
  kontrol('tek gün → "30 günün" DEMEZ', !/30 günün/i.test(tek.summary.recommendationText), tek.summary.recommendationText);
  kontrol('tek gün → geçmiş kısa uyarısı var', /günlük fiyat geçmişi var/.test(tek.summary.recommendationText));

  /* ---- 3) Üç gün: yeterli veri, gerçek pencere ---- */
  // not: son gün zaten var; 1 ve 2 gün öncesini ekle
  addPricePoint({ productId: PID, site: 'robo90', price: 1000, netPrice: 1000, ts: gunOnce(1) });
  addPricePoint({ productId: PID, site: 'robo90', price: 1100, netPrice: 1100, ts: gunOnce(2) });
  const uc = getPriceAnalytics(PID, { currentPrice: 900 });
  kontrol('3 gün → 3 nokta', uc.timeline.length === 3, `uzunluk ${uc.timeline.length}`);
  kontrol('3 gün → yeterliVeri true', uc.yeterliVeri === true);
  kontrol('3 gün → gunSayisi 3', uc.gunSayisi === 3);
  kontrol('3 gün → "Son 3 günün" der', /Son 3 günün/.test(uc.summary.recommendationText), uc.summary.recommendationText);
  kontrol('en düşük gerçek veriden (900)', uc.summary.lowestPrice === 900, String(uc.summary.lowestPrice));
  kontrol('en yüksek gerçek veriden (1100)', uc.summary.highestPrice === 1100, String(uc.summary.highestPrice));
  // Günlük ortalamaların ortalaması: (925 + 1000 + 1100) / 3 = 1008
  // (gün 0'da iki mağaza var: 900 ve 950 → o günün ortalaması 925; her gün eşit ağırlık)
  kontrol('ortalama 3 günün günlük ortalaması (1008)', uc.summary.avgPrice === 1008, String(uc.summary.avgPrice));
  kontrol('timeline kronolojik', uc.timeline[0].date < uc.timeline[2].date);
  kontrol('hiçbir nokta uydurma dalga değil',
    uc.timeline.every(t => [900, 950, 1000, 1100].includes(t.lowest) || [900, 1000, 1100].includes(t.lowest)));

  /* ---- 4) 30 günden eski kayıt pencereye girmez ---- */
  addPricePoint({ productId: PID, site: 'robo90', price: 5000, netPrice: 5000, ts: gunOnce(45) });
  const eski = getPriceAnalytics(PID, { currentPrice: 900 });
  kontrol('45 gün önceki kayıt pencere dışı', eski.timeline.length === 3, `uzunluk ${eski.timeline.length}`);
  kontrol('eski kayıt en yüksek fiyatı bozmaz', eski.summary.highestPrice === 1100, String(eski.summary.highestPrice));

  /* ---- 5) Ön yüz: sonucGoster gerçekten çağırıyor mu ---- */
  const appJs = fs.readFileSync('public/app.js', 'utf8');
  const sonucBlok = appJs.slice(appJs.indexOf('function sonucGoster'), appJs.indexOf('function esc(s)'));
  kontrol('sonucGoster → fiyatGrafiginiYukle çağrısı var', /fiyatGrafiginiYukle\(sonuc\)/.test(sonucBlok));
  kontrol('çağrı hata yakalıyor (.catch)', /fiyatGrafiginiYukle\(sonuc\)\.catch/.test(sonucBlok));

  /* ---- 6) Ön yüz: uydurma grafik çizmiyor ---- */
  const fiyatBlok = appJs.slice(appJs.indexOf('async function fiyatGrafiginiYukle'), appJs.indexOf('function cizFiyatGrafigi'));
  kontrol('boş timeline → yetersizGoster', /timeline\.length === 0/.test(fiyatBlok));
  kontrol('tek nokta → yetersizGoster (trend değil)', /timeline\.length < 2/.test(fiyatBlok));
  kontrol('hardcoded "59 mağaza" metni kaldırıldı', !/59 mağaza/.test(appJs));
  kontrol('etiketler gerçek gün sayısını kullanır', /Son \$\{gun\} Günün/.test(fiyatBlok));

  /* ---- 7) HTML: not alanı ve dinamik etiketler ---- */
  const html = fs.readFileSync('public/index.html', 'utf8');
  kontrol('fiyatGecmisNotu alanı var', /id="fiyatGecmisNotu"/.test(html));
  kontrol('dinamik etiket kimlikleri var',
    /id="istatistikEtiketDusuk"/.test(html) && /id="istatistikEtiketOrtalama"/.test(html) && /id="istatistikEtiketYuksek"/.test(html));
  kontrol('CDN script kalmadı', !/cdn\.jsdelivr\.net/.test(html));
  kontrol('Chart.js yerel vendor', /\/vendor\/chart\.umd\.min\.js/.test(html));
  kontrol('Chart.js dosyası mevcut', fs.existsSync('public/vendor/chart.umd.min.js'));
} finally {
  temizle();
}

// Temizlik doğrulaması
const son = getPriceAnalytics(PID);
kontrol('test verisi silindi', son.toplamKayit === 0, String(son.toplamKayit));

console.log(`FIYAT-GRAFIGI ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exit(gecen === toplam ? 0 : 1);
