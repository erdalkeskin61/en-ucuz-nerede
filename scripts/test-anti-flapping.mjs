/**
 * 🛡️ Anti-Flapping (Dalgalanma Filtresi) & %4 Akıllı Eşik Testi — 2026-11-11
 *
 * ÖLÇÜLEN SORUN: DB denetiminde Creality Ender PLA **30**, Microzey PLA **50**
 * kez Telegram'a gönderilmişti. İki kök neden:
 *  1. `yeni.fiyat < eski - 0.005` → 1 kuruşluk düşüş bile bildirim atıyordu.
 *  2. `siteId` değişince koşulsuz bildirim → adaptör 1 tur gecikince
 *     "en ucuz mağaza değişti" (₺723), ertesi tur geri dönünce "fiyat düştü"
 *     (₺611) → mağaza ping-pong'u günde 5 kez spam.
 *
 * KAPSAM
 *  1)  Kural 1: 24 saat içinde yalnızca %4+ derin indirim
 *  2)  Kural 2: mağaza değişimi + fiyat artışı → asla bildirim
 *  3)  Kural 3: ping-pong (A → B → A) koruması
 *  4)  24 saat sonrası anlamlı düşüş eşiği (%1,5 / 10 TL) + 48 sa özet
 *  5)  Stok / ilk tespit / yeniden stokta
 *  6)  Gerçek DB entegrasyonu: radar_gonderim + sonGonderimler()
 *  7)  Kural 4: fırsat kanalı hata cooldown'ı (6 sa)
 *  8)  "Spam simülasyonu": günde 5 tur → en fazla 1 bildirim
 *  9)  Kaynak sözleşmeleri
 *
 *   node scripts/test-anti-flapping.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  bildirimKarari, sonGonderimler, radarKapat,
} from '../src/otonomRadar.js';
import {
  spamKontrolu, firsatKaydet, firsatAyar, firsatKapat,
} from '../src/firsatKanali.js';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';

const KOK = path.resolve(import.meta.dirname, '..');
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

const SAAT = 3600 * 1000;
const GUN = 24 * SAAT;
const SIMDI = Date.UTC(2026, 10, 11, 12, 0, 0);

/** Güncel radar durumu üreticisi. */
const durum = (ek = {}) => ({
  anahtar: ek.anahtar || 'katalog:1',
  ad: ek.ad || 'Creality Ender PLA Gri 1kg',
  site: ek.site || 'URHANSHOP',
  siteId: ek.siteId || 'urhanshop',
  fiyat: ek.fiyat ?? 611.38,
  stokta: ek.stokta !== false,
  paylasimTs: ek.paylasimTs ?? null,
  paylasimFiyati: ek.paylasimFiyati ?? null,
});

/* ------------------------------------------------------------------ */
bolum('1) 🎯 Kural 1 — 24 saat içinde yalnızca %4+ derin indirim');

// Görevdeki birebir senaryo: ₺611,38 → ₺610,00, son bildirim 2 saat önce.
const kucuk = bildirimKarari(
  durum({ fiyat: 610.00 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 2 * SAAT }),
  { simdi: SIMDI },
);
kontrol('1 kuruşluk düşüş bildirim ATMAZ', kucuk.gonder === false, JSON.stringify(kucuk));
kontrol('neden %4 eşiği', /%4 indirim eşiği aşılmadı/.test(kucuk.neden), kucuk.neden);

const derin = bildirimKarari(
  durum({ fiyat: 570.00 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 2 * SAAT }),
  { simdi: SIMDI },
);
kontrol('₺570 (%6,8) bildirim ATAR', derin.gonder === true, JSON.stringify(derin));
kontrol('neden "derin fiyat düşüşü"', /derin fiyat düşüşü/.test(derin.neden), derin.neden);
kontrol('yüzde hesaplanır (%6,8)', /\(%6[.,]8\)/.test(derin.neden), derin.neden);
kontrol('öncelik 5', derin.oncelik === 5, String(derin.oncelik));

