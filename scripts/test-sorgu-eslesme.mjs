/**
 * Sorgu kurma + ürün eşleştirme regresyonu (kredi harcamaz, ağa çıkmaz).
 *   node scripts/test-sorgu-eslesme.mjs
 *
 * 2026-10-25 vakası: robitshop'taki "Esun Açık Gri PLA Basic Filament 1.75mm 1kg"
 * için karşılaştırma yalnız 3 site buluyordu. Kök nedenler:
 *   1) Sorgu "esun açık" oluyordu (renk tonu 'açık' renk sayılmıyordu)
 *   2) Kaynak marka okunamayınca (null) yüksek benzerlikli ürünler eleniyordu
 *   3) Pazaryeri "marka" alanı satıcı adı/ürün türü ("PLA") olabiliyordu
 *   4) "1.75mm"/"1.75 mm" ve "1kg"/"1000gr" farklı token üretiyordu
 */
import { buildQueries } from '../src/pipeline.js';
import { matchProducts, titleSimilarity, sameColor } from '../src/util.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul) {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}`);
}

// ---- 1) Sorgu kurma ----
const vaka = { title: 'Esun Açık Gri PLA Basic Filament 1.75mm 1kg', brand: 'Esun', modelCode: 'ESUN-BASIC-ACIKGRI', color: 'gri' };
const qs = buildQueries(vaka);
kontrol('renk tonu sorguya sızmaz ("esun açık" üretilmez)', !qs.some(q => /\baçık\b|\bacik\b/i.test(q)));
kontrol('ürün çizgisi sorguda ("pla basic" geçer)', qs.some(q => /pla basic/i.test(q)));
kontrol('renkli dar sorgu yedek olarak var', qs.some(q => /gri/i.test(q)));
kontrol('"matte" serisi ton sayılmaz', buildQueries({ title: 'Bambu Lab PLA Matte Kırmızı Filament 1kg', brand: 'Bambu Lab', color: 'kırmızı' })
  .some(q => /matte/i.test(q)));
kontrol('marka sorgusu yedek olarak var', qs.some(q => /^esun$/i.test(q)));

// ---- 2) Token normalizasyonu ----
const esit = (a, b) => titleSimilarity(a, b, null, null, { stripColors: true }) === 1;
kontrol('"1.75mm" = "1.75 mm"', esit('Esun PLA 1.75mm 1kg', 'Esun PLA 1.75 mm 1 kg'));
kontrol('"1kg" = "1000gr"', esit('Esun PLA 1.75mm 1kg', 'Esun PLA 1.75mm 1000gr'));

// ---- 3) Eşleştirme ----
const src = { title: 'Esun Açık Gri PLA Basic Filament 1.75mm 1kg', brand: 'Esun', modelCode: 'ESUN-BASIC-ACIKGRI', color: 'gri' };
const m = (title, brand) => matchProducts(src, { title, brand, modelCode: null, barcode: null, color: null });

// Aynı ürün — bulunması GEREKENLER (kullanıcının bildirdiği ürünler)
kontrol('SAMM: Esun PLA Basic Açık Gri', !!m('Esun PLA Basic Açık Gri Filament 1.75mm 1 KG', 'Esun'));
kontrol('pttavm: satıcı adı marka sanılsa da bulunur', !!m('Esun Basic Pla Açık gri Filament 1.75mm 1kg - Kolay Baskı', 'Urhanshop'));
kontrol('makerfabrika: 1000gr yazımı', !!m('Esun PLA Basic Filament Açık Gri 1.75 mm 1000gr', 'eSun'));
kontrol('pusula3d: marka sonda', !!m('Açık Gri PLA Filament 1.75 mm 1 kg - eSUN PLA Basic', 'Esun'));
kontrol('amazon: marka alanı "PLA"', !!m('PLA Basic Açık Gri Filament 1,75mm 1kg - bisiparisver', 'PLA'));

// Farklı ürün — ELENMESİ GEREKENLER (yanlış pozitif koruması)
kontrol('PolyTerra farklı ürün', !m('PolyTerra PLA Filament Fosil Gri - 1 kg 1.75mm', null));
kontrol('Panchroma farklı ürün', !m('Panchroma PLA Filament Saten Gri - 1 kg 1.75mm', null));
kontrol('PLA+ HS farklı ürün çizgisi', !m('eSUN PLA + HS Filament (Grey) GRİ', null));
kontrol('Bambu LAB farklı marka', !m('Bambu Lab PLA Matte Grass Green Filament 1kg', 'Bambu Lab'));
kontrol('telefon eşleşmez', !m('Apple iPhone 17 Pro Max 256 GB Cep Telefonu', 'Apple'));

