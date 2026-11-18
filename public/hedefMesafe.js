/**
 * 🎯 "Hedefe Kalan Mesafe" hesabı (2026-11-12)
 *
 * Saf fonksiyonlar: DOM'a dokunmaz, ağ isteği atmaz → doğrudan test edilir.
 * Ayarlar sayfasındaki takip kartları bu modülü kullanır (tek kaynak).
 *
 * Oran mantığı: hedefe ne kadar yaklaşıldığının görsel karşılığı.
 *   oran = hedef / mevcut × 100
 *   5 altına düşmez (çubuk görünmez olmasın), 99'u geçmez (ulaşılmadıysa
 *   "%100" yazmak yanıltıcı olurdu; %100 yalnızca gerçekten ulaşılınca).
 */

/** Çubuk rengi eşikleri (CSS sınıflarıyla birebir). */
export const HEDEF_RENK_ESIKLERI = Object.freeze({ yesil: 90, indigo: 70 });

/**
 * Takip kaydından "mevcut en ucuz fiyat"ı çıkarır.
 *
 * Öncelik:
 *   1) Son kontrol kaydındaki `enUcuzFiyat` (botun doğruladığı gerçek değer)
 *   2) `sonFiyatlar[].fiyat` içindeki en düşük pozitif değer
 * Hiçbiri yoksa null (uydurma fiyat üretilmez).
 *
 * @param {object} takip
 * @returns {number|null}
 */
export function mevcutEnUcuzFiyat(takip) {
  const gecmis = Array.isArray(takip?.fiyatGecmisi) ? takip.fiyatGecmisi : [];
  const sonKayit = gecmis.length ? gecmis[gecmis.length - 1] : null;
  const kayitFiyat = Number(sonKayit?.enUcuzFiyat);
  if (Number.isFinite(kayitFiyat) && kayitFiyat > 0) return kayitFiyat;

  const liste = Array.isArray(takip?.sonFiyatlar) ? takip.sonFiyatlar : [];
  const fiyatlar = liste
    .map(f => Number(f?.fiyat))
    .filter(f => Number.isFinite(f) && f > 0);
  if (!fiyatlar.length) return null;
  return Math.min(...fiyatlar);
}

/**
 * Hedefe kalan mesafeyi hesaplar.
 *
 * @param {number|null} mevcutFiyat güncel en ucuz fiyat (TL)
 * @param {number|null} hedefFiyat   kullanıcının hedefi (TL)
 * @returns {{
 *   durum: 'hedef_yok'|'fiyat_yok'|'ulasildi'|'yol',
 *   mevcut: number|null, hedef: number|null,
 *   kalanTL: number|null, oran: number|null,
 *   renk: 'yesil'|'indigo'|'amber'|null,
 *   yakin: boolean,
 * }}
 */
export function hedefMesafeHesapla(mevcutFiyat, hedefFiyat) {
  const mevcut = Number(mevcutFiyat);
  const hedef = Number(hedefFiyat);
  const bos = {
    durum: 'hedef_yok', mevcut: null, hedef: null,
    kalanTL: null, oran: null, renk: null, yakin: false,
  };

  const hedefGecerli = Number.isFinite(hedef) && hedef > 0;
  const mevcutGecerli = Number.isFinite(mevcut) && mevcut > 0;

  if (!hedefGecerli) return { ...bos, mevcut: mevcutGecerli ? mevcut : null };
  if (!mevcutGecerli) return { ...bos, durum: 'fiyat_yok', hedef };

  // Hedefe ulaşıldı: mevcut fiyat hedefin altında/eşit.
  if (mevcut <= hedef) {
    return {
      durum: 'ulasildi',
      mevcut,
      hedef,
      kalanTL: 0,
      oran: 100,
      renk: 'yesil',
      yakin: true,
    };
  }

  const kalanTL = Math.round((mevcut - hedef) * 100) / 100;
  const hamOran = Math.round((hedef / mevcut) * 100);
  // 5 altı: çubuk görünür kalsın. 99 üstü: henüz ulaşılmadı → %100 yazma.
  const oran = Math.min(99, Math.max(5, hamOran));
  const renk = oran >= HEDEF_RENK_ESIKLERI.yesil
    ? 'yesil'
    : (oran >= HEDEF_RENK_ESIKLERI.indigo ? 'indigo' : 'amber');

  return {
    durum: 'yol',
    mevcut,
    hedef,
    kalanTL,
    oran,
    renk,
    // %90+ → "çok yakın" parıltısı.
    yakin: oran >= HEDEF_RENK_ESIKLERI.yesil,
  };
}

export default { HEDEF_RENK_ESIKLERI, mevcutEnUcuzFiyat, hedefMesafeHesapla };
