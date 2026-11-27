/**
 * 🔍 `/urun/:slug` sıfır-404 akıllı çözümleme testleri.
 * Ağ isteği atmaz; geçici snapshot yazıp temizler.
 */
import fs from 'node:fs';
import { seoUrunYedekCoz, urunSayfasiHtml, urunIndekslenebilirMi, sitemapKayitlari } from '../src/seoSayfalar.js';
import { guvenSayfasiBul, guvenSayfaSitemapKayitlari } from '../src/guvenSayfalar.js';
import { rehberSayfasiBul, rehberSitemapKayitlari, rehberDiziniHtml } from '../src/rehberSayfalar.js';
import { slugYap } from '../src/util.js';
import { anlikYaz, snapshotSil, anahtarCikar } from '../src/anlikOnbellek.js';

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

console.log('\n1) ⚡ Snapshot (anlikOnbellek) kurtarma');
const testAd = 'Bambu Test Akilli Yedek PLA 1kg Siyah';
const testUrl = 'https://mock-yedek-seo.test/urun/' + Date.now();
const testSlug = slugYap(testAd);

anlikYaz(testUrl, {
  kaynak: { url: testUrl, urun: testAd, image: 'https://img.test/a.jpg', brand: 'Bambu Lab' },
  sonuclar: [
    {
      status: 'found',
      site: 'robotistan',
      siteName: 'Robotistan',
      product: {
        title: testAd,
        url: testUrl,
        inStock: true,
        sellingPrice: 549,
        pricing: { araToplam: 549, toplam: 549, kargo: { uygulanir: false } },
      },
    },
  ],
  ozet: { bulunanSiteSayisi: 1, enUcuzFiyat: 549, enUcuzSite: 'Robotistan' },
});

try {
  const c1 = seoUrunYedekCoz(testSlug, []);
  kontrol('snapshot tam slug → sayfa', c1?.tip === 'sayfa' && c1.urun?.slug === testSlug, JSON.stringify(c1?.tip));
  kontrol('snapshot fiyatı okundu', c1?.urun?.enUcuzFiyat === 549, String(c1?.urun?.enUcuzFiyat));
  kontrol('snapshot SSR HTML üretildi',
    typeof urunSayfasiHtml(c1.urun, 'https://baskihesap.tech', []) === 'string'
    && urunSayfasiHtml(c1.urun, 'https://baskihesap.tech', []).includes(testAd));

  // Ufak kelime farkı olan benzer slug da snapshot'ı kurtarır
  const cBenzer = seoUrunYedekCoz('bambu-test-akilli-yedek-pla-siyah', []);
  kontrol('snapshot yüksek benzerlik → sayfa', cBenzer?.tip === 'sayfa', JSON.stringify(cBenzer));
} finally {
  snapshotSil(anahtarCikar(testUrl));
}

console.log('\n2) 🔁 Katalog benzerlik yönlendirmesi');
const sahteListe = [
  { id: 1, ad: 'Creality K1C 3D Yazıcı', slug: 'creality-k1c-3d-yazici', yol: '/urun/creality-k1c-3d-yazici', enUcuzFiyat: 24500 },
  { id: 2, ad: 'eSUN PLA+ Beyaz 1kg', slug: 'esun-pla-plus-beyaz-1kg', yol: '/urun/esun-pla-plus-beyaz-1kg', enUcuzFiyat: 499 },
];

const c2 = seoUrunYedekCoz('creality-k1c', sahteListe);
kontrol('kısmi önek slug → kanonik yönlendirme',
  c2?.tip === 'yonlendir' && c2.hedef === '/urun/creality-k1c-3d-yazici', JSON.stringify(c2));

const cTekKelime = seoUrunYedekCoz('creality', sahteListe);
kontrol('tek kelime çakışmada rastgele yönlendirme yok',
  cTekKelime?.tip === 'yonlendir' && cTekKelime.hedef === '/?q=creality&otomatik=0', JSON.stringify(cTekKelime));

