/**
 * Mintengo adaptörü (mintengo.com) — 3D Yazıcı, Filament ve Profesyonel Ofis Baskı Çözümleri.
 *
 * Altyapı: IdeaSoft storefront v2 (tpl-tech-wawe teması).
 *
 * Arama: /catalog/search?q=<sorgu>
 *   Başlık: 'X-Requested-With': 'XMLHttpRequest' (IdeaApp autocomplete ucu).
 *   Yanıt: JSON dizi [ { type: 'product', id, name, url, stockAmount, image, ... } ]
 *
 * Ürün sayfası:
 *   - Fiyat: .product-price-new, .product-price
 *   - İndirim öncesi liste fiyatı: .product-price-old
 *   - Başlık: <h1>...</h1> veya og:title
 *   - Stok: !stokYok (out-of-stock, tükendi, vb.)
 *   - Stok / model kodu: Stok Kodu etiketinden veya sku: "..."
 *   - Marka: brandName, categoryName (temizlenerek) veya başlık
 *   - Görsel: og:image (tek/çift tırnak esnek) veya .product-image
 *   - Kargo: kargoCikar (2.000 TL üzeri ücretsiz)
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function mintengoSite(cfg = {}) {
  const id = cfg.id || 'mintengo';
  const name = cfg.name || 'Mintengo';
  const hosts = cfg.hosts || ['mintengo.com', 'www.mintengo.com'];
  const base = (cfg.base || 'https://www.mintengo.com').replace(/\/+$/, '');

  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/urun\/[^/]+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/arama?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const fetchCatalog = async (q) => {
        const url = base + '/catalog/search?q=' + encodeURIComponent(q);
        const r = await fetchPage(url, {
          site: this.id,
          purpose: 'arama',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': base + '/',
          },
        });
        ctx.spend += r.requestsSpent;
        try {
          return JSON.parse(r.body || '[]');
        } catch {
          return [];
        }
      };

      let items = await fetchCatalog(query);

      // Bazı mağazalar marka adına "Creality 3D" gibi ekler koyar; Mintengo kataloğunda
      // ise marka yalnız "Creality" olarak geçer ve "3D" kelimesi aramayı 0 sonuca düşürebilir.
      if ((!items || !items.length) && /\b3d\b/i.test(query)) {
        const yedekQ = query.replace(/\b3d\b/gi, '').replace(/\s+/g, ' ').trim();
        if (yedekQ && yedekQ.length >= 3) {
          items = await fetchCatalog(yedekQ);
        }
      }

      if (!Array.isArray(items)) return [];

      const products = items.filter(i => i && i.type === 'product' && i.url);
      return products.map(p => {
        const title = decodeEntities(p.name || p.label || '').trim();
        const prdUrl = absUrl(base, p.url);
        const inStock = p.stockAmount != null ? p.stockAmount > 0 : true;
        const img = p.image || p.primary_image_thumb_path || p.primary_image_original_path || null;
        return {
          title,
          url: prdUrl,
          inStock,
          image: img ? absUrl(base, img) : null,
        };
      }).slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body || '';

      const fiyatM = html.match(/class="product-price-new"[^>]*>\s*(?:<span[^>]*>)?\s*₺?\s*([\d.,]+)/i)
        || html.match(/class="product-price"[\s\S]{0,300}?₺?\s*([\d.,]+)/i)
        || html.match(/class="product-price-old"[^>]*>\s*₺?\s*([\d.,]+)/i);
      if (!fiyatM) throw new Error('Mintengo ürün fiyatı sayfada bulunamadı.');
      const price = parseNum(fiyatM[1]);

      const baslikM = html.match(/<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i)
        || html.match(/<meta[^>]+property=['"]og:title['"][^>]+content=['"]([^'"]{5,200})['"]/i)
        || html.match(/<meta[^>]+content=['"]([^'"]{5,200})['"][^>]+property=['"]og:title['"]/i);
      const title = baslikM ? decodeEntities(baslikM[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
      if (!title) throw new Error('Mintengo ürün başlığı bulunamadı.');

      const eskiM = html.match(/<div class="product-price-old">\s*(?:<span[^>]*>)?\s*₺?\s*([\d.,]+)/i);
      let listPrice = null;
      const campaigns = [];
      if (eskiM) {
        const eski = parseNum(eskiM[1]);
        if (eski && price && eski > price) {
          listPrice = eski;
          campaigns.push('Liste fiyatından indirimli');
        }
      }

      const havaleM = html.match(/<div class="product-money-order">[\s\S]{0,200}?([\d.,]+)\s*TL/i)
        || html.match(/<div class="product-list-title">\s*Havale[\s\S]{0,200}?<div class="product-list-content">\s*₺?\s*([\d.,]+)/i);
      if (havaleM) {
        const havale = parseNum(havaleM[1]);
        if (havale && price && havale < price) {
          campaigns.push('Havale/EFT ile ' + havale.toLocaleString('tr-TR') + ' TL');
        }
      }

      const stokYok = /class="[^"]*(?:out-of-stock|tükendi|stokta-yok)/i.test(html)
        || /<button[^>]+disabled[^>]*>[\s\S]*?(?:tükendi|stokta yok)/i.test(html)
        || /<div class="product-buttons-wrapper">[\s\S]{0,400}?(?:tükendi|stokta yok)/i.test(html)
        || /stockAmount:\s*0\b/i.test(html);

      const ogImg = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)
        || html.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]+property=['"]og:image['"]/i)
        || html.match(/<img[^>]+class=['"][^'"]*product-image[^'"]*['"][^>]+src=['"]([^'"]+)['"]/i);
      const image = ogImg ? absUrl(base, ogImg[1]) : null;

      // Marka çıkarımı: brandName > categoryName (temizlenerek)
      const brandNameM = html.match(/brandName:\s*["']([^"']+)["']/i);
      const categoryNameM = html.match(/categoryName:\s*["']([^"']+)["']/i);
      let brand = (brandNameM && brandNameM[1].trim()) || null;
      if (!brand && categoryNameM && categoryNameM[1].trim()) {
        const cat = categoryNameM[1].trim();
        const cleaned = cat.replace(/\s+(?:filament|yazıcı|yazici|aksesuar|yedek\s*parça|toner|kartuş|makinesi|makineleri).*$/i, '').trim();
        if (cleaned && cleaned.length >= 2 && !/^(?:3d|fdm|sla|büro|kırtasiye|bilgisayar|sarf)/i.test(cleaned)) {
          brand = cleaned;
        }
      }

      const modelCode = (html.match(/Stok Kodu[:\s]*<\/[^>]+>\s*<[^>]+>\s*([A-Z0-9][A-Z0-9\-./]{3,30})/i)?.[1])
        || (html.match(/sku:\s*["']([A-Z0-9][A-Z0-9\-./]{3,30})["']/i)?.[1])
        || null;

      const barcode = (html.match(/(?:barkod|barcode|gtin|ean)[:\s]*<\/[^>]+>\s*<[^>]+>\s*(\d{8,14})/i)?.[1])
        || (html.match(/["'](?:barcode|gtin|ean)["']\s*:\s*["'](\d{8,14})["']/i)?.[1])
        || null;

      return {
        site: this.id,
        siteName: this.name,
        url,
        title,
        brand,
        modelCode,
        barcode,
        color: dominantColor(title),
        listPrice,
        sellingPrice: price,
        currency: 'TRY',
        inStock: !stokYok,
        seller: null,
        image,
        campaigns,
        shipping: kargoCikar(html, this.id),
      };
    },
  };
}
