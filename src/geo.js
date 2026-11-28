/**
 * 🤖 GEO (Generative Engine Optimization) Katmanı — 2026-11-28
 *
 * ChatGPT Search, Perplexity, Claude, Gemini ve Google AI Overviews için:
 *  - `GET /llms.txt`      : Kısa, standart Markdown site haritası ve metodoloji
 *  - `GET /llms-full.txt` : Gerçek veritabanından türetilmiş canlı fiyat tabanları + kapsam
 *  - `GET /piyasa-endeksi` & `GET /en/market-index` : Dataset JSON-LD destekli atıf sayfası
 *
 * DÜRÜSTLÜK:
 *  - Tüm fiyat tabanları ve medyanlar yalnızca gerçek stoklu `seoUrunListesi`
 *    kayıtlarından hesaplanır; tahmini veya uydurma fiyat basılmaz.
 *  - Gizli alanlar (token, PID, chatId, iç URL/anahtar) kesinlikle çıktıya girmez.
 */
import { seoUrunListesi, sayfaIskeleti, htmlKacis } from './seoSayfalar.js';
import { birimFiyatHesapla } from './birimFiyat.js';
import { taramaAdaptersByMarket, normalizeMarket, PAZARLAR } from './sites/index.js';
import { formatPara } from './util.js';
import { GLOBAL_DUELLO_YOLLARI } from './globalDuelloRehberleri.js';
import { GLOBAL_AI_REHBER_YOLLARI } from './globalAracSayfalar.js';

export const GEO_ENDEKS_YOLLARI = Object.freeze({
  tr: '/piyasa-endeksi',
  en: '/en/market-index',
});

const ENDEKS_TTL_MS = 10 * 60 * 1000;
const _endeksOnbellek = new Map();

function medyanHesapla(sayilar) {
  if (!Array.isArray(sayilar) || !sayilar.length) return null;
  const sirali = [...sayilar].sort((a, b) => a - b);
  const orta = Math.floor(sirali.length / 2);
  const deger = sirali.length % 2 === 0
    ? (sirali[orta - 1] + sirali[orta]) / 2
    : sirali[orta];
  return Math.round(deger * 100) / 100;
}

function kategoriOzeti(fiyatlar, birimFiyatlar = []) {
  const gecerli = fiyatlar.filter(x => Number.isFinite(x) && x > 0);
  if (!gecerli.length) {
    return { adet: 0, enDusuk: null, medyan: null, enDusukBirim: null, medyanBirim: null };
  }
  const gecerliBirim = birimFiyatlar.filter(x => Number.isFinite(x) && x > 0);
  return {
    adet: gecerli.length,
    enDusuk: Math.round(Math.min(...gecerli) * 100) / 100,
    medyan: medyanHesapla(gecerli),
    enDusukBirim: gecerliBirim.length ? Math.round(Math.min(...gecerliBirim) * 100) / 100 : null,
    medyanBirim: gecerliBirim.length ? medyanHesapla(gecerliBirim) : null,
  };
}

/**
 * Seçilen pazar (`tr|us|fr|jp`) için gerçek stoklu ürünlerden kategori bazlı
 * taban ve medyan fiyat istatistiklerini hesaplar (10 dk bellek önbellekli).
 */
