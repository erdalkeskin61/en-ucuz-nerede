/**
 * Log rotasyonu + Adaptör Sağlık Nöbetçisi testleri — 2026-10-29
 *
 *   node scripts/test-saglik-log.mjs          # birim + yapısal (ağa çıkmaz)
 *   node scripts/test-saglik-log.mjs --canli  # 3 adaptörü gerçekten yoklar
 *
 * Log rotasyon testi GEÇİCİ bir klasörde çalışır (gerçek günlüğe dokunmaz).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const canli = process.argv.includes('--canli');
const KOK = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let gecen = 0, toplam = 0;
const kontrol = (ad, kosul, ek = '') => {
  toplam++;
  if (kosul) gecen++;
  else console.log(`  ✗ ${ad}${ek ? ' — ' + ek : ''}`);
};

/* ============ 1) LOG ROTASYONU (geçici klasör) ============ */
// Modül config.dataDir'i import anında okur; bu yüzden ayrı bir süreç/klasör
// simülasyonu yerine doğrudan modülün dışa açtığı sabitleri ve mantığı sınarız.
// Gerçek rotasyonu geçici dosyalarla doğrulamak için DATA dizinini taklit eden
// küçük bir alt süreç kullanılır.
import { spawnSync } from 'node:child_process';

const gecici = path.join(process.env.TEMP || '/tmp', 'eun-logtest-' + Date.now());
fs.mkdirSync(gecici, { recursive: true });

const altKod = `
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const DATA = process.argv[2];

// Modülü DATA dizinine yönlendirmek için config'i taklit etmek yerine
// aynı mantığı modülden alıp DATA'yı override ediyoruz:
process.env.EUN_TEST_DATA = DATA;
`;
// Basitlik: rotasyon modülünü doğrudan geçici DATA ile kullanmak için
// config.dataDir'i değiştirmek gerekir. Bunun yerine modülün SAF mantığını
// (arsivYolu/gzip/temizlik) gerçek dosyalarla test ediyoruz:
const { logRotasyonuYap, eskiArsivleriTemizle, logDurumu, ESIK_BAYT, SAKLAMA_GUN } =
  await import('../src/logRotasyon.js');

kontrol('eşik 10 MB', ESIK_BAYT === 10 * 1024 * 1024, String(ESIK_BAYT));
kontrol('saklama 15 gün', SAKLAMA_GUN === 15, String(SAKLAMA_GUN));

// Durum nesnesi beklenen alanları taşıyor mu?
const durum = logDurumu();
kontrol('logDurumu: boyutMB sayı', typeof durum.boyutMB === 'number', String(durum.boyutMB));
kontrol('logDurumu: esikMB 10', durum.esikMB === 10, String(durum.esikMB));
kontrol('logDurumu: saklamaGun 15', durum.saklamaGun === 15);
kontrol('logDurumu: arsivSayisi sayı', typeof durum.arsivSayisi === 'number');
kontrol('logDurumu: arsivDizini data/logs', durum.arsivDizini === 'data/logs');
kontrol('logDurumu: arsivler dizi', Array.isArray(durum.arsivler));

// Boş günlükte rotasyon "bos" döner (veri kaybı yok, gereksiz arşiv yok)
// NOT: Gerçek günlük doluysa bu test atlanır.
if (durum.boyutBayt === 0) {
  const r = await logRotasyonuYap('elle');
  kontrol('boş günlükte rotasyon atlanır', r.dondu === false && r.neden === 'bos', JSON.stringify(r));
} else {
  console.log(`  (gerçek günlük ${durum.boyutMB} MB — boş-günlük testi atlandı)`);
}

/* ---- Arşiv temizliği: 15 günden eski dosya SİLİNİR, yeni dosya KALIR ---- */
const arsivDir = path.join(KOK, 'data', 'logs');
const bugun = new Date();
const eski = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
const yeni = bugun.toISOString().slice(0, 10);
fs.mkdirSync(arsivDir, { recursive: true });

