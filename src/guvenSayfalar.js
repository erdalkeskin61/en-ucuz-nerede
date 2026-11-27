/**
 * Güven, Şeffaflık, Gizlilik & İletişim Sayfaları (TR / EN / FR / JA) — 2026-11-27
 *
 * Amaç: Ziyaretçiler, arama motorları (Google E-E-A-T) ve iş ortaklığı ağları
 * (Awin, Impact, Amazon Associates, eBay Partner Network vb.) için açık kimlik,
 * veri gizliliği, şeffaf fiyatlandırma metodolojisi, affiliate açıklaması ve
 * kurumsal iletişim (info@baskihesap.tech) sayfaları sunar.
 */
import { htmlKacis, sayfaIskeleti, navYollariGetir } from './seoSayfalar.js';
import { normalizeDil, sozlukGetir } from './i18n/index.js';

export const KURUMSAL_EPOSTA = 'info@baskihesap.tech';

export const GUVEN_YOLLARI = Object.freeze({
  hakkimizda: Object.freeze({
    tr: '/hakkimizda',
    en: '/en/about',
    fr: '/fr/a-propos',
    ja: '/ja/about',
  }),
  gizlilik: Object.freeze({
    tr: '/gizlilik',
    en: '/en/privacy',
    fr: '/fr/confidentialite',
    ja: '/ja/privacy',
  }),
  iletisim: Object.freeze({
    tr: '/iletisim',
    en: '/en/contact',
    fr: '/fr/contact',
    ja: '/ja/contact',
  }),
});

