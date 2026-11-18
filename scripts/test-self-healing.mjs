/**
 * 🛡️ Self-Healing & Akıllı Engel Kurtarma Testi (2026-11-13)
 *
 * Kapsam
 *   1)  Akıllı fiyat kaskadı — 5 kademenin her biri ayrı ayrı
 *   2)  Kademe önceliği (JSON-LD > Meta > DOM > Adaptör > Heuristic)
 *   3)  Sanity check (0/negatif/aşırı/uydurma değer reddi)
 *   4)  Gürültü filtresi (taksit/kargo/indirim "fiyat" sayılmaz)
 *   5)  Başlık / görsel / marka kaskadı
 *   6)  Adaptörlerin kaskada bağlanmış olması (kaynak sözleşmesi)
 *   7)  sleepWithJitter — kademeli + jitter'lı bekleme
 *   8)  Dinamik circuit breaker — 30/90/240 sn + anında auto-healing
 *   9)  Sağlayıcı eskalasyonu (403/429 → bekle → tekrar dene → stealth)
 *
 *   node scripts/test-self-healing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  extractSelfHealingPrice, extractSelfHealingTitle,
  extractSelfHealingImage, extractSelfHealingBrand,
  fiyatGecerliMi, kademeDagilimi, KADEMELER,
  FIYAT_MIN_TL, FIYAT_MAX_TL,
} from '../src/selfHealingParser.js';
import { DomainCircuitBreaker, circuitBreaker } from '../src/circuitBreaker.js';
import { sleepWithJitter } from '../src/scraper.js';

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

const S = { sessiz: true };

/* ================================================================== */
bolum('1) 🧬 5 kademeli fiyat kaskadı — her kademe tek tek');

const jsonldHtml = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Porima PETG Siyah 1kg","brand":{"@type":"Brand","name":"Porima"},"image":"https://cdn.test/petg.jpg","offers":{"@type":"Offer","price":"550.00","priceCurrency":"TRY","availability":"https://schema.org/InStock"}}</script>
</head><body>...</body></html>`;
const k1 = extractSelfHealingPrice(jsonldHtml, null, 'Test', S);
kontrol('Kademe-1 JSON-LD fiyatı okur', k1.fiyat === 550, String(k1.fiyat));
kontrol('Kademe-1 adı', k1.kademeAdi === 'JSON-LD Schema.org', String(k1.kademeAdi));
kontrol('Kademe-1 kurtarıldı işareti', k1.kurtarildi === true);

// JSON-LD offers dizisi + priceSpecification
const jsonldDizi = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":[{"@type":"Offer","price":725.9}]}</script>`;
kontrol('Kademe-1 offers dizisi',
  extractSelfHealingPrice(jsonldDizi, null, 'T', S).fiyat === 725.9,
  String(extractSelfHealingPrice(jsonldDizi, null, 'T', S).fiyat));
const jsonldSpec = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"priceSpecification":{"price":"1.299,00"}}}</script>`;
kontrol('Kademe-1 priceSpecification',
  extractSelfHealingPrice(jsonldSpec, null, 'T', S).fiyat === 1299,
  String(extractSelfHealingPrice(jsonldSpec, null, 'T', S).fiyat));
const jsonldGraph = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product","name":"G","offers":{"price":449}}]}</script>`;
kontrol('Kademe-1 @graph içinde Product',
  extractSelfHealingPrice(jsonldGraph, null, 'T', S).fiyat === 449,
  String(extractSelfHealingPrice(jsonldGraph, null, 'T', S).fiyat));

// Kademe 2 — meta
const metaProduct = '<html><head><meta property="product:price:amount" content="625,50"></head></html>';
const k2 = extractSelfHealingPrice(metaProduct, null, 'Test', S);
kontrol('Kademe-2 product:price:amount', k2.fiyat === 625.5, String(k2.fiyat));
kontrol('Kademe-2 adı', k2.kademeAdi === 'Meta Tags', k2.kademeAdi);
kontrol('Kademe-2 og:price:amount',
  extractSelfHealingPrice('<meta property="og:price:amount" content="899.90">', null, 'T', S).fiyat === 899.9);
