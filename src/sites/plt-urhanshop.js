/**
 * urhanshop.com — özel ASP.NET platformu (odyabilisim).
 *
 * Arama, ASP.NET postback ile çalışır ve oturum çerezi gerektirir (3 adım):
 *   1) GET /  → __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION + oturum çerezi
 *   2) POST / → __EVENTTARGET=ctl00$imgAraO + ctl00$arama3=<sorgu> (302 döner)
 *   3) GET /aramasonuc.aspx (çerezle) → sonuç sayfası
 * Tüm adımlar aynı ScraperAPI oturumu ve sabit User-Agent ile atılır (arama başına 3 istek).
 *
 * Sonuç kartları: <a href="{slug}-u{id}"> içinde
 *   <span class="lblUrunBaslik">BAŞLIK</span> ve <span class="lblFiyat">487,11</span>.
 * Ürün sayfası: og:title + product:price:amount meta etiketleri; havale fiyatı
 * (orta_lblHavale*) koşullu kampanya olarak eklenir.
 */
import { fetchPage } from '../scraper.js';
import { kargoCikar } from '../kargo.js';
import { dominantColor, decodeEntities, parseNum, absUrl } from '../util.js';

const SABIT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function urhanshopSite(cfg) {
  const { id, name, hosts, base } = cfg;
  return {
    id,
    name,
    hosts,

    isProductUrl(url) {
      return /-u\d+$/.test(url.pathname);
    },

    searchUrl(q) {
      return base + '/aramasonuc.aspx (' + q + ')';
    },

    async searchProducts(query, ctx) {
      const oturum = 'uh' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cerezler = new Set();

      // 1) Ana sayfa: VIEWSTATE + çerez
      const r0 = await fetchPage(base + '/', { site: this.id, purpose: 'token', session: oturum, fresh: true, headers: { 'User-Agent': SABIT_UA } });
      ctx.spend += r0.requestsSpent;
      for (const c of r0.cookies) cerezler.add(c.split(';')[0]);
      const vs = r0.body.match(/name="__VIEWSTATE"[^>]*value="([^"]*)"/i)?.[1] || '';
      const vsg = r0.body.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/i)?.[1] || '';
      const ev = r0.body.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/i)?.[1] || '';
      if (!vs) throw new Error('Urhanshop arama formu (VIEWSTATE) okunamadı.');

      const cerez = [...cerezler].join('; ');

      // 2) Postback (302 beklenir; oturuma sorgu yazılır — YAN ETKİLİDİR, bu yüzden
      //    asla önbellekten dönmez: önbellek isabetinde sorgu oturuma yazılmaz ve
      //    sonuç sayfası boş/yönlenmiş döner)
      const params = new URLSearchParams({ __VIEWSTATE: vs, __EVENTTARGET: 'ctl00$imgAraO', __EVENTARGUMENT: '', 'ctl00$arama3': query });
      if (vsg) params.set('__VIEWSTATEGENERATOR', vsg);
      if (ev) params.set('__EVENTVALIDATION', ev);
      const rp = await fetchPage(base + '/', {
        site: this.id, purpose: 'postback', method: 'POST', session: oturum, fresh: true,
        headers: {
          'User-Agent': SABIT_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': base + '/',
          ...(cerez ? { Cookie: cerez } : {}),
        },
        body: params.toString(),
      });
      ctx.spend += rp.requestsSpent;
      for (const c of rp.cookies) cerezler.add(c.split(';')[0]);
      const tumCerez = [...cerezler].join('; ');

      // 3) Sonuç sayfası (oturum durumuna bağlıdır — URL anahtarıyla önbelleklenmez,
      //    yoksa önceki sorgunun sayfası dönebilir)
      const rg = await fetchPage(base + '/aramasonuc.aspx', {
        site: this.id, purpose: 'arama', session: oturum, fresh: true,
        headers: { 'User-Agent': SABIT_UA, ...(tumCerez ? { Cookie: tumCerez } : {}) },
      });
      ctx.spend += rg.requestsSpent;
      const html = rg.body;

      // Kartlar: <a href="{slug}-u{id}"> ... lblUrunBaslik ... lblFiyat ... </a>
      const gorulen = new Map();
      const re = /<a[^>]*href="([^"]*-u\d+)"[^>]*>([\s\S]{50,4000}?)<\/a>/gi;
      let m;
      while ((m = re.exec(html))) {
        const ic = m[2];
        const baslikM = ic.match(/class="lblUrunBaslik"[^>]*>([^<]{5,200})</i);
        if (!baslikM) continue;
        const fiyatM = ic.match(/class="lblFiyat"[^>]*>\s*([\d.,]+)/i);
        const href = m[1].startsWith('/') ? m[1] : '/' + m[1];
        const url = absUrl(base, href);
        gorulen.set(url, {
          title: decodeEntities(baslikM[1]).trim(),
          url,
          price: fiyatM ? parseNum(fiyatM[1]) : null,
        });
      }
      return [...gorulen.values()].slice(0, 30);
    },

    async getProduct(url, ctx, opts = {}) {
      const r = await fetchPage(url, { site: this.id, purpose: 'urun', fresh: !!opts.fresh });
      ctx.spend += r.requestsSpent;
      const html = r.body;

      const title = html.match(/property="og:title" content="([^"]{5,200})"/i)?.[1]
        || html.match(/<title>([^<]{5,200})<\/title>/i)?.[1];
      const price = parseNum(html.match(/property="product:price:amount" content="([\d.,]+)"/i)?.[1]);
      if (!title || price == null || price <= 0) throw new Error('Urhanshop ürün verisi (og:title / product:price) sayfada bulunamadı.');

      // Havale fiyatı (gizli etiketlerde) koşullu kampanyadır
      const kampanyalar = [];
      const havale = parseNum(html.match(/id="orta_lblHavaleGoster"[^>]*>\s*₺?\s*([\d.,]+)/i)?.[1]
        || html.match(/lblHavale[^>]*>\s*₺?\s*([\d.,]+)\s*TL/i)?.[1]);
      if (havale && havale < price) {
        kampanyalar.push('Havale/EFT ile ' + havale.toLocaleString('tr-TR') + ' TL (yalnızca havale ödemesinde)');
      }
      const eski = parseNum(html.match(/class="lblEskiFiyat"[^>]*>\s*₺?\s*([\d.,]+)/i)?.[1]);
      const stokYok = /tükendi|stokta yok/i.test(html);

      // Marka: sayfa "product:brand" meta etiketini yayımlıyor (2026-10-25). Önceden
      // og:title'ın ilk parçası marka sanılıyordu → "Esun Pla-Basic Filament 1.75 mm
      // 1 kg -" gibi anlamsız bir değer dönüyor ve eşleştirmeyi bozuyordu.
      const markaM = html.match(/property="product:brand"\s+content="([^"]{2,50})"/i)
        || html.match(/Resimler\/Markalar\/([a-z0-9_-]{2,40})\.(?:jpg|png|webp|jpeg)/i);

      return {
        site: this.id,
        siteName: this.name,
        url,
        title: decodeEntities(title).trim(),
        brand: markaM ? decodeEntities(markaM[1]).replace(/[-_]/g, ' ').trim() : null,
        modelCode: null,
        barcode: null,
        color: dominantColor(title),
        listPrice: eski && eski > price ? eski : null,
        sellingPrice: price,
        currency: 'TRY',
        inStock: !stokYok,
        seller: null,
        image: (html.match(/property="og:image" content="([^"]+)"/i)?.[1]) || null,
        campaigns: kampanyalar,
        shipping: kargoCikar(r.body, this.id),
      };
    },
  };
}
