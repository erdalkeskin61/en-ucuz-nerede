/**
 * 🗂️ Radar Kataloğu — NULL URL Doğrulama & Seed v5 Testi (2026-11-10)
 *
 * SORUN: radar_katalog'daki 19 kaydın 11'inde `url` NULL idi. Radar her turda
 * `hizliKaynakUrunBul(sorgu)` ile arama motoruna düşüyor, "Anycubic Kobra 2 Neo"
 * araması ₺187'lik **silikon çorap** döndürüyor, sıkı filtre bunu haklı olarak
 * reddedince ürün radar dışı kalıyordu (kaynakYok: true → 61 mağazada taranmıyor).
 *
 * KAPSAM
 *  1)  Seed sürümü 5 ve katalog bütünlüğü (tekrar yok, URL şeması geçerli)
 *  2)  DB durumu: AKTİF kayıtların hiçbirinde boş URL yok
 *  3)  Anycubic Kobra 2 Neo (ID 12): uydurma link YOK, gerekçeli pasif
 *  4)  Bambu Lab A1 Mini (ID 8): kanonik URL bağlı, kaynakYok üretilmiyor
 *  5)  Göç idempotent (iki kez çalışsa da kayıt çoğalmaz)
 *  6)  Tire normalizasyonu (Kobra-2 ≡ Kobra 2) + yedek parça filtresi
 *  7)  Kaynak sözleşmesi (otonomRadar / urunArama)
 *  8)  CANLI `--canli`: her aktif URL'den gerçek fiyat (getProduct) + A1 Mini stoğu
 *
 *   node scripts/test-katalog-seed.mjs
 *   node scripts/test-katalog-seed.mjs --canli
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import {
  VARSAYILAN_KATALOG, KATALOG_SEED_SURUMU, KATALOG_ASGARI, katalogGetir, katalogDogrula,
  katalogEkle, katalogSil, radarKapat, urunIkonu,
} from '../src/otonomRadar.js';
import {
  tireNormalize, yaziciSorgusuMu, aksesuarAdayMi,
  sorguPuanla, kaynakEslesirMi, sorguKademeleriUret,
} from '../src/urunArama.js';
import { adapterById, detectSite } from '../src/sites/index.js';
import { dbBaglantisi } from '../src/store.js';

const KOK = path.resolve(import.meta.dirname, '..');
const oku = (p) => fs.readFileSync(path.join(KOK, p), 'utf8');
const KATALOG_DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');

let gecen = 0, toplam = 0, atlanan = 0;
const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) { gecen++; return true; }
  hatalar.push(ad + (ek ? ` — ${ek}` : ''));
  console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
  return false;
};
const atla = (ad, neden) => { atlanan++; console.log(`  ℹ️  ATLANDI: ${ad} — ${neden}`); };
const bolum = (ad) => console.log(`\n${ad}`);

const gecerliUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u.trim());
const katalog = katalogGetir();
const aktifler = katalog.filter(k => k.aktif);
const pasifler = katalog.filter(k => !k.aktif);
const adaGore = (parca) => katalog.find(k => String(k.ad).toLowerCase().includes(parca.toLowerCase()));

/* ------------------------------------------------------------------ */
bolum('1) 🌱 Seed sürümü ve katalog bütünlüğü');

// Seed surumu her veri duzeltmesinde artar (v5 = NULL URL'ler, v6 = recine,
// v7 = PETG/TPU/recine/nozzle/kurutucu genislemesi).
kontrol('KATALOG_SEED_SURUMU >= 7', KATALOG_SEED_SURUMU >= 7, String(KATALOG_SEED_SURUMU));
kontrol('katalog >= 35 ürün', katalog.length >= 35, String(katalog.length));
kontrol('VARSAYILAN_KATALOG dizi ve dolu', Array.isArray(VARSAYILAN_KATALOG) && VARSAYILAN_KATALOG.length > 0,
  String(VARSAYILAN_KATALOG.length));

const varsayilanAdlar = VARSAYILAN_KATALOG.map(k => String(k.ad).toLowerCase().trim());
kontrol('varsayılan adlar benzersiz', new Set(varsayilanAdlar).size === varsayilanAdlar.length,
  `${new Set(varsayilanAdlar).size}/${varsayilanAdlar.length}`);
