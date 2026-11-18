/**
 * 🧩 Slicer Öneri API'si (2026-11-06)
 *
 * AMAÇ: Cura / Bambu Studio / OrcaSlicer / PrusaSlicer eklentileri, dilimleme
 * bittiğinde "bu baskı kaç gram, en ucuz makara hangisi" sorusunu saniyeler
 * içinde yanıtlayabilsin. Kullanıcı web sitesine gitmek zorunda kalmaz.
 *
 * UÇ: `GET /api/embed/oner?malzeme=PLA&gramaj=340&renk=Siyah&kaynak=cura`
 *
 * DÜRÜSTLÜK:
 *  - Yalnızca `radar_durum` içindeki GERÇEK stoklu filamentler kullanılır.
 *  - İstenen malzeme/renk bulunamazsa fiyat UYDURULMAZ; `status:'bulunamadi'`
 *    ve açıklayıcı `bildirimMetni` döner (slicer tarafı sessizce hiçbir şey
 *    göstermez veya "alternatif yok" der).
 *  - Malzeme ailesi katı eşleşir: PLA sorgusu PETG/ABS/TPU/PLA-CF makarası
 *    önermez (bunlar farklı malzemedir, fiyatları kıyaslanamaz).
 *
 * PERFORMANS: 60 sn'lik bellek içi önbellek + tek SQL sorgusu. Hedef < 50 ms.
 */
import { dbBaglantisi } from './store.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { config } from './config.js';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** Türkçe katlama (malzeme/renk karşılaştırması için). */
function katla(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

const sayi = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const yuvarla = (x, b = 2) => Math.round(Number(x) * 10 ** b) / 10 ** b;

/**
 * Metinden MALZEME AİLESİ çıkarır.
 *
 * Sıra önemlidir: PLA-CF, PLA'dan ÖNCE kontrol edilir (karbon fiber katkılı
 * makara düz PLA fiyatıyla kıyaslanamaz — 2 kat pahalıdır).
 *
 * @param {string} metin
 * @returns {'PLA'|'PLA-CF'|'PETG'|'ABS'|'ASA'|'TPU'|'PA'|'PC'|'RESIN'|null}
 */
export function malzemeAilesi(metin) {
  const t = katla(metin);
  if (!t) return null;
  if (/pla[\s-]*cf|karbon\s*fiber|carbon\s*fiber/.test(t)) return 'PLA-CF';
  if (/petg/.test(t)) return 'PETG';
  if (/\basa\b/.test(t)) return 'ASA';
  if (/\babs\b/.test(t)) return 'ABS';
  if (/tpu|esnek|flexible/.test(t)) return 'TPU';
  if (/naylon|nylon|\bpa\b|\bpa6\b|\bpa12\b/.test(t)) return 'PA';
  if (/\bpc\b|policarbonat|polycarbonate/.test(t)) return 'PC';
  if (/recine|resin/.test(t)) return 'RESIN';
  if (/pla/.test(t)) return 'PLA'; // pla, pla+, xpla, epla, hyper pla
  return null;
}

/** Sorgu malzemesini normalize eder (kullanıcı "PLA+" yazsa da aile PLA). */
export function malzemeNormalize(ham) {
  const a = malzemeAilesi(ham);
  if (a) return a;
  const s = String(ham || '').toUpperCase().trim();
  return s || 'PLA';
}

/** Renk niyetini normalize eder; eşleşme esnek (siyah ↔ black). */
const RENK_ESLEME = {
  siyah: ['siyah', 'black'],
  beyaz: ['beyaz', 'white', 'kemik'],
  gri: ['gri', 'grey', 'gray', 'gumus', 'silver', 'antrasit', 'acik gri', 'koyu gri'],
  kirmizi: ['kirmizi', 'red'],
  mavi: ['mavi', 'blue', 'lacivert', 'navy'],
  yesil: ['yesil', 'green', 'nane'],
  sari: ['sari', 'yellow'],
  turuncu: ['turuncu', 'orange'],
  mor: ['mor', 'purple', 'lila'],
  pembe: ['pembe', 'pink'],
  bej: ['bej', 'beige', 'krem', 'cream', 'ten', 'latte'],
  altin: ['altin', 'gold'],
  seffaf: ['seffaf', 'transparan', 'clear', 'natural', 'naturel'],
};

/** Renk adını katlar ve eş anlamlılarını döndürür. */
export function renkEsleme(renk) {
  const k = katla(renk).trim();
  if (!k) return null;
  for (const [, esler] of Object.entries(RENK_ESLEME)) {
    if (esler.some(e => k === e || k.includes(e) || e.includes(k))) return esler;
  }
  return [k];
}

/* ------------------------------------------------------------------ */
/* En ucuz filament bulma                                             */
/* ------------------------------------------------------------------ */

/**
 * Radar durumundaki STOKLU filamentlerden, istenen malzeme (ve varsa renk)
 * için en ucuz ₺/kg'yi döndürür.
 *
 * @param {{malzeme?:string, renk?:string, limit?:number}} [opts]
 * @returns {{ok:boolean, neden?:string, urun?:object, alternatifler?:number}}
 */
export function slicerFilamentBul(opts = {}) {
  const istenenAile = malzemeNormalize(opts.malzeme);
  const renkler = renkEsleme(opts.renk);

  let satirlar = [];
  try {
    satirlar = dbBaglantisi().prepare(`
      SELECT katalog_id, urun, site, site_id, fiyat, stokta, ts, veri
      FROM radar_durum WHERE stokta = 1 ORDER BY fiyat ASC
    `).all();
  } catch {
    return { ok: false, neden: 'Veritabanı okunamadı.' };
  }

  const adaylar = [];
  const gorulen = new Set();

  for (const r of satirlar) {
    let d = null;
    try { d = JSON.parse(r.veri); } catch { continue; }
    if (!d || typeof d !== 'object') continue;
    if (String(d.kategori || '').toLowerCase() !== 'filament') continue;

    const fiyat = sayi(r.fiyat);
    if (!fiyat) continue;

    const ad = String(d.ad || r.urun || '').trim();
    if (!ad) continue;

    // Malzeme ailesi: başlık + ilan + kayıtlı hammadde alanı birlikte değerlendirilir.
    const aile = malzemeAilesi(`${ad} ${d.urun || ''}`)
      || malzemeAilesi(d.malzeme || '');
    if (!aile || aile !== istenenAile) continue;

    // ₺/kg: kartın birim fiyatı; yoksa başlıktaki gramajdan türetilir.
    let tlKg = sayi(d.birimFiyat);
    if (!tlKg) {
      const m = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/i.exec(String(d.urun || ad));
      if (m) {
        const miktar = parseFloat(String(m[1]).replace(',', '.'));
        const gram = m[2].toLowerCase() === 'kg' ? miktar * 1000 : miktar;
        if (gram >= 100) tlKg = fiyat / (gram / 1000);
      }
    }
    if (!tlKg || tlKg <= 0) continue;

    // Tekil ürün adı (aynı ürün farklı mağazalarda olabilir → en ucuz zaten ilk).
    const anahtar = katla(ad);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);

    const url = d.afiliyeUrl || d.hamUrl || null;
    if (!url) continue;

    // Renk uyumu (yalnızca renk istendiyse ve aday renk taşıyorsa ceza/eleme)
    const baslikKucuk = katla(`${ad} ${d.urun || ''}`);
    const renkUyum = renkler
      ? renkler.some(x => baslikKucuk.includes(x))
      : null;

    adaylar.push({
      katalogId: Number(r.katalog_id),
      ad,
      ilan: d.urun || null,
      site: d.site || null,
      siteId: d.site_id || d.siteId || null,
      fiyat: yuvarla(fiyat, 2),      // makara (1 kg) fiyatı
      tlKg: yuvarla(tlKg, 2),
      stok: true,
      url,
      aile,
      renkUyum,
      ts: Number(r.ts) || null,
    });
  }

  if (!adaylar.length) {
    return {
      ok: false,
      neden: `Stokta ${istenenAile} filament bulunamadı.`,
      aile: istenenAile,
    };
  }

  // Sıralama: renk uyumu → ₺/kg artan.
  adaylar.sort((a, b) => {
    if (renkler) {
      const ra = a.renkUyum === true ? 0 : 1;
      const rb = b.renkUyum === true ? 0 : 1;
      if (ra !== rb) return ra - rb;
    }
    return a.tlKg - b.tlKg;
  });

  const enIyi = adaylar[0];
  return {
    ok: true,
    urun: enIyi,
    alternatifler: adaylar.length - 1,
    renkBulundu: renkler ? enIyi.renkUyum === true : null,
  };
}

