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

console.log(`SORGU-ESLESME ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
