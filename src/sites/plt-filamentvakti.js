/**
 * Filament Vakti (filamentvakti.com) — özel altyapı.
 *
 * Arama: /index.php?pagename=search&q=<sorgu>. Kartlar sunucu tarafında render edilir:
 *   <a href="../../slug" class="... urun-title ...">BAŞLIK</a>
 *   <div class="... urun-fiyat ...">₺&nbsp;1,152.97</div>   (İNGİLİZ biçimi: virgül binlik, nokta ondalık)
 * DİKKAT: parseNum() "1,152.97" değerini 1.152 okur; bu sitede fiyat kendi ayrıştırıcıyla okunur.
 * Ürün sayfası: JSON-LD Product (fiyat "774.60" biçiminde, stok availability alanında).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, absUrl } from '../util.js';

/** "1,152.97" / "774.60" / "1152.97" → sayı (İngiliz biçimi). */
function enFiyat(s) {
  if (s == null) return null;
  const t = String(s).replace(/&nbsp;|\s/g, '').replace(/[^\d.,]/g, '');
  if (!t) return null;
  const n = parseFloat(t.replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

export function filamentVaktiSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (/\.(php|css|js|jpg|png|webp)$/i.test(p)) return false;
      if (/^\/(index|account|giris|kayit|favories|orders|kampanyalar|kvkk|tr$)/i.test(p)) return false;
      const parca = p.split('/').filter(Boolean);
      return parca.length === 1 && /-\d+$|-/.test(parca[0]) && parca[0].length > 8;
    },

    searchUrl(q) {
      return base + '/index.php?pagename=search&q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = (r.body || '').replace(/[\t\r\n]+/g, ' ');
      const gorulen = new Map();
      const re = /<a href="([^"]+)" class="[^"]*urun-title[^"]*">\s*([^<]{4,200}?)\s*<\/a>\s*<div class="[^"]*urun-fiyat[^"]*"[^>]*>\s*([^<]{0,40})</gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[1].replace(/^(\.\.\/)+/, '/'));
        if (gorulen.has(url)) continue;
        gorulen.set(url, { title: decodeEntities(m[2]).trim(), url, price: enFiyat(decodeEntities(m[3])) });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body || '';
      const p = findJsonLdProduct(html);
      const offer = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
      const price = enFiyat(offer?.price);
      if (!p?.name || price == null) throw new Error('Filament Vakti ürün verisi (JSON-LD) sayfada bulunamadı.');

      const liste = enFiyat(offer?.priceSpecification?.price);
      return {
        site: this.id,
        siteName: this.name,
        url,
        title: String(p.name).trim(),
        brand: p.brand?.name || null,
        modelCode: p.sku || p.mpn || null,
        barcode: p.gtin13 || p.gtin || null,
        color: dominantColor(p.name),
        listPrice: liste && liste > price ? liste : null,
        sellingPrice: price,
        currency: offer?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(offer?.availability || '') || (offer?.availability == null && !/<[^>]*class="[^"]*(tukendi|stok-yok)[^"]*"/i.test(html)),
        seller: null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(html, this.id),
      };
    },
  };
}