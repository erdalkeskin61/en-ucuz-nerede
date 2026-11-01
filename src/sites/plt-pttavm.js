/**
 * pttavm.com — Cloudflare korumalı; ScraperAPI yalnızca render=true ile yanıt verir
 * (incehesap ile aynı model: başarısız denemeler ücretsizdir, başarılı istek 10 kredi).
 *
 * Arama: /arama?q=<sorgu>. Sayfaya gömülü JSON-LD ItemList tam ürün verisi verir:
 *   {name, image, url, offers:{price, priceCurrency, availability}}.
 * Ürün sayfası: JSON-LD Product (sku, brand, offers.price).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, extractJsonLd, dominantColor, parseNum, absUrl } from '../util.js';

export function pttavmSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /-p-\d+$/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/arama?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', renderRetry: 1 });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // JSON-LD ItemList ürünleri
      for (const blok of extractJsonLd(html)) {
        const dugumler = blok['@graph'] || (Array.isArray(blok) ? blok : [blok]);
        for (const o of dugumler) {
          if (o?.['@type'] !== 'ItemList') continue;
          for (const e of (o.itemListElement || [])) {
            const p = e?.item || e;
            if (p?.['@type'] !== 'Product' || !p.name || !p.url) continue;
            const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
            gorulen.set(p.url, {
              title: p.name,
              url: absUrl(base, p.url),
              price: parseNum(offers?.price),
            });
          }
        }
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh, renderRetry: 1 });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('PTT AVM ürün verisi (JSON-LD) sayfada bulunamadı.');
      const price = parseNum(p.offers?.price);
      if (price == null || price <= 0) throw new Error('Ürün fiyatı alınamadı.');

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: p.name,
        brand: p.brand?.name || null,
        modelCode: p.sku || p.mpn || null,
        barcode: p.gtin13 || p.gtin || null,
        color: dominantColor(p.name),
        listPrice: null,
        sellingPrice: price,
        currency: p.offers?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
