/**
 * Sepet kupon otomasyonu — 2026-10-28
 *
 * NE YAPAR: sepetteki mağaza gruplarının ARA TOPLAMI ile o mağazanın kampanyalarını
 * karşılaştırır ve "bu kuponu şimdi kullanırsan ödeyeceğin tutar" hesabını yapar.
 * Kodu olan kampanyalarda kopyalanabilir kod döner; kodu olmayan (sepette otomatik
 * uygulanan) kampanyalarda "kod gerekmiyor" der.
 *
 * DÜRÜSTLÜK KURALLARI (proje kuralı):
 *  - Kod UYDURULMAZ. Kampanya verisinde `kodu` alanı yoksa kod dönmez.
 *  - Kupon, yalnızca koşulları GERÇEKTEN karşılıyorsa "uygulanabilir" işaretlenir:
 *      · minSepet varsa: grup ara toplamı >= minSepet
 *      · kategori varsa: gruptaki bir ürünün başlığı kategoriyi içermeli
 *      · ödeme yöntemi koşulu (havale/EFT/tek çekim) → uygulanamaz, yalnız bilgi
 *      · üyelik/uygulama/kart koşulu → uygulanamaz, yalnız bilgi
 *  - İndirim tutarı, ürün tutarını aşamaz ve negatif olamaz.
 *  - Kampanya fiyata ZATEN yansımışsa (`fiyataDahil`) ikinci kez düşülmez.
 *  - Kargo hesabına dokunulmaz; yalnızca ÜRÜN toplamı üzerinden indirim gösterilir
 *    (kargo eşiği kuponla değişebileceği için bu ayrıca uyarı olarak yazılır).
 */
import { siteKampanyalari } from './kuponlar.js';
import { toLowerTr, formatTL } from './util.js';

/** Ödeme yöntemi koşulu içeren kampanyalar herkes için geçerli değildir. */
const ODEME_KOSULU_RE = /havale|eft|tek çekim|peşin ödeme|kredi kartına|banka kartına/i;
/** Yalnızca belirli bir kitleye açık kampanyalar. */
const KOSULLU_KAPSAM = new Set(['uyelik', 'uygulama', 'kart']);

/** Bir kampanyanın indirim tutarını (TL) hesaplar; hesaplanamıyorsa null. */
export function indirimTutari(kampanya, araToplam) {
  const ind = kampanya?.indirim;
  if (!ind || !Number.isFinite(Number(araToplam)) || araToplam <= 0) return null;
  const deger = Number(ind.deger);
  if (!Number.isFinite(deger) || deger <= 0) return null;
  let tutar = ind.tip === 'yuzde' ? (araToplam * deger) / 100 : deger;
  if (!Number.isFinite(tutar) || tutar <= 0) return null;
  // İndirim ürün tutarını aşamaz
  tutar = Math.min(tutar, araToplam);
  return Math.round(tutar * 100) / 100;
}

/**
 * Bir mağaza grubu için kampanyaları değerlendirir.
 *
 * @param {{site:string, siteName?:string, araToplam:number, urunler:Array<{ad?:string,title?:string}>}} grup
 * @param {object} [opts] { kampanyalar } → test enjeksiyonu
 * @returns {{
 *   site:string, siteName:string, araToplam:number,
 *   kuponlar:Array<object>, enIyi:object|null, toplamKazanc:number
 * }}
 */
