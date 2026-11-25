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
import { katalogGetir, radarDurumVerisi, radarSerisi, teklifKategoriyeUygunMu, vitrinKotadanSec, urunIkonu } from './otonomRadar.js';
import { grafikOzeti } from './grafik.js';
import { anlikAl, sorgudanAnlikAl, snapshotAra, BAYAT_SWR_MAX_YAS_MS } from './anlikOnbellek.js';
import { katalogUrunleriAra } from './katalogSync.js';
import { formatTL, formatPara, paraBirimiNormalize, parcaMi, slugYap } from './util.js';
export { slugYap };
import { birimFiyatHesapla } from './birimFiyat.js';
import { afiliyeLink, afiliyeAyarlari, aiModelPartnerLinkleri } from './afiliye.js';
import { dbBaglantisi } from './store.js';
import { SITE_KARGO_VARSAYILANLARI } from './kargo.js';
import { siteNames, adapterById, adapterMarket, normalizeMarket, PAZARLAR } from './sites/index.js';
import { normalizeDil, dilByMarket, sozlukGetir, t, sssSablonlari, DIL_META, dilParaFormati } from './i18n/index.js';

export const GLOBAL_KATALOG_YOLLARI = Object.freeze({
  tr: '/urunler',
  en: '/en/products',
  fr: '/fr/produits',
  ja: '/ja/products',
});

export const GLOBAL_KATEGORI_ON_EKLERI = Object.freeze({
  tr: '/kategori',
  en: '/en/category',
  fr: '/fr/categorie',
  ja: '/ja/category',
});

export const GLOBAL_REHBER_YOLLARI = Object.freeze({
  tr: '/rehber',
  en: '/en/guides',
  fr: '/fr/guides',
  ja: '/ja/guides',
});

export const GLOBAL_SEPET_YOLLARI = Object.freeze({
  tr: '/sepet.html',
  en: '/en/basket',
  fr: '/fr/panier',
  ja: '/ja/basket',
});

export function navYollariGetir(dil = 'tr') {
  const kod = normalizeDil(dil);
  if (kod === 'en') {
    return {
      ana: '/en', katalog: '/en/products', rehber: '/en/guides',
      maliyet: '/en/cost-calculator', sepet: '/en/basket', slicer: '/en/slicer',
      ayarlar: '/en/alerts', kategoriOnEk: '/en/category',
    };
  }
  if (kod === 'fr') {
    return {
      ana: '/fr', katalog: '/fr/produits', rehber: '/fr/guides',
      maliyet: '/fr/calculateur-cout', sepet: '/fr/panier', slicer: '/fr/slicer',
      ayarlar: '/fr/alertes', kategoriOnEk: '/fr/categorie',
    };
  }
  if (kod === 'ja') {
    return {
      ana: '/ja', katalog: '/ja/products', rehber: '/ja/guides',
      maliyet: '/ja/cost-calculator', sepet: '/ja/basket', slicer: '/ja/slicer',
      ayarlar: '/ja/alerts', kategoriOnEk: '/ja/category',
    };
  }
  return {
    ana: '/', katalog: '/urunler', rehber: '/rehber',
    maliyet: '/maliyet.html', sepet: '/sepet.html', slicer: '/slicer.html',
    ayarlar: '/ayarlar.html', kategoriOnEk: '/kategori',
  };
}

const TEMA_DUGME_ETIKETLERI = Object.freeze({
  tr: { aria: 'Karanlık / aydınlık temayı değiştir', title: 'Karanlık temaya geç' },
  en: { aria: 'Toggle dark / light theme', title: 'Switch to dark theme' },
  fr: { aria: 'Changer de thème clair / sombre', title: 'Passer au thème sombre' },
  ja: { aria: 'ライト／ダークテーマ切替', title: 'ダークテーマに切替' },
});

/** Seçili dilde yerelleştirilmiş #temaDegistir SSR düğmesini üretir. */
export function temaDugmesiHtml(dil = 'tr') {
  const kod = normalizeDil(dil);
  const etiket = TEMA_DUGME_ETIKETLERI[kod] || TEMA_DUGME_ETIKETLERI.tr;
  const ikSvg = '<svg class="svg-ik tema-ikon-ay" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg><svg class="svg-ik tema-ikon-gun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-15.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2m-15.66 7.07 1.41-1.41m11.32-11.32 1.41-1.41"/></svg>';
  return `<button type="button" class="tema-degistir" id="temaDegistir" aria-label="${htmlKacis(etiket.aria)}" title="${htmlKacis(etiket.title)}">${ikSvg}</button>`;
}

/** Üst bar için kompakt bölge + dil seçici HTML'i üretir (Googlebot tarafından taranabilir linkler). */
export function dilSeciciHtml(aktifDil = 'tr', yolHaritasi = null) {
  const kod = normalizeDil(aktifDil);
  const harita = yolHaritasi || { tr: '/', en: '/en', fr: '/fr', ja: '/ja' };
  const ogeler = [
    { dil: 'tr', kisa: 'TR', ad: 'TR · Türkçe (TRY)' },
    { dil: 'en', kisa: 'EN', ad: 'EN · English (USD)' },
    { dil: 'fr', kisa: 'FR', ad: 'FR · Français (EUR)' },
    { dil: 'ja', kisa: 'JA', ad: 'JA · 日本語 (JPY)' },
  ];
  const secili = ogeler.find(o => o.dil === kod) || ogeler[0];
  const ariaEtiket = kod === 'en'
    ? `Region and language selector (${secili.ad})`
    : (kod === 'fr'
      ? `Sélecteur de région et de langue (${secili.ad})`
      : (kod === 'ja' ? `地域と言語の選択 (${secili.ad})` : `Bölge ve dil seçici (${secili.ad})`));
  return `<details class="dil-secici" id="dilSecici">
        <summary aria-label="${htmlKacis(ariaEtiket)}"><svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg><span>${secili.kisa}</span><span aria-hidden="true">▾</span></summary>
        <div class="dil-menu" role="menu">
          ${ogeler.map(o => `<a href="${htmlKacis(harita[o.dil] || DIL_META[o.dil].yolOnEk || '/')}" hreflang="${o.dil}"${o.dil === kod ? ' class="etkin"' : ''} role="menuitem">${htmlKacis(o.ad)}</a>`).join('\n          ')}
        </div>
      </details>`;
}

const SNAPSHOT_MAX_YAS_MS = Math.max(BAYAT_SWR_MAX_YAS_MS, 30 * 86400000);
const SEO_CACHE_TTL_MS = 60 * 1000;
const BESLEME_MAKS_URUN = 550;
let _seoListeOnbellek = new Map();

export function seoOnbelleginiTemizle() {
  _seoListeOnbellek = new Map();
}

function urunFiyatMetni(fiyat, paraBirimi = 'TRY') {
  const kod = paraBirimiNormalize(paraBirimi);
  return kod === 'TRY' ? formatTL(fiyat) : formatPara(fiyat, kod);
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

/** Creality ürünü/karşılaştırması için Impact yapılandırılmışsa Global Resmî Mağaza bağlantısı döndürür. */
export function crealityResmiMagazaLink(urunVeyaMetin, ayarlar = null) {
  const hamMetin = typeof urunVeyaMetin === 'string'
    ? urunVeyaMetin
    : [urunVeyaMetin?.marka, urunVeyaMetin?.ad, urunVeyaMetin?.sorgu, urunVeyaMetin?.slug].filter(Boolean).join(' ');
  if (!hamMetin || !/creality|\bender\s*3|\bk1c?\b|\bk2\s*plus|\bk3\b|\bspace\s*pi|\bhalot/i.test(hamMetin)) {
    return null;
  }
  let hedefUrl = '';
  if (/\bk3\b|k3\s*multi/i.test(hamMetin)) {
    hedefUrl = 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer';
  } else if (/\bk1c\b/i.test(hamMetin)) {
    hedefUrl = 'https://store.creality.com/products/creality-k1c-3d-printer';
  } else if (/ender\s*3\s*v3\s*ke/i.test(hamMetin)) {
    hedefUrl = 'https://store.creality.com/products/creality-ender-3-v3-ke';
  } else {
    const sorgu = String(
      (typeof urunVeyaMetin === 'object' ? (urunVeyaMetin?.sorgu || urunVeyaMetin?.ad) : urunVeyaMetin) || 'Creality',
    ).trim().slice(0, 80);
    hedefUrl = `https://store.creality.com/search?q=${encodeURIComponent(sorgu)}`;
  }
  const bagli = guvenliAfiliyeUrl('creality', hedefUrl, ayarlar);
  if (!bagli || bagli === hedefUrl) return null;
  return { url: bagli, hamUrl: hedefUrl };
}

const SARF_VE_SPRAY_RE = /\b(spray|adhesion|adhesive|glue\s*stick|magigoo|bed\s*weld|cleaner|isopropyl|lubricant|grease|oil|ink\s*(?:and|&)\s*cleaning|cleaning\s*cartridge|powder)\b|yapıştırıcı|sprey|yağlayıcı|gres|スプレー|接着剤/i;
const WASH_CURE_RE = /\b(wash\s*(?:&|and)?\s*cure|curing\s*(?:station|machine|box)|washing\s*(?:station|machine)|cleaning\s*station|df\s*cure|df\s*wash)\b|洗浄硬化機/i;
const YAZICI_DISI_URUN_RE = /\b(screen\s*print(?:er|ing)|apparel\s*printer|dtg\s*printer|uv\s*printer|o1\s*omni\s*printer|holiday\s*machine\s*vault|machine\s*vault|rc\s*overland\s*truck|3d\s*printer\s*project|3d\s*scanner|cutting\s*upgrade)\b|imprimante\s*uv|uvプリンター/i;
const EK_PARCA_RE = /\b(cover|housing|block|protector|tempered\s*glass|camera|heatbed|display\s*screen|frame|case|fan|sensor|cable|bracket|gear|tube|ptfe|screw|spring|belt|damper|pad|cutter|hub|switch|adapter|plate|sheet|scraper|filter|extruder|board|motherboard|anakart|toolhead|baffle|wiper|thermistor|termistör|heater|sock|silikon\s*çorap|stepper|motor|assembly|door|hinge|panel|sidepanel|panneau|holder|feeder|buffer|enclosure|spool\s*holder|rotary\s*(?:holder|attachment)?|module\s*rotatif|buildtak|servo|water\s*pump|siphon\s*pump|pump|whole\s*platform|infinity\s*bed|print\s*bed|exoskeleton|air\s*quality\s*monitor|air\s*purifier|printer\s*stand|laminator|laminateur|upgrade\s*(?:kits?|bundles?|set)?|upgrades|uptime\s*kit|maintenance\s*kit|cartridge\s*kit|conversion\s*kit|accessories|accessory|mmu\d|blazecut|rambo|linear\s*rail|calibrator|dry\s*box|finish\s*box|tool\s*box|sieve|tray\b|lid\b|shelf|printed\s*parts|print\s*head|flow\s*head|galvanometer|marking\s*card|build\s*unit|protection\s*glass|add-?on)\b|(ボード|アセンブリ|フロントドア|ドア|ノズル|ホットエンド|エクストルーダー|ヒートベッド|プレート|ビルドプレート|ケーブル|ベルト|ファン|センサー|モーター|ヒーター|カバー|ブラケット|スクリュー|ガラス|ホルダー|エンクロージャー|フィラメントハブ|バッファー|カッター|ワイパー|プリントスクリーン|プリンタースタンド|ラミネーター|アップグレードキット|アップグレード|carte\s*m[èe]re|buse|corps\s*de\s*chauffe|plateau|courroie|ventilateur|[ée]cran|capot|porte\b|assemblage|moteur|extrudeur|caisson|support\s*bobine|d[ée]coupe)/i;
const YAZICI_ICIN_PARCA_RE = /\bfor\s+(?:the\s+)?(?:creatbot|bambu\s*labs?|creality|elegoo|anycubic|prusa|flashforge|qidi|centauri|raise3d|voron|uv\s*printer|[\w\s/-]{0,30}3d\s*printers?)\b|\bpour\s+imprimante|\bonly\)|（[^）]*プリンター用）|3dプリンター用|シリーズ専用/i;
const BAGIMSIZ_AMS_RE = /\b(ams(\s*(lite|ht|2\s*pro|hub|feeder|buffer))?|cfs|ace\s*pro|canvas\b(?=.*\bcentauri\b))\b/i;
const YAZICI_PAKET_MODEL_RE = /\b(p1s|p1p|p2s|x1c|x1e|x1\s*carbon|a1(?:\s*mini)?|h2d|h2s|h2c|h3c|k2\s*plus|k2\s*pro|kobra\s*(?:3|s1)|centauri(?:\s*carbon)?|halot(?:-?x1)?|saturn\s*4|mars\s*5)\b/i;
const YAZICI_PAKET_EK_RE = /\b(combo|bundle|pack)\b|コンボ|セット/i;
const YAZICI_BILINEN_MODEL_RE = /\b(p1s|p1p|p2s|x1c|x1e|x1\s*carbon|a1\s*mini|a2l|h2d|h2s|h2c|h3c|k1c|k1\s*max|k2\s*plus|k2\s*pro|ender[\s-]*3|kobra(?:\s*(?:3|4|s1|x))?|saturn\s*4|mars\s*5|photon(?:\s*(?:mono|p1))?|neptune\s*4|centauri(?:\s*carbon)?|orange\s*storm\s*giga|creator\s*5|adventurer\s*5|halot)\b/i;

