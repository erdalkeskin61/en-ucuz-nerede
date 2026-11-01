// Küçük mağazalar doğrudan (sağlayıcısız) açılıyor mu? Adaptör arama URL'leriyle tarama
import { adapters } from '../src/sites/index.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const B = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

const ATLAN = new Set(['trendyol', 'amazon', 'hepsiburada', 'n11', 'incehesap', 'ciceksepeti', 'teknosa', 'pttavm',
  'vatan', 'itopya', 'filamentdepom', '3dultra', 'robotizmo', '3dcim', 'filamentmarketim', 'teknikfilament3d', 'urhanshop']);

const sonuc = [];
for (const a of adapters) {
  if (ATLAN.has(a.id)) continue;
  const url = a.searchUrl('pla filament');
  try {
    const res = await fetch(url, { headers: B, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const metin = await res.text();
    const dolu = res.status === 200 && metin.length > 8000;
    sonuc.push(`${dolu ? 'OK  ' : 'HATA'} ${a.id.padEnd(15)} HTTP ${res.status}, ${(metin.length / 1024) | 0} KB`);
  } catch (e) {
    sonuc.push(`HATA ${a.id.padEnd(15)} ${String(e.message).slice(0, 50)}`);
  }
}
console.log(sonuc.join('\n'));
