// Keşif 2: kupon/fırsat sayfaları ve ana sayfa banner'ları
import { tarayiciIleCek } from '../src/tarayici.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const B = { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', 'Accept-Encoding': 'gzip, deflate, br' };

const ADRESLER = [
  ['n11 /kuponlar', 'http://www.n11.com/kuponlar'],
  ['n11 /firsatlar', 'http://www.n11.com/firsatlar'],
  ['trendyol /kuponlar', 'https://www.trendyol.com/kuponlar'],
  ['trendyol ana', 'https://www.trendyol.com/'],
  ['hb /kuponlar', 'https://www.hepsiburada.com/kuponlar'],
  ['hb ana', 'https://www.hepsiburada.com/'],
  ['cs /kuponlar', 'https://www.ciceksepeti.com/kuponlar'],
  ['pazarama /kuponlar', 'https://www.pazarama.com/kuponlar'],
  ['koctas /kuponlar', 'https://www.koctas.com.tr/kuponlar'],
  ['mediamarkt ana', 'https://www.mediamarkt.com.tr/tr'],
  ['itopya ana', 'https://www.itopya.com/'],
  ['incehesap ana', 'https://www.incehesap.com/'],
];

/** İndirim/kupon cümlelerini çıkarır (kupon kodu şart değil — site geneli fırsatlar da değerli). */
function firsatlar(html) {
  const metin = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const cumleler = metin.split(/(?<=[.!?·|])\s+|\n/).map(s => s.trim()).filter(s => s.length > 12 && s.length < 160);
  const ilgili = cumleler.filter(s =>
    /kupon/i.test(s) ||
    (/(sepette|sepetinizde|sepet tutarı|üzeri)/i.test(s) && /(indirim|tl|%|bedava)/i.test(s)));
  // kupon kodu adayları: hem önce hem sonra gelen kalıplar
  const kodlar = new Set();
  for (const s of cumleler) {
    for (const m of s.matchAll(/\b([A-Z0-9]{5,14})\b/g)) {
      const k = m[1];
      if (!/\d/.test(k)) continue;              // en az bir rakam
      if (!/[A-Z]/.test(k)) continue;           // en az bir büyük harf
      const onceki = s.slice(Math.max(0, m.index - 40), m.index).toLocaleLowerCase('tr-TR');
      const sonraki = s.slice(m.index + k.length, m.index + k.length + 40).toLocaleLowerCase('tr-TR');
      if (/kupon|kodu|kod\b|promosyon/.test(onceki) || /kupon|kodu/.test(sonraki)) kodlar.add(k);
    }
  }
  return { toplamCumle: cumleler.length, ilgili: [...new Set(ilgili)].slice(0, 6), kodlar: [...kodlar].slice(0, 8) };
}

for (const [ad, url] of ADRESLER) {
  let r = null;
  let kaynak = 'dogrudan';
  try {
    const res = await fetch(url, { headers: B, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    if (res.status === 200 && html.length > 5000) r = { status: 200, body: html };
  } catch { /* tarayıcıya düşecek */ }
  if (!r) { r = await tarayiciIleCek(url, { timeoutMs: 35000 }); kaynak = 'tarayici'; }
  if (!r.body) { console.log(`HATA ${ad}: ${r.networkError || 'bos'}`); continue; }
  const f = firsatlar(r.body);
  console.log(`\n=== ${ad} [${kaynak}] ${(r.body.length / 1024) | 0} KB — ilgili cümle: ${f.ilgili.length}, kod: ${f.kodlar.join(', ') || '-'}`);
  for (const c of f.ilgili.slice(0, 4)) console.log('   ·', c.slice(0, 120));
}
