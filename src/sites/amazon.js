/**
 * Amazon.com.tr adaptörü.
 *
 * Ürün sayfası:
 *   - başlık: #productTitle ya da <title>
 *   - fiyat: apex-core-price-identifier içindeki span.a-offscreen; üstü çizili etiket: a-text-price
 *   - model kodu: ürün bilgisi tablosundaki "Model numarası"
 *   - kargo: sayfada "Ücretsiz Kargo" geçiyorsa bedava, yoksa bilinmiyor
 * Arama sayfası: data-asin blokları.
 */
import { fetchPage } from '../scraper.js';
import { stripTags, parseNum, dominantColor, decodeEntities } from '../util.js';

export default {
  id: 'amazon',
  name: 'Amazon.tr',
  hosts: ['amazon.com.tr', 'www.amazon.com.tr'],

  isProductUrl(url) {
    return /\/(dp|gp\/product)\/[A-Z0-9]{10}/i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.amazon.com.tr/s?k=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    const re = /data-asin="([A-Z0-9]{10})"/g;
    let m;
    while ((m = re.exec(html))) {
      const asin = m[1];
      if (seen.has(asin)) continue;
      seen.add(asin);
      const block = html.slice(m.index, m.index + 25000);
      const t = block.match(/<h2[^>]*>[\s\S]{0,600}?<span[^>]*>([^<]{5,300})<\/span>/);
      if (!t) continue; // sponsor/boş blokları atla
      const pr = block.match(/class="a-offscreen">\s*([\d.,]+)\s*(?:TL|₺)\s*</);
      out.push({
        title: decodeEntities(t[1]),
        url: 'https://www.amazon.com.tr/dp/' + asin,
        price: pr ? parseNum(pr[1]) : null,
        brand: null,
      });
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const m = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    const canonical = m ? 'https://www.amazon.com.tr/dp/' + m[1] : url;
    const r = await fetchPage(canonical, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;

    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>\s*([\s\S]{5,400}?)\s*<\/span>/i);
    let title = titleMatch ? stripTags(titleMatch[1]) : null;
    if (!title) {
      const t = html.match(/<title>([^<]{5,300})<\/title>/i);
      title = t ? decodeEntities(t[1]).split(/\s*:\s*Amazon/)[0].trim() : null;
    }
    if (!title) throw new Error('Amazon ürün başlığı okunamadı.');

    // Fiyat: yalnız ürünün kendi fiyat bölgesinden okunur.
    // Eski yedek yol ("sayfadaki ilk a-offscreen fiyatı") reklam/öneri/aksesuar
    // kutusundaki fiyatı yakalayabiliyordu (ör. 37.999 TL'lik süpürge için 12.499 TL).
    // Bulunamazsa fiyat UYDURULMAZ; null döner ve "fiyat okunamadı" olarak görünür.
    const priceBlock = html.match(/apex-core-price-identifier[\s\S]{0,2000}?class="a-offscreen">\s*([\d.,]+)\s*(?:TL|₺)\s*</);
    let selling = priceBlock ? parseNum(priceBlock[1]) : null;
    if (selling == null) {
      const bolge = (html.match(/id="corePrice[^"]*"[\s\S]{0,3000}/) || html.match(/id="price"[\s\S]{0,1500}/) || [])[0];
      const icFiyat = bolge ? bolge.match(/class="a-offscreen">\s*([\d.,]+)\s*(?:TL|₺)\s*</) : null;
      selling = icFiyat ? parseNum(icFiyat[1]) : null;
    }
    const listMatch = html.match(/a-price a-text-price[\s\S]{0,600}?class="a-offscreen">\s*([\d.,]+)\s*(?:TL|₺)\s*</);
    const list = listMatch ? parseNum(listMatch[1]) : null;

    // Model numarası (ürün bilgisi tablosu / madde işaretleri)
    let modelCode = null;
    const mn = html.match(/Model numaras[ıi][^<]*<\/th>\s*<td[^>]*>\s*([^<]{2,60})</i)
      || html.match(/Ürün model numaras[ıi][^<]*<[^>]*>\s*([^<]{2,60})</i)
      || html.match(/Model numaras[ıi][^<]{0,80}?:?\s*<\/[^>]+>\s*<[^>]+>\s*([A-Z0-9][A-Z0-9 .-]{2,40})</i);
    if (mn) modelCode = stripTags(mn[1]);

    // Renk: başlıktan (ör. "... Oyuncu Mouse, Siyah")
    const color = dominantColor(title) || null;

    // Kampanyalar: kupon / sepet indirimi metinleri
    const campaigns = [];
    const coupon = html.match(/([\d.,]+)\s*(?:TL|%)\s*kupon/i) || html.match(/kupon[^<]{0,30}([\d.,]+)\s*(?:TL|%)/i);
    if (coupon) campaigns.push(stripTags(coupon[0]).slice(0, 80));
    const basket = html.match(/Sepette[^<">{]{2,60}/i);
    if (basket) campaigns.push(stripTags(basket[0]));

    // Kargo
    const freeShip = /ücretsiz kargo|kargo bedava|free shipping/i.test(html);
    const shipping = freeShip
      ? { fee: 0, freeOver: null, applies: false, note: 'Ücretsiz kargo' }
      : { fee: null, freeOver: null, applies: null, note: 'Kargo maliyeti ödeme adımında gösterilir' };

    const brand = title.split(/\s+/)[0] || null;

    return {
      site: this.id,
      siteName: this.name,
      url: canonical,
      title,
      brand,
      modelCode,
      barcode: null,
      color,
      listPrice: list,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: !/stokta yok|currently unavailable/i.test(html),
      seller: null,
      image: null,
      campaigns,
      shipping,
    };
  },
};
