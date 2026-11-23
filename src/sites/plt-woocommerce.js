/**
 * WooCommerce Store API platformu — global & bölgesel 3D baskı mağazaları.
 *
 * Arama: /wp-json/wc/store/v1/products?search=<sorgu>&per_page=10 (resmî Store API JSON).
 * Ürün detayı: önce sayfadaki JSON-LD Product (canlı stok + kargo eşiği),
 * yedek olarak /wp-json/wc/store/v1/products?slug=<slug>.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, fiyatCikar, paraBirimiNormalize, gercekMarkaBul } from '../util.js';
import { guvenliJsonAyristir } from './plt-shopify.js';

function wooFiyatOku(prices = {}) {
  const ham = Number(prices?.price);
  if (!Number.isFinite(ham) || ham <= 0) return null;
  const minor = Number.isFinite(Number(prices?.currency_minor_unit)) ? Number(prices.currency_minor_unit) : 2;
  return ham / Math.pow(10, minor);
}

export function wooSite(cfg) {
  const { id, name, hosts, base } = cfg;
  const market = cfg.market || 'tr';
  const currency = paraBirimiNormalize(cfg.currency || 'TRY');
  const urunRe = cfg.urunDeseni || /\/(?:product|produkt|produit)\/[^/]+/i;

  return {
    id,
    name,
    market,
    currency,
    hosts,

    isProductUrl(url) {
      return urunRe.test(url.pathname);
    },

    searchUrl(q) {
      return `${base}/?s=${encodeURIComponent(q)}&post_type=product`;
    },

    async searchProducts(query, ctx) {
      const url = `${base}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=12`;
      const r = await fetchPage(url, { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const list = guvenliJsonAyristir(r.body, 'WooCommerce Store API yanıtı JSON değil.');
      const urunler = Array.isArray(list) ? list : [];
      return urunler.map(u => ({
        title: decodeEntities(String(u?.name || '')).trim(),
        url: String(u?.permalink || '').trim(),
        price: wooFiyatOku(u?.prices),
        brand: Array.isArray(u?.brands) && u.brands.length ? String(u.brands[0]?.name || u.brands[0]) : null,
      })).filter(u => u.title && u.url);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (p?.name) {
        const teklif = Array.isArray(p.offers) ? (p.offers[0] || {}) : (p.offers || {});
        const fiyatKodu = paraBirimiNormalize(teklif.priceCurrency || currency);
        const hamFiyat = teklif.price ?? teklif.lowPrice ?? teklif.priceSpecification?.price;
        const price = typeof hamFiyat === 'number' ? hamFiyat : fiyatCikar(hamFiyat, fiyatKodu);
        if (price != null && price > 0) {
          const title = decodeEntities(String(p.name)).trim();
          const rawBrand = p.brand?.name || (typeof p.brand === 'string' ? p.brand : null);
          return {
            site: this.id,
            siteName: this.name,
            market,
            url,
            title,
            brand: gercekMarkaBul(rawBrand, title, this.id, this.name),
            modelCode: p.sku || p.mpn || null,
            barcode: p.gtin13 || p.gtin || null,
            color: dominantColor(title),
            listPrice: null,
            sellingPrice: fiyatKodu === 'JPY' ? Math.round(price) : price,
            currency: fiyatKodu,
            inStock: teklif.availability ? !/OutOfStock|SoldOut/i.test(String(teklif.availability)) : true,
            seller: null,
            image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image?.url || p.image || null),
            campaigns: [],
            shipping: kargoCikar(r.body, this.id, { currency: fiyatKodu }),
          };
        }
      }

      // Yedek: WooCommerce Store API slug sorgusu
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean).pop();
      if (!slug) throw new Error('WooCommerce ürün slug bilgisi çıkarılamadı.');
      const r2 = await fetchPage(`${base}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r2.requestsSpent;
      const arr = guvenliJsonAyristir(r2.body, 'WooCommerce Store API ürün yanıtı JSON değil.');
      const item = Array.isArray(arr) ? arr[0] : null;
      if (!item?.name) throw new Error('WooCommerce ürün verisi bulunamadı.');

      const title = decodeEntities(String(item.name)).trim();
      const fiyatKodu = paraBirimiNormalize(item.prices?.currency_code || currency);
      const price = wooFiyatOku(item.prices);
      const rawBrand = Array.isArray(item.brands) && item.brands.length ? (item.brands[0]?.name || item.brands[0]) : null;
      return {
        site: this.id,
        siteName: this.name,
        market,
        url,
        title,
        brand: gercekMarkaBul(rawBrand, title, this.id, this.name),
        modelCode: item.sku || null,
        barcode: null,
        color: dominantColor(title),
        listPrice: null,
        sellingPrice: fiyatKodu === 'JPY' && price != null ? Math.round(price) : price,
        currency: fiyatKodu,
        inStock: item.is_in_stock !== false,
        seller: null,
        image: item.images?.[0]?.src || null,
        campaigns: [],
        shipping: kargoCikar(r.body, this.id, { currency: fiyatKodu }),
      };
    },
  };
}
