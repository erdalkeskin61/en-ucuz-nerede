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
  globalAracSayfasiBul, globalAracSitemapKayitlari, globalKategoriSitemapKayitlari, globalAracAlternatifHaritasi,
} from '../src/globalAracSayfalar.js';
import {
  seoUrunListesi, urunSayfasiHtml, sayfaIskeleti, globalKatalogDiziniHtml,
  globalKategoriSayfasiHtml, kategoriSayfasiHtml, SEO_KATEGORILER,
  kategoriYoluGetir, globalKategoriSlugCoz,
} from '../src/seoSayfalar.js';
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
  && serverKaynak.includes('taramaAdaptersByMarket(hamPazar)'));

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
  && detectSite('https://eu.snapmaker.com/products/snapmaker-artisan')?.id === 'snapmaker_eu'
  && detectSite('https://store.heygears.com/products/ultracraft-reflex-rs-3d-printer')?.id === 'heygears_us'
  && detectSite('https://overture3d.com/en-eu/products/overture-pla')?.id === 'overture_fr'
  && detectSite('https://eu.flashforge.com/fr/products/ad5x-3d-imprimante')?.id === 'flashforge_fr'
  && detectSite('https://store.landu3d.com/fr/products/matte-pla-filament')?.id === 'landu_fr'
  && detectSite('https://store.landu3d.com/products/landu-pla-filament')?.id === 'landu_us'
  && detectSite('https://siraya.tech/products/build-sonic-4k-resin')?.id === 'siraya_us'
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
  enMalHtml.includes('>Estimate</button>')
  && frMalHtml.includes('>Estimer</button>')
  && jaMalHtml.includes('>自動推定</button>')
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
  }
}

console.log('\n15) 📖 Rehber kartı rozet eşleştirme doğruluğu (/en/guides):');
{
  const sahteUrunler = [
    { ad: 'Bambu Lab AMS HT', kategori: 'genel', kategoriSlug: '3d-yazici-yedek-parca', enUcuzFiyat: 199.99, paraBirimi: 'USD', enUcuzSite: 'Bambu Lab US' },
    { ad: 'Creality Ender 5 Max', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 749.00, paraBirimi: 'USD', enUcuzSite: 'Creality Store' },
    { ad: 'Creality K1C 3D Printer', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 499.00, paraBirimi: 'USD', enUcuzSite: 'Creality Store' },
    { ad: 'Polymaker PLA Filament 1kg', kategori: 'filament', kategoriSlug: 'pla-filament', enUcuzFiyat: 19.99, paraBirimi: 'USD', enUcuzSite: 'Polymaker US' },
  ];
  const guidesHtml = globalRehberDiziniHtml('en', 'https://baskihesap.tech', sahteUrunler);
  kontrol('P1S/A1 Mini/Budget rehber kartlarında ilgisiz "Bambu Lab AMS HT" rozeti çıkmaz',
    !guidesHtml.includes('Bambu Lab AMS HT'),
    'Bambu Lab AMS HT sızdı');
  kontrol('V3 KE/Cost rehber kartlarında ilgisiz "Creality Ender 5 Max" rozeti çıkmaz',
    !guidesHtml.includes('Creality Ender 5 Max'),
    'Creality Ender 5 Max sızdı');
  kontrol('P1S vs K1C kartı urunB olan "Creality K1C 3D Printer" ile eşleşir ve cost kartı PLA filament gösterir',
    guidesHtml.includes('Creality K1C 3D Printer') && guidesHtml.includes('Polymaker PLA Filament 1kg'));
}

console.log('\n16) ♿ Erişilebilirlik (aria-selected & aria-busy) kontrolleri (/en /fr /ja):');
for (const yol of ['/en', '/fr', '/ja']) {
  const anaHtml = globalAracSayfasiBul(yol)?.olustur('https://baskihesap.tech') || '';
  const modBolumu = (anaHtml.match(/<div class="arama-modu"[\s\S]*?<\/div>/) || [''])[0];
  const trueSayisi = (modBolumu.match(/aria-selected="true"/g) || []).length;
  const falseSayisi = (modBolumu.match(/aria-selected="false"/g) || []).length;
  kontrol(`${yol}: 3 arama sekmesinde tam 1 aria-selected="true" ve 2 aria-selected="false" var`,
    trueSayisi === 1 && falseSayisi === 2,
    `true=${trueSayisi}, false=${falseSayisi}`);
  kontrol(`${yol}: vitrinGrid aria-busy="true" takılı kalmaz ve Arama modu etiketi yerelleşir`,
    !anaHtml.includes('id="vitrinGrid" class="vitrin-grid" aria-busy="true"')
    && !anaHtml.includes('aria-label="Arama modu"'));
}
kontrol('app.js vitrinYukle yükleme & hata sonunda aria-busy=false yapar ve modAyarla ilk yüklemede çalışır',
  (appJsKod.match(/async function vitrinYukle[\s\S]*?\n\}/)?.[0].match(/setAttribute\('aria-busy',\s*'false'\)/g) || []).length >= 2
  && /modAyarla\(aramaModu\)/.test(appJsKod));

console.log('\n17) 🏷️ Placeholder, aria-label ve % biçimi yerelleştirme kontrolleri:');
for (const yol of ['/en', '/fr', '/ja', '/en/cost-calculator', '/fr/calculateur-cout', '/ja/cost-calculator', '/en/basket', '/en/slicer', '/en/alerts']) {
  const html = globalAracSayfasiBul(yol)?.olustur('https://baskihesap.tech') || '';
  const nitelikler = [...html.matchAll(/(?:aria-label|placeholder)="([^"]*)"/g)].map(m => m[1]);
  const turkceSizan = nitelikler.filter(n => /[ğıöşüĞİÖŞÜ]|\b(ör\.|Örn\.|Bölge|Arama modu|Kâr|Hızlı site|Sürükle)\b/.test(n));
  kontrol(`${yol}: hiçbir aria-label veya placeholder Türkçe karakter taşımaz`,
    turkceSizan.length === 0, JSON.stringify(turkceSizan));
}
kontrol('maliyet.js % önekini yalnızca tr için kullanır (yuzdeMetni)',
  fs.readFileSync('public/maliyet.js', 'utf8').includes('const yuzdeMetni =')
  && globalAracSayfasiBul('/en/cost-calculator')?.olustur('https://baskihesap.tech').includes('>150% · 2.5x<')
  && globalAracSayfasiBul('/fr/calculateur-cout')?.olustur('https://baskihesap.tech').includes('>150 % · 2,5x<'));

console.log('\n18) 🔗 Yerelleştirilmiş kategori URL slug\'ları, canonical/hreflang ve 301 yönlendirme:');
kontrol('kategoriYoluGetir doğru yerel slug döndürür (TR/EN/FR/JA)',
  kategoriYoluGetir('3d-yazici', 'en') === '/en/category/3d-printers'
  && kategoriYoluGetir('recine-ve-sarf', 'en') === '/en/category/resin-and-dryers'
  && kategoriYoluGetir('3d-yazici', 'fr') === '/fr/categorie/imprimantes-3d'
  && kategoriYoluGetir('3d-yazici', 'ja') === '/ja/category/3d-printers'
  && kategoriYoluGetir('3d-yazici', 'tr') === '/kategori/3d-yazici');

const cozumEnYeni = globalKategoriSlugCoz('3d-printers', 'en');
const cozumEnEski = globalKategoriSlugCoz('3d-yazici', 'en');
const cozumEnSarfEski = globalKategoriSlugCoz('recine-ve-sarf', 'en');
const cozumFrEski = globalKategoriSlugCoz('3d-yazici', 'fr');
const cozumJaEski = globalKategoriSlugCoz('3d-yazici', 'ja');
kontrol('globalKategoriSlugCoz yeni slugları doğrudan çözer, eski Türkçe sluglarda 301 canonicalYol verir',
  cozumEnYeni?.yonlendir === false && cozumEnYeni?.kat?.slug === '3d-yazici'
  && cozumEnEski?.yonlendir === true && cozumEnEski?.canonicalYol === '/en/category/3d-printers'
  && cozumEnSarfEski?.yonlendir === true && cozumEnSarfEski?.canonicalYol === '/en/category/resin-and-dryers'
  && cozumFrEski?.yonlendir === true && cozumFrEski?.canonicalYol === '/fr/categorie/imprimantes-3d'
  && cozumJaEski?.yonlendir === true && cozumJaEski?.canonicalYol === '/ja/category/3d-printers');

const yaziciKat = SEO_KATEGORILER.find(c => c.slug === '3d-yazici');
const enKatSayfa = globalKategoriSayfasiHtml('en', yaziciKat, [], 'https://baskihesap.tech');
const frKatSayfa = globalKategoriSayfasiHtml('fr', yaziciKat, [], 'https://baskihesap.tech');
const trKatSayfa = kategoriSayfasiHtml(yaziciKat, [], 'https://baskihesap.tech');
kontrol('EN/FR kategori sayfalarında ve TR hreflang etiketlerinde Türkçe slug kalıntısı yoktur',
  enKatSayfa.includes('href="https://baskihesap.tech/en/category/3d-printers"')
  && enKatSayfa.includes('href="/en/category/resin-and-dryers"')
  && !/\/(en|ja)\/category\/(3d-yazici|3d-yazici-yedek-parca|recine-ve-sarf)\b/.test(enKatSayfa + frKatSayfa)
  && !/\/fr\/categorie\/(3d-yazici|3d-yazici-yedek-parca|recine-ve-sarf)\b/.test(frKatSayfa)
  && trKatSayfa.includes('href="https://baskihesap.tech/fr/categorie/imprimantes-3d"')
  && trKatSayfa.includes('href="https://baskihesap.tech/en/category/3d-printers"'));

const enAnaLinkHtml = globalAracSayfasiBul('/en')?.olustur('https://baskihesap.tech') || '';
kontrol('EN ana sayfa, katalog, footer-hub ve sitemap yeni yerel kategori sluglarını kullanır',
  enAnaLinkHtml.includes('/en/category/3d-printers')
  && enAnaLinkHtml.includes('/en/category/resin-and-dryers')
  && !/\/en\/category\/(3d-yazici|recine-ve-sarf)\b/.test(enAnaLinkHtml)
  && globalKategoriSitemapKayitlari('en').some(s => s.yol === '/en/category/3d-printers')
  && globalKategoriSitemapKayitlari('fr').some(s => s.yol === '/fr/categorie/imprimantes-3d'));
kontrol('server.js eski kategori slugları için res.redirect(301, ...) bağlar',
  fs.readFileSync('server.js', 'utf8').includes('globalKategoriSlugCoz(req.params.slug, dil)')
  && fs.readFileSync('server.js', 'utf8').includes('return res.redirect(301, cozum.canonicalYol);'));

