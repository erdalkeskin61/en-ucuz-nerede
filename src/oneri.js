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
// HIZLI_SITELER geriye dönük uyumluluk için içe aktarılır (bazı testler kullanır);
// varsayılan danışman seti artık CEKIRDEK_SITELER.

// Tarama sırası: önce geniş kataloglu pazaryerleri, sonra uzman 3D mağazaları.
// ⚡ 2026-11-14: hızlı HTTP dönen 3D/filament mağazaları EN ÖNE alındı
// (porima3d, filamentdepom, kirpilab, efilament, makerpazar, sermenkreatif,
// robolinkmarket, 3dmarketim, samm, robotistan…). Bu mağazalar sağlayıcısız,
// doğrudan yanıt verdiği için aday havuzu saniyeler içinde dolar.
const ONCELIKLI_MAGAZALAR = [
  // --- Hızlı 3D / filament uzmanları (doğrudan HTTP) ---
  'porima3d', 'rfturkiye', 'filamentdepom', 'filamentmarketim', 'filamenthane', 'filamentsan',
  'filamentvakti', 'teknikfilament3d', 'robotistan', 'robolinkmarket', 'robomer',
  '3dmarketim', '3dcim', 'samm', '3dortgen', '3dteknomarket', '3dultra', 'metatechtr',
  'makerfabrika', 'makerpazar', 'sermenkreatif', 'kirpilab', 'efilament',
  'robitshop', 'robocombo', 'robotizmo', 'robotzade', 'motorobit', 'direnc',
  'hepsivar', 'mintengo', 'umr3d', 'ventatek', 'print3d', 'pusula3d',
  'rhino3dprinter', 'trendruum', 'nmosphere', 'artyteknoloji', 'teknobilsem',
  'bisiparisver', '3dprinterankara', 'antalya3dmarket', 'domirobot', 'sivasrobotik',
  // --- Geniş kataloglu pazaryerleri ---
  'trendyol', 'hepsiburada', 'amazon', 'n11', 'vatan', 'mediamarkt', 'teknosa',
  'itopya', 'incehesap', 'pazarama', 'ciceksepeti', 'pttavm', 'koctas',
];
const ARAMA_SITELERI = ONCELIKLI_MAGAZALAR.filter(id => adapters.some(a => a.id === id));

/**
 * ⚡ Danışman ADAY ARAMA havuzu (2026-11-14) — 20 mağaza.
 *
 * ÖNCEKİ DURUM: aday havuzu ~49 mağazada dolduruluyordu (8 eşzamanlı → en kötü
 * ~21 sn yalnızca arama aşamasında). Karşılaştırma ise yalnızca 8 mağazada
 * yapıldığı için 49 mağazalık arama, cevap süresini boşa uzatıyordu.
 *
 * Yeni havuz: en hızlı 12 3D/filament uzmanı + geniş kataloğlu 8 pazaryeri.
 * Bu 20 mağaza, ürün keşfi için pratikte yeterli çeşitliliği korur.
 */
export const DANISMAN_ARAMA_SITELERI = Object.freeze([
  // 3D / filament uzmanları (doğrudan HTTP, hızlı)
  'porima3d', 'filamentdepom', 'filamentmarketim', 'kirpilab', 'efilament',
  'makerpazar', 'sermenkreatif', 'robolinkmarket', '3dmarketim', 'samm',
  'robotistan', '3dcim',
  // Geniş kataloglu pazaryerleri
  'trendyol', 'hepsiburada', 'n11', 'amazon', 'vatan', 'itopya', 'incehesap', 'pazarama',
].filter(id => adapters.some(a => a.id === id)));

/**
 * 🤖 Danışman akışında kullanılan ÇEKİRDEK mağaza seti (2026-11-14).
 *
 * NEDEN: Her model için ~30 mağaza taranınca AI sınıflandırmaları
 * MAX_AI_CONCURRENT=2 semaforunda kuyruğa giriyor ve ekrana hiçbir kısmi
 * sonuç akmıyordu. Çekirdek set = en yüksek kapsama + en hızlı yanıt veren
 * 12 mağaza. Kullanıcı isterse kart üzerinden "68 mağazada tara" ile tam
 * karşılaştırmayı tetikleyebilir.
 */
export const CEKIRDEK_SITELER = Object.freeze([
  'trendyol', 'hepsiburada', 'n11', 'robotistan', 'porima3d',
  'filamentmarketim', '3dmarketim', '3dcim', 'samm', 'robolinkmarket',
  'filamentdepom', 'robitshop',
]);

