/**
 * ⏱️ "Şimdi mi Almalısın, Beklemeli misin?" (AI Fiyat Zamanlama Tahmincisi) — 2026-11-05
 *
 * Hedef: Kullanıcının aceleyle pahalıya almasını önlemek veya tarihi dipteyken
 * fırsatı kaçırmamasını sağlamak.
 *
 * Girdiler:
 *  - guncelFiyat : Stokta olan en ucuz mağazanın güncel satış fiyatı
 *  - analiz      : SQLite price_history tablosundan gelen pencereli metrikler
 *                  (minFiyat90, maxFiyat60, ortFiyat30, ortFiyat90, veriNoktasi, gunSayisi)
 *  - magazaId    : En ucuz teklifi veren mağaza kodu (trendyol, hepsiburada, incehesap...)
 *  - tarih       : Değerlendirmenin yapıldığı an (varsayılan: new Date())
 *
 * Çıktı Kararları:
 *  🟢 SIMDI_AL : Fiyat dip seviyede veya ortalamanın belirgin altında.
 *  🟡 BEKLE    : Fiyat ortalamanın üzerinde veya mağazanın yakın (1-5 gün) kampanya döngüsü var.
 *  ⚪ NOTR     : Yetersiz veri (cold-start) veya fiyat piyasa normali bandında.
 */
import { config } from './config.js';

export const MAGAZA_DONGULERI = {
  incehesap: {
    ad: 'İncehesap',
    tip: 'haftalik',
    gun: 5, // Cuma
    etkinlik: 'Gaming Gecesi',
    tipikIndirimOrani: 0.12,
    aciklama: 'İncehesap her Cuma akşamı Gaming Gecesi indirimleri ve sepet kuponları tanımlar.',
  },
  trendyol: {
    ad: 'Trendyol',
    tip: 'aylik_ve_donemsel',
    gunAraligi: [1, 5],
    etkinlik: 'Süper İndirim Günleri & Sepet Kuponları',
    tipikIndirimOrani: 0.10,
    aciklama: 'Trendyol genellikle her ayın ilk haftasında genel sepet kuponları yayınlar.',
  },
  hepsiburada: {
    ad: 'Hepsiburada',
    tip: 'aylik_ve_donemsel',
    gunAraligi: [1, 5],
    etkinlik: 'Efsane Fırsatlar & Kuponlar',
    tipikIndirimOrani: 0.10,
    aciklama: 'Hepsiburada ayın ilk günlerinde ve Cuma günleri genel kategori kuponları sunar.',
  },
  n11: {
    ad: 'n11',
    tip: 'aylik_gun',
    belirliGun: 11,
    etkinlik: 'Uğurlu 11 Kupon Günleri',
    tipikIndirimOrani: 0.11,
    aciklama: "n11 her ayın 11'inde özel sepet kuponları dağıtır.",
  },
  amazon: {
    ad: 'Amazon.tr',
    tip: 'haftalik',
    gun: 1, // Pazartesi
    etkinlik: 'Haftanın Fırsatları',
    tipikIndirimOrani: 0.08,
    aciklama: 'Amazon.tr Pazartesi günleri yeni haftalık fırsatlar başlatır.',
  },
  robotistan: {
    ad: 'Robotistan',
    tip: 'hafta_sonu',
    gunAraligiHafta: [6, 0], // Cumartesi - Pazar
    etkinlik: 'Hafta Sonu Maker Fırsatları',
    tipikIndirimOrani: 0.08,
    aciklama: 'Robotistan hafta sonları seçili 3D baskı ve komponentlerde sepet indirimi uygular.',
  },
  '3dcim': {
    ad: '3Dcim',
    tip: 'hafta_basi',
    gun: 1, // Pazartesi
    etkinlik: 'Haftalık Filament Fırsatları',
    tipikIndirimOrani: 0.08,
    aciklama: '3Dcim hafta başında filament ve yedek parça kampanyaları düzenler.',
  },
  '3dteknomarket': {
    ad: '3D Tekno Market',
    tip: 'aylik_ve_donemsel',
    gunAraligi: [1, 5],
    etkinlik: 'Ay Başı 3D Fırsatları',
    tipikIndirimOrani: 0.09,
    aciklama: '3D Tekno Market her ayın ilk günlerinde indirimli filament paketleri sunar.',
  },
};

