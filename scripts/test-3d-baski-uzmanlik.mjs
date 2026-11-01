/**
 * 🖨️ 3D Baskı Uzmanlık Modülü testleri — 2026-10-30
 *
 * Kapsam:
 *  1) Dilimleyici maliyet simülatörü: 100 g PLA / PETG / 2.5 kg makara / reçine.
 *  2) Elektrik maliyeti (~100 g ≈ 3,5 TL) ve metre başına maliyet.
 *  3) Çap tespiti (1.75 / 2.85 / bilinmiyor) ve uyarı rozeti metni.
 *  4) Hammadde sınıflandırma (FDM + SLA alt türleri, nitelik rozetleri).
 *  5) "Yüksek Birim Maliyet" uyarısı.
 *  6) Arayüz / sunucu sözleşmesi (widget, senkron gramaj, filtreler).
 *
 * Kullanım: node scripts/test-3d-baski-uzmanlik.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  hesaplaBaskiMaliyeti, capCikar, capUyarisi, hammaddeTuruBul,
  gramBasinaMetre, baskiKartiBilgisi, yuksekBirimMaliyet, baskiOzeti,
  baskiZenginlestir,
  ELEKTRIK_KWH_TL, YAZICI_GUC_W, GRAM_SAAT, HAMMADDE_TURLERI,
} from '../src/baskiMaliyet.js';

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
const yakin = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

/* ---------------------------------------------------------------- */
bolum('1) Dilimleyici maliyet simülatörü — 100 g');
const pla = { title: 'eSUN PLA+ Filament 1.75mm 1kg', sellingPrice: 600, pricing: { toplam: 600 } };
const hPla = hesaplaBaskiMaliyeti(pla, 100);

kontrol('PLA hesabı geçerli', hPla.gecerli === true, hPla.neden);
kontrol('PLA hammadde maliyeti 60,00 TL', yakin(hPla.hammaddeMaliyeti, 60), String(hPla.hammaddeMaliyeti));
kontrol('PLA elektrik maliyeti ~3,50 TL',
  yakin(hPla.elektrikMaliyeti, 3.48, 0.05), String(hPla.elektrikMaliyeti));
kontrol('PLA toplam parça maliyeti 63,48 TL', yakin(hPla.parcaMaliyeti, 63.48), String(hPla.parcaMaliyeti));
kontrol('PLA 1 kg makaradan 10 adet', hPla.adet === 10, String(hPla.adet));
kontrol('PLA birim gram fiyatı 0,60 TL/g', yakin(hPla.tlGram, 0.6, 0.0001), String(hPla.tlGram));
kontrol('PLA makara uzunluğu ~335 m',
  hPla.metre.makaraMetre >= 330 && hPla.metre.makaraMetre <= 340, String(hPla.metre.makaraMetre));
kontrol('PLA 100 g parça uzunluğu ~33,5 m',
  yakin(hPla.metre.parcaMetre, 33.5, 0.3), String(hPla.metre.parcaMetre));
kontrol('PLA metre maliyeti hesaplandı',
  hPla.metre.metreMaliyeti > 1.7 && hPla.metre.metreMaliyeti < 1.9, String(hPla.metre.metreMaliyeti));
kontrol('elektrik varsayımları açık',
  hPla.varsayimlar.gucW === YAZICI_GUC_W && hPla.varsayimlar.kwhTl === ELEKTRIK_KWH_TL
  && hPla.varsayimlar.gramSaat === GRAM_SAAT);

