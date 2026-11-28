/**
 * 🧬 impit (Chrome TLS) + 🗂️ Katalog Senkronizasyonu Testi — 2026-11-17
 *
 * Kapsam
 *   1)  impit sarmalayıcısı — httpIste/impitDene/durum + güvenli fetch fallback
 *   2)  IMPIT_KAPALI=1 → katman devre dışı, yerleşik fetch kullanılır
 *   3)  scraper.anlamliIcerikMi — "tarayıcı gerekli mi?" ölçütü
 *   4)  src/tarayici.js — REMOTE_BROWSER_URL, channel stratejisi, BOS_KALMA_MS
 *   5)  katalogSync parser'ları — Shopify / Woo / sitemap / XML
 *   6)  SQLite — katalog_urunleri upsert + arama + TTL + site adayı
 *   7)  Entegrasyon — urunArama katalog katmanı, pipeline kısayolu, anlikOnbellek
 *   8)  server.js + admin panel uçları/arayüzü
 *   9)  (--canli) çalışan sunucuda admin uçları
 *
 *   node scripts/test-impit-katalog.mjs
 *   node scripts/test-impit-katalog.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const CANLI = process.argv.includes('--canli');

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
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

/* ================================================================== */
bolum('1) 🧬 impit sarmalayıcısı — yerel sunucu ile canlı test');

// Yerel test sunucusu: dış ağa çıkmadan gerçek HTTP davranışını ölçer.
const sunucu = http.createServer((req, res) => {
  if (req.url === '/json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, urun: 'test' }));
  } else if (req.url === '/yavas') {
    // Hiç yanıt vermez → zaman aşımı/abort testi
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body>' + 'x'.repeat(2000) + '</body></html>');
  }
});
await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
const PORT = sunucu.address().port;
const TABAN = `http://127.0.0.1:${PORT}`;

// Testte gerçek impit kullanılır (yerel sunucu, dış ağ yok).
delete process.env.IMPIT_KAPALI;

const { httpIste, impitDene, impitDurumu, guvenliFetch, impitSifirla } = await import('../src/impitIstemci.js');
impitSifirla();

const r1 = await httpIste(TABAN + '/json');
kontrol('httpIste Response döndürür', !!r1?.response && typeof r1.response.status === 'number');
kontrol('httpIste katman bildirir', r1.katman === 'impit' || r1.katman === 'fetch', r1.katman);
kontrol('httpIste yerel JSON yanıtını okur', (await r1.response.json())?.ok === true);

const r2 = await guvenliFetch(TABAN + '/html');
const html = await r2.text();
kontrol('guvenliFetch HTML gövdesi döndürür', r2.status === 200 && html.length > 1000);

const durum1 = impitDurumu();
kontrol('impitDurumu sayaçları içerir', durum1?.sayac && typeof durum1.sayac.impit === 'number');
kontrol('impitDurumu profil adı bildirir', typeof durum1.profil === 'string' && durum1.profil.length > 0);

const hataliDeneme = await impitDene('http://127.0.0.1:1/kesin-yok');
kontrol('impitDene hata durumunda fırlatmaz (null)', hataliDeneme === null);

/* ================================================================== */
bolum('2) 🛑 IMPIT_KAPALI=1 → yerleşik fetch fallback');

process.env.IMPIT_KAPALI = '1';
impitSifirla();
const r3 = await httpIste(TABAN + '/json');
kontrol('kapalıyken katman fetch', r3.katman === 'fetch', r3.katman);
kontrol('kapalıyken yanıt yine doğru', (await r3.response.json())?.ok === true);
kontrol('kapalıyken impitDurumu.kapali', impitDurumu().kapali === true);
delete process.env.IMPIT_KAPALI;
impitSifirla();

/* ================================================================== */
bolum('3) 🧠 scraper.anlamliIcerikMi — Chromium gerekli mi?');

const { anlamliIcerikMi } = await import('../src/scraper.js');
const urunHtml = '<html><body>' + ('Ürün fiyatı 899 TL sepete ekle stokta '.repeat(80)) + '</body></html>';
kontrol('dolu ürün sayfası → anlamlı (tarayıcı gerekmez)',
  anlamliIcerikMi({ status: 200, body: urunHtml }) === true);
kontrol('boş/SPA kabuğu → anlamsız (tarayıcı gerekir)',
  anlamliIcerikMi({ status: 200, body: '<html><body><div id="app"></div></body></html>' }) === false);
kontrol('Cloudflare challenge → anlamsız',
  anlamliIcerikMi({ status: 200, body: urunHtml.replace('Ürün fiyatı', 'Just a moment... verify') }) === false);
