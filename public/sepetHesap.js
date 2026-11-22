/**
 * 🧺 Akıllı Sepet — saf hesap katmanı (2026-11-08)
 *
 * Neden ayrı modül: senaryo sıralaması, tasarruf farkı, kargo açığı ve hazır
 * paket çözümlemesi DOM/ağ olmadan test edilebilmeli. `public/sepet.js` yalnızca
 * bu fonksiyonları çağırıp çizer.
 *
 * DÜRÜSTLÜK:
 *  - "Tasarruf" her zaman GERÇEK iki senaryonun toplamları farkıdır (kuruş bazında).
 *  - Paket parçası canlı katalogda yoksa UYDURULMAZ; eksik olarak raporlanır.
 *  - Kargo kurtarıcı yalnızca eşiğe kalan tutar kargo ücretinden küçükse anlamlıdır.
 *
 * Para: tüm ara hesaplar KURUŞ tam sayı — float hatası olmaz (proje standardı).
 */

export const MIN_URUN = 2;
export const MAKS_URUN = 10;

/** Kargo kurtarıcı yalnızca bu kadar yakın eşiklerde gösterilir (TL). */
export const KARGO_FIRSAT_SINIRI_TL = 150;

const kurus = (tl) => Math.round(Number(tl || 0) * 100);
const tl = (k) => Math.round(k) / 100;

/** "₺1.590,00" biçimi. */
export function para(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' TL';
}

