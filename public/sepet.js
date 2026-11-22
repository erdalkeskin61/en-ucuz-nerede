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
  kargoFirsati, tamamlayiciEtkisi, paketCoz, PAKETLER, turkceAblatif,
  sepetNormalize, sepetDogrula, sepetToplami, sepetIstekGovdesi,
  MAKS_URUN, kiyasVerisi, paketKargoDurumu,
} from '/sepetHesap.js';

const $ = (s) => document.querySelector(s);
const DEPO_ANAHTARI = 'eun_sepet_v1';
const DEPO_PAKET = 'eun_sepet_sonuc_v1';

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
            ${x.tur === 'ad' ? '🔎 İsimle arama' : (x.site ? `🏪 ${esc(x.site)}` : '🔗 Link')}
            ${x.fiyat ? ` · ${para(x.fiyat)}` : ''}
            ${x.kaynak === 'paket' ? ' · 🎨 paketten' : ''}
          </span>
        </div>
      </div>
      <div class="sepet-satir-sag">
        <div class="sepet-adet" role="group" aria-label="Adet">
          <button type="button" data-adet="-1" data-id="${esc(x.id)}" aria-label="Adedi azalt">−</button>
          <span>${Math.max(1, Number(x.adet) || 1)}</span>
          <button type="button" data-adet="1" data-id="${esc(x.id)}" aria-label="Adedi artır">+</button>
        </div>
        <button type="button" class="sepet-sil" data-id="${esc(x.id)}" aria-label="Ürünü sepetten çıkar">🗑</button>
      </div>
    </div>
  `).join(''));

  $('#sepetAltNot').textContent = durum.sepet.length
    ? 'Kargo, seçilen senaryoya göre ayrıca hesaplanır'
    : 'Kargo seçilen senaryoya göre değişir';
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
    if (toplam >= MAKS_URUN) { toast(`Sepet en fazla ${MAKS_URUN} ürün alabilir.`, 'hata'); return false; }
    ayni.adet = Math.max(1, Number(ayni.adet) || 1) + 1;
  } else {
    if (toplam >= MAKS_URUN) { toast(`Sepet en fazla ${MAKS_URUN} ürün alabilir.`, 'hata'); return false; }
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
    const r = await fetch('/api/baski/en-ucuz-filamentler?limit=50');
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
  kaplama(kap, PAKETLER.map(p => {
    const r = paketCoz(p, teklifler);
    const satirlar = r.parcalar.map(x => {
      const fiyat = para(Number(x.teklif.fiyat) * (x.adet || 1));
      return `<li>
        <span class="paket-parca-ad">${esc(x.adet > 1 ? x.adet + '× ' : '')}${esc(x.teklif.ad)}</span>
        <span class="paket-parca-fiyat">${fiyat}</span>
      </li>`;
    }).join('');
    const eksik = r.eksikler.length
      ? `<p class="paket-eksik">⚠️ Şu an stokta yok: ${r.eksikler.map(e => esc(e.etiket)).join(', ')}</p>`
      : '';
    const degisim = r.degisimler.length
      ? `<p class="paket-degisim">↔️ ${r.degisimler.map(d => `${esc(d.istenen)} yerine ${esc(d.eklenen)}`).join('; ')}</p>`
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
      <ul class="paket-satirlar">${satirlar || '<li class="paket-parca-ad">Canlı katalogda uygun ürün yok</li>'}</ul>
      ${eksik}${degisim}
      <div class="paket-alt">
        <span class="paket-toplam">${toplam}</span>
        <button type="button" class="paket-ekle" data-paket-ekle="${esc(p.id)}"
          ${r.eklenebilir ? '' : 'disabled aria-disabled="true"'}>
          ${r.eklenebilir ? '+ Paketi Sepete Ekle' : 'Ürün bulunamadı'}
        </button>
      </div>
    </article>`;
  }).join(''));

  const not = $('#paketNot');
  if (not) {
    not.textContent = teklifler.length
      ? `${teklifler.length} canlı filament teklifi okundu. Fiyatlar radar taramasından gelir.`
      : 'Canlı filament kataloğu okunamadı; paketler şu an eklenemiyor. Ürün arayarak devam edebilirsiniz.';
  }
}

