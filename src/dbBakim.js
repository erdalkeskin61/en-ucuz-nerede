/**
 * 🧹 SQLite Bakım Servisi — 2026-11-01
 *
 * SORUN: `data/en_ucuz_nerede.db` (~4,7 MB) ve WAL (~4,2 MB) sürekli büyüyor;
 * `data/cache/` altında 22.000+ JSON dosyası (≈14 GB) birikti. Disk dolduğunda
 * yazma hataları başlar, WAL şişince okumalar yavaşlar.
 *
 * ÇÖZÜM: Her gece 04:00'te (healthPulse nöbetçisinden sonra) ya da Ayarlar'dan
 * elle çalışan, sıfır kesintili bakım rutini:
 *   1) `PRAGMA wal_checkpoint(TRUNCATE)` → WAL'ı ana dosyaya aktarır, boyutu sıfırlar
 *   2) `PRAGMA optimize` → sorgu planlayıcı istatistikleri
 *   3) Eski kayıt temizliği (snapshot 7 gün, fırsat gönderimi 60 gün, jobs 7 gün,
 *      adaptör sağlığı 30 gün)
 *   4) `data/cache/` içinde 30 günden eski `.json` dosyalarını chunk'lar hâlinde siler
 *   5) `request_log.jsonl` eşiği aştıysa log rotasyonunu tetikler
 *
 * GÜVENLİK / DÜRÜSTLÜK:
 *  - Checkpoint `busy=1` dönerse (açık okuyucu) bu GİZLENMEZ; raporda görünür.
 *  - Silme işlemleri yalnızca belirtilen yaş sınırından eski kayıtları hedefler;
 *    çalışan işler ve yeni önbellek dosyaları korunur.
 *  - Önbellek taraması `readdir` + chunk + `setImmediate` ile yapılır; olay
 *    döngüsünü kilitlemez (istekler yanıt vermeye devam eder).
 *  - Hata olsa bile diğer adımlar sürer; rapor `hatalar` dizisinde açıkça listelenir.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import {
  dbBaglantisi, cleanupOldJobs, pruneAdapterHealth, getSettings, saveSettings,
} from './store.js';
import { LOG_PATH, ESIK_BAYT, logRotasyonuYap, logDurumu } from './logRotasyon.js';

/** Varsayılan saklama süreleri (gün). */
export const VARSAYILAN = Object.freeze({
  snapshotGun: 7,
  firsatGun: 60,
  jobsGun: 7,
  saglikGun: 30,
  onbellekGun: 30,
});

/** .env ile ayarlanabilen varsayılanlar (CACHE_SAKLAMA_GUN / CACHE_MAKS_MB). */
const ONBELLEK_GUN = Number(config.cacheSaklamaGun) > 0 ? Number(config.cacheSaklamaGun) : VARSAYILAN.onbellekGun;
const ONBELLEK_MAKS_MB = Number(config.cacheMaksMb) > 0 ? Number(config.cacheMaksMb) : 0;

/** Önbellek silme parça boyutu (aynı anda açık dosya tutamacı sınırlı kalsın). */
const CHUNK = 400;

const MB = 1024 * 1024;
const yuvarla = (n, h = 2) => Math.round(Number(n) * (10 ** h)) / (10 ** h);

/** Olay döngüsüne nefes aldırır (uzun taramalarda istekler bloklanmasın). */
const nefes = () => new Promise((r) => setImmediate(r));

/**
 * `data/cache/` içindeki eski JSON dosyalarını chunk'lar hâlinde siler.
 *
 * İki kural:
 *  1) `gun` gününden eski dosyalar silinir (yaş kuralı).
 *  2) `maksMb` > 0 ise: yaş kuralından sonra kalan toplam boyut sınırı aşarsa
 *     en eski dosyalar sınırın altına inene kadar silinir (LRU benzeri).
 *
 * @param {{cacheDir?:string, gun?:number, simdi?:number, kuru?:boolean, chunk?:number,
 *          maksMb?:number, ilerleme?:(bilgi:{tarandi:number,silinen:number,toplam:number})=>void}} [opts]
 * @returns {Promise<{silinen:number, kazanilanBayt:number, tarandi:number,
 *                    atlanan:number, hatalar:number, sureMs:number, dizin:string,
 *                    boyutKuraliSilinen:number, kalanBayt:number}>}
 */
