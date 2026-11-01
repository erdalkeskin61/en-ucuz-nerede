/**
 * Birim fiyat (₺/kg · ₺/L) motoru testleri — 2026-10-29
 *
 * Kapsam:
 *  1) Miktar okuma: 1kg / 1 Kg / 1000gr / 800 gr / 0,5 kg / 3Kg / 750Gr / 2.5kg / 500g
 *  2) TUZAKLAR: çap (1.75mm) miktar sanılmaz, model kodu (A2L) elenir, mm+kg birlikte
 *  3) Çoklu paket: "10'lu kutu 1 kg" → 10 kg (işaretli)
 *  4) Hacim: 1L / 500ml → ₺/L; yoğunlukla tahmini ₺/kg
 *  5) Birim fiyat matematiği + Türkçe biçim
 *  6) SAHTE UCUZ: 800 g / 449 TL vs 1 kg / 549 TL → tuzak tespit edilir
 *  7) Eşleştirme koruması: farklı gramaj RED, 1kg=1000gr KABUL, miktarsız engellenmez
 *  8) Dürüstlük: miktar okunamazsa birim fiyat null (uydurma yok)
 *  9) Ön yüz bağlantısı
 */
import {
  miktarCikar, birimFiyat, birimSirala, miktarCakismasi, miktarAyniMi,
  gramMetni, tlKgMetni, yogunlukBul, malzemeBul,
} from '../src/birimFiyat.js';
import { matchProducts } from '../src/util.js';
import fs from 'node:fs';

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

/* ---------- 1) Miktar okuma ---------- */
const gramBeklenen = [
  ['Filamix PLA Glow Mavi Filament 1.75mm 1Kg', 1000],
  ['Kingroon PETG Basic Gümüş Filament 1.75mm 1 Kg', 1000],
  ['Beta ABS+ Filament - 1000 Gr', 1000],
  ['Filamix PLA Glow Mavi Filament 1.75mm 1000gr', 1000],
  ['Beta ABS Plus Gri Filament 1.75mm 800gr', 800],
  ['Robo90 TPU Flex (Esnek) Filament - Bej - 1.75mm - 800 gr', 800],
  ['Innovatefil ABS Medikal Filament - 750 g 1.75mm', 750],
  ['Fiberon PET-CF17 Siyah Filament - 500 gr 1.75mm', 500],
  ['Beta PETG+ Filament 3KG', 3000],
  ['Sunlu PETG Filament Siyah – 3kg 1.75mm', 3000],
  ['Kingroon PLA 0,5 kg 1.75mm', 500],
  ['Kingroon PLA 0.5 kg 1.75mm', 500],
  ['eSUN PLA+ Filament 250g Beyaz', 250],
  ['eSUN PLA+ Filament 2.5 kg Beyaz', 2500],
  ['PETG Filament 1KG', 1000],
];
for (const [baslik, beklenen] of gramBeklenen) {
  const m = miktarCikar(baslik);
  kontrol(`gram: ${baslik.slice(0, 46)} → ${beklenen}`, m.gram === beklenen, `bulunan ${m.gram}`);
}

/* ---------- 2) Tuzaklar ---------- */
// Çap miktar sanılmamalı
const cap = miktarCikar('Filament 1.75mm');
kontrol('çap (1.75mm) miktar sanılmadı', cap.gram == null, String(cap.gram));
const cap2 = miktarCikar('PETG Filament 2.85 mm');
kontrol('çap (2.85 mm) miktar sanılmadı', cap2.gram == null, String(cap2.gram));
// Model kodu içindeki sayı elenmeli
const a2l = miktarCikar('Bambu Lab A2L Combo 3D Yazıcı');
kontrol('model kodu (A2L) miktar sanılmadı', a2l.gram == null && a2l.ml == null);
// mm + kg birlikte: kg seçilmeli
const mmKg = miktarCikar('Creality Ender PLA+ Gri Filament 1.75mm 1Kg');
kontrol('mm + kg → 1000 g seçildi', mmKg.gram === 1000, String(mmKg.gram));
// Ölçü (18x180 mm) miktar değil
const tup = miktarCikar('Deney Tüpü (18x180 mm)');
kontrol('ölçü (18x180 mm) miktar sanılmadı', tup.gram == null && tup.ml == null);

