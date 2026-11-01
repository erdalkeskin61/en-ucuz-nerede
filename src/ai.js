/**
 * Kampanya metni sınıflandırıcı (YZ).
 *
 * Kurallar (kullanıcı isteği):
 *  - Ham HTML asla YZ'ye gönderilmez; yalnızca sayfadan çıkarılmış kampanya metinleri ve
 *    minimal ürün bağlamı (başlık, fiyat alanları) gönderilir.
 *  - Herkesin alabileceği indirimler fiyata dahil edilir; uygulamaya, üyeliğe, karta ya da
 *    sepet tutarına bağlı olanlar koşullu olarak ayrı gösterilir.
 *  - Taksit indirimi sayılmaz; sitenin fiyata yansıtmış olduğu indirim ikinci kez düşürülmez.
 */
import { config } from './config.js';

const SYSTEM_PROMPT = `Sen bir Türkçe e-ticaret kampanya sınıflandırıcısın. Alışveriş sitesi ürün sayfalarından çıkarılmış kampanya/indirim metinlerini sınıflandırıyorsun.

Her kampanya metni için şu JSON nesnesini üret:
{
  "metin": "kampanya metni (olduğu gibi)",
  "tur": "herkes" | "kosullu" | "taksit" | "bilgi",
  "kosul": null | "uygulama" | "uyelik" | "karti" | "kupon" | "sepet_tutari" | "diger",
  "kosul_aciklamasi": "koşulu varsa Türkçe kısa açıklama, yoksa null",
  "kodu": "kupon kodu varsa kod (ör. TEKNO10, YAZ20), yoksa null",
  "fiyata_dahil": true | false,
  "indirim": null | { "tip": "yuzde" | "tutar", "deger": sayı },
  "not": "gerekliyse kısa Türkçe not, yoksa null"
}

SINIFLANDIRMA KURALLARI:
1. "tur" değerleri:
   - "herkes": Sepette indirim ("Sepette %5"), herkesin alabileceği, ek koşulu olmayan indirimler. Banka kartı, uygulama, üyelik veya tutar şartı YOK.
   - "kosullu": Uygulamaya özel ("Uygulamaya özel fiyat"), üyeliğe özel ("Smile üyelere", "üyelere özel"), belirli banka/karta özel ("X Bank kartına %10", "taksitli alımda"), kupon kodu gerektiren ("KUPON: YAZ20 ile %10", "X kuponu ile 250 TL indirim"), sepet tutarına bağlı ("500 TL üzeri sepette geçerli") indirimler.
   - "taksit": Taksit/vade bilgileri ("12 taksit", "vade farkısız", "3 taksit fırsatı"). Bunlar asla indirim sayılmaz.
   - "bilgi": Kargo bilgisi, stok bilgisi, puan/kullanım bilgisi gibi fiyat etkisi olmayan metinler.
2. "kosul" değerleri:
   - "kupon": Kampanya bir KUPON KODU girilerek kullanılıyorsa (metinde "kupon", "kupon kodu", "KUPON:" geçiyor ve bir kod varsa). Kupon kodu metinde geçiyorsa "kodu" alanına BÜYÜK HARFLERLE yaz.
   - "karti": Banka/kart kampanyaları. "uygulama": uygulamaya özel. "uyelik": üyelik programı. "sepet_tutari": sepette belirli tutar üstü. "diger": diğer koşullar.
   - Kupon kodu gerektiren kampanya aynı zamanda uygulamaya özel olsa bile "kupon" kullan (koşul açıklamasında uygulamadan bahset).
3. "fiyata_dahil": İndirim, sitenin ürün sayfasında zaten gösterilen satış fiyatına yansıtılmışsa true. Örneğin sayfa "Sepette %5" rozetiyle indirimli fiyatı zaten gösteriyorsa true. Emin değilsen TRUE de (indirimi ikinci kez düşürmemek için). Koşullu ve kupon kampanyalarında genelde false olur.
4. "indirim": Metinden net bir yüzde veya tutar çıkarılabiliyorsa doldur ("Sepette %5" -> {"tip":"yuzde","deger":5}; "250 TL indirim" -> {"tip":"tutar","deger":250}); çıkarılamıyorsa null.
5. Kargo ücreti/bedava kargo metinleri "bilgi" olarak sınıflanır; kargo fiyatı uygulamada ayrı işlenir.
6. Yanıtında SADECE geçerli JSON dizisi olmalı; açıklama, yorum, kod bloğu yazma.`;


// EVREN LLM eşzamanlılık sınırı (hesap limiti 4; güvenli tavan 2)
const MAX_AI_CONCURRENT = 2;
let aiInFlight = 0;
const aiWaitQueue = [];

function acquireAiSlot() {
  return new Promise((resolve) => {
    if (aiInFlight < MAX_AI_CONCURRENT) {
      aiInFlight++;
      resolve();
    } else {
      aiWaitQueue.push(resolve);
    }
  });
}