kontrol('HTTP 403 → anlamsız', anlamliIcerikMi({ status: 403, body: urunHtml }) === false);
kontrol('HTTP 200 ama 404 hata sayfası → anlamsız',
  anlamliIcerikMi({ status: 200, body: '<html><body>Aradığınız sayfa bulunamadı ' + 'x'.repeat(2000) + '</body></html>' }) === false);

const scraperSrc = oku('src/scraper.js');
kontrol('rawFetchDirect impit katmanını kullanıyor', /const \{ response: res, katman \} = await httpIste\(/.test(scraperSrc));
kontrol('sağlayıcı etiketi dogrudan+impit', /dogrudan\+impit/.test(scraperSrc));
kontrol('Chromium öncesi impit denemesi var', /impitHafifDene\(targetUrl, opts\)/.test(scraperSrc));
kontrol('WAF/403 sonrası da impit denemesi var', scraperSrc.indexOf('403 sonrası geçti') > 0);
kontrol('saglayiciDurumu impit raporu içerir', /impit: impitDurumu\(\)/.test(scraperSrc));

/* ================================================================== */
bolum('4) 🌐 tarayici.js — uzak tarayıcı + kanal stratejisi');

const tarayiciSrc = oku('src/tarayici.js');
kontrol('REMOTE_BROWSER_URL env okunuyor', /process\.env\.REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('ws → chromium.connect', /chromium\.connect\(REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('http → chromium.connectOverCDP', /chromium\.connectOverCDP\(REMOTE_BROWSER_URL/.test(tarayiciSrc));
kontrol('uzak modda yerel launch yapılmıyor', /UZAK_MOD \? uzakTarayiciBaglan\(\) : yerelTarayiciBaslat\(\)/.test(tarayiciSrc));
kontrol('channel fallback sırası (chrome → chromium → shell)',
  /channel: 'chrome'/.test(tarayiciSrc) && /channel: 'chromium'/.test(tarayiciSrc));
kontrol('TARAYICI_CHANNEL env desteği', /process\.env\.TARAYICI_CHANNEL/.test(tarayiciSrc));
kontrol('BOS_KALMA_MS env ile ayarlanabilir', /process\.env\.TARAYICI_BOS_KALMA_MS/.test(tarayiciSrc));
kontrol('uzak bağlam kapatılmıyor (ctxBizim)', /ctx && ctxBizim/.test(tarayiciSrc));
kontrol('tarayiciDurumu mod/uzak bilgisi verir', /mod: UZAK_MOD \? 'uzak' : 'yerel'/.test(tarayiciSrc));

/* ================================================================== */
bolum('5) 🗂️ katalogSync parser\'ları');

const {
  shopifyUrunleriCoz, wooUrunleriCoz, sitemapUrlCoz, sitemapUrunlerCoz,
  xmlUrunleriCoz, temizBaslik, baslikFromSlug, sorguKelimeleri,
  katalogSatirlariYaz, katalogUrunleriAra, katalogSiteAdayi,
  katalogSyncDurumu, katalogHedefleri, katalogEskileriTemizle,
} = await import('../src/katalogSync.js');

kontrol('temizBaslik PLA+ ↔ PLA Plus eşitler', temizBaslik('eSun PLA+ Siyah 1kg') === 'esun pla plus siyah 1kg',
  temizBaslik('eSun PLA+ Siyah 1kg'));
kontrol('temizBaslik ölçü noktasını korur', temizBaslik('1.75mm').includes('1.75mm'));
kontrol('baslikFromSlug okunabilir başlık üretir', baslikFromSlug('esun-pla-siyah-1-kg') === 'Esun Pla Siyah 1 Kg');
kontrol('sorguKelimeleri saf sayıları atar', !sorguKelimeleri('bütçem 1200 TL').includes('1200'));
kontrol('sorguKelimeleri ölçüleri korur', sorguKelimeleri('eSun PLA+ 1.75mm').includes('1.75mm'));

const shop = shopifyUrunleriCoz({
  products: [{
    handle: 'esun-pla-siyah', title: 'eSun PLA+ Siyah 1kg', vendor: 'eSun',
    variants: [{ price: '899.00', available: true }, { price: '450.00', available: false }],
    images: [{ src: 'https://ornek.test/a.jpg' }],
  }],
}, { siteId: 'porima3d', base: 'https://porima3d.com', simdi: 1700000000000 });
kontrol('Shopify: fiyat ondalık dizeden doğru (899)', shop[0]?.fiyat === 899, String(shop[0]?.fiyat));
kontrol('Shopify: stokta bilgisi işlenir', shop[0]?.stokta === 1);
kontrol('Shopify: URL handle\'dan üretilir', shop[0]?.urunUrl === 'https://porima3d.com/products/esun-pla-siyah');
kontrol('Shopify: marka + görsel taşınır', shop[0]?.marka === 'eSun' && shop[0]?.gorselUrl === 'https://ornek.test/a.jpg');
kontrol('Shopify: gerçek çekim zamanı', shop[0]?.guncellemeTs === 1700000000000);

const woo = wooUrunleriCoz([{
  name: 'Porima PLA Filament', permalink: 'https://ornek.test/urun/porima-pla',
  prices: { price: '46556', currency_minor_unit: 2, currency_code: 'TRY' },
  is_in_stock: true, images: [{ src: 'https://ornek.test/p.jpg' }],
}], { siteId: 'ornekwoo', simdi: 1700000000000 });
kontrol('Woo: minor unit fiyat çevrilir (465.56)', woo[0]?.fiyat === 465.56, String(woo[0]?.fiyat));
kontrol('Woo: stokta + para birimi', woo[0]?.stokta === 1 && woo[0]?.paraBirimi === 'TRY');
kontrol('Woo: kaynakTur woo', woo[0]?.kaynakTur === 'woo');

const sm = sitemapUrlCoz('<sitemapindex><sitemap><loc>https://x/sitemap_products_1.xml</loc></sitemap></sitemapindex>');
kontrol('sitemapUrlCoz index algılar', sm.indexMi === true && sm.kayitlar.length === 1);
const smu = sitemapUrunlerCoz(
  '<urlset><url><loc>https://x.com/esun-pla-siyah-123</loc></url><url><loc>https://x.com/hakkimizda</loc></url></urlset>',
  { siteId: 'x', simdi: 1700000000000 });
kontrol('sitemapUrunlerCoz ürün URL\'lerini alır', smu.length >= 1 && smu[0].urunUrl.includes('esun'));
kontrol('sitemap: fiyat UYDURULMAZ (null)', smu[0]?.fiyat === null);
kontrol('sitemap: stok bilinmiyor (null)', smu[0]?.stokta === null);
kontrol('sitemap: kaynakTur sitemap', smu[0]?.kaynakTur === 'sitemap');

const xml = xmlUrunleriCoz(
  '<rss><channel><item><title>Porima PLA</title><link>https://p.com/u1</link>'
  + '<g:price>450.00 TRY</g:price><g:availability>in stock</g:availability><g:brand>Porima</g:brand></item></channel></rss>',
  { siteId: 'p', simdi: 1700000000000 });
kontrol('XML: g:price okunur', xml[0]?.fiyat === 450, String(xml[0]?.fiyat));
kontrol('XML: availability → stokta', xml[0]?.stokta === 1);
kontrol('XML: marka', xml[0]?.marka === 'Porima');

kontrol('hedef listesi en az 5 mağaza', katalogHedefleri().length >= 5, String(katalogHedefleri().length));
kontrol('Shopify hedefleri var', katalogHedefleri().some(h => h.tur === 'shopify'));
kontrol('Sitemap hedefleri var', katalogHedefleri().some(h => h.tur === 'sitemap'));

/* ================================================================== */
bolum('6) 💾 SQLite — upsert, arama, TTL, site adayı');

const TEST_SITE = '__test_impit__';
const simdi = Date.now();
const ornekSatirlar = [
  {
    siteId: TEST_SITE, urunUrl: 'https://test.local/urun/a', baslik: 'TestMarka PLA+ Siyah 1kg',
    temizBaslik: temizBaslik('TestMarka PLA+ Siyah 1kg'), marka: 'TestMarka',
    fiyat: 500, stokta: 1, gorselUrl: null, paraBirimi: 'TRY',
    kaynakTur: 'shopify', guncellemeTs: simdi,
  },
  {
    siteId: TEST_SITE, urunUrl: 'https://test.local/urun/b', baslik: 'TestMarka PETG Beyaz 1kg',
    temizBaslik: temizBaslik('TestMarka PETG Beyaz 1kg'), marka: 'TestMarka',
    fiyat: 620, stokta: 0, gorselUrl: null, paraBirimi: 'TRY',
    kaynakTur: 'shopify', guncellemeTs: simdi,
  },
];
const y1 = katalogSatirlariYaz(ornekSatirlar);
kontrol('satırlar yazıldı', y1.yazilan === 2 && y1.hata === 0, JSON.stringify(y1));

const y2 = katalogSatirlariYaz([{ ...ornekSatirlar[0], fiyat: 480, stokta: 0 }]);
kontrol('upsert kopya üretmez (tek satır güncellendi)', y2.yazilan === 1);

const bulunan = katalogUrunleriAra('TestMarka PLA+ Siyah', { ttlMs: 0, limit: 5 });
kontrol('arama eşleşmeyi bulur', bulunan.length === 1 && bulunan[0].urunUrl.endsWith('/a'));
kontrol('upsert fiyatı güncelledi', bulunan[0]?.fiyat === 480, String(bulunan[0]?.fiyat));

const tazeYok = katalogUrunleriAra('TestMarka PLA+ Siyah', { ttlMs: 1 });
await bekle(5);
kontrol('TTL dışı kayıt dönmez (1 ms)', katalogUrunleriAra('TestMarka PLA+', { ttlMs: 1 }).length === 0);
kontrol('TTL içi kayıt döner (5 dk)', katalogUrunleriAra('TestMarka PLA+', { ttlMs: 300000 }).length >= 1);

const siteAday = katalogSiteAdayi(TEST_SITE, { title: 'TestMarka PLA+ Siyah 1kg' }, { ttlMs: 300000 });
kontrol('katalogSiteAdayi eşleşmeyi bulur', !!siteAday && siteAday.urunUrl.endsWith('/a'));
kontrol('katalogSiteAdayi yanlış ürünü getirmez',
  katalogSiteAdayi(TEST_SITE, { title: 'Tamamen Farklı Ürün XYZ' }, { ttlMs: 300000 }) === null);
kontrol('katalogSiteAdayi TTL=0 → null (tazelik şart)', katalogSiteAdayi(TEST_SITE, { title: 'TestMarka PLA+ Siyah' }, { ttlMs: 0 }) === null);

const dSync = katalogSyncDurumu();
kontrol('katalogSyncDurumu toplam sayı verir', typeof dSync.db.toplam === 'number' && dSync.db.toplam >= 2);
kontrol('katalogSyncDurumu hedef listesi verir', Array.isArray(dSync.hedefler) && dSync.hedefler.length >= 5);

const silinen = katalogEskileriTemizle(0); // 0 → hepsi (min 1 gün uygulanır)
kontrol('katalogEskileriTemizle çalışır', typeof silinen === 'number');

/* ================================================================== */
bolum('7) 🔗 Entegrasyon — urunArama, pipeline, anlikOnbellek');

const { katalogdanKaynakAdayi } = await import('../src/urunArama.js');
const kaynak = katalogdanKaynakAdayi('TestMarka PLA+ Siyah 1kg', { ttlMs: 300000 });
kontrol('urunArama katalog katmanından kaynak döner', !!kaynak && kaynak.kaynak === 'katalog');
kontrol('kaynak yaşı taşınır (katalogYasMs)', typeof kaynak?.katalogYasMs === 'number');
kontrol('kaynak site + fiyat taşır', kaynak?.siteId === TEST_SITE && kaynak?.price === 480);
kontrol('olmayan ürün için null',
  katalogdanKaynakAdayi('Hiç Olmayan Ürün Adı ZZQ', { ttlMs: 300000 }) === null);

const pipelineSrc = oku('src/pipeline.js');
kontrol('pipeline katalog kısayolu içeriyor', /katalogSiteAdayi\(adapter\.id, src/.test(pipelineSrc));
kontrol('pipeline katalog sonucu işaretliyor', /result\.katalog = \{/.test(pipelineSrc));
kontrol('pipeline fiyatsız katalogda sayfa okur', /adapter\.getProduct\(kayit\.urunUrl/.test(pipelineSrc));

const anlikSrc = oku('src/anlikOnbellek.js');
kontrol('anlikOnbellek katalog aramasını içe aktarır', /katalogUrunleriAra/.test(anlikSrc));
kontrol('anlikVeyaKatalogAl birleşik arama', /export function anlikVeyaKatalogAl/.test(anlikSrc));

const { anlikVeyaKatalogAl } = await import('../src/anlikOnbellek.js');
const birl = anlikVeyaKatalogAl('TestMarka PLA+ Siyah');
kontrol('anlikVeyaKatalogAl sonuç tipi bildirir', ['snapshot', 'katalog', 'yok'].includes(birl.tur), birl.tur);

/* ================================================================== */
bolum('8) 🌐 server.js + admin panel');

const serverSrc = oku('server.js');
kontrol('katalogSync import ediliyor', /from '\.\/src\/katalogSync\.js'/.test(serverSrc));
kontrol('arka plan senkronu açılışta başlıyor', /katalogSenkronBaslat\(\)/.test(serverSrc));
kontrol('kapanışta zamanlayıcı duruyor', /katalogSenkronDurdur\(\)/.test(serverSrc));
kontrol('GET /api/admin/katalog-sync (adminGerekli)',
  /app\.get\('\/api\/admin\/katalog-sync', adminGerekli/.test(serverSrc));
kontrol('POST /api/admin/katalog-sync (adminGerekli)',
  /app\.post\('\/api\/admin\/katalog-sync', adminGerekli/.test(serverSrc));
kontrol('GET /api/admin/katalog-ara (adminGerekli)',
  /app\.get\('\/api\/admin\/katalog-ara', adminGerekli/.test(serverSrc));
kontrol('/api/durum katalog özeti verir', /katalog: \(\(\) => \{/.test(serverSrc));
kontrol('job kaynakKatmani taşır', /job\.kaynakKatmani = \(bulunan\.kaynak === 'katalog'/.test(serverSrc));

const adminHtml = oku('public/admin.html');
for (const id of ['katalogToplam', 'katalogFiyatli', 'katalogSyncBtn', 'katalogAramaBtn', 'katalogSiteListe']) {
  kontrol(`admin.html: #${id}`, adminHtml.includes(`id="${id}"`));
}
const adminJs = oku('public/admin.js');
kontrol('admin.js: katalogSyncYukle', /async function katalogSyncYukle/.test(adminJs));
kontrol('admin.js: manuel senkron butonu bağlı', /#katalogSyncBtn/.test(adminJs));
kontrol('admin.js: ilerleme polling', /function katalogPollBaslat/.test(adminJs));
kontrol('admin.js: indeks arama testi', /api\/admin\/katalog-ara/.test(adminJs));

const appSrc = oku('public/app.js');
kontrol('app.js: katalog faz notu gösterir', /katalogFazNotu/.test(appSrc));
kontrol('app.js: katalog yaşı kullanıcıya yazılır', /katalog indeksinden bulundu/.test(appSrc));
kontrol('app.js: kartta katalog etiketi',
  // 2026-11-28: rozet metni i18n'e taşındı (BASKI_ORTAM.dil ile katalog/catalog/
  // catalogue/カタログ). Sabit metin yerine rozetin varlığını doğruluyoruz.
  /r\.katalog \?/.test(appSrc) && appSrc.includes('🗂️'));

/* ================================================================== */
if (CANLI) {
  bolum('9) 🔌 Canlı sunucu — admin uçları');
  const ANAHTAR = process.env.ADMIN_ANAHTARI || 'qx2kjlgmwhfnzc1p6b3r4ayd';
  const URL_TABAN = process.env.SUNUCU || 'http://127.0.0.1:3000';
  try {
    const res = await fetch(`${URL_TABAN}/api/admin/katalog-sync`, {
      headers: { 'x-admin-anahtari': ANAHTAR },
      signal: AbortSignal.timeout(10000),
    });
    const d = await res.json().catch(() => null);
    kontrol('canlı: /api/admin/katalog-sync yanıt verir', res.status === 200 && d?.ok === true, `HTTP ${res.status}`);
    kontrol('canlı: durum db sayımları içerir', d && typeof d.db?.toplam === 'number');
    const ara = await fetch(`${URL_TABAN}/api/admin/katalog-ara?q=pla&ttlDk=0`, {
      headers: { 'x-admin-anahtari': ANAHTAR },
      signal: AbortSignal.timeout(10000),
    });
    const ad = await ara.json().catch(() => null);
    kontrol('canlı: katalog arama ucu çalışır', ara.status === 200 && ad?.ok === true, `HTTP ${ara.status}`);
    const durum = await fetch(`${URL_TABAN}/api/durum`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
    kontrol('canlı: /api/durum katalog alanı', !!durum?.katalog);
  } catch (e) {
    kontrol('canlı sunucuya erişilebildi', false, String(e?.message || e));
  }
}

/* ================================================================== */
// Test verilerini temizle
try {
  const { dbBaglantisi } = await import('../src/store.js');
  dbBaglantisi().prepare('DELETE FROM katalog_urunleri WHERE siteId = ?').run(TEST_SITE);
} catch { /* yoksay */ }
sunucu.close();

const { closeDatabase } = await import('../src/store.js');
closeDatabase();

console.log('\n' + '─'.repeat(54));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
