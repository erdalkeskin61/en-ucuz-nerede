/**
 * ⚔️ Global Yüksek Niyetli Marka Düelloları (EN / FR / JA) — 2026-11-28
 *
 * Aktif Impact / resmî mağaza ortaklıklarına (HeyGears, ELEGOO, Snapmaker,
 * Creality, Sovol, Flashforge) yönelik derin teknik karşılaştırma ve baskı
 * maliyeti rehberleri:
 *   1) HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra
 *   2) Snapmaker Artisan / U1 vs Creality K1 Max
 *   3) Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max
 *
 * Dürüstlük: Hiçbir canlı mağaza fiyatı uydurulmaz; DB'de (`seoUrunListesi`)
 * eşleşen canlı kayıt varsa gösterilir, yoksa canlı arama ve doğrudan resmî
 * ortaklık bağlantısı (`afiliyeLink`) sunulur.
 */
import { htmlKacis, sayfaIskeleti, GLOBAL_REHBER_YOLLARI } from './seoSayfalar.js';
import { formatPara } from './util.js';
import { afiliyeLink } from './afiliye.js';

export const GLOBAL_DUELLO_YOLLARI = Object.freeze({
  'heygears-vs-saturn': {
    en: '/en/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra',
    fr: '/fr/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra',
    ja: '/ja/guides/heygears-reflex-rs-vs-elegoo-saturn-4-ultra',
  },
  'snapmaker-vs-k1max': {
    en: '/en/guides/snapmaker-artisan-u1-vs-creality-k1-max',
    fr: '/fr/guides/snapmaker-artisan-u1-vs-creality-k1-max',
    ja: '/ja/guides/snapmaker-artisan-u1-vs-creality-k1-max',
  },
  'sv08-vs-ad5m-vs-n4max': {
    en: '/en/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max',
    fr: '/fr/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max',
    ja: '/ja/guides/sovol-sv08-vs-flashforge-ad5m-pro-vs-elegoo-neptune-4-max',
  },
});

const MALIYET_YOLLARI = Object.freeze({
  en: '/en/cost-calculator',
  fr: '/fr/calculateur-cout',
  ja: '/ja/cost-calculator',
});

const UI_KOPYA = Object.freeze({
  en: {
    home: 'Home',
    guides: 'Guides',
    liveSearch: 'Live Store Check →',
    liveBadge: 'Verified live price:',
    officialStore: 'Official Store',
    calcBtn: 'Calculate Print Cost (STL/3MF) →',
    allGuides: '← All Buying Guides',
    faqTitle: 'Frequently Asked Questions',
    verdictTitle: 'Which Should You Choose?',
  },
  fr: {
    home: 'Accueil',
    guides: 'Guides',
    liveSearch: 'Vérifier les prix →',
    liveBadge: 'Prix vérifié en direct :',
    officialStore: 'Boutique Officielle',
    calcBtn: 'Calculer le coût réel (STL/3MF) →',
    allGuides: '← Tous les guides',
    faqTitle: 'Questions Fréquentes',
    verdictTitle: 'Quel modèle choisir selon votre usage ?',
  },
  ja: {
    home: 'ホーム',
    guides: 'ガイド',
    liveSearch: '最新価格を検索 →',
    liveBadge: '国内ストア参考価格:',
    officialStore: '公式ストア',
    calcBtn: 'STL/3MF原価を試算する →',
    allGuides: '← ガイド一覧へ戻る',
    faqTitle: 'よくある質問',
    verdictTitle: '用途別のおすすめ選び方',
  },
});

