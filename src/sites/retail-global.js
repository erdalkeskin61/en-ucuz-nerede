/**
 * 🌍 Küresel Büyük Perakendeciler & Pazaryerleri (US / FR / EU / JP) — 2026-11-23
 *
 * Doğrudan 200 HTTP + JSON-LD/HTML ile canlı çalışan devler:
 *   🇺🇸 Adafruit     (www.adafruit.com, USD)
 *   🇫🇷 LDLC         (www.ldlc.com, EUR — Bambu Lab, Creality vb.)
 *   🇫🇷 Boulanger    (www.boulanger.com, EUR — Creality vb.)
 *   🇫🇷 3DJake FR    (www.3djake.fr, EUR)
 *   🇪🇺 3DJake EU/DE (www.3djake.de, EUR)
 *   🇯🇵 Rakuten JP   (search.rakuten.co.jp / item.rakuten.co.jp, JPY)
 *   🇯🇵 Yodobashi    (www.yodobashi.com, JPY)
 *
 * Ek `fetchPage` (proxy/tarayıcı katmanı uyumlu) genel perakendeci & pazaryerleri:
 *   🇺🇸 Walmart US, BestBuy US, Target US, eBay US
 *   🇫🇷 eBay FR
 *
 * Her adaptör yalnızca gerçek sayfa verisinden fiyat okur; anti-bot/CAPTCHA
 * kapısına denk gelindiğinde asla uydurma fiyat dönmez, açık hata fırlatır.
 */
import { fetchPage } from '../scraper.js';
import { decodeEntities, dominantColor, fiyatCikar, paraBirimiNormalize, stripTags } from '../util.js';
import { kargoCikar } from '../kargo.js';
import { jsonLdUrunBul, parseGlobalFiyat } from './creality-global.js';
import { ebayApiEtkinMi, ebayBrowseAra, ebayBrowseUrunGetir } from './ebay-api.js';

function mutlakUrl(href, origin) {
  try { return new URL(href, origin).href.split('#')[0]; } catch { return null; }
}

function teklifBilgisi(ld, currency) {
  const liste = Array.isArray(ld?.offers) ? ld.offers : (ld?.offers ? [ld.offers] : []);
  const stoklu = liste.find(o => /InStock/i.test(String(o?.availability || ''))) || liste[0] || {};
  const etkinPara = paraBirimiNormalize(stoklu.priceCurrency || currency);
  const rawPrice = stoklu.price ?? stoklu.lowPrice ?? stoklu.highPrice ?? null;
  const sellingPrice = parseGlobalFiyat(rawPrice, etkinPara);
  const inStock = /InStock|OnlineOnly|LimitedAvailability/i.test(String(stoklu.availability || ''))
    || !/OutOfStock|SoldOut|Discontinued/i.test(String(stoklu.availability || ''));
  return { sellingPrice, currency: etkinPara, inStock };
}

function htmlEngelKontrol(html, name) {
  const s = String(html || '');
  if (s.length < 3000 && /Robot or human|Access Denied|validateCaptcha|Pardon Our Interruption|Sorry, something went wrong/i.test(s)) {
    throw new Error(`${name}: Erişim engeli / bot doğrulaması.`);
  }
  if (/cf-browser-verification|challenge-platform/i.test(s) && !jsonLdUrunBul(s)) {
    throw new Error(`${name}: Bot koruma doğrulaması aşılamadı.`);
  }
}

/**
 * Standart JSON-LD `@type: Product` perakendeci fabrikası (LDLC, Boulanger,
 * Adafruit, 3DJake FR/DE, BestBuy, Walmart, Target, eBay).
 */
