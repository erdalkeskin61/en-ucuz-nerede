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
import { htmlKacis, sayfaIskeleti } from './seoSayfalar.js';
import { normalizeDil, sozlukGetir } from './i18n/index.js';
import { afiliyeLink, afiliyeAyarlari } from './afiliye.js';

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

export function globalMaliyetSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = MALIYET_KOPYA[kod];
  const sz = sozlukGetir(kod);
  const yol = GLOBAL_MALIYET_YOLLARI[kod];
  const canonicalUrl = `${tabanUrl}${yol}`;
  const cr = crealityAracLinki(kod, 'PLA Filament');
  const crBase = (CREALITY_MAGAZA_KOK[kod] || CREALITY_MAGAZA_KOK.en).base;

  const altStilVeHreflang = [
    hreflangEtiketleri(tabanUrl, MALIYET_YOL_HARITASI),
    '<link rel="stylesheet" href="/maliyet.css" />',
    '<script src="/para.js"></script>',
  ].join('\n  ');

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: c.title.replace(/&amp;/g, '&'),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: kod,
      url: canonicalUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: c.varsayilanPara },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url: canonicalUrl,
      mainEntity: c.sss.map(s => ({
        '@type': 'Question',
        name: s.soru,
        acceptedAnswer: { '@type': 'Answer', text: s.cevap },
      })),
    },
  ];

  const govdeHtml = `
    ${dilSeciciCubugu(kod, MALIYET_YOL_HARITASI)}
    <section class="hero maliyet-hero" style="margin-bottom:20px">
      <div class="hero-ic">
        <span class="hero-rozet">${c.rozet}</span>
        <h1>${c.h1}</h1>
        <p>${c.alt}</p>
      </div>
    </section>

    <section class="stl-kart" aria-labelledby="gStlBaslik">
      <div class="stl-ust">
        <h2 id="gStlBaslik" class="stl-baslik">${c.stlBaslik}</h2>
        <span class="stl-gizlilik">${c.stlGizlilik}</span>
      </div>
      <div id="gStlBirak" class="stl-birak" role="button" tabindex="0">
        <input type="file" id="gStlDosya" accept=".stl,.3mf,model/stl,model/3mf" hidden />
        <span class="stl-birak-ikon" aria-hidden="true">📥</span>
        <span class="stl-birak-metin">
          <b>${c.stlBirakAna}</b>
          <span class="stl-birak-alt">${c.stlBirakAlt}</span>
        </span>
      </div>
      <p class="stl-durum" id="gStlDurum" role="status" aria-live="polite"></p>
      <div class="stl-sonuc" id="gStlSonuc" hidden>
        <div class="stl-sonuc-ust">
          <span class="stl-dosya-ad" id="gStlDosyaAd">—</span>
          <button type="button" class="stl-temizle" id="gStlTemizle">✕</button>
        </div>
        <div class="stl-metrikler">
          <div class="stl-metrik"><span class="stl-metrik-ad">📏 ${c.boyut}</span><strong id="gStlBoyut">—</strong><span class="stl-metrik-alt">mm</span></div>
          <div class="stl-metrik"><span class="stl-metrik-ad">🧊 ${c.hacim}</span><strong id="gStlHacim">—</strong><span class="stl-metrik-alt">cm³</span></div>
          <div class="stl-metrik stl-metrik-vurgu"><span class="stl-metrik-ad">⚖️ ${c.agirlik}</span><strong id="gStlGram">—</strong><span class="stl-metrik-alt" id="gStlGramAlt">20%</span></div>
        </div>
        <div class="stl-kontroller">
          <div class="stl-kontrol">
            <label for="gStlDoluluk">${c.dolulukLabel}</label>
            <select id="gStlDoluluk">
              <option value="10">10%</option>
              <option value="20" selected>20%</option>
              <option value="40">40%</option>
              <option value="100">100%</option>
            </select>
          </div>
          <div class="stl-kontrol">
            <label for="gStlMalzeme">${c.malzemeLabel}</label>
            <select id="gStlMalzeme">
              <option value="PLA">PLA (1.24 g/cm³)</option>
              <option value="PETG">PETG (1.27 g/cm³)</option>
              <option value="ABS">ABS (1.04 g/cm³)</option>
              <option value="TPU">TPU (1.21 g/cm³)</option>
              <option value="ASA">ASA (1.07 g/cm³)</option>
            </select>
          </div>
          <div class="stl-kontrol stl-kontrol-slider">
            <label for="gStlSlider">${c.inceAyar} <b id="gStlDolulukEtiket">20%</b></label>
            <input type="range" id="gStlSlider" min="5" max="100" step="5" value="20" />
          </div>
        </div>
        <button type="button" class="stl-gramaj-aktar" id="gStlAktar">${c.aktarBtn}</button>
      </div>
    </section>

    <div class="mz-duzen">
      <section class="giris-kart mz-girdi">
        <h2 class="mz-baslik">${c.girdiBaslik}</h2>
        <div class="mz-alan">
          <div class="mz-alan-ust"><label for="gGram">${c.gramajLabel}</label></div>
          <div class="mz-sayı-slider">
            <input type="range" id="gGramSlider" min="1" max="1000" step="1" value="160" />
            <input type="number" id="gGram" min="1" max="100000" step="1" value="160" />
          </div>
        </div>
        <div class="mz-alan">
          <div class="mz-alan-ust"><label for="gSure">${c.sureLabel}</label></div>
          <div class="mz-sayı-slider">
            <input type="range" id="gSureSlider" min="0.5" max="72" step="0.5" value="4" />
            <input type="number" id="gSure" min="0.1" max="720" step="0.1" value="4" />
          </div>
        </div>
        <div class="mz-satir">
          <div class="mz-kucuk-alan">
            <label for="gGuc">${c.gucLabel}</label>
            <input type="number" id="gGuc" min="10" max="3000" step="5" value="150" />
          </div>
          <div class="mz-kucuk-alan">
            <label for="gFilamentKg">${c.filamentFiyatLabel}</label>
            <input type="number" id="gFilamentKg" min="0.1" max="100000" step="0.1" value="${c.varsayilanFilamentKg}" />
          </div>
        </div>
        <div class="mz-satir" style="margin-top:10px">
          <div class="mz-kucuk-alan">
            <label for="gElektrikKwh">${c.elektrikLabel}</label>
            <input type="number" id="gElektrikKwh" min="0" max="1000" step="0.01" value="${c.varsayilanElektrikKwh}" />
          </div>
          <div class="mz-kucuk-alan">
            <label for="gYipranma">${c.yipranmaLabel}</label>
            <input type="number" id="gYipranma" min="0" max="10000" step="0.05" value="${c.varsayilanYipranma}" />
          </div>
        </div>
        <div class="mz-satir" style="margin-top:10px">
          <div class="mz-kucuk-alan">
            <label for="gFire">${c.fireLabel}</label>
            <input type="number" id="gFire" min="0" max="100" step="1" value="10" />
          </div>
          <div class="mz-kucuk-alan">
            <label for="gParaSecim">Currency</label>
            <select id="gParaSecim">
              <option value="USD"${c.varsayilanPara === 'USD' ? ' selected' : ''}>USD ($)</option>
              <option value="EUR"${c.varsayilanPara === 'EUR' ? ' selected' : ''}>EUR (€)</option>
              <option value="JPY"${c.varsayilanPara === 'JPY' ? ' selected' : ''}>JPY (¥)</option>
              <option value="TRY">TRY (₺)</option>
            </select>
          </div>
        </div>
      </section>

      <section class="seo-kart" style="margin-bottom:0">
        <h2 style="margin-top:0">${c.ciktiBaslik}</h2>
        <div class="seo-piyasa-izgara">
          <div class="seo-piyasa-kutu"><div class="seo-piyasa-etiket">${c.hammadde}</div><div class="seo-piyasa-deger" id="gOutMat">—</div></div>
          <div class="seo-piyasa-kutu"><div class="seo-piyasa-etiket">${c.elektrik}</div><div class="seo-piyasa-deger" id="gOutElec">—</div></div>
          <div class="seo-piyasa-kutu"><div class="seo-piyasa-etiket">${c.amortisman}</div><div class="seo-piyasa-deger" id="gOutWear">—</div></div>
        </div>
        <div class="seo-fiyat-kutu">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--gri-metin)">${htmlKacis(c.netMaliyet.toUpperCase())}</div>
            <div class="seo-fiyat-ana" id="gOutNet">—</div>
          </div>
        </div>
        <h3 style="font-size:15px;margin:14px 0 8px">${c.satisBaslik}</h3>
        <div class="seo-piyasa-izgara" id="gOutSatis"></div>
      </section>
    </div>

    <section class="seo-kart" style="margin-top:20px">
      <h2 style="margin-top:0">${c.magazaBaslik}</h2>
      <p class="seo-piyasa-metin">${c.magazaMetin}</p>
      <div class="seo-butonlar">
        <a id="gCrealityFilBtn" class="seo-cta" href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${c.magazaButonFilament}</a>
        <a class="seo-cta ikincil" href="${htmlKacis(cr.k3Url)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${c.magazaButonK3}</a>
        <a class="seo-cta ikincil" href="${htmlKacis(GLOBAL_SLICER_YOLLARI[kod])}">${c.slicerPromoBtn}</a>
      </div>
    </section>

    <section class="seo-kart">
      <h2 style="margin-top:0">❓ FAQ</h2>
      <div class="seo-sss">
        ${c.sss.map((s, idx) => `<details${idx === 0 ? ' open' : ''}><summary>${htmlKacis(s.soru)}</summary><p>${htmlKacis(s.cevap)}</p></details>`).join('')}
      </div>
    </section>

    <script type="module">
      import { parseModel, hesaplaGramaj } from '/stlParser.js';
      const $ = (id) => document.getElementById(id);
      const crealitySearchBase = ${JSON.stringify(crBase + '/search?q=')};
      const crealityStoreSite = ${JSON.stringify(cr.siteId)};
      const crealitySjlWrap = ${JSON.stringify(cr.afiliyeAktif ? cr.storeUrl.split('u=')[0] + 'u=' : '')};
      let sonModel = null;

      function fmt(n) {
        const kod = $('gParaSecim')?.value || ${JSON.stringify(c.varsayilanPara)};
        return typeof window.formatPara === 'function' ? window.formatPara(n, kod) : (Number(n || 0).toFixed(2) + ' ' + kod);
      }

      function guncelleCrealityLink(malzeme) {
        const btn = $('gCrealityFilBtn');
        if (!btn) return;
        const hedef = crealitySearchBase + encodeURIComponent((malzeme || 'PLA') + ' Filament');
        btn.href = crealitySjlWrap ? (crealitySjlWrap + encodeURIComponent(hedef)) : hedef;
        btn.setAttribute('data-afiliye-site', crealityStoreSite);
      }

      function hesapla() {
        const g = Math.max(0.1, Number($('gGram').value) || 0);
        const h = Math.max(0.05, Number($('gSure').value) || 0);
        const w = Math.max(1, Number($('gGuc').value) || 150);
        const kg = Math.max(0, Number($('gFilamentKg').value) || 0);
        const kwhFiyat = Math.max(0, Number($('gElektrikKwh').value) || 0);
        const yip = Math.max(0, Number($('gYipranma').value) || 0);
        const fire = Math.max(0, Number($('gFire').value) || 0) / 100;

        const mat = (g / 1000) * kg * (1 + fire);
        const elec = (w / 1000) * h * kwhFiyat;
        const wear = h * yip;
        const net = mat + elec + wear;

        $('gOutMat').textContent = fmt(mat);
        $('gOutElec').textContent = fmt(elec);
        $('gOutWear').textContent = fmt(wear);
        $('gOutNet').textContent = fmt(net);
        $('gOutSatis').innerHTML = [1.5, 2, 3, 4].map((x) => {
          const fiyat = net * x;
          return '<div class="seo-piyasa-kutu"><div class="seo-piyasa-etiket">' + x + 'x</div><div class="seo-piyasa-deger">' + fmt(fiyat) + '</div></div>';
        }).join('');
      }

      function guncelleStl() {
        if (!sonModel) return;
        const doluluk = Number($('gStlSlider').value) || 20;
        const malzeme = $('gStlMalzeme').value || 'PLA';
        $('gStlDolulukEtiket').textContent = doluluk + '%';
        $('gStlGramAlt').textContent = doluluk + '% · ' + malzeme;
        const gram = hesaplaGramaj(sonModel.hacimCm3, { doluluk, malzeme });
        $('gStlGram').textContent = gram.toFixed(1) + ' g';
        guncelleCrealityLink(malzeme);
      }

      async function dosyaIsle(file) {
        if (!file) return;
        $('gStlDurum').textContent = '...';
        try {
          const buf = await file.arrayBuffer();
          const m = await parseModel(buf, { ad: file.name });
          sonModel = m;
          $('gStlDosyaAd').textContent = file.name;
          $('gStlBoyut').textContent = m.boyutlar.genislik.toFixed(1) + ' × ' + m.boyutlar.derinlik.toFixed(1) + ' × ' + m.boyutlar.yukseklik.toFixed(1);
          $('gStlHacim').textContent = m.hacimCm3.toFixed(2);
          $('gStlSonuc').hidden = false;
          $('gStlDurum').textContent = '';
          guncelleStl();
          const gram = Math.max(1, Math.round(hesaplaGramaj(m.hacimCm3, { doluluk: Number($('gStlSlider').value) || 20, malzeme: $('gStlMalzeme').value || 'PLA' })));
          $('gGram').value = gram;
          $('gGramSlider').value = Math.min(1000, gram);
          hesapla();
        } catch (err) {
          $('gStlDurum').textContent = err?.message || 'Parse error';
        }
      }

      const drop = $('gStlBirak'), inp = $('gStlDosya');
      drop?.addEventListener('click', () => inp?.click());
      drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('surukle'); });
      drop?.addEventListener('dragleave', () => drop.classList.remove('surukle'));
      drop?.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('surukle'); dosyaIsle(e.dataTransfer?.files?.[0]); });
      inp?.addEventListener('change', () => dosyaIsle(inp.files?.[0]));
      $('gStlTemizle')?.addEventListener('click', () => { sonModel = null; $('gStlSonuc').hidden = true; });
      $('gStlDoluluk')?.addEventListener('change', () => { $('gStlSlider').value = $('gStlDoluluk').value; guncelleStl(); });
      $('gStlSlider')?.addEventListener('input', guncelleStl);
      $('gStlMalzeme')?.addEventListener('change', guncelleStl);
      $('gStlAktar')?.addEventListener('click', () => {
        if (!sonModel) return;
        const g = Math.max(1, Math.round(hesaplaGramaj(sonModel.hacimCm3, { doluluk: Number($('gStlSlider').value) || 20, malzeme: $('gStlMalzeme').value || 'PLA' })));
        $('gGram').value = g;
        $('gGramSlider').value = Math.min(1000, g);
        hesapla();
      });

      $('gGramSlider')?.addEventListener('input', () => { $('gGram').value = $('gGramSlider').value; hesapla(); });
      $('gSureSlider')?.addEventListener('input', () => { $('gSure').value = $('gSureSlider').value; hesapla(); });
      ['gGram', 'gSure', 'gGuc', 'gFilamentKg', 'gElektrikKwh', 'gYipranma', 'gFire', 'gParaSecim'].forEach((id) => {
        $(id)?.addEventListener('input', hesapla);
        $(id)?.addEventListener('change', hesapla);
      });
      hesapla();
    </script>
  `;

  return sayfaIskeleti({
    title: c.title,
    description: c.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    extraMeta: altStilVeHreflang,
    jsonLdList,
    govdeHtml,
    aktifNav: 'maliyet',
    dil: kod,
    dilYolHaritasi: MALIYET_YOL_HARITASI,
  });
}

