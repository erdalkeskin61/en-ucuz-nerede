/**
 * Shopify platformu — 3dteknomarket.com, porima3d.com.
 *
 * Arama: /search/suggest.json (resmî Shopify arama ucu; JSON döner, fiyat içerir).
 * Ürün sayfası: /products/<handle>.js (resmî JSON ucu; varyant fiyatları kuruş cinsinden).
 *
 * VARYANT SEÇİMİ (2026-11-03)
 * ---------------------------
 * Ölçülen sorun: porima3d.com'da "Porima PLA Filament" ürününün **36 varyantı** var
 * (18 renk × 1kg/3kg). Eski kod yalnızca `variants[0]` okuyordu; bu çoğu zaman
 * "Naturel 1kg" idi. Sonuç: kaynak ürün "Beyaz" iken aday "Naturel" sayılıyor,
 * renk uyuşmazlığı yüzünden doğru fiyat "en ucuz" listesine girmiyordu.
 * Ayrıca 3kg varyantı seçilirse gramaj koruması ürünü tamamen reddediyordu.
 *
 * Seçim sırası:
 *   1. URL'de `?variant=<id>` varsa → o varyant (kullanıcı zaten onu açmış).
 *   2. `opts.kaynak` (pipeline'ın kaynak ürünü) varsa → renk + net ağırlık
 *      eşleşmesine göre en iyi varyant. Uydurma yok: puan yalnızca gerçek
 *      eşleşmeden gelir; eşleşme yoksa stokta olan ilk varyant seçilir.
 *   3. Shopify'ın `selected_or_first_available_variant` alanı, yoksa stokta
 *      olan ilk varyant, yoksa ilk varyant.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, sameColor, magazaAdiMarkaMi, gercekMarkaBul } from '../util.js';
import { miktarCikar } from '../birimFiyat.js';

/** Marka adını başlığa yalnızca başlıkta geçmiyorsa ve mağaza kendi adını
 *  satıcı alanı olarak basmamışsa ekler ("Filamenthane eSUN PLA+" hatasını önler). */
function markaliBaslik(vendor, title, siteId = null, siteName = null) {
  const t = String(title || '').trim();
  const v = String(vendor || '').trim();
  if (!v) return t;
  if (siteId && magazaAdiMarkaMi(v, siteId, siteName)) {
    const gercek = gercekMarkaBul(v, t, siteId, siteName);
    if (!gercek || !magazaAdiMarkaMi(gercek, siteId, siteName)) return t;
  }
  const norm = (x) => x.toLocaleLowerCase('tr-TR');
  return norm(t).includes(norm(v)) ? t : (v + ' ' + t);
}

/**
 * HTML `<pre>` sarmalaması veya HTML entity kaçışı içeren yanıtları güvenle
 * JSON nesnesine çevirir (2026-11-09).
 *
 * NEDEN: ScraperAPI kredisi bittiğinde/doğrudan istek engellendiğinde devreye
 * giren yerel Chromium, `/products/x.js` ve `/search/suggest.json` gibi saf JSON
 * uçlarını kendi görüntüleyicisiyle `<pre>` içine sarıyor. `JSON.parse` `<`
 * görünce SyntaxError atıyor ve 3 mağazadan (porima3d, 3dteknomarket,
 * filamenthane) fiyat okunamıyordu.
 *
 * Sıra: ham metin → `<pre>` içi → entity çözümü. Hiçbiri tutmazsa ilk 120
 * karakteri hata mesajına koyar (teşhis için, sessiz yutma yok).
 *
 * @param {string} metin yanıt gövdesi
 * @param {string} hataMesaji fırlatılacak hatanın başlığı
 * @returns {any} ayrıştırılmış JSON
 */
