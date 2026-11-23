/**
 * 🌍 Çoklu Para Birimi & Pazar (market) İzolasyonu Testleri — 2026-11-23
 * Ağ isteği atmaz; birim ve SSR sözleşmelerini doğrular.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { formatPara, formatTL, paraBirimiNormalize } from '../src/util.js';
import {
  adapters, PAZARLAR, normalizeMarket, adapterMarket, adapterCurrency,
  adaptersByMarket, marketSiteIds, detectSite, adapterById,
} from '../src/sites/index.js';
import { crealityAramaKartlariCikar, crealityJsonLdUrunOku, parseGlobalFiyat } from '../src/sites/creality-global.js';
import { afiliyeLink } from '../src/afiliye.js';
import { seoUrunListesi, urunSayfasiHtml } from '../src/seoSayfalar.js';
import { katalogUrunleriAra } from '../src/katalogSync.js';
import { katalogdanKaynakAdayi } from '../src/urunArama.js';

let gecen = 0;
let kalan = 0;
function kontrol(ad, kosul, detay = '') {
  if (kosul) {
    gecen++;
  } else {
    kalan++;
    console.log(`  ✗ ${ad}${detay ? ' — ' + detay : ''}`);
  }
}

console.log('\n1) 💱 Çoklu para birimi biçimlendirici (src/util.js)');
kontrol("USD -> $849.00", formatPara(849, 'USD') === '$849.00', formatPara(849, 'USD'));
kontrol("EUR -> 799,00 €", formatPara(799, 'EUR') === '799,00 €', formatPara(799, 'EUR'));
kontrol("JPY -> ¥128,000", formatPara(128000, 'JPY') === '¥128,000', formatPara(128000, 'JPY'));
kontrol("TRY -> ₺34.990,00", formatPara(34990, 'TRY') === '₺34.990,00', formatPara(34990, 'TRY'));
kontrol("formatPara geçersiz/null -> —", formatPara(null, 'USD') === '—' && formatPara('abc', 'EUR') === '—');
kontrol("formatTL eski biçimini korur", formatTL(34990) === '34.990,00 TL', formatTL(34990));
kontrol("paraBirimiNormalize çalışır",
  paraBirimiNormalize('TL') === 'TRY'
  && paraBirimiNormalize('$') === 'USD'
  && paraBirimiNormalize('€') === 'EUR'
  && paraBirimiNormalize('¥') === 'JPY');

console.log('\n2) 🌐 Ön yüz ortak para.js sözleşmesi');
const sandbox = { Intl, Number, String, Math, isNaN };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync('public/para.js', 'utf8'), sandbox);
kontrol('public/para.js USD/EUR/JPY/TRY aynı çıktıyı verir',
  sandbox.formatPara(849, 'USD') === '$849.00'
  && sandbox.formatPara(799, 'EUR') === '799,00 €'
  && sandbox.formatPara(128000, 'JPY') === '¥128,000'
  && sandbox.formatPara(34990, 'TRY') === '₺34.990,00'
  && sandbox.formatTL(100) === '100,00 TL');

const indexHtml = fs.readFileSync('public/index.html', 'utf8');
kontrol('index.html /para.js dosyasını /app.js öncesinde yükler',
  indexHtml.indexOf('src="/para.js"') > 0 && indexHtml.indexOf('src="/para.js"') < indexHtml.indexOf('src="/app.js"'));

console.log('\n3) 🗺️ Pazar (market) ve adaptör varsayılanları');
kontrol('PAZARLAR tr/us/fr/eu/jp tanımlı',
  PAZARLAR.tr?.currency === 'TRY' && PAZARLAR.us?.currency === 'USD' && PAZARLAR.fr?.currency === 'EUR' && PAZARLAR.jp?.currency === 'JPY');
kontrol('normalizeMarket takma adları çözer',
  normalizeMarket('en') === 'us' && normalizeMarket('ja') === 'jp' && normalizeMarket('FR') === 'fr' && normalizeMarket('bilinmeyen') === 'tr');
kontrol('TR adaptörleri varsayılan tr/TRY alır (70 mağaza)',
  adaptersByMarket('tr').length >= 70 && adaptersByMarket('tr').every(a => adapterMarket(a) === 'tr' && adapterCurrency(a) === 'TRY'));
kontrol('US/FR/EU/JP pazarları Creality adaptörlerini içerir, tr mağazaları karışmaz',
  adaptersByMarket('us').some(a => a.id === 'creality_us')
  && adaptersByMarket('fr').some(a => a.id === 'creality_fr')
  && adaptersByMarket('eu').some(a => a.id === 'creality_eu')
  && adaptersByMarket('jp').some(a => a.id === 'creality_jp')
  && marketSiteIds('tr').has('porima3d') && !marketSiteIds('us').has('porima3d'));

console.log('\n4) 🔒 Katalog, arama ve SEO pazar izolasyonu');
const trKatalog = katalogUrunleriAra('pla', { limit: 5, ttlMs: 0, market: 'tr' });
const usKatalog = katalogUrunleriAra('pla', { limit: 5, ttlMs: 0, market: 'us' });
kontrol('katalogUrunleriAra market=us hiçbir tr ürünü sızdırmaz', usKatalog.length === 0, `len=${usKatalog.length}`);
kontrol('katalogdanKaynakAdayi market=us tr ürünü döndürmez',
  katalogdanKaynakAdayi('porima pla', { ttlMs: 0, market: 'us' }) === null);
kontrol('katalogUrunleriAra market=tr normal çalışır', Array.isArray(trKatalog));

const usSeo = seoUrunListesi({ taze: true, market: 'us' });
const trSeo = seoUrunListesi({ taze: true, market: 'tr' });
kontrol('seoUrunListesi market=us hiçbir tr/TRY kaydı içermez', usSeo.length === 0, `usLen=${usSeo.length}`);
kontrol('seoUrunListesi market=tr tüm kayıtları TRY olarak işaretler',
  trSeo.length > 0 && trSeo.every(u => u.market === 'tr' && u.paraBirimi === 'TRY'));

console.log('\n5) 📄 SSR ürün sayfası çoklu para birimi render');
const ornekUsdUrun = {
  id: 999999,
  market: 'us',
  paraBirimi: 'USD',
  ad: 'Creality K3 Multi-Color 3D Printer',
  sorgu: 'Creality K3',
  kategori: 'yazici',
  kategoriSlug: '3d-yazici',
  slug: 'creality-k3-multi-color',
  yol: '/urun/creality-k3-multi-color',
  enUcuzFiyat: 849,
  enPahaliFiyat: 899,
  enUcuzSite: 'Creality Store',
  enUcuzUrl: 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer',
  stokluSayisi: 1,
  lastmod: '2026-11-23',
  teklifler: [{
    siteId: 'creality_us',
    site: 'Creality Store',
    baslik: 'K3 Multi-Material & Multicolor 3D Printer',
    fiyat: 849,
    paraBirimi: 'USD',
    stokta: true,
    kargo: 'Free Shipping',
    url: 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer',
  }],
};
const usdHtml = urunSayfasiHtml(ornekUsdUrun, 'https://baskihesap.tech', []);
kontrol('USD ürün sayfasında $849.00 ve priceCurrency USD görünür',
  usdHtml.includes('$849.00') && usdHtml.includes('"priceCurrency":"USD"') && !usdHtml.includes('849,00 TL'));

const ornekJpyUrun = {
  ...ornekUsdUrun,
  market: 'jp',
  paraBirimi: 'JPY',
  enUcuzFiyat: 128000,
  enPahaliFiyat: 0,
  teklifler: [{ ...ornekUsdUrun.teklifler[0], fiyat: 128000, paraBirimi: 'JPY' }],
};
const jpyHtml = urunSayfasiHtml(ornekJpyUrun, 'https://baskihesap.tech', []);
kontrol('JPY ürün sayfasında ¥128,000 ve priceCurrency JPY görünür',
  jpyHtml.includes('¥128,000') && jpyHtml.includes('"priceCurrency":"JPY"'));

console.log('\n6) 🌍 Creality Global adaptörleri (US/FR/EU/JP) & Impact afiliye');
kontrol('detectSite store.creality.com bölgesel yolları doğru çözer',
  detectSite('https://store.creality.com/products/k3-multi-material-multicolor-3d-printer')?.id === 'creality_us'
  && detectSite('https://store.creality.com/fr/products/kit-de-bloc')?.id === 'creality_fr'
  && detectSite('https://store.creality.com/eu/products/k1c-pei')?.id === 'creality_eu'
  && detectSite('https://store.creality.com/jp/products/k1c-kit')?.id === 'creality_jp');

kontrol('parseGlobalFiyat USD/EUR/JPY doğru ayrıştırır',
  parseGlobalFiyat('$<!-- -->849.00', 'USD') === 849
  && parseGlobalFiyat('799,90 €', 'EUR') === 799.9
  && parseGlobalFiyat('¥128,000', 'JPY') === 128000);

const sahteAramaHtml = `<header><a href="/fr/products/promo">Promo &gt;&gt;</a></header>
  <div class="products"><div class="product-item product-item--text-cart">
    <a class="item-img" href="/fr/products/creality-k1c-fr"><img src="https://cdn.shopify.com/k1c.png" alt="Creality K1C"/></a>
    <div class="item-content"><a class="title" href="/fr/products/creality-k1c-fr"><div class="item-content-name">Creality K1C FR</div></a>
    <div class="content"><div class="product-price"><span class="price">€<!-- -->599,00</span></div></div></div>
  </div></div>`;
const frKartlar = crealityAramaKartlariCikar(sahteAramaHtml, '/fr', 'EUR');
kontrol('crealityAramaKartlariCikar promo linki atlar, kartı çeker',
  frKartlar.length === 1
  && frKartlar[0].url === 'https://store.creality.com/fr/products/creality-k1c-fr'
  && frKartlar[0].price === 599
  && frKartlar[0].currency === 'EUR',
  JSON.stringify(frKartlar));

const sahteLdHtml = `<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Creality K3 Multi-Color","sku":"1002110208","image":["https://cdn.shopify.com/k3.png"],"offers":[{"@type":"Offer","price":849,"priceCurrency":"USD","availability":"https://schema.org/InStock"}]}]</script>`;
const k3Urun = crealityJsonLdUrunOku(sahteLdHtml, 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer', adapterById('creality_us'));
kontrol('crealityJsonLdUrunOku Product JSON-LD okur',
  k3Urun.title === 'Creality K3 Multi-Color'
  && k3Urun.sellingPrice === 849
  && k3Urun.currency === 'USD'
  && k3Urun.modelCode === '1002110208'
  && k3Urun.inStock === true);

const impactAyar = {
  etkin: true,
  aglar: { impact: { etkin: true, parametre: '', token: '', sablon: 'https://crealityofficialstore.sjv.io/Pzxrme?u={url}' } },
  siteAg: {},
  siteSablon: {},
};
kontrol('creality_us/fr/eu/jp bağlantıları Impact şablonu ile sarılır',
  afiliyeLink('creality_us', 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer', impactAyar).startsWith('https://crealityofficialstore.sjv.io/Pzxrme?u=')
  && afiliyeLink('creality_jp', 'https://store.creality.com/jp/products/k1c', impactAyar).startsWith('https://crealityofficialstore.sjv.io/Pzxrme?u='));

console.log('\n──────────────────────────────────────────────');
console.log(`Sonuç: ${gecen}/${gecen + kalan} kontrol geçti`);
if (kalan > 0) process.exit(1);
