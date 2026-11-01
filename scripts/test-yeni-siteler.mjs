/**
 * Yeni 14 sitenin adaptör testi: arama sonucu + ürün fiyatı.
 * Kullanım: node scripts/test-yeni-siteler.mjs
 */
import { adapterById } from '../src/sites/index.js';

const YENI = ['3dmarketim', 'ventatek', 'umr3d', 'fixx3d', 'robocombo', 'mikron3d', 'ileri3d',
  '3dprinterankara', '3dcopycenter', 'antalya3dmarket', 'teknobilsem', 'print3d', 'makerfabrika', 'pusula3d'];

const SORGULAR = ['pla filament', 'filament'];
let sorun = 0;

for (const id of YENI) {
  const a = adapterById(id);
  if (!a) { console.log(`✗ ${id}: kayıtlı değil`); sorun++; continue; }

  let adaylar = [], kullanilanSorgu = null, hata = null;
  for (const q of SORGULAR) {
    try { adaylar = await a.searchProducts(q, { spend: 0 }); } catch (e) { hata = String(e.message || e).slice(0, 80); adaylar = []; }
    if (adaylar.length) { kullanilanSorgu = q; break; }
  }
  const fiyatli = adaylar.filter(x => x.price != null && x.price > 0).length;
  let satir = `${adaylar.length ? '✓' : '✗'} ${id.padEnd(17)} arama: ${String(adaylar.length).padStart(3)} sonuç (${fiyatli} fiyatlı)`;
  if (kullanilanSorgu) satir += ` [${kullanilanSorgu}]`;
  if (!adaylar.length) { console.log(satir + (hata ? ` HATA: ${hata}` : ' — sonuç yok')); sorun++; continue; }

  // Ürün sayfası
  const aday = adaylar.find(x => x.price != null) || adaylar[0];
  try {
    const p = await a.getProduct(new URL(aday.url), { spend: 0 });
    const fiyatOk = p.sellingPrice != null && p.sellingPrice > 0;
    console.log(`${satir}\n      ürün: ${String(p.title).slice(0, 58)}\n      fiyat: ${p.sellingPrice} ${p.currency}${p.listPrice ? ' (liste ' + p.listPrice + ')' : ''} ${fiyatOk ? '✓' : '✗'}`);
    if (!fiyatOk) sorun++;
  } catch (e) {
    console.log(`${satir}\n      ürün HATA: ${String(e.message || e).slice(0, 90)}`);
    sorun++;
  }
}

console.log(`\n${sorun === 0 ? 'TÜM YENİ SİTELER ÇALIŞIYOR ✓' : sorun + ' SORUN VAR'}`);
process.exit(sorun === 0 ? 0 : 1);
