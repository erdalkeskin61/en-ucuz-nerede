(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var kok = document.documentElement;
  var widget = $('widget');

  var parametreler = new URLSearchParams(location.search);
  var tema = (parametreler.get('tema') || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
  kok.setAttribute('data-tema', tema);

  var ref = parametreler.get('ref') || '';
  var mPar = (parametreler.get('market') || '').toLowerCase();
  var lPar = (parametreler.get('lang') || '').toLowerCase();
  var dil = /^(tr|en|fr|ja)$/.test(lPar) ? lPar : (mPar === 'fr' ? 'fr' : mPar === 'jp' || mPar === 'ja' ? 'ja' : (mPar === 'us' || mPar === 'eu' ? 'en' : 'tr'));
  kok.lang = dil;
  var modPar = (parametreler.get('mod') || '').toLowerCase();
  var sadeMi = modPar === 'karsilastir' || modPar === 'compare' || parametreler.get('sade') === '1';
  var siteKok = location.origin;

  var D = {
    tr: { ok: 'Stokta Var', no: 'Stokta Yok', buy: 'En Ucuza Satın Al', see: 'Fiyatı Sitede Gör', cmp: 'Tüm Mağazaları Gör ↗', free: 'Ücretsiz Kargo', now: 'az önce', m: ' dk önce', h: ' sa önce', d: ' gün önce', u: ' güncellendi', miss: 'Ürün bulunamadı.', nf: ' üzerinde arayın.', err: 'Canlı fiyat şu anda alınamadı.', chk: ' üzerinden kontrol edin.', tip: 'Son 90 günün en düşük fiyatı', dip: 'DİP', st: 'Mağaza', sig: ' — 60+ mağazada canlı fiyat' },
    en: { ok: 'In Stock', no: 'Out of Stock', buy: 'Buy Cheapest', see: 'View on Store', cmp: 'Compare all stores ↗', free: 'Free Shipping', now: 'just now', m: 'm ago', h: 'h ago', d: 'd ago', u: '', miss: 'Product not found.', nf: ' — search there.', err: 'Live price unavailable.', chk: ' — check live stock.', tip: 'Lowest price in 90 days', dip: 'LOW', st: 'Store', sig: ' — live 3D prices' },
    fr: { ok: 'En stock', no: 'Rupture', buy: 'Meilleur prix', see: 'Voir la boutique', cmp: 'Comparer les boutiques ↗', free: 'Livraison gratuite', now: 'à l’instant', m: 'm', h: 'h', d: 'j', u: '', miss: 'Produit introuvable.', nf: ' — rechercher.', err: 'Prix indisponible.', chk: ' — vérifier.', tip: 'Plus bas sur 90 j', dip: 'BAS', st: 'Boutique', sig: ' — prix en direct' },
    ja: { ok: '在庫あり', no: '在庫切れ', buy: '最安で購入', see: 'ショップで見る', cmp: '全ショップを比較 ↗', free: '送料無料', now: 'たった今', m: '分前', h: '時間前', d: '日前', u: '', miss: '商品が見つかりません。', nf: ' で検索してください。', err: '価格を取得できませんでした。', chk: ' で確認してください。', tip: '過去90日間の最安値', dip: '最安', st: 'ショップ', sig: ' — リアルタイム価格' }
  };
  var L = D[dil] || D.tr;

  var MARKA = 'baskihesap.tech';
  var yerelMi = (function () {
    var h = '';
    try { h = location.hostname || ''; } catch (e) { h = ''; }
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || /\.local$/i.test(h)) return true;
    return /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
  })();
  var markaAdi = yerelMi && location.host ? location.host : MARKA;
  var yolEk = dil === 'tr' ? '' : dil;
  var markaUrl = (yerelMi && location.origin ? location.origin + '/' : 'https://baskihesap.tech/') + yolEk;
  var markaIkon = yerelMi ? '🧪' : '⚡';

  function fiyatFmt(n, cur) {
    var s = Number(n);
    if (!isFinite(s)) return '—';
    var c = String(cur || (dil === 'en' ? 'USD' : dil === 'fr' ? 'EUR' : dil === 'ja' ? 'JPY' : 'TRY')).toUpperCase();
    if (c === 'JPY') return '¥' + Math.round(s).toLocaleString('ja-JP');
    if (c === 'EUR') return '€' + s.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (c === 'USD') return '$' + s.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '₺' + s.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function kac(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function yas(ts) {
    var t = Number(ts);
    if (!isFinite(t) || t <= 0) return '';
    var dk = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (dk < 1) return L.now + L.u;
    if (dk < 60) return dk + L.m + L.u;
    var sa = Math.round(dk / 60);
    if (sa < 24) return sa + L.h + L.u;
    return Math.round(sa / 24) + L.d + L.u;
  }

  function kargoKisa(k) {
    var s = String(k || '').trim();
    if (!s || /bilinmiyor/i.test(s)) return '';
    if (/ücretsiz|bedava|free|gratuit|無料/i.test(s)) return L.free;
    return s.length > 26 ? s.slice(0, 25) + '…' : s;
  }

  function imzaHtml() {
    return '<a class="widget-imza" href="' + kac(markaUrl) + '" target="_blank" '
      + 'rel="noopener" title="' + kac(markaAdi + L.sig) + '">'
      + markaIkon + ' ' + kac(markaAdi) + '</a>';
  }

  function durumHtml(ikon, metin) {
    widget.innerHTML = ''
      + '<div class="widget-durum">'
      + '  <span class="widget-durum-ikon" aria-hidden="true">' + ikon + '</span>'
      + '  <span class="widget-durum-metin">' + metin + '</span>'
      + '</div>'
      + '<div class="widget-alt"><span class="widget-guncelleme"></span>' + imzaHtml() + '</div>';
    widget.setAttribute('aria-busy', 'false');
  }

  function kartHtml(v) {
    if (v.lang && D[v.lang] && v.lang !== dil) { dil = v.lang; L = D[dil]; kok.lang = dil; }
    var u = v.urun || {};
    var kargo = kargoKisa(u.kargo);
    var stokta = u.stokta === true;
    var karsilastir = sadeMi || v.mod === 'karsilastir';

    var rozetler = [
      stokta
        ? '<span class="widget-rozet iyi">🟢 ' + L.ok + '</span>'
        : '<span class="widget-rozet kotu">🔴 ' + L.no + '</span>',
    ];
    if (kargo) {
      rozetler.push('<span class="widget-rozet' + (kargo === L.free ? ' iyi' : '') + '">🚚 ' + kac(kargo) + '</span>');
    }

    var ctaEtiket = karsilastir
      ? L.cmp
      : (stokta ? '🛒 ' + L.buy + (u.site ? ' (' + kac(u.site) + ')' : '') : '📊 ' + L.see);

    var gitYolu = u.id
      ? '/widget/git?id=' + encodeURIComponent(String(u.id)) + (ref ? '&ref=' + encodeURIComponent(ref) : '')
      : (v.gitUrl || v.hedef || (siteKok + '/'));
    var hedef = karsilastir ? (v.karsilastirUrl || markaUrl) : gitYolu;
    var ctaTag = karsilastir
      ? '<a class="widget-cta" href="' + kac(hedef) + '" target="_blank" rel="noopener">'
      : '<a class="widget-cta" href="' + kac(hedef) + '" target="_blank" rel="noopener sponsored" data-katalog="' + kac(u.id || u.slug || '') + '">';

    widget.innerHTML = ''
      + '<div class="widget-ust">'
      + '  <span class="widget-site' + (stokta ? '' : ' yok') + '">' + kac(u.site || L.st) + '</span>'
      + '  <span class="widget-ad" title="' + kac(u.ad) + '">' + kac(u.ad) + '</span>'
      + '</div>'
      + '<div class="widget-fiyat-satir">'
      + '  <span class="widget-fiyat">' + fiyatFmt(u.fiyat, v.currency || u.currency) + '</span>'
      + (u.birimMetni ? '  <span class="widget-birim">' + kac(u.birimMetni) + '</span>' : '')
      + (u.gercekFirsat ? '  <span class="widget-firsat" title="' + kac(L.tip) + '">🔥 ' + L.dip + '</span>' : '')
      + '</div>'
      + '<div class="widget-rozetler">' + rozetler.join('') + '</div>'
      + ctaTag + ctaEtiket + '</a>'
      + '<div class="widget-alt">'
      + '  <span class="widget-guncelleme">' + kac(yas(v.guncelleme)) + '</span>'
      + imzaHtml()
      + '</div>';

    widget.setAttribute('aria-busy', 'false');
  }

  function yukle() {
    var qs = new URLSearchParams();
    ['id', 'urun', 'q', 'ref', 'tema', 'lang', 'market', 'mod', 'sade'].forEach(function (k) {
      var v = parametreler.get(k);
      if (v) qs.set(k, v);
    });

    var url = '/api/widget' + (qs.toString() ? '?' + qs.toString() : '');
    var denetleyici = typeof AbortController === 'function' ? new AbortController() : null;
    var zaman = setTimeout(function () { if (denetleyici) denetleyici.abort(); }, 9000);

    fetch(url, denetleyici ? { signal: denetleyici.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (v) {
        clearTimeout(zaman);
        if (!v || v.bulundu !== true || !v.urun) {
          durumHtml('🔎', kac(v && v.neden ? v.neden : L.miss) + '<br><b>' + kac(markaAdi) + '</b>' + L.nf);
          return;
        }
        kartHtml(v);
      })
      .catch(function () {
        clearTimeout(zaman);
        durumHtml('⚠️', L.err + '<br><b>' + kac(markaAdi) + '</b>' + L.chk);
      });
  }

  yukle();
})();
