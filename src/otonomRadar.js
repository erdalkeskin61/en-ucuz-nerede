/**
 * 🎯 Otonom 3D Baskı & Filament Fiyat Avcısı (2026-11-02)
 *
 * Kullanıcı müdahalesi olmadan, katalogdaki popüler filament/yazıcı ürünlerini
 * 61 mağazada tarar; YALNIZCA stokta ve satın alınabilir teklifler arasından
 * en ucuzu seçer ve gerektiğinde Telegram'a kart olarak gönderir.
 *
 * NEDEN AYRI MODÜL: fırsat kanalı "indirim oranı" peşinde; buradaki iş farklı:
 *  1) Sabit bir ürün kataloğu (Ayarlar'dan düzenlenebilir, SQLite'ta),
 *  2) Katı stok filtresi (tükenen mağaza en ucuz olsa bile ASLA seçilmez),
 *  3) Değişiklik/cooldown tabanlı bildirim (spam yok),
 *  4) Ürünler arasında 2 sn nefes payı (rate limiting).
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - Stok bilinmiyorsa "tükendi" denmez (kanıt yoksa eleme yok), ama
 *    `inStock:false`, "Tükendi", "Gelince Haber Ver" gibi KANIT varsa elenir.
 *  - Fiyat okunamıyorsa teklif sayılmaz.
 *  - Kısmi taramada "61 mağazanın en ucuzu" iddia edilmez; kartta not düşülür.
 *  - Gramaj yoksa ₺/kg uydurulmaz (birim fiyat alanı boş kalır).
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { getSettings, saveSettings, addPricePoint } from './store.js';
import { runComparison } from './pipeline.js';
import { hizliKaynakUrunBul } from './urunArama.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { birimFiyatHesapla } from './birimFiyat.js';
import { anlikYaz } from './anlikOnbellek.js';
import { esc, botPara as para, kargoMetni } from './telegramBot.js';
import { modelSerisiCakismasi, titleSimilarity, parcaMi, kanonikUrunUrl, slugYap } from './util.js';
import { fiyatSerisi } from './grafik.js';
import { fiyatGrafigiUret } from './fiyatGrafik.js';
import { whatsappKartOlustur, whatsappKanalGonder } from './whatsappKanal.js';
import { fotoGonder } from './telegramFoto.js';

/* ------------------------------------------------------------------ */
/* Sabitler                                                            */
/* ------------------------------------------------------------------ */

/** Ayarlar panelindeki varsayılanlar. */
export const RADAR_VARSAYILAN = Object.freeze({
  enabled: false,
  saatAraligi: 4,          // saat
  urunArasiMs: 2000,       // ürünler arası nefes payı
  paylasimAraligiSaat: 48, // aynı ürün için sessizlik
  donguBasina: 5,          // tek turda en fazla bildirim
  chatId: '',              // boşsa telegram.chatId → firsat.kanal
  sonCalisma: null,
  sonRapor: null,
});

/**
 * Varsayılan katalog. `sorgu` ile `hizliKaynakUrunBul` üzerinden kanonik ürün
 * sayfası bulunur; istenirse `url` doğrudan sabitlenebilir (mağaza değişince
 * arama kaymasın diye).
 */
export const VARSAYILAN_KATALOG = Object.freeze([
  // --- Popüler filamentler ---
  // 2026-11-10 (v5): 11 kayıtta url NULL idi; her radar turunda arama motoruna
  // düşülüyor, arama yedek parça (silikon çorap, nozzle) döndürünce ürün radar
  // dışı kalıyordu. Aşağıdaki tüm URL'ler CANLIDA doğrulandı (getProduct ile
  // fiyat > 0 ve doğru başlık okundu). Tarih: 2026-11-10.
  {
    ad: 'Creality Ender PLA Gri 1kg',
    sorgu: 'Creality Ender PLA Gri 1kg',
    kategori: 'filament',
    url: 'https://www.trendyol.com/creality/ender-pla-filament-gri-1-75mm-1kg-p-746534543?boutiqueId=61&merchantId=1155592',
  },
  // 2026-11-05: arama motorları "ePLA-HS" + "1kg" birleşiminde 0 sonuç dönüyordu.
  // Kanonik URL canlı doğrulandı (N11, ₺1.046,34, HTTP 200) — radar artık
  // 0 sn gecikmeyle doğrudan bu sayfayı tarar (arama belirsizliği yok).
  {
    ad: 'eSun ePLA-HS (High Speed) PLA Siyah 1kg',
    sorgu: 'eSun ePLA HS Siyah',
    kategori: 'filament',
    url: 'http://www.n11.com/urun/esun-pla-hs-yuksek-hizli-pla-filament-siyah-52100650',
  },
  {
    ad: 'eSun PLA+ Beyaz 1kg',
    sorgu: 'eSun PLA+ Beyaz 1kg',
    kategori: 'filament',
    url: 'https://www.trendyol.com/esun/beyaz-pla-basic-filament-1-75mm-1kg-p-1146688438?boutiqueId=61&merchantId=1061268',
  },
  // --- Porima (üreticinin kendi mağazası; 2026-11-03) ---
  // url = porima3d ürün sayfası + TAM varyant kimliği: renk/ağırlık kayması olmaz.
  { ad: 'Porima PLA Filament Beyaz 1kg', sorgu: 'Porima PLA Filament Beyaz 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-pla-filament?variant=49130119758171' },
  { ad: 'Porima PLA Filament Siyah 1kg', sorgu: 'Porima PLA Filament Siyah 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-pla-filament?variant=49130120184155' },
  { ad: 'Porima PLA Filament Ten 1kg', sorgu: 'Porima PLA Filament Ten 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-pla-filament?variant=49130119725403' },
  { ad: 'Porima Hyper PLA+ Filament Siyah 1kg', sorgu: 'Porima Hyper PLA+ Filament Siyah 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-hyper-pla-plus-filament?variant=53531110015323' },
  { ad: 'Porima Silk PLA Filament Altın 1kg', sorgu: 'Porima Silk PLA Filament Altın 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-silk-pla-filament?variant=50188821725531' },
  { ad: 'Porima Eco PLA Filament Gri 1kg', sorgu: 'Porima Eco PLA Filament Gri 1kg', kategori: 'filament',
    url: 'https://porima3d.com/products/porima-eco-pla-filament?variant=49427251822939' },
  {
    ad: 'Microzey PLA Filament Gri',
    sorgu: 'Microzey PLA Pro Max Gri 1kg',
    kategori: 'filament',
    url: 'https://www.trendyol.com/microzey/acik-gri-pla-pro-max-filament-1-75mm-1-kg-p-956217758?boutiqueId=61&merchantId=1275615',
  },
  // NOT (2026-11-10): "Sunlu PLA+" takibi gerçek bir PLA+ ilanı bulunamadığı için
  // ürün adı satılan gerçek ürüne çekildi (Ventatek "Sunlu PLA Filament Siyah").
  // Katalogda olmayan bir ürünü varmış gibi göstermiyoruz.
  {
    ad: 'Sunlu PLA Filament Siyah 1kg',
    sorgu: 'Sunlu PLA Filament Siyah 1kg',
    kategori: 'filament',
    url: 'https://www.ventatek.com/sunlu-siyah-pla-filament-1.75mm-1-kg-536',
  },
  // --- Popüler 3D yazıcılar (hepsi 2026-11-10 tarihinde canlı doğrulandı) ---
  {
    ad: 'Bambu Lab P1S 3D Yazıcı',
    sorgu: 'Bambu Lab P1S 3D Yazıcı',
    kategori: 'yazici',
    url: 'https://3dcim.com/bambu-lab-p1s-719',
  },
  {
    ad: 'Bambu Lab A1 Mini 3D Yazıcı',
    sorgu: 'Bambu Lab A1 Mini 3D Yazıcı',
    kategori: 'yazici',
    url: 'https://www.trendyol.com/creality/bambu-lab-a1-mini-3d-yazici-p-892358623?boutiqueId=61&merchantId=105369',
  },
  {
    ad: 'Creality K1C 3D Yazıcı',
    sorgu: 'Creality K1C 3D Yazıcı',
    kategori: 'yazici',
    url: 'https://www.trendyol.com/creality/k1c-3d-yazici-p-813569359?boutiqueId=61&merchantId=616776',
  },
  {
    ad: 'Creality K1 Max 3D Yazıcı',
    sorgu: 'Creality K1 Max 3D Yazıcı',
    kategori: 'yazici',
    url: 'https://www.trendyol.com/creality/k1-max-3d-yazici-p-809731914?boutiqueId=61&merchantId=616776',
  },
  {
    ad: 'Creality Ender 3 V3 KE',
    sorgu: 'Creality Ender 3 V3 KE 3D Yazıcı',
    kategori: 'yazici',
    url: 'http://www.n11.com/urun/creality-ender-3-v3-ke-3d-yazici-cycy1crty0007-84251056',
  },
  // ⚠️ 2026-11-10: Anycubic Kobra 2 Neo ÜRETİMDEN KALKTI. 62 mağaza + 17 3D
  // mağazasında yalnızca yedek parça (silikon çorap, rulman) satılıyor; yazıcının
  // kendisi hiçbir mağazada yok. Uydurma link yazmak yerine kayıt PASİF tutulur
  // (`aktif = 0`, `pasif_neden` açıklamalı) — radar boşuna tur harcamaz, borsada
  // ölü kart görünmez. Ürün tekrar satışa çıkarsa URL eklenip aktifleştirilir.
  {
    ad: 'Anycubic Kobra 2 Neo',
    sorgu: 'Anycubic Kobra 2 Neo',
    kategori: 'yazici',
    url: null,
    pasifNeden: 'Üretimden kalktı: hiçbir mağazada yazıcı olarak satılmıyor (yalnızca yedek parça).',
  },
  {
    ad: 'Elegoo Neptune 4 Pro',
    sorgu: 'Elegoo Neptune 4 Pro 3D Yazıcı',
    kategori: 'yazici',
    url: 'https://www.hepsiburada.com/elegoo-neptune-4-pro-3d-yazici-pm-HBC00004TE9SE',
  },
  // --- ⚙️ Parça / Reçine / Aksesuar (2026-11-10, seed v6) ---
  // Borsa vitrininin "genel" kotası (2 kart) için katalogda hiç ürün yoktu;
  // kota sürekli yazıcıya kayıyordu. Aşağıdaki iki reçine 2026-11-10'da
  // getProduct ile doğrulandı (ikisi de stokta).
  {
    ad: 'Porima PoResin Standart Reçine Kırmızı 1kg',
    sorgu: 'PoResin Standart Reçine 1kg',
    kategori: 'genel',
    url: 'https://porima3d.com/products/poresin-standart-recine?variant=50208736805211',
  },
  {
    ad: 'Elegoo Water Washable UV Reçine Kırmızı 1kg',
    sorgu: 'Elegoo Water Washable Reçine 1kg',
    kategori: 'genel',
    url: 'https://filamentsan.com/elegoo-water-washable-photopolymer-recine-kirmizi-1kg',
  },
  // --- 🧩 seed v7 (2026-11-11): PETG / TPU / Reçine / Nozzle / Kurutucu ---
  // Gerekçe: 20 ürünlük havuz yüzünden fırsat kanalı ve borsa vitrini hep aynı
  // PLA + yazıcıları döndürüyordu. Aşağıdaki 17 ürünün TAMAMI 2026-11-11
  // tarihinde canlı doğrulandı (getProduct → başlık + fiyat > 0).
  //
  // Dürüstlük notu (görev listesinden sapmalar, uydurma link yazılmadı):
  //  • "Creality Standart UV Reçine" hiçbir erişilebilir mağazada satılmıyor
  //    (Trendyol/HB/n11 aramaları yalnızca Creality yazıcı ve tabla döndürdü)
  //    → aynı segmentteki gerçek ürün "Elegoo Standart Reçine Gri" eklendi.
  //  • "Porima TPU 500g" satılmıyor (Porima yalnız 1kg) → 1kg gerçek varyant.
  //  • "eSun eTPU-95A Naturel" stokta yok → satılan Beyaz varyantı izleniyor.
  //  • "E3D V6 Sertleştirilmiş Çelik" TR'de yok; E3D'nin gerçek sertleştirilmiş
  //    çelik nozzle'ı Volcano 0.4mm olarak satılıyor → o kayıt eklendi.
  //  • "Sunlu Filadryer S2" yerine güncel model SP2 satılıyor.
  // --- 🧵 PETG ---
  {
    ad: 'Porima PETG Filament Siyah 1kg',
    sorgu: 'Porima PETG Filament Siyah 1kg',
    kategori: 'filament',
    url: 'https://porima3d.com/products/porima-petg-filament?variant=49130242408795',
  },
  {
    ad: 'Porima PETG Filament Beyaz 1kg',
    sorgu: 'Porima PETG Filament Beyaz 1kg',
    kategori: 'filament',
    url: 'https://porima3d.com/products/porima-petg-filament?variant=49130242277723',
  },
  {
    ad: 'Microzey PETG Filament Siyah 1kg',
    sorgu: 'Microzey PETG Siyah 1kg',
    kategori: 'filament',
    url: 'https://www.trendyol.com/microzey/siyah-petg-filament-1kg-p-1207578129?boutiqueId=61&merchantId=1091562',
  },
  {
    ad: 'eSun PETG Filament Siyah 1kg',
    sorgu: 'eSun PETG Siyah 1kg',
    kategori: 'filament',
    url: 'https://www.trendyol.com/esun/petg-filament-kati-siyah-1-75mm-1kg-p-859869131?boutiqueId=61&merchantId=942636',
  },
  // --- 🌀 TPU / esnek ---
  {
    ad: 'eSun eTPU-95A Esnek Filament Beyaz 1kg',
    sorgu: 'eSun eTPU 95A Beyaz 1kg',
    kategori: 'filament',
    url: 'http://www.n11.com/urun/esun-tpu-95a-beyaz-esnek-filament-175mm-1-kg-130196220',
  },
  {
    ad: 'Porima TPU Flex 98A Filament Siyah 1kg',
    sorgu: 'Porima TPU Flex 98A Filament Siyah 1kg',
    kategori: 'filament',
    url: 'https://porima3d.com/products/porima-tpu-flex-esnek-98a-filament?variant=49130784555355',
  },
  {
    ad: 'Creality CR-TPU Esnek Filament Siyah 1kg',
    sorgu: 'Creality CR-TPU Siyah 1kg',
    kategori: 'filament',
    url: 'http://www.n11.com/urun/creality-cr-tpu-siyah-filament-1kg-175mm-58313384',
  },
  // --- 🧪 SLA / DLP UV reçineler ---
  {
    ad: 'Anycubic Standart UV Reçine Gri 1kg',
    sorgu: 'Anycubic Standart Reçine Gri 1kg',
    kategori: 'genel',
    url: 'https://porima3d.com/products/anycubic-standart-recine?variant=50209015136603',
  },
  {
    ad: 'Elegoo Standart UV Reçine Gri 1kg',
    sorgu: 'Elegoo Standart Reçine Gri 1kg',
    kategori: 'genel',
    url: 'https://porima3d.com/products/elegoo-standart-recine?variant=50209830338907',
  },
  {
    ad: 'Anycubic Water-Wash UV Reçine Gri 1kg',
    sorgu: 'Anycubic Suyla Yıkanabilir Reçine Gri 1kg',
    kategori: 'genel',
    url: 'https://porima3d.com/products/anycubic-suyla-yikanabilen-water-wash-recine-plus?variant=50734501298523',
  },
  // --- 🔧 Sertleştirilmiş çelik nozzle / hotend ---
  {
    ad: 'Bambu Lab P1 Serisi 0.4mm Sertleştirilmiş Çelik Komple Hotend',
    sorgu: 'Bambu Lab P1 Sertleştirilmiş Çelik Komple Hotend 0.4mm',
    kategori: 'genel',
    url: 'https://3dcim.com/bambulab-p1-comp.-hotend-as-with-hardened-nozz-04',
  },
  {
    ad: 'Bambu Lab X1/P1 Sertleştirilmiş Çelik 0.4mm Nozzle',
    sorgu: 'Bambu Lab X1 Sertleştirilmiş Çelik Nozzle 0.4mm',
    kategori: 'genel',
    url: 'https://3dcim.com/bambulab-hotend-with-hardened-steel-nozzle-0.4mm',
  },
  {
    ad: 'Creality Unicorn Quick-Swap Nozzle K1/K1C/K1 Max 0.4mm',
    sorgu: 'Creality K1 Unicorn Quick Swap Nozzle 0.4mm',
    kategori: 'genel',
    url: 'http://www.n11.com/urun/04mm-creality-unicorn-quick-swap-nozzle-k1-k1c-k1-max-yeni-nesil-138853853',
  },
  {
    ad: 'E3D Volcano Sertleştirilmiş Çelik Nozzle 0.4mm',
    sorgu: 'E3D Volcano Sertleştirilmiş Çelik Nozzle 0.4mm',
    kategori: 'genel',
    url: 'https://www.hepsiburada.com/e3d-volcano-sertlestirilmis-celik-nozzle-x1-x2-genius-genius-pro-0-4mm-pm-HBC00006FJV7F',
  },
  // --- ♨️ Filament kurutucu kutular ---
  {
    ad: 'eSun eBOX Lite Filament Kurutucu',
    sorgu: 'eSun eBOX Lite Filament Kurutucu',
    kategori: 'genel',
    url: 'https://www.filamentmarketim.com/esun-ebox-lite-filament-kurutucu-dryer',
  },
  {
    ad: 'Sunlu FilaDryer SP2 Filament Kurutucu',
    sorgu: 'Sunlu FilaDryer SP2 Filament Kurutucu',
    kategori: 'genel',
    url: 'https://www.hepsiburada.com/sunlu-filadryer-sp2-filament-kurutucu-ve-nem-giderici-pm-HBC0000BGDP48',
  },
  {
    ad: 'Creality SpacePi X4 Filament Kurutucu',
    sorgu: 'Creality SpacePi X4 Filament Kurutucu',
    kategori: 'genel',
    url: 'https://porima3d.com/products/creality-spacepi-x4-filament-kurutucu',
  },
]);

