/**
 * 🌍 Prusa Research Global Resmi Mağazaları (US / FR / JA) — 2026-11-23
 *
 * Prusa3D vitrinleri:
 *   - https://www.prusa3d.com/        (market: 'us', currency: 'USD', domain_1_sitemap.sellableProducts.xml)
 *   - https://www.prusa3d.com/fr/     (market: 'fr', currency: 'EUR', domain_6_sitemap.sellableProducts.xml)
 *   - https://www.prusa3d.com/ja/     (market: 'jp', currency: 'JPY', domain_8_sitemap.sellableProducts.xml)
 *
 * Arama: Prusa arama sayfası istemci taraflı Algolia ile yüklendiğinden doğrudan
 * resmi `sellableProducts.xml` dizini bellekte önbelleğe alınıp slug/kelime
 * skorlamasıyla aday çıkarılır.
 * Ürün Detayı: `<script type="application/ld+json">` (`@type: "Product"`) içinden okunur.
 */
import { fetchPage } from '../scraper.js';
import { dominantColor, paraBirimiNormalize, parcaMi } from '../util.js';
import { kargoCikar } from '../kargo.js';
import { jsonLdUrunBul, parseGlobalFiyat } from './creality-global.js';

const PRUSA_BASE = 'https://www.prusa3d.com';
const PRUSA_HOSTS = ['prusa3d.com', 'www.prusa3d.com'];
const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000;
const sitemapOnbellek = new Map();

async function prusaSitemapUrlAl(siteId, sitemapUrl, ctx) {
  const simdi = Date.now();
  const mevc = sitemapOnbellek.get(sitemapUrl);
  if (mevc && (simdi - mevc.ts) < SITEMAP_TTL_MS && Array.isArray(mevc.liste)) {
    return mevc.liste;
  }
  const r = await fetchPage(sitemapUrl, { site: siteId, purpose: 'arama' });
  ctx.spend += r.requestsSpent;
  const liste = [];
  const goruldu = new Set();
  for (const m of String(r.body || '').matchAll(/<loc>(https:\/\/www\.prusa3d\.com\/[^<]+)<\/loc>/gi)) {
    const hamUrl = m[1].trim();
    if (goruldu.has(hamUrl)) continue;
    goruldu.add(hamUrl);
    const parcalar = hamUrl.replace(/\/+$/, '').split('/');
    const slug = parcalar[parcalar.length - 1] || '';
    if (!slug) continue;
    const baslik = slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, ch => ch.toUpperCase());
    liste.push({ url: hamUrl, slug, baslik });
  }
  sitemapOnbellek.set(sitemapUrl, { ts: simdi, liste });
  return liste;
}

