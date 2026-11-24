/**
 * 🧮 Baskı Maliyeti Hesaplayıcı API uçları (2026-11-04)
 *
 * Üç uç:
 *   GET  /api/baski/yazicilar          → hazır güç şablonları + varsayılanlar
 *   GET  /api/baski/en-ucuz-filamentler → radar_durum'dan GERÇEK stoklu filamentler
 *   POST /api/baski/hesapla            → maliyet + kârlılık + teklif metni
 *
 * DÜRÜSTLÜK: filament listesi yalnızca `radar_durum`daki gerçek kayıtlardan
 * üretilir. Fiyatı/₺-kg'sı okunamayan kayıt listeye GİRMEZ (uydurma fiyat yok).
 * Liste boşsa uç bunu açıkça söyler; arayüz manuel fiyat girişine yönlendirir.
 */
import {
  maliyetMotoruHesapla, teklifMetni, hammaddeTuruBul,
  YAZICI_SABLONLARI, KAR_SABLONLARI,
  YAZICI_GUC_W, ELEKTRIK_KWH_TL, YIPRANMA_SAAT_TL,
} from './baskiMaliyet.js';
import { dbBaglantisi } from './store.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { extractColors, paraBirimiNormalize } from './util.js';
import { birimFiyatHesapla } from './birimFiyat.js';
import { adapterById, adapterMarket, adapterCurrency, normalizeMarket, PAZARLAR } from './sites/index.js';

const sayi = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

/**
 * Mağaza beslemelerinden (`katalog_urunleri`) stoklu ve doğrulanabilir kg birim
 * fiyatlı filament adaylarını üretir. Yalnızca açık makara gramajı ve filament
 * kategorisi doğrulanan kalemler döndürülür (uydurma gramaj/fiyat yok).
 *
 * @param {{market?:string, gorulen?:Set<string>, limit?:number}} [opts]
 */
export function beslemeFilamentAdaylari(opts = {}) {
  const hedefMarket = normalizeMarket(opts.market || 'tr');
  const beklenenPara = PAZARLAR[hedefMarket]?.currency || 'TRY';
  const hariciGorulen = opts.gorulen instanceof Set ? opts.gorulen : null;
  const limit = opts.limit ? Math.max(1, Number(opts.limit)) : null;

  let satirlar = [];
  try {
    satirlar = dbBaglantisi().prepare(`
      SELECT id, siteId, urunUrl, baslik, fiyat, paraBirimi, guncellemeTs
      FROM katalog_urunleri
      WHERE stokta = 1 AND fiyat > 0 AND length(baslik) >= 8
      ORDER BY fiyat ASC, guncellemeTs DESC
    `).all();
  } catch {
    return [];
  }

  let ayarlar = {};
  try { ayarlar = afiliyeAyarlari(); } catch { ayarlar = {}; }

  const adaylar = [];
  const yerelGorulen = new Set();

  for (const r of satirlar) {
    const adpt = r.siteId ? adapterById(r.siteId) : null;
    const rowMarket = adpt ? adapterMarket(adpt) : 'tr';
    if (rowMarket !== hedefMarket) continue;

    const rowPara = r.paraBirimi
      ? paraBirimiNormalize(r.paraBirimi)
      : (adpt ? adapterCurrency(adpt) : beklenenPara);
    if (rowPara !== beklenenPara) continue;

    const fiyat = sayi(r.fiyat);
    if (!fiyat || fiyat <= 0) continue;

    const ad = String(r.baslik || '').trim();
    const hamUrl = String(r.urunUrl || '').trim();
    if (!ad || !hamUrl) continue;
    if (/hediye\s*çeki|kargo\s*fark|test\s*ürün|numune|broşür|etiket\s*rulo|gift\s*card|carte\s*cadeau/i.test(ad)) continue;

    const bf = birimFiyatHesapla(ad, fiyat, rowPara);
    if (!bf || bf.tur !== 'filament' || bf.birim !== 'kg') continue;
    const makaraGram = Math.round(Number(bf.gram) || 0);
    const tlKg = Number(bf.birimFiyat);
    if (makaraGram < 100 || !Number.isFinite(tlKg) || tlKg <= 0) continue;

    const anahtar = ad.toLocaleLowerCase('tr-TR');
    if (hariciGorulen?.has(anahtar) || yerelGorulen.has(anahtar)) continue;

    let url = hamUrl;
    try {
      const bagli = afiliyeLink(r.siteId, hamUrl, ayarlar);
      if (bagli) url = bagli;
    } catch { /* ham URL korunur */ }

    const hammadde = hammaddeTuruBul(ad);
    const renkler = extractColors(ad);

    yerelGorulen.add(anahtar);
    adaylar.push({
      id: Number(r.id) || null,
      katalogId: null,
      ad,
      ilan: ad,
      site: adpt?.name || r.siteId || 'Mağaza',
      siteId: r.siteId || null,
      market: rowMarket,
      paraBirimi: rowPara,
      fiyat: Math.round(fiyat * 100) / 100,
      tlKg,
      makaraGram,
      birimMetni: bf.rozetMetni || null,
      renk: renkler[0] || null,
      malzeme: hammadde?.ad || 'PLA',
      malzemeTuru: hammadde?.tur || null,
      rozet: hammadde?.rozet || null,
      kargo: null,
      stok: true,
      url,
      afiliye: url !== hamUrl,
      ts: Number(r.guncellemeTs) || null,
    });
  }

  adaylar.sort((a, b) => a.tlKg - b.tlKg);
  return limit ? adaylar.slice(0, limit) : adaylar;
}

