/**
 * Son eksik yapilar: Trendyol arama sayfasi + Vatan/Itopya urun sayfalari.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { fetchPage } from '../src/scraper.js';

const outDir = path.join(config.dataDir, 'explore');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { id: 'trendyol-arama', url: 'https://www.trendyol.com/sr?q=rampage%20x-ranger', file: 'search-trendyol.html', site: 'trendyol', purpose: 'arama' },
  { id: 'vatan-urun', url: 'https://www.vatanbilgisayar.com/rampage-retsu-kablosuz-oyuncu-kulakligi.html', file: 'urun-vatan.html', site: 'vatan', purpose: 'urun' },
  { id: 'itopya-urun', url: 'https://www.itopya.com/rampage-v900-s-ps3ps4pcxboxonexbox360-switch-6-pedalli-gaming-oyuncu-direksiyonu_u34304', file: 'urun-itopya.html', site: 'itopya', purpose: 'urun' },
];

const results = await Promise.allSettled(targets.map(async (t) => {
  const r = await fetchPage(t.url, { site: t.site, purpose: t.purpose });
  fs.writeFileSync(path.join(outDir, t.file), r.body);
  return { id: t.id, status: r.status, requests: r.requestsSpent, render: r.renderUsed, size: r.body.length };
}));

for (const res of results) {
  if (res.status === 'fulfilled') {
    const r = res.value;
    console.log(`OK  ${r.id.padEnd(16)} durum=${r.status} istek=${r.requests} render=${r.render} boyut=${r.size}`);
  } else {
    console.log('HATA', (res.reason?.message || '').slice(0, 200));
  }
}
