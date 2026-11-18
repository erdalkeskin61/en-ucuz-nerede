/**
 * 🧬 Akıllı Fiyat Seçici Kaskadı — Self-Healing Parser (2026-11-13)
 *
 * SORUN: Mağaza teması/CSS sınıfı değişince adaptörün sabit regex'i tutmuyor,
 * ürün "fiyat okunamadı" olarak düşüyordu. Tek bir desene bağlı kalmak kırılgan.
 *
 * ÇÖZÜM: 5 kademeli güvenlik ağı. Her kademe bir öncekinin yedeği; hangi
 * kademenin fiyatı kurtardığı LOGLANIR (gözlemlenebilirlik).
 *
 *   1) JSON-LD Schema.org Product        (en güvenilir, yapılandırılmış)
 *   2) Meta etiketleri (product:price, og:price, itemprop=price, twitter:data1)
 *   3) Standart e-ticaret DOM sınıfları  (IdeaSoft/Ticimax/T-Soft/Shopify/Woo)
 *   4) Mağazaya özel regex               (adaptör yapılandırması)
 *   5) Heuristic "₺ / TL" ana fiyat bloğu (son emniyet supabı)
 *
 * DÜRÜSTLÜK: Fiyat uydurulmaz. Sanity check (10–500.000 TL, finite, >0) geçmeyen
 * hiçbir değer döndürülmez; hepsi başarısızsa `null` döner ve çağıran katman
 * "fiyat okunamadı" der. Kademe-5 yalnızca makul aralıkta ve sayfada gerçek bir
 * para birimi işareti varsa devreye girer.
 */
import { findJsonLdProduct, extractJsonLd, parseNum, decodeEntities } from './util.js';

/** Kabul edilen fiyat aralığı (TL). Dışındaki değer "sanı" sayılır, atılır. */
export const FIYAT_MIN_TL = 10;
export const FIYAT_MAX_TL = 500000;

/** Kademe adları (log ve raporlarda kullanılır). */
export const KADEMELER = Object.freeze({
  1: 'JSON-LD Schema.org',
  2: 'Meta Tags',
  3: 'Standart DOM Seçici',
  4: 'Adaptör Regex',
  5: 'Heuristic Metin',
});

/**
 * Fiyat sanity check: sonlu, > 0 ve makul aralıkta mı?
 * @param {*} n
 * @returns {number|null} geçerli fiyat ya da null
 */
export function fiyatGecerliMi(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < FIYAT_MIN_TL || v > FIYAT_MAX_TL) return null;
  return Math.round(v * 100) / 100;
}

/**
 * Türkçe-duyarlı küçük harfe indirger.
 *
 * NEDEN: `RegExp` `/i` bayrağı Türkçe büyük `İ` (U+0130) harfini `i` ile
 * eşleştirmez — `"İndirim".match(/indirim/i)` **null** döner (ölçüldü,
 * 2026-11-13). Metin karşılaştırmalarında bu sessiz kaçaklara yol açıyordu.
 */
function kucultTr(s) {
  return String(s || '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR');
}

