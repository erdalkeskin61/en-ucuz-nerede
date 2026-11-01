/**
 * 🧹 SQLite WAL Checkpoint + Önbellek Temizliği testleri — 2026-11-01
 *
 * Gerçek veritabanına DOKUNMAZ: geçici bir SQLite dosyası ve geçici önbellek
 * dizini kullanır. Böylece test, üretimdeki 22.000 dosyayı silmez.
 *
 * Kapsam:
 *  1) WAL checkpoint (TRUNCATE) raporu + WAL küçülmesi
 *  2) snapshot 7 gün / fırsat 60 gün temizliği (yeni kayıtlara dokunmaz)
 *  3) Önbellek: yalnızca 30 günden eski .json dosyaları, chunk'lı tarama
 *  4) kuru (dry-run) modu: hiçbir şey silinmez
 *  5) Rapor sözleşmesi (istenen alanlar)
 *  6) healthPulse 04:00 entegrasyonu, sunucu uçları, Ayarlar paneli
 *
 * Kullanım: node scripts/test-db-bakim.mjs [--canli]
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { dbBakimCalistir, onbellekTemizle, dbBoyutlari, VARSAYILAN } from '../src/dbBakim.js';

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
const oku = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const GUN = 24 * 3600 * 1000;

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'eun-bakim-'));
const dbYolu = path.join(tmp, 'test.db');
const cacheDir = path.join(tmp, 'cache');
await fsp.mkdir(cacheDir, { recursive: true });

/* ---------------------------------------------------------------- */
bolum('1) Geçici veritabanı hazırlığı');
const db = new DatabaseSync(dbYolu);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE snapshot (anahtar TEXT PRIMARY KEY, ts INTEGER, payload TEXT);
  CREATE TABLE firsat_gonderim (id INTEGER PRIMARY KEY AUTOINCREMENT, anahtar TEXT, ts INTEGER, durum TEXT);
  CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, updated_at INTEGER);
  CREATE TABLE adapter_health (id INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT, kontrol_ts TEXT);
