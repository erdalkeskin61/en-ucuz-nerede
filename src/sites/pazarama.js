/**
 * Pazarama adaptörü.
 *
 * Ürün sayfası: JSON-LD Product bloğu — name, brand, offers.price, color, sku (iç kimlik).
 * Arama sayfası: SSR ürün kartları (<a href="/...-p-<barkod>" title="...">).
 */
import { fetchPage } from '../scraper.js';
import { extractJsonLd, parseNum, dominantColor, decodeEntities, stripTags } from '../util.js';

export default {
  id: 'pazarama',
  name: 'Pazarama',
  hosts: ['pazarama.com', 'www.pazarama.com'],

  isProductUrl(url) {
    return /-p-\d+\/?$/i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.pazarama.com/arama?q=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    const re = /<a href="(\/[a-z0-9-]+-p-(\d+))"[^>]*title="([^"]{5,300})"/g;
    let m;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({
        title: decodeEntities(m[3]),
        url: 'https://www.pazarama.com' + m[1],
        price: null, // fiyat ürün sayfasından alınır
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
      const t = html.match(/<title>([^<]{5,300})<\/title>/i);
      title = t ? decodeEntities(t[1]).replace(/\s*(Fiyatları|Fiyat|ve Modelleri).*$/i, '').trim() : null;
    }
    if (!title) throw new Error('Pazarama ürün verisi okunamadı.');

    const selling = ld?.offers?.price != null ? parseNum(String(ld.offers.price)) : null;
    const brand = ld?.brand?.name || title.split(/\s+/)[0];
    const color = ld?.color || dominantColor(title) || null;

    // Kampanya metinleri
    const campaigns = [];
    const sepet = html.match(/Sepette[^<">{]{1,60}/gi) || [];
    for (const s of [...new Set(sepet)].slice(0, 3)) {
      const text = stripTags(s);
      if (text) campaigns.push(text.slice(0, 90));
    }
    const kupon = html.match(/([\d.,]+)\s*TL\s*değerinde\s*kupon|[Kk]upon[^<">{]{0,50}/);
    if (kupon) {
      const text = stripTags(kupon[0]).slice(0, 90);
      if (text && !campaigns.includes(text)) campaigns.push(text);
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
      modelCode: null, // Pazarama model kodunu JSON-LD'de yayınlamıyor (sku iç kimlik)
      barcode: url.match(/-p-(\d+)/)?.[1] || null,
      color,
      listPrice: null,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: !/OutOfStock|stokta yok/i.test(html),
      seller: ld?.offers?.seller?.name || null,
      image: typeof ld?.image === 'string' ? ld.image : (Array.isArray(ld?.image) ? ld.image[0] : null),
      campaigns,
      shipping,
    };
  },
};