const KOPYA = Object.freeze({
  hakkimizda: {
    tr: {
      title: 'Hakkımızda & Metodoloji — Baskı Hesap (baskihesap.tech)',
      desc: 'Baskı Hesap, 3D yazıcı, filament, reçine ve yedek parça fiyatlarını kargo dahil ve birim kg/L bazında şeffaf biçimde karşılaştıran bağımsız bir platformdur.',
      schemaType: 'AboutPage',
      crumb: 'Hakkımızda',
      rozet: 'Bağımsız 3D Baskı Karşılaştırma & Maliyet Platformu',
      h1: 'Baskı Hesap Hakkında',
      giris: 'Baskı Hesap (<b>baskihesap.tech</b>), Türkiye, ABD, Avrupa (FR/EU) ve Japonya pazarlarındaki resmi 3D yazıcı üreticileri ile uzman mağazaların fiyatlarını <b>gerçek ödeme tutarı</b> üzerinden şeffaf biçimde karşılaştıran bağımsız bir yazılım projesidir.',
      bolumler: [
        {
          baslik: 'Fiyatları Nasıl Karşılaştırıyoruz?',
          maddeler: [
            '<b>Kargo dahil gerçek tutar:</b> Yalnızca vitrin/etiket fiyatını değil, mağazanın bilinen kargo ücretini, ücretsiz kargo eşiklerini ve herkesin erişebildiği genel indirimleri hesaba katarız.',
            '<b>Stok disiplini:</b> Tükenen ürünler en ucuz olarak gösterilmez; stoktaki en uygun seçenek her zaman öne çıkarılır.',
            '<b>Birim fiyat normalizasyonu (₺/kg, $/kg, €/kg, ¥/kg):</b> Farklı makara gramajları (250 g, 500 g, 1 kg, 2.5 kg, 1 L reçine) otomatik normalize edilir.',
            '<b>Model & yedek parça ayrımı:</b> Yazıcı aramalarında nozzle, hotend, anakart gibi yedek parçalar ve farklı renk varyantları ana karşılaştırmayı bozmaması için ayrıştırılır.',
          ],
        },
        {
          baslik: 'Tarayıcı İçi STL / 3MF & Slicer Araçları',
          maddeler: [
            '<b>Sıfır yükleme garantisi:</b> STL/3MF maliyet hesaplayıcı ve G-Code okuyucu tamamen kullanıcının kendi tarayıcısında çalışır; 3D modelleriniz sunucuya yüklenmez.',
            '<b>Slicer entegrasyonu:</b> Cura, OrcaSlicer, Bambu Studio ve PrusaSlicer için açık kaynaklı/ücretsiz eklenti ile dilimleme sonrası parça başına malzeme maliyetini anında görebilirsiniz.',
          ],
        },
        {
          baslik: 'Editoryal Bağımsızlık & İşletici Bilgisi',
          paragraflar: [
            'Platform <b>Erdal Keskin</b> tarafından geliştirilmekte ve işletilmektedir. Sitedeki sıralama ve "en ucuz" seçimi hiçbir mağaza veya satış ortaklığı anlaşması tarafından değiştirilmez.',
            `Mağaza ekleme, veri doğrulama veya iş birliği talepleri için resmi adresimiz: <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>.`,
          ],
        },
      ],
    },
    en: {
      title: 'About & Methodology — Baski Hesap (baskihesap.tech)',
      desc: 'Learn how Baski Hesap compares 3D printer, filament, and resin checkout totals transparently with normalized $/kg pricing and local browser STL tools.',
      schemaType: 'AboutPage',
      crumb: 'About Us',
      rozet: 'Independent 3D Printing Comparison & Cost Platform',
      h1: 'About Baski Hesap',
      giris: 'Baski Hesap (<b>baskihesap.tech</b>) is an independent 3D printing price comparison platform and maker toolkit built to surface <b>true checkout prices</b> across verified official manufacturers and specialty stores in the US, Europe, Japan, and Turkey.',
      bolumler: [
        {
          baslik: 'How Our Price Engine Works',
          maddeler: [
            '<b>Checkout-inclusive totals:</b> Beyond headline prices, we account for known store shipping fees, free-shipping thresholds, and publicly available discounts.',
            '<b>In-stock accuracy:</b> Out-of-stock listings are excluded from lowest-price winner selection so recommendations remain purchasable.',
            '<b>Unit-price normalization ($/kg, €/kg, ¥/kg):</b> Spools of different weights (250 g, 500 g, 1 kg, multi-packs) and resins are normalized cleanly for fair comparisons.',
            '<b>Variant & spare-part separation:</b> Printers are separated from nozzles, hotends, and boards, and mismatched filament colors do not distort rankings.',
          ],
        },
        {
          baslik: 'Zero-Upload STL/3MF Cost & Slicer Tools',
          maddeler: [
            '<b>100% client-side geometry parsing:</b> Our STL/3MF weight calculator and G-Code parser run entirely inside your browser—your 3D files are never uploaded to any server.',
            '<b>Desktop slicer workflow:</b> Free post-processing integration for Cura, OrcaSlicer, Bambu Studio, and PrusaSlicer.',
          ],
        },
        {
          baslik: 'Editorial Independence & Operator',
          paragraflar: [
            'Baski Hesap is developed and operated by <b>Erdal Keskin</b>. Merchant partnerships or affiliate links never influence product rankings, price sorting, or lowest-price selection.',
            `For merchant onboarding, editorial inquiries, or feedback, contact us at <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>.`,
          ],
        },
      ],
    },
    fr: {
      title: 'À propos & Méthodologie — Baski Hesap (baskihesap.tech)',
      desc: 'Découvrez comment Baski Hesap compare les prix réels livraison incluse des imprimantes 3D et filaments au €/kg avec calculateur STL local.',
      schemaType: 'AboutPage',
      crumb: 'À propos',
      rozet: 'Comparateur Indépendant Impression 3D & Coûts',
      h1: 'À propos de Baski Hesap',
      giris: 'Baski Hesap (<b>baskihesap.tech</b>) est une plateforme indépendante de comparaison de prix et de calcul de coûts dédiée à l’impression 3D en France, en Europe, aux États-Unis, au Japon et en Turquie.',
      bolumler: [
        {
          baslik: 'Notre méthode de comparaison',
          maddeler: [
            '<b>Prix réel port inclus :</b> Nous intégrons les frais de livraison connus, les seuils de franco de port et les remises publiques accessibles à tous.',
            '<b>Ruptures exclues :</b> Seuls les articles réellement en stock peuvent être mis en avant comme meilleur prix.',
            '<b>Coût normalisé au €/kg :</b> Les bobines de 250 g, 500 g, 1 kg ou lots multiples sont ramenées au prix par kilogramme.',
            '<b>Séparation pièces détachées :</b> Les buses, hotends et cartes mères sont séparés des imprimantes complètes.',
          ],
        },
        {
          baslik: 'Outils STL / 3MF et Slicer 100 % locaux',
          maddeler: [
            '<b>Confidentialité totale :</b> L’analyse des fichiers STL, 3MF et G-Code s’effectue intégralement dans votre navigateur sans aucun téléversement vers nos serveurs.',
          ],
        },
        {
          baslik: 'Indépendance éditoriale & Éditeur',
          paragraflar: [
            'Le site est conçu et géré par <b>Erdal Keskin</b>. Aucun partenariat d’affiliation ne modifie le classement des offres ni la transparence des prix.',
            `Contact professionnel et presse : <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>.`,
          ],
        },
      ],
    },
    ja: {
      title: '運営情報・比較ロジック — Baski Hesap (baskihesap.tech)',
      desc: 'Baski Hesapの3Dプリンター・フィラメント実質価格比較ロジック、単位価格(¥/kg)算出、ブラウザ完結STL原価計算ツールについて。',
      schemaType: 'AboutPage',
      crumb: 'サイトについて',
      rozet: '独立系 3Dプリント価格比較＆原価計算プラットフォーム',
      h1: 'Baski Hesap について',
      giris: 'Baski Hesap（<b>baskihesap.tech</b>）は、日本・米国・欧州・トルコの公式3Dプリンターメーカーおよび専門ストアの在庫状況・送料を含めた<b>実質支払額</b>を比較できる独立系プラットフォームです。',
      bolumler: [
        {
          baslik: '価格比較と公平性の基準',
          maddeler: [
            '<b>送料込みの実質価格:</b> 本体価格だけでなく各ストアの送料条件・送料無料ライン・一般割引を加味して比較します。',
            '<b>在庫ありのみ最安判定:</b> 在庫切れ商品は最安値ランキングから除外されます。',
            '<b>単位価格 (¥/kg) 正規化:</b> 内容量の異なるスプールやレジンを1kgあたりに換算して比較します。',
          ],
        },
        {
          baslik: 'ブラウザ完結 STL / 3MF・スライサー連携',
          maddeler: [
            '<b>サーバー送信ゼロ:</b> STL / 3MF原価計算およびG-Code解析はお使いのブラウザ内のみで処理され、3Dデータが外部へアップロードされることはありません。',
          ],
        },
        {
          baslik: '運営者情報・お問い合わせ',
          paragraflar: [
            '本サービスは <b>Erdal Keskin</b> により開発・運営されています。アフィリエイト提携の有無によって価格や順位が操作されることはありません。',
            `お問い合わせ・掲載希望ストアのご連絡先: <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>`,
          ],
        },
      ],
    },
  },
  gizlilik: {
    tr: {
      title: 'Gizlilik Politikası & Satış Ortaklığı Açıklaması — Baskı Hesap',
      desc: 'Baskı Hesap gizlilik politikası, çerez kullanımı, tarayıcı içi STL dosya gizliliği ve şeffaf satış ortaklığı (affiliate) bildirimi.',
      schemaType: 'WebPage',
      crumb: 'Gizlilik & Şeffaflık',
      rozet: 'KVKK / GDPR & Satış Ortaklığı Şeffaflığı',
      h1: 'Gizlilik Politikası &amp; Satış Ortaklığı Açıklaması',
      giris: 'Kullanıcı gizliliği ve ticari şeffaflık Baskı Hesap’ın (<b>baskihesap.tech</b>) temel çalışma ilkesidir. Son güncelleme: 2026-11-27.',
      bolumler: [
        {
          baslik: 'Satış Ortaklığı (Affiliate) Açıklaması',
          paragraflar: [
            '<b>baskihesap.tech</b> üzerindeki mağaza bağlantılarının bir kısmı; <b>Impact.com</b> (Creality, ELEGOO, Snapmaker, Flashforge, Sovol, HeyGears vb.), <b>Amazon Associates</b>, <b>eBay Partner Network</b>, <b>Awin</b> veya yerel/doğrudan mağaza iş ortaklığı programları kapsamında referans parametreleri içerebilir.',
            'Bu bağlantılar üzerinden alışveriş yaptığınızda size <b>hiçbir ek maliyet yüklenmez</b>; platform bu sayede ücretsiz sunulur. Hiçbir iş ortaklığı ücreti veya komisyon oranı mağaza sıralamasını, fiyatı ya da en ucuz öneriyi etkilemez.',
          ],
        },
        {
          baslik: 'Toplanan ve Toplanmayan Veriler',
          maddeler: [
            '<b>Üyelik / kişisel hesap zorunluluğu yoktur:</b> Fiyat karşılaştırma, maliyet hesaplayıcı ve sepet optimizeri kayıt olmadan çalışır.',
            '<b>3D modeller ve G-Code gizliliği:</b> Yüklediğiniz <code>.stl</code>, <code>.3mf</code> veya <code>.gcode</code> dosyaları sunucuya aktarılmaz, yalnızca tarayıcınızın belleğinde ayrıştırılır.',
            '<b>Tarayıcı depolama & çerezler:</b> Tema tercihiniz, akıllı sepet öğeleriniz ve dil seçiminiz (<code>bh_lang</code>) cihazınızda saklanır.',
            '<b>Bildirim & alarm:</b> Fiyat alarmı veya Web Push aboneliği yalnızca sizin açık onayınızla tarayıcınızdan alınan anonim push anahtarını kaydeder ve istediğiniz an kapatılabilir.',
            '<b>Analitik & güvenlik:</b> Trafik istatistikleri ve DDoS koruması için Cloudflare ve yapılandırılmışsa Google Analytics (GA4) kullanılabilir.',
          ],
        },
        {
          baslik: 'Haklarınız & Veri Talepleri',
          paragraflar: [
            `Kişisel veri, çerez, KVKK/GDPR veya içerik kaldırma talepleriniz için doğrudan <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a> adresine yazabilirsiniz.`,
          ],
        },
      ],
    },
    en: {
      title: 'Privacy Policy & Affiliate Disclosure — Baski Hesap',
      desc: 'Privacy policy, cookie notice, client-side STL processing guarantee, and FTC-compliant affiliate disclosure for baskihesap.tech.',
      schemaType: 'WebPage',
      crumb: 'Privacy & Disclosure',
      rozet: 'Privacy, Cookies & Affiliate Compliance',
      h1: 'Privacy Policy &amp; Affiliate Disclosure',
      giris: 'We respect your privacy and operate with full commercial transparency across <b>baskihesap.tech</b>. Last updated: November 27, 2026.',
      bolumler: [
        {
          baslik: 'Affiliate & Partner Disclosure',
          paragraflar: [
            'Some outbound merchant links on <b>baskihesap.tech</b> contain affiliate tracking parameters through networks and direct brand programs including <b>Impact.com</b> (such as Creality, ELEGOO, Snapmaker, Flashforge, Sovol, and HeyGears), <b>Amazon Associates</b>, <b>eBay Partner Network</b>, <b>Awin</b>, and direct store referral programs.',
            'When you click an outbound store link and complete a purchase, Baski Hesap may earn a small commission at <b>zero additional cost to you</b>. Affiliate partnerships never alter listed prices, ranking logic, or lowest-price selection.',
          ],
        },
        {
          baslik: 'Data & File Privacy',
          maddeler: [
            '<b>No mandatory accounts:</b> All price comparison, cost estimation, and basket optimization tools work without user registration.',
            '<b>Zero server upload for 3D files:</b> Any <code>.stl</code>, <code>.3mf</code>, or <code>.gcode</code> files dropped into our calculators are processed locally in browser memory and are never uploaded to our servers.',
            '<b>Local storage & essential cookies:</b> We store theme preference, recent searches, basket links locally on your device, plus a language cookie (<code>bh_lang</code>) to keep your chosen regional edition.',
            '<b>Optional Web Push alerts:</b> Device price alerts store only your browser push subscription endpoint after explicit permission and can be revoked anytime.',
            '<b>Security & analytics:</b> Standard server logs, security edge protection, and optional privacy-respecting usage telemetry (Google Analytics if enabled) help keep service reliable and prevent abuse.',
          ],
        },
        {
          baslik: 'GDPR / CCPA / Data Requests',
          paragraflar: [
            `If you have any privacy questions, data deletion requests, or compliance inquiries, please contact <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>.`,
          ],
        },
      ],
    },
    fr: {
      title: 'Politique de confidentialité & Affiliation — Baski Hesap',
      desc: 'Politique de confidentialité RGPD, gestion des cookies, traitement local STL sans envoi et transparence des liens affiliés sur baskihesap.tech.',
      schemaType: 'WebPage',
      crumb: 'Confidentialité & Affiliation',
      rozet: 'Conformité RGPD & Transparence Affiliation',
      h1: 'Politique de confidentialité &amp; Affiliation',
      giris: 'Baski Hesap (<b>baskihesap.tech</b>) applique les principes de minimisation des données et de transparence commerciale. Dernière mise à jour : 27 novembre 2026.',
      bolumler: [
        {
          baslik: 'Transparence sur les liens d’affiliation',
          paragraflar: [
            'Certains liens marchands sortants sur <b>baskihesap.tech</b> contiennent des paramètres de suivi affilié (<b>Impact.com</b> dont Creality, ELEGOO, Snapmaker, Flashforge, Sovol, HeyGears, ainsi que <b>Amazon Partenaires</b>, <b>eBay Partner Network</b>, <b>Awin</b> ou programmes directs).',
            'Ces commissions n’entraînent <b>aucun surcoût pour l’acheteur</b> et ne modifient jamais le prix affiché ni l’ordre de classement des boutiques.',
          ],
        },
        {
          baslik: 'Données personnelles & fichiers 3D',
          maddeler: [
            '<b>Sans création de compte :</b> Tous les comparateurs et calculateurs fonctionnent librement sans inscription.',
            '<b>Fichiers STL/3MF/G-Code 100 % locaux :</b> Vos modèles ne quittent jamais votre navigateur.',
            '<b>Cookies & stockage local :</b> Seuls la préférence linguistique (<code>bh_lang</code>), le thème et votre panier local sont mémorisés sur votre appareil (avec mesure d’audience anonymisée si activée).',
          ],
        },
        {
          baslik: 'Vos droits (RGPD)',
          paragraflar: [
            `Pour toute demande d’information ou de suppression de données : <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>.`,
          ],
        },
      ],
    },
    ja: {
      title: 'プライバシーポリシー・アフィリエイト表記 — Baski Hesap',
      desc: 'baskihesap.techのプライバシーポリシー、Cookie利用、ブラウザ内STL処理保証、およびアフィリエイト提携の透明性ポリシー。',
      schemaType: 'WebPage',
      crumb: 'プライバシー・開示表記',
      rozet: 'プライバシー保護・アフィリエイト透明性ポリシー',
      h1: 'プライバシーポリシー・アフィリエイト表記',
      giris: 'Baski Hesap（<b>baskihesap.tech</b>）における個人データの取り扱いおよび広告・アフィリエイト提携に関する方針です。（最終更新: 2026年11月27日）',
      bolumler: [
        {
          baslik: 'アフィリエイトプログラムに関する表記',
          paragraflar: [
            '<b>baskihesap.tech</b> 内の一部ストアリンクには、<b>Impact.com</b>（Creality、ELEGOO、Snapmaker、Flashforge、Sovol、HeyGears等）、<b>Amazonアソシエイト</b>、<b>eBay Partner Network</b>、<b>Awin</b>、または各メーカー公式紹介プログラムのトラッキングパラメータが含まれる場合があります。',
            '紹介リンク経由で購入されても<b>購入者の支払額が増えることはなく</b>、提携の有無によって価格順や最安値判定が変更されることも一切ありません。',
          ],
        },
        {
          baslik: 'データおよび3Dファイルの取り扱い',
          maddeler: [
            '<b>登録不要:</b> アカウント登録や個人情報の入力なしですべての比較・原価ツールを利用できます。',
            '<b>3Dデータの非送信:</b> STL / 3MF / G-Code ファイルはブラウザ内のみで解析され、サーバーへ送信・保存されません。',
            '<b>Cookie・ローカル保存:</b> 言語設定（<code>bh_lang</code>）・表示テーマ・カート機能のみ端末内に保存されます。',
          ],
        },
        {
          baslik: 'お問い合わせ窓口',
          paragraflar: [
            `プライバシーやデータ削除に関するお問い合わせ: <a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>`,
          ],
        },
      ],
    },
  },
  iletisim: {
    tr: {
      title: 'İletişim & Mağaza İş Birliği — Baskı Hesap',
      desc: 'Baskı Hesap resmi iletişim sayfası: mağaza ekleme, affiliate iş birlikleri, hatalı fiyat/stok bildirimi için info@baskihesap.tech.',
      schemaType: 'ContactPage',
      crumb: 'İletişim',
      rozet: 'Resmi İletişim & İş Ortaklığı',
      h1: 'İletişim',
      giris: 'Mağaza ekleme, satış ortaklığı (affiliate) programları, hatalı fiyat/stok bildirimi ve genel sorularınız için doğrudan bizimle iletişime geçebilirsiniz.',
      bolumler: [
        {
          baslik: 'Doğrudan E-posta',
          paragraflar: [
            `Resmi kurumsal e-posta adresimiz: <b><a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a></b>`,
            'Platform Sahibi & Geliştirici: <b>Erdal Keskin</b> · Alan adı: <b>https://baskihesap.tech</b>',
          ],
        },
        {
          baslik: 'Hangi Konularda Yazabilirsiniz?',
          maddeler: [
            '<b>Satış ortaklığı & mağaza entegrasyonu:</b> Awin, Impact, Admitad, GelirOrtakları, Shopify Collabs veya kendi mağazanızın XML/API beslemesini bağlamak için.',
            '<b>Hatalı eşleşme veya fiyat/kargo bildirimi:</b> Yanlış ürün eşleşmesi, değişen kargo ücreti ya da stok düzeltmesi talepleri için.',
            '<b>Basın, gömülü widget (`/widget`) ve topluluk geri bildirimi.</b>',
          ],
        },
      ],
    },
    en: {
      title: 'Contact & Partnerships — Baski Hesap',
      desc: 'Official contact page for Baski Hesap (baskihesap.tech). Reach Erdal Keskin at info@baskihesap.tech for merchant partnerships, affiliate networks, or support.',
      schemaType: 'ContactPage',
      crumb: 'Contact',
      rozet: 'Official Contact & Merchant Onboarding',
      h1: 'Contact Us',
      giris: 'Have a question about merchant listings, affiliate partnerships (Awin, Impact, direct programs), price accuracy, or feature requests? Reach us directly below.',
      bolumler: [
        {
          baslik: 'Direct Email & Ownership',
          paragraflar: [
            `Official email: <b><a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a></b>`,
            'Founder & Operator: <b>Erdal Keskin</b> · Website: <b>https://baskihesap.tech</b>',
          ],
        },
        {
          baslik: 'How Can We Help?',
          maddeler: [
            '<b>Merchant & Affiliate Partnerships:</b> Onboarding 3D printer, filament, or resin stores via feed, API, Impact, Awin, or direct referral.',
            '<b>Listing & Shipping Corrections:</b> Reporting mismatched models, outdated shipping thresholds, or store availability issues.',
            '<b>Compliance, Privacy & Embeds:</b> Inquiries regarding GDPR/privacy compliance or embedding our live price widget.',
          ],
        },
      ],
    },
    fr: {
      title: 'Contact & Partenariats — Baski Hesap',
      desc: 'Contact officiel Baski Hesap (baskihesap.tech) — partenariats marchands, affiliation et support via info@baskihesap.tech.',
      schemaType: 'ContactPage',
      crumb: 'Contact',
      rozet: 'Contact Officiel & Partenariats',
      h1: 'Contact',
      giris: 'Pour proposer une boutique française/européenne, discuter d’un programme d’affiliation (Impact, Awin, direct) ou signaler une erreur de prix, écrivez-nous directement.',
      bolumler: [
        {
          baslik: 'Adresse e-mail officielle',
          paragraflar: [
            `Contact direct : <b><a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a></b>`,
            'Éditeur : <b>Erdal Keskin</b> · Site : <b>https://baskihesap.tech</b>',
          ],
        },
        {
          baslik: 'Sujets traités',
          maddeler: [
            '<b>Boutiques & Affiliation :</b> Intégration de catalogues 3D ou partenariats marchands.',
            '<b>Qualité des données :</b> Signalement d’un tarif, d’un seuil de livraison ou d’un modèle mal associé.',
          ],
        },
      ],
    },
    ja: {
      title: 'お問い合わせ — Baski Hesap',
      desc: 'Baski Hesap (baskihesap.tech) へのお問い合わせ、ストア掲載・アフィリエイト提携のご相談は info@baskihesap.tech まで。',
      schemaType: 'ContactPage',
      crumb: 'お問い合わせ',
      rozet: '公式お問い合わせ・パートナー窓口',
      h1: 'お問い合わせ',
      giris: '対応ストアの追加要望、アフィリエイト提携（Impact / Awin / Amazon等）、価格・送料情報の修正依頼は下記までご連絡ください。',
      bolumler: [
        {
          baslik: '公式メールアドレス',
          paragraflar: [
            `連絡先メール: <b><a href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a></b>`,
            '運営責任者: <b>Erdal Keskin</b> · サイト: <b>https://baskihesap.tech</b>',
          ],
        },
        {
          baslik: '主な受付内容',
          maddeler: [
            '<b>ストア掲載・提携のご相談:</b> 3Dプリンター・フィラメント販売店の追加や提携プログラム連携。',
            '<b>掲載情報の修正:</b> 型番の誤一致・送料条件の変更・在庫情報の修正依頼。',
          ],
        },
      ],
    },
  },
});

