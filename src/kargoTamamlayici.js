/**
 * Kargo Bedava Tamamlayıcı Motoru (Shipping Threshold Filler).
 *
 * Problem: bir sitede kargo bedava eşiği 500 TL, ürün 470 TL ise kullanıcı 50 TL
 * kargo ödüyor. 30 TL'lik bir "tamamlayıcı" ekleyince eşik aşılıyor ve kargo
 * bedava oluyor → 35 TL'lik pil alıp 50 TL kargodan kurtulmak 15 TL kâr demek.
 *
 * Kural (dürüstlük): tamamlayıcı YALNIZCA şu aralıkta anlamlıdır:
 *   alt sınır = eşiğe kalan eksik tutar      (yoksa eşik aşılmaz)
 *   üst sınır = ödenmesi gereken kargo ücreti (daha pahalıysa "kâr" yok)
 * Aralıkta ürün yoksa öneri üretilmez — uydurma yok. Ürünün kendisi faydalı bir
 * şey olduğu için "kâr" = kargo ücreti − tamamlayıcı fiyatı olarak raporlanır
 * (aldığın ürünün değeri ayrıca kazançtır; bunu abartmıyoruz).
 *
 * Maliyet: her site için en fazla birkaç arama yapılır ve sonuç 30 dk önbelleklenir.
 */
import { adapterById } from './sites/index.js';
import { formatTL } from './util.js';
import { afiliyeLink } from './afiliye.js';

/** Tamamlayıcı olarak aranacak ürün türleri (pazaryerlerinde neredeyse hep var). */
export const VARSAYILAN_ANAHTARLAR = ['pil', 'kalem', 'ıslak mendil', 'etiket'];

const ONBELLEK_OMRU_MS = 30 * 60 * 1000;
const aramaOnbellegi = new Map(); // `${site}:${keyword}` -> { ts, urunler }

/**
 * Sepetin kargo eşiğine göre açığını hesaplar.
 *
 * @param {{sepetToplam:number, kargo:{fee?:number|null, freeOver?:number|null, freeOverExclusive?:boolean, applies?:boolean|null}|null}} girdi
 * @returns {{var:boolean, eksik:number, kargoUcreti:number, esik:number|null, neden:string}}
 */
export function kargoAcigi({ sepetToplam, kargo }) {
  const toplam = Number(sepetToplam);
  const bos = { var: false, eksik: 0, kargoUcreti: 0, esik: null, neden: '' };

  if (!isFinite(toplam) || toplam <= 0) return { ...bos, neden: 'Sepet tutarı bilinmiyor' };
  if (!kargo) return { ...bos, neden: 'Kargo bilgisi yok' };
  if (kargo.applies === false) return { ...bos, neden: 'Bu sitede kargo zaten ücretsiz' };

  const esik = kargo.freeOver != null ? Number(kargo.freeOver) : null;
  const ucret = kargo.fee != null ? Number(kargo.fee) : null;

  if (esik == null) return { ...bos, neden: 'Bu sitede kargo bedava eşiği tanımlı değil' };
  if (ucret == null || ucret <= 0) return { ...bos, neden: 'Kargo ücreti bilinmiyor (eşik altında ücret sepette netleşir)' };

  const kurusa = (x) => Math.round(x * 100);
  const gecti = kargo.freeOverExclusive === true
    ? kurusa(toplam) > kurusa(esik)
    : kurusa(toplam) >= kurusa(esik);

  if (gecti) return { ...bos, esik, kargoUcreti: ucret, neden: 'Eşik zaten aşıldı — kargo bedava' };

  // freeOverExclusive ise tam eşik yetmez: 1 kuruş fazlası gerekir
  const eksikKurus = kurusa(esik) - kurusa(toplam) + (kargo.freeOverExclusive === true ? 1 : 0);
  const eksik = Math.round(eksikKurus) / 100;

  return { var: true, eksik, kargoUcreti: ucret, esik, neden: `${formatTL(eksik)} daha eklenirse kargo bedava` };
}