/* ---------- 3) Çoklu paket ---------- */
const paket = miktarCikar("eSUN PLA Basic Filament 10’lu Kutu 1.75 mm 1 kg - 5 Beyaz + 5 Siyah");
kontrol("çoklu paket: 10'lu kutu × 1 kg = 10000 g", paket.gram === 10000, String(paket.gram));
kontrol('çoklu paket işaretlendi', paket.cokluPaket?.adet === 10, JSON.stringify(paket.cokluPaket));
kontrol('çoklu paket güveni "orta"', paket.guven === 'orta', paket.guven);
kontrol('çoklu paket açıklaması var', /Çoklu paket/.test(paket.not || ''), paket.not);

const paket2 = miktarCikar('PLA Filament 2x1kg Beyaz');
kontrol('2x1kg → 2000 g', paket2.gram === 2000, String(paket2.gram));

// "10'lu" tek başına (kutu/paket yok) çarpan sayılmamalı
const yanlisPaket = miktarCikar('PLA Filament 1 kg 10 renk seçenekli');
kontrol('"10 renk" çarpan sanılmadı', yanlisPaket.gram === 1000, String(yanlisPaket.gram));

/* ---------- 4) Hacim (reçine) ---------- */
const resin1 = miktarCikar('Anycubic Standard Resin 1L');
kontrol('1L → 1000 ml', resin1.ml === 1000, String(resin1.ml));
kontrol('1L gram olarak null', resin1.gram == null);
const resin2 = miktarCikar('Elegoo Resin 500ml Gri');
kontrol('500ml → 500 ml', resin2.ml === 500, String(resin2.ml));
kontrol('reçine malzemesi tanındı', resin2.malzeme === 'resin' || resin2.malzeme === 'reçine', String(resin2.malzeme));

// Hacim + ağırlık birlikte → güven düşük (belirsiz)
const karisik = miktarCikar('Resin 1L 1000g');
kontrol('hacim+ağırlık birlikte → güven düşük', karisik.guven === 'dusuk' || karisik.gram != null, karisik.guven);

/* ---------- 5) Birim fiyat matematiği ---------- */
const p1 = birimFiyat({ title: 'PLA Filament 1kg', pricing: { toplam: 549 } });
kontrol('1 kg / 549 TL → 549 ₺/kg', p1.tlKg === 549, String(p1.tlKg));
kontrol('kg değeri 1', p1.kg === 1);

const p2 = birimFiyat({ title: 'PLA Filament 800gr', pricing: { toplam: 449 } });
kontrol('800 g / 449 TL → 561,25 ₺/kg', p2.tlKg === 561.25, String(p2.tlKg));

const p3 = birimFiyat({ title: 'PLA Filament 250g', sellingPrice: 149 });
kontrol('250 g / 149 TL → 596 ₺/kg', p3.tlKg === 596, String(p3.tlKg));
kontrol('selllingPrice kaynağı', p3.fiyatKaynagi === 'sellingPrice', String(p3.fiyatKaynagi));

const p4 = birimFiyat({ title: 'PLA Filament 3kg', pricing: { toplam: 1500 } });
kontrol('3 kg / 1500 TL → 500 ₺/kg', p4.tlKg === 500, String(p4.tlKg));

// Hacim → ₺/L + tahmini ₺/kg
const p5 = birimFiyat({ title: 'Anycubic Resin 1L', pricing: { toplam: 800 } });
kontrol('1 L / 800 TL → 800 ₺/L', p5.tlL === 800, String(p5.tlL));
kontrol('reçine ₺/kg tahmini işaretli', p5.tlKgTahmini === true, String(p5.tlKgTahmini));
kontrol('reçine nominal yoğunluk 1.10', p5.yogunluk === 1.10, String(p5.yogunluk));
kontrol('tahmini ₺/kg = 800/(1×1.10) = 727,27', Math.abs(p5.tlKg - 727.27) < 0.02, String(p5.tlKg));

