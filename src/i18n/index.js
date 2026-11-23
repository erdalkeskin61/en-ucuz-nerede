/**
 * 🌍 Hafif i18n Sözlük Motoru (tr / en / fr / ja) — 2026-11-23
 *
 * Tek sorumluluk:
 *  - Bölge/dil kodunu normalleştirme (`normalizeDil`, `dilByMarket`)
 *  - `tr`, `en`, `fr`, `ja` sözlüklerinden güvenli anahtar erişimi (`t`)
 *  - Yerelleştirilmiş SSS şablonları (`sssSablonlari`) ve para birimi biçimi (`dilParaFormati`)
 */
import tr from './tr.js';
import en from './en.js';
import fr from './fr.js';
import ja from './ja.js';
import { formatPara, formatTL, paraBirimiNormalize } from '../util.js';

export const SOZLUKLER = Object.freeze({ tr, en, fr, ja });
export const DESTEKLENEN_DILLER = Object.freeze(['tr', 'en', 'fr', 'ja']);

export const DIL_META = Object.freeze({
  tr: Object.freeze({ dil: 'tr', market: 'tr', ad: 'Türkçe', bayrak: '🇹🇷', currency: 'TRY', yerel: 'tr-TR', yolOnEk: '' }),
  en: Object.freeze({ dil: 'en', market: 'us', ad: 'English', bayrak: '🇺🇸', currency: 'USD', yerel: 'en-US', yolOnEk: '/en' }),
  fr: Object.freeze({ dil: 'fr', market: 'fr', ad: 'Français', bayrak: '🇫🇷', currency: 'EUR', yerel: 'fr-FR', yolOnEk: '/fr' }),
  ja: Object.freeze({ dil: 'ja', market: 'jp', ad: '日本語', bayrak: '🇯🇵', currency: 'JPY', yerel: 'ja-JP', yolOnEk: '/ja' }),
});

/** Dil veya yerel/pazar kodunu `'tr' | 'en' | 'fr' | 'ja'` koduna indirger. */
export function normalizeDil(dil = 'tr') {
  const s = String(dil || 'tr').trim().toLowerCase().split(/[-_]/)[0];
  if (s === 'jp') return 'ja';
  if (s === 'us' || s === 'eu' || s === 'uk' || s === 'gb') return 'en';
  return SOZLUKLER[s] ? s : 'tr';
}

/** Pazar (`tr`, `us`, `fr`, `eu`, `jp`) kodundan varsayılan dili döndürür. */
export function dilByMarket(market = 'tr') {
  const m = String(market || 'tr').trim().toLowerCase();
  if (m === 'jp' || m === 'ja') return 'ja';
  if (m === 'fr') return 'fr';
  if (m === 'us' || m === 'eu' || m === 'en') return 'en';
  return 'tr';
}

/** İstenen dilin sözlük nesnesini döndürür (yoksa `'tr'`). */
export function sozlukGetir(dil = 'tr') {
  return SOZLUKLER[normalizeDil(dil)] || tr;
}

function derinDeger(nesne, yol) {
  let cur = nesne;
  for (const parca of String(yol || '').split('.')) {
    if (!cur || typeof cur !== 'object' || !(parca in cur)) return undefined;
    cur = cur[parca];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Şablon içindeki `{{degisken}}` yer tutucularını doldurur. */
export function sablonDoldur(metin, degiskenler = {}) {
  return String(metin ?? '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, k) =>
    degiskenler[k] != null ? String(degiskenler[k]) : '');
}

/** Sözlükten metin okur; eksik anahtarda `'tr'` yedeğine düşer. */
export function t(dil, anahtar, degiskenler = null) {
  const kod = normalizeDil(dil);
  const ham = derinDeger(SOZLUKLER[kod], anahtar) ?? derinDeger(tr, anahtar) ?? String(anahtar);
  return degiskenler ? sablonDoldur(ham, degiskenler) : ham;
}

/** Seçili dilin para birimi/yerel ayarıyla (veya özel ISO koduyla) fiyatı biçimlendirir. */
export function dilParaFormati(dil, tutar, paraBirimiOverride = null) {
  const sz = sozlukGetir(dil);
  const kod = paraBirimiOverride ? paraBirimiNormalize(paraBirimiOverride) : sz.para.kod;
  if (kod === 'TRY' && sz.meta.dil === 'tr') return formatTL(tutar);
  return formatPara(tutar, kod, kod === sz.para.kod ? sz.para.yerel : null);
}

/** Ürün verisinden seçili dilde dinamik SSS listesi (`{ soru, cevap }[]`) üretir. */
export function sssSablonlari(dil = 'tr', {
  ad,
  guncelFiyat = 0,
  enPahaliFiyat = 0,
  enUcuzSite = '',
  magazaSayisi = 0,
  kargoNotu = '',
  paraBirimi = null,
} = {}) {
  const kod = normalizeDil(dil);
  const para = (v) => dilParaFormati(kod, v, paraBirimi);
  const fark = (guncelFiyat > 0 && enPahaliFiyat > guncelFiyat)
    ? Math.round((enPahaliFiyat - guncelFiyat) * 100) / 100
    : 0;
  const farkYuzde = (fark > 0 && enPahaliFiyat > 0) ? Math.round((fark / enPahaliFiyat) * 100) : 0;

  const liste = [];
  if (guncelFiyat > 0 && enUcuzSite) {
    liste.push({
      soru: t(kod, 'sss.enUcuzSoru', { ad }),
      cevap: t(kod, 'sss.enUcuzCevap', {
        ad,
        fiyat: para(guncelFiyat),
        site: enUcuzSite,
        kargoNotu: kargoNotu ? ` (${kargoNotu})` : '',
      }),
    });
  } else {
    liste.push({
      soru: t(kod, 'sss.canliFiyatSoru', { ad }),
      cevap: t(kod, 'sss.canliFiyatCevap', { ad }),
    });
  }

  if (magazaSayisi >= 2 && fark > 0) {
    liste.push({
      soru: t(kod, 'sss.stokFarkSoru', { ad }),
      cevap: t(kod, 'sss.stokFarkCevap', {
        ad,
        magazaSayisi,
        fiyat: para(guncelFiyat),
        enPahali: para(enPahaliFiyat),
        fark: para(fark),
        farkYuzde,
      }),
    });
  } else {
    liste.push({
      soru: t(kod, 'sss.stokKuraliSoru', { ad }),
      cevap: t(kod, 'sss.stokKuraliCevap', { ad }),
    });
  }

  liste.push({
    soru: t(kod, 'sss.kargoHesapSoru', { ad }),
    cevap: t(kod, 'sss.kargoHesapCevap', { ad }),
  });

  return liste;
}
