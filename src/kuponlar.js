/**
 * Kupon ve site geneli kampanya toplayıcı.
 *
 * Gerçek durum (2026-10 canlı ölçümü): Türkiye'deki siteler ürün sayfalarında ve
 * genel kampanya sayfalarında AÇIK kupon kodu neredeyse hiç yayınlamıyor; bunun
 * yerine "sepette %10", "500 TL üzeri 50 TL indirim", "kargo bedava" gibi
 * duyurular ve kupon TOPLAMA fırsatları (uygulamaya/üyeliğe özel) yayınlıyorlar.
 * Bu yüzden toplayıcı iki şey toplar:
 *   1) Site geneli kampanyalar (koşulsuz → fiyata uygulanır)
 *   2) Kupon kodları / kupon fırsatları (kod varsa "kuponla X TL" olarak gösterilir)
 *
 * İlkeler:
 *  - Uydurma yok: metinden net indirim çıkmıyorsa kayıt açılmaz.
 *  - "Seçili ürünlerde" / "kategorilerde" ifadeleri site geneli SAYILMAZ
 *    (kapsam: kategori → yalnız ürün kategorisi eşleşiyorsa gösterilir, otomatik uygulanmaz).
 *  - Üyelik/uygulama/kart koşullu fırsatlar fiyata dahil edilmez, koşullu gösterilir.
 *  - Kaynaklar yerel çekim zincirinden (önce doğrudan, gerekirse tarayıcı) okunur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { fetchPage } from './scraper.js';
import { classifySiteOffers } from './ai.js';
import { toLowerTr } from './util.js';

const DOSYA = path.join(config.dataDir, 'kuponlar.json');
const TAZELIK_MS = 12 * 60 * 60 * 1000; // 12 saat

/** Site başına taranacak sayfalar (2026-10 ölçümünde içerik veren adresler). */
const KAYNAKLAR = {
  trendyol: { ad: 'Trendyol', urller: ['https://www.trendyol.com/'] },
  hepsiburada: { ad: 'Hepsiburada', urller: ['https://www.hepsiburada.com/'] },
  n11: { ad: 'n11', urller: ['http://www.n11.com/', 'http://www.n11.com/kuponlar'] },
  amazon: { ad: 'Amazon.tr', urller: ['https://www.amazon.com.tr/deals'] },
  incehesap: { ad: 'İncehesap', urller: ['https://www.incehesap.com/'] },
  teknosa: { ad: 'Teknosa', urller: ['https://www.teknosa.com/kampanyalar'] },
  vatan: { ad: 'Vatan Bilgisayar', urller: ['https://www.vatanbilgisayar.com/kampanyalar/'] },
  ciceksepeti: { ad: 'Çiçeksepeti', urller: ['https://www.ciceksepeti.com/kampanyalar'] },
  mediamarkt: { ad: 'MediaMarkt', urller: ['https://www.mediamarkt.com.tr/tr'] },
  itopya: { ad: 'İtopya', urller: ['https://www.itopya.com/'] },
  pazarama: { ad: 'Pazarama', urller: ['https://www.pazarama.com/'] },
  koctas: { ad: 'Koçtaş', urller: ['https://www.koctas.com.tr/kuponlar', 'https://www.koctas.com.tr/'] },
};

// ---- Depolama ----

let veri = null;
try { veri = JSON.parse(fs.readFileSync(DOSYA, 'utf8')); } catch { /* ilk çalıştırma */ }

function kaydet() {
  try { fs.writeFileSync(DOSYA, JSON.stringify(veri, null, 2)); } catch { /* kritik değil */ }
}

function bosVeri() {
  return { sonGuncelleme: null, siteler: {} };
}

// ---- Metinden fırsat cümleleri çıkarma ----