`);
const simdi = Date.UTC(2026, 9, 31, 4, 5, 0);
db.prepare('INSERT INTO snapshot (anahtar, ts, payload) VALUES (?, ?, ?)')
  .run('eski', simdi - 10 * GUN, '{}');
db.prepare('INSERT INTO snapshot (anahtar, ts, payload) VALUES (?, ?, ?)')
  .run('yeni', simdi - 1 * GUN, '{}');
db.prepare('INSERT INTO firsat_gonderim (anahtar, ts, durum) VALUES (?, ?, ?)')
  .run('eski-firsat', simdi - 61 * GUN, 'gonderildi');
db.prepare('INSERT INTO firsat_gonderim (anahtar, ts, durum) VALUES (?, ?, ?)')
  .run('yeni-firsat', simdi - 2 * GUN, 'gonderildi');
// WAL'i şişir: çok sayıda yazma + checkpoint'i ertele.
for (let i = 0; i < 400; i++) {
  db.prepare('INSERT INTO jobs (id, status, updated_at) VALUES (?, ?, ?)')
    .run('job-' + i, 'done', simdi - i * 1000);
}
kontrol('WAL modu açık', String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase() === 'wal');

/* ---------------------------------------------------------------- */
bolum('2) Önbellek dosyaları (eski/yeni ayrımı)');
const ESKI = 12;
const YENI = 15;
let eskiBayt = 0;
for (let i = 0; i < ESKI; i++) {
  const p = path.join(cacheDir, `eski-${i}.json`);
  const icerik = 'x'.repeat(2000 + i * 100); // farklı boyutlar
  await fsp.writeFile(p, icerik);
  eskiBayt += Buffer.byteLength(icerik);
  const t = new Date(simdi - 40 * GUN);
  await fsp.utimes(p, t, t);
}
for (let i = 0; i < YENI; i++) {
  const p = path.join(cacheDir, `yeni-${i}.json`);
  await fsp.writeFile(p, 'y'.repeat(500));
  const t = new Date(simdi - 2 * GUN);
  await fsp.utimes(p, t, t);
}
// Korunması gerekenler: eski ama .json değil, ve alt dizin
await fsp.writeFile(path.join(cacheDir, 'eski-not.txt'), 'korunmalı');
{
  const t = new Date(simdi - 90 * GUN);
  await fsp.utimes(path.join(cacheDir, 'eski-not.txt'), t, t);
}
await fsp.mkdir(path.join(cacheDir, 'alt'), { recursive: true });
await fsp.writeFile(path.join(cacheDir, 'alt', 'eski.json'), 'alt dizin taranmaz');
kontrol('hazırlık: 27 json + 1 txt', (await fsp.readdir(cacheDir)).filter(a => a.endsWith('.json')).length === ESKI + YENI);

/* ---------------------------------------------------------------- */
bolum('3) Kuru çalışma (silme yok)');
const kuru = await dbBakimCalistir({
  db, cacheDir, simdi, kuru: true, logRotasyon: false,
  cleanupJobs: () => 0, pruneHealth: () => 0,
});
kontrol('kuru: silinecek snapshot sayısı 1', kuru.silinenSnapshotSayisi === 1, String(kuru.silinenSnapshotSayisi));
kontrol('kuru: silinecek fırsat 1', kuru.silinenFirsatSayisi === 1, String(kuru.silinenFirsatSayisi));
kontrol('kuru: silinecek dosya 12', kuru.temizlenenOnbellekDosyaSayisi === ESKI, String(kuru.temizlenenOnbellekDosyaSayisi));
kontrol('kuru: dosyalar gerçekten duruyor',
  (await fsp.readdir(cacheDir)).filter(a => a.endsWith('.json')).length === ESKI + YENI);
kontrol('kuru: snapshot kaydı duruyor',
  db.prepare("SELECT COUNT(*) adet FROM snapshot WHERE anahtar='eski'").get().adet === 1);

/* ---------------------------------------------------------------- */
bolum('4) Gerçek bakım');
const walOnce = dbBoyutlari().wal; // gerçek DB boyutu (bilgi amaçlı)
let jobsCagrildi = 0;
let saglikCagrildi = 0;
const r = await dbBakimCalistir({
  db, cacheDir, simdi, logRotasyon: false,
  cleanupJobs: () => { jobsCagrildi++; return 3; },
  pruneHealth: () => { saglikCagrildi++; return 2; },
});

kontrol('ok=true', r.ok === true, JSON.stringify(r.hatalar));
kontrol('tarih ISO', /^\d{4}-\d{2}-\d{2}T/.test(r.tarih), r.tarih);
kontrol('walCheckpoint alanları', ['busy', 'log', 'checkpointed'].every(k => Number.isFinite(r.walCheckpoint[k])),
  JSON.stringify(r.walCheckpoint));
kontrol('checkpoint busy=0', r.walCheckpoint.busy === 0, String(r.walCheckpoint.busy));
kontrol('snapshot: yalnızca eski silindi', r.silinenSnapshotSayisi === 1, String(r.silinenSnapshotSayisi));
kontrol('snapshot: yeni korundu',
  db.prepare("SELECT COUNT(*) adet FROM snapshot WHERE anahtar='yeni'").get().adet === 1);
kontrol('snapshot: eski gitti',
  db.prepare("SELECT COUNT(*) adet FROM snapshot WHERE anahtar='eski'").get().adet === 0);
kontrol('fırsat: yalnızca 60+ gün silindi', r.silinenFirsatSayisi === 1, String(r.silinenFirsatSayisi));
kontrol('fırsat: yeni korundu',
  db.prepare("SELECT COUNT(*) adet FROM firsat_gonderim WHERE anahtar='yeni-firsat'").get().adet === 1);
kontrol('jobs temizleyicisi çağrıldı', jobsCagrildi === 1);
kontrol('sağlık temizleyicisi çağrıldı', saglikCagrildi === 1);
kontrol('jobs sonucu raporda', r.silinenJobSayisi === 3, String(r.silinenJobSayisi));
kontrol('sağlık sonucu raporda', r.silinenSaglikSayisi === 2, String(r.silinenSaglikSayisi));

kontrol('önbellek: 12 dosya silindi', r.temizlenenOnbellekDosyaSayisi === ESKI, String(r.temizlenenOnbellekDosyaSayisi));
kontrol('önbellek: kazanılan MB doğru', Math.abs(r.kazanilanDiskMb - (eskiBayt / (1024 * 1024))) < 0.06,
  `${r.kazanilanDiskMb} vs ${(eskiBayt / (1024 * 1024)).toFixed(2)}`);
kontrol('önbellek: .txt korundu', fs.existsSync(path.join(cacheDir, 'eski-not.txt')));
kontrol('önbellek: alt dizine dokunulmadı', fs.existsSync(path.join(cacheDir, 'alt', 'eski.json')));
kontrol('önbellek: yeni json dosyaları korundu',
  (await fsp.readdir(cacheDir)).filter(a => a.startsWith('yeni-')).length === YENI);
kontrol('önbellek: tarama sayacı', r.onbellek.tarandi === ESKI + YENI, String(r.onbellek.tarandi));
kontrol('süre sayısal', Number.isFinite(r.sureMs) && r.sureMs >= 0, String(r.sureMs));

// WAL: yazmalardan sonra checkpoint WAL'i küçültmüş olmalı
kontrol('db boyut raporu var', Number.isFinite(r.db.once.walMb) && Number.isFinite(r.db.sonra.walMb),
  JSON.stringify(r.db));
kontrol('checkpoint sonrası WAL büyümedi', r.db.sonra.walMb <= r.db.once.walMb + 0.02,
  `${r.db.once.walMb} → ${r.db.sonra.walMb}`);
kontrol('log denetimi raporlandı', typeof r.log.boyutMb === 'number' && Number.isFinite(r.log.esikMb),
  JSON.stringify(r.log).slice(0, 120));

// Rapor sözleşmesi (istenen alanlar birebir)
const beklenen = ['ok', 'tarih', 'walCheckpoint', 'temizlenenOnbellekDosyaSayisi', 'kazanilanDiskMb', 'silinenSnapshotSayisi', 'sureMs'];
for (const k of beklenen) kontrol(`rapor alanı: ${k}`, k in r);

/* ---------------------------------------------------------------- */
bolum("5) Chunk'lı tarama ve eksik dizin");
{
  const d2 = path.join(tmp, 'cache2');
  await fsp.mkdir(d2, { recursive: true });
  for (let i = 0; i < 7; i++) {
    const p = path.join(d2, `f${i}.json`);
    await fsp.writeFile(p, 'z');
    const t = new Date(simdi - 50 * GUN);
    await fsp.utimes(p, t, t);
  }
  const c = await onbellekTemizle({ cacheDir: d2, gun: 30, simdi, chunk: 2 });
  kontrol('chunk=2 ile 7 dosya silindi', c.silinen === 7, String(c.silinen));
  kontrol('chunk sonrası dizin boş', (await fsp.readdir(d2)).length === 0);
}
{
  // Boyut üst sınırı: yaş kuralı silmez, boyut kuralı en eskiden başlar.
  const d3 = path.join(tmp, 'cache3');
  await fsp.mkdir(d3, { recursive: true });
  for (let i = 0; i < 5; i++) {
    const p = path.join(d3, `b${i}.json`);
    await fsp.writeFile(p, 'a'.repeat(1000));
    const t = new Date(simdi - (i + 1) * 60 * 1000); // b0 en yeni, b4 en eski
    await fsp.utimes(p, t, t);
  }
  const c = await onbellekTemizle({ cacheDir: d3, gun: 30, simdi, maksMb: 0.003, chunk: 2 });
  kontrol('boyut kuralı devreye girdi', c.boyutKuraliSilinen >= 1, String(c.boyutKuraliSilinen));
  kontrol('boyut kuralı en eskiyi sildi', !fs.existsSync(path.join(d3, 'b4.json')));
  kontrol('boyut kuralı en yeniyi korudu', fs.existsSync(path.join(d3, 'b0.json')));
  kontrol('kalan boyut sınırın altında', c.kalanBayt <= 0.003 * 1024 * 1024, String(c.kalanBayt));
  kontrol('yaş kuralı sayacı ayrı', c.silinen === c.boyutKuraliSilinen, `${c.silinen}/${c.boyutKuraliSilinen}`);
}
{
  const yok = await onbellekTemizle({ cacheDir: path.join(tmp, 'olmayan-dizin'), simdi });
  kontrol('olmayan dizin hata vermez', yok.silinen === 0 && yok.tarandi === 0);
}

/* ---------------------------------------------------------------- */
bolum('6) Kaynak sözleşmesi (entegrasyon)');
{
  const store = oku('src/store.js');
  const bakim = oku('src/dbBakim.js');
  const hp = oku('src/healthPulse.js');
  const server = oku('server.js');
  const html = oku('public/ayarlar.html');
  const js = oku('public/ayarlar.js');

  kontrol('store: dbBaglantisi export', /export function dbBaglantisi\(\)/.test(store));
  kontrol('store: dbBakim ayar anahtarları', /DBBAKIM_ANAHTARLARI/.test(store));

  kontrol('bakım: WAL checkpoint TRUNCATE', /PRAGMA wal_checkpoint\(TRUNCATE\)/.test(bakim));
  kontrol('bakım: PRAGMA optimize', /PRAGMA optimize/.test(bakim));
  kontrol('bakım: snapshot 7 gün varsayılan', /snapshotGun: 7/.test(bakim));
  kontrol('bakım: fırsat 60 gün varsayılan', /firsatGun: 60/.test(bakim));
  kontrol('bakım: önbellek 30 gün varsayılan', /onbellekGun: 30/.test(bakim));
  kontrol('bakım: cleanupOldJobs kullanılıyor', /cleanupOldJobs/.test(bakim));
  kontrol('bakım: pruneAdapterHealth kullanılıyor', /pruneAdapterHealth/.test(bakim));
  kontrol('bakım: readdir + chunk', /fsp\.readdir\(dir, \{ withFileTypes: true \}\)/.test(bakim) && /CHUNK/.test(bakim));
  kontrol('bakım: setImmediate ile yield', /setImmediate/.test(bakim));
  kontrol('bakım: log rotasyonu tetikleniyor', /logRotasyonuYap\('boyut'\)/.test(bakim));
  kontrol('bakım: ESIK_BAYT kullanılıyor', /ESIK_BAYT/.test(bakim));
  kontrol('varsayılanlar dondurulmuş', Object.isFrozen(VARSAYILAN));

  kontrol('healthPulse: geceBakiminiCalistir', /export async function geceBakiminiCalistir/.test(hp));
  kontrol('healthPulse: 04:00 nöbetçisi', /KONTROL_SAATI = 4/.test(hp));
  kontrol('healthPulse: sağlıktan sonra bakım', /await saglikKontrolu[\s\S]{0,400}await geceBakiminiCalistir\(\)/.test(hp));
  kontrol('healthPulse: açılış telafisinde de bakım', /finally\(\(\) => \{ geceBakiminiCalistir\(\)/.test(hp));

  kontrol('sunucu: GET /api/db/bakim', /app\.get\('\/api\/db\/bakim'/.test(server));
  kontrol('sunucu: POST /api/db/bakim', /app\.post\('\/api\/db\/bakim'/.test(server));
  kontrol('sunucu: eşzamanlı çalışma koruması', /bakimCalisiyor/.test(server));

  kontrol('ayarlar: bakım kartı', /Veritabanı ve Önbellek Bakımı/.test(html));
  kontrol('ayarlar: çalıştır düğmesi', /id="dbBakimBtn"/.test(html));
  kontrol('ayarlar: kuru tarama düğmesi', /id="dbBakimKuruBtn"/.test(html));
  kontrol('ayarlar: durum alanı', /id="dbBakimDurum"/.test(html));
  kontrol('ayarlar.js: API çağrısı', /\/api\/db\/bakim/.test(js));
  kontrol('ayarlar.js: busy uyarısı gösteriliyor', /busy=\$\{cp\.busy/.test(js));
}

/* ---------------------------------------------------------------- */
bolum('7) Canlı uç (opsiyonel)');
if (process.argv.includes('--canli')) {
  const taban = (process.env.BASE_URL || `http://127.0.0.1:${config.port}`).replace(/\/+$/, '');
  const h = { 'Content-Type': 'application/json' };
  if (config.erisimAnahtari) h['x-erisim-anahtari'] = config.erisimAnahtari;
  try {
    const d = await (await fetch(taban + '/api/db/bakim', { headers: h })).json();
    kontrol('canlı: durum ucu', Number.isFinite(d.boyutlar?.dbMb), JSON.stringify(d.boyutlar));
    kontrol('canlı: WAL boyutu raporlanıyor', Number.isFinite(d.boyutlar?.walMb), String(d.boyutlar?.walMb));
    const r2 = await (await fetch(taban + '/api/db/bakim', {
      method: 'POST', headers: h, body: JSON.stringify({ kuru: true }),
    })).json();
    kontrol('canlı: kuru bakım ok', r2.ok === true, JSON.stringify(r2.hatalar || []).slice(0, 120));
    kontrol('canlı: rapor alanları', r2.walCheckpoint && Number.isFinite(r2.sureMs));
    kontrol('canlı: kuru modda disk kazanımı raporlanır (silme yok)',
      Number.isFinite(r2.kazanilanDiskMb));
    console.log(`     canlı: DB ${d.boyutlar.dbMb} MB · WAL ${d.boyutlar.walMb} MB · `
      + `taranan ${r2.onbellek?.tarandi ?? 0} dosya · silinecek ${r2.temizlenenOnbellekDosyaSayisi}`);
  } catch (e) {
    kontrol('canlı uç erişilebilir', false, String(e.message || e));
  }
} else {
  console.log('ℹ️  Canlı test için: --canli');
}

/* ---------------------------------------------------------------- */
try { db.close(); } catch { /* kapalı */ }
await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});

console.log(`\nDB-BAKIM ${gecen}/${toplam}${gecen === toplam ? ' ✓' : ''}`);
if (gecen !== toplam) console.log('Hatalar:\n - ' + hatalar.join('\n - '));
process.exitCode = gecen === toplam ? 0 : 1;
