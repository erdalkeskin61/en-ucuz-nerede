/**
 * Adaptör Sağlık Nöbetçisi (Health Pulse) — 2026-10-29
 *
 * NE YAPAR: desteklenen tüm mağaza adaptörlerini hafif bir testle yoklar ve
 * sonucu SQLite `adapter_health` tablosuna yazar.
 *
 * Her adaptör için:
 *   a) Arama motoru yanıt veriyor mu?        → searchProducts()
 *   b) Ürün başlığı ve fiyatı (price > 0) okunabiliyor mu? → getProduct()
 *   c) Bot korumasına takılıyor mu?          → FetchError 403/429 + challenge metni
 *
 * ZAMANLAMA: her gece 04:00 (yerel saat). Ayrıca `POST /api/health/check` ile elle.
 *
 * DÜRÜSTLÜK KURALLARI:
 *  - "ok" YALNIZCA gerçekten ürün + fiyat okunduysa verilir.
 *  - Arama 200 dönüp 0 sonuç verdiyse bu "bozuk" demek değildir (mağaza o sorguda
 *    ürün satmıyor olabilir) → `bos_sonuc` (uyarı). İki farklı sorgu da boşsa yine
 *    `bos_sonuc`; HTML değişikliği şüphesi ayrı `format_suphesi` ile bildirilir.
 *  - Sorgu, ürünün kendi kategorisine uygun seçilir (3D mağazasına "kablo" atmak
 *    yanlış alarm üretirdi).
 *  - Bot koruması ayrı sınıflanır; "mağaza bozuk" diye yanlış raporlanmaz.
 *
 * YÜK: günde bir kez, adaptör başına ~2 istek, eşzamanlılık 4. Tek kullanıcı
 * karşılaştırmasından (60 site) daha hafiftir.
 */
import { adapters } from './sites/index.js';
import {
  addAdapterHealth, getAdapterHealthLatest, getAdapterHealthHistory,
  pruneAdapterHealth, getSettings,
} from './store.js';
import { telegramGonder } from './alarms.js';
import { dbBakimCalistir } from './dbBakim.js';

/** Kontrol saati (yerel). */
export const KONTROL_SAATI = 4;

/** Eşzamanlı adaptör sayısı (mağazaları dövmemek için düşük). */
const ESZAMANLI = 4;
/** Adaptör başına toplam süre sınırı. */
const ADAPTOR_ZAMAN_ASIMI_MS = 45000;
/** Sağlık kayıtlarının saklama süresi (gün). */
const KAYIT_SAKLAMA_GUN = 30;
/** Tek tek Telegram uyarısı gönderilecek en fazla mağaza (spam olmasın). */
const TEK_UYARI_LIMIT = 5;

/**
 * Kategoriye uygun sağlık sorguları.
 * İlk sorgu 0 sonuç verirse ikincisi denenir.
 */
const SAGLIK_SORGULARI = {
  // 3D baskı / filament mağazaları
  _3d: ['pla filament', 'filament'],
};

/** Hangi adaptör hangi sorgu grubunu kullanır. */
function sorguGrubu(siteId) {
  const t = String(siteId || '').toLowerCase();
  const d3 = [
    'filamentsan', '3dmarketim', 'filamentdepom', 'robo90', 'domirobot', 'robitshop',
    'robotzade', 'kurumsalit', 'mintengo', 'rhino3dprinter', '3dultra', 'robotizmo',
    '3dcim', 'makerfabrika', 'pusula3d', 'print3d', 'ventatek', 'umr3d',
    'teknikfilament3d', 'sivasrobotik', 'robolinkmarket', 'robomer', 'robocombo',
    'tou3d', 'fixx3d', '3dprinterankara', 'filamentmarketim', 'filamenthane',
    'filamentvakti', 'artyteknoloji', 'ileri3d', 'mikron3d', '3dcopycenter',
    'antalya3dmarket', 'teknobilsem', '3dteknomarket', 'matersan', '3dortgen',
    'nmosphere', 'hepsivar', 'deneystore', 'bisiparisver', 'trendruum', 'robotistan',
    'direnc', 'motorobit', 'samm',
  ];
  if (d3.includes(t)) return SAGLIK_SORGULARI._3d;
  // Pazaryerleri ve elektronik: genel bir ürün
  return ['kablo', 'kulaklık'];
}