export function anaKategoriSlugBul(k) {
  const metin = `${k.ad || ''} ${k.sorgu || ''}`;
  const yaziciPaketiMi = YAZICI_PAKET_MODEL_RE.test(metin)
    && YAZICI_PAKET_EK_RE.test(metin)
    && !/\b(?:upgrade|accessories|combo\s*deal|combos\s*for)\b/i.test(metin)
    && !YAZICI_ICIN_PARCA_RE.test(metin);

  if (YAZICI_DISI_URUN_RE.test(metin)) {
    return '3d-yazici-yedek-parca';
  }
  if ((/reçine|recine|resin|レジン|kurutucu|dryer|spacepi|filadryer|ebox|sécheur|secheur|ドライヤー/i.test(metin)
    || SARF_VE_SPRAY_RE.test(metin)
    || (WASH_CURE_RE.test(metin) && !yaziciPaketiMi))
    && !/cable|screen|protector|board|motherboard|ケーブル|ボード/i.test(metin)) {
    return 'recine-ve-sarf';
  }
  const havaTemizleyiciTekil = /空気清浄機/i.test(metin) && !yaziciPaketiMi;
  const sadecePrinterKitUpgrade = /\b3d\s*printer\s*(?:build\s*)?kit\b/i.test(metin)
    && !/\b(?:upgrade\s*kit|uptime\s*kit|maintenance\s*kit|for\s+)\b/i.test(metin);
  const parcaVar = !sadecePrinterKitUpgrade && (parcaMi(metin) || EK_PARCA_RE.test(metin));
  if (parcaVar || YAZICI_ICIN_PARCA_RE.test(metin) || havaTemizleyiciTekil
    || /nozzle|tabla|hotend|yedek\s*parça|\bpei\b/i.test(metin)
    || (BAGIMSIZ_AMS_RE.test(metin) && !yaziciPaketiMi)) {
    return '3d-yazici-yedek-parca';
  }
  if (k.kategori === 'filament' || /\b(filament|x?pla|pla\+|epla|petg|e?tpu|abs|asa|hips|bvoh|pva)\b/i.test(metin) || /フィラメント/.test(metin)) {
    if (/\b(petg|e?tpu|abs|asa|cf|pa|nylon)\b/i.test(metin)) return 'petg-tpu-filament';
    if (/\b(x?pla|epla|hyper)\b|pla\+/i.test(metin)) return 'pla-filament';
    return 'filament';
  }
  if (k.kategori === 'yazici'
    || (/3d\s*yazıcı|3d\s*printers?|imprimante\s*3d|3d\s*プリンター|3dプリンター|\b(fdm|fff|msla|core\s*xy)\b/i.test(metin) || YAZICI_BILINEN_MODEL_RE.test(metin))) {
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

export const KATEGORI_SLUG_HARITASI = Object.freeze({
  '3d-yazici': { tr: '3d-yazici', en: '3d-printers', fr: 'imprimantes-3d', ja: '3d-printers' },
  'pla-filament': { tr: 'pla-filament', en: 'pla-filament', fr: 'filament-pla', ja: 'pla-filament' },
  'petg-tpu-filament': { tr: 'petg-tpu-filament', en: 'petg-tpu-abs-filament', fr: 'filament-petg-tpu-abs', ja: 'petg-tpu-abs-filament' },
  filament: { tr: 'filament', en: 'all-filaments', fr: 'tous-filaments', ja: 'all-filaments' },
  '3d-yazici-yedek-parca': { tr: '3d-yazici-yedek-parca', en: 'spare-parts', fr: 'pieces-detachees', ja: 'spare-parts' },
  'recine-ve-sarf': { tr: 'recine-ve-sarf', en: 'resin-and-dryers', fr: 'resines-et-sechoirs', ja: 'resin-and-dryers' },
});

export function kategoriSlugGetir(icSlug, dil = 'tr') {
  const d = normalizeDil(dil);
  return KATEGORI_SLUG_HARITASI[icSlug]?.[d] || icSlug;
}

export function kategoriYoluGetir(icSlug, dil = 'tr') {
  const d = normalizeDil(dil);
  return `${navYollariGetir(d).kategoriOnEk}/${kategoriSlugGetir(icSlug, d)}`;
}

export function globalKategoriSlugCoz(urlSlug, dil = 'en') {
  const temiz = String(urlSlug || '').trim().toLowerCase();
  const d = ['fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  if (!temiz) return null;
  for (const kat of SEO_KATEGORILER) {
    if (kategoriSlugGetir(kat.slug, d) === temiz) {
      return { kat, yonlendir: false, canonicalYol: kategoriYoluGetir(kat.slug, d) };
    }
  }
  const eskiKat = SEO_KATEGORILER.find(k => k.slug === temiz);
  if (eskiKat) {
    const canonicalYol = kategoriYoluGetir(eskiKat.slug, d);
    return { kat: eskiKat, yonlendir: true, canonicalYol };
  }
  return null;
}

function teklifListesiTopla(kayit, durum, snapshot, afiliyeAyar, market = 'tr') {
  const harita = new Map();
  const etkinMarket = normalizeMarket(market);
  const beklenenPara = PAZARLAR[etkinMarket]?.currency || 'TRY';
  const sitePazarUygun = (siteId) => {
    if (!siteId) return etkinMarket === 'tr';
    const a = adapterById(siteId);
    return a ? adapterMarket(a) === etkinMarket : etkinMarket === 'tr';
  };

  // 1) En güncel tam snapshot teklifleri (kargo dahil tüm mağazalar)
  const sonuclar = Array.isArray(snapshot?.payload?.sonuclar) ? snapshot.payload.sonuclar : [];
  for (const r of sonuclar) {
    if (r?.status !== 'found' || !r?.product) continue;
    if (r.renkAyni === false) continue;
    const siteId = r.site || '';
    if (!sitePazarUygun(siteId)) continue;
    const teklifPara = r.product.currency ? paraBirimiNormalize(r.product.currency) : beklenenPara;
    if (teklifPara !== beklenenPara) continue;
    if (!teklifKategoriyeUygunMu(r, kayit)) continue;
    const pr = r.product.pricing || {};
    const toplam = Number(pr.toplam ?? pr.araToplam ?? r.product.sellingPrice);
    if (!Number.isFinite(toplam) || toplam <= 0) continue;
    const siteAd = r.siteName || siteId;
    const stokta = r.product.inStock !== false;
    const kargoUygulanir = pr.kargo?.uygulanir;
    const kargoUcret = Number(pr.kargo?.ucret);
    const kargoMetni = kargoUygulanir === false
      ? 'Ücretsiz Kargo'
      : (kargoUygulanir === true && Number.isFinite(kargoUcret) && kargoUcret > 0
        ? `+${urunFiyatMetni(kargoUcret, beklenenPara)} kargo dahil`
        : 'Kargo sepette');

    const anahtar = siteId || siteAd.toLowerCase();
    const mevcut = harita.get(anahtar);
    if (!mevcut || (stokta && !mevcut.stokta) || (stokta === mevcut.stokta && toplam < mevcut.fiyat)) {
      harita.set(anahtar, {
        siteId,
        site: siteAd,
        baslik: r.product.title || kayit.ad,
        fiyat: Math.round(toplam * 100) / 100,
        paraBirimi: beklenenPara,
        urunFiyati: Number(pr.araToplam ?? r.product.sellingPrice) || null,
        stokta,
        kargo: kargoMetni,
        url: r.product.afiliyeUrl || guvenliAfiliyeUrl(siteId, r.product.url, afiliyeAyar),
      });
    }
  }

  // 2) Snapshot yoksa veya eskiyse radar_durum verisinden besle
  if (!harita.size && durum) {
    if (durum.fiyat > 0 && durum.site && sitePazarUygun(durum.siteId)) {
      harita.set(durum.siteId || durum.site, {
        siteId: durum.siteId || '',
        site: durum.site,
        baslik: durum.urun || kayit.ad,
        fiyat: Number(durum.fiyat),
        paraBirimi: beklenenPara,
        urunFiyati: null,
        stokta: durum.stokta !== false,
        kargo: durum.kargo || 'Kargo bilgisi',
        url: durum.afiliyeUrl || guvenliAfiliyeUrl(durum.siteId, durum.hamUrl, afiliyeAyar),
      });
    }
    for (const d of Array.isArray(durum.digerleri) ? durum.digerleri : []) {
      if (!d?.site || !(Number(d.fiyat) > 0) || !sitePazarUygun(d.siteId)) continue;
      const k = d.siteId || d.site;
      if (!harita.has(k)) {
        harita.set(k, {
          siteId: d.siteId || '',
          site: d.site,
          baslik: kayit.ad,
          fiyat: Number(d.fiyat),
          paraBirimi: beklenenPara,
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
function beslemeUrunleriniTopla(kullanilanSluglar, afiliyeAyar, market = 'tr') {
  const etkinMarket = normalizeMarket(market);
  const beklenenPara = PAZARLAR[etkinMarket]?.currency || 'TRY';
  const minFiyat = etkinMarket === 'tr' ? 40 : 1;
  let rows = [];
  try {
    const db = dbBaglantisi();
    rows = db.prepare(`
      SELECT siteId, urunUrl, baslik, marka, fiyat, paraBirimi, stokta, gorselUrl, guncellemeTs
      FROM katalog_urunleri
      WHERE fiyat >= ? AND stokta = 1 AND length(baslik) >= 8
      ORDER BY guncellemeTs DESC
    `).all(minFiyat);
  } catch {
    return [];
  }

  const gruplar = new Map();
  for (const r of rows) {
    const a = r.siteId ? adapterById(r.siteId) : null;
    const satirMarket = a ? adapterMarket(a) : 'tr';
    if (satirMarket !== etkinMarket) continue;
    if (r.paraBirimi && paraBirimiNormalize(r.paraBirimi) !== beklenenPara) continue;
    const ad = String(r.baslik || '').trim();
    if (/hediye\s*çeki|gift\s*card|carte\s*cadeau|shipping\s*insurance|safeguard\s*your\s*purchase|kargo\s*fark|test\s*ürün|numune|broşür|etiket\s*rulo/i.test(ad)
      || YAZICI_DISI_URUN_RE.test(ad)) continue;
    const slug = slugYap(ad);
    if (slug.length < 6 || kullanilanSluglar.has(slug)) continue;

    const katSlug = anaKategoriSlugBul({ ad, sorgu: ad, kategori: 'genel' });
    // Yalnızca gerçek 3D baskı ürünlerini kapsa
    const alakali = katSlug === '3d-yazici'
      || katSlug === 'pla-filament'
      || katSlug === 'petg-tpu-filament'
      || katSlug === '3d-yazici-yedek-parca'
      || SARF_VE_SPRAY_RE.test(ad)
      || /filament|フィラメント|\bpla\b|petg|tpu|\babs\b|\basa\b|reçine|recine|resin|レジン|kurutucu|dryer|nozzle|ノズル|hotend|ホットエンド|pei|tabla|extruder|anakart|motherboard|ボード|アセンブリ|\bams\b/i.test(ad);
    if (!alakali) continue;
    // Bölgesel minimum yazıcı fiyat eşiğinin altındaki kalemleri yazıcıya koyma (spray/yedek parça koruması)
    const minYaziciFiyat = beklenenPara === 'USD'
      ? 89
      : (beklenenPara === 'EUR' ? 85 : (beklenenPara === 'JPY' ? 14000 : 4000));
    const duzeltilmisKat = (katSlug === '3d-yazici' && Number(r.fiyat) < minYaziciFiyat)
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
export function seoUrunListesi({ taze = false, market = 'tr' } = {}) {
  const etkinMarket = normalizeMarket(market);
  const beklenenPara = PAZARLAR[etkinMarket]?.currency || 'TRY';
  const simdi = Date.now();
  const onbellek = _seoListeOnbellek.get(etkinMarket);
  if (!taze && onbellek?.liste?.length && (simdi - onbellek.ts) < SEO_CACHE_TTL_MS) {
    return onbellek.liste;
  }

  let kayitlar = [];
  try {
    kayitlar = katalogGetir({ sadeceAktif: true });
  } catch {
    return [];
  }

  const afiliyeAyar = afiliyeAyarlari();
  const kullanilanSluglar = new Set();

  const radarUrunler = kayitlar
    .filter((k) => {
      const kMarket = k.url && adapterById(k.siteId || '')
        ? adapterMarket(adapterById(k.siteId))
        : (k.market ? normalizeMarket(k.market) : 'tr');
      return kMarket === etkinMarket;
    })
    .map((k) => {
    let slug = slugYap(k.ad);
    if (kullanilanSluglar.has(slug)) slug = `${slug}-${k.id}`;
    kullanilanSluglar.add(slug);

    const durum = radarDurumVerisi(k.id);
    let snapshot = null;
    try {
      snapshot = (k.url ? anlikAl(k.url, { maxYasMs: SNAPSHOT_MAX_YAS_MS }) : null)
        || sorgudanAnlikAl(k.sorgu || k.ad, { maxYasMs: SNAPSHOT_MAX_YAS_MS });
    } catch { snapshot = null; }

    const teklifler = teklifListesiTopla(k, durum, snapshot, afiliyeAyar, etkinMarket);
    const stoklu = teklifler.filter(t => t.stokta && t.fiyat > 0);
    const enIyi = stoklu[0] || null;
    const enPahali = stoklu.length ? stoklu[stoklu.length - 1] : null;
    const snapshotTs = snapshot?.ts ? Number(snapshot.ts) : 0;
    const durumTs = durum?.ts ? Number(durum.ts) : 0;
    const sonTs = Math.max(snapshotTs, durumTs) || null;
    const katSlug = anaKategoriSlugBul(k);

    const enIyiBirim = (etkinMarket === 'tr' && enIyi)
      ? (birimFiyatHesapla(enIyi.baslik || k.ad, enIyi.fiyat) || birimFiyatHesapla(k.ad, enIyi.fiyat))
      : null;
    const birimMetni = enIyiBirim
      ? `₺${formatTL(enIyiBirim.birimFiyat).replace(/\s*TL$/, '')} / ${enIyiBirim.birim === 'L' ? 'L' : 'kg'}`
      : (durum?.birimMetni || null);

    return {
      id: k.id,
      market: etkinMarket,
      paraBirimi: beklenenPara,
      kaynakTip: 'radar',
      ad: k.ad,
      sorgu: k.sorgu || k.ad,
      kaynakUrl: k.url || null,
      kategori: k.kategori || 'genel',
      kategoriSlug: katSlug,
      slug,
      yol: `/urun/${slug}`,
      teklifler,
      enUcuzFiyat: enIyi ? enIyi.fiyat : (durum?.stokta && durum?.fiyat > 0 && etkinMarket === 'tr' ? Number(durum.fiyat) : null),
      enUcuzSite: enIyi ? enIyi.site : (etkinMarket === 'tr' ? (durum?.site || null) : null),
      enUcuzUrl: enIyi?.url || (etkinMarket === 'tr' ? (durum?.afiliyeUrl || null) : null),
      enPahaliFiyat: enPahali ? enPahali.fiyat : (etkinMarket === 'tr' ? (durum?.enPahaliFiyat || null) : null),
      stokluSayisi: stoklu.length || (etkinMarket === 'tr' ? Number(durum?.stokluSayisi || 0) : 0),
      gorsel: snapshot?.payload?.kaynak?.image || null,
      marka: snapshot?.payload?.kaynak?.brand || null,
      modelKodu: snapshot?.payload?.kaynak?.modelKodu || null,
      barkod: snapshot?.payload?.kaynak?.barkod || null,
      birimMetni,
      sonTs,
      lastmod: sonTs ? new Date(sonTs).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
  });

  const beslemeUrunler = beslemeUrunleriniTopla(kullanilanSluglar, afiliyeAyar, etkinMarket)
    .map(u => ({ ...u, market: etkinMarket, paraBirimi: beklenenPara }));
  const birlesik = [...radarUrunler, ...beslemeUrunler];
  _seoListeOnbellek.set(etkinMarket, { ts: simdi, liste: birlesik });
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

/** Slug metnini anlık önbellek ve katalog aramaları için sorguya çevirir. */
function slugdanSorguya(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/-plus\b/g, '+')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugTokenleri(slug) {
  return String(slug || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && t !== 'plus');
}

function yedekUrunNesnesi({
  idOnEk, ad, teklifler, kaynakUrl = null, gorsel = null, marka = null,
  modelKodu = null, barkod = null, ts = Date.now(), istenenSlug = 'urun',
}) {
  const stoklu = teklifler.filter(t => t.stokta && t.fiyat > 0);
  const enIyi = stoklu[0] || null;
  const enPahali = stoklu.length ? stoklu[stoklu.length - 1] : null;
  const slug = slugYap(ad) || istenenSlug;
  const zaman = Number(ts) || Date.now();
  return {
    id: `${idOnEk}-${slug}`,
    kaynakTip: idOnEk,
    ad,
    sorgu: ad,
    kaynakUrl: kaynakUrl || enIyi?.url || null,
    kategori: 'genel',
    kategoriSlug: anaKategoriSlugBul({ ad, sorgu: ad, kategori: 'genel' }),
    slug,
    yol: `/urun/${slug}`,
    teklifler,
    enUcuzFiyat: enIyi ? enIyi.fiyat : null,
    enUcuzSite: enIyi ? enIyi.site : null,
    enUcuzUrl: enIyi ? enIyi.url : null,
    enPahaliFiyat: enPahali ? enPahali.fiyat : null,
    stokluSayisi: stoklu.length,
    gorsel,
    marka,
    modelKodu,
    barkod,
    birimMetni: null,
    sonTs: zaman,
    lastmod: new Date(zaman).toISOString().slice(0, 10),
  };
}

function snapshottanSeoUrun(s, istenenSlug, afiliyeAyar) {
  const ad = String(s?.urun || s?.payload?.kaynak?.urun || '').trim();
  if (!ad) return null;
  const teklifler = teklifListesiTopla({ ad, sorgu: ad, kategori: 'genel' }, null, s, afiliyeAyar);
  return yedekUrunNesnesi({
    idOnEk: 'snap',
    ad,
    teklifler,
    kaynakUrl: s.payload?.kaynak?.url || null,
    gorsel: s.payload?.kaynak?.image || s.payload?.kaynak?.resim || null,
    marka: s.payload?.kaynak?.brand || null,
    modelKodu: s.payload?.kaynak?.modelKodu || null,
    barkod: s.payload?.kaynak?.barkod || null,
    ts: s.ts,
    istenenSlug,
  });
}

function katalogSatirlarindanSeoUrun(satirlar, istenenSlug, afiliyeAyar) {
  if (!Array.isArray(satirlar) || !satirlar.length) return null;
  const ilk = satirlar[0];
  const ad = String(ilk.baslik || '').trim();
  if (!ad) return null;
  const teklifMap = new Map();
  let gorsel = null;
  let marka = null;
  let sonTs = 0;

  for (const r of satirlar) {
    if (!gorsel && r.gorselUrl && /^https?:\/\//i.test(r.gorselUrl)) gorsel = r.gorselUrl;
    if (!marka && r.marka) marka = String(r.marka).trim();
    if (Number(r.guncellemeTs) > sonTs) sonTs = Number(r.guncellemeTs);
    const hamFiyat = Number(r.fiyat);
    if (!Number.isFinite(hamFiyat) || hamFiyat <= 0) continue;
    const { fiyat, kargo } = kargoHesaplaTeklif(r.siteId, Math.round(hamFiyat * 100) / 100);
    const anahtar = r.siteId || r.urunUrl;
    const mevcut = teklifMap.get(anahtar);
    if (!mevcut || (r.stokta !== 0 && !mevcut.stokta) || fiyat < mevcut.fiyat) {
      teklifMap.set(anahtar, {
        siteId: r.siteId,
        site: siteNames[r.siteId] || r.siteId,
        baslik: String(r.baslik || ad).trim(),
        fiyat,
        urunFiyati: Math.round(hamFiyat * 100) / 100,
        stokta: r.stokta !== 0,
        kargo,
        url: guvenliAfiliyeUrl(r.siteId, r.urunUrl, afiliyeAyar),
      });
    }
  }

  const teklifler = [...teklifMap.values()].sort((a, b) => {
    if (a.stokta !== b.stokta) return a.stokta ? -1 : 1;
    return a.fiyat - b.fiyat;
  });
  return yedekUrunNesnesi({
    idOnEk: 'kat',
    ad,
    teklifler,
    kaynakUrl: ilk.urunUrl || null,
    gorsel,
    marka,
    ts: sonTs,
    istenenSlug,
  });
}

/**
 * `/urun/:slug` isteği ana listede bulunamadığında 404 yerine akıllı çözümleme:
 *   1) Anlık önbellekten (`snapshot`) doğrudan SSR ürün sayfası üretir
 *   2) Mevcut SEO kataloğunda yüksek benzerlikli kanonik `/urun/...` bulursa yönlendirir
 *   3) Uzun kuyruk mağaza kataloğundan (`katalog_urunleri`) SSR sayfası üretir
 *   4) Hiçbiri yoksa okunabilir arama sorgusuyla `/?q=...` (veya `/urunler`) yönlendirir
 *
 * @param {string} slugOrId
 * @param {Array<object>} [tumUrunler]
 * @returns {{tip:'sayfa', urun:object}|{tip:'yonlendir', hedef:string}}
 */
export function seoUrunYedekCoz(slugOrId, tumUrunler = null) {
  const ham = String(slugOrId || '').trim().toLowerCase();
  const sorgu = slugdanSorguya(ham);
  if (!ham || sorgu.length < 2) {
    return { tip: 'yonlendir', hedef: '/urunler' };
  }

  const liste = Array.isArray(tumUrunler) ? tumUrunler : seoUrunListesi();
  const afiliyeAyar = afiliyeAyarlari();
  const toks = slugTokenleri(ham);

  // 1) Anlık önbellekte (snapshot) BİREBİR slug eşleşmesi → doğrudan SSR sayfası
  let snapler = [];
  try {
    snapler = snapshotAra(sorgu, { limit: 8, maxYasMs: SNAPSHOT_MAX_YAS_MS });
    const tamSnap = snapler.find(s => slugYap(s.urun) === ham);
    if (tamSnap) {
      const urun = snapshottanSeoUrun(tamSnap, ham, afiliyeAyar);
      if (urun) return { tip: 'sayfa', urun };
    }
  } catch { /* snapshot yoksay */ }

  // 2) Katalog içinde yüksek benzerlikli slug eşleşmesi → kanonik /urun/:slug
  if (toks.length >= 2 && liste.length) {
    let enIyi = null;
    let enPuan = 0;
    for (const u of liste) {
      const uSlug = String(u?.slug || '').toLowerCase();
      if (!uSlug) continue;
      const uToks = slugTokenleri(uSlug);
      if (!uToks.length) continue;
      const uSet = new Set(uToks);
      let eslesen = 0;
      for (const t of toks) if (uSet.has(t)) eslesen++;
      const kapsamaGirdi = eslesen / toks.length;
      const kapsamaHedef = eslesen / uToks.length;
      const onekEslesme = uSlug.startsWith(`${ham}-`) || ham.startsWith(`${uSlug}-`);
      if (!(onekEslesme && eslesen >= 2) && !(eslesen >= 2 && kapsamaGirdi >= 0.75 && kapsamaHedef >= 0.55)) {
        continue;
      }
      const puan = (onekEslesme ? 1 : 0) + kapsamaGirdi + kapsamaHedef + (u.enUcuzFiyat > 0 ? 0.1 : 0);
      if (puan > enPuan) {
        enPuan = puan;
        enIyi = u;
      }
    }
    if (enIyi?.yol) {
      return { tip: 'yonlendir', hedef: enIyi.yol };
    }
  }

  // 3) Katalogda yoksa anlık önbellekteki yaklaşık eşleşmeyi SSR sayfası yap
  if (snapler.length && toks.length >= 2) {
    for (const s of snapler) {
      const sToks = new Set(slugTokenleri(slugYap(s.urun)));
      let eslesen = 0;
      for (const t of toks) if (sToks.has(t)) eslesen++;
      if (eslesen >= 2 && (eslesen / toks.length) >= 0.75) {
        const urun = snapshottanSeoUrun(s, ham, afiliyeAyar);
        if (urun) return { tip: 'sayfa', urun };
      }
    }
  }

  // 3) Uzun kuyruk mağaza kataloğu (ilk 550 dışında kalanlar)
  try {
    const katAdaylar = katalogUrunleriAra(sorgu, { limit: 15 });
    const tamKat = katAdaylar.filter(r => slugYap(r.baslik) === ham);
    if (tamKat.length) {
      const urun = katalogSatirlarindanSeoUrun(tamKat, ham, afiliyeAyar);
      if (urun) return { tip: 'sayfa', urun };
    }
    if (katAdaylar.length && toks.length >= 2) {
      const benzerKat = katAdaylar.filter((r) => {
        const kSet = new Set(slugTokenleri(slugYap(r.baslik)));
        let eslesen = 0;
        for (const t of toks) if (kSet.has(t)) eslesen++;
        return eslesen >= 2 && (eslesen / toks.length) >= 0.8;
      });
      if (benzerKat.length) {
        const urun = katalogSatirlarindanSeoUrun(benzerKat, ham, afiliyeAyar);
        if (urun) return { tip: 'sayfa', urun };
      }
    }
  } catch { /* katalog yoksay */ }

  // 4) Hiçbir kayıt yoksa ana sayfada kutuyu doldurup kullanıcı tıklamasını bekle
  // (bot / rastgele URL isteklerinde otomatik 69 mağaza taraması tetiklenmez).
  if (sorgu.length >= 3) {
    return { tip: 'yonlendir', hedef: `/?q=${encodeURIComponent(sorgu)}&otomatik=0` };
  }
  return { tip: 'yonlendir', hedef: '/urunler' };
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

/** Ortak Footer İç Link Ağı (tüm SSR sayfalar için tek kaynak). */
export const FOOTER_HUB_HTML = `
      <nav class="footer-hub" aria-label="Hızlı site dizini">
        <div>
          <h3 class="footer-hub-baslik">Kategoriler</h3>
          <ul class="footer-hub-liste">
            <li><a href="/kategori/3d-yazici">3D Yazıcı Fiyatları</a></li>
            <li><a href="/kategori/pla-filament">PLA &amp; PLA+ Filament</a></li>
            <li><a href="/kategori/petg-tpu-filament">PETG, TPU &amp; ABS Filament</a></li>
            <li><a href="/kategori/3d-yazici-yedek-parca">3D Yazıcı Yedek Parça</a></li>
            <li><a href="/kategori/recine-ve-sarf">UV Reçine &amp; Kurutucu</a></li>
            <li><a href="/urunler">Tüm Ürün Kataloğu</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-hub-baslik">Rehber &amp; Kıyaslama</h3>
          <ul class="footer-hub-liste">
            <li><a href="/karsilastir/bambu-lab-p1s-vs-creality-k1c">Bambu Lab P1S vs Creality K1C</a></li>
            <li><a href="/karsilastir/bambu-lab-a1-mini-vs-creality-ender-3-v3-ke">A1 Mini vs Ender 3 V3 KE</a></li>
            <li><a href="/karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro">Ender 3 V3 KE vs Neptune 4 Pro</a></li>
            <li><a href="/karsilastir/creality-k1-max-vs-bambu-lab-p1s">Creality K1 Max vs P1S</a></li>
            <li><a href="/rehber/en-ucuz-pla-filament">En Ucuz PLA Filamentler</a></li>
            <li><a href="/rehber">Tüm 3D Rehberler</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-hub-baslik">Araçlar</h3>
          <ul class="footer-hub-liste">
            <li><a href="/">Canlı Fiyat Karşılaştırma</a></li>
            <li><a href="/maliyet.html">Baskı Maliyet Hesaplayıcı</a></li>
            <li><a href="/sepet.html">Akıllı Sepet &amp; Kargo</a></li>
            <li><a href="/slicer.html">Cura &amp; Slicer Eklentisi</a></li>
            <li><a href="/ayarlar.html">Fiyat Alarmlarım</a></li>
          </ul>
        </div>
      </nav>`;

/** Seçili dil için ortak Footer İç Link Ağı üretir. */
export function footerHubHtml(dil = 'tr') {
  const kod = normalizeDil(dil);
  if (kod === 'tr') return FOOTER_HUB_HTML;
  const yol = navYollariGetir(kod);
  const etiket = {
    en: {
      kat: 'Categories', rehber: 'Guides & Versus', arac: 'Tools',
      k3d: '3D Printers', kpla: 'PLA & PLA+ Filament', kpetg: 'PETG, TPU & ABS', kyedek: 'Spare Parts & Nozzles', krecine: 'UV Resin & Dryers', ktum: 'Full Product Catalog',
      g1: 'Bambu Lab P1S vs Creality K1C', g2: 'A1 Mini vs Ender 3 V3 KE', g3: 'Ender 3 V3 KE vs Neptune 4 Pro', g4: 'Best Budget 3D Printers', g5: 'Cheapest PLA Filaments', gtum: 'All 3D Buying Guides',
      a1: 'Live Price Comparison', a2: '3D Print Cost Calculator', a3: 'Smart Basket & Shipping', a4: 'Cura & Slicer Plugin', a5: 'Price Alerts',
    },
    fr: {
      kat: 'Catégories', rehber: 'Guides & Duels', arac: 'Outils',
      k3d: 'Imprimantes 3D', kpla: 'Filaments PLA & PLA+', kpetg: 'PETG, TPU & ABS', kyedek: 'Pièces détachées & Buses', krecine: 'Résines UV & Séchoirs', ktum: 'Catalogue complet',
      g1: 'Bambu Lab P1S vs Creality K1C', g2: 'A1 Mini vs Ender 3 V3 KE', g3: 'Ender 3 V3 KE vs Neptune 4 Pro', g4: 'Meilleures imprimantes 3D', g5: 'Filaments PLA pas chers', gtum: 'Tous les guides 3D',
      a1: 'Comparateur de prix en direct', a2: 'Calculateur de coût STL', a3: 'Panier intelligent & port', a4: 'Extension Cura & Slicer', a5: 'Alertes de prix',
    },
    ja: {
      kat: 'カテゴリー', rehber: 'ガイド＆徹底比較', arac: 'ツール',
      k3d: '3Dプリンター価格', kpla: 'PLA・PLA+ フィラメント', kpetg: 'PETG・TPU・ABS', kyedek: '交換パーツ・ノズル', krecine: 'UVレジン・乾燥機', ktum: '全製品カタログ',
      g1: 'Bambu Lab P1S vs Creality K1C', g2: 'A1 Mini vs Ender 3 V3 KE', g3: 'Ender 3 V3 KE vs Neptune 4 Pro', g4: '初心者向けおすすめ3Dプリンター', g5: '最安PLAフィラメント', gtum: '3Dプリントガイド一覧',
      a1: 'リアルタイム価格比較', a2: '3Dプリント原価計算', a3: 'スマートカート＆送料最適化', a4: 'Cura・スライサー連携', a5: '価格アラート',
    },
  }[kod];
  return `
      <nav class="footer-hub" aria-label="Footer">
        <div>
          <h3 class="footer-hub-baslik">${etiket.kat}</h3>
          <ul class="footer-hub-liste">
            <li><a href="${kategoriYoluGetir('3d-yazici', kod)}">${etiket.k3d}</a></li>
            <li><a href="${kategoriYoluGetir('pla-filament', kod)}">${etiket.kpla}</a></li>
            <li><a href="${kategoriYoluGetir('petg-tpu-filament', kod)}">${etiket.kpetg}</a></li>
            <li><a href="${kategoriYoluGetir('3d-yazici-yedek-parca', kod)}">${etiket.kyedek}</a></li>
            <li><a href="${kategoriYoluGetir('recine-ve-sarf', kod)}">${etiket.krecine}</a></li>
            <li><a href="${yol.katalog}">${etiket.ktum}</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-hub-baslik">${etiket.rehber}</h3>
          <ul class="footer-hub-liste">
            <li><a href="${yol.rehber}#vs-p1s-k1c">${etiket.g1}</a></li>
            <li><a href="${yol.rehber}#vs-a1mini-v3ke">${etiket.g2}</a></li>
            <li><a href="${yol.rehber}#vs-v3ke-n4pro">${etiket.g3}</a></li>
            <li><a href="${yol.rehber}#guide-printers">${etiket.g4}</a></li>
            <li><a href="${yol.rehber}#guide-pla">${etiket.g5}</a></li>
            <li><a href="${yol.rehber}">${etiket.gtum}</a></li>
          </ul>
        </div>
        <div>
          <h3 class="footer-hub-baslik">${etiket.arac}</h3>
          <ul class="footer-hub-liste">
            <li><a href="${yol.ana}">${etiket.a1}</a></li>
            <li><a href="${yol.maliyet}">${etiket.a2}</a></li>
            <li><a href="${yol.sepet}">${etiket.a3}</a></li>
            <li><a href="${yol.slicer}">${etiket.a4}</a></li>
            <li><a href="${yol.ayarlar}">${etiket.a5}</a></li>
          </ul>
        </div>
      </nav>`;
}

export function sayfaIskeleti({ title, description, canonicalUrl, ogImage, ogType = 'website', extraMeta = '', jsonLdList = [], govdeHtml, aktifNav = 'katalog', dil = 'tr', dilYolHaritasi = null, anaKapsam = false, bodyClass = '' }) {
  const sz = sozlukGetir(dil);
  const kokYol = sz.meta.dil === 'tr' ? '/' : `/${sz.meta.dil}`;
  const navYol = navYollariGetir(sz.meta.dil);
  const safeTitle = htmlKacis(title);
  const safeDesc = htmlKacis(description);
  const safeUrl = htmlKacis(canonicalUrl);
  const safeImg = htmlKacis(ogImage);
  const safeOgType = htmlKacis(ogType);
  const jsonScripts = jsonLdList
    .map(o => `<script type="application/ld+json">${jsonLdMetni(o)}</script>`)
    .join('\n  ');
  const alanKok = String(canonicalUrl || '').replace(/^(https?:\/\/[^/]+).*$/, '$1');
  let otoHreflang = '';
  if (!String(extraMeta || '').includes('hreflang=') && safeUrl) {
    if (dilYolHaritasi && alanKok && /^https?:\/\//i.test(alanKok)) {
      const parcalar = ['tr', 'en', 'fr', 'ja']
        .filter(d => dilYolHaritasi[d])
        .map(d => `<link rel="alternate" hreflang="${d}" href="${htmlKacis(alanKok + dilYolHaritasi[d])}" />`);
      if (dilYolHaritasi.tr) {
        parcalar.push(`<link rel="alternate" hreflang="x-default" href="${htmlKacis(alanKok + dilYolHaritasi.tr)}" />`);
      }
      otoHreflang = parcalar.join('\n  ');
    } else {
      otoHreflang = `<link rel="alternate" hreflang="${htmlKacis(sz.meta.dil)}" href="${safeUrl}" />`
        + (sz.meta.dil === 'tr' ? `\n  <link rel="alternate" hreflang="x-default" href="${safeUrl}" />` : '');
    }
  }
  const birlesikExtraMeta = [otoHreflang, extraMeta].filter(Boolean).join('\n  ');

  const ga4Snip = ga4HeadSnip();
  return `<!DOCTYPE html>
<html lang="${htmlKacis(sz.meta.dil)}" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="Takeads-verification" content="25d0f656-5702-44e2-87df-5677a9773117">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <link rel="canonical" href="${safeUrl}" />
  <meta name="theme-color" content="#1E40AF" />
  <meta property="og:type" content="${safeOgType}" />
  <meta property="og:site_name" content="${htmlKacis(sz.meta.siteAdi)}" />
  <meta property="og:locale" content="${htmlKacis(sz.meta.ogLocale)}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:image" content="${safeImg}" />${birlesikExtraMeta ? '\n  ' + birlesikExtraMeta : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  <link rel="icon" href="/ikon-192.png" />
  <link rel="apple-touch-icon" href="/ikon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <script>
    try {
      var t = localStorage.getItem('tema');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="/style.css?v=19" />
  <style>
    .seo-kapsam { max-width: 1080px; margin: 24px auto 48px; padding: 0 24px; }
    .seo-yol { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; color: var(--gri-metin); margin-bottom: 16px; }
    .seo-yol a { color: var(--ana); text-decoration: none; font-weight: 500; }
    .seo-kart { background: var(--kart); border: 1px solid var(--cizgi); border-radius: var(--radius); padding: 24px; box-shadow: var(--kart-golge); margin-bottom: 20px; }
    .seo-ust { display: grid; grid-template-columns: 112px 1fr; gap: 20px; align-items: center; }
    .seo-gorsel { width: 112px; height: 112px; border-radius: 8px; object-fit: contain; background: #fff; border: 1px solid var(--cizgi); padding: 8px; }
    .seo-baslik { margin: 0 0 8px; font-size: clamp(22px, 3vw, 30px); line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; }
    .seo-alt { margin: 0 0 16px; color: var(--gri-metin); font-size: 14.5px; line-height: 1.55; }
    .seo-fiyat-kutu { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px 20px; border-radius: var(--radius-md); background: var(--yesil-acik); border: 1px solid var(--yesil-cizgi); margin: 16px 0; }
    .seo-fiyat-ana { font-size: 28px; font-weight: 600; color: var(--yesil); font-variant-numeric: tabular-nums; }
    html[data-theme="dark"] .seo-fiyat-ana { color: #34D399; }
    .seo-butonlar { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    .seo-cta { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; font-weight: 500; font-size: 14px; text-decoration: none; color: #fff; background: var(--ana); box-shadow: var(--golge-yumusak); transition: background-color 0.15s var(--ease); }
    .seo-cta:hover { background: var(--ana-koyu); }
    .seo-cta.ikincil { background: var(--kart); color: var(--metin); border: 1px solid var(--cizgi-koyu); box-shadow: none; }
    .seo-tablo { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .seo-tablo th, .seo-tablo td { padding: 12px; text-align: left; border-bottom: 1px solid var(--cizgi); font-size: 14px; }
    .seo-tablo th { font-size: 12px; font-weight: 500; color: var(--gri-metin); }
    .seo-tablo th:nth-child(5), .seo-tablo td:nth-child(5),
    .seo-tablo th:nth-child(6), .seo-tablo td:nth-child(6) { white-space: nowrap; }
    .seo-piyasa-izgara { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 12px; margin: 12px 0 16px; }
    .seo-piyasa-kutu { padding: 12px 16px; border-radius: 8px; background: var(--zemin); border: 1px solid var(--cizgi); }
    .seo-piyasa-etiket { font-size: 12px; font-weight: 500; color: var(--gri-metin); }
    .seo-piyasa-deger { margin-top: 4px; font-family: var(--mono); font-size: 17px; font-weight: 600; color: var(--metin); font-variant-numeric: tabular-nums; }
    .seo-piyasa-metin { margin: 0 0 12px; font-size: 14px; line-height: 1.65; color: var(--gri-metin); }
    .seo-ic-linkler { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .seo-ic-link { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; background: var(--zemin); border: 1px solid var(--cizgi); color: var(--ana); font-size: 12.5px; font-weight: 500; text-decoration: none; }
    .seo-ic-link:hover { border-color: var(--ana); }
    html[data-theme="dark"] .seo-ic-link { color: var(--ana-parlak); }
    .seo-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .seo-mini-kart { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: var(--radius); background: var(--kart); border: 1px solid var(--cizgi); text-decoration: none; color: inherit; transition: border-color 0.15s var(--ease); }
    .seo-mini-kart:hover { border-color: var(--ana); }
    .seo-mini-ad { font-weight: 500; font-size: 14.5px; line-height: 1.4; }
    .seo-mini-fiyat { font-family: var(--mono); font-weight: 600; font-size: 17px; color: var(--yesil); font-variant-numeric: tabular-nums; }
    html[data-theme="dark"] .seo-mini-fiyat { color: #34D399; }
    .seo-mini-alt { font-size: 12.5px; color: var(--gri-metin); }
    .seo-kat-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .seo-kat-hap { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--cizgi); background: var(--kart); color: var(--metin); text-decoration: none; font-size: 13px; font-weight: 500; }
    .seo-kat-hap.etkin { background: var(--ana); color: #fff; border-color: var(--ana); }
    .seo-hero { margin: 0 0 24px; }
    .seo-hero .hero-ic { max-width: 860px; }
    .rehber-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 16px; }
    .rehber-kart {
      position: relative; overflow: hidden;
      display: flex; flex-direction: column; gap: 12px;
      padding: 20px; border-radius: var(--radius);
      background: var(--kart); border: 1px solid var(--cizgi);
      box-shadow: var(--kart-golge); text-decoration: none; color: inherit;
      transition: box-shadow 0.16s var(--ease), border-color 0.16s var(--ease);
    }
    .rehber-kart::before {
      content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
      background: var(--ana);
      opacity: .65;
    }
    .rehber-kart:hover { border-color: var(--ana); box-shadow: var(--kart-golge-uzerinde); }
    .rehber-kart-ust { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .rehber-ikon {
      width: 40px; height: 40px; border-radius: 8px; color: var(--ana);
      display: grid; place-items: center; font-size: 18px;
      background: var(--ana-acik); border: 1px solid color-mix(in srgb, var(--ana) 20%, transparent);
      flex: none;
    }
    .rehber-rozet {
      font-family: var(--mono); font-size: 11px; font-weight: 500;
      padding: 4px 8px; border-radius: 6px;
      background: var(--zemin-2); color: var(--ana); border: 1px solid var(--cizgi);
    }
    html[data-theme="dark"] .rehber-rozet { color: var(--ana-parlak); }
    .rehber-baslik { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.35; color: var(--metin); }
    .rehber-ozet { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--gri-metin); }
    .rehber-canli-band {
      margin-top: auto; padding: 8px 12px; border-radius: 8px;
      background: var(--yesil-acik); border: 1px solid var(--yesil-cizgi);
      font-size: 12.5px; font-weight: 500; color: var(--yesil);
    }
    .rehber-canli-band.notr { background: var(--zemin-2); border-color: var(--cizgi); color: var(--gri-metin); }
    .rehber-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 500; color: var(--ana); }
    html[data-theme="dark"] .rehber-cta { color: var(--ana-parlak); }
    .seo-vs-izgara { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: stretch; }
    .seo-vs-orta { display: grid; place-items: center; }
    .seo-vs-rozet {
      width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center;
      font-family: var(--mono); font-weight: 600; font-size: 12px; color: var(--metin);
      background: var(--zemin-2); border: 1px solid var(--cizgi-koyu);
    }
    .seo-vs-kart { position: relative; }
    .seo-vs-kart.kazanan { border-color: var(--yesil); background: var(--kart); }
    .seo-vs-etiket {
      display: inline-block; align-self: flex-start; font-size: 11.5px; font-weight: 500;
      padding: 4px 8px; border-radius: 6px; background: var(--yesil-acik); color: var(--yesil);
      border: 1px solid var(--yesil-cizgi);
    }
    .seo-vs-baslik { display: flex; gap: 12px; align-items: center; }
    .seo-vs-img { width: 64px; height: 64px; border-radius: 8px; object-fit: contain; background: #fff; border: 1px solid var(--cizgi); padding: 4px; flex: none; }
    .formul-izgara { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
    .formul-kart {
      padding: 16px; border-radius: var(--radius); background: var(--zemin-2); border: 1px solid var(--cizgi);
      display: flex; flex-direction: column; gap: 8px;
    }
    .formul-kart code { font-family: var(--mono); font-size: 12.5px; padding: 6px 8px; border-radius: 6px; background: var(--kart); border: 1px solid var(--cizgi); color: var(--ana); font-weight: 500; }
    html[data-theme="dark"] .formul-kart code { color: var(--ana-parlak); }
    .sira-madalya { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
    .katalog-kontrol {
      display: flex; flex-direction: column; align-items: stretch;
      gap: 12px; margin-bottom: 16px;
    }
    .katalog-ara-sar { position: relative; width: 100%; max-width: 440px; }
    .seo-kapsam .katalog-ara-sar input[type="search"] {
      width: 100%; padding: 10px 14px 10px 40px; border-radius: 8px;
      border: 1px solid var(--cizgi-koyu); background: var(--kart); color: var(--metin);
      font: inherit; font-size: 14px; outline: none; box-shadow: none;
    }
    .seo-kapsam .katalog-ara-sar input[type="search"]:focus { border-color: var(--ana); box-shadow: var(--halka); }
    .katalog-ara-ikon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 15px; opacity: .7; pointer-events: none; line-height: 1; }
    .kat-baslik-ust { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .kat-baslik-sol { display: flex; align-items: center; gap: 12px; }
    .kat-ikon {
      width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center;
      font-size: 18px; color: var(--ana); background: var(--ana-acik); flex: none;
    }
    .kat-sayac {
      display: inline-flex; align-items: center; font-family: var(--mono); font-size: 12px; font-weight: 500;
      padding: 4px 8px; border-radius: 6px; background: var(--zemin-2);
      border: 1px solid var(--cizgi); color: var(--gri-metin);
    }
    .seo-urun-kart {
      display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--radius);
      background: var(--kart); border: 1px solid var(--cizgi); text-decoration: none; color: inherit;
      transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
    }
    .seo-urun-kart:hover { border-color: var(--ana); box-shadow: var(--kart-golge-uzerinde); }
    .seo-urun-ust { display: flex; gap: 12px; align-items: flex-start; }
    .seo-urun-img {
      width: 56px; height: 56px; border-radius: 8px; object-fit: contain;
      background: #fff; border: 1px solid var(--cizgi); padding: 4px; flex: none;
    }
    .seo-urun-ikon {
      width: 56px; height: 56px; border-radius: 8px; display: grid; place-items: center;
      font-size: 20px; color: var(--gri-metin); background: var(--zemin-2); border: 1px solid var(--cizgi); flex: none;
    }
    .seo-urun-etiketler { display: flex; flex-wrap: wrap; gap: 6px; }
    .seo-urun-etiket {
      font-family: var(--mono); font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px;
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
<body${bodyClass ? ` class="${htmlKacis(bodyClass)}"` : ''}>
  <header class="ustbar">
    <div class="kap">
      <a class="logo" href="${htmlKacis(kokYol)}" aria-label="${htmlKacis(sz.meta.siteAdi)}">
        <img class="logo-gorsel" src="/logo.png" alt="${htmlKacis(sz.meta.siteAdi)}" width="36" height="30" decoding="async" />
      </a>
      <nav class="menu">
        <a href="${htmlKacis(navYol.ana)}"${aktifNav === 'karsilastir' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.karsilastir)}</a>
        <a href="${htmlKacis(navYol.katalog)}"${aktifNav === 'katalog' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.katalog)}</a>
        <a href="${htmlKacis(navYol.rehber)}"${aktifNav === 'rehber' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.rehberler)}</a>
        <a href="${htmlKacis(navYol.maliyet)}"${aktifNav === 'maliyet' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.maliyet)}</a>
        <a href="${htmlKacis(navYol.sepet)}"${aktifNav === 'sepet' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.akilliSepet)}</a>
        <a href="${htmlKacis(navYol.slicer)}"${aktifNav === 'eklenti' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.eklenti)}</a>
        <a href="${htmlKacis(navYol.ayarlar)}">${htmlKacis(sz.nav.alarmlar)}</a>
      </nav>
      ${dilSeciciHtml(sz.meta.dil, dilYolHaritasi)}
      ${temaDugmesiHtml(sz.meta.dil)}
    </div>
  </header>

  <main class="${anaKapsam ? 'kap' : 'seo-kapsam'}">
    ${govdeHtml}
  </main>

  <footer class="altbar">
    <div class="kap">
      <div class="footer-marka">
        <img class="footer-marka-logo" src="/logo.png" alt="${htmlKacis(sz.meta.siteAdi)}" width="34" height="29" decoding="async" />
        <a class="footer-marka-alan" href="${htmlKacis(kokYol)}" rel="home">baskihesap.tech</a>
      </div>
      ${footerHubHtml(sz.meta.dil)}
      <p>${sz.meta.dil === 'tr' ? 'Fiyatlar Türkiye mağazalarından anlık okunur; kargo ve herkesin yararlanabileceği indirimler dahildir. Güncel fiyat için "Canlı Fiyatları Şimdi Tara" ile anlık kontrol edebilirsiniz.' : htmlKacis(sz.baslik.footerNot)}</p>
    </div>
  </footer>
  <script src="/tema.js"></script>
</body>
</html>`;
}

function kategoriIkonu(slug) {
  const s = 'class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"';
  if (slug === '3d-yazici') return `<svg ${s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`;
  if (slug === 'pla-filament') return `<svg ${s}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`;
  if (slug === 'petg-tpu-filament') return `<svg ${s}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`;
  if (slug === '3d-yazici-yedek-parca') return `<svg ${s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  if (slug === 'recine-ve-sarf') return `<svg ${s}><path d="M10 2v7.31l-4.6 7.67A2 2 0 0 0 7.11 20h9.78a2 2 0 0 0 1.71-3.02L14 9.31V2"/><path d="M8.5 2h7"/></svg>`;
  return `<svg ${s}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;
}

function seoUrunKartiHtml(u, gizli = false, dil = 'tr') {
  const kod = normalizeDil(dil);
  const ceviri = {
    tr: { canli: 'Canlı Tara →', bekliyor: 'Taranmayı bekliyor', magaza: 'mağaza', kargo: 'Kargo dahil →', bul: 'Fiyat Bul →' },
    en: { canli: 'Live Scan →', bekliyor: 'Ready to scan', magaza: 'stores', kargo: 'Incl. shipping →', bul: 'Find Price →' },
    fr: { canli: 'Scan en direct →', bekliyor: 'Prêt à scanner', magaza: 'boutiques', kargo: 'Port inclus →', bul: 'Voir le prix →' },
    ja: { canli: '最安値検索 →', bekliyor: 'スキャン待機中', magaza: '店舗', kargo: '送料込 →', bul: '価格を探す →' },
  }[kod];
  const gorselHtml = u.gorsel
    ? `<img class="seo-urun-img" src="${htmlKacis(u.gorsel)}" alt="${htmlKacis(u.ad)}" width="56" height="56" loading="lazy" decoding="async" />`
    : `<span class="seo-urun-ikon" aria-hidden="true">${kategoriIkonu(u.kategoriSlug)}</span>`;
  const fiyatHtml = u.enUcuzFiyat > 0
    ? `<span class="seo-mini-fiyat">${kod === 'tr' ? formatTL(u.enUcuzFiyat) : htmlKacis(dilParaFormati(kod, u.enUcuzFiyat, u.paraBirimi))}</span>`
    : `<span class="seo-mini-fiyat" style="color:var(--ana);font-size:14.5px">${ceviri.canli}</span>`;
  const magazaRozet = u.enUcuzSite
    ? `<span class="seo-urun-etiket">${htmlKacis(u.enUcuzSite)}</span>`
    : `<span class="seo-urun-etiket">${ceviri.bekliyor}</span>`;
  const teklifRozet = u.stokluSayisi > 1
    ? `<span class="seo-urun-etiket">${u.stokluSayisi} ${ceviri.magaza}</span>`
    : '';
  const birimRozet = u.birimMetni
    ? `<span class="seo-urun-etiket">${htmlKacis(u.birimMetni)}</span>`
    : '';
  const kartYol = (kod !== 'tr' && String(u.yol || '').startsWith('/urun/'))
    ? `/${kod}${u.yol}`
    : (u.yol || `/${kod}?url=${encodeURIComponent(u.sorgu || u.ad || '')}`);
  return `<a class="seo-urun-kart${gizli ? ' gizli-katalog-kart' : ''}"${gizli ? ' hidden' : ''} href="${htmlKacis(kartYol)}" data-urun-ad="${htmlKacis(`${u.ad} ${u.enUcuzSite || ''}`.toLowerCase())}">
    <div class="seo-urun-ust">
      ${gorselHtml}
      <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
    </div>
    <div class="seo-urun-etiketler">${magazaRozet}${teklifRozet}${birimRozet}</div>
    <div class="seo-urun-alt">
      ${fiyatHtml}
      <span class="seo-urun-ok">${u.enUcuzFiyat > 0 ? ceviri.kargo : ceviri.bul}</span>
    </div>
  </a>`;
}

const ILGILI_REHBER_ESLEME = [
  {
    re: /bambu\s*lab\s*p1s|creality\s*k1c|\bk1c\b/i,
    yol: '/karsilastir/bambu-lab-p1s-vs-creality-k1c',
    ikon: '⚖️',
    rozet: 'VS Karşılaştırma',
    etiket: 'Bambu Lab P1S vs Creality K1C',
    aciklama: '256mm vs 220mm baskı hacmi, AMS çok renk desteği ve bugünkü kargo dahil Türkiye fiyat farkı.',
  },
  {
    re: /creality\s*k1\s*max|\bk1\s*max\b|bambu\s*lab\s*p1s/i,
    yol: '/karsilastir/creality-k1-max-vs-bambu-lab-p1s',
    ikon: '🏗️',
    rozet: 'VS Karşılaştırma',
    etiket: 'Creality K1 Max vs Bambu Lab P1S',
    aciklama: '300 mm dev baskı alanı ile kapalı kasa Bambu AMS ekosisteminin canlı fiyatlı kıyaslaması.',
  },
  {
    re: /ender\s*3\s*v3\s*ke|neptune\s*4\s*pro/i,
    yol: '/karsilastir/ender-3-v3-ke-vs-elegoo-neptune-4-pro',
    ikon: '⚡',
    rozet: 'VS Karşılaştırma',
    etiket: 'Ender 3 V3 KE vs Elegoo Neptune 4 Pro',
    aciklama: '500 mm/s Klipper hızı, otomatik Z-offset vs çift bölgeli tabla ve canlı Türkiye fiyatları.',
  },
  {
    re: /bambu\s*lab\s*a1\s*mini|bambu\s*lab\s*a1(?!\s*mini)/i,
    yol: '/karsilastir/bambu-lab-a1-vs-bambu-lab-a1-mini',
    ikon: '⚖️',
    rozet: 'VS Karşılaştırma',
    etiket: 'Bambu Lab A1 vs A1 Mini',
    aciklama: '256 mm tam hacim ile 180 mm kompakt kasa arasında baskı alanı, AMS Lite ve canlı fiyat farkı.',
  },
  {
    re: /bambu\s*lab\s*a1(?!\s*mini)|creality\s*k1c|\bk1c\b/i,
    yol: '/karsilastir/bambu-lab-a1-vs-creality-k1c',
    ikon: '🔥',
    rozet: 'VS Karşılaştırma',
    etiket: 'Bambu Lab A1 vs Creality K1C',
    aciklama: 'Açık kasa 256 mm + AMS Lite şansı ile kapalı kasa CoreXY karbon fiber baskı karşılaştırması.',
  },
  {
    re: /bambu\s*lab\s*a1\s*mini|ender\s*3\s*v3\s*ke/i,
    yol: '/karsilastir/bambu-lab-a1-mini-vs-creality-ender-3-v3-ke',
    ikon: '🚀',
    rozet: 'VS Karşılaştırma',
    etiket: 'Bambu Lab A1 Mini vs Ender 3 V3 KE',
    aciklama: 'Başlangıç segmentinde AMS Lite sessizliği ile 220 mm geniş tabla arasında hangisi daha mantıklı?',
  },
  {
    re: /3d\s*yazıcı|3d\s*printer|ender|neptune|a1\s*mini/i,
    yol: '/rehber/baslangic-icin-en-iyi-3d-yazicilar',
    ikon: '🖨️',
    rozet: 'Alım Rehberi',
    etiket: 'Başlangıç İçin En İyi 3D Yazıcılar',
    aciklama: 'Stoklu başlangıç ve orta seviye 3D yazıcıların kargo dahil bütçe sıralaması.',
  },
  {
    re: /\bpla\b/i,
    yol: '/rehber/en-ucuz-pla-filament',
    ikon: '🥇',
    rozet: 'Canlı Sıralama',
    etiket: 'En Ucuz PLA Filamentler',
    aciklama: 'Türkiye mağazalarında stokta olan 1 kg PLA makaraların kargo dahil güncel sıralaması.',
  },
  {
    re: /\bpetg\b|\btpu\b/i,
    yol: '/rehber/en-ucuz-petg-ve-tpu-filamentler',
    ikon: '🦾',
    rozet: 'Canlı Sıralama',
    etiket: 'En Ucuz PETG & TPU Filamentler',
    aciklama: 'Dayanıklı PETG ve esnek TPU makaralar için 60+ mağazada stoklu en düşük kargo dahil teklifler.',
  },
  {
    re: /\bpla\b|\bpetg\b/i,
    yol: '/rehber/pla-vs-petg-filament',
    ikon: '🧵',
    rozet: 'Teknik Rehber',
    etiket: 'PLA vs PETG Filament Rehberi',
    aciklama: 'Dayanım, sıcaklık direnci, baskı kolaylığı ve parça başına maliyet karşılaştırması.',
  },
  {
    re: /kurutucu|dryer|space\s*pi|ebox/i,
    yol: '/rehber/filament-kurutucu-gerekli-mi',
    ikon: '♨️',
    rozet: 'Teknik Rehber',
    etiket: 'Filament Kurutucu Gerekli Mi?',
    aciklama: 'PLA, PETG ve TPU nemlenme belirtileri ve aktif filament kurutucuların canlı fiyatları.',
  },
  {
    re: /filament|\bpla\b|\bpetg\b|\btpu\b|\babs\b|\basa\b/i,
    yol: '/rehber/3d-baski-maliyeti-nasil-hesaplanir',
    ikon: '🧮',
    rozet: 'Hesaplama Rehberi',
    etiket: '3D Baskı Maliyeti Nasıl Hesaplanır?',
    aciklama: 'Gramaj, elektrik tüketimi, fire payı ve satış fiyatı hesaplama formülü.',
  },
];

function ilgiliRehberKartlari(urun) {
  const metin = `${urun.ad || ''} ${urun.sorgu || ''}`;
  const eslesen = [];
  for (const r of ILGILI_REHBER_ESLEME) {
    if (r.re.test(metin) && !eslesen.some(x => x.yol === r.yol)) {
      eslesen.push(r);
      if (eslesen.length >= 3) break;
    }
  }
  return eslesen;
}

/**
 * Ürün sayfası için yalnızca GERÇEK veritabanı teklif/geçmiş kayıtlarından
 * piyasa analizi özeti + dinamik SSS ve `FAQPage` JSON-LD şeması üretir.
 */
function piyasaOzetiVeSssOlustur(urun, kat, tabanUrl, dil = 'tr') {
  const etkinDil = normalizeDil(dil);
  const paraBirimi = paraBirimiNormalize(urun.paraBirimi || urun.currency || sozlukGetir(etkinDil).para.kod);
  const fiyatMetni = (v) => urunFiyatMetni(v, paraBirimi);
  const teklifler = Array.isArray(urun.teklifler) ? urun.teklifler : [];
  const stoklular = teklifler.filter(t => t.stokta && Number(t.fiyat) > 0);
  const tukenenSayisi = teklifler.filter(t => !t.stokta).length;
  const enUcuz = stoklular[0] || null;
  const guncelFiyat = urun.enUcuzFiyat > 0 ? Number(urun.enUcuzFiyat) : (enUcuz?.fiyat || null);
  const enPahaliFiyat = urun.enPahaliFiyat > 0
    ? Number(urun.enPahaliFiyat)
    : (stoklular.length ? stoklular[stoklular.length - 1].fiyat : null);
  const magazaSayisi = Math.max(stoklular.length, Number(urun.stokluSayisi) || 0);
  const fark = (guncelFiyat > 0 && enPahaliFiyat > guncelFiyat)
    ? Math.round((enPahaliFiyat - guncelFiyat) * 100) / 100
    : 0;
  const farkYuzde = (fark > 0 && enPahaliFiyat > 0) ? Math.round((fark / enPahaliFiyat) * 100) : 0;

  // Gerçek 30 / 90 günlük fiyat geçmişi (yalnızca DB'de ≥ 2 nokta varsa)
  let gecmis30 = null;
  let gecmis90 = null;
  if (Number.isFinite(Number(urun.id)) && Number(urun.id) > 0) {
    try {
      const seri90 = radarSerisi(urun.id, { gun: 90, limit: 200 });
      if (seri90.length >= 2) {
        const oz90 = grafikOzeti(seri90);
        const ort90 = seri90.reduce((s, n) => s + n.fiyat, 0) / seri90.length;
        gecmis90 = { min: oz90.min, max: oz90.max, ort: Math.round(ort90 * 100) / 100, nokta: seri90.length };
        const esik30 = Date.now() - 30 * 86400000;
        const seri30 = seri90.filter(n => n.ts >= esik30);
        if (seri30.length >= 2) {
          const oz30 = grafikOzeti(seri30);
          const ort30 = seri30.reduce((s, n) => s + n.fiyat, 0) / seri30.length;
          gecmis30 = { min: oz30.min, max: oz30.max, ort: Math.round(ort30 * 100) / 100, nokta: seri30.length };
        }
      }
    } catch { /* tarihçe yoksa sessizce atlanır */ }
  }

  // Metrik kutuları (uydurma kutu yok; yalnızca gerçek veri)
  const kutular = [];
  if (gecmis30) {
    kutular.push({ etiket: 'Son 30 Gün En Düşük', deger: fiyatMetni(gecmis30.min) });
    kutular.push({ etiket: 'Son 30 Gün Ortalama', deger: fiyatMetni(gecmis30.ort) });
  }
  if (gecmis90) {
    kutular.push({ etiket: 'Son 90 Gün Tabanı', deger: fiyatMetni(gecmis90.min) });
  }
  if (fark > 0) {
    kutular.push({ etiket: 'Mağazalar Arası Fark', deger: `${fiyatMetni(fark)} (%${farkYuzde})` });
  } else if (magazaSayisi > 0) {
    kutular.push({ etiket: 'Stoklu Mağaza Sayısı', deger: `${magazaSayisi} mağaza` });
  }
  if (urun.birimMetni) {
    kutular.push({ etiket: 'Birim Fiyat', deger: urun.birimMetni });
  }

  // 2–3 cümlelik içerik derinliği (piyasa analizi metni)
  const cumleler = [];
  if (guncelFiyat > 0 && urun.enUcuzSite) {
    cumleler.push(
      `${urun.ad} için Türkiye’deki 3D baskı ve e-ticaret mağazalarında yapılan taramalarda `
      + `${magazaSayisi || 1} mağazada satın alınabilir stok bulunuyor`
      + `${tukenenSayisi > 0 ? ` (${tukenenSayisi} mağaza stokta yok olarak elendi)` : ''}; `
      + `kargo dahil en düşük teklif ${fiyatMetni(guncelFiyat)} ile ${urun.enUcuzSite} mağazasında.`,
    );
  } else {
    cumleler.push(
      `${urun.ad} için Türkiye mağazalarındaki güncel stok ve kargo dahil toplam fiyatlar düzenli olarak taranır; `
      + `önbellekte anlık kayıt yoksa "Canlı Fiyatları Şimdi Tara" ile tüm mağazaları kontrol edebilirsiniz.`,
    );
  }
  if (fark > 0) {
    cumleler.push(
      `Stoklu mağazalar arasında fiyatlar ${fiyatMetni(guncelFiyat)} ile ${fiyatMetni(enPahaliFiyat)} `
      + `arasında değişiyor — en uygun satıcıyı seçmek ${fiyatMetni(fark)} (%${farkYuzde}) tasarruf sağlar.`,
    );
  }
  if (gecmis30) {
    let gecmisNotu = `Son 30 günlük gerçek fiyat takibinde en düşük ${fiyatMetni(gecmis30.min)} ve `
      + `ortalama ${fiyatMetni(gecmis30.ort)} ölçüldü`;
    if (gecmis90) gecmisNotu += ` (90 günlük en düşük ${fiyatMetni(gecmis90.min)})`;
    if (guncelFiyat > 0 && guncelFiyat <= (gecmis90?.min ?? gecmis30.min) + 0.01) {
      gecmisNotu += '; bugünkü fiyat takip edilen dip seviyede.';
    } else if (guncelFiyat > 0 && guncelFiyat < gecmis30.ort - 1) {
      const yuzdeAlt = Math.round(((gecmis30.ort - guncelFiyat) / gecmis30.ort) * 100);
      gecmisNotu += yuzdeAlt >= 1 ? `; güncel teklif 30 gün ortalamasının %${yuzdeAlt} altında.` : '.';
    } else {
      gecmisNotu += '.';
    }
    cumleler.push(gecmisNotu);
  }

  // İlgili rehber & araç linkleri (iç linkleme ağı)
  const icLinkler = [
    { yol: `/kategori/${kat.slug}`, metin: `📂 ${kat.kisaAd} Kategorisi` },
  ];
  const filamentMi = ['pla-filament', 'petg-tpu-filament', 'filament'].includes(urun.kategoriSlug);
  if (filamentMi || urun.birimMetni) {
    icLinkler.push({ yol: '/maliyet.html', metin: '🧮 Baskı Maliyeti Hesapla' });
  }
  icLinkler.push({ yol: '/sepet.html', metin: '🧺 Akıllı Sepet ile Kargo Birleştir' });
  const ilgiliRehberler = ilgiliRehberKartlari(urun);
  for (const r of ilgiliRehberler) {
    if (icLinkler.length >= 5) break;
    icLinkler.push({ yol: r.yol, metin: `📖 ${r.etiket}` });
  }

  // Dinamik SSS + FAQPage JSON-LD (TR için 30/90g tarihçe cümleleri korunur; EN/FR/JA için i18n şablonu)
  const sssListesi = [];
  if (etkinDil !== 'tr') {
    sssListesi.push(...sssSablonlari(etkinDil, {
      ad: urun.ad,
      guncelFiyat: guncelFiyat || 0,
      enPahaliFiyat: enPahaliFiyat || 0,
      enUcuzSite: urun.enUcuzSite || '',
      magazaSayisi,
      kargoNotu: enUcuz?.kargo || '',
      paraBirimi,
    }));
  } else if (guncelFiyat > 0 && urun.enUcuzSite) {
    const kargoNotu = enUcuz?.kargo ? ` (${enUcuz.kargo})` : '';
    sssListesi.push({
      soru: `${urun.ad} en ucuz hangi mağazada ve ne kadar?`,
      cevap: `Son tarama verilerine göre ${urun.ad} kargo dahil en ucuz ${fiyatMetni(guncelFiyat)} fiyatıyla ${urun.enUcuzSite} mağazasında stoktadır${kargoNotu}.`,
    });
  } else {
    sssListesi.push({
      soru: `${urun.ad} güncel fiyatını nasıl görebilirim?`,
      cevap: `Sayfanın üstündeki "Canlı Fiyatları Şimdi Tara" butonuna tıklayarak Türkiye’deki 60+ 3D baskı ve e-ticaret mağazasındaki güncel stok ve kargo dahil toplam tutarı anlık olarak çekebilirsiniz.`,
    });
  }

  if (etkinDil !== 'tr') {
    // sssSablonlari(etkinDil, ...) tarafından üretilen 3 temel soru korunur.
  } else if (magazaSayisi >= 2 && fark > 0) {
    sssListesi.push({
      soru: `${urun.ad} kaç mağazada stokta ve fiyat farkı ne kadar?`,
      cevap: `Toplam ${magazaSayisi} mağazada satın alınabilir stok tespit edilmiştir. Kargo dahil teklifler ${fiyatMetni(guncelFiyat)} ile ${fiyatMetni(enPahaliFiyat)} aralığındadır (${fiyatMetni(fark)} / %${farkYuzde} fark).`,
    });
  } else {
    sssListesi.push({
      soru: `${urun.ad} stokta olmayan mağazalar listede en ucuz sayılır mı?`,
      cevap: `Hayır. Baskı Hesap yalnızca satın alınabilir, stokta olan teklifleri en ucuz olarak sıralar; "Tükendi" veya "Gelince Haber Ver" durumundaki mağazalar fiyattan düşürülür.`,
    });
  }

  if (etkinDil !== 'tr') {
    // 3. soru sssSablonlari tarafından eklendi.
  } else if (gecmis30 && guncelFiyat > 0) {
    const kiyasCumlesi = guncelFiyat <= (gecmis90?.min ?? gecmis30.min) + 0.01
      ? 'Mevcut teklif takip edilen dönemin en düşük taban seviyesindedir.'
      : (guncelFiyat < gecmis30.ort
        ? `Güncel ${fiyatMetni(guncelFiyat)} fiyatı son 30 gün ortalamasının altındadır.`
        : `Güncel ${fiyatMetni(guncelFiyat)} fiyatı son 30 gün ortalamasına yakın seyretmektedir.`);
    sssListesi.push({
      soru: `${urun.ad} son 30 günde en düşük ne kadar oldu?`,
      cevap: `Son 30 günde kaydedilen en düşük fiyat ${fiyatMetni(gecmis30.min)}, 30 günlük ortalama ${fiyatMetni(gecmis30.ort)}${gecmis90 ? ` ve 90 gün tabanı ${fiyatMetni(gecmis90.min)}` : ''} seviyesindedir. ${kiyasCumlesi}`,
    });
  } else if (urun.birimMetni) {
    sssListesi.push({
      soru: `${urun.ad} birim fiyatı ne kadar ve parça maliyeti nasıl hesaplanır?`,
      cevap: `En ucuz stoklu teklife göre birim fiyat ${urun.birimMetni} seviyesindedir. Baskı gramajı, elektrik ve fire oranını ekleyerek parça başı maliyet çıkarmak için Maliyet Hesaplayıcı (/maliyet.html) sayfasını kullanabilirsiniz.`,
    });
  } else {
    sssListesi.push({
      soru: `Baskı Hesap mağaza fiyatlarını nasıl hesaplıyor?`,
      cevap: `Her mağazanın satış fiyatına varsa sepette herkesin alabildiği indirimler ve mağazanın kargo ücreti ya da ücretsiz kargo eşiği eklenerek gerçekte ödeyeceğiniz tutar hesaplanır.`,
    });
  }

  if (gecmis30 && urun.birimMetni) {
    sssListesi.push({
      soru: `${urun.ad} kilogram/litre birim fiyatı ne kadar?`,
      cevap: `Mevcut en ucuz teklife göre birim fiyat ${urun.birimMetni} düzeyindedir. Modelinizin gramajını girerek toplam baskı maliyetini /maliyet.html üzerinden hesaplayabilirsiniz.`,
    });
  }

  const kutularHtml = kutular.length
    ? `<div class="seo-piyasa-izgara">${kutular.map(k => `
        <div class="seo-piyasa-kutu">
          <div class="seo-piyasa-etiket">${htmlKacis(k.etiket)}</div>
          <div class="seo-piyasa-deger">${htmlKacis(k.deger)}</div>
        </div>`).join('')}
      </div>`
    : '';

  const analizHtml = `<section class="seo-kart">
    <h2 style="margin-top:0">📈 ${htmlKacis(t(etkinDil, 'baslik.piyasaAnalizi'))}</h2>
    ${kutularHtml}
    ${etkinDil === 'tr' ? `<p class="seo-piyasa-metin">${cumleler.map(c => htmlKacis(c)).join(' ')}</p>` : ''}
    <div class="seo-ic-linkler">
      ${icLinkler.map(l => `<a class="seo-ic-link" href="${htmlKacis(l.yol)}">${htmlKacis(l.metin)}</a>`).join('')}
    </div>
  </section>`;

  const sssHtml = `<section class="seo-kart">
    <h2 style="margin-top:0">❓ ${htmlKacis(t(etkinDil, 'baslik.sssBaslik', { ad: urun.ad }))}</h2>
    <div class="seo-sss">
      ${sssListesi.map((s, idx) => `<details${idx === 0 ? ' open' : ''}>
        <summary>${htmlKacis(s.soru)}</summary>
        <p>${htmlKacis(s.cevap)}</p>
      </details>`).join('')}
    </div>
  </section>`;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${tabanUrl}${urun.yol}`,
    mainEntity: sssListesi.map(s => ({
      '@type': 'Question',
      name: s.soru,
      acceptedAnswer: { '@type': 'Answer', text: s.cevap },
    })),
  };

  const rehberKartlarHtml = ilgiliRehberler.length
    ? `<section class="seo-kart">
        <h2 style="margin-top:0">📖 İlgili Karşılaştırma ve Alım Rehberleri</h2>
        <div class="rehber-izgara">
          ${ilgiliRehberler.map(r => `
            <a class="rehber-kart" href="${htmlKacis(r.yol)}">
              <div class="rehber-kart-ust">
                <span class="rehber-ikon" aria-hidden="true">${r.ikon}</span>
                <span class="rehber-rozet">${htmlKacis(r.rozet)}</span>
              </div>
              <h3 class="rehber-baslik">${htmlKacis(r.etiket)}</h3>
              <p class="rehber-ozet">${htmlKacis(r.aciklama)}</p>
              <span class="rehber-cta">Rehberi İncele →</span>
            </a>`).join('')}
        </div>
      </section>`
    : '';

  return { analizHtml, sssHtml, rehberKartlarHtml, faqSchema };
}

function cokRenkliUrunBolumuHtml(urun, kat, dil) {
  const yaziciMi = kat?.slug === '3d-yazici' || urun?.kategori === 'yazici' || urun?.kategoriSlug === '3d-yazici';
  if (!yaziciMi) return '';
  const ad = `${urun?.ad || ''} ${urun?.sorgu || ''}`;
  if (!/\b(combo|ams|cfs|ace\s*pro|multi[-\s]?color|multicouleur|palette|chroma|mmu)\b|マルチカラー|多色/i.test(ad)) {
    return '';
  }
  const aiLink = aiModelPartnerLinkleri();
  const hi3dRel = aiLink.hi3dAfiliye ? 'noopener sponsored nofollow' : 'noopener';
  const hi3dPromo = aiLink.hi3dPromo ? ` · 🎁 ${htmlKacis(aiLink.hi3dPromo)}` : '';
  const nav = navYollariGetir(dil);
  const plaKatYol = kategoriYoluGetir('pla-filament', dil);
  const canliCokRenkAraYol = dil === 'tr'
    ? '/?url=' + encodeURIComponent('eSUN PLA+')
    : `/${dil}?url=` + encodeURIComponent('eSUN PLA+');
  const maliyetYol = dil === 'tr' ? '/maliyet.html' : (dil === 'fr' ? '/fr/calculateur-cout' : `/${dil}/cost-calculator`);
  const rehberYol = {
    tr: '/rehber/meshy-vs-hi3d-3d-baski-maliyeti',
    en: '/en/guides/meshy-vs-hi3d-3d-printing-cost',
    fr: '/fr/guides/meshy-vs-hi3d-cout-impression-3d',
    ja: '/ja/guides/meshy-vs-hi3d-3d-printing-cost',
  }[dil] || '/en/guides/meshy-vs-hi3d-3d-printing-cost';

  const kopya = {
    tr: {
      baslik: '🎨 Çok Renkli Baskı İpucu: Model Bölmeden Üretim &amp; 3–4 Makara Planı',
      metin: `${htmlKacis(urun.ad)} gibi çok renkli yazıcılarda en büyük soru "Modeli elle boyayıp bölmeden nasıl çok renkli basarım?"dır. <b>Hi3D</b>, model bölmeden fiziksel ürünler için çok renkli baskıya hazır 3D çıktılar üretmeyi hedefler; dilimleyicide renk geçişi (purge) için parça gramajına +%15–25 ek filament planlayın.`,
      ctaHi3d: '🎨 Hi3D Çok Renkli Yaklaşımını Gör ↗',
      ctaSepet: '🧺 3–4 Renk Makarayı Kargosuz Sepetle →',
      ctaPla: '🧵 En Ucuz PLA Filamentleri Gör →',
      ctaRehber: '🧮 Çok Renkli Maliyet &amp; Purge Rehberi →',
    },
    en: {
      baslik: '🎨 Multi-Color Printing Tip: No-Split Models &amp; 3–4 Spool Planning',
      metin: `Buyers looking at ${htmlKacis(urun.ad)} often wonder how to prep multi-color prints without manually splitting meshes. <b>Hi3D</b> focuses on multi-color 3D models ready for physical printing without manual splitting — plan +15–25% filament overhead for AMS/Combo color-swap purge towers.`,
      ctaHi3d: '🎨 Explore Hi3D Multi-Color Workflow ↗',
      ctaSepet: '🧺 Bundle 3–4 Colors in Smart Basket →',
      ctaPla: '🧵 Compare Cheapest PLA Spools →',
      ctaRehber: '🧮 Multi-Color Print Cost Guide →',
    },
    fr: {
      baslik: '🎨 Conseil Impression Multicouleur : Modèles sans découpe &amp; 3–4 Bobines',
      metin: `Avec une imprimante multicouleur comme ${htmlKacis(urun.ad)}, <b>Hi3D</b> permet de générer des modèles 3D prêts pour l’impression physique sans découpe manuelle des pièces — prévoyez +15 à 25 % de filament pour les purges de couleur.`,
      ctaHi3d: '🎨 Découvrir Hi3D Multicouleur ↗',
      ctaSepet: '🧺 Optimiser 3–4 Couleurs au Panier →',
      ctaPla: '🧵 Voir les PLA les moins chers →',
      ctaRehber: '🧮 Guide Coût &amp; Purge Multicouleur →',
    },
    ja: {
      baslik: '🎨 多色プリントのコツ：モデル分割不要＆3〜4スプール計画',
      metin: `${htmlKacis(urun.ad)} のようなマルチカラー機では「手動でパーツ分割せずに多色モデルを用意する方法」が鍵になります。<b>Hi3D</b> はモデル分割不要で物理プリント向けの多色3Dモデル作成に対応。色替えパージ用に +15〜25% のフィラメント余剰を見積もりましょう。`,
      ctaHi3d: '🎨 Hi3D 多色プリント向け機能を見る ↗',
      ctaSepet: '🧺 3〜4色をスマートカートでまとめ買い →',
      ctaPla: '🧵 最安PLAフィラメントを比較 →',
      ctaRehber: '🧮 多色プリント原価・パージガイド →',
    },
  }[dil] || {};

  return `<section class="seo-kart" id="cokRenkliHi3dKart">
    <h2 style="margin-top:0">${kopya.baslik}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:var(--gri-metin);line-height:1.55">${kopya.metin}</p>
    <div class="seo-butonlar">
      <a class="seo-cta" href="${htmlKacis(plaKatYol)}">${kopya.ctaPla}</a>
      <a class="seo-cta ikincil" href="${htmlKacis(canliCokRenkAraYol)}">🌈 ${dil === 'tr' ? 'Çok Renkli PLA+ Ara' : (dil === 'fr' ? 'Comparer PLA+ Couleurs' : (dil === 'ja' ? '多色向けPLA+比較' : 'Search PLA+ Colors'))} →</a>
      <a class="seo-cta ikincil" href="${htmlKacis(nav.sepet)}">${kopya.ctaSepet}</a>
      <a class="seo-cta ikincil" href="${htmlKacis(rehberYol)}">${kopya.ctaRehber}</a>
      <a class="seo-cta ikincil" href="${htmlKacis(maliyetYol)}">🧮 ${dil === 'tr' ? 'Hesapla' : (dil === 'fr' ? 'Calculateur' : (dil === 'ja' ? '原価試算' : 'Cost Calculator'))} →</a>
      <a class="seo-cta ikincil" href="${htmlKacis(aiLink.hi3dUrl)}" target="_blank" rel="${hi3dRel}" data-afiliye-site="hi3d">${kopya.ctaHi3d}${hi3dPromo}</a>
    </div>
  </section>`;
}

export function urunSayfasiHtml(urun, tabanUrl, tumUrunler = [], opts = {}) {
  const dil = normalizeDil(opts.dil || urun.dil || dilByMarket(urun.market || 'tr'));
  const sz = sozlukGetir(dil);
  const kat = SEO_KATEGORILER.find(c => c.slug === urun.kategoriSlug) || SEO_KATEGORILER[0];
  const paraBirimi = paraBirimiNormalize(urun.paraBirimi || urun.currency || sz.para.kod);
  const fiyatMetni = (v) => urunFiyatMetni(v, paraBirimi);
  const canliTaraUrl = `/?url=${encodeURIComponent(urun.sorgu || urun.ad)}`;
  const enUcuzEk = urun.enUcuzFiyat > 0 ? ` (${fiyatMetni(urun.enUcuzFiyat)})` : '';
  const title = `${urun.ad} ${sz.baslik.enUcuzBaslikEk}${enUcuzEk} — ${sz.meta.siteAdi}`;
  const description = urun.enUcuzFiyat > 0
    ? (dil === 'tr'
      ? `${urun.ad} kargo dahil en ucuz ${fiyatMetni(urun.enUcuzFiyat)} (${urun.enUcuzSite || 'mağaza'}). ${urun.stokluSayisi || 1} mağazada stoklu teklifleri karşılaştır.`
      : `${urun.ad} — ${fiyatMetni(urun.enUcuzFiyat)} (${urun.enUcuzSite || sz.baslik.magazaEtiketi}) · ${urun.stokluSayisi || 1} ${sz.baslik.stokluTeklif}.`)
    : sz.baslik.canliAciklamaYok;

  const kargoEtiketCevir = (k) => {
    if (!k || k === 'Kargo sepette') return sz.durum.kargoSepette;
    if (k === 'Ücretsiz Kargo') return sz.durum.ucretsizKargo;
    return k;
  };

  const tabloSatirlari = urun.teklifler.map((tkr, idx) => `
    <tr>
      <td><b>${htmlKacis(tkr.site)}</b>${idx === 0 && tkr.stokta ? ' 🏷️' : ''}</td>
      <td>${htmlKacis(String(tkr.baslik || urun.ad).slice(0, 85))}</td>
      <td>${htmlKacis(kargoEtiketCevir(tkr.kargo))}</td>
      <td>${tkr.stokta ? `🟢 ${htmlKacis(sz.durum.stokta)}` : `🔴 ${htmlKacis(sz.durum.tukendi)}`}</td>
      <td><b>${urunFiyatMetni(tkr.fiyat, tkr.paraBirimi || paraBirimi)}</b></td>
      <td>${tkr.url ? `<a href="${htmlKacis(tkr.url)}" target="_blank" rel="noopener sponsored nofollow">${htmlKacis(sz.buton.magazayaGit)}</a>` : '—'}</td>
    </tr>`).join('');

  const benzerler = tumUrunler
    .filter(x => x.id !== urun.id && x.kategoriSlug === urun.kategoriSlug)
    .slice(0, 6);

  const nav = navYollariGetir(dil);
  const katYol = kategoriYoluGetir(kat.slug, dil);
  const katAdYerel = dil !== 'tr'
    ? (GLOBAL_KAT_CEVIRI[dil]?.kategoriler?.[kat.slug]?.ad || kat.ad)
    : kat.ad;
  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: sz.nav.anaSayfa, item: `${tabanUrl}${nav.ana}` },
        { '@type': 'ListItem', position: 2, name: katAdYerel, item: `${tabanUrl}${katYol}` },
        { '@type': 'ListItem', position: 3, name: urun.ad, item: `${tabanUrl}${urun.yol}` },
      ],
    },
  ];

  if (urun.enUcuzFiyat > 0) {
    const gecerlilikTarihi = new Date((urun.sonTs || Date.now()) + 7 * 86400000).toISOString().slice(0, 10);
    const stokluTeklifler = (urun.teklifler || []).filter(t => t.stokta && Number(t.fiyat) > 0);
    const altTeklifler = stokluTeklifler.slice(0, 12).map(t => ({
      '@type': 'Offer',
      priceCurrency: paraBirimiNormalize(t.paraBirimi || paraBirimi),
      price: Number(t.fiyat).toFixed(paraBirimi === 'JPY' ? 0 : 2),
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
        priceCurrency: paraBirimi,
        lowPrice: Number(urun.enUcuzFiyat).toFixed(paraBirimi === 'JPY' ? 0 : 2),
        ...(urun.enPahaliFiyat > 0 ? { highPrice: Number(urun.enPahaliFiyat).toFixed(paraBirimi === 'JPY' ? 0 : 2) } : {}),
        offerCount: Math.max(1, urun.stokluSayisi || stokluTeklifler.length),
        availability: 'https://schema.org/InStock',
        url: `${tabanUrl}${urun.yol}`,
        ...(altTeklifler.length ? { offers: altTeklifler } : {}),
      },
    };
    jsonLdList.push(productSchema);
  }

  const { analizHtml, sssHtml, rehberKartlarHtml, faqSchema } = piyasaOzetiVeSssOlustur(urun, kat, tabanUrl, dil);
  jsonLdList.push(faqSchema);
  const cokRenkliHtml = cokRenkliUrunBolumuHtml(urun, kat, dil);
  const globalCreality = crealityResmiMagazaLink(urun);

  const ozetHtml = urun.enUcuzFiyat > 0
    ? `<div class="seo-fiyat-kutu">
         <div>
           <div style="font-size:12px;font-weight:700;color:var(--gri-metin)">${htmlKacis(sz.baslik.enUcuzTeklifEtiketi)}</div>
           <div class="seo-fiyat-ana">${fiyatMetni(urun.enUcuzFiyat)}</div>
         </div>
         <div style="font-size:14px">
           <div><b>${htmlKacis(sz.baslik.magazaEtiketi)}:</b> ${htmlKacis(urun.enUcuzSite || '—')}</div>
           <div><b>${htmlKacis(sz.baslik.stokluTeklif)}:</b> ${urun.stokluSayisi || 1}${urun.birimMetni ? ` · <b>${htmlKacis(sz.baslik.birimEtiketi)}:</b> ${htmlKacis(urun.birimMetni)}` : ''}</div>
           <div style="color:var(--gri-metin);font-size:12px">${htmlKacis(sz.baslik.sonKontrol)}: ${htmlKacis(urun.lastmod)}</div>
         </div>
       </div>`
    : `<div class="seo-fiyat-kutu">
         <div>${htmlKacis(sz.baslik.onbellekYok)}</div>
       </div>`;

  const govdeHtml = `
    <nav class="seo-yol" aria-label="Breadcrumb">
      <a href="${htmlKacis(nav.ana)}">${htmlKacis(sz.nav.anaSayfa)}</a> › <a href="${htmlKacis(katYol)}">${htmlKacis(katAdYerel)}</a> › <span>${htmlKacis(urun.ad)}</span>
    </nav>

    <section class="seo-kart">
      <div class="${urun.gorsel ? 'seo-ust' : ''}">
        ${urun.gorsel ? `<img class="seo-gorsel" src="${htmlKacis(urun.gorsel)}" alt="${htmlKacis(urun.ad)}" loading="lazy" />` : ''}
        <div>
          <h1 class="seo-baslik">${htmlKacis(urun.ad)} ${htmlKacis(sz.baslik.fiyatlarEk)}</h1>
          <p class="seo-alt">${htmlKacis(description)}</p>
        </div>
      </div>
      ${ozetHtml}
      <div class="seo-butonlar">
        <a class="seo-cta" href="${htmlKacis(canliTaraUrl)}">⚡ ${htmlKacis(sz.buton.canliTara)}</a>
        ${urun.enUcuzUrl ? `<a class="seo-cta ikincil" href="${htmlKacis(urun.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">${htmlKacis(t(dil, 'buton.enUcuzMagaza', { site: urun.enUcuzSite || '' }))}</a>` : ''}
        ${globalCreality ? `<a class="seo-cta ikincil" href="${htmlKacis(globalCreality.url)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="creality">🌍 ${htmlKacis(sz.baslik.globalCrealityBaslik)} ↗</a>` : ''}
      </div>
    </section>

    <section class="seo-kart">
      <h2 style="margin-top:0">${htmlKacis(sz.baslik.fiyatTablosu)}</h2>
      ${urun.teklifler.length
        ? `<div style="overflow-x:auto"><table class="seo-tablo">
            <thead><tr><th>${htmlKacis(sz.tablo.magaza)}</th><th>${htmlKacis(sz.tablo.urunBasligi)}</th><th>${htmlKacis(sz.tablo.kargo)}</th><th>${htmlKacis(sz.tablo.stok)}</th><th>${htmlKacis(sz.tablo.fiyat)}</th><th>${htmlKacis(sz.tablo.islem)}</th></tr></thead>
            <tbody>${tabloSatirlari}</tbody>
          </table></div>`
        : `<p>${htmlKacis(sz.baslik.yetersizFiyat)}</p>`}
    </section>

    ${analizHtml}

    ${cokRenkliHtml}

    ${sssHtml}

    ${rehberKartlarHtml}

    ${benzerler.length ? `<section class="seo-kart">
      <h2 style="margin-top:0">${htmlKacis(sz.baslik.benzerUrunler)}</h2>
      <div class="seo-izgara">
        ${benzerler.map(b => seoUrunKartiHtml(b)).join('')}
      </div>
    </section>` : ''}
  `;

  const extraMeta = urun.enUcuzFiyat > 0
    ? `<meta property="product:price:amount" content="${Number(urun.enUcuzFiyat).toFixed(paraBirimi === 'JPY' ? 0 : 2)}" />\n  <meta property="product:price:currency" content="${htmlKacis(paraBirimi)}" />`
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
    dil,
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
        <span class="hero-rozet">Kargo Dahil Kategori Vitrini</span>
        <h1>${htmlKacis(kat.ad)}</h1>
        <p>${htmlKacis(kat.aciklama)}</p>
        <div class="hero-istatistik">
          <span><b>${eslesen.length}</b> ürün</span>
          ${enUcuzUrun ? `<span>En düşük: <b>${formatTL(enUcuzUrun.enUcuzFiyat)}</b></span>` : ''}
          <span>Kargo dahil gerçek toplam</span>
        </div>
      </div>
    </section>
    <div class="katalog-kontrol">
      <div class="seo-kat-bar" style="margin:0">${katBar}</div>
      <div class="katalog-ara-sar">
        <span class="katalog-ara-ikon" aria-hidden="true"><svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
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
    dilYolHaritasi: {
      tr: kategoriYoluGetir(kat.slug, 'tr'),
      en: kategoriYoluGetir(kat.slug, 'en'),
      fr: kategoriYoluGetir(kat.slug, 'fr'),
      ja: kategoriYoluGetir(kat.slug, 'ja'),
    },
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
    dilYolHaritasi: GLOBAL_KATALOG_YOLLARI,
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
          <span class="hero-rozet">60+ Türkiye Mağazası · Canlı Katalog</span>
          <h1>3D Yazıcı &amp; Filament <b>Fiyat Kataloğu</b></h1>
          <p>${htmlKacis(description)}</p>
          <div class="hero-istatistik">
            <span><b>${tumUrunler.length}</b> takip edilen ürün</span>
            <span><b>${stokluSayi}</b> güncel stoklu fiyat</span>
            <span>Birim ₺/kg &amp; kargo dahil</span>
          </div>
        </div>
      </section>
      <div class="katalog-kontrol">
        <div class="seo-kat-bar" style="margin:0">${katBar}</div>
        <div class="katalog-ara-sar">
          <span class="katalog-ara-ikon" aria-hidden="true"><svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
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
          <a href="/rehber">Karşılaştırma &amp; Alım Rehberleri</a>
          <a href="/rehber/en-ucuz-pla-filament">En Ucuz PLA Sıralaması</a>
          <a href="/karsilastir/bambu-lab-p1s-vs-creality-k1c">P1S vs K1C</a>
          <a href="/maliyet.html">Baskı Maliyet Hesaplayıcı</a>
          <a href="/sepet.html">Akıllı Sepet Sihirbazı</a>
        </div>
      </section>
      ${katalogFiltreScriptHtml()}
    `,
  });
}

const GLOBAL_KAT_CEVIRI = Object.freeze({
  en: {
    title: '3D Printer, Filament & Resin Catalog — Cheapest US Prices | Baski Hesap',
    desc: 'Live US store catalog tracking 3D printers, PLA/PETG/TPU filaments, UV resins, and spare parts with checkout shipping & $/kg unit prices.',
    yolAna: 'Home',
    yolKatalog: 'Product Catalog',
    heroRozet: 'US &amp; Global Stores · Live Catalog',
    heroH1: '3D Printer &amp; Filament <b>Price Catalog</b>',
    istTakip: 'tracked products',
    istStok: 'live in-stock prices',
    istBirim: 'Unit $/kg &amp; incl. shipping',
    araPlaceholder: 'Quick filter catalog (e.g. Bambu, PLA, PETG, Prusa)…',
    urunKelime: 'products',
    tumunuGor: 'View all →',
    rehberBaslik: 'Buying Guides &amp; Print Tools',
    rehberAlt: 'Compare printer specs, calculate STL cost in USD, or optimize multi-store baskets:',
    tumRehber: 'All Guides →',
    enDusukEtiket: 'Lowest:',
    kargoDahilEtiket: 'Shipping-inclusive total',
    kategoriler: {
      '3d-yazici': { kisaAd: '3D Printers', ad: '3D Printer Prices (FDM & SLA)', aciklama: 'Compare Bambu Lab, Creality, Elegoo, Prusa, Flashforge, Snapmaker, and QIDI 3D printers across verified US stores.' },
      'pla-filament': { kisaAd: 'PLA Filament', ad: 'PLA, PLA+ & Hyper PLA Filaments', aciklama: '1 kg & bulk PLA spools sorted by $/kg normalized unit price from eSun, SUNLU, Polymaker, Overture, and Bambu Lab.' },
      'petg-tpu-filament': { kisaAd: 'PETG / TPU / ABS', ad: 'PETG, TPU, ABS & Engineering Filaments', aciklama: 'Heat-resistant PETG, flexible TPU 95A, ABS/ASA, and carbon-fiber spools compared with checkout shipping.' },
      'filament': { kisaAd: 'All Filaments', ad: 'All 3D Filament Prices', aciklama: 'Compare in-stock PLA, PETG, TPU, ABS, and High-Speed filaments normalized by $/kg across verified US stores.' },
      '3d-yazici-yedek-parca': { kisaAd: 'Spare Parts', ad: '3D Printer Nozzles, Hotends & Parts', aciklama: 'Hardened steel nozzles, ceramic hotends, PEI build plates, extruders, and AMS accessories.' },
      'recine-ve-sarf': { kisaAd: 'Resin & Dryers', ad: 'UV Resins & Filament Dryers', aciklama: 'Standard, water-washable, ABS-like photopolymer resins and multi-spool filament dryers.' },
    },
  },
  fr: {
    title: 'Catalogue Imprimantes 3D, Filaments & Résines — Meilleurs Prix EUR | Baski Hesap',
    desc: 'Catalogue européen de comparaison en direct pour imprimantes 3D, filaments PLA/PETG/TPU, résines UV et pièces détachées port compris en EUR (€).',
    yolAna: 'Accueil',
    yolKatalog: 'Catalogue Produits',
    heroRozet: 'Boutiques FR &amp; EU · Catalogue Live',
    heroH1: 'Catalogue Prix <b>Imprimantes 3D &amp; Filaments</b>',
    istTakip: 'produits suivis',
    istStok: 'prix en stock',
    istBirim: 'Prix au €/kg &amp; livraison incluse',
    araPlaceholder: 'Filtrer le catalogue (ex. Bambu, PLA, Prusa, Elegoo)…',
    urunKelime: 'produits',
    tumunuGor: 'Tout voir →',
    rehberBaslik: 'Guides d’Achat &amp; Outils 3D',
    rehberAlt: 'Comparez les modèles, calculez vos coûts en euros ou optimisez les frais de port :',
    tumRehber: 'Tous les guides →',
    enDusukEtiket: 'Dès :',
    kargoDahilEtiket: 'Total livraison incluse',
    kategoriler: {
      '3d-yazici': { kisaAd: 'Imprimantes 3D', ad: 'Prix Imprimantes 3D (FDM & SLA)', aciklama: 'Comparez Bambu Lab, Creality, Elegoo, Prusa, Flashforge, Snapmaker et QIDI sur les boutiques françaises et européennes.' },
      'pla-filament': { kisaAd: 'Filament PLA', ad: 'Filaments PLA, PLA+ & Hyper PLA', aciklama: 'Bobines PLA 1 kg comparées au meilleur €/kg chez SUNLU, Overture, Bambu Lab, Elegoo et Amazon.fr.' },
      'petg-tpu-filament': { kisaAd: 'PETG / TPU / ABS', ad: 'Filaments PETG, TPU, ABS & Techniques', aciklama: 'Filaments résistants à la chaleur, flexibles TPU 95A et composites carbone port compris.' },
      'filament': { kisaAd: 'Tous les filaments', ad: 'Tous les prix Filaments 3D', aciklama: 'Comparez les bobines PLA, PETG, TPU, ABS et Haute Vitesse en stock au meilleur prix €/kg en Europe.' },
      '3d-yazici-yedek-parca': { kisaAd: 'Pièces Détachées', ad: 'Buses, Hotends & Plateaux PEI', aciklama: 'Buses en acier trempé, corps de chauffe céramique, plateaux texturés PEI et pièces de rechange.' },
      'recine-ve-sarf': { kisaAd: 'Résines & Séchoirs', ad: 'Résines UV & Sécheurs de Filament', aciklama: 'Résines photopolymères 405nm (standard, lavable à l’eau, ABS-like) et séchoirs à bobines.' },
    },
  },
  ja: {
    title: '3Dプリンター・フィラメント・レジンカタログ — 最安円価格 | Baski Hesap',
    desc: '日本市場の公式ストア・取扱店を対象に、3Dプリンター本体、PLA/PETG/TPUフィラメント、UVレジン、交換パーツを送料込み実勢価格で比較。',
    yolAna: 'ホーム',
    yolKatalog: '製品カタログ',
    heroRozet: '日本向けストア対応 · リアルタイムカタログ',
    heroH1: '3Dプリンター・フィラメント<b>価格カタログ</b>',
    istTakip: '件の登録製品',
    istStok: '件の在庫あり価格',
    istBirim: 'kg単価 (¥/kg)＆送料込',
    araPlaceholder: 'カタログ内を絞り込み（例: Bambu, PLA, Prusa, QIDI）…',
    urunKelime: '製品',
    tumunuGor: 'すべて見る →',
    rehberBaslik: '比較ガイド＆3Dプリントツール',
    rehberAlt: '機種比較、STL原価計算（¥）、複数ショップのまとめ買い送料最適化ツール：',
    tumRehber: 'ガイド一覧 →',
    enDusukEtiket: '最安値:',
    kargoDahilEtiket: '送料込み合計価格',
    kategoriler: {
      '3d-yazici': { kisaAd: '3Dプリンター', ad: '3Dプリンター実勢価格 (FDM / 光造形)', aciklama: 'Bambu Lab・Creality・Prusa・QIDI・Elegooなどの日本公式サイト・EC価格を一括比較。' },
      'pla-filament': { kisaAd: 'PLAフィラメント', ad: 'PLA・PLA+・高速PLAフィラメント', aciklama: 'eSun・SUNLU・Bambu Lab・Crealityなど人気PLAスプールをkg単価 (¥/kg) で比較。' },
      'petg-tpu-filament': { kisaAd: 'PETG / TPU / ABS', ad: 'PETG・TPU・ABS・高機能フィラメント', aciklama: '耐熱PETG、軟質TPU、ABS/ASA、カーボン配合フィラメントの送料込み価格比較。' },
      'filament': { kisaAd: '全フィラメント', ad: '3Dフィラメント全種価格一覧', aciklama: 'PLA・PETG・TPU・ABS・高速フィラメントの在庫あり価格をkg単価 (¥/kg) で一括比較。' },
      '3d-yazici-yedek-parca': { kisaAd: '交換パーツ', ad: 'ノズル・ホットエンド・ビルドプレート', aciklama: '焼入れスチールノズル、セラミックホットエンド、PEIプレート、押出機パーツ。' },
      'recine-ve-sarf': { kisaAd: 'レジン・乾燥機', ad: 'UVレジン＆フィラメント乾燥機', aciklama: '光造形用UVレジン（水洗い・ABSライク・タフ）と防湿・乾燥ボックス。' },
    },
  },
});

const GLOBAL_KESIF_URUNLERI = Object.freeze([
  { ad: 'Bambu Lab P1S 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'Bambu Lab P1S' },
  { ad: 'Bambu Lab A1 Mini 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'Bambu Lab A1 Mini' },
  { ad: 'Creality K1C 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'Creality K1C' },
  { ad: 'Prusa MK4S 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'Prusa MK4S' },
  { ad: 'Elegoo Neptune 4 Pro 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'Elegoo Neptune 4 Pro' },
  { ad: 'QIDI Q1 Pro 3D Printer', kategoriSlug: '3d-yazici', sorgu: 'QIDI Q1 Pro' },
  { ad: 'eSun PLA+ Filament 1kg', kategoriSlug: 'pla-filament', sorgu: 'eSun PLA+ 1kg' },
  { ad: 'SUNLU PLA+ Filament 1kg', kategoriSlug: 'pla-filament', sorgu: 'SUNLU PLA+ 1kg' },
  { ad: 'Overture PLA Filament 1kg', kategoriSlug: 'pla-filament', sorgu: 'Overture PLA 1kg' },
  { ad: 'Creality Hyper PLA 1kg', kategoriSlug: 'pla-filament', sorgu: 'Creality Hyper PLA 1kg' },
  { ad: 'Polymaker PolyTerra PLA 1kg', kategoriSlug: 'pla-filament', sorgu: 'Polymaker PolyTerra PLA 1kg' },
  { ad: 'eSun PETG Filament 1kg', kategoriSlug: 'petg-tpu-filament', sorgu: 'eSun PETG 1kg' },
  { ad: 'Overture PETG Filament 1kg', kategoriSlug: 'petg-tpu-filament', sorgu: 'Overture PETG 1kg' },
  { ad: 'eSun TPU 95A Flexible 1kg', kategoriSlug: 'petg-tpu-filament', sorgu: 'eSun TPU 95A 1kg' },
  { ad: 'Bambu Lab Hardened Steel Nozzle 0.4mm', kategoriSlug: '3d-yazici-yedek-parca', sorgu: 'Bambu Lab Hardened Steel Nozzle' },
  { ad: 'Creality K1 Ceramic Heating Block', kategoriSlug: '3d-yazici-yedek-parca', sorgu: 'Creality K1 Ceramic Hotend' },
  { ad: 'Elegoo Standard UV Resin 1kg', kategoriSlug: 'recine-ve-sarf', sorgu: 'Elegoo UV Resin 1kg' },
  { ad: 'SUNLU FilaDryer S2 Filament Dryer', kategoriSlug: 'recine-ve-sarf', sorgu: 'SUNLU FilaDryer S2' },
]);

function globalKesifUrunleriOlustur(dil = 'en') {
  const kod = normalizeDil(dil);
  const para = DIL_META[kod]?.currency || 'USD';
  return GLOBAL_KESIF_URUNLERI.map((u) => ({
    id: `kesif-${slugYap(u.sorgu)}`,
    ad: u.ad,
    sorgu: u.sorgu,
    kategoriSlug: u.kategoriSlug,
    yol: `/${kod}?url=${encodeURIComponent(u.sorgu)}`,
    enUcuzFiyat: null,
    enUcuzSite: null,
    stokluSayisi: 0,
    paraBirimi: para,
  }));
}

export function globalKatalogDiziniHtml(dil = 'en', tumUrunler = [], tabanUrl = '') {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const tKat = GLOBAL_KAT_CEVIRI[kod];
  const nav = navYollariGetir(kod);
  const canonicalUrl = `${tabanUrl}${GLOBAL_KATALOG_YOLLARI[kod]}`;
  const gosterimUrunleri = Array.isArray(tumUrunler) && tumUrunler.length
    ? tumUrunler
    : globalKesifUrunleriOlustur(kod);
  const stokluSayi = (tumUrunler || []).filter(u => u.enUcuzFiyat > 0).length;

  const katBar = SEO_KATEGORILER.map(c => {
    const adet = gosterimUrunleri.filter(c.eslesirMi).length;
    if (!adet) return '';
    const kc = tKat.kategoriler[c.slug] || {};
    return `<a class="seo-kat-hap" href="#kat-${htmlKacis(c.slug)}">${kategoriIkonu(c.slug)} ${htmlKacis(kc.kisaAd || c.kisaAd)} (${adet})</a>`;
  }).join('');

  const bolumler = SEO_KATEGORILER.map(kat => {
    const urunler = gosterimUrunleri.filter(kat.eslesirMi);
    if (!urunler.length) return '';
    const kc = tKat.kategoriler[kat.slug] || {};
    return `<section class="seo-kart katalog-bolum" id="kat-${htmlKacis(kat.slug)}">
      <div class="kat-baslik-ust">
        <div class="kat-baslik-sol">
          <span class="kat-ikon" aria-hidden="true">${kategoriIkonu(kat.slug)}</span>
          <div>
            <h2 style="margin:0 0 2px">${htmlKacis(kc.ad || kat.ad)}</h2>
            <div style="font-size:13px;color:var(--gri-metin)">${htmlKacis(kc.aciklama || kat.aciklama)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="kat-sayac">${urunler.length} ${htmlKacis(tKat.urunKelime)}</span>
          <a class="seo-cta ikincil" style="padding:7px 13px;font-size:12.5px" href="${htmlKacis(kategoriYoluGetir(kat.slug, kod))}">${htmlKacis(tKat.tumunuGor)}</a>
        </div>
      </div>
      <div class="seo-izgara">
        ${urunler.map((u, idx) => seoUrunKartiHtml(u, idx >= 16, kod)).join('')}
      </div>
    </section>`;
  }).join('');

  return sayfaIskeleti({
    title: tKat.title,
    description: tKat.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    dil: kod,
    dilYolHaritasi: GLOBAL_KATALOG_YOLLARI,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: tKat.title,
      description: tKat.desc,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="${nav.ana}">${htmlKacis(tKat.yolAna)}</a> › <span>${htmlKacis(tKat.yolKatalog)}</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${tKat.heroRozet}</span>
          <h1>${tKat.heroH1}</h1>
          <p>${htmlKacis(tKat.desc)}</p>
          <div class="hero-istatistik">
            <span><b>${gosterimUrunleri.length}</b> ${htmlKacis(tKat.istTakip)}</span>
            <span><b>${stokluSayi}</b> ${htmlKacis(tKat.istStok)}</span>
            <span>${tKat.istBirim}</span>
          </div>
        </div>
      </section>
      <div class="katalog-kontrol">
        <div class="seo-kat-bar" style="margin:0">${katBar}</div>
        <div class="katalog-ara-sar">
          <span class="katalog-ara-ikon" aria-hidden="true"><svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
          <input type="search" id="katalogAraInput" placeholder="${htmlKacis(tKat.araPlaceholder)}" aria-label="${htmlKacis(tKat.araPlaceholder)}" />
        </div>
      </div>
      ${bolumler}
      <section class="seo-rehber-kart" aria-label="${htmlKacis(tKat.rehberBaslik)}">
        <div class="seo-rehber-ust">
          <div>
            <h2 class="bolum-baslik" style="margin:0 0 4px">${tKat.rehberBaslik}</h2>
            <p class="ipucu" style="margin:0">${htmlKacis(tKat.rehberAlt)}</p>
          </div>
          <a class="seo-tum-link" href="${nav.rehber}">${htmlKacis(tKat.tumRehber)}</a>
        </div>
        <div class="seo-rehber-baglar">
          <a href="${nav.rehber}">${htmlKacis(sozlukGetir(kod).nav.rehberler)}</a>
          <a href="${nav.maliyet}">${htmlKacis(sozlukGetir(kod).nav.maliyet)}</a>
          <a href="${nav.sepet}">${htmlKacis(sozlukGetir(kod).nav.akilliSepet)}</a>
          <a href="${nav.slicer}">${htmlKacis(sozlukGetir(kod).nav.eklenti)}</a>
        </div>
      </section>
      ${katalogFiltreScriptHtml()}
    `,
  });
}

export function globalKategoriSayfasiHtml(dil = 'en', kat, tumUrunler = [], tabanUrl = '') {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const tKat = GLOBAL_KAT_CEVIRI[kod];
  const nav = navYollariGetir(kod);
  const kc = tKat.kategoriler[kat.slug] || {};
  const havuz = Array.isArray(tumUrunler) && tumUrunler.length ? tumUrunler : globalKesifUrunleriOlustur(kod);
  const eslesen = havuz.filter(kat.eslesirMi);
  const stoklular = eslesen.filter(u => u.enUcuzFiyat > 0).sort((a, b) => a.enUcuzFiyat - b.enUcuzFiyat);
  const enUcuzUrun = stoklular[0] || null;
  const katAd = kc.ad || kat.ad;
  const katAciklama = kc.aciklama || kat.aciklama;
  const title = `${katAd} | Baski Hesap`;
  const canonicalUrl = `${tabanUrl}${kategoriYoluGetir(kat.slug, kod)}`;
  const dilYolHaritasi = {
    tr: kategoriYoluGetir(kat.slug, 'tr'),
    en: kategoriYoluGetir(kat.slug, 'en'),
    fr: kategoriYoluGetir(kat.slug, 'fr'),
    ja: kategoriYoluGetir(kat.slug, 'ja'),
  };

  const katBar = SEO_KATEGORILER.map(c => {
    const ck = tKat.kategoriler[c.slug] || {};
    return `<a class="seo-kat-hap ${c.slug === kat.slug ? 'etkin' : ''}" href="${htmlKacis(kategoriYoluGetir(c.slug, kod))}">${kategoriIkonu(c.slug)} ${htmlKacis(ck.kisaAd || c.kisaAd)}</a>`;
  }).join('');

  const kartlar = eslesen.map(u => seoUrunKartiHtml(u, false, kod)).join('');

  return sayfaIskeleti({
    title,
    description: katAciklama,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    dil: kod,
    dilYolHaritasi,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: katAd,
      description: katAciklama,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol">
        <a href="${nav.ana}">${htmlKacis(tKat.yolAna)}</a> › <a href="${nav.katalog}">${htmlKacis(tKat.yolKatalog)}</a> › <span>${htmlKacis(katAd)}</span>
      </nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${htmlKacis(kc.kisaAd || kat.kisaAd)}</span>
          <h1>${htmlKacis(katAd)}</h1>
          <p>${htmlKacis(katAciklama)}</p>
          <div class="hero-istatistik">
            <span><b>${eslesen.length}</b> ${htmlKacis(tKat.urunKelime)}</span>
            ${enUcuzUrun ? `<span>${htmlKacis(tKat.enDusukEtiket)} <b>${htmlKacis(dilParaFormati(kod, enUcuzUrun.enUcuzFiyat, enUcuzUrun.paraBirimi))}</b></span>` : ''}
            <span>${tKat.kargoDahilEtiket}</span>
          </div>
        </div>
      </section>
      <div class="katalog-kontrol">
        <div class="seo-kat-bar" style="margin:0">${katBar}</div>
        <div class="katalog-ara-sar">
          <span class="katalog-ara-ikon" aria-hidden="true"><svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
          <input type="search" id="katalogAraInput" placeholder="${htmlKacis(tKat.araPlaceholder)}" aria-label="${htmlKacis(tKat.araPlaceholder)}" />
        </div>
      </div>
      <section class="seo-kart katalog-bolum">
        <div class="seo-izgara">${kartlar}</div>
      </section>
      ${katalogFiltreScriptHtml()}
    `,
  });
}

const VITRIN_TOPTAN_RE = /\bmoq\s*:|pre-?sale|bundle\s+sale|\((?:eu|uk|ca|au|jp|us)\s+only\)/i;

function vitrinBaslikTemizle(ad) {
  return String(ad || '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function vitrinKargoYerellestir(kargoHam, dil, paraBirimi, yerel) {
  const s = String(kargoHam || '').trim();
  if (!s) return null;
  if (/ücretsiz\s*kargo|free\s*shipping|livraison\s*gratuite|送料無料/i.test(s)) {
    return dil === 'en' ? 'Free shipping' : (dil === 'fr' ? 'Livraison gratuite' : (dil === 'ja' ? '送料無料' : 'Ücretsiz Kargo'));
  }
  if (/kargo\s*sepette|sepette\s*belli|at\s*checkout|au\s*panier|カート/i.test(s)) {
    return dil === 'en' ? 'Shipping at checkout' : (dil === 'fr' ? 'Frais de port au panier' : (dil === 'ja' ? '送料はカートで確認' : 'Kargo sepette'));
  }
  if (dil === 'tr') return s;
  const tutarEs = /\+?\s*([0-9]+(?:[.,][0-9]+)?)/.exec(s);
  if (tutarEs && /kargo\s*dahil/i.test(s)) {
    const ucret = Number(String(tutarEs[1]).replace(',', '.'));
    if (Number.isFinite(ucret) && ucret > 0) {
      const p = formatPara(ucret, paraBirimi, yerel);
      return dil === 'en' ? `+${p} shipping` : (dil === 'fr' ? `+${p} livraison` : `+${p} 送料`);
    }
  }
  return null;
}

/** Bölgesel (EN/FR/JA) ana sayfa canlı borsa vitrini verisini üretir. */
export function globalVitrinVerisi({ limit = 12, market = 'us', rastgele } = {}) {
  const etkinMarket = normalizeMarket(market);
  const paraBirimi = PAZARLAR[etkinMarket]?.currency || 'USD';
  const dil = dilByMarket(etkinMarket);
  const sz = sozlukGetir(dil);
  const liste = seoUrunListesi({ market: etkinMarket });
  const minYaziciFiyat = etkinMarket === 'jp' ? 10000 : (etkinMarket === 'tr' ? 2500 : 80);
  const minFilamentKg = etkinMarket === 'jp' ? 600 : (etkinMarket === 'tr' ? 150 : 5);

  const kartlar = [];
  let guncelleme = 0;

  for (const u of liste) {
    const fiyat = Number(u?.enUcuzFiyat);
    const url = u?.enUcuzUrl;
    if (!Number.isFinite(fiyat) || fiyat <= 0 || !url) continue;
    const ad = vitrinBaslikTemizle(u.ad);
    if (!ad || VITRIN_TOPTAN_RE.test(ad)) continue;

    const kat = (u.kategori === 'yazici' || u.kategoriSlug === '3d-yazici')
      ? 'yazici'
      : ((u.kategori === 'filament' || ['pla-filament', 'petg-tpu-filament', 'filament'].includes(u.kategoriSlug)) ? 'filament' : 'genel');

    if (kat === 'yazici' && (parcaMi(ad) || fiyat < minYaziciFiyat)) continue;

    let birimMetni = null;
    if (kat === 'filament') {
      const bf = birimFiyatHesapla(ad, fiyat);
      if (bf?.makaraGram > 3500) continue;
      if (bf?.birimFiyat > 0 && bf.birimFiyat < minFilamentKg) continue;
      if (bf?.birimFiyat > 0) {
        birimMetni = `${formatPara(bf.birimFiyat, paraBirimi, sz.para.yerel)} / ${bf.birim === 'L' ? 'L' : 'kg'}`;
      }
    }

    const enPahali = Number(u.enPahaliFiyat);
    const tasarruf = (Number.isFinite(enPahali) && enPahali > fiyat)
      ? Math.round((enPahali - fiyat) * 100) / 100
      : 0;
    const hamYuzde = (Number.isFinite(enPahali) && enPahali > 0 && tasarruf > 0)
      ? Math.round((tasarruf / enPahali) * 100)
      : 0;
    if (hamYuzde > 80) continue;
    const indirimYuzde = (hamYuzde > 0 && hamYuzde <= 60) ? hamYuzde : 0;

    const enIyiTeklif = Array.isArray(u.teklifler) ? u.teklifler.find(t => t.stokta && t.fiyat > 0) || u.teklifler[0] : null;
    const kargo = vitrinKargoYerellestir(enIyiTeklif?.kargo, dil, paraBirimi, sz.para.yerel);
    const ts = Number(u.sonTs) || Date.now();
    if (ts > guncelleme) guncelleme = ts;

    kartlar.push({
      id: u.id || u.slug,
      ad,
      kategori: kat,
      ikon: urunIkonu({ kategori: kat, ad }) || '📦',
      site: u.enUcuzSite || enIyiTeklif?.site || null,
      siteId: enIyiTeklif?.siteId || null,
      market: etkinMarket,
      paraBirimi,
      fiyat,
      stokta: true,
      birimMetni,
      kargo,
      url,
      afiliye: true,
      dip: false,
      gercekFirsat: false,
      indirimYuzde,
      tasarruf,
      degisim: null,
      seri: [],
      ts,
    });
  }

  return vitrinKotadanSec(kartlar, {
    limit,
    guncelleme,
    toplam: kartlar.length,
    rastgele,
    market: etkinMarket,
    paraBirimi,
  });
}