export function globalSlicerSayfasiHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = SLICER_KOPYA[kod];
  const canonicalUrl = `${tabanUrl}${GLOBAL_SLICER_YOLLARI[kod]}`;
  const cr = crealityAracLinki(kod, '3D Printer');

  const extraMeta = [
    hreflangEtiketleri(tabanUrl, SLICER_YOL_HARITASI),
    '<link rel="stylesheet" href="/slicer.css" />',
  ].join('\n  ');

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Baski Hesap UltiMaker Cura & Slicer Plugin',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, macOS, Linux',
      inLanguage: kod,
      url: canonicalUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: sozlukGetir(kod).para.kod },
    },
  ];

  const govdeHtml = `
    ${dilSeciciCubugu(kod, SLICER_YOL_HARITASI)}
    <section class="hero sl-hero" style="margin-bottom:20px">
      <div class="hero-ic">
        <span class="hero-rozet">${c.rozet}</span>
        <h1>${c.h1}</h1>
        <p>${c.alt}</p>
      </div>
    </section>

    <section class="sl-canli" style="margin-bottom:20px">
      <div class="sl-drop" id="gSlDrop" tabindex="0" role="button">
        <input type="file" id="gSlGcode" accept=".gcode,.gco,.g,.txt" hidden />
        <span class="sl-drop-ikon" aria-hidden="true">📂</span>
        <div class="sl-drop-metin">
          <b>${c.dropBaslik}</b>
          <span>${c.dropAlt}</span>
        </div>
      </div>
      <div class="sl-gcode-ozet" id="gSlOzet" hidden></div>
    </section>

    <section class="seo-kart">
      <h2 style="margin-top:0">${c.indirBaslik}</h2>
      <div class="seo-butonlar" style="margin-bottom:14px">
        <a class="seo-cta" href="/indir/BaskiHesap.curapackage" download>${c.curaBtn}</a>
        <a class="seo-cta ikincil" href="/indir/en_ucuz_slicer.py" download>${c.pyBtn}</a>
      </div>
      <ol style="margin:0 0 16px;padding-left:20px;line-height:1.7">
        ${c.adimlar.map(a => `<li>${a}</li>`).join('')}
      </ol>
      <div class="seo-butonlar">
        <a class="seo-cta ikincil" href="${htmlKacis(GLOBAL_MALIYET_YOLLARI[kod])}">${c.maliyetBtn}</a>
        <a class="seo-cta ikincil" href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">${c.magazaBtn}</a>
      </div>
    </section>

    <script>
      (function () {
        var drop = document.getElementById('gSlDrop');
        var inp = document.getElementById('gSlGcode');
        var ozet = document.getElementById('gSlOzet');
        if (!drop || !inp || !ozet) return;
        function oku(file) {
          if (!file) return;
          file.slice(0, 262144).text().then(function (txt) {
            var g = (txt.match(/;\\s*filament used \\[g\\]\\s*=\\s*([\\d.,]+)/i) || [])[1] || '—';
            var mat = (txt.match(/;\\s*filament_type\\s*=\\s*([^\\r\\n]+)/i) || [])[1] || 'PLA';
            var sure = (txt.match(/;\\s*(?:estimated printing time[^=]*|TIME:)\\s*=?:?\\s*([^\\r\\n]+)/i) || [])[1] || '—';
            ozet.hidden = false;
            ozet.innerHTML = '<b>' + file.name + '</b> · ' + mat + ' · <b>' + g + ' g</b> · ' + sure;
          }).catch(function () {});
        }
        drop.addEventListener('click', function () { inp.click(); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); oku(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
        inp.addEventListener('change', function () { oku(inp.files && inp.files[0]); });
      })();
    </script>
  `;

  return sayfaIskeleti({
    title: c.title,
    description: c.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    extraMeta,
    jsonLdList,
    govdeHtml,
    aktifNav: 'eklenti',
    dil: kod,
    dilYolHaritasi: SLICER_YOL_HARITASI,
  });
}

