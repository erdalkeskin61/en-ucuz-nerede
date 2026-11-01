/**
 * Görsel Ürün Arama (Multimodal Vision Search) — 2026-10-28.
 *
 * Kullanıcı adını bilmediği bir ürünün fotoğrafını yükler (kafede gördüğü termos,
 * arkadaşının kulaklığı…). Vision modeli (EVREN: qwen3-vl-30b) görseldeki ürünün
 * marka/model/ayırt edici niteliklerini çıkarır, ardından arama motoru tetiklenir.
 *
 * İlkeler:
 *  - Ham görsel ASLA sitelere gitmez; yalnızca YZ'ye gider ve oradan metin sorgusu çıkar.
 *  - YZ "emin değilse" boş bırakır: marka/model uydurulmaz (uydurma eşleşme olmasın).
 *  - Görsel sunucuya base64 olarak gelir; boyut sınırı vardır (istemci tarafında küçültülür).
 *  - Çıkan sorguyla siteler taranır, adaylar başlık benzerliğine göre sıralanır.
 */
import { config } from './config.js';
import { adapters, adapterById } from './sites/index.js';
import { computePricing } from './pricing.js';
import { dominantColor, titleSimilarity, formatTL, extractColors } from './util.js';
import { HIZLI_SITELER } from './basketOptimizer.js';
import { afiliyeLink } from './afiliye.js';

/** Vision modeli (.env ile değiştirilebilir). */
const VISION_MODEL = process.env.AI_VISION_MODEL || 'qwen3-vl-30b';

/** Gönderilebilecek en büyük görsel boyutu (base64 çözülmüş hâli). */
export const GORSEL_MAX_BAYT = 4 * 1024 * 1024; // 4 MB

/** İstem: kısa tutulur (EVREN uzun istemlerde token bütçesini düşünmeye harcıyor). */
const VISION_SYSTEM = `Sen bir ürün tanıma asistanısın. Görseldeki ÜRÜNÜ tanımlarsın.
Yanıtında SADECE şu JSON olmalı:
{"urun":"<genel ürün adı, 2-5 kelime>","marka":<marka ya da null>,"model":<model/kod ya da null>,"malzeme":<PLA/PETG/ABS gibi malzeme ya da null>,"ozellikler":["<ayırt edici özellik>"],"aramaSorgusu":"<sitede aranacak 2-4 kelimelik Türkçe sorgu>","renk":<baskın renk ya da null>,"guven":"yuksek|orta|dusuk"}
Kurallar:
- Marka/model okunamıyorsa UYDURMA, null yaz.
- Ürün etiketinde malzeme/seri adı yazıyorsa (PLA, PETG, ABS, Silk, Matte…) "malzeme" alanına yaz; yazmıyorsa null.
- aramaSorgusu marka+ürün türü olsun (ör. "anker termos", "jbl kulaklık", "nike ceket"); markayı bilmiyorsan yalnız ürün türü.
- "kişi", "mekan", "arka plan" gibi şeyleri ürün sanma; ana ürünü tanımla.
- Yanıtta açıklama yok; yalnızca JSON.`;

/**
 * Base64 görseli Vision modeline gönderir, ürün bilgisini döndürür.
 *
 * @param {{base64:string, mime?:string, ipucu?:string}} girdi
 * @returns {Promise<{urun, marka, model, ozellikler, aramaSorgusu, renk, guven, ham?}>}
 */
