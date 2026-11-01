/**
 * Net Etkin Fiyat Motoru — Node.js portu
 * ======================================
 *
 * Python referans uygulaması: net-fiyat-motoru/net_effective_price.py
 * (senaryolar.py ile doğrulanmıştır; bu port aynı semantiği korur).
 *
 * Net Etkin Fiyat = Etiket − (ürün + sepet + kupon + banka indirimleri)
 *                   + kargo + hizmet bedeli + (gerekirse vergi/vade farkı)
 *                   − (sonradan kullanılabilen cashback/puan değeri)
 *
 * PARA HASSASİYETİ: tüm hesaplar KURUŞ cinsinden TAM SAYIlarla yapılır
 * (kayan nokta hatası olmaz); yuvarlama pozitiflerde yarım-yukarı (ROUND_HALF_UP).
 * Sonuç TL olarak döner (kuruş / 100 — iki ondalık exact).
 *
 * İlkeler:
 *  - İndirim sırası: ürün → sepet → kupon → banka (gerçek ödeme akışı).
 *  - Yüzde indirim o anki ara toplamdan hesaplanır; maxDiscount tavanı uygulanır.
 *  - Banka kampanyası kuponla birleşemiyorsa motor kullanıcı için EN İYİ
 *    geçerli kombinasyonu seçer ve bunu varsayım olarak raporlar.
 *  - Cashback ödeme anında düşülmez → payableNow ile effectiveCost ayrı raporlanır.
 *  - Sahte veri yok: uygulanamayan her indirim gerekçesiyle skipped listesine girer.
 */

// ---------------------------------------------------------------------------
// Kuruş yardımcıları
// ---------------------------------------------------------------------------

const KURUS = 100;

/** TL (sayı ya da string) -> kuruş tam sayısı. */
export function kurusa(tl) {
  if (tl == null || tl === '') return null;
  return Math.round(Number(tl) * KURUS);
}

/** Kuruş tam sayısı -> TL sayısı. */
export function tlYap(kurus) {
  return kurus == null ? null : kurus / KURUS;
}

// ---------------------------------------------------------------------------
// Girdi şartnamesi (JSON) — Python modelinin birebir karşılığı
// ---------------------------------------------------------------------------
//
// product_data = {
//   currency: "TRY",
//   listPrice: 1200.00, sellingPrice: 1050.00,
//   priceIncludesTax: true,
//   taxes: [{type: "KDV", rate: 0.20, amountIncluded: 175}],
//   cartDiscounts: [{id, method: "percent"|"fixed", value, minBasket, maxDiscount, label, expiresAt, source}],
//   coupons: [{id, code, method, value, minBasket, maxDiscount, label, expiresAt}],
//   bankCampaigns: [{id, bank, cardProgram, method, value, minBasket,
//                    combinableWithCoupons, installments: [{count, surcharge}], label}],
//   shipping: {fee, freeOver, thresholdBase: "after_discounts"|"list_price"},
//   cashback: {kind: "points"|"cash", rate, value, base: "payable"|"post_discount", usableImmediately},
//   fees: [{kind, amount}],
// }
//
// user_context = {
//   currency: "TRY",
//   couponsOwned: ["YAZ50"],
//   card: {bank: "Ziraat", program: "Bankkart"},
//   installmentCount: null,
//   now: "2026-10-24T12:00:00",
//   exchangeRates: {USD: 34.50},
// }

/**
 * Net etkin fiyatı hesaplar.
 * @returns {object} {currency, listPrice, sellingPrice, breakdown, payableNow,
 *                    cashbackValue, effectiveCost, subtotalBeforeShipping,
 *                    appliedDiscountTotal, shippingInfo, skipped, warnings, assumptions}
 */
