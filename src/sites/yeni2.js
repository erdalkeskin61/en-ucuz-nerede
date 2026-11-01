/**
 * Üçüncü parti siteler (2026-10-25) — kullanıcı isteğiyle eklenen 15 site.
 *
 * Platform eşleşmesi canlı ölçümle doğrulandı:
 *  - IdeaSoft klasik: 3dmarketim (arama /tumu-c-0?k= çalışıyor)
 *  - Ticimax: ventatek, umr3d  (/Arama?kelime=, kart: productName detailUrl)
 *  - İkas: fixx3d, robocombo  (arama istemci tarafında → render gerekir)
 *  - Özel platformlar: plt-genel.js ile yapılandırma
 *
 * idefix.com EKLENMEDİ: F5/Shape bot koruması tüm aramalara HTTP 511 döndürüyor
 * ve robots.txt arama yollarını yasaklıyor (Disallow: /search?*, *Search?q).
 * Dürüst davranış: koruma aşılmaya çalışılmaz, site listeye alınmaz.
 */
import { genelSite } from './plt-genel.js';
import { ikasSite } from './plt-ikas.js';
import { ticimaxSite } from './plt-ticimax.js';
import { filamentVaktiSite } from './plt-filamentvakti.js';
import { ideasoftKlasikSite } from './plt-ideasoft-klasik.js';
import { shopifySite } from './plt-shopify.js';