const petg = { title: 'PETG Filament 1.75 mm 1 kg', sellingPrice: 700, pricing: { toplam: 700 } };
const hPetg = hesaplaBaskiMaliyeti(petg, 100);
kontrol('PETG hesabı geçerli', hPetg.gecerli === true, hPetg.neden);
kontrol('PETG hammadde 70,00 TL', yakin(hPetg.hammaddeMaliyeti, 70), String(hPetg.hammaddeMaliyeti));
kontrol('PETG toplam 73,48 TL', yakin(hPetg.parcaMaliyeti, 73.48), String(hPetg.parcaMaliyeti));
kontrol('PETG 1 kg → 10 adet', hPetg.adet === 10, String(hPetg.adet));
kontrol('PETG yoğunluğu 1,27', hPetg.yogunluk === 1.27, String(hPetg.yogunluk));
kontrol('PETG metre/m PLA\'dan kısa (daha yoğun)',
  hPetg.metre.parcaMetre < hPla.metre.parcaMetre,
  `${hPetg.metre.parcaMetre} vs ${hPla.metre.parcaMetre}`);
kontrol('PETG hammadde rozeti', hPetg.hammadde.rozet.includes('PETG'));

// Farklı gramaj ve büyük makara
const buyuk = { title: 'PLA Filament 1.75mm 2.5 kg', sellingPrice: 1100, pricing: { toplam: 1100 } };
const hBuyuk = hesaplaBaskiMaliyeti(buyuk, 100);
kontrol('2,5 kg makara 100 g → 47,48 TL', yakin(hBuyuk.parcaMaliyeti, 47.48), String(hBuyuk.parcaMaliyeti));
kontrol('2,5 kg makaradan 25 adet', hBuyuk.adet === 25, String(hBuyuk.adet));
kontrol('2,5 kg makara birim fiyatı daha iyi', hBuyuk.tlGram < hPla.tlGram,
  `${hBuyuk.tlGram} vs ${hPla.tlGram}`);

// Gramaj değişince doğru ölçeklenir
const h50 = hesaplaBaskiMaliyeti(pla, 50);
kontrol('50 g hammadde yarı yarıya', yakin(h50.hammaddeMaliyeti, 30), String(h50.hammaddeMaliyeti));
kontrol('50 g elektrik yarı yarıya', yakin(h50.elektrikMaliyeti, 1.74, 0.03), String(h50.elektrikMaliyeti));
kontrol('50 g → 20 adet', h50.adet === 20, String(h50.adet));

// Süre verilirse elektrik o süreye göre
const hSure = hesaplaBaskiMaliyeti(pla, 100, { sureSaat: 10 });
kontrol('açık süre verilirse elektrik 10 saate göre',
  yakin(hSure.elektrikMaliyeti, 10 * (150 / 1000) * ELEKTRIK_KWH_TL, 0.02),
  String(hSure.elektrikMaliyeti));

// Reçine (ml) → gram dönüşümü
const recine = { title: 'Anycubic Water Washable Reçine 1L', sellingPrice: 900, pricing: { toplam: 900 } };
const hRecine = hesaplaBaskiMaliyeti(recine, 100);
kontrol('reçine hesabı geçerli', hRecine.gecerli === true, hRecine.neden);
kontrol('reçine grup SLA', hRecine.hammadde.grup === 'sla', String(hRecine.hammadde.grup));
kontrol('reçine 1 L = 1.100 g (yoğunluk 1,1)', hRecine.makaraGram === 1100, String(hRecine.makaraGram));
kontrol('reçine TL/L korunuyor', hRecine.tlL === 900, String(hRecine.tlL));
kontrol('reçine 100 g maliyeti ~81,82 + elektrik',
  yakin(hRecine.hammaddeMaliyeti, 81.82, 0.05), String(hRecine.hammaddeMaliyeti));
kontrol('reçine 1 L makaradan 11 adet', hRecine.adet === 11, String(hRecine.adet));