console.log('\n19) 🔍 Footer metni, hızlı mod mağaza sayısı & geçmiş temizliği:');
const enSoz = sozlukGetir('en');
kontrol('EN sözlükte "Scan Live Prices Now" yerine "Find Prices" kullanılır',
  enSoz.buton.canliTara === 'Find Prices'
  && !enSoz.baslik.footerNot.includes('Scan Live Prices Now')
  && enSoz.baslik.footerNot.includes('Find Prices'));
const usMagazaSay = taramaAdaptersByMarket('us').length;
kontrol('/en hızlı sepet etiketi gerçek bölgesel mağaza sayısını yazar ve market=us iletir',
  enAnaLinkHtml.includes(`Fast mode (${usMagazaSay} stores)`)
  && !enAnaLinkHtml.includes('Fast mode (30 sites)')
  && appJsKod.includes('market: BASKI_ORTAM.market'));
const srvKod = fs.readFileSync('server.js', 'utf8');
kontrol('server.js /api/history 3D dışı (tablo/pil) ve Avustralya (.com.au / /en-au) kayıtlarını filtreler',
  srvKod.includes('function gecmisKaydiGecerliMi(')
  && srvKod.includes('GECMIS_UCD_RE')
  && srvKod.includes('GECMIS_AU_RE'));

console.log('\n20) 🌐 Canlı Arama Sonuçları, Stok Yok, Fiyat Trendi & Kartlar (TR/EN/FR/JA):');
const i18nGlobalKod = fs.readFileSync('public/i18n-global.js', 'utf8');
const canliBlokMatch = appJsKod.match(/const CANLI_SOZLUK = \{[\s\S]*?\nfunction zekaMesajYerellestir[\s\S]*?\n\}/);
kontrol('app.js CANLI_SOZLUK ve yerelleştirme yardımcıları tanımlı', !!canliBlokMatch);

if (canliBlokMatch) {
  const yerellestirmeKod = canliBlokMatch[0];
  const ctxTr = vm.runInNewContext(`const BASKI_ORTAM = { dil: 'tr' }; ${yerellestirmeKod}; ({ CANLI_SOZLUK, CANLI_YEREL, yuzdeStr, imzaliYuzde, baskiNedenYerellestir, baskiRozetYerellestir, magazaDurumNedeniYerellestir, trendTavsiyeYerellestir, zekaMesajYerellestir })`);
  const trKeys = Object.keys(ctxTr.CANLI_SOZLUK.tr).sort();
  for (const dil of ['en', 'fr', 'ja']) {
    const k = Object.keys(ctxTr.CANLI_SOZLUK[dil] || {}).sort();
    kontrol(`CANLI_SOZLUK.${dil} tüm anahtarlara sahip`, JSON.stringify(trKeys) === JSON.stringify(k));
    const ctxDil = vm.runInNewContext(`const BASKI_ORTAM = { dil: '${dil}' }; ${yerellestirmeKod}; ({ CANLI_YEREL, yuzdeStr, imzaliYuzde, baskiNedenYerellestir, baskiRozetYerellestir, magazaDurumNedeniYerellestir, trendTavsiyeYerellestir, zekaMesajYerellestir })`);
    const y = ctxDil.CANLI_YEREL;
    const tumDegerler = Object.entries(y).map(([kn, val]) => {
      if (typeof val === 'function') {
        try { return `${kn}:${String(val(2, 3, 1, 4))}`; } catch { return ''; }
      }
      if (val && typeof val === 'object') return JSON.stringify(val);
      return `${kn}:${String(val)}`;
    }).join(' | ');
    const sizinti = tumDegerler.match(/(Mağaza Hazır|Tüm Mağazalarda|Stok Yok|Muadili ara|Muadil ürün|Fiyat dağılımı|Fiyat trendi|Veri Az|Tükendi|Fiyat Alarmı|Sepete Ekle|Sitene Ekle|Mağazada Gör|Mağazaya Git|kaynak ürün|Hammadde:)/);
    kontrol(`CANLI_SOZLUK.${dil} Türkçe kalıntı içermez`, !sizinti, sizinti?.[0] || '');
    kontrol(`${dil}: yüzde, neden ve trend yardımcıları yerel metin döndürür`,
      (dil === 'fr' ? ctxDil.imzaliYuzde(0) === '0 %' : ctxDil.imzaliYuzde(0) === '0%')
      && !/Makara gramajı|başlıktan okunamadı/i.test(ctxDil.baskiNedenYerellestir('Makara gramajı başlıktan okunamadı (uydurma hesap yapılmaz).'))
      && !/Aramada hiç sonuç/i.test(ctxDil.magazaDurumNedeniYerellestir('Aramada hiç sonuç bulunamadı (Creality K1C)'))
      && !/Aday ürünler/i.test(ctxDil.magazaDurumNedeniYerellestir('Aday ürünler incelendi ancak aynı ürün bulunamadı'))
      && !/Arama sayfası okunamadı/i.test(ctxDil.magazaDurumNedeniYerellestir('Arama sayfası okunamadı: timeout'))
      && !/Yalnızca \d+ günlük/i.test(ctxDil.trendTavsiyeYerellestir({ gunSayisi: 2, diffFromAvg: 0 }, '📉 Yalnızca 2 günlük fiyat geçmişi var.'))
      && !/Ortalamadan/i.test(ctxDil.zekaMesajYerellestir('🟢 Ortalamadan %12 daha ucuz — almak için iyi zaman.', { ortalamaFarkYuzde: 12 })));
  }
  kontrol('TR modunda %0 biçimi ve Türkçe baskı mesajları korunur',
    ctxTr.imzaliYuzde(0) === '%0'
    && ctxTr.baskiNedenYerellestir('Makara gramajı başlıktan okunamadı (uydurma hesap yapılmaz).').includes('Makara gramajı'));
}

