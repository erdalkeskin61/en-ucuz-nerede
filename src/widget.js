/**
 * 🔌 Gömülebilir Canlı Fiyat Widget'ı — veri katmanı (2026-11-05)
 *
 * Harici bloglar tek satırlık `<iframe src="…/widget?urun=…">` ile 61 mağazanın
 * anlık **en ucuz stoklu** fiyatını gösterir. Amaç:
 *   1) okuyucuya doğru, canlı fiyat,
 *   2) CTA üzerinden komisyonlu (`afiliyeLink`) tıklama,
 *   3) alt köşedeki marka bağlantısıyla organik backlink.
 *
 * DÜRÜSTLÜK:
 *  - Yalnızca `radar_durum`daki GERÇEK kayıtlar kullanılır; uydurma fiyat yok.
 *  - Ürün bulunamazsa/ stokta yoksa widget "şu anda fiyat yok" der, sahte sayı basmaz.
 *  - Dönen alanlar HERKESE AÇIKTIR: token, sohbet kimliği, PID, chatId sızmaz.
 */
import { dbBaglantisi } from './store.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Türkçe-duyarlı slug: "Creality Ender PLA Gri 1kg" → "creality-ender-pla-gri-1kg".
 * Widget URL'lerinde okunabilir ve kararlı bir kimlik sağlar.
 * @param {string} metin
 * @returns {string}
 */
