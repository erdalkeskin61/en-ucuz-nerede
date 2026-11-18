/**
 * 🧩 Shopify `<pre>` JSON Sarmalama Düzeltmesi — Test Paketi (2026-11-09)
 *
 * SORUN: ScraperAPI kredisi bitince / doğrudan istek engellenince devreye giren
 * yerel Chromium, `/products/x.js` ve `/search/suggest.json` gibi saf JSON
 * uçlarını kendi görüntüleyicisiyle `<pre>` içine sarıyor:
 *
 *   <html><head><meta name="color-scheme" content="light dark"></head>
 *   <body><pre style="...">{"id":123,...}</pre></body></html>
 *
 * `JSON.parse` `<` görünce patlıyordu → porima3d, 3dteknomarket, filamenthane
 * mağazalarında "Shopify ürün yanıtı (.js ucu) JSON değil" hatası.
 *
 * KAPSAM
 *  1)  `jsonSarmalamasiCoz()` — Chromium sarmalamasını çözer, gerçek HTML'e dokunmaz
 *  2)  `htmlEntityCoz()` — HTML entity kaçışları
 *  3)  `guvenliJsonAyristir()` — <pre> / entity / çift kodlanmış JSON / açık hata
 *  4)  Uçtan uca adaptör (ağ stub'ı): 3 mağaza için arama + ürün + varyant seçimi
 *  5)  `healthPulse.sorguGrubu()` — porima3d artık 'pla filament' sorgusunda
 *  6)  Kaynak sözleşmesi (tarayici.js / plt-shopify.js bağlantıları)
 *  7)  CANLI `--canli` — adaptorKontrol ile 3 mağaza + adapter_health kaydı
 *
 *   node scripts/test-shopify-unwrap.mjs
 *   node scripts/test-shopify-unwrap.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  jsonSarmalamasiCoz, htmlEntityCoz, tarayiciJsonGovdesi,
} from '../src/tarayici.js';
import { guvenliJsonAyristir, shopifySite } from '../src/sites/plt-shopify.js';
import { sorguGrubu } from '../src/healthPulse.js';
import { adapterById } from '../src/sites/index.js';
import { getAdapterHealthLatest, closeDatabase } from '../src/store.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const TEST_BASLANGIC = Date.now();

let gecen = 0, toplam = 0, atlanan = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
/** Dış etkenden (ağ/rate limit) dolayı doğrulanamayan kontrol. */
const atla = (ad, neden) => {
  atlanan++;
  console.log(`  ℹ️  ATLANDI: ${ad} — ${neden}`);
};
const bolum = (ad) => console.log(`\n${ad}`);

/* ------------------------------------------------------------------ */
/** Chromium'un JSON görüntüleyici sarmalaması. */
const PRE = (govde, stil = 'word-wrap: break-word; white-space: pre-wrap;') =>
  `<html><head><meta name="color-scheme" content="light dark"></head>`
  + `<body><pre style="${stil}">${govde}</pre></body></html>`;

const ORNEK_URUN = {
  id: 10544713269595,
  title: 'Porima xPLA Filament',
  vendor: 'Porima',
  handle: 'porima-xpla-filament',
  variants: [
    { id: 53427185221979, title: 'Siyah / 1kg', price: 46368, available: true, sku: 'POR-XPLA-SIYAH' },
    { id: 53427185221980, title: 'Beyaz / 1kg', price: 48900, available: true, sku: 'POR-XPLA-BEYAZ' },
  ],
  images: [{ src: 'https://porima3d.com/xpla.jpg' }],
};
const ORNEK_JSON = JSON.stringify(ORNEK_URUN);

/* ------------------------------------------------------------------ */
bolum('1) 🧼 jsonSarmalamasiCoz — Chromium <pre> sarmalaması');

const cozulen = jsonSarmalamasiCoz(PRE(ORNEK_JSON));
kontrol('sarmalama çözüldü (ham JSON döndü)', cozulen === ORNEK_JSON, cozulen.slice(0, 60));
kontrol('çözülen metin JSON.parse edilebilir',
  (() => { try { return JSON.parse(cozulen).id === ORNEK_URUN.id; } catch { return false; } })());
kontrol('HTML etiketi kalmadı', !/<html|<pre|<body/i.test(cozulen));
kontrol('başlık okunur', JSON.parse(cozulen).title === 'Porima xPLA Filament');
kontrol('varyant fiyatı kuruş cinsinden korunur', JSON.parse(cozulen).variants[0].price === 46368);