// Tam eşik: 611,38 × 0,96 = 586,92
const tamEsik = bildirimKarari(
  durum({ fiyat: 586.92 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - SAAT }),
  { simdi: SIMDI },
);
kontrol('tam %4 eşiği bildirim ATAR', tamEsik.gonder === true, JSON.stringify(tamEsik));
const esikAlti = bildirimKarari(
  durum({ fiyat: 586.93 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - SAAT }),
  { simdi: SIMDI },
);
kontrol('eşiğin 1 kuruş üstü ATMAZ', esikAlti.gonder === false, JSON.stringify(esikAlti));

// "Son paylaşılan fiyat" gözlem fiyatından farklıysa o kullanılır.
const paylasilanBazli = bildirimKarari(
  durum({ fiyat: 570 }),
  durum({ fiyat: 600, paylasimTs: SIMDI - 2 * SAAT, paylasimFiyati: 611.38 }),
  { simdi: SIMDI },
);
kontrol('paylaşım fiyatı baz alınır (611,38×0,96=586,9)',
  paylasilanBazli.gonder === true, JSON.stringify(paylasilanBazli));

// 24 saat tam sınırı
const tam24 = bildirimKarari(
  durum({ fiyat: 610 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - GUN }),
  { simdi: SIMDI },
);
kontrol('tam 24 saatte cooldown biter, anlamlı düşüş aranır', tam24.gonder === false,
  JSON.stringify(tam24));

/* ------------------------------------------------------------------ */
bolum('2) 🚫 Kural 2 — mağaza değişimi + fiyat artışı ASLA bildirilmez');

const flap = bildirimKarari(
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723 }),
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 611.38, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI },
);
kontrol('URHANSHOP ₺611 → HB ₺723 ENGELLENİR', flap.gonder === false, JSON.stringify(flap));
kontrol('neden "yeni mağaza daha pahalı"', /yeni mağaza daha pahalı/.test(flap.neden), flap.neden);

// 24 saat içinde de engellenir (Kural 1 zaten engeller, ama neden Kural 2 olmalı)
const flap24 = bildirimKarari(
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723 }),
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 611.38, paylasimTs: SIMDI - 2 * SAAT }),
  { simdi: SIMDI },
);
kontrol('24 saat içinde de pahalı mağaza engellenir', flap24.gonder === false, JSON.stringify(flap24));
kontrol('neden Kural 2', /daha pahalı/.test(flap24.neden), flap24.neden);

// Daha ucuz yeni mağaza → bildirim (24 saatten sonra)
const ucuzMagaza = bildirimKarari(
  durum({ site: 'Trendyol', siteId: 'trendyol', fiyat: 580 }),
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 611.38, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI },
);
kontrol('daha ucuz yeni mağaza bildirilir (%1,5+ düşüş)', ucuzMagaza.gonder === true,
  JSON.stringify(ucuzMagaza));

/* ------------------------------------------------------------------ */
bolum('3) 🔁 Kural 3 — ping-pong (A → B → A) koruması');

// Geçmiş: 1 saat önce HB ₺723, 3 saat önce URHANSHOP ₺611,38
const gecmisPingPong = [
  { site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, ts: SIMDI - 1 * SAAT },
  { site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 611.38, ts: SIMDI - 3 * SAAT },
];
const donus = bildirimKarari(
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 615 }),
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, paylasimTs: SIMDI - 1 * SAAT }),
  { simdi: SIMDI, sonGonderimler: gecmisPingPong },
);
kontrol('URHANSHOP\'a pahalı dönüş (₺615 > ₺611,38) ENGELLENİR',
  donus.gonder === false, JSON.stringify(donus));
kontrol('neden ping-pong', /ping-pong/.test(donus.neden), donus.neden);

