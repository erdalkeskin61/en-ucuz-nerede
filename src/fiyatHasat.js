/**
 * 🔁 Fiyat Hasadı — "fiyatsız sitemap ürünü" köprüsü (2026-11-28)
 *
 * SORUN
 * -----
 * Katalog indeksinde iki tür mağaza var:
 *   A) Beslemesinde FİYAT olanlar (Shopify products.json, Woo Store API)
 *      → 3dteknomarket, porima3d, filamenthane, rfturkiye
 *   B) Yalnızca SITEMAP yayınlayanlar (fiyat yok, sadece URL)
 *      → robotistan, robitshop, 3dcim, kirpilab, efilament, matersan, robotizmo
 *
 * B grubundaki ~15.000 ürün, `fiyat IS NULL` olduğu için SEO ürün sayfalarına
 * HİÇ giremiyor. Sonuç: 587 sayfadan yalnızca 49'u dizinlenebilir (diğerleri
 * tek teklifli = ince içerik).
 *
 * ÇÖZÜM
 * -----
 * Bir ürün A grubunda fiyatlıysa ve B grubunda aynı adla (temizBaslik birebir)
 * duruyorsa, B mağazasının ürün sayfasını BİR KEZ okuyup gerçek fiyatı alırız.
 * Ürün "tek teklif"ten "iki+ teklif"e çıkar → dizinlenebilir olur → sitemap
 * ve uzun kuyruk trafiği büyür.
 *
 * DÜRÜSTLÜK KURALLARI
 * -------------------
 *  • Fiyat YALNIZCA sayfada gerçekten yazıyorsa yazılır (JSON-LD → meta → DOM
 *    kaskadı). Bulunamazsa `fiyat` NULL kalır; uydurma yok.
 *  • Sayfa başlığı katalog başlığıyla eşleşmelidir (yanlış ürünün fiyatını
 *    yazmamak için). Eşleşmezse atlanır ve deftere `yok` yazılır.
 *  • Her satırın gerçek çekim zamanı (`guncellemeTs`) saklanır.
 *  • 404/410 dönen URL'ler 14 gün, fiyatsız çıkanlar 3 gün yeniden denenmez
 *    (`katalog_hasat` defteri) → hedef site yorulmaz.
 *  • Site başına eşzamanlılık 2, istekler arası nazik bekleme.
 */

import { dbBaglantisi } from './store.js';
import { adapterById } from './sites/index.js';
import { fetchPage } from './scraper.js';
import { extractSelfHealingPrice } from './selfHealingParser.js';
import { titleSimilarity } from './util.js';

/* ================================================================== */
/* Ayarlar                                                            */
/* ================================================================== */

const envInt = (ad, varsayilan) => {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : varsayilan;
};

/** Tur başına en fazla kaç sayfa okunur (siteyi yormamak için). */
export const HASAT_MAKS = envInt('HASAT_MAKS', 300);
/** Eşzamanlı istek sayısı (site başına değil, toplam). */
const ESZAMANLI = envInt('HASAT_ESZAMANLI', 2);
/** İstekler arası bekleme (ms). */
const ARASI_MS = envInt('HASAT_ARASI_MS', 700);
/** Fiyatsız çıkan sayfa kaç gün sonra yeniden denenir. */
const FIYATSIZ_TEKRAR_GUN = envInt('HASAT_FIYATSIZ_GUN', 3);
/** 404/410 dönen sayfa kaç gün sonra yeniden denenir. */
const YOK_TEKRAR_GUN = envInt('HASAT_YOK_GUN', 14);
/** Zamanlayıcı aralığı (varsayılan 6 saat). */
export const HASAT_ARALIK_MS = envInt('HASAT_ARALIK_SAAT', 6) * 60 * 60 * 1000;
/** Sayfa başlığı eşleşme eşiği. */
const BASLIK_ESIK = 0.55;

/* ================================================================== */
/* Durum                                                              */
/* ================================================================== */

const durum = {
  calisiyor: false,
  sonBaslangic: null,
  sonBitis: null,
  sonSureMs: null,
  sonRapor: null,
  hata: null,
  toplamBulunan: 0,   // bugüne kadar fiyatı yazılan toplam ürün
  aralikMs: HASAT_ARALIK_MS,
};

let zamanlayici = null;
let devamEdiyor = null;

const uyu = (ms) => new Promise(r => setTimeout(r, ms));

/* ================================================================== */
/* Aday seçimi                                                        */
/* ================================================================== */

/**
 * Fiyatı eksik ama başka mağazada fiyatlı olan ürünleri seçer.
 *
 * @param {{limit?:number, siteler?:string[]}} [opts]
 * @returns {Array<{siteId:string, urunUrl:string, baslik:string, temizBaslik:string, rakipSite:string}>}
 */
