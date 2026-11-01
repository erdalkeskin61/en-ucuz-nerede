// Kupon/kampanya toplayıcı entegrasyon testi
//
// ÖNEMLİ (2026-10-28): Bu test KENDİ KAMPANYA VERİSİNİ kullanır (statik fikstür).
// Önceden canlı `data/kuponlar.json` dosyasını okuyordu; Teknosa'nın "Seçili Dyson
// ürünlerinde %5" kampanyası bitip yerine "Havale ile 25.000 TL üzeri %2" kampanyası
// gelince test kırıldı (1 TEST BAŞARISIZ). Test artık veri toplama takvimine bağlı
// değil: kuponların gerçekten değişmesi testi etkilemez.
//
// Canlı veriye dair bilgi amaçlı bir özet en sonda basılır (başarısızlık sayılmaz).
import { computePricing } from '../src/pricing.js';
import { urunIcinKampanyalar, getKuponlar } from '../src/kuponlar.js';

let hata = 0;
const kontrol = (kosul, mesaj, detay = '') => {
  console.log((kosul ? 'OK  ' : 'HATA') + '  ' + mesaj + (detay ? '  ' + detay : ''));
  if (!kosul) hata++;
};

const KARGO_YOK = { fee: null, freeOver: null, applies: null, note: '' };

/* ---------------------------------------------------------------------------
 * 1) SABİT FİKSTÜR — Teknosa kampanyaları (kampanya metni + kapsam + indirim)
 *    Gerçek hayattaki "Seçili Dyson ürünlerinde %5" biçimini taklit eder.
 * ------------------------------------------------------------------------- */
const TEKNOSA_FIKSTUR = [
  {
    metin: 'Seçili Dyson ürünlerinde %5 indirim',
    kapsam: 'kategori',
    kategori: 'Dyson',
    indirim: { tip: 'yuzde', deger: 5 },
    kodu: null,
    minSepet: null,
    guven: 'yuksek',
  },
  {
    metin: 'Havale ile ödemede 25.000 TL üzeri alışverişlerde %2 indirim',
    kapsam: 'site',
    kategori: null,
    indirim: { tip: 'yuzde', deger: 2 },
    kodu: null,
    minSepet: 25000,
    guven: 'yuksek',
  },
];

/* ---------------------------------------------------------------------------
 * 2) Ürün ↔ kampanya eşleştirmesi (kategori filtresi + önizleme işareti)
 * ------------------------------------------------------------------------- */
const dysonUrun = { site: 'teknosa', title: 'Dyson V15 Detect Absolute Şarjlı Süpürge', sellingPrice: 20000 };
const eslesen = urunIcinKampanyalar(dysonUrun, { kampanyalar: TEKNOSA_FIKSTUR });
console.log('\nDyson ürünü için eşleşen kampanya:', eslesen.length);
for (const e of eslesen) {
  console.log('   ·', e.metin.slice(0, 55), '| kapsam:', e.kapsam, '| onizleme:', e.onizleme, '| uygulanabilir:', e.uygulanabilir);
}

kontrol(eslesen.length === 2, 'iki kampanya da eşleşti', String(eslesen.length));
const dysonKampanya = eslesen.find(e => e.kategori === 'Dyson');
kontrol(!!dysonKampanya, 'Dyson kategori kampanyası seçildi');
kontrol(dysonKampanya?.onizleme === true, 'Dyson kampanyası ÖNİZLEME olarak işaretlendi');
kontrol(dysonKampanya?.uygulanabilir === false, 'Dyson kampanyası doğrudan uygulanabilir DEĞİL');
kontrol(dysonKampanya?.indirim?.deger === 5, 'Dyson indirimi %5 okundu');

