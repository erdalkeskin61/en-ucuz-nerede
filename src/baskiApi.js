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
import { extractColors } from './util.js';

const sayi = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

/**
 * Radar durumundaki STOKLU filamentleri ₺/kg'ye göre artan sırada döndürür.
 * @param {{limit?:number}} [opts]
 */
export function enUcuzFilamentler(opts = {}) {
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 12));
  let satirlar = [];
  try {
    satirlar = dbBaglantisi().prepare(`
      SELECT katalog_id, urun, site, site_id, fiyat, stokta, ts, veri
      FROM radar_durum WHERE stokta = 1 ORDER BY fiyat ASC
    `).all();
  } catch {
    return { ok: true, guncelleme: null, toplam: 0, filamentler: [], neden: 'Veritabanı okunamadı.' };
  }

  const liste = [];
  const gorulen = new Set();
  let guncelleme = 0;

  for (const r of satirlar) {
    let d = null;
    try { d = JSON.parse(r.veri); } catch { continue; }
    if (!d || typeof d !== 'object') continue;
    if (String(d.kategori || '').toLowerCase() !== 'filament') continue;

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
      siteId: d.site_id || d.siteId || null,
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

  liste.sort((a, b) => a.tlKg - b.tlKg);
  return {
    ok: true,
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
      const veri = enUcuzFilamentler({ limit: req.query.limit });
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
        const fil = enUcuzFilamentler({ limit: 50 }).filamentler
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