const ANA_KOPYA = Object.freeze({
  en: {
    market: 'us',
    currency: 'USD',
    title: 'Baski Hesap Global — 3D Printer Price Search, STL Cost Calculator &amp; Cura Plugin',
    desc: 'Search live Creality Official Store (USD) prices, calculate STL/3MF print costs privately in your browser, and download our free UltiMaker Cura plugin.',
    rozet: '🌍 Global US / English Hub · USD',
    h1: 'Smart tools for <b>3D printing</b> makers &amp; workshops',
    alt: 'Check live global 3D printer & filament prices, calculate part cost from STL/3MF files privately, or automate filament checks inside Cura.',
    placeholder: 'Search Creality K3, K1C, Ender 3 V3, Hyper PLA or paste store.creality.com URL...',
    araBtn: 'Check Price →',
    ornekler: ['Creality K3', 'Creality K1C', 'Ender 3 V3 KE', 'Hyper PLA'],
    aracBaslik: 'Global Maker Toolkit',
    kartMaliyetBaslik: '🧮 STL / 3MF Cost Calculator',
    kartMaliyetMetin: 'Calculate filament weight, electricity, machine wear and suggested selling price in USD/EUR/JPY — 100% locally in your browser.',
    kartSlicerBaslik: '🧩 UltiMaker Cura &amp; Slicer Plugin',
    kartSlicerMetin: 'Automatically read filament usage right after slicing in Cura, OrcaSlicer, Bambu Studio or PrusaSlicer.',
    kartStoreBaslik: '🛒 Creality Official Store (US)',
    kartStoreMetin: 'Browse K3 Multi-Color, K1C, Ender 3 V3 series and official filaments directly on store.creality.com.',
    araniyor: 'Scanning regional store...',
    bulunamadi: 'No matching offer found for this query.',
    git: 'Visit Store ↗',
  },
  fr: {
    market: 'fr',
    currency: 'EUR',
    title: 'Baski Hesap France — Prix Imprimantes 3D, Calculateur STL &amp; Plugin Cura',
    desc: 'Vérifiez les prix officiels Creality France (EUR), calculez vos coûts d’impression 3D depuis un fichier STL/3MF et téléchargez notre extension Cura gratuite.',
    rozet: '🇫🇷 Espace France / Europe · EUR (€)',
    h1: 'Outils intelligents pour l’<b>impression 3D</b> et les ateliers',
    alt: 'Consultez les prix Creality France en euros, estimez vos coûts de fabrication à partir de fichiers STL/3MF et installez le plugin Cura.',
    placeholder: 'Rechercher Creality K1C, Ender 3 V3, buse ou coller une URL store.creality.com/fr...',
    araBtn: 'Vérifier le prix →',
    ornekler: ['Creality K1C', 'Ender 3 V3', 'Unicorn Nozzle', 'PEI Plate'],
    aracBaslik: 'Outils Gratuits Impression 3D',
    kartMaliyetBaslik: '🧮 Calculateur de Coût STL / 3MF',
    kartMaliyetMetin: 'Calculez poids, électricité, amortissement et prix de vente en € — 100 % local dans votre navigateur.',
    kartSlicerBaslik: '🧩 Extension UltiMaker Cura &amp; Slicer',
    kartSlicerMetin: 'Obtenez la consommation exacte dès le tranchage sur Cura, OrcaSlicer, Bambu Studio ou PrusaSlicer.',
    kartStoreBaslik: '🛒 Boutique Officielle Creality FR',
    kartStoreMetin: 'Découvrez les imprimantes, plateaux PEI, buses et filaments sur store.creality.com/fr.',
    araniyor: 'Analyse en cours...',
    bulunamadi: 'Aucune offre correspondante trouvée.',
    git: 'Voir l’offre ↗',
  },
  ja: {
    market: 'jp',
    currency: 'JPY',
    title: 'Baski Hesap 日本 — 3Dプリンター価格チェック・STL原価計算・Curaプラグイン',
    desc: 'Creality公式ストア（日本・円建て）のリアルタイム価格確認、STL/3MF原価シミュレーター、UltiMaker Cura連携プラグインを無料で提供。',
    rozet: '🇯🇵 日本マーケット / 日本語 · JPY (¥)',
    h1: '3Dプリント造形のための<b>原価計算・価格チェック</b>ハブ',
    alt: 'Creality公式ストアの最新価格（¥）検索、ブラウザ完結のSTL/3MF重量・原価計算、Curaスライサープラグインをすぐにお使いいただけます。',
    placeholder: 'Creality K1C, Ender 3 V3, ノズル 等を入力、または store.creality.com/jp URL を貼付...',
    araBtn: '価格を確認 →',
    ornekler: ['K1C', 'Ender 3 V3', 'Unicorn', 'PLA'],
    aracBaslik: '無料3Dプリントツール',
    kartMaliyetBaslik: '🧮 STL / 3MF 原価シミュレーター',
    kartMaliyetMetin: 'STL/3MFを読み込んでフィラメント代・電気代・償却費・推奨販売価格を円（¥）で即時計算します。',
    kartSlicerBaslik: '🧩 UltiMaker Cura &amp; スライサープラグイン',
    kartSlicerMetin: 'Cura、OrcaSlicer、Bambu Studio等でのスライス直後に使用グラム数を自動取得します。',
    kartStoreBaslik: '🛒 Creality 公式ストア（日本）',
    kartStoreMetin: 'store.creality.com/jp で3Dプリンター本体や純正ノズル・フィラメントを確認。',
    araniyor: '公式ストアを確認中...',
    bulunamadi: '該当する商品が見つかりませんでした。',
    git: 'ショップへ ↗',
  },
});

