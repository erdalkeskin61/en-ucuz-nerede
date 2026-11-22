/**
 * 🔍 `/urun/:slug` sıfır-404 akıllı çözümleme testleri.
 * Ağ isteği atmaz; geçici snapshot yazıp temizler.
 */
import fs from 'node:fs';
import { seoUrunYedekCoz, urunSayfasiHtml } from '../src/seoSayfalar.js';
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

console.log('\n──────────────────────────────────────────────');
console.log(`Sonuç: ${gecen}/${gecen + kalan} kontrol geçti`);
if (kalan > 0) process.exit(1);