/* ---------- 6) Dürüstlük: miktar yoksa hesap yok ---------- */
const p6 = birimFiyat({ title: 'Kablosuz Kulaklık', pricing: { toplam: 1000 } });
kontrol('miktar yoksa tlKg null', p6.tlKg === null);
kontrol('miktar yoksa tlL null', p6.tlL === null);
kontrol('miktar yoksa guven "yok"', p6.guven === 'yok', p6.guven);
kontrol('miktar yoksa açıklama var', /bulunamadı/.test(p6.not || ''), p6.not);

const p7 = birimFiyat({ title: 'PLA Filament 1kg 3kg', pricing: { toplam: 500 } });
kontrol('çelişkili miktarda hesap YAPILMAZ', p7.tlKg === null, String(p7.tlKg));
kontrol('çelişki güveni düşük', p7.guven === 'dusuk', p7.guven);

/* ---------- 7) SAHTE UCUZ tespiti (asıl amaç) ---------- */
const liste = [
  { site: 'a', siteName: 'A Mağaza', title: 'PLA Filament 1kg', pricing: { toplam: 549 } },
  { site: 'b', siteName: 'B Mağaza', title: 'PLA Filament 800gr', pricing: { toplam: 449 } },
  { site: 'c', siteName: 'C Mağaza', title: 'PLA Filament 1kg', pricing: { toplam: 599 } },
];
const s = birimSirala(liste);
kontrol('referans gramaj 1000 seçildi', s.referansGram === 1000, String(s.referansGram));
kontrol('1 tuzak tespit edildi (800 g)', s.tuzaklar.length === 1, String(s.tuzaklar.length));
const t = s.tuzaklar[0];
kontrol('tuzak B mağazası', t?.site === 'b', t?.site);
kontrol('tuzak 800 g', t?.gram === 800, String(t?.gram));
kontrol('tuzak birim fiyatı 561,25', t?.tlKg === 561.25, String(t?.tlKg));
kontrol('tuzak açıklaması kilogram karşılaştırması içerir', /Kilogram başına/.test(t?.neden || ''), t?.neden);
kontrol('birim sıralaması: en iyi 549 (A)', s.enIyiKg?.site === 'a', s.enIyiKg?.site);
kontrol('birim sıralaması ₺/kg artan',
  s.sirali.every((x, i) => i === 0 ||
    (x.birim.tlKg ?? Infinity) >= (s.sirali[i - 1].birim.tlKg ?? -Infinity)),
  JSON.stringify(s.sirali.map(x => x.birim.tlKg)));

// Tuzak OLMAMALI: küçük gramaj gerçekten daha ucuzsa
const liste2 = [
  { site: 'a', title: 'PLA 1kg', pricing: { toplam: 600 } },
  { site: 'b', title: 'PLA 500g', pricing: { toplam: 200 } }, // 400 ₺/kg → gerçekten ucuz
];
const s2 = birimSirala(liste2);
kontrol('gerçekten ucuz küçük gramaj tuzak sayılmaz', s2.tuzaklar.length === 0, String(s2.tuzaklar.length));
kontrol('en iyi 500 g (400 ₺/kg)', s2.enIyiKg?.site === 'b', s2.enIyiKg?.site);

// Tuzak: BÜYÜK gramaj (3 kg) işaretlenmez; ama 1 kg, 3 kg'ın yanında "sahte ucuz" olabilir
const liste3 = [
  { site: 'a', title: 'PLA 1kg', pricing: { toplam: 549 } },   // 549 ₺/kg
  { site: 'b', title: 'PLA 3kg', pricing: { toplam: 1500 } },  // 500 ₺/kg
];
const s3 = birimSirala(liste3);
kontrol('büyük gramaj (3 kg) tuzak olarak işaretlenmez',
  !s3.tuzaklar.some(t => t.gram === 3000), JSON.stringify(s3.tuzaklar.map(t => t.gram)));