export function hasatAdaylari(opts = {}) {
  const limit = Math.max(1, Math.min(2000, Number(opts.limit) || HASAT_MAKS));
  const simdi = Date.now();
  const fiyatsizEsik = simdi - FIYATSIZ_TEKRAR_GUN * 86400000;
  const yokEsik = simdi - YOK_TEKRAR_GUN * 86400000;

  try {
    const db = dbBaglantisi();
    // Fiyatlı ürünlerin başlık kümesi (hangi temizBaslik için rakip var?)
    const fiyatliBasliklar = db.prepare(`
      SELECT DISTINCT temizBaslik FROM katalog_urunleri
      WHERE fiyat IS NOT NULL AND fiyat > 0
    `).all().map(r => r.temizBaslik);

    if (!fiyatliBasliklar.length) return [];
    const kume = new Set(fiyatliBasliklar);

    // Fiyatsız satırlar (sitemap mağazaları)
    let sql = `
      SELECT siteId, urunUrl, baslik, temizBaslik
      FROM katalog_urunleri
      WHERE fiyat IS NULL AND stokta IS NOT 0
    `;
    const args = [];
    if (Array.isArray(opts.siteler) && opts.siteler.length) {
      sql += ` AND siteId IN (${opts.siteler.map(() => '?').join(',')})`;
      args.push(...opts.siteler);
    }
    sql += ' ORDER BY guncellemeTs DESC LIMIT 20000';
    const satirlar = db.prepare(sql).all(...args);

    // Hasat defteri: yakın zamanda denenenleri atla
    const defter = new Map();
    for (const d of db.prepare('SELECT siteId, urunUrl, sonDenemeTs, durum FROM katalog_hasat').all()) {
      defter.set(d.siteId + '|' + d.urunUrl, d);
    }

    const adaylar = [];
    for (const s of satirlar) {
      if (!kume.has(s.temizBaslik)) continue;   // rakip fiyat yok → kıyas üretmez
      const d = defter.get(s.siteId + '|' + s.urunUrl);
      if (d) {
        const esik = d.durum === 'yok' ? yokEsik : fiyatsizEsik;
        if (Number(d.sonDenemeTs) > esik) continue; // yakında denendi
      }
      adaylar.push({
        siteId: s.siteId,
        urunUrl: s.urunUrl,
        baslik: s.baslik,
        temizBaslik: s.temizBaslik,
      });
      if (adaylar.length >= limit) break;
    }
    return adaylar;
  } catch {
    return [];
  }
}

/* ================================================================== */
/* Tek sayfa okuma                                                    */
/* ================================================================== */

/** JSON-LD Product fiyatını (varsa) döndürür. */
function jsonLdFiyat(html) {
  for (const m of String(html || '').matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const liste = Array.isArray(j) ? j : [j];
      for (const x of liste) {
        if (!x || x['@type'] !== 'Product') continue;
        const offers = Array.isArray(x.offers) ? x.offers[0] : x.offers;
        const f = Number(offers?.price ?? x.offers?.lowPrice);
        if (Number.isFinite(f) && f > 0) return f;
      }
    } catch { /* sonraki blok */ }
  }
  return null;
}

/** Sayfa başlığından `<title>`/`h1`/JSON-LD name çıkarır (doğrulama için). */
function sayfaBasligi(html) {
  const h1 = String(html || '').match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1];
  if (h1) {
    const t = h1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  const title = String(html || '').match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1];
  return title ? title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