export async function onbellekTemizle(opts = {}) {
  const basladi = Date.now();
  const dir = opts.cacheDir || path.join(config.dataDir, 'cache');
  const gun = Number.isFinite(Number(opts.gun)) ? Number(opts.gun) : ONBELLEK_GUN;
  const simdi = Number.isFinite(Number(opts.simdi)) ? Number(opts.simdi) : Date.now();
  const esik = simdi - gun * 24 * 3600 * 1000;
  const kuru = opts.kuru === true;
  const chunk = Math.max(1, Math.min(Number(opts.chunk) || CHUNK, 5000));
  const maksMb = Number.isFinite(Number(opts.maksMb)) ? Number(opts.maksMb) : ONBELLEK_MAKS_MB;
  const maksBayt = maksMb > 0 ? maksMb * MB : 0;

  const rapor = {
    silinen: 0, kazanilanBayt: 0, tarandi: 0, atlanan: 0, hatalar: 0,
    sureMs: 0, dizin: dir, boyutKuraliSilinen: 0, kalanBayt: 0,
  };

  let girdiler;
  try {
    girdiler = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    // Dizin yoksa hata değil: temizlenecek bir şey yok.
    if (e?.code === 'ENOENT') { rapor.sureMs = Date.now() - basladi; return rapor; }
    throw e;
  }

  const adaylar = girdiler
    .filter((g) => g.isFile() && g.name.toLowerCase().endsWith('.json'))
    .map((g) => path.join(dir, g.name));

  const sil = async (dosya, st) => {
    if (kuru) { rapor.silinen += 1; rapor.kazanilanBayt += st.size; return; }
    await fsp.unlink(dosya);
    rapor.silinen += 1;
    rapor.kazanilanBayt += st.size;
  };

  // ---- 1) Yaş kuralı ----
  const kalanlar = [];
  for (let i = 0; i < adaylar.length; i += chunk) {
    const parca = adaylar.slice(i, i + chunk);
    await Promise.all(parca.map(async (dosya) => {
      rapor.tarandi += 1;
      try {
        const st = await fsp.stat(dosya);
        if (st.mtimeMs >= esik) {
          rapor.atlanan += 1;
          kalanlar.push({ dosya, boyut: st.size, mtimeMs: st.mtimeMs });
          return;
        }
        await sil(dosya, st);
      } catch (e) {
        // Dosya bu arada silinmiş olabilir (ENOENT) — hata saymayız.
        if (e?.code !== 'ENOENT') rapor.hatalar += 1;
        else rapor.atlanan += 1;
      }
    }));
    if (typeof opts.ilerleme === 'function') {
      try { opts.ilerleme({ tarandi: rapor.tarandi, silinen: rapor.silinen, toplam: adaylar.length }); } catch { /* yoksay */ }
    }
    await nefes();
  }

  // ---- 2) Boyut sınırı (opsiyonel) ----
  let kalanBayt = kalanlar.reduce((t, x) => t + x.boyut, 0);
  if (maksBayt > 0 && kalanBayt > maksBayt) {
    // En eski önce (mtime artan).
    kalanlar.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (let i = 0; i < kalanlar.length && kalanBayt > maksBayt; i += chunk) {
      const parca = kalanlar.slice(i, i + chunk);
      for (const x of parca) {
        if (kalanBayt <= maksBayt) break;
        try {
          await sil(x.dosya, { size: x.boyut });
          rapor.boyutKuraliSilinen += 1;
          kalanBayt -= x.boyut;
        } catch (e) {
          if (e?.code !== 'ENOENT') rapor.hatalar += 1;
        }
      }
      await nefes();
    }
  }
  rapor.kalanBayt = Math.max(0, kalanBayt);

  rapor.sureMs = Date.now() - basladi;
  return rapor;
}

/** SQLite dosya boyutları (ana DB + WAL + SHM). */
export function dbBoyutlari() {
  const dbYolu = path.join(config.dataDir, 'en_ucuz_nerede.db');
  const boyut = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
  return {
    db: boyut(dbYolu),
    wal: boyut(dbYolu + '-wal'),
    shm: boyut(dbYolu + '-shm'),
    dbMb: yuvarla(boyut(dbYolu) / MB, 1),
    walMb: yuvarla(boyut(dbYolu + '-wal') / MB, 1),
  };
}

/** WAL checkpoint sonucunu tek satıra indirger. */
function checkpointSonucu(satir) {
  return {
    busy: Number(satir?.busy ?? 0),
    log: Number(satir?.log ?? 0),
    checkpointed: Number(satir?.checkpointed ?? 0),
  };
}

