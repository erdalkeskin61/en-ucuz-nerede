/**
 * 🧩 Ana sayfa hızlı 3D model maliyeti — 2026-11-08
 *
 * Amaç: 3D modelini hazırlayan kullanıcı (satın alma niyeti en yüksek kitle)
 * ana sayfada dosyayı bıraktığı ANDA "bu model için kaç gram filament gerek,
 * en ucuz makara hangi mağazada, parça başı maliyet ne?" cevabını alsın.
 *
 * GİZLİLİK: Dosya TAMAMEN tarayıcıda ayrıştırılır; sunucuya hiçbir yükleme
 * isteği gitmez. Ağdan yalnızca canlı filament FİYATI okunur.
 *
 * "Detaylı maliyet" bağlantısı dosyayı taşımaz (100 MB'a kadar olabilir);
 * yalnızca hacim/ebat özetini sessionStorage ile /maliyet.html'e devreder.
 */
(() => {
  'use strict';

  const MAKS_BAYT = 100 * 1024 * 1024;
  const DURUM_ANAHTARI = 'stlModelOzet';

  const $ = (s) => document.querySelector(s);
  const durum = {
    parser: null,
    maliyet: null,       // /stlMaliyet.js — fiyat/özet/CTA tek kaynağı
    teklif: null,        // /stlTeklif.js — fiş hesabı + metin (tek kaynak)
    siluet: null,        // /stlSiluet.js — Canvas 2.5D çizim
    filamentler: null,   // canlı liste (bir kez)
    model: null,
    rawBuffer: null,     // silüet için ham STL baytları (cihazda kalır)
    dosyaAdi: null,
    doluluk: 20,
    malzeme: 'PLA',
  };

  const sayi = (n, bd = 1) => Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: bd, maximumFractionDigits: bd,
  });
  const para = (n) => (durum.maliyet ? durum.maliyet.para(n) : '—');

  function durumYaz(metin, tur = '') {
    const el = $('#stlHizliDurum');
    if (!el) return;
    el.textContent = metin;
    el.className = 'stl-hizli-durum' + (tur ? ' ' + tur : '');
  }

  async function parserYukle() {
    if (!durum.parser) durum.parser = await import('/stlParser.js');
    if (!durum.maliyet) durum.maliyet = await import('/stlMaliyet.js');
    return durum.parser;
  }

  /** Fiş + silüet modülleri (yalnızca gerektiğinde, bir kez). */
  async function teklifModulleriniYukle() {
    if (!durum.teklif) durum.teklif = await import('/stlTeklif.js');
    if (!durum.siluet) durum.siluet = await import('/stlSiluet.js');
    return { teklif: durum.teklif, siluet: durum.siluet };
  }

  /* ================= 🎨 Silüet + 🧾 Teklif fişi (2026-11-12) ================= */

  /** Model geldiğinde canvas silüetini çizer (sıfır gecikme, ağ isteği yok). */
  async function siluetCiz() {
    const canvas = document.getElementById('stlSiluetCanvas');
    if (!canvas || !durum.model) return;
    const { siluet } = await teklifModulleriniYukle();
    siluet.cizModelSilueti(
      canvas,
      durum.rawBuffer,
      durum.model.boyutlar || {},
      { ucgenSayisi: durum.model.ucgenSayisi, format: durum.model.format },
    );
  }

  /** Fiş için güncel hesabı üretir (canlı ₺/kg dahil). */
  function teklifVerisi() {
    if (!durum.model || !durum.teklif) return null;
    const h = hesapla();
    if (!h) return null;
    const b = durum.model.boyutlar || {};
    return durum.teklif.teklifHesapla({
      gram: h.gram,
      tlKg: Number(h.tlKg) || 0,
      malzeme: durum.malzeme,
      doluluk: durum.doluluk,
      dosyaAdi: durum.dosyaAdi || '3D Parça',
      boyutlar: b,
    });
  }

  function fisKapat() {
    const modal = document.getElementById('teklifFisModal');
    if (modal) modal.hidden = true;
  }

  /** Teklif fişi modalını doldurur, paylaşım butonlarını bağlar. */
  async function teklifFisiniAc() {
    const modal = document.getElementById('teklifFisModal');
    if (!modal) return;
    const { teklif, siluet } = await teklifModulleriniYukle();
    const t = teklifVerisi();
    if (!t) return;
    void siluet; // (silüet zaten ciz() içinde çizildi)

    const yaz = (id, deger) => {
      const el = document.getElementById(id);
      if (el) el.textContent = deger;
    };
    const para = (n) => (window.BASKI_HESAP_ORTAM?.currency && window.BASKI_HESAP_ORTAM.currency !== 'TRY' && typeof window.formatPara === 'function')
      ? window.formatPara(n, window.BASKI_HESAP_ORTAM.currency)
      : ('₺' + teklif.para(n));

    yaz('fisTarih', teklif.tarihMetni(new Date()));
    yaz('fisModelAd', t.dosyaAdi);
    yaz('fisEbat', teklif.ebatMetni(t.boyutlar));
    yaz('fisGramaj', `${Math.round(t.gram)} g · %${t.doluluk} doluluk`);
    yaz('fisMalzeme', t.malzeme);
    yaz('fisSure', `≈ ${t.sureSaat.toLocaleString('tr-TR')} saat${t.sureTahmini ? ' (tahmini)' : ''}`);
    yaz('fisFilamentMaliyet', t.fiyatBilgisiVar
      ? `${para(t.hammadde)} · ${para(t.tlKg)}/kg`
      : 'canlı fiyat alınamadı');
    yaz('fisElektrikMaliyet', `${para(t.elektrik)} · ${t.kwh} kWh`);
    yaz('fisYipranmaMaliyet', para(t.amortisman));
    yaz('fisNetMaliyet', para(t.net));
    yaz('fisSatisFiyat', para(t.satisFiyati));
    yaz('fisKarNotu', `Atölye kâr marjı %${t.karYuzde} dahil · kâr ${para(t.kar)}`);

    const metin = teklif.teklifMetni(t);

    const wa = document.getElementById('fisWhatsappBtn');
    if (wa) {
      wa.onclick = () => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(metin)}`, '_blank', 'noopener');
      };
    }
    const kopyala = document.getElementById('fisKopyalaBtn');
    if (kopyala) {
      kopyala.onclick = async () => {
        // app.js'deki ortak yardımcı (toast + buton onayı); yoksa düz kopyala.
        if (typeof window.panoyaKopyalaVeGeriBildirim === 'function') {
          await window.panoyaKopyalaVeGeriBildirim(metin, kopyala, 'Teklif fişi kopyalandı!');
          return;
        }
        try {
          await navigator.clipboard.writeText(metin);
          kopyala.textContent = '✓ Kopyalandı';
          setTimeout(() => { kopyala.textContent = '📋 Fişi Kopyala'; }, 1500);
        } catch { /* sessiz: kullanıcı metni seçebilir */ }
      };
    }
    const yazdir = document.getElementById('fisYazdirBtn');
    if (yazdir) yazdir.onclick = () => window.print();

    modal.hidden = false;
  }

  async function baglaTeklif() {
    const btn = document.getElementById('stlTeklifFisBtn');
    if (btn) btn.onclick = () => { teklifFisiniAc(); };
    const modal = document.getElementById('teklifFisModal');
    if (!modal) return;
    document.getElementById('fisKapatBtn')?.addEventListener('click', fisKapat);
    document.getElementById('teklifModalKapat')?.addEventListener('click', fisKapat);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) fisKapat();
    });
  }

  /** Canlı filament listesi — yalnızca ilk açılışta bir kez okunur. */
  async function filamentleriYukle() {
    if (durum.filamentler) return durum.filamentler;
    try {
      const pUrl = window.BASKI_HESAP_ORTAM?.market && window.BASKI_HESAP_ORTAM.market !== 'tr'
        ? '/api/baski/en-ucuz-filamentler?limit=30&market=' + encodeURIComponent(window.BASKI_HESAP_ORTAM.market)
        : '/api/baski/en-ucuz-filamentler?limit=30';
      const r = await fetch(pUrl);
      const v = await r.json();
      durum.filamentler = Array.isArray(v?.filamentler) ? v.filamentler : [];
    } catch {
      durum.filamentler = [];
    }
    return durum.filamentler;
  }

  /** Malzeme ailesine en yakın, en düşük ₺/kg'li stoklu filament (tek kaynak). */
  function enUcuzFilament(malzeme = durum.malzeme) {
    return durum.maliyet
      ? durum.maliyet.enUcuzFilament(durum.filamentler || [], malzeme)
      : null;
  }

  /** Gramaj + maliyet + makara verimi (tek kaynak formül). */
  function hesapla() {
    if (!durum.model || !durum.parser || !durum.maliyet) return null;
    return durum.maliyet.hesaplaMaliyet({
      hacimCm3: durum.model.hacimCm3,
      doluluk: durum.doluluk,
      malzeme: durum.malzeme,
      filament: enUcuzFilament(),
      hesaplaGramaj: durum.parser.hesaplaGramaj,
    });
  }

  function ciz() {
    const m = durum.model;
    const h = hesapla();
    if (!m || !h) return;

    const b = m.boyutlar || {};
    $('#stlHizliDosyaAd').textContent = (durum.dosyaAdi || 'model')
      + (m.ucgenSayisi ? ' · ' + Number(m.ucgenSayisi).toLocaleString('tr-TR') + ' üçgen' : '');
    $('#stlHizliBoyut').textContent = sayi(b.genislik) + ' × ' + sayi(b.derinlik) + ' × ' + sayi(b.yukseklik);
    $('#stlHizliHacim').textContent = sayi(m.hacimCm3, 2) + ' cm³';
    $('#stlHizliGram').textContent = sayi(h.gram, 0) + ' g';

    const ozetEl = $('#stlHizliOzet');
    if (h.filament && Number(h.makaraFiyat) > 0) {
      ozetEl.textContent = durum.maliyet.ozetMetni(h)
        + (h.makaraAdet > 0 ? ` 1 makara ile ${durum.maliyet.tamSayi(h.makaraAdet)} adet basabilirsiniz.` : '');
    } else {
      ozetEl.textContent = durum.maliyet.ozetMetni(h);
    }

    const cta = $('#stlHizliCta');
    if (cta) {
      if (h.filament?.url) {
        cta.hidden = false;
        cta.href = h.filament.url;
        cta.textContent = durum.maliyet.ctaMetni(h, { baglac: 'üzerinden' });
      } else {
        cta.hidden = true;
      }
    }

    const detay = $('#stlHizliDetay');
    if (detay) {
      detay.href = window.BASKI_HESAP_ORTAM?.maliyetYolu || '/maliyet.html';
      detay.onclick = () => {
        try {
          sessionStorage.setItem(DURUM_ANAHTARI, JSON.stringify({
            hacimCm3: m.hacimCm3,
            hacimMm3: m.hacimMm3,
            boyutlar: m.boyutlar || {},
            ucgenSayisi: m.ucgenSayisi || 0,
            tur: m.tur || 'stl',
            format: m.format || 'binary',
            dosyaAdi: durum.dosyaAdi,
            doluluk: durum.doluluk,
            malzeme: durum.malzeme,
          }));
        } catch { /* özel mod: aktarım olmaz, sayfa yine açılır */ }
      };
    }

    $('#stlHizliSonuc').hidden = false;

    // 🎨 Silüeti çiz (async import; hesabı bloklamaz) ve fiş butonunu aç.
    siluetCiz().catch(() => { /* silüet opsiyonel */ });
    const teklifBtn = document.getElementById('stlTeklifFisBtn');
    if (teklifBtn) teklifBtn.hidden = false;
  }

  async function dosyaIsle(dosya) {
    if (!dosya) return;
    if (!/\.(stl|3mf)$/i.test(dosya.name || '')) {
      durumYaz('⚠️ Yalnızca .stl ve .3mf dosyaları desteklenir.', 'hata');
      return;
    }
    if (dosya.size > MAKS_BAYT) {
      durumYaz(`⚠️ Dosya çok büyük (${(dosya.size / 1048576).toFixed(1)} MB). En fazla 100 MB.`, 'hata');
      return;
    }

    durumYaz(`⏳ Model okunuyor… (${(dosya.size / 1048576).toFixed(1)} MB)`);
    try {
      const [parser] = await Promise.all([parserYukle(), filamentleriYukle()]);
      const tampon = await dosya.arrayBuffer();
      const t0 = performance.now();
      const model = await parser.parseModel(tampon, { ad: dosya.name });
      const sure = Math.round(performance.now() - t0);

      durum.model = model;
      durum.dosyaAdi = dosya.name;
      // Silüet için ham baytlar cihazda tutulur (3MF'de kutu yedeği çizilir).
      durum.rawBuffer = tampon;
      ciz();
      durumYaz(`✅ ${Number(model.ucgenSayisi || 0).toLocaleString('tr-TR')} üçgen · ${sure} ms`
        + ' · dosya cihazınızdan çıkmadı', 'basarili');
    } catch (e) {
      durum.model = null;
      const sonuc = $('#stlHizliSonuc');
      if (sonuc) sonuc.hidden = true;
      durumYaz('❌ ' + String(e?.message || e).slice(0, 160), 'hata');
    }
  }

  function bagla() {
    const birak = $('#stlHizliBirak');
    const girdi = $('#stlHizliDosya');
    if (!birak || !girdi) return;

    birak.addEventListener('click', () => girdi.click());
    birak.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); girdi.click(); }
    });
    girdi.addEventListener('change', async () => {
      await dosyaIsle(girdi.files?.[0]);
      girdi.value = '';
    });

    let derinlik = 0;
    const vurgula = (ac) => birak.classList.toggle('uzerinde', ac);
    birak.addEventListener('dragenter', (e) => { e.preventDefault(); derinlik++; vurgula(true); });
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
      await dosyaIsle(e.dataTransfer?.files?.[0]);
    });

    const doluluk = $('#stlHizliDoluluk');
    const malzeme = $('#stlHizliMalzeme');
    const uygula = () => {
      if (doluluk) durum.doluluk = Number(doluluk.value) || 20;
      if (malzeme) durum.malzeme = String(malzeme.value || 'PLA').toUpperCase();
      if (durum.model) ciz();
    };
    [doluluk, malzeme].forEach((el) => {
      el?.addEventListener('input', uygula);
      el?.addEventListener('change', uygula);
    });
    $('#stlHizliTemizle')?.addEventListener('click', () => {
      durum.model = null;
      durum.dosyaAdi = null;
      durum.rawBuffer = null;
      $('#stlHizliSonuc').hidden = true;
      const teklifBtn = document.getElementById('stlTeklifFisBtn');
      if (teklifBtn) teklifBtn.hidden = true;
      // Canvas'ı temizle (eski modelin silüeti kalmasın).
      const canvas = document.getElementById('stlSiluetCanvas');
      if (canvas) {
        import('/stlSiluet.js')
          .then((m) => m.siluettiTemizle(canvas))
          .catch(() => { /* opsiyonel */ });
      }
      durumYaz('');
    });

    // 🧾 Teklif fişi modalı + butonları (bir kez bağlanır).
    baglaTeklif();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bagla);
  } else {
    bagla();
  }

  // Testler için (ağ olmadan hesap doğrulaması)
  window.__stlHizliTest = {
    durum, hesapla, enUcuzFilament, dosyaIsle, para,
    parserAyarla: (p) => { durum.parser = p; },
    filamentAyarla: (liste) => { durum.filamentler = liste; },
    modelAyarla: (model, ek = {}) => { durum.model = model; Object.assign(durum, ek); },
    ciz,
    siluetCiz,
    teklifVerisi,
    teklifFisiniAc,
    fisKapat,
    teklifModulleriniYukle,
  };
})();