const DUELLOLAR = [
  {
    id: 'heygears-vs-saturn',
    yollar: GLOBAL_DUELLO_YOLLARI['heygears-vs-saturn'],
    modeller: [
      {
        ad: 'HeyGears Reflex RS',
        sorgu: 'HeyGears Reflex RS',
        regex: /reflex\s*rs/i,
        marka: 'HeyGears',
        bolge: {
          en: { site: 'heygears_us', url: 'https://store.heygears.com/products/ultracraft-reflex-rs-3d-printer' },
          fr: { site: 'heygears_us', url: 'https://store.heygears.com/products/ultracraft-reflex-rs-3d-printer' },
          ja: { site: 'heygears_us', url: 'https://store.heygears.com/products/ultracraft-reflex-rs-3d-printer' },
        },
        etiket: { en: 'HeyGears Reflex RS ↗', fr: 'HeyGears Reflex RS ↗', ja: 'HeyGears Reflex RS 公式 ↗' },
      },
      {
        ad: 'ELEGOO Saturn 4 Ultra',
        sorgu: 'ELEGOO Saturn 4 Ultra',
        regex: /saturn\s*4\s*ultra/i,
        marka: 'ELEGOO',
        bolge: {
          en: { site: 'elegoo_us', url: 'https://us.elegoo.com/products/saturn-4-ultra-12k-10inch-monochrome-lcd-resin-3d-printer' },
          fr: { site: 'elegoo_eu', url: 'https://eu.elegoo.com/products/saturn-4-ultra-12k-10inch-monochrome-lcd-resin-3d-printer' },
          ja: { site: 'elegoo_jp', url: 'https://jp.elegoo.com/products/saturn-4-ultra-16k-m1-ultra' },
        },
        etiket: { en: 'ELEGOO Saturn 4 Ultra ↗', fr: 'ELEGOO Saturn 4 Ultra EU ↗', ja: 'ELEGOO Saturn 4 Ultra JP ↗' },
      },
    ],
    diller: {
      en: {
        title: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra: Resin Cost & Workflow Breakdown | Baski Hesap',
        desc: 'Compare HeyGears UltraCraft Reflex RS and ELEGOO Saturn 4 Ultra: 8K industrial automation vs 12K tilt-release speed, resin workflow costs, and live official pricing.',
        crumb: 'HeyGears Reflex RS vs Saturn 4 Ultra',
        rozet: 'Resin MSLA Showdown · 2026',
        h1: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra: <b>Resin Workflow &amp; Real Cost</b>',
        alt: 'Industrial smart resin automation (floating auto-leveling, force-sensor residue detection) versus high-speed 12K tilt-release open workflow.',
        stats: ['222×122×230 vs 219×123×220 mm', '8K 29.7 µm vs 12K 19×24 µm', 'Official Store Links'],
        specTitle: 'Head-to-Head Specifications',
        headers: ['Specification', 'HeyGears Reflex RS', 'ELEGOO Saturn 4 Ultra (12K)'],
        rows: [
          ['Build Volume', '222 × 122 × 230 mm', '218.88 × 122.88 × 220 mm'],
          ['LCD Panel &amp; XY Pixel', '10.3" 8K Mono · 29.7 µm', '10" 12K Mono · 19 × 24 µm'],
          ['Z-Axis Accuracy', 'C5-Grade Module (±15 µm system)', '0.02 mm ball-screw guide'],
          ['Release &amp; Speed', '~4.5 s/layer high-speed dynamic control', 'Tilt-release VAT up to 150 mm/h (~5.5 s/layer)'],
          ['Sensors &amp; Safety', '0.1 N force residue sensor, optional heated vat &amp; auto-refill', 'AI camera failure detection &amp; mechanical level sensor'],
          ['Resin Ecosystem', 'Tuned UltraCraft resins &amp; Blueprint Studio presets', 'Open third-party resin market ($20–$45/kg)'],
        ],
        costTitle: 'Resin Per-Print Cost &amp; Consumable Reality',
        costBody: 'Printer purchase price is only part of resin economics. A typical 60 ml miniature batch consumes roughly 6–8% of a 1 kg bottle plus IPA/wash solvent, nitrile gloves, and release film wear. HeyGears streamlines repeat production with minimal failed-print scrap through force sensing and calibrated profiles, while ELEGOO Saturn 4 Ultra lets you source lower-cost third-party 8K/12K resins and rapid tilt-release cycles.',
        verdicts: [
          ['Choose HeyGears Reflex RS if:', 'You run small-batch commercial dental, jewelry, or figurine jobs where predictable calibration, force-sensor screen protection, and optional heated/auto-refill resin handling cut failure waste.'],
          ['Choose ELEGOO Saturn 4 Ultra if:', 'You want sharper 19 × 24 µm 12K XY detail, fast tilt-release cycle times, AI print camera monitoring, and full freedom to shop lower-cost third-party resins.'],
        ],
        faq: [
          { soru: 'Which has finer pixel resolution: Reflex RS or Saturn 4 Ultra?', cevap: 'ELEGOO Saturn 4 Ultra uses a 10-inch 12K panel (19 × 24 µm XY), while HeyGears Reflex RS pairs a 10.3-inch 8K panel (29.7 µm) with C5-grade Z mechanics (±15 µm system accuracy).' },
          { soru: 'Why does HeyGears reduce failed-print resin waste?', cevap: 'Its 0.1 N force-sensing residue detection stops the build plate before crushed debris damages the LCD or FEP, avoiding ruined full-plate batches.' },
        ],
      },
      fr: {
        title: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra : Comparatif Résine & Coût | Baski Hesap',
        desc: 'Duel résine MSLA : HeyGears UltraCraft Reflex RS (automatisation, capteur de force) face à l’ELEGOO Saturn 4 Ultra 12K (tilt-release 150 mm/h) et liens boutiques officielles.',
        crumb: 'HeyGears Reflex RS vs Saturn 4 Ultra',
        rozet: 'Duel Résine MSLA · 2026',
        h1: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra : <b>Flux Résine &amp; Coût Réel</b>',
        alt: 'Automatisation de précision et détection de résidus par capteur de force contre vitesse tilt-release 12K et liberté totale sur le prix des résines.',
        stats: ['222×122×230 vs 219×123×220 mm', '8K 29,7 µm vs 12K 19×24 µm', 'Boutiques Officielles'],
        specTitle: 'Fiche Technique Comparée',
        headers: ['Critère', 'HeyGears Reflex RS', 'ELEGOO Saturn 4 Ultra (12K)'],
        rows: [
          ['Volume d’impression', '222 × 122 × 230 mm', '218,88 × 122,88 × 220 mm'],
          ['Écran LCD &amp; Pixel XY', '10,3" 8K Mono · 29,7 µm', '10" 12K Mono · 19 × 24 µm'],
          ['Précision Axe Z', 'Module C5 (±15 µm système)', '0,02 mm'],
          ['Mécanisme &amp; Vitesse', '~4,5 s/couche, contrôle dynamique', 'Tilt-release jusqu’à 150 mm/h (~5,5 s/couche)'],
          ['Capteurs &amp; Sécurité', 'Capteur de force 0,1 N, bac chauffant/remplissage en option', 'Caméra IA anti-échec &amp; capteur mécanique'],
          ['Écosystème Résine', 'Profils calibrés UltraCraft &amp; Blueprint Studio', 'Toutes résines tierces compatibles (20–45 €/kg)'],
        ],
        costTitle: 'Coût Réel par Tirage &amp; Pertes Résine',
        costBody: 'Sur un plateau de figurines de 60 ml, le coût matière reste modéré mais les échecs d’impression doublent vite la facture (résine perdue + alcool IPA + film FEP). La HeyGears Reflex RS limite les casses grâce au capteur de force 0,1 N et au nivellement flottant, tandis que la Saturn 4 Ultra excelle sur le coût au litre grâce à sa compatibilité avec toutes les résines 8K/12K du marché.',
        verdicts: [
          ['Choisir la HeyGears Reflex RS si :', 'Vous recherchez une répétabilité type atelier/pro, des profils pré-calibrés et une protection active contre les résidus dans le bac.'],
          ['Choisir l’ELEGOO Saturn 4 Ultra si :', 'Vous privilégiez la finesse 12K (19 × 24 µm), le décollement rapide par basculement et la liberté d’utiliser des résines économiques en EUR.'],
        ],
        faq: [
          { soru: 'Quelle imprimante offre la meilleure résolution XY ?', cevap: 'L’ELEGOO Saturn 4 Ultra affiche 19 × 24 µm (12K) contre 29,7 µm (8K) pour la Reflex RS, qui mise en contrepartie sur sa mécanique Z de classe C5 (±15 µm).' },
          { soru: 'Peut-on utiliser des résines tierces moins chères ?', cevap: 'Oui, la Saturn 4 Ultra est totalement ouverte aux résines standards et lavables à l’eau ; HeyGears optimise son workflow autour des résines et profils UltraCraft.' },
        ],
      },
      ja: {
        title: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra：光造形ワークフローと実原価比較 | Baski Hesap',
        desc: '産業級自動化のHeyGears Reflex RS（8K・圧力センサー）とチルトリリース高速12K機ELEGOO Saturn 4 Ultraのスペック・レジンコスト比較。',
        crumb: 'HeyGears Reflex RS vs Saturn 4 Ultra',
        rozet: '光造形MSLA徹底比較 · 2026',
        h1: 'HeyGears Reflex RS vs ELEGOO Saturn 4 Ultra：<b>自動化とレジン単価比較</b>',
        alt: '圧力センサーによる残渣検知と自動供給ワークフローか、19×24 µm 12K高精細＆チルトリリース高速造形か。',
        stats: ['222×122×230 vs 219×123×220 mm', '8K 29.7 µm vs 12K 19×24 µm', '公式ストア対応'],
        specTitle: '主要スペック比較表',
        headers: ['比較項目', 'HeyGears Reflex RS', 'ELEGOO Saturn 4 Ultra (12K)'],
        rows: [
          ['造形サイズ', '222 × 122 × 230 mm', '218.88 × 122.88 × 220 mm'],
          ['LCD・XY解像度', '10.3型 8Kモノクロ · 29.7 µm', '10型 12Kモノクロ · 19 × 24 µm'],
          ['Z軸精度', 'C5グレード（システム精度 ±15 µm）', '0.02 mm'],
          ['離型・造形速度', '約4.5秒/層', 'チルトリリース最大150 mm/h（約5.5秒/層）'],
          ['安全・自動機能', '0.1N圧力残渣検知・自動供給/ヒーター対応', 'AIカメラ失敗検知・ワンタッチ自動レベリング'],
          ['レジン対応', 'UltraCraft最適化プロファイル', '汎用サードパーティ製レジン対応'],
        ],
        costTitle: 'レジン消耗品と造形失敗コストの違い',
        costBody: '光造形の実質コストでは、1kgあたりのレジン単価だけでなく造形失敗による廃棄ロスとIPA・フィルム交換頻度が大きく影響します。Reflex RSは0.1N圧力センサーにより残渣での画面破損や連続失敗を防ぎ、Saturn 4 Ultraはオープンな汎用レジン選択とチルトリリースによる時短で1回あたりのコストを下げやすい設計です。',
        verdicts: [
          ['HeyGears Reflex RSが向く方:', '試作や小ロット販売でプロファイル調整の手間を減らし、LCD破損リスクや失敗ロスを抑えたいケース。'],
          ['ELEGOO Saturn 4 Ultraが向く方:', '19×24 µmの12K高精細、AI監視、手頃な汎用レジンによる低ランニングコストを重視するケース。'],
        ],
        faq: [
          { soru: 'XYピクセルの細かさはどちらが上ですか？', cevap: 'ELEGOO Saturn 4 Ultraは12K（19×24 µm）、HeyGears Reflex RSは8K（29.7 µm）ですが、Reflex RSはC5グレードZ軸による寸法安定性が強みです。' },
        ],
      },
    },
  },
  {
    id: 'snapmaker-vs-k1max',
    yollar: GLOBAL_DUELLO_YOLLARI['snapmaker-vs-k1max'],
    modeller: [
      {
        ad: 'Snapmaker U1',
        sorgu: 'Snapmaker U1',
        regex: /snapmaker\s*u1/i,
        marka: 'Snapmaker',
        bolge: {
          en: { site: 'snapmaker_us', url: 'https://us.snapmaker.com/products/snapmaker-u1-3d-printer' },
          fr: { site: 'snapmaker_fr', url: 'https://eu.snapmaker.com/fr/products/snapmaker-u1-3d-printer' },
          ja: { site: 'snapmaker_us', url: 'https://us.snapmaker.com/products/snapmaker-u1-3d-printer' },
        },
        etiket: { en: 'Snapmaker U1 (4-Toolhead) ↗', fr: 'Snapmaker U1 (4 Têtes) ↗', ja: 'Snapmaker U1 公式 ↗' },
      },
      {
        ad: 'Snapmaker Artisan',
        sorgu: 'Snapmaker Artisan',
        regex: /artisan/i,
        marka: 'Snapmaker',
        bolge: {
          en: { site: 'snapmaker_us', url: 'https://us.snapmaker.com/products/snapmaker-artisan-3-in-1-3d-printer' },
          fr: { site: 'snapmaker_fr', url: 'https://eu.snapmaker.com/fr/products/snapmaker-artisan-3-in-1-3d-printer' },
          ja: { site: 'snapmaker_us', url: 'https://us.snapmaker.com/products/snapmaker-artisan-3-in-1-3d-printer' },
        },
        etiket: { en: 'Snapmaker Artisan 3-in-1 ↗', fr: 'Snapmaker Artisan 3-en-1 ↗', ja: 'Snapmaker Artisan 公式 ↗' },
      },
      {
        ad: 'Creality K1 Max',
        sorgu: 'Creality K1 Max',
        regex: /k1\s*max/i,
        marka: 'Creality',
        bolge: {
          en: { site: 'creality_us', url: 'https://store.creality.com/products/k1-max-3d-printer' },
          fr: { site: 'creality_fr', url: 'https://store.creality.com/fr/products/imprimante-3d-rapide-k1-max-ai' },
          ja: { site: 'creality_jp', url: 'https://store.creality.com/jp/search?q=K1%20Max' },
        },
        etiket: { en: 'Creality K1 Max ↗', fr: 'Creality K1 Max FR ↗', ja: 'Creality K1 Max JP ↗' },
      },
    ],
    diller: {
      en: {
        title: 'Snapmaker Artisan / U1 vs Creality K1 Max: Multi-Function & Toolchanger vs Speed | Baski Hesap',
        desc: 'Compare Snapmaker U1 (4-toolhead CoreXY), Snapmaker Artisan (400mm 3-in-1 CNC/Laser/FDM), and Creality K1 Max (600 mm/s enclosed CoreXY) with print cost analysis.',
        crumb: 'Snapmaker Artisan / U1 vs K1 Max',
        rozet: 'Multi-Tool &amp; High-Speed FDM · 2026',
        h1: 'Snapmaker Artisan / U1 vs Creality K1 Max: <b>Toolchanger, 3-in-1 or Pure Speed?</b>',
        alt: 'Zero-purge 4-toolhead multi-material printing (Snapmaker U1), 400 mm 3-in-1 CNC/Laser workstation (Artisan), or 600 mm/s enclosed engineering FDM (Creality K1 Max).',
        stats: ['400 / 270 / 300 mm Volumes', '4 Toolheads vs Single Extruder', '180 / 500 / 600 mm/s'],
        specTitle: '3-Way Technical Comparison',
        headers: ['Specification', 'Snapmaker U1', 'Snapmaker Artisan 3-in-1', 'Creality K1 Max'],
        rows: [
          ['Architecture', 'CoreXY 4-Independent Toolchanger', 'Modular 3-in-1 (FDM / 10W Laser / 200W CNC)', 'Enclosed CoreXY (Single Direct Drive)'],
          ['Build Volume', '270 × 270 × 270 mm', '400 × 400 × 400 mm', '300 × 300 × 300 mm'],
          ['Max Print Speed', '500 mm/s · 20,000 mm/s²', '180 mm/s recommended · ~2,000 mm/s²', '600 mm/s · 20,000 mm/s²'],
          ['Nozzle &amp; Bed Max', '300 °C / 100 °C', '300 °C (Dual Extrusion) / 110 °C', '300 °C / 120 °C'],
          ['Enclosure', 'Open standard (Top cover optional)', 'Full safety enclosure included', 'Fully enclosed with air filtration'],
          ['Standout Feature', 'SnapSwap™ 4-toolhead multi-material without purge waste', '64 L workspace + CNC carving &amp; laser cutting', 'AI LiDAR first-layer scan &amp; AI spaghetti camera'],
        ],
        costTitle: 'Filament Waste &amp; Print Time Economics',
        costBody: 'Single-nozzle color changers typically flush 15–25% extra filament on multi-color models. Because Snapmaker U1 swaps 4 independent toolheads mechanically, multi-material or soluble-support parts avoid heavy flush towers and cut tool-change delays dramatically. Creality K1 Max wins when printing single-color ABS, ASA, or PLA parts fast at 300×300 mm, while Snapmaker Artisan pays off only if your workshop uses its 200W CNC and 10W laser modules alongside 400 mm FDM.',
        verdicts: [
          ['Choose Snapmaker U1 if:', 'You print multi-color models or rigid + soluble support combinations regularly and want to slash purge-tower filament waste at 500 mm/s CoreXY speed.'],
          ['Choose Snapmaker Artisan if:', 'You need one heavy-duty 400 × 400 × 400 mm enclosure combining dual-extrusion FDM with 10W laser and 200W CNC machining.'],
          ['Choose Creality K1 Max if:', 'You want fast 600 mm/s single-material engineering prints (ABS/ASA/PLA) in a 300 mm heated chamber with LiDAR calibration at a mainstream budget.'],
        ],
        faq: [
          { soru: 'Does Snapmaker U1 really save filament compared to single-nozzle systems?', cevap: 'Yes. Dedicated toolheads stay loaded with each filament, avoiding repeated nozzle cut-and-purge cycles that add 15–25% waste on color-heavy prints.' },
          { soru: 'Is Snapmaker Artisan faster than Creality K1 Max?', cevap: 'No—Artisan uses rigid CNC-capable linear rails tuned for ~180 mm/s accuracy and multi-craft versatility, whereas K1 Max is built for 600 mm/s CoreXY speed.' },
        ],
      },
      fr: {
        title: 'Snapmaker Artisan / U1 vs Creality K1 Max : Multi-têtes & 3-en-1 contre Vitesse CoreXY | Baski Hesap',
        desc: 'Comparatif Snapmaker U1 (4 têtes indépendantes), Snapmaker Artisan (400 mm FDM/Laser/CNC) et Creality K1 Max (CoreXY fermée 600 mm/s) : specs et coût filament.',
        crumb: 'Snapmaker Artisan / U1 vs K1 Max',
        rozet: 'Multi-outils &amp; CoreXY Rapide · 2026',
        h1: 'Snapmaker Artisan / U1 vs Creality K1 Max : <b>Multi-matériaux, CNC ou Vitesse Pure ?</b>',
        alt: 'Changeur 4 têtes sans purge massive (U1), station 3-en-1 de 400 mm (Artisan) ou CoreXY fermée à 600 mm/s (K1 Max).',
        stats: ['Volumes 270 / 400 / 300 mm', '4 têtes vs mono-extrudeur', '500 / 180 / 600 mm/s'],
        specTitle: 'Tableau Comparatif 3 Machines',
        headers: ['Critère', 'Snapmaker U1', 'Snapmaker Artisan 3-en-1', 'Creality K1 Max'],
        rows: [
          ['Architecture', 'CoreXY à 4 têtes indépendantes', 'Modulaire 3-en-1 (FDM / Laser 10W / CNC 200W)', 'CoreXY fermée (Direct Drive simple)'],
          ['Volume utile', '270 × 270 × 270 mm', '400 × 400 × 400 mm', '300 × 300 × 300 mm'],
          ['Vitesse / Accél.', '500 mm/s · 20 000 mm/s²', '180 mm/s rec. · ~2 000 mm/s²', '600 mm/s · 20 000 mm/s²'],
          ['Temp. Buse / Lit', '300 °C / 100 °C', '300 °C (Double extrusion) / 110 °C', '300 °C / 120 °C'],
          ['Caisson', 'Châssis ouvert (couvercle en option)', 'Caisson intégral sécurisé inclus', 'Caisson fermé avec filtration d’air'],
          ['Atout majeur', 'Changement SnapSwap™ sans purge excessive', '64 L + gravure laser et fraisage CNC', 'LiDAR IA &amp; caméra de détection d’échec'],
        ],
        costTitle: 'Impact sur les Pertes Filament (€/kg) et le Temps',
        costBody: 'Sur une impression multicouleur complexe, un système mono-buse classique gaspille 15 à 25 % de bobine en purges. Le Snapmaker U1 bascule mécaniquement entre 4 têtes prêtes à imprimer, réduisant fortement les déchets et le temps mort. La Creality K1 Max domine en productivité mono-matériau haute température (ABS/ASA/Hyper PLA), tandis que l’Artisan se rentabilise si vous exploitez vraiment le laser 10W et la CNC 200W.',
        verdicts: [
          ['Choisir le Snapmaker U1 si :', 'Vous imprimez souvent en 2 à 4 couleurs ou avec supports solubles et voulez éviter les tours de purge coûteuses.'],
          ['Choisir le Snapmaker Artisan si :', 'Vous cherchez un seul poste d’atelier de 400 mm capable de faire FDM double buse, découpe laser et usinage CNC.'],
          ['Choisir la Creality K1 Max si :', 'Vous voulez imprimer vite (600 mm/s) en volume 300 × 300 mm fermé pour pièces techniques ABS/PLA à budget maîtrisé.'],
        ],
        faq: [
          { soru: 'Le Snapmaker U1 réduit-il vraiment le gaspillage de filament ?', cevap: 'Oui, chaque tête conserve son filament chargé, évitant les coupes et purges répétitives à chaque changement de couleur.' },
        ],
      },
      ja: {
        title: 'Snapmaker Artisan / U1 vs Creality K1 Max：多ヘッド・3in1・高速CoreXY徹底比較 | Baski Hesap',
        desc: '4独立ツールヘッドのSnapmaker U1、400mm 3-in-1のArtisan、600mm/s密閉型Creality K1 Maxの造形サイズ・速度・ランニングコスト比較。',
        crumb: 'Snapmaker Artisan / U1 vs K1 Max',
        rozet: 'マルチツール vs 高速CoreXY · 2026',
        h1: 'Snapmaker Artisan / U1 vs Creality K1 Max：<b>多素材交換・CNC兼用・超高速の選択</b>',
        alt: 'パージロスを極小化する4ヘッド交換式U1、レーザー/CNC対応400mm大型Artisan、600mm/s密閉型CoreXYのK1 Maxを比較。',
        stats: ['270 / 400 / 300 mm 造形サイズ', '4ヘッド交換 vs 単一ヘッド', '500 / 180 / 600 mm/s'],
        specTitle: '3機種スペック比較表',
        headers: ['比較項目', 'Snapmaker U1', 'Snapmaker Artisan 3-in-1', 'Creality K1 Max'],
        rows: [
          ['構造', 'CoreXY 4独立ツールチェンジャー', '3-in-1 (FDM / 10Wレーザー / 200W CNC)', '密閉型CoreXY（シングルダイレクト）'],
          ['造形体積', '270 × 270 × 270 mm', '400 × 400 × 400 mm', '300 × 300 × 300 mm'],
          ['最大速度', '500 mm/s · 20,000 mm/s²', '推奨180 mm/s · 約2,000 mm/s²', '600 mm/s · 20,000 mm/s²'],
          ['ノズル / ベッド', '300 °C / 100 °C', '300 °C（デュアル押出）/ 110 °C', '300 °C / 120 °C'],
          ['強み', '色替えパージ大幅削減', '64L大型造形＋切削・レーザー加工', 'AI LiDAR自動補正＋空気清浄'],
        ],
        costTitle: 'パージロスと時間コストの観点',
        costBody: 'シングルノズルでの多色印刷ではパージで15〜25%のフィラメントロスが発生しますが、4ヘッド独立交換式のSnapmaker U1は色替え待ち時間と廃棄樹脂を大幅に削減できます。単色ABS/ASAや大型試作の高速量産ならCreality K1 Max、1台で木工CNCやレーザー加工までこなす工房用途ならArtisanが最適です。',
        verdicts: [
          ['Snapmaker U1が向く方:', '多色プリントや水溶性サポート材を低いフィラメントロス・高速で回したい方。'],
          ['Snapmaker Artisanが向く方:', '400mmの大型造形に加えて10Wレーザーと200W CNCを1台にまとめたい方。'],
          ['Creality K1 Maxが向く方:', '300mm密閉チャンバーでABS/PLAを最高600mm/sで素早く出力したい方。'],
        ],
        faq: [
          { soru: 'Snapmaker U1はなぜ多色印刷の材料費を抑えられますか？', cevap: '各色に専用ツールヘッドが割り当てられるため、切り替えのたびにノズル内フィラメントを切り捨ててパージする必要が減るためです。' },
        ],
      },
    },
  },
  {
    id: 'sv08-vs-ad5m-vs-n4max',
    yollar: GLOBAL_DUELLO_YOLLARI['sv08-vs-ad5m-vs-n4max'],
    modeller: [
      {
        ad: 'Sovol SV08',
        sorgu: 'Sovol SV08',
        regex: /sovol\s*sv08(?!\s*max)/i,
        marka: 'Sovol',
        bolge: {
          en: { site: 'sovol_us', url: 'https://www.sovol3d.com/products/sovol-sv08-3d-printer' },
          fr: { site: 'sovol_us', url: 'https://www.sovol3d.com/products/sovol-sv08-3d-printer' },
          ja: { site: 'sovol_us', url: 'https://www.sovol3d.com/products/sovol-sv08-3d-printer' },
        },
        etiket: { en: 'Sovol SV08 ↗', fr: 'Sovol SV08 Officiel ↗', ja: 'Sovol SV08 公式 ↗' },
      },
      {
        ad: 'Flashforge Adventurer 5M Pro',
        sorgu: 'Flashforge Adventurer 5M Pro',
        regex: /(adventurer\s*5m\s*pro|ad5m\s*pro)/i,
        marka: 'Flashforge',
        bolge: {
          en: { site: 'flashforge_us', url: 'https://flashforge.com/products/adventurer-5m-pro-3d-printer' },
          fr: { site: 'flashforge_fr', url: 'https://eu.flashforge.com/fr/products/imprimante-3d-pro-aventurier-5m' },
          ja: { site: 'flashforge_us', url: 'https://flashforge.com/products/adventurer-5m-pro-3d-printer' },
        },
        etiket: { en: 'Flashforge AD5M Pro ↗', fr: 'Flashforge AD5M Pro FR ↗', ja: 'Flashforge AD5M Pro 公式 ↗' },
      },
      {
        ad: 'ELEGOO Neptune 4 Max',
        sorgu: 'ELEGOO Neptune 4 Max',
        regex: /neptune\s*4\s*max/i,
        marka: 'ELEGOO',
        bolge: {
          en: { site: 'elegoo_us', url: 'https://us.elegoo.com/products/neptune-4-max-fdm-3d-printer' },
          fr: { site: 'elegoo_eu', url: 'https://eu.elegoo.com/products/neptune-4-max-fdm-3d-printer' },
          ja: { site: 'elegoo_jp', url: 'https://jp.elegoo.com/search?q=Neptune%204%20Max' },
        },
        etiket: { en: 'ELEGOO Neptune 4 Max ↗', fr: 'ELEGOO Neptune 4 Max EU ↗', ja: 'ELEGOO Neptune 4 Max JP ↗' },
      },
    ],
    diller: {
      en: {
        title: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max: Volume & Speed | Baski Hesap',
        desc: 'Compare Sovol SV08 (350mm CoreXY Voron-style, 700 mm/s), Flashforge Adventurer 5M Pro (enclosed 220mm CoreXY), and ELEGOO Neptune 4 Max (420mm giant bed-slinger).',
        crumb: 'SV08 vs AD5M Pro vs Neptune 4 Max',
        rozet: 'CoreXY vs Enclosed vs Giant Format · 2026',
        h1: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max: <b>Which Wins Value?</b>',
        alt: 'Three completely different philosophies under $600: open-source 350mm CoreXY (SV08), HEPA-filtered plug-and-play chamber (AD5M Pro), or 420×420×480 mm cosplay giant (Neptune 4 Max).',
        stats: ['350 / 220 / 420 mm Beds', '700 / 600 / 500 mm/s', 'Klipper vs Enclosed HEPA'],
        specTitle: 'Side-by-Side Specs',
        headers: ['Criterion', 'Sovol SV08', 'Flashforge AD5M Pro', 'ELEGOO Neptune 4 Max'],
        rows: [
          ['Build Volume', '350 × 350 × 345 mm', '220 × 220 × 220 mm', '420 × 420 × 480 mm'],
          ['Motion System', 'Open-frame CoreXY (Voron-inspired)', 'Enclosed CoreXY', 'Bed Slinger'],
          ['Max Speed / Accel', '700 mm/s · 40,000 mm/s²', '600 mm/s · 20,000 mm/s²', '500 mm/s (250 rec.) · 8,000 mm/s²'],
          ['Firmware', 'Open-source Vanilla Klipper', 'Proprietary (Orca-Flashforge ready)', 'Klipper'],
          ['Max Nozzle Temp', '300 °C', '280 °C', '300 °C'],
          ['Enclosure &amp; Air', 'Open frame (Optional enclosure kit)', 'Fully enclosed + HEPA &amp; Carbon filter', 'Open frame'],
        ],
        costTitle: 'Electricity, Nozzle Speed &amp; Print Cost Impact',
        costBody: 'Large open 420 × 420 mm heated beds (Neptune 4 Max) draw noticeably more wattage to maintain 60–80 °C than compact enclosed 220 mm chambers (AD5M Pro), increasing kWh electricity cost on 20-hour cosplay helmets. Meanwhile, Sovol SV08 pairs a 350 mm square plate with CoreXY 40,000 mm/s² acceleration so heavy functional parts finish hours sooner, keeping machine-hour depreciation low.',
        verdicts: [
          ['Choose Sovol SV08 if:', 'You want a huge 350 mm Voron-style CoreXY with open Klipper firmware and the fastest kinematic ceiling (700 mm/s, 40,000 mm/s²).'],
          ['Choose Flashforge AD5M Pro if:', 'You print indoors/classrooms and need an enclosed, HEPA-filtered, reliable plug-and-play CoreXY for PLA, PETG, and ABS under 220 mm.'],
          ['Choose ELEGOO Neptune 4 Max if:', 'Maximum 420 × 420 × 480 mm height and width for single-piece helmets, props, or architectural molds is non-negotiable.'],
        ],
        faq: [
          { soru: 'Which prints fastest in real multi-hour jobs: SV08, AD5M Pro, or Neptune 4 Max?', cevap: 'Both CoreXY machines (Sovol SV08 at 40,000 mm/s² and AD5M Pro at 20,000 mm/s²) maintain higher real speeds on tall parts than a heavy 420 mm bed-slinger like Neptune 4 Max.' },
          { soru: 'Can Flashforge AD5M Pro print ABS safely indoors?', cevap: 'Yes, its enclosed chamber and dual HEPA/activated-carbon filtration are specifically designed for cleaner indoor ABS/ASA printing.' },
        ],
      },
      fr: {
        title: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max | Baski Hesap',
        desc: 'Comparatif Sovol SV08 (CoreXY 350 mm open-source 700 mm/s), Flashforge Adventurer 5M Pro (caisson HEPA 220 mm) et ELEGOO Neptune 4 Max (géante 420×420×480 mm).',
        crumb: 'SV08 vs AD5M Pro vs Neptune 4 Max',
        rozet: 'Grand Volume &amp; CoreXY · 2026',
        h1: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max : <b>Le Bon Compromis</b>',
        alt: 'CoreXY Voron open-source 350 mm (SV08), caisson filtré HEPA prêt à imprimer (AD5M Pro) ou plateau géant 420×420×480 mm (Neptune 4 Max).',
        stats: ['350 / 220 / 420 mm', '700 / 600 / 500 mm/s', 'Klipper vs Caisson HEPA'],
        specTitle: 'Comparatif Technique Détaillé',
        headers: ['Critère', 'Sovol SV08', 'Flashforge AD5M Pro', 'ELEGOO Neptune 4 Max'],
        rows: [
          ['Volume d’impression', '350 × 350 × 345 mm', '220 × 220 × 220 mm', '420 × 420 × 480 mm'],
          ['Cinématique', 'CoreXY ouverte (architecture Voron)', 'CoreXY fermée', 'Cartésienne (lit mobile)'],
          ['Vitesse / Accél.', '700 mm/s · 40 000 mm/s²', '600 mm/s · 20 000 mm/s²', '500 mm/s (250 rec.) · 8 000 mm/s²'],
          ['Firmware', 'Klipper Vanilla Open Source', 'Propriétaire (Orca-Flashforge)', 'Klipper'],
          ['Temp. Buse Max', '300 °C', '280 °C', '300 °C'],
          ['Caisson &amp; Air', 'Ouverte (kit caisson en option)', 'Fermée + filtres HEPA &amp; Charbon', 'Ouverte'],
        ],
        costTitle: 'Consommation Électrique (0,25 €/kWh) &amp; Productivité',
        costBody: 'Maintenir un lit ouvert de 420 × 420 mm (Neptune 4 Max) à 60–80 °C pendant 24 h consomme sensiblement plus d’électricité qu’une chambre fermée compacte de 220 mm (AD5M Pro). La Sovol SV08 combine un grand plateau carré de 350 mm et une accélération CoreXY de 40 000 mm/s² pour réduire fortement la durée machine.',
        verdicts: [
          ['Choisir la Sovol SV08 si :', 'Vous voulez une grande CoreXY 350 mm inspirée Voron sous Klipper ouvert avec la plus forte accélération.'],
          ['Choisir la Flashforge AD5M Pro si :', 'Vous imprimez en intérieur/bureau et privilégiez un caisson fermé filtré HEPA sans bricolage.'],
          ['Choisir l’ELEGOO Neptune 4 Max si :', 'Le volume XXL 420 × 420 × 480 mm pour casques ou décors en une pièce est prioritaire.'],
        ],
        faq: [
          { soru: 'La Flashforge AD5M Pro convient-elle pour l’ABS en appartement ?', cevap: 'Oui, son enceinte fermée et sa filtration HEPA + charbon actif limitent odeurs et particules.' },
        ],
      },
      ja: {
        title: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max 徹底比較 | Baski Hesap',
        desc: 'Voron系350mm CoreXYのSovol SV08（700mm/s）、HEPA密閉型Flashforge AD5M Pro、420mm超大型ELEGOO Neptune 4 Maxを比較。',
        crumb: 'SV08 vs AD5M Pro vs Neptune 4 Max',
        rozet: '大型・密閉・超高速FDM比較 · 2026',
        h1: 'Sovol SV08 vs Flashforge AD5M Pro vs ELEGOO Neptune 4 Max',
        alt: 'オープンソース350mm CoreXY（SV08）、HEPA密閉型220mm機（AD5M Pro）、420×420×480mm超大型ベッドスリンガー（Neptune 4 Max）の特徴と電気代比較。',
        stats: ['350 / 220 / 420 mm', '700 / 600 / 500 mm/s', 'Klipper vs HEPA密閉'],
        specTitle: '3機種スペック比較表',
        headers: ['比較項目', 'Sovol SV08', 'Flashforge AD5M Pro', 'ELEGOO Neptune 4 Max'],
        rows: [
          ['造形体積', '350 × 350 × 345 mm', '220 × 220 × 220 mm', '420 × 420 × 480 mm'],
          ['駆動方式', 'オープンCoreXY（Voron設計思想）', '密閉型CoreXY', 'ベッドスリンガー'],
          ['最大速度 / 加速度', '700 mm/s · 40,000 mm/s²', '600 mm/s · 20,000 mm/s²', '500 mm/s（推奨250）· 8,000 mm/s²'],
          ['ファームウェア', 'オープンKlipper', '独自（Orca-Flashforge対応）', 'Klipper'],
          ['ノズル上限温度', '300 °C', '280 °C', '300 °C'],
          ['エンクロージャ', 'オープン（別売エンクロージャ対応）', '完全密閉＋HEPA・活性炭フィルター', 'オープン'],
        ],
        costTitle: 'ベッドサイズと電気代・造形時間の違い',
        costBody: '420×420mmの大型加熱ベッド（Neptune 4 Max）は220mm密閉機（AD5M Pro）より保温時の消費電力が高くなりやすく、長時間の大型印刷では31円/kWh環境での電気代に差が出ます。Sovol SV08はCoreXYと40,000 mm/s²により大型造形でも印刷時間を短縮できます。',
        verdicts: [
          ['Sovol SV08が向く方:', '350mmの大画面でオープンKlipper調整と700mm/s級CoreXY速度を求める方。'],
          ['Flashforge AD5M Proが向く方:', '室内・教育現場でHEPA密閉型によりABS等も安全に手軽に出力したい方。'],
          ['ELEGOO Neptune 4 Maxが向く方:', 'ヘルメット等の超大型一体造形（420×420×480mm）が最優先の方。'],
        ],
        faq: [
          { soru: '室内でABSを印刷する場合どれが一番向いていますか？', cevap: '標準で完全密閉構造とHEPA＋活性炭フィルターを備えるFlashforge Adventurer 5M Proが最も適しています。' },
        ],
      },
    },
  },
];