// Dürüstlük: miktar/fiyat yoksa hesap yok
const miktarsiz = hesaplaBaskiMaliyeti({ title: 'PLA Filament', sellingPrice: 600 }, 100);
kontrol('miktar okunamazsa hesap yapılmaz', miktarsiz.gecerli === false && !!miktarsiz.neden, miktarsiz.neden);
const fiyatsiz = hesaplaBaskiMaliyeti({ title: 'PLA Filament 1kg' }, 100);
kontrol('fiyat yoksa hesap yapılmaz', fiyatsiz.gecerli === false, fiyatsiz.neden);
kontrol('geçersiz gramaj reddedilir', hesaplaBaskiMaliyeti(pla, 0).gecerli === false);
kontrol('negatif gramaj reddedilir', hesaplaBaskiMaliyeti(pla, -5).gecerli === false);

/* ---------------------------------------------------------------- */
bolum('2) Çap tespiti ve uyumluluk kalkanı');
for (const [metin, beklenen] of [
  ['PLA Filament 1.75 mm 1 kg', 1.75],
  ['PLA 1,75mm 1000g', 1.75],
  ['ABS Filament 2.85 mm 1 kg', 2.85],
  ['TPU 3.00mm 1kg', 3],
  ['2.85mm PETG 1kg', 2.85],
]) {
  const c = capCikar(metin);
  kontrol(`çap tespiti: ${metin} → ${beklenen}`, c.mm === beklenen, String(c.mm));
}
kontrol('çap yoksa null (1.75 varsayılmaz)', capCikar('PLA Filament 1 kg').mm === null);
kontrol('nozzle çapı filament çapı sanılmaz',
  capCikar('PLA 1kg 0.4mm nozzle').mm === null, JSON.stringify(capCikar('PLA 1kg 0.4mm nozzle')));
kontrol('1.75 standart kabul edilir', capCikar('PLA 1.75mm').standart === true);
kontrol('2.85 standart dışı', capCikar('PLA 2.85mm').standart === false);

const uyari = capUyarisi(capCikar('ABS Filament 2.85 mm 1 kg'));
kontrol('2.85 için uyarı üretildi', !!uyari && uyari.kod === 'cap_uyumsuz');
kontrol('uyarı metni istenen biçimde',
  uyari?.metin === '⚠️ DİKKAT: 2.85 mm Kalınlık (Standart 1.75mm yazıcılara uymaz!)',
  uyari?.metin);
kontrol('1.75 için uyarı yok', capUyarisi(capCikar('PLA 1.75mm')) === null);
kontrol('çap bilinmiyorsa uyarı yok', capUyarisi(capCikar('PLA')) === null);

/* ---------------------------------------------------------------- */
bolum('3) Hammadde sınıflandırma ve rozetler');
const turler = [
  ['PLA Basic 1.75mm', 'pla', 'fdm'],
  ['eSUN PLA+ 1kg', 'pla+', 'fdm'],
  ['Bambu Hyper PLA 1kg', 'hyper', 'fdm'],
  ['PETG Filament 1kg', 'petg', 'fdm'],
  ['ABS Filament 1kg', 'abs', 'fdm'],
  ['ASA Filament 1kg', 'abs', 'fdm'],
  ['TPU Esnek Filament 1kg', 'tpu', 'fdm'],
  ['PVA Destek Filamenti 500g', 'pva', 'fdm'],
  ['PA-CF Karbon Fiber 1kg', 'cf', 'fdm'],
  ['Standart Reçine 1L', 'standart_recine', 'sla'],
  ['Water Washable Reçine 1L', 'suda_yikanabilir', 'sla'],
  ['ABS-Like Reçine 1kg', 'abs_like', 'sla'],
  ['Tough Dayanıklı Reçine 1L', 'tough', 'sla'],
];
for (const [metin, tur, grup] of turler) {
  const h = hammaddeTuruBul(metin);
  kontrol(`${metin} → ${tur}`, h.tur === tur && h.grup === grup, `${h.tur}/${h.grup}`);
}
kontrol('Hyper rozeti', hammaddeTuruBul('Bambu Hyper PLA').rozet === '🚀 Hyper Hızlı Baskı');
kontrol('Silk nitelik rozeti',
  hammaddeTuruBul('PLA Silk İpeksi 1kg').nitelikler.some(n => n.rozet === '💎 Silk İpeksi'));
