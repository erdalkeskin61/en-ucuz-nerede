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
import { fiyatSerisi, grafikPng } from './grafik.js';
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
  // Popüler filamentler
  { ad: 'Creality Ender PLA Gri 1kg', sorgu: 'Creality Ender PLA Gri 1kg', kategori: 'filament' },
  { ad: 'eSun ePLA-HS (High Speed) PLA Siyah 1kg', sorgu: 'eSun ePLA-HS PLA Siyah 1kg', kategori: 'filament' },
  { ad: 'eSun PLA+ Beyaz 1kg', sorgu: 'eSun PLA+ Beyaz 1kg', kategori: 'filament' },
  { ad: 'Porima PLA Siyah 1.75mm 1kg', sorgu: 'Porima PLA Siyah 1.75mm 1kg', kategori: 'filament' },
  { ad: 'Microzey PLA Filament Gri', sorgu: 'Microzey PLA Filament Gri', kategori: 'filament' },
  { ad: 'Sunlu PLA+ Filament 1kg', sorgu: 'Sunlu PLA+ Filament 1kg', kategori: 'filament' },
  // Popüler 3D yazıcılar
  { ad: 'Bambu Lab P1S 3D Yazıcı', sorgu: 'Bambu Lab P1S 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Bambu Lab A1 Mini 3D Yazıcı', sorgu: 'Bambu Lab A1 Mini 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Creality K1C 3D Yazıcı', sorgu: 'Creality K1C 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Creality K1 Max 3D Yazıcı', sorgu: 'Creality K1 Max 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Creality Ender 3 V3 KE', sorgu: 'Creality Ender 3 V3 KE 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Anycubic Kobra 2 Neo', sorgu: 'Anycubic Kobra 2 Neo 3D Yazıcı', kategori: 'yazici' },
  { ad: 'Elegoo Neptune 4 Pro', sorgu: 'Elegoo Neptune 4 Pro 3D Yazıcı', kategori: 'yazici' },
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
  tohumla();
  return db;
}

/** İlk kurulumda varsayılan katalog yazılır (kullanıcı hepsini silse bile bir kez). */
function tohumla() {
  const isaret = db.prepare("SELECT value FROM radar_meta WHERE key = 'katalog_seed'").get();
  if (isaret?.value === '1') return;
  const adet = Number(db.prepare('SELECT COUNT(*) adet FROM radar_katalog').get()?.adet || 0);
  if (adet === 0) {
    const ekle = db.prepare(`
      INSERT INTO radar_katalog (ad, sorgu, url, kategori, aktif, sira, eklenme)
      VALUES (?, ?, NULL, ?, 1, ?, ?)
    `);
    VARSAYILAN_KATALOG.forEach((k, i) => ekle.run(k.ad, k.sorgu, k.kategori, i, Date.now()));
  }
  db.prepare("INSERT INTO radar_meta (key, value) VALUES ('katalog_seed', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
}

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Telegram Chat ID / Kanal adını doğrular ve normalize eder.
 * Kullanıcı @ koymadan "enucuzneredefirsatlari" yazdıysa başına otomatik @ ekler.
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
  };
}

/** Katalog kayıtları (aktif olanlar önce, `sira` artan). */
export function katalogGetir({ sadeceAktif = false } = {}) {
  const sql = sadeceAktif
    ? 'SELECT * FROM radar_katalog WHERE aktif = 1 ORDER BY sira ASC, id ASC'
    : 'SELECT * FROM radar_katalog ORDER BY aktif DESC, sira ASC, id ASC';
  return veritabani().prepare(sql).all().map(satirCevir);
}

