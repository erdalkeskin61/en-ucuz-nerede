/**
 * trendruum.com — özel platform.
 *
 * Arama: /q?q=<sorgu>. Kartlar: <a class="tr-kk-metin" href="/urunler/{slug}-{id}">
 *   içinde <h3>BAŞLIK</h3>, <div class="tr-kk-eski"><s>eski TL</s></div> ve
 *   <div class="tr-kk-fiyat">679,15 TL</div>.
 * Ürün sayfası: JSON-LD Product (sku, brand, offers.price).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function trendruumSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/urunler\/[a-z0-9-]+-\d+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/q?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // <a class="tr-kk-metin" href="/urunler/..."> ... <h3>BAŞLIK</h3> ... tr-kk-fiyat ...
      // (kart içinde iç içe bağlantılar olabildiğinden başlık/fiyat, bağlantıdan
      // sonraki pencere içinde aranır)
      const re = /<a[^>]*class="tr-kk-metin"[^>]*href="([^"]+)"/gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[1]);
        if (gorulen.has(url)) continue;
        const pencere = html.slice(m.index, m.index + 6000);
        const baslikM = pencere.match(/<h3[^>]*>([^<]{5,200})<\/h3>/);
        if (!baslikM) continue;
        const fiyatM = pencere.match(/class="tr-kk-fiyat">\s*₺?\s*([\d.,]+)/);
        const eskiM = pencere.match(/tr-kk-eski[^>]*><s>([\d.,]+)\s*TL/);
        gorulen.set(url, {
          title: decodeEntities(baslikM[1]).trim(),
          url,
          price: fiyatM ? parseNum(fiyatM[1]) : null,
          ...(eskiM ? { listPrice: parseNum(eskiM[1]) } : {}),
        });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('trendruum ürün verisi (JSON-LD) sayfada bulunamadı.');
      const price = parseNum(p.offers?.price);
      if (price == null || price <= 0) throw new Error('Ürün fiyatı alınamadı (ürün stokta olmayabilir).');

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: p.name,
        brand: p.brand?.name || null,
        modelCode: p.sku || null,
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