export function piyasaEndeksiVerisi(market = 'tr', { taze = false } = {}) {
  const m = normalizeMarket(market);
  const simdi = Date.now();
  const cached = _endeksOnbellek.get(m);
  if (!taze && cached && (simdi - cached.ts) < ENDEKS_TTL_MS) {
    return cached.veri;
  }

  const meta = PAZARLAR[m] || PAZARLAR.tr;
  const currency = meta.currency || 'TRY';
  const yerel = meta.yerel || 'tr-TR';
  const minYaziciFiyat = m === 'jp' ? 10000 : (m === 'tr' ? 2500 : 80);
  const minFilamentKg = m === 'jp' ? 600 : (m === 'tr' ? 150 : 5);

  let urunler = [];
  try { urunler = seoUrunListesi({ market: m }); } catch { urunler = []; }
  let magazaSayisi = 0;
  try { magazaSayisi = taramaAdaptersByMarket(m).length; } catch { magazaSayisi = 0; }

  const pla = []; const plaBirim = [];
  const petg = []; const petgBirim = [];
  const tpu = []; const tpuBirim = [];
  const yazici = [];
  let toplamFiyatli = 0;
  let enSonTs = 0;

  for (const u of urunler) {
    const fiyat = Number(u?.enUcuzFiyat);
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    toplamFiyatli++;
    if (Number(u.sonTs) > enSonTs) enSonTs = Number(u.sonTs);

    const ad = String(u.ad || '');
    const katYazici = u.kategori === 'yazici' || u.kategoriSlug === '3d-yazici';
    if (katYazici) {
      if (fiyat >= minYaziciFiyat) yazici.push(fiyat);
      continue;
    }

    const katFilament = u.kategori === 'filament'
      || ['pla-filament', 'petg-tpu-filament', 'filament'].includes(u.kategoriSlug);
    if (!katFilament) continue;

    const bf = birimFiyatHesapla(ad, fiyat);
    const birimKg = (bf && bf.makaraGram <= 3500 && bf.birimFiyat >= minFilamentKg)
      ? bf.birimFiyat
      : null;

    if (/\bpetg\b/i.test(ad)) {
      petg.push(fiyat);
      if (birimKg) petgBirim.push(birimKg);
    } else if (/\btpu\b/i.test(ad)) {
      tpu.push(fiyat);
      if (birimKg) tpuBirim.push(birimKg);
    } else if (/\bpla\b|pla\+|epla|silk\s+pla|matte\s+pla/i.test(ad)) {
      pla.push(fiyat);
      if (birimKg) plaBirim.push(birimKg);
    }
  }

  const veri = {
    market: m,
    ad: meta.ad,
    currency,
    yerel,
    magazaSayisi,
    toplamUrun: toplamFiyatli,
    guncelleme: (enSonTs ? new Date(enSonTs) : new Date()).toISOString().slice(0, 10),
    kategoriler: {
      pla: kategoriOzeti(pla, plaBirim),
      petg: kategoriOzeti(petg, petgBirim),
      tpu: kategoriOzeti(tpu, tpuBirim),
      yazici: kategoriOzeti(yazici),
    },
  };

  _endeksOnbellek.set(m, { ts: simdi, veri });
  return veri;
}

