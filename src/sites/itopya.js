/**
 * İtopya adaptörü.
 *
 * Ürün sayfası: JSON-LD Product bloğu — mpn (üretici model kodu!), brand, offers.price.
 * Arama sayfası: #productList içindeki SSR ürün kartları (.product[data-urun-id]).
 */
import { fetchPage } from '../scraper.js';
import { extractJsonLd, parseNum, dominantColor, decodeEntities, stripTags } from '../util.js';

export default {
  id: 'itopya',
  name: 'İtopya',
  hosts: ['itopya.com', 'www.itopya.com'],

  isProductUrl(url) {
    return /_u\d+\/?$/i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.itopya.com/ara?bul=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    const re = /<div class="product"[^>]*data-urun-id="(\d+)"[\s\S]{0,4000}?<h2 class="truncate-text"[^>]*title="([^"]{5,300})"[\s\S]{0,600}?href="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const block = m[0];
      const pr = block.match(/>([\d.,]+)</);
      out.push({
        title: decodeEntities(m[2]),
        url: 'https://www.itopya.com' + decodeEntities(m[3]),
        price: pr ? parseNum(pr[1]) : null,
        brand: null,
      });
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;

    const ld = extractJsonLd(html).find(d => d['@type'] === 'Product');
    let title = ld?.name || null;
    if (!title) {
      const h1 = html.match(/<h1[^>]*>([\s\S]{5,300}?)<\/h1>/);
      title = h1 ? stripTags(h1[1]) : null;
    }
    if (!title) throw new Error('İtopya ürün verisi okunamadı.');

    const selling = ld?.offers?.price != null ? parseNum(String(ld.offers.price)) : null;
    const brand = ld?.brand?.name || title.split(/\s+/)[0];
    const modelCode = ld?.mpn || null;
    const color = dominantColor(title) || null;

    // Kampanya metinleri (sayfa gövdesinden, benzersiz)
    const campaigns = [];
    const matches = html.match(/Sepette[^<">{]{1,60}/gi) || [];
    for (const s of [...new Set(matches)].slice(0, 3)) {
      const text = stripTags(s);
      if (text && !campaigns.includes(text)) campaigns.push(text.slice(0, 90));
    }

    // Kargo
    const freeCargo = /kargo\s*bedava|ücretsiz\s*kargo/i.test(html);
    const shipping = freeCargo
      ? { fee: 0, freeOver: null, applies: false, note: 'Kargo bedava' }
      : { fee: null, freeOver: null, applies: null, note: 'Kargo ücreti sepette belli olur' };

    return {
      site: this.id,
      siteName: this.name,
      url,
      title,
      brand,
      modelCode,
      barcode: null,
      color,
      listPrice: null,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: /InStock/i.test(html) || ld?.offers?.availability?.includes('InStock') || true,
      seller: ld?.offers?.seller?.name || 'İtopya',
      image: Array.isArray(ld?.image) ? ld.image[0] : ld?.image || null,
      campaigns,
      shipping,
    };
  },
};
