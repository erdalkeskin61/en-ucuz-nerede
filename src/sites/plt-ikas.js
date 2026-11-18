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

/**
 * Mağaza başına GraphQL kimliği (JWT + satış kanalı) ÖNBELLEĞİ — 2026-11-03.
 *
 * Neden: her aramada önce arama HTML'i çekilip içinden JWT ayıklanıyordu (site
 * başına 2-4 istek). 61 site paralel taranırken bu ek yük artıyor, HTML soft-block
 * yediğinde JWT bulunamıyor ve adaptör sorguyu YOK SAYAN render yedeğine düşüyordu.
 * Sonuç: aynı ürün yerine aksesuarlar inceleniyor, ürün "bulunamadı" sayılıyordu
 * (fixx3d / Creality K1 Max olayı). Kimlik 30 dk önbelleklenir.
 */
const IKAS_KIMLIK_TTL_MS = 30 * 60 * 1000;
const ikasKimlik = new Map(); // base -> { jwt, sf, sl, ts }

/** Fiyatı yalnızca TRY ise döndürür; başka para birimi (ör. USD) TL sanılmaz. */
function tryFiyati(prices, alanlar) {
  const p = Array.isArray(prices) ? prices[0] : prices;
  if (!p) return { fiyat: null, paraBirimi: null };
  const kod = String(p.currencyCode || p.currency || '').toUpperCase();
  const deger = alanlar.map(a => Number(p[a])).find(v => Number.isFinite(v) && v > 0) ?? null;
  if (deger == null) return { fiyat: null, paraBirimi: kod || null };
  // Para birimi bilinmiyorsa güvenli tarafta kal: TL olduğu VARSAYILMAZ.
  if (kod !== 'TRY') return { fiyat: null, paraBirimi: kod || null };
  return { fiyat: deger, paraBirimi: 'TRY' };
}

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
      // 1) Mağaza kimliği (JWT + satış kanalı) — 30 dk ÖNBELLEKLİ (2026-11-03).
      //    Aksi hâlde her aramada HTML çekilip JWT ayıklanıyordu; site yük altında
      //    soft-block yiyince JWT bulunamıyor ve sorguyu yok sayan render yedeğine
      //    düşülüyordu (fixx3d / Creality K1 Max: ürün yerine aksesuar inceleniyordu).
      const kimlik = await this.ikasKimlikGetir(ctx).catch(() => null);

      if (kimlik?.jwt && kimlik?.sf && kimlik?.sl) {
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
                  prices { currencyCode discountPrice sellPrice buyPrice }
                  stocks { stockCount }
                  sellIfOutOfStock
                }
              }
            }
          }`,
          variables: {
            input: {
              locale: 'tr',
              page: 1,
              perPage: 25,
              filterList: [],
              facetList: [],
              salesChannelId: kimlik.sl,
              query: query,
              order: [{ direction: 'DESC', type: 'CREATED_AT' }],
              showStockOption: 'SHOW_ALL',
            },
          },
        };

        // 2 deneme: kısa bir ağ hatasında hemen render yedeğine düşmeyelim.
        for (let deneme = 0; deneme < 2; deneme++) {
          try {
            const gqlRes = await fetch('https://api.myikas.com/api/sf/graphql?op=searchProducts', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': kimlik.jwt,
                'x-sfid': kimlik.sf,
                'referer': base + '/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              },
              body: JSON.stringify(gql),
              signal: AbortSignal.timeout(8000),
            });

            if (gqlRes.status === 401 || gqlRes.status === 403) {
              ikasKimlik.delete(base); // anahtar bayat → bir sonraki çağrıda yenilenir
              break;
            }
            if (gqlRes.ok) {
              const resJson = await gqlRes.json();
              const items = resJson.data?.searchProducts?.results || [];
              if (items.length > 0) {
                const liste = items.map(item => {
                  const v = item.variants?.[0] || {};
                  const { fiyat, paraBirimi } = tryFiyati(v.prices, ['discountPrice', 'sellPrice']);
                  return {
                    title: item.name,
                    url: absUrl(base, '/' + item.metaData?.slug),
                    // Fiyat YALNIZCA TL ise dolu. İkas bazı mağazalarda fiyatı mağaza
                    // para biriminde (ör. USD) döner; 725 USD'yi 725 TL sanmak
                    // "sahte ucuz" üretirdi (2026-11-03).
                    price: fiyat,
                    paraBirimi,
                    brand: item.brand?.name || null,
                  };
                }).filter(x => x.title && x.url);
                return liste;
              }
              // Sonuç yok: ikinci deneme anlamsız → yedeğe düş.
              break;
            }
            // 5xx / 429 → kısa bekle, tekrar dene
            await new Promise(r => setTimeout(r, 400));
          } catch {
            await new Promise(r => setTimeout(r, 400));
          }
        }
      }

      // 3) Yedek: arama sayfasını render ederek oku.
      //    DİKKAT: İkas'ın sunucu HTML'i "?s=" sorgusunu yok sayar (varsayılan liste).
      //    Bu yüzden yedek sonuçlar SORGU KELİMELERİYLE süzülür; aksi hâlde alakasız
      //    aksesuarlar aday havuzunu doldurup gerçek ürünü dışarıda bırakıyordu.
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
        gorulen.set(absUrl(base, href), { title: baslik, url: absUrl(base, href), price: parseNum(fiyatM[1]), paraBirimi: 'TRY' });
      }

      const kelimeler = String(query || '').toLocaleLowerCase('tr-TR')
        .split(/[^a-z0-9çğıöşü]+/i).filter(w => w.length >= 3);
      const ilgili = [...gorulen.values()].filter(x => {
        if (!kelimeler.length) return true;
        const t = String(x.title).toLocaleLowerCase('tr-TR');
        return kelimeler.some(w => t.includes(w));
      });
      return (ilgili.length ? ilgili : [...gorulen.values()]).slice(0, 30);
    },

    /**
     * İkas mağaza kimliği: sayfadaki JWT + satış kanalı (sf/sl).
     * 30 dk önbelleklenir; 401/403 alınırsa temizlenir.
     */
    async ikasKimlikGetir(ctx) {
      const kayit = ikasKimlik.get(base);
      if (kayit && Date.now() - kayit.ts < IKAS_KIMLIK_TTL_MS) return kayit;

      const rDirect = await fetchPage(this.searchUrl('a'), { site: this.id, purpose: 'arama', render: false });
      if (ctx) ctx.spend += rDirect.requestsSpent;
      const jwtM = rDirect.body.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
      if (!jwtM) return null;
      const jwt = jwtM[0];
      let payload;
      try { payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')); } catch { return null; }
      const veri = { jwt, sf: payload.sf, sl: payload.sl, ts: Date.now() };
      if (!veri.sf || !veri.sl) return null;
      ikasKimlik.set(base, veri);
      return veri;
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