kontrol('Biyo-uyumlu nitelik rozeti',
  hammaddeTuruBul('Biyo-Uyumlu Reçine').nitelikler.some(n => n.rozet === '🌱 Biyo-Uyumlu'));
kontrol('bilinmeyen hammadde null', hammaddeTuruBul('Vida M3 10mm').tur === null);
kontrol('tüm türlerde rozet/sınıf tanımlı',
  Object.values(HAMMADDE_TURLERI).every(t => t.rozet && t.sinif && t.ad));

/* ---------------------------------------------------------------- */
bolum('4) Yüksek birim maliyet ve özet');
const yuksek = yuksekBirimMaliyet({ tlKg: 900 }, 600);
kontrol('medyanın %50 üstü işaretlendi', yuksek?.kod === 'yuksek_birim' && yuksek.farkYuzde === 50);
kontrol('uyarı metni "Yüksek Birim Maliyet" içerir', /Yüksek Birim Maliyet/.test(yuksek?.metin || ''));
kontrol('medyana yakın fiyat işaretlenmez', yuksekBirimMaliyet({ tlKg: 620 }, 600) === null);
kontrol('medyan yoksa işaretleme yok', yuksekBirimMaliyet({ tlKg: 900 }, null) === null);

const ozet = baskiOzeti([
  { baski: { capMm: 1.75, hammadde: { tur: 'pla' } } },
  { baski: { capMm: 1.75, hammadde: { tur: 'petg' } } },
  { baski: { capMm: 2.85, capUyari: { kod: 'cap_uyumsuz' }, hammadde: { tur: 'abs' } } },
  { baski: { capMm: null, hammadde: { tur: null } } },
  { baski: null },
]);
kontrol('çap sayaçları', ozet.capSayac['1.75'] === 2 && ozet.capSayac['2.85'] === 1
  && ozet.capSayac.bilinmiyor === 1, JSON.stringify(ozet.capSayac));
kontrol('hammadde sayaçları', ozet.hammaddeSayac.pla === 1 && ozet.hammaddeSayac.petg === 1);
kontrol('uyumsuz sayaç', ozet.uyumsuz === 1, String(ozet.uyumsuz));

/* ---------------------------------------------------------------- */
bolum('5) Karta taşınan bilgi');
const kart = baskiKartiBilgisi({ ...pla, birim: undefined });
kontrol('3D ürün kart bilgisi var', !!kart);
kontrol('kart çapı 1.75', kart?.capMm === 1.75);
kontrol('kart hammadde PLA+', kart?.hammadde?.tur === 'pla+', kart?.hammadde?.tur);
kontrol('kart hesaplanabilir', kart?.hesaplanabilir === true);
kontrol('kart metre maliyeti taşır', typeof kart?.metreMaliyeti === 'number');
kontrol('kart varsayımları taşır', kart?.varsayimlar?.gucW === YAZICI_GUC_W);
kontrol('3D dışı ürün için widget yok', baskiKartiBilgisi({ title: 'Kablosuz Mouse', sellingPrice: 500 }) === null);
kontrol('reçine kart bilgisi grup SLA', baskiKartiBilgisi({ ...recine, birim: undefined })?.hammadde?.grup === 'sla');
kontrol('gramBasinaMetre PLA ~0,335 m/g',
  yakin(gramBasinaMetre(1.24, 1.75), 0.3353, 0.002), String(gramBasinaMetre(1.24, 1.75)));
kontrol('2.85 mm tel daha az metre verir',
  gramBasinaMetre(1.24, 2.85) < gramBasinaMetre(1.24, 1.75));

