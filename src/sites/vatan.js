/**
 * Vatan Bilgisayar adaptörü.
 *
 * Ürün sayfası:
 *   - başlık: h1.product-list__product-name ("Ürün Adı - Renk" biçiminde)
 *   - fiyat: dataLayer add_to_cart olayındaki price alanı; yedek: product-list__price
 *   - renk: başlıktaki " - " sonrası / item_variant
 *   - kargo: sayfada <span id="freeCargo"> varsa bedava
 * Arama sayfası: a.product-list-link kartları (SSR).
 */
import { fetchPage } from '../scraper.js';
import { stripTags, parseNum, dominantColor, decodeEntities } from '../util.js';

export default {
  id: 'vatan',
  name: 'Vatan Bilgisayar',
  hosts: ['vatanbilgisayar.com', 'www.vatanbilgisayar.com'],

  isProductUrl(url) {
    return /\.html$/i.test(url.pathname) && !/\/(arama|magazalar|login|uyeBilgi)\//i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.vatanbilgisayar.com/arama/' + encodeURIComponent(q) + '/';
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    const re = /<a class="product-list-link" href="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[1];
      if (seen.has(url)) continue;
      seen.add(url);
      const block = html.slice(m.index, m.index + 12000);
      const t = block.match(/title="([^"]{5,300})"/);
      const pr = block.match(/product-list__price"[^>]*>([\d.,]+)</);
      out.push({
        title: t ? decodeEntities(t[1]) : url,
        url,
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

    const h1 = html.match(/<h1 class="product-list__product-name">([\s\S]{5,300}?)<\/h1>/);
    let title = h1 ? stripTags(h1[1]) : null;
    if (!title) {
      const t = html.match(/<title>([^<]{5,300})<\/title>/i);
      title = t ? decodeEntities(t[1]).replace(/\s*[-–|]\s*Vatan Bilgisayar.*$/i, '').trim() : null;
    }
    if (!title) throw new Error('Vatan ürün başlığı okunamadı.');

    // Fiyat: dataLayer add_to_cart
    let price = null;
    const cart = html.match(/event:\s*'add_to_cart',\s*ecommerce:\s*\{\s*items:\s*\[\{\s*item_name:\s*"([^"]+)",\s*item_id:\s*"(\d+)",\s*price:\s*"([\d.,]+)"/);
    if (cart) price = parseNum(cart[3]);
    if (price == null) {
      const pr = html.match(/product-list__price"[^>]*>([\d.,]+)</);
      price = pr ? parseNum(pr[1]) : null;
    }

    // Renk: başlıktaki " - " sonrası
    let color = null;
    const dashPart = title.match(/[-–]\s*([^-–]{2,40})$/);
    if (dashPart) color = dominantColor(dashPart[1]);
    if (!color && cart) {
      const variant = decodeEntities(cart[1]);
      color = dominantColor(variant) || null;
    }
    if (!color) color = dominantColor(title) || null;

    // Marka: item_brand ya da başlığın ilk kelimesi
    let brand = null;
    const br = html.match(/item_brand:\s*"([^"]{2,40})"/);
    if (br) brand = decodeEntities(br[1]);
    if (!brand) brand = title.split(/\s+/)[0];

    // Kampanyalar: fiyat yakınındaki indirim rozetleri
    const campaigns = [];
    const disc = html.match(/(?:%|indirim)[^<]{0,40}/gi);
    if (disc) {
      for (const d of [...new Set(disc)].slice(0, 3)) {
        const s = stripTags(d);
        if (/%\s*\d+|%\d+/.test(s) && !/kargo|iade|garanti/i.test(s)) campaigns.push(s.slice(0, 80));
      }
    }

    // Kargo
    const freeCargo = html.includes('id="freeCargo"');
    const shipping = freeCargo
      ? { fee: 0, freeOver: null, applies: false, note: 'Kargo bedava' }
      : { fee: null, freeOver: null, applies: null, note: 'Kargo ücreti sepette belli olur' };

    return {
      site: this.id,
      siteName: this.name,
      url,
      title,
      brand,
      modelCode: null, // Vatan model kodunu SSR sayfada yayınlamıyor
      barcode: null,
      color,
      listPrice: null,
      sellingPrice: price,
      currency: 'TRY',
      inStock: !/stokta yok|tükendi/i.test(html),
      seller: null,
      image: null,
      campaigns,
      shipping,
    };
  },
};