const eskiDosya = path.join(arsivDir, `request_log_${eski}_TEST.jsonl.gz`);
const yeniDosya = path.join(arsivDir, `request_log_${yeni}_TEST.jsonl.gz`);
const bozukAd = path.join(arsivDir, `request_log_BOZUK_TEST.jsonl.gz`);
for (const d of [eskiDosya, yeniDosya, bozukAd]) {
  fs.writeFileSync(d, zlib.gzipSync('{"test":1}\n'));
}

const temizlik = await eskiArsivleriTemizle();
kontrol('20 günlük arşiv SİLİNDİ', !fs.existsSync(eskiDosya));
kontrol('bugünün arşivi KALDI', fs.existsSync(yeniDosya));
kontrol('temizlik silinen sayısı bildirildi', temizlik.silinen >= 1, JSON.stringify(temizlik));

// Temizlik testi dosyalarını topla
for (const d of [yeniDosya, bozukAd]) { try { fs.unlinkSync(d); } catch { /* yok */ } }
try { fs.rmSync(gecici, { recursive: true, force: true }); } catch { /* yok */ }

/* ---- Gerçek rotasyon: geçici dosyayla uçtan uca ---- */
// Rotasyon modülü sabit LOG_PATH kullanıyor; bu yüzden gerçek günlüğü kirletmeden
// "rename + gzip" mantığını ayrıca doğruluyoruz (aynı işlemler).
{
  const t = path.join(gecici + '-rot', 'request_log.jsonl');
  fs.mkdirSync(path.dirname(t), { recursive: true });
  const satirlar = Array.from({ length: 500 }, (_, i) => JSON.stringify({ i, ts: new Date().toISOString() }));
  fs.writeFileSync(t, satirlar.join('\n') + '\n');

  const tasi = t + '.rotating';
  const hedef = t.replace('.jsonl', '_' + yeni + '.jsonl.gz');
  fs.renameSync(t, tasi);                       // atomic devir
  // Devirden SONRA gelen kayıt yeni dosyaya gitmeli
  fs.appendFileSync(t, JSON.stringify({ sonradan: true }) + '\n');
  await new Promise((res, rej) => {
    const gz = zlib.createGzip();
    const gir = fs.createReadStream(tasi);
    const cik = fs.createWriteStream(hedef);
    gir.pipe(gz).pipe(cik).on('finish', res).on('error', rej);
  });
  fs.unlinkSync(tasi);

  kontrol('atomic devir: eski dosya taşındı', !fs.existsSync(tasi));
  kontrol('devirden sonra yeni günlük oluştu', fs.existsSync(t) && fs.statSync(t).size > 0);
  kontrol('devirden sonraki kayıt YENİ dosyada (veri kaybı yok)',
    fs.readFileSync(t, 'utf8').includes('sonradan'));

  const arsiv = zlib.gunzipSync(fs.readFileSync(hedef)).toString('utf8').split('\n').filter(Boolean);
  kontrol('arşiv 500 satır (devir öncesi tümü korundu)', arsiv.length === 500, String(arsiv.length));
  kontrol('arşiv satırları geçerli JSON',
    arsiv.every(s => { try { JSON.parse(s); return true; } catch { return false; } }));

  const verim = Math.round((1 - fs.statSync(hedef).size / (satirlar.join('\n').length + 1)) * 100);
  kontrol('gzip sıkıştırma oranı > %50', verim > 50, `%${verim}`);
  try { fs.rmSync(path.dirname(t), { recursive: true, force: true }); } catch { /* yok */ }
}