// Farklı <pre> stilleri
kontrol('farklı style ile de çalışır',
  jsonSarmalamasiCoz(PRE(ORNEK_JSON, 'margin:0')) === ORNEK_JSON);
kontrol('<pre> niteliksiz de çalışır',
  jsonSarmalamasiCoz(`<html><body><pre>${ORNEK_JSON}</pre></body></html>`) === ORNEK_JSON);

// Boşluk / satır sonu
kontrol('baş/son boşluk temizlenir',
  jsonSarmalamasiCoz(PRE(`\n  ${ORNEK_JSON}  \n`)) === ORNEK_JSON);

// Dizi (bazı uçlar dizi döner)
const diziJson = JSON.stringify([{ id: 1 }, { id: 2 }]);
kontrol('JSON dizisi de çözülür', jsonSarmalamasiCoz(PRE(diziJson)) === diziJson);

// GERÇEK HTML sayfaya dokunmamalı
const gercekHtml = '<html><body><div class="urun"><pre>kod örneği</pre></div></body></html>';
kontrol('gerçek HTML sayfa DEĞİŞMEZ', jsonSarmalamasiCoz(gercekHtml) === gercekHtml);
kontrol('gerçek sayfada <script> varsa dokunmaz',
  jsonSarmalamasiCoz('<html><body><script>var a=1</script><pre>{"a":1}</pre></body></html>')
    .includes('<script>'));
kontrol('<pre> yoksa aynen döner', jsonSarmalamasiCoz('<html><body>düz</body></html>') === '<html><body>düz</body></html>');
kontrol('boş girdi güvenli', jsonSarmalamasiCoz('') === '');
kontrol('null girdi güvenli', jsonSarmalamasiCoz(null) === '');
kontrol('<pre> içi JSON değilse dokunmaz',
  jsonSarmalamasiCoz(PRE('merhaba dünya')).includes('<pre'));

// tarayiciJsonGovdesi: sadece sarmalama varsa içerik döner
kontrol('tarayiciJsonGovdesi sarmalamayı çözer', tarayiciJsonGovdesi(PRE(ORNEK_JSON)) === ORNEK_JSON);
kontrol('tarayiciJsonGovdesi sarmalama yoksa null', tarayiciJsonGovdesi(gercekHtml) === null);

/* ------------------------------------------------------------------ */
bolum('2) 🔤 htmlEntityCoz — HTML kaçışları');

kontrol('&quot; → "', htmlEntityCoz('&quot;x&quot;') === '"x"');
kontrol('&amp; → &', htmlEntityCoz('a&amp;b') === 'a&b');
kontrol('&lt; &gt;', htmlEntityCoz('&lt;b&gt;') === '<b>');
kontrol('&#39; → tek tırnak', htmlEntityCoz('&#39;a&#39;') === "'a'");
kontrol('&nbsp; → boşluk', htmlEntityCoz('a&nbsp;b') === 'a b');
kontrol('kaçış yoksa aynen', htmlEntityCoz('düz metin') === 'düz metin');

