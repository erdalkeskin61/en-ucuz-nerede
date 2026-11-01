/**
 * Kargo bedava tamamlayıcı motoru testi (ağa çıkmaz).
 *   node scripts/test-tamamlayici.mjs
 *
 * Kullanıcının örneği: eşik 500 TL, ürün 470 TL, kargo 50 TL.
 * 35 TL'lik pil eklenirse kargo bedava → 15 TL kâr.
 */
import { kargoAcigi, tamamlayiciBul, tamamlayiciMetni, onbellegiTemizle } from '../src/kargoTamamlayici.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

/* ---------------- 1) Açık hesabı ---------------- */
const a1 = kargoAcigi({ sepetToplam: 470, kargo: { fee: 50, freeOver: 500 } });
kontrol('470/500 → açık var', a1.var === true);
kontrol('eksik 30 TL', a1.eksik === 30, String(a1.eksik));
kontrol('kargo ücreti 50 TL', a1.kargoUcreti === 50, String(a1.kargoUcreti));

const a2 = kargoAcigi({ sepetToplam: 500, kargo: { fee: 50, freeOver: 500 } });
kontrol('tam eşik → açık yok ("ve üzeri")', a2.var === false, a2.neden);

const a3 = kargoAcigi({ sepetToplam: 500, kargo: { fee: 50, freeOver: 500, freeOverExclusive: true } });
kontrol('exclusive tam eşik → açık var', a3.var === true);
kontrol('exclusive eksik 0,01', a3.eksik === 0.01, String(a3.eksik));

const a4 = kargoAcigi({ sepetToplam: 470, kargo: { applies: false, fee: 50, freeOver: 500 } });
kontrol('kargo zaten ücretsiz → açık yok', a4.var === false);

const a5 = kargoAcigi({ sepetToplam: 470, kargo: { fee: null, freeOver: 500 } });
kontrol('kargo ücreti bilinmiyor → açık yok', a5.var === false);

const a6 = kargoAcigi({ sepetToplam: 470, kargo: { fee: 50, freeOver: null } });
kontrol('eşik yok → açık yok', a6.var === false);

/* ---------------- 2) Öneri bulma (sahte adaptör) ---------------- */
const sahteAdaptor = {
  id: 'sahte',
  name: 'Sahte Market',
  async searchProducts(kw) {
    const katalog = {
      'pil': [
        { title: "4'lü Duracell AA Pil", url: 'https://x/pil-35', price: 35 },
        { title: 'Çok pahalı pil seti', url: 'https://x/pil-80', price: 80 },
      ],
      'kalem': [
        { title: 'Tükenmez kalem', url: 'https://x/kalem-20', price: 20 },
      ],
      'etiket': [
        { title: 'Etiket 100 adet', url: 'https://x/etiket-45', price: 45 },
        { title: 'Fiyatsız ürün', url: 'https://x/fiyatsiz', price: null },
      ],
    };
    return katalog[kw] || [];
  },
};

onbellegiTemizle();
const bul = await tamamlayiciBul('sahte', {
  sepetToplam: 470,
  kargo: { fee: 50, freeOver: 500 },
  adapter: sahteAdaptor,
  anahtarlar: ['pil', 'kalem', 'etiket'],
});

kontrol('açık bilgisi doğru', bul.var === true && bul.eksik === 30);
kontrol('öneri üretildi', bul.oneriler.length > 0, String(bul.oneriler.length));
kontrol('eşiğin altındaki (20 TL) ürün önerilmedi',
  !bul.oneriler.some(o => o.fiyat === 20));
kontrol('kargodan pahalı (80 TL) ürün önerilmedi',
  !bul.oneriler.some(o => o.fiyat === 80));
kontrol('fiyatı olmayan ürün önerilmedi',
  !bul.oneriler.some(o => o.url === 'https://x/fiyatsiz'));
kontrol('en kârlı öneri ilk sırada (35 TL pil)',
  bul.oneriler[0]?.fiyat === 35, JSON.stringify(bul.oneriler[0]));
kontrol('pil kazancı 15 TL', bul.oneriler[0]?.kazanc === 15, String(bul.oneriler[0]?.kazanc));
kontrol('etiket (45 TL) kazancı 5 TL',
  bul.oneriler.find(o => o.fiyat === 45)?.kazanc === 5);

/* ---------------- 3) Öneri metni ---------------- */
const metin = tamamlayiciMetni(bul, bul.oneriler[0]);
kontrol('metin kargo ücretini içeriyor', /50,00 TL kargo/.test(metin), metin);
kontrol('metin tamamlayıcı fiyatını içeriyor', /35,00 TL/.test(metin), metin);
kontrol('metin kazancı içeriyor', /15,00 TL kâr/.test(metin), metin);
kontrol('metin ürün adını içeriyor', /Duracell/.test(metin), metin);

/* ---------------- 4) Aralıkta ürün yoksa uydurma yok ---------------- */
onbellegiTemizle();
const bosAdaptor = {
  id: 'bos', name: 'Boş',
  async searchProducts() { return [{ title: 'Çok pahalı', url: 'u1', price: 900 }]; },
};
const bos = await tamamlayiciBul('bos', {
  sepetToplam: 470, kargo: { fee: 50, freeOver: 500 }, adapter: bosAdaptor, anahtarlar: ['pil'],
});
kontrol('aralıkta ürün yoksa öneri listesi boş', bos.oneriler.length === 0, String(bos.oneriler.length));
kontrol('yine de açık bilgisi döner', bos.var === true && bos.eksik === 30);

/* ---------------- 5) Eşik zaten aşılmışsa arama yapılmaz ---------------- */
let aramaSayisi = 0;
const sayanAdaptor = {
  id: 'sayan', name: 'Sayan',
  async searchProducts() { aramaSayisi++; return []; },
};
onbellegiTemizle();
const gecmis = await tamamlayiciBul('sayan', {
  sepetToplam: 900, kargo: { fee: 50, freeOver: 500 }, adapter: sayanAdaptor, anahtarlar: ['pil'],
});
kontrol('eşik aşılmışsa öneri yok', gecmis.oneriler.length === 0);
kontrol('eşik aşılmışsa hiç arama yapılmadı', aramaSayisi === 0, String(aramaSayisi));

/* ---------------- 6) Önbellek: aynı arama tekrar yapılmaz ---------------- */
let cagri = 0;
const onbellekAdaptor = {
  id: 'onbellek', name: 'Önbellek',
  async searchProducts() { cagri++; return [{ title: 'Pil', url: 'p1', price: 35 }]; },
};
onbellegiTemizle();
await tamamlayiciBul('onbellek', { sepetToplam: 470, kargo: { fee: 50, freeOver: 500 }, adapter: onbellekAdaptor, anahtarlar: ['pil'] });
await tamamlayiciBul('onbellek', { sepetToplam: 470, kargo: { fee: 50, freeOver: 500 }, adapter: onbellekAdaptor, anahtarlar: ['pil'] });
kontrol('ikinci çağrıda önbellekten döndü (1 arama)', cagri === 1, String(cagri));

console.log(`TAMAMLAYICI ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