export function grupKuponlari(grup, opts = {}) {
  const site = String(grup?.site || '');
  const araToplam = Number(grup?.araToplam);
  const siteName = grup?.siteName || site;
  const liste = Array.isArray(opts.kampanyalar) ? opts.kampanyalar : siteKampanyalari(site);
  const urunBasliklari = (grup?.urunler || [])
    .map(u => toLowerTr(String(u?.ad || u?.title || '')))
    .filter(Boolean);
  const tumMetin = urunBasliklari.join(' | ');

  if (!liste.length || !Number.isFinite(araToplam) || araToplam <= 0) {
    return { site, siteName, araToplam: Number.isFinite(araToplam) ? araToplam : 0, kuponlar: [], enIyi: null, toplamKazanc: 0 };
  }

  const simdi = new Date();
  const kuponlar = [];

  for (const k of liste) {
    // Süresi geçmiş
    if (k.bitis && new Date(k.bitis + 'T23:59:59') < simdi) continue;

    const kosullar = [];
    let uygulanabilir = true;

    // Kategori: gruptaki en az bir ürün eşleşmeli
    let kategoriUyum = null;
    if (k.kategori) {
      const kelimeler = toLowerTr(String(k.kategori)).split(/[\s,/-]+/).filter(w => w.length >= 3);
      kategoriUyum = kelimeler.length > 0 && kelimeler.some(w => tumMetin.includes(w));
      if (!kategoriUyum) uygulanabilir = false;
      if (!kategoriUyum) continue; // sepette o kategoriden ürün yok → listeye hiç koyma
    }

    // Sepet alt limiti
    if (k.minSepet != null && Number(k.minSepet) > 0) {
      if (araToplam < Number(k.minSepet)) {
        uygulanabilir = false;
        kosullar.push(`${formatTL(Number(k.minSepet))} sepet alt limiti (şu an ${formatTL(araToplam)})`);
      }
    }

    // Ödeme yöntemi koşulu
    if (ODEME_KOSULU_RE.test(String(k.metin || ''))) {
      uygulanabilir = false;
      kosullar.push('ödeme yöntemi koşulu');
    }

    // Üyelik / uygulama / kart
    if (KOSULLU_KAPSAM.has(k.kapsam)) {
      uygulanabilir = false;
      kosullar.push(k.kapsam === 'uyelik' ? 'üyelere özel'
        : k.kapsam === 'uygulama' ? 'uygulamaya özel' : 'banka kartına özel');
    }

    // Fiyata zaten yansımış indirim ikinci kez düşülmez
    if (k.fiyataDahil === true) {
      uygulanabilir = false;
      kosullar.push('fiyata zaten yansıtılmış');
    }

    // Düşük güven: tahmin edilmiş kampanya → para hesabına sokma
    if (k.guven === 'dusuk') {
      uygulanabilir = false;
      kosullar.push('kampanya metni belirsiz');
    }

    const indirim = uygulanabilir ? indirimTutari(k, araToplam) : null;
    if (uygulanabilir && indirim == null) {
      uygulanabilir = false;
      kosullar.push('indirim tutarı metinden hesaplanamadı');
    }

    const kodu = k.kodu ? String(k.kodu).trim() : null;

    kuponlar.push({
      metin: String(k.metin || '').slice(0, 160),
      kapsam: k.kapsam || null,
      kategori: k.kategori || null,
      kodu,
      kodGerekli: !!kodu,
      // Kodu yoksa ve site geneli ise sepette otomatik uygulanır
      otomatik: !kodu && uygulanabilir,
      minSepet: k.minSepet != null ? Number(k.minSepet) : null,
      indirim: indirim,
      yeniToplam: indirim != null ? Math.round((araToplam - indirim) * 100) / 100 : null,
      uygulanabilir,
      kosullar: kosullar.length ? kosullar.join(' · ') : null,
      guven: k.guven || null,
    });
  }

  // Uygulanabilir olanlar önce, sonra kazanç büyükten küçüğe
  kuponlar.sort((a, b) => {
    if (a.uygulanabilir !== b.uygulanabilir) return a.uygulanabilir ? -1 : 1;
    return (b.indirim || 0) - (a.indirim || 0);
  });

  const uygulananlar = kuponlar.filter(k => k.uygulanabilir && k.indirim > 0);
  const enIyi = uygulananlar[0] || null;

  return {
    site,
    siteName,
    araToplam: Math.round(araToplam * 100) / 100,
    kuponlar: kuponlar.slice(0, 6),
    enIyi,
    toplamKazanc: enIyi ? enIyi.indirim : 0,
  };
}

/**
 * Sepetin tamamı için kupon analizi.
 *
 * @param {Array<{site:string, siteName?:string, araToplam:number, urunler?:Array}>} gruplar
 *   Sepet senaryosunun `gruplar` dizisi (her mağaza bir grup).
 * @param {{kampanyalarBySite?:Record<string, Array>, limit?:number}} [opts]
 * @returns {{
 *   siteler:Array<object>, toplamKazanc:number, kuponluToplam:number|null,
 *   kodlar:Array<{site,siteName,kod,kazanc,metin}>, uyarilar:string[]
 * }}
 */
export function sepetKuponAnalizi(gruplar, opts = {}) {
  const liste = Array.isArray(gruplar) ? gruplar : [];
  const uyarilar = [];
  const siteler = [];
  const kodlar = [];
  let toplamKazanc = 0;
  let toplamAra = 0;
  let bilinenVar = false;

  for (const g of liste) {
    if (!g || !g.site) continue;
    const enjeksiyon = opts.kampanyalarBySite?.[g.site];
    const sonuc = grupKuponlari(g, enjeksiyon ? { kampanyalar: enjeksiyon } : {});
    siteler.push(sonuc);
    toplamAra += sonuc.araToplam;
    if (sonuc.enIyi) {
      toplamKazanc += sonuc.enIyi.indirim;
      bilinenVar = true;
      if (sonuc.enIyi.kodu) {
        kodlar.push({
          site: sonuc.site,
          siteName: sonuc.siteName,
          kod: sonuc.enIyi.kodu,
          kazanc: sonuc.enIyi.indirim,
          metin: sonuc.enIyi.metin,
        });
      }
    }
  }

  uyarilar.push('Kupon indirimi yalnızca ÜRÜN toplamına uygulanır; kargo ayrı hesaplanır '
    + '(kuponla sepet eşiği değişirse kargo da değişebilir).');
  if (!bilinenVar) {
    uyarilar.push('Bu sepet için koşulları karşılayan kupon bulunamadı. '
      + 'Kampanyalar 12 saatte bir güncellenir; Ayarlar → Kupon panosundan elle tazeleyebilirsin.');
  }
  const kodGereken = siteler.flatMap(s => s.kuponlar).filter(k => k.uygulanabilir && k.kodGerekli);
  if (kodGereken.length) {
    uyarilar.push('Kupon kodunu ödeme adımında "indirim kodu" alanına girmen gerekir; kod sepete otomatik eklenmez.');
  }

  return {
    siteler,
    toplamKazanc: Math.round(toplamKazanc * 100) / 100,
    toplamAra: Math.round(toplamAra * 100) / 100,
    kuponluToplam: bilinenVar ? Math.round((toplamAra - toplamKazanc) * 100) / 100 : null,
    kodlar,
    uyarilar,
    kaynak: 'data/kuponlar.json (kampanya toplayıcı)',
  };
}
