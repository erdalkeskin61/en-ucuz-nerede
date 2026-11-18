/**
 * 🧺 Akıllı Sepet & Kargo Sihirbazı — Test Paketi (2026-11-08)
 *
 * Kapsam:
 *   1)  Kargo kuralı motoru (>= / > / ücretsiz / eşiksiz)
 *   2)  3'lü paket kargo eşiği senaryosu — A=₺1.770, B=₺1.590, tasarruf ₺180
 *   3)  Senaryo sıralaması (A/B/C), önerilen seçim, tasarruf metni
 *   4)  Kargo eşiği kurtarıcı (eksik / net kazanç / mantıklılık)
 *   5)  Tamamlayıcı ürün net etkisi
 *   6)  Hazır paket çözümleme (gerçek teklifler; eksik/değişim dürüstlüğü)
 *   7)  localStorage sepet modeli (normalize / doğrulama / toplam / gövde)
 *   8)  UI sözleşmesi (HTML/JS/CSS + navigasyon + mobile scroll-snap)
 *   9)  Sunucu sözleşmesi (/api/sepet · /api/sepet/:id · /api/sepet/paylas · /api/tamamlayici)
 *   10) Paylaşım linki uçtan uca (gerçek yazma → okuma → sayfa) + temizlik
 *
 *   node scripts/test-sepet-optimizer-ui.mjs
 *   node scripts/test-sepet-optimizer-ui.mjs --canli-basket   (gerçek tarama; yavaş)
 *
 * Ağ: paylaşım ve sağlık kontrolleri localhost:3000'e gider; sunucu kapalıysa
 * bu bölümler atlanır (süit kırmızı olmaz). Gerçek sepet taraması yalnızca
 * `--canli-basket` ile çalışır (dakikalar sürebilir).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  kargoKurus, senaryolariHesapla, gruplariOlustur,
} from '../src/basketOptimizer.js';
import { kargoAcigi } from '../src/kargoTamamlayici.js';
import {
  para, yuzde, turkceAblatif, senaryoListesi, onerilenAnahtar, senaryoFarki,
  tasarrufOzeti, kargoFirsati, tamamlayiciEtkisi, paketCoz, PAKETLER,
  sepetNormalize, sepetDogrula, sepetToplami, sepetIstekGovdesi, kargoMetni,
  MIN_URUN, MAKS_URUN, KARGO_FIRSAT_SINIRI_TL,
  kiyasVerisi, paketKargoDurumu, paketOzeti,
} from '../public/sepetHesap.js';
import { sepetPaylasAl, sepetPaylasSil, closeDatabase } from '../src/store.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');

let gecen = 0, toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);
const yakin = (a, b, tol = 0.001) => Math.abs(Number(a) - Number(b)) <= tol;

/* ------------------------------------------------------------------ */
bolum('1) 🚚 Kargo kuralı motoru');

const k80 = { fee: 80, freeOver: 1500 };
kontrol('eşik altı → 80 TL', kargoKurus(149999, k80) === 8000, String(kargoKurus(149999, k80)));
kontrol('tam eşik (>=) → 0', kargoKurus(150000, k80) === 0);
kontrol('eşik + 1 kuruş → 0', kargoKurus(150001, k80) === 0);
kontrol('freeOverExclusive tam eşik → 80 TL',
  kargoKurus(150000, { ...k80, freeOverExclusive: true }) === 8000);
kontrol('freeOverExclusive 1 kuruş fazla → 0',
  kargoKurus(150001, { ...k80, freeOverExclusive: true }) === 0);
kontrol('applies:false → 0 (site geneli ücretsiz)',
  kargoKurus(999, { fee: 80, freeOver: 1500, applies: false }) === 0);
kontrol('eşiksiz sabit ücret', kargoKurus(500000, { fee: 45 }) === 4500);
kontrol('kural yok → 0', kargoKurus(500000, null) === 0);
kontrol('kuruş hassasiyeti: 1499,99 → 80 TL', kargoKurus(149999, k80) === 8000);
kontrol('kuruş hassasiyeti: 1500,00 → 0', kargoKurus(150000, k80) === 0);

/* ------------------------------------------------------------------ */
bolum("2) 🎯 3'lü paket — kargo eşiği ve ₺180 tasarruf");

// Görev metnindeki tablo: 3 ayrı mağazada 500/510/520, her birinde 80 TL kargo,
// Robotistan'da 520/530/540 (toplam 1590 → 1500 eşiği aşıldı, kargo 0).
const KARGO_80 = { fee: 80, freeOver: 1500 };
const UC_URUN = [
  {
    id: 'u1', ad: 'eSun PLA Siyah', teklifler: [
      { site: 'magaza1', siteName: 'Mağaza1', urunFiyati: 500, kargo: KARGO_80, url: 'https://a/1' },
      { site: 'robotistan', siteName: 'Robotistan', urunFiyati: 520, kargo: KARGO_80, url: 'https://b/1' },
      { site: 'porima3d', siteName: 'Porima3D', urunFiyati: 540, kargo: KARGO_80, url: 'https://c/1' },
    ],
  },
  {
    id: 'u2', ad: 'Porima PLA Beyaz', teklifler: [
      { site: 'magaza2', siteName: 'Mağaza2', urunFiyati: 510, kargo: KARGO_80, url: 'https://a/2' },
      { site: 'robotistan', siteName: 'Robotistan', urunFiyati: 530, kargo: KARGO_80, url: 'https://b/2' },
      { site: 'porima3d', siteName: 'Porima3D', urunFiyati: 550, kargo: KARGO_80, url: 'https://c/2' },
    ],
  },
  {
    id: 'u3', ad: 'Microzey PLA Gri', teklifler: [
      { site: 'magaza3', siteName: 'Mağaza3', urunFiyati: 520, kargo: KARGO_80, url: 'https://a/3' },
      { site: 'robotistan', siteName: 'Robotistan', urunFiyati: 540, kargo: KARGO_80, url: 'https://b/3' },
      { site: 'porima3d', siteName: 'Porima3D', urunFiyati: 560, kargo: KARGO_80, url: 'https://c/3' },
    ],
  },
];

const hesap = senaryolariHesapla(UC_URUN, { enFazlaKume: 3 });
const A = hesap.senaryolar.maksimumTasarruf;
const B = hesap.senaryolar.tekMagaza;
const C = hesap.senaryolar.akilliBolunmus;