export function slugYap(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Karşılaştırma için Türkçe katlama (slug üretmeden). */
function katla(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

const say = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** Referral kodunu güvenli biçime indirger (yalnızca harf/rakam/-/_). */
export function refTemizle(ref) {
  const s = String(ref || '').trim().toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, 40) || null;
}

/* ------------------------------------------------------------------ */
/* Ürün çözümleme                                                      */
/* ------------------------------------------------------------------ */

let _katalogOnbellek = null;
let _katalogTs = 0;

/** Katalog listesini 60 sn bellekte tutar (widget yoğun çağrılabilir). */
function katalogSatirlari() {
  const simdi = Date.now();
  if (_katalogOnbellek && simdi - _katalogTs < 60000) return _katalogOnbellek;
  try {
    _katalogOnbellek = dbBaglantisi().prepare(`
      SELECT k.id, k.ad, k.sorgu, k.kategori, d.veri
      FROM radar_katalog k
      LEFT JOIN radar_durum d ON d.katalog_id = k.id
      WHERE k.aktif = 1
      ORDER BY k.sira ASC, k.id ASC
    `).all();
    _katalogTs = simdi;
  } catch {
    _katalogOnbellek = [];
  }
  return _katalogOnbellek;
}

/**
 * Ürünü kimliğine göre çözer.
 *
 * Sıra: `id` (kesin) → `slug` (slug eşitliği) → `q` (slug/başlık içerme).
 * Eşitlik aramaları önce denenir; hiçbiri tutmazsa `null` döner. YANLIŞ ÜRÜN
 * göstermektense "bulunamadı" demek tercih edilir (widget bir bloga gömülür,
 * hata kalıcı olur).
 *
 * @param {{id?:string|number, slug?:string, q?:string}} [opts]
 * @returns {object|null}
 */
export function widgetUrunBul(opts = {}) {
  const satirlar = katalogSatirlari();
  if (!satirlar.length) return null;

  const id = Number(opts.id);
  if (Number.isFinite(id) && id > 0) {
    return satirlar.find(r => Number(r.id) === id) || null;
  }

  const slug = slugYap(opts.slug || '');
  if (slug) {
    // 1) Birebir slug
    const tam = satirlar.find(r => slugYap(r.ad) === slug);
    if (tam) return tam;
    // 2) Slug içeriyor ("bambu-p1s" → "Bambu Lab P1S 3D Yazıcı")
    const kismi = satirlar.find(r => slugYap(r.ad).includes(slug));
    if (kismi) return kismi;
    // 3) Tersten: ürün slug'ı aranan metni içeriyor (uzun sorgu)
    if (slug.length >= 6) {
      const ters = satirlar.find(r => slug.includes(slugYap(r.ad)));
      if (ters) return ters;
    }
    // 4) Kelime kapsamı: "pla-plus" ↔ "pla" gibi yazım farkları tolere edilir.
    const kelimeler = slug.split('-').filter(w => w.length >= 2);
    if (kelimeler.length) {
      let enIyi = null;
      let enIyiOran = 0;
      for (const r of satirlar) {
        const hedef = new Set(slugYap(r.ad).split('-').filter(Boolean));
        if (!hedef.size) continue;
        let eslesen = 0;
        for (const w of kelimeler) {
          if (hedef.has(w)) eslesen++;
          // "plus" ↔ "+" farkı: token yoksa kısmi önek de kabul (pla ~ plaplus).
          else if ([...hedef].some(h => h.startsWith(w) || w.startsWith(h))) eslesen += 0.5;
        }
        const oran = eslesen / kelimeler.length;
        if (oran > enIyiOran) { enIyiOran = oran; enIyi = r; }
      }
      // En az %60 kapsama: alakasız ürün göstermektense "bulunamadı" iyidir.
      if (enIyi && enIyiOran >= 0.6) return enIyi;
    }
  }

  const q = katla(opts.q || '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (q.length >= 2) {
    const kelimeler = q.split(' ').filter(w => w.length >= 2);
    const puanli = [];
    for (const r of satirlar) {
      const metin = katla(`${r.ad} ${r.sorgu || ''}`).replace(/[^a-z0-9]+/g, ' ');
      if (!kelimeler.length) continue;
      let eslesen = 0;
      for (const w of kelimeler) if (metin.includes(w)) eslesen++;
      const oran = eslesen / kelimeler.length;
      // Tam ifade eşleşmesi ya da kelime kapsamı ≥%60 (alakasız ürün gösterme).
      if (metin.includes(q) || oran >= 0.6) puanli.push({ r, oran });
    }
    if (puanli.length) {
      puanli.sort((a, b) => b.oran - a.oran);
      return puanli[0].r;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Widget yükü                                                         */
/* ------------------------------------------------------------------ */

/**
 * Widget için HERKESE AÇIK ürün yükü.
 *
 * @param {{id?:string|number, slug?:string, q?:string, ref?:string, tabanUrl?:string}} [opts]
 * @returns {{
 *   ok:boolean, bulundu:boolean, neden:string|null,
 *   urun:object|null, afiliye:boolean, gitUrl:string|null, guncelleme:number|null
 * }}
 */
export function widgetVerisi(opts = {}) {
  const ref = refTemizle(opts.ref);
  const taban = String(opts.tabanUrl || '').replace(/\/+$/, '');
  const bos = (neden) => ({
    ok: true,
    bulundu: false,
    neden,
    urun: null,
    afiliye: false,
    gitUrl: null,
    guncelleme: null,
  });

  let kayit = null;
  try { kayit = widgetUrunBul(opts); } catch { kayit = null; }
  if (!kayit) return bos('Ürün radar kataloğunda bulunamadı.');

  let d = null;
  try { d = JSON.parse(kayit.veri); } catch { d = null; }
  if (!d || typeof d !== 'object') {
    return bos('Bu ürün henüz taranmadı; fiyat bilgisi yok.');
  }

  const fiyat = say(d.fiyat);
  if (fiyat == null) return bos('Ürün için geçerli fiyat kaydı yok.');

  const stokta = d.stokta === true;
  const hamUrl = d.hamUrl || d.afiliyeUrl || null;
  if (!hamUrl) return bos('Ürün bağlantısı kayıtlı değil.');

  const site = d.site || null;
  const siteId = d.siteId || null;

  let hedef = hamUrl;
  let afiliye = false;
  try {
    const bagli = afiliyeLink(siteId, hamUrl, afiliyeAyarlari());
    if (bagli && bagli !== hamUrl) { hedef = bagli; afiliye = true; }
  } catch { /* afiliye yoksa ham link kullanılır */ }

  // Tıklama sayımı + kampanya atfı için kendi yönlendiricimizden geçir.
  // Doğrudan dış link vermek yerine `ref` kaydı burada tutulur.
  const parametreler = new URLSearchParams();
  parametreler.set('id', String(kayit.id));
  if (ref) parametreler.set('ref', ref);
  if (opts.tema) parametreler.set('tema', String(opts.tema));
  const gitUrl = taban ? `${taban}/widget/git?${parametreler.toString()}` : null;

  return {
    ok: true,
    bulundu: true,
    neden: null,
    guncelleme: Number(d.ts) || null,
    afiliye,
    hedef,
    gitUrl: gitUrl || hedef,
    urun: {
      id: Number(kayit.id),
      slug: slugYap(kayit.ad),
      ad: String(d.ad || kayit.ad || 'Ürün').slice(0, 160),
      kategori: String(d.kategori || kayit.kategori || 'genel'),
      site,
      siteId,
      fiyat,
      stokta,
      birimMetni: d.birimMetni || null,
      kargo: d.kargo || null,
      gercekFirsat: d.sahteIndirim?.gercekFirsat === true,
      dip: null, // widget'ta "en dip" iddiası gösterilmez; yalnızca doğrulanmış gercekFirsat
    },
  };
}

/** Tıklama kaydı için tabloyu hazırlar (idempotent). */
export function widgetTablosuHazirla() {
  try {
    dbBaglantisi().exec(`
      CREATE TABLE IF NOT EXISTS widget_tiklama (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT,
        katalog_id INTEGER,
        site_id TEXT,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_widget_tiklama_ts ON widget_tiklama(ts DESC);
      CREATE INDEX IF NOT EXISTS idx_widget_tiklama_ref ON widget_tiklama(ref);
    `);
    return true;
  } catch {
    return false;
  }
}

/**
 * Widget CTA tıklamasını kaydeder. Hata olsa bile yönlendirme bozulmaz.
 * @returns {boolean}
 */
export function widgetTiklamaKaydet({ ref, katalogId, siteId } = {}) {
  try {
    widgetTablosuHazirla();
    dbBaglantisi().prepare(`
      INSERT INTO widget_tiklama (ref, katalog_id, site_id, ts)
      VALUES (?, ?, ?, ?)
    `).run(
      refTemizle(ref),
      Number.isFinite(Number(katalogId)) ? Number(katalogId) : null,
      siteId ? String(siteId).slice(0, 40) : null,
      Date.now(),
    );
    return true;
  } catch {
    return false;
  }
}

/** Widget tıklama özeti (Ayarlar/testler için). */
export function widgetIstatistik({ gun = 30 } = {}) {
  try {
    widgetTablosuHazirla();
    const esik = Date.now() - Math.max(1, Number(gun) || 30) * 86400000;
    const toplam = Number(dbBaglantisi().prepare(
      'SELECT COUNT(*) a FROM widget_tiklama WHERE ts >= ?',
    ).get(esik)?.a || 0);
    const refler = dbBaglantisi().prepare(`
      SELECT COALESCE(ref, '(dogrudan)') ref, COUNT(*) adet
      FROM widget_tiklama WHERE ts >= ? GROUP BY ref ORDER BY adet DESC LIMIT 20
    `).all(esik).map(r => ({ ref: r.ref, adet: Number(r.adet) }));
    return { ok: true, gun: Number(gun) || 30, toplam, refler };
  } catch {
    return { ok: false, gun, toplam: 0, refler: [] };
  }
}

/** Çoklu ürün önizlemesi (modal canlı önizleme için). */
export function widgetOrnekUrunler({ limit = 6 } = {}) {
  const satirlar = katalogSatirlari();
  const cikti = [];
  for (const r of satirlar) {
    if (cikti.length >= Math.max(1, Math.min(20, Number(limit) || 6))) break;
    let d = null;
    try { d = JSON.parse(r.veri); } catch { continue; }
    if (!d || !(Number(d.fiyat) > 0)) continue;
    cikti.push({
      id: Number(r.id),
      slug: slugYap(r.ad),
      ad: String(d.ad || r.ad || ''),
      site: d.site || null,
      fiyat: say(d.fiyat),
    });
  }
  return cikti;
}
