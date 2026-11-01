/**
 * PrestaShop platformu — sivasrobotik.com.tr.
 *
 * Arama: /arama?controller=search&s=<sorgu>.
 * Kartlar: <div class="js-product-miniature" data-id-product="..."> içinde
 *   <a href=".../{id}-{slug}.html" title="BAŞLIK"> (fiyatlar istemcide yüklenir).
 * Ürün sayfası: JSON-LD Product (sku, brand, offers.price).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function prestashopSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      // Ürün URL'leri: /kategori/929-creality-hyper-pla-mavi.html (son bölüm id ile başlar)
      const son = url.pathname.split('/').filter(Boolean).pop() || '';
      return /^\d+-[a-z0-9-]+\.html$/i.test(son);
    },

    searchUrl(q) {
      return base + '/arama?controller=search&s=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      const re = /<div class="js-product-miniature"[^>]*data-id-product="\d+"[\s\S]{0,800}?<a[^>]+href="([^"]+)"[^>]+title="([^"]{5,200})"/gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[1]);
        gorulen.set(url, { title: decodeEntities(m[2]).trim(), url });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('PrestaShop ürün verisi (JSON-LD) sayfada bulunamadı.');
      const price = parseNum(p.offers?.price);
      if (price == null || price <= 0) throw new Error('Ürün fiyatı alınamadı (ürün stokta olmayabilir).');

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
