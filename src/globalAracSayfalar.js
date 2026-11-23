/**
 * 🌍 Çok Dilli Global Araç Sayfaları (EN / FR / JA) — 2026-11-23
 *
 * Amaç: Dil bağımsız iki teknik aracı (tarayıcı içi STL/3MF Maliyet Hesaplayıcı
 * ve Cura Slicer Eklentisi) küresel organik trafiğe ve Impact / global mağaza
 * dönüşümlerine açmak:
 *   - GET /en/cost-calculator
 *   - GET /fr/calculateur-cout
 *   - GET /ja/cost-calculator
 *   - GET /en/slicer
 *   - GET /fr/slicer
 *   - GET /ja/slicer
 *
 * DÜRÜSTLÜK:
 *  - STL/3MF ve G-Code ayrıştırma tamamen tarayıcıda çalışır (sıfır yükleme).
 *  - Varsayılan filament/elektrik değerleri düzenlenebilir girdi olarak açıkça
 *    etiketlenir; uydurma canlı fiyat basılmaz.
 *  - Global mağaza CTA bağlantıları yapılandırılmış Impact şablonu (`afiliyeLink`)
 *    üzerinden geçer ve `rel="noopener sponsored"` taşır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  htmlKacis, sayfaIskeleti, dilSeciciHtml, ga4HeadSnip,
  GLOBAL_KATALOG_YOLLARI, GLOBAL_REHBER_YOLLARI, GLOBAL_SEPET_YOLLARI,
  footerHubHtml, navYollariGetir,
} from './seoSayfalar.js';
import { normalizeDil, sozlukGetir } from './i18n/index.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { adaptersByMarket, taramaAdaptersByMarket } from './sites/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _indexSablon = null;
let _maliyetSablon = null;
let _sepetSablon = null;
let _slicerSablon = null;
function sablonOku(dosya) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', dosya), 'utf8');
}
function indexSablonOku() {
  if (!_indexSablon || process.env.NODE_ENV !== 'production') _indexSablon = sablonOku('index.html');
  return _indexSablon;
}
function maliyetSablonOku() {
  if (!_maliyetSablon || process.env.NODE_ENV !== 'production') _maliyetSablon = sablonOku('maliyet.html');
  return _maliyetSablon;
}
function sepetSablonOku() {
  if (!_sepetSablon || process.env.NODE_ENV !== 'production') _sepetSablon = sablonOku('sepet.html');
  return _sepetSablon;
}
function slicerSablonOku() {
  if (!_slicerSablon || process.env.NODE_ENV !== 'production') _slicerSablon = sablonOku('slicer.html');
  return _slicerSablon;
}

export const GLOBAL_URUNLER_YOLLARI = GLOBAL_KATALOG_YOLLARI;
export { GLOBAL_REHBER_YOLLARI, GLOBAL_SEPET_YOLLARI };

export const GLOBAL_ANA_YOLLARI = Object.freeze({
  en: '/en',
  fr: '/fr',
  ja: '/ja',
});

export const GLOBAL_MALIYET_YOLLARI = Object.freeze({
  en: '/en/cost-calculator',
  fr: '/fr/calculateur-cout',
  ja: '/ja/cost-calculator',
});

export const GLOBAL_SLICER_YOLLARI = Object.freeze({
  en: '/en/slicer',
  fr: '/fr/slicer',
  ja: '/ja/slicer',
});

const CREALITY_MAGAZA_KOK = Object.freeze({
  en: { siteId: 'creality_us', base: 'https://store.creality.com', searchYol: '/search?q=' },
  fr: { siteId: 'creality_fr', base: 'https://store.creality.com/fr', searchYol: '/search?q=' },
  ja: { siteId: 'creality_jp', base: 'https://store.creality.com/jp', searchYol: '/search?q=' },
});

function hreflangEtiketleri(tabanUrl, yolHaritasi) {
  const satirlar = [
    `<link rel="alternate" hreflang="tr" href="${htmlKacis(tabanUrl + yolHaritasi.tr)}" />`,
    `<link rel="alternate" hreflang="en" href="${htmlKacis(tabanUrl + yolHaritasi.en)}" />`,
    `<link rel="alternate" hreflang="fr" href="${htmlKacis(tabanUrl + yolHaritasi.fr)}" />`,
    `<link rel="alternate" hreflang="ja" href="${htmlKacis(tabanUrl + yolHaritasi.ja)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${htmlKacis(tabanUrl + yolHaritasi.en)}" />`,
  ];
  return satirlar.join('\n  ');
}

function dilSeciciCubugu(aktifDil, yolHaritasi) {
  const ogeler = [
    { dil: 'tr', etiket: '🇹🇷 TR' },
    { dil: 'en', etiket: '🇺🇸 EN' },
    { dil: 'fr', etiket: '🇫🇷 FR' },
    { dil: 'ja', etiket: '🇯🇵 JA' },
  ];
  return `<div class="seo-ic-linkler" aria-label="Language" style="margin:0 0 14px">
    ${ogeler.map(o => `<a class="seo-ic-link"${o.dil === aktifDil ? ' style="background:var(--ana);color:#fff;border-color:var(--ana)"' : ''} href="${htmlKacis(yolHaritasi[o.dil])}">${o.etiket}</a>`).join('')}
  </div>`;
}

function crealityAracLinki(dil, sorgu = 'PLA Filament') {
  const hedef = CREALITY_MAGAZA_KOK[dil] || CREALITY_MAGAZA_KOK.en;
  const hamUrl = `${hedef.base}${hedef.searchYol}${encodeURIComponent(sorgu)}`;
  const ayarlar = afiliyeAyarlari();
  const bagli = afiliyeLink(hedef.siteId, hamUrl, ayarlar);
  const k3Ham = 'https://store.creality.com/products/k3-multi-material-multicolor-3d-printer';
  return {
    siteId: hedef.siteId,
    storeUrl: bagli || hamUrl,
    base: hedef.base,
    k3Url: afiliyeLink(hedef.siteId, k3Ham, ayarlar) || k3Ham,
    afiliyeAktif: !!(bagli && bagli !== hamUrl),
  };
}

const MALIYET_KOPYA = Object.freeze({
  en: {
    title: '3D Print Cost & Profit Calculator (STL / 3MF) — Baski Hesap',
    desc: 'Drop an STL or 3MF file directly in your browser (zero upload) to estimate part weight, filament cost, electricity, machine wear, and suggested retail price.',
    rozet: '🧮 Global Workshop Tool · 100% Client-Side',
    h1: 'Calculate your <b>3D print cost</b> &amp; selling price in seconds',
    alt: 'Drop any STL/3MF file or enter slicer weight &amp; hours. Everything runs locally in your browser with editable filament, electricity and margin settings.',
    stlBaslik: '🧩 Drop your STL / 3MF file for instant weight estimate',
    stlGizlilik: '🔒 Processed 100% on your device',
    stlBirakAna: 'Drag & drop an STL or 3MF file here',
    stlBirakAlt: 'or click to browse · max 100 MB · never uploaded to a server',
    boyut: 'Dimensions',
    hacim: 'Volume',
    agirlik: 'Est. Weight',
    dolulukLabel: 'Infill',
    malzemeLabel: 'Material',
    inceAyar: 'Fine tune:',
    aktarBtn: '⬇️ Apply this weight to cost calculator',
    girdiBaslik: '🎛️ Print Inputs (Editable)',
    gramajLabel: '⚖️ Model Weight (g)',
    sureLabel: '⏱️ Print Time (hours)',
    gucLabel: '⚡ Printer Power (W)',
    filamentFiyatLabel: '🧵 Filament Price ($ / kg)',
    elektrikLabel: '🔌 Electricity ($ / kWh)',
    yipranmaLabel: '🔧 Machine Wear ($ / hour)',
    fireLabel: '♻️ Waste / Failure Allowance (%)',
    varsayilanFilamentKg: 20,
    varsayilanElektrikKwh: 0.16,
    varsayilanYipranma: 0.25,
    varsayilanPara: 'USD',
    varsayilanYerel: 'en-US',
    ciktiBaslik: '💰 Cost Breakdown &amp; Retail Pricing',
    hammadde: 'Material + Waste',
    elektrik: 'Electricity',
    amortisman: 'Machine Wear',
    netMaliyet: 'Net Print Cost',
    satisBaslik: 'Suggested Selling Price (Margin Tiers)',
    magazaBaslik: '🌍 Official Creality Store &amp; Supplies',
    magazaMetin: 'Need filament, hardened nozzles, or a multicolor 3D printer for this print?',
    magazaButonFilament: '🛒 Shop Filament on Creality Store ↗',
    magazaButonK3: '🎨 Creality K3 Multi-Color Printer ↗',
    slicerPromo: 'Want automated estimates directly inside UltiMaker Cura?',
    slicerPromoBtn: '🧩 Get Free Cura Plugin →',
    sss: [
      { soru: 'Are my STL or 3MF files uploaded to a server?', cevap: 'No. Volume, bounding box dimensions, and weight estimation run 100% locally in your browser using JavaScript.' },
      { soru: 'How is 3D print net cost calculated?', cevap: 'Net cost sums filament weight adjusted for waste percentage, estimated electricity consumption (kW × hours × tariff), and hourly printer depreciation.' },
    ],
  },
  fr: {
    title: 'Calculateur de Coût &amp; Rentabilité Impression 3D (STL / 3MF) — Baski Hesap',
    desc: 'Glissez un fichier STL ou 3MF dans votre navigateur (zéro envoi serveur) pour calculer le poids, le filament, l’électricité, l’usure et le prix de vente conseillé.',
    rozet: '🧮 Outil Atelier · 100% Local dans le Navigateur',
    h1: 'Calculez le <b>coût réel</b> et le prix de vente de vos impressions 3D',
    alt: 'Déposez un fichier STL/3MF ou saisissez les grammes et la durée. Le calcul s’exécute localement avec vos propres tarifs en euros (€).',
    stlBaslik: '🧩 Déposez votre fichier STL / 3MF pour estimer le poids',
    stlGizlilik: '🔒 Traité à 100% sur votre appareil',
    stlBirakAna: 'Glissez-déposez un fichier STL ou 3MF ici',
    stlBirakAlt: 'ou cliquez pour choisir · max 100 Mo · aucun envoi serveur',
    boyut: 'Dimensions',
    hacim: 'Volume',
    agirlik: 'Poids estimé',
    dolulukLabel: 'Remplissage',
    malzemeLabel: 'Matériau',
    inceAyar: 'Réglage fin :',
    aktarBtn: '⬇️ Appliquer ce poids au calculateur',
    girdiBaslik: '🎛️ Paramètres d’impression',
    gramajLabel: '⚖️ Poids du modèle (g)',
    sureLabel: '⏱️ Durée d’impression (h)',
    gucLabel: '⚡ Puissance imprimante (W)',
    filamentFiyatLabel: '🧵 Prix du filament (€ / kg)',
    elektrikLabel: '🔌 Électricité (€ / kWh)',
    yipranmaLabel: '🔧 Usure machine (€ / heure)',
    fireLabel: '♻️ Marge de perte / supports (%)',
    varsayilanFilamentKg: 20,
    varsayilanElektrikKwh: 0.25,
    varsayilanYipranma: 0.25,
    varsayilanPara: 'EUR',
    varsayilanYerel: 'fr-FR',
    ciktiBaslik: '💰 Détail des Coûts &amp; Prix de Vente',
    hammadde: 'Filament + pertes',
    elektrik: 'Électricité',
    amortisman: 'Amortissement',
    netMaliyet: 'Coût de revient net',
    satisBaslik: 'Prix de vente conseillés (selon marge)',
    magazaBaslik: '🌍 Boutique Officielle Creality (FR / EU)',
    magazaMetin: 'Besoin de bobines, buses ou d’une imprimante 3D rapide ?',
    magazaButonFilament: '🛒 Voir les filaments sur Creality FR ↗',
    magazaButonK3: '🎨 Découvrir Creality K3 Multi-Color ↗',
    slicerPromo: 'Obtenez vos estimations directement dans UltiMaker Cura :',
    slicerPromoBtn: '🧩 Télécharger l’extension Cura →',
    sss: [
      { soru: 'Mes fichiers STL ou 3MF sont-ils envoyés sur un serveur ?', cevap: 'Non. L’analyse géométrique et le calcul du volume s’effectuent entièrement dans votre navigateur sans aucun transfert.' },
      { soru: 'Comment calculer le prix de vente d’une pièce 3D ?', cevap: 'Additionnez le coût matière (avec 10 % de pertes), l’électricité et l’amortissement machine, puis appliquez un coefficient de marge (2x à 3x selon la finition).' },
    ],
  },
  ja: {
    title: '3Dプリント原価・販売価格シミュレーター (STL / 3MF) — Baski Hesap',
    desc: 'STL・3MFファイルをブラウザにドロップするだけで重量・フィラメント代・電気代・減価償却費・推奨販売価格を即時計算（サーバー送信なし）。',
    rozet: '🧮 ブラウザ完結ツール · 100% ローカル処理',
    h1: '3Dプリントの<b>実質原価</b>と推奨販売価格を数秒で計算',
    alt: 'STL/3MFモデルを読み込むか、スライサーのグラム数と造形時間を入力してください。すべてブラウザ内で計算され、円（¥）単位で利益率まで確認できます。',
    stlBaslik: '🧩 STL / 3MFファイルをドロップして重量を自動見積り',
    stlGizlilik: '🔒 端末内で100%処理（送信なし）',
    stlBirakAna: 'STL または 3MF ファイルをここにドロップ',
    stlBirakAlt: 'またはクリックして選択 · 最大 100 MB · サーバーへアップロードされません',
    boyut: 'サイズ',
    hacim: '体積',
    agirlik: '推定重量',
    dolulukLabel: 'インフィル密度',
    malzemeLabel: '素材',
    inceAyar: '微調整:',
    aktarBtn: '⬇️ この重量を原価計算に反映する',
    girdiBaslik: '🎛️ 造形条件の入力',
    gramajLabel: '⚖️ 使用フィラメント量 (g)',
    sureLabel: '⏱️ 造形時間 (時間)',
    gucLabel: '⚡ 消費電力 (W)',
    filamentFiyatLabel: '🧵 フィラメント単価 (¥ / kg)',
    elektrikLabel: '🔌 電気料金単価 (¥ / kWh)',
    yipranmaLabel: '🔧 機体消耗・保守費 (¥ / 時間)',
    fireLabel: '♻️ サポート・ロス率 (%)',
    varsayilanFilamentKg: 2800,
    varsayilanElektrikKwh: 31,
    varsayilanYipranma: 40,
    varsayilanPara: 'JPY',
    varsayilanYerel: 'ja-JP',
    ciktiBaslik: '💰 コスト内訳と推奨販売価格',
    hammadde: '材料費（ロス含む）',
    elektrik: '電気代',
    amortisman: '機体償却費',
    netMaliyet: '合計製造原価',
    satisBaslik: '推奨販売価格（利益倍率別）',
    magazaBaslik: '🌍 Creality 公式ストア（日本）',
    magazaMetin: 'この造形に必要なフィラメントや高速3Dプリンターを探す：',
    magazaButonFilament: '🛒 Creality JP でフィラメントを見る ↗',
    magazaButonK3: '🎨 Creality K3 マルチカラー ↗',
    slicerPromo: 'UltiMaker Cura 上で造形コストとフィラメントをすぐ確認：',
    slicerPromoBtn: '🧩 Cura プラグインを入手 →',
    sss: [
      { soru: 'STLや3MFファイルはサーバーに送信されますか？', cevap: 'いいえ。メッシュの体積計算と寸法解析はすべてご利用のブラウザ内で実行され、外部へ送信されることはありません。' },
      { soru: '3Dプリントの原価はどのように計算されますか？', cevap: '材料費（失敗・サポート分のロス率加算）＋ 電気代（消費電力×時間×電力単価）＋ プリンター消耗費の合計で算出されます。' },
    ],
  },
});

const SLICER_KOPYA = Object.freeze({
  en: {
    title: 'UltiMaker Cura &amp; Slicer Plugin — Baski Hesap',
    desc: 'Free plugin for UltiMaker Cura, OrcaSlicer, Bambu Studio and PrusaSlicer. Read filament weight directly after slicing and open the cost calculator or store links.',
    rozet: '🧩 Cura · OrcaSlicer · Bambu Studio · PrusaSlicer',
    h1: 'See print weight &amp; filament deals <b>right after slicing</b>',
    alt: 'Install BaskiHesap.curapackage in UltiMaker Cura or drop any .gcode file below to inspect filament usage instantly.',
    dropBaslik: 'Drop a .gcode file here (or click) for instant client-side inspection',
    dropAlt: 'Reads ; filament used [g] and material tags locally in your browser.',
    indirBaslik: '📦 Download &amp; Install',
    curaBtn: '⬇️ Download Cura Plugin (BaskiHesap.curapackage)',
    pyBtn: '⬇️ Download Python Post-Processor (en_ucuz_slicer.py)',
    maliyetBtn: '🧮 Open STL Cost Calculator →',
    magazaBtn: '🛒 Check Creality Official Store ↗',
    adimlar: [
      'Download <b>BaskiHesap.curapackage</b> and drag it into the UltiMaker Cura window (or install from UltiMaker Marketplace).',
      'Restart Cura, slice any 3D model, and click <b>Extensions → Baski Hesap</b>.',
      'For OrcaSlicer, Bambu Studio, or PrusaSlicer, add <b>en_ucuz_slicer.py</b> under <i>Post-processing scripts</i>.',
    ],
  },
  fr: {
    title: 'Extension UltiMaker Cura &amp; Slicer — Baski Hesap',
    desc: 'Plugin gratuit pour UltiMaker Cura, OrcaSlicer, Bambu Studio et PrusaSlicer. Affiche la consommation de filament juste après le tranchage.',
    rozet: '🧩 Cura · OrcaSlicer · Bambu Studio · PrusaSlicer',
    h1: 'Affichez le poids et le prix du filament <b>dès le tranchage</b>',
    alt: 'Installez BaskiHesap.curapackage dans UltiMaker Cura ou déposez un fichier .gcode ci-dessous pour analyser votre impression.',
    dropBaslik: 'Déposez un fichier .gcode ici (ou cliquez) pour l’analyser localement',
    dropAlt: 'Lit les métadonnées ; filament used [g] directement dans votre navigateur.',
    indirBaslik: '📦 Téléchargement &amp; Installation',
    curaBtn: '⬇️ Télécharger l’extension Cura (BaskiHesap.curapackage)',
    pyBtn: '⬇️ Script Post-Traitement Python (en_ucuz_slicer.py)',
    maliyetBtn: '🧮 Ouvrir le Calculateur de Coût STL →',
    magazaBtn: '🛒 Boutique Officielle Creality FR ↗',
    adimlar: [
      'Téléchargez <b>BaskiHesap.curapackage</b> et glissez le fichier dans UltiMaker Cura.',
      'Redémarrez Cura, tranchez un modèle 3D et ouvrez <b>Extensions → Baski Hesap</b>.',
      'Pour OrcaSlicer, Bambu Studio ou PrusaSlicer, ajoutez <b>en_ucuz_slicer.py</b> dans <i>Post-processing scripts</i>.',
    ],
  },
  ja: {
    title: 'UltiMaker Cura &amp; スライサー連携プラグイン — Baski Hesap',
    desc: 'UltiMaker Cura、OrcaSlicer、Bambu Studio、PrusaSlicer対応の無料プラグイン。スライス直後にフィラメント消費量と原価・ショップリンクを確認できます。',
    rozet: '🧩 Cura · OrcaSlicer · Bambu Studio · PrusaSlicer',
    h1: 'スライス完了と同時に<b>フィラメント消費量とコスト</b>を表示',
    alt: 'BaskiHesap.curapackage を UltiMaker Cura に導入するか、下のボックスに .gcode ファイルをドロップして即座に解析できます。',
    dropBaslik: '.gcode ファイルをドロップ（またはクリック）してブラウザ内で解析',
    dropAlt: '使用フィラメント量・素材・造形時間メタデータをローカルで読み取ります。',
    indirBaslik: '📦 ダウンロード・導入手順',
    curaBtn: '⬇️ Cura プラグインを入手 (BaskiHesap.curapackage)',
    pyBtn: '⬇️ Python ポスト処理スクリプト (en_ucuz_slicer.py)',
    maliyetBtn: '🧮 STL 原価シミュレーターを開く →',
    magazaBtn: '🛒 Creality 公式ストア（日本）を見る ↗',
    adimlar: [
      '<b>BaskiHesap.curapackage</b> をダウンロードし、UltiMaker Cura のウィンドウへドラッグ＆ドロップします。',
      'Cura を再起動してモデルをスライス後、メニューの <b>Extensions → Baski Hesap</b> を開きます。',
      'OrcaSlicer / Bambu Studio / PrusaSlicer では <i>Post-processing scripts</i> に <b>en_ucuz_slicer.py</b> を指定します。',
    ],
  },
});

export const ANA_YOL_HARITASI = Object.freeze({
  tr: '/',
  ...GLOBAL_ANA_YOLLARI,
});

export const MALIYET_YOL_HARITASI = Object.freeze({
  tr: '/maliyet.html',
  ...GLOBAL_MALIYET_YOLLARI,
});

export const SLICER_YOL_HARITASI = Object.freeze({
  tr: '/slicer.html',
  ...GLOBAL_SLICER_YOLLARI,
});

export const SEPET_YOL_HARITASI = GLOBAL_SEPET_YOLLARI;

function ortakKlonSayfaHazirla(sablon, {
  kod, tabanUrl, yolHaritasi, aktifNav, title, desc, ogTitle, ogDesc,
}) {
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const canonicalUrl = `${tabanUrl}${yolHaritasi[kod]}`;
  let cikti = String(sablon)
    .replace(/<html lang="tr"( data-theme="light")?>/, `<html lang="${htmlKacis(kod)}" data-theme="light">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${htmlKacis(desc)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${ogTitle || title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${htmlKacis(ogDesc || desc)}" />`)
    .replace(/"priceCurrency":\s*"TRY"/g, `"priceCurrency": "${sz.para.kod}"`);

  if (tabanUrl) {
    cikti = cikti.replace(/content="\/og-gorsel\.png"/g, `content="${htmlKacis(tabanUrl)}/og-gorsel.png"`);
  }
  const ekHead = [
    canonicalUrl ? `<link rel="canonical" href="${htmlKacis(canonicalUrl)}" />` : '',
    hreflangEtiketleri(tabanUrl, yolHaritasi),
    ga4HeadSnip(),
  ].filter(Boolean).join('\n  ');
  cikti = cikti.replace('</head>', `  ${ekHead}\n</head>`);

  cikti = cikti.replace(
    /<header class="ustbar">[\s\S]*?<\/header>/,
    `<header class="ustbar">
    <div class="kap">
      <a class="logo" href="${htmlKacis(nav.ana)}" aria-label="${htmlKacis(sz.meta.siteAdi)}">
        <img class="logo-gorsel" src="/logo.png" alt="${htmlKacis(sz.meta.siteAdi)}" width="36" height="30" decoding="async" />
      </a>
      <nav class="menu">
        <a href="${htmlKacis(nav.ana)}"${aktifNav === 'karsilastir' ? ' class="etkin"' : ''}>${htmlKacis(sz.nav.karsilastir)}</a>
        <a href="${htmlKacis(nav.katalog)}"${aktifNav === 'katalog' ? ' class="etkin"' : ''}>🗂️ ${htmlKacis(sz.nav.katalog)}</a>
        <a href="${htmlKacis(nav.rehber)}"${aktifNav === 'rehber' ? ' class="etkin"' : ''}>📖 ${htmlKacis(sz.nav.rehberler)}</a>
        <a href="${htmlKacis(nav.maliyet)}"${aktifNav === 'maliyet' ? ' class="etkin"' : ''}>🧮 ${htmlKacis(sz.nav.maliyet)}</a>
        <a href="${htmlKacis(nav.sepet)}"${aktifNav === 'sepet' ? ' class="etkin"' : ''}>🧺 ${htmlKacis(sz.nav.akilliSepet)}</a>
        <a href="${htmlKacis(nav.slicer)}"${aktifNav === 'eklenti' ? ' class="etkin"' : ''}>🧩 ${htmlKacis(sz.nav.eklenti)}</a>
        <a href="${htmlKacis(nav.ayarlar)}">🔔 ${htmlKacis(sz.nav.alarmlar)}</a>
      </nav>
      ${dilSeciciHtml(kod, yolHaritasi)}
      <button type="button" class="tema-degistir" id="temaDegistir" aria-label="Theme" title="Theme">🌓</button>
    </div>
  </header>`,
  );

  cikti = cikti
    .replace(/<nav class="footer-hub"[\s\S]*?<\/nav>/, footerHubHtml(kod))
    .replace('<a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>', `<a class="footer-marka-alan" href="${htmlKacis(nav.ana)}" rel="home">baskihesap.tech</a>`);

  return cikti;
}

const SEPET_KOPYA = Object.freeze({
  en: {
    title: 'Smart Basket &amp; Shipping Optimizer — Baski Hesap',
    desc: 'Compare single-store convenience, hybrid 2-3 store split, and absolute cheapest multi-store checkout across US 3D print retailers.',
    rozet: '🧺 Shipping thresholds · 3 scenarios · 1-click packs',
    h1: 'Split smart, <b>zero out shipping</b>, see real checkout totals',
    alt: 'Each US retailer has a different free-shipping threshold. Compare single-store checkout vs smart split vs cheapest per item side by side.',
    paketBaslik: '🎨 Ready Filament Packs',
    paketIpucu: '1-click fill · live regional catalog prices',
    paketYukle: '⏳ Reading live filament catalog…',
    sepetim: '🧺 My Basket',
    temizle: 'Clear basket',
    aramaPh: 'Type product name (e.g. eSun PLA+ black) or paste a product URL…',
    ekleBtn: 'Add',
    bosAna: 'Your basket is empty. Pick a ready pack above or search products.',
    bosAlt: 'Compare between 2 and 10 items.',
    tahminiEtiket: 'Estimated item subtotal',
    altNot: 'Shipping varies by chosen scenario',
    hesaplaBtn: '⚡ Compare 3 Scenarios',
    fazBekle: 'Preparing…',
    durdur: 'Stop',
    senaryoBaslik: '🏆 3 Scenarios, 3 Real Totals',
    paylasBtn: '🔗 Share Basket',
    dipnot: 'Prices come from live store scans; store availability and shipping rules apply at checkout. Affiliate links may earn commission at zero extra cost.',
    kargoBaslik: '🚚 Free Shipping Saver',
    kargoIpucu: 'Add a small item instead of paying shipping',
    footerNot: 'Multi-item shipping thresholds and stock counts are checked live across regional stores.',
  },
  fr: {
    title: 'Panier Intelligent &amp; Optimisation Port — Baski Hesap',
    desc: 'Comparez achat mono-boutique, panier hybride (2–3 boutiques) et prix le plus bas frais de port compris sur les boutiques FR/EU.',
    rozet: '🧺 Seuils de port · 3 scénarios · packs 1-clic',
    h1: 'Répartissez le panier, <b>annulez le port</b>, payez le vrai total',
    alt: 'Chaque boutique fixe ses frais et seuils de livraison gratuite. Comparez l’achat groupé, le panier optimisé et le moins cher par article.',
    paketBaslik: '🎨 Packs Filaments Prêts',
    paketIpucu: 'Ajout en 1 clic · prix catalogue en direct',
    paketYukle: '⏳ Chargement du catalogue filaments…',
    sepetim: '🧺 Mon Panier',
    temizle: 'Vider le panier',
    aramaPh: 'Nom du produit (ex. eSun PLA+ noir) ou collez un lien produit…',
    ekleBtn: 'Ajouter',
    bosAna: 'Votre panier est vide. Choisissez un pack ci-dessus ou cherchez un article.',
    bosAlt: 'Comparez de 2 à 10 articles.',
    tahminiEtiket: 'Sous-total articles estimé',
    altNot: 'Les frais de port dépendent du scénario choisi',
    hesaplaBtn: '⚡ Comparer les 3 Scénarios',
    fazBekle: 'Préparation…',
    durdur: 'Arrêter',
    senaryoBaslik: '🏆 3 Scénarios, 3 Totaux Réels',
    paylasBtn: '🔗 Partager le Panier',
    dipnot: 'Prix issus d’un scan en direct ; les conditions réelles de livraison s’appliquent au panier marchand. Les liens affiliés ne changent pas votre prix.',
    kargoBaslik: '🚚 Optimisation Seuil de Port Gratuit',
    kargoIpucu: 'Ajoutez un article plutôt que de payer la livraison',
    footerNot: 'Les seuils de livraison gratuite et stocks sont vérifiés en direct selon les boutiques européennes.',
  },
  ja: {
    title: 'スマートカート＆送料最適化シミュレーター — Baski Hesap',
    desc: '1店舗まとめ買い・2〜3店舗ハイブリッド・最安分散の3シナリオで送料込の実質支払額を比較。',
    rozet: '🧺 送料無料ライン計算 · 3シナリオ · ワンクリックセット',
    h1: 'カートを最適化して<b>送料をゼロ</b>に、実質総額を比較',
    alt: 'ショップごとに送料無料ラインや送料が異なります。1店舗まとめ買い・最適分割・単品最安の3通りを横並びで比較できます。',
    paketBaslik: '🎨 おすすめフィラメントセット',
    paketIpucu: 'ワンクリック追加 · リアルタイム価格連動',
    paketYukle: '⏳ ライブカタログを読み込み中…',
    sepetim: '🧺 カート内容',
    temizle: 'カートを空にする',
    aramaPh: '商品名を入力（例: eSun PLA+ ブラック）または商品URLを貼付…',
    ekleBtn: '追加',
    bosAna: 'カートは空です。上のセットを選ぶか商品を検索してください。',
    bosAlt: '2〜10点の商品で比較できます。',
    tahminiEtiket: '商品小計（目安）',
    altNot: '送料は選択した購入シナリオにより変動します',
    hesaplaBtn: '⚡ 3つのシナリオを比較',
    fazBekle: '準備中…',
    durdur: '停止',
    senaryoBaslik: '🏆 3つの購入シナリオ比較',
    paylasBtn: '🔗 カートを共有',
    dipnot: '価格はリアルタイム取得結果です。最終金額・送料条件は各ストアのレジにてご確認ください。',
    kargoBaslik: '🚚 送料無料ライン達成アドバイス',
    kargoIpucu: '送料を払う代わりに小物追加で送料無料に',
    footerNot: '複数ショップの送料無料条件と在庫状況をリアルタイムで照合しています。',
  },
});

export function globalSepetSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = SEPET_KOPYA[kod];
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const sifirPara = kod === 'ja' ? '¥0' : (kod === 'fr' ? '0,00 €' : '$0.00');
  const ortam = {
    dil: kod,
    market: sz.meta.market,
    currency: sz.para.kod,
    yerel: sz.para.yerel,
    tabanYol: nav.ana,
  };

  let cikti = ortakKlonSayfaHazirla(sepetSablonOku(), {
    kod, tabanUrl, yolHaritasi: SEPET_YOL_HARITASI, aktifNav: 'sepet',
    title: c.title, desc: c.desc, ogTitle: c.title, ogDesc: c.desc,
  });

  cikti = cikti
    .replace('<span class="hero-rozet">🧺 Kargo eşikleri · 3 senaryo · tek tıkla paket</span>', `<span class="hero-rozet">${c.rozet}</span>`)
    .replace('<h1>Sepeti böl, <b>kargoyu sıfırla</b>, gerçek toplamı gör</h1>', `<h1>${c.h1}</h1>`)
    .replace(/Birden fazla filament alırken her mağazanın kargo eşiği ayrı hesaplanır\.[\s\S]*?<\/p>/, `${c.alt}</p>`)
    .replace('<h2 id="paketBaslik" class="sepet-baslik">🎨 Hazır Filament Paketleri</h2>', `<h2 id="paketBaslik" class="sepet-baslik">${c.paketBaslik}</h2>`)
    .replace('<span class="sepet-ipucu">Tek tıkla sepete dolar · canlı katalog fiyatları</span>', `<span class="sepet-ipucu">${c.paketIpucu}</span>`)
    .replace('<div class="paket-kart paket-yukleniyor">⏳ Canlı filament kataloğu okunuyor…</div>', `<div class="paket-kart paket-yukleniyor">${c.paketYukle}</div>`)
    .replace('<h2 id="sepetBaslik" class="sepet-baslik">🧺 Sepetim <span class="sepet-sayac" id="sepetSayac">0/10</span></h2>', `<h2 id="sepetBaslik" class="sepet-baslik">${c.sepetim} <span class="sepet-sayac" id="sepetSayac">0/10</span></h2>`)
    .replace('Sepeti boşalt</button>', `${c.temizle}</button>`)
    .replace('placeholder="Ürün adı yaz (ör. Porima PLA siyah) ya da ürün linki yapıştır…"', `placeholder="${htmlKacis(c.aramaPh)}"`)
    .replace('>Ekle</button>', `>${c.ekleBtn}</button>`)
    .replace('<p>Sepetiniz boş. Yukarıdan hazır bir paket seçin ya da ürün arayın.</p>', `<p>${c.bosAna}</p>`)
    .replace('<p class="sepet-bos-alt">En az 2, en fazla 10 ürün karşılaştırılır.</p>', `<p class="sepet-bos-alt">${c.bosAlt}</p>`)
    .replace('<span class="sepet-alt-etiket">Tahmini ürün toplamı</span>', `<span class="sepet-alt-etiket">${c.tahminiEtiket}</span>`)
    .replace('<strong id="sepetToplam">0,00 TL</strong>', `<strong id="sepetToplam">${sifirPara}</strong>`)
    .replace('<span class="sepet-alt-alt" id="sepetAltNot">Kargo seçilen senaryoya göre değişir</span>', `<span class="sepet-alt-alt" id="sepetAltNot">${c.altNot}</span>`)
    .replace('⚡ 3 Senaryoyu Karşılaştır', c.hesaplaBtn)
    .replace('<span id="sepetFaz">Hazırlanıyor…</span>', `<span id="sepetFaz">${c.fazBekle}</span>`)
    .replace('>Durdur</button>', `>${c.durdur}</button>`)
    .replace('<h2 id="senaryoBaslik" class="sepet-baslik">🏆 3 Senaryo, 3 Farklı Toplam</h2>', `<h2 id="senaryoBaslik" class="sepet-baslik">${c.senaryoBaslik}</h2>`)
    .replace('>🔗 Sepeti Paylaş</button>', `>${c.paylasBtn}</button>`)
    .replace(/Fiyatlar canlı tarama sonucudur;[\s\S]*?<\/p>/, `${c.dipnot}</p>`)
    .replace('<h2 id="kargoBaslik" class="sepet-baslik">🚚 Kargo Eşiği Kurtarıcı</h2>', `<h2 id="kargoBaslik" class="sepet-baslik">${c.kargoBaslik}</h2>`)
    .replace('<span class="sepet-ipucu">Eşiğe az kaldıysa kargo yerine ürün alın</span>', `<span class="sepet-ipucu">${c.kargoIpucu}</span>`)
    .replace('<p>Çoklu ürün alımlarında mağazaların güncel kargo eşiği ve stok bilgisi gerçek taramadan okunur.</p>', `<p>${htmlKacis(c.footerNot)}</p>`)
    .replace(
      '<script type="module" src="/sepet.js"></script>',
      `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/para.js"></script>\n  <script src="/i18n-global.js"></script>\n  <script type="module" src="/sepet.js"></script>`,
    );

  return cikti;
}

export function globalMaliyetSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = MALIYET_KOPYA[kod];
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const cr = crealityAracLinki(kod, 'PLA Filament');
  const sembol = sz.para.sembol;
  const sifirPara = kod === 'ja' ? '¥0' : (kod === 'fr' ? '0,00 €' : '$0.00');
  const k = {
    en: {
      eylemSatis: 'Recommended selling price', secili: 'Selected price', kar: 'Profit',
      canliPiyasa: 'Live market', manuel: 'Manual',
      modelYukleAlt: 'Model file left unchanged; 100% client-side',
      girdi: '🎛️ Inputs', cikti: '📊 Cost Breakdown', hammaddeAd: 'Material', elektrikAd: 'Electricity', amortAd: 'Depreciation', netAd: 'Net Cost',
      kopyala: '📋 Copy Customer Quote',
      varsayimAlt: 'Electricity & depreciation are estimates shown alongside net cost. Live filament prices update from regional scans.',
      crealityBtn: '🛒 Shop Official Creality Store ↗',
      birimSira: ['Weight', 'Time', 'Printer power', 'Filament', 'Advanced settings (electricity · depreciation · profit margin)', 'Target profit margin', 'Material price', 'Material name', 'Estimated print time.', 'Filament Used from your slicer.'],
      dolulukSecenek: ['10% — draft', '20% — standard', '40% — strong', '100% — solid'],
      fisBaslik: '3D Print Cost &amp; Quote Summary', fisOnerilen: 'RECOMMENDED SELLING PRICE',
      fisWa: '📲 Share via WhatsApp', fisKopya: '📋 Copy Quote', fisYaz: '🖨️ Print / PDF',
    },
    fr: {
      eylemSatis: 'Prix de vente conseillé', secili: 'Prix retenu', kar: 'Marge',
      canliPiyasa: 'Marché en direct', manuel: 'Manuel',
      modelYukleAlt: 'Fichier traité à 100% dans votre navigateur',
      girdi: '🎛️ Paramètres', cikti: '📊 Détail des Coûts', hammaddeAd: 'Matière', elektrikAd: 'Électricité', amortAd: 'Amortissement', netAd: 'Coût net total',
      kopyala: '📋 Copier le devis client',
      varsayimAlt: 'L’électricité et l’amortissement sont estimés localement (hors TVA). Les tarifs bobines proviennent des scans régionaux.',
      crealityBtn: '🛒 Boutique Officielle Creality FR ↗',
      dolulukSecenek: ['10 % — brouillon', '20 % — standard', '40 % — solide', '100 % — plein'],
      fisBaslik: 'Résumé Coût &amp; Devis Impression 3D', fisOnerilen: 'PRIX DE VENTE CONSEILLÉ',
      fisWa: '📲 Envoyer sur WhatsApp', fisKopya: '📋 Copier le devis', fisYaz: '🖨️ Imprimer / PDF',
    },
    ja: {
      eylemSatis: '推奨販売価格', secili: '選択中の販売価格', kar: '利益',
      canliPiyasa: 'ライブ相場', manuel: '手動入力',
      modelYukleAlt: 'ファイルはサーバー送信されません',
      girdi: '🎛️ 入力条件', cikti: '📊 コスト内訳', hammaddeAd: 'フィラメント材料費', elektrikAd: '電気代', amortAd: '機体償却費', netAd: '合計製造原価',
      kopyala: '📋 見積もりテキストをコピー',
      varsayimAlt: '電気代・償却費は参考設定値です（いつでも変更可）。税抜原価として表示されます。',
      crealityBtn: '🛒 Creality 日本公式ストアを見る ↗',
      dolulukSecenek: ['10% — 下書き', '20% — 標準', '40% — 高強度', '100% — ソリッド'],
      fisBaslik: '3Dプリント原価・お見積り書', fisOnerilen: '推奨販売価格',
      fisWa: '📲 WhatsAppで共有', fisKopya: '📋 見積書をコピー', fisYaz: '🖨️ 印刷 / PDF',
    },
  }[kod];

  const ortam = {
    dil: kod,
    market: sz.meta.market,
    currency: sz.para.kod,
    yerel: sz.para.yerel,
    tabanYol: nav.ana,
    maliyetVarsayilan: {
      kwhTl: c.varsayilanElektrikKwh,
      yipranmaSaatTl: c.varsayilanYipranma,
      manuelTlKg: c.varsayilanFilamentKg,
    },
  };

  let cikti = ortakKlonSayfaHazirla(maliyetSablonOku(), {
    kod, tabanUrl, yolHaritasi: MALIYET_YOL_HARITASI, aktifNav: 'maliyet',
    title: c.title, desc: c.desc, ogTitle: c.title, ogDesc: c.desc,
  });

  cikti = cikti
    .replace('<span class="hero-rozet">🧮 Atölye & maker · gerçek maliyet</span>', `<span class="hero-rozet">${c.rozet}</span>`)
    .replace('<h1>Parçanın <b>gerçek maliyetini</b> ve satış fiyatını hesapla</h1>', `<h1>${c.h1}</h1>`)
    .replace(/Dilimleyiciden aldığınız gramaj ve süreyi girin[\s\S]*?<\/p>/, `${c.alt}</p>`)
    .replace('<h2 id="stlBaslik" class="stl-baslik">🧩 Model dosyanı bırak, gramajı görelim</h2>', `<h2 id="stlBaslik" class="stl-baslik">${c.stlBaslik}</h2>`)
    .replace('🔒 %100 cihazında işlenir', c.stlGizlilik)
    .replace('<b>STL / 3MF dosyasını buraya sürükleyin</b>', `<b>${c.stlBirakAna}</b>`)
    .replace('<span class="stl-birak-alt">ya da tıklayıp seçin · en fazla 100 MB · sunucuya yüklenmez</span>', `<span class="stl-birak-alt">${c.stlBirakAlt}</span>`)
    .replace('<span class="stl-metrik-ad">📏 Boyutlar</span>', `<span class="stl-metrik-ad">📏 ${c.boyut}</span>`)
    .replace('<span class="stl-metrik-ad">🧊 Hacim</span>', `<span class="stl-metrik-ad">🧊 ${c.hacim}</span>`)
    .replace('<span class="stl-metrik-ad">⚖️ Ağırlık</span>', `<span class="stl-metrik-ad">⚖️ ${c.agirlik}</span>`)
    .replace('<label for="stlDoluluk">Doluluk</label>', `<label for="stlDoluluk">${c.dolulukLabel}</label>`)
    .replace('<option value="10">%10 — taslak</option>', `<option value="10">${k.dolulukSecenek[0]}</option>`)
    .replace('<option value="20" selected>%20 — standart</option>', `<option value="20" selected>${k.dolulukSecenek[1]}</option>`)
    .replace('<option value="40">%40 — dayanıklı</option>', `<option value="40">${k.dolulukSecenek[2]}</option>`)
    .replace('<option value="100">%100 — katı</option>', `<option value="100">${k.dolulukSecenek[3]}</option>`)
    .replace('<label for="stlMalzeme">Malzeme</label>', `<label for="stlMalzeme">${c.malzemeLabel}</label>`)
    .replace('İnce ayar: <b id="stlDolulukEtiket">%20</b>', `${c.inceAyar} <b id="stlDolulukEtiket">20%</b>`)
    .replace('⬇️ Bu gramajı hesaplayıcıya aktar', c.aktarBtn)
    .replace('<h2 id="girdiBaslik" class="mz-baslik">🎛️ Girdiler</h2>', `<h2 id="girdiBaslik" class="mz-baslik">${k.girdi}</h2>`)
    .replace('<label for="gramaj">⚖️ Model gramajı</label>', `<label for="gramaj">${c.gramajLabel}</label>`)
    .replace('<label for="sure">⏱️ Baskı süresi (saat)</label>', `<label for="sure">${c.sureLabel}</label>`)
    .replace('<button type="button" class="mz-sekme-btn aktif" data-mod="canli" role="tab" aria-selected="true">Canlı piyasa</button>', `<button type="button" class="mz-sekme-btn aktif" data-mod="canli" role="tab" aria-selected="true">${k.canliPiyasa}</button>`)
    .replace('<button type="button" class="mz-sekme-btn" data-mod="manuel" role="tab" aria-selected="false">Manuel</button>', `<button type="button" class="mz-sekme-btn" data-mod="manuel" role="tab" aria-selected="false">${k.manuel}</button>`)
    .replace('<label for="manuelTlKg">Fiyat (₺/kg)</label>', `<label for="manuelTlKg">${c.filamentFiyatLabel}</label>`)
    .replace('value="600" inputmode="decimal"', `value="${c.varsayilanFilamentKg}" inputmode="decimal"`)
    .replace('<label for="kwhTl">💡 Elektrik (₺/kWh)</label>', `<label for="kwhTl">${c.elektrikLabel}</label>`)
    .replace('value="2.90" inputmode="decimal"', `value="${c.varsayilanElektrikKwh}" inputmode="decimal"`)
    .replace('<label for="yipranma">🛠️ Yıpranma (₺/saat)</label>', `<label for="yipranma">${c.yipranmaLabel}</label>`)
    .replace('value="3.00" inputmode="decimal"', `value="${c.varsayilanYipranma}" inputmode="decimal"`)
    .replace('<h2 id="ciktiBaslik" class="mz-baslik">📊 Maliyet dökümü</h2>', `<h2 id="ciktiBaslik" class="mz-baslik">${k.cikti}</h2>`)
    .replace('<span class="mz-kart-ad">Hammadde</span>', `<span class="mz-kart-ad">${k.hammaddeAd}</span>`)
    .replace('<strong class="mz-kart-deger" id="ciktiHammadde">₺0,00</strong>', `<strong class="mz-kart-deger" id="ciktiHammadde">${sifirPara}</strong>`)
    .replace('<span class="mz-kart-alt" id="ciktiHammaddeAlt">160 g × ₺0/kg</span>', `<span class="mz-kart-alt" id="ciktiHammaddeAlt">160 g × ${sembol}0/kg</span>`)
    .replace('<span class="mz-kart-ad">Elektrik</span>', `<span class="mz-kart-ad">${k.elektrikAd}</span>`)
    .replace('<strong class="mz-kart-deger" id="ciktiElektrik">₺0,00</strong>', `<strong class="mz-kart-deger" id="ciktiElektrik">${sifirPara}</strong>`)
    .replace('<span class="mz-kart-ad">Amortisman</span>', `<span class="mz-kart-ad">${k.amortAd}</span>`)
    .replace('<strong class="mz-kart-deger" id="ciktiAmortisman">₺0,00</strong>', `<strong class="mz-kart-deger" id="ciktiAmortisman">${sifirPara}</strong>`)
    .replace('<span class="mz-kart-ad">Toplam net maliyet</span>', `<span class="mz-kart-ad">${k.netAd}</span>`)
    .replace('<strong class="mz-kart-deger" id="ciktiNet">₺0,00</strong>', `<strong class="mz-kart-deger" id="ciktiNet">${sifirPara}</strong>`)
    .replace('<h3 class="mz-alt-baslik">💰 Önerilen satış fiyatı</h3>', `<h3 class="mz-alt-baslik">💰 ${k.eylemSatis}</h3>`)
    .replace('<span class="mz-secilen-ad">Seçili fiyat</span>', `<span class="mz-secilen-ad">${k.secili}</span>`)
    .replace('<strong id="secilenFiyat">₺0,00</strong>', `<strong id="secilenFiyat">${sifirPara}</strong>`)
    .replace('<span>Kâr</span>', `<span>${k.kar}</span>`)
    .replace('<strong id="secilenKar">₺0,00</strong>', `<strong id="secilenKar">${sifirPara}</strong>`)
    .replace('📋 Müşteri Fiyat Teklifini Kopyala', k.kopyala)
    .replace('<aside class="mz-varsayim" id="varsayimKutu"></aside>', `<aside class="mz-varsayim" id="varsayimKutu"></aside>\n        <div class="mz-cta" style="margin-top:12px">\n          <p class="mz-cta-metin">${c.magazaMetin}</p>\n          <a class="mz-cta-btn" href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${k.crealityBtn}</a>\n        </div>`)
    .replace(/Elektrik ve amortisman <b>varsayımdır<\/b>[\s\S]*?<\/p>/, `${k.varsayimAlt}</p>`)
    .replace('<h3 id="fisBaslik" class="fis-baslik">3D Baskı Maliyet &amp; Teklif Özeti</h3>', `<h3 id="fisBaslik" class="fis-baslik">${k.fisBaslik}</h3>`)
    .replace('<div class="fis-fiyat-etiket">ÖNERİLEN SATIŞ FİYATI</div>', `<div class="fis-fiyat-etiket">${k.fisOnerilen}</div>`)
    .replace('<div class="fis-fiyat-tutar" id="fisSatisFiyat">₺0,00</div>', `<div class="fis-fiyat-tutar" id="fisSatisFiyat">${sifirPara}</div>`)
    .replace('>📲 WhatsApp ile Gönder</button>', `>${k.fisWa}</button>`)
    .replace('>📋 Fişi Kopyala</button>', `>${k.fisKopya}</button>`)
    .replace('>🖨️ Yazdır / PDF</button>', `>${k.fisYaz}</button>`)
    .replace(
      '<script src="/maliyet.js"></script>',
      `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/para.js"></script>\n  <script src="/i18n-global.js"></script>\n  <script src="/maliyet.js"></script>`,
    );

  return cikti;
}

export function globalSlicerSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = SLICER_KOPYA[kod];
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const cr = crealityAracLinki(kod, '3D Printer');
  const k = {
    en: {
      canliBaslik: '🔎 Live API Demo &amp; Instant G-Code Inspector',
      canliEtiket: 'Regional stores · live data',
      dropMeta: 'Reads Bambu Studio, OrcaSlicer, PrusaSlicer, and Cura metadata locally in your browser.',
      malzemeLbl: 'Material', gramajLbl: 'Weight (g)', renkLbl: 'Color (optional)', renkVal: 'Black',
      indirmeBaslik: '📥 Download &amp; Install',
      curaAlt: 'Cura 4.13 and newer',
      bambuAlt: 'Post-processing script',
      nasilBaslik: '⚙️ How It Works',
      adim1t: 'Slicing finishes', adim1d: 'Slicer writes filament weight & type into the G-Code header.',
      adim2t: 'Plugin reads', adim2d: 'Reads only filament_used [g], filament_type, and optional color.',
      adim3t: 'API lookup', adim3d: 'Fetches cheapest in-stock spool across regional stores (<50 ms).',
      adim4t: 'Instant tip', adim4d: 'Shows exact per-part filament cost and cheapest store checkout link.',
      guvenBaslik: '🔒 Privacy &amp; Honesty',
      apiBaslik: '🔌 Public API (for your own tools)',
      apiNot: 'Public, CORS-enabled, 60s cached.',
      crealityBtn: '🛒 Shop Official Creality Store ↗',
      footerNot: 'The slicer plugin is free and needs no account. Outbound affiliate links never affect your price.',
    },
    fr: {
      canliBaslik: '🔎 Exemple API en Direct &amp; Analyseur G-Code',
      canliEtiket: 'Boutiques EU · données réelles',
      dropMeta: 'Lit les métadonnées Bambu Studio, OrcaSlicer, PrusaSlicer et Cura localement sans envoi serveur.',
      malzemeLbl: 'Matériau', gramajLbl: 'Poids (g)', renkLbl: 'Couleur (optionnel)', renkVal: 'Black',
      indirmeBaslik: '📥 Télécharger &amp; Installer',
      curaAlt: 'Cura 4.13 et supérieur',
      bambuAlt: 'Script post-traitement',
      nasilBaslik: '⚙️ Comment ça marche ?',
      adim1t: 'Fin du tranchage', adim1d: 'Le slicer inscrit le poids et le matériau dans l’en-tête G-Code.',
      adim2t: 'L’extension lit', adim2d: 'Lit uniquement filament used [g], filament_type et la couleur.',
      adim3t: 'Requête API', adim3d: 'Interroge les boutiques européennes en stock en moins de 50 ms.',
      adim4t: 'Notification directe', adim4d: 'Affiche le coût matière de la pièce et le lien du meilleur marchand.',
      guvenBaslik: '🔒 Confidentialité &amp; Transparence',
      apiBaslik: '🔌 API Publique (intégrations libres)',
      apiNot: 'Ouverte, compatible CORS, cache 60 s.',
      crealityBtn: '🛒 Boutique Officielle Creality FR ↗',
      footerNot: 'L’extension slicer est 100 % gratuite et sans compte. Les liens affiliés n’augmentent jamais votre prix.',
    },
    ja: {
      canliBaslik: '🔎 リアルタイムAPIデモ＆G-Code解析',
      canliEtiket: '日本向けストア対応 · 実データ',
      dropMeta: 'Bambu Studio / OrcaSlicer / PrusaSlicer / Cura のG-Codeヘッダをブラウザ内のみで解析します。',
      malzemeLbl: '素材', gramajLbl: '重量 (g)', renkLbl: '色（任意）', renkVal: 'Black',
      indirmeBaslik: '📥 ダウンロード・導入手順',
      curaAlt: 'Cura 4.13以降対応',
      bambuAlt: 'ポストプロセススクリプト',
      nasilBaslik: '⚙️ 仕組み（4ステップ）',
      adim1t: 'スライス完了', adim1d: 'スライサーがG-Code先頭に使用グラム数と素材名を書き出します。',
      adim2t: 'プラグイン取得', adim2d: 'filament used [g]・filament_type・色コードのみを取得。',
      adim3t: 'API照会', adim3d: '対応ストアの在庫あり最安フィラメントを 50 ms 以内で取得。',
      adim4t: '即時通知', adim4d: '1個あたりの材料原価と最安ショップURLをすぐ表示します。',
      guvenBaslik: '🔒 プライバシー保護',
      apiBaslik: '🔌 公開API仕様（外部連携用）',
      apiNot: 'CORS対応・認証不要・60秒キャッシュ。',
      crealityBtn: '🛒 Creality 日本公式ストアを見る ↗',
      footerNot: 'スライサー連携プラグインは完全無料・登録不要です。アフィリエイトリンクにより価格が上がることはありません。',
    },
  }[kod];

  const ortam = {
    dil: kod,
    market: sz.meta.market,
    currency: sz.para.kod,
    yerel: sz.para.yerel,
    tabanYol: nav.ana,
  };

  let cikti = ortakKlonSayfaHazirla(slicerSablonOku(), {
    kod, tabanUrl, yolHaritasi: SLICER_YOL_HARITASI, aktifNav: 'eklenti',
    title: c.title, desc: c.desc, ogTitle: c.title, ogDesc: c.desc,
  });

  cikti = cikti
    .replace('<span class="hero-rozet">🧩 Cura · Bambu Studio · OrcaSlicer · PrusaSlicer</span>', `<span class="hero-rozet">${c.rozet}</span>`)
    .replace('<h1>Dilimleme bittiği anda<br><b>en ucuz filamenti</b> göster</h1>', `<h1>${c.h1}</h1>`)
    .replace(/Web sitesine gitmeye gerek yok\.[\s\S]*?<\/p>/, `${c.alt}</p>`)
    .replace('<h2 id="slCanliBaslik">🔎 Canlı örnek &amp; anında G-Code analizi</h2>', `<h2 id="slCanliBaslik">${k.canliBaslik}</h2>`)
    .replace('<span class="sl-canli-etiket">68 mağaza · gerçek veri</span>', `<span class="sl-canli-etiket">${k.canliEtiket}</span>`)
    .replace('<b>İsterseniz bir <code>.gcode</code> dosyasını buraya bırakın (veya tıklayın)</b>', `<b>${c.dropBaslik}</b>`)
    .replace('<span>Bambu Studio, OrcaSlicer, PrusaSlicer, Cura meta verisi tarayıcıda okunur; dosya sunucuya yüklenmez.</span>', `<span>${k.dropMeta}</span>`)
    .replace('value="Siyah" maxlength="30" placeholder="Siyah"', `value="${k.renkVal}" maxlength="30" placeholder="${k.renkVal}"`)
    .replace('<h2 id="slIndirmeBaslik" class="sl-bolum-baslik">📥 İndir ve kur</h2>', `<h2 id="slIndirmeBaslik" class="sl-bolum-baslik">${k.indirmeBaslik}</h2>`)
    .replace('<p class="sl-kart-alt">Cura 4.13 ve üzeri</p>', `<p class="sl-kart-alt">${k.curaAlt}</p>`)
    .replace('⬇️ Baskı Hesap — Cura paketi', c.curaBtn)
    .replace('<p class="sl-kart-alt">Post-processing script</p>', `<p class="sl-kart-alt">${k.bambuAlt}</p>`)
    .replace('⬇️ en_ucuz_slicer.py', c.pyBtn)
    .replace('<h2 id="slNasilBaslik" class="sl-bolum-baslik">⚙️ Nasıl çalışır?</h2>', `<h2 id="slNasilBaslik" class="sl-bolum-baslik">${k.nasilBaslik}</h2>`)
    .replace('<b>Dilimleme biter</b>\n          <span>Slicer gramajı ve malzeme türünü G-Code\'a yazar.</span>', `<b>${k.adim1t}</b>\n          <span>${k.adim1d}</span>`)
    .replace('<b>Eklenti okur</b>\n          <span>Yalnızca <code>filament used [g]</code>, <code>filament_type</code> ve renk.</span>', `<b>${k.adim2t}</b>\n          <span>${k.adim2d}</span>`)
    .replace('<b>API sorgular</b>\n          <span>68 mağazadaki stoklu en ucuz makara, 1,5 sn zaman aşımıyla.</span>', `<b>${k.adim3t}</b>\n          <span>${k.adim3d}</span>`)
    .replace('<b>Bildirim gelir</b>\n          <span>“Bu baskı 340 g PLA gerektiriyor. En ucuz ₺463,68 ile Porima 3D\'de.”</span>', `<b>${k.adim4t}</b>\n          <span>${k.adim4d}</span>`)
    .replace('<h2 id="slGuvenBaslik" class="sl-bolum-baslik">🔒 Gizlilik ve dürüstlük</h2>', `<h2 id="slGuvenBaslik" class="sl-bolum-baslik">${k.guvenBaslik}</h2>`)
    .replace('<h2 id="slApiBaslik" class="sl-bolum-baslik">🔌 API (kendi entegrasyonunuz için)</h2>', `<h2 id="slApiBaslik" class="sl-bolum-baslik">${k.apiBaslik}</h2>`)
    .replace('<p class="sl-api-not">Herkese açık, CORS destekli, 60 sn önbellekli.</p>', `<p class="sl-api-not">${k.apiNot} <a href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${k.crealityBtn}</a></p>`)
    .replace('GET /api/embed/oner?malzeme=PLA&amp;gramaj=340&amp;renk=Siyah&amp;kaynak=cura', `GET /api/embed/oner?malzeme=PLA&amp;gramaj=340&amp;market=${sz.meta.market}&amp;kaynak=cura`)
    .replace(/Slicer eklentisi ücretsizdir ve hesap gerektirmez\.[\s\S]*?<\/p>/, `${htmlKacis(k.footerNot)}</p>`)
    .replace(
      '<script src="/slicer.js"></script>',
      `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/para.js"></script>\n  <script src="/i18n-global.js"></script>\n  <script src="/slicer.js"></script>`,
    );

  return cikti;
}

const ANA_KOPYA = Object.freeze({
  en: {
    market: 'us',
    currency: 'USD',
    title: 'Baski Hesap Global — Find the Real Lowest Price on 3D Printers &amp; Filaments',
    desc: 'Compare live 3D printer, filament &amp; spare-part prices across US official manufacturers (USD), calculate STL/3MF costs locally, and use our free Cura plugin.',
    rozet: '⚡ 3D Printing &amp; Makers · Live Stock &amp; Real Prices (USD)',
    h1: 'Find the <b>real lowest price</b> on 3D printers &amp; filament',
    alt: 'Not just list prices — we check live stock, shipping thresholds, and $/kg unit cost across verified US 3D printing manufacturers &amp; stores.',
    statMagaza: 'stores scanned',
    statBirim: '🧵 in-stock + $/kg unit price',
    statEslesme: '🔍 model + color match',
    modOto: '✨ Auto',
    modLink: '🔗 Search by link',
    modAd: '💬 Search by name',
    placeholderOto: 'Paste a store link or type a product name… e.g. "Polymaker PLA", "Creality K1C"',
    placeholderLink: 'Paste product URL from store.creality.com, us.polymaker.com, printedsolid.com…',
    placeholderAd: 'Type product name… e.g. "Creality K1C", "Overture PLA"',
    araBtn: 'Find Prices',
    populerEtiket: 'Popular:',
    ornekler: ['Polymaker PLA', 'Overture PLA', 'Creality K1C', 'Elegoo PLA'],
    ipucu: '⚡ Paste any product link or type a name to compare live stock &amp; total price across US stores · Free browser STL calculator below.',
    durumBaslik: 'Scanning regional stores…',
    iptalBtn: '✕ Cancel',
    ozetEnUcuz: 'Best Total Price',
    stoktaLabel: '✅ In Stock',
    tukendiLabel: '❌ Out of Stock',
    fiyatYokLabel: 'Price on store',
    stlBaslik: '🧩 Drop your 3D model, see <b>part cost</b>',
    stlGizlilik: '🔒 Never leaves your device',
    stlBirakAna: 'Drop an STL / 3MF file here',
    stlBirakAlt: 'Instant local weight, volume &amp; filament estimate — zero server upload',
    stlRozet: '⚡ Instant · Serverless',
    stlDetay: '📊 Full profit, electricity &amp; depreciation calculator ➔',
    aracBaslik: 'Global Maker Toolkit',
    kartMaliyetBaslik: '🧮 STL / 3MF Cost Calculator',
    kartMaliyetMetin: 'Calculate filament weight, electricity, machine wear and suggested selling price in USD/EUR/JPY — 100% locally.',
    kartSlicerBaslik: '🧩 UltiMaker Cura &amp; Slicer Plugin',
    kartSlicerMetin: 'Automatically read filament usage right after slicing in Cura, OrcaSlicer, Bambu Studio or PrusaSlicer.',
    kartStoreBaslik: '🛒 Creality Official Store (US)',
    kartStoreMetin: 'Browse K3 Multi-Color, K1C, Ender 3 V3 series and official filaments directly on store.creality.com.',
    araniyor: 'Scanning regional stores…',
    bulunamadi: 'No in-stock matching offer found for this query right now. Try browsing the official store directly:',
    git: 'Visit Store ↗',
    magazaListeBaslik: 'Compared stores in this region',
  },
  fr: {
    market: 'fr',
    currency: 'EUR',
    title: 'Baski Hesap France — Trouvez le Vrai Meilleur Prix Imprimantes 3D &amp; Filaments',
    desc: 'Comparez en direct les prix TTC en euros (€) chez les fabricants et boutiques françaises (Creality FR, Arianeplast, Francofil, Atome3D, Makershop, Polyfab3D).',
    rozet: '⚡ Impression 3D &amp; Makers · Stock en direct &amp; prix réels (EUR)',
    h1: 'Trouvez le <b>vrai meilleur prix</b> imprimante 3D &amp; filament',
    alt: 'Plus que le prix affiché — nous comparons stock réel, frais de port et coût au €/kg chez les fabricants et distributeurs français.',
    statMagaza: 'boutiques analysées',
    statBirim: '🧵 en stock + prix €/kg',
    statEslesme: '🔍 modèle + couleur',
    modOto: '✨ Automatique',
    modLink: '🔗 Par lien',
    modAd: '💬 Par nom de produit',
    placeholderOto: 'Collez un lien ou tapez un produit… ex. "Creality K1C", "Polymaker PLA", "Arianeplast"',
    placeholderLink: 'Collez l’URL d’un produit (store.creality.com/fr, makershop.fr, arianeplast.com…)',
    placeholderAd: 'Tapez un modèle… ex. "Creality K1C", "PLA Noir 1kg", "Francofil"',
    araBtn: 'Trouver les prix',
    populerEtiket: 'Populaires :',
    ornekler: ['Creality K1C', 'Polymaker PLA', 'Arianeplast PLA', 'Francofil PLA'],
    ipucu: '⚡ Collez un lien ou saisissez un nom pour comparer le stock et le prix total en France · Calculateur STL 100 % local ci-dessous.',
    durumBaslik: 'Analyse des boutiques françaises…',
    iptalBtn: '✕ Annuler',
    ozetEnUcuz: 'Meilleur Prix Total',
    stoktaLabel: '✅ En stock',
    tukendiLabel: '❌ Rupture',
    fiyatYokLabel: 'Voir boutique',
    stlBaslik: '🧩 Déposez votre modèle 3D, voyez le <b>coût réel</b>',
    stlGizlilik: '🔒 Reste sur votre appareil',
    stlBirakAna: 'Glissez un fichier STL / 3MF ici',
    stlBirakAlt: 'Estimation locale instantanée du poids, du volume et du coût matière sans envoi serveur',
    stlRozet: '⚡ Instantané · Local',
    stlDetay: '📊 Calculateur complet électricité, usure &amp; marge (€) ➔',
    aracBaslik: 'Outils Gratuits Impression 3D',
    kartMaliyetBaslik: '🧮 Calculateur de Coût STL / 3MF',
    kartMaliyetMetin: 'Calculez poids, électricité, amortissement et prix de vente en € — 100 % local dans votre navigateur.',
    kartSlicerBaslik: '🧩 Extension UltiMaker Cura &amp; Slicer',
    kartSlicerMetin: 'Obtenez la consommation exacte dès le tranchage sur Cura, OrcaSlicer, Bambu Studio ou PrusaSlicer.',
    kartStoreBaslik: '🛒 Boutique Officielle Creality FR',
    kartStoreMetin: 'Découvrez les imprimantes, plateaux PEI, buses et filaments sur store.creality.com/fr.',
    araniyor: 'Analyse en cours…',
    bulunamadi: 'Aucune offre correspondante en stock pour le moment. Consultez la boutique officielle :',
    git: 'Voir l’offre ↗',
    magazaListeBaslik: 'Boutiques comparées dans cette région',
  },
  ja: {
    market: 'jp',
    currency: 'JPY',
    title: 'Baski Hesap 日本 — 3Dプリンター＆フィラメント実質最安値比較',
    desc: '日本国内の3Dプリンター・フィラメント専門店（Creality公式、SK本舗、サンステラ、ELEGOO JP等）の在庫と円建て（¥）価格を一括比較。',
    rozet: '⚡ 3Dプリント最安値比較 · リアルタイム在庫＆実質価格 (JPY)',
    h1: '3Dプリンター・フィラメントの<b>実質最安値</b>を比較',
    alt: '表示価格だけでなく在庫状況や¥/kg単価までチェック。日本国内の公式ストア・専門店をリアルタイムに比較します。',
    statMagaza: 'ストアを検索',
    statBirim: '🧵 在庫あり + ¥/kg 単価',
    statEslesme: '🔍 型番 + カラー一致',
    modOto: '✨ 自動判定',
    modLink: '🔗 URLで検索',
    modAd: '💬 商品名で検索',
    placeholderOto: '商品URLを貼り付け、または商品名を入力… 例: "Creality K1C", "ELEGOO PETG"',
    placeholderLink: 'store.creality.com/jp、skhonpo.com、sunstella.co.jp 等の商品URLを入力',
    placeholderAd: '商品名を入力… 例: "Creality K1C", "PLA フィラメント"',
    araBtn: '最安値を検索',
    populerEtiket: '人気検索:',
    ornekler: ['Creality K1C', 'ELEGOO PETG', 'Bambu Lab', 'PLA フィラメント'],
    ipucu: '⚡ URLまたは商品名を入力して日本国内ストアの在庫・価格を比較。下のボックスでSTL/3MFの重量・原価もすぐ計算できます。',
    durumBaslik: '国内ストアを検索中…',
    iptalBtn: '✕ 中止',
    ozetEnUcuz: '実質最安値',
    stoktaLabel: '✅ 在庫あり',
    tukendiLabel: '❌ 在庫切れ',
    fiyatYokLabel: 'ショップで確認',
    stlBaslik: '🧩 3Dモデルをドロップして<b>印刷コスト</b>を試算',
    stlGizlilik: '🔒 端末内で完結（アップロードなし）',
    stlBirakAna: 'STL / 3MF ファイルをここにドロップ',
    stlBirakAlt: 'ブラウザ上で瞬時に体積・重量・フィラメント消費量を計算します',
    stlRozet: '⚡ 即時計算 · ローカル',
    stlDetay: '📊 電気代・償却費・利益率を含む詳細原価計算 ➔',
    aracBaslik: '無料3Dプリントツール',
    kartMaliyetBaslik: '🧮 STL / 3MF 原価シミュレーター',
    kartMaliyetMetin: 'STL/3MFを読み込んでフィラメント代・電気代・償却費・推奨販売価格を円（¥）で即時計算します。',
    kartSlicerBaslik: '🧩 UltiMaker Cura &amp; スライサープラグイン',
    kartSlicerMetin: 'Cura、OrcaSlicer、Bambu Studio等でのスライス直後に使用グラム数を自動取得します。',
    kartStoreBaslik: '🛒 Creality 公式ストア（日本）',
    kartStoreMetin: 'store.creality.com/jp で3Dプリンター本体や純正ノズル・フィラメントを確認。',
    araniyor: 'ストアを確認中…',
    bulunamadi: '現在一致する在庫オファーが見つかりませんでした。公式ストアをご確認ください:',
    git: 'ショップへ ↗',
    magazaListeBaslik: 'この地域の比較対象ストア',
  },
});

export function globalAnaSayfaHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = ANA_KOPYA[kod];
  const sz = sozlukGetir(kod);
  const canonicalUrl = `${tabanUrl}${GLOBAL_ANA_YOLLARI[kod]}`;
  const bolgeMagazalari = taramaAdaptersByMarket(c.market);
  const taramaMagazalari = bolgeMagazalari;
  const ortakSiteler = taramaMagazalari.map(m => ({ id: m.id, ad: m.name }));
  const ortam = {
    market: c.market,
    currency: c.currency,
    dil: kod,
    maliyetYolu: GLOBAL_MALIYET_YOLLARI[kod],
    slicerYolu: GLOBAL_SLICER_YOLLARI[kod],
    placeholders: {
      oto: c.placeholderOto.replace(/&quot;/g, '"'),
      link: c.placeholderLink.replace(/&quot;/g, '"'),
      ad: c.placeholderAd.replace(/&quot;/g, '"'),
    },
    siteler: ortakSiteler,
  };

  let cikti = indexSablonOku();

  // 1) Dil, meta etiketleri, canonical, hreflang ve GA4
  cikti = cikti
    .replace('<html lang="tr" data-theme="light">', `<html lang="${htmlKacis(kod)}" data-theme="light">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${c.title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${htmlKacis(c.desc)}" />`)
    .replace(/<meta property="og:locale" content="[^"]*"\s*\/>/, `<meta property="og:locale" content="${htmlKacis(sz.meta.ogLocale)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${c.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${htmlKacis(c.desc)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${c.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${htmlKacis(c.desc)}" />`);

  if (tabanUrl) {
    cikti = cikti.replace(/content="\/og-gorsel\.png"/g, `content="${htmlKacis(tabanUrl)}/og-gorsel.png"`);
  }
  const ga4Snip = ga4HeadSnip();
  const ekHead = [
    `<link rel="canonical" href="${htmlKacis(canonicalUrl)}" />`,
    `<meta property="og:url" content="${htmlKacis(canonicalUrl)}" />`,
    hreflangEtiketleri(tabanUrl, ANA_YOL_HARITASI),
    ga4Snip,
  ].filter(Boolean).join('\n  ');
  cikti = cikti.replace('</head>', `  ${ekHead}\n</head>`);

  // 2) Üst menü & bölgesel dil seçici (TR nav yerine seçili dilin rotaları)
  const nav = navYollariGetir(kod);
  cikti = cikti.replace(
    /<header class="ustbar">[\s\S]*?<\/header>/,
    `<header class="ustbar">
    <div class="kap">
      <a class="logo" href="${htmlKacis(nav.ana)}" aria-label="${htmlKacis(sz.meta.siteAdi)}">
        <img class="logo-gorsel" src="/logo.png" alt="${htmlKacis(sz.meta.siteAdi)}" width="36" height="30" decoding="async" />
      </a>
      <nav class="menu">
        <a href="${htmlKacis(nav.ana)}" class="etkin">${htmlKacis(sz.nav.karsilastir)}</a>
        <a href="${htmlKacis(nav.katalog)}">🗂️ ${htmlKacis(sz.nav.katalog)}</a>
        <a href="${htmlKacis(nav.rehber)}">📖 ${htmlKacis(sz.nav.rehberler)}</a>
        <a href="${htmlKacis(nav.maliyet)}">🧮 ${htmlKacis(sz.nav.maliyet)}</a>
        <a href="${htmlKacis(nav.sepet)}">🧺 ${htmlKacis(sz.nav.akilliSepet)}</a>
        <a href="${htmlKacis(nav.slicer)}">🧩 ${htmlKacis(sz.nav.eklenti)}</a>
        <a href="${htmlKacis(nav.ayarlar)}">🔔 ${htmlKacis(sz.nav.alarmlar)}</a>
      </nav>
      ${dilSeciciHtml(kod, ANA_YOL_HARITASI)}
      <button type="button" class="tema-degistir" id="temaDegistir" aria-label="Theme" title="Theme">🌓</button>
    </div>
  </header>`,
  );

  // 3) Hero + Hibrit arama kartı (index.html ile birebir CSS/ID yapısı, seçili dilde)
  cikti = cikti.replace(
    /<section class="hero">[\s\S]*?<\/section>/,
    `<section class="hero">
      <div class="hero-ic">
        <span class="hero-rozet">${c.rozet}</span>
        <h1>${c.h1}</h1>
        <p>${c.alt}</p>
        <div class="hero-istatistik">
          <span><b id="heroSiteSayisi">${taramaMagazalari.length}</b> ${c.statMagaza}</span>
          <span>${c.statBirim}</span>
          <span>${c.statEslesme}</span>
        </div>
      </div>
    </section>`,
  );

  cikti = cikti
    .replace('✨ Otomatik', c.modOto)
    .replace('🔗 Linkte ara', c.modLink)
    .replace('💬 Ürün adıyla ara', c.modAd)
    .replace(
      'placeholder="Ürün linki yapıştır ya da ürün adı yaz…  ör. &quot;eSun PLA+&quot;, &quot;Bambu Lab A1 Mini&quot;"',
      `placeholder="${htmlKacis(c.placeholderOto)}"`,
    )
    .replace('<button type="submit" id="araBtn">Fiyatları Bul</button>', `<button type="submit" id="araBtn">${c.araBtn}</button>`)
    .replace(
      /<div class="hizli-arama">[\s\S]*?<\/div>/,
      `<div class="hizli-arama">
        <span class="hizli-etiket">${c.populerEtiket}</span>
        ${c.ornekler.map(o => `<button type="button" class="hizli-cip" data-hizli="${htmlKacis(o)}">${htmlKacis(o)}</button>`).join('\n        ')}
      </div>`,
    )
    .replace(
      /<p class="hibrit-ipucu">[\s\S]*?<\/p>/,
      `<p class="hibrit-ipucu">${c.ipucu} (<b id="kartSiteSayisi">${taramaMagazalari.length}</b> ${c.statMagaza})</p>`,
    );

  // 4) STL hızlı hesap kutusu + Alt mağaza listesi başlığı
  cikti = cikti
    .replace(/<h2 id="stlHizliBaslik" class="stl-hizli-baslik">[\s\S]*?<\/h2>/, `<h2 id="stlHizliBaslik" class="stl-hizli-baslik">${c.stlBaslik}</h2>`)
    .replace('<span class="stl-hizli-gizlilik">🔒 Dosya cihazından çıkmaz</span>', `<span class="stl-hizli-gizlilik">${c.stlGizlilik}</span>`)
    .replace('<b>STL / 3MF dosyanı buraya bırak</b>', `<b>${c.stlBirakAna}</b>`)
    .replace('<span class="stl-hizli-alt">Modeline yetecek en ucuz filamenti ve parça başı maliyeti anında hesaplarız</span>', `<span class="stl-hizli-alt">${c.stlBirakAlt}</span>`)
    .replace('<span class="stl-hizli-rozet">⚡ Anında · sunucusuz</span>', `<span class="stl-hizli-rozet">${c.stlRozet}</span>`)
    .replace(/📊 Kâr, elektrik ve amortismanla tam maliyet hesabı ➔/g, c.stlDetay)
    .replace('<h2 class="bolum-baslik">Siteler araştırılıyor…</h2>', `<h2 class="bolum-baslik">${c.durumBaslik}</h2>`)
    .replace('<button type="button" id="iptalBtn" class="iptal-btn">✕ İptal</button>', `<button type="button" id="iptalBtn" class="iptal-btn">${c.iptalBtn}</button>`)
    .replace('Karşılaştırılan siteler (<span id="footerSiteSayisi">—</span>):', `${c.magazaListeBaslik} (<span id="footerSiteSayisi">${taramaMagazalari.length}</span>):`)
    .replace('<a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>', `<a class="footer-marka-alan" href="${htmlKacis(GLOBAL_ANA_YOLLARI[kod])}" rel="home">baskihesap.tech</a>`)
    .replace(/<nav class="footer-hub"[\s\S]*?<\/nav>/, footerHubHtml(kod))
    .replace('<ul id="footerSiteler" class="footer-siteler"></ul>', `<ul id="footerSiteler" class="footer-siteler">${bolgeMagazalari.map(m => `<li>${htmlKacis(m.name)}</li>`).join('')}</ul>`);

  // 5) Gerçek app.js ortam nesnesi + dinamik UI çevirmeni
  cikti = cikti.replace(
    '<script src="/app.js"></script>',
    `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/i18n-global.js"></script>\n  <script src="/app.js"></script>`,
  );

  return cikti;
}

export function globalAracSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '');
  for (const [dil, rYol] of Object.entries(GLOBAL_ANA_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'ana', olustur: (tabanUrl) => globalAnaSayfaHtml(dil, tabanUrl) };
  }
  for (const [dil, rYol] of Object.entries(GLOBAL_MALIYET_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'maliyet', olustur: (tabanUrl) => globalMaliyetSayfasiHtml(dil, tabanUrl) };
  }
  for (const [dil, rYol] of Object.entries(GLOBAL_SEPET_YOLLARI)) {
    if (dil !== 'tr' && rYol === temiz) return { dil, tur: 'sepet', olustur: (tabanUrl) => globalSepetSayfasiHtml(dil, tabanUrl) };
  }
  for (const [dil, rYol] of Object.entries(GLOBAL_SLICER_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'slicer', olustur: (tabanUrl) => globalSlicerSayfasiHtml(dil, tabanUrl) };
  }
  return null;
}

/** Çok dilli alternatif haritası (TR + EN + FR + JA + x-default). */
export function globalAracAlternatifHaritasi() {
  const ana = { ...ANA_YOL_HARITASI, 'x-default': '/' };
  const maliyet = { ...MALIYET_YOL_HARITASI, 'x-default': GLOBAL_MALIYET_YOLLARI.en };
  const sepet = { ...SEPET_YOL_HARITASI, 'x-default': GLOBAL_SEPET_YOLLARI.en };
  const slicer = { ...SLICER_YOL_HARITASI, 'x-default': GLOBAL_SLICER_YOLLARI.en };
  const katalog = { ...GLOBAL_KATALOG_YOLLARI, 'x-default': '/' + GLOBAL_KATALOG_YOLLARI.en.replace(/^\//, '') };
  const rehber = { ...GLOBAL_REHBER_YOLLARI, 'x-default': '/' + GLOBAL_REHBER_YOLLARI.en.replace(/^\//, '') };
  return {
    '/': ana,
    '/en': ana,
    '/fr': ana,
    '/ja': ana,
    '/maliyet.html': maliyet,
    '/en/cost-calculator': maliyet,
    '/fr/calculateur-cout': maliyet,
    '/ja/cost-calculator': maliyet,
    '/sepet.html': sepet,
    '/en/basket': sepet,
    '/fr/panier': sepet,
    '/ja/basket': sepet,
    '/slicer.html': slicer,
    '/en/slicer': slicer,
    '/fr/slicer': slicer,
    '/ja/slicer': slicer,
    '/urunler': katalog,
    '/en/products': katalog,
    '/fr/produits': katalog,
    '/ja/products': katalog,
    '/rehber': rehber,
    '/en/guides': rehber,
    '/fr/guides': rehber,
    '/ja/guides': rehber,
  };
}

export function globalAracSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const altHarita = globalAracAlternatifHaritasi();
  const yalnizGlobal = (harita) => Object.fromEntries(
    Object.entries(harita).filter(([d]) => d !== 'tr'),
  );
  const gruplar = [
    { yollar: GLOBAL_ANA_YOLLARI, oncelik: '0.95', siklik: 'daily' },
    { yollar: yalnizGlobal(GLOBAL_KATALOG_YOLLARI), oncelik: '0.90', siklik: 'daily' },
    { yollar: yalnizGlobal(GLOBAL_REHBER_YOLLARI), oncelik: '0.85', siklik: 'weekly' },
    { yollar: GLOBAL_MALIYET_YOLLARI, oncelik: '0.85', siklik: 'weekly' },
    { yollar: yalnizGlobal(GLOBAL_SEPET_YOLLARI), oncelik: '0.85', siklik: 'weekly' },
    { yollar: GLOBAL_SLICER_YOLLARI, oncelik: '0.80', siklik: 'weekly' },
  ];
  const hepsi = [];
  for (const g of gruplar) {
    for (const [d, yol] of Object.entries(g.yollar)) {
      hepsi.push({ dil: d, yol, oncelik: g.oncelik, siklik: g.siklik, lastmod: bugun, alternates: altHarita[yol] });
    }
  }
  if (!dil) return hepsi;
  const hedef = normalizeDil(dil);
  return hepsi.filter(x => x.dil === hedef);
}