const KATEGORILER = new Set(['filament', 'yazici', 'genel']);
const DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');
const CIZGI = '━━━━━━━━━━━━━━━━━━━━';
/** "Satın alınamaz" kanıtı sayılan metinler (ürünün stok alanlarında aranır). */
const SATILAMAZ_METIN = /tükendi|tukendi|stokta\s*yok|stok\s*yok|gelince\s*haber\s*ver|satışa\s*kapalı|satisa\s*kapali|temin\s*edilemiyor|out\s*of\s*stock|outofstock|sold\s*out|currently\s*unavailable|stoklarımızda\s*yok/i;

let db = null;
let zamanlayici = null;
let calisiyor = false;
let sonRapor = null;
let sonCalisma = null;

/** Yürüyen taramanın ilerlemesi (Ayarlar paneli için). */
const ILERLEME = {
  calisiyor: false,
  basladi: null,
  toplam: 0,
  tamamlanan: 0,
  sonUrun: null,
  hatalar: 0,
};

/* ------------------------------------------------------------------ */
/* Veritabanı                                                          */
/* ------------------------------------------------------------------ */

/** Testlerde/sunucu kapanışında SQLite tutamacını kapatır. */
export function radarKapat() {
  radarZamanlayiciDurdur();
  try { db?.close(); } catch { /* zaten kapalı */ }
  db = null;
}