export const yeniSiteler2 = [
  // ---- Yeni Eklenen Siteler (2026-10-26) ----
  ticimaxSite({
    id: 'artyteknoloji', name: 'Arty Teknoloji',
    hosts: ['artyteknoloji.com', 'www.artyteknoloji.com'], base: 'https://www.artyteknoloji.com',
    aramaYolu: '/Arama?kelime=',
  }),
  shopifySite({
    id: 'filamenthane', name: 'Filamenthane',
    hosts: ['filamenthane.com', 'www.filamenthane.com'], base: 'https://filamenthane.com',
  }),
  ikasSite({
    id: 'tou3d', name: 'TOU3D',
    hosts: ['tou3d.com', 'www.tou3d.com'], base: 'https://tou3d.com',
  }),
  filamentVaktiSite({
    id: 'filamentvakti', name: 'Filament Vakti',
    hosts: ['filamentvakti.com', 'www.filamentvakti.com'], base: 'https://www.filamentvakti.com',
  }),
  ikasSite({
    id: 'robomer', name: 'Robomer',
    hosts: ['robomer.com', 'www.robomer.com'], base: 'https://robomer.com',
  }),

  // ---- IdeaSoft klasik ----
  ideasoftKlasikSite({
    id: '3dmarketim', name: '3DMarketim',
    hosts: ['3dmarketim.com', 'www.3dmarketim.com'], base: 'https://www.3dmarketim.com',
  }),

  // ---- Ticimax (kart: productName detailUrl + discountPriceSpan) ----
  ticimaxSite({
    id: 'ventatek', name: 'Ventatek',
    hosts: ['ventatek.com', 'www.ventatek.com'], base: 'https://www.ventatek.com',
    aramaYolu: '/Arama?kelime=',
  }),
  ticimaxSite({
    id: 'umr3d', name: 'UMR3D',
    hosts: ['umr3d.com', 'www.umr3d.com'], base: 'https://www.umr3d.com',
    aramaYolu: '/Arama?kelime=',
  }),

  // ---- İkas (arama istemci tarafında yüklenir → render) ----
  ikasSite({
    id: 'fixx3d', name: 'FIXX3D',
    hosts: ['fixx3d.com', 'www.fixx3d.com'], base: 'https://www.fixx3d.com',
    render: true,
  }),
  ikasSite({
    id: 'robocombo', name: 'Robocombo',
    hosts: ['robocombo.com', 'www.robocombo.com'], base: 'https://www.robocombo.com',
    render: true,
  }),

  // ---- Özel platformlar (genel adaptör) ----

  // Mikron3D — arama /?search=, kart: h3.product-name a + ins.new-price
  genelSite({
    id: 'mikron3d', name: 'Mikron3D',
    hosts: ['mikron3d.com', 'www.mikron3d.com'], base: 'https://www.mikron3d.com',
    aramaYolu: '/?search=',
    urunYolu: /-\d+-d\.html$/,
    kart: {
      baglanti: /<h3 class="product-name">\s*<a href="([^"]+)"/i,
      baslik: /<a href="[^"]+"[^>]*>([\s\S]{3,200}?)<\/a>/i,
      fiyat: [/<ins class="new-price">\s*([\d.,]+)\s*(?:TL|₺)/i, /class="new-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      pencere: 1600,
    },
    urun: {
      fiyat: [/<ins class="new-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="new-price product-detail-price"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      marka: [/<div class="product-brand[^"]*"[^>]*>[\s\S]{0,120}?<a[^>]*>([^<]{2,50})</i],
    },
  }),

  // ileri3d — arama /kategori?ara=, kart: .baslik a + span.indirimli-fiyat
  genelSite({
    id: 'ileri3d', name: 'ileri3d',
    hosts: ['ileri3d.com', 'www.ileri3d.com'], base: 'https://www.ileri3d.com',
    aramaYolu: '/kategori?ara=',
    urunYolu: /^\/urun\//,
    kart: {
      baglanti: /<div class="baslik[^"]*"><a[^>]+href="(\/urun\/[^"]+)"/i,
      baslik: /<a[^>]*>([\s\S]{3,200}?)<\/a>/i,
      fiyat: [/class="indirimli-fiyat[^"]*"[^>]*>\s*([\d.,]+)/i, /class="fiyat-son[^"]*"[^>]*>\s*([\d.,]+)/i],
      pencere: 2200,
    },
    urun: {
      fiyat: [/class="fiyat-son[^"]*"[^>]*>\s*([\d.,]+)/i, /class="indirimli-fiyat[^"]*"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      marka: [/class="marka[^"]*"[^>]*>\s*<a[^>]*>([^<]{2,50})</i],
    },
  }),

  // 3D Printer Ankara — arama /urunler?q=, Next.js kart: g-product-card__title + __price
  genelSite({
    id: '3dprinterankara', name: '3D Printer Ankara',
    hosts: ['3dprinterankara.com', 'www.3dprinterankara.com'], base: 'https://3dprinterankara.com',
    aramaYolu: '/urunler?q=',
    urunYolu: /^\/urun\//,
    kart: {
      baglanti: /<h3 class="g-product-card__title"><a href="([^"]+)"/i,
      baslik: /<a href="[^"]+"[^>]*>([\s\S]{3,200}?)<\/a>/i,
      fiyat: [/class="g-product-card__price">\s*₺?\s*([\d.,]+)/i],
      pencere: 1800,
    },
    urun: {
      fiyat: [/class="g-pdp__price"[^>]*>\s*₺?\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
    },
  }),

  // 3DCopyCenter — arama /?act=arama&str=, kart: div.urunlerim > a[title] + span.yfiyat
  genelSite({
    id: '3dcopycenter', name: '3DCopyCenter',
    hosts: ['3dcopycenter.com.tr', 'www.3dcopycenter.com.tr'], base: 'https://www.3dcopycenter.com.tr',
    aramaYolu: '/?act=arama&str=',
    urunYolu: /^\/[a-z0-9-]{10,}$/,
    kart: {
      baglanti: /<div class="urunlerim">\s*<a href="([^"]+)" title="/i,
      baslik: /title="([^"]{5,200})"/i,
      // yfiyat = indirimli (satış) fiyat; efiyat = üstü çizili liste fiyatı
      fiyat: [/<span class="yfiyat">\s*([\d.,]+)\s*(?:TL|₺)/i, /<span class="efiyat">\s*([\d.,]+)/i],
      pencere: 900,
    },
    urun: {
      fiyat: [/<span id="shopPHPUrunFiyatYTL">([\d.,]+)/i, /<p class="sfiyati">[\s\S]{0,80}?([\d.,]+)/i, /class="sfiyati"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/<p class="pfiyati">\s*([\d.,]+)/i],
      marka: [/<strong>Marka:<\/strong>[\s\S]{0,200}?<a[^>]*>([^<]{2,50})</i],
    },
  }),

  // Antalya 3D Market — arama /ara?q=, kart: h3.product-title a + span.current-price
  genelSite({
    id: 'antalya3dmarket', name: 'Antalya 3D Market',
    hosts: ['antalya3dmarket.com', 'www.antalya3dmarket.com'], base: 'https://antalya3dmarket.com',
    aramaYolu: '/ara?q=',
    urunYolu: /^\/urun\//,
    kart: {
      baglanti: /<h3 class="product-title"><a href="([^"]+)"/i,
      baslik: /<a href="[^"]+"[^>]*>([\s\S]{3,200}?)<\/a>/i,
      fiyat: [/class="current-price"[^>]*>\s*([\d.,]+)/i],
      pencere: 2500,
    },
    urun: {
      fiyat: [/class="pd-price-current[^"]*"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/class="pd-price-old"[^>]*>\s*([\d.,]+)/i],
    },
  }),

  // Tekno Bilsem — WooCommerce, arama /?s=...&post_type=product
  genelSite({
    id: 'teknobilsem', name: 'Tekno Bilsem',
    hosts: ['teknobilsem.com', 'www.teknobilsem.com'], base: 'https://teknobilsem.com',
    aramaYolu: '/?s=',
    aramaSonek: '&post_type=product',
    urunYolu: /^\/urun\//,
    urunHaric: /\/(sepet|cart|hesabim|account|iletisim|contact|blog|product-category|wishlist|compare)/i,
    kart: {
      // sayfa sonundaki &post_type=product kartları ürünle sınırlar (blog yazıları gelmesin)
      baglanti: /<h3 class="wd-entities-title"><a href="([^"]+)"/i,
      baslik: /<a href="[^"]+"[^>]*>([\s\S]{3,200}?)<\/a>/i,
      fiyat: [
        /<div class="wrapp-product-price">[\s\S]{0,500}?<\/span>\s*([\d.,]+)/i,
        /class="woocommerce-Price-amount amount">[\s\S]{0,200}?<\/span>\s*([\d.,]+)/i,
      ],
      pencere: 1400,
    },
    urun: {
      // DİKKAT: sayfadaki ilk woocommerce fiyatı SEPET toplamıdır (0,00).
      // Bu yüzden yalnızca ürün özetindeki `<p class="price">` hedeflenir.
      fiyat: [
        /<p class="price"[^>]*>[\s\S]{0,500}?<\/span>\s*([\d.,]+)/i,
        /<h1 class="product_title[^"]*"[\s\S]{0,1200}?<\/span>\s*([\d.,]+)/i,
      ],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/<del[^>]*>[\s\S]{0,300}?<\/span>\s*([\d.,]+)/i],
    },
  }),

  // Print3D — arama /arama?k=, kart: a.p3d-title + span.p3d-new-price
  genelSite({
    id: 'print3d', name: 'Print3D',
    hosts: ['print3d.com.tr', 'www.print3d.com.tr'], base: 'https://www.print3d.com.tr',
    aramaYolu: '/arama?k=',
    urunYolu: /^\/[a-z0-9][a-z0-9.\-]{6,}$/,
    urunHaric: /\/(sepet|cart|hesabim|account|iletisim|contact|blog|hakkimizda|kargo|iade|sss|siparis|uye|giris|kategori|marka)/i,
    kart: {
      baglanti: /<a href="([^"]+)" class="p3d-title"/i,
      baslik: /<a href="[^"]+"[^>]*title="([^"]{5,200})"/i,
      fiyat: [/class="p3d-new-price">\s*([\d.,]+)/i, /class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      pencere: 1200,
    },
    urun: {
      fiyat: [/class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="p3d-new-price">\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/class="list-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="p3d-old-price">\s*([\d.,]+)/i],
      marka: [/class="p3d-brand[^"]*"[^>]*>\s*([^<]{2,50})</i],
    },
  }),

  // Maker Fabrika — arama /arama?k=, kart: div.title + div.sale-price
  genelSite({
    id: 'makerfabrika', name: 'Maker Fabrika',
    hosts: ['makerfabrika.com', 'www.makerfabrika.com'], base: 'https://www.makerfabrika.com',
    aramaYolu: '/arama?k=',
    urunYolu: /^\/[a-z0-9][a-z0-9-]{5,}$/,
    urunHaric: /\/(sepet|cart|hesabim|account|iletisim|contact|blog|hakkimizda|kargo|iade|sss|siparis|uye|giris|kategori|marka)/i,
    kart: {
      baglanti: /<a href="([^"]+)"[^>]*>\s*<div class="product-reviews">/i,
      baslik: /<div class="title">\s*([\s\S]{3,200}?)\s*<\/div>/i,
      fiyat: [/class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="list-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      pencere: 1600,
    },
    urun: {
      fiyat: [/class="sale-price sale-variant-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/class="list-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      marka: [/<div class="brand">\s*([^<]{2,50})</i, /class="value">([^<]{2,50})</i],
    },
  }),

  // Pusula3D — arama /arama?k=, kart: a.c-p-i-link + div.title + div.sale-price
  genelSite({
    id: 'pusula3d', name: 'Pusula3D',
    hosts: ['pusula3d.com', 'www.pusula3d.com'], base: 'https://www.pusula3d.com',
    aramaYolu: '/arama?k=',
    urunYolu: /^\/[a-z0-9][a-z0-9-]{5,}$/,
    urunHaric: /\/(sepet|cart|hesabim|account|iletisim|contact|blog|hakkimizda|kargo|iade|sss|siparis|uye|giris|kategori|marka)/i,
    kart: {
      baglanti: /<a href="([^"]+)" class="c-p-i-link"/i,
      baslik: /class="c-p-i-link"[^>]*title="([^"]{5,200})"/i,
      fiyat: [/class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="list-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      pencere: 1800,
    },
    urun: {
      fiyat: [/class="sale-price sale-variant-price[^"]*"[^>]*>\s*([\d.,]+)/i, /class="sale-price[^"]*"[^>]*>\s*([\d.,]+)/i],
      baslik: [/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i],
      eskiFiyat: [/class="list-price[^"]*"[^>]*>\s*([\d.,]+)/i],
    },
  }),
];