function paketEkle(paketId) {
  const paket = PAKETLER.find(p => p.id === paketId);
  if (!paket) return;
  const r = paketCoz(paket, durum.teklifler || []);
  if (!r.eklenebilir) {
    toast('Bu paket için yeterli ürün bulunamadı. Ürün arayarak ekleyebilirsiniz.', 'hata');
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
  parcalar.push(`✅ ${paket.ad} eklendi (${eklenen} ürün)`);
  if (r.eksikler.length) parcalar.push(`eksik: ${r.eksikler.map(e => e.etiket).join(', ')}`);
  if (r.degisimler.length) parcalar.push(`değişim: ${r.degisimler.map(d => d.eklenen).join(', ')}`);
  durumYaz(parcalar.join(' · '), r.eksikler.length ? 'uyari' : 'basarili');
  toast(`🎨 ${paket.ad} sepete eklendi`, 'basarili');
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
    const r = await fetch('/api/search-suggestions?q=' + encodeURIComponent(s) + '&limit=8');
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
      <span class="sepet-oneri-etiket">${esc(o.etiket || 'Sonuç')}</span>
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
      durumYaz('✅ Link sepete eklendi.', 'basarili');
      girdi.value = '';
      onerileriKapat();
    } else {
      durumYaz('⚠️ Geçerli bir ürün linki yapıştırın.', 'hata');
    }
    return;
  }
  const liste = await oneriGetir(q);
  const s = q.trim();
  const isimSecenegi = s.length >= 3
    ? [{ url: s, metin: s, tur: 'ad', etiket: 'İsimle ara ve sepete ekle' }]
    : [];
  const birlesik = [...liste, ...isimSecenegi];
  if (!birlesik.length) {
    durumYaz('En az 3 harfli ürün adı yazın ya da ürün linki yapıştırın.', 'uyari');
    onerileriCiz([], q);
    return;
  }
  onerileriCiz(birlesik, q);
  durumYaz(liste.length
    ? `${liste.length} linkli ürün bulundu — seçebilir veya doğrudan isimle ekleyebilirsiniz.`
    : 'Öneride doğrudan eşleşme çıkmadı — "İsimle ara ve sepete ekle" ile ekleyebilirsiniz.');
}

