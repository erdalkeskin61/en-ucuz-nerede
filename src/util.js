/** Ortak yardımcılar: model kodu, renk, başlık benzerliği, JSON çıkarımı, para biçimi. */

// Gramaj (net miktar) kontrolü için. birimFiyat.js util.js'i import ETMEZ → döngü yok.
import { miktarCakismasi } from './birimFiyat.js';

const TR_COLORS = [
  'siyah', 'beyaz', 'kırmızı', 'kirmizi', 'mavi', 'lacivert', 'gri', 'antrasit', 'gümüş', 'gumus',
  'altın', 'altin', 'pembe', 'yeşil', 'yesil', 'mor', 'turuncu', 'sarı', 'sari', 'kahverengi',
  'turkuaz', 'bej', 'krem', 'bordo', 'ekru', 'lavanta', 'şeffaf', 'seffaf', 'transparan',
  'gök mavisi', 'gok mavisi', 'açık gri', 'acik gri', 'koyu gri', 'rose gold', 'titanyum',
  // 2026-10-25: Türkçe'de yaygın ton adları (öneri akışında renk niyeti için)
  'eflatun', 'lila', 'fuşya', 'fusya', 'haki', 'hardal', 'vişne', 'visne', 'mercan',
  'somon', 'kiremit', 'bakır', 'bakir', 'bronz', 'çelik', 'celik', 'grafit', 'nefti',
  'vizon', 'buz mavisi', 'saks mavisi', 'bebe mavisi',
  // 2026-11-03: filament sektöründe yaygın iki renk adı eksikti. 'Ten' ve
  // 'Naturel' Porima'nın gerçek varyant renkleri; tanınmadıkları için renk
  // karşılaştırması 'bilinmiyor' dönüyor ve doğru ürün elenebiliyordu.
  'ten', 'naturel', 'natural',
  // 2026-11-03: Porima/xPLA ürün hatlarında geçen ton adları
  'latte', 'mokka', 'mocha', 'taupe', 'kum', 'buz', 'fıstık yeşili', 'fistik yesili',
  'yavruağzı', 'yavruagzi', 'beyazımsı', 'kum rengi', 'taş rengi', 'tas rengi', 'yeşim', 'yesim', 'jade',
  // 3D Filament estetik varyantları
  'mermer', 'marble', 'ahşap', 'ahsap', 'wood', 'ipek', 'silk', 'glow', 'simli', 'glitter',
];

const EN_TO_TR = {
  black: 'siyah', white: 'beyaz', red: 'kırmızı', blue: 'mavi', navy: 'lacivert',
  gray: 'gri', grey: 'gri', silver: 'gümüş', gold: 'altın', pink: 'pembe',
  green: 'yeşil', purple: 'mor', orange: 'turuncu', yellow: 'sarı', brown: 'kahverengi',
  turquoise: 'turkuaz', beige: 'bej', cream: 'krem', burgundy: 'bordo',
  // 2026-10-25: yabancı markaların sık kullandığı tonlar (Bambu Lab, eSUN, Filamix…)
  cyan: 'mavi', teal: 'mavi', indigo: 'mavi', violet: 'mor', lilac: 'mor', lavender: 'mor',
  magenta: 'pembe', fuchsia: 'pembe', maroon: 'kırmızı', crimson: 'kırmızı', scarlet: 'kırmızı',
  charcoal: 'gri', graphite: 'gri', anthracite: 'antrasit',
  mint: 'yeşil', lime: 'yeşil', olive: 'yeşil', jade: 'yeşil',
  coral: 'turuncu', peach: 'turuncu',
  bronze: 'kahverengi', cocoa: 'kahverengi', chocolate: 'kahverengi', coffee: 'kahverengi',
  ivory: 'beyaz', bone: 'beyaz', clear: 'şeffaf', transparent: 'şeffaf',
  marble: 'mermer', wood: 'ahşap', silk: 'ipek', glitter: 'simli',
};

const COLOR_CANON = {
  kirmizi: 'kırmızı', gumus: 'gümüş', altin: 'altın', yesil: 'yeşil', yesim: 'yeşil', 'yeşim': 'yeşil', sari: 'sarı',
  seffaf: 'şeffaf', 'gok mavisi': 'mavi', 'acik gri': 'gri', 'koyu gri': 'gri',
  'rose gold': 'altın', black: 'siyah', white: 'beyaz', red: 'kırmızı', blue: 'mavi',
  navy: 'lacivert', gray: 'gri', grey: 'gri', silver: 'gümüş', gold: 'altın', pink: 'pembe',
  green: 'yeşil', purple: 'mor', orange: 'turuncu', yellow: 'sarı', brown: 'kahverengi',
  turquoise: 'turkuaz', beige: 'bej', cream: 'krem', burgundy: 'bordo',
  cyan: 'mavi', teal: 'mavi', indigo: 'mavi', violet: 'mor', lilac: 'mor', lavender: 'mor',
  magenta: 'pembe', fuchsia: 'pembe', maroon: 'kırmızı', crimson: 'kırmızı', scarlet: 'kırmızı',
  charcoal: 'gri', graphite: 'gri', anthracite: 'antrasit',
  mint: 'yeşil', lime: 'yeşil', olive: 'yeşil', jade: 'yeşil',
  coral: 'turuncu', peach: 'turuncu',
  bronze: 'kahverengi', cocoa: 'kahverengi', chocolate: 'kahverengi', coffee: 'kahverengi',
  ivory: 'beyaz', bone: 'beyaz', clear: 'şeffaf', transparent: 'şeffaf',
  marble: 'mermer', wood: 'ahşap', silk: 'ipek', glitter: 'simli',
  // Türkçe ton adları → temel renk
  eflatun: 'mor', lila: 'mor', fuşya: 'pembe', fusya: 'pembe', haki: 'yeşil',
  hardal: 'sarı', vişne: 'kırmızı', visne: 'kırmızı', mercan: 'turuncu',
  somon: 'turuncu', kiremit: 'turuncu', bakır: 'kahverengi', bakir: 'kahverengi',
  bronz: 'kahverengi', çelik: 'gri', celik: 'gri', grafit: 'gri', nefti: 'yeşil',
  vizon: 'kahverengi', 'buz mavisi': 'mavi', 'saks mavisi': 'mavi', 'bebe mavisi': 'mavi',
  'fıstık yeşili': 'yeşil', 'fistik yesili': 'yeşil', yavruağzı: 'turuncu', yavruagzi: 'turuncu',
  beyazımsı: 'beyaz', 'kum rengi': 'bej', 'taş rengi': 'gri', 'tas rengi': 'gri',
};

export function toLowerTr(s) {
  return String(s || '').toLocaleLowerCase('tr-TR');
}

/** Metindeki renk adlarını bulur, standart Türkçe adlara çevirir. */
export function extractColors(text) {
  if (!text) return [];
  const t = ' ' + toLowerTr(text).replace(/[^a-zçğıöşü0-9\s-]/gi, ' ').replace(/\s+/g, ' ') + ' ';
  const found = new Set();
  for (const c of TR_COLORS) {
    if (t.includes(' ' + c + ' ') || t.includes(' ' + c + '-') || t.includes('-' + c)) {
      found.add(c);
      continue;
    }
    // 2026-11-04: Türkçe İYELİK EKİ. "Nane Yeşili" → yeşil, "Siyahı" → siyah,
    // "Mavisi" → mavi. Önceden bu tonlar hiç renk sayılmadığı için farklı renkli
    // ilan "renk bilinmiyor" diye geçiyor ve yanlış eşleşebiliyordu.
    if (c.includes(' ')) continue;
    for (const ek of ['i', 'ı', 'u', 'ü', 'si', 'sı', 'su', 'sü', 'yi', 'yı']) {
      if (t.includes(' ' + c + ek + ' ')) { found.add(c); break; }
    }
  }
  for (const [en, tr] of Object.entries(EN_TO_TR)) {
    if (t.includes(' ' + en + ' ')) found.add(en);
  }
  return [...found].map(c => COLOR_CANON[c] || c);
}

/** Verilen serbest metni tek bir renk etiketine indirger (yoksa null). */
export function dominantColor(text) {
  const colors = extractColors(text);
  if (!colors.length) return null;
  return [...new Set(colors)][0];
}

/** Genel (kesin olmayan) renk tanımları: bunlar renk farkı sayılmaz. */
const GENERIC_COLORS = new Set(['çok renkli', 'cok renkli', 'renkli', 'karışık', 'karisik', 'karma', 'multicolor', 'multi color', 'rgb', 'tüm renkler', 'tum renkler', 'ana renk']);

/** İki renk bilgisi aynı mı? (Bilinmeyen ya da genel renk tanımı kararsız döner.) */
export function sameColor(a, b) {
  if (!a || !b) return null;
  const la = sadelestir(a).trim(), lb = sadelestir(b).trim();
  if (GENERIC_COLORS.has(la) || GENERIC_COLORS.has(lb)) return null;
  return la === lb;
}

/**
 * Renk aileleri: kullanıcı "gri" derse gri tonları da (gümüş, antrasit, füme,
 * titanyum, kurşun grisi) kabul edilir. Kullanıcı isteği "aynı renk ailesinden
 * öner" biçiminde olduğu için bu tolerans yalnızca NİYET tarafında kullanılır;
 * ürün-ürün karşılaştırmasında (sameColor) tam renk eşitliği korunur.
 */