/** HTML'den kupon/kampanya ile ilgili cümleleri süzer (ucuz ön filtre; YZ'ye az metin gider). */
function firsatCumleleri(html) {
  const metin = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const cumleler = metin.split(/(?<=[.!?·|])\s+/).map(s => s.trim());
  const secili = [];
  const gorulen = new Set();
  for (const s of cumleler) {
    if (s.length < 15 || s.length > 180) continue;
    const ilgili =
      /kupon/i.test(s) ||
      /(sepette|sepetinizde|sepet tutarı|ve üzeri|üzeri)/i.test(s) ||
      /(indirim kodu|promosyon kodu|kod:)/i.test(s);
    if (!ilgili) continue;
    // İndirim/kargo gibi somut bir fayda içermeli
    if (!/(indirim|%|tl|bedava|ücretsiz|hediye|puan)/i.test(s)) continue;
    const anahtar = toLowerTr(s).slice(0, 70);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    secili.push(s);
    if (secili.length >= 18) break;
  }
  return secili;
}

/**
 * YZ çıktısını deterministik olarak süzer. Amaç: ürün fiyatlarının "indirim"
 * sanılmasını ve anlamsız kayıtları elemek (sahte indirim yasağı).
 */
function kampanyaGecerliMi(k) {
  const m = String(k.metin || '');
  if (m.length < 12) return false;
  // Fırsat olduğunu gösteren bir sözcük olmalı
  if (!/(indirim|kupon|%|bedava|ücretsiz|hediye|puan)/i.test(m)) return false;
  // Kuruşlu tutar içeren cümleler ürün FİYATIDIR ("sepette 1.785,11 TL"), indirim değil
  if (/\d+[.,]\d{2}\s*(TL|tl)\b/.test(m)) return false;
  // Kategori kapsamlı ama kategorisi belirsiz ve kodu da yok → eşleştirilemez
  if (k.kapsam === 'kategori' && !k.kategori && !k.kodu) return false;
  const d = Number(k.indirim?.deger);
  if (!isFinite(d) || d <= 0) return false;
  if (k.indirim?.tip === 'tutar') {
    if (!Number.isInteger(d)) return false;   // 97,22 TL gibi değerler fiyattır
    if (d > 100000) return false;             // fahiş tutar = veri hatası
  } else {
    if (d > 90) return false;                 // %90 üstü = hatalı çıkarım (bedava ayrı ifade)
  }
  return true;
}

// ---- Toplama ----
/**
 * Bir sitenin kaynak sayfalarını tarar ve kampanyaları yapılandırır.
 * @returns {Promise<{site:string, kampanyalar:Array, hata?:string}>}
 */
export async function siteTopla(siteId, { fresh = false } = {}) {
  const kaynak = KAYNAKLAR[siteId];
  if (!kaynak) return { site: siteId, kampanyalar: [], hata: 'Bilinmeyen site' };

  const tumCumleler = [];
  const hatalar = [];
  for (const url of kaynak.urller) {
    try {
      const r = await fetchPage(url, { site: siteId, purpose: 'kupon', maxAgeMs: TAZELIK_MS, fresh });
      tumCumleler.push(...firsatCumleleri(r.body));
    } catch (e) {
      hatalar.push(String(e.message || e).slice(0, 80));
    }
  }
  if (!tumCumleler.length) {
    return { site: siteId, kampanyalar: [], hata: hatalar[0] || 'Kaynak sayfalarda kampanya metni bulunamadı' };
  }

  let kampanyalar = [];
  try {
    kampanyalar = await classifySiteOffers({ site: kaynak.ad, cumleler: tumCumleler.slice(0, 18) });
  } catch (e) {
    return { site: siteId, kampanyalar: [], hata: 'YZ sınıflandırması başarısız: ' + String(e.message || e).slice(0, 80) };
  }

  // Doğrulama: net indirimi olmayan kayıtları at (uydurma engeli)
  kampanyalar = kampanyalar
    .filter(k => k && k.metin && k.indirim && Number(k.indirim.deger) > 0)
    .filter(kampanyaGecerliMi)
    .map(k => ({
      metin: String(k.metin).slice(0, 180),
      kapsam: ['site', 'kategori', 'uyelik', 'uygulama', 'kart', 'belirsiz'].includes(k.kapsam) ? k.kapsam : 'belirsiz',
      kategori: k.kategori ? toLowerTr(String(k.kategori)).slice(0, 30) : null,
      minSepet: k.minSepet != null && isFinite(Number(k.minSepet)) ? Number(k.minSepet) : null,
      indirim: { tip: k.indirim.tip === 'yuzde' ? 'yuzde' : 'tutar', deger: Number(k.indirim.deger) },
      kodu: k.kodu && /^[A-Za-z0-9]{3,15}$/.test(String(k.kodu)) ? String(k.kodu).toUpperCase() : null,
      bitis: k.bitis && /^\d{4}-\d{2}-\d{2}$/.test(String(k.bitis)) ? String(k.bitis) : null,
      guven: ['yuksek', 'orta', 'dusuk'].includes(k.guven) ? k.guven : 'orta',
    }));

  return { site: siteId, kampanyalar, hata: hatalar[0] };
}