export function guvenliJsonAyristir(metin, hataMesaji) {
  const ham = String(metin ?? '');
  const adaylar = [];
  const ekle = (x) => {
    const s = String(x ?? '').trim();
    if (s && !adaylar.includes(s)) adaylar.push(s);
  };

  ekle(ham);

  // <pre> sarmalaması: içeriği çıkar.
  const pre = ham.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) ekle(pre[1]);

  // Entity kaçışları (&quot;, &amp;, &lt;, &gt;) — yalnızca gerekirse.
  for (const aday of [...adaylar]) {
    if (aday.includes('&')) {
      ekle(aday
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&'));
    }
  }

  const nesneMi = (v) => v !== null && typeof v === 'object';

  // 1) Nesne/dizi döndüren ilk adayı kullan.
  let sonHata = null;
  let ilkBasari = null;
  for (const aday of adaylar) {
    try {
      const v = JSON.parse(aday);
      if (ilkBasari === null) ilkBasari = v;
      if (nesneMi(v)) return v;
    } catch (e) {
      sonHata = e;
    }
  }

  // 2) Çift kodlanmış JSON dizesi ("{\"id\":1}") → bir kez daha çöz.
  for (const aday of adaylar) {
    try {
      const birinci = JSON.parse(aday);
      if (typeof birinci === 'string') {
        const ikinci = JSON.parse(birinci);
        if (nesneMi(ikinci)) return ikinci;
      }
    } catch { /* sonraki aday */ }
  }

  // 3) Nesne değil ama geçerli JSON (sayı/true) → yine de döndür.
  if (ilkBasari !== null) return ilkBasari;

  const ornek = String(ham).replace(/\s+/g, ' ').trim().slice(0, 120) || '(boş yanıt)';
  const ayrinti = sonHata?.message ? ` — ${sonHata.message}` : '';
  throw new Error(`${hataMesaji} (Gelen veri: ${ornek}…)${ayrinti}`);
}

/** Varyant başlığından renk ve net ağırlığı (gram) çıkarır. */
function varyantBilgisi(v) {
  const baslik = String(v?.title || '');
  const m = miktarCikar(baslik);
  return {
    renk: dominantColor(baslik),
    gram: m.gram,
  };
}

/**
 * Kaynak ürünle en iyi eşleşen varyantı seçer.
 * @param {Array} variants Shopify varyantları
 * @param {object|null} kaynak pipeline kaynak ürünü ({title, color, modelCode, barcode})
 */
export function enIyiVaryant(variants, kaynak = null) {
  const liste = Array.isArray(variants) ? variants.filter(Boolean) : [];
  if (!liste.length) return null;
  if (!kaynak?.title) {
    // Kaynak yok: stokta olan ilk varyant, yoksa ilk varyant.
    return liste.find(v => v.available !== false) || liste[0];
  }

  const kaynakMiktar = miktarCikar(kaynak.title);
  const kaynakRenk = kaynak.color || dominantColor(kaynak.title || '');
  const kaynakSku = String(kaynak.modelCode || '').trim().toUpperCase();
  const kaynakBarkod = String(kaynak.barcode || '').trim();

  let enIyi = null;
  let enIyiPuan = -Infinity;
  for (const v of liste) {
    const vb = varyantBilgisi(v);
    let puan = 0;
    let kanit = false;

    // Barkod / SKU birebir → kesin kanıt, tartışmasız.
    if (kaynakBarkod && v.barcode && String(v.barcode).trim() === kaynakBarkod) {
      puan += 100; kanit = true;
    }
    if (kaynakSku && v.sku && String(v.sku).trim().toUpperCase() === kaynakSku) {
      puan += 100; kanit = true;
    }

    // Net ağırlık: iki tarafta da okunabiliyorsa belirleyici.
    if (kaynakMiktar.gram != null && vb.gram != null) {
      const oran = vb.gram / kaynakMiktar.gram;
      if (Math.abs(oran - 1) <= 0.02) { puan += 10; kanit = true; }
      else puan -= 20;                       // 3kg ↔ 1kg: kesin farklı paket
    }

    // Renk: yalnızca iki tarafta da okunabiliyorsa.
    if (kaynakRenk && vb.renk) {
      if (sameColor(kaynakRenk, vb.renk)) { puan += 8; kanit = true; }
      else puan -= 12;
    }

    // Stokta olan tercih edilir (ama kanıtın önüne geçmez).
    if (v.available !== false) puan += 1;

    if (puan > enIyiPuan) { enIyiPuan = puan; enIyi = { ...v, _kanit: kanit, _puan: puan }; }
  }

  // Hiçbir kanıt yoksa (renk/ağırlık okunamadı): stokta olan ilk varyant.
  if (!enIyi?._kanit) {
    return liste.find(v => v.available !== false) || liste[0];
  }
  return enIyi;
}

