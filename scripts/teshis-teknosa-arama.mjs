/** Teknosa ARAMA sayfası Crawlbase render'ında kart yapısı nedir? (1 istek) */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();

const hedef = 'https://www.teknosa.com/arama?q=' + encodeURIComponent('pla filament');
const res = await fetch('https://api.crawlbase.com/?' + new URLSearchParams({ token: cb, url: hedef, javascript: 'true' }), { signal: AbortSignal.timeout(120000) });
const buf = await res.arrayBuffer();
let text;
try { text = (await import('node:zlib')).gunzipSync(Buffer.from(buf)).toString(); } catch { text = new TextDecoder().decode(buf); }
console.log('durum:', res.status, '| cb:', res.headers.get('cb_status'), '| boyut:', text.length);
console.log('product-item div:', (text.match(/id="product-item"/g) || []).length);
console.log('pdp-view-item-data:', (text.match(/pdp-view-item-data/g) || []).length);
console.log('data-product-id:', (text.match(/data-product-id=/g) || []).length);
console.log('JSON-LD ItemList:', /"@type"\s*:\s*"ItemList"/.test(text));
console.log('fiyat gecis:', (text.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length);
const i = text.indexOf('data-product-id');
if (i >= 0) console.log('\nilk kart baglami:\n', text.slice(Math.max(0, i - 300), i + 300).replace(/\s+/g, ' ').slice(0, 550));