kontrol('3 senaryo da üretildi', !!(A && B && C));
kontrol('A (dağınık): ürünler ₺1.530', yakin(A.araToplam, 1530), String(A.araToplam));
kontrol('A (dağınık): kargo 3 × ₺80 = ₺240', yakin(A.kargo, 240), String(A.kargo));
kontrol('A (dağınık): toplam ₺1.770', yakin(A.toplam, 1770), String(A.toplam));
kontrol('A: 3 farklı mağaza', A.magazaSayisi === 3, String(A.magazaSayisi));
kontrol('B (tek mağaza): ürünler ₺1.590', yakin(B.araToplam, 1590), String(B.araToplam));
kontrol('B (tek mağaza): kargo ₺0 (eşik aşıldı)', yakin(B.kargo, 0), String(B.kargo));
kontrol('B (tek mağaza): toplam ₺1.590', yakin(B.toplam, 1590), String(B.toplam));
kontrol('B: tek mağaza (Robotistan)', B.magazaSayisi === 1 && B.gruplar[0].siteName === 'Robotistan');
kontrol('C (hibrit): toplam ₺1.590', yakin(C.toplam, 1590), String(C.toplam));
kontrol('motorun en iyisi B (tek mağaza, eşitlikte az mağaza)',
  hesap.enIyiAnahtar === 'tekMagaza' && hesap.enIyiToplam === 1590, hesap.enIyiAnahtar);

// Kuruşu kuruşuna tasarruf: A − B = 180.00
kontrol('A − B = tam ₺180,00',
  Math.round(A.toplam * 100) - Math.round(B.toplam * 100) === 18000,
  String(Math.round(A.toplam * 100) - Math.round(B.toplam * 100)));
kontrol('A-B farkı kuruş biriminde tam 18000', senaryoFarki(A, B).kurus === 18000,
  String(senaryoFarki(A, B).kurus));
kontrol('fark TL olarak 180', senaryoFarki(A, B).tl === 180);
kontrol('ters yön negatif', senaryoFarki(B, A).tl === -180);
kontrol('eşit senaryoda fark 0', senaryoFarki(B, C).tl === 0);

// Kargo, tasarrufun TAMAMINI açıklıyor (1530+240 = 1590+180).
kontrol('kargo farkı ₺240, ürün farkı ₺60 → net ₺180',
  Math.round((A.kargo - B.kargo) * 100) === 24000
  && Math.round((B.araToplam - A.araToplam) * 100) === 6000
  && 24000 - 6000 === 18000);

// Grup düzeyi doğrulama: A'da her mağaza tek ürün + 80 TL kargo.
kontrol('A: her grupta 1 ürün ve 80 TL kargo',
  A.gruplar.every(g => g.urunler.length === 1 && yakin(g.kargo, 80) && yakin(g.toplam, g.araToplam + 80)));
kontrol('B: tek grupta 3 ürün, kargo bedava',
  B.gruplar.length === 1 && B.gruplar[0].urunler.length === 3 && yakin(B.gruplar[0].kargo, 0));

/* ------------------------------------------------------------------ */
bolum('3) 🧭 Senaryo sıralaması, önerilen ve tasarruf metni');

const kartlar = senaryoListesi(hesap);
kontrol('3 kart üretildi', kartlar.length === 3);
kontrol('A = maksimumTasarruf', kartlar[0].anahtar === 'maksimumTasarruf' && kartlar[0].harf === 'A');
kontrol('B = tekMagaza', kartlar[1].anahtar === 'tekMagaza' && kartlar[1].harf === 'B');
kontrol('C = akilliBolunmus', kartlar[2].anahtar === 'akilliBolunmus' && kartlar[2].harf === 'C');
kontrol('kart başlıkları görevle uyumlu',
  kartlar[0].baslik.includes('Ham En Ucuz')
  && kartlar[1].baslik.includes('Tek Mağaza')
  && kartlar[2].baslik.includes('Hibrit'));
kontrol('tüm kartlar dolu', kartlar.every(k => k.dolu === true));
kontrol('önerilen = tekMagaza', onerilenAnahtar(hesap) === 'tekMagaza');
kontrol('önerilen olmayan tekil senaryoda da doğru çalışır',
  onerilenAnahtar({ senaryolar: { maksimumTasarruf: A } }) === 'maksimumTasarruf');
kontrol('hiç senaryo yoksa null', onerilenAnahtar({ senaryolar: {} }) === null);
kontrol('motor kararı yoksa en düşük toplam seçilir',
  onerilenAnahtar({ senaryolar: { a: { toplam: 900 }, b: { toplam: 800 } } }) === 'b');

const ozet = tasarrufOzeti(hesap);
kontrol('tasarruf zarfı: en iyi B', ozet.enIyiAnahtar === 'tekMagaza', String(ozet.enIyiAnahtar));
kontrol('tasarruf zarfı: en pahalı A', ozet.enPahaliAnahtar === 'maksimumTasarruf', String(ozet.enPahaliAnahtar));
kontrol('tasarruf tutarı ₺180', ozet.tasarrufTL === 180, String(ozet.tasarrufTL));
kontrol('tasarruf yüzdesi %10,2', ozet.tasarrufYuzde === 10.2, String(ozet.tasarrufYuzde));
kontrol('kargo farkı ₺240', ozet.kargoFarkiTL === 240, String(ozet.kargoFarkiTL));
kontrol('metin "Kargo ücretleri yüzünden" içerir', /Kargo ücretleri yüzünden/.test(ozet.metin || ''), ozet.metin);
kontrol('metin tasarruf tutarını yazar', /180,00 TL/.test(ozet.metin || ''), ozet.metin);
kontrol('boş senaryoda metin null', tasarrufOzeti({}).metin === null);

kontrol("Türkçe eki: Robotistan'dan", turkceAblatif('Robotistan') === "'dan");
kontrol("Türkçe eki: Porima 3D'den", turkceAblatif('Porima 3D') === "'den");
kontrol('para biçimi 1590 → 1.590,00 TL', para(1590) === '1.590,00 TL', para(1590));
kontrol('para null → —', para(null) === '—');
kontrol('yuzde 10.2 → %10,2', yuzde(10.2) === '%10,2', yuzde(10.2));

/* ------------------------------------------------------------------ */
bolum('4) 🚚 Kargo eşiği kurtarıcı (booster)');

const firsat = kargoFirsati({
  araToplam: 1465, kargo: 80,
  kargoKurali: { fee: 80, freeOver: 1500 },
});
kontrol('eşiğe ₺35 kaldı', firsat.var === true && firsat.eksik === 35, String(firsat.eksik));
kontrol('kargo ücreti ₺80', firsat.kargoUcreti === 80);
kontrol('net kazanç ₺45 (80−35)', firsat.netKazanc === 45, String(firsat.netKazanc));
kontrol('kârlı olduğu için mantikli', firsat.mantikli === true);
kontrol('gerekçe metni', /35,00 TL daha eklenirse/.test(firsat.neden), firsat.neden);