export function guvenSayfasiHtml(tur, dil = 'tr', tabanUrl = '') {
  const kod = normalizeDil(dil);
  const icerik = KOPYA[tur]?.[kod] || KOPYA[tur]?.en;
  if (!icerik) return null;
  const harita = GUVEN_YOLLARI[tur];
  const sz = sozlukGetir(kod);
  const nav = navYollariGetir(kod);
  const canonicalUrl = `${tabanUrl}${harita[kod]}`;

  const bolumHtml = icerik.bolumler.map(b => `
    <section class="seo-kart">
      <h2 style="margin-top:0">${b.baslik}</h2>
      ${Array.isArray(b.paragraflar) ? b.paragraflar.map(p => `<p class="seo-alt">${p}</p>`).join('') : ''}
      ${Array.isArray(b.maddeler) ? `<ul style="margin:0;padding-left:20px;line-height:1.7;color:var(--metin);font-size:14.5px">${b.maddeler.map(m => `<li style="margin-bottom:8px">${m}</li>`).join('')}</ul>` : ''}
    </section>`).join('');

  const altLinkler = `
    <section class="seo-kart">
      <div class="seo-ic-linkler">
        <a class="seo-ic-link" href="${htmlKacis(GUVEN_YOLLARI.hakkimizda[kod])}">${htmlKacis(KOPYA.hakkimizda[kod].crumb)}</a>
        <a class="seo-ic-link" href="${htmlKacis(GUVEN_YOLLARI.gizlilik[kod])}">${htmlKacis(KOPYA.gizlilik[kod].crumb)}</a>
        <a class="seo-ic-link" href="${htmlKacis(GUVEN_YOLLARI.iletisim[kod])}">${htmlKacis(KOPYA.iletisim[kod].crumb)}</a>
        <a class="seo-ic-link" href="mailto:${KURUMSAL_EPOSTA}">${KURUMSAL_EPOSTA}</a>
      </div>
    </section>`;

  const govdeHtml = `
    <nav class="seo-yol" aria-label="Breadcrumb">
      <a href="${htmlKacis(nav.ana)}">${htmlKacis(sz.nav.anaSayfa)}</a> › <span>${htmlKacis(icerik.crumb)}</span>
    </nav>
    <section class="seo-kart">
      <span class="hero-rozet" style="color:var(--ana);background:var(--ana-acik);border-color:var(--cizgi);margin-bottom:10px">${htmlKacis(icerik.rozet)}</span>
      <h1 class="seo-baslik" style="margin-top:4px">${icerik.h1}</h1>
      <p class="seo-alt" style="margin-bottom:0">${icerik.giris}</p>
    </section>
    ${bolumHtml}
    ${altLinkler}
  `;

  const jsonLdList = [
    {
      '@context': 'https://schema.org',
      '@type': icerik.schemaType,
      name: icerik.title,
      description: icerik.desc,
      url: canonicalUrl,
      inLanguage: kod,
      publisher: {
        '@type': 'Organization',
        name: 'Baski Hesap',
        url: tabanUrl || 'https://baskihesap.tech',
        email: KURUMSAL_EPOSTA,
        founder: { '@type': 'Person', name: 'Erdal Keskin' },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: sz.nav.anaSayfa, item: `${tabanUrl}${nav.ana}` },
        { '@type': 'ListItem', position: 2, name: icerik.crumb, item: canonicalUrl },
      ],
    },
  ];

  return sayfaIskeleti({
    title: icerik.title,
    description: icerik.desc,
    canonicalUrl,
    ogImage: `${tabanUrl}/og-gorsel.png`,
    ogType: 'website',
    jsonLdList,
    govdeHtml,
    aktifNav: 'karsilastir',
    dil: kod,
    dilYolHaritasi: harita,
  });
}

