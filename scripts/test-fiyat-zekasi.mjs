/**
 * FİYAT ZEKASI + SWR regresyon testi (2026-10-30)
 *
 * Kapsam:
 *   1) getFiyatAnalizi — 90 gün min/max, 30 gün AĞIRLIKLI ortalama, gözlem sayısı
 *   2) fiyatDegerlendir — dip fiyat, sahte indirim, al/piyasa/bekle tavsiyeleri
 *   3) Dürüstlük — geçmiş yoksa/azsa uydurma tavsiye YOK
 *   4) Pipeline/API sözleşmesi — ozet.fiyatZekasi + kart bazlı şişirilmiş etiket
 *   5) SWR — önbellekten anında yanıt (stale:true), arka planda tazeleme
 *   6) Arayüz sözleşmesi — karar paneli, parlama, "güncel ve doğrulandı" metni
 *
 * Kullanım:
 *   node scripts/test-fiyat-zekasi.mjs            (ağa çıkmaz; DB'ye geçici kayıt yazar)
 *   node scripts/test-fiyat-zekasi.mjs --canli    (+ gerçek /api/compare SWR turu)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getFiyatAnalizi, addPricePoint, deletePricePoints, closeDatabase,
} from '../src/store.js';
import { fiyatDegerlendir, enUcuzFiyatDegerlendir } from '../src/pricing.js';
import { anahtarCikar, SNAPSHOT_SURUMU, anlikYaz, snapshotSil } from '../src/anlikOnbellek.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANLI = process.argv.includes('--canli');
const TABAN = process.env.TABAN || 'http://localhost:3000';
const ANAHTAR = process.env.ERISIM_ANAHTARI || '';

let gecen = 0, kalan = 0;
const hatalar = [];
function kontrol(ad, kosul, detay = '') {
  if (kosul) { gecen++; console.log(`  ✓ ${ad}`); }
  else { kalan++; hatalar.push(ad + (detay ? ` → ${detay}` : '')); console.log(`  ✗ ${ad}${detay ? ' → ' + detay : ''}`); }
}
function bolum(ad) { console.log(`\n${ad}`); }

import fs from 'node:fs';
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

/* Test kimliği: gerçek ürünlerle çakışmayan sabit bir anahtar. */
const PID = 'TEST-ZEKASI-' + Date.now().toString(36).toUpperCase();
const GUN = 24 * 60 * 60 * 1000;
const gunOnce = (n) => new Date(Date.now() - n * GUN).toISOString();

/* ============ 1) getFiyatAnalizi ============ */
bolum('1) Fiyat geçmişi istatistikleri (getFiyatAnalizi)');

// Geçmiş YOK senaryosu
const bos = getFiyatAnalizi('YOK-' + PID, null, null);
kontrol('geçmiş yoksa bulundu=false', bos.bulundu === false);
kontrol('geçmiş yoksa min/ort/max null', bos.minFiyat === null && bos.ortFiyat === null && bos.maxFiyat === null);
kontrol('geçmiş yoksa dürüst gerekçe var', typeof bos.neden === 'string' && bos.neden.length > 10);
kontrol('geçmiş yoksa veriNoktasi=0', bos.veriNoktasi === 0);

// Gerçekçi geçmiş: 90 gün içinde 3 farklı fiyat bandı
//  - 60 gün önce: 1200 (yüksek)
//  - 20 gün önce: 1000
//  - 10 gün önce: 800
//  - 2 gün önce : 700  → 90 gün min = 700, max = 1200
const noktalar = [
  { gun: 60, fiyat: 1200, site: 'a' },
  { gun: 45, fiyat: 1100, site: 'a' },
  { gun: 20, fiyat: 1000, site: 'b' },
  { gun: 15, fiyat: 900, site: 'b' },
  { gun: 10, fiyat: 800, site: 'a' },
  { gun: 2, fiyat: 700, site: 'a' },
];
for (const n of noktalar) {
  addPricePoint({ productId: PID, site: n.site, price: n.fiyat, netPrice: n.fiyat, ts: gunOnce(n.gun) });
}
// 100 gün önceki kayıt (pencere dışı) — min/max'a ETKİ ETMEMELİ
addPricePoint({ productId: PID, site: 'a', price: 5000, netPrice: 5000, ts: gunOnce(100) });

