// Amazon sayfasında JSON-LD Product ve "yenilenmiş" bağlamı
import { fetchPage } from '../src/scraper.js';
import { findJsonLdProduct } from '../src/util.js';

const url = 'https://www.amazon.com.tr/dp/B0FQVZFHCV';
const r = await fetchPage(url, { site: 'amazon', purpose: 'teshis', fresh: true });
const h = r.body;
const p = findJsonLdProduct(h);
console.log('JSON-LD Product:', p ? JSON.stringify({ name: p.name?.slice(0, 50), offers: p.offers }).slice(0, 400) : 'YOK');

const i = h.indexOf('Yenilenmiş');
if (i > 0) console.log('\n"Yenilenmiş" bağlamı:', h.slice(Math.max(0, i - 300), i + 200).replace(/\s+/g, ' ').slice(0, 480));

// buybox bölgesi
const bb = h.indexOf('apex-core-price-identifier');
console.log('\nbuybox bulundu mu:', bb > 0);
if (bb > 0) console.log('buybox fiyatı:', (h.slice(bb, bb + 2000).match(/a-offscreen">\s*([\d.,]+)\s*(?:TL|₺)/) || [])[1] || 'yok');