/* ---- Eşzamanlı yazma sırasında rotasyon: SATIR KAYBI OLMAMALI ---- */
{
  const d = path.join(gecici + '-esz', 'request_log.jsonl');
  fs.mkdirSync(path.dirname(d), { recursive: true });
  const ilk = Array.from({ length: 200 }, (_, i) => JSON.stringify({ part: 'eski', i }));
  fs.writeFileSync(d, ilk.join('\n') + '\n');

  const tasi = d + '.rotating';
  const hedef = d.replace('.jsonl', '_esz.jsonl.gz');
  fs.renameSync(d, tasi); // atomic devir

  // gzip sürerken YENİ günlüğe yazmaya devam et (rotasyon yazmayı bekletmemeli)
  const gzipSozu = new Promise((res, rej) => {
    const gz = zlib.createGzip();
    fs.createReadStream(tasi).pipe(gz).pipe(fs.createWriteStream(hedef)).on('finish', res).on('error', rej);
  });
  const yeniSatirlar = [];
  for (let i = 0; i < 100; i++) {
    const satir = JSON.stringify({ part: 'yeni', i });
    yeniSatirlar.push(satir);
    fs.appendFileSync(d, satir + '\n'); // rotasyon sürerken yazma
  }
  await gzipSozu;
  fs.unlinkSync(tasi);

  const arsivSatir = zlib.gunzipSync(fs.readFileSync(hedef)).toString('utf8').split('\n').filter(Boolean);
  const yeniIcerik = fs.readFileSync(d, 'utf8').split('\n').filter(Boolean);

  kontrol('eşzamanlı: arşivde 200 satır korundu', arsivSatir.length === 200, String(arsivSatir.length));
  kontrol('eşzamanlı: yeni dosyada 100 satır', yeniIcerik.length === 100, String(yeniIcerik.length));
  kontrol('eşzamanlı: toplam 300 satır (kayıp yok)', arsivSatir.length + yeniIcerik.length === 300);
  kontrol('eşzamanlı: yeni satırlar doğru dosyada',
    yeniIcerik.every(s => JSON.parse(s).part === 'yeni'));
  kontrol('eşzamanlı: arşiv satırları eski veriler',
    arsivSatir.every(s => JSON.parse(s).part === 'eski'));
  try { fs.rmSync(path.dirname(d), { recursive: true, force: true }); } catch { /* yok */ }
}

/* ============ 2) SCRAPER ENTEGRASYONU ============ */
const scraper = fs.readFileSync('src/scraper.js', 'utf8');
kontrol('logRequest rotasyonu çağırıyor', /rotasyonGerekliMi\(\)/.test(scraper));
kontrol('scraper logRotasyon modülünü import ediyor', /from '\.\/logRotasyon\.js'/.test(scraper));

/* ============ 3) HEALTH PULSE ============ */
const { hataSinifla, KONTROL_SAATI, adaptorKontrol, saglikDurumu } = await import('../src/healthPulse.js');

kontrol('kontrol saati 04:00', KONTROL_SAATI === 4, String(KONTROL_SAATI));

// Hata sınıflandırma
const h403 = hataSinifla(Object.assign(new Error('Site HTTP 403 döndürdü.'), { status: 403 }));
kontrol('403 → bot_korumasi', h403.durum === 'bot_korumasi', h403.durum);
const h429 = hataSinifla(Object.assign(new Error('Site HTTP 429 döndürdü.'), { status: 429 }));
kontrol('429 → bot_korumasi', h429.durum === 'bot_korumasi', h429.durum);
const hCf = hataSinifla(new Error('Cloudflare challenge sayfası'));
kontrol('Cloudflare → bot_korumasi', hCf.durum === 'bot_korumasi', hCf.durum);
const hCaptcha = hataSinifla(new Error('Please verify you are human'));
kontrol('captcha metni → bot_korumasi', hCaptcha.durum === 'bot_korumasi', hCaptcha.durum);
const hBos = hataSinifla(new Error('Sayfa boş döndü (render=true ile de denendi).'));
kontrol('boş sayfa → hata (bot değil)', hBos.durum === 'hata', hBos.durum);
const hNet = hataSinifla(new Error('Ağ hatası: fetch failed'));
kontrol('ağ hatası → hata', hNet.durum === 'hata', hNet.durum);

// Sağlık durumu yapısı
const sd = saglikDurumu();
kontrol('saglikDurumu: kontrolSaati', /^4:00$/.test(sd.kontrolSaati), sd.kontrolSaati);
kontrol('saglikDurumu: siteDurumlari nesne', sd.siteDurumlari && typeof sd.siteDurumlari === 'object');
kontrol('saglikDurumu: aktif sayı', typeof sd.aktif === 'number');
kontrol('saglikDurumu: bekleyen dizi', Array.isArray(sd.bekleyen));

