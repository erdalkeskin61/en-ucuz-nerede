/**
 * "Ne almak istiyorsun?" öneri akışı.
 *
 * Akış:
 *  1. YZ, kullanıcının cümlesinden arama sorgusu + bütçe çıkarır.
 *  2. Aday bulmak için KAYITLI TÜM SİTELER taranır (2026-10-25: yalnız 3 pazaryeri
 *     yerine tüm kayıtlı sitelerin tamamı; yerel çekim katmanları — doğrudan HTTP + yerel
 *     tarayıcı — sayesinde ek maliyeti yoktur). Sıralama: önce geniş kataloglu
 *     pazaryerleri, sonra uzman mağazalar; eşzamanlılık sınırlı tutulur.
 *  3. Bütçe filtresi uygulanır; adaylar sorguyla ilgililiklerine göre sıralanıp
 *     YZ'ye sunulur (ham HTML gitmez, toplam aday sayısı sınırlıdır).
 *  4. YZ, ihtiyaca uyan 5 FARKLI modeli seçer; her birini tek cümleyle gerekçelendirir.
 *  5. Seçilen her model için tam fiyat karşılaştırması PARALEL çalıştırılır.
 */
import { runComparison } from './pipeline.js';
import { adapters, adapterById } from './sites/index.js';
import { extractSearchQuery, selectModels } from './ai.js';
import { extractColorIntent, adayRenkDurumu } from './util.js';
import { afiliyeLink } from './afiliye.js';
import { HIZLI_SITELER } from './basketOptimizer.js';

// Tarama sırası: önce geniş kataloglu pazaryerleri (aday bulma şansı yüksek),
// sonra uzman/3D mağazaları. Tüm kayıtlı siteler taranır.
// ⚡ Hız Optimizasyonu (2026-11-01): Aday havuzu için tüm 61 site yerine geniş kataloglu
// en popüler 18 ana mağaza taranır. Süre 30 saniyeden 3-4 saniyeye düşer.
const ONCELIKLI_MAGAZALAR = [
  'trendyol', 'hepsiburada', 'amazon', 'n11', 'vatan', 'mediamarkt', 'teknosa',
  'itopya', 'incehesap', 'pazarama', 'robotistan', '3dmarketim', 'samm',
  'robitshop', 'filamentsan', 'ciceksepeti', 'pttavm', 'koctas'
];
const ARAMA_SITELERI = ONCELIKLI_MAGAZALAR.filter(id => adapters.some(a => a.id === id));

const ONERI_CACHE = new Map();
const ONERI_CACHE_TTL = 30 * 60 * 1000; // 30 dk
const SITE_BASINA_ADAY = 4;   // her site × 4 = YZ'ye gidecek aday havuzu için üst sınır hedefi
const TOPLAM_ADAY_USTU = 40;  // YZ seçimine gidecek en fazla aday (bağlam bütçesi)
const ESZAMANLI_SITE = 8;     // aynı anda en fazla bu kadar site aranır

/**
 * Renk uygunluğunun aday puanına katkısı. Kullanıcı renk belirttiyse:
 *  - birebir ton ("açık gri") en yüksek puanı alır,
 *  - aynı renk ailesi (gümüş, antrasit…) kabul edilir,
 *  - başlıkta renk yoksa ölçülemez ama dışlanmaz (ürün sayfası doğrular),
 *  - başka bir renk (kırmızı, siyah…) listeye hiç girmez.
 */
const RENK_PUAN = { tam: 3, aile: 2, bilinmiyor: 1, yok: 0 };

/** Sorgu kelimeleriyle aday başlığının ilgililik puanı (kaba, ucuz sıralama için). */
function ilgililik(baslik, sorgu) {
  const kelimeler = String(sorgu || '').toLocaleLowerCase('tr-TR').split(/\s+/).filter(w => w.length >= 3);
  if (!kelimeler.length) return 0;
  const b = String(baslik || '').toLocaleLowerCase('tr-TR');
  let puan = 0;
  for (const k of kelimeler) if (b.includes(k)) puan++;
  return puan / kelimeler.length;
}

