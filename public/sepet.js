/**
 * 🧺 Akıllı Sepet & Kargo Sihirbazı — istemci (2026-11-08)
 *
 * Akış:
 *  1) Hazır paket → canlı filament kataloğundan gerçek ürünlerle sepete eklenir.
 *  2) Kullanıcı ürün arar (gerçek linkli öneriler) veya link yapıştırır.
 *  3) POST /api/sepet ile iş başlar; GET /api/sepet/:id ile ilerleme izlenir.
 *  4) 3 senaryo kartı (A/B/C) + tasarruf bandı + kargo kurtarıcı çizilir.
 *
 * Sepet localStorage'da tutulur; sayfa yenilenince kaybolmaz.
 * Tüm para/senaryo matematiği `public/sepetHesap.js` içinde (test edilebilir).
 */
import {
  para, yuzde, senaryoListesi, onerilenAnahtar, senaryoFarki, tasarrufOzeti,
  kargoFirsati, tamamlayiciEtkisi, paketCoz, paketCevir, PAKETLER, turkceAblatif,
  sepetNormalize, sepetDogrula, sepetToplami, sepetIstekGovdesi,
  MAKS_URUN, kiyasVerisi, paketKargoDurumu,
} from '/sepetHesap.js';

const $ = (s) => document.querySelector(s);
const ORTAM = (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM) || {};
const ORTAM_MARKET = ORTAM.market || 'tr';
const ORTAM_DIL = ORTAM.dil || 'tr';
const SP = {
  tr: {
    isimleAra: '🔎 İsimle arama', link: '🔗 Link', paketten: ' · 🎨 paketten',
    adetAria: 'Adet', azalt: 'Adedi azalt', artir: 'Adedi artır', cikar: 'Ürünü sepetten çıkar',
    kargoSonra: 'Kargo, seçilen senaryoya göre ayrıca hesaplanır',
    kargoDegisir: 'Kargo seçilen senaryoya göre değişir',
    maksUrun: (n) => `Sepet en fazla ${n} ürün alabilir.`,
    stoktaYok: '⚠️ Şu an stokta yok:', yerine: 'yerine',
    katalogBos: 'Canlı katalogda uygun ürün yok',
    paketEkleBtn: '+ Paketi Sepete Ekle', urunBulunamadi: 'Ürün bulunamadı',
    canliTeklif: (n) => `${n} canlı filament teklifi okundu. Fiyatlar radar taramasından gelir.`,
    katalogOkunamadi: 'Canlı filament kataloğu okunamadı; paketler şu an eklenemiyor. Ürün arayarak devam edebilirsiniz.',
    paketYetersiz: 'Bu paket için yeterli ürün bulunamadı. Ürün arayarak ekleyebilirsiniz.',
    paketEklendi: (ad, n) => `✅ ${ad} eklendi (${n} ürün)`,
    eksik: 'eksik', degisim: 'değişim',
    paketToast: (ad) => `🎨 ${ad} sepete eklendi`,
    sonuc: 'Sonuç', linkEklendi: '✅ Link sepete eklendi.',
    linkHata: '⚠️ Geçerli bir ürün linki yapıştırın.',
    isimleEkleEtiket: 'İsimle ara ve sepete ekle',
    ucHarf: 'En az 3 harfli ürün adı yazın ya da ürün linki yapıştırın.',
    ikiHarf: 'En az 2 harfli ürün adı yazın ya da ürün linki yapıştırın.',
    urunYaz: 'Ürün adı yazın ya da ürün linki yapıştırın.',
    linkliBulundu: (n) => `${n} linkli ürün bulundu — seçebilir veya doğrudan isimle ekleyebilirsiniz.`,
    eslesmeYok: 'Öneride doğrudan eşleşme çıkmadı — "İsimle ara ve sepete ekle" ile ekleyebilirsiniz.',
    sEklendi: (s) => `✅ "${s}" sepete eklendi.`,
    sToast: (s) => `🛒 "${s}" sepete eklendi`,
    senaryoHesap: '🧮 Senaryolar hesaplanıyor…',
    tarandi: (b, t) => `🔎 ${b}/${t} ürün tarandı`,
    enUcuz: 'en ucuz',
    magazaAc: 'Mağazayı Aç ➔',
    magazadanAl: (ad) => `⚡ ${ad}${turkceAblatif(ad)} Al ➔`,
    cokMagazaAl: (n) => `🏪 ${n} Mağazadan Satın Al ➔`,
    senaryoMeta: (u, s) => `${u} ürün · ${s} aday mağaza`,
    kurulamadi: 'Bu senaryo bu sepet için kurulamadı (hiçbir mağaza tüm ürünleri birlikte satmıyor).',
    pahali: (t) => `⚠️ Kargo/dağıtım yüzünden <b>${t}</b> daha pahalı`,
    esitEnDusuk: '💡 En düşük toplam maliyet (eşit)',
    enDusuk: '💡 En düşük toplam maliyet',
    onerilen: 'ÖNERİLEN', magazaTekil: '🏪', magazaCoklu: (n) => `🏪 ${n} mağaza`,
    urunler: 'Ürünler', kupon: 'Kupon', kargo: 'Kargo', toplam: 'TOPLAM',
    gonderim: (n) => `(${n} gönderim)`, kargoBelirsiz: '⚠️ Sepette belli', kargoBedava: 'Bedava (eşik aşıldı)',
    linkYokToast: 'Bu senaryoda açılacak ürün bağlantısı yok.',
    sekmeAciliyor: (n, adlar) => `🛒 ${n} ürün sekmesi açılıyor: ${adlar}`,
    popupEngel: 'Tarayıcı yeni sekmeleri engelledi. Aşağıdaki ürün linklerine tek tek dokunabilirsiniz.',
    kargoKaldi: (t) => `💡 Kargoya <b>${t}</b> kaldı`,
    kargoMesaj: (u, e, k) => `${u} kargo ödemek yerine en az ${e} ürün ekleyin — kargo bedava olsun. Net kazanç: <b>${k}</b>.`,
    tamamlayiciAraniyor: '⏳ Tamamlayıcı ürünler aranıyor…',
    tamamlayiciYok: 'Bu eşik aralığında kârlı tamamlayıcı ürün bulunamadı.',
    uruneGit: 'Ürüne git ➔', sepeteEkleBtn: '+ Sepete Ekle',
    teklifAlinamadi: 'Teklifler alınamadı; eşiğe kalan tutarı yukarıda görebilirsiniz.',
    onceHesapla: 'Önce sepeti hesaplayın.', linkOlusturuluyor: '⏳ Link oluşturuluyor…',
    linkKopyalandi: (u) => `✅ Bağlantı panoya kopyalandı (30 gün geçerli): ${u}`,
    linkHazir: (u) => `🔗 Paylaşım linki (30 gün): ${u}`,
    paylasBtn: '🔗 Sepeti Paylaş', urunEklendi: '✅ Ürün sepete eklendi.',
    sepetBosaltildi: 'Sepet boşaltıldı.',
    tamamlayiciToast: '➕ Tamamlayıcı ürün sepete eklendi. Yeniden hesaplayın.',
    tamamlayiciNot: 'Kargo kurtarıcı ürünü eklendi — "3 Senaryoyu Karşılaştır" ile yeniden hesaplayın.',
  },
  en: {
    isimleAra: '🔎 Name search', link: '🔗 Link', paketten: ' · 🎨 from pack',
    adetAria: 'Quantity', azalt: 'Decrease quantity', artir: 'Increase quantity', cikar: 'Remove item from cart',
    kargoSonra: 'Shipping is calculated separately for each scenario',
    kargoDegisir: 'Shipping depends on the selected scenario',
    maksUrun: (n) => `Cart can hold at most ${n} items.`,
    stoktaYok: '⚠️ Currently out of stock:', yerine: 'instead of',
    katalogBos: 'No matching in-stock items in regional catalog',
    paketEkleBtn: '+ Add Pack to Cart', urunBulunamadi: 'Unavailable',
    canliTeklif: (n) => `${n} live filament offers loaded from regional scans.`,
    katalogOkunamadi: 'Regional filament catalog is currently empty; search by name or paste product links below.',
    paketYetersiz: 'Not enough in-stock items found for this pack. Add products manually below.',
    paketEklendi: (ad, n) => `✅ Added ${ad} (${n} items)`,
    eksik: 'missing', degisim: 'substituted',
    paketToast: (ad) => `🎨 Added ${ad} to cart`,
    sonuc: 'Result', linkEklendi: '✅ Product link added.',
    linkHata: '⚠️ Please paste a valid product URL.',
    isimleEkleEtiket: 'Search by name & add to cart',
    ucHarf: 'Enter at least 3 characters or paste a product link.',
    ikiHarf: 'Enter at least 2 characters or paste a product link.',
    urunYaz: 'Type a product name or paste a product URL.',
    linkliBulundu: (n) => `Found ${n} matching product(s) — pick one or add by name.`,
    eslesmeYok: 'No exact catalog match — click "Search by name & add to cart".',
    sEklendi: (s) => `✅ Added "${s}" to cart.`,
    sToast: (s) => `🛒 Added "${s}" to cart`,
    senaryoHesap: '🧮 Calculating scenarios…',
    tarandi: (b, t) => `🔎 Scanned ${b}/${t} items`,
    enUcuz: 'lowest',
    magazaAc: 'Open Store ➔',
    magazadanAl: (ad) => `⚡ Buy at ${ad} ➔`,
    cokMagazaAl: (n) => `🏪 Buy from ${n} Stores ➔`,
    senaryoMeta: (u, s) => `${u} items · ${s} candidate stores`,
    kurulamadi: 'This scenario is not available (no single store stocks every item).',
    pahali: (t) => `⚠️ <b>${t}</b> more expensive due to shipping/splitting`,
    esitEnDusuk: '💡 Lowest total cost (tie)',
    enDusuk: '💡 Lowest total cost',
    onerilen: 'RECOMMENDED', magazaTekil: '🏪', magazaCoklu: (n) => `🏪 ${n} stores`,
    urunler: 'Items', kupon: 'Coupon', kargo: 'Shipping', toplam: 'TOTAL',
    gonderim: (n) => `(${n} shipments)`, kargoBelirsiz: '⚠️ At checkout', kargoBedava: 'Free (threshold met)',
    linkYokToast: 'No store links available for this scenario.',
    sekmeAciliyor: (n, adlar) => `🛒 Opening ${n} store tab(s): ${adlar}`,
    popupEngel: 'Pop-ups were blocked. Click the individual item links below.',
    kargoKaldi: (t) => `💡 Only <b>${t}</b> away from free shipping`,
    kargoMesaj: (u, e, k) => `Instead of paying ${u} shipping, add at least ${e} worth of items to unlock free shipping. Net savings: <b>${k}</b>.`,
    tamamlayiciAraniyor: '⏳ Searching add-on items…',
    tamamlayiciYok: 'No qualifying add-on items found in this price range.',
    uruneGit: 'View item ➔', sepeteEkleBtn: '+ Add to Cart',
    teklifAlinamadi: 'Could not load add-on suggestions; check threshold remaining above.',
    onceHesapla: 'Calculate the cart scenarios first.', linkOlusturuluyor: '⏳ Creating share link…',
    linkKopyalandi: (u) => `✅ Share link copied (valid 30 days): ${u}`,
    linkHazir: (u) => `🔗 Share link (30 days): ${u}`,
    paylasBtn: '🔗 Share Cart', urunEklendi: '✅ Item added to cart.',
    sepetBosaltildi: 'Cart cleared.',
    tamamlayiciToast: '➕ Add-on item added. Recalculate scenarios.',
    tamamlayiciNot: 'Add-on added — click "Compare 3 Scenarios" to refresh totals.',
  },
  fr: {
    isimleAra: '🔎 Recherche par nom', link: '🔗 Lien', paketten: ' · 🎨 du pack',
    adetAria: 'Quantité', azalt: 'Diminuer', artir: 'Augmenter', cikar: 'Retirer du panier',
    kargoSonra: 'Les frais de port sont calculés par scénario',
    kargoDegisir: 'Livraison calculée selon le scénario choisi',
    maksUrun: (n) => `Maximum ${n} articles dans le panier.`,
    stoktaYok: '⚠️ Actuellement en rupture :', yerine: 'à la place de',
    katalogBos: 'Aucun produit compatible en stock dans ce catalogue',
    paketEkleBtn: '+ Ajouter le pack', urunBulunamadi: 'Indisponible',
    canliTeklif: (n) => `${n} offres de filaments en direct chargées pour cette région.`,
    katalogOkunamadi: 'Aucune offre régionale en cache ; recherchez un produit ou collez vos liens ci-dessous.',
    paketYetersiz: 'Articles insuffisants en stock pour ce pack. Ajoutez vos articles manuellement.',
    paketEklendi: (ad, n) => `✅ ${ad} ajouté (${n} articles)`,
    eksik: 'manquant', degisim: 'remplacé',
    paketToast: (ad) => `🎨 ${ad} ajouté au panier`,
    sonuc: 'Résultat', linkEklendi: '✅ Lien ajouté au panier.',
    linkHata: '⚠️ Veuillez coller un lien produit valide.',
    isimleEkleEtiket: 'Rechercher par nom et ajouter',
    ucHarf: 'Saisissez au moins 3 caractères ou collez une URL produit.',
    ikiHarf: 'Saisissez au moins 2 caractères ou collez une URL produit.',
    urunYaz: 'Saisissez un nom de produit ou collez un lien.',
    linkliBulundu: (n) => `${n} produit(s) trouvé(s) — choisissez ou ajoutez par nom.`,
    eslesmeYok: 'Aucune correspondance directe — cliquez sur « Rechercher par nom et ajouter ».',
    sEklendi: (s) => `✅ « ${s} » ajouté au panier.`,
    sToast: (s) => `🛒 « ${s} » ajouté au panier`,
    senaryoHesap: '🧮 Calcul des scénarios…',
    tarandi: (b, t) => `🔎 ${b}/${t} articles vérifiés`,
    enUcuz: 'moins cher',
    magazaAc: 'Ouvrir la boutique ➔',
    magazadanAl: (ad) => `⚡ Acheter chez ${ad} ➔`,
    cokMagazaAl: (n) => `🏪 Acheter dans ${n} boutiques ➔`,
    senaryoMeta: (u, s) => `${u} articles · ${s} boutiques analysées`,
    kurulamadi: 'Scénario indisponible (aucune boutique ne propose tous les articles).',
    pahali: (t) => `⚠️ <b>${t}</b> plus cher à cause du port / fractionnement`,
    esitEnDusuk: '💡 Coût total le plus bas (égalité)',
    enDusuk: '💡 Coût total le plus bas',
    onerilen: 'RECOMMANDÉ', magazaTekil: '🏪', magazaCoklu: (n) => `🏪 ${n} boutiques`,
    urunler: 'Articles', kupon: 'Promo', kargo: 'Livraison', toplam: 'TOTAL',
    gonderim: (n) => `(${n} colis)`, kargoBelirsiz: '⚠️ Au paiement', kargoBedava: 'Gratuite (seuil atteint)',
    linkYokToast: 'Aucun lien boutique disponible pour ce scénario.',
    sekmeAciliyor: (n, adlar) => `🛒 Ouverture de ${n} onglet(s) : ${adlar}`,
    popupEngel: 'Pop-ups bloqués. Cliquez individuellement sur chaque lien ci-dessous.',
    kargoKaldi: (t) => `💡 Plus que <b>${t}</b> pour le port gratuit`,
    kargoMesaj: (u, e, k) => `Au lieu de payer ${u} de port, ajoutez au moins ${e} d’articles pour la livraison gratuite. Gain net : <b>${k}</b>.`,
    tamamlayiciAraniyor: '⏳ Recherche d’articles complémentaires…',
    tamamlayiciYok: 'Aucun article complémentaire pertinent dans cette tranche.',
    uruneGit: 'Voir l’article ➔', sepeteEkleBtn: '+ Ajouter',
    teklifAlinamadi: 'Impossible de charger les suggestions ; consultez le montant manquant ci-dessus.',
    onceHesapla: 'Calculez d’abord les scénarios.', linkOlusturuluyor: '⏳ Génération du lien…',
    linkKopyalandi: (u) => `✅ Lien copié (valide 30 jours) : ${u}`,
    linkHazir: (u) => `🔗 Lien de partage (30 jours) : ${u}`,
    paylasBtn: '🔗 Partager le panier', urunEklendi: '✅ Article ajouté.',
    sepetBosaltildi: 'Panier vidé.',
    tamamlayiciToast: '➕ Article ajouté. Relancez le calcul.',
    tamamlayiciNot: 'Article ajouté — cliquez sur « Comparer les 3 scénarios ».',
  },
  ja: {
    isimleAra: '🔎 商品名検索', link: '🔗 URL', paketten: ' · 🎨 セットから',
    adetAria: '数量', azalt: '減らす', artir: '増やす', cikar: 'カートから削除',
    kargoSonra: '送料は選択した購入プランごとに計算されます',
    kargoDegisir: '送料はプランにより変動します',
    maksUrun: (n) => `カートには最大${n}件まで追加できます。`,
    stoktaYok: '⚠️ 現在在庫切れ:', yerine: 'の代替:',
    katalogBos: 'この地域のライブカタログに該当在庫がありません',
    paketEkleBtn: '+ セットを追加', urunBulunamadi: '在庫なし',
    canliTeklif: (n) => `${n}件の地域ライブフィラメント情報を読み込みました。`,
    katalogOkunamadi: '現在この地域のセット用在庫データが取得できません。下の検索欄から商品を追加できます。',
    paketYetersiz: 'このセットに必要な在庫が不足しています。下の検索から追加してください。',
    paketEklendi: (ad, n) => `✅ ${ad} を追加しました（${n}点）`,
    eksik: '欠品', degisim: '代替',
    paketToast: (ad) => `🎨 ${ad} をカートに追加しました`,
    sonuc: '候補', linkEklendi: '✅ 商品URLを追加しました。',
    linkHata: '⚠️ 有効な商品URLを入力してください。',
    isimleEkleEtiket: '商品名で検索して追加',
    ucHarf: '3文字以上の商品名、または商品URLを入力してください。',
    ikiHarf: '2文字以上の商品名、または商品URLを入力してください。',
    urunYaz: '商品名または商品URLを入力してください。',
    linkliBulundu: (n) => `${n}件の候補が見つかりました — 選択または商品名で追加できます。`,
    eslesmeYok: '直接の一致はありません —「商品名で検索して追加」から登録できます。',
    sEklendi: (s) => `✅「${s}」をカートに追加しました。`,
    sToast: (s) => `🛒「${s}」をカートに追加`,
    senaryoHesap: '🧮 購入プランを計算中…',
    tarandi: (b, t) => `🔎 ${b}/${t} 件をスキャン済み`,
    enUcuz: '最安',
    magazaAc: 'ショップを開く ➔',
    magazadanAl: (ad) => `⚡ ${ad} で購入 ➔`,
    cokMagazaAl: (n) => `🏪 ${n}店舗から購入 ➔`,
    senaryoMeta: (u, s) => `${u}点 · ${s}ショップを比較`,
    kurulamadi: 'このプランは構成できません（全商品を扱う単一ショップがありません）。',
    pahali: (t) => `⚠️ 送料・分割により <b>${t}</b> 割高`,
    esitEnDusuk: '💡 合計最安（同額）',
    enDusuk: '💡 合計最安プラン',
    onerilen: 'おすすめ', magazaTekil: '🏪', magazaCoklu: (n) => `🏪 ${n}店舗`,
    urunler: '商品小計', kupon: 'クーポン', kargo: '送料', toplam: '合計',
    gonderim: (n) => `(${n}件発送)`, kargoBelirsiz: '⚠️ レジで確認', kargoBedava: '送料無料（条件達成）',
    linkYokToast: 'このプランで開けるリンクがありません。',
    sekmeAciliyor: (n, adlar) => `🛒 ${n}件のストアタブを開いています: ${adlar}`,
    popupEngel: 'ポップアップがブロックされました。下のリンクを個別に開いてください。',
    kargoKaldi: (t) => `💡 送料無料まであと <b>${t}</b>`,
    kargoMesaj: (u, e, k) => `送料${u}を払う代わりに、あと${e}以上の商品を追加すると送料無料になります（実質お得額: <b>${k}</b>）。`,
    tamamlayiciAraniyor: '⏳ 追加候補を検索中…',
    tamamlayiciYok: '条件に合う追加商品が見つかりませんでした。',
    uruneGit: '商品を見る ➔', sepeteEkleBtn: '+ 追加',
    teklifAlinamadi: '追加候補を取得できませんでした。上の不足額をご確認ください。',
    onceHesapla: '先にプランを計算してください。', linkOlusturuluyor: '⏳ 共有リンク作成中…',
    linkKopyalandi: (u) => `✅ 共有リンクをコピーしました（30日間有効）: ${u}`,
    linkHazir: (u) => `🔗 共有リンク（30日間有効）: ${u}`,
    paylasBtn: '🔗 カートを共有', urunEklendi: '✅ 商品を追加しました。',
    sepetBosaltildi: 'カートを空にしました。',
    tamamlayiciToast: '➕ 追加商品をカートに入れました。再計算してください。',
    tamamlayiciNot: '商品を追加しました —「3プランを比較」で再計算してください。',
  },
}[ORTAM_DIL] || {};
const SZ = new Proxy(SP, { get: (t, p) => (p in t ? t[p] : '') });
const DEPO_ANAHTARI = ORTAM_MARKET === 'tr' ? 'eun_sepet_v1' : `eun_sepet_${ORTAM_MARKET}_v1`;
const DEPO_PAKET = ORTAM_MARKET === 'tr' ? 'eun_sepet_sonuc_v1' : `eun_sepet_sonuc_${ORTAM_MARKET}_v1`;

