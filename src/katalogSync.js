/**
 * 🗂️ Mağaza Ürün Kataloğu Senkronizasyonu — 2026-11-17
 *
 * AMAÇ
 * ----
 * Kullanıcı "eSun PLA+" yazdığında 68 mağazayı tek tek HTTP/Chromium ile taramak
 * yerine, mağazaların **kendi yayınladığı kotasız beslemelerden** toplanan kalıcı
 * SQLite indeksinden (`katalog_urunleri`) milisaniyeler içinde aday bulmak.
 *
 * KAYNAKLAR (hepsi ücretsiz, API anahtarı yok)
 * -------------------------------------------
 *   1) **Shopify** → `/products.json?limit=250&page=N`
 *      Başlık, varyant fiyatı, stok, görsel, marka gelir. KDV dahildir.
 *   2) **WooCommerce Store API** → `/wp-json/wc/store/v1/products?per_page=100&page=N`
 *      `prices.price` minor unit + `currency_minor_unit` ile çevrilir; `is_in_stock`.
 *   3) **Ürün sitemap'i** → `/sitemap.xml` (index) → `*product*` alt sitemap'i
 *      Yalnızca URL + slug'dan türetilen başlık. **Fiyat YOK → fiyat NULL kalır.**
 *      (Uydurma fiyat yazmıyoruz; fiyat gerektiğinde ürün sayfasından okunur.)
 *   4) **Genel XML ürün beslemesi** (Google Merchant / RSS `g:` etiketleri)
 *      `g:price`, `g:availability`, `g:image_link`, `g:brand`.
 *
 * DÜRÜSTLÜK KURALLARI
 * -------------------
 *  • Fiyat yalnızca beslemede gerçekten varsa yazılır; yoksa `NULL`.
 *  • `guncellemeTs` = kaydın GERÇEK çekim zamanı (ms). Arayüz "X dk önce" der.
 *  • KDV: adaptörlerdeki kurallar aynen uygulanır — Shopify ve Türk mağaza
 *    beslemeleri KDV DAHİL fiyat yayımlar; Woo `prices.price` de satış fiyatıdır.
 *    KDV hariç fiyat yayımladığı bilinen siteler `kdvDahil:false` ile işaretlenir
 *    ve `kdvDahilFiyat()` uygulanır (sahte indirim üretmemek için).
 *  • Aynı ürün (siteId + urunUrl) tekildir; upsert edilir, kopya çoğalmaz.
 *
 * NAZİK MOD
 * ---------
 * Host başına istekler SIRALIDIR ve aralarında `KATALOG_HOST_ARASI_MS` (varsayılan
 * 900 ms) beklenir. Sayfa sayısı ve kayıt sayısı sınırlıdır; hedef siteler
 * yorulmaz. Senkron 6 saatte bir arka planda çalışır (env ile değiştirilir).
 */
import { dbBaglantisi } from './store.js';
import { adapterById, marketSiteIds, normalizeMarket, PAZARLAR } from './sites/index.js';
import { globalKatalogHedefleri } from './sites/global.js';
import { httpIste } from './impitIstemci.js';
import { titleSimilarity, toLowerTr, gercekMarkaBul } from './util.js';
import { kdvDahilFiyat, kdvOraniBul } from './kdv.js';

/* ================================================================== */
/* Ayarlar                                                            */
/* ================================================================== */

const sayiEnv = (ad, varsayilan) => {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n > 0 ? n : varsayilan;
};

/** Arama sırasında "taze" sayılan kayıt yaşı (varsayılan 30 dk). */
export const KATALOG_TTL_MS = sayiEnv('KATALOG_TTL_DK', 30) * 60 * 1000;
/** Arka plan senkron aralığı (varsayılan 6 saat). */
export const KATALOG_SYNC_ARALIK_MS = sayiEnv('KATALOG_SYNC_SAAT', 6) * 60 * 60 * 1000;
/** Host başına istekler arası bekleme (nazik mod). */
export const HOST_ARASI_MS = sayiEnv('KATALOG_HOST_ARASI_MS', 900);
/** Shopify/Woo sayfa boyu ve azami sayfa sayısı. */
const SAYFA_BOYU = 250;
const AZAMI_SAYFA = 4;
/** Site başına azami kayıt (DB şişmesin). */
const AZAMI_KAYIT = sayiEnv('KATALOG_AZAMI_KAYIT', 8000);
/** Sitemap indirme üst sınırı (bayt) — 10 MB'lık dosyaları yine alırız ama daha büyüğünü atlarız. */
const AZAMI_BAYT = sayiEnv('KATALOG_AZAMI_BAYT', 14 * 1024 * 1024);
/** Bu yaştan eski kayıtlar temizlenir. */
const ESKIME_GUN = sayiEnv('KATALOG_ESKIME_GUN', 21);

/** Para birimi bilinmeyen mağazalarda güvenli varsayılan. */
const VARSAYILAN_PARA = process.env.KATALOG_PARA_BIRIMI || 'TRY';

/**
 * Senkron hedefleri.
 *
 * `tur`:
 *   shopify → /products.json
 *   woo     → /wp-json/wc/store/v1/products
 *   sitemap → /sitemap.xml index → *product* alt sitemap (fiyatsız)
 *   xml     → doğrudan ürün beslemesi URL'si (`besleme`)
 *
 * `kdvDahil:false` yalnızca KDV hariç yayın yaptığı BİLİNEN siteler içindir.
 * Şüphedeysen true bırak (KDV'yi ikinci kez eklemek fiyatı şişirir).
 */