kontrol('her varsayılanın ad + sorgu + kategori alanı var',
  VARSAYILAN_KATALOG.every(k => k.ad && k.sorgu && ['filament', 'yazici', 'genel'].includes(k.kategori)));
kontrol('dolu varsayılan URL’ler http(s)',
  VARSAYILAN_KATALOG.filter(k => k.url).every(k => gecerliUrl(k.url)));
kontrol('URL’siz varsayılanlar pasif gerekçesi taşır',
  VARSAYILAN_KATALOG.filter(k => !k.url).every(k => typeof k.pasifNeden === 'string' && k.pasifNeden.length > 10));

kontrol('DB kataloğu dolu', katalog.length >= 15, String(katalog.length));
kontrol('DB adları benzersiz (yinelenen yok)',
  new Set(katalog.map(k => k.ad.toLowerCase().trim())).size === katalog.length,
  `${new Set(katalog.map(k => k.ad.toLowerCase().trim())).size}/${katalog.length}`);

/* ------------------------------------------------------------------ */
bolum('1b) 🛡️ Katalog bütünlük sözleşmesi (katalogDogrula) — 2026-11-11');

const dogrulama = katalogDogrula();
kontrol('katalogDogrula().ok === true', dogrulama.ok === true,
  (dogrulama.hatalar || []).join(' | '));
kontrol('katalogDogrula: NULL URL sayısı 0', dogrulama.bosUrlSayisi === 0,
  String(dogrulama.bosUrlSayisi));
kontrol('katalogDogrula: hata listesi boş', dogrulama.hatalar.length === 0,
  dogrulama.hatalar.join(' | '));
kontrol('katalogDogrula: aktif + pasif = toplam',
  dogrulama.aktif + dogrulama.pasif === dogrulama.toplam,
  `${dogrulama.aktif}+${dogrulama.pasif}≠${dogrulama.toplam}`);
kontrol('katalogDogrula: gerekçesiz pasif yok', dogrulama.gerekcesizPasifSayisi === 0,
  String(dogrulama.gerekcesizPasifSayisi));
kontrol('katalogDogrula: integrity_check ok', dogrulama.pragma.integrity === 'ok',
  String(dogrulama.pragma.integrity));
kontrol('katalogDogrula: journal_mode wal', dogrulama.pragma.journalMode === 'wal',
  String(dogrulama.pragma.journalMode));
kontrol('katalogDogrula: busy_timeout 5000', dogrulama.pragma.busyTimeout === 5000,
  String(dogrulama.pragma.busyTimeout));
kontrol('katalogDogrula: synchronous normal', dogrulama.pragma.synchronous === 1,
  String(dogrulama.pragma.synchronous));

// Kategori kotası sözleşmesi (KATALOG_ASGARI) + gerçek sayımlar.
kontrol('asgari eşikler: filament 18 / yazıcı 6 / genel 10',
  KATALOG_ASGARI.filament === 18 && KATALOG_ASGARI.yazici === 6 && KATALOG_ASGARI.genel === 10,
  JSON.stringify(KATALOG_ASGARI));
kontrol('dagilim.filament >= 19', dogrulama.dagilim.filament >= 19, String(dogrulama.dagilim.filament));
kontrol('dagilim.yazici >= 7', dogrulama.dagilim.yazici >= 7, String(dogrulama.dagilim.yazici));
kontrol('dagilim.genel >= 12', dogrulama.dagilim.genel >= 12, String(dogrulama.dagilim.genel));

