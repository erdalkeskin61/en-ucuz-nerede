/**
 * Anlık sonuç önbelleği (stale-while-revalidate) — 2026-10-29
 *
 * SORUN: popüler bir ürün (Logitech G102, iPhone 15…) her sorgulandığında 60 siteye
 * baştan istek atılıyordu; kullanıcı 60-90 saniye boş ekran bekliyordu.
 *
 * ÇÖZÜM: sonuç SQLite'ta saklanır. Ürün `snapshotTtlMs` (varsayılan 5 saat) içinde
 * daha önce taranmışsa:
 *   1. Sonuç **anında** döner (0 saniye — diskten okuma),
 *   2. Arka planda sessizce tazelenir,
 *   3. Fiyatı değişen kartlar canlı güncellenir.
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - Önbellekteki sonuç "gerçek bir taramanın" kaydıdır; uydurma/karıştırma yok.
 *  - Ekranda tarama zamanı AÇIKÇA yazılır ("12 dk önce tarandı · güncelleniyor…").
 *  - Tazeleme başarısız olursa eski sonuç KORUNUR ve kullanıcıya "güncellenemedi"
 *    denir; sessizce bayat veri "güncel" gibi sunulmaz.
 *  - Snapshot şema sürümü değişince (kod güncellemesi) eski kayıtlar geçersiz sayılır.
 */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

/** Snapshot biçimi değişirse artır: eski kayıtlar otomatik geçersizleşir. */
// 2 (2026-10-30): payload'a `ozet.fiyatZekasi` + stok sayaçları eklendi; eski
// biçimdeki kayıtlar radar panelini gösteremezdi.
// 3 (2026-10-31): KDV hariç yayımlayan mağazalarda (direnc.net) fiyat artık KDV
// DAHİL hesaplanıyor; eski kayıtlar ~%20 düşük görünüyordu → geçersiz sayılır.

export const SNAPSHOT_SURUMU = 3;

const DB_YOLU = path.join(config.dataDir, 'en_ucuz_nerede.db');
let db = null;

