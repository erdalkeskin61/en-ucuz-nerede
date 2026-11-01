/**
 * 🧾 KDV (VAT) yardımcıları — 2026-10-31
 *
 * SORUN: Bazı mağazalar (ör. direnc.net) ürün sayfasında ve JSON-LD'de **KDV hariç**
 * fiyatı yayımlıyor; gerçekte ödenecek tutar sayfada "KDV Dahil" olarak ayrıca
 * yazıyor. Bu fiyat okunmazsa ürün olduğundan ~%20 ucuz görünür ve yanlış
 * "en ucuz" seçimi yapılır.
 *
 * ÇÖZÜM: Sayfadaki görünür metinden hem "… TL + KDV" hem "… TL KDV Dahil"
 * değerleri çıkarılır. KDV dahil değer varsa o kullanılır; yalnızca KDV hariç
 * değer varsa KDV oranı eklenir. Oran sayfadan okunur, okunamazsa %20 varsayılır.
 *
 * DÜRÜSTLÜK:
 *  - Fiyat UYDURULMAZ: sayfada KDV kanıtı yoksa ve mağaza için zorunlu kılınmamışsa
 *    JSON-LD fiyatı olduğu gibi bırakılır.
 *  - KDV eklendiğinde `haric` (KDV hariç tutar) ve `oran` sonuçla birlikte döner;
 *    arayüz "KDV dahil" rozetini ve varsa KDV hariç tutarı gösterebilir.
 *  - Yalnızca Türkçe biçimli metin okunur ("1.234,56"); JSON sayıları için
 *    `parseNum` uygun değildir, bu yüzden JSON-LD değeri zaten sayıdır.
 */
import { parseNum, decodeEntities } from './util.js';

/** Türkiye'de yaygın standart KDV oranı (%). */
export const VARSAYILAN_KDV_ORANI = 20;