/**
 * ⚡ Danışman akışının VARSAYILAN (hızlı) mağaza seti — 2026-11-14.
 *
 * Ölçüm: 12 mağaza × 3-5 model = 70 sn'ye kadar çıkıyordu; kullanıcı bu süre
 * boyunca bekliyordu. En hızlı yanıt veren 8 mağaza ilk turda taranır; kart
 * üzerindeki "68 mağazada tam tara" düğmesi aynı ürün için tam karşılaştırmayı
 * (CEKIRDEK_SITELER / tüm siteler) başlatır. Böylece ilk cevap hızlı, derinlik
 * isteğe bağlı olur — taranan mağaza sayısı kartta AÇIKÇA yazar.
 */
export const CEKIRDEK_HIZLI_SITELER = Object.freeze([
  'trendyol', 'hepsiburada', 'n11', 'porima3d',
  'filamentmarketim', 'robotistan', '3dmarketim', '3dcim',
]);

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

  // 🛑 2026-11-14: iptal kontrolü. Kullanıcı "Durdur" derse akış her aşama
  // sınırında durur; aşağıdaki ağır işler (site taraması, LLM) boşa sürmez.
  const iptalMi = () => !!opts.signal?.aborted;
  const iptalHatasi = () => {
    const e = new Error('Tarama kullanıcı tarafından durduruldu');
    e.iptal = true;
    return e;
  };

  const cacheKey = String(ihtiyac || '').trim().toLocaleLowerCase('tr-TR');
  const cached = ONERI_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts < ONERI_CACHE_TTL)) {
    onProgress({ faz: 'bitti', not: 'Önbellekten hazır öneriler getirildi…' });
    return cached.result;
  }

  // 1) Sorgu + bütçe çıkarma
  onProgress({ faz: 'sorgu', not: 'İhtiyaç analiz ediliyor…' });
  const queryResult = (await extractSearchQuery(ihtiyac)) || { aramaSorgusu: String(ihtiyac || '').trim().slice(0, 60), butce: null };
  if (iptalMi()) throw iptalHatasi();
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
  // ⚡ Aday arama havuzu: danışman için 20 mağaza (ARAMA_SITELERI ~49 değil).
  // Çağıran `opts.aramaSiteleri` ile daraltabilir; varsayılan hızlı havuzdur.
  const ARAMA_HAVUZU = Array.isArray(opts.aramaSiteleri) && opts.aramaSiteleri.length
    ? opts.aramaSiteleri.filter(id => adapterById(id))
    : [...DANISMAN_ARAMA_SITELERI];
  onProgress({ faz: 'arama', aramaSorgusu, butce, renk: renkNiyeti?.metin || null, siteler: Object.fromEntries(ARAMA_HAVUZU.map(s => [s, { status: 'calisiyor' }])) });

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
  const siteDurumlari = Object.fromEntries(ARAMA_HAVUZU.map(s => [s, { status: 'calisiyor' }]));
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
      if (iptalMi()) break; // kullanıcı durdurdu → yeni sorgu/site denemesi yok
      const oncekiSayi = toplanan.length;
      let adaylar = [];
      try {
        // 🛑 2026-11-14: AbortController yayılımı — zaman aşımı/iptalde altındaki
        // fetch ve tarayıcı isteği de durdurulur (zombi istek birikmez).
        const siteIptal = new AbortController();
        const sureliSite = (p, ms) => new Promise((res, rej) => {
          let bitti = false;
          const bitir = (fn, v) => { if (bitti) return; bitti = true; clearTimeout(tm); fn(v); };
          const tm = setTimeout(() => {
            try { siteIptal.abort(); } catch { /* yoksay */ }
            bitir(rej, new Error('zaman aşımı'));
          }, ms);
          p.then(v => bitir(res, v), e => bitir(rej, e));
        });
        adaylar = await sureliSite(
          adapter.searchProducts(sorgu, { spend: 0, signal: siteIptal.signal }),
          3500,
        ) || [];
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

  const kuyruk = [...ARAMA_HAVUZU];
  const calisan = new Set();
  await new Promise((bitti) => {
    const siradaki = () => {
      if (iptalMi()) kuyruk.length = 0; // iptal → bekleyen siteleri başlatma
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

  if (iptalMi()) throw iptalHatasi();

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

  // 5) Seçilen modeller için karşılaştırma — hızlı çekirdek + kısmi akış.
  //
  //    2026-11-14 mimari değişikliği:
  //    • HIZLI_SITELER (~30 mağaza) yerine HIZLI çekirdek (8 mağaza) taranır;
  //      `opts.tam` istenirse 12 mağazalık tam çekirdek. Kartta kaç mağazanın
  //      tarandığı yazar ve "68 mağazada tam tara" bağlantısı sunulur.
  //    • Modeller KONTROLLÜ eşzamanlılıkla (3) işlenir; her model bitince
  //      `modelTamamlandi` olayı ile kart ANINDA akıtılır.
  //    • 75 sn toplam watchdog: süre dolarsa tamamlananlar kısmi sonuç olarak döner.
  let bitenModel = 0;
  const toplamModel = secilenler.length;
  const MODEL_ESZAMANLI = 3;
  const WATCHDOG_MS = Number.isFinite(opts.watchdogMs) && opts.watchdogMs > 0
    ? Number(opts.watchdogMs) : 75000;
  // Tarama kapsamı: `opts.tam` tam set, `opts.siteler` özel set, yoksa hızlı çekirdek.
  const karsilastirmaSiteleri = opts.tam === true
    ? CEKIRDEK_SITELER
    : (Array.isArray(opts.siteler) && opts.siteler.length ? opts.siteler : CEKIRDEK_HIZLI_SITELER);
  const watchdogBaslangic = Date.now();
  let watchdogDoldu = false;
  const kismiSonuclar = [];

  const karsilastir = async (m, i) => {
    if (watchdogDoldu) {
      bitenModel++;
      return { ...m, hata: 'watchdog: süre doldu', karsilastirma: null, kismi: true };
    }
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
        // Site başına 2 aday: 1 adayla bazı mağazalarda yanlış eşleşme elenince
        // ürün "bulunamadı" kalıyordu (fiyat dürüstlüğü aday sayısından önemli).
        maxCandidates: 2,
        siteler: karsilastirmaSiteleri,
        // 🛑 Kullanıcı "Durdur" derse altındaki fetch'ler de iptal olur.
        ...(opts.signal ? { signal: opts.signal } : {}),
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
      const sonuc = {
        ...m, hata: null, karsilastirma,
        istenenRenk: renkNiyeti?.metin || null,
        okunanRenk: karsilastirma?.kaynak?.renk || null,
      };
      kismiSonuclar.push(sonuc);
      // ⚡ Kısmi akış: kart beklemeden ekrana düşsün.
      // Yalnızca hafif bir özet gönderilir (SSE gövdesi şişmesin).
      ilerle({
        biten: bitenModel,
        modelTamamlandi: true,
        modelSonuc: {
          model: sonuc.model,
          url: sonuc.url || null,
          fiyat: karsilastirma?.ozet?.enUcuzFiyat ?? null,
          site: karsilastirma?.ozet?.enUcuzSite || null,
        },
        not: 'Bu modelin karşılaştırması tamamlandı',
      });
      return sonuc;
    } catch (e) {
      bitenModel++;
      ilerle({ biten: bitenModel, not: 'Bu model karşılaştırılamadı: ' + String(e.message || e).slice(0, 80) });
      return { ...m, hata: String(e.message || e).slice(0, 300), karsilastirma: null, istenenRenk: renkNiyeti?.metin || null, okunanRenk: null };
    }
  };

  // Kontrollü eşzamanlılık: aynı anda en fazla MODEL_ESZAMANLI model.
  const oneriler = new Array(secilenler.length).fill(null);
  let imlec = 0;
  const isci = async () => {
    while (true) {
      if (opts.signal?.aborted) return; // kullanıcı durdurdu → yeni model başlatma
      const i = imlec++;
      if (i >= secilenler.length) return;
      if (Date.now() - watchdogBaslangic > WATCHDOG_MS) {
        watchdogDoldu = true;
        onProgress({ faz: 'karsilastirma', watchdog: true, not: 'Süre sınırı doldu — tamamlanan sonuçlar gösteriliyor.' });
      }
      oneriler[i] = await karsilastir(secilenler[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MODEL_ESZAMANLI, secilenler.length) }, () => isci()));

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
    oneriler: oneriler.filter(Boolean),
    // 🔎 Dürüstlük: kaç mağazanın tarandığını istemciye AÇIKÇA bildir.
    kapsam: {
      tarananSite: karsilastirmaSiteleri.length,
      toplamSite: adapters.length,
      siteler: [...karsilastirmaSiteleri],
    },
    // 🛡️ 2026-11-14: watchdog dolduysa kısmi sonuç — istemci bunu açıkça gösterir.
    kismi: watchdogDoldu || !!opts.signal?.aborted,
    iptalEdildi: !!opts.signal?.aborted,
    tamamlananModel: oneriler.filter(o => o && !o.hata).length,
    ozet: {
      toplamSureMs: Date.now() - startedAt,
      toplamIstek: aramaCtx.spend + oneriler.reduce((s, o) => s + (o?.karsilastirma?.ozet?.harcananIstek || 0), 0),
    },
  };
  ONERI_CACHE.set(cacheKey, { ts: Date.now(), result: donus });
  return donus;
}