/**
 * Radar durumundaki STOKLU filamentleri (ve eksik kalan pazarlarda `katalog_urunleri`
 * mağaza beslemelerini) birim fiyata göre artan sırada döndürür.
 * @param {{limit?:number, market?:string}} [opts]
 */
export function enUcuzFilamentler(opts = {}) {
  const limit = Math.max(1, Math.min(250, Number(opts.limit) || 12));
  const hedefMarket = opts.market ? normalizeMarket(opts.market) : 'tr';
  const varsayilanPara = PAZARLAR[hedefMarket]?.currency || 'TRY';
  let satirlar = [];
  try {
    satirlar = dbBaglantisi().prepare(`
      SELECT katalog_id, urun, site, site_id, fiyat, stokta, ts, veri
      FROM radar_durum WHERE stokta = 1 ORDER BY fiyat ASC
    `).all();
  } catch {
    return { ok: true, market: hedefMarket, paraBirimi: varsayilanPara, guncelleme: null, toplam: 0, filamentler: [], neden: 'Veritabanı okunamadı.' };
  }

  const liste = [];
  const gorulen = new Set();
  let guncelleme = 0;

  for (const r of satirlar) {
    let d = null;
    try { d = JSON.parse(r.veri); } catch { continue; }
    if (!d || typeof d !== 'object') continue;
    if (String(d.kategori || '').toLowerCase() !== 'filament') continue;

    const sid = d.site_id || d.siteId || r.site_id || null;
    const adpt = sid ? adapterById(sid) : null;
    const rowMarket = normalizeMarket(d.market || (adpt ? adapterMarket(adpt) : 'tr'));
    if (rowMarket !== hedefMarket) continue;

    const fiyat = sayi(r.fiyat);
    if (!fiyat || fiyat <= 0) continue;

    const ad = String(d.ad || r.urun || '').trim();
    if (!ad) continue;

    // ₺/kg: kartın hesapladığı birim fiyat; yoksa başlıktaki gramajdan türetilir.
    let tlKg = sayi(d.birimFiyat);
    if (!tlKg) {
      const m = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/i.exec(String(d.urun || ad));
      if (m) {
        const miktar = parseFloat(String(m[1]).replace(',', '.'));
        const birim = m[2].toLowerCase();
        const gram = birim === 'kg' ? miktar * 1000 : miktar;
        if (gram >= 100) tlKg = Math.round((fiyat / (gram / 1000)) * 100) / 100;
      }
    }
    if (!tlKg || tlKg <= 0) continue; // ₺/kg bilinmiyorsa listeye girmez (dürüst)

    // Aynı katalog ürünü birden fazla mağazada olabilir; ad başına tek kayıt.
    const anahtar = ad.toLocaleLowerCase('tr-TR');
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);

    const url = d.afiliyeUrl || d.hamUrl || null;
    if (!url) continue;

    const hammadde = hammaddeTuruBul(`${ad} ${d.urun || ''}`);
    const renkler = extractColors(`${ad} ${d.urun || ''}`);

    liste.push({
      id: Number(r.katalog_id),
      ad,
      ilan: d.urun || null,
      site: d.site || null,
      siteId: sid,
      market: rowMarket,
      paraBirimi: d.paraBirimi || (adpt ? adapterCurrency(adpt) : varsayilanPara),
      fiyat,
      tlKg,
      birimMetni: d.birimMetni || null,
      renk: renkler[0] || null,
      malzeme: hammadde?.ad || 'PLA',
      malzemeTuru: hammadde?.tur || null,
      rozet: hammadde?.rozet || null,
      kargo: d.kargo || null,
      ts: Number(r.ts) || null,
      url,
      afiliye: !!(d.afiliyeUrl && d.afiliyeUrl !== d.hamUrl),
    });
    guncelleme = Math.max(guncelleme, Number(r.ts) || 0);
    if (liste.length >= limit) break;
  }

  if (liste.length < limit) {
    const ekler = beslemeFilamentAdaylari({
      market: hedefMarket,
      gorulen,
      limit: limit - liste.length,
    });
    for (const ek of ekler) {
      liste.push(ek);
      guncelleme = Math.max(guncelleme, Number(ek.ts) || 0);
    }
  }

  liste.sort((a, b) => a.tlKg - b.tlKg);
  return {
    ok: true,
    market: hedefMarket,
    paraBirimi: varsayilanPara,
    guncelleme: guncelleme || null,
    toplam: liste.length,
    filamentler: liste,
    neden: liste.length ? null : 'Radar taramasında stoklu filament bulunamadı; manuel fiyat girin.',
  };
}

