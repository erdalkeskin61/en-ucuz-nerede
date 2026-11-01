/** n11 önbellek hazırlığı + adaptör testi. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = 'data/cache';
function hashKey(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 40); }
function onbellegeYaz(url, body) {
  fs.writeFileSync(path.join(CACHE_DIR, hashKey('GET ' + url) + '.json'), JSON.stringify({ url, status: 200, body, renderUsed: false, ts: Date.now() }));
  console.log('  +', url.slice(0, 90), '(' + body.length + ' bayt)');
}

console.log('=== n11 önbellek ===');
onbellegeYaz('http://www.n11.com/arama?q=' + encodeURIComponent('pla filament'), fs.readFileSync('data/explore/yeni/arama-n11.html', 'utf8'));
onbellegeYaz('http://www.n11.com/urun/elegoo-pla-filament-siyah-1kg-41403993', fs.readFileSync('data/explore/yeni/urun-n11.html', 'utf8'));

console.log('\n=== n11 adaptör testi ===');
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const { yeniSiteler } = await import('../src/sites/yeni.js');
const adapter = yeniSiteler.find(a => a.id === 'n11');

// urun URL tanima (https ile)
const u = new URL('https://www.n11.com/urun/elegoo-pla-filament-siyah-1kg-41403993');
console.log('isProductUrl(https urun):', adapter.isProductUrl(u));
console.log('isProductUrl(arama):', adapter.isProductUrl(new URL('https://www.n11.com/arama?q=x')));

const ctx = { spend: 0 };
const adaylar = await adapter.searchProducts('pla filament', ctx);
console.log('arama: ' + adaylar.length + ' aday | istek: ' + ctx.spend);
for (const a of adaylar.slice(0, 3)) console.log('  -', a.title.slice(0, 55), '|', a.price, 'TL |', a.brand || '?');

const pctx = { spend: 0 };
const p = await adapter.getProduct('https://www.n11.com/urun/elegoo-pla-filament-siyah-1kg-41403993', pctx);
console.log('urun:', p.title, '|', p.sellingPrice, p.currency, '| liste:', p.listPrice, '| stok:', p.inStock, '| kargo:', JSON.stringify(p.shipping), '| kampanya:', p.campaigns.length);
