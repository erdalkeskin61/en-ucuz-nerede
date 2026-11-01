/**
 * Stok sıralama hiyerarşisi — TEK KAYNAK (2026-10-30)
 *
 * Neden ayrı modül: aynı sıralama daha önce pipeline'da, app.js'te (3 ayrı yerde),
 * öneri kartlarında ve tarayıcı eklentisinde ayrı ayrı yazılıydı. Biri değişince
 * diğerleri geride kalıyordu. Artık sunucu tarafında TEK fonksiyon var; API
 * `sonuclar` dizisi bu hiyerarşiyle SIRALI döner. İstemciler (web + eklenti) aynı
 * kuralı yalnızca filtreleme sonrası yeniden uygulamak için küçük bir kopya taşır.
 *
 * Hiyerarşi (kesin — fiyat ne kadar ucuz olursa olsun sıra değişmez):
 *   0) 🟢 Stokta var & aynı renk/model      → fiyat artan
 *   1) 🔴 Stokta yok & aynı renk/model      → fiyat artan
 *   2) 🎨 Stokta var & farklı renk/varyant  → fiyat artan
 *   3) 🎨 Stokta yok & farklı renk/varyant  → fiyat artan
 *   4) ⚪ Bulunamayan / hata / iptal         → fiyat yok, sonda
 */

/** Grup kimlikleri (0 en üst). */
export const STOK_GRUPLARI = Object.freeze({
  STOKTA_AYNI: 0,
  TUKENDI_AYNI: 1,
  STOKTA_FARKLI: 2,
  TUKENDI_FARKLI: 3,
  BULUNAMADI: 4,
});

/** Grup → insan okur etiket (arayüz/rapor için). */
export const STOK_GRUP_ETIKETI = Object.freeze({
  0: '🟢 Stokta · aynı ürün',
  1: '🔴 Tükendi · aynı ürün',
  2: '🎨 Stokta · farklı varyant',
  3: '🎨 Tükendi · farklı varyant',
  4: '⚪ Bulunamadı',
});

/** Ürün stokta mı? (bilinmiyorsa `true` kabul edilir — uydurma "tükendi" denmez) */
export function stoktaMi(r) {
  return r?.product?.inStock !== false;
}

/**
 * Karşılaştırılabilir fiyat: gerçek ödenecek tutar (kargo/kampanya sonrası).
 * Yoksa satış fiyatı; o da yoksa Infinity (sıralamada sona düşer, NaN üretmez).
 */
export function karsilastirmaFiyati(r) {
  const toplam = r?.product?.pricing?.toplam;
  if (Number.isFinite(toplam)) return toplam;
  const satis = r?.product?.sellingPrice;
  if (Number.isFinite(satis)) return satis;
  return Infinity;
}

/** Sonucun hiyerarşi grubu (0–4). */
export function stokGrubu(r) {
  if (!r || r.status !== 'found' || !r.product) return STOK_GRUPLARI.BULUNAMADI;
  const ayniRenk = r.renkAyni !== false;
  const stokta = stoktaMi(r);
  if (ayniRenk) return stokta ? STOK_GRUPLARI.STOKTA_AYNI : STOK_GRUPLARI.TUKENDI_AYNI;
  return stokta ? STOK_GRUPLARI.STOKTA_FARKLI : STOK_GRUPLARI.TUKENDI_FARKLI;
}

/**
 * Sonuçları hiyerarşiye göre sıralar. Girdi dizisi DEĞİŞTİRİLMEZ.
 * @template T
 * @param {T[]} liste
 * @returns {T[]}
 */
export function stokSirala(liste) {
  const dizi = Array.isArray(liste) ? [...liste] : [];
  return dizi.sort((a, b) => {
    const fark = stokGrubu(a) - stokGrubu(b);
    if (fark !== 0) return fark;
    const fa = karsilastirmaFiyati(a);
    const fb = karsilastirmaFiyati(b);
    if (fa === fb) return 0;
    if (fa === Infinity) return 1;   // fiyatsız her zaman sonra
    if (fb === Infinity) return -1;
    return fa - fb;
  });
}

/**
 * Stok özeti: `ozet` nesnesine giren sayaçlar.
 * @param {object[]} sonuclar
 */
export function stokOzet(sonuclar) {
  const hepsi = Array.isArray(sonuclar) ? sonuclar : [];
  const bulunan = hepsi.filter(r => r && r.status === 'found' && r.product);
  const stokta = bulunan.filter(r => stoktaMi(r));
  const tukendi = bulunan.filter(r => !stoktaMi(r));
  return {
    bulunanSiteSayisi: bulunan.length,
    stoktaVarSayisi: stokta.length,
    stoktaYokSayisi: tukendi.length,
    // Dürüstlük: hiç ürün bulunamadıysa "tümü tükendi" DENMEZ (site engellemiş olabilir).
    tamamiTukendi: bulunan.length > 0 && stokta.length === 0,
  };
}