kontrol('1 kg, 3 kg yanında sahte ucuz sayılır (549 > 500 ₺/kg)',
  s3.tuzaklar.some(t => t.gram === 1000 && t.referansGram === 3000), JSON.stringify(s3.tuzaklar));

// GERÇEK VAKA (2026-10-29 canlı veri, FilamentSan):
// 800 g = 637,80 TL (797,25 ₺/kg) vs 1 kg = 700,20 TL (700,20 ₺/kg)
// 800 g başlıkta daha ucuz, kilogramda %13,9 daha pahalı → tuzak
const gercek = birimSirala([
  { site: 'filamentsan', siteName: 'FilamentSan', title: 'Beta ABS Plus Siyah Filament 1.75mm 1Kg', pricing: { toplam: 700.20 } },
  { site: 'filamentsan', siteName: 'FilamentSan', title: 'Beta ABS Plus Gri Filament 1.75mm 800gr', pricing: { toplam: 637.80 } },
]);
kontrol('gerçek vaka: 800 g sahte ucuz olarak yakalandı', gercek.tuzaklar.length === 1, String(gercek.tuzaklar.length));
kontrol('gerçek vaka: doğru ürün (800 g)', gercek.tuzaklar[0]?.gram === 800, String(gercek.tuzaklar[0]?.gram));
kontrol('gerçek vaka: %13,9 fark', gercek.tuzaklar[0]?.birimFarkYuzde === 13.9, String(gercek.tuzaklar[0]?.birimFarkYuzde));
kontrol('gerçek vaka: referans 1 kg', gercek.tuzaklar[0]?.referansGram === 1000, String(gercek.tuzaklar[0]?.referansGram));
kontrol('gerçek vaka: açıklama iki birim fiyatı da verir',
  /797,25/.test(gercek.tuzaklar[0]?.neden || '') && /700,20/.test(gercek.tuzaklar[0]?.neden || ''),
  gercek.tuzaklar[0]?.neden);

/* ---------- 8) Eşleştirme koruması (sahte ucuzun kaynağı) ---------- */
const ciftler = [
  ['Beta ABS Plus Gri Filament 1.75mm 1Kg', 'Beta ABS Plus Gri Filament 1.75mm 800gr', false, '1kg ↔ 800gr'],
  ['Sunlu PETG Filament Siyah 1kg 1.75mm', 'Sunlu PETG Filament Siyah – 3kg 1.75mm', false, '1kg ↔ 3kg'],
  ['eSUN PLA+ Beyaz Filament 1.75mm 1kg', 'eSUN PLA+ Beyaz Filament 1.75mm 500g', false, '1kg ↔ 500g'],
  ['Baby PLus Filament Beyaz 1kg 1.75mm', 'Baby PLus Filament Beyaz 250g 1.75mm', false, '1kg ↔ 250g'],
  ['Creality Ender PLA+ Gri Filament 1.75mm 1Kg', 'Creality Ender PLA+ Gri Filament 1.75mm 1Kg', true, 'aynı gramaj'],
  ['Filamix PLA Glow Mavi Filament 1.75mm 1Kg', 'Filamix PLA Glow Mavi Filament 1.75mm 1000gr', true, '1kg ↔ 1000gr'],
  ['Kingroon PLA 1 Kg Beyaz', 'Kingroon PLA 1,0kg Beyaz', true, '1 Kg ↔ 1,0kg'],
];
for (const [a, b, beklenen, etiket] of ciftler) {
  const m = matchProducts({ title: a }, { title: b });
  kontrol(`eşleştirme ${etiket} → ${beklenen ? 'eşleşir' : 'RED'}`, !!m === beklenen, m ? 'eşleşti' : 'reddedildi');
}

