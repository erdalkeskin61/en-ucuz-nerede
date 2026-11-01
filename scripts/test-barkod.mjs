/**
 * Barkod okuma + raf fiyatı karşılaştırma testi (ağa çıkmaz).
 *   node scripts/test-barkod.mjs [--canli]
 *
 * 2026-10-28: Canlı barkod tarayıcı özelliği. Birim testler doğrulama, kontrol
 * hanesi ve tasarruf hesabını kapsar; --canli gerçek barkodla site taraması yapar.
 *
 * Bu geliştirmede bulunan GERÇEK hata: barkod bulunduğunda sonuç listesine
 * eklenmiyordu (`sonuclar.push` yalnız "bulunamadı" dalındaydı) → 5 site barkodu
 * bulmasına rağmen "hiçbir sitede bulunamadı" deniyordu.
 */
import { barkodDogrula, eanKontrolHaneli, tasarrufHesapla, barkodAra } from '../src/barkod.js';
import { barkodCikarHtml } from '../src/util.js';

let gecen = 0, toplam = 0;
function kontrol(ad, kosul, ek = '') {
  toplam++;
  if (kosul) { gecen++; return; }
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
}

/* ---------------- 1) Barkod doğrulama ---------------- */
kontrol('13 hane geçerli', barkodDogrula('8682008472281').gecerli === true);
kontrol('boşluk/tire temizlenir', barkodDogrula(' 868-2008 472281 ').barkod === '8682008472281');
kontrol('harf reddedilir', barkodDogrula('868abc').gecerli === false);
kontrol('kısa barkod reddedilir', barkodDogrula('1234').gecerli === false);
kontrol('uzun barkod reddedilir', barkodDogrula('123456789012345').gecerli === false);
kontrol('8 hane kabul (EAN-8)', barkodDogrula('96385074').gecerli === true);
kontrol('14 hane kabul (GTIN-14)', barkodDogrula('18682008472281').gecerli === true);

/* ---------------- 2) EAN-13 kontrol hanesi ---------------- */
kontrol('geçerli EAN-13', eanKontrolHaneli('4006381333931') === true);
kontrol('geçersiz EAN-13', eanKontrolHaneli('4006381333932') === false);
kontrol('13 hane değilse null', eanKontrolHaneli('96385074') === null);

/* ---------------- 3) Raf fiyatı / tasarruf ---------------- */
const t1 = tasarrufHesapla({ internetFiyat: 3450, rafFiyat: 4299 });
kontrol('tasarruf farkı 849', t1.fark === 849, String(t1.fark));
kontrol('tasarruf yüzdesi %19,7', t1.yuzde === 19.7, String(t1.yuzde));
kontrol('daha ucuz işareti', t1.dahaUcuz === true);
kontrol('tasarruf metni', /849,00 TL/.test(t1.metin) && /daha ucuz/.test(t1.metin), t1.metin);

const t2 = tasarrufHesapla({ internetFiyat: 5000, rafFiyat: 4000 });
kontrol('raf daha ucuzsa negatif fark', t2.fark === -1000, String(t2.fark));
kontrol('raf avantajı metni', /Raf fiyatı/.test(t2.metin), t2.metin);
kontrol('dahaUcuz false', t2.dahaUcuz === false);

const t3 = tasarrufHesapla({ internetFiyat: 1000, rafFiyat: 1000 });
kontrol('eşit fiyat', t3.fark === 0 && /aynı/.test(t3.metin), t3.metin);

kontrol('eksik veri → hesaplanamaz', tasarrufHesapla({ internetFiyat: null, rafFiyat: 100 }).hesaplanamaz !== false);
kontrol('sıfır fiyat → hesaplanamaz', tasarrufHesapla({ internetFiyat: 0, rafFiyat: 100 }).hesaplanabilir === false);

/* ---------------- 4) HTML'den barkod çıkarma ---------------- */
const ornekler = [
  ['JSON-LD gtin13', '<script>{"gtin13":"8682008472281"}</script>', '8682008472281'],
  ['JSON-LD gtin (sade)', '<script>{"gtin":"8682008472281"}</script>', '8682008472281'],
  ['n11 defaultGtin', '<script>{"defaultGtin":"6974662351883","defaultSkuId":"1"}</script>', '6974662351883'],
  ['barcode alanı', '<script>{"barcode":"8682008472281"}</script>', '8682008472281'],
  ['ean alanı', '<script>{"ean":"8682008472281"}</script>', '8682008472281'],
  ['barkod metni', '<div>Barkod: 8682008472281</div>', '8682008472281'],
];
for (const [ad, html, beklenen] of ornekler) {
  const b = barkodCikarHtml(html);
  kontrol(`barkod çıkarma: ${ad}`, b === beklenen, `bulunan ${b}`);
}
kontrol('barkod yoksa null', barkodCikarHtml('<div>ürün</div>') === null);
// Kontrol hanesi geçersiz barkod (gtin13) atlanmalı
kontrol('geçersiz kontrol haneli barkod atlanır',
  barkodCikarHtml('<script>{"gtin13":"8682008472280"}</script>') === null,
  String(barkodCikarHtml('<script>{"gtin13":"8682008472280"}</script>')));

/* ---------------- 5) Canlı: gerçek barkod taraması ---------------- */
if (!process.argv.includes('--canli')) {
  console.log(`BARKOD ${gecen}/${toplam} (birim)`);
  console.log('  (gerçek barkodla site taraması için: node scripts/test-barkod.mjs --canli)');
  process.exit(gecen === toplam ? 0 : 1);
}

console.log('\n=== CANLI TARAMA ===');
const t0 = Date.now();
const r = await barkodAra('6974662351883', { hizliMod: true });
const sure = Date.now() - t0;
const bulunan = r.sonuclar.filter(s => s.status === 'found');

kontrol('canlı: en az 1 site bulundu', bulunan.length > 0, `${bulunan.length} site`);
kontrol('canlı: en ucuz hesaplandı', r.ozet.enUcuzFiyat != null, String(r.ozet.enUcuzFiyat));
kontrol('canlı: 60 sn altında döndü', sure < 60000, `${(sure / 1000).toFixed(1)} sn`);
kontrol('canlı: bulunanların barkodu doğrulandı', bulunan.every(s => s.barkodDogrulandi === true));
kontrol('canlı: ürün adı var', !!r.urun, String(r.urun));

console.log(`  ${(sure / 1000).toFixed(1)} sn · ${bulunan.length} site bulundu · en ucuz ${r.ozet.enUcuzFiyat} TL (${r.ozet.enUcuzSite})`);
for (const s of bulunan) {
  console.log(`    ${String(s.siteName).padEnd(18)} ${String(s.product.pricing?.toplam).padStart(9)} ${s.barkodDogrulandi ? '✓barkod' : ''}`);
}

console.log(`BARKOD ${gecen}/${toplam}`);
process.exit(gecen === toplam ? 0 : 1);