function modelKartHtml(m, kod, tumUrunler, tabanUrl) {
  const ui = UI_KOPYA[kod];
  const canli = Array.isArray(tumUrunler)
    ? tumUrunler.find(u => u && Number(u.enUcuzFiyat) > 0 && m.regex.test(`${u.ad} ${u.slug} ${u.sorgu}`))
    : null;
  const bolge = m.bolge[kod] || m.bolge.en;
  const affUrl = afiliyeLink(bolge.site, bolge.url);
  const aramaHref = `/${kod}?url=${encodeURIComponent(m.sorgu)}`;

  const fiyatSatir = canli
    ? `<div class="seo-mini-fiyat">${formatPara(canli.enUcuzFiyat, canli.paraBirimi)}</div>
       <div class="seo-mini-alt">${htmlKacis(ui.liveBadge)} ${htmlKacis(canli.enUcuzSite || m.marka)}</div>`
    : `<div class="seo-mini-fiyat" style="font-size:16px">${htmlKacis(m.marka)} ${htmlKacis(ui.officialStore)}</div>
       <div class="seo-mini-alt">${htmlKacis(m.sorgu)}</div>`;

  const detayBtn = canli?.yol
    ? `<a class="seo-cta ikincil" style="padding:8px 12px;font-size:13px" href="${htmlKacis(canli.yol)}">${htmlKacis(ui.liveSearch)}</a>`
    : `<a class="seo-cta ikincil" style="padding:8px 12px;font-size:13px" href="${htmlKacis(aramaHref)}">${htmlKacis(ui.liveSearch)}</a>`;

  return `<div class="seo-mini-kart" style="gap:10px">
    <div class="seo-mini-ad">${htmlKacis(m.ad)}</div>
    ${fiyatSatir}
    <div class="seo-butonlar" style="margin-top:auto">
      <a class="seo-cta" style="padding:8px 14px;font-size:13px" href="${htmlKacis(affUrl)}" target="_blank" rel="noopener sponsored nofollow" data-afiliye-site="${htmlKacis(bolge.site)}">${htmlKacis(m.etiket[kod])}</a>
      ${detayBtn}
    </div>
  </div>`;
}

