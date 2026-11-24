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
  htmlKacis, sayfaIskeleti, dilSeciciHtml, ga4HeadSnip, temaDugmesiHtml,
  GLOBAL_KATALOG_YOLLARI, GLOBAL_REHBER_YOLLARI, GLOBAL_SEPET_YOLLARI,
  footerHubHtml, navYollariGetir, SEO_KATEGORILER, kategoriYoluGetir,
} from './seoSayfalar.js';
import { normalizeDil, sozlukGetir } from './i18n/index.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';
import { adaptersByMarket, taramaAdaptersByMarket } from './sites/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _indexSablon = null;
let _maliyetSablon = null;
let _sepetSablon = null;
let _slicerSablon = null;
let _ayarlarSablon = null;
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
function ayarlarSablonOku() {
  if (!_ayarlarSablon || process.env.NODE_ENV !== 'production') _ayarlarSablon = sablonOku('ayarlar.html');
  return _ayarlarSablon;
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

export const GLOBAL_AYARLAR_YOLLARI = Object.freeze({
  en: '/en/alerts',
  fr: '/fr/alertes',
  ja: '/ja/alerts',
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

export const AYARLAR_YOL_HARITASI = Object.freeze({
  tr: '/ayarlar.html',
  ...GLOBAL_AYARLAR_YOLLARI,
});

export const SEPET_YOL_HARITASI = GLOBAL_SEPET_YOLLARI;

const GLOBAL_ARIA_NITELIK = Object.freeze({
  en: [
    ['aria-label="Arama önerileri"', 'aria-label="Search suggestions"'],
    ['aria-label="Ürün önerileri"', 'aria-label="Product suggestions"'],
    ['aria-label="Borsayı yenile"', 'aria-label="Refresh deals"'],
    ['aria-label="Sonucu kapat"', 'aria-label="Close result"'],
    ['aria-label="Modeli kaldır"', 'aria-label="Remove model"'],
    ['aria-label="Teklif fişini kapat"', 'aria-label="Close quote receipt"'],
    ['aria-label="G-Code dosyasını sürükleyip bırakın veya seçin"', 'aria-label="Drag & drop or select a G-Code file"'],
    ['aria-label="STL veya 3MF dosyasını sürükleyip bırakın ya da seçin"', 'aria-label="Drag & drop or select an STL or 3MF file"'],
    ['aria-label="Modelin izometrik tel çerçeve silüeti"', 'aria-label="Isometric wireframe silhouette of the model"'],
    ['aria-label="Doluluk oranı ince ayar (%)"', 'aria-label="Fine-tune infill (%)"'],
    ['aria-label="Model gramajı kaydırıcı"', 'aria-label="Model weight slider"'],
    ['aria-label="Model gramajı (gram)"', 'aria-label="Model weight (grams)"'],
    ['aria-label="Baskı süresi kaydırıcı"', 'aria-label="Print time slider"'],
    ['aria-label="Baskı süresi (saat)"', 'aria-label="Print time (hours)"'],
    ['aria-label="3D yazıcı modeli"', 'aria-label="3D printer model"'],
    ['aria-label="Hızlı yazıcı seçimi"', 'aria-label="Quick printer selection"'],
    ['aria-label="Filament fiyat kaynağı"', 'aria-label="Filament price source"'],
    ['aria-label="Kâr marjı kaydırıcı"', 'aria-label="Profit margin slider"'],
    ['aria-label="Hızlı kâr çarpanı"', 'aria-label="Quick profit multiplier"'],
    ['aria-label="Karanlık / aydınlık temayı değiştir"', 'aria-label="Toggle dark / light theme"'],
    ['placeholder="ör. PETG Siyah"', 'placeholder="e.g. PETG Black"'],
    ['placeholder="Örn. sessiz başlangıç 3D yazıcısı, bütçem 15.000 TL"', 'placeholder="e.g. quiet beginner 3D printer under $400"'],
    ['>%150 · 2.5x<', '>150% · 2.5x<'],
  ],
  fr: [
    ['aria-label="Arama önerileri"', 'aria-label="Suggestions de recherche"'],
    ['aria-label="Ürün önerileri"', 'aria-label="Suggestions de produits"'],
    ['aria-label="Borsayı yenile"', 'aria-label="Actualiser les offres"'],
    ['aria-label="Sonucu kapat"', 'aria-label="Fermer le résultat"'],
    ['aria-label="Modeli kaldır"', 'aria-label="Retirer le modèle"'],
    ['aria-label="Teklif fişini kapat"', 'aria-label="Fermer le devis"'],
    ['aria-label="G-Code dosyasını sürükleyip bırakın veya seçin"', 'aria-label="Glissez ou sélectionnez un fichier G-Code"'],
    ['aria-label="STL veya 3MF dosyasını sürükleyip bırakın ya da seçin"', 'aria-label="Glissez ou sélectionnez un fichier STL ou 3MF"'],
    ['aria-label="Modelin izometrik tel çerçeve silüeti"', 'aria-label="Aperçu filaire isométrique du modèle"'],
    ['aria-label="Doluluk oranı ince ayar (%)"', 'aria-label="Réglage fin du remplissage (%)"'],
    ['aria-label="Model gramajı kaydırıcı"', 'aria-label="Curseur poids du modèle"'],
    ['aria-label="Model gramajı (gram)"', 'aria-label="Poids du modèle (grammes)"'],
    ['aria-label="Baskı süresi kaydırıcı"', 'aria-label="Curseur durée d’impression"'],
    ['aria-label="Baskı süresi (saat)"', 'aria-label="Durée d’impression (heures)"'],
    ['aria-label="3D yazıcı modeli"', 'aria-label="Modèle d’imprimante 3D"'],
    ['aria-label="Hızlı yazıcı seçimi"', 'aria-label="Sélection rapide d’imprimante"'],
    ['aria-label="Filament fiyat kaynağı"', 'aria-label="Source du prix filament"'],
    ['aria-label="Kâr marjı kaydırıcı"', 'aria-label="Curseur marge bénéficiaire"'],
    ['aria-label="Hızlı kâr çarpanı"', 'aria-label="Multiplicateur de marge rapide"'],
    ['aria-label="Karanlık / aydınlık temayı değiştir"', 'aria-label="Changer de thème clair / sombre"'],
    ['placeholder="ör. PETG Siyah"', 'placeholder="ex. PETG Noir"'],
    ['placeholder="Örn. sessiz başlangıç 3D yazıcısı, bütçem 15.000 TL"', 'placeholder="ex. imprimante 3D silencieuse pour débuter, budget 400 €"'],
    ['>%150 · 2.5x<', '>150 % · 2,5x<'],
  ],
  ja: [
    ['aria-label="Arama önerileri"', 'aria-label="検索候補"'],
    ['aria-label="Ürün önerileri"', 'aria-label="商品候補"'],
    ['aria-label="Borsayı yenile"', 'aria-label="相場を更新"'],
    ['aria-label="Sonucu kapat"', 'aria-label="結果を閉じる"'],
    ['aria-label="Modeli kaldır"', 'aria-label="モデルを削除"'],
    ['aria-label="Teklif fişini kapat"', 'aria-label="見積書を閉じる"'],
    ['aria-label="G-Code dosyasını sürükleyip bırakın veya seçin"', 'aria-label="G-Codeファイルをドロップまたは選択"'],
    ['aria-label="STL veya 3MF dosyasını sürükleyip bırakın ya da seçin"', 'aria-label="STLまたは3MFファイルをドロップまたは選択"'],
    ['aria-label="Modelin izometrik tel çerçeve silüeti"', 'aria-label="モデルの等角ワイヤーフレーム"'],
    ['aria-label="Doluluk oranı ince ayar (%)"', 'aria-label="インフィル微調整 (%)"'],
    ['aria-label="Model gramajı kaydırıcı"', 'aria-label="モデル重量スライダー"'],
    ['aria-label="Model gramajı (gram)"', 'aria-label="モデル重量 (g)"'],
    ['aria-label="Baskı süresi kaydırıcı"', 'aria-label="印刷時間スライダー"'],
    ['aria-label="Baskı süresi (saat)"', 'aria-label="印刷時間 (時間)"'],
    ['aria-label="3D yazıcı modeli"', 'aria-label="3Dプリンター機種"'],
    ['aria-label="Hızlı yazıcı seçimi"', 'aria-label="クイック機種選択"'],
    ['aria-label="Filament fiyat kaynağı"', 'aria-label="フィラメント価格ソース"'],
    ['aria-label="Kâr marjı kaydırıcı"', 'aria-label="利益率スライダー"'],
    ['aria-label="Hızlı kâr çarpanı"', 'aria-label="利益倍率プリセット"'],
    ['aria-label="Karanlık / aydınlık temayı değiştir"', 'aria-label="ライト／ダークテーマ切替"'],
    ['placeholder="ör. PETG Siyah"', 'placeholder="例: PETG ブラック"'],
    ['placeholder="Örn. sessiz başlangıç 3D yazıcısı, bütçem 15.000 TL"', 'placeholder="例: 予算5万円以内、静音な初心者向け3Dプリンター"'],
    ['>%150 · 2.5x<', '>150% · 2.5x<'],
  ],
});

function nitelikAriaYerellestir(html, kod) {
  let out = String(html || '');
  for (const [tr, hedef] of GLOBAL_ARIA_NITELIK[kod] || []) {
    out = out.split(tr).join(hedef);
  }
  return out;
}

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
        <a href="${htmlKacis(nav.ayarlar)}"${aktifNav === 'ayarlar' ? ' class="etkin"' : ''}>🔔 ${htmlKacis(sz.nav.alarmlar)}</a>
      </nav>
      ${dilSeciciHtml(kod, yolHaritasi)}
      ${temaDugmesiHtml(kod)}
    </div>
  </header>`,
  );

  cikti = cikti
    .replace(/<nav class="footer-hub"[\s\S]*?<\/nav>/, footerHubHtml(kod))
    .replace('<a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>', `<a class="footer-marka-alan" href="${htmlKacis(nav.ana)}" rel="home">baskihesap.tech</a>`);

  return nitelikAriaYerellestir(cikti, kod);
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
      gramajIpucu: '“Filament used” value reported by Bambu Studio, Cura, or OrcaSlicer.',
      yaziciLbl: '⚡ 3D printer model',
      malzemeAdLbl: 'Material name',
      gelismisSum: '⚙️ Advanced settings (electricity · depreciation · profit margin)',
      hedefKarLbl: '💰 Target profit margin',
      footerUstNot: 'Live filament pricing is scanned from regional stores; always verify final checkout totals.',
      birimSira: ['Weight', 'Time', 'Printer power', 'Filament', 'Advanced settings (electricity · depreciation · profit margin)', 'Target profit margin', 'Material price', 'Material name', 'Estimated print time.', 'Filament Used from your slicer.'],
      dolulukSecenek: ['10% — draft', '20% — standard', '40% — strong', '100% — solid'],
      sureTahminBtn: '✨ Estimate', sureTahminTitle: 'Auto-estimate print time from weight',
      filamentLbl: '🧵 Filament', filamentAria: 'Filament price source', gucLbl: 'Power (W)',
      kaydiriciAria: 'Profit margin slider', carpanAria: 'Quick profit multiplier',
      ctaNot: 'Affiliate links may earn a commission at zero extra cost to you.',
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
      gramajIpucu: 'Valeur « Filament used » indiquée par Bambu Studio, Cura ou OrcaSlicer.',
      yaziciLbl: '⚡ Modèle d’imprimante 3D',
      malzemeAdLbl: 'Nom du matériau',
      gelismisSum: '⚙️ Paramètres avancés (électricité · amortissement · marge bénéficiaire)',
      hedefKarLbl: '💰 Marge bénéficiaire cible',
      footerUstNot: 'Les prix des filaments proviennent de l’analyse régionale en direct ; vérifiez toujours chez le marchand.',
      dolulukSecenek: ['10 % — brouillon', '20 % — standard', '40 % — solide', '100 % — plein'],
      sureTahminBtn: '✨ Estimer', sureTahminTitle: 'Estimer automatiquement depuis le poids',
      filamentLbl: '🧵 Filament', filamentAria: 'Source de prix du filament', gucLbl: 'Puissance (W)',
      kaydiriciAria: 'Curseur de marge bénéficiaire', carpanAria: 'Multiplicateur de marge rapide',
      ctaNot: 'Liens possiblement affiliés ; votre prix reste inchangé.',
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
      gramajIpucu: 'Bambu Studio・Cura・OrcaSlicerに表示される「Filament used」の値を入力してください。',
      yaziciLbl: '⚡ 3Dプリンター機種',
      malzemeAdLbl: '素材名',
      gelismisSum: '⚙️ 詳細設定（電気代・償却費・目標利益率）',
      hedefKarLbl: '💰 目標利益率',
      footerUstNot: 'フィラメント価格は地域ライブスキャン結果です。購入前にショップ画面で最終金額をご確認ください。',
      dolulukSecenek: ['10% — 下書き', '20% — 標準', '40% — 高強度', '100% — ソリッド'],
      sureTahminBtn: '✨ 自動推定', sureTahminTitle: 'モデル重量から印刷時間を自動推定',
      filamentLbl: '🧵 フィラメント', filamentAria: 'フィラメント価格ソース', gucLbl: '消費電力 (W)',
      kaydiriciAria: '利益率スライダー', carpanAria: '利益倍率プリセット',
      ctaNot: '※一部アフィリエイトリンクを含みますが、購入価格は変わりません。',
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
    .replace('<p class="mz-ipucu">Dilimleyicide (Bambu Studio, Cura, OrcaSlicer) “Filament used” değeri.</p>', `<p class="mz-ipucu">${k.gramajIpucu}</p>`)
    .replace('<label for="sure">⏱️ Baskı süresi (saat)</label>', `<label for="sure">${c.sureLabel}</label>`)
    .replace('<button type="button" class="mz-mini-btn" id="sureTahmin" title="Gramajdan otomatik tahmin et">✨ Tahmin et</button>', `<button type="button" class="mz-mini-btn" id="sureTahmin" title="${htmlKacis(k.sureTahminTitle)}">${k.sureTahminBtn}</button>`)
    .replace('<label for="yazici">⚡ 3D yazıcı modeli</label>', `<label for="yazici">${k.yaziciLbl}</label>`)
    .replace('<label for="gucW">Güç (W)</label>', `<label for="gucW">${k.gucLbl}</label>`)
    .replace('<label>🧵 Filament</label>', `<label>${k.filamentLbl}</label>`)
    .replace('aria-label="Filament fiyat kaynağı"', `aria-label="${htmlKacis(k.filamentAria)}"`)
    .replace('<button type="button" class="mz-sekme-btn aktif" data-mod="canli" role="tab" aria-selected="true">Canlı piyasa</button>', `<button type="button" class="mz-sekme-btn aktif" data-mod="canli" role="tab" aria-selected="true">${k.canliPiyasa}</button>`)
    .replace('<button type="button" class="mz-sekme-btn" data-mod="manuel" role="tab" aria-selected="false">Manuel</button>', `<button type="button" class="mz-sekme-btn" data-mod="manuel" role="tab" aria-selected="false">${k.manuel}</button>`)
    .replace('<label for="manuelTlKg">Fiyat (₺/kg)</label>', `<label for="manuelTlKg">${c.filamentFiyatLabel}</label>`)
    .replace('<label for="manuelAd">Malzeme adı</label>', `<label for="manuelAd">${k.malzemeAdLbl}</label>`)
    .replace('<summary>⚙️ Gelişmiş ayarlar (elektrik · amortisman · kâr marjı)</summary>', `<summary>${k.gelismisSum}</summary>`)
    .replace('<label for="karCarpani">💰 Hedef kâr marjı</label>', `<label for="karCarpani">${k.hedefKarLbl}</label>`)
    .replace('aria-label="Kâr marjı kaydırıcı"', `aria-label="${htmlKacis(k.kaydiriciAria)}"`)
    .replace('aria-label="Hızlı kâr çarpanı"', `aria-label="${htmlKacis(k.carpanAria)}"`)
    .replace('value="600" inputmode="decimal"', `value="${c.varsayilanFilamentKg}" inputmode="decimal"`)
    .replace('<label for="kwhTl">💡 Elektrik (₺/kWh)</label>', `<label for="kwhTl">${c.elektrikLabel}</label>`)
    .replace('value="2.90" inputmode="decimal"', `value="${c.varsayilanElektrikKwh}" inputmode="decimal"`)
    .replace('<label for="yipranma">🛠️ Yıpranma (₺/saat)</label>', `<label for="yipranma">${c.yipranmaLabel}</label>`)
    .replace('value="3.00" inputmode="decimal"', `value="${c.varsayilanYipranma}" inputmode="decimal"`)
    .replace('Filament fiyatları canlı radar taramasından gelir; her zaman mağazada doğrulayın.', k.footerUstNot)
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
    .replace('<p class="mz-cta-not">Bağlantı komisyonlu olabilir; fiyatınızı değiştirmez.</p>', `<p class="mz-cta-not">${k.ctaNot}</p>`)
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
      heroGuven1: '🔒 Only weight + material sent',
      heroGuven2: '🆓 Free, no account needed',
      jsonBtn: '{ } Show API JSON output',
      curaAdim1: '<code>.curapackage</code> file: <b>drag &amp; drop</b> into Cura window.',
      curaAdim2: '<b>Restart</b> Cura.',
      curaAdim3: 'Slice a model — instant filament alert appears.',
      bambuAdim1: 'Save the script locally (e.g. <code>C:\\BaskiHesap\\en_ucuz_slicer.py</code>).',
      bambuAdim2: 'Paste full path in <b>Print Settings ➔ Output options ➔ Post-processing scripts</b>.',
      bambuAdim3: 'Slice and save — price notification appears automatically.',
      pySum: '🐍 No Python installed? (Windows)',
      pyP1: 'The script requires Python 3. Install from <a href="https://www.python.org/downloads/" target="_blank" rel="noopener">python.org</a>, check <b>"Add python.exe to PATH"</b>, then enter:',
      pyP2: 'Optional standalone <code>.exe</code> build:',
      pyP3: '⚠️ With <code>--noconsole</code>, <code>--test</code> prints no terminal output; alerts still work.',
      testSum: '✅ Verify setup',
      testP1: 'Run in terminal:',
      testP2: 'Shows a test notification if reachable; prints <code>RESULT: API unreachable</code> offline — slicing never fails.',
      guvenHtml: `<li><b>What is sent:</b> only material type (PLA/PETG…), weight, and source tag (<code>cura</code>, <code>bambu</code>…). Color is optional.</li>
        <li><b>What is never sent:</b> file name, 3D geometry, G-Code, or personal data beyond standard IP.</li>
        <li><b>G-Code untouched:</b> post-processor is strictly <b>read-only</b>; never modifies slices.</li>
        <li><b>Zero slicer lag:</b> HTTP request and toast run asynchronously; finishes in milliseconds.</li>
        <li><b>Silent offline:</b> if API is unreachable, nothing interrupts slicing.</li>
        <li><b>Honest results:</b> if no matching spool is in stock, returns not found — never synthetic prices.</li>`,
      apiParamHtml: 'Parameters: <code>malzeme</code> · <code>gramaj</code> (required) · <code>renk</code> · <code>market</code> · <code>kaynak</code>. Missing weight returns <code>400</code>; no stock returns <code>status:"bulunamadi"</code>.',
      apiOrnek: `GET /api/embed/oner?malzeme=PLA&amp;gramaj=340&amp;market=us&amp;kaynak=cura

{
  "status": "success",
  "talep": { "malzeme": "PLA", "gramaj": 340, "renk": "Black" },
  "enUcuz": {
    "urunAdi": "PolyLite PLA Filament Black 1kg",
    "magaza": "Polymaker (US)",
    "fiyat": 19.99,
    "parcaBasiMaliyet": 6.80,
    "makaradanCikanAdet": 2,
    "stok": true,
    "yonlendirmeLinki": "https://baskihesap.tech/yonlendir?urunId=4&amp;kaynak=cura"
  },
  "bildirimMetni": "This print requires 340 g Black PLA ($6.80 at Polymaker US)."`,
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
      heroGuven1: '🔒 Seuls poids + matériau envoyés',
      heroGuven2: '🆓 Gratuit, sans compte',
      jsonBtn: '{ } Afficher la réponse JSON',
      curaAdim1: 'Glissez-déposez le fichier <code>.curapackage</code> dans la fenêtre Cura.',
      curaAdim2: '<b>Redémarrez</b> Cura.',
      curaAdim3: 'Tranchez un modèle — la notification s’affiche aussitôt.',
      bambuAdim1: 'Enregistrez le script (ex. <code>C:\\BaskiHesap\\en_ucuz_slicer.py</code>).',
      bambuAdim2: 'Collez le chemin dans <b>Print Settings ➔ Output options ➔ Post-processing scripts</b>.',
      bambuAdim3: 'Tranchez et exportez — le meilleur prix s’affiche.',
      pySum: '🐍 Python absent ? (Windows)',
      pyP1: 'Le script requiert Python 3. Installez-le sur <a href="https://www.python.org/downloads/" target="_blank" rel="noopener">python.org</a> en cochant <b>« Add python.exe to PATH »</b>, puis saisissez :',
      pyP2: 'Optionnel — générer un <code>.exe</code> autonome :',
      pyP3: '⚠️ Avec <code>--noconsole</code>, <code>--test</code> reste silencieux en console mais les notifications fonctionnent.',
      testSum: '✅ Vérifier l’installation',
      testP1: 'Exécutez dans un terminal :',
      testP2: 'Affiche une notification test si l’API répond ; sinon n’interrompt jamais le tranchage.',
      guvenHtml: `<li><b>Données envoyées :</b> uniquement matériau (PLA/PETG…), poids et source (<code>cura</code>, <code>bambu</code>…).</li>
        <li><b>Jamais envoyé :</b> nom de fichier, modèle 3D, G-Code ni donnée personnelle.</li>
        <li><b>G-Code intact :</b> lecture seule uniquement ; le fichier tranché n’est jamais modifié.</li>
        <li><b>Aucun ralentissement :</b> requête exécutée en tâche de fond en quelques millisecondes.</li>
        <li><b>Silencieux hors ligne :</b> aucune erreur bloquante si la connexion est absente.</li>
        <li><b>Aucun prix fictif :</b> si le stock est épuisé, l’API renvoie simplement indisponible.</li>`,
      apiParamHtml: 'Paramètres : <code>malzeme</code> · <code>gramaj</code> (requis) · <code>renk</code> · <code>market</code> · <code>kaynak</code>. Retourne <code>status:"bulunamadi"</code> si rupture.',
      apiOrnek: `GET /api/embed/oner?malzeme=PLA&amp;gramaj=340&amp;market=fr&amp;kaynak=cura

{
  "status": "success",
  "talep": { "malzeme": "PLA", "gramaj": 340, "renk": "Black" },
  "enUcuz": {
    "urunAdi": "Overture PLA Filament Noir 1kg",
    "magaza": "Overture 3D (EU/FR)",
    "fiyat": 18.99,
    "parcaBasiMaliyet": 6.46,
    "makaradanCikanAdet": 2,
    "stok": true,
    "yonlendirmeLinki": "https://baskihesap.tech/yonlendir?urunId=4&amp;kaynak=cura"
  },
  "bildirimMetni": "Cette impression nécessite 340 g de PLA Noir (6,46 € chez Overture FR)."`,
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
      heroGuven1: '🔒 重量と素材名のみ送信',
      heroGuven2: '🆓 完全無料・登録不要',
      jsonBtn: '{ } API JSON出力を表示',
      curaAdim1: '<code>.curapackage</code> ファイルを Cura ウィンドウへドラッグ＆ドロップ。',
      curaAdim2: 'Cura を<b>再起動</b>します。',
      curaAdim3: 'モデルをスライスすると最安価格が通知されます。',
      bambuAdim1: 'スクリプトを保存（例: <code>C:\\BaskiHesap\\en_ucuz_slicer.py</code>）。',
      bambuAdim2: '<b>Print Settings ➔ Output options ➔ Post-processing scripts</b> にフルパスを貼付。',
      bambuAdim3: 'スライス保存で通知が表示されます。',
      pySum: '🐍 Python未導入の場合（Windows）',
      pyP1: 'Python 3 が必要です。<a href="https://www.python.org/downloads/" target="_blank" rel="noopener">python.org</a> から <b>「Add python.exe to PATH」</b> にチェックを入れて導入後、以下を入力:',
      pyP2: '任意（単体 <code>.exe</code> 化コマンド）:',
      pyP3: '⚠️ <code>--noconsole</code> 指定時は <code>--test</code> 出力が見えませんが通知は動作します。',
      testSum: '✅ 動作確認',
      testP1: 'ターミナルで実行:',
      testP2: 'API接続時にテスト通知を表示します（オフライン時でもスライスは中断しません）。',
      guvenHtml: `<li><b>送信内容:</b> 素材種別 (PLA/PETG…)、重量(g)、呼び出し元 (<code>cura</code>等) のみ。</li>
        <li><b>非送信:</b> ファイル名・3Dモデル・G-Code本体や個人情報は一切送信しません。</li>
        <li><b>G-Code非改変:</b> 読み取り専用で、スライス結果を書き換えません。</li>
        <li><b>高速動作:</b> 別プロセス実行のためスライス処理が遅くなりません。</li>
        <li><b>オフライン安全:</b> 通信エラー時は無音で終了し作業を妨げません。</li>
        <li><b>実在庫のみ:</b> 在庫切れ時に架空価格を表示しません。</li>`,
      apiParamHtml: 'パラメータ: <code>malzeme</code> · <code>gramaj</code>（必須）· <code>renk</code> · <code>market</code> · <code>kaynak</code>。在庫なし時は <code>status:"bulunamadi"</code>。',
      apiOrnek: `GET /api/embed/oner?malzeme=PLA&amp;gramaj=340&amp;market=jp&amp;kaynak=cura

{
  "status": "success",
  "talep": { "malzeme": "PLA", "gramaj": 340, "renk": "Black" },
  "enUcuz": {
    "urunAdi": "Creality Hyper PLA ブラック 1kg",
    "magaza": "Creality (JP)",
    "fiyat": 2980,
    "parcaBasiMaliyet": 1013,
    "makaradanCikanAdet": 2,
    "stok": true,
    "yonlendirmeLinki": "https://baskihesap.tech/yonlendir?urunId=4&amp;kaynak=cura"
  },
  "bildirimMetni": "この造形には 340 g のブラック PLA が必要です（最安 ¥1,013）。"`,
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
    .replace('<span>🔒 Yalnızca gramaj + malzeme gönderilir</span>', `<span>${k.heroGuven1}</span>`)
    .replace('<span>🆓 Ücretsiz, hesap gerekmez</span>', `<span>${k.heroGuven2}</span>`)
    .replace('<h2 id="slCanliBaslik">🔎 Canlı örnek &amp; anında G-Code analizi</h2>', `<h2 id="slCanliBaslik">${k.canliBaslik}</h2>`)
    .replace('<span class="sl-canli-etiket">68 mağaza · gerçek veri</span>', `<span class="sl-canli-etiket">${k.canliEtiket}</span>`)
    .replace('<b>İsterseniz bir <code>.gcode</code> dosyasını buraya bırakın (veya tıklayın)</b>', `<b>${c.dropBaslik}</b>`)
    .replace('<span>Bambu Studio, OrcaSlicer, PrusaSlicer, Cura meta verisi tarayıcıda okunur; dosya sunucuya yüklenmez.</span>', `<span>${k.dropMeta}</span>`)
    .replace(/<label>\s*Malzeme\b/, `<label>\n          ${k.malzemeLbl}`)
    .replace(/<label>\s*Gramaj \(g\)/, `<label>\n          ${k.gramajLbl}`)
    .replace('Renk (isteğe bağlı)', k.renkLbl)
    .replace('value="Siyah" maxlength="30" placeholder="Siyah"', `value="${k.renkVal}" maxlength="30" placeholder="${k.renkVal}"`)
    .replace('>{ } API JSON çıktısını göster</button>', `>${k.jsonBtn}</button>`)
    .replace('<h2 id="slIndirmeBaslik" class="sl-bolum-baslik">📥 İndir ve kur</h2>', `<h2 id="slIndirmeBaslik" class="sl-bolum-baslik">${k.indirmeBaslik}</h2>`)
    .replace('<p class="sl-kart-alt">Cura 4.13 ve üzeri</p>', `<p class="sl-kart-alt">${k.curaAlt}</p>`)
    .replace('⬇️ Baskı Hesap — Cura paketi', c.curaBtn)
    .replace('<p class="sl-kart-alt">Post-processing script</p>', `<p class="sl-kart-alt">${k.bambuAlt}</p>`)
    .replace('⬇️ en_ucuz_slicer.py', c.pyBtn)
    .replace(/<li><code>\.curapackage<\/code>[\s\S]*?<\/ol>/, `<li>${k.curaAdim1}</li><li>${k.curaAdim2}</li><li>${k.curaAdim3}</li></ol>`)
    .replace(/<li>Dosyayı bilgisayarınıza kaydedin[\s\S]*?<\/ol>/, `<li>${k.bambuAdim1}</li><li>${k.bambuAdim2}</li><li>${k.bambuAdim3}</li></ol>`)
    .replace(/<summary>🐍 Python yok mu\? \(Windows\)<\/summary>[\s\S]*?<\/details>/, `<summary>${k.pySum}</summary><p>${k.pyP1}</p><pre class="sl-kod">python "C:\\BaskiHesap\\en_ucuz_slicer.py"</pre><p class="sl-not">${k.pyP2}</p><pre class="sl-kod">pip install pyinstaller\npyinstaller --onefile --noconsole en_ucuz_slicer.py</pre><p class="sl-not">${k.pyP3}</p></details>`)
    .replace(/<summary>✅ Kurulumu doğrula<\/summary>[\s\S]*?<\/details>/, `<summary>${k.testSum}</summary><p>${k.testP1}</p><pre class="sl-kod">python en_ucuz_slicer.py --test</pre><p class="sl-not">${k.testP2}</p></details>`)
    .replace('<h2 id="slNasilBaslik" class="sl-bolum-baslik">⚙️ Nasıl çalışır?</h2>', `<h2 id="slNasilBaslik" class="sl-bolum-baslik">${k.nasilBaslik}</h2>`)
    .replace(/<b>Dilimleme biter<\/b>[\s\S]*?<span>Slicer gramajı[\s\S]*?<\/span>/, `<b>${k.adim1t}</b>\n          <span>${k.adim1d}</span>`)
    .replace(/<b>Eklenti okur<\/b>[\s\S]*?<span>Yalnızca[\s\S]*?<\/span>/, `<b>${k.adim2t}</b>\n          <span>${k.adim2d}</span>`)
    .replace(/<b>API sorgular<\/b>[\s\S]*?<span>68 mağazadaki[\s\S]*?<\/span>/, `<b>${k.adim3t}</b>\n          <span>${k.adim3d}</span>`)
    .replace(/<b>Bildirim gelir<\/b>[\s\S]*?<span>“Bu baskı[\s\S]*?<\/span>/, `<b>${k.adim4t}</b>\n          <span>${k.adim4d}</span>`)
    .replace('<h2 id="slGuvenBaslik" class="sl-bolum-baslik">🔒 Gizlilik ve dürüstlük</h2>', `<h2 id="slGuvenBaslik" class="sl-bolum-baslik">${k.guvenBaslik}</h2>`)
    .replace(/<ul class="sl-liste">[\s\S]*?<\/ul>/, `<ul class="sl-liste">${k.guvenHtml}</ul>`)
    .replace('<h2 id="slApiBaslik" class="sl-bolum-baslik">🔌 API (kendi entegrasyonunuz için)</h2>', `<h2 id="slApiBaslik" class="sl-bolum-baslik">${k.apiBaslik}</h2>`)
    .replace('<p class="sl-api-not">Herkese açık, CORS destekli, 60 sn önbellekli.</p>', `<p class="sl-api-not">${k.apiNot} <a href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${k.crealityBtn}</a></p>`)
    .replace(/GET \/api\/embed\/oner\?malzeme=PLA[\s\S]*?"bildirimMetni": "[^"]*"/, k.apiOrnek)
    .replace(/<p class="sl-api-not">Parametreler:[\s\S]*?<\/p>/, `<p class="sl-api-not">${k.apiParamHtml}</p>`)
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

function anaSeoRehberKartHtml(kod) {
  const nav = navYollariGetir(kod);
  const k = {
    en: {
      aria: 'Categories and Frequently Asked Questions',
      baslik: '3D Printer &amp; Filament Categories',
      alt: 'Browse tracked 3D printer, filament, resin &amp; part category pages with shipping included:',
      tum: 'Full Catalog →',
      y: '🖨️ 3D Printer Prices',
      pla: '🧵 PLA &amp; PLA+ Filament',
      petg: '🦾 PETG, TPU &amp; ABS Filament',
      yedek: '⚙️ Spare Parts (Nozzle, Hotend, Board)',
      recine: '🧪 UV Resin &amp; Dryers',
      mal: '🧮 3D Print Cost Calculator',
      sep: '🧺 Smart Basket Optimizer',
      reh: '📖 Guides &amp; Versus',
      ucuzPla: '🏷️ Cheapest PLA ($/kg)',
      vs: '⚖️ P1S vs K1C',
      q1: 'Is shipping included in shown prices?',
      a1: 'Yes. For stores with known shipping fees or free-shipping thresholds, delivery costs are automatically factored into the total; stores that calculate shipping only at checkout are clearly marked "+Shipping calculated at checkout".',
      q2: 'How is filament unit price ($/kg) compared?',
      a2: 'Spool weight and resin volume (500 g, 1 kg, 2.5 kg, 1 L) are parsed automatically from listings to rank offers by $/kg and $/L so smaller spools never look artificially cheaper.',
    },
    fr: {
      aria: 'Catégories et Questions Fréquentes',
      baslik: 'Catégories Imprimantes 3D &amp; Filaments',
      alt: 'Parcourez tous nos comparatifs produits et catégories livraison incluse en EUR (€) :',
      tum: 'Catalogue complet →',
      y: '🖨️ Prix Imprimantes 3D',
      pla: '🧵 Filament PLA &amp; PLA+',
      petg: '🦾 Filament PETG, TPU &amp; ABS',
      yedek: '⚙️ Pièces Détachées (Buses, Hotends)',
      recine: '🧪 Résine UV &amp; Séchoirs',
      mal: '🧮 Calculateur de Coût STL',
      sep: '🧺 Panier Intelligent',
      reh: '📖 Guides &amp; Comparatifs',
      ucuzPla: '🏷️ PLA le moins cher (€/kg)',
      vs: '⚖️ P1S vs K1C',
      q1: 'Les frais de livraison sont-ils inclus dans les prix ?',
      a1: 'Oui. Dès que les frais ou seuils de gratuité sont connus, la livraison est intégrée au total ; les boutiques qui calculent le port uniquement au panier affichent clairement « +Frais de port calculés au panier ».',
      q2: 'Comment le prix au kilo (€/kg) est-il calculé ?',
      a2: 'Le poids net ou volume (500 g, 1 kg, 2,5 kg, 1 L) est extrait automatiquement pour classer les offres par €/kg et €/L afin qu’une bobine de 500 g ne paraisse pas faussement moins chère.',
    },
    ja: {
      aria: 'カテゴリーとよくある質問',
      baslik: '3Dプリンター・フィラメント カテゴリー',
      alt: '送料込みの実勢価格を追跡している製品カテゴリー・購入ガイドをご覧ください:',
      tum: '製品カタログ一覧 →',
      y: '🖨️ 3Dプリンター価格',
      pla: '🧵 PLA・PLA+ フィラメント',
      petg: '🦾 PETG・TPU・ABS フィラメント',
      yedek: '⚙️ 交換パーツ（ノズル・ホットエンド）',
      recine: '🧪 UVレジン＆乾燥機',
      mal: '🧮 3Dプリント原価計算',
      sep: '🧺 スマートカート＆送料最適化',
      reh: '📖 比較ガイド＆記事一覧',
      ucuzPla: '🏷️ 最安PLA (¥/kg)',
      vs: '⚖️ P1S vs K1C',
      q1: '表示価格に送料は含まれていますか？',
      a1: 'はい。送料や送料無料ラインが公開されているストアでは送料込みの実質総額を計算して比較し、レジ計算のみ対応のストアには「レジ計算（送料別途）」と明記しています。',
      q2: 'フィラメントのkg単価（¥/kg）はどう比較されますか？',
      a2: '商品名から容量（500g・1kg・2.5kg・1L等）を自動判別し ¥/kg・¥/L 単位で正規化して並び替えるため、少容量スプールが見かけ上安く見えることはありません。',
    },
  }[kod];
  return `<section class="seo-rehber-kart" aria-label="${htmlKacis(k.aria)}">
      <div class="seo-rehber-ust">
        <div>
          <h2 class="bolum-baslik" style="margin:0 0 6px">${k.baslik}</h2>
          <p class="ipucu" style="margin:0">${k.alt}</p>
        </div>
        <a class="seo-tum-link" href="${htmlKacis(nav.katalog)}">${k.tum}</a>
      </div>
      <div class="seo-rehber-baglar">
        <a href="${htmlKacis(kategoriYoluGetir('3d-yazici', kod))}">${k.y}</a>
        <a href="${htmlKacis(kategoriYoluGetir('pla-filament', kod))}">${k.pla}</a>
        <a href="${htmlKacis(kategoriYoluGetir('petg-tpu-filament', kod))}">${k.petg}</a>
        <a href="${htmlKacis(kategoriYoluGetir('3d-yazici-yedek-parca', kod))}">${k.yedek}</a>
        <a href="${htmlKacis(kategoriYoluGetir('recine-ve-sarf', kod))}">${k.recine}</a>
        <a href="${htmlKacis(nav.maliyet)}">${k.mal}</a>
        <a href="${htmlKacis(nav.sepet)}">${k.sep}</a>
        <a href="${htmlKacis(nav.rehber)}">${k.reh}</a>
        <a href="${htmlKacis(nav.rehber)}#guide-pla">${k.ucuzPla}</a>
        <a href="${htmlKacis(nav.rehber)}#vs-p1s-k1c">${k.vs}</a>
      </div>
      <div class="seo-sss">
        <details>
          <summary>${htmlKacis(k.q1)}</summary>
          <p>${htmlKacis(k.a1)}</p>
        </details>
        <details>
          <summary>${htmlKacis(k.q2)}</summary>
          <p>${htmlKacis(k.a2)}</p>
        </details>
      </div>
    </section>`;
}

const ANA_BOLUM_KOPYA = Object.freeze({
  en: {
    vitrinBaslik: 'Live Filament &amp; 3D Printer Deals',
    vitrinAlt: 'Latest in-stock low prices tracked regionally',
    vitrinKatalog: '🗂️ Full Catalog',
    vitrinFirsat: '📢 Deals',
    vitrinYenileAria: 'Refresh deals board',
    vitrinYenileTitle: 'Refresh',
    vitrinKatAria: 'Deal categories',
    vitrinHepsi: 'All',
    vitrinFilament: '🧵 Filament',
    vitrinYazici: '🖨️ 3D Printers',
    vitrinParca: '⚙️ Parts &amp; Resin',
    vitrinBosBaslik: 'No regional deals cached yet.',
    vitrinBosAlt: 'Once regional scanning completes, the lowest in-stock prices appear here.',
    vitrinDipnot: 'Prices come from the latest regional scan',
    sepetBaslik: 'Split your basket — pay less',
    sepetAciklama: 'Paste 2–10 product links. Our engine checks each item across stores, <b>calculates shipping thresholds</b>, and builds three scenarios: single-store convenience, smart split basket, and maximum savings.',
    sepetIpucu: 'Each product is scanned individually: 2 items ≈ 2–4 min, 5 items ≈ 8–10 min. Track progress below or cancel anytime.',
    sepetPh: 'One product link per line\nhttps://www.amazon.com/...\nhttps://us.store.bambulab.com/...',
    sepetBtn: 'Optimize basket',
    sepetHizliTitle: 'Fast mode checks ~30 top stores; disable to scan all stores in this region.',
    sepetHizliEtiket: 'Fast mode (30 sites)',
    sepetSayac: '0/10 items',
    sepetDurumBaslik: 'Calculating basket…',
    sepetSonucBaslik: 'Basket scenarios',
    sepetKuponBaslik: '🎟️ Matching coupons',
    sepetKuponAlt: 'Copy code in one click and paste at checkout',
    sepetPaylasBaslik: '📤 Share basket',
    sepetPaylasAlt: 'Send list via WhatsApp or create a shareable link',
    sepetWaBtn: '💬 Share via WhatsApp',
    sepetLinkBtn: '🔗 Create Share Link',
    sepetKopyaBtn: '📋 Copy Link',
    sepetNot: 'Prices reflect item totals before shipping; each scenario calculates the store free-shipping threshold separately. Coupon discounts appear in the panel above.',
    tarayiciBaslik: 'In-store? Scan the barcode',
    tarayiciAciklama: 'Point your camera at the product barcode (EAN-13/UPC) to check live online prices in seconds. Enter the shelf price to see <b>how much you save</b>.',
    sekmeBarkod: '📷 Scan barcode',
    sekmeGorsel: '🖼️ Search by photo',
    sekmeElle: '⌨️ Enter barcode',
    kameraBaslat: 'Start camera',
    kameraDurdur: 'Stop camera',
    rafEtiket: 'Shelf price ($):',
    rafPh: 'e.g. 24.99',
    kameraNot: 'Camera permission required. Must run over HTTPS or localhost.',
    gorselSecHtml: '<b>Take a photo</b>, drag &amp; drop, or paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>',
    gorselAltIpucu: '3D part, hotend, nozzle, stepper motor, or filament spool (max 4 MB)',
    gorselBirak: '📥 Drop photo here',
    gorselOnizlemeAlt: 'Selected part photo',
    gorselIpucuEtiket: 'Hint (optional):',
    gorselIpucuPh: 'e.g. Bambu P1S hotend 0.4mm, Polymaker PLA black',
    gorselAraBtn: 'Search by photo',
    ellePh: '6938936709664',
    elleAraBtn: 'Search',
    elleIpucu: 'Barcodes are on the back/bottom of the box (usually 12–13 digits). Enter manually if you cannot use the camera.',
    barkodDurum: 'Searching barcode…',
    gorselDurum: 'Analyzing photo…',
    gecmisBaslik: 'Recent searches',
    altNavAria: 'Quick navigation',
    altAra: 'Search &amp; Compare',
    altBorsa: 'Live Deals',
    altBorsaAria: 'Daily lowest prices — live deals board',
    altAlarm: 'Price Alerts',
    altAlarmAria: 'My price alerts — tracked products',
    altTercih: 'Preferences',
    modalKapatAria: 'Close',
    fisRozet: '🧾 3D PRINT QUOTE RECEIPT',
    fisKapatAria: 'Close quote receipt',
    fisBaslik: '3D Print Cost &amp; Quote Summary',
    fisModel: '📦 Model:',
    fisEbat: '📐 Dimensions:',
    fisGramaj: '⚖️ Weight:',
    fisMalzeme: '🧵 Material:',
    fisSure: '⏱️ Est. Time:',
    fisFilament: 'Filament Cost:',
    fisElektrik: 'Electricity Cost:',
    fisAmortisman: 'Printer Depreciation:',
    fisNet: 'Net Production Cost:',
    fisOnerilen: 'RECOMMENDED SELLING PRICE',
    fisKarNot: 'Includes workshop profit margin',
    fisDipnot: '⚡ Price Verification: <b>Baskı Hesap</b> · live multi-store radar',
    fisWa: '📲 Send via WhatsApp',
    fisKopyala: '📋 Copy Receipt',
    fisYazdir: '🖨️ Print / PDF',
    oneriBaslik: 'Recommended models for you',
    oneriDurdur: '⏹️ Stop &amp; Show Found',
    sifirdanTara: '↻ Fresh Rescan',
    dogrulama: '🕒 Just verified live across regional stores',
    nedenUcuz: '💡 Why Is It Cheaper? (AI Analysis)',
    birimBaslik: 'Price per kilogram',
    muadilBaslik: 'Alternative product suggestions',
    muadilBtn: 'Search alternatives',
    trendBaslik: '30-Day Price Trend &amp; Discount Analysis',
    trendAlt: 'Price fluctuations and market analytics',
    trendRozet: '🔥 At Lowest Level',
    trendDusuk: '🟢 30-Day Low',
    trendDusukAlt: 'Market floor',
    trendOrt: '📊 30-Day Average',
    trendYuksek: '🔴 30-Day High',
    trendYuksekAlt: 'Market ceiling',
    trendIndirim: '🎯 Discount Rate',
    trendIndirimAlt: 'Vs. 30-day average',
    filtreEtiket: 'Filter:',
    filtreTumu: 'All',
    filtreStokta: '🟢 In Stock',
    filtreYok: '🔴 Out of Stock',
    filtreKargo: '📦 Free Shipping',
    filtreResmi: '🏢 Official Store',
    filtreTaksit: '💳 0% APR Installments',
    filtreBirim: '🏷️ Lowest $/kg',
    lejant1: '<span class="ok-isaret">✓</span> <b>Real price</b> = list price − universal discounts + shipping',
    lejant2: '<span class="uyari-isaret">⚠</span> <b>Conditional promos</b> (app / card / membership) are excluded',
    lejant3: '<span class="uyari-isaret">🚚</span> Shipping: known rates &amp; free-shipping thresholds are factored in',
    lejant4: '<span class="uyari-isaret">🎨</span> Different colors are excluded from the lowest-price comparison',
    tabloOzet: 'Summary table (store, item, color, stock, total, promos, shipping, requests)',
    thSite: 'Store', thUrun: 'Found Item', thRenk: 'Color', thStok: 'Stock', thToplam: 'Total (incl. shipping)', thKamp: 'Promos', thKargo: 'Shipping', thIstek: 'Req',
    alarmBaslik: 'Set a price alert',
    alarmHedef: 'Target price ($):',
    alarmPh: 'e.g. 25.00',
    alarmBtn: 'Track this product',
    alarmIpucu: 'Configure notification email or Telegram in Alerts.',
    pushBtn: '🔔 Send Alert to This Device',
    stlDoluluk: 'Infill',
    stlMalzeme: 'Material',
    stlEbatKucuk: 'size (mm)',
    stlHacimKucuk: 'volume',
    stlGramKucuk: 'filament',
    stlCta: '⚡ Buy This Filament ➔',
    stlTeklif: '🧾 Generate Print Quote',
    sponsorRozet: '⭐ FEATURED DEAL OF THE WEEK',
    sponsorCta: '⚡ View Deal',
  },
  fr: {
    vitrinBaslik: 'Offres Filaments &amp; Imprimantes 3D en Direct',
    vitrinAlt: 'Derniers prix bas en stock relevés en Europe',
    vitrinKatalog: '🗂️ Catalogue complet',
    vitrinFirsat: '📢 Bons plans',
    vitrinYenileAria: 'Actualiser les offres',
    vitrinYenileTitle: 'Actualiser',
    vitrinKatAria: 'Catégories d’offres',
    vitrinHepsi: 'Tout',
    vitrinFilament: '🧵 Filaments',
    vitrinYazici: '🖨️ Imprimantes 3D',
    vitrinParca: '⚙️ Pièces &amp; Résine',
    vitrinBosBaslik: 'Aucune offre régionale en cache pour l’instant.',
    vitrinBosAlt: 'Les meilleurs prix en stock apparaîtront ici dès la fin de l’analyse régionale.',
    vitrinDipnot: 'Prix issus de la dernière analyse régionale',
    sepetBaslik: 'Divisez votre panier — payez moins',
    sepetAciklama: 'Ajoutez 2 à 10 liens produits. Le moteur compare chaque article, <b>calcule les seuils de port gratuit</b> et propose trois scénarios : boutique unique, panier divisé intelligent et économie maximale.',
    sepetIpucu: 'Chaque article est vérifié séparément : 2 articles ≈ 2–4 min, 5 articles ≈ 8–10 min. Suivez l’avancement ou annulez à tout moment.',
    sepetPh: 'Une URL produit par ligne\nhttps://www.amazon.fr/...\nhttps://eu.store.bambulab.com/...',
    sepetBtn: 'Optimiser le panier',
    sepetHizliTitle: 'Le mode rapide vérifie ~30 boutiques phares ; désactivez pour analyser toute la région.',
    sepetHizliEtiket: 'Mode rapide (30 sites)',
    sepetSayac: '0/10 produits',
    sepetDurumBaslik: 'Calcul du panier…',
    sepetSonucBaslik: 'Scénarios de panier',
    sepetKuponBaslik: '🎟️ Codes promo compatibles',
    sepetKuponAlt: 'Copiez le code en un clic et collez-le au paiement',
    sepetPaylasBaslik: '📤 Partager le panier',
    sepetPaylasAlt: 'Envoyez la liste sur WhatsApp ou créez un lien public',
    sepetWaBtn: '💬 Partager sur WhatsApp',
    sepetLinkBtn: '🔗 Créer un lien de partage',
    sepetKopyaBtn: '📋 Copier le lien',
    sepetNot: 'Prix hors frais de port ; chaque scénario calcule le seuil de livraison gratuite de chaque boutique séparément. Les codes promo sont affichés à part.',
    tarayiciBaslik: 'En magasin ? Scannez le code-barres',
    tarayiciAciklama: 'Visez le code-barres (EAN-13/UPC) avec votre caméra pour voir le prix en ligne en quelques secondes. Indiquez le prix en rayon pour calculer <b>vos économies</b>.',
    sekmeBarkod: '📷 Scanner code-barres',
    sekmeGorsel: '🖼️ Chercher par photo',
    sekmeElle: '⌨️ Saisir le code',
    kameraBaslat: 'Activer la caméra',
    kameraDurdur: 'Arrêter la caméra',
    rafEtiket: 'Prix rayon (€) :',
    rafPh: 'ex. 24,90',
    kameraNot: 'Autorisation caméra requise. Doit fonctionner en HTTPS ou localhost.',
    gorselSecHtml: '<b>Prenez une photo</b>, glissez-déposez ou collez avec <kbd>Ctrl</kbd>+<kbd>V</kbd>',
    gorselAltIpucu: 'Pièce 3D, buse, hotend, moteur pas à pas ou bobine de filament (max 4 Mo)',
    gorselBirak: '📥 Déposez la photo ici',
    gorselOnizlemeAlt: 'Photo sélectionnée',
    gorselIpucuEtiket: 'Indice (facultatif) :',
    gorselIpucuPh: 'ex. Buse Bambulab 0.4mm, Polymaker PLA noir',
    gorselAraBtn: 'Rechercher par photo',
    ellePh: '6938936709664',
    elleAraBtn: 'Rechercher',
    elleIpucu: 'Le code-barres figure au dos/dessous de la boîte (souvent 13 chiffres). Saisissez-le si vous n’utilisez pas la caméra.',
    barkodDurum: 'Recherche du code-barres…',
    gorselDurum: 'Analyse de l’image…',
    gecmisBaslik: 'Recherches récentes',
    altNavAria: 'Navigation rapide',
    altAra: 'Rechercher &amp; Comparer',
    altBorsa: 'Bons plans',
    altBorsaAria: 'Meilleurs prix du jour — offres en direct',
    altAlarm: 'Mes alertes',
    altAlarmAria: 'Mes alertes prix — produits suivis',
    altTercih: 'Préférences',
    modalKapatAria: 'Fermer',
    fisRozet: '🧾 DEVIS D’IMPRESSION 3D',
    fisKapatAria: 'Fermer le devis',
    fisBaslik: 'Résumé Coût &amp; Devis 3D',
    fisModel: '📦 Modèle :',
    fisEbat: '📐 Dimensions :',
    fisGramaj: '⚖️ Masse :',
    fisMalzeme: '🧵 Matériau :',
    fisSure: '⏱️ Durée est. :',
    fisFilament: 'Coût filament :',
    fisElektrik: 'Électricité :',
    fisAmortisman: 'Amortissement :',
    fisNet: 'Coût de revient net :',
    fisOnerilen: 'PRIX DE VENTE RECOMMANDÉ',
    fisKarNot: 'Inclut la marge de l’atelier',
    fisDipnot: '⚡ Vérification : <b>Baskı Hesap</b> · radar boutiques Europe',
    fisWa: '📲 Envoyer sur WhatsApp',
    fisKopyala: '📋 Copier le devis',
    fisYazdir: '🖨️ Imprimer / PDF',
    oneriBaslik: 'Modèles recommandés pour vous',
    oneriDurdur: '⏹️ Arrêter &amp; Afficher',
    sifirdanTara: '↻ Nouvelle analyse',
    dogrulama: '🕒 Vérifié en direct auprès des boutiques européennes',
    nedenUcuz: '💡 Pourquoi est-ce moins cher ? (Analyse IA)',
    birimBaslik: 'Prix au kilogramme',
    muadilBaslik: 'Alternatives en stock',
    muadilBtn: 'Chercher des alternatives',
    trendBaslik: 'Tendance sur 30 jours &amp; Analyse',
    trendAlt: 'Variations de prix et historique du marché',
    trendRozet: '🔥 Au plus bas',
    trendDusuk: '🟢 Plus bas (30j)',
    trendDusukAlt: 'Plancher du marché',
    trendOrt: '📊 Moyenne (30j)',
    trendYuksek: '🔴 Plus haut (30j)',
    trendYuksekAlt: 'Plafond du marché',
    trendIndirim: '🎯 Remise',
    trendIndirimAlt: 'Par rapport à la moyenne',
    filtreEtiket: 'Filtrer :',
    filtreTumu: 'Tout',
    filtreStokta: '🟢 En stock',
    filtreYok: '🔴 Rupture',
    filtreKargo: '📦 Port gratuit',
    filtreResmi: '🏢 Boutique officielle',
    filtreTaksit: '💳 Paiement sans frais',
    filtreBirim: '🏷️ €/kg le moins cher',
    lejant1: '<span class="ok-isaret">✓</span> <b>Prix réel</b> = prix affiché − remises publiques + livraison',
    lejant2: '<span class="uyari-isaret">⚠</span> <b>Offres conditionnelles</b> (appli / carte / membre) exclues',
    lejant3: '<span class="uyari-isaret">🚚</span> Livraison : tarifs connus et seuils de gratuité intégrés au total',
    lejant4: '<span class="uyari-isaret">🎨</span> Les coloris différents sont exclus de la comparaison directe',
    tabloOzet: 'Tableau récapitulatif (boutique, article, couleur, stock, total, promos, livraison, req.)',
    thSite: 'Boutique', thUrun: 'Article trouvé', thRenk: 'Couleur', thStok: 'Stock', thToplam: 'Total (port inclus)', thKamp: 'Promos', thKargo: 'Livraison', thIstek: 'Req',
    alarmBaslik: 'Créer une alerte prix',
    alarmHedef: 'Prix cible (€) :',
    alarmPh: 'ex. 24,00',
    alarmBtn: 'Suivre ce produit',
    alarmIpucu: 'Configurez votre e-mail ou Telegram dans Alertes.',
    pushBtn: '🔔 Recevoir une alerte sur cet appareil',
    stlDoluluk: 'Remplissage',
    stlMalzeme: 'Matériau',
    stlEbatKucuk: 'taille (mm)',
    stlHacimKucuk: 'volume',
    stlGramKucuk: 'filament',
    stlCta: '⚡ Acheter ce filament ➔',
    stlTeklif: '🧾 Générer un devis',
    sponsorRozet: '⭐ OFFRE SPONSORISÉE DE LA SEMAINE',
    sponsorCta: '⚡ Voir l’offre',
  },
  ja: {
    vitrinBaslik: 'ライブ 3Dプリンター・フィラメント特価ボード',
    vitrinAlt: '日本向けストアで追跡中の最安値速報',
    vitrinKatalog: '🗂️ カタログ一覧',
    vitrinFirsat: '📢 特価情報',
    vitrinYenileAria: '特価ボードを更新',
    vitrinYenileTitle: '更新',
    vitrinKatAria: '特価カテゴリ',
    vitrinHepsi: 'すべて',
    vitrinFilament: '🧵 フィラメント',
    vitrinYazici: '🖨️ 3Dプリンター',
    vitrinParca: '⚙️ パーツ・レジン',
    vitrinBosBaslik: 'この地域の特価キャッシュはまだありません。',
    vitrinBosAlt: '地域スキャンが完了すると在庫ありの最安値がここに表示されます。',
    vitrinDipnot: '最新の地域スキャン結果に基づく価格です',
    sepetBaslik: '複数ショップ分割で最安購入',
    sepetAciklama: '2〜10件の商品リンクを入力。各ショップの価格と<b>送料無料ライン</b>を計算し、1店舗まとめ・分割購入・最安プランを比較します。',
    sepetIpucu: '商品ごとにライブ検索します（2件≈2〜4分、5件≈8〜10分）。進行状況は下に表示され、いつでも中断できます。',
    sepetPh: '1行に1つの商品URL\nhttps://www.amazon.co.jp/...\nhttps://jp.store.bambulab.com/...',
    sepetBtn: 'カート最適化',
    sepetHizliTitle: '高速モードは主要ショップを優先スキャンします。オフにすると地域の全店舗を検索します。',
    sepetHizliEtiket: '高速モード (主要店舗)',
    sepetSayac: '0/10 件',
    sepetDurumBaslik: 'カートを計算中…',
    sepetSonucBaslik: 'カート購入プラン',
    sepetKuponBaslik: '🎟️ 利用可能なクーポン',
    sepetKuponAlt: 'ワンクリックでコピーして決済画面で入力',
    sepetPaylasBaslik: '📤 カートを共有',
    sepetPaylasAlt: 'WhatsAppで送信または共有リンクを作成',
    sepetWaBtn: '💬 WhatsAppで共有',
    sepetLinkBtn: '🔗 共有リンクを作成',
    sepetKopyaBtn: '📋 リンクをコピー',
    sepetNot: '価格は送料込み条件計算前の商品合計です。送料無料ラインは各プランで自動計算され、クーポン割引は別枠で表示されます。',
    tarayiciBaslik: '店頭でお買い物中？バーコードをスキャン',
    tarayiciAciklama: 'パッケージのバーコード（JAN/EAN/UPC）をカメラにかざすと数秒でネット最安値を表示。店頭価格を入力すると<b>節約額</b>も計算できます。',
    sekmeBarkod: '📷 バーコードスキャン',
    sekmeGorsel: '🖼️ 写真から検索',
    sekmeElle: '⌨️ コード手入力',
    kameraBaslat: 'カメラを起動',
    kameraDurdur: 'カメラを停止',
    rafEtiket: '店頭価格 (¥):',
    rafPh: '例: 3980',
    kameraNot: 'カメラの許可が必要です。HTTPS または localhost で動作します。',
    gorselSecHtml: '<b>写真を撮影</b>、ドラッグ＆ドロップ、または <kbd>Ctrl</kbd>+<kbd>V</kbd> で貼り付け',
    gorselAltIpucu: '3Dパーツ・ホットエンド・ノズル・ステッピングモーター・スプール等（最大4MB）',
    gorselBirak: '📥 ここに写真をドロップ',
    gorselOnizlemeAlt: '選択した写真',
    gorselIpucuEtiket: 'ヒント (任意):',
    gorselIpucuPh: '例: Bambu P1S ノズル 0.4mm, PLA ブラック',
    gorselAraBtn: '写真から検索',
    ellePh: '6938936709664',
    elleAraBtn: '検索',
    elleIpucu: '箱の裏面・底面の12〜13桁のバーコード番号を入力してください。',
    barkodDurum: 'バーコードを検索中…',
    gorselDurum: '画像を解析中…',
    gecmisBaslik: '最近の検索',
    altNavAria: 'クイックナビ',
    altAra: '検索・比較',
    altBorsa: 'ライブ特価',
    altBorsaAria: '本日の最安値ボード',
    altAlarm: '価格アラート',
    altAlarmAria: '追跡中の価格アラート',
    altTercih: '設定',
    modalKapatAria: '閉じる',
    fisRozet: '🧾 3Dプリントお見積書',
    fisKapatAria: '見積書を閉じる',
    fisBaslik: '3Dプリント原価・お見積り概要',
    fisModel: '📦 モデル:',
    fisEbat: '📐 サイズ:',
    fisGramaj: '⚖️ 重量:',
    fisMalzeme: '🧵 素材:',
    fisSure: '⏱️ 予想時間:',
    fisFilament: 'フィラメント代:',
    fisElektrik: '電気代:',
    fisAmortisman: '機体償却費:',
    fisNet: '製造原価合計:',
    fisOnerilen: '推奨販売価格',
    fisKarNot: '工房マージン込み',
    fisDipnot: '⚡ 価格参照: <b>Baskı Hesap</b> · 日本ストアライブスキャン',
    fisWa: '📲 WhatsAppで送る',
    fisKopyala: '📋 見積書をコピー',
    fisYazdir: '🖨️ 印刷 / PDF',
    oneriBaslik: 'おすすめモデル',
    oneriDurdur: '⏹️ 停止して結果を表示',
    sifirdanTara: '↻ 再スキャン',
    dogrulama: '🕒 地域ストアからライブ確認済み',
    nedenUcuz: '💡 安い理由（AI分析）',
    birimBaslik: '1kgあたりの単価',
    muadilBaslik: '在庫ありの代替モデル',
    muadilBtn: '代替品を探す',
    trendBaslik: '30日間の価格推移・割引分析',
    trendAlt: '価格変動と相場分析',
    trendRozet: '🔥 最安水準',
    trendDusuk: '🟢 30日間最安値',
    trendDusukAlt: '市場最安水準',
    trendOrt: '📊 30日間平均価格',
    trendYuksek: '🔴 30日間最高値',
    trendYuksekAlt: '市場最高水準',
    trendIndirim: '🎯 割引率',
    trendIndirimAlt: '平均比',
    filtreEtiket: '絞り込み:',
    filtreTumu: 'すべて',
    filtreStokta: '🟢 在庫あり',
    filtreYok: '🔴 在庫切れ',
    filtreKargo: '📦 送料無料',
    filtreResmi: '🏢 公式ストア',
    filtreTaksit: '💳 分割払い対応',
    filtreBirim: '🏷️ ¥/kg 最安値順',
    lejant1: '<span class="ok-isaret">✓</span> <b>実質価格</b> = 本体価格 − 一般割引 + 送料',
    lejant2: '<span class="uyari-isaret">⚠</span> <b>条件付き特典</b>（アプリ・カード・会員限定）は含まれません',
    lejant3: '<span class="uyari-isaret">🚚</span> 送料：判明分・送料無料ラインを合計に自動反映',
    lejant4: '<span class="uyari-isaret">🎨</span> 色違い商品は最安比較対象から除外されます',
    tabloOzet: '比較一覧表（ストア・商品名・色・在庫・送料込み合計・キャンペーン・送料・リクエスト）',
    thSite: 'ストア', thUrun: '商品', thRenk: '色', thStok: '在庫', thToplam: '送料込み合計', thKamp: '特典', thKargo: '送料', thIstek: '回数',
    alarmBaslik: '価格アラートを設定',
    alarmHedef: '目標価格 (¥):',
    alarmPh: '例: 3500',
    alarmBtn: 'この商品を追跡',
    alarmIpucu: '通知先メール・Telegramはアラート設定画面で管理できます。',
    pushBtn: '🔔 この端末へ通知',
    stlDoluluk: '充填率',
    stlMalzeme: '素材',
    stlEbatKucuk: 'サイズ (mm)',
    stlHacimKucuk: '体積',
    stlGramKucuk: 'フィラメント',
    stlCta: '⚡ このフィラメントを購入 ➔',
    stlTeklif: '🧾 見積書を作成',
    sponsorRozet: '⭐ 今週の注目プロモーション',
    sponsorCta: '⚡ セールを見る',
  },
});

function anaBolumleriYerellestirHtml(kod, nav, cikti) {
  const b = ANA_BOLUM_KOPYA[kod] || ANA_BOLUM_KOPYA.en;
  const fPara = kod === 'ja' ? '¥0' : (kod === 'fr' ? '0,00 €' : '$0.00');
  const bolgeSayisi = taramaAdaptersByMarket(sozlukGetir(kod).meta.market).length;
  const hizliTitle = kod === 'fr'
    ? `Analyse les ${bolgeSayisi} boutiques vérifiées de la région.`
    : (kod === 'ja'
      ? `この地域の対象 ${bolgeSayisi} ストアを並列検索します。`
      : `Scans ${bolgeSayisi} verified stores in this region.`);
  const hizliEtiket = kod === 'fr'
    ? `Mode rapide (${bolgeSayisi} boutiques)`
    : (kod === 'ja' ? `高速モード (${bolgeSayisi}ストア)` : `Fast mode (${bolgeSayisi} stores)`);
  return cikti
    .replace(
      /<section id="vitrinAlani"[\s\S]*?<\/section>/,
      `<section id="vitrinAlani" class="vitrin" aria-labelledby="vitrinBaslik" hidden>
      <div class="vitrin-ust">
        <div class="vitrin-baslik-grup">
          <h2 id="vitrinBaslik" class="bolum-baslik">
            <span class="vitrin-nabiz" aria-hidden="true"></span>
            ${b.vitrinBaslik}
          </h2>
          <p class="vitrin-alt" id="vitrinGuncelleme">${b.vitrinAlt}</p>
        </div>
        <div class="vitrin-eylemler">
          <a class="vitrin-cip" href="${htmlKacis(nav.katalog)}" style="text-decoration:none">${b.vitrinKatalog}</a>
          <button type="button" class="vitrin-cip" data-firsat-ac>${b.vitrinFirsat}</button>
          <button type="button" class="vitrin-yenile" id="vitrinYenile"
            aria-label="${htmlKacis(b.vitrinYenileAria)}" title="${htmlKacis(b.vitrinYenileTitle)}">↻</button>
        </div>
      </div>
      <div id="vitrinCipleri" class="vitrin-filtre" role="tablist" aria-label="${htmlKacis(b.vitrinKatAria)}" hidden>
        <button type="button" class="vitrin-filtre-cip aktif" data-vitrin-kategori="hepsi" role="tab" aria-selected="true">
          ${b.vitrinHepsi} <span class="vitrin-filtre-sayi" data-sayi="hepsi">0</span>
        </button>
        <button type="button" class="vitrin-filtre-cip" data-vitrin-kategori="filament" role="tab" aria-selected="false">
          ${b.vitrinFilament} <span class="vitrin-filtre-sayi" data-sayi="filament">0</span>
        </button>
        <button type="button" class="vitrin-filtre-cip" data-vitrin-kategori="yazici" role="tab" aria-selected="false">
          ${b.vitrinYazici} <span class="vitrin-filtre-sayi" data-sayi="yazici">0</span>
        </button>
        <button type="button" class="vitrin-filtre-cip" data-vitrin-kategori="genel" role="tab" aria-selected="false">
          ${b.vitrinParca} <span class="vitrin-filtre-sayi" data-sayi="genel">0</span>
        </button>
      </div>
      <div id="vitrinGrid" class="vitrin-grid" aria-busy="false" aria-live="polite"></div>
      <div id="vitrinBos" class="vitrin-bos" hidden>
        <span class="vitrin-bos-ikon" aria-hidden="true">📡</span>
        <div>
          <b>${b.vitrinBosBaslik}</b>
          <div class="vitrin-bos-alt">${b.vitrinBosAlt}</div>
        </div>
      </div>
      <p class="vitrin-dipnot">
        ${b.vitrinDipnot} · <span id="vitrinSayac">—</span>
      </p>
    </section>`,
    )
    .replace(
      /<section class="giris-kart sepet-kart">[\s\S]*?<\/section>/,
      `<section class="giris-kart sepet-kart">
      <h2 class="kart-ana-baslik"><span class="kart-ikon">🛒</span> ${b.sepetBaslik}</h2>
      <p class="aciklama">${b.sepetAciklama}
        <br><span class="ipucu">${b.sepetIpucu}</span></p>
      <div class="sepet-giris">
        <textarea id="sepetUrls" rows="4" autocomplete="off"
          placeholder="${htmlKacis(b.sepetPh)}"></textarea>
        <div class="sepet-butonlar">
          <button type="button" id="sepetBtn">${b.sepetBtn}</button>
          <button type="button" id="sepetIptalBtn" class="iptal-btn" hidden>✕</button>
          <label class="sepet-hizli" title="${htmlKacis(hizliTitle)}">
            <input type="checkbox" id="sepetHizli" checked /> ${hizliEtiket}
          </label>
          <span id="sepetSayac" class="ipucu">${b.sepetSayac}</span>
        </div>
      </div>
      <div id="sepetHata" class="hata-kutusu" hidden></div>
    </section>`,
    )
    .replace(
      /<section id="sepetDurumAlani"[\s\S]*?<\/section>/,
      `<section id="sepetDurumAlani" hidden>
      <div class="durum-baslik-satiri">
        <h2 class="bolum-baslik">${b.sepetDurumBaslik}</h2>
      </div>
      <div id="sepetDurumNotu" class="faz-notu"></div>
      <div id="sepetIlerleme" class="sepet-ilerleme"></div>
    </section>`,
    )
    .replace(
      /<section id="sepetSonuc"[\s\S]*?<\/section>/,
      `<section id="sepetSonuc" hidden>
      <h2 class="bolum-baslik">${b.sepetSonucBaslik}</h2>
      <div id="sepetKazanc" class="sepet-kazanc"></div>
      <div id="sepetSenaryolar" class="sepet-izgara"></div>
      <div id="sepetKuponAlani" class="sepet-kupon-kart" hidden>
        <div class="sepet-kupon-ust">
          <h3 class="sepet-kupon-baslik">${b.sepetKuponBaslik}</h3>
          <span class="sepet-kupon-alt">${b.sepetKuponAlt}</span>
        </div>
        <div id="sepetKuponIcerik"></div>
      </div>
      <div id="sepetPaylasAlani" class="sepet-paylas-kart">
        <div class="sepet-paylas-ust">
          <h3 class="sepet-paylas-baslik">${b.sepetPaylasBaslik}</h3>
          <span class="sepet-paylas-alt">${b.sepetPaylasAlt}</span>
        </div>
        <div class="sepet-paylas-butonlar">
          <button type="button" id="sepetWhatsappBtn" class="paylas-btn wa">${b.sepetWaBtn}</button>
          <button type="button" id="sepetLinkBtn" class="paylas-btn link">${b.sepetLinkBtn}</button>
          <button type="button" id="sepetKopyaBtn" class="paylas-btn kopya" hidden>${b.sepetKopyaBtn}</button>
        </div>
        <div id="sepetPaylasSonuc" class="sepet-paylas-sonuc" aria-live="polite"></div>
      </div>
      <p class="sepet-not">${b.sepetNot}</p>
    </section>`,
    )
    .replace(
      /<section class="giris-kart tarayici-kart">[\s\S]*?<\/section>/,
      `<section class="giris-kart tarayici-kart">
      <h2 class="kart-ana-baslik"><span class="kart-ikon">📱</span> ${b.tarayiciBaslik}</h2>
      <p class="aciklama">${b.tarayiciAciklama}</p>
      <div class="tarayici-sekmeler">
        <button type="button" class="tarayici-sekme aktif" data-tarayici-sekme="barkod">${b.sekmeBarkod}</button>
        <button type="button" class="tarayici-sekme" data-tarayici-sekme="gorsel">${b.sekmeGorsel}</button>
        <button type="button" class="tarayici-sekme" data-tarayici-sekme="elle">${b.sekmeElle}</button>
      </div>
      <div id="barkodKameraAlani" class="tarayici-panel">
        <div id="barkodOkuyucu" class="barkod-okuyucu"></div>
        <div class="tarayici-butonlar">
          <button type="button" id="kameraBaslatBtn">${b.kameraBaslat}</button>
          <button type="button" id="kameraDurdurBtn" class="ikincil" hidden>${b.kameraDurdur}</button>
          <label class="raf-fiyat-alani">
            ${b.rafEtiket}
            <input type="text" id="rafFiyatBarkod" inputmode="decimal" maxlength="14"
              placeholder="${htmlKacis(b.rafPh)}" autocomplete="off" />
          </label>
        </div>
        <div id="barkodKameraNot" class="ipucu">${b.kameraNot}</div>
      </div>
      <div id="gorselPanel" class="tarayici-panel" hidden>
        <div class="gorsel-yukle-alani" id="gorselBirak">
          <input type="file" id="gorselDosya" accept="image/*" capture="environment" hidden />
          <button type="button" id="gorselSecBtn" class="gorsel-sec-btn">
            <span class="gorsel-ikon">📸</span>
            <span>${b.gorselSecHtml}</span>
            <span class="ipucu">${b.gorselAltIpucu}</span>
          </button>
          <div class="gorsel-birak-ipucu" id="gorselBirakIpucu" hidden>${b.gorselBirak}</div>
          <img id="gorselOnizleme" class="gorsel-onizleme"
               src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
               hidden alt="${htmlKacis(b.gorselOnizlemeAlt)}" />
        </div>
        <label class="gorsel-ipucu-alani">
          ${b.gorselIpucuEtiket}
          <input type="text" id="gorselIpucu" placeholder="${htmlKacis(b.gorselIpucuPh)}" maxlength="120" />
        </label>
        <div class="tarayici-butonlar">
          <button type="button" id="gorselAraBtn" disabled>${b.gorselAraBtn}</button>
          <button type="button" id="gorselIptalBtn" class="ikincil" hidden>✕</button>
        </div>
        <div id="gorselNot" class="ipucu"></div>
      </div>
      <div id="ellePanel" class="tarayici-panel" hidden>
        <div class="elle-barkod">
          <input type="text" id="barkodElle" inputmode="numeric" pattern="[0-9]*" maxlength="14"
            placeholder="${htmlKacis(b.ellePh)}" autocomplete="off" />
          <label class="raf-fiyat-alani">
            ${b.rafEtiket}
            <input type="text" id="rafFiyatElle" inputmode="decimal" maxlength="14"
              placeholder="${htmlKacis(b.rafPh)}" autocomplete="off" />
          </label>
          <button type="button" id="barkodAraBtn">${b.elleAraBtn}</button>
        </div>
        <div class="ipucu">${b.elleIpucu}</div>
      </div>
      <div id="tarayiciHata" class="hata-kutusu" hidden></div>
    </section>`,
    )
    .replace('<h2 class="bolum-baslik" id="barkodDurumBaslik">Barkod aranıyor…</h2>', `<h2 class="bolum-baslik" id="barkodDurumBaslik">${b.barkodDurum}</h2>`)
    .replace('<h2 class="bolum-baslik" id="gorselDurumBaslik">Görsel inceleniyor…</h2>', `<h2 class="bolum-baslik" id="gorselDurumBaslik">${b.gorselDurum}</h2>`)
    .replace('<h2 class="bolum-baslik">Son aramalar</h2>', `<h2 class="bolum-baslik">${b.gecmisBaslik}</h2>`)
    .replace(
      /<nav id="altNav"[\s\S]*?<\/nav>/,
      `<nav id="altNav" class="alt-nav" aria-label="${htmlKacis(b.altNavAria)}">
    <button type="button" class="alt-nav-oge aktif" data-nav="karsilastir" aria-current="page">
      <span class="alt-nav-ikon" aria-hidden="true">🔍</span><span>${b.altAra}</span>
    </button>
    <button type="button" class="alt-nav-oge" data-nav="borsa" aria-label="${htmlKacis(b.altBorsaAria)}">
      <span class="alt-nav-ikon" aria-hidden="true">🔥</span><span>${b.altBorsa}</span>
    </button>
    <button type="button" class="alt-nav-oge" data-nav="takipler" aria-label="${htmlKacis(b.altAlarmAria)}">
      <span class="alt-nav-ikon" aria-hidden="true">🔔</span><span>${b.altAlarm}</span>
    </button>
    <a class="alt-nav-oge" data-nav="ayarlar" href="${htmlKacis(nav.ayarlar)}">
      <span class="alt-nav-ikon" aria-hidden="true">⚙️</span><span>${b.altTercih}</span>
    </a>
  </nav>`,
    )
    .replace(
      /<div id="teklifFisModal" class="teklif-modal" hidden>[\s\S]*?<div class="fis-alt-butonlar">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      `<div id="teklifFisModal" class="teklif-modal" hidden>
    <div class="teklif-modal-perde" id="teklifModalKapat"></div>
    <div class="teklif-fis-kutu" role="dialog" aria-modal="true" aria-labelledby="fisBaslik">
      <div class="fis-ust-eylemler">
        <span class="fis-rozet">${b.fisRozet}</span>
        <button type="button" class="fis-kapat-btn" id="fisKapatBtn" aria-label="${htmlKacis(b.fisKapatAria)}">✕</button>
      </div>
      <div class="fis-govde" id="fisYazdirAlani">
        <div class="fis-baslik-satiri">
          <h3 id="fisBaslik" class="fis-baslik">${b.fisBaslik}</h3>
          <span class="fis-tarih" id="fisTarih">—</span>
        </div>
        <div class="fis-model-bilgi">
          <div class="fis-satir"><span>${b.fisModel}</span> <b id="fisModelAd">—</b></div>
          <div class="fis-satir"><span>${b.fisEbat}</span> <b id="fisEbat">—</b></div>
          <div class="fis-satir"><span>${b.fisGramaj}</span> <b id="fisGramaj">—</b></div>
          <div class="fis-satir"><span>${b.fisMalzeme}</span> <b id="fisMalzeme">—</b></div>
          <div class="fis-satir"><span>${b.fisSure}</span> <b id="fisSure">—</b></div>
        </div>
        <div class="fis-cizgi"></div>
        <div class="fis-kalemler">
          <div class="fis-satir"><span>${b.fisFilament}</span> <b id="fisFilamentMaliyet">—</b></div>
          <div class="fis-satir"><span>${b.fisElektrik}</span> <b id="fisElektrikMaliyet">—</b></div>
          <div class="fis-satir"><span>${b.fisAmortisman}</span> <b id="fisYipranmaMaliyet">—</b></div>
          <div class="fis-satir fis-toplam-maliyet"><span>${b.fisNet}</span> <b id="fisNetMaliyet">—</b></div>
        </div>
        <div class="fis-cizgi-cift"></div>
        <div class="fis-fiyat-alani">
          <div class="fis-fiyat-etiket">${b.fisOnerilen}</div>
          <div class="fis-fiyat-tutar" id="fisSatisFiyat">${fPara}</div>
          <div class="fis-fiyat-not" id="fisKarNotu">${b.fisKarNot}</div>
        </div>
        <div class="fis-dipnot">
          <span>${b.fisDipnot}</span>
        </div>
      </div>
      <div class="fis-alt-butonlar">
        <button type="button" class="fis-btn fis-whatsapp" id="fisWhatsappBtn">${b.fisWa}</button>
        <button type="button" class="fis-btn fis-kopyala" id="fisKopyalaBtn">${b.fisKopyala}</button>
        <button type="button" class="fis-btn fis-yazdir" id="fisYazdirBtn">${b.fisYazdir}</button>
      </div>
    </div>
  </div>`,
    )
    .replace('<h2 class="bolum-baslik" id="oneriBaslik">Sana uygun modeller</h2>', `<h2 class="bolum-baslik" id="oneriBaslik">${b.oneriBaslik}</h2>`)
    .replace(/<button type="button" id="oneriDurdurBtn"[^>]*>[\s\S]*?<\/button>/, `<button type="button" id="oneriDurdurBtn" class="oneri-durdur-btn" hidden>${b.oneriDurdur}</button>`)
    .replace('<button type="button" id="sifirdanTaraBtn" class="sifirdan-tara-btn" hidden>↻ Sıfırdan Tara</button>', `<button type="button" id="sifirdanTaraBtn" class="sifirdan-tara-btn" hidden>${b.sifirdanTara}</button>`)
    .replace('<span id="dogrulamaMetin">🕒 Az önce 62 mağazadan canlı doğrulandı</span>', `<span id="dogrulamaMetin">${b.dogrulama}</span>`)
    .replace('<div class="neden-ucuz-baslik">💡 Neden Daha Ucuz? (Yapay Zeka Analizi)</div>', `<div class="neden-ucuz-baslik">${b.nedenUcuz}</div>`)
    .replace('<h3 class="birim-baslik" id="birimBaslik">Kilogram başına fiyat</h3>', `<h3 class="birim-baslik" id="birimBaslik">${b.birimBaslik}</h3>`)
    .replace('<h3 class="muadil-baslik" id="muadilBaslik">Muadil ürün önerileri</h3>', `<h3 class="muadil-baslik" id="muadilBaslik">${b.muadilBaslik}</h3>`)
    .replace('<button type="button" class="ikincil-btn" id="muadilYenileBtn">Muadili ara</button>', `<button type="button" class="ikincil-btn" id="muadilYenileBtn">${b.muadilBtn}</button>`)
    .replace('<h3 class="fiyat-gecmisi-baslik">30 Günlük Fiyat Trendi & İndirim Analizi</h3>', `<h3 class="fiyat-gecmisi-baslik">${b.trendBaslik}</h3>`)
    .replace('<span id="fiyatTrendOzetMetin" class="fiyat-trend-altmetin">Fiyat dalgalanmaları ve piyasa analizi</span>', `<span id="fiyatTrendOzetMetin" class="fiyat-trend-altmetin">${b.trendAlt}</span>`)
    .replace('<div id="fiyatTavsiyeRozeti" class="fiyat-tavsiye-rozet badge-yesil">🔥 En Düşük Seviyede</div>', `<div id="fiyatTavsiyeRozeti" class="fiyat-tavsiye-rozet badge-yesil">${b.trendRozet}</div>`)
    .replace('<div class="istatistik-etiket" id="istatistikEtiketDusuk">🟢 Son 30 Günün En Düşüğü</div>', `<div class="istatistik-etiket" id="istatistikEtiketDusuk">${b.trendDusuk}</div>`)
    .replace('<div class="istatistik-alt">Piyasa dip noktası</div>', `<div class="istatistik-alt">${b.trendDusukAlt}</div>`)
    .replace('<div class="istatistik-etiket" id="istatistikEtiketOrtalama">📊 Son 30 Günün Ortalaması</div>', `<div class="istatistik-etiket" id="istatistikEtiketOrtalama">${b.trendOrt}</div>`)
    .replace('<div class="istatistik-etiket" id="istatistikEtiketYuksek">🔴 Son 30 Günün En Yükseği</div>', `<div class="istatistik-etiket" id="istatistikEtiketYuksek">${b.trendYuksek}</div>`)
    .replace('<div class="istatistik-alt">Piyasa tavanı</div>', `<div class="istatistik-alt">${b.trendYuksekAlt}</div>`)
    .replace('<div class="istatistik-etiket">🎯 İndirim Oranı</div>', `<div class="istatistik-etiket">${b.trendIndirim}</div>`)
    .replace('<div class="istatistik-alt">Ortalamaya göre</div>', `<div class="istatistik-alt">${b.trendIndirimAlt}</div>`)
    .replace('<span class="filtre-etiket">Filtrele:</span>', `<span class="filtre-etiket">${b.filtreEtiket}</span>`)
    .replace('<button type="button" class="filtre-chip aktif" data-filtre="hepsi">Tümü</button>', `<button type="button" class="filtre-chip aktif" data-filtre="hepsi">${b.filtreTumu}</button>`)
    .replace('<button type="button" class="filtre-chip" data-filtre="stokta_var">🟢 Stokta Var</button>', `<button type="button" class="filtre-chip" data-filtre="stokta_var">${b.filtreStokta}</button>`)
    .replace('<button type="button" class="filtre-chip" data-filtre="stokta_yok">🔴 Stokta Yok</button>', `<button type="button" class="filtre-chip" data-filtre="stokta_yok">${b.filtreYok}</button>`)
    .replace('<button type="button" class="filtre-chip" data-filtre="kargo">📦 Kargo Bedava</button>', `<button type="button" class="filtre-chip" data-filtre="kargo">${b.filtreKargo}</button>`)
    .replace('<button type="button" class="filtre-chip" data-filtre="resmi">🏢 Resmi Satıcı</button>', `<button type="button" class="filtre-chip" data-filtre="resmi">${b.filtreResmi}</button>`)
    .replace('<button type="button" class="filtre-chip" data-filtre="taksit">💳 Vade Farksız Taksit</button>', `<button type="button" class="filtre-chip" data-filtre="taksit">${b.filtreTaksit}</button>`)
    .replace('<button type="button" class="filtre-chip birim-sirala-chip" data-filtre="birim_kg">🏷️ ₺/kg En Ucuz</button>', `<button type="button" class="filtre-chip birim-sirala-chip" data-filtre="birim_kg">${b.filtreBirim}</button>`)
    .replace(
      /<div class="sonuc-lejant">[\s\S]*?<\/div>/,
      `<div class="sonuc-lejant">
        <span>${b.lejant1}</span>
        <span>${b.lejant2}</span>
        <span>${b.lejant3}</span>
        <span>${b.lejant4}</span>
      </div>`,
    )
    .replace(
      /<details class="tablo-sarma">[\s\S]*?<\/details>/,
      `<details class="tablo-sarma">
        <summary>${b.tabloOzet}</summary>
        <div class="tablo-kaydir">
          <table id="ozetTablo">
            <thead>
              <tr>
                <th>${b.thSite}</th><th>${b.thUrun}</th><th>${b.thRenk}</th><th>${b.thStok}</th><th>${b.thToplam}</th>
                <th>${b.thKamp}</th><th>${b.thKargo}</th><th>${b.thIstek}</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </details>`,
    )
    .replace(
      /<div class="takip-alani" id="takipAlani">[\s\S]*?<\/div>\s*<\/section>/,
      `<div class="takip-alani" id="takipAlani">
        <h3 class="bolum-baslik">${b.alarmBaslik}</h3>
        <div class="takip-satir">
          <label>${b.alarmHedef} <input type="number" id="hedefFiyat" min="1" step="0.01" placeholder="${htmlKacis(b.alarmPh)}" /></label>
          <button id="takipBtn">${b.alarmBtn}</button>
          <span class="ipucu">${b.alarmIpucu}</span>
        </div>
        <div class="push-satir">
          <button type="button" id="pushBtn" class="push-btn">${b.pushBtn}</button>
          <span id="pushDurum" class="push-durum" aria-live="polite"></span>
        </div>
        <div id="takipMesaj" class="takip-mesaj"></div>
      </div>
    </section>`,
    )
    .replace('<small>ebat (mm)</small>', `<small>${b.stlEbatKucuk}</small>`)
    .replace('<small>hacim</small>', `<small>${b.stlHacimKucuk}</small>`)
    .replace('<small>filament</small>', `<small>${b.stlGramKucuk}</small>`)
    .replace('<label>Doluluk', `<label>${b.stlDoluluk}`)
    .replace('<label>Malzeme', `<label>${b.stlMalzeme}`)
    .replace(/⚡ Bu Filamenti Satın Al ➔/g, b.stlCta)
    .replace(/🧾 Baskı Teklif Fişi Çıkar/g, b.stlTeklif)
    .replace('⭐ HAFTANIN SPONSORLU FIRSATI', b.sponsorRozet)
    .replace('⚡ Kampanyayı İncele', b.sponsorCta)
    .replace('<a class="stl-hizli-detay" id="stlHizliDetay" href="/maliyet.html">', `<a class="stl-hizli-detay" id="stlHizliDetay" href="${htmlKacis(nav.maliyet)}">`)
    .replace('<button type="button" class="alt-modal-kapat" data-modal-kapat aria-label="Kapat">✕</button>', `<button type="button" class="alt-modal-kapat" data-modal-kapat aria-label="${htmlKacis(b.modalKapatAria)}">✕</button>`);
}

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
      ${temaDugmesiHtml(kod)}
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
    .replace('aria-label="Arama modu"', `aria-label="${htmlKacis(kod === 'fr' ? 'Mode de recherche' : (kod === 'ja' ? '検索モード' : 'Search mode'))}"`)
    .replace('✨ Otomatik', c.modOto)
    .replaceAll('🔗 Linkte ara', c.modLink)
    .replaceAll('💬 Ürün adıyla ara', c.modAd)
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
    .replace(/<section class="seo-rehber-kart"[\s\S]*?<\/section>/, anaSeoRehberKartHtml(kod))
    .replace(/<p>\s*Fiyatlar sitelerden anlık okunur;[\s\S]*?<\/p>/, `<p>${htmlKacis(sz.baslik.footerNot)}</p>`)
    .replace(/<p class="afiliye-bildirim" id="afiliyeBildirim" hidden>[\s\S]*?<\/p>/, `<p class="afiliye-bildirim" id="afiliyeBildirim" hidden>${
      kod === 'fr'
        ? '<b>Transparence :</b> Les liens « Voir l’offre » peuvent contenir un paramètre d’affiliation. Cela <b>ne modifie jamais le prix, le classement ni le choix du moins cher</b> et n’entraîne <b>aucun surcoût</b>.'
        : (kod === 'ja'
          ? '<b>透明性ポリシー:</b> 「ショップへ」リンクにはアフィリエイト紹介パラメータが含まれる場合がありますが、<b>価格・順位・最安判定には一切影響せず</b>、購入者への<b>追加費用もありません</b>。'
          : '<b>Transparency:</b> Outbound store links may contain affiliate referral parameters. This <b>never changes prices, rankings, or lowest-price selection</b> and adds <b>zero extra cost</b> to you.')
    }</p>`)
    .replace('Karşılaştırılan siteler (<span id="footerSiteSayisi">—</span>):', `${c.magazaListeBaslik} (<span id="footerSiteSayisi">${taramaMagazalari.length}</span>):`)
    .replace('<a class="footer-marka-alan" href="/" rel="home">baskihesap.tech</a>', `<a class="footer-marka-alan" href="${htmlKacis(GLOBAL_ANA_YOLLARI[kod])}" rel="home">baskihesap.tech</a>`)
    .replace(/<nav class="footer-hub"[\s\S]*?<\/nav>/, footerHubHtml(kod))
    .replace('<span id="genelToastMetin" class="mikro-toast-metin">Bağlantı kopyalandı!</span>', `<span id="genelToastMetin" class="mikro-toast-metin">${kod === 'fr' ? 'Lien copié !' : (kod === 'ja' ? 'リンクをコピーしました！' : 'Link copied!')}</span>`)
    .replace('<ul id="footerSiteler" class="footer-siteler"></ul>', `<ul id="footerSiteler" class="footer-siteler">${bolgeMagazalari.map(m => `<li>${htmlKacis(m.name)}</li>`).join('')}</ul>`);

  cikti = anaBolumleriYerellestirHtml(kod, nav, cikti);

  // 5) Gerçek app.js ortam nesnesi + dinamik UI çevirmeni
  cikti = cikti.replace(
    '<script src="/app.js"></script>',
    `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/i18n-global.js"></script>\n  <script src="/app.js"></script>`,
  );

  cikti = nitelikAriaYerellestir(cikti, kod);

  return cikti;
}

export function globalAyarlarSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const taramaMagazalari = taramaAdaptersByMarket(sz.meta.market);
  const c = {
    en: {
      title: 'Price Alerts &amp; Preferences — Baski Hesap',
      h1a: '📈 Tracked Products &amp; Price Alerts',
      p1: 'Tracked product prices are re-checked automatically throughout the day; you receive an instant browser notification whenever a price drops below your target or the cheapest store changes. You can update target prices anytime.',
      yukleniyor: 'Loading…',
      h1b: '🔔 Notifications &amp; Display Preferences',
      p2: 'No sign-up or email required: receive instant price-drop alerts via browser Web Push on this device and switch between light or dark themes.',
      durumBekle: 'Checking browser notification status…',
      aboneBtn: '🔔 Enable Notifications',
      testBtn: '🧪 Send Test Notification',
      temaBtn: '🌓 Toggle Theme',
      footerSitelerBaslik: 'Stores compared in this region',
    },
    fr: {
      title: 'Alertes Prix &amp; Préférences — Baski Hesap',
      h1a: '📈 Produits suivis &amp; Alertes prix',
      p1: 'Les prix des produits suivis sont vérifiés régulièrement ; vous recevez une alerte navigateur instantanée dès que le tarif passe sous votre prix cible ou qu’une boutique moins chère apparaît. Modifiez votre prix cible à tout moment.',
      yukleniyor: 'Chargement…',
      h1b: '🔔 Notifications &amp; Apparence',
      p2: 'Aucun compte ni e-mail requis : activez les alertes Web Push directement sur cet appareil et choisissez le thème clair ou sombre.',
      durumBekle: 'Vérification de l’état des notifications…',
      aboneBtn: '🔔 Activer les notifications',
      testBtn: '🧪 Envoyer une notification test',
      temaBtn: '🌓 Changer de thème',
      footerSitelerBaslik: 'Boutiques comparées dans cette région',
    },
    ja: {
      title: '価格アラート &amp; 設定 — Baski Hesap',
      h1a: '📈 追跡中の商品 &amp; 価格アラート',
      p1: '追跡設定した商品の価格は日中に定期チェックされ、目標価格を下回った際や最安ショップが入れ替わった際にブラウザへ即時通知されます。目標価格はいつでも更新できます。',
      yukleniyor: '読み込み中…',
      h1b: '🔔 通知 &amp; 表示設定',
      p2: '会員登録やメールアドレスは不要です。この端末のブラウザ通知（Web Push）で値下げを受け取り、ライト／ダークテーマを切り替えられます。',
      durumBekle: 'ブラウザ通知の状態を確認中…',
      aboneBtn: '🔔 通知を有効にする',
      testBtn: '🧪 テスト通知を送信',
      temaBtn: '🌓 テーマを切り替え',
      footerSitelerBaslik: 'この地域の比較対象ストア',
    },
  }[kod];

  const ortam = {
    dil: kod,
    market: sz.meta.market,
    currency: sz.para.kod,
    yerel: sz.para.yerel,
    tabanYol: nav.ana,
  };

  let cikti = ortakKlonSayfaHazirla(ayarlarSablonOku(), {
    kod, tabanUrl, yolHaritasi: AYARLAR_YOL_HARITASI, aktifNav: 'ayarlar',
    title: c.title, desc: sz.meta.anaDesc, ogTitle: c.title, ogDesc: sz.meta.anaDesc,
  });

  cikti = cikti
    .replace('<h2>📈 Takip edilen ürünler &amp; fiyat alarmlarım</h2>', `<h2>${c.h1a}</h2>`)
    .replace(/Takibe aldığınız ürünlerin fiyatları gün içinde düzenli kontrol edilir;[\s\S]*?<\/p>/, `${c.p1}</p>`)
    .replace('<div id="takipListesi"><p class="alt-not">Yükleniyor…</p></div>', `<div id="takipListesi"><p class="alt-not">${c.yukleniyor}</p></div>`)
    .replace('<h2>🔔 Bildirimler &amp; görünüm tercihleri</h2>', `<h2>${c.h1b}</h2>`)
    .replace(/Üyelik veya e-posta gerekmez:[\s\S]*?<\/p>/, `${c.p2}</p>`)
    .replace('<div class="gorev-durumu" id="pushDurumKutusu">Tarayıcı bildirim durumu kontrol ediliyor…</div>', `<div class="gorev-durumu" id="pushDurumKutusu">${c.durumBekle}</div>`)
    .replace('<button type="button" class="kaydet-btn" id="pushAboneBtn">🔔 Bildirimleri Etkinleştir</button>', `<button type="button" class="kaydet-btn" id="pushAboneBtn">${c.aboneBtn}</button>`)
    .replace('<button type="button" class="kaydet-btn ikincil" id="pushTestBtn">🧪 Örnek Bildirim Gönder</button>', `<button type="button" class="kaydet-btn ikincil" id="pushTestBtn">${c.testBtn}</button>`)
    .replace('<button type="button" class="ikincil-btn" id="temaTercihBtn">🌓 Temayı Değiştir</button>', `<button type="button" class="ikincil-btn" id="temaTercihBtn">${c.temaBtn}</button>`)
    .replace(/<p>\s*Fiyatlar sitelerden anlık okunur;[\s\S]*?<\/p>/, `<p>${htmlKacis(sz.baslik.footerNot)}</p>`)
    .replace('Karşılaştırılan siteler (<span id="footerSiteSayisi">—</span>):', `${htmlKacis(c.footerSitelerBaslik)} (<span id="footerSiteSayisi">${taramaMagazalari.length}</span>):`)
    .replace(
      '<script src="/ayarlar.js"></script>',
      `<script>window.BASKI_HESAP_ORTAM = ${JSON.stringify(ortam)};</script>\n  <script src="/para.js"></script>\n  <script src="/ayarlar.js"></script>`,
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
  for (const [dil, rYol] of Object.entries(GLOBAL_AYARLAR_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'ayarlar', olustur: (tabanUrl) => globalAyarlarSayfasiHtml(dil, tabanUrl) };
  }
  return null;
}

/** Çok dilli alternatif haritası (TR + EN + FR + JA + x-default). */
export function globalAracAlternatifHaritasi() {
  const ana = { ...ANA_YOL_HARITASI, 'x-default': '/' };
  const maliyet = { ...MALIYET_YOL_HARITASI, 'x-default': GLOBAL_MALIYET_YOLLARI.en };
  const sepet = { ...SEPET_YOL_HARITASI, 'x-default': GLOBAL_SEPET_YOLLARI.en };
  const slicer = { ...SLICER_YOL_HARITASI, 'x-default': GLOBAL_SLICER_YOLLARI.en };
  const ayarlar = { ...AYARLAR_YOL_HARITASI, 'x-default': GLOBAL_AYARLAR_YOLLARI.en };
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
    '/ayarlar.html': ayarlar,
    '/en/alerts': ayarlar,
    '/fr/alertes': ayarlar,
    '/ja/alerts': ayarlar,
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

/** Bölgesel (EN / FR / JA) kategori sayfaları için sitemap kayıtlarını üretir. */
export function globalKategoriSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const hepsi = [];
  for (const kat of SEO_KATEGORILER) {
    const alternates = {
      tr: kategoriYoluGetir(kat.slug, 'tr'),
      en: kategoriYoluGetir(kat.slug, 'en'),
      fr: kategoriYoluGetir(kat.slug, 'fr'),
      ja: kategoriYoluGetir(kat.slug, 'ja'),
      'x-default': kategoriYoluGetir(kat.slug, 'en'),
    };
    for (const d of ['en', 'fr', 'ja']) {
      hepsi.push({ dil: d, yol: alternates[d], oncelik: '0.85', siklik: 'daily', lastmod: bugun, alternates });
    }
  }
  if (!dil) return hepsi;
  const hedef = normalizeDil(dil);
  return hepsi.filter(x => x.dil === hedef);
}