const analiz = getFiyatAnalizi(PID, null, null);
kontrol('geçmiş bulundu', analiz.bulundu === true);
kontrol('veriNoktasi = 6 (90 gün içi; 100 günlük kayıt hariç)', analiz.veriNoktasi === 6, String(analiz.veriNoktasi));
kontrol('minFiyat = 700 (90 gün)', analiz.minFiyat === 700, String(analiz.minFiyat));
kontrol('maxFiyat = 1200 (90 gün)', analiz.maxFiyat === 1200, String(analiz.maxFiyat));
kontrol('100 günlük 5000 kaydı hesaba KATILMADI', analiz.minFiyat > 700 || analiz.maxFiyat < 5000);
// 30 günlük penceredeki günler: 20→1000, 15→900, 10→800, 2→700 → ortalama 850
kontrol('ortFiyat = 850 (son 30 gün, gün ağırlıklı)', analiz.ortFiyat === 850, String(analiz.ortFiyat));
kontrol('gunSayisi = 6', analiz.gunSayisi === 6, String(analiz.gunSayisi));
kontrol('yeterliVeri = true (≥3 gün)', analiz.yeterliVeri === true);
kontrol('enSonFiyat = 700', analiz.enSonFiyat === 700, String(analiz.enSonFiyat));
kontrol('kimlikKaynagi = modelKodu', analiz.kimlikKaynagi === 'modelKodu', String(analiz.kimlikKaynagi));

// Aynı gün içinde çok sayıda gözlem ortalamayı SAPTIRMAMALI (gün ağırlıklı)
const PID2 = PID + '-W';
addPricePoint({ productId: PID2, site: 'a', price: 1000, netPrice: 1000, ts: gunOnce(5) });
for (let i = 0; i < 20; i++) {
  addPricePoint({ productId: PID2, site: 'a', price: 100, netPrice: 100, ts: gunOnce(4) });
}
addPricePoint({ productId: PID2, site: 'a', price: 900, netPrice: 900, ts: gunOnce(3) });
const agirlikli = getFiyatAnalizi(PID2, null, null);
// Gün ortalamaları: 1000, 100, 900 → 666.7 (ham 22 gözlem ortalaması 181 olurdu)
kontrol('gün ağırlıklı ortalama çok gözleme yenik düşmedi',
  agirlikli.ortFiyat > 600 && agirlikli.ortFiyat < 700, String(agirlikli.ortFiyat));

// Barkod ile bulma — temizlik güvenliği için barkod değeri TEST önekli
// (gerçek bir EAN ile çakışıp gerçek geçmişi silme riski olmasın).
const TEST_BARKOD = 'TESTBARKOD-' + PID;
addPricePoint({ productId: TEST_BARKOD, site: 'a', price: 250, netPrice: 250, ts: gunOnce(1) });
const barkodAnaliz = getFiyatAnalizi(null, TEST_BARKOD, null);
kontrol('barkod ile geçmiş bulundu', barkodAnaliz.bulundu === true && barkodAnaliz.kimlikKaynagi === 'barkod');

/* ============ 2) Karar algoritması ============ */
bolum('2) Sahte indirim & dip fiyat kararı (fiyatDegerlendir)');

const A = { bulundu: true, minFiyat: 700, maxFiyat: 1200, ortFiyat: 850, veriNoktasi: 40, gunSayisi: 25, yeterliVeri: true, ortPencereGun: 30 };

// 2.1 DİP FİYAT: güncel = min (700)
const dip = fiyatDegerlendir({ guncelFiyat: 700, gosterilenEtiket: 1200, analiz: A });
kontrol('dip: durum = dip_fiyat', dip.durum === 'dip_fiyat', String(dip.durum));
kontrol('dip: mesaj "son 90 günün en dip fiyatında"', /90 günün en dip fiyatında/.test(dip.mesaj || ''), dip.mesaj);
kontrol('dip: tavsiye = simdi_al', dip.tavsiye === 'simdi_al', dip.tavsiye);

