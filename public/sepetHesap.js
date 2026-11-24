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

/** "₺1.590,00" (veya global bölgede $ / € / ¥) biçimi. */
export function para(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  if (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM && window.BASKI_HESAP_ORTAM.dil && window.BASKI_HESAP_ORTAM.dil !== 'tr') {
    const { currency = 'USD', yerel = 'en-US' } = window.BASKI_HESAP_ORTAM;
    if (typeof window.formatPara === 'function') return window.formatPara(n, currency, yerel);
    return Number(n).toLocaleString(yerel, { style: 'currency', currency });
  }
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
    i18n: {
      en: { ad: '3-Spool Essential Color Pack', icerik: '1× Black PLA + 1× White PLA + 1× Grey PLA', etiketler: ['Black PLA', 'White PLA', 'Grey PLA'] },
      fr: { ad: 'Pack 3 Couleurs Essentielles', icerik: '1× PLA Noir + 1× PLA Blanc + 1× PLA Gris', etiketler: ['PLA Noir', 'PLA Blanc', 'PLA Gris'] },
      ja: { ad: '定番カラー PLA 3本セット', icerik: 'ブラック PLA ×1 + ホワイト PLA ×1 + グレー PLA ×1', etiketler: ['ブラック PLA', 'ホワイト PLA', 'グレー PLA'] },
    },
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
    i18n: {
      en: { ad: '3-Spool High-Speed Pack', icerik: '2× eSun ePLA-HS + 1× Creality Hyper PLA', etiketler: ['eSun ePLA-HS', 'Creality Hyper PLA'] },
      fr: { ad: 'Pack 3 Bobines Haute Vitesse', icerik: '2× eSun ePLA-HS + 1× Creality Hyper PLA', etiketler: ['eSun ePLA-HS', 'Creality Hyper PLA'] },
      ja: { ad: '高速印刷向け PLA 3本セット', icerik: 'eSun ePLA-HS ×2 + Creality Hyper PLA ×1', etiketler: ['eSun ePLA-HS', 'Creality Hyper PLA'] },
    },
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
    i18n: {
      en: { ad: 'Durable Prototype Pack', icerik: '2× PETG + 1× ABS', etiketler: ['PETG', 'ABS'] },
      fr: { ad: 'Pack Prototype Résistant', icerik: '2× PETG + 1× ABS', etiketler: ['PETG', 'ABS'] },
      ja: { ad: '高耐久プロトタイプセット', icerik: 'PETG ×2 + ABS ×1', etiketler: ['PETG', 'ABS'] },
    },
    parcalar: [
      { etiket: 'PETG', malzeme: 'PETG', adet: 2 },
      { etiket: 'ABS', malzeme: 'ABS', adet: 1 },
    ],
  },
]);

/** Paketin başlık, içerik ve parça etiketlerini seçili dilde döndürür. */
export function paketCevir(paket, dil = 'tr') {
  if (!paket || !dil || dil === 'tr') return paket;
  const cev = paket.i18n?.[dil];
  if (!cev) return paket;
  return {
    ...paket,
    ad: cev.ad || paket.ad,
    icerik: cev.icerik || paket.icerik,
    parcalar: (paket.parcalar || []).map((p, idx) => ({
      ...p,
      etiket: cev.etiketler?.[idx] || p.etiket,
    })),
  };
}

/** Renk sözcüklerini TR/EN/FR/JA başlıklarında ararken kullanılan eşleştiriciler. */
const RENK_DESENI = {
  siyah: /siyah|black|noir|noire|黒|ブラック/i,
  beyaz: /beyaz|white|blanc|blanche|白|ホワイト/i,
  gri: /gri|grey|gray|gris|grise|silver|argent|灰|グレー|シルバー/i,
  kirmizi: /kırmızı|kirmizi|red|rouge|赤|レッド/i,
  mavi: /mavi|blue|bleu|bleue|青|ブルー/i,
  yesil: /yeşil|yesil|green|vert|verte|緑|グリーン/i,
  sari: /sarı|sari|yellow|jaune|黄|イエロー/i,
  turuncu: /turuncu|orange|オレンジ/i,
  pembe: /pembe|pink|rose|ピンク/i,
  mor: /mor\b|purple|violet|violette|紫|パープル/i,
  altin: /altın|altin|gold|or\b|金|ゴールド/i,
};

