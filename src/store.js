/**
 * Kalıcı ayarlar, takip edilen ürünler, arama geçmişi ve fiyat serileri.
 * 
 * SQLite (node:sqlite DatabaseSync) ile yüksek performanslı, WAL modunda
 * ve eşzamanlı yazmalara dayanıklı kalıcı depolama katmanı.
 * 
 * Otomatik Migrasyon:
 *  - data/ klasöründeki eski settings.json, tracked.json ve history.json dosyalarındaki
 *    verileri SQLite veritabanı boşsa otomatik olarak içe aktarır.
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const DATA_DIR = config.dataDir;
const DB_PATH = path.join(DATA_DIR, 'en_ucuz_nerede.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

/**
 * Veritabanını kapatır (2026-10-28).
 *
 * Neden: Node'un deneysel `node:sqlite` modülü Windows'ta, süreç `process.exit()`
 * ile sonlanırken açık tutamak bırakırsa "Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)" ile çöküyor (çıkış kodu 0xC0000409). Bu, test betiklerinde
 * BAŞARILI sonucu "başarısız" gibi göstermesine yol açıyordu.
 * Betikler çıkmadan önce bu fonksiyonu çağırmalıdır.
 */
export function closeDatabase() {
  try { db.close(); } catch { /* zaten kapalı */ }
}

/**
 * Ham SQLite bağlantısı (2026-11-01).
 *
 * Neden: bakım servisi (`src/dbBakim.js`) WAL checkpoint ve `PRAGMA optimize`
 * gibi işlemleri AYNI bağlantı üzerinden yapmalı. Yeni bir bağlantı açmak
 * checkpoint sırasında gereksiz kilit çekişmesi yaratır.
 */
export function dbBaglantisi() {
  return db;
}

// WAL modu ve synchronous normal ile yüksek yazma/okuma hızı ve veri bütünlüğü
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracked (
    id TEXT PRIMARY KEY,
    modelKodu TEXT,
    urun TEXT NOT NULL,
    renk TEXT,
    image TEXT,
    hedefFiyat REAL,
    olusturma TEXT NOT NULL,
    urunler TEXT NOT NULL,
    sonKontrol TEXT,
    sonFiyatlar TEXT,
    sonBildirim TEXT,
    -- 2026-10-26: fiyat geçmişi ve bildirim zamanları DA kalıcı olmalı.
    -- Bu kolonlar yokken "günde 5 kez fiyat yaz" çalışmıyordu (her kontrol
    -- kaydedilmeden atılıyordu) ve 24 saatlik alarm sessizliği tutmuyordu.
    fiyatGecmisi TEXT,
    sonHedefBildirimi TEXT,
    sonDegisimBildirimi TEXT,
    -- 2026-10-30: stok durumu değişim bildirimi (tümü tükendi ↔ yeniden stokta)
    sonStokBildirimi TEXT
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    url TEXT,
    urun TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    site TEXT NOT NULL,
    price REAL NOT NULL,
    net_price REAL NOT NULL,
    ts TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_pid ON price_history(product_id, ts DESC);

  -- Adaptör sağlık nöbetçisi (2026-10-29): her gece 04:00'te adaptörler test edilir.
  -- Geçmiş tutulur (son N kontrol), sorgular en son kaydı alır.
  CREATE TABLE IF NOT EXISTS adapter_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    site_name TEXT,
    durum TEXT NOT NULL,           -- ok | bos_sonuc | fiyat_yok | bot_korumasi | hata
    arama_ms INTEGER,
    urun_ms INTEGER,
    adet INTEGER,
    ornek_baslik TEXT,
    ornek_fiyat REAL,
    arama_url TEXT,
    hata TEXT,
    kontrol_ts TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_adapter_health_site ON adapter_health(site, kontrol_ts DESC);

  -- Kalıcı iş kuyruğu (2026-10-29): uzun süren karşılaştırmalar sunucu çökse ya da
  -- PM2 yeniden başlatsa bile kaybolmasın. Önceden bellekteki Map'te tutuluyordu ve
  -- yeniden başlatmada tüm işler kayboluyordu.
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    tur TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    progress TEXT,
    result TEXT,
    error TEXT,
    ek TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_tur ON jobs(tur, updated_at DESC);

  -- 🔔 Web Push abonelikleri (2026-11-01): e-posta/Telegram'dan bağımsız,
  -- tarayıcı push bildirimi. Endpoint tekil; aynı cihaz iki kez eklenmez.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    keys_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- 📤 Paylaşılan sepetler (2026-11-01): kısa link ile erişilen salt okunur
  -- sepet özeti. cart_json tam sonuçtur (mağaza grupları, fiyatlar, linkler).
  CREATE TABLE IF NOT EXISTS shared_carts (
    id TEXT PRIMARY KEY,
    cart_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shared_carts_ts ON shared_carts(created_at DESC);
`);

/**
 * Eski veritabanlarına eksik kolonları ekler (CREATE TABLE IF NOT EXISTS mevcut
 * tabloyu değiştirmez). 2026-10-26: fiyat geçmişi kaydedilmiyordu çünkü kolon yoktu.
 */
function eksikKolonlariEkle() {
  const mevcut = new Set(db.prepare('PRAGMA table_info(tracked)').all().map(k => k.name));
  const eklenecek = [
    ['fiyatGecmisi', 'TEXT'],
    ['sonHedefBildirimi', 'TEXT'],
    ['sonDegisimBildirimi', 'TEXT'],
    // 2026-10-30: stok durumu değişim bildirimi (tümü tükendi ↔ yeniden stokta)
    ['sonStokBildirimi', 'TEXT'],
  ];
  let eklenen = 0;
  for (const [ad, tip] of eklenecek) {
    if (mevcut.has(ad)) continue;
    db.exec(`ALTER TABLE tracked ADD COLUMN ${ad} ${tip}`);
    eklenen++;
  }
  if (eklenen) console.log(`[store] tracked tablosuna ${eklenen} kolon eklendi (fiyat geçmişi artık kalıcı).`);
  return eklenen;
}

eksikKolonlariEkle();

// ---- Otomatik JSON Migrasyonu ----
function migrateFromJson() {
  try {
    // 1. Settings migrasyonu
    const settingsCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (settingsCount === 0 && fs.existsSync(settingsFile)) {
      try {
        const json = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(json)) {
          insertSetting.run(k, JSON.stringify(v));
        }
        console.log('[store] Eski settings.json SQLite veritabanına aktarıldı.');
      } catch (err) {
        console.warn('[store] settings.json aktarılamadı:', err.message);
      }
    }

    // 2. Tracked migrasyonu
    const trackedCount = db.prepare('SELECT COUNT(*) as c FROM tracked').get().c;
    const trackedFile = path.join(DATA_DIR, 'tracked.json');
    if (trackedCount === 0 && fs.existsSync(trackedFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(trackedFile, 'utf8'));
        if (Array.isArray(list)) {
          const insertTracked = db.prepare(`
            INSERT INTO tracked (id, modelKodu, urun, renk, image, hedefFiyat, olusturma, urunler, sonKontrol, sonFiyatlar, sonBildirim)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of list) {
            insertTracked.run(
              item.id,
              item.modelKodu || null,
              item.urun || '',
              item.renk || null,
              item.image || null,
              item.hedefFiyat != null ? Number(item.hedefFiyat) : null,
              item.olusturma || new Date().toISOString(),
              JSON.stringify(item.urunler || []),
              item.sonKontrol || null,
              item.sonFiyatlar ? JSON.stringify(item.sonFiyatlar) : null,
              item.sonBildirim || null
            );
          }
          console.log(`[store] ${list.length} adet takip kaydı tracked.json'dan SQLite'a aktarıldı.`);
        }
      } catch (err) {
        console.warn('[store] tracked.json aktarılamadı:', err.message);
      }
    }

    // 3. History migrasyonu
    const historyCount = db.prepare('SELECT COUNT(*) as c FROM history').get().c;
    const historyFile = path.join(DATA_DIR, 'history.json');
    if (historyCount === 0 && fs.existsSync(historyFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        if (Array.isArray(list)) {
          const insertHist = db.prepare('INSERT INTO history (ts, url, urun, data) VALUES (?, ?, ?, ?)');
          for (const item of list.slice(0, 50)) {
            insertHist.run(
              item.ts || new Date().toISOString(),
              item.url || '',
              item.urun || '',
              JSON.stringify(item)
            );
          }
          console.log(`[store] ${list.length} adet arama geçmişi kaydı SQLite'a aktarıldı.`);
        }
      } catch (err) {
        console.warn('[store] history.json aktarılamadı:', err.message);
      }
    }
  } catch (err) {
    console.warn('[store:migration] Migrasyon hatası:', err.message);
  }
}

