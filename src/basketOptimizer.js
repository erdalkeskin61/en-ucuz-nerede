/**
 * Çok Mağazalı Akıllı Sepet Bölücü (Split-Basket Optimizer).
 *
 * Problem: kullanıcı 2-10 ürün alıyor; her ürün farklı sitede daha ucuz olabilir
 * ama her site kendi kargo eşiğini/kargo ücretini uyguluyor. Farklı sitelere
 * bölmek kargo yüzünden kazancı yok edebilir.
 *
 * Çözüm: üç senaryo üretir —
 *   1) Tek Mağaza Kolaylığı   : hepsi tek siteden (tek kargo)
 *   2) Akıllı Bölünmüş Sepet  : 2-3 site, kargo eşikleri hesaplanmış
 *   3) Maksimum Tasarruf      : her ürün en ucuz olduğu siteden (sınırsız bölme)
 *
 * Yöntem: kargo, ürünler arası tek bağ olduğu için "aktif mağaza kümesi" üzerinden
 * numaralandırma yapılır. Her küme için ürün, o kümedeki EN UCUZ mağazaya atanır;
 * kümenin toplamı (kargo dahil) hesaplanır. Küme boyutu ≤ 3-4 olduğu için
 * kombinasyon sayısı küçüktür (C(14,4) ≈ 1000) — NP-zor tam çözüm yerine bu
 * yapısal kısıt kullanılır ve sonuç her zaman gerçek bir atamadır (uydurma yok).
 *
 * Para: tüm ara hesaplar KURUŞ tam sayı (proje standardı — float hatası olmaz).
 */
import { runComparison } from './pipeline.js';
import { adapterById } from './sites/index.js';
import { formatTL } from './util.js';

/* ----------------------------- para yardımcıları ----------------------------- */

const kurusa = (tl) => Math.round(Number(tl || 0) * 100);
const tlYap = (kurus) => Math.round(kurus) / 100;

/**
 * Sepet "hızlı mod" site listesi: ürün bulma olasılığı en yüksek mağazalar.
 * Tam tarama 60 site sürüyor ve 2 ürün için ~5 dakika alıyor; hızlı mod ~30 site
 * ile bunu yarıya indirir. Kullanıcı isterse "tüm siteler" seçeneğiyle tam tarar.
 */
export const HIZLI_SITELER = [
  'trendyol', 'hepsiburada', 'amazon', 'n11', 'pttavm', 'teknosa', 'mediamarkt',
  'vatan', 'itopya', 'pazarama', 'ciceksepeti', 'koctas',
  'robotistan', 'robolinkmarket', 'filamentsan', 'filamentmarketim', 'samm',
  'ventatek', '3dcim', 'pusula3d', 'robitshop', 'filamentvakti', 'print3d',
  'makerfabrika', '3dultra', 'robomer', 'tou3d', '3dmarketim', '3dprinterankara',
  'teknikfilament3d',
];

/**
 * SEPET için site listesi (2026-10-28): hızlı + ürün bulma olasılığı yüksek.
 *
 * Neden ayrı liste: tarayıcı (render) katmanı gerektiren siteler tek başına
 * 14–68 saniye sürebiliyor (ölçüm: çiçeksepeti 68 sn, n11 16 sn, teknosa 14 sn).
 * Sepette her ürün için bu maliyet tekrarlanınca 5 ürün 15 dakikaya çıkıyordu.
 * Bu liste, sepet karşılaştırmasında makul süre (< ~3 dk) hedefiyle seçildi:
 * büyük pazaryerleri + doğrudan çekilen 3D mağazaları. Render ağırlıklı
 * siteler (çiçeksepeti, pttavm) listeden çıkarıldı — kullanıcı "hızlı mod"u
 * kapatırsa 60 sitenin tamamı taranır.
 */