// Aynı dönüş ama DAHA UCUZ → bildirim
const donusUcuz = bildirimKarari(
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 590 }),
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, paylasimTs: SIMDI - 1 * SAAT }),
  { simdi: SIMDI, sonGonderimler: gecmisPingPong },
);
kontrol('daha ucuz dönüş (₺590 < ₺611,38) bildirilir', donusUcuz.gonder === true,
  JSON.stringify(donusUcuz));

// Geçmiş 24 saatten eskiyse ping-pong koruması devre dışı
const eskiGecmis = [
  { site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, ts: SIMDI - 30 * SAAT },
  { site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 611.38, ts: SIMDI - 40 * SAAT },
];
const eskiDonus = bildirimKarari(
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 615 }),
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI, sonGonderimler: eskiGecmis },
);
kontrol('24 saatten eski geçmiş ping-pong saymaz (özet bildirimi)',
  eskiDonus.gonder === true, JSON.stringify(eskiDonus));

// Geçmiş yoksa ping-pong kontrolü yapılmaz (ilk durumlar bozulmaz)
const gecmissiz = bildirimKarari(
  durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 615 }),
  durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI },
);
kontrol('geçmiş yoksa hata vermez', typeof gecmissiz.gonder === 'boolean');

/* ------------------------------------------------------------------ */
bolum('4) 📉 24 saat sonrası anlamlı düşüş ve 48 sa özet');

