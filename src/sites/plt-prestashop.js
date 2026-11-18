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

      const kartRe = /<div[^>]+class="[^"]*\bjs-product-miniature\b[^"]*"[^>]*data-id-product="\d+"/gi;
      const pozisyonlar = [];
      let km;
      while ((km = kartRe.exec(html))) pozisyonlar.push(km.index);

      for (let i = 0; i < pozisyonlar.length; i++) {
        const bas = pozisyonlar[i];
        const bit = Math.min(pozisyonlar[i + 1] ?? html.length, bas + 3500);
        const blok = html.slice(bas, bit);

        // Hızlı görünüm (quickview) linklerini atla
        let linkM = null;
        for (const am of blok.matchAll(/<a[^>]+href="([^"]+)"[^>]+title="([^"]{5,200})"/gi)) {
          if (/quickview|hızlı görünüm/i.test(am[0])) continue;
          linkM = am;
          break;
        }
        if (!linkM) {
          const hm = blok.match(/<h[1-6][^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]{5,200}?)<\/a>/i);
          if (hm) linkM = [hm[0], hm[1], hm[2].replace(/<[^>]*>/g, ' ')];
        }
        if (!linkM) continue;

        const url = absUrl(base, linkM[1]);
        const title = decodeEntities(linkM[2]).replace(/\s+/g, ' ').trim();
        if (!title || gorulen.has(url)) continue;

        const fm = blok.match(/class="[^"]*(?:product-price|price)[^"]*"[^>]*>\s*₺?\s*([\d.,]+)/i);
        const price = fm ? parseNum(fm[1]) : undefined;
        gorulen.set(url, price != null ? { title, url, price } : { title, url });
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