function veritabani() {
  if (db) return db;
  db = new DatabaseSync(DB_YOLU);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS radar_katalog (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ad       TEXT NOT NULL,
      sorgu    TEXT NOT NULL,
      url      TEXT,
      kategori TEXT NOT NULL DEFAULT 'genel',
      aktif    INTEGER NOT NULL DEFAULT 1,
      sira     INTEGER NOT NULL DEFAULT 0,
      eklenme  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS radar_durum (
      anahtar      TEXT PRIMARY KEY,
      katalog_id   INTEGER,
      urun         TEXT,
      site         TEXT,
      site_id      TEXT,
      fiyat        REAL,
      stokta       INTEGER NOT NULL DEFAULT 0,
      ts           INTEGER NOT NULL,
      paylasim_ts  INTEGER,
      veri         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS radar_gonderim (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      anahtar   TEXT NOT NULL,
      urun      TEXT,
      site      TEXT,
      fiyat     REAL,
      ts        INTEGER NOT NULL,
      durum     TEXT NOT NULL,
      neden     TEXT,
      mesaj_id  TEXT,
      hata      TEXT
    );

    CREATE TABLE IF NOT EXISTS radar_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- 2026-11-03: 30-90 günlük trend grafiği için gerçek tarama geçmişi.
    -- Her ürün için saatte en fazla 1 kayıt (fiyat/stok değişimi anında yazılır).
    CREATE TABLE IF NOT EXISTS radar_gecmis (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      katalog_id INTEGER NOT NULL,
      ts         INTEGER NOT NULL,
      fiyat      REAL,
      site       TEXT,
      stokta     INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_radar_durum_ts ON radar_durum(ts);
    CREATE INDEX IF NOT EXISTS idx_radar_gonderim_ts ON radar_gonderim(ts);
    CREATE INDEX IF NOT EXISTS idx_radar_gecmis_k ON radar_gecmis(katalog_id, ts DESC);
  `);
  // 180 günden eski trend kayıtlarını temizle (grafik 90 gün kullanır).
  try {
    db.prepare('DELETE FROM radar_gecmis WHERE ts < ?').run(Date.now() - 180 * 86400000);
  } catch { /* tablo yeni oluştuysa yoksay */ }
  // 2026-11-10 (v5): pasif kayıtların nedenini tutan kolon. Mevcut kurulumlarda
  // tablo zaten var olduğu için CREATE TABLE yetmez → ALTER ile eklenir.
  try {
    const kolonlar = new Set(db.prepare('PRAGMA table_info(radar_katalog)').all().map(k => k.name));
    if (!kolonlar.has('pasif_neden')) {
      db.exec('ALTER TABLE radar_katalog ADD COLUMN pasif_neden TEXT');
    }
  } catch { /* eski SQLite sürümünde ALTER desteklenmezse yoksay */ }
  tohumla();
  return db;
}

/**
 * Varsayılan katalog tohum sürümü.
 *  1 → ilk kurulum (13 ürün)
 *  2 → Porima girişleri (2026-11-03)
 *  3 → eski Porima kaydının xPLA olarak düzeltilmesi (2026-11-03)
 *  4 → eSun ePLA-HS kanonik URL + optimize sorgu (2026-11-05)
 *  5 → 11 NULL URL'nin doğrulanmış kanonik linklerle doldurulması (2026-11-10)
 *  6 → "genel" (reçine/aksesuar) kategorisine 2 doğrulanmış ürün (2026-11-10)
 *  7 → 17 doğrulanmış ürün: PETG, TPU, reçine, nozzle/hotend, kurutucu (2026-11-11)
 * Sürüm artırıldığında MEVCUT kurulumlara yalnızca EKSİK varsayılanlar eklenir;
 * kullanıcının kendi eklediği/sildiği kayıtlar korunur.
 */
export const KATALOG_SEED_SURUMU = 7;

/** Karşılaştırma için ad normalizasyonu ("Porima PLA  Siyah" ≡ "porima pla siyah"). */
function adAnahtari(ad) {
  return String(ad || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/** İlk kurulumda varsayılan katalog yazılır; göçte yalnızca eksikler eklenir. */
function tohumla() {
  const isaret = db.prepare("SELECT value FROM radar_meta WHERE key = 'katalog_seed'").get();
  const mevcutSurum = Number(isaret?.value || 0);
  // id ŞART (2026-11-05): göç UPDATE'leri kaydı id ile hedefliyor;
  // yalnız ad/sira seçildiğinde esunKaydi.id undefined kalıp güncelleme sessizce
  // çalışmıyordu.
  const satirlar = db.prepare('SELECT id, ad, sira FROM radar_katalog').all();
  const adet = satirlar.length;

  const ekle = db.prepare(`
    INSERT INTO radar_katalog (ad, sorgu, url, kategori, aktif, sira, eklenme)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);

  if (adet === 0) {
    VARSAYILAN_KATALOG.forEach((k, i) => ekle.run(k.ad, k.sorgu, k.url || null, k.kategori, i, Date.now()));
  } else if (mevcutSurum < KATALOG_SEED_SURUMU) {
    // VERİ DÜZELTMESİ (2026-11-05, v4): "eSun ePLA-HS" kaydında url BOŞTU, bu
    // yüzden radar her turda arama motoruna düşüyor ve 0 sonuç alıyordu
    // (kaynakYok: true → ürün 61 mağazada hiç taranmıyordu). Doğrulanmış
    // kanonik URL ve optimize sorgu yazılır; kullanıcının diğer kayıtları korunur.
    const esunKaydi = satirlar.find(r => /eSun ePLA-HS/i.test(r.ad || ''));
    if (esunKaydi) {
      db.prepare('UPDATE radar_katalog SET sorgu = ?, url = ? WHERE id = ?').run(
        'eSun ePLA HS Siyah',
        'http://www.n11.com/urun/esun-pla-hs-yuksek-hizli-pla-filament-siyah-52100650',
        esunKaydi.id,
      );
      console.log('[radar] eSun ePLA-HS kaydına kanonik URL atandı (id: ' + esunKaydi.id + ').');
    }

    // VERİ DÜZELTMESİ (2026-11-03): eski varsayılan "Porima PLA Siyah 1.75mm 1kg"
    // kaydı, arama çözümlemesi yüzünden aslında Trendyol'daki **xPLA** ilanını
    // izliyordu; borsada xPLA ürünü düz PLA fiyatıyla görünüyordu. Kayıt artık
    // doğru adıyla (xPLA) ve TAM varyant kimliğiyle tutuluyor.
    const eskiPorima = satirlar.find(r => adAnahtari(r.ad) === adAnahtari('Porima PLA Siyah 1.75mm 1kg'));
    if (eskiPorima) {
      db.prepare('UPDATE radar_katalog SET ad = ?, sorgu = ?, url = ? WHERE ad = ?').run(
        'Porima xPLA Filament Siyah 1kg',
        'Porima xPLA Filament Siyah 1kg',
        'https://porima3d.com/products/porima-xpla-filament?variant=53427185221979',
        eskiPorima.ad,
      );
      console.log('[radar] eski "Porima PLA Siyah 1.75mm 1kg" kaydı doğru ürün hattına (xPLA) çevrildi.');
    }

    const varOlan = new Set(satirlar.map(r => adAnahtari(r.ad)));
    let sira = Math.max(0, ...satirlar.map(r => Number(r.sira) || 0));
    let eklenen = 0;
    for (const k of VARSAYILAN_KATALOG) {
      if (varOlan.has(adAnahtari(k.ad))) continue;
      ekle.run(k.ad, k.sorgu, k.url || null, k.kategori, ++sira, Date.now());
      eklenen++;
    }
    if (eklenen) console.log(`[radar] kataloğa ${eklenen} yeni varsayılan ürün eklendi (seed v${KATALOG_SEED_SURUMU}).`);
  }

  // ------------------------------------------------------------------
  // v5 (2026-11-10): NULL kaynak URL'lerinin doldurulması
  // ------------------------------------------------------------------
  // Kök neden: url boşken radar her turda hizliKaynakUrunBul() ile arama
  // motoruna düşüyor; yazıcı aramaları yedek parça (silikon çorap, nozzle)
  // döndürüyor, sıkı filtre bunları reddedince ürün radar dışı kalıyordu
  // (kaynakYok: true → 61 mağazada hiç taranmıyor).
  //
  // Göç kuralları (dürüstlük):
  //  - Yalnızca url BOŞ olan kayıtlar doldurulur; kullanıcının elle girdiği
  //    doğrulanmış link EZİLMEZ.
  //  - VARSAYILAN_KATALOG'daki her URL 2026-11-10 tarihinde canlı doğrulandı.
  //  - Satılamayan ürün (Kobra 2 Neo) uydurma linkle doldurulmaz; pasifleştirilir.
  //  - VARSAYILAN_KATALOG'da adı değişen ürün (Sunlu) yeni adla YENİ kayıt
  //    açmaz; eski kayıt taşınır (yinelenen ürün olmasın).
  if (mevcutSurum < 5) {
    const guncelleUrl = db.prepare(`
      UPDATE radar_katalog
         SET url = ?, sorgu = ?
       WHERE id = ? AND (url IS NULL OR trim(url) = '')
    `);
    const adGuncelle = db.prepare('UPDATE radar_katalog SET ad = ?, sorgu = ?, url = ? WHERE id = ?');
    const pasiflestir = db.prepare('UPDATE radar_katalog SET aktif = 0, pasif_neden = ? WHERE id = ?');
    const aktiflestir = db.prepare('UPDATE radar_katalog SET aktif = 1, pasif_neden = NULL WHERE id = ?');
    const silBos = db.prepare("DELETE FROM radar_katalog WHERE id = ? AND (url IS NULL OR trim(url) = '')");

    const guncelSatirlar = db.prepare('SELECT id, ad, url, sorgu, kategori, aktif FROM radar_katalog').all();
    const adaGore = new Map(guncelSatirlar.map(r => [adAnahtari(r.ad), r]));

    let doldurulan = 0;
    let pasifSayisi = 0;
    let tasinan = 0;

    for (const k of VARSAYILAN_KATALOG) {
      const kayit = adaGore.get(adAnahtari(k.ad));

      // --- İsim değişikliği: eski boş kaydı yeni ada taşı ---
      // (2026-11-10: "Sunlu PLA+ Filament 1kg" → gerçekte satılan
      //  "Sunlu PLA Filament Siyah 1kg". Yeni kayıt açmak yerine taşı.)
      const eskiAdlar = { 'Sunlu PLA Filament Siyah 1kg': 'Sunlu PLA+ Filament 1kg' };
      const eskiAd = eskiAdlar[k.ad];
      if (eskiAd) {
        const eski = adaGore.get(adAnahtari(eskiAd));
        if (eski) {
          if (!kayit) {
            adGuncelle.run(k.ad, k.sorgu, k.url, eski.id);
            tasinan++;
          } else if (eski.id !== kayit.id && (!eski.url || !String(eski.url).trim())) {
            // Yeni kayıt zaten eklenmişse: boş eski kaydı sil (yinelenmeyi önle).
            silBos.run(eski.id);
            tasinan++;
          }
          continue;
        }
      }

      if (!kayit) continue;

      // --- Satılamayan ürün: pasifleştir (uydurma URL yazılmaz) ---
      if (!k.url) {
        if (kayit.aktif !== 0) {
          pasiflestir.run(k.pasifNeden || 'Kaynak bulunamadı', kayit.id);
          pasifSayisi++;
        }
        continue;
      }

      // --- URL boşsa doldur; doluysa dokunma ---
      if (!kayit.url || !String(kayit.url).trim()) {
        guncelleUrl.run(k.url, k.sorgu, kayit.id);
        doldurulan++;
      }
      // Pasif kalmış ama artık URL'si olan kaydı geri aç.
      if (kayit.aktif === 0 && !k.pasifNeden) aktiflestir.run(kayit.id);
    }

    if (doldurulan) {
      console.log(`[radar] Katalog seed v5: ${doldurulan} ürünün kanonik URL'si bağlandı.`);
    }
    if (tasinan) {
      console.log(`[radar] Katalog seed v5: ${tasinan} kayıt gerçek ürün adına taşındı.`);
    }
    if (pasifSayisi) {
      console.log(`[radar] Katalog seed v5: ${pasifSayisi} satılamayan ürün pasife alındı (uydurma link yazılmadı).`);
    }

    // Ölü kart temizliği: silinen/pasifleştirilen ürünlerin ESKİ durum kayıtları
    // borsada "kaynakYok" kartı olarak kalmasın.
    try {
      const r = db.prepare(`
        DELETE FROM radar_durum
         WHERE katalog_id IS NOT NULL
           AND katalog_id NOT IN (SELECT id FROM radar_katalog WHERE aktif = 1)
      `).run();
      const n = Number(r.changes || 0);
      if (n) console.log(`[radar] Katalog seed v5: ${n} ölü durum kartı temizlendi.`);
    } catch { /* tablo boşsa yoksay */ }
  }


  db.prepare("INSERT INTO radar_meta (key, value) VALUES ('katalog_seed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(String(KATALOG_SEED_SURUMU));
}

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Telegram Chat ID / Kanal adını doğrular ve normalize eder.
 * Kullanıcı @ koymadan "baskihesapfirsatlari" yazdıysa başına otomatik @ ekler.
 */
export function temizChatId(id) {
  let s = String(id || '').trim();
  if (!s) return '';
  // Sayısal ID (-100... veya 589128...) değilse ve @ ile başlamıyorsa başına @ ekle
  if (!/^[-0-9]/.test(s) && !s.startsWith('@')) {
    s = '@' + s;
  }
  return s.slice(0, 120);
}

/**
 * Kayıtlı ayarları varsayılanlarla birleştirir ve sınırlar.
 * @param {object|null} [ayar] test/elle geçersiz kılma için
 */
export function radarAyar(ayar = null) {
  const ham = ayar || getSettings().radar || {};
  const sayi = (v, varsayilan, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: ham.enabled === true,
    saatAraligi: sayi(ham.saatAraligi, RADAR_VARSAYILAN.saatAraligi, 1, 24),
    urunArasiMs: Math.round(sayi(ham.urunArasiMs, RADAR_VARSAYILAN.urunArasiMs, 0, 30000)),
    paylasimAraligiSaat: sayi(ham.paylasimAraligiSaat, RADAR_VARSAYILAN.paylasimAraligiSaat, 1, 720),
    donguBasina: Math.round(sayi(ham.donguBasina, RADAR_VARSAYILAN.donguBasina, 1, 20)),
    chatId: typeof ham.chatId === 'string' ? temizChatId(ham.chatId) : '',
    sonCalisma: typeof ham.sonCalisma === 'string' ? ham.sonCalisma : null,
    sonRapor: ham.sonRapor && typeof ham.sonRapor === 'object' ? ham.sonRapor : null,
  };
}

/* ------------------------------------------------------------------ */
/* Katalog (CRUD)                                                      */
/* ------------------------------------------------------------------ */

function satirCevir(r) {
  return {
    id: Number(r.id),
    ad: String(r.ad || ''),
    sorgu: String(r.sorgu || ''),
    url: r.url ? String(r.url) : null,
    kategori: KATEGORILER.has(r.kategori) ? r.kategori : 'genel',
    aktif: Number(r.aktif) !== 0,
    sira: Number(r.sira) || 0,
    // 2026-11-10: pasif kaydın nedeni (ör. üretimden kalkan ürün) panelde görünür.
    pasifNeden: r.pasif_neden ? String(r.pasif_neden) : null,
  };
}

/**
 * Katalog bütünlüğü mimari sözleşmesi (2026-11-11).
 *
 * Yeni ürün eklerken veya silerken bu eşiklerin altına düşülmemeli:
 * borsa vitrini kotası (6:4:2) ve Telegram inline modu bu dağılıma dayanır.
 * Değerler SÖZLEŞMEDİR — gerçek sayımların altında ama regresyon eşiği.
 */
export const KATALOG_ASGARI = Object.freeze({
  filament: 18,
  yazici: 6,
  genel: 10,
});

/**
 * Radar kataloğu ve veritabanı sağlık bütünlüğünü denetler.
 *
 * Sözleşme:
 *  1. Sıfır-NULL: aktif hiçbir kaydın `url` alanı boş olamaz.
 *  2. Gerekçeli pasif: pasif her kaydın `pasif_neden` açıklaması olmalı.
 *     (Kanonik link yoksa uydurma URL yazılmaz → kayıt pasife alınır.)
 *  3. Kategori kotası: filament ≥18, yazıcı ≥6, genel ≥10.
 *  4. SQLite: integrity_check 'ok', WAL modu açık, busy_timeout = 5000.
 *
 * @param {{db?: object}} [opts] test/elle bağlantı geçersiz kılma
 * @returns {{
 *   ok: boolean, toplam: number, aktif: number, pasif: number,
 *   bosUrlSayisi: number, gerekcesizPasifSayisi: number,
 *   dagilim: {filament:number, yazici:number, genel:number},
 *   pragma: {integrity:string|null, journalMode:string|null, busyTimeout:number|null},
 *   hatalar: string[],
 * }}
 */
export function katalogDogrula(opts = {}) {
  const hatalar = [];
  let s = null;
  try {
    s = opts.db || veritabani();
  } catch (e) {
    return {
      ok: false, toplam: 0, aktif: 0, pasif: 0, bosUrlSayisi: 0, gerekcesizPasifSayisi: 0,
      dagilim: { filament: 0, yazici: 0, genel: 0 },
      pragma: { integrity: null, journalMode: null, busyTimeout: null },
      hatalar: [`Veritabanı açılamadı: ${String(e?.message || e).slice(0, 160)}`],
    };
  }

  // ---- 1) SQLite bütünlük ve ayarları ----
  const pragma = { integrity: null, journalMode: null, busyTimeout: null, synchronous: null };
  try {
    const intCheck = s.prepare('PRAGMA integrity_check').get();
    pragma.integrity = String(intCheck?.integrity_check ?? intCheck?.integrity ?? '');
    if (pragma.integrity !== 'ok') {
      hatalar.push(`SQLite bozulması: ${pragma.integrity || 'bilinmeyen sonuç'}`);
    }
  } catch (e) {
    hatalar.push(`Integrity check hatası: ${String(e?.message || e).slice(0, 160)}`);
  }
  try {
    const jm = s.prepare('PRAGMA journal_mode').get();
    pragma.journalMode = String(jm?.journal_mode ?? jm?.journalMode ?? '').toLowerCase() || null;
    if (pragma.journalMode && pragma.journalMode !== 'wal') {
      hatalar.push(`SQLite WAL modu kapalı (journal_mode=${pragma.journalMode})`);
    }
  } catch { /* PRAGMA okunamadıysa ayrı hata üretilmez */ }
  try {
    const bt = s.prepare('PRAGMA busy_timeout').get();
    const deger = Number(bt?.timeout ?? bt?.busy_timeout);
    pragma.busyTimeout = Number.isFinite(deger) ? deger : null;
    if (pragma.busyTimeout != null && pragma.busyTimeout < 5000) {
      hatalar.push(`SQLite busy_timeout düşük (${pragma.busyTimeout} < 5000)`);
    }
  } catch { /* yoksay */ }
  try {
    const sy = s.prepare('PRAGMA synchronous').get();
    const deger = Number(sy?.synchronous);
    pragma.synchronous = Number.isFinite(deger) ? deger : null;
    // 0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA. WAL + NORMAL beklenen ayardır.
    if (pragma.synchronous != null && pragma.synchronous !== 1) {
      hatalar.push(`SQLite synchronous NORMAL değil (${pragma.synchronous})`);
    }
  } catch { /* yoksay */ }

  // ---- 2) Katalog kayıtları ----
  let satirlar = [];
  try {
    satirlar = s.prepare('SELECT id, ad, url, kategori, aktif, pasif_neden FROM radar_katalog').all();
  } catch (e) {
    hatalar.push(`radar_katalog okunamadı: ${String(e?.message || e).slice(0, 160)}`);
  }

  const toplam = satirlar.length;
  const aktifler = satirlar.filter(r => Number(r.aktif) === 1);
  const pasifler = satirlar.filter(r => Number(r.aktif) === 0);

  // ---- 3) Sıfır NULL URL ----
  const bosUrller = aktifler.filter(r => !r.url || !String(r.url).trim());
  if (bosUrller.length > 0) {
    hatalar.push(`${bosUrller.length} aktif ürünün URL'si boş (NULL): `
      + bosUrller.map(u => u.ad).join(', '));
  }

  // ---- 4) Gerekçesiz pasif ----
  const gerekcesiz = pasifler.filter(r => !r.pasif_neden || String(r.pasif_neden).trim().length < 5);
  if (gerekcesiz.length > 0) {
    hatalar.push(`${gerekcesiz.length} pasif ürünün pasif_neden açıklaması eksik: `
      + gerekcesiz.map(u => u.ad).join(', '));
  }

  // ---- 5) Kategori dağılımı ve asgari eşikler ----
  const dagilim = { filament: 0, yazici: 0, genel: 0 };
  for (const r of satirlar) {
    const k = String(r.kategori || 'genel').toLowerCase();
    dagilim[k] = (dagilim[k] || 0) + 1;
  }
  for (const [kategori, asgari] of Object.entries(KATALOG_ASGARI)) {
    if ((dagilim[kategori] || 0) < asgari) {
      hatalar.push(`Kategori kotası bozuk: ${kategori}=${dagilim[kategori] || 0} (asgari ${asgari})`);
    }
  }

  return {
    ok: hatalar.length === 0,
    toplam,
    aktif: aktifler.length,
    pasif: pasifler.length,
    bosUrlSayisi: bosUrller.length,
    gerekcesizPasifSayisi: gerekcesiz.length,
    dagilim,
    pragma,
    hatalar,
  };
}

/** Katalog kayıtları (aktif olanlar önce, `sira` artan). */export function katalogGetir({ sadeceAktif = false } = {}) {
  const sql = sadeceAktif
    ? 'SELECT * FROM radar_katalog WHERE aktif = 1 ORDER BY sira ASC, id ASC'
    : 'SELECT * FROM radar_katalog ORDER BY aktif DESC, sira ASC, id ASC';
  return veritabani().prepare(sql).all().map(satirCevir);
}

/**
 * Katalog kaydı ekler.
 *
 * SÖZLEŞME (2026-11-11): kanonik URL'si olmayan kayıt AKTİF olamaz.
 * URL boşsa kayıt pasif + gerekçeli eklenir; böylece radar her turda arama
 * motoruna düşüp 0 sonuçla zaman kaybetmez ve borsada ölü kart oluşmaz.
 * Panelden URL'siz ekleme artık sessizce bozuk kayıt üretmiyor.
 *
 * @returns {object} eklenen kayıt (aktif alanı false olabilir)
 */
export function katalogEkle({ ad, sorgu, url = null, kategori = 'genel', pasifNeden = null } = {}) {
  const temizAd = String(ad || '').replace(/\s+/g, ' ').trim();
  const temizSorgu = String(sorgu || temizAd).replace(/\s+/g, ' ').trim();
  const temizKategori = KATEGORILER.has(kategori) ? kategori : 'genel';
  if (temizAd.length < 2) throw new Error('Ürün adı en az 2 karakter olmalı.');
  if (temizAd.length > 160) throw new Error('Ürün adı en fazla 160 karakter olabilir.');
  if (temizSorgu.length < 2) throw new Error('Arama sorgusu en az 2 karakter olmalı.');

  const temizUrl = url ? String(url).trim() : '';
  if (temizUrl && !/^https?:\/\/[^\s]+$/i.test(temizUrl)) {
    throw new Error('Ürün URL\'si http(s) ile başlamalı.');
  }
  const aktif = temizUrl ? 1 : 0;
  const neden = pasifNeden
    ? String(pasifNeden).trim().slice(0, 300)
    : (aktif ? null : 'Kanonik ürün URL\'si girilmedi — radar taraması yapılmaz.');

  const s = veritabani();
  const enBuyuk = Number(s.prepare('SELECT MAX(sira) m FROM radar_katalog').get()?.m || 0);
  const bilgi = s.prepare(`
    INSERT INTO radar_katalog (ad, sorgu, url, kategori, aktif, sira, eklenme, pasif_neden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(temizAd, temizSorgu, temizUrl || null, temizKategori, aktif, enBuyuk + 1, Date.now(), neden);
  const row = s.prepare('SELECT * FROM radar_katalog WHERE id = ?').get(Number(bilgi.lastInsertRowid));
  return satirCevir(row);
}

/** Katalog kaydını siler. @returns {boolean} */
export function katalogSil(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return false;
  const s = veritabani();
  const r = s.prepare('DELETE FROM radar_katalog WHERE id = ?').run(n);
  s.prepare('DELETE FROM radar_durum WHERE katalog_id = ?').run(n);
  s.prepare('DELETE FROM radar_gecmis WHERE katalog_id = ?').run(n);
  return Number(r.changes || 0) > 0;
}

/** Katalogu varsayılana döndürür. */
export function katalogSifirla() {
  const s = veritabani();
  s.exec('DELETE FROM radar_katalog; DELETE FROM radar_durum; DELETE FROM radar_gecmis;');
  const ekle = s.prepare(`
    INSERT INTO radar_katalog (ad, sorgu, url, kategori, aktif, sira, eklenme)
    VALUES (?, ?, NULL, ?, 1, ?, ?)
  `);
  VARSAYILAN_KATALOG.forEach((k, i) => ekle.run(k.ad, k.sorgu, k.kategori, i, Date.now()));
  return katalogGetir();
}

function terfiUrlAnahtari(ham) {
  try {
    const u = new URL(String(ham || '').trim());
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return String(ham || '').trim().toLowerCase();
  }
}

function reddedilenTerfiSeti() {
  try {
    const s = veritabani();
    const row = s.prepare("SELECT value FROM settings WHERE key = 'seo_terfi_reddedilenler'").get();
    if (!row?.value) return new Set();
    const arr = JSON.parse(row.value);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function terfiKategoriTahmini(ad) {
  const metin = String(ad || '');
  if (parcaMi(metin) || /\b(nozzle|hotend|pei|tabla|anakart|motherboard|extruder|kurutucu|dryer|reçine|recine|resin)\b/i.test(metin)) {
    return 'genel';
  }
  if (/filament|\b(x?pla|pla\+|epla|petg|e?tpu|abs|asa)\b/i.test(metin)) return 'filament';
  if (/3d\s*yazıcı|3d\s*printer|yazıcı|printer/i.test(metin)) return 'yazici';
  return 'genel';
}

/**
 * Kullanıcı aramalarından (`snapshot` tablosu) oluşan gerçek ve en az `minStok`
 * mağazada stoklu sonuçları, zaten `radar_katalog`'da olmayanları ayıklayarak
 * yönetici onayı için terfi adayı olarak listeler.
 */
export function terfiAdaylariGetir({ minStok = 3, limit = 40 } = {}) {
  const s = veritabani();
  let mevcutlar = [];
  try {
    mevcutlar = katalogGetir();
  } catch { mevcutlar = []; }

  const mevcutAdSet = new Set(mevcutlar.map(k => adAnahtari(k.ad)));
  const mevcutUrlSet = new Set(mevcutlar.map(k => terfiUrlAnahtari(k.url)).filter(Boolean));
  const mevcutAdlar = mevcutlar.map(k => k.ad);
  const reddedilen = reddedilenTerfiSeti();

  let satirlar = [];
  try {
    satirlar = s.prepare(`
      SELECT anahtar, ts, urun, en_ucuz, en_ucuz_site, payload
      FROM snapshot
      ORDER BY ts DESC
      LIMIT 250
    `).all();
  } catch {
    return [];
  }

  const cikti = [];
  const gorulenSlug = new Set();

  for (const r of satirlar) {
    let payload = null;
    try { payload = JSON.parse(r.payload); } catch { continue; }
    const ad = String(r.urun || payload?.kaynak?.urun || '').replace(/\s+/g, ' ').trim();
    if (ad.length < 8 || ad.length > 140) continue;

    const url = String(payload?.kaynak?.url || '').trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) continue;

    const adKey = adAnahtari(ad);
    const urlKey = terfiUrlAnahtari(url);
    if (reddedilen.has(adKey) || reddedilen.has(String(r.anahtar))) continue;
    if (mevcutAdSet.has(adKey) || mevcutUrlSet.has(urlKey) || gorulenSlug.has(adKey)) continue;
    if (mevcutAdlar.some(m => titleSimilarity(m, ad) >= 0.85)) continue;

    const sonuclar = Array.isArray(payload?.sonuclar) ? payload.sonuclar : [];
    const stoklu = sonuclar.filter(x => (
      x?.status === 'found'
      && x?.product
      && x.product.inStock !== false
      && x.renkAyni !== false
      && Number(x.product.pricing?.toplam ?? x.product.sellingPrice) > 0
    ));
    if (stoklu.length < minStok) continue;

    stoklu.sort((a, b) => (
      Number(a.product.pricing?.toplam ?? a.product.sellingPrice)
      - Number(b.product.pricing?.toplam ?? b.product.sellingPrice)
    ));
    const enIyi = stoklu[0];
    const enUcuzFiyat = Number(enIyi.product.pricing?.toplam ?? enIyi.product.sellingPrice);
    if (!(enUcuzFiyat > 0)) continue;

    gorulenSlug.add(adKey);
    cikti.push({
      anahtar: r.anahtar,
      ad,
      sorgu: ad,
      url,
      kategori: terfiKategoriTahmini(ad),
      stokluSayi: stoklu.length,
      toplamMagaza: sonuclar.filter(x => x?.status === 'found').length,
      enUcuzFiyat: Math.round(enUcuzFiyat * 100) / 100,
      enUcuzSite: enIyi.siteName || enIyi.site || r.en_ucuz_site || '',
      gorsel: payload?.kaynak?.image || enIyi.product?.image || null,
      ts: Number(r.ts) || Date.now(),
    });
  }

  cikti.sort((a, b) => (b.stokluSayi - a.stokluSayi) || (b.ts - a.ts));
  return cikti.slice(0, limit);
}

/** İstenmeyen terfi adayını kalıcı olarak listeden gizler. */
export function terfiAdayiReddet(anahtarVeyaAd) {
  const temiz = adAnahtari(anahtarVeyaAd) || String(anahtarVeyaAd || '').trim();
  if (!temiz) return false;
  const s = veritabani();
  const mevcut = [...reddedilenTerfiSeti()];
  if (!mevcut.includes(temiz)) mevcut.push(temiz);
  const sinirli = mevcut.slice(-300);
  s.prepare(`
    INSERT INTO settings (key, value) VALUES ('seo_terfi_reddedilenler', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(sinirli));
  return true;
}

/* ------------------------------------------------------------------ */
/* Stok filtresi — "tükenen mağaza asla en ucuz olamaz"                */
/* ------------------------------------------------------------------ */

/** 3D Yazıcı veya Filament yerine yedek parça/aksesuar tekliflerini yakalayan regex */
const SATILAMAZ_PARCA_METIN = /\b(termistör|termistor|silikon\s*çorap|silikon\s*corap|çorap|corap|ısıtıcı\s*blok|isitici\s*blok|ısıtıcı\s*fişek|isitici\s*fisek|hotend|nozzle|nozül|nozul|tabla|pei|yay\s*çeliği|kayış|kayis|kasnak|step\s*motor|anakart|bltouch|sensör|sensor|prob|probe|fan|yedek\s*parça|yedek\s*parca|kablo|adaptör|adaptor|enclosed|enclosure|aksesuar|upgrade)\b/i;

/** Bir teklifin kayıt kategorisine (yazıcı / filament) uygunluğunu doğrular */
export function teklifKategoriyeUygunMu(r, kayit = null) {
  if (!r?.product) return false;
  const p = r.product;
  const fiyat = Number(p.pricing?.toplam ?? p.sellingPrice);
  const baslik = String(p.title || '');
  const kat = String(kayit?.kategori || '').toLowerCase();
  const kayitAd = String(kayit?.ad || '').toLowerCase();

  // 0) MODEL SERİSİ KİMLİĞİ (2026-11-04) — en son güvenlik ağı.
  // Katalog "Anycubic Kobra 2 Neo" iken teklif "Anycubic Kobra 4" ise bu teklif
  // KESİNLİKLE o ürün değildir; fiyat en ucuz olsa bile gösterilmez/linkle
  // yönlendirilmez. Kaynak hatalı çözülmüş olsa bile yanlış ürün satın
  // aldırılmaz: ürün "stokta teklif yok" olarak dürüstçe raporlanır.
  if (kayit?.ad && modelSerisiCakismasi(kayit.ad, baslik)) return false;

  // 1) 3D Yazıcı Kategorisi Kontrolü
  if (kat === 'yazici' || /yazıcı|yazici|printer/i.test(kayitAd)) {
    // 3D Yazıcı fiyatı 2000 TL'nin altında olamaz (parça/aksesuar kesinliği)
    if (fiyat < 2000) return false;
    // Başlıkta yedek parça sözcüğü geçiyorsa (hedef ürün açıkça parça istemedikçe) elenir
    if (SATILAMAZ_PARCA_METIN.test(baslik) && !SATILAMAZ_PARCA_METIN.test(kayitAd)) {
      return false;
    }
  }

  // 2) Filament Kategorisi Kontrolü
  if (kat === 'filament' || /filament|pla|petg|abs/i.test(kayitAd)) {
    // 1kg filament fiyatı 150 TL'nin altında olamaz (numune/nozzle kesinliği)
    if (fiyat < 150) return false;
    // Başlıkta yedek parça sözcüğü geçiyorsa elenir
    if (SATILAMAZ_PARCA_METIN.test(baslik) && !SATILAMAZ_PARCA_METIN.test(kayitAd)) {
      return false;
    }
    // Renk Uyuşmazlığı: Eğer kayıt açıkça belirli bir renk istiyorsa (ör. "Gri"),
    // adayın başlığında bu renk yoksa ve başka estetik renk (ör. "mermer", "siyah") geçiyorsa elenir
    if (/gri/i.test(kayitAd) && !/gri|grey|gray/i.test(baslik) && /mermer|marble|siyah|black|beyaz|white|kırmızı|red/i.test(baslik)) {
      return false;
    }
    if (/siyah/i.test(kayitAd) && !/siyah|black/i.test(baslik) && /beyaz|white|gri|grey|kırmızı|red/i.test(baslik)) {
      return false;
    }
    if (/beyaz/i.test(kayitAd) && !/beyaz|white/i.test(baslik) && /siyah|black|gri|grey|kırmızı|red/i.test(baslik)) {
      return false;
    }
  }

  return true;
}

/**
 * Teklif satın alınabilir mi? Yalnızca KANIT varsa eler.
 * @param {object} r pipeline sonuç satırı
 * @param {object|null} [kayit] katalog kaydı
 */
export function teklifStoktaMi(r, kayit = null) {
  if (!r || r.status !== 'found' || !r.product) return false;
  // Farklı renk/varyant "aynı ürün" sayılmaz (pipeline `renkAyni` üretir).
  if (r.renkAyni === false) return false;
  // Kategori ve parça uyumluluğu
  if (!teklifKategoriyeUygunMu(r, kayit)) return false;

  const p = r.product;
  const fiyat = Number(p.pricing?.toplam ?? p.sellingPrice);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return false;

  // 1) Açık stok bayrakları
  if (p.inStock === false) return false;
  if (p.stock === false || p.stock === 0 || p.stock === '0') return false;
  if (p.available === false || p.purchasable === false) return false;
  if (p.addToCart === false || p.satinAlinabilir === false) return false;
  if (p.outOfStock === true) return false;

  // 2) Şema.org availability
  const availability = String(p.availability || '').toLowerCase();
  if (availability && /outofstock|soldout|backorder|preorder/.test(availability)) return false;

  // 3) Metinsel stok etiketi ("Tükendi", "Gelince Haber Ver"…)
  const metin = [p.stokMetni, p.stockText, p.stockLabel, p.availabilityText, p.stokDurumu, p.stockStatus]
    .filter(Boolean).join(' ');
  if (metin && SATILAMAZ_METIN.test(metin)) return false;

  return true;
}

/** Teklifin karşılaştırma fiyatı (ödenecek tutar). */
function teklifFiyati(r) {
  const n = Number(r?.product?.pricing?.toplam ?? r?.product?.sellingPrice);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

/**
 * Stokta olan teklifler, fiyat artan sırada.
 * @param {object} sonuc runComparison çıktısı
 * @param {object|null} [kayit] katalog kaydı
 */
export function stokluTeklifler(sonuc, kayit = null) {
  return (sonuc?.sonuclar || [])
    .filter(r => teklifStoktaMi(r, kayit))
    .sort((a, b) => teklifFiyati(a) - teklifFiyati(b));
}

/** Bu turda kaç mağaza elendi (stok/fiyat nedeniyle)? */
export function elenenSayisi(sonuc, kayit = null) {
  const bulunan = (sonuc?.sonuclar || []).filter(r => r?.status === 'found' && r?.product);
  return bulunan.length - stokluTeklifler(sonuc, kayit).length;
}

/**
 * Kaynak ürün URL'si çözülemediğinde yazılacak "boş" durum (2026-11-04).
 *
 * Neden gerekli: eskiden bu durumda `radar_durum` tablosundaki ESKİ kayıt
 * olduğu gibi kalıyordu. Kaynak çözümlemesi bir turda yanlış ürünü seçmişse
 * (ör. "Kobra 2 Neo" → "Kobra X"), ürün sonraki turlarda bulunamasa bile
 * borsa ve Telegram o hatalı kartı göstermeye devam ediyordu. Artık kaynak
 * yoksa kart "stokta teklif yok" olarak dürüstçe güncellenir.
 *
 * @param {{id?:number, ad?:string, kategori?:string}} kayit
 */
export function kaynakYokDurumu(kayit = {}) {
  return {
    anahtar: `katalog:${kayit?.id ?? 'x'}`,
    katalogId: kayit?.id ?? null,
    ad: kayit?.ad || 'Ürün',
    kategori: kayit?.kategori || 'genel',
    urun: kayit?.ad || 'Ürün',
    kaynakUrl: null,
    bulundu: false,
    stokta: false,
    site: null,
    siteId: null,
    fiyat: null,
    hamUrl: null,
    afiliyeUrl: null,
    kargo: null,
    birimFiyat: null,
    birim: null,
    birimMetni: null,
    stokluSayisi: 0,
    tukenenSayisi: 0,
    bulunanSayisi: 0,
    digerleri: [],
    enPahaliFiyat: null,
    tasarruf: 0,
    kismi: false,
    taranmayan: 0,
    iptal: false,
    kaynakYok: true,
    ts: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Durum hesabı                                                        */
/* ------------------------------------------------------------------ */

/** Kart dili: "Kargo Bedava" → "Ücretsiz Kargo" (spec biçimi). */
function radarKargo(r) {
  const m = kargoMetni(r);
  if (/bedava/i.test(m)) return 'Ücretsiz Kargo';
  return m;
}

/**
 * Bir tarama sonucundan radar durumu üretir.
 * @param {{id:number, ad:string, kategori?:string}} kayit katalog kaydı
 * @param {object} sonuc runComparison çıktısı
 * @param {string} url taranan adres
 */
export function radarDurumuHesapla(kayit, sonuc, url) {
  let stoklu = stokluTeklifler(sonuc, kayit);
  // AYKIRI UCUZ TEKLİF KORUMASI (2026-11-04): 3D yazıcı kategorisinde aksesuar
  // (kabin, tabla, kit…) yazıcı fiyatı gibi görünebiliyor. Ölçülen hata:
  // "Bambu Lab A1/A1 Mini **Enclosed Kit**" ₺2.846, yazıcının kendisi ₺14.020.
  // Anahtar kelime listesi her aksesuarı yakalayamaz; bu yüzden fiyat
  // tutarlılığı da denetlenir: medyanın %50'sinin altındaki teklif elenir
  // (en az 3 stoklu teklif ve eleme sonrası en az 2 teklif kalmalı).
  if (String(kayit?.kategori || '').toLowerCase() === 'yazici' && stoklu.length >= 3) {
    const fiyatlar = stoklu.map(teklifFiyati).filter(f => Number.isFinite(f) && f > 0);
    if (fiyatlar.length >= 3) {
      const sirali = [...fiyatlar].sort((a, b) => a - b);
      const medyan = sirali[Math.floor(sirali.length / 2)];
      const filtrelenmis = stoklu.filter(x => teklifFiyati(x) >= medyan * 0.5);
      if (filtrelenmis.length >= 2 && filtrelenmis.length < stoklu.length) stoklu = filtrelenmis;
    }
  }
  const enIyi = stoklu[0] || null;
  const enPahali = stoklu.length ? stoklu[stoklu.length - 1] : null;
  const enIyiFiyat = enIyi ? teklifFiyati(enIyi) : null;
  const enPahaliFiyat = enPahali ? teklifFiyati(enPahali) : null;
  const baslik = enIyi?.product?.title || sonuc?.kaynak?.urun || kayit?.ad || 'Ürün';
  // Birim fiyat: önce mağazanın kendi başlığı. Başlıkta gramaj/hacim yoksa
  // (ör. "Creality Ender Fast PLA Filament - Grey") hedef ürünün katalog adı
  // ("… 1kg") yedek olarak kullanılır — aynı ürün olduğu için uydurma değildir.
  // Mağaza başlığında FARKLI bir gramaj varsa (500 g gibi) yedek DEVREYE GİRMEZ.
  let birim = enIyi ? birimFiyatHesapla(baslik, enIyiFiyat) : null;
  if (!birim && enIyi && kayit?.ad && kayit.ad !== baslik) {
    birim = birimFiyatHesapla(`${baslik} ${kayit.ad}`, enIyiFiyat);
  }
  const taranmayan = Number(sonuc?.ozet?.taranmayanSiteSayisi || 0);
  const iptal = sonuc?.ozet?.iptalEdildi === true;
  const bulunanSayisi = (sonuc?.sonuclar || [])
    .filter(r => r?.status === 'found' && r?.product).length;

  const digerleri = stoklu.slice(1, 5).map(r => ({
    site: r.siteName || r.site,
    siteId: r.site,
    fiyat: teklifFiyati(r),
    kargo: radarKargo(r),
  }));

  const hamUrl = enIyi?.product?.url || null;
  const afiliyeUrl = enIyi
    ? (enIyi.product.afiliyeUrl || guvenliAfiliye(enIyi.site, hamUrl))
    : null;

  return {
    anahtar: `katalog:${kayit?.id ?? 'x'}`,
    katalogId: kayit?.id ?? null,
    slug: slugYap(kayit?.ad || baslik),
    ad: kayit?.ad || baslik,
    kategori: kayit?.kategori || 'genel',
    urun: baslik,
    kaynakUrl: url,
    bulundu: bulunanSayisi > 0,
    stokta: !!enIyi,
    site: enIyi ? (enIyi.siteName || enIyi.site) : null,
    siteId: enIyi?.site || null,
    fiyat: enIyiFiyat,
    hamUrl,
    afiliyeUrl,
    kargo: enIyi ? radarKargo(enIyi) : null,
    birimFiyat: birim?.birimFiyat ?? null,
    birim: birim?.birim ?? null,
    birimMetni: birim
      ? `${para(birim.birimFiyat)} / ${birim.birim === 'L' ? 'L' : 'kg'}`
      : null,
    stokluSayisi: stoklu.length,
    tukenenSayisi: Math.max(0, bulunanSayisi - stoklu.length),
    bulunanSayisi,
    digerleri,
    enPahaliFiyat,
    tasarruf: (enIyiFiyat != null && enPahaliFiyat != null)
      ? Math.round((enPahaliFiyat - enIyiFiyat) * 100) / 100
      : 0,
    kismi: iptal || taranmayan > 0,
    taranmayan,
    iptal,
    // V2 sahte indirim dedektoru (2026-11-05): kazanan teklifin etiket
    // denetimi + urunun gercek fiyat gecmisi. Gecmis yoksa null (rozet yok).
    sahteIndirim: enIyi?.sahteIndirim || null,
    fiyatAnalizi: sonuc?.ozet?.fiyatAnalizi || null,
    ts: Date.now(),
  };
}

function guvenliAfiliye(siteId, url) {
  try {
    return afiliyeLink(siteId, url, afiliyeAyarlari());
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/* Bildirim kararı                                                     */
/* ------------------------------------------------------------------ */

/**
 * Bu durum Telegram'a gönderilmeli mi? (Anti-Flapping sürümü — 2026-11-11)
 *
 * ÖLÇÜLEN SORUN: Creality Ender PLA 30, Microzey PLA 50 kez gönderilmişti.
 * İki kök neden:
 *  1. `yeni.fiyat < eski - 0.005` → 1 kuruşluk düşüş bile bildirim atıyordu.
 *  2. `siteId` değişti diye bildirim atılıyordu; adaptör 1 tur gecikince
 *     "en ucuz mağaza değişti" → ertesi tur geri dönünce "fiyat düştü":
 *     mağaza ping-pong'u günde 5 kez spam üretiyordu.
 *
 * KURALLAR
 *  1. Son 24 saatte bildirim gittiyse **en az %4** indirim şartı.
 *  2. Mağaza değişimi + fiyat ARTIŞI → asla bildirim yok.
 *  3. Ping-pong: 24 saat içinde daha önce bildirilmiş mağazaya geri dönüş,
 *     o mağazanın eski fiyatından daha ucuz değilse → iptal.
 *  4. 24 saatten uzun sessizlikte: anlamlı düşüş (≥%1,5 veya ≥10 TL) olmalı;
 *     yoksa yalnızca `paylasimAraligiSaat` (varsayılan 48 sa) özeti.
 *
 * @param {object} yeni güncel durum
 * @param {object|null} eski önceki durum (veri JSON'u)
 * @param {{
 *   paylasimAraligiSaat?:number, simdi?:number,
 *   sonGonderimler?:Array<{siteId?:string, site?:string, fiyat?:number, ts?:number}>
 * }} [opts]
 *   `sonGonderimler`: radar_gonderim geçmişi (yeniden eskiye). Kural 3 için.
 * @returns {{gonder:boolean, neden:string, oncelik:number}}
 */
export function bildirimKarari(yeni, eski, opts = {}) {
  const saat = Number.isFinite(Number(opts.paylasimAraligiSaat))
    ? Number(opts.paylasimAraligiSaat) : RADAR_VARSAYILAN.paylasimAraligiSaat;
  const simdi = Number.isFinite(opts.simdi) ? opts.simdi : Date.now();
  const SAAT_MS = 3600 * 1000;
  const GUN_MS = 24 * SAAT_MS;

  // Stokta geçerli teklif yoksa asla gönderilmez.
  if (!yeni || yeni.stokta !== true || !Number.isFinite(Number(yeni.fiyat)) || Number(yeni.fiyat) <= 0) {
    return { gonder: false, neden: 'stokta satın alınabilir teklif yok', oncelik: 0 };
  }
  if (!eski) return { gonder: true, neden: 'ilk tespit', oncelik: 3 };
  if (eski.stokta !== true) {
    return { gonder: true, neden: 'ürün yeniden stokta', oncelik: 4 };
  }

  const yeniFiyat = Number(yeni.fiyat);
  const eskiFiyat = Number(eski.fiyat);
  const sonPaylasim = Number(eski.paylasimTs) || 0;
  const gecenMs = sonPaylasim > 0 ? (simdi - sonPaylasim) : Infinity;

  // "Son PAYLAŞILAN fiyat": paylaşım anındaki fiyat biliniyorsa o, yoksa son gözlem.
  const paylasilanFiyat = Number(eski.paylasimFiyati) > 0
    ? Number(eski.paylasimFiyati) : eskiFiyat;

  const siteDegisti = String(yeni.siteId || '') !== String(eski.siteId || '');

  // ---- KURAL 3: Ping-pong (A → B → A) koruması ----
  // Son gönderim B ise ve A daha önce (24 sa içinde) bildirilmişse, A'ya dönüş
  // ancak A'nın o zamanki fiyatından DAHA UCUZsa bildirilir.
  // Not: radar_gonderim `site` (mağaza ADI) saklıyor; kimlik karşılaştırması
  // hem siteId hem ad üzerinden yapılır (panelden gelen adlar da eşleşsin).
  const gecmis = Array.isArray(opts.sonGonderimler) ? opts.sonGonderimler : [];
  if (siteDegisti && gecmis.length >= 1) {
    const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR');
    const yeniAnahtar = new Set([norm(yeni.siteId), norm(yeni.site)].filter(Boolean));
    const ayniMi = (g) => yeniAnahtar.has(norm(g?.siteId)) || yeniAnahtar.has(norm(g?.site));
    const gecerli = gecmis.filter(g => Number(g?.ts) > 0 && (simdi - Number(g.ts)) < GUN_MS);
    const sonuncu = gecerli[0];
    if (yeniAnahtar.size && sonuncu && !ayniMi(sonuncu)) {
      const ayniSite = gecerli.find((g, i) => i > 0 && ayniMi(g)
        && Number.isFinite(Number(g.fiyat)));
      if (ayniSite && !(yeniFiyat < Number(ayniSite.fiyat) - 0.005)) {
        return {
          gonder: false,
          neden: 'mağaza ping-pong (dalgalanma) koruması: daha önce bildirilen mağaza daha pahalı',
          oncelik: 0,
        };
      }
    }
  }

  // ---- KURAL 2: Mağaza değişiminde fiyat artışı ASLA bildirilmez ----
  // (24 saat içinde de dışında da geçerli: adaptör gecikmesi "fırsat" değildir.)
  if (siteDegisti && yeniFiyat > eskiFiyat + 0.005) {
    return {
      gonder: false,
      neden: 'yeni mağaza daha pahalı, bildirim engellendi',
      oncelik: 0,
    };
  }

  // ---- KURAL 1: 24 saatlik cooldown → yalnızca %4+ derin indirim ----
  if (sonPaylasim > 0 && gecenMs < GUN_MS) {
    const esik = paylasilanFiyat * 0.96;
    if (Number.isFinite(paylasilanFiyat) && paylasilanFiyat > 0 && yeniFiyat <= esik) {
      const yuzde = Math.round(((paylasilanFiyat - yeniFiyat) / paylasilanFiyat) * 1000) / 10;
      return {
        gonder: true,
        neden: `derin fiyat düşüşü (%${yuzde})`,
        oncelik: 5,
      };
    }
    return {
      gonder: false,
      neden: '24 saatlik anti-flapping koruması (%4 indirim eşiği aşılmadı)',
      oncelik: 0,
    };
  }

  // ---- 24 saatten uzun sessizlik ----
  // Anlamlı düşüş eşiği: en az %1,5 VE en az 10 TL (kuruş dalgalanması değil).
  const anlamliEsik = Math.max(10, eskiFiyat * 0.015);
  if (Number.isFinite(eskiFiyat) && yeniFiyat < eskiFiyat - anlamliEsik) {
    return { gonder: true, neden: 'fiyat düştü', oncelik: 5 };
  }

  if (siteDegisti) {
    if (yeniFiyat < eskiFiyat) {
      return { gonder: true, neden: 'daha ucuz yeni mağaza bulundu', oncelik: 4 };
    }
    if (yeniFiyat > eskiFiyat) {
      return { gonder: false, neden: 'yeni mağaza daha pahalı, bildirim engellendi', oncelik: 0 };
    }
    // Fiyat birebir aynı: mağaza değişikliği tek başına fırsat değildir.
    return { gonder: false, neden: 'mağaza değişti ama fiyat daha ucuz değil', oncelik: 0 };
  }

  // İlk paylaşım (paylaşım zamanı hiç yok) → gönder.
  if (!sonPaylasim) {
    return { gonder: true, neden: 'ilk paylaşım', oncelik: 3 };
  }

  // ---- KURAL 4: Düzenli özet (varsayılan 48 sa) ----
  if (gecenMs >= saat * SAAT_MS) {
    return { gonder: true, neden: `${saat} saatlik özet süresi doldu`, oncelik: 2 };
  }
  return { gonder: false, neden: 'değişiklik yok (cooldown)', oncelik: 0 };
}

/* ------------------------------------------------------------------ */
/* Kart ve Telegram                                                    */
/* ------------------------------------------------------------------ */

/**
 * Ürün adı + kategoriye göre Telegram kartı ikonu (seed v7).
 *
 * 2026-11-11: Katalog PETG/TPU/reçine/nozzle/kurutucu ile genişledi; tek
 * "🧵 / 🖨️" ayrımı yetersizdi. Sıra önemli: kategori 'filament' olsa bile
 * TPU/PETG kendi ikonunu alır; reçine/nozzle/kurutucu 'genel' kategorisinde
 * olduğundan ada göre sezgisel eşleşir.
 *
 * @param {{kategori?:string, ad?:string, urun?:string}} [d]
 * @returns {string} emoji
 */
export function urunIkonu(d) {
  const ad = String(d?.ad || d?.urun || '');
  if (d?.kategori === 'yazici') return '🖨️';
  if (d?.kategori === 'filament') {
    if (/tpu|esnek/i.test(ad)) return '🌀';
    if (/petg/i.test(ad)) return '💎';
    return '🧵';
  }
  if (/recine|reçine|resin/i.test(ad)) return '🧪';
  if (/nozzle|hotend|nozul|nozül/i.test(ad)) return '🔧';
  if (/kurutucu|ebox|filadryer|dryer|spacepi|space pi/i.test(ad)) return '♨️';
  return '⚙️';
}

/**
 * Spec'teki kart biçimi. Tüm metin `esc()` ile kaçırılır.
 * @param {object} d radar durumu
 */
export function radarKartOlustur(d) {
  const ad = esc(d?.ad || d?.urun || 'Ürün');
  const ikon = urunIkonu(d);
  if (!d?.stokta) {
    return [
      '🎯 <b>OTONOM FİYAT RADARI</b>',
      CIZGI,
      `${ikon} <b>${ad}</b>`,
      CIZGI,
      '⚠️ <b>Stokta satın alınabilir teklif yok.</b>',
      d?.kismi
        ? `ℹ️ Tarama kısmi (${Number(d.taranmayan) || 0} site yanıt vermedi); sonuç bu turda kesinleşmedi.`
        : `${Number(d?.tukenenSayisi) || 0} mağaza tükendi/stokta yok olarak elendi.`,
      'Bir sonraki turda yeniden denenecek.',
    ].join('\n');
  }

  const satirlar = [
    '🎯 <b>OTONOM FİYAT RADARI: GÜNCEL EN UCUZ</b>',
    CIZGI,
    `${ikon} <b>${ad}</b>`,
    CIZGI,
    `🏆 Stoktaki En Ucuz: <b>${para(d.fiyat)}</b>`,
    `🏪 Mağaza: ${esc(d.site || '—')}`,
    `🚚 Kargo: ${esc(d.kargo || 'Bilinmiyor')}`,
  ];
  if (d.birimMetni) satirlar.push(`⚖️ Birim Fiyat: ${esc(d.birimMetni)}`);
  satirlar.push('✅ Stok Durumu: Doğrulandı — Satın Alınabilir');
  satirlar.push(d.tukenenSayisi > 0
    ? `<i>(⚠️ ${d.tukenenSayisi} tükenen/stokta olmayan mağaza elendi)</i>`
    : '<i>(✅ Tüm mağazalar stokta)</i>');

  if (d.digerleri?.length) {
    satirlar.push(CIZGI, '📊 <b>Diğer Stoklu Seçenekler:</b>');
    for (const x of d.digerleri) {
      satirlar.push(`• ${esc(x.site)}: ${para(x.fiyat)}`);
    }
  }

  // 🚨 V2 PİYASA ANALİZİ (2026-11-05)
  // Yalnızca GERÇEK geçmişten doğrulanmış iddialar yazılır; veri yoksa satır yok.
  const si = d.sahteIndirim || null;
  if (si?.sahteIndirim) {
    satirlar.push(CIZGI);
    satirlar.push(`⚠️ <b>Etiket Analizi:</b> Mağazanın iddia ettiği indirim `
      + `(%${Number(si.iddiaEdilenIndirim) || 0}) yapaydır. `
      + `Son ${Number(si.pencereAdi) || 30} günün gerçek piyasa ortalaması `
      + `<b>${para(si.ortFiyat30)}</b>.`);
    satirlar.push(`💸 <i>Gerçek tasarruf: %${Number(si.gercekTasarruf) || 0}</i>`);
  }
  if (si?.gercekFirsat) {
    satirlar.push(`🔥 <b>Piyasa Analizi:</b> 🟢 Tarihi Dip Seviye! `
      + `Son 90 günün en düşük fiyatı yakalandı.`);
  }

  satirlar.push(CIZGI);
  if (d.tasarruf > 0.5) {
    satirlar.push(`💡 Diğer mağazalara göre <b>${para(d.tasarruf)}</b> tasarruf!`);
  } else if (d.stokluSayisi <= 1) {
    satirlar.push('💡 Bu ürün için stokta tek mağaza var.');
  } else {
    satirlar.push('💡 Stoklu mağazalar arasında fiyat farkı yok.');
  }
  if (d.kismi) {
    satirlar.push(`ℹ️ <i>Kısmi tarama: ${Number(d.taranmayan) || 0} site yanıt vermedi.</i>`);
  }
  const karsilastirUrl = kanonikUrunUrl(d);
  if (karsilastirUrl) {
    satirlar.push(`📊 Tüm mağazaları karşılaştır: ${esc(karsilastirUrl)}`);
  }
  satirlar.push('', '⚡ @BaskiHesap | Otonom Fiyat Radarı');
  return satirlar.join('\n');
}

/**
 * Telegram isteğini hazırlar (kuru testlerde ağ isteği atılmaz).
 * @param {object} d
 * @param {{chatId?:string}} [opts]
 */
export function radarTelegramIstegi(d, opts = {}) {
  const metin = radarKartOlustur(d);
  const satirlar = [];
  if (d?.stokta && d.afiliyeUrl) {
    satirlar.push([{ text: '🛒 Stoktaki En Ucuz Mağazaya Git', url: d.afiliyeUrl }]);
  }
  if (d?.kaynakUrl) {
    satirlar.push([{
      text: '🌐 Karşılaştırmayı Aç',
      url: `${config.publicUrl}/?url=${encodeURIComponent(d.kaynakUrl)}`,
    }]);
  }
  // Kişisel alarm: karta basan kullanıcı için `tracked` kaydı oluşturur.
  if (d?.stokta && d?.katalogId != null) {
    satirlar.push([{
      text: '🔔 Fiyatı Takibe Al',
      callback_data: `alarm:takip:radar:${Number(d.katalogId)}`,
    }]);
  }
  return {
    yontem: 'sendMessage',
    body: {
      chat_id: opts.chatId || '',
      text: metin.length > 4000 ? metin.slice(0, 3990) + '…' : metin,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(satirlar.length ? { reply_markup: { inline_keyboard: satirlar } } : {}),
    },
  };
}

/** Hedef sohbet: radar.chatId → telegram.chatId → firsat.kanal. */
function hedefSohbet(ayar, s) {
  const raw = String(
    ayar.chatId || s.telegram?.chatId || s.firsat?.kanal || '',
  ).trim();
  return temizChatId(raw);
}

/**
 * Kartı Telegram'a gönderir.
 * @param {object} d radar durumu
 * @param {{kuru?:boolean, chatId?:string, botToken?:string}} [opts]
 */
export async function radarGonder(d, opts = {}) {
  const s = getSettings();
  const ayar = radarAyar();
  const token = opts.botToken || s.telegram?.botToken;
  const chatId = temizChatId(opts.chatId || hedefSohbet(ayar, s));
  const kuru = opts.kuru === true;

  const istek = radarTelegramIstegi(d, { chatId: chatId || 'mock-kanal' });
  // 📈 Trend grafiği: en az 2 gerçek fiyat noktası varsa PNG üretilir.
  let png = null;
  try { png = radarGrafik(d); } catch { png = null; }
  if (kuru) return { ok: true, mock: true, ...istek, grafik: png ? { bayt: png.length } : null };

  if (!token) throw new Error('Telegram Bot Token tanımlı değil (Ayarlar → Telegram).');
  if (!chatId) {
    throw new Error('Radar bildirimi için sohbet kimliği yok (Ayarlar → Radar sohbeti / Telegram Chat ID).');
  }

  // Fotoğraflı kart (caption + aynı inline butonlar). Gönderim başarısız olursa
  // metin kartına düşülür; bildirim asla sessizce kaybolmaz.
  if (png) {
    try {
      const r = await fotoGonder(token, chatId, png, istek.body.text, {
        replyMarkup: istek.body.reply_markup,
        dosyaAdi: `fiyat-trendi-${Number(d.katalogId) || 'x'}.png`,
      });
      const wa = await whatsappKopyaGonder(d).catch(() => null);
      return {
        ok: true, yontem: 'sendPhoto', messageId: r.messageId, grafik: true,
        whatsapp: wa || undefined,
      };
    } catch (e) {
      console.warn('[radar] fotoğraflı kart gönderilemedi, metin kartına dönülüyor:',
        String(e?.message || e).slice(0, 160));
    }
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(istek.body),
    signal: AbortSignal.timeout(20000),
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok || veri.ok === false) {
    const desc = String(veri.description || res.status).slice(0, 180);
    let ipucu = '';
    if (/chat not found/i.test(desc)) {
      ipucu = ' — botu sohbete ekleyip "Mesaj Gönderme" yetkisi verin.';
    }
    throw new Error('Telegram API hatası: ' + desc + ipucu);
  }
  const wa = await whatsappKopyaGonder(d).catch(() => null);
  return {
    ok: true, yontem: 'sendMessage', messageId: veri.result?.message_id ?? null,
    whatsapp: wa || undefined,
  };
}

/**
 * Aynı radar kartını WhatsApp fırsat kanalına gönderir (2026-11-05).
 *
 * İZOLASYON: bu fonksiyon ASLA fırlatmaz; hata `{ok:false, hata}` döner.
 * WhatsApp sağlayıcısı çökse bile Telegram bildirimi ve radar taraması devam eder.
 *
 * @param {object} d radar durumu
 * @param {{kuru?:boolean, imageUrl?:string}} [opts]
 */
export async function whatsappKopyaGonder(d, opts = {}) {
  try {
    const s = getSettings();
    const wa = s.whatsapp || {};
    if (wa.firsatKanalEnabled !== true) {
      return { ok: false, atlandi: true, hata: 'WhatsApp fırsat kanalı kapalı.' };
    }
    if (!wa.channelId) {
      return { ok: false, atlandi: true, hata: 'WhatsApp kanal ID tanımlı değil.' };
    }
    if (!d?.stokta) {
      return { ok: false, atlandi: true, hata: 'Stokta teklif yok; WhatsApp bildirimi gönderilmez.' };
    }

    const kart = whatsappKartOlustur(d);
    if (!kart) return { ok: false, hata: 'WhatsApp kartı üretilemedi.' };

    // Resim: yalnızca GERÇEK bir görsel adresi varsa (uydurma görsel yok).
    let imageUrl = opts.imageUrl || d.gorselUrl || null;
    if (imageUrl && wa.resimliGonder !== true) imageUrl = null;

    const sonuc = await whatsappKanalGonder(kart, {
      ayar: wa, imageUrl, kuru: opts.kuru === true,
    });

    if (!sonuc.ok) {
      console.warn('[radar] WhatsApp gönderimi başarısız (akış devam ediyor):',
        String(sonuc.hata || '').slice(0, 160));
    }
    return sonuc;
  } catch (e) {
    console.warn('[radar] WhatsApp kancası hata verdi (akış devam ediyor):',
      String(e?.message || e).slice(0, 160));
    return { ok: false, hata: String(e?.message || e).slice(0, 200) };
  }
}


/* ------------------------------------------------------------------ */
/* Durum deposu                                                        */
/* ------------------------------------------------------------------ */

function durumOku(anahtar) {
  try {
    const r = veritabani().prepare('SELECT veri FROM radar_durum WHERE anahtar = ?').get(anahtar);
    if (!r?.veri) return null;
    const v = JSON.parse(r.veri);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Radar kartındaki `🔔 Fiyatı Takibe Al` butonu için son durum kaydı.
 * Buton callback'i yalnızca katalog id'sini taşır; ürün/fiyat/URL buradan
 * okunur (bot yeniden başlasa da çalışır).
 * @param {number|string} katalogId
 */
export function radarDurumVerisi(katalogId) {
  const id = Number(katalogId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return durumOku(`katalog:${id}`);
}

function durumYaz(d) {
  try {
    veritabani().prepare(`
      INSERT INTO radar_durum
        (anahtar, katalog_id, urun, site, site_id, fiyat, stokta, ts, paylasim_ts, veri)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anahtar) DO UPDATE SET
        katalog_id = excluded.katalog_id,
        urun = excluded.urun,
        site = excluded.site,
        site_id = excluded.site_id,
        fiyat = excluded.fiyat,
        stokta = excluded.stokta,
        ts = excluded.ts,
        paylasim_ts = excluded.paylasim_ts,
        veri = excluded.veri
    `).run(
      d.anahtar, d.katalogId ?? null, d.ad || d.urun || '', d.site || null, d.siteId || null,
      d.fiyat ?? null, d.stokta ? 1 : 0, d.ts || Date.now(), d.paylasimTs ?? null,
      JSON.stringify(d),
    );
    gecmiseYaz(d);
    return true;
  } catch {
    return false;
  }
}

/**
 * Trend grafiği için geçmişe nokta ekler.
 * Gürültüyü önlemek için: fiyat/stok değişmediyse en fazla saatte 1 kayıt.
 * @param {object} d radar durumu
 */
function gecmiseYaz(d) {
  const id = Number(d?.katalogId);
  if (!Number.isFinite(id) || id <= 0) return;
  const ts = Number(d.ts) || Date.now();
  const fiyat = Number.isFinite(Number(d.fiyat)) ? Number(d.fiyat) : null;
  const stokta = d.stokta ? 1 : 0;
  try {
    const s = veritabani();
    const son = s.prepare(`
      SELECT ts, fiyat, stokta FROM radar_gecmis
      WHERE katalog_id = ? ORDER BY ts DESC LIMIT 1
    `).get(id);
    const ayni = son
      && Number(son.stokta) === stokta
      && (son.fiyat == null ? fiyat == null : Math.abs(Number(son.fiyat) - Number(fiyat)) < 0.009);
    if (ayni && ts - Number(son.ts) < 3600000) return; // saatlik örnekleme
    s.prepare(`
      INSERT INTO radar_gecmis (katalog_id, ts, fiyat, site, stokta)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, ts, fiyat, d.site || null, stokta);
  } catch { /* geçmiş yazılamazsa bildirim akışı bozulmaz */ }
}

/**
 * Bir katalog ürününün gerçek fiyat geçmişi (grafik için).
 * @param {number|string} katalogId
 * @param {{gun?:number, limit?:number}} [opts]
 * @returns {Array<{ts:number, fiyat:number}>}
 */
export function radarSerisi(katalogId, opts = {}) {
  const id = Number(katalogId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const gun = Number.isFinite(opts.gun) ? opts.gun : 90;
  const limit = Number.isFinite(opts.limit) ? opts.limit : 400;
  const esik = Date.now() - Math.max(1, gun) * 86400000;
  try {
    const s = veritabani();
    const noktalar = s.prepare(`
      SELECT ts, fiyat FROM radar_gecmis
      WHERE katalog_id = ? AND fiyat IS NOT NULL AND fiyat > 0 AND ts >= ?
      ORDER BY ts ASC LIMIT ?
    `).all(id, esik, Math.max(2, limit))
      .map(r => ({ ts: Number(r.ts), fiyat: Number(r.fiyat) }));

    // Daha uzun geçmiş: aynı ürünün web taramalarından gelen `price_history`.
    // Ürün kimliği radar durumunda `pid` olarak saklanır.
    const pid = durumOku(`katalog:${id}`)?.pid;
    if (pid) {
      try {
        const ph = s.prepare(`
          SELECT ts, MIN(COALESCE(net_price, price)) fiyat
          FROM price_history
          WHERE product_id = ? AND ts >= ? AND COALESCE(net_price, price) > 0
          GROUP BY ts ORDER BY ts ASC LIMIT ?
        `).all(String(pid), new Date(esik).toISOString(), Math.max(2, limit));
        for (const r of ph) {
          const ts = Date.parse(r.ts);
          if (Number.isFinite(ts)) noktalar.push({ ts, fiyat: Number(r.fiyat) });
        }
      } catch { /* tablo yoksa yalnızca radar geçmişi kullanılır */ }
    }

    return fiyatSerisi(noktalar, { gun }).slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Radar kartı için trend grafiği (PNG). Yeterli geçmiş yoksa `null`.
 * @param {object} d
 * @returns {Buffer|null}
 */
export function radarGrafik(d) {
  if (!d?.stokta || d?.katalogId == null) return null;
  try {
    // 2026-11-03: grafik üretimi tek modülde toplandı (`fiyatGrafik.js`).
    // Aynı gerçek veri kaynakları (radar_gecmis + price_history) kullanılır;
    // 2'den az gözlem varsa null → çağıran metin kartına düşer.
    return fiyatGrafigiUret({ katalogId: d.katalogId })?.png || null;
  } catch {
    return null;
  }
}

/**
 * Bir ürünün son bildirim geçmişi (yeniden eskiye).
 *
 * Anti-flapping Kural 3 (ping-pong) bu listeye bakar: A → B → A döngüsünde
 * A'ya dönüş, A'nın eski fiyatından ucuz değilse bildirilmez.
 *
 * @param {string} anahtar `katalog:<id>`
 * @param {{limit?:number, sadeceBasari?:boolean}} [opts]
 * @returns {Array<{siteId:string|null, site:string|null, fiyat:number|null, ts:number}>}
 */
export function sonGonderimler(anahtar, opts = {}) {
  const limit = Math.max(1, Math.min(20, Number(opts.limit) || 3));
  const sadeceBasari = opts.sadeceBasari !== false;
  try {
    const sql = sadeceBasari
      ? "SELECT site, fiyat, ts FROM radar_gonderim WHERE anahtar = ? AND durum = 'gonderildi' ORDER BY ts DESC, id DESC LIMIT ?"
      : 'SELECT site, fiyat, ts FROM radar_gonderim WHERE anahtar = ? ORDER BY ts DESC, id DESC LIMIT ?';
    return veritabani().prepare(sql).all(String(anahtar), limit).map(r => ({
      // radar_gonderim.site SİTE ADI tutuyor; siteId alanı yok → ad üzerinden eşleşir.
      site: r.site || null,
      siteId: r.site || null,
      fiyat: Number.isFinite(Number(r.fiyat)) ? Number(r.fiyat) : null,
      ts: Number(r.ts) || 0,
    }));
  } catch {
    return [];
  }
}

function gonderimYaz(d, durum, { neden = null, mesajId = null, hata = null, ts = Date.now() } = {}) {  try {
    veritabani().prepare(`
      INSERT INTO radar_gonderim (anahtar, urun, site, fiyat, ts, durum, neden, mesaj_id, hata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.anahtar, d.ad || d.urun || null, d.site || null, d.fiyat ?? null,
      ts, durum, neden, mesajId != null ? String(mesajId) : null, hata,
    );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Tarama                                                              */
/* ------------------------------------------------------------------ */

const bekle = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));

/**
 * Katalogu tarar. Sıralı çalışır (CPU/istek dostu), ürünler arasında
 * `urunArasiMs` nefes payı bırakır.
 *
 * @param {{gonder?:boolean, kuru?:boolean, zorla?:boolean, limit?:number,
 *          urunArasiMs?:number, chatId?:string, botToken?:string, simdi?:number}} [opts]
 */
export async function radarTara(opts = {}) {
  if (calisiyor) return { atlandi: true, neden: 'tarama zaten çalışıyor', ilerleme: { ...ILERLEME } };

  const ayar = radarAyar();
  if (!ayar.enabled && opts.zorla !== true) {
    return { atlandi: true, neden: 'otonom radar kapalı', ayar };
  }

  const gonder = opts.gonder !== false;
  const kuru = opts.kuru === true;
  const urunArasiMs = Number.isFinite(Number(opts.urunArasiMs))
    ? Number(opts.urunArasiMs) : ayar.urunArasiMs;
  const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
    ? Math.floor(Number(opts.limit)) : null;

  let katalog = katalogGetir({ sadeceAktif: true });
  // Tek ürün taraması (2026-11-10): yönetici "şu ürünü şimdi yenile" diyebilsin
  // ve doğrulama testleri tüm kataloğu taramak zorunda kalmasın.
  if (Number.isFinite(Number(opts.urunId)) && Number(opts.urunId) > 0) {
    katalog = katalog.filter(k => k.id === Number(opts.urunId));
    if (!katalog.length) {
      return { atlandi: true, neden: 'ürün bulunamadı ya da pasif', urunId: Number(opts.urunId) };
    }
  }
  if (limit) katalog = katalog.slice(0, limit);

  calisiyor = true;
  const basladi = Date.now();
  ILERLEME.calisiyor = true;
  ILERLEME.basladi = new Date(basladi).toISOString();
  ILERLEME.toplam = katalog.length;
  ILERLEME.tamamlanan = 0;
  ILERLEME.sonUrun = null;
  ILERLEME.hatalar = 0;

  const rapor = {
    tamam: true,
    sureMs: 0,
    katalogSayisi: katalog.length,
    taranan: 0,
    stoktaBulunan: 0,
    gonderilen: 0,
    atlanan: 0,
    hatalar: [],
    sonuclar: [],
  };

  try {
    for (let i = 0; i < katalog.length; i++) {
      const k = katalog[i];
      if (i > 0 && urunArasiMs > 0) await bekle(urunArasiMs);

      ILERLEME.sonUrun = k.ad;
      let url = k.url || null;
      try {
        if (!url) {
          const bulunan = await hizliKaynakUrunBul(k.sorgu);
          url = bulunan?.url || null;
        }
        if (!url) {
          rapor.sonuclar.push({ ad: k.ad, durum: 'bulunamadi' });
          rapor.atlanan++;
          // 2026-11-04: kaynak bulunamadığında ESKİ durum kaydı KALMAMALI.
          // Aksi hâlde borsa/Telegram eski (ve hatalı olabilecek) ürünü
          // göstermeye devam ediyordu — "Kobra 2 Neo" kartı "Kobra 4" linkiyle.
          durumYaz(kaynakYokDurumu(k));
          continue;
        }

        const sonuc = await runComparison(url);
        rapor.taranan++;
        // Inline mode + SWR için gerçek tarama sonucunu önbelleğe yaz.
        try { anlikYaz(url, sonuc, { urun: k.ad }); } catch { /* önbellek opsiyonel */ }
        // Web 30 günlük fiyat grafiği de radar taramalarından beslenir.
        let pid = null;
        try {
          pid = sonuc?.kaynak?.modelKodu || sonuc?.kaynak?.barcode || sonuc?.kaynak?.urun || null;
          if (pid) {
            for (const s of sonuc?.sonuclar || []) {
              if (s.status !== 'found' || !s.product) continue;
              const pr = s.product.pricing || {};
              const urunFiyati = pr.araToplam ?? s.product.sellingPrice ?? null;
              const odenecek = pr.toplam ?? s.product.sellingPrice ?? null;
              if (odenecek == null || !Number.isFinite(Number(odenecek))) continue;
              addPricePoint({
                productId: pid, site: s.site,
                price: urunFiyati != null ? urunFiyati : odenecek,
                netPrice: odenecek,
              });
            }
          }
        } catch { /* fiyat geçmişi opsiyonel */ }

        const durum = radarDurumuHesapla(k, sonuc, url);
        durum.pid = pid || null;
        const eski = durumOku(durum.anahtar);
        durum.paylasimTs = Number(eski?.paylasimTs) || null;
        durum.paylasimFiyati = Number(eski?.paylasimFiyati) > 0 ? Number(eski.paylasimFiyati) : null;

        const karar = bildirimKarari(durum, eski, {
          paylasimAraligiSaat: ayar.paylasimAraligiSaat,
          simdi: opts.simdi,
          // Anti-flapping Kural 3: son bildirimler (ping-pong tespiti).
          sonGonderimler: gonder ? sonGonderimler(durum.anahtar, { limit: 3 }) : [],
        });
        durum.karar = karar.neden;
        if (durum.stokta) rapor.stoktaBulunan++;

        if (!durum.stokta) {
          durumYaz(durum);
          rapor.sonuclar.push({
            ad: k.ad, durum: 'stok_yok', karar: 'stokta teklif yok', gonderildi: false,
          });
          continue;
        }

        if (gonder && rapor.gonderilen >= ayar.donguBasina) {
          durum.karar = 'tur başına paylaşım sınırı';
          durumYaz(durum);
          rapor.atlanan++;
          rapor.sonuclar.push({
            ad: k.ad, durum: 'ok', site: durum.site, fiyat: durum.fiyat,
            karar: 'tur başına paylaşım sınırı', gonderildi: false,
          });
          continue;
        }

        let gonderildi = false;
        if (gonder && karar.gonder) {
          try {
            const r = await radarGonder(durum, { kuru, chatId: opts.chatId, botToken: opts.botToken });
            if (!kuru) {
              durum.paylasimTs = Date.now();
              // %4 eşiği "son PAYLAŞILAN fiyat"a göre hesaplanır (gözlem fiyatına göre değil).
              durum.paylasimFiyati = durum.fiyat ?? null;
              gonderimYaz(durum, 'gonderildi', { neden: karar.neden, mesajId: r.messageId });
            }
            gonderildi = true;
            if (!kuru) rapor.gonderilen++;
          } catch (e) {
            const hata = String(e?.message || e).slice(0, 240);
            gonderimYaz(durum, 'hata', { neden: karar.neden, hata });
            rapor.hatalar.push({ ad: k.ad, hata });
            ILERLEME.hatalar++;
          }
        } else if (gonder) {
          rapor.atlanan++;
        }

        durumYaz(durum);
        rapor.sonuclar.push({
          ad: k.ad,
          durum: 'ok',
          site: durum.site,
          fiyat: durum.fiyat,
          stokluSayisi: durum.stokluSayisi,
          tukenenSayisi: durum.tukenenSayisi,
          birimMetni: durum.birimMetni,
          karar: karar.neden,
          gonderildi,
          kuru: kuru && gonderildi ? true : undefined,
        });
      } catch (e) {
        const hata = String(e?.message || e).slice(0, 240);
        rapor.hatalar.push({ ad: k.ad, hata });
        ILERLEME.hatalar++;
        rapor.sonuclar.push({ ad: k.ad, durum: 'hata', hata });
      } finally {
        ILERLEME.tamamlanan = i + 1;
      }
    }

    rapor.sureMs = Date.now() - basladi;
    sonCalisma = new Date().toISOString();
    sonRapor = {
      sureMs: rapor.sureMs,
      taranan: rapor.taranan,
      stoktaBulunan: rapor.stoktaBulunan,
      gonderilen: rapor.gonderilen,
      atlanan: rapor.atlanan,
      hataSayisi: rapor.hatalar.length,
    };
    // Panelde kalıcı özet (yeniden başlatmada da görünür).
    try {
      saveSettings({ radar: { sonCalisma, sonRapor } });
    } catch { /* özet yazılamazsa tarama yine geçerli */ }
    return rapor;
  } finally {
    calisiyor = false;
    ILERLEME.calisiyor = false;
    ILERLEME.sonUrun = null;
  }
}

/**
 * Arka planda başlatır (HTTP isteğini bloklamaz). Test butonu bunu kullanır.
 * @returns {{basladi:boolean, atlandi?:boolean, neden?:string, ilerleme:object}}
 */
export function radarBaslat(opts = {}) {
  if (calisiyor) return { basladi: false, atlandi: true, neden: 'tarama zaten çalışıyor', ilerleme: { ...ILERLEME } };
  radarTara({ ...opts, zorla: opts.zorla !== false })
    .then((r) => {
      console.log(`[radar] tur tamamlandı: ${r.taranan || 0} tarandı, `
        + `${r.stoktaBulunan || 0} stokta, ${r.gonderilen || 0} bildirim, `
        + `${(r.hatalar || []).length} hata (${Math.round((r.sureMs || 0) / 1000)} sn)`);
    })
    .catch((e) => {
      console.warn('[radar] tur hatası:', String(e?.message || e).slice(0, 180));
    });
  return { basladi: true, ilerleme: { ...ILERLEME } };
}

/* ------------------------------------------------------------------ */
/* Durum / istatistik                                                  */
/* ------------------------------------------------------------------ */

/** Ayarlar paneli için özet. */
export function radarDurum() {
  const ayar = radarAyar();
  let katalog = [];
  let durumlar = [];
  let gonderim = { toplam: 0, bugun: 0, son: [] };
  try {
    katalog = katalogGetir();
    durumlar = veritabani().prepare(`
      SELECT veri FROM radar_durum ORDER BY stokta DESC, fiyat ASC LIMIT 40
    `).all().map(r => {
      try { return JSON.parse(r.veri); } catch { return null; }
    }).filter(Boolean);
    const gunBasi = new Date(); gunBasi.setHours(0, 0, 0, 0);
    const s = veritabani();
    gonderim = {
      toplam: Number(s.prepare("SELECT COUNT(*) a FROM radar_gonderim WHERE durum='gonderildi'").get()?.a || 0),
      bugun: Number(s.prepare("SELECT COUNT(*) a FROM radar_gonderim WHERE durum='gonderildi' AND ts >= ?").get(gunBasi.getTime())?.a || 0),
      son: s.prepare(`
        SELECT urun, site, fiyat, ts, durum, neden, hata FROM radar_gonderim
        ORDER BY ts DESC LIMIT 10
      `).all().map(r => ({
        urun: r.urun, site: r.site, fiyat: r.fiyat,
        ts: new Date(Number(r.ts)).toISOString(),
        durum: r.durum, neden: r.neden || null, hata: r.hata || null,
      })),
    };
  } catch { /* DB hazır değilse boş döner */ }

  return {
    ayar,
    varsayilan: RADAR_VARSAYILAN,
    katalog,
    katalogSayisi: katalog.length,
    aktifSayisi: katalog.filter(k => k.aktif).length,
    calisiyor,
    ilerleme: { ...ILERLEME },
    sonCalisma: ayar.sonCalisma,
    sonRapor: ayar.sonRapor,
    durumlar: durumlar.map(d => ({
      ad: d.ad, site: d.site, fiyat: d.fiyat, stokta: !!d.stokta,
      katalogId: d.katalogId ?? null,
      stokluSayisi: d.stokluSayisi ?? 0, tukenenSayisi: d.tukenenSayisi ?? 0,
      birimMetni: d.birimMetni ?? null, ts: d.ts,
      paylasimTs: d.paylasimTs ?? null, karar: d.karar ?? null,
    })),
    gonderim,
  };
}

/* ------------------------------------------------------------------ */
/* Canlı vitrin (ana sayfa "borsa" ekranı) — 2026-11-03               */
/* ------------------------------------------------------------------ */

const VITRIN_KATEGORI_IKON = { filament: '🧵', yazici: '🖨️', genel: '📦' };

/**
 * Ana sayfa borsa vitrininin kategori kotası (12 kart için).
 * Amaç: en ucuz 12 ürün hep filament olduğu için ₺25.000'lik 3D yazıcılar
 * vitrine hiç çıkamıyordu (2026-11-10). Kota ile her kategori temsil edilir.
 */
export const VITRIN_KOTA = Object.freeze({ filament: 6, yazici: 4, genel: 2 });

/** Bir kategoride aynı markadan en fazla kaç ürün gösterilir (Porima domine etmesin). */
export const VITRIN_MARKA_SINIRI = 3;

/** Kart için "marka" tahmini: başlığın ilk anlamlı kelimesi. */
export function vitrinMarkasi(ad) {
  const s = String(ad || '').trim();
  if (!s) return '';
  const ilk = s.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, '');
  return ilk.toLocaleLowerCase('tr-TR');
}

/**
 * Havuz içi öncelik puanı.
 *
 * Katmanlar (yüksekten düşüğe):
 *  - stokta olan her zaman önde (+1000)
 *  - gerçek tasarruf / dip / gerçek fırsat (+300 / +250)
 *  - mağazalar arası fark yüzdesi (en fazla +100)
 *  - rotasyon gürültüsü (0..`jitter`) → benzer puanlı ürünler arasında tazeleme
 *
 * `jitter` kategoriye göre değişir (2026-11-10):
 *  - filament: 450 (çok ürün var, güçlü rotasyon isteniyor)
 *  - yazıcı:   60  (havuz küçük; bilinen modeller her açılışta görünsün)
 *  - genel:    120 (reçine/aksesuar az; hafif tazeleme)
 *
 * Gürültü "fırsat" bonusundan (300) büyük olabildiği için filamentte seçim
 * gerçekten değişir; stokta bonusundan (1000) küçük olduğu için stok dışı
 * ürün asla stoktakinin önüne geçmez.
 */
export function vitrinPuani(kart, rastgele = Math.random, jitter = 450) {
  if (!kart) return -Infinity;
  let puan = 0;
  if (kart.stokta) puan += 1000;
  if (Number(kart.tasarruf) > 0) puan += 300;
  if (kart.dip) puan += 250;
  if (kart.gercekFirsat) puan += 250;
  puan += Math.min(20, Math.max(0, Number(kart.indirimYuzde) || 0)) * 5;
  const tavan = Number.isFinite(jitter) && jitter >= 0 ? jitter : 450;
  puan += Math.max(0, Math.min(1, Number(rastgele()) || 0)) * tavan;
  return Math.round(puan * 100) / 100;
}

/** Kategoriye göre rotasyon gürültüsü (jitter).
 *  - filament: 450 → geniş havuz; belirgin rotasyon ve tazeleme.
 *  - yazıcı:    60 → küçük havuz; bilinen modeller (P1S, A1 Mini, K1C)
 *                     her açılışta görünür, yalnızca sıraları hafifçe değişir.
 *  - genel:    120 → reçine/parça havuzu; dengeli tazeleme.
 *  Not: jitter < stokta bonusu (1000) olduğundan stok dışı ürün asla öne geçmez. */
export const VITRIN_JITTER = Object.freeze({ filament: 450, yazici: 60, genel: 120 });

/**
 * Havuzdan kota kadar ürün seçer.
 *
 *  - Puan sırasına dizer (stokta → fırsat → fiyat farkı → rotasyon).
 *  - Marka sınırı: aynı markadan en fazla `markaSiniri` ürün.
 *  - Marka sınırı yüzünden kota dolmazsa, kalan yerler sınırsız havuzdan
 *    tamamlanır (boş kart göstermektense çeşitlilik kuralını esnetmek yeğdir).
 *
 * @param {Array} liste kartlar
 * @param {number} adet hedef kota
 * @param {{markaSiniri?:number, rastgele?:Function, haric?:Set}} [opts]
 */
export function vitrinHavuzdanSec(liste, adet, opts = {}) {
  const kartlar = (Array.isArray(liste) ? liste : []).filter(Boolean);
  if (!kartlar.length || adet <= 0) return [];

  const markaSiniri = Number.isFinite(opts.markaSiniri) ? opts.markaSiniri : VITRIN_MARKA_SINIRI;
  const rastgele = typeof opts.rastgele === 'function' ? opts.rastgele : Math.random;
  const haric = opts.haric instanceof Set ? opts.haric : null;
  const jitter = Number.isFinite(opts.jitter) ? opts.jitter : 450;

  const puanli = kartlar
    .filter(k => !haric || !haric.has(k.id))
    .map(k => ({ kart: k, puan: vitrinPuani(k, rastgele, jitter) }))
    // Eşit puanda ucuz olan öne (fiyat da istikrar sağlar: bilinen modeller kaymaz).
    .sort((a, b) => (b.puan - a.puan) || ((a.kart.fiyat || 0) - (b.kart.fiyat || 0)));

  const secilen = [];
  const markaSayisi = new Map();
  for (const { kart } of puanli) {
    if (secilen.length >= adet) break;
    const marka = vitrinMarkasi(kart.ad);
    const sayi = marka ? (markaSayisi.get(marka) || 0) : 0;
    if (marka && sayi >= markaSiniri) continue;
    secilen.push(kart);
    if (marka) markaSayisi.set(marka, sayi + 1);
  }

  // NOT: Marka sınırı BURADA esnetilmez. Havuz yalnızca tek markadan oluşuyorsa
  // kota eksik kalır; o boşluğu `vitrinVerisi` diğer KATEGORİLERDEN tamamlar
  // (marka tekeline düşmemek için). `markaSiniri: 99` verilerek sert sınır
  // bilinçli olarak kaldırılabilir (tamamlama adımı bunu kullanır).
  return secilen;
}

/**
 * Ana sayfadaki canlı "Filament & 3D Yazıcı Borsası" için TEMİZ veri.
 *
 * Yalnızca herkese açık alanlar döner (sohbet kimliği, token, PID yok).
 *
 * SEÇİM (2026-11-10): düz "en ucuz 12" yerine **kategori kotası**.
 * Eski davranışta 12 kartın 12'si de filamentti (7'si yalnızca Porima) ve
 * ₺15.000–35.000'lik 3D yazıcılar vitrine hiç girmiyordu.
 * Yeni dağılım: 6 filament + 4 yazıcı + 2 parça/reçine. Bir havuz boşsa
 * (ör. katalogda hiç reçine yok) kota diğer kategorilerden tamamlanır.
 *
 * ROTASYON: havuz içinde stokta olanlar korunur, kalan sıralama hafif
 * rastgelelikle tazelenir → sayfa yenilendikçe "canlı borsa" hissi.
 *
 * "En Dip Fiyat" rozeti UYDURULMAZ: yalnızca ürünün gerçek geçmişindeki
 * minimum fiyata eşitse verilir ve en az 3 gözlem / 2 farklı fiyat ister.
 *
 * @param {{limit?:number, seriNokta?:number, rastgele?:Function, kota?:object, sadeceIdler?:number[]}} [opts]
 *   `sadeceIdler`: yalnızca verilen katalog kimliklerini değerlendirir (test /
 *   tek ürün önizleme). Üretimde boş bırakılır.
 */
export function vitrinVerisi(opts = {}) {
  const limit = Math.max(1, Math.min(24, Number(opts.limit) || 12));
  const seriNokta = Math.max(2, Math.min(40, Number(opts.seriNokta) || 12));
  const rastgele = typeof opts.rastgele === 'function' ? opts.rastgele : Math.random;
  const sadeceIdler = Array.isArray(opts.sadeceIdler) && opts.sadeceIdler.length
    ? new Set(opts.sadeceIdler.map(Number).filter(Number.isFinite))
    : null;

  let rows = [];
  try {
    rows = veritabani().prepare(`
      SELECT d.katalog_id, d.urun, d.site, d.site_id, d.fiyat, d.stokta, d.ts, d.veri,
             k.kategori AS katalogKategori, k.ad AS katalogAd
      FROM radar_durum d
      LEFT JOIN radar_katalog k ON k.id = d.katalog_id
      ORDER BY d.stokta DESC, d.fiyat ASC
    `).all();
  } catch {
    return { ok: true, guncelleme: null, toplam: 0, gosterilen: 0, urunler: [], dagilim: {} };
  }

  // ---- 1) Her satırı karta çevir (fiyatsız / URL'siz / bozuk kayıt elenir) ----
  const kartlar = [];
  let guncelleme = 0;
  for (const r of rows) {
    let d = null;
    try { d = JSON.parse(r.veri); } catch { d = null; }
    if (!d || typeof d !== 'object') continue;
    const id = Number(r.katalog_id ?? d.katalogId);
    if (!Number.isFinite(id)) continue;
    if (sadeceIdler && !sadeceIdler.has(id)) continue;

    const fiyat = Number.isFinite(Number(r.fiyat)) ? Number(r.fiyat) : null;
    if (fiyat == null || fiyat <= 0) continue; // fiyatsız kart borsada işe yaramaz
    const stokta = Number(r.stokta) === 1;
    guncelleme = Math.max(guncelleme, Number(r.ts) || 0);

    // Trend serisi (sparkline) + "En Dip" kararı.
    // radarSerisi() radar_gecmis ile aynı ürünün price_history kayıtlarını
    // birleştirir → daha uzun GERÇEK geçmiş (uydurma nokta yok).
    let seri = [];
    try {
      seri = radarSerisi(id, { gun: 90, limit: Math.max(seriNokta, 40) })
        .map(x => Math.round(Number(x.fiyat) * 100) / 100);
    } catch { seri = []; }
    const onceki = seri.length >= 2 ? seri[seri.length - 2] : null;
    const degisim = (onceki != null && fiyat != null)
      ? Math.round((fiyat - onceki) * 100) / 100
      : null;

    const enPahali = Number(d.enPahaliFiyat);
    const tasarruf = Number(d.tasarruf);
    const hamYuzde = (Number.isFinite(enPahali) && enPahali > 0 && Number.isFinite(tasarruf) && tasarruf > 0)
      ? Math.round((tasarruf / enPahali) * 100)
      : 0;
    // DÜRÜSTLÜK (2026-11-03): bu oran mağazanın ETİKET indirimi DEĞİL, stokta olan
    // mağazalar arasındaki farktır. %60 üzeri oran büyük olasılıkla farklı PAKET
    // boyutunun eşleşmesidir (ölçüm: Microzey PLA %88) → rozet gösterilmez.
    // %80 üzeri fark ise döviz/hatalı fiyat sinyalidir → vitrin kartı atlanır.
    if (hamYuzde > 80) continue;
    const farkGuvenilir = hamYuzde > 0 && hamYuzde <= 60;
    const indirimYuzde = farkGuvenilir ? hamYuzde : 0;

    // "En Dip Fiyat" DÜRÜSTLÜK KURALI (2026-11-03 sıkılaştırma):
    //  - en az 3 gerçek gözlem,
    //  - en az 2 FARKLI fiyat (hep aynı fiyat "dip" değildir — fırsat iddiası kurulamaz),
    //  - güncel fiyat geçmiş minimuma eşit ya da altında.
    const seriFiyatlar = seri.filter(x => Number.isFinite(Number(x)) && Number(x) > 0);
    const farkliFiyatSayisi = new Set(seriFiyatlar.map(x => Math.round(Number(x) * 100) / 100)).size;
    const gecmisMin = (seriFiyatlar.length >= 3 && farkliFiyatSayisi >= 2)
      ? Math.min(...seriFiyatlar)
      : null;
    const dip = !!(stokta && gecmisMin != null && fiyat != null
      && fiyat <= gecmisMin + 0.009);

    const url = d.afiliyeUrl || d.hamUrl || null;
    if (!url) continue;

    const kategori = String(r.katalogKategori || d.kategori || 'genel').toLowerCase();
    const guvenliKategori = Object.prototype.hasOwnProperty.call(VITRIN_KOTA, kategori)
      ? kategori : 'genel';

    kartlar.push({
      id,
      ad: d.ad || r.katalogAd || r.urun || 'Ürün',
      kategori: guvenliKategori,
      // 2026-11-11: kategori varsayılanı yerine ÜRÜN bazlı ikon.
      // PETG 💎, TPU 🌀, reçine 🧪, nozzle 🔧, kurutucu ♨️; tanınmayan → kategori.
      ikon: urunIkonu({ kategori: guvenliKategori, ad: d.ad || r.katalogAd || r.urun || '' })
        || VITRIN_KATEGORI_IKON[guvenliKategori]
        || '📦',
      site: d.site || r.site || null,
      siteId: d.siteId || r.site_id || null,
      fiyat,
      stokta,
      birimMetni: d.birimMetni || null,
      kargo: d.kargo || null,
      url,
      afiliye: !!(d.afiliyeUrl && d.afiliyeUrl !== d.hamUrl),
      dip,
      // V2 (2026-11-05): son 90 gunun dip fiyati mi? (sahte indirim
      // rozeti borsa kartinda gosterilmez; orada yalnizca olumlu sinyal var.)
      gercekFirsat: d.sahteIndirim?.gercekFirsat === true,
      indirimYuzde,
      tasarruf: Number.isFinite(tasarruf) ? tasarruf : 0,
      degisim,
      seri: seri.slice(-Math.max(2, seriNokta)),
      ts: Number(r.ts) || null,
    });
  }

  // ---- 2) Kategori havuzlarına ayır ----
  const havuzlar = { filament: [], yazici: [], genel: [] };
  for (const k of kartlar) havuzlar[k.kategori].push(k);

  // ---- 3) Kotayı ölçekle ve havuzlardan seç ----
  // limit 12 → sabit kota; farklı limitlerde oran korunur (24 → 12/8/4).
  const taban = opts.kota && typeof opts.kota === 'object' ? opts.kota : VITRIN_KOTA;
  const olcek = limit / 12;
  const kota = {};
  for (const anahtar of Object.keys(VITRIN_KOTA)) {
    const ham = Number(taban[anahtar]);
    kota[anahtar] = Math.max(0, Math.round((Number.isFinite(ham) ? ham : VITRIN_KOTA[anahtar]) * olcek));
  }

  // Havuz boşsa (ör. katalogda hiç reçine yok) veya kota dolmazsa, eksik
  // kartlar diğer kategorilerden tamamlanır. Kota "sert tavan" değil,
  // "öncelikli pay" olarak davranır.
  const secilen = [];
  const secilenIdler = new Set();
  const ekle = (liste) => {
    for (const k of liste) {
      if (secilen.length >= limit) break;
      if (secilenIdler.has(k.id)) continue;
      secilen.push(k);
      secilenIdler.add(k.id);
    }
  };

  for (const anahtar of ['filament', 'yazici', 'genel']) {
    const pay = Math.min(kota[anahtar], limit - secilen.length);
    if (pay <= 0) continue;
    ekle(vitrinHavuzdanSec(havuzlar[anahtar], pay, {
      rastgele, haric: secilenIdler, jitter: VITRIN_JITTER[anahtar],
    }));
  }

  // Backfill: eksik kalan yerler, kategori önceliğiyle (yazıcı ve genel önce —
  // böylece "hepsi filament" durumu asla geri gelmez) tamamlanır.
  if (secilen.length < limit) {
    for (const anahtar of ['yazici', 'genel', 'filament']) {
      if (secilen.length >= limit) break;
      ekle(vitrinHavuzdanSec(havuzlar[anahtar], limit - secilen.length, {
        rastgele, markaSiniri: 99, haric: secilenIdler, jitter: VITRIN_JITTER[anahtar],
      }));
    }
  }

  const dagilim = { filament: 0, yazici: 0, genel: 0 };
  for (const k of secilen) dagilim[k.kategori] = (dagilim[k.kategori] || 0) + 1;

  return {
    ok: true,
    guncelleme: guncelleme ? new Date(guncelleme).toISOString() : null,
    toplam: rows.length,
    havuz: {
      filament: havuzlar.filament.length,
      yazici: havuzlar.yazici.length,
      genel: havuzlar.genel.length,
    },
    kota,
    dagilim,
    gosterilen: secilen.length,
    urunler: secilen,
  };
}

/* ------------------------------------------------------------------ */
/* Zamanlayıcı                                                         */
/* ------------------------------------------------------------------ */

/** @returns {number} bir sonraki tura kalan ms */
export function sonrakiTurMs(ayar = radarAyar(), simdi = Date.now()) {
  const aralik = Math.max(1, ayar.saatAraligi) * 3600 * 1000;
  const son = Date.parse(ayar.sonCalisma || '') || 0;
  if (!son) return Math.min(3 * 60 * 1000, aralik); // ilk açılış: 3 dk sonra
  const hedef = son + aralik;
  const kalan = hedef - simdi;
  // Çok geçmişse (sunucu kapalıydı) 30 sn içinde telafi et, hemen değil.
  if (kalan <= 0) return 30 * 1000;
  return Math.min(kalan, aralik);
}

/**
 * Zamanlayıcıyı (yeniden) kurar. Her turda ayarlar yeniden okunur.
 * Kapanışta `radarZamanlayiciDurdur()` çağrılır.
 */
export function startRadarScheduler({ onTurBitis } = {}) {
  radarZamanlayiciDurdur();
  const ayar = radarAyar();
  const gecikme = sonrakiTurMs(ayar);

  const tur = async () => {
    try {
      if (radarAyar().enabled) {
        const r = await radarTara();
        if (r.atlandi) {
          console.log(`[radar] tur atlandı: ${r.neden}`);
        } else {
          console.log(`[radar] otonom tur: ${r.taranan} tarandı, ${r.gonderilen} bildirim`);
          if (typeof onTurBitis === 'function') {
            try { await onTurBitis(r); } catch { /* bildirim hatası radarı durdurmaz */ }
          }
        }
      }
    } catch (e) {
      console.warn('[radar] zamanlanmış tur hatası:', String(e?.message || e).slice(0, 160));
    } finally {
      // Bir sonraki turu yeniden planla (ayar değişmiş olabilir).
      const yeni = radarAyar();
      const ms = Math.max(1, yeni.saatAraligi) * 3600 * 1000;
      zamanlayici = setTimeout(tur, ms);
      zamanlayici.unref?.();
    }
  };

  zamanlayici = setTimeout(tur, gecikme);
  zamanlayici.unref?.();
  console.log(`[radar] zamanlayıcı kuruldu — ${ayar.enabled ? 'AÇIK' : 'kapalı'}, `
    + `her ${ayar.saatAraligi} sa, ilk tur ${Math.round(gecikme / 60000)} dk sonra`);
  return { saatAraligi: ayar.saatAraligi, enabled: ayar.enabled, ilkTurMs: gecikme };
}

export function radarZamanlayiciDurdur() {
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
}

/** Test/teşhis. */
export function radarCalisiyorMu() {
  return calisiyor;
}
