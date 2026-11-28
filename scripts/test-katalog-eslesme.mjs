/**
 * 🗂️ Katalog Kanonik URL & Kademeli Arama Testleri (2026-11-05)
 *
 * SORUN: radar kataloğunda ID:2 "eSun ePLA-HS (High Speed) PLA Siyah 1kg"
 * ürününün `url` alanı BOŞTU. Radar her turda `hizliKaynakUrunBul()` aramasına
 * düşüyor, mağaza arama motorları "ePLA-HS" + "1kg" birleşiminde 0 sonuç
 * döndürüyor ve ürün `kaynakYok: true` olarak 61 mağazada hiç taranmıyordu.
 *
 * ÇÖZÜM:
 *   1) `sorguKademeleriUret()` — orijinal → parantezsiz → tiresiz+ölçüsüz →
 *      gereksiz malzeme atılmış → tire korunmuş çekirdek.
 *   2) `hizliKaynakUrunBul()` kademeleri sırayla dener, İLK başarılıda durur.
 *   3) 3D hedef sitelere `n11` eklendi.
 *   4) KATALOG_SEED_SURUMU = 4 → mevcut DB'de eSun kaydına kanonik URL atanır.
 *
 * Kapsam:
 *   A) Kademe üretimi (normalizasyon, tekilleştirme, sınır)
 *   B) Varyant koruması (renk/malzeme/model serisi esnetilmez)
 *   C) Puanlama: tireli/tiresiz yazım filtreden elenmez
 *   D) Katalog v4: DB'de url dolu + aktif, seed=4, varsayılan katalog kaydı
 *   E) Radar entegrasyonu: ID:2 için kaynakYok yok
 *   F) Performans: ilk kademe başarılıysa fazladan arama yok
 *
 *   node scripts/test-katalog-eslesme.mjs [--canli]
 *     --canli : gerçek ağ ile kademeli aramayı doğrular (n11)
 */
import fs from 'node:fs';
import {
  sorguKademeleriUret, sorguPuanla, hizliKaynakUrunBul,
} from '../src/urunArama.js';
import { VARSAYILAN_KATALOG, KATALOG_SEED_SURUMU, katalogGetir } from '../src/otonomRadar.js';
import { modelSerisiCakismasi, hatCakismasi } from '../src/util.js';
import { dbBaglantisi, closeDatabase } from '../src/store.js';

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

const ORNEK = 'eSun ePLA-HS (High Speed) PLA Siyah 1kg';

/* ------------------------------------------------------------------ */
bolum('1) 🔤 Kademeli sorgu üretimi');

const k = sorguKademeleriUret(ORNEK);
kontrol('en az 4 kademe üretildi', k.length >= 4, JSON.stringify(k));
kontrol('kademe 0 = orijinal (hiç bozulmadan)', k[0] === ORNEK, k[0]);
kontrol('parantez içi atılır', k.some(x => x === 'eSun ePLA-HS PLA Siyah 1kg'), JSON.stringify(k));
kontrol('tire → boşluk', k.some(x => /ePLA HS/.test(x)), JSON.stringify(k));
kontrol('ölçü (1kg/1.75mm) atılır',
  k.some(x => !/\b1kg\b|\b1\.75\s*mm\b/i.test(x) && /ePLA/i.test(x)), JSON.stringify(k));
kontrol('çekirdek: gereksiz PLA atılır', k.includes('eSun ePLA HS Siyah'), JSON.stringify(k));
kontrol('tire korunmuş çekirdek', k.includes('eSun ePLA-HS Siyah'), JSON.stringify(k));
kontrol('tekilleştirme (aynı sorgu iki kez yok)',
  new Set(k.map(x => x.toLowerCase())).size === k.length, JSON.stringify(k));
kontrol('en fazla 5 kademe', k.length <= 5, String(k.length));
kontrol('bozuk model tekrarı yok ("ePLA-HS ePLA HS")',
  !k.some(x => /ePLA-HS\s+ePLA\s+HS/i.test(x)), JSON.stringify(k));

