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
  'vizon', 'buz mavisi', 'saks mavisi', 'bebe mavisi', 'fıstık yeşili', 'fistik yesili',
  'yavruağzı', 'yavruagzi', 'beyazımsı', 'kum rengi', 'taş rengi', 'tas rengi',
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
  mint: 'yeşil', lime: 'yeşil', olive: 'yeşil',
  coral: 'turuncu', peach: 'turuncu',
  bronze: 'kahverengi', cocoa: 'kahverengi', chocolate: 'kahverengi', coffee: 'kahverengi',
  ivory: 'beyaz', bone: 'beyaz', clear: 'şeffaf', transparent: 'şeffaf',
  marble: 'mermer', wood: 'ahşap', silk: 'ipek', glitter: 'simli',
};

const COLOR_CANON = {
  kirmizi: 'kırmızı', gumus: 'gümüş', altin: 'altın', yesil: 'yeşil', sari: 'sarı',
  seffaf: 'şeffaf', 'gok mavisi': 'mavi', 'acik gri': 'gri', 'koyu gri': 'gri',
  'rose gold': 'altın', black: 'siyah', white: 'beyaz', red: 'kırmızı', blue: 'mavi',
  navy: 'lacivert', gray: 'gri', grey: 'gri', silver: 'gümüş', gold: 'altın', pink: 'pembe',
  green: 'yeşil', purple: 'mor', orange: 'turuncu', yellow: 'sarı', brown: 'kahverengi',
  turquoise: 'turkuaz', beige: 'bej', cream: 'krem', burgundy: 'bordo',
  cyan: 'mavi', teal: 'mavi', indigo: 'mavi', violet: 'mor', lilac: 'mor', lavender: 'mor',
  magenta: 'pembe', fuchsia: 'pembe', maroon: 'kırmızı', crimson: 'kırmızı', scarlet: 'kırmızı',
  charcoal: 'gri', graphite: 'gri', anthracite: 'antrasit',
  mint: 'yeşil', lime: 'yeşil', olive: 'yeşil',
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
    if (t.includes(' ' + c + ' ') || t.includes(' ' + c + '-') || t.includes('-' + c)) found.add(c);
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
function sadelestir(s) {
  return toLowerTr(s).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');
}

const SADE_COLORS = TR_COLORS.map(sadelestir);

export function titleTokens(title, brand, { stripColors = false } = {}) {
  let t = sadelestir(title)
    // Malzeme çizgisi normalizasyonu: "PLA+" = "PLA Plus" = "plaplus" (aynı ürün çizgisi)
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
export function brandAyni(a, b) {
  if (!a || !b) return false;
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
  'anakart', 'mainboard', 'motherboard',
  'bltouch', 'crtouch', 'cr touch', 'sensor', 'sensoru', 'prob', 'probu', 'filament sensoru',
  'salyangoz fan', 'radyal fan', 'aksiyel fan', 'sogutucu blok', 'heatsink',
];

/**
 * Aday, kaynağın aksesuarı mı? Asimetrik kural: aday aksesuar sinyali taşıyor,
 * kaynak taşımıyorsa farklı üründür. İki sinyal kullanılır:
 *  1) Aksesuar sözcüğü (sözcük sınırıyla; "kablosuz" ≠ "kablo")
 *  2) "uyumlu" / "için" kalıbı — yedek parça ilanlarının neredeyse tamamında var,
 *     ana ürün başlıklarında yok ("Dyson V15 için filtre", "... ile Uyumlu Boru").
 */
function aksesuarUyusmazligi(kaynakBaslik, adayBaslik) {
  const kaynak = sadelestir(kaynakBaslik || '');
  const aday = sadelestir(adayBaslik || '');
  if (!kaynak || !aday) return false;

  // Sözcük sınırıyla ara: "kablo" sözcüğü "kablosuz" içinde sayılmamalı.
  const kelimeler = (t) => AKSESUAR_KELIMELERI.filter(k => {
    const desen = new RegExp('(^|[^a-z0-9])' + k.replace(/\s+/g, '\\s+') + '($|[^a-z0-9])');
    return desen.test(t);
  });
  const adayKelime = kelimeler(aday);
  const kaynakKelime = new Set(kelimeler(kaynak));
  if (adayKelime.length && !adayKelime.some(k => kaynakKelime.has(k))) return true;

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
  'pro max', 'pro', 'plus', 'ultra', 'mini', 'ti', 'super', 'max', 'fe', 'lite', 'se', 'fold', 'flip'
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

export function matchProducts(src, cand) {
  // Aksesuar/yedek parça koruması: aday başlığı aksesuar sözcüğü içeriyor ama kaynak
  // içermiyorsa AYNI ÜRÜN DEĞİLDİR (ör. Dyson V15 süpürge ↔ "V15 için filtre").
  if (aksesuarUyusmazligi(src.title, cand.title)) return null;
  // Farklı seri numarası (V15 ↔ V12) → farklı model.
  if (seriKoduCakismasi(src.title, cand.title)) return null;
  // Kritik varyant Ã§akÄ±ÅŸmasÄ± (iPhone 15 vs iPhone 15 Pro, S24 vs S24 Ultra) -> KESÄ°N RED
  if (kritikVaryantCakismasi(src.title, cand.title)) return null;

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
  const sMarka = markaGecerliMi(src.brand) ? src.brand : null;
  const cMarka = markaGecerliMi(cand.brand) ? cand.brand : null;
  const sim = titleSimilarity(src.title, cand.title, sMarka, cMarka, { stripColors: true });
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
  const kimlikKapsama = (() => {
    const ta = [...titleTokens(src.title, sMarka, { stripColors: true })].filter(w => !olcuMu(w));
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
      const gecerli = brandsOk
        ? (sim >= 0.45 || kapsama)
        : brandBilinmiyor
          ? ((kimlikKapsama && sim >= 0.5) || sim >= 0.8)
          : ((kimlikKapsama && sim >= 0.6) || sim >= 0.85);
      if (!gecerli) return null;
    }
  }
  // Başlık benzerliği (son çare): renk kelimeleri ayıklanır.
  if (brandsOk && sim >= 0.35) return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
  if (!brandsOk) {
    if (brandBilinmiyor && ((kimlikKapsama && sim >= 0.5) || sim >= 0.8)) return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
    if (!brandBilinmiyor && ((kimlikKapsama && sim >= 0.6) || sim >= 0.85)) return { eslesme: 'benzerlik', skor: sim, griAlan: sim < 0.85 };
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