/** Bir sitede anahtar kelimeyle arama yapar (30 dk önbellekli). */
async function siteAra(adapter, keyword, ctx) {
  const anahtar = adapter.id + ':' + keyword;
  const kayit = aramaOnbellegi.get(anahtar);
  if (kayit && Date.now() - kayit.ts < ONBELLEK_OMRU_MS) return kayit.urunler;

  let urunler = [];
  try {
    urunler = await adapter.searchProducts(keyword, ctx) || [];
  } catch {
    urunler = [];
  }
  aramaOnbellegi.set(anahtar, { ts: Date.now(), urunler });
  return urunler;
}

/**
 * Kargo açığını kapatacak tamamlayıcı ürün önerileri bulur.
 *
 * @param {string} siteId
 * @param {{sepetToplam:number, kargo:object, limit?:number, anahtarlar?:string[], ctx?:object, adapter?:object}} opts
 */
export async function tamamlayiciBul(siteId, opts = {}) {
  const acik = kargoAcigi({ sepetToplam: opts.sepetToplam, kargo: opts.kargo });
  if (!acik.var) return { ...acik, oneriler: [] };

  // Testlerde sahte adaptör enjekte edilebilir; üretimde kayıt defterinden alınır.
  const adapter = opts.adapter || adapterById(siteId);
  if (!adapter) return { ...acik, oneriler: [], hata: 'Site adaptörü bulunamadı' };

  const limit = Math.max(1, Math.min(opts.limit || 4, 8));
  const anahtarlar = Array.isArray(opts.anahtarlar) && opts.anahtarlar.length
    ? opts.anahtarlar
    : VARSAYILAN_ANAHTARLAR;
  const ctx = opts.ctx || { spend: 0 };

  const kurusa = (x) => Math.round(Number(x) * 100);
  const minKurus = kurusa(acik.eksik);
  const maxKurus = kurusa(acik.kargoUcreti); // bundan pahalıysa kâr yok

  const gorulen = new Map(); // url -> aday
  for (const kw of anahtarlar) {
    const urunler = await siteAra(adapter, kw, ctx);
    for (const u of urunler) {
      if (!u || !u.title || !u.url || u.price == null) continue;
      const fiyatKurus = kurusa(u.price);
      if (fiyatKurus < minKurus || fiyatKurus > maxKurus) continue;
      if (gorulen.has(u.url)) continue;
      gorulen.set(u.url, {
        title: String(u.title).slice(0, 140),
        url: u.url,
        afiliyeUrl: afiliyeLink(siteId, u.url),
        fiyat: Math.round(fiyatKurus) / 100,
        kazanc: Math.round((maxKurus - fiyatKurus)) / 100, // kargo ücretinden ne kadar az
        anahtar: kw,
      });
    }
    if (gorulen.size >= limit * 3) break; // yeterince aday toplandı
  }

  const oneriler = [...gorulen.values()]
    .sort((a, b) => {
      // Önce en yüksek kâr, sonra eşiği tam karşılayan (gereksiz fazla alım yok)
      if (b.kazanc !== a.kazanc) return b.kazanc - a.kazanc;
      return a.fiyat - b.fiyat;
    })
    .slice(0, limit);

  return { ...acik, oneriler };
}

/** Öneri metnini kullanıcıya gösterilecek biçimde üretir. */
export function tamamlayiciMetni(acik, oneri) {
  if (!acik?.var || !oneri) return null;
  return `${formatTL(acik.kargoUcreti)} kargo ödemek yerine ${formatTL(oneri.fiyat)}'ye `
    + `"${oneri.title}" ekleyerek kargoyu bedavaya getirebilir, ${formatTL(oneri.kazanc)} kâr edebilirsiniz.`;
}

/** Önbelleği temizler (testler ve elle yenileme için). */
export function onbellegiTemizle() {
  aramaOnbellegi.clear();
}
