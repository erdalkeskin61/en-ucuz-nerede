/**
 * 🚨 SAHTE İNDİRİM & ŞİŞİRİLMİŞ LİSTE FİYATI DEDEKTÖRÜ — V2 (2026-11-05)
 *
 * Neden: satıcılar 500 TL'lik ürünü "1.000 TL yerine %50 indirimle 499 TL"
 * diye pazarlıyor. Kullanıcı gerçekte %0 tasarruf ediyor ama yapay bir aciliyet
 * algısı oluşuyor. Bu modül mağazanın gösterdiği ÜSTÜ ÇİZİLİ LİSTE FİYATINI
 * SQLite'taki GERÇEK fiyat geçmişiyle kıyaslar.
 *
 * Girdi olarak `getFiyatAnalizi()` çıktısı beklenir (V2 pencereli metrikler):
 *   - ortFiyat30 : son 30 gün, gün ağırlıklı ortalama
 *   - maxFiyat60 : son 60 günde gerçekten görülen en yüksek fiyat
 *   - minFiyat90 : son 90 günün tarihi dibi
 *
 * DÜRÜSTLÜK KURALLARI (proje anayasası):
 *  - Geçmiş yoksa / yetersizse rozet BASILMAZ; `rozetTuru:'normal'` + neden döner.
 *    "Cold-start" ürünlerde yanıltıcı etiket üretmek, düzeltmeye çalıştığımız
 *    sorunun aynısını yaratırdı.
 *  - Oranlar GERÇEK gözlemlerden hesaplanır; yuvarlama dışında dönüşüm yok.
 *  - Şüphe varsa lehte karar: eşikler tam sınırda rozet basmaz.
 */

/* ------------------------------------------------------------------ */
/* Eşikler (spec)                                                      */
/* ------------------------------------------------------------------ */

/** Üstü çizili fiyat, son 60 günün en yükseğinden bu oran kadar fazlaysa şişirilmiş. */
export const ESIK_MAX60_ORAN = 0.15;
/** Üstü çizili fiyat, son 30 gün ortalamasından bu oran kadar fazlaysa şişirilmiş. */
export const ESIK_ORT30_ORAN = 0.25;
/** Dip fiyat toleransı: kayan nokta/kuruş farkı için. */
export const ESIK_DIP_TOLERANS = 0.01;
/** "Piyasa normali" bandı: ortalamanın ±%5'i. */
export const ESIK_NORMAL_BANT = 0.05;

