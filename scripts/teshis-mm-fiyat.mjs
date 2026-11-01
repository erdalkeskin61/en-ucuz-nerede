// MediaMarkt 6.999 TL gerçek mi? Sayfadaki fiyat bağlamını incele
import { fetchPage } from '../src/scraper.js';

const url = 'https://www.mediamarkt.com.tr/tr/product/_dyson-v15-detect-absolute-kablosuz-sarjli-dikey-supurge-1254975.html';
const r = await fetchPage(url, { site: 'mediamarkt', purpose: 'urun', fresh: true });
const html = r.body;
console.log('uzunluk:', (html.length / 1024) | 0, 'KB');

// JSON-LD fiyat
const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
for (const m of ld) {
  try {
    const j = JSON.parse(m[1]);
    const bul = (o) => {
      if (!o || typeof o !== 'object') return null;
      if (o['@type'] === 'Product') return o;
      for (const v of Object.values(o)) { const x = bul(v); if (x) return x; }
      if (Array.isArray(o)) for (const v of o) { const x = bul(v); if (x) return x; }
      return null;
    };
    const p = bul(j) || (Array.isArray(j) ? j.find(x => x['@type'] === 'Product') : null);
    if (p) console.log('JSON-LD:', p.name?.slice(0, 60), '| offers:', JSON.stringify(p.offers)?.slice(0, 200));
  } catch { /* bozuk blok */ }
}

// "yenilenmiş" / teşhir / outlet işaretleri
for (const kelime of ['yenilenmiş', 'Yenilenmiş', 'teşhir', 'outlet', '2. el', 'ikinci el']) {
  if (html.includes(kelime)) console.log('İŞARET:', kelime, 'sayfada var');
}

// dataLayer / price alanları
for (const m of html.matchAll(/"(?:price|unitPrice|sellingPrice|discountedPrice)"\s*:\s*"?([\d.,]+)"?/g)) {
  console.log('fiyat alanı:', m[0].slice(0, 60));
}
if (html.length > 0) {
  const i = html.search(/(?:^|[>"\s])(6[.,]?999|6999)(?:[<"\s]|$)/);
  if (i > 0) console.log('\n6999 bağlamı:', html.slice(Math.max(0, i - 200), i + 120).replace(/\s+/g, ' ').slice(0, 320));
}
