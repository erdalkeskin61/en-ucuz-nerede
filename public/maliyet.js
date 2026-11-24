/**
 * 🧮 3D Baskı Maliyet & Kârlılık Hesaplayıcı (2026-11-04)
 *
 * Tasarım hedefi: slider oynarken 0 ms gecikmeyle güncellenen bento panel.
 * Bu yüzden hesap TAMAMEN istemcide yapılır; sunucuya yalnızca (a) yazıcı
 * şablonları, (b) canlı filament fiyatları için ve (c) teklif doğrulaması
 * için gidilir. Kritik kural: hesap formülü `src/baskiMaliyet.js` ile BİREBİR
 * aynıdır — sunucu doğrulaması ile istemci sonucu tutmazsa kullanıcı yanıltılmış
 * olur.
 *
 * DÜRÜSTLÜK: canlı filament listesi boşsa uydurma fiyat gösterilmez; manuel
 * girişe yönlendirilir. CTA yalnızca gerçek, stoklu bir kayıt varsa görünür.
 */
(() => {
  'use strict';

  /* ---------------- Bölgesel Ortam & Sabitler ---------------- */
  const ORTAM = (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM) || {};
  const ORTAM_DIL = ORTAM.dil || 'tr';
  const ORTAM_MARKET = ORTAM.market || 'tr';
  const ORTAM_PARA = ORTAM.currency || 'TRY';
  const ORTAM_YEREL = ORTAM.yerel || 'tr-TR';
  const M_VAR = ORTAM.maliyetVarsayilan || {};

  const M_SZ = {
    tr: {
      sureTahmini: (s) => `süre tahmini (${s} sa) · hammadde + elektrik + amortisman`,
      maliyetBas: 'Maliyet (Başabaş)', hobi: 'Dost İşi / Hobi', atolye: 'Standart Atölye', ticari: 'Ticari / Özel Tasarım',
      karsiz: 'kârsız', karOran: (y, x) => `%${y} kâr · ${x}x`,
      ctaMetin: (fKg, site) => `💡 Bu modeli en ekonomik maliyetle basabileceğiniz filament şu anda <b>${fKg}/kg</b> ile <b>${site || 'mağaza'}</b> mağazasında stokta!`,
      ctaBtn: (fKg) => `🛒 En Ucuz Filamenti Satın Al (${fKg})`,
      varsayim: (guc, el, amp, sureTah, gs) => `<b>Kullanılan varsayımlar:</b> ${guc} W yazıcı gücü · ${el}/kWh elektrik · ${amp}/saat amortisman${sureTah ? ` · süre gramajdan tahmin edildi (${gs} g/sa)` : ''}. Fiyatlar <b>KDV hariçtir</b>. Filament fiyatı canlı radar taramasından gelir.`,
      sureIpucuTah: (gs) => `✨ Tahmini süre — gramajdan hesaplandı (${gs} g/saat). Dilimleyiciden okuduğunuz süreyi girin.`,
      sureIpucuN: 'Dilimleyicideki tahmini süre.',
      canliYok: 'Canlı filamente ulaşılamadı. <a href="#" id="manuelGec">Manuel fiyat girin</a> ya da radarın taranmasını bekleyin.',
      ozelAd: 'Özel / Manuel giriş', ozelKisa: 'Özel',
      sunucuHata: 'Canlı filament fiyatları alınamadı (sunucuya ulaşılamadı).',
    },
    en: {
      sureTahmini: (s) => `est. time (${s} hr) · material + electricity + depreciation`,
      maliyetBas: 'Break-even Cost', hobi: 'Hobby / Friend', atolye: 'Standard Workshop', ticari: 'Commercial / Custom',
      karsiz: 'no profit', karOran: (y, x) => `${y}% margin · ${x}x`,
      dolulukKel: 'infill', karDahil: (yuz, kr) => `Includes ${yuz} workshop margin · profit ${kr}`,
      ctaMetin: (fKg, site) => `💡 The lowest-cost in-stock spool for this print is currently <b>${fKg}/kg</b> at <b>${site || 'store'}</b>!`,
      ctaBtn: (fKg) => `🛒 Buy Cheapest Filament (${fKg})`,
      varsayim: (guc, el, amp, sureTah, gs) => `<b>Assumptions:</b> ${guc} W printer power · ${el}/kWh electricity · ${amp}/hr depreciation${sureTah ? ` · time estimated from weight (${gs} g/hr)` : ''}. Prices exclude tax and reflect live regional scans.`,
      sureIpucuTah: (gs) => `✨ Estimated print time from weight (${gs} g/hr). Enter your slicer time for exact results.`,
      sureIpucuN: 'Estimated print time from slicer.',
      canliYok: 'No cached live filament in this region yet. <a href="#" id="manuelGec">Enter manual price</a> or wait for scan updates.',
      ozelAd: 'Custom / Manual input', ozelKisa: 'Custom',
      sunucuHata: 'Could not reach server for live filament prices.',
    },
    fr: {
      sureTahmini: (s) => `durée est. (${s} h) · matière + électricité + amortissement`,
      maliyetBas: 'Prix coûtant', hobi: 'Loisir / Ami', atolye: 'Atelier Standard', ticari: 'Commercial / Pro',
      karsiz: 'sans marge', karOran: (y, x) => `marge ${y} % · ${x}x`,
      dolulukKel: 'remplissage', karDahil: (yuz, kr) => `Marge atelier ${yuz} incluse · marge ${kr}`,
      ctaMetin: (fKg, site) => `💡 La bobine la plus économique en stock est actuellement à <b>${fKg}/kg</b> chez <b>${site || 'boutique'}</b> !`,
      ctaBtn: (fKg) => `🛒 Acheter le filament le moins cher (${fKg})`,
      varsayim: (guc, el, amp, sureTah, gs) => `<b>Hypothèses :</b> puissance ${guc} W · électricité ${el}/kWh · amortissement ${amp}/h${sureTah ? ` · durée estimée (${gs} g/h)` : ''}. Prix hors TVA issus de l’analyse régionale.`,
      sureIpucuTah: (gs) => `✨ Durée estimée d’après le poids (${gs} g/h). Saisissez la durée du slicer pour plus de précision.`,
      sureIpucuN: 'Durée estimée issue du slicer.',
      canliYok: 'Aucune bobine en cache pour cette région. <a href="#" id="manuelGec">Saisir un prix manuel</a> ou patienter.',
      ozelAd: 'Personnalisé / Saisie manuelle', ozelKisa: 'Manuel',
      sunucuHata: 'Impossible de charger les prix des filaments.',
    },
    ja: {
      sureTahmini: (s) => `予想時間 (${s} 時間) · 材料 + 電気 + 償却`,
      maliyetBas: '原価（損益分岐）', hobi: '趣味・実費', atolye: '標準工房価格', ticari: '商用・受注販売',
      karsiz: '利益なし', karOran: (y, x) => `利益 ${y}% · ${x}倍`,
      dolulukKel: 'インフィル', karDahil: (yuz, kr) => `工房利益 ${yuz} 込み · 利益 ${kr}`,
      ctaMetin: (fKg, site) => `💡 このモデルに最安の在庫ありフィラメントは <b>${site || 'ショップ'}</b> の <b>${fKg}/kg</b> です！`,
      ctaBtn: (fKg) => `🛒 最安フィラメントを購入 (${fKg})`,
      varsayim: (guc, el, amp, sureTah, gs) => `<b>計算前提:</b> 消費電力 ${guc} W · 電気代 ${el}/kWh · 償却費 ${amp}/時間${sureTah ? ` · 重量から推定 (${gs} g/h)` : ''}。税抜参考値（地域スキャン連動）。`,
      sureIpucuTah: (gs) => `✨ 重量から推定された時間 (${gs} g/h)。スライサーの時間を入力するとより正確です。`,
      sureIpucuN: 'スライサーの予想時間。',
      canliYok: 'この地域のライブ価格がまだ取得されていません。<a href="#" id="manuelGec">手動価格を入力</a>してください。',
      ozelAd: 'カスタム / 手動入力', ozelKisa: 'カスタム',
      sunucuHata: 'ライブフィラメント価格を取得できませんでした。',
    },
  }[ORTAM_DIL] || {};

  const GRAM_SAAT = 12.5;
  const VARSAYILAN = {
    gramaj: 160,
    sureSaat: 4,
    gucW: 150,
    kwhTl: Number(M_VAR.kwhTl) > 0 ? Number(M_VAR.kwhTl) : 2.9,
    yipranmaSaatTl: Number(M_VAR.yipranmaSaatTl) >= 0 ? Number(M_VAR.yipranmaSaatTl) : 3,
    karCarpani: 2.5,
  };

  /* ---------------- Durum ---------------- */
  const durum = {
    yazicilar: [],
    karSablonlari: {},
    filamentler: [],
    filamentModu: 'canli', // 'canli' | 'manuel'
    secilenFilamentId: null,
    manuelTlKg: Number(M_VAR.manuelTlKg) > 0 ? Number(M_VAR.manuelTlKg) : 600,
    manuelAd: 'PLA',
    // form
    gramaj: VARSAYILAN.gramaj,
    sureSaat: VARSAYILAN.sureSaat,
    sureOtomatik: false, // "✨ Tahmin et" ile mi belirlendi?
    gucW: VARSAYILAN.gucW,
    kwhTl: VARSAYILAN.kwhTl,
    yipranmaSaatTl: VARSAYILAN.yipranmaSaatTl,
    karCarpani: VARSAYILAN.karCarpani,
    seciliKar: 'atolye',
  };

  /* ---------------- Kısa yardımcılar ---------------- */
  const BASAMAK = ORTAM_PARA === 'JPY' ? 0 : 2;
  const CARPAN_BASAMAK = 10 ** BASAMAK;
  const paraYuvarla = (n) => Math.round((Number(n) || 0) * CARPAN_BASAMAK) / CARPAN_BASAMAK;

  const $ = (id) => document.getElementById(id);
  const tl = (n) => Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const fPara = (n) => (ORTAM_DIL === 'tr'
    ? ('₺' + tl(n))
    : (typeof window.formatPara === 'function'
      ? window.formatPara(n, ORTAM_PARA, ORTAM_YEREL)
      : Number(n || 0).toLocaleString(ORTAM_YEREL, { style: 'currency', currency: ORTAM_PARA })));

  const MALZEME_CEVIRI = {
    en: {
      'TPU (Esnek)': 'TPU (Flexible)', 'Karbon Fiber (CF)': 'Carbon Fiber (CF)',
      'Hyper / Yüksek Hız': 'Hyper / High-Speed', 'PVA (Destek)': 'PVA (Support)',
      'Standart Reçine': 'Standard Resin', 'ABS-Like Reçine': 'ABS-Like Resin',
      'Tough / Dayanıklı': 'Tough Resin', Support: 'Support',
    },
    fr: {
      'TPU (Esnek)': 'TPU (Souple)', 'Karbon Fiber (CF)': 'Fibre de carbone (CF)',
      'Hyper / Yüksek Hız': 'Hyper / Haute Vitesse', 'PVA (Destek)': 'PVA (Support)',
      'Standart Reçine': 'Résine standard', 'ABS-Like Reçine': 'Résine ABS-Like',
      'Tough / Dayanıklı': 'Résine Tough', Support: 'Support',
    },
    ja: {
      'TPU (Esnek)': 'TPU（柔軟）', 'Karbon Fiber (CF)': 'カーボン配合 (CF)',
      'Hyper / Yüksek Hız': 'Hyper / 高速印刷', 'PVA (Destek)': 'PVA（サポート）',
      'Standart Reçine': '標準レジン', 'ABS-Like Reçine': 'ABSライクレジン',
      'Tough / Dayanıklı': '高強度レジン', Support: 'サポート材',
    },
  };
  const RENK_CEVIRI = {
    en: {
      siyah: 'Black', beyaz: 'White', gri: 'Grey', 'açık gri': 'Light Grey', 'koyu gri': 'Dark Grey',
      kırmızı: 'Red', mavi: 'Blue', yeşil: 'Green', sarı: 'Yellow', turuncu: 'Orange',
      mor: 'Purple', pembe: 'Pink', altın: 'Gold', bakır: 'Copper', bronz: 'Bronze',
      ten: 'Skin', bej: 'Beige', latte: 'Latte', antrasit: 'Anthracite', gümüş: 'Silver',
      lacivert: 'Navy', turkuaz: 'Teal', bordo: 'Burgundy', mermer: 'Marble', naturel: 'Natural',
      kum: 'Sand', mokka: 'Mocha', 'nane yeşili': 'Mint Green', şeffaf: 'Clear', ipek: 'Silk',
    },
    fr: {
      siyah: 'Noir', beyaz: 'Blanc', gri: 'Gris', 'açık gri': 'Gris clair', 'koyu gri': 'Gris foncé',
      kırmızı: 'Rouge', mavi: 'Bleu', yeşil: 'Vert', sarı: 'Jaune', turuncu: 'Orange',
      mor: 'Violet', pembe: 'Rose', altın: 'Or', bakır: 'Cuivre', bronz: 'Bronze',
      ten: 'Chair', bej: 'Beige', latte: 'Latte', antrasit: 'Anthracite', gümüş: 'Argent',
      lacivert: 'Bleu marine', turkuaz: 'Turquoise', bordo: 'Bordeaux', mermer: 'Marbre', naturel: 'Naturel',
      kum: 'Sable', mokka: 'Moka', 'nane yeşili': 'Menthe', şeffaf: 'Transparent', ipek: 'Soie',
    },
    ja: {
      siyah: 'ブラック', beyaz: 'ホワイト', gri: 'グレー', 'açık gri': 'ライトグレー', 'koyu gri': 'ダークグレー',
      kırmızı: 'レッド', mavi: 'ブルー', yeşil: 'グリーン', sarı: 'イエロー', turuncu: 'オレンジ',
      mor: 'パープル', pembe: 'ピンク', altın: 'ゴールド', bakır: 'カッパー', bronz: 'ブロンズ',
      ten: 'スキン', bej: 'ベージュ', latte: 'ラテ', antrasit: 'アンスラサイト', gümüş: 'シルバー',
      lacivert: 'ネイビー', turkuaz: 'ターコイズ', bordo: 'ワインレッド', mermer: 'マーブル', naturel: 'ナチュラル',
      kum: 'サンド', mokka: 'モカ', 'nane yeşili': 'ミント', şeffaf: 'クリア', ipek: 'シルク',
    },
  };
  const malzemeYerel = (m) => {
    const s = String(m || '').trim();
    if (!s || ORTAM_DIL === 'tr') return s;
    return MALZEME_CEVIRI[ORTAM_DIL]?.[s] || s;
  };
  const renkYerel = (r) => {
    const s = String(r || '').trim();
    if (!s || ORTAM_DIL === 'tr') return s;
    const k = s.toLocaleLowerCase('tr-TR');
    return RENK_CEVIRI[ORTAM_DIL]?.[k] || s;
  };

  function el(tag, sinif, metin) {
    const d = document.createElement(tag);
    if (sinif) d.className = sinif;
    if (metin != null) d.textContent = metin;
    return d;
  }

  /** Renk adından CSS rengi (yoksa nötr gri). */
  const RENK_HEX = {
    siyah: '#1f2937', beyaz: '#f8fafc', gri: '#94a3b8', 'açık gri': '#cbd5e1',
    'koyu gri': '#475569', kırmızı: '#dc2626', mavi: '#2563eb', yeşil: '#16a34a',
    sarı: '#eab308', turuncu: '#ea580c', mor: '#7c3aed', pembe: '#ec4899',
    altın: '#d4af37', bakır: '#b87333', bronz: '#cd7f32', ten: '#e8c39e',
    bej: '#d9c7a7', latte: '#c8a882', antrasit: '#374151', gümüş: '#c0c0c0',
    'lacivert': '#1e3a8a', turkuaz: '#14b8a6', bordo: '#7f1d1d', mermer: '#e5e7eb',
    naturel: '#e5e0d5', kum: '#d2b48c', mokka: '#6f4e37', 'nane yeşili': '#a7d8b0',
    şeffaf: '#e2e8f0', ipek: '#d8b4fe',
  };
  const renkHex = (ad) => RENK_HEX[String(ad || '').toLocaleLowerCase('tr-TR')] || '#9ca3af';

  /* ================= HESAP (para birimi hassasiyetiyle tutarlı) ================= */
  function hesapla() {
    const g = Number(durum.gramaj);
    const sure = Number(durum.sureSaat) > 0 ? Number(durum.sureSaat) : g / GRAM_SAAT;
    const guc = Number(durum.gucW);
    const kwhTl = Number(durum.kwhTl);
    const yipranma = Number(durum.yipranmaSaatTl);
    const tlKg = aktifTlKg();
    const carpan = Number(durum.karCarpani) || 2;

    const kwh = (guc * sure) / 1000;
    // Görünür kalemler ve net maliyet aynı kuruş/Yen basamağına yuvarlanır:
    // böylece kalem toplamı == Net Maliyet ve Net × 2 == 2× kartı her zaman tutar.
    const hammadde = paraYuvarla((g / 1000) * tlKg);
    const elektrik = paraYuvarla(kwh * kwhTl);
    const amortisman = paraYuvarla(sure * yipranma);
    const net = paraYuvarla(hammadde + elektrik + amortisman);

    const fiyat = (c) => {
      const fTutar = paraYuvarla(net * c);
      return {
        carpan: c,
        fiyat: fTutar,
        kar: paraYuvarla(fTutar - net),
        karYuzde: Math.round((c - 1) * 100),
      };
    };

    const secilenFiyat = paraYuvarla(net * carpan);
    return {
      gramaj: g, sureSaat: Math.round(sure * 100) / 100,
      sureTahmini: durum.sureOtomatik === true || !(Number(durum.sureSaat) > 0),
      gucW: guc, kwhTl, yipranmaSaatTl: yipranma, tlKg, kwh,
      hammadde, elektrik, amortisman, net,
      carpan,
      secilen: secilenFiyat,
      karTl: paraYuvarla(secilenFiyat - net),
      satis: {
        maliyet: fiyat(1), hobi: fiyat(2), atolye: fiyat(2.5), ticari: fiyat(3),
      },
    };
  }

  function aktifFilament() {
    if (durum.filamentModu === 'manuel') return null;
    return durum.filamentler.find(f => f.id === durum.secilenFilamentId) || durum.filamentler[0] || null;
  }

  function aktifTlKg() {
    if (durum.filamentModu === 'manuel') return Number(durum.manuelTlKg) || 0;
    const f = aktifFilament();
    return f ? Number(f.tlKg) : (Number(durum.manuelTlKg) || 0);
  }

  /* ================= RENDER ================= */
  let sonDegerler = {};

  /** Değer değiştiyse kısa vurgu animasyonu uygular. */
  function vurgula(id, yeni) {
    const d = $(id);
    if (!d) return;
    const onceki = sonDegerler[id];
    d.textContent = yeni;
    if (onceki !== undefined && onceki !== yeni) {
      d.classList.remove('mz-degisti');
      void d.offsetWidth;
      d.classList.add('mz-degisti');
    }
    sonDegerler[id] = yeni;
  }

  function render() {
    const h = hesapla();
    const f = aktifFilament();

    // --- Bento kartları ---
    vurgula('ciktiHammadde', fPara(h.hammadde));
    $('ciktiHammaddeAlt').textContent = `${h.gramaj} g × ${fPara(h.tlKg)}/kg`;
    vurgula('ciktiElektrik', fPara(h.elektrik));
    $('ciktiElektrikAlt').textContent = `${h.kwh.toFixed(2).replace('.', ORTAM_DIL === 'en' || ORTAM_DIL === 'ja' ? '.' : ',')} kWh × ${fPara(h.kwhTl)}`;
    vurgula('ciktiAmortisman', fPara(h.amortisman));
    const saBirim = ORTAM_DIL === 'ja' ? '時間' : (ORTAM_DIL === 'fr' ? 'h' : (ORTAM_DIL === 'en' ? 'hr' : 'sa'));
    const netNormal = ORTAM_DIL === 'ja' ? '材料 + 電気 + 償却' : (ORTAM_DIL === 'fr' ? 'matière + électricité + amortissement' : (ORTAM_DIL === 'en' ? 'material + electricity + depreciation' : 'hammadde + elektrik + amortisman'));
    $('ciktiAmortismanAlt').textContent = `${h.sureSaat} ${saBirim} × ${fPara(h.yipranmaSaatTl)}`;
    vurgula('ciktiNet', fPara(h.net));
    $('ciktiNetAlt').textContent = h.sureTahmini
      ? (M_SZ.sureTahmini ? M_SZ.sureTahmini(h.sureSaat) : `süre tahmini (${h.sureSaat} sa) · hammadde + elektrik + amortisman`)
      : netNormal;

    // --- Fiyat panosu ---
    const pano = $('fiyatPanosu');
    const sira = [
      ['maliyet', '🟢', M_SZ.maliyetBas || 'Maliyet (Başabaş)'],
      ['hobi', '🟡', M_SZ.hobi || 'Dost İşi / Hobi'],
      ['atolye', '🔵', M_SZ.atolye || 'Standart Atölye'],
      ['ticari', '🟣', M_SZ.ticari || 'Ticari / Özel Tasarım'],
    ];
    pano.innerHTML = '';
    for (const [anahtar, ikon, ad] of sira) {
      const v = h.satis[anahtar];
      const kutu = el('div', `mz-fiyat f-${anahtar}` + (durum.seciliKar === anahtar ? ' secili' : ''));
      kutu.innerHTML = `
        <span class="mz-fiyat-ad">${ikon} ${ad}</span>
        <span class="mz-fiyat-tutar">${kacis(fPara(v.fiyat))}</span>
        <span class="mz-fiyat-kar">${v.karYuzde === 0 ? (M_SZ.karsiz || 'kârsız') : (M_SZ.karOran ? M_SZ.karOran(v.karYuzde, v.carpan) : `%${v.karYuzde} kâr · ${v.carpan}x`)} · +${kacis(fPara(v.kar))}</span>`;
      kutu.setAttribute('role', 'button');
      kutu.tabIndex = 0;
      const sec = () => {
        durum.seciliKar = anahtar;
        durum.karCarpani = v.carpan;
        // Slider'ı da eşitle (yüzde karşılığı)
        const yuzde = v.karYuzde;
        if (yuzde >= 50 && yuzde <= 300) $('karKaydirici').value = String(yuzde);
        $('karEtiket').textContent = `${yuzdeMetni(v.karYuzde)} · ${v.carpan}x`;
        render();
      };
      kutu.addEventListener('click', sec);
      kutu.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sec(); }
      });
      pano.appendChild(kutu);
    }

    // --- Seçili fiyat ---
    const secili = h.satis[durum.seciliKar] || h.satis.atolye;
    vurgula('secilenFiyat', fPara(secili.fiyat));
    vurgula('secilenKar', fPara(secili.kar));

    // --- CTA: yalnızca canlı filament seçili ve gerçek kayıt varsa ---
    const cta = $('ctaKart');
    if (f && durum.filamentModu === 'canli') {
      cta.hidden = false;
      $('ctaMetin').innerHTML = M_SZ.ctaMetin
        ? M_SZ.ctaMetin(kacis(fPara(f.tlKg)), kacis(f.site))
        : (`💡 Bu modeli en ekonomik maliyetle basabileceğiniz filament şu anda <b>${kacis(fPara(f.tlKg))}/kg</b> ile <b>${kacis(f.site || 'mağaza')}</b> mağazasında stokta!`);
      const btn = $('ctaBtn');
      btn.href = f.url;
      btn.textContent = M_SZ.ctaBtn ? M_SZ.ctaBtn(fPara(f.tlKg)) : `🛒 En Ucuz Filamenti Satın Al (${fPara(f.tlKg)})`;
    } else {
      cta.hidden = true;
    }

    // --- Varsayım kutusu ---
    $('varsayimKutu').innerHTML = M_SZ.varsayim
      ? M_SZ.varsayim(h.gucW, kacis(fPara(h.kwhTl)), kacis(fPara(h.yipranmaSaatTl)), h.sureTahmini, GRAM_SAAT)
      : (`<b>Kullanılan varsayımlar:</b> ${h.gucW} W yazıcı gücü · `
        + `${kacis(fPara(h.kwhTl))}/kWh elektrik · ${kacis(fPara(h.yipranmaSaatTl))}/saat amortisman`
        + `${h.sureTahmini ? ` · süre gramajdan tahmin edildi (${GRAM_SAAT} g/sa)` : ''}. `
        + `Fiyatlar <b>KDV hariçtir</b>. Filament fiyatı canlı radar taramasından gelir.`);

    // --- Etiketler ---
    $('gramajEtiket').textContent = `${h.gramaj} g`;
    $('gucEtiket').textContent = `${h.gucW} W`;
    $('karEtiket').textContent = `${yuzdeMetni(Math.round((h.carpan - 1) * 100))} · ${h.carpan}x`;
    $('sureIpucu').textContent = h.sureTahmini
      ? (M_SZ.sureIpucuTah ? M_SZ.sureIpucuTah(GRAM_SAAT) : `✨ Tahmini süre — gramajdan hesaplandı (${GRAM_SAAT} g/saat). Dilimleyiciden okuduğunuz süreyi girin.`)
      : (M_SZ.sureIpucuN || 'Dilimleyicideki tahmini süre.');

    return h;
  }

  const kacis = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));

  const yuzdeMetni = (y) => (ORTAM_DIL === 'tr'
    ? `%${y}`
    : (ORTAM_DIL === 'fr' ? `${y} %` : `${y}%`));

  /* ================= FİLAMENT LİSTESİ ================= */
  function filamentleriCiz() {
    const kap = $('filamentCanli');
    kap.innerHTML = '';

    if (!durum.filamentler.length) {
      const p = el('p', 'mz-bos');
      p.innerHTML = M_SZ.canliYok || ('Canlı filamente ulaşılamadı. '
        + '<a href="#" id="manuelGec">Manuel fiyat girin</a> ya da radarın taranmasını bekleyin.');
      kap.appendChild(p);
      const a = $('manuelGec');
      if (a) a.addEventListener('click', (e) => { e.preventDefault(); modSec('manuel'); });
      return;
    }

    for (const f of durum.filamentler) {
      const btn = el('button', 'mz-fil' + (f.id === durum.secilenFilamentId ? ' aktif' : ''));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', f.id === durum.secilenFilamentId ? 'true' : 'false');

      const nokta = el('span', 'mz-fil-renk');
      nokta.style.background = renkHex(f.renk);

      const govde = el('span', 'mz-fil-govde');
      govde.appendChild(el('span', 'mz-fil-ad', f.ad));
      const alt = [f.site, malzemeYerel(f.malzeme), renkYerel(f.renk)].filter(Boolean).join(' · ');
      govde.appendChild(el('span', 'mz-fil-alt', alt));

      btn.appendChild(nokta);
      btn.appendChild(govde);
      btn.appendChild(el('span', 'mz-fil-fiyat', `${fPara(f.tlKg)}/kg`));

      btn.addEventListener('click', () => {
        durum.secilenFilamentId = f.id;
        durum.filamentModu = 'canli';
        modSec('canli', { yenidenCizme: true });
        filamentleriCiz();
        render();
      });
      kap.appendChild(btn);
    }
  }

  /* ================= MOD SEÇİMİ ================= */
  function modSec(mod, opts = {}) {
    durum.filamentModu = mod;
    document.querySelectorAll('.mz-sekme-btn').forEach(b => {
      const secili = b.dataset.mod === mod;
      b.classList.toggle('aktif', secili);
      b.setAttribute('aria-selected', secili ? 'true' : 'false');
    });
    $('filamentCanli').hidden = mod !== 'canli';
    $('filamentManuel').hidden = mod !== 'manuel';
    if (!opts.yenidenCizme) render();
  }

  /* ================= YAZICI ŞABLONLARI ================= */
  function yazicilariCiz() {
    const sel = $('yazici');
    const hizli = $('yaziciHizli');
    sel.innerHTML = '';
    hizli.innerHTML = '';

    for (const y of durum.yazicilar) {
      const opt = document.createElement('option');
      opt.value = y.id;
      const ad = y.id === 'ozel' && M_SZ.ozelAd ? M_SZ.ozelAd : y.ad;
      opt.textContent = `${y.ikon || ''} ${ad}${y.gucW ? ` (${y.gucW} W)` : ''}`.trim();
      sel.appendChild(opt);
    }

    // Hızlı butonlar (özel hariç ilk 5)
    for (const y of durum.yazicilar) {
      if (y.id === 'ozel') continue;
      const b = el('button', '', y.kisa || y.ad);
      b.type = 'button';
      b.dataset.yazici = y.id;
      b.addEventListener('click', () => yaziciSec(y.id));
      hizli.appendChild(b);
    }
  }

  function yaziciSec(id) {
    const y = durum.yazicilar.find(x => x.id === id);
    if (!y) return;
    $('yazici').value = id;
    document.querySelectorAll('#yaziciHizli button').forEach(b => {
      b.classList.toggle('aktif', b.dataset.yazici === id);
    });
    if (y.gucW) {
      durum.gucW = y.gucW;
      $('gucW').value = String(y.gucW);
      $('gucManuel').hidden = true;
      $('gucEtiket').textContent = `${y.gucW} W`;
    } else {
      $('gucManuel').hidden = false;
      $('gucW').focus();
    }
    render();
  }

  /* ================= KOPYALA ================= */
  async function teklifKopyala() {
    const h = render();
    const f = aktifFilament();
    const malzeme = durum.filamentModu === 'manuel'
      ? (durum.manuelAd || 'PLA')
      : [f?.ad, f?.renk].filter(Boolean).join(' · ') || 'PLA';

    const metin = [
      '🖨️ 3D BASKI FİYAT TEKLİFİ',
      `• Model Ağırlığı: ${h.gramaj} gram`,
      `• Malzeme: ${malzeme}`,
      `• Baskı Süresi: ~${h.sureSaat} saat`,
      `• Birim Fiyat: ${fPara(h.satis[durum.seciliKar]?.fiyat || h.secilen)} (KDV Hariç)`,
      '',
      'Hazırlayan: Baskı Hesap Baskı Asistanı',
    ].join('\n');

    const durumEl = $('kopyalaDurum');

    /** Gizli textarea ile kopyalama (eski tarayıcı + güvenli olmayan bağlam yedeği). */
    const yedekKopyala = () => {
      const ta = document.createElement('textarea');
      ta.value = metin;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, metin.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
      return ok;
    };

    let kopyalandi = false;
    // 1) Modern API — izin/bağlam yoksa sessizce düşer, yedeğe geçilir.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(metin);
        kopyalandi = true;
      }
    } catch { kopyalandi = false; }
    // 2) Yedek yol
    if (!kopyalandi) kopyalandi = yedekKopyala();

    if (kopyalandi) {
      durumEl.textContent = '✅ Teklif panoya kopyalandı.';
      durumEl.style.color = 'var(--yesil)';
    } else {
      durumEl.textContent = '⚠️ Kopyalanamadı — teklif metni aşağıda, seçip kopyalayabilirsiniz.';
      durumEl.style.color = 'var(--kirmizi)';
      const onizleme = $('teklifOnizleme');
      if (onizleme) { onizleme.textContent = metin; onizleme.hidden = false; }
    }
    setTimeout(() => { durumEl.textContent = ''; }, 3600);
  }

  /* ================= OLAY BAĞLAMA ================= */
  function olaylariBagla() {
    // Gramaj: slider + sayı iki yönlü
    const gSlider = $('gramajKaydirici');
    const gSayi = $('gramaj');
    const gramajUygula = (val, kaynak) => {
      const n = Math.max(1, Math.min(100000, Number(val) || 0));
      durum.gramaj = n;
      if (kaynak !== 'slider') gSlider.value = String(Math.min(1000, n));
      if (kaynak !== 'sayi') gSayi.value = String(n);
      render();
    };
    gSlider.addEventListener('input', (e) => gramajUygula(e.target.value, 'slider'));
    gSayi.addEventListener('input', (e) => gramajUygula(e.target.value, 'sayi'));

    // Süre
    const sSlider = $('sureKaydirici');
    const sSayi = $('sure');
    const sureUygula = (val, kaynak) => {
      const n = Math.max(0.1, Math.min(720, Number(val) || 0));
      durum.sureSaat = n;
      // Elle giriş tahmini geçersiz kılar; "Tahmin et" butonu bayrağı açar.
      if (kaynak !== 'tahmin') durum.sureOtomatik = false;
      if (kaynak !== 'slider') sSlider.value = String(Math.min(72, n));
      if (kaynak !== 'sayi') sSayi.value = String(n);
      render();
    };
    sSlider.addEventListener('input', (e) => sureUygula(e.target.value, 'slider'));
    sSayi.addEventListener('input', (e) => sureUygula(e.target.value, 'sayi'));

    $('sureTahmin').addEventListener('click', () => {
      const tahmin = Math.round((durum.gramaj / GRAM_SAAT) * 10) / 10;
      durum.sureOtomatik = true;
      sureUygula(tahmin, 'tahmin');
    });

    // Yazıcı
    $('yazici').addEventListener('change', (e) => yaziciSec(e.target.value));
    $('gucW').addEventListener('input', (e) => {
      durum.gucW = Math.max(10, Math.min(3000, Number(e.target.value) || 0));
      render();
    });

    // Filament modu
    document.querySelectorAll('.mz-sekme-btn').forEach(b => {
      b.addEventListener('click', () => modSec(b.dataset.mod));
    });
    $('manuelTlKg').addEventListener('input', (e) => {
      durum.manuelTlKg = Number(e.target.value) || 0;
      render();
    });
    $('manuelAd').addEventListener('input', (e) => {
      durum.manuelAd = e.target.value;
      render();
    });

    // Gelişmiş
    $('kwhTl').addEventListener('input', (e) => {
      durum.kwhTl = Number(e.target.value) || 0;
      render();
    });
    $('yipranma').addEventListener('input', (e) => {
      durum.yipranmaSaatTl = Number(e.target.value) || 0;
      render();
    });

    // Kâr marjı slider (yüzde) + hızlı çarpanlar
    $('karKaydirici').addEventListener('input', (e) => {
      const yuzde = Number(e.target.value) || 150;
      durum.karCarpani = Math.round((1 + yuzde / 100) * 100) / 100;
      // En yakın şablona işaret koy
      const c = durum.karCarpani;
      durum.seciliKar = c === 1 ? 'maliyet' : c === 2 ? 'hobi' : c === 3 ? 'ticari' : 'atolye';
      document.querySelectorAll('#karCarpanlar button').forEach(b => {
        b.classList.toggle('aktif', Math.abs(Number(b.dataset.carpan) - c) < 0.01);
      });
      render();
    });

    document.querySelectorAll('#karCarpanlar button').forEach(b => {
      b.addEventListener('click', () => {
        const c = Number(b.dataset.carpan);
        durum.karCarpani = c;
        durum.seciliKar = c === 1 ? 'maliyet' : c === 2 ? 'hobi' : c === 2.5 ? 'atolye' : 'ticari';
        $('karKaydirici').value = String(Math.round((c - 1) * 100));
        document.querySelectorAll('#karCarpanlar button').forEach(x => {
          x.classList.toggle('aktif', x === b);
        });
        render();
      });
    });

    $('kopyalaBtn').addEventListener('click', teklifKopyala);
  }

  /* ================= VERİ YÜKLEME ================= */
  async function yazicilariYukle() {
    try {
      const r = await fetch('/api/baski/yazicilar');
      const v = await r.json();
      if (v?.ok) {
        durum.yazicilar = v.yazicilar || [];
        durum.karSablonlari = v.karSablonlari || {};
        const vars = v.varsayilan || {};
        // Sunucu varsayılanı geldiyse uygula (yalnız TR varsayılan para biriminde)
        if (Number.isFinite(Number(vars.gucW))) durum.gucW = Number(vars.gucW);
        if (ORTAM_DIL === 'tr') {
          if (Number.isFinite(Number(vars.kwhTl))) durum.kwhTl = Number(vars.kwhTl);
          if (Number.isFinite(Number(vars.yipranmaSaatTl))) durum.yipranmaSaatTl = Number(vars.yipranmaSaatTl);
        }
        $('gucW').value = String(durum.gucW);
        $('kwhTl').value = String(durum.kwhTl);
        $('yipranma').value = String(durum.yipranmaSaatTl);
        $('manuelTlKg').value = String(durum.manuelTlKg);
      }
    } catch {
      durum.yazicilar = [
        { id: 'bambu-p1s', ad: 'Bambu Lab P1S / X1C', kisa: 'P1S / X1C', gucW: 150 },
        { id: 'bambu-a1mini', ad: 'Bambu Lab A1 Mini', kisa: 'A1 Mini', gucW: 100 },
        { id: 'creality-k1', ad: 'Creality K1C / K1 Max', kisa: 'K1C / K1 Max', gucW: 350 },
        { id: 'creality-ender3v3ke', ad: 'Creality Ender 3 V3 KE', kisa: 'Ender 3 V3 KE', gucW: 150 },
        { id: 'anycubic-kobra2neo', ad: 'Anycubic Kobra 2 Neo', kisa: 'Kobra 2 Neo', gucW: 120 },
        { id: 'ozel', ad: M_SZ.ozelAd || 'Özel / Manuel giriş', kisa: M_SZ.ozelKisa || 'Özel', gucW: null },
      ];
    }
    yazicilariCiz();
    // Varsayılan olarak sunucudaki watt ile eşleşen şablonu seç
    const eslesen = durum.yazicilar.find(y => y.gucW === durum.gucW && y.id !== 'ozel');
    if (eslesen) {
      $('yazici').value = eslesen.id;
      document.querySelectorAll('#yaziciHizli button').forEach(b => {
        b.classList.toggle('aktif', b.dataset.yazici === eslesen.id);
      });
    }
  }

  async function filamentleriYukle() {
    const kap = $('filamentCanli');
    try {
      const qs = ORTAM_MARKET !== 'tr' ? `&market=${encodeURIComponent(ORTAM_MARKET)}` : '';
      const r = await fetch('/api/baski/en-ucuz-filamentler?limit=20' + qs);
      const v = await r.json();
      if (v?.ok && Array.isArray(v.filamentler)) {
        durum.filamentler = v.filamentler;
        durum.secilenFilamentId = v.filamentler[0]?.id ?? null;
      } else {
        durum.filamentler = [];
      }
    } catch {
      durum.filamentler = [];
      kap.innerHTML = '';
      const p = el('p', 'mz-bos');
      p.textContent = M_SZ.sunucuHata || 'Canlı filament fiyatları alınamadı (sunucuya ulaşılamadı).';
      kap.appendChild(p);
      return;
    }
    filamentleriCiz();
    if (ORTAM_DIL !== 'tr' && !durum.filamentler.length) {
      modSec('manuel');
    } else {
      render();
    }
  }

  /* ================= BAŞLAT ================= */
  /* ================================================================== */
  /* 🧩 STL / 3MF Model Radarı (2026-11-06)                             */
  /*                                                                    */
  /* Dosya TAMAMEN tarayıcıda ayrıştırılır: hiçbir sunucuya yüklenmez.   */
  /* Yalnızca filament FİYATI için mevcut /api/baski uçları kullanılır. */
  /* ================================================================== */

  const STL_MAKS_BAYT = 100 * 1024 * 1024; // 100 MB
  let stlParser = null;        // /stlParser.js (hacim/gramaj çekirdeği)
  let stlMaliyetModul = null;  // /stlMaliyet.js (fiyat/özet/CTA — TEK KAYNAK)
  const stlDurum = {
    model: null,    // parse çıktısı (hacimCm3, boyutlar…)
    dosyaAdi: null,
    rawBuffer: null, // 🎨 silüet için ham baytlar (cihazda kalır)
    doluluk: 20,
    malzeme: 'PLA',
  };

  /** Parser + maliyet modülünü bir kez yükler (ilk dosya bırakıldığında). */
  async function stlParserYukle() {
    if (!stlParser) stlParser = await import('/stlParser.js');
    if (!stlMaliyetModul) stlMaliyetModul = await import('/stlMaliyet.js');
    return stlParser;
  }

  /* Aşağıdaki sarmalayıcılar tek kaynak modülü kullanır; modül yüklenmeden
     çağrılırsa güvenli (boş) değer döner — çökme yok. */
  function para(n) {
    if (ORTAM_DIL !== 'tr') return fPara(n);
    return stlMaliyetModul ? stlMaliyetModul.para(n) : '—';
  }
  function turkceAblatif(ad) { return stlMaliyetModul ? stlMaliyetModul.turkceAblatif(ad) : "'den"; }
  function stlOzetMetni(h) { return stlMaliyetModul ? stlMaliyetModul.ozetMetni(h) : ''; }
  function stlCtaMetni(h) { return stlMaliyetModul ? stlMaliyetModul.ctaMetni(h) : '⚡ Bu Filamenti Satın Al ➔'; }
  function stlVerimMetni(h) { return stlMaliyetModul ? stlMaliyetModul.verimMetni(h) : ''; }

  /** Malzeme seçimine en yakın canlı filamenti bulur (stokta + fiyatlı). */
  function stlEnUcuzFilament() {
    return stlMaliyetModul
      ? stlMaliyetModul.enUcuzFilament(durum.filamentler || [], stlDurum.malzeme)
      : null;
  }

  /**
   * Gramaj → maliyet + makara verimi (formül tek kaynakta: /stlMaliyet.js).
   * Makara fiyatı ürünün GERÇEK satış fiyatıdır; makara gramajı fiyat ÷ ₺/kg
   * oranından doğrulanır (500 g makarada verim yanlış çıkmaz).
   */
  function stlHesap() {
    if (!stlDurum.model || !stlParser || !stlMaliyetModul) return null;
    return stlMaliyetModul.hesaplaMaliyet({
      hacimCm3: stlDurum.model.hacimCm3,
      doluluk: stlDurum.doluluk,
      malzeme: stlDurum.malzeme,
      filament: stlEnUcuzFilament(),
      hesaplaGramaj: stlParser.hesaplaGramaj,
    });
  }

  /** Model sonuç kartını çizer. */
  function stlCiz() {
    const m = stlDurum.model;
    if (!m) return;

    const b = m.boyutlar || {};
    const sayi = (n, bd = 1) => Number(n || 0).toLocaleString('tr-TR', {
      minimumFractionDigits: bd, maximumFractionDigits: bd,
    });

    const dosyaEl = $('stlDosyaAd');
    if (dosyaEl) {
      const turEtiket = m.tur === '3mf' ? '3MF' : (m.format === 'binary' ? 'Binary STL' : 'ASCII STL');
      dosyaEl.textContent = (stlDurum.dosyaAdi || 'model') + ' · ' + turEtiket
        + ' · ' + Number(m.ucgenSayisi || 0).toLocaleString('tr-TR') + ' üçgen';
    }

    $('stlBoyut').textContent = sayi(b.genislik) + ' × ' + sayi(b.derinlik) + ' × ' + sayi(b.yukseklik);
    $('stlBoyutAlt').textContent = 'G × D × Y mm';
    $('stlHacim').textContent = sayi(m.hacimCm3, 2) + ' cm³';
    $('stlHacimAlt').textContent = sayi(m.hacimMm3, 0) + ' mm³ katı hacim';

    const h = stlHesap();
    if (h) {
      $('stlGram').textContent = sayi(h.gram, 1) + ' g';
      $('stlGramAlt').textContent = '%' + stlDurum.doluluk + ' doluluk · ' + stlDurum.malzeme
        + ' · etkin %' + Math.round(h.etkinDoluluk * 100);
      // Slider + etiket her zaman gerçek durumu göstersin (select/slider senkron).
      const kay = $('stlDolulukKaydirici');
      if (kay && Number(kay.value) !== Number(stlDurum.doluluk)) kay.value = String(stlDurum.doluluk);
      const dlEtiket = $('stlDolulukEtiket');
      if (dlEtiket) dlEtiket.textContent = '%' + stlDurum.doluluk;

      // Akıllı satın alma kartı
      const satin = $('stlSatin');
      if (h.filament) {
        satin.hidden = false;
        $('stlSatinSite').textContent = (h.filament.site || 'Mağaza')
          + (h.filament.kargo ? ' · ' + h.filament.kargo : '');
        $('stlSatinUrun').textContent = h.filament.ad || 'Filament';
        $('stlSatinFiyat').textContent = para(h.makaraFiyat)
          + (h.makaraGram && h.makaraGram !== 1000 ? ` / ${h.makaraGram} g` : ' / 1 kg makara');
        $('stlSatinParca').textContent = h.parcaMaliyet != null
          ? para(h.parcaMaliyet) + ' / parça'
          : '—';
        $('stlSatinDetay').textContent = stlVerimMetni(h);
        const ozetEl = $('stlSatinOzet');
        if (ozetEl) ozetEl.textContent = stlOzetMetni(h);

        const btn = $('stlSatinBtn');
        btn.href = h.filament.url;
        btn.textContent = stlCtaMetni(h);
        btn.setAttribute('rel', 'noopener sponsored');
        btn.setAttribute('target', '_blank');
        btn.dataset.siteId = h.filament.siteId || '';
        btn.dataset.fiyat = String(h.makaraFiyat || '');
      } else {
        satin.hidden = true;
        const ozetEl = $('stlSatinOzet');
        if (ozetEl) ozetEl.textContent = stlOzetMetni(h);
      }
    }

    $('stlSonuc').hidden = false;
    // 🎨 Silüet + 🧾 teklif fişi (2026-11-12)
    stlSiluetCiz().catch(() => { /* opsiyonel */ });
    const teklifBtn = $('stlTeklifFisBtn');
    if (teklifBtn) teklifBtn.hidden = false;
  }

  /* ================= 🎨 Silüet + 🧾 Teklif fişi (2026-11-12) ================= */

  let teklifModul = null;
  async function teklifModulleriniYukle() {
    if (!teklifModul) {
      teklifModul = {
        teklif: await import('/stlTeklif.js'),
        siluet: await import('/stlSiluet.js'),
      };
    }
    return teklifModul;
  }

  async function stlSiluetCiz() {
    const canvas = $('stlSiluetCanvas');
    if (!canvas || !stlDurum.model) return;
    const { siluet } = await teklifModulleriniYukle();
    siluet.cizModelSilueti(canvas, stlDurum.rawBuffer, stlDurum.model.boyutlar || {}, {
      ucgenSayisi: stlDurum.model.ucgenSayisi,
      format: stlDurum.model.format,
    });
  }

  /** Formdaki gramaj + canlı filament ₺/kg ile fiş verisini üretir. */
  async function teklifFisiniAc() {
    const modal = $('teklifFisModal');
    if (!modal) return;
    const { teklif } = await teklifModulleriniYukle();
    const h = hesapla(); // maliyet.js çekirdeği — tek kaynak
    const t = teklif.teklifHesapla({
      gram: h.gramaj,
      tlKg: Number(h.tlKg) || 0,
      malzeme: stlDurum.malzeme,
      doluluk: stlDurum.doluluk,
      sureSaat: h.sureSaat,
      dosyaAdi: stlDurum.dosyaAdi || '3D Parça',
      boyutlar: stlDurum.model?.boyutlar || null,
      gucW: h.gucW,
      kwhTl: h.kwhTl,
      yipranmaSaatTl: h.yipranmaSaatTl,
      karCarpani: durum.karCarpani,
    });
    if (!t) return;

    const yaz = (id, deger) => { const el = $(id); if (el) el.textContent = deger; };
    const p = (n) => (ORTAM_DIL === 'tr' ? ('₺' + teklif.para(n)) : fPara(n));

    yaz('fisTarih', teklif.tarihMetni(new Date()));
    yaz('fisModelAd', t.dosyaAdi);
    yaz('fisEbat', teklif.ebatMetni(t.boyutlar));
    yaz('fisGramaj', `${Math.round(t.gram)} g · ${yuzdeMetni(t.doluluk)} ${M_SZ.dolulukKel || 'doluluk'}`);
    yaz('fisMalzeme', t.malzeme);
    yaz('fisSure', `≈ ${t.sureSaat.toLocaleString('tr-TR')} saat${t.sureTahmini ? ' (tahmini)' : ''}`);
    yaz('fisFilamentMaliyet', t.fiyatBilgisiVar ? `${p(t.hammadde)} · ${p(t.tlKg)}/kg` : 'canlı fiyat alınamadı');
    yaz('fisElektrikMaliyet', `${p(t.elektrik)} · ${t.kwh} kWh`);
    yaz('fisYipranmaMaliyet', p(t.amortisman));
    yaz('fisNetMaliyet', p(t.net));
    yaz('fisSatisFiyat', p(t.satisFiyati));
    yaz('fisKarNotu', M_SZ.karDahil ? M_SZ.karDahil(yuzdeMetni(t.karYuzde), p(t.kar)) : `Atölye kâr marjı %${t.karYuzde} dahil · kâr ${p(t.kar)}`);

    const metin = teklif.teklifMetni(t);
    const wa = $('fisWhatsappBtn');
    if (wa) {
      wa.onclick = () => window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(metin)}`, '_blank', 'noopener',
      );
    }
    const kopyala = $('fisKopyalaBtn');
    if (kopyala) {
      kopyala.onclick = async () => {
        try {
          await navigator.clipboard.writeText(metin);
          kopyala.textContent = '✓ Kopyalandı';
          setTimeout(() => { kopyala.textContent = '📋 Fişi Kopyala'; }, 1500);
        } catch { /* metin seçilebilir */ }
      };
    }
    const yazdir = $('fisYazdirBtn');
    if (yazdir) yazdir.onclick = () => window.print();

    modal.hidden = false;
  }

  function teklifFisiniBagla() {
    const btn = $('stlTeklifFisBtn');
    if (btn) btn.onclick = () => { teklifFisiniAc(); };
    const modal = $('teklifFisModal');
    if (!modal) return;
    const kapat = () => { modal.hidden = true; };
    $('fisKapatBtn')?.addEventListener('click', kapat);
    $('teklifModalKapat')?.addEventListener('click', kapat);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) kapat();
    });
  }

  /** Dosyayı ayrıştırır (tamamı bellekte). */
  async function stlDosyaIsle(dosya) {
    const durumEl = $('stlDurum');
    if (!dosya) return;

    if (!/\.(stl|3mf)$/i.test(dosya.name || '')) {
      durumEl.textContent = '⚠️ Yalnızca .stl ve .3mf dosyaları desteklenir.';
      durumEl.className = 'stl-durum hata';
      return;
    }
    if (dosya.size > STL_MAKS_BAYT) {
      durumEl.textContent = '⚠️ Dosya çok büyük (' + (dosya.size / 1048576).toFixed(1)
        + ' MB). En fazla 100 MB.';
      durumEl.className = 'stl-durum hata';
      return;
    }

    const okumaMetni = {
      en: '⏳ Reading model… (' + (dosya.size / 1048576).toFixed(2) + ' MB)',
      fr: '⏳ Lecture du modèle… (' + (dosya.size / 1048576).toFixed(2) + ' Mo)',
      ja: '⏳ モデルを読み込み中… (' + (dosya.size / 1048576).toFixed(2) + ' MB)',
    }[ORTAM_DIL] || ('⏳ Model okunuyor… (' + (dosya.size / 1048576).toFixed(1) + ' MB)');
    durumEl.textContent = okumaMetni;
    durumEl.className = 'stl-durum';

    try {
      const parser = await stlParserYukle();
      const tampon = await dosya.arrayBuffer();
      const t0 = performance.now();
      const model = await parser.parseModel(tampon, { ad: dosya.name });
      const sureMs = Math.round(performance.now() - t0);

      stlDurum.model = model;
      stlDurum.dosyaAdi = dosya.name;
      stlDurum.rawBuffer = tampon;
      stlCiz();
      const ucgenStr = Number(model.ucgenSayisi).toLocaleString(ORTAM_YEREL || 'tr-TR');
      durumEl.textContent = ({
        en: `✅ ${ucgenStr} triangles parsed · ${sureMs} ms · processed locally`,
        fr: `✅ ${ucgenStr} triangles analysés · ${sureMs} ms · traitement local`,
        ja: `✅ ${ucgenStr} ポリゴン解析完了 · ${sureMs} ms · ブラウザ内処理`,
      }[ORTAM_DIL] || `✅ ${ucgenStr} üçgen ayrıştırıldı · ${sureMs} ms · dosya cihazınızdan çıkmadı`);
      durumEl.className = 'stl-durum basarili';
    } catch (e) {
      stlDurum.model = null;
      $('stlSonuc').hidden = true;
      durumEl.textContent = '❌ ' + String(e?.message || e).slice(0, 160);
      durumEl.className = 'stl-durum hata';
    }
  }

  function stlOlaylariBagla() {
    const birak = $('stlBirak');
    const girdi = $('stlDosya');
    if (!birak || !girdi) return;

    // Tıklama / klavye ile dosya seçimi
    birak.addEventListener('click', () => girdi.click());
    birak.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girdi.click(); }
    });
    girdi.addEventListener('change', async () => {
      await stlDosyaIsle(girdi.files?.[0]);
      girdi.value = ''; // aynı dosya tekrar seçilebilsin
    });

    // Sürükle-bırak
    let derinlik = 0;
    const vurgula = (ac) => birak.classList.toggle('uzerinde', ac);
    birak.addEventListener('dragenter', (e) => {
      e.preventDefault(); derinlik++; vurgula(true);
    });
    birak.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    birak.addEventListener('dragleave', (e) => {
      e.preventDefault(); derinlik = Math.max(0, derinlik - 1);
      if (!derinlik) vurgula(false);
    });
    birak.addEventListener('drop', async (e) => {
      e.preventDefault(); derinlik = 0; vurgula(false);
      await stlDosyaIsle(e.dataTransfer?.files?.[0]);
    });

    // Kontroller: anında yeniden hesapla (select + slider aynı yolu kullanır).
    const dolulukUygula = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 1 || n > 100) return;
      stlDurum.doluluk = Math.round(n);
      const sel = $('stlDoluluk');
      if (sel) {
        const secenek = [...(sel.options || [])].find(o => Number(o.value) === stlDurum.doluluk);
        if (secenek) sel.value = secenek.value;
      }
      const kay = $('stlDolulukKaydirici');
      if (kay && Number(kay.value) !== stlDurum.doluluk) kay.value = String(stlDurum.doluluk);
      const etiket = $('stlDolulukEtiket');
      if (etiket) etiket.textContent = '%' + stlDurum.doluluk;
      stlCiz();
    };
    const malzemeUygula = (val) => {
      stlDurum.malzeme = String(val || 'PLA').toUpperCase();
      const sel = $('stlMalzeme');
      if (sel && sel.value !== stlDurum.malzeme) {
        const secenek = [...(sel.options || [])].find(o => o.value.toUpperCase() === stlDurum.malzeme);
        if (secenek) sel.value = secenek.value;
      }
      stlCiz();
    };
    const dolulukEl = $('stlDoluluk');
    if (dolulukEl) {
      dolulukEl.addEventListener('input', (e) => dolulukUygula(e.target.value));
      dolulukEl.addEventListener('change', (e) => dolulukUygula(e.target.value));
    }
    // Canlı slider (varsa) — yüzde 1..100 arası anlık güncelleme.
    const dolulukKaydirici = $('stlDolulukKaydirici');
    if (dolulukKaydirici) {
      dolulukKaydirici.addEventListener('input', (e) => dolulukUygula(e.target.value));
      dolulukKaydirici.addEventListener('change', (e) => dolulukUygula(e.target.value));
    }
    const malzemeEl = $('stlMalzeme');
    if (malzemeEl) {
      malzemeEl.addEventListener('input', (e) => malzemeUygula(e.target.value));
      malzemeEl.addEventListener('change', (e) => malzemeUygula(e.target.value));
    }
    // Malzeme çipleri (varsa): tıklayınca aynı akış.
    document.querySelectorAll('[data-stl-malzeme]').forEach(btn => {
      btn.addEventListener('click', () => malzemeUygula(btn.dataset.stlMalzeme));
    });

    $('stlTemizle')?.addEventListener('click', () => {
      stlDurum.model = null;
      stlDurum.dosyaAdi = null;
      $('stlSonuc').hidden = true;
      const d = $('stlDurum');
      if (d) { d.textContent = ''; d.className = 'stl-durum'; }
    });

    // Örnek AI / test STL modelleri: 1 tıkla indirip bellekte ayrıştır ve hesaplayıcıya uygula
    document.querySelectorAll('[data-stl-ornek]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const yol = btn.getAttribute('data-stl-ornek');
        const ad = btn.getAttribute('data-stl-ad') || 'ornek.stl';
        if (!yol) return;
        const eskiMetin = btn.textContent;
        btn.disabled = true;
        try {
          const yanit = await fetch(yol);
          if (!yanit.ok) throw new Error('HTTP ' + yanit.status);
          const buf = await yanit.arrayBuffer();
          const dosya = new File([buf], ad, { type: 'model/stl' });
          await stlDosyaIsle(dosya);
          const h = stlHesap();
          if (h && h.gram > 0) {
            const g = Math.max(1, Math.round(h.gram * 10) / 10);
            durum.gramaj = g;
            const tahminiSure = Math.max(0.2, Math.round((g / GRAM_SAAT) * 10) / 10);
            durum.sureSaat = tahminiSure;
            durum.sureTahmini = true;
            const gs = $('gramajKaydirici');
            const gn = $('gramaj');
            const ss = $('sureKaydirici');
            const sn = $('sure');
            if (gs) gs.value = String(Math.min(1000, g));
            if (gn) gn.value = String(g);
            if (ss) ss.value = String(Math.min(72, tahminiSure));
            if (sn) sn.value = String(tahminiSure);
            render();
          }
        } catch (e) {
          const d = $('stlDurum');
          if (d) {
            d.textContent = '❌ ' + String(e?.message || e).slice(0, 120);
            d.className = 'stl-durum hata';
          }
        } finally {
          btn.disabled = false;
          if (btn.textContent !== eskiMetin) btn.textContent = eskiMetin;
        }
      });
    });

    // Gramajı hesaplayıcıya aktar (manuel girişe gerek kalmasın)
    $('stlAktar')?.addEventListener('click', () => {
      const h = stlHesap();
      if (!h || !(h.gram > 0)) return;
      const g = Math.max(1, Math.round(h.gram * 10) / 10);
      durum.gramaj = g;
      const gs = $('gramajKaydirici');
      const gn = $('gramaj');
      if (gs) gs.value = String(Math.min(1000, g));
      if (gn) gn.value = String(g);
      render();
      const d = $('stlDurum');
      if (d) {
        d.textContent = '✅ ' + g + ' g hesaplayıcıya aktarıldı — aşağıdaki maliyet dökümü güncellendi.';
        d.className = 'stl-durum basarili';
      }
      document.querySelector('.mz-duzen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /**
   * Ana sayfadaki mikro dropzone'dan gelen model özetini devralır (2026-11-08).
   * Dosyanın kendisi taşınmaz (100 MB'a kadar olabilir); yalnızca hacim/ebat
   * özeti sessionStorage'da tutulur — böylece ağ isteği yine YOK.
   */
  function stlDevral() {
    try {
      const ham = sessionStorage.getItem('stlModelOzet');
      if (!ham) return false;
      sessionStorage.removeItem('stlModelOzet');
      const veri = JSON.parse(ham);
      if (!veri || !(Number(veri.hacimCm3) > 0)) return false;
      stlDurum.model = {
        hacimCm3: Number(veri.hacimCm3),
        hacimMm3: Number(veri.hacimMm3) || Number(veri.hacimCm3) * 1000,
        boyutlar: veri.boyutlar || {},
        ucgenSayisi: Number(veri.ucgenSayisi) || 0,
        tur: veri.tur || 'stl',
        format: veri.format || 'binary',
        devralindi: true,
      };
      stlDurum.dosyaAdi = veri.dosyaAdi || 'model.stl';
      if (veri.doluluk) stlDurum.doluluk = Math.round(Number(veri.doluluk)) || 20;
      if (veri.malzeme) stlDurum.malzeme = String(veri.malzeme).toUpperCase();
      // Kontrolleri devralınan değerlerle senkronla (kullanıcı aynı ayarla devam etsin).
      const sel = $('stlDoluluk');
      if (sel) {
        const secenek = [...(sel.options || [])].find(o => Number(o.value) === stlDurum.doluluk);
        if (secenek) sel.value = secenek.value;
      }
      const kay = $('stlDolulukKaydirici');
      if (kay) kay.value = String(stlDurum.doluluk);
      const etiket = $('stlDolulukEtiket');
      if (etiket) etiket.textContent = '%' + stlDurum.doluluk;
      const malzemeSel = $('stlMalzeme');
      if (malzemeSel) {
        const secenek = [...(malzemeSel.options || [])]
          .find(o => o.value.toUpperCase() === stlDurum.malzeme);
        if (secenek) malzemeSel.value = secenek.value;
      }
      const d = $('stlDurum');
      if (d) {
        d.textContent = '✅ Model ana sayfadan devralındı — dosya cihazınızdan çıkmadı.';
        d.className = 'stl-durum basarili';
      }
      return true;
    } catch {
      return false;
    }
  }

  async function baslat() {
    olaylariBagla();
    stlOlaylariBagla();
    teklifFisiniBagla();

    // Slicer sayfasından/eklentiden gelen ?gramaj=...&sure=...&tlKg=... ön doldurması
    try {
      const qs = new URLSearchParams(location.search);
      const qg = Number(qs.get('gramaj'));
      const qSure = Number(qs.get('sure'));
      const qTlKg = Number(qs.get('tlKg'));
      if (Number.isFinite(qg) && qg >= 1 && qg <= 50000) durum.gramaj = Math.round(qg * 10) / 10;
      if (Number.isFinite(qSure) && qSure > 0 && qSure <= 500) durum.sureSaat = Math.round(qSure * 100) / 100;
      if (Number.isFinite(qTlKg) && qTlKg >= 1 && qTlKg <= 50000) durum.manuelTlKg = Math.round(qTlKg * 100) / 100;
    } catch { /* yoksay */ }

    // İlk boyama: JS yüklenmeden önce de anlamlı görünsün
    $('gramaj').value = String(durum.gramaj);
    $('gramajKaydirici').value = String(durum.gramaj);
    $('sure').value = String(durum.sureSaat);
    $('sureKaydirici').value = String(durum.sureSaat);
    $('kwhTl').value = String(durum.kwhTl);
    $('yipranma').value = String(durum.yipranmaSaatTl);
    $('manuelTlKg').value = String(durum.manuelTlKg);
    $('karKaydirici').value = String(Math.round((durum.karCarpani - 1) * 100));
    render();

    await yazicilariYukle();
    render();
    await filamentleriYukle();
    // Filament fiyatları geldikten SONRA devralınan modeli çiz (fiyat kartı dolu olsun).
    // Devralmada dosya yeniden ayrıştırılmaz; hacim/ebat özeti hazır gelir, fakat
    // gramaj/maliyet için parser + maliyet modülü yine de yüklenmelidir.
    if (stlDevral()) {
      try {
        await stlParserYukle();
        stlCiz();
      } catch (e) {
        const d = $('stlDurum');
        if (d) {
          d.textContent = '⚠️ Model devralındı ancak hesaplayıcı yüklenemedi: '
            + String(e?.message || e).slice(0, 120);
          d.className = 'stl-durum hata';
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslat);
  } else {
    baslat();
  }

  // Testler için (ağ olmadan hesap doğrulaması)
  window.__maliyetTest = {
    hesapla, durum, stlDurum, stlHesap, stlCiz, stlDosyaIsle,
    stlOzetMetni, stlCtaMetni, turkceAblatif, para, stlEnUcuzFilament,
    stlParserAyarla: (p) => { stlParser = p; },
    stlModelAyarla: (model, ek = {}) => { stlDurum.model = model; Object.assign(stlDurum, ek); },
    ayarla: (patch) => { Object.assign(durum, patch); return hesapla(); },
  };
})();