// 2.2 DİP FİYAT: min'in de altı (kampanya) — hâlâ dip
kontrol('dip: min altı da dip sayılır', fiyatDegerlendir({ guncelFiyat: 650, analiz: A }).durum === 'dip_fiyat');

// 2.3 SAHTE İNDİRİM: etiket ortalamanın %20 üzerinde
const sahte = fiyatDegerlendir({ guncelFiyat: 900, gosterilenEtiket: 1400, analiz: A });
kontrol('sahte: durum = sahte_indirim', sahte.durum === 'sahte_indirim', String(sahte.durum));
kontrol('sahte: etiket şişirilmiş işaretli', sahte.etiketSisirilmis === true);
kontrol('sahte: mesajda 30 gün ortalaması var', /son 30 günde ortalama/.test(sahte.mesaj || ''), sahte.mesaj);
kontrol('sahte: etiketOrani ≈ 1.647', Math.abs((sahte.etiketOrani ?? 0) - 1.647) < 0.01, String(sahte.etiketOrani));

// 2.4 SAHTE İNDİRİM (b): indirim iddiası var ama fiyat ortalamanın üstünde
const sahte2 = fiyatDegerlendir({ guncelFiyat: 950, gosterilenEtiket: 1100, analiz: A });
kontrol('sahte: indirim iddiası + ortalama üstü → sahte', sahte2.durum === 'sahte_indirim', String(sahte2.durum));

// 2.5 Etiket normal (ortalamanın altında) → sahte DEĞİL
const temiz = fiyatDegerlendir({ guncelFiyat: 800, gosterilenEtiket: 850, analiz: A });
kontrol('etiket normal ise sahte_indirim yok', temiz.durum !== 'sahte_indirim', String(temiz.durum));

// 2.6 TAVSİYE BANTLARI
const al = fiyatDegerlendir({ guncelFiyat: 750, analiz: A });   // %11.8 altında
kontrol('tavsiye: %10+ altında → simdi_al', al.tavsiye === 'simdi_al', al.tavsiye + ' / ' + al.ortalamaFarkYuzde);
const normal = fiyatDegerlendir({ guncelFiyat: 850, analiz: A });
kontrol('tavsiye: ortalama → piyasa', normal.tavsiye === 'piyasa', normal.tavsiye);
const normal2 = fiyatDegerlendir({ guncelFiyat: 880, analiz: A }); // %3.5 üstünde
kontrol('tavsiye: ±%5 içinde → piyasa', normal2.tavsiye === 'piyasa', normal2.tavsiye);
const bekle = fiyatDegerlendir({ guncelFiyat: 1000, analiz: A });
kontrol('tavsiye: %10+ üstünde → bekle', bekle.tavsiye === 'bekle', bekle.tavsiye);
kontrol('bekle: kırmızı etiket', /Bekle/.test(bekle.etiket || ''), bekle.etiket);

// 2.7 ortalamaFarkYuzde işareti (+ = daha ucuz)
kontrol('ortalamaFarkYuzde pozitif = daha ucuz', al.ortalamaFarkYuzde > 0 && bekle.ortalamaFarkYuzde < 0,
  `${al.ortalamaFarkYuzde} / ${bekle.ortalamaFarkYuzde}`);

/* ============ 3) Dürüstlük ============ */
bolum('3) Dürüstlük — uydurma tavsiye yok');

const yok = fiyatDegerlendir({ guncelFiyat: 800, analiz: null });
kontrol('geçmiş yoksa tavsiye = veri_yok', yok.tavsiye === 'veri_yok', yok.tavsiye);
kontrol('geçmiş yoksa mesaj yerine neden var', !!yok.neden && !yok.mesaj);
kontrol('geçmiş yoksa durum null', yok.durum === null);

