// Keşif: sitelerin kampanya/kupon sayfalarında gerçek kupon kodu var mı?
import { tarayiciIleCek } from '../src/tarayici.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const B = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

const ADRESLER = [
  ['trendyol', 'https://www.trendyol.com/kampanyalar'],
  ['hepsiburada', 'https://www.hepsiburada.com/kampanyalar'],
  ['n11', 'http://www.n11.com/kampanyalar'],
  ['amazon', 'https://www.amazon.com.tr/coupons'],
  ['incehesap', 'https://www.incehesap.com/kampanyalar/'],
  ['teknosa', 'https://www.teknosa.com/kampanyalar'],
  ['vatan', 'https://www.vatanbilgisayar.com/kampanyalar/'],
  ['ciceksepeti', 'https://www.ciceksepeti.com/kampanyalar'],
  ['mediamarkt', 'https://www.mediamarkt.com.tr/tr/campaigns'],
  ['itopya', 'https://www.itopya.com/kampanyalar'],
  ['pazarama', 'https://www.pazarama.com/kampanyalar'],
  ['koctas', 'https://www.koctas.com.tr/kampanyalar'],
];

/** Sayfa metninde kupon göstergelerini sayar. */
function kuponAnaliz(html) {
  const metin = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const kucuk = metin.toLocaleLowerCase('tr-TR');
  const kuponGecis = (kucuk.match(/kupon/g) || []).length;
  const kodGecis = (kucuk.match(/indirim kodu|kupon kodu|promosyon kodu/g) || []).length;
  // Kod adayları: kupon/kod yakınında BÜYÜK harfli 4-15 karakter
  const kodlar = new Set();
  const re = /(?:kupon\s*kodu|indirim\s*kodu|promosyon\s*kodu|kupon)\s*[:\-]?\s*["'«]?([A-Z0-9]{4,15})["'»]?/gi;
  let m;
  while ((m = re.exec(metin))) {
    const k = m[1];
    if (/\d/.test(k) || k.length >= 5) kodlar.add(k);
  }
  return { uzunluk: html.length, kuponGecis, kodGecis, kodlar: [...kodlar].slice(0, 8) };
}

for (const [site, url] of ADRESLER) {
  let r = null;
  try {
    const res = await fetch(url, { headers: B, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    if (res.status === 200 && html.length > 5000) r = { status: 200, body: html };
    else r = { networkError: 'HTTP ' + res.status };
  } catch (e) {
    r = { networkError: String(e.message).slice(0, 40) };
  }
  let kaynak = 'dogrudan';
  if (!r.body) {
    r = await tarayiciIleCek(url, { timeoutMs: 35000 });
    kaynak = 'tarayici';
  }
  if (!r.body) { console.log(`HATA ${site.padEnd(13)} ${r.networkError || 'bos'}`); continue; }
  const a = kuponAnaliz(r.body);
  console.log(`${a.kodlar.length ? 'OK  ' : '——  '} ${site.padEnd(13)} [${kaynak}] ${(a.uzunluk / 1024) | 0} KB, "kupon"×${a.kuponGecis}, "indirim kodu"×${a.kodGecis}, kodlar: ${a.kodlar.join(', ') || '-'}`);
}
