/**
 * Birim fiyat motoru (₺/kg ve ₺/L) — 2026-10-29
 *
 * AMAÇ: 3D baskı dikeyinde farklı gramajlı filamentleri (250 g, 500 g, 800 g, 1 kg,
 * 3 kg…) karşılaştırılabilir hâle getirmek ve **"sahte ucuz" tuzağını** engellemek.
 *
 * TUZAK NEDİR: 800 g'lık makara 449 TL, 1 kg'lık makara 549 TL ise başlık fiyatına
 * bakan kullanıcı 800 g'lığı "daha ucuz" sanır. Birim fiyat gerçeği söyler:
 *   449 / 0,8 kg = 561,25 ₺/kg   >   549 / 1 kg = 549,00 ₺/kg
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - Miktar UYDURULMAZ. Başlıktan güvenilir miktar okunamazsa birim fiyat null döner
 *    ve arayüzde "miktar okunamadı" denir (tahmini kg yazılmaz).
 *  - Çap (1.75mm / 2.85mm) miktar sanılmaz; model kodu içindeki sayılar (A2L) elenir.
 *  - Çoklu paket ("10'lu kutu … 1 kg") toplam miktar olarak hesaplanır ve işaretlenir.
 *  - ₺/L dönüşümü yalnızca **nominal yoğunluk** ile yapılır ve `tlKgTahmini: true`
 *    işaretlenir (gerçek yoğunluk üreticiye/katkıya göre değişir). ₺/kg ile ₺/L asla
 *    karıştırılmaz.
 *
 * NOT: Bu modül `util.js`'i IMPORT ETMEZ (bilerek). `util.js → matchProducts` gramaj
 * kontrolü için buradan fonksiyon çağırır; ters yönde import döngü yaratırdı.
 */

/** Türkçe küçük harfe çevirir (util.toLowerTr ile aynı davranış, döngüyü kırmak için yerel). */
function kucult(s) {
  return String(s ?? '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase();
}

/** Nominal yoğunluklar (g/cm³ = g/ml). Kaynak: yaygın filament üreticilerinin veri sayfaları. */
export const NOMINAL_YOGUNLUK = {
  pla: 1.24,
  'pla+': 1.24,
  petg: 1.27,
  abs: 1.04,
  asa: 1.07,
  tpu: 1.21,
  pa: 1.14,
  pa6: 1.13,
  pa12: 1.01,
  pc: 1.20,
  pva: 1.23,
  hips: 1.04,
  pei: 1.27,
  pekk: 1.30,
  peek: 1.30,
  // Reçineler
  resin: 1.10,
  'reçine': 1.10,
  rezine: 1.10,
};

/** Malzeme adını başlıktan çıkarır (yoğunluk için). */
export function malzemeBul(title) {
  const t = kucult(title);
  // Özel/uzun adlar önce
  const adaylar = ['pa12', 'pa6', 'pla+', 'petg', 'abs', 'asa', 'tpu', 'pva', 'hips', 'pei', 'pekk', 'peek', 'pc', 'pa', 'pla', 'reçine', 'rezine', 'resin'];
  for (const m of adaylar) {
    const re = new RegExp('(?:^|[^\\p{L}])' + m.replace('+', '\\+') + '(?:[^\\p{L}]|$)', 'u');
    if (re.test(t)) return m;
  }
  return null;
}

/** Nominal yoğunluk (g/cm³ = g/ml). Bulunamazsa null. */
export function yogunlukBul(title) {
  const m = malzemeBul(title);
  if (!m) return null;
  return NOMINAL_YOGUNLUK[m] ?? null;
}

/**
 * Başlıktaki çap/ölçü ifadelerini metinden çıkarır ki miktar sanılmasın.
 * "1.75mm", "2,85 mm", "175mm", "0.4mm nozzle" gibi.
 */
function caplariTemizle(metin) {
  return metin
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:mm|milimetre)\b/gi, ' ')
    .replace(/\b(?:nozzle|nozul|çap|cap)\b[^.,]{0,12}/gi, ' ');
}