export const SEPET_SITELERI = [
  'trendyol', 'hepsiburada', 'amazon', 'n11', 'mediamarkt', 'vatan', 'itopya', 'pazarama',
  'robotistan', 'robolinkmarket', 'filamentsan', 'filamentmarketim', 'samm',
  'ventatek', '3dcim', 'pusula3d', 'robitshop', 'filamentvakti', 'print3d',
  'makerfabrika', '3dultra', 'robomer', 'tou3d', '3dmarketim', '3dprinterankara',
  'teknikfilament3d',
  // 2026-10-28: deneystore (PlatinMarket; doğrudan çekim ~1,4 sn). Kargo tarifesi
  // kullanıcı tarafından doğrulandı (199,99 TL / 3.000 TL eşik), sepette yer alır.
  'deneystore',
  // 2026-10-29: bisiparisver (IdeaSoft klasik; arama 30 kart, ürün ~1,1 sn).
  'bisiparisver',
];

/** Sepette tek siteye ayrılan en fazla süre — yavaş site tüm sepeti kilitlemesin. */
const SITE_ZAMAN_ASIMI_MS = 25000;

import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';

/* ------------------------------ kargo hesabı -------------------------------- */

/**
 * Bir mağazanın sepet toplamına göre kargosunu döndürür (kuruş).
 * Eşik kuralı: varsayılan "N TL ve üzeri ücretsiz" (>=); `freeOverExclusive`
 * işaretliyse "N TL üzeri" (>).
 */
export function kargoKurus(araToplamKurus, kural) {
  if (!kural) return 0;
  if (kural.applies === false) return 0;            // site geneli ücretsiz kargo
  const esik = kural.freeOver != null ? kurusa(kural.freeOver) : null;
  const ucret = kural.fee != null ? kurusa(kural.fee) : 0;
  if (esik == null) return ucret;                    // eşik yok → sabit ücret
  const gecti = kural.freeOverExclusive === true
    ? araToplamKurus > esik
    : araToplamKurus >= esik;
  return gecti ? 0 : ucret;
}

/* ------------------------------- gruplama ----------------------------------- */

/**
 * Ürün→mağaza atamasını mağaza gruplarına çevirir.
 * @param {Array} sepet [{id, ad, teklifler:[{site, siteName, urunFiyati, kargo, url, renkAyni}]}]
 * @param {Object} atama { [urunId]: siteId }
 * @returns {{gruplar:Array, magazaSayisi:number, araToplam:number, kargo:number, toplam:number}|null}
 */
export function gruplariOlustur(sepet, atama) {
  const harita = new Map();
  for (const urun of sepet) {
    const site = atama[urun.id];
    if (!site) return null;
    const teklif = urun.teklifler.find(t => t.site === site);
    if (!teklif || teklif.urunFiyati == null) return null;
    if (!harita.has(site)) {
      harita.set(site, {
        site,
        siteName: teklif.siteName || site,
        kargoKurali: teklif.kargo || null,
        urunler: [],
      });
    }
    harita.get(site).urunler.push({
      id: urun.id,
      ad: urun.ad,
      fiyat: tlYap(kurusa(teklif.urunFiyati)),
      url: teklif.url || null,
      // Satış ortaklığı: yalnızca bağlantıda kullanılır, fiyatı etkilemez.
      afiliyeUrl: teklif.afiliyeUrl || teklif.url || null,
      site,
      renkAyni: teklif.renkAyni !== false,
    });
  }

  let toplamAra = 0;
  let toplamKargo = 0;
  const gruplar = [];
  for (const g of harita.values()) {
    const ara = g.urunler.reduce((s, u) => s + kurusa(u.fiyat), 0);
    const kargo = kargoKurus(ara, g.kargoKurali);
    toplamAra += ara;
    toplamKargo += kargo;
    gruplar.push({
      site: g.site,
      siteName: g.siteName,
      urunler: g.urunler,
      araToplam: tlYap(ara),
      kargo: tlYap(kargo),
      toplam: tlYap(ara + kargo),
      kargoKurali: g.kargoKurali,
      kargoBilgisi: g.kargoKurali?.note || null,
    });
  }
  // En pahalı mağaza önce gösterilsin (okunabilirlik)
  gruplar.sort((a, b) => b.toplam - a.toplam);

  return {
    gruplar,
    magazaSayisi: gruplar.length,
    araToplam: tlYap(toplamAra),
    kargo: tlYap(toplamKargo),
    toplam: tlYap(toplamAra + toplamKargo),
  };
}

