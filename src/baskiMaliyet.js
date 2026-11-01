/**
 * 🖨️ 3D Baskı Uzmanlık Modülü — 2026-10-30
 *
 * İki iş yapar:
 *  1) DİLİMLEYİCİ MALİYET SİMÜLATÖRÜ: dilimleyiciden (Bambu Studio, Cura,
 *     OrcaSlicer, PrusaSlicer) alınan parça gramajına göre gerçek hammadde +
 *     elektrik maliyetini, makaradan çıkacak adedi ve metre başına maliyeti hesaplar.
 *  2) UYUMLULUK KALKANI: başlıktan filament çapını (1.75 mm / 2.85 mm) ve
 *     hammadde türünü (PLA, PETG, ABS, TPU, reçine alt türleri…) çıkarır.
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - Miktar/fiyat okunamazsa hesap YAPILMAZ; `gecerli:false` + `neden` döner.
 *  - Yoğunluk nominal değerdir (üreticiye göre değişir) ve `tahmini` işaretlenir.
 *  - Elektrik, ortalama 150 W yazıcı ve mesken tarifesi varsayımıdır; varsayımlar
 *    sonuçla birlikte döndürülür (gizli sabit yok).
 *  - Çap bulunamazsa "bilinmiyor" denir; 1.75 mm VARSAYILMAZ.
 */

import {
  birimFiyat, yogunlukBul, NOMINAL_YOGUNLUK, miktarCikar,
} from './birimFiyat.js';

/* ------------------------------------------------------------------ */
/* Varsayımlar (env ile değiştirilebilir)                              */
/* ------------------------------------------------------------------ */

const envSayi = (ad, varsayilan) => {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n > 0 ? n : varsayilan;
};

/** Ortalama masaüstü FDM yazıcı gücü (W). */
export const YAZICI_GUC_W = envSayi('BASKI_YAZICI_GUC_W', 150);
/** Türkiye mesken elektrik tarifesi (TL/kWh). Fatura bölgesine göre değişir. */
export const ELEKTRIK_KWH_TL = envSayi('BASKI_ELEKTRIK_KWH_TL', 2.9);
/** Ortalama baskı hızı (gram/saat) — süre tahmini için. */
export const GRAM_SAAT = envSayi('BASKI_GRAM_SAAT', 12.5);

/** Hammadde sınıfları: filtre anahtarı, görünen ad, hap rozet. */
export const HAMMADDE_TURLERI = Object.freeze({
  pla: { ad: 'PLA', grup: 'fdm', rozet: '🌱 PLA', sinif: 'hm-pla', yogunluk: 1.24 },
  'pla+': { ad: 'PLA+', grup: 'fdm', rozet: '💪 PLA+', sinif: 'hm-pla-plus', yogunluk: 1.24 },
  hyper: { ad: 'Hyper / Yüksek Hız', grup: 'fdm', rozet: '🚀 Hyper Hızlı Baskı', sinif: 'hm-hyper', yogunluk: 1.24 },
  petg: { ad: 'PETG', grup: 'fdm', rozet: '🧪 PETG', sinif: 'hm-petg', yogunluk: 1.27 },
  abs: { ad: 'ABS / ASA', grup: 'fdm', rozet: '🔥 ABS / ASA', sinif: 'hm-abs', yogunluk: 1.04 },
  tpu: { ad: 'TPU (Esnek)', grup: 'fdm', rozet: '🪢 TPU Esnek', sinif: 'hm-tpu', yogunluk: 1.21 },
  pva: { ad: 'PVA (Destek)', grup: 'fdm', rozet: '💧 PVA Destek', sinif: 'hm-pva', yogunluk: 1.23 },
  cf: { ad: 'Karbon Fiber (CF)', grup: 'fdm', rozet: '🖤 Karbon Fiber', sinif: 'hm-cf', yogunluk: 1.24 },
  standart_recine: { ad: 'Standart Reçine', grup: 'sla', rozet: '🧴 Standart Reçine', sinif: 'hm-resin', yogunluk: 1.10 },
  suda_yikanabilir: { ad: 'Water Washable', grup: 'sla', rozet: '🚿 Suda Yıkanabilir', sinif: 'hm-resin-ww', yogunluk: 1.10 },
  abs_like: { ad: 'ABS-Like Reçine', grup: 'sla', rozet: '🧱 ABS-Like', sinif: 'hm-resin-abs', yogunluk: 1.10 },
  tough: { ad: 'Tough / Dayanıklı', grup: 'sla', rozet: '🛡️ Tough Dayanıklı', sinif: 'hm-resin-tough', yogunluk: 1.10 },
});

