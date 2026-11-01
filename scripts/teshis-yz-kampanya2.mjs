// Mediamarkt gerçek cümleleriyle YZ ham yanıtını yakala
import { config } from '../src/config.js';
import { fetchPage } from '../src/scraper.js';

function firsatCumleleri(html) {
  const metin = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const cumleler = metin.split(/(?<=[.!?·|])\s+/).map(s => s.trim());
  const secili = []; const gorulen = new Set();
  for (const s of cumleler) {
    if (s.length < 15 || s.length > 180) continue;
    const ilgili = /kupon/i.test(s) || /(sepette|sepetinizde|sepet tutarı|ve üzeri|üzeri)/i.test(s) || /(indirim kodu|promosyon kodu|kod:)/i.test(s);
    if (!ilgili) continue;
    if (!/(indirim|%|tl|bedava|ücretsiz|hediye|puan)/i.test(s)) continue;
    const a = s.toLowerCase().slice(0, 70);
    if (gorulen.has(a)) continue;
    gorulen.add(a); secili.push(s);
    if (secili.length >= 18) break;
  }
  return secili;
}

const r = await fetchPage('https://www.mediamarkt.com.tr/tr', { site: 'mediamarkt', purpose: 'kupon', fresh: true });
const cs = firsatCumleleri(r.body);
console.log('cümle sayısı:', cs.length);
for (const c of cs.slice(0, 8)) console.log(' ·', c.slice(0, 100));

const grup = cs.slice(0, 6);
const res = await fetch(config.ai.baseURL + '/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.apiKey },
  body: JSON.stringify({
    model: config.ai.model, temperature: 0, max_tokens: 1500,
    messages: [
      { role: 'system', content: 'Sen bir Türkçe e-ticaret kampanya çözümleyicisin. Cümlelerden gerçek fırsatları JSON DİZİSİ olarak çıkar. Her öğe: {"metin","kapsam":"site"|"kategori"|"uyelik"|"uygulama"|"kart"|"belirsiz","kategori","minSepet","indirim":{"tip":"yuzde"|"tutar","deger"},"kodu","bitis","guven"}. Kargo cümlelerini üretme. Kod yoksa null. Sadece JSON dizisi döndür. Uygun fırsat yoksa [].' },
      { role: 'user', content: 'Site: MediaMarkt\nCümleler:\n' + JSON.stringify(grup, null, 2) },
    ],
  }),
  signal: AbortSignal.timeout(120000),
});
const j = await res.json();
const raw = j.choices?.[0]?.message?.content || '';
console.log('\n--- ham yanıt ---');
console.log(JSON.stringify(raw.slice(0, 900)));
console.log('finish_reason:', j.choices?.[0]?.finish_reason, '| uzunluk:', raw.length);