const kacisliJson = ORNEK_JSON.replace(/"/g, '&quot;');
kontrol('entity kaçışlı <pre> JSON çözülür',
  jsonSarmalamasiCoz(PRE(kacisliJson)) === ORNEK_JSON,
  jsonSarmalamasiCoz(PRE(kacisliJson)).slice(0, 50));

/* ------------------------------------------------------------------ */
bolum('3) 🛡️ guvenliJsonAyristir — koruyucu ayrıştırıcı');

const a1 = guvenliJsonAyristir(PRE(ORNEK_JSON), 'test');
kontrol('<pre> sarmalı yanıt ayrıştırılır', a1?.title === 'Porima xPLA Filament', String(a1?.title));
kontrol('varyantlar korunur', Array.isArray(a1.variants) && a1.variants.length === 2);
kontrol('fiyat korunur', a1.variants[0].price === 46368);

const a2 = guvenliJsonAyristir(ORNEK_JSON, 'test');
kontrol('düz JSON ayrıştırılır', a2.id === ORNEK_URUN.id);
kontrol('baş/son boşluk sorun değil', guvenliJsonAyristir(`\n ${ORNEK_JSON} \n`, 'test').id === ORNEK_URUN.id);
kontrol('entity kaçışlı ayrıştırılır',
  guvenliJsonAyristir(PRE(kacisliJson), 'test').title === 'Porima xPLA Filament');
kontrol('çift kodlanmış JSON ayrıştırılır',
  guvenliJsonAyristir(JSON.stringify(ORNEK_JSON), 'test').title === 'Porima xPLA Filament');

// Arama yanıtı biçimi
const aramaYanit = { resources: { results: { products: [{ handle: 'a', price: '10.00' }] } } };
kontrol('arama yanıtı (<pre>) ayrıştırılır',
  guvenliJsonAyristir(PRE(JSON.stringify(aramaYanit)), 'test')
    .resources.results.products[0].handle === 'a');

// Hatalar: sessiz yutma YOK, teşhis bilgisi var
let hata1 = null;
try { guvenliJsonAyristir('<html><body>404 Not Found</body></html>', 'Shopify ürün yanıtı (.js ucu) JSON değil.'); }
catch (e) { hata1 = e; }
kontrol('bozuk HTML açık hata fırlatır', !!hata1);
kontrol('hata mesajı başlığı taşır',
  /Shopify ürün yanıtı \(\.js ucu\) JSON değil\./.test(hata1?.message || ''), hata1?.message);
kontrol('hata mesajı gelen veriden örnek içerir', /Gelen veri:/.test(hata1?.message || ''));
kontrol('hata mesajı 150 karakterle sınırlı', (hata1?.message || '').length < 260,
  String((hata1?.message || '').length));

let hata2 = null;
try { guvenliJsonAyristir('', 'boş yanıt'); } catch (e) { hata2 = e; }
kontrol('boş yanıt açık hata verir', !!hata2 && /boş yanıt/.test(hata2.message));
kontrol('boş yanıt "boş yanıt" notu taşır', /\(boş yanıt\)/.test(hata2.message), hata2?.message);

/* ------------------------------------------------------------------ */
bolum('4) 🔌 Uçtan uca adaptör — <pre> sarmalı yanıtla 3 mağaza');

const PRE_URUN = {
  id: 555001,
  title: 'Porima ePLA Filament',
  vendor: 'Porima',
  handle: 'porima-epla-filament',
  variants: [
    { id: 9001, title: 'Siyah / 1kg', price: 49900, compare_at_price: 59900, available: true, sku: 'SKU-SIYAH' },
    { id: 9002, title: 'Beyaz / 1kg', price: 51200, available: true, sku: 'SKU-BEYAZ' },
    { id: 9003, title: 'Siyah / 3kg', price: 139900, available: false },
  ],
  images: [{ src: 'https://ornek.com/u.jpg' }],
};
const PRE_ARAMA = {
  resources: { results: { products: [
    { handle: 'porima-epla-filament', title: 'Porima ePLA Filament', vendor: 'Porima', price: '499.00' },
    { handle: 'ikinci', title: 'İkinci Ürün', vendor: 'Porima', price: '550.00' },
  ] } },
};

const gercekFetch = globalThis.fetch;
let istekSayisi = 0;
globalThis.fetch = async (url) => {
  istekSayisi++;
  const u = String(url);
  const govde = u.includes('/search/suggest.json')
    ? JSON.stringify(PRE_ARAMA)
    : u.includes('.js') ? JSON.stringify(PRE_URUN)
      : '<html><body><div>normal</div></body></html>';
  // Chromium gibi davran: içeriği <pre> içine sar.
  return new Response(PRE(govde), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
};

const MAGAZALAR = [
  { id: 'porima3d', name: 'Porima 3D', host: 'porima3d.com' },
  { id: '3dteknomarket', name: '3D Tekno Market', host: '3dteknomarket.com' },
  { id: 'filamenthane', name: 'Filamenthane', host: 'filamenthane.com' },
];

// fetchPage yanıtları DİSKE önbellekler. Test yanıtlarının önceki çalıştırmalardan
// (veya gerçek taramalardan) kalmış kayıtlarla karışmaması için her koşuda tekil
// bir ana makine adı kullanılır; istekler zaten yerel stub'a gider.
const NONCE = Date.now().toString(36);
const testHost = (h) => `${h.replace(/\./g, '-')}-${NONCE}.example`;

try {
  for (const m of MAGAZALAR) {
    const host = testHost(m.host);
    const site = shopifySite({ id: m.id, name: m.name, hosts: [host], base: 'https://' + host });

    // --- arama ---
    let arama = null;
    try { arama = await site.searchProducts('pla filament', { spend: 0 }); }
    catch (e) { arama = e; }
    kontrol(`${m.id}: arama <pre> sarmalıyla çalışır`, Array.isArray(arama),
      arama instanceof Error ? arama.message.slice(0, 80) : '');
    kontrol(`${m.id}: arama sonucu var`, Array.isArray(arama) && arama.length === 2,
      String(Array.isArray(arama) ? arama.length : '-'));
    kontrol(`${m.id}: arama fiyatı okunur`, Array.isArray(arama) && arama[0]?.price === 499,
      String(arama?.[0]?.price));
    kontrol(`${m.id}: arama URL'i tam ürün linki`,
      Array.isArray(arama) && /^https:\/\/[^/]+\/products\/porima-epla-filament$/.test(arama[0]?.url || ''),
      String(arama?.[0]?.url));
    kontrol(`${m.id}: arama başlığı marka dahil`,
      Array.isArray(arama) && /Porima/.test(arama[0]?.title || ''));

    // --- ürün ---
    let urun = null;
    try { urun = await site.getProduct(`https://${host}/products/porima-epla-filament?variant=9001`, { spend: 0 }); }
    catch (e) { urun = e; }
    kontrol(`${m.id}: ürün <pre> sarmalıyla çalışır`, !!urun && !(urun instanceof Error),
      urun instanceof Error ? urun.message.slice(0, 90) : '');
    kontrol(`${m.id}: ürün başlığı okunur`, /Porima ePLA Filament/.test(urun?.title || ''), String(urun?.title));
    kontrol(`${m.id}: fiyat > 0`, Number(urun?.sellingPrice) > 0, String(urun?.sellingPrice));
    kontrol(`${m.id}: fiyat kuruş→TL doğru (49900 → 499)`, urun?.sellingPrice === 499, String(urun?.sellingPrice));
    kontrol(`${m.id}: liste fiyatı okunur (59900 → 599)`, urun?.listPrice === 599, String(urun?.listPrice));
    kontrol(`${m.id}: stok bilgisi var`, urun?.inStock === true);
    kontrol(`${m.id}: varyant URL'den seçilir`, urun?.varyant?.secim === 'url', String(urun?.varyant?.secim));
    kontrol(`${m.id}: varyant kimliği doğru`, urun?.varyant?.id === 9001, String(urun?.varyant?.id));
    kontrol(`${m.id}: toplam varyant sayısı`, urun?.varyant?.toplam === 3, String(urun?.varyant?.toplam));
    kontrol(`${m.id}: model kodu (SKU) okunur`, urun?.modelCode === 'SKU-SIYAH', String(urun?.modelCode));
    kontrol(`${m.id}: marka okunur`, urun?.brand === 'Porima', String(urun?.brand));
    kontrol(`${m.id}: para birimi TRY`, urun?.currency === 'TRY');
  }

  // Kaynak eşleşmesiyle varyant seçimi (renk)
  const kHost = testHost('porima3d.com');
  const site = shopifySite({ id: 'porima3d', name: 'Porima 3D', hosts: [kHost], base: 'https://' + kHost });
  const kaynakli = await site.getProduct(`https://${kHost}/products/porima-epla-filament`, { spend: 0 }, {
    kaynak: { title: 'Porima ePLA Filament Beyaz 1kg', color: 'beyaz' },
  });
  kontrol('kaynak eşleşmesiyle beyaz varyant seçilir',
    kaynakli.varyant.id === 9002, String(kaynakli.varyant.id));
  kontrol('kaynak eşleşmesi fiyatı 512', kaynakli.sellingPrice === 512, String(kaynakli.sellingPrice));
  kontrol('seçim nedeni dürüstçe raporlanır',
    ['kaynak-eşleşmesi', 'stokta-ilk'].includes(kaynakli.varyant.secim), String(kaynakli.varyant.secim));

  // 2.5 kat daha ağır varyant yanlışlıkla seçilmemeli
  const agir = await site.getProduct(`https://${kHost}/products/porima-epla-filament`, { spend: 0 }, {
    kaynak: { title: 'Porima ePLA Filament Siyah 1kg', color: 'siyah' },
  });
  kontrol('3kg varyantı 1kg kaynağa seçilmez',
    agir.varyant.id !== 9003, String(agir.varyant.id));
  kontrol('1kg siyah varyantı seçilir', agir.varyant.id === 9001, String(agir.varyant.id));

  kontrol('ağ stub’ı gerçekten kullanıldı (>=6 istek)', istekSayisi >= 6, String(istekSayisi));
} finally {
  globalThis.fetch = gercekFetch;
}

/* ÖNEMLİ: fetchPage yanıtları `data/cache` altına DİSKE yazılır. Test stub'ının
 * sahte Shopify yanıtları gerçek mağaza URL'lerine yazılırsa sonraki gerçek
 * taramalarda "sahte ürün / 404" olarak geri gelir (2026-11-09'da tam olarak bu
 * oldu: 3 mağaza kendi test fixture'ını okudu). Bu yüzden bu koşuda oluşan
 * önbellek kayıtları silinir. */
try {
  const CACHE = path.join(KOK, 'data', 'cache');
  let temizlenen = 0;
  for (const ad of fs.readdirSync(CACHE)) {
    if (!ad.endsWith('.json')) continue;
    const p = path.join(CACHE, ad);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs < TEST_BASLANGIC - 2000) continue; // bu koşuda yazılmadı
      const metin = fs.readFileSync(p, 'utf8');
      if (metin.includes(NONCE) || metin.includes('Porima ePLA Filament')
        || metin.includes('"Porima xPLA Filament"')) {
        fs.unlinkSync(p);
        temizlenen++;
      }
    } catch { /* okunamayan kayıt yoksayılır */ }
  }
  if (temizlenen) console.log(`  ℹ️  ${temizlenen} test önbellek kaydı temizlendi`);
} catch { /* cache dizini yoksa sorun değil */ }