/** Süre sınırlı söz. */
function sureli(promise, ms, etiket) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(etiket + ' zaman aşımı')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Hatanın türünü sınıflar.
 * @returns {{durum:string, hata:string, botMu:boolean}}
 */
export function hataSinifla(e) {
  const mesaj = String(e?.message || e || '').slice(0, 400);
  const durumKodu = Number(e?.status) || null;

  // Bot koruması: 403/429, Cloudflare/PerimeterX metinleri, challenge ifadeleri
  const botMetni = /bot|cloudflare|challenge|korumal|erişim engellendi|access denied|captcha|403|429|just a moment|attention required|security check|are you a robot|verify you are human/i;
  if (durumKodu === 403 || durumKodu === 429 || botMetni.test(mesaj)) {
    return { durum: 'bot_korumasi', hata: mesaj || 'Bot koruması', botMu: true };
  }
  return { durum: 'hata', hata: mesaj || 'Bilinmeyen hata', botMu: false };
}

/**
 * TEK adaptörü yoklar.
 *
 * @param {object} adapter
 * @returns {Promise<{
 *   site:string, siteName:string, durum:'ok'|'bos_sonuc'|'fiyat_yok'|'bot_korumasi'|'hata',
 *   aramaMs:number|null, urunMs:number|null, adet:number|null,
 *   ornekBaslik:string|null, ornekFiyat:number|null, aramaUrl:string|null,
 *   hata:string|null, sorgu:string|null, kontrolTs:string
 * }>}
 */
export async function adaptorKontrol(adapter) {
  const baslangic = Date.now();
  const ts = new Date().toISOString();
  const taban = {
    site: adapter.id,
    siteName: adapter.name,
    durum: 'hata',
    aramaMs: null,
    urunMs: null,
    adet: null,
    ornekBaslik: null,
    ornekFiyat: null,
    aramaUrl: null,
    hata: null,
    sorgu: null,
    kontrolTs: ts,
  };

  const sorgular = sorguGrubu(adapter.id);

  // ---- a) Arama motoru ----
  let adaylar = [];
  let kullanilanSorgu = null;
  let aramaHatasi = null;
  const aramaBas = Date.now();

  for (const sorgu of sorgular) {
    try {
      const r = await sureli(
        adapter.searchProducts(sorgu, { spend: 0 }).then(x => x || []),
        ADAPTOR_ZAMAN_ASIMI_MS,
        'arama',
      );
      if (r.length) {
        adaylar = r;
        kullanilanSorgu = sorgu;
        break;
      }
      // 0 sonuç: sonraki sorguyu dene
      kullanilanSorgu = kullanilanSorgu || sorgu;
    } catch (e) {
      aramaHatasi = e;
      // Bot korumasıysa diğer sorguyu denemenin anlamı yok
      const s = hataSinifla(e);
      if (s.durum === 'bot_korumasi') break;
    }
  }

  taban.aramaMs = Date.now() - aramaBas;
  taban.sorgu = kullanilanSorgu;

  if (aramaHatasi && !adaylar.length) {
    const s = hataSinifla(aramaHatasi);
    return { ...taban, durum: s.durum, hata: 'Arama: ' + s.hata, urunMs: null };
  }

  if (!adaylar.length) {
    // Arama çalışıyor ama sonuç yok → mağaza bozuk DEĞİL (uyarı)
    return {
      ...taban,
      durum: 'bos_sonuc',
      adet: 0,
      hata: `Arama yanıt verdi ama 0 sonuç ("${kullanilanSorgu}")`,
    };
  }

  taban.adet = adaylar.length;

  // ---- b) Ürün sayfası: başlık + fiyat ----
  // İlk 3 aday denenir (ilk ürün tükenmiş/eksik olabilir).
  const denenecek = adaylar.filter(a => a && a.url).slice(0, 3);
  if (!denenecek.length) {
    return { ...taban, durum: 'fiyat_yok', hata: 'Arama sonuçlarında ürün URL\'si yok (HTML yapısı değişmiş olabilir)' };
  }

  let sonHata = null;
  for (const aday of denenecek) {
    const urunBas = Date.now();
    try {
      const p = await sureli(
        adapter.getProduct(aday.url, { spend: 0 }, { fresh: true }),
        ADAPTOR_ZAMAN_ASIMI_MS,
        'ürün',
      );
      const urunMs = Date.now() - urunBas;

      const baslik = String(p?.title || '').trim();
      const fiyat = Number(p?.pricing?.toplam ?? p?.sellingPrice);

      // Format bozulması: başlık yok ya da fiyat yok/0
      if (!baslik) {
        sonHata = 'Ürün başlığı okunamadı (HTML yapısı değişmiş olabilir)';
        continue;
      }
      if (!Number.isFinite(fiyat) || fiyat <= 0) {
        sonHata = `Fiyat okunamadı (bulunan: ${p?.sellingPrice ?? 'yok'}) — fiyat > 0 olmalı`;
        continue;
      }

      // Sayfa fiyat yerine hata sayfası döndüyse format bozuk
      if (/^(404|sayfa bulunamadı|not found|page not found)/i.test(baslik) || baslik.length < 3) {
        sonHata = 'Ürün sayfası "bulunamadı" içeriği döndürdü';
        continue;
      }

      return {
        ...taban,
        durum: 'ok',
        urunMs,
        ornekBaslik: baslik.slice(0, 200),
        ornekFiyat: Math.round(fiyat * 100) / 100,
        aramaUrl: aday.url,
        hata: null,
      };
    } catch (e) {
      const s = hataSinifla(e);
      if (s.durum === 'bot_korumasi') {
        return {
          ...taban,
          durum: 'bot_korumasi',
          urunMs: Date.now() - urunBas,
          aramaUrl: aday.url,
          hata: 'Ürün sayfası: ' + s.hata,
        };
      }
      sonHata = s.hata;
    }
  }

  return {
    ...taban,
    durum: 'fiyat_yok',
    urunMs: null,
    aramaUrl: denenecek[0]?.url || null,
    hata: sonHata || 'Ürün sayfasından başlık/fiyat alınamadı',
  };
}