async function tekSayfaHasat(aday) {
  const kayit = {
    siteId: aday.siteId,
    urunUrl: aday.urunUrl,
    baslik: aday.baslik,
    durum: 'hata',
    fiyat: null,
    not: '',
  };
  try {
    const r = await fetchPage(aday.urunUrl, {
      site: aday.siteId,
      purpose: 'urun',
      // Sitemap'ten gelen ürün sayfaları sabit; 6 saatlik önbellek yeter.
      fresh: false,
    });

    if (!r || r.status === 404 || r.status === 410) {
      kayit.durum = 'yok';
      kayit.not = `HTTP ${r?.status ?? '?'}`;
      return kayit;
    }
    const html = r.body || '';
    if (html.length < 800) {
      kayit.durum = 'yok';
      kayit.not = 'boş sayfa';
      return kayit;
    }

    // Kimlik doğrulaması: sayfa gerçekten bu ürün mü?
    const sayfaAd = sayfaBasligi(html);
    const benzerlik = sayfaAd ? titleSimilarity(aday.baslik, sayfaAd) : 0;
    if (benzerlik < BASLIK_ESIK) {
      kayit.durum = 'yok';
      kayit.not = `başlık uyuşmadı (%${Math.round(benzerlik * 100)})`;
      return kayit;
    }

    // Fiyat: JSON-LD → 5 kademeli self-healing kaskadı
    let fiyat = jsonLdFiyat(html);
    let kademe = fiyat != null ? 'json-ld' : null;
    if (fiyat == null) {
      const sh = extractSelfHealingPrice(html, null, aday.siteId);
      if (sh?.fiyat != null) { fiyat = sh.fiyat; kademe = sh.kademe; }
    }

    if (fiyat == null || !(fiyat > 1)) {
      kayit.durum = 'fiyatsiz';
      kayit.not = 'fiyat okunamadı';
      return kayit;
    }
    // Sanity: 10 TL – 500.000 TL (uydurma/parse hatası koruması)
    if (fiyat < 10 || fiyat > 500000) {
      kayit.durum = 'fiyatsiz';
      kayit.not = `fiyat aralık dışı (${fiyat})`;
      return kayit;
    }

    kayit.durum = 'fiyat';
    kayit.fiyat = Math.round(fiyat * 100) / 100;
    kayit.not = String(kademe || '');
    return kayit;
  } catch (e) {
    kayit.durum = 'hata';
    kayit.not = String(e?.message || e).slice(0, 120);
    return kayit;
  }
}

/* ================================================================== */
/* Deftere yazma                                                      */
/* ================================================================== */

function deftereYaz(kayit) {
  try {
    dbBaglantisi().prepare(`
      INSERT INTO katalog_hasat (siteId, urunUrl, sonDenemeTs, durum, fiyat, not_)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(siteId, urunUrl) DO UPDATE SET
        sonDenemeTs = excluded.sonDenemeTs,
        durum = excluded.durum,
        fiyat = excluded.fiyat,
        not_ = excluded.not_
    `).run(
      kayit.siteId, kayit.urunUrl, Date.now(), kayit.durum,
      kayit.fiyat ?? null, (kayit.not || '').slice(0, 200),
    );
  } catch { /* defter yazılamazsa hasat devam eder */ }
}

function fiyatiYaz(kayit) {
  try {
    const r = dbBaglantisi().prepare(`
      UPDATE katalog_urunleri
      SET fiyat = ?, stokta = 1, kaynakTur = 'sayfa', guncellemeTs = ?
      WHERE siteId = ? AND urunUrl = ?
    `).run(kayit.fiyat, Date.now(), kayit.siteId, kayit.urunUrl);
    return Number(r?.changes || 0);
  } catch {
    return 0;
  }
}

/* ================================================================== */
/* Çalıştırıcı                                                        */
/* ================================================================== */

/**
 * Hasadı çalıştırır. Eşzamanlı çalışmaz; aynı söz döner.
 *
 * @param {{limit?:number, siteler?:string[], kaynak?:string, onProgress?:Function}} [opts]
 */
export function fiyatHasadiniCalistir(opts = {}) {
  if (devamEdiyor) return devamEdiyor;

  durum.calisiyor = true;
  durum.sonBaslangic = Date.now();
  durum.hata = null;

  devamEdiyor = (async () => {
    const t0 = Date.now();
    const adaylar = hasatAdaylari({ limit: opts.limit, siteler: opts.siteler });
    const rapor = {
      kaynak: opts.kaynak || 'manuel',
      aday: adaylar.length,
      denenen: 0,
      fiyat: 0,
      fiyatsiz: 0,
      yok: 0,
      hata: 0,
      yazilan: 0,
      siteDagilim: {},
      ornek: [],
    };

    if (!adaylar.length) {
      durum.calisiyor = false;
      durum.sonBitis = Date.now();
      durum.sonSureMs = Date.now() - t0;
      durum.sonRapor = rapor;
      devamEdiyor = null;
      return rapor;
    }

    let imlec = 0;
    const isci = async () => {
      while (true) {
        const i = imlec++;
        if (i >= adaylar.length) return;
        const aday = adaylar[i];
        const sonuc = await tekSayfaHasat(aday);
        rapor.denenen++;
        rapor[sonuc.durum] = (rapor[sonuc.durum] || 0) + 1;
        if (sonuc.durum === 'fiyat') {
          const n = fiyatiYaz(sonuc);
          rapor.yazilan += n;
          durum.toplamBulunan += n;
          rapor.siteDagilim[aday.siteId] = (rapor.siteDagilim[aday.siteId] || 0) + 1;
          if (rapor.ornek.length < 12) {
            rapor.ornek.push({ site: aday.siteId, ad: aday.baslik.slice(0, 50), fiyat: sonuc.fiyat });
          }
        }
        deftereYaz(sonuc);
        if (typeof opts.onProgress === 'function') {
          opts.onProgress({ ...rapor, son: { site: aday.siteId, ad: aday.baslik.slice(0, 40), durum: sonuc.durum } });
        }
        if (ARASI_MS > 0) await uyu(ARASI_MS);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ESZAMANLI, adaylar.length) }, () => isci()),
    );

    durum.calisiyor = false;
    durum.sonBitis = Date.now();
    durum.sonSureMs = Date.now() - t0;
    durum.sonRapor = rapor;
    durum.hata = rapor.hata && rapor.hata === rapor.denenen ? 'Tüm istekler başarısız' : null;

    console.log(`[hasat] ${rapor.fiyat} fiyat yazıldı, ${rapor.denenen} denendi `
      + `(${rapor.fiyatsiz} fiyatsız, ${rapor.yok} yok, ${rapor.hata} hata) — `
      + `${Math.round(rapor.denenen / Math.max(1, durum.sonSureMs / 1000))} istek/sn`);

    // SEO listesi 60 sn önbellekli; yeni fiyatlar hemen görünsün.
    try {
      const { seoOnbelleginiTemizle } = await import('./seoSayfalar.js');
      if (typeof seoOnbelleginiTemizle === 'function') seoOnbelleginiTemizle();
    } catch { /* yoksay */ }

    devamEdiyor = null;
    return rapor;
  })();

  return devamEdiyor;
}