/**
 * Tüm siteleri tarar (eşzamanlılık sınırlı). Mevcut kayıtlar korunur; hata alan
 * site eski kampanyalarını tutar (dürüst notla).
 */
export async function tumunuTopla({ fresh = false, siteIds = null } = {}) {
  if (!veri) veri = bosVeri();
  const hedefler = siteIds || Object.keys(KAYNAKLAR);
  const sonuclar = [];
  const ESZAMANLI = 2;
  let idx = 0;
  async function isci() {
    while (idx < hedefler.length) {
      const siteId = hedefler[idx++];
      const r = await siteTopla(siteId, { fresh });
      const onceki = veri.siteler[siteId];
      if (r.kampanyalar.length || !onceki) {
        veri.siteler[siteId] = {
          sonGuncelleme: r.kampanyalar.length ? new Date().toISOString() : (onceki?.sonGuncelleme || null),
          kampanyalar: r.kampanyalar.length ? r.kampanyalar : (onceki?.kampanyalar || []),
          hata: r.hata || null,
        };
      } else {
        veri.siteler[siteId] = { ...onceki, hata: r.hata || 'Bu taramada kampanya bulunamadı (eski kayıt korunuyor)' };
      }
      sonuclar.push({ site: siteId, ad: KAYNAKLAR[siteId].ad, kampanyaSayisi: veri.siteler[siteId].kampanyalar.length, hata: veri.siteler[siteId].hata });
    }
  }
  await Promise.all(Array.from({ length: Math.min(ESZAMANLI, hedefler.length) }, isci));
  veri.sonGuncelleme = new Date().toISOString();
  kaydet();
  return { sonGuncelleme: veri.sonGuncelleme, sonuclar };
}

/** Kayıtlı kampanyaları (Ayarlar panosu için) döndürür. */
export function getKuponlar() {
  if (!veri) veri = bosVeri();
  const siteler = Object.entries(KAYNAKLAR).map(([id, k]) => {
    const kayit = veri.siteler[id] || {};
    return {
      site: id,
      ad: k.ad,
      sonGuncelleme: kayit.sonGuncelleme || null,
      hata: kayit.hata || null,
      kampanyalar: (kayit.kampanyalar || []).map(k => ({
        metin: k.metin,
        kapsam: k.kapsam,
        kategori: k.kategori,
        minSepet: k.minSepet,
        indirim: k.indirim,
        kodu: k.kodu,
        bitis: k.bitis,
        guven: k.guven,
      })),
    };
  });
  return { sonGuncelleme: veri.sonGuncelleme, siteler };
}

/** Arka planda tazeleme gerekiyor mu? */
export function tazelemeGerekli() {
  if (!veri?.sonGuncelleme) return true;
  return Date.now() - new Date(veri.sonGuncelleme).getTime() > TAZELIK_MS;
}

/**
 * Bir ürün için uygulanabilir site kampanyalarını seçer.
 *
 * Sınıflandırma:
 *  - kapsam 'site' ve kod yok → koşulsuz; fiyata uygulanabilir
 *  - kod varsa → "kuponla X TL" önizlemesi (koşuluyla birlikte gösterilir)
 *  - kapsam 'kategori' ve ürün başlığı kategori sözcüğünü içeriyorsa → gösterilir
 *  - uyelik / uygulama / kart → yalnız gösterilir (koşullu)
 *
 * @param {object} product aday ürün (site, title, sellingPrice ...)
 * @param {{kampanyalar?: Array}} [opts] test enjeksiyonu: verilirse diskteki
 *   `data/kuponlar.json` yerine bu liste kullanılır. Testlerin canlı veriye bağlı
 *   kalmasını önler (2026-10-28: Teknosa'nın Dyson kampanyası bitince test kırıldı).
 *   Üretimde hiç verilmez → davranış aynıdır.
 * @returns {Array<{metin,kapsam,minSepet,indirim,kodu,kosulMetni,uygulanabilir}>}
 */
