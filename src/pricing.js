/**
 * Gerçek ödenecek fiyatın hesaplanması — Net Etkin Fiyat Motoru entegrasyonu.
 *
 * Bu modül, YZ sınıflandırmasından gelen kampanya listesini Net Etkin Fiyat
 * Motoru'nun (src/netFiyat.js — Python referansı: net-fiyat-motoru/) girdi
 * modeline çevirir, motoru çalıştırır ve sonucu uygulamanın beklediği şekle
 * map'ler. Ayrıca motordan gelen yeni alanları (adım adım hesap dökümü,
 * cashback, etkin maliyet, varsayımlar) iletmeye devam eder.
 *
 * Kurallar (kullanıcı isteği):
 *  - Etiket fiyatı değil, gerçekte ödenecek tutar gösterilir.
 *  - Herkesin alabileceği (koşulsuz) ve satış fiyatına henüz yansıtılmamış
 *    indirimler düşülür (motor: sepet indirimi adımı).
 *  - Koşullu kampanyalar (uygulama, üyelik, kart, sepet tutarı) fiyata dahil
 *    edilmez, ayrı gösterilir. Karta özel kampanyalar motora banka kampanyası
 *    olarak verilir; kullanıcı kart bağlamı olmadığından motor bunları uygulanamaz
 *    işaretler ve bunlar koşullu listede gösterilmeye devam eder.
 *  - KUPON kodu gerektiren kampanyalar da ana fiyata dahil edilmez; ancak her
 *    kupon için motor bir kez daha çalıştırılır ve en avantajlısı "kuponla şu
 *    fiyata düşer" (result.kupon) olarak ayrı gösterilir — kartta ve alarm
 *    e-postasında kullanılır. Minimum sepet eşiği motor tarafından denetlenir.
 *  - Taksit indirimi sayılmaz (yalnızca vade farkı maliyet olarak modellenir).
 *  - Kargo ücreti ayrı gösterilir; ürüne gerçekten uygulanıyorsa toplama eklenir.
 */
import { formatTL, parseNum } from './util.js';
import { netFiyatHesapla } from './netFiyat.js';

/** Metinden kupon kodu çıkarır ("KUPON: YAZ20", "TEKNO50 kuponu" gibi); yoksa null.
 *  Kod adayı en az bir rakam içermeli ( sözcük yanlışlığına düşmemek için). */