function prusaSitemapAdayAra(liste, sorgu, limit = 8) {
  const kelimeler = String(sorgu || '').toLowerCase()
    .replace(/[^a-z0-9\p{L}\s.+_-]/giu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  if (!kelimeler.length) return [];
  const sorguParca = parcaMi(sorgu);
  const skorlu = [];
  for (const item of liste) {
    const slugLow = item.slug.toLowerCase();
    const eslesen = kelimeler.filter(w => slugLow.includes(w)).length;
    if (!eslesen) continue;
    if (eslesen < kelimeler.length && kelimeler.length >= 2) {
      if (eslesen < Math.ceil(kelimeler.length * 0.6)) continue;
    }
    let puan = eslesen * 35;
    if (eslesen === kelimeler.length) puan += 50;
    if (/-main$/i.test(slugLow)) puan -= 90;
    if (!sorguParca && parcaMi(item.baslik)) puan -= 45;
    puan -= Math.min(slugLow.length, 100) / 10;
    skorlu.push({ item, puan });
  }
  skorlu.sort((a, b) => b.puan - a.puan);
  return skorlu.slice(0, limit).map(({ item }) => ({
    title: item.baslik,
    url: item.url,
    price: null,
    brand: 'Prusa Research',
  }));
}

function prusaAdaptorOlustur({ id, name, market, currency, sitemapUrl, aramaYol, yolDesen }) {
  const para = paraBirimiNormalize(currency);
  return {
    id,
    name,
    market,
    currency: para,
    hosts: PRUSA_HOSTS,

    matchesUrl(url) {
      return yolDesen.test(url.pathname);
    },

    isProductUrl(url) {
      return /\/(?:product|produit)\/[^/]+/i.test(url.pathname) && yolDesen.test(url.pathname);
    },

    searchUrl(q) {
      return `${PRUSA_BASE}${aramaYol}${encodeURIComponent(q)}`;
    },

    async searchProducts(query, ctx) {
      const liste = await prusaSitemapUrlAl(id, sitemapUrl, ctx);
      return prusaSitemapAdayAra(liste, query, 8);
    },

    async getProduct(url, ctx, opts = {}) {
      const u = new URL(url);
      const temizUrl = `${PRUSA_BASE}${u.pathname}`;
      const r = await fetchPage(temizUrl, { site: id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const ld = jsonLdUrunBul(html);
      if (!ld?.name) throw new Error(`${name}: Ürün JSON-LD verisi bulunamadı.`);

      const teklifListe = Array.isArray(ld.offers) ? ld.offers : (ld.offers ? [ld.offers] : []);
      const stokluTeklif = teklifListe.find(o => /InStock/i.test(String(o?.availability || ''))) || teklifListe[0] || {};
      const etkinPara = paraBirimiNormalize(stokluTeklif.priceCurrency || para);
      const fiyat = parseGlobalFiyat(stokluTeklif.price, etkinPara);
      const gorsel = Array.isArray(ld.image) ? ld.image[0] : (ld.image?.url || ld.image || null);
      const stokta = /InStock|OnlineOnly|LimitedAvailability/i.test(String(stokluTeklif.availability || ''))
        || !/OutOfStock|SoldOut|Discontinued/i.test(String(stokluTeklif.availability || ''));

      return {
        site: id,
        siteName: name,
        market,
        url: temizUrl,
        title: String(ld.name).trim(),
        brand: (typeof ld.brand === 'string' ? ld.brand : ld.brand?.name) || 'Prusa Research',
        modelCode: ld.sku || ld.mpn || null,
        barcode: ld.gtin13 || ld.gtin || null,
        color: dominantColor(ld.name),
        listPrice: null,
        sellingPrice: fiyat,
        currency: etkinPara,
        inStock: stokta,
        seller: 'Prusa Research',
        image: typeof gorsel === 'string' ? gorsel : null,
        campaigns: [],
        shipping: kargoCikar(html, id, { currency: etkinPara }),
      };
    },
  };
}

export const prusaGlobalSiteler = [
  prusaAdaptorOlustur({
    id: 'prusa_us',
    name: 'Prusa3D (US/Global)',
    market: 'us',
    currency: 'USD',
    sitemapUrl: `${PRUSA_BASE}/content/sitemaps/domain_1_sitemap.sellableProducts.xml`,
    aramaYol: '/search/?q=',
    yolDesen: /^\/product\//i,
  }),
  prusaAdaptorOlustur({
    id: 'prusa_fr',
    name: 'Prusa3D (FR)',
    market: 'fr',
    currency: 'EUR',
    sitemapUrl: `${PRUSA_BASE}/content/sitemaps/domain_6_sitemap.sellableProducts.xml`,
    aramaYol: '/fr/rechercher/?q=',
    yolDesen: /^\/fr\/produit\//i,
  }),
  prusaAdaptorOlustur({
    id: 'prusa_ja',
    name: 'Prusa3D (JP)',
    market: 'jp',
    currency: 'JPY',
    sitemapUrl: `${PRUSA_BASE}/content/sitemaps/domain_8_sitemap.sellableProducts.xml`,
    aramaYol: '/ja/search/?q=',
    yolDesen: /^\/ja\/product\//i,
  }),
];
