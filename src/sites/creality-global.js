/**
 * 🌍 Creality Global Resmi Mağazaları (US / FR / EU / JP) — 2026-11-23
 *
 * Headless Shopify vitrinleri:
 *   - store.creality.com      (market: 'us', currency: 'USD')
 *   - store.creality.com/fr   (market: 'fr', currency: 'EUR')
 *   - store.creality.com/eu   (market: 'eu', currency: 'EUR')
 *   - store.creality.com/jp   (market: 'jp', currency: 'JPY')
 *
 * Arama: /search?q=... HTML içindeki `.product-item` kartlarından ürün URL + başlık + fiyat.
 * Ürün Detayı: HTML `<script type="application/ld+json">` içindeki `@type: "Product"`.
 * Gelir / Güvenlik: Her dış bağlantı `afiliyeLink('creality', url)` ile Impact şablonuna sarılır.
 */
import { fetchPage } from '../scraper.js';
import { afiliyeLink } from '../afiliye.js';
import { decodeEntities, dominantColor, fiyatCikar, paraBirimiNormalize, parcaMi } from '../util.js';
import { kargoCikar } from '../kargo.js';

const CREALITY_BASE = 'https://store.creality.com';
const CREALITY_HOSTS = ['store.creality.com', 'www.store.creality.com'];

/** Bölgesel metinden sayısal fiyat ayıklar ($849.00, €29,99, ¥4,200). */
export function parseGlobalFiyat(metin, currency = 'USD') {
  const deger = fiyatCikar(metin, currency);
  return deger != null && deger > 0 ? deger : null;
}