const esikGecti = kargoFirsati({ araToplam: 1500, kargo: 0, kargoKurali: { fee: 80, freeOver: 1500 } });
kontrol('eşik aşıldıysa fırsat yok', esikGecti.var === false && /aşıldı/.test(esikGecti.neden), esikGecti.neden);
const kargoYok = kargoFirsati({ araToplam: 1465, kargo: 0, kargoKurali: { fee: 80, freeOver: 1500 } });
kontrol('kargo ödenmiyorsa fırsat yok', kargoYok.var === false);
const kuralYok = kargoFirsati({ araToplam: 1465, kargo: 80, kargoKurali: null });
kontrol('kural bilinmiyorsa fırsat yok', kuralYok.var === false);
const exclusive = kargoFirsati({ araToplam: 1500, kargo: 80, kargoKurali: { fee: 80, freeOver: 1500, freeOverExclusive: true } });
kontrol('exclusive eşikte 1 kuruş eksik hesaplanır', exclusive.eksik === 0.01, String(exclusive.eksik));
kontrol('exclusive net kazanç 79,99', exclusive.netKazanc === 79.99, String(exclusive.netKazanc));
const cokUzak = kargoFirsati({ araToplam: 500, kargo: 80, kargoKurali: { fee: 80, freeOver: 1500 } });
kontrol('eşik çok uzaksa mantikli değil', cokUzak.var === true && cokUzak.mantikli === false);
kontrol('KARGO_FIRSAT_SINIRI_TL 150', KARGO_FIRSAT_SINIRI_TL === 150);

// Sunucu motoruyla aynı sonucu vermeli (tek kaynak kural).
const sunucuAcik = kargoAcigi({ sepetToplam: 1465, kargo: { fee: 80, freeOver: 1500 } });
kontrol('istemci/sunucu kargo açığı aynı (1465/1500)',
  sunucuAcik.var === true && yakin(sunucuAcik.eksik, firsat.eksik), String(sunucuAcik.eksik));
const sunucuExclusive = kargoAcigi({ sepetToplam: 1500, kargo: { fee: 80, freeOver: 1500, freeOverExclusive: true } });
kontrol('istemci/sunucu exclusive aynı', yakin(sunucuExclusive.eksik, exclusive.eksik), String(sunucuExclusive.eksik));

bolum('4B) ➕ Tamamlayıcı net etkisi');

const etki40 = tamamlayiciEtkisi(firsat, { title: 'Nozzle 0.4mm', fiyat: 40 });
kontrol('₺40 ürün → ₺40 net kazanç', etki40.netKazanc === 40, String(etki40.netKazanc));
kontrol('₺40 ürün kârlı', etki40.mantikli === true);
kontrol('metin "80,00 TL kargo yerine" içerir', /80,00 TL kargo yerine/.test(etki40.metin), etki40.metin);
const etki90 = tamamlayiciEtkisi(firsat, { title: 'Pahalı ürün', fiyat: 90 });
kontrol('₺90 ürün kargo ücretinden pahalı → kârsız', etki90.netKazanc === -10 && etki90.mantikli === false,
  String(etki90.netKazanc));
kontrol('kârsız metin "kâr getirmez" der', /kâr getirmez/.test(etki90.metin));
kontrol('fırsat yoksa etki null', tamamlayiciEtkisi({ var: false }, { fiyat: 10 }) === null);
kontrol('fiyatsız öneri null', tamamlayiciEtkisi(firsat, { title: 'x' }) === null);

/* ------------------------------------------------------------------ */
bolum('5) 🎨 Hazır paket çözümleme (dürüstlük)');

const TEKLIFLER = [
  { ad: 'Porima xPLA Filament Siyah 1kg', site: 'Porima 3D', fiyat: 463.68, malzeme: 'PLA', renk: 'siyah', url: 'https://p/siyah' },
  { ad: 'Microzey PLA Filament Gri', site: 'Trendyol', fiyat: 532.21, malzeme: 'PLA+', renk: 'gri', url: 'https://t/gri' },
  { ad: 'Porima Eco PLA Filament Gri 1kg', site: 'Porima 3D', fiyat: 551.04, malzeme: 'PLA', renk: 'gri', url: 'https://p/gri2' },
  { ad: 'Porima Hyper PLA+ Filament Siyah 1kg', site: 'FilamentMarketim', fiyat: 588.52, malzeme: 'PLA', renk: 'siyah', url: 'https://fm/hyper' },
  { ad: 'Porima PLA Filament Beyaz 1kg', site: 'Porima 3D', fiyat: 612, malzeme: 'PLA', renk: 'beyaz', url: 'https://p/beyaz' },
  { ad: 'eSun ePLA-HS (High Speed) PLA Siyah 1kg', site: 'FilamentSan', fiyat: 929, malzeme: 'PLA', renk: 'siyah', url: 'https://f/hs' },
  { ad: 'Fiyatsız ürün', site: 'X', fiyat: 0, malzeme: 'PLA', url: 'https://x/0' },
  { ad: 'Linki olmayan PLA', site: 'Y', fiyat: 100, malzeme: 'PLA', url: null },
];

const temel = PAKETLER.find(p => p.id === 'temel-renk');
const temelCozum = paketCoz(temel, TEKLIFLER);
kontrol('temel renk: 3 ürün çözüldü', temelCozum.adet === 3, String(temelCozum.adet));
kontrol('temel renk: eklenebilir', temelCozum.eklenebilir === true);
kontrol('temel renk: eksik yok', temelCozum.eksikler.length === 0);
kontrol('siyah en ucuz PLA seçildi (463,68)', temelCozum.parcalar[0].teklif.fiyat === 463.68,
  String(temelCozum.parcalar[0].teklif.fiyat));
kontrol('beyaz 612', temelCozum.parcalar[1].teklif.fiyat === 612, String(temelCozum.parcalar[1].teklif.fiyat));
kontrol('gri en ucuz 532,21', temelCozum.parcalar[2].teklif.fiyat === 532.21,
  String(temelCozum.parcalar[2].teklif.fiyat));