export function urunIcinKampanyalar(product, opts = {}) {
  let liste;
  if (Array.isArray(opts.kampanyalar)) {
    liste = opts.kampanyalar;
  } else {
    if (!veri) veri = bosVeri();
    liste = veri.siteler[product?.site]?.kampanyalar || [];
  }
  if (!liste.length) return [];
  const baslik = toLowerTr(product?.title || '');
  const simdi = new Date();
  const out = [];

  for (const k of liste) {
    // Süresi geçmiş
    if (k.bitis && new Date(k.bitis + 'T23:59:59') < simdi) continue;
    // Kategori sözcüğü varsa ürün başlığında geçmeli (hangi kapsamda olursa olsun:
    // "soundbar", "Dyson", "temizlik" gibi eşleşmeler ürüne uymuyorsa gösterme).
    // 2026-10-28: karşılaştırma büyük/küçük harfe duyarlıydı — kazıyıcı "Dyson"
    // yazarsa (başlık küçük harfe çevrildiği için) kampanya SESSİZCE eşleşmiyordu.
    // Artık iki taraf da normalize edilir.
    if (k.kategori) {
      const kelimeler = toLowerTr(String(k.kategori)).split(/[\s,/-]+/).filter(w => w.length >= 3);
      if (!kelimeler.length || !kelimeler.some(w => baslik.includes(w))) continue;
    }
    // Ödeme yöntemi koşulu (havale/EFT/tek çekim): site geneli görünse de herkes
    // bu yöntemle ödemez → otomatik uygulanmaz, koşuluyla gösterilir.
    const odemeKosulu = /havale|eft|tek çekim|peşin ödeme|kredi kartına|banka kartına/i.test(k.metin);
    const kosulParcalari = [];
    if (k.kapsam === 'uyelik') kosulParcalari.push('üyelere özel');
    if (k.kapsam === 'uygulama') kosulParcalari.push('uygulamaya özel');
    if (k.kapsam === 'kart') kosulParcalari.push('banka kartına özel');
    if (k.kapsam === 'kategori') kosulParcalari.push('kategori kampanyası');
    if (odemeKosulu) kosulParcalari.push('ödeme yöntemi koşulu');
    if (k.minSepet) kosulParcalari.push(k.minSepet.toLocaleString('tr-TR') + ' TL ve üzeri sepette');
    if (k.kodu) kosulParcalari.push('kupon kodu: ' + k.kodu);

    const uygulanabilir = k.kapsam === 'site' && !k.kodu && !odemeKosulu && k.guven !== 'dusuk';
    // Önizleme: kategori/çok genel kapsamlı, kod gerektirmeyen kampanyalar.
    // Fiyat SADECE "kampanyayla ~X TL" olarak gösterilir; sıralamaya ve toplama girmez.
    const onizleme = !uygulanabilir && !k.kodu && k.guven !== 'dusuk' &&
      ['kategori', 'belirsiz'].includes(k.kapsam);
    out.push({
      metin: k.metin,
      kapsam: k.kapsam,
      kategori: k.kategori,
      minSepet: k.minSepet,
      indirim: k.indirim,
      kodu: k.kodu,
      guven: k.guven,
      kosulMetni: kosulParcalari.length ? kosulParcalari.join(' · ') : null,
      uygulanabilir,
      onizleme,
    });
  }
  return out;
}

/** Test/teşhis: bir site için kayıtlı kampanyalar. */
export function siteKampanyalari(siteId) {
  if (!veri) veri = bosVeri();
  return veri.siteler[siteId]?.kampanyalar || [];
}