/* ================================================================== */
/* Durum / zamanlayıcı                                                */
/* ================================================================== */

/** Panel için hasat durumu + defter istatistikleri. */
export function hasatDurumu() {
  let defter = { fiyat: 0, fiyatsiz: 0, yok: 0, hata: 0, toplam: 0 };
  let bekleyen = 0;
  try {
    const db = dbBaglantisi();
    for (const r of db.prepare('SELECT durum, COUNT(*) c FROM katalog_hasat GROUP BY durum').all()) {
      defter[r.durum] = Number(r.c);
      defter.toplam += Number(r.c);
    }
    bekleyen = hasatAdaylari({ limit: 5000 }).length;
  } catch { /* yoksay */ }

  return {
    ...durum,
    defter,
    bekleyen,
    maksTur: HASAT_MAKS,
    eszamanli: ESZAMANLI,
    arasiMs: ARASI_MS,
    ayar: {
      fiyatsizTekrarGun: FIYATSIZ_TEKRAR_GUN,
      yokTekrarGun: YOK_TEKRAR_GUN,
      aralikSaat: Math.round(HASAT_ARALIK_MS / 3600000),
    },
  };
}

/** Arka plan hasadını başlatır (varsayılan 6 saat, ilk tur 90 sn sonra). */
export function hasatZamanlayiciBaslat({ aralikMs = HASAT_ARALIK_MS, ilkGecikmeMs = 90000 } = {}) {
  if (process.env.HASAT === '0') {
    console.log('[hasat] HASAT=0 → fiyat hasadı kapalı.');
    return null;
  }
  if (zamanlayici) return zamanlayici;
  durum.aralikMs = aralikMs;

  const calistir = () => {
    fiyatHasadiniCalistir({ kaynak: 'zamanlayici' }).catch((e) => {
      durum.hata = String(e?.message || e);
      durum.calisiyor = false;
      devamEdiyor = null;
    });
  };

  const ilk = setTimeout(calistir, Math.max(1000, ilkGecikmeMs));
  ilk.unref?.();
  zamanlayici = setInterval(calistir, Math.max(600000, aralikMs));
  zamanlayici.unref?.();
  console.log(`[hasat] fiyat hasadı açık (her ${Math.round(aralikMs / 3600000)} saat, tur başına ${HASAT_MAKS} sayfa).`);
  return zamanlayici;
}

export function hasatZamanlayiciDurdur() {
  if (zamanlayici) clearInterval(zamanlayici);
  zamanlayici = null;
}

/** Sitemap mağazaları (fiyat yayınlamayan) — panel/teşhis için. */
export function hasatHedefSiteleri() {
  try {
    const db = dbBaglantisi();
    return db.prepare(`
      SELECT siteId, COUNT(*) toplam,
             SUM(CASE WHEN fiyat IS NULL THEN 1 ELSE 0 END) fiyatsiz
      FROM katalog_urunleri
      GROUP BY siteId
      HAVING fiyatsiz > 0
      ORDER BY fiyatsiz DESC
    `).all().map(r => ({
      siteId: r.siteId,
      ad: adapterById(r.siteId)?.name || r.siteId,
      toplam: Number(r.toplam),
      fiyatsiz: Number(r.fiyatsiz),
    }));
  } catch {
    return [];
  }
}