/** Express uçlarını bağlar. */
export function baskiApiBagla(app) {
  app.get('/api/baski/yazicilar', (req, res) => {
    res.json({
      ok: true,
      yazicilar: YAZICI_SABLONLARI,
      karSablonlari: KAR_SABLONLARI,
      varsayilan: {
        gucW: YAZICI_GUC_W,
        kwhTl: ELEKTRIK_KWH_TL,
        yipranmaSaatTl: YIPRANMA_SAAT_TL,
        gramaj: 160,
        sureSaat: 4,
        karCarpani: 2.5,
      },
    });
  });

  app.get('/api/baski/en-ucuz-filamentler', (req, res) => {
    try {
      const veri = enUcuzFilamentler({ limit: req.query.limit, market: req.query.market });
      res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      res.json(veri);
    } catch (e) {
      res.status(500).json({ ok: false, hata: String(e.message || e) });
    }
  });

  app.post('/api/baski/hesapla', (req, res) => {
    try {
      const b = req.body || {};
      // İstemci yalnızca göstermek için hesaplar; bu uç doğrulama/teklif içindir.
      let tlKg = sayi(b.filamentTlKg);
      let kaynak = b.filamentKaynak || null;
      let ad = b.malzemeAdi || null;
      let renk = b.renk || null;

      // Canlı filament seçildiyse fiyatı SUNUCUDA tazele: istemciye güvenilmez,
      // böylece bayat/eski fiyatla teklif üretilmez.
      if (b.filamentId != null) {
        const fil = enUcuzFilamentler({ limit: 50, market: b.market }).filamentler
          .find(x => Number(x.id) === Number(b.filamentId));
        if (!fil) {
          return res.status(404).json({
            ok: false,
            hata: 'Seçilen filament radar durumunda bulunamadı (stoktan düşmüş olabilir). '
              + 'Listeyi yenileyin ya da manuel fiyat girin.',
          });
        }
        tlKg = fil.tlKg;
        ad = ad || fil.ad;
        renk = renk || fil.renk;
        let url = fil.url;
        try { url = afiliyeLink(fil.siteId, fil.url, afiliyeAyarlari()) || fil.url; } catch { /* ham link */ }
        kaynak = {
          id: fil.id, site: fil.site, siteId: fil.siteId,
          url, hamUrl: fil.url, fiyat: fil.fiyat, tlKg: fil.tlKg,
        };
      }

      const hesap = maliyetMotoruHesapla({
        gramaj: b.gramaj,
        sureSaat: b.sureSaat,
        gucW: b.gucW,
        kwhTl: b.kwhTl,
        yipranmaSaatTl: b.yipranmaSaatTl,
        karCarpani: b.karCarpani,
        filamentTlKg: tlKg,
        malzemeAdi: ad,
        renk,
        filamentKaynak: kaynak,
      });

      if (!hesap.gecerli) {
        return res.status(400).json({ ok: false, hata: hesap.neden, hesap });
      }
      res.json({ ok: true, hesap, teklif: teklifMetni(hesap) });
    } catch (e) {
      res.status(500).json({ ok: false, hata: String(e.message || e) });
    }
  });
}
