/**
 * Ticimax platformu — filamentdepom.com.
 *
 * Arama: /arama?kelime=<sorgu>. Kartlar sunucu tarafında render edilir:
 *   <div class="productName detailUrl"><a title="BAŞLIK" href='/slug'>BAŞLIK</a></div>
 *   fiyat: <span class="discountPriceSpan"> ₺1.544,12 </span> (KDV dahil)
 *   marka: <div class="productMarka">
 * Ürün sayfası: gömülü JS nesnesinde "productPriceKDVIncluded":1544.12, "productPriceStr":"1544,12",
 *   "product":{"urunAdi":...} alanları.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, jsSayi, absUrl } from '../util.js';

export function ticimaxSite(cfg) {
  const { id, name, hosts, base, aramaYolu = '/arama?kelime=' } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      const p = url.pathname;
      if (p.includes('/prd-')) return true;
      if (/^\/(arama|Arama|sepet|kategori|marka|sayfa|uyelik|iletisim|kampanya|blog|odeme|kargo|iade|siparis|sss|gizlilik|kvkk|hakkimizda|magaza|favori|destek|filament|pla|petg|abs|tpu|refill|3d-tarayici|revopoint)/i.test(p)) return false;
      if (/\.(aspx|html?|php|css|js|jpg|png|webp)$/i.test(p)) return false;
      const parca = p.split('/').filter(Boolean);
      if (p.includes('/prd-')) return true;
      return parca.length === 1 && p.length > 5;
    },

    searchUrl(q) {
      return base + aramaYolu + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // productName detailUrl kartları — href TEK TIRNAKLI olabilir!
      const re = /<div class="productName detailUrl"[^>]*>\s*<a[^>]*title="([^"]{5,200})"[^>]*href=['"]([^'"]+)['"]/gi;
      const re2 = /<div class="productName detailUrl"[^>]*>\s*<a[^>]*href=['"]([^'"]+)['"][^>]*title="([^"]{5,200})"/gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[2]);
        gorulen.set(url, { title: decodeEntities(m[1]).trim(), url, _konum: m.index });
      }
      while ((m = re2.exec(html))) {
        const url = absUrl(base, m[1]);
        if (!gorulen.has(url)) gorulen.set(url, { title: decodeEntities(m[2]).trim(), url, _konum: m.index });
      }

      const sonuclar = [...gorulen.values()];
      // Fiyat: kartın KENDİ penceresinden okunur (konum tahmini yerine kart bloğu).
      // Bazı temalarda (ventatek) fiyat başlıktan 1200 kr sonra gelir; ürünün kendi
      // kartı dışına taşmamak için pencere 3000 kr ile sınırlıdır.
      for (const k of sonuclar) {
        const dilim = html.slice(k._konum, k._konum + 3000);
        const fm = dilim.match(/discountPriceSpan">\s*₺?\s*([\d.,]+)/i)
          || dilim.match(/class="[^"]*(?:sale-price|productPrice|new-price)[^"]*"[^>]*>\s*₺?\s*([\d.,]+)/i);
        if (fm) k.price = parseNum(fm[1]);
      }
      for (const k of sonuclar) delete k._konum;
      return sonuclar.slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;

      // 1) JSON-LD Product (ad, marka, stok için en temiz kaynak)
      const p = findJsonLdProduct(html);
      const jsonLdFiyat = parseNum(p?.offers?.price);

      // 2) FİYAT: KDV DAHİL olan gerçek ödenecek tutar esas alınır.
      //    DİKKAT (2026-10-25): Ticimax'ta bazı mağazalar JSON-LD `price` alanına
      //    KDV HARİÇ fiyatı yazıyor (Ventatek: JSON-LD 496,54 — sayfada "Fiyat: ₺496,54
      //    + KDV" ve "KDV Dahil: ₺595,85"; Robotizmo: 545,91 ↔ 655,09). JSON-LD'yi
      //    doğrudan kullanmak bu siteleri olduğundan ~%17 UCUZ gösteriyordu.
      //    Sayfa kendi "KDV Dahil" fiyatını açıkça yayımlıyor; sıra:
      //      productPriceKDVIncluded → productPriceStr → kdvliFiyat bloğu → JSON-LD
      // DİKKAT: bu alan JSON SAYISIDIR ("595.848") — Türkçe binlik ayırıcı DEĞİL.
      // parseNum() noktayı binlik sanıp 595848 üretirdi; jsSayi() ile okunur.
      const kdvDahilJs = jsSayi(html.match(/"productPriceKDVIncluded"\s*:\s*(-?[\d.]+)/)?.[1], 2);
      const kdvDahilStr = parseNum(html.match(/"productPriceStr"\s*:\s*"([\d.,]+)"/)?.[1]);
      const kdvDahilBlok = parseNum(html.match(/id="kdvliFiyat"[\s\S]{0,200}?([\d.,]+)\s*</)?.[1]);
      // Öncelik: platformun sayısal KDV-dahil alanı → sayfadaki "KDV Dahil" satırı →
      // biçimli metin → JSON-LD. (İndirimli üründe hepsi aynı satış fiyatını verir;
      // en büyüğü seçmek liste fiyatını yanlışlıkla satış fiyatı sayabilirdi.)
      const kdvDahil = [kdvDahilJs, kdvDahilBlok, kdvDahilStr]
        .find(x => x != null && x > 0)
        ?? (jsonLdFiyat != null && jsonLdFiyat > 0 ? jsonLdFiyat : null);
      const fiyat = kdvDahil;
      if (fiyat == null) throw new Error('Ticimax ürün fiyatı sayfada bulunamadı.');

      const urunAdi = html.match(/"product"\s*:\s*\{[^}]*?"urunAdi"\s*:\s*"([^"]{5,200})"/)?.[1];
      const baslikM = urunAdi || html.match(/<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i)?.[1];
      const title = (p?.name && String(p.name).trim())
        || (baslikM ? decodeEntities(String(baslikM).replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))).replace(/\s+/g, ' ').trim() : null);
      if (!title) throw new Error('Ticimax ürün başlığı bulunamadı.');

      const marka = html.match(/"product"\s*:\s*\{[\s\S]{0,600}?"marka"\s*:\s*"([^"]{2,50})"/)?.[1] || p?.brand?.name || null;
      const stokKodu = html.match(/"product"\s*:\s*\{[\s\S]{0,1200}?"stokKodu"\s*:\s*"([^"]{2,40})"/)?.[1] || p?.sku || p?.mpn || null;
      const barkod = html.match(/"product"\s*:\s*\{[\s\S]{0,1200}?"barcode"\s*:\s*"?(\d{6,14})"?/)?.[1] || p?.gtin13 || p?.gtin || null;

      // Liste (üstü çizili) fiyat: piyasaFiyatiStr ya da sayfadaki regularPriceSpan.
      // İkisi de KDV dahildir; yalnızca satış fiyatından BÜYÜKSE liste fiyatı sayılır.
      const piyasa = parseNum(html.match(/"piyasaFiyatiStr"\s*:\s*"₺?([\d.,]+)"/)?.[1]);
      const regularSpan = parseNum(html.match(/regularPriceSpan[^>]*>\s*₺?\s*([\d.,]+)/i)?.[1]);
      const listeAday = [piyasa, regularSpan, parseNum(p?.offers?.priceSpecification?.price)]
        .filter(x => x != null && x > fiyat);
      const listPrice = listeAday.length ? Math.min(...listeAday) : null;

      const stokta = p?.offers?.availability
        ? /InStock/i.test(p.offers.availability)
        : (/"inStock"\s*:\s*true|"stokAdedi"\s*:\s*[1-9]/.test(html) || !/tükendi|stokta yok/i.test(html));
      const kampanyalar = [];
      if (listPrice) kampanyalar.push('Liste fiyatından indirimli');

      return {
        site: this.id,
        siteName: this.name,
        url,
        title,
        brand: marka,
        modelCode: stokKodu,
        barcode: barkod,
        color: dominantColor(title),
        listPrice,
        sellingPrice: fiyat,
        currency: 'TRY',
        inStock: stokta,
        seller: null,
        image: (html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1])
          || (Array.isArray(p?.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p?.image || null)),
        campaigns: kampanyalar,
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}