/* ------------------------- küme → en iyi atama ------------------------------ */

/** Bir mağaza kümesi için her ürünü o kümedeki en ucuz mağazaya atar. */
function kumeAtamasi(sepet, siteKumesi) {
  const kume = new Set(siteKumesi);
  const atama = {};
  for (const urun of sepet) {
    let enIyi = null;
    for (const t of urun.teklifler) {
      if (!kume.has(t.site) || t.urunFiyati == null) continue;
      if (!enIyi || kurusa(t.urunFiyati) < kurusa(enIyi.urunFiyati)) enIyi = t;
    }
    if (!enIyi) return null; // bu küme tüm ürünleri karşılamıyor
    atama[urun.id] = enIyi.site;
  }
  return atama;
}

/** 0/1 kombinasyon üretici (küçük n için). */
function kombinasyonlar(dizi, k) {
  const out = [];
  const n = dizi.length;
  if (k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map(i => dizi[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/**
 * Senaryoları hesaplar — SAF fonksiyon (ağ yok), bu yüzden birim testte kullanılır.
 *
 * @param {Array} sepet
 * @param {{enFazlaKume?: number, adaySiteSiniri?: number}} opts
 */
export function senaryolariHesapla(sepet, opts = {}) {
  const enFazlaKume = Math.max(1, Math.min(opts.enFazlaKume ?? 4, sepet.length));
  const adaySiteSiniri = opts.adaySiteSiniri ?? 14;

  if (!Array.isArray(sepet) || !sepet.length) {
    return { hata: 'Sepette ürün yok', senaryolar: {} };
  }
  for (const u of sepet) {
    if (!u.teklifler || !u.teklifler.length) {
      return { hata: `"${u.ad}" için hiçbir sitede fiyat bulunamadı`, senaryolar: {} };
    }
  }

  // Aday mağazalar: her ürünü kaç mağaza kapsıyor + fiyat sıralaması
  const siteBilgi = new Map();
  for (const urun of sepet) {
    const sirali = [...urun.teklifler]
      .filter(t => t.urunFiyati != null)
      .sort((a, b) => kurusa(a.urunFiyati) - kurusa(b.urunFiyati));
    sirali.forEach((t, idx) => {
      const kayit = siteBilgi.get(t.site) || { site: t.site, siteName: t.siteName, kapsama: 0, siralar: [] };
      kayit.kapsama++;
      kayit.siralar.push(idx);
      siteBilgi.set(t.site, kayit);
    });
  }
  const adaySiteler = [...siteBilgi.values()]
    .map(s => ({ ...s, ortSira: s.siralar.reduce((a, b) => a + b, 0) / Math.max(s.siralar.length, 1) }))
    // önce çok ürünü kapsayan, sonra ortalama olarak ucuz olan
    .sort((a, b) => (b.kapsama - a.kapsama) || (a.ortSira - b.ortSira))
    .slice(0, adaySiteSiniri)
    .map(s => s.site);

  const enIyiKume = (minBoy, maxBoy) => {
    let enIyi = null;
    for (let k = minBoy; k <= Math.min(maxBoy, adaySiteler.length); k++) {
      for (const kume of kombinasyonlar(adaySiteler, k)) {
        const atama = kumeAtamasi(sepet, kume);
        if (!atama) continue;
        const sonuc = gruplariOlustur(sepet, atama);
        if (!sonuc) continue;
        // Daha ucuz, eşitse daha az mağaza tercih edilir
        if (!enIyi || sonuc.toplam < enIyi.toplam ||
            (sonuc.toplam === enIyi.toplam && sonuc.magazaSayisi < enIyi.magazaSayisi)) {
          enIyi = sonuc;
        }
      }
    }
    return enIyi;
  };

  // 1) Tek mağaza: tüm ürünleri bulunduran mağazalar
  const tekMagaza = enIyiKume(1, 1);

  // 2) Akıllı bölünmüş: 2-3 mağaza
  const akilliBolunmus = enIyiKume(2, Math.min(3, enFazlaKume));

  // 3) Maksimum tasarruf: her ürün kendi en ucuzundan (sınırsız mağaza)
  let maksimumTasarruf = null;
  {
    const atama = {};
    for (const urun of sepet) {
      let enIyi = null;
      for (const t of urun.teklifler) {
        if (t.urunFiyati == null) continue;
        if (!enIyi || kurusa(t.urunFiyati) < kurusa(enIyi.urunFiyati)) enIyi = t;
      }
      if (enIyi) atama[urun.id] = enIyi.site;
    }
    if (Object.keys(atama).length === sepet.length) maksimumTasarruf = gruplariOlustur(sepet, atama);
  }

  const senaryolar = {
    tekMagaza: tekMagaza ? { anahtar: 'tekMagaza', etiket: 'Tek Mağaza Kolaylığı', aciklama: 'Hepsini tek yerden al, tek kargo öde', ...tekMagaza } : null,
    akilliBolunmus: akilliBolunmus ? { anahtar: 'akilliBolunmus', etiket: 'Akıllı Bölünmüş Sepet', aciklama: 'Kargo eşikleri hesaplanmış en iyi bölünme', ...akilliBolunmus } : null,
    maksimumTasarruf: maksimumTasarruf ? { anahtar: 'maksimumTasarruf', etiket: 'Maksimum Tasarruf', aciklama: 'Her ürün en ucuz olduğu yerden', ...maksimumTasarruf } : null,
  };

  // Dürüst uyarılar: "maksimum tasarruf" kargo yüzünden akıllı bölünmeden
  // PAHALI çıkabilir (her ürün en ucuzundan almak her zaman en iyi toplam demek
  // değildir). Bunu gizlemek yerine açıkça söylüyoruz.
  const uyarilar = [];
  if (senaryolar.maksimumTasarruf && akilliBolunmus &&
      kurusa(maksimumTasarruf.toplam) > kurusa(akilliBolunmus.toplam)) {
    senaryolar.maksimumTasarruf.uyari = 'Kargo ücretleri yüzünden akıllı bölünmeden '
      + formatTL(tlYap(kurusa(maksimumTasarruf.toplam) - kurusa(akilliBolunmus.toplam)))
      + ' daha pahalı.';
  }
  if (!tekMagaza) {
    uyarilar.push('Hiçbir mağaza tüm ürünleri birlikte satmıyor; tek mağaza senaryosu oluşturulamadı.');
  }

  // En iyi senaryo (toplam en düşük)
  const adaylar = Object.values(senaryolar).filter(Boolean);
  const enIyi = adaylar.length
    ? adaylar.reduce((a, b) => (b.toplam < a.toplam ? b : a))
    : null;

  // Kazanç: tek mağazaya göre
  const kazanc = enIyi && tekMagaza ? tlYap(kurusa(tekMagaza.toplam) - kurusa(enIyi.toplam)) : null;
  const kazancYuzde = kazanc != null && tekMagaza && tekMagaza.toplam > 0
    ? Math.round((kazanc / tekMagaza.toplam) * 1000) / 10
    : null;

  return {
    senaryolar,
    uyarilar,
    enIyiAnahtar: enIyi?.anahtar || null,
    enIyiToplam: enIyi?.toplam ?? null,
    tekMagazaToplam: tekMagaza?.toplam ?? null,
    kazanc,
    kazancYuzde,
    urunSayisi: sepet.length,
    adaySiteSayisi: adaySiteler.length,
  };
}

/* ------------------------- ağ tarafı: sepet optimizasyonu -------------------- */

/** Karşılaştırma sonuçlarını kısa süre bellekte tutar (aynı ürünü tekrar taramayalım). */
const karsilastirmaOnbellegi = new Map(); // url -> { ts, sonuc }
const ONBELLEK_OMRU_MS = 10 * 60 * 1000;

function onbellektenAl(url) {
  const k = karsilastirmaOnbellegi.get(url);
  if (!k) return null;
  if (Date.now() - k.ts > ONBELLEK_OMRU_MS) { karsilastirmaOnbellegi.delete(url); return null; }
  return k.sonuc;
}

function onbellegeYaz(url, sonuc) {
  karsilastirmaOnbellegi.set(url, { ts: Date.now(), sonuc });
  // Bellek şişmesin: 50 kayıt sınırı
  if (karsilastirmaOnbellegi.size > 50) {
    const enEski = [...karsilastirmaOnbellegi.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (enEski) karsilastirmaOnbellegi.delete(enEski[0]);
  }
}

/** Bir karşılaştırma sonucundan sepet teklif listesini çıkarır. */
export function teklifleriCikar(karsilastirma) {
  if (!karsilastirma || !Array.isArray(karsilastirma.sonuclar)) return [];
  // Referans HER ZAMAN güncel ayardan üretilir: karşılaştırma sonucu 10 dk'lık
  // bellekte tutulduğu için içindeki `afiliyeUrl` eski yapılandırmayı taşıyabilir
  // (2026-10-28: sepet kartlarında referans görünmüyordu, sebebi buydu).
  const afiliyeAyar = afiliyeAyarlari();
  return karsilastirma.sonuclar
    .filter(s => s.status === 'found' && s.product && s.product.inStock !== false)
    .map(s => ({
      site: s.site,
      siteName: s.siteName,
      // araToplam = kargo HARİÇ, indirimler sonrası ürün tutarı (sepet toplamı için doğru alan)
      urunFiyati: s.product.pricing?.araToplam ?? s.product.sellingPrice ?? null,
      kargo: s.product.shipping || null,
      url: s.product.url || null,
      // Satış ortaklığı: yalnızca dışa giden bağlantıda kullanılır (fiyat dokunulmaz).
      afiliyeUrl: afiliyeLink(s.site, s.product.url || '', afiliyeAyar),
      renkAyni: s.renkAyni !== false,
      kupon: s.product.pricing?.kupon?.fiyat ?? null,
    }))
    .filter(t => t.urunFiyati != null && t.urunFiyati > 0);
}

/**
 * Sepeti optimize eder: her ürün için siteleri tarar, sonra senaryoları hesaplar.
 *
 * @param {Array<{url:string, ad?:string}>} urunler 2-10 ürün
 * @param {{onProgress?:Function, signal?:AbortSignal, concurrency?:number}} opts
 */
export async function sepetOptimize(urunler, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal || null;
  const iptalMi = () => !!(signal && signal.aborted);
  const eszamanli = Math.max(1, Math.min(opts.concurrency || 3, 5));
  const hizliMod = opts.hizliMod !== false; // varsayılan: hızlı; false → 60 site
  // Açıkça verilen boş dizi "site yok" demektir.
  const siteler = Array.isArray(opts.siteler)
    ? opts.siteler
    : (hizliMod ? SEPET_SITELERI : null);
  const siteZamanAsimi = Math.max(5000, Number(opts.siteTimeoutMs) || SITE_ZAMAN_ASIMI_MS);
  const basladi = Date.now();

  if (!Array.isArray(urunler) || urunler.length < 2) {
    throw new Error('Sepet için en az 2 ürün gerekli.');
  }
  if (urunler.length > 10) {
    throw new Error('Sepet en fazla 10 ürün alabilir.');
  }

  const normal = urunler.map((u, i) => ({
    id: 'u' + (i + 1),
    url: String(u.url || '').trim(),
    ad: u.ad || null,
  }));
  const gecersiz = normal.find(u => !u.url);
  if (gecersiz) throw new Error('Tüm ürünler için ürün linki gerekli.');

  onProgress({ faz: 'basladi', toplam: normal.length, not: 'Ürünler sitelerde aranıyor…' });

  const sonuclar = new Array(normal.length).fill(null);
  let biten = 0;

  // Her ürün için kalıcı durum dizisi. ÖNEMLİ (2026-10-28): önceden ilerlemede yalnızca
  // "şu an işlenen ürün" (index) gönderiliyordu; eşzamanlılık 2 olduğu için arayüz
  // ilk ürünü hiç görmüyor, satır listesinde boşluk oluşuyordu. Artık tam dizi gider.
  const urunDurumlari = normal.map((u, i) => ({
    index: i,
    ad: u.ad || u.url,
    durum: 'bekliyor',
    siteSayisi: null,
    enUcuz: null,
    not: '',
  }));
  const durumYayinla = (ek = {}) => onProgress({
    faz: 'urun',
    toplam: normal.length,
    biten,
    urunler: urunDurumlari,
    ...ek,
  });

  durumYayinla({ not: 'Ürünler sitelerde aranıyor…' });

  // ÖN OKUMA (2026-10-28): kaynak ürün sayfaları, site taraması başlamadan ÖNCE okunur.
  //
  // Neden: 5 ürün aynı anda taranırken büyük sitelere eşzamanlı istek gidiyor ve
  // filamentdepom/3dmarketim gibi siteler o an BOZUK sayfa (fiyatsız) döndürebiliyor.
  // Bu da o ürünün kaynak fiyatı okunamadığı için sepetten tamamen düşmesine yol
  // açıyordu (ölçüm: 5 ürünlük sepette 2 ürün kayboluyordu; yalnız o 2 ürün
  // tarandığında ikisi de sorunsuz bulunuyordu). Ön okuma sakin anda yapılır ve
  // fetchPage önbelleğine yazılır; tarama sırasında kaynak sayfa önbellekten gelir.
  try {
    let onImlec = 0;
    const onIsci = async () => {
      while (true) {
        if (iptalMi()) return;
        const i = onImlec++;
        if (i >= normal.length) return;
        const u = normal[i];
        const site = (await import('./sites/index.js')).detectSite(u.url);
        if (!site) return;
        try {
          const p = await site.getProduct(u.url, { spend: 0 });
          if (p?.title) {
            urunDurumlari[i].ad = p.title;
            urunDurumlari[i].not = `${p.title.slice(0, 60)} okundu`;
            durumYayinla({ index: i, urun: p.title, site: null, not: 'Kaynak ürün okundu' });
          }
        } catch { /* tarama sırasında yeniden denenecek */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, normal.length) }, () => onIsci()));
  } catch { /* ön okuma başarısızsa normal akış devam eder */ }

  durumYayinla({ not: 'Ürünler sitelerde aranıyor…' });

  // Eşzamanlılık sınırlı iş kuyruğu
  let imlec = 0;
  const isci = async () => {
    while (true) {
      if (iptalMi()) return;
      const i = imlec++;
      if (i >= normal.length) return;
      const u = normal[i];
      urunDurumlari[i].durum = 'calisiyor';
      urunDurumlari[i].not = `Ürün ${i + 1}/${normal.length} taranıyor…`;
      durumYayinla({ index: i, urun: u.ad || u.url, site: null, not: `Ürün ${i + 1}/${normal.length} taranıyor…` });

      let sonuc = onbellektenAl(u.url);
      const onbellekten = !!sonuc;
      if (!sonuc) {
        try {
          sonuc = await runComparison(u.url, {
            maxCandidates: 1,
            maxQueries: 2, // sepet: 2 sorgu yeter (süreyi ~yarıya indirir)
            // Semantik YZ eşleştirmesi KAPALI: çağrı başına 120 sn'ye kadar sürebiliyor
            // ve 30 site × belirsiz aday ile tarama 15 dakikaya çıkıyordu (2026-10-28).
            semantik: false,
            signal,
            // Sepet için YZ kampanya sınıflandırması KAPALI: ürün başına 15-20 YZ
            // çağrısı yapılıyordu ve 2 ürünlük sepet 15 dakikaya çıkıyordu.
            siniflandir: false,
            // Yavaş site (render/CF) tüm sepeti kilitlemesin — site başına üst sınır.
            siteTimeoutMs: siteZamanAsimi,
            // Hızlı mod: sepete özel hızlı site listesi. Kullanıcı kapatırsa 60 site.
            siteler,
            onProgress: (siteId, info) => {
              const nt = info?.reason || info?.note || '';
              urunDurumlari[i].not = nt;
              durumYayinla({ index: i, urun: u.ad || u.url, site: siteId, not: nt });
            },
          });
          if (!iptalMi()) onbellegeYaz(u.url, sonuc);
        } catch (e) {
          sonuclar[i] = { hata: String(e.message || e).slice(0, 200) };
          biten++;
          urunDurumlari[i].durum = 'hata';
          urunDurumlari[i].not = sonuclar[i].hata;
          durumYayinla({ index: i, urun: u.ad || u.url, site: null, not: sonuclar[i].hata });
          continue;
        }
      }

      const teklifler = teklifleriCikar(sonuc);
      sonuclar[i] = {
        id: u.id,
        ad: u.ad || sonuc?.kaynak?.urun || u.url,
        url: u.url,
        kaynakSite: sonuc?.kaynak?.siteName || null,
        teklifler,
        onbellekten,
      };
      biten++;
      const enUcuz = teklifler.length
        ? teklifler.reduce((a, b) => (a.urunFiyati <= b.urunFiyati ? a : b))
        : null;
      urunDurumlari[i].ad = sonuclar[i].ad;
      urunDurumlari[i].durum = teklifler.length ? 'ok' : 'bulunamadi';
      urunDurumlari[i].siteSayisi = teklifler.length;
      urunDurumlari[i].enUcuz = enUcuz ? { site: enUcuz.siteName, fiyat: enUcuz.urunFiyati } : null;
      urunDurumlari[i].not = teklifler.length
        ? `${teklifler.length} sitede bulundu`
        : 'Hiçbir sitede bulunamadı';
      durumYayinla({
        index: i,
        urun: sonuclar[i].ad,
        site: null,
        not: urunDurumlari[i].not,
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(eszamanli, normal.length) }, () => isci()));

  // İKİNCİ TUR (2026-10-28): yük altında bazı siteler geçici olarak fiyatsız/boş sayfa
  // döndürüyor ("IdeaSoft ürün fiyatı sayfada bulunamadı"). Ana tur bittiğinde yük
  // azaldığı için başarısız ürünler TEK TEK yeniden denenir.
  //
  // ÖNEMLİ: kısa bir BEKLEME şart — site hız sınırı penceresi kapanmadan tekrar
  // denemek aynı boş sayfayı getiriyordu. Ayrıca bu beklemeler arasında önbellekteki
  // bozuk yanıt "taze" istekle atlanır (aşağıda fresh:true).
  if (!iptalMi()) {
    const kalanlar = sonuclar
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s || s.hata);
    if (kalanlar.length) {
      durumYayinla({ not: `${kalanlar.length} ürün yeniden deneniyor…` });
      // hız sınırı penceresinin kapanmasını bekle
      await new Promise(r => setTimeout(r, 20000));
      for (const { i } of kalanlar) {
        if (iptalMi()) break;
        const u = normal[i];
        urunDurumlari[i].durum = 'calisiyor';
        urunDurumlari[i].not = 'Yeniden deneniyor…';
        durumYayinla({ index: i, urun: u.ad || u.url, site: null, not: 'Yeniden deneniyor…' });
        try {
          const sonuc = await runComparison(u.url, {
            maxCandidates: 1,
            maxQueries: 2,
            siniflandir: false,
            semantik: false,
            siteTimeoutMs: siteZamanAsimi,
            siteler,
            signal,
            tazeKaynak: true,
          });
          const teklifler = teklifleriCikar(sonuc);
          if (!teklifler.length) throw new Error('Teklif yok');
          sonuclar[i] = {
            id: u.id,
            ad: u.ad || sonuc?.kaynak?.urun || u.url,
            url: u.url,
            kaynakSite: sonuc?.kaynak?.siteName || null,
            teklifler,
            onbellekten: false,
          };
          const enUcuz = teklifler.reduce((a, b) => (a.urunFiyati <= b.urunFiyati ? a : b));
          urunDurumlari[i].ad = sonuclar[i].ad;
          urunDurumlari[i].durum = 'ok';
          urunDurumlari[i].siteSayisi = teklifler.length;
          urunDurumlari[i].enUcuz = { site: enUcuz.siteName, fiyat: enUcuz.urunFiyati };
          urunDurumlari[i].not = `${teklifler.length} sitede bulundu (yeniden deneme)`;
        } catch (e) {
          urunDurumlari[i].durum = 'hata';
          urunDurumlari[i].not = String(e.message || e).slice(0, 160);
        }
        durumYayinla({ index: i, urun: u.ad || u.url, site: null, not: urunDurumlari[i].not });
        // Sıradaki ürünü de hemen arka arkaya denememek için kısa nefes
        if (kalanlar.length > 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  if (iptalMi()) {
    return {
      iptalEdildi: true,
      urunler: sonuclar.filter(Boolean),
      hata: null,
      ozet: { toplamSureMs: Date.now() - basladi, urunSayisi: normal.length, tamamlanan: biten, iptalEdildi: true },
    };
  }

  // Bulunamayan ürünler: tüm sepeti düşürmek yerine o ürünü çıkarıp devam et,
  // kullanıcıya hangi ürünün bulunamadığını açıkça söyle (en az 2 ürün kalmalı).
  const basarili = sonuclar.filter(s => s && !s.hata && Array.isArray(s.teklifler) && s.teklifler.length);
  const bulunamayanlar = sonuclar
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s || s.hata || !Array.isArray(s.teklifler) || !s.teklifler.length)
    .map(({ s, i }) => s?.ad || normal[i]?.ad || normal[i]?.url);

  if (basarili.length < 2) {
    throw new Error(
      bulunamayanlar.length
        ? `Sepetteki ürünlerin çoğu hiçbir sitede bulunamadı: ${bulunamayanlar.join(', ')}. En az 2 ürün bulunmalı.`
        : 'Sepet için en az 2 ürün bulunmalı.',
    );
  }

  onProgress({ faz: 'optimizasyon', toplam: normal.length, biten, urunler: urunDurumlari, not: 'Senaryolar hesaplanıyor…' });
  const hesap = senaryolariHesapla(basarili, { enFazlaKume: Math.min(4, basarili.length) });

  const uyarilar = [...(hesap.uyarilar || [])];
  if (bulunamayanlar.length) {
    uyarilar.push(`${bulunamayanlar.join(', ')} hiçbir sitede bulunamadı; sepet ${basarili.length} ürünle hesaplandı.`);
  }

  return {
    urunler: basarili,
    ...hesap,
    uyarilar,
    bulunamayanlar,
    ozet: {
      toplamSureMs: Date.now() - basladi,
      urunSayisi: normal.length,
      hesaplananUrunSayisi: basarili.length,
      tamamlanan: biten,
      iptalEdildi: false,
    },
  };
}

/* ------------------------------ metin özeti --------------------------------- */

/** Senaryoyu tek satır özetler (e-posta / log için). */
export function senaryoOzeti(senaryo) {
  if (!senaryo) return '—';
  const magazalar = senaryo.gruplar.map(g => g.siteName).join(' + ');
  return `${senaryo.etiket}: ${formatTL(senaryo.toplam)} (${magazalar}; kargo ${formatTL(senaryo.kargo)})`;
}