/* ---------- 9) miktarAyniMi / miktarCakismasi ---------- */
kontrol('miktarAyniMi(1000,1000)', miktarAyniMi(1000, 1000) === true);
kontrol('miktarAyniMi(1000, 990) tolerans içinde', miktarAyniMi(1000, 990) === true);
kontrol('miktarAyniMi(1000, 800) farklı', miktarAyniMi(1000, 800) === false);
kontrol('miktarAyniMi(null, 800) bilinmiyor', miktarAyniMi(null, 800) === null);

const cak = miktarCakismasi('PLA 1kg', 'PLA 800gr');
kontrol('çelişki: 1kg vs 800gr', cak.cakisma === true && cak.aGram === 1000 && cak.bGram === 800);
const cak2 = miktarCakismasi('PLA 1kg', 'PLA Filament');
kontrol('çelişki yok: miktarsız aday', cak2.cakisma === false);
const cak3 = miktarCakismasi('Kablosuz Kulaklık', 'Bluetooth Kulaklık Pro');
kontrol('çelişki yok: miktar bilgisi olmayan ürünler', cak3.cakisma === false);

/* ---------- 10) Biçimlendirme ---------- */
kontrol('gramMetni(800) = "800 g"', gramMetni(800) === '800 g', gramMetni(800));
kontrol('gramMetni(1000) = "1 kg"', gramMetni(1000) === '1 kg', gramMetni(1000));
kontrol('gramMetni(3000) = "3 kg"', gramMetni(3000) === '3 kg', gramMetni(3000));
kontrol('gramMetni(250) = "250 g"', gramMetni(250) === '250 g', gramMetni(250));
kontrol('tlKgMetni(561.25) Türkçe biçim', tlKgMetni(561.25) === '561,25 ₺/kg', tlKgMetni(561.25));
kontrol('tlKgMetni(null) = null', tlKgMetni(null) === null);

/* ---------- 11) Malzeme / yoğunluk ---------- */
kontrol('PLA malzemesi', malzemeBul('eSUN PLA+ Filament') === 'pla+' || malzemeBul('eSUN PLA Filament') === 'pla');
kontrol('PETG malzemesi', malzemeBul('PETG Filament 1kg') === 'petg');
kontrol('PLA yoğunluk 1.24', yogunlukBul('PLA Filament') === 1.24);
kontrol('bilinmeyen malzeme → null', yogunlukBul('Kablosuz Kulumbaz') === null);

/* ---------- 12) Ön yüz / sunucu bağlantısı ---------- */
const appJs = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
const css = fs.readFileSync('public/style.css', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pipeline = fs.readFileSync('src/pipeline.js', 'utf8');

kontrol('sonuç ekranı birimFiyatPaneli çağırıyor', /birimFiyatPaneli\(sonuc\)/.test(appJs));
kontrol('kartta ₺/kg rozeti var', /birim-rozet-satiri/.test(appJs) && /birimKgMetni/.test(appJs));
kontrol('panel HTML’de var', /id="birimAlani"/.test(html));
kontrol('CSS kuralları var', /\.birim-kart/.test(css) && /\.birim-tablo/.test(css));
kontrol('pipeline her ürüne birim ekliyor', /birim: birimFiyat\(r\.product\)/.test(pipeline));
kontrol('pipeline özete birimFiyat koyuyor', /birimFiyat: \(\(\) => \{/.test(pipeline));
kontrol('sunucu kısmi sonuçlara birim ekliyor', /birim: r\.product\.birim \|\| birimFiyat\(r\.product\)/.test(server));
kontrol('util.js gramaj koruması içeriyor', /miktarCakismasi\(src\.title, cand\.title\)\.cakisma/.test(fs.readFileSync('src/util.js', 'utf8')));

// Döngüsel import yok: birimFiyat.js util.js'i import etmemeli
const bf = fs.readFileSync('src/birimFiyat.js', 'utf8');
kontrol('birimFiyat.js util.js import etmiyor (döngü yok)', !/from '\.\/util\.js'/.test(bf));

console.log(`BIRIM-FIYAT ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exitCode = gecen === toplam ? 0 : 1;