/** "Ekle" butonuna basıldığında öneri listesinde takılmadan yazılan ürünü doğrudan sepete ekler. */
async function metinleSepeteEkle() {
  const girdi = $('#sepetArama');
  const s = (girdi?.value || '').trim();
  onerileriKapat();
  if (!s) {
    durumYaz('Ürün adı yazın ya da ürün linki yapıştırın.', 'uyari');
    girdi?.focus();
    return;
  }
  if (/^https?:\/\//i.test(s)) {
    return aramaYap();
  }
  if (s.length < 2) {
    durumYaz('En az 2 harfli ürün adı yazın ya da ürün linki yapıştırın.', 'uyari');
    girdi?.focus();
    return;
  }
  const ok = sepeteEkle({ ad: s, url: s, tur: 'ad', kaynak: 'arama' });
  if (ok) {
    durumYaz(`✅ "${s}" sepete eklendi.`, 'basarili');
    toast(`🛒 "${s}" sepete eklendi`, 'basarili');
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
      ? '🧮 Senaryolar hesaplanıyor…'
      : `🔎 ${biten}/${toplam} ürün tarandı${p?.not ? ' · ' + String(p.not).slice(0, 90) : ''}`;
  }

  const liste = $('#sepetUrunDurumlari');
  if (liste && Array.isArray(p?.urunler)) {
    kaplama(liste, p.urunler.map(u => {
      const ikon = u.durum === 'ok' ? '✅' : u.durum === 'hata' ? '❌' : (u.durum === 'bulunamadi' ? '⚪' : '⏳');
      const fiyat = u.enUcuz ? ` · en ucuz ${para(u.enUcuz.fiyat)} (${esc(u.enUcuz.site)})` : '';
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
      body: JSON.stringify({ ...govde, hizliMod: true }),
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
  if (!gruplar.length) return 'Mağazayı Aç ➔';
  if (gruplar.length === 1) {
    const ad = String(gruplar[0].siteName || 'Mağaza');
    return `⚡ ${ad}${turkceAblatif(ad)} Al ➔`;
  }
  return `🏪 ${gruplar.length} Mağazadan Satın Al ➔`;
}

function senaryolariCiz(sonuc) {
  const alan = $('#senaryoAlani');
  if (!alan) return;
  alan.hidden = false;

  const kartlar = senaryoListesi(sonuc);
  const onerilen = onerilenAnahtar(sonuc);
  const ozet = tasarrufOzeti(sonuc);
  const enIyi = ozet.enIyiAnahtar;

  $('#senaryoMeta').textContent = `${sonuc.urunSayisi || 0} ürün · ${sonuc.adaySiteSayisi || 0} aday mağaza`;

  kaplama($('#senaryoKartlari'), kartlar.map(k => {
    if (!k.dolu) {
      return `<article class="senaryo-kart senaryo-bos" data-anahtar="${esc(k.anahtar)}">
        <div class="senaryo-ust">
          <span class="senaryo-harf">${esc(k.harf)}</span>
          <div><h3 class="senaryo-baslik">${esc(k.baslik)}</h3>
            <p class="senaryo-aciklama">${esc(k.aciklama)}</p></div>
        </div>
        <p class="senaryo-kurulamadi">Bu senaryo bu sepet için kurulamadı
          (hiçbir mağaza tüm ürünleri birlikte satmıyor).</p>
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
           ⚠️ Kargo/dağıtım yüzünden <b>${para(fark.tl)}</b> daha pahalı
         </p>`
      : (fark && fark.tl === 0
        ? '<p class="senaryo-fark kazanc">💡 En düşük toplam maliyet (eşit)</p>'
        : (enIyiMi ? '<p class="senaryo-fark kazanc">💡 En düşük toplam maliyet</p>' : ''));

    return `<article class="senaryo-kart ${onerilenMi ? 'oneri' : ''} ${enIyiMi ? 'en-iyi' : ''}"
        data-anahtar="${esc(k.anahtar)}">
      <div class="senaryo-ust">
        <span class="senaryo-harf">${esc(k.harf)}</span>
        <div class="senaryo-ust-metin">
          <h3 class="senaryo-baslik">${onerilenMi ? '🏆 ' : ''}${esc(k.baslik)}</h3>
          <p class="senaryo-aciklama">${esc(k.aciklama)}</p>
        </div>
        ${onerilenMi ? '<span class="senaryo-oneri-rozet">ÖNERİLEN</span>' : ''}
      </div>

      <p class="senaryo-magaza-satiri">
        ${(s.gruplar || []).length === 1 ? '🏪' : '🏪 ' + (s.gruplar || []).length + ' mağaza'}
        <span class="senaryo-magaza-adlari">${esc((s.gruplar || []).map(g => g.siteName).join(' + '))}</span>
      </p>

      <div class="senaryo-gruplar">${grupOzet(s)}</div>

      <dl class="senaryo-toplama">
        <div><dt>Ürünler</dt><dd>${para(s.araToplam)}</dd></div>
        ${Number(s.kuponIndirim) > 0 ? `<div><dt>Kupon</dt><dd>−${para(s.kuponIndirim)}</dd></div>` : ''}
        <div class="${Number(s.kargo) > 0 || s.kargoBelirsiz ? 'kargo-ucretli' : 'kargo-bedava'}">
          <dt>Kargo</dt>
          <dd>${Number(s.kargo) > 0
            ? para(s.kargo) + ((s.gruplar || []).length > 1 ? ` (${(s.gruplar || []).length} gönderim)` : '')
            : (s.kargoBelirsiz ? '⚠️ Sepette belli' : 'Bedava (eşik aşıldı)')}</dd>
        </div>
        <div class="senaryo-toplam-satir"><dt>TOPLAM</dt><dd>${para(s.toplam)}</dd></div>
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
        <span class="kargo-kart-eksik">💡 Kargoya <b>${para(acik.eksik)}</b> kaldı</span>
      </div>
      <p class="kargo-kart-metin">
        ${para(acik.kargoUcreti)} kargo ödemek yerine en az ${para(acik.eksik)} ürün ekleyin —
        kargo bedava olsun. Net kazanç: <b>${para(acik.netKazanc)}</b>.
      </p>
      <div class="kargo-kart-oneriler" data-yukleniyor="1">
        <span class="kargo-yukleniyor">⏳ Tamamlayıcı ürünler aranıyor…</span>
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
        kap.innerHTML = '<span class="kargo-yukleniyor">Bu eşik aralığında kârlı tamamlayıcı ürün bulunamadı.</span>';
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
               target="_blank" rel="noopener sponsored">Ürüne git ➔</a>
            <button type="button" class="kargo-oneri-ekle"
              data-ekle-ad="${esc(o.title || '')}"
              data-ekle-url="${esc(o.url || o.afiliyeUrl || '')}"
              data-ekle-fiyat="${esc(String(o.fiyat ?? ''))}"
              data-ekle-site="${esc(grup.siteName || grup.site || '')}"
              ${etki && etki.mantikli ? '' : 'disabled'}>+ Sepete Ekle</button>
          </div>
        </div>`;
      }).join(''));
    } catch {
      const kap = icerik.querySelector(`.kargo-kart[data-site="${CSS.escape(grup.site)}"] .kargo-kart-oneriler`);
      if (kap) {
        kap.removeAttribute('data-yukleniyor');
        kap.innerHTML = '<span class="kargo-yukleniyor">Teklifler alınamadı; eşiğe kalan tutarı yukarıda görebilirsiniz.</span>';
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
  if (!durum.sonuc) { toast('Önce sepeti hesaplayın.', 'hata'); return; }
  btn.disabled = true;
  btn.textContent = '⏳ Link oluşturuluyor…';
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
      el.textContent = `✅ Bağlantı panoya kopyalandı (30 gün geçerli): ${tam}`;
    } catch {
      el.textContent = `🔗 Paylaşım linki (30 gün): ${tam}`;
    }
    el.className = 'sepet-paylas-sonuc basarili';
  } catch (e) {
    el.textContent = '❌ ' + (e.message || 'Paylaşım başarısız');
    el.className = 'sepet-paylas-sonuc hata';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 Sepeti Paylaş';
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
      durumYaz('✅ Ürün sepete eklendi.', 'basarili');
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
        toast(`Sepet en fazla ${MAKS_URUN} ürün alabilir.`, 'hata');
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
    toast('Sepet boşaltıldı.');
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
    hataGoster('Tarama durduruldu. Sepetiniz korunuyor.');
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