/**
 * Çoklu paket çarpanını bulur: "10'lu kutu 1 kg" → 10, "2x1kg" → 2, "ikili" → 2.
 * Yalnızca paket/kutu/set gibi bir sözcük varsa çarpan sayılır (yanlış pozitif olmasın).
 */
function paketCarpani(metin) {
  // "10'lu Kutu", "3'lü paket", "2 li set"
  const m1 = metin.match(/(\d+)\s*['’`]?\s*(?:li|lı|lu|lü)\s*(?:kutu|paket|set|adet|rulo)\b/i);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 2 && n <= 50) return { adet: n, ham: m1[0].trim() };
  }
  // "2x1kg", "3 x 1 kg", "2×1kg"
  const m2 = metin.match(/(\d+)\s*[x×]\s*(?=\d)/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 2 && n <= 50) return { adet: n, ham: m2[0].trim() };
  }
  // "1kg x2"
  const m3 = metin.match(/\d+(?:[.,]\d+)?\s*(?:kg|g|gr)\s*[x×]\s*(\d+)\b/i);
  if (m3) {
    const n = parseInt(m3[1], 10);
    if (n >= 2 && n <= 50) return { adet: n, ham: m3[0].trim(), sondan: true };
  }
  // "ikili", "üçlü", "dörtlü"
  const sozluk = { ikili: 2, 'üçlü': 3, uclu: 3, 'dörtlü': 4, dortlu: 4, 'beşli': 5, besli: 5 };
  for (const [k, v] of Object.entries(sozluk)) {
    if (new RegExp('(?:^|[^\\p{L}])' + k + '(?:[^\\p{L}]|$)', 'u').test(metin)) {
      return { adet: v, ham: k };
    }
  }
  return null;
}

/**
 * Başlıktan net miktarı çıkarır.
 *
 * @param {string} title ürün başlığı
 * @returns {{
 *   gram: number|null, ml: number|null, birim: 'g'|'ml'|null,
 *   ham: string|null, guven: 'yuksek'|'orta'|'dusuk'|'yok',
 *   cokluPaket: {adet:number, ham:string}|null,
 *   malzeme: string|null, yogunluk: number|null,
 *   not: string|null
 * }}
 */