migrateFromJson();

// ---- Ayarlar API ----

/**
 * Varsayılan fiyat kontrol saatleri — günde 5 kez (2026-10-26 kullanıcı isteği).
 * Uyanık saatlere eşit yayılır; her kontrolde fiyat geçmişine kayıt yazılır.
 */
export const DEFAULT_ALARM_SAATLERI = ['09:00', '12:00', '15:00', '18:00', '21:00'];

/** Günlük kontrol takviminin sürümü — eski kurulumları 2→5 saate taşımak için. */
const TAKVIM_SURUMU = 2;

const DEFAULT_SETTINGS = {
  alarmEmail: '',
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
  telegram: { enabled: false, botToken: '', chatId: '' },
  whatsapp: { enabled: false, webhookUrl: '', phone: '' },
  alarmCheckMinutes: config.alarmCheckMinutes,
  alarmSaatleri: DEFAULT_ALARM_SAATLERI,
  // 📢 Otonom Fırsat Kanalı (2026-10-30): gerçek taramalardan seçilen fırsatları
  // Telegram kanalına paylaşır. Bot token yukarıdaki `telegram.botToken` alanından gelir.
  firsat: {
    enabled: false,
    kanal: '',
    minIndirim: 15,
    gunlukMax: 12,
    saatAraligi: 2,
    cooldownSaat: 48,
    maxTarama: 3,
    donguBasina: 2,
  },
  // Satış ortaklığı (2026-10-28): fiyatı etkilemez, yalnızca dışa giden linke
  // referans ekler. Yapılandırma src/afiliye.js tarafından doğrulanır.
  afiliye: null,
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const current = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      current[row.key] = JSON.parse(row.value);
    } catch {
      current[row.key] = row.value;
    }
  }
  return current;
}

/**
 * Ayar nesnelerini bilinen anahtarlarla sınırlar (2026-10-28).
 *
 * Neden: eski bir ön yüz hatası SMTP şifresini `whatsapp.pass` içine yazıyordu.
 * `{...cur, ...patch}` birleştirmesi bilinmeyen anahtarları sonsuza kadar sakladığı
 * için yanlış yere düşen sır DB'de kalıyordu. Artık tanımsız anahtarlar hiç yazılmaz.
 */
function sinirla(nesne, anahtarlar) {
  const kaynak = nesne && typeof nesne === 'object' ? nesne : {};
  const cikti = {};
  for (const k of anahtarlar) {
    if (kaynak[k] !== undefined) cikti[k] = kaynak[k];
  }
  return cikti;
}

const SMTP_ANAHTARLARI = ['host', 'port', 'secure', 'user', 'pass', 'from'];
const WHATSAPP_ANAHTARLARI = ['enabled', 'webhookUrl', 'phone'];
const TELEGRAM_ANAHTARLARI = ['enabled', 'botToken', 'chatId'];
const FIRSAT_ANAHTARLARI = [
  'enabled', 'kanal', 'minIndirim', 'gunlukMax',
  'saatAraligi', 'cooldownSaat', 'maxTarama', 'donguBasina',
];
const WEBPUSH_ANAHTARLARI = ['publicKey', 'privateKey', 'subject'];
const DBBAKIM_ANAHTARLARI = ['sonCalisma', 'sureMs', 'ok', 'temizlenenDosya', 'kazanilanMb', 'walMb'];

/**
 * 📢 Fırsat ayarlarını doğrular ve sınırlar (2026-11-01).
 *
 * Neden burada: doğrulama yalnızca `firsatAyar()` (okuma) tarafında olsaydı,
 * API'ye `minIndirim: 999` gönderildiğinde veritabanına 999 yazılıyor ve panel
 * bunu "kaydedildi" diye gösteriyordu. Artık TEK kaynak: yazma anında sınırlanır.
 */
function firsatSinirla(nesne) {
  const k = sinirla(nesne, FIRSAT_ANAHTARLARI);
  const v = DEFAULT_SETTINGS.firsat;
  const sayi = (deger, varsayilan, min, max) => {
    const n = Number(deger);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: k.enabled === true,
    kanal: typeof k.kanal === 'string' ? k.kanal.trim().slice(0, 120) : '',
    minIndirim: sayi(k.minIndirim, v.minIndirim, 1, 95),
    gunlukMax: Math.round(sayi(k.gunlukMax, v.gunlukMax, 1, 100)),
    saatAraligi: sayi(k.saatAraligi, v.saatAraligi, 0.5, 24),
    cooldownSaat: sayi(k.cooldownSaat, v.cooldownSaat, 0, 720),
    maxTarama: Math.round(sayi(k.maxTarama, v.maxTarama, 0, 20)),
    donguBasina: Math.round(sayi(k.donguBasina, v.donguBasina, 1, 10)),
  };
}