/* ------------------------------------------------------------------ */
/* Çap ayrıştırma                                                     */
/* ------------------------------------------------------------------ */

/**
 * Başlık/açıklamadan filament çapını çıkarır.
 *
 * @param {string} metin
 * @returns {{mm:number|null, ham:string|null, guven:'yuksek'|'yok', standart:boolean|null}}
 */
export function capCikar(metin) {
  const t = String(metin || '');
  if (!t.trim()) return { mm: null, ham: null, guven: 'yok', standart: null };

  // "1.75 mm", "1,75mm", "2.85 mm", "3 mm", "3.00mm"
  const re = /(?:^|[^\d.,])(\d(?:[.,]\d{1,2})?)\s*(?:mm|milimetre)\b/gi;
  const bulunan = [];
  for (const m of t.matchAll(re)) {
    const mm = parseFloat(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(mm)) continue;
    // Nozzle (0.4 / 0.6) ve tel çapı gibi alakasız değerleri ele.
    if (mm < 1.5 || mm > 3.2) continue;
    bulunan.push({ mm: Math.round(mm * 100) / 100, ham: m[0].trim() });
  }
  if (!bulunan.length) {
    // Yalnızca "1.75" yazan başlıklar (mm olmadan) — yalnızca filament bağlamında kabul.
    if (/filament|filaman|makara|spool/i.test(t)) {
      const m = t.match(/(?:^|[^\d.,])(1[.,]75|2[.,]85)(?:[^\d]|$)/);
      if (m) {
        const mm = parseFloat(m[1].replace(',', '.'));
        return { mm, ham: m[1], guven: 'orta', standart: mm < 2 };
      }
    }
    return { mm: null, ham: null, guven: 'yok', standart: null };
  }
  // Birden fazla farklı çap yazılmışsa ilkini kullan ama güveni "orta" yap.
  const farkli = new Set(bulunan.map(x => x.mm)).size > 1;
  const mm = bulunan[0].mm;
  return {
    mm,
    ham: bulunan[0].ham,
    guven: farkli ? 'orta' : 'yuksek',
    standart: mm < 2, // <2 mm → 1.75 standardı
  };
}