/** Sayfadaki KDV oranını okur ("VAT":20, data-vat="20", %20 KDV). */
export function kdvOraniBul(html) {
  const t = String(html || '');
  const adaylar = [
    t.match(/"VAT"\s*:\s*"?(\d{1,2}(?:[.,]\d+)?)/i)?.[1],
    t.match(/data-vat(?:-rate)?\s*=\s*["']?(\d{1,2}(?:[.,]\d+)?)/i)?.[1],
    t.match(/%\s*(\d{1,2})\s*KDV/i)?.[1],
  ];
  for (const a of adaylar) {
    const n = Number(String(a ?? '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n <= 50) return n;
  }
  return null;
}

/** HTML'den görünür metni çıkarır (script/style hariç). */
export function gorunurMetin(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PARA = '(\\d[\\d.,\\s]*?\\d|\\d)';
const BIRIM = '(?:TL|₺|TRY)';

/**
 * Sayfadaki KDV dahil / KDV hariç fiyatları çıkarır.
 *
 * @param {string} html
 * @returns {{dahil:number|null, haric:number|null, ham:{dahil:string|null, haric:string|null}}}
 */
export function sayfaKdvFiyatlari(html) {
  const metin = gorunurMetin(html);
  const bul = (re) => {
    for (const m of metin.matchAll(re)) {
      const ham = m[1];
      const n = parseNum(ham);
      if (Number.isFinite(n) && n > 0 && n < 1_000_000) return { deger: n, ham };
    }
    return null;
  };

  // "680,53 TL KDV Dahil" · "KDV Dahil: 680,53 TL"
  const dahil = bul(new RegExp(PARA + '\\s*' + BIRIM + '\\s*KDV\\s*Dahil', 'gi'))
    || bul(new RegExp('KDV\\s*Dahil\\s*[:\\-]?\\s*' + PARA + '\\s*' + BIRIM, 'gi'));

  // "567,11 TL + KDV" · "+ KDV 567,11 TL"
  const haric = bul(new RegExp(PARA + '\\s*' + BIRIM + '\\s*\\+\\s*KDV(?!\\s*Dahil)', 'gi'))
    || bul(new RegExp('\\+\\s*KDV\\s*[:\\-]?\\s*' + PARA + '\\s*' + BIRIM, 'gi'));

  return {
    dahil: dahil?.deger ?? null,
    haric: haric?.deger ?? null,
    ham: { dahil: dahil?.ham ?? null, haric: haric?.ham ?? null },
  };
}

const yuvarla = (n) => Math.round(n * 100) / 100;
const yakin = (a, b, oran = 0.02) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= oran;
};

/**
 * Bir ürün fiyatını KDV dahil hâle getirir.
 *
 * @param {string} html ürün sayfası
 * @param {number|null} jsonFiyat JSON-LD/sayısal kaynaktan okunan fiyat
 * @param {{zorunlu?:boolean, oran?:number}} [opts]
 *   zorunlu: sayfada kanıt olmasa bile KDV ekle (yalnızca KDV hariç yayımladığı
 *   bilinen mağazalar için, ör. direnc.net)
 * @returns {{fiyat:number|null, oran:number, uygulandi:boolean, kaynak:string,
 *            haric:number|null, sayfaFiyatlari:{dahil:number|null,haric:number|null}}}
 */
export function kdvDahilFiyat(html, jsonFiyat, opts = {}) {
  const oran = Number.isFinite(Number(opts.oran))
    ? Number(opts.oran)
    : (kdvOraniBul(html) ?? VARSAYILAN_KDV_ORANI);
  const sayfa = sayfaKdvFiyatlari(html);
  const json = Number(jsonFiyat);
  const jsonGecerli = Number.isFinite(json) && json > 0;

  const sonuc = {
    fiyat: jsonGecerli ? yuvarla(json) : null,
    oran,
    uygulandi: false,
    kaynak: 'degismedi',
    haric: null,
    sayfaFiyatlari: { dahil: sayfa.dahil, haric: sayfa.haric },
  };

  // 1) Sayfada açık "KDV Dahil" fiyatı varsa: en güvenilir kaynak.
  if (sayfa.dahil != null) {
    const jsonHariceUyuyor = sayfa.haric != null && jsonGecerli && yakin(json, sayfa.haric);
    const jsonZatenDahil = jsonGecerli && yakin(json, sayfa.dahil);
    const oranTutuyor = jsonGecerli && sayfa.haric == null
      && yakin(sayfa.dahil, json * (1 + oran / 100), 0.03);

    if (jsonHariceUyuyor || oranTutuyor || (!jsonGecerli) || opts.zorunlu === true) {
      sonuc.fiyat = yuvarla(sayfa.dahil);
      sonuc.uygulandi = !(jsonZatenDahil && !jsonHariceUyuyor);
      sonuc.kaynak = 'sayfa-kdv-dahil';
      sonuc.haric = sayfa.haric ?? (jsonGecerli && !jsonZatenDahil ? yuvarla(json) : null);
      return sonuc;
    }
    // JSON-LD ile sayfa "dahil" fiyatı uyuşmuyorsa (farklı varyant olabilir)
    // JSON-LD esas alınır; KDV kanıtı yoksa fiyat değiştirilmez.
    if (jsonZatenDahil) {
      sonuc.fiyat = yuvarla(json);
      sonuc.kaynak = 'json-ld-kdv-dahil';
      return sonuc;
    }
  }

  // 2) Sayfa "… + KDV" diyor ve JSON-LD bu hariç tutarla uyuşuyor → KDV ekle.
  if (jsonGecerli && sayfa.haric != null && yakin(json, sayfa.haric)) {
    sonuc.fiyat = yuvarla(json * (1 + oran / 100));
    sonuc.uygulandi = true;
    sonuc.kaynak = 'sayfa-plus-kdv';
    sonuc.haric = yuvarla(json);
    return sonuc;
  }

  // 3) Mağaza KDV hariç yayımlıyor (bilinen durum) → KDV ekle.
  if (jsonGecerli && opts.zorunlu === true) {
    sonuc.fiyat = yuvarla(json * (1 + oran / 100));
    sonuc.uygulandi = true;
    sonuc.kaynak = 'zorunlu-kdv';
    sonuc.haric = yuvarla(json);
    return sonuc;
  }

  // 4) Kanıt yok: dokunma (uydurma yok).
  return sonuc;
}
