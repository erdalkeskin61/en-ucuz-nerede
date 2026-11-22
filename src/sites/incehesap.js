/**
 * İncehesap adaptörü.
 *
 * DİKKAT: incehesap.com ScraperAPI'de "korumalı alan adı"dır — normal istekler
 * 500 döner ve premium istenir. Premium KULLANMADAN çalışması için tüm istekler
 * render=true ile yapılır; başarısız (ücretlendirilmeyen) denemeler tekrarlanır
 * (bkz. scraper.js renderRetry). Her başarılı istek 10 render kredisi tutar.
 *
 * Arama sayfası: /q/<sorgu> (boşluklar + ile). Ürün kartları data-product JSON özniteliği taşır.
 * Ürün sayfası: /{slug}-fiyati-{id}/ — data-product (Ürün Detay) + itemprop="price" + Kargo Bedava.
 */
import { fetchPage } from '../scraper.js';
import { parseNum, dominantColor, stripTags, decodeEntities } from '../util.js';

const RENDER_DENEME = 5;

function parseJsonAttr(html, attrName) {
  const out = [];
  const re = new RegExp(`${attrName}=(?:'([^'\\n]+)'|"([^"\\n]+)")`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    try { out.push(JSON.parse(decodeEntities(raw))); } catch { /* bozuk, atla */ }
  }
  return out;
}

function parseAllDataProducts(html) {
  return parseJsonAttr(html, 'data-product');
}

function parseLinkedDataProducts(html) {
  // Arama sonuçlarındaki kartlar: <a href="..." ... data-product='...' (tek veya çift tırnak)
  const out = [];
  const re = /<a\b[^>]*href="(\/[^"]+)"[^>]*data-product=(?:'([^'\n]+)'|"([^"\n]+)")[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[2] ?? m[3];
    if (!raw) continue;
    try {
      out.push({ href: m[1], data: JSON.parse(decodeEntities(raw)) });
    } catch { /* bozuk kart, atla */ }
  }
  return out;
}

export default {
  id: 'incehesap',
  name: 'İncehesap',
  hosts: ['incehesap.com', 'www.incehesap.com'],

  isProductUrl(url) {
    return /-fiyati-\d+\/?$/i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.incehesap.com/q/' + encodeURIComponent(String(q).trim().replace(/\s+/g, '+')).replace(/%2B/g, '+');
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', renderRetry: RENDER_DENEME });
    ctx.spend += r.requestsSpent;
    const out = [];
    const seen = new Set();
    for (const { href, data } of parseLinkedDataProducts(r.body)) {
      if (seen.has(href)) continue;
      seen.add(href);
      if (!data?.name) continue;
      out.push({
        title: String(data.name),
        url: 'https://www.incehesap.com' + href,
        price: data.price > 0 ? data.price : null,
        brand: data.brand || null,
      });
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh, renderRetry: RENDER_DENEME });
    ctx.spend += r.requestsSpent;
    const html = r.body;

    // Ana ürün: "Ürün Detay" listesine ait data-product (öneri ürünleri değil)
    const tumu = parseAllDataProducts(html);
    const gaitem = parseJsonAttr(html, 'data-gaitem')[0] || null;
    const ana = tumu.find(d => d?.item_list_name === 'Ürün Detay' || d?.event === 'product_view' || d?.id) || null;
    const anaData = ana?.data || ana || null;

    let title = anaData?.name || gaitem?.item_name || null;
    if (!title) {
      const t = html.match(/<title>([^<]{10,300})<\/title>/i);
      title = t ? decodeEntities(t[1]).replace(/\s*-\s*incehesap\.com.*$/i, '').trim() : null;
    }
    if (!title) throw new Error('İncehesap ürün verisi okunamadı.');

    // Fiyat
    let selling = anaData?.price > 0 ? anaData.price : (gaitem?.price > 0 ? gaitem.price : null);
    if (selling == null) {
      const meta = html.match(/itemprop="price"[^>]*content="([\d.,]+)"/i) || html.match(/content="([\d.,]+)"[^>]*itemprop="price"/i);
      selling = meta ? parseNum(meta[1]) : null;
    }

    const brand = anaData?.brand || gaitem?.item_brand || String(title).split(/\s+/)[0];
    const image = gaitem?.image || null;
    // Parça numarası: isim sonundaki " - 910-005823" gibi ek
    const mpn = title.match(/[-–]\s*([A-Z0-9][A-Z0-9-]{3,24})\s*$/);
    const modelCode = mpn ? mpn[1] : null;
    const color = dominantColor(title) || null;

    // Kampanyalar
    const campaigns = [];
    if (ana?.data?.tags) campaigns.push(String(ana.data.tags));
    const sepet = html.match(/Sepette[^<">{]{1,60}/gi) || [];
    for (const s of [...new Set(sepet)].slice(0, 3)) {
      const text = stripTags(s);
      if (text && !campaigns.includes(text)) campaigns.push(text.slice(0, 90));
    }

    // Kargo: "Kargo Bedava" + "1.000 TL ve üzeri ... kargo ücreti bizden"
    let shipping = { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi alınamadı' };
    const kargoBedava = /Kargo Bedava/i.test(html);
    const esikMatch = html.match(/([\d.,]+)\s*TL[^.<]{0,60}(?:üzeri|ustu)[^.<]{0,60}kargo ücreti bizden/i);
    const esik = esikMatch ? parseNum(esikMatch[1]) : 0;
    if (kargoBedava) {
      if (selling != null && selling >= (esik || 0)) {
        shipping = { fee: 0, freeOver: esik || null, applies: false, note: 'Kargo bedava' + (esik ? ' (' + esik + ' TL ve üzeri)' : '') };
      } else {
        shipping = { fee: null, freeOver: esik || null, applies: null, note: 'Kargo bedava koşulu: ' + (esik || '?') + ' TL ve üzeri' };
      }
    }

    return {
      site: this.id,
      siteName: this.name,
      url,
      title,
      brand,
      modelCode,
      barcode: null,
      color,
      listPrice: null,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: selling != null && selling > 0,
      seller: 'İncehesap',
      image,
      campaigns,
      shipping,
    };
  },
};
