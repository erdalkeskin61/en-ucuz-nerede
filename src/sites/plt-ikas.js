/**
 * İkas platformu — market.samm.com.
 *
 * Arama: /search?s=<sorgu>. Next.js SSR: kartlar <a href="/slug"> içinde başlık div'i
 * ve "214,84 ₺" biçiminde fiyat div'i ile sunucu tarafında gelir.
 * Ürün sayfası: JSON-LD Product (offers dizi içinde; fiyat KDV dahil).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

const IKAS_HARIC_YOLLAR = /^\/(search|arama|sepet|cart|checkout|kategori|category|marka|brand|sayfa|page|hesabim|account|iletisim|contact|blog|kampanya|odeme|kargo|iade|siparis|gizlilik|kvkk|hakkimizda|magaza|destek|sss|login|signup)/i;

export function ikasSite(cfg) {
  // İkas aramaları VARSAYILAN OLARAK render gerektirir: ürünler istemci tarafında
  // GraphQL ile yüklenir, sunucu HTML'i `?s=` sorgusunu yok sayıp varsayılan listeyi
  // döndürür (2026-10-25 ölçümü: "pla filament" → Raspberry Pi aksesuarları).
  // SSR arama döndüren bir site bulunursa `render: false` ile kapatılabilir.
  const { id, name, hosts, base, render = true } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (IKAS_HARIC_YOLLAR.test(p)) return false;
      if (/\.(html?|php|css|js|jpg|png|webp)$/i.test(p)) return false;
      const parca = p.split('/').filter(Boolean);
      return parca.length === 1 && p.length > 10;
    },

    searchUrl(q) {
      return base + '/search?s=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      // 1) Hızlı & Doğrudan GraphQL araması (api.myikas.com):
      // İkas mağazalarının HTML'inde yayımlanan API anahtarı (JWT) ve satış kanalı ID'si ile
      // headless browser açmadan <200ms'de doğrudan JSON sonuç alınır.
      try {
        const rDirect = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', render: false });
        ctx.spend += rDirect.requestsSpent;
        const htmlDirect = rDirect.body;

        const jwtM = htmlDirect.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
        if (jwtM) {
          const jwt = jwtM[0];
          const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
          const sfId = payload.sf;
          const salesChannelId = payload.sl;

          if (sfId && salesChannelId) {
            const gql = {
              query: `query searchProducts($input: SearchInput!) {
                searchProducts(input: $input) {
                  count
                  results {
                    id
                    name
                    brand { name }
                    metaData { slug }
                    variants {
                      prices { discountPrice sellPrice buyPrice }
                      stocks { stockCount }
                      sellIfOutOfStock
                    }
                  }
                }
              }`,
              variables: {
                input: {
                  locale: "tr",
                  page: 1,
                  perPage: 25,
                  filterList: [],
                  facetList: [],
                  salesChannelId: salesChannelId,
                  query: query,
                  order: [{ direction: "DESC", type: "CREATED_AT" }],
                  showStockOption: "SHOW_ALL"
                }
              }
            };

            const gqlRes = await fetch("https://api.myikas.com/api/sf/graphql?op=searchProducts", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": jwt,
                "x-sfid": sfId,
                "referer": base + "/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
              },
              body: JSON.stringify(gql),
              signal: AbortSignal.timeout(6000)
            });

            if (gqlRes.ok) {
              const resJson = await gqlRes.json();
              const items = resJson.data?.searchProducts?.results || [];
              if (items.length > 0) {
                return items.map(item => {
                  const v = item.variants?.[0] || {};
                  const pr = v.prices?.[0] || {};
                  const price = (pr.discountPrice != null && pr.discountPrice > 0) ? pr.discountPrice : pr.sellPrice;
                  return {
                    title: item.name,
                    url: absUrl(base, "/" + item.metaData?.slug),
                    price: price != null ? Number(price) : null,
                    brand: item.brand?.name || null
                  };
                }).filter(x => x.title && x.url);
              }
            }
          }
        }
      } catch (err) {
        // GraphQL başarısızsa alttaki render yedeğine düşer
      }

      // 2) Yedek: İkas arama sayfası ürünleri render ile yükleme
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', render });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // Kart: <a href="/slug" ...> ... <div>BAŞLIK</div> ... <div ...>214,84 ₺</div> ... </a>
      // Fiyat biçimi siteye göre değişir: "214,84 ₺" ya da "₺ 214,84" (2026-10-25).
      const re = /<a[^>]+href="(\/[a-z0-9-]{10,120})"[^>]*>([\s\S]{50,2500}?)<\/a>/gi;
      let m;
      while ((m = re.exec(html))) {
        const href = m[1];
        if (IKAS_HARIC_YOLLAR.test(href)) continue;
        const ic = m[2];
        const fiyatM = ic.match(/₺\s*([\d][\d.,]{1,10})/) || ic.match(/([\d][\d.,]{1,10})\s*₺/);
        if (!fiyatM) continue;
        const kes = ic.search(/₺/);
        const onBaslik = ic.slice(0, kes >= 0 ? kes : ic.indexOf(fiyatM[0]));
        const baslik = decodeEntities(onBaslik.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (baslik.length < 8) continue;
        gorulen.set(absUrl(base, href), { title: baslik, url: absUrl(base, href), price: parseNum(fiyatM[1]) });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const p = findJsonLdProduct(r.body);
      if (!p?.name) throw new Error('İkas ürün verisi (JSON-LD) sayfada bulunamadı.');

      const price = parseNum(p.offers?.price);
      if (price == null) throw new Error('İkas ürün fiyatı JSON-LD içinde bulunamadı.');

      // "520,83 ₺ + KDV" gibi KDV hariç gösterim varsa JSON-LD fiyatı (KDV dahil) esas alınır.
      const kampanyalar = [];
      const kdvsizM = r.body.match(/([\d.,]+)\s*₺\s*(?:<!-- -->\s*)?\+\s*KDV/);
      if (kdvsizM) kampanyalar.push('Fiyat KDV dahildir; KDV hariç ' + kdvsizM[1] + ' ₺');

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: p.name,
        brand: p.brand?.name || null,
        modelCode: p.sku || p.mpn || null,
        barcode: p.gtin13 || p.gtin || null,
        color: dominantColor(p.name),
        listPrice: null,
        sellingPrice: price,
        currency: p.offers?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns: kampanyalar,
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
