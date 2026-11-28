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
import { seoUrunListesi } from './seoSayfalar.js';
import { normalizeDil, dilByMarket } from './i18n/index.js';
import { normalizeMarket, PAZARLAR } from './sites/index.js';

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

const NEDEN_METNI = Object.freeze({
  tr: {
    bulunamadi: 'Ürün radar kataloğunda bulunamadı.',
    taranmadi: 'Bu ürün henüz taranmadı; fiyat bilgisi yok.',
    fiyatsiz: 'Ürün için geçerli fiyat kaydı yok.',
    baglantisiz: 'Ürün bağlantısı kayıtlı değil.',
  },
  en: {
    bulunamadi: 'No tracked product matched your query in this market.',
    taranmadi: 'Live pricing for this item has not been collected yet.',
    fiyatsiz: 'No valid in-stock price record is available right now.',
    baglantisiz: 'Store link is not available for this item.',
  },
  fr: {
    bulunamadi: 'Aucun produit suivi ne correspond à cette recherche.',
    taranmadi: 'Le prix en direct n’a pas encore été relevé pour cet article.',
    fiyatsiz: 'Aucun tarif valide n’est disponible pour le moment.',
    baglantisiz: 'Le lien vers la boutique est indisponible.',
  },
  ja: {
    bulunamadi: '対象マーケットで一致する商品が見つかりませんでした。',
    taranmadi: 'この商品のリアルタイム価格データはまだ収集されていません。',
    fiyatsiz: '有効な価格データが現在ありません。',
    baglantisiz: 'ショップURLが登録されていません。',
  },
});

/** Widget opts içinden market (`tr|us|fr|jp|eu`), dil (`tr|en|fr|ja`) ve mod (`varsayilan|karsilastir`) çözer. */
export function widgetPazarCoz(opts = {}) {
  const hamMarket = opts.market != null && String(opts.market).trim() !== '' ? String(opts.market).trim() : null;
  const hamDil = opts.lang != null && String(opts.lang).trim() !== '' ? String(opts.lang).trim() : null;
  const sayisalId = Number.isFinite(Number(opts.id)) && Number(opts.id) > 0;
  const market = hamMarket
    ? normalizeMarket(hamMarket)
    : (sayisalId ? 'tr' : (hamDil ? normalizeMarket(hamDil) : 'tr'));
  const lang = hamDil ? normalizeDil(hamDil) : dilByMarket(market);
  const hamMod = String(opts.mod || '').trim().toLowerCase();
  const mod = (hamMod === 'karsilastir' || hamMod === 'compare' || opts.sade === '1' || opts.sade === true)
    ? 'karsilastir'
    : 'varsayilan';
  const currency = PAZARLAR[market]?.currency || 'TRY';
  return { market, lang, mod, currency };
}

function urunSatirindanAra(satirlar, opts = {}) {
  if (!Array.isArray(satirlar) || !satirlar.length) return null;

  const idSayi = Number(opts.id);
  if (Number.isFinite(idSayi) && idSayi > 0) {
    return satirlar.find(r => Number(r.id) === idSayi) || null;
  }
  const idHam = opts.id != null ? String(opts.id).trim() : '';
  if (idHam) {
    return satirlar.find(r => String(r.id) === idHam) || null;
  }

  const slug = slugYap(opts.slug || '');
  if (slug) {
    const tam = satirlar.find(r => (r.slug || slugYap(r.ad)) === slug);
    if (tam) return tam;
    const kismi = satirlar.find(r => (r.slug || slugYap(r.ad)).includes(slug));
    if (kismi) return kismi;
    if (slug.length >= 6) {
      const ters = satirlar.find(r => slug.includes(r.slug || slugYap(r.ad)));
      if (ters) return ters;
    }
    const kelimeler = slug.split('-').filter(w => w.length >= 2);
    if (kelimeler.length) {
      let enIyi = null;
      let enIyiOran = 0;
      for (const r of satirlar) {
        const hedef = new Set((r.slug || slugYap(r.ad)).split('-').filter(Boolean));
        if (!hedef.size) continue;
        let eslesen = 0;
        for (const w of kelimeler) {
          if (hedef.has(w)) eslesen++;
          else if ([...hedef].some(h => h.startsWith(w) || w.startsWith(h))) eslesen += 0.5;
        }
        const oran = eslesen / kelimeler.length;
        if (oran > enIyiOran) { enIyiOran = oran; enIyi = r; }
      }
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
      if (metin.includes(q) || oran >= 0.6) puanli.push({ r, oran });
    }
    if (puanli.length) {
      puanli.sort((a, b) => b.oran - a.oran);
      return puanli[0].r;
    }
  }

  return null;
}

