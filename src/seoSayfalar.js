/**
 * 🔍 Programatik SEO & SSR Ürün / Kategori Sayfaları — 2026-11-22
 *
 * Amaç: Google / Bing botlarının arama kutusunun arkasında kalan 3D yazıcı,
 * filament ve reçine sayfalarını doğrudan dizine ekleyebilmesi:
 *   - GET /urun/:slug       → ürün karşılaştırma özeti, kargo dahil fiyat tablosu,
 *                             JSON-LD Product + AggregateOffer + BreadcrumbList
 *   - GET /kategori/:slug   → kategori vitrini + ItemList JSON-LD
 *   - GET /urunler          → tüm kategoriler ve katalog ürünleri dizini
 *   - sitemapKayitlari()    → /sitemap.xml için dinamik URL listesi
 *
 * Dürüstlük ilkesi: fiyat/stok yalnızca veritabanındaki gerçek `radar_durum`
 * ve `anlikOnbellek` kayıtlarından okunur; kayıt yoksa uydurma fiyat basılmaz,
 * doğrudan canlı tarama butonuna yönlendirilir.
 */
import { katalogGetir, radarDurumVerisi } from './otonomRadar.js';
import { anlikAl, sorgudanAnlikAl, BAYAT_SWR_MAX_YAS_MS } from './anlikOnbellek.js';
import { formatTL, parcaMi } from './util.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { dbBaglantisi } from './store.js';
import { SITE_KARGO_VARSAYILANLARI } from './kargo.js';
import { siteNames } from './sites/index.js';

const SNAPSHOT_MAX_YAS_MS = Math.max(BAYAT_SWR_MAX_YAS_MS, 30 * 86400000);
const SEO_CACHE_TTL_MS = 60 * 1000;
const BESLEME_MAKS_URUN = 550;
let _seoListeOnbellek = { ts: 0, liste: [] };

export function seoOnbelleginiTemizle() {
  _seoListeOnbellek = { ts: 0, liste: [] };
}

/** Türkçe karakterleri temizleyerek kararlı URL slug'ı üretir. */
export function slugYap(metin) {
  const trMap = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return String(metin || '')
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, ch => trMap[ch] || ch)
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'urun';
}