export function miktarCikar(title) {
  const bos = {
    gram: null, ml: null, birim: null, ham: null, guven: 'yok',
    cokluPaket: null, malzeme: null, yogunluk: null, not: null,
  };
  const hamBaslik = String(title || '');
  if (!hamBaslik.trim()) return bos;

  const malzeme = malzemeBul(hamBaslik);
  const yogunluk = malzeme ? (NOMINAL_YOGUNLUK[malzeme] ?? null) : null;

  const t = caplariTemizle(kucult(hamBaslik));
  const paket = paketCarpani(t);

  // --- Ağırlık ---
  // Sayıdan ÖNCE harf olmamalı ("A2L" gibi model kodları elenir) — ancak çoklu paket
  // çarpanı "2x1kg" biçiminde sayıdan hemen önce "x"/"×" gelebilir.
  const agirlikRe = /(?:^|[^\p{L}\d]|[x×])(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilogram|gr|g|gram)(?![\p{L}])/giu;
  const agirliklar = [];
  for (const m of t.matchAll(agirlikRe)) {
    const sayi = parseFloat(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(sayi) || sayi <= 0) continue;
    const birim = m[2].toLowerCase();
    const kgMi = /^(kg|kgs|kilo|kilogram)$/.test(birim);
    const gram = kgMi ? sayi * 1000 : sayi;
    // Makul aralık: 5 g – 50 kg (5 g altı = vida/nozul vb., 50 kg üstü = hatalı okuma)
    if (gram < 5 || gram > 50000) continue;
    agirliklar.push({ gram: Math.round(gram), ham: m[0].replace(/^\D+/, '').trim(), konum: m.index });
  }

  // --- Hacim ---
  const hacimRe = /(?:^|[^\p{L}\d])(\d+(?:[.,]\d+)?)\s*(ml|cl|lt|l|litre|liter)(?![\p{L}])/gu;
  const hacimler = [];
  for (const m of t.matchAll(hacimRe)) {
    const sayi = parseFloat(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(sayi) || sayi <= 0) continue;
    const birim = m[2].toLowerCase();
    const ml = (birim === 'l' || birim === 'lt' || birim === 'litre' || birim === 'liter')
      ? sayi * 1000
      : (birim === 'cl' ? sayi * 10 : sayi);
    if (ml < 10 || ml > 100000) continue;
    hacimler.push({ ml: Math.round(ml), ham: m[0].replace(/^\D+/, '').trim(), konum: m.index });
  }

  const agirlik = agirliklar[0] || null;
  const hacim = hacimler[0] || null;

  // İkisi birden varsa: çap temizliğine rağmen kalan belirsizlik → güven düşük
  const cakisma = !!(agirlik && hacim);

  if (!agirlik && !hacim) {
    return { ...bos, malzeme, yogunluk, not: 'Miktar (g/kg/ml) başlıkta bulunamadı' };
  }

  const carpan = paket?.adet || 1;
  const secilen = agirlik || hacim;
  const toplam = secilen.gram ?? secilen.ml;
  const toplamMiktar = Math.round(toplam * carpan);

  // Farklı ağırlıklar yazılmışsa (ör. "1 kg" ve "3 kg" aynı başlıkta) güven düşük
  const farkliAgirlik = agirliklar.length > 1
    && new Set(agirliklar.map(x => x.gram)).size > 1;

  let guven = 'yuksek';
  let not = null;
  if (farkliAgirlik) {
    guven = 'dusuk';
    not = 'Başlıkta birden fazla farklı miktar var (' + agirliklar.map(x => x.ham).join(', ') + ')';
  } else if (cakisma) {
    guven = 'dusuk';
    not = 'Başlıkta hem ağırlık hem hacim var; hangisinin net miktar olduğu belirsiz';
  } else if (paket) {
    guven = 'orta';
    not = `Çoklu paket (${paket.ham}) → toplam ${toplamMiktar} ${agirlik ? 'g' : 'ml'}`;
  }

  return {
    gram: agirlik && !farkliAgirlik ? toplamMiktar : null,
    ml: hacim && !agirlik ? toplamMiktar : null,
    birim: agirlik ? 'g' : 'ml',
    ham: secilen.ham,
    guven,
    cokluPaket: paket,
    malzeme,
    yogunluk,
    not,
  };
}

/**
 * Bir ürünün birim fiyatını hesaplar.
 *
 * @param {{title?:string, sellingPrice?:number|null, pricing?:object}} product
 *   Fiyat olarak `pricing.toplam` (gerçekte ödenecek) tercih edilir; yoksa sellingPrice.
 */
