/**
 * 🔍 Programatik SEO & SSR Ürün / Kategori Sayfaları — 2026-11-22
 *
 * Amaç: Google / Bing botlarının arama kutusunun arkasında kalan 3D yazıcı,
 * filament ve reçine sayfalarını doğrudan dizine ekleyebilmesi:
 *   - GET /urun/:slug       → ürün karşılaştırma özeti, kargo dahil fiyat tablosu,
 *                             JSON-LD Product + AggregateOffer + BreadcrumbList
 *   - GET /kategori/:slug   → kategori vitrini + ItemList JSON-LD
 *   - GET /urunler          → tüm kategoriler ve katalog ürünleri dizini
 *   - sitemapKayitlari()    → /sitemap.xml için dinamik URL listesi
 *
 * Dürüstlük ilkesi: fiyat/stok yalnızca veritabanındaki gerçek `radar_durum`
 * ve `anlikOnbellek` kayıtlarından okunur; kayıt yoksa uydurma fiyat basılmaz,
 * doğrudan canlı tarama butonuna yönlendirilir.
 */
import { katalogGetir, radarDurumVerisi } from './otonomRadar.js';
import { anlikAl, sorgudanAnlikAl, BAYAT_SWR_MAX_YAS_MS } from './anlikOnbellek.js';
import { formatTL } from './util.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';

const SNAPSHOT_MAX_YAS_MS = Math.max(BAYAT_SWR_MAX_YAS_MS, 30 * 86400000);

/** Türkçe karakterleri temizleyerek kararlı URL slug'ı üretir. */
export function slugYap(metin) {
  const trMap = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return String(metin || '')
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, ch => trMap[ch] || ch)
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'urun';
}

