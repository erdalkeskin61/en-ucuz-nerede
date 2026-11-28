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
// 2026-11-11: busy_timeout eklendi — eşzamanlı yazımda (radar turu + panel)
// SQLITE_BUSY yerine 5 sn beklenir (katalog bütünlük sözleşmesi).
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
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
    sonStokBildirimi TEXT,
    -- 2026-11-02: Telegram kişisel alarm sahibi (NULL = eski/genel kayıt).
    -- Hatırlatma yalnızca bu sohbete gider; başka kullanıcı /liste'de görmez.
    chatId TEXT,
    -- 2026-11-06: Sıfır sürtünmeli Web Push alarmı. Abonelik yalnızca bu
    -- takip kaydına aittir (e-posta/şifre yok). pushEndpoint indexlidir ve
    -- abonelik 404/410 döndüğünde sessizce temizlenir.
    pushSubscription TEXT,
    pushEndpoint TEXT
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
    kontrol_ts TEXT NOT NULL,
    -- 2026-11-10: hangi arama sorgusuyla yoklandığı (ör. 'pla filament' / 'kablo').
    -- Önceden yalnızca bellekte dönüyordu; gece raporunda "kablo arandı" teşhisi
    -- yapılamıyordu. Sağlık nöbetçisi bu alanı artık kalıcı yazar.
    sorgu TEXT
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

  -- ⭐ Sponsorlu vitrin / Hero banner (2026-11-08): sabit ücretli reklam alanı.
  -- Süre bitince sorgu kaydı DÖNDÜRMEZ (banner kendiliğinden kaybolur).
  -- gösterim/tıklama sayaçları reklamverene şeffaf rapor için tutulur.
  CREATE TABLE IF NOT EXISTS sponsorlu_vitrin (
    id TEXT PRIMARY KEY,
    marka TEXT NOT NULL,
    baslik TEXT NOT NULL,
    aciklama TEXT,
    gorselUrl TEXT NOT NULL,
    eskiFiyat REAL,
    kampanyaFiyat REAL NOT NULL,
    yonlendirmeUrl TEXT NOT NULL,
    rozetMetni TEXT DEFAULT 'HAFTANIN SPONSORLU FIRSATI',
    baslangicTarihi TEXT NOT NULL,
    bitisTarihi TEXT NOT NULL,
    aktif INTEGER DEFAULT 1,
    gosterimSayisi INTEGER DEFAULT 0,
    tiklamaSayisi INTEGER DEFAULT 0,
    olusturma INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sponsor_vitrin_tarih
    ON sponsorlu_vitrin(aktif, bitisTarihi);

  -- ✅ Doğrulanmış mağaza (Verified Partner) rozetleri (2026-11-08).
  -- Abonelik bitince rozet gösterilmez; fiyat/sıralama DEĞİŞMEZ.
  CREATE TABLE IF NOT EXISTS dogrulanmis_magazalar (
    siteId TEXT PRIMARY KEY,
    rozetMetni TEXT NOT NULL,
    onayTuru TEXT DEFAULT 'resmi_partner',
    bitisTarihi TEXT NOT NULL,
    aktif INTEGER DEFAULT 1,
    olusturma INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_dogrulanmis_magaza_aktif
    ON dogrulanmis_magazalar(aktif, bitisTarihi);

  -- ------------------------------------------------------------------
  -- 🗂️ Mağaza ürün kataloğu indeksi (2026-11-17)
  --
  -- Neden: kullanıcı "eSun PLA+" yazdığında 68 mağazayı tek tek taramak
  -- yerine, mağazaların KENDİ yayınladığı beslemeden (Shopify products.json,
  -- WooCommerce Store API, ürün sitemap'i) toplanan kalıcı bir indeksten
  -- milisaniyeler içinde aday bulunur. Dış mağazaya HTTP/Chromium isteği
  -- yalnızca gerektiğinde (taze fiyat doğrulaması) atılır.
  --
  -- Dürüstlük: fiyat yalnızca beslemede GERÇEKTEN yazan değerdir; yoksa
  -- NULL kalır (uydurma/tahmin YOK). guncellemeTs her kaydın gerçek çekim
  -- zamanıdır (ms). kaynakTur: shopify | woo | sitemap | xml.
  -- ------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS katalog_urunleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siteId TEXT NOT NULL,
    urunUrl TEXT NOT NULL,
    baslik TEXT NOT NULL,
    temizBaslik TEXT NOT NULL,
    marka TEXT,
    fiyat REAL,
    stokta INTEGER,              -- 1 stokta, 0 tükendi, NULL bilinmiyor
    gorselUrl TEXT,
    paraBirimi TEXT,
    kaynakTur TEXT NOT NULL,     -- shopify | woo | sitemap | xml
    guncellemeTs INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_katalog_urun_url
    ON katalog_urunleri(siteId, urunUrl);
  CREATE INDEX IF NOT EXISTS idx_katalog_urun_temiz
    ON katalog_urunleri(temizBaslik);
  CREATE INDEX IF NOT EXISTS idx_katalog_urun_ts
    ON katalog_urunleri(guncellemeTs DESC);
  CREATE INDEX IF NOT EXISTS idx_katalog_urun_site
    ON katalog_urunleri(siteId, guncellemeTs DESC);

  -- ------------------------------------------------------------------
  -- 🔁 Fiyat hasadı defteri (2026-11-28)
  --
  -- Sitemap mağazalarının (robotistan, robitshop, 3dcim …) beslemesinde
  -- fiyat YOKTUR; yalnızca ürün URL'si gelir. Bu ürünler başka bir mağazada
  -- fiyatlıysa, ürün sayfasından GERÇEK fiyatı bir kez okuyup indeksi
  -- zenginleştiriyoruz (tek teklif → çok teklif → dizinlenebilir sayfa).
  --
  -- Bu tablo, aynı URL'yi her turda yeniden denememek için tutulur:
  -- 404/410 dönen ya da fiyatı okunamayan sayfalar uzun süre atlanır.
  -- ------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS katalog_hasat (
    siteId TEXT NOT NULL,
    urunUrl TEXT NOT NULL,
    sonDenemeTs INTEGER NOT NULL,
    durum TEXT NOT NULL,          -- fiyat | fiyatsiz | yok | hata
    fiyat REAL,
    not_ TEXT,
    PRIMARY KEY (siteId, urunUrl)
  );
  CREATE INDEX IF NOT EXISTS idx_katalog_hasat_durum
    ON katalog_hasat(durum, sonDenemeTs DESC);
`);

/* ------------------------------------------------------------------ */
/* ⭐ Sponsorlu vitrin & doğrulanmış mağaza tohum verisi (2026-11-08)   */
/* ------------------------------------------------------------------ */

/**
 * Açılışta bir kez çalışan tohumlama.
 *
 * Neden kod içinde: reklamveren kaydı olmadan banner alanı boş kalıyordu ve
 * "mavi tik" özelliği test edilemiyordu. Tohum verisi YALNIZCA ilk kurulumda
 * eklenir; yönetici panelden silerse bir daha geri gelmez (`sponsor_seed_v1`).
 *
 * DÜRÜSTLÜK: tohum vitrin kaydı örnek bir kampanyadır (demo) ve yönlendirmesi
 * gerçek mağaza sayfasına gider; uydurma fiyat iddiası yoktur.
 */
function sponsorTohumla() {
  try {
    // 2026-11-22: Örnek sponsor vitrin şimdilik rafa kaldırıldı (mevcut DB'de pasif yap).
    const rafa = db.prepare('SELECT value FROM settings WHERE key = ?').get('sponsor_demo_rafa_v1');
    if (!rafa) {
      db.prepare("UPDATE sponsorlu_vitrin SET aktif = 0 WHERE id = 'vitrin_demo_porima'").run();
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('sponsor_demo_rafa_v1', JSON.stringify(new Date().toISOString()));
    }

    const surum = db.prepare('SELECT value FROM settings WHERE key = ?').get('sponsor_seed_v1');
    if (surum) return;

    // Doğrulanmış mağazalar: 12 ay geçerli (yıllık abonelik varsayımı).
    const bitis = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const magazaEkle = db.prepare(`
      INSERT INTO dogrulanmis_magazalar (siteId, rozetMetni, onayTuru, bitisTarihi, aktif, olusturma)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(siteId) DO NOTHING
    `);
    magazaEkle.run('porima3d', 'Resmi Üretici · Aynı Gün Kargo', 'uretici', bitis, Date.now());
    magazaEkle.run('robotistan', 'Resmi Distribütör · Aynı Gün Kargo', 'resmi_partner', bitis, Date.now());

    // Örnek sponsorlu vitrin: şimdilik pasif (aktif=0); istendiğinde panelden yayına alınabilir.
    const varMi = db.prepare('SELECT COUNT(*) c FROM sponsorlu_vitrin').get()?.c || 0;
    if (!varMi) {
      const bugun = new Date();
      const bas = bugun.toISOString();
      const bit = new Date(bugun.getTime() + 7 * 24 * 3600 * 1000).toISOString();
      db.prepare(`
        INSERT INTO sponsorlu_vitrin (
          id, marka, baslik, aciklama, gorselUrl, eskiFiyat, kampanyaFiyat,
          yonlendirmeUrl, rozetMetni, baslangicTarihi, bitisTarihi,
          aktif, gosterimSayisi, tiklamaSayisi, olusturma
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      `).run(
        'vitrin_demo_porima',
        'Porima3D',
        'Porima PLA Filament — Bu Haftaya Özel Lansman Fiyatı',
        'Türkiye üretimi, darbe dayanımı yüksek PLA. Üreticinin kendi mağazasında haftaya özel fiyat.',
        // Yerel illüstrasyon: dış CDN'e bağımlılık yok, banner her zaman dolu görünür.
        // Gerçek reklamveren kendi ürün fotoğrafını yönetici panelinden ekler.
        '/sponsor-ornek.svg',
        612,
        489,
        'https://porima3d.com/products/porima-pla-filament?variant=49130120184155',
        'HAFTANIN SPONSORLU FIRSATI',
        bas,
        bit,
        Date.now(),
      );
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('sponsor_seed_v1', JSON.stringify(new Date().toISOString()));
  } catch (e) {
    console.warn('[store] sponsor tohumlama atlandı:', String(e?.message || e).slice(0, 120));
  }
}


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
    // 2026-11-02: Telegram kişisel alarm sahibi (NULL = eski/genel kayıt)
    ['chatId', 'TEXT'],
    // 2026-11-06: kişiye/cihaza özel Web Push aboneliği
    ['pushSubscription', 'TEXT'],
    ['pushEndpoint', 'TEXT'],
  ];
  let eklenen = 0;
  for (const [ad, tip] of eklenecek) {
    if (mevcut.has(ad)) continue;
    db.exec(`ALTER TABLE tracked ADD COLUMN ${ad} ${tip}`);
    eklenen++;
  }
  // Endpoint tekil cihazı temsil eder; temizlik sorgusu hızlı olsun.
  // Kolonlar yukarıdaki döngüde eklendiği için index güvenle kurulabilir.
  db.exec('CREATE INDEX IF NOT EXISTS idx_tracked_push_endpoint ON tracked(pushEndpoint)');
  if (eklenen) console.log(`[store] tracked tablosuna ${eklenen} kolon eklendi (fiyat geçmişi artık kalıcı).`);

  // 2026-11-10: adapter_health.sorgu — mevcut kurulumlarda tablo zaten var,
  // CREATE TABLE yeni kolonu eklemez → ALTER gerekir.
  try {
    const ahKolonlar = new Set(db.prepare('PRAGMA table_info(adapter_health)').all().map(k => k.name));
    if (ahKolonlar.size && !ahKolonlar.has('sorgu')) {
      db.exec('ALTER TABLE adapter_health ADD COLUMN sorgu TEXT');
      console.log('[store] adapter_health tablosuna "sorgu" kolonu eklendi (hangi sorguyla yoklandığı kalıcı).');
    }
  } catch { /* tablo henüz yoksa yoksay */ }

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
// ⭐ Sponsor tohumlaması göçten SONRA: settings.json göçü engellenmesin.
sponsorTohumla();

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
  whatsapp: {
    // Kişisel alarmlar (mevcut)
    enabled: false, webhookUrl: '', phone: '',
    // 📢 Otonom fırsat kanalı (2026-11-05)
    firsatKanalEnabled: false,
    provider: 'webhook',        // webhook | green-api | ultramsg | meta
    channelId: '',              // 120363…@newsletter | …@g.us | telefon
    apiUrl: '',                 // gateway / instance URL
    token: '',                  // API anahtarı (gizli)
    phoneNumberId: '',          // yalnızca meta
    apiVersion: 'v21.0',        // yalnızca meta
    resimliGonder: true,        // fiyat grafiği varsa caption olarak gönder
    davetUrl: '',               // herkese açık WhatsApp Kanal davet linki (isteğe bağlı)
  },
  alarmCheckMinutes: config.alarmCheckMinutes,
  alarmSaatleri: DEFAULT_ALARM_SAATLERI,
  // 📢 Otonom Fırsat Kanalı (2026-10-30): gerçek taramalardan seçilen fırsatları
  // Telegram kanalına paylaşır. Bot token yukarıdaki `telegram.botToken` alanından gelir.
  firsat: {
    enabled: false,
    kanal: '',
    davetUrl: '',
    minIndirim: 15,
    gunlukMax: 12,
    saatAraligi: 2,
    cooldownSaat: 48,
    maxTarama: 3,
    donguBasina: 2,
  },
  // 🎯 Otonom 3D Baskı & Filament Fiyat Avcısı (2026-11-02)
  // Katalog SQLite'ta (radar_katalog); burada yalnızca çalışma ayarları.
  radar: {
    enabled: false,
    saatAraligi: 4,
    urunArasiMs: 2000,
    paylasimAraligiSaat: 48,
    donguBasina: 5,
    chatId: '',
    sonCalisma: null,
    sonRapor: null,
  },
  // Satış ortaklığı (2026-10-28): fiyatı etkilemez, yalnızca dışa giden linke
  // referans ekler. Yapılandırma src/afiliye.js tarafından doğrulanır.
  afiliye: null,
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const current = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    let deger;
    try {
      deger = JSON.parse(row.value);
    } catch {
      deger = row.value;
    }
    // DERİN BİRLEŞTİRME (2026-11-05): DB'de kayıtlı bir nesne (ör. whatsapp),
    // varsayılan nesneyi TAMAMEN eziyordu. Yeni ayar alanları eklendiğinde
    // (WhatsApp fırsat kanalı) eski kurulumlarda hiç görünmüyordu. Artık nesne
    // değerleri varsayılanla birleştirilir; kayıtlı değer her zaman önceliklidir.
    const varsayilan = DEFAULT_SETTINGS[row.key];
    if (deger && typeof deger === 'object' && !Array.isArray(deger)
      && varsayilan && typeof varsayilan === 'object' && !Array.isArray(varsayilan)) {
      current[row.key] = { ...varsayilan, ...deger };
    } else {
      current[row.key] = deger;
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
const WHATSAPP_ANAHTARLARI = [
  'enabled', 'webhookUrl', 'phone',
  // 📢 Otonom fırsat kanalı (2026-11-05)
  'firsatKanalEnabled', 'provider', 'channelId', 'apiUrl', 'token',
  'phoneNumberId', 'apiVersion', 'resimliGonder', 'davetUrl',
];
const TELEGRAM_ANAHTARLARI = ['enabled', 'botToken', 'chatId'];
const FIRSAT_ANAHTARLARI = [
  'enabled', 'kanal', 'davetUrl', 'minIndirim', 'gunlukMax',
  'saatAraligi', 'cooldownSaat', 'maxTarama', 'donguBasina',
];
const RADAR_ANAHTARLARI = [
  'enabled', 'saatAraligi', 'urunArasiMs', 'paylasimAraligiSaat',
  'donguBasina', 'chatId', 'sonCalisma', 'sonRapor',
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
function guvenliKanalUrl(ham, regex) {
  const s = String(ham || '').trim();
  if (!s || !regex.test(s)) return '';
  return s.slice(0, 220);
}

/**
 * Herkese açık (/api/durum ve ürün sayfaları) fırsat kanalı davet linklerini döndürür.
 * Token, özel webhook URL'i veya sayısal -100... grup kimlikleri ASLA sızdırılmaz.
 */
export function kanallarPublicOzet() {
  const s = getSettings();
  const f = s.firsat || {};
  const wa = s.whatsapp || {};
  let telegramUrl = guvenliKanalUrl(f.davetUrl, /^https:\/\/t\.me\//i);
  if (!telegramUrl && /^@[a-zA-Z][a-zA-Z0-9_]{3,60}$/.test(String(f.kanal || '').trim())) {
    telegramUrl = 'https://t.me/' + String(f.kanal).trim().slice(1);
  }
  if (!telegramUrl) {
    telegramUrl = 'https://t.me/erdal_fiyat_takip_bot';
  }
  const whatsappUrl = guvenliKanalUrl(
    wa.davetUrl,
    /^https:\/\/(?:whatsapp\.com|chat\.whatsapp\.com|wa\.me)\//i,
  );
  return { telegramUrl, whatsappUrl };
}

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
    davetUrl: guvenliKanalUrl(k.davetUrl, /^https:\/\/t\.me\//i),
    minIndirim: sayi(k.minIndirim, v.minIndirim, 1, 95),
    gunlukMax: Math.round(sayi(k.gunlukMax, v.gunlukMax, 1, 100)),
    saatAraligi: sayi(k.saatAraligi, v.saatAraligi, 0.5, 24),
    cooldownSaat: sayi(k.cooldownSaat, v.cooldownSaat, 0, 720),
    maxTarama: Math.round(sayi(k.maxTarama, v.maxTarama, 0, 20)),
    donguBasina: Math.round(sayi(k.donguBasina, v.donguBasina, 1, 10)),
  };
}

/**
 * 🎯 Otonom radar ayarlarını doğrular ve sınırlar (2026-11-02).
 * Katalog burada değil, `radar_katalog` tablosunda tutulur.
 */
function radarSinirla(nesne) {
  const k = sinirla(nesne, RADAR_ANAHTARLARI);
  const v = DEFAULT_SETTINGS.radar;
  const sayi = (deger, varsayilan, min, max) => {
    const n = Number(deger);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  const rapor = (() => {
    if (k.sonRapor === null) return null;
    if (!k.sonRapor || typeof k.sonRapor !== 'object') return undefined;
    const r = k.sonRapor;
    return {
      sureMs: Math.max(0, Number(r.sureMs) || 0),
      taranan: Math.max(0, Number(r.taranan) || 0),
      stoktaBulunan: Math.max(0, Number(r.stoktaBulunan) || 0),
      gonderilen: Math.max(0, Number(r.gonderilen) || 0),
      atlanan: Math.max(0, Number(r.atlanan) || 0),
      hataSayisi: Math.max(0, Number(r.hataSayisi) || 0),
    };
  })();
  const cikti = {
    enabled: k.enabled === true,
    saatAraligi: sayi(k.saatAraligi, v.saatAraligi, 1, 24),
    urunArasiMs: Math.round(sayi(k.urunArasiMs, v.urunArasiMs, 0, 30000)),
    paylasimAraligiSaat: sayi(k.paylasimAraligiSaat, v.paylasimAraligiSaat, 1, 720),
    donguBasina: Math.round(sayi(k.donguBasina, v.donguBasina, 1, 20)),
    chatId: typeof k.chatId === 'string'
      ? (k.chatId.trim() && !/^[-0-9]/.test(k.chatId.trim()) && !k.chatId.trim().startsWith('@')
          ? '@' + k.chatId.trim()
          : k.chatId.trim()).slice(0, 120)
      : '',
    sonCalisma: typeof k.sonCalisma === 'string' && !Number.isNaN(Date.parse(k.sonCalisma))
      ? k.sonCalisma : null,
  };
  if (rapor !== undefined) cikti.sonRapor = rapor;
  return cikti;
}

export function saveSettings(patch) {
  const cur = getSettings();
  const waHam = sinirla({ ...cur.whatsapp, ...(patch.whatsapp || {}) }, WHATSAPP_ANAHTARLARI);
  if ('davetUrl' in waHam) {
    waHam.davetUrl = guvenliKanalUrl(waHam.davetUrl, /^https:\/\/(?:whatsapp\.com|chat\.whatsapp\.com|wa\.me)\//i);
  }
  const next = {
    alarmEmail: typeof patch.alarmEmail === 'string' ? patch.alarmEmail.trim() : cur.alarmEmail,
    smtp: sinirla({ ...cur.smtp, ...(patch.smtp || {}) }, SMTP_ANAHTARLARI),
    telegram: sinirla({ ...cur.telegram, ...(patch.telegram || {}) }, TELEGRAM_ANAHTARLARI),
    whatsapp: waHam,
    alarmCheckMinutes: Number(patch.alarmCheckMinutes) > 0 ? Number(patch.alarmCheckMinutes) : cur.alarmCheckMinutes,
    alarmSaatleri: Array.isArray(patch.alarmSaatleri) && patch.alarmSaatleri.length
      ? patch.alarmSaatleri.filter(s => /^\d{1,2}:\d{2}$/.test(s)).slice(0, 8)
      : cur.alarmSaatleri || DEFAULT_ALARM_SAATLERI,
    // 📢 Otonom Fırsat Kanalı (2026-10-30): yalnızca bilinen anahtarlar saklanır
    // ve değerler yazma anında sınırlanır (2026-11-01).
    firsat: firsatSinirla({ ...(cur.firsat || {}), ...(patch.firsat || {}) }),
    // 🎯 Otonom radar ayarları (2026-11-02).
    radar: radarSinirla({ ...(cur.radar || {}), ...(patch.radar || {}) }),
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

  // 🔔 Kişiye/cihaza özel Web Push aboneliği (2026-11-06).
  let pushSubscription = null;
  if (row.pushSubscription) {
    try {
      const p = JSON.parse(row.pushSubscription);
      if (p?.endpoint && p?.keys?.p256dh && p?.keys?.auth) pushSubscription = p;
    } catch { /* bozuk kayıt → alarm yok sayılır */ }
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
    chatId: row.chatId || null,
    pushSubscription,
    pushEndpoint: row.pushEndpoint || pushSubscription?.endpoint || null,
  };
}

/**
 * Web Push aboneliğini güvenli biçimde normalleştirir. Geçersizse null döner;
 * böylece bozuk bir istemci gövdesi veritabanına yazılmaz.
 */
export function pushAbonelikNormalize(abonelik) {
  if (!abonelik || typeof abonelik !== 'object') return null;
  const endpoint = String(abonelik.endpoint || '').trim();
  const p256dh = String(abonelik.keys?.p256dh || '').trim();
  const auth = String(abonelik.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function getTracked() {
  const rows = db.prepare('SELECT * FROM tracked ORDER BY datetime(olusturma) DESC').all();
  return rows.map(parseTrackedRow);
}

export function addTracked(entry) {
  const id = 'takip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const urunlerJson = JSON.stringify((entry.urunler || []).map(x => ({ site: x.site, url: x.url })));
  const push = pushAbonelikNormalize(entry.pushSubscription);

  const insert = db.prepare(`
    INSERT INTO tracked (id, modelKodu, urun, renk, image, hedefFiyat, olusturma, urunler, sonKontrol, sonFiyatlar, sonBildirim, chatId, pushSubscription, pushEndpoint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
  `);

  insert.run(
    id,
    entry.modelKodu || null,
    entry.urun || '',
    entry.renk || null,
    entry.image || null,
    Number(entry.hedefFiyat) || null,
    now,
    urunlerJson,
    entry.chatId != null ? String(entry.chatId).slice(0, 64) : null,
    push ? JSON.stringify(push) : null,
    push?.endpoint || null
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
    chatId: entry.chatId != null ? String(entry.chatId).slice(0, 64) : null,
    pushSubscription: push,
    pushEndpoint: push?.endpoint || null,
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
      sonStokBildirimi = ?,
      chatId = ?,
      pushSubscription = ?,
      pushEndpoint = ?
    WHERE id = ?
  `);

  const push = pushAbonelikNormalize(updated.pushSubscription);

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
    updated.chatId != null ? String(updated.chatId).slice(0, 64) : null,
    push ? JSON.stringify(push) : null,
    push?.endpoint || null,
    id
  );

  return { ...updated, pushSubscription: push, pushEndpoint: push?.endpoint || null };
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

export function getHistory(limit = 20) {
  const sinir = Math.max(1, Math.min(50, Number(limit) || 20));
  const rows = db.prepare('SELECT data FROM history ORDER BY id DESC LIMIT ?').all(sinir);
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

/**
 * Geçersiz aboneliği HER İKİ yerden sessizce temizler (2026-11-06):
 *  - genel `push_subscriptions` kaydı,
 *  - bu endpoint'e bağlı takip alarmları (`tracked.pushSubscription`).
 * 404/410 dönen bir cihaz bir daha denenmez.
 */
export function pushAbonelikTemizle(endpoint) {
  const ep = String(endpoint || '').trim();
  if (!ep) return 0;
  let toplam = 0;
  const t = db.prepare('UPDATE tracked SET pushSubscription = NULL, pushEndpoint = NULL WHERE pushEndpoint = ?').run(ep);
  toplam += Number(t.changes || 0);
  const k = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(ep);
  toplam += Number(k.changes || 0);
  return toplam;
}

export function pushIstatistik() {
  const adet = Number(db.prepare('SELECT COUNT(*) adet FROM push_subscriptions').get()?.adet || 0);
  return { abone: adet };
}

// ---- ⭐ Sponsorlu vitrin & doğrulanmış mağazalar (2026-11-08) ----

/** Bir kaydı API yanıtına çevirir (iç alanlar sadeleştirilir). */
function sponsorVitrinParse(row) {
  if (!row) return null;
  const kampanya = Number(row.kampanyaFiyat);
  const eski = row.eskiFiyat == null ? null : Number(row.eskiFiyat);
  const indirimTL = eski != null && eski > kampanya
    ? Math.round((eski - kampanya) * 100) / 100
    : null;
  const indirimYuzde = eski != null && eski > 0 && eski > kampanya
    ? Math.round(((eski - kampanya) / eski) * 1000) / 10
    : null;
  return {
    id: row.id,
    marka: row.marka,
    baslik: row.baslik,
    aciklama: row.aciklama || null,
    gorselUrl: row.gorselUrl,
    eskiFiyat: eski,
    kampanyaFiyat: Number.isFinite(kampanya) ? kampanya : null,
    indirimTL,
    indirimYuzde,
    yonlendirmeUrl: row.yonlendirmeUrl,
    rozetMetni: row.rozetMetni || 'HAFTANIN SPONSORLU FIRSATI',
    baslangicTarihi: row.baslangicTarihi,
    bitisTarihi: row.bitisTarihi,
    gosterimSayisi: Number(row.gosterimSayisi) || 0,
    tiklamaSayisi: Number(row.tiklamaSayisi) || 0,
  };
}

/**
 * Yayında olan (aktif + süresi dolmamış) sponsorlu vitrin kaydı.
 *
 * Sıralama: bitiş tarihi en yakın olan önce (acil kampanya öne çıkar).
 * Süre karşılaştırması ISO metin üzerinden yapılır — `date('now')` yerine
 * JavaScript zamanı kullanılır ki saat dilimi sürprizi olmasın.
 *
 * @param {{id?:string}} [opts]
 * @returns {object|null}
 */
export function sponsorVitrinGetir(opts = {}) {
  const simdi = new Date().toISOString();
  try {
    const satir = opts.id
      ? db.prepare(`
          SELECT * FROM sponsorlu_vitrin
          WHERE id = ? AND aktif = 1 AND baslangicTarihi <= ? AND bitisTarihi >= ?
          LIMIT 1
        `).get(String(opts.id), simdi, simdi)
      : db.prepare(`
          SELECT * FROM sponsorlu_vitrin
          WHERE aktif = 1 AND baslangicTarihi <= ? AND bitisTarihi >= ?
          ORDER BY bitisTarihi ASC
          LIMIT 1
        `).get(simdi, simdi);
    return sponsorVitrinParse(satir);
  } catch {
    return null;
  }
}

/** Gösterim sayacını artırır (yayında olmayan kayıt sayılmaz). */
export function sponsorGosterimArtir(id) {
  try {
    const r = db.prepare(`
      UPDATE sponsorlu_vitrin SET gosterimSayisi = gosterimSayisi + 1
      WHERE id = ? AND aktif = 1
    `).run(String(id || ''));
    return Number(r.changes || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Tıklama sayacını artırır ve yönlendirme bilgisini döndürür.
 * Kayıt yoksa/aktif değilse `null` döner — rota 404 verir (açık yönlendirme yok).
 * @returns {{id:string, yonlendirmeUrl:string, marka:string}|null}
 */
export function sponsorTiklamaArtir(id) {
  const kimlik = String(id || '').trim();
  if (!kimlik) return null;
  try {
    const row = db.prepare('SELECT * FROM sponsorlu_vitrin WHERE id = ? AND aktif = 1').get(kimlik);
    if (!row) return null;
    db.prepare('UPDATE sponsorlu_vitrin SET tiklamaSayisi = tiklamaSayisi + 1 WHERE id = ?').run(kimlik);
    return { id: row.id, yonlendirmeUrl: row.yonlendirmeUrl, marka: row.marka };
  } catch {
    return null;
  }
}

/**
 * Sayaçları verilen değerlere sabitler (2026-11-09).
 *
 * Kullanım: testlerin gerçek reklam sayaçlarını kirletmemesi ve yöneticinin
 * hatalı sayımı düzeltmesi. Üretim trafiğinde çağrılmaz.
 */
export function sponsorSayacAyarla(id, { gosterimSayisi = 0, tiklamaSayisi = 0 } = {}) {
  const kimlik = String(id || '').trim();
  if (!kimlik) return false;
  const g = Math.max(0, Math.round(Number(gosterimSayisi) || 0));
  const t = Math.max(0, Math.round(Number(tiklamaSayisi) || 0));
  const r = db.prepare('UPDATE sponsorlu_vitrin SET gosterimSayisi = ?, tiklamaSayisi = ? WHERE id = ?')
    .run(g, t, kimlik);
  return Number(r.changes || 0) > 0;
}

/** Sponsorlu vitrin kaydı ekler/günceller (yönetici). */
export function sponsorVitrinKaydet(kayit = {}) {
  const id = String(kayit.id || '').trim()
    || ('vitrin_' + crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9_-]/g, ''));
  const marka = String(kayit.marka || '').trim();
  const baslik = String(kayit.baslik || '').trim();
  const gorselUrl = String(kayit.gorselUrl || '').trim();
  const yonlendirmeUrl = String(kayit.yonlendirmeUrl || '').trim();
  const kampanyaFiyat = Number(kayit.kampanyaFiyat);
  const baslangicTarihi = String(kayit.baslangicTarihi || '').trim();
  const bitisTarihi = String(kayit.bitisTarihi || '').trim();

  if (!marka || !baslik) throw new Error('marka ve baslik gerekli');
  if (!/^https?:\/\//i.test(gorselUrl)) throw new Error('gorselUrl https/http olmalı');
  // Güvenlik: yönlendirme yalnızca http(s) — javascript:/data: kabul edilmez.
  if (!/^https?:\/\//i.test(yonlendirmeUrl)) throw new Error('yonlendirmeUrl https/http olmalı');
  if (!Number.isFinite(kampanyaFiyat) || kampanyaFiyat <= 0) throw new Error('kampanyaFiyat > 0 olmalı');
  if (!Number.isFinite(Date.parse(baslangicTarihi))) throw new Error('baslangicTarihi geçersiz');
  if (!Number.isFinite(Date.parse(bitisTarihi))) throw new Error('bitisTarihi geçersiz');
  if (Date.parse(bitisTarihi) <= Date.parse(baslangicTarihi)) throw new Error('bitisTarihi baslangicTarihi’nden sonra olmalı');

  const eski = Number(kayit.eskiFiyat);
  db.prepare(`
    INSERT INTO sponsorlu_vitrin (
      id, marka, baslik, aciklama, gorselUrl, eskiFiyat, kampanyaFiyat,
      yonlendirmeUrl, rozetMetni, baslangicTarihi, bitisTarihi,
      aktif, gosterimSayisi, tiklamaSayisi, olusturma
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      marka = excluded.marka, baslik = excluded.baslik, aciklama = excluded.aciklama,
      gorselUrl = excluded.gorselUrl, eskiFiyat = excluded.eskiFiyat,
      kampanyaFiyat = excluded.kampanyaFiyat, yonlendirmeUrl = excluded.yonlendirmeUrl,
      rozetMetni = excluded.rozetMetni, baslangicTarihi = excluded.baslangicTarihi,
      bitisTarihi = excluded.bitisTarihi, aktif = excluded.aktif
  `).run(
    id, marka, baslik, kayit.aciklama ? String(kayit.aciklama).slice(0, 400) : null,
    gorselUrl,
    Number.isFinite(eski) && eski > 0 ? eski : null,
    kampanyaFiyat, yonlendirmeUrl,
    kayit.rozetMetni ? String(kayit.rozetMetni).slice(0, 80) : 'HAFTANIN SPONSORLU FIRSATI',
    baslangicTarihi, bitisTarihi,
    kayit.aktif === false ? 0 : 1,
    Math.max(0, Math.round(Number(kayit.gosterimSayisi) || 0)),
    Math.max(0, Math.round(Number(kayit.tiklamaSayisi) || 0)),
    Date.now(),
  );
  return sponsorVitrinGetir({ id });
}

/** Sponsorlu vitrin kaydını siler (yönetici/test temizliği). */
export function sponsorVitrinSil(id) {
  const kimlik = String(id || '').trim();
  if (!kimlik) return false;
  const r = db.prepare('DELETE FROM sponsorlu_vitrin WHERE id = ?').run(kimlik);
  return Number(r.changes || 0) > 0;
}

/**
 * Doğrulanmış mağaza listesi (aktif + aboneliği sürmekte olanlar).
 * @returns {Array<{siteId:string, rozetMetni:string, onayTuru:string, bitisTarihi:string}>}
 */
export function dogrulanmisMagazalariGetir() {
  const simdi = new Date().toISOString();
  try {
    return db.prepare(`
      SELECT siteId, rozetMetni, onayTuru, bitisTarihi
      FROM dogrulanmis_magazalar
      WHERE aktif = 1 AND bitisTarihi >= ?
      ORDER BY siteId
    `).all(simdi).map(r => ({
      siteId: r.siteId,
      rozetMetni: r.rozetMetni,
      onayTuru: r.onayTuru || 'resmi_partner',
      bitisTarihi: r.bitisTarihi,
    }));
  } catch {
    return [];
  }
}

/** Doğrulanmış mağaza ekler/günceller (yönetici). */
export function dogrulanmisMagazaKaydet(kayit = {}) {
  const siteId = String(kayit.siteId || '').trim().toLowerCase();
  const rozetMetni = String(kayit.rozetMetni || '').trim();
  const bitisTarihi = String(kayit.bitisTarihi || '').trim();
  if (!siteId) throw new Error('siteId gerekli');
  if (!rozetMetni) throw new Error('rozetMetni gerekli');
  if (!Number.isFinite(Date.parse(bitisTarihi))) throw new Error('bitisTarihi geçersiz');
  const onayTuru = ['resmi_partner', 'hizli_kargo', 'uretici'].includes(kayit.onayTuru)
    ? kayit.onayTuru : 'resmi_partner';

  db.prepare(`
    INSERT INTO dogrulanmis_magazalar (siteId, rozetMetni, onayTuru, bitisTarihi, aktif, olusturma)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(siteId) DO UPDATE SET
      rozetMetni = excluded.rozetMetni, onayTuru = excluded.onayTuru,
      bitisTarihi = excluded.bitisTarihi, aktif = excluded.aktif
  `).run(siteId, rozetMetni.slice(0, 120), onayTuru, bitisTarihi,
    kayit.aktif === false ? 0 : 1, Date.now());

  return dogrulanmisMagazalariGetir().find(m => m.siteId === siteId) || null;
}

/** Doğrulanmış mağaza kaydını siler. */
export function dogrulanmisMagazaSil(siteId) {
  const id = String(siteId || '').trim().toLowerCase();
  if (!id) return false;
  const r = db.prepare('DELETE FROM dogrulanmis_magazalar WHERE siteId = ?').run(id);
  return Number(r.changes || 0) > 0;
}

/**
 * Reklamveren performans raporu (impression / click / CTR).
 *
 * TÜM kayıtlar döner (süresi dolmuş olsa da) çünkü reklamveren geçmiş kampanyasının
 * toplamını görmek ister; ayrıca `yayinda` alanı ile şu an aktif olup olmadığı bellidir.
 * CTR = tıklama / gösterim × 100 (gösterim 0 ise null — bölme hatası/uydurma yok).
 */
export function sponsorRapor() {
  const simdi = new Date().toISOString();
  let satirlar = [];
  try {
    satirlar = db.prepare('SELECT * FROM sponsorlu_vitrin ORDER BY olusturma DESC').all();
  } catch {
    satirlar = [];
  }
  return satirlar.map(row => {
    const gosterim = Number(row.gosterimSayisi) || 0;
    const tiklama = Number(row.tiklamaSayisi) || 0;
    return {
      id: row.id,
      marka: row.marka,
      baslik: row.baslik,
      baslangicTarihi: row.baslangicTarihi,
      bitisTarihi: row.bitisTarihi,
      yayinda: !!row.aktif && row.baslangicTarihi <= simdi && row.bitisTarihi >= simdi,
      gosterimSayisi: gosterim,
      tiklamaSayisi: tiklama,
      ctr: gosterim > 0 ? Math.round((tiklama / gosterim) * 10000) / 100 : null,
    };
  });
}

/** Bir sponsor kampanyasının okunmuş raporu (tek kayıt). */
export function sponsorRaporTek(id) {
  return sponsorRapor().find(r => r.id === String(id || '').trim()) || null;
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

/**
 * Tek bir paylaşımı siler (2026-11-08).
 * Testlerin kendi ürettiği kaydı geri alması ve gerekirse yönetici temizliği için.
 * Toplu silme (`sepetPaylasTemizle`) kullanıcı verisini de sildiği için burada
 * yalnızca verilen kimlik hedeflenir.
 */
export function sepetPaylasSil(id) {
  const temiz = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(temiz)) return false;
  const r = db.prepare('DELETE FROM shared_carts WHERE id = ?').run(temiz);
  return Number(r.changes || 0) > 0;
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
 * V2 (2026-11-05) — sahte indirim dedektörü için PENCERELİ metrikler:
 *   - `ortFiyat30` : son 30 gün, GÜN AĞIRLIKLI ortalama (gerçek satış fiyatı)
 *   - `maxFiyat60` : son 60 günde gerçekten görülen en yüksek fiyat
 *   - `minFiyat90` : son 90 günün tarihi dibi
 *   - `ortFiyat60`, `ortFiyat90` : uzun pencere ortalamaları (bilgi amaçlı)
 * Eski alanlar (minFiyat/maxFiyat/ortFiyat) KORUNUR: 90 günün min/max'i ve
 * 30 gün (yoksa 90 gün) ortalamasıdır — mevcut arayüz bozulmasın.
 *
 * @returns {{
 *   bulundu:boolean, productId:string|null, kimlikKaynagi:string|null,
 *   minFiyat:number|null, maxFiyat:number|null, ortFiyat:number|null,
 *   minFiyat90:number|null, maxFiyat60:number|null, ortFiyat30:number|null,
 *   ortFiyat60:number|null, ortFiyat90:number|null,
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
    // V2 pencereli metrikler (2026-11-05)
    minFiyat90: null,
    maxFiyat60: null,
    ortFiyat30: null,
    ortFiyat60: null,
    ortFiyat90: null,
    veriNoktasi: 0,
    gunSayisi: 0,
    yeterliVeri: false,
    // 🟢 FOMO alanları (2026-11-08) — veri yoksa boş, uydurma yok
    dipSuresiGun: null,
    dipSayisi: 0,
    son24SaatGozlem: 0,
    son7GunGozlem: 0,
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

  const hamDoksan = [];            // {p, t, gun}
  for (const r of rows) {
    // Gözlem zamanı: net_price = gerçekte ödenen (kargo dahil) tutar.
    const p = Number(r.net_price != null ? r.net_price : r.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    const t = Date.parse(r.ts);
    if (!Number.isFinite(t)) continue;
    if (t < sinir90) continue;      // 90 günden eski
    const gun = String(r.ts).slice(0, 10);
    hamDoksan.push({ p, t, gun });
  }

  if (!hamDoksan.length) {
    return bos('Bu ürünün kayıtları 90 günden eski. Yeni karşılaştırma yapıldıkça radar yeniden dolar.', pid, kaynak);
  }

  // Geçmişte döviz/aksesuar hatasından sızmış aşırı düşük değerleri (< medyanın %20'si) ayıkla.
  let doksan = hamDoksan;
  if (hamDoksan.length >= 5) {
    const sirali = hamDoksan.map(x => x.p).sort((a, b) => a - b);
    const med = sirali[Math.floor(sirali.length / 2)];
    if (Number.isFinite(med) && med > 0) {
      const temiz = hamDoksan.filter(x => x.p >= med * 0.20);
      if (temiz.length >= 3) doksan = temiz;
    }
  }

  const otuzGunluk = new Map();    // 'YYYY-MM-DD' -> {toplam, adet}
  for (const x of doksan) {
    if (x.t >= sinir30) {
      const g = otuzGunluk.get(x.gun) || { toplam: 0, adet: 0 };
      g.toplam += x.p; g.adet += 1;
      otuzGunluk.set(x.gun, g);
    }
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

  // ---- V2: pencereli metrikler (2026-11-05) ----
  // Gün ağırlıklı ortalama yardımcısı: her GÜN eşit ağırlık taşır, böylece bir
  // günün çok sayıda gözlemi ortalamayı saptırmaz.
  const gunAgirlikliOrt = (liste) => {
    const gunler = new Map();
    for (const x of liste) {
      const g = gunler.get(x.gun) || { toplam: 0, adet: 0 };
      g.toplam += x.p; g.adet += 1;
      gunler.set(x.gun, g);
    }
    const ort = [...gunler.values()].map(g => g.toplam / g.adet);
    return ort.length ? ort.reduce((a, b) => a + b, 0) / ort.length : null;
  };
  const yuvarla = (x) => (x == null ? null : Math.round(x * 100) / 100);

  const sinir60 = simdi - 60 * GUN_MS;
  const altmis = doksan.filter(x => x.t >= sinir60);
  const fiyatlar60 = altmis.map(x => x.p);
  const fiyatlar90 = doksan.map(x => x.p);

  const minFiyat90 = fiyatlar90.length ? Math.min(...fiyatlar90) : null;
  const maxFiyat60 = fiyatlar60.length ? Math.max(...fiyatlar60) : null;
  const ortFiyat30 = gunAgirlikliOrt(doksan.filter(x => x.t >= sinir30));
  const ortFiyat60 = gunAgirlikliOrt(altmis);
  const ortFiyat90 = gunAgirlikliOrt(doksan);

  const gunSayisi = new Set(doksan.map(x => x.gun)).size;
  const son = doksan[doksan.length - 1];

  // ---- 🟢 FOMO / aciliyet metrikleri (2026-11-08) ----
  // Yalnızca GERÇEK gözlemlerden türetilir; kullanıcı sayısı/tıklama UYDURULMAZ.
  //  - Dip süresi: gün bazında en düşük fiyatı dip bandına (min + %2) giren
  //    günlerin ardışık serileri. Medyan = bu seviyenin tipik ömrü.
  //  - Son 24 saat / 7 gün gözlem sayısı: fiyatın kaç kez doğrulandığı.
  const gunMin = new Map();
  for (const x of doksan) {
    const mevcut = gunMin.get(x.gun);
    if (mevcut == null || x.p < mevcut) gunMin.set(x.gun, x.p);
  }
  const dipEsik = (minFiyat90 ?? minFiyat) * 1.02;
  const dipGunleri = [...gunMin.entries()]
    .filter(([, p]) => p <= dipEsik)
    .map(([g]) => g)
    .sort();

  const seriler = [];
  let seriUzunluk = 0;
  let oncekiGun = null;
  for (const g of dipGunleri) {
    const t = Date.parse(g + 'T00:00:00Z');
    if (!Number.isFinite(t)) continue;
    if (oncekiGun != null && Math.round((t - oncekiGun) / GUN_MS) === 1) {
      seriUzunluk += 1;
    } else {
      if (seriUzunluk) seriler.push(seriUzunluk);
      seriUzunluk = 1;
    }
    oncekiGun = t;
  }
  if (seriUzunluk) seriler.push(seriUzunluk);

  const medyan = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const orta = Math.floor(s.length / 2);
    return s.length % 2 ? s[orta] : (s[orta - 1] + s[orta]) / 2;
  };

  const son24SaatGozlem = doksan.filter(x => x.t >= simdi - GUN_MS).length;
  const son7GunGozlem = doksan.filter(x => x.t >= simdi - 7 * GUN_MS).length;

  const yeterliVeri = gunSayisi >= 3 && ortFiyat != null;
  return {
    bulundu: true,
    productId: pid,
    kimlikKaynagi: kaynak,
    minFiyat: Math.round(minFiyat * 100) / 100,
    maxFiyat: Math.round(maxFiyat * 100) / 100,
    ortFiyat: ortFiyat != null ? Math.round(ortFiyat * 100) / 100 : null,
    // V2 pencereli metrikler
    minFiyat90: yuvarla(minFiyat90),
    maxFiyat60: yuvarla(maxFiyat60),
    ortFiyat30: yuvarla(ortFiyat30),
    ortFiyat60: yuvarla(ortFiyat60),
    ortFiyat90: yuvarla(ortFiyat90),
    veriNoktasi: doksan.length,
    gunSayisi,
    yeterliVeri,
    // 🟢 FOMO (2026-11-08): gerçek geçmişten türetilen aciliyet metrikleri
    dipSuresiGun: seriler.length ? Math.round(medyan(seriler) * 10) / 10 : null,
    dipSayisi: seriler.length,
    son24SaatGozlem,
    son7GunGozlem,
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
        (site, site_name, durum, arama_ms, urun_ms, adet, ornek_baslik, ornek_fiyat, arama_url, hata, kontrol_ts, sorgu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      // 2026-11-10: hangi arama sorgusu kullanıldı (teşhis: 'kablo' mu 'pla filament' mi)
      kayit.sorgu ? String(kayit.sorgu).slice(0, 120) : null,
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
      // 2026-11-10: hangi sorguyla yoklandı (undefined → null).
      sorgu: r.sorgu ?? null,
    }));
  } catch {
    return [];
  }
}

/** Bir adaptörün sağlık geçmişi (son N kayıt). */
export function getAdapterHealthHistory(site, limit = 20) {
  try {
    return db.prepare(`
      SELECT durum, arama_ms, urun_ms, adet, ornek_fiyat, hata, kontrol_ts, sorgu
      FROM adapter_health WHERE site = ? ORDER BY datetime(kontrol_ts) DESC, id DESC LIMIT ?
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