const formatTL = (n) => Number(n || 0).toLocaleString('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function magazaKampanyaKontrol(magazaId, tarih = new Date()) {
  const bos = { yakindaMi: false, kalanGun: null, aciklama: null, etkinlik: null, tipikOran: 0.08 };
  if (!magazaId) return bos;

  const key = String(magazaId).toLowerCase().replace(/[^a-z0-9]/g, '');
  const m = MAGAZA_DONGULERI[key] || MAGAZA_DONGULERI[magazaId];
  if (!m) return bos;

  const d = new Date(tarih);
  const gunOfWeek = d.getDay();
  const gunOfMonth = d.getDate();
  const ayinSonGunu = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  if (m.tip === 'haftalik' && typeof m.gun === 'number') {
    let fark = m.gun - gunOfWeek;
    if (fark < 0) fark += 7;
    if (fark >= 0 && fark <= 4) {
      return {
        yakindaMi: true,
        kalanGun: fark === 0 ? 0 : fark,
        etkinlik: m.etkinlik,
        aciklama: fark === 0
          ? `${m.ad} bugün ${m.etkinlik} düzenliyor.`
          : `${m.ad} ${fark} gün sonra (${m.etkinlik}) indirimi yapacak.`,
        tipikOran: m.tipikIndirimOrani,
      };
    }
  }

  if (m.tip === 'aylik_gun' && typeof m.belirliGun === 'number') {
    const fark = m.belirliGun - gunOfMonth;
    if (fark >= 0 && fark <= 5) {
      return {
        yakindaMi: true,
        kalanGun: fark === 0 ? 0 : fark,
        etkinlik: m.etkinlik,
        aciklama: fark === 0
          ? `${m.ad} bugün ${m.etkinlik} kuponları dağıtıyor.`
          : `${m.ad} ${fark} gün sonra (${m.belirliGun}. gün) ${m.etkinlik} kuponları dağıtacak.`,
        tipikOran: m.tipikIndirimOrani,
      };
    }
  }

  if (m.tip === 'aylik_ve_donemsel' && Array.isArray(m.gunAraligi)) {
    if (gunOfMonth >= ayinSonGunu - 4) {
      const kalan = ayinSonGunu - gunOfMonth + 1;
      return {
        yakindaMi: true,
        kalanGun: kalan,
        etkinlik: m.etkinlik,
        aciklama: `${m.ad} ${kalan} gün sonra (ayın ilk haftası) genel sepet kuponu verecek.`,
        tipikOran: m.tipikIndirimOrani,
      };
    }
    if (gunOfMonth >= m.gunAraligi[0] && gunOfMonth <= m.gunAraligi[1]) {
      return {
        yakindaMi: true,
        kalanGun: 0,
        etkinlik: m.etkinlik,
        aciklama: `${m.ad} şu anda ay başı kampanya döneminde.`,
        tipikOran: m.tipikIndirimOrani,
      };
    }
  }

  return bos;
}

