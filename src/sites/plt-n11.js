/**
 * n11.com — büyük pazaryeri.
 *
 * ÖNEMLİ: n11'in HTTPS'i Cloudflare korumalı (normal+render+premium bile 500/403),
 * ancak düz HTTP (http://www.n11.com) korumasız ve tam içerik veriyor — tüm istekler
 * HTTP üzerinden atılır (istek başına 1 kredi, render gerekmez).
 *
 * Arama: http://www.n11.com/arama?q=<sorgu> — sayfada JSON-LD ItemList
 * (name, url, offers.price, offers.priceSpecification ListPrice, brand.name, sku).
 * Ürün URL'si: /urun/{slug}-{sayı}.
 * Ürün sayfası: JSON-LD Product + shippingDetails (kargo ücreti) + "SEPETTE" kampanyası.
 * Sepette fiyatı yalnızca JSON-LD ana fiyatından DÜŞÜKSE kampanya sayılır (ürün
 * sayfasındaki SEPETTE etiketi başka satıcıların tekliflerine de eşlik edebilir).
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { extractJsonLd, parseNum, dominantColor, decodeEntities, barkodCikarHtml } from '../util.js';

function httpUrl(url) {
  // Kullanıcı https://www.n11.com/... linki yapıştırsa bile http üzerinden çekiyoruz
  return String(url).replace(/^https:\/\//i, 'http://');
}

export function n11Site(cfg) {
  const { id, name, hosts, base } = cfg; // base: http://www.n11.com
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/urun\//i.test(url.pathname) && /-\d+$/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/arama?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const out = [];
      for (const d of extractJsonLd(r.body)) {
        if (d['@type'] !== 'ItemList') continue;
        for (const li of d.itemListElement || []) {
          const item = li.item || {};
          if (!item.url || !item.name) continue;
          out.push({
            title: item.name,
            url: httpUrl(item.url),
            price: item.offers?.price != null ? parseNum(item.offers.price) : null,
            brand: item.brand?.name || null,
          });
        }
      }
      return out.slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const hedef = httpUrl(url);
      let r;
      try {
        r = await fetchPage(hedef, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      } catch (e) {
        // n11 ara sıra var olan sayfalara geçici 404 döndürüyor — bir kez taze
        // deneyip sonra dürüst hata veriyoruz (gerçekten ölü ürünse 1 kredi ek maliyet)
        if (!/HTTP 404/.test(String(e.message || e))) throw e;
        r = await fetchPage(hedef, { site: this.id, purpose: 'urun', fresh: true });
      }
      ctx.spend += r.requestsSpent;
      const html = r.body;

      const p = extractJsonLd(html).find(d => d['@type'] === 'Product');
      if (!p?.name) throw new Error('n11 ürün verisi (JSON-LD Product) sayfada bulunamadı.');
      const selling = parseNum(p.offers?.price);
      if (selling == null || selling <= 0) throw new Error('n11 ürün fiyatı alınamadı.');

      // Başlık: JSON-LD adı " Fiyatları ve Özellikleri" ekiyle gelir
      let title = decodeEntities(p.name).replace(/\s*Fiyatları ve Özellikleri\s*$/i, '').trim();

      const list = parseNum(p.offers?.priceSpecification?.price);
      const campaigns = [];

      // Sepette kampanyası: ana fiyat alanındaki "SEPETTE <fiyat> TL" (yalnızca daha düşükse)
      const sepetM = html.match(/class="price"[^>]*>\s*SEPETTE\s*<\/div>\s*<div class="priceDisplay">\s*([\d.,]+)\s*TL/i);
      if (sepetM) {
        const sepetFiyat = parseNum(sepetM[1]);
        if (sepetFiyat != null && sepetFiyat < selling) {
          campaigns.push('Sepete ekleyince ' + sepetFiyat.toLocaleString('tr-TR') + ' TL (sepette otomatik uygulanır)');
        }
      }

      // Kargo: JSON-LD shippingDetails.shippingRate.value (0 = ücretsiz)
      const kargoUcret = parseNum(p.offers?.shippingDetails?.shippingRate?.value);
      const ucretsizKargo = kargoUcret === 0 || /class="freeShipment"[^>]*>\s*Ücretsiz Kargo/i.test(html);
      const shipping = ucretsizKargo
        ? { fee: 0, freeOver: null, applies: null, note: 'Ücretsiz kargo (ürün sayfasında belirtiliyor)' }
        : kargoUcret != null
          ? { fee: kargoUcret, freeOver: null, applies: null, note: 'Kargo ' + kargoUcret.toLocaleString('tr-TR') + ' TL' }
          : kargoCikar(r.body, this.id);

      // Barkod/GTIN: sayfada JSON-LD ya da gömülü JSON içinde yayımlanıyor
      // (2026-10-28: barkod okuma özelliği için gerekli; önceden null sabitti).
      return {
        site: this.id,
        siteName: this.name,
        url,
        title,
        brand: p.brand?.name || null,
        modelCode: null, // n11 sku'su (127...) site içi katalog numarasıdır, model kodu değil
        barcode: barkodCikarHtml(html),
        color: dominantColor(title),
        listPrice: list && list > selling ? list : null,
        sellingPrice: selling,
        currency: p.offers?.priceCurrency || 'TRY',
        inStock: /InStock/i.test(p.offers?.availability || '') || p.offers?.availability == null,
        seller: null,
        image: Array.isArray(p.image) ? (typeof p.image[0] === 'string' ? p.image[0] : p.image[0]?.url || null) : (p.image || null),
        campaigns,
        shipping,
      };
    },
  };
}
