/**
 * Muadil (alternatif) ürün öneri motoru — 2026-10-28
 *
 * NE ZAMAN DEVREYE GİRER (dürüstlük kuralı): yalnızca ölçülebilir üç durumda.
 *   1) STOK YOK  : aynı renkteki tüm teklifler `inStock === false`.
 *   2) BÜTÇE AŞIMI: kullanıcı bütçe verdiyse ve en ucuz teklif bütçeyi aşıyorsa.
 *   3) FİYAT YÜKSEK: ürünün GERÇEK fiyat geçmişi varsa (en az 3 gün) ve şu anki fiyat
 *      son N günün en düşüğünün %20+ üzerindeyse.
 * "Aşırı pahalı" için başka bir varsayım YAPILMAZ — piyasa ortalaması uydurulmaz.
 * Kullanıcı ayrıca "muadil öner" düğmesiyle elle tetikleyebilir.
 *
 * UYDURMA YASAĞI:
 *  - YZ'ye yalnızca gerçek ürün başlığı gönderilir, ham HTML gitmez.
 *  - YZ'nin seçtiği her muadil, GERÇEK arama sonuçlarındaki bir URL'ye eşlenir;
 *    listede olmayan URL atılır.
 *  - ÖNEMLİ: site ARAMA LİSTESİ fiyatları güvenilmez (ölçüm: 500 TL'lik filament
 *    listede 11 TL görünüyordu). Bu yüzden her adayın ÜRÜN SAYFASI okunur ve
 *    fiyat/%-hesabı yalnızca oradan gelen GERÇEK fiyatla yapılır.
 *  - Muadil, kaynak ürünün kendisi olamaz (matchProducts / model kodu / barkod).
 *  - Muadil gerçekten daha ucuz değilse gösterilmez.
 */
import { adapters, adapterById } from './sites/index.js';
import { alternatifSorgulari, alternatifSec } from './ai.js';
import { matchProducts, normalizeModelCode, normalizeBarcode, formatTL } from './util.js';
import { afiliyeLink } from './afiliye.js';
import { getPriceAnalytics } from './store.js';

/** Muadil aramasında taranacak siteler: pazaryerleri önce, sonra uzman mağazalar. */
const ONCELIK = ['trendyol', 'hepsiburada', 'amazon', 'n11', 'mediamarkt', 'vatan', 'itopya', 'incehesap', 'pazarama', 'teknosa', 'koctas', 'pttavm', 'ciceksepeti'];
const ARAMA_SITELERI = [
  ...ONCELIK.filter(id => adapters.some(a => a.id === id)),
  ...adapters.map(a => a.id).filter(id => !ONCELIK.includes(id)),
];

const FIYAT_YUKSEK_ORANI = 1.20; // son dip fiyatın %20 üzeri = "yüksek"
const YETERLI_GUN = 3;           // trend yorumu için en az gün sayısı
const SITE_BASINA_ADAY = 3;
const TOPLAM_ADAY_USTU = 16;     // YZ'ye gidecek en fazla doğrulanmış aday
const DOGRULANACAK_ADAY = 12;    // ürün sayfası okunacak en fazla aday
const ESZAMANLI_SITE = 6;
const SITE_ZAMAN_ASIMI_MS = 20000;

