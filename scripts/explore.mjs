/**
 * Keşif betiği: verilen URL'yi ScraperAPI üzerinden çeker, data/explore/ altına kaydeder
 * ve sayfadaki olası veri işaretçilerini raporlar. Kredileri korumak için önbellek kullanır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { fetchPage } from '../src/scraper.js';

const url = process.argv[2];
const site = process.argv[3] || 'kesif';
if (!url) {
  console.error('Kullanim: node explore.mjs <url> <site>');
  process.exit(1);
}

const outDir = path.join(config.dataDir, 'explore');
fs.mkdirSync(outDir, { recursive: true });

console.log('Cekiliyor:', url);
const r = await fetchPage(url, { site, purpose: 'kesif' });
console.log('Durum:', r.status, '| istek:', r.requestsSpent, '| render:', r.renderUsed, '| boyut:', r.body.length);

const file = path.join(outDir, site + '.html');
fs.writeFileSync(file, r.body);
console.log('Kaydedildi:', file);

const markers = [
  '__SEARCH_APP_INITIAL_STATE__', '__PRODUCT_APP_INITIAL_STATE__', '__NEXT_DATA__',
  'application/ld+json', 'window.__INITIAL_STATE__', '__APOLLO_STATE__',
  'productDetail', 'data-product', 'itemprop', 'price', 'model', 'barkod', 'barcode', 'gtin', 'ean',
];
for (const m of markers) {
  const count = r.body.split(m).length - 1;
  if (count > 0) console.log('  isaretciler:', m, '->', count, 'kez');
}

// JSON-LD bloklarını özetle
const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = ldRe.exec(r.body))) {
  i++;
  console.log('JSON-LD blok', i, ':', m[1].replace(/\s+/g, ' ').slice(0, 600));
}