kontrol('app.js canlı rendering yollarında sabit Türkçe kalıntı kalmamıştır',
  !/Kalanı beklemeden bulunan sonuçları göster \(\$\{hazir\}/.test(appJsKod)
  && !/`🟢 Stokta Var \(\$\{stoktaVarSayisi\}\)`/.test(appJsKod)
  && !/`🔴 Stokta Yok \(\$\{stoktaYokSayisi\}\)`/.test(appJsKod)
  && !/<div[^>]*>⚠️ Tüm Mağazalarda Tükendi<\/div>/.test(appJsKod)
  && !/aria-label="Son \$\{gun\} gün fiyat trendi"/.test(appJsKod)
  && !/label:\s*"En Düşük Fiyat"/.test(appJsKod)
  && !/>🔔 Fiyat Alarmı<\/button>/.test(appJsKod)
  && !/>🧺 Sepete Ekle<\/button>/.test(appJsKod)
  && !/>🔌 Sitene Ekle<\/button>/.test(appJsKod)
  && i18nGlobalKod.includes('Son (\\d+) gün fiyat trendi'));

console.log('\n21) 🔄 Arka arkaya canlı aramalarda eski durumun temizlenmesi (stok yok / trend izolasyonu):');
kontrol('app.js yeni aramada sonucPanelleriniSifirla, AbortController ve istek sıra sayaçları kullanır',
  appJsKod.includes('function sonucPanelleriniSifirla()')
  && appJsKod.includes('sonucPanelleriniSifirla();')
  && appJsKod.includes('let fiyatGrafikIstekSeq = 0;')
  && appJsKod.includes('let muadilIstekSeq = 0;')
  && appJsKod.includes('let karsilastirmaIstekSeq = 0;')
  && appJsKod.includes('if (opts.canli === true || urunDegisti)')
  && appJsKod.includes('if (buMuadilIstek !== muadilIstekSeq || muadilAktifIs !== id) return;')
  && appJsKod.includes('if (err?.name === \'AbortError\' || istekId !== fiyatGrafikIstekSeq) return;'));

const sifirlaMatch = appJsKod.match(/function sonucPanelleriniSifirla\(\) \{[\s\S]*?\n\}/);
kontrol('sonucPanelleriniSifirla() tüm eski alt panelleri gizler, DOM içeriklerini temizler ve grafiği yok eder', !!sifirlaMatch);
if (sifirlaMatch) {
  let yokEdildi = false;
  const domMock = new Map([
    ['#sonucAlani', { hidden: false }],
    ['#bentoOzet', { hidden: false, innerHTML: '<div>Creality K1C</div>' }],
    ['#tasarrufVurguBanti', { hidden: false }],
    ['#tasarrufVurguTutar', { innerHTML: 'Save $50' }],
    ['#tasarrufVurguDetay', { textContent: 'old detail' }],
    ['#fiyatZekaAlani', { hidden: false }],
    ['#fiyatZekaIstatistik', { innerHTML: 'old' }],
    ['#fiyatZekaMesaj', { hidden: false, textContent: 'old' }],
    ['#fiyatZekaBarDolgu', { style: { width: '75%' } }],
    ['#birimAlani', { hidden: false }],
    ['#birimIcerik', { innerHTML: 'old' }],
    ['#nedenUcuzAlani', { hidden: false }],
    ['#nedenUcuzMetin', { textContent: 'old' }],
    ['#muadilAlani', { hidden: false }],
    ['#muadilIcerik', { innerHTML: '<div>old muadil</div>' }],
    ['#muadilBaslik', { textContent: 'This product is out of stock' }],
    ['#muadilAciklama', { textContent: 'All 1 stores appear out of stock' }],
    ['#muadilYenileBtn', { disabled: true }],
    ['#fiyatGecmisiAlani', { hidden: false }],
    ['#fiyatGecmisNotu', { hidden: false, textContent: 'old trend note' }],
    ['#fiyatTrendOzetMetin', { textContent: 'Last 30 days' }],
    ['#fiyatTavsiyeRozeti', { textContent: '🔥 At Lowest Level' }],
    ['#istatistikEnDusuk', { textContent: '$499.00' }],
    ['#istatistikOrtalama', { textContent: '$499.00' }],
    ['#istatistikEnYuksek', { textContent: '$499.00' }],
    ['#istatistikFark', { textContent: 'At average' }],
    ['#istatistikIndirimOrani', { textContent: '0%' }],
    ['#filtreBar', { hidden: false }],
    ['#capFiltreleri', { innerHTML: 'old' }],
    ['#hammaddeFiltreleri', { innerHTML: 'old' }],
    ['#kartlar', { innerHTML: '<div class="urun-karti">Creality K1C</div>' }],
    ['#ozetTablo tbody', { innerHTML: '<tr><td>old</td></tr>' }],
    ['#kaynakBaslik', { textContent: 'Creality K1C' }],
    ['#kaynakBilgi', { innerHTML: 'old' }],
    ['#ozetKutu', { innerHTML: '$499.00' }],
  ]);
  let aborted = false;
  let muadilCancelled = false;
  const ctxSim = vm.runInNewContext(`
    let fiyatGrafikIstekSeq = 0;
    let fiyatGrafikAbortCtrl = { abort() { aborted = true; } };
    let muadilIstekSeq = 0;
    let muadilSonuc = { kaynak: { urun: 'Creality K1C' } };
    let chartInstance = { destroy() { yokEdildi = true; } };
    let sonTimeline = [1, 2];
    let sonBentoSeri = [1, 2];
    let sonBentoVerisi = { enUcuz: {} };
    let lastAppFingerprint = 'fp1';
    let muhurYasi = '5m ago';
    let sonSonuc = { kaynak: { urun: 'Creality K1C' } };
    let sonCizilenUrunAnahtari = 'creality_us|Creality K1C';
    function muadilIptalEt() { muadilCancelled = true; muadilIstekSeq++; }
    function $(s) { return domMock.get(s) || null; }
    ${sifirlaMatch[0]}
    sonucPanelleriniSifirla();
    ({ fiyatGrafikIstekSeq, muadilIstekSeq, aborted, muadilCancelled, yokEdildi, sonSonuc, sonTimeline, sonBentoSeri, chartInstance, sonCizilenUrunAnahtari });
  `, { domMock, aborted: false, muadilCancelled: false, yokEdildi: false });

  kontrol('Arka arkaya arama başlangıcında K1C $499 trend, muadil, kartlar ve chart temizlenir',
    domMock.get('#muadilAlani').hidden === true
    && domMock.get('#muadilBaslik').textContent === ''
    && domMock.get('#muadilIcerik').innerHTML === ''
    && domMock.get('#fiyatGecmisiAlani').hidden === true
    && domMock.get('#istatistikEnDusuk').textContent === '—'
    && domMock.get('#kartlar').innerHTML === ''
    && domMock.get('#sonucAlani').hidden === true
    && ctxSim.fiyatGrafikIstekSeq === 1
    && ctxSim.muadilIstekSeq === 1
    && ctxSim.sonSonuc === null
    && ctxSim.sonCizilenUrunAnahtari === ''
    && ctxSim.chartInstance === null);
}

console.log('\n22) 🖨️ 3D Yazıcı kategorisi EN/FR/JA yazıcı dışı ürün temizliği:');
{
  const { anaKategoriSlugBul } = await import('../src/seoSayfalar.js');
  const yaziciOlmamali = [
    // EN
    'AMS Lite Multi-Color Automated Material System for Bambu Labs A1 and A1 Mini 3D Printers',
    'CreatBot Buildtak for the CreatBot F430 3D Printer',
    'CreatBot Servo for Auto Leveling for CreatBot F1000 3D Printer',
    'CreatBot High-speed Upgrade Kit for CreatBot D600 Pro 2 3D Printer',
    'CreatBot Water Pump for CreatBot PEEK-250 3D Printer',
    'CreatBot Whole Platform for CreatBot F430 NX 3D Printer',
    'CreatBot Glass Print Bed for CreatBot F160-PEEK 3D Printer',
    'BIQU Beginner-Friendly Upgrade Accessories Combo for Bambu Lab Printers',
    'BIQU × FOXLT Infinity Bed P1/P2 for Bambu Lab P1P/P1S/P2S',
    'BIQU Panda Exoskeleton All-Metal Construction for Bambu Lab P2S/P1S/P1P/X1C/X1E',
    'Bondtech LGX Lite Pro Accessories for Creality K1/K1C/Max',
    'eufyMake Ink and Cleaning Cartridge Kit for UV Printer E1',
    'xTool Screen Printer: 1st Screen Printing Solution with Laser',
    'SainSmart Holiday Machine Vault, Only $99 unlock a laser engraver or 3D printer or CNC router',
    'MOG and MOG Lite Massive 3D Printer Project RC Overland Truck (4x4 and 6x6 Compatible)',
    // FR
    'Bambu Lab - X1E - Panneau latéral gauche (Left Sidepanel)',
    'Bambu Lab - X1E - Panneau latéral droit (Right Sidepanel)',
    'xTool - O1 Omni Printer - Laminateur LM1 (LM1 Laminator)',
    'xTool - O1 Omni Printer - Module Rotatif OR1 (OR1 Rotary Attachment)',
    'xTool - O1 Omni Printer Standard - Simple Tête UV (Single UV) - Imprimante UV 4-en-1',
    'Formlabs Fuse 1+ 30W Printer Uptime Kit',
    'Bambu Lab - A2L - Combo Complet de Découpe (Cutting Upgrade Set)',
    // JA
    'Halot Mage Sプリントスクリーン',
    'UW-03 3Dプリンター用洗浄硬化機',
    'Bambu Lab E1 空気清浄機（3Dプリンター用）',
    'Bambu Lab Bambu Station L（H3C・H2シリーズ用プリンタースタンド）',
    'OrangeStorm Giga 四エクストルージョン | アップグレードキット',
    'CANVAS｜Centauri 2 シリーズ専用',
    'xTool Apparel Printer',
  ];
  const sizanlar = yaziciOlmamali.filter(ad => anaKategoriSlugBul({ ad, sorgu: ad, kategori: 'genel' }) === '3d-yazici');
  kontrol('Hiçbir aksesuar/kit/panel/yıkama/temizleyici/RC/UV kalem 3d-yazici kategorisine düşmez',
    sizanlar.length === 0, JSON.stringify(sizanlar));

  const yaziciKalmali = [
    'Bambu Lab P1S Combo 3D Printer',
    'Bambu Lab A1 Mini 3D Printer',
    'LDO Voron Trident 300 Cube 3D Printer Kit (Rev. D)',
    'Flashforge AD5X Multicolor Core XY 3D Printer',
    'BIQU Hurakan Klipper 3D Printer',
    'Elegoo Mars 5 Ultra: Ultra-High-Resolution 9K MSLA 3D Printing',
    'Anycubic Kobra 3 Max V2 Combo',
    'Creality K2 Plus FDM 3Dプリンター',
    'Saturn 4 Ultra 16K・Marsmate 空気清浄機 セット',
    'Mars 5 with Mercury Plus V3.0 Bundle',
  ];
  const kayanlar = yaziciKalmali.filter(ad => anaKategoriSlugBul({ ad, sorgu: ad, kategori: 'genel' }) !== '3d-yazici');
  kontrol('Gerçek 3D yazıcılar ve yazıcı+combo/set paketleri 3d-yazici kategorisinde kalır',
    kayanlar.length === 0, JSON.stringify(kayanlar));

  // Canlı yerel katalog çıktısında da bu kalıntıların hiçbiri 3d-yazici içinde yer almaz
  const sizintiDeseni = /(ams lite|buildtak|for auto leveling|upgrade kit|upgrade accessories combo|lgx lite pro accessories|cleaning cartridge kit|screen printer|holiday machine vault|rc overland truck|panneau lat[ée]ral|laminateur lm1|module rotatif|uptime kit|プリントスクリーン|洗浄硬化機|e1 空気清浄機|プリンタースタンド|アップグレードキット|シリーズ専用|apparel printer)/i;
  for (const m of ['us', 'fr', 'jp']) {
    const dbYazicilar = seoUrunListesi({ taze: true, market: m }).filter(u => u.kategoriSlug === '3d-yazici');
    const dbSizan = dbYazicilar.filter(u => sizintiDeseni.test(u.ad)).map(u => u.ad);
    kontrol(`${m.toUpperCase()} seoUrunListesi(3d-yazici) hiçbir yazıcı dışı kalem içermez (toplam ${dbYazicilar.length})`,
      dbSizan.length === 0, JSON.stringify(dbSizan));
  }
}

console.log('\n23) 🧮 Maliyet Hesaplayıcı yuvarlama tutarlılığı, metin temizliği & bölge kilidi filtresi:');
{
  const maliyetJsKod = fs.readFileSync('public/maliyet.js', 'utf8');
  kontrol('maliyet.js paraYuvarla ile kalemleri ve satış fiyatlarını para birimi hassasiyetine göre yuvarlar',
    maliyetJsKod.includes('const BASAMAK = ORTAM_PARA === \'JPY\' ? 0 : 2;')
    && maliyetJsKod.includes('const net = paraYuvarla(hammadde + elektrik + amortisman);')
    && maliyetJsKod.includes('malzemeYerel(f.malzeme)')
    && maliyetJsKod.includes('renkYerel(f.renk)'));

  const calcSim = (paraKod, tlKg, g, sure, guc, kwhTl, yipranma, karCarpani) => {
    const basamak = paraKod === 'JPY' ? 0 : 2;
    const mult = 10 ** basamak;
    const round = (x) => Math.round((Number(x) || 0) * mult) / mult;
    const kwh = (guc * sure) / 1000;
    const hammadde = round((g / 1000) * tlKg);
    const elektrik = round(kwh * kwhTl);
    const amortisman = round(sure * yipranma);
    const net = round(hammadde + elektrik + amortisman);
    const x2 = round(net * 2);
    const x3 = round(net * 3);
    const sec = round(net * karCarpani);
    return { hammadde, elektrik, amortisman, net, x2, x3, sec, kar: round(sec - net) };
  };

  const jp = calcSim('JPY', 2800, 160, 4, 150, 31, 40, 2);
  kontrol('JA JPY ¥2,800/kg: 448+19+160=627, 2×=1254 (+627), 3×=1881',
    jp.hammadde === 448 && jp.elektrik === 19 && jp.amortisman === 160
    && jp.net === 627 && jp.x2 === 1254 && jp.x3 === 1881 && jp.kar === 627,
    JSON.stringify(jp));

  const us = calcSim('USD', 0.60, 160, 4, 150, 0.16, 0.25, 2);
  kontrol('EN USD $0.60/kg: 0.10+0.10+1.00=1.20 (kalem toplamı = net, $0.01 sapma yok)',
    us.hammadde === 0.10 && us.elektrik === 0.10 && us.amortisman === 1.00
    && us.net === 1.20 && us.x2 === 2.40,
    JSON.stringify(us));

  for (const [yol, beklenenEtiket] of [
    ['/en/cost-calculator', '<label>Filament</label>'],
    ['/fr/calculateur-cout', '<label>Filament</label>'],
    ['/ja/cost-calculator', '<label>フィラメント</label>'],
  ]) {
    const html = globalAracSayfasiBul(yol)?.olustur('https://baskihesap.tech') || '';
    kontrol(`${yol}: komisyon bildirimi & Filament etiketi yerelleştirilmiştir`,
      !html.includes('Bağlantı komisyonlu olabilir')
      && html.includes(beklenenEtiket)
      && !html.includes('<label for="gucW">Güç (W)</label>'));
  }

  for (const [m, d] of [['TPU (Esnek)', 'en'], ['Karbon Fiber (CF)', 'en'], ['Hyper / Yüksek Hız', 'ja'], ['PVA (Destek)', 'fr']]) {
    kontrol(`MALZEME_CEVIRI[${d}] "${m}" değerini içerir`, maliyetJsKod.includes(`'${m}':`));
  }
  for (const r of ['siyah', 'beyaz', 'gri', 'şeffaf', 'ipek']) {
    kontrol(`RENK_CEVIRI "${r}" rengini çevirir`, maliyetJsKod.includes(`${r}:`));
  }

  const { enUcuzFilamentler } = await import('../src/baskiApi.js');
  const usFil = enUcuzFilamentler({ limit: 200, market: 'us' }).filamentler;
  const kotuUs = usFil.filter(f => /\bmoq:|pre-?sale|\((?:eu|uk|ca|au|jp)\s+only\)/i.test(f.ad)).map(f => f.ad);
  kontrol('US enUcuzFilamentler MOQ, Pre-Sale ve (EU/UK/CA only) ilanları döndürmez',
    kotuUs.length === 0, JSON.stringify(kotuUs.slice(0, 5)));
}

console.log('\n24) 🔢 Hızlı sepet modu & footer mağaza sayıları tutarlılığı (/ /en /fr /ja):');
{
  const { SEPET_SITELERI } = await import('../src/basketOptimizer.js');
  const indexHtml = fs.readFileSync('public/index.html', 'utf8');
  const trSayi = adaptersByMarket('tr').length;
  kontrol(`TR index.html hızlı mod (${SEPET_SITELERI.length}) & toplam (${trSayi}) mağaza sayılarını taşır`,
    indexHtml.includes(`Hızlı mod (${SEPET_SITELERI.length} site)`)
    && indexHtml.includes(`kapatırsanız ${trSayi} mağazanın tamamı taranır`)
    && indexHtml.includes(`<b id="heroSiteSayisi">${trSayi}</b>`)
    && !indexHtml.includes('60 mağazanın tamamı'));

  for (const [yol, m, labelTpl] of [
    ['/en', 'us', (n) => `Fast mode (${n} stores)`],
    ['/fr', 'fr', (n) => `Mode rapide (${n} boutiques)`],
    ['/ja', 'jp', (n) => `高速モード (${n}ストア)`],
  ]) {
    const html = globalAracSayfasiBul(yol)?.olustur('https://baskihesap.tech') || '';
    const beklenen = taramaAdaptersByMarket(m).length;
    const footerLiSay = (html.match(/<ul id="footerSiteler" class="footer-siteler">([\s\S]*?)<\/ul>/)?.[1] || '').split('<li>').length - 1;
    kontrol(`${yol}: hızlı mod (${beklenen}), hero ve footer (${footerLiSay}) mağaza sayıları eşittir`,
      html.includes(labelTpl(beklenen))
      && html.includes(`<b id="heroSiteSayisi">${beklenen}</b>`)
      && footerLiSay === beklenen,
      `beklenen=${beklenen}, footer=${footerLiSay}`);
  }
  kontrol('server.js /api/durum hizliSiteSayisi döndürür ve app.js .sepet-hizli etiketini günceller',
    srvKod.includes('hizliSiteSayisi')
    && appJsKod.includes("document.querySelector('label.sepet-hizli')"));
}

console.log('\n25) 📱 390px mobilde "Popüler Aramalar" (.hizli-arama) yatay taşma koruması:');
{
  const cssSon = fs.readFileSync('public/style.css', 'utf8');
  const m640 = cssSon.match(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.hizli-arama\s*\{([^}]*)\}/);
  const m720 = cssSon.match(/@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.hizli-arama\s*\{([^}]*)\}/);
  kontrol('.hizli-arama mobilde nowrap veya negatif margin (-14px) kullanmaz; flex-wrap: wrap ile sarılır',
    !!m640 && !!m720
    && /flex-wrap:\s*wrap/.test(m640[1])
    && !/margin:\s*0\s+-14px/.test(m640[1])
    && !/flex-wrap:\s*nowrap/.test(m640[1])
    && /flex-wrap:\s*wrap/.test(m720[1])
    && !/flex-wrap:\s*nowrap/.test(m720[1]));
}

