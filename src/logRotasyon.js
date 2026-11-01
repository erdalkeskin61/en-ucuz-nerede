/**
 * İstek günlüğü rotasyonu — 2026-10-29
 *
 * SORUN: `data/request_log.jsonl` sınırsız büyüyordu (ölçüm: 13,56 MB). Disk
 * zamanla dolar, dosya açılması/yedeklenmesi yavaşlar.
 *
 * ÇÖZÜM: 10 MB'ı aşınca ya da gün değişince dosya döndürülür; içerik gzip'lenip
 * `data/logs/request_log_YYYY-MM-DD.jsonl.gz` olarak arşivlenir, 15 günden eski
 * arşivler silinir.
 *
 * GÜVENLİK (kesintisiz yazma):
 *  - Döndürme `fs.renameSync` ile ATOMIC yapılır: aynı dosya sisteminde rename
 *    ya olur ya olmaz, yarım dosya kalmaz.
 *  - `appendFileSync` her yazışta dosyayı yeniden açtığı için rename'den sonraki
 *    ilk yazma yeni dosyayı kendiliğinden oluşturur — yazma kesilmez.
 *  - rename ile gzip arasında gelen satırlar YENİ dosyaya gider (kayıp yok).
 *  - Aynı anda iki döndürme olmaması için kilit bayrağı vardır.
 *  - gzip başarısız olursa ham dosya SİLİNMEZ (veri kaybı olmaz).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

export const LOG_PATH = path.join(config.dataDir, 'request_log.jsonl');
export const LOG_DIR = path.join(config.dataDir, 'logs');

/** Rotasyon eşiği: 10 MB. */
export const ESIK_BAYT = 10 * 1024 * 1024;
/** Arşiv saklama süresi: 15 gün. */
export const SAKLAMA_GUN = 15;
/** Boyut kontrolü en fazla bu sıklıkta yapılır (her yazmada stat çağırmamak için). */
const KONTROL_ARALIGI_MS = 30 * 1000;

let sonKontrol = 0;
let sonGun = null;
let donuyor = false;
let sonRotasyon = null; // {ts, dosya, bayt, neden}
let arsivTemizligiYapildi = false;