/** Veritabanı bağlantısını (tembel) açar ve tabloyu hazırlar. */
function veritabani() {
  if (db) return db;
  db = new DatabaseSync(DB_YOLU);
  // WAL: okuma yazmayı bloklamaz → anlık yanıt (0 sn) diskten hızlı okunur.
  // busy_timeout: eşzamanlı yazma (canlı tarama + arka plan tazeleme) kilit hatası
  // yerine kısa süre bekler. synchronous=NORMAL WAL ile güvenli ve hızlıdır.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS snapshot (
      anahtar   TEXT PRIMARY KEY,
      ts        INTEGER NOT NULL,
      surum     INTEGER NOT NULL,
      urun      TEXT,
      en_ucuz   REAL,
      en_ucuz_site TEXT,
      payload   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshot_ts ON snapshot(ts);
  `);
  // Şema/algoritma sürümü değiştiyse eski kayıtlar geçersizdir: temizle.
  db.exec(`DELETE FROM snapshot WHERE surum != ${Number(SNAPSHOT_SURUMU)}`);
  return db;
}

/** Süreç kapanırken temiz kapanış (Windows'ta node:sqlite çökmesini önler). */
export function snapshotKapat() {
  try { db?.close(); } catch { /* zaten kapalı */ }
  db = null;
}

/**
 * URL'yi önbellek anahtarına çevirir.
 *
 * Amaç: aynı ürünün farklı biçimde yapıştırılmış adresleri AYNI kaydı bulsun.
 *  - şema (http/https) ve `www.` farkı yok sayılır,
 *  - izleme parametreleri atılır (utm_*, srsltid, gclid, fbclid, ref, source…),
 *  - sorgu parametreleri sıralanır (sıra farkı farklı anahtar üretmesin),
 *  - fragment (#…) atılır, sonda `/` varsa kırpılır.
 * Ürün kimliği taşıyan parametreler (`?productId=123`, `?v=...`) KORUNUR.
 *
 * Not: yalnızca http/https URL'ler kabul edilir; diğer şemalar (javascript:,
 * file: vb.) güvenlik gereği önbelleğe alınmaz.
 */
const IZLEME_PARAMETRELERI = new RegExp(
  '^(?:' + [
    'utm_[a-z0-9_]+', 'srsltid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid',
    'yclid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'mkt_tok', 'vero_id', 'wickedid', 'igshid',
    'rb_clickid', 's_cid', 'elqtrackid', 'oly_anon_id', 'oly_enc_id',
    'ref', 'ref_', 'referrer', 'referral', 'source', 'campaign', 'adgroup', 'matchtype',
    'hm[a-z]?', 'si', 'spm', 'scm', 'trk', 'trkinfo', 'tag', 'linkcode', 'th', 'psc',
    'pd_rd_[a-z0-9_]+', 'pf_rd_[a-z0-9_]+', 'aff_id', 'affiliate', 'partner', 'cmpid',
    'campaignid', 'ad_id', 'adid',
  ].join('|') + ')$',
  'i',
);

export function anahtarCikar(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return null; // geçersiz URL önbelleğe alınmaz
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !IZLEME_PARAMETRELERI.test(k))
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const q = new URLSearchParams(params).toString();
  // www., www2. gibi önekler ve sondaki nokta aynı ürün sayılır.
  const host = u.hostname.toLowerCase().replace(/^www\d*\./, '').replace(/\.$/, '');
  const yol = u.pathname.replace(/\/+$/, '') || '/';
  return host + yol + (q ? '?' + q : '');
}

/**
 * Kayıtlı anlık sonucu döndürür.
 *
 * @param {string} url ürün adresi
 * @param {{maxYasMs?:number}} [opts] tazelik sınırı (verilmezse config.snapshotTtlMs)
 * @returns {{payload:object, ts:number, yasMs:number, anahtar:string, urun:string|null,
 *            enUcuz:number|null, enUcuzSite:string|null}|null}
 */
export function anlikAl(url, opts = {}) {
  const anahtar = anahtarCikar(url);
  if (!anahtar) return null;
  const maxYas = Number.isFinite(opts.maxYasMs) ? opts.maxYasMs : config.snapshotTtlMs;
  if (!(maxYas > 0)) return null; // özellik kapalı

  try {
    const row = veritabani().prepare('SELECT ts, urun, en_ucuz, en_ucuz_site, payload FROM snapshot WHERE anahtar = ?').get(anahtar);
    if (!row) return null;
    const yasMs = Date.now() - Number(row.ts);
    if (!(yasMs >= 0) || yasMs > maxYas) return null; // çok eski → taze tarama yapılır
    let payload;
    try { payload = JSON.parse(row.payload); } catch { return null; }
    if (!payload || !payload.kaynak || !Array.isArray(payload.sonuclar)) return null;
    return {
      payload,
      ts: Number(row.ts),
      yasMs,
      anahtar,
      urun: row.urun || payload.kaynak?.urun || null,
      enUcuz: row.en_ucuz ?? null,
      enUcuzSite: row.en_ucuz_site ?? null,
    };
  } catch {
    return null; // tablo/DB sorunu → normal tarama akışı devam eder
  }
}

/**
 * Türkçe-duyarlı arama katlaması: "İSTANBUL" → "istanbul", "Şişli" → "sisli".
 * SQLite'ın `LIKE`'ı yalnızca ASCII'de büyük/küçük harf duyarsızdır; bu yüzden
 * eşleştirme JS tarafında yapılır.
 */
function katla(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Kayıtlı karşılaştırmalarda metin araması (Telegram inline mode için).
 *
 * Son 7 günün snapshot'ları taranır; ürün adı eşleşmesine göre puanlanır
 * (tam eşleşme > alt dize > kelime kapsaması) ve en taze kayıtlar öne çıkar.
 * Ağ isteği YOKTUR: inline sorgu Telegram'ın kısa süre sınırında anında yanıtlanır.
 *
 * @param {string} sorgu
 * @param {{limit?:number, maxYasMs?:number}} [opts]
 * @returns {Array<{anahtar:string, ts:number, urun:string, enUcuz:number|null,
 *                  enUcuzSite:string|null, payload:object, puan:number}>}
 */
export function snapshotAra(sorgu, opts = {}) {
  const q = String(sorgu || '').trim();
  if (q.length < 2) return [];
  const limit = Math.max(1, Math.min(20, Number(opts.limit) || 8));
  const maxYas = Number.isFinite(opts.maxYasMs) ? opts.maxYasMs : 7 * 86400000;
  const esik = Date.now() - maxYas;
  const hedef = katla(q);
  if (hedef.length < 2) return [];
  const kelimeler = hedef.split(' ').filter(w => w.length >= 2);

  try {
    const satirlar = veritabani().prepare(`
      SELECT anahtar, ts, urun, en_ucuz, en_ucuz_site, payload
      FROM snapshot WHERE ts >= ? ORDER BY ts DESC LIMIT 400
    `).all(esik);

    const puanli = [];
    for (const r of satirlar) {
      const ad = katla(r.urun);
      if (!ad) continue;
      let puan = 0;
      if (ad === hedef) puan += 100;
      else if (ad.includes(hedef)) puan += 60;
      else if (hedef.includes(ad) && ad.length >= 6) puan += 35;
      if (kelimeler.length) {
        let eslesen = 0;
        for (const w of kelimeler) if (ad.includes(w)) eslesen++;
        if (eslesen) puan += Math.round((eslesen / kelimeler.length) * 40);
      }
      if (puan <= 0) continue;
      puanli.push({ ...r, puan });
    }

    puanli.sort((a, b) => (b.puan - a.puan) || (Number(b.ts) - Number(a.ts)));
    const gorulen = new Set();
    const sonuc = [];
    for (const r of puanli) {
      if (gorulen.has(r.anahtar)) continue;
      gorulen.add(r.anahtar);
      let payload = null;
      try { payload = JSON.parse(r.payload); } catch { payload = null; }
      if (!payload || !Array.isArray(payload.sonuclar)) continue;
      sonuc.push({
        anahtar: r.anahtar,
        ts: Number(r.ts),
        urun: r.urun || payload.kaynak?.urun || '',
        enUcuz: r.en_ucuz ?? null,
        enUcuzSite: r.en_ucuz_site ?? null,
        payload,
        puan: r.puan,
      });
      if (sonuc.length >= limit) break;
    }
    return sonuc;
  } catch {
    return [];
  }
}

/** Bir karşılaştırma sonucunu anlık önbelleğe yazar. */export function anlikYaz(url, payload, meta = {}) {
  const anahtar = anahtarCikar(url);
  if (!anahtar) return false;
  if (!payload || !payload.kaynak || !Array.isArray(payload.sonuclar)) return false;
  try {
    veritabani().prepare(`
      INSERT INTO snapshot (anahtar, ts, surum, urun, en_ucuz, en_ucuz_site, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anahtar) DO UPDATE SET
        ts = excluded.ts,
        surum = excluded.surum,
        urun = excluded.urun,
        en_ucuz = excluded.en_ucuz,
        en_ucuz_site = excluded.en_ucuz_site,
        payload = excluded.payload
    `).run(
      anahtar,
      Date.now(),
      SNAPSHOT_SURUMU,
      String(meta.urun || payload.kaynak?.urun || '').slice(0, 300),
      meta.enUcuz ?? payload.ozet?.enUcuzFiyat ?? null,
      meta.enUcuzSite ?? payload.ozet?.enUcuzSite ?? null,
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Tek bir anahtarın anlık sonucunu siler (2026-10-30).
 * Kullanım: yanlış/eksik taramanın önbellekte kalması durumunda temizlik ve
 * testlerin geçici tohumunu geri alması. `anahtar` verilirse doğrudan kullanılır,
 * aksi hâlde `url` normalize edilir.
 * @returns {boolean} silindi mi
 */
export function snapshotSil(urlVeyaAnahtar) {
  const anahtar = anahtarCikar(urlVeyaAnahtar) || String(urlVeyaAnahtar || '').trim();
  if (!anahtar) return false;
  try {
    const r = veritabani().prepare('DELETE FROM snapshot WHERE anahtar = ?').run(anahtar);
    return Number(r.changes || 0) > 0;
  } catch {
    return false;
  }
}

/** İstatistik (Ayarlar/durum panosu için). */
export function anlikIstatistik() {
  try {
    const row = veritabani().prepare('SELECT COUNT(*) adet, MIN(ts) enEski, MAX(ts) enYeni FROM snapshot').get();
    return {
      adet: Number(row?.adet || 0),
      enEski: row?.enEski ? new Date(Number(row.enEski)).toISOString() : null,
      enYeni: row?.enYeni ? new Date(Number(row.enYeni)).toISOString() : null,
      ttlDakika: Math.round(config.snapshotTtlMs / 60000),
    };
  } catch {
    return { adet: 0, enEski: null, enYeni: null, ttlDakika: Math.round(config.snapshotTtlMs / 60000) };
  }
}

/**
 * İki sonucu karşılaştırıp fiyatı DEĞİŞEN siteleri döndürür (canlı güncelleme için).
 *
 * Yalnızca aynı sitede aynı ürünün fiyatı karşılaştırılır. Yeni bulunan / kaybolan
 * siteler ayrı listelenir ki arayüz "3 fiyat güncellendi, 1 yeni mağaza" diyebilsin.
 *
 * @returns {{degisen:Array<{site,siteName,eski,yeni,fark,yuzde}>, yeni:Array, kaybolan:Array}}
 */
export function fiyatFarki(eskiSonuc, yeniSonuc) {
  const fiyatHaritasi = (sonuc) => {
    const m = new Map();
    for (const s of sonuc?.sonuclar || []) {
      if (s.status !== 'found' || !s.product) continue;
      const fiyat = s.product.pricing?.toplam ?? s.product.sellingPrice ?? null;
      if (fiyat == null || !Number.isFinite(Number(fiyat))) continue;
      m.set(s.site, { site: s.site, siteName: s.siteName, fiyat: Number(fiyat) });
    }
    return m;
  };
  const eski = fiyatHaritasi(eskiSonuc);
  const yeni = fiyatHaritasi(yeniSonuc);

  const degisen = [];
  const yeniSiteler = [];
  const kaybolan = [];

  for (const [site, y] of yeni) {
    const e = eski.get(site);
    if (!e) { yeniSiteler.push(y); continue; }
    if (Math.abs(e.fiyat - y.fiyat) < 0.01) continue;
    const fark = Math.round((y.fiyat - e.fiyat) * 100) / 100;
    degisen.push({
      site,
      siteName: y.siteName,
      eski: e.fiyat,
      yeni: y.fiyat,
      fark,
      yuzde: e.fiyat > 0 ? Math.round((fark / e.fiyat) * 1000) / 10 : null,
    });
  }
  for (const [site, e] of eski) {
    if (!yeni.has(site)) kaybolan.push({ site, siteName: e.siteName, eski: e.fiyat });
  }

  return { degisen, yeni: yeniSiteler, kaybolan };
}

/** Kullanıcıya gösterilecek "yaş" metni: "az önce", "12 dk önce", "3 sa 20 dk önce". */
export function yasMetni(yasMs) {
  const dk = Math.floor(Number(yasMs || 0) / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  const kalanDk = dk % 60;
  return kalanDk ? `${sa} sa ${kalanDk} dk önce` : `${sa} sa önce`;
}
