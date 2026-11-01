/**
 * Canlı barkod arama (2026-10-28).
 *
 * Kullanıcı fiziksel mağazada rafın önünde barkodu okutur; uygulama aynı ürünü
 * internet sitelerinde arar ve raftaki fiyatla karşılaştırır.
 *
 * Nasıl çalışır:
 *  1. Barkod (EAN-13/UPC) doğrulanır (8–14 hane, yalnız rakam).
 *  2. Her sitede barkod DİZGİSİYLE arama yapılır (siteler barkodu arama dizininde
 *     tutuyor — canlı testte Anycubic barkodu Trendyol/HB/n11/MediaMarkt'ta bulundu).
 *  3. Doğrulama: listede barkod alanı varsa doğrudan karşılaştırılır; yoksa ürün
 *     sayfası çekilip sayfadaki GERÇEK barkod okunur. Barkod tutmayan aday
 *     "bulunamadı" sayılır — arama motorunun popüler ürün döndürmesi yanlış
 *     eşleşmeye yol açmasın.
 *  4. Fiyat hızlı hesaplanır (YZ kampanya sınıflandırması YOK): rafta bekleyen
 *     kullanıcı 20 saniye değil ~10 saniye beklemeli. Bu yüzden yalnızca herkesin
 *     alabileceği, sayfada açıkça yazılı indirimler ve kargo hesaba katılır;
 *     kupona/karta bağlı kampanyalar `kampanyaKosullu` olarak listelenir.
 *
 * Dürüstlük: hiçbir sitede bulunamazsa "bulunamadı" döner, tahmin üretilmez.
 */
import { adapters, adapterById } from './sites/index.js';
import { computePricing } from './pricing.js';
import { normalizeBarcode, formatTL, dominantColor, titleSimilarity } from './util.js';
import { HIZLI_SITELER } from './basketOptimizer.js';
import { afiliyeLink } from './afiliye.js';
import { stokSirala, stokOzet } from './stokSirala.js';

const BARKOD_MIN = 8;
const BARKOD_MAX = 14;