function gunAnahtari(d = new Date()) {
  const y = d.getFullYear();
  const a = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${a}-${g}`;
}

function logDosyaBoyutu() {
  try {
    return fs.statSync(LOG_PATH).size;
  } catch {
    return 0;
  }
}

/** Arşiv adı: request_log_YYYY-MM-DD.jsonl.gz (aynı gün ikinci kez dönerse _2, _3…). */
function arsivYolu(gun) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  let aday = path.join(LOG_DIR, `request_log_${gun}.jsonl.gz`);
  if (!fs.existsSync(aday)) return aday;
  for (let i = 2; i < 100; i++) {
    aday = path.join(LOG_DIR, `request_log_${gun}_${i}.jsonl.gz`);
    if (!fs.existsSync(aday)) return aday;
  }
  // Aşırı durum: zaman damgasıyla
  return path.join(LOG_DIR, `request_log_${gun}_${Date.now()}.jsonl.gz`);
}

/** Bir dosyayı gzip'leyip hedefe yazar (akışlı — 13 MB'lık dosya olay döngüsünü kilitlemez). */
async function gzipDosya(kaynak, hedef) {
  const okuma = fs.createReadStream(kaynak);
  const yazma = fs.createWriteStream(hedef);
  const gzip = zlib.createGzip({ level: 6 });
  await pipeline(okuma, gzip, yazma);
}

/**
 * Günlüğü döndürür (atomic).
 *
 * @param {'boyut'|'gun'|'elle'} neden
 * @returns {Promise<{dondu:boolean, dosya?:string, bayt?:number, neden?:string, hata?:string}>}
 */
export async function logRotasyonuYap(neden = 'elle') {
  if (donuyor) return { dondu: false, neden: 'zaten calisiyor' };
  donuyor = true;

  let gecici = null;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

    const boyut = logDosyaBoyutu();
    if (boyut === 0) return { dondu: false, neden: 'bos' };

    // Bugünün tarihi arşiv adında kullanılır
    const gun = gunAnahtari();
    const hedef = arsivYolu(gun);

    // ATOMIC devir: rename anında gerçekleşir, yarım dosya olmaz.
    gecici = path.join(path.dirname(LOG_PATH), `.rotating-${process.pid}-${Date.now()}`);
    fs.renameSync(LOG_PATH, gecici);

    // Bu andan sonra gelen loglar YENİ request_log.jsonl dosyasına yazılır
    // (appendFileSync dosyayı her çağrıda yeniden açar).

    await gzipDosya(gecici, hedef);

    const arsivBayt = (() => { try { return fs.statSync(hedef).size; } catch { return null; } })();

    // gzip başarılı → ham geçici dosya silinir
    try { fs.unlinkSync(gecici); } catch { /* silinemezse kalır, veri kaybı yok */ }
    gecici = null;

    sonRotasyon = { ts: Date.now(), dosya: path.basename(hedef), bayt: boyut, neden };
    sonKontrol = Date.now();
    sonGun = gunAnahtari();

    // Eski arşivleri temizle (günde bir kez)
    const temizlik = await eskiArsivleriTemizle();

    return { dondu: true, dosya: path.basename(hedef), bayt: boyut, arsivBayt, neden, temizlik };
  } catch (e) {
    // Ham veriyi KURTAR: gzip başarısızsa geçici dosyayı ana ada geri koymayı dene
    if (gecici && !fs.existsSync(LOG_PATH)) {
      try { fs.renameSync(gecici, LOG_PATH); gecici = null; } catch { /* kurtaramadık */ }
    }
    return { dondu: false, neden: 'hata: ' + String(e.message || e).slice(0, 120) };
  } finally {
    donuyor = false;
  }
}

/**
 * Yazma yolundan çağrılan hafif kontrol.
 * Her yazmada `statSync` çağırmamak için en fazla 30 saniyede bir bakar.
 * Rotasyon gerekiyorsa arka planda başlatır (yazmayı BEKLETMEZ).
 *
 * @returns {boolean} rotasyon başlatıldıysa true
 */
export function rotasyonGerekliMi() {
  const simdi = Date.now();
  if (donuyor) return false;

  const bugun = gunAnahtari();
  const gunDegisti = sonGun != null && sonGun !== bugun;

  // Gün değişimi: beklemeden kontrol et (ucuz)
  if (gunDegisti) {
    sonGun = bugun;
    rotasyonuArkaPlanda('gun');
    return true;
  }
  if (sonGun == null) sonGun = bugun;

  if (simdi - sonKontrol < KONTROL_ARALIGI_MS) return false;
  sonKontrol = simdi;

  if (logDosyaBoyutu() >= ESIK_BAYT) {
    rotasyonuArkaPlanda('boyut');
    return true;
  }
  return false;
}

function rotasyonuArkaPlanda(neden) {
  // Hata olsa bile istek akışı etkilenmesin
  logRotasyonuYap(neden).catch(() => {}).finally(() => {
    // Arşiv temizliğini günde bir kez garanti et
    if (!arsivTemizligiYapildi) eskiArsivleriTemizle().catch(() => {});
  });
}

/** Arşiv dosyası adından tarih çıkarır (yoksa mtime'a düşer). */
function arsivTarihi(dosyaAdi, tam) {
  const m = dosyaAdi.match(/^request_log_(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (Number.isFinite(t)) return t;
  }
  try { return fs.statSync(tam).mtimeMs; } catch { return null; }
}

/**
 * 15 günden eski arşivleri siler.
 * @returns {Promise<{silinen:number, kalan:number}>}
 */
export async function eskiArsivleriTemizle() {
  const sonuc = { silinen: 0, kalan: 0 };
  try {
    if (!fs.existsSync(LOG_DIR)) { arsivTemizligiYapildi = true; return sonuc; }
    const esik = Date.now() - SAKLAMA_GUN * 24 * 60 * 60 * 1000;
    const dosyalar = fs.readdirSync(LOG_DIR).filter(a => /^request_log_.*\.jsonl\.gz$/.test(a));
    for (const ad of dosyalar) {
      const tam = path.join(LOG_DIR, ad);
      const tarih = arsivTarihi(ad, tam);
      if (tarih == null) { sonuc.kalan++; continue; }
      if (tarih < esik) {
        try { fs.unlinkSync(tam); sonuc.silinen++; } catch { sonuc.kalan++; }
      } else {
        sonuc.kalan++;
      }
    }
    arsivTemizligiYapildi = true;
  } catch { /* temizlik başarısızsa rotasyon yine çalışır */ }
  return sonuc;
}

/** Durum bilgisi (/api/durum ve Ayarlar için). */
export function logDurumu() {
  const boyut = logDosyaBoyutu();
  let arsivler = [];
  try {
    arsivler = fs.existsSync(LOG_DIR)
      ? fs.readdirSync(LOG_DIR)
        .filter(a => /^request_log_.*\.jsonl\.gz$/.test(a))
        .map(a => {
          const tam = path.join(LOG_DIR, a);
          let bayt = 0;
          try { bayt = fs.statSync(tam).size; } catch { /* yok */ }
          return { dosya: a, bayt };
        })
        .sort((x, y) => y.dosya.localeCompare(x.dosya))
      : [];
  } catch { /* yok */ }

  // Son rotasyon bilgisi: süreç belleğinde yoksa (yeniden başlatma) en yeni arşivden türet.
  // Böylece /api/durum her zaman gerçeği söyler (uydurma yok, dosyadan okunur).
  let sonRot = sonRotasyon ? {
    ts: new Date(sonRotasyon.ts).toISOString(),
    dosya: sonRotasyon.dosya,
    boyutMB: Math.round((sonRotasyon.bayt / 1024 / 1024) * 100) / 100,
    neden: sonRotasyon.neden,
  } : null;
  if (!sonRot && arsivler.length) {
    const enYeni = arsivler[0];
    let ts = null;
    try { ts = new Date(fs.statSync(path.join(LOG_DIR, enYeni.dosya)).mtimeMs).toISOString(); } catch { /* yok */ }
    sonRot = {
      ts,
      dosya: enYeni.dosya,
      boyutMB: Math.round((enYeni.bayt / 1024 / 1024) * 100) / 100,
      neden: 'arsivden okundu',
    };
  }

  return {
    dosya: path.basename(LOG_PATH),
    boyutBayt: boyut,
    boyutMB: Math.round((boyut / 1024 / 1024) * 100) / 100,
    esikMB: Math.round(ESIK_BAYT / 1024 / 1024),
    arsivDizini: 'data/logs',
    arsivSayisi: arsivler.length,
    arsivler: arsivler.slice(0, 10),
    saklamaGun: SAKLAMA_GUN,
    sonRotasyon: sonRot,
  };
}