kontrol('Kademe-2 itemprop=price',
  extractSelfHealingPrice('<meta itemprop="price" content="1.249,00">', null, 'T', S).fiyat === 1249);
kontrol('Kademe-2 twitter:data1',
  extractSelfHealingPrice('<meta name="twitter:data1" content="749.00 TL">', null, 'T', S).fiyat === 749);
kontrol('Kademe-2 content önce gelse de okur',
  extractSelfHealingPrice('<meta content="312,40" property="product:price:amount">', null, 'T', S).fiyat === 312.4);

// Kademe 3 — DOM sınıfları
const domHtml = '<html><div class="product-price"><span>1.234,56</span> TL</div></html>';
const k3 = extractSelfHealingPrice(domHtml, null, 'Test', S);
kontrol('Kademe-3 product-price', k3.fiyat === 1234.56, String(k3.fiyat));
kontrol('Kademe-3 adı', k3.kademeAdi === 'Standart DOM Seçici', k3.kademeAdi);
kontrol('Kademe-3 current-price',
  extractSelfHealingPrice('<span class="current-price">459,90 TL</span>', null, 'T', S).fiyat === 459.9);
kontrol('Kademe-3 sale-price',
  extractSelfHealingPrice('<div class="sale-price">1.099,00</div>', null, 'T', S).fiyat === 1099);
kontrol('Kademe-3 fiyat-alani',
  extractSelfHealingPrice('<div class="fiyat-alani">288,00 TL</div>', null, 'T', S).fiyat === 288);
kontrol('Kademe-3 data-price',
  extractSelfHealingPrice('<div data-price="1750.50"></div>', null, 'T', S).fiyat === 1750.5);

