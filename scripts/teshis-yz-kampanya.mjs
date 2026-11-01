// YZ site kampanya çözümlemesi: ham yanıtı incele
import { config } from '../src/config.js';

const cumleler = [
  'Tüm alışverişlerinizde geçerli sepette %10 indirim',
  'Kupon Fırsatı Son 10 Günün En Düşük Fiyatı',
  '1.000 TL ve üzeri tüm alışverişlerinizde kargo ücreti bizden.',
  'Uygulamaya özel 500 TL üzeri 50 TL indirim, kupon kodu: APP50',
];

const res = await fetch(config.ai.baseURL + '/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.apiKey },
  body: JSON.stringify({
    model: config.ai.model,
    temperature: 0,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: `Sen bir Türkçe e-ticaret kampanya çözümleyicisin. Cümlelerden gerçek fırsatları JSON DİZİSİ olarak çıkar.
Her öğe: {"metin","kapsam":"site"|"kategori"|"uyelik"|"uygulama"|"kart"|"belirsiz","kategori","minSepet","indirim":{"tip":"yuzde"|"tutar","deger"},"kodu","bitis","guven":"yuksek"|"orta"|"dusuk"}
Kargo cümlelerini üretme. Kod yoksa null. Sadece JSON dizisi döndür.` },
      { role: 'user', content: 'Cümleler:\n' + JSON.stringify(cumleler, null, 2) },
    ],
  }),
  signal: AbortSignal.timeout(120000),
});
console.log('HTTP', res.status);
const j = await res.json();
const raw = j.choices?.[0]?.message?.content || '';
console.log('--- ham yanıt (ilk 1200) ---');
console.log(raw.slice(0, 1200));
console.log('--- bitiş sebebi:', j.choices?.[0]?.finish_reason);