const az = { bulundu: true, minFiyat: 700, maxFiyat: 700, ortFiyat: 700, veriNoktasi: 1, gunSayisi: 1, yeterliVeri: false, neden: 'Fiyat geçmişi 1 gün.' };
const azSonuc = fiyatDegerlendir({ guncelFiyat: 700, analiz: az });
kontrol('az veri: tavsiye = veri_yok (ortalama yorumu yapılmaz)', azSonuc.tavsiye === 'veri_yok', azSonuc.tavsiye);
kontrol('az veri: dip iddiası yalnız kayıtlı gözleme dayanır', azSonuc.durum === 'dip_fiyat');
kontrol('az veri: ortalama farkı iddia edilmiyor', azSonuc.ortalamaFarkYuzde === null);

const fiyatsiz = fiyatDegerlendir({ guncelFiyat: null, analiz: A });
kontrol('fiyat yoksa güvenli dönüş', fiyatsiz.tavsiye === 'veri_yok' && fiyatsiz.guncelFiyat === null);

/* ============ 4) enUcuzFiyatDegerlendir ============ */
bolum('4) Karşılaştırma sonucundan değerlendirme');

const sonuclar = [
  { status: 'found', renkAyni: true, product: { inStock: false, pricing: { toplam: 100 }, listPrice: 200 } }, // tükendi → sayılmaz
  { status: 'found', renkAyni: false, product: { inStock: true, pricing: { toplam: 120 }, listPrice: 300 } }, // farklı renk → sayılmaz
  { status: 'found', renkAyni: true, product: { inStock: true, pricing: { toplam: 800 }, listPrice: 1400 } },
  { status: 'found', renkAyni: true, product: { inStock: true, pricing: { toplam: 900 }, listPrice: 1000 } },
  { status: 'not_found', product: null },
];
const genel = enUcuzFiyatDegerlendir(sonuclar, A);
kontrol('en ucuz stokta+aynı renk seçildi (800)', genel.guncelFiyat === 800, String(genel.guncelFiyat));
kontrol('şişirilmiş etiket yakalandı (1400/850)', genel.etiketSisirilmis === true);