/** 2.85/3.0 mm → standart 1.75 mm yazıcılara uymaz. */
export function capUyarisi(cap) {
  if (!cap || cap.mm == null) return null;
  if (cap.standart === false) {
    return {
      kod: 'cap_uyumsuz',
      kisa: '2.85 mm',
      metin: '⚠️ DİKKAT: 2.85 mm Kalınlık (Standart 1.75mm yazıcılara uymaz!)',
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Hammadde türü                                                      */
/* ------------------------------------------------------------------ */

const NITELIKLER = [
  { anahtar: 'silky', re: /\bsilk\b|ipeksi|ipek\s*efekt/i, rozet: '💎 Silk İpeksi', sinif: 'nt-silk' },
  { anahtar: 'mat', re: /\bmat\b|matte/i, rozet: '🎨 Mat Yüzey', sinif: 'nt-mat' },
  { anahtar: 'biyo', re: /biyo[\s-]?uyumlu|biocompatible|bio\s*uyumlu/i, rozet: '🌱 Biyo-Uyumlu', sinif: 'nt-biyo' },
  { anahtar: 'uv', re: /\buv\b|güneşe\s*dayan|gunese\s*dayan/i, rozet: '☀️ UV Dayanımlı', sinif: 'nt-uv' },
  { anahtar: 'esnek', re: /esnek|flexible/i, rozet: '🤸 Esnek', sinif: 'nt-esnek' },
  { anahtar: 'kosul', re: /su\s*ile\s*y[ıi]kan|water\s*washable/i, rozet: '🚿 Suda Yıkanabilir', sinif: 'nt-ww' },
];

/**
 * Başlık/açıklamadan hammadde türünü sınıflandırır.
 *
 * @param {string} metin
 * @returns {{tur:string|null, ad:string|null, grup:'fdm'|'sla'|null,
 *            rozet:string|null, sinif:string|null, nitelikler:Array}}
 */
export function hammaddeTuruBul(metin) {
  const t = String(metin || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  const nitelikler = NITELIKLER
    .filter(n => n.re.test(t))
    .map(n => ({ anahtar: n.anahtar, rozet: n.rozet, sinif: n.sinif }));
  const bos = { tur: null, ad: null, grup: null, rozet: null, sinif: null, nitelikler };

  // ---- SLA / Reçine ----
  if (/re[çc]ine|\bresin\b|photopolymer|fotopolimer|\bsla\b|\blcd\b/.test(t)) {
    let tur = 'standart_recine';
    if (/water\s*washable|su\s*ile\s*y[ıi]kan|suda\s*y[ıi]kan/.test(t)) tur = 'suda_yikanabilir';
    else if (/abs[\s-]?like/.test(t)) tur = 'abs_like';
    else if (/\btough\b|dayan[ıi]kl[ıi]/i.test(t)) tur = 'tough';
    return { ...HAMMADDE_TURLERI[tur], tur, grup: 'sla', nitelikler };
  }

  // ---- FDM (özel olanlar önce) ----
  // Karbon fiber: "PA-CF", "PETG-CF", "Karbon Fiber"
  if (/karbon\s*fiber|carbon\s*fiber|\bcf\b|[-_ ]cf\b|pa\s*[-]?cf|petg\s*[-]?cf|pla\s*[-]?cf/.test(t)) {
    return { ...HAMMADDE_TURLERI.cf, tur: 'cf', grup: 'fdm', nitelikler };
  }
  // Hyper / yüksek hız
  if (/hyper|high[\s-]?speed|y[üu]ksek\s*h[ıi]z|h[ıi]zl[ıi]\s*bask/.test(t)) {
    return { ...HAMMADDE_TURLERI.hyper, tur: 'hyper', grup: 'fdm', nitelikler };
  }
  // PLA+
  if (/\bpla\s*(?:\+|plus|pro)(?![a-zçğıöşü])/.test(t)) {
    return { ...HAMMADDE_TURLERI['pla+'], tur: 'pla+', grup: 'fdm', nitelikler };
  }
  const fdm = [
    ['petg', /\bpetg\b/],
    ['abs', /\babs\b|\basa\b/],
    ['tpu', /\btpu\b|termoplastik\s*poli[üu]retan/],
    ['pva', /\bpva\b/],
    ['pla', /\bpla\b/],
  ];
  for (const [tur, re] of fdm) {
    if (re.test(t)) return { ...HAMMADDE_TURLERI[tur], tur, grup: 'fdm', nitelikler };
  }
  return bos;
}

/* ------------------------------------------------------------------ */
/* Maliyet hesabı                                                     */
/* ------------------------------------------------------------------ */

/** 1 gram malzemenin metre cinsinden uzunluğu. */
export function gramBasinaMetre(yogunluk, capMm = 1.75) {
  const yog = Number(yogunluk);
  const d = Number(capMm);
  if (!Number.isFinite(yog) || yog <= 0 || !Number.isFinite(d) || d <= 0) return null;
  const yaricapCm = d / 20;                         // mm → cm yarıçap
  const alanCm2 = Math.PI * yaricapCm * yaricapCm;  // kesit alanı (cm²)
  const hacimCm3 = 1 / yog;                         // 1 g malzemenin hacmi
  return (hacimCm3 / alanCm2) / 100;                // cm → m
}

/**
 * Dilimleyici gramajına göre parça baskı maliyeti.
 *
 * @param {object} urun {title, description?, sellingPrice?, pricing?, birim?}
 * @param {number} [gramaj=100] dilimleyicide okunan model ağırlığı (gram)
 * @param {{sureSaat?:number, kwhTl?:number, gucW?:number, capMm?:number,
 *          yogunluk?:number, adet?:number}} [opts]
 */
export function hesaplaBaskiMaliyeti(urun, gramaj = 100, opts = {}) {
  const g = Number(gramaj);
  const urunMetni = `${urun?.title || ''} ${urun?.description || ''}`.trim();
  const hammadde = hammaddeTuruBul(urunMetni);
  const cap = capCikar(urunMetni);
  const b = urun?.birim || birimFiyat(urun || {});

  const yogunluk = Number(opts.yogunluk)
    || b?.yogunluk
    || hammadde?.yogunluk
    || yogunlukBul(urunMetni)
    || (hammadde?.grup === 'sla' ? NOMINAL_YOGUNLUK.rezine : null);

  const temel = {
    gecerli: false,
    neden: null,
    gramaj: Number.isFinite(g) && g > 0 ? Math.round(g * 100) / 100 : null,
    cap: { mm: cap.mm, uyumlu: cap.mm == null ? null : cap.standart, uyari: capUyarisi(cap) },
    hammadde: {
      tur: hammadde.tur, ad: hammadde.ad, grup: hammadde.grup,
      rozet: hammadde.rozet, sinif: hammadde.sinif, nitelikler: hammadde.nitelikler,
    },
    yogunluk: yogunluk || null,
    yogunlukTahmini: !b?.yogunluk,
    varsayimlar: {
      gucW: Number(opts.gucW) || YAZICI_GUC_W,
      kwhTl: Number(opts.kwhTl) || ELEKTRIK_KWH_TL,
      gramSaat: GRAM_SAAT,
    },
  };

  if (!Number.isFinite(g) || g <= 0) return { ...temel, neden: 'Geçerli bir gramaj girin (ör. 100).' };
  if (!b || !Number.isFinite(Number(b.fiyat)) || Number(b.fiyat) <= 0) {
    return { ...temel, neden: 'Ürün fiyatı okunamadı.' };
  }

  // Toplam malzeme: ağırlık varsa o, yoksa hacim × yoğunluk (tahmini).
  let makaraGram = b.gram != null ? Number(b.gram) : null;
  let makaraMl = b.ml != null ? Number(b.ml) : null;
  if (makaraGram == null && makaraMl != null && yogunluk) {
    makaraGram = makaraMl * yogunluk;
  }
  if (!(makaraGram > 0)) {
    return { ...temel, neden: 'Makara gramajı başlıktan okunamadı (uydurma hesap yapılmaz).' };
  }

  const fiyat = Number(b.fiyat);
  const tlGram = fiyat / makaraGram;
  const hammaddeMaliyeti = tlGram * g;
  const adet = Math.floor(makaraGram / g);

  // ---- Elektrik ----
  const gucW = Number(opts.gucW) || YAZICI_GUC_W;
  const kwhTl = Number(opts.kwhTl) || ELEKTRIK_KWH_TL;
  const sureSaat = Number(opts.sureSaat) > 0 ? Number(opts.sureSaat) : g / GRAM_SAAT;
  const kwh = (gucW / 1000) * sureSaat;
  const elektrikMaliyeti = kwh * kwhTl;

  // ---- Metre ----
  const capMm = Number(opts.capMm) || cap.mm || 1.75;
  const metrePerGram = gramBasinaMetre(yogunluk || 1.24, capMm);
  const makaraMetre = metrePerGram != null ? metrePerGram * makaraGram : null;
  const parcaMetre = metrePerGram != null ? metrePerGram * g : null;
  const metreMaliyeti = makaraMetre ? fiyat / makaraMetre : null;

  const yuvarla = (x) => Math.round(x * 100) / 100;

  return {
    ...temel,
    gecerli: true,
    neden: null,
    fiyat: yuvarla(fiyat),
    makaraGram: Math.round(makaraGram * 100) / 100,
    makaraMl: makaraMl != null ? Math.round(makaraMl * 100) / 100 : null,
    tlGram: Math.round(tlGram * 10000) / 10000,
    tlKg: b.tlKg ?? (b.gram ? yuvarla(fiyat / (b.gram / 1000)) : null),
    tlL: b.tlL ?? (makaraMl ? yuvarla(fiyat / (makaraMl / 1000)) : null),
    hammaddeMaliyeti: yuvarla(hammaddeMaliyeti),
    elektrikMaliyeti: yuvarla(elektrikMaliyeti),
    parcaMaliyeti: yuvarla(hammaddeMaliyeti + elektrikMaliyeti),
    toplamMaliyet: yuvarla(hammaddeMaliyeti + elektrikMaliyeti),
    adet,
    kalanGram: Math.round((makaraGram - adet * g) * 100) / 100,
    metre: {
      capMm,
      capTahmini: !cap.mm,
      parcaMetre: parcaMetre != null ? Math.round(parcaMetre * 10) / 10 : null,
      makaraMetre: makaraMetre != null ? Math.round(makaraMetre) : null,
      metreMaliyeti: metreMaliyeti != null ? yuvarla(metreMaliyeti * 100) / 100 : null,
    },
    elektrik: {
      sureSaat: Math.round(sureSaat * 10) / 10,
      kwh: Math.round(kwh * 1000) / 1000,
      gucW,
      kwhTl,
    },
    // 100 g kıyası (kartta sunucu tarafı varsayılan gösterim için)
    varsayilan100: {
      parcaMaliyeti: yuvarla(tlGram * 100 + ((gucW / 1000) * (100 / GRAM_SAAT) * kwhTl)),
      adet: Math.floor(makaraGram / 100),
    },
  };
}

/**
 * Sunucunun karta göndereceği kompakt 3D bilgisi.
 * İstemci gramajı değiştirdiğinde ağ isteği olmadan yeniden hesap yapabilsin diye
 * birim değerler (tlGram, makaraGram, varsayımlar) taşınır.
 */
export function baskiKartiBilgisi(product) {
  try {
    const metin = `${product?.title || ''} ${product?.description || ''}`.trim();
    const hammadde = hammaddeTuruBul(metin);
    const cap = capCikar(metin);
    const b = product?.birim || birimFiyat(product || {});
    const hesap = hesaplaBaskiMaliyeti(product, 100);
    // Widget yalnızca GERÇEKTEN filament/reçine ürünlerinde gösterilir:
    // hammadde tanındıysa ya da (miktar okunabiliyorsa) başlık filament/reçine diyorsa.
    // 3D yazıcı, nozul, yatak gibi ekipmanlarda maliyet widget'ı gösterilmez.
    const miktarVar = b.gram != null || b.ml != null;
    const ucBoyut = hammadde.tur != null
      || (miktarVar && /filament|filaman|makara|spool|re[çc]ine|\bresin\b/i.test(metin));
    if (!ucBoyut) return null;
    return {
      capMm: cap.mm,
      capGuven: cap.guven,
      capUyari: capUyarisi(cap),
      hammadde: {
        tur: hammadde.tur, ad: hammadde.ad, grup: hammadde.grup,
        rozet: hammadde.rozet, sinif: hammadde.sinif,
        nitelikler: hammadde.nitelikler,
      },
      makaraGram: hesap.makaraGram ?? b.gram ?? null,
      makaraMl: hesap.makaraMl ?? b.ml ?? null,
      tlGram: hesap.gecerli ? hesap.tlGram : null,
      tlKg: hesap.tlKg ?? b.tlKg ?? null,
      tlL: hesap.tlL ?? b.tlL ?? null,
      yogunluk: hesap.yogunluk,
      yogunlukTahmini: !!hesap.yogunlukTahmini,
      metreMaliyeti: hesap.metre?.metreMaliyeti ?? null,
      makaraMetre: hesap.metre?.makaraMetre ?? null,
      varsayimlar: hesap.varsayimlar,
      varsayilanGram: 100,
      hesaplanabilir: !!hesap.gecerli,
      neden: hesap.neden || null,
    };
  } catch {
    return null;
  }
}

/**
 * "Yüksek Birim Maliyet" uyarısı: aynı ürün grubunun medyanına göre pahalı mı?
 *
 * @param {object} birim birimFiyat çıktısı
 * @param {number|null} medyanKg gruptaki medyan ₺/kg
 * @param {{esik?:number}} [opts] varsayılan %25 üzeri
 */
export function yuksekBirimMaliyet(birim, medyanKg, opts = {}) {
  const esik = Number.isFinite(Number(opts.esik)) ? Number(opts.esik) : 25;
  const tlKg = Number(birim?.tlKg);
  const med = Number(medyanKg);
  if (!Number.isFinite(tlKg) || !Number.isFinite(med) || med <= 0) return null;
  const farkYuzde = Math.round((tlKg / med - 1) * 1000) / 10;
  if (farkYuzde < esik) return null;
  return {
    kod: 'yuksek_birim',
    farkYuzde,
    tlKg,
    medyanKg: med,
    metin: `⚠️ Yüksek Birim Maliyet — aynı ürünlerin medyanına göre %${String(farkYuzde).replace('.', ',')} daha pahalı`,
  };
}

/** Testlerde/dışa aktarımda kullanılacak özet (filtre sayaçları için). */
export function baskiOzeti(sonuclar) {
  const capSayac = { '1.75': 0, '2.85': 0, bilinmiyor: 0 };
  const hammaddeSayac = {};
  let uyumsuz = 0;
  for (const r of sonuclar || []) {
    const bk = r?.baski;
    if (!bk) continue;
    const mm = bk.capMm;
    if (mm == null) capSayac.bilinmiyor++;
    else if (mm < 2) capSayac['1.75']++;
    else capSayac['2.85']++;
    if (bk.capUyari) uyumsuz++;
    if (bk.hammadde?.tur) {
      hammaddeSayac[bk.hammadde.tur] = (hammaddeSayac[bk.hammadde.tur] || 0) + 1;
    }
  }
  return { capSayac, hammaddeSayac, uyumsuz };
}

/**
 * Eski (3D alanları yazılmadan önce kaydedilmiş) snapshot payload'larını okuma
 * anında zenginleştirir. Böylece 0 saniyelik SWR yanıtı yeni rozetler/widget için
 * şema sürümü artırmaya gerek kalmadan tam görünür. Veri UYDURULMAZ: yalnızca
 * payload'daki gerçek ürün başlığı/fiyat/miktarından türetilir.
 *
 * @param {object} payload runComparison çıktısı
 * @returns {object} aynı nesne (yerinde güncellenir)
 */
export function baskiZenginlestir(payload) {
  if (!payload || !Array.isArray(payload.sonuclar)) return payload;
  const medyanKg = payload.ozet?.birimFiyat?.medyanKg ?? null;
  for (const r of payload.sonuclar) {
    if (!r?.product) continue;
    if (!r.baski) {
      r.baski = baskiKartiBilgisi({
        ...r.product,
        birim: r.product.birim || birimFiyat(r.product),
      });
    }
    if (!r.birimUyari && r.product.birim) {
      r.birimUyari = yuksekBirimMaliyet(r.product.birim, medyanKg);
    }
  }
  payload.ozet = payload.ozet || {};
  if (!payload.ozet.baskiOzet) {
    payload.ozet.baskiOzet = {
      ...baskiOzeti(payload.sonuclar),
      yuksekBirimSayisi: payload.sonuclar.filter(r => r.birimUyari).length,
    };
  }
  return payload;
}
