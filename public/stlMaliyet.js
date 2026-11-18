/**
 * 🧮 3D model maliyeti — TEK KAYNAK yardımcılar (2026-11-08)
 *
 * Neden ayrı modül?
 *  - Aynı hesap hem /maliyet.html (STL radarı) hem ana sayfa mikro dropzone'unda
 *    kullanılıyor. İki yerde ayrı formül tutmak kuruş farkı üretiyordu.
 *  - Saf fonksiyonlar olduğu için ağ/DOM olmadan test edilebilir.
 *
 * DÜRÜSTLÜK: makara fiyatı ürünün GERÇEK satış fiyatıdır; "1 kg" varsayımı
 * fiyat ÷ ₺/kg oranından doğrulanır (500 g makarada verim yanlış çıkmaz).
 */

/** 1 makaranın varsayılan gramajı (bilinmiyorsa). */
export const VARSAYILAN_MAKARA_GRAM = 1000;

/** Para biçimi: 499 → "₺499,00". */
export function para(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return '₺' + Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Tam sayı + binlik ayırıcı (140 → "140"). */
export function tamSayi(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

/**
 * Türkçe ablative eki: "Robotistan'dan", "Trendyol'dan", "3Dcim'den", "Porima 3D'den".
 * Son heceli kelimenin son ünlüsüne göre ünlü uyumu; ünlüsüz kısaltmada "den".
 */
export function turkceAblatif(ad) {
  const temiz = String(ad || '').trim().replace(/['’]s?$/i, '');
  if (!temiz) return "'den";
  const kelimeler = temiz.split(/\s+/).filter(Boolean);
  const unluBul = (k) => {
    const unluler = k.match(/[aeıioöuüAEIİOÖUÜ]/g);
    return unluler && unluler.length ? unluler[unluler.length - 1] : null;
  };
  const sonKelime = kelimeler[kelimeler.length - 1] || '';
  // Son kelime ünlüsüz bir kısaltma/sayı ise ("3D", "2X") okunuşu öne çekilir:
  // Türkçede "3D" → "üç de" → güvenli varsayılan "den" (Robotistan'da kural aynı kalır).
  if (!unluBul(sonKelime)) return "'den";
  let kelime = sonKelime;
  const unlu = unluBul(kelime);
  if (!unlu) return "'den";
  const kalin = 'aıou'.includes(unlu.toLowerCase());
  const sonHarf = (temiz.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]$/) || [''])[0].toLowerCase();
  const sert = 'pçtkfhsş'.includes(sonHarf);
  if (kalin) return sert ? "'tan" : "'dan";
  return sert ? "'ten" : "'den";
}

/**
 * Malzeme ailesine en yakın, en düşük ₺/kg'li STOKLU filamenti seçer.
 * Aynı aile yoksa en ucuz herhangi bir filament döner (dürüst: aile uydurulmaz).
 *
 * @param {Array} liste  /api/baski/en-ucuz-filamentler çıktısı
 * @param {string} malzeme PLA | PETG | ABS | TPU | ASA
 */
export function enUcuzFilament(liste, malzeme = 'PLA') {
  const uygun = (Array.isArray(liste) ? liste : []).filter(f => Number(f?.tlKg) > 0);
  if (!uygun.length) return null;
  const hedef = String(malzeme || 'PLA').toUpperCase();
  const ayni = uygun.filter(f => {
    const m = String(f.malzeme || f.malzemeTuru || '').toUpperCase();
    const baslik = String(f.ad || '').toUpperCase();
    if (hedef === 'PLA') return /PLA/.test(m) || /\bPLA\b/.test(baslik);
    return m.includes(hedef) || baslik.includes(hedef);
  });
  const havuz = ayni.length ? ayni : uygun;
  return havuz.reduce((a, b) => (Number(a.tlKg) <= Number(b.tlKg) ? a : b));
}

/**
 * Hacim + doluluk + malzeme + canlı filament → gramaj, parça maliyeti, makara verimi.
 *
 * @param {object} girdi
 * @param {number} girdi.hacimCm3
 * @param {number} girdi.doluluk        %1–100
 * @param {string} girdi.malzeme
 * @param {object|null} girdi.filament  seçilen canlı teklif
 * @param {Function} girdi.hesaplaGramaj  stlParser.hesaplaGramaj
 */
export function hesaplaMaliyet({ hacimCm3, doluluk, malzeme, filament, hesaplaGramaj }) {
  if (typeof hesaplaGramaj !== 'function') {
    throw new Error('hesaplaMaliyet: hesaplaGramaj fonksiyonu gerekli');
  }
  if (!Number.isFinite(Number(hacimCm3)) || Number(hacimCm3) <= 0) return null;

  const h = hesaplaGramaj(Number(hacimCm3), doluluk, malzeme);
  const tlKg = filament ? Number(filament.tlKg) : 0;
  const makaraFiyat = filament ? (Number(filament.fiyat) || tlKg) : 0;
  // Makara gramajı: fiyat ÷ (₺/kg) × 1000 — genelde 1000 g, 500 g'da 500.
  const makaraGram = (tlKg > 0 && makaraFiyat > 0)
    ? Math.round((makaraFiyat / tlKg) * 1000)
    : VARSAYILAN_MAKARA_GRAM;
  const parcaMaliyet = tlKg > 0 ? (h.gram / 1000) * tlKg : null;
  const makaraAdet = (h.gram > 0 && makaraGram > 0) ? Math.floor(makaraGram / h.gram) : 0;

  return {
    gram: h.gram,
    etkinDoluluk: h.etkinDoluluk,
    yogunluk: h.yogunluk,
    filament: filament || null,
    tlKg,
    makaraFiyat,
    makaraGram,
    parcaMaliyet,
    makaraAdet,
  };
}

/**
 * Başarı kriterindeki tek cümlelik özet:
 * "Bu model için 140g filament gerek. En ucuz makara ₺499,00 TL (Robotistan).
 *  Parça başı maliyetiniz: ₺69,80 TL."
 */
export function ozetMetni(hesap) {
  if (!hesap || !(hesap.gram > 0)) return '';
  const g = tamSayi(Math.round(hesap.gram));
  if (hesap.filament && hesap.makaraFiyat > 0) {
    return `Bu model için ${g}g filament gerek. En ucuz makara ${para(hesap.makaraFiyat)} `
      + `(${hesap.filament.site || 'mağaza'}). Parça başı maliyetiniz: ${para(hesap.parcaMaliyet)}.`;
  }
  return `Bu model için ${g}g filament gerek. Canlı filament fiyatı alınamadı; `
    + 'tam maliyet sayfasından manuel fiyat girebilirsiniz.';
}

/**
 * CTA: "⚡ Bu Filamenti Robotistan'dan Satın Al (₺499,00) ➔"
 * @param {object} hesap
 * @param {{baglac?:string}} [secenek]  ör. { baglac: 'üzerinden' } → "... üzerinden Satın Al"
 */
export function ctaMetni(hesap, secenek = {}) {
  if (!hesap?.filament) return '⚡ Bu Filamenti Satın Al ➔';
  const site = String(hesap.filament.site || 'mağaza').trim();
  const fiyat = Number(hesap.makaraFiyat);
  const fiyatMetni = fiyat > 0 ? ` (${para(fiyat)})` : '';
  const baglac = secenek.baglac != null && String(secenek.baglac).trim()
    ? ' ' + String(secenek.baglac).trim()
    : turkceAblatif(site);
  return `⚡ Bu Filamenti ${site}${baglac} Satın Al${fiyatMetni} ➔`;
}

/** Makara verimi satırı: "1 makara ile bu parçadan tam 7 adet basabilirsiniz". */
export function verimMetni(hesap) {
  if (!hesap || !(hesap.gram > 0)) return '';
  if (hesap.makaraAdet > 0) {
    return `1 makara ile bu parçadan tam ${tamSayi(hesap.makaraAdet)} adet basabilirsiniz`;
  }
  return '1 makara bu parçanın tamamına yetmez';
}

export default {
  para, tamSayi, turkceAblatif, enUcuzFilament, hesaplaMaliyet,
  ozetMetni, ctaMetni, verimMetni, VARSAYILAN_MAKARA_GRAM,
};
