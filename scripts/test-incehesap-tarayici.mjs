// İncehesap doğru URL ile tarayiciIleCek + adaptör araması uçtan uca
import { tarayiciIleCek } from '../src/tarayici.js';
import { adapters } from '../src/sites/index.js';

// 1) Doğru URL ile modül testi
const r = await tarayiciIleCek('https://www.incehesap.com/q/ekran+karti');
console.log(`modul: HTTP ${r.status}, ${(r.body?.length || 0) / 1024 | 0} KB${r.networkError ? ' — ' + r.networkError : ''}`);

// 2) Adaptör araması (renderRetry akışı → tarayıcı)
const a = adapters.find(x => x.id === 'incehesap');
const ctx = { spend: 0 };
const t0 = Date.now();
try {
  const sonuc = await a.searchProducts('ekran karti', ctx);
  console.log(`adaptor: ${sonuc.length} sonuc, ${Date.now() - t0} ms, ${ctx.spend} istek`);
  for (const u of sonuc.slice(0, 3)) console.log('   -', (u.title || '').slice(0, 55), u.price ?? '');
} catch (e) {
  console.log('adaptor HATA: ' + e.message);
}