export function htmlKacis(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonLdMetni(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function guvenliAfiliyeUrl(siteId, hamUrl, ayarlar) {
  if (!hamUrl) return null;
  try {
    return siteId ? afiliyeLink(siteId, hamUrl, ayarlar) : hamUrl;
  } catch {
    return hamUrl;
  }
}

export const SEO_KATEGORILER = Object.freeze([
  {
    slug: '3d-yazici',
    ad: '3D Yazıcı Fiyatları',
    kisaAd: '3D Yazıcılar',
    aciklama: 'Creality Ender 3 V3, K1 Max, Bambu Lab P1S, A1 Mini ve Anycubic 3D yazıcıların Türkiye mağazalarındaki kargo dahil en ucuz güncel fiyatları.',
    eslesirMi: (k) => k.kategori === 'yazici' || /yazıcı|printer|ender|kobra|neptune|bambu|k1|p1s|a1\s*mini|x1c/i.test(`${k.ad} ${k.sorgu}`),
  },
  {
    slug: 'pla-filament',
    ad: 'PLA & PLA+ Filament Fiyatları',
    kisaAd: 'PLA Filament',
    aciklama: 'eSun PLA+, Porima PLA, Creality Ender PLA, Sunlu ve Microzey 1.75mm PLA filamentlerde 60+ mağaza kargo dahil en düşük fiyatlar.',
    eslesirMi: (k) => k.kategori === 'filament' && /\bpla\b|pla\+|epla|hyper/i.test(`${k.ad} ${k.sorgu}`),
  },
  {
    slug: 'petg-tpu-filament',
    ad: 'PETG, TPU & ABS Filament Fiyatları',
    kisaAd: 'PETG / TPU / ABS',
    aciklama: 'Yüksek dayanımlı PETG, esnek TPU ve teknik ABS/ASA filamentlerin kargo dahil canlı karşılaştırması ve ₺/kg birim fiyatları.',
    eslesirMi: (k) => k.kategori === 'filament' && /\b(petg|tpu|abs|asa|cf|pa|nylon)\b/i.test(`${k.ad} ${k.sorgu}`),
  },
  {
    slug: 'filament',
    ad: 'Tüm 3D Filament Fiyatları',
    kisaAd: 'Tüm Filamentler',
    aciklama: 'Türkiye\'deki tüm 3D baskı mağazalarında PLA, PETG, TPU, ABS ve Hyper filamentlerin kilogram başı en ucuz kargo dahil fiyatları.',
    eslesirMi: (k) => k.kategori === 'filament',
  },
  {
    slug: 'recine-ve-sarf',
    ad: '3D Reçine, Kurutucu & Yedek Parça',
    kisaAd: 'Reçine & Sarf',
    aciklama: 'UV 3D yazıcı reçineleri, filament kurutucular, sertleştirilmiş nozzle uçları ve 3D baskı sarf malzemelerinde en ucuz teklifler.',
    eslesirMi: (k) => /reçine|recine|resin|kurutucu|dryer|nozzle|tabla|hotend/i.test(`${k.ad} ${k.sorgu}`) || (k.kategori === 'genel' && !/yazıcı|printer/i.test(k.ad)),
  },
]);

function anaKategoriSlugBul(k) {
  if (k.kategori === 'yazici') return '3d-yazici';
  if (/reçine|recine|resin|kurutucu|dryer|nozzle|tabla|hotend/i.test(`${k.ad} ${k.sorgu}`)) return 'recine-ve-sarf';
  if (k.kategori === 'filament' && /\b(petg|tpu|abs|asa|cf|pa|nylon)\b/i.test(`${k.ad} ${k.sorgu}`)) return 'petg-tpu-filament';
  if (k.kategori === 'filament') return 'pla-filament';
  return 'filament';
}

function teklifListesiTopla(kayit, durum, snapshot, afiliyeAyar) {
  const harita = new Map();

  // 1) En güncel tam snapshot teklifleri (kargo dahil tüm mağazalar)
  const sonuclar = Array.isArray(snapshot?.payload?.sonuclar) ? snapshot.payload.sonuclar : [];
  for (const r of sonuclar) {
    if (r?.status !== 'found' || !r?.product) continue;
    if (r.renkAyni === false) continue;
    const pr = r.product.pricing || {};
    const toplam = Number(pr.toplam ?? pr.araToplam ?? r.product.sellingPrice);
    if (!Number.isFinite(toplam) || toplam <= 0) continue;
    const siteId = r.site || '';
    const siteAd = r.siteName || siteId;
    const stokta = r.product.inStock !== false;
    const kargoUygulanir = pr.kargo?.uygulanir;
    const kargoUcret = Number(pr.kargo?.ucret);
    const kargoMetni = kargoUygulanir === false
      ? 'Ücretsiz Kargo'
      : (kargoUygulanir === true && Number.isFinite(kargoUcret) && kargoUcret > 0
        ? `+${formatTL(kargoUcret)} kargo dahil`
        : 'Kargo sepette');

    const anahtar = siteId || siteAd.toLowerCase();
    const mevcut = harita.get(anahtar);
    if (!mevcut || (stokta && !mevcut.stokta) || (stokta === mevcut.stokta && toplam < mevcut.fiyat)) {
      harita.set(anahtar, {
        siteId,
        site: siteAd,
        baslik: r.product.title || kayit.ad,
        fiyat: Math.round(toplam * 100) / 100,
        urunFiyati: Number(pr.araToplam ?? r.product.sellingPrice) || null,
        stokta,
        kargo: kargoMetni,
        url: r.product.afiliyeUrl || guvenliAfiliyeUrl(siteId, r.product.url, afiliyeAyar),
      });
    }
  }

  // 2) Snapshot yoksa veya eskiyse radar_durum verisinden besle
  if (!harita.size && durum) {
    if (durum.fiyat > 0 && durum.site) {
      harita.set(durum.siteId || durum.site, {
        siteId: durum.siteId || '',
        site: durum.site,
        baslik: durum.urun || kayit.ad,
        fiyat: Number(durum.fiyat),
        urunFiyati: null,
        stokta: durum.stokta !== false,
        kargo: durum.kargo || 'Kargo bilgisi',
        url: durum.afiliyeUrl || guvenliAfiliyeUrl(durum.siteId, durum.hamUrl, afiliyeAyar),
      });
    }
    for (const d of Array.isArray(durum.digerleri) ? durum.digerleri : []) {
      if (!d?.site || !(Number(d.fiyat) > 0)) continue;
      const k = d.siteId || d.site;
      if (!harita.has(k)) {
        harita.set(k, {
          siteId: d.siteId || '',
          site: d.site,
          baslik: kayit.ad,
          fiyat: Number(d.fiyat),
          urunFiyati: null,
          stokta: true,
          kargo: d.kargo || 'Kargo bilgisi',
          url: null,
        });
      }
    }
  }

  return [...harita.values()].sort((a, b) => {
    if (a.stokta !== b.stokta) return a.stokta ? -1 : 1;
    return a.fiyat - b.fiyat;
  });
}

/**
 * Aktif katalog ürünlerini SEO/SSR sayfası için hazırlar.
 * @returns {Array<object>}
 */
export function seoUrunListesi() {
  let kayitlar = [];
  try {
    kayitlar = katalogGetir({ sadeceAktif: true });
  } catch {
    return [];
  }

  const afiliyeAyar = afiliyeAyarlari();
  const kullanilanSluglar = new Set();

  return kayitlar.map((k) => {
    let slug = slugYap(k.ad);
    if (kullanilanSluglar.has(slug)) slug = `${slug}-${k.id}`;
    kullanilanSluglar.add(slug);

    const durum = radarDurumVerisi(k.id);
    let snapshot = null;
    try {
      snapshot = (k.url ? anlikAl(k.url, { maxYasMs: SNAPSHOT_MAX_YAS_MS }) : null)
        || sorgudanAnlikAl(k.sorgu || k.ad, { maxYasMs: SNAPSHOT_MAX_YAS_MS });
    } catch { snapshot = null; }

    const teklifler = teklifListesiTopla(k, durum, snapshot, afiliyeAyar);
    const stoklu = teklifler.filter(t => t.stokta && t.fiyat > 0);
    const enIyi = stoklu[0] || null;
    const enPahali = stoklu.length ? stoklu[stoklu.length - 1] : null;
    const snapshotTs = snapshot?.ts ? Number(snapshot.ts) : 0;
    const durumTs = durum?.ts ? Number(durum.ts) : 0;
    const sonTs = Math.max(snapshotTs, durumTs) || null;
    const katSlug = anaKategoriSlugBul(k);

    return {
      id: k.id,
      ad: k.ad,
      sorgu: k.sorgu || k.ad,
      kaynakUrl: k.url || null,
      kategori: k.kategori || 'genel',
      kategoriSlug: katSlug,
      slug,
      yol: `/urun/${slug}`,
      teklifler,
      enUcuzFiyat: enIyi ? enIyi.fiyat : (durum?.stokta && durum?.fiyat > 0 ? Number(durum.fiyat) : null),
      enUcuzSite: enIyi ? enIyi.site : (durum?.site || null),
      enUcuzUrl: enIyi?.url || durum?.afiliyeUrl || null,
      enPahaliFiyat: enPahali ? enPahali.fiyat : (durum?.enPahaliFiyat || null),
      stokluSayisi: stoklu.length || Number(durum?.stokluSayisi || 0),
      gorsel: snapshot?.payload?.kaynak?.image || null,
      marka: snapshot?.payload?.kaynak?.brand || null,
      modelKodu: snapshot?.payload?.kaynak?.modelKodu || null,
      barkod: snapshot?.payload?.kaynak?.barkod || null,
      birimMetni: durum?.birimMetni || null,
      sonTs,
      lastmod: sonTs ? new Date(sonTs).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
  });
}

export function seoUrunBul(slugOrId) {
  const ham = String(slugOrId || '').trim().toLowerCase();
  if (!ham) return null;
  const liste = seoUrunListesi();
  return liste.find(u => u.slug === ham)
    || (/^\d+$/.test(ham) ? liste.find(u => u.id === Number(ham)) : null)
    || null;
}

export function sitemapKayitlari() {
  const bugun = new Date().toISOString().slice(0, 10);
  const kayitlar = [
    { yol: '/', oncelik: '1.0', siklik: 'daily', lastmod: bugun },
    { yol: '/urunler', oncelik: '0.9', siklik: 'daily', lastmod: bugun },
    { yol: '/maliyet.html', oncelik: '0.8', siklik: 'weekly', lastmod: bugun },
    { yol: '/sepet.html', oncelik: '0.8', siklik: 'weekly', lastmod: bugun },
    { yol: '/slicer.html', oncelik: '0.7', siklik: 'weekly', lastmod: bugun },
  ];
  for (const kat of SEO_KATEGORILER) {
    kayitlar.push({ yol: `/kategori/${kat.slug}`, oncelik: '0.85', siklik: 'daily', lastmod: bugun });
  }
  for (const u of seoUrunListesi()) {
    kayitlar.push({ yol: u.yol, oncelik: '0.8', siklik: 'daily', lastmod: u.lastmod || bugun });
  }
  return kayitlar;
}

/* ------------------------------------------------------------------ */
/* HTML Şablon Çerçevesi                                               */
/* ------------------------------------------------------------------ */

function sayfaIskeleti({ title, description, canonicalUrl, ogImage, ogType = 'website', extraMeta = '', jsonLdList = [], govdeHtml }) {
  const safeTitle = htmlKacis(title);
  const safeDesc = htmlKacis(description);
  const safeUrl = htmlKacis(canonicalUrl);
  const safeImg = htmlKacis(ogImage);
  const safeOgType = htmlKacis(ogType);
  const jsonScripts = jsonLdList
    .map(o => `<script type="application/ld+json">${jsonLdMetni(o)}</script>`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="tr" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />
  <link rel="canonical" href="${safeUrl}" />
  <meta name="theme-color" content="#4338CA" />
  <meta property="og:type" content="${safeOgType}" />
  <meta property="og:site_name" content="Baskı Hesap" />
  <meta property="og:locale" content="tr_TR" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:image" content="${safeImg}" />${extraMeta ? '\n  ' + extraMeta : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  <link rel="icon" href="/ikon-192.png" />
  <link rel="apple-touch-icon" href="/ikon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script>
    try {
      var t = localStorage.getItem('tema');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .seo-kapsam { max-width: 1080px; margin: 24px auto 48px; padding: 0 16px; }
    .seo-yol { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; color: var(--gri-metin); margin-bottom: 16px; }
    .seo-yol a { color: var(--ana); text-decoration: none; font-weight: 600; }
    .seo-kart { background: var(--kart); border: 1px solid var(--cizgi); border-radius: 20px; padding: 24px; box-shadow: 0 14px 34px -26px rgba(15,23,42,.3); margin-bottom: 22px; }
    .seo-ust { display: grid; grid-template-columns: 110px 1fr; gap: 20px; align-items: center; }
    .seo-gorsel { width: 110px; height: 110px; border-radius: 14px; object-fit: contain; background: #fff; border: 1px solid var(--cizgi); padding: 6px; }
    .seo-baslik { margin: 0 0 8px; font-size: clamp(22px, 3vw, 30px); line-height: 1.2; font-weight: 800; letter-spacing: -.02em; }
    .seo-alt { margin: 0 0 14px; color: var(--gri-metin); font-size: 14.5px; line-height: 1.5; }
    .seo-fiyat-kutu { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(16,185,129,.12), rgba(52,80,209,.08)); border: 1px solid rgba(16,185,129,.35); margin: 14px 0; }
    .seo-fiyat-ana { font-size: 28px; font-weight: 800; color: #059669; }
    html[data-theme="dark"] .seo-fiyat-ana { color: #34D399; }
    .seo-butonlar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .seo-cta { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px; font-weight: 800; font-size: 14px; text-decoration: none; color: #fff; background: linear-gradient(135deg, #3450D1 0%, #4338CA 100%); box-shadow: 0 8px 20px -10px rgba(67,56,202,.8); }
    .seo-cta.ikincil { background: var(--kart); color: var(--metin); border: 1px solid var(--cizgi); box-shadow: none; }
    .seo-tablo { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .seo-tablo th, .seo-tablo td { padding: 12px 10px; text-align: left; border-bottom: 1px solid var(--cizgi); font-size: 14px; }
    .seo-tablo th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--gri-metin); }
    .seo-izgara { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .seo-mini-kart { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 16px; background: var(--kart); border: 1px solid var(--cizgi); text-decoration: none; color: inherit; transition: transform .14s ease, border-color .14s ease; }
    .seo-mini-kart:hover { transform: translateY(-2px); border-color: var(--ana); }
    .seo-mini-ad { font-weight: 700; font-size: 15px; line-height: 1.35; }
    .seo-mini-fiyat { font-weight: 800; font-size: 18px; color: #059669; }
    html[data-theme="dark"] .seo-mini-fiyat { color: #34D399; }
    .seo-mini-alt { font-size: 12.5px; color: var(--gri-metin); }
    .seo-kat-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .seo-kat-hap { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--cizgi); background: var(--kart); color: var(--metin); text-decoration: none; font-size: 13px; font-weight: 700; }
    .seo-kat-hap.etkin { background: var(--ana); color: #fff; border-color: var(--ana); }
    @media (max-width: 640px) { .seo-ust { grid-template-columns: 1fr; } .seo-gorsel { width: 84px; height: 84px; } }
  </style>
  ${jsonScripts}
</head>
<body>
  <header class="ustbar">
    <div class="kap">
      <a class="logo" href="/" aria-label="Baskı Hesap — ana sayfa">
        <img class="logo-gorsel" src="/logo.png" alt="Baskı Hesap" width="36" height="30" decoding="async" />
      </a>
      <nav class="menu">
        <a href="/">Karşılaştır</a>
        <a href="/urunler" class="etkin">🗂️ Katalog</a>
        <a href="/maliyet.html">🧮 Maliyet</a>
        <a href="/sepet.html">🧺 Akıllı Sepet</a>
        <a href="/slicer.html">🧩 Eklenti</a>
      </nav>
    </div>
  </header>

  <main class="seo-kapsam">
    ${govdeHtml}
  </main>

  <footer class="altbar">
    <div class="kap">
      <div class="footer-marka">
        <img class="footer-marka-logo" src="/logo.png" alt="Baskı Hesap" width="34" height="29" decoding="async" />
        <a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>
      </div>
      <p>Fiyatlar Türkiye mağazalarından anlık okunur; kargo ve herkesin yararlanabileceği indirimler dahildir. Güncel fiyat için "Canlı Fiyatları Şimdi Tara" ile anlık kontrol edebilirsiniz.</p>
    </div>
  </footer>
</body>
</html>`;
}

export function urunSayfasiHtml(urun, tabanUrl, tumUrunler = []) {
  const kat = SEO_KATEGORILER.find(c => c.slug === urun.kategoriSlug) || SEO_KATEGORILER[0];
  const canliTaraUrl = `/?url=${encodeURIComponent(urun.sorgu || urun.ad)}`;
  const enUcuzEk = urun.enUcuzFiyat > 0 ? ` (${formatTL(urun.enUcuzFiyat)})` : '';
  const title = `${urun.ad} En Ucuz Fiyatı${enUcuzEk} — Baskı Hesap`;
  const description = urun.enUcuzFiyat > 0
    ? `${urun.ad} kargo dahil en ucuz ${formatTL(urun.enUcuzFiyat)} (${urun.enUcuzSite || 'mağaza'}). ${urun.stokluSayisi || 1} mağazada stoklu teklifleri karşılaştır.`
    : `${urun.ad} Türkiye 3D baskı ve e-ticaret mağazalarında kargo dahil canlı fiyat karşılaştırması. Tek tıkla güncel fiyatları tara.`;

  const tabloSatirlari = urun.teklifler.map((t, idx) => `
    <tr>
      <td><b>${htmlKacis(t.site)}</b>${idx === 0 && t.stokta ? ' 🏷️' : ''}</td>
      <td>${htmlKacis(String(t.baslik || urun.ad).slice(0, 85))}</td>
      <td>${htmlKacis(t.kargo)}</td>
      <td>${t.stokta ? '🟢 Stokta' : '🔴 Tükendi'}</td>
      <td><b>${formatTL(t.fiyat)}</b></td>
      <td>${t.url ? `<a href="${htmlKacis(t.url)}" target="_blank" rel="noopener sponsored nofollow">Mağazaya Git ↗</a>` : '—'}</td>
    </tr>`).join('');

  const benzerler = tumUrunler
    .filter(x => x.id !== urun.id && x.kategoriSlug === urun.kategoriSlug)
    .slice(0, 6);

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: kat.ad, item: `${tabanUrl}/kategori/${kat.slug}` },
        { '@type': 'ListItem', position: 3, name: urun.ad, item: `${tabanUrl}${urun.yol}` },
      ],
    },
  ];

  if (urun.enUcuzFiyat > 0) {
    const gecerlilikTarihi = new Date((urun.sonTs || Date.now()) + 7 * 86400000).toISOString().slice(0, 10);
    const stokluTeklifler = (urun.teklifler || []).filter(t => t.stokta && Number(t.fiyat) > 0);
    const altTeklifler = stokluTeklifler.slice(0, 12).map(t => ({
      '@type': 'Offer',
      priceCurrency: 'TRY',
      price: Number(t.fiyat).toFixed(2),
      priceValidUntil: gecerlilikTarihi,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: t.site },
      url: t.url || `${tabanUrl}${urun.yol}`,
    }));
    const barkodTemiz = /^\d{8,14}$/.test(String(urun.barkod || '').trim())
      ? String(urun.barkod).trim()
      : null;

    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: urun.ad,
      description,
      category: kat.ad,
      url: `${tabanUrl}${urun.yol}`,
      image: [urun.gorsel || `${tabanUrl}/og-gorsel.png`],
      ...(urun.marka ? { brand: { '@type': 'Brand', name: urun.marka } } : {}),
      ...(urun.modelKodu ? { sku: String(urun.modelKodu), mpn: String(urun.modelKodu) } : {}),
      ...(barkodTemiz ? { gtin: barkodTemiz } : {}),
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'TRY',
        lowPrice: Number(urun.enUcuzFiyat).toFixed(2),
        ...(urun.enPahaliFiyat > 0 ? { highPrice: Number(urun.enPahaliFiyat).toFixed(2) } : {}),
        offerCount: Math.max(1, urun.stokluSayisi || stokluTeklifler.length),
        availability: 'https://schema.org/InStock',
        url: `${tabanUrl}${urun.yol}`,
        ...(altTeklifler.length ? { offers: altTeklifler } : {}),
      },
    };
    jsonLdList.push(productSchema);
  }

  const ozetHtml = urun.enUcuzFiyat > 0
    ? `<div class="seo-fiyat-kutu">
         <div>
           <div style="font-size:12px;font-weight:700;color:var(--gri-metin)">KARGO DAHİL EN UCUZ TEKLİF</div>
           <div class="seo-fiyat-ana">${formatTL(urun.enUcuzFiyat)}</div>
         </div>
         <div style="font-size:14px">
           <div><b>Mağaza:</b> ${htmlKacis(urun.enUcuzSite || '—')}</div>
           <div><b>Stoklu teklif:</b> ${urun.stokluSayisi || 1} mağaza${urun.birimMetni ? ` · <b>Birim:</b> ${htmlKacis(urun.birimMetni)}` : ''}</div>
           <div style="color:var(--gri-metin);font-size:12px">Son kontrol: ${htmlKacis(urun.lastmod)}</div>
         </div>
       </div>`
    : `<div class="seo-fiyat-kutu">
         <div>Bu ürün için önbellekte kayıtlı tarama henüz yok — tüm mağazalardan anlık fiyat çekmek için canlı tarama başlatabilirsiniz.</div>
       </div>`;

  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/kategori/${htmlKacis(kat.slug)}">${htmlKacis(kat.ad)}</a> › <span>${htmlKacis(urun.ad)}</span>
    </nav>

    <section class="seo-kart">
      <div class="${urun.gorsel ? 'seo-ust' : ''}">
        ${urun.gorsel ? `<img class="seo-gorsel" src="${htmlKacis(urun.gorsel)}" alt="${htmlKacis(urun.ad)}" loading="lazy" />` : ''}
        <div>
          <h1 class="seo-baslik">${htmlKacis(urun.ad)} Fiyatları</h1>
          <p class="seo-alt">${htmlKacis(description)}</p>
        </div>
      </div>
      ${ozetHtml}
      <div class="seo-butonlar">
        <a class="seo-cta" href="${htmlKacis(canliTaraUrl)}">⚡ Canlı Fiyatları Şimdi Tara</a>
        ${urun.enUcuzUrl ? `<a class="seo-cta ikincil" href="${htmlKacis(urun.enUcuzUrl)}" target="_blank" rel="noopener sponsored nofollow">En Ucuz Mağazaya Git (${htmlKacis(urun.enUcuzSite || '')}) ↗</a>` : ''}
      </div>
    </section>

    <section class="seo-kart">
      <h2 style="margin-top:0">Mağaza Karşılaştırma Tablosu (Kargo Dahil)</h2>
      ${urun.teklifler.length
        ? `<div style="overflow-x:auto"><table class="seo-tablo">
            <thead><tr><th>Mağaza</th><th>Ürün</th><th>Kargo</th><th>Stok</th><th>Toplam</th><th>Link</th></tr></thead>
            <tbody>${tabloSatirlari}</tbody>
          </table></div>`
        : '<p>Güncel çoklu mağaza tekliflerini listelemek için yukarıdaki <b>Canlı Fiyatları Şimdi Tara</b> butonunu kullanın.</p>'}
    </section>

    ${benzerler.length ? `<section class="seo-kart">
      <h2 style="margin-top:0">Aynı Kategorideki Diğer Ürünler</h2>
      <div class="seo-izgara">
        ${benzerler.map(b => `<a class="seo-mini-kart" href="${htmlKacis(b.yol)}">
          <div class="seo-mini-ad">${htmlKacis(b.ad)}</div>
          <div class="seo-mini-fiyat">${b.enUcuzFiyat > 0 ? formatTL(b.enUcuzFiyat) : 'Canlı Tara'}</div>
          <div class="seo-mini-alt">${b.enUcuzSite ? htmlKacis(b.enUcuzSite) + ' · Kargo dahil' : 'Anlık fiyat karşılaştırma'}</div>
        </a>`).join('')}
      </div>
    </section>` : ''}
  `;

  const extraMeta = urun.enUcuzFiyat > 0
    ? `<meta property="product:price:amount" content="${Number(urun.enUcuzFiyat).toFixed(2)}" />\n  <meta property="product:price:currency" content="TRY" />`
    : '';

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl: `${tabanUrl}${urun.yol}`,
    ogImage: urun.gorsel || `${tabanUrl}/og-gorsel.png`,
    ogType: urun.enUcuzFiyat > 0 ? 'product' : 'website',
    extraMeta,
    jsonLdList,
    govdeHtml,
  });
}

export function kategoriSayfasiHtml(kat, tumUrunler, tabanUrl) {
  const eslesen = tumUrunler.filter(kat.eslesirMi);
  const title = `${kat.ad} — En Ucuz Karşılaştırma | Baskı Hesap`;
  const canonicalUrl = `${tabanUrl}/kategori/${kat.slug}`;

  const katBar = SEO_KATEGORILER.map(c =>
    `<a class="seo-kat-hap ${c.slug === kat.slug ? 'etkin' : ''}" href="/kategori/${htmlKacis(c.slug)}">${htmlKacis(c.kisaAd)}</a>`
  ).join('');

  const kartlar = eslesen.map(u => `
    <a class="seo-mini-kart" href="${htmlKacis(u.yol)}">
      <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
      <div class="seo-mini-fiyat">${u.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara →'}</div>
      <div class="seo-mini-alt">${u.enUcuzSite ? `${htmlKacis(u.enUcuzSite)} · ${u.stokluSayisi || 1} mağaza` : '68 mağazada anlık karşılaştır'}</div>
    </a>`).join('');

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: kat.ad,
      description: kat.aciklama,
      url: canonicalUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${tabanUrl}/` },
        { '@type': 'ListItem', position: 2, name: kat.ad, item: canonicalUrl },
      ],
    },
    ...(eslesen.length ? [{
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: eslesen.slice(0, 30).map((u, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${tabanUrl}${u.yol}`,
        name: u.ad,
      })),
    }] : []),
  ];

  const govdeHtml = `
    <nav class="seo-yol" aria-label="İçerik yolu">
      <a href="/">Ana Sayfa</a> › <a href="/urunler">Ürün Kataloğu</a> › <span>${htmlKacis(kat.ad)}</span>
    </nav>
    <div class="seo-kat-bar">${katBar}</div>
    <section class="seo-kart">
      <h1 class="seo-baslik">${htmlKacis(kat.ad)}</h1>
      <p class="seo-alt">${htmlKacis(kat.aciklama)}</p>
      <div class="seo-izgara">${kartlar || '<p>Bu kategoride aktif ürün henüz eklenmedi.</p>'}</div>
    </section>
  `;

  return sayfaIskeleti({
    title,
    description: kat.aciklama,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    jsonLdList,
    govdeHtml,
  });
}

export function katalogDiziniHtml(tumUrunler, tabanUrl) {
  const title = '3D Yazıcı, Filament & Reçine Kataloğu — En Ucuz Fiyatlar | Baskı Hesap';
  const description = 'Türkiye 3D baskı mağazalarında takip edilen tüm popüler 3D yazıcı, PLA/PETG/TPU filament, reçine ve kurutucu modellerinin kargo dahil en ucuz fiyat dizini.';
  const canonicalUrl = `${tabanUrl}/urunler`;

  const bolumler = SEO_KATEGORILER.map(kat => {
    const urunler = tumUrunler.filter(kat.eslesirMi);
    if (!urunler.length) return '';
    return `<section class="seo-kart">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <h2 style="margin:0">${htmlKacis(kat.ad)}</h2>
        <a href="/kategori/${htmlKacis(kat.slug)}" style="font-weight:700;color:var(--ana);text-decoration:none">Tümünü gör (${urunler.length}) →</a>
      </div>
      <div class="seo-izgara">
        ${urunler.slice(0, 12).map(u => `<a class="seo-mini-kart" href="${htmlKacis(u.yol)}">
          <div class="seo-mini-ad">${htmlKacis(u.ad)}</div>
          <div class="seo-mini-fiyat">${u.enUcuzFiyat > 0 ? formatTL(u.enUcuzFiyat) : 'Canlı Tara →'}</div>
          <div class="seo-mini-alt">${u.enUcuzSite ? htmlKacis(u.enUcuzSite) : 'Anlık fiyat karşılaştır'}</div>
        </a>`).join('')}
      </div>
    </section>`;
  }).join('');

  return sayfaIskeleti({
    title,
    description,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    jsonLdList: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonicalUrl,
    }],
    govdeHtml: `
      <nav class="seo-yol"><a href="/">Ana Sayfa</a> › <span>Ürün Kataloğu</span></nav>
      <section class="seo-kart">
        <h1 class="seo-baslik">3D Yazıcı &amp; Filament Fiyat Kataloğu</h1>
        <p class="seo-alt">${htmlKacis(description)}</p>
      </section>
      ${bolumler}
    `,
  });
}