const anlamli = bildirimKarari(
  durum({ fiyat: 595 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI },
);
kontrol('₺16 düşüş (>=10 TL ve >=%1,5) bildirilir', anlamli.gonder === true, JSON.stringify(anlamli));
kontrol('neden "fiyat düştü"', anlamli.neden === 'fiyat düştü', anlamli.neden);

const kucukUzun = bildirimKarari(
  durum({ fiyat: 605 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 30 * SAAT }),
  { simdi: SIMDI },
);
kontrol('₺6 düşüş (<10 TL) 24 saat sonra da bildirilmez', kucukUzun.gonder === false,
  JSON.stringify(kucukUzun));

const ozet = bildirimKarari(
  durum({ fiyat: 611.38 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 50 * SAAT }),
  { simdi: SIMDI, paylasimAraligiSaat: 48 },
);
kontrol('48 saat dolunca özet bildirimi', ozet.gonder === true, JSON.stringify(ozet));
kontrol('neden "48 saatlik özet süresi doldu"', /48 saatlik özet/.test(ozet.neden), ozet.neden);
kontrol('özet önceliği 2', ozet.oncelik === 2, String(ozet.oncelik));

const ozetErken = bildirimKarari(
  durum({ fiyat: 611.38 }),
  durum({ fiyat: 611.38, paylasimTs: SIMDI - 36 * SAAT }),
  { simdi: SIMDI, paylasimAraligiSaat: 48 },
);
kontrol('36 saatte özet yok (cooldown)', ozetErken.gonder === false, JSON.stringify(ozetErken));

/* ------------------------------------------------------------------ */
bolum('5) 📦 Stok / ilk tespit durumları');

kontrol('stokta değilse asla gönderilmez',
  bildirimKarari(durum({ stokta: false }), null).gonder === false);
kontrol('fiyat 0 ise gönderilmez',
  bildirimKarari(durum({ fiyat: 0 }), null).gonder === false);
kontrol('fiyat null ise gönderilmez',
  bildirimKarari({ ...durum(), fiyat: null }, null).gonder === false);
kontrol('yeni null → gönderilmez', bildirimKarari(null, null).gonder === false);
kontrol('ilk tespit gönderilir', bildirimKarari(durum(), null).gonder === true);
kontrol('ilk tespit nedeni', bildirimKarari(durum(), null).neden === 'ilk tespit');
kontrol('yeniden stokta → gönderilir',
  bildirimKarari(durum(), durum({ stokta: false })).gonder === true);
kontrol('yeniden stokta önceliği 4',
  bildirimKarari(durum(), durum({ stokta: false })).oncelik === 4);

/* ------------------------------------------------------------------ */
bolum('6) 🗄️ Gerçek DB — radar_gonderim ve sonGonderimler()');

const TABAN_ID = 980000 + (Date.now() % 1000);
const testAnahtar = `katalog:${TABAN_ID}`;
const db = new DatabaseSync(path.join(config.dataDir, 'en_ucuz_nerede.db'));
const gonderimEkle = (site, fiyat, ts) => db.prepare(`
  INSERT INTO radar_gonderim (anahtar, urun, site, fiyat, ts, durum, neden, mesaj_id, hata)
  VALUES (?, 'TEST AntiFlapping', ?, ?, ?, 'gonderildi', 'test', NULL, NULL)
`).run(testAnahtar, site, fiyat, ts);

try {
  gonderimEkle('Hepsiburada', 723, SIMDI - 1 * SAAT);
  gonderimEkle('URHANSHOP', 611.38, SIMDI - 3 * SAAT);

  const gecmis = sonGonderimler(testAnahtar, { limit: 3 });
  kontrol('sonGonderimler 2 kayıt döner', gecmis.length === 2, String(gecmis.length));
  kontrol('yeniden eskiye sıralı', gecmis[0].site === 'Hepsiburada', gecmis[0].site);
  kontrol('fiyat okunur', gecmis[1].fiyat === 611.38, String(gecmis[1].fiyat));
  kontrol('geçersiz anahtar → boş dizi', sonGonderimler('katalog:yok').length === 0);

  // Uçtan uca: DB geçmişiyle ping-pong engeli
  const dbKarar = bildirimKarari(
    durum({ site: 'URHANSHOP', siteId: 'urhanshop', fiyat: 615 }),
    durum({ site: 'Hepsiburada', siteId: 'hepsiburada', fiyat: 723, paylasimTs: SIMDI - 1 * SAAT }),
    { simdi: SIMDI, sonGonderimler: gecmis },
  );
  kontrol('DB geçmişiyle ping-pong engellenir', dbKarar.gonder === false, JSON.stringify(dbKarar));
} finally {
  try { db.prepare('DELETE FROM radar_gonderim WHERE anahtar = ?').run(testAnahtar); } catch { /* yoksay */ }
  db.close();
}

/* ------------------------------------------------------------------ */
bolum('7) 📢 Kural 4 — fırsat kanalı HATA cooldown (6 sa)');

const FIRSAT_ANAHTAR = `urn:${TABAN_ID}:af`;
const firsat = {
  anahtar: FIRSAT_ANAHTAR,
  urun: 'TEST AntiFlapping Fırsat',
  site: 'Trendyol',
  fiyat: 500,
  referans: 700,
  indirim: 28,
};
const fdb = new DatabaseSync(path.join(config.dataDir, 'en_ucuz_nerede.db'));

try {
  fdb.prepare('DELETE FROM firsat_gonderim WHERE anahtar = ?').run(FIRSAT_ANAHTAR);

  const ayar = firsatAyar({ enabled: true, kanal: 'test', cooldownSaat: 48, hataCooldownSaat: 6 });

  // Temizken uygun
  const temiz = spamKontrolu(firsat, { ayar, simdi: SIMDI });
  kontrol('temizken uygun', temiz.uygun === true, JSON.stringify(temiz));

  // Hata kaydı ekle → 6 saat engel
  firsatKaydet(firsat, 'hata', { hata: 'kanal kimliği eksik', ts: SIMDI - 1 * SAAT });
  const hataSonrasi = spamKontrolu(firsat, { ayar, simdi: SIMDI });
  kontrol('hata sonrası 1 saat: engellenir', hataSonrasi.uygun === false, JSON.stringify(hataSonrasi));
  kontrol('neden "hata cooldown"', /hata cooldown/.test(hataSonrasi.neden), hataSonrasi.neden);
  kontrol('hata sebebi raporda', /kanal kimliği/.test(String(hataSonrasi.son?.hata || '')),
    String(hataSonrasi.son?.hata));

  // 5 saat sonra hâlâ engel (6 sa dolmadı)
  const besSaat = spamKontrolu(firsat, { ayar, simdi: SIMDI + 4 * SAAT });
  kontrol('hata + 5 saat: hâlâ engellenir', besSaat.uygun === false, JSON.stringify(besSaat));

  // 7 saat sonra serbest
  const yediSaat = spamKontrolu(firsat, { ayar, simdi: SIMDI + 6 * SAAT });
  kontrol('hata + 7 saat: serbest', yediSaat.uygun === true, JSON.stringify(yediSaat));

  // Başarılı gönderim kendi (48 sa) cooldown'unu kullanır
  fdb.prepare('DELETE FROM firsat_gonderim WHERE anahtar = ?').run(FIRSAT_ANAHTAR);
  firsatKaydet(firsat, 'gonderildi', { mesajId: '123', ts: SIMDI - 1 * SAAT });
  const basariliSonrasi = spamKontrolu(firsat, { ayar, simdi: SIMDI });
  kontrol('başarılı sonrası 48 sa cooldown', basariliSonrasi.uygun === false,
    JSON.stringify(basariliSonrasi));
  kontrol('neden "cooldown (48 sa"', /cooldown \(48 sa/.test(basariliSonrasi.neden),
    basariliSonrasi.neden);

  // hataCooldownSaat = 0 → kapalı
  const kapali = firsatAyar({ enabled: true, kanal: 't', cooldownSaat: 48, hataCooldownSaat: 0 });
  fdb.prepare('DELETE FROM firsat_gonderim WHERE anahtar = ?').run(FIRSAT_ANAHTAR);
  firsatKaydet(firsat, 'hata', { hata: 'x', ts: SIMDI - 1 * SAAT });
  kontrol('hataCooldownSaat=0 → engel yok',
    spamKontrolu(firsat, { ayar: kapali, simdi: SIMDI }).uygun === true);

  // Varsayılan ayar 6 saat içerir
  kontrol('varsayılan hataCooldownSaat = 6', ayar.hataCooldownSaat === 6, String(ayar.hataCooldownSaat));
  const varsayilan = firsatAyar({ enabled: false });
  kontrol('firsatAyar varsayılanı 6', varsayilan.hataCooldownSaat === 6,
    String(varsayilan.hataCooldownSaat));
} finally {
  try { fdb.prepare('DELETE FROM firsat_gonderim WHERE anahtar = ?').run(FIRSAT_ANAHTAR); } catch { /* yoksay */ }
  fdb.close();
}

/* ------------------------------------------------------------------ */
bolum('8) 🔬 Spam simülasyonu — günde 5 tur');

// 3 saatte bir tarama (günde 5 kez), fiyat ±1-2 TL dalgalanıyor.
// Beklenen: 24 saatte EN FAZLA 1 bildirim (ilk tespit) + %4+ düşüş.
let gonderim = 0;
let sonDurum = null;
let paylasimTs = null;
let paylasimFiyati = null;
const fiyatlar = [611.38, 610.00, 612.50, 609.90, 611.00, 610.50, 611.38, 609.00];
for (let tur = 0; tur < fiyatlar.length; tur++) {
  const simdi = SIMDI + tur * 3 * SAAT; // 24 sa içinde (8 tur = 24 sa sınırı)
  const yeni = durum({ fiyat: fiyatlar[tur] });
  const eski = sonDurum
    ? durum({ fiyat: sonDurum, paylasimTs, paylasimFiyati })
    : null;
  const karar = bildirimKarari(yeni, eski, { simdi });
  if (karar.gonder) {
    gonderim++;
    paylasimTs = simdi;
    paylasimFiyati = fiyatlar[tur];
  }
  sonDurum = fiyatlar[tur];
}
kontrol('kuruş dalgalanmasında 24 saatte <= 2 bildirim', gonderim <= 2, String(gonderim));
kontrol('en az 1 bildirim (ilk tespit)', gonderim >= 1, String(gonderim));

// Aynı senaryo %5'lik düşüşle: bildirim gitmeli
let gonderim2 = 0;
let son2 = null, ts2 = null, pf2 = null;
const fiyatlar2 = [611.38, 610, 611, 580, 581, 582, 583, 584];
for (let tur = 0; tur < fiyatlar2.length; tur++) {
  const simdi = SIMI2(tur);
  function SIMI2(t) { return SIMDI + t * 3 * SAAT; }
  const yeni = durum({ fiyat: fiyatlar2[tur] });
  const eski = son2 ? durum({ fiyat: son2, paylasimTs: ts2, paylasimFiyati: pf2 }) : null;
  const karar = bildirimKarari(yeni, eski, { simdi });
  if (karar.gonder) { gonderim2++; ts2 = simdi; pf2 = fiyatlar2[tur]; }
  son2 = fiyatlar2[tur];
}
kontrol('%5 düşüşte bildirim gider', gonderim2 >= 2, String(gonderim2));
kontrol('%5 düşüşte 2 bildirimden fazla olmaz', gonderim2 <= 3, String(gonderim2));

// Eski (hatalı) mantık simülasyonu: kaç bildirim atardı?
let eskiMantik = 0;
let oncekiFiyat = null;
for (const f of fiyatlar) {
  if (oncekiFiyat != null && f < oncekiFiyat - 0.005) eskiMantik++;
  oncekiFiyat = f;
}
kontrol('eski mantık daha çok bildirim atardı (regresyon kanıtı)',
  eskiMantik > gonderim, `eski=${eskiMantik} yeni=${gonderim}`);

/* ------------------------------------------------------------------ */
bolum('9) 📄 Kaynak sözleşmesi');

const radarSrc = fs.readFileSync(path.join(KOK, 'src/otonomRadar.js'), 'utf8');
const firsatSrc = fs.readFileSync(path.join(KOK, 'src/firsatKanali.js'), 'utf8');

kontrol('radar: %4 eşiği kodu', /\* 0\.96/.test(radarSrc) || /0\.96/.test(radarSrc));
kontrol('radar: 24 saat sabiti', /GUN_MS = 24 \* SAAT_MS/.test(radarSrc));
kontrol('radar: ping-pong koruması', /ping-pong/.test(radarSrc));
kontrol('radar: "yeni mağaza daha pahalı"', /yeni mağaza daha pahalı/.test(radarSrc));
kontrol('radar: anlamlı düşüş eşiği (%1,5 / 10 TL)',
  /Math\.max\(10, eskiFiyat \* 0\.015\)/.test(radarSrc));
kontrol('radar: eski "0.005" tek başına kalmadı',
  !/yeni\.fiyat < oncekiFiyat - 0\.005/.test(radarSrc));
kontrol('radar: sonGonderimler export', /export function sonGonderimler/.test(radarSrc));
kontrol('radar: paylasimFiyati saklanır', /durum\.paylasimFiyati = durum\.fiyat/.test(radarSrc));
kontrol('radar: çağrıda geçmiş geçilir',
  /sonGonderimler: gonder \? sonGonderimler\(durum\.anahtar/.test(radarSrc));

kontrol('fırsat: hataCooldownSaat varsayılanı 6',
  /hataCooldownSaat: 6/.test(firsatSrc));
kontrol('fırsat: hata cooldown sorgusu',
  /durum = 'hata'[\s\S]{0,400}hataCooldownSaat/.test(firsatSrc));
kontrol('fırsat: hata cooldown raporda', /hata cooldown \(/.test(firsatSrc));

/* ------------------------------------------------------------------ */
try { radarKapat(); } catch { /* yoksay */ }
try { firsatKapat(); } catch { /* yoksay */ }

console.log('\n' + '─'.repeat(50));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
