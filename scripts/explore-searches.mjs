/**
 * 6 sitenin arama sayfasını paralel çeker ve data/explore/ altına kaydeder.
 * Kullanım: node scripts/explore-searches.mjs "<sorgu>"
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { fetchPage } from '../src/scraper.js';

const query = process.argv[2] || 'Rampage X-Ranger';
const outDir = path.join(config.dataDir, 'explore');
fs.mkdirSync(outDir, { recursive: true });

const sites = [
  { id: 'hepsiburada', url: 'https://www.hepsiburada.com/ara?q=' + encodeURIComponent(query) },
  { id: 'amazon', url: 'https://www.amazon.com.tr/s?k=' + encodeURIComponent(query) },
  { id: 'vatan', url: 'https://www.vatanbilgisayar.com/arama/' + encodeURIComponent(query) + '/' },
  { id: 'mediamarkt', url: 'https://www.mediamarkt.com.tr/tr/search.html?query=' + encodeURIComponent(query) },
  { id: 'itopya', url: 'https://www.itopya.com/ara?bul=' + encodeURIComponent(query) },
  { id: 'pazarama', url: 'https://www.pazarama.com/arama?q=' + encodeURIComponent(query) },
];

console.log('Sorgu:', query);
const results = await Promise.allSettled(sites.map(async (s) => {
  const r = await fetchPage(s.url, { site: s.id, purpose: 'arama' });
  fs.writeFileSync(path.join(outDir, 'search-' + s.id + '.html'), r.body);
  return { id: s.id, status: r.status, requests: r.requestsSpent, render: r.renderUsed, size: r.body.length, fromCache: r.fromCache };
}));

for (const res of results) {
  if (res.status === 'fulfilled') {
    const r = res.value;
    console.log(`OK  ${r.id.padEnd(14)} durum=${r.status} istek=${r.requests} render=${r.render} boyut=${r.size} ${r.fromCache ? '(önbellek)' : ''}`);
  } else {
    console.log('HATA', res.reason?.message?.slice(0, 160));
  }
}
