/**
 * 🌐 Dinamik UI Yerelleştirici (EN / FR / JA) — 2026-11-23
 *
 * app.js ve stl-hizli.js tarafından dinamik üretilen arayüz etiketlerini
 * (`Stokta Var`, `En ucuz`, `Mağazada Gör`, `Kargo Bedava`, vb.)
 * seçili dile çevirir. Ürün başlıklarına (`.kart-baslik`, `#kaynakBaslik`,
 * `.site-adi`) DOKUNMAZ. Türkçe (`tr`) ortamında çalışmaz.
 */
(() => {
  'use strict';
  const ortam = window.BASKI_HESAP_ORTAM;
  if (!ortam || !ortam.dil || ortam.dil === 'tr') return;
  const dil = ortam.dil;

  const SOZLUK = {
    en: [
      ['🏷️ En ucuz (kargo dahil)', '🏷️ Lowest price (incl. shipping)'],
      ['🏷️ En ucuz (+kargo sepette)', '🏷️ Lowest price (+shipping at checkout)'],
      ['📦 Kargo dahil (ücretsiz)', '📦 Free shipping included'],
      ['⚠️ +Kargo sepette eklenir', '⚠️ +Shipping calculated at checkout'],
      ['⚠️ Tüm Mağazalarda Tükendi', '⚠️ Out of Stock Everywhere'],
      ['Stok Yok', 'Out of Stock'],
      ['Stokta ürün bulunamadı', 'No in-stock offer found'],
      ['🟢 Stokta Var', '🟢 In Stock'],
      ['🔴 Stokta Yok', '🔴 Out of Stock'],
      ['Tükendi', 'Out of Stock'],
      ['Mağazada Gör (Tükendi)', 'View Store (Out of Stock)'],
      ['Mağazada Gör', 'Visit Store'],
      ['🔔 Fiyat Alarmı', '🔔 Price Alert'],
      ['🧺 Sepete Ekle', '🧺 Add to Basket'],
      ['🔌 Sitene Ekle', '🔌 Embed'],
      ['🚚 Kargo', '🚚 Shipping'],
      ['Bedava', 'Free'],
      ['Sepette belli', 'At checkout'],
      ['Kargo dahil toplam', 'Total incl. shipping'],
      ['gerçekte ödenecek tutar (kargo sepette belli)', 'subtotal (shipping at checkout)'],
      ['fiyat hesaplanamadı', 'price unavailable'],
      ['Koşullu kampanyalar (fiyata dahil değil)', 'Conditional offers (not included)'],
      ['İstek başarısız', 'Request failed'],
      ['URL veya ürün adı gerekli', 'URL or product name required'],
      ['Siteler araştırılıyor…', 'Scanning stores…'],
      ['mağaza incelendi', 'stores checked'],
      ['fiyat bulundu', 'prices found'],
      ['Kaynak:', 'Source:'],
      ['Marka:', 'Brand:'],
      ['Model kodu:', 'SKU:'],
      ['Barkod:', 'Barcode:'],
      ['Renk:', 'Color:'],
      ['FARKLI RENK:', 'DIFF. COLOR:'],
      ['Kaynak: ', 'Source: '],
      ['Tümü', 'All'],
      ['Vade Farksız Taksit', 'Installments'],
      ['Resmi Satıcı', 'Official Seller'],
      ['Filtrele:', 'Filter:'],
      ['Fiyat alarmı kur', 'Set Price Alert'],
      ['Bu ürünü takibe al', 'Track Price'],
      ['Sepetini böl — daha az öde', 'Split Your Basket — Pay Less'],
      ['Sepeti optimize et', 'Optimize Basket'],
      ['Mağazada mısın? Barkodu okut', 'In a Store? Scan Barcode / Photo'],
      ['Barkod okut', 'Scan Barcode'],
      ['Fotoğraftan ara', 'Search by Photo'],
      ['Barkodu yaz', 'Enter Barcode'],
      ['Ara & Kıyasla', 'Compare'],
      ['Dip Fırsatlar', 'Deals'],
      ['Alarmlarım', 'Alerts'],
      ['Tercihler', 'Settings'],
    ],
    fr: [
      ['🏷️ En ucuz (kargo dahil)', '🏷️ Meilleur prix (livraison incluse)'],
      ['🏷️ En ucuz (+kargo sepette)', '🏷️ Meilleur prix (+port au panier)'],
      ['📦 Kargo dahil (ücretsiz)', '📦 Livraison gratuite incluse'],
      ['⚠️ +Kargo sepette eklenir', '⚠️ +Frais de port calculés au panier'],
      ['⚠️ Tüm Mağazalarda Tükendi', '⚠️ Rupture partout'],
      ['Stok Yok', 'Rupture'],
      ['Stokta ürün bulunamadı', 'Aucune offre en stock trouvée'],
      ['🟢 Stokta Var', '🟢 En stock'],
      ['🔴 Stokta Yok', '🔴 Rupture de stock'],
      ['Tükendi', 'Rupture'],
      ['Mağazada Gör (Tükendi)', 'Voir (Rupture)'],
      ['Mağazada Gör', 'Voir l’offre'],
      ['🔔 Fiyat Alarmı', '🔔 Alerte Prix'],
      ['🧺 Sepete Ekle', '🧺 Ajouter au panier'],
      ['🔌 Sitene Ekle', '🔌 Widget'],
      ['🚚 Kargo', '🚚 Livraison'],
      ['Bedava', 'Gratuite'],
      ['Sepette belli', 'Au panier'],
      ['Kargo dahil toplam', 'Total livraison incluse'],
      ['gerçekte ödenecek tutar (kargo sepette belli)', 'sous-total (livraison au panier)'],
      ['fiyat hesaplanamadı', 'prix indisponible'],
      ['Koşullu kampanyalar (fiyata dahil değil)', 'Offres conditionnelles (hors total)'],
      ['Siteler araştırılıyor…', 'Analyse des boutiques…'],
      ['Kaynak:', 'Source :'],
      ['Marka:', 'Marque :'],
      ['Model kodu:', 'Réf. :'],
      ['Barkod:', 'Code-barres :'],
      ['Renk:', 'Couleur :'],
      ['FARKLI RENK:', 'AUTRE COULEUR :'],
      ['Tümü', 'Tout'],
      ['Resmi Satıcı', 'Vendeur officiel'],
      ['Filtrele:', 'Filtrer :'],
      ['Fiyat alarmı kur', 'Créer une alerte prix'],
      ['Bu ürünü takibe al', 'Suivre ce produit'],
      ['Sepetini böl — daha az öde', 'Divisez votre panier — Payez moins'],
      ['Sepeti optimize et', 'Optimiser le panier'],
      ['Mağazada mısın? Barkodu okut', 'En boutique ? Scannez le code-barres'],
      ['Barkod okut', 'Code-barres'],
      ['Fotoğraftan ara', 'Par photo'],
      ['Barkodu yaz', 'Saisir code'],
      ['Ara & Kıyasla', 'Comparer'],
      ['Dip Fırsatlar', 'Offres'],
      ['Alarmlarım', 'Alertes'],
      ['Tercihler', 'Préférences'],
    ],
    ja: [
      ['🏷️ En ucuz (kargo dahil)', '🏷️ 最安値（送料込）'],
      ['🏷️ En ucuz (+kargo sepette)', '🏷️ 最安値（＋送料別途）'],
      ['📦 Kargo dahil (ücretsiz)', '📦 送料無料'],
      ['⚠️ +Kargo sepette eklenir', '⚠️ ＋レジにて送料計算'],
      ['⚠️ Tüm Mağazalarda Tükendi', '⚠️ 全ストア在庫切れ'],
      ['Stok Yok', '在庫切れ'],
      ['Stokta ürün bulunamadı', '在庫ありの商品が見つかりませんでした'],
      ['🟢 Stokta Var', '🟢 在庫あり'],
      ['🔴 Stokta Yok', '🔴 在庫切れ'],
      ['Tükendi', '在庫切れ'],
      ['Mağazada Gör (Tükendi)', 'ショップへ (在庫切れ)'],
      ['Mağazada Gör', 'ショップへ'],
      ['🔔 Fiyat Alarmı', '🔔 価格アラート'],
      ['🧺 Sepete Ekle', '🧺 カートへ追加'],
      ['🔌 Sitene Ekle', '🔌 埋め込み'],
      ['🚚 Kargo', '🚚 送料'],
      ['Bedava', '無料'],
      ['Sepette belli', 'レジ計算'],
      ['Kargo dahil toplam', '送料込み合計'],
      ['gerçekte ödenecek tutar (kargo sepette belli)', '商品価格（送料別途）'],
      ['fiyat hesaplanamadı', '価格未取得'],
      ['Koşullu kampanyalar (fiyata dahil değil)', '条件付きキャンペーン（参考）'],
      ['Siteler araştırılıyor…', 'ストアを検索中…'],
      ['Kaynak:', '参照元:'],
      ['Marka:', 'ブランド:'],
      ['Model kodu:', '型番:'],
      ['Barkod:', 'JAN/EAN:'],
      ['Renk:', 'カラー:'],
      ['FARKLI RENK:', '色違い:'],
      ['Tümü', 'すべて'],
      ['Resmi Satıcı', '公式ストア'],
      ['Filtrele:', '絞り込み:'],
      ['Fiyat alarmı kur', '価格アラートを設定'],
      ['Bu ürünü takibe al', '追跡する'],
      ['Sepetini böl — daha az öde', '複数ショップ分割で最安購入'],
      ['Sepeti optimize et', 'カート最適化'],
      ['Mağazada mısın? Barkodu okut', 'バーコード・写真から最安検索'],
      ['Barkod okut', 'バーコード'],
      ['Fotoğraftan ara', '写真で検索'],
      ['Barkodu yaz', '手入力'],
      ['Ara & Kıyasla', '比較'],
      ['Dip Fırsatlar', '特価'],
      ['Alarmlarım', 'アラート'],
      ['Tercihler', '設定'],
    ],
  }[dil];

  if (!SOZLUK) return;
  const KORUNAN = '.kart-baslik, #kaynakBaslik, .site-adi, #gecmisListe, #footerSiteler, #dilSecici, script, style';

  let zamanli = null;
  function uygula(kok) {
    if (!kok) return;
    const walker = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (!p || p.closest(KORUNAN)) continue;
      let val = node.nodeValue;
      if (!val || val.trim().length < 2) continue;
      let degisti = false;
      for (const [tr, hedef] of SOZLUK) {
        if (val.includes(tr)) {
          val = val.split(tr).join(hedef);
          degisti = true;
        }
      }
      if (degisti) node.nodeValue = val;
    }
  }

  function cevir() {
    if (zamanli) return;
    zamanli = requestAnimationFrame(() => {
      zamanli = null;
      uygula(document.querySelector('main'));
      uygula(document.getElementById('altNav'));
      for (const id of ['teklifFisModal', 'altModal']) {
        const el = document.getElementById(id);
        if (el && !el.hidden) uygula(el);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('main');
    if (main) {
      new MutationObserver(cevir).observe(main, {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'],
      });
    }
    cevir();
  });
})();