function duelloHtmlOlustur(duello, dil = 'en', tabanUrl = '', tumUrunler = []) {
  const kod = dil === 'fr' ? 'fr' : (dil === 'ja' ? 'ja' : 'en');
  const t = duello.diller[kod];
  const ui = UI_KOPYA[kod];
  const canonicalUrl = `${tabanUrl}${duello.yollar[kod]}`;
  const alternates = { ...duello.yollar, 'x-default': duello.yollar.en };
  const guidesIndex = GLOBAL_REHBER_YOLLARI[kod];
  const malYol = MALIYET_YOLLARI[kod];

  const faqHtml = t.faq.length ? `<section class="seo-kart">
    <h2 style="margin-top:0">${htmlKacis(ui.faqTitle)}</h2>
    ${t.faq.map((q, i) => `<details class="seo-sss-oge"${i === 0 ? ' open' : ''}>
      <summary>${htmlKacis(q.soru)}</summary>
      <p>${htmlKacis(q.cevap)}</p>
    </details>`).join('')}
  </section>` : '';

  const faqJsonLd = t.faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: t.faq.map(q => ({
      '@type': 'Question',
      name: q.soru,
      acceptedAnswer: { '@type': 'Answer', text: q.cevap },
    })),
  } : null;

  return sayfaIskeleti({
    title: t.title,
    description: t.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'article',
    aktifNav: 'rehber',
    dil: kod,
    dilYolHaritasi: alternates,
    jsonLdList: [
      {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: t.title.replace(/ \| Baski Hesap$/, ''),
        description: t.desc,
        inLanguage: kod,
        mainEntityOfPage: canonicalUrl,
        dateModified: new Date().toISOString().slice(0, 10),
        author: { '@type': 'Organization', name: 'Baskı Hesap' },
        publisher: { '@type': 'Organization', name: 'Baskı Hesap' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: ui.home, item: `${tabanUrl}/${kod}` },
          { '@type': 'ListItem', position: 2, name: ui.guides, item: `${tabanUrl}${guidesIndex}` },
          { '@type': 'ListItem', position: 3, name: t.crumb, item: canonicalUrl },
        ],
      },
      ...(faqJsonLd ? [faqJsonLd] : []),
    ],
    govdeHtml: `
      <nav class="seo-yol"><a href="/${kod}">${htmlKacis(ui.home)}</a> › <a href="${htmlKacis(guidesIndex)}">${htmlKacis(ui.guides)}</a> › <span>${htmlKacis(t.crumb)}</span></nav>
      <section class="hero seo-hero">
        <div class="hero-ic">
          <span class="hero-rozet">${t.rozet}</span>
          <h1>${t.h1}</h1>
          <p>${htmlKacis(t.alt)}</p>
          <div class="hero-istatistik">${t.stats.map(s => `<span>${htmlKacis(s)}</span>`).join('')}</div>
        </div>
      </section>
      <section class="seo-kart">
        <div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">
          ${duello.modeller.map(m => modelKartHtml(m, kod, tumUrunler, tabanUrl)).join('')}
        </div>
        <div class="seo-butonlar" style="margin-top:14px">
          <a class="seo-cta ikincil" href="${htmlKacis(malYol)}">${htmlKacis(ui.calcBtn)}</a>
          <a class="seo-cta ikincil" href="${htmlKacis(guidesIndex)}">${htmlKacis(ui.allGuides)}</a>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${htmlKacis(t.specTitle)}</h2>
        <div style="overflow-x:auto">
          <table class="seo-tablo">
            <thead><tr>${t.headers.map(h => `<th>${htmlKacis(h)}</th>`).join('')}</tr></thead>
            <tbody>${t.rows.map(cols => `<tr>${cols.map((c, idx) => `<td>${idx === 0 ? `<b>${c}</b>` : c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${t.costTitle}</h2>
        <p style="margin:0;line-height:1.65">${htmlKacis(t.costBody)}</p>
      </section>
      <section class="seo-kart">
        <h2 style="margin-top:0">${htmlKacis(ui.verdictTitle)}</h2>
        <div class="seo-izgara" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">
          ${t.verdicts.map(([baslik, aciklama]) => `<div class="seo-mini-kart">
            <div class="seo-mini-ad">${htmlKacis(baslik)}</div>
            <div class="seo-mini-alt" style="font-size:13px;line-height:1.55">${htmlKacis(aciklama)}</div>
          </div>`).join('')}
        </div>
      </section>
      ${faqHtml}`,
  });
}