// Diğer ürünlerde gereksiz kademe üretilmemeli
const k2 = sorguKademeleriUret('Bambu Lab P1S 3D Yazıcı');
kontrol('yalın sorguda tek kademe', k2.length === 1, JSON.stringify(k2));
const k3 = sorguKademeleriUret('eSun PLA+ Beyaz 1kg');
kontrol('PLA+ korunur (dokunulmaz)', k3[0] === 'eSun PLA+ Beyaz 1kg', k3[0]);
kontrol('ölçü atılmış kademe var', k3.includes('eSun PLA+ Beyaz'), JSON.stringify(k3));
const k4 = sorguKademeleriUret('Creality Ender-3 V3 KE');
kontrol('marka-modeldeki tire açılır',
  k4.includes('Creality Ender 3 V3 KE'), JSON.stringify(k4));
kontrol('boş sorgu → boş dizi', sorguKademeleriUret('').length === 0);
kontrol('kısa sorgu → boş dizi', sorguKademeleriUret('a').length === 0);

/* ------------------------------------------------------------------ */
bolum('2) 🛡️ Varyant koruması (renk/malzeme esnetilmez)');

// Renk kademelerde değişmemeli
kontrol('renk kademelerde korunur (Siyah)',
  k.every(x => /siyah/i.test(x)), JSON.stringify(k));
kontrol('renk Beyaz\'a dönüşmez',
  !k.some(x => /beyaz/i.test(x)), JSON.stringify(k));

// Malzeme korunur: PLA-HS sorgusunda PETG'ye geçiş yok
kontrol('malzeme PETG\'ye dönüşmez', !k.some(x => /petg/i.test(x)));
const petgK = sorguKademeleriUret('eSun ePLA-HS PETG Siyah 1kg');
kontrol('PETG sorgusunda PLA eklenmez',
  !petgK.some(x => /\bpla\b/i.test(x) && !/epla/i.test(x)), JSON.stringify(petgK));

// Model serisi çakışması kademelerden sonra da reddedilir
kontrol('K1 Max ↔ Ender 5 Max model çakışması',
  modelSerisiCakismasi('Creality K1 Max 3D Yazıcı', 'Creality Ender 5 Max 3D Yazıcı') === true);
kontrol('ePLA-HS ↔ PLA+ ürün hattı farkı',
  hatCakismasi('eSun ePLA-HS PLA Siyah 1kg', 'eSun PLA+ Beyaz 1kg') === true);

/* ------------------------------------------------------------------ */
bolum('3) 🎯 Puanlama: tireli/tiresiz yazım elenmez');

const basliklar = [
  ['Esun Pla-hs Yüksek Hızlı Pla Filament Siyah', true, 'n11 tireli'],
  ['eSun ePLA HS Siyah Filament 1kg', true, 'tiresiz'],
  ['eSun ePLA-HS PLA Siyah 1.75mm 1kg', true, 'orijinal yazım'],
  ['eSun PLA Basic Siyah 1kg', false, 'farklı hat (Basic)'],
  ['eSun ePLA-Matte Filament Siyah', false, 'farklı hat (Matte)'],
];
for (const [baslik, beklenen, etiket] of basliklar) {
  const enIyiPuan = Math.max(...k.map(q => sorguPuanla(baslik, q)));
  const gecti = enIyiPuan >= 0.35;
  kontrol(`puanlama: ${etiket} ${beklenen ? 'GEÇMELİ' : 'ELENMELİ'}`,
    gecti === beklenen, `${enIyiPuan.toFixed(2)} — ${baslik}`);
}

/* ------------------------------------------------------------------ */
bolum('4) 🗂️ Katalog v4 (tohum + DB)');

// Seed surumu her veri duzeltmesinde artar (v5 = NULL URL'lerin doldurulmasi).
kontrol('KATALOG_SEED_SURUMU >= 4', KATALOG_SEED_SURUMU >= 4, String(KATALOG_SEED_SURUMU));