function releaseAiSlot() {
  aiInFlight--;
  const next = aiWaitQueue.shift();
  if (next) {
    aiInFlight++;
    next();
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function chatOnce(messages, opts = {}) {
  const { temperature = 0, maxTokens = 4000 } = opts;
  await acquireAiSlot();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      try {
        const res = await fetch(config.ai.baseURL + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.apiKey },
          body: JSON.stringify({ model: config.ai.model, messages, temperature, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        if (res.status === 429 && attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error('YZ API HTTP ' + res.status + ': ' + t.slice(0, 200));
        }
        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        return msg?.content || msg?.reasoning || '';
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('YZ API 429 eşzamanlılık sınırı aşıldı');
  } finally {
    releaseAiSlot();
  }
}

function extractJsonArray(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Sınıflandırma önbelleği: aynı girdi (site + başlık + fiyatlar + kampanyalar)
// her zaman aynı sonucu verir; tekrarlayan karşılaştırmalarda ve indirim botunun
// günlük kontrollerinde LLM çağrısı atlanır. Bellek içi, sınırlı boyutlu.
const CLASS_CACHE = new Map();
const CLASS_CACHE_MAX = 500;
function classCacheKey(input) {
  return [input.site, input.urunBasligi, input.fiyatlar?.etiket ?? '', input.fiyatlar?.satis ?? '',
    ...(input.kampanyalar || []).filter(Boolean).map(s => String(s).trim())].join('|');
}

/**
 * Kampanya metinlerini sınıflandırır.
 * @param {{site:string, urunBasligi:string, fiyatlar:{etiket?:number, satis?:number}, kampanyalar:string[]}} input
 * @returns {Promise<Array>} sınıflandırılmış kampanya listesi
 */
export async function classifyCampaigns(input) {
  const campaigns = (input.kampanyalar || []).filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  if (campaigns.length === 0) return [];
  if (!config.ai.apiKey) {
    // YZ anahtarı yoksa sınıflandırma yapılamaz; metinler "bilgi" olarak işaretlenir (uydurma veri yok).
    return campaigns.map(m => ({ metin: m, tur: 'bilgi', kosul: null, kosul_aciklamasi: null, fiyata_dahil: true, indirim: null, not: 'Sınıflandırılamadı: YZ anahtarı tanımsız' }));
  }

  // Önbellekte varsa LLM çağrısı yapılmaz (aynı girdi -> aynı sonuç)
  const key = classCacheKey(input);
  if (CLASS_CACHE.has(key)) {
    const hit = CLASS_CACHE.get(key);
    CLASS_CACHE.delete(key);
    CLASS_CACHE.set(key, hit); // LRU: en son kullanılanı sona taşı
    return hit;
  }

  const userMsg =
    'Site: ' + input.site + '\n' +
    'Ürün başlığı: ' + input.urunBasligi + '\n' +
    'Fiyat alanları: ' + JSON.stringify({ etiket: input.fiyatlar?.etiket ?? null, satis: input.fiyatlar?.satis ?? null }) + '\n' +
    'Kampanya metinleri:\n' + JSON.stringify(campaigns, null, 2) + '\n\n' +
    'Her kampanya metni için kurallara göre JSON nesnesi üret; yanıt sadece JSON dizisi olsun.';

  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await chatOnce(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg + (i > 0 ? '\n\n(Önemli: Yanıtın geçerli JSON olmalıydı. Lütfen SADECE geçerli bir JSON dizisi döndür.)' : '') },
        ],
        { temperature: 0 },
      );
      const arr = extractJsonArray(raw);
      if (Array.isArray(arr) && arr.length) {
        // Önbelleğe al (başarılı sonuçlar; başarısızlık önbelleğe alınmaz, sonraki sefer tekrar denenir)
        if (CLASS_CACHE.size >= CLASS_CACHE_MAX) {
          const ilk = CLASS_CACHE.keys().next().value;
          CLASS_CACHE.delete(ilk);
        }
        CLASS_CACHE.set(key, arr);
        return arr;
      }
      lastErr = new Error('YZ yanıtı JSON olarak ayrıştırılamadı.');
    } catch (e) {
      lastErr = e;
    }
  }
  // Sınıflandırma başarısız: metinleri "bilgi" olarak döndür, hata mesajıyla işaretle.
  return campaigns.map(m => ({ metin: m, tur: 'bilgi', kosul: null, kosul_aciklamasi: null, fiyata_dahil: true, indirim: null, not: 'Sınıflandırılamadı: ' + (lastErr?.message || 'bilinmeyen hata').slice(0, 100) }));
}

// ---- Site geneli kampanya / kupon çözümleyici ----

// Toplu tarama sırasında YZ'ye çok paralel istek gitmesin: sağlayıcı yük altında
// yavaşlıyor ve yanıtı kesiyor. Ürün sınıflandırması (karşılaştırma sırasında
// hız için paralel çalışır) bu kuyruğa DAHİL DEĞİLDİR — yalnız toplu kampanya
// çözümlemesi sınırlanır.
let topluAktif = 0;
const topluKuyruk = [];
const TOPLU_ESZAMANLI = 2;
function topluSlotAl() {
  return new Promise((coz) => {
    if (topluAktif < TOPLU_ESZAMANLI) { topluAktif++; coz(); }
    else topluKuyruk.push(coz);
  });
}
function topluSlotBirak() {
  topluAktif--;
  const s = topluKuyruk.shift();
  if (s) { topluAktif++; s(); }
}

const SITE_OFFER_SYSTEM = `Türkçe e-ticaret kampanya çözümleyicisi. Verilen cümlelerden gerçek fırsatları JSON dizisi olarak çıkar.

Her öğe:
{"metin":"kısa özet","kapsam":"site"|"kategori"|"uyelik"|"uygulama"|"kart"|"belirsiz","kategori":"tek sözcük"|null,"minSepet":sayı|null,"indirim":{"tip":"yuzde"|"tutar","deger":sayı},"kodu":"KOD"|null,"bitis":"YYYY-MM-DD"|null,"guven":"yuksek"|"orta"|"dusuk"}

Kurallar:
- Yalnız metinde açıkça yazan fırsatları çıkar; indirim/kod/tarih uydurma. Emin değilsen o öğeyi hiç yazma. Uygun fırsat yoksa [].
- kapsam: "site"=tüm ürünler/alışverişler; "kategori"=seçili ürünler veya bir ürün grubu; "uyelik"=üyelik programı; "uygulama"=mobil uygulama; "kart"=banka kartı; "belirsiz"=anlaşılmıyor.
- "500 TL üzeri 50 TL indirim" → minSepet:500, indirim:{tip:"tutar",deger:50}.
- Kargo cümlelerini hiç üretme. kod yoksa null ("Kupon Fırsatı" kod değildir).
- Ürün listeleme/kart fiyatlarını fırsat SANMA: "sepette 1.785,11 TL", "sepette 187,16 TL 197,01 TL" gibi ifadeler ürün FİYATIDIR, indirim değildir → üretme.
- Ödeme yöntemine bağlı ifadeleri (havale, EFT, tek çekim) metinde belirt; bunlar herkese uygulanmaz.
- Sadece JSON dizisi döndür; açıklama yazma.`;

/** Site kampanya sayfasından çıkarılan cümleleri yapılandırılmış fırsatlara çevirir. */
export async function classifySiteOffers(input) {
  const cumleler = (input.cumleler || []).filter(Boolean).slice(0, 18);
  if (!cumleler.length) return [];
  if (!config.ai.apiKey) return [];

  // Küçük gruplar hâlinde çözümle: uzun listelerde YZ yanıtı kesilebiliyor
  // (JSON yarım kalır). Bir grup başarısız olursa diğerleri yine işlenir.
  const GRUP = 6;
  const gruplar = [];
  for (let i = 0; i < cumleler.length; i += GRUP) gruplar.push(cumleler.slice(i, i + GRUP));

  const sonuc = [];
  const hatalar = [];
  for (const grup of gruplar) {
    const userMsg =
      'Site: ' + input.site + '\n' +
      'Cümleler:\n' + JSON.stringify(grup, null, 2) + '\n\n' +
      'Kurallara göre yalnız gerçek, net fırsatları JSON dizisi olarak döndür.';
    let basarili = false;
    for (let deneme = 0; deneme < 2 && !basarili; deneme++) {
      await topluSlotAl();
      try {
        const raw = await chatOnce(
          [
            { role: 'system', content: SITE_OFFER_SYSTEM },
            { role: 'user', content: userMsg + (deneme > 0 ? '\n\n(Önemli: yalnızca geçerli ve TAM JSON dizisi döndür.)' : '') },
          ],
          { temperature: 0, maxTokens: 4000 },
        );
        const arr = extractJsonArray(raw);
        if (Array.isArray(arr)) {
          // Aynı fırsat farklı grupta tekrar gelirse bir kez tut
          for (const k of arr) {
            const anahtar = String(k?.metin || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').slice(0, 60);
            if (anahtar && !sonuc.some(x => String(x?.metin || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').slice(0, 60) === anahtar)) {
              sonuc.push(k);
            }
          }
          basarili = true;
        } else {
          hatalar.push('JSON ayrıştırılamadı');
        }
      } catch (e) {
        hatalar.push(String(e.message || e).slice(0, 60));
      } finally {
        topluSlotBirak();
      }
    }
  }
  // Hiçbir grup işlenemediyse hata bildir (site kaydı eski veriyle korunur)
  if (!sonuc.length && hatalar.length) {
    throw new Error('Kampanya çözümlemesi başarısız: ' + hatalar[0]);
  }
  return sonuc;
}

// ---- "Ne almak istiyorsun?" öneri akışı ----
const QUERY_SYSTEM = `Sen bir e-ticaret arama asistanısın. Kullanıcının serbest metin olarak yazdığı ihtiyaçtan, Türkiye'deki alışveriş sitelerinde kullanılacak bir ARAMA SORGUSU ve varsa BÜTÇE çıkarırsın.
Yanıtında SADECE şu JSON olmalı:
{"aramaSorgusu": "...", "butce": null}
Kurallar:
- aramaSorgusu: 2-4 kelimelik, Türkçe, jenerik ürün adı (ör. "kablosuz kulaklık", "koşu ayakkabısı"). Kullanıcı marka belirttiyse markayı da içersin. Site arama motoruna uygun, sade bir ifade olsun; "bütçem", "spor için" gibi niyet ifadelerini İÇERMESİN.
- butce: "3.000 TL", "3000 tl" gibi ifadelerden sayı (3000). Bütçe belirtilmemişse null.
- Yanıtta açıklama, kod bloğu yok; yalnızca JSON.`;

/** İhtiyaç metninden arama sorgusu ve bütçe çıkarır. */
const QUERY_CACHE = new Map();
const QUERY_LLM_TIMEOUT_MS = 6000;
const SORGU_DOLGU = new Set(['bana', 'benim', 'bir', 'bu', 'şu', 'icin', 'için', 'almak', 'alacağım', 'alacagim', 'istiyorum', 'arıyorum', 'ariyorum', 'öner', 'oner', 'misin', 'mısın', 'lazım', 'lazim', 'gerekiyor', 'bütçem', 'butcem', 'bütçe', 'butce', 'en', 'iyi', 'güzel', 'guzel', 'uygun', 'ile', 've', 'veya', 'bi', 'tavsiye', 'civarı', 'civari', 'altı', 'alti', 'kadar', 'max', 'tl', 'lira']);
const BUTCE_RE = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(bin\s*)?(?:tl|₺|lira)(?![\p{L}])/giu;

/** Hızlı, YZ'siz yedek: bütçeyi regex ile, sorguyu dolgu sözcüklerini atarak çıkarır. */
function kuralTabanliSorgu(ihtiyac) {
  const metin = String(ihtiyac || '').trim();
  let butce = null;
  const m = [...metin.matchAll(BUTCE_RE)][0];
  if (m) {
    const sayi = parseFloat(String(m[1]).replace(/[.\s]/g, '').replace(',', '.'));
    if (isFinite(sayi)) butce = m[2] ? sayi * 1000 : sayi;
  }
  const temiz = metin.replace(BUTCE_RE, ' ').replace(/[^\p{L}\p{N}+\s-]/gu, ' ');
  const kelimeler = temiz.split(/\s+/).filter(w => w && !SORGU_DOLGU.has(w.toLocaleLowerCase('tr-TR')));
  const aramaSorgusu = (kelimeler.slice(0, 4).join(' ') || metin.slice(0, 60)).trim();
  return { aramaSorgusu, butce };
}

export async function extractSearchQuery(ihtiyac) {
  const anahtar = String(ihtiyac || '').trim().toLocaleLowerCase('tr-TR');
  if (QUERY_CACHE.has(anahtar)) return QUERY_CACHE.get(anahtar);

  // YZ yavaşsa (muhakeme modeli) kullanıcı bekletilmez: kısa sürede cevap gelmezse
  // kural tabanlı sorguyla devam edilir.
  let raw;
  try {
    raw = await Promise.race([
      chatOnce(
        [
          { role: 'system', content: QUERY_SYSTEM },
          { role: 'user', content: String(ihtiyac || '').slice(0, 1000) },
        ],
        { temperature: 0, maxTokens: 1500 },
      ),
      new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), QUERY_LLM_TIMEOUT_MS)),
    ]);
  } catch {
    return kuralTabanliSorgu(ihtiyac);
  }
  try {
    const t = String(raw || '').replace(/```(?:json)?/gi, '').trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return { aramaSorgusu: String(ihtiyac || '').trim().slice(0, 60), butce: null };
    }
    const d = JSON.parse(t.slice(start, end + 1));
    if (!d || typeof d !== 'object') {
      return { aramaSorgusu: String(ihtiyac || '').trim().slice(0, 60), butce: null };
    }
    const sonuc = {
      aramaSorgusu: String(d.aramaSorgusu || '').trim(),
      butce: d.butce != null && isFinite(Number(d.butce)) ? Number(d.butce) : null,
    };
    if (sonuc.aramaSorgusu) {
      if (QUERY_CACHE.size > 200) QUERY_CACHE.delete(QUERY_CACHE.keys().next().value);
      QUERY_CACHE.set(anahtar, sonuc);
    }
    return sonuc;
  } catch {
    // YZ başarısızsa kaba düşme: metnin kendisini sorgu yap
    return { aramaSorgusu: String(ihtiyac || '').trim().slice(0, 60), butce: null };
  }
}

const SECIM_SYSTEM = `Sen bir ürün öneri asistanısın. Kullanıcının ihtiyacını ve alışveriş sitelerinden gelen aday ürün listesini alır, ihtiyaca en uygun 5 FARKLI modeli seçersin.
Yanıtında SADECE şu biçimde bir JSON dizisi olmalı:
[{"url": "<adayın url'si HARFI HARFINE aynen>", "model": "<model / ürün adı>", "neden": "<tek cümle öneri gerekçesi>"}]
Kurallar:
- 5 FARKLI MODEL seç: aynı ürünün farklı sitelerdeki/listelerdeki tekrarları TEK model sayılır; benzersiz modeller seç.
- "url" alanı yalnızca aday listesinde geçen bir url olabilir; uydurma url yazma.
- "neden" tek cümle olmalı ve ürünün başlığındaki somut özelliklere dayanmalı (bağlantı türü, pil ömrü, su/gecirgenlik, gürültü engelleme, marka, ekran, kapasite vb.).
- Bütçe verilmişse fiyatı bütçeyi aşan adayları seçme.
- Kullanıcının kullanım amacına (spor, ofis, oyun vb.) en uygun özellikleri öne çıkar.
- Yanıtta açıklama yok; yalnızca JSON dizisi.`;

/** Renk isteği varsa seçim istemine eklenen katı kural bloğu. */
function renkKurali(renkNiyeti) {
  if (!renkNiyeti) return '';
  const aile = (renkNiyeti.aile || []).slice(0, 8).join(', ');
  return '\n\nRENK ŞARTI (kesin): Kullanıcı "' + renkNiyeti.metin + '" rengini istedi.'
    + ' Yalnızca bu rengi taşıyan ya da aynı renk ailesinden (' + aile + ') modelleri seç.'
    + ' Farklı renkli (ör. kırmızı, siyah, mavi) bir ürünü ASLA seçme; renk uymuyorsa o adayı atla.'
    + ' Aday listesinde [renk: ...] etiketi verilmiştir; "uygun" etiketli adayları tercih et.'
    + ' "renk yok" etiketli adayı yalnızca uygun renkli yeterli aday yoksa seç.';
}

/**
 * Aday ürünlerden ihtiyaca uyan 5 modeli seçtirir.
 * @param {string} ihtiyac kullanıcının kendi cümlesi
 * @param {number|null} butce
 * @param {Array<{site:string, title:string, price:number|null, url:string, renk?:string|null, renkDurumu?:string}>} adaylar
 * @param {object|null} renkNiyeti extractColorIntent çıktısı (renk istenmediyse null)
 */
export async function selectModels(ihtiyac, butce, adaylar, renkNiyeti = null) {
  const RENK_ETIKET = {
    tam: 'uygun (birebir ton)',
    aile: 'uygun (aynı renk ailesi)',
    bilinmiyor: 'renk yok',
    yok: 'renk yok',
    farkli: 'FARKLI RENK',
  };
  const listText = adaylar.map((a, i) => {
    const etiket = renkNiyeti ? ' [renk: ' + (a.renk ? a.renk + ', ' : '') + (RENK_ETIKET[a.renkDurumu] || 'renk yok') + ']' : '';
    return `${i + 1}. [${a.site}] ${a.title} — ${a.price != null ? a.price + ' TL' : 'fiyat bilinmiyor'}${etiket} — ${a.url}`;
  }).join('\n');
  const userMsg =
    'Kullanıcının ihtiyacı: ' + ihtiyac + '\n' +
    'Bütçe: ' + (butce != null ? butce + ' TL' : 'belirtilmemiş') + '\n' +
    (renkNiyeti ? 'İstenen renk: ' + renkNiyeti.metin + '\n' : '') + '\n' +
    'Aday ürünler (sıra, site, başlık, fiyat, renk durumu, url):\n' + listText;
  const sistem = SECIM_SYSTEM + renkKurali(renkNiyeti);
  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await chatOnce(
        [
          { role: 'system', content: sistem },
          { role: 'user', content: userMsg + (i > 0 ? '\n\n(Önemli: yalnızca aday listesindeki url\'leri kullan ve SADECE geçerli JSON döndür.)' : '') },
        ],
        { temperature: 0.2 },
      );
      const t = raw.replace(/```(?:json)?/gi, '').trim();
      const start = t.indexOf('[');
      const end = t.lastIndexOf(']');
      const arr = JSON.parse(t.slice(start, end + 1));
      if (Array.isArray(arr)) return arr.slice(0, 5);
      lastErr = new Error('YZ yanıtı dizi değil');
    } catch (e) {
      lastErr = e;
    }
  }
    console.warn('[ai:selectModels] YZ model seçimi zaman aşımı veya hata, kural tabanlı yedeğe geçiliyor:', lastErr?.message);
  const siraliAdaylar = (adaylar || [])
    .filter(a => a && a.url && a.title)
    .sort((a, b) => {
      const renkSkor = x => (x.renkDurumu === 'tam' ? 2 : (x.renkDurumu === 'aile' ? 1 : 0));
      const fRenk = renkSkor(b) - renkSkor(a);
      if (fRenk !== 0) return fRenk;
      if (butce != null && a.price != null && b.price != null) {
        const uyA = a.price <= butce ? 1 : 0;
        const uyB = b.price <= butce ? 1 : 0;
        if (uyB !== uyA) return uyB - uyA;
      }
      return (a.price || Infinity) - (b.price || Infinity);
    })
    .slice(0, 5);

  if (siraliAdaylar.length > 0) {
    return siraliAdaylar.map(a => ({
      url: a.url,
      model: a.title,
      neden: (a.site || 'Mağaza') + ' üzerinde ' + (a.price ? a.price + ' TL ile ' : '') + 'aradığınız kriterlere en uygun seçeneklerden biridir.',
    }));
  }

  throw new Error('Model seçimi yapılamadı: ' + (lastErr?.message || 'Aday ürün bulunamadı').slice(0, 120));
}