function perakendeciAdaptor({
  id, name, market, currency, origin, hosts,
  searchPath, productPathRe, linkRe, skipLinkRe = null,
}) {
  const para = paraBirimiNormalize(currency);
  return {
    id,
    name,
    market,
    currency: para,
    hosts,

    isProductUrl(url) {
      return productPathRe.test(url.pathname);
    },

    searchUrl(q) {
      return `${origin}${searchPath.replace('{q}', encodeURIComponent(q))}`;
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      htmlEngelKontrol(html, name);

      const out = [];
      const seen = new Set();
      for (const m of html.matchAll(linkRe)) {
        const full = mutlakUrl(m[1] || m[0], origin);
        if (!full) continue;
        if (skipLinkRe && skipLinkRe.test(full)) continue;
        let uObj;
        try { uObj = new URL(full); } catch { continue; }
        if (!productPathRe.test(uObj.pathname)) continue;
        const temizFull = full.split('?')[0];
        if (seen.has(temizFull)) continue;

        const cevre = html.slice(m.index, m.index + 650);
        const temizAday = (x) => decodeEntities(String(x || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        const adaylar = [
          cevre.match(/title=["']([^"']{4,180})["']/i)?.[1],
          cevre.match(/aria-label=["']([^"']{4,180})["']/i)?.[1],
          cevre.match(/^[^<]*>([\s\S]{4,220}?)<\/a>/i)?.[1],
          cevre.match(/alt=["']([^"']{4,180})["']/i)?.[1],
        ].map(temizAday).filter(x => x.length >= 4 && !/^(?:see details|voir le produit|photo)/i.test(x));
        const slugBaslik = decodeURIComponent(uObj.pathname.split('/').filter(Boolean).pop() || '')
          .replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
        const title = adaylar[0] || slugBaslik;
        if (!title || title.length < 3) continue;
        seen.add(temizFull);
        out.push({ title, url: temizFull, price: null, brand: null });
        if (out.length >= 10) break;
      }
      return out;
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      htmlEngelKontrol(html, name);

      const ld = jsonLdUrunBul(html);
      let title = ld?.name ? decodeEntities(String(ld.name).trim()) : null;
      if (!title) {
        title = decodeEntities(
          html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,220})["']/i)?.[1]
          || html.match(/<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          || '',
        );
      }
      if (!title) throw new Error(`${name}: Ürün başlığı okunamadı.`);

      const teklif = ld ? teklifBilgisi(ld, para) : { sellingPrice: null, currency: para, inStock: true };
      let selling = teklif.sellingPrice;
      if (selling == null) {
        const metaFiyat = html.match(/property=["'](?:product|og):price:amount["'][^>]+content=["']([^"']+)["']/i)?.[1];
        selling = metaFiyat ? parseGlobalFiyat(metaFiyat, para) : null;
      }

      const rawImg = Array.isArray(ld?.image)
        ? (typeof ld.image[0] === 'string' ? ld.image[0] : ld.image[0]?.url)
        : (ld?.image?.url || ld?.image);
      const image = rawImg || html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
      const brand = (typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name) || null;
      const inStock = teklif.inStock && !/out of stock|en rupture|indisponible|在庫切れ/i.test(
        html.match(/class=["'][^"']*stock[^"']*["'][^>]*>([^<]{2,60})</i)?.[1] || '',
      );

      return {
        site: id,
        siteName: name,
        market,
        url,
        title,
        brand,
        modelCode: ld?.sku || ld?.mpn || null,
        barcode: ld?.gtin13 || ld?.gtin || null,
        color: dominantColor(title),
        listPrice: null,
        sellingPrice: teklif.currency === 'JPY' && selling != null ? Math.round(selling) : selling,
        currency: teklif.currency,
        inStock,
        seller: name,
        image,
        campaigns: [],
        shipping: kargoCikar(html, id, { currency: teklif.currency }),
      };
    },
  };
}

/** 🇯🇵 Rakuten Japan (UTF-8 arama + EUC-JP ürün sayfası uyumlu). */
const rakutenJp = {
  id: 'rakuten_jp',
  name: '楽天市場 (Rakuten)',
  market: 'jp',
  currency: 'JPY',
  hosts: ['rakuten.co.jp', 'item.rakuten.co.jp', 'search.rakuten.co.jp'],

  isProductUrl(url) {
    return url.hostname === 'item.rakuten.co.jp' && /^\/[a-z0-9_-]+\/[a-z0-9_-]+/i.test(url.pathname);
  },

  searchUrl(q) {
    return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`;
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    for (const m of html.matchAll(/<a[^>]+href="(https:\/\/item\.rakuten\.co\.jp\/[a-z0-9_-]+\/[a-z0-9_-]+\/?)"[^>]*>([\s\S]{3,320}?)<\/a>/gi)) {
      const url = m[1];
      if (seen.has(url)) continue;
      const title = decodeEntities(stripTags(m[2])).replace(/\s+/g, ' ').trim();
      if (!title || title.length < 5) continue;
      seen.add(url);
      out.push({ title, url, price: null, brand: null });
      if (out.length >= 10) break;
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const cleanUrl = url.split('?')[0];
    let html = '';
    // item.rakuten.co.jp sayfaları çoğunlukla EUC-JP kodlamalıdır; doğrudan
    // byte akışıyla doğru charset çözümü yapıp `fetchPage` yedeğine düşeriz.
    try {
      const resp = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,*/*',
        },
        signal: AbortSignal.timeout(9000),
      });
      ctx.spend += 1;
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const ctype = resp.headers.get('content-type') || '';
        const enc = /euc-jp/i.test(ctype) ? 'euc-jp' : (/shift_jis|sjis/i.test(ctype) ? 'shift_jis' : 'utf-8');
        html = new TextDecoder(enc).decode(buf);
        if (enc === 'utf-8' && /charset=["']?euc-jp/i.test(html.slice(0, 1500))) {
          html = new TextDecoder('euc-jp').decode(buf);
        }
      }
    } catch { /* fetchPage yedeğine düş */ }

    if (!html) {
      const r = await fetchPage(cleanUrl, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      html = r.body;
    }

    const ld = jsonLdUrunBul(html);
    let title = ld?.name || opts.kaynak?.title || null;
    if (!title) {
      title = html.match(/property=["']og:title["'][^>]+content=["']([^"']{4,220})["']/i)?.[1]
        || html.match(/<title>([^<]{4,220})<\/title>/i)?.[1]
        || null;
    }
    if (!title) throw new Error('Rakuten: Ürün başlığı okunamadı.');
    title = decodeEntities(String(title).replace(/^【楽天市場】/, '').trim());

    const rawPrice = html.match(/itemprop=["']price["'][^>]+content=["']([\d,]+)["']/i)?.[1]
      || (Array.isArray(ld?.offers) ? ld.offers[0]?.price : ld?.offers?.price);
    const selling = parseGlobalFiyat(rawPrice, 'JPY');
    const img = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
    const soldOut = /売り切れ|在庫なし|品切れ/.test(html.match(/class="[^"]*soldout[^"]*"[^>]*>([^<]+)</i)?.[1] || '');

    return {
      site: this.id,
      siteName: this.name,
      market: 'jp',
      url: cleanUrl,
      title,
      brand: null,
      modelCode: null,
      barcode: null,
      color: dominantColor(title),
      listPrice: null,
      sellingPrice: selling != null ? Math.round(selling) : null,
      currency: 'JPY',
      inStock: !soldOut,
      seller: '楽天市場',
      image: img,
      campaigns: [],
      shipping: kargoCikar(html, this.id, { currency: 'JPY' }),
    };
  },
};

/** 🇯🇵 Yodobashi Camera (www.yodobashi.com, JPY). */
const yodobashiJp = {
  id: 'yodobashi',
  name: 'ヨドバシ.com (Yodobashi)',
  market: 'jp',
  currency: 'JPY',
  hosts: ['yodobashi.com', 'www.yodobashi.com'],

  isProductUrl(url) {
    return /^\/product\/\d+\/?/i.test(url.pathname);
  },

  searchUrl(q) {
    return `https://www.yodobashi.com/?word=${encodeURIComponent(q)}`;
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const out = [];
    const seen = new Set();
    const bloklar = html.split(/class=["'][^"']*\bpListBlock\b/i).slice(1);
    for (const blk of bloklar) {
      const mUrl = blk.match(/href=["'](\/product\/\d+\/)["']/i);
      if (!mUrl) continue;
      const url = 'https://www.yodobashi.com' + mUrl[1];
      if (seen.has(url)) continue;
      const t = blk.match(/class=["']pName[^"']*["'][^>]*>([\s\S]{3,200}?)<\/div>/i)?.[1];
      const title = decodeEntities(stripTags(t || '')).trim();
      if (!title || title.length < 3) continue;
      const pr = blk.match(/￥([\d,]+)|([\d,]+)円/);
      const fiyat = pr ? parseGlobalFiyat(pr[1] || pr[2], 'JPY') : null;
      seen.add(url);
      out.push({ title, url, price: fiyat, brand: null });
      if (out.length >= 10) break;
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const h1 = html.match(/<h1[^>]*>([\s\S]{3,220}?)<\/h1>/i)?.[1];
    const title = decodeEntities(stripTags(h1 || '')).trim()
      || decodeEntities(html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '').trim();
    if (!title) throw new Error('Yodobashi: Ürün başlığı okunamadı.');

    const rawPrice = html.match(/id=["']js_scl_unitPrice["'][^>]*>([\s\S]{1,40}?)<\/span>/i)?.[1];
    const selling = parseGlobalFiyat(stripTags(rawPrice || ''), 'JPY');
    const stockTxt = stripTags(html.match(/id=["']salesInfoTxt["'][^>]*>([\s\S]{1,120}?)<\/div>/i)?.[1] || '');
    const inStock = !/販売休止|予定数の販売を終了|販売を終了/i.test(stockTxt);
    const img = html.match(/id=["']mainImg["'][^>]+src=["']([^"']+)["']/i)?.[1]
      || html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || null;

    return {
      site: this.id,
      siteName: this.name,
      market: 'jp',
      url,
      title,
      brand: null,
      modelCode: null,
      barcode: null,
      color: dominantColor(title),
      listPrice: null,
      sellingPrice: selling != null ? Math.round(selling) : null,
      currency: 'JPY',
      inStock,
      seller: 'ヨドバシカメラ',
      image: img,
      campaigns: [],
      shipping: kargoCikar(html, this.id, { currency: 'JPY' }),
    };
  },
};

/** eBay US/FR adaptörü: anahtarlar tanımlıysa resmî Browse API, değilse HTML kazıma yedeği kullanır. */
function ebayAdaptor(cfg) {
  const yedek = perakendeciAdaptor({
    ...cfg,
    searchPath: '/sch/i.html?_nkw={q}&LH_BIN=1',
    productPathRe: /^\/itm\/(?:[^/]+\/)?\d+/i,
  });
  return {
    ...yedek,
    async searchProducts(query, ctx) {
      if (ebayApiEtkinMi()) {
        return ebayBrowseAra(cfg.id, query, ctx);
      }
      return yedek.searchProducts(query, ctx);
    },
    async getProduct(url, ctx, opts = {}) {
      if (ebayApiEtkinMi()) {
        return ebayBrowseUrunGetir(cfg.id, url, ctx, opts);
      }
      return yedek.getProduct(url, ctx, opts);
    },
  };
}

export const retailGlobalSiteler = [
  // 🇺🇸 ABD (USD)
  perakendeciAdaptor({
    id: 'adafruit',
    name: 'Adafruit',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.adafruit.com',
    hosts: ['adafruit.com', 'www.adafruit.com'],
    searchPath: '/search?q={q}',
    productPathRe: /^\/product\/\d+/i,
    linkRe: /href=["']((?:https:\/\/www\.adafruit\.com)?\/product\/\d+)["']/gi,
  }),
  perakendeciAdaptor({
    id: 'walmart_us',
    name: 'Walmart',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.walmart.com',
    hosts: ['walmart.com', 'www.walmart.com'],
    searchPath: '/search?q={q}',
    productPathRe: /^\/ip\/[^/?#]+/i,
    linkRe: /href=["']((?:https:\/\/www\.walmart\.com)?\/ip\/[^"'?#]+)/gi,
  }),
  perakendeciAdaptor({
    id: 'bestbuy_us',
    name: 'Best Buy',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.bestbuy.com',
    hosts: ['bestbuy.com', 'www.bestbuy.com'],
    searchPath: '/site/searchpage.jsp?st={q}',
    productPathRe: /^\/site\/[^/]+\/\d+\.p$/i,
    linkRe: /href=["']((?:https:\/\/www\.bestbuy\.com)?\/site\/[^"']+\/\d+\.p)/gi,
  }),
  perakendeciAdaptor({
    id: 'target_us',
    name: 'Target',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.target.com',
    hosts: ['target.com', 'www.target.com'],
    searchPath: '/s?searchTerm={q}',
    productPathRe: /^\/p\/[^/?#]+/i,
    linkRe: /href=["']((?:https:\/\/www\.target\.com)?\/p\/[^"'?#]+)/gi,
  }),
  ebayAdaptor({
    id: 'ebay_us',
    name: 'eBay (US)',
    market: 'us',
    currency: 'USD',
    origin: 'https://www.ebay.com',
    hosts: ['ebay.com', 'www.ebay.com'],
    linkRe: /href=["'](https:\/\/www\.ebay\.com\/itm\/\d+)[^"']*/gi,
  }),

  // 🇫🇷 Fransa (EUR)
  perakendeciAdaptor({
    id: 'ldlc',
    name: 'LDLC',
    market: 'fr',
    currency: 'EUR',
    origin: 'https://www.ldlc.com',
    hosts: ['ldlc.com', 'www.ldlc.com'],
    searchPath: '/recherche/{q}/',
    productPathRe: /^\/fiche\/PB\d+\.html$/i,
    linkRe: /href=["']((?:https:\/\/www\.ldlc\.com)?\/fiche\/PB\d+\.html)["']/gi,
  }),
  perakendeciAdaptor({
    id: 'boulanger',
    name: 'Boulanger',
    market: 'fr',
    currency: 'EUR',
    origin: 'https://www.boulanger.com',
    hosts: ['boulanger.com', 'www.boulanger.com'],
    searchPath: '/resultats?tr={q}',
    productPathRe: /^\/ref\/\d+/i,
    linkRe: /href=["']((?:https:\/\/www\.boulanger\.com)?\/ref\/\d+)["']/gi,
  }),
  perakendeciAdaptor({
    id: '3djake_fr',
    name: '3DJake (FR)',
    market: 'fr',
    currency: 'EUR',
    origin: 'https://www.3djake.fr',
    hosts: ['3djake.fr', 'www.3djake.fr'],
    searchPath: '/recherche?keyword={q}',
    productPathRe: /^\/[a-z0-9-]+\/[a-z0-9-]+$/i,
    linkRe: /href=["']((?:https:\/\/www\.3djake\.fr)?\/[a-z0-9-]+\/[a-z0-9-]+)["']/gi,
    skipLinkRe: /\/(?:kunden|info|recherche|marques|aide|connexion|panier)\b/i,
  }),
  ebayAdaptor({
    id: 'ebay_fr',
    name: 'eBay (FR)',
    market: 'fr',
    currency: 'EUR',
    origin: 'https://www.ebay.fr',
    hosts: ['ebay.fr', 'www.ebay.fr'],
    linkRe: /href=["'](https:\/\/www\.ebay\.fr\/itm\/\d+)[^"']*/gi,
  }),

  // 🇪🇺 Avrupa (EUR)
  perakendeciAdaptor({
    id: '3djake_de',
    name: '3DJake (EU/DE)',
    market: 'eu',
    currency: 'EUR',
    origin: 'https://www.3djake.de',
    hosts: ['3djake.de', 'www.3djake.de'],
    searchPath: '/suche?keyword={q}',
    productPathRe: /^\/[a-z0-9-]+\/[a-z0-9-]+$/i,
    linkRe: /href=["']((?:https:\/\/www\.3djake\.de)?\/[a-z0-9-]+\/[a-z0-9-]+)["']/gi,
    skipLinkRe: /\/(?:kunden|info|suche|marken|hilfe|warenkorb)\b/i,
  }),

  // 🇯🇵 Japonya (JPY)
  rakutenJp,
  yodobashiJp,
];