const RENK_AILELERI = {
  'siyah': ['siyah', 'antrasit', 'komur', 'black'],
  'beyaz': ['beyaz', 'kırık beyaz', 'off white', 'white', 'beyazımsı', 'ivory', 'bone'],
  'gri': ['gri', 'gümüş', 'gumus', 'antrasit', 'füme', 'fume', 'kurşun', 'kurşun grisi', 'titanyum', 'platin', 'platinum', 'silver', 'gray', 'grey', 'graphite', 'grafit', 'space grey', 'uzay grisi', 'çelik', 'celik', 'taş rengi', 'tas rengi', 'charcoal'],
  'kırmızı': ['kırmızı', 'bordo', 'vişne', 'visne', 'bordeaux', 'red', 'maroon', 'crimson', 'scarlet'],
  'mavi': ['mavi', 'lacivert', 'turkuaz', 'gök mavisi', 'indigo', 'blue', 'navy', 'turquoise', 'cyan', 'teal', 'buz mavisi', 'saks mavisi', 'bebe mavisi'],
  'yeşil': ['yeşil', 'haki', 'zümrüt', 'mint', 'green', 'olive', 'nefti', 'fıstık yeşili', 'fistik yesili', 'lime'],
  'sarı': ['sarı', 'altın', 'hardal', 'yellow', 'gold'],
  'mor': ['mor', 'lila', 'lavanta', 'eflatun', 'purple', 'violet', 'lilac', 'lavender'],
  'pembe': ['pembe', 'fuşya', 'fusya', 'pink', 'fuchsia', 'magenta'],
  'kahverengi': ['kahverengi', 'bej', 'krem', 'ekru', 'taba', 'brown', 'beige', 'cream', 'bronz', 'bronze', 'bakır', 'bakir', 'vizon', 'kum rengi', 'cocoa', 'chocolate', 'coffee'],
  'turuncu': ['turuncu', 'mercan', 'orange', 'somon', 'kiremit', 'yavruağzı', 'yavruagzi', 'coral', 'peach'],
  'mermer': ['mermer', 'marble'],
  'ahşap': ['ahşap', 'ahsap', 'wood'],
  'ipek': ['ipek', 'silk'],
};

/** İstenen rengin kabul edilebilir tonlarını (kendisi + aile üyeleri) döndürür. */
export function renkAilesi(renk) {
  const r = sadelestir(renk).trim();
  if (!r) return [];
  const aile = new Set([r]);
  for (const [ana, uyeler] of Object.entries(RENK_AILELERI)) {
    const hepsi = [ana, ...uyeler].map(x => sadelestir(x));
    if (hepsi.includes(r)) for (const x of hepsi) aile.add(x);
  }
  return [...aile];
}

/**
 * Kullanıcının cümlesinden renk niyetini çıkarır.
 * "açık gri PLA filament" → { metin:'açık gri', ana:'gri', ton:'açık', aile:[...] }
 * Renk belirtilmemişse null.
 */
export function extractColorIntent(text) {
  const ham = String(text || '');
  const renkler = [...new Set(extractColors(ham).map(c => COLOR_CANON[c] || c))];
  if (!renkler.length) return null;
  const ana = renkler[0];
  const sade = sadelestir(ham);
  // Ton belirteçleri: "açık gri", "koyu mavi", "pastel pembe"…
  const tonM = sade.match(/\b(acik|koyu|pastel)\s+(gri|mavi|yesil|pembe|kahverengi|mor|sari|kirmizi|lacivert|turkuaz|bej|antrasit)\b/);
  const TON_GOSTERIM = { acik: 'açık', koyu: 'koyu', pastel: 'pastel' };
  const tonGosterim = tonM ? TON_GOSTERIM[tonM[1]] || tonM[1] : null;
  const ton = tonM ? tonM[1] : null;

  // Kullanıcının yazdığı EN SPESİFİK renk yazımını bul ("açık gri" > "gri" > "eflatun").
  const kacis = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const eslesmeler = TR_COLORS
    .filter(c => new RegExp('(^|[\\s-])' + kacis(sadelestir(c)) + '($|[\\s-])').test(sade))
    .sort((a, b) => b.length - a.length);
  const yazim = eslesmeler[0] || ana;
  const metin = tonGosterim && !sadelestir(yazim).startsWith(ton) ? tonGosterim + ' ' + yazim : yazim;

  return { metin, ana, ton, tonGosterim, aile: renkAilesi(ana), renkler };
}

/**
 * Bir aday başlığının istenen renge uygunluğunu sınıflandırır.
 *  'tam'       → birebir ton ("açık gri" istendi, adayda "açık gri")
 *  'aile'      → aynı renk ailesi (gri istendi, aday "antrasit")
 *  'bilinmiyor'→ başlıkta renk yok (sayfa okununca doğrulanabilir)
 *  'farkli'    → başka bir renk (kırmızı vb.) — asla önerilmemeli
 */
export function adayRenkDurumu(baslik, niyet) {
  if (!niyet) return { durum: 'yok', renk: null };
  const renkler = [...new Set(extractColors(baslik).map(c => COLOR_CANON[c] || c))];
  if (!renkler.length) return { durum: 'bilinmiyor', renk: null };
  const sade = sadelestir(baslik);
  if (niyet.ton) {
    const tonlu = new RegExp('\\b' + niyet.ton + '\\s+' + sadelestir(niyet.ana) + '\\b');
    if (tonlu.test(sade)) return { durum: 'tam', renk: (niyet.tonGosterim || niyet.ton) + ' ' + niyet.ana };
  }
  const aile = new Set(niyet.aile);
  const eslesen = renkler.find(r => aile.has(sadelestir(r)));
  if (eslesen) return { durum: 'aile', renk: renkler[0] };
  return { durum: 'farkli', renk: renkler[0] };
}