console.log('\n26) 🇦🇺 /en geçmişinde ürün adındaki Avustralya varyantı filtrelenir:');
{
  const gecmisBlok = srvKod.match(/const GECMIS_UCD_RE =[\s\S]*?\nfunction gecmisKaydiGecerliMi[\s\S]*?\n\}/);
  kontrol('server.js gecmisKaydiGecerliMi ürün başlığındaki Australia kalıbını da denetler', !!gecmisBlok);
  if (gecmisBlok) {
    const fnCtx = vm.runInNewContext(`${gecmisBlok[0]}; ({ gecmisKaydiGecerliMi })`);
    const auBaslikKayit = {
      urun: 'Creality Ender-3 V3 KE 3D Printer, 220x220x240mm - Printer Only / Australia',
      url: 'https://www.amazon.com/dp/B0EXAMPLE1',
      enUcuzUrl: 'https://www.amazon.com/dp/B0EXAMPLE1',
      market: 'us',
    };
    const usTemizKayit = {
      urun: 'Creality K1C 3D Printer',
      url: 'https://store.creality.com/products/creality-k1c-3d-printer',
      enUcuzUrl: 'https://store.creality.com/products/creality-k1c-3d-printer',
      market: 'us',
    };
    kontrol('gecmisKaydiGecerliMi "... / Australia" başlığını reddeder, US K1C kaydını korur',
      fnCtx.gecmisKaydiGecerliMi(auBaslikKayit, 'us') === false
      && fnCtx.gecmisKaydiGecerliMi(usTemizKayit, 'us') === true);
  }
}

console.log('\n27) 🌓 #temaDegistir title & aria-label yerelleştirmesi (public/tema.js & SSR):');
{
  const temaJsKod = fs.readFileSync('public/tema.js', 'utf8');
  const beklenenTema = {
    tr: { light: 'Karanlık temaya geç', dark: 'Aydınlık temaya geç', aria: 'Karanlık / aydınlık temayı değiştir' },
    en: { light: 'Switch to dark theme', dark: 'Switch to light theme', aria: 'Toggle dark / light theme' },
    fr: { light: 'Passer au thème sombre', dark: 'Passer au thème clair', aria: 'Changer de thème clair / sombre' },
    ja: { light: 'ダークテーマに切替', dark: 'ライトテーマに切替', aria: 'ライト／ダークテーマ切替' },
  };
  for (const [dil, bek] of Object.entries(beklenenTema)) {
    let curTheme = 'light';
    const attrs = { lang: dil };
    const metaEl = { setAttribute() {} };
    const dugme = {
      attrs: {},
      title: '',
      textContent: '',
      listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    };
    const sandbox = {
      document: {
        documentElement: {
          style: {},
          getAttribute: (k) => attrs[k] ?? null,
          setAttribute: (k, v) => { attrs[k] = v; if (k === 'data-theme') curTheme = v; },
        },
        getElementById: (id) => (id === 'temaDegistir' ? dugme : null),
        querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? metaEl : null),
        querySelectorAll: () => [],
        addEventListener() {},
      },
      window: {
        BASKI_HESAP_ORTAM: { dil },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        dispatchEvent() {},
      },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
      localStorage: { getItem: () => null, setItem() {} },
    };
    vm.runInNewContext(temaJsKod, sandbox);
    const lightOk = dugme.title === bek.light && dugme.attrs['aria-label'] === bek.aria;
    dugme.listeners.click?.();
    const darkOk = curTheme === 'dark' && dugme.title === bek.dark && dugme.attrs['aria-label'] === bek.aria;
    kontrol(`public/tema.js [${dil}] aydınlık & karanlık mod title/aria-label yerelleştirilmiştir`,
      lightOk && darkOk, `title=${dugme.title}, aria=${dugme.attrs['aria-label']}`);
  }

  for (const [dil, html] of [
    ['en', globalAracSayfasiBul('/en')?.olustur('https://baskihesap.tech') || ''],
    ['fr', globalAracSayfasiBul('/fr')?.olustur('https://baskihesap.tech') || ''],
    ['ja', globalAracSayfasiBul('/ja')?.olustur('https://baskihesap.tech') || ''],
    ['en', globalKatalogDiziniHtml('en', [], 'https://baskihesap.tech')],
    ['fr', globalKatalogDiziniHtml('fr', [], 'https://baskihesap.tech')],
    ['ja', globalKatalogDiziniHtml('ja', [], 'https://baskihesap.tech')],
    ['en', globalRehberDiziniHtml('en', 'https://baskihesap.tech')],
    ['fr', globalRehberDiziniHtml('fr', 'https://baskihesap.tech')],
    ['ja', globalRehberDiziniHtml('ja', 'https://baskihesap.tech')],
  ]) {
    const bek = beklenenTema[dil];
    const btn = html.match(/<button[^>]*id="temaDegistir"[^>]*>/)?.[0] || '';
    kontrol(`SSR [${dil}] #temaDegistir yerelleştirilmiş aria-label ve title taşır`,
      btn.includes(`aria-label="${bek.aria}"`)
      && btn.includes(`title="${bek.light}"`)
      && !btn.includes('Karanlık / aydınlık')
      && !btn.includes('Tema değiştir'),
      btn);
  }
}

