/**
 * T-Soft platformu (Türk e-ticaret altyapısı).
 *
 * Kullanıcı istediği üzerine eklenen 3D baskı sitelerinden 6'sı bu platformu kullanıyor:
 *   robotistan, robolinkmarket, direnc, motorobit, filamentsan, 3dortgen (shop.3dortgen.com)
 *
 * Arama: /arama?q=<sorgu>
 *   1) Yeni temalar sayfaya JSON-LD ItemList gömer: her öge tam Product verisi içerir
 *      (name, sku, gtin13, brand, offers.price) — robotistan, robolinkmarket, filamentsan.
 *   2) Eski/yeni temalarda DOM kartları: "baslik" (product-title bağlantıları) ya da
 *      "url" (data-toggle="product-url" + title) — direnc, motorobit, 3dortgen.
 *
 * Ürün sayfası:
 *   1) JSON-LD @graph içinde Product (name, sku, gtin13, brand, offers.price).
 *   2) Vue temaları bazı durumlarda sayfa yerine T-Soft "blog JSON"u döndürür:
 *      [{BLOCK_NAME:"Ürün Detayı", VARIABLES:{P:{TITLE, PRICE_SELL, VAT, DISPLAY_VAT, ...}}}]
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, extractJsonLd, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';
import { kdvDahilFiyat, kdvOraniBul, VARSAYILAN_KDV_ORANI } from '../kdv.js';

/** T-Soft'ta ürün olmayan sayfa yolları (kategori, marka, yardımcı sayfalar). */
const TSOFT_HARIC_YOLLAR = /^\/(arama|sepet|kategori|marka|sayfa|uyelik|uyye|iletisim|kampanya|blog|magaza|hakkimizda|gizlilik|kvkk|odeme|kargo|iade|siparis|favori|indirim|yeni|tumu|firsatlar|destek|sss|sozluk|coin|cookie|live-search)/i;

/** Sayfadaki JSON-LD ItemList ürünlerini tam veriyle çıkarır. */
function itemListUrunleri(html) {
  const dugumler = extractJsonLd(html).flatMap(d => d['@graph'] || (Array.isArray(d) ? d : [d]));
  const listeler = dugumler.filter(o => o?.['@type'] === 'ItemList');
  const urunler = [];
  for (const liste of listeler) {
    for (const e of (liste.itemListElement || [])) {
      const p = e?.item || e;
      if (p?.['@type'] === 'Product' && p.name && p.url) urunler.push(p);
    }
  }
  return urunler;
}

/** T-Soft blog-JSON yanıtından ürün nesnesi çıkarır (yoksa null). */
function blogJsonUrunu(body) {
  let bloklar;
  try { bloklar = JSON.parse(body); } catch { return null; }
  if (!Array.isArray(bloklar)) return null;
  const P = bloklar.find(b => b?.VARIABLES?.P?.TITLE)?.VARIABLES.P;
  return P || null;
}