/* ============ 5) Pipeline + arayüz sözleşmesi ============ */
bolum('5) Pipeline ve arayüz sözleşmesi');
const pipe = oku('src/pipeline.js');
kontrol('pipeline getFiyatAnalizi çağırıyor', /getFiyatAnalizi\(/.test(pipe));
kontrol('pipeline enUcuzFiyatDegerlendir kullanıyor', /enUcuzFiyatDegerlendir\(/.test(pipe));
kontrol('ozet.fiyatZekasi üretiliyor', /fiyatZekasi:\s*fiyatZekasi/.test(pipe));
kontrol('sonuçlarda sisirilmisEtiket alanı var', /sisirilmisEtiket:\s*!!r\.sisirilmisEtiket/.test(pipe));
kontrol('pipeline import store.getFiyatAnalizi', /import\s*\{\s*getFiyatAnalizi\s*\}\s*from\s*'\.\/store\.js'/.test(pipe));

const app = oku('public/app.js');
const html = oku('public/index.html');
const css = oku('public/style.css');
kontrol('HTML: karar paneli alanı', /id="fiyatZekaAlani"/.test(html));
kontrol('HTML: tavsiye rozeti', /id="fiyatZekaRozet"/.test(html));
kontrol('HTML: fark özeti', /id="fiyatZekaFark"/.test(html));
kontrol('app.js: panel fonksiyonu tanımlı', /function fiyatZekasiPaneli\(sonuc\)/.test(app));
kontrol('app.js: panel sonuç çiziminde çağrılıyor', /fiyatZekasiPaneli\(sonuc\)/.test(app));
kontrol('app.js: "Şimdi Al" rozeti', /Şimdi Al/.test(app));
kontrol('app.js: "Fiyat Normal" rozeti', /Fiyat Normal/.test(app));
kontrol('app.js: "30G ortalamadan" fark metni', /30G ortalamadan/.test(app));
kontrol('app.js: şişirilmiş etiket rozeti', /sisirilmis-etiket/.test(app) && /Şişirilmiş Etiket/.test(app));
kontrol('CSS: .fiyat-zeka-kart', /\.fiyat-zeka-kart\s*\{/.test(css));
kontrol('CSS: .sisirilmis-etiket', /\.sisirilmis-etiket\s*\{/.test(css));
kontrol('CSS: kart parlaması animasyonu', /@keyframes kartParlama/.test(css) && /\.urun-karti\.fiyat-guncellendi/.test(css));

/* ============ 6) SWR ============ */
bolum('6) SWR hızlı yanıt sözleşmesi');
const server = oku('server.js');
const cfg = oku('src/config.js');
kontrol("yanıtta `onbellekSonuc` alanı", /onbellekSonuc:\s*anlik\.payload/.test(server));
kontrol('yanıtta `stale: true` alanı', /stale:\s*true/.test(server));
kontrol('geriye dönük uyumluluk: `sonuc` korunuyor', /sonuc:\s*anlik\.payload/.test(server));
kontrol('TTL varsayılanı 5 saat', /return 5 \* 60 \* 60 \* 1000/.test(cfg), 'config.js');
kontrol('snapshot şema sürümü 3', SNAPSHOT_SURUMU === 3, String(SNAPSHOT_SURUMU));
kontrol('app.js onbellekSonuc kabul ediyor', /data\.onbellekSonuc \|\| data\.sonuc/.test(app));
kontrol('app.js stale bayrağını kabul ediyor', /data\.anlik \|\| data\.stale/.test(app));
kontrol('app.js: "Tüm fiyatlar güncel ve doğrulandı"', /Tüm fiyatlar güncel ve doğrulandı/.test(app));
kontrol('app.js: değişen kartı parlatan fonksiyon', /function fiyatDegisenKartlariParlat\(/.test(app));
kontrol('app.js: kartta data-site var', /data-site="\$\{esc\(r\.site \|\| ''\)\}"/.test(app));
kontrol('anahtar normalize (www/utm farkı yok)',
  anahtarCikar('https://www.ornek.com/urun/?utm_source=x&b=2&a=1')
  === anahtarCikar('http://ornek.com/urun?a=1&b=2'), String(anahtarCikar('https://www.ornek.com/urun/?utm_source=x&b=2&a=1')));

/* ============ 7) Canlı SWR turu ============ */
if (CANLI) {
  bolum('7) Canlı SWR (gerçek sunucu)');
  const HDR = { 'x-erisim-anahtari': ANAHTAR, 'Content-Type': 'application/json' };
  const URL_CANLI = 'https://www.robo90.com/nanelab-hyper-pla-koyu-gri-filament-175mm-1kg';
  const govde = JSON.stringify({
    url: URL_CANLI,
    taze: true, siteler: ['robo90', 'filamentsan'], siteTimeoutMs: 20000,
  });

  // Alt küme taraması snapshot'a YAZILMAZ (dürüstlük) → önce gerçek bir tam
  // tarama yerine snapshot'ı doğrudan sınayalım: yanıt biçimi + süre.
  const t0 = Date.now();
  const ilk = await (await fetch(TABAN + '/api/compare', { method: 'POST', headers: HDR, body: govde })).json();
  const ilkMs = Date.now() - t0;
  kontrol('canlı: ilk istek iş kimliği döndü', !!ilk.isId, JSON.stringify(ilk).slice(0, 100));
  kontrol('canlı: alt küme taraması önbellek dönmüyor (stale yok)', !ilk.stale);

  // İşi bitir
  let son = null;
  const bitis = Date.now() + 180000;
  while (Date.now() < bitis) {
    son = await (await fetch(`${TABAN}/api/compare/${ilk.isId}`, { headers: HDR })).json();
    if (son.status !== 'running') break;
    await new Promise(r => setTimeout(r, 1000));
  }
  kontrol('canlı: tarama bitti', son?.status === 'done', son?.status);
  const sonuc = son?.result || {};
  kontrol('canlı: ozet.fiyatZekasi nesnesi var', !!sonuc.ozet?.fiyatZekasi, typeof sonuc.ozet?.fiyatZekasi);
  kontrol('canlı: fiyatZekasi dürüst alanlar içeriyor',
    ['tavsiye', 'yeterliVeri', 'gunSayisi', 'veriNoktasi'].every(k => k in (sonuc.ozet?.fiyatZekasi || {})),
    Object.keys(sonuc.ozet?.fiyatZekasi || {}).join(','));
  kontrol('canlı: fiyatAnalizi raporu var', !!sonuc.ozet?.fiyatAnalizi);

  // Aynı URL ikinci kez (alt küme olduğu için önbelleğe yazılmaz) → yine stale yok.
  const ikinci = await (await fetch(TABAN + '/api/compare', { method: 'POST', headers: HDR, body: govde })).json();
  kontrol('canlı: alt küme tekrar önbellekten DÖNMEDİ (dürüstlük)', !ikinci.stale);
  if (ikinci.isId) {
    await fetch(`${TABAN}/api/compare/${ikinci.isId}/iptal`, { method: 'POST', headers: HDR }).catch(() => {});
  }

  // ---- 7b) GERÇEK ÖNBELLEK YOLU (stale:true, ≈0,2 sn) ----
  // Alt küme taraması dürüstlük gereği önbelleğe yazılmaz. Bu yüzden önbellek
  // yolunu sınamak için az önceki GERÇEK tarama sonucunu geçici olarak tohumluyoruz;
  // ölçüm biter bitmez hem tohum hem arka plan işi SİLİNİR (iz bırakmaz).
  if (sonuc?.kaynak && Array.isArray(sonuc.sonuclar)) {
    const tohum = anlikYaz(URL_CANLI, sonuc);
    kontrol('canlı: tohum yazıldı', tohum === true);

    const t1 = Date.now();
    const ucuz = await (await fetch(TABAN + '/api/compare', {
      method: 'POST', headers: HDR, body: JSON.stringify({ url: URL_CANLI }),
    })).json();
    const gecenMs = Date.now() - t1;

    kontrol('SWR: yanıt stale:true', ucuz.stale === true, String(ucuz.stale));
    kontrol('SWR: onbellekSonuc döndü', !!ucuz.onbellekSonuc && Array.isArray(ucuz.onbellekSonuc.sonuclar));
    kontrol('SWR: geriye dönük `sonuc` da dolu', !!ucuz.sonuc);
    kontrol('SWR: anında yanıt (<1500 ms)', gecenMs < 1500, gecenMs + ' ms');
    kontrol('SWR: arka plan tazelemesi başladı', ucuz.anlik === true && ucuz.tazeleniyor === true);
    console.log(`     → önbellek yanıtı: ${gecenMs} ms`);

    if (ucuz.isId) {
      await fetch(`${TABAN}/api/compare/${ucuz.isId}/iptal`, { method: 'POST', headers: HDR }).catch(() => {});
    }
    const silindi = snapshotSil(URL_CANLI);
    kontrol('SWR: geçici tohum temizlendi', silindi === true);
  }
}

console.log(`\nFIYAT-ZEKASI ${gecen}/${gecen + kalan} ${kalan === 0 ? '✓' : '✗'}`);
if (kalan) { console.log('Başarısız:'); for (const h of hatalar) console.log('  - ' + h); }

// Test kendi ürettiği geçici fiyat geçmişini GERİ ALIR: gerçek ürünlerin
// istatistiklerine uydurma gözlem karışmasın (dürüstlük kuralı).
const temizlenen = deletePricePoints(PID) + deletePricePoints(PID + '-W') + deletePricePoints(TEST_BARKOD);
console.log(`Test verisi temizlendi: ${temizlenen} satır`);

// Windows'ta node:sqlite tutamacı açıkken zorla çıkış libuv assert'i üretiyor.
try { closeDatabase(); } catch { /* zaten kapalı */ }
process.exitCode = kalan === 0 ? 0 : 1;