export function saveSettings(patch) {
  const cur = getSettings();
  const next = {
    alarmEmail: typeof patch.alarmEmail === 'string' ? patch.alarmEmail.trim() : cur.alarmEmail,
    smtp: sinirla({ ...cur.smtp, ...(patch.smtp || {}) }, SMTP_ANAHTARLARI),
    telegram: sinirla({ ...cur.telegram, ...(patch.telegram || {}) }, TELEGRAM_ANAHTARLARI),
    whatsapp: sinirla({ ...cur.whatsapp, ...(patch.whatsapp || {}) }, WHATSAPP_ANAHTARLARI),
    alarmCheckMinutes: Number(patch.alarmCheckMinutes) > 0 ? Number(patch.alarmCheckMinutes) : cur.alarmCheckMinutes,
    alarmSaatleri: Array.isArray(patch.alarmSaatleri) && patch.alarmSaatleri.length
      ? patch.alarmSaatleri.filter(s => /^\d{1,2}:\d{2}$/.test(s)).slice(0, 8)
      : cur.alarmSaatleri || DEFAULT_ALARM_SAATLERI,
    // 📢 Otonom Fırsat Kanalı (2026-10-30): yalnızca bilinen anahtarlar saklanır
    // ve değerler yazma anında sınırlanır (2026-11-01).
    firsat: firsatSinirla({ ...(cur.firsat || {}), ...(patch.firsat || {}) }),
    // 🔔 Web Push VAPID anahtarları (2026-11-01): ilk üretimde kalıcılaşır.
    // Özel anahtar YALNIZCA sunucuda kalır; /api/push/vapid-key yalnızca public döner.
    webpush: sinirla({ ...(cur.webpush || {}), ...(patch.webpush || {}) }, WEBPUSH_ANAHTARLARI),
    // 🧹 Bakım servisinin son çalışma özeti (2026-11-01) — Ayarlar panelinde gösterilir.
    dbBakim: sinirla({ ...(cur.dbBakim || {}), ...(patch.dbBakim || {}) }, DBBAKIM_ANAHTARLARI),
    // Satış ortaklığı yapılandırması: yalnızca açıkça gönderildiyse yazılır
    // (kısmi kaydetmelerde mevcut ayar kaybolmasın).
    afiliye: patch.afiliye !== undefined ? patch.afiliye : cur.afiliye,
  };

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  for (const [k, v] of Object.entries(next)) {
    upsert.run(k, JSON.stringify(v));
  }
  return next;
}

/**
 * Günlük kontrol takvimini günceller (2026-10-26): günde 2 kontrol → 5 kontrol.
 *
 * Yalnızca ESKİ VARSAYILANDA kalan kurulumlar taşınır: kullanıcı saatleri kendisi
 * değiştirdiyse dokunulmaz. Sürüm anahtarı (gorevTakvimSurumu) sayesinde bu geçiş
 * bir kez çalışır — sonradan 09:00/21:00 seçilirse tekrar zorla değiştirilmez.
 */
export function takvimiGuncelle() {
  try {
    const surum = db.prepare('SELECT value FROM settings WHERE key = ?').get('gorevTakvimSurumu');
    const mevcutSurum = surum ? Number(JSON.parse(surum.value)) || 0 : 0;
    if (mevcutSurum >= TAKVIM_SURUMU) return { degisti: false, neden: 'zaten güncel' };

    const kayit = db.prepare('SELECT value FROM settings WHERE key = ?').get('alarmSaatleri');
    const mevcut = kayit ? JSON.parse(kayit.value) : null;
    const eskiVarsayilan = Array.isArray(mevcut)
      && mevcut.length === 2
      && mevcut.join(',') === '09:00,21:00';

    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    // Ayarlar hiç yoksa ya da eski varsayılandaysa 5 saate geç
    if (!mevcut || eskiVarsayilan) {
      upsert.run('alarmSaatleri', JSON.stringify(DEFAULT_ALARM_SAATLERI));
      upsert.run('gorevTakvimSurumu', JSON.stringify(TAKVIM_SURUMU));
      console.log('[store] Günlük fiyat kontrolü 5 saate çıkarıldı:', DEFAULT_ALARM_SAATLERI.join(', '));
      return { degisti: true, onceki: mevcut, yeni: DEFAULT_ALARM_SAATLERI };
    }

    // Kullanıcının kendi seçimi korunur; yalnızca sürüm işaretlenir
    upsert.run('gorevTakvimSurumu', JSON.stringify(TAKVIM_SURUMU));
    return { degisti: false, neden: 'kullanıcı saatleri korunuyor', mevcut };
  } catch (e) {
    console.warn('[store] takvim güncelleme hatası:', e.message);
    return { degisti: false, neden: 'hata: ' + e.message };
  }
}

// ---- Takip Edilen Ürünler API ----

function parseTrackedRow(row) {
  if (!row) return null;
  let urunler = [];
  try { urunler = JSON.parse(row.urunler || '[]'); } catch {}

  let sonFiyatlar = null;
  if (row.sonFiyatlar) {
    try { sonFiyatlar = JSON.parse(row.sonFiyatlar); } catch {}
  }

  // Fiyat geçmişi: her kontrolde bir kayıt eklenir (günde 5 kez).
  let fiyatGecmisi = [];
  if (row.fiyatGecmisi) {
    try {
      const g = JSON.parse(row.fiyatGecmisi);
      if (Array.isArray(g)) fiyatGecmisi = g;
    } catch { /* bozuk kayıt → boş geçmiş */ }
  }

  return {
    id: row.id,
    modelKodu: row.modelKodu,
    urun: row.urun,
    renk: row.renk,
    image: row.image,
    hedefFiyat: row.hedefFiyat,
    olusturma: row.olusturma,
    urunler,
    sonKontrol: row.sonKontrol,
    sonFiyatlar,
    sonBildirim: row.sonBildirim,
    fiyatGecmisi,
    sonHedefBildirimi: row.sonHedefBildirimi || null,
    sonDegisimBildirimi: row.sonDegisimBildirimi || null,
    sonStokBildirimi: row.sonStokBildirimi || null,
  };
}