export function globalAnaSayfaHtml(dil = 'en', tabanUrl = '') {
  const kod = ['en', 'fr', 'ja'].includes(normalizeDil(dil)) ? normalizeDil(dil) : 'en';
  const c = ANA_KOPYA[kod];
  const canonicalUrl = `${tabanUrl}${GLOBAL_ANA_YOLLARI[kod]}`;
  const cr = crealityAracLinki(kod, '3D Printer');

  const extraMeta = [
    hreflangEtiketleri(tabanUrl, ANA_YOL_HARITASI),
    '<script src="/para.js"></script>',
  ].join('\n  ');

  const govdeHtml = `
    <section class="hero seo-hero" style="margin-bottom:22px">
      <div class="hero-ic">
        <span class="hero-rozet">${c.rozet}</span>
        <h1>${c.h1}</h1>
        <p>${c.alt}</p>
        <form id="globalAraForm" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          <input id="globalAraInput" type="search" placeholder="${htmlKacis(c.placeholder)}"
                 style="flex:1;min-width:220px;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.3);font:inherit;font-size:14.5px;background:#fff;color:#0f172a" />
          <button type="submit" class="seo-cta" style="border:none;cursor:pointer">${c.araBtn}</button>
        </form>
        <div class="seo-ic-linkler" style="margin-top:10px">
          ${c.ornekler.map(o => `<button type="button" class="seo-ic-link global-ornek-btn" data-q="${htmlKacis(o)}" style="cursor:pointer">${htmlKacis(o)}</button>`).join('')}
        </div>
      </div>
    </section>

    <div id="globalSonucAlani" class="seo-kart" hidden></div>

    <section class="seo-kart">
      <h2 style="margin-top:0">${c.aracBaslik}</h2>
      <div class="rehber-izgara">
        <a class="rehber-kart" href="${htmlKacis(GLOBAL_MALIYET_YOLLARI[kod])}">
          <h3 class="rehber-baslik">${c.kartMaliyetBaslik}</h3>
          <p class="rehber-ozet">${c.kartMaliyetMetin}</p>
          <span class="rehber-cta">→</span>
        </a>
        <a class="rehber-kart" href="${htmlKacis(GLOBAL_SLICER_YOLLARI[kod])}">
          <h3 class="rehber-baslik">${c.kartSlicerBaslik}</h3>
          <p class="rehber-ozet">${c.kartSlicerMetin}</p>
          <span class="rehber-cta">→</span>
        </a>
        <a class="rehber-kart" href="${htmlKacis(cr.storeUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(cr.siteId)}">
          <h3 class="rehber-baslik">${c.kartStoreBaslik}</h3>
          <p class="rehber-ozet">${c.kartStoreMetin}</p>
          <span class="rehber-cta">${c.git}</span>
        </a>
      </div>
    </section>

    <script>
      (function () {
        var form = document.getElementById('globalAraForm');
        var inp = document.getElementById('globalAraInput');
        var alan = document.getElementById('globalSonucAlani');
        var market = ${JSON.stringify(c.market)};
        var cur = ${JSON.stringify(c.currency)};
        var timer = null;
        if (!form || !inp || !alan) return;

        function esc(s) {
          return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
          });
        }
        function fmt(n) {
          return typeof window.formatPara === 'function' ? window.formatPara(n, cur) : (n + ' ' + cur);
        }
        function baslat(deger) {
          var q = String(deger || '').trim();
          if (q.length < 2) return;
          if (timer) clearTimeout(timer);
          alan.hidden = false;
          alan.innerHTML = '<p style="margin:0">' + esc(${JSON.stringify(c.araniyor)}) + '</p>';
          var isUrl = /^https?:\\/\\//i.test(q);
          fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isUrl ? { url: q, market: market } : { query: q, market: market }),
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (!d || !d.id) { alan.innerHTML = '<p>' + esc(d?.error || ${JSON.stringify(c.bulunamadi)}) + '</p>'; return; }
            var yokla = function () {
              fetch('/api/compare/' + encodeURIComponent(d.id)).then(function (r) { return r.json(); }).then(function (j) {
                if (j.status === 'done') {
                  var res = j.result || {};
                  var bulunlar = (res.sonuclar || []).filter(function (x) { return x.status === 'found' && x.product; });
                  if (!bulunlar.length) { alan.innerHTML = '<p>' + esc(${JSON.stringify(c.bulunamadi)}) + '</p>'; return; }
                  alan.innerHTML = bulunlar.map(function (x) {
                    var p = x.product;
                    var tutar = (p.pricing && p.pricing.toplam != null) ? p.pricing.toplam : p.sellingPrice;
                    return '<div class="seo-fiyat-kutu" style="justify-content:space-between"><div><div style="font-weight:800">' + esc(p.title) + '</div><div style="font-size:13px;color:var(--gri-metin)">' + esc(x.siteName || x.site) + '</div></div><div style="display:flex;align-items:center;gap:12px"><b class="seo-fiyat-ana" style="font-size:22px">' + esc(fmt(tutar)) + '</b><a class="seo-cta" href="' + esc(p.afiliyeUrl || p.url) + '" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="' + esc(x.site) + '">' + esc(${JSON.stringify(c.git)}) + '</a></div></div>';
                  }).join('');
                } else if (j.status === 'error') {
                  alan.innerHTML = '<p>' + esc(j.error || ${JSON.stringify(c.bulunamadi)}) + '</p>';
                } else {
                  timer = setTimeout(yokla, 750);
                }
              }).catch(function () { timer = setTimeout(yokla, 1000); });
            };
            yokla();
          }).catch(function () { alan.innerHTML = '<p>' + esc(${JSON.stringify(c.bulunamadi)}) + '</p>'; });
        }

        form.addEventListener('submit', function (e) { e.preventDefault(); baslat(inp.value); });
        document.querySelectorAll('.global-ornek-btn').forEach(function (b) {
          b.addEventListener('click', function () { inp.value = b.dataset.q || ''; baslat(inp.value); });
        });
      })();
    </script>
  `;

  return sayfaIskeleti({
    title: c.title,
    description: c.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    extraMeta,
    govdeHtml,
    aktifNav: 'karsilastir',
    dil: kod,
    dilYolHaritasi: ANA_YOL_HARITASI,
  });
}