/**
 * Tam bakım rutini.
 *
 * @param {{kuru?:boolean, cacheGun?:number, snapshotGun?:number, firsatGun?:number,
 *          jobsGun?:number, saglikGun?:number, simdi?:number, cacheDir?:string,
 *          logRotasyon?:boolean, ilerleme?:Function}} [opts]
 * @returns {Promise<{
 *   ok:boolean, tarih:string, walCheckpoint:{busy:number,log:number,checkpointed:number},
 *   temizlenenOnbellekDosyaSayisi:number, kazanilanDiskMb:number,
 *   silinenSnapshotSayisi:number, sureMs:number, hatalar:string[],
 *   silinenFirsatSayisi:number, silinenJobSayisi:number, silinenSaglikSayisi:number,
 *   onbellek:{tarandi:number,atlanan:number,hatalar:number},
 *   log:{boyutMb:number, esikMb:number, rotasyon:null|object},
 *   db:{once:object, sonra:object}}>}
 */
export async function dbBakimCalistir(opts = {}) {
  const basladi = Date.now();
  const simdi = Number.isFinite(Number(opts.simdi)) ? Number(opts.simdi) : Date.now();
  const kuru = opts.kuru === true;
  const gun = (ad) => {
    if (Number.isFinite(Number(opts[ad]))) return Number(opts[ad]);
    if (ad === 'onbellekGun') return ONBELLEK_GUN;
    return VARSAYILAN[ad];
  };

  const rapor = {
    ok: true,
    tarih: new Date(simdi).toISOString(),
    walCheckpoint: { busy: 0, log: 0, checkpointed: 0 },
    temizlenenOnbellekDosyaSayisi: 0,
    kazanilanDiskMb: 0,
    silinenSnapshotSayisi: 0,
    silinenFirsatSayisi: 0,
    silinenJobSayisi: 0,
    silinenSaglikSayisi: 0,
    sureMs: 0,
    hatalar: [],
    kuru,
    onbellek: { tarandi: 0, atlanan: 0, hatalar: 0 },
    log: { boyutMb: 0, esikMb: yuvarla(ESIK_BAYT / MB, 1), rotasyon: null },
    db: { once: dbBoyutlari(), sonra: null },
  };

  const db = (() => {
    try { return opts.db || dbBaglantisi(); } catch (e) {
      rapor.hatalar.push('veritabanı bağlantısı: ' + String(e.message || e));
      return null;
    }
  })();

  // Test enjeksiyonu: varsayılan olarak store.js'in gerçek temizleyicileri.
  const temizleJobs = typeof opts.cleanupJobs === 'function' ? opts.cleanupJobs : cleanupOldJobs;
  const temizleSaglik = typeof opts.pruneHealth === 'function' ? opts.pruneHealth : pruneAdapterHealth;

  // ---- 1) WAL checkpoint (TRUNCATE) ----
  if (db) {
    try {
      const satir = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      rapor.walCheckpoint = checkpointSonucu(satir);
      if (rapor.walCheckpoint.busy) {
        // Dürüstlük: açık okuyucu vardı; WAL tamamen sıfırlanamadı.
        rapor.hatalar.push('wal_checkpoint busy=1 (açık okuyucu) — WAL kısmen küçültüldü');
      }
    } catch (e) {
      rapor.hatalar.push('wal_checkpoint: ' + String(e.message || e));
    }
  }

  // ---- 2) PRAGMA optimize ----
  if (db) {
    try { db.exec('PRAGMA optimize'); } catch (e) {
      rapor.hatalar.push('optimize: ' + String(e.message || e));
    }
  }

  // ---- 3) Tablo temizliği ----
  if (db) {
    // snapshot: anlık sonuç önbelleği (ts = epoch ms)
    try {
      const esik = simdi - gun('snapshotGun') * 24 * 3600 * 1000;
      if (kuru) {
        rapor.silinenSnapshotSayisi = Number(
          db.prepare('SELECT COUNT(*) adet FROM snapshot WHERE ts < ?').get(esik)?.adet || 0,
        );
      } else {
        const r = db.prepare('DELETE FROM snapshot WHERE ts < ?').run(esik);
        rapor.silinenSnapshotSayisi = Number(r.changes || 0);
      }
    } catch (e) {
      rapor.hatalar.push('snapshot temizliği: ' + String(e.message || e));
    }

    // firsat_gonderim: 60 günden eski tamamlanmış paylaşım kayıtları
    try {
      const esik = simdi - gun('firsatGun') * 24 * 3600 * 1000;
      const kosul = "ts < ? AND durum IN ('gonderildi','test','hata')";
      if (kuru) {
        rapor.silinenFirsatSayisi = Number(
          db.prepare(`SELECT COUNT(*) adet FROM firsat_gonderim WHERE ${kosul}`).get(esik)?.adet || 0,
        );
      } else {
        const r = db.prepare(`DELETE FROM firsat_gonderim WHERE ${kosul}`).run(esik);
        rapor.silinenFirsatSayisi = Number(r.changes || 0);
      }
    } catch (e) {
      rapor.hatalar.push('fırsat kaydı temizliği: ' + String(e.message || e));
    }
  }

  // Çalışan işlere dokunmayan hazır temizleyiciler (store.js).
  if (!kuru) {
    try { rapor.silinenJobSayisi = temizleJobs(gun('jobsGun')); } catch (e) {
      rapor.hatalar.push('jobs temizliği: ' + String(e.message || e));
    }
    try { rapor.silinenSaglikSayisi = temizleSaglik(gun('saglikGun')); } catch (e) {
      rapor.hatalar.push('sağlık temizliği: ' + String(e.message || e));
    }
  }

  // ---- 4) Önbellek dosyaları ----
  try {
    const r = await onbellekTemizle({
      cacheDir: opts.cacheDir,
      gun: gun('onbellekGun'),
      simdi,
      kuru,
      maksMb: Number.isFinite(Number(opts.maksMb)) ? Number(opts.maksMb) : ONBELLEK_MAKS_MB,
      ilerleme: opts.ilerleme,
    });
    rapor.temizlenenOnbellekDosyaSayisi = r.silinen;
    rapor.kazanilanDiskMb = yuvarla(r.kazanilanBayt / MB, 1);
    rapor.onbellek = {
      tarandi: r.tarandi,
      atlanan: r.atlanan,
      hatalar: r.hatalar,
      boyutKuraliSilinen: r.boyutKuraliSilinen,
      kalanMb: yuvarla(r.kalanBayt / MB, 1),
      maksMb: Number.isFinite(Number(opts.maksMb)) ? Number(opts.maksMb) : ONBELLEK_MAKS_MB,
    };
    if (r.hatalar) rapor.hatalar.push(`önbellek: ${r.hatalar} dosya silinemedi`);
  } catch (e) {
    rapor.hatalar.push('önbellek taraması: ' + String(e.message || e));
  }

  // ---- 5) İstek günlüğü ----
  try {
    const boyut = (() => { try { return fs.statSync(LOG_PATH).size; } catch { return 0; } })();
    rapor.log.boyutMb = yuvarla(boyut / MB, 2);
    if (opts.logRotasyon !== false && boyut >= ESIK_BAYT) {
      rapor.log.rotasyon = await logRotasyonuYap('boyut');
    } else {
      rapor.log.durum = logDurumu();
    }
  } catch (e) {
    rapor.hatalar.push('log denetimi: ' + String(e.message || e));
  }

  // Checkpoint sonrası dosya boyutları (WAL küçüldü mü?)
  rapor.db.sonra = dbBoyutlari();
  rapor.sureMs = Date.now() - basladi;
  rapor.ok = rapor.hatalar.length === 0;

  // Son çalışma bilgisini ayarlara yaz (Ayarlar paneli gösterir).
  try {
    saveSettings({
      dbBakim: {
        sonCalisma: rapor.tarih,
        sureMs: rapor.sureMs,
        ok: rapor.ok,
        temizlenenDosya: rapor.temizlenenOnbellekDosyaSayisi,
        kazanilanMb: rapor.kazanilanDiskMb,
        walMb: rapor.db.sonra.walMb,
      },
    });
  } catch { /* ayar yazılamazsa bakım yine geçerli */ }

  return rapor;
}

/** Ayarlar paneli için kısa durum (son çalışma + mevcut boyutlar). */
export function dbBakimDurumu() {
  let ayar = {};
  try { ayar = getSettings().dbBakim || {}; } catch { /* yoksay */ }
  return {
    ...ayar,
    boyutlar: dbBoyutlari(),
    onbellekDizini: path.join(config.dataDir, 'cache'),
    saklama: { ...VARSAYILAN, onbellekGun: ONBELLEK_GUN },
    cacheMaksMb: ONBELLEK_MAKS_MB,
    log: (() => { try { return logDurumu(); } catch { return null; } })(),
  };
}
