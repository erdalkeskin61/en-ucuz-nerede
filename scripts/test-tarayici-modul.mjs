// tarayici.js modül testi: tarayiciIleCek gerçek URL'lerle
import { tarayiciIleCek, tarayiciDurumu } from '../src/tarayici.js';

const TESTLER = [
  ['Trendyol arama', 'https://www.trendyol.com/sr?q=rampage%20x-ranger'],
  ['n11 arama      ', 'http://www.n11.com/arama?q=pla'],
  ['İncehesap arama', 'https://www.incehesap.com/arama?query=ekran%20karti'],
  // Not: Hepsiburada 2026-10-25'te doğrudan HTTP kata taşındı (tarayıcıda güvenlik
  // duvarı var); tarayıcı testine artık dahil değildir — bkz. scripts/test-dogrudan.mjs
];
for (const [ad, url] of TESTLER) {
  const t0 = Date.now();
  const r = await tarayiciIleCek(url);
  const isaret = r.body ? (r.body.includes('p-card') || r.body.includes('ItemList') || r.body.includes('product') ? 'içerik var' : 'içerik belirsiz') : '-';
  console.log(`${r.status === 200 ? 'OK  ' : 'HATA'} ${ad}: ${(Date.now() - t0) / 1000 | 0} sn, ${(r.body?.length || 0) / 1024 | 0} KB, ${isaret}${r.networkError ? ' — ' + r.networkError : ''}`);
}
console.log('durum:', JSON.stringify(tarayiciDurumu()));
