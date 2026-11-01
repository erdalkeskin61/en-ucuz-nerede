/**
 * Hepsiburada adaptörü.
 *
 * Ürün sayfası: <script id="reduxStore"> içindeki Redux durumu (productState.product).
 *   - model kodu: HB'de üretici model kodu ayrı bir alan olarak yok; başlık benzerliği kullanılır.
 *   - renk: seçili varyantın properties dizisinde "Renk" (yalnızca ürünün kendi verisi)
 *   - fiyat: prices[0].value
 *   - kampanyalar: campaignNote + tagList (bilinen etiket kimlikleri metne çevrilir)
 *   - kargo: shipmentInformation.freeShipping
 * Arama sayfası: window.MORIA.VERTICALFILTER içindeki 'STATE' verisi (data.products).
 */
import { fetchPage } from '../scraper.js';
import { extractBalanced, dominantColor, stripTags } from '../util.js';

const HB_TAG_TEXTS = {
  'hepsitaksit-ile-pesin-fiyatina-3-taksit-firsati-7': 'Hepsitaksit ile peşin fiyatına 3 taksit fırsatı',
  'kredi-karti-3-taksit-2-tag': 'Kredi kartına 3 taksit',
  'kredi-karti-6-taksit-tag': 'Kredi kartına 6 taksit',
  'kredi-karti-9-taksit-tag': 'Kredi kartına 9 taksit',
  'kredi-karti-12-taksit-tag': 'Kredi kartına 12 taksit',
  'pft-3-taksit-sda-mda-mobilya-yeinlenmis-cep-telefonu-bilgisayar-hirdavat-tablet': 'Peşin fiyatına 3 taksit (seçili kategorilerde)',
  'visa-okula-donus-kampanyasi-ekipman-ve-aksesuar': 'Visa okula dönüş kampanyası (ekipman ve aksesuar)',
  'marketing-best-seller-1': 'En çok satanlar',
  'musteri-ceken-urunler': 'Müşterilerin dikkatini çeken ürün',
};

export default {
  id: 'hepsiburada',
  name: 'Hepsiburada',
  hosts: ['hepsiburada.com', 'www.hepsiburada.com'],

  isProductUrl(url) {
    return /-p[m]?-[A-Z0-9]+/i.test(url.pathname);
  },

  searchUrl(q) {
    return 'https://www.hepsiburada.com/ara?q=' + encodeURIComponent(q);
  },

  async searchProducts(query, ctx) {
    const r = await fetchPage(this.searchUrl(query), { site: this.id, purpose: 'arama' });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    // HB arama sayfasındaki ürün verisi window.MORIA.VERTICALFILTER içinde taşınır; sayfa
    // sürümüne göre farklı kaçış (escape) katmanlarında gömülüdür. Bu yüzden alanlar,
    // tırnakların önünde isteğe bağlı ters bölü işareti bulunacak biçimde yakalanır.
    const out = [];
    const seen = new Set();
    const re = /\\?"sku\\?":\\?"(HBCV[A-Z0-9]+)\\?",\\?"name\\?":\\?"(.*?)\\?",\\?"url\\?":\\?"([^"\\]+)/g;
    let m;
    while ((m = re.exec(html))) {
      const sku = m[1];
      if (seen.has(sku)) continue;
      seen.add(sku);
      const name = m[2].replace(/\\(.)/g, '$1'); // kaçış karakterlerini çöz (\" -> ")
      const url = 'https://www.hepsiburada.com' + m[3];
      // Bu varyantın çevresinden fiyat ve renk bilgisi
      const before = html.slice(Math.max(0, m.index - 2500), m.index + 300);
      const after = html.slice(m.index, m.index + 6000);
      const brandMatch = [...before.matchAll(/\\?"brand\\?":\\?"([^"\\]+)/g)].pop();
      const priceMatch = after.match(/\\?"priceInfo\\?":\{\\?"price\\?":([\d.]+)/);
      const colorMatch = after.match(/\\?"properties\\?":\{\\?"Renk\\?":\{\\?"displayValue\\?":\\?"([^"\\]+)/);
      out.push({
        title: String(name),
        url,
        price: priceMatch ? parseFloat(priceMatch[1]) : null,
        brand: brandMatch ? brandMatch[1] : null,
        color: colorMatch ? colorMatch[1] : null,
      });
    }
    return out;
  },

  async getProduct(url, ctx, opts = {}) {
    const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
    ctx.spend += r.requestsSpent;
    const html = r.body;
    const idx = html.indexOf('{"accountState"');
    const json = idx >= 0 ? extractBalanced(html, idx) : null;
    let p = null;
    if (json) {
      try { p = JSON.parse(json)?.productState?.product || null; } catch { p = null; }
    }
    if (!p) throw new Error('Hepsiburada ürün verisi sayfada bulunamadı.');

    const variant = (p.variants || []).find(v => v.isDefault) || (p.variants || [])[0] || {};
    // Renk: yalnızca ürünün kendi varyant verisinden
    let color = null;
    if (Array.isArray(variant.properties)) {
      color = variant.properties.find(x => x?.name === 'Renk')?.valueObject?.actualValue || null;
    } else if (variant.properties?.Renk) {
      color = variant.properties.Renk.displayValue || variant.properties.Renk.value || null;
    }
    color = color || dominantColor(p.name) || null;

    const selling = p.prices?.[0]?.value ?? variant.price ?? null;

    // Kampanyalar
    const campaigns = [];
    if (p.campaignNote) campaigns.push(String(p.campaignNote));
    for (const t of p.tagList || []) {
      const text = HB_TAG_TEXTS[t?.tagId];
      if (text) campaigns.push(text);
    }
    if (p.paymentTag?.text) campaigns.push(stripTags(p.paymentTag.text));

    // Kargo
    const free = p.shipmentInformation?.freeShipping === true;
    const shipping = free
      ? { fee: 0, freeOver: null, applies: false, note: 'Kargo bedava' }
      : { fee: null, freeOver: null, applies: null, note: 'Kargo ücretli olabilir (tutar ödeme adımında belli olur)' };

    return {
      site: this.id,
      siteName: this.name,
      url,
      title: (p.brand ? p.brand + ' ' : '') + (p.name || ''),
      brand: p.brand || null,
      modelCode: null, // HB üretici model kodunu ayrı alan olarak yayınlamıyor
      barcode: p.barcode || variant.barcodes?.[0] || variant.barcode || null,
      color,
      listPrice: null,
      sellingPrice: selling,
      currency: 'TRY',
      inStock: p.isInStock !== false,
      seller: p.merchantName || null,
      image: variant.thumbnail || null,
      campaigns,
      shipping,
    };
  },
};