/** "%12,5" biçimi. */
export function yuzde(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return '%' + v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

/**
 * Türkçe ablative eki ("Robotistan'dan", "Porima 3D'den").
 * CTA metninde mağaza adıyla birlikte kullanılır.
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
  if (!unluBul(sonKelime)) return "'den"; // "3D" gibi kısaltmalar
  const unlu = unluBul(sonKelime);
  const kalin = 'aıou'.includes(unlu.toLowerCase());
  const sonHarf = (temiz.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]$/) || [''])[0].toLowerCase();
  const sert = 'pçtkfhsş'.includes(sonHarf);
  if (kalin) return sert ? "'tan" : "'dan";
  return sert ? "'ten" : "'den";
}

/* ------------------------------------------------------------------ */
/* Senaryolar                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sunucu senaryolarını ekran sırasına (A/B/C) çevirir.
 *
 * Sıra görev tanımıyla aynıdır:
 *   A → maksimumTasarruf  (ham en ucuz, dağınık)
 *   B → tekMagaza         (akıllı tek mağaza)
 *   C → akilliBolunmus    (hibrit bölünmüş)
 *
 * Not: "önerilen" ETİKETİ burada sabitlenmez; gerçek toplamı en düşük olan
 * senaryo `onerilenAnahtar()` ile işaretlenir (uydurma öneri yok).
 */
export function senaryoListesi(sonuc) {
  const s = sonuc?.senaryolar || {};
  const tanim = [
    {
      harf: 'A',
      anahtar: 'maksimumTasarruf',
      baslik: 'Ham En Ucuz (Dağınık)',
      aciklama: 'Her ürün en ucuz olduğu mağazadan; kargo ayrı ayrı ödenir',
      vurgu: 'uyari',
    },
    {
      harf: 'B',
      anahtar: 'tekMagaza',
      baslik: 'Akıllı Tek Mağaza',
      aciklama: 'Hepsini tek yerden al; tek kargo, tek teslimat',
      vurgu: 'normal',
    },
    {
      harf: 'C',
      anahtar: 'akilliBolunmus',
      baslik: 'Hibrit Bölünmüş Sepet',
      aciklama: 'Kargo eşikleri hesaplanmış en iyi bölünme',
      vurgu: 'normal',
    },
  ];
  return tanim.map(t => ({
    ...t,
    senaryo: s[t.anahtar] || null,
    dolu: !!s[t.anahtar],
  }));
}

/** Toplamı en düşük geçerli senaryo (motorun kararı varsa o). */
export function onerilenAnahtar(sonuc) {
  const s = sonuc?.senaryolar || {};
  if (sonuc?.enIyiAnahtar && s[sonuc.enIyiAnahtar]) return sonuc.enIyiAnahtar;
  const adaylar = Object.entries(s).filter(([, v]) => v && Number.isFinite(Number(v.toplam)));
  if (!adaylar.length) return null;
  return adaylar.reduce((a, b) => (Number(b[1].toplam) < Number(a[1].toplam) ? b : a))[0];
}

/** İki senaryo arasındaki fark (TL, kuruş hassasiyetiyle). pahalı − ucuz. */
export function senaryoFarki(pahali, ucuz) {
  if (!pahali || !ucuz) return null;
  const fark = kurus(pahali.toplam) - kurus(ucuz.toplam);
  return { kurus: fark, tl: tl(fark), pahaliDahaPahali: fark > 0 };
}

/**
 * "Kargo yüzünden ₺X daha pahalı" + "₺Y tasarruf" metinleri.
 * @returns {{enIyiAnahtar:string|null, enPahaliAnahtar:string|null,
 *            tasarrufTL:number|null, tasarrufYuzde:number|null,
 *            kargoFarkiTL:number|null, metin:string|null}}
 */
export function tasarrufOzeti(sonuc) {
  const s = sonuc?.senaryolar || {};
  const dolu = Object.entries(s).filter(([, v]) => v && Number.isFinite(Number(v.toplam)));
  if (!dolu.length) {
    return { enIyiAnahtar: null, enPahaliAnahtar: null, tasarrufTL: null, tasarrufYuzde: null, kargoFarkiTL: null, metin: null };
  }
  const enIyi = dolu.reduce((a, b) => (Number(b[1].toplam) < Number(a[1].toplam) ? b : a));
  const enPahali = dolu.reduce((a, b) => (Number(b[1].toplam) > Number(a[1].toplam) ? b : a));
  const farkKurus = kurus(enPahali[1].toplam) - kurus(enIyi[1].toplam);
  const kargoFarkKurus = Math.abs(kurus(enPahali[1].kargo) - kurus(enIyi[1].kargo));
  const tasarrufTL = tl(farkKurus);
  const tasarrufYuzde = Number(enPahali[1].toplam) > 0
    ? Math.round((farkKurus / kurus(enPahali[1].toplam)) * 1000) / 10
    : null;

  let metin = null;
  if (farkKurus > 0) {
    const kargoEtkisi = kargoFarkKurus >= farkKurus
      ? 'Kargo ücretleri yüzünden '
      : '';
    metin = `${kargoEtkisi}${enPahali[1].etiket || enPahali[0]} yerine `
      + `${enIyi[1].etiket || enIyi[0]} seçerek ${para(tasarrufTL)} tasarruf edersiniz.`;
  }
  return {
    enIyiAnahtar: enIyi[0],
    enPahaliAnahtar: enPahali[0],
    tasarrufTL,
    tasarrufYuzde,
    kargoFarkiTL: tl(kargoFarkKurus),
    metin,
  };
}

/* ------------------------------------------------------------------ */
/* Kargo açığı / tamamlayıcı                                          */
/* ------------------------------------------------------------------ */

/**
 * Bir mağaza grubunun kargo eşiğine ne kadar kaldığını hesaplar.
 * `src/kargoTamamlayici.js → kargoAcigi` ile aynı kuralları uygular
 * (>= varsayılan, `freeOverExclusive` ise > ).
 *
 * @param {{araToplam:number, kargo:number, kargoKurali?:object}} grup
 */
export function kargoFirsati(grup) {
  const bos = { var: false, eksik: 0, kargoUcreti: 0, esik: null, netKazanc: null, mantikli: false, neden: '' };
  if (!grup) return { ...bos, neden: 'Mağaza bilgisi yok' };

  const toplam = Number(grup.araToplam);
  const kargoUcreti = Number(grup.kargo);
  const kural = grup.kargoKurali || null;

  if (!Number.isFinite(toplam) || toplam <= 0) return { ...bos, neden: 'Sepet tutarı bilinmiyor' };
  if (!kural) return { ...bos, neden: 'Kargo koşulu bilinmiyor' };
  if (kural.applies === false) return { ...bos, neden: 'Bu mağazada kargo zaten ücretsiz' };

  const esik = kural.freeOver != null ? Number(kural.freeOver) : null;
  if (!Number.isFinite(esik) || esik <= 0) return { ...bos, neden: 'Ücretsiz kargo eşiği tanımlı değil' };

  const gecti = kural.freeOverExclusive === true
    ? kurus(toplam) > kurus(esik)
    : kurus(toplam) >= kurus(esik);
  if (gecti) return { ...bos, esik, kargoUcreti, neden: 'Eşik zaten aşıldı — kargo bedava' };

  // Eşik aşılmamış ama kargo da ödenmiyorsa (ör. sepette netleşir) fırsat yok.
  if (!(kargoUcreti > 0)) return { ...bos, neden: 'Kargo ücreti ödenmiyor' };

  const eksikKurus = kurus(esik) - kurus(toplam) + (kural.freeOverExclusive === true ? 1 : 0);
  const eksik = tl(eksikKurus);
  const netKazanc = tl(kurus(kargoUcreti) - kurus(eksik));

  return {
    var: true,
    eksik,
    kargoUcreti,
    esik,
    netKazanc,
    // Eşiğe kalan tutar kargo ücretinden küçükse "ekle-kazan" gerçekten kârlı.
    mantikli: netKazanc > 0 && eksik <= KARGO_FIRSAT_SINIRI_TL,
    neden: `${para(eksik)} daha eklenirse kargo bedava`,
  };
}

/**
 * Tamamlayıcı ürün teklifinin net etkisi.
 * @param {{kargoUcreti:number}} acik
 * @param {{fiyat:number, title?:string, url?:string, afiliyeUrl?:string, kazanc?:number}} oneri
 */
export function tamamlayiciEtkisi(acik, oneri) {
  if (!acik?.var || !oneri) return null;
  const fiyat = Number(oneri.fiyat);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return null;
  const kurusNet = kurus(acik.kargoUcreti) - kurus(fiyat);
  return {
    fiyat,
    kargoUcreti: Number(acik.kargoUcreti),
    netKazanc: tl(kurusNet),
    // Tamamlayıcı kargodan pahalıysa "kâr" iddiası kurulmaz.
    mantikli: kurusNet > 0,
    metin: kurusNet > 0
      ? `${para(acik.kargoUcreti)} kargo yerine ${para(fiyat)} ürün ekleyip ${para(tl(kurusNet))} kâr edebilirsiniz.`
      : 'Bu ürün kargo ücretinden pahalı; eklemek kâr getirmez.',
  };
}

/* ------------------------------------------------------------------ */
/* Hazır filament paketleri                                            */
/* ------------------------------------------------------------------ */

/**
 * Tek tıkla doldurulabilen paketler. Her parça canlı filament kataloğundan
 * çözülür; ürün YOKSA uydurulmaz, "eksik" olarak gösterilir.
 *
 * `tercih` yalnızca marka/model tercihidir; bulunamazsa aynı sınıftan en ucuz
 * ürün eklenir ve `degisim` alanıyla kullanıcıya açıkça söylenir.
 */
export const PAKETLER = Object.freeze([
  {
    id: 'temel-renk',
    ikon: '🎨',
    ad: "3'lü Temel Renk Paketi",
    icerik: '1× Siyah PLA + 1× Beyaz PLA + 1× Gri PLA',
    parcalar: [
      { etiket: 'Siyah PLA', malzeme: 'PLA', renk: 'siyah', adet: 1 },
      { etiket: 'Beyaz PLA', malzeme: 'PLA', renk: 'beyaz', adet: 1 },
      { etiket: 'Gri PLA', malzeme: 'PLA', renk: 'gri', adet: 1 },
    ],
  },
  {
    id: 'hizli-baski',
    ikon: '⚡',
    ad: "3'lü Yüksek Hızlı Baskı Paketi",
    icerik: '2× eSun ePLA-HS + 1× Creality Hyper PLA',
    parcalar: [
      { etiket: 'eSun ePLA-HS', malzeme: 'PLA', hizli: true, tercih: /esun/i, adet: 2 },
      { etiket: 'Creality Hyper PLA', malzeme: 'PLA', hizli: true, tercih: /creality/i, adet: 1 },
    ],
  },
  {
    id: 'dayanikli',
    ikon: '🦾',
    ad: 'Dayanıklı Prototip Paketi',
    icerik: '2× PETG + 1× ABS',
    parcalar: [
      { etiket: 'PETG', malzeme: 'PETG', adet: 2 },
      { etiket: 'ABS', malzeme: 'ABS', adet: 1 },
    ],
  },
]);

/** Türkçe renk sözcüklerini başlıkta ararken kullanılan eşleştiriciler. */
const RENK_DESENI = {
  siyah: /siyah|black/i,
  beyaz: /beyaz|white/i,
  gri: /gri|grey|gray/i,
  kirmizi: /kırmızı|kirmizi|red/i,
  mavi: /mavi|blue/i,
  yesil: /yeşil|yesil|green/i,
  sari: /sarı|sari|yellow/i,
  turuncu: /turuncu|orange/i,
  pembe: /pembe|pink/i,
  mor: /mor\b|purple/i,
  altin: /altın|altin|gold/i,
};

/** "PLA" ailesi: PLA, PLA+, Hyper PLA… ama PETG/ABS hariç. */
function malzemeAilesi(teklif) {
  const metin = `${teklif?.malzeme || ''} ${teklif?.ad || ''}`.toUpperCase();
  if (/PETG/.test(metin)) return 'PETG';
  if (/\bABS\b/.test(metin) || / ABS /.test(metin)) return 'ABS';
  if (/TPU/.test(metin)) return 'TPU';
  if (/ASA/.test(metin)) return 'ASA';
  if (/PLA/.test(metin)) return 'PLA';
  return null;
}

function hizliMi(teklif) {
  const metin = `${teklif?.malzeme || ''} ${teklif?.ad || ''}`;
  return /hyper|yüksek hız|yuksek hiz|high\s*speed|epla-?hs|pla\+?hs/i.test(metin);
}

/**
 * Paketi canlı filament listesinden çözer.
 *
 * @param {object} paket PAKETLER içinden
 * @param {Array} teklifler /api/baski/en-ucuz-filamentler çıktısı
 * @returns {{paket:object, parcalar:Array, eksikler:Array, degisimler:Array,
 *            eklenebilir:boolean, adet:number, tahminiToplam:number|null}}
 *   parcalar: [{etiket, adet, teklif}] — teklif gerçek (ad/site/fiyat/url dolu)
 */
export function paketCoz(paket, teklifler) {
  const havuz = (Array.isArray(teklifler) ? teklifler : [])
    .filter(t => t && t.ad && Number(t.fiyat) > 0 && t.url);
  const parcalar = [];
  const eksikler = [];
  const degisimler = [];

  for (const parca of paket?.parcalar || []) {
    const aile = String(parca.malzeme || '').toUpperCase();
    let adaylar = havuz.filter(t => malzemeAilesi(t) === aile);
    if (parca.hizli) adaylar = adaylar.filter(hizliMi);
    if (parca.renk) {
      const desen = RENK_DESENI[String(parca.renk).toLowerCase()];
      if (desen) {
        adaylar = adaylar.filter(t => desen.test(`${t.renk || ''} ${t.ad}`));
      }
    }
    if (!adaylar.length) {
      eksikler.push({ etiket: parca.etiket, adet: parca.adet || 1 });
      continue;
    }

    // Tercih edilen marka varsa ilk onu dene; yoksa en ucuzla devam et (şeffaf).
    let secili = null;
    if (parca.tercih) {
      const tercihli = adaylar.filter(t => parca.tercih.test(`${t.ad} ${t.site || ''}`));
      if (tercihli.length) {
        secili = tercihli.reduce((a, b) => (Number(a.fiyat) <= Number(b.fiyat) ? a : b));
      }
    }
    if (!secili) {
      secili = adaylar.reduce((a, b) => (Number(a.fiyat) <= Number(b.fiyat) ? a : b));
      if (parca.tercih) {
        degisimler.push({
          etiket: parca.etiket,
          istenen: parca.etiket,
          eklenen: secili.ad,
        });
      }
    }
    const eklenenAdet = parca.adet || 1;
    const teklifAnahtari = String(secili.url || secili.ad || '').trim().toLowerCase();
    const mevcut = parcalar.find(
      p => String(p.teklif?.url || p.teklif?.ad || '').trim().toLowerCase() === teklifAnahtari,
    );
    if (mevcut) {
      mevcut.adet = (mevcut.adet || 1) + eklenenAdet;
    } else {
      parcalar.push({ etiket: parca.etiket, adet: eklenenAdet, teklif: secili });
    }
  }

  // Paket toplamı: adet × gerçek fiyat (kargo hariç; kargo sepet motorunda).
  const tahminiKurus = parcalar.reduce(
    (s, p) => s + kurus(p.teklif.fiyat) * (p.adet || 1), 0,
  );
  const adet = parcalar.reduce((s, p) => s + (p.adet || 1), 0);

  return {
    paket,
    parcalar,
    eksikler,
    degisimler,
    // En az 2 ürün yoksa sepet optimize edilemez.
    eklenebilir: adet >= MIN_URUN,
    adet,
    tahminiToplam: parcalar.length ? tl(tahminiKurus) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Sepet doğrulama                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tarayıcı deposundan gelen sepeti doğrular/normalize eder.
 * Bozuk kayıt çökmeye değil, boş sepete yol açar.
 */
export function sepetNormalize(ham) {
  let liste = ham;
  if (typeof liste === 'string') {
    try { liste = JSON.parse(liste); } catch { liste = []; }
  }
  if (!Array.isArray(liste)) return [];
  const gorulen = new Set();
  const out = [];
  for (const x of liste) {
    if (!x || typeof x !== 'object') continue;
    const isAdMod = x.tur === 'ad';
    const url = String(x.url || x.ad || '').trim();
    if (!url) continue;
    if (!isAdMod && !/^https?:\/\//i.test(url)) continue;
    if (isAdMod && url.length < 2) continue;
    const adet = Math.max(1, Math.min(9, Math.round(Number(x.adet) || 1)));
    const ad = String(x.ad || '').trim().slice(0, 200) || url;
    const anahtar = url.toLowerCase();
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    out.push({
      id: String(x.id || ('p' + (out.length + 1))),
      ad,
      url,
      tur: isAdMod ? 'ad' : 'url',
      adet,
      site: x.site ? String(x.site) : null,
      fiyat: Number.isFinite(Number(x.fiyat)) ? Math.round(Number(x.fiyat) * 100) / 100 : null,
      kaynak: x.kaynak === 'paket' || x.kaynak === 'arama' || x.kaynak === 'link' ? x.kaynak : 'elle',
    });
    if (out.length >= MAKS_URUN) break;
  }
  return out;
}

/**
 * Sepet geçerliliği: en az 2, en fazla 10 (adetler toplamı).
 * @returns {{ok:boolean, hata:string|null, adet:number}}
 */
export function sepetDogrula(sepet) {
  const liste = Array.isArray(sepet) ? sepet : [];
  const adet = liste.reduce((s, x) => s + Math.max(1, Math.round(Number(x?.adet) || 1)), 0);
  if (adet < MIN_URUN) {
    return { ok: false, hata: `Sepet için en az ${MIN_URUN} ürün gerekli.`, adet };
  }
  if (adet > MAKS_URUN) {
    return { ok: false, hata: `Sepet en fazla ${MAKS_URUN} ürün alabilir.`, adet };
  }
  const gecersiz = liste.find(x => {
    if (x?.tur === 'ad') return String(x.ad || x.url || '').trim().length < 2;
    return !/^https?:\/\//i.test(String(x?.url || ''));
  });
  if (gecersiz) return { ok: false, hata: 'Tüm ürünler için geçerli bir ürün linki veya adı gerekli.', adet };
  return { ok: true, hata: null, adet };
}

/** Sepetin kullanıcıya gösterilen tahmini tutarı (kargo hariç). */
export function sepetToplami(sepet) {
  const liste = Array.isArray(sepet) ? sepet : [];
  const k = liste.reduce((s, x) => {
    const f = Number(x?.fiyat);
    if (!Number.isFinite(f) || f <= 0) return s;
    return s + kurus(f) * Math.max(1, Math.round(Number(x?.adet) || 1));
  }, 0);
  return tl(k);
}

/**
 * Sepeti /api/sepet gövdesine çevirir (adet kadar tekrar).
 * Aynı link tekrar ederse sunucu önbelleği kullanır; kimlikler sıralıdır.
 */
export function sepetIstekGovdesi(sepet) {
  const urunler = [];
  for (const x of Array.isArray(sepet) ? sepet : []) {
    const adet = Math.max(1, Math.min(9, Math.round(Number(x?.adet) || 1)));
    for (let i = 0; i < adet; i++) {
      urunler.push({ url: x.url, ad: x.ad });
      if (urunler.length >= MAKS_URUN) return { urunler };
    }
  }
  return { urunler };
}

/** Senaryo kartı için kargo satırı metni. */
export function kargoMetni(senaryo) {
  if (!senaryo) return '—';
  const k = Number(senaryo.kargo) || 0;
  if (k <= 0) return 'Kargo: ₺0,00 (eşik aşıldı)';
  const magaza = Number(senaryo.magazaSayisi) || (senaryo.gruplar || []).length || 0;
  return `Kargo: ${para(k)}${magaza > 1 ? ` (${magaza} × ayrı gönderim)` : ''}`;
}

/**
 * 📊 Kıyaslama barı verisi (2026-11-12).
 *
 * Tek mağaza toplamı ile bölünmüş (en iyi) sepet toplamını karşılaştırır.
 * Dönen `oran` = enIyi / tekMagaza × 100 → bar genişliği (0-100).
 *
 * @param {object} sonuc sepet sonucu (tekMagazaToplam / enIyiToplam)
 * @returns {{
 *   var: boolean, tekMagaza: number|null, enIyi: number|null,
 *   tasarruf: number|null, tasarrufYuzde: number|null, oran: number|null,
 *   tekMagazaEnIyi: boolean, sebep?: string,
 * }}
 */
export function kiyasVerisi(sonuc) {
  const bos = {
    var: false, tekMagaza: null, enIyi: null, tasarruf: null,
    tasarrufYuzde: null, oran: null, tekMagazaEnIyi: false,
  };
  const tek = Number(sonuc?.tekMagazaToplam);
  const en = Number(sonuc?.enIyiToplam);
  if (!Number.isFinite(tek) || tek <= 0) return { ...bos, sebep: 'Tek mağaza toplamı yok' };
  if (!Number.isFinite(en) || en <= 0) return { ...bos, sebep: 'Bölünmüş sepet toplamı yok' };

  const farkKurus = kurus(tek) - kurus(en);
  const tasarruf = tl(farkKurus);
  const tasarrufYuzde = Math.round((farkKurus / kurus(tek)) * 1000) / 10;
  // Bar oranı: bölünmüş sepet daha ucuzsa daha kısa çubuk (tasarruf görünür).
  const oran = Math.max(0, Math.min(100, Math.round((kurus(en) / kurus(tek)) * 1000) / 10));

  return {
    var: true,
    tekMagaza: tek,
    enIyi: en,
    tasarruf,
    tasarrufYuzde,
    oran,
    // Tek mağaza zaten en ucuz/eşit → kıyas barı yerine tebrik kartı.
    tekMagazaEnIyi: farkKurus <= 0,
  };
}

/**
 * 📦 Paket kutusu için kargo durumu + eşik ipucu (tek kaynak).
 *
 * @param {{araToplam:number, kargo:number, kargoKurali?:object}} grup
 * @returns {{ bedava: boolean, kargo: number, esikIpucu: number|null,
 *            esikFarki: number|null, esik: number|null }}
 *   `esikIpucu` = "şu kadar eklersen bedava" (yalnızca EKLENEN tutar kargo
 *   ücretinden KÜÇÜKSE — aksi hâlde tavsiye kullanıcıyı zarara sokardı).
 *   `esikFarki` = eşiğe kalan tutar (her durumda, bilgilendirme için).
 */
export function paketKargoDurumu(grup) {
  const kargo = Number(grup?.kargo) || 0;
  const kural = grup?.kargoKurali || null;
  const esik = kural?.freeOver != null ? Number(kural.freeOver) : null;
  const ara = Number(grup?.araToplam);
  const gecti = Number.isFinite(esik) && esik > 0 && Number.isFinite(ara)
    && (kural?.freeOverExclusive === true ? ara > esik : ara >= esik);
  const belirsiz = grup?.kargoBelirsiz === true
    || (kargo <= 0 && kural != null && kural.applies !== false && kural.fee == null && !gecti);
  const durum = { bedava: !belirsiz && kargo <= 0, belirsiz, kargo, esikIpucu: null, esikFarki: null, esik: null };
  if (durum.bedava) return durum;
  if (Number.isFinite(esik) && esik > 0 && Number.isFinite(ara) && ara < esik) {
    durum.esik = esik;
    durum.esikFarki = tl(kurus(esik) - kurus(ara) + (kural.freeOverExclusive === true ? 1 : 0));
  }

  // Kargo ücretli: eşik varsa "şu kadar ekle → bedava" ipucu (kârlıysa).
  const firsat = kargoFirsati(grup);
  if (firsat.var && firsat.mantikli) {
    durum.esikIpucu = firsat.eksik;
    durum.esik = firsat.esik;
  }
  return durum;
}

/**
 * "📦 Paket 1 / 2" çipi için bölünmüş sepet özeti.
 * @param {object} sonuc
 * @returns {{ paketSayisi:number, bolunmusMu:boolean }}
 */
export function paketOzeti(sonuc) {
  const gruplar = sonuc?.senaryolar?.akilliBolunmus?.gruplar || [];
  return { paketSayisi: gruplar.length, bolunmusMu: gruplar.length > 1 };
}

export default {
  MIN_URUN, MAKS_URUN, KARGO_FIRSAT_SINIRI_TL,
  para, yuzde, turkceAblatif, senaryoListesi, onerilenAnahtar, senaryoFarki, tasarrufOzeti,
  kargoFirsati, tamamlayiciEtkisi, paketCoz, PAKETLER,
  sepetNormalize, sepetDogrula, sepetToplami, sepetIstekGovdesi, kargoMetni,
  kiyasVerisi, paketKargoDurumu, paketOzeti,
};