/* ------------------------------------------------------------------ */
/* Öneri hesabı                                                       */
/* ------------------------------------------------------------------ */

/** 60 sn bellek içi önbellek (cache-control ile uyumlu). */
const ONERI_CACHE = new Map();
const ONERI_TTL_MS = 60 * 1000;

/**
 * Slicer için tam öneri yükü.
 *
 * @param {{malzeme?:string, gramaj?:number, renk?:string, kaynak?:string,
 *          tabanUrl?:string, simdi?:number}} [girdi]
 */
export function slicerOneri(girdi = {}) {
  const malzeme = malzemeNormalize(girdi.malzeme);
  const gramajHam = Number(girdi.gramaj);
  const gramaj = Number.isFinite(gramajHam) && gramajHam > 0
    ? yuvarla(gramajHam, 2)
    : null;
  const renk = String(girdi.renk || '').trim() || null;
  const kaynak = String(girdi.kaynak || '').trim().toLowerCase() || null;
  const taban = String(girdi.tabanUrl || config.publicUrl || '').replace(/\/+$/, '');

  const temel = {
    talep: { malzeme, gramaj, renk, kaynak },
  };

  if (!gramaj) {
    return {
      status: 'hata',
      ...temel,
      hata: 'gramaj parametresi gerekli (ör. gramaj=340)',
      enUcuz: null,
      bildirimMetni: 'Gramaj bilgisi olmadan filament ihtiyacı hesaplanamaz.',
    };
  }

  const bulunan = slicerFilamentBul({ malzeme, renk });
  if (!bulunan.ok) {
    return {
      status: 'bulunamadi',
      ...temel,
      hata: bulunan.neden,
      enUcuz: null,
      bildirimMetni: `Bu baskı ${gramaj} g ${malzeme} gerektiriyor, ancak stokta `
        + `${malzeme} filament bulunamadı.`,
    };
  }

  const u = bulunan.urun;
  // Parça başı maliyet: makara fiyatı üzerinden gramaj oranı.
  const parcaBasiMaliyet = yuvarla((gramaj / 1000) * u.fiyat, 2);
  const makaradanCikanAdet = Math.max(1, Math.floor(1000 / gramaj));
  const kalanGramaj = yuvarla(1000 - (gramaj % 1000), 1);

  // Yönlendirme: tıklama kaydı + ref atfı için kendi ucumuzdan geçir.
  const parametreler = new URLSearchParams();
  parametreler.set('urunId', String(u.katalogId));
  if (kaynak) parametreler.set('kaynak', kaynak);
  if (renk) parametreler.set('renk', renk);
  const yonlendirmeLinki = taban
    ? `${taban}/yonlendir?${parametreler.toString()}`
    : (u.url || null);

  const renkNotu = renk
    ? (bulunan.renkBulundu ? `${renk} ` : `${renk} (muadil renk) `)
    : '';
  const bildirimMetni = `Bu baskı ${gramaj} g ${renkNotu}${malzeme} gerektiriyor. `
    + `En ucuz alternatif ₺${u.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
    + `ile ${u.site} mağazasında! (Parça maliyeti: ₺${parcaBasiMaliyet.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

  return {
    status: 'success',
    ...temel,
    enUcuz: {
      urunAdi: u.ad,
      ilan: u.ilan,
      magaza: u.site,
      siteId: u.siteId,
      fiyat: u.fiyat,
      tlKg: u.tlKg,
      parcaBasiMaliyet,
      makaradanCikanAdet,
      kalanGramaj,
      stok: true,
      renkUyum: renk ? u.renkUyum === true : null,
      yonlendirmeLinki,
      hamLink: u.url,
      guncelleme: u.ts,
    },
    alternatifSayisi: bulunan.alternatifler || 0,
    bildirimMetni,
  };
}

/**
 * Önbellekli öneri (60 sn).
 * Anahtar: malzeme|gramaj|renk|kaynak
 */
export function slicerOneriOnbellekli(girdi = {}) {
  const malzeme = malzemeNormalize(girdi.malzeme);
  const gramaj = Number(girdi.gramaj) > 0 ? Number(girdi.gramaj) : null;
  const renk = String(girdi.renk || '').trim() || '';
  const kaynak = String(girdi.kaynak || '').trim().toLowerCase();
  const anahtar = `${malzeme}|${gramaj ?? ''}|${katla(renk)}|${kaynak}`;
  const simdi = Number.isFinite(girdi.simdi) ? girdi.simdi : Date.now();

  const kayit = ONERI_CACHE.get(anahtar);
  if (kayit && simdi - kayit.ts < ONERI_TTL_MS) {
    return { ...kayit.veri, onbellek: true };
  }

  const veri = slicerOneri({ ...girdi, tabanUrl: girdi.tabanUrl });
  ONERI_CACHE.set(anahtar, { ts: simdi, veri });
  if (ONERI_CACHE.size > 500) {
    const ilk = ONERI_CACHE.keys().next().value;
    ONERI_CACHE.delete(ilk);
  }
  return veri;
}

/** Test/teşhis: önbelleği temizler. */
export function slicerOnbellekTemizle() {
  ONERI_CACHE.clear();
}

/* ------------------------------------------------------------------ */
/* Express bağlama                                                    */
/* ------------------------------------------------------------------ */

/** CORS başlıkları — slicer'lar tarayıcı dışından ve tarayıcıdan çağırabilir. */
function corsBasliklari(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** Express uçlarını bağlar. */
export function slicerApiBagla(app) {
  // Preflight (tarayıcı tabanlı eklentiler için)
  app.options('/api/embed/oner', (req, res) => {
    corsBasliklari(res);
    res.status(204).end();
  });

  app.get('/api/embed/oner', (req, res) => {
    try {
      corsBasliklari(res);
      const veri = slicerOneriOnbellekli({
        malzeme: req.query.malzeme,
        gramaj: req.query.gramaj,
        renk: req.query.renk,
        kaynak: req.query.kaynak,
        tabanUrl: config.publicUrl,
      });
      // 60 sn tarayıcı önbelleği (spec) + biraz bayat kullanım payı.
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      // Gramaj eksikse 400 ver — sessizce "0 TL" dönmek yanıltıcı olurdu.
      if (veri.status === 'hata') return res.status(400).json(veri);
      res.json(veri);
    } catch (e) {
      corsBasliklari(res);
      res.status(500).json({
        status: 'hata',
        hata: String(e.message || e).slice(0, 200),
        enUcuz: null,
        bildirimMetni: 'Öneri alınamadı.',
      });
    }
  });
}
