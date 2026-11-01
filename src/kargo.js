/**
 * Kargo bilgisi çıkarıcı — "Bilinmiyor" yerine net fiyat/eşik bulma sistemi.
 *
 * İlke: ek istek ATMAZ. Ürün sayfası zaten getProduct sırasında çekilir; site
 * genelinde her sayfada duran kargo banner'ları ("1500 TL ve Üzeri Kargo Bedava",
 * "Yurtiçi Kargo 139TL"...) ve ürün rozetleri bu HTML'den okunur.
 *
 * Çıkarılanlar (muhafazakâr desenlerle; sahte veri üretilmez):
 *  - freeOver: "N TL üzeri/üstü ... kargo bedava/ücretsiz" eşik tutarı
 *  - fee:      "Kargo [ücreti] N TL", "Kargo N TL'den başlar" (alt sınır),
 *              "N TL altı siparişlerde M TL" (eşik altı sabit ücret)
 *
 * Eşik kararı fiyat hesaplama sırasında (pricing.js) ürün fiyatıyla karşılaştırılarak
 * verilir: fiyat eşiği aşarsa kargo bedava sayılır, aşmıyasa bilinen ücret uygulanır.
 */
import { parseNum, formatTL, decodeEntities } from './util.js';

// "1.500 TL ve Üzeri Alışverişlerinizde Kargo Bedava" / "2.000₺ üzeri ücretsiz kargo"
// / "1000 TL ve üzeri ... kargo ücreti bizden" biçimleri (etiketleri atılmış metinde).
const ESIK_RE = [
  /([\d][\d.,]*)\s*(?:tl|₺)\s*(?:ve\s*)?(?:üzeri|üstü)[^{}]{0,100}?(?:kargo|gönderim)[^{}]{0,40}?(?:bedava|ücretsiz|bizden)/,
  /([\d][\d.,]*)\s*(?:tl|₺)\s*(?:ve\s*)?(?:üzeri|üstü)[^{}]{0,100}?(?:bedava|ücretsiz)[^{}]{0,40}?(?:kargo|gönderim)/,
];

// "Kargo 149 TL" / "kargo ücreti: 79,90 TL" / "Yurtiçi Kargo 139TL".
// Kargo kelimesiyle tutar arasında yalnızca ücret sözcükleri/ayraçlara izin verilir;
// "Kargo Bedava" gibi metinler eşleşmez.
const UCRET_RE = /(?:kargo|gönderim|teslimat)\s*(?:ücreti|bedeli|fiyatı)?\s*[:\-–]?\s*([\d][\d.,]*)\s*(?:tl|₺)/g;