export function birimFiyat(product) {
  const p = product || {};
  const m = miktarCikar(p.title || '');

  const fiyat = Number(p.pricing?.toplam ?? p.sellingPrice ?? p.pricing?.araToplam);
  const fiyatGecerli = Number.isFinite(fiyat) && fiyat > 0;
  const fiyatKaynagi = p.pricing?.toplam != null ? 'toplam' : (p.sellingPrice != null ? 'sellingPrice' : null);

  const kg = m.gram != null ? m.gram / 1000 : null;
  const litre = m.ml != null ? m.ml / 1000 : null;

  // Yalnızca güvenilir miktarda hesap yapılır (düşük güvende null → dürüst)
  const hesaplanabilir = fiyatGecerli && m.guven !== 'dusuk' && m.guven !== 'yok';

  let tlKg = null;
  let tlKgTahmini = false;
  let tlL = null;

  if (hesaplanabilir) {
    if (kg != null && kg > 0) {
      tlKg = Math.round((fiyat / kg) * 100) / 100;
    } else if (litre != null && litre > 0) {
      tlL = Math.round((fiyat / litre) * 100) / 100;
      // Hacimden kg: nominal yoğunluk varsa tahmini ₺/kg
      if (m.yogunluk) {
        const tahminiKg = litre * m.yogunluk;
        if (tahminiKg > 0) {
          tlKg = Math.round((fiyat / tahminiKg) * 100) / 100;
          tlKgTahmini = true;
        }
      }
    }
  }

  return {
    gram: m.gram,
    ml: m.ml,
    kg,
    litre,
    tlKg,
    tlL,
    tlKgTahmini,
    fiyat: fiyatGecerli ? Math.round(fiyat * 100) / 100 : null,
    fiyatKaynagi,
    guven: m.guven,
    ham: m.ham,
    not: m.not,
    malzeme: m.malzeme,
    yogunluk: m.yogunluk,
  };
}

/**
 * 🧵 Filament / reçine birim fiyatı — 2026-11-01
 *
 * `birimFiyatHesapla(baslik, fiyat)`:
 *  - Başlıktan gramaj (1 kg / 1000 g / 2.5 kg / 2500 g / 500 g …) ya da hacim
 *    (1000 ml / 1 L / 500 ml …) çıkarır,
 *  - Yalnızca **filament veya reçine** ürünlerinde hesap yapar,
 *  - Birim fiyat = fiyat / miktar (kg veya litre).
 *
 * DÜRÜSTLÜK:
 *  - Miktar bulunamazsa `null` döner (uydurma kg yok).
 *  - Yazıcı, nozul, anakart, kurutucu gibi aksesuarlarda `null` döner.
 *  - Reçine hacimden hesaplanır (₺/L); kg karşılığı yalnızca nominal yoğunlukla
 *    ve `tahmini:true` işaretiyle verilir.
 *
 * @param {string} baslik ürün başlığı
 * @param {number} fiyat net/gerçek fiyat (TL)
 * @returns {null | {
 *   tur:'filament'|'resin', birim:'kg'|'L', miktar:number,
 *   birimFiyat:number, kg:number|null, litre:number|null,
 *   gram:number|null, ml:number|null, tahmini:boolean, malzeme:string|null,
 *   rozetMetni:string, rozetIkonu:string
 * }}
 */
export function birimFiyatHesapla(baslik, fiyat) {
  const f = Number(fiyat);
  if (!Number.isFinite(f) || f <= 0) return null;

  const bas = String(baslik || '');
  if (!bas.trim()) return null;

  const m = miktarCikar(bas);
  // Düşük güven (çelişkili/çoklu miktar) → hesap yapılmaz.
  if (m.guven === 'dusuk' || m.guven === 'yok') return null;
  if (m.gram == null && m.ml == null) return null;

  const t = kucult(bas);
  const recineMi = /re[çc]ine|rezine|\bresin\b|\bsla\b|photopolymer|fotopolimer/.test(t);
  const filamentMi = /filament|filaman|makara|spool/.test(t) || !!m.malzeme;
  // Ne reçine ne filament → aksesuar/yazıcı: birim fiyat üretilmez.
  if (!recineMi && !filamentMi) return null;
  // Aksesuar sözcükleri (kurutucu, nozul, ağız, anakart…) yanlış pozitif üretmesin.
  if (/(kurutucu|dryer|nozul|nozzle|a[ğg][ıi]z|anakart|mainboard|yatak|bed|vida|sens[öo]r|kablo|adapt[öo]r)/.test(t)
    && !/re[çc]ine|\bresin\b/.test(t)) {
    return null;
  }

  const kg = m.gram != null ? m.gram / 1000 : null;
  const litre = m.ml != null ? m.ml / 1000 : null;

  const yuvarla = (n) => Math.round(n * 100) / 100;
  const bicim = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Reçine: hacim varsa ₺/L esas alınır.
  if (recineMi && litre != null && litre > 0) {
    const birimFiyat = yuvarla(f / litre);
    const tahminiKg = m.yogunluk ? yuvarla(f / (litre * m.yogunluk)) : null;
    return {
      tur: 'resin',
      birim: 'L',
      miktar: litre,
      birimFiyat,
      kg: tahminiKg,
      litre,
      gram: m.gram,
      ml: m.ml,
      tahmini: true, // yoğunluk nominal
      malzeme: m.malzeme,
      rozetMetni: `🧪 ${bicim(birimFiyat)} TL / L`,
      rozetIkonu: '🧪',
    };
  }

  // Filament (veya ağırlıkla satılan reçine): ₺/kg.
  if (kg != null && kg > 0) {
    const birimFiyat = yuvarla(f / kg);
    return {
      tur: recineMi ? 'resin' : 'filament',
      birim: 'kg',
      miktar: kg,
      birimFiyat,
      kg,
      litre,
      gram: m.gram,
      ml: m.ml,
      tahmini: false,
      malzeme: m.malzeme,
      rozetMetni: `🏷️ ${bicim(birimFiyat)} TL / kg`,
      rozetIkonu: '🏷️',
    };
  }

  // Reçine yalnızca ml ile satılıyor ve hacim okunamadıysa hesap yok.
  return null;
}

