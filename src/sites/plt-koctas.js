/**
 * koctas.com.tr — özel platform (WooCommerce tabanlı).
 *
 * Arama: /search?q=<sorgu> (sunucu tarafında render edilir; ScraperAPI'den normal
 * istekle çalışır). Kartlar: li.prd içinde <a href="/{slug}/p/{id}" title="BAŞLIK">,
 * <h4 class="prd-title"><strong>MARKA</strong> BAŞLIK</h4>,
 * <div class="prd-price-last">670 TL</div>.
 *
 * Ürün sayfaları Cloudflare korumalıdır (normal ve render istekleri 500 döner).
 * Bu yüzden getProduct, ürünü ARAMA sayfası üzerinden çözer: ürün slug'ındaki
 * kelimelerle arama yapılır ve aynı URL'li kart bulunur. Fiyat, sitenin kendi
 * arama listesinde görünen güncel fiyattır.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function koctasSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/[a-z0-9-]+\/p\/\d+$/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/search?q=' + encodeURIComponent(q);
    },

    /** Arama sayfasındaki kartlardan (url, başlık, marka, fiyat) çıkarır. */
    kartlariCikar(html) {
      const kartlar = [];
      const re = /<a[^>]+href="(\/[a-z0-9-]+\/p\/\d+)"[^>]*title="([^"]{3,200})"/gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[1]);
        // kart gövdesi: prd-title (strong = marka) + prd-price-last
        const blokI = html.indexOf('"' + m[1] + '"');
        const blok = html.slice(blokI, blokI + 5000);
        const baslikM = blok.match(/<h4[^>]*class="[^"]*prd-title[^"]*"[^>]*>([\s\S]{3,200}?)<\/h4>/);
        const fiyatM = blok.match(/class="[^"]*prd-price-last[^"]*"[^>]*>\s*₺?\s*([\d.,]+)/);
        const kargoM = blok.match(/class="[^"]*prd-badge2[^"]*"[^>]*>\s*([^<]{3,60})/);
        if (!baslikM || !fiyatM) continue;
        const baslikHtml = baslikM[1];
        const markaM = baslikHtml.match(/<strong>([^<]{2,40})<\/strong>/);
        const baslik = decodeEntities(baslikHtml.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
        kartlar.push({
          url,
          title: baslik,
          brand: markaM ? decodeEntities(markaM[1]).trim() : null,
          price: parseNum(fiyatM[1]),
          kargoNotu: kargoM ? decodeEntities(kargoM[1]).trim() : null,
        });
      }
      // aynı URL'den birden çok kart olabilir (slider tekrarları)
      const gorulen = new Map();
      for (const k of kartlar) if (!gorulen.has(k.url)) gorulen.set(k.url, k);
      return [...gorulen.values()];
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      return this.kartlariCikar(r.body).slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      // Ürün sayfası CF korumalı; ürünü arama üzerinden çöz.
      const u = new URL(url);
      const slug = u.pathname.split('/').filter(Boolean)[0] || '';
      const kelimeler = slug.split('-').filter(w => w.length >= 3 && !/^\d+$/.test(w));
      const sorgu = kelimeler.slice(0, 5).join(' ');
      if (!sorgu) throw new Error('Koçtaş ürün bağlantısından arama kelimeleri çıkarılamadı.');

      const r = await fetchPage(this.searchUrl(sorgu), { site: this.id, purpose: 'urun-arama', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const kart = this.kartlariCikar(r.body).find(k => k.url === url);
      if (!kart) throw new Error('Ürün Koçtaş arama sonuçlarında bulunamadı (sayfası korumalı olduğu için arama üzerinden çözülüyor).');
      if (kart.price == null || kart.price <= 0) throw new Error('Ürün fiyatı alınamadı.');

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: kart.title,
        brand: kart.brand,
        modelCode: null,
        barcode: null,
        color: dominantColor(kart.title),
        listPrice: null,
        sellingPrice: kart.price,
        currency: 'TRY',
        inStock: true,
        seller: null,
        image: null,
        campaigns: [],
        shipping: kart.kargoNotu
          ? { fee: 0, freeOver: null, applies: false, note: kart.kargoNotu }
          : kargoCikar(r.body, this.id),
      };
    },
  };
}