// "Kargo 109 TL'den başlar" — alt sınır ücreti (Hepsijet/DHL başlangıç tarifesi).
const UCRET_BASLAR_RE = /kargo\s*(?:ücreti)?\s*[:\-]?\s*([\d][\d.,]*)\s*(?:tl|₺)\s*['’]?\s*(?:den|dan)\s*başlar/;

// "1000 TL altı siparişlerinizde 49.90 TL" — eşik altı sabit ücret beyanı.
const UCRET_ALTI_RE = /([\d][\d.,]*)\s*(?:tl|₺)\s*alt[ıi][^{}]{0,60}?([\d][\d.,]*)\s*(?:tl|₺)/;

// "Tüm siparişlerde ücretsiz kargo" — eşiksiz, site geneli bedava beyanı.
const TAMAMEN_BEDAVA_RE = /t[üu]m\s+sipari[şs]ler(?:inizde|de)[^{}]{0,80}?(?:ücretsiz\s*kargo|kargo\s*(?:bedava|ücretsiz))/;

// Ürün kartında kargo-bedava işaret sınıfı: class="kargo_bedavali_urun_ikon",
// class="ucretsiz-kargo-badge" vb. (CSS tanımları değil — yalnız etiket kullanımı)
const BEDAVA_SINIF_RE = /class="[^"]*(?:kargo[_-]?bedava(?:li)?|bedava[_-]?kargo|ucretsiz[_-]?kargo|kargo[_-]?ucretsiz)[^"]*"/;

const MAKUL_UCRET_MIN = 5;   // TL — altındaki tutarlar muhtemelen eşik/para birimi hatası
const MAKUL_UCRET_MAX = 500; // TL — üzerindeki tutarlar eşik metni yanlış eşleşmesidir
const MAKUL_ESIK_MIN = 50;
const MAKUL_ESIK_MAX = 20000;

/**
 * Metni kargo desenleri için hazırlar: HTML yorumlarını atar, varlıkları çözer
 * (&uuml; → ü), kodlama bozukluklarını (mojibake) düzeltir, küçük harfe çevirir
 * (Türkçe İ, U+0130, /i regex bayrağıyla eşleşmez — küçük harf + birleştirici
 * nokta temizliği şart) ve U+0307 birleştirici noktayı atar.
 */
function temizle(html) {
  let t = String(html)
    // SCRIPT/STYLE bloklarını at: Ticimax ve IdeaSoft sayfaları her ürün sayfasında
    // koca bir ÇEVİRİ SÖZLÜĞÜ taşıyor ("Global_KargoBedava":"Kargo Bedava"). Bu metin
    // görünmez ama "kargo bedava" desenlerine takılıp HER ürünü kargo bedava sayıyordu
    // (2026-10-26: 3dultra, robitshop, ventatek'te fee=0 hatası). Karar yalnızca
    // kullanıcının GÖRDÜĞÜ metinden verilmeli.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  t = decodeEntities(t.replace(/<!--[\s\S]*?-->/g, ' '));
  // UTF-8'in Latin-1 olarak yanlış çözülmesi (PlatinMarket vb.): "ã¼" → ü, "åŸ" → ş ...
  t = t
    .replace(/Ã¼/g, 'ü').replace(/Ã¶/g, 'ö').replace(/Ã§/g, 'ç').replace(/Ãœ/g, 'Ü').replace(/Ã–/g, 'Ö').replace(/Ã‡/g, 'Ç')
    .replace(/ã¼/g, 'ü').replace(/ã¶/g, 'ö').replace(/ã§/g, 'ç').replace(/ãœ/g, 'Ü').replace(/ã–/g, 'Ö').replace(/ã‡/g, 'Ç')
    .replace(/ä±/g, 'ı').replace(/ä°/g, 'İ').replace(/ÅŸ/g, 'ş').replace(/åŸ/g, 'ş').replace(/Åž/g, 'Ş').replace(/åž/g, 'Ş')
    .replace(/ÄŸ/g, 'ğ').replace(/äŸ/g, 'ğ').replace(/Äž/g, 'Ğ');
  // Küçük harf + birleştirici nokta temizliği (Türkçe İ sorunu)
  return t.toLowerCase().replace(/\u0307/g, '');
}

/**
 * Ürün sayfası HTML'inden kargo bilgisini çıkarır.
 * @param {string} html ürün sayfası (ham)
 * @returns {{fee:number|null, freeOver:number|null, applies:boolean|null, note:string}}
 */
/**
 * Site geneli kargo kuralları — kullanıcı tarafından doğrulanmış gerçek tarifeler.
 *
 * Neden gerekli: sitelerin çoğu kargo ücretini yalnızca SEPET adımında gösteriyor;
 * ürün sayfasında yalnızca "3000 TL üzeri bedava" banner'ı var. Ücret bilinmeyince
 * karşılaştırma eksik kalıyordu ("Sepette belli").
 *
 * Kullanıcı 2026-10-26'da bu üç mağazanın gerçek tarifesini bildirdi:
 *  - 3dmarketim: 3.000 TL altı 145 TL, üzeri ücretsiz
 *  - 3dultra   : 3.000 TL altı 150 TL, üzeri ücretsiz
 *  - robitshop : 2.000 TL altı 179,90 TL, üzeri ücretsiz
 *  - ventatek  : 3.000 TL altı 129 TL, üzeri ücretsiz (daha önce eklendi)
 *
 * Kural, HTML'den okunan AÇIK bir ücretten sonra gelir; ama sayfadaki "bedava"
 * işaretlerinden ÖNCE gelir (o işaretler çeviri sözlüğü yüzünden yanlış pozitif
 * verebiliyor — bkz. temizle()).
 */
export const SITE_KARGO_VARSAYILANLARI = {
  '3dmarketim': {
    fee: 145,
    freeOver: 3000,
    applies: true,
    note: 'Kargo 145 TL · 3.000 TL ve üzeri ücretsiz',
  },
  '3dultra': {
    fee: 150,
    freeOver: 3000,
    applies: true,
    note: 'Kargo 150 TL · 3.000 TL ve üzeri ücretsiz',
  },
  robitshop: {
    fee: 179.90,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 179,90 TL · 2.000 TL ve üzeri ücretsiz',
  },
  ventatek: {
    fee: 129,
    freeOver: 3000,
    applies: true,
    note: 'Kargo 129 TL · 3.000 TL üzeri ücretsiz',
  },
  // ---- 2026-10-26 (2. grup, kullanıcı bildirimi) ----
  // NOT: fixx3d kendi sayfalarında "2000 TL ve üzeri ücretsiz kargo" yazıyor
  // (ürün + ana sayfa + footer). Kullanıcı 3.000 TL / 99,90 TL bildirdi; kullanıcı
  // bilgisi esas alındı (banner eski kalmış olabilir). Değişirse tek satır burasıdır.
  'fixx3d': {
    fee: 99.90,
    freeOver: 3000,
    applies: true,
    note: 'Kargo 99,90 TL · 3.000 TL ve üzeri ücretsiz',
  },
  'robo90': {
    fee: 99.99,
    freeOver: 1500,
    applies: true,
    note: 'Kargo 99,99 TL · 1.500 TL ve üzeri ücretsiz',
  },
  // Kullanıcı yalnız ücreti (119,90 TL) bildirdi; sitenin kendi beyanı
  // "Ücretsiz Kargo 1500 TL ve üzeri alışverişlerinizde kargo ücreti ödemezsiniz".
  'robolinkmarket': {
    fee: 119.90,
    freeOver: 1500,
    applies: true,
    note: 'Kargo 119,90 TL · 1.500 TL ve üzeri ücretsiz',
  },
  'robomer': {
    fee: 129.99,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 129,99 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // ---- 2026-10-26 (3. grup, kullanıcı bildirimi) ----
  // teknikfilament3d: site beyanı "2000₺ ve üzeri siparişlerinizde ÜCRETSİZ KARGO" ✓ uyumlu
  'teknikfilament3d': {
    fee: 150,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 150 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // 3dprinterankara: site "DHL Kargo ile gönderim (2500₺ üzeri ücretsiz)" diyor;
  // kullanıcı 2.000 TL bildirdi → kullanıcı bilgisi esas alındı (banner eski olabilir).
  '3dprinterankara': {
    fee: 250,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 250 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // 3dcim: site beyanı "2000₺ Üzeri Kargo Ücretsiz" ✓ uyumlu
  '3dcim': {
    fee: 99,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 99 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // pusula3d: site beyanı "2000 TL ve üzeri siparişlerinizde kargo ücretsiz" ✓ uyumlu
  'pusula3d': {
    fee: 130,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 130 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // filamentsan: kullanıcı yalnız ücreti (95 TL) bildirdi; eşik sitenin kendi
  // beyanından alındı: "1500 TL Üzeri Siparişlerde Kargo Bedava".
  filamentsan: {
    fee: 95,
    freeOver: 1500,
    applies: true,
    note: 'Kargo 95 TL · 1.500 TL ve üzeri ücretsiz',
  },
  // ---- 2026-10-26 (4. grup, kullanıcı bildirimi) ----
  // teknosa: kullanıcı "kargo ücretsiz" diyor. Site de "Bugüne özel: Tüm
  // siparişlerde ücretsiz kargo" / "Teknosa'da Ücretsiz Kargo" yazıyor (ayrıca
  // eski bir "2.500 TL üzeri" banner'ı da var — kullanıcı bilgisi esas).
  teknosa: {
    fee: 0,
    freeOver: null,
    applies: false,
    note: 'Ücretsiz kargo (site beyanı: tüm siparişlerde)',
  },
  // robocombo: site "HEPSİJET VE ARAS KARGO İLE YALNIZCA 150₺ — 2000₺ ÜZERİ
  // ÜCRETSİZ KARGO" diyor; kullanıcı "2000 TL ve altı 150 TL" → tam 2.000 TL'de
  // ücret alınır, bu yüzden freeOverExclusive (eşik HARİÇ).
  robocombo: {
    fee: 150,
    freeOver: 2000,
    freeOverExclusive: true,
    applies: true,
    note: 'Kargo 150 TL · 2.000 TL üzeri ücretsiz (2.000 TL dahil değil)',
  },
  // tou3d: site "1850 TL üzeri ücretsiz kargo" diyor; kullanıcı 2.000 TL / 175 TL
  // bildirdi → kullanıcı bilgisi esas alındı.
  tou3d: {
    fee: 175,
    freeOver: 2000,
    applies: true,
    note: 'Kargo 175 TL · 2.000 TL ve üzeri ücretsiz',
  },
  // ---- 2026-10-28 (5. grup, kullanıcı bildirimi) ----
  // deneystore: kullanıcı "3.000 TL üzeri ücretsiz, altı 199,99 TL" bildirdi.
  // Tam 3.000 TL'de site beyanı olmadığı için standart "ve üzeri" (dahil) kabul edildi.
  deneystore: {
    fee: 199.99,
    freeOver: 3000,
    applies: true,
    note: 'Kargo 199,99 TL · 3.000 TL ve üzeri ücretsiz',
  },
};

/**
 * Ürün sayfası HTML'inden kargo bilgisini çıkarır.
 * @param {string} html ürün sayfası (ham)
 * @param {string|null} siteId site kimliği (varsayılan kargo kuralları için)
 * @returns {{fee:number|null, freeOver:number|null, applies:boolean|null, note:string}}
 */
export function kargoCikar(html, siteId = null) {
  const siteDef = siteId ? SITE_KARGO_VARSAYILANLARI[siteId] : null;
  const bos = siteDef ? { ...siteDef } : { fee: null, freeOver: null, applies: null, note: 'Kargo bilgisi ürün sayfasında bulunamadı' };
  if (!html) return bos;
  const ham = temizle(html);
  const metin = ham.replace(/<[^>]*>/g, ' '); // metin desenleri için etiketleri at

  // 1) Ücretsiz kargo eşiği
  let freeOver = null;
  for (const re of ESIK_RE) {
    const m = metin.match(re);
    if (m) {
      const esik = parseNum(m[1]);
      if (esik != null && esik >= MAKUL_ESIK_MIN && esik <= MAKUL_ESIK_MAX) { freeOver = esik; break; }
    }
  }

  // 2) Açık kargo ücreti — eşik tutarıyla aynı olanlar atlanır
  let fee = null;
  let feeNot = null;
  for (const m of metin.matchAll(UCRET_RE)) {
    const tutar = parseNum(m[1]);
    if (tutar == null || tutar < MAKUL_UCRET_MIN || tutar > MAKUL_UCRET_MAX) continue;
    if (freeOver != null && Math.abs(tutar - freeOver) < 0.01) continue;
    fee = tutar;
    break;
  }
  // "Kargo N TL'den başlar" (alt sınır tarifesi)
  if (fee == null) {
    const m = metin.match(UCRET_BASLAR_RE);
    const tutar = m ? parseNum(m[1]) : null;
    if (tutar != null && tutar >= MAKUL_UCRET_MIN && tutar <= MAKUL_UCRET_MAX) {
      fee = tutar;
      feeNot = `Kargo ${formatTL(tutar)}'den başlar (alt sınır, sepette netleşir)`;
    }
  }
  // "N TL altı siparişlerde M TL" — eşik altı sabit ücret (eşik de çıkar)
  if (fee == null) {
    const m = metin.match(UCRET_ALTI_RE);
    if (m) {
      const esik = parseNum(m[1]);
      const tutar = parseNum(m[2]);
      if (esik != null && tutar != null && tutar >= MAKUL_UCRET_MIN && tutar <= MAKUL_UCRET_MAX
          && esik >= MAKUL_ESIK_MIN && esik <= MAKUL_ESIK_MAX) {
        fee = tutar;
        if (freeOver == null) freeOver = esik;
      }
    }
  }

  // 3) Eşiksiz, site geneli bedava beyanı ("tüm siparişlerde ücretsiz kargo")
  const tamamenBedava = TAMAMEN_BEDAVA_RE.test(metin);
  // Ürün kartında kargo-bedava işareti (class kullanımı — etiketli metinde)
  const bedavaIsaret = BEDAVA_SINIF_RE.test(ham);

  // 4) SİTE KURALI ÖNCELİĞİ (2026-10-26): kullanıcı tarafından doğrulanmış gerçek
  //    tarife, "bedava" işaretlerinden DAHA güvenilirdir. Sayfadaki işaretler çeviri
  //    sözlüğüne takılıp yanlış pozitif verebiliyor (3dultra/robitshop'ta her ürün
  //    "kargo bedava" çıkıyordu). Açık bir ücret okunduysa o yine önceliklidir.
  if (siteDef) {
    if (fee != null) {
      // HTML'den net ücret okundu → eşiği ve sınır kuralını site tarifesinden tamamla
      if (freeOver == null) freeOver = siteDef.freeOver;
      return {
        fee,
        freeOver,
        freeOverExclusive: siteDef.freeOverExclusive === true,
        applies: true,
        note: feeNot || (freeOver != null
          ? `Kargo ${formatTL(fee)} · ${formatTL(freeOver)} ${siteDef.freeOverExclusive ? 'üzeri' : 've üzeri'} ücretsiz`
          : `Kargo ${formatTL(fee)}`),
      };
    }
    // Ücret okunamadı → doğrulanmış site tarifesi
    return { ...siteDef };
  }

  if (tamamenBedava) {
    return { fee: 0, freeOver: null, applies: false, note: 'Tüm siparişlerde ücretsiz kargo (site beyanı)' };
  }
  if (bedavaIsaret) {
    return { fee: 0, freeOver: null, applies: false, note: 'Ürün sayfasında kargo bedava işareti' };
  }

  if (fee != null && freeOver != null) {
    return { fee, freeOver, applies: true, note: feeNot || `Kargo ${formatTL(fee)} · ${formatTL(freeOver)} üzeri ücretsiz` };
  }
  if (fee != null) {
    return { fee, freeOver: null, applies: true, note: feeNot || `Kargo ${formatTL(fee)} (site bilgisi)` };
  }
  if (freeOver != null) {
    return { fee: null, freeOver, applies: null, note: `${formatTL(freeOver)} üzeri ücretsiz kargo (ürün eşiğin altındaysa ücret sepette netleşir)` };
  }
  return bos;
}