/**
 * Ürünü kimliğine göre çözer (yerel TR radar + küresel seoUrunListesi).
 *
 * @param {{id?:string|number, slug?:string, q?:string, market?:string, lang?:string}} [opts]
 * @returns {object|null}
 */
export function widgetUrunBul(opts = {}) {
  const { market } = widgetPazarCoz(opts);
  if (market === 'tr') {
    const radar = urunSatirindanAra(katalogSatirlari(), opts);
    if (radar) return radar;
    // Parametresiz veya geçersiz sayısal id fallback'e düşmesin (yanlış eşleşmeyi önler).
    const idSayi = Number(opts.id);
    if (Number.isFinite(idSayi) && idSayi > 0) return null;
    if (!opts.slug && !opts.q) return null;
    try {
      return urunSatirindanAra(seoUrunListesi({ market: 'tr' }), opts);
    } catch {
      return null;
    }
  }
  try {
    return urunSatirindanAra(seoUrunListesi({ market }), opts);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Widget yükü                                                         */
/* ------------------------------------------------------------------ */

/**
 * Widget için HERKESE AÇIK ürün yükü.
 *
 * @param {{id?:string|number, slug?:string, q?:string, ref?:string, tema?:string, market?:string, lang?:string, mod?:string, sade?:string|boolean, tabanUrl?:string}} [opts]
 * @returns {{
 *   ok:boolean, bulundu:boolean, neden:string|null,
 *   lang:string, market:string, mod:string, currency:string, karsilastirUrl:string|null,
 *   urun:object|null, afiliye:boolean, gitUrl:string|null, guncelleme:number|null
 * }}
 */
export function widgetVerisi(opts = {}) {
  const ref = refTemizle(opts.ref);
  const taban = String(opts.tabanUrl || '').replace(/\/+$/, '');
  const { market, lang, mod, currency } = widgetPazarCoz(opts);
  const msg = NEDEN_METNI[lang] || NEDEN_METNI.tr;
  const bos = (neden) => ({
    ok: true,
    bulundu: false,
    neden,
    lang,
    market,
    mod,
    currency,
    karsilastirUrl: null,
    urun: null,
    afiliye: false,
    gitUrl: null,
    guncelleme: null,
  });

  let kayit = null;
  try { kayit = widgetUrunBul({ ...opts, market, lang }); } catch { kayit = null; }
  if (!kayit) return bos(msg.bulunamadi);

  let fiyat = null;
  let stokta = false;
  let hamUrl = null;
  let site = null;
  let siteId = null;
  let birimMetni = null;
  let kargo = null;
  let gercekFirsat = false;
  let guncelleme = null;
  let ad = String(kayit.ad || 'Product').slice(0, 160);
  let kategori = String(kayit.kategori || 'genel');
  const radarSatirMi = Object.prototype.hasOwnProperty.call(kayit, 'veri');
  const slug = kayit.slug ? String(kayit.slug) : slugYap(kayit.ad);

  if (radarSatirMi) {
    let d = null;
    try { d = JSON.parse(kayit.veri); } catch { d = null; }
    if (!d || typeof d !== 'object') return bos(msg.taranmadi);
    fiyat = say(d.fiyat);
    if (fiyat == null) return bos(msg.fiyatsiz);
    stokta = d.stokta === true;
    hamUrl = d.hamUrl || d.afiliyeUrl || null;
    if (!hamUrl) return bos(msg.baglantisiz);
    site = d.site || null;
    siteId = d.siteId || null;
    birimMetni = d.birimMetni || null;
    kargo = d.kargo || null;
    gercekFirsat = d.sahteIndirim?.gercekFirsat === true;
    guncelleme = Number(d.ts) || null;
    ad = String(d.ad || kayit.ad || 'Ürün').slice(0, 160);
    kategori = String(d.kategori || kayit.kategori || 'genel');
  } else {
    const teklifler = Array.isArray(kayit.teklifler) ? kayit.teklifler : [];
    const enIyiTeklif = teklifler.find(t => t.stokta && Number(t.fiyat) > 0) || teklifler[0] || null;
    fiyat = say(kayit.enUcuzFiyat ?? enIyiTeklif?.fiyat);
    if (fiyat == null) return bos(msg.fiyatsiz);
    stokta = Boolean(enIyiTeklif?.stokta || (Number(kayit.stokluSayisi) > 0 && fiyat > 0));
    hamUrl = kayit.enUcuzUrl || enIyiTeklif?.url || null;
    if (!hamUrl) return bos(msg.baglantisiz);
    site = enIyiTeklif?.site || kayit.enUcuzSite || null;
    siteId = enIyiTeklif?.siteId || null;
    birimMetni = kayit.birimMetni || null;
    kargo = enIyiTeklif?.kargo || null;
    gercekFirsat = false;
    guncelleme = Number(kayit.sonTs) || Date.now();
  }

  let hedef = hamUrl;
  let afiliye = false;
  try {
    const bagli = afiliyeLink(siteId, hamUrl, afiliyeAyarlari());
    if (bagli && bagli !== hamUrl) { hedef = bagli; afiliye = true; }
  } catch { /* afiliye yoksa ham link kullanılır */ }

  const numericId = Number.isFinite(Number(kayit.id)) && Number(kayit.id) > 0 ? Number(kayit.id) : null;
  const parametreler = new URLSearchParams();
  if (numericId) parametreler.set('id', String(numericId));
  else parametreler.set('urun', slug);
  if (market !== 'tr') parametreler.set('market', market);
  if (lang !== 'tr') parametreler.set('lang', lang);
  if (mod === 'karsilastir') parametreler.set('mod', 'karsilastir');
  if (ref) parametreler.set('ref', ref);
  if (opts.tema) parametreler.set('tema', String(opts.tema));
  const gitUrl = taban ? `${taban}/widget/git?${parametreler.toString()}` : null;

  const karsilastirYol = market === 'tr'
    ? `/urun/${slug}`
    : `/${dilByMarket(market)}/urun/${slug}`;
  const karsilastirUrl = (taban ? `${taban}${karsilastirYol}` : karsilastirYol)
    + (ref ? `?ref=${encodeURIComponent(ref)}` : '');

  return {
    ok: true,
    bulundu: true,
    neden: null,
    lang,
    market,
    mod,
    currency: kayit.paraBirimi || currency,
    karsilastirUrl,
    guncelleme,
    afiliye,
    hedef,
    gitUrl: gitUrl || hedef,
    urun: {
      id: numericId,
      slug,
      ad,
      kategori,
      site,
      siteId,
      fiyat,
      currency: kayit.paraBirimi || currency,
      stokta,
      birimMetni,
      kargo,
      gercekFirsat,
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

/** Çoklu ürün önizlemesi (modal & /en/embed canlı önizleme için). */
export function widgetOrnekUrunler({ limit = 6, market = 'tr' } = {}) {
  const max = Math.max(1, Math.min(20, Number(limit) || 6));
  const m = normalizeMarket(market);
  const currency = PAZARLAR[m]?.currency || 'TRY';
  const cikti = [];
  if (m === 'tr') {
    for (const r of katalogSatirlari()) {
      if (cikti.length >= max) break;
      let d = null;
      try { d = JSON.parse(r.veri); } catch { continue; }
      if (!d || !(Number(d.fiyat) > 0)) continue;
      cikti.push({
        id: Number(r.id),
        slug: slugYap(r.ad),
        ad: String(d.ad || r.ad || ''),
        site: d.site || null,
        fiyat: say(d.fiyat),
        currency,
        market: m,
      });
    }
    if (cikti.length >= max) return cikti;
  }
  try {
    const goruldu = new Set(cikti.map(x => x.slug));
    for (const u of seoUrunListesi({ market: m })) {
      if (cikti.length >= max) break;
      if (!(Number(u.enUcuzFiyat) > 0) || !u.slug || goruldu.has(u.slug)) continue;
      goruldu.add(u.slug);
      cikti.push({
        id: Number.isFinite(Number(u.id)) && Number(u.id) > 0 ? Number(u.id) : null,
        slug: u.slug,
        ad: String(u.ad || ''),
        site: u.enUcuzSite || null,
        fiyat: say(u.enUcuzFiyat),
        currency: u.paraBirimi || currency,
        market: m,
      });
    }
  } catch { /* katalog boşsa sessizce dön */ }
  return cikti;
}