/** Barkodu doğrular; geçerliyse normalize edilmiş hâlini döndürür. */
export function barkodDogrula(girdi) {
  const ham = String(girdi || '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(ham)) return { gecerli: false, hata: 'Barkod yalnızca rakamlardan oluşmalı' };
  if (ham.length < BARKOD_MIN) return { gecerli: false, hata: `Barkod en az ${BARKOD_MIN} haneli olmalı` };
  if (ham.length > BARKOD_MAX) return { gecerli: false, hata: `Barkod en fazla ${BARKOD_MAX} haneli olmalı` };
  return { gecerli: true, barkod: ham };
}

/** EAN-13 kontrol hanesini doğrular (13 hane için). */
export function eanKontrolHaneli(barkod) {
  const s = String(barkod || '');
  if (s.length !== 13 || !/^\d+$/.test(s)) return null; // yalnız EAN-13 için anlamlı
  const rakamlar = s.split('').map(Number);
  const kontrol = rakamlar.pop();
  const toplam = rakamlar.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const hesaplanan = (10 - (toplam % 10)) % 10;
  return hesaplanan === kontrol;
}

/**
 * Bir barkodu sitelerde arar.
 *
 * @param {string} girdiBarkod
 * @param {{onProgress?:Function, signal?:AbortSignal, siteler?:string[], hizliMod?:boolean, maxAday?:number}} opts
 */
export async function barkodAra(girdiBarkod, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal || null;
  const iptalMi = () => !!(signal && signal.aborted);
  const basladi = Date.now();

  const dogrulama = barkodDogrula(girdiBarkod);
  if (!dogrulama.gecerli) throw new Error(dogrulama.hata);
  const barkod = dogrulama.barkod;

  const hizliMod = opts.hizliMod !== false;
  // Açıkça verilen boş dizi "site yok" demektir.
  const siteListesi = Array.isArray(opts.siteler)
    ? opts.siteler
    : (hizliMod ? HIZLI_SITELER : adapters.map(a => a.id));
  const maxAday = Math.max(1, Math.min(opts.maxAday || 2, 4)); // site başına sayfa çekme sınırı
  // Site başına üst sınır (2026-10-28): bir mağaza yanıt vermezse tüm barkod işi
  // sonsuza kadar "29/30 site" ekranında kalıyordu ve kullanıcı HİÇ sonuç göremiyordu
  // (raf fiyatı/tasarruf kartı da hiç çizilmiyordu). Artık yavaş site atlanır.
  const siteZamanAsimi = Math.max(5000, Number(opts.siteTimeoutMs) || 25000);

  /** Sözü belirtilen süre içinde sonuçlandırır; aşılırsa reddeder. */
  const sureli = (promise, ms, etiket) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(etiket + ' zaman aşımı (' + Math.round(ms / 1000) + ' sn)')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });

  onProgress({ faz: 'arama', barkod, toplam: siteListesi.length, biten: 0, not: 'Barkod sitelerde aranıyor…' });

  const sonuclar = [];
  let biten = 0;

  // Eşzamanlılık sınırlı iş kuyruğu
  let imlec = 0;
  const isci = async () => {
    while (true) {
      if (iptalMi()) return;
      const i = imlec++;
      if (i >= siteListesi.length) return;
      const id = siteListesi[i];
      const adapter = adapterById(id);
      if (!adapter) { biten++; continue; }

      const kayit = {
        site: id,
        siteName: adapter.name,
        status: 'not_found',
        reason: '',
        product: null,
        barkodDogrulandi: false,
        matchBasis: null,
      };

      try {
        const adaylar = await sureli(
          adapter.searchProducts(barkod, { spend: 0 }).then(r => r || []),
          siteZamanAsimi,
          adapter.name + ' arama',
        );

        if (!adaylar.length) {
          kayit.reason = 'Bu barkodla sonuç yok';
          sonuclar.push(kayit);
        } else {
          // 1) Listede barkod alanı varsa doğrudan eşleşme (en hızlı yol)
          const listeEslesme = adaylar.find(c => {
            const cb = normalizeBarcode(c.barcode || '');
            return cb && cb === barkod;
          });

          // 2) Aksi halde ürün sayfasından gerçek barkodu oku (en fazla maxAday)
          let bulunan = null;
          let secilen = listeEslesme || null;
          if (secilen) {
            bulunan = { cand: secilen, barkodDogrulandi: true, basis: 'liste_barkod' };
          } else {
            const adayPen = adaylar.slice(0, maxAday);
            for (const c of adayPen) {
              if (iptalMi()) break;
              if (!c.url) continue;
              try {
                const p = await sureli(
                  adapter.getProduct(c.url, { spend: 0 }),
                  siteZamanAsimi,
                  adapter.name + ' ürün',
                );
                const pb = normalizeBarcode(p.barcode || '');
                if (pb && pb === barkod) {
                  bulunan = { cand: c, product: p, barkodDogrulandi: true, basis: 'sayfa_barkod' };
                  break;
                }
              } catch { /* sayfa okunamadı → sonraki aday */ }
            }
          }

          if (!bulunan) {
            kayit.reason = adaylar.length
              ? `${adaylar.length} sonuç var ama barkod (${barkod}) doğrulanamadı`
              : 'Bu barkodla sonuç yok';
            sonuclar.push(kayit);
          } else {
            const product = bulunan.product || await sureli(
              adapter.getProduct(bulunan.cand.url, { spend: 0 }),
              siteZamanAsimi,
              adapter.name + ' ürün',
            );
            // Hızlı fiyat: YZ yok, yalnızca sayfadaki açık indirimler + kargo
            product.pricing = computePricing(product, []);
            product.siteKampanyalari = [];
            product.classifiedCampaigns = [];
            kayit.status = 'found';
            kayit.barkodDogrulandi = bulunan.barkodDogrulandi;
            kayit.matchBasis = bulunan.basis;
            kayit.product = {
              url: product.url,
              afiliyeUrl: afiliyeLink(id, product.url),
              title: product.title,
              brand: product.brand,
              modelCode: product.modelCode,
              barcode: product.barcode,
              color: product.color,
              inStock: product.inStock,
              seller: product.seller,
              image: product.image,
              sellingPrice: product.sellingPrice,
              listPrice: product.listPrice,
              shipping: product.shipping,
              pricing: product.pricing,
            };
            // DİKKAT (2026-10-28 hatası): bulunduğunda da listeye EKLE. Eksik olduğu için
            // barkod bulunan siteler sonuçtan düşüyor ve "hiçbir sitede bulunamadı" deniyordu.
            sonuclar.push(kayit);
          }
        }
      } catch (e) {
        kayit.status = 'error';
        kayit.reason = String(e.message || e).slice(0, 160);
        sonuclar.push(kayit);
      }

      biten++;
      onProgress({
        faz: 'arama',
        barkod,
        toplam: siteListesi.length,
        biten,
        site: id,
        siteName: adapter.name,
        durum: kayit.status,
        fiyat: kayit.product?.pricing?.toplam ?? null,
        not: kayit.status === 'found'
          ? (kayit.product.title || '').slice(0, 60)
          : (kayit.reason || ''),
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(8, siteListesi.length) }, () => isci()));

  if (iptalMi()) {
    return {
      barkod,
      iptalEdildi: true,
      // Stok hiyerarşisi (2026-10-30): stokta olanlar önce, tükenenler sonda.
      sonuclar: stokSirala(sonuclar),
      ozet: {
        toplamSureMs: Date.now() - basladi,
        tarananSite: biten,
        bulunanSite: sonuclar.filter(s => s.status === 'found').length,
        ...stokOzet(sonuclar),
      },
    };
  }

  // En ucuz: aynı renk/stoğu olan ürünler arasında
  const bulunanlar = sonuclar.filter(s => s.status === 'found' && s.product?.pricing?.toplam != null);
  let enUcuz = null;
  for (const s of bulunanlar) {
    if (s.product.inStock === false) continue;
    if (!enUcuz || s.product.pricing.toplam < enUcuz.product.pricing.toplam) enUcuz = s;
  }
  if (enUcuz) enUcuz.enUcuz = true;

  const baslik = enUcuz?.product?.title || bulunanlar[0]?.product?.title || null;
  const marka = enUcuz?.product?.brand || bulunanlar[0]?.product?.brand || null;

  return {
    barkod,
    barkodGecerli: eanKontrolHaneli(barkod),
    urun: baslik,
    marka,
    sonuclar: stokSirala(sonuclar),
    ozet: {
      toplamSureMs: Date.now() - basladi,
      tarananSite: biten,
      bulunanSite: bulunanlar.length,
      ...stokOzet(sonuclar),
      enUcuzSite: enUcuz?.siteName || null,
      enUcuzFiyat: enUcuz?.product?.pricing?.toplam ?? null,
      enUcuzUrl: enUcuz?.product?.url || null,
      enUcuzAfiliyeUrl: enUcuz?.product?.afiliyeUrl || null,
      enUcuzSatici: enUcuz?.product?.seller || null,
    },
  };
}

/**
 * Raf fiyatıyla karşılaştırma yapar (kullanıcı mağazadaki fiyatı girer).
 *
 * @param {{internetFiyat:number|null, rafFiyat:number|null}} girdi
 */
export function tasarrufHesapla({ internetFiyat, rafFiyat }) {
  const i = Number(internetFiyat);
  const r = Number(rafFiyat);
  if (!isFinite(i) || !isFinite(r) || i <= 0 || r <= 0) {
    return { hesaplanabilir: false, fark: null, yuzde: null };
  }
  const fark = Math.round((r - i) * 100) / 100;
  const yuzde = r > 0 ? Math.round((fark / r) * 1000) / 10 : null;
  return {
    hesaplanabilir: true,
    fark,
    yuzde,
    dahaUcuz: fark > 0,
    metin: fark > 0
      ? `İnternette ${formatTL(fark)} (%${String(yuzde).replace('.', ',')}) daha ucuz`
      : fark === 0
        ? 'Fiyatlar aynı'
        : `Raf fiyatı ${formatTL(Math.abs(fark))} daha ucuz`,
  };
}
