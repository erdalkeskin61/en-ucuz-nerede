/** Önbellekteki Teknosa sayfasını incele (Crawlbase render'ı ayrıştırılabiliyor mu?). */
import fs from 'node:fs';
import crypto from 'node:crypto';

const key = crypto.createHash('sha256').update('GET https://www.teknosa.com/creality-hyper-pla-filament-gri-175-mm-1-kg-p-788922231').digest('hex').slice(0, 40);
const p = 'data/cache/' + key + '.json';
if (!fs.existsSync(p)) { console.log('cache yok'); process.exit(0); }
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const b = j.body;
console.log('boyut:', b.length, '| ts:', new Date(j.ts).toISOString(), '| renderUsed:', j.renderUsed);
console.log('title:', (b.match(/<title>([^<]{3,90})</i)?.[1] || 'YOK').trim().slice(0, 80));
console.log('JSON-LD Product:', /"@type"\s*:\s*"Product"/.test(b));
console.log('fiyat gecis:', (b.match(/\d[\d.,]*\s*(?:TL|₺)/g) || []).length);
const cfI = b.search(/Attention Required|Just a moment|challenge-platform/i);
console.log('CF isareti:', cfI >= 0 ? b.slice(Math.max(0, cfI - 40), cfI + 90).replace(/\s+/g, ' ') : 'yok');

// plt-teknosa.js ne arıyor? Önce onun ayrıştırıcısına bakalım
console.log('\n--- adaptörün aradığı desenler ---');
const kaynak = fs.readFileSync('src/sites/plt-teknosa.js', 'utf8');
const desenler = [...kaynak.matchAll(/\/(.+?)\/[gi]{0,2}/g)].map(m => m[1]).filter(s => s.length > 10 && s.length < 90).slice(0, 12);
for (const d of desenler) {
  let varMi = false;
  try { varMi = new RegExp(d).test(b); } catch {}
  console.log((varMi ? 'VAR  ' : 'YOK  ') + d.slice(0, 75));
}