const esunVarsayilan = VARSAYILAN_KATALOG.find(x => /eSun ePLA-HS/i.test(x.ad));
kontrol('varsayılan katalogda eSun kaydı var', !!esunVarsayilan);
kontrol('varsayılan kayıtta url dolu',
  typeof esunVarsayilan?.url === 'string' && /^https?:\/\//.test(esunVarsayilan.url),
  String(esunVarsayilan?.url));
kontrol('varsayılan url n11 kanonik sayfası',
  /n11\.com\/urun\/esun-pla-hs/i.test(String(esunVarsayilan?.url)), String(esunVarsayilan?.url));
kontrol('varsayılan sorgu optimize ("eSun ePLA HS Siyah")',
  esunVarsayilan?.sorgu === 'eSun ePLA HS Siyah', String(esunVarsayilan?.sorgu));
kontrol('kategori filament', esunVarsayilan?.kategori === 'filament');

// Gerçek DB (göç çalışmış mı?)
try {
  const db = dbBaglantisi();
  const satir = db.prepare("SELECT id, url, sorgu, aktif FROM radar_katalog WHERE ad LIKE '%eSun ePLA-HS%'").get();
  kontrol('DB: eSun kaydı mevcut', !!satir);
  kontrol('DB: url DOLU (kaynakYok sorununun kökü)',
    typeof satir?.url === 'string' && satir.url.length > 20, String(satir?.url));
  kontrol('DB: url n11 kanonik',
    /n11\.com\/urun\/esun-pla-hs/i.test(String(satir?.url)), String(satir?.url));
  kontrol('DB: sorgu güncellendi ("eSun ePLA HS Siyah")',
    satir?.sorgu === 'eSun ePLA HS Siyah', String(satir?.sorgu));
  kontrol('DB: kayıt aktif', Number(satir?.aktif) === 1, String(satir?.aktif));

  const meta = db.prepare("SELECT value FROM radar_meta WHERE key = 'katalog_seed'").get();
  kontrol('DB: katalog_seed ≥ 4', Number(meta?.value) >= 4, String(meta?.value));

  const diger = katalogGetir().filter(x => !/eSun ePLA-HS/i.test(x.ad));
  kontrol('DB: diğer kayıtlar korundu (≥15 ürün)', diger.length >= 15, String(diger.length));
} catch (e) {
  kontrol('DB okunabildi', false, String(e?.message || e).slice(0, 80));
}

/* ------------------------------------------------------------------ */
bolum('5) 🔎 Radar entegrasyonu (ID:2)');

try {
  const db = dbBaglantisi();
  const satir = db.prepare("SELECT id FROM radar_katalog WHERE ad LIKE '%eSun ePLA-HS%'").get();
  const durum = satir
    ? db.prepare('SELECT veri FROM radar_durum WHERE katalog_id = ?').get(satir.id)
    : null;
  if (durum?.veri) {
    const v = JSON.parse(durum.veri);
    kontrol('ID:2 kaynakYok ARTIK true DEĞİL', v.kaynakYok !== true, String(v.kaynakYok));
    kontrol('ID:2 kaynakUrl dolu', typeof v.kaynakUrl === 'string' && v.kaynakUrl.length > 10,
      String(v.kaynakUrl));
    kontrol('ID:2 gerçek ürün başlığı var',
      // 2026-11-19: canlı radar başlığı "eSUN PLA+HS …" olarak yazdı ("PLA HS"
      // yerine "PLA+HS"). Ürün adı varyantı gerçek; ayırıcıya `+` eklendi.
      typeof v.urun === 'string' && /pla[\s+_-]*hs/i.test(v.urun), String(v.urun));
    kontrol('ID:2 stok/fiyat kaydı var',
      v.stokta === true && Number(v.fiyat) > 0, `stokta:${v.stokta} fiyat:${v.fiyat}`);
    console.log(`  ℹ️  ID:${satir.id} → ${v.site} ₺${v.fiyat} · ${String(v.urun).slice(0, 46)}`);
  } else {
    kontrol('ID:2 radar_durum kaydı var', false, 'durum kaydı yok — radar henüz taranmamış olabilir');
  }
} catch (e) {
  kontrol('radar_durum okunabildi', false, String(e?.message || e).slice(0, 80));
}