export function zamanlamaTahminiYap({ guncelFiyat, analiz, magazaId = null, tarih = new Date() }) {
  const fiyat = Number(guncelFiyat);
  const gecerliFiyat = Number.isFinite(fiyat) && fiyat > 0;
  const d = tarih ? new Date(tarih) : new Date();

  const temel = {
    karar: 'NOTR',
    rozet: '⚪ DENGELİ FİYAT',
    guven: 50,
    baslik: 'Yetersiz Fiyat Geçmişi',
    aciklama: 'Bu ürün için henüz yeterli fiyat geçmişi yok (en az 3 gün gerekli). Yapay zeka yanıltıcı tahmin üretmemek için tarafsız kalmaktadır.',
    tavsiyeKodu: 'veri_yok',
    beklenenTasarrufTL: null,
    beklemeGun: null,
    metrikler: {
      guncelFiyat: gecerliFiyat ? fiyat : null,
      minFiyat90: null,
      ortFiyat30: null,
      maxFiyat60: null,
      farkOrtalamaYuzde: null,
      farkDipYuzde: null,
      gunSayisi: 0,
      veriNoktasi: 0,
    },
    kampanya: null,
  };

  if (!gecerliFiyat) {
    return { ...temel, aciklama: 'Karşılaştırmada geçerli bir satış fiyatı bulunamadı.' };
  }

  if (!analiz || !analiz.bulundu || analiz.gunSayisi < 3 || !analiz.yeterliVeri) {
    return {
      ...temel,
      metrikler: {
        ...temel.metrikler,
        gunSayisi: analiz?.gunSayisi || 0,
        veriNoktasi: analiz?.veriNoktasi || 0,
      },
    };
  }

  const min90 = Number(analiz.minFiyat90 ?? analiz.minFiyat);
  const max60 = Number(analiz.maxFiyat60 ?? analiz.maxFiyat);
  const ort30 = Number(analiz.ortFiyat30 ?? analiz.ortFiyat);

  if (!Number.isFinite(min90) || !Number.isFinite(ort30) || ort30 <= 0) {
    return { ...temel, aciklama: 'Fiyat geçmişi istatistikleri hesaplanamadı.' };
  }

  const farkOrtalama = (fiyat - ort30) / ort30;
  const farkOrtalamaYuzde = Math.round(farkOrtalama * 1000) / 10;
  const farkDip = (fiyat - min90) / min90;
  const farkDipYuzde = Math.round(farkDip * 1000) / 10;

  const kampanya = magazaKampanyaKontrol(magazaId, d);

  temel.metrikler = {
    guncelFiyat: fiyat,
    minFiyat90: min90,
    ortFiyat30: ort30,
    maxFiyat60: max60,
    farkOrtalamaYuzde,
    farkDipYuzde,
    gunSayisi: analiz.gunSayisi,
    veriNoktasi: analiz.veriNoktasi,
  };
  temel.kampanya = kampanya.yakindaMi ? kampanya : null;

  const dipSeviyedeMi = fiyat <= min90 * 1.015;
  const ortalamadanCokUcuzMu = farkOrtalama <= -0.10;

  if (dipSeviyedeMi || ortalamadanCokUcuzMu) {
    let guven = 78;
    if (dipSeviyedeMi) guven += 10;
    if (farkOrtalama <= -0.15) guven += 4;
    if (analiz.veriNoktasi >= 10) guven += 3;
    guven = Math.min(95, Math.max(70, guven));

    let aciklama;
    let baslik;
    const dipRef = min90 <= fiyat ? min90 : fiyat;
    if (dipSeviyedeMi) {
      baslik = 'Son 60-90 günün en dip seviyesinde!';
      aciklama = `%${guven} Güvenle: Bu ürün son ${analiz.gunSayisi || 60} günün en dip seviyesinde (₺${formatTL(dipRef)}). Fiyatın daha fazla düşme ihtimali çok zayıf, stoklar tükenmeden değerlendirin.`;
    } else {
      baslik = `30 günlük ortalamanın %${Math.abs(farkOrtalamaYuzde)} altında!`;
      aciklama = `%${guven} Güvenle: Fiyat son 30 günün gerçek piyasa ortalamasından (₺${formatTL(ort30)}) belirgin biçimde daha ucuz. Almak için çok avantajlı bir an.`;
    }

    return {
      karar: 'SIMDI_AL',
      rozet: '🟢 ŞİMDİ AL',
      guven,
      baslik,
      aciklama,
      tavsiyeKodu: 'simdi_al',
      beklenenTasarrufTL: null,
      beklemeGun: null,
      metrikler: temel.metrikler,
      kampanya: temel.kampanya,
    };
  }

  const pahaliMi = farkOrtalama >= 0.08;
  const kampanyaBeklenmeliMi = kampanya.yakindaMi && kampanya.kalanGun > 0 && (farkOrtalama >= 0 || kampanya.kalanGun <= 2);

  if (pahaliMi || kampanyaBeklenmeliMi) {
    let guven = 70;
    if (pahaliMi) guven += Math.min(15, Math.round(farkOrtalama * 40));
    if (kampanya.yakindaMi) guven += 6;
    guven = Math.min(92, Math.max(68, guven));

    let beklenenTasarruf = 0;
    let beklemeGun = kampanya.yakindaMi && kampanya.kalanGun > 0 ? kampanya.kalanGun : 4;

    if (pahaliMi) {
      beklenenTasarruf = Math.max(30, Math.round(fiyat - ort30));
    } else if (kampanya.yakindaMi) {
      beklenenTasarruf = Math.max(30, Math.round(fiyat * (kampanya.tipikOran || 0.10)));
    }

    let aciklama;
    let baslik;
    if (kampanyaBeklenmeliMi && kampanya.kalanGun > 0) {
      baslik = `${beklemeGun} gün sonra ${kampanya.etkinlik || 'kampanya'} fırsatı var!`;
      aciklama = `%${guven} İhtimalle: Bu mağaza ${kampanya.aciklama || 'yakında kampanya kuponu sunuyor.'} ${beklemeGun} gün daha beklerseniz ortalama ₺${formatTL(beklenenTasarruf)} tasarruf ederek daha ucuza alma şansınız yüksek.`;
    } else {
      baslik = 'Fiyat piyasa ortalamasının üzerinde!';
      aciklama = `%${guven} İhtimalle: Ürün son 30 günlük piyasa ortalamasının (₺${formatTL(ort30)}) %${farkOrtalamaYuzde} üzerinde satılıyor. Birkaç gün beklerseniz ortalama ₺${formatTL(beklenenTasarruf)} tasarruf etme şansınız yüksek.`;
    }

    return {
      karar: 'BEKLE',
      rozet: '🟡 BEKLE',
      guven,
      baslik,
      aciklama,
      tavsiyeKodu: 'bekle',
      beklenenTasarrufTL: beklenenTasarruf,
      beklemeGun,
      metrikler: temel.metrikler,
      kampanya: temel.kampanya,
    };
  }

  return {
    karar: 'NOTR',
    rozet: '⚪ DENGELİ FİYAT',
    guven: 62,
    baslik: 'Fiyat piyasa ortalamasında seyrediyor',
    aciklama: `%62 Güvenle: Ürün son 30 günlük piyasa ortalamasında (₺${formatTL(ort30)} civarı) dengeli seyrediyor. Acil ihtiyacınız varsa alabilirsiniz, yakın vadede sert bir fiyat düşüşü beklenmiyor.`,
    tavsiyeKodu: 'notr',
    beklenenTasarrufTL: null,
    beklemeGun: null,
    metrikler: temel.metrikler,
    kampanya: temel.kampanya,
  };
}

