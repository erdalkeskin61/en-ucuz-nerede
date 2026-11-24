/**
 * 🌍 Çoklu Para Birimi & Pazar (market) İzolasyonu Testleri — 2026-11-23
 * Ağ isteği atmaz; birim ve SSR sözleşmelerini doğrular.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { formatPara, formatTL, paraBirimiNormalize, extractColors, dominantColor, renkAyni, parcaMi, fiyatCikar } from '../src/util.js';
import { miktarCikar, birimFiyatHesapla } from '../src/birimFiyat.js';
import { kargoCikar } from '../src/kargo.js';
import { globalSiteler, globalKatalogHedefleri } from '../src/sites/global.js';
import { katalogHedefleri } from '../src/katalogSync.js';
import {
  adapters, PAZARLAR, normalizeMarket, adapterMarket, adapterCurrency,
  adaptersByMarket, taramaAdaptersByMarket, marketSiteIds, detectSite, adapterById,
} from '../src/sites/index.js';
import { crealityAramaKartlariCikar, crealityJsonLdUrunOku, parseGlobalFiyat } from '../src/sites/creality-global.js';
import { afiliyeLink } from '../src/afiliye.js';
import {
  SOZLUKLER, DESTEKLENEN_DILLER, DIL_META, normalizeDil, dilByMarket,
  sozlukGetir, t, sssSablonlari, dilParaFormati,
} from '../src/i18n/index.js';
import {
  GLOBAL_ANA_YOLLARI, GLOBAL_MALIYET_YOLLARI, GLOBAL_SLICER_YOLLARI, GLOBAL_SEPET_YOLLARI,
  globalAracSayfasiBul, globalAracSitemapKayitlari, globalAracAlternatifHaritasi,
} from '../src/globalAracSayfalar.js';
import { seoUrunListesi, urunSayfasiHtml, sayfaIskeleti, globalKatalogDiziniHtml } from '../src/seoSayfalar.js';
import { globalRehberDiziniHtml } from '../src/rehberSayfalar.js';
import { katalogUrunleriAra } from '../src/katalogSync.js';
import { katalogdanKaynakAdayi } from '../src/urunArama.js';
import { dbBaglantisi, closeDatabase } from '../src/store.js';

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

console.log('\n7) 🗣️ Hafif i18n sözlük motoru (tr / en / fr / ja)');
kontrol('4 dil tanımlı ve meta bilgileri tam',
  DESTEKLENEN_DILLER.join(',') === 'tr,en,fr,ja'
  && DIL_META.en.currency === 'USD' && DIL_META.fr.currency === 'EUR' && DIL_META.ja.currency === 'JPY');
kontrol('normalizeDil ve dilByMarket doğru eşler',
  normalizeDil('jp') === 'ja' && normalizeDil('en-US') === 'en' && normalizeDil('fr-FR') === 'fr'
  && dilByMarket('us') === 'en' && dilByMarket('fr') === 'fr' && dilByMarket('jp') === 'ja');

// Tüm 4 sözlükte anahtar eşitliği
const trAnahtarlar = [];
const topla = (obj, on = '') => {
  for (const [k, v] of Object.entries(obj)) {
    const yol = on ? `${on}.${k}` : k;
    if (v && typeof v === 'object') topla(v, yol);
    else trAnahtarlar.push(yol);
  }
};
topla(SOZLUKLER.tr);
for (const dil of ['en', 'fr', 'ja']) {
  const eksik = trAnahtarlar.filter(yol => t(dil, yol) === yol || !t(dil, yol));
  kontrol(`${dil}.js tüm sözlük anahtarlarına sahip`, eksik.length === 0, eksik.join(', '));
}

kontrol('stok ve kargo etiketleri hedef dillerde doğru',
  t('en', 'durum.stokta') === 'In Stock'
  && t('fr', 'durum.stokta') === 'En stock'
  && t('ja', 'durum.stokta') === '在庫あり'
  && t('fr', 'durum.ucretsizKargo') === 'Livraison gratuite'
  && t('ja', 'durum.ucretsizKargo') === '送料無料');

kontrol('dilParaFormati her dilin yerel para birimini biçimlendirir',
  dilParaFormati('en', 849) === '$849.00'
  && dilParaFormati('fr', 799) === '799,00 €'
  && dilParaFormati('ja', 128000) === '¥128,000'
  && dilParaFormati('tr', 34990) === '34.990,00 TL');

const enSss = sssSablonlari('en', { ad: 'Creality K3', guncelFiyat: 849, enPahaliFiyat: 899, enUcuzSite: 'Creality Store', magazaSayisi: 2 });
const jaSss = sssSablonlari('ja', { ad: 'Creality K1C', guncelFiyat: 75000, enUcuzSite: 'Creality JP', magazaSayisi: 1 });
kontrol('sssSablonlari EN ve JA dinamik SSS üretir',
  enSss.length === 3 && enSss[0].cevap.includes('$849.00')
  && jaSss.length === 3 && jaSss[0].cevap.includes('¥75,000'));

const enSayfa = urunSayfasiHtml(ornekUsdUrun, 'https://baskihesap.tech', [], { dil: 'en' });
kontrol('İngilizce SSR ürün sayfası In Stock, Visit Store ve lang="en" içerir',
  enSayfa.includes('<html lang="en"') && enSayfa.includes('In Stock') && enSayfa.includes('Visit Store') && enSayfa.includes('$849.00'));

const frSayfa = urunSayfasiHtml({
  ...ornekUsdUrun,
  market: 'fr',
  paraBirimi: 'EUR',
  enUcuzFiyat: 799,
  teklifler: [{ ...ornekUsdUrun.teklifler[0], fiyat: 799, paraBirimi: 'EUR' }],
}, 'https://baskihesap.tech', [], { dil: 'fr' });
kontrol('Fransızca SSR ürün sayfası En stock, 799,00 € ve lang="fr" içerir',
  frSayfa.includes('<html lang="fr"') && frSayfa.includes('En stock') && frSayfa.includes('799,00 €'));

const jaSayfa = urunSayfasiHtml(ornekJpyUrun, 'https://baskihesap.tech', [], { dil: 'ja' });
kontrol('Japonca SSR ürün sayfası 在庫あり, ¥128,000 ve lang="ja" içerir',
  jaSayfa.includes('<html lang="ja"') && jaSayfa.includes('在庫あり') && jaSayfa.includes('¥128,000'));

console.log('\n8) 🌍 Global STL Maliyet, Sepet, Slicer, Katalog, Rehber & Ana Sayfalar + Navbar Dil Seçici');
const sitemapGlobal = globalAracSitemapKayitlari();
kontrol('18 global rota sitemap kaydı üretir (ana + katalog + rehber + maliyet + sepet + slicer)', sitemapGlobal.length === 18);

for (const yol of [
  ...Object.values(GLOBAL_ANA_YOLLARI),
  ...Object.values(GLOBAL_MALIYET_YOLLARI),
  ...Object.entries(GLOBAL_SEPET_YOLLARI).filter(([d]) => d !== 'tr').map(([, y]) => y),
  ...Object.values(GLOBAL_SLICER_YOLLARI),
]) {
  const kayit = globalAracSayfasiBul(yol);
  kontrol(`globalAracSayfasiBul(${yol}) bulunur`, !!kayit);
  if (kayit) {
    const html = kayit.olustur('https://baskihesap.tech');
    kontrol(`${yol} hreflang, lang ve dil-secici içerir`,
      html.includes(`lang="${kayit.dil}"`)
      && html.includes('class="dil-secici"')
      && html.includes('hreflang="en"')
      && html.includes('hreflang="fr"')
      && html.includes('hreflang="ja"')
      && (kayit.tur === 'ana'
        ? html.includes('Creality Store')
        : (kayit.tur === 'sepet' ? html.includes('/sepet.js') : html.includes('store.creality.com'))));
  }
}

for (const [dil, beklenenBaslik] of [
  ['en', '3D Printer &amp; Filament'],
  ['fr', 'Catalogue Prix'],
  ['ja', '価格カタログ'],
]) {
  const katHtml = globalKatalogDiziniHtml(dil, [], 'https://baskihesap.tech');
  const rehHtml = globalRehberDiziniHtml(dil, 'https://baskihesap.tech', []);
  kontrol(`${dil} katalog ve rehber sayfaları lang="${dil}", dil-secici ve rehber kartları içerir`,
    katHtml.includes(`lang="${dil}"`)
    && katHtml.includes(beklenenBaslik)
    && katHtml.includes('class="seo-izgara"')
    && katHtml.includes(`href="/${dil === 'fr' ? 'fr/guides' : `${dil}/guides`}"`)
    && rehHtml.includes(`lang="${dil}"`)
    && rehHtml.includes('class="rehber-izgara"'));
}

const enAna = globalAracSayfasiBul('/en').olustur('https://baskihesap.tech');
const frAnaSayfa = globalAracSayfasiBul('/fr').olustur('https://baskihesap.tech');
const jaAna = globalAracSayfasiBul('/ja').olustur('https://baskihesap.tech');
kontrol('/en, /fr ve /ja ana sayfaları kendi market ortamını, gerçek TR sistemini ve TR tasarımını içerir',
  enAna.includes('"market":"us"') && enAna.includes('/en/cost-calculator') && enAna.includes('/en/products') && enAna.includes('/en/guides') && enAna.includes('/en/basket')
  && frAnaSayfa.includes('"market":"fr"') && frAnaSayfa.includes('Creality Store (FR)') && frAnaSayfa.includes('/fr/produits') && frAnaSayfa.includes('/fr/panier')
  && jaAna.includes('"market":"jp"') && jaAna.includes('/ja/cost-calculator') && jaAna.includes('/ja/products') && jaAna.includes('/ja/basket')
  && enAna.includes('window.BASKI_HESAP_ORTAM')
  && enAna.includes('/app.js') && enAna.includes('/i18n-global.js') && enAna.includes('/stl-hizli.js')
  && enAna.includes('class="hero"')
  && enAna.includes('class="giris-kart hibrit-kart"')
  && enAna.includes('class="arama-modu"')
  && enAna.includes('class="stl-hizli"')
  && enAna.includes('class="footer-siteler"'));

for (const dosya of ['public/index.html', 'public/maliyet.html', 'public/slicer.html', 'public/sepet.html', 'public/ayarlar.html']) {
  const h = fs.readFileSync(dosya, 'utf8');
  kontrol(`${dosya} üst menüde .dil-secici (TR/EN/FR/JA) içerir`,
    h.includes('class="dil-secici"') && h.includes('hreflang="en"') && h.includes('hreflang="fr"') && h.includes('hreflang="ja"'));
}

const enMaliyet = globalAracSayfasiBul('/en/cost-calculator').olustur('https://baskihesap.tech');
const frMaliyet = globalAracSayfasiBul('/fr/calculateur-cout').olustur('https://baskihesap.tech');
const jaMaliyet = globalAracSayfasiBul('/ja/cost-calculator').olustur('https://baskihesap.tech');
kontrol('Global maliyet sayfaları klon TR arayüzünü, /maliyet.js, /para.js ve /i18n-global.js kullanır',
  enMaliyet.includes('/maliyet.js') && enMaliyet.includes('/para.js') && enMaliyet.includes('/i18n-global.js')
  && enMaliyet.includes('stlSiluetCanvas') && enMaliyet.includes('teklifFisModal')
  && frMaliyet.includes('"EUR"') && jaMaliyet.includes('"JPY"'));

const enSepet = globalAracSayfasiBul('/en/basket').olustur('https://baskihesap.tech');
const frSepet = globalAracSayfasiBul('/fr/panier').olustur('https://baskihesap.tech');
const jaSepet = globalAracSayfasiBul('/ja/basket').olustur('https://baskihesap.tech');
kontrol('Global akıllı sepet sayfaları /sepet.js, /para.js ve kendi market ortamını içerir',
  enSepet.includes('"market":"us"') && enSepet.includes('/sepet.js') && enSepet.includes('/para.js')
  && frSepet.includes('"EUR"') && jaSepet.includes('"JPY"'));

const enSlicer = globalAracSayfasiBul('/en/slicer').olustur('https://baskihesap.tech');
kontrol('Global slicer sayfası Cura paketi, Python betiği ve /slicer.js içerir',
  enSlicer.includes('/indir/BaskiHesap.curapackage') && enSlicer.includes('/indir/en_ucuz_slicer.py') && enSlicer.includes('/slicer.js'));

const serverKaynak = fs.readFileSync('server.js', 'utf8');
kontrol('server.js tüm global katalog, rehber, maliyet, sepet ve slicer rotalarını tanımlar',
  serverKaynak.includes("'/en/products'")
  && serverKaynak.includes("'/fr/produits'")
  && serverKaynak.includes("'/ja/products'")
  && serverKaynak.includes("'/en/guides'")
  && serverKaynak.includes("'/en/cost-calculator'")
  && serverKaynak.includes("'/fr/calculateur-cout'")
  && serverKaynak.includes("'/ja/cost-calculator'")
  && serverKaynak.includes("'/en/basket'")
  && serverKaynak.includes("'/fr/panier'")
  && serverKaynak.includes("'/ja/basket'")
  && serverKaynak.includes("'/en/slicer'")
  && serverKaynak.includes('globalAracSitemapKayitlari(dil)'));

console.log('\n9) Çok Dilli Hreflang & Bölgesel Sitemap İndeksi:');
const trIskelet = sayfaIskeleti({
  title: 'Test TR',
  description: 'Açıklama',
  canonicalUrl: 'https://baskihesap.tech/urun/test',
  ogImage: 'https://baskihesap.tech/og-gorsel.png',
  govdeHtml: '<p>Test</p>',
});
kontrol('sayfaIskeleti(tr) <html lang="tr"> ve otomatik self hreflang="tr" + x-default basar',
  trIskelet.includes('<html lang="tr"')
  && trIskelet.includes('<link rel="alternate" hreflang="tr" href="https://baskihesap.tech/urun/test" />')
  && trIskelet.includes('<link rel="alternate" hreflang="x-default" href="https://baskihesap.tech/urun/test" />'));

for (const dil of ['en', 'fr', 'ja']) {
  const kayitlar = globalAracSitemapKayitlari(dil);
  kontrol(`globalAracSitemapKayitlari(${dil}) tam 6 URL döndürür`,
    kayitlar.length === 6 && kayitlar.every(k => k.dil === dil && k.yol.startsWith(`/${dil}`) && k.alternates?.tr));
}

const altHarita = globalAracAlternatifHaritasi();
kontrol('globalAracAlternatifHaritasi tüm eşleştirilmiş TR/EN/FR/JA rotalarını kapsar',
  altHarita['/']?.en === '/en'
  && altHarita['/maliyet.html']?.fr === '/fr/calculateur-cout'
  && altHarita['/slicer.html']?.ja === '/ja/slicer');

kontrol('server.js /sitemap.xml sitemapindex ve /sitemap-:dil.xml (tr/en/fr/ja) sunar',
  serverKaynak.includes('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  && serverKaynak.includes("app.get('/sitemap-:dil.xml'")
  && serverKaynak.includes("new Set(['tr', 'en', 'fr', 'ja'])")
  && serverKaynak.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  && serverKaynak.includes('<xhtml:link rel="alternate" hreflang='));

console.log('\n10) 🌐 Bölgesel Parsing Kuralları (EN / FR / JA renk, ağırlık, parça, fiyat, kargo):');
kontrol('extractColors / dominantColor EN/FR/JA renkleri Türkçe kanonik ada indirger',
  dominantColor('Creality Hyper PLA 1kg Black') === 'siyah'
  && dominantColor('Filament PLA Noir 1kg') === 'siyah'
  && dominantColor('Creality Hyper PLA フィラメント 1kg ブラック') === 'siyah'
  && dominantColor('Filament PLA Blanc 1000g') === 'beyaz'
  && dominantColor('PLA ホワイト 1000g') === 'beyaz'
  && dominantColor('Filament Gris foncé 1kg') === 'gri');

kontrol('renkAyni diller arası aynı ve farklı renkleri doğru ayırt eder',
  renkAyni('Black', 'Noir') === true
  && renkAyni('Black', 'ブラック') === true
  && renkAyni('White', 'Blanc') === true
  && renkAyni('White', 'ホワイト') === true
  && renkAyni('Black', 'White') === false
  && renkAyni('Noir', 'ホワイト') === false);

kontrol('parcaMi EN/FR/JA yedek parçaları yakalar, ana yazıcı ve filamentleri elemez',
  parcaMi('Creality K1C 0.4mm Nozzle') === true
  && parcaMi('Creality Hotend Kit') === true
  && parcaMi('Buse 0.4mm pour Creality K1C') === true
  && parcaMi('Plateau PEI magnétique 235x235mm') === true
  && parcaMi('Creality K1C ノズル 0.4mm') === true
  && parcaMi('Creality K1C ビルドプレート') === true
  && parcaMi('Creality K1C 3D Printer') === false
  && parcaMi('Creality Hyper PLA フィラメント 1kg ブラック') === false);

kontrol('miktarCikar ve birimFiyatHesapla EN/FR/JA ağırlık ve birim fiyatı çözer',
  miktarCikar('Creality Hyper PLA Filament 1kg Black').gram === 1000
  && miktarCikar('Filament PLA Noir 1000g').gram === 1000
  && miktarCikar('Creality Hyper PLA フィラメント 1kg ブラック').gram === 1000
  && miktarCikar('PLA フィラメント 1000g ホワイト').gram === 1000
  && miktarCikar('フィラメント 1キロ').gram === 1000
  && miktarCikar('Lot de 2 bobines PLA 1kg').gram === 2000
  && birimFiyatHesapla('Creality Hyper PLA フィラメント 1kg ブラック', 3200, 'JPY')?.birimFiyat === 3200
  && birimFiyatHesapla('Creality K1C 0.4mm Nozzle', 15, 'USD') === null
  && birimFiyatHesapla('Buse 0.4mm 1000g', 15, 'EUR') === null);

kontrol('fiyatCikar USD / EUR / JPY / TRY virgül-nokta ayrımını bölgeye göre çözer',
  fiyatCikar('849.00', 'USD') === 849
  && fiyatCikar('$1,299.90', 'USD') === 1299.9
  && fiyatCikar('849,00', 'EUR') === 849
  && fiyatCikar('1 299,90 €', 'EUR') === 1299.9
  && fiyatCikar('1.299,90 €', 'EUR') === 1299.9
  && fiyatCikar('128,000', 'JPY') === 128000
  && fiyatCikar('¥128,000', 'JPY') === 128000
  && fiyatCikar('128000.00', 'JPY') === 128000
  && Number.isInteger(fiyatCikar('12,800.40', 'JPY'))
  && fiyatCikar('34.990,00 TL', 'TRY') === 34990
  && fiyatCikar('500g Filament - $29.99', 'USD') === 29.99);

kontrol('kargoCikar US/FR/JP kargo eşiği ve kargo ücretini çözer',
  kargoCikar('<p>Free shipping on all orders over $99</p>', null, { currency: 'USD' }).freeOver === 99
  && kargoCikar('<p>Free shipping on all orders over $99</p>', null, { currency: 'USD' }).fee === null
  && kargoCikar('<p>Shipping: $9.99</p>', null, { currency: 'USD' }).fee === 9.99
  && kargoCikar('<p>Livraison gratuite dès 59,00 €</p>', null, { currency: 'EUR' }).freeOver === 59
  && kargoCikar('<p>Frais de port: 6,90 €</p>', null, { currency: 'EUR' }).fee === 6.9
  && kargoCikar('<p>¥10,000以上送料無料</p>', null, { currency: 'JPY' }).freeOver === 10000
  && kargoCikar('<p>送料 ¥800</p>', null, { currency: 'JPY' }).fee === 800);

console.log('\n11) 🗺️ Bölgesel Mağaza Görünürlüğü (/api/durum & /en /fr /ja):');
const frAna = globalAracSayfasiBul('/fr').olustur('https://baskihesap.tech');
kontrol('Creality Store (US/FR/EU/JP) kendi ülke sayfalarında görünür, Türkiye listesinde yer almaz',
  enAna.includes('Creality Store (US)') && !enAna.includes('Creality Store (JP)')
  && frAna.includes('Creality Store (FR)') && frAna.includes('Creality Store (EU)') && !frAna.includes('Creality Store (US)')
  && jaAna.includes('Creality Store (JP)') && !jaAna.includes('Creality Store (FR)')
  && adaptersByMarket('tr').every(a => !a.id.startsWith('creality_'))
  && serverKaynak.includes("const hamPazar = String(req.query?.market || 'tr')")
  && serverKaynak.includes('adaptersByMarket(hamPazar)'));

console.log('\n12) 🏭 Global Üretici & Bölgesel Mağaza Ağları (US / FR / EU / JP):');
const tumIdler = adapters.map(a => a.id);
kontrol('Tüm adaptör kimlikleri benzersizdir (TR + Global)',
  new Set(tumIdler).size === tumIdler.length && globalSiteler.length >= 45,
  `toplam=${tumIdler.length}, benzersiz=${new Set(tumIdler).size}`);

const trSiteler = adaptersByMarket('tr');
const usSiteler = adaptersByMarket('us');
const frSiteler = adaptersByMarket('fr');
const euSiteler = adaptersByMarket('eu');
const jpSiteler = adaptersByMarket('jp');
kontrol('Her ülke kendi izole mağaza ağına sahiptir (TR=70, US>=38, FR>=22, EU>=13, JP>=12)',
  trSiteler.length === 70
  && usSiteler.length >= 38
  && frSiteler.length >= 22
  && euSiteler.length >= 13
  && jpSiteler.length >= 12,
  `tr=${trSiteler.length}, us=${usSiteler.length}, fr=${frSiteler.length}, eu=${euSiteler.length}, jp=${jpSiteler.length}`);

kontrol('detectSite US/FR/EU/JP Shopify, WooCommerce, PrestaShop, Prusa3D, Amazon & dev perakendecileri tanır',
  detectSite('https://us.polymaker.com/products/matte-pla')?.id === 'polymaker_us'
  && detectSite('https://shop.polymaker.com/products/polylite-pla')?.id === 'polymaker_us'
  && detectSite('https://us.qidi3d.com/products/q1-pro-3d-printer')?.id === 'qidi_us'
  && detectSite('https://www.amazon.com/dp/B0CXYZ1234')?.id === 'amazon_us'
  && detectSite('https://www.amazon.fr/dp/B0CXYZ1234')?.id === 'amazon_fr'
  && detectSite('https://www.amazon.co.jp/dp/B0CXYZ1234')?.id === 'amazon_jp'
  && detectSite('https://www.walmart.com/ip/Creality-K1C/123456')?.id === 'walmart_us'
  && detectSite('https://www.bestbuy.com/site/creality-k1c/654321.p')?.id === 'bestbuy_us'
  && detectSite('https://www.target.com/p/pla-filament/-/A-123456')?.id === 'target_us'
  && detectSite('https://www.ebay.com/itm/227594725936')?.id === 'ebay_us'
  && detectSite('https://www.ebay.fr/itm/225980923047')?.id === 'ebay_fr'
  && detectSite('https://www.adafruit.com/product/6503')?.id === 'adafruit'
  && detectSite('https://www.ldlc.com/fiche/PB00728850.html')?.id === 'ldlc'
  && detectSite('https://www.boulanger.com/ref/9000963538')?.id === 'boulanger'
  && detectSite('https://www.3djake.fr/elegoo/pla-basic-magenta-3')?.id === '3djake_fr'
  && detectSite('https://www.3djake.de/elegoo/pla-basic-magenta-3')?.id === '3djake_de'
  && detectSite('https://item.rakuten.co.jp/elegoo/rt-jp-el-pla/')?.id === 'rakuten_jp'
  && detectSite('https://www.yodobashi.com/product/100000001005300972/')?.id === 'yodobashi'
  && detectSite('https://store.sunlu.com/products/sunlu-pla')?.id === 'sunlu_us'
  && detectSite('https://store.sunlu.com/fr/products/sunlu-pla')?.id === 'sunlu_fr'
  && detectSite('https://us.snapmaker.com/products/snapmaker-artisan')?.id === 'snapmaker_us'
  && detectSite('https://eu.snapmaker.com/fr/products/snapmaker-artisan')?.id === 'snapmaker_fr'
  && detectSite('https://overture3d.com/en-eu/products/overture-pla')?.id === 'overture_fr'
  && detectSite('https://eu.flashforge.com/fr/products/ad5x-3d-imprimante')?.id === 'flashforge_fr'
  && detectSite('https://store.landu3d.com/fr/products/matte-pla-filament')?.id === 'landu_fr'
  && detectSite('https://store.landu3d.com/products/landu-pla-filament')?.id === 'landu_us'
  && detectSite('https://siraya.tech/products/build-sonic-4k-resin')?.id === 'siraya_us'
  && detectSite('https://jayo3d.com/products/jayo-pla')?.id === 'jayo_us'
  && detectSite('https://eryone3d.com/products/matte-pla')?.id === 'eryone_us'
  && detectSite('https://eryone3d.com/fr/products/matte-pla')?.id === 'eryone_fr'
  && detectSite('https://iiidmax.com/products/iiid-max-classic-pla')?.id === 'iiidmax'
  && detectSite('https://store.inslogic3d.com/products/pla-pro-filament-1-75mm')?.id === 'inslogic_us'
  && detectSite('https://kingroon.com/products/kingroon-pla-pluspla')?.id === 'kingroon_us'
  && detectSite('https://store.inslogic3d.com/ja/products/spool-free-engineering-500g-sample')?.id === 'inslogic_jp'
  && detectSite('https://azurefilm.com/product/refill-unset-pla-wood-lumberlay-1-75mm/')?.id === 'azurefilm_eu'
  && detectSite('https://www.3dbooster.com/en/shop/qidi-tech-q1-pro-3d-printer/')?.id === '3dbooster_eu'
  && taramaAdaptersByMarket('fr').some(a => a.id === 'azurefilm_eu')
  && taramaAdaptersByMarket('fr').some(a => a.id === '3dbooster_eu')
  && detectSite('https://3dprintersdepot.com/en-jp/products/flashforge-creator-5-3d-printer')?.id === '3dprintersdepot_jp'
  && detectSite('https://www.prusa3d.com/product/prusament-pla-prusa-galaxy-black-1kg/')?.id === 'prusa_us'
  && detectSite('https://www.prusa3d.com/fr/produit/prusament-pla-prusa-galaxy-black-1kg/')?.id === 'prusa_fr'
  && detectSite('https://www.prusa3d.com/ja/product/prusament-pla-prusa-galaxy-black-1kg/')?.id === 'prusa_ja'
  && detectSite('https://store.micro-swiss.com/products/ng-extruder')?.id === 'microswiss'
  && detectSite('https://francofil.fr/product/pla-vert-irise-paillete/')?.id === 'francofil'
  && detectSite('https://www.arianeplast.com/fr/pla-format-1-kg/100-pla-noir.html')?.id === 'arianeplast'
  && detectSite('https://www.dasfilament.de/produkt/pla-filament')?.id === 'dasfilament_eu'
  && detectSite('https://skhonpo.com/products/bambu-lab')?.id === 'skhonpo_jp');

const dtUrunUrlKontrol = [
  ['polymaker_us', 'https://shop.polymaker.com/products/polylite-pla'],
  ['overture_fr', 'https://overture3d.com/en-eu/products/overture-pla'],
  ['flashforge_fr', 'https://eu.flashforge.com/fr/products/ad5x-3d-imprimante'],
  ['3dprintersdepot_jp', 'https://3dprintersdepot.com/en-jp/products/flashforge-creator-5-3d-printer'],
  ['prusa_us', 'https://www.prusa3d.com/product/prusament-pla-prusa-galaxy-black-1kg/'],
  ['prusa_fr', 'https://www.prusa3d.com/fr/produit/prusament-pla-prusa-galaxy-black-1kg/'],
  ['prusa_ja', 'https://www.prusa3d.com/ja/product/prusament-pla-prusa-galaxy-black-1kg/'],
  ['francofil', 'https://francofil.fr/product/pla-vert-irise-paillete/'],
  ['arianeplast', 'https://www.arianeplast.com/fr/pla-format-1-kg/100-pla-noir.html'],
  ['skhonpo_jp', 'https://skhonpo.com/products/bambu-lab'],
];
kontrol('Global adaptörler kendi ürün URL\'lerini (isProductUrl) ve para birimlerini doğrular',
  dtUrunUrlKontrol.every(([id, u]) => adapterById(id)?.isProductUrl(new URL(u))));

const hedefler = katalogHedefleri();
kontrol('katalogHedefleri global Shopify & WooCommerce hedeflerini USD/EUR/JPY ile içerir',
  globalKatalogHedefleri.length >= 40
  && hedefler.some(h => h.siteId === 'polymaker_us' && h.paraBirimi === 'USD')
  && hedefler.some(h => h.siteId === 'francofil' && h.paraBirimi === 'EUR')
  && hedefler.some(h => h.siteId === 'skhonpo_jp' && h.paraBirimi === 'JPY'));

console.log('\n13) 🌍 Canlı arama, Slicer & Maliyet araç yerelleştirme kontrolleri:');
const enSlicerHtml = globalAracSayfasiBul('/en/slicer')?.olustur('https://baskihesap.tech') || '';
const frSlicerHtml = globalAracSayfasiBul('/fr/slicer')?.olustur('https://baskihesap.tech') || '';
const jaSlicerHtml = globalAracSayfasiBul('/ja/slicer')?.olustur('https://baskihesap.tech') || '';
kontrol('EN/FR/JA Slicer form etiketleri Türkçe (Malzeme / Gramaj (g)) kalmaz',
  /<label>\s*Material\s/.test(enSlicerHtml) && /<label>\s*Weight \(g\)/.test(enSlicerHtml)
  && /<label>\s*Matériau\s/.test(frSlicerHtml) && /<label>\s*Poids \(g\)/.test(frSlicerHtml)
  && /<label>\s*素材\s/.test(jaSlicerHtml) && /<label>\s*重量 \(g\)/.test(jaSlicerHtml)
  && !/<label>\s*Malzeme\s/.test(enSlicerHtml + frSlicerHtml + jaSlicerHtml)
  && !/Gramaj \(g\)/.test(enSlicerHtml + frSlicerHtml + jaSlicerHtml));

const enMalHtml = globalAracSayfasiBul('/en/cost-calculator')?.olustur('https://baskihesap.tech') || '';
const frMalHtml = globalAracSayfasiBul('/fr/calculateur-cout')?.olustur('https://baskihesap.tech') || '';
const jaMalHtml = globalAracSayfasiBul('/ja/cost-calculator')?.olustur('https://baskihesap.tech') || '';
kontrol('EN/FR/JA Maliyet süre tahmin butonu yerelleşir (Tahmin et kalmaz)',
  enMalHtml.includes('>✨ Estimate</button>')
  && frMalHtml.includes('>✨ Estimer</button>')
  && jaMalHtml.includes('>✨ 自動推定</button>')
  && !/Tahmin et/.test(enMalHtml + frMalHtml + jaMalHtml));

const appJsKod = fs.readFileSync('public/app.js', 'utf8');
const i18nJsKod = fs.readFileSync('public/i18n-global.js', 'utf8');
kontrol('app.js canlı ilerleme, iptal, renk ve baskı widget\'ı DIL_KOPYA_YEREL üzerinden yerelleşir',
  appJsKod.includes('DIL_KOPYA_YEREL.modBasladi')
  && appJsKod.includes('DIL_KOPYA_YEREL.iptal')
  && appJsKod.includes('DIL_KOPYA_YEREL.fazTara')
  && appJsKod.includes('DIL_KOPYA_YEREL.baskiBaslik')
  && appJsKod.includes('DIL_KOPYA_YEREL.baskiAria')
  && appJsKod.includes('DIL_KOPYA_YEREL.istekBirimi')
  && appJsKod.includes('renkYerellestir(p.color)')
  && appJsKod.includes("'/api/dogrulanmis-magazalar' + dil"));
kontrol('i18n-global.js ve server.js rozet/istek kurallarını kapsar',
  i18nJsKod.includes('Official Manufacturer')
  && i18nJsKod.includes('istek\\b')
  && fs.readFileSync('server.js', 'utf8').includes('dogrulanmisRozetYerellestir'));
const styleCssKod = fs.readFileSync('public/style.css', 'utf8');
kontrol('.hero h1 b mobilde yatay taşma/kesilme yapmaz (white-space: nowrap yok)',
  !/\.hero h1 b\s*\{[^}]*white-space:\s*nowrap/i.test(styleCssKod)
  && /\.hero h1\s*\{[^}]*overflow-wrap:\s*break-word/s.test(styleCssKod));

console.log('\n14) 🗂️ Katalog kategori sınıflandırma doğrulaması (EN / JA yazıcı vs parça & sarf):');
{
  const db = dbBaglantisi();
  const simdi = Date.now();
  const eklenenIdler = [];
  try {
    const ins = db.prepare(`
      INSERT INTO katalog_urunleri
        (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta, gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
      VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?, 'test-kat', ?)
    `);
    const ornekler = [
      ['creality_us', 'https://store.creality.com/products/test-landu-spray', 'LANDU 3D Printer Bed Adhesion Spray 120ml', 'landu 3d printer bed adhesion spray 120ml', 'LANDU', 13.95, 'USD'],
      ['creality_us', 'https://store.creality.com/products/test-ams-lite', 'Bambu Lab AMS Lite', 'bambu lab ams lite', 'Bambu Lab', 199.99, 'USD'],
      ['creality_us', 'https://store.creality.com/products/test-a1-mini-printer', 'Bambu Lab A1 Mini 3D Printer', 'bambu lab a1 mini 3d printer', 'Bambu Lab', 219.00, 'USD'],
      ['creality_us', 'https://store.creality.com/products/test-p1s-combo', 'Bambu Lab P1S Combo 3D Printer', 'bambu lab p1s combo 3d printer', 'Bambu Lab', 849.00, 'USD'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-mc-board', 'Bambu Lab P1S MCボード', 'bambu lab p1s mc board', 'Bambu Lab', 6800, 'JPY'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-th-board', 'Bambu Lab X1C THボード', 'bambu lab x1c th board', 'Bambu Lab', 7500, 'JPY'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-x-assembly', 'Bambu Lab A1 X軸アセンブリ', 'bambu lab a1 x axis assembly', 'Bambu Lab', 15800, 'JPY'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-front-door', 'Bambu Lab X1C フロントドア', 'bambu lab x1c front door', 'Bambu Lab', 8900, 'JPY'],
      ['creality_jp', 'https://store.creality.com/jp/products/test-jp-printer', 'Bambu Lab P1S 3Dプリンター', 'bambu lab p1s 3d printer', 'Bambu Lab', 99800, 'JPY'],
    ];
    for (const [siteId, url, baslik, temiz, marka, fiyat, para] of ornekler) {
      eklenenIdler.push(ins.run(siteId, url, baslik, temiz, marka, fiyat, para, simdi).lastInsertRowid);
    }

    const usListe = seoUrunListesi({ taze: true, market: 'us' });
    const jpListe = seoUrunListesi({ taze: true, market: 'jp' });

    const usSpray = usListe.find(u => u.ad.includes('Adhesion Spray 120ml'));
    const usAmsLite = usListe.find(u => u.ad === 'Bambu Lab AMS Lite');
    const usA1Mini = usListe.find(u => u.ad === 'Bambu Lab A1 Mini 3D Printer');
    const usP1sCombo = usListe.find(u => u.ad === 'Bambu Lab P1S Combo 3D Printer');

    kontrol('EN: Adhesion Spray 120ml recine-ve-sarf kategorisine gider (3d-yazici değil)',
      usSpray?.kategoriSlug === 'recine-ve-sarf', JSON.stringify(usSpray));
    kontrol('EN: Bağımsız AMS Lite yedek parça kategorisine gider, P1S Combo yazıcı kalır',
      usAmsLite?.kategoriSlug === '3d-yazici-yedek-parca'
      && usA1Mini?.kategoriSlug === '3d-yazici'
      && usP1sCombo?.kategoriSlug === '3d-yazici',
      JSON.stringify({ ams: usAmsLite?.kategoriSlug, a1: usA1Mini?.kategoriSlug, combo: usP1sCombo?.kategoriSlug }));

    const jpMc = jpListe.find(u => u.ad.includes('MCボード'));
    const jpTh = jpListe.find(u => u.ad.includes('THボード'));
    const jpX = jpListe.find(u => u.ad.includes('X軸アセンブリ'));
    const jpDoor = jpListe.find(u => u.ad.includes('フロントドア'));
    const jpYazici = jpListe.find(u => u.ad === 'Bambu Lab P1S 3Dプリンター');

    kontrol('JA: MCボード/THボード/X軸アセンブリ/フロントドア yedek parça olur, gerçek 3Dプリンター yazıcı kalır',
      jpMc?.kategoriSlug === '3d-yazici-yedek-parca'
      && jpTh?.kategoriSlug === '3d-yazici-yedek-parca'
      && jpX?.kategoriSlug === '3d-yazici-yedek-parca'
      && jpDoor?.kategoriSlug === '3d-yazici-yedek-parca'
      && jpYazici?.kategoriSlug === '3d-yazici',
      JSON.stringify({ mc: jpMc?.kategoriSlug, th: jpTh?.kategoriSlug, x: jpX?.kategoriSlug, door: jpDoor?.kategoriSlug, y: jpYazici?.kategoriSlug }));
  } finally {
    if (eklenenIdler.length) {
      db.prepare(`DELETE FROM katalog_urunleri WHERE id IN (${eklenenIdler.map(() => '?').join(',')})`).run(...eklenenIdler);
    }
    closeDatabase();
  }
}

console.log('\n──────────────────────────────────────────────');
console.log(`Sonuç: ${gecen}/${gecen + kalan} kontrol geçti`);
if (kalan > 0) process.exit(1);
