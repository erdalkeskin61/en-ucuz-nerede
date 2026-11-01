/**
 * PlatinMarket platformu — domirobot.com.
 *
 * Arama: /arama?q=<sorgu>. Ürün bağlantıları /<slug>-pmu<id>, kategoriler -pmk<id> ile biter.
 * Kartta sunucu tarafında fiyat de vardır: <span class="data-layer" data-name="..." data-price="15.707,07">
 * (data-price TL, KDV dahil). Ürün sayfasında JSON-LD Product (fiyat dahil).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function platinmarketSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /-pmu\d+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/arama?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // <a class="... urun_resmi ..." href="/slug-pmu123" title="BAŞLIK">
      const re = /<a[^>]*class="[^"]*urun_resmi[^"]*"[^>]*href="([^"]+-pmu\d+)"[^>]*title="([^"]{5,200})"/gi;
      const re2 = /<a[^>]*href="([^"]+-pmu\d+)"[^>]*class="[^"]*urun_resmi[^"]*"[^>]*title="([^"]{5,200})"/gi;
      let m;
      while ((m = re.exec(html)) || (m = re2.exec(html))) {
        const url = absUrl(base, m[1]);
        gorulen.set(url, { title: decodeEntities(m[2]).trim(), url });
      }

      // fiyatlar: data-layer (aynı sırayla) — başlık eşleşmesi üzerinden yaklaştırılır
      const fiyatler = [...html.matchAll(/<span[^>]*class="data-layer"[^>]*data-id="(\d+)"[^>]*data-name="([^"]*)"[^>]*data-price="([\d.,]+)"/gi)];
      const sonuclar = [...gorulen.values()];
      for (const k of sonuclar) {
        const f = fiyatler.find(x => decodeEntities(x[2]).trim() === k.title);
        if (f) k.price = parseNum(f[3]);
      }
      return sonuclar.slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('PlatinMarket ürün verisi (JSON-LD) sayfada bulunamadı.');

      let price = parseNum(p.offers?.price);
      let currency = p.offers?.priceCurrency || 'TRY';
      // JSON-LD fiyatı TL değilse (ör. USD) sayfadaki KDV dahil TL fiyatına düşülür
      if (currency !== 'TRY') {
        const tl = r.body.match(/class="urun_kdvdahil_fiyati">\s*([\d.,]+)\s*</i);
        if (tl) { price = parseNum(tl[1]); currency = 'TRY'; }
      }
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
        currency,
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: p.seller?.name || null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