/** Bir sözü süreyle sınırlar (yavaş site tüm işi kilitlemesin). */
function sureli(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('zaman aşımı')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Karşılaştırma sonucundan "mevcut durum" çıkarır: en ucuz aynı-renk teklif.
 * Sepet sonuçları ve barkod sonuçları da bu biçime çevrilebilir.
 */
export function mevcutDurum(sonuc) {
  const teklifler = (sonuc?.sonuclar || [])
    .filter(s => s.status === 'found' && s.product)
    .filter(s => s.renkAyni !== false)
    .map(s => ({
      site: s.site,
      siteName: s.siteName,
      url: s.product.url,
      title: s.product.title,
      fiyat: s.product.pricing?.toplam ?? s.product.sellingPrice ?? null,
      inStock: s.product.inStock,
      modelCode: s.product.modelCode || null,
      barcode: s.product.barcode || null,
      brand: s.product.brand || null,
      image: s.product.image || null,
    }))
    .filter(t => t.fiyat != null && t.fiyat > 0)
    .sort((a, b) => a.fiyat - b.fiyat);

  const stokta = teklifler.filter(t => t.inStock !== false);
  return {
    teklifler,
    enUcuz: stokta[0] || null,             // stokta olan en ucuz
    enUcuzStoktaYok: teklifler[0] || null, // stok durumuna bakmadan en ucuz
    stoktaVarMi: stokta.length > 0,
    teklifVarMi: teklifler.length > 0,
  };
}

/**
 * Muadil öneri gerekip gerekmediğini ölçülebilir kurallarla belirler.
 *
 * @param {object} sonuc runComparison çıktısı
 * @param {{butce?:number|null, urunKimlik?:string|null, gecmis?:object|null}} opts
 * @returns {{gerekli:boolean, tetik:string|null, baslik:string, aciklama:string, mevcut:object}}
 */
export function muadilGerekliMi(sonuc, opts = {}) {
  const mevcut = mevcutDurum(sonuc);
  const sonucYok = !mevcut.teklifVarMi;

  const baz = {
    gerekli: false,
    tetik: null,
    baslik: '',
    aciklama: '',
    mevcut,
  };

  if (sonucYok) {
    return {
      ...baz,
      gerekli: true,
      tetik: 'hic_bulunamadi',
      baslik: 'Bu ürün hiçbir sitede bulunamadı',
      aciklama: 'Aynı ihtiyacı karşılayabilecek muadil ürünlere bakabilirsin.',
    };
  }

  // 1) STOK YOK
  if (!mevcut.stoktaVarMi) {
    return {
      ...baz,
      gerekli: true,
      tetik: 'stok_yok',
      baslik: 'Bu ürün stokta yok',
      aciklama: `Aynı ürünü satan ${mevcut.teklifler.length} mağazanın tamamı stokta yok görünüyor.`,
    };
  }

  // 2) BÜTÇE AŞIMI (yalnızca kullanıcı bütçe verdiyse)
  const butce = Number(opts.butce);
  if (Number.isFinite(butce) && butce > 0 && mevcut.enUcuz && mevcut.enUcuz.fiyat > butce) {
    const fark = mevcut.enUcuz.fiyat - butce;
    return {
      ...baz,
      gerekli: true,
      tetik: 'butce_asimi',
      baslik: 'Bütçenin üzerinde',
      aciklama: `En ucuz teklif ${formatTL(mevcut.enUcuz.fiyat)} — bütçeni ${formatTL(fark)} aşıyor.`,
    };
  }

  // 3) FİYAT GEÇMİŞE GÖRE YÜKSEK (yalnızca gerçek geçmiş varsa)
  const kimlik = opts.urunKimlik || sonuc?.kaynak?.modelKodu || sonuc?.kaynak?.barkod || sonuc?.kaynak?.urun;
  if (kimlik) {
    let gecmis = opts.gecmis;
    if (!gecmis) {
      try { gecmis = getPriceAnalytics(kimlik, { currentPrice: mevcut.enUcuz.fiyat }); } catch { gecmis = null; }
    }
    const s = gecmis?.summary;
    if (s && gecmis.gunSayisi >= YETERLI_GUN && s.lowestPrice > 0) {
      const oran = mevcut.enUcuz.fiyat / s.lowestPrice;
      if (oran >= FIYAT_YUKSEK_ORANI) {
        const yuzde = Math.round((oran - 1) * 100);
        return {
          ...baz,
          gerekli: true,
          tetik: 'fiyat_yuksek',
          baslik: 'Fiyat son günlerin üzerinde',
          aciklama: `Şu anki en ucuz fiyat (${formatTL(mevcut.enUcuz.fiyat)}), son ${gecmis.gunSayisi} günün en düşüğünden (%${yuzde}) yüksek. `
            + 'Muadil ürünler daha uygun olabilir.',
        };
      }
    }
  }

  return baz;
}

/**
 * Muadil ürünleri bulur.
 *
 * @param {object} sonuc runComparison çıktısı (kaynak + sonuclar)
 * @param {{butce?:number|null, onProgress?:Function, signal?:AbortSignal,
 *          maxAlternatif?:number, siteler?:string[], elle?:boolean}} opts
 */
export async function muadilBul(sonuc, opts = {}) {
  const basladi = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const sinyal = opts.signal || null;
  const iptalMi = () => !!(sinyal && sinyal.aborted);

  const durum = muadilGerekliMi(sonuc, opts);
  const kaynak = sonuc?.kaynak || {};
  const secilenMevcut = durum.mevcut.enUcuz || durum.mevcut.enUcuzStoktaYok || null;

  const sonucBos = {
    gerekli: durum.gerekli,
    tetik: durum.tetik,
    baslik: durum.baslik,
    aciklama: durum.aciklama,
    mevcut: {
      fiyat: secilenMevcut?.fiyat ?? null,
      site: secilenMevcut?.site ?? null,
      siteName: secilenMevcut?.siteName ?? null,
      urun: kaynak.urun || secilenMevcut?.title || null,
    },
    alternatifler: [],
    ortakOzellik: null,
    sorgular: [],
    uyarilar: [],
    fiyatDogrulandi: true, // tüm fiyatlar ürün sayfasından
    sureMs: 0,
  };

  const urunBaslik = kaynak.urun || secilenMevcut?.title || '';
  if (!urunBaslik) {
    return { ...sonucBos, uyarilar: ['Muadil aramak için ürün başlığı gerekiyor.'], sureMs: Date.now() - basladi };
  }

  // Elle tetiklenmediyse ve kural tutmuyorsa hiç arama yapma (boşa istek yok).
  const elle = opts.elle === true;
  if (!durum.gerekli && !elle) {
    return { ...sonucBos, sureMs: Date.now() - basladi };
  }

  onProgress({ faz: 'sorgu', not: 'Muadil arama kriterleri hazırlanıyor…' });
  const { sorgular, ortakOzellik } = await alternatifSorgulari({
    title: urunBaslik,
    brand: kaynak.marka || secilenMevcut?.brand || null,
  });

  if (!sorgular.length) {
    return {
      ...sonucBos,
      ortakOzellik,
      uyarilar: ['Muadil arama sorgusu üretilemedi (ürün başlığı yeterince açıklayıcı değil).'],
      sureMs: Date.now() - basladi,
    };
  }

  const siteListesi = Array.isArray(opts.siteler) && opts.siteler.length ? opts.siteler : ARAMA_SITELERI;
  onProgress({ faz: 'arama', sorgular, toplamSite: siteListesi.length, not: 'Muadil ürünler sitelerde aranıyor…' });

  // Kaynak ürünün kimliği: muadil listesine kendisi girmesin
  const kaynakKimlik = {
    title: urunBaslik,
    brand: kaynak.marka || null,
    modelCode: kaynak.modelKodu || secilenMevcut?.modelCode || null,
    barcode: kaynak.barkod || secilenMevcut?.barcode || null,
  };

  const bulunan = [];
  const gorulenUrl = new Set();
  let biten = 0;

  const siteAra = async (id) => {
    const adapter = adapterById(id);
    if (!adapter) return;
    for (const sorgu of sorgular) {
      if (iptalMi()) return;
      let adaylar = [];
      try {
        adaylar = await sureli(adapter.searchProducts(sorgu, { spend: 0 }).then(r => r || []), SITE_ZAMAN_ASIMI_MS);
      } catch { continue; }
      for (const a of adaylar.slice(0, SITE_BASINA_ADAY * 2)) {
        if (!a?.url || !a?.title || gorulenUrl.has(a.url)) continue;
        gorulenUrl.add(a.url);
        bulunan.push({
          site: id,
          siteName: adapter.name,
          title: String(a.title).slice(0, 200),
          url: a.url,
          price: a.price != null && Number.isFinite(Number(a.price)) ? Number(a.price) : null,
          modelCode: a.modelCode || null,
          barcode: a.barcode || null,
          brand: a.brand || null,
        });
      }
    }
    biten++;
    onProgress({ faz: 'arama', biten, toplamSite: siteListesi.length, not: `${adapter.name} tarandı` });
  };

  const kuyruk = [...siteListesi];
  await new Promise((bitti) => {
    let aktif = 0;
    let bittiMi = false;
    const bitir = () => { if (!bittiMi) { bittiMi = true; bitti(); } };
    const calistir = () => {
      if (iptalMi()) { if (aktif === 0) bitir(); return; }
      while (aktif < ESZAMANLI_SITE && kuyruk.length) {
        const id = kuyruk.shift();
        aktif++;
        siteAra(id).catch(() => {}).finally(() => {
          aktif--;
          if (!kuyruk.length && aktif === 0) bitir();
          else calistir();
        });
      }
      if (!kuyruk.length && aktif === 0) bitir();
    };
    calistir();
  });

  if (iptalMi()) {
    return { ...sonucBos, ortakOzellik, sorgular, uyarilar: ['İptal edildi.'], sureMs: Date.now() - basladi };
  }

  // ---- ELEME: aynı ürün olamaz + liste fiyatı ön elemesi ----
  const mevcutFiyat = secilenMevcut?.fiyat ?? null;
  const fiyatTavani = mevcutFiyat != null ? mevcutFiyat : Infinity;

  const elenen = { ayniUrun: 0, pahali: 0, fiyatsiz: 0, stokYok: 0, dogrulanamadi: 0 };
  const uygun = [];
  for (const a of bulunan) {
    if (a.price == null) { elenen.fiyatsiz++; continue; }
    if (a.price >= fiyatTavani) { elenen.pahali++; continue; }
    // Aynı ürün mü? (kaynak ürünün kendisini muadil diye önermeyelim)
    const eslesme = matchProducts(
      {
        title: kaynakKimlik.title,
        brand: kaynakKimlik.brand,
        modelCode: kaynakKimlik.modelCode,
        barcode: kaynakKimlik.barcode,
      },
      { title: a.title, brand: a.brand, modelCode: a.modelCode, barcode: a.barcode },
    );
    if (eslesme) { elenen.ayniUrun++; continue; }
    const km = normalizeModelCode(kaynakKimlik.modelCode);
    const am = normalizeModelCode(a.modelCode);
    if (km && am && km === am) { elenen.ayniUrun++; continue; }
    const kb = normalizeBarcode(kaynakKimlik.barcode);
    const ab = normalizeBarcode(a.barcode);
    if (kb && ab && kb === ab) { elenen.ayniUrun++; continue; }

    uygun.push(a);
  }

  // En ucuzdan pahalıya; aynı başlığı tekrarlama
  uygun.sort((x, y) => x.price - y.price);
  const onAdaylar = [];
  for (const a of uygun) {
    const ayniBaslik = onAdaylar.some(t =>
      t.title.toLocaleLowerCase('tr-TR').slice(0, 40) === a.title.toLocaleLowerCase('tr-TR').slice(0, 40));
    if (ayniBaslik) continue;
    onAdaylar.push(a);
    if (onAdaylar.length >= DOGRULANACAK_ADAY) break;
  }

  const uyarilar = [];
  if (!onAdaylar.length) {
    uyarilar.push(bulunan.length
      ? `Tarama ${bulunan.length} aday buldu ama hiçbiri muadil olarak uygun değil `
        + `(${elenen.ayniUrun} aynı ürün, ${elenen.pahali} daha pahalı, ${elenen.fiyatsiz} fiyatsız).`
      : 'Muadil ürün bulunamadı (arama sonuç vermedi).');
    return { ...sonucBos, ortakOzellik, sorgular, uyarilar, sureMs: Date.now() - basladi };
  }

  // ---- FİYAT DOĞRULAMA (zorunlu) ----
  // NEDEN: site ARAMA LİSTELERİNDEKİ fiyatlar güvenilmez. Ölçüm (2026-10-28):
  // eSUN PLA+ filament listede 17,76 TL, Creality Ender PLA+ 11 TL görünüyordu;
  // gerçek fiyatları ~500–700 TL. Bu hâliyle "%98 daha ucuz" gibi tamamen yanıltıcı
  // bir iddia üretiliyordu. Artık her adayın ÜRÜN SAYFASI okunur; gösterilen fiyat
  // ve yüzde hesabı YALNIZCA ürün sayfasından gelen gerçek fiyatla yapılır.
  onProgress({ faz: 'dogrulama', adaySayisi: onAdaylar.length, not: 'Muadil fiyatları ürün sayfalarından doğrulanıyor…' });

  const gercekAdaylar = [];
  let dImlec = 0;
  const dIsci = async () => {
    while (true) {
      if (iptalMi()) return;
      const i = dImlec++;
      if (i >= onAdaylar.length) return;
      const aday = onAdaylar[i];
      const adapter = adapterById(aday.site);
      if (!adapter) continue;
      try {
        const p = await sureli(adapter.getProduct(aday.url, { spend: 0 }), SITE_ZAMAN_ASIMI_MS);
        const sayi = Number(p?.pricing?.toplam ?? p?.sellingPrice);
        if (!Number.isFinite(sayi) || sayi <= 0) { elenen.fiyatsiz++; continue; }
        if (mevcutFiyat != null && sayi >= mevcutFiyat) { elenen.pahali++; continue; }
        if (p?.inStock === false) { elenen.stokYok++; continue; }
        gercekAdaylar.push({
          ...aday,
          price: Math.round(sayi * 100) / 100,   // GERÇEK fiyat (ürün sayfası)
          listeFiyati: aday.price,               // yalnızca teşhis için
          title: String(p?.title || aday.title).slice(0, 200),
          brand: p?.brand || aday.brand || null,
          modelCode: p?.modelCode || aday.modelCode || null,
          barcode: p?.barcode || aday.barcode || null,
          inStock: p?.inStock !== false,
          urunSayfasiDogrulandi: true,
        });
      } catch {
        elenen.dogrulanamadi++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, onAdaylar.length) }, () => dIsci()));

  if (iptalMi()) {
    return { ...sonucBos, ortakOzellik, sorgular, uyarilar: ['İptal edildi.'], sureMs: Date.now() - basladi };
  }

  // Doğrulanmışlar arasında aynı başlığı tekrarla gösterme
  gercekAdaylar.sort((x, y) => x.price - y.price);
  const sonAdaylar = [];
  for (const a of gercekAdaylar) {
    if (sonAdaylar.some(t => t.title.toLocaleLowerCase('tr-TR').slice(0, 40) === a.title.toLocaleLowerCase('tr-TR').slice(0, 40))) continue;
    sonAdaylar.push(a);
    if (sonAdaylar.length >= TOPLAM_ADAY_USTU) break;
  }

  if (!sonAdaylar.length) {
    uyarilar.push('Muadil adayların ürün sayfaları okundu ama hiçbiri gerçekten daha ucuza alınamıyor '
      + `(${elenen.pahali} daha pahalı, ${elenen.fiyatsiz} fiyat okunamadı`
      + (elenen.stokYok ? `, ${elenen.stokYok} stokta yok` : '')
      + (elenen.dogrulanamadi ? `, ${elenen.dogrulanamadi} sayfa açılamadı` : '') + ').');
    return { ...sonucBos, ortakOzellik, sorgular, uyarilar, sureMs: Date.now() - basladi };
  }

  onProgress({ faz: 'secim', adaySayisi: sonAdaylar.length, not: 'En uygun muadiller seçiliyor…' });
  const secim = await alternatifSec({ title: urunBaslik, sellingPrice: mevcutFiyat }, sonAdaylar);

  const yuzdeHesapla = (fiyat) => (mevcutFiyat != null && mevcutFiyat > 0 && fiyat != null
    ? Math.round(((mevcutFiyat - fiyat) / mevcutFiyat) * 1000) / 10
    : null);

  const alternatifYap = (a, neden) => ({
    title: a.title,
    site: a.site,
    siteName: a.siteName,
    url: a.url,
    afiliyeUrl: afiliyeLink(a.site, a.url),
    fiyat: a.price,
    mevcutFiyat,
    yuzdeDahaUcuz: yuzdeHesapla(a.price),
    tasarruf: mevcutFiyat != null ? Math.round((mevcutFiyat - a.price) * 100) / 100 : null,
    neden: neden || null,
    urunSayfasiDogrulandi: true,
  });

  // YZ'nin döndürdüğü URL'leri GERÇEK adaylarla eşle (uydurma URL atılır)
  const urlHaritasi = new Map(sonAdaylar.map(a => [a.url, a]));
  const alternatifler = [];
  for (const s of secim) {
    const a = urlHaritasi.get(s.url);
    if (!a) continue; // listede olmayan URL → uydurma, at
    if (alternatifler.some(x => x.url === a.url)) continue;
    alternatifler.push(alternatifYap(a, s.neden || s.model));
    if (alternatifler.length >= (opts.maxAlternatif || 3)) break;
  }

  if (!alternatifler.length) {
    // YZ seçim yapamadıysa EN UCUZ gerçek adayları sun (dürüst gerekçeyle)
    for (const a of sonAdaylar.slice(0, opts.maxAlternatif || 3)) {
      alternatifler.push(alternatifYap(a, 'Aramada çıkan muadiller arasında en düşük fiyatlı seçenek.'));
    }
  }

  // Son güvenlik: her muadil gerçekten daha ucuz mu?
  const dogrulanmisListe = alternatifler.filter(x =>
    x.fiyat != null && (mevcutFiyat == null || x.fiyat < mevcutFiyat));

  return {
    gerekli: durum.gerekli,
    tetik: durum.tetik || (elle ? 'elle' : null),
    baslik: durum.baslik || 'Muadil ürün önerileri',
    aciklama: durum.aciklama || '',
    mevcut: {
      fiyat: mevcutFiyat,
      site: secilenMevcut?.site ?? null,
      siteName: secilenMevcut?.siteName ?? null,
      urun: urunBaslik,
    },
    alternatifler: dogrulanmisListe,
    ortakOzellik,
    sorgular,
    uyarilar,
    fiyatDogrulandi: true,
    sureMs: Date.now() - basladi,
  };
}
