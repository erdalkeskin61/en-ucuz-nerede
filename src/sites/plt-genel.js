/**
 * Genel yapılandırılabilir HTML adaptörü (2026-10-25).
 *
 * Tek bir platform fabrikasına uymayan siteler için: arama yolu, kart seçicileri
 * ve ürün sayfası fiyat işaretleri yapılandırmayla verilir. Kural: **fiyat
 * uydurulmaz** — hiçbir işaret eşleşmezse `null` döner ("fiyat okunamadı").
 *
 * Ürün sayfasında önce JSON-LD Product denenir (en güvenilir kaynak); yoksa
 * yapılandırmadaki regex'ler sırayla uygulanır.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { findJsonLdProduct, dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';
import {
  extractSelfHealingPrice, extractSelfHealingTitle,
  extractSelfHealingImage, extractSelfHealingBrand,
} from '../selfHealingParser.js';

/** Bir HTML penceresinde ilk eşleşen regex'in 1. grubunu metin olarak döndürür. */
function ilkEslesme(metin, desenler) {
  if (desenler == null) return null;
  const liste = Array.isArray(desenler) ? desenler : [desenler];
  for (const re of liste) {
    if (!re) continue;
    const m = metin.match(re);
    if (m && m[1] != null) return m[1];
  }
  return null;
}

/** HTML etiketlerini temizler ve varlıkları çözer. */
function temizle(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function genelSite(cfg) {
  const {
    id, name, hosts, base,
    aramaYolu,             // ör. '/arama?k=' — base + yol + encodeURIComponent(sorgu)
    aramaSonek = '',       // sorgudan sonra eklenecek sabit parametreler (ör. '&post_type=product')
    render = false,        // arama sayfası JS ile mi yükleniyor?
    kart,                  // { baglanti: RegExp, fiyat: [RegExp], baslik?: RegExp, pencere?: number }
    urun,                  // { fiyat: [RegExp], baslik: [RegExp], eskiFiyat?: [RegExp], marka?: [RegExp], modelKodu?: [RegExp] }
    urunYolu,              // isProductUrl için RegExp
    urunHaric,             // ürün OLMAYAN yollar (RegExp) — ör. /sepet|hesabim|iletisim/
  } = cfg;

  if (!aramaYolu || !kart?.baglanti) throw new Error(`genelSite(${id}): aramaYolu ve kart.baglanti zorunlu`);

  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      if (urunHaric && urunHaric.test(url.pathname)) return false;
      return urunYolu ? urunYolu.test(url.pathname) : url.pathname.split('/').filter(Boolean).length > 0;
    },

    searchUrl(q) {
      return base + aramaYolu + encodeURIComponent(q) + aramaSonek;
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama', render });
      ctx.spend += r.requestsSpent;
      const html = r.body || '';
      const pencere = kart.pencere || 2500;
      const gorulen = new Map();

      const re = new RegExp(kart.baglanti.source, kart.baglanti.flags.includes('g') ? kart.baglanti.flags : kart.baglanti.flags + 'g');
      let m;
      while ((m = re.exec(html))) {
        const href = m[1];
        if (!href) continue;
        const url = absUrl(base, href);
        if (gorulen.has(url)) continue;
        const dilim = html.slice(m.index, m.index + pencere);
        const titleHam = ilkEslesme(dilim, kart.baslik) || temizle(dilim.slice(0, 400).replace(/<img[^>]*>/gi, ''));
        const title = temizle(titleHam).slice(0, 200);
        if (!title || title.length < 5) continue;
        const fiyatHam = ilkEslesme(dilim, kart.fiyat);
        gorulen.set(url, { title, url, price: fiyatHam != null ? parseNum(fiyatHam) : null });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh, render: !!opts.render });
      ctx.spend += r.requestsSpent;
      const html = r.body || '';

      // 1) JSON-LD Product (en güvenilir): ad + fiyat birlikte varsa kullan
      const ld = findJsonLdProduct(html);
      const ldFiyat = ld?.offers ? parseNum(Array.isArray(ld.offers) ? ld.offers[0]?.price : ld.offers.price) : null;

      // 2) 5 kademeli self-healing kaskad (2026-11-13):
      //    JSON-LD → Meta → DOM → adaptör regex → heuristic.
      //    Sabit regex tutmazsa fiyat kaybolmuyor; kurtarıldığı kademe loglanır.
      const sh = extractSelfHealingPrice(html, urun?.fiyat, name);

      const price = ldFiyat != null && ldFiyat > 0 ? ldFiyat : sh.fiyat;
      if (price == null || price <= 0) {
        throw new Error(`${name}: ürün fiyatı sayfada bulunamadı (fiyat JS ile yükleniyor olabilir).`);
      }

      const title = ld?.name || extractSelfHealingTitle(html, urun?.baslik);
      if (!title) throw new Error(`${name}: ürün başlığı bulunamadı.`);
      const image = extractSelfHealingImage(html) || null;
      const marka = (ld?.brand && typeof ld.brand === 'object' ? ld.brand.name : ld?.brand)
        || extractSelfHealingBrand(html, urun?.marka);

      const eskiHam = ilkEslesme(html, urun?.eskiFiyat);
      const eski = eskiHam != null ? parseNum(eskiHam) : null;
      const listeHam = ld?.offers ? parseNum(Array.isArray(ld.offers) ? ld.offers[0]?.priceSpecification?.price : ld.offers.priceSpecification?.price) : null;
      const listPrice = [eski, listeHam].find(x => x != null && x > price) || null;

      const kampanyalar = [];
      if (listPrice) kampanyalar.push('Liste fiyatından indirimli');
      // Havale/EFT indirimi koşulludur → kampanya olarak raporlanır, fiyata eklenmez
      const havaleM = html.match(/Havale\s*\/?\s*EFT[^0-9]{0,40}([\d.,]+)\s*(?:TL|₺)/i);
      if (havaleM) {
        const havale = parseNum(havaleM[1]);
        if (havale && havale > 0 && havale < price) {
          kampanyalar.push('Havale/EFT ile ' + havale.toLocaleString('tr-TR') + ' TL (yalnızca havale ödemesinde)');
        }
      }

      const ldOffer = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
      const stokYok = ldOffer?.availability
        ? !/InStock/i.test(ldOffer.availability)
        : /tükendi|stokta yok|out-of-stock|sold-out|stoklarımızda yok/i.test(html);

      return {
        site: this.id,
        siteName: this.name,
        url,
        title,
        brand: marka || null,
        modelCode: ld?.sku || ld?.mpn || temizle(ilkEslesme(html, urun?.modelKodu) || '') || null,
        barcode: ld?.gtin13 || ld?.gtin || null,
        color: dominantColor(title),
        listPrice,
        sellingPrice: price,
        currency: 'TRY',
        inStock: !stokYok,
        seller: ld?.seller?.name || null,
        image,
        campaigns: kampanyalar,
        shipping: kargoCikar(html, this.id),
      };
    },
  };
}