/** HTML metnini düz metne çevirir (etiketler + varlıklar temizlenir). */
function duzMetin(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** İlk eşleşen regex'in 1. grubunu metin olarak döndürür. */
function ilkEslesme(metin, desenler) {
  if (desenler == null) return null;
  const liste = Array.isArray(desenler) ? desenler : [desenler];
  for (const re of liste) {
    if (!re) continue;
    let m = null;
    try { m = metin.match(re); } catch { m = null; }
    if (m && m[1] != null) return m[1];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* KADEME 1 — JSON-LD                                                  */
/* ------------------------------------------------------------------ */

/**
 * JSON-LD Product içinden fiyatı çıkarır.
 * `offers.price`, `offers[0].price`, `priceSpecification.price` sırayla denenir.
 * JSON sayıları `parseNum` İLE OKUNMAZ (nokta ondalıktır, bkz. util.js/jsSayi).
 */
function kademe1JsonLd(html) {
  const urun = findJsonLdProduct(html);
  if (!urun) return null;
  const offers = Array.isArray(urun.offers) ? urun.offers[0] : urun.offers;

  const adaylar = [
    offers?.price,
    offers?.lowPrice,
    offers?.priceSpecification?.price,
    urun?.price,
    urun?.priceSpecification?.price,
  ];
  for (const a of adaylar) {
    if (a == null) continue;
    // JSON-LD sayısal alan: ondalık nokta. Metin ise parseNum (TR biçimi) uygun.
    const v = typeof a === 'number' ? a : parseNum(a);
    const g = fiyatGecerliMi(v);
    if (g != null) return g;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* KADEME 2 — Meta etiketleri                                          */
/* ------------------------------------------------------------------ */

const META_DESENLERI = [
  /<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']product:price:amount["']/i,
  /<meta[^>]+(?:property|name)=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:price:amount["']/i,
  /<meta[^>]+itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
  /<meta[^>]+name=["']twitter:data1["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:data1["']/i,
];

function kademe2Meta(html) {
  const ham = ilkEslesme(html, META_DESENLERI);
  if (ham == null) return null;
  return fiyatGecerliMi(parseNum(ham));
}

/* ------------------------------------------------------------------ */
/* KADEME 3 — Standart e-ticaret DOM sınıfları                         */
/* ------------------------------------------------------------------ */

/**
 * Modern altyapıların ortak fiyat sınıfları. Fiyat, sınıfın hemen ardından
 * gelen 1–100 karakterlik içerikten okunur (etiketler temizlenir).
 */
const DOM_DESENLERI = [
  /(?:class|data-test|id)=["'][^"']*(?:product-price|current-price|sale-price|fiyat-alani|price-box)[^"']*["'][^>]*>([\s\S]{1,100}?)<\//i,
  // DİKKAT: yalnız `fiyat` kelimesi ÇOK GENİŞ olurdu — "kargo-fiyat",
  // "taksitli-fiyat" gibi alakasız blokları yakalayıp Kademe-4 (adaptör
  // regex) ve Kademe-5'i devre dışı bırakıyordu (ölçüldü). Bu yüzden
  // yalnızca ürün fiyatını AÇIKÇA belirten sınıflar listelenir.
  /(?:class|data-test|id)=["'][^"']*(?:price__current|price--current|product__price|urun-fiyat|productPrice|salePrice)[^"']*["'][^>]*>([\s\S]{1,100}?)<\//i,
  /data-price=["']([\d.,]+)["']/i,
];

function kademe3Dom(html) {
  for (const re of DOM_DESENLERI) {
    let m = null;
    try { m = html.match(re); } catch { m = null; }
    if (!m || m[1] == null) continue;
    // İçerik HTML olabilir: "1.234,56 TL" veya "<span>1.234,56</span> TL"
    const metin = duzMetin(m[1]);
    const numaralar = metin.match(/\d[\d.,]*/g) || [];
    for (const n of numaralar) {
      const g = fiyatGecerliMi(parseNum(n));
      if (g != null) return g;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* KADEME 4 — Mağazaya özel regex                                      */
/* ------------------------------------------------------------------ */

function kademe4Ozel(html, desenler) {
  const ham = ilkEslesme(html, desenler);
  if (ham == null) return null;
  // Özel regex grubu HTML içerebilir; önce düz metne çevir, sonra ilk sayıyı al.
  const metin = duzMetin(ham);
  const direkt = fiyatGecerliMi(parseNum(metin));
  if (direkt != null) return direkt;
  for (const n of (metin.match(/\d[\d.,]*/g) || [])) {
    const g = fiyatGecerliMi(parseNum(n));
    if (g != null) return g;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* KADEME 5 — Heuristic (TL / ₺)                                       */
/* ------------------------------------------------------------------ */

/**
 * Sayfada gerçek bir para birimi işaretiyle (₺ veya TL) biten, makul
 * aralıktaki ilk fiyat bloğunu yakalar.
 *
 * Gürültü kontrolü: "12 ay taksit", "kargo 45 TL", "%20 indirim" gibi
 * değerlerin önüne geçmek için yalnızca **para birimi işaretli** ve
 * bağlamında "taksit/kargo/indirim" geçmeyen eşleşmeler kabul edilir.
 */
function kademe5Heuristic(html) {
  // <script>/<style> içeriğini at (JSON/JS sayıları yanıltmasın).
  const govde = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const desenler = [
    // ₺1.234,56 veya 1.234,56 ₺
    /(?:₺\s*([\d][\d.,]*)|([\d][\d.,]*)\s*₺)/g,
    // 1.234,56 TL
    /([\d][\d.,]*)\s*(?:TL|Try|TRY)\b/gi,
  ];

  const GURULTU = /taksit|kargo|indirim|kazan|puan|kupon|bedava|ücretsiz|ucretsiz|kampanya|havale|eft/;

  for (const re of desenler) {
    let m;
    let sayac = 0;
    while ((m = re.exec(govde)) && sayac < 400) {
      sayac++;
      const ham = m[1] || m[2];
      if (!ham) continue;

      // Bağlam = AYNI metin düğümündeki, eşleşmeden hemen önceki sözcükler.
      // 90 karakterlik kör pencere ÖNCEKİ kardeş elementi de yakalıyordu:
      // "<div>Kargo 45,00 TL</div><div>1.450,00 TL</div>" → ikinci fiyat da
      // "kargo" gürültüsü sayılıp atlanıyordu (ölçüldü). Bu yüzden pencere
      // son `>` karakterinden sonrasıyla sınırlanır.
      const bas = Math.max(0, m.index - 90);
      const ham2 = govde.slice(bas, m.index);
      const sonEtiket = ham2.lastIndexOf('>');
      const baglam = kucultTr(duzMetin(sonEtiket >= 0 ? ham2.slice(sonEtiket + 1) : ham2));
      if (GURULTU.test(baglam)) continue;

      const g = fiyatGecerliMi(parseNum(ham));
      if (g != null) return g;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Genel API                                                           */
/* ------------------------------------------------------------------ */

/**
 * 5 kademeli kaskad ile fiyatı çıkarır.
 *
 * @param {string} html sayfa gövdesi
 * @param {RegExp|RegExp[]|null} [ozelDesenler] adaptörün kendi fiyat regex'i (Kademe 4)
 * @param {string} [siteName] log/rapor etiketi
 * @param {{sessiz?: boolean, logger?: Function}} [opts] `sessiz:true` → kurtarma logu basılmaz
 * @returns {{fiyat:number|null, kademe:number|null, kademeAdi:string|null, kurtarildi:boolean}}
 *   `kurtarildi` = fiyat Kademe 1/2/3/5'ten geldi (yani adaptör regex'i tutmadı)
 */
export function extractSelfHealingPrice(html, ozelDesenler = null, siteName = '', opts = {}) {
  const bos = { fiyat: null, kademe: null, kademeAdi: null, kurtarildi: false };
  if (!html || typeof html !== 'string') return bos;

  const denemeler = [
    [1, () => kademe1JsonLd(html)],
    [2, () => kademe2Meta(html)],
    [3, () => kademe3Dom(html)],
    [4, () => kademe4Ozel(html, ozelDesenler)],
    [5, () => kademe5Heuristic(html)],
  ];

  for (const [kademe, calistir] of denemeler) {
    let fiyat = null;
    try { fiyat = calistir(); } catch { fiyat = null; }
    if (fiyat == null) continue;

    const kademeAdi = KADEMELER[kademe];
    const kurtarildi = kademe !== 4;
    if (kurtarildi && !opts.sessiz) {
      const log = typeof opts.logger === 'function' ? opts.logger : console.log;
      const etiket = siteName ? `${siteName} mağazası` : 'Mağaza';
      log(`[self-healing] ${etiket} Kademe-${kademe} ${kademeAdi} ile kurtarıldı: ₺${fiyat}`);
    }
    return { fiyat, kademe, kademeAdi, kurtarildi };
  }
  return bos;
}

/**
 * Başlık için kaskad: JSON-LD → og:title → mağaza regex → <h1> → <title>.
 * @returns {string|null}
 */
export function extractSelfHealingTitle(html, ozelDesenler = null) {
  if (!html || typeof html !== 'string') return null;

  // 1) JSON-LD Product.name
  try {
    const urun = findJsonLdProduct(html);
    const ad = String(urun?.name || '').trim();
    if (ad.length >= 3) return duzMetin(ad).slice(0, 250);
  } catch { /* yoksay */ }

  // 2) og:title
  const og = ilkEslesme(html, [
    /<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']{3,250})["']/i,
    /<meta[^>]+content=["']([^"']{3,250})["'][^>]*(?:property|name)=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']{3,250})["']/i,
  ]);
  if (og) return duzMetin(og).slice(0, 250);

  // 3) Mağazaya özel regex
  const ozel = ilkEslesme(html, ozelDesenler);
  if (ozel) {
    const t = duzMetin(ozel).slice(0, 250);
    if (t.length >= 3) return t;
  }

  // 4) <h1>
  const h1 = ilkEslesme(html, [/<h1[^>]*>([\s\S]{3,250}?)<\/h1>/i]);
  if (h1) {
    const t = duzMetin(h1).slice(0, 250);
    if (t.length >= 3) return t;
  }

  // 5) <title>
  const baslik = ilkEslesme(html, [/<title[^>]*>([\s\S]{3,250}?)<\/title>/i]);
  return baslik ? duzMetin(baslik).slice(0, 250) : null;
}

/**
 * Görsel için kaskad: JSON-LD image → og:image → twitter:image → itemprop=image.
 * @returns {string|null} mutlak ya da sayfadan gelen URL
 */
export function extractSelfHealingImage(html) {
  if (!html || typeof html !== 'string') return null;

  try {
    const urun = findJsonLdProduct(html);
    const img = urun?.image;
    const ilk = Array.isArray(img) ? img[0] : img;
    const url = typeof ilk === 'object' ? ilk?.url : ilk;
    if (url && typeof url === 'string' && url.length > 8) return url.trim();
  } catch { /* yoksay */ }

  const og = ilkEslesme(html, [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url|:url)?["'][^>]*content=["']([^"']{8,500})["']/i,
    /<meta[^>]+content=["']([^"']{8,500})["'][^>]*(?:property|name)=["']og:image(?::secure_url|:url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']{8,500})["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]*content=["']([^"']{8,500})["']/i,
  ]);
  return og ? og.trim() : null;
}

/**
 * Marka için kaskad: JSON-LD brand → itemprop=brand → mağaza regex → og:site_name.
 * @returns {string|null}
 */
export function extractSelfHealingBrand(html, ozelDesenler = null) {
  if (!html || typeof html !== 'string') return null;

  try {
    const urun = findJsonLdProduct(html);
    const marka = urun?.brand;
    const ad = typeof marka === 'object' ? marka?.name : marka;
    if (ad && String(ad).trim().length >= 2) return duzMetin(ad).slice(0, 80);
  } catch { /* yoksay */ }

  const itemprop = ilkEslesme(html, [
    /itemprop=["']brand["'][^>]*content=["']([^"']{2,80})["']/i,
    /itemprop=["']brand["'][^>]*>([\s\S]{2,120}?)<\//i,
  ]);
  if (itemprop) {
    const t = duzMetin(itemprop).slice(0, 80);
    if (t.length >= 2) return t;
  }

  const ozel = ilkEslesme(html, ozelDesenler);
  if (ozel) {
    const t = duzMetin(ozel).slice(0, 80);
    if (t.length >= 2) return t;
  }
  return null;
}

/**
 * Kademe dağılımını raporlar (sağlık paneli / testler için).
 * @param {Array<{kademe:number}>} sonuclar
 * @returns {Record<number, number>}
 */
export function kademeDagilimi(sonuclar) {
  const dagilim = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of Array.isArray(sonuclar) ? sonuclar : []) {
    const k = Number(s?.kademe);
    if (k >= 1 && k <= 5) dagilim[k] += 1;
  }
  return dagilim;
}

export default {
  extractSelfHealingPrice,
  extractSelfHealingTitle,
  extractSelfHealingImage,
  extractSelfHealingBrand,
  fiyatGecerliMi,
  kademeDagilimi,
  KADEMELER,
  FIYAT_MIN_TL,
  FIYAT_MAX_TL,
};