const havale = eslesen.find(e => /Havale/i.test(e.metin));
kontrol(!!havale, 'havale kampanyası eşleşti (site geneli)');
kontrol(havale?.uygulanabilir === false, 'havale kampanyası ödeme koşulu yüzünden uygulanmaz');
kontrol(/ödeme yöntemi/i.test(havale?.kosulMetni || ''), 'havale koşulu metne yazıldı', havale?.kosulMetni);
kontrol(/25\.000 TL ve üzeri sepette/.test(havale?.kosulMetni || ''), 'sepet alt limiti metne yazıldı', havale?.kosulMetni);

// Kategori uymayan ürün: Dyson kampanyası eşleşmemeli
const baskaUrun = { site: 'teknosa', title: 'Apple iPhone 15 128GB', sellingPrice: 20000 };
const baskaEslesen = urunIcinKampanyalar(baskaUrun, { kampanyalar: TEKNOSA_FIKSTUR });
kontrol(!baskaEslesen.some(e => e.kategori === 'Dyson'), 'Dyson kampanyası iPhone ürününe eşleşmedi');

// Süresi geçmiş kampanya elenmeli
const suresiGecmis = urunIcinKampanyalar(dysonUrun, {
  kampanyalar: [{ ...TEKNOSA_FIKSTUR[0], bitis: '2020-01-01' }],
});
kontrol(suresiGecmis.length === 0, 'süresi geçmiş kampanya elendi', String(suresiGecmis.length));

// Boş fikstür → boş sonuç (canlı veriye düşmüyor)
kontrol(urunIcinKampanyalar(dysonUrun, { kampanyalar: [] }).length === 0, 'boş fikstür boş sonuç verir');

/* ---------------------------------------------------------------------------
 * 3) Fiyatlama: kategori kampanyası ÖNİZLEME olarak hesaplanır, ana fiyat değişmez
 * ------------------------------------------------------------------------- */
const pr = computePricing(
  { ...dysonUrun, shipping: KARGO_YOK, siteKampanyalari: eslesen },
  [],
);
console.log('\nana toplam:', pr.toplam, '| önizleme:', pr.kampanyaOnizleme ? pr.kampanyaOnizleme.fiyat : '-');
kontrol(pr.toplam === 20000, 'ana fiyat kampanyadan etkilenmedi (20000)', String(pr.toplam));
kontrol(!!pr.kampanyaOnizleme, 'kampanya önizlemesi hesaplandı');
kontrol(!pr.kampanyaOnizleme || pr.kampanyaOnizleme.fiyat < pr.toplam, 'önizleme fiyatı ana fiyattan düşük');
kontrol(Math.abs((pr.kampanyaOnizleme?.fiyat || 0) - 19000) < 0.01, 'önizleme %5 indirimle 19000', String(pr.kampanyaOnizleme?.fiyat));

// Havale kampanyası (ödeme koşullu) tek başına önizleme ÜRETMEMELİ
const sadeceHavale = urunIcinKampanyalar(dysonUrun, { kampanyalar: [TEKNOSA_FIKSTUR[1]] });
const prHavale = computePricing({ ...dysonUrun, shipping: KARGO_YOK, siteKampanyalari: sadeceHavale }, []);
kontrol(!prHavale.kampanyaOnizleme, 'ödeme koşullu kampanya önizleme üretmedi');
kontrol(prHavale.toplam === 20000, 'ödeme koşullu kampanya ana fiyatı değiştirmedi', String(prHavale.toplam));

/* ---------------------------------------------------------------------------
 * 4) Kupon kodlu site kampanyası → "kuponla X TL"
 * ------------------------------------------------------------------------- */
const kodlu = {
  site: 'koctas', title: 'Mandu Temizlik Seti', sellingPrice: 1000,
  shipping: KARGO_YOK,
  siteKampanyalari: [{
    metin: 'Kupon kodu ile %10 indirim', kapsam: 'site', indirim: { tip: 'yuzde', deger: 10 },
    kodu: 'TEST10', minSepet: null, kosulMetni: 'kupon kodu: TEST10', uygulanabilir: false, onizleme: false,
  }],
};
const pr2 = computePricing(kodlu, []);
console.log('\nkodlu kupon toplam:', pr2.toplam, '| kuponlu:', pr2.kupon ? pr2.kupon.fiyat : '-', '| kod:', pr2.kupon ? pr2.kupon.kodu : '-');
kontrol(pr2.toplam === 1000, 'kodlu kupon ana fiyata eklenmedi');
kontrol(pr2.kupon && pr2.kupon.fiyat === 900, 'kuponlu fiyat 900 hesaplandı');
kontrol(pr2.kupon && pr2.kupon.siteKampanyasi === true, 'kuponun site kaynaklı olduğu işaretlendi');
kontrol(pr2.kupon && pr2.kupon.kodu === 'TEST10', 'kupon kodu gösterildi');

