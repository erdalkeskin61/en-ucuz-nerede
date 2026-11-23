/**
 * Çoklu para birimi biçimlendirici (ön yüz ortak yardımcı).
 * TRY için `formatTL` formatı (`1.234,56 TL`) korunur; `formatPara` ise
 * USD ($849.00), EUR (799,00 €), JPY (¥128,000), TRY (₺34.990,00) üretir.
 */
(function (root) {
  const PARA_BIRIMLERI = {
    TRY: { yerel: 'tr-TR', ondalik: 2 },
    USD: { yerel: 'en-US', ondalik: 2 },
    EUR: { yerel: 'fr-FR', ondalik: 2 },
    GBP: { yerel: 'en-GB', ondalik: 2 },
    JPY: { yerel: 'ja-JP', ondalik: 0 },
  };

  function paraBirimiNormalize(birim) {
    const ham = String(birim || 'TRY').trim().toUpperCase();
    if (!ham || ham === 'TL' || ham === '₺') return 'TRY';
    if (ham === '$') return 'USD';
    if (ham === '€') return 'EUR';
    if (ham === '¥' || ham === '￥') return 'JPY';
    if (ham === '£') return 'GBP';
    return /^[A-Z]{3}$/.test(ham) ? ham : 'TRY';
  }

  function formatPara(tutar, paraBirimi, yerel) {
    if (tutar == null || tutar === '') return '—';
    const sayi = Number(tutar);
    if (!Number.isFinite(sayi)) return '—';
    const kod = paraBirimiNormalize(paraBirimi);
    const kural = PARA_BIRIMLERI[kod] || { yerel: 'tr-TR', ondalik: 2 };
    const etkinYerel = yerel || kural.yerel;
    try {
      return new Intl.NumberFormat(etkinYerel, {
        style: 'currency',
        currency: kod,
        minimumFractionDigits: kural.ondalik,
        maximumFractionDigits: kural.ondalik,
      })
        .format(sayi)
        .replace(/[\u00a0\u202f]/g, ' ')
        .replace(/\uFFE5/g, '¥');
    } catch {
      return `${sayi.toFixed(kural.ondalik)} ${kod}`;
    }
  }

  function formatTL(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  }

  root.paraBirimiNormalize = paraBirimiNormalize;
  root.formatPara = formatPara;
  root.formatTL = formatTL;
  root.BaskiPara = { PARA_BIRIMLERI, paraBirimiNormalize, formatPara, formatTL };
})(typeof window !== 'undefined' ? window : globalThis);