/** "PLA" ailesi: PLA, PLA+, Hyper PLA… ama toz/destek/PETG/ABS/PLA-CF hariç. */
function malzemeAilesi(teklif) {
  const hamAd = String(teklif?.ad || '').toUpperCase();
  const metin = `${teklif?.malzeme || ''} ${hamAd}`.toUpperCase();
  if (/\b(POWDER|POUDRE|PELLETS?|SLS)\b|パウダー|ペレット|\bTOZ\b/.test(metin)) return null;
  if (/\b(SUPPORT|BREAKAWAY|PVA|BVOH|HIPS|DESTEK)\b|サポート/.test(metin)) return 'SUPPORT';
  if (/PLA[\s-]*CF|CARBON\s*FIBER|KARBON\s*FIBER/.test(metin)) return 'PLA-CF';
  if (/PETG/.test(metin)) return 'PETG';
  if (/\bABS\b/.test(metin) || / ABS /.test(metin)) return 'ABS';
  if (/TPU/.test(metin)) return 'TPU';
  if (/ASA/.test(metin)) return 'ASA';
  if (/PLA/.test(metin)) return 'PLA';
  return null;
}

function teklifGramaji(teklif) {
  const g = Number(teklif?.makaraGram);
  if (Number.isFinite(g) && g > 0) return g;
  const s = `${teklif?.ad || ''} ${teklif?.birimMetni || ''}`;
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr)\b/i.exec(s);
  if (!m) return null;
  const val = parseFloat(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(val) || val <= 0) return null;
  return m[2].toLowerCase() === 'kg' ? val * 1000 : val;
}

function toptanVeyaDevMakaraMi(teklif) {
  const ad = String(teklif?.ad || '');
  if (/\b(moq\s*:|pre-?sale|bundle\s*sale|mega\s*pack|lot\s+de\s+\d+|large\s*spool)\b|プレセール|最低注文|\d+\s*色セット|\b\d+\s*[x×]\s*0\.\d+\s*kg\b|\b1\s*kg\s*[x×]\s*(?:[3-9]|1\d)\b|\b(?:[3-9]|1\d)\s*[x×]\s*1\s*kg\b/i.test(ad)) {
    return true;
  }
  const gram = teklifGramaji(teklif);
  if (gram != null && (gram > 2200 || gram < 450)) return true;
  const fiyat = Number(teklif?.fiyat);
  const para = String(teklif?.paraBirimi || '').toUpperCase();
  if (para === 'JPY' && fiyat < 300) return true;
  if ((para === 'USD' || para === 'EUR') && fiyat < 4) return true;
  if (para === 'TRY' && fiyat < 50) return true;
  return false;
}

function hizliMi(teklif) {
  const metin = `${teklif?.malzeme || ''} ${teklif?.ad || ''}`;
  return /hyper|yüksek hız|yuksek hiz|high[\s-]*speed|rapid|rapide|vitesse|高速|epla-?hs|pla\+?[\s-]*hs|\bhs\b/i.test(metin);
}

/** Tek bir renk/makara başlığına göre en uygun adayı seçer (çoklu-renk swatch ilanları arka planda bırakılır). */
function enUygunAdaySec(adaylar) {
  const cokluRenkMi = (t) => /(?:[a-z]+\/){2,}[a-z]+/i.test(String(t?.ad || ''));
  return adaylar.reduce((a, b) => {
    const ca = cokluRenkMi(a) ? 1 : 0;
    const cb = cokluRenkMi(b) ? 1 : 0;
    if (ca !== cb) return ca < cb ? a : b;
    return Number(a.fiyat) <= Number(b.fiyat) ? a : b;
  });
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
export function paketCoz(paket, teklifler, dil = 'tr') {
  const cevrilmisPaket = paketCevir(paket, dil);
  const havuz = (Array.isArray(teklifler) ? teklifler : [])
    .filter(t => t && t.ad && Number(t.fiyat) > 0 && t.url && !toptanVeyaDevMakaraMi(t));
  const parcalar = [];
  const eksikler = [];
  const degisimler = [];

  for (const parca of cevrilmisPaket?.parcalar || []) {
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
        secili = enUygunAdaySec(tercihli);
      }
    }
    if (!secili) {
      secili = enUygunAdaySec(adaylar);
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
  if (k <= 0) {
    if (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM && window.BASKI_HESAP_ORTAM.dil !== 'tr') {
      return `Shipping: ${para(0)} (free threshold met)`;
    }
    return 'Kargo: ₺0,00 (eşik aşıldı)';
  }
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