// Kademe 4 — adaptör regex
const ozelHtml = '<html><div class="ozel-fiyatim">399,90</div></html>';
const k4 = extractSelfHealingPrice(ozelHtml, [/class="ozel-fiyatim">([\d.,]+)/], 'Test', S);
kontrol('Kademe-4 adaptör regex', k4.fiyat === 399.9, String(k4.fiyat));
kontrol('Kademe-4 adı', k4.kademeAdi === 'Adaptör Regex', k4.kademeAdi);
kontrol('Kademe-4 kurtarıldı=false (beklenen yol)', k4.kurtarildi === false);
kontrol('Kademe-4 regex dizisi desteklenir',
  extractSelfHealingPrice(ozelHtml, [/yok-bu-desen/, /ozel-fiyatim">([\d.,]+)/], 'T', S).fiyat === 399.9);

// Kademe 5 — heuristic
const heurHtml = '<html><body><p>Ürün detayları</p><div>1.899,00 TL</div></body></html>';
const k5 = extractSelfHealingPrice(heurHtml, null, 'Test', S);
kontrol('Kademe-5 heuristic TL', k5.fiyat === 1899, String(k5.fiyat));
kontrol('Kademe-5 adı', k5.kademeAdi === 'Heuristic Metin', k5.kademeAdi);
kontrol('Kademe-5 ₺ işareti',
  extractSelfHealingPrice('<div>₺2.450,00</div>', null, 'T', S).fiyat === 2450,
  String(extractSelfHealingPrice('<div>₺2.450,00</div>', null, 'T', S).fiyat));
kontrol('Kademe-5 "2450 ₺" biçimi',
  extractSelfHealingPrice('<div>2.450,00 ₺</div>', null, 'T', S).fiyat === 2450);

/* ================================================================== */
bolum('2) 🎯 Kademe önceliği ve geri düşme');

// Tüm kademeler mevcut → Kademe 1 kazanır
const hepsi = `<html><head>
<meta property="product:price:amount" content="999">
<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":550}}</script>
</head><body><div class="product-price">777 TL</div><div>1.111,00 TL</div></body></html>`;
const oncelik = extractSelfHealingPrice(hepsi, [/777/], 'T', S);
kontrol('öncelik: JSON-LD meta/DOM/heuristic\'i yener', oncelik.kademe === 1 && oncelik.fiyat === 550,
  `kademe=${oncelik.kademe} fiyat=${oncelik.fiyat}`);

// JSON-LD bozuk → Kademe 2
const bozukLd = `<html><head><meta property="product:price:amount" content="640">
<script type="application/ld+json">{bozuk json</script></head></html>`;
kontrol('JSON-LD bozuksa Meta\'ya düşer',
  extractSelfHealingPrice(bozukLd, null, 'T', S).kademe === 2);

// Meta yok → DOM
const metaYok = '<html><body><div class="product-price">845,00 TL</div></body></html>';
kontrol('Meta yoksa DOM\'a düşer', extractSelfHealingPrice(metaYok, null, 'T', S).kademe === 3);

// Tema değişti (adaptör regex tutmuyor) → heuristic
const temaDegisti = '<html><body><div class="yeni-tema-fiyat">1.275,00 TL</div></body></html>';
const td = extractSelfHealingPrice(temaDegisti, [/class="eski-tema">([\d.,]+)/], 'Test', S);
kontrol('tema değişti → heuristic kurtarır', td.kademe === 5 && td.fiyat === 1275,
  `kademe=${td.kademe} fiyat=${td.fiyat}`);

// Hiçbiri yok → null
const bos = extractSelfHealingPrice('<html><body>Fiyat yok</body></html>', null, 'T', S);
kontrol('hiçbir kademe tutmazsa fiyat null', bos.fiyat === null);
kontrol('null sonuçta kademe null', bos.kademe === null);
kontrol('boş html güvenli', extractSelfHealingPrice('', null, 'T', S).fiyat === null);
kontrol('null html güvenli', extractSelfHealingPrice(null, null, 'T', S).fiyat === null);

/* ================================================================== */
bolum('3) 🔒 Sanity check — uydurma/geçersiz fiyat reddi');

kontrol('fiyat 0 reddedilir', fiyatGecerliMi(0) === null);
kontrol('negatif fiyat reddedilir', fiyatGecerliMi(-50) === null);
kontrol('NaN reddedilir', fiyatGecerliMi(NaN) === null);
kontrol('Infinity reddedilir', fiyatGecerliMi(Infinity) === null);
kontrol('null reddedilir', fiyatGecerliMi(null) === null);
kontrol(`min altı (${FIYAT_MIN_TL - 1}) reddedilir`, fiyatGecerliMi(FIYAT_MIN_TL - 1) === null);
kontrol(`max üstü (${FIYAT_MAX_TL + 1}) reddedilir`, fiyatGecerliMi(FIYAT_MAX_TL + 1) === null);
kontrol('geçerli fiyat kuruşa yuvarlanır', fiyatGecerliMi(550.456) === 550.46,
  String(fiyatGecerliMi(550.456)));
kontrol('sınır değeri kabul edilir', fiyatGecerliMi(FIYAT_MIN_TL) === FIYAT_MIN_TL);

// JSON-LD'de 0/uydurma fiyat → alt kademeye düşer, 0 DÖNMEZ
const sifirLd = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":0}}</script>
<div>1.100,00 TL</div>`;
const sifirSonuc = extractSelfHealingPrice(sifirLd, null, 'T', S);
kontrol('JSON-LD price:0 → heuristic\'e düşer', sifirSonuc.fiyat === 1100 && sifirSonuc.kademe === 5,
  `kademe=${sifirSonuc.kademe} fiyat=${sifirSonuc.fiyat}`);

// Aşırı fiyat (500.000+) heuristic'te reddedilir
kontrol('aşırı fiyat heuristic\'te reddedilir',
  extractSelfHealingPrice('<div>9.999.999,00 TL</div>', null, 'T', S).fiyat === null,
  String(extractSelfHealingPrice('<div>9.999.999,00 TL</div>', null, 'T', S).fiyat));

/* ================================================================== */
bolum('4) 🔇 Gürültü filtresi — taksit/kargo/indirim fiyat sayılmaz');

kontrol('taksit tutarı fiyat sayılmaz',
  extractSelfHealingPrice('<div>12 ay taksit 1.899,00 TL</div>', null, 'T', S).fiyat === null);
kontrol('kargo ücreti fiyat sayılmaz',
  extractSelfHealingPrice('<div>Kargo 45,00 TL</div>', null, 'T', S).fiyat === null);
kontrol('indirim tutarı fiyat sayılmaz',
  extractSelfHealingPrice('<div>İndirim 200,00 TL</div>', null, 'T', S).fiyat === null);
kontrol('kupon/puan fiyat sayılmaz',
  extractSelfHealingPrice('<div>Kuponla 50,00 TL kazan</div>', null, 'T', S).fiyat === null);
kontrol('gürültüden SONRAKİ gerçek fiyat bulunur',
  extractSelfHealingPrice('<div>Kargo 45,00 TL</div><div>1.450,00 TL</div>', null, 'T', S).fiyat === 1450);
kontrol('<script> içindeki sayılar yok sayılır',
  extractSelfHealingPrice('<script>var x = "1.234,00 TL";</script>', null, 'T', S).fiyat === null);

/* ================================================================== */
bolum('5) 🏷️ Başlık / görsel / marka kaskadı');

kontrol('başlık: JSON-LD name öncelikli',
  extractSelfHealingTitle(jsonldHtml) === 'Porima PETG Siyah 1kg',
  String(extractSelfHealingTitle(jsonldHtml)));
kontrol('başlık: JSON-LD yoksa og:title',
  extractSelfHealingTitle('<meta property="og:title" content="OG Başlık">') === 'OG Başlık');
kontrol('başlık: og yoksa adaptör regex',
  extractSelfHealingTitle('<div class="ad">Regex Başlık</div>', [/class="ad">([^<]+)/]) === 'Regex Başlık');
kontrol('başlık: h1 yedeği',
  extractSelfHealingTitle('<h1 class="x">H1 Başlığı</h1>') === 'H1 Başlığı');
kontrol('başlık: <title> son yedek',
  extractSelfHealingTitle('<title>Sayfa Başlığı</title>') === 'Sayfa Başlığı');
kontrol('başlık: hiçbiri yoksa null', extractSelfHealingTitle('<div>x</div>') === null);
kontrol('başlık: HTML etiketleri temizlenir',
  extractSelfHealingTitle('<h1><span>İç</span> Başlık</h1>') === 'İç Başlık',
  String(extractSelfHealingTitle('<h1><span>İç</span> Başlık</h1>')));

kontrol('görsel: JSON-LD image', extractSelfHealingImage(jsonldHtml) === 'https://cdn.test/petg.jpg',
  String(extractSelfHealingImage(jsonldHtml)));
kontrol('görsel: og:image yedeği',
  extractSelfHealingImage('<meta property="og:image" content="https://cdn.test/og.jpg">') === 'https://cdn.test/og.jpg');
kontrol('görsel: twitter:image yedeği',
  extractSelfHealingImage('<meta name="twitter:image" content="https://cdn.test/tw.jpg">') === 'https://cdn.test/tw.jpg');
kontrol('görsel: yoksa null', extractSelfHealingImage('<div>x</div>') === null);

kontrol('marka: JSON-LD brand.name', extractSelfHealingBrand(jsonldHtml) === 'Porima',
  String(extractSelfHealingBrand(jsonldHtml)));
kontrol('marka: itemprop=brand yedeği',
  extractSelfHealingBrand('<span itemprop="brand">eSun</span>') === 'eSun');
kontrol('marka: adaptör regex yedeği',
  extractSelfHealingBrand('<div class="marka">Creality</div>', [/class="marka">([^<]+)/]) === 'Creality');
kontrol('marka: yoksa null', extractSelfHealingBrand('<div>x</div>') === null);

/* ================================================================== */
bolum('6) 🔌 Adaptörler kaskada bağlı (kaynak sözleşmesi)');

const adaptorler = ['plt-genel.js', 'plt-ideasoft.js', 'plt-ticimax.js', 'plt-tsoft.js'];
for (const dosya of adaptorler) {
  const src = oku(`src/sites/${dosya}`);
  kontrol(`${dosya}: selfHealingParser import edilir`, /from '\.\.\/selfHealingParser\.js'/.test(src));
  kontrol(`${dosya}: extractSelfHealingPrice kullanılır`, /extractSelfHealingPrice\(/.test(src));
}
const genelSrc = oku('src/sites/plt-genel.js');
kontrol('plt-genel: başlık kaskadı', /extractSelfHealingTitle\(/.test(genelSrc));
kontrol('plt-genel: görsel kaskadı', /extractSelfHealingImage\(/.test(genelSrc));
kontrol('plt-genel: marka kaskadı', /extractSelfHealingBrand\(/.test(genelSrc));
kontrol('plt-ideasoft: başlık kaskadı', /extractSelfHealingTitle\(/.test(oku('src/sites/plt-ideasoft.js')));
kontrol('plt-ideasoft: JSON-LD yoksa katı hata kaldırıldı',
  !/if \(!p\?\.name\) throw new Error\('IdeaSoft/.test(oku('src/sites/plt-ideasoft.js')));

const hepsiSrc = adaptorler.map(f => oku(`src/sites/${f}`)).join('\n');
kontrol('kaskad: FIYAT_MIN/MAX sabitleri', /FIYAT_MIN_TL/.test(oku('src/selfHealingParser.js')));
kontrol('kaskad: kurtarma logu', /\[self-healing\]/.test(oku('src/selfHealingParser.js')));
kontrol('kaskad: kademe adları tanımlı', KADEMELER[1] && KADEMELER[5], JSON.stringify(KADEMELER));
kontrol('kaskad: kademeDagilimi raporu',
  kademeDagilimi([{ kademe: 1 }, { kademe: 1 }, { kademe: 5 }])[1] === 2);
kontrol('kaskad: adaptörlerde hard-throw yerine kaskad',
  !/const regexFiyat = fiyatHam != null \? parseNum\(fiyatHam\) : null;/.test(genelSrc));

/* ================================================================== */
bolum('7) ⏱️ sleepWithJitter — kademeli + jitter');

// Jitter aralıkları (gerçek varsayılanlar çok uzun; testte çakışmayan tabanlar)
const tb = [[10, 20], [100, 130], [300, 340]];
const j1 = await sleepWithJitter(1, { tabanlar: tb, sessiz: true });
const j2 = await sleepWithJitter(2, { tabanlar: tb, sessiz: true });
const j3 = await sleepWithJitter(3, { tabanlar: tb, sessiz: true });
kontrol('jitter: 1. bekleme taban aralığında', j1 >= 10 && j1 <= 20, String(j1));
kontrol('jitter: 2. bekleme taban aralığında', j2 >= 100 && j2 <= 130, String(j2));
kontrol('jitter: 3. bekleme taban aralığında', j3 >= 300 && j3 <= 340, String(j3));
kontrol('jitter: kademeler artan', j1 < j2 && j2 < j3, `${j1} < ${j2} < ${j3}`);

// Rastgelelik: aynı kademe iki kez farklı süre üretebilmeli
const j1b = await sleepWithJitter(1, { tabanlar: [[1, 60]], sessiz: true });
kontrol('jitter: süre rastgele (jitter uygulanıyor)', j1b >= 1 && j1b <= 60, String(j1b));

// attempt sınırları: 0/negatif → 1. kademe, çok büyük → son kademe
const j0 = await sleepWithJitter(0, { tabanlar: [[5, 6]], sessiz: true });
kontrol('jitter: attempt 0 → 1. kademe', j0 >= 5 && j0 <= 6, String(j0));
const jBuyuk = await sleepWithJitter(99, { tabanlar: [[1, 2], [3, 4], [5, 6]], sessiz: true });
kontrol('jitter: büyük attempt → son kademe', jBuyuk >= 5 && jBuyuk <= 6, String(jBuyuk));

// Gerçek varsayılan tablolar (kaynak sözleşmesi)
const scraperSrc = oku('src/scraper.js');
kontrol('jitter: varsayılan tablo 800-1200 / 2000-2800 / 4500-5500',
  /\[\[800, 1200\], \[2000, 2800\], \[4500, 5500\]\]/.test(scraperSrc));
kontrol('jitter: export edilir', /export async function sleepWithJitter/.test(scraperSrc));

/* ================================================================== */
bolum('8) 🛡️ Dinamik circuit breaker — 30/90/240 sn');

const cb = new DomainCircuitBreaker({ threshold: 3 });
const DOM = 'healing.example.com';
const ucKez = (domain = DOM) => {
  cb.recordFailure(domain); cb.recordFailure(domain); return cb.recordFailure(domain);
};

kontrol('başlangıçta devre kapalı', cb.isOpen(DOM) === false);
cb.recordFailure(DOM);
kontrol('1 hata → devre kapalı', cb.isOpen(DOM) === false);
cb.recordFailure(DOM);
kontrol('2 hata → devre kapalı', cb.isOpen(DOM) === false);
cb.recordFailure(DOM);
kontrol('3. hata → devre açılır', cb.isOpen(DOM) === true);

const kalan1 = cb.remainingCooldownMs(DOM);
kontrol('1. açılış cooldown ≈ 30 sn', kalan1 > 28000 && kalan1 <= 30000, String(kalan1));

// Cooldown bitir → half-open
cb.states.get(DOM).openedAt = Date.now() - 31_000;
kontrol('cooldown bitince half-open (kapalı görünür)', cb.isOpen(DOM) === false);

/* --- KADEMELİ AÇILIŞ (başarı YOK): 2. ve 3. açılış uzar ---
 * NOT: `recordSuccess` sayaçları sıfırlar (auto-healing tasarımı), bu yüzden
 * yükseltme senaryosu ayrı bir domain'de ve başarı çağrısı OLMADAN sınanır. */
const ESC = 'escalation.example.com';
ucKez(ESC);
kontrol('ESC 1. açılış ≈ 30 sn', cb.remainingCooldownMs(ESC) > 28000, String(cb.remainingCooldownMs(ESC)));
cb.states.get(ESC).openedAt = Date.now() - 31_000;
cb.isOpen(ESC);          // half-open
ucKez(ESC);              // yine engellendi → 2. açılış
const kalan2 = cb.remainingCooldownMs(ESC);
kontrol('2. açılış cooldown ≈ 90 sn', kalan2 > 88000 && kalan2 <= 90000, String(kalan2));

cb.states.get(ESC).openedAt = Date.now() - 91_000;
cb.isOpen(ESC);
ucKez(ESC);              // 3. açılış
const kalan3 = cb.remainingCooldownMs(ESC);
kontrol('3. açılış cooldown ≈ 240 sn', kalan3 > 238000 && kalan3 <= 240000, String(kalan3));

// 4. açılış da 240 sn'de kalır (tavan)
cb.states.get(ESC).openedAt = Date.now() - 241_000;
cb.isOpen(ESC);
ucKez(ESC);
kontrol('4. açılış tavan 240 sn', cb.remainingCooldownMs(ESC) > 238000,
  String(cb.remainingCooldownMs(ESC)));

/* --- Half-open'da BAŞARI → DERHAL sağlıklı (auto-healing) --- */
cb.recordSuccess(DOM);
kontrol('başarı → failures 0', cb.states.get(DOM).failures === 0);
kontrol('başarı → openedAt null', cb.states.get(DOM).openedAt === null);
kontrol('başarı → açılış sayacı sıfır', cb.states.get(DOM).acilisSayisi === 0);
kontrol('başarı sonrası devre kapalı', cb.isOpen(DOM) === false);

// Snapshot kademe bilgisini taşır
const snap = cb.snapshot()[DOM];
kontrol('snapshot: acilisSayisi raporlanır', typeof snap?.acilisSayisi === 'number', JSON.stringify(snap));

// Sabit mod (geriye dönük uyumluluk — testler bunu kullanıyor)
const sabit = new DomainCircuitBreaker({ threshold: 2, cooldownMs: 5000 });
sabit.recordFailure('sabit.test');
sabit.recordFailure('sabit.test');
kontrol('sabit mod: cooldownMs korunur', sabit.cooldownMs === 5000, String(sabit.cooldownMs));
kontrol('sabit mod: kalan ≈ 5000', sabit.remainingCooldownMs('sabit.test') > 4800,
  String(sabit.remainingCooldownMs('sabit.test')));

// Varsayılan instance kademeleri
kontrol('varsayılan instance: 30/90/240 sn',
  JSON.stringify(circuitBreaker.cooldownKademeleri) === JSON.stringify([30000, 90000, 240000]),
  JSON.stringify(circuitBreaker.cooldownKademeleri));

// Domain normalizasyonu
const nrm = new DomainCircuitBreaker({ threshold: 1 });
nrm.recordFailure('https://www.ornek.com/urun/1');
kontrol('domain: URL → host normalize', nrm.isOpen('ornek.com') === true);

/* ================================================================== */
bolum('9) 🔁 Sağlayıcı eskalasyonu (403/429 → bekle → tekrar dene → stealth)');

kontrol('scraper: geciciEngelMi fonksiyonu', /function geciciEngelMi\(r\)/.test(scraperSrc));
kontrol('scraper: 403 engel sayılır', /r\.status === 403 \|\| r\.status === 429/.test(scraperSrc));
kontrol('scraper: bot challenge engel sayılır', /BOT_CHALLENGE_RE\.test\(String\(r\.body\)/.test(scraperSrc));
kontrol('scraper: engelde sleepWithJitter çağrılır',
  /geciciEngelMi\(directResult\)\)\s*\{\s*\n\s*await sleepWithJitter\(1\)/.test(scraperSrc));
kontrol('scraper: bekleme sonrası tekrar denenir',
  /await sleepWithJitter\(1\);[\s\S]{0,200}const tekrar = await rawFetchDirect/.test(scraperSrc));
kontrol('scraper: stealth tarayıcı yedeği korunur',
  /tarayiciIleCek\(targetUrl, \{ timeoutMs: 15000 \}\)/.test(scraperSrc));
kontrol('scraper: ScraperAPI eskalasyonu korunur', /rawFetchScraperApi\(targetUrl, opts\)/.test(scraperSrc));
kontrol('scraper: 404/410 kesin cevap ayrımı korunur',
  /directResult\.status === 404 \|\| directResult\.status === 410/.test(scraperSrc));

// Adaptörlerin tamamı yüklenebiliyor mu? (kırık import = 61 mağaza düşer)
const { adapters } = await import('../src/sites/index.js');
kontrol('tüm adaptörler import edilir (kırık yok)', Array.isArray(adapters) && adapters.length >= 60,
  String(adapters?.length));
kontrol('her adaptörde getProduct var', adapters.every(a => typeof a.getProduct === 'function'));
kontrol('her adaptörde searchProducts var', adapters.every(a => typeof a.searchProducts === 'function'));

/* ================================================================== */
console.log('\n' + '─'.repeat(52));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