export const KATALOG_HEDEFLERI = [
  // ---- Shopify (tam veri: fiyat + stok + görsel) ----
  { siteId: 'porima3d', tur: 'shopify', base: 'https://porima3d.com' },
  { siteId: 'rfturkiye', tur: 'shopify', base: 'https://rfturkiye.com' },
  { siteId: 'filamenthane', tur: 'shopify', base: 'https://filamenthane.com' },
  { siteId: '3dteknomarket', tur: 'shopify', base: 'https://3dteknomarket.com' },

  // ---- Sitemap (fiyatsız indeks: anında URL keşfi) ----
  { siteId: 'robotistan', tur: 'sitemap', base: 'https://www.robotistan.com', cocukDeseni: /product/i },
  { siteId: 'robitshop', tur: 'sitemap', base: 'https://www.robitshop.com', cocukDeseni: /product/i },
  { siteId: '3dcim', tur: 'sitemap', base: 'https://3dcim.com', cocukDeseni: /products\//i },
  { siteId: 'kirpilab', tur: 'sitemap', base: 'https://kirpilab.com', cocukDeseni: /product/i },
  { siteId: 'efilament', tur: 'sitemap', base: 'https://efilament.com', cocukDeseni: /product/i },
  { siteId: 'matersan', tur: 'sitemap', base: 'https://matersan.com.tr', cocukDeseni: /product/i },
  { siteId: 'robotizmo', tur: 'sitemap', base: 'https://www.robotizmo.net', cocukDeseni: /product/i },

  // ---- Global US / FR / EU / JP mağazaları (Shopify + WooCommerce Store API) ----
  ...globalKatalogHedefleri,
];

/**
 * Ortam değişkeniyle ek hedef tanımlama:
 *   KATALOG_EK_FEEDLERI="siteId|shopify|https://ornek.com;site2|xml|https://ornek.com/feed.xml"
 */
function ekHedefler() {
  const ham = String(process.env.KATALOG_EK_FEEDLERI || '').trim();
  if (!ham) return [];
  const gecerliTur = new Set(['shopify', 'woo', 'sitemap', 'xml']);
  return ham.split(';').map((parca) => {
    const [siteId, tur, url] = parca.split('|').map(s => String(s || '').trim());
    if (!siteId || !gecerliTur.has(tur) || !url) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    if (tur === 'xml') return { siteId, tur, base: url, besleme: url };
    return { siteId, tur, base: url.replace(/\/+$/, '') };
  }).filter(Boolean);
}

export function katalogHedefleri() {
  return [...KATALOG_HEDEFLERI, ...ekHedefler()];
}

/* ================================================================== */
/* Yardımcılar                                                        */
/* ================================================================== */

const uyu = (ms) => new Promise(r => setTimeout(r, ms));

/** Türkçe-duyarlı sadeleştirme: arama indeksi için tek biçim. */
export function temizBaslik(metin) {
  return toLowerTr(String(metin || ''))
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
    // "PLA+" ↔ "PLA Plus" aynı üründür (mağazalar iki yazımı karışık kullanıyor).
    // `+` doğrudan tutulursa "eSun PLA+" sorgusu "eSun PLA Plus" kaydını bulamıyordu.
    .replace(/\+/g, ' plus ')
    // `.` ölçü kimliğidir: "1.75mm" tek kelime kalmalı; Japonca/Fransızca Unicode harfler korunur.
    .replace(/[^\p{L}\p{N}.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL slug'ından okunabilir başlık: "esun-pla-1-kg" → "Esun Pla 1 Kg". */
export function baslikFromSlug(slug) {
  const s = String(slug || '')
    .replace(/\.(html?|php|aspx)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.split(' ').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ');
}

/** Fiyatı güvenli biçimde sayıya çevirir; geçersizse null (uydurma yok). */
function fiyatSayisi(deger) {
  if (deger == null) return null;
  if (typeof deger === 'number') return Number.isFinite(deger) && deger > 0 ? deger : null;
  const s = String(deger).replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  // "1.234,56" (TR) veya "1234.56" (US) ayrımı: son ayırıcı ondalık kabul edilir.
  const sonVirgul = s.lastIndexOf(',');
  const sonNokta = s.lastIndexOf('.');
  let normalize = s;
  if (sonVirgul > sonNokta) normalize = s.replace(/\./g, '').replace(',', '.');
  else if (sonNokta > -1) normalize = s.replace(/,/g, '');
  const n = Number(normalize);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ================================================================== */
/* Parser'lar (test için dışa açık)                                   */
/* ================================================================== */

/**
 * Shopify `/products.json` → katalog satırları.
 *
 * Fiyat seçimi: stokta olan varyantların EN DÜŞÜĞÜ; hiçbiri stokta değilse
 * tüm varyantların en düşüğü. `variants[0]` kullanmak yanlıştı (3kg varyantı
 * 1kg ürünün fiyatını gizliyordu — plt-shopify.js ile aynı ders).
 */
export function shopifyUrunleriCoz(json, hedef = {}) {
  const urunler = Array.isArray(json?.products) ? json.products : (Array.isArray(json) ? json : []);
  const siteId = hedef.siteId || json?.siteId || 'bilinmiyor';
  const base = String(hedef.base || '').replace(/\/+$/, '');
  const simdi = hedef.simdi || Date.now();
  const kdvDahil = hedef.kdvDahil !== false;
  const oran = hedef.kdvOrani || 20;

  const satirlar = [];
  for (const p of urunler) {
    const handle = String(p?.handle || '').trim();
    if (!handle || !p?.title) continue;
    const varyantlar = Array.isArray(p.variants) ? p.variants : [];
    const stoklu = varyantlar.filter(v => v && v.available !== false && v.price != null);
    const havuz = stoklu.length ? stoklu : varyantlar.filter(v => v && v.price != null);
    const fiyatlar = havuz
      .map(v => {
        // DİKKAT (2026-11-17): `/products.json` (REST) fiyatı **mağaza para
        // biriminde ondalık dize** döndürür ("28000.00" = 28.000 TL).
        // Buna karşın `/products/<handle>.js` (AJAX) kuruş döndürür ve
        // plt-shopify.js orada /100 yapar. İkisini karıştırmak fiyatı 100×
        // küçültüyordu → katalogda 400,32 TL ürün "4,00 TL" görünüyordu.
        return fiyatSayisi(v.price);
      })
      .filter(x => x != null);
    let fiyat = fiyatlar.length ? Math.min(...fiyatlar) : null;
    if (fiyat != null && !kdvDahil) fiyat = kdvDahilFiyat(fiyat, oran);

    const gorsel = Array.isArray(p.images) && p.images.length
      ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.src || null)
      : (p.image?.src || null);

    const baslik = String(p.title).trim();
    const siteAd = hedef.siteName || adapterById(siteId)?.name || siteId;
    const temizMarka = gercekMarkaBul(p.vendor, baslik, siteId, siteAd);
    satirlar.push({
      siteId,
      urunUrl: base + '/products/' + handle,
      baslik,
      temizBaslik: temizBaslik(baslik),
      marka: temizMarka,
      fiyat,
      stokta: varyantlar.length ? (varyantlar.some(v => v && v.available !== false) ? 1 : 0) : null,
      gorselUrl: gorsel,
      paraBirimi: hedef.paraBirimi || VARSAYILAN_PARA,
      kaynakTur: 'shopify',
      guncellemeTs: simdi,
    });
    if (satirlar.length >= AZAMI_KAYIT) break;
  }
  return satirlar;
}

/** WooCommerce Store API (`/wp-json/wc/store/v1/products`) → katalog satırları. */
export function wooUrunleriCoz(dizi, hedef = {}) {
  const urunler = Array.isArray(dizi) ? dizi : (Array.isArray(dizi?.products) ? dizi.products : []);
  const siteId = hedef.siteId || 'bilinmiyor';
  const simdi = hedef.simdi || Date.now();
  const kdvDahil = hedef.kdvDahil !== false;
  const oran = hedef.kdvOrani || 20;

  const satirlar = [];
  for (const p of urunler) {
    const url = String(p?.permalink || p?.link || '').trim();
    const baslik = String(p?.name || '').trim();
    if (!url || !baslik) continue;

    // Store API fiyatı "minor unit" (kuruş) ve `currency_minor_unit` ile gelir.
    const minor = Number.isFinite(Number(p?.prices?.currency_minor_unit))
      ? Number(p.prices.currency_minor_unit) : 2;
    let fiyat = fiyatSayisi(p?.prices?.price);
    if (fiyat != null) fiyat = fiyat / Math.pow(10, minor);
    if (fiyat != null && !kdvDahil) fiyat = kdvDahilFiyat(fiyat, oran);

    satirlar.push({
      siteId,
      urunUrl: url,
      baslik,
      temizBaslik: temizBaslik(baslik),
      marka: Array.isArray(p?.brands) && p.brands.length ? String(p.brands[0]?.name || p.brands[0]) : null,
      fiyat,
      stokta: typeof p?.is_in_stock === 'boolean' ? (p.is_in_stock ? 1 : 0) : null,
      gorselUrl: p?.images?.[0]?.src || p?.images?.[0]?.thumbnail || null,
      paraBirimi: p?.prices?.currency_code || VARSAYILAN_PARA,
      kaynakTur: 'woo',
      guncellemeTs: simdi,
    });
    if (satirlar.length >= AZAMI_KAYIT) break;
  }
  return satirlar;
}

/** Sitemap/I-RSS XML'inden `<loc>` (ve varsa `<lastmod>`) listesi. */
export function sitemapUrlCoz(xml) {
  const metin = String(xml || '');
  const kayitlar = [];
  const bloklar = metin.match(/<(?:url|sitemap)\b[\s\S]*?<\/(?:url|sitemap)>/gi) || [];
  for (const blok of bloklar) {
    const loc = blok.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = blok.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] || null;
    kayitlar.push({ loc: loc.replace(/&amp;/g, '&').trim(), lastmod });
  }
  // <urlset> düz listelerde blok eşleşmesi tutmazsa düz <loc> taraması.
  if (!kayitlar.length) {
    for (const m of metin.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
      kayitlar.push({ loc: m[1].replace(/&amp;/g, '&').trim(), lastmod: null });
    }
  }
  return {
    indexMi: /<sitemapindex\b/i.test(metin),
    kayitlar,
  };
}

/**
 * Ürün sitemap'i → katalog satırları (FİYATSIZ).
 * Fiyat/stok beslemede yoksa NULL kalır — uydurma yapılmaz.
 */
export function sitemapUrunlerCoz(xml, hedef = {}) {
  const siteId = hedef.siteId || 'bilinmiyor';
  const simdi = hedef.simdi || Date.now();
  const urunDeseni = hedef.urunDeseni || null;
  const { kayitlar } = sitemapUrlCoz(xml);
  const satirlar = [];
  for (const k of kayitlar) {
    const url = k.loc;
    if (!/^https?:\/\//i.test(url)) continue;
    if (urunDeseni && !urunDeseni.test(url)) continue;
    let slug = '';
    try {
      const u = new URL(url);
      slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    } catch { continue; }
    if (!slug) continue;
    // Ticimax/T-Soft ürün URL'lerinde son parça "-<id>" ile bitebilir: at.
    const temizSlug = slug.replace(/-\d{2,6}$/, '').replace(/\.html?$/i, '');
    const baslik = baslikFromSlug(temizSlug);
    if (!baslik || baslik.length < 5) continue;
    satirlar.push({
      siteId,
      urunUrl: url.split('?')[0],
      baslik,
      temizBaslik: temizBaslik(baslik),
      marka: null,
      fiyat: null,        // ⚠️ sitemap'te fiyat yok
      stokta: null,       // ⚠️ sitemap'te stok yok
      gorselUrl: null,
      paraBirimi: VARSAYILAN_PARA,
      kaynakTur: 'sitemap',
      guncellemeTs: simdi,
    });
    if (satirlar.length >= AZAMI_KAYIT) break;
  }
  return satirlar;
}

/**
 * Genel XML ürün beslemesi (Google Merchant RSS: `g:price`, `g:availability`).
 * Fiyat/para birimi gerçekten etikette varsa yazılır.
 */
export function xmlUrunleriCoz(xml, hedef = {}) {
  const metin = String(xml || '');
  const siteId = hedef.siteId || 'bilinmiyor';
  const simdi = hedef.simdi || Date.now();
  const kdvDahil = hedef.kdvDahil !== false;
  const oran = hedef.kdvOrani || (hedef.base ? kdvOraniBul(metin) : null) || 20;
  const kayitlar = metin.match(/<item\b[\s\S]*?<\/item>/gi)
    || metin.match(/<entry\b[\s\S]*?<\/entry>/gi)
    || [];
  const al = (blok, etiket) => {
    const m = blok.match(new RegExp('<(?:g:)?' + etiket + '>\\s*([\\s\\S]*?)\\s*</(?:g:)?' + etiket + '>', 'i'));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
  };

  const satirlar = [];
  for (const blok of kayitlar) {
    const baslik = al(blok, 'title');
    const url = al(blok, 'link') || al(blok, 'id');
    if (!baslik || !url || !/^https?:\/\//i.test(url)) continue;

    const hamFiyat = al(blok, 'price') || al(blok, 'sale_price');
    let fiyat = fiyatSayisi(hamFiyat);
    if (fiyat != null && !kdvDahil) fiyat = kdvDahilFiyat(fiyat, oran);
    const para = (String(hamFiyat || '').match(/\b(TRY|USD|EUR|GBP)\b/i)?.[1]
      || al(blok, 'currency') || VARSAYILAN_PARA).toUpperCase();

    const stok = String(al(blok, 'availability') || '').toLowerCase();
    const stokta = /in[\s_-]?stock|stokta/.test(stok) ? 1
      : (/out[\s_-]?of[\s_-]?stock|tükendi|tukendi/.test(stok) ? 0 : null);

    satirlar.push({
      siteId,
      urunUrl: url,
      baslik,
      temizBaslik: temizBaslik(baslik),
      marka: al(blok, 'brand'),
      fiyat,
      stokta,
      gorselUrl: al(blok, 'image_link') || al(blok, 'image') || null,
      paraBirimi: para,
      kaynakTur: 'xml',
      guncellemeTs: simdi,
    });
    if (satirlar.length >= AZAMI_KAYIT) break;
  }
  return satirlar;
}

/* ================================================================== */
/* SQLite yazma / okuma                                               */
/* ================================================================== */

let yazmaHazir = null;

function yazmaDeyimi(db) {
  if (yazmaHazir) return yazmaHazir;
  yazmaHazir = db.prepare(`
    INSERT INTO katalog_urunleri
      (siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta,
       gorselUrl, paraBirimi, kaynakTur, guncellemeTs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(siteId, urunUrl) DO UPDATE SET
      baslik = excluded.baslik,
      temizBaslik = excluded.temizBaslik,
      marka = excluded.marka,
      fiyat = excluded.fiyat,
      stokta = excluded.stokta,
      gorselUrl = excluded.gorselUrl,
      paraBirimi = excluded.paraBirimi,
      kaynakTur = excluded.kaynakTur,
      guncellemeTs = excluded.guncellemeTs
  `);
  return yazmaHazir;
}

/**
 * Satırları tek işlemde yazar (upsert). Kısmi hata tüm partiyi bozmaz:
 * satır satır denenir, hata sayısı raporlanır.
 *
 * @returns {{yazilan:number, hata:number}}
 */
export function katalogSatirlariYaz(satirlar) {
  const liste = Array.isArray(satirlar) ? satirlar : [];
  if (!liste.length) return { yazilan: 0, hata: 0 };
  const db = dbBaglantisi();
  const stmt = yazmaDeyimi(db);
  let yazilan = 0;
  let hata = 0;
  try {
    db.exec('BEGIN IMMEDIATE');
  } catch {
    // Kilit varsa (başka yazar) işlemsiz devam — yavaş ama güvenli.
  }
  for (const s of liste) {
    try {
      stmt.run(
        s.siteId, s.urunUrl, s.baslik, s.temizBaslik,
        s.marka ?? null, s.fiyat ?? null,
        s.stokta === null || s.stokta === undefined ? null : (s.stokta ? 1 : 0),
        s.gorselUrl ?? null, s.paraBirimi ?? null, s.kaynakTur || 'xml',
        s.guncellemeTs || Date.now(),
      );
      yazilan++;
    } catch {
      hata++;
    }
  }
  try { db.exec('COMMIT'); } catch { /* işlem başlamamış olabilir */ }
  return { yazilan, hata };
}

/** Eski kayıtları siler (varsayılan 21 gün). */
export function katalogEskileriTemizle(gun = ESKIME_GUN) {
  const esik = Date.now() - Math.max(1, Number(gun) || ESKIME_GUN) * 86400000;
  try {
    const r = dbBaglantisi().prepare('DELETE FROM katalog_urunleri WHERE guncellemeTs < ?').run(esik);
    return Number(r?.changes || 0);
  } catch {
    return 0;
  }
}

const ARAMA_STOPWORD = new Set([
  've', 'ile', 'icin', 'için', 'bir', 'the', 'and', 'for', 'adet', 'set',
  'yeni', 'orijinal', 'original', 'fiyat', 'ucuz', 'en', 'cok', 'çok',
]);

/** Sorguyu anlamlı kelimelere ayırır (Türkçe sadeleştirilmiş). */
export function sorguKelimeleri(sorgu) {
  return temizBaslik(sorgu)
    .split(' ')
    .filter(w => w.length >= 2 && !ARAMA_STOPWORD.has(w))
    // Saf sayılar bütçe ya da adet olabilir ("1200", "3") → ürün kelimesi değil.
    // Ölçüler ("1.75", "1kg") korunur: bunlar ürün kimliğinin parçasıdır.
    .filter(w => !/^\d+$/.test(w))
    .filter((w, i, a) => a.indexOf(w) === i);
}

/**
 * Katalog indeksinde arama — AĞ İSTEĞİ YOK.
 *
 * @param {string} sorgu
 * @param {{ttlMs?:number, limit?:number, siteId?:string, tumKayitlar?:boolean}} [opts]
 *   `ttlMs: 0` → tazelik filtresi kapalı (teşhis/panel için tüm kayıtlar).
 * @returns {Array<object>} en iyi eşleşmeler (fiyatı olanlar önce)
 */
export function katalogUrunleriAra(sorgu, opts = {}) {
  const kelimeler = sorguKelimeleri(sorgu);
  if (!kelimeler.length) return [];
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 12));
  const ttl = Number.isFinite(opts.ttlMs) ? opts.ttlMs : KATALOG_TTL_MS;
  const esik = ttl > 0 ? Date.now() - ttl : 0;

  try {
    const db = dbBaglantisi();
    const kosullar = kelimeler.map(() => 'temizBaslik LIKE ?');
    const parametreler = kelimeler.map(w => '%' + w + '%');
    let sql = `SELECT siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta,
                      gorselUrl, paraBirimi, kaynakTur, guncellemeTs
               FROM katalog_urunleri WHERE guncellemeTs >= ?`;
    if (opts.siteId) { sql += ' AND siteId = ?'; }
    sql += ' AND ' + kosullar.join(' AND ');
    sql += ' LIMIT 400';
    const args = [esik];
    if (opts.siteId) args.push(String(opts.siteId));
    args.push(...parametreler);

    const satirlar = db.prepare(sql).all(...args);
    const etkinMarket = opts.market ? normalizeMarket(opts.market) : null;
    const pazarFiltresi = (!opts.siteId && etkinMarket) ? marketSiteIds(etkinMarket) : null;
    const beklenenPara = (!opts.siteId && etkinMarket) ? PAZARLAR[etkinMarket]?.currency : null;
    const pazarSatirlari = pazarFiltresi
      ? satirlar.filter(s => (pazarFiltresi.has(s.siteId) || (!adapterById(s.siteId) && etkinMarket === 'tr'))
        && (!beklenenPara || !s.paraBirimi || s.paraBirimi === beklenenPara))
      : satirlar;
    const simdi = Date.now();
    const puanli = pazarSatirlari.map((s) => {
      const ad = String(s.temizBaslik || '');
      let eslesen = 0;
      for (const w of kelimeler) if (ad.includes(w)) eslesen++;
      const kapsam = eslesen / kelimeler.length;
      // Fiyatı olan kayıt daha değerli (doğrudan kıyas üretir).
      const fiyatPuani = s.fiyat != null ? 0.25 : 0;
      return {
        ...s,
        skor: kapsam + fiyatPuani,
        kapsam,
        yasMs: simdi - Number(s.guncellemeTs || 0),
      };
    }).filter(s => s.kapsam >= 0.99); // tüm anlamlı kelimeler geçmeli (yanlış eşleşme yok)

    puanli.sort((a, b) => (b.skor - a.skor)
      || ((a.fiyat == null ? 1 : 0) - (b.fiyat == null ? 1 : 0))
      || ((a.fiyat || Infinity) - (b.fiyat || Infinity)));
    return puanli.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Belirli bir mağazada kaynak ürünle eşleşen taze katalog kaydı.
 * Pipeline'da "mağazayı hiç aramadan" kısayol üretmek için kullanılır.
 *
 * Eşleşme kanıtı: temiz başlık kelime kapsamı ≥ 0.75 VE başlık benzerliği
 * ≥ 0.55. Fiyat/stok beslemeden geldiği gibi döner (NULL olabilir).
 */
export function katalogSiteAdayi(siteId, kaynak, opts = {}) {
  const baslik = typeof kaynak === 'string' ? kaynak : kaynak?.title;
  if (!siteId || !baslik) return null;
  const adapter = adapterById(siteId);
  const siteAdiKelimeleri = new Set(temizBaslik(adapter?.name || '').split(' '));
  const kelimeler = sorguKelimeleri(baslik).filter((w) => {
    // Mağaza adı başlığa önek olarak eklenmiş olabilir ("Filamenthane Snapmaker
    // U1 3D Yazıcı"). Bu kelimeler eşleşme kanıtı SAYILMAZ; kısa/ürün terimleri
    // ("3d", "pla") asla atılmaz.
    if (w.length >= 5 && siteAdiKelimeleri.has(w)) return false;
    return true;
  });
  if (!kelimeler.length) return null;
  const ttl = Number.isFinite(opts.ttlMs) ? opts.ttlMs : KATALOG_TTL_MS;
  if (!(ttl > 0)) return null;
  const esik = Date.now() - ttl;

  try {
    const db = dbBaglantisi();
    // SQL ön elemesi: en uzun 3 kelimeden HERHANGİ BİRİ (OR).
    // Neden AND değil: başlıkta katalogda olmayan bir kelime (mağaza öneki,
    // varyant adı) olabilir. Tam kelime kapsamı aşağıda JS'te uygulanır.
    const anahtar = [...kelimeler].sort((a, b) => b.length - a.length).slice(0, 3);
    const kosullar = anahtar.map(() => 'temizBaslik LIKE ?');
    const satirlar = db.prepare(`
      SELECT siteId, urunUrl, baslik, temizBaslik, marka, fiyat, stokta,
             gorselUrl, paraBirimi, kaynakTur, guncellemeTs
      FROM katalog_urunleri
      WHERE siteId = ? AND guncellemeTs >= ? AND (${kosullar.join(' OR ')})
      ORDER BY guncellemeTs DESC
      LIMIT 200
    `).all(siteId, esik, ...anahtar.map(w => '%' + w + '%'));

    const simdi = Date.now();
    let enIyi = null;
    for (const s of satirlar) {
      const ad = String(s.temizBaslik || '');
      let eslesen = 0;
      for (const w of kelimeler) if (ad.includes(w)) eslesen++;
      const kapsam = eslesen / kelimeler.length;
      // Varyant başlıkları: kaynak "Snapmaker U1 3D Yazıcı - 4 Kafa", katalog
      // "Snapmaker U1 3D Yazıcı". Saf benzerlik cezalandırıyordu; katalog adı
      // kaynak adının içinde geçiyorsa (≥8 karakter) güçlü kanıt sayılır.
      // Nihai varyant doğrulaması yine `matchProducts` ile yapılır.
      const kaynakTemiz = temizBaslik(baslik);
      const kapsama = ad.length >= 8 && kaynakTemiz.includes(ad) ? 0.9 : 0;
      const benzerlik = Math.max(titleSimilarity(baslik, s.baslik), kapsama);
      if (kapsam < 0.75 || benzerlik < 0.55) continue;
      const puan = kapsam + benzerlik;
      if (!enIyi || puan > enIyi.puan) {
        enIyi = { ...s, kapsam, benzerlik, puan, yasMs: simdi - Number(s.guncellemeTs || 0) };
      }
    }
    return enIyi;
  } catch {
    return null;
  }
}

// ⚠️ Not: fonksiyon adı ASCII tutulur; Türkçe tanımlayıcı bazı araç
// zincirlerinde/transpiler'larda sorun çıkarır.

/* ================================================================== */
/* Besleme çekme                                                      */
/* ================================================================== */

/**
 * Kotasız besleme çekimi.
 *
 * ⚠️ 2026-11-17 düzeltmesi: `AbortSignal.timeout()` GÖVDE okunurken de iptal
 * ediyordu. Büyük sitemap'lerde (robotistan ürün sitemap'i ~10 MB) başlıklar
 * geldikten sonra gövde okuması yarıda kesiliyor ve
 * "Error reading response stream: TimedOut" alınıyordu. Artık iptal sinyali
 * YOK; yalnızca istek düzeyinde cömert bir `timeout` veriliyor.
 */
async function beslemeCek(url, { timeoutMs = 60000 } = {}) {
  const t0 = Date.now();
  const { response, katman, ms } = await httpIste(url, {
    redirect: 'follow',
    headers: {
      'Accept': 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    },
    timeout: timeoutMs,
  });
  const boyut = Number(response.headers.get('content-length') || 0);
  if (boyut > AZAMI_BAYT) {
    throw new Error(`yanıt çok büyük (${Math.round(boyut / 1048576)} MB > ${Math.round(AZAMI_BAYT / 1048576)} MB)`);
  }
  const govde = await response.text();
  if (govde.length > AZAMI_BAYT) {
    throw new Error(`yanıt çok büyük (${Math.round(govde.length / 1048576)} MB)`);
  }
  return { durum: response.status, govde, katman, ms, boyut: govde.length, toplamMs: Date.now() - t0 };
}

/** JSON yanıtı güvenle ayrıştırır; HTML dönerse anlaşılır hata verir. */
function jsonCoz(govde, baglam) {
  const metin = String(govde || '').trim();
  if (!metin) throw new Error(`${baglam}: boş yanıt`);
  if (metin.startsWith('<')) {
    throw new Error(`${baglam}: JSON yerine HTML döndü (uç nokta kapalı/redirect)`);
  }
  return JSON.parse(metin);
}

/**
 * Bir hedefi senkronize eder; yazılan satır sayısını ve hataları döndürür.
 */
async function hedefSenkronize(hedef, { onProgress = null } = {}) {
  const adapter = adapterById(hedef.siteId);
  const rapor = {
    siteId: hedef.siteId,
    siteName: adapter?.name || hedef.siteId,
    tur: hedef.tur,
    sayfa: 0,
    cekilen: 0,
    yazilan: 0,
    hata: null,
    sureMs: 0,
    istekMs: [],
    katman: null,
  };
  const t0 = Date.now();
  const satirlar = [];
  const simdi = Date.now();

  try {
    if (hedef.tur === 'shopify') {
      for (let sayfa = 1; sayfa <= AZAMI_SAYFA; sayfa++) {
        const url = `${hedef.base}/products.json?limit=${SAYFA_BOYU}&page=${sayfa}`;
        const r = await beslemeCek(url);
        if (r.durum !== 200) throw new Error(`Shopify HTTP ${r.durum}`);
        const json = jsonCoz(r.govde, 'Shopify products.json');
        const urunler = Array.isArray(json?.products) ? json.products : [];
        rapor.sayfa++;
        rapor.istekMs.push(r.ms);
        rapor.katman = r.katman;
        if (!urunler.length) break;
        const parti = shopifyUrunleriCoz({ products: urunler }, {
          siteId: hedef.siteId, base: hedef.base, simdi,
          kdvDahil: hedef.kdvDahil !== false, kdvOrani: hedef.kdvOrani,
          paraBirimi: hedef.paraBirimi,
        });
        satirlar.push(...parti);
        rapor.cekilen += urunler.length;
        if (urunler.length < SAYFA_BOYU) break;
        if (satirlar.length >= AZAMI_KAYIT) break;
        await uyu(HOST_ARASI_MS);
      }
    } else if (hedef.tur === 'woo') {
      for (let sayfa = 1; sayfa <= AZAMI_SAYFA; sayfa++) {
        const url = `${hedef.base}/wp-json/wc/store/v1/products?per_page=100&page=${sayfa}`;
        const r = await beslemeCek(url);
        if (r.durum !== 200) throw new Error(`WooCommerce HTTP ${r.durum}`);
        const dizi = jsonCoz(r.govde, 'WooCommerce Store API');
        rapor.sayfa++;
        rapor.istekMs.push(r.ms);
        rapor.katman = r.katman;
        if (!Array.isArray(dizi) || !dizi.length) break;
        const parti = wooUrunleriCoz(dizi, {
          siteId: hedef.siteId, simdi,
          kdvDahil: hedef.kdvDahil !== false, kdvOrani: hedef.kdvOrani,
        });
        satirlar.push(...parti);
        rapor.cekilen += dizi.length;
        if (dizi.length < 100) break;
        if (satirlar.length >= AZAMI_KAYIT) break;
        await uyu(HOST_ARASI_MS);
      }
    } else if (hedef.tur === 'sitemap') {
      const sitemapYolu = hedef.sitemapYolu || '/sitemap.xml';
      const kok = await beslemeCek(hedef.base + sitemapYolu);
      if (kok.durum !== 200) throw new Error(`Sitemap HTTP ${kok.durum}`);
      rapor.sayfa++;
      rapor.istekMs.push(kok.ms);
      rapor.katman = kok.katman;
      const cozum = sitemapUrlCoz(kok.govde);

      let urunSitemaplari = [];
      if (cozum.indexMi) {
        const desen = hedef.cocukDeseni || /product|urun/i;
        urunSitemaplari = cozum.kayitlar
          .map(k => k.loc)
          .filter(u => desen.test(u))
          .slice(0, 4);
      } else {
        urunSitemaplari = [hedef.base + sitemapYolu];
      }
      if (!urunSitemaplari.length) {
        throw new Error('Sitemap index içinde ürün sitemap\'i bulunamadı');
      }

      for (const u of urunSitemaplari) {
        const r = await beslemeCek(u);
        rapor.sayfa++;
        rapor.istekMs.push(r.ms);
        if (r.durum !== 200) continue;
        const parti = sitemapUrunlerCoz(r.govde, {
          siteId: hedef.siteId, simdi, urunDeseni: hedef.urunDeseni || null,
        });
        satirlar.push(...parti);
        rapor.cekilen += parti.length;
        if (satirlar.length >= AZAMI_KAYIT) break;
        await uyu(HOST_ARASI_MS);
      }
    } else if (hedef.tur === 'xml') {
      const r = await beslemeCek(hedef.besleme || hedef.base);
      if (r.durum !== 200) throw new Error(`XML besleme HTTP ${r.durum}`);
      rapor.sayfa++;
      rapor.istekMs.push(r.ms);
      rapor.katman = r.katman;
      const parti = xmlUrunleriCoz(r.govde, {
        siteId: hedef.siteId, base: hedef.base, simdi,
        kdvDahil: hedef.kdvDahil !== false, kdvOrani: hedef.kdvOrani,
      });
      satirlar.push(...parti);
      rapor.cekilen += parti.length;
    } else {
      throw new Error('Bilinmeyen besleme türü: ' + hedef.tur);
    }

    // Tek işlemde yaz.
    const sonuc = katalogSatirlariYaz(satirlar.slice(0, AZAMI_KAYIT));
    rapor.yazilan = sonuc.yazilan;
    if (sonuc.hata) rapor.hata = `${sonuc.hata} satır yazılamadı`;
  } catch (e) {
    rapor.hata = String(e?.message || e).slice(0, 220);
  }

  rapor.sureMs = Date.now() - t0;
  if (onProgress) onProgress(rapor);
  return rapor;
}

/* ================================================================== */
/* Senkron durumu & çalıştırıcı                                       */
/* ================================================================== */

const durum = {
  calisiyor: false,
  sonBaslangic: null,
  sonBitis: null,
  sonSureMs: null,
  sonRapor: null,       // { hedefler: [...], toplamYazilan, toplamCekilen, hatalar }
  hata: null,
  baslatan: null,
  aralikMs: KATALOG_SYNC_ARALIK_MS,
};

let zamanlayici = null;
let devamEdiyor = null;

/** Panel için katalog senkron durumu + DB sayımları. */
export function katalogSyncDurumu() {
  let sayim = { toplam: 0, fiyatli: 0, stokta: 0 };
  let siteler = [];
  let enSonTs = null;
  try {
    const db = dbBaglantisi();
    const t = db.prepare(`
      SELECT COUNT(*) AS toplam,
             SUM(CASE WHEN fiyat IS NOT NULL THEN 1 ELSE 0 END) AS fiyatli,
             SUM(CASE WHEN stokta = 1 THEN 1 ELSE 0 END) AS stokta,
             MAX(guncellemeTs) AS enSonTs
      FROM katalog_urunleri
    `).get();
    sayim = {
      toplam: Number(t?.toplam || 0),
      fiyatli: Number(t?.fiyatli || 0),
      stokta: Number(t?.stokta || 0),
    };
    enSonTs = t?.enSonTs ? Number(t.enSonTs) : null;
    siteler = db.prepare(`
      SELECT siteId,
             COUNT(*) AS adet,
             SUM(CASE WHEN fiyat IS NOT NULL THEN 1 ELSE 0 END) AS fiyatli,
             MAX(guncellemeTs) AS enSonTs
      FROM katalog_urunleri
      GROUP BY siteId
      ORDER BY adet DESC
    `).all().map(s => ({
      siteId: s.siteId,
      adet: Number(s.adet || 0),
      fiyatli: Number(s.fiyatli || 0),
      enSonTs: s.enSonTs ? Number(s.enSonTs) : null,
    }));
  } catch { /* tablo henüz yoksa boş sayım */ }

  return {
    ...durum,
    db: { ...sayim, enSonTs, siteler },
    ttlMs: KATALOG_TTL_MS,
    hedefSayisi: katalogHedefleri().length,
    hedefler: katalogHedefleri().map(h => ({
      siteId: h.siteId, tur: h.tur, base: h.base,
      kdvDahil: h.kdvDahil !== false,
    })),
  };
}

/**
 * Tüm (veya seçili) hedefleri senkronize eder. Eşzamanlı çalışmaz.
 *
 * @param {{siteler?:string[], zorla?:boolean, onProgress?:Function, kaynak?:string}} [opts]
 */
export function katalogSenkronizeEt(opts = {}) {
  if (devamEdiyor) return devamEdiyor; // zaten çalışıyor → aynı sözü döndür

  const hedefler = (() => {
    const tumu = katalogHedefleri();
    if (Array.isArray(opts.siteler) && opts.siteler.length) {
      return tumu.filter(h => opts.siteler.includes(h.siteId));
    }
    return tumu;
  })();

  durum.calisiyor = true;
  durum.sonBaslangic = Date.now();
  durum.hata = null;
  durum.baslatan = opts.kaynak || 'manuel';

  devamEdiyor = (async () => {
    const raporlar = [];
    for (const hedef of hedefler) {
      const rapor = await hedefSenkronize(hedef, { onProgress: opts.onProgress });
      raporlar.push(rapor);
      if (rapor.hata) {
        console.warn(`[katalogSync] ${hedef.siteId} (${hedef.tur}): ${rapor.hata}`);
      } else {
        console.log(`[katalogSync] ${hedef.siteId} (${hedef.tur}): ${rapor.yazilan} ürün, ${rapor.sureMs} ms`);
      }
      // Hedefler arasında da nazik bekleme (aynı host olmasa da toplam yük düşük kalsın).
      await uyu(Math.max(150, Math.round(HOST_ARASI_MS / 3)));
    }

    // Eski kayıt temizliği (site başına güncelleme yapıldı; eskiyenler silinir).
    const silinen = katalogEskileriTemizle(ESKIME_GUN);

    const toplamYazilan = raporlar.reduce((s, r) => s + r.yazilan, 0);
    const toplamCekilen = raporlar.reduce((s, r) => s + r.cekilen, 0);
    const hatalar = raporlar.filter(r => r.hata).map(r => ({ siteId: r.siteId, hata: r.hata }));

    durum.calisiyor = false;
    durum.sonBitis = Date.now();
    durum.sonSureMs = durum.sonBitis - durum.sonBaslangic;
    durum.sonRapor = {
      hedefler: raporlar,
      toplamYazilan,
      toplamCekilen,
      hatalar,
      silinen,
      kaynak: durum.baslatan,
    };
    durum.hata = hatalar.length === raporlar.length && raporlar.length
      ? 'Tüm hedefler başarısız'
      : (hatalar.length ? `${hatalar.length} hedef başarısız` : null);

    console.log(`[katalogSync] tamamlandı: ${toplamYazilan} ürün yazıldı, `
      + `${toplamCekilen} kayıt çekildi, ${hatalar.length} hata, ${Math.round(durum.sonSureMs / 1000)} sn`);
    devamEdiyor = null;
    return durum.sonRapor;
  })();

  return devamEdiyor;
}

/** Arka plan senkronizasyonunu başlatır (varsayılan 6 saat). */
export function katalogSenkronBaslat({ aralikMs = KATALOG_SYNC_ARALIK_MS, ilkGecikmeMs = 20000 } = {}) {
  if (process.env.KATALOG_SYNC === '0') {
    console.log('[katalogSync] KATALOG_SYNC=0 → arka plan senkronizasyonu kapalı.');
    return null;
  }
  if (zamanlayici) return zamanlayici;
  durum.aralikMs = aralikMs;

  const calistir = () => {
    katalogSenkronizeEt({ kaynak: 'zamanlayici' }).catch((e) => {
      durum.hata = String(e?.message || e);
      durum.calisiyor = false;
      devamEdiyor = null;
    });
  };

  // Uygulama açılışını yavaşlatmamak için ilk tur gecikmeli.
  const ilk = setTimeout(calistir, Math.max(1000, ilkGecikmeMs));
  ilk.unref?.();
  zamanlayici = setInterval(calistir, Math.max(60000, aralikMs));
  zamanlayici.unref?.();
  console.log(`[katalogSync] arka plan senkronu açık (her ${Math.round(aralikMs / 3600000)} saat).`);
  return zamanlayici;
}

export function katalogSenkronDurdur() {
  if (zamanlayici) clearInterval(zamanlayici);
  zamanlayici = null;
}
