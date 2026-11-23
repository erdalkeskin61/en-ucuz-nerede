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
import { decodeEntities, paraBirimiNormalize } from '../util.js';

const CREALITY_BASE = 'https://store.creality.com';
const CREALITY_HOSTS = ['store.creality.com', 'www.store.creality.com'];

/** Bölgesel metinden sayısal fiyat ayıklar ($849.00, €29,99, ¥4,200). */
export function parseGlobalFiyat(metin, currency = 'USD') {
  if (metin == null) return null;
  if (typeof metin === 'number') return Number.isFinite(metin) && metin > 0 ? metin : null;
  let temiz = String(metin)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\u00a0|\s+/g, '')
    .replace(/[^\d.,]/g, '');
  if (!temiz) return null;

  const kod = paraBirimiNormalize(currency);
  if (kod === 'JPY') {
    const tam = Number(temiz.replace(/[.,]/g, ''));
    return Number.isFinite(tam) && tam > 0 ? tam : null;
  }

  const sonVirgul = temiz.lastIndexOf(',');
  const sonNokta = temiz.lastIndexOf('.');
  if (sonVirgul !== -1 && sonNokta !== -1) {
    temiz = sonVirgul > sonNokta
      ? temiz.replace(/\./g, '').replace(',', '.')
      : temiz.replace(/,/g, '');
  } else if (sonVirgul !== -1) {
    const ondalikUzunluk = temiz.length - sonVirgul - 1;
    temiz = (ondalikUzunluk === 1 || ondalikUzunluk === 2)
      ? temiz.replace(',', '.')
      : temiz.replace(/,/g, '');
  }
  const n = parseFloat(temiz);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    if (sonuclar.length >= 12) break;
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
      if (sonuclar.length >= 12) break;
    }
  }

  return sonuclar;
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
    color: null,
    listPrice: null,
    sellingPrice: price,
    currency,
    inStock,
    seller: 'Creality Official',
    image,
    campaigns: [],
    shipping: { fee: null, freeOver: null, applies: null, note: 'Shipping calculated at checkout' },
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
      return crealityAramaKartlariCikar(r.body, onEk, cfg.currency);
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