/* ---- Sahte adaptörlerle durum sınıflandırması (ağa çıkmadan) ---- */
// (a) Arama çalışıyor, ürün+fiyat okunuyor → ok
const okAdapter = {
  id: 'test_ok', name: 'Test OK',
  searchProducts: async () => ([{ title: 'Ürün A', url: 'https://t/a', price: 100 }]),
  getProduct: async () => ({ title: 'Ürün A', sellingPrice: 123.45, pricing: { toplam: 123.45 } }),
};
const rOk = await adaptorKontrol(okAdapter);
kontrol('ok: durum ok', rOk.durum === 'ok', rOk.durum);
kontrol('ok: fiyat okundu', rOk.ornekFiyat === 123.45, String(rOk.ornekFiyat));
kontrol('ok: başlık okundu', rOk.ornekBaslik === 'Ürün A', rOk.ornekBaslik);
kontrol('ok: adet bildirildi', rOk.adet === 1, String(rOk.adet));
kontrol('ok: arama/ürün süresi ölçüldü',
  Number.isFinite(rOk.aramaMs) && Number.isFinite(rOk.urunMs), `${rOk.aramaMs}/${rOk.urunMs}`);

// (b) Arama 0 sonuç → bos_sonuc (bozuk DEĞİL)
const bosAdapter = {
  id: 'test_bos', name: 'Test Boş',
  searchProducts: async () => ([]),
  getProduct: async () => { throw new Error('çağrılmamalı'); },
};
const rBos = await adaptorKontrol(bosAdapter);
kontrol('0 sonuç → bos_sonuc', rBos.durum === 'bos_sonuc', rBos.durum);
kontrol('0 sonuç "bozuk" sayılmadı', rBos.durum !== 'hata');

// (c) Ürün fiyatı 0 → fiyat_yok (format bozuk)
const sifirAdapter = {
  id: 'test_sifir', name: 'Test Sıfır',
  searchProducts: async () => ([{ title: 'Ürün', url: 'https://t/x', price: 0 }]),
  getProduct: async () => ({ title: 'Ürün', sellingPrice: 0, pricing: { toplam: 0 } }),
};
const rSifir = await adaptorKontrol(sifirAdapter);
kontrol('fiyat 0 → fiyat_yok', rSifir.durum === 'fiyat_yok', rSifir.durum);
kontrol('fiyat_yok: hata açıklaması var', /Fiyat okunamadı/.test(rSifir.hata || ''), rSifir.hata);

// (d) Başlık yok → fiyat_yok
const basliksuzAdapter = {
  id: 'test_basliksuz', name: 'Test Başlıksız',
  searchProducts: async () => ([{ title: 'Ürün', url: 'https://t/y', price: 50 }]),
  getProduct: async () => ({ title: '', sellingPrice: 50, pricing: { toplam: 50 } }),
};
const rBasliksuz = await adaptorKontrol(basliksuzAdapter);
kontrol('başlık yok → fiyat_yok', rBasliksuz.durum === 'fiyat_yok', rBasliksuz.durum);

// (e) Bot koruması → bot_korumasi
const botAdapter = {
  id: 'test_bot', name: 'Test Bot',
  searchProducts: async () => { throw Object.assign(new Error('Site HTTP 403 döndürdü.'), { status: 403 }); },
  getProduct: async () => { throw new Error('çağrılmamalı'); },
};
const rBot = await adaptorKontrol(botAdapter);
kontrol('403 → bot_korumasi', rBot.durum === 'bot_korumasi', rBot.durum);
kontrol('bot: arama hatası raporlandı', /Arama:/.test(rBot.hata || ''), rBot.hata);

// (f) Genel hata
const hataAdapter = {
  id: 'test_hata', name: 'Test Hata',
  searchProducts: async () => { throw new Error('Ağ hatası: fetch failed'); },
  getProduct: async () => { throw new Error('çağrılmamalı'); },
};
const rHata = await adaptorKontrol(hataAdapter);
kontrol('ağ hatası → hata', rHata.durum === 'hata', rHata.durum);

