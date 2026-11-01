/**
 * ciceksepeti.com — Cloudflare korumalı Next.js pazaryeri (ScraperAPI yalnızca
 * render=true ile yanıt verir; başarılı istek başına 10 kredi, İncehesap/Teknosa/PTT AVM gibi).
 *
 * Arama: /arama?query=<sorgu> (dikkat: parametre `query`, `q` değil — boş ya da
 * bilinmeyen sorgular ana sayfaya yönlenir). Render edilmiş kartlar:
 *   <a data-cs-product-box="true" href="/{slug}-{kod}" data-product-id="...">
 *     <img data-cs-pb-image alt="BAŞLIK">
 *     <span data-cs-pb-first-price-text>eski TL</span> (üstü çizili)
 *     <span data-cs-pb-price-text>güncel TL</span>
 * Ürün sayfası: JSON-LD Product (name, offers.price).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, parseNum, absUrl } from '../util.js';

export function ciceksepetiSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      // /mor-buketli-sakisida-beyaz-cift-orkide-ve-fenix-at6126 (son segment: harf kodu + sayı)
      return /-[a-z]{2,5}\d+$/.test(url.pathname) && !/\/(arama|d|sepet|hesabim|kategori)\//.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/arama?query=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', renderRetry: 1 });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // Kart: <a data-cs-product-box="true" ... href="..."> ... </a>
      const re = /<a[^>]*data-cs-product-box="true"[^>]*href="([^"]+)"[^>]*>([\s\S]{50,5000}?)<\/a>/gi;
      let m;
      while ((m = re.exec(html))) {
        const ic = m[2];
        const baslikM = ic.match(/<img[^>]*data-cs-pb-image="true"[^>]*alt="([^"]{3,200})"/i)
          || ic.match(/alt="([^"]{5,200})"/i);
        if (!baslikM) continue;
        // güncel fiyat: kart içindeki SON data-cs-pb-price-text
        const fiyatlar = [...ic.matchAll(/data-cs-pb-price-text="true"[^>]*>([^<]*[\d.,]+[^<]*)</gi)];
        const fiyatM = fiyatlar.length ? fiyatlar[fiyatlar.length - 1] : null;
        const eskiM = ic.match(/data-cs-pb-first-price-text="true"[^>]*>([^<]*[\d.,]+)/i);
        const url = absUrl(base, m[1]);
        gorulen.set(url, {
          title: baslikM[1].trim(),
          url,
          price: fiyatM ? parseNum(fiyatM[1]) : null,
          ...(eskiM ? { listPrice: parseNum(eskiM[1]) } : {}),
        });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh, renderRetry: 1 });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('Çiçeksepeti ürün verisi (JSON-LD) sayfada bulunamadı.');
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
        seller: p.seller?.name || null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
