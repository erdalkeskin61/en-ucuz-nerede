/**
 * IdeaSoft klasik teması — matersan.com.tr.
 *
 * Arama: /tumu-c-0?k=<sorgu> (sunucu tarafında render edilir).
 *   Kartlar: <div class="showcase-title"><a href="/urun/<slug>" title="BAŞLIK">,
 *   fiyat: <div class="showcase-price-new"> 102.000,00 TL </div>
 * Ürün sayfası: fiyat <div class="product-price-new"> TL metninde; "havale" fiyatı
 * (product-money-order) koşullu kampanya olarak eklenir.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

export function ideasoftKlasikSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/urun\/[^/]+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/tumu-c-0?k=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const html = r.body;
      const gorulen = new Map();

      // showcase-title başlık bağlantıları
      const re = /<div class="showcase-title">\s*<a[^>]+href="(\/urun\/[^"]+)"[^>]*title="([^"]{5,200})"/gi;
      let m;
      while ((m = re.exec(html))) {
        const url = absUrl(base, m[1]);
        gorulen.set(url, { title: decodeEntities(m[2]).trim(), url });
      }

      // fiyatlar: kart başlığı ile aynı kart içindeki showcase-price-new değeri
      // (biçim değişkendir: "102.000,00 TL", "<span>₺125</span>" gibi)
      const fiyatKonumlari = [...html.matchAll(/<div class="showcase-title">[\s\S]{0,1200}?showcase-price-new">\s*(?:<span[^>]*>)?\s*₺?\s*([\d.,]+)/gi)];
      const sonuclar = [...gorulen.values()];
      for (const k of sonuclar) {
        const konum = html.indexOf('"' + k.title + '"');
        const uygun = fiyatKonumlari.find(x => x.index > konum - 600 && x.index < konum + 2500);
        if (uygun) k.price = parseNum(uygun[1]);
      }
      return sonuclar.slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;

      const fiyatM = html.match(/class="product-price-new"[^>]*>\s*(?:<span[^>]*>)?\s*₺?\s*([\d.,]+)/i)
        || html.match(/class="product-price"[\s\S]{0,300}?₺?\s*([\d.,]+)/i)
        // son çare: bazı temalar (ör. robitshop) fiyatı product-price-old içinde gösterir
        || html.match(/class="product-price-old"[^>]*>\s*₺?\s*([\d.,]+)/i);
      if (!fiyatM) throw new Error('IdeaSoft ürün fiyatı sayfada bulunamadı (fiyat JS ile yükleniyor olabilir).');
      const price = parseNum(fiyatM[1]);

      const baslikM = html.match(/<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i)
        || html.match(/<meta property="og:title" content="([^"]{5,200})"/i);
      const title = baslikM ? decodeEntities(baslikM[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
      if (!title) throw new Error('IdeaSoft ürün başlığı bulunamadı.');

      // Havale indirimi (varsa) koşullu kampanyadır: "Havale: 99.960,00 TL"
      const havaleM = html.match(/<div class="product-money-order">[\s\S]{0,200}?([\d.,]+)\s*TL/i)
        || html.match(/<div class="product-list-title">\s*Havale[\s\S]{0,200}?<div class="product-list-content">\s*₺?\s*([\d.,]+)/i);
      const kampanyalar = [];
      let listPrice = null;
      if (havaleM) {
        const havale = parseNum(havaleM[1]);
        if (havale && price && havale < price) {
          kampanyalar.push('Havale/EFT ile ' + havale.toLocaleString('tr-TR') + ' TL (yalnızca havale ödemesinde)');
        }
      }
      // İndirim öncesi fiyat (üstü çizili) varsa liste fiyatı olarak alınır
      const eskiM = html.match(/<div class="product-price-old">\s*(?:<span[^>]*>)?\s*₺?\s*([\d.,]+)/i);
      if (eskiM) {
        const eski = parseNum(eskiM[1]);
        if (eski && price && eski > price) {
          listPrice = eski;
          kampanyalar.push('Liste fiyatından indirimli');
        }
      }

      const stokYok = /class="[^"]*out-of-stock|tükendi|stokta yok/i.test(html);

      // Marka: temaya göre farklı yerlerde (2026-10-25: robitshop "product-brands"
      // satırını kullanıyor — yalnız product-brand arandığı için marka null kalıyordu).
      const markaM = html.match(/<div class="product-brand[^"]*"[^>]*>\s*<a[^>]*>\s*([^<]{2,50})\s*<\/a>/i)
        || html.match(/class="[^"]*product-brands[^"]*"[\s\S]{0,300}?<a[^>]*>\s*([^<]{2,50})\s*<\/a>/i)
        || html.match(/<div class="product-list-title">\s*Marka\s*<\/div>\s*<div class="product-list-content">\s*<a[^>]*>\s*([^<]{2,50})\s*<\/a>/i)
        || html.match(/"brand"\s*:\s*\{\s*"name"\s*:\s*"([^"]{2,50})"/i);

      return {
        site: this.id,
        siteName: this.name,
        url,
        title,
        brand: markaM ? decodeEntities(markaM[1]).trim() : null,
        modelCode: (html.match(/Stok Kodu[:\s]*<\/[^>]+>\s*<[^>]+>\s*([A-Z0-9][A-Z0-9\-./]{3,30})/i)?.[1]) || null,
        barcode: null,
        color: dominantColor(title),
        listPrice,
        sellingPrice: price,
        currency: 'TRY',
        inStock: !stokYok,
        seller: null,
        image: (html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1]) || null,
        campaigns: kampanyalar,
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
