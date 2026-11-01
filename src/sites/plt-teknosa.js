/**
 * teknosa.com — Cloudflare korumalı; ScraperAPI yalnızca render=true ile yanıt verir
 * (incehesap ile aynı model: başarısız denemeler ücretsizdir, başarılı istek 10 kredi).
 *
 * Arama: /arama?q=<sorgu>. Sonuç kartlarındaki data-* öznitelikleri tam veri verir:
 *   <div id="product-item" data-product-id data-product-ean="ean1|ean2"
 *    data-product-name data-product-brand data-product-price data-product-url ...>
 * Ürün sayfası: data-price-with-discount + data-product-name/brand/ean öznitelikleri.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, parseNum, absUrl } from '../util.js';

export function teknosaSite(cfg) {
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

      // Kart etiketi (div/a/li) içindeki data-* öznitelikleri tam veri verir.
      // Etiket türüne ve öznitelik sırasına bağımlı olunmaz — render sağlayıcısına
      // göre (ScraperAPI / Crawlbase) DOM biçimi değişebilir.
      const re = /<(?:div|a|li)[^>]*data-product-id="[^"]*"[^>]*>/gi;
      let m;
      while ((m = re.exec(html))) {
        const blok = m[0];
        const cek = (ad) => blok.match(new RegExp(ad + '="([^"]*)"', 'i'))?.[1] || '';
        const ad = cek('data-product-name');
        const url = cek('data-product-url');
        const fiyat = parseNum(cek('data-product-price'));
        const marka = cek('data-product-brand');
        const ean = cek('data-product-ean').split('|').filter(Boolean).pop() || null;
        const stok = cek('data-product-stock');
        if (!ad || !url) continue;
        gorulen.set(url, {
          title: ad,
          url: absUrl(base, url),
          price: fiyat > 0 ? fiyat : null,
          brand: marka || null,
          barcode: ean,
          inStock: stok !== 'N',
        });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh, renderRetry: 1 });
      ctx.spend += r.requestsSpent;
      const html = r.body;

      // Ürün verisi sayfadaki bağımsız data-* özniteliklerinden okunur (blok yapısına
      // bağımlı değil: ScraperAPI ve Crawlbase render'larında DOM biçimi farklıdır).
      // data-product-price boş gelebilir; satış fiyatı data-price-with-discount'tadır.
      const ad = html.match(/data-product-name="([^"]{3,200})"/i)?.[1] || null;
      const fiyat = parseNum(
        html.match(/data-price-with-discount="([\d.]+)"/i)?.[1]
        ?? html.match(/data-price-without-discount="([\d.]+)"/i)?.[1]
      );
      if (!ad) throw new Error('Teknosa ürün verisi sayfada bulunamadı (render başarısız olabilir).');
      if (fiyat == null || fiyat <= 0) throw new Error('Ürün fiyatı alınamadı.');

      const marka = html.match(/data-product-brand="([^"]{1,50})"/i)?.[1] || null;
      const ean = html.match(/data-product-ean="([^"]*)"/i)?.[1].split('|').filter(Boolean).pop() || null;
      const liste = parseNum(html.match(/data-price-without-discount="([\d.]+)"/i)?.[1]);
      // Stok bayrağı belirsiz olabilir (farklı amaçlar için kullanılıyor);
      // yalnızca fiyat yoksa stok dışı sayılır.

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: ad,
        brand: marka,
        modelCode: null,
        barcode: ean,
        color: dominantColor(ad),
        listPrice: liste && liste > fiyat ? liste : null,
        sellingPrice: fiyat,
        currency: 'TRY',
        inStock: true,
        seller: null,
        image: null,
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