export function getTracked() {
  const rows = db.prepare('SELECT * FROM tracked ORDER BY datetime(olusturma) DESC').all();
  return rows.map(parseTrackedRow);
}

export function addTracked(entry) {
  const id = 'takip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const urunlerJson = JSON.stringify((entry.urunler || []).map(x => ({ site: x.site, url: x.url })));

  const insert = db.prepare(`
    INSERT INTO tracked (id, modelKodu, urun, renk, image, hedefFiyat, olusturma, urunler, sonKontrol, sonFiyatlar, sonBildirim)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `);

  insert.run(
    id,
    entry.modelKodu || null,
    entry.urun || '',
    entry.renk || null,
    entry.image || null,
    Number(entry.hedefFiyat) || null,
    now,
    urunlerJson
  );

  return {
    id,
    modelKodu: entry.modelKodu || null,
    urun: entry.urun || '',
    renk: entry.renk || null,
    image: entry.image || null,
    hedefFiyat: Number(entry.hedefFiyat) || null,
    olusturma: now,
    urunler: (entry.urunler || []).map(x => ({ site: x.site, url: x.url })),
    sonKontrol: null,
    sonFiyatlar: null,
    sonBildirim: null,
    fiyatGecmisi: [],
    sonHedefBildirimi: null,
    sonDegisimBildirimi: null,
  };
}

export function removeTracked(id) {
  const del = db.prepare('DELETE FROM tracked WHERE id = ?');
  del.run(id);
  return true;
}

export function updateTracked(id, patch) {
  const current = db.prepare('SELECT * FROM tracked WHERE id = ?').get(id);
  if (!current) return null;

  const parsed = parseTrackedRow(current);
  const updated = { ...parsed, ...patch };

  const stmt = db.prepare(`
    UPDATE tracked SET
      modelKodu = ?,
      urun = ?,
      renk = ?,
      image = ?,
      hedefFiyat = ?,
      urunler = ?,
      sonKontrol = ?,
      sonFiyatlar = ?,
      sonBildirim = ?,
      fiyatGecmisi = ?,
      sonHedefBildirimi = ?,
      sonDegisimBildirimi = ?,
      sonStokBildirimi = ?
    WHERE id = ?
  `);

  stmt.run(
    updated.modelKodu || null,
    updated.urun || '',
    updated.renk || null,
    updated.image || null,
    updated.hedefFiyat != null ? Number(updated.hedefFiyat) : null,
    JSON.stringify(updated.urunler || []),
    updated.sonKontrol || null,
    updated.sonFiyatlar ? JSON.stringify(updated.sonFiyatlar) : null,
    updated.sonBildirim || null,
    JSON.stringify(Array.isArray(updated.fiyatGecmisi) ? updated.fiyatGecmisi : []),
    updated.sonHedefBildirimi || null,
    updated.sonDegisimBildirimi || null,
    updated.sonStokBildirimi || null,
    id
  );

  return updated;
}

// ---- Arama Geçmişi API ----

export function addHistory(entry) {
  const ts = new Date().toISOString();
  const insert = db.prepare('INSERT INTO history (ts, url, urun, data) VALUES (?, ?, ?, ?)');
  insert.run(ts, entry.url || '', entry.urun || '', JSON.stringify({ ts, ...entry }));

  // Geçmişi en son 50 kayıtla sınırla
  db.exec(`
    DELETE FROM history WHERE id NOT IN (
      SELECT id FROM history ORDER BY id DESC LIMIT 50
    )
  `);
}