/** ₺/kg değerini Türkçe biçimde yazar. */
export function tlKgMetni(deger) {  if (deger == null || !Number.isFinite(Number(deger))) return null;
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/kg';
}

/** ₺/L değerini Türkçe biçimde yazar. */
export function tlLMetni(deger) {
  if (deger == null || !Number.isFinite(Number(deger))) return null;
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/L';
}

/** Gramı kısa metne çevirir: 800 → "800 g", 3000 → "3 kg". */
export function gramMetni(gram) {
  if (gram == null || !Number.isFinite(Number(gram))) return null;
  const g = Number(gram);
  if (g >= 1000 && g % 100 === 0) {
    const kg = g / 1000;
    return kg.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' kg';
  }
  return g.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' g';
}

/**
 * Miktarlar birbirine "aynı" mı? (1 kg = 1000 gr, ±%2 tolerans)
 *
 * @returns {boolean|null} true: aynı, false: farklı, null: en az biri bilinmiyor
 */
export function miktarAyniMi(aGram, bGram, tolerans = 0.02) {
  const a = Number(aGram);
  const b = Number(bGram);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const buyuk = Math.max(a, b);
  return Math.abs(a - b) / buyuk <= tolerans;
}

/**
 * İki başlığın NET MİKTARI çelişiyor mu? — eşleştirmede "sahte ucuz" koruması.
 *
 * Gerçek vaka (2026-10-29 ölçümü): "Beta ABS Plus Gri Filament 1.75mm 1Kg" ile
 * "... 800gr" başlıkları %66 benzerlikle AYNI ÜRÜN sayılıyordu; 449 TL'lik 800 g
 * makara 549 TL'lik 1 kg'lık ürünün yerine "en ucuz" görünüyordu.
 *
 * Kural: iki tarafta da güvenilir (guven != 'dusuk') miktar varsa ve bunlar ±%2'den
 * fazla farklıysa → çelişki var (farklı varyant). Biri bilinmiyorsa çelişki YOK
 * (kanıt yok → engelleme yok; yanlış negatif üretmemek için).
 *
 * @returns {{cakisma:boolean, aGram:number|null, bGram:number|null, tolerans:number}}
 */
export function miktarCakismasi(aTitle, bTitle, tolerans = 0.02) {
  const a = miktarCikar(aTitle);
  const b = miktarCikar(bTitle);
  const aGecerli = a.gram != null && a.guven !== 'dusuk' ? a.gram : null;
  const bGecerli = b.gram != null && b.guven !== 'dusuk' ? b.gram : null;
  const ayni = miktarAyniMi(aGecerli, bGecerli, tolerans);
  return {
    cakisma: ayni === false,
    aGram: aGecerli,
    bGram: bGecerli,
    tolerans,
  };
}