// Kodlu kampanya fikstürden de aynı sonucu vermeli (urunIcinKampanyalar üzerinden)
const kodluEslesen = urunIcinKampanyalar(
  { site: 'koctas', title: 'Mandu Temizlik Seti', sellingPrice: 1000 },
  {
    kampanyalar: [{
      metin: 'Kupon kodu ile %10 indirim', kapsam: 'site', kategori: null,
      indirim: { tip: 'yuzde', deger: 10 }, kodu: 'TEST10', minSepet: null, guven: 'yuksek',
    }],
  },
);
kontrol(kodluEslesen.length === 1 && kodluEslesen[0].kodu === 'TEST10', 'kodlu kampanya fikstürden okundu');
kontrol(/kupon kodu: TEST10/i.test(kodluEslesen[0]?.kosulMetni || ''), 'kupon koşulu metne yazıldı');

/* ---------------------------------------------------------------------------
 * 5) Koşulsuz site kampanyası → doğrudan uygulanır
 * ------------------------------------------------------------------------- */
const kosulsuzEslesen = urunIcinKampanyalar(
  { site: 'teknosa', title: 'Test Ürün', sellingPrice: 1000 },
  {
    kampanyalar: [{
      metin: 'Tüm alışverişlerde %10 indirim', kapsam: 'site', kategori: null,
      indirim: { tip: 'yuzde', deger: 10 }, kodu: null, minSepet: null, guven: 'yuksek',
    }],
  },
);
kontrol(kosulsuzEslesen.length === 1 && kosulsuzEslesen[0].uygulanabilir === true, 'koşulsuz kampanya uygulanabilir işaretlendi');

const pr3 = computePricing(
  { site: 'teknosa', title: 'Test Ürün', sellingPrice: 1000, shipping: KARGO_YOK, siteKampanyalari: kosulsuzEslesen },
  [],
);
console.log('\nkoşulsuz site kampanyası toplam:', pr3.toplam);
kontrol(pr3.toplam === 900, 'koşulsuz site kampanyası fiyata uygulandı (900)', String(pr3.toplam));
kontrol(pr3.ekIndirim === 100, 'ekIndirim 100 gösterildi', String(pr3.ekIndirim));

/* ---------------------------------------------------------------------------
 * 6) BİLGİ (başarısızlık sayılmaz): canlı dosyada ne var?
 *    Testin geçmesi bu veriye BAĞLI DEĞİL — yalnızca gözlem amaçlı.
 * ------------------------------------------------------------------------- */
try {
  const canli = getKuponlar();
  const toplam = canli.siteler.reduce((s, x) => s + x.kampanyalar.length, 0);
  console.log(`\n[bilgi] canlı data/kuponlar.json: ${toplam} kampanya, son güncelleme: ${canli.sonGuncelleme || 'yok'}`);
  for (const s of canli.siteler) {
    if (s.kampanyalar.length) console.log(`   ${s.ad}: ${s.kampanyalar.length}`);
  }
  console.log('[bilgi] Bu sayılar değişse de test sonucu değişmez.');
} catch (e) {
  console.log('\n[bilgi] canlı veri okunamadı (test sonucunu etkilemez):', e.message);
}

console.log(hata ? `\n${hata} TEST BAŞARISIZ` : '\nTÜM TESTLER GEÇTİ ✓');
process.exit(hata ? 1 : 0);