const durum = {
  sepet: [],
  teklifler: null,       // canlı filament kataloğu (paket çözümü için)
  sonuc: null,
  isId: null,
  izleme: null,
  iptal: false,
  sayac: 0,
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function toast(metin, tur = '') {
  const el = $('#sepetToast');
  if (!el) return;
  el.textContent = metin;
  el.className = 'sepet-toast' + (tur ? ' ' + tur : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 4200);
}

function durumYaz(metin, tur = '') {
  const el = $('#sepetEkleNot');
  if (!el) return;
  el.textContent = metin || '';
  el.className = 'sepet-ekle-not' + (tur ? ' ' + tur : '');
}

function hataGoster(metin) {
  const el = $('#sepetHata');
  if (!el) return;
  el.textContent = metin;
  el.hidden = !metin;
}

/* ------------------------------------------------------------------ */
/* Kalıcı sepet                                                        */
/* ------------------------------------------------------------------ */

function sepetYukle() {
  try {
    durum.sepet = sepetNormalize(localStorage.getItem(DEPO_ANAHTARI));
  } catch {
    durum.sepet = [];
  }
}

function sepetKaydet() {
  try {
    localStorage.setItem(DEPO_ANAHTARI, JSON.stringify(durum.sepet));
  } catch { /* özel mod: kayıt yok, sayfa yine çalışır */ }
}

function sonucKaydet() {
  try {
    if (!durum.sonuc) { localStorage.removeItem(DEPO_PAKET); return; }
    // Yalnızca görünüm için gerekli alanlar tutulur (boyut sınırı).
    localStorage.setItem(DEPO_PAKET, JSON.stringify({
      ts: Date.now(),
      sepet: durum.sepet,
      sonuc: durum.sonuc,
    }));
  } catch { /* kota dolu olabilir */ }
}

/* ------------------------------------------------------------------ */
/* Sepet listesi                                                       */
/* ------------------------------------------------------------------ */

function sepetCiz() {
  const kap = $('#sepetListe');
  const bos = $('#sepetBos');
  if (!kap) return;
  const adet = durum.sepet.reduce((s, x) => s + Math.max(1, Number(x.adet) || 1), 0);

  $('#sepetSayac').textContent = `${adet}/${MAKS_URUN}`;
  $('#sepetToplam').textContent = para(sepetToplami(durum.sepet));
  const temizle = $('#sepetTemizle');
  if (temizle) temizle.hidden = durum.sepet.length === 0;
  if (bos) bos.hidden = durum.sepet.length > 0;

  kaplama(kap, durum.sepet.map((x, i) => `
    <div class="sepet-satir" data-id="${esc(x.id)}">
      <div class="sepet-satir-sol">
        <span class="sepet-satir-sira">${i + 1}</span>
        <div class="sepet-satir-metin">
          ${x.tur !== 'ad' && /^https?:\/\//i.test(x.url || '')
            ? `<a class="sepet-satir-ad" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.ad)}</a>`
            : `<span class="sepet-satir-ad">${esc(x.ad)}</span>`}
          <span class="sepet-satir-alt">
            ${x.tur === 'ad' ? SZ.isimleAra : (x.site ? `🏪 ${esc(x.site)}` : SZ.link)}
            ${x.fiyat ? ` · ${para(x.fiyat)}` : ''}
            ${x.kaynak === 'paket' ? SZ.paketten : ''}
          </span>
        </div>
      </div>
      <div class="sepet-satir-sag">
        <div class="sepet-adet" role="group" aria-label="${esc(SZ.adetAria)}">
          <button type="button" data-adet="-1" data-id="${esc(x.id)}" aria-label="${esc(SZ.azalt)}">−</button>
          <span>${Math.max(1, Number(x.adet) || 1)}</span>
          <button type="button" data-adet="1" data-id="${esc(x.id)}" aria-label="${esc(SZ.artir)}">+</button>
        </div>
        <button type="button" class="sepet-sil" data-id="${esc(x.id)}" aria-label="${esc(SZ.cikar)}">🗑</button>
      </div>
    </div>
  `).join(''));

  $('#sepetAltNot').textContent = durum.sepet.length ? SZ.kargoSonra : SZ.kargoDegisir;
}