const ROTA_HARITASI = (() => {
  const m = new Map();
  for (const d of DUELLOLAR) {
    for (const [dil, yol] of Object.entries(d.yollar)) {
      m.set(yol, { id: d.id, dil, duello: d });
    }
  }
  return m;
})();

export const GLOBAL_DUELLO_TUM_YOLLAR = [...ROTA_HARITASI.keys()];

export function globalDuelloBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '').toLowerCase();
  const kayit = ROTA_HARITASI.get(temiz);
  if (!kayit) return null;
  return {
    id: kayit.id,
    dil: kayit.dil,
    olustur: (tabanUrl = '', tumUrunler = []) => duelloHtmlOlustur(kayit.duello, kayit.dil, tabanUrl, tumUrunler),
  };
}

export function globalDuelloAlternatifHaritasi() {
  const out = {};
  for (const d of DUELLOLAR) {
    const alternates = { ...d.yollar, 'x-default': d.yollar.en };
    for (const yol of Object.values(d.yollar)) {
      out[yol] = alternates;
    }
  }
  return out;
}

export function globalDuelloSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const liste = [];
  for (const d of DUELLOLAR) {
    const alternates = { ...d.yollar, 'x-default': d.yollar.en };
    for (const [lang, yol] of Object.entries(d.yollar)) {
      liste.push({ dil: lang, yol, oncelik: '0.85', siklik: 'weekly', lastmod: bugun, alternates });
    }
  }
  if (!dil) return liste;
  return liste.filter(x => x.dil === dil);
}