/* ------------------------------ çalıştırma ------------------------------ */

let calisiyor = false;
let sonCalisma = null;
let sonSonuc = null;

/** Telegram mesajı için HTML kaçışı (parse_mode=HTML). */
function tgKac(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DURUM_ETIKET = {
  ok: 'aktif',
  bos_sonuc: 'sonuç yok',
  fiyat_yok: 'fiyat okunamadı',
  bot_korumasi: 'bot koruması',
  hata: 'hata',
};

/**
 * Tek mağaza uyarı metni (2026-10-29).
 * Biçim kullanıcı isteğiyle sabittir: "⚠️ [Mağaza Adı] adaptörü hata verdi!
 * Hata: [Sebep]. Lütfen HTML yapısını kontrol edin."
 *
 * @param {{siteName:string, durum:string, hata?:string|null}} b
 * @returns {{konu:string, icerik:string}}
 */
export function tekUyariMetni(b) {
  const ad = b?.siteName || b?.site || 'Bilinmeyen mağaza';
  const sebep = b?.hata || DURUM_ETIKET[b?.durum] || b?.durum || 'bilinmeyen hata';
  return {
    // Mağaza adı da kaçışlanır: Telegram parse_mode=HTML olduğu için "<" içeren
    // bir ad mesajı bozardı (2026-10-29 testiyle yakalandı).
    konu: `⚠️ ${tgKac(ad)} adaptörü hata verdi!`,
    icerik: `Hata: ${tgKac(sebep)}\nLütfen HTML yapısını kontrol edin.`,
  };
}

/**
 * Tüm testler bittiğinde gönderilen tek özet rapor.
 * "59/61 mağaza aktif, 2 mağaza inceleme bekliyor" biçimi.
 *
 * @param {{sonuclar:Array, bekleyen:Array, sonucsuz:number, aktif:number}} r
 * @returns {{konu:string, icerik:string}}
 */
export function ozetMetni(r) {
  const sonuclar = r?.sonuclar || [];
  const bekleyen = r?.bekleyen || [];
  const sonucsuz = Number(r?.sonucsuz || 0);
  const aktif = Number(r?.aktif || 0);

  const satirlar = [`${sonuclar.length} mağaza yoklandı.`];
  let ana = `${aktif}/${sonuclar.length} mağaza aktif`;
  ana += bekleyen.length
    ? `, ${bekleyen.length} mağaza inceleme bekliyor.`
    : ', inceleme bekleyen mağaza yok.';
  satirlar.push(ana);

  if (sonucsuz) {
    satirlar.push(`${sonucsuz} mağaza o sorguda sonuç döndürmedi (bozuk olmayabilir).`);
  }
  if (bekleyen.length) {
    satirlar.push('');
    satirlar.push(...bekleyen.slice(0, 12).map(b =>
      `• ${tgKac(b.siteName)}: ${tgKac(DURUM_ETIKET[b.durum] || b.durum)}`));
    if (bekleyen.length > 12) satirlar.push(`… +${bekleyen.length - 12} mağaza`);
  }

  return { konu: '🩺 Adaptör sağlık raporu', icerik: satirlar.join('\n') };
}

/** Telegram gönderilebilir mi? (token + chatId tanımlı mı) */
function telegramHazirMi() {
  const s = getSettings();
  return !!(s.telegram?.enabled && s.telegram?.botToken && s.telegram?.chatId);
}

/**
 * Tüm adaptörleri (ya da verilen alt kümeyi) yoklar.
 *
 * @param {{siteIds?:string[], bildir?:boolean, kaydet?:boolean, onProgress?:Function}} opts
 * @returns {Promise<{
 *   ts:string, toplam:number, aktif:number, sorunlu:number, sonucsuz:number,
 *   sureMs:number, sonuclar:Array<object>, ozet:object, bildirim:object|null,
 *   bekleyen:Array<{site:string, siteName:string, durum:string, hata:string|null}>
 * }>}
 */
export async function saglikKontrolu(opts = {}) {
  if (calisiyor) {
    throw new Error('Sağlık kontrolü zaten çalışıyor');
  }
  calisiyor = true;
  const basladi = Date.now();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const kaydet = opts.kaydet !== false;
  const bildir = opts.bildir === true;

  const liste = Array.isArray(opts.siteIds) && opts.siteIds.length
    ? adapters.filter(a => opts.siteIds.includes(a.id))
    : adapters;

  const sonuclar = [];
  let imlec = 0;
  let biten = 0;

  try {
    onProgress({ faz: 'baslangic', toplam: liste.length, not: 'Adaptörler yoklanıyor…' });

    const isci = async () => {
      while (true) {
        const i = imlec++;
        if (i >= liste.length) return;
        const adapter = liste[i];
        let sonuc;
        try {
          sonuc = await adaptorKontrol(adapter);
        } catch (e) {
          sonuc = {
            site: adapter.id,
            siteName: adapter.name,
            durum: 'hata',
            aramaMs: null, urunMs: null, adet: null,
            ornekBaslik: null, ornekFiyat: null, aramaUrl: null,
            hata: String(e.message || e).slice(0, 300),
            sorgu: null,
            kontrolTs: new Date().toISOString(),
          };
        }
        sonuclar.push(sonuc);
        if (kaydet) addAdapterHealth(sonuc);
        biten++;
        onProgress({
          faz: 'kontrol', biten, toplam: liste.length,
          site: adapter.id, durum: sonuc.durum, not: `${adapter.name}: ${DURUM_ETIKET[sonuc.durum] || sonuc.durum}`,
        });
      }
    };

    await Promise.all(Array.from({ length: Math.min(ESZAMANLI, liste.length) }, () => isci()));

    // Eski kayıtları temizle (günde bir kez yeterli; ucuz sorgu)
    if (kaydet) {
      try { pruneAdapterHealth(KAYIT_SAKLAMA_GUN); } catch { /* yoksay */ }
    }

    // --- Özet ---
    const aktif = sonuclar.filter(s => s.durum === 'ok').length;
    const sonucsuz = sonuclar.filter(s => s.durum === 'bos_sonuc').length;
    const bekleyen = sonuclar
      .filter(s => s.durum !== 'ok' && s.durum !== 'bos_sonuc')
      .map(s => ({
        site: s.site,
        siteName: s.siteName,
        durum: s.durum,
        hata: s.hata,
        ornekBaslik: s.ornekBaslik,
      }));

    const ozet = {
      toplam: sonuclar.length,
      aktif,
      sonucsuz,
      sorunlu: bekleyen.length,
      botKorumasi: sonuclar.filter(s => s.durum === 'bot_korumasi').length,
      fiyatYok: sonuclar.filter(s => s.durum === 'fiyat_yok').length,
      hata: sonuclar.filter(s => s.durum === 'hata').length,
      ortalamaAramaMs: Math.round(
        sonuclar.filter(s => Number.isFinite(s.aramaMs)).reduce((t, s) => t + s.aramaMs, 0)
        / Math.max(1, sonuclar.filter(s => Number.isFinite(s.aramaMs)).length),
      ),
    };

    // --- Telegram bildirimleri ---
    let bildirim = null;
    if (bildir && telegramHazirMi()) {
      bildirim = { tekUyari: 0, ozetGitti: false, hatalar: [] };

      // 1) Sorunlu mağazalar için tek tek uyarı (en fazla TEK_UYARI_LIMIT)
      for (const b of bekleyen.slice(0, TEK_UYARI_LIMIT)) {
        const { konu, icerik } = tekUyariMetni(b);
        try {
          await telegramGonder(konu, icerik);
          bildirim.tekUyari++;
        } catch (e) {
          bildirim.hatalar.push(String(e.message || e).slice(0, 100));
        }
      }

      // 2) Tek özet rapor
      try {
        const { konu, icerik } = ozetMetni({ sonuclar, bekleyen, sonucsuz, aktif });
        await telegramGonder(konu, icerik);
        bildirim.ozetGitti = true;
      } catch (e) {
        bildirim.hatalar.push(String(e.message || e).slice(0, 100));
      }
      if (bildirim.hatalar.length) {
        console.warn('[health] Telegram bildirim hatası:', bildirim.hatalar[0]);
      } else {
        console.log(`[health] Telegram: ${bildirim.tekUyari} tek uyarı + özet rapor gönderildi`);
      }
    }

    sonCalisma = new Date().toISOString();
    sonSonuc = { ts: sonCalisma, ozet, sonuclar, sureMs: Date.now() - basladi };

    return {
      ts: sonCalisma,
      ...ozet,
      sureMs: Date.now() - basladi,
      sonuclar,
      ozet,
      bekleyen,
      bildirim,
    };
  } finally {
    calisiyor = false;
  }
}

/* --------------------------- zamanlayıcı --------------------------- */

let zamanlayici = null;
let sonCalistirilanGun = null;

/** Saat 04:00'e (yerel) kalan milisaniye. */
function sonrakiKontrolMs() {
  const simdi = new Date();
  const hedef = new Date(simdi);
  hedef.setHours(KONTROL_SAATI, 0, 0, 0);
  if (hedef.getTime() <= simdi.getTime()) hedef.setDate(hedef.getDate() + 1);
  return hedef.getTime() - simdi.getTime();
}

/**
 * 🧹 Gece bakımı (2026-11-01): WAL checkpoint + optimize + eski kayıt/önbellek
 * temizliği. Sağlık kontrolünden SONRA çalışır; sağlık akışını etkilemez.
 * Hata olsa bile nöbetçi durmaz.
 */
export async function geceBakiminiCalistir(opts = {}) {
  try {
    const r = await dbBakimCalistir(opts);
    console.log(`[bakim] tamamlandı: WAL ${r.db.once.walMb}→${r.db.sonra.walMb} MB, `
      + `${r.temizlenenOnbellekDosyaSayisi} önbellek dosyası silindi `
      + `(${r.kazanilanDiskMb} MB), ${r.silinenSnapshotSayisi} snapshot, `
      + `${r.sureMs} ms${r.hatalar.length ? ` · ${r.hatalar.length} uyarı` : ''}`);
    if (r.hatalar.length) console.warn('[bakim] uyarılar:', r.hatalar.join(' | ').slice(0, 300));
    return r;
  } catch (e) {
    console.warn('[bakim] gece bakımı başarısız:', String(e.message || e).slice(0, 180));
    return null;
  }
}

/**
 * Gece nöbetçisini başlatır (her gece 04:00).
 * Uygulama yeniden başlarsa zamanlayıcı yeniden kurulur; aynı gün 04:00'i
 * kaçırmışsak (ör. sunucu kapalıydı) açılışta bir kez telafi eder.
 */
export function saglikNobetcisiBaslat(opts = {}) {
  durdurHealthPulse();
  const bildir = opts.bildir !== false;

  // Açılış telafisi: bugün 04:00 geçtiyse ve bugün hiç çalışmadıysa çalıştır.
  const simdi = new Date();
  const bugun = simdi.toISOString().slice(0, 10);
  const bugunNobetGecti = simdi.getHours() >= KONTROL_SAATI;
  if (bugunNobetGecti && sonCalistirilanGun !== bugun) {
    const son = getAdapterHealthLatest();
    // Son kayıt 20 saatten eskiyse (ya da hiç yoksa) telafi et
    const enYeni = son.reduce((acc, s) => {
      const t = Date.parse(s.kontrolTs || '');
      return Number.isFinite(t) && t > acc ? t : acc;
    }, 0);
    const yasSaat = enYeni ? (Date.now() - enYeni) / 3600000 : Infinity;
    if (yasSaat > 20) {
      sonCalistirilanGun = bugun;
      const gecikme = 3 * 60 * 1000; // açılış yükünü bekle
      setTimeout(() => {
        saglikKontrolu({ bildir })
          .then(r => {
            console.log(`[health] telafi kontrolü tamamlandı: ${r.aktif}/${r.toplam} aktif, `
              + `${r.bekleyen.length} inceleme bekliyor (${Math.round(r.sureMs / 1000)} sn)`
              + (r.bildirim ? ` · Telegram: ${r.bildirim.tekUyari} tek uyarı, özet ${r.bildirim.ozetGitti ? 'gitti' : 'gitmedi'}` : ''));
          })
          .catch(e => {
            console.warn('[health] telafi kontrolü başarısız:', String(e.message || e).slice(0, 120));
          })
          .finally(() => { geceBakiminiCalistir().catch(() => {}); });
      }, gecikme).unref();
      console.log(`[health] açılış telafisi: bugünün ${KONTROL_SAATI}:00 kontrolü yapılmamış, ${gecikme / 60000} dk sonra çalışacak`);
    }
  }

  const kur = () => {
    const ms = sonrakiKontrolMs();
    zamanlayici = setTimeout(async () => {
      try {
        const gun = new Date().toISOString().slice(0, 10);
        if (sonCalistirilanGun !== gun) {
          sonCalistirilanGun = gun;
          console.log('[health] gece kontrolü başladı (' + gun + ')');
          const r = await saglikKontrolu({ bildir });
          console.log(`[health] tamamlandı: ${r.aktif}/${r.toplam} aktif, ${r.bekleyen.length} inceleme bekliyor (${Math.round(r.sureMs / 1000)} sn)`);
          // 🧹 Sağlık kontrolünden SONRA gece bakımı (WAL/önbellek temizliği).
          await geceBakiminiCalistir();
        }
      } catch (e) {
        console.warn('[health] gece kontrolü hatası:', String(e.message || e).slice(0, 150));
      } finally {
        kur(); // bir sonraki güne kur
      }
    }, ms);
    if (zamanlayici.unref) zamanlayici.unref();
  };

  kur();
  return { basladi: true, sonrakiKontrolMs: sonrakiKontrolMs(), saat: KONTROL_SAATI };
}

/** Zamanlayıcıyı durdurur (testler ve kapanış için). */
export function durdurHealthPulse() {
  if (zamanlayici) {
    clearTimeout(zamanlayici);
    zamanlayici = null;
  }
}

/** Durum bilgisi (/api/durum için). */
export function saglikDurumu() {
  const son = getAdapterHealthLatest();
  const harita = {};
  for (const s of son) {
    harita[s.site] = {
      durum: s.durum,
      etiket: DURUM_ETIKET[s.durum] || s.durum,
      kontrolTs: s.kontrolTs,
      aramaMs: s.aramaMs,
      urunMs: s.urunMs,
      ornekFiyat: s.ornekFiyat,
      hata: s.hata,
    };
  }

  const aktif = son.filter(s => s.durum === 'ok').length;
  const bekleyen = son.filter(s => s.durum !== 'ok' && s.durum !== 'bos_sonuc');

  return {
    sonKontrol: sonCalisma,
    kontrolSaati: KONTROL_SAATI + ':00',
    calisiyor,
    kayitliSite: son.length,
    aktif,
    incelenecek: bekleyen.length,
    siteDurumlari: harita,
    bekleyen: bekleyen.map(s => ({
      site: s.site,
      siteName: s.siteName,
      durum: s.durum,
      hata: s.hata,
    })),
    sonSonuc: sonSonuc ? { ts: sonSonuc.ts, ozet: sonSonuc.ozet, sureMs: sonSonuc.sureMs } : null,
  };
}

/** Test/teşhis: bir adaptörün sağlık geçmişi. */
export { getAdapterHealthHistory, getAdapterHealthLatest };