/** Model kodunu karşılaştırılabilir hale getirir: büyük harf, yalnız harf-rakam. */
export function normalizeModelCode(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Barkod/EAN normalizasyonu. */
export function normalizeBarcode(s) {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

/**
 * Ürün sayfası HTML'inden ürünün KENDİ barkodunu çıkarır (2026-10-28).
 *
 * Barkod okuma özelliği için gerekli; bazı adaptörlerde `barcode: null` sabitti.
 * Kabul edilen alanlar (ürün verisinin kendi kimlik alanları — "ilgili ürünler"
 * bölümündeki barkodlar değil):
 *   JSON-LD: gtin, gtin8/12/13/14, barcode, ean
 *   n11:     defaultGtin, sku.gtin
 * Kontrol hanesi varsa doğrulanır; geçersizse null döner (yanlış barkod gösterme).
 *
 * @param {string} html
 * @returns {string|null} 8-14 haneli barkod ya da null
 */
export function barkodCikarHtml(html) {
  if (!html) return null;
  const desenler = [
    /"(?:gtin1[0-9]?|gtin)"\s*:\s*"?(\d{8,14})"?/i,        // gtin13/14, gtin
    /"(?:defaultGtin|barcode|ean)"\s*:\s*"?(\d{8,14})"?/i, // n11 defaultGtin, genel barcode/ean
    /barkod[^0-9]{0,30}(\d{8,14})/i,                       // "Barkod: 123..." metin biçimi
  ];
  for (const re of desenler) {
    const m = String(html).match(re);
    if (!m) continue;
    const aday = normalizeBarcode(m[1]);
    if (aday.length < 8 || aday.length > 14) continue;
    // Kontrol hanesi varsa doğrula (EAN-13/EAN-8); geçersizse bu eşleşmeyi atla
    if (aday.length === 13 && ean13GecerliMi(aday) === false) continue;
    return aday;
  }
  return null;
}

/** EAN-13 kontrol hanesi doğrulaması; yalnız 13 hane için anlamlı. */
function ean13GecerliMi(barkod) {
  const s = String(barkod || '');
  if (s.length !== 13 || !/^\d+$/.test(s)) return null;
  const r = s.split('').map(Number);
  const kontrol = r.pop();
  const toplam = r.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (toplam % 10)) % 10 === kontrol;
}

/** Başlık için anlamlı token'lar (marka, yaygın kelimeler ve RENKLER ayıklanır). */
const TITLE_STOPWORDS_TR = new Set([
  've', 'ile', 'için', 'icin', 'bir', 'the', 'and', 'for', 'with', 'usb', 'rgb', '7.1', '71',
  'oyuncu', 'kulaklık', 'kulakligi', 'kulaklığı', 'gaming', 'mikrofonlu', 'mikrofon', 'editions',
  'paket', 'set', 'yeni', 'orijinal', 'original', 'kutulu', 'profesyonel', 'surround', 'klavye',
  'mouse', 'notebook', 'laptop', 'pc', 'fiber', 'kablolu', 'kablosuz', 'fiyatları', 'fiyati',
  'tuş', 'tus', 'optik', 'dpi', 'mm', 'hz', 'ghz', 'editions', 'bas', 'mekanik', 'switch',
  // 3D baskı alanı: genel tür kelimeleri gürültüdür (ürün kimliği marka + seri + malzeme)
  'filament', 'yazıcı', 'yazici', 'printer', 'yazdırma', 'baskı',
]);

/** Karşılaştırma için Türkçe diakritikleri sadeleştirir (tuş=tus, aydınlatma=aydinlatma). */
export function sadelestir(s) {
  return toLowerTr(s).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

const SADE_COLORS = TR_COLORS.map(sadelestir);

export function titleTokens(title, brand, { stripColors = false } = {}) {
  let t = sadelestir(title)
    // Malzeme çizgisi normalizasyonu: "PLA+" = "PLA Plus" = "plaplus" (aynı ürün çizgisi)
    // "X PLA" = "xPLA": bazı satıcılar bitişik, bazıları ayrı yazar (2026-11-03).
    // Ürün HATTI kimliğini yine hatCakismasi denetler; burada yalnızca yazım farkı
    // token karşılaştırmasını bozmasın diye normalize edilir.
    .replace(/\bx\s+pla\b/g, 'xpla')
    .replace(/\b(pla|petg|abs|tpu|asa|pa|pc)\s*\+/g, '$1plus')
    .replace(/\b(pla|petg|abs|tpu|asa|pa|pc)\s+plus\b/g, '$1plus')
    // Ölçü normalizasyonu (2026-10-25): satıcılar aynı çapı farklı yazar —
    // "1.75mm", "1,75 mm", "175mm" aynı üründür. Virgül/nokta ve boşluk farkı
    // benzerliği yanlışlıkla düşürmesin diye tek token'a indirilir.
    .replace(/(\d+)[.,](\d+)\s*(mm|cm|mt)\b/g, '$1$2$3')
    .replace(/(\d)\s+(mm|cm|mt)\b/g, '$1$2')
    .replace(/(\d+)\s*(gb|tb|mb)\b/gi, (m, n, u) => n + u.toLowerCase())
    // Ağırlık/hacim eşdeğerliği: "1kg" = "1 kg" = "1000gr" = "1000 g" → gram
    .replace(/(\d+(?:[.,]\d+)?)\s*(kg|kgs)\b/g, (_, n) => String(Math.round(parseFloat(String(n).replace(',', '.')) * 1000)) + 'gr')
    .replace(/(\d+(?:[.,]\d+)?)\s*(gr|g)\b/g, (_, n) => String(Math.round(parseFloat(String(n).replace(',', '.')))) + 'gr')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter(w => w.length > 1);
  let stop = new Set([...TITLE_STOPWORDS_TR].map(sadelestir));
  const b = sadelestir(brand || '');
  for (const w of b.split(/\s+/)) if (w) stop.add(w);
  if (stripColors) {
    // Renk kelimeleri (Türkçe + İngilizce) benzerlik hesabından ayıklanır.
    // Çok kelimeli renkler ("açık gri", "rose gold") kelime bazında eklenir:
    // "Açık Gri" ile "Beton Gri" karşılaştırmasında "açık"/"beton" nüans
    // sözcükleri kalıntı bırakıp benzerliği yanlışlıkla düşürmesin.
    const renkler = new Set();
    for (const c of [...TR_COLORS, ...Object.keys(EN_TO_TR)]) {
      for (const w of sadelestir(c).split(/[\s-]+/)) if (w.length > 2) renkler.add(w);
    }
    for (const c of renkler) stop.add(c);
  }
  const out = t.filter(w => !stop.has(w));
  return new Set(out.length ? out : t);
}

/**
 * UYUMLULUK LİSTESİ TEMİZLİĞİ (2026-11-04)
 *
 * Ölçülen hata: borsada "Creality Ender PLA Gri 1kg" kartı Hepsiburada'daki
 * **"Sunlu PLA Filament 1kg – 1.75mm – Gri – 3D Yazıcı – Bambu Lab / Ender /
 * Prusa / Creality Uyumlu"** ilanına gidiyordu. İlanın GERÇEK markası Sunlu;
 * "Creality" yalnızca uyumluluk listesinde geçiyor. Marka kanıtı sayıldığı
 * için marka çelişkisi devre dışı kalıyordu.
 */
const UYUMLULUK_RE = /\b(uyumlu|uygun|compatible|compatibility|için|for)\b/i;

/**
 * Marka kanıtı için başlığı temizler: UYUMLULUK listelerini ("… / Creality
 * Uyumlu") ayıklar. Aksi hâlde başka markanın ilanı "marka başlıkta geçiyor"
 * diye kabul ediliyordu (2026-11-04 Sunlu ↔ Creality vakası).
 * @param {string} baslik
 * @returns {string} küçük harfe çevrilmiş, uyumluluk parçaları çıkarılmış metin
 */
export function markaKanitMetni(baslik) {
  const parcalar = String(baslik || '').split(/[–—|]|,\s|\s-\s/);
  const temiz = parcalar.filter(p => !UYUMLULUK_RE.test(p));
  return toLowerTr(temiz.length ? temiz.join(' ') : String(baslik || ''));
}

/** Jaccard benzerliği (0-1). renklerAyikla=true iken renk kelimeleri hesaba katılmaz. */

/** İki başlık arasındaki ortak token sayısını hesaplar. */
export function countTokenOverlap(a, b) {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let count = 0;
  for (const x of ta) if (tb.has(x)) count++;
  return count;
}

export function titleSimilarity(a, b, brandA, brandB, { stripColors = false } = {}) {
  const ta = titleTokens(a, brandA, { stripColors });
  const tb = titleTokens(b, brandB, { stripColors });
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** İki marka aynı mı? Tam eşitlik ya da kelime bazlı kapsama ("Beta Filament" ~ "Beta"). */
export function brandAyni(a, b) {  if (!a || !b) return false;
  const la = sadelestir(a).trim(), lb = sadelestir(b).trim();
  if (la === lb) return true;
  const wa = new Set(la.split(/\s+/)), wb = new Set(lb.split(/\s+/));
  if (wa.size === 0 || wb.size === 0) return false;
  const kucuk = wa.size <= wb.size ? wa : wb;
  const buyuk = wa.size <= wb.size ? wb : wa;
  for (const w of kucuk) if (!buyuk.has(w)) return false;
  return true;
}

/** Marka adındaki ayırt edici sözcükler ("Beta Filament" -> ["beta"]; "filament" genel kelimedir). */
export function brandWords(brand) {
  const stop = new Set([...TITLE_STOPWORDS_TR].map(sadelestir));
  return sadelestir(brand || '').split(/\s+/).filter(w => w.length >= 3 && !stop.has(w));
}

const MARKA_GENEL_SOZCUKLERI = new Set([
  'filament', 'yazici', 'yazıcı', 'printer', 'baski', 'baskı', 'set', 'paket',
  'adet', 'combo', 'model', 'seri', 'renk', 'pla', 'epla', 'xpla', 'hpla', 'pla+',
  'petg', 'abs', 'tpu', 'asa', 'pa', 'pc', 'resin', 'reçine', 'recine', '3d',
  'yeni', 'orijinal', 'original', 'plus', 'pro', 'max', 'mini', 'ultra', 'lite',
  'super', 'basic', 'matte', 'silk', 'hyper', 'rapid', 'tough', 'high', 'speed',
  'evo', 'meta', 'wood', 'marble', 'glossy', 'sparkle', 'glitter', 'transparent',
]);

/**
 * Marka alanı BOŞ/GEÇERSİZ olduğunda başlıktan "muhtemel marka"yı çıkarır.
 *
 * Ölçülen hata (2026-11-04): Trendyol kaynağında `brand` alanı boş geldiği için
 * "eSun PLA+ Kemik Beyazı" ile **"Filamix Kemik Beyazı PLA+"** aynı ürün sayıldı;
 * borsada eSun ürünü yerine Filamix ₺746,99 "en ucuz" gösterildi. Marka alanı
 * yoksa bile başlığın ilk anlamlı kelimesi marka kanıtı olarak kullanılır.
 *
 * @param {string} metin
 * @returns {string|null}
 */
export function muhtemelMarka(metin) {
  const kelimeler = sadelestir(metin || '')
    .replace(/[^a-z0-9\s+]/g, ' ').split(/\s+/).filter(Boolean);
  for (const w of kelimeler) {
    if (w.length < 3) continue;
    if (/^\d/.test(w)) continue;
    if (w.startsWith('plaplus') || w.startsWith('petg')) continue;
    if (MARKA_GENEL_SOZCUKLERI.has(w)) continue;
    if (extractColors(w).length) continue;
    return w;
  }
  return null;
}

/** Aksesuar / yedek parça sözcükleri — ana ürünle karıştırılmamalı.
 *  Çekim ekli biçimler ayrıca yazılır (boru/borusu, filtre/filtresi...). */
const AKSESUAR_KELIMELERI = [
  'filtre', 'filtresi', 'filtreli', 'yedek', 'parca', 'parcasi', 'baslik', 'basligi',
  'uc', 'ucu', 'adaptor', 'adaptoru', 'aparat', 'aparati', 'aksesuar', 'batarya',
  'bataryasi', 'kilif', 'kilifi', 'hortum', 'hortumu', 'boru', 'borusu', 'hazne',
  'haznesi', 'toz torbasi', 'torbasi', 'firca', 'fircasi', 'paspas', 'mop', 'kartus',
  'kartusu', 'nozzle', 'nozul', 'nozulu', 'hepa', 'tutucu', 'tutucusu', 'stand', 'standi', 'sarj aleti',
  'sarj kablosu', 'kablo', 'kablosu',
  // 3D Yazıcı & CNC yedek parça ve sarf malzemeleri
  'termistor', 'termistoru', 'termistorler',
  'silikon corap', 'silikon kilif', 'corap',
  'isitici blok', 'isitici bloku', 'isitici fisek', 'isitici',
  'hotend', 'hotend kit', 'heatblock', 'heatbreak', 'bogaz', 'bogaz borusu',
  'baski plakasi', 'pei tabla', 'pei plaka', 'cam tabla', 'yay celigi', 'tabla saci',
  'ekstruder', 'extruder', 'extruder dislisi',
  'kayis', 'gt2 kayis', 'kasnak', 'gergi',
  'step motor', 'step motoru',
  'anakart', 'anakarti', 'anakartlari', 'mainboard', 'mainboardu', 'motherboard', 'motherboardu',
  'kontrol karti', 'surucu', 'surucusu', 'step surucu', 'step driver', 'driver', 'driveri', 'tmc2208', 'tmc2209', 'pcb',
  'guc kaynagi', 'psu', 'power supply',
  'ekran', 'ekrani', 'ekran modulu', 'dokunmatik ekran', 'lcd', 'modul', 'modulu',
  'kamera', 'kamerasi', 'kasa kamerasi', 'anten', 'anteni',
  'arka panel', 'yan panel', 'on kapak', 'kapagi', 'baski kafasi', 'isitma tablasi',
  'fpc kablo', 'fpc kablosu', 'kayisi', 'disli', 'dislisi', 'kasnagi', 'rulman', 'rulmani', 'kaplin',
  'ekstruderi', 'extruderi', 'hotendi', 'hotend kiti',
  'bltouch', 'crtouch', 'cr touch', 'sensor', 'sensoru', 'prob', 'probu', 'filament sensoru',
  'fan', 'fani', 'fanlari', 'salyangoz fan', 'radyal fan', 'aksiyel fan', 'sogutucu blok', 'heatsink',
];

function aksesuarEslesmeleri(metin) {
  const t = sadelestir(metin || '');
  if (!t) return [];
  return AKSESUAR_KELIMELERI.filter(k => {
    const desen = new RegExp('(^|[^a-z0-9])' + k.replace(/\s+/g, '\\s+') + '($|[^a-z0-9])');
    return desen.test(t);
  });
}

/** Başlık elektronik/mekanik yedek parça veya aksesuar mı? */
export function parcaMi(baslik) {
  const t = sadelestir(baslik || '');
  if (!t) return false;
  if (aksesuarEslesmeleri(t).length > 0) return true;
  return /(^|[^a-z0-9])(uyumlu|uygun|icin)($|[^a-z0-9])/.test(t);
}

/**
 * Aday, kaynağın (veya tersi) yedek parçası/aksesuarı mı?
 * Elektronik/mekanik yedek parça asla tam yazıcı ile eşleştirilmez.
 */
function aksesuarUyusmazligi(kaynakBaslik, adayBaslik) {
  const kaynak = sadelestir(kaynakBaslik || '');
  const aday = sadelestir(adayBaslik || '');
  if (!kaynak || !aday) return false;

  const kaynakKelime = aksesuarEslesmeleri(kaynak);
  const adayKelime = aksesuarEslesmeleri(aday);
  if (adayKelime.length && !adayKelime.some(k => kaynakKelime.includes(k))) return true;
  if (kaynakKelime.length && !adayKelime.length) return true;

  // "uyumlu" / "için" kalıbı (kaynakta yoksa aday aksesuardır)
  const uyumKalibi = /(^|[^a-z0-9])(uyumlu|uygun|icin)($|[^a-z0-9])/;
  if (uyumKalibi.test(aday) && !uyumKalibi.test(kaynak)) return true;

  return false;
}

/**
 * Seri kodu çakışması: iki başlıkta da "harf+rakam" seri kodu varsa (V15, G102,
 * S24) ve hiçbiri ortak değilse farklı modeldir (Dyson V15 ↔ V12 gibi).
 */
function seriKoduCakismasi(a, b) {
  const bul = (t) => new Set(
    (sadelestir(t || '').match(/(^|[^a-z0-9])([a-z]\d{2,4})(?=$|[^a-z0-9])/g) || [])
      .map(x => x.replace(/[^a-z0-9]/g, ''))
  );
  const sa = bul(a), sb = bul(b);
  if (!sa.size || !sb.size) return false;
  for (const k of sa) if (sb.has(k)) return false; // ortak seri kodu var → aynı seri
  return true;
}

/** Ürün türü sözcükleri marka sanılmamalı: bazı siteler "marka" alanına ürün türünü
 *  yazıyor (Amazon'da "PLA", pazaryerlerinde satıcı adı). Bu değerler marka KANITI
 *  sayılmaz — "bilinmiyor" kabul edilir, aksi halde doğru ürünler elenir (2026-10-25). */
const GENEL_MARKA_SOZCUKLERI = new Set([
  'pla', 'petg', 'abs', 'tpu', 'asa', 'pa', 'pc', 'filament', 'filamentler', 'yazici', 'printer',
  '3d', 'baski', 'set', 'paket', 'adet', 'orijinal', 'original', 'yerli', 'ithal', 'genel',
]);

/**
 * ÜRÜN HATTI / MALZEME ÇAKIŞMASI (2026-11-03).
 *
 * Ölçülen gerçek hata: borsada "Porima PLA Siyah 1.75mm 1kg" kaydı, kaynak olarak
 * Trendyol'daki **xPLA** ilanını (400 TL) kullanıyordu ama Porima 3D'nin **düz PLA**
 * ürününü (612 TL) "en ucuz" olarak gösteriyordu. Benzer şekilde Silk / Premium /
 * Hyper hatları düz PLA ile karışıyordu (ölçüm: sim 0.75 / 0.50 / 0.33).
 *
 * Kural:
 *  - MALZEME farklıysa (PLA ↔ PETG/ABS/TPU/PC…) → farklı ürün.
 *  - ÜRÜN HATTI göstergesi (xPLA, Hyper, Silk, Premium, Matte, Wood…) iki tarafta
 *    da varsa ve kesişmiyorsa → farklı ürün. Yalnızca BİR tarafta varsa da farklı
 *    ürün sayılır: "Hyper PLA" ile "PLA" aynı şey değildir; pahalı hattı düz PLA
 *    fiyatıyla göstermek yanıltıcı olur (dürüstlük kuralı).
 *
 * 'eco' BİLİNÇLİ OLARAK DIŞARIDA: Porima xPLA'da "Eco" bir AMBALAJ seçeneğidir
 * ("Latte / Eco / 1.75mm - 1kg"), ürün hattı değil. Onu hat saymak xPLA
 * eşleşmelerini bozardı.
 */
const HAT_GOSTERGELERI = new Set([
  'xpla', 'hyper', 'silk', 'premium', 'matte', 'tough', 'wood', 'stone',
  'rainbow', 'army', 'smart', 'carbon', 'marble', 'metallic', 'glow', 'galaxy',
  'star', 'simli', 'ahs', 'pearl',
]);

/**
 * Malzeme tabanlı ALT HATLAR (2026-11-04).
 *
 * Ölçülen iki hata (kaynak arama yanlış ürünü seçiyordu):
 *   - "Porima PLA Filament Siyah 1kg" → kaynak "Porima **PLA-CF** Siyah" (karbon
 *     fiber katkılı; fiyatı düz PLA'nın 2 katı, fiyat kıyaslanamaz).
 *   - "eSun PLA+ Beyaz 1kg" → kaynak "eSun Beyaz **PLA+HS**" (High Speed).
 * Tokenizer "PLA+HS"i "plaplushs", "PLA-CF"i "pla cf" üretir; bu yüzden yalnızca
 * kelime sözlüğü yetmiyor, malzeme tabanına bitişik ekleri de yakalamak gerek.
 */
const ALT_HAT_EKLERI = ['hs', 'cf', 'lw', 'esd'];

/** "plaplushs" / "pla hs" / "pla-cf" gibi yazımlardan alt hat çıkarır. */
function altHatEkle(hat, kelimeler, i) {
  const w = kelimeler[i] || '';
  const onceki = kelimeler[i - 1] || '';
  // "ePLA-HS" (eSun) da PLA tabanlıdır; tek harf öneki tolere edilir.
  const malzemeTabanli = /^(e?pla|petg|abs|tpu|asa|pa|pc)/.test(w);
  const oncekiMalzeme = /^(e?pla|petg|abs|tpu|asa|pa|pc)/.test(onceki);
  // "High Speed" yazımı da HS'dir.
  if (w === 'speed' && onceki === 'high') hat.add('alt:hs');
  for (const ek of ALT_HAT_EKLERI) {
    // Bitişik yazım: "plaplushs", "placf", "petglw"
    if (malzemeTabanli && w.length > ek.length + 2 && w.endsWith(ek)) {
      hat.add(`alt:${ek}`);
    }
    // Ayrı yazım: "pla hs", "plaplus hs", "petg cf"
    if (w === ek && oncekiMalzeme) hat.add(`alt:${ek}`);
  }
}

const MALZEME_GOSTERGELERI = new Set([
  'pla', 'petg', 'abs', 'tpu', 'asa', 'pc', 'pa', 'nylon', 'pet', 'pva', 'hips',
  'reçine', 'resin', 'policarbonat',
]);

/** Başlıktan ürün hattı ve malzeme göstergelerini çıkarır. */
function hatGostergeleri(baslik) {
  // 2026-11-04: "PLA+" işareti sadelestirmede KAYBOLUYORDU ('pla +' → 'pla'),
  // bu yüzden "Sunlu PLA+" ile "Sunlu PLA" ayırt edilemiyordu ve düz PLA,
  // PLA+ ürününün fiyatı gibi gösteriliyordu. Artık '+' korunur.
  const normalize = sadelestir(baslik || '')
    .replace(/\b(pla|petg|abs|tpu|asa|pa|pc)\s*\+/g, '$1plus');
  const t = ' ' + normalize.replace(/[^a-z0-9çğıöşü\s]/gi, ' ').replace(/\s+/g, ' ') + ' ';
  const kelimeler = t.trim().split(' ').filter(Boolean);
  const hat = new Set();
  const malzeme = new Set();
  for (let i = 0; i < kelimeler.length; i++) {
    const w = kelimeler[i];
    if (HAT_GOSTERGELERI.has(w)) hat.add(w);
    if (MALZEME_GOSTERGELERI.has(w)) malzeme.add(w);
    // "PLA+" → "plaplus" (bitişik yazım: "PLA+HS" → "plaplushs")
    if (w.startsWith('plaplus')) hat.add('plaplus');
    // Ayrı yazım: "PLA Plus"
    if (w === 'plus' && (kelimeler[i - 1] === 'pla' || kelimeler[i - 1] === 'petg')) {
      hat.add('plaplus');
    }
    // "Porima X Pla Siyah" → hat: xpla
    if (w === 'x' && kelimeler[i + 1] === 'pla') hat.add('xpla');
    // "Eco PLA" BİTİŞİK yazımı ürün hattıdır ("Porima Eco PLA Filament").
    // Tek başına "Eco" ("Latte / Eco / 1.75mm - 1kg") ise AMBALAJ seçeneğidir;
    // hat sayılırsa xPLA eşleşmeleri bozulur (2026-11-03).
    if ((w === 'eco' && kelimeler[i + 1] === 'pla') || (w === 'pla' && kelimeler[i + 1] === 'eco')) {
      hat.add('ecopla');
    }
    // PLA+HS / PLA-CF gibi alt hatlar (2026-11-04)
    altHatEkle(hat, kelimeler, i);
  }
  return { hat, malzeme };
}

/**
 * İki başlık farklı ürün hattı/malzemede mi?
 * Kanıt yoksa (iki tarafta da gösterge yok) false döner — engelleme yapılmaz.
 */
export function hatCakismasi(a, b) {
  const A = hatGostergeleri(a);
  const B = hatGostergeleri(b);

  if (A.malzeme.size && B.malzeme.size) {
    let ortak = false;
    for (const m of A.malzeme) if (B.malzeme.has(m)) { ortak = true; break; }
    if (!ortak) return true;
  }

  // 2026-11-04: "PLA+" ile "PLA" AYRI kıyaslanır. Önceden tüm hatlar tek kümede
  // olduğu için "Sunlu PLA+" ile "Sunlu Silk PLA+" ortak "plaplus" sayesinde
  // eşleşiyordu (silk görmezden geliniyordu). Artık boyutlar ayrı:
  //   1) ürün hattı (xpla/hyper/silk/premium/matte…)  2) PLA+  3) alt hat (HS/CF)
  const cizgiA = [...A.hat].filter(h => !h.startsWith('alt:') && h !== 'plaplus');
  const cizgiB = [...B.hat].filter(h => !h.startsWith('alt:') && h !== 'plaplus');
  if (cizgiA.length || cizgiB.length) {
    let ortak = false;
    for (const h of cizgiA) if (cizgiB.includes(h)) { ortak = true; break; }
    if (!ortak) return true;
  }

  // PLA+ bir ÜRÜN ÇİZGİSİDİR: bir tarafta varsa diğerinde de olmalı.
  if (A.hat.has('plaplus') !== B.hat.has('plaplus')) return true;

  // ALT HAT: PLA+HS / PLA-CF ayrı kıyaslanır (PLA+ ile PLA+HS aynı değildir).
  const altA = [...A.hat].filter(h => h.startsWith('alt:'));
  const altB = [...B.hat].filter(h => h.startsWith('alt:'));
  if (altA.length || altB.length) {
    let ortakAlt = false;
    for (const h of altA) if (altB.includes(h)) { ortakAlt = true; break; }
    if (!ortakAlt) return true;
  }

  return false;
}

/**
 * MODEL SERİSİ ÇAKIŞMASI (2026-11-03).
 *
 * Ölçülen hata: "Creality K1 Max 3d Yazıcı" ile "Creality Ender 5 Max 3D Yazıcı"
 * aynı marka + ortak "Max" kelimesi sayesinde %60+ benzerlikle EŞLEŞTİ. Bu yanlış
 * ürün, doğru ürün (K1 Max 2025) YZ tarafından reddedilince "en ucuz" yerine geçti.
 *
 * Kural: iki başlıkta da MODEL GÖSTERGESİ varsa (K1, P1S, A1, S24, "Ender 5")
 * ve hiçbiri ortak değilse ürünler farklıdır. Gösterge yoksa kanıt üretilmez.
 */
const OLCU_KELIMELERI = new Set([
  'pla', 'petg', 'abs', 'tpu', 'asa', 'pc', 'pa', 'mm', 'cm', 'mt', 'm', 'kg', 'gr', 'g',
  'ml', 'lt', 'l', 'w', 'v', 'a', 'mah', 'hz', 'ghz', 'dpi', 'adet', 'li', 'lu', 'x', 'boy',
]);

/** Model serisi sayılmaması gereken ürün türü sözcükleri ("Filament 1", "Set 2"). */
const URUN_TURU_KELIMELERI = new Set([
  'filament', 'yazici', 'printer', 'baski', 'set', 'paket', 'adet', 'combo', 'model', 'seri', 'renk',
]);

/** Varyant sözcükleri ("Max 3") model serisi sayılmaz — bunlar kritikVaryantCakismasi'nda. */
const VARYANT_KELIMELERI = new Set([
  'pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'super', 'fe', 'se', 'ti', 'fold', 'flip',
]);

function modelSerisi(baslik) {
  const t = sadelestir(baslik || '').replace(/[^a-z0-9\s]/g, ' ');
  const set = new Set();
  for (const m of t.matchAll(/\b([a-z]{1,4}\d{1,4}[a-z]?)\b/g)) {
    const k = m[1];
    if (/^\d/.test(k)) continue;
    if (OLCU_KELIMELERI.has(k)) continue;
    // RAL9005 / PANTONE 186 gibi RENK KODLARI model değildir (2026-11-04).
    // Bir mağaza kodu yazar, diğeri yazmaz; model serisi sayılırsa aynı ürün
    // "farklı model" diye reddediliyordu.
    if (/^ral\d{3,4}$/.test(k) || /^pantone\d*$/.test(k)) continue;
    set.add(k);
  }
  // Kelime + sayı çifti yalnızca ÖLÇÜ BİRİMİ TAKİP ETMİYORSA model göstergesidir.
  // ("Ender 5" ✓ · "Filament 1.75mm" ✗ · "Gri 1.75 mm" ✗ · "1 kg" ✗)
  // Sayıdan hemen sonra HARF/RAKAM geliyorsa ("Max 3d" → "3"+"d") sayı tek başına
  // model numarası değildir; "Ender 5 Max" ise gerçek model göstergesidir.
  for (const m of t.matchAll(/\b([a-z]{3,12})\s+(\d{1,3})(?![a-z0-9])(?!\s*(?:mm|cm|mt|m|kg|gr|g|ml|lt|l|gb|tb|mb|mah|ah|w|v|a|hz|ghz|dpi)\b)/g)) {
    const kelime = m[1];
    if (OLCU_KELIMELERI.has(kelime)) continue;
    if (OLCU_KELIMELERI.has(m[2])) continue;
    if (URUN_TURU_KELIMELERI.has(kelime)) continue;
    if (VARYANT_KELIMELERI.has(kelime)) continue;
    set.add(kelime + ' ' + m[2]);
  }
  // HARF SONEKLİ MODEL: "Kobra X", "iPhone X", "Ender Z".
  // Ölçülen hata (2026-11-04): "Anycubic Kobra 2 Neo" kataloğu, aramada
  // Trendyol'un **"Anycubic Kobra X"** ilanını kaynak seçiyordu. Kaynak başlığı
  // "Kobra X" olunca "Kobra 4" adayı da eşleşiyordu (ikisinde de model numarası
  // yok, ortak "anycubic/kobra" kelimeleri yetiyordu). Tek harfli sonek burada
  // model göstergesi sayılır; yalnızca x/y/z kabul edilir (Türkçe "ve", "ile"
  // gibi kısa kelimeler ve "3D" yanlış yakalanmasın).
  for (const m of t.matchAll(/\b([a-z]{3,12})\s+([xyz])\b/g)) {
    const kelime = m[1];
    if (OLCU_KELIMELERI.has(kelime)) continue;
    if (URUN_TURU_KELIMELERI.has(kelime)) continue;
    if (VARYANT_KELIMELERI.has(kelime)) continue;
    set.add(kelime + ' ' + m[2]);
  }
  return set;
}

export function modelSerisiCakismasi(a, b) {
  const sa = modelSerisi(a);
  const sb = modelSerisi(b);
  if (!sa.size || !sb.size) return false;
  for (const k of sa) if (sb.has(k)) return false;
  return true;
}

/**
 * KAPASİTE ÇAKIŞMASI (2026-11-03): 8GB ↔ 16GB, 128GB ↔ 256GB, 5000mAh ↔ 10000mAh.
 * Bunlar farklı üründür; benzerlik yüksek olduğu için (aynı marka/seri) eskiden
 * birleşiyorlardı. Gramaj/hacim miktarCakismasi'nda; burada dijital/güç birimleri.
 */
// Birimleri ORTAK TABANA çevir (500GB ↔ 1TB de yakalanır):
//   GB/TB/MB → GB · mAh/Ah → mAh · Hz/GHz → Hz · W → W
const KAPASITE_TABANI = {
  gb: ['gb', 1], tb: ['gb', 1024], mb: ['gb', 1 / 1024],
  mah: ['mah', 1], ah: ['mah', 1000],
  hz: ['hz', 1], ghz: ['hz', 1e9],
  w: ['w', 1],
};

function kapasiteler(baslik) {
  const t = sadelestir(baslik || '').replace(/,/g, '.');
  const harita = new Map();
  for (const m of t.matchAll(/\b(\d+(?:\.\d+)?)\s*(gb|tb|mb|mah|ah|w|hz|ghz)\b/g)) {
    const deger = parseFloat(m[1]);
    const taban = KAPASITE_TABANI[m[2]];
    if (!Number.isFinite(deger) || !taban) continue;
    const [birim, carpan] = taban;
    if (!harita.has(birim)) harita.set(birim, new Set());
    harita.get(birim).add(Math.round(deger * carpan * 1000) / 1000);
  }
  return harita;
}

export function kapasiteCakismasi(a, b) {
  const ka = kapasiteler(a);
  const kb = kapasiteler(b);
  if (!ka.size || !kb.size) return false;
  for (const [birim, degerlerA] of ka) {
    const degerlerB = kb.get(birim);
    if (!degerlerB) continue;
    let ortak = false;
    for (const v of degerlerA) if (degerlerB.has(v)) { ortak = true; break; }
    if (!ortak) return true;
  }
  return false;
}

/** Marka alanı gerçekten marka mı? (boş ya da ürün türü ise kullanılmaz) */
function markaGecerliMi(m) {
  if (!m) return false;
  const s = sadelestir(m).trim();
  if (!s) return false;
  if (GENEL_MARKA_SOZCUKLERI.has(s)) return false;
  // Yalnızca tek bir ürün türü sözcüğünden oluşan çok kelimeli değerler de marka değildir
  const kelimeler = s.split(/\s+/).filter(Boolean);
  if (kelimeler.length && kelimeler.every(w => GENEL_MARKA_SOZCUKLERI.has(w))) return false;
  return true;
}

/**
 * Verilen marka değeri mağazanın KENDİ adı mı?
 * Shopify `vendor` alanında pek çok satıcı ürün markası yerine kendi mağaza adını
 * yazar (ör. `filamenthane` mağazası "eSUN PLA+" ürününde `vendor: "Filamenthane"`).
 */
export function magazaAdiMarkaMi(marka, siteId, siteName) {
  const m = sadelestir(marka || '').replace(/\s+/g, '');
  if (!m || m.length < 3) return false;
  for (const aday of [siteId, siteName]) {
    const s = sadelestir(aday || '').replace(/\s+/g, '');
    if (!s || s.length < 3) continue;
    if (m === s) return true;
    if (Math.min(m.length, s.length) >= 4 && (m.includes(s) || s.includes(m))) return true;
  }
  return false;
}

/**
 * Satıcı adı marka alanına sızdıysa (Filamenthane + "eSUN PLA+"), başlıktaki
 * gerçek üretici markasını çıkarır; kendi markalı mağazada (Porima 3D + "Porima PLA")
 * ise markayı korur.
 */
export function gercekMarkaBul(rawBrand, rawTitle, siteId = null, siteName = null) {
  const b = String(rawBrand || '').trim();
  const title = String(rawTitle || '').trim();
  if (!b) return muhtemelMarka(title) || null;
  if (!magazaAdiMarkaMi(b, siteId, siteName)) return b;

  // Başlık mağaza adıyla başlıyorsa önce onu soyup gerçek marka token'ını ara.
  let temizBaslik = title;
  const bEsc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  temizBaslik = temizBaslik.replace(new RegExp(`^${bEsc}[\\s\\-–—:|]+`, 'i'), '').trim();
  const tahmin = muhtemelMarka(temizBaslik);
  if (tahmin && !magazaAdiMarkaMi(tahmin, siteId, siteName)) {
    const orijinalKelime = temizBaslik.split(/\s+/).find(w => sadelestir(w) === tahmin);
    return orijinalKelime || tahmin;
  }
  // Başlıkta gerçekten kendi markası geçiyorsa (Porima3D + "Porima PLA") koru;
  // aksi halde satıcı adını marka sanma → null dön.
  return title && sadelestir(title).includes(sadelestir(b)) ? b : null;
}

/**
 * Aynı ürün mü?
 * Öncelik sırası (kullanıcı kuralı): 1) model kodu 2) barkod 3) başlık benzerliği.
 * Renk kelimeleri benzerlik hesabından ayıklanır; farklı renkli aynı model "aynı ürün" sayılır
 * (renk farkı ayrıca işaretlenir).
 * @returns {null | {eslesme:'model_kodu'|'barkod'|'benzerlik', skor:number}} null => aynı ürün değil
 */
/**
 * Kritik model varyantlarÄ±: "Pro", "Ultra", "Max", "Plus", "Ti", "Super" gibi
 * takÄ±lar baÅŸlÄ±kta uyuÅŸmuyorsa (biri Pro, diÄŸeri dÃ¼z) kesinlikle farklÄ± modeldir.
 */
const KRITIK_VARYANTLAR = [
  'pro max', 'pro', 'plus', 'ultra', 'mini', 'ti', 'super', 'max', 'fe', 'lite', 'se', 'ke', 'fold', 'flip', 'combo'
];

export function varyantBul(baslik) {
  const b = ' ' + sadelestir(baslik || '').replace(/[^a-z0-9]/g, ' ') + ' ';
  const bulunanlar = new Set();
  for (const v of KRITIK_VARYANTLAR) {
    if (b.includes(' ' + v + ' ')) bulunanlar.add(v);
  }
  if (bulunanlar.has('pro max')) {
    bulunanlar.delete('pro');
    bulunanlar.delete('max');
  }
  return bulunanlar;
}

export function kritikVaryantCakismasi(a, b) {
  const va = varyantBul(a);
  const vb = varyantBul(b);
  if (va.size === 0 && vb.size === 0) return false;
  if (va.size !== vb.size) return true; // Biri varyantlÄ± (Ã¶rn. Pro), diÄŸeri dÃ¼z
  for (const item of va) {
    if (!vb.has(item)) return true;
  }
  return false;
}

/**
 * YIL / SÜRÜM / EDİSYON EKİ (2026-11-03).
 *
 * Ölçülen gerçek hata: kaynak "Creality K1 Max 3d Yazıcı", aday
 * "Creality K1 Max 2025 3D Yazıcı". Başlıklar yalnızca "2025" ile ayrıştığı
 * hâlde YZ "sürüm/yıl farkı" diyerek AYNI ürünü reddetti; ardından daha düşük
 * benzerlikli YANLIŞ ürün ("Ender 5 Max") eşleşti ve en ucuz teklif kaybedildi
 * (fixx3d 36.245 TL görünmedi).
 *
 * Bu ekler ürün kimliğini DEĞİŞTİRMEZ: pazaryerleri/yeniden satıcılar yeni
 * partiyi "2025", "yeni sürüm", "v2", "2. nesil" gibi etiketlerle ayırır.
 * Kapasite (128GB), varyant (Pro/Ultra) ve miktar (800gr) KORUNUR — onlar
 * gerçekten farklı üründür.
 */
const YIL_EDISYON_RE = /\b(20[2-3]\d)\b|\b(yeni\s+surum|yeni\s+versiyon|new\s+version|revizyon\s*\d|rev\s*\d|v\d{1,2}|\d{1,2}\s*\.?\s*nesil|\d{1,2}(?:st|nd|rd|th)\s+gen(?:eration)?|gen\s*\d{1,2})\b/g;

/** Başlıktan yıl/sürüm/edisyon eklerini atar (kimlik karşılaştırması için). */
export function yilEdisyonTemizle(baslik) {
  return sadelestir(baslik || '').replace(YIL_EDISYON_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * İki başlık YALNIZCA yıl/sürüm/edisyon ekiyle ayrışıyor mu?
 * Evet ise ürün aynıdır; YZ'ye sormaya gerek yok (deterministik karar).
 */
export function yilEdisyonAyniMi(a, b) {
  const hamA = sadelestir(a || '').replace(/\s+/g, ' ').trim();
  const hamB = sadelestir(b || '').replace(/\s+/g, ' ').trim();
  const ta = yilEdisyonTemizle(a);
  const tb = yilEdisyonTemizle(b);
  if (!ta || !tb) return false;

  // Ekler atıldıktan sonra BİREBİR aynı → aynı ürün.
  if (ta === tb) return true;

  // KAPSAMA dalı (2026-11-03 sıkılaştırma): "biri diğerini kapsıyor" yalnızca
  // GERÇEKTEN bir yıl/sürüm eki atıldıysa kabul edilir. Aksi hâlde kısa başlıklar
  // ("Porima PLA Filament") her uzun Porima başlığıyla eşleşirdi.
  const ekAtildi = ta !== hamA || tb !== hamB;
  if (!ekAtildi) return false;

  const kelA = new Set(ta.split(' ').filter(Boolean));
  const kelB = new Set(tb.split(' ').filter(Boolean));
  if (!kelA.size || !kelB.size) return false;
  // En az 3 anlamlı kelime şartı (2 kelimelik jenerik başlıklar kanıt sayılmaz).
  if (Math.min(kelA.size, kelB.size) < 3) return false;
  let ortak = 0;
  for (const w of kelA) if (kelB.has(w)) ortak++;
  return ortak / Math.min(kelA.size, kelB.size) >= 0.9;
}

export function matchProducts(src, cand) {
  // Aksesuar/yedek parça koruması: aday başlığı aksesuar sözcüğü içeriyor ama kaynak
  // içermiyorsa AYNI ÜRÜN DEĞİLDİR (ör. Dyson V15 süpürge ↔ "V15 için filtre").
  if (aksesuarUyusmazligi(src.title, cand.title)) return null;
  // Farklı seri numarası (V15 ↔ V12) → farklı model.
  if (seriKoduCakismasi(src.title, cand.title)) return null;
  // Kritik varyant Ã§akÄ±ÅŸmasÄ± (iPhone 15 vs iPhone 15 Pro, S24 vs S24 Ultra) -> KESÄ°N RED
  if (kritikVaryantCakismasi(src.title, cand.title)) return null;
  // Farklı ÜRÜN HATTI / MALZEME (xPLA ↔ PLA, PLA ↔ PETG) -> KESİN RED (2026-11-03)
  if (hatCakismasi(src.title, cand.title)) return null;
  // Farklı MODEL SERİSİ (K1 Max ↔ Ender 5 Max) ve KAPASİTE (8GB ↔ 16GB) -> KESİN RED.
  // ANCAK barkod ya da model kodu BİREBİR eşleşiyorsa bunlar devre dışıdır: kesin
  // kimlik başlıktan daha güçlüdür (2026-11-03).
  {
    const _sb = normalizeBarcode(src.barcode);
    const _cb = normalizeBarcode(cand.barcode);
    const _sm = normalizeModelCode(src.modelCode);
    const _cm = normalizeModelCode(cand.modelCode);
    const kesinKimlik = !!(_sb && _cb && _sb === _cb) || !!(_sm && _cm && _sm === _cm);
    if (!kesinKimlik && modelSerisiCakismasi(src.title, cand.title)) return null;
    if (!kesinKimlik && kapasiteCakismasi(src.title, cand.title)) return null;
  }

  // NET MİKTAR (gramaj) koruması — 2026-10-29 "sahte ucuz" düzeltmesi.
  //
  // Ölçülen gerçek hata: "Beta ABS Plus Gri Filament 1.75mm 1Kg" ile
  // "... 800gr" %66 benzerlikle AYNI ÜRÜN sayılıyordu. Sonuç: 449 TL'lik 800 g
  // makara, 549 TL'lik 1 kg'lık ürünün yerine "EN UCUZ" etiketi alıyordu —
  // birim fiyatı 561,25 ₺/kg (549,00 ₺/kg'dan PAHALI) olduğu hâlde.
  //
  // Kural: iki tarafta da güvenilir miktar varsa ve ±%2'den fazla farklıysa RED.
  // Biri bilinmiyorsa kanıt yok → engelleme yok (yanlış negatif üretmemek için).
  if (miktarCakismasi(src.title, cand.title).cakisma) return null;

  const sm = normalizeModelCode(src.modelCode);
  const cm = normalizeModelCode(cand.modelCode);
  // 1) Barkod (EAN) evrenseldir; model kodu çelişse bile en güçlü eşleşmedir.
  const sb = normalizeBarcode(src.barcode);
  const cb = normalizeBarcode(cand.barcode);
  if (sb && cb && sb === cb) return { eslesme: 'barkod', skor: 1 };

  // Marka alanı "PLA"/satıcı adı gibi anlamsız değerler taşıyorsa kanıt sayılmaz.
  // 2026-11-04: marka alanı BOŞSA başlıktan çıkarılır — aksi hâlde eSun kaynağı
  // ile Filamix ilanı "marka bilinmiyor" sayılıp eşleşiyordu. Alan DOLU ama
  // anlamsızsa (ör. Amazon'da "PLA") eskisi gibi kanıt üretmez: başlıktan marka
  // tahmini yalnızca alan gerçekten boşken yapılır (yanlış "basic" tahminini önler).
  const markaAlaniBos = (m) => m == null || String(m).trim() === '';
  // Başlığın İLK sözcüğü açıkça bir marka adıysa (jenerik "PLA", "3D", renk, ölçü değil)
  // ve iki ürünün başlangıç markaları FARKLI olup aday kaynak markasını hiç taşımıyorsa
  // satıcının hatalı brand/vendor alanına güvenilmez (ör. "Porima Eco PLA" ↔ "Robo90 Gri Eco PLA").
  const ilkMarkaKelimesi = (metin) => {
    const ilk = sadelestir(metin || '').replace(/[^a-z0-9\s+]/g, ' ').trim().split(/\s+/)[0] || '';
    if (ilk.length < 3 || /^\d/.test(ilk)) return null;
    if (ilk.startsWith('plaplus') || ilk.startsWith('petg') || MARKA_GENEL_SOZCUKLERI.has(ilk)) return null;
    if (extractColors(ilk).length) return null;
    return ilk;
  };
  const sIlkMarka = ilkMarkaKelimesi(src.title);
  const cIlkMarka = ilkMarkaKelimesi(cand.title);
  if (sIlkMarka && cIlkMarka && !brandAyni(sIlkMarka, cIlkMarka)) {
    const basC = markaKanitMetni(cand.title);
    const basS = markaKanitMetni(src.title);
    const karsilikliGeciyor = basC.includes(sIlkMarka) || basS.includes(cIlkMarka);
    if (!karsilikliGeciyor && !(normalizeBarcode(src.barcode) && normalizeBarcode(cand.barcode) && normalizeBarcode(src.barcode) === normalizeBarcode(cand.barcode))) {
      return null;
    }
  }
  const sMarka = markaGecerliMi(src.brand)
    ? src.brand
    : (markaAlaniBos(src.brand) ? muhtemelMarka(src.title) : null);
  const cMarka = markaGecerliMi(cand.brand)
    ? cand.brand
    : (markaAlaniBos(cand.brand) ? muhtemelMarka(cand.title) : null);
  const sim = titleSimilarity(src.title, cand.title, sMarka, cMarka, { stripColors: true });
  // Marka kelimeleri ÇIKARILMADAN benzerlik. Marka farklıysa bu değer kullanılır;
  // aksi hâlde marka adları silindiği için alakasız iki marka "birebir" görünür
  // (ölçüm: "eSun ... Kemik Beyazı" ↔ "Filamix ... Kemik Beyazı" → sim 1.0).
  const simHam = titleSimilarity(src.title, cand.title, null, null, { stripColors: true });
  const brandsOk = brandAyni(sMarka, cMarka);
  // Marka BİLİNMİYOR ≠ marka FARKLI. Kaynağın (ya da adayın) markası okunamadıysa
  // marka karşılaştırması kanıt üretmez; kararı başlık benzerliği verir.
  // 2026-10-25 hatası: robitshop markası okunamadığı için (src.brand=null) SAMM'daki
  // %75 benzerlikli AYNI ürün "marka tutmuyor" diye eleniyordu.
  const brandBilinmiyor = !sMarka || !cMarka;
  // Kapsama: kaynağın TÜM anahtar kelimeleri aday başlığında geçiyor mu?
  // (Özlü başlıklar — ör. "Beta PLA+ Filament White" — Jaccard'ı düşürür ama
  // kimliklerinin tamamı adayda geçiyorsa güçlü sinyaldir.)
  const kapsama = (() => {
    const ta = titleTokens(src.title, sMarka, { stripColors: true });
    const tb = titleTokens(cand.title, cMarka, { stripColors: true });
    if (!ta.size || !tb.size) return false;
    for (const w of ta) if (!tb.has(w)) return false;
    return true;
  })();
  // Kimlik kapsaması: ölçü/paket dışı ayırt edici kelimelerin TAMAMI adayda var mı?
  // Marka karşılaştırması kanıt üretmediğinde (marka yok/farklı) benzerlik tek başına
  // yetmez — aksi halde "PolyTerra PLA Fosil Gri", "Esun PLA Basic ..." ile 0.60
  // benzerliğe ulaşıp yanlış eşleşiyordu (2026-10-25). Ölçü token'ları (175mm, 1000gr)
  // paket farkıdır; bu kontrol onları yok sayar ama "basic"/"matte"/"hyper" gibi
  // ürün çizgisi kelimelerini şart koşar.
  const olcuMu = (w) => /^\d+(mm|cm|mt|gr|kg|ml|lt|w|v|a|mah|hz|ghz|dpi)?$/.test(w);
  // RENK kelimeleri kimlik kanıtı DEĞİLDİR (renk farkı ayrıca işaretlenir). Bazı
  // renkler ('ten', 'naturel') stripColors listesinde olmadığı için token'lar renk
  // taşıyabiliyordu; sonuç: rengi yazmayan mağaza ('Porima PLA Filament - 1Kg')
  // yanlışlıkla 'kimlik eksik' sayılıyordu (2026-11-03).
  const renkTokenleri = new Set();
  for (const t of [src.title, cand.title]) {
    for (const c of extractColors(t || '')) {
      for (const w of sadelestir(c).split(/\s+/).filter(Boolean)) renkTokenleri.add(w);
    }
  }
  // RAL9003 / PANTONE gibi RENK KODLARI kimlik kanıtı değil (aynı ürünün bir
  // sitesi kodu yazar, diğeri yazmaz → 2026-11-03 Porima Beyaz vakası).
  const renkKoduMu = (w) => /^ral\d{3,4}$/.test(w) || /^pantone\d*$/.test(w);
  const anlamli = (w) => !olcuMu(w) && !renkTokenleri.has(w) && !renkKoduMu(w);
  const kimlikKapsama = (() => {
    const ta = [...titleTokens(src.title, sMarka, { stripColors: true })].filter(anlamli);
    const tb = titleTokens(cand.title, cMarka, { stripColors: true });
    if (!ta.length) return true; // kaynakta ayırt edici kelime yok → kanıt üretemez
    return ta.every(w => tb.has(w));
  })();

  if (sm && cm) {
    if (sm === cm) return { eslesme: 'model_kodu', skor: 1 };
    if (sm.length >= 4 && cm.length >= 4 && (sm.includes(cm) || cm.includes(sm))) return { eslesme: 'model_kodu', skor: 0.9 };
    // Kodlar farklı: siteler aynı ürün için farklı kimlik türü yayımlar (model adı "G102" ya da
    // parça numarası "910-005823"). Kaynak kodu adayın başlığında YA DA aday kodu kaynağın
    // başlığında geçiyorsa benzerlik testine devam edilir.
    const crossRef = normalizeModelCode(cand.title || '').includes(sm) || normalizeModelCode(src.title || '').includes(cm);
    if (!crossRef) {
      // Kodlar çapraz referans da içermiyorsa: küçük mağazalar aynı ürün için kendi
      // SKU'larını "model kodu" olarak yazar. Karar kuralı:
      //  - marka AYNI → orta benzerlik (ya da tam kapsama) yeterli
      //  - marka BİLİNMİYOR → kimlik kapsaması + orta benzerlik; ya da çok yüksek benzerlik
      //  - marka FARKLI → kimlik kapsaması + yüksek benzerlik; ya da neredeyse birebir başlık
      //    (pazaryerlerinde "marka" alanı satıcı adı olabiliyor: pttavm'deki
      //    "Esun Açık Gri PLA Basic" ürününün markası "Urhanshop" yazıyordu — 2026-10-25)
      // MARKA ÇELİŞKİSİ (2026-11-03): iki marka da BİLİNİYOR ve FARKLI ise, marka
      // adı başlıklarda geçmiyorsa gevşek eşik KULLANILMAZ. Ölçülen hata:
      // "Porima PLA Filament Ten 1kg" ile "FilenTa Ten Rengi PLA Premium Filament
      // 1.75mm 1kg" %66 benzerlikle eşleşiyordu (ortak jenerik kelimeler: pla,
      // filament, ten) ve yanlış mağaza "en ucuz" görünüyordu.
      // Pazaryeri kuralı korunur: "marka" alanı satıcı adı olabiliyor (pttavm'de
      // Ürün markası "Urhanshop" yazıyor) — o durumda GERÇEK marka başlıkta geçer.
      const markaBaslikta = (() => {
        const kaynakMarka = brandWords(sMarka);
        const adayMarka = brandWords(cMarka);
        // Uyumluluk listeleri ("… / Creality Uyumlu") marka kanıtı DEĞİLDİR.
        const basC = markaKanitMetni(cand.title);
        const basS = markaKanitMetni(src.title);
        return kaynakMarka.some(w => basC.includes(w)) || adayMarka.some(w => basS.includes(w));
      })();
      const markaCeliskisi = !brandsOk && !brandBilinmiyor && !markaBaslikta;

      const gecerli = brandsOk
        ? (sim >= 0.45 || kapsama)
        : brandBilinmiyor
          ? ((kimlikKapsama && sim >= 0.5) || sim >= 0.8)
          : markaCeliskisi
            ? simHam >= 0.9       // farklı marka + başlıkta kanıt yok → neredeyse birebir şart
            : ((kimlikKapsama && sim >= 0.6) || sim >= 0.85);
      if (!gecerli) return null;
    }
  }
  // YALNIZCA yıl/sürüm eki farkı → aynı ürün (deterministik, YZ'ye sorulmaz).
  // griAlan:false ⇒ pipeline semantik LLM çağırmaz (hız + yanlış ret önlenir).
  if (yilEdisyonAyniMi(src.title, cand.title)) {
    return { eslesme: 'benzerlik', skor: Math.max(sim, 0.9), yilEdisyon: true };
  }

  // Başlık benzerliği (son çare): renk kelimeleri ayıklanır.
  if (brandsOk && sim >= 0.35) return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
  if (!brandsOk) {
    if (brandBilinmiyor && ((kimlikKapsama && sim >= 0.5) || sim >= 0.8)) return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
    const markaBaslikta2 = (() => {
      const a = brandWords(sMarka), b = brandWords(cMarka);
      // Uyumluluk listeleri marka kanıtı sayılmaz (2026-11-04).
      const basC = markaKanitMetni(cand.title), basS = markaKanitMetni(src.title);
      return a.some(w => basC.includes(w)) || b.some(w => basS.includes(w));
    })();
    if (!brandBilinmiyor && markaBaslikta2 && ((kimlikKapsama && sim >= 0.6) || sim >= 0.85)) {
      return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
    }
    // Kısa ama AYIRT EDİCİ başlıklar (2026-11-03): "marka" alanı satıcı (ör.
    // FilamentMarketim) ve aday başlığı kaynak MARKAYI + ürün çizgisinin TÜM ayırt
    // edici kelimelerini içeriyorsa ("Porima PLA Filament - 1Kg"), düşük Jaccard
    // (0.40) kanıt eksikliği değil BAŞLIK KISALIĞIdır. Farklı markalarda bu dal
    // çalışmaz (FilenTa vakası korunur).
    if (!brandBilinmiyor && markaBaslikta2 && kimlikKapsama && sim >= 0.35) {
      return { eslesme: 'benzerlik', skor: sim, griAlan: true };
    }
    // Farklı marka + başlıkta marka kanıtı yok → yalnızca neredeyse birebir başlık.
    // HAM benzerlik kullanılır (marka kelimeleri dahil), aksi hâlde sim yapay 1.0 olur.
    if (!brandBilinmiyor && !markaBaslikta2 && simHam >= 0.9) {
      return { eslesme: 'benzerlik', skor: sim, griAlan: false };
    }
  }
  // Marka tutuyor ve kaynak kimliğinin tamamı adayda geçiyorsa kabul
  // (özlü başlıklar için; alakasız ürünler ~0.15 altında kalır)
  if (brandsOk && kapsama && sim >= 0.15) return { eslesme: 'benzerlik', skor: sim };
  // Marka tutuyor ve aday başlığında kaynak model kodu geçiyorsa düşük eşikle kabul
  // (aynı modelin kısa başlıklı listeleri Jaccard'ı düşürür; alakasız ürünler ~0.15 altında kalır).
  if (sm && sm.length >= 3 && brandsOk && normalizeModelCode(cand.title || '').includes(sm) && sim >= 0.22) {
    return { eslesme: 'benzerlik', skor: sim };
  }
  return null;
}

/** Türk Lirası biçimi. */
export function formatTL(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

/** Güvenli sayı ayrıştırma ("1.699,90" -> 1699.9). */
export function parseNum(s) {
  if (s == null) return null;
  if (typeof s === 'number') return isFinite(s) ? s : null;
  const t = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!t) return null;
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

/**
 * Gömülü JS/JSON içindeki SAYISAL alanı okur ("595.848" → 595.848).
 *
 * `parseNum` Türkçe BİÇİMLİ metin içindir ve noktayı binlik ayırıcı sayar;
 * JSON sayısında nokta ondalıktır. Yanlış kullanım gerçek bir hata üretti
 * (2026-10-25): `productPriceKDVIncluded: 595.848` → parseNum → **595848**.
 * JSON sayıları daima bu fonksiyonla okunmalı.
 *
 * @param {string|number|null} raw
 * @param {number|null} ondalik yuvarlanacak basamak (null = yuvarlama yok)
 */
export function jsSayi(raw, ondalik = null) {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!isFinite(n)) return null;
  if (ondalik == null) return n;
  const k = Math.pow(10, ondalik);
  return Math.round(n * k) / k;
}

/** HTML varlık çözümü (sayısal + yaygın adlı varlıklar, Türkçe karakterler dahil). */
export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&ccedil;/g, 'ç').replace(/&Ccedil;/g, 'Ç')
    .replace(/&gbreve;/g, 'ğ').replace(/&Gbreve;/g, 'Ğ')
    .replace(/&odblac;/g, 'ő').replace(/&Idotabove;/g, 'İ')
    .replace(/&rsquo;|&lsquo;|&sbquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&bdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&bull;/g, '•')
    .replace(/&hellip;/g, '…').replace(/&times;/g, '×');
}

/** HTML etiketlerini temizler. */
export function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

/**
 * Verilen konumdan başlayan dengeli JSON değerini (string veya object) çıkarır.
 * @returns {string|null} JSON metni
 */
export function extractBalanced(s, start) {
  if (start == null || start < 0 || start >= s.length) return null;
  const open = s[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return s.slice(start, j + 1);
      }
    }
  }
  return null;
}

/**
 * HTML'de `window["DEGISKEN"]=` veya `window.DEGISKEN =` biçimindeki gömülü JSON'u yakalar.
 * @returns {any|null} ayrıştırılmış JSON
 */
export function extractScriptJson(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const eq = html.indexOf('=', idx + marker.length);
  if (eq === -1) return null;
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i])) i++;
  const open = html[i];
  if (open !== '{' && open !== '[') return null;
  const json = extractBalanced(html, i);
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

