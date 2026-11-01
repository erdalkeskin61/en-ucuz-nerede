/**
 * IdeaSoft "quka" teması — rhino3dprinter.com.
 *
 * Arama: /arama?k=<sorgu> — sunucu tarafında render edilir.
 * Kartlar: <a href="/slug" class="c-p-i-link" title="BAŞLIK"> içinde
 *   <div class="title">, <div class="brand">, <div class="sale-price">499,00 TL</div>.
 * Ürün sayfası: JSON-LD Product (sku, gtin13, brand, offers.price).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function ideasoftQukaSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (/^\/(arama|sepet|kategori|marka|sayfa|uyelik|iletisim|kampanya|blog|odeme|kargo|iade|siparis|tumu|sss|gizlilik|kvkk|hakkimizda|magaza|firsat|indirim|destek|filament|pla|petg)/i.test(p)) return false;
      if (/\.(aspx|html?|php|css|js|jpg|png|webp)$/i.test(p)) return false;
      const parca = p.split('/').filter(Boolean);
      return parca.length === 1 && p.length > 10;
    },

    searchUrl(q) {
      return base + '/arama?k=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // <a href="/slug" class="c-p-i-link" title="BAŞLIK"> ... <div class="brand">MARKA</div>
      // ... <div class="sale-price">499,00 TL</div> ... </a>
      const re = /<a[^>]*href="([^"]+)"[^>]*class="c-p-i-link"[^>]*title="([^"]{5,200})"/gi;
      const re2 = /<a[^>]*class="c-p-i-link"[^>]*href="([^"]+)"[^>]*title="([^"]{5,200})"/gi;
      let m;
      while ((m = re.exec(html))) gorulen.set(absUrl(base, m[1]), { title: decodeEntities(m[2]).trim(), url: absUrl(base, m[1]) });
      while ((m = re2.exec(html))) {
        const u = absUrl(base, m[1]);
        if (!gorulen.has(u)) gorulen.set(u, { title: decodeEntities(m[2]).trim(), url: u });
      }

      // fiyat ve marka: aynı kart içinde (kart = c-p-i-link ... </a> arası)
      const sonuclar = [...gorulen.values()];
      for (const k of sonuclar) {
        const i = html.indexOf('"' + k.url.replace(base, '') + '"');
        const kartBlok = html.slice(i, i + 3000);
        const fiyatM = kartBlok.match(/class="sale-price[^"]*">\s*₺?\s*([\d.,]+)/);
        if (fiyatM) k.price = parseNum(fiyatM[1]);
        const markaM = kartBlok.match(/<div class="brand">\s*([^<]{2,40})\s*<\/div>/);
        if (markaM) k.brand = decodeEntities(markaM[1]).trim();
      }
      return sonuclar.slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('Ürün verisi (JSON-LD) sayfada bulunamadı.');
      const price = parseNum(p.offers?.price);
      if (price == null || price <= 0) throw new Error('Ürün fiyatı alınamadı (ürün stokta olmayabilir).');
      const listPrice = parseNum(p.offers?.priceSpecification?.price) || null;

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: p.name,
        brand: p.brand?.name || null,
        modelCode: p.sku || p.mpn || null,
        barcode: p.gtin13 || p.gtin || null,
        color: dominantColor(p.name),
        listPrice: listPrice && listPrice > price ? listPrice : null,
        sellingPrice: price,
        currency: p.offers?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