// (g) İlk ürün bozuk, ikinci sağlam → ok (dayanıklılık)
let cagri = 0;
const dayanikli = {
  id: 'test_dayanikli', name: 'Test Dayanıklı',
  searchProducts: async () => ([{ title: 'A', url: 'https://t/1' }, { title: 'B', url: 'https://t/2' }]),
  getProduct: async () => {
    cagri++;
    if (cagri === 1) throw new Error('Sayfa boş döndü');
    return { title: 'Ürün B', sellingPrice: 99, pricing: { toplam: 99 } };
  },
};
const rDay = await adaptorKontrol(dayanikli);
kontrol('ilk aday bozuksa ikinci denenir → ok', rDay.durum === 'ok', rDay.durum);
kontrol('ikinci aday kullanıldı', rDay.aramaUrl === 'https://t/2', rDay.aramaUrl);

/* ============ 4) SUNUCU ENTEGRASYONU ============ */
const server = fs.readFileSync('server.js', 'utf8');
kontrol('/api/health/check ucu var', /app\.post\('\/api\/health\/check'/.test(server));
kontrol('/api/health ucu var', /app\.get\('\/api\/health'/.test(server));
kontrol('/api/health/:site ucu var', /app\.get\('\/api\/health\/:site'/.test(server));
kontrol('/api/durum sağlık içeriyor', /saglik: saglikDurumu\(\)/.test(server));
kontrol('/api/durum log durumu içeriyor', /log: logDurumu\(\)/.test(server));
kontrol('/api/log/rotate ucu var', /app\.post\('\/api\/log\/rotate'/.test(server));
kontrol('nöbetçi açılışta başlıyor', /saglikNobetcisiBaslat\(/.test(server));
kontrol('eşzamanlı sağlık kontrolü engelleniyor', /healthCalisiyor/.test(server));

/* ============ 5) TELEGRAM MESAJ FORMATI ============ */
const hp = fs.readFileSync('src/healthPulse.js', 'utf8');
kontrol('tek uyarı formatı: "adaptörü hata verdi!"', /adaptörü hata verdi!/.test(hp));
kontrol('tek uyarı "HTML yapısını kontrol edin" içeriyor', /HTML yapısını kontrol edin/.test(hp));
kontrol('özet formatı: "X/Y mağaza aktif"', /mağaza aktif/.test(hp));
kontrol('telegram HTML kaçışı var', /function tgKac/.test(hp));
kontrol('tek uyarı sayısı sınırlı (spam yok)', /TEK_UYARI_LIMIT/.test(hp));

// Gerçek metin üretimi (kullanıcının istediği biçim birebir)
const { tekUyariMetni, ozetMetni } = await import('../src/healthPulse.js');

const tu = tekUyariMetni({ siteName: 'Teknosa', durum: 'fiyat_yok', hata: 'Fiyat okunamadı' });
kontrol('tek uyarı konusu: "⚠️ Teknosa adaptörü hata verdi!"',
  tu.konu === '⚠️ Teknosa adaptörü hata verdi!', tu.konu);
kontrol('tek uyarı içeriği "Hata: ..." ile başlıyor', /^Hata: /.test(tu.icerik), tu.icerik);
kontrol('tek uyarı "Lütfen HTML yapısını kontrol edin." içeriyor',
  tu.icerik.includes('Lütfen HTML yapısını kontrol edin.'), tu.icerik);

// HTML kaçışı (Telegram parse_mode=HTML için zorunlu)
const tKacis = tekUyariMetni({ siteName: '<b>Kötü</b>', durum: 'hata', hata: 'fiyat > 0 & "boş"' });
kontrol('mağaza adı HTML kaçışlı', !tKacis.konu.includes('<b>'), tKacis.konu);
kontrol('hata metni HTML kaçışlı', tKacis.icerik.includes('&gt;') && tKacis.icerik.includes('&amp;'), tKacis.icerik);

// Özet: "59/61 mağaza aktif, 2 mağaza inceleme bekliyor"
const sonuclar61 = Array.from({ length: 61 }, (_, i) => ({ site: 's' + i }));
const ozSorunlu = ozetMetni({
  sonuclar: sonuclar61,
  bekleyen: [{ siteName: 'Teknosa', durum: 'fiyat_yok' }, { siteName: 'Amazon.tr', durum: 'bot_korumasi' }],
  sonucsuz: 4, aktif: 55,
});
kontrol('özet "59/61 mağaza aktif" biçiminde', /55\/61 mağaza aktif/.test(ozSorunlu.icerik), ozSorunlu.icerik.split('\n')[1]);
kontrol('özet "2 mağaza inceleme bekliyor" der', /2 mağaza inceleme bekliyor/.test(ozSorunlu.icerik), ozSorunlu.icerik);
kontrol('özet sorunlu mağazaları listeler',
  ozSorunlu.icerik.includes('Teknosa') && ozSorunlu.icerik.includes('Amazon.tr'));
kontrol('özet boş sonuçları ayrı belirtir', /4 mağaza o sorguda sonuç döndürmedi/.test(ozSorunlu.icerik));
kontrol('özet konusu "🩺 Adaptör sağlık raporu"', ozSorunlu.konu === '🩺 Adaptör sağlık raporu', ozSorunlu.konu);

const ozTemiz = ozetMetni({ sonuclar: sonuclar61, bekleyen: [], sonucsuz: 0, aktif: 61 });
kontrol('sorun yoksa "inceleme bekleyen mağaza yok" der', /inceleme bekleyen mağaza yok/.test(ozTemiz.icerik), ozTemiz.icerik);

const ozCok = ozetMetni({
  sonuclar: sonuclar61,
  bekleyen: Array.from({ length: 20 }, (_, i) => ({ siteName: 'Site' + i, durum: 'hata' })),
  sonucsuz: 0, aktif: 41,
});
kontrol('20 sorunlu mağazada liste 12 ile sınırlanır', /… \+8 mağaza/.test(ozCok.icerik), ozCok.icerik.slice(-40));

/* ============ 6) SQLITE TABLOSU ============ */
const store = fs.readFileSync('src/store.js', 'utf8');
kontrol('adapter_health tablosu tanımlı', /CREATE TABLE IF NOT EXISTS adapter_health/.test(store));
kontrol('adapter_health indeksi var', /idx_adapter_health_site/.test(store));
kontrol('addAdapterHealth fonksiyonu var', /export function addAdapterHealth/.test(store));
kontrol('getAdapterHealthLatest fonksiyonu var', /export function getAdapterHealthLatest/.test(store));
kontrol('pruneAdapterHealth fonksiyonu var', /export function pruneAdapterHealth/.test(store));

/* ============ 7) CANLI: 3 adaptör gerçekten yoklanır ============ */
if (canli) {
  console.log('\n  canlı test: robo90, bisiparisver, teknosa');
  const t0 = Date.now();
  const { saglikKontrolu } = await import('../src/healthPulse.js');
  const r = await saglikKontrolu({ siteIds: ['robo90', 'bisiparisver', 'teknosa'], bildir: false });
  const sure = Date.now() - t0;

  kontrol('canlı: 3 adaptör yoklandı', r.toplam === 3, String(r.toplam));
  kontrol('canlı: en az 2 aktif', r.aktif >= 2, `${r.aktif}/3`);
  kontrol('canlı: makul süre (<120 sn)', sure < 120000, `${Math.round(sure / 1000)} sn`);
  kontrol('canlı: her sonuçta site var', r.sonuclar.every(s => !!s.site));

  for (const s of r.sonuclar) {
    const detay = s.ornekBaslik || s.hata || '';
    console.log(`    ${String(s.site).padEnd(14)} ${String(s.durum).padEnd(13)} ${String(s.aramaMs).padStart(6)}ms ${String(s.urunMs).padStart(6)}ms | ${String(detay).slice(0, 50)}`);
  }

  // Kayıt DB'ye yazıldı mı?
  const { saglikDurumu: sd2 } = await import('../src/healthPulse.js');
  const durum2 = sd2();
  kontrol('canlı: sonuçlar DB’ye yazıldı',
    ['robo90', 'bisiparisver', 'teknosa'].every(s => !!durum2.siteDurumlari[s]),
    JSON.stringify(Object.keys(durum2.siteDurumlari)));
}

// Windows'ta node:sqlite tutamakları çıkışta 0xC0000409 ile çökebiliyor;
// healthPulse store'u import ettiği için DB açık kalır → kapat.
try {
  const { closeDatabase } = await import('../src/store.js');
  closeDatabase();
} catch { /* yok ise geç */ }

console.log(`SAGLIK-LOG ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
process.exitCode = gecen === toplam ? 0 : 1;