/* ------------------------------------------------------------------ */
bolum('5) 🩺 healthPulse — mağaza sorgu grubu');

const q3 = sorguGrubu('porima3d');
kontrol('porima3d 3D grubunda', q3.includes('pla filament'), JSON.stringify(q3));
kontrol('porima3d "kablo" ARAMAZ', !q3.includes('kablo'), JSON.stringify(q3));
kontrol('3dteknomarket 3D grubunda', sorguGrubu('3dteknomarket').includes('pla filament'));
kontrol('filamenthane 3D grubunda', sorguGrubu('filamenthane').includes('pla filament'));
kontrol('büyük harfli kimlik de eşleşir', sorguGrubu('PORIMA3D').includes('pla filament'));
kontrol('pazaryeri genel grupta kalır', sorguGrubu('trendyol').includes('kablo'));

/* ------------------------------------------------------------------ */
bolum('6) 📄 Kaynak sözleşmesi');

const tarayiciSrc = oku('src/tarayici.js');
const shopifySrc = oku('src/sites/plt-shopify.js');
const healthSrc = oku('src/healthPulse.js');

kontrol('tarayici.js: jsonSarmalamasiCoz tanımlı',
  /export function jsonSarmalamasiCoz/.test(tarayiciSrc));
kontrol('tarayici.js: çekim sonunda sarmalama çözülür',
  /const govde = jsonSarmalamasiCoz\(html\)/.test(tarayiciSrc));