/* ------------------------------------------------------------------ */
bolum('6) 🧩 Kaynak kodu sözleşmesi');

const urunArama = fs.readFileSync('src/urunArama.js', 'utf8');
const radar = fs.readFileSync('src/otonomRadar.js', 'utf8');

kontrol('urunArama: sorguKademeleriUret dışa açık',
  /export function sorguKademeleriUret/.test(urunArama));
// 3D hedef listesi pazar/izin filtreleriyle yeniden düzenlendi (2026-11-28):
// sıra ve içerik değişiyor, bu yüzden sıraya değil İÇERİĞE bakıyoruz.
const ucDHedefListe = (urunArama.match(/is3D\s*\n?\s*\?\s*\[([^\]]+)\]/) || [])[1] || '';
kontrol('urunArama: 3D hedef sitelerde n11 var',
  ucDHedefListe.includes("'n11'") && ucDHedefListe.includes("'porima3d'"),
  ucDHedefListe.replace(/\s+/g, ' ').slice(0, 120));
kontrol('urunArama: kademeli döngü (for … kademeler)',
  /for \(let i = 0; i < kademeler\.length; i\+\+\)/.test(urunArama));
kontrol('urunArama: ilk başarılı kademede durur (return)',
  /if \(sonuc\) \{[\s\S]{0,800}return enIyi;/.test(urunArama));
kontrol('urunArama: her kademede kimlik doğrulaması (kaynakEslesirMi)',
  (urunArama.match(/kaynakEslesirMi\(/g) || []).length >= 1);
kontrol('urunArama: kademe bilgisi sonuca ekleniyor',
  /aramaKademesi: i/.test(urunArama));
kontrol('radar: seed surumu tanimli', /KATALOG_SEED_SURUMU = \d+/.test(radar));
kontrol('radar: göç UPDATE id ile',
  /UPDATE radar_katalog SET sorgu = \?, url = \? WHERE id = \?/.test(radar));
kontrol('radar: tohum sorgusu id seçiyor (göç şartı)',
  /SELECT id, ad, sira FROM radar_katalog/.test(radar));

/* ------------------------------------------------------------------ */
/* 7) Canlı doğrulama                                                  */
/* ------------------------------------------------------------------ */
if (process.argv.includes('--canli')) {
  bolum('7) 🌐 CANLI — kademeli arama ağı');
  try {
    const t0 = Date.now();
    const r = await hizliKaynakUrunBul(ORNEK);
    const sure = Date.now() - t0;
    kontrol('canlı: kaynak bulundu', !!r, 'bulunamadı');
    kontrol('canlı: 30 sn altında', sure < 30000, `${(sure / 1000).toFixed(1)} sn`);
    if (r) {
      kontrol('canlı: url geçerli', /^https?:\/\//.test(String(r.url)), String(r.url));
      // Gerçek ilan başlığı "Esun Pla-hs Yüksek Hızlı …" — 'e' öneki yok.
      kontrol('canlı: ürün PLA-HS içeriyor',
        /pla[\s-]*hs/i.test(String(r.title)), String(r.title).slice(0, 60));
      console.log(`  ${(sure / 1000).toFixed(1)} sn · ${r.siteName} ₺${r.price} · kademe ${r.aramaKademesi + 1}`);
      console.log(`  ${String(r.title).slice(0, 70)}`);
    }
  } catch (e) {
    kontrol('canlı: hata raporlandı', false, String(e?.message || e).slice(0, 100));
  }
} else {
  console.log('\nℹ️  Canlı kademeli arama testi için: node scripts/test-katalog-eslesme.mjs --canli');
}

/* ------------------------------------------------------------------ */
console.log('\n' + '─'.repeat(46));
console.log(`Sonuç: ${gecen}/${toplam} kontrol geçti`);
if (hatalar.length) {
  console.log(`Başarısız (${hatalar.length}):`);
  for (const h of hatalar) console.log(' - ' + h);
}
closeDatabase();
process.exitCode = hatalar.length ? 1 : 0;
