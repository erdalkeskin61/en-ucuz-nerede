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

const BOT_UA_RE = /bot|crawler|spider|slurp|bingbot|googlebot|yandex|duckduckbot|baiduspider|applebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|headless/i;
const ULKE_DIL_HARITASI = Object.freeze({
  TR: 'tr',
  FR: 'fr',
  MC: 'fr',
  JP: 'ja',
  US: 'en',
  GB: 'en',
  UK: 'en',
  CA: 'en',
  AU: 'en',
  NZ: 'en',
  IE: 'en',
});

/**
 * Kök istek (`/` veya `/index.html`) için ziyaretçinin ülkesine / tarayıcı diline
 * göre açılış dilini çözer:
 *   1) Arama motoru botları yönlendirilmez (SEO canonical & hreflang korunur).
 *   2) URL'de ürün/arama parametresi (`?url=`/`?sorgu=`) varsa yönlendirilmez.
 *   3) Açık `?lang=` veya kaydedilmiş `bh_lang` çerezi önceliklidir.
 *   4) Proxy ülke başlığı (`CF-IPCountry`, `X-Vercel-IP-Country`, `X-Country-Code`, `X-Geo-Country`)
 *      veya yoksa `Accept-Language` okunur; desteklenmeyen ülke/dil global `'en'` (`/en`) açılır.
 *   5) Başlık hiç yoksa (curl / sağlık kontrolü) `'tr'` kalır.
 */
export function ulkeVeyaIstekDiliCoz(req = {}) {
  const query = req.query || {};
  const headersHam = req.headers || {};
  const h = {};
  for (const [k, v] of Object.entries(headersHam)) h[String(k).toLowerCase()] = v;

  const ua = String(h['user-agent'] || '');
  if (BOT_UA_RE.test(ua)) {
    return { dil: 'tr', yonlendirUrl: null, cerezKaydet: null, bot: true, kaynak: 'bot' };
  }

  if (query.url || query.sorgu || query.arama) {
    return { dil: 'tr', yonlendirUrl: null, cerezKaydet: null, bot: false, kaynak: 'arama-param' };
  }

  const gecerliDil = (d) => {
    const s = String(d || '').trim().toLowerCase().split(/[-_]/)[0];
    return DESTEKLENEN_DILLER.includes(s) ? s : null;
  };

  const acikLang = gecerliDil(query.lang);
  if (acikLang) {
    return {
      dil: acikLang,
      yonlendirUrl: acikLang === 'tr' ? null : DIL_META[acikLang].yolOnEk,
      cerezKaydet: acikLang,
      bot: false,
      kaynak: 'query',
    };
  }

  const cookieStr = String(h.cookie || '');
  const cookieMatch = cookieStr.match(/(?:^|;\s*)bh_lang=([a-zA-Z_-]{2,10})/);
  const cerezDil = cookieMatch ? gecerliDil(cookieMatch[1]) : null;
  if (cerezDil) {
    return {
      dil: cerezDil,
      yonlendirUrl: cerezDil === 'tr' ? null : DIL_META[cerezDil].yolOnEk,
      cerezKaydet: null,
      bot: false,
      kaynak: 'cookie',
    };
  }

  const ulkeHam = String(
    h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] || h['x-geo-country'] || '',
  ).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(ulkeHam) && ulkeHam !== 'XX' && ulkeHam !== 'T1') {
    const dil = ULKE_DIL_HARITASI[ulkeHam] || 'en';
    return {
      dil,
      yonlendirUrl: dil === 'tr' ? null : DIL_META[dil].yolOnEk,
      cerezKaydet: null,
      bot: false,
      kaynak: 'country:' + ulkeHam,
    };
  }

  const acceptLang = String(h['accept-language'] || '').trim();
  if (acceptLang) {
    const ilkTercih = acceptLang.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
    const bas = ilkTercih ? ilkTercih.split(/[-_]/)[0] : '';
    if (bas) {
      const dil = DESTEKLENEN_DILLER.includes(bas) ? bas : 'en';
      return {
        dil,
        yonlendirUrl: dil === 'tr' ? null : DIL_META[dil].yolOnEk,
        cerezKaydet: null,
        bot: false,
        kaynak: 'accept-language:' + bas,
      };
    }
  }

  return { dil: 'tr', yonlendirUrl: null, cerezKaydet: null, bot: false, kaynak: 'default' };
}
