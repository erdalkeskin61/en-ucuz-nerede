/**
 * IdeaSoft "smart" teması — filamentmarketim.com, teknikfilament3d.com.
 *
 * Arama sayfası ürünleri istemci JS'i ile yüklediği için resmî canlı arama ucu kullanılır:
 *   1) GET / → sayfadaki SITE_CONFIG.token (CSRF anahtarı) okunur
 *   2) POST /client/Visitor/search?length=20 (Accept-Content-Token başlığı + phrase= gövdesi)
 * Token IP'ye bağlıdır. Bu siteler DOGRUDAN_SITELER içinde olduğu için istekler öncelikle
 * uygulamanın çalıştığı yerel makineden (yapışkan Türkiye IP'si) atılır; doğrudan çekim
 * başarısız olursa ScraperAPI oturumu (session_number) denenir.
 * Yanıt: [{id, code, name, image, link}] JSON dizisi.
 * Ürün sayfası: JSON-LD Product (fiyat offers içinde).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, parseNum } from '../util.js';

/** Token, istemci başlıklarına (özellikle User-Agent) bağlıdır; iki istek de
 *  aynı sabit UA ile gönderilir (ScraperAPI varsayılanı istekten isteğe değişir). */
const SABIT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function ideasoftSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (/^\/(arama|sepet|kategori|marka|sayfa|uyelik|iletisim|kampanya|blog|odeme|kargo|iade|siparis|tumu|sss|gizlilik|kvkk|hakkimizda|magaza|firsat|indirim|destek|client|theme|template)/i.test(p)) return false;
      if (/\.(aspx|html?|php|css|js|jpg|png|webp)$/i.test(p)) return false;
      const parca = p.split('/').filter(Boolean);
      return parca.length === 1 && p.length > 10;
    },

    searchUrl(q) {
      return base + '/arama?k=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      // Her arama için ayrı oturum kimliği: doğrudan çekimde IP zaten yapışkandır
      // (yerel makine); ScraperAPI'ye düşülürse session_number aynı IP'yi tutar.
      // Token IP'ye bağlı ve kısa ömürlü olduğundan ana sayfa ASLA önbellekten okunmaz
      // (önbellekteki token başka IP'den alınmışsa CSRF reddi alır).
      const oturum = 'is' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const r0 = await fetchPage(base + '/', { site: this.id, purpose: 'token', session: oturum, fresh: true, headers: { 'User-Agent': SABIT_UA } });
      ctx.spend += r0.requestsSpent;
      const token = r0.body.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
      if (!token) throw new Error('IdeaSoft arama anahtarı (token) sayfadan okunamadı.');

      const body = new URLSearchParams({ dataType: 'json', phrase: query }).toString();
      const r = await fetchPage(base + '/client/Visitor/search?length=20', {
        site: this.id,
        purpose: 'arama',
        method: 'POST',
        headers: {
          'User-Agent': SABIT_UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept-Content-Token': token,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
          'Referer': base + '/',
        },
        body,
        session: oturum,
      });
      ctx.spend += r.requestsSpent;

      let data;
      try { data = JSON.parse(r.body); } catch { throw new Error('IdeaSoft arama yanıtı JSON değil.'); }
      if (!Array.isArray(data)) {
        if (data?.status === 'csrf') throw new Error('IdeaSoft arama anahtarı reddedildi (CSRF).');
        throw new Error('IdeaSoft arama yanıtı beklenmedik biçimde.');
      }
      return data.map(u => ({
        title: u.name || '',
        url: u.link || null,
        price: null,
        brand: null,
        modelCode: u.code || null,
      })).filter(u => u.url && u.title).slice(0, 20);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('IdeaSoft ürün verisi (JSON-LD) sayfada bulunamadı.');

      const price = parseNum(p.offers?.price);
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
        listPrice: listPrice && price && listPrice > price ? listPrice : null,
        sellingPrice: price,
        currency: p.offers?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: p.seller?.name || null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
