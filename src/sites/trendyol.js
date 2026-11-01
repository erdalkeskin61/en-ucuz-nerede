/**
 * Trendyol adaptörü.
 *
 * Ürün sayfası: window["__envoy__SHARED_PROPS"] içindeki product nesnesi.
 *   - modelCode: product.productCode
 *   - renk: product.attributes içinde "Renk" (yalnızca seçili ürünün kendi verisi)
 *   - fiyat: merchantListing.winnerVariant.price (discountedPrice / sellingPrice / originalPrice)
 *   - kampanyalar: varyant tagDetails + listing.promotions (kargo promosyonları hariç)
 *   - kargo: winnerVariant.freeCargo / Cargo promosyonları / JSON-LD shippingRate
 * Arama sayfası: window["__single-search-result__PROPS"] içindeki products dizisi.
 */
import { fetchPage } from '../scraper.js';
import { extractScriptJson, extractJsonLd, extractBalanced, dominantColor, parseNum } from '../util.js';

export default {
  id: 'trendyol',
  name: 'Trendyol',
  hosts: ['trendyol.com', 'www.trendyol.com'],

  isProductUrl(url) {
    return /-p-\d+/.test(url.pathname) || /-p-\d+/.test(url.search);
  },

  searchUrl(q) {
    return 'https://www.trendyol.com/sr?q=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const props = extractScriptJson(r.body, '__single-search-result__PROPS');
    const products = props?.data?.products || props?.products || [];
    return products.map(p => ({
      title: (p.brand ? p.brand + ' ' : '') + (p.name || ''),
      url: p.url ? ('https://www.trendyol.com' + p.url) : null,
      price: p.price?.discountedPrice ?? p.price?.current ?? null,
      brand: p.brand || null,
    })).filter(c => c.url && c.title);
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const props = extractScriptJson(html, '__envoy__SHARED_PROPS');
    const p = props?.product;
    if (!p) throw new Error('Trendyol ürün verisi sayfada bulunamadı (sayfa bot korumasına takılmış olabilir).');

    const listing = p.merchantListing || {};
    const wv = listing.winnerVariant || {};
    const variant = (p.variants || []).find(v => v.isSelected) || (p.variants || [])[0] || {};
    const price = wv.price || {};
    const selling = price.discountedPrice?.value ?? price.sellingPrice?.value ?? variant.price?.value ?? null;
    const list = price.originalPrice?.value ?? null;

    // Renk: yalnızca seçili ürünün kendi verisinden ve başlıktan
    const attrColor = (p.attributes || []).find(a => a.key?.name === 'Renk')?.value?.name || null;
    const color = attrColor || dominantColor(p.name) || null;

    // Kampanyalar (kargo hariç; kargo ayrıca işlenir)
    const campaigns = new Set();
    for (const t of (variant.tagDetails || wv.tagDetails || [])) {
      if (t?.displayName) campaigns.add(t.displayName);
    }
    for (const promo of (listing.promotions || [])) {
      if (!promo?.name) continue;
      if (promo.promotionDiscountType === 'Cargo') continue;
      campaigns.add(promo.name);
    }
    if (price.discountPercentage > 0 && selling != null && list != null && selling < list) {
      campaigns.add('Liste fiyatından %' + price.discountPercentage + ' indirim');
    }

    // Kargo
    let shipping = { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi alınamadı' };
    const cargoPromos = (listing.promotions || []).filter(x => x?.promotionDiscountType === 'Cargo');
    if (wv.freeCargo === true) {
      shipping = { fee: 0, freeOver: null, applies: false, note: 'Kargo bedava' };
    } else if (cargoPromos.length) {
      const m = String(cargoPromos[0].name || '').match(/([\d.,]+)\s*TL/i);
      const threshold = m ? parseNum(m[1]) : null;
      if (threshold != null && selling != null && selling >= threshold) {
        shipping = { fee: 0, freeOver: threshold, applies: false, note: cargoPromos[0].name };
      } else {
        shipping = { fee: null, freeOver: threshold, applies: null, note: cargoPromos[0].name || 'Kargo koşullu' };
      }
    } else {
      const ld = extractJsonLd(html).find(d => d['@type'] === 'ProductGroup');
      const rate = ld?.offers?.shippingDetails?.shippingRate?.value;
      if (rate != null) {
        shipping = { fee: parseNum(rate), freeOver: null, applies: null, note: 'Kargo ücreti ' + parseNum(rate) + ' TL (sepette kesinleşir)' };
      }
    }

    return {
      site: this.id,
      siteName: this.name,
      url,
      title: (p.brand?.name ? p.brand.name + ' ' : '') + (p.name || ''),
      brand: p.brand?.name || null,
      modelCode: p.productCode || null,
      barcode: variant.barcode || p.barcode || null,
      color,
      listPrice: list,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: (wv.inStock ?? p.inStock ?? variant.inStock) !== false,
      seller: listing.merchant?.name || null,
      image: Array.isArray(p.images) ? (p.images[0]?.url || p.images[0] || null) : null,
      campaigns: [...campaigns],
      shipping,
    };
  },
};