// Aynı ürün, FARKLI renk → eşleşir ama renk işaretlenir
const beton = matchProducts(src, { title: 'Esun PLA Basic Beton Gri Filament 1.75mm 1 KG', brand: 'Esun', modelCode: null, barcode: null, color: 'gri' });
kontrol('farklı ton aynı ürün sayılır', !!beton);
kontrol('ton farkı renk uyuşmazlığı olarak işaretlenir', sameColor('açık gri', 'beton gri') === false);

/* ---------------------------------------------------------------- */
/* 2026-11-04: MODEL KİMLİĞİ HATASI (Kobra 2 Neo → Kobra 4)           */
/* ---------------------------------------------------------------- */
// Kullanıcı bildirimi: radar "Anycubic Kobra 2 Neo" için ₺17.000 gösterdi,
// "Mağazaya git" Hepsiburada'daki **Anycubic Kobra 4** ilanına gidiyordu.
// Kök neden zinciri:
//   1) Kaynak arama "Kobra 2 Neo" yerine Trendyol'daki "Kobra X" ilanını seçti
//      (kelime örtüşmesi: anycubic/kobra/3d/yazıcı).
//   2) Kaynak "Kobra X" olunca "Kobra 4" adayı eşleşti (ikisinde de model
//      numarası yok; "kobra" ortak kelimesi yetiyordu).
//   3) Radar kartı katalog adını değil eşleşen ilanın başlığını gösterdi.
// Düzeltme: modelSerisi artık tek harfli soneki ("Kobra X", "iPhone X") model
// göstergesi sayar; kaynak arama ve teklif filtresi bunu zorunlu uygular.
const mk = (t) => ({ title: t, brand: null, modelCode: null, barcode: null, color: null });
const kobRet = (a, b) => !matchProducts(mk(a), mk(b));

kontrol('Kobra 2 Neo ≠ Kobra X (kaynak arama hatası)',
  kobRet('Anycubic Kobra 2 Neo 3D Yazıcı', 'Anycubic Kobra X 3D Yazıcı'));
kontrol('Kobra 2 Neo ≠ Kobra 4 (kullanıcı bildirimi)',
  kobRet('Anycubic Kobra 2 Neo 3D Yazıcı', 'Anycubic Kobra 4 3D Yazıcı'));
kontrol('Kobra 2 Neo ≠ Kobra 3 Combo',
  kobRet('Anycubic Kobra 2 Neo', 'Anycubic Kobra 3 Combo 3D Yazıcı'));
kontrol('iPhone X ≠ iPhone 11', kobRet('iPhone X', 'iPhone 11'));
kontrol('P1S ≠ P1P', kobRet('Bambu Lab P1S', 'Bambu Lab P1P'));

kontrol('Kobra 2 Neo = Kobra 2 Neo (aynı ürün)',
  !!matchProducts(mk('Anycubic Kobra 2 Neo'), mk('Anycubic Kobra 2 Neo 3D Yazıcı (2025)')));
kontrol('Kobra X = Kobra X (aynı ürün)',
  !!matchProducts(mk('Anycubic Kobra X'), mk('Anycubic Kobra x 3D Yazıcı')));
kontrol('Ender 3 V3 KE = Ender-3 V3 KE', !!matchProducts(
  mk('Creality Ender 3 V3 KE'), mk('Creality Ender-3 V3 KE 3D Yazıcı')));
kontrol('P1S = P1S Combo', !!matchProducts(
  mk('Bambu Lab P1S'), mk('Bambu Lab P1S Combo 3D Yazıcı')));

// Kaynak arama puanı: yanlış model adayı hiç puan almamalı.
const { sorguPuanla } = await import('../src/urunArama.js');
kontrol('kaynak aramada Kobra 4 puan almaz',
  sorguPuanla('Anycubic Kobra 4 3D Yazıcı', 'Anycubic Kobra 2 Neo 3D Yazıcı') === 0);
kontrol('kaynak aramada Kobra X puan almaz',
  sorguPuanla('Anycubic Kobra X 3D Yazıcı', 'Anycubic Kobra 2 Neo 3D Yazıcı') === 0);
kontrol('kaynak aramada doğru ürün puan alır',
  sorguPuanla('Anycubic Kobra 2 Neo 3D Yazıcı', 'Anycubic Kobra 2 Neo 3D Yazıcı') >= 0.35);