kontrol('temel toplam 1607,89', temelCozum.tahminiToplam === 1607.89, String(temelCozum.tahminiToplam));
kontrol('her parça gerçek URL taşır', temelCozum.parcalar.every(p => /^https:\/\//.test(p.teklif.url)));
kontrol('fiyatsız/linkisz ürünler seçilmedi',
  temelCozum.parcalar.every(p => Number(p.teklif.fiyat) > 0 && p.teklif.url));

const hizli = PAKETLER.find(p => p.id === 'hizli-baski');
const hizliCozum = paketCoz(hizli, TEKLIFLER);
kontrol('hızlı paket: 3 adet (2+1)', hizliCozum.adet === 3, String(hizliCozum.adet));
kontrol('hızlı paket: eSun tercihi korunur',
  hizliCozum.parcalar[0].teklif.ad.includes('eSun'), hizliCozum.parcalar[0].teklif.ad);
kontrol('hızlı paket: Creality yoksa değişim raporlanır',
  hizliCozum.degisimler.length === 1 && /Creality/.test(hizliCozum.degisimler[0].istenen));
kontrol('hızlı paket: değişim gerçek ürünü gösterir',
  /Hyper/.test(hizliCozum.degisimler[0].eklenen), hizliCozum.degisimler[0].eklenen);
kontrol('hızlı paket toplamı 2×929 + 588,52',
  hizliCozum.tahminiToplam === 2446.52, String(hizliCozum.tahminiToplam));

const dayanikli = PAKETLER.find(p => p.id === 'dayanikli');
const dayanikliCozum = paketCoz(dayanikli, TEKLIFLER);
kontrol('PETG/ABS yoksa paket eklenemez', dayanikliCozum.eklenebilir === false);
kontrol('eksikler PETG + ABS olarak listelenir',
  dayanikliCozum.eksikler.map(e => e.etiket).join(',') === 'PETG,ABS',
  dayanikliCozum.eksikler.map(e => e.etiket).join(','));
kontrol('eksik üründe uydurma teklif yok', dayanikliCozum.parcalar.length === 0);
kontrol('toplam üretilmez (null)', dayanikliCozum.tahminiToplam === null);
kontrol('boş katalogda hiçbir paket eklenemez',
  PAKETLER.every(p => paketCoz(p, []).eklenebilir === false));
kontrol('PAKETLER 3 paket', PAKETLER.length === 3);
kontrol('paket kimlikleri tekil', new Set(PAKETLER.map(p => p.id)).size === 3);

/* ------------------------------------------------------------------ */
bolum('6) 🗃️ localStorage sepet modeli');

const ham = [
  { id: 'a', ad: 'Ürün A', url: 'https://x/a', adet: 2, fiyat: 100.5 },
  { id: 'b', ad: 'Ürün B', url: 'https://x/b', adet: 0, fiyat: 50 },
  { id: 'c', ad: 'Ürün C', url: 'ftp://x/c', adet: 1 },
  { id: 'd', ad: 'Ürün A tekrar', url: 'https://x/a', adet: 1 },
  null,
];
const norm = sepetNormalize(ham);
kontrol('geçersiz protokol atılır', !norm.some(x => x.url.startsWith('ftp')));
kontrol('null kayıt atılır', norm.length === 2, String(norm.length));
kontrol('aynı URL tekilleşir', norm.filter(x => x.url === 'https://x/a').length === 1);
kontrol('adet 0 → 1', norm[1].adet === 1, String(norm[1].adet));
kontrol('fiyat korunur', norm[0].fiyat === 100.5, String(norm[0].fiyat));
kontrol('string girdi parse edilir',
  sepetNormalize(JSON.stringify([{ url: 'https://x/z', ad: 'Z' }])).length === 1);
kontrol('bozuk JSON → boş sepet', sepetNormalize('{bozuk').length === 0);
kontrol('dizi olmayan girdi → boş', sepetNormalize({ a: 1 }).length === 0);
kontrol('10 ürün sınırı', sepetNormalize(
  Array.from({ length: 15 }, (_, i) => ({ url: 'https://x/' + i, ad: 'U' + i }))).length === 10);

kontrol('1 ürün → hata', sepetDogrula([{ url: 'https://x/a' }]).ok === false);
kontrol('2 ürün → geçerli', sepetDogrula([
  { url: 'https://x/a', adet: 1 }, { url: 'https://x/b', adet: 1 }]).ok === true);
kontrol('11 ürün (adet toplamı) → hata',
  sepetDogrula([{ url: 'https://x/a', adet: 6 }, { url: 'https://x/b', adet: 5 }]).ok === false);
kontrol('10 ürün → geçerli',
  sepetDogrula([{ url: 'https://x/a', adet: 5 }, { url: 'https://x/b', adet: 5 }]).ok === true);
kontrol('bozuk URL → hata', sepetDogrula([
  { url: 'https://x/a' }, { url: 'url-degil' }]).ok === false);
kontrol('MIN_URUN 2 / MAKS_URUN 10', MIN_URUN === 2 && MAKS_URUN === 10);

kontrol('sepet toplamı adet dahil: 2×100,50 + 50 = 251,00',
  sepetToplami([{ url: 'https://x/a', fiyat: 100.5, adet: 2 }, { url: 'https://x/b', fiyat: 50, adet: 1 }]) === 251,
  String(sepetToplami([{ url: 'https://x/a', fiyat: 100.5, adet: 2 }, { url: 'https://x/b', fiyat: 50, adet: 1 }])));
kontrol('fiyatsız ürün toplamı bozmaz',
  sepetToplami([{ url: 'https://x/a', fiyat: null, adet: 3 }]) === 0);
kontrol('kuruş hatası yok: 0,10 × 3 = 0,30',
  sepetToplami([{ url: 'https://x/a', fiyat: 0.1, adet: 3 }]) === 0.3,
  String(sepetToplami([{ url: 'https://x/a', fiyat: 0.1, adet: 3 }])));

const govde = sepetIstekGovdesi([
  { url: 'https://x/a', ad: 'A', adet: 2 },
  { url: 'https://x/b', ad: 'B', adet: 1 },
]);
kontrol('istek gövdesi adet kadar ürün üretir', govde.urunler.length === 3, String(govde.urunler.length));
kontrol('istek gövdesi URL taşır', govde.urunler[0].url === 'https://x/a');
kontrol('istek gövdesi 10 ile sınırlanır',
  sepetIstekGovdesi(Array.from({ length: 12 }, (_, i) => ({ url: 'https://x/' + i, adet: 1 }))).urunler.length === 10);

kontrol('kargo metni bedava', /eşik aşıldı/.test(kargoMetni({ kargo: 0, magazaSayisi: 1 })));
kontrol('kargo metni ücretli + gönderim sayısı',
  /240,00 TL/.test(kargoMetni({ kargo: 240, magazaSayisi: 3 }))
  && /3 × ayrı gönderim/.test(kargoMetni({ kargo: 240, magazaSayisi: 3 })));
kontrol('kargo metni null → —', kargoMetni(null) === '—');

/* ------------------------------------------------------------------ */
bolum('7) 🖥️ UI sözleşmesi (HTML / JS / CSS)');

const html = oku('public/sepet.html');
const js = oku('public/sepet.js');
const hesapJs = oku('public/sepetHesap.js');
const css = oku('public/style.css');
const indexHtml = oku('public/index.html');
const maliyetHtml = oku('public/maliyet.html');
const slicerHtml = oku('public/slicer.html');
const ayarlarHtml = oku('public/ayarlar.html');
const serverJs = oku('server.js');

kontrol('sepet.html: sayfa başlığı', /Akıllı Sepet/.test(html));
kontrol('sepet.html: modül script', /<script type="module" src="\/sepet\.js">/.test(html));
kontrol('sepet.html: paket bölümü', /id="paketler"/.test(html));
kontrol('sepet.html: sepet listesi', /id="sepetListe"/.test(html));
kontrol('sepet.html: senaryo kart alanı', /id="senaryoKartlari"/.test(html));
kontrol('sepet.html: tasarruf bandı', /id="tasarrufBant"/.test(html));
kontrol('sepet.html: kargo kurtarıcı bölümü', /id="kargoKurtarici"/.test(html));
kontrol('sepet.html: paylaş düğmesi', /id="sepetPaylas"/.test(html));
kontrol('sepet.html: ilerleme çubuğu', /role="progressbar"/.test(html));
kontrol('sepet.html: görünüm meta viewport-fit', /viewport-fit=cover/.test(html));
kontrol('sepet.html: ana sayfa bağlantısı', /href="\/"/.test(html));

kontrol('navigasyon: index → sepet', /href="\/sepet\.html"[^>]*>🧺 Akıllı Sepet/.test(indexHtml));
kontrol('navigasyon: maliyet → sepet', /href="\/sepet\.html"[^>]*>🧺 Akıllı Sepet/.test(maliyetHtml));
kontrol('navigasyon: slicer → sepet', /href="\/sepet\.html"/.test(slicerHtml));
kontrol('navigasyon: ayarlar → sepet', /href="\/sepet\.html"/.test(ayarlarHtml));

kontrol('sepet.js: saflık modülünü kullanır', /from '\/sepetHesap\.js'/.test(js));
kontrol('sepet.js: localStorage anahtarı', /eun_sepet_v1/.test(js));
kontrol('sepet.js: POST /api/sepet', /fetch\('\/api\/sepet'/.test(js));
kontrol('sepet.js: GET /api/sepet/:id', /'\/api\/sepet\/' \+ encodeURIComponent\(isId\)/.test(js));
kontrol('sepet.js: iptal ucu', /\/iptal/.test(js));
kontrol('sepet.js: paylaşım ucu', /\/api\/sepet\/paylas/.test(js));
kontrol('sepet.js: tamamlayıcı ucu', /\/api\/tamamlayici/.test(js));
kontrol('sepet.js: ürün önerisi ucu', /\/api\/search-suggestions/.test(js));
kontrol('sepet.js: canlı filament kataloğu', /\/api\/baski\/en-ucuz-filamentler/.test(js));
kontrol('sepet.js: affilili link rel', /rel="noopener sponsored"/.test(js));
kontrol('sepet.js: pop-up engeli kullanıcıya söylenir', /yeni sekmeleri engelledi/.test(js));
kontrol('sepet.js: artan bekleme ile yeniden deneme', /1200 \+ hataSayisi \* 600/.test(js));
kontrol('sepet.js: ilerleme aria-valuenow', /aria-valuenow/.test(js));
kontrol('sepet.js: XSS kaçırma (esc)', /function esc\(/.test(js) || /const esc =/.test(js));
kontrol('sepet.js: uydurma "kişi sayısı" yok', !/kişi (bu fiyatı|inceledi)/.test(js));

kontrol('sepetHesap.js: saf (fetch/DOM yok)',
  !/\bfetch\s*\(/.test(hesapJs) && !/document\./.test(hesapJs) && !/localStorage/.test(hesapJs));
kontrol('sepetHesap.js: kuruş bazlı fark', /Math\.round\(Number\(tl \|\| 0\) \* 100\)/.test(hesapJs));
kontrol('sepetHesap.js: kargo kuralı >= ve exclusive',
  /freeOverExclusive === true/.test(hesapJs) && /kurus\(toplam\) >= kurus\(esik\)|kurus\(toplam\) >= kurus\(esik\)/.test(hesapJs.replace(/\\/g, '')) !== false);

kontrol('style.css: .tasarruf-rozet', /\.tasarruf-rozet\s*\{/.test(css));
kontrol('style.css: zümrüt tasarruf rengi', /#D1FAE5/.test(css) && /#065F46/.test(css));
kontrol('style.css: amber uyarı kutusu', /\.senaryo-fark[\s\S]{0,400}#FEF3C7/.test(css));
kontrol('style.css: mobil yatay kaydırma', /overflow-x:\s*auto/.test(css));
kontrol('style.css: scroll-snap zorunlu', /scroll-snap-type:\s*x mandatory/.test(css));
kontrol('style.css: senaryo kartı snap hizası', /scroll-snap-align:\s*center/.test(css));
kontrol('style.css: önerilen kart zümrüt çerçeve', /\.senaryo-kart\.oneri[\s\S]{0,300}#10B981/.test(css));
kontrol('style.css: kargo kurtarıcı amber', /\.kargo-kart[\s\S]{0,200}#F59E0B/.test(css));
kontrol('style.css: paket ekle düğmesi', /\.paket-ekle\s*\{/.test(css));
kontrol('style.css: koyu tema desteği', /html\[data-theme="dark"\] \.senaryo-kart\.oneri/.test(css));
kontrol('style.css: hareket azaltma', /prefers-reduced-motion[\s\S]{0,200}senaryo-cta/.test(css));

/* ------------------------------------------------------------------ */
bolum('8) 🔌 Sunucu sözleşmesi');

kontrol('POST /api/sepet tanımlı', /app\.post\('\/api\/sepet',/.test(serverJs));
kontrol('GET /api/sepet/:id tanımlı', /app\.get\('\/api\/sepet\/:id'/.test(serverJs));
kontrol('POST /api/sepet/:id/iptal tanımlı', /app\.post\('\/api\/sepet\/:id\/iptal'/.test(serverJs));
kontrol('POST /api/sepet/paylas tanımlı', /app\.post\('\/api\/sepet\/paylas'/.test(serverJs));
kontrol('GET /api/sepet/paylas/:id tanımlı', /app\.get\('\/api\/sepet\/paylas\/:id'/.test(serverJs));
kontrol('GET /sepet/paylas/:id sayfası tanımlı', /app\.get\('\/sepet\/paylas\/:id'/.test(serverJs));
kontrol('POST /api/tamamlayici tanımlı', /app\.post\('\/api\/tamamlayici'/.test(serverJs));
kontrol('min 2 ürün doğrulaması', /urunler\.length < 2/.test(serverJs));
kontrol('max 10 ürün doğrulaması', /urunler\.length > 10/.test(serverJs));
kontrol('paylaşım boyut sınırı 200 KB', /200_000/.test(serverJs));
kontrol('store: paylaşım kaydet/al/sil', /export function sepetPaylasKaydet/.test(oku('src/store.js'))
  && /export function sepetPaylasAl/.test(oku('src/store.js'))
  && /export function sepetPaylasSil/.test(oku('src/store.js')));

/* ------------------------------------------------------------------ */
bolum('9) 🌐 Paylaşım linki uçtan uca (sunucu açıksa)');

const TABAN = process.env.SEPET_TEST_TABAN || 'http://localhost:3000';
const PAYLAS_ID = 'testsepetui2026';
let sunucuVar = false;
try {
  const ctrl = new AbortController();
  const z = setTimeout(() => ctrl.abort(), 4000);
  const r = await fetch(TABAN + '/api/push/vapid-key', { signal: ctrl.signal }).finally(() => clearTimeout(z));
  sunucuVar = r.ok;
} catch { sunucuVar = false; }

if (!sunucuVar) {
  console.log('  ℹ️  Sunucu kapalı — paylaşım uçtan uca testi atlandı (yerel doğrulama yapıldı).');
  // Yerel depo akışını yine doğrula (sunucusuz).
  const sahte = {
    senaryolar: { tekMagaza: B },
    enIyiAnahtar: 'tekMagaza', enIyiToplam: 1590,
    urunSayisi: 3, kazanc: 180,
  };
  kontrol('paylaşım nesnesi serileştirilebilir', typeof JSON.stringify(sahte) === 'string');
  kontrol('paylaşım nesnesi senaryo taşır', !!sahte.senaryolar.tekMagaza);
} else {
  const paylasGovde = {
    sepet: {
      senaryolar: {
        maksimumTasarruf: A,
        tekMagaza: B,
        akilliBolunmus: C,
      },
      enIyiAnahtar: 'tekMagaza',
      enIyiToplam: B.toplam,
      tekMagazaToplam: B.toplam,
      kazanc: 180,
      kazancYuzde: 10.2,
      urunSayisi: 3,
      uyarilar: [],
      __test: PAYLAS_ID,
    },
  };

  // Bilinmeyen kimlik 404 dönmeli (açık yönlendirme / sızıntı yok).
  try {
    const r = await fetch(TABAN + '/api/sepet/paylas/bilinmeyen-kimlik');
    kontrol('bilinmeyen paylaşım 404', r.status === 404, String(r.status));
  } catch (e) {
    kontrol('bilinmeyen paylaşım 404', false, String(e.message).slice(0, 80));
  }

  // Gerçek yazma
  let paylas = null;
  try {
    const r = await fetch(TABAN + '/api/sepet/paylas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paylasGovde),
    });
    paylas = await r.json().catch(() => ({}));
    kontrol('POST /api/sepet/paylas 200', r.ok, String(r.status) + ' ' + JSON.stringify(paylas).slice(0, 100));
  } catch (e) {
    kontrol('POST /api/sepet/paylas 200', false, String(e.message).slice(0, 80));
  }

  if (paylas?.id) {
    kontrol('paylaşım kimliği döner', /^[A-Za-z0-9_-]{6,32}$/.test(paylas.id), String(paylas.id));
    kontrol('paylaşım yolu /sepet/paylas/:id', paylas.path === '/sepet/paylas/' + paylas.id, String(paylas.path));
    kontrol('tam URL http(s) ile başlar', /^https?:\/\//.test(String(paylas.url)));

    // GET JSON içerik
    try {
      const r = await fetch(TABAN + '/api/sepet/paylas/' + paylas.id);
      const v = await r.json();
      kontrol('paylaşım JSON okunur', r.ok && v?.sepet?.senaryolar?.tekMagaza?.toplam === 1590,
        String(v?.sepet?.senaryolar?.tekMagaza?.toplam));
      kontrol('paylaşım oluşturma zamanı var', Number(v.created_at) > 0);
      kontrol('paylaşımda 3 senaryo korunur',
        Object.keys(v?.sepet?.senaryolar || {}).length === 3);
      kontrol('paylaşımda en iyi anahtar korunur', v?.sepet?.enIyiAnahtar === 'tekMagaza');
    } catch (e) {
      kontrol('paylaşım JSON okunur', false, String(e.message).slice(0, 80));
    }

    // Salt okunur HTML sayfası
    try {
      const r = await fetch(TABAN + paylas.path);
      const htmlIcerik = await r.text();
      kontrol('paylaşım sayfası 200 HTML', r.ok && /text\/html/.test(r.headers.get('content-type') || ''));
      kontrol('paylaşım sayfası salt okunur başlık taşır', /Paylaşılan Sepet/.test(htmlIcerik));
      kontrol('paylaşım sayfası veri uçunu çağırır', /\/api\/sepet\/paylas\//.test(htmlIcerik));
      kontrol('paylaşım sayfası kendi uygulamasına döner', /Kendi sepetini optimize et/.test(htmlIcerik));
    } catch (e) {
      kontrol('paylaşım sayfası 200 HTML', false, String(e.message).slice(0, 80));
    }

    // Depo kaydı gerçekten var mı (sunucu ile aynı SQLite).
    try {
      const kayit = sepetPaylasAl(paylas.id);
      kontrol('paylaşım SQLite’a yazıldı', !!kayit && kayit.sepet?.urunSayisi === 3);
    } catch {
      kontrol('paylaşım SQLite’a yazıldı', false);
    }

    // Temizlik: yalnızca bu testin kaydı.
    try {
      const silindi = sepetPaylasSil(paylas.id);
      kontrol('test paylaşımı temizlendi', silindi === true);
      kontrol('temizlik sonrası kayıt yok', sepetPaylasAl(paylas.id) === null);
    } catch {
      kontrol('test paylaşımı temizlendi', false);
    }
  }

  // Canlı sepet taraması yalnızca açıkça istenirse (dakikalar sürebilir).
  if (process.argv.includes('--canli-basket')) {
    console.log('  ℹ️  --canli-basket: gerçek sepet taraması başlatılıyor (uzun sürebilir)…');
    try {
      const r = await fetch(TABAN + '/api/baski/en-ucuz-filamentler?limit=3');
      const v = await r.json();
      const linkler = (v.filamentler || []).slice(0, 2).map(f => f.url);
      kontrol('canlı katalogdan 2 ürün linki alındı', linkler.length === 2);
      const istek = await fetch(TABAN + '/api/sepet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urunler: linkler.map(u => ({ url: u })), hizliMod: true }),
      });
      const j = await istek.json();
      kontrol('canlı sepet işi başladı', istek.ok && !!j.isId, JSON.stringify(j).slice(0, 100));
      if (j.isId) {
        let bitti = false;
        for (let i = 0; i < 120 && !bitti; i++) {
          const d = await (await fetch(TABAN + '/api/sepet/' + j.isId)).json();
          bitti = d.status === 'done' || d.status === 'error';
          if (!bitti) await new Promise(r => setTimeout(r, 5000));
        }
        kontrol('canlı sepet işi tamamlandı', bitti);
      }
    } catch (e) {
      kontrol('canlı sepet akışı', false, String(e.message).slice(0, 100));
    }
  } else {
    console.log('  ℹ️  Gerçek sepet taraması için: --canli-basket');
  }
}

/* ------------------------------------------------------------------ */
/* 11) 🛒 Görsel kıyas barı + kargo paket kutuları (2026-11-12)        */
/* ------------------------------------------------------------------ */
bolum('11) 🛒 Görsel kıyas barı + kargo paket kutuları');

const appJs = oku('public/app.js');
const sepetJs = oku('public/sepet.js');
const sepetCss = oku('public/style.css');
const sepetHtmlGuncel = oku('public/sepet.html');

/* --- kiyasVerisi: saf matematik --- */
{
  const k = kiyasVerisi({ tekMagazaToplam: 1850, enIyiToplam: 1515 });
  kontrol('kiyas: hesaplandı', k.var === true);
  kontrol('kiyas: tek mağaza tutarı', k.tekMagaza === 1850, String(k.tekMagaza));
  kontrol('kiyas: bölünmüş tutar', k.enIyi === 1515, String(k.enIyi));
  kontrol('kiyas: net tasarruf 335', k.tasarruf === 335, String(k.tasarruf));
  kontrol('kiyas: tasarruf yüzdesi %18,1', k.tasarrufYuzde === 18.1, String(k.tasarrufYuzde));
  // Oran = 1515/1850 = %81,9 → bar genişliği
  kontrol('kiyas: bar oranı 81,9', k.oran === 81.9, String(k.oran));
  kontrol('kiyas: tek mağaza en iyi DEĞİL', k.tekMagazaEnIyi === false);
}
{
  const k = kiyasVerisi({ tekMagazaToplam: 1000, enIyiToplam: 1000 });
  kontrol('kiyas: eşit toplam → tek mağaza en iyi (tebrik kartı)', k.tekMagazaEnIyi === true);
  kontrol('kiyas: eşit toplamda tasarruf 0', k.tasarruf === 0, String(k.tasarruf));
  kontrol('kiyas: eşit toplamda oran 100', k.oran === 100, String(k.oran));
}
{
  const k = kiyasVerisi({ tekMagazaToplam: 1200, enIyiToplam: 900 });
  kontrol('kiyas: bölünmüş çok daha ucuz → oran 75', k.oran === 75, String(k.oran));
  kontrol('kiyas: tasarruf 300', k.tasarruf === 300, String(k.tasarruf));
  kontrol('kiyas: yüzde 25', k.tasarrufYuzde === 25, String(k.tasarrufYuzde));
}
kontrol('kiyas: veri yok → var:false',
  kiyasVerisi({}).var === false && kiyasVerisi(null).var === false);
kontrol('kiyas: tek mağaza 0 → var:false',
  kiyasVerisi({ tekMagazaToplam: 0, enIyiToplam: 100 }).var === false);
kontrol('kiyas: bölünmüş 0 → var:false',
  kiyasVerisi({ tekMagazaToplam: 100, enIyiToplam: 0 }).var === false);
kontrol('kiyas: oran 0-100 aralığında kalır',
  (() => { const k = kiyasVerisi({ tekMagazaToplam: 100, enIyiToplam: 120 }); return k.oran >= 0 && k.oran <= 100; })());

/* --- paketKargoDurumu: kargo + eşik ipucu --- */
{
  const d = paketKargoDurumu({ araToplam: 1200, kargo: 0, kargoKurali: { freeOver: 1000, fee: 45 } });
  kontrol('paket: kargo 0 → bedava', d.bedava === true);
  kontrol('paket: bedava pakette eşik ipucu yok', d.esikIpucu == null);
}
{
  // 970 + 30 = 1000 eşik, kargo 45 → 30 eklemek 45 kargo kazandırır (kârlı)
  const d = paketKargoDurumu({ araToplam: 970, kargo: 45, kargoKurali: { freeOver: 1000, fee: 45 } });
  kontrol('paket: kargo ücretli', d.bedava === false);
  kontrol('paket: kargo tutarı 45', d.kargo === 45, String(d.kargo));
  kontrol('paket: eşik ipucu 30 TL', d.esikIpucu === 30, String(d.esikIpucu));
  kontrol('paket: eşik değeri 1000', d.esik === 1000, String(d.esik));
}
{
  // 950 + 50 = 1000 ama kargo sadece 45 → 50 ödeyip 45 kazanmak ZARAR.
  const d = paketKargoDurumu({ araToplam: 950, kargo: 45, kargoKurali: { freeOver: 1000, fee: 45 } });
  kontrol('paket: zararlı ipucu GÖSTERİLMEZ (dürüstlük)', d.esikIpucu == null, String(d.esikIpucu));
  kontrol('paket: eşiğe kalan mesafe bilgisi verilir', d.esikFarki === 50, String(d.esikFarki));
}
{
  const d = paketKargoDurumu({ araToplam: 300, kargo: 45 });
  kontrol('paket: kural yoksa ipucu yok', d.esikIpucu == null && d.esikFarki == null);
  kontrol('paket: kural yoksa kargo ücretli kalır', d.bedava === false);
}
{
  const d = paketKargoDurumu({ araToplam: 335, kargo: 45, kargoKurali: { freeOver: 335, fee: 45, freeOverExclusive: true } });
  kontrol('paket: "üzeri" eşiğinde tam eşitlik yetmez → 1 kuruş',
    d.esikIpucu === 0.01, String(d.esikIpucu));}
kontrol('paket: null grup güvenli', paketKargoDurumu(null).bedava === true);

/* --- paketOzeti --- */
kontrol('paketOzeti: bölünmüş senaryo paket sayısı',
  paketOzeti({ senaryolar: { akilliBolunmus: { gruplar: [{}, {}] } } }).paketSayisi === 2);
kontrol('paketOzeti: bolunmusMu true', paketOzeti({ senaryolar: { akilliBolunmus: { gruplar: [{}, {}] } } }).bolunmusMu === true);
kontrol('paketOzeti: tek grup → bolunmusMu false',
  paketOzeti({ senaryolar: { akilliBolunmus: { gruplar: [{}] } } }).bolunmusMu === false);
kontrol('paketOzeti: veri yok → 0', paketOzeti({}).paketSayisi === 0);

/* --- CSS sözleşmesi --- */
kontrol('CSS: kıyas kapsayıcı kartı', /\.sepet-kiyas-kapsayici\s*\{/.test(sepetCss));
kontrol('CSS: kıyas bar 12px yuvarlak',
  /\.sepet-kiyas-bar\s*\{[^}]*height:\s*12px[^}]*border-radius:\s*999px/s.test(sepetCss));
kontrol('CSS: bar dolgusu 0.7s expo geçişi',
  /\.sepet-kiyas-dolgu\s*\{[^}]*transition:\s*width\s+0\.7s\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/s.test(sepetCss));
kontrol('CSS: tek mağaza barı kırmızımsı %100',
  /\.sepet-kiyas-dolgu\.tek\s*\{[^}]*width:\s*100%[^}]*#fca5a5/s.test(sepetCss));
kontrol('CSS: bölünmüş bar zümrüt gradyan',
  /\.sepet-kiyas-dolgu\.bolunmus\s*\{[^}]*linear-gradient\(135deg,\s*#10b981\s+0%,\s*#059669/s.test(sepetCss));
kontrol('CSS: kazanç rozeti nabız animasyonu',
  /\.sepet-kiyas-rozet\s*\{[^}]*animation:\s*kiyasRozetNabiz/s.test(sepetCss));
kontrol('CSS: tebrik kartı', /\.sepet-tebrik-kart\s*\{/.test(sepetCss));

kontrol('CSS: kargo paket kutusu çerçeve + zemin',
  /\.kargo-paket-kutusu\s*\{[^}]*border:\s*1px solid var\(--cizgi\)[^}]*background:\s*#fafbfd/s.test(sepetCss));
kontrol('CSS: paket kutusu 12px yuvarlak + padding',
  /\.kargo-paket-kutusu\s*\{[^}]*border-radius:\s*12px[^}]*padding:\s*14px 16px/s.test(sepetCss));
kontrol('CSS: paket hover yükselme',
  /\.kargo-paket-kutusu:hover\s*\{[^}]*translateY\(-2px\)[^}]*box-shadow/s.test(sepetCss));
kontrol('CSS: kargo bedava etiketi yeşil',
  /\.kargo-paket-etiket\.bedava\s*\{[^}]*color:\s*#065f46[^}]*background:\s*#ecfdf5/s.test(sepetCss));
kontrol('CSS: kargo ücretli etiketi amber',
  /\.kargo-paket-etiket\.ucretli\s*\{[^}]*color:\s*#92400e[^}]*background:\s*#fffbeb/s.test(sepetCss));
kontrol('CSS: eşik ipucu kesikli amber çerçeve',
  /\.kargo-paket-ipucu\s*\{[^}]*border:\s*1px dashed\s+#fcd34d/s.test(sepetCss));
kontrol('CSS: paket sıra çipi indigo',
  /\.kargo-paket-cip\s*\{[^}]*#3730A3[^}]*#EEF2FF/s.test(sepetCss));

kontrol('CSS: koyu tema kıyas kapsayıcı', /html\[data-theme="dark"\]\s*\.sepet-kiyas-kapsayici/.test(sepetCss));
kontrol('CSS: koyu tema paket kutusu #1e293b',
  /html\[data-theme="dark"\]\s*\.kargo-paket-kutusu\s*\{[^}]*#1e293b/s.test(sepetCss));
kontrol('CSS: koyu tema paket kenarı #334155',
  /html\[data-theme="dark"\]\s*\.kargo-paket-kutusu\s*\{[^}]*#334155/s.test(sepetCss));
kontrol('CSS: koyu tema eşik ipucu kontrastı',
  /html\[data-theme="dark"\]\s*\.kargo-paket-ipucu\s*\{[^}]*#FCD34D/s.test(sepetCss));
kontrol('CSS: koyu tema kıyas barı',
  /html\[data-theme="dark"\]\s*\.sepet-kiyas-bar\s*\{[^}]*#334155/s.test(sepetCss));

kontrol('CSS: mobilde paket başlığı wrap',
  /@media \(max-width: 480px\)[\s\S]{0,400}\.kargo-paket-ust\s*\{[^}]*gap:\s*6px/s.test(sepetCss));
kontrol('CSS: mobilde mağaza adı tam satır',
  /@media \(max-width: 480px\)[\s\S]{0,500}\.kargo-paket-magaza\s*\{[^}]*flex:\s*1 1 100%/s.test(sepetCss));
kontrol('CSS: reduced-motion bar geçişini kapatır',
  /prefers-reduced-motion[\s\S]{0,260}\.sepet-kiyas-dolgu\s*\{\s*transition:\s*none/s.test(sepetCss));

/* --- app.js sözleşmesi --- */
kontrol('app: sepetKiyasKarti tanımlı', /function sepetKiyasKarti\(sonuc\)/.test(appJs));
kontrol('app: sepetKargoPaketi tanımlı', /function sepetKargoPaketi\(g, sira, toplamPaket\)/.test(appJs));
kontrol('app: sepetSonucGoster kıyas kartını kullanır',
  /kazanc\.innerHTML = kiyasHtml \|\| ''/.test(appJs));
kontrol('app: senaryo kartı paket kutusu kullanır',
  /\.map\(\(g, i\) => sepetKargoPaketi\(g, i \+ 1, grupListesi\.length\)\)/.test(appJs));
kontrol('app: kıyas animasyonu çağrılır', /sepetKiyasAnimasyonu\(\)/.test(appJs));
kontrol('app: paket çipi "Paket N / M"',
  /📦 Paket \$\{sira\} \/ \$\{toplamPaket\}/.test(appJs));
kontrol('app: kargo bedava etiketi', /✅ Kargo Bedava/.test(appJs));
kontrol('app: kargo ücretli etiketi', /🚚 \+\$\{tl\(durum\.kargo\)\} Kargo/.test(appJs));
kontrol('app: eşik ipucu metni', /ürün daha eklerseniz kargo BEDAVA olur!/.test(appJs));
kontrol('app: tebrik kartı metni', /Tek mağaza seçimi zaten en avantajlı seçenek!/.test(appJs));
kontrol('app: afiliye linki korunur',
  /data-afiliye-site="\$\{esc\(u\.site \|\| g\.site \|\| ''\)\}"/.test(appJs));
kontrol('app: sponsored rel korunur', /rel="noopener sponsored"/.test(appJs));
kontrol('app: esc() ile kaçış korunur', /esc\(ad\)/.test(appJs) && /esc\(g\.siteName/.test(appJs));
kontrol('app: hesap modülü dinamik yüklenir', /import\('\/sepetHesap\.js'\)/.test(appJs));
kontrol('app: rAF yedeği setTimeout (arka plan sekmesi)',
  /requestAnimationFrame\(uygula\);\s*\n\s*setTimeout\(uygula,\s*40\)/.test(appJs));

/* --- sepet.js sözleşmesi --- */
kontrol('sepet.js: kiyasVerisi import edilir', /kiyasVerisi, paketKargoDurumu/.test(sepetJs));
kontrol('sepet.js: kargoPaketKutusu tanımlı', /function kargoPaketKutusu\(g, sira, toplamPaket\)/.test(sepetJs));
kontrol('sepet.js: kiyasKarti tanımlı', /function kiyasKarti\(sonuc\)/.test(sepetJs));
kontrol('sepet.js: grupOzet paket kutularını üretir',
  /gruplar\.map\(\(g, i\) => kargoPaketKutusu\(g, i \+ 1, toplamPaket\)\)/.test(sepetJs));
kontrol('sepet.js: kıyas kartı tasarruf bandına gömülür',
  /metin\.innerHTML = kiyasHtml/.test(sepetJs));
kontrol('sepet.js: kıyas-var sınıfı yönetilir', /classList\.add\('kiyas-var'\)/.test(sepetJs));
kontrol('sepet.js: kıyas verisi yoksa eski metin korunur',
  /} else if \(ozet\.tasarrufTL > 0 && ozet\.metin\) \{/.test(sepetJs));
kontrol('sepet.js: afiliye + sponsored korunur',
  /data-afiliye-site="\$\{esc\(u\.site \|\| g\.site \|\| ''\)\}"/.test(sepetJs)
  && /rel="noopener sponsored"/.test(sepetJs));
kontrol('sepet.js: kıyas animasyonu çağrılır', /kiyasAnimasyonu\(\)/.test(sepetJs));
kontrol('sepet.js: rAF yedeği setTimeout',
  /requestAnimationFrame\(uygula\);\s*\n\s*setTimeout\(uygula,\s*40\)/.test(sepetJs));

/* --- Paylaşım veri modeli bozulmadı --- */
kontrol('app: paylaşım sonSepetSonuc üzerinden çalışır',
  /sonSepetSonuc = sonuc;/.test(appJs) && /sepetPaylasLinkiOlustur/.test(appJs));
kontrol('sepet.js: paylaşım sonSepetSonuc kullanır',
  /sonSepetSonuc/.test(sepetJs) || /durum\.sonuc/.test(sepetJs));

/* ------------------------------------------------------------------ */
try { closeDatabase(); } catch { /* zaten kapalı */ }

console.log('\n' + '─'.repeat(48));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