/** Sayfadaki tüm JSON-LD bloklarını döndürür. */
export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); } catch { /* bozuk blok, atla */ }
  }
  return out;
}

/**
 * Sayfadaki ilk schema.org Product nesnesini bulur.
 * Product bazen doğrudan, bazen @graph içinde, bazen de bir başka düğümün altında
 * (ör. MediaMarkt: BuyAction.object) durur — bu yüzden sınırlı derinlikte arama yapılır.
 * offers hem tekil nesne hem dizi olabilir; her iki durumda da ilk Offer döner.
 */
export function findJsonLdProduct(html) {
  const derinBul = (d, derinlik = 0) => {
    if (!d || typeof d !== 'object' || derinlik > 6) return null;
    if (Array.isArray(d)) {
      for (const x of d) { const r = derinBul(x, derinlik + 1); if (r) return r; }
      return null;
    }
    const tip = d['@type'];
    const tipListesi = Array.isArray(tip) ? tip : [tip];
    if (tipListesi.includes('Product')) {
      const offersRaw = d.offers;
      const offers = Array.isArray(offersRaw) ? offersRaw[0] : (offersRaw || null);
      return { ...d, offers };
    }
    if (d['@graph']) {
      const r = derinBul(d['@graph'], derinlik + 1);
      if (r) return r;
    }
    for (const v of Object.values(d)) {
      if (v && typeof v === 'object') {
        const r = derinBul(v, derinlik + 1);
        if (r) return r;
      }
    }
    return null;
  };
  for (const blok of extractJsonLd(html)) {
    const r = derinBul(blok);
    if (r) return r;
  }
  return null;
}