export async function zamanlamaTahminiYapAI(girdi) {
  const deterministik = zamanlamaTahminiYap(girdi);
  if (!config.ai.apiKey || deterministik.karar === 'NOTR') {
    return deterministik;
  }

  const prompt = `Girdi Fiyat Verisi:
- Karar: ${deterministik.karar} (${deterministik.rozet})
- Güven Oranı: %${deterministik.guven}
- Güncel Fiyat: ₺${formatTL(deterministik.metrikler.guncelFiyat)}
- 90 Gün En Düşük Fiyat: ₺${formatTL(deterministik.metrikler.minFiyat90)}
- 30 Gün Piyasa Ortalaması: ₺${formatTL(deterministik.metrikler.ortFiyat30)}
- Ortalamaya Göre Fark: %${deterministik.metrikler.farkOrtalamaYuzde}
${deterministik.beklenenTasarrufTL ? `- Beklenen Tasarruf: ₺${formatTL(deterministik.beklenenTasarrufTL)}` : ''}
${deterministik.beklemeGun ? `- Önerilen Bekleme Süresi: ${deterministik.beklemeGun} gün` : ''}
${deterministik.kampanya ? `- Yaklaşan Mağaza Kampanyası: ${deterministik.kampanya.aciklama}` : ''}

Görev: Bu verilere dayanarak kullanıcıya akıcı, profesyonel ve tarafsız 1-2 cümlelik Türkçe satın alma kararı tavsiyesi yaz. Güven yüzdesini ve varsa tasarruf/gün bilgisini koru. Açıklama haricinde hiçbir şey yazma.`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(config.ai.baseURL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.ai.apiKey,
      },
      body: JSON.stringify({
        model: config.ai.model || 'deepseek-v4.1-flash',
        temperature: 0.3,
        max_tokens: 150,
        messages: [
          { role: 'system', content: 'Sen tarafsız ve dürüst bir e-ticaret fiyat karar destek danışmanısın.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const data = await res.json();
      const aiMetin = data.choices?.[0]?.message?.content?.trim();
      if (aiMetin && aiMetin.length > 20) {
        return {
          ...deterministik,
          aciklama: aiMetin,
          aiZenginlestirilmis: true,
        };
      }
    }
  } catch {}

  return deterministik;
}