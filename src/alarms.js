/**
 * İndirim botu: takip edilen ürünlerin fiyatlarını günde 5 kez (09:00, 12:00, 15:00,
 * 18:00, 21:00) kontrol eden zamanlanmış görev.
 *
 * Kurallar (kullanıcı isteği):
 *  - Görev, önceden yazılmış ve test edilmiş kodu (src/pipeline.js → refreshPrices) çalıştırır.
 *  - Her kontrol fiyat geçmişine kaydedilir; Ayarlar sayfasında grafik gösterilir.
 *  - Gerçek fiyat hedefin altına düşerse YA DA en ucuz site değişirse Ayarlar'daki adrese e-posta gönderilir.
 *  - E-postada ürün, site, gerçek fiyat, önceki fiyat ve varsa koşullu kampanyalar yer alır.
 *  - Alarm göndermeden önce ilgili sayfa bir kez daha çekilip fiyat doğrulanır.
 *  - Aynı anda en fazla 3 istek atılır (scraper.js semaforu).
 *  - Hata olursa bir kez tekrar deneneur; yine olmazsa "kontrol edilemedi" yazılır,
 *    son bilinen fiyat tarihiyle gösterilir; asla tahmini fiyat yazılmaz.
 */
import nodemailer from 'nodemailer';
import { getSettings, getTracked, updateTracked, addPricePoint, DEFAULT_ALARM_SAATLERI } from './store.js';
import { refreshPrices } from './pipeline.js';
import { adapterById } from './sites/index.js';
import { classifyCampaigns } from './ai.js';
import { computePricing } from './pricing.js';
import { pushGonder } from './push.js';
import { formatTL } from './util.js';

const BILDIRIM_SONUK_MS = 24 * 3600 * 1000; // aynı alarm türü için 24 saat sessizlik
const GECMIS_SINIRI = 200;

/**
 * Bildirimlerde stok durumunu tek satırda özetler (2026-10-30).
 * `durum === 'ok'` → stokta, `stokta_yok` → tükendi, diğerleri (hata/doğrulanamadı)
 * sayılmaz. Hiçbir mağaza okunamadıysa "stok bilgisi yok" denir — uydurulmaz.
 */
export function stokOzetSatiri(kayitlar) {
  const liste = Array.isArray(kayitlar) ? kayitlar : [];
  const stokta = liste.filter(s => s.durum === 'ok').length;
  const yok = liste.filter(s => s.durum === 'stokta_yok').length;
  if (!stokta && !yok) return 'stok bilgisi okunamadı';
  if (!stokta) return `🔴 ${yok} mağazanın tamamında tükendi`;
  return `🟢 ${stokta} mağazada stokta${yok ? ` · 🔴 ${yok} mağazada tükendi` : ''}`;
}

let zamanlayici = null;
let calisiyor = false;
let sonCalisma = null;
let sonrakiCalismaZaman = null;

/** Bir sonraki çalışma anını verilen saat listesine göre hesaplar. */
function sonrakiCalismaZamani(saatler = DEFAULT_ALARM_SAATLERI) {
  const simdi = new Date();
  let enYakin = null;
  for (const s of saatler) {
    const [h, m] = s.split(':').map(Number);
    const aday = new Date(simdi);
    aday.setHours(h || 0, m || 0, 0, 0);
    if (aday <= simdi) aday.setDate(aday.getDate() + 1);
    if (!enYakin || aday < enYakin) enYakin = aday;
  }
  return enYakin;
}

/** Zamanlanmış görevi kurar: her gün 5 kez fiyat kontrolü. */
export function startAlarmScheduler() {
  if (zamanlayici) clearTimeout(zamanlayici);
  const ayarla = () => {
    const s = getSettings();
    const saatler = Array.isArray(s.alarmSaatleri) && s.alarmSaatleri.length ? s.alarmSaatleri : DEFAULT_ALARM_SAATLERI;
    const sonraki = sonrakiCalismaZamani(saatler);
    sonrakiCalismaZaman = sonraki.toISOString();
    const bekleme = Math.max(1000, sonraki - Date.now());
    console.log('[gorev] sonraki fiyat kontrolü:', sonraki.toLocaleString('tr-TR'));
    zamanlayici = setTimeout(async () => {
      await checkAlarms().catch(e => console.error('[gorev] kontrol hatası:', e.message));
      ayarla(); // sonraki zamanlamayı kur
    }, bekleme);
  };
  ayarla();
}

/** Zamanlanmış görevin durumunu döndürür. */
export function gorevDurumu() {
  return {
    calisiyor,
    sonCalisma,
    sonrakiCalisma: sonrakiCalismaZaman,
    saatler: getSettings().alarmSaatleri || DEFAULT_ALARM_SAATLERI,
  };
}

// ---- E-posta ----

/** Geçerli bir e-posta adresi mi? (SMTP "From" alanı için) */
function gecerliEposta(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

async function mailGonder(konu, icerik) {
  const s = getSettings();
  if (!s.alarmEmail) throw new Error('Alarm e-posta adresi tanımlı değil (Ayarlar sayfası)');
  if (!s.smtp?.host || !s.smtp?.user || !s.smtp?.pass) throw new Error('SMTP ayarları eksik (Ayarlar sayfası)');
  // "From" geçerli bir adres değilse (ör. yalnızca görünen ad yazılmışsa) SMTP sunucusu
  // gönderimi reddeder ("Invalid sender"). Bu durumda oturum açılan adres kullanılır
  // (2026-10-28: alan "indirim botu (erdal)" idi, e-posta hiç gitmiyordu).
  const gecerli = gecerliEposta(s.smtp.from);
  const fromAdres = gecerli ? String(s.smtp.from).trim() : s.smtp.user;
  const transporter = nodemailer.createTransport({
    host: s.smtp.host,
    port: Number(s.smtp.port) || 587,
    secure: !!s.smtp.secure,
    auth: { user: s.smtp.user, pass: s.smtp.pass },
  });
  const bilgi = await transporter.sendMail({
    from: gecerli ? fromAdres : `"En Ucuz Nerede?" <${fromAdres}>`,
    to: s.alarmEmail,
    subject: konu,
    text: icerik,
  });
  // Teslim kanıtı: mesaj kimliği ve gerçek alıcı (Ayarlar panelinde gösterilir).
  return { messageId: bilgi?.messageId || null, alici: s.alarmEmail, fromAdres };
}

function koşulluKampanyaMetni(pricing) {
  const kosullu = pricing?.kampanyaKosullu || [];
  if (!kosullu.length) return '';
  return '\nKoşullu kampanyalar (herkes için geçerli değil):\n' + kosullu.map(k => '- ' + k.metin + (k.kosul_aciklamasi ? ' (' + k.kosul_aciklamasi + ')' : '')).join('\n');
}

/**
 * Alarm göndermeden önce fiyatı doğrulama: ilgili sayfayı bir kez daha çeker.
 * @returns {Promise<{toplam:number|null, kupon:object|null}|null>} doğrulanmış fiyat (ve varsa kupon) ya da null
 */
async function fiyatiDogrula(site, url, oncekiFiyat) {
  const adapter = adapterById(site);
  if (!adapter) return null;
  const ctx = { spend: 0 };
  try {
    const product = await adapter.getProduct(url, ctx, { fresh: true });
    const classified = await classifyCampaigns({
      site: adapter.name,
      urunBasligi: product.title,
      fiyatlar: { etiket: product.listPrice, satis: product.sellingPrice },
      kampanyalar: product.campaigns || [],
    });
    const pricing = computePricing(product, classified);
    return { toplam: pricing?.toplam ?? null, kupon: pricing?.kupon ?? null };
  } catch {
    return null; // doğrulama başarısızsa alarm gönderilmez
  }
}

/** E-posta için kupon satırı: "Kupona alırsan fiyat şu olur" (kupon yoksa boş). */
function kuponSatiri(kupon) {
  if (!kupon || kupon.fiyat == null) return '';
  const kod = kupon.kodu ? '"' + kupon.kodu + '" kupon koduyla' : 'sayfadaki kuponla';
  const kosul = kupon.kosul ? ' (' + kupon.kosul + ')' : '';
  return 'Kuponlu fiyat: ' + formatTL(kupon.fiyat) + ' — ' + kod + ' alırsan fiyat buna düşer' + kosul + '\n';
}

/**
 * Tüm takip edilen ürünleri kontrol eder. Dışarıdan da tetiklenebilir
 * (POST /api/alarm/calistir ya da Ayarlar sayfasındaki düğme).
 */
export async function checkAlarms() {
  if (calisiyor) return { hata: 'Kontrol zaten çalışıyor' };
  calisiyor = true;
  const basladi = Date.now();
  try {
    const takipler = getTracked();
    const rapor = [];
    for (const t of takipler) {
      if (!t.urunler?.length) continue;
      const sonuc = await tekUrunKontrol(t);
      rapor.push(sonuc);
    }
    sonCalisma = new Date().toISOString();
    // 📢 Alarm kontrollerinin hemen ardından fırsat kanalını sessizce tetikle.
    // Yalnızca gerçek snapshot'lardan beslenir; hata alarm akışını ETKİLEMEZ.
    import('./firsatKanali.js')
      .then(m => m.firsatlariTara({ taze: false }))
      .catch(e => console.warn('[firsat] alarm sonrası tarama hatası:', String(e.message || e).slice(0, 120)));
    return { tamam: true, sureMs: Date.now() - basladi, urunSayisi: takipler.length, sonuclar: rapor };
  } finally {
    calisiyor = false;
  }
}

/** Tek takip kaydının kontrolü: fiyat geçmişi + tetikleyiciler + doğrulama + e-posta. */
async function tekUrunKontrol(t) {
  const fiyatlar = await refreshPrices(t.urunler, { fresh: true });
  const ts = new Date().toISOString();

  // Geçmişteki önceki durum (son kayıt)
  const oncekiKayit = (t.fiyatGecmisi || []).length ? t.fiyatGecmisi[t.fiyatGecmisi.length - 1] : null;

  // Bu kontrolün kaydı: her site için durum + fiyat; hatalıysa son bilinen fiyat korunur
  const siteKayitlari = [];
  let yeniEnUcuz = null;
  for (const f of fiyatlar) {
    let fiyat = f.pricing?.toplam ?? null;
    let durum = 'ok';
    let hataNotu = null;
    if (f.hata || fiyat == null) {
      durum = 'kontrol_edilemedi';
      hataNotu = f.hata || 'fiyat okunamadı';
      // son bilinen fiyatı koru (tahmin üretme!)
      const sonBilinen = (oncekiKayit?.fiyatlar || []).find(x => x.site === f.site && x.fiyat != null);
      fiyat = sonBilinen?.fiyat ?? null;
    } else if (f.product?.inStock === false) {
      durum = 'stokta_yok';
    }
    siteKayitlari.push({ site: f.site, siteName: f.siteName, url: f.url, durum, fiyat, hata: hataNotu, koşullu: f.pricing?.kampanyaKosullu || [], kupon: f.pricing?.kupon || null });
    if (durum === 'ok' && fiyat != null && (!yeniEnUcuz || fiyat < yeniEnUcuz.fiyat)) {
      yeniEnUcuz = { site: f.site, siteName: f.siteName, url: f.url, fiyat, koşullu: f.pricing?.kampanyaKosullu || [] };
    }
  }

  const gecmisKaydi = {
    ts,
    enUcuzSite: yeniEnUcuz?.siteName ?? null,
    enUcuzFiyat: yeniEnUcuz?.fiyat ?? null,
    fiyatlar: siteKayitlari.map(s => ({ site: s.site, durum: s.durum, fiyat: s.fiyat })),
  };
  const gecmis = [...(t.fiyatGecmisi || []), gecmisKaydi].slice(-GECMIS_SINIRI);

  // ---- Tetikleyiciler ----
  const bildirimler = [];

  // 1) Hedef fiyatın altına düştü mü?
  const hedefAsan = yeniEnUcuz && t.hedefFiyat && yeniEnUcuz.fiyat <= t.hedefFiyat ? yeniEnUcuz : null;
  if (hedefAsan && (!t.sonHedefBildirimi || Date.now() - new Date(t.sonHedefBildirimi).getTime() > BILDIRIM_SONUK_MS)) {
    // Doğrulama: sayfayı bir kez daha çek
    const dogrulanmis = await fiyatiDogrula(hedefAsan.site, hedefAsan.url, hedefAsan.fiyat);
    if (dogrulanmis != null && dogrulanmis.toplam != null && dogrulanmis.toplam <= t.hedefFiyat) {
      const oncekiFiyat = oncekiKayit?.enUcuzFiyat ?? null;
      const konu = '🎯 Fiyat alarmı: ' + t.urun.slice(0, 80) + ' — ' + hedefAsan.siteName + ' ' + formatTL(dogrulanmis.toplam);
      const icerik =
        'Hedef fiyatın altına düştü!\n\n' +
        'Ürün: ' + t.urun + (t.renk ? ' (' + t.renk + ')' : '') + '\n' +
        'Site: ' + hedefAsan.siteName + '\n' +
        'Gerçek fiyat: ' + formatTL(dogrulanmis.toplam) + '\n' +
        'Stok: ' + stokOzetSatiri(siteKayitlari) + '\n' +
        kuponSatiri(dogrulanmis.kupon) +
        'Önceki fiyat: ' + (oncekiFiyat != null ? formatTL(oncekiFiyat) : 'bilinmiyor') + '\n' +
        'Hedef fiyat: ' + formatTL(t.hedefFiyat) + '\n' +
        'Doğrulama: fiyat alarm öncesi sayfa yeniden çekilerek teyit edildi.\n' +
        koşulluKampanyaMetni({ kampanyaKosullu: hedefAsan.koşullu }) + '\n' +
        'Ürün linki: ' + hedefAsan.url + '\n\n' +
        '— En Ucuz Nerede';
      let gitti = false;
      let hata = null;
      // 🔔 Web Push: e-posta/Telegram'dan bağımsız, cihaz bildirimi.
      try {
        await bildirimleriGonder(konu, icerik, {
          push: {
            baslik: `🏷️ Fiyat Düştü: ${String(t.urun).slice(0, 70)}`,
            govde: `${oncekiFiyat != null ? formatTL(oncekiFiyat) : 'önceki fiyat'} ➔ ${formatTL(dogrulanmis.toplam)} (${hedefAsan.siteName})`,
            url: hedefAsan.url,
            etiket: 'eun-fiyat-dustu',
          },
        });
        gitti = true;
      } catch (e) { hata = e.message; }
      bildirimler.push({ tur: 'hedef', site: hedefAsan.siteName, fiyat: dogrulanmis.toplam, gonderildi: gitti, hata });
      updateTracked(t.id, { sonHedefBildirimi: ts });
    } else {
      bildirimler.push({ tur: 'hedef', site: hedefAsan.siteName, fiyat: hedefAsan.fiyat, gonderildi: false, hata: 'doğrulama başarısız, alarm gönderilmedi' });
    }
  }

  // 2) En ucuz site değişti mi?
  const oncekiEnUcuzSite = oncekiKayit?.enUcuzSite ?? null;
  if (
    yeniEnUcuz && oncekiEnUcuzSite && oncekiEnUcuzSite !== yeniEnUcuz.siteName &&
    (!t.sonDegisimBildirimi || Date.now() - new Date(t.sonDegisimBildirimi).getTime() > BILDIRIM_SONUK_MS)
  ) {
    const dogrulanmis = await fiyatiDogrula(yeniEnUcuz.site, yeniEnUcuz.url, yeniEnUcuz.fiyat);
    if (dogrulanmis != null && dogrulanmis.toplam != null) {
      const oncekiFiyat = oncekiKayit?.enUcuzFiyat ?? null;
      const konu = '🔁 En ucuz site değişti: ' + t.urun.slice(0, 80);
      const icerik =
        'Ürünün en ucuz satıldığı site değişti!\n\n' +
        'Ürün: ' + t.urun + (t.renk ? ' (' + t.renk + ')' : '') + '\n' +
        'Yeni en ucuz site: ' + yeniEnUcuz.siteName + '\n' +
        'Yeni gerçek fiyat: ' + formatTL(dogrulanmis.toplam) + '\n' +
        'Stok: ' + stokOzetSatiri(siteKayitlari) + '\n' +
        kuponSatiri(dogrulanmis.kupon) +
        'Önceki en ucuz site: ' + oncekiEnUcuzSite + '\n' +
        'Önceki fiyat: ' + (oncekiFiyat != null ? formatTL(oncekiFiyat) : 'bilinmiyor') + '\n' +
        'Doğrulama: fiyat alarm öncesi sayfa yeniden çekilerek teyit edildi.\n' +
        koşulluKampanyaMetni({ kampanyaKosullu: yeniEnUcuz.koşullu }) + '\n' +
        'Ürün linki: ' + yeniEnUcuz.url + '\n\n' +
        '— En Ucuz Nerede';
      let gitti = false;
      let hata = null;
      try {
        await bildirimleriGonder(konu, icerik, {
          push: {
            baslik: `🔁 En Ucuz Mağaza Değişti: ${String(t.urun).slice(0, 60)}`,
            govde: `${formatTL(dogrulanmis.toplam)} — ${yeniEnUcuz.siteName}`,
            url: yeniEnUcuz.url,
            etiket: 'eun-magaza-degisti',
          },
        });
        gitti = true;
      } catch (e) { hata = e.message; }
      bildirimler.push({ tur: 'en_ucuz_degisti', site: yeniEnUcuz.siteName, fiyat: dogrulanmis.toplam, gonderildi: gitti, hata });
      updateTracked(t.id, { sonDegisimBildirimi: ts });
    }
  }

  // 3) Stok durumu değişti mi? (2026-10-30)
  //    "Tüm mağazalarda tükendi" ↔ "yeniden stokta". Yalnızca ÖNCEKİ kayıtla
  //    karşılaştırılır; ilk kontrolde (önceki veri yok) bildirim gönderilmez ki
  //    yanlış alarm olmasın. Stok bilgisi okunamayan mağazalar sayılmaz.
  const stoktaVarSayisi = siteKayitlari.filter(s => s.durum === 'ok').length;
  const stoktaYokSayisi = siteKayitlari.filter(s => s.durum === 'stokta_yok').length;
  const oncekiFiyatlar = Array.isArray(oncekiKayit?.fiyatlar) ? oncekiKayit.fiyatlar : null;
  if (
    oncekiFiyatlar && (stoktaVarSayisi + stoktaYokSayisi) > 0 &&
    (!t.sonStokBildirimi || Date.now() - new Date(t.sonStokBildirimi).getTime() > BILDIRIM_SONUK_MS)
  ) {
    const oncekiVar = oncekiFiyatlar.filter(f => f.durum === 'ok').length;
    const oncekiYok = oncekiFiyatlar.filter(f => f.durum === 'stokta_yok').length;
    const simdiTukendi = stoktaVarSayisi === 0 && stoktaYokSayisi > 0;
    const oncekiTukendi = oncekiVar === 0 && oncekiYok > 0;

    if (simdiTukendi !== oncekiTukendi) {
      const urunSatiri = 'Ürün: ' + t.urun + (t.renk ? ' (' + t.renk + ')' : '') + '\n';
      const link = yeniEnUcuz?.url || t.urunler?.[0]?.url || '';
      const konu = (simdiTukendi ? '⚠️ Ürün tükendi: ' : '🟢 Yeniden stokta: ') + t.urun.slice(0, 80);
      const icerik = simdiTukendi
        ? 'Takip ettiğiniz ürün tüm mağazalarda tükendi.\n\n' +
          urunSatiri +
          'Durum: ' + stoktaYokSayisi + ' mağazanın tamamında stok yok\n' +
          'Son bilinen en ucuz: ' + (yeniEnUcuz ? formatTL(yeniEnUcuz.fiyat) + ' — ' + yeniEnUcuz.siteName : 'bilinmiyor') + '\n' +
          'Ürün linki: ' + link + '\n\n' +
          '— En Ucuz Nerede'
        : 'Takip ettiğiniz ürün yeniden stokta!\n\n' +
          urunSatiri +
          'Stok: ' + stokOzetSatiri(siteKayitlari) + '\n' +
          'En ucuz (stokta): ' + (yeniEnUcuz ? formatTL(yeniEnUcuz.fiyat) + ' — ' + yeniEnUcuz.siteName : 'henüz okunamadı') + '\n' +
          'Ürün linki: ' + link + '\n\n' +
          '— En Ucuz Nerede';
      let gitti = false;
      let hata = null;
      try {
        await bildirimleriGonder(konu, icerik, {
          push: {
            baslik: `${simdiTukendi ? '📦 Tükendi' : '📦 Yeniden Stokta'}: ${String(t.urun).slice(0, 60)}`,
            govde: yeniEnUcuz ? `${formatTL(yeniEnUcuz.fiyat)} — ${yeniEnUcuz.siteName}` : 'Stok durumu değişti',
            url: link,
            etiket: 'eun-stok',
          },
        });
        gitti = true;
      } catch (e) { hata = e.message; }
      bildirimler.push({
        tur: simdiTukendi ? 'stok_tukendi' : 'stok_yenilendi',
        site: yeniEnUcuz?.siteName ?? null,
        fiyat: yeniEnUcuz?.fiyat ?? null,
        gonderildi: gitti,
        hata,
      });
      updateTracked(t.id, { sonStokBildirimi: ts });
    }
  }

  updateTracked(t.id, {
    fiyatGecmisi: gecmis,
    sonKontrol: ts,
    sonFiyatlar: siteKayitlari.filter(s => s.fiyat != null).map(s => ({ site: s.site, fiyat: s.fiyat, url: s.url, durum: s.durum, kuponFiyati: s.kupon?.fiyat ?? null, kuponKodu: s.kupon?.kodu ?? null })),
  });

  // 30 günlük grafik için zaman serisi (2026-10-28): takip edilen ürünler günde 5 kez
  // kontrol edildiği için geçmiş buradan birikir. Önceden yalnızca elle karşılaştırma
  // kayıt ekliyordu; bu yüzden grafik takip edilen ürünlerde hiç dolmuyordu.
  // Kimlik, karşılaştırma ucunun kullandığı kimlikle AYNI olmalı (modelKodu → urun).
  const pid = t.modelKodu || t.urun;
  if (pid) {
    for (const s of siteKayitlari) {
      // Yalnızca gerçekten okunan fiyat yazılır; "kontrol edilemedi"de son bilinen
      // fiyat tekrar yazılmaz (uydurma/tekrar veri olmasın).
      if (s.durum !== 'ok' || s.fiyat == null) continue;
      try {
        addPricePoint({ productId: pid, site: s.site, price: s.fiyat, netPrice: s.fiyat, ts });
      } catch (e) {
        console.warn('[alarms] fiyat geçmişi yazılamadı:', e.message);
      }
    }
  }

  return {
    id: t.id,
    urun: t.urun,
    enUcuzSite: yeniEnUcuz?.siteName ?? null,
    enUcuzFiyat: yeniEnUcuz?.fiyat ?? null,
    oncekiEnUcuzSite,
    // Stok özeti (2026-10-30): arayüz/bildirim aynı gerçeği göstersin.
    stoktaVarSayisi,
    stoktaYokSayisi,
    tamamiTukendi: stoktaVarSayisi === 0 && stoktaYokSayisi > 0,
    kontroller: siteKayitlari.map(s => ({ site: s.siteName, durum: s.durum, fiyat: s.fiyat, hata: s.hata })),
    bildirimler,
  };
}

/**
 * Test e-postası: gerçek biçimde örnek bir alarm iletisi gönderir.
 * Varsa ilk takip edilen ürünün gerçek verileriyle doldurulur.
 */
export async function sendTestEmail() {
  const takip = getTracked()[0] || null;
  const urun = takip?.urun || 'Örnek ürün (Rampage X-Ranger 7.1 RGB USB Kulaklık)';
  const site = takip?.sonFiyatlar?.[0]?.site ? (adapterById(takip.sonFiyatlar[0].site)?.name || 'Trendyol') : 'Trendyol';
  const fiyat = takip?.sonFiyatlar?.[0]?.fiyat ?? 1699;
  const konu = '🧪 Test e-postası — En Ucuz Nerede fiyat alarmı çalışıyor';
  const icerik =
    'Bu bir test e-postasıdır. Alarm sistemini kurarken gönderilir.\n\n' +
    'Örnek alarm biçimi:\n' +
    '----------------------------------------\n' +
    'Ürün: ' + urun + '\n' +
    'Site: ' + site + '\n' +
    'Gerçek fiyat: ' + formatTL(fiyat) + '\n' +
    'Kuponlu fiyat: ' + formatTL(Math.round(fiyat * 0.9)) + ' — "ORNEK10" kupon koduyla alırsan fiyat buna düşer\n' +
    'Önceki fiyat: ' + formatTL(fiyat + 100) + '\n' +
    'Hedef fiyat: ' + formatTL(Math.max(1, Math.floor(fiyat * 0.85))) + '\n' +
    'Doğrulama: fiyat alarm öncesi sayfa yeniden çekilerek teyit edildi.\n' +
    'Koşullu kampanyalar (herkes için geçerli değil):\n' +
    '- Sepette %5 indirim (uygulamaya özel)\n' +
    '----------------------------------------\n' +
    'Günde 5 kez (09:00, 12:00, 15:00, 18:00, 21:00) fiyat kontrolü yapılır.\n\n' +
    '— En Ucuz Nerede';
  const gonderim = await mailGonder(konu, icerik);
  return { ok: true, konu, icerik, messageId: gonderim?.messageId || null, alici: gonderim?.alici || null };
}

// ---- Çoklu Bildirim Kanalları (Telegram & WhatsApp) ----

export async function telegramGonder(konu, icerik, opts = {}) {
  const s = getSettings();
  const token = opts.botToken || s.telegram?.botToken;
  const chatId = opts.chatId || s.telegram?.chatId;
  if (!token || !chatId) {
    throw new Error('Telegram Bot Token veya Chat ID tanımlı değil.');
  }
  const text = '🔔 <b>' + konu + '</b>\n\n' + icerik;
  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Telegram API hatası (' + res.status + '): ' + t.slice(0, 150));
  }
  return { ok: true };
}

export async function whatsappGonder(konu, icerik, opts = {}) {
  const s = getSettings();
  const webhookUrl = opts.webhookUrl || s.whatsapp?.webhookUrl;
  const phone = opts.phone || s.whatsapp?.phone || '';
  if (!webhookUrl) {
    throw new Error('WhatsApp Webhook / API URL tanımlı değil.');
  }
  const text = '🔔 *' + konu + '*\n\n' + icerik;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      message: text,
      text,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('WhatsApp API hatası (' + res.status + '): ' + t.slice(0, 150));
  }
  return { ok: true };
}

/**
 * Tüm etkin bildirim kanallarına gönderir (e-posta, Telegram, WhatsApp, Web Push).
 *
 * @param {string} konu
 * @param {string} icerik
 * @param {{push?:{baslik?:string,govde?:string,url?:string,etiket?:string}}} [opts]
 *   push: yapılandırılmış cihaz bildirimi. Verilmezse konu/icerik'ten türetilir.
 */
export async function bildirimleriGonder(konu, icerik, opts = {}) {
  const s = getSettings();
  const sonuclar = [];

  // E-posta
  if (s.alarmEmail && s.smtp?.host) {
    try {
      await mailGonder(konu, icerik);
      sonuclar.push({ kanal: 'email', durum: 'basarili' });
    } catch (e) {
      sonuclar.push({ kanal: 'email', durum: 'hata', hata: e.message });
    }
  }

  // Telegram
  if (s.telegram?.enabled && s.telegram?.botToken && s.telegram?.chatId) {
    try {
      await telegramGonder(konu, icerik);
      sonuclar.push({ kanal: 'telegram', durum: 'basarili' });
    } catch (e) {
      sonuclar.push({ kanal: 'telegram', durum: 'hata', hata: e.message });
    }
  }

  // WhatsApp
  if (s.whatsapp?.enabled && s.whatsapp?.webhookUrl) {
    try {
      await whatsappGonder(konu, icerik);
      sonuclar.push({ kanal: 'whatsapp', durum: 'basarili' });
    } catch (e) {
      sonuclar.push({ kanal: 'whatsapp', durum: 'hata', hata: e.message });
    }
  }

  // 🔔 Web Push (2026-11-01): kayıtlı tarayıcı/cihazlara native bildirim.
  // Abone yoksa sessizce atlanır (hata değildir; kanal henüz kurulmamış).
  try {
    const p = opts.push || {};
    const r = await pushGonder({
      baslik: p.baslik || konu,
      govde: p.govde || String(icerik || '').split('\n').filter(Boolean).slice(0, 2).join(' · ').slice(0, 180),
      url: p.url || '/',
      etiket: p.etiket || 'eun-bildirim',
    });
    if (r.abone > 0) {
      sonuclar.push({
        kanal: 'push',
        durum: r.hatali === 0 ? 'basarili' : (r.basarili > 0 ? 'kismi' : 'hata'),
        basarili: r.basarili,
        hatali: r.hatali,
      });
    }
  } catch (e) {
    sonuclar.push({ kanal: 'push', durum: 'hata', hata: String(e.message || e) });
  }

  return sonuclar;
}

export async function sendTestTelegram(opts = {}) {
  const konu = '🧪 Test Bildirimi — En Ucuz Nerede Telegram';
  const icerik = 'Tebrikler! Telegram fiyat alarm bildirimleri başarıyla bağlandı. 🚀\n\nTakip ettiğin ürünlerde fiyat düşüşü olduğunda buraya anlık bildirim gönderilecek.';
  await telegramGonder(konu, icerik, opts);
  return { ok: true };
}

export async function sendTestWhatsApp(opts = {}) {
  const konu = '🧪 Test Bildirimi — En Ucuz Nerede WhatsApp';
  const icerik = 'Tebrikler! WhatsApp fiyat alarm bildirimleri başarıyla bağlandı. 🚀\n\nTakip ettiğin ürünlerde fiyat düşüşü olduğunda buraya anlık bildirim gönderilecek.';
  await whatsappGonder(konu, icerik, opts);
  return { ok: true };
}