console.log('\n3) 🔎 Akıllı arama & katalog yedek yönlendirmesi (sıfır 404)');
const cArama = seoUrunYedekCoz('bambu-olmayan-filament-x99', sahteListe);
kontrol('olmayan ürün → /?q=...&otomatik=0 arama yönlendirmesi',
  cArama?.tip === 'yonlendir' && cArama.hedef === '/?q=bambu%20olmayan%20filament%20x99&otomatik=0', JSON.stringify(cArama));

const cBos = seoUrunYedekCoz('x', sahteListe);
kontrol('çok kısa/anlamsız slug → /urunler',
  cBos?.tip === 'yonlendir' && cBos.hedef === '/urunler', JSON.stringify(cBos));

console.log('\n4) 📜 Sunucu & ön yüz sözleşmeleri');
const srv = fs.readFileSync('server.js', 'utf8');
kontrol('server.js seoUrunYedekCoz kullanıyor', /seoUrunYedekCoz/.test(srv));
kontrol('server.js 404 düz metin döndürmüyor', !srv.includes("res.status(404).type('text/plain').send('Ürün sayfası bulunamadı')"));

const appJs = fs.readFileSync('public/app.js', 'utf8');
kontrol('public/app.js ?q= parametresini destekliyor', /get\(['"]url['"]\)\s*\|\|\s*[^;]*get\(['"]q['"]\)/.test(appJs));

console.log('\n5) 📈 Ürün sayfası piyasa analizi & dinamik FAQPage');
const ornekHtml = urunSayfasiHtml({
  id: 'sentetik-1',
  ad: 'Porima PLA Filament Siyah 1kg',
  sorgu: 'Porima PLA Filament Siyah 1kg',
  kategoriSlug: 'pla-filament',
  slug: 'porima-pla-filament-siyah-1kg',
  yol: '/urun/porima-pla-filament-siyah-1kg',
  enUcuzFiyat: 463.68,
  enUcuzSite: 'Porima 3D',
  enUcuzUrl: 'https://porima3d.com/x',
  enPahaliFiyat: 599,
  stokluSayisi: 3,
  birimMetni: '₺463,68 / kg',
  teklifler: [
    { site: 'Porima 3D', fiyat: 463.68, kargo: 'Ücretsiz Kargo', stokta: true, url: 'https://porima3d.com/x' },
    { site: 'N11', fiyat: 599, kargo: 'Ücretsiz Kargo', stokta: true, url: 'https://n11.com/x' },
  ],
  lastmod: '2026-11-22',
}, 'https://baskihesap.tech', []);
kontrol('piyasa analizi bölümü var', ornekHtml.includes('Piyasa Analizi &amp; Fiyat Geçmişi Özeti'));
kontrol('mağaza farkı hesaplanır', ornekHtml.includes('135,32 TL') && ornekHtml.includes('%23'));
kontrol('iç linkler var (/maliyet.html, /sepet.html, /rehber/...)',
  ornekHtml.includes('/maliyet.html') && ornekHtml.includes('/sepet.html') && ornekHtml.includes('/rehber/pla-vs-petg-filament'));
kontrol('dinamik SSS akordeonu var', ornekHtml.includes('class="seo-sss"') && ornekHtml.includes('en ucuz hangi mağazada'));
kontrol('FAQPage JSON-LD şeması geçerli', (() => {
  const m = [...ornekHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const faq = m.map(x => JSON.parse(x[1])).find(j => j['@type'] === 'FAQPage');
  return Array.isArray(faq?.mainEntity) && faq.mainEntity.length >= 3;
})());

console.log('\n6) 🔗 Footer Hub & /urun <-> /karsilastir çapraz bağlantıları');
const p1sHtml = urunSayfasiHtml({
  id: 'sentetik-p1s',
  ad: 'Bambu Lab P1S 3D Yazıcı',
  sorgu: 'Bambu Lab P1S 3D Yazıcı',
  kategoriSlug: '3d-yazici',
  slug: 'bambu-lab-p1s-3d-yazici',
  yol: '/urun/bambu-lab-p1s-3d-yazici',
  enUcuzFiyat: 24261.65,
  enUcuzSite: 'FilamentMarketim',
  enUcuzUrl: 'https://filamentmarketim.com/x',
  stokluSayisi: 4,
  teklifler: [],
  lastmod: '2026-11-22',
}, 'https://baskihesap.tech', []);
kontrol('P1S sayfasında ilgili VS rehber kartları var',
  p1sHtml.includes('İlgili Karşılaştırma ve Alım Rehberleri')
  && p1sHtml.includes('/karsilastir/bambu-lab-p1s-vs-creality-k1c')
  && p1sHtml.includes('/karsilastir/creality-k1-max-vs-bambu-lab-p1s'));
kontrol('SSR footer-hub içerir', p1sHtml.includes('class="footer-hub"') && p1sHtml.includes('/kategori/3d-yazici-yedek-parca'));
for (const dosya of ['public/index.html', 'public/maliyet.html', 'public/slicer.html', 'public/sepet.html', 'public/ayarlar.html']) {
  const h = fs.readFileSync(dosya, 'utf8');
  kontrol(`${dosya} footer-hub içerir`, h.includes('class="footer-hub"') && h.includes('/kategori/3d-yazici') && h.includes('/rehber/en-ucuz-pla-filament'));
}

console.log('\n7) 📊 Yeni /karsilastir/ ve /rehber/ sayfaları + yönlendirme');
const rehberOrnekUrunler = [
  { slug: 'bambu-lab-a1-3d-yazici', yol: '/urun/bambu-lab-a1-3d-yazici', ad: 'Bambu Lab A1 3D Yazıcı', sorgu: 'Bambu Lab A1', marka: 'Bambu Lab', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 21500, stokluSayisi: 5, magazaSayisi: 5 },
  { slug: 'bambu-lab-a1-combo-3d-yazici', yol: '/urun/bambu-lab-a1-combo-3d-yazici', ad: 'Bambu Lab A1 Combo 3D Yazıcı', sorgu: 'Bambu Lab A1 Combo', marka: 'Bambu Lab', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 29900, stokluSayisi: 4, magazaSayisi: 4 },
  { slug: 'bambu-lab-a1-mini-3d-yazici', yol: '/urun/bambu-lab-a1-mini-3d-yazici', ad: 'Bambu Lab A1 Mini 3D Yazıcı', sorgu: 'Bambu Lab A1 Mini', marka: 'Bambu Lab', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 13200, stokluSayisi: 6, magazaSayisi: 6 },
  { slug: 'creality-k1c-3d-yazici', yol: '/urun/creality-k1c-3d-yazici', ad: 'Creality K1C 3D Yazıcı', sorgu: 'Creality K1C', marka: 'Creality', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 24600, stokluSayisi: 4, magazaSayisi: 4 },
  { slug: 'creality-ender-3-v3-ke', yol: '/urun/creality-ender-3-v3-ke', ad: 'Creality Ender 3 V3 KE 3D Yazıcı', sorgu: 'Creality Ender 3 V3 KE', marka: 'Creality', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 11800, stokluSayisi: 5, magazaSayisi: 5 },
  { slug: 'creality-ender-3-v3-ke-nozzle-kit', yol: '/urun/creality-ender-3-v3-ke-nozzle-kit', ad: 'Creality Ender 3 V3 KE Nozzle Kit', sorgu: 'Nozzle Kit', marka: 'Creality', kategori: 'yazici', kategoriSlug: '3d-yazici', enUcuzFiyat: 4001.3, stokluSayisi: 2, magazaSayisi: 2 },
  { slug: 'esun-petg-filament-siyah-1kg', yol: '/urun/esun-petg-filament-siyah-1kg', ad: 'eSun PETG Filament Siyah 1kg', sorgu: 'eSun PETG', marka: 'eSun', kategoriSlug: 'petg-tpu-filament', enUcuzFiyat: 620, stokluSayisi: 4, magazaSayisi: 4 },
  { slug: 'porima-tpu-filament-beyaz-1kg', yol: '/urun/porima-tpu-filament-beyaz-1kg', ad: 'Porima TPU Filament Beyaz 1kg', sorgu: 'Porima TPU', marka: 'Porima', kategoriSlug: 'petg-tpu-filament', enUcuzFiyat: 790, stokluSayisi: 3, magazaSayisi: 3 },
];

const yeniRehberYollari = [
  '/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini',
  '/karsilastir/bambu-lab-a1-vs-creality-k1c',
  '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
  '/rehber/en-ucuz-petg-ve-tpu-filamentler',
];
const sitemapYollari = new Set(rehberSitemapKayitlari().map((k) => k.yol));

for (const yol of yeniRehberYollari) {
  const kayit = rehberSayfasiBul(yol);
  kontrol(`rehberSayfasiBul(${yol}) mevcut`, !!kayit);
  kontrol(`sitemap kaydı var (${yol})`, sitemapYollari.has(yol));
  if (kayit) {
    const html = kayit.olustur(rehberOrnekUrunler, 'https://baskihesap.com');
    kontrol(`${yol} HTML ve BreadcrumbList içerir`, html.includes('BreadcrumbList') && html.includes('FAQPage') && html.length > 1000);
  }
}

const a1VsMiniHtml = rehberSayfasiBul('/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini')?.olustur(rehberOrnekUrunler, 'https://baskihesap.com') || '';
kontrol('A1 vs A1 Mini doğru eşleşir (Combo karışmaz)', a1VsMiniHtml.includes('/urun/bambu-lab-a1-3d-yazici') && a1VsMiniHtml.includes('/urun/bambu-lab-a1-mini-3d-yazici') && !a1VsMiniHtml.includes('/urun/bambu-lab-a1-combo-3d-yazici'));

const baslangicHtml = rehberSayfasiBul('/rehber/baslangic-icin-en-iyi-3d-yazicilar')?.olustur(rehberOrnekUrunler, 'https://baskihesap.com') || '';
kontrol('Başlangıç yazıcı rehberi parça ve Combo ürünleri eler', baslangicHtml.includes('Bambu Lab A1 Mini') && baslangicHtml.includes('Ender 3 V3 KE') && !baslangicHtml.includes('Nozzle Kit') && !baslangicHtml.includes('bambu-lab-a1-combo-3d-yazici'));

const dizinHtml = rehberDiziniHtml('https://baskihesap.com', rehberOrnekUrunler);
kontrol('Rehber dizini yeni sayfaları listeler', dizinHtml.includes('/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini') && dizinHtml.includes('/rehber/baslangic-icin-en-iyi-3d-yazicilar'));

const serverKaynak = fs.readFileSync('server.js', 'utf8');
kontrol("server.js /rehber/en-ucuz-petg-tpu-filament -> 301 yönlendirmesi içerir", serverKaynak.includes("'/rehber/en-ucuz-petg-tpu-filament'") && serverKaynak.includes("res.redirect(301, '/rehber/en-ucuz-petg-ve-tpu-filamentler')"));

console.log('\n8) 🌍 Çok dilli ürün kanoniği & ince sayfa noindex filtresi');
const enUrunHtml = urunSayfasiHtml({
  id: 'en-k1c',
  market: 'us',
  paraBirimi: 'USD',
  ad: 'Creality K1C 3D Printer',
  sorgu: 'Creality K1C',
  kategoriSlug: '3d-yazici',
  slug: 'creality-k1c-3d-printer',
  yol: '/urun/creality-k1c-3d-printer',
  enUcuzFiyat: 499,
  enUcuzSite: 'Creality US',
  stokluSayisi: 2,
  teklifler: [
    { site: 'Creality US', fiyat: 499, paraBirimi: 'USD', stokta: true, url: 'https://store.creality.com/k1c' },
    { site: 'Amazon US', fiyat: 529, paraBirimi: 'USD', stokta: true, url: 'https://amazon.com/k1c' },
  ],
}, 'https://baskihesap.tech', [{ id: 'en-k1', ad: 'Creality K1', kategoriSlug: '3d-yazici', slug: 'creality-k1', yol: '/urun/creality-k1', enUcuzFiyat: 399 }], { dil: 'en' });
kontrol('EN ürün sayfası self-canonical /en/urun/... basar (TR /urun/ kaçağı yok)',
  enUrunHtml.includes('<link rel="canonical" href="https://baskihesap.tech/en/urun/creality-k1c-3d-printer" />')
  && enUrunHtml.includes('href="/en?url=Creality%20K1C"')
  && enUrunHtml.includes('href="/en/urun/creality-k1"')
  && !enUrunHtml.includes('content="noindex'));

const tekMagazaBeslemeHtml = urunSayfasiHtml({
  id: 'feed-tek',
  kaynakTip: 'besleme',
  ad: 'Tek Magaza PLA Siyah 1kg',
  kategoriSlug: 'pla-filament',
  slug: 'tek-magaza-pla-siyah-1kg',
  yol: '/urun/tek-magaza-pla-siyah-1kg',
  enUcuzFiyat: 450,
  enUcuzSite: 'Robotistan',
  stokluSayisi: 1,
  teklifler: [{ site: 'Robotistan', fiyat: 450, stokta: true, url: 'https://robotistan.com/pla' }],
}, 'https://baskihesap.tech', []);
kontrol('Tek mağazalı besleme ürünü noindex, follow alır',
  tekMagazaBeslemeHtml.includes('<meta name="robots" content="noindex, follow" />')
  && !urunIndekslenebilirMi({ kaynakTip: 'besleme', enUcuzFiyat: 450, stokluSayisi: 1, teklifler: [{}] })
  && urunIndekslenebilirMi({ kaynakTip: 'besleme', enUcuzFiyat: 450, stokluSayisi: 2, teklifler: [{}, {}] })
  && !urunIndekslenebilirMi({ kaynakTip: 'radar', enUcuzFiyat: 0, stokluSayisi: 0, teklifler: [] }));

const trSitemap = sitemapKayitlari();
kontrol('sitemapKayitlari temel rotaları içerir ve tekli beslemeyi dışlar',
  trSitemap.some(k => k.yol === '/') && trSitemap.some(k => k.yol === '/maliyet.html'));

console.log('\n9) 🛡️ Hakkımızda, Gizlilik & İletişim (info@baskihesap.tech) sayfaları');
const guvenYollar = [
  '/hakkimizda', '/en/about', '/fr/a-propos', '/ja/about',
  '/gizlilik', '/en/privacy', '/fr/confidentialite', '/ja/privacy',
  '/iletisim', '/en/contact', '/fr/contact', '/ja/contact',
];
for (const gy of guvenYollar) {
  const rec = guvenSayfasiBul(gy);
  const html = rec ? rec.olustur('https://baskihesap.tech') : '';
  kontrol(`guvenSayfasiBul(${gy}) geçerli HTML ve info@baskihesap.tech üretir`,
    !!rec
    && html.includes(`lang="${rec.dil}"`)
    && html.includes(`<link rel="canonical" href="https://baskihesap.tech${gy}" />`)
    && html.includes('hreflang="en"')
    && html.includes('info@baskihesap.tech'));
}
kontrol('guvenSayfaSitemapKayitlari 12 URL üretir (4 dil × 3 sayfa)',
  guvenSayfaSitemapKayitlari().length === 12
  && guvenSayfaSitemapKayitlari('en').length === 3);

console.log('\n──────────────────────────────────────────────');
console.log(`Sonuç: ${gecen}/${gecen + kalan} kontrol geçti`);
if (kalan > 0) process.exit(1);