/**
 * Birim fiyat sıralaması + "sahte ucuz" tespiti.
 *
 * @param {Array<object>} urunler {site, siteName, title, pricing|sellingPrice, ...}
 * @param {{referansGram?:number|null}} [opts]
 */
export function birimSirala(urunler, opts = {}) {
  const liste = (Array.isArray(urunler) ? urunler : [])
    .map(u => ({ ...u, birim: u.birim || birimFiyat(u) }));

  // Referans miktar: verilmişse o, yoksa gruptaki en yaygın gramaj
  let referansGram = Number(opts.referansGram) || null;
  if (!referansGram) {
    const sayac = new Map();
    for (const u of liste) {
      if (u.birim.gram != null && u.birim.guven !== 'dusuk') {
        sayac.set(u.birim.gram, (sayac.get(u.birim.gram) || 0) + 1);
      }
    }
    let enCok = 0;
    for (const [gram, adet] of sayac) {
      if (adet > enCok) { enCok = adet; referansGram = gram; }
    }
  }

  const kgOlanlar = liste.filter(u => u.birim.tlKg != null);
  const lOlanlar = liste.filter(u => u.birim.tlL != null);

  // --- Şüpheli derecede düşük birim fiyat koruması ---
  //
  // 2026-10-29 gerçek vaka: fixx3d ARAMA LİSTESİ aynı ürün için 9–13 TL gösteriyor
  // (gerçek fiyat 448–647 TL). Böyle bir değer "en iyi ₺/kg = 12,5" diye sunulursa
  // kullanıcı yanıltılır. Kural: birim fiyat, gruptaki medyanın %25'inden düşükse
  // "şüpheli" işaretlenir ve EN İYİ önerisinden çıkarılır (veri silinmez, gösterilir).
  const medyan = (degerler) => {
    const d = [...degerler].filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!d.length) return null;
    const orta = Math.floor(d.length / 2);
    return d.length % 2 ? d[orta] : (d[orta - 1] + d[orta]) / 2;
  };
  const medyanKg = medyan(liste.filter(u => u.birim.gram != null).map(u => u.birim.tlKg));

  for (const u of liste) {
    const kgDegeri = u.birim.tlKg;
    u.birim.supheli = false;
    u.birim.supheliNeden = null;
    if (kgDegeri != null && medyanKg != null && liste.filter(x => x.birim.tlKg != null).length >= 3) {
      if (kgDegeri < medyanKg * 0.25) {
        u.birim.supheli = true;
        u.birim.supheliNeden = 'Birim fiyat diğer mağazaların çok altında '
          + `(${tlKgMetni(kgDegeri)} vs medyan ${tlKgMetni(medyanKg)}). `
          + 'Liste/önbellek fiyatı olabilir; ürün sayfasından doğrulanmalı.';
      }
    }
  }

  const guvenilirKg = kgOlanlar.filter(u => !u.birim.supheli);
  const guvenilirL = lOlanlar.filter(u => !u.birim.supheli);

  const siralamaHavuzu = guvenilirKg.length ? guvenilirKg : kgOlanlar;

  const sirali = [...liste].sort((a, b) => {
    // Şüpheli olanlar en sona
    if (!!a.birim.supheli !== !!b.birim.supheli) return a.birim.supheli ? 1 : -1;
    const ak = a.birim.tlKg;
    const bk = b.birim.tlKg;
    if (ak == null && bk == null) return 0;
    if (ak == null) return 1;
    if (bk == null) return -1;
    return ak - bk;
  });

  const enIyiKg = siralamaHavuzu.length
    ? siralamaHavuzu.reduce((a, b) => (b.birim.tlKg < a.birim.tlKg ? b : a))
    : null;
  const enIyiL = (guvenilirL.length ? guvenilirL : lOlanlar).length
    ? (guvenilirL.length ? guvenilirL : lOlanlar).reduce((a, b) => (b.birim.tlL < a.birim.tlL ? b : a))
    : null;
  const supheliler = liste.filter(u => u.birim.supheli);

  // --- Sahte ucuz tespiti (referanstan BAĞIMSIZ, çift bazlı) ---
  //
  // 2026-10-29 gerçek veri: FilamentSan 800 g = 637,80 TL (797,25 ₺/kg),
  // aynı ürün 1 kg = 700,20 TL (700,20 ₺/kg). 800 g başlıkta DAHA UCUZ görünüyor
  // ama kilogramda %13,9 daha pahalı. Referans "en yaygın gramaj" seçildiğinde bu
  // vaka kaçabiliyordu (çoğunluk 800 g ise 1 kg "daha büyük" diye atlanıyordu).
  //
  // Yeni kural: her ürünü, KENDİSİNDEN BÜYÜK gramajlı ürünlerle karşılaştır.
  //   A.fiyat < B.fiyat  (A başlıkta daha ucuz)
  //   A.tlKg  > B.tlKg   (A kilogramda daha pahalı)
  //   → A "sahte ucuz"dur (B'ye göre).
  const tuzaklar = [];
  {
    const fiyatli = liste.filter(u =>
      u.birim.gram != null && u.birim.tlKg != null && u.birim.fiyat != null
      && u.birim.guven !== 'dusuk');

    for (const a of fiyatli) {
      const ag = a.birim.gram;
      const aKg = a.birim.tlKg;
      const aFiyat = a.birim.fiyat;

      // A'dan anlamlı biçimde büyük (en az %2) ve birim fiyatı daha iyi olanlar
      let enIyiRakip = null;
      let enBuyukFark = 0;
      for (const b of fiyatli) {
        if (b === a) continue;
        const bg = b.birim.gram;
        if (bg <= ag * 1.02) continue;            // daha büyük olmalı
        if (b.birim.tlKg >= aKg) continue;        // B kilogramda daha iyi olmalı
        if (b.birim.fiyat <= aFiyat) continue;    // B başlıkta daha pahalı olmalı (yoksa tuzak değil)

        const fark = (aKg / b.birim.tlKg) - 1;
        if (fark > enBuyukFark) {
          enBuyukFark = fark;
          enIyiRakip = b;
        }
      }
      if (!enIyiRakip) continue;

      const farkYuzde = Math.round(enBuyukFark * 1000) / 10;
      tuzaklar.push({
        site: a.site,
        siteName: a.siteName,
        title: a.title,
        gram: ag,
        fiyat: aFiyat,
        tlKg: aKg,
        referansGram: enIyiRakip.birim.gram,
        referansFiyat: enIyiRakip.birim.fiyat,
        referansTlKg: enIyiRakip.birim.tlKg,
        referansSite: enIyiRakip.siteName || enIyiRakip.site,
        birimFarkYuzde: farkYuzde,
        neden: `${gramMetni(ag)} ürün ${aFiyat} TL ile daha ucuz görünüyor, `
          + `ama ${tlKgMetni(aKg)} — ${gramMetni(enIyiRakip.birim.gram)} ürün ${tlKgMetni(enIyiRakip.birim.tlKg)}. `
          + `Kilogram başına %${String(farkYuzde).replace('.', ',')} daha pahalı.`,
      });
    }

    // Aynı ürünün birden çok mağazası varsa en ağır örneği tut (site bazında tek kayıt)
    tuzaklar.sort((x, y) => y.birimFarkYuzde - x.birimFarkYuzde);
  }

  const okunamayan = liste.filter(u => u.birim.gram == null && u.birim.ml == null).length;

  return {
    sirali,
    enIyiKg,
    enIyiL,
    tuzaklar,
    supheliler,
    medyanKg,
    okunamayan,
    referansGram,
    toplam: liste.length,
  };
}