export function globalAracSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '');
  for (const [dil, rYol] of Object.entries(GLOBAL_ANA_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'ana', olustur: (tabanUrl) => globalAnaSayfaHtml(dil, tabanUrl) };
  }
  for (const [dil, rYol] of Object.entries(GLOBAL_MALIYET_YOLLARI)) {
    if (rYol === temiz) return { dil, tur: 'maliyet', olustur: (tabanUrl) => globalMaliyetSayfasiHtml(dil, tabanUrl) };
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
  const slicer = { ...SLICER_YOL_HARITASI, 'x-default': GLOBAL_SLICER_YOLLARI.en };
  return {
    '/': ana,
    '/en': ana,
    '/fr': ana,
    '/ja': ana,
    '/maliyet.html': maliyet,
    '/en/cost-calculator': maliyet,
    '/fr/calculateur-cout': maliyet,
    '/ja/cost-calculator': maliyet,
    '/slicer.html': slicer,
    '/en/slicer': slicer,
    '/fr/slicer': slicer,
    '/ja/slicer': slicer,
  };
}

export function globalAracSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const altHarita = globalAracAlternatifHaritasi();
  const gruplar = [
    { yollar: GLOBAL_ANA_YOLLARI, oncelik: '0.95', siklik: 'daily' },
    { yollar: GLOBAL_MALIYET_YOLLARI, oncelik: '0.85', siklik: 'weekly' },
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