/** Katalog kaydı ekler. @returns {object} */
export function katalogEkle({ ad, sorgu, url = null, kategori = 'genel' } = {}) {
  const temizAd = String(ad || '').replace(/\s+/g, ' ').trim();
  const temizSorgu = String(sorgu || temizAd).replace(/\s+/g, ' ').trim();
  const temizKategori = KATEGORILER.has(kategori) ? kategori : 'genel';
  if (temizAd.length < 2) throw new Error('Ürün adı en az 2 karakter olmalı.');
  if (temizAd.length > 160) throw new Error('Ürün adı en fazla 160 karakter olabilir.');
  if (temizSorgu.length < 2) throw new Error('Arama sorgusu en az 2 karakter olmalı.');
  const s = veritabani();
  const enBuyuk = Number(s.prepare('SELECT MAX(sira) m FROM radar_katalog').get()?.m || 0);
  const bilgi = s.prepare(`
    INSERT INTO radar_katalog (ad, sorgu, url, kategori, aktif, sira, eklenme)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(temizAd, temizSorgu, url ? String(url).trim() : null, temizKategori, enBuyuk + 1, Date.now());
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

/* ------------------------------------------------------------------ */
/* Stok filtresi — "tükenen mağaza asla en ucuz olamaz"                */
/* ------------------------------------------------------------------ */

/** 3D Yazıcı veya Filament yerine yedek parça/aksesuar tekliflerini yakalayan regex */
const SATILAMAZ_PARCA_METIN = /\b(termistör|termistor|silikon\s*çorap|silikon\s*corap|çorap|corap|ısıtıcı\s*blok|isitici\s*blok|ısıtıcı\s*fişek|isitici\s*fisek|hotend|nozzle|nozül|nozul|tabla|pei|yay\s*çeliği|kayış|kayis|kasnak|step\s*motor|anakart|bltouch|sensör|sensor|prob|probe|fan|yedek\s*parça|yedek\s*parca|kablo|adaptör|adaptor)\b/i;

/** Bir teklifin kayıt kategorisine (yazıcı / filament) uygunluğunu doğrular */
export function teklifKategoriyeUygunMu(r, kayit = null) {
  if (!r?.product) return false;
  const p = r.product;
  const fiyat = Number(p.pricing?.toplam ?? p.sellingPrice);
  const baslik = String(p.title || '');
  const kat = String(kayit?.kategori || '').toLowerCase();
  const kayitAd = String(kayit?.ad || '').toLowerCase();

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
  const stoklu = stokluTeklifler(sonuc, kayit);
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
 * Bu durum Telegram'a gönderilmeli mi?
 *
 * Kurallar (spec):
 *  1. Fiyat önceki tespite göre düştüyse,
 *  2. Stoktaki en ucuz mağaza değiştiyse,
 *  3. Son paylaşımdan en az `paylasimAraligiSaat` (varsayılan 48) saat geçtiyse.
 * Stokta uygun teklif yoksa asla gönderilmez.
 *
 * @returns {{gonder:boolean, neden:string, oncelik:number}}
 */
export function bildirimKarari(yeni, eski, opts = {}) {
  const saat = Number.isFinite(Number(opts.paylasimAraligiSaat))
    ? Number(opts.paylasimAraligiSaat) : RADAR_VARSAYILAN.paylasimAraligiSaat;
  const simdi = Number.isFinite(opts.simdi) ? opts.simdi : Date.now();

  if (!yeni || yeni.stokta !== true || !(Number(yeni.fiyat) > 0)) {
    return { gonder: false, neden: 'stokta satın alınabilir teklif yok', oncelik: 0 };
  }
  if (!eski) return { gonder: true, neden: 'ilk tespit', oncelik: 3 };

  if (eski.stokta !== true) {
    return { gonder: true, neden: 'ürün yeniden stokta', oncelik: 4 };
  }
  const oncekiFiyat = Number(eski.fiyat);
  if (Number.isFinite(oncekiFiyat) && Number(yeni.fiyat) < oncekiFiyat - 0.005) {
    return { gonder: true, neden: 'fiyat düştü', oncelik: 5 };
  }
  if (String(yeni.siteId || '') !== String(eski.siteId || '')) {
    return { gonder: true, neden: 'en ucuz mağaza değişti', oncelik: 4 };
  }
  const sonPaylasim = Number(eski.paylasimTs) || 0;
  if (!sonPaylasim) {
    return { gonder: true, neden: 'ilk paylaşım', oncelik: 3 };
  }
  if (simdi - sonPaylasim >= saat * 3600 * 1000) {
    return { gonder: true, neden: `${saat} saatlik özet süresi doldu`, oncelik: 2 };
  }
  return { gonder: false, neden: 'değişiklik yok (cooldown)', oncelik: 0 };
}

/* ------------------------------------------------------------------ */
/* Kart ve Telegram                                                    */
/* ------------------------------------------------------------------ */

/**
 * Spec'teki kart biçimi. Tüm metin `esc()` ile kaçırılır.
 * @param {object} d radar durumu
 */
export function radarKartOlustur(d) {
  const ad = esc(d?.ad || d?.urun || 'Ürün');
  const ikon = d?.kategori === 'yazici' ? '🖨️' : '🧵';
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
  satirlar.push('', '🏷️ @EnUcuzNerede | Otonom Fiyat Radarı');
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
      return { ok: true, yontem: 'sendPhoto', messageId: r.messageId, grafik: true };
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
  return { ok: true, yontem: 'sendMessage', messageId: veri.result?.message_id ?? null };
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
    return grafikPng(radarSerisi(d.katalogId));
  } catch {
    return null;
  }
}

function gonderimYaz(d, durum, { neden = null, mesajId = null, hata = null, ts = Date.now() } = {}) {
  try {
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

        const karar = bildirimKarari(durum, eski, {
          paylasimAraligiSaat: ayar.paylasimAraligiSaat,
          simdi: opts.simdi,
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
export function startRadarScheduler() {
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