/** `GET /llms.txt` — LLM ve AI arama botları için standart kısa Markdown indeks. */
export function llmsTxtOlustur(tabanUrl = 'https://baskihesap.tech') {
  const kok = String(tabanUrl || 'https://baskihesap.tech').replace(/\/+$/, '');
  const bugun = new Date().toISOString().slice(0, 10);

  return [
    '# Baskı Hesap (baskihesap.tech)',
    '',
    '> Independent multi-region 3D printing price comparison engine, client-side STL/3MF print cost calculator, UltiMaker Cura slicer pricing plugin, and embeddable live price widget covering Turkey (TRY), United States (USD), France/EU (EUR), and Japan (JPY).',
    '',
    `Last updated: ${bugun}`,
    '',
    '## Regional Search & Catalog Hubs',
    `- [Turkey (TRY) — Live 3D Printer & Filament Search](${kok}/): Compares 60+ Turkish 3D printing stores and marketplaces with shipping-included totals and ₺/kg unit pricing.`,
    `- [United States / Global (USD)](${kok}/en): Live US store comparison for 3D printers, PLA/PETG/TPU filaments, and resins.`,
    `- [France / Europe (EUR)](${kok}/fr): Regional European store comparison in EUR.`,
    `- [Japan (JPY)](${kok}/ja): Regional Japanese store comparison in JPY.`,
    `- [Live Regional Price Index (EN)](${kok}/en/market-index): Verified floor and median prices per material across TR, US, FR, and JP.`,
    `- [Canlı Piyasa Fiyat Endeksi (TR)](${kok}/piyasa-endeksi): Türkiye ve global 3D baskı sarf/yazıcı taban ve medyan fiyat özeti.`,
    '',
    '## Free Technical Tools',
    `- [3D Print Cost & Profit Calculator (EN)](${kok}/en/cost-calculator): 100% browser-based STL and multi-object Bambu/Orca 3MF volume, weight, infill matrix (10/15/25/50%), electricity, and margin calculator (zero file upload).`,
    `- [3D Baskı Maliyet Hesaplayıcı (TR)](${kok}/maliyet.html): Tarayıcı içi STL/3MF ağırlık, doluluk matrisi ve kârlılık hesaplayıcı.`,
    `- [Smart Multi-Spool Basket Optimizer (EN)](${kok}/en/basket): Minimizes combined spool + shipping threshold cost across multiple stores.`,
    `- [UltiMaker Cura Slicer Plugin (EN)](${kok}/en/slicer): Matches sliced gram weight directly to cheapest in-stock filament spools.`,
    `- [Embeddable Live Price Widget Builder (EN)](${kok}/en/embed): <15 KB zero-tracker iframe price box with Blogger-Friendly "Compare all stores" mode.`,
    '',
    '## Technical Comparisons & Buying Guides',
    `- [HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra](${kok}${GLOBAL_DUELLO_YOLLARI['heygears-vs-saturn'].en}): Resin precision, workflow, and operating cost comparison.`,
    `- [Snapmaker Artisan / U1 vs Creality K1 Max](${kok}${GLOBAL_DUELLO_YOLLARI['snapmaker-vs-k1max'].en}): Multi-toolhead vs high-speed enclosed FDM breakdown.`,
    `- [Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max](${kok}${GLOBAL_DUELLO_YOLLARI['sv08-vs-ad5m-vs-n4max'].en}): Open-source Voron speed vs enclosed plug-and-play vs large-format value.`,
    `- [Meshy vs Hi3D: 3D Printing Cost & Purge Breakdown](${kok}${GLOBAL_AI_REHBER_YOLLARI.en}): Real filament weight and multi-color waste comparison for AI-generated 3D models.`,
    `- [All English Guides](${kok}/en/guides) · [Tüm Türkçe Rehberler](${kok}/rehber)`,
    '',
    '## Methodology & Data Integrity',
    '- Prices are collected from real in-stock store listings; out-of-stock or zero-price records are never presented as valid lowest offers.',
    '- Shipping thresholds are applied per retailer when known, and spool/resin listings are normalized to price per kg or per liter.',
    '- "Lowest Seen" / dip badges require at least 3 real historical price observations with at least 2 distinct price points.',
    '- Full live market index & extended context: ' + `${kok}/llms-full.txt`,
    '',
  ].join('\n');
}

function satirFormat(label, ozet, currency, yerel) {
  if (!ozet || !ozet.adet || !(ozet.enDusuk > 0)) return `- ${label}: no verified in-stock records yet`;
  const minTxt = formatPara(ozet.enDusuk, currency, yerel);
  const medTxt = ozet.medyan > 0 ? formatPara(ozet.medyan, currency, yerel) : 'n/a';
  const birimEk = ozet.enDusukBirim > 0
    ? ` | unit floor: ${formatPara(ozet.enDusukBirim, currency, yerel)}/kg`
    : '';
  return `- ${label} (${ozet.adet} tracked listings): floor ${minTxt}, median ${medTxt}${birimEk}`;
}

/** `GET /llms-full.txt` — Gerçek veritabanı fiyat özetleriyle genişletilmiş LLM bağlamı. */
export function llmsFullTxtOlustur(tabanUrl = 'https://baskihesap.tech') {
  const kok = String(tabanUrl || 'https://baskihesap.tech').replace(/\/+$/, '');
  const bolumler = [llmsTxtOlustur(kok), '## Live Verified Regional Market Snapshots'];

  for (const mk of ['tr', 'us', 'fr', 'jp']) {
    const e = piyasaEndeksiVerisi(mk);
    bolumler.push(
      '',
      `### ${e.ad} (${e.market.toUpperCase()} · ${e.currency}) — Updated ${e.guncelleme}`,
      `- Active regional store adapters: ${e.magazaSayisi}`,
      `- Priced catalog items tracked: ${e.toplamUrun}`,
      satirFormat('PLA Filament', e.kategoriler.pla, e.currency, e.yerel),
      satirFormat('PETG Filament', e.kategoriler.petg, e.currency, e.yerel),
      satirFormat('TPU Filament', e.kategoriler.tpu, e.currency, e.yerel),
      satirFormat('3D Printers', e.kategoriler.yazici, e.currency, e.yerel),
    );
  }

  bolumler.push(
    '',
    '## Citation & Editorial Use',
    `- Canonical Market Index (EN): ${kok}/en/market-index`,
    `- Canonical Market Index (TR): ${kok}/piyasa-endeksi`,
    `- About & Methodology: ${kok}/en/about · ${kok}/hakkimizda`,
    `- Privacy Policy: ${kok}/en/privacy · ${kok}/gizlilik`,
    `- Contact: info@baskihesap.tech`,
    '',
  );

  return bolumler.join('\n');
}