// Teklif filtresi: kaynak yanlış çözülse bile yanlış model satın aldırılmaz.
const { teklifKategoriyeUygunMu, stokluTeklifler, kaynakYokDurumu } =
  await import('../src/otonomRadar.js');
const teklif = (title, fiyat) => ({
  status: 'found', site: 'hepsiburada', siteName: 'Hepsiburada',
  product: { title, sellingPrice: fiyat, pricing: { toplam: fiyat }, inStock: true, url: 'https://x' },
});
kontrol('teklif filtresi Kobra 4 ilanını eler',
  teklifKategoriyeUygunMu(teklif('Anycubic Kobra 4 3D Yazıcı', 17000),
    { ad: 'Anycubic Kobra 2 Neo', kategori: 'yazici' }) === false);
const stokluKobra = stokluTeklifler({
  sonuclar: [
    teklif('Anycubic Kobra 4 3D Yazıcı', 17000),
    teklif('Anycubic Kobra 2 Neo 3D Yazıcı', 17998),
  ],
}, { ad: 'Anycubic Kobra 2 Neo', kategori: 'yazici' });
kontrol('stoklu listede yalnızca doğru model kalır',
  stokluKobra.length === 1 && /Kobra 2 Neo/.test(stokluKobra[0].product.title),
  stokluKobra.map(x => x.product.title).join(' | '));

// Kaynak bulunamazsa eski (hatalı) durum kaydı temizlenmeli.
const bos = kaynakYokDurumu({ id: 12, ad: 'Anycubic Kobra 2 Neo', kategori: 'yazici' });
kontrol('kaynak yok durumu stokta değil', bos.stokta === false);
kontrol('kaynak yok durumu link taşımaz', bos.hamUrl === null && bos.afiliyeUrl === null);
kontrol('kaynak yok durumu katalog kimliğini korur', bos.katalogId === 12 && bos.anahtar === 'katalog:12');
kontrol('kaynak yok durumu işaretli', bos.kaynakYok === true);

/* ---------------------------------------------------------------- */
/* 2026-11-04: MALZEME ALT HATLARI (PLA-CF / PLA+HS)                  */
/* ---------------------------------------------------------------- */
// Borsada kaynak arama yanlış ürün hattını seçiyordu:
//   "Porima PLA Filament Siyah 1kg" → "Porima **PLA-CF**" (karbon fiber, 2 kat fiyat)
//   "eSun PLA+ Beyaz 1kg"           → "eSun **PLA+HS**" (High Speed)
// Tokenizer "PLA+HS"i "plaplushs", "PLA-CF"i "pla cf" yaptığı için kelime
// sözlüğü yetmiyordu; malzeme tabanlı ekler artık ayrıca yakalanıyor.
const { hatCakismasi } = await import('../src/util.js');

kontrol('PLA ≠ PLA-CF (karbon fiber)', hatCakismasi(
  'Porima PLA Filament Siyah 1kg', 'Porima Pla-Cf 1.75MM Siyah Filament 1 kg'));
kontrol('PLA+ ≠ PLA+HS (high speed)', hatCakismasi(
  'eSun PLA+ Beyaz 1kg', 'eSun Beyaz PLA+HS Filament 1.75mm 1Kg'));
kontrol('PLA+ = PLA+ 2.0 (aynı hat, yeni sürüm)', !hatCakismasi(
  'Sunlu PLA+ Filament 1kg', 'Sunlu Pla+ 2.0 Filament Bej - 1kg'));
kontrol('ePLA-HS = ePLA-HS', !hatCakismasi(
  'eSun ePLA-HS (High Speed) PLA Siyah 1kg', 'eSun ePLA-HS PLA Siyah 1kg'));
kontrol('düz PLA = düz PLA', !hatCakismasi(
  'Porima PLA Filament Siyah 1kg', 'Porima PLA Filament - Siyah RAL9005 / 1.75mm / 1kg'));

kontrol('PLA+ ≠ düz PLA', hatCakismasi(
  'Sunlu PLA+ Filament 1kg', 'SUNLU PLA Filament Nane Yeşili 1.75mm 1kg'));
kontrol('PLA+ = PLA Plus (aynı yazım)', !hatCakismasi(
  'Sunlu PLA+ Filament 1kg', 'Sunlu PLA Plus Filament 1kg'));
kontrol('PLA+HS yazımı da HS sayılır', hatCakismasi(
  'eSun PLA+ Beyaz 1kg', 'eSun Beyaz PLA+HS Filament 1.75mm 1Kg'));
kontrol('ePLA-HS ≠ ePLA', hatCakismasi(
  'eSun ePLA-HS (High Speed) PLA Siyah 1kg', 'eSun ePLA PLA Siyah 1kg'));