// SQLite ayarları uygulamanın gerçek bağlantılarında da geçerli.
// (PRAGMA'lar bağlantı bazlıdır: yeni bir DatabaseSync varsayılanla açılır,
//  bu yüzden uygulama bağlantıları — radar + store — denetlenir.)
{
  const db = dbBaglantisi();
  kontrol('store: PRAGMA journal_mode = wal',
    String(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toLowerCase() === 'wal');
  kontrol('store: PRAGMA busy_timeout >= 5000',
    Number(db.prepare('PRAGMA busy_timeout').get()?.timeout) >= 5000,
    String(db.prepare('PRAGMA busy_timeout').get()?.timeout));
  kontrol('store: PRAGMA synchronous = 1 (NORMAL)',
    Number(db.prepare('PRAGMA synchronous').get()?.synchronous) === 1,
    String(db.prepare('PRAGMA synchronous').get()?.synchronous));
}

// --- Nöbetçi: hatalı katalogu yakalıyor mu? (geçici kopya DB) ---
{
  const kopyaYol = path.join(os.tmpdir(), `eun-katalog-dogrula-${process.pid}.db`);
  try { fs.unlinkSync(kopyaYol); } catch { /* yoksa yoksay */ }
  fs.copyFileSync(KATALOG_DB_YOLU, kopyaYol);
  const kdb = new DatabaseSync(kopyaYol);
  try {
    // 1) Aktif ürünün URL'sini NULL yap → sıfır-NULL ihlali
    const hedef = kdb.prepare('SELECT id FROM radar_katalog WHERE aktif = 1 LIMIT 1').get();
    kdb.prepare('UPDATE radar_katalog SET url = NULL WHERE id = ?').run(hedef.id);
    const bozuk = katalogDogrula({ db: kdb });
    kontrol('bozuk katalogda ok=false', bozuk.ok === false);
    kontrol('NULL URL yakalanır', bozuk.bosUrlSayisi === 1, String(bozuk.bosUrlSayisi));
    kontrol('hata mesajı ürün adını içerir',
      bozuk.hatalar.some(h => /URL'si boş \(NULL\)/.test(h)), bozuk.hatalar.join(' | '));

    // 2) Kategori kotasını boz → eşik uyarısı
    kdb.prepare("UPDATE radar_katalog SET kategori = 'genel' WHERE kategori = 'filament'").run();
    const kotaBozuk = katalogDogrula({ db: kdb });
    kontrol('kategori kotası ihlali yakalanır',
      kotaBozuk.hatalar.some(h => /Kategori kotası bozuk: filament/.test(h)),
      kotaBozuk.hatalar.join(' | '));

    // 3) Gerekçesiz pasif → uyarı
    kdb.prepare("UPDATE radar_katalog SET pasif_neden = '' WHERE aktif = 0").run();
    const pasifBozuk = katalogDogrula({ db: kdb });
    kontrol('gerekçesiz pasif yakalanır',
      pasifBozuk.hatalar.some(h => /pasif_neden açıklaması eksik/.test(h)),
      pasifBozuk.hatalar.join(' | '));
  } finally { kdb.close(); }
  try { fs.unlinkSync(kopyaYol); } catch { /* yoksay */ }
}

// --- Yazma koruması: URL'siz kayıt AKTİF olamaz ---
{
  const ad = 'TEST KATALOG URL Koruma ' + Date.now();
  const kayit = katalogEkle({ ad, sorgu: ad, kategori: 'genel' });
  try {
    kontrol('URL\'siz kayıt PASİF eklenir', kayit.aktif === false, String(kayit.aktif));
    kontrol('URL\'siz kayıt gerekçe taşır',
      /Kanonik ürün URL/i.test(String(kayit.pasifNeden || '')), String(kayit.pasifNeden));
    kontrol('URL\'siz kayıt radar taramasına girmez',
      !katalogGetir({ sadeceAktif: true }).some(k => k.id === kayit.id));
    const sonra = katalogDogrula();
    kontrol('URL\'siz ekleme bütünlüğü bozmaz', sonra.ok === true, sonra.hatalar.join(' | '));
  } finally {
    katalogSil(kayit.id);
  }

  const ad2 = 'TEST KATALOG URL Gecerli ' + Date.now();
  const kayit2 = katalogEkle({
    ad: ad2, sorgu: ad2, kategori: 'filament',
    url: 'https://example.com/test-urun',
  });
  try {
    kontrol('geçerli URL ile AKTİF eklenir', kayit2.aktif === true, String(kayit2.aktif));
    kontrol('geçerli URL kaydedilir', kayit2.url === 'https://example.com/test-urun', String(kayit2.url));
  } finally {
    katalogSil(kayit2.id);
  }

  let urlHatasi = false;
  try { katalogEkle({ ad: 'TEST KATALOG Gecersiz URL', url: 'ftp://x/y' }); } catch { urlHatasi = true; }
  kontrol('http(s) dışı URL reddedilir', urlHatasi);
}

/* ------------------------------------------------------------------ */
bolum('2) 🚫 AKTİF kayıtlarda boş URL yok');

kontrol('aktif kayıt sayısı > 0', aktifler.length > 0, String(aktifler.length));
const boşUrlAktif = aktifler.filter(k => !k.url || !String(k.url).trim());
kontrol('aktif kayıtlarda boş URL = 0', boşUrlAktif.length === 0,
  boşUrlAktif.map(k => k.ad).join(', ') || 'temiz');
kontrol('aktif URL’ler http(s)',
  aktifler.every(k => gecerliUrl(k.url)),
  aktifler.filter(k => !gecerliUrl(k.url)).map(k => k.ad).join(', ') || 'temiz');
kontrol('pasif kayıtlar gerekçe taşır',
  pasifler.every(k => typeof k.pasifNeden === 'string' && k.pasifNeden.length > 10),
  pasifler.map(k => `${k.ad}:${k.pasifNeden || 'YOK'}`).join(' | ') || 'pasif yok');

/* ------------------------------------------------------------------ */
bolum('3) 🖨️ Anycubic Kobra 2 Neo (ID 12) — uydurma link YOK');

const kobra = adaGore('Kobra 2 Neo');
kontrol('Kobra 2 Neo katalogda', !!kobra);
if (kobra) {
  kontrol('ID 12 kaydı', kobra.id === 12, String(kobra.id));
  kontrol('uydurma URL yazılmadı (url null)',
    kobra.url === null, String(kobra.url));
  kontrol('kayıt PASİF (radar boşuna tur harcamaz)', kobra.aktif === false);
  kontrol('pasiflik gerekçesi açık',
    /üretimden|satılmıyor|yedek parça/i.test(String(kobra.pasifNeden || '')), String(kobra.pasifNeden));
  kontrol('pasif kayıt tarama listesine GİRMEZ',
    !katalogGetir({ sadeceAktif: true }).some(k => k.id === kobra.id));
}

/* ------------------------------------------------------------------ */
bolum('4) 🎯 Bambu Lab A1 Mini (ID 8) — kanonik URL bağlı');

const a1 = adaGore('A1 Mini');
kontrol('A1 Mini katalogda', !!a1);
if (a1) {
  kontrol('ID 8 kaydı', a1.id === 8, String(a1.id));
  kontrol('URL dolu', gecerliUrl(a1.url), String(a1.url));
  kontrol('URL A1 Mini ilanına ait', /a1-mini/i.test(String(a1.url)), String(a1.url));
  kontrol('aktif', a1.aktif === true);
  kontrol('tarama listesinde', katalogGetir({ sadeceAktif: true }).some(k => k.id === a1.id));
}

// Diğer yazıcılar da dolu olmalı
const yazicilar = aktifler.filter(k => k.kategori === 'yazici');
kontrol('tüm aktif yazıcılarda URL var', yazicilar.every(k => gecerliUrl(k.url)),
  yazicilar.filter(k => !gecerliUrl(k.url)).map(k => k.ad).join(', ') || 'temiz');
kontrol('yazıcı URL’leri aksesuar sayfası değil',
  yazicilar.every(k => !/silikon|corap|çorap|nozzle|hotend|tabla|pei-|hotend-seti/i.test(String(k.url))),
  yazicilar.filter(k => /silikon|corap|çorap|nozzle|hotend|tabla|pei-|hotend-seti/i.test(String(k.url))).map(k => k.ad).join(', ') || 'temiz');

/* ------------------------------------------------------------------ */
bolum('4b) 🧩 Seed v7 — PETG / TPU / Reçine / Nozzle / Kurutucu çeşitliliği');

// 2026-11-11: 20 ürünlük havuz (11 filament + 7 yazıcı + 2 genel) yüzünden
// fırsat kanalı ve borsa vitrini hep aynı PLA/yazıcıları döndürüyordu.
const kategoriSayisi = (kat) => katalog.filter(k => k.kategori === kat).length;
kontrol('en az 15 filament', kategoriSayisi('filament') >= 15, String(kategoriSayisi('filament')));
kontrol('en az 7 yazıcı', kategoriSayisi('yazici') >= 7, String(kategoriSayisi('yazici')));
kontrol('en az 10 genel (reçine/nozzle/kurutucu)', kategoriSayisi('genel') >= 10,
  String(kategoriSayisi('genel')));

// Grup bazlı varlık denetimi: görevde istenen 5 yeni ürün grubu.
const grupBul = (re) => aktifler.filter(k => re.test(String(k.ad)));
const petg = grupBul(/petg/i);
const tpu = grupBul(/tpu|esnek/i);
const recine = grupBul(/reçine|recine|resin/i);
const nozzle = grupBul(/nozzle|nozul|hotend/i);
const kurutucu = grupBul(/kurutucu|ebox|filadryer/i);

kontrol('PETG ürünleri (>=3)', petg.length >= 3, petg.map(k => k.ad).join(', ') || 'yok');
kontrol('TPU / esnek filament (>=3)', tpu.length >= 3, tpu.map(k => k.ad).join(', ') || 'yok');
kontrol('SLA/DLP reçine (>=3)', recine.length >= 3, recine.map(k => k.ad).join(', ') || 'yok');
kontrol('Nozzle / hotend (>=4)', nozzle.length >= 4, nozzle.map(k => k.ad).join(', ') || 'yok');
kontrol('Filament kurutucu (>=3)', kurutucu.length >= 3, kurutucu.map(k => k.ad).join(', ') || 'yok');

kontrol('v7 ürünlerinin tamamı aktif', [...petg, ...tpu, ...recine, ...nozzle, ...kurutucu]
  .every(k => k.aktif === true));
kontrol('v7 ürünlerinin URL’si dolu + http(s)',
  [...new Set([...petg, ...tpu, ...recine, ...nozzle, ...kurutucu])]
    .every(k => gecerliUrl(k.url)),
  [...new Set([...petg, ...tpu, ...recine, ...nozzle, ...kurutucu])]
    .filter(k => !gecerliUrl(k.url)).map(k => k.ad).join(', ') || 'temiz');

// Örnek ürünler katalogda gerçekten var mı? (görev listesi birebir)
for (const parca of [
  'Porima PETG Filament Siyah 1kg',
  'Microzey PETG Filament Siyah 1kg',
  'eSun PETG Filament Siyah 1kg',
  'eSun eTPU-95A',
  'Porima TPU Flex 98A',
  'Creality CR-TPU',
  'Anycubic Standart UV Reçine',
  'Anycubic Water-Wash',
  'Bambu Lab P1 Serisi',
  'Bambu Lab X1/P1 Sertleştirilmiş',
  'Creality Unicorn Quick-Swap',
  'E3D Volcano',
  'eSun eBOX Lite',
  'Sunlu FilaDryer SP2',
  'Creality SpacePi X4',
]) {
  kontrol(`katalogda: ${parca}`, aktifler.some(k => String(k.ad).includes(parca)));
}

// Telegram kartı ikonları (davranış testi)
bolum('4c) 🎨 Ürün ikonu sezgisel eşleme');
kontrol('yazıcı → 🖨️', urunIkonu({ kategori: 'yazici', ad: 'Bambu Lab P1S 3D Yazıcı' }) === '🖨️');
kontrol('PLA filament → 🧵', urunIkonu({ kategori: 'filament', ad: 'Porima PLA Filament Beyaz 1kg' }) === '🧵');
kontrol('PETG filament → 💎', urunIkonu({ kategori: 'filament', ad: 'eSun PETG Filament Siyah 1kg' }) === '💎');
kontrol('TPU filament → 🌀', urunIkonu({ kategori: 'filament', ad: 'Creality CR-TPU Esnek Filament Siyah 1kg' }) === '🌀');
kontrol('reçine → 🧪', urunIkonu({ kategori: 'genel', ad: 'Anycubic Standart UV Reçine Gri 1kg' }) === '🧪');
kontrol('nozzle → 🔧', urunIkonu({ kategori: 'genel', ad: 'Creality Unicorn Quick-Swap Nozzle K1 0.4mm' }) === '🔧');
kontrol('hotend → 🔧', urunIkonu({ kategori: 'genel', ad: 'Bambu Lab P1 Serisi 0.4mm Komple Hotend' }) === '🔧');
kontrol('kurutucu → ♨️', urunIkonu({ kategori: 'genel', ad: 'eSun eBOX Lite Filament Kurutucu' }) === '♨️');
kontrol('SpacePi → ♨️', urunIkonu({ kategori: 'genel', ad: 'Creality SpacePi X4 Filament Kurutucu' }) === '♨️');
kontrol('bilinmeyen genel → ⚙️', urunIkonu({ kategori: 'genel', ad: 'Bilinmeyen Ürün' }) === '⚙️');
kontrol('boş girdi güvenli → ⚙️', urunIkonu(undefined) === '⚙️');

/* ------------------------------------------------------------------ */
bolum('5) 🔁 Göç idempotent');

const oncekiSayi = katalog.length;
const ikinci = katalogGetir();
kontrol('ikinci okuma kayıt sayısını değiştirmez', ikinci.length === oncekiSayi,
  `${ikinci.length} ≠ ${oncekiSayi}`);
kontrol('ikinci okumada da eşsiz adlar',
  new Set(ikinci.map(k => k.ad.toLowerCase().trim())).size === ikinci.length);
kontrol('ikinci okumada boş URL yok',
  ikinci.filter(k => k.aktif).every(k => gecerliUrl(k.url)));

/* ------------------------------------------------------------------ */
bolum('6) 🔤 Tire normalizasyonu ve yedek parça filtresi');

kontrol('Kobra-2 → Kobra 2', tireNormalize('Anycubic Kobra-2 Neo') === 'Anycubic Kobra 2 Neo',
  tireNormalize('Anycubic Kobra-2 Neo'));
kontrol('Ender–3 (en dash) → Ender 3', tireNormalize('Ender–3 V3') === 'Ender 3 V3');
kontrol('alt çizgi → boşluk', tireNormalize('A1_Mini') === 'A1 Mini');
kontrol('çoklu boşluk tekleşir', tireNormalize('a   b') === 'a b');
kontrol('PLA+ korunur (kimlik bozulmaz)', tireNormalize('eSun PLA+ Beyaz') === 'eSun PLA+ Beyaz');
kontrol('boş girdi güvenli', tireNormalize('') === '');
kontrol('null girdi güvenli', tireNormalize(null) === '');

kontrol('yazıcı sorgusu: Kobra 2 Neo', yaziciSorgusuMu('Anycubic Kobra 2 Neo') === true);
kontrol('yazıcı sorgusu: Bambu Lab P1S', yaziciSorgusuMu('Bambu Lab P1S') === true);
kontrol('yazıcı DEĞİL: filament', yaziciSorgusuMu('eSun PLA+ Beyaz 1kg') === false);

kontrol('silikon çorap aday olarak reddedilir',
  aksesuarAdayMi('Anycubic Kobra 2 Neo', 'Anycubic Kobra 2 Neo Silikon Çorap Siyah') === true);
kontrol('nozzle aday reddedilir',
  aksesuarAdayMi('Bambu Lab A1 Mini 3D Yazıcı', 'Bambu Lab A1 Mini 0.4mm Nozzle') === true);
kontrol('gerçek yazıcı aday kabul edilir',
  aksesuarAdayMi('Anycubic Kobra 2 Neo', 'Anycubic Kobra 4 Combo 3D Yazıcı') === false);
kontrol('kullanıcı parça arıyorsa parça kabul',
  aksesuarAdayMi('Anycubic Kobra nozzle', 'Anycubic Kobra Nozzle Seti') === false);

// Kaynak seçimi: çorap ASLA kaynak olmaz, tireli başlık eşleşir
kontrol('çorap kaynak olarak seçilmez',
  kaynakEslesirMi('Anycubic Kobra 2 Neo', { title: 'Kobra 2 Neo Isıtıcı Blok Silikon Çorap', brand: 'Anycubic' }) === false);
kontrol('tireli başlık eşleşir (Ender-3 ↔ Ender 3)',
  kaynakEslesirMi('Creality Ender 3 V3 KE 3D Yazıcı', { title: 'Creality Ender-3 V3 KE 3D Yazıcı', brand: 'Creality' }) === true);
kontrol('tireli puan yüksek', sorguPuanla('Creality Ender-3 V3 KE 3D Yazıcı', 'Creality Ender 3 V3 KE 3D Yazıcı') >= 0.8,
  String(sorguPuanla('Creality Ender-3 V3 KE 3D Yazıcı', 'Creality Ender 3 V3 KE 3D Yazıcı').toFixed(3)));

const kademeler = sorguKademeleriUret('Anycubic Kobra 2 Neo 3D Yazıcı');
kontrol('sorgu kademeleri üretilir', kademeler.length > 0, String(kademeler.length));
kontrol('kademelerde tireli/tiresiz varyant denenir',
  kademeler.some(k => /kobra/i.test(k)), kademeler.join(' | '));

/* ------------------------------------------------------------------ */
bolum('7) 📄 Kaynak sözleşmesi');

const radarSrc = oku('src/otonomRadar.js');
const aramaSrc = oku('src/urunArama.js');

kontrol('otonomRadar: seed sürümü 7',
  /export const KATALOG_SEED_SURUMU = 7;/.test(radarSrc));
kontrol('otonomRadar: v7 ürün grubu yorumu', /seed v7 \(2026-11-11\)/.test(radarSrc));
kontrol('otonomRadar: urunIkonu export', /export function urunIkonu/.test(radarSrc));
kontrol('otonomRadar: kart ikonu urunIkonu kullanır', /const ikon = urunIkonu\(d\)/.test(radarSrc));
kontrol('otonomRadar: TPU ikonu 🌀', /tpu\|esnek[\s\S]{0,80}🌀/.test(radarSrc));
kontrol('otonomRadar: PETG ikonu 💎', /petg[\s\S]{0,80}💎/i.test(radarSrc));
kontrol('otonomRadar: reçine ikonu 🧪', /recine\|reçine\|resin[\s\S]{0,60}🧪/i.test(radarSrc));
kontrol('otonomRadar: nozzle ikonu 🔧', /nozzle\|hotend[\s\S]{0,60}🔧/i.test(radarSrc));
kontrol('otonomRadar: kurutucu ikonu ♨️', /kurutucu\|ebox\|filadryer[\s\S]{0,80}♨️/i.test(radarSrc));
kontrol('otonomRadar: v5 göç bloğu var', /mevcutSurum < 5/.test(radarSrc));
kontrol('otonomRadar: yalnızca BOŞ url doldurulur',
  /WHERE id = \? AND \(url IS NULL OR trim\(url\) = ''\)/.test(radarSrc));
kontrol('otonomRadar: pasif_neden kolonu eklenir',
  /ALTER TABLE radar_katalog ADD COLUMN pasif_neden TEXT/.test(radarSrc));
kontrol('otonomRadar: pasif kayıt pasifleştirilir',
  /SET aktif = 0, pasif_neden = \?/.test(radarSrc));
kontrol('otonomRadar: ölü durum kartları temizlenir',
  /DELETE FROM radar_durum[\s\S]{0,200}aktif = 1/.test(radarSrc));
kontrol('otonomRadar: tarama yalnızca aktif kayıtları alır',
  /katalogGetir\(\{ sadeceAktif: true \}\)/.test(radarSrc));
kontrol('otonomRadar: katalogDogrula export',
  /export function katalogDogrula\(/.test(radarSrc));
kontrol('otonomRadar: KATALOG_ASGARI sözleşmesi',
  /export const KATALOG_ASGARI = Object\.freeze\(\{[\s\S]{0,120}filament: 18[\s\S]{0,60}yazici: 6[\s\S]{0,60}genel: 10/.test(radarSrc));
kontrol('otonomRadar: integrity_check denetimi', /PRAGMA integrity_check/.test(radarSrc));
kontrol('otonomRadar: WAL denetimi', /journal_mode/.test(radarSrc));
kontrol('otonomRadar: busy_timeout denetimi', /busy_timeout/.test(radarSrc));
kontrol('otonomRadar: URL\'siz kayıt pasif eklenir', /const aktif = temizUrl \? 1 : 0;/.test(radarSrc));
kontrol('otonomRadar: http(s) URL doğrulaması',
  radarSrc.includes('^https?:\\/\\/[^\\s]+$'));
kontrol('otonomRadar: pasif_neden INSERT edilir', /INSERT INTO radar_katalog[\s\S]{0,200}pasif_neden/.test(radarSrc));

const healthSrc = oku('src/healthPulse.js');
const storeSrc = oku('src/store.js');
kontrol('healthPulse: katalogNobetiCalistir export',
  /export async function katalogNobetiCalistir/.test(healthSrc));
kontrol('healthPulse: gece kontrolünde çağrılır',
  /saglikKontrolu[\s\S]{0,1600}katalogNobetiCalistir\(/.test(healthSrc));
kontrol('healthPulse: katalog hatası console.error',
  /console\.error\('\[HealthPulse\] Katalog bütünlük hatası:'/.test(healthSrc));
kontrol('healthPulse: Telegram katalog uyarısı',
  /Katalog Bütünlük Uyarısı/.test(healthSrc));
kontrol('healthPulse: sonuç raporunda katalog alanı', /katalog,\n\s*\}\;|katalog,$/m.test(healthSrc));
kontrol('store: busy_timeout = 5000', /PRAGMA busy_timeout = 5000;/.test(storeSrc));
kontrol('store: WAL modu', /PRAGMA journal_mode = WAL;/.test(storeSrc));
kontrol('store: synchronous NORMAL', /PRAGMA synchronous = NORMAL;/.test(storeSrc));

kontrol('urunArama: tireNormalize export', /export function tireNormalize/.test(aramaSrc));
kontrol('urunArama: yaziciSorgusuMu export', /export function yaziciSorgusuMu/.test(aramaSrc));
kontrol('urunArama: aksesuarAdayMi export', /export function aksesuarAdayMi/.test(aramaSrc));
kontrol('urunArama: sorguPuanla tire normalizasyonu kullanır',
  /const b = tireNormalize\(/.test(aramaSrc));
kontrol('urunArama: kaynakEslesirMi yedek parçayı eler',
  /aksesuarAdayMi\(sorgu, baslik\)\) return false/.test(aramaSrc));

/* ------------------------------------------------------------------ */
bolum('8) 🌐 CANLI doğrulama (--canli)');

const canli = process.argv.includes('--canli');
if (!canli) {
  console.log('  ℹ️  Canlı fiyat doğrulaması için: node scripts/test-katalog-seed.mjs --canli');
} else {
  // A1 Mini (ID 8) önce: görevin ana hedefi.
  if (a1?.url) {
    const a = adapterById(new URL(a1.url).hostname.includes('trendyol') ? 'trendyol'
      : new URL(a1.url).hostname.replace(/^www\./, '').split('.')[0]);
    if (!a) atla('A1 Mini adaptörü', 'adaptör bulunamadı');
    else {
      try {
        const p = await a.getProduct(a1.url, { spend: 0 }, { fresh: true });
        kontrol('A1 Mini (ID 8): fiyat okundu', Number(p?.sellingPrice) > 0, String(p?.sellingPrice));
        kontrol('A1 Mini (ID 8): fiyat mantıklı (> ₺5.000)',
          Number(p?.sellingPrice) > 5000, String(p?.sellingPrice));
        kontrol('A1 Mini (ID 8): stokta', p?.inStock !== false, String(p?.inStock));
        kontrol('A1 Mini (ID 8): başlık yazıcı',
          /a1\s*mini/i.test(String(p?.title)), String(p?.title));
        console.log(`  ℹ️  A1 Mini: ₺${p?.sellingPrice} · ${String(p?.title).slice(0, 55)}`);
      } catch (e) {
        atla('A1 Mini canlı okuma', String(e.message || e).slice(0, 80));
      }
    }
  }

  // Tüm aktif URL'ler: gerçek fiyat okunuyor mu?
  let ok = 0, hatali = 0;
  for (const k of aktifler) {
    if (!gecerliUrl(k.url)) continue;
    // Adaptörü URL'den çöz (v7 ile filamentmarketim/3dcim/n11 gibi yeni
    // host'lar geldi; sabit listeye eklemek yerine detectSite kullanılır).
    const a = detectSite(k.url);
    if (!a) { atla(`${k.ad}: adaptör eşlenemedi`, (() => { try { return new URL(k.url).hostname; } catch { return k.url; } })()); continue; }
    try {
      const p = await a.getProduct(k.url, { spend: 0 }, { fresh: true });
      const fiyat = Number(p?.sellingPrice);
      if (fiyat > 0) {
        ok++;
        console.log(`  ✓ ${k.ad.slice(0, 42).padEnd(44)} ₺${fiyat}`);
      } else {
        hatali++;
        kontrol(`${k.ad}: fiyat > 0`, false, String(p?.sellingPrice));
      }
    } catch (e) {
      hatali++;
      atla(`${k.ad}: okunamadı`, String(e.message || e).slice(0, 60));
    }
  }
  kontrol('canlı: aktif URL’lerin çoğu okundu', ok >= Math.ceil(aktifler.length * 0.6),
    `${ok} okundu / ${hatali} hata / ${aktifler.length} aktif`);
}

/* ------------------------------------------------------------------ */
try { radarKapat(); } catch { /* zaten kapalı */ }

console.log('\n' + '─'.repeat(50));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti${atlanan ? ` · ${atlanan} atlandı (dış etken)` : ''}`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
  process.exitCode = 1;
}