export function getHistory() {
  const rows = db.prepare('SELECT data FROM history ORDER BY id DESC LIMIT 20').all();
  return rows.map(r => {
    try {
      return JSON.parse(r.data);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ---- 🔔 Web Push abonelikleri (2026-11-01) ----

/**
 * Push aboneliğini kaydeder. Aynı endpoint ikinci kez gelirse anahtarları günceller
 * (tarayıcı aboneliği yenilenmiş olabilir) ve tek satır kalır.
 *
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} abonelik
 */
export function pushAbonelikKaydet(abonelik) {
  const endpoint = String(abonelik?.endpoint || '').trim();
  const p256dh = String(abonelik?.keys?.p256dh || '').trim();
  const auth = String(abonelik?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return false;
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, keys_json, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json
  `).run(endpoint, JSON.stringify({ p256dh, auth }), Date.now());
  return true;
}

/** Kayıtlı tüm push abonelikleri. */
export function pushAbonelikler() {
  return db.prepare('SELECT id, endpoint, keys_json, created_at FROM push_subscriptions ORDER BY id')
    .all()
    .map(r => {
      try {
        const k = JSON.parse(r.keys_json);
        return { id: r.id, endpoint: r.endpoint, keys: { p256dh: k.p256dh, auth: k.auth }, created_at: Number(r.created_at) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Aboneliği siler (410 Gone / kullanıcı iptali). */
export function pushAbonelikSil(endpoint) {
  const r = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
  return Number(r.changes || 0) > 0;
}

export function pushIstatistik() {
  const adet = Number(db.prepare('SELECT COUNT(*) adet FROM push_subscriptions').get()?.adet || 0);
  return { abone: adet };
}

// ---- 📤 Paylaşılan sepetler (2026-11-01) ----

/**
 * Sepet sonucunu kısa kimlikle saklar (30 gün saklanır, temizlik çağrısıyla).
 *
 * @param {object} cart sepet sonucu (senaryolar, toplamlar, gruplar)
 * @param {{id?:string}} [opts]
 * @returns {string|null} paylaşım kimliği
 */
export function sepetPaylasKaydet(cart, opts = {}) {
  if (!cart || typeof cart !== 'object') return null;
  const id = String(opts.id || '').trim() || crypto.randomBytes(6).toString('base64url');
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  db.prepare(`
    INSERT INTO shared_carts (id, cart_json, created_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET cart_json = excluded.cart_json
  `).run(id, JSON.stringify(cart), Date.now());
  return id;
}

/** Paylaşılan sepeti döndürür (yoksa null). */
export function sepetPaylasAl(id) {
  const temiz = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(temiz)) return null;
  const row = db.prepare('SELECT cart_json, created_at FROM shared_carts WHERE id = ?').get(temiz);
  if (!row) return null;
  try {
    return { id: temiz, created_at: Number(row.created_at), sepet: JSON.parse(row.cart_json) };
  } catch {
    return null;
  }
}

/** 30 günden eski paylaşımları siler. `gun=0` → tüm paylaşımları siler (test/temizlik). */
export function sepetPaylasTemizle(gun = 30) {
  const n = Number(gun);
  const esik = n > 0 ? Date.now() - n * 24 * 3600 * 1000 : Number.MAX_SAFE_INTEGER;
  const r = db.prepare('DELETE FROM shared_carts WHERE created_at < ?').run(esik);
  return Number(r.changes || 0);
}

// ---- Zaman Serisi Fiyat Geçmişi API ----
export function addPricePoint({ productId, site, price, netPrice, ts = new Date().toISOString() }) {
  if (!productId || !site || price == null) return;
  const insert = db.prepare(`
    INSERT INTO price_history (product_id, site, price, net_price, ts)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run(productId, site, Number(price), Number(netPrice != null ? netPrice : price), ts);
}

/**
 * Bir ürünün fiyat geçmişi kayıtlarını siler.
 * Kullanım: yanlış kimlikle yazılmış kayıtların temizliği ve testlerin kendi
 * ürettiği geçici veriyi geri alması (2026-10-30). Gerçek ürünlerde DİKKATLİ kullan.
 * @returns {number} silinen satır sayısı
 */
export function deletePricePoints(productId) {
  const pid = String(productId || '').trim();
  if (!pid) return 0;
  try {
    const r = db.prepare('DELETE FROM price_history WHERE product_id = ? OR product_id LIKE ?').run(pid, '%' + pid + '%');
    return Number(r.changes || 0);
  } catch {
    return 0;
  }
}

export function getPriceHistory(productId, limit = 100) {  const rows = db.prepare(`
    SELECT site, price, net_price, ts
    FROM price_history
    WHERE product_id = ?
    ORDER BY datetime(ts) DESC
    LIMIT ?
  `).all(productId, limit);

  return rows;
}


/**
 * Fiyat zekası için özet istatistik — SAHTE İNDİRİM & DİP FİYAT RADARI (2026-10-30).
 *
 * Yalnızca `price_history` tablosundaki GERÇEK gözlemler kullanılır; eksik günler
 * için tahmin/uydurma üretilmez. Ürün kimliği şu sırayla aranır:
 *   modelKodu → barkod → url'den çözülen kimlik.
 * `url` doğrudan fiyat geçmişinde yoktur; bu yüzden url verilip kimlik verilmediyse
 * `history` tablosundaki son taramanın `data` JSON'undan kimlik çözülür. Çözülemezse
 * dürüstçe `bulundu:false` döner.
 *
 * Pencereler:
 *  - min/max: son 90 gün
 *  - ortalama: son 30 gün, GÜN AĞIRLIKLI (her gün eşit ağırlık) — bir günün çok
 *    sayıda gözlemi ortalamayı tek başına saptırmasın diye.
 *
 * @param {string} [modelKodu]
 * @param {string} [barkod]
 * @param {string} [url]
 * @returns {{
 *   bulundu:boolean, productId:string|null, kimlikKaynagi:string|null,
 *   minFiyat:number|null, maxFiyat:number|null, ortFiyat:number|null,
 *   veriNoktasi:number, gunSayisi:number, yeterliVeri:boolean,
 *   enSonFiyat:number|null, enSonTs:string|null, neden:string|null
 * }}
 */
export function getFiyatAnalizi(modelKodu, barkod, url) {
  const bos = (neden, pid = null, kaynak = null) => ({
    bulundu: false,
    productId: pid,
    kimlikKaynagi: kaynak,
    minFiyat: null,
    maxFiyat: null,
    ortFiyat: null,
    veriNoktasi: 0,
    gunSayisi: 0,
    yeterliVeri: false,
    enSonFiyat: null,
    enSonTs: null,
    ortPencereGun: 30,
    neden,
  });

  // ---- 1) Ürün kimliğini çöz ----
  let pid = modelKodu ? String(modelKodu).trim() : '';
  let kaynak = pid ? 'modelKodu' : null;
  if (!pid && barkod) { pid = String(barkod).trim(); kaynak = 'barkod'; }

  if (!pid && url) {
    // URL → son taramanın kaynak kimliği (yalnızca gerçek kayıttan okunur).
    try {
      const row = db.prepare(`
        SELECT data FROM history WHERE url = ? ORDER BY datetime(ts) DESC LIMIT 1
      `).get(String(url));
      if (row?.data) {
        const d = JSON.parse(row.data);
        const k = d?.kaynak || {};
        const aday = k.modelKodu || k.barcode || k.urun;
        if (aday) { pid = String(aday).trim(); kaynak = 'url→geçmiş'; }
      }
    } catch { /* geçmiş yoksa çözülemez */ }
  }

  if (!pid) return bos('Fiyat geçmişi için ürün kimliği (model kodu, barkod veya daha önce taranmış URL) gerekiyor.');

  // ---- 2) Kayıtları oku (90 gün) ----
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT site, price, net_price, ts
      FROM price_history
      WHERE product_id = ? OR product_id LIKE ?
      ORDER BY datetime(ts) ASC
    `).all(pid, '%' + pid + '%');
  } catch { /* tablo yoksa boş */ }

  if (!rows.length) {
    return bos('Bu ürün için henüz fiyat geçmişi yok. Her karşılaştırma bir kayıt ekler; birkaç gün sonra radar çalışır.', pid, kaynak);
  }

  const GUN_MS = 24 * 60 * 60 * 1000;
  const simdi = Date.now();
  const sinir90 = simdi - 90 * GUN_MS;
  const sinir30 = simdi - 30 * GUN_MS;

  const doksan = [];               // {p, t}
  const otuzGunluk = new Map();    // 'YYYY-MM-DD' -> {toplam, adet}

  for (const r of rows) {
    // Gözlem zamanı: net_price = gerçekte ödenen (kargo dahil) tutar.
    const p = Number(r.net_price != null ? r.net_price : r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    const t = Date.parse(r.ts);
    if (!Number.isFinite(t)) continue;
    if (t < sinir90) continue;      // 90 günden eski
    const gun = String(r.ts).slice(0, 10);
    doksan.push({ p, t, gun });

    if (t >= sinir30) {
      const g = otuzGunluk.get(gun) || { toplam: 0, adet: 0 };
      g.toplam += p; g.adet += 1;
      otuzGunluk.set(gun, g);
    }
  }

  if (!doksan.length) {
    return bos('Bu ürünün kayıtları 90 günden eski. Yeni karşılaştırma yapıldıkça radar yeniden dolar.', pid, kaynak);
  }

  const fiyatlar = doksan.map(x => x.p);
  const minFiyat = Math.min(...fiyatlar);
  const maxFiyat = Math.max(...fiyatlar);

  // Gün ağırlıklı ortalama (son 30 gün). 30 günlük kayıt yoksa son 90 günün
  // gün ağırlıklı ortalamasına düşülür — pencere adı yanıtta belirtilir.
  const gunOrtalamalari = [...otuzGunluk.values()].map(g => g.toplam / g.adet);
  let ortFiyat = null;
  let ortPencereGun = 30;
  if (gunOrtalamalari.length) {
    ortFiyat = gunOrtalamalari.reduce((a, b) => a + b, 0) / gunOrtalamalari.length;
  } else {
    // Son 30 günde gözlem yoksa: 90 günün gün ağırlıklı ortalaması (pencere adı yanıtta).
    const gunler = new Map();
    for (const x of doksan) {
      const g = gunler.get(x.gun) || { toplam: 0, adet: 0 };
      g.toplam += x.p; g.adet += 1;
      gunler.set(x.gun, g);
    }
    const ort = [...gunler.values()].map(g => g.toplam / g.adet);
    if (ort.length) {
      ortFiyat = ort.reduce((a, b) => a + b, 0) / ort.length;
      ortPencereGun = 90;
    }
  }

  const gunSayisi = new Set(doksan.map(x => x.gun)).size;
  const son = doksan[doksan.length - 1];

  const yeterliVeri = gunSayisi >= 3 && ortFiyat != null;
  return {
    bulundu: true,
    productId: pid,
    kimlikKaynagi: kaynak,
    minFiyat: Math.round(minFiyat * 100) / 100,
    maxFiyat: Math.round(maxFiyat * 100) / 100,
    ortFiyat: ortFiyat != null ? Math.round(ortFiyat * 100) / 100 : null,
    veriNoktasi: doksan.length,
    gunSayisi,
    yeterliVeri,
    enSonFiyat: Math.round(son.p * 100) / 100,
    enSonTs: rows[rows.length - 1]?.ts || null,
    ortPencereGun,
    neden: yeterliVeri
      ? null
      : `Fiyat geçmişi ${gunSayisi} gün (${doksan.length} gözlem). Güvenilir yorum için en az 3 gün gerekiyor.`,
  };
}

/**
 * 30 günlük fiyat analitiği — YALNIZCA GERÇEK KAYITLAR (2026-10-28).
 *
 * Önceki sürüm, geçmişte kayıt olmayan günler için `Math.sin` dalgasıyla UYDURMA
 * fiyat üretiyordu; arayüz bunu "30 günlük piyasa analizi" diye gösteriyordu. Proje
 * kuralı "sahte/uydurma veri yok" olduğu için bu tamamen kaldırıldı:
 *
 *  - Grafik ve istatistikler yalnızca DB'deki gerçek gözlemlerden gelir.
 *  - Geçmiş yoksa `yeterliVeri:false` + açıklama döner (arayüz uydurma çizmez).
 *  - Az gün varsa "son N günün en düşüğü" denir — "30 günün" denmez.
 *
 * @returns {{
 *   productId:string|null, yeterliVeri:boolean, gunSayisi:number, toplamKayit:number,
 *   neden:string|null, summary:object|null, timeline:Array<{date:string,label:string,lowest:number,average:number,highest:number}>
 * }}
 */
export function getPriceAnalytics(productId, { currentPrice, currentAvg, currentMax, currentItems = [] } = {}) {
  let rows = [];
  if (productId) {
    try {
      rows = db.prepare(`
        SELECT site, price, net_price, ts
        FROM price_history
        WHERE product_id = ? OR product_id LIKE ?
        ORDER BY datetime(ts) ASC
      `).all(productId, '%' + productId + '%');
    } catch { /* tablo yoksa boş geçmiş */ }
  }

  const bos = (neden) => ({
    productId: productId || null,
    yeterliVeri: false,
    gunSayisi: 0,
    toplamKayit: 0,
    neden,
    summary: null,
    timeline: [],
  });

  if (!productId) {
    return bos('Fiyat geçmişi için ürün kimliği (model kodu / barkod) gerekiyor.');
  }
  if (!rows.length) {
    return bos('Bu ürün için henüz fiyat geçmişi yok. Her karşılaştırma ve her takip kontrolü bir kayıt ekler; birkaç gün sonra trend oluşur.');
  }

  const GUN_MS = 24 * 60 * 60 * 1000;
  const pencereBasi = Date.now() - 30 * GUN_MS;

  // Gün bazında gerçek gözlemler (30 günlük pencere)
  const gunluk = new Map(); // 'YYYY-MM-DD' -> [fiyat, ...]
  for (const r of rows) {
    const dStr = r.ts ? String(r.ts).slice(0, 10) : '';
    if (!dStr) continue;
    const t = Date.parse(dStr + 'T00:00:00Z');
    if (Number.isFinite(t) && t < pencereBasi) continue;
    const p = Number(r.net_price != null ? r.net_price : r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    if (!gunluk.has(dStr)) gunluk.set(dStr, []);
    gunluk.get(dStr).push(p);
  }

  if (!gunluk.size) {
    return bos('Bu ürünün kayıtları 30 günden eski. Yeni karşılaştırma yapıldıkça grafik yeniden oluşur.');
  }

  const aylar = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const gunler = [...gunluk.keys()].sort();
  const timeline = gunler.map((dStr) => {
    const liste = gunluk.get(dStr);
    const d = new Date(dStr + 'T00:00:00Z');
    return {
      date: dStr,
      label: d.getUTCDate() + ' ' + aylar[d.getUTCMonth()],
      lowest: Math.min(...liste),
      average: Math.round(liste.reduce((a, b) => a + b, 0) / liste.length),
      highest: Math.max(...liste),
    };
  });

  const tumFiyatlar = [...gunluk.values()].flat();
  const gunSayisi = timeline.length;
  const toplamKayit = tumFiyatlar.length;

  const lowestPrice = Math.min(...tumFiyatlar);
  const highestPrice = Math.max(...tumFiyatlar);
  const avgPrice = Math.round(timeline.reduce((acc, t) => acc + t.average, 0) / gunSayisi);

  // "Şu anki" fiyat: çağıran verirse o, yoksa en son gözlenen günün en düşüğü
  const sonGun = timeline[timeline.length - 1];
  const curMin = currentPrice != null && currentPrice > 0 ? currentPrice : sonGun.lowest;

  const diffFromAvg = avgPrice > 0 ? Math.round(((avgPrice - curMin) / avgPrice) * 100) : 0;

  // Trend yorumu için en az 3 farklı gün şart: 1–2 günlük veriden "30 günün dibi"
  // gibi bir iddia üretmek yanıltıcı olur.
  const YETERLI_GUN = 3;
  let recommendation;
  let recommendationText;
  let badgeClass;

  if (gunSayisi < YETERLI_GUN) {
    recommendation = 'GECMIS_KISA';
    recommendationText = `📉 Yalnızca ${gunSayisi} günlük fiyat geçmişi var. Güvenilir bir trend yorumu için birkaç gün daha gerekiyor.`;
    badgeClass = 'badge-turuncu';
  } else if (curMin <= lowestPrice * 1.01) {
    recommendation = 'EN_DUSUK';
    recommendationText = `🔥 Son ${gunSayisi} günün en düşük seviyesinde!`;
    badgeClass = 'badge-yesil';
  } else if (diffFromAvg >= 5) {
    recommendation = 'UYGUN';
    recommendationText = `✅ Son ${gunSayisi} günün ortalamasından %${diffFromAvg} daha ucuz.`;
    badgeClass = 'badge-yesil';
  } else if (diffFromAvg <= -5) {
    recommendation = 'YUKSEK';
    recommendationText = `⚠️ Fiyat son ${gunSayisi} günün ortalamasının %${Math.abs(diffFromAvg)} üzerinde.`;
    badgeClass = 'badge-kirmizi';
  } else {
    recommendation = 'ORTALAMA';
    recommendationText = `⚖️ Son ${gunSayisi} günün ortalama fiyat seviyesinde.`;
    badgeClass = 'badge-turuncu';
  }

  return {
    productId,
    yeterliVeri: gunSayisi >= YETERLI_GUN,
    gunSayisi,
    toplamKayit,
    neden: gunSayisi < YETERLI_GUN
      ? `Fiyat geçmişi ${gunSayisi} gün (${toplamKayit} gözlem). Yeterli veri için en az ${YETERLI_GUN} gün gerekiyor.`
      : null,
    summary: {
      currentMin: curMin,
      lowestPrice,
      highestPrice,
      avgPrice,
      diffFromAvg,
      gunSayisi,
      toplamKayit,
      recommendation,
      recommendationText,
      badgeClass,
    },
    timeline,
  };
}

// ---- Adaptör sağlık nöbetçisi (2026-10-29) ----

/** Bir adaptör sağlık kaydını yazar. */
export function addAdapterHealth(kayit) {
  if (!kayit || !kayit.site || !kayit.durum) return null;
  try {
    const r = db.prepare(`
      INSERT INTO adapter_health
        (site, site_name, durum, arama_ms, urun_ms, adet, ornek_baslik, ornek_fiyat, arama_url, hata, kontrol_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(kayit.site),
      kayit.siteName ? String(kayit.siteName).slice(0, 120) : null,
      String(kayit.durum),
      Number.isFinite(kayit.aramaMs) ? Math.round(kayit.aramaMs) : null,
      Number.isFinite(kayit.urunMs) ? Math.round(kayit.urunMs) : null,
      Number.isFinite(kayit.adet) ? Math.round(kayit.adet) : null,
      kayit.ornekBaslik ? String(kayit.ornekBaslik).slice(0, 220) : null,
      Number.isFinite(kayit.ornekFiyat) ? kayit.ornekFiyat : null,
      kayit.aramaUrl ? String(kayit.aramaUrl).slice(0, 400) : null,
      kayit.hata ? String(kayit.hata).slice(0, 500) : null,
      kayit.kontrolTs || new Date().toISOString(),
    );
    return Number(r.lastInsertRowid);
  } catch {
    return null;
  }
}

/** Her adaptörün EN SON sağlık kaydı. */
export function getAdapterHealthLatest() {
  try {
    const rows = db.prepare(`
      SELECT h.* FROM adapter_health h
      JOIN (
        SELECT site, MAX(datetime(kontrol_ts)) AS son FROM adapter_health GROUP BY site
      ) s ON s.site = h.site AND datetime(h.kontrol_ts) = s.son
    `).all();
    // Aynı saniyede iki kayıt olursa en yüksek id kazanır
    const harita = new Map();
    for (const r of rows) {
      const m = harita.get(r.site);
      if (!m || Number(r.id) > Number(m.id)) harita.set(r.site, r);
    }
    return [...harita.values()].map(r => ({
      site: r.site,
      siteName: r.site_name,
      durum: r.durum,
      aramaMs: r.arama_ms,
      urunMs: r.urun_ms,
      adet: r.adet,
      ornekBaslik: r.ornek_baslik,
      ornekFiyat: r.ornek_fiyat,
      aramaUrl: r.arama_url,
      hata: r.hata,
      kontrolTs: r.kontrol_ts,
    }));
  } catch {
    return [];
  }
}

/** Bir adaptörün sağlık geçmişi (son N kayıt). */
export function getAdapterHealthHistory(site, limit = 20) {
  try {
    return db.prepare(`
      SELECT durum, arama_ms, urun_ms, adet, ornek_fiyat, hata, kontrol_ts
      FROM adapter_health WHERE site = ? ORDER BY datetime(kontrol_ts) DESC LIMIT ?
    `).all(String(site), Math.max(1, Math.min(Number(limit) || 20, 200)));
  } catch {
    return [];
  }
}

/** Eski sağlık kayıtlarını siler (varsayılan 30 gün). */
export function pruneAdapterHealth(gun = 30) {
  try {
    const esik = new Date(Date.now() - gun * 24 * 60 * 60 * 1000).toISOString();
    const r = db.prepare('DELETE FROM adapter_health WHERE datetime(kontrol_ts) < datetime(?)').run(esik);
    return Number(r.changes || 0);
  } catch {
    return 0;
  }
}

// ================= Kalıcı iş kuyruğu (2026-10-29) =================
//
// ÖNCE: server.js içinde `const jobs = new Map()` — süreç ölürse tüm işler kaybolurdu.
// ŞİMDİ: her iş SQLite'a yazılır; sunucu yeniden başladığında hangi işin ne durumda
// olduğu bilinir. Yeniden başlatmada yarıda kalan işler 'interrupted' olarak
// işaretlenir (dürüst: "tamamlandı" denmez, "tekrar deneyin" denir).

/** Kolonlara ayrı yazılan alanlar — `ek` JSON'una KONMAZ. */
const JOB_HARIC = new Set([
  'id', 'tur', 'status', 'startedAt', 'progress', 'result', 'error', 'updatedAt',
  // Serileştirilemeyen / süreç içi alanlar:
  'iptalKontrolu',
]);

/** Bir nesnenin JSON'a yazılabilir olup olmadığını kaba biçimde anlar. */
function jsonlanabilirMi(v) {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (t !== 'object') return false; // function, symbol, bigint
  // AbortController / AbortSignal / Timer gibi süreç içi nesneler
  if (typeof v.abort === 'function') return false;
  if (v instanceof AbortSignal) return false;
  return true;
}

/** job nesnesinden `ek` (JSON) alanlarını toplar. */
export function jobEk(job) {
  const ek = {};
  for (const [k, v] of Object.entries(job || {})) {
    if (JOB_HARIC.has(k)) continue;
    if (v === undefined) continue;
    if (!jsonlanabilirMi(v)) continue;
    ek[k] = v;
  }
  return ek;
}

function jsonYaz(v) {
  if (v === undefined || v === null) return null;
  try {
    const s = JSON.stringify(v);
    return s === undefined ? null : s;
  } catch {
    return null;
  }
}

function jsonOku(t, varsayilan = null) {
  if (t == null) return varsayilan;
  try { return JSON.parse(t); } catch { return varsayilan; }
}

/** Kısa hata metni (DB şişmesin). */
function hataKirp(e) {
  if (e == null) return null;
  return String(e).slice(0, 2000);
}

/**
 * Yeni iş oluşturur ya da varolanı tamamen günceller (upsert).
 * @param {object} job {id, tur, status, startedAt, progress, result, error, updatedAt, ...ek}
 * @returns {boolean}
 */
export function saveJob(job) {
  if (!job || !job.id || !job.tur) return false;
  try {
    const ts = Date.now();
    db.prepare(`
      INSERT INTO jobs (id, tur, status, started_at, progress, result, error, ek, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tur = excluded.tur,
        status = excluded.status,
        progress = excluded.progress,
        result = excluded.result,
        error = excluded.error,
        ek = excluded.ek,
        updated_at = excluded.updated_at
    `).run(
      String(job.id),
      String(job.tur),
      String(job.status || 'running'),
      Number.isFinite(Number(job.startedAt)) ? Number(job.startedAt) : ts,
      jsonYaz(job.progress),
      jsonYaz(job.result),
      hataKirp(job.error),
      jsonYaz(jobEk(job)),
      Number.isFinite(Number(job.updatedAt)) ? Number(job.updatedAt) : ts,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * İşi veritabanından okur (JSON alanları parse edilmiş olarak).
 * @returns {object|null} {id, tur, status, startedAt, progress, result, error, updatedAt, ...ek}
 */
export function getJob(id) {
  if (!id) return null;
  try {
    const r = db.prepare('SELECT * FROM jobs WHERE id = ?').get(String(id));
    if (!r) return null;
    const ek = jsonOku(r.ek, {}) || {};
    return {
      ...ek,
      id: r.id,
      tur: r.tur,
      status: r.status,
      startedAt: Number(r.started_at),
      progress: jsonOku(r.progress, null),
      result: jsonOku(r.result, null),
      error: r.error || null,
      updatedAt: Number(r.updated_at),
    };
  } catch {
    return null;
  }
}

/** Yalnızca ilerleme alanını günceller (sık çağrılır → küçük UPDATE). */
export function updateJobProgress(id, progress) {
  if (!id) return false;
  try {
    const r = db.prepare('UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?')
      .run(jsonYaz(progress), Date.now(), String(id));
    return Number(r.changes || 0) > 0;
  } catch {
    return false;
  }
}

/** İşi tamamlar: durum + sonuç/hata yazar. */
export function finishJob(id, { status = 'done', result = null, error = null } = {}) {
  if (!id) return false;
  try {
    const durum = ['done', 'error', 'interrupted', 'iptal'].includes(String(status))
      ? String(status) : 'done';
    const r = db.prepare('UPDATE jobs SET status = ?, result = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(durum, jsonYaz(result), hataKirp(error), Date.now(), String(id));
    return Number(r.changes || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * 7 günden eski TAMAMLANMIŞ işleri siler.
 * Çalışan işlere dokunmaz. `updated_at` kullanılır (uzun süren iş yanlışlıkla silinmesin).
 * @returns {number} silinen kayıt sayısı
 */
export function cleanupOldJobs(gun = 7) {
  try {
    const esik = Date.now() - Number(gun) * 24 * 60 * 60 * 1000;
    const r = db.prepare("DELETE FROM jobs WHERE status != 'running' AND updated_at < ?").run(esik);
    return Number(r.changes || 0);
  } catch {
    return 0;
  }
}

/**
 * Yeniden başlatmada yarıda kalan işleri işaretler.
 * Dürüstlük: bu işler "tamamlandı" sayılmaz; kullanıcıya "tekrar deneyin" denir.
 * @returns {number} işaretlenen iş sayısı
 */
export function markInterruptedJobs() {
  try {
    const r = db.prepare(`
      UPDATE jobs
      SET status = 'interrupted',
          error = COALESCE(error, 'Sunucu yeniden başlatıldı; iş yarıda kaldı. Lütfen tekrar deneyin.'),
          updated_at = ?
      WHERE status = 'running'
    `).run(Date.now());
    return Number(r.changes || 0);
  } catch {
    return 0;
  }
}

/** Son işler (teşhis / /api/jobs için). */
export function listJobs({ limit = 20, tur = null } = {}) {
  try {
    const n = Math.max(1, Math.min(Number(limit) || 20, 200));
    const rows = tur
      ? db.prepare('SELECT id, tur, status, started_at, updated_at FROM jobs WHERE tur = ? ORDER BY updated_at DESC LIMIT ?').all(String(tur), n)
      : db.prepare('SELECT id, tur, status, started_at, updated_at FROM jobs ORDER BY updated_at DESC LIMIT ?').all(n);
    return rows.map(r => ({
      id: r.id,
      tur: r.tur,
      status: r.status,
      startedAt: Number(r.started_at),
      updatedAt: Number(r.updated_at),
    }));
  } catch {
    return [];
  }
}

/** İş tablosu özeti (/api/durum). */
export function jobIstatistik() {
  try {
    const toplam = db.prepare('SELECT COUNT(*) c FROM jobs').get();
    const durumlar = db.prepare('SELECT status, COUNT(*) c FROM jobs GROUP BY status').all();
    return {
      toplam: Number(toplam?.c || 0),
      durumlar: Object.fromEntries(durumlar.map(r => [r.status, Number(r.c)])),
    };
  } catch {
    return { toplam: 0, durumlar: {} };
  }
}