export function netFiyatHesapla(productData, userContext = {}) {
  const p = productData || {};
  const ctx = userContext || {};
  const kur = p.currency || 'TRY';
  const simdi = ctx.now ? new Date(ctx.now) : new Date();

  const listKurus = kurusa(p.listPrice);
  const satisKurus = p.sellingPrice != null ? kurusa(p.sellingPrice) : listKurus;

  const breakdown = [];
  const skipped = [];
  const warnings = [];
  const assumptions = [];

  const push = (step, label, amountKurus, note = '') =>
    breakdown.push({ step, label, amount: tlYap(amountKurus), note });

  // 1) Başlangıç tabanı: satış fiyatı (etiketten ürün indirimi düşülmüş hali)
  let base = satisKurus;
  push('list_price', `Etiket fiyatı (${kur})`, listKurus);
  if (listKurus != null && satisKurus != null && listKurus !== satisKurus) {
    push('product_discount', 'Ürün indirimi (etiket → satış)', -(listKurus - satisKurus));
  }
  push('selling_price', `Satış fiyatı (${kur})`, satisKurus);

  // 2) Vergi: etikete dahil değilse EKLE; dahilse yalnızca bilgi (iki kez sayılmaz)
  if (p.priceIncludesTax === false && Array.isArray(p.taxes)) {
    for (const t of p.taxes) {
      const vergi = Math.round(base * Number(t.rate));
      base += vergi;
      const yuzde = formatYuzde(Number(t.rate) * 100);
      push('tax', `${t.type} (%${yuzde})`, vergi);
    }
  } else if (Array.isArray(p.taxes) && p.taxes.length) {
    const toplamVergi = p.taxes.reduce((s, t) => s + (Number(t.amountIncluded) || 0), 0);
    if (toplamVergi > 0) {
      assumptions.push(`Etiket fiyatı vergilidir; içinde yaklaşık ${toplamVergi.toFixed(2)} ${kur} ${p.taxes.map(t => t.type).join(', ')} var.`);
    }
  }

  // 3) Sepet indirimleri: süre + minimum sepet kontrolü, sırayla uygula
  const cartDiscounts = (p.cartDiscounts || []).filter(d => {
    const sebep = uygunlukKontrolu(d, base, kur, simdi, 'İndirim');
    if (sebep) { skipped.push({ id: d.id, label: d.label || d.id, reason: sebep }); return false; }
    return true;
  });
  for (const d of cartDiscounts) {
    base = indirimUygula(d, base, push, 'cart_discount');
  }

  // 4) Kuponlar: kullanıcı cüzdanı + süre + minimum sepet
  const coupons = (p.coupons || []).filter(c => {
    if (Array.isArray(ctx.couponsOwned) && ctx.couponsOwned.length && c.code && !ctx.couponsOwned.includes(c.code)) {
      skipped.push({ id: c.id, label: c.label || c.id, reason: 'Bu kupon kullanıcının cüzdanında yok' });
      return false;
    }
    const sebep = uygunlukKontrolu(c, base, kur, simdi, 'Kupon');
    if (sebep) { skipped.push({ id: c.id, label: c.label || c.id, reason: sebep }); return false; }
    return true;
  });

  // 5) Banka kampanyaları: kart eşleşmesi + minimum sepet
  const banks = (p.bankCampaigns || []).filter(b => {
    if (!kartEslesir(b, ctx.card)) {
      skipped.push({ id: b.id, label: b.label || b.id, reason: `Kart uyuşmuyor (gereken: ${b.bank || 'herhangi bir banka'} ${b.cardProgram || ''})`.trim() });
      return false;
    }
    const sebep = uygunlukKontrolu(b, base, kur, simdi, 'Kampanya');
    if (sebep) { skipped.push({ id: b.id, label: b.label || b.id, reason: sebep }); return false;
    }
    return true;
  });

  // 6) Kupon/banka birleşmezliği → kullanıcı için en düşük ödemeyi veren yol
  const { kullanilanKuponlar, kullanilanBankalar } = kombinasyonCoz(coupons, banks, base, assumptions);
  for (const c of coupons) {
    if (!kullanilanKuponlar.includes(c)) {
      skipped.push({ id: c.id, label: c.label || c.id, reason: 'Banka kampanyasıyla birleşmediği için uygulanmadı (daha avantajlı kombinasyon seçildi)' });
    }
  }
  for (const b of banks) {
    if (!kullanilanBankalar.includes(b)) {
      skipped.push({ id: b.id, label: b.label || b.id, reason: 'Kuponla birleşmediği için uygulanmadı (daha avantajlı kombinasyon seçildi)' });
    }
  }
  for (const c of kullanilanKuponlar) base = indirimUygula(c, base, push, 'coupon');
  for (const b of kullanilanBankalar) base = indirimUygula(bankaIndirimiYap(b), base, push, 'bank_discount');

  const araToplamKurus = base; // kargo öncesi, indirim sonrası

  // 7) Kargo: eşik hangi tutarla karşılaştırılacaksa ona göre
  const ship = p.shipping || {};
  const kargo = kargoCoz(ship, base, satisKurus);
  if (kargo.bedava) {
    push('shipping', 'Kargo', 0, `${tlYap(kurusa(ship.freeOver))} ${kur} üzeri ücretsiz — eşik aşıldı`);
  } else if (kargo.bilinmiyor) {
    const esikNotu = ship.freeOver != null
      ? `${tlYap(kurusa(ship.freeOver))} ${kur} üzeri ücretsiz kargo (ürün eşiğin altında; ücret sepette netleşir)`
      : 'Kargo ücreti bilinmiyor (sepette netleşir)';
    push('shipping', 'Kargo', 0, esikNotu);
  } else if (kargo.ucret != null && kargo.ucret > 0) {
    push('shipping', 'Kargo ücreti', kargo.ucret, ship.note || '');
    base += kargo.ucret;
  }

  // 8) Hizmet bedelleri / komisyonlar
  for (const f of (p.fees || [])) {
    const tutar = kurusa(f.amount);
    if (tutar > 0) {
      base += tutar;
      push('fee', `${f.kind || 'Hizmet'} bedeli`, tutar);
    }
  }

  // 9) Taksit vade farkı (taksit İNDİRİMİ asla sayılmaz — yalnızca maliyet)
  if (ctx.installmentCount) {
    const plan = (p.bankCampaigns || []).flatMap(b => b.installments || []).find(i => i.count === ctx.installmentCount);
    if (!plan) {
      warnings.push(`${ctx.installmentCount} taksit planı bulunamadı; peşin hesaplandı.`);
    } else if (kurusa(plan.surcharge) > 0) {
      const vade = kurusa(plan.surcharge);
      base += vade;
      push('installment_surcharge', `${plan.count} taksit vade farkı`, vade);
    }
  }

  const payableNowKurus = base;

  // 10) Cashback / puan (ödeme anında düşmez → ayrı rapor)
  let cashbackKurus = 0;
  const cb = p.cashback;
  if (cb) {
    const cbTaban = cb.base === 'payable' ? payableNowKurus : araToplamKurus;
    if (cb.value != null) cashbackKurus = kurusa(cb.value) || 0;
    else if (cb.rate) cashbackKurus = Math.round(cbTaban * Number(cb.rate));
    if (cashbackKurus > 0 && !cb.usableImmediately) {
      const tur = cb.kind === 'cash' ? 'Cashback' : 'Puan';
      assumptions.push(`${tur} ödeme anında düşmez; sonraki alışverişte kullanılabilir.`);
    }
  }
  const effectiveKurus = payableNowKurus - cashbackKurus;

  const sonuc = {
    currency: kur,
    listPrice: tlYap(listKurus),
    sellingPrice: tlYap(satisKurus),
    breakdown,
    payableNow: tlYap(payableNowKurus),
    cashbackValue: tlYap(cashbackKurus),
    effectiveCost: tlYap(effectiveKurus),
    subtotalBeforeShipping: tlYap(araToplamKurus),
    appliedDiscountTotal: tlYap(satisKurus - araToplamKurus),
    shippingInfo: {
      fee: kargo.ucret != null ? tlYap(kargo.ucret) : null,
      free: !!kargo.bedava,
      unknown: !!kargo.bilinmiyor,
    },
    skipped,
    warnings,
    assumptions,
  };

  // 11) Para birimi farkı: hesap ÜRÜN para birimiyle yapıldı; çevirim en SONDA
  if (ctx.currency && ctx.currency !== kur) {
    const oran = ctx.exchangeRates && ctx.exchangeRates[kur];
    if (oran != null) {
      const cevir = (tl) => tl == null ? null : Math.round(tl * KURUS * Number(oran)) / KURUS;
      sonuc.currency = ctx.currency;
      sonuc.listPrice = cevir(sonuc.listPrice);
      sonuc.sellingPrice = cevir(sonuc.sellingPrice);
      for (const b of sonuc.breakdown) b.amount = cevir(b.amount);
      sonuc.payableNow = cevir(sonuc.payableNow);
      sonuc.cashbackValue = cevir(sonuc.cashbackValue);
      sonuc.effectiveCost = cevir(sonuc.effectiveCost);
      sonuc.subtotalBeforeShipping = cevir(sonuc.subtotalBeforeShipping);
      sonuc.appliedDiscountTotal = cevir(sonuc.appliedDiscountTotal);
      assumptions.push(`Hesap ${kur} ile yapıldı, sonuç ${ctx.currency}'ya çevrildi (kur ${oran}).`);
    } else {
      warnings.push(`${kur} -> ${ctx.currency} kuru verilmedi; sonuç ${kur} ile raporlandı.`);
    }
  }

  return sonuc;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Süre/minimum sepet uygunluğu; uygunsa null, değilse gerekçe döner. */
function uygunlukKontrolu(spec, baseKurus, kur, simdi, turAdi) {
  if (spec.expiresAt) {
    const son = new Date(spec.expiresAt);
    if (!isNaN(son) && son < simdi) return `${turAdi}ın süresi dolmuş`;
  }
  const minB = kurusa(spec.minBasket);
  if (minB != null && baseKurus < minB) {
    return `Minimum sepet ${tlYap(minB)} ${kur} — ara toplam ${tlYap(baseKurus)} ${kur}`;
  }
  return null;
}

/** Kullanıcının kartı banka kampanyasına uyuyor mu? */
function kartEslesir(b, card) {
  if (!card) return false;
  if (b.bank && card.bank !== b.bank) return false;
  if (b.cardProgram && card.program !== b.cardProgram) return false;
  return true;
}

/** Tek indirimi ara toplama uygular; döküme yazar. Yüzde → o anki taban. */
function indirimUygula(d, baseKurus, push, step) {
  let tutar;
  if (d.method === 'percent') {
    tutar = Math.round(baseKurus * Number(d.value) / 100);
    const tavan = kurusa(d.maxDiscount);
    if (tavan != null) tutar = Math.min(tutar, tavan);
  } else {
    tutar = kurusa(d.value) || 0;
  }
  tutar = Math.min(tutar, baseKurus); // ara toplamın altına düşmez
  push(step, d.label || d.id, -tutar, d.source || '');
  return baseKurus - tutar;
}

/** İndirim tutarını breakdown'a yazmadan hesaplar (kombinasyon karşılaştırması için). */
function indirimTutari(d, baseKurus) {
  let tutar;
  if (d.method === 'percent') {
    tutar = Math.round(baseKurus * Number(d.value) / 100);
    const tavan = kurusa(d.maxDiscount);
    if (tavan != null) tutar = Math.min(tutar, tavan);
  } else {
    tutar = kurusa(d.value) || 0;
  }
  return Math.min(tutar, baseKurus);
}

/** Banka kampanyasını genel indirim şekline çevirir. */
function bankaIndirimiYap(b) {
  return { id: b.id, method: b.method || 'fixed', value: b.value, maxDiscount: null, label: b.label || `${b.bank} kartı indirimi` };
}

/**
 * Kupon/banka birleşmezliği: combinableWithCoupons=false olan kampanya kuponlarla
 * birlikte KULLANILAMAZ. Alternatifler hesaplanır ve kullanıcı için en düşük
 * ödemeyi veren yol seçilir; seçim varsayım olarak beyan edilir.
 */
function kombinasyonCoz(coupons, banks, baseKurus, assumptions) {
  const birlesen = banks.filter(b => b.combinableWithCoupons);
  const ayri = banks.filter(b => !b.combinableWithCoupons);

  const uygula = (kuponlar, kampanyalar) => {
    let t = baseKurus;
    for (const c of kuponlar) t -= indirimTutari(c, t);
    for (const b of kampanyalar) t -= indirimTutari(bankaIndirimiYap(b), t);
    return Math.max(t, 0);
  };

  const adaylar = [
    { t: uygula(coupons, birlesen), kuponlar: coupons, bankalar: birlesen, aciklama: 'kupon + banka birlikte' },
  ];
  for (const b of ayri) {
    adaylar.push({ t: uygula([], [b]), kuponlar: [], bankalar: [b], aciklama: `yalnızca ${b.label || b.id} (kuponla birleşmiyor)` });
  }
  adaylar.push({ t: baseKurus, kuponlar: [], bankalar: [], aciklama: 'indirim yok' });

  adaylar.sort((a, b) => a.t - b.t);
  const enIyi = adaylar[0];
  if (enIyi.aciklama !== 'kupon + banka birlikte' && (coupons.length || birlesen.length)) {
    assumptions.push(`Kupon/banka birleşmezliği: en avantajlı yol '${enIyi.aciklama}' olarak seçildi.`);
  }
  return { kullanilanKuponlar: enIyi.kuponlar, kullanilanBankalar: enIyi.bankalar };
}

/**
 * Kargo ücretini çözer.
 * Dönüş: {ucret: kuruş|null, bedava: bool, bilinmiyor: bool}
 *  - bedava: eşik aşıldı (fee bilinse bile 0)
 *  - bilinmiyor: eşik altı VE ücret bilinmiyor (fee null) — toplama eklenmez
 * Not: ürünün kargosu bedavaysa çağıran fee=0 verir (ucret=0 → eklenmez).
 */
function kargoCoz(ship, postDiscountKurus, sellingKurus) {
  const ucret = kurusa(ship.fee);
  const esik = kurusa(ship.freeOver);
  if (esik == null) {
    if (ucret == null) return { ucret: null, bedava: false, bilinmiyor: true };
    return { ucret, bedava: false, bilinmiyor: false };
  }
  const karsilastirma = ship.thresholdBase === 'list_price' ? sellingKurus : postDiscountKurus;
  // freeOverExclusive: "N TL ÜZERİ ücretsiz" beyanı — tam eşik tutarı ücretsiz DEĞİL.
  // (2026-10-26 robocombo: "2000₺ üzeri ücretsiz kargo, 2000 TL ve altı 150 TL")
  // Varsayılan davranış "N TL ve üzeri" olduğu için eşik dahildir (>=).
  const esikAsildi = ship.freeOverExclusive === true
    ? (karsilastirma != null && karsilastirma > esik)
    : (karsilastirma != null && karsilastirma >= esik);
  if (esikAsildi) return { ucret: 0, bedava: true, bilinmiyor: false };
  if (ucret == null) return { ucret: null, bedava: false, bilinmiyor: true };
  return { ucret, bedava: false, bilinmiyor: false };
}

/** Yüzdeyi bilimsel gösterimsiz biçimlendirir (ör. 20 -> "20", 12.5 -> "12,5"). */
function formatYuzde(v) {
  return String(Number(v.toFixed(4))).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Kullanıcı mesajı (bot e-postaları ve ilerideki sohbet çıktıları için)
// ---------------------------------------------------------------------------

/** Sonucu doğal dilde (Türkçe) özetler. */
export function kullaniciMesaji(sonuc, tlFormatla) {
  const tl = tlFormatla || ((v) => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL'));
  const kur = sonuc.currency;
  const parcalar = [`Bu ürünün etiket fiyatı ${tl(sonuc.listPrice)} ${kur}.`];
  const indirimler = sonuc.breakdown.filter(b => b.amount < 0);
  const ekler = sonuc.breakdown.filter(b => b.amount > 0 && !['list_price', 'selling_price', 'tax'].includes(b.step));
  if (indirimler.length) {
    parcalar.push(indirimler.map(b => `${b.label} (−${tl(Math.abs(b.amount))})`).join(' + ') + ' uygulandı.');
  }
  if (ekler.length) {
    parcalar.push(ekler.map(b => `${b.label} (+${tl(b.amount)})`).join(' + ') + ' eklendi.');
  }
  parcalar.push(`💳 **Net etkin fiyat (şimdi ödeyeceğin): ${tl(sonuc.payableNow)}.**`);
  if (sonuc.cashbackValue > 0) {
    parcalar.push(`🪙 Ayrıca ${tl(sonuc.cashbackValue)} değerinde puan/cashback kazanacaksın — uzun vadeli etkin maliyet ${tl(sonuc.effectiveCost)}.`);
  }
  for (const s of sonuc.skipped) parcalar.push(`ℹ️ ${s.label}: ${s.reason}`);
  return parcalar.join(' ');
}