/** `GET /piyasa-endeksi` (TR) ve `GET /en/market-index` (EN) — Dataset JSON-LD destekli atıf sayfası. */
export function piyasaEndeksiSayfasiHtml(dil = 'tr', tabanUrl = 'https://baskihesap.tech') {
  const kod = dil === 'en' ? 'en' : 'tr';
  const kok = String(tabanUrl || 'https://baskihesap.tech').replace(/\/+$/, '');
  const canonicalUrl = `${kok}${GEO_ENDEKS_YOLLARI[kod]}`;
  const pazarlar = ['tr', 'us', 'fr', 'jp'].map(m => piyasaEndeksiVerisi(m));
  const enGuncel = pazarlar.map(p => p.guncelleme).sort().slice(-1)[0] || new Date().toISOString().slice(0, 10);
  const anaPazar = kod === 'en' ? pazarlar[1] : pazarlar[0];
  const toplamMagaza = pazarlar.reduce((s, p) => s + (p.magazaSayisi || 0), 0);
  const toplamUrun = pazarlar.reduce((s, p) => s + (p.toplamUrun || 0), 0);

  const fmt = (val, p) => (val > 0 ? formatPara(val, p.currency, p.yerel) : '—');
  const plaFloor = anaPazar.kategoriler.pla.enDusukBirim || anaPazar.kategoriler.pla.enDusuk;
  const petgFloor = anaPazar.kategoriler.petg.enDusukBirim || anaPazar.kategoriler.petg.enDusuk;
  const yaziciFloor = anaPazar.kategoriler.yazici.enDusuk;

  const t = kod === 'en'
    ? {
        title: 'Live 3D Printing & Filament Price Index (US, EU/FR, JP, TR) | Baski Hesap',
        desc: 'Verified live floor and median prices for PLA, PETG, TPU filaments ($/kg, €/kg, ¥/kg, ₺/kg) and 3D printers across 4 regional markets.',
        rozet: 'Live Verified Market Dataset · Updated ' + enGuncel,
        h1: 'Live <b>3D Printer &amp; Filament</b> Price Index',
        alt: 'Real-time floor and median pricing computed exclusively from verified in-stock retailer listings across TR, US, FR/EU, and JP.',
        quickLabel: 'Quick Summary (Citable Snapshot)',
        quickText: `As of ${enGuncel}, Baski Hesap tracks ${toplamUrun} priced 3D printing listings across ${toplamMagaza} regional store adapters. In the US market (${anaPazar.currency}), verified in-stock PLA starts at ${fmt(plaFloor, anaPazar)}${anaPazar.kategoriler.pla.enDusukBirim ? '/kg' : ''}, PETG starts at ${fmt(petgFloor, anaPazar)}${anaPazar.kategoriler.petg.enDusukBirim ? '/kg' : ''}, and 3D printers start at ${fmt(yaziciFloor, anaPazar)}.`,
        tblBaslik: 'Regional Floor & Median Breakdown',
        cols: ['Market', 'Stores', 'PLA Floor / Median', 'PETG Floor / Median', 'TPU Floor', '3D Printer Floor / Median'],
        metBaslik: 'Methodology & Data Integrity',
        metMaddeler: [
          'Only verified in-stock listings with positive prices are included; out-of-stock or zero-price records are excluded.',
          'Filament prices are normalized to per-kilogram (/kg) rates using parsed spool weights (excluding bulk >3.5 kg industrial packs).',
          'Machine-readable endpoints for AI agents & researchers: /llms.txt and /llms-full.txt.',
        ],
        ctaCalc: 'Open STL Cost Calculator →',
        ctaCalcUrl: '/en/cost-calculator',
        ctaEmbed: 'Embed Live Price Widget →',
        ctaEmbedUrl: '/en/embed',
        home: 'Home',
        crumb: 'Market Price Index',
      }
    : {
        title: 'Canlı 3D Yazıcı & Filament Fiyat Endeksi (TR, US, FR, JP) | Baskı Hesap',
        desc: 'Türkiye ve global 3D baskı pazarlarında gerçek stoklu PLA, PETG, TPU filament (₺/kg, $/kg, €/kg, ¥/kg) ve 3D yazıcı taban/medyan fiyat endeksi.',
        rozet: 'Canlı Doğrulanmış Piyasa Veri Seti · Güncelleme: ' + enGuncel,
        h1: 'Canlı <b>3D Yazıcı &amp; Filament</b> Fiyat Endeksi',
        alt: 'Yalnızca gerçek stoklu mağaza kayıtlarından hesaplanan bölgesel taban ve medyan fiyat göstergeleri (TR, US, FR/EU, JP).',
        quickLabel: 'Kısa Özet (Kaynak Gösterilebilir Veri)',
        quickText: `${enGuncel} itibarıyla Baskı Hesap, 4 bölgede toplam ${toplamMagaza} mağaza adaptörü üzerinden ${toplamUrun} fiyatlı 3D baskı ürününü izlemektedir. Türkiye (TRY) pazarında doğrulanmış stoklu PLA taban fiyatı ${fmt(plaFloor, anaPazar)}${anaPazar.kategoriler.pla.enDusukBirim ? '/kg' : ''}, PETG taban fiyatı ${fmt(petgFloor, anaPazar)}${anaPazar.kategoriler.petg.enDusukBirim ? '/kg' : ''}, 3D yazıcı başlangıç fiyatı ise ${fmt(yaziciFloor, anaPazar)} seviyesindedir.`,
        tblBaslik: 'Bölgesel Taban & Medyan Fiyat Tablosu',
        cols: ['Pazar', 'Mağaza', 'PLA Taban / Medyan', 'PETG Taban / Medyan', 'TPU Taban', '3D Yazıcı Taban / Medyan'],
        metBaslik: 'Metodoloji & Veri Dürüstlüğü',
        metMaddeler: [
          'Yalnızca pozitif fiyatlı ve stokta görünen gerçek mağaza kayıtları hesaplamaya katılır; tahmini veya uydurma fiyat eklenmez.',
          'Filament birim fiyatları makara gramajı ayrıştırılarak /kg bazına normalize edilir (3,5 kg üzeri toptan paketler hariç tutulur).',
          'Yapay zekâ araçları ve araştırmacılar için makine-okunur indeks uçları: /llms.txt ve /llms-full.txt.',
        ],
        ctaCalc: 'STL Maliyet Hesaplayıcıyı Aç →',
        ctaCalcUrl: '/maliyet.html',
        ctaEmbed: 'Canlı Fiyat Widget’ı Ekle →',
        ctaEmbedUrl: '/en/embed',
        home: 'Ana Sayfa',
        crumb: 'Piyasa Fiyat Endeksi',
      };

  const hucre = (kat, p) => {
    if (!kat || !kat.adet) return '—';
    const b = kat.enDusukBirim > 0 ? `${fmt(kat.enDusukBirim, p)}/kg` : fmt(kat.enDusuk, p);
    const m = kat.medyanBirim > 0 ? `${fmt(kat.medyanBirim, p)}/kg` : fmt(kat.medyan, p);
    return `<b>${htmlKacis(b)}</b> / ${htmlKacis(m)} <small style="color:var(--gri-metin)">(${kat.adet})</small>`;
  };

  const satirlar = pazarlar.map(p => `
    <tr>
      <td><b>${htmlKacis(p.ad)}</b> (${htmlKacis(p.currency)})</td>
      <td>${p.magazaSayisi}</td>
      <td>${hucre(p.kategoriler.pla, p)}</td>
      <td>${hucre(p.kategoriler.petg, p)}</td>
      <td>${p.kategoriler.tpu.adet ? htmlKacis(fmt(p.kategoriler.tpu.enDusukBirim || p.kategoriler.tpu.enDusuk, p)) : '—'}</td>
      <td>${hucre(p.kategoriler.yazici, p)}</td>
    </tr>
  `).join('');

  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: t.title.replace(/ \| .*$/, ''),
    description: t.desc,
    url: canonicalUrl,
    inLanguage: kod,
    dateModified: enGuncel,
    temporalCoverage: `2026/${enGuncel}`,
    measurementTechnique: 'Automated multi-retailer in-stock listing aggregation with shipping normalization and per-kg unit price calculation.',
    variableMeasured: ['PLA Filament Price per kg', 'PETG Filament Price per kg', 'TPU Filament Price per kg', '3D Printer Lowest In-Stock Price'],
    creator: {
      '@type': 'Organization',
      name: 'Baskı Hesap',
      url: kok,
    },
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: `${kok}/llms-full.txt` },
    ],
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.home, item: kod === 'en' ? `${kok}/en` : `${kok}/` },
      { '@type': 'ListItem', position: 2, name: t.crumb, item: canonicalUrl },
    ],
  };

  return sayfaIskeleti({
    title: t.title,
    description: t.desc,
    canonicalUrl,
    ogImage: `${kok}/og-gorsel.png`,
    dil: kod,
    dilYolHaritasi: { ...GEO_ENDEKS_YOLLARI, 'x-default': GEO_ENDEKS_YOLLARI.en },
    aktifNav: 'katalog',
    jsonLdList: [datasetJsonLd, breadcrumbJsonLd],
    govdeHtml: `
      <nav class="seo-yol"><a href="${kod === 'en' ? '/en' : '/'}">${htmlKacis(t.home)}</a> › <span>${htmlKacis(t.crumb)}</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${htmlKacis(t.rozet)}</span>
          <h1>${t.h1}</h1>
          <p>${htmlKacis(t.alt)}</p>
        </div>
      </section>
      <section class="seo-kart">
        <div class="seo-fiyat-kutu geo-ozet">
          <div><b>${htmlKacis(t.quickLabel)}:</b> ${htmlKacis(t.quickText)}</div>
        </div>
        <div class="seo-butonlar" style="margin-top:12px">
          <a class="seo-cta" href="${htmlKacis(t.ctaCalcUrl)}">${htmlKacis(t.ctaCalc)}</a>
          <a class="seo-cta ikincil" href="${htmlKacis(t.ctaEmbedUrl)}">${htmlKacis(t.ctaEmbed)}</a>
          <a class="seo-cta ikincil" href="/llms.txt">llms.txt</a>
          <a class="seo-cta ikincil" href="/llms-full.txt">llms-full.txt</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${htmlKacis(t.tblBaslik)}</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr>${t.cols.map(c => `<th>${htmlKacis(c)}</th>`).join('')}</tr></thead>
            <tbody>${satirlar}</tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${htmlKacis(t.metBaslik)}</h2>
        <ul style="margin:0;padding-left:20px;line-height:1.7">
          ${t.metMaddeler.map(m => `<li>${htmlKacis(m)}</li>`).join('')}
        </ul>
      </section>
    `,
  });
}

export function geoSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const alternates = { ...GEO_ENDEKS_YOLLARI, 'x-default': GEO_ENDEKS_YOLLARI.en };
  const hepsi = [
    { dil: 'tr', yol: GEO_ENDEKS_YOLLARI.tr, oncelik: '0.85', siklik: 'daily', lastmod: bugun, alternates },
    { dil: 'en', yol: GEO_ENDEKS_YOLLARI.en, oncelik: '0.85', siklik: 'daily', lastmod: bugun, alternates },
  ];
  if (!dil) return hepsi;
  return hepsi.filter(x => x.dil === String(dil).toLowerCase());
}