export function shopifySite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /^\/products\/[^/]+/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/search?q=' + encodeURIComponent(q);
    },

    async searchProducts(query, ctx) {
      const url = base + '/search/suggest.json?q=' + encodeURIComponent(query)
        + '&resources[type]=product&resources[limit]=10&resources[options][fields]=title,product_type,variants.title,tag';
      const r = await fetchPage(url, { site: this.id, purpose: 'arama' });
      ctx.spend += r.requestsSpent;
      const data = guvenliJsonAyristir(r.body, 'Shopify arama yanıtı JSON değil.');
      const urunler = data?.resources?.results?.products || [];
      return urunler.map(u => ({
        title: markaliBaslik(u.vendor, u.title, this.id, this.name),
        url: base + '/products/' + u.handle,
        price: u.price != null ? parseFloat(u.price) : null,
        brand: gercekMarkaBul(u.vendor, u.title, this.id, this.name),
      })).filter(u => u.title && u.url);
    },

    async getProduct(url, ctx, opts = {}) {
      const u = new URL(url);
      const handle = u.pathname.match(/\/products\/([^/?#]+)/)?.[1];
      if (!handle) throw new Error('Shopify ürün bağlantısı anlaşılamadı.');
      const r = await fetchPage(base + '/products/' + handle + '.js', { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const js = guvenliJsonAyristir(r.body, 'Shopify ürün yanıtı (.js ucu) JSON değil.');
      if (!js?.title) throw new Error('Shopify ürün verisi (.js ucu) alınamadı.');

      const variants = Array.isArray(js.variants) ? js.variants : [];

      // 1) URL'de açık varyant kimliği varsa o kullanılır.
      let v = null;
      let kaynakSecim = null;
      const vid = Number(u.searchParams.get('variant'));
      if (Number.isFinite(vid) && vid > 0) {
        v = variants.find(x => Number(x.id) === vid) || null;
        if (v) kaynakSecim = 'url';
      }
      // 2) Kaynak ürünle renk/ağırlık eşleşmesi.
      if (!v && opts.kaynak) {
        const aday = enIyiVaryant(variants, opts.kaynak);
        if (aday) { v = aday; kaynakSecim = aday._kanit ? 'kaynak-eşleşmesi' : 'stokta-ilk'; }
      }
      // 3) Stokta olan seçili / ilk stoklu varyant / yoksa ilk varyant.
      if (!v) {
        const secili = variants.find(x => x.id === js.selected_or_first_available_variant?.id);
        v = (secili && secili.available !== false ? secili : null)
          || variants.find(x => x.available !== false)
          || secili
          || variants[0]
          || {};
        kaynakSecim = 'varsayılan';
      }

      const price = v.price != null ? v.price / 100 : null;
      const compare = v.compare_at_price != null ? v.compare_at_price / 100 : null;
      const varyantAdi = String(v.title || '').trim();
      const tamBaslik = (markaliBaslik(js.vendor, js.title, this.id, this.name)
        + (varyantAdi && !/^default title$/i.test(varyantAdi) ? ' - ' + varyantAdi : '')).trim();

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: tamBaslik,
        brand: gercekMarkaBul(js.vendor, js.title, this.id, this.name),
        modelCode: v.sku || null,
        barcode: v.barcode || null,
        color: dominantColor(`${js.title} ${varyantAdi}`),
        listPrice: compare && price && compare > price ? compare : null,
        sellingPrice: price,
        currency: 'TRY',
        inStock: v.available !== false,
        seller: null,
        image: (js.images && js.images[0]) ? (typeof js.images[0] === 'string' ? js.images[0] : js.images[0]?.src || null) : null,
        campaigns: [],
        shipping: kargoCikar(r.body, this.id),
        // Teşhis/şeffaflık: hangi varyantın neden seçildiği.
        varyant: {
          id: v.id ?? null,
          title: varyantAdi || null,
          secim: kaynakSecim,
          toplam: variants.length,
        },
      };
    },
  };
}