console.log('\n28) 🎨 Küçük UI / erişilebilirlik & slicer mağaza sayısı düzeltmeleri:');
{
  const ayarHtml = fs.readFileSync('public/ayarlar.html', 'utf8');
  kontrol('public/ayarlar.html gerçek <h1> başlığı taşır',
    /<h1>[\s\S]*?<\/h1>/.test(ayarHtml) && /<h2>[\s\S]*?<\/h2>/.test(ayarHtml));

  for (const yol of ['/en/alerts', '/fr/alertes', '/ja/alerts']) {
    const html = globalAracSayfasiBul(yol)?.olustur('https://baskihesap.tech') || '';
    kontrol(`${yol} gerçek <h1> ve <h2> hiyerarşisi taşır`,
      /<h1>[\s\S]*?<\/h1>/.test(html) && /<h2>[\s\S]*?<\/h2>/.test(html));
  }

  const appSon = fs.readFileSync('public/app.js', 'utf8');
  const cssSon = fs.readFileSync('public/style.css', 'utf8');
  kontrol('#ozetKutu stok yok durumunda satır içi #dc2626 yerine .tukendi sınıfı ve beyaz yüksek kontrastlı yazı kullanır',
    !appSon.includes('style="color:#dc2626"')
    && /ozetEl\??\.classList\??\.toggle\('tukendi'/.test(appSon)
    && /\.ozet-kutu\.tukendi\s*\{[\s\S]*?color:\s*#fff/.test(cssSon));

  const frGuides = globalRehberDiziniHtml('fr', 'https://baskihesap.tech');
  const jaGuides = globalRehberDiziniHtml('ja', 'https://baskihesap.tech');
  kontrol('/fr/guides ve /ja/guides alt araç bağlantısında "Compare" yerine yerel etiket kullanır',
    frGuides.includes('Comparer →') && !frGuides.includes('Compare →')
    && jaGuides.includes('価格比較 →') && !jaGuides.includes('Compare →'));

  const { slicerOneri } = await import('../src/slicerApi.js');
  const jpSlicer = slicerOneri({ malzeme: 'PLA', gramaj: 340, market: 'jp' });
  const jpMagazaLimiti = taramaAdaptersByMarket('jp').length;
  kontrol(`JP slicerOneri alternatifMagazaSayisi (${jpSlicer.alternatifMagazaSayisi}) toplam JP mağaza sayısından (${jpMagazaLimiti}) azdır`,
    jpSlicer.status === 'success'
    && Number.isInteger(jpSlicer.alternatifMagazaSayisi)
    && jpSlicer.alternatifMagazaSayisi >= 0
    && jpSlicer.alternatifMagazaSayisi < jpMagazaLimiti);

  const slicerJs = fs.readFileSync('public/slicer.js', 'utf8');
  kontrol('public/slicer.js 店舗 / store sayısını v.alternatifSayisi yerine v.alternatifMagazaSayisi ile basar',
    slicerJs.includes('Number(v.alternatifMagazaSayisi)') && slicerJs.includes('件の候補'));
}

console.log('\n29) 📊 Çok dilli Canlı Borsa Vitrini (/en /fr /ja):');
{
  const { vitrinVerisi } = await import('../src/otonomRadar.js');
  const { globalVitrinVerisi } = await import('../src/seoSayfalar.js');

  const trVitrin = vitrinVerisi({ limit: 12, market: 'tr' });
  kontrol('TR vitrinVerisi TRY cinsinden ürün döndürür',
    trVitrin.ok === true && trVitrin.paraBirimi === 'TRY' && trVitrin.urunler.length > 0,
    `len=${trVitrin.urunler.length}`);

  for (const [mk, bekPara] of [['us', 'USD'], ['fr', 'EUR'], ['jp', 'JPY']]) {
    const gv = globalVitrinVerisi({ limit: 12, market: mk });
    const kotu = gv.urunler.filter(u =>
      u.paraBirimi !== bekPara
      || /\bmoq:|pre-?sale|bundle\s+sale|\((?:eu|uk|ca|au|jp|us)\s+only\)|<\/?tc>/i.test(u.ad)
      || /Kargo sepette|Ücretsiz Kargo|kargo dahil/i.test(String(u.kargo || '')));
    kontrol(`${mk.toUpperCase()} globalVitrinVerisi ${bekPara} cinsinden 12 temiz dengeli kart döndürür`,
      gv.ok === true && gv.paraBirimi === bekPara && gv.urunler.length === 12
      && gv.dagilim.filament === 6 && gv.dagilim.yazici === 4 && gv.dagilim.genel === 2
      && kotu.length === 0,
      JSON.stringify({ len: gv.urunler.length, dagilim: gv.dagilim, kotu: kotu.slice(0, 2) }));
  }

  const appSon = fs.readFileSync('public/app.js', 'utf8');
  const srvSon = fs.readFileSync('server.js', 'utf8');
  kontrol('server.js /api/vitrin market parametresi ile globalVitrinVerisi çağırır',
    srvSon.includes("app.get('/api/vitrin'") && srvSon.includes('globalVitrinVerisi({ limit, market })'));
  kontrol('public/app.js vitrinYukle global marketlerde gizlemez, ?market= ile çeker ve VITRIN_YEREL kullanır',
    !/if\s*\(\s*BASKI_ORTAM\.market\s*&&\s*BASKI_ORTAM\.market\s*!==\s*'tr'\s*\)\s*\{\s*grid\.setAttribute\('aria-busy'/.test(appSon)
    && appSon.includes('/api/vitrin?limit=12&market=')
    && appSon.includes('VITRIN_YEREL'));
}

console.log('\n30) 🛒 Resmî eBay Browse API adaptörü & çoklu para birimi işlem hattı:');
{
  const {
    ebayApiEtkinMi, ebayBrowseAra, ebayBrowseUrunGetir,
    ebayLegacyIdCoz, ebayAccountDeletionChallenge, _ebayOnbellekTemizle,
  } = await import('../src/sites/ebay-api.js');

  const eskiId = process.env.EBAY_CLIENT_ID;
  const eskiSecret = process.env.EBAY_CLIENT_SECRET;
  const eskiCampaign = process.env.EBAY_CAMPAIGN_ID;
  try {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    _ebayOnbellekTemizle();
    kontrol('EBAY_CLIENT_ID/SECRET yokken ebayApiEtkinMi() false döner', ebayApiEtkinMi() === false);

    process.env.EBAY_CLIENT_ID = 'test-client-id';
    process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
    process.env.EBAY_CAMPAIGN_ID = '5339999999';
    _ebayOnbellekTemizle();
    kontrol('EBAY_CLIENT_ID/SECRET varken ebayApiEtkinMi() true döner', ebayApiEtkinMi() === true);
    kontrol('ebayLegacyIdCoz /itm/ ve /itm/<slug>/<id> yollarını çözer',
      ebayLegacyIdCoz('https://www.ebay.com/itm/Creality-K1C/395123456789?hash=1') === '395123456789'
      && ebayLegacyIdCoz('https://www.ebay.fr/itm/1234567890') === '1234567890');

    const cagrilar = [];
    const mockFetch = async (url, init = {}) => {
      cagrilar.push({ url: String(url), headers: init.headers || {} });
      if (String(url).includes('/oauth2/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'tok-abc', expires_in: 7200 }),
        };
      }
      if (String(url).includes('/item_summary/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [
              {
                legacyItemId: '395123456789',
                title: 'Creality K1C 3D Printer Official New',
                brand: 'Creality',
                price: { value: '479.00', currency: 'USD' },
                itemWebUrl: 'https://www.ebay.com/itm/395123456789?foo=bar',
                itemAffiliateWebUrl: 'https://www.ebay.com/itm/395123456789?campid=5339999999',
                shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '0.00', currency: 'USD' } }],
                seller: { username: 'creality_official' },
                image: { imageUrl: 'https://i.ebayimg.com/images/g/k1c/s-l500.jpg' },
              },
            ],
          }),
        };
      }
      if (String(url).includes('get_item_by_legacy_id')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ errors: [{ errorId: 11006, message: 'The item id is an item group.' }] }),
        };
      }
      if (String(url).includes('get_items_by_item_group')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [{
              legacyItemId: '405987654321',
              title: 'Polymaker PolyLite PLA 1kg Black',
              brand: 'Polymaker',
              price: { value: '19.99', currency: 'EUR' },
              itemWebUrl: 'https://www.ebay.fr/itm/405987654321',
              shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '4.90', currency: 'EUR' } }],
              estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK', estimatedAvailableQuantity: 8 }],
            }],
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };

    const ctx = { spend: 0 };
    const usAdaylar = await ebayBrowseAra('ebay_us', 'Creality K1C', ctx, { fetchImpl: mockFetch });
    const searchCall = cagrilar.find(c => c.url.includes('/item_summary/search'));
    kontrol('ebayBrowseAra EBAY_US başlığı, EPN campaignId ve FIXED_PRICE+NEW filtresiyle döner',
      usAdaylar.length === 1
      && usAdaylar[0].price === 479
      && usAdaylar[0].currency === 'USD'
      && usAdaylar[0].url === 'https://www.ebay.com/itm/395123456789'
      && searchCall?.headers['X-EBAY-C-MARKETPLACE-ID'] === 'EBAY_US'
      && searchCall?.headers['X-EBAY-C-ENDUSERCTX'] === 'affiliateCampaignId=5339999999',
      JSON.stringify(usAdaylar));

    // Önbellek hit testi: ikinci HTTP atmadan dönmeli
    const spendOncesi = ctx.spend;
    const cachedUrun = await ebayBrowseUrunGetir('ebay_us', 'https://www.ebay.com/itm/395123456789', ctx, { fetchImpl: mockFetch });
    kontrol('ebayBrowseUrunGetir aramadan gelen ürünü ek API isteği olmadan döndürür + kargo & EPN taşır',
      ctx.spend === spendOncesi
      && cachedUrun.sellingPrice === 479
      && cachedUrun.shipping?.applies === false
      && cachedUrun.afiliyeUrl?.includes('campid=5339999999'));

    // Çoklu varyant (11006 -> get_items_by_item_group) testi
    const frUrun = await ebayBrowseUrunGetir('ebay_fr', 'https://www.ebay.fr/itm/405987654321', ctx, { fetchImpl: mockFetch, fresh: true });
    kontrol('ebayBrowseUrunGetir çoklu varyant (11006) item_group yedeğiyle EUR + kargoyu çözer',
      frUrun.currency === 'EUR'
      && frUrun.sellingPrice === 19.99
      && frUrun.shipping?.applies === true
      && frUrun.shipping?.fee === 4.9);

    const pipeKod = fs.readFileSync('src/pipeline.js', 'utf8');
    kontrol('src/pipeline.js sabit TRY yerine beklenenPara (USD/EUR/JPY/TRY) kontrolü yapar',
      pipeKod.includes('const beklenenPara = String(src?.currency || adapterCurrency(adapter)')
      && !pipeKod.includes("!== 'TRY'"));

    const usEpn = afiliyeLink('ebay_us', 'https://www.ebay.com/itm/395123456789');
    const frEpn = afiliyeLink('ebay_fr', 'https://www.ebay.fr/itm/405987654321');
    kontrol('afiliyeLink EBAY_CAMPAIGN_ID ile ebay_us (711) ve ebay_fr (709) EPN parametrelerini ekler',
      usEpn.includes('campid=5339999999')
      && usEpn.includes('mkrid=711-53200-19255-0')
      && frEpn.includes('campid=5339999999')
      && frEpn.includes('mkrid=709-53476-19255-0'),
      JSON.stringify({ usEpn, frEpn }));

    const ffLink = afiliyeLink('flashforge_us', 'https://www.flashforge.com/products/flashforge-creator-5');
    const sovolLink = afiliyeLink('sovol_us', 'https://www.sovol3d.com/products/sovol-sv08-3d-printer');
    const crealityLink = afiliyeLink('creality_us', 'https://store.creality.com/products/creality-k1c-3d-printer');
    const elegooUsLink = afiliyeLink('elegoo_us', 'https://us.elegoo.com/products/elegoo-neptune-4-pro');
    const elegooEuLink = afiliyeLink('elegoo_eu', 'https://eu.elegoo.com/products/elegoo-neptune-4-pro');
    const elegooJpLink = afiliyeLink('elegoo_jp', 'https://jp.elegoo.com/products/elegoo-neptune-4-pro');
    const snapUsLink = afiliyeLink('snapmaker_us', 'https://us.snapmaker.com/products/snapmaker-artisan');
    const snapFrLink = afiliyeLink('snapmaker_fr', 'https://eu.snapmaker.com/fr/products/snapmaker-artisan');
    const snapEuLink = afiliyeLink('snapmaker_eu', 'https://eu.snapmaker.com/products/snapmaker-artisan');
    const hgUsLink = afiliyeLink('heygears_us', 'https://store.heygears.com/products/ultracraft-reflex-rs-3d-printer');
    kontrol('Varsayılan Impact ortaklıkları (Flashforge, Sovol 3D, Creality Official, ELEGOO, Snapmaker, HeyGears) ?u= ile çalışır',
      ffLink.startsWith('https://flashforge.sjv.io/c/8295867/3092803/38200?u=')
      && sovolLink.startsWith('https://sovol3d.sjv.io/c/8295867/3963679/55332?u=')
      && crealityLink.startsWith('https://crealityofficialstore.sjv.io/c/8295867/2050362/25652?u=')
      && elegooUsLink.startsWith('https://elegoo.sjv.io/c/8295867/1692726/19663?u=')
      && elegooEuLink.startsWith('https://elegoo.sjv.io/c/8295867/1692726/19663?u=')
      && elegooJpLink.startsWith('https://elegoo.sjv.io/c/8295867/1692726/19663?u=')
      && snapUsLink.startsWith('https://snapmaker.sjv.io/c/8295867/1346054/16240?u=')
      && snapFrLink.startsWith('https://snapmaker.sjv.io/c/8295867/1346054/16240?u=')
      && snapEuLink.startsWith('https://snapmaker.sjv.io/c/8295867/1346054/16240?u=')
      && hgUsLink.startsWith('https://heygears.pxf.io/c/8295867/3929807/53995?u='),
      JSON.stringify({ ffLink, sovolLink, crealityLink, elegooUsLink, elegooEuLink, elegooJpLink, snapUsLink, hgUsLink }));

    const { createHash } = await import('node:crypto');
    const cCode = 'challenge_123';
    const vTok = 'token_aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const ep = 'https://baskihesap.tech/api/ebay/account-deletion';
    const bekHash = createHash('sha256').update(cCode + vTok + ep, 'utf8').digest('hex');
    kontrol('ebayAccountDeletionChallenge SHA-256(challengeCode+verificationToken+endpoint) üretir',
      ebayAccountDeletionChallenge({ challengeCode: cCode, verificationToken: vTok, endpoint: ep }) === bekHash);

    const { matchProducts } = await import('../src/util.js');
    const esunKaynak = { title: 'eSUN PLA+', brand: 'eSUN' };
    const esunEbayEslesme = matchProducts(esunKaynak, {
      title: 'eSUN PLA+ 3D Printer Filament, 1.75mm PLA Plus 1KG, 0.02mm, Most FDM 3D Printers',
      brand: 'eSUN',
    });
    const esunDuzPlaEslesme = matchProducts(esunKaynak, {
      title: 'eSUN PLA Filament 1.75mm 1kg',
      brand: 'eSUN',
    });
    kontrol('matchProducts eSUN PLA+ vs uzun PLA Plus eBay başlığını eşler, düz PLA ile eşlemez',
      esunEbayEslesme !== null && esunDuzPlaEslesme === null,
      JSON.stringify({ esunEbayEslesme, esunDuzPlaEslesme }));

    // Fiyatsız itemGroupHref varyasyon araması önbelleğe alınmamalı; ebayBrowseUrunGetir item_group üzerinden stok+renk çözmeli
    const varMockFetch = async (url) => {
      if (String(url).includes('/item_summary/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: 'v1|395123999888|0',
              itemGroupHref: 'https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=395123999888',
              title: 'eSUN PLA+ 3D Printer Filament, 1.75mm PLA Plus 1KG, 0.02mm, Most FDM 3D Printers',
              brand: 'eSUN',
            }],
          }),
        };
      }
      if (String(url).includes('get_item_by_legacy_id')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ errors: [{ errorId: 11006, message: 'The item id is an item group.' }] }),
        };
      }
      if (String(url).includes('get_items_by_item_group')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                legacyItemId: '395123999888',
                title: 'eSUN PLA+ Filament Red',
                brand: 'eSUN',
                color: 'Red',
                price: { value: '15.99', currency: 'USD' },
                itemWebUrl: 'https://www.ebay.com/itm/395123999888',
                estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK', estimatedAvailableQuantity: 0 }],
              },
              {
                legacyItemId: '395123999888',
                title: 'eSUN PLA+ Filament White',
                brand: 'eSUN',
                color: 'White',
                price: { value: '17.99', currency: 'USD' },
                itemWebUrl: 'https://www.ebay.com/itm/395123999888',
                estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK', estimatedAvailableQuantity: 4 }],
              },
              {
                legacyItemId: '395123999888',
                title: 'eSUN PLA+ Filament Black',
                brand: 'eSUN',
                color: 'Black',
                price: { value: '16.99', currency: 'USD' },
                itemWebUrl: 'https://www.ebay.com/itm/395123999888',
                estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK', estimatedAvailableQuantity: 10 }],
              },
            ],
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };

    const varAdaylar = await ebayBrowseAra('ebay_us', 'eSUN PLA+', ctx, { fetchImpl: varMockFetch });
    const varUrun = await ebayBrowseUrunGetir('ebay_us', varAdaylar[0]?.url, ctx, {
      fetchImpl: varMockFetch,
      kaynak: { color: 'siyah' },
    });
    kontrol('ebayBrowseAra fiyatsız varyant grubunu önbelleğe kitlemez ve ebayBrowseUrunGetir stoklu+renkli fiyatı çözer',
      varAdaylar.length === 1
      && varAdaylar[0].url === 'https://www.ebay.com/itm/395123999888'
      && varAdaylar[0].price === null
      && varUrun.sellingPrice === 16.99
      && varUrun.currency === 'USD',
      JSON.stringify({ varAdaylar, varUrun }));
  } finally {
    _ebayOnbellekTemizle();
    if (eskiId === undefined) delete process.env.EBAY_CLIENT_ID; else process.env.EBAY_CLIENT_ID = eskiId;
    if (eskiSecret === undefined) delete process.env.EBAY_CLIENT_SECRET; else process.env.EBAY_CLIENT_SECRET = eskiSecret;
    if (eskiCampaign === undefined) delete process.env.EBAY_CAMPAIGN_ID; else process.env.EBAY_CAMPAIGN_ID = eskiCampaign;
  }
}

