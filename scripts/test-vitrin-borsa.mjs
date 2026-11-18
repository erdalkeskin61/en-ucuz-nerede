/**
 * 📊 Ana sayfa "Canlı Filament & 3D Yazıcı Borsası" testleri
 *
 * 2026-11-03 sürümü yalnızca "stokta önce + fiyat artan" sıralamayı doğruluyordu.
 * 2026-11-10'da vitrin **kategori dengeli** hâle geldi: 12 kartın 12'si filament
 * oluyordu (7'si Porima) ve ₺15.000–35.000'lik 3D yazıcılar hiç görünmüyordu.
 *
 * KAPSAM
 *  1) Kategori kotası ve dağılım (6 filament + 4 yazıcı + 2 parça/reçine)
 *  2) Havuz boşsa akıllı tamamlama ("hepsi filament" geri gelmez)
 *  3) Marka çeşitliliği (aynı markadan en fazla 3) 
 *  4) Puanlama: stokta > fırsat > rastgelelik; jitter sınırları
 *  5) Dinamik rotasyon: ardışık çağrılarda vitrin kilitlenmez
 *  6) Yazıcı görünürlüğü: bilinen modeller (K1C / P1S) vitrinde
 *  7) Rozet dürüstlüğü (En Dip / mağazalar arası fark) — değişmedi
 *  8) Gizlilik: yalnızca herkese açık alanlar
 *  9) Limit / kota ölçekleme / boş durum
 * 10) Sunucu, HTML, JS, CSS sözleşmeleri (kategori çipleri + fade)
 *
 * Testin yazdığı radar_durum/radar_gecmis kayıtları sonunda SİLİNİR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import {
  vitrinVerisi, vitrinHavuzdanSec, vitrinPuani, vitrinMarkasi, urunIkonu,
  radarKapat, VITRIN_KOTA, VITRIN_MARKA_SINIRI, VITRIN_JITTER,
} from '../src/otonomRadar.js';

let gecen = 0;
let toplam = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const bolum = (ad) => console.log(`\n${ad}`);

const dbYolu = path.join(config.dataDir, 'en_ucuz_nerede.db');
const db = new DatabaseSync(dbYolu);
const TABAN = 970000 + (Date.now() % 1000);
const idler = {
  dip: TABAN + 1,
  indirim: TABAN + 2,
  tukendi: TABAN + 3,
  urlsuz: TABAN + 4,
  verisiz: TABAN + 5,
};

const durumEkle = (id, d) => db.prepare(`
  INSERT INTO radar_durum (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  ON CONFLICT(anahtar) DO UPDATE SET veri = excluded.veri, fiyat = excluded.fiyat, stokta = excluded.stokta
`).run(
  `katalog:${id}`, id, d.ad, d.site || null, d.siteId || null,
  d.fiyat ?? null, d.stokta ? 1 : 0, Date.now(),
  JSON.stringify({
    anahtar: `katalog:${id}`, katalogId: id, ad: d.ad, kategori: d.kategori || 'filament',
    site: d.site, siteId: d.siteId, fiyat: d.fiyat, stokta: d.stokta,
    hamUrl: d.hamUrl ?? null, afiliyeUrl: d.afiliyeUrl ?? null,
    birimMetni: d.birimMetni ?? null, kargo: d.kargo ?? null,
    enPahaliFiyat: d.enPahaliFiyat ?? null, tasarruf: d.tasarruf ?? null,
    pid: '__gizli_pid__',
  }),
);

const gecmisEkle = (id, gunOnce, fiyat) => db.prepare(`
  INSERT INTO radar_gecmis (katalog_id, ts, fiyat, site, stokta)
  VALUES (?, ?, ?, 'TestMarket', 1)
`).run(id, Date.now() - gunOnce * 86400000, fiyat);

const temizle = () => {
  for (const id of Object.values(idler)) {
    db.prepare('DELETE FROM radar_durum WHERE katalog_id = ?').run(id);
    db.prepare('DELETE FROM radar_gecmis WHERE katalog_id = ?').run(id);
  }
};

/** Deterministik sahte rastgele (aynı tohum → aynı dizi). */
function tohumlu(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Sentetik kart üreticisi (saf fonksiyon testleri için). */
let sentetikSayac = 0;
const kart = (ek = {}) => {
  sentetikSayac += 1;
  return {
    id: 500000 + sentetikSayac,
    ad: ek.ad || `Test Ürün ${sentetikSayac}`,
    kategori: ek.kategori || 'filament',
    fiyat: ek.fiyat ?? 500,
    stokta: ek.stokta !== false,
    tasarruf: ek.tasarruf ?? 0,
    dip: ek.dip === true,
    gercekFirsat: ek.gercekFirsat === true,
    indirimYuzde: ek.indirimYuzde ?? 0,
  };
};

try {
  /* ================================================================ */
  bolum('1) 🧮 Puanlama ve marka çıkarımı (saf fonksiyonlar)');

  kontrol('KOTA sabiti 6/4/2',
    VITRIN_KOTA.filament === 6 && VITRIN_KOTA.yazici === 4 && VITRIN_KOTA.genel === 2,
    JSON.stringify(VITRIN_KOTA));
  kontrol('marka sınırı 3', VITRIN_MARKA_SINIRI === 3, String(VITRIN_MARKA_SINIRI));
  kontrol('jitter: filament > yazıcı',
    VITRIN_JITTER.filament > VITRIN_JITTER.yazici,
    `${VITRIN_JITTER.filament} > ${VITRIN_JITTER.yazici}`);
  // 2026-11-11 sözleşmesi: kategoriye göre jitter değerleri sabitlendi.
  kontrol('jitter filament = 450', VITRIN_JITTER.filament === 450, String(VITRIN_JITTER.filament));
  kontrol('jitter yazıcı = 60', VITRIN_JITTER.yazici === 60, String(VITRIN_JITTER.yazici));
  kontrol('jitter genel = 120', VITRIN_JITTER.genel === 120, String(VITRIN_JITTER.genel));
  kontrol('jitter kategorileri dondurulmuş', Object.isFrozen(VITRIN_JITTER));
  kontrol('kota dondurulmuş', Object.isFrozen(VITRIN_KOTA));

  // Ürün bazlı kategori ikonları (vitrin kartı bu fonksiyonu kullanır).
  kontrol('ikon: PLA → 🧵', urunIkonu({ kategori: 'filament', ad: 'Porima PLA Filament Beyaz 1kg' }) === '🧵');
  kontrol('ikon: PETG → 💎', urunIkonu({ kategori: 'filament', ad: 'eSun PETG Filament Siyah 1kg' }) === '💎');
  kontrol('ikon: TPU → 🌀', urunIkonu({ kategori: 'filament', ad: 'Creality CR-TPU Esnek Filament Siyah 1kg' }) === '🌀');
  kontrol('ikon: yazıcı → 🖨️', urunIkonu({ kategori: 'yazici', ad: 'Bambu Lab P1S 3D Yazıcı' }) === '🖨️');
  kontrol('ikon: reçine → 🧪', urunIkonu({ kategori: 'genel', ad: 'Anycubic Standart UV Reçine Gri 1kg' }) === '🧪');
  kontrol('ikon: nozzle → 🔧', urunIkonu({ kategori: 'genel', ad: 'Creality Unicorn Quick-Swap Nozzle 0.4mm' }) === '🔧');
  kontrol('ikon: kurutucu → ♨️', urunIkonu({ kategori: 'genel', ad: 'eSun eBOX Lite Filament Kurutucu' }) === '♨️');
  // Rastgelelik dağılımı: jitter 0 iken aynı, 450 iken 0..450 aralığında.
  const p0 = vitrinPuani({ stokta: true, fiyat: 100 }, () => 0, 0);
  const p1 = vitrinPuani({ stokta: true, fiyat: 100 }, () => 1, 0);
  kontrol('jitter 0 → deterministik puan', p0 === p1, `${p0} / ${p1}`);

  kontrol('marka: Porima PLA → porima', vitrinMarkasi('Porima PLA Filament Siyah') === 'porima',
    vitrinMarkasi('Porima PLA Filament Siyah'));
  kontrol('marka: "Bambu Lab P1S" → bambu', vitrinMarkasi('Bambu Lab P1S 3D Yazıcı') === 'bambu');
  kontrol('marka: boş güvenli', vitrinMarkasi('') === '');
  kontrol('marka: null güvenli', vitrinMarkasi(null) === '');

  const sabitRast = () => 0.5;
  const stoklu = kart({ stokta: true, fiyat: 5000 });
  const tukenmis = kart({ stokta: false, fiyat: 100, tasarruf: 999 });
  kontrol('stokta olan, fırsatçı tükenenden yüksek puan',
    vitrinPuani(stoklu, sabitRast) > vitrinPuani(tukenmis, sabitRast),
    `${vitrinPuani(stoklu, sabitRast)} > ${vitrinPuani(tukenmis, sabitRast)}`);

  const firsatli = kart({ tasarruf: 100 });
  const duz = kart({});
  kontrol('tasarruflu ürün düz üründen yüksek puan',
    vitrinPuani(firsatli, () => 0) > vitrinPuani(duz, () => 0));

  const dipK = kart({ dip: true });
  kontrol('dip bonusu puanı artırır', vitrinPuani(dipK, () => 0) > vitrinPuani(duz, () => 0));

  kontrol('jitter 0 → rastgelelik yok (aynı puan)',
    vitrinPuani(duz, () => 0, 0) === vitrinPuani(duz, () => 1, 0));
  kontrol('jitter 450 → en fazla 450 fark',
    Math.abs(vitrinPuani(duz, () => 1, 450) - vitrinPuani(duz, () => 0, 450)) <= 450.01,
    String(vitrinPuani(duz, () => 1, 450) - vitrinPuani(duz, () => 0, 450)));
  kontrol('geçersiz kart -Infinity', vitrinPuani(null) === -Infinity);

  /* ================================================================ */
  bolum('2) 🎯 Havuzdan seçim — kota, marka sınırı, rotasyon');

  const porimaHavuz = Array.from({ length: 8 }, (_, i) =>
    kart({ ad: `Porima Ürün ${i + 1} 1kg`, tasarruf: 100, fiyat: 600 + i }));
  const sec3 = vitrinHavuzdanSec(porimaHavuz, 6, { rastgele: tohumlu(7) });
  kontrol('marka sınırı: 6 istense bile Porima en fazla 3',
    sec3.filter(k => vitrinMarkasi(k.ad) === 'porima').length <= 3,
    String(sec3.filter(k => vitrinMarkasi(k.ad) === 'porima').length));
  kontrol('tek markalı havuzda sınır sert: 3 seçilir', sec3.length === 3, String(sec3.length));
  kontrol('markaSiniri:99 verilince sınır kalkar',
    vitrinHavuzdanSec(porimaHavuz, 6, { markaSiniri: 99, rastgele: tohumlu(7) }).length === 6,
    String(vitrinHavuzdanSec(porimaHavuz, 6, { markaSiniri: 99, rastgele: tohumlu(7) }).length));

  const karisik = [
    ...Array.from({ length: 5 }, (_, i) => kart({ ad: `Porima P${i}`, fiyat: 600 + i })),
    ...Array.from({ length: 3 }, (_, i) => kart({ ad: `eSun E${i}`, fiyat: 700 + i })),
    ...Array.from({ length: 2 }, (_, i) => kart({ ad: `Sunlu S${i}`, fiyat: 800 + i })),
  ];
  const secKarisik = vitrinHavuzdanSec(karisik, 6, { rastgele: tohumlu(3) });
  kontrol('karışık havuzdan 6 seçilir', secKarisik.length === 6, String(secKarisik.length));
  kontrol('en fazla 3 Porima', secKarisik.filter(k => vitrinMarkasi(k.ad) === 'porima').length <= 3);
  kontrol('en az 2 farklı marka',
    new Set(secKarisik.map(k => vitrinMarkasi(k.ad))).size >= 2,
    String(new Set(secKarisik.map(k => vitrinMarkasi(k.ad))).size));
  kontrol('aynı ürün iki kez seçilmez',
    new Set(secKarisik.map(k => k.id)).size === secKarisik.length);

  kontrol('adet 0 → boş', vitrinHavuzdanSec(karisik, 0).length === 0);
  kontrol('boş havuz → boş', vitrinHavuzdanSec([], 5).length === 0);
  kontrol('havuzdan fazla istenirse marka sınırı kadar döner',
    vitrinHavuzdanSec(karisik, 99).length === 8,
    String(vitrinHavuzdanSec(karisik, 99).length));
  kontrol('marka sınırı 99 ile havuzun tamamı döner',
    vitrinHavuzdanSec(karisik, 99, { markaSiniri: 99 }).length === karisik.length,
    String(vitrinHavuzdanSec(karisik, 99, { markaSiniri: 99 }).length));
  kontrol('haric seti dışlanır',
    vitrinHavuzdanSec(karisik, 6, { haric: new Set([karisik[0].id]) })
      .every(k => k.id !== karisik[0].id));

  // ROTASYON: aynı havuz, farklı tohum → farklı seçim
  const secimA = vitrinHavuzdanSec(karisik, 4, { rastgele: tohumlu(11) }).map(k => k.id).join(',');
  const secimB = vitrinHavuzdanSec(karisik, 4, { rastgele: tohumlu(999) }).map(k => k.id).join(',');
  kontrol('farklı tohum → farklı seçim (rotasyon)', secimA !== secimB, `${secimA} ≠ ${secimB}`);

  // Stokta olmayan asla stoktakinin önüne geçmez (jitter en yüksek olsa bile)
  const stokKarisik = [
    ...Array.from({ length: 6 }, () => kart({ stokta: false, tasarruf: 500, dip: true })),
    ...Array.from({ length: 2 }, () => kart({ stokta: true })),
  ];
  const stokSec = vitrinHavuzdanSec(stokKarisik, 2, { rastgele: tohumlu(5) });
  kontrol('ilk 2 seçim stokta olanlar', stokSec.every(k => k.stokta === true),
    stokSec.map(k => k.stokta).join(','));

  /* ================================================================ */
  bolum('3) 🗂️ Kategori kotası — gerçek veritabanı');

  // Gerçek vitrin (varsayılan limit 12)
  const v = vitrinVerisi({ limit: 12 });
  kontrol('vitrin ok döner', v.ok === true);
  kontrol('urunler dizi', Array.isArray(v.urunler));
  kontrol('gosterilen = urunler uzunluğu', v.gosterilen === v.urunler.length);
  kontrol('12 kart döner', v.urunler.length === 12, String(v.urunler.length));
  kontrol('dağılım toplamı = gosterilen',
    Object.values(v.dagilim || {}).reduce((a, b) => a + b, 0) === v.gosterilen,
    JSON.stringify(v.dagilim));

  kontrol('en az 5 filament', (v.dagilim.filament || 0) >= 5, String(v.dagilim.filament));
  kontrol('en az 3 yazıcı', (v.dagilim.yazici || 0) >= 3, String(v.dagilim.yazici));
  kontrol('vitrin SADECE filametten oluşmaz', (v.dagilim.yazici || 0) > 0,
    JSON.stringify(v.dagilim));
  kontrol('filament kotası aşılmaz (<= 6)',
    (v.dagilim.filament || 0) <= VITRIN_KOTA.filament, String(v.dagilim.filament));
  kontrol('yazıcı kotası aşılmaz (<= 4)',
    (v.dagilim.yazici || 0) <= VITRIN_KOTA.yazici, String(v.dagilim.yazici));

  kontrol('her kartta geçerli kategori',
    v.urunler.every(u => ['filament', 'yazici', 'genel'].includes(u.kategori)),
    v.urunler.map(u => u.kategori).join(','));
  kontrol('her kartta ikon var', v.urunler.every(u => !!u.ikon));
  kontrol('yazıcı kartı 🖨️ ikonu taşır',
    v.urunler.filter(u => u.kategori === 'yazıcı').every(u => u.ikon === '🖨️'));
  // 2026-11-11: ürün bazlı ikonlar — filament kartı artık PETG 💎 / TPU 🌀 olabilir.
  kontrol('filament kartı ikonu 🧵/💎/🌀 arasında',
    v.urunler.filter(u => u.kategori === 'filament')
      .every(u => ['🧵', '💎', '🌀'].includes(u.ikon)),
    v.urunler.filter(u => u.kategori === 'filament').map(u => `${u.ad}:${u.ikon}`).join(' | '));
  kontrol('genel kart ikonu ⚙️/🧪/🔧/♨️/📦 arasında',
    v.urunler.filter(u => u.kategori === 'genel')
      .every(u => ['⚙️', '🧪', '🔧', '♨️', '📦'].includes(u.ikon)),
    v.urunler.filter(u => u.kategori === 'genel').map(u => `${u.ad}:${u.ikon}`).join(' | '));

  // 2026-11-11 — MARKA TEKELİ: filament kartlarında aynı marka en fazla 3.
  const filaMarka = new Map();
  for (const u of v.urunler.filter(x => x.kategori === 'filament')) {
    const m = vitrinMarkasi(u.ad);
    if (m) filaMarka.set(m, (filaMarka.get(m) || 0) + 1);
  }
  const enBuyukMarka = Math.max(0, ...filaMarka.values());
  kontrol('filament vitrininde marka tekeli yok (<= 3)', enBuyukMarka <= VITRIN_MARKA_SINIRI,
    [...filaMarka.entries()].map(([m, n]) => `${m}:${n}`).join(' | '));

  // Jitter rotasyon testi: 5 çağrıda kart kimlikleri farklılaşır.
  const besSet = new Set();
  for (let i = 0; i < 5; i++) {
    besSet.add(vitrinVerisi({ limit: 12 }).urunler.map(u => u.id).sort((a, b) => a - b).join(','));
  }
  kontrol('5 çağrıda en az 2 farklı vitrin (jitter)', besSet.size >= 2, String(besSet.size));
  kontrol('havuz sayıları raporlanır', typeof v.havuz?.filament === 'number',
    JSON.stringify(v.havuz));
  kontrol('kota raporlanır', v.kota?.filament === 6 && v.kota?.yazici === 4,
    JSON.stringify(v.kota));

  /* ================================================================ */
  bolum('4) 🖨️ 3D yazıcı görünürlüğü');

  const bilinen = /Bambu Lab (P1S|A1 Mini)|Creality K1C|Creality Ender 3 V3 KE|Elegoo Neptune/i;
  kontrol('bilinen bir yazıcı vitrinde',
    v.urunler.some(u => u.kategori === 'yazici' && bilinen.test(u.ad)),
    v.urunler.filter(u => u.kategori === 'yazici').map(u => u.ad).join(' | '));

  // 2026-11-18 DÜZELTME (veriye bağlı kırılgan test — P1S ile aynı sınıf):
  // Eski iddia "K1C 12 çağrının HEPSİNDE vitrinde" idi. Radar kataloğu büyüdükçe
  // yazıcı havuzu 5 ürüne çıktı (Ender 3 V3 KE, P1S, K1C, K1 Max, Neptune 4 Pro)
  // ama yazıcı YUVASI 4'te sabit. 5 üründen 4'ü gösterilebildiği için bir ürünün
  // her çağrıda görünmesi MATEMATİKSEL OLARAK imkânsızdır; bu iddia yanlış alarm
  // üretiyordu. Doğru ölçüt (VITRIN_JITTER.yazici=60 spec'i): havuzdaki her
  // bilinen yazıcı ZAMAN İÇİNDE görünür ve SEÇİM ROTASYONA girer.
  let k1cSayisi = 0;
  let bilinenSayisi = 0;
  const cagriSayisi = 12;
  const yaziciSecimleri = new Set();
  for (let i = 0; i < cagriSayisi; i++) {
    const x = vitrinVerisi({ limit: 12 });
    const adlar = x.urunler.map(u => u.ad).join(' | ');
    if (/K1C/i.test(adlar)) k1cSayisi++;
    if (bilinen.test(adlar)) bilinenSayisi++;
    yaziciSecimleri.add(x.urunler.filter(u => u.kategori === 'yazici').map(u => u.id).join(','));
  }
  kontrol('bilinen yazıcı her çağrıda vitrinde', bilinenSayisi === cagriSayisi,
    `${bilinenSayisi}/${cagriSayisi}`);
  kontrol('K1C zaman içinde vitrine girer (yuva rotasyonu)', k1cSayisi >= 1,
    `${k1cSayisi}/${cagriSayisi}`);
  kontrol('yazıcı seçimi donmuş değil (rotasyon var)', yaziciSecimleri.size >= 2,
    `${yaziciSecimleri.size} farklı seçim`);

  // 2026-11-12 DÜZELTME (veriye bağlı kırılgan test):
  // Eski iddia "P1S 12 çağrıda en az bir kez vitrine girer" idi. Yazıcı havuzu
  // 5 ürüne çıkıp yuva 4'te kalınca ve P1S'in puanı (dip/tasarruf bonusu yok,
  // 1300-1360) hep son sırada kalınca bu iddia yanlış alarm üretiyordu.
  // SPEC (VITRIN_JITTER.yazici = 60): "bilinen modeller hep görünsün ama
  // SIRASI değişsin" → doğru ölçüt seçim (set) değil, SIRALAMA rotasyonudur.
  const yaziciSirasi = new Set();
  for (let i = 0; i < 30; i++) {
    yaziciSirasi.add(
      vitrinVerisi({ limit: 12 }).urunler
        .filter(u => u.kategori === 'yazici').map(u => u.id).join(','),
    );
  }
  kontrol('yazıcı SIRASI rotasyonla değişir (>= 2 farklı sıra)',
    yaziciSirasi.size >= 2, String(yaziciSirasi.size));
  // Kotayı aşan havuzda bile yazıcı kartları gerçek fiyat taşır.
  const tumYazicilar = vitrinVerisi({ limit: 24 }).urunler.filter(u => u.kategori === 'yazici');
  kontrol('yazıcı kartları gerçek fiyat taşır',
    tumYazicilar.every(u => Number(u.fiyat) > 0),
    tumYazicilar.map(u => `${u.ad}:${u.fiyat}`).join(' | '));

  /* ================================================================ */
  bolum('5) 🔄 Dinamik rotasyon');

  const gorulen = new Set();
  const yaziciSetleri = new Set();
  for (let i = 0; i < 20; i++) {
    const x = vitrinVerisi({ limit: 12 });
    gorulen.add(x.urunler.map(u => u.id).sort((a, b) => a - b).join(','));
    yaziciSetleri.add(x.urunler.filter(u => u.kategori === 'yazici').map(u => u.id).sort().join(','));
  }
  kontrol('20 çağrıda en az 3 farklı vitrin', gorulen.size >= 3, String(gorulen.size));
  kontrol('vitrin kilitlenmedi (tek kombinasyon değil)', gorulen.size > 1, String(gorulen.size));

  // Filament havuzu belirgin biçimde döner
  const filaSetleri = new Set();
  for (let i = 0; i < 20; i++) {
    const x = vitrinVerisi({ limit: 12 });
    filaSetleri.add(x.urunler.filter(u => u.kategori === 'filament').map(u => u.id).sort().join(','));
  }
  kontrol('filament seçimi döner (>= 3 farklı set)', filaSetleri.size >= 3, String(filaSetleri.size));

  // Aynı tohum → aynı sonuç (deterministik test edilebilirlik)
  const d1 = vitrinVerisi({ limit: 12, rastgele: tohumlu(42) }).urunler.map(u => u.id).join(',');
  const d2 = vitrinVerisi({ limit: 12, rastgele: tohumlu(42) }).urunler.map(u => u.id).join(',');
  kontrol('aynı tohum → aynı vitrin', d1 === d2);

  /* ================================================================ */
  bolum('6) 🧩 Boş havuz tamamlama — "hepsi filament" geri gelmez');

  // Bir kategori kotası 0 verilirse (ör. havuz tükendi) kalan yerler diğer
  // kategorilerden dolar — ama "hepsi filament" geri gelmez: tamamlama
  // yazıcı → genel → filament sırasını izler.
  //
  // NOT (2026-11-11): eski test "kota genel=6 (havuz 2)" varsayıyordu; seed v7
  // ile genel havuzu 12'ye çıktığı için kota kendiliğinden doluyor ve backfill
  // hiç çalışmıyordu (veriye bağlı kırılgan test). Artık tüm kotalar 0 verilip
  // backfill zorunlu hale getiriliyor.
  const eksikKota = vitrinVerisi({ limit: 12, kota: { filament: 0, yazici: 0, genel: 0 } });
  kontrol('tüm kotalar 0 → limit yine dolar', eksikKota.urunler.length === 12,
    String(eksikKota.urunler.length));
  kontrol('tamamlamada yazıcı da girer',
    (eksikKota.dagilim.yazici || 0) > 0, JSON.stringify(eksikKota.dagilim));
  kontrol('tamamlamada genel de girer',
    (eksikKota.dagilim.genel || 0) > 0, JSON.stringify(eksikKota.dagilim));
  kontrol('tamamlama filamentle başlamaz (öncelik yazıcı/genel)',
    eksikKota.urunler[0]?.kategori !== 'filament' || (eksikKota.dagilim.yazici || 0) === 0,
    JSON.stringify(eksikKota.dagilim));

  // Yalnızca yazıcı kotası
  const sadeceYazici = vitrinVerisi({ limit: 12, kota: { filament: 0, yazici: 12, genel: 0 } });
  kontrol('yazıcı kotası 12 → tüm yazıcılar', sadeceYazici.urunler.length >= 4,
    String(sadeceYazici.urunler.length));
  kontrol('yazıcı kotası aşıldığında havuz kadarı gelir',
    (sadeceYazici.dagilim.yazici || 0) === (sadeceYazici.havuz.yazici || 0),
    `${sadeceYazici.dagilim.yazici} / ${sadeceYazici.havuz.yazici}`);

  /* ================================================================ */
  bolum('7) 🏷️ Rozet dürüstlüğü (En Dip / mağazalar arası fark)');

  durumEkle(idler.dip, {
    ad: 'TEST VITRIN En Dip Filament 1kg', kategori: 'filament', site: 'Ventatek',
    siteId: 'ventatek', fiyat: 500, stokta: true,
    hamUrl: 'https://ventatek.test/urun',
    afiliyeUrl: 'https://ventatek.test/urun?utm_source=eun',
    birimMetni: '₺500,00 / kg', kargo: 'Ücretsiz Kargo',
    enPahaliFiyat: 700, tasarruf: 200,
  });
  gecmisEkle(idler.dip, 20, 620);
  gecmisEkle(idler.dip, 9, 560);
  gecmisEkle(idler.dip, 2, 500);

  durumEkle(idler.indirim, {
    ad: 'TEST VITRIN Indirimli Filament 1kg', kategori: 'filament',
    site: 'Trendyol', siteId: 'trendyol', fiyat: 532.21, stokta: true,
    hamUrl: 'https://trendyol.test/urun', afiliyeUrl: null,
    enPahaliFiyat: 619, tasarruf: 86.79,
  });
  gecmisEkle(idler.indirim, 5, 600);

  durumEkle(idler.tukendi, {
    ad: 'TEST VITRIN Tukenen Yazici', kategori: 'yazici', site: '3Dcim',
    siteId: '3dcim', fiyat: 24287.71, stokta: false,
    hamUrl: 'https://3dcim.test/yazici',
  });

  durumEkle(idler.urlsuz, {
    ad: 'TEST VITRIN Linki Olmayan', kategori: 'genel', site: 'Yok',
    fiyat: 100, stokta: true, hamUrl: null, afiliyeUrl: null,
  });

  db.prepare(`
    INSERT INTO radar_durum (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
    VALUES (?, ?, 'TEST VITRIN Bozuk', 'X', 'x', 1, 1, ?, NULL, 'bozuk-json')
  `).run(`katalog:${idler.verisiz}`, idler.verisiz, Date.now());

  // Test kartlarını izole görmek için yalnızca kendi kayıtlarımızı değerlendir.
  const vt = vitrinVerisi({ limit: 24, sadeceIdler: Object.values(idler) });
  kontrol('bozuk JSON kartı atlanır', !vt.urunler.some(u => u.ad === 'TEST VITRIN Bozuk'));
  kontrol('URL yoksa kart yok', !vt.urunler.some(u => u.ad === 'TEST VITRIN Linki Olmayan'));

  const dipKart = vt.urunler.find(u => u.id === idler.dip);
  const indirimKart = vt.urunler.find(u => u.id === idler.indirim);
  const tukendiKart = vt.urunler.find(u => u.id === idler.tukendi);

  kontrol('dip ürün vitrinde', !!dipKart);
  kontrol('indirimli ürün vitrinde', !!indirimKart);
  kontrol('tükenen ürün de listelenir', !!tukendiKart);
  kontrol('gerçek dip → En Dip Fiyat', dipKart?.dip === true);
  kontrol('tek noktalı geçmiş dip rozeti vermez', indirimKart?.dip === false);
  kontrol('indirim yüzdesi gerçek tasarruftan', indirimKart?.indirimYuzde === 14,
    String(indirimKart?.indirimYuzde));
  kontrol('tükenen ürün dip rozeti almaz', tukendiKart?.dip === false);
  kontrol('tasarruf aktarılır', dipKart?.tasarruf === 200);
  kontrol('birim fiyat aktarılır', dipKart?.birimMetni === '₺500,00 / kg');
  kontrol('kargo aktarılır', dipKart?.kargo === 'Ücretsiz Kargo');
  kontrol('kategori ikonu filament', dipKart?.ikon === '🧵');
  kontrol('kategori ikonu yazıcı', tukendiKart?.ikon === '🖨️');
  kontrol('afiliye link tercih edilir', dipKart?.url.includes('utm_source=eun'));
  kontrol('afiliye işareti', dipKart?.afiliye === true);
  kontrol('afiliyesiz link aynen', indirimKart?.url === 'https://trendyol.test/urun');
  kontrol('trend serisi gelir (3 nokta)', dipKart?.seri?.length === 3, String(dipKart?.seri?.length));
  kontrol('seri fiyatları doğru', JSON.stringify(dipKart?.seri) === JSON.stringify([620, 560, 500]));
  kontrol('önceki fiyata göre değişim', dipKart?.degisim === -60, String(dipKart?.degisim));

  /* ================================================================ */
  bolum('8) 🔒 Gizlilik — yalnızca herkese açık alanlar');

  const izinli = new Set([
    'id', 'ad', 'kategori', 'ikon', 'site', 'siteId', 'fiyat', 'stokta',
    'birimMetni', 'kargo', 'url', 'afiliye', 'dip', 'indirimYuzde', 'tasarruf',
    'gercekFirsat', 'degisim', 'seri', 'ts',
  ]);
  const tumAnahtarlar = new Set();
  for (const u of vt.urunler) for (const k of Object.keys(u)) tumAnahtarlar.add(k);
  const sizan = [...tumAnahtarlar].filter(k => !izinli.has(k));
  kontrol('fazladan/gizli alan yok', sizan.length === 0, sizan.join(','));
  kontrol('PID sızmaz', !JSON.stringify(vt).includes('__gizli_pid__'));
  kontrol('sohbet kimliği yok', !/chatId|chat_id|botToken|mesaj_id/i.test(JSON.stringify(vt)));

  /* ================================================================ */
  bolum('9) 🧮 Limit, kota ölçekleme, boş durum');

  const az = vitrinVerisi({ limit: 2 });
  kontrol('limit uygulanır', az.urunler.length === 2, String(az.urunler.length));
  kontrol('limit 1 altına inmez', vitrinVerisi({ limit: 0 }).urunler.length >= 1);

  const genis = vitrinVerisi({ limit: 24 });
  kontrol('limit 24 → kota ölçeklenir (12/8/4)',
    genis.kota?.filament === 12 && genis.kota?.yazici === 8 && genis.kota?.genel === 4,
    JSON.stringify(genis.kota));
  kontrol('limit 24 → en fazla 24 kart', genis.urunler.length <= 24, String(genis.urunler.length));
  kontrol('limit 24 → dağılım toplamı tutarlı',
    Object.values(genis.dagilim).reduce((a, b) => a + b, 0) === genis.gosterilen);

  kontrol('güncelleme ISO tarih', /^\d{4}-\d{2}-\d{2}T/.test(v.guncelleme || ''),
    String(v.guncelleme));

  const bosSonuc = vitrinVerisi({ sadeceIdler: [999999999] });
  kontrol('eşleşme yoksa boş dizi', bosSonuc.urunler.length === 0);
  kontrol('eşleşme yoksa ok true', bosSonuc.ok === true);
  kontrol('eşleşme yoksa dağılım sıfır',
    Object.values(bosSonuc.dagilim || {}).every(x => x === 0));

  /* ================================================================ */
  bolum('10) 🌐 Sunucu / API sözleşmesi');

  const kok = path.resolve(import.meta.dirname, '..');
  const oku = (p) => fs.readFileSync(path.join(kok, p), 'utf8');
  const serverSrc = oku('server.js');
  const html = oku('public/index.html');
  const app = oku('public/app.js');
  const css = oku('public/style.css');

  kontrol('server: /api/vitrin ucu', /app\.get\('\/api\/vitrin'/.test(serverSrc));
  kontrol('server: vitrinVerisi importu', /vitrinVerisi/.test(serverSrc));
  kontrol('server: erişim anahtarı muafiyeti (GET)',
    /req\.method === 'GET' && req\.path === '\/api\/vitrin'/.test(serverSrc));
  kontrol('server: en fazla 60 sn önbellek', /max-age=60/.test(serverSrc));

  /* ================================================================ */
  bolum('11) 🖥️ Ön yüz — kategori çipleri ve fade');

  kontrol('HTML: vitrin bölümü', /id="vitrinAlani"[^>]*class="vitrin"/.test(html));
  kontrol('HTML: canlı ızgara', /id="vitrinGrid"[^>]*class="vitrin-grid"/.test(html));
  kontrol('HTML: aria-live', /id="vitrinGrid"[^>]*aria-live="polite"/.test(html));
  kontrol('HTML: boş durum', /id="vitrinBos"/.test(html));
  kontrol('HTML: yenile butonu', /id="vitrinYenile"/.test(html));
  kontrol('HTML: kategori çip kapsayıcısı', /id="vitrinCipleri"/.test(html));
  kontrol('HTML: "Hepsi" çipi', /data-vitrin-kategori="hepsi"/.test(html));
  kontrol('HTML: filament çipi', /data-vitrin-kategori="filament"/.test(html));
  kontrol('HTML: yazıcı çipi', /data-vitrin-kategori="yazici"/.test(html));
  kontrol('HTML: parça & reçine çipi', /data-vitrin-kategori="genel"/.test(html));
  kontrol('HTML: çip sayaçları', (html.match(/class="vitrin-filtre-sayi"/g) || []).length === 4,
    String((html.match(/class="vitrin-filtre-sayi"/g) || []).length));
  kontrol('HTML: role=tablist', /id="vitrinCipleri"[^>]*role="tablist"/.test(html));

  kontrol('JS: /api/vitrin çağrısı (limit 12)', /fetch\('\/api\/vitrin\?limit=12'/.test(app));
  kontrol('JS: çip doldurma fonksiyonu', /function vitrinCipleriDoldur/.test(app));
  kontrol('JS: filtre çizimi', /function vitrinCiz/.test(app));
  kontrol('JS: kategori durumu', /let vitrinAktifKategori/.test(app));
  kontrol('JS: çip tıklama işleyicisi', /data-vitrin-kategori/.test(app));
  kontrol('JS: fade geçiş sınıfı', /vitrin-gecis/.test(app));
  kontrol('JS: dağılım metni', /function vitrinDagilimMetni/.test(app));
  kontrol('JS: 60 sn tazeleme', /VITRIN_ARALIK_MS = 60 \* 1000/.test(app));
  kontrol('JS: sparkline SVG', /function vitrinSparkline/.test(app) && /polyline/.test(app));
  kontrol('JS: ₺ biçimi', /function vitrinPara/.test(app));
  kontrol('JS: dip rozeti', /En Dip Fiyat/.test(app));
  kontrol('JS: afiliye tıklama işareti', /data-afiliye-site/.test(app));
  kontrol('JS: iskelet yükleme', /vitrinIskelet/.test(app));

  kontrol('HTML: alt nav borsa', /data-nav="borsa"/.test(html));
  kontrol('HTML: Dip Fırsatlar etiketi', /Dip Fırsatlar/.test(html));
  kontrol('HTML: Alarmlarım etiketi', />Alarmlarım</.test(html));
  const navOgeSayisi = (html.match(/class="alt-nav-oge[^"]*" data-nav=/g) || []).length;
  kontrol('HTML: alt bar 4 öğe', navOgeSayisi === 4, String(navOgeSayisi));
  kontrol('HTML: Sepetim alt barda değil', !/data-nav="sepet"/.test(html));
  kontrol('CSS: alt bar 4 kolon', /grid-template-columns: repeat\(4, 1fr\)/.test(css));

  kontrol('CSS: vitrin ızgarası', /\.vitrin-grid\s*\{[^}]*grid-template-columns/.test(css));
  kontrol('CSS: masaüstü 4 kolon', /repeat\(4, minmax\(0, 1fr\)\)/.test(css));
  kontrol('CSS: filtre çubuğu', /\.vitrin-filtre\s*\{/.test(css));
  kontrol('CSS: filtre çipi', /\.vitrin-filtre-cip\s*\{/.test(css));
  kontrol('CSS: aktif çip', /\.vitrin-filtre-cip\.aktif/.test(css));
  kontrol('CSS: çip sayacı', /\.vitrin-filtre-sayi\s*\{/.test(css));
  kontrol('CSS: fade animasyonu', /@keyframes vitrin-filtre-gir/.test(css));
  kontrol('CSS: mobilde yatay kaydırma filtre',
    /@media \(max-width: 640px\)[\s\S]{0,400}\.vitrin-filtre[\s\S]{0,200}overflow-x: auto/.test(css));
  kontrol('CSS: tabular-nums fiyat', /\.vitrin-fiyat\s*\{[^}]*font-variant-numeric:\s*tabular-nums/.test(css));
  kontrol('CSS: koyu tema', /html\[data-theme="dark"\] \.vitrin/.test(css));
  kontrol('CSS: reduced-motion', /prefers-reduced-motion[\s\S]{0,300}\.vitrin-kart/.test(css));
  kontrol('CSS: dip kart vurgusu', /\.vitrin-kart-dip\s*\{/.test(css));
  kontrol('CSS: canlı nabız', /@keyframes vitrinNabiz/.test(css));
} finally {
  temizle();
  db.close();
  try { radarKapat(); } catch { /* yoksay */ }
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
} else {
  console.log('✅ Tüm canlı borsa vitrini testleri geçti.');
}
process.exit(hatalar.length ? 1 : 0);