/** Mutlak URL oluşturur. */
export function absUrl(base, href) {
  try { return new URL(href, base).href; } catch { return href; }
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

/**
 * Fırsat ve radar kartları için sitedeki kanonik `/urun/<slug>` URL'sini üretir.
 * Yerel IP / localhost değerlerini dış kanallara sızdırmaz (baskihesap.tech kullanır).
 */
export function kanonikUrunUrl(bilgi, opts = {}) {
  if (!bilgi || typeof bilgi !== 'object') return null;
  if (typeof bilgi.karsilastirmaUrl === 'string' && /^https?:\/\//i.test(bilgi.karsilastirmaUrl)) {
    return bilgi.karsilastirmaUrl;
  }
  const hamTaban = String(opts.siteTaban || bilgi.siteTaban || process.env.PUBLIC_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const taban = (/^https?:\/\//i.test(hamTaban)
    && !/localhost|127\.0\.0\.1|192\.168\.|10\.|172\./i.test(hamTaban))
    ? hamTaban
    : 'https://baskihesap.tech';
  const slug = String(bilgi.slug || '').trim()
    || ((bilgi.ad || bilgi.urun) ? slugYap(bilgi.ad || bilgi.urun) : '');
  if (!slug) return null;
  return `${taban}/urun/${slug}`;
}