console.log('\n31) 🎨 Renksiz isim araması, RGB hattı, $0.00 tükendi & muadil yerelleştirmesi');
{
  const { hatCakismasi } = await import('../src/util.js');
  kontrol('hatCakismasi RGB Blue - eSun PLA+ ile düz esun pla+ aramasını ayırır',
    hatCakismasi('RGB Blue - eSun PLA+ Filament - 1.75mm, 1kg', 'esun pla+') === true);
  kontrol('hatCakismasi kullanıcı açıkça RGB yazarsa eşleşmeye izin verir',
    hatCakismasi('RGB Blue - eSun PLA+ Filament - 1.75mm, 1kg', 'esun rgb pla+') === false);

  const katEsun = katalogdanKaynakAdayi('esun pla+', { market: 'us', ttlMs: 1e12 });
  kontrol('katalogdanKaynakAdayi("esun pla+", us) RGB Blue ürününe kilitlenmez',
    !katEsun || !/\brgb\b/i.test(katEsun.title || ''),
    JSON.stringify(katEsun));

  const urunAramaKod = fs.readFileSync('src/urunArama.js', 'utf8');
  kontrol('hizliKaynakUrunBul stokta:0 katalog kaydında canlı mağazaları atlamaz',
    urunAramaKod.includes('katalogAdayi.stokta !== 0 && katalogAdayi.stokta !== false'));

  const pipelineKod = fs.readFileSync('src/pipeline.js', 'utf8');
  kontrol('pipeline runComparison renk belirtilmeyen isim aramasında renkEsnek modunu açar',
    pipelineKod.includes('kullaniciRenkBelirtmedi')
    && pipelineKod.includes('renkEsnek: opts.renkEsnek ?? kullaniciRenkBelirtmedi')
    && pipelineKod.includes('etkinRenkAyni'));

  const appKod = fs.readFileSync('public/app.js', 'utf8');
  kontrol('bentoVerisiHesapla null/0 fiyattan sahte $0.00 Sold Out üretmez',
    appKod.includes('ham != null && Number.isFinite(Number(ham)) && Number(ham) > 0'));
  kontrol('muadilPoll ve muadilCiz TR dışı dillerde Türkçe ilerleme/etiket sızdırmaz',
    appKod.includes('const gosterNot = trDisi ? CANLI_YEREL.muadilYukleniyor : p.not;'));

  const srvKod = fs.readFileSync('server.js', 'utf8');
  kontrol('renkUyumluAnlik hatCakismasi ve renksiz-stoksuz eski anlık önbelleği eler',
    srvKod.includes('hatCakismasi(kayitBaslik, arananSorgu)')
    && srvKod.includes('farkliRenkStok'));
}

console.log('\n32) 🗿 Örnek STL test butonları & Meshy vs Hi3D baskı maliyeti rehberleri');
{
  const stlParser = await import('../public/stlParser.js');
  const { globalAi3dRehberiHtml, rehberSayfasiBul: bulRehber } = await import('../src/rehberSayfalar.js');
  const { aiModelPartnerLinkleri } = await import('../src/afiliye.js');

  const figurBuf = fs.readFileSync('public/ornek-modeller/ornek-masaustu-figur.stl');
  const rozetBuf = fs.readFileSync('public/ornek-modeller/ornek-cok-renkli-rozet.stl');
  const figurModel = await stlParser.parseModel(figurBuf.buffer.slice(figurBuf.byteOffset, figurBuf.byteOffset + figurBuf.byteLength), { ad: 'ornek-masaustu-figur.stl' });
  const rozetModel = await stlParser.parseModel(rozetBuf.buffer.slice(rozetBuf.byteOffset, rozetBuf.byteOffset + rozetBuf.byteLength), { ad: 'ornek-cok-renkli-rozet.stl' });
  const figurG = stlParser.hesaplaGramaj(figurModel.hacimCm3, 20, 'PLA').gram;
  const rozetG = stlParser.hesaplaGramaj(rozetModel.hacimCm3, 20, 'PLA').gram;
  kontrol('Yerleşik örnek STL dosyaları stlParser ile gerçek pozitif hacim/gramaj üretir',
    figurModel.ucgenSayisi > 100 && figurG > 35 && figurG < 55
    && rozetModel.ucgenSayisi > 100 && rozetG > 25 && rozetG < 45,
    JSON.stringify({ figurG, rozetG }));

  const trMalHtml = fs.readFileSync('public/maliyet.html', 'utf8');
  const enMalHtml = globalAracSayfasiBul('/en/cost-calculator')?.olustur('https://baskihesap.tech') || '';
  const frMalHtml = globalAracSayfasiBul('/fr/calculateur-cout')?.olustur('https://baskihesap.tech') || '';
  const jaMalHtml = globalAracSayfasiBul('/ja/cost-calculator')?.olustur('https://baskihesap.tech') || '';
  kontrol('Maliyet Hesaplayıcı (TR/EN/FR/JA) tek tıkla örnek STL butonlarını ve AI araç ipucunu taşır',
    trMalHtml.includes('data-stl-ornek="/ornek-modeller/ornek-masaustu-figur.stl"')
    && enMalHtml.includes('Tabletop Figurine')
    && frMalHtml.includes('Figurine bureau')
    && jaMalHtml.includes('フィギュア例'));

  const eskiMeshy = process.env.IMPACT_MESHY_URL;
  process.env.IMPACT_MESHY_URL = 'https://meshy.sjv.io/test123';
  const partnerLink = aiModelPartnerLinkleri();
  if (eskiMeshy === undefined) delete process.env.IMPACT_MESHY_URL; else process.env.IMPACT_MESHY_URL = eskiMeshy;
  kontrol('aiModelPartnerLinkleri IMPACT_MESHY_URL tanımlandığında afiliye=true ve güvenli URL döndürür',
    partnerLink.meshyAfiliye === true && partnerLink.meshyUrl === 'https://meshy.sjv.io/test123');

  const trAiRehber = bulRehber('/rehber/meshy-vs-hi3d-3d-baski-maliyeti');
  const trAiHtml = trAiRehber?.olustur([
    { ad: 'Porima PLA Siyah 1kg', kategori: 'filament', kategoriSlug: 'pla-filament', enUcuzFiyat: 599, stokluSayisi: 3 },
  ], 'https://baskihesap.tech') || '';
  const enAiHtml = globalAi3dRehberiHtml('en', 'https://baskihesap.tech', [
    { ad: 'eSun PLA+ Black 1kg', kategori: 'filament', kategoriSlug: 'pla-filament', enUcuzFiyat: 16.99, paraBirimi: 'USD', stokluSayisi: 1 },
  ]);
  const enGuidesHtml = globalRehberDiziniHtml('en', 'https://baskihesap.tech', []);
  kontrol('Meshy vs Hi3D TR & EN/FR/JA baskı maliyeti rehberleri canlı PLA fiyatlarıyla render olur',
    !!trAiRehber
    && trAiHtml.includes('599')
    && trAiHtml.includes('hreflang="en" href="https://baskihesap.tech/en/guides/meshy-vs-hi3d-3d-printing-cost"')
    && enAiHtml.includes('$16.99')
    && enGuidesHtml.includes('/en/guides/meshy-vs-hi3d-3d-printing-cost'));

  kontrol('Fotoğraftan Bas-Sat 3 adımlı akışı TR/EN/FR/JA maliyet sayfalarında ve rehberlerde yer alır',
    trMalHtml.includes('id="mzAkisKart"')
    && enMalHtml.includes('Photo-to-Print')
    && !enMalHtml.includes('Fotoğraftan Özel Ürün Bas-Sat')
    && frMalHtml.includes('Flux Photo-à-Vente')
    && jaMalHtml.includes('造形＆販売ワークフロー')
    && trAiHtml.includes('id="basSatAkisKart"')
    && enAiHtml.includes('id="basSatAkisKart"')
    && (bulRehber('/rehber/3d-baski-maliyeti-nasil-hesaplanir')?.olustur([], 'https://baskihesap.tech') || '').includes('id="basSatAkisKart"'));

  const comboUrun = {
    id: 888001, market: 'us', paraBirimi: 'USD',
    ad: 'Bambu Lab A1 Combo 3D Printer', sorgu: 'Bambu Lab A1 Combo',
    kategori: 'yazici', kategoriSlug: '3d-yazici', slug: 'bambu-lab-a1-combo', yol: '/en/urun/bambu-lab-a1-combo',
    enUcuzFiyat: 489, enUcuzSite: 'Bambu Lab US', stokluSayisi: 2, lastmod: '2026-11-24', teklifler: [],
  };
  const duzUrun = {
    id: 888002, market: 'tr', paraBirimi: 'TRY',
    ad: 'Creality Ender 3 V3 KE 3D Yazıcı', sorgu: 'Creality Ender 3 V3 KE',
    kategori: 'yazici', kategoriSlug: '3d-yazici', slug: 'ender-3-v3-ke', yol: '/urun/ender-3-v3-ke',
    enUcuzFiyat: 11999, enUcuzSite: 'Robotistan', stokluSayisi: 3, lastmod: '2026-11-24', teklifler: [],
  };
  const comboHtml = urunSayfasiHtml(comboUrun, 'https://baskihesap.tech', [], { dil: 'en' });
  const duzHtml = urunSayfasiHtml(duzUrun, 'https://baskihesap.tech', [], { dil: 'tr' });
  const p1sVsHtml = bulRehber('/karsilastir/bambu-lab-p1s-vs-creality-k1c')?.olustur([], 'https://baskihesap.tech') || '';
  kontrol('Çok renkli Combo/AMS yazıcı sayfalarında Hi3D & 3-4 makara planı çıkar, düz tek renk yazıcıda çıkmaz',
    comboHtml.includes('id="cokRenkliHi3dKart"')
    && comboHtml.includes('Smart Basket')
    && comboHtml.includes('Search PLA+ Colors')
    && !duzHtml.includes('id="cokRenkliHi3dKart"')
    && p1sVsHtml.includes('id="amsCokRenkliRehberKart"'));

  const eskiMP = process.env.IMPACT_MESHY_PROMO;
  const eskiHP = process.env.IMPACT_HI3D_PROMO;
  process.env.IMPACT_MESHY_PROMO = 'BASKI20 (%20 OFF)';
  process.env.IMPACT_HI3D_PROMO = 'HI3DFREE';
  try {
    const enMalPromo = globalAracSayfasiBul('/en/cost-calculator')?.olustur('https://baskihesap.tech') || '';
    const comboPromo = urunSayfasiHtml(comboUrun, 'https://baskihesap.tech', [], { dil: 'en' });
    kontrol('IMPACT_MESHY_PROMO ve IMPACT_HI3D_PROMO ayarlandığında özel promosyon rozeti görünür',
      enMalPromo.includes('BASKI20 (%20 OFF)')
      && comboPromo.includes('HI3DFREE'));
  } finally {
    if (eskiMP === undefined) delete process.env.IMPACT_MESHY_PROMO; else process.env.IMPACT_MESHY_PROMO = eskiMP;
    if (eskiHP === undefined) delete process.env.IMPACT_HI3D_PROMO; else process.env.IMPACT_HI3D_PROMO = eskiHP;
  }
}

console.log('\n33) 🌍 Kök URL ülke / dil yönlendirmesi (TR / FR / JA / Global EN)');
{
  const { ulkeVeyaIstekDiliCoz } = await import('../src/i18n/index.js');

  kontrol('TR ziyaretçisi kök sayfada kalır',
    ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'TR', 'accept-language': 'tr-TR,tr;q=0.9' } }).yonlendirUrl === null);
  kontrol('Fransa ziyaretçisi /fr sayfasına yönlenir',
    ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'FR' } }).yonlendirUrl === '/fr');
  kontrol('Japonya ziyaretçisi /ja sayfasına yönlenir',
    ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'JP' } }).yonlendirUrl === '/ja');
  kontrol('Desteklenmeyen ülke (ör. Almanya DE / Brezilya BR / ABD US) global /en olur',
    ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'DE', 'accept-language': 'de-DE' } }).yonlendirUrl === '/en'
    && ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'BR' } }).yonlendirUrl === '/en'
    && ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'US' } }).yonlendirUrl === '/en');
  kontrol('Ülke başlığı yokken Accept-Language: fr / ja / de doğru çözülür (es/de → /en)',
    ulkeVeyaIstekDiliCoz({ headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }).yonlendirUrl === '/fr'
    && ulkeVeyaIstekDiliCoz({ headers: { 'accept-language': 'ja-JP,ja;q=0.9' } }).yonlendirUrl === '/ja'
    && ulkeVeyaIstekDiliCoz({ headers: { 'accept-language': 'es-ES,es;q=0.9' } }).yonlendirUrl === '/en'
    && ulkeVeyaIstekDiliCoz({ headers: { 'accept-language': 'tr-TR,tr;q=0.9' } }).yonlendirUrl === null);
  kontrol('Googlebot/Bingbot hiçbir zaman yönlendirilmez (SEO canonical korunur)',
    ulkeVeyaIstekDiliCoz({ headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'cf-ipcountry': 'US' } }).yonlendirUrl === null);
  kontrol('Kullanıcının bh_lang çerezi ve ?lang= seçimi coğrafi yönlendirmeden önceliklidir',
    ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'DE', cookie: 'bh_lang=tr' } }).yonlendirUrl === null
    && ulkeVeyaIstekDiliCoz({ headers: { 'cf-ipcountry': 'TR', cookie: 'bh_lang=en' } }).yonlendirUrl === '/en'
    && ulkeVeyaIstekDiliCoz({ query: { lang: 'ja' }, headers: { 'cf-ipcountry': 'TR' } }).yonlendirUrl === '/ja');
  kontrol('Başlıksız istek (sağlık kontrolü) ve ?url= arama parametresi / üzerinde kalır',
    ulkeVeyaIstekDiliCoz({ headers: {} }).yonlendirUrl === null
    && ulkeVeyaIstekDiliCoz({ query: { url: 'eSUN PLA+' }, headers: { 'cf-ipcountry': 'US' } }).yonlendirUrl === null);
}