/**
 * @param {string} ihtiyac kullanıcının kendi cümlesi
 * @param {{onProgress?: Function}} opts
 */
export async function runOneri(ihtiyac, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const startedAt = Date.now();

  const cacheKey = String(ihtiyac || '').trim().toLocaleLowerCase('tr-TR');
  const cached = ONERI_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts < ONERI_CACHE_TTL)) {
    onProgress({ faz: 'bitti', not: 'Önbellekten hazır öneriler getirildi…' });
    return cached.result;
  }

  // 1) Sorgu + bütçe çıkarma
  onProgress({ faz: 'sorgu', not: 'İhtiyaç analiz ediliyor…' });
  const queryResult = (await extractSearchQuery(ihtiyac)) || { aramaSorgusu: String(ihtiyac || '').trim().slice(0, 60), butce: null };
  const aramaSorgusu = queryResult.aramaSorgusu;
  const butce = queryResult.butce ?? null;
  if (!aramaSorgusu) throw new Error('İhtiyaç metninden arama sorgusu çıkarılamadı.');

  // Renk niyeti kullanıcının KENDİ cümlesinden çıkarılır ("açık gri" gibi tonlar dahil).
  // Sorguya değil cümleye bakılır: sorgu jeneriktir ve rengi düşürebilir.
  const renkNiyeti = extractColorIntent(ihtiyac);
  if (renkNiyeti) {
    onProgress({
      faz: 'sorgu',
      renk: renkNiyeti.metin,
      not: `Renk isteği algılandı: ${renkNiyeti.metin} — ${renkNiyeti.aile.slice(0, 4).join(', ')} tonları kabul edilecek…`,
    });
  }
  onProgress({ faz: 'arama', aramaSorgusu, butce, renk: renkNiyeti?.metin || null, siteler: Object.fromEntries(ARAMA_SITELERI.map(s => [s, { status: 'calisiyor' }])) });

  // 2) TÜM kayıtlı sitelerde arama — iş kuyruğuyla sınırlı eşzamanlılık (ESZAMANLI_SITE).
  //    Yavaş siteler (tarayıcı katmanı gerektirenler) kuyruğu blok etmez; her site
  //    bittiğinde ilerleme anında arayüze raporlanır.
  //
  //    RENK İSTEĞİ VARSA kademeli sorgu: önce "sorgu + açık gri" (birebir ton), yeterli
  //    uygun aday yoksa "sorgu + gri" (ton ailesi), o da yoksa jenerik sorgu. Ölçüm
  //    (SAMM, 2026-10-25): "pla filament" → 40 sonuçta 0 gri; "pla filament açık gri" →
  //    tam aranan ürün; "pla filament gri" → 16 gri ton. Bu yüzden renk sorguda şart.
  const aramaSorgulari = renkNiyeti
    ? [...new Set([`${aramaSorgusu} ${renkNiyeti.metin}`, `${aramaSorgusu} ${renkNiyeti.ana}`, aramaSorgusu])]
    : [aramaSorgusu];

  const aramaCtx = { spend: 0 };
  const aramaSonuclari = [];
  const siteDurumlari = Object.fromEntries(ARAMA_SITELERI.map(s => [s, { status: 'calisiyor' }]));
  const durumGuncelle = (site, bilgi) => {
    siteDurumlari[site] = bilgi;
    onProgress({ faz: 'arama', aramaSorgusu, butce, renk: renkNiyeti?.metin || null, siteler: { ...siteDurumlari } });
  };

  const siteAra = async (id) => {
    const adapter = adapterById(id);
    const toplanan = [];
    const gorulenAday = new Set();
    let kullanilanSorgu = null;
    for (const sorgu of aramaSorgulari) {
      const oncekiSayi = toplanan.length;
      let adaylar = [];
      try {
        const sureliSite = (p, ms) => new Promise((res, rej) => {
          const tm = setTimeout(() => rej(new Error('zaman aşımı')), ms);
          p.then(v => { clearTimeout(tm); res(v); }, e => { clearTimeout(tm); rej(e); });
        });
        adaylar = await sureliSite(adapter.searchProducts(sorgu, aramaCtx), 3500) || [];
      } catch (e) {
        if (!toplanan.length) throw e; // hiç sonuç yoksa hatayı yukarı taşı
        break;
      }
      kullanilanSorgu = kullanilanSorgu || sorgu;
      for (const a of adaylar) {
        if (!a?.url || gorulenAday.has(a.url)) continue;
        gorulenAday.add(a.url);
        toplanan.push(a);
      }
      if (!renkNiyeti) break; // renk isteği yok → tek sorgu yeter
      // Yeterli uygun renkli aday toplandıysa diğer sorguları denemeye gerek yok
      const uygun = toplanan.filter(a => adayRenkDurumu(a.title, renkNiyeti).durum !== 'farkli').length;
      if (uygun >= 2) break;
      // Site rengi yok sayıyorsa (renk sorgusu, jenerik sorguyla AYNI listeyi döndürdü)
      // daha fazla denemenin anlamı yok. Ama sorgu BOŞ döndüyse site katı bir arama
      // yapıyordur (ör. vatan, incehesap, robotistan "açık gri"ya 0 sonuç veriyor);
      // bu durumda daha geniş sorguya geçilmelidir.
      if (adaylar.length > 0 && toplanan.length === oncekiSayi) break;
    }
    return { site: id, adaylar: toplanan, sorgu: kullanilanSorgu, hata: null };
  };

  const kuyruk = [...ARAMA_SITELERI];
  const calisan = new Set();
  await new Promise((bitti) => {
    const siradaki = () => {
      while (calisan.size < ESZAMANLI_SITE && kuyruk.length) {
        const id = kuyruk.shift();
        calisan.add(id);
        Promise.resolve()
          .then(() => siteAra(id))
          .then((sonuc) => aramaSonuclari.push(sonuc))
          .catch((e) => aramaSonuclari.push({ site: id, adaylar: [], sorgu: aramaSorgulari[0], hata: String(e.message || e).slice(0, 200) }))
          .finally(() => {
            calisan.delete(id);
            const r = aramaSonuclari.find(x => x.site === id);
            durumGuncelle(id, { status: r?.hata ? 'hata' : 'ok', adaySayisi: r?.adaylar?.length || 0, not: r?.hata || '' });
            if (!kuyruk.length && !calisan.size) bitti();
            else siradaki();
          });
      }
      if (!kuyruk.length && !calisan.size) bitti();
    };
    siradaki();
  });

  // 3) Aday hazırlığı: bütçe filtresi + RENK filtresi + ilgililik sıralaması +
  //    site başına ve toplam aday sınırı (YZ bağlam bütçesi korunur)
  const tumAdaylar = [];
  const gorulenUrl = new Set();
  const aramaRaporu = {};
  let renkElenen = 0; // istenen renk dışı olduğu için listeden çıkarılan aday sayısı
  for (const r of aramaSonuclari) {
    let adaylar = r.adaylar;
    if (butce) {
      const filtred = adaylar.filter(a => a.price == null || (a.price != null && a.price <= butce));
      if (filtred.length) adaylar = filtred;
    }
    // Renk isteği varsa: farklı renkli adaylar ASLA listeye girmez; birebir ton ve
    // aynı renk ailesi öne alınır (puan: ilgililik + renk uygunluğu).
    const puanli = adaylar
      .filter(a => a.title && a.url && !gorulenUrl.has(a.url))
      .map(a => {
        const rd = adayRenkDurumu(a.title, renkNiyeti);
        return { a, rd, puan: ilgililik(a.title, aramaSorgusu) + (RENK_PUAN[rd.durum] ?? 0) };
      })
      .filter(x => {
        if (x.rd.durum === 'farkli') { renkElenen++; return false; }
        return true;
      });

    const sirali = puanli.sort((x, y) => y.puan - x.puan).slice(0, SITE_BASINA_ADAY);
    for (const { a, rd, puan } of sirali) {
      gorulenUrl.add(a.url);
      tumAdaylar.push({
        site: r.site,
        siteName: adapterById(r.site).name,
        title: a.title,
        price: a.price ?? null,
        url: a.url,
        puan,
        renk: rd.renk,
        renkDurumu: rd.durum,
      });
    }
    aramaRaporu[r.site] = { adaySayisi: sirali.length, hata: r.hata };
  }
  // Toplam aday üst sınırı: en ilgililikli adaylar kalır
  if (tumAdaylar.length > TOPLAM_ADAY_USTU) {
    tumAdaylar.sort((a, b) => b.puan - a.puan);
    tumAdaylar.length = TOPLAM_ADAY_USTU;
  }
  onProgress({
    faz: 'arama',
    aramaSorgusu,
    butce,
    renk: renkNiyeti?.metin || null,
    renkElenen,
    siteler: Object.fromEntries(Object.entries(aramaRaporu).map(([k, v]) => [k, { status: v.hata ? 'hata' : 'ok', adaySayisi: v.adaySayisi, not: v.hata || '' }])),
  });

  if (!tumAdaylar.length) {
    if (renkNiyeti) {
      throw new Error(`"${aramaSorgusu}" aramasında "${renkNiyeti.metin}" renginde uygun aday bulunamadı`
        + (renkElenen ? ` (${renkElenen} aday farklı renkte olduğu için elendi).` : '.')
        + ' Farklı renkte bir ürün önermemek için sonuç gösterilmiyor.');
    }
    throw new Error('"' + aramaSorgusu + '" aramasında bütçeye uyan aday ürün bulunamadı.');
  }

  // 4) YZ ile 5 model seçimi (renk isteği YZ'ye katı kural olarak verilir)
  onProgress({ faz: 'secim', adaySayisi: tumAdaylar.length, renk: renkNiyeti?.metin || null, not: 'Adaylar arasından sana uygun 3 model seçiliyor…' });
  const secimHam = await selectModels(ihtiyac, butce, tumAdaylar, renkNiyeti);
  const secim = (Array.isArray(secimHam) ? secimHam : []).slice(0, 3);

  const secilenler = [];
  const kullanilanUrl = new Set();
  for (const s of secim) {
    const aday = tumAdaylar.find(a => a.url === s.url) || null;
    if (!aday || kullanilanUrl.has(aday.url)) continue; // uydurma/tekrar url'leri ele
    kullanilanUrl.add(aday.url);
    secilenler.push({
      model: String(s.model || aday.title).slice(0, 200),
      neden: String(s.neden || '').slice(0, 400),
      kaynakSite: aday.siteName,
      kaynakSiteId: aday.site,
      url: aday.url,
      afiliyeUrl: aday.afiliyeUrl || afiliyeLink(aday.site, aday.url),
      adayFiyat: aday.price,
    });
  }
  if (!secilenler.length) throw new Error('YZ geçerli bir model seçimi yapamadı; lütfen tekrar deneyin.');

  // 5) Seçilen modeller için tam karşılaştırma — PARALEL. ScraperAPI eşzamanlılık
  //    sınırına scraper.js'teki semafor, aynı URL'ye eşzamanlı isteklere fetchPage'deki
  //    tek-uçuş deduplikasyonu saygı duyar; kredi maliyeti değişmez, süre ~3 kat düşer.
  let bitenModel = 0;
  const toplamModel = secilenler.length;

  const karsilastir = async (m, i) => {
    const ilerle = (ek = {}) => onProgress({
      faz: 'karsilastirma',
      modelNo: i,
      modelToplam: toplamModel,
      model: m.model,
      biten: bitenModel,
      renk: renkNiyeti?.metin || null,
      ...ek,
    });
    ilerle({ not: 'Fiyatlar karşılaştırılıyor…' });
    try {
      const karsilastirma = await runComparison(m.url, {
        maxCandidates: 2, siteler: HIZLI_SITELER, // öneri akışında hızlı siteler ile sınırlı
        onProgress: (siteId, info) => {
          onProgress({
            faz: 'karsilastirma',
            modelNo: i,
            modelToplam: toplamModel,
            model: m.model,
            biten: bitenModel,
            renk: renkNiyeti?.metin || null,
            site: siteId,
            siteDurum: info?.status || 'calisiyor',
            not: info?.reason || info?.note || '',
          });
        },
      });
      bitenModel++;
      ilerle({ biten: bitenModel, not: 'Bu modelin karşılaştırması tamamlandı' });
      return { ...m, hata: null, karsilastirma, istenenRenk: renkNiyeti?.metin || null, okunanRenk: karsilastirma?.kaynak?.renk || null };
    } catch (e) {
      bitenModel++;
      ilerle({ biten: bitenModel, not: 'Bu model karşılaştırılamadı: ' + String(e.message || e).slice(0, 80) });
      return { ...m, hata: String(e.message || e).slice(0, 300), karsilastirma: null, istenenRenk: renkNiyeti?.metin || null, okunanRenk: null };
    }
  };

  const oneriler = await Promise.all(secilenler.map((m, i) => karsilastir(m, i)));

  // 5b) RENK DOĞRULAMASI: seçilen ürünün sayfasından okunan GERÇEK renk istenen renk
  //     ailesine uymuyorsa o ürünü göstermek kullanıcıyı yanıltır. Bu durumda kartı
  //     yanlış renkle sunmak yerine sıradaki uygun adayla değiştirilir (en fazla 2).
  //     Uygun yedek yoksa kart "renk doğrulanamadı" notuyla dürüstçe işaretlenir.
  const renkUygun = (o) => {
    if (!renkNiyeti) return true;
    const okunan = o?.karsilastirma?.kaynak?.renk;
    if (!okunan) return true; // renk okunamadı → elimizde kanıt yok, engellemiyoruz
    return adayRenkDurumu(okunan, renkNiyeti).durum !== 'farkli';
  };

  if (renkNiyeti) {
    const kullanilan = new Set(oneriler.filter(Boolean).map(o => o.url));
    let degisim = 0;
    for (let i = 0; i < oneriler.length; i++) {
      const mevcut = oneriler[i];
      if (!mevcut || renkUygun(mevcut)) continue;
      if (degisim >= 2) { mevcut.renkUyusmuyor = true; continue; }

      // Yedek: listede olmayan, rengi istenen aileye uyan en iyi aday
      const yedek = tumAdaylar
        .filter(a => !kullanilan.has(a.url) && (a.renkDurumu === 'tam' || a.renkDurumu === 'aile'))
        .sort((a, b) => b.puan - a.puan)[0];

      if (!yedek) { mevcut.renkUyusmuyor = true; continue; }
      kullanilan.add(yedek.url);
      degisim++;
      onProgress({
        faz: 'karsilastirma',
        modelNo: i,
        modelToplam: toplamModel,
        renk: renkNiyeti.metin,
        not: `Okunan renk "${mevcut.okunanRenk}" isteğine uymadı — "${yedek.renk || renkNiyeti.metin}" renkli adayla değiştiriliyor…`,
      });
      const yeni = await karsilastir({
        model: yedek.title,
        neden: `${renkNiyeti.metin} renk isteğine uyan aday (renk doğrulaması sonrası seçildi).`,
        kaynakSite: yedek.siteName,
        kaynakSiteId: yedek.site,
        url: yedek.url,
        afiliyeUrl: yedek.afiliyeUrl || afiliyeLink(yedek.site, yedek.url),
        adayFiyat: yedek.price,
      }, i);
      if (yeni && !yeni.hata && renkUygun(yeni)) {
        oneriler[i] = { ...yeni, degistirildi: true, oncekiRenk: mevcut.okunanRenk };
      } else {
        mevcut.renkUyusmuyor = true;
      }
    }
  }

  const donus = {
    ihtiyac,
    aramaSorgusu,
    butce,
    istenenRenk: renkNiyeti ? { metin: renkNiyeti.metin, aile: renkNiyeti.aile } : null,
    renkElenen,
    aramaIstek: aramaCtx.spend,
    aramaRaporu,
    oneriler,
    ozet: {
      toplamSureMs: Date.now() - startedAt,
      toplamIstek: aramaCtx.spend + oneriler.reduce((s, o) => s + (o?.karsilastirma?.ozet?.harcananIstek || 0), 0),
    },
  };
  ONERI_CACHE.set(cacheKey, { ts: Date.now(), result: donus });
  return donus;
}
