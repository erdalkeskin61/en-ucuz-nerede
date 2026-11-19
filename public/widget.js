/* Widget istemcisi. /api/widget'ten gerçek en ucuz stoklu fiyatı alır.
   Parametreler: ?id=1 | ?urun=slug | ?q=metin · ?tema=dark|light · ?ref=... */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var kok = document.documentElement;
  var widget = $('widget');

  var parametreler = new URLSearchParams(location.search);
  var tema = (parametreler.get('tema') || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
  kok.setAttribute('data-tema', tema);

  var ref = parametreler.get('ref') || '';
  var siteKok = location.origin;

  // Yerelde gerçek alan adı yok: var olmayan domaine link verme.
  var MARKA = 'baskihesap.tech';
  var yerelMi = (function () {
    var h = '';
    try { h = location.hostname || ''; } catch (e) { h = ''; }
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    if (/\.local$/i.test(h)) return true;
    if (/^(10|127)\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  })();
  var markaAdi = yerelMi && location.host ? location.host : MARKA;
  var markaUrl = yerelMi && location.origin ? location.origin + '/' : 'https://baskihesap.tech/';
  var markaIkon = yerelMi ? '🧪' : '⚡';

  // 758.65 → "₺758,65"
  function tl(n) {
    var sayi = Number(n);
    if (!isFinite(sayi)) return '—';
    return '₺' + sayi.toLocaleString('tr-TR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  // XSS kaçışı
  function kac(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // "20 dk önce"
  function yas(ts) {
    var t = Number(ts);
    if (!isFinite(t) || t <= 0) return '';
    var dk = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (dk < 1) return 'az önce güncellendi';
    if (dk < 60) return dk + ' dk önce güncellendi';
    var sa = Math.round(dk / 60);
    if (sa < 24) return sa + ' sa önce güncellendi';
    return Math.round(sa / 24) + ' gün önce güncellendi';
  }

  // Kargo etiketi
  function kargoKisa(k) {
    var s = String(k || '').trim();
    if (!s) return '';
    if (/ücretsiz|bedava|free/i.test(s)) return 'Ücretsiz Kargo';
    if (/bilinmiyor/i.test(s)) return '';
    return s.length > 26 ? s.slice(0, 25) + '…' : s;
  }

  function imzaHtml() {
    // dofollow backlink (SEO); yerelde doğru adres.
    return '<a class="widget-imza" href="' + kac(markaUrl) + '" target="_blank" '
      + 'rel="noopener" title="' + kac(markaAdi) + ' — 60+ mağazada canlı fiyat">'
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
    var u = v.urun || {};
    var kargo = kargoKisa(u.kargo);
    var stokta = u.stokta === true;

    var rozetler = [
      stokta
        ? '<span class="widget-rozet iyi">🟢 Stokta Var</span>'
        : '<span class="widget-rozet kotu">🔴 Stokta Yok</span>',
    ];
    if (kargo) {
      rozetler.push('<span class="widget-rozet' + (/ücretsiz/i.test(kargo) ? ' iyi' : '')
        + '">🚚 ' + kac(kargo) + '</span>');
    }

    var ctaEtiket = stokta
      ? '🛒 En Ucuza Satın Al' + (u.site ? ' (' + kac(u.site) + ')' : '')
      : '📊 Fiyatı Sitede Gör';

    // CTA: tıklama sayımı + ref atfı (göreli URL).
    var gitYolu = '/widget/git?id=' + encodeURIComponent(String(u.id || ''))
      + (ref ? '&ref=' + encodeURIComponent(ref) : '');
    var hedef = u.id ? gitYolu : (v.hedef || v.gitUrl || (siteKok + '/'));

    widget.innerHTML = ''
      + '<div class="widget-ust">'
      + '  <span class="widget-site' + (stokta ? '' : ' yok') + '">' + kac(u.site || 'Mağaza') + '</span>'
      + '  <span class="widget-ad" title="' + kac(u.ad) + '">' + kac(u.ad) + '</span>'
      + '</div>'
      + '<div class="widget-fiyat-satir">'
      + '  <span class="widget-fiyat">' + tl(u.fiyat) + '</span>'
      + (u.birimMetni
        ? '  <span class="widget-birim">' + kac(u.birimMetni) + '</span>'
        : '')
      + (u.gercekFirsat
        ? '  <span class="widget-firsat" title="Son 90 günün en düşük fiyatı">🔥 DİP</span>'
        : '')
      + '</div>'
      + '<div class="widget-rozetler">' + rozetler.join('') + '</div>'
      + '<a class="widget-cta" href="' + kac(hedef) + '" target="_blank" '
      + 'rel="noopener sponsored" data-katalog="' + kac(u.id) + '">' + ctaEtiket + '</a>'
      + '<div class="widget-alt">'
      + '  <span class="widget-guncelleme">' + kac(yas(v.guncelleme)) + '</span>'
      + imzaHtml()
      + '</div>';

    widget.setAttribute('aria-busy', 'false');
  }

  function yukle() {
    var qs = new URLSearchParams();
    ['id', 'urun', 'q', 'ref', 'tema'].forEach(function (k) {
      var v = parametreler.get(k);
      if (v) qs.set(k, v);
    });

    var url = '/api/widget' + (qs.toString() ? '?' + qs.toString() : '');
    var denetleyici = typeof AbortController === 'function' ? new AbortController() : null;
    var zaman = setTimeout(function () {
      if (denetleyici) denetleyici.abort();
    }, 9000);

    fetch(url, denetleyici ? { signal: denetleyici.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (v) {
        clearTimeout(zaman);
        if (!v || v.bulundu !== true || !v.urun) {
          durumHtml('🔎', kac(v && v.neden ? v.neden : 'Ürün bulunamadı.')
            + '<br><b>' + kac(markaAdi) + '</b> üzerinde arayın.');
          return;
        }
        // Tükendiyse "satın al" denmez.
        kartHtml(v);
      })
      .catch(function () {
        clearTimeout(zaman);
        durumHtml('⚠️', 'Canlı fiyat şu anda alınamadı.<br>'
          + '<b>' + kac(markaAdi) + '</b> üzerinden kontrol edin.');
      });
  }

  yukle();
})();