// ===

// ==================== SEMANTİK EŞLEŞTİRME (MatchGPT) ====================
const semanticMatchCache = new Map();
const MATCH_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 saat

function matchCacheKey(a, b) {
  const normA = (a.title || a.name || '') + '|' + (a.brand || '') + '|' + (a.modelCode || '');
  const normB = (b.title || b.name || '') + '|' + (b.brand || '') + '|' + (b.modelCode || '');
  return [normA.toLowerCase().trim(), normB.toLowerCase().trim()].sort().join(' <==> ');
}

/**
 * İki ürünün aynı fiziksel ürün olup olmadığını EVREN LLM (DeepSeek-V4.1-Flash)
 * ile semantik olarak doğrular.
 */
export async function semanticMatch(src, cand, opts = {}) {
  const key = matchCacheKey(src, cand);
  const cached = semanticMatchCache.get(key);
  if (cached && Date.now() - cached.ts < MATCH_CACHE_TTL) {
    return { ...cached.data, cached: true };
  }

  const lines = [
    'Aşağıdaki iki e-ticaret ürününün AYNI FİZİKSEL ÜRÜN olup olmadığını değerlendir.',
    '',
    'Kurallar:',
    '1. Renk farkı AYNI ürün sayılır (ör. Siyah vs Beyaz aynı modeldir).',
    '2. Kapasite/depolama/boyut/seri farkları (ör. 128GB vs 256GB, Pro vs Düz, RTX 4070 vs 4070 Ti) KESİNLİKLE FARKLI üründür (ayniUrun: false).',
    '3. Kılıf, filtre, kablo, adaptör gibi aksesuarlar cihazın kendisiyle KESİNLİKLE FARKLI üründür (ayniUrun: false).',
    '4. Farklı modeller (ör. iPhone 15 vs iPhone 15 Pro, S24 vs S24 Ultra) FARKLI üründür.',
    '5. Satıcı adı ya da garantinin başlıkta geçmesi ürünü değiştirmez.',
    '',
    'Ürün A (Kaynak):',
    '- Başlık: ' + (src.title || src.name || 'Belirtilmemiş'),
    '- Marka: ' + (src.brand || 'Belirtilmemiş'),
    '- Model Kodu: ' + (src.modelCode || 'Belirtilmemiş'),
    '- Renk: ' + (src.color || 'Belirtilmemiş'),
    '',
    'Ürün B (Aday):',
    '- Başlık: ' + (cand.title || cand.name || 'Belirtilmemiş'),
    '- Marka: ' + (cand.brand || 'Belirtilmemiş'),
    '- Model Kodu: ' + (cand.modelCode || 'Belirtilmemiş'),
    '- Renk: ' + (cand.color || 'Belirtilmemiş'),
    '',
    'Sadece şu JSON nesnesini döndür:',
    '{',
    '  "ayniUrun": true | false,',
    '  "guven": 0.0 - 1.0,',
    '  "aciklama": "kısa Türkçe gerekçe"',
    '}'
  ];
  const prompt = lines.join('\n');

  try {
    const raw = await chatOnce([
      { role: 'system', content: 'Sen uzman bir e-ticaret ürün eşleştirme sistemisin. Yalnızca geçerli JSON döndür.' },
      { role: 'user', content: prompt }
    ], { temperature: 0, maxTokens: 1500 });

    let parsed = null;
    try {
      let t = raw.trim();
      const s = t.indexOf('{');
      const e = t.lastIndexOf('}');
      if (s !== -1 && e !== -1) {
        parsed = JSON.parse(t.slice(s, e + 1));
      }
    } catch {}

    const result = {
      ayniUrun: Boolean(parsed?.ayniUrun),
      guven: typeof parsed?.guven === 'number' ? parsed.guven : 0.85,
      aciklama: parsed?.aciklama || 'YZ eşleştirme kararı',
    };

    semanticMatchCache.set(key, { ts: Date.now(), data: result });
    if (semanticMatchCache.size > 5000) {
      const oldestKey = semanticMatchCache.keys().next().value;
      semanticMatchCache.delete(oldestKey);
    }
    return result;
  } catch (err) {
    console.warn('[ai:semanticMatch] YZ hatası:', err.message);
    return { ayniUrun: false, guven: 0.5, aciklama: 'YZ servisi yanıt vermedi: ' + err.message };
  }
}