kontrol('"High Speed" = HS', !hatCakismasi(
  'eSun ePLA-HS (High Speed) PLA Siyah 1kg', 'eSun ePLA HS PLA Siyah 1kg'));

/* ---------------------------------------------------------------- */
/* 2026-11-04: KAYNAK ARAMA marka/renk doğrulaması                    */
/* ---------------------------------------------------------------- */
// Kaynak arama yalnızca kelime örtüşmesine bakıyordu: "Sunlu PLA+ Filament"
// sorgusunda "Solid Hyper PLA+ Nane Yeşili" (farklı marka + farklı renk)
// kaynak seçilip borsada Sunlu gibi ₺674'e gösterildi.
const { kaynakEslesirMi } = await import('../src/urunArama.js');
const aday = (title, brand = null) => ({ title, brand });

kontrol('farklı marka kaynak olamaz', !kaynakEslesirMi(
  'Sunlu PLA+ Filament 1kg', aday('Solid Hyper PLA+ Nane Yeşili Filament 1.75mm - 1Kg', 'Solid')));
kontrol('farklı renk kaynak olamaz', !kaynakEslesirMi(
  'eSun PLA+ Beyaz 1kg', aday('eSun PLA+ Kırmızı Filament 1.75mm 1kg', 'eSun')));
kontrol('aynı marka+renk kabul', kaynakEslesirMi(
  'eSun PLA+ Beyaz 1kg', aday('eSun PLA+ Beyaz Filament 1.75mm 1kg', 'eSun')));
kontrol('satıcı adı marka alanında olsa da başlık kanıtı yeter', kaynakEslesirMi(
  'eSun PLA+ Beyaz 1kg', aday('Esun PLA+ Beyaz Filament 1.75mm 1kg - Kolay Baskı', 'Urhanshop')));
kontrol('marka alanı boşsa yalnızca renk bakılır', kaynakEslesirMi(
  'Microzey PLA Filament Gri', aday('Microzey Koyu Gri PLA Pro 1.75mm 1kg Filament', null)));
kontrol('renk yoksa marka yeter', kaynakEslesirMi(
  'Bambu Lab P1S 3D Yazıcı', aday('Bambu Lab P1S 3D Yazıcı', 'Bambu Lab')));
kontrol('nesne markası başlıkta geçiyorsa kabul (Apple/iPhone)',
  kaynakEslesirMi('iPhone 15', aday('Apple iPhone 15 128GB', 'Apple')));
kontrol('farklı iyelik ekli renk yakalanır',
  !kaynakEslesirMi('eSun PLA+ Beyaz 1kg', aday('eSun PLA+ Nane Yeşili Filament 1kg', 'eSun')));

/* ---------------------------------------------------------------- */
/* 2026-11-04: MARKA ALANI BOŞKEN BAŞLIKTAN MARKA ÇIKARIMI            */
/* ---------------------------------------------------------------- */
// Trendyol kaynağında brand alanı boş geliyordu; "eSun PLA+ Kemik Beyazı" ile
// "Filamix Kemik Beyazı PLA+" aynı ürün sayıldı (borsada Filamix "en ucuz" oldu).
kontrol('kaynak markası boşsa başlıktan çıkarılır (eSun ≠ Filamix)', !matchProducts(
  mk('eSun Pla+ Filament Kemik Beyazı 1.75mm 1kg'),
  { title: 'Filamix Kemik Beyazı PLA+ Filament 1.75mm 1 Kg', brand: 'Filamix', modelCode: null, barcode: null }));
kontrol('aday markası boşsa da başlıktan çıkarılır', !matchProducts(
  mk('eSun Pla+ Filament Kemik Beyazı 1.75mm 1kg'),
  { title: 'Filamix PLA+ Filament Bone White (Kemik Beyazı)', brand: null, modelCode: null, barcode: null }));
kontrol('anlamsız marka alanı ("PLA") kanıt sayılmaz', !!matchProducts(
  { title: 'Esun Açık Gri PLA Basic Filament 1.75mm 1kg', brand: 'Esun', modelCode: null, barcode: null },
  { title: 'PLA Basic Açık Gri Filament 1,75mm 1kg - bisiparisver', brand: 'PLA', modelCode: null, barcode: null }));
kontrol('RAL renk kodu model serisi sayılmaz', !!matchProducts(
  mk('Porima PLA Filament - Siyah / 1.75mm / 1kg'),
  mk('Porima PLA Filament - Siyah RAL9005 / 1.75mm / 1kg')));

console.log(`SORGU-ESLESME ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