function kuponKoduCikar(metin, aiKodu) {
  if (aiKodu && /^[A-Za-z0-9]{3,15}$/.test(String(aiKodu))) return String(aiKodu).toUpperCase();
  const t = String(metin || '');
  // 1) Açık biçimler: "KUPON: X20", "kupon kodu: ABC123", "kodu - N11YAZ"
  let m = t.match(/(?:kupon(?:\s+kodu)?|kodu)\s*[:\-]\s*["'«]?([A-Za-z0-9]{3,15})["'»]?/i);
  if (m) return m[1].toUpperCase();
  // 2) Kod önce gelir: "TEKNO50 kuponu", "X20 kuponu ile" — rakam içermeyen sözcükler elenir
  m = t.match(/([A-Za-z0-9]{3,15})\s+(?:kupon(?:u)?(?:\s+kodu)?|kodu)\b/i);
  if (m && /\d/.test(m[1])) return m[1].toUpperCase();
  return null;
}

/** Metinden minimum sepet tutarı çıkarır ("500 TL üzeri", "üzeri 1.500 TL"); yoksa null. */
function minSepetCikar(metin) {
  const t = String(metin || '');
  let m = t.match(/([\d.,]+)\s*(?:TL|tl)\s*(?:ve\s*)?(?:üzeri|üstü)/);
  if (!m) m = t.match(/(?:üzeri|üstü)\s*([\d.,]+)\s*(?:TL|tl)/);
  return m ? parseNum(m[1]) : null;
}

/** Kupon eşiği varsa kısa Türkçe açıklama üretir. */
function minSepetAciklamasi(minBasket) {
  if (minBasket == null) return null;
  return formatTL(minBasket) + ' ve üzeri sepetlerde geçerli';
}

/**
 * @param {object} product {listPrice, sellingPrice, shipping:{fee,freeOver,applies,note}, ...}
 * @param {Array} classified YZ sınıflandırması sonucu kampanya listesi
 */
export function computePricing(product, classified) {
  const etiket = Number(product.listPrice ?? product.sellingPrice) || null;
  const taban = Number(product.sellingPrice ?? product.listPrice) || null;

  const dahilEdilen = [];
  const kosullu = [];
  const taksit = [];
  const bilgi = [];
  const cartDiscounts = [];
  const bankCampaigns = [];
  const kuponlar = [];
  const onizlemeKampanyalari = [];
  const bankliOgeler = new Map(); // motor id -> orijinal sınıflandırma öğesi

  // 1) YZ sınıflandırmasını motor girdisine çevir
  for (const k of classified || []) {
    const item = {
      metin: k.metin,
      kosul: k.kosul || null,
      kosul_aciklamasi: k.kosul_aciklamasi || null,
      indirim: k.indirim || null,
      not: k.not || null,
    };
    if (k.tur === 'taksit') { taksit.push(item); continue; }
    if (k.tur === 'bilgi') { bilgi.push(item); continue; }
    if (k.tur === 'kosullu') {
      // Kupon kodu gerektiren kampanyalar: indirimi hesaplanabiliyorsa kupon
      // fiyatı ayrıca hesaplanır (ana fiyata DAHİL EDİLMEZ, kartta ayrı gösterilir);
      // hesaplanamıyorsa normal koşullu listesinde kalır.
      if (k.kosul === 'kupon' && k.indirim?.deger && taban) {
        const kp = {
          id: 'kupon-' + kuponlar.length,
          code: kuponKoduCikar(k.metin, k.kodu),
          method: k.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
          value: Number(k.indirim.deger),
          minBasket: minSepetCikar(k.kosul_aciklamasi || '' ) ?? minSepetCikar(k.metin),
          label: k.metin,
        };
        // Tutarlı kuponun kendisi üründen pahalı olamaz; yüzde zaten tabanla sınırlı.
        if (kp.method !== 'fixed' || kp.value < taban) {
          kuponlar.push(kp);
          continue; // koşullu listesine eklenmez (kupon satırında gösterilir)
        }
      }
      // Karta özel kampanyalar motora banka kampanyası olarak verilir; kart
      // bağlamı olmadığından uygulanamazlar ve koşullu listede gösterilirler.
      if (k.kosul === 'karti' && k.indirim && k.indirim.deger) {
        const id = 'banka-' + bankCampaigns.length;
        bankCampaigns.push({
          id,
          bank: '', cardProgram: '',
          method: k.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
          value: Number(k.indirim.deger),
          label: k.metin,
          combinableWithCoupons: false,
        });
        bankliOgeler.set(id, item);
      } else {
        kosullu.push(item);
      }
      continue;
    }
    // tur === 'herkes'
    if (k.fiyata_dahil) {
      item.not = item.not || 'Satış fiyatına zaten dahil';
      dahilEdilen.push(item);
    } else {
      // Henüz yansıtılmamış, herkesin alabileceği indirim -> motora sepet indirimi
      let hesaplanabilir = false;
      if (k.indirim?.deger) {
        if (k.indirim.tip === 'yuzde' && taban) hesaplanabilir = true;
        else if (k.indirim.tip === 'tutar' && Number(k.indirim.deger) < taban) hesaplanabilir = true;
      }
      if (hesaplanabilir) {
        cartDiscounts.push({
          id: 'sepet-' + cartDiscounts.length,
          method: k.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
          value: Number(k.indirim.deger),
          label: k.metin,
          source: item.not || '',
        });
      } else {
        item.not = item.not || 'İndirim tutarı hesaplanamadı; fiyata eklenmedi';
        bilgi.push(item);
      }
    }
  }

  // 1b) Site geneli kampanyalar (kupon toplayıcıdan: src/kuponlar.js)
  //     - Koşulsuz site kampanyası → sepet indirimi olarak uygulanır
  //     - Kupon kodu olan → "kuponla X TL" önizlemesine girer
  //     - Üyelik/uygulama/kart/kategori → koşullu listesinde gösterilir (uygulanmaz)
  for (const sk of product.siteKampanyalari || []) {
    if (!sk.indirim?.deger) continue;
    const etiket = 'Site kampanyası: ' + sk.metin;
    if (sk.kodu) {
      const kp = {
        id: 'sitekupon-' + kuponlar.length,
        code: sk.kodu,
        method: sk.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
        value: Number(sk.indirim.deger),
        minBasket: sk.minSepet ?? null,
        label: etiket + (sk.kosulMetni ? ' (' + sk.kosulMetni + ')' : ''),
        kosulMetni: sk.kosulMetni || null,
        siteKampanyasi: true,
      };
      if (kp.method !== 'fixed' || kp.value < (taban || Infinity)) {
        kuponlar.push(kp);
        continue;
      }
    } else if (sk.uygulanabilir) {
      // Aynı indirim ürün sayfasında zaten varsa iki kez düşmeyi engelle
      const ayniVar = cartDiscounts.some(c =>
        c.method === (sk.indirim.tip === 'yuzde' ? 'percent' : 'fixed') && Number(c.value) === Number(sk.indirim.deger));
      if (!ayniVar) {
        cartDiscounts.push({
          id: 'site-' + cartDiscounts.length,
          method: sk.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
          value: Number(sk.indirim.deger),
          minBasket: sk.minSepet ?? null,
          label: etiket,
          source: sk.kosulMetni || '',
        });
        continue;
      }
    }
    // Uygulanamayan site kampanyası → koşullu listede dürüstçe göster
    kosullu.push({
      metin: sk.metin,
      kosul: sk.kapsam === 'kart' ? 'karti' : (sk.kapsam === 'uyelik' ? 'uyelik' : (sk.kapsam === 'uygulama' ? 'uygulama' : 'diger')),
      kosul_aciklamasi: sk.kosulMetni || 'Site geneli kampanya',
      indirim: sk.indirim,
      not: 'Site kampanyası sayfasından alındı',
    });
    if (sk.onizleme) onizlemeKampanyalari.push(sk);
  }

  // 2) Kargo bilgisi (kargoCikar/adaptör çıktısı) motor modeline.
  //    Ürünün kargosu bedavaysa fee=0 verilir (motor 0'ı eklemez); ücret
  //    bilinmiyorsa null verilir (motor "bilinmiyor" işaretler, toplama eklemez).
  const ship = product.shipping || {};
  const nef = netFiyatHesapla({
    currency: 'TRY',
    listPrice: etiket,
    sellingPrice: taban,
    priceIncludesTax: true,
    cartDiscounts,
    bankCampaigns,
    shipping: {
      fee: ship.applies === false ? 0 : (ship.fee != null ? ship.fee : null),
      freeOver: ship.freeOver != null ? ship.freeOver : null,
      freeOverExclusive: ship.freeOverExclusive === true,
      thresholdBase: 'after_discounts',
      note: ship.note || '',
    },
  });

  // 3) Motorun uygulanamadığı kart kampanyalarını koşullu listeye geri koy
  for (const s of nef.skipped) {
    const orig = bankliOgeler.get(s.id);
    if (orig && !kosullu.includes(orig)) kosullu.push(orig);
  }

  const toplam = nef.payableNow;
  const ekIndirim = nef.appliedDiscountTotal || 0;

  // 3b) KUPONLU FİYAT: kuponlar ana fiyata dahil edilmez; her kupon için motor
  // bir kez daha (kupon dahil) çalıştırılır ve en düşük tutarı veren kupon
  // "kuponla şu fiyata düşer" olarak ayrıca raporlanır. Minimum sepet eşiği
  // altında kalan ya da süresi dolmuş kuponlar motor tarafından elenir; hiçbiri
  // fiyatı düşürmüyorsa kupon alanı null kalır (sahte indirim yok).
  let kuponSonuc = null;
  if (kuponlar.length && toplam != null) {
    const motorGirdisi = {
      currency: 'TRY',
      listPrice: etiket,
      sellingPrice: taban,
      priceIncludesTax: true,
      cartDiscounts,
      bankCampaigns,
      shipping: {
        fee: ship.applies === false ? 0 : (ship.fee != null ? ship.fee : null),
        freeOver: ship.freeOver != null ? ship.freeOver : null,
        freeOverExclusive: ship.freeOverExclusive === true,
        thresholdBase: 'after_discounts',
        note: ship.note || '',
      },
    };
    let enIyi = null;
    for (const kp of kuponlar) {
      const nef2 = netFiyatHesapla({ ...motorGirdisi, coupons: [kp] });
      if (nef2.payableNow == null) continue;
      if (!enIyi || nef2.payableNow < enIyi.nef.payableNow) enIyi = { kupon: kp, nef: nef2 };
    }
    if (enIyi && enIyi.nef.payableNow < toplam - 0.005) {
      kuponSonuc = {
        kodu: enIyi.kupon.code || null,
        metin: enIyi.kupon.label,
        kosul: minSepetAciklamasi(enIyi.kupon.minBasket) || enIyi.kupon.kosulMetni || null,
        siteKampanyasi: !!enIyi.kupon.siteKampanyasi,
        fiyat: enIyi.nef.payableNow,                       // kuponla ödenecek tutar
        indirimTutari: toplam - enIyi.nef.payableNow,      // kupondan kazanılan
        dokuem: enIyi.nef.breakdown,
      };
    }
    // En iyi kupon dışında kalan, hesaplanabilir kuponlar koşullu listede görünsün.
    if (kuponlar.length > 1 && enIyi) {
      for (const kp of kuponlar) {
        if (kp === enIyi.kupon) continue;
        kosullu.push({ metin: kp.label, kosul: 'kupon', kosul_aciklamasi: 'Diğer kupon (en avantajlısı ayrıca gösterilir)', indirim: null, not: null });
      }
    }
  }

  // 3c) KAMPANYA ÖNİZLEMESİ: kategori/genel kapsamlı, koşulu belirsiz kampanyalar
  //     "kampanyayla ~X TL" olarak gösterilir. Ana toplama ve "en ucuz" sıralamasına
  //     GİRMEZ (ürünün o kategoriye girdiği doğrulanamaz) — yalnız bilgi amaçlıdır.
  let kampanyaOnizleme = null;
  if (onizlemeKampanyalari.length && toplam != null) {
    const motorGirdisi = {
      currency: 'TRY',
      listPrice: etiket,
      sellingPrice: taban,
      priceIncludesTax: true,
      cartDiscounts,
      bankCampaigns,
      shipping: {
        fee: ship.applies === false ? 0 : (ship.fee != null ? ship.fee : null),
        freeOver: ship.freeOver != null ? ship.freeOver : null,
        freeOverExclusive: ship.freeOverExclusive === true,
        thresholdBase: 'after_discounts',
        note: ship.note || '',
      },
    };
    let enIyi = null;
    for (const k of onizlemeKampanyalari) {
      const ind = {
        id: 'onizleme',
        method: k.indirim.tip === 'yuzde' ? 'percent' : 'fixed',
        value: Number(k.indirim.deger),
        minBasket: k.minSepet ?? null,
        label: k.metin,
      };
      const nef3 = netFiyatHesapla({ ...motorGirdisi, cartDiscounts: [...cartDiscounts, ind] });
      if (nef3.payableNow == null) continue;
      if (!enIyi || nef3.payableNow < enIyi.nef.payableNow) enIyi = { kampanya: k, nef: nef3 };
    }
    if (enIyi && enIyi.nef.payableNow < toplam - 0.005) {
      kampanyaOnizleme = {
        metin: enIyi.kampanya.metin,
        kosul: enIyi.kampanya.kosulMetni || (enIyi.kampanya.kapsam === 'kategori' ? 'kategori kampanyası' : null),
        fiyat: enIyi.nef.payableNow,
        indirimTutari: toplam - enIyi.nef.payableNow,
      };
    }
  }

  // 4) Kargo görünümü (mevcut sözleşme: uygulanir true/false/null)
  let kargoUygulanir = null;
  let kargoUcret = 0;
  let kargoAciklama = ship.note || 'Kargo bilgisi alınamadı';
  const kargoAdim = nef.breakdown.find(b => b.step === 'shipping');
  if (nef.shippingInfo.free) {
    kargoUygulanir = false;
    kargoAciklama = kargoAdim?.note || 'Ücretsiz kargo (eşik aşıldı)';
  } else if (nef.shippingInfo.unknown) {
    kargoUygulanir = null;
    kargoAciklama = kargoAdim?.note || ship.note || 'Kargo ücreti sepette netleşir';
  } else if (nef.shippingInfo.fee != null && nef.shippingInfo.fee > 0) {
    kargoUygulanir = true;
    kargoUcret = nef.shippingInfo.fee;
    kargoAciklama = ship.note || kargoAdim?.note || 'Ücrete tabi';
  } else if (ship.applies === false) {
    kargoUygulanir = false;
    kargoAciklama = ship.note || 'Ücretsiz kargo';
  } else if (ship.freeOver != null && kargoUygulanir !== true) {
    kargoAciklama = formatTL(ship.freeOver) + ' üzeri ücretsiz kargo (ürün eşiğin altında; kargo ücreti sepette netleşir)';
  }

  return {
    etiket,
    taban,
    ekIndirim: ekIndirim > 0 ? ekIndirim : 0,
    araToplam: nef.subtotalBeforeShipping,
    kargo: {
      ucret: kargoUcret,
      uygulanir: kargoUygulanir,
      aciklama: kargoAciklama,
      freeOver: ship.freeOver ?? null,
    },
    toplam,
    kupon: kuponSonuc,             // kuponla ulaşılan fiyat (ana fiyata dahil DEĞİL)
    kampanyaOnizleme,              // kategori kampanyasıyla ulaşılabilecek fiyat (bilgi amaçlı)
    kampanyaDahil: dahilEdilen,
    kampanyaKosullu: kosullu,
    kampanyaTaksit: taksit,
    kampanyaBilgi: bilgi,
    // --- Net Etkin Fiyat Motoru'ndan yeni alanlar ---
    dokuem: nef.breakdown,          // adım adım hesap dökümü
    cashback: nef.cashbackValue,    // puan/cashback değeri (ödeme anında düşmez)
    etkinMaliyet: nef.effectiveCost,// toplam − cashback (uzun vadeli)
    varsayimlar: nef.assumptions,   // motorun beyan ettiği varsayımlar
    toplamMetin: toplam != null ? formatTL(toplam) : '—',
  };
}

/**
 * FİYAT DEĞERLENDİRME RAPORU — Sahte İndirim & Dip Fiyat Radarı (2026-10-30)
 *
 * Girdi olarak "şu anki en ucuz fiyat" + `getFiyatAnalizi()` çıktısını alır.
 * Uydurma yok: yeterli geçmiş (en az 3 gün) yoksa tavsiye üretilmez, `veri_yok`
 * döner ve arayüz "yorum için yeterli veri yok" der.
 *
 * Kurallar (kullanıcı isteği):
 *  1) 🌟 dip_fiyat        → güncel fiyat son 90 günün en düşüğünde veya altında
 *  2) ⚠️ sahte_indirim    → gösterilen üstü çizili etiket, 30 gün ortalamasının
 *                           %20'den fazla üzerinde VEYA "indirim" denen fiyat
 *                           ortalamanın üzerinde
 *  3) 🎯 tavsiye          → ortalamadan ≥%10 ucuz: simdi_al · ±%5: piyasa ·
 *                           ≥%10 pahalı: bekle
 *
 * @param {{
 *   guncelFiyat?:number|null,
 *   gosterilenEtiket?:number|null,
 *   analiz?:object|null,
 *   toleransYuzde?:number
 * }} girdi
 */
export function fiyatDegerlendir({ guncelFiyat, gosterilenEtiket, analiz } = {}) {
  const fiyat = Number(guncelFiyat);
  const gecerliFiyat = Number.isFinite(fiyat) && fiyat > 0;

  const temel = {
    durum: null,                 // 'dip_fiyat' | 'sahte_indirim' | null
    tavsiye: 'veri_yok',         // 'simdi_al' | 'piyasa' | 'bekle' | 'veri_yok'
    etiket: '—',
    mesaj: null,
    guncelFiyat: gecerliFiyat ? fiyat : null,
    minFiyat: null,
    ortFiyat: null,
    maxFiyat: null,
    ortalamaFarkYuzde: null,     // + ise ortalamadan ucuz
    etiketSisirilmis: false,
    etiketOrani: null,           // gösterilen etiket / ortalama
    veriNoktasi: 0,
    gunSayisi: 0,
    yeterliVeri: false,
    neden: null,
  };

  if (!gecerliFiyat) {
    return { ...temel, neden: 'Karşılaştırmada geçerli bir fiyat bulunamadı.' };
  }
  if (!analiz?.bulundu) {
    return {
      ...temel,
      neden: analiz?.neden || 'Bu ürün için fiyat geçmişi yok; ilk tarama olabilir.',
    };
  }

  const min = Number.isFinite(analiz.minFiyat) ? analiz.minFiyat : null;
  const max = Number.isFinite(analiz.maxFiyat) ? analiz.maxFiyat : null;
  const ort = Number.isFinite(analiz.ortFiyat) ? analiz.ortFiyat : null;

  // Ortalama farkı: +14 → ortalamadan %14 daha ucuz
  const farkYuzde = ort && ort > 0
    ? Math.round(((ort - fiyat) / ort) * 1000) / 10
    : null;

  // Etiket şişirme: gösterilen liste fiyatı piyasa ortalamasının %20 üzerinde mi?
  const etiket = Number(gosterilenEtiket);
  const etiketGecerli = Number.isFinite(etiket) && etiket > 0;
  const etiketOrani = etiketGecerli && ort > 0 ? Math.round((etiket / ort) * 1000) / 1000 : null;
  const etiketSisirilmis = etiketGecerli && ort > 0 && etiket > ort * 1.2;

  // "İndirim" iddiası var mı? (etiket, satış fiyatının üzerindeyse indirim gösteriliyor)
  const indirimIddiasi = etiketGecerli && etiket > fiyat + 0.01;

  const sonuc = {
    ...temel,
    minFiyat: min,
    maxFiyat: max,
    ortFiyat: ort,
    ortalamaFarkYuzde: farkYuzde,
    etiketSisirilmis,
    etiketOrani,
    etiketteGosterilen: etiketGecerli ? etiket : null,
    veriNoktasi: analiz.veriNoktasi || 0,
    gunSayisi: analiz.gunSayisi || 0,
    yeterliVeri: !!analiz.yeterliVeri,
    ortPencereGun: analiz.ortPencereGun || 30,
  };

  // Yeterli geçmiş yoksa: dip iddiası kurulabilir (tek bir gerçek gözlem bile
  // "bu kayıtlardaki en düşük" olabilir) ama ortalama yorumu YAPILMAZ.
  if (!analiz.yeterliVeri) {
    const dipKucukVeri = min != null && fiyat <= min * 1.001;
    return {
      ...sonuc,
      // DÜRÜSTLÜK: yeterli geçmiş yokken ortalama temelli iddia ÜRETİLMEZ.
      // (1 günlük "ortalama" ile "%14 daha ucuz" demek yanıltıcı olur.)
      ortFiyat: null,
      ortalamaFarkYuzde: null,
      etiketSisirilmis: false,
      etiketOrani: null,
      durum: dipKucukVeri ? 'dip_fiyat' : null,
      tavsiye: 'veri_yok',
      etiket: dipKucukVeri ? '🌟 Dip fiyat' : 'Veri az',
      mesaj: dipKucukVeri
        ? `🔥 Kayıtlı fiyat geçmişinin en düşüğünde (${analiz.gunSayisi} gün, ${analiz.veriNoktasi} gözlem).`
        : (analiz.neden || 'Yorum için yeterli fiyat geçmişi yok.'),
      neden: analiz.neden || 'Yorum için yeterli fiyat geçmişi yok.',
    };
  }

  // ---- 1) Dip fiyat ----
  const dip = min != null && fiyat <= min * 1.001;

  // ---- 2) Sahte indirim ----
  // (a) etiket ortalamanın %20 üzerinde, veya
  // (b) indirim iddiası var ama satış fiyatı ortalamanın üzerinde
  const sahte = etiketSisirilmis || (indirimIddiasi && ort != null && fiyat > ort);

  // ---- 3) Tavsiye ----
  let tavsiye = 'piyasa';
  let tavsiyeEtiketi = '🟡 Piyasa Fiyatında';
  if (farkYuzde != null && farkYuzde >= 10) { tavsiye = 'simdi_al'; tavsiyeEtiketi = '🟢 Şimdi Al'; }
  else if (farkYuzde != null && farkYuzde <= -10) { tavsiye = 'bekle'; tavsiyeEtiketi = '🔴 Bekle / Pahalı'; }

  // Mesaj önceliği: dip fiyat > sahte indirim > tavsiye
  let mesaj;
  if (dip) {
    mesaj = '🔥 Son 90 günün en dip fiyatında! Kaçırılmayacak fırsat.';
  } else if (sahte) {
    mesaj = `⚠️ Şişirilmiş İndirim: Bu ürün son 30 günde ortalama ${formatTL(ort)}'ye satılıyordu. İndirim oranı yanıltıcı.`;
  } else if (tavsiye === 'simdi_al') {
    mesaj = `🟢 Ortalamadan %${Math.abs(farkYuzde)} daha ucuz — almak için iyi zaman.`;
  } else if (tavsiye === 'bekle') {
    mesaj = `🔴 Ortalamanın %${Math.abs(farkYuzde)} üzerinde — biraz beklemek mantıklı.`;
  } else {
    mesaj = `🟡 Piyasa ortalamasında (±%5) — acil değil, fiyat normal seviyede.`;
  }

  return {
    ...sonuc,
    durum: dip ? 'dip_fiyat' : (sahte ? 'sahte_indirim' : null),
    tavsiye,
    etiket: dip ? '🌟 Dip Fiyat' : (sahte ? '⚠️ Şişirilmiş Etiket' : tavsiyeEtiketi),
    tavsiyeEtiketi,
    mesaj,
    indirimIddiasi,
    neden: null,
  };
}

/**
 * Karşılaştırma sonucundaki en ucuz fiyatı geçmişle kıyaslar (pipeline yardımcısı).
 * `analiz` verilmezse ürün kimliğinden üretilmesi çağıranın sorumluluğundadır.
 */
export function enUcuzFiyatDegerlendir(sonuclar, analiz) {
  const bulunan = (Array.isArray(sonuclar) ? sonuclar : [])
    .filter(s => s?.status === 'found' && s.product && s.product.inStock !== false && s.renkAyni !== false)
    .map(s => ({
      fiyat: Number(s.product.pricing?.toplam ?? s.product.sellingPrice),
      etiket: Number(s.product.listPrice ?? s.product.pricing?.etiket),
    }))
    .filter(x => Number.isFinite(x.fiyat) && x.fiyat > 0);

  if (!bulunan.length) return fiyatDegerlendir({ guncelFiyat: null, analiz });
  const enUcuz = bulunan.reduce((a, b) => (b.fiyat < a.fiyat ? b : a));
  return fiyatDegerlendir({
    guncelFiyat: enUcuz.fiyat,
    gosterilenEtiket: Number.isFinite(enUcuz.etiket) && enUcuz.etiket > 0 ? enUcuz.etiket : null,
    analiz,
  });
}
