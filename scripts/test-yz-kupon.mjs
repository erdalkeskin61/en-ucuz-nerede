// YZ kupon sınıflandırma canlı testi
import { classifyCampaigns } from '../src/ai.js';
const r = await classifyCampaigns({
  site: 'Test Mağaza',
  urunBasligi: 'Örnek Ürün X',
  fiyatlar: { etiket: 1200, satis: 1050 },
  kampanyalar: [
    'KUPON: YAZ20 ile sepette %10 indirim',
    'Sepette TEKNO50 kuponu ile 50 TL indirim',
    'Üyelere özel %5 indirim',
    'X Bank kartına 100 TL indirim',
    'Sepette %5 indirim',
  ],
});
for (const k of r) {
  console.log(JSON.stringify({ tur: k.tur, kosul: k.kosul, kodu: k.kodu ?? null, indirim: k.indirim, metin: (k.metin || '').slice(0, 45) }));
}