// Eski snapshot uyumluluğu: 3D alanları yoksa okuma anında türetilir.
const eskiPayload = {
  kaynak: { urun: 'eSUN PLA+ 1kg' },
  sonuclar: [
    { site: 'a', siteName: 'A', status: 'found', product: { title: 'eSUN PLA+ Filament 1.75mm 1kg', sellingPrice: 600, pricing: { toplam: 600 }, birim: { gram: 1000, tlKg: 600, fiyat: 600, guven: 'yuksek' } } },
    { site: 'b', siteName: 'B', status: 'found', product: { title: 'PLA Filament 1.75mm 1kg', sellingPrice: 900, pricing: { toplam: 900 }, birim: { gram: 1000, tlKg: 900, fiyat: 900, guven: 'yuksek' } } },
  ],
  ozet: { birimFiyat: { medyanKg: 600 } },
};
const zengin = baskiZenginlestir(eskiPayload);
kontrol('eski snapshot zenginleştirildi', !!zengin.sonuclar[0].baski);
kontrol('zenginleştirme çapı buldu', zengin.sonuclar[0].baski.capMm === 1.75);
kontrol('zenginleştirme hammaddeyi buldu', zengin.sonuclar[0].baski.hammadde.tur === 'pla+');
kontrol('zenginleştirme yüksek birim maliyeti işaretledi', !!zengin.sonuclar[1].birimUyari);
kontrol('zenginleştirme özet üretti', zengin.ozet.baskiOzet?.capSayac['1.75'] === 2);

/* ---------------------------------------------------------------- */
bolum('6) Arayüz / sunucu sözleşmesi');
{
  const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const app = oku('public/app.js');
  const css = oku('public/style.css');
  const html = oku('public/index.html');
  const server = oku('server.js');
  const pipeline = oku('src/pipeline.js');

  kontrol('kartta baskı widget\'ı', /function baskiWidgetHtml/.test(app));
  kontrol('widget başlığı', /Parça Baskı Maliyeti Hesapla/.test(app));
  kontrol('gramaj girdisi', /class="baski-gramaj"/.test(app));
  kontrol('varsayılan gramaj 100', /baskiGramaj = 100/.test(app));
  kontrol('kartlar arası senkron', /baskiWidgetlariniGuncelle/.test(app)
    && /querySelectorAll\('#kartlar \.baski-gramaj'\)/.test(app));
  kontrol('çap filtresi mantığı', /startsWith\('cap:'\)/.test(app));
  kontrol('hammadde filtresi mantığı', /startsWith\('hm:'\)/.test(app));
  kontrol('filtre çipleri dinamik', /baskiFiltreleriniDoldur/.test(app));
  kontrol('çap uyarı rozeti sınıfı', /cap-uyari/.test(app));
  kontrol('yüksek birim maliyet rozeti', /birimUyari/.test(app));

  kontrol('HTML: çap filtre grubu', /id="capFiltreleri"/.test(html));
  kontrol('HTML: hammadde filtre grubu', /id="hammaddeFiltreleri"/.test(html));

  kontrol('CSS: widget', /\.baski-widget/.test(css));
  kontrol('CSS: çap uyarı rozeti', /\.baski-rozet\.cap-uyari/.test(css));
  kontrol('CSS: hammadde rozet sınıfları', /\.baski-rozet\.hm-pla\b/.test(css));
  kontrol('CSS: çap tehlike çipi', /\.filtre-chip\.cap-tehlike/.test(css));

  kontrol('sunucu: canlı kartta baski bilgisi', /baski:\s*r\.product \? baskiKartiBilgisi/.test(server));
  kontrol('sunucu: snapshot okurken zenginleştirme', /baskiZenginlestir/.test(server));
  kontrol('pipeline: baskiKartiBilgisi import', /baskiKartiBilgisi/.test(pipeline));
  kontrol('pipeline: birim uyarısı', /yuksekBirimMaliyet\(r\.product\.birim, medyanKg\)/.test(pipeline));
  kontrol('pipeline: baskiOzet', /baskiOzet\s*=\s*\{/.test(pipeline));
}

console.log(`\n3D-BASKI-UZMANLIK ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