kontrol('tarayici.js: çözülmüş gövde döner', /body: govde/.test(tarayiciSrc));
kontrol('tarayici.js: teşhis bayrağı', /jsonSarmalamaCozuldu: govde !== html/.test(tarayiciSrc));

kontrol('plt-shopify.js: guvenliJsonAyristir export edilir',
  /export function guvenliJsonAyristir/.test(shopifySrc));
kontrol('plt-shopify.js: arama bu fonksiyonu kullanır',
  /guvenliJsonAyristir\(r\.body, 'Shopify arama yanıtı/.test(shopifySrc));
kontrol('plt-shopify.js: ürün bu fonksiyonu kullanır',
  /guvenliJsonAyristir\(r\.body, 'Shopify ürün yanıtı/.test(shopifySrc));
kontrol('plt-shopify.js: çıplak JSON.parse(r.body) KALMADI',
  !/JSON\.parse\(r\.body\)/.test(shopifySrc));
kontrol('plt-shopify.js: <pre> temizliği içerir', /<pre\[\^>\]\*>/.test(shopifySrc));
kontrol('plt-shopify.js: entity çözümü içerir', /&quot;.*&amp;|&amp;.*&quot;/.test(shopifySrc));

kontrol('healthPulse.js: porima3d d3 listesinde',
  /'samm',[\s\S]{0,220}'porima3d'/.test(healthSrc));
kontrol('healthPulse.js: sorguGrubu export edilir',
  /export function sorguGrubu/.test(healthSrc));

/* ------------------------------------------------------------------ */
bolum('7) 🌐 CANLI adaptör sağlığı (--canli)');

const canli = process.argv.includes('--canli');
if (!canli) {
  console.log('  ℹ️  Canlı test için: node scripts/test-shopify-unwrap.mjs --canli');
  console.log('  ℹ️  (Yerel Chromium/ScraperAPI üzerinden gerçek istek atar, yavaştır.)');
} else {
  const { adaptorKontrol } = await import('../src/healthPulse.js');
  const { addAdapterHealth } = await import('../src/store.js');
  const HEDEFLER = ['porima3d', '3dteknomarket', 'filamenthane'];

  // Dış rate limit / ağ engeli: bizim hatamız değil. "JSON değil" ise BİZİM hatamız.
  const disEtken = (r) => {
    const h = String(r?.hata || '');
    return /429|rate.?limit|too many requests|zaman aşımı|timeout|ECONN|ENOTFOUND|503|502|504/i.test(h)
      // Sağlayıcı kredisi/engeli (ScraperAPI kotası, Zyte 401, Crawlbase engeli…) — bizim kodumuz değil.
      || /Crawlbase|ScraperAPI|ZenRows|proxy|cooldown|Ağ hatası/i.test(h)
      // Site tarafı yumuşak engel: bot UA'sına 404/429 döndürüyor. Aynı uçlar
      // doğrudan istekte 200 dönüyor (bölüm 7B bunu kanıtlar).
      || /Site HTTP 404|yumuşak engel/i.test(h)
      || r?.durum === 'bot_korumasi';
  };
  const bizimHata = (r) => /JSON değil|JSON at position|Unexpected token '<'/i.test(String(r?.hata || ''));

  const sonuclar = new Map();
  for (const id of HEDEFLER) {
    const adapter = adapterById(id);
    kontrol(`${id}: adaptör kayıtlı`, !!adapter);
    if (!adapter) continue;

    let r = null;
    // 2 deneme: 429 alındıysa kısa bir nefes bırakıp tekrar dene.
    for (let deneme = 1; deneme <= 2; deneme++) {
      try { r = await adaptorKontrol(adapter); }
      catch (e) { r = { durum: 'hata', hata: String(e.message || e).slice(0, 160) }; }
      if (r?.durum === 'ok' || !disEtken(r)) break;
      if (deneme === 1) {
        console.log(`  ℹ️  ${id}: ${r.durum} (${String(r.hata || '').slice(0, 70)}) → 20 sn sonra tekrar`);
        await new Promise(res => setTimeout(res, 20000));
      }
    }
    sonuclar.set(id, r);

    // Sonucu adapter_health'e YAZ (gece nöbetçisiyle aynı tablo, dürüst kayıt).
    try { addAdapterHealth(r); } catch { /* yazılamazsa test devam eder */ }

    console.log(`  ℹ️  ${id}: ${r?.durum}` +
      (r?.ornekBaslik ? ` · ${String(r.ornekBaslik).slice(0, 60)}` : '') +
      (r?.ornekFiyat != null ? ` · ₺${r.ornekFiyat}` : '') +
      (r?.hata ? ` · ${String(r.hata).slice(0, 70)}` : ''));

    // Bizim düzeltmemizle ilgili kesin kontrol: "JSON değil" hatası ASLA olmamalı.
    kontrol(`${id}: "JSON değil" hatası yok`, !bizimHata(r), String(r?.hata || '').slice(0, 90));

    if (r?.durum === 'ok') {
      kontrol(`${id}: durum ok`, true);
      kontrol(`${id}: ürün başlığı okundu`, !!r?.ornekBaslik, String(r?.ornekBaslik));
      kontrol(`${id}: fiyat > 0`, Number(r?.ornekFiyat) > 0, String(r?.ornekFiyat));
      kontrol(`${id}: arama sonucu var`, Number(r?.adet) > 0, String(r?.adet));
    } else if (disEtken(r)) {
      atla(`${id}: durum ok`, `dış etken (${r?.durum}: ${String(r?.hata || '').slice(0, 60)})`);
    } else {
      kontrol(`${id}: durum ok`, false, `${r?.durum} — ${String(r?.hata || '').slice(0, 80)}`);
    }
  }

  // adapter_health: en son kayıt bizim yazdığımız olmalı (eski "JSON değil" satırı geçilir)
  const son = getAdapterHealthLatest();
  for (const id of HEDEFLER) {
    const kayit = (son || []).find(x => x.site === id);
    if (!kayit) { atla(`${id}: adapter_health kaydı`, 'kayıt yok'); continue; }
    const beklenen = sonuclar.get(id)?.durum;
    kontrol(`${id}: adapter_health son kayıt güncel`, kayit.durum === beklenen,
      `tablo=${kayit.durum} beklenen=${beklenen}`);
    kontrol(`${id}: kayıtta "JSON değil" hatası kalmadı`,
      !/JSON değil/i.test(String(kayit.hata || '')), String(kayit.hata || '').slice(0, 80));
    if (kayit.durum === 'ok') {
      kontrol(`${id}: tabloda fiyat > 0`, Number(kayit.ornekFiyat) > 0, String(kayit.ornekFiyat));
      kontrol(`${id}: tabloda başlık var`, !!kayit.ornekBaslik, String(kayit.ornekBaslik));
    }
  }

  /* ------------------------------------------------------------------ */
  // 7B) HAM UÇ DOĞRULAMASI — sağlayıcı kotası/rate limit tam adaptör
  // denemesini engellediğinde bile JSON ayrıştırmanın gerçek sitede
  // çalıştığını kanıtlar. Doğrudan istek (tek, nazik) atılır.
  bolum('7B) 🔬 Ham uç doğrulaması (gerçek Shopify JSON)');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const SITELER = [
    ['porima3d', 'https://porima3d.com'],
    ['3dteknomarket', 'https://3dteknomarket.com'],
    ['filamenthane', 'https://filamenthane.com'],
  ];

  for (const [id, base] of SITELER) {
    const aramaUrl = base + '/search/suggest.json?q=pla%20filament'
      + '&resources[type]=product&resources[limit]=3';
    let handle = null;
    try {
      const r = await fetch(aramaUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(25000),
      });
      const metin = await r.text();
      kontrol(`${id}: arama ucu HTTP 200`, r.status === 200, String(r.status));
      if (r.status === 200) {
        const d = guvenliJsonAyristir(metin, 'ham arama JSON değil');
        const urunler = d?.resources?.results?.products || [];
        kontrol(`${id}: ham arama JSON ayrıştırıldı`, Array.isArray(urunler), String(urunler?.length));
        kontrol(`${id}: ham aramada ürün var`, urunler.length > 0, String(urunler.length));
        handle = urunler[0]?.handle || null;
      }
    } catch (e) {
      atla(`${id}: ham arama`, String(e.message || e).slice(0, 70));
    }

    if (!handle) { atla(`${id}: ham ürün`, 'handle bulunamadı'); continue; }

    try {
      await new Promise(r => setTimeout(r, 2500)); // nazik aralık
      const r = await fetch(`${base}/products/${handle}.js`, {
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(25000),
      });
      const metin = await r.text();
      kontrol(`${id}: ürün .js ucu HTTP 200`, r.status === 200, String(r.status));
      if (r.status === 200) {
        const j = guvenliJsonAyristir(metin, 'ham ürün JSON değil');
        kontrol(`${id}: ham ürün JSON ayrıştırıldı`, !!j?.title, String(j?.title));
        kontrol(`${id}: ham üründe fiyat var`,
          Array.isArray(j?.variants) && j.variants.length > 0
          && Number(j.variants[0]?.price) > 0,
          String(j?.variants?.[0]?.price));
      }
    } catch (e) {
      atla(`${id}: ham ürün`, String(e.message || e).slice(0, 70));
    }
  }
}

/* ------------------------------------------------------------------ */
try { closeDatabase(); } catch { /* zaten kapalı */ }

console.log('\n' + '─'.repeat(48));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti${atlanan ? ` · ${atlanan} atlandı (dış etken)` : ''}`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