console.log('\n34) 🏷️ Amazon gerçek marka çıkarma (#bylineInfo / Marka tablosu)');
{
  const { amazonMarkaCikar, matchProducts } = await import('../src/util.js');

  const ornekHtmlByline = '<a id="bylineInfo" href="/stores/eSUN">Marka: eSUN</a>';
  const ornekHtmlTablo = '<tr class="a-spacing-small po-brand"><td><span>Marka</span></td><td><span class="a-size-base">eSUN</span></td></tr>';
  const ornekHtmlStore = '<a id="bylineInfo">Visit the Polymaker Store</a>';
  const baslik = 'PLA Basic Gümüş Filament 1,75mm 1kg - bisiparisver, ESUN118';

  const b1 = amazonMarkaCikar(ornekHtmlByline, baslik);
  const b2 = amazonMarkaCikar(ornekHtmlTablo, baslik);
  const b3 = amazonMarkaCikar(ornekHtmlStore, 'PLA+ Filament 1kg');
  const b4 = amazonMarkaCikar('<html></html>', baslik);
  kontrol('amazonMarkaCikar #bylineInfo ve po-brand tablosundan eSUN/Polymaker okur, ilk kelime "PLA" markasını uydurmaz',
    b1 === 'eSUN' && b2 === 'eSUN' && b3 === 'Polymaker' && b4 === null,
    JSON.stringify({ b1, b2, b3, b4 }));

  const eslesme = matchProducts(
    { title: 'Esun Basic PLA Filament', brand: 'Esun' },
    { title: baslik, brand: b1 },
  );
  kontrol('Gerçek eSUN markasıyla Amazon "PLA Basic ... ESUN118" ilanı Esun Basic PLA ile eşleşir',
    eslesme !== null, JSON.stringify(eslesme));
}

console.log('\n35) 🔍 Yeni özellikler için SEO (robots.txt, hreflang, TechArticle/FAQPage JSON-LD, IndexNow)');
{
  const { globalAi3dRehberiHtml, rehberSayfasiBul } = await import('../src/rehberSayfalar.js');
  const robotsTxt = fs.readFileSync('public/robots.txt', 'utf8');
  const maliyetHtml = fs.readFileSync('public/maliyet.html', 'utf8');
  const serverSrc = fs.readFileSync('server.js', 'utf8');

  kontrol('robots.txt /rehber, /karsilastir/ ve /en /fr /ja yollarına açık izin verir',
    robotsTxt.includes('Allow: /rehber')
    && robotsTxt.includes('Allow: /karsilastir/')
    && robotsTxt.includes('Allow: /en/')
    && robotsTxt.includes('Allow: /fr/')
    && robotsTxt.includes('Allow: /ja/'));

  kontrol('public/maliyet.html güncel STL/3MF başlığı + SoftwareApplication + FAQPage şeması içerir',
    maliyetHtml.includes('STL / 3MF')
    && maliyetHtml.includes('"@type": "SoftwareApplication"')
    && maliyetHtml.includes('"@type": "FAQPage"'));

  const enMalSeo = globalAracSayfasiBul('/en/cost-calculator')?.olustur('https://baskihesap.tech') || '';
  kontrol('/en/cost-calculator yerelleştirilmiş SoftwareApplication ve FAQPage JSON-LD üretir (TR kalıntısı yok)',
    enMalSeo.includes('"priceCurrency":"USD"')
    && enMalSeo.includes('"@type":"SoftwareApplication"')
    && enMalSeo.includes('"@type":"FAQPage"')
    && !enMalSeo.includes('Baskı Hesap 3D Baskı Maliyet')
    && !enMalSeo.includes('Yüklediğim STL veya 3MF dosyası sunucuya gönderiliyor mu')
    && enMalSeo.includes('Are my STL or 3MF files uploaded to a server?'));

  const trMeshySeo = rehberSayfasiBul('/rehber/meshy-vs-hi3d-3d-baski-maliyeti')?.olustur([], 'https://baskihesap.tech') || '';
  const enMeshySeo = globalAi3dRehberiHtml('en', 'https://baskihesap.tech', []);
  kontrol('Meshy vs Hi3D TR & EN rehberleri TechArticle + FAQPage JSON-LD içerir',
    trMeshySeo.includes('"@type":"TechArticle"')
    && trMeshySeo.includes('"@type":"FAQPage"')
    && enMeshySeo.includes('"@type":"TechArticle"')
    && enMeshySeo.includes('"inLanguage":"en"'));

  kontrol('server.js /sepet.html karşılıklı global hreflang ve IndexNow global yolları içerir',
    serverSrc.includes('GLOBAL_SEPET_YOLLARI.en')
    && serverSrc.includes('GLOBAL_SEPET_YOLLARI.fr')
    && serverSrc.includes('GLOBAL_SEPET_YOLLARI.ja')
    && serverSrc.includes('function tumIndexNowYollari()')
    && serverSrc.includes('globalRehberSitemapKayitlari()'));

  kontrol('Maliyet Hesaplayıcı (TR/EN/FR/JA) 4-kart KPI şeridi, Donut grafiği, malzeme hapları ve fire payı taşır',
    maliyetHtml.includes('id="mzKpiSerit"')
    && maliyetHtml.includes('id="mzDonutKart"')
    && maliyetHtml.includes('id="mzMalzemeHizli"')
    && maliyetHtml.includes('id="fireKaydirici"')
    && maliyetHtml.includes('id="stlDolulukKiyas"')
    && maliyetHtml.includes('id="stlMakeKopyalaBtn"')
    && enMalSeo.includes('Infill %')
    && enMalSeo.includes('Copy Print Card')
    && !enMalSeo.includes('Doluluk Oranına Göre Gramaj')
    && !enMalSeo.includes('Baskı Kartını Kopyala')
    && enMalSeo.includes('Total Real Cost')
    && enMalSeo.includes('Cost Breakdown')
    && enMalSeo.includes('Waste &amp; Failure Protection')
    && !enMalSeo.includes('Toplam Gerçek Maliyet')
    && !enMalSeo.includes('Model gramajı')
    && !enMalSeo.includes('Gelişmiş ayarlar')
    && !maliyetHtml.includes('mz-kpi-cubuk')
    && !fs.readFileSync('public/maliyet.css', 'utf8').includes('#6366f1'));
}

console.log('\n36) ⚔️ Global Yüksek Komisyonlu Marka Düelloları (EN / FR / JA):');
{
  const {
    GLOBAL_DUELLO_YOLLARI, GLOBAL_DUELLO_TUM_YOLLAR, globalDuelloBul, globalDuelloSitemapKayitlari,
  } = await import('../src/globalDuelloRehberleri.js');
  const { globalRehberSitemapKayitlari } = await import('../src/rehberSayfalar.js');

  kontrol('3 marka düellosu EN/FR/JA toplam 9 rota tanımlar',
    Object.keys(GLOBAL_DUELLO_YOLLARI).length === 3
    && GLOBAL_DUELLO_TUM_YOLLAR.length === 9
    && globalDuelloSitemapKayitlari('en').length === 3
    && globalDuelloSitemapKayitlari('fr').length === 3
    && globalDuelloSitemapKayitlari('ja').length === 3
    && globalRehberSitemapKayitlari('en').length === 4);

  const heyEn = globalDuelloBul('/en/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra')?.olustur('https://baskihesap.tech', [
    { ad: 'HeyGears Reflex RS 3D Printer', slug: 'heygears-reflex-rs', sorgu: 'HeyGears Reflex RS', yol: '/en/urun/heygears-reflex-rs', enUcuzFiyat: 499, paraBirimi: 'USD', enUcuzSite: 'HeyGears (US)' },
  ]) || '';
  kontrol('HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra EN sayfası çift affiliate + canlı fiyat + hreflang + TechArticle içerir',
    heyEn.includes('https://heygears.pxf.io/c/8295867/3929807/53995?u=')
    && heyEn.includes('https://elegoo.sjv.io/c/8295867/1692726/19663?u=')
    && heyEn.includes('$499')
    && heyEn.includes('rel="noopener sponsored nofollow"')
    && heyEn.includes('hreflang="x-default" href="https://baskihesap.tech/en/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra"')
    && heyEn.includes('"@type":"TechArticle"')
    && heyEn.includes('"@type":"FAQPage"'));

  const snapFr = globalDuelloBul('/fr/guides/snapmaker-artisan-u1-vs-creality-k1-max')?.olustur('https://baskihesap.tech', []) || '';
  kontrol('Snapmaker Artisan / U1 vs Creality K1 Max FR sayfası Snapmaker + Creality FR affiliate linki üretir',
    snapFr.includes('https://snapmaker.sjv.io/c/8295867/1346054/16240?u=')
    && snapFr.includes('https://crealityofficialstore.sjv.io/c/8295867/2050362/25652?u=')
    && snapFr.includes('"inLanguage":"fr"')
    && snapFr.includes('Questions Fréquentes'));

  const svJa = globalDuelloBul('/ja/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max')?.olustur('https://baskihesap.tech', []) || '';
  kontrol('Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max JA sayfası 3 ortak linki ve FAQ içerir',
    svJa.includes('https://sovol3d.sjv.io/c/8295867/3963679/55332?u=')
    && svJa.includes('https://flashforge.sjv.io/c/8295867/3092803/38200?u=')
    && svJa.includes('https://elegoo.sjv.io/c/8295867/1692726/19663?u=')
    && svJa.includes('"inLanguage":"ja"')
    && svJa.includes('よくある質問'));

  const enDir = globalRehberDiziniHtml('en', 'https://baskihesap.tech', []);
  const frDir = globalRehberDiziniHtml('fr', 'https://baskihesap.tech', []);
  const jaDir = globalRehberDiziniHtml('ja', 'https://baskihesap.tech', []);
  kontrol('/en/guides, /fr/guides ve /ja/guides dizinleri 3 marka düellosunu doğrudan listeler',
    enDir.includes('/en/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra')
    && enDir.includes('/en/guides/snapmaker-artisan-u1-vs-creality-k1-max')
    && enDir.includes('/en/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max')
    && frDir.includes('/fr/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra')
    && jaDir.includes('/ja/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max'));

  const serverSrc2 = fs.readFileSync('server.js', 'utf8');
  kontrol('server.js GLOBAL_DUELLO_TUM_YOLLAR rotasını bağlar',
    serverSrc2.includes('GLOBAL_DUELLO_TUM_YOLLAR') && serverSrc2.includes('globalDuelloBul'));
}

closeDatabase();
console.log('\n──────────────────────────────────────────────');
console.log(`Sonuç: ${gecen}/${gecen + kalan} kontrol geçti`);
if (kalan > 0) process.exit(1);