/**
 * En ucuz teklifin neden diğer tekliflerden daha ucuz olduğunu EVREN LLM (DeepSeek-V4.1-Flash)
 * ile analiz edip tüketici dostu net bir açıklama kartı oluşturur.
 */
export async function explainCheapest(cheapest, runnerUp, srcProduct) {
  if (!cheapest || !runnerUp) return null;
  const cPrice = cheapest.product?.pricing?.toplam;
  const rPrice = runnerUp.product?.pricing?.toplam;
  if (cPrice == null || rPrice == null) return null;
  const fark = Math.round(rPrice - cPrice);
  if (fark <= 0) return null;

  const prompt = [
    'Aşağıdaki e-ticaret karşılaştırmasında en ucuz ürünün neden ikinci siteden daha ucuz olduğunu tüketiciye yönelik, net ve samimi 1-2 cümlelik Türkçe bir özetle açıkla.',
    '',
    'Ürün: ' + (srcProduct?.title || 'Ürün'),
    '1. En Ucuz: ' + cheapest.siteName + ' (Net Fiyat: ' + cPrice + ' TL, Kargo: ' + (cheapest.product?.pricing?.kargo === 0 ? 'Ücretsiz' : cheapest.product?.pricing?.kargo + ' TL') + ')',
    '   İndirimler: ' + (cheapest.product?.pricing?.kampanyaHerkes?.map(k => k.metin).join(', ') || 'Yok'),
    '2. İkinci En Ucuz: ' + runnerUp.siteName + ' (Net Fiyat: ' + rPrice + ' TL, Kargo: ' + (runnerUp.product?.pricing?.kargo === 0 ? 'Ücretsiz' : runnerUp.product?.pricing?.kargo + ' TL') + ')',
    '   Fiyat Farkı: ' + fark + ' TL daha ucuz',
    '',
    'Yanıt kuralı: Yalnızca tek bir kısa paragraf yaz. Giriş veya başlık koyma. Doğrudan açıkla.'
  ].join('\n');

  try {
    const raw = await chatOnce([
      { role: 'system', content: 'Sen tüketici dostu bir fiyat analistisin. Kısa ve vurucu özet yazarsın.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, maxTokens: 1200 });
    return raw.trim().replace(/^["']|["']$/g, '');
  } catch {
    return 'Bu ürün ' + cheapest.siteName + '\'da ' + fark + ' TL daha ucuz (Net: ' + cPrice + ' TL).';
  }
}

// ==================== MUADİL (ALTERNATİF) ÜRÜN MOTORU ====================
//
// Kullanıcı kuralı: uydurma veri YOK. YZ'ye yalnızca gerçek ürün başlığı ve fiyatı
// gönderilir; YZ'nin ürettiği her öneri, GERÇEK arama sonuçlarından doğrulanır.
// "Aynı özelliklere sahip" ifadesi yalnızca YZ'nin ürün başlıklarından çıkardığı
// benzerlik gerekçesine dayanır — teknik özellik tablosu uydurulmaz.

const ALTERNATIF_SORGU_SYSTEM = `Sen bir Türkçe alışveriş asistanısın. Sana bir ürün başlığı verilir.
Görevin: bu ürünün YERİNE alınabilecek MUADİL ürünleri aramak için 2-3 kısa arama sorgusu üretmek.

Kurallar:
- Sorgular Türkiye'deki e-ticaret sitelerinin arama kutusuna yazılacak biçimde 2-4 kelime olmalı (ör. "kablosuz kulaklık", "pla filament 1.75mm").
- Marka adı KULLANMA (muadil arıyoruz, aynı markayı değil). Tek istisna: ürün kategorisinde marka ayırt ediciyse (ör. "iPhone kılıfı") kullanabilirsin.
- Model numarası KULLANMA ("V15", "RTX 4070" gibi) — bu aynı ürünü arar.
- Ürünün temel işlevini koru (süpürge yerine süpürge, filament yerine filament). Farklı bir ürün kategorisi önerme.
- Yanıtında SADECE şu JSON olmalı, açıklama yazma:
{"sorgular": ["...", "..."], "ortakOzellik": "bu ürünü tanımlayan 1 kısa ifade (ör. 'şarjlı dikey süpürge')"}`;

/**
 * Bir ürün için muadil arama sorguları üretir.
 * @param {{title:string, brand?:string|null, category?:string|null}} urun
 * @returns {Promise<{sorgular:string[], ortakOzellik:string|null}>}
 */
export async function alternatifSorgulari(urun) {
  const baslik = String(urun?.title || '').trim();
  if (!baslik) return { sorgular: [], ortakOzellik: null };

  const kuralTabanli = () => {
    // YZ yoksa: başlıktan markayı ve model/sayı bloklarını at, geri kalanı sorgu yap.
    // Dürüst yedek: uydurma yok, yalnızca başlığın kelimeleri.
    const marka = String(urun?.brand || '').toLocaleLowerCase('tr-TR').trim();
    const kelimeler = baslik
      .split(/\s+/)
      .filter(w => {
        const k = w.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}+.,-]/gu, '');
        if (!k || k.length < 2) return false;
        if (/\d/.test(k)) return false;                     // model numarası/sayı
        if (marka && k.includes(marka.split(' ')[0])) return false; // marka adı
        return true;
      })
      .slice(0, 4);
    return { sorgular: kelimeler.length >= 2 ? [kelimeler.join(' ')] : [], ortakOzellik: null };
  };

  if (!config.ai.apiKey) return kuralTabanli();

  try {
    const raw = await chatOnce(
      [
        { role: 'system', content: ALTERNATIF_SORGU_SYSTEM },
        {
          role: 'user',
          content: 'Ürün: ' + baslik + (urun?.brand ? '\nMarka: ' + urun.brand : ''),
        },
      ],
      { temperature: 0.3, maxTokens: 800 },
    );
    const t = raw.replace(/```(?:json)?/gi, '').trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) return kuralTabanli();
    const j = JSON.parse(t.slice(start, end + 1));
    const sorgular = (Array.isArray(j.sorgular) ? j.sorgular : [])
      .map(s => String(s || '').trim())
      .filter(s => s.length >= 3 && s.length <= 80)
      .slice(0, 3);
    // Güvenlik: YZ model numarası içeren sorgu üretirse (aynı ürünü arar) at.
    const guvenli = sorgular.filter(s => !/\b(?:v\d{1,3}|[a-z]{1,3}\d{2,4})\b/i.test(s));
    return {
      sorgular: (guvenli.length ? guvenli : sorgular).slice(0, 3),
      ortakOzellik: j.ortakOzellik ? String(j.ortakOzellik).slice(0, 80) : null,
    };
  } catch {
    return kuralTabanli();
  }
}

const ALTERNATIF_SECIM_SYSTEM = `Sen bir Türkçe alışveriş danışmanısın. Sana bir KAYNAK ÜRÜN ve
gerçek arama sonuçlarından gelen ADAY listesi verilir. Görevin: kaynak ürünün yerine
alınabilecek en fazla 2-3 muadili seçmek.

MUTLAK KURALLAR:
1. Yalnızca aday listesindeki url'leri kullan. Listede olmayan bir ürün ASLA önerme.
2. Aday, kaynak ürünün AYNISI olmamalı (aynı model/marka-model). Muadil = benzer işlev, farklı model.
3. Fiyat uydurma. Yalnızca listede yazan fiyatı kullan, hesaplama yapma.
4. "Aynı özelliklere sahip" gibi iddialar için yalnızca başlıklardaki bilgiye dayan. Teknik özellik tablosu uydurma.
5. Neden metni tek kısa cümle olsun (en fazla 20 kelime) ve somut olsun: hangi ihtiyacı karşılıyor.
6. Hiçbir aday uygun değilse boş dizi döndür [].

Yanıt formatı SADECE JSON dizisi:
[{"url":"...","model":"...","neden":"..."}]`;

/**
 * Gerçek adaylar arasından muadil seçtirir.
 * @param {object} kaynak kaynak ürün (title, sellingPrice)
 * @param {Array<{url,title,price,site}>} adaylar GERÇEK arama sonuçları
 * @returns {Promise<Array<{url,model,neden}>>}
 */
export async function alternatifSec(kaynak, adaylar) {
  if (!Array.isArray(adaylar) || !adaylar.length) return [];
  if (!config.ai.apiKey) return [];
  const liste = adaylar.slice(0, 25).map((a, i) =>
    `${i + 1}. [${a.site}] ${a.title} — ${a.price != null ? a.price + ' TL' : 'fiyat yok'}`).join('\n');
  const userMsg =
    'KAYNAK ÜRÜN: ' + kaynak.title + ' — ' + (kaynak.sellingPrice ?? '?') + ' TL\n\n' +
    'ADAYLAR (site, başlık, fiyat):\n' + liste + '\n\n' +
    'URL eşleştirmesi için aşağıdaki listeyi kullan (sıra numarası → url):\n' +
    adaylar.slice(0, 25).map((a, i) => `${i + 1}. ${a.url}`).join('\n');

  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      const raw = await chatOnce(
        [
          { role: 'system', content: ALTERNATIF_SECIM_SYSTEM },
          { role: 'user', content: userMsg + (deneme > 0 ? '\n\n(Önemli: yalnızca geçerli JSON dizisi döndür.)' : '') },
        ],
        { temperature: 0.2, maxTokens: 1500 },
      );
      const arr = extractJsonArray(raw);
      if (!Array.isArray(arr)) continue;
      return arr
        .filter(x => x && x.url)
        .map(x => ({
          url: String(x.url),
          model: String(x.model || '').slice(0, 200) || null,
          neden: String(x.neden || '').slice(0, 220) || null,
        }))
        .slice(0, 3);
    } catch { /* ikinci deneme */ }
  }
  return [];
}