/** innerHTML yerine parça parça yazma (XSS riski yok, hız aynı). */
function kaplama(el, html) {
  el.innerHTML = html;
}

function sepeteEkle(urun) {
  const isAdMod = urun?.tur === 'ad';
  const anaDeger = String(urun?.url || urun?.ad || '').trim();
  if (!anaDeger) return false;
  if (!isAdMod && !/^https?:\/\//i.test(anaDeger)) return false;
  if (isAdMod && anaDeger.length < 2) return false;
  const ayni = durum.sepet.find(x => String(x.url || x.ad || '').toLowerCase() === anaDeger.toLowerCase());
  const toplam = durum.sepet.reduce((s, x) => s + Math.max(1, Number(x.adet) || 1), 0);

  if (ayni) {
    if (toplam >= MAKS_URUN) { toast(SZ.maksUrun(MAKS_URUN), 'hata'); return false; }
    ayni.adet = Math.max(1, Number(ayni.adet) || 1) + 1;
  } else {
    if (toplam >= MAKS_URUN) { toast(SZ.maksUrun(MAKS_URUN), 'hata'); return false; }
    durum.sepet.push({
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ad: String(urun.ad || anaDeger).slice(0, 200),
      url: anaDeger,
      tur: isAdMod ? 'ad' : 'url',
      adet: Math.max(1, Number(urun.adet) || 1),
      site: urun.site || null,
      fiyat: Number.isFinite(Number(urun.fiyat)) ? Number(urun.fiyat) : null,
      kaynak: urun.kaynak || 'elle',
    });
  }
  sepetKaydet();
  sepetCiz();
  hataGoster('');
  return true;
}

/* ------------------------------------------------------------------ */
/* Hazır paketler                                                      */
/* ------------------------------------------------------------------ */

async function teklifleriYukle() {
  if (durum.teklifler) return durum.teklifler;
  try {
    const qs = ORTAM_MARKET !== 'tr' ? `&market=${encodeURIComponent(ORTAM_MARKET)}` : '';
    const r = await fetch('/api/baski/en-ucuz-filamentler?limit=50' + qs);
    const v = await r.json();
    durum.teklifler = Array.isArray(v?.filamentler) ? v.filamentler : [];
  } catch {
    durum.teklifler = [];
  }
  return durum.teklifler;
}

function paketleriCiz() {
  const kap = $('#paketler');
  if (!kap) return;
  kap.setAttribute('aria-busy', 'false');

  const teklifler = durum.teklifler || [];
  kaplama(kap, PAKETLER.map(hamPaket => {
    const p = paketCevir(hamPaket, ORTAM_DIL);
    const r = paketCoz(hamPaket, teklifler, ORTAM_DIL);
    const satirlar = r.parcalar.map(x => {
      const fiyat = para(Number(x.teklif.fiyat) * (x.adet || 1));
      return `<li>
        <span class="paket-parca-ad">${esc(x.adet > 1 ? x.adet + '× ' : '')}${esc(x.teklif.ad)}</span>
        <span class="paket-parca-fiyat">${fiyat}</span>
      </li>`;
    }).join('');
    const eksik = r.eksikler.length
      ? `<p class="paket-eksik">${SZ.stoktaYok} ${r.eksikler.map(e => esc(e.etiket)).join(', ')}</p>`
      : '';
    const degisim = r.degisimler.length
      ? `<p class="paket-degisim">↔️ ${r.degisimler.map(d => `${esc(d.istenen)} ${SZ.yerine} ${esc(d.eklenen)}`).join('; ')}</p>`
      : '';
    const toplam = r.tahminiToplam != null ? para(r.tahminiToplam) : '—';
    return `<article class="paket-kart" data-paket="${esc(p.id)}">
      <div class="paket-ust">
        <span class="paket-ikon" aria-hidden="true">${esc(p.ikon)}</span>
        <div>
          <h3 class="paket-ad">${esc(p.ad)}</h3>
          <p class="paket-icerik">${esc(p.icerik)}</p>
        </div>
      </div>
      <ul class="paket-satirlar">${satirlar || `<li class="paket-parca-ad">${esc(SZ.katalogBos)}</li>`}</ul>
      ${eksik}${degisim}
      <div class="paket-alt">
        <span class="paket-toplam">${toplam}</span>
        <button type="button" class="paket-ekle" data-paket-ekle="${esc(p.id)}"
          ${r.eklenebilir ? '' : 'disabled aria-disabled="true"'}>
          ${r.eklenebilir ? esc(SZ.paketEkleBtn) : esc(SZ.urunBulunamadi)}
        </button>
      </div>
    </article>`;
  }).join(''));

  const not = $('#paketNot');
  if (not) {
    not.textContent = teklifler.length
      ? SZ.canliTeklif(teklifler.length)
      : SZ.katalogOkunamadi;
  }
}

function paketEkle(paketId) {
  const hamPaket = PAKETLER.find(p => p.id === paketId);
  if (!hamPaket) return;
  const paket = paketCevir(hamPaket, ORTAM_DIL);
  const r = paketCoz(hamPaket, durum.teklifler || [], ORTAM_DIL);
  if (!r.eklenebilir) {
    toast(SZ.paketYetersiz, 'hata');
    return;
  }
  let eklenen = 0;
  for (const p of r.parcalar) {
    for (let i = 0; i < (p.adet || 1); i++) {
      const ok = sepeteEkle({
        ad: p.teklif.ad,
        url: p.teklif.url,
        site: p.teklif.site,
        fiyat: p.teklif.fiyat,
        kaynak: 'paket',
      });
      if (ok) eklenen++;
    }
  }
  const parcalar = [];
  parcalar.push(SZ.paketEklendi(paket.ad, eklenen));
  if (r.eksikler.length) parcalar.push(`${SZ.eksik}: ${r.eksikler.map(e => e.etiket).join(', ')}`);
  if (r.degisimler.length) parcalar.push(`${SZ.degisim}: ${r.degisimler.map(d => d.eklenen).join(', ')}`);
  durumYaz(parcalar.join(' · '), r.eksikler.length ? 'uyari' : 'basarili');
  toast(SZ.paketToast(paket.ad), 'basarili');
  // Tek tıkla akış: paket eklendiği anda hesaplama başlar (istek üzerine).
  if (durum.sepet.length >= 2) hesapla();
}

/* ------------------------------------------------------------------ */
/* Ürün arama / link ekleme                                            */
/* ------------------------------------------------------------------ */

let aramaZaman = null;
let aramaSonId = 0;

async function oneriGetir(q) {
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  const kimlik = ++aramaSonId;
  try {
    const qs = ORTAM_MARKET !== 'tr' ? `&market=${encodeURIComponent(ORTAM_MARKET)}` : '';
    const r = await fetch('/api/search-suggestions?q=' + encodeURIComponent(s) + '&limit=8' + qs);
    const v = await r.json();
    if (kimlik !== aramaSonId) return [];
    return (v?.onerilerDetay || []).filter(o => o?.url && /^https?:\/\//i.test(o.url));
  } catch {
    return [];
  }
}

function onerileriCiz(liste, q) {
  const kap = $('#sepetOneriler');
  const girdi = $('#sepetArama');
  if (!kap) return;
  if (!liste.length) {
    kap.hidden = true;
    girdi?.setAttribute('aria-expanded', 'false');
    return;
  }
  kaplama(kap, liste.map((o, i) => `
    <button type="button" class="sepet-oneri" role="option" data-url="${esc(o.url)}"
      data-ad="${esc(o.metin || o.url)}" data-tur="${esc(o.tur || 'url')}" data-idx="${i}">
      <span class="sepet-oneri-metin">${esc(o.metin || o.url)}</span>
      <span class="sepet-oneri-etiket">${esc(o.etiket || SZ.sonuc)}</span>
    </button>
  `).join(''));
  kap.hidden = false;
  girdi?.setAttribute('aria-expanded', 'true');
}

function onerileriKapat() {
  const kap = $('#sepetOneriler');
  const girdi = $('#sepetArama');
  if (kap) kap.hidden = true;
  girdi?.setAttribute('aria-expanded', 'false');
}

async function aramaYap() {
  const girdi = $('#sepetArama');
  const q = girdi?.value || '';
  if (/^https?:\/\//i.test(q.trim())) {
    const ok = sepeteEkle({ ad: q.trim(), url: q.trim(), kaynak: 'link' });
    if (ok) {
      durumYaz(SZ.linkEklendi, 'basarili');
      girdi.value = '';
      onerileriKapat();
    } else {
      durumYaz(SZ.linkHata, 'hata');
    }
    return;
  }
  const liste = await oneriGetir(q);
  const s = q.trim();
  const isimSecenegi = s.length >= 3
    ? [{ url: s, metin: s, tur: 'ad', etiket: SZ.isimleEkleEtiket }]
    : [];
  const birlesik = [...liste, ...isimSecenegi];
  if (!birlesik.length) {
    durumYaz(SZ.ucHarf, 'uyari');
    onerileriCiz([], q);
    return;
  }
  onerileriCiz(birlesik, q);
  durumYaz(liste.length ? SZ.linkliBulundu(liste.length) : SZ.eslesmeYok);
}

/** "Ekle" butonuna basıldığında öneri listesinde takılmadan yazılan ürünü doğrudan sepete ekler. */
async function metinleSepeteEkle() {
  const girdi = $('#sepetArama');
  const s = (girdi?.value || '').trim();
  onerileriKapat();
  if (!s) {
    durumYaz(SZ.urunYaz, 'uyari');
    girdi?.focus();
    return;
  }
  if (/^https?:\/\//i.test(s)) {
    return aramaYap();
  }
  if (s.length < 2) {
    durumYaz(SZ.ikiHarf, 'uyari');
    girdi?.focus();
    return;
  }
  const ok = sepeteEkle({ ad: s, url: s, tur: 'ad', kaynak: 'arama' });
  if (ok) {
    durumYaz(SZ.sEklendi(s), 'basarili');
    toast(SZ.sToast(s), 'basarili');
    girdi.value = '';
  }
}

/* ------------------------------------------------------------------ */
/* Hesaplama + ilerleme                                                */
/* ------------------------------------------------------------------ */

function ilerlemeCiz(p) {
  const alan = $('#sepetIlerlemeAlani');
  if (!alan) return;
  alan.hidden = false;

  const toplam = Number(p?.toplam) || durum.sepet.length;
  const biten = Number(p?.biten) || 0;
  const yuzde = p?.faz === 'optimizasyon'
    ? 96
    : Math.min(95, Math.round((biten / Math.max(1, toplam)) * 100));
  const bar = $('#sepetBar');
  const sar = $('#sepetBarSar');
  if (bar) bar.style.width = yuzde + '%';
  if (sar) sar.setAttribute('aria-valuenow', String(yuzde));

  const faz = $('#sepetFaz');
  if (faz) {
    faz.textContent = p?.faz === 'optimizasyon'
      ? SZ.senaryoHesap
      : `${SZ.tarandi(biten, toplam)}${p?.not ? ' · ' + String(p.not).slice(0, 90) : ''}`;
  }

  const liste = $('#sepetUrunDurumlari');
  if (liste && Array.isArray(p?.urunler)) {
    kaplama(liste, p.urunler.map(u => {
      const ikon = u.durum === 'ok' ? '✅' : u.durum === 'hata' ? '❌' : (u.durum === 'bulunamadi' ? '⚪' : '⏳');
      const fiyat = u.enUcuz ? ` · ${SZ.enUcuz} ${para(u.enUcuz.fiyat)} (${esc(u.enUcuz.site)})` : '';
      return `<li class="sepet-urun-durum ${esc(u.durum || '')}">
        <span>${ikon} ${esc(String(u.ad || '').slice(0, 80))}</span>
        <span class="sepet-urun-durum-not">${esc(String(u.not || '').slice(0, 70))}${fiyat}</span>
      </li>`;
    }).join(''));
  }
}

async function hesapDongusu(isId) {
  let hataSayisi = 0;
  const tik = async () => {
    if (durum.isId !== isId || durum.iptal) return;
    try {
      const r = await fetch('/api/sepet/' + encodeURIComponent(isId));
      const v = await r.json().catch(() => ({}));
      hataSayisi = 0;
      if (!r.ok) throw new Error(v.hata || 'Durum okunamadı');

      ilerlemeCiz(v.progress);

      if (v.status === 'done') {
        bitir(v.result);
        return;
      }
      if (v.status === 'error') {
        hataGoster('❌ ' + (v.error || 'Sepet hesaplanamadı'));
        hesaplaButonu(false);
        $('#sepetIlerlemeAlani').hidden = true;
        return;
      }
      durum.izleme = setTimeout(tik, 1500);
    } catch (e) {
      // Ağ hatası işi öldürmez: artan bekleme ile devam (5 ürün 5+ dakika sürebilir).
      hataSayisi++;
      if (hataSayisi >= 12 || durum.iptal) {
        hataGoster('⚠️ Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.');
        hesaplaButonu(false);
        return;
      }
      durum.izleme = setTimeout(tik, Math.min(8000, 1200 + hataSayisi * 600));
    }
  };
  tik();
}

function hesaplaButonu(mesgul) {
  const btn = $('#sepetHesapla');
  if (!btn) return;
  btn.disabled = mesgul;
  btn.textContent = mesgul ? '⏳ Hesaplanıyor…' : '⚡ 3 Senaryoyu Karşılaştır';
  const iptal = $('#sepetIptal');
  if (iptal) iptal.hidden = !mesgul;
}

async function hesapla() {
  hataGoster('');
  const dogrulama = sepetDogrula(durum.sepet);
  if (!dogrulama.ok) {
    hataGoster(dogrulama.hata);
    toast(dogrulama.hata, 'hata');
    return;
  }
  durum.iptal = false;
  durum.sonuc = null;
  hesaplaButonu(true);
  $('#sepetIlerlemeAlani').hidden = false;
  ilerlemeCiz({ faz: 'basladi', toplam: dogrulama.adet, biten: 0, not: 'İstek gönderiliyor…' });
  $('#sepetUrunDurumlari').innerHTML = '';

  try {
    const govde = sepetIstekGovdesi(durum.sepet);
    let hazirTeklifler = {};
    try {
      hazirTeklifler = JSON.parse(localStorage.getItem('eun_sepet_onbellek_v1') || '{}') || {};
    } catch { hazirTeklifler = {}; }
    const simdi = Date.now();
    govde.urunler = (govde.urunler || []).map(u => {
      const kayit = hazirTeklifler[String(u.url || '').toLowerCase()];
      if (kayit && (simdi - (kayit.ts || 0) < 15 * 60 * 1000) && Array.isArray(kayit.teklifler) && kayit.teklifler.length) {
        return { ...u, teklifler: kayit.teklifler };
      }
      return u;
    });
    const r = await fetch('/api/sepet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...govde, hizliMod: true, market: ORTAM_MARKET }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.hata || 'Sepet isteği başarısız');
    try {
      if (window.gtag) window.gtag('event', 'sepet_optimize', { adet: Number(dogrulama.adet || 0) });
    } catch { /* analitik yoksa sorun değil */ }
    durum.isId = v.isId;
    hesapDongusu(v.isId);
  } catch (e) {
    hataGoster('❌ ' + (e.message || 'Sepet hesaplanamadı'));
    hesaplaButonu(false);
    $('#sepetIlerlemeAlani').hidden = true;
  }
}

function bitir(sonuc) {
  hesaplaButonu(false);
  $('#sepetIlerlemeAlani').hidden = true;
  if (!sonuc || sonuc.iptalEdildi) {
    hataGoster('Tarama durduruldu. Sepetiniz korunuyor.');
    return;
  }
  durum.sonuc = sonuc;
  sonucKaydet();
  senaryolariCiz(sonuc);
  kargoKurtariciCiz(sonuc);
}

/* ------------------------------------------------------------------ */
/* Senaryo kartları                                                    */
/* ------------------------------------------------------------------ */

function urunSatiri(u) {
  // 2026-11-12: senaryo kartları artık `kargoPaketKutusu()` ile çiziliyor;
  // bu yardımcı, eski sözleşmeyi (`.senaryo-urun` listesi) bekleyen dış
  // kullanımlar için korunuyor. Yeni kodda kullanılmaz.
  return `<li class="senaryo-urun">
    <span class="senaryo-urun-ad">${esc(String(u.ad || '').slice(0, 70))}</span>
    <span class="senaryo-urun-fiyat">${para(u.fiyat)}</span>
  </li>`;
}

function grupOzet(senaryo) {
  const gruplar = senaryo?.gruplar || [];
  const toplamPaket = gruplar.length;
  return gruplar.map((g, i) => kargoPaketKutusu(g, i + 1, toplamPaket)).join('');
}

/* ==========================================================================
 * 📦 Görsel kargo paket kutusu + 📊 kıyas barı (2026-11-12)
 * Matematik `sepetHesap.js` (kiyasVerisi / paketKargoDurumu) — tek kaynak.
 * ========================================================================== */

function kargoPaketKutusu(g, sira, toplamPaket) {
  const durum = paketKargoDurumu(g);
  const urunler = (g.urunler || []);
  const cip = toplamPaket > 1
    ? `<span class="kargo-paket-cip">📦 Paket ${sira} / ${toplamPaket}</span>` : '';

  const kargoEtiket = durum.bedava
    ? '<span class="kargo-paket-etiket bedava">✅ Kargo Bedava</span>'
    : (durum.belirsiz
      ? '<span class="kargo-paket-etiket belirsiz">⚠️ +Kargo sepette</span>'
      : `<span class="kargo-paket-etiket ucretli">🚚 +${para(durum.kargo)} Kargo</span>`);

  let ipucu = '';
  if (durum.esikIpucu != null) {
    ipucu = `<div class="kargo-paket-ipucu">💡 Bu pakete <b>${para(durum.esikIpucu)}</b> `
      + 'tutarında ürün daha eklerseniz kargo BEDAVA olur!</div>';
  } else if (durum.esikFarki != null) {
    ipucu = `<div class="kargo-paket-ipucu">🎯 Ücretsiz kargo eşiği <b>${para(durum.esik)}</b> `
      + `(<b>${para(durum.esikFarki)}</b> uzakta)</div>`;
  }

  const kuponSatir = Number(g.kuponIndirim) > 0
    ? `<div class="kargo-paket-kupon">🎟️ Kupon: −${para(g.kuponIndirim)}${g.uygulananKupon?.kodu ? ` (${esc(g.uygulananKupon.kodu)})` : ''}</div>`
    : '';

  const satirlar = urunler.map(u => {
    const adHam = String(u.ad || '').slice(0, 70);
    const ad = (Number(u.adet) > 1 ? `${Number(u.adet)}× ` : '') + adHam;
    const link = u.url && /^https?:\/\//i.test(u.url)
      ? `<a href="${esc(u.afiliyeUrl || u.url)}" target="_blank" rel="noopener sponsored" `
        + `data-afiliye-site="${esc(u.site || g.site || '')}" title="${esc(ad)}">${esc(ad)}</a>`
      : `<span title="${esc(ad)}">${esc(ad)}</span>`;
    return `<li>${link}<span class="kargo-paket-urun-fiyat">${para(u.fiyat)}</span></li>`;
  }).join('');

  return `<div class="kargo-paket-kutusu">
    <div class="kargo-paket-ust">
      <div class="kargo-paket-sol">
        ${cip}
        <span class="kargo-paket-magaza">🏪 ${esc(g.siteName || g.site || 'Mağaza')}</span>
      </div>
      <span class="kargo-paket-tutar">${para(g.toplam)}</span>
    </div>
    <div class="kargo-paket-sayi">🏷️ ${urunler.reduce((s, u) => s + Math.max(1, Number(u.adet) || 1), 0)} ürün</div>
    <ul class="kargo-paket-urunler">${satirlar}</ul>
    <div class="kargo-paket-alt-satir">
      <span class="kargo-paket-ara">Ürünler ${para(g.araToplam)}</span>
      ${kargoEtiket}
    </div>
    ${kuponSatir}
    ${ipucu}
  </div>`;
}

/** 📊 Tek mağaza ↔ bölünmüş sepet kıyas barı. */
function kiyasKarti(sonuc) {
  const k = kiyasVerisi(sonuc);
  if (!k.var) return '';

  if (k.tekMagazaEnIyi) {
    return `<div class="sepet-tebrik-kart">
      <span class="sepet-tebrik-ikon" aria-hidden="true">🎯</span>
      <div class="sepet-tebrik-metin">
        <b>Tek mağaza seçimi zaten en avantajlı seçenek!</b><br>
        Ekstra kargo ödemeden <b>${para(k.tekMagaza)}</b> tutarla alabilirsiniz.
      </div>
    </div>`;
  }

  const yuzdeMetni = k.tasarrufYuzde != null
    ? ` <span aria-hidden="true">·</span> ${yuzde(k.tasarrufYuzde)} tasarruf` : '';
  return `<div class="sepet-kiyas-kapsayici">
    <div class="sepet-kiyas-baslik-satiri">
      <span class="sepet-kiyas-baslik">📊 Sepet kıyaslaması</span>
      <span class="sepet-kiyas-rozet">🎉 ${para(k.tasarruf)} net kazanç${yuzdeMetni}</span>
    </div>
    <div class="sepet-kiyas-satir">
      <span class="sepet-kiyas-etiket">
        <span>🏪 Tek mağazadan alsaydınız</span>
        <span class="sepet-kiyas-tutar">${para(k.tekMagaza)}</span>
      </span>
      <span class="sepet-kiyas-bar" role="img"
            aria-label="Tek mağaza toplamı ${para(k.tekMagaza)}, referans %100">
        <span class="sepet-kiyas-dolgu tek" style="width:100%"></span>
      </span>
    </div>
    <div class="sepet-kiyas-satir kazanan">
      <span class="sepet-kiyas-etiket">
        <span>🧺 Bölünmüş akıllı sepet</span>
        <span class="sepet-kiyas-tutar">${para(k.enIyi)}</span>
      </span>
      <span class="sepet-kiyas-bar" role="img"
            aria-label="Bölünmüş sepet toplamı ${para(k.enIyi)}, tek mağazanın ${yuzde(k.oran)}'i">
        <span class="sepet-kiyas-dolgu bolunmus" data-oran="${k.oran}" style="width:0%"></span>
      </span>
    </div>
  </div>`;
}

/** Barı 0 → hedef genişliğe animasyonla açar (CSS transition 0.7s). */
function kiyasAnimasyonu() {
  const uygula = () => {
    document.querySelectorAll('.sepet-kiyas-dolgu.bolunmus[data-oran]').forEach((el) => {
      const hedef = `${Number(el.dataset.oran) || 0}%`;
      if (el.style.width !== hedef) el.style.width = hedef;
    });
  };
  // rAF ideal; ama arka plan sekmesinde rAF hiç çalışmayabilir → setTimeout
  // yedeği şart, aksi hâlde bar %0'da donup kalır (ölçüldü).
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(uygula);
  setTimeout(uygula, 40);
}

function ctaMetni(senaryo) {
  const gruplar = senaryo?.gruplar || [];
  if (!gruplar.length) return SZ.magazaAc;
  if (gruplar.length === 1) {
    const ad = String(gruplar[0].siteName || 'Store');
    return SZ.magazadanAl(ad);
  }
  return SZ.cokMagazaAl(gruplar.length);
}

function senaryolariCiz(sonuc) {
  const alan = $('#senaryoAlani');
  if (!alan) return;
  alan.hidden = false;

  const kartlar = senaryoListesi(sonuc);
  const onerilen = onerilenAnahtar(sonuc);
  const ozet = tasarrufOzeti(sonuc);
  const enIyi = ozet.enIyiAnahtar;

  $('#senaryoMeta').textContent = SZ.senaryoMeta(sonuc.urunSayisi || 0, sonuc.adaySiteSayisi || 0);

  kaplama($('#senaryoKartlari'), kartlar.map(k => {
    if (!k.dolu) {
      return `<article class="senaryo-kart senaryo-bos" data-anahtar="${esc(k.anahtar)}">
        <div class="senaryo-ust">
          <span class="senaryo-harf">${esc(k.harf)}</span>
          <div><h3 class="senaryo-baslik">${esc(k.baslik)}</h3>
            <p class="senaryo-aciklama">${esc(k.aciklama)}</p></div>
        </div>
        <p class="senaryo-kurulamadi">${SZ.kurulamadi}</p>
      </article>`;
    }
    const s = k.senaryo;
    const onerilenMi = k.anahtar === onerilen;
    const enIyiMi = k.anahtar === enIyi;
    const fark = onerilen && !onerilenMi
      ? senaryoFarki(s, sonuc.senaryolar[onerilen])
      : null;
    const farkHtml = fark && fark.tl > 0
      ? `<p class="senaryo-fark ${fark.tl >= 100 ? 'buyuk' : ''}">
           ${SZ.pahali(para(fark.tl))}
         </p>`
      : (fark && fark.tl === 0
        ? `<p class="senaryo-fark kazanc">${SZ.esitEnDusuk}</p>`
        : (enIyiMi ? `<p class="senaryo-fark kazanc">${SZ.enDusuk}</p>` : ''));

    return `<article class="senaryo-kart ${onerilenMi ? 'oneri' : ''} ${enIyiMi ? 'en-iyi' : ''}"
        data-anahtar="${esc(k.anahtar)}">
      <div class="senaryo-ust">
        <span class="senaryo-harf">${esc(k.harf)}</span>
        <div class="senaryo-ust-metin">
          <h3 class="senaryo-baslik">${onerilenMi ? '🏆 ' : ''}${esc(k.baslik)}</h3>
          <p class="senaryo-aciklama">${esc(k.aciklama)}</p>
        </div>
        ${onerilenMi ? `<span class="senaryo-oneri-rozet">${SZ.onerilen}</span>` : ''}
      </div>

      <p class="senaryo-magaza-satiri">
        ${(s.gruplar || []).length === 1 ? SZ.magazaTekil : SZ.magazaCoklu((s.gruplar || []).length)}
        <span class="senaryo-magaza-adlari">${esc((s.gruplar || []).map(g => g.siteName).join(' + '))}</span>
      </p>

      <div class="senaryo-gruplar">${grupOzet(s)}</div>

      <dl class="senaryo-toplama">
        <div><dt>${SZ.urunler}</dt><dd>${para(s.araToplam)}</dd></div>
        ${Number(s.kuponIndirim) > 0 ? `<div><dt>${SZ.kupon}</dt><dd>−${para(s.kuponIndirim)}</dd></div>` : ''}
        <div class="${Number(s.kargo) > 0 || s.kargoBelirsiz ? 'kargo-ucretli' : 'kargo-bedava'}">
          <dt>${SZ.kargo}</dt>
          <dd>${Number(s.kargo) > 0
            ? para(s.kargo) + ((s.gruplar || []).length > 1 ? ` ${SZ.gonderim((s.gruplar || []).length)}` : '')
            : (s.kargoBelirsiz ? SZ.kargoBelirsiz : SZ.kargoBedava)}</dd>
        </div>
        <div class="senaryo-toplam-satir"><dt>${SZ.toplam}</dt><dd>${para(s.toplam)}</dd></div>
      </dl>

      ${farkHtml}
      ${s.uyari ? `<p class="senaryo-uyari">ℹ️ ${esc(s.uyari)}</p>` : ''}

      <button type="button" class="senaryo-cta ${onerilenMi ? 'birincil' : ''}"
        data-satin-al="${esc(k.anahtar)}">
        ${esc(ctaMetni(s))}
      </button>
    </article>`;
  }).join(''));

  // Tasarruf bandı — 2026-11-12: salt metin yerine GÖRSEL kıyas barı.
  const bant = $('#tasarrufBant');
  const rozet = $('#tasarrufRozet');
  const metin = $('#tasarrufMetin');
  if (bant && rozet && metin) {
    const kiyasHtml = kiyasKarti(sonuc);
    if (kiyasHtml) {
      bant.hidden = false;
      // Kart kendi zeminini taşır → bandın yeşil çerçevesi kapatılır.
      bant.classList.add('kiyas-var');
      rozet.textContent = '';
      rozet.hidden = true;
      metin.innerHTML = kiyasHtml;
      kiyasAnimasyonu();
    } else if (ozet.tasarrufTL > 0 && ozet.metin) {
      // Kıyas verisi yoksa eski metin bandı korunur (gerileme yok).
      bant.hidden = false;
      bant.classList.remove('kiyas-var');
      rozet.hidden = false;
      rozet.textContent = `💡 ${para(ozet.tasarrufTL)} tasarruf`
        + (ozet.tasarrufYuzde != null ? ` (${yuzde(ozet.tasarrufYuzde)})` : '');
      metin.textContent = ozet.metin;
    } else {
      bant.hidden = true;
      bant.classList.remove('kiyas-var');
      rozet.hidden = false;
    }
  }

  // Uyarılar (bulunamayan ürün vb.) — önceki çizimden kalanları temizle.
  document.querySelectorAll('#senaryoAlani .senaryo-uyarilar').forEach(el => el.remove());
  if (Array.isArray(sonuc.uyarilar) && sonuc.uyarilar.length) {
    const ek = sonuc.uyarilar.map(u => `<p class="senaryo-uyari">ℹ️ ${esc(u)}</p>`).join('');
    $('#senaryoKartlari').insertAdjacentHTML('afterend', `<div class="senaryo-uyarilar">${ek}</div>`);
  }

  // Mobilde önerilen karta kaydır.
  const oneriEl = document.querySelector('.senaryo-kart.oneri');
  if (oneriEl && oneriEl.scrollIntoView && window.matchMedia('(max-width: 900px)').matches) {
    oneriEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

/**
 * Senaryodaki ürünleri (komisyonlu bağlantılarla) sırayla açar.
 * Pop-up engelleyiciye takılırsa kullanıcıya açıkça söylenir ve tek tek
 * açma imkânı verilir (sessiz başarısızlık yok).
 */
function senaryoUrunleriniAc(anahtar) {
  const s = (durum.sonuc?.senaryolar || {})[anahtar];
  if (!s) return;
  const linkler = [];
  for (const g of s.gruplar || []) {
    for (const u of g.urunler || []) {
      const hedef = u.afiliyeUrl || u.url;
      if (hedef) linkler.push({ hedef, ad: u.ad, site: g.siteName });
    }
  }
  if (!linkler.length) { toast('Bu senaryoda açılacak ürün bağlantısı yok.', 'hata'); return; }

  toast(`🛒 ${linkler.length} ürün sekmesi açılıyor: ${s.gruplar.map(g => g.siteName).join(' + ')}`);
  let acilan = 0;
  linkler.slice(0, 8).forEach((l, i) => {
    setTimeout(() => {
      const w = window.open(l.hedef, '_blank', 'noopener');
      if (w) acilan++;
      if (i === Math.min(linkler.length, 8) - 1) {
        if (!acilan) {
          toast('Tarayıcı yeni sekmeleri engelledi. Aşağıdaki ürün linklerine tek tek dokunabilirsiniz.', 'hata');
        }
      }
    }, i * 320);
  });
}

/* ------------------------------------------------------------------ */
/* Kargo kurtarıcı                                                     */
/* ------------------------------------------------------------------ */

async function kargoKurtariciCiz(sonuc) {
  const alan = $('#kargoKurtarici');
  const icerik = $('#kargoKurtariciIcerik');
  if (!alan || !icerik) return;

  const onerilen = onerilenAnahtar(sonuc);
  const senaryo = (sonuc?.senaryolar || {})[onerilen];
  if (!senaryo) { alan.hidden = true; return; }

  const firsatlar = (senaryo.gruplar || [])
    .map(g => ({ grup: g, acik: kargoFirsati(g) }))
    .filter(x => x.acik.var && x.acik.mantikli)
    .slice(0, 2);

  if (!firsatlar.length) { alan.hidden = true; return; }
  alan.hidden = false;

  kaplama(icerik, firsatlar.map(({ grup, acik }) => `
    <div class="kargo-kart" data-site="${esc(grup.site)}">
      <div class="kargo-kart-ust">
        <span class="kargo-kart-site">🏪 ${esc(grup.siteName)}</span>
        <span class="kargo-kart-eksik">${SZ.kargoKaldi(para(acik.eksik))}</span>
      </div>
      <p class="kargo-kart-metin">
        ${SZ.kargoMesaj(para(acik.kargoUcreti), para(acik.eksik), para(acik.netKazanc))}
      </p>
      <div class="kargo-kart-oneriler" data-yukleniyor="1">
        <span class="kargo-yukleniyor">${SZ.tamamlayiciAraniyor}</span>
      </div>
    </div>
  `).join(''));

  // Somut ürün önerileri (sunucu uç noktası). Hata olursa metin kartı kalır.
  for (const { grup, acik } of firsatlar) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch('/api/tamamlayici', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: grup.site,
          sepetToplam: grup.araToplam,
          kargo: grup.kargoKurali || { fee: grup.kargo, freeOver: acik.esik },
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      const v = await r.json().catch(() => ({}));
      const kap = icerik.querySelector(`.kargo-kart[data-site="${CSS.escape(grup.site)}"] .kargo-kart-oneriler`);
      if (!kap) continue;

      const oneriler = Array.isArray(v?.oneriler) ? v.oneriler : [];
      if (!oneriler.length) {
        kap.removeAttribute('data-yukleniyor');
        kap.innerHTML = `<span class="kargo-yukleniyor">${esc(SZ.tamamlayiciYok)}</span>`;
        continue;
      }
      kap.removeAttribute('data-yukleniyor');
      kaplama(kap, oneriler.slice(0, 2).map(o => {
        const etki = tamamlayiciEtkisi(acik, o);
        return `<div class="kargo-oneri">
          <div class="kargo-oneri-metin">
            <span class="kargo-oneri-ad">${esc(String(o.title || '').slice(0, 90))}</span>
            <span class="kargo-oneri-alt">${para(o.fiyat)} · ${etki ? esc(etki.metin) : ''}</span>
          </div>
          <div class="kargo-oneri-btnler">
            <a class="kargo-oneri-link" href="${esc(o.afiliyeUrl || o.url)}"
               target="_blank" rel="noopener sponsored">${SZ.uruneGit}</a>
            <button type="button" class="kargo-oneri-ekle"
              data-ekle-ad="${esc(o.title || '')}"
              data-ekle-url="${esc(o.url || o.afiliyeUrl || '')}"
              data-ekle-fiyat="${esc(String(o.fiyat ?? ''))}"
              data-ekle-site="${esc(grup.siteName || grup.site || '')}"
              ${etki && etki.mantikli ? '' : 'disabled'}>${SZ.sepeteEkleBtn}</button>
          </div>
        </div>`;
      }).join(''));
    } catch {
      const kap = icerik.querySelector(`.kargo-kart[data-site="${CSS.escape(grup.site)}"] .kargo-kart-oneriler`);
      if (kap) {
        kap.removeAttribute('data-yukleniyor');
        kap.innerHTML = `<span class="kargo-yukleniyor">${esc(SZ.teklifAlinamadi)}</span>`;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Paylaşım                                                            */
/* ------------------------------------------------------------------ */

async function sepetPaylas() {
  const btn = $('#sepetPaylas');
  const el = $('#sepetPaylasSonuc');
  if (!durum.sonuc) { toast(SZ.onceHesapla, 'hata'); return; }
  btn.disabled = true;
  btn.textContent = SZ.linkOlusturuluyor;
  try {
    const r = await fetch('/api/sepet/paylas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sepet: durum.sonuc }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.hata || 'Paylaşım linki oluşturulamadı');
    const tam = v.url || (location.origin + (v.path || ''));
    try {
      await navigator.clipboard.writeText(tam);
      el.textContent = SZ.linkKopyalandi(tam);
    } catch {
      el.textContent = SZ.linkHazir(tam);
    }
    el.className = 'sepet-paylas-sonuc basarili';
  } catch (e) {
    el.textContent = '❌ ' + (e.message || 'Share failed');
    el.className = 'sepet-paylas-sonuc hata';
  } finally {
    btn.disabled = false;
    btn.textContent = SZ.paylasBtn;
  }
}

/* ------------------------------------------------------------------ */
/* Olay bağlama                                                        */
/* ------------------------------------------------------------------ */

function olaylariBagla() {
  $('#paketler')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-paket-ekle]');
    if (btn && !btn.disabled) paketEkle(btn.dataset.paketEkle);
  });

  const girdi = $('#sepetArama');
  girdi?.addEventListener('input', () => {
    clearTimeout(aramaZaman);
    const v = girdi.value.trim();
    if (v.length < 2 || /^https?:\/\//i.test(v)) {
      $('#sepetOneriler').hidden = true;
      girdi.setAttribute('aria-expanded', 'false');
      return;
    }
    aramaZaman = setTimeout(aramaYap, 320);
  });
  girdi?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      metinleSepeteEkle();
    } else if (e.key === 'Escape') {
      onerileriKapat();
    }
  });
  $('#sepetEkleBtn')?.addEventListener('click', metinleSepeteEkle);

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t?.closest('#sepetArama') && !t?.closest('#sepetOneriler') && !t?.closest('#sepetEkleBtn')) {
      onerileriKapat();
    }
  });

  $('#sepetOneriler')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sepet-oneri');
    if (!btn) return;
    const ok = sepeteEkle({
      ad: btn.dataset.ad,
      url: btn.dataset.url,
      tur: btn.dataset.tur === 'ad' ? 'ad' : 'url',
      kaynak: 'arama',
    });
    if (ok) {
      durumYaz(SZ.urunEklendi, 'basarili');
      $('#sepetOneriler').hidden = true;
      girdi.value = '';
    }
  });

  // Sepet satırı: adet ±, sil
  $('#sepetListe')?.addEventListener('click', (e) => {
    const adetBtn = e.target.closest('[data-adet]');
    if (adetBtn) {
      const id = adetBtn.dataset.id;
      const delta = Number(adetBtn.dataset.adet);
      const urun = durum.sepet.find(x => x.id === id);
      if (!urun) return;
      const toplam = durum.sepet.reduce((s, x) => s + Math.max(1, Number(x.adet) || 1), 0);
      if (delta > 0 && toplam >= MAKS_URUN) {
        toast(SZ.maksUrun(MAKS_URUN), 'hata');
        return;
      }
      urun.adet = Math.max(1, (Number(urun.adet) || 1) + delta);
      sepetKaydet();
      sepetCiz();
      return;
    }
    const silBtn = e.target.closest('.sepet-sil');
    if (silBtn) {
      durum.sepet = durum.sepet.filter(x => x.id !== silBtn.dataset.id);
      sepetKaydet();
      sepetCiz();
    }
  });

  $('#sepetTemizle')?.addEventListener('click', () => {
    durum.sepet = [];
    durum.sonuc = null;
    sepetKaydet();
    sonucKaydet();
    sepetCiz();
    $('#senaryoAlani').hidden = true;
    $('#kargoKurtarici').hidden = true;
    hataGoster('');
    toast(SZ.sepetBosaltildi);
  });

  $('#sepetHesapla')?.addEventListener('click', hesapla);

  $('#sepetIptal')?.addEventListener('click', async () => {
    durum.iptal = true;
    clearTimeout(durum.izleme);
    if (durum.isId) {
      try { await fetch('/api/sepet/' + encodeURIComponent(durum.isId) + '/iptal', { method: 'POST' }); } catch { /* yoksay */ }
    }
    hesaplaButonu(false);
    $('#sepetIlerlemeAlani').hidden = true;
    hataGoster(SZ.taramaDurduruldu || 'Tarama durduruldu. Sepetiniz korunuyor.');
  });

  $('#senaryoKartlari')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-satin-al]');
    if (btn) senaryoUrunleriniAc(btn.dataset.satinAl);
  });

  $('#kargoKurtariciIcerik')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ekle-url]');
    if (!btn) return;
    const ok = sepeteEkle({
      ad: btn.dataset.ekleAd,
      url: btn.dataset.ekleUrl,
      site: btn.dataset.ekleSite,
      fiyat: Number(btn.dataset.ekleFiyat),
      kaynak: 'elle',
    });
    if (ok) {
      toast('➕ Tamamlayıcı ürün sepete eklendi. Yeniden hesaplayın.', 'basarili');
      durumYaz('Kargo kurtarıcı ürünü eklendi — "3 Senaryoyu Karşılaştır" ile yeniden hesaplayın.', 'basarili');
    }
  });

  $('#sepetPaylas')?.addEventListener('click', sepetPaylas);
}

/* ------------------------------------------------------------------ */
/* Başlat                                                              */
/* ------------------------------------------------------------------ */

async function baslat() {
  olaylariBagla();
  sepetYukle();
  sepetCiz();
  await teklifleriYukle();
  paketleriCiz();

  // Önceki oturumun sonucu varsa geri yükle (sepet değişmediyse).
  try {
    const ham = localStorage.getItem(DEPO_PAKET);
    if (ham) {
      const v = JSON.parse(ham);
      const ayniSepet = JSON.stringify(sepetNormalize(v.sepet)) === JSON.stringify(durum.sepet);
      if (v.sonuc && ayniSepet && durum.sepet.length) {
        durum.sonuc = v.sonuc;
        senaryolariCiz(v.sonuc);
        kargoKurtariciCiz(v.sonuc);
      }
    }
  } catch { /* bozuk kayıt yoksayılır */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', baslat);
} else {
  baslat();
}

// Testler için (ağ olmadan hesap): saf modül + canlı durum.
window.__sepetTest = {
  durum, sepeteEkle, paketEkle, sepetCiz, senaryolariCiz, kargoFirsati,
  kargoKurtariciCiz, senaryoUrunleriniAc,
};
