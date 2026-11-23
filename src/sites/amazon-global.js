/**
 * 🌍 Amazon Global Bölgesel Adaptörleri (US / FR / JP) — 2026-11-23
 *
 * Türkiye'deki `src/sites/amazon.js` (`amazon.com.tr`) adaptörünün çoklu bölge
 * eşleniğidir:
 *   - Amazon.com   (market: 'us', currency: 'USD')
 *   - Amazon.fr    (market: 'fr', currency: 'EUR')
 *   - Amazon.co.jp (market: 'jp', currency: 'JPY')
 *
 * `fetchPage` (impit / Chromium / yapılandırılmış proxy sağlayıcıları) ile
 * çalışır. Anti-bot / CAPTCHA kapısı döndüğünde uydurma fiyat üretmez, açık
 * erişim engeli hatası fırlatır.
 */
import { fetchPage } from '../scraper.js';
import { decodeEntities, dominantColor, fiyatCikar, paraBirimiNormalize, stripTags } from '../util.js';
import { kargoCikar } from '../kargo.js';

function amazonBotEngeliMi(html) {
  const s = String(html || '');
  if (s.length < 4000 && /validateCaptcha|opfcaptcha|automated access|sorry.*robots/i.test(s)) return true;
  if (/Enter the characters you see below|Type the characters you see in this image|Saisissez les caractères|以下の文字を入力してください/i.test(s)) {
    return true;
  }
  return false;
}

function amazonGlobalOlustur({ id, name, market, currency, origin, hosts }) {
  const para = paraBirimiNormalize(currency);
  return {
    id,
    name,
    market,
    currency: para,
    hosts,

    isProductUrl(url) {
      return /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(url.pathname);
    },

    searchUrl(q) {
      return `${origin}/s?k=${encodeURIComponent(q)}`;
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      if (amazonBotEngeliMi(html)) {
        throw new Error(`${name}: Bot/CAPTCHA doğrulaması nedeniyle arama engellendi.`);
      }
      const out = [];
      const seen = new Set();
      const re = /data-asin="([A-Z0-9]{10})"/g;
      let m;
      while ((m = re.exec(html))) {
        const asin = m[1];
        if (seen.has(asin)) continue;
        seen.add(asin);
        const block = html.slice(m.index, m.index + 24000);
        const t = block.match(/<h2[^>]*>[\s\S]{0,600}?<span[^>]*>([^<]{5,300})<\/span>/);
        if (!t) continue;
        const off = block.match(/class="a-offscreen">\s*([^<]{1,40})</);
        out.push({
          title: decodeEntities(t[1]),
          url: `${origin}/dp/${asin}`,
          price: off ? fiyatCikar(decodeEntities(off[1]), para) : null,
          brand: null,
        });
      }
      return out.slice(0, 12);
    },

    async getProduct(url, ctx, opts = {}) {
      const m = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      const canonical = m ? `${origin}/dp/${m[1]}` : url;
      const r = await fetchPage(canonical, { site: id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      if (amazonBotEngeliMi(html)) {
        throw new Error(`${name}: Bot/CAPTCHA doğrulaması nedeniyle ürün okunamadı.`);
      }

      const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>\s*([\s\S]{5,400}?)\s*<\/span>/i);
      let title = titleMatch ? stripTags(titleMatch[1]) : null;
      if (!title) {
        const tm = html.match(/<title>([^<]{5,300})<\/title>/i);
        title = tm ? decodeEntities(tm[1]).split(/\s*[:|-]\s*Amazon/i)[0].trim() : null;
      }
      if (!title) throw new Error(`${name}: Ürün başlığı okunamadı.`);

      const priceBlock = html.match(/apex-core-price-identifier[\s\S]{0,2000}?class="a-offscreen">\s*([^<]{1,40})</);
      let selling = priceBlock ? fiyatCikar(decodeEntities(priceBlock[1]), para) : null;
      if (selling == null) {
        const bolge = (html.match(/id="corePrice[^"]*"[\s\S]{0,3000}/)
          || html.match(/id="price"[\s\S]{0,1500}/)
          || [])[0];
        const icFiyat = bolge ? bolge.match(/class="a-offscreen">\s*([^<]{1,40})</) : null;
        selling = icFiyat ? fiyatCikar(decodeEntities(icFiyat[1]), para) : null;
      }
      const listMatch = html.match(/a-price a-text-price[\s\S]{0,600}?class="a-offscreen">\s*([^<]{1,40})</);
      const list = listMatch ? fiyatCikar(decodeEntities(listMatch[1]), para) : null;

      let modelCode = null;
      const mn = html.match(/(?:Item model number|Num[ée]ro de mod[èe]le|製品型番|モデル番号)[^<]{0,60}<\/(?:th|span)>\s*<(?:td|span)[^>]*>\s*([^<]{2,60})</i);
      if (mn) modelCode = stripTags(mn[1]);

      const brand = title.split(/\s+/)[0] || null;
      const color = dominantColor(title) || null;
      const tukendi = /currently unavailable|actuellement indisponible|在庫切れ|現在在庫切れ/i.test(html);
      const image = html.match(/id="landingImage"[^>]+src="([^"]+)"/i)?.[1]
        || html.match(/property="og:image"[^>]+content="([^"]+)"/i)?.[1]
        || null;

      return {
        site: id,
        siteName: name,
        market,
        url: canonical,
        title,
        brand,
        modelCode,
        barcode: null,
        color,
        listPrice: list && selling && list > selling ? list : null,
        sellingPrice: para === 'JPY' && selling != null ? Math.round(selling) : selling,
        currency: para,
        inStock: !tukendi,
        seller: null,
        image,
        campaigns: [],
        shipping: kargoCikar(html, id, { currency: para }),
      };
    },
  };
}

export const amazonGlobalSiteler = [
  amazonGlobalOlustur({
    id: 'amazon_us',
    name: 'Amazon.com',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.amazon.com',
    hosts: ['amazon.com', 'www.amazon.com'],
  }),
  amazonGlobalOlustur({
    id: 'amazon_fr',
    name: 'Amazon.fr',
    market: 'fr',
    currency: 'EUR',
    origin: 'https://www.amazon.fr',
    hosts: ['amazon.fr', 'www.amazon.fr'],
  }),
  amazonGlobalOlustur({
    id: 'amazon_jp',
    name: 'Amazon.co.jp',
    market: 'jp',
    currency: 'JPY',
    origin: 'https://www.amazon.co.jp',
    hosts: ['amazon.co.jp', 'www.amazon.co.jp'],
  }),
];