export function htmlKacis(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 📊 Google Analytics 4 / Google Etiketi kimliği — `.env` içinde `GA_MEASUREMENT_ID`.
 * `G-...`, `GT-...` ve `GTM-...` biçimleri kabul edilir (XSS / enjeksiyon koruması).
 */
export function ga4OlcumId() {
  const raw = String(process.env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  return /^(G|GT|GTM)-[A-Z0-9]{4,20}$/.test(raw) ? raw : '';
}

/** Tüm kamuya açık sayfalara eklenen hafif GA4 / Google Tag + giden mağaza tıklama parçası. */
export function ga4HeadSnip() {
  const id = ga4OlcumId();
  if (!id) return '';
  const scriptPath = id.startsWith('GTM-') ? 'gtm.js' : 'gtag/js';
  return [
    `<script async src="https://www.googletagmanager.com/${scriptPath}?id=${id}"></script>`,
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    '  gtag(\'js\', new Date());',
    `  gtag('config', '${id}');`,
    '  document.addEventListener(\'click\', function(e) {',
    '    var a = e.target && e.target.closest ? e.target.closest(\'a[href^="http"]\') : null;',
    '    if (!a || a.hostname === location.hostname) return;',
    '    try { gtag(\'event\', \'magaza_tiklama\', { magaza: a.hostname.replace(/^www\\./, \'\'), sayfa: location.pathname, etiket: (a.textContent || \'\').trim().slice(0, 80) }); } catch (_) {}',
    '  }, true);',
    '</script>',
  ].join('\n  ');
}

function jsonLdMetni(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function guvenliAfiliyeUrl(siteId, hamUrl, ayarlar) {
  if (!hamUrl) return null;
  try {
    return siteId ? afiliyeLink(siteId, hamUrl, ayarlar) : hamUrl;
  } catch {
    return hamUrl;
  }
}

const EK_PARCA_RE = /\b(cover|housing|block|protector|tempered\s*glass|camera|heatbed|display\s*screen|frame|case|fan|sensor|cable|bracket|gear|tube|ptfe|screw|spring|belt|damper|pad|cutter|hub|switch|adapter|plate|sheet|scraper|filter|lubricant|grease|glue|extruder|board|motherboard|anakart|toolhead|baffle|wiper|thermistor|termistör|heater|sock|silikon\s*çorap|stepper|motor)\b/i;

function anaKategoriSlugBul(k) {
  const metin = `${k.ad || ''} ${k.sorgu || ''}`;
  if (/reçine|recine|resin|kurutucu|dryer|spacepi|filadryer|ebox/i.test(metin) && !/cable|screen|protector|board|motherboard/i.test(metin)) {
    return 'recine-ve-sarf';
  }
  if (parcaMi(metin) || EK_PARCA_RE.test(metin) || /nozzle|tabla|hotend|yedek\s*parça|\bpei\b/i.test(metin)) {
    return '3d-yazici-yedek-parca';
  }
  if (k.kategori === 'filament' || /\b(filament|x?pla|pla\+|epla|petg|e?tpu|abs|asa|hips|bvoh|pva)\b/i.test(metin)) {
    if (/\b(petg|e?tpu|abs|asa|cf|pa|nylon)\b/i.test(metin)) return 'petg-tpu-filament';
    if (/\b(x?pla|epla|hyper)\b|pla\+/i.test(metin)) return 'pla-filament';
    return 'filament';
  }
  if (k.kategori === 'yazici' || /3d\s*yazıcı|3d\s*printer|yazıcı|printer|\b(p1s|p1p|p2s|x1c|x1e|x1\s*carbon|a1\s*mini|k1c|k1\s*max|k2\s*plus|ender\s*3|kobra\s*3|saturn\s*4|mars\s*5|photon|neptune\s*4|centauri\s*carbon|creator\s*5|adventurer\s*5|halot)\b/i.test(metin)) {
    return '3d-yazici';
  }
  return k.kategori === 'genel' ? 'recine-ve-sarf' : 'filament';
}

export const SEO_KATEGORILER = Object.freeze([
  {
    slug: '3d-yazici',
    ad: '3D Yazıcı Fiyatları',
    kisaAd: '3D Yazıcılar',
    aciklama: 'Creality Ender 3 V3, K1 Max, Bambu Lab P1S, A1 Mini ve Anycubic 3D yazıcıların Türkiye mağazalarındaki kargo dahil en ucuz güncel fiyatları.',
    eslesirMi: (k) => (k.kategoriSlug || anaKategoriSlugBul(k)) === '3d-yazici',
  },
  {
    slug: 'pla-filament',
    ad: 'PLA & PLA+ Filament Fiyatları',
    kisaAd: 'PLA Filament',
    aciklama: 'eSun PLA+, Porima PLA, Creality Ender PLA, Sunlu ve Microzey 1.75mm PLA filamentlerde 60+ mağaza kargo dahil en düşük fiyatlar.',
    eslesirMi: (k) => (k.kategoriSlug || anaKategoriSlugBul(k)) === 'pla-filament',
  },
  {
    slug: 'petg-tpu-filament',
    ad: 'PETG, TPU & ABS Filament Fiyatları',
    kisaAd: 'PETG / TPU / ABS',
    aciklama: 'Yüksek dayanımlı PETG, esnek TPU ve teknik ABS/ASA filamentlerin kargo dahil canlı karşılaştırması ve ₺/kg birim fiyatları.',
    eslesirMi: (k) => (k.kategoriSlug || anaKategoriSlugBul(k)) === 'petg-tpu-filament',
  },
  {
    slug: 'filament',
    ad: 'Tüm 3D Filament Fiyatları',
    kisaAd: 'Tüm Filamentler',
    aciklama: 'Türkiye\'deki tüm 3D baskı mağazalarında PLA, PETG, TPU, ABS ve Hyper filamentlerin kilogram başı en ucuz kargo dahil fiyatları.',
    eslesirMi: (k) => k.kategori === 'filament' || ['pla-filament', 'petg-tpu-filament', 'filament'].includes(k.kategoriSlug || anaKategoriSlugBul(k)),
  },
  {
    slug: '3d-yazici-yedek-parca',
    ad: '3D Yazıcı Yedek Parça Fiyatları',
    kisaAd: 'Yedek Parça',
    aciklama: 'Bambu Lab, Creality, Elegoo ve Anycubic yazıcılar için sertleştirilmiş çelik nozzle, seramik hotend, anakart, PEI baskı tablası ve ekstrüder parçaları.',
    eslesirMi: (k) => (k.kategoriSlug || anaKategoriSlugBul(k)) === '3d-yazici-yedek-parca',
  },
  {
    slug: 'recine-ve-sarf',
    ad: '3D Reçine & Filament Kurutucular',
    kisaAd: 'Reçine & Kurutucu',
    aciklama: 'UV 3D yazıcı reçineleri (standart, suyla yıkanabilir, ABS-like) ve filament kurutucu cihazlarda 60+ mağaza kargo dahil en ucuz teklifler.',
    eslesirMi: (k) => (k.kategoriSlug || anaKategoriSlugBul(k)) === 'recine-ve-sarf',
  },
]);

function teklifListesiTopla(kayit, durum, snapshot, afiliyeAyar) {
  const harita = new Map();

  // 1) En güncel tam snapshot teklifleri (kargo dahil tüm mağazalar)
  const sonuclar = Array.isArray(snapshot?.payload?.sonuclar) ? snapshot.payload.sonuclar : [];
  for (const r of sonuclar) {
    if (r?.status !== 'found' || !r?.product) continue;
    if (r.renkAyni === false) continue;
    const pr = r.product.pricing || {};
    const toplam = Number(pr.toplam ?? pr.araToplam ?? r.product.sellingPrice);
    if (!Number.isFinite(toplam) || toplam <= 0) continue;
    const siteId = r.site || '';
    const siteAd = r.siteName || siteId;
    const stokta = r.product.inStock !== false;
    const kargoUygulanir = pr.kargo?.uygulanir;
    const kargoUcret = Number(pr.kargo?.ucret);
    const kargoMetni = kargoUygulanir === false
      ? 'Ücretsiz Kargo'
      : (kargoUygulanir === true && Number.isFinite(kargoUcret) && kargoUcret > 0
        ? `+${formatTL(kargoUcret)} kargo dahil`
        : 'Kargo sepette');

    const anahtar = siteId || siteAd.toLowerCase();
    const mevcut = harita.get(anahtar);
    if (!mevcut || (stokta && !mevcut.stokta) || (stokta === mevcut.stokta && toplam < mevcut.fiyat)) {
      harita.set(anahtar, {
        siteId,
        site: siteAd,
        baslik: r.product.title || kayit.ad,
        fiyat: Math.round(toplam * 100) / 100,
        urunFiyati: Number(pr.araToplam ?? r.product.sellingPrice) || null,
        stokta,
        kargo: kargoMetni,
        url: r.product.afiliyeUrl || guvenliAfiliyeUrl(siteId, r.product.url, afiliyeAyar),
      });
    }
  }

  // 2) Snapshot yoksa veya eskiyse radar_durum verisinden besle
  if (!harita.size && durum) {
    if (durum.fiyat > 0 && durum.site) {
      harita.set(durum.siteId || durum.site, {
        siteId: durum.siteId || '',
        site: durum.site,
        baslik: durum.urun || kayit.ad,
        fiyat: Number(durum.fiyat),
        urunFiyati: null,
        stokta: durum.stokta !== false,
        kargo: durum.kargo || 'Kargo bilgisi',
        url: durum.afiliyeUrl || guvenliAfiliyeUrl(durum.siteId, durum.hamUrl, afiliyeAyar),
      });
    }
    for (const d of Array.isArray(durum.digerleri) ? durum.digerleri : []) {
      if (!d?.site || !(Number(d.fiyat) > 0)) continue;
      const k = d.siteId || d.site;
      if (!harita.has(k)) {
        harita.set(k, {
          siteId: d.siteId || '',
          site: d.site,
          baslik: kayit.ad,
          fiyat: Number(d.fiyat),
          urunFiyati: null,
          stokta: true,
          kargo: d.kargo || 'Kargo bilgisi',
          url: null,
        });
      }
    }
  }

  return [...harita.values()].sort((a, b) => {
    if (a.stokta !== b.stokta) return a.stokta ? -1 : 1;
    return a.fiyat - b.fiyat;
  });
}

function kargoHesaplaTeklif(siteId, urunFiyati) {
  const kural = SITE_KARGO_VARSAYILANLARI[siteId] || null;
  if (!kural) {
    return { fiyat: urunFiyati, kargo: 'Kargo sepette' };
  }
  if (Number(kural.freeOver) > 0 && urunFiyati >= Number(kural.freeOver)) {
    return { fiyat: urunFiyati, kargo: 'Ücretsiz Kargo' };
  }
  if (Number(kural.fee) > 0) {
    return {
      fiyat: Math.round((urunFiyati + Number(kural.fee)) * 100) / 100,
      kargo: `+${formatTL(Number(kural.fee))} kargo dahil`,
    };
  }
  if (Number(kural.freeOver) > 0) {
    return { fiyat: urunFiyati, kargo: `${formatTL(Number(kural.freeOver))} üzeri ücretsiz · Sepette` };
  }
  return { fiyat: urunFiyati, kargo: 'Kargo sepette' };
}

/**
 * Mağaza beslemelerinden (`katalog_urunleri`) gelen stoklu ve gerçek fiyatlı ürünleri
 * temizleyip tekilleştirerek programa dayalı uzun kuyruk (long-tail) SEO sayfaları üretir.
 */
function beslemeUrunleriniTopla(kullanilanSluglar, afiliyeAyar) {
  let rows = [];
  try {
    const db = dbBaglantisi();
    rows = db.prepare(`
      SELECT siteId, urunUrl, baslik, marka, fiyat, stokta, gorselUrl, guncellemeTs
      FROM katalog_urunleri
      WHERE fiyat >= 40 AND stokta = 1 AND length(baslik) >= 8
      ORDER BY guncellemeTs DESC
    `).all();
  } catch {
    return [];
  }

  const gruplar = new Map();
  for (const r of rows) {
    const ad = String(r.baslik || '').trim();
    if (/hediye\s*çeki|kargo\s*fark|test\s*ürün|numune|broşür|etiket\s*rulo/i.test(ad)) continue;
    const slug = slugYap(ad);
    if (slug.length < 6 || kullanilanSluglar.has(slug)) continue;

    const katSlug = anaKategoriSlugBul({ ad, sorgu: ad, kategori: 'genel' });
    // Yalnızca gerçek 3D baskı ürünlerini kapsa
    const alakali = katSlug === '3d-yazici'
      || katSlug === 'pla-filament'
      || katSlug === 'petg-tpu-filament'
      || katSlug === '3d-yazici-yedek-parca'
      || /filament|\bpla\b|petg|tpu|\babs\b|\basa\b|reçine|recine|resin|kurutucu|dryer|nozzle|hotend|pei|tabla|extruder|anakart|motherboard|\bams\b/i.test(ad);
    if (!alakali) continue;
    // 4500 TL altı ve adında 3D yazıcı geçmeyen kalemleri yazıcıya koyma
    const duzeltilmisKat = (katSlug === '3d-yazici' && Number(r.fiyat) < 4500 && !/3d\s*yazıcı|3d\s*printer/i.test(ad))
      ? '3d-yazici-yedek-parca'
      : katSlug;

    if (!gruplar.has(slug)) {
      gruplar.set(slug, {
        slug,
        ad,
        marka: r.marka ? String(r.marka).trim() : null,
        kategoriSlug: duzeltilmisKat,
        gorsel: r.gorselUrl && /^https?:\/\//i.test(r.gorselUrl) ? r.gorselUrl : null,
        sonTs: Number(r.guncellemeTs) || Date.now(),
        teklifMap: new Map(),
      });
    }
    const g = gruplar.get(slug);
    if (!g.gorsel && r.gorselUrl && /^https?:\/\//i.test(r.gorselUrl)) g.gorsel = r.gorselUrl;
    if (Number(r.guncellemeTs) > g.sonTs) g.sonTs = Number(r.guncellemeTs);

    const urunFiyati = Math.round(Number(r.fiyat) * 100) / 100;
    const { fiyat, kargo } = kargoHesaplaTeklif(r.siteId, urunFiyati);
    const mevcut = g.teklifMap.get(r.siteId);
    if (!mevcut || fiyat < mevcut.fiyat) {
      g.teklifMap.set(r.siteId, {
        siteId: r.siteId,
        site: siteNames[r.siteId] || r.siteId,
        baslik: ad,
        fiyat,
        urunFiyati,
        stokta: true,
        kargo,
        url: guvenliAfiliyeUrl(r.siteId, r.urunUrl, afiliyeAyar),
      });
    }
  }

  const katOncelik = { '3d-yazici': 5, 'pla-filament': 4, 'petg-tpu-filament': 4, 'recine-ve-sarf': 4, '3d-yazici-yedek-parca': 3, filament: 2 };
  const onemliParcaRe = /\b(nozzle|hotend|pei|plate|tabla|anakart|motherboard|extruder|heater|thermistor|heatbed|ams)\b/i;
  const adaylar = [...gruplar.values()].sort((a, b) => {
    if (b.teklifMap.size !== a.teklifMap.size) return b.teklifMap.size - a.teklifMap.size;
    const pDiff = (katOncelik[b.kategoriSlug] || 0) - (katOncelik[a.kategoriSlug] || 0);
    if (pDiff !== 0) return pDiff;
    const parcaA = a.kategoriSlug === '3d-yazici-yedek-parca' && onemliParcaRe.test(a.ad) ? 1 : 0;
    const parcaB = b.kategoriSlug === '3d-yazici-yedek-parca' && onemliParcaRe.test(b.ad) ? 1 : 0;
    if (parcaB !== parcaA) return parcaB - parcaA;
    return b.sonTs - a.sonTs;
  });

  const cikti = [];
  for (const g of adaylar.slice(0, BESLEME_MAKS_URUN)) {
    kullanilanSluglar.add(g.slug);
    const teklifler = [...g.teklifMap.values()].sort((a, b) => a.fiyat - b.fiyat);
    const enIyi = teklifler[0];
    const enPahali = teklifler[teklifler.length - 1];
    const anaKategori = g.kategoriSlug === '3d-yazici'
      ? 'yazici'
      : (['recine-ve-sarf', '3d-yazici-yedek-parca'].includes(g.kategoriSlug) ? 'genel' : 'filament');

    cikti.push({
      id: `feed-${g.slug}`,
      kaynakTip: 'besleme',
      ad: g.ad,
      sorgu: g.ad,
      kaynakUrl: enIyi?.url || null,
      kategori: anaKategori,
      kategoriSlug: g.kategoriSlug,
      slug: g.slug,
      yol: `/urun/${g.slug}`,
      teklifler,
      enUcuzFiyat: enIyi ? enIyi.fiyat : null,
      enUcuzSite: enIyi ? enIyi.site : null,
      enUcuzUrl: enIyi ? enIyi.url : null,
      enPahaliFiyat: enPahali ? enPahali.fiyat : null,
      stokluSayisi: teklifler.length,
      gorsel: g.gorsel,
      marka: g.marka,
      modelKodu: null,
      barkod: null,
      birimMetni: null,
      sonTs: g.sonTs,
      lastmod: new Date(g.sonTs).toISOString().slice(0, 10),
    });
  }
  return cikti;
}

/**
 * Aktif katalog + besleme ürünlerini SEO/SSR sayfaları için hazırlar (60 sn bellek önbellekli).
 * @returns {Array<object>}
 */
export function seoUrunListesi({ taze = false } = {}) {
  const simdi = Date.now();
  if (!taze && _seoListeOnbellek.liste.length && (simdi - _seoListeOnbellek.ts) < SEO_CACHE_TTL_MS) {
    return _seoListeOnbellek.liste;
  }

  let kayitlar = [];
  try {
    kayitlar = katalogGetir({ sadeceAktif: true });
  } catch {
    return [];
  }

  const afiliyeAyar = afiliyeAyarlari();
  const kullanilanSluglar = new Set();

  const radarUrunler = kayitlar.map((k) => {
    let slug = slugYap(k.ad);
    if (kullanilanSluglar.has(slug)) slug = `${slug}-${k.id}`;
    kullanilanSluglar.add(slug);

    const durum = radarDurumVerisi(k.id);
    let snapshot = null;
    try {
      snapshot = (k.url ? anlikAl(k.url, { maxYasMs: SNAPSHOT_MAX_YAS_MS }) : null)
        || sorgudanAnlikAl(k.sorgu || k.ad, { maxYasMs: SNAPSHOT_MAX_YAS_MS });
    } catch { snapshot = null; }

    const teklifler = teklifListesiTopla(k, durum, snapshot, afiliyeAyar);
    const stoklu = teklifler.filter(t => t.stokta && t.fiyat > 0);
    const enIyi = stoklu[0] || null;
    const enPahali = stoklu.length ? stoklu[stoklu.length - 1] : null;
    const snapshotTs = snapshot?.ts ? Number(snapshot.ts) : 0;
    const durumTs = durum?.ts ? Number(durum.ts) : 0;
    const sonTs = Math.max(snapshotTs, durumTs) || null;
    const katSlug = anaKategoriSlugBul(k);

    return {
      id: k.id,
      kaynakTip: 'radar',
      ad: k.ad,
      sorgu: k.sorgu || k.ad,
      kaynakUrl: k.url || null,
      kategori: k.kategori || 'genel',
      kategoriSlug: katSlug,
      slug,
      yol: `/urun/${slug}`,
      teklifler,
      enUcuzFiyat: enIyi ? enIyi.fiyat : (durum?.stokta && durum?.fiyat > 0 ? Number(durum.fiyat) : null),
      enUcuzSite: enIyi ? enIyi.site : (durum?.site || null),
      enUcuzUrl: enIyi?.url || durum?.afiliyeUrl || null,
      enPahaliFiyat: enPahali ? enPahali.fiyat : (durum?.enPahaliFiyat || null),
      stokluSayisi: stoklu.length || Number(durum?.stokluSayisi || 0),
      gorsel: snapshot?.payload?.kaynak?.image || null,
      marka: snapshot?.payload?.kaynak?.brand || null,
      modelKodu: snapshot?.payload?.kaynak?.modelKodu || null,
      barkod: snapshot?.payload?.kaynak?.barkod || null,
      birimMetni: durum?.birimMetni || null,
      sonTs,
      lastmod: sonTs ? new Date(sonTs).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
  });

  const beslemeUrunler = beslemeUrunleriniTopla(kullanilanSluglar, afiliyeAyar);
  const birlesik = [...radarUrunler, ...beslemeUrunler];
  _seoListeOnbellek = { ts: simdi, liste: birlesik };
  return birlesik;
}

export function seoUrunBul(slugOrId) {
  const ham = String(slugOrId || '').trim().toLowerCase();
  if (!ham) return null;
  const liste = seoUrunListesi();
  return liste.find(u => u.slug === ham)
    || (/^\d+$/.test(ham) ? liste.find(u => u.id === Number(ham)) : null)
    || null;
}

export function sitemapKayitlari() {
  const bugun = new Date().toISOString().slice(0, 10);
  const kayitlar = [
    { yol: '/', oncelik: '1.0', siklik: 'daily', lastmod: bugun },
    { yol: '/urunler', oncelik: '0.9', siklik: 'daily', lastmod: bugun },
    { yol: '/maliyet.html', oncelik: '0.8', siklik: 'weekly', lastmod: bugun },
    { yol: '/sepet.html', oncelik: '0.8', siklik: 'weekly', lastmod: bugun },
    { yol: '/slicer.html', oncelik: '0.7', siklik: 'weekly', lastmod: bugun },
  ];
  for (const kat of SEO_KATEGORILER) {
    kayitlar.push({ yol: `/kategori/${kat.slug}`, oncelik: '0.85', siklik: 'daily', lastmod: bugun });
  }
  for (const u of seoUrunListesi()) {
    kayitlar.push({ yol: u.yol, oncelik: '0.8', siklik: 'daily', lastmod: u.lastmod || bugun });
  }
  return kayitlar;
}

/* ------------------------------------------------------------------ */
/* HTML Şablon Çerçevesi                                               */
/* ------------------------------------------------------------------ */

export function sayfaIskeleti({ title, description, canonicalUrl, ogImage, ogType = 'website', extraMeta = '', jsonLdList = [], govdeHtml, aktifNav = 'katalog' }) {
  const safeTitle = htmlKacis(title);
  const safeDesc = htmlKacis(description);
  const safeUrl = htmlKacis(canonicalUrl);
  const safeImg = htmlKacis(ogImage);
  const safeOgType = htmlKacis(ogType);
  const jsonScripts = jsonLdList
    .map(o => `<script type="application/ld+json">${jsonLdMetni(o)}</script>`)
    .join('\n  ');

  const ga4Snip = ga4HeadSnip();
  return `<!DOCTYPE html>
<html lang="tr" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <link rel="canonical" href="${safeUrl}" />
  <meta name="theme-color" content="#4338CA" />
  <meta property="og:type" content="${safeOgType}" />
  <meta property="og:site_name" content="Baskı Hesap" />
  <meta property="og:locale" content="tr_TR" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:image" content="${safeImg}" />${extraMeta ? '\n  ' + extraMeta : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  <link rel="icon" href="/ikon-192.png" />
  <link rel="apple-touch-icon" href="/ikon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script>
    try {
      var t = localStorage.getItem('tema');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .seo-kapsam { max-width: 1080px; margin: 24px auto 48px; padding: 0 16px; }
    .seo-yol { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; color: var(--gri-metin); margin-bottom: 16px; }
    .seo-yol a { color: var(--ana); text-decoration: none; font-weight: 600; }
    .seo-kart { background: var(--kart); border: 1px solid var(--cizgi); border-radius: 20px; padding: 24px; box-shadow: 0 14px 34px -26px rgba(15,23,42,.3); margin-bottom: 22px; }
    .seo-ust { display: grid; grid-template-columns: 110px 1fr; gap: 20px; align-items: center; }
    .seo-gorsel { width: 110px; height: 110px; border-radius: 14px; object-fit: contain; background: #fff; border: 1px solid var(--cizgi); padding: 6px; }
    .seo-baslik { margin: 0 0 8px; font-size: clamp(22px, 3vw, 30px); line-height: 1.2; font-weight: 800; letter-spacing: -.02em; }
    .seo-alt { margin: 0 0 14px; color: var(--gri-metin); font-size: 14.5px; line-height: 1.5; }
    .seo-fiyat-kutu { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(16,185,129,.12), rgba(52,80,209,.08)); border: 1px solid rgba(16,185,129,.35); margin: 14px 0; }
    .seo-fiyat-ana { font-size: 28px; font-weight: 800; color: #059669; }
    html[data-theme="dark"] .seo-fiyat-ana { color: #34D399; }
    .seo-butonlar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .seo-cta { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px; font-weight: 800; font-size: 14px; text-decoration: none; color: #fff; background: linear-gradient(135deg, #3450D1 0%, #4338CA 100%); box-shadow: 0 8px 20px -10px rgba(67,56,202,.8); }
    .seo-cta.ikincil { background: var(--kart); color: var(--metin); border: 1px solid var(--cizgi); box-shadow: none; }
    .seo-tablo { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .seo-tablo th, .seo-tablo td { padding: 12px 10px; text-align: left; border-bottom: 1px solid var(--cizgi); font-size: 14px; }
    .seo-tablo th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--gri-metin); }
    .seo-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .seo-mini-kart { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--kart); border: 1px solid var(--cizgi); text-decoration: none; color: inherit; transition: transform .14s ease, border-color .14s ease; }
    .seo-mini-kart:hover { transform: translateY(-2px); border-color: var(--ana); }
    .seo-mini-ad { font-weight: 700; font-size: 15px; line-height: 1.35; }
    .seo-mini-fiyat { font-weight: 800; font-size: 18px; color: #059669; }
    html[data-theme="dark"] .seo-mini-fiyat { color: #34D399; }
    .seo-mini-alt { font-size: 12.5px; color: var(--gri-metin); }
    .seo-kat-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .seo-kat-hap { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--cizgi); background: var(--kart); color: var(--metin); text-decoration: none; font-size: 13px; font-weight: 700; }
    .seo-kat-hap.etkin { background: var(--ana); color: #fff; border-color: var(--ana); }
    .seo-hero { margin: 0 0 22px; }
    .seo-hero .hero-ic { max-width: 860px; }
    .rehber-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 18px; }
    .rehber-kart {
      position: relative; overflow: hidden;
      display: flex; flex-direction: column; gap: 12px;
      padding: 22px; border-radius: 20px;
      background: var(--kart); border: 1px solid var(--cizgi);
      box-shadow: var(--kart-golge); text-decoration: none; color: inherit;
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
    }
    .rehber-kart::before {
      content: ""; position: absolute; inset: 0 0 auto 0; height: 4px;
      background: linear-gradient(90deg, #3450D1, #6366F1, #10B981);
      opacity: .85;
    }
    .rehber-kart:hover { transform: translateY(-3px); border-color: var(--ana); box-shadow: var(--kart-golge-uzerinde); }
    .rehber-kart-ust { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .rehber-ikon {
      width: 44px; height: 44px; border-radius: 13px;
      display: grid; place-items: center; font-size: 21px;
      background: var(--ana-acik); border: 1px solid color-mix(in srgb, var(--ana) 22%, transparent);
      flex: none;
    }
    .rehber-rozet {
      font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
      padding: 4px 10px; border-radius: 999px;
      background: var(--zemin-2); color: var(--ana); border: 1px solid var(--cizgi);
    }
    html[data-theme="dark"] .rehber-rozet { color: var(--ana-parlak); }
    .rehber-baslik { margin: 0; font-size: 18px; font-weight: 800; line-height: 1.3; color: var(--metin); }
    .rehber-ozet { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--gri-metin); }
    .rehber-canli-band {
      margin-top: auto; padding: 10px 12px; border-radius: 12px;
      background: var(--yesil-acik); border: 1px solid var(--yesil-cizgi);
      font-size: 12.5px; font-weight: 700; color: var(--yesil);
    }
    .rehber-canli-band.notr { background: var(--zemin-2); border-color: var(--cizgi); color: var(--gri-metin); }
    .rehber-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; color: var(--ana); }
    html[data-theme="dark"] .rehber-cta { color: var(--ana-parlak); }
    .seo-vs-izgara { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: stretch; }
    .seo-vs-orta { display: grid; place-items: center; }
    .seo-vs-rozet {
      width: 42px; height: 42px; border-radius: 999px; display: grid; place-items: center;
      font-weight: 900; font-size: 13px; color: #fff; background: var(--ana-gradyan);
      box-shadow: 0 8px 18px -6px rgba(67,56,202,.7);
    }
    .seo-vs-kart { position: relative; }
    .seo-vs-kart.kazanan { border-color: var(--yesil-cizgi); background: linear-gradient(180deg, var(--yesil-acik) 0%, var(--kart) 55%); }
    .seo-vs-etiket {
      display: inline-block; align-self: flex-start; font-size: 11px; font-weight: 800;
      padding: 3px 9px; border-radius: 999px; background: var(--yesil-acik); color: var(--yesil);
      border: 1px solid var(--yesil-cizgi);
    }
    .seo-vs-baslik { display: flex; gap: 12px; align-items: center; }
    .seo-vs-img { width: 64px; height: 64px; border-radius: 12px; object-fit: contain; background: #fff; border: 1px solid var(--cizgi); padding: 4px; flex: none; }
    .formul-izgara { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
    .formul-kart {
      padding: 16px; border-radius: 16px; background: var(--zemin-2); border: 1px solid var(--cizgi);
      display: flex; flex-direction: column; gap: 8px;
    }
    .formul-kart code { font-size: 12.5px; padding: 6px 8px; border-radius: 8px; background: var(--kart); border: 1px solid var(--cizgi); color: var(--ana); font-weight: 700; }
    html[data-theme="dark"] .formul-kart code { color: var(--ana-parlak); }
    .sira-madalya { display: inline-flex; align-items: center; gap: 4px; font-weight: 800; }
    .katalog-kontrol {
      display: flex; flex-direction: column; align-items: stretch;
      gap: 12px; margin-bottom: 18px;
    }
    .katalog-ara-sar { position: relative; width: 100%; max-width: 440px; }
    .seo-kapsam .katalog-ara-sar input[type="search"] {
      width: 100%; padding: 11px 14px 11px 42px; border-radius: 12px;
      border: 1.5px solid var(--cizgi); background: var(--kart); color: var(--metin);
      font: inherit; font-size: 13.5px; outline: none; box-shadow: var(--golge-yumusak);
    }
    .seo-kapsam .katalog-ara-sar input[type="search"]:focus { border-color: var(--ana); box-shadow: var(--halka); }
    .katalog-ara-ikon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; opacity: .7; pointer-events: none; line-height: 1; }
    .kat-baslik-ust { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .kat-baslik-sol { display: flex; align-items: center; gap: 11px; }
    .kat-ikon {
      width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
      font-size: 19px; background: var(--ana-acik); flex: none;
    }
    .kat-sayac {
      display: inline-flex; align-items: center; font-size: 12px; font-weight: 700;
      padding: 4px 10px; border-radius: 999px; background: var(--zemin-2);
      border: 1px solid var(--cizgi); color: var(--gri-metin);
    }
    .seo-urun-kart {
      display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px;
      background: var(--kart); border: 1px solid var(--cizgi); text-decoration: none; color: inherit;
      transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .seo-urun-kart:hover { transform: translateY(-3px); border-color: var(--ana); box-shadow: var(--kart-golge-uzerinde); }
    .seo-urun-ust { display: flex; gap: 12px; align-items: flex-start; }
    .seo-urun-img {
      width: 56px; height: 56px; border-radius: 11px; object-fit: contain;
      background: #fff; border: 1px solid var(--cizgi); padding: 4px; flex: none;
    }
    .seo-urun-ikon {
      width: 56px; height: 56px; border-radius: 11px; display: grid; place-items: center;
      font-size: 24px; background: var(--zemin-2); border: 1px solid var(--cizgi); flex: none;
    }
    .seo-urun-etiketler { display: flex; flex-wrap: wrap; gap: 6px; }
    .seo-urun-etiket {
      font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
      background: var(--zemin-2); color: var(--gri-metin); border: 1px solid var(--cizgi);
    }
    .seo-urun-alt {
      margin-top: auto; padding-top: 10px; border-top: 1px solid var(--cizgi);
      display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    }
    .seo-urun-ok { font-size: 12px; font-weight: 700; color: var(--ana); }
    html[data-theme="dark"] .seo-urun-ok { color: var(--ana-parlak); }
    @media (max-width: 760px) {
      .seo-vs-izgara { grid-template-columns: 1fr; }
      .seo-vs-orta { margin: -4px 0; }
      .rehber-izgara { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) { .seo-ust { grid-template-columns: 1fr; } .seo-gorsel { width: 84px; height: 84px; } }
  </style>
  ${jsonScripts}${ga4Snip ? `\n  ${ga4Snip}` : ''}
</head>
<body>
  <header class="ustbar">
    <div class="kap">
      <a class="logo" href="/" aria-label="Baskı Hesap — ana sayfa">
        <img class="logo-gorsel" src="/logo.png" alt="Baskı Hesap" width="36" height="30" decoding="async" />
      </a>
      <nav class="menu">
        <a href="/">Karşılaştır</a>
        <a href="/urunler"${aktifNav === 'katalog' ? ' class="etkin"' : ''}>🗂️ Katalog</a>
        <a href="/rehber"${aktifNav === 'rehber' ? ' class="etkin"' : ''}>📖 Rehberler</a>
        <a href="/maliyet.html">🧮 Maliyet</a>
        <a href="/sepet.html">🧺 Akıllı Sepet</a>
        <a href="/slicer.html">🧩 Eklenti</a>
        <a href="/ayarlar.html">🔔 Alarmlarım</a>
      </nav>
      <button type="button" class="tema-degistir" id="temaDegistir" aria-label="Karanlık / aydınlık temayı değiştir" title="Tema değiştir">🌓</button>
    </div>
  </header>

  <main class="seo-kapsam">
    ${govdeHtml}
  </main>

  <footer class="altbar">
    <div class="kap">
      <div class="footer-marka">
        <img class="footer-marka-logo" src="/logo.png" alt="Baskı Hesap" width="34" height="29" decoding="async" />
        <a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>
      </div>
      <p>Fiyatlar Türkiye mağazalarından anlık okunur; kargo ve herkesin yararlanabileceği indirimler dahildir. Güncel fiyat için "Canlı Fiyatları Şimdi Tara" ile anlık kontrol edebilirsiniz.</p>
    </div>
  </footer>
  <script src="/tema.js"></script>
</body>
</html>`;
}

function kategoriIkonu(slug) {
  if (slug === '3d-yazici') return '🖨️';
  if (slug === 'pla-filament') return '🧵';
  if (slug === 'petg-tpu-filament') return '🦾';
  if (slug === '3d-yazici-yedek-parca') return '⚙️';
  if (slug === 'recine-ve-sarf') return '🧪';
  return '🎨';
}

function seoUrunKartiHtml(u, gizli = false) {
  const gorselHtml = u.gorsel
    ? `<img class="seo-urun-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad)}" loading="lazy" />`
    : `<span class="seo-urun-ikon" aria-hidden="true">${kategoriIkonu(u.kategoriSlug)}</span>`;
  const fiyatHtml = u.enUcuzFiyat > 0
    ? `<span class="seo-mini-fiyat">${formatTL(u.enUcuzFiyat)}</span>`
    : `<span class="seo-mini-fiyat" style="color:var(--ana);font-size:14.5px">⚡ Canlı Tara</span>`;
  const magazaRozet = u.enUcuzSite
    ? `<span class="seo-urun-etiket">🏪 ${htmlKacis(u.enUcuzSite)}</span>`
    : '<span class="seo-urun-etiket">⏳ Taranmayı bekliyor</span>';
  const teklifRozet = u.stokluSayisi > 1
    ? `<span class="seo-urun-etiket">${u.stokluSayisi} mağaza</span>`
    : '';
  const birimRozet = u.birimMetni
    ? `<span class="seo-urun-etiket">${htmlKacis(u.birimMetni)}</span>`
    : '';
  return `<a class="seo-urun-kart${gizli ? ' gizli-katalog-kart' : ''}"${gizli ? ' hidden' : ''} href="${htmlKacis(u.yol)}" data-urun-ad="${htmlKacis(`${u.ad} ${u.enUcuzSite || ''}`.toLowerCase())}">
    <div class="seo-urun-ust">
      ${gorselHtml}
      <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
    </div>
    <div class="seo-urun-etiketler">${magazaRozet}${teklifRozet}${birimRozet}</div>
    <div class="seo-urun-alt">
      ${fiyatHtml}
      <span class="seo-urun-ok">${u.enUcuzFiyat > 0 ? 'Kargo dahil →' : 'Fiyat Bul →'}</span>
    </div>
  </a>`;
}

export function urunSayfasiHtml(urun, tabanUrl, tumUrunler = []) {
  const kat = SEO_KATEGORILER.find(c => c.slug === urun.kategoriSlug) || SEO_KATEGORILER[0];
  const canliTaraUrl = `/?url=${encodeURIComponent(urun.sorgu || urun.ad)}`;
  const enUcuzEk = urun.enUcuzFiyat > 0 ? ` (${formatTL(urun.enUcuzFiyat)})` : '';
  const title = `${urun.ad} En Ucuz Fiyatı${enUcuzEk} — Baskı Hesap`;
  const description = urun.enUcuzFiyat > 0
    ? `${urun.ad} kargo dahil en ucuz ${formatTL(urun.enUcuzFiyat)} (${urun.enUcuzSite || 'mağaza'}). ${urun.stokluSayisi || 1} mağazada stoklu teklifleri karşılaştır.`
    : `${urun.ad} Türkiye 3D baskı ve e-ticaret mağazalarında kargo dahil canlı fiyat karşılaştırması. Tek tıkla güncel fiyatları tara.`;

  const tabloSatirlari = urun.teklifler.map((t, idx) => `
    <tr>
      <td><b>${htmlKacis(t.site)}</b>${idx === 0 && t.stokta ? ' 🏷️' : ''}</td>
      <td>${htmlKacis(String(t.baslik || urun.ad).slice(0, 85))}</td>
      <td>${htmlKacis(t.kargo)}</td>
      <td>${t.stokta ? '🟢 Stokta' : '🔴 Tükendi'}</td>
      <td><b>${formatTL(t.fiyat)}</b></td>
      <td>${t.url ? `<a href="${htmlKacis(t.url)}" target="_blank" rel="noopener sponsored nofollow">Mağazaya Git ↗</a>` : '—'}</td>
    </tr>`).join('');

  const benzerler = tumUrunler
    .filter(x => x.id !== urun.id && x.kategoriSlug === urun.kategoriSlug)
    .slice(0, 6);

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: kat.ad, item: `${tabanUrl}/kategori/${kat.slug}` },
        { '@type': 'ListItem', position: 3, name: urun.ad, item: `${tabanUrl}${urun.yol}` },
      ],
    },
  ];

  if (urun.enUcuzFiyat > 0) {
    const gecerlilikTarihi = new Date((urun.sonTs || Date.now()) + 7 * 86400000).toISOString().slice(0, 10);
    const stokluTeklifler = (urun.teklifler || []).filter(t => t.stokta && Number(t.fiyat) > 0);
    const altTeklifler = stokluTeklifler.slice(0, 12).map(t => ({
      '@type': 'Offer',
      priceCurrency: 'TRY',
      price: Number(t.fiyat).toFixed(2),
      priceValidUntil: gecerlilikTarihi,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: t.site },
      url: t.url || `${tabanUrl}${urun.yol}`,
    }));
    const barkodTemiz = /^\d{8,14}$/.test(String(urun.barkod || '').trim())
      ? String(urun.barkod).trim()
      : null;

    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: urun.ad,
      description,
      category: kat.ad,
      url: `${tabanUrl}${urun.yol}`,
      image: [urun.gorsel || `${tabanUrl}/og-gorsel.png`],
      ...(urun.marka ? { brand: { '@type': 'Brand', name: urun.marka } } : {}),
      ...(urun.modelKodu ? { sku: String(urun.modelKodu), mpn: String(urun.modelKodu) } : {}),
      ...(barkodTemiz ? { gtin: barkodTemiz } : {}),
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'TRY',
        lowPrice: Number(urun.enUcuzFiyat).toFixed(2),
        ...(urun.enPahaliFiyat > 0 ? { highPrice: Number(urun.enPahaliFiyat).toFixed(2) } : {}),
        offerCount: Math.max(1, urun.stokluSayisi || stokluTeklifler.length),
        availability: 'https://schema.org/InStock',
        url: `${tabanUrl}${urun.yol}`,
        ...(altTeklifler.length ? { offers: altTeklifler } : {}),
      },
    };
    jsonLdList.push(productSchema);
  }

  const ozetHtml = urun.enUcuzFiyat > 0
    ? `<div class="seo-fiyat-kutu">
         <div>
           <div style="font-size:12px;font-weight:700;color:var(--gri-metin)">KARGO DAHİL EN UCUZ TEKLİF</div>
           <div class="seo-fiyat-ana">${formatTL(urun.enUcuzFiyat)}</div>
         </div>
         <div style="font-size:14px">
           <div><b>Mağaza:</b> ${htmlKacis(urun.enUcuzSite || '—')}</div>
           <div><b>Stoklu teklif:</b> ${urun.stokluSayisi || 1} mağaza${urun.birimMetni ? ` · <b>Birim:</b> ${htmlKacis(urun.birimMetni)}` : ''}</div>
           <div style="color:var(--gri-metin);font-size:12px">Son kontrol: ${htmlKacis(urun.lastmod)}</div>
         </div>
       </div>`
    : `<div class="seo-fiyat-kutu">
         <div>Bu ürün için önbellekte kayıtlı tarama henüz yok — tüm mağazalardan anlık fiyat çekmek için canlı tarama başlatabilirsiniz.</div>
       </div>`;

  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/kategori/${htmlKacis(kat.slug)}">${htmlKacis(kat.ad)}</a> › <span>${htmlKacis(urun.ad)}</span>
    </nav>

    <section class="seo-kart">
      <div class="${urun.gorsel ? 'seo-ust' : ''}">
        ${urun.gorsel ? `<img class="seo-gorsel" src="${htmlKacis(urun.gorsel)}" alt="${htmlKacis(urun.ad)}" loading="lazy" />` : ''}
        <div>
          <h1 class="seo-baslik">${htmlKacis(urun.ad)} Fiyatları</h1>
          <p class="seo-alt">${htmlKacis(description)}</p>
        </div>
      </div>
      ${ozetHtml}
      <div class="seo-butonlar">
        <a class="seo-cta" href="${htmlKacis(canliTaraUrl)}">⚡ Canlı Fiyatları Şimdi Tara</a>
        ${urun.enUcuzUrl ? `<a class="seo-cta ikincil" href="${htmlKacis(urun.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">En Ucuz Mağazaya Git (${htmlKacis(urun.enUcuzSite || '')}) ↗</a>` : ''}
      </div>
    </section>

    <section class="seo-kart">
      <h2 style="margin-top:0">Mağaza Karşılaştırma Tablosu (Kargo Dahil)</h2>
      ${urun.teklifler.length
        ? `<div style="overflow-x:auto"><table class="seo-tablo">
            <thead><tr><th>Mağaza</th><th>Ürün</th><th>Kargo</th><th>Stok</th><th>Toplam</th><th>Link</th></tr></thead>
            <tbody>${tabloSatirlari}</tbody>
          </table></div>`
        : '<p>Güncel çoklu mağaza tekliflerini listelemek için yukarıdaki <b>Canlı Fiyatları Şimdi Tara</b> butonunu kullanın.</p>'}
    </section>

    ${benzerler.length ? `<section class="seo-kart">
      <h2 style="margin-top:0">Aynı Kategorideki Diğer Ürünler</h2>
      <div class="seo-izgara">
        ${benzerler.map(b => seoUrunKartiHtml(b)).join('')}
      </div>
    </section>` : ''}
  `;

  const extraMeta = urun.enUcuzFiyat > 0
    ? `<meta property="product:price:amount" content="${Number(urun.enUcuzFiyat).toFixed(2)}" />\n  <meta property="product:price:currency" content="TRY" />`
    : '';

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl: `${tabanUrl}${urun.yol}`,
    ogImage: urun.gorsel || `${tabanUrl}/og-gorsel.png`,
    ogType: urun.enUcuzFiyat > 0 ? 'product' : 'website',
    extraMeta,
    jsonLdList,
    govdeHtml,
  });
}

function katalogFiltreScriptHtml() {
  return `<script>
    (function() {
      var inp = document.getElementById('katalogAraInput');
      if (!inp) return;
      inp.addEventListener('input', function() {
        var q = (inp.value || '').trim().toLowerCase();
        document.querySelectorAll('.katalog-bolum').forEach(function(sec) {
          var gosterilen = 0;
          sec.querySelectorAll('.seo-urun-kart').forEach(function(kart) {
            if (!q && kart.classList.contains('gizli-katalog-kart')) {
              kart.hidden = true;
              kart.style.display = 'none';
              return;
            }
            var metin = kart.getAttribute('data-urun-ad') || '';
            var goster = !q || metin.indexOf(q) !== -1;
            kart.hidden = !goster;
            kart.style.display = goster ? '' : 'none';
            if (goster) gosterilen++;
          });
          sec.style.display = gosterilen > 0 ? '' : 'none';
        });
      });
    })();
  </script>`;
}

export function kategoriSayfasiHtml(kat, tumUrunler, tabanUrl) {
  const eslesen = tumUrunler.filter(kat.eslesirMi);
  const stoklular = eslesen.filter(u => u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);
  const enUcuzUrun = stoklular[0] || null;
  const title = `${kat.ad} — En Ucuz Karşılaştırma | Baskı Hesap`;
  const canonicalUrl = `${tabanUrl}/kategori/${kat.slug}`;

  const katBar = SEO_KATEGORILER.map(c =>
    `<a class="seo-kat-hap ${c.slug === kat.slug ? 'etkin' : ''}" href="/kategori/${htmlKacis(c.slug)}">${kategoriIkonu(c.slug)} ${htmlKacis(c.kisaAd)}</a>`
  ).join('');

  const kartlar = eslesen.map(u => seoUrunKartiHtml(u)).join('');

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: kat.ad,
      description: kat.aciklama,
      url: canonicalUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Ürün Kataloğu', item: `${tabanUrl}/urunler` },
        { '@type': 'ListItem', position: 3, name: kat.ad, item: canonicalUrl },
      ],
    },
    ...(eslesen.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: eslesen.slice(0, 30).map((u, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${tabanUrl}${u.yol}`,
        name: u.ad,
      })),
    }] : []),
  ];

  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/urunler">Ürün Kataloğu</a> › <span>${htmlKacis(kat.ad)}</span>
    </nav>
    <section class="hero seo-hero">
      <div class="hero-ic">
        <span class="hero-rozet">${kategoriIkonu(kat.slug)} Kargo Dahil Kategori Vitrini</span>
        <h1>${htmlKacis(kat.ad)}</h1>
        <p>${htmlKacis(kat.aciklama)}</p>
        <div class="hero-istatistik">
          <span>📦 <b>${eslesen.length}</b> ürün</span>
          ${enUcuzUrun ? `<span>🏷️ En düşük: <b>${formatTL(enUcuzUrun.enUcuzFiyat)}</b></span>` : ''}
          <span>🚚 Kargo dahil gerçek toplam</span>
        </div>
      </div>
    </section>
    <div class="katalog-kontrol">
      <div class="seo-kat-bar" style="margin:0">${katBar}</div>
      <div class="katalog-ara-sar">
        <span class="katalog-ara-ikon" aria-hidden="true">🔍</span>
        <input type="search" id="katalogAraInput" placeholder="Bu kategoride filtrele…" aria-label="Kategoride ürün filtrele" />
      </div>
    </div>
    <section class="seo-kart katalog-bolum">
      <div class="seo-izgara">${kartlar || '<p>Bu kategoride aktif ürün henüz eklenmedi.</p>'}</div>
    </section>
    ${katalogFiltreScriptHtml()}
  `;

  return sayfaIskeleti({
    title,
    description: kat.aciklama,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    jsonLdList,
    govdeHtml,
  });
}

export function katalogDiziniHtml(tumUrunler, tabanUrl) {
  const title = '3D Yazıcı, Filament & Reçine Kataloğu — En Ucuz Fiyatlar | Baskı Hesap';
  const description = 'Türkiye 3D baskı mağazalarında takip edilen tüm popüler 3D yazıcı, PLA/PETG/TPU filament, reçine ve kurutucu modellerinin kargo dahil en ucuz fiyat dizini.';
  const canonicalUrl = `${tabanUrl}/urunler`;
  const stokluSayi = tumUrunler.filter(u => u.enUcuzFiyat > 0).length;

  const katBar = SEO_KATEGORILER.map(c => {
    const adet = tumUrunler.filter(c.eslesirMi).length;
    if (!adet) return '';
    return `<a class="seo-kat-hap" href="#kat-${htmlKacis(c.slug)}">${kategoriIkonu(c.slug)} ${htmlKacis(c.kisaAd)} (${adet})</a>`;
  }).join('');

  const bolumler = SEO_KATEGORILER.map(kat => {
    const urunler = tumUrunler.filter(kat.eslesirMi);
    if (!urunler.length) return '';
    return `<section class="seo-kart katalog-bolum" id="kat-${htmlKacis(kat.slug)}">
      <div class="kat-baslik-ust">
        <div class="kat-baslik-sol">
          <span class="kat-ikon" aria-hidden="true">${kategoriIkonu(kat.slug)}</span>
          <div>
            <h2 style="margin:0 0 2px">${htmlKacis(kat.ad)}</h2>
            <div style="font-size:13px;color:var(--gri-metin)">${htmlKacis(kat.aciklama)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="kat-sayac">${urunler.length} ürün</span>
          <a class="seo-cta ikincil" style="padding:7px 13px;font-size:12.5px" href="/kategori/${htmlKacis(kat.slug)}">Tümünü gör →</a>
        </div>
      </div>
      <div class="seo-izgara">
        ${urunler.map((u, idx) => seoUrunKartiHtml(u, idx >= 16)).join('')}
      </div>
    </section>`;
  }).join('');

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <span>Ürün Kataloğu</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">🗂️ 60+ Türkiye Mağazası · Canlı Katalog</span>
          <h1>3D Yazıcı &amp; Filament <b>Fiyat Kataloğu</b></h1>
          <p>${htmlKacis(description)}</p>
          <div class="hero-istatistik">
            <span>📦 <b>${tumUrunler.length}</b> takip edilen ürün</span>
            <span>✅ <b>${stokluSayi}</b> güncel stoklu fiyat</span>
            <span>⚖️ Birim ₺/kg &amp; kargo dahil</span>
          </div>
        </div>
      </section>
      <div class="katalog-kontrol">
        <div class="seo-kat-bar" style="margin:0">${katBar}</div>
        <div class="katalog-ara-sar">
          <span class="katalog-ara-ikon" aria-hidden="true">🔍</span>
          <input type="search" id="katalogAraInput" placeholder="Katalogda hızlı filtrele (ör. Bambu, PLA, PETG)…" aria-label="Katalogda ürün filtrele" />
        </div>
      </div>
      ${bolumler}
      <section class="seo-rehber-kart" aria-label="Hızlı Geçişler">
        <div class="seo-rehber-ust">
          <div>
            <h2 class="bolum-baslik" style="margin:0 0 4px">Karşılaştırma Rehberleri &amp; Araçlar</h2>
            <p class="ipucu" style="margin:0">Model seçimi yapmak, kargoyu sıfırlamak veya parça maliyeti çıkarmak için:</p>
          </div>
          <a class="seo-tum-link" href="/rehber">Tüm Rehberler →</a>
        </div>
        <div class="seo-rehber-baglar">
          <a href="/rehber">📖 Karşılaştırma &amp; Alım Rehberleri</a>
          <a href="/rehber/en-ucuz-pla-filament">🏷️ En Ucuz PLA Sıralaması</a>
          <a href="/karsilastir/bambu-lab-p1s-vs-creality-k1c">⚔️ P1S vs K1C</a>
          <a href="/maliyet.html">🧮 Baskı Maliyet Hesaplayıcı</a>
          <a href="/sepet.html">🧺 Akıllı Sepet Sihirbazı</a>
        </div>
      </section>
      ${katalogFiltreScriptHtml()}
    `,
  });
}