export async function gorselAnaliz({ base64, mime = 'image/jpeg', ipucu = '' }) {
  if (!base64 || typeof base64 !== 'string') throw new Error('Görsel verisi yok');
  const temiz = base64.replace(/^data:[^;]+;base64,/, '');

  const boyut = Math.floor((temiz.length * 3) / 4);
  if (boyut > GORSEL_MAX_BAYT) {
    throw new Error('Görsel çok büyük (en fazla 4 MB). Lütfen daha küçük bir fotoğraf seçin.');
  }

  const kullaniciIcerik = [
    {
      type: 'text',
      text: (ipucu ? `Kullanıcı ipucu: ${String(ipucu).slice(0, 120)}\n` : '') + 'Görseldeki ürünü tanımla.',
    },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${temiz}` } },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let ham;
  try {
    const res = await fetch(config.ai.baseURL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.apiKey },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        max_tokens: 600,
        messages: [
          { role: 'system', content: VISION_SYSTEM },
          { role: 'user', content: kullaniciIcerik },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('Vision API HTTP ' + res.status + ': ' + t.slice(0, 160));
    }
    const data = await res.json();
    ham = data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }

  const json = jsonCikar(ham);
  if (!json) {
    throw new Error('Görseldeki ürün tanınamadı. Daha net bir fotoğraf deneyin.');
  }

  const urun = temizMetin(json.urun);
  const marka = temizMetin(json.marka);
  const model = temizMetin(json.model);
  const aramaSorgusu = temizMetin(json.aramaSorgusu);

  if (!aramaSorgusu && !urun) {
    throw new Error('Görseldeki ürün tanınamadı. Daha net bir fotoğraf deneyin.');
  }

  return {
    urun: urun || aramaSorgusu,
    marka,
    model,
    malzeme: temizMetin(json.malzeme),
    ozellikler: Array.isArray(json.ozellikler)
      ? json.ozellikler.map(temizMetin).filter(Boolean).slice(0, 6)
      : [],
    aramaSorgusu: aramaSorgusu || urun,
    renk: temizMetin(json.renk),
    guven: ['yuksek', 'orta', 'dusuk'].includes(String(json.guven || '').toLowerCase())
      ? String(json.guven).toLowerCase()
      : 'orta',
    ham: ham.slice(0, 400),
  };
}

/** "null"/"bilinmiyor"/boş değerleri null'a çevirir. */
function temizMetin(deger) {
  if (deger == null) return null;
  const s = String(deger).trim();
  if (!s) return null;
  if (/^(null|yok|bilinmiyor|belirsiz|unknown|n\/a|-)$/i.test(s)) return null;
  return s.slice(0, 120);
}

/** YZ yanıtından JSON nesnesi çıkarır (kod bloğu/açıklama toleranslı). */
function jsonCikar(metin) {
  if (!metin) return null;
  let t = String(metin).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const bas = t.indexOf('{');
  const son = t.lastIndexOf('}');
  if (bas < 0 || son <= bas) return null;
  try {
    return JSON.parse(t.slice(bas, son + 1));
  } catch {
    return null;
  }
}

/**
 * Görselden bulunan sorguyla sitelerde arama yapar.
 *
 * @param {object} analiz gorselAnaliz çıktısı
 * @param {{onProgress?:Function, signal?:AbortSignal, siteler?:string[], hizliMod?:boolean, limit?:number}} opts
 */
export async function gorselAra(analiz, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal || null;
  const iptalMi = () => !!(signal && signal.aborted);
  const basladi = Date.now();
  const limit = Math.max(3, Math.min(opts.limit || 12, 30));

  // Kademeli sorgu: marka + ürün + renk → marka + ürün → yalnız ürün türü
  // (2026-10-28: renk eklenince doğru varyant çok daha iyi bulunuyor —
  //  "sunlu 3d yazıcı filament" beyaz ABS/PETG getirirken "sunlu filament sarı"
  //  doğru ürünü getiriyor.)
  const sorgular = [];
  const marka = analiz.marka;
  const tur = analiz.aramaSorgusu || analiz.urun;
  const renk = analiz.renk;
  const malzeme = analiz.malzeme;
  // Marka sorguda zaten geçiyorsa başına TEKRAR eklenmez ("JBL JBL Tune" olmasın).
  const turMarkaIceriyor = !!(marka && tur && String(tur).toLowerCase().includes(String(marka).toLowerCase()));
  const ekle = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && !sorgular.includes(t)) sorgular.push(t);
  };

  if (turMarkaIceriyor) {
    if (renk) ekle(`${tur} ${renk}`);
    ekle(tur);
  } else {
    if (marka && tur && renk) ekle(`${marka} ${tur} ${renk}`);
    if (marka && malzeme && tur && !String(tur).toLowerCase().includes(String(malzeme).toLowerCase())) {
      ekle(`${marka} ${malzeme} ${tur}`);
    }
    if (marka && tur) ekle(`${marka} ${tur}`);
    if (tur && renk) ekle(`${tur} ${renk}`);
    ekle(tur);
    if (marka && analiz.urun && tur !== analiz.urun) ekle(`${marka} ${analiz.urun}`);
  }
  const benzersiz = sorgular.slice(0, 4);
  if (!benzersiz.length) throw new Error('Aranacak sorgu üretilemedi');

  const hizliMod = opts.hizliMod !== false;
  // DİKKAT: açıkça verilen boş dizi "site yok" demektir (testler bunu kullanır).
  const siteListesi = Array.isArray(opts.siteler)
    ? opts.siteler
    : (hizliMod ? HIZLI_SITELER : adapters.map(a => a.id));

  onProgress({
    faz: 'arama',
    analiz,
    sorgular: benzersiz,
    toplam: siteListesi.length,
    biten: 0,
    not: `"${benzersiz[0]}" ile sitelerde aranıyor…`,
  });

  const adaylar = [];
  const gorulenUrl = new Set();
  let biten = 0;

  let imlec = 0;
  const isci = async () => {
    while (true) {
      if (iptalMi()) return;
      const i = imlec++;
      if (i >= siteListesi.length) return;
      const id = siteListesi[i];
      const adapter = adapterById(id);
      if (!adapter) { biten++; continue; }

      // Bu site için kademeli sorgular: ilk anlamlı sonuçta dur
      for (const sorgu of benzersiz) {
        if (iptalMi()) break;
        let urunler = [];
        try { urunler = await adapter.searchProducts(sorgu, { spend: 0 }) || []; } catch { urunler = []; }
        if (!urunler.length) continue;

        // Benzerlik: aday başlığını "marka + ürün + renk" ile karşılaştır
        // (yalnız ürün türüyle karşılaştırmak jenerik sorguda %10-15 gibi anlamsız
        //  düşük skorlar üretiyordu — 2026-10-28 canlı testi).
        const hedefBaslik = [analiz.marka, analiz.urun, analiz.renk]
          .filter(Boolean).join(' ').trim() || benzersiz[0];

        for (const u of urunler) {
          if (!u?.title || !u?.url || gorulenUrl.has(u.url)) continue;

          const benzerlik = titleSimilarity(
            hedefBaslik,
            u.title,
            analiz.marka || null,
            u.brand || null,
            { stripColors: true },
          );
          // Marka disiplini: marka biliniyorsa başlıkta marka yoksa geriye düşür
          const markaUyum = analiz.marka
            ? String(u.title).toLowerCase().includes(String(analiz.marka).toLowerCase())
            : null;
          // Renk uyumu (Türkçe karakter toleranslı)
          const adayRenkler = extractColors(u.title).map(r => String(r).toLowerCase());
          const arananRenk = analiz.renk ? String(analiz.renk).toLowerCase() : null;
          const renkUyum = arananRenk
            ? adayRenkler.some(r => r.includes(arananRenk) || arananRenk.includes(r))
            : null;
          // Rengi belirli bir üründe başka renk (beyaz vs sarı) → ciddi ceza
          const renkCeliski = !!arananRenk && adayRenkler.length > 0 && renkUyum === false;

          adaylar.push({
            site: id,
            siteName: adapter.name,
            title: String(u.title).slice(0, 200),
            url: u.url,
            // Yalnızca dışa giden bağlantı için (fiyat/sıralama dokunulmaz)
            afiliyeUrl: afiliyeLink(id, u.url),
            price: u.price ?? null,
            brand: u.brand || null,
            color: u.color || dominantColor(u.title),
            benzerlik: Math.round(benzerlik * 100) / 100,
            markaUyum,
            renkUyum,
            renkCeliski,
          });
          gorulenUrl.add(u.url);
        }

        if (adaylar.filter(a => a.site === id).length) break; // bu site için yeterli
      }

      biten++;
      const siteninAdaylari = adaylar.filter(a => a.site === id).length;
      onProgress({
        faz: 'arama',
        analiz,
        sorgular: benzersiz,
        toplam: siteListesi.length,
        biten,
        site: id,
        siteName: adapter.name,
        adaySayisi: siteninAdaylari,
        not: siteninAdaylari ? `${siteninAdaylari} aday` : 'sonuç yok',
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(8, siteListesi.length) }, () => isci()));

  if (iptalMi()) {
    return { analiz, iptalEdildi: true, adaylar: [], ozet: { toplamSureMs: Date.now() - basladi, tarananSite: biten } };
  }

  // Sıralama: marka uyumu → renk uyumu → benzerlik → fiyat (ucuz önce)
  const sirali = adaylar
    .map(a => {
      let puan = a.benzerlik;
      if (a.markaUyum === true) puan += 0.35;
      else if (a.markaUyum === false) puan -= 0.25;
      if (a.renkUyum === true) puan += 0.15;
      else if (a.renkCeliski) puan -= 0.30; // yanlış renk (beyaz vs sarı) öne çıkmasın
      return { ...a, puan: Math.round(puan * 1000) / 1000 };
    })
    .sort((a, b) => {
      if (b.puan !== a.puan) return b.puan - a.puan;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    })
    .slice(0, limit);

  // En ucuz (fiyatı olanlar arasında)
  const fiyatli = sirali.filter(a => a.price != null && a.price > 0);
  const enUcuz = fiyatli.length
    ? fiyatli.reduce((a, b) => (a.price <= b.price ? a : b))
    : null;
  if (enUcuz) enUcuz.enUcuz = true;

  onProgress({ faz: 'bitti', analiz, not: `${sirali.length} aday bulundu` });

  return {
    analiz,
    sorgular: benzersiz,
    adaylar: sirali,
    ozet: {
      toplamSureMs: Date.now() - basladi,
      tarananSite: biten,
      adaySayisi: sirali.length,
      enUcuzSite: enUcuz?.siteName || null,
      enUcuzFiyat: enUcuz?.price ?? null,
      enUcuzUrl: enUcuz?.url || null,
      enUcuzAfiliyeUrl: enUcuz?.afiliyeUrl || null,
    },
  };
}

/** Tam akış: görsel → analiz → arama. */
export async function gorselAramaYap({ base64, mime, ipucu }, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  onProgress({ faz: 'analiz', not: 'Görsel inceleniyor…' });
  const analiz = await gorselAnaliz({ base64, mime, ipucu });
  onProgress({ faz: 'analiz', analiz, not: `Ürün tanındı: ${analiz.urun || analiz.aramaSorgusu}` });
  return gorselAra(analiz, { ...opts, onProgress });
}