const say = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const yuzde = (x) => Math.round(Number(x) * 10) / 10;
const tl = (n) => Number(n).toLocaleString('tr-TR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/**
 * Bir mağaza teklifi için sahte indirim / gerçek fırsat analizi.
 *
 * @param {{
 *   satisFiyati?: number|null,     // gerçekte ödenecek tutar (net)
 *   listeFiyati?: number|null,     // mağazanın gösterdiği üstü çizili fiyat
 *   analiz?: object|null,          // getFiyatAnalizi() çıktısı
 * }} girdi
 * @returns {{
 *   rozetTuru: 'sahte_indirim'|'gercek_firsat'|'normal',
 *   sahteIndirim: boolean,
 *   gercekFirsat: boolean,
 *   iddiaEdilenIndirim: number|null,   // mağazanın iddia ettiği % (ör. 50)
 *   gercekTasarruf: number|null,       // ortFiyat30'a göre gerçek % (ör. 2)
 *   rozetMetni: string|null,
 *   rozetRengi: 'turuncu'|'yesil'|'notr',
 *   tooltip: string|null,
 *   listeFiyati: number|null,
 *   satisFiyati: number|null,
 *   ortFiyat30: number|null,
 *   maxFiyat60: number|null,
 *   minFiyat90: number|null,
 *   etiketOraniOrt30: number|null,     // liste / ort30
 *   etiketOraniMax60: number|null,     // liste / max60
 *   yeterliVeri: boolean,
 *   neden: string|null,
 * }}
 */
export function sahteIndirimAnalizi({ satisFiyati, listeFiyati, analiz } = {}) {
  const satis = say(satisFiyati);
  const liste = say(listeFiyati);

  const bos = {
    rozetTuru: 'normal',
    sahteIndirim: false,
    gercekFirsat: false,
    iddiaEdilenIndirim: null,
    gercekTasarruf: null,
    rozetMetni: null,
    rozetRengi: 'notr',
    tooltip: null,
    listeFiyati: liste,
    satisFiyati: satis,
    ortFiyat30: null,
    maxFiyat60: null,
    minFiyat90: null,
    etiketOraniOrt30: null,
    etiketOraniMax60: null,
    yeterliVeri: false,
    neden: null,
  };

  if (satis == null) return { ...bos, neden: 'Geçerli bir satış fiyatı yok.' };

  // Geçmiş yok: rozet basma. Yalnızca mağazanın kendi iddiasını raporla.
  if (!analiz?.bulundu) {
    const iddia = liste && liste > satis ? yuzde(((liste - satis) / liste) * 100) : null;
    return {
      ...bos,
      iddiaEdilenIndirim: iddia,
      neden: analiz?.neden || 'Bu ürün için fiyat geçmişi yok; etiket denetimi yapılamaz.',
    };
  }

  const ort30 = say(analiz.ortFiyat30) ?? say(analiz.ortFiyat);
  const max60 = say(analiz.maxFiyat60) ?? say(analiz.maxFiyat);
  const min90 = say(analiz.minFiyat90) ?? say(analiz.minFiyat);
  const yeterli = analiz.yeterliVeri === true;
  const gun = Number(analiz.gunSayisi) || 0;
  const pencereAdi = Number(analiz.ortPencereGun) || 30;

  const iddia = liste && liste > satis
    ? yuzde(((liste - satis) / liste) * 100)
    : null;
  const gercek = ort30 && ort30 > 0
    ? yuzde(Math.max(0, ((ort30 - satis) / ort30) * 100))
    : null;

  const temel = {
    ...bos,
    listeFiyati: liste,
    satisFiyati: satis,
    ortFiyat30: ort30,
    maxFiyat60: max60,
    minFiyat90: min90,
    etiketOraniOrt30: liste && ort30 ? Math.round((liste / ort30) * 1000) / 1000 : null,
    etiketOraniMax60: liste && max60 ? Math.round((liste / max60) * 1000) / 1000 : null,
    iddiaEdilenIndirim: iddia,
    gercekTasarruf: gercek,
    yeterliVeri: yeterli,
    gunSayisi: gun,
    pencereAdi,
  };

  // Yeterli geçmiş yoksa: ne "şişirilmiş" ne "tarihi dip" iddiası kurulur.
  if (!yeterli) {
    return {
      ...temel,
      rozetTuru: 'normal',
      rozetRengi: 'notr',
      neden: analiz.neden
        || `Fiyat geçmişi yalnızca ${gun} gün; güvenilir etiket denetimi için en az 3 gün gerekiyor.`,
    };
  }

  // ---- Kural A: şişirilmiş / sahte indirim ----
  // Liste fiyatı, son 60 günün GERÇEK maksimumundan %15 fazlaysa VEYA son 30 gün
  // ortalamasından %25 fazlaysa yapaydır. Her iki metrik de olmalı; biri yoksa
  // yalnızca öteki kullanılır (kanıtsız kural çalıştırılmaz).
  const max60Asildi = liste && max60 ? liste > max60 * (1 + ESIK_MAX60_ORAN) : false;
  const ort30Asildi = liste && ort30 ? liste > ort30 * (1 + ESIK_ORT30_ORAN) : false;
  const sahte = Boolean(liste && (max60Asildi || ort30Asildi));

  // ---- Kural B: gerçek dip fırsat ----
  // Satış fiyatı son 90 günün dibinde veya altındaysa gerçek fırsat.
  const dip = min90 != null && satis <= min90 * (1 + ESIK_DIP_TOLERANS);

  // ---- Kural C: piyasa normali ----
  const normalBant = ort30 != null
    && Math.abs(satis - ort30) <= ort30 * ESIK_NORMAL_BANT;

  // Öncelik: UYARI > FIRSAT. Şişirilmiş etiket varsa bunu gizlemek yanıltıcı olur;
  // "gerçek fırsat" bilgisi ayrıca `gercekFirsat` alanında döner ve arayüz ikisini
  // de gösterebilir.
  if (sahte) {
    const nedenParca = [];
    if (max60Asildi) nedenParca.push(`son 60 günün en yüksek fiyatı ₺${tl(max60)}`);
    if (ort30Asildi) nedenParca.push(`son ${pencereAdi} günün ortalaması ₺${tl(ort30)}`);
    const gercekMetin = gercek != null
      ? `Gerçek tasarrufunuz yalnızca %${gercek}.`
      : 'Geçmişe göre gerçek bir tasarruf görünmüyor.';
    const rozetMetni = `⚠️ Şişirilmiş Liste Fiyatı: Son ${pencereAdi} günün gerçek piyasa ortalaması ₺${tl(ort30 ?? max60)}`;
    return {
      ...temel,
      rozetTuru: 'sahte_indirim',
      sahteIndirim: true,
      gercekFirsat: dip,
      rozetRengi: 'turuncu',
      rozetMetni,
      tooltip: `⚠️ Yapay İndirim Uyarısı: Bu mağaza liste fiyatını şişirmiştir. `
        + `Bu ürün son ${pencereAdi} günde ortalama ₺${tl(ort30)}'ye satılmıştır. `
        + `${gercekMetin} `
        + `(Kanıt: ${nedenParca.join(' · ')}.)`,
      neden: 'Etiket fiyatı gerçek piyasa geçmişinin üzerinde.',
    };
  }

  if (dip) {
    return {
      ...temel,
      rozetTuru: 'gercek_firsat',
      gercekFirsat: true,
      rozetRengi: 'yesil',
      rozetMetni: '🔥 Gerçek Fırsat: Son 90 Günün En Düşük Fiyatı!',
      tooltip: `🔥 Gerçek Fırsat: Güncel fiyat ₺${tl(satis)}, son 90 günün en düşük kaydı `
        + `₺${tl(min90)} seviyesinde. Bu iddia gerçek fiyat geçmişinden doğrulandı.`,
      neden: null,
    };
  }

  return {
    ...temel,
    rozetTuru: 'normal',
    sahteIndirim: false,
    gercekFirsat: false,
    rozetRengi: 'notr',
    rozetMetni: normalBant && ort30
      ? `Piyasa normali: son ${pencereAdi} gün ortalaması ₺${tl(ort30)}`
      : null,
    tooltip: normalBant && ort30
      ? `Bu fiyat son ${pencereAdi} günün ortalamasına (₺${tl(ort30)}) yakın; yapay indirim algısı yok.`
      : null,
    neden: null,
  };
}

/**
 * Karşılaştırma sonucundaki HER teklif için V2 denetimi (pipeline yardımcısı).
 *
 * @param {Array<object>} sonuclar runComparison sonuç dizisi
 * @param {object|null} analiz getFiyatAnalizi() çıktısı
 * @returns {number} denetlenen teklif sayısı
 */
export function sahteIndirimleriIsaretle(sonuclar, analiz) {
  if (!Array.isArray(sonuclar)) return 0;
  let sayac = 0;
  for (const r of sonuclar) {
    if (r?.status !== 'found' || !r.product) continue;
    const satis = Number(r.product.pricing?.toplam ?? r.product.sellingPrice);
    if (!Number.isFinite(satis) || satis <= 0) continue;
    const liste = Number(r.product.listPrice ?? r.product.pricing?.etiket);
    r.sahteIndirim = sahteIndirimAnalizi({
      satisFiyati: satis,
      listeFiyati: Number.isFinite(liste) && liste > 0 ? liste : null,
      analiz,
    });
    // Geriye dönük uyum: eski arayüz `sisirilmisEtiket` bayrağını okuyor.
    r.sisirilmisEtiket = r.sahteIndirim.sahteIndirim;
    r.etiketOrani = r.sahteIndirim.etiketOraniOrt30;
    sayac++;
  }
  return sayac;
}