export function tsoftSite(cfg) {
  const { id, name, hosts, base, tema = 'url', aramaYolu = '/arama?q=', kdvDahil = false } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (TSOFT_HARIC_YOLLAR.test(p)) return false;
      if (/\.(aspx|html?|php|shtml|xhtml|jpg|png|webp|css|js)$/i.test(p)) return false;
      // ürünler tek parçalı slug: /urun-adi-1-75mm-siyah
      const parca = p.split('/').filter(Boolean);
      return parca.length === 1 && p.length > 10;
    },

    searchUrl(q) {
      return base + aramaYolu + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;

      // 1) JSON-LD ItemList — tam ürün verisi (fiyat, model kodu, barkod dahil)
      const liste = itemListUrunleri(html);
      if (liste.length) {
        // KDV hariç yayımlayan mağazalarda (ör. direnc.net) liste fiyatı da hariçtir.
        const oran = kdvOraniBul(html) ?? VARSAYILAN_KDV_ORANI;
        const kdvCarpan = kdvDahil ? (1 + oran / 100) : 1;
        return liste.map(p => {
          const ham = parseNum(p.offers?.price);
          return {
            title: p.name,
            url: p.url,
            price: ham != null && kdvCarpan !== 1
              ? Math.round(ham * kdvCarpan * 100) / 100
              : ham,
            brand: p.brand?.name || null,
            modelCode: p.sku || null,
            barcode: p.gtin13 || null,
          };
        }).slice(0, 30);
      }

      // 2) DOM kartları
      const gorulen = new Map();
      if (tema === 'baslik') {
        const re = /<a[^>]*href="([^"]+)"[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(html))) {
          const url = absUrl(base, m[1]);
          const title = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
          if (title.length > 3) gorulen.set(url, { title, url });
        }
      } else {
        const re = /<a[^>]*data-toggle="product-url"[^>]*title="([^"]{5,200})"[^>]*href="([^"]+)"/gi;
        const re2 = /<a[^>]*href="([^"]+)"[^>]*data-toggle="product-url"[^>]*title="([^"]{5,200})"/gi;
        let m;
        while ((m = re.exec(html))) {
          const url = absUrl(base, m[2]);
          if (!TSOFT_HARIC_YOLLAR.test(new URL(url).pathname)) gorulen.set(url, { title: decodeEntities(m[1]).trim(), url });
        }
        while ((m = re2.exec(html))) {
          const url = absUrl(base, m[1]);
          if (!TSOFT_HARIC_YOLLAR.test(new URL(url).pathname)) gorulen.set(url, { title: decodeEntities(m[2]).trim(), url });
        }
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;

      // 1) JSON-LD Product
      const p = findJsonLdProduct(r.body);
      if (p?.name) {
        const hamFiyat = parseNum(p.offers?.price);
        // 🧾 KDV: sayfada "KDV Dahil" varsa o kullanılır; yalnızca "+ KDV" varsa
        // ya da mağaza KDV hariç yayımlıyorsa (direnc.net) KDV eklenir.
        const kdv = kdvDahilFiyat(r.body, hamFiyat, { zorunlu: kdvDahil });
        const price = kdv.fiyat;
        const hamListe = parseNum(p.offers?.priceSpecification?.price) || null;
        // Liste fiyatı da KDV hariç yayımlanmışsa aynı oranla yükseltilir.
        const listeAyarli = hamListe != null && kdv.uygulandi && kdv.haric != null && hamListe <= kdv.haric
          ? Math.round(hamListe * (1 + kdv.oran / 100) * 100) / 100
          : hamListe;
        const listPrice = listeAyarli != null && price && listeAyarli > price ? listeAyarli : null;
        return {
          site: this.id,
          siteName: this.name,
          url,
          title: p.name,
          brand: p.brand?.name || null,
          modelCode: p.sku || p.mpn || null,
          barcode: p.gtin13 || p.gtin || null,
          color: dominantColor(p.name),
          listPrice,
          sellingPrice: price,
          // KDV şeffaflığı (2026-10-31): fiyat KDV dahil; hariç tutar varsa taşınır.
          vatIncluded: kdv.fiyat != null ? true : null,
          vatRate: kdv.uygulandi ? kdv.oran : null,
          priceExVat: kdv.haric,
          currency: p.offers?.priceCurrency || 'TRY',
          inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
          seller: p.seller?.name || null,
          image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
          campaigns: [],
          shipping: kargoCikar(r.body, this.id),
        };
      }

      // 2) T-Soft blog-JSON (Vue temaları)
      const P = blogJsonUrunu(r.body);
      if (P?.TITLE) {
        // DISPLAY_VAT=1: PRICE_SELL KDV hariçtir, gösterimde KDV eklenir (558 * 1.20 = 669.6 gibi).
        const kdvOran = parseNum(P.VAT) || kdvOraniBul(r.body) || VARSAYILAN_KDV_ORANI;
        const fiyatHam = parseNum(P.PRICE_SELL);
        let price = fiyatHam != null
          ? (P.DISPLAY_VAT === '1' ? fiyatHam * (1 + kdvOran / 100) : fiyatHam)
          : null;
        // Sayfadaki görünür "KDV Dahil / + KDV" ifadesi blog JSON'dan daha güvenilir.
        const sayfaKdv = kdvDahilFiyat(r.body, price, { zorunlu: kdvDahil });
        if (sayfaKdv.uygulandi && sayfaKdv.fiyat != null) price = sayfaKdv.fiyat;
        const listeHam = parseNum(P.PRICE_NOT_DISCOUNTED);
        const liste = listeHam != null && sayfaKdv.uygulandi && sayfaKdv.haric != null && listeHam <= sayfaKdv.haric
          ? Math.round(listeHam * (1 + (sayfaKdv.oran || kdvOran) / 100) * 100) / 100
          : listeHam;
        const kampanyalar = [];
        const havale = parseNum(P.PRICE_MONEY_ORDER);
        if (havale && price && havale < price) kampanyalar.push('Havale/EFT ile ' + havale.toLocaleString('tr-TR') + ' TL (yalnızca havale ödemesinde)');
        if (P.DISCOUNT_PERCENT > 0) kampanyalar.push('Liste fiyatından %' + P.DISCOUNT_PERCENT + ' indirim');
        return {
          site: this.id,
          siteName: this.name,
          url,
          title: P.TITLE,
          brand: typeof P.BRAND === 'string' ? P.BRAND : (P.BRAND?.name || null),
          modelCode: P.PRODUCT_CODE || P.MODEL || null,
          barcode: P.BARCODE || P.MPN || null,
          color: dominantColor(P.TITLE),
          listPrice: liste != null && price && liste > price ? liste : null,
          sellingPrice: price,
          // KDV şeffaflığı (2026-10-31)
          vatIncluded: price != null ? true : null,
          vatRate: sayfaKdv.uygulandi ? sayfaKdv.oran : kdvOran,
          priceExVat: sayfaKdv.haric,
          currency: 'TRY',
          inStock: P.IN_STOCK !== false && P.IN_STOCK !== '0' && P.IS_ACTIVE !== '0',
          seller: null,
          image: P.IMAGE?.MEDIUM || P.IMAGE?.SMALL || null,
          campaigns: kampanyalar,
          shipping: P.IS_CARGO_FREE
            ? { fee: 0, freeOver: null, applies: false, note: 'Kargo bedava' }
            : kargoCikar(r.body, this.id),
        };
      }

      throw new Error('T-Soft ürün verisi sayfada bulunamadı (JSON-LD ya da blog JSON yok).');
    },
  };
}
