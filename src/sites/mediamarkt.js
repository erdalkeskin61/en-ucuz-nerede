/**
 * MediaMarkt adaptörü.
 *
 * Ürün sayfası: window.__PRELOADED_STATE__ içindeki fiyat verisi (CofrPriceFeaturePrice):
 *   amount (satış), discount/discountPercentage, promoPrice (sepette indirim), shippingCost.
 *   Başlık <title> üzerinden okunur; marka ve renk başlıktan çıkarılır.
 * Arama sayfası: JSON-LD ItemList.
 */
import { fetchPage } from '../scraper.js';
import { extractJsonLd, findJsonLdProduct, parseNum, dominantColor, decodeEntities, stripTags, barkodCikarHtml } from '../util.js';

export default {
  id: 'mediamarkt',
  name: 'MediaMarkt',
  hosts: ['mediamarkt.com.tr', 'www.mediamarkt.com.tr'],

  isProductUrl(url) {
    return /\/product\//i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.mediamarkt.com.tr/tr/search.html?query=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const out = [];
    for (const d of extractJsonLd(r.body)) {
      if (d['@type'] !== 'ItemList') continue;
      for (const li of d.itemListElement || []) {
        const item = li.item || {};
        if (!item.url || !item.name) continue;
        out.push({
          title: item.name,
          url: item.url,
          price: item.offers?.price ?? null,
          brand: null,
        });
      }
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;

    const t = html.match(/<title[^>]*>([^<]{5,300})<\/title>/i);
    let title = t ? decodeEntities(t[1]).replace(/\s*(Fiyat|&).*$/i, '').replace(/\s*[&|–-]\s*MediaMarkt.*$/i, '').trim() : null;
    if (!title) {
      const h1 = html.match(/<h1[^>]*>([\s\S]{5,300}?)<\/h1>/);
      title = h1 ? stripTags(h1[1]) : null;
    }
    if (!title) throw new Error('MediaMarkt ürün başlığı okunamadı.');

    // Fiyat: ÖNCE JSON-LD Product offers (sayfanın kendi yapısal verisi, tek ürün).
    // Eski yöntem (ilk CofrPriceFeaturePrice bloğu) sayfadaki ÖNERİLEN AKSESUAR
    // fiyatını yakalayabiliyordu (ör. 37.999 TL'lik süpürge için 6.999 TL'lik filtre).
    let ldPrice = null;
    try {
      const p = findJsonLdProduct(html);
      const aday = parseNum(p?.offers?.price);
      if (aday && aday > 0) ldPrice = aday;
    } catch { /* JSON-LD yoksa aşağıdaki yola düşülür */ }

    const pm = html.match(/"price":\{"__typename":"CofrPriceFeaturePrice","amount":([\d.]+),"baseAmountFormatted":([^,]+),"discount":([^,]+),"discountPercentage":([^,]+),"installment":([^,]+),"shippingCost":([\d.]+)/);
    let cofr = null, shippingCost = null, discountPct = null;
    if (pm) {
      cofr = parseNum(pm[1]);
      discountPct = pm[4] === 'null' ? null : parseNum(pm[4]);
      shippingCost = pm[6] === 'null' ? null : parseNum(pm[6]);
    }
    let selling = ldPrice ?? cofr;
    if (selling == null) {
      const anyPrice = html.match(/"amount":([\d.]+),"baseAmountFormatted"/);
      selling = anyPrice ? parseNum(anyPrice[1]) : null;
    }
    let list = null;

    // Sepette / promosyon fiyatı — yalnız fiyat blokları AYNI ürüne aitse uygula
    // (JSON-LD fiyatı ile Cofr fiyatı uyuşmuyorsa farklı ürün bloğudur, güvenme).
    const ayniUrun = ldPrice == null || cofr == null || Math.abs(ldPrice - cofr) / Math.max(ldPrice, 1) < 0.05;
    const promo = ayniUrun ? html.match(/"promoPrice":\{"__typename":"CofrPriceFeaturePromoPrice","amount":([\d.]+)/) : null;
    const campaigns = [];
    if (promo) {
      const promoPrice = parseNum(promo[1]);
      if (promoPrice != null && selling != null && promoPrice < selling && promoPrice > selling * 0.5) {
        campaigns.push('Sepette indirimli fiyat: ' + promoPrice + ' TL (sayfadaki fiyata yansımış)');
        selling = promoPrice;
      }
    }
    if (ayniUrun && discountPct != null && discountPct > 0 && discountPct < 90 && selling != null) {
      campaigns.push('Liste fiyatından %' + discountPct + ' indirim (sayfadaki fiyata yansımış)');
      list = Math.round(selling / (1 - discountPct / 100) * 100) / 100;
    }

    const brand = title.split(/\s+/)[0] || null;
    const color = dominantColor(title) || null;

    // Kargo
    const shipping = shippingCost != null
      ? { fee: shippingCost, freeOver: null, applies: null, note: 'Kargo ' + shippingCost + ' TL (belirli sepet tutarları üzeri bedava olabilir)' }
      : { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi alınamadı' };

    // Barkod/GTIN (2026-10-28): sayfada JSON-LD `gtin` alanı olarak yayımlanıyor.
    return {
      site: this.id,
      siteName: this.name,
      url,
      title,
      brand,
      modelCode: null, // MediaMarkt model kodunu SSR sayfada yayınlamıyor
      barcode: barkodCikarHtml(html),
      color,
      listPrice: list,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: !/stokta yok|tükendi|ausverk/i.test(html),
      seller: null,
      image: null,
      campaigns,
      shipping,
    };
  },
};