function etiketMetni(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/** `<script type="application/ld+json">` içinden `@type: "Product"` nesnesini çıkarır. */
export function jsonLdUrunBul(html) {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const productTipiMi = (tip) => Array.isArray(tip)
    ? tip.some(x => String(x).toLowerCase() === 'product')
    : String(tip || '').toLowerCase() === 'product';

  const tara = (dugum) => {
    if (!dugum || typeof dugum !== 'object') return null;
    if (Array.isArray(dugum)) {
      for (const x of dugum) {
        const b = tara(x);
        if (b) return b;
      }
      return null;
    }
    if (productTipiMi(dugum['@type'])) return dugum;
    if (Array.isArray(dugum['@graph'])) return tara(dugum['@graph']);
    return null;
  };

  for (const m of String(html || '').matchAll(regex)) {
    const ham = m[1]?.trim();
    if (!ham) continue;
    try {
      const veri = JSON.parse(ham);
      const urun = tara(veri);
      if (urun) return urun;
    } catch { /* bozuk blok atlanır */ }
  }
  return null;
}

/** Tek bir Creality mağaza arama HTML'inden ürün adaylarını çıkarır. */
export function crealityAramaKartlariCikar(html, yolOnEk = '', currency = 'USD') {
  const metin = String(html || '');
  const onEk = String(yolOnEk || '').replace(/\/+$/, '');
  const yolRe = onEk
    ? new RegExp(`^(?:https?:\\/\\/(?:www\\.)?store\\.creality\\.com)?(${onEk}\\/products\\/[^/?#"']+)`, 'i')
    : /^(?:https?:\/\/(?:www\.)?store\.creality\.com)?(\/products\/[^/?#"']+)/i;

  const sonuclar = [];
  const goruldu = new Set();
  const bloklar = metin.split(/<div[^>]+class=["'][^"']*\bproduct-item\b/i).slice(1);

  for (const hamBlok of bloklar) {
    const blok = hamBlok.slice(0, 4500);
    const hrefEslesme = [...blok.matchAll(/href=["']([^"']*\/products\/[^"'?#]+)["']/gi)]
      .map(m => m[1])
      .find(h => yolRe.test(h));
    if (!hrefEslesme) continue;

    const yol = hrefEslesme.match(yolRe)?.[1];
    if (!yol) continue;
    const temizUrl = CREALITY_BASE + yol;
    if (goruldu.has(temizUrl)) continue;

    const adBlok = blok.match(/<div[^>]+class=["'][^"']*item-content-name[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || blok.match(/<a[^>]+class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || '';
    const altBaslik = blok.match(/alt=["']([^"']{3,220})["']/i)?.[1] || '';
    const title = etiketMetni(adBlok) || decodeEntities(altBaslik).trim();
    if (!title || title.length < 3) continue;

    const fiyatBlok = blok.match(/<span[^>]+class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const price = parseGlobalFiyat(fiyatBlok, currency);

    goruldu.add(temizUrl);
    sonuclar.push({
      title,
      url: temizUrl,
      afiliyeUrl: afiliyeLink('creality', temizUrl),
      price,
      brand: 'Creality',
      currency,
    });
    if (sonuclar.length >= 24) break;
  }

  // Yedek: `.product-item` yapısı değişirse `<main>` içindeki ürün linklerini al (header/promo hariç).
  if (!sonuclar.length) {
    const ana = metin.match(/<main[\s\S]*<\/main>/i)?.[0]
      || metin.split(/<\/header>/i)[1]
      || metin;
    for (const m of ana.matchAll(/<a[^>]+href=["']([^"']*\/products\/[^"'?#]+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi)) {
      const mYol = m[1].match(yolRe)?.[1];
      if (!mYol) continue;
      const temizUrl = CREALITY_BASE + mYol;
      if (goruldu.has(temizUrl)) continue;
      const title = etiketMetni(m[2]);
      if (!title || title.length < 4 || />>|お見逃しなく|^\d+%\s*off/i.test(title)) continue;
      goruldu.add(temizUrl);
      sonuclar.push({
        title,
        url: temizUrl,
        afiliyeUrl: afiliyeLink('creality', temizUrl),
        price: null,
        brand: 'Creality',
        currency,
      });
      if (sonuclar.length >= 24) break;
    }
  }

  return sonuclar;
}

const _sitemapOnbellek = new Map();
const SITEMAP_TTL_MS = 30 * 60 * 1000;

async function crealitySitemapAra(onEk, query, currency, siteId, ctx) {
  const anahtar = onEk || 'us';
  let kayit = _sitemapOnbellek.get(anahtar);
  if (!kayit || (Date.now() - kayit.ts) > SITEMAP_TTL_MS) {
    try {
      const r = await fetchPage(`${CREALITY_BASE}${onEk}/sitemap_products.xml`, { site: siteId, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const urunler = [];
      for (const m of String(r.body || '').matchAll(/<loc>\s*(https:\/\/store\.creality\.com[^<\s]*\/products\/([^<?#/\s]+))\s*<\/loc>/gi)) {
        const url = m[1].trim();
        const slug = decodeURIComponent(m[2]).replace(/[-_]+/g, ' ').trim();
        const title = slug.toLowerCase().includes('creality') ? slug : `Creality ${slug}`;
        urunler.push({ url, slug: slug.toLowerCase(), title });
      }
      kayit = { ts: Date.now(), urunler };
      _sitemapOnbellek.set(anahtar, kayit);
    } catch {
      kayit = { ts: Date.now(), urunler: [] };
    }
  }
  const kelimeler = String(query || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2 && w !== 'creality');
  if (!kelimeler.length) return [];
  const sorguParca = parcaMi(query);
  return kayit.urunler
    .filter(u => kelimeler.every(w => u.slug.includes(w)))
    .sort((a, b) => {
      // Yazıcı/ana ürün sorgusunda aksesuarları alta at, ana ürün slug'larını öne al.
      if (!sorguParca) {
        const ap = parcaMi(a.title) ? 1 : 0;
        const bp = parcaMi(b.title) ? 1 : 0;
        if (ap !== bp) return ap - bp;
      }
      const ay = /\b(3d printer|imprimante 3d)\b/i.test(a.title) ? 0 : 1;
      const by = /\b(3d printer|imprimante 3d)\b/i.test(b.title) ? 0 : 1;
      if (ay !== by) return ay - by;
      return a.slug.length - b.slug.length;
    })
    .slice(0, 12)
    .map(u => ({
      title: u.title,
      url: u.url,
      afiliyeUrl: afiliyeLink('creality', u.url),
      price: null,
      brand: 'Creality',
      currency,
    }));
}

/** HTML içindeki Creality ürün JSON-LD verisinden standart ürün nesnesi üretir. */
export function crealityJsonLdUrunOku(html, url, cfg = {}) {
  const ld = jsonLdUrunBul(html);
  if (!ld?.name) throw new Error('Creality ürün verisi (JSON-LD Product) bulunamadı.');

  const teklifListesi = Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []);
  const ilkTeklif = teklifListesi[0] || {};
  const stoktaOlan = teklifListesi.find(o => !/OutOfStock|SoldOut|Discontinued/i.test(String(o?.availability || '')));
  const secilenTeklif = stoktaOlan || ilkTeklif;

  const hamFiyat = secilenTeklif?.price
    ?? secilenTeklif?.lowPrice
    ?? secilenTeklif?.priceSpecification?.price
    ?? null;
  const currency = paraBirimiNormalize(secilenTeklif?.priceCurrency || cfg.currency || 'USD');
  const price = parseGlobalFiyat(hamFiyat, currency);

  const gorselHam = Array.isArray(ld.image) ? ld.image[0] : ld.image;
  const image = typeof gorselHam === 'string' ? gorselHam : (gorselHam?.url || null);
  const avail = String(secilenTeklif?.availability || '');
  const inStock = avail ? !/OutOfStock|SoldOut|Discontinued/i.test(avail) : true;
  const sku = String(ld.sku || secilenTeklif?.sku || '').trim() || null;

  const kargo = kargoCikar(html, cfg.id || 'creality_us', { currency });
  const shipping = (kargo.fee != null || kargo.freeOver != null || kargo.applies === false)
    ? kargo
    : { fee: null, freeOver: null, applies: null, note: 'Shipping calculated at checkout' };

  return {
    site: cfg.id || 'creality_us',
    siteName: cfg.name || 'Creality Store (US)',
    market: cfg.market || 'us',
    url,
    afiliyeUrl: afiliyeLink('creality', url),
    title: decodeEntities(String(ld.name)).trim(),
    brand: 'Creality',
    modelCode: sku,
    barcode: ld.gtin13 || ld.gtin || null,
    color: dominantColor(ld.color || ld.name) || null,
    listPrice: null,
    sellingPrice: price,
    currency,
    inStock,
    seller: 'Creality Official',
    image,
    campaigns: [],
    shipping,
  };
}

export function crealityGlobalSite(cfg) {
  const onEk = String(cfg.yolOnEk || '').replace(/\/+$/, '');
  const yolOnEkPattern = onEk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urunRe = onEk
    ? new RegExp(`^${yolOnEkPattern}\\/products\\/[^/]+`, 'i')
    : /^\/products\/[^/]+/i;

  return {
    id: cfg.id,
    name: cfg.name,
    market: cfg.market,
    currency: cfg.currency,
    hosts: CREALITY_HOSTS,
    ...(onEk ? {
      matchesUrl(u) {
        return u.pathname.toLowerCase().startsWith(`${onEk.toLowerCase()}/`);
      },
    } : {}),

    isProductUrl(url) {
      return urunRe.test(url.pathname);
    },

    searchUrl(q) {
      return `${CREALITY_BASE}${onEk}/search?q=${encodeURIComponent(q)}`;
    },

    async searchProducts(query, ctx) {
      const hedef = this.searchUrl(query);
      const r = await fetchPage(hedef, { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const htmlAdaylar = crealityAramaKartlariCikar(r.body, onEk, cfg.currency);
      const sitemapAdaylar = await crealitySitemapAra(onEk, query, cfg.currency, this.id, ctx);
      const birlesik = [];
      const goruldu = new Set();
      for (const a of [...sitemapAdaylar, ...htmlAdaylar]) {
        if (!a?.url || goruldu.has(a.url)) continue;
        goruldu.add(a.url);
        birlesik.push(a);
      }
      return birlesik.slice(0, 24);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      return crealityJsonLdUrunOku(r.body, url, cfg);
    },
  };
}

export const crealityGlobalSiteler = [
  crealityGlobalSite({ id: 'creality_us', name: 'Creality Store (US)', market: 'us', currency: 'USD', yolOnEk: '' }),
  crealityGlobalSite({ id: 'creality_fr', name: 'Creality Store (FR)', market: 'fr', currency: 'EUR', yolOnEk: '/fr' }),
  crealityGlobalSite({ id: 'creality_eu', name: 'Creality Store (EU)', market: 'eu', currency: 'EUR', yolOnEk: '/eu' }),
  crealityGlobalSite({ id: 'creality_jp', name: 'Creality Store (JP)', market: 'jp', currency: 'JPY', yolOnEk: '/jp' }),
];
