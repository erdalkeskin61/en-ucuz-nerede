/**
 * Shopify platformu — 3dteknomarket.com.
 *
 * Arama: /search/suggest.json (resmî Shopify arama ucu; JSON döner, fiyat içerir).
 * Ürün sayfası: /products/<handle>.js (resmî JSON ucu; varyant fiyatları kuruş cinsinden).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor } from '../util.js';

export function shopifySite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/products\/[^/]+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/search?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const url = base + '/search/suggest.json?q=' + encodeURIComponent(query)
        + '&resources[type]=product&resources[limit]=10&resources[options][fields]=title,product_type,variants.title,tag';
      const r = await fetchPage(url, { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      let data;
      try { data = JSON.parse(r.body); } catch { throw new Error('Shopify arama yanıtı JSON değil.'); }
      const urunler = data?.resources?.results?.products || [];
      return urunler.map(u => ({
        title: (u.vendor ? u.vendor + ' ' : '') + (u.title || ''),
        url: base + '/products/' + u.handle,
        price: u.price != null ? parseFloat(u.price) : null,
        brand: u.vendor || null,
      })).filter(u => u.title && u.url);
    },

    async getProduct(url, ctx, opts = {}) {
      const u = new URL(url);
      const handle = u.pathname.match(/\/products\/([^/?#]+)/)?.[1];
      if (!handle) throw new Error('Shopify ürün bağlantısı anlaşılamadı.');
      const r = await fetchPage(base + '/products/' + handle + '.js', { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      let js;
      try { js = JSON.parse(r.body); } catch { throw new Error('Shopify ürün yanıtı (.js ucu) JSON değil.'); }
      if (!js?.title) throw new Error('Shopify ürün verisi (.js ucu) alınamadı.');

      const v = (js.variants && js.variants[0]) || {};
      const price = v.price != null ? v.price / 100 : null;
      const compare = v.compare_at_price != null ? v.compare_at_price / 100 : null;

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: (js.vendor ? js.vendor + ' ' : '') + js.title,
        brand: js.vendor || null,
        modelCode: v.sku || null,
        barcode: v.barcode || null,
        color: dominantColor(js.title),
        listPrice: compare && price && compare > price ? compare : null,
        sellingPrice: price,
        currency: 'TRY',
        inStock: v.available !== false,
        seller: null,
        image: (js.images && js.images[0]) ? (typeof js.images[0] === 'string' ? js.images[0] : js.images[0]?.src || null) : null,
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
