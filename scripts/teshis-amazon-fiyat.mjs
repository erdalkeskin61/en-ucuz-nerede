// Amazon 12.499 TL: gerçek mi, yenilenmiş/ikinci el mi?
import { adapters } from '../src/sites/index.js';
import { fetchPage } from '../src/scraper.js';

const a = adapters.find(x => x.id === 'amazon');
const r = await a.searchProducts('Dyson V15 Detect Absolute', { spend: 0 });
const aday = r.find(x => /V15/i.test(x.title) && /absolute/i.test(x.title) && !/uyumlu|icin|filtre/i.test(x.title));
if (!aday) { console.log('aday yok'); process.exit(0); }
console.log('aday:', aday.title.slice(0, 75));
console.log('url :', aday.url);

const p = await a.getProduct(aday.url, { spend: 0 }, { fresh: true });
console.log('fiyat:', p.sellingPrice, '| liste:', p.listPrice, '| satici:', p.seller, '| stok:', p.inStock);

const sayfa = await fetchPage(aday.url, { site: 'amazon', purpose: 'teshis', fresh: true });
const h = sayfa.body;
for (const kelime of ['Yenilenmiş', 'yenilenmiş', 'Renewed', '2. El', 'İkinci El', 'Amazon Warehouse']) {
  if (h.includes(kelime)) console.log('İŞARET:', kelime);
}
const izler = [...h.matchAll(/(?:a-price-whole">|"priceAmount":)([\d.,]+)/g)].slice(0, 6).map(m => m[1]);
console.log('sayfadaki fiyat izleri:', izler.join(', ') || 'yok');
const t = h.match(/<title[^>]*>([^<]*)<\/title>/i);
console.log('sayfa başlığı:', (t?.[1] || '').slice(0, 90));