const ROTA_HARITASI = (() => {
  const map = new Map();
  for (const [tur, harita] of Object.entries(GUVEN_YOLLARI)) {
    for (const [dil, yol] of Object.entries(harita)) {
      map.set(yol, { tur, dil, olustur: (tabanUrl) => guvenSayfasiHtml(tur, dil, tabanUrl) });
    }
  }
  return map;
})();

export function guvenSayfasiBul(yol) {
  const temiz = String(yol || '').replace(/\/+$/, '').toLowerCase() || '/';
  return ROTA_HARITASI.get(temiz) || null;
}

export function guvenSayfaSitemapKayitlari(dil = null) {
  const bugun = new Date().toISOString().slice(0, 10);
  const hedefler = dil ? [normalizeDil(dil)] : ['tr', 'en', 'fr', 'ja'];
  const liste = [];
  for (const [tur, harita] of Object.entries(GUVEN_YOLLARI)) {
    const alternates = { ...harita, 'x-default': harita.en };
    for (const d of hedefler) {
      if (!harita[d]) continue;
      liste.push({
        dil: d,
        yol: harita[d],
        oncelik: tur === 'hakkimizda' ? '0.6' : '0.5',
        siklik: 'monthly',
        lastmod: bugun,
        alternates,
      });
    }
  }
  return liste;
}
