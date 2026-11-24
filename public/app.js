/* Baskı Hesap — ana sayfa mantığı */

/* ================= 🍞 Mikro Toast + kopyalama geri bildirimi (2026-11-12) =================
 *
 * İlke: hiçbir kopyalama/paylaşma eylemi kullanıcıyı yanıtsız bırakmaz.
 *  - `toastGoster()`: ekranın altında 1.5 sn yüzen tek evrensel bildirim.
 *  - `panoyaKopyalaVeGeriBildirim()`: panoya yazar, butonu 1.5 sn yeşile
 *    çevirir ve toast gösterir. Pano API'si yoksa `kopyala()` yedeğine düşer.
 *
 * Tek konteyner kullanılır (#genelToast): art arda tıklamalarda üst üste
 * yığılma olmaz, önceki zamanlayıcı temizlenir.
 */
let toastZamanlayici = null;
let toastKapanisZamanlayici = null;

/**
 * Ekranda 1.5 saniyelik mikro toast bildirimi gösterir.
 * @param {string} metin
 * @param {'basarili'|'bilgi'|'hata'} [tur='basarili']
 */
function toastGoster(metin, tur = 'basarili') {
  const toast = document.getElementById('genelToast');
  const elMetin = document.getElementById('genelToastMetin');
  const elIkon = document.getElementById('genelToastIkon');
  if (!toast || !elMetin) return;
  if (toastZamanlayici) clearTimeout(toastZamanlayici);
  if (toastKapanisZamanlayici) clearTimeout(toastKapanisZamanlayici);
  elMetin.textContent = metin;
  if (elIkon) elIkon.textContent = tur === 'basarili' ? '✓' : (tur === 'hata' ? '⚠️' : 'ℹ️');
  // `hidden` kaldırılmadan sınıf değişirse animasyon yeniden başlamaz.
  toast.hidden = false;
  toast.className = `mikro-toast ${tur}`;
  // Animasyonu yeniden tetikle (aynı toast art arda kullanılıyorsa).
  void toast.offsetWidth;
  toastZamanlayici = setTimeout(() => {
    toast.classList.add('kapanis');
    toastKapanisZamanlayici = setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('kapanis');
    }, 200);
  }, 1500);
}

/**
 * Panoya kopyalar, tıklanan butonu 1.5 sn yeşil onay durumuna alır ve toast
 * gösterir. Buton içeriği zamanlayıcıdan sonra eski hâline döner.
 * @param {string} metin kopyalanacak veri
 * @param {HTMLElement|null} [btn] tıklanan buton
 * @param {string} [onayMetni='Bağlantı panoya kopyalandı!']
 * @returns {Promise<boolean>} kopyalama başarılı mı
 */
async function panoyaKopyalaVeGeriBildirim(metin, btn = null, onayMetni = 'Bağlantı panoya kopyalandı!') {
  let basarili = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(metin);
      basarili = true;
    }
  } catch { basarili = false; }
  // Güvenli bağlam yoksa (http, eski tarayıcı) mevcut yedeğe düş.
  if (!basarili && typeof kopyala === 'function') {
    try { basarili = await kopyala(metin); } catch { basarili = false; }
  }

  if (!basarili) {
    toastGoster('Kopyalanamadı, lütfen elle kopyalayın.', 'hata');
    return false;
  }

  toastGoster(onayMetni, 'basarili');
  if (btn) {
    const orijinalHtml = btn.innerHTML;
    btn.classList.add('btn-kopyalandi');
    btn.innerHTML = `✓ ${onayMetni.replace('panoya ', '')}`;
    setTimeout(() => {
      btn.innerHTML = orijinalHtml;
      btn.classList.remove('btn-kopyalandi');
    }, 1500);
  }
  return true;
}

/* ================= 📱 Alt navigasyon (2026-11-01) =================
 *
 * Mobilde (<768px) sabit alt bar; masaüstünde CSS ile gizlenir.
 *  - Karşılaştır: arama kutusuna odaklanır
 *  - Dip Fırsatlar: vitrin borsasına kaydırır
 *  - Fiyat Alarmlarım / Fırsatlar: modal (veri sunucudan)
 *  - Sepetim: sepet bölümüne kaydırır
 *  - Ayarlar: /ayarlar.html
 */

function altModalKapat() {
  const m = document.getElementById('altModal');
  if (m) m.hidden = true;
  // Kaydırma kilidi HER durumda bırakılır (modal görünmese bile sayfa donmasın).
  document.body.style.overflow = '';
}

/**
 * Alt modalı açar.
 * @returns {boolean} modal gerçekten görünür olduysa true
 */
function altModalAc(baslik, html) {
  const m = document.getElementById('altModal');
  const baslikEl = document.getElementById('altModalBaslik');
  const icerikEl = document.getElementById('altModalIcerik');
  if (!m || !baslikEl || !icerikEl) return false;
  baslikEl.textContent = baslik;
  icerikEl.innerHTML = html;
  m.hidden = false;
  // 🐞 2026-11-15: Kaydırma kilidi yalnızca modal GERÇEKTEN görünüyorsa uygulanır.
  // Önceden `display:none` kalan bir modal için body kilitleniyor, sayfa
  // "takılmış" gibi donuyordu (Sitene Ekle butonu).
  const gorunur = getComputedStyle(m).display !== 'none';
  document.body.style.overflow = gorunur ? 'hidden' : '';
  return gorunur;
}

document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-modal-kapat]')) altModalKapat();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') altModalKapat();
});

/** Fiyat alarmlarım: kayıtlı ürünler + hedef fiyat + son fiyat. */
async function altNavTakipler() {
  altModalAc('🔔 Fiyat Alarmlarım', '<div class="alt-modal-bos">Yükleniyor…</div>');
  try {
    const res = await fetch('/api/tracked');
    const liste = await res.json();
    if (!Array.isArray(liste) || !liste.length) {
      altModalAc('🔔 Fiyat Alarmlarım', '<div class="alt-modal-bos">Henüz fiyat alarmınız yok.<br>'
        + 'Bir ürünü karşılaştırdıktan sonra "🔔 Fiyatı Takibe Al" ile ekleyin.</div>');
      return;
    }
    altModalAc('🔔 Fiyat Alarmlarım', liste.map(t => {
      const url = Array.isArray(t.urunler) && t.urunler[0]?.url ? t.urunler[0].url : null;
      const hedef = t.hedefFiyat ? tl(t.hedefFiyat) : '—';
      return `<a class="alt-liste-oge" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : ''}>
        <span class="alt-liste-sol">
          <span class="alt-liste-baslik">${esc(t.urun || 'Ürün')}</span>
          <span class="alt-liste-alt">Hedef: ${hedef}${t.sonKontrol ? ' · Son kontrol: ' + new Date(t.sonKontrol).toLocaleDateString('tr-TR') : ''}</span>
        </span>
        <span class="alt-liste-fiyat">${t.sonFiyatlar?.[0]?.fiyat != null ? tl(t.sonFiyatlar[0].fiyat) : ''}</span>
      </a>`;
    }).join(''));
  } catch {
    altModalAc('🔔 Fiyat Alarmlarım', '<div class="alt-modal-bos">Takipler yüklenemedi.</div>');
  }
}

/** Fırsatlar: otonom kanalın son paylaştığı fırsatlar. */
async function altNavFirsatlar() {
  altModalAc('📢 Fırsatlar', '<div class="alt-modal-bos">Yükleniyor…</div>');
  try {
    const res = await fetch('/api/firsat/durum');
    const d = await res.json();
    const son = Array.isArray(d?.son) ? d.son.filter(x => x.urun) : [];
    if (!son.length) {
      altModalAc('📢 Fırsatlar', '<div class="alt-modal-bos">Henüz paylaşılmış fırsat yok.<br>'
        + `Kanal durumu: <b>${d?.ayar?.enabled ? 'açık' : 'kapalı'}</b> · bugün ${d?.bugun || 0} paylaşım.</div>`);
      return;
    }
    altModalAc('📢 Fırsatlar', son.slice(0, 12).map(f => `
      <div class="alt-liste-oge">
        <span class="alt-liste-sol">
          <span class="alt-liste-baslik">${esc(f.urun)}</span>
          <span class="alt-liste-alt">${esc(f.site || '')} · %${String(f.indirim ?? '').replace('.', ',')} indirim · ${f.ts ? new Date(f.ts).toLocaleString('tr-TR') : ''}</span>
        </span>
        <span class="alt-liste-fiyat">${f.fiyat != null ? tl(f.fiyat) : ''}</span>
      </div>`).join(''));
  } catch {
    altModalAc('📢 Fırsatlar', '<div class="alt-modal-bos">Fırsatlar yüklenemedi.</div>');
  }
}

function altNavAktif(ad) {
  document.querySelectorAll('.alt-nav-oge').forEach(el => {
    el.classList.toggle('aktif', el.dataset.nav === ad);
    if (el.dataset.nav === ad) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

document.querySelectorAll('.alt-nav-oge').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const ad = btn.dataset.nav;
    if (ad === 'ayarlar') return; // normal link
    e.preventDefault();
    altNavAktif(ad);
    if (ad === 'karsilastir') {
      const input = document.getElementById('urunUrl');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => input?.focus({ preventScroll: true }), 260);
      return;
    }
    if (ad === 'borsa') {
      borsaGoster(true);
      return;
    }
    if (ad === 'takipler') { altNavTakipler(); return; }
    if (ad === 'firsatlar') { altNavFirsatlar(); return; }
    if (ad === 'sepet') {
      const hedef = document.querySelector('.sepet-kart');
      hedef?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => document.getElementById('sepetUrls')?.focus({ preventScroll: true }), 320);
    }
  });
});

// Erişim anahtarı yönetimi /erisim.js içinde (modal tabanlı; native prompt() kullanmaz).

/* ================= 📊 Canlı "Borsa" vitrini (2026-11-03) =================
 *
 * Ana sayfada otonom radarın (radar_durum) stoktaki dip fiyatlarını finans
 * ekranı gibi gösterir. Veri /api/vitrin'den gelir (herkese açık, salt okunur;
 * token/sohbet/PID içermez).
 *  - 60 sn'de bir sessiz tazeleme (sekme görünürken)
 *  - "En Dip Fiyat" yalnızca gerçek geçmiş minimumuna eşitse gösterilir
 *  - Kart tıklaması afiliye mağaza linkine gider; tıklama sayacı çalışır
 */

const VITRIN_ARALIK_MS = 60 * 1000;
let vitrinTimer = null;
let vitrinSonYukleme = 0;
let vitrinYukleniyor = false;

/** ₺1.234,56 biçimi (tabular-nums ile hizalı). */
function vitrinPara(n) {
  const sayi = Number(n);
  if (!Number.isFinite(sayi)) return '—';
  return '₺' + sayi.toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** "az önce / 12 dk önce / 3 sa önce". */
function vitrinYas(iso) {
  const ts = Date.parse(String(iso || ''));
  if (!Number.isFinite(ts)) return null;
  const dk = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (dk < 1) return 'az önce';
  if (dk < 60) return dk + ' dk önce';
  const sa = Math.floor(dk / 60);
  if (sa < 24) return sa + ' sa önce';
  return Math.floor(sa / 24) + ' gün önce';
}

/** Mini sparkline: yalnızca gerçek geçmiş noktalarından SVG çizgi. */
function vitrinSparkline(seri) {
  if (!Array.isArray(seri) || seri.length < 2) return '';
  const W = 116, H = 30, P = 3;
  const min = Math.min(...seri);
  const max = Math.max(...seri);
  const aralik = max - min || 1;
  const n = seri.length;
  const x = (i) => P + (i / (n - 1)) * (W - P * 2);
  const y = (f) => P + (1 - (f - min) / aralik) * (H - P * 2);
  const noktalar = seri.map((f, i) => `${x(i).toFixed(1)},${y(f).toFixed(1)}`).join(' ');
  const dusuyor = seri[n - 1] <= seri[0];
  const alan = `${P},${H - P} ${noktalar} ${W - P},${H - P}`;
  return `<svg class="vitrin-spark ${dusuyor ? 'dusuyor' : 'cikiyor'}" viewBox="0 0 ${W} ${H}"
    preserveAspectRatio="none" role="img" aria-label="Son ${n} fiyat noktası trendi">
    <polygon class="vitrin-spark-alan" points="${alan}" />
    <polyline class="vitrin-spark-cizgi" pathLength="100" points="${noktalar}" />
  </svg>`;
}

/** Tek borsa kartı. */
/* ================= 🗂️ Borsa kategori filtreleri (2026-11-10) =================
 *
 * Vitrin artık kategori dengeli geliyor (6 filament + 4 yazıcı + 2 parça).
 * Çipler yalnızca GERÇEKTE var olan kategorileri gösterir; sayılar sunucunun
 * döndürdüğü listeyle birebir aynıdır (uydurma sayaç yok).
 */

const VITRIN_KATEGORI_ETIKET = { filament: '🧵 Filamentler', yazici: '🖨️ 3D Yazıcılar', genel: '⚙️ Parça & Reçine' };
const VITRIN_KATEGORI_SIRA = ['filament', 'yazici', 'genel'];

let vitrinUrunleri = [];
let vitrinAktifKategori = 'hepsi';

/** Kategori sayılarını çiplere yazar; 0 olan kategoriyi gizler. */
function vitrinCipleriDoldur(urunler) {
  const kap = document.getElementById('vitrinCipleri');
  if (!kap) return;
  const liste = Array.isArray(urunler) ? urunler : [];
  const sayim = { hepsi: liste.length, filament: 0, yazici: 0, genel: 0 };
  for (const u of liste) if (sayim[u.kategori] != null) sayim[u.kategori] += 1;

  // "Hepsi" çipi her zaman görünür; kategori çipleri yalnızca veri varsa.
  let gorunen = 0;
  for (const btn of kap.querySelectorAll('[data-vitrin-kategori]')) {
    const kat = btn.dataset.vitrinKategori;
    const adet = sayim[kat] || 0;
    const span = btn.querySelector('.vitrin-filtre-sayi');
    if (span) span.textContent = String(adet);
    const goster = kat === 'hepsi' ? liste.length > 0 : adet > 0;
    btn.hidden = !goster;
    if (goster) gorunen++;
    // Seçili kategori artık boşsa "Hepsi"ye dön.
    if (!goster && vitrinAktifKategori === kat) vitrinAktifKategori = 'hepsi';
  }
  for (const btn of kap.querySelectorAll('[data-vitrin-kategori]')) {
    const secili = btn.dataset.vitrinKategori === vitrinAktifKategori;
    btn.classList.toggle('aktif', secili);
    btn.setAttribute('aria-selected', secili ? 'true' : 'false');
  }
  kap.hidden = gorunen <= 1;
}

/** Seçili kategoriye göre kartları çizer (CSS fade animasyonuyla). */
function vitrinCiz() {
  const grid = document.getElementById('vitrinGrid');
  if (!grid) return;
  const kat = vitrinAktifKategori;
  const liste = kat === 'hepsi'
    ? vitrinUrunleri
    : vitrinUrunleri.filter(u => u.kategori === kat);
  grid.innerHTML = liste.map(vitrinKartHtml).join('');
  if (grid.firstElementChild) {
    grid.firstElementChild.classList.add('vitrin-yeni');
  }
}

/** Alt başlık için kısa dağılım metni: "6 filament · 4 yazıcı · 2 parça". */
function vitrinDagilimMetni(dagilim) {
  if (!dagilim || typeof dagilim !== 'object') return '';
  const parcalar = [];
  if (Number(dagilim.filament) > 0) parcalar.push(`${Number(dagilim.filament)} filament`);
  if (Number(dagilim.yazici) > 0) parcalar.push(`${Number(dagilim.yazici)} yazıcı`);
  if (Number(dagilim.genel) > 0) parcalar.push(`${Number(dagilim.genel)} parça/reçine`);
  return parcalar.join(' · ');
}

function vitrinKartHtml(u) {
  const rozet = u.gercekFirsat
    ? '<span class="vitrin-rozet firsat" title="Son 90 günün en düşük fiyatı — gerçek fiyat geçmişinden doğrulandı">🔥 GERÇEK FIRSAT</span>'
    : (u.dip
      ? '<span class="vitrin-rozet dip">🔥 En Dip Fiyat</span>'
      : (Number(u.indirimYuzde) >= 5
        // Bu oran mağazanın etiket indirimi DEĞİL: stoklu mağazalar arasındaki farktır.
        ? `<span class="vitrin-rozet indirim" title="Stokta olan mağazalar arasındaki en yüksek fiyata göre fark">Mağazalar arası %${Number(u.indirimYuzde)} fark</span>`
        : ''));
  const altParcalar = [];
  if (u.birimMetni) altParcalar.push(esc(u.birimMetni));
  if (u.kargo) altParcalar.push(esc(u.kargo));
  if (u.degisim != null && Number(u.degisim) !== 0) {
    const ok = Number(u.degisim) < 0 ? '↓' : '↑';
    const sinif = Number(u.degisim) < 0 ? 'dusuk' : 'yuksek';
    altParcalar.push(`<span class="vitrin-degisim ${sinif}">${ok} ${vitrinPara(Math.abs(u.degisim))}</span>`);
  }
  const durumMetni = u.stokta ? 'Stokta' : 'Stokta yok';
  const afiliyeAttr = u.siteId ? ` data-afiliye-site="${esc(u.siteId)}"` : '';
  return `<a class="vitrin-kart${u.dip ? ' vitrin-kart-dip' : ''}${u.stokta ? '' : ' vitrin-kart-yok'}"
    href="${esc(u.url)}" target="_blank" rel="noopener sponsored"${afiliyeAttr}>
    <span class="vitrin-kart-ust">
      <span class="vitrin-durum ${u.stokta ? 'var' : 'yok'}" title="${durumMetni}"></span>
      <span class="vitrin-kategori" aria-hidden="true">${esc(u.ikon || '📦')}</span>
      ${rozet}
    </span>
    <span class="vitrin-urun">${esc(u.ad)}</span>
    <span class="vitrin-fiyat">${vitrinPara(u.fiyat)}</span>
    <span class="vitrin-magaza">${esc(u.site || 'Mağaza')}${u.stokta ? '' : ' · stokta yok'}</span>
    ${altParcalar.length ? `<span class="vitrin-alt-satir">${altParcalar.join(' · ')}</span>` : ''}
    ${vitrinSparkline(u.seri)}
    <span class="vitrin-cta">Mağazaya git <span aria-hidden="true">→</span></span>
  </a>`;
}

function vitrinIskelet() {
  return Array.from({ length: 4 }, () => `
    <div class="vitrin-kart vitrin-iskelet" aria-hidden="true">
      <span class="skeleton-cizgi w-40"></span>
      <span class="skeleton-cizgi w-90"></span>
      <span class="skeleton-cizgi w-60"></span>
      <span class="skeleton-cizgi w-70"></span>
    </div>`).join('');
}

function vitrinZamanla() {
  if (vitrinTimer) clearTimeout(vitrinTimer);
  vitrinTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') vitrinYukle({ sessiz: true });
    else vitrinZamanla();
  }, VITRIN_ARALIK_MS);
}

/** Vitrini yükler. Sunucu boş/hatalıysa bölüm gizlenir (kırık vitrin gösterilmez). */
/* ================= ⭐ Sponsorlu Vitrin (Hero Banner) — 2026-11-08 =================
 *
 * Aktif kampanya yoksa / süresi dolduysa alan HİÇ açılmaz (sıfır görsel bozulma).
 * Gösterim sayacı sunucuda `/api/sponsor/vitrin` çağrısında artar; tıklama
 * sayacı `/api/sponsor/tikla/:id` yönlendirmesinde artar (302 hedef).
 *
 * DÜRÜSTLÜK: fiyat/indirim yalnızca kampanya kaydında yazıyorsa gösterilir;
 * "eski fiyat" yoksa üstü çizili fiyat basılmaz.
 */

let sponsorVitrinVeri = null;

function sponsorKalanGun(bitisTarihi) {
  const t = Date.parse(bitisTarihi);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 3600 * 1000));
}

function sponsorFiyat(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sponsorVitrinYukle() {
  const alan = document.getElementById('sponsorVitrinAlani');
  if (!alan) return null;
  if (BASKI_ORTAM.market && BASKI_ORTAM.market !== 'tr') { alan.hidden = true; return null; }
  try {
    const res = await fetch('/api/sponsor/vitrin', { credentials: 'same-origin' });
    const d = await res.json().catch(() => ({}));
    const v = d?.vitrin;
    // Savunma: son kullanma tarihi geçmiş kayıt gelirse yine gizle.
    if (!res.ok || !v || !v.id || !/^https?:\/\//i.test(String(v.yonlendirmeUrl || ''))) {
      alan.hidden = true;
      return null;
    }
    const kalan = sponsorKalanGun(v.bitisTarihi);
    if (kalan != null && kalan < 0) { alan.hidden = true; return null; }

    sponsorVitrinVeri = v;

    // Banner'ı ÖNCE aç: `loading="lazy"` görseli gizli kapta yüklemiyor
    // (2026-11-09: kap hidden iken src atanınca görsel hiç istenmiyordu).
    alan.hidden = false;

    const $ = (id) => document.getElementById(id);
    $('sponsorRozet').textContent = `⭐ ${v.rozetMetni || 'HAFTANIN SPONSORLU FIRSATI'} · ${String(v.marka || '').toUpperCase()}`;
    $('sponsorMarka').textContent = v.marka || '';
    $('sponsorVitrinBaslik').textContent = v.baslik || '';
    $('sponsorAciklama').textContent = v.aciklama || '';
    $('sponsorAciklama').hidden = !v.aciklama;

    const yeni = sponsorFiyat(v.kampanyaFiyat);
    const eski = sponsorFiyat(v.eskiFiyat);
    const yeniEl = $('sponsorYeniFiyat');
    const eskiEl = $('sponsorEskiFiyat');
    const indirimEl = $('sponsorIndirim');
    if (yeni) yeniEl.textContent = yeni; else yeniEl.hidden = true;
    if (eski && v.eskiFiyat > v.kampanyaFiyat) {
      eskiEl.textContent = eski;
      eskiEl.hidden = false;
      if (v.indirimTL > 0) {
        indirimEl.textContent = `−${sponsorFiyat(v.indirimTL)}${v.indirimYuzde ? ` (%${String(v.indirimYuzde).replace('.', ',')})` : ''}`;
        indirimEl.hidden = false;
      } else {
        indirimEl.hidden = true;
      }
    } else {
      eskiEl.hidden = true;
      indirimEl.hidden = true;
    }

    const cta = $('sponsorCta');
    cta.href = '/api/sponsor/tikla/' + encodeURIComponent(v.id);
    cta.setAttribute('rel', 'noopener sponsored');
    cta.setAttribute('target', '_blank');
    $('sponsorCtaMetin').textContent = `⚡ Kampanyayı İncele (${v.marka || 'mağaza'} ➔)`;

    const bitisEl = $('sponsorBitis');
    if (bitisEl) {
      bitisEl.textContent = kalan != null && kalan <= 7
        ? `⏳ Kampanya ${kalan === 0 ? 'bugün' : kalan + ' gün içinde'} sona eriyor · sponsorlu içerik`
        : 'Sponsorlu içerik · fiyat ve stok mağazada geçerlidir';
    }

    // Görsel yüklenmezse emoji yer tutucuya düş (kart bozulmasın).
    const img = $('sponsorGorsel');
    const yedek = $('sponsorGorselYok');
    if (img) {
      img.alt = v.baslik || v.marka || 'Sponsorlu ürün';
      img.loading = 'eager';          // gizli kapta lazy yükleme başlamıyor
      img.decoding = 'async';
      img.onerror = () => { img.hidden = true; if (yedek) yedek.hidden = false; };
      img.onload = () => { img.hidden = false; if (yedek) yedek.hidden = true; };
      img.src = v.gorselUrl;
    }

    // Reklam tıklamasını ölç (yalnızca gerçek kullanıcı tıklaması).
    cta.addEventListener('click', () => {
      try {
        if (window.gtag) window.gtag('event', 'sponsor_tiklama', { kampanya: v.id, marka: v.marka });
      } catch { /* analitik yoksa sorun değil */ }
    }, { once: true });

    return v;
  } catch {
    alan.hidden = true;   // ağ hatasında banner basma (sayfa bozulmasın)
    return null;
  }
}

/* ================= ✅ Doğrulanmış Mağaza rozetleri — 2026-11-08 =================
 *
 * `/api/dogrulanmis-magazalar` 5 dk önbellekli; rozet metni sunucudan gelir.
 * Fiyat/sıralama DEĞİŞMEZ — yalnızca güven işareti.
 */

let dogrulanmisHarita = {};
let dogrulanmisYuklendi = false;

async function dogrulanmisMagazalariYukle() {
  if (dogrulanmisYuklendi) return dogrulanmisHarita;
  dogrulanmisYuklendi = true;
  try {
    const dil = BASKI_ORTAM.dil && BASKI_ORTAM.dil !== 'tr' ? '?dil=' + encodeURIComponent(BASKI_ORTAM.dil) : '';
    const res = await fetch('/api/dogrulanmis-magazalar' + dil, { credentials: 'same-origin' });
    const d = await res.json().catch(() => ({}));
    dogrulanmisHarita = (d && d.harita && typeof d.harita === 'object') ? d.harita : {};
  } catch {
    dogrulanmisHarita = {};
  }
  // Rozetler sonuçtan sonra da yüklenebilir: mevcut kartları tazele.
  if (sonSonuc) {
    try { kartlariFiltreleVeCiz(seciliFiltre || 'hepsi'); } catch { /* çizim yoksa yoksay */ }
    try { tabloDoldur(sonSonuc); } catch { /* yoksay */ }
  }
  return dogrulanmisHarita;
}

/**
 * Mağaza adı + (varsa) doğrulanmış partner rozeti.
 * Rozet metni: "Resmi Distribütör · Aynı Gün Kargo" gibi.
 */
function dogrulanmisRozetHtml(site) {
  const anahtar = String(site || '').toLowerCase();
  const metin = dogrulanmisHarita[anahtar];
  if (!metin) return '';
  const kisa = String(metin).split('·')[0].trim();
  const prefix = BASKI_ORTAM.dil === 'en'
    ? 'Verified Partner: '
    : (BASKI_ORTAM.dil === 'fr' ? 'Partenaire vérifié : ' : (BASKI_ORTAM.dil === 'ja' ? '認証パートナー: ' : 'Doğrulanmış Partner: '));
  return `<span class="magaza-dogrulanmis" title="${esc(prefix + metin)}">`
    + '<svg class="mavi-tik" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M12 2.4 14.7 5l3.7.5.6 3.7 2.5 2.8-2.5 2.8-.6 3.7-3.7.6-2.7 2.6-2.7-2.6-3.7-.6-.6-3.7L2.5 12 5 9.2l.6-3.7L9.3 5z" '
    + 'fill="#1D9BF0"/><path d="M10.6 15.3 7.9 12.6l1.3-1.3 1.4 1.4 3.9-3.9 1.3 1.3z" fill="#fff"/></svg>'
    + `<span class="dogrulanmis-etiket">${esc(kisa)}</span>`
    + '</span>';
}

/* ================= 📊 Canlı "Filament & 3D Yazıcı Borsası" vitrini ================= */

async function vitrinYukle({ sessiz = false } = {}) {
  const alan = document.getElementById('vitrinAlani');
  const grid = document.getElementById('vitrinGrid');
  const bos = document.getElementById('vitrinBos');
  if (!alan || !grid || vitrinYukleniyor) return;
  if (BASKI_ORTAM.market && BASKI_ORTAM.market !== 'tr') {
    grid.setAttribute('aria-busy', 'false');
    alan.hidden = true;
    return;
  }
  vitrinYukleniyor = true;
  alan.hidden = false;
  if (!sessiz && !grid.children.length) {
    grid.innerHTML = vitrinIskelet();
    grid.setAttribute('aria-busy', 'true');
  }
  try {
    const res = await fetch('/api/vitrin?limit=12', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const urunler = Array.isArray(d?.urunler) ? d.urunler : [];
    vitrinSonYukleme = Date.now();
    grid.setAttribute('aria-busy', 'false');
    if (!urunler.length) {
      grid.innerHTML = '';
      if (bos) bos.hidden = false;
      vitrinUrunleri = [];
      vitrinCipleriDoldur([]);
      const sayac = document.getElementById('vitrinSayac');
      if (sayac) sayac.textContent = 'henüz tarama yok';
    } else {
      if (bos) bos.hidden = true;
      vitrinUrunleri = urunler;
      vitrinCipleriDoldur(urunler);
      vitrinCiz();
      const yas = vitrinYas(d.guncelleme);
      const guncel = document.getElementById('vitrinGuncelleme');
      if (guncel) {
        const ozet = vitrinDagilimMetni(d.dagilim);
        guncel.textContent = 'Otonom radar · '
          + (yas ? 'son tarama ' + yas : 'canlı fiyatlar')
          + (ozet ? ' · ' + ozet : '');
      }
      const sayac = document.getElementById('vitrinSayac');
      if (sayac) {
        const stok = urunler.filter(u => u.stokta).length;
        sayac.textContent = `${stok} ürün stokta · ${urunler.length} kart · 60 sn'de bir yenilenir`;
      }
    }
  } catch {
    grid.setAttribute('aria-busy', 'false');
    // Zaten kart varsa eski (gerçek) veriyi koru; hiç yoksa bölümü gizle.
    if (!grid.children.length) alan.hidden = true;
  } finally {
    vitrinYukleniyor = false;
    vitrinZamanla();
  }
}

/**
 * Vitrini görünür alanın üstüne kaydırır.
 *
 * NEDEN elle hesaplama: vitrin sayfanın altına yakın; `scrollIntoView` sabit
 * üst barın (68px) ve `scroll-padding-top`ın altında kalıyordu. Ayrıca
 * yumuşak kaydırma, kartlar yeniden çizilirken yarıda kesilebiliyor — bu yüzden
 * 400 ms sonra bir kez daha hizalanır (ikinci kaydırma zaten hedefteyse görünmez).
 */
function vitrineKaydir() {
  const alan = document.getElementById('vitrinAlani');
  if (!alan) return;
  const hedef = () => Math.max(0, alan.getBoundingClientRect().top + window.scrollY - 84);
  try { window.scrollTo({ top: hedef(), behavior: 'smooth' }); } catch { window.scrollTo(0, hedef()); }
  setTimeout(() => {
    if (Math.abs(alan.getBoundingClientRect().top - 84) > 8) {
      try { window.scrollTo({ top: hedef(), behavior: 'smooth' }); } catch { window.scrollTo(0, hedef()); }
    }
  }, 400);
}

/** "Borsa" sekmesi: vitrini göster, üste kaydır, tazele. */
function borsaGoster(kaydir = true) {
  const alan = document.getElementById('vitrinAlani');
  if (!alan) return;
  alan.hidden = false;
  if (kaydir) vitrineKaydir();
  const grid = document.getElementById('vitrinGrid');
  if (grid && !grid.children.length) grid.innerHTML = vitrinIskelet();
  vitrinYukle({ sessiz: true });
}

// ⭐ Sponsorlu vitrin + doğrulanmış mağaza rozetleri (2026-11-08)
// Ana sayfa dışındaki sayfalarda ilgili alan yoksa fonksiyon sessizce çıkar.
document.addEventListener('DOMContentLoaded', () => {
  sponsorVitrinYukle();
  dogrulanmisMagazalariYukle();
});

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('vitrinAlani')) return;
  vitrinYukle();
  document.getElementById('vitrinYenile')?.addEventListener('click', () => {
    vitrinYukle({ sessiz: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible'
      && Date.now() - vitrinSonYukleme > VITRIN_ARALIK_MS) {
      vitrinYukle({ sessiz: true });
    }
  });
});

// 🗂️ Kategori filtre çipleri: seçime göre kartları fade ile yeniden çiz.
document.addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-vitrin-kategori]') : null;
  if (!btn) return;
  e.preventDefault();
  const kat = btn.dataset.vitrinKategori || 'hepsi';
  if (!['hepsi', ...VITRIN_KATEGORI_SIRA].includes(kat)) return;
  vitrinAktifKategori = kat;
  for (const b of document.querySelectorAll('[data-vitrin-kategori]')) {
    const secili = b.dataset.vitrinKategori === kat;
    b.classList.toggle('aktif', secili);
    b.setAttribute('aria-selected', secili ? 'true' : 'false');
  }
  const grid = document.getElementById('vitrinGrid');
  if (grid) {
    grid.classList.remove('vitrin-gecis');
    // Küçük bir "yeniden akış" ile CSS fade animasyonu yeniden tetiklenir.
    void grid.offsetWidth;
    grid.classList.add('vitrin-gecis');
  }
  vitrinCiz();
});

// 📢 Vitrin başlığındaki "Fırsatlar" çipi (mobil alt bardan kaldırıldı).
document.addEventListener('click', (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-firsat-ac]') : null;
  if (!btn) return;
  e.preventDefault();
  altNavFirsatlar();
});


const BASKI_ORTAM = (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM)
  ? window.BASKI_HESAP_ORTAM
  : { market: 'tr', currency: 'TRY', dil: 'tr' };

// Site listesi sunucudan (/api/durum) dinamik olarak yüklenir; yüklenene kadar
// bilinen temel siteler gösterilir.
let SITE_SIRASI = Array.isArray(BASKI_ORTAM.siteler) && BASKI_ORTAM.siteler.length
  ? BASKI_ORTAM.siteler.map(s => s.id)
  : ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'itopya', 'pazarama', 'incehesap'];
let SITE_ADLARI = Array.isArray(BASKI_ORTAM.siteler) && BASKI_ORTAM.siteler.length
  ? Object.fromEntries(BASKI_ORTAM.siteler.map(s => [s.id, s.ad]))
  : {
    trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', amazon: 'Amazon.tr', vatan: 'Vatan Bilgisayar',
    mediamarkt: 'MediaMarkt', itopya: 'İtopya', pazarama: 'Pazarama', incehesap: 'İncehesap',
  };

/**
 * Site listesinin sunucudan gelmesini bekleyen söz.
 * ÖNEMLİ (2026-10-29): kullanıcı sayfa açılır AÇILMAZ aramaya basarsa çipler
 * 8 elemanlı varsayılan listeyle çiziliyor, sonra liste 61'e çıkınca 53 çip
 * hiç görünmüyordu. Artık arama, liste hazır olana kadar bekler.
 */
let sitelerHazir = (async () => {
  try {
    const durumUrl = BASKI_ORTAM.market && BASKI_ORTAM.market !== 'tr'
      ? '/api/durum?market=' + encodeURIComponent(BASKI_ORTAM.market)
      : '/api/durum';
    const res = await fetch(durumUrl);
    if (!res.ok) return;
    const d = await res.json();
    if (Array.isArray(d.siteler) && d.siteler.length) {
      SITE_SIRASI = d.siteler.map(s => s.id);
      SITE_ADLARI = Object.fromEntries(d.siteler.map(s => [s.id, s.ad]));
    }
    // Footer: karşılaştırılan sitelerin listesi
    const liste = document.getElementById('footerSiteler');
    const sayi = document.getElementById('footerSiteSayisi');
    if (liste) {
      liste.innerHTML = SITE_SIRASI.map(s => `<li>${SITE_ADLARI[s] || s}</li>`).join('');
      if (sayi) sayi.textContent = SITE_SIRASI.length;
    }
    // Hero ve giriş kartındaki site sayıları
    for (const id of ['heroSiteSayisi', 'kartSiteSayisi']) {
      const el = document.getElementById(id);
      if (el) el.textContent = SITE_SIRASI.length;
    }
    // Şeffaflık bildirimi yalnızca satış ortaklığı aktifken gösterilir
    const afBildirim = document.getElementById('afiliyeBildirim');
    if (afBildirim) afBildirim.hidden = !d.afiliyeAktif;
  } catch { /* sunucuya ulaşılamadıysa temel liste kalır */ }
})();

const $ = (s) => document.querySelector(s);

/* ================= Stok sıralama hiyerarşisi (2026-10-30) =================
 * TEK KURAL: sunucu `sonuclar` dizisini zaten bu hiyerarşiyle sıralı gönderir
 * (src/stokSirala.js). Buradaki kopya yalnızca FİLTRELEME sonrası ve anlık
 * (snapshot) birleştirmelerde sıranın korunması içindir — kurallar birebir aynı
 * olmalı. Fiyat ne kadar ucuz olursa olsun tükenmiş ürün üste geçemez.
 *
 *   0 🟢 stokta + aynı renk/model      1 🔴 tükendi + aynı renk/model
 *   2 🎨 stokta + farklı varyant       3 🎨 tükendi + farklı varyant
 *   4 ⚪ bulunamadı / hata / iptal
 */
const STOK_GRUP = Object.freeze({
  STOKTA_AYNI: 0, TUKENDI_AYNI: 1, STOKTA_FARKLI: 2, TUKENDI_FARKLI: 3, BULUNAMADI: 4,
});

function stoktaMi(r) {
  return r?.product?.inStock !== false;
}

function karsilastirmaFiyati(r) {
  const toplam = r?.product?.pricing?.toplam;
  if (Number.isFinite(toplam)) return toplam;
  const satis = r?.product?.sellingPrice;
  if (Number.isFinite(satis)) return satis;
  return Infinity;
}

function stokGrubu(r) {
  if (!r || r.status !== 'found' || !r.product) return STOK_GRUP.BULUNAMADI;
  const ayniRenk = r.renkAyni !== false;
  const stokta = stoktaMi(r);
  if (ayniRenk) return stokta ? STOK_GRUP.STOKTA_AYNI : STOK_GRUP.TUKENDI_AYNI;
  return stokta ? STOK_GRUP.STOKTA_FARKLI : STOK_GRUP.TUKENDI_FARKLI;
}

function stokSirala(liste) {
  return [...(Array.isArray(liste) ? liste : [])].sort((a, b) => {
    const fark = stokGrubu(a) - stokGrubu(b);
    if (fark !== 0) return fark;
    const fa = karsilastirmaFiyati(a);
    const fb = karsilastirmaFiyati(b);
    if (fa === fb) return 0;
    if (fa === Infinity) return 1;
    if (fb === Infinity) return -1;
    return fa - fb;
  });
}

let sonSonuc = null;
let aktifIs = null;

// İptal butonu (2026-10-27): tarama sürerken kalan siteleri durdurur.
// Buton HTML'de her zaman var; yalnız durum alanı görünürken işe yarar.
document.addEventListener('DOMContentLoaded', () => {
  const iptalBtn = document.getElementById('iptalBtn');
  if (iptalBtn) iptalBtn.addEventListener('click', karsilastirmayiIptalEt);
  // Sayfa yenilendiyse yarım kalan sepet taramasına dön (2026-10-28)
  if (typeof sepetDevamEt === 'function') sepetDevamEt();
});

/**
 * Satış ortaklığı tıklama sayacı (2026-10-28).
 *
 * Yalnızca "hangi mağazaya git" bağlantısı tıklandı sayısı tutulur; kişisel veri,
 * çerez veya üçüncü taraf isteği yok. Sayaç başarısız olsa da bağlantı normal açılır
 * (sendBeacon fire-and-forget; hata kullanıcıya yansımaz).
 */
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest('a[data-afiliye-site]') : null;
  if (!a) return;
  const site = a.dataset.afiliyeSite;
  if (!site) return;
  try {
    const govde = JSON.stringify({ site });
    // Erişim anahtarı fetch'e otomatik eklenir ama sendBeacon başlık gönderemez;
    // bu yüzden anahtar sorgu parametresi olarak eklenir (sunucu ikisini de kabul eder).
    let anahtar = '';
    try { anahtar = localStorage.getItem('erisim_anahtari') || ''; } catch { /* yok say */ }
    const yol = '/api/afiliye/tikla' + (anahtar ? '?anahtar=' + encodeURIComponent(anahtar) : '');
    if (navigator.sendBeacon) {
      navigator.sendBeacon(yol, new Blob([govde], { type: 'application/json' }));
    } else {
      fetch(yol, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: govde, keepalive: true }).catch(() => {});
    }
  } catch { /* sayaç hatası tıklamayı engellemez */ }
}, { capture: true });

/** Sunucu yanıtı JSON değilse (ör. HTML hata sayfası) anlaşılır hata fırlatır. */
async function guvenliJson(res) {
  try {
    return await res.json();
  } catch {
    throw new Error('Sunucu beklenmeyen bir yanıt döndürdü (HTTP ' + res.status + '). Lütfen tekrar deneyin.');
  }
}

function paraBicimle(n, paraBirimi = 'TRY', yerel = null) {
  if (typeof window !== 'undefined' && typeof window.BaskiPara?.formatPara === 'function') {
    return window.BaskiPara.formatPara(n, paraBirimi, yerel);
  }
  if (n == null || isNaN(n)) return '—';
  const kod = String(paraBirimi || 'TRY').toUpperCase();
  const varsayilanYerel = kod === 'USD' ? 'en-US' : (kod === 'EUR' ? 'fr-FR' : (kod === 'JPY' ? 'ja-JP' : 'tr-TR'));
  const ondalik = kod === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat(yerel || varsayilanYerel, {
    style: 'currency', currency: kod, minimumFractionDigits: ondalik, maximumFractionDigits: ondalik,
  }).format(Number(n)).replace(/[\u00a0\u202f]/g, ' ').replace(/\uFFE5/g, '¥');
}

function tl(n, paraBirimi = null) {
  const kod = paraBirimi || BASKI_ORTAM.currency || 'TRY';
  if (String(kod).toUpperCase() !== 'TRY') {
    return paraBicimle(n, kod);
  }
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function kac(n) {
  if (n == null) return '—';
  return n.toLocaleString('tr-TR');
}

/* ================= 🔍 Canlı öneriler (typeahead) — 2026-11-01 =================
 *
 * 150 ms debounce, en az 2 karakter. Klavye: ↑/↓ gez, Enter seç, Esc kapat.
 * Sunucudaki /api/search-suggestions yerel veriden beslenir (<15 ms hedef).
 */

const ONERI_LIST = [];
let oneriAktif = -1;
let oneriTimer = null;
let oneriSonSorgu = '';
let oneriIstegeSayaci = 0;

function oneriKutusu() { return $('#onerilerKutusu'); }

function onerileriKapat() {
  const kutu = oneriKutusu();
  if (!kutu) return;
  kutu.hidden = true;
  kutu.innerHTML = '';
  oneriAktif = -1;
  ONERI_LIST.length = 0;
  $('#urunUrl')?.setAttribute('aria-expanded', 'false');
  $('#urunUrl')?.removeAttribute('aria-activedescendant');
}

function oneriAktifSec(index) {
  const kutu = oneriKutusu();
  if (!kutu || !ONERI_LIST.length) return;
  const n = ONERI_LIST.length;
  oneriAktif = ((index % n) + n) % n;
  const ogeler = [...kutu.querySelectorAll('.oneri-oge')];
  ogeler.forEach((el, i) => {
    const secili = i === oneriAktif;
    el.classList.toggle('aktif', secili);
    el.setAttribute('aria-selected', secili ? 'true' : 'false');
  });
  const aktif = ogeler[oneriAktif];
  if (aktif) {
    $('#urunUrl')?.setAttribute('aria-activedescendant', aktif.id);
    aktif.scrollIntoView({ block: 'nearest' });
  }
}

function oneriIkonu(tur, ikon) {
  // Ürün kategorisi (🧵 filament / 🖨️ yazıcı) sunucudan gelirse o öncelikli;
  // yoksa kaynağa göre (geçmiş/takip/tarama/popüler) ikon gösterilir.
  if (ikon) return ikon;
  return tur === 'gecmis' ? '🕘' : (tur === 'takip' ? '🔔' : (tur === 'tarama' ? '📚' : '⭐'));
}

function onerileriCiz(liste, sorgu) {
  const kutu = oneriKutusu();
  const input = $('#urunUrl');
  if (!kutu || !input) return;
  ONERI_LIST.length = 0;
  ONERI_LIST.push(...liste);
  oneriAktif = -1;

  if (!ONERI_LIST.length) {
    onerileriKapat();
    return;
  }

  kutu.innerHTML = ONERI_LIST.map((o, i) => `
    <div class="oneri-oge" role="option" id="oneri-oge-${i}" aria-selected="false"
         data-index="${i}" data-deger="${esc(o.url || o.metin)}">
      <span class="oneri-ikon" aria-hidden="true">${oneriIkonu(o.tur, o.ikon)}</span>
      <span class="oneri-metin">${vurgula(o.metin, sorgu)}</span>
      <span class="oneri-etiket">${esc(o.etiket || '')}</span>
      <span class="oneri-ok" aria-hidden="true">↗</span>
    </div>`).join('');

  kutu.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

/** Eşleşen parçayı <mark> ile vurgular (XSS'e karşı önce esc). */
function vurgula(metin, sorgu) {
  const guvenli = esc(metin);
  const q = String(sorgu || '').trim();
  if (!q) return guvenli;
  try {
    const kacisli = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(' + kacisli + ')', 'i');
    return guvenli.replace(re, '<mark>$1</mark>');
  } catch {
    return guvenli;
  }
}

async function onerileriYukle(sorgu) {
  const q = String(sorgu || '').trim();
  if (q.length < 2) { onerileriKapat(); return; }
  const benim = ++oneriIstegeSayaci;
  try {
    const oneriUrl = '/api/search-suggestions?q=' + encodeURIComponent(q) + '&limit=8'
      + (BASKI_ORTAM.market && BASKI_ORTAM.market !== 'tr' ? '&market=' + encodeURIComponent(BASKI_ORTAM.market) : '');
    const res = await fetch(oneriUrl);
    if (!res.ok) throw new Error('öneri hatası');
    const veri = await res.json();
    if (benim !== oneriIstegeSayaci) return; // daha yeni sorgu var
    if (($('#urunUrl')?.value || '').trim() !== q) return;
    oneriSonSorgu = q;
    // Yeni sözleşme: onerilerDetay (zengin) varsa onu kullan; yoksa metin listesini sar.
    const detay = Array.isArray(veri.onerilerDetay)
      ? veri.onerilerDetay
      : (Array.isArray(veri.oneriler) ? veri.oneriler.map(m => ({ metin: m, tur: 'populer', etiket: '', url: null })) : []);
    onerileriCiz(detay, q);
  } catch {
    if (benim === oneriIstegeSayaci) onerileriKapat();
  }
}

/** Öneri seçildiğinde aramayı hemen başlatır. */
function oneriSec(index) {
  const secilen = ONERI_LIST[index];
  if (!secilen) return;
  const input = $('#urunUrl');
  if (!input) return;
  input.value = secilen.url || secilen.metin;
  onerileriKapat();
  // URL önerisi ise "linkte ara", metin ise doğal dil akışı devreye girer.
  if (secilen.url) modAyarla('link');
  else if (aramaModu === 'link') modAyarla('ad');
  const form = $('#karsilastirForm');
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

$('#urunUrl')?.addEventListener('input', () => {
  const metin = $('#urunUrl').value.trim();
  clearTimeout(oneriTimer);
  if (metin.length < 2) { onerileriKapat(); return; }
  oneriTimer = setTimeout(() => onerileriYukle(metin), 150);
});

$('#urunUrl')?.addEventListener('focus', () => {
  const metin = $('#urunUrl').value.trim();
  if (metin.length >= 2) onerileriYukle(metin);
});

$('#urunUrl')?.addEventListener('blur', () => {
  setTimeout(() => {
    if (!document.activeElement?.closest?.('.hibrit-sarmal')) onerileriKapat();
  }, 160);
});

$('#urunUrl')?.addEventListener('keydown', (e) => {
  const kutu = oneriKutusu();
  const acik = kutu && !kutu.hidden;
  if (e.key === 'ArrowDown') {
    if (!acik) { onerileriYukle($('#urunUrl').value); return; }
    e.preventDefault();
    oneriAktifSec(oneriAktif + 1);
  } else if (e.key === 'ArrowUp') {
    if (!acik) return;
    e.preventDefault();
    oneriAktifSec(oneriAktif - 1);
  } else if (e.key === 'Enter') {
    if (acik && oneriAktif >= 0) {
      e.preventDefault();
      oneriSec(oneriAktif);
    } else if (acik) {
      onerileriKapat(); // liste açık ama seçim yok → normal form gönderimi
    }
  } else if (e.key === 'Escape') {
    if (acik) { e.preventDefault(); onerileriKapat(); }
  }
});

document.addEventListener('click', (e) => {
  const oge = e.target.closest?.('.oneri-oge');
  if (oge) {
    oneriSec(Number(oge.dataset.index));
    return;
  }
  if (!e.target.closest?.('.hibrit-sarmal')) onerileriKapat();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) onerileriKapat();
});

// ---- Form ----

/** "↻ Sıfırdan Tara" bir kez tıklandığında sıradaki isteğe `taze:true` eklenir. */
let zorlaTaze = false;

/* ================= 🔗 Linkte Ara modu (2026-10-31) =================
 * Hibrit kutu üç modda çalışır:
 *   oto  → yapıştırılan metin link ise "linkte ara", değilse ürün adı araması
 *   link → yalnızca link kabul eder; mağaza + ürün adı önizlemesi gösterir
 *   ad   → her zaman doğal dil / ürün adı araması
 *
 * Sunucudaki /api/link-coz yalnızca URL analizi yapar (ağ taraması yok), bu yüzden
 * kullanıcı yazarken canlı önizleme için güvenle çağrılabilir.
 */
let aramaModu = 'oto';
let linkCozum = null;      // son /api/link-coz yanıtı
let linkCozTimer = null;
let linkCozSayaci = 0;     // yarışan istekleri elemek için

const DIL_KOPYA_YEREL = {
  tr: {
    placeholder: {
      oto: 'Ürün linki yapıştır ya da ürün adı yaz…  ör. "eSun PLA+", "iPhone 15"',
      link: 'Ürün linkini yapıştır…  ör. https://www.trendyol.com/urun-adi-p-123',
      ad: 'Ürün adı veya model yaz…  ör. "eSun PLA+", "iPhone 15", "Bambu Lab P1S"',
    },
    buton: { oto: 'Fiyatları Bul', link: 'Linkte Ara', ad: 'Fiyatları Bul' },
    araniyor: 'Aranıyor…',
    taramaSayac: (bitti, toplam, bulundu) => `${bitti}/${toplam} site tarandı · ${bulundu} sitede bulundu`,
    iptal: '✕ İptal',
    iptalEdiliyor: 'İptal ediliyor…',
    iptalNotu: 'Karşılaştırma iptal edildi — o ana kadar bulunan sonuçlar gösteriliyor.',
    modBasladi: '⚡ Ürün karşılaştırma başlatıldı',
    modDanisman: '🤖 YZ Danışmanı öneri arıyor',
    fazKatalog: '🗂️ Ürün yerel katalog indeksinden bulundu — mağaza fiyatları taranıyor…',
    fazAra: '🔎 Ürün mağazalarda aranıyor…',
    fazTara: '🛒 Mağazalar taranıyor…',
    renkEtiket: 'Renk',
    istekBirimi: 'istek',
    sorguBirimi: 'sorgu',
    dkOnce: 'dk önce',
    sepetOptimize: 'Sepeti optimize et',
    baskiBaslik: '🖨️ Parça Baskı Maliyeti Hesapla',
    baskiGramajLbl: 'Model gramajı',
    baskiAria: 'Dilimleyicide okunan model gramajı',
    baskiYok: 'Bu ürün için baskı maliyeti hesaplanamıyor (miktar okunamadı).',
    baskiOndalikVirgul: true,
    baskiSonuc: (h, bk, f) => `Bu makarayla parça başı maliyetiniz: <b>${esc(f(h.parca))}</b>`
      + ` · Bir makaradan <b>${h.adet ?? '—'} adet</b> basabilirsiniz.`
      + `<span class="baski-alt">Hammadde ${esc(f(h.hammadde))} + elektrik ~${esc(f(h.elektrik))}`
      + ` · ${esc(String(h.gramaj).replace('.', ','))} g · ${esc(String(bk.capMm ?? '1,75').replace('.', ','))} mm`
      + ` · ${esc(f(bk.metreMaliyeti))}/m</span>`,
    renkler: null,
  },
  en: {
    placeholder: BASKI_ORTAM.placeholders || {
      oto: 'Paste product URL or type a product name… e.g. "Creality K1C", "Polymaker PLA"',
      link: 'Paste product URL… e.g. https://store.creality.com/products/...',
      ad: 'Type product name or model… e.g. "Creality K1C", "Polymaker PLA", "PEI Plate"',
    },
    buton: { oto: 'Find Prices', link: 'Check Link', ad: 'Find Prices' },
    araniyor: 'Searching…',
    taramaSayac: (bitti, toplam, bulundu) => `${bitti}/${toplam} stores scanned · ${bulundu} found`,
    iptal: '✕ Cancel',
    iptalEdiliyor: 'Cancelling…',
    iptalNotu: 'Comparison cancelled — showing partial results found so far.',
    modBasladi: '⚡ Product comparison started',
    modDanisman: '🤖 AI Advisor searching',
    fazKatalog: '🗂️ Product matched in local index — scanning live store prices…',
    fazAra: '🔎 Searching stores for this product…',
    fazTara: '🛒 Scanning regional stores…',
    renkEtiket: 'Color',
    istekBirimi: 'req.',
    sorguBirimi: 'query',
    dkOnce: 'm ago',
    sepetOptimize: 'Optimize Basket',
    baskiBaslik: '🖨️ Part Print Cost Calculator',
    baskiGramajLbl: 'Model weight',
    baskiAria: 'Model weight read from slicer',
    baskiYok: 'Cannot calculate print cost for this item (spool weight not found).',
    baskiOndalikVirgul: false,
    baskiSonuc: (h, bk, f) => `Cost per part with this spool: <b>${esc(f(h.parca))}</b>`
      + ` · Prints up to <b>${h.adet ?? '—'} pcs</b> per spool.`
      + `<span class="baski-alt">Material ${esc(f(h.hammadde))} + electricity ~${esc(f(h.elektrik))}`
      + ` · ${esc(String(h.gramaj))} g · ${esc(String(bk.capMm ?? '1.75'))} mm`
      + ` · ${esc(f(bk.metreMaliyeti))}/m</span>`,
    renkler: { siyah: 'Black', beyaz: 'White', gri: 'Gray', kirmizi: 'Red', mavi: 'Blue', yesil: 'Green', sari: 'Yellow', turuncu: 'Orange', mor: 'Purple', pembe: 'Pink', kahverengi: 'Brown', altin: 'Gold', gumus: 'Silver', lacivert: 'Navy', seffaf: 'Clear', naturel: 'Natural', natural: 'Natural', bej: 'Beige' },
  },
  fr: {
    placeholder: BASKI_ORTAM.placeholders || {
      oto: 'Collez un lien ou tapez un produit… ex. "Creality K1C", "Polymaker PLA"',
      link: 'Collez le lien du produit… ex. https://store.creality.com/fr/...',
      ad: 'Tapez le modèle… ex. "Creality K1C", "Arianeplast PLA"',
    },
    buton: { oto: 'Trouver les prix', link: 'Analyser le lien', ad: 'Trouver les prix' },
    araniyor: 'Recherche…',
    taramaSayac: (bitti, toplam, bulundu) => `${bitti}/${toplam} boutiques analysées · ${bulundu} trouvée(s)`,
    iptal: '✕ Annuler',
    iptalEdiliyor: 'Annulation…',
    iptalNotu: 'Comparaison annulée — affichage des résultats déjà trouvés.',
    modBasladi: '⚡ Comparaison lancée',
    modDanisman: '🤖 Conseiller IA en recherche',
    fazKatalog: '🗂️ Produit trouvé dans l’index — analyse des boutiques en direct…',
    fazAra: '🔎 Recherche du produit en cours…',
    fazTara: '🛒 Analyse des boutiques en cours…',
    renkEtiket: 'Couleur',
    istekBirimi: 'req.',
    sorguBirimi: 'requête',
    dkOnce: 'min',
    sepetOptimize: 'Optimiser le panier',
    baskiBaslik: '🖨️ Coût d’impression par pièce',
    baskiGramajLbl: 'Poids modèle',
    baskiAria: 'Poids du modèle issu du slicer',
    baskiYok: 'Calcul du coût impossible (poids de bobine non indiqué).',
    baskiOndalikVirgul: true,
    baskiSonuc: (h, bk, f) => `Coût par pièce avec cette bobine : <b>${esc(f(h.parca))}</b>`
      + ` · Jusqu’à <b>${h.adet ?? '—'} pièces</b> par bobine.`
      + `<span class="baski-alt">Matière ${esc(f(h.hammadde))} + électricité ~${esc(f(h.elektrik))}`
      + ` · ${esc(String(h.gramaj).replace('.', ','))} g · ${esc(String(bk.capMm ?? '1,75').replace('.', ','))} mm`
      + ` · ${esc(f(bk.metreMaliyeti))}/m</span>`,
    renkler: { siyah: 'Noir', beyaz: 'Blanc', gri: 'Gris', kirmizi: 'Rouge', mavi: 'Bleu', yesil: 'Vert', sari: 'Jaune', turuncu: 'Orange', mor: 'Violet', pembe: 'Rose', kahverengi: 'Marron', altin: 'Or', gumus: 'Argent', lacivert: 'Bleu marine', seffaf: 'Transparent', naturel: 'Naturel', natural: 'Naturel', bej: 'Beige' },
  },
  ja: {
    placeholder: BASKI_ORTAM.placeholders || {
      oto: '商品URLを貼り付け、または商品名を入力… 例: "Creality K1C", "ELEGOO PETG"',
      link: '商品URLを貼り付け… 例: https://store.creality.com/jp/...',
      ad: '商品名・型番を入力… 例: "Creality K1C", "PLA フィラメント"',
    },
    buton: { oto: '最安値を検索', link: 'URLで検索', ad: '最安値を検索' },
    araniyor: '検索中…',
    taramaSayac: (bitti, toplam, bulundu) => `${bitti}/${toplam} ストア確認 · ${bulundu} 件見つかりました`,
    iptal: '✕ 中止',
    iptalEdiliyor: '中止中…',
    iptalNotu: '比較を中止しました — これまでに取得した結果を表示しています。',
    modBasladi: '⚡ 価格比較を開始しました',
    modDanisman: '🤖 AIアドバイザー検索中',
    fazKatalog: '🗂️ ローカル索引で一致 — ストア最新価格を確認中…',
    fazAra: '🔎 ストア内で商品を検索中…',
    fazTara: '🛒 ストアをスキャン中…',
    renkEtiket: 'カラー',
    istekBirimi: '件',
    sorguBirimi: '検索',
    dkOnce: '分前',
    sepetOptimize: 'カート最適化',
    baskiBaslik: '🖨️ パーツ別コスト計算',
    baskiGramajLbl: 'モデル重量',
    baskiAria: 'スライサーで取得したモデル重量',
    baskiYok: 'この商品の造形コストを算出できません（重量情報なし）。',
    baskiOndalikVirgul: false,
    baskiSonuc: (h, bk, f) => `1個あたりの造形コスト: <b>${esc(f(h.parca))}</b>`
      + ` · 1スプールで約 <b>${h.adet ?? '—'}個</b> 造形可能。`
      + `<span class="baski-alt">材料費 ${esc(f(h.hammadde))} + 電気代約 ${esc(f(h.elektrik))}`
      + ` · ${esc(String(h.gramaj))} g · ${esc(String(bk.capMm ?? '1.75'))} mm`
      + ` · ${esc(f(bk.metreMaliyeti))}/m</span>`,
    renkler: { siyah: 'ブラック', beyaz: 'ホワイト', gri: 'グレー', kirmizi: 'レッド', mavi: 'ブルー', yesil: 'グリーン', sari: 'イエロー', turuncu: 'オレンジ', mor: 'パープル', pembe: 'ピンク', kahverengi: 'ブラウン', altin: 'ゴールド', gumus: 'シルバー', lacivert: 'ネイビー', seffaf: 'クリア', naturel: 'ナチュラル', natural: 'ナチュラル', bej: 'ベージュ' },
  },
}[BASKI_ORTAM.dil] || {
  placeholder: {
    oto: 'Ürün linki yapıştır ya da ürün adı yaz…  ör. "eSun PLA+", "iPhone 15"',
    link: 'Ürün linkini yapıştır…  ör. https://www.trendyol.com/urun-adi-p-123',
    ad: 'Ürün adı veya model yaz…  ör. "eSun PLA+", "iPhone 15", "Bambu Lab P1S"',
  },
  buton: { oto: 'Fiyatları Bul', link: 'Linkte Ara', ad: 'Fiyatları Bul' },
  araniyor: 'Aranıyor…',
  taramaSayac: (bitti, toplam, bulundu) => `${bitti}/${toplam} site tarandı · ${bulundu} sitede bulundu`,
  iptal: '✕ İptal',
  iptalEdiliyor: 'İptal ediliyor…',
  iptalNotu: 'Karşılaştırma iptal edildi — o ana kadar bulunan sonuçlar gösteriliyor.',
  modBasladi: '⚡ Ürün karşılaştırma başlatıldı',
  modDanisman: '🤖 YZ Danışmanı öneri arıyor',
  fazKatalog: '🗂️ Ürün yerel katalog indeksinden bulundu — mağaza fiyatları taranıyor…',
  fazAra: '🔎 Ürün mağazalarda aranıyor…',
  fazTara: '🛒 Mağazalar taranıyor…',
  renkEtiket: 'Renk',
  istekBirimi: 'istek',
  sorguBirimi: 'sorgu',
  dkOnce: 'dk önce',
  sepetOptimize: 'Sepeti optimize et',
  baskiBaslik: '🖨️ Parça Baskı Maliyeti Hesapla',
  baskiGramajLbl: 'Model gramajı',
  baskiAria: 'Dilimleyicide okunan model gramajı',
  baskiYok: 'Bu ürün için baskı maliyeti hesaplanamıyor (miktar okunamadı).',
  baskiOndalikVirgul: true,
  baskiSonuc: (h, bk, f) => `Bu makarayla parça başı maliyetiniz: <b>${esc(f(h.parca))}</b>`
    + ` · Bir makaradan <b>${h.adet ?? '—'} adet</b> basabilirsiniz.`
    + `<span class="baski-alt">Hammadde ${esc(f(h.hammadde))} + elektrik ~${esc(f(h.elektrik))}`
    + ` · ${esc(String(h.gramaj).replace('.', ','))} g · ${esc(String(bk.capMm ?? '1,75').replace('.', ','))} mm`
    + ` · ${esc(f(bk.metreMaliyeti))}/m</span>`,
  renkler: null,
};

function renkYerellestir(ham) {
  const s = String(ham || '').trim();
  if (!s || !DIL_KOPYA_YEREL.renkler) return s;
  const k = s.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
  return DIL_KOPYA_YEREL.renkler[k] || s;
}

/* ---------------- Çok Dilli Canlı Sonuç & Analiz Sözlüğü ---------------- */
const CANLI_SOZLUK = {
  tr: {
    erkenSonucBtn: (n) => `⚡ Kalanı beklemeden bulunan sonuçları göster (${n} Mağaza Hazır)`,
    erkenSonucHazirlaniyor: '⏳ Sonuçlar hazırlanıyor…',
    cipAraniyor: 'Aranıyor',
    cipHata: 'Hata',
    cipIptal: 'İptal edildi',
    cipYok: 'Bulunamadı',
    iptalKalan: (k) => 'Karşılaştırma iptal edildi' + (k > 0 ? ` — ${k} site taranmadı.` : '.') + ' Aşağıda o ana kadar bulunan sonuçlar var.',
    tazeSrw: (yas, sayac) => `⚡ Bu ürün ${yas || 'daha önce'} tarandı (Hafızadan gösteriliyor) · Mağazalar canlı kontrol ediliyor${sayac}...`,
    tazeHata: (m) => `⚠️ Fiyatlar güncellenemedi (${m}) — aşağıdaki sonuç son taramaya ait.`,
    tazeGuncellendi: (n, ornek, yeni, kayb) => `✅ ${n} mağazada fiyat güncellendi ✓${ornek ? ` (${ornek})` : ''}${yeni ? ` · ${yeni} yeni mağaza` : ''}${kayb ? ` · ${kayb} mağaza sonuçtan çıktı` : ''}.`,
    tazeKaybolan: (k) => `⚠️ ${k} mağaza artık sonuç vermiyor; diğer fiyatlar doğrulandı.`,
    tazeDogrulandi: '✅ Tüm fiyatlar güncel ve doğrulandı ✓',
    tazeAnlik: (yas) => `⚡ Bu ürün ${yas || 'daha önce'} tarandı (Hafızadan gösteriliyor).`,
    kaynakEtiketi: 'Kaynak',
    belirtilmedi: 'Belirtilmedi',
    markaEtiketi: 'Marka',
    modelKoduEtiketi: 'Model kodu',
    barkodEtiketi: 'Barkod',
    tumundeTukendi: '⚠️ Tüm Mağazalarda Tükendi',
    stokYokKisa: 'Stok Yok',
    hepsiTukenmis: (n) => `${n} mağazanın tamamında stok tükenmiş`,
    ozetEnUcuzDahil: '🏷️ En ucuz (kargo dahil)',
    ozetEnUcuzKargo: '🏷️ En ucuz (+kargo sepette)',
    kargoDahilUcret: (u) => `📦 ${u} kargo dahil`,
    kargoDahilBedava: '📦 Kargo dahil (ücretsiz)',
    kargoSepetteEklenir: '⚠️ +Kargo sepette eklenir',
    stoktaMagazaSayi: (n) => ` · ${n} mağazada stokta`,
    sonucEtiketi: 'Sonuç',
    stoktaUrunYok: 'Stokta ürün bulunamadı',
    tasarrufTutar: (u) => `Bu alışverişte <b>${u} net tasarruf</b> ediyorsunuz!`,
    tasarrufDetay: (u, us, p, y) => `En ucuz: ${u} (${us}) · En pahalı mağaza (${p}) yerine ${y} daha karlı.`,
    ayniDipFiyat: (u) => `Tüm mağazalarda en dip fiyat: ${u}`,
    ayniDipDetay: (n) => `${n} mağaza arasında fiyat farkı bulunmuyor, en ucuz seviyedesiniz.`,
    kismiTarama: (yas, t, top) => `⚠️ ${yas ? yas + ' ' : ''}Kısmi tarama (${t}/${top} mağaza)`,
    dogrulandiSaat: (yas, top) => yas ? `🕒 ${yas} ${top} mağazadan doğrulandı` : `🕒 Az önce ${top} mağazadan canlı doğrulandı`,
    tukendiAltBaslik: '⚠️ Bu ürün şu anda tüm mağazalarda tükenmiş görünüyor.',
    bulunamadiAltBaslik: '🔍 Bu ürün için mağazalarda eşleşen fiyat bulunamadı.',
    benzerAlternatifler: (baslik) => `${baslik} Benzer popüler alternatifler stokta:`,
    muadilAra: 'Muadili ara',
    muadilAraniyor: 'Aranıyor…',
    muadilStokYokBaslik: 'Bu ürün stokta yok',
    muadilHicYokBaslik: 'Bu ürün hiçbir sitede bulunamadı',
    muadilStokYokAciklama: (n) => `${n} mağazanın tamamı stokta yok görünüyor. Aynı ihtiyacı karşılayan muadillere bakalım.`,
    muadilHicYokAciklama: 'Aynı ihtiyacı karşılayabilecek muadil ürünlere bakabilirsin.',
    muadilVarMi: 'Muadil ürün var mı?',
    muadilKesifAciklama: 'Aynı ihtiyacı karşılayan daha uygun fiyatlı modelleri arayabilirsin.',
    muadilYukleniyor: 'Muadil ürünler aranıyor… (bu birkaç saniye sürebilir)',
    muadilHataBaslatilamadi: 'Muadil araması başlatılamadı',
    bentoEnUcuzUst: '🏷️ EN UCUZ',
    bentoMagazayaGit: 'Mağazaya Git',
    bentoFiyatTrendi: '📈 Fiyat trendi',
    bentoFiyatDagilimi: '📊 Fiyat dağılımı',
    bentoDip: 'Dip',
    bentoOrt: 'Ort.',
    bentoTepe: 'Tepe',
    bentoTrendAria: (g) => `Son ${g} gün fiyat trendi`,
    bentoSonGunGecmis: (g) => `Son ${g} gün · fiyat geçmişi`,
    bentoYetersizTrend: '📈 Henüz yeterli fiyat geçmişi yok.',
    bentoYetersizTrendAlt: 'Her karşılaştırma bir kayıt ekler; trend birkaç günde oluşur.',
    bentoEnUcuz: 'En ucuz',
    bentoEnPahali: 'En pahalı',
    bentoFarkMetni: (f) => `${f} fark`,
    bentoTumAyniFiyat: 'Tüm mağazalarda aynı fiyat',
    bentoDahaAzOde: (y) => `${y} daha az öde`,
    bentoFarkYok: 'Fark yok',
    bentoMagazaStok: (m, s) => `${m} mağaza · ${s} stokta`,
    bentoKargoUcretsiz: '<span class="bento-rozet yesil">📦 Kargo dahil (ücretsiz)</span>',
    bentoKargoUcretli: (u) => `<span class="bento-rozet yesil">📦 Kargo dahil (${u} kargo toplama eklendi)</span>`,
    bentoKargoEsikli: (t, esik) => `<span class="bento-rozet uyari" title="${t}">⚠️ +Kargo sepette eklenir (${esik} üzeri ücretsiz)</span>`,
    bentoKargoEsikliVarsayilanAciklama: 'Kargo ücreti sepette netleşir',
    bentoKargoBilinmiyorTitle: 'Mağaza kargo ücretini ürün sayfasında belirtmiyor; gerçek toplam sepette artabilir.',
    bentoKargoBilinmiyor: '⚠️ +Kargo sepette eklenir',
    bentoStokTukendi: '<span class="bento-rozet kirmizi">🔴 Tükendi</span>',
    bentoStokta: '<span class="bento-rozet yesil">🟢 Stokta</span>',
    zekaSimdiAl: 'Şimdi Al',
    zekaBekle: 'Bekle / Pahalı',
    zekaFiyatNormal: 'Fiyat Normal',
    zekaVeriAz: 'Veri Az',
    zekaGecmisAlt: (g, n) => `${g} günlük geçmiş · ${n} fiyat gözlemi`,
    zekaFarkUcuz: (y) => `30G ortalamadan ${y} daha ucuz`,
    zekaFarkPahali: (y) => `30G ortalamadan ${y} daha pahalı`,
    zekaEnDusuk: (v) => `En düşük: <b>${v}</b>`,
    zekaOrt30: (v) => `30G ort.: <b>${v}</b>`,
    zekaEnYuksek: (v) => `En yüksek: <b>${v}</b>`,
    birimSahteBaslik: '⚠️ Sahte ucuz uyarısı',
    birimSahteAciklama: 'Başlık fiyatı düşük görünen ürün, kilogram başına daha pahalı.',
    birimNormalBaslik: '⚖️ Kilogram başına fiyat',
    birimNormalAciklama: 'Farklı gramajlar aynı birime çevrildi.',
    birimSupheliTitle: 'Fiyat doğrulanmalı',
    birimSupheli: 'şüpheli',
    birimTahminTitle: 'Nominal yoğunlukla tahmin',
    birimDogrulanmali: (n, nedeni) => `<b>⚠️ ${n} fiyat doğrulanmalı.</b> ${nedeni} Bu yüzden "en iyi birim fiyat" seçimine dahil edilmedi.`,
    birimSupheliVarsayilan: 'Birim fiyat diğerlerinin çok altında.',
    birimAltReferans: (g) => `Karşılaştırma ${g} üzerinden yapıldı. Birim/kg = gerçekte ödenecek tutar ÷ net miktar.`,
    birimAltDuz: 'Birim/kg = gerçekte ödenecek tutar ÷ net miktar.',
    birimThMagaza: 'Mağaza',
    birimThMiktar: 'Miktar',
    birimThFiyat: 'Fiyat',
    birimThBirim: 'Birim fiyat',
    filtreStoktaVar: (n) => `🟢 Stokta Var (${n})`,
    filtreStoktaYok: (n) => `🔴 Stokta Yok (${n})`,
    filtreCapEtiket: 'Çap:',
    filtreCap175: (n) => `Çap: 1.75mm (${n})`,
    filtreCap285: (n) => `⚠️ Çap: 2.85mm (${n})`,
    filtreHammaddeEtiket: 'Hammadde:',
    filtreYuksekBirim: (n) => `⚠️ Yüksek Birim Maliyet (${n})`,
    okunamadiOnEk: '⚠️ Okunamadı: ',
    bulunamadiVarsayilan: 'Ürün bulunamadı',
    eslesme: { model_kodu: 'model kodu eşleşmesi', barkod: 'barkod eşleşmesi', benzerlik: 'başlık benzerliği', kaynak: 'kaynak ürün' },
    rozetUcretsizKargo: '📦 Ücretsiz Kargo',
    rozetUcretliKargo: (u) => `🚚 +${u} Kargo`,
    rozetResmiSatici: '🏢 Resmi Satıcı',
    rozetVadeFarksiz: '💳 Vade Farksız Taksit',
    capOkTitle: 'Standart FDM yazıcılarla uyumlu',
    birimTahminiEk: (u) => `≈ ${u}/kg (tahmini)`,
    birimIpucuHacim: 'Hacimden hesaplandı (nominal yoğunluk)',
    birimIpucuTahmini: 'Hacimden nominal yoğunlukla hesaplandı (tahmini)',
    birimIpucuNet: 'Net miktara göre hesaplandı',
    kdvTitle: 'Mağaza bu ürünü KDV hariç yayımlıyor. Karşılaştırmada KDV dahil tutar kullanılır.',
    kdvDahil: (oran, haric) => `🧾 KDV Dahil${oran ? ` (${oran})` : ''} — KDV hariç ${haric}`,
    taksitBaslik: 'Taksit',
    fiyataDahilBaslik: 'Fiyata dahil',
    hesapEtiketi: 'Hesap:',
    cashbackSatir: (p, e) => `🪙 ${p} değerinde puan/cashback — etkin maliyet <b>${e}</b>`,
    kuponSatir: (f, i, kod, kosul) => `🎟️ Kuponla <b>${f}</b> (−${i})${kod ? ` — kod: <b>${kod}</b>` : ''}${kosul ? `<span class="kupon-kosul"> · ${kosul}</span>` : ''}`,
    kampanyaOnizlemeSatir: (f, kosul) => `🏷️ Kampanyayla <b>~${f}</b>${kosul ? `<span class="kampanya-kosul"> · ${kosul}</span>` : ''}`,
    kargoEsikTitle: 'Sepetinizi tamamlayarak kargo ücretinden kurtulabilirsiniz.',
    kargoEsikMetin: (e, u) => `💡 Sepete <b>${e}</b> değerinde ürün eklerseniz <b>${u}</b> kargo BEDAVA olur!`,
    seritEnUcuz: '🏷️ EN UCUZ',
    seritTukendi: '🔴 TÜKENDİ',
    seritFarkliRenk: (c) => `FARKLI RENK: ${c}`,
    kartStokYok: '🔴 Stokta Yok',
    kartStokVar: '🟢 Stokta Var',
    kartSonStokTitle: 'Mağaza sayfasındaki kalan stok uyarısı',
    kartSonStok: (n) => `⏳ Son ${n} Ürün`,
    dipRozetTitle: (s) => `${s} ürün sayfasında belirtilen dip fiyat rozeti`,
    tukendiRozetTitle: 'Ürün şu anda tükendi; gösterilen fiyat son bilinen fiyattır.',
    tukendiRozet: 'Tükendi',
    sahteIndirimRozet: (id, g) => `⚠️ Şişirilmiş Liste Fiyatı<small>iddia ${id} · gerçek ${g}</small>`,
    gercekFirsatTitle: 'Son 90 günün en düşük fiyatı',
    gercekFirsatHtml: '🔥 GERÇEK FIRSAT<small>Son 90 günün dip fiyatı</small>',
    ozelIndirimDusuldu: (u) => `Ürüne özel indirim düşüldü: −${u} · `,
    sonBilinenFiyat: '⚠️ son bilinen fiyat — ürün şu anda tükendi',
    kargoDahilToplamDetay: (ara, kar) => `<b>Kargo dahil toplam</b> (ürün ${ara} + kargo ${kar})`,
    kargoDahilToplamBedava: '<b>Kargo dahil toplam</b> (ücretsiz kargo)',
    gercekOdenecek: 'gerçekte ödenecek tutar (kargo sepette belli)',
    fiyatHesaplanamadi: 'fiyat hesaplanamadı',
    kargoSatirEtiket: '🚚 Kargo',
    kargoBedava: 'Bedava',
    kargoEsikSepette: (u) => `Sepette eklenir (${u} üzeri bedava)`,
    kargoSepetteBelli: 'Sepette belli',
    kargoBilinmiyor: 'Bilinmiyor',
    kosulluBaslik: 'Koşullu kampanyalar (fiyata dahil değil)',
    alarmBtnTitle: 'Hedef fiyatın altına düşünce bu cihaza bildirim al — e-posta/şifre gerekmez',
    alarmBtn: '🔔 Fiyat Alarmı',
    sepetBtnTitle: 'Akıllı Sepete ekle — kargo ve kupon dahil en ucuz kombinasyonu bul',
    sepetBtn: '🧺 Sepete Ekle',
    embedBtnTitle: 'Bu ürünün canlı fiyatını kendi sitene ekle',
    embedBtn: '🔌 Sitene Ekle',
    magazadaGorTukendi: 'Mağazada Gör (Tükendi)',
    magazadaGor: 'Mağazada Gör',
    tabloStokYok: '<span class="stok-hucre-yok">🔴 Yok</span>',
    tabloStokVar: '<span class="stok-hucre-var">🟢 Var</span>',
    tabloRenkFarkli: ' (farklı)',
    trendVeriBirikiyor: '📉 Veri birikiyor',
    trendHenuzYetersiz: 'Henüz yeterli fiyat geçmişi yok',
    trendHicYokMesaj: 'Bu ürün için henüz fiyat geçmişi yok. Her karşılaştırma ve takip kontrolü bir kayıt ekler.',
    trendAzGunMesaj: (g) => `Yalnızca ${g} günlük veri var; trend çizgisi için en az 2 gün gerekiyor.`,
    trendDusukEtiket: (g) => `🟢 Son ${g} Günün En Düşüğü`,
    trendOrtEtiket: (g) => `📊 Son ${g} Günün Ortalaması`,
    trendYuksekEtiket: (g) => `🔴 Son ${g} Günün En Yükseği`,
    trendAvantajli: (y) => `${y} daha avantajlı`,
    trendPahali: (y) => `${y} daha pahalı`,
    trendOrtalamada: 'Ortalamada',
    trendOzetAlt: (g, k, m) => `Son ${g} gün · ${k} fiyat gözlemi${m ? ` · ${m} mağaza` : ''}`,
    grafikEnDusuk: 'En Düşük Fiyat',
    grafikOrt30: '30 Günlük Ortalama',
  },
  en: {
    erkenSonucBtn: (n) => `⚡ Show found results now (${n} Store${n === 1 ? '' : 's'} Ready)`,
    erkenSonucHazirlaniyor: '⏳ Preparing results…',
    cipAraniyor: 'Searching',
    cipHata: 'Error',
    cipIptal: 'Cancelled',
    cipYok: 'Not found',
    iptalKalan: (k) => 'Comparison cancelled' + (k > 0 ? ` — ${k} stores skipped.` : '.') + ' Showing results found so far below.',
    tazeSrw: (yas, sayac) => `⚡ Cached ${yas || 'earlier'} (showing snapshot) · Refreshing live store prices${sayac}...`,
    tazeHata: (m) => `⚠️ Could not refresh prices (${m}) — showing last recorded results.`,
    tazeGuncellendi: (n, ornek, yeni, kayb) => `✅ Updated prices across ${n} store(s) ✓${ornek ? ` (${ornek})` : ''}${yeni ? ` · ${yeni} new store(s)` : ''}${kayb ? ` · ${kayb} removed` : ''}.`,
    tazeKaybolan: (k) => `⚠️ ${k} store(s) no longer returned a match; remaining prices verified.`,
    tazeDogrulandi: '✅ All prices verified and up to date ✓',
    tazeAnlik: (yas) => `⚡ Scanned ${yas || 'earlier'} (showing cached snapshot).`,
    kaynakEtiketi: 'Source',
    belirtilmedi: 'Not specified',
    markaEtiketi: 'Brand',
    modelKoduEtiketi: 'Model code',
    barkodEtiketi: 'Barcode',
    tumundeTukendi: '⚠️ Sold Out Everywhere',
    stokYokKisa: 'Out of Stock',
    hepsiTukenmis: (n) => `Out of stock across all ${n} store${n === 1 ? '' : 's'}`,
    ozetEnUcuzDahil: '🏷️ Lowest total (shipping incl.)',
    ozetEnUcuzKargo: '🏷️ Lowest price (+shipping at checkout)',
    kargoDahilUcret: (u) => `📦 ${u} shipping included`,
    kargoDahilBedava: '📦 Free shipping included',
    kargoSepetteEklenir: '⚠️ +Shipping added at checkout',
    stoktaMagazaSayi: (n) => ` · in stock at ${n} store${n === 1 ? '' : 's'}`,
    sonucEtiketi: 'Result',
    stoktaUrunYok: 'No in-stock offers found',
    tasarrufTutar: (u) => `You save <b>${u} net</b> on this order!`,
    tasarrufDetay: (u, us, p, y) => `Cheapest: ${u} (${us}) · ${y} better than the highest offer (${p}).`,
    ayniDipFiyat: (u) => `Same lowest price everywhere: ${u}`,
    ayniDipDetay: (n) => `No price spread across ${n} stores — you are already at the floor price.`,
    kismiTarama: (yas, t, top) => `⚠️ ${yas ? yas + ' · ' : ''}Partial scan (${t}/${top} stores)`,
    dogrulandiSaat: (yas, top) => yas ? `🕒 Verified ${yas} across ${top} stores` : `🕒 Just verified live across ${top} stores`,
    tukendiAltBaslik: '⚠️ This item appears sold out at every scanned store.',
    bulunamadiAltBaslik: '🔍 No matching store prices were found for this item.',
    benzerAlternatifler: (baslik) => `${baslik} Similar popular alternatives in stock:`,
    muadilAra: 'Search alternatives',
    muadilAraniyor: 'Searching…',
    muadilStokYokBaslik: 'This product is out of stock',
    muadilHicYokBaslik: 'Not found at any scanned store',
    muadilStokYokAciklama: (n) => `All ${n} store${n === 1 ? '' : 's'} appear out of stock. Let’s check comparable alternatives.`,
    muadilHicYokAciklama: 'Look at comparable products that fit the same need.',
    muadilVarMi: 'Looking for alternatives?',
    muadilKesifAciklama: 'Search comparable models at a lower total cost.',
    muadilYukleniyor: 'Searching alternative products… (this may take a few seconds)',
    muadilHataBaslatilamadi: 'Could not start alternative search',
    bentoEnUcuzUst: '🏷️ LOWEST PRICE',
    bentoMagazayaGit: 'Go to Store',
    bentoFiyatTrendi: '📈 Price trend',
    bentoFiyatDagilimi: '📊 Price spread',
    bentoDip: 'Low',
    bentoOrt: 'Avg.',
    bentoTepe: 'High',
    bentoTrendAria: (g) => `Last ${g}-day price trend`,
    bentoSonGunGecmis: (g) => `Last ${g} days · price history`,
    bentoYetersizTrend: '📈 Not enough price history yet.',
    bentoYetersizTrendAlt: 'Each comparison adds an observation; a trend forms in a few days.',
    bentoEnUcuz: 'Lowest',
    bentoEnPahali: 'Highest',
    bentoFarkMetni: (f) => `${f} spread`,
    bentoTumAyniFiyat: 'Same price across all stores',
    bentoDahaAzOde: (y) => `Save ${y}`,
    bentoFarkYok: 'No spread',
    bentoMagazaStok: (m, s) => `${m} store${m === 1 ? '' : 's'} · ${s} in stock`,
    bentoKargoUcretsiz: '<span class="bento-rozet yesil">📦 Free shipping included</span>',
    bentoKargoUcretli: (u) => `<span class="bento-rozet yesil">📦 Shipping incl. (${u} added to total)</span>`,
    bentoKargoEsikli: (t, esik) => `<span class="bento-rozet uyari" title="${t}">⚠️ +Shipping at checkout (free over ${esik})</span>`,
    bentoKargoEsikliVarsayilanAciklama: 'Shipping calculated at checkout',
    bentoKargoBilinmiyorTitle: 'Shipping rate is not shown on the product page; checkout total may be higher.',
    bentoKargoBilinmiyor: '⚠️ +Shipping at checkout',
    bentoStokTukendi: '<span class="bento-rozet kirmizi">🔴 Sold Out</span>',
    bentoStokta: '<span class="bento-rozet yesil">🟢 In Stock</span>',
    zekaSimdiAl: 'Buy Now',
    zekaBekle: 'Wait / High',
    zekaFiyatNormal: 'Fair Price',
    zekaVeriAz: 'Low Data',
    zekaGecmisAlt: (g, n) => `${g}-day history · ${n} price observation${n === 1 ? '' : 's'}`,
    zekaFarkUcuz: (y) => `${y} below 30D average`,
    zekaFarkPahali: (y) => `${y} above 30D average`,
    zekaEnDusuk: (v) => `Lowest: <b>${v}</b>`,
    zekaOrt30: (v) => `30D avg.: <b>${v}</b>`,
    zekaEnYuksek: (v) => `Highest: <b>${v}</b>`,
    birimSahteBaslik: '⚠️ Misleading headline price',
    birimSahteAciklama: 'Cheaper-looking listings cost more per kilogram once spool weight is factored in.',
    birimNormalBaslik: '⚖️ Price per kilogram',
    birimNormalAciklama: 'Different weights converted to the same unit.',
    birimSupheliTitle: 'Price requires verification',
    birimSupheli: 'unverified',
    birimTahminTitle: 'Estimated from nominal density',
    birimDogrulanmali: (n, nedeni) => `<b>⚠️ ${n} price(s) need verification.</b> ${nedeni} Excluded from lowest unit-price ranking.`,
    birimSupheliVarsayilan: 'Unit price is suspiciously below peers.',
    birimAltReferans: (g) => `Compared on ${g} basis. Unit/kg = real total ÷ net weight.`,
    birimAltDuz: 'Unit/kg = real total ÷ net weight.',
    birimThMagaza: 'Store',
    birimThMiktar: 'Weight',
    birimThFiyat: 'Price',
    birimThBirim: 'Unit price',
    filtreStoktaVar: (n) => `🟢 In Stock (${n})`,
    filtreStoktaYok: (n) => `🔴 Out of Stock (${n})`,
    filtreCapEtiket: 'Diameter:',
    filtreCap175: (n) => `Diameter: 1.75mm (${n})`,
    filtreCap285: (n) => `⚠️ Diameter: 2.85mm (${n})`,
    filtreHammaddeEtiket: 'Material:',
    filtreYuksekBirim: (n) => `⚠️ High Unit Cost (${n})`,
    okunamadiOnEk: '⚠️ Unreadable: ',
    bulunamadiVarsayilan: 'Product not found',
    eslesme: { model_kodu: 'model code match', barkod: 'barcode match', benzerlik: 'title similarity', kaynak: 'source product' },
    rozetUcretsizKargo: '📦 Free Shipping',
    rozetUcretliKargo: (u) => `🚚 +${u} Shipping`,
    rozetResmiSatici: '🏢 Official Store',
    rozetVadeFarksiz: '💳 0% APR Installments',
    capOkTitle: 'Compatible with standard 1.75 mm FDM printers',
    birimTahminiEk: (u) => `≈ ${u}/kg (est.)`,
    birimIpucuHacim: 'Calculated from volume (nominal density)',
    birimIpucuTahmini: 'Estimated from volume & nominal density',
    birimIpucuNet: 'Calculated from net weight',
    kdvTitle: 'Store displays pre-tax/VAT prices; total includes applicable tax.',
    kdvDahil: (oran, haric) => `🧾 Tax Incl.${oran ? ` (${oran})` : ''} — Excl. tax ${haric}`,
    taksitBaslik: 'Installments',
    fiyataDahilBaslik: 'Included in price',
    hesapEtiketi: 'Breakdown:',
    cashbackSatir: (p, e) => `🪙 ${p} rewards/cashback — effective cost <b>${e}</b>`,
    kuponSatir: (f, i, kod, kosul) => `🎟️ With coupon <b>${f}</b> (−${i})${kod ? ` — code: <b>${kod}</b>` : ''}${kosul ? `<span class="kupon-kosul"> · ${kosul}</span>` : ''}`,
    kampanyaOnizlemeSatir: (f, kosul) => `🏷️ With promo <b>~${f}</b>${kosul ? `<span class="kampanya-kosul"> · ${kosul}</span>` : ''}`,
    kargoEsikTitle: 'Top up your basket to waive shipping fees.',
    kargoEsikMetin: (e, u) => `💡 Add <b>${e}</b> more to unlock <b>${u}</b> FREE shipping!`,
    seritEnUcuz: '🏷️ LOWEST',
    seritTukendi: '🔴 SOLD OUT',
    seritFarkliRenk: (c) => `OTHER COLOR: ${c}`,
    kartStokYok: '🔴 Out of Stock',
    kartStokVar: '🟢 In Stock',
    kartSonStokTitle: 'Low stock warning reported on store page',
    kartSonStok: (n) => `⏳ Only ${n} left`,
    dipRozetTitle: (s) => `Lowest price badge shown on ${s} listing`,
    tukendiRozetTitle: 'Currently sold out; price shown is the last recorded price.',
    tukendiRozet: 'Sold Out',
    sahteIndirimRozet: (id, g) => `⚠️ Inflated List Price<small>claimed ${id} · real ${g}</small>`,
    gercekFirsatTitle: 'Lowest price in the last 90 days',
    gercekFirsatHtml: '🔥 REAL DEAL<small>90-day floor price</small>',
    ozelIndirimDusuldu: (u) => `Instant discount applied: −${u} · `,
    sonBilinenFiyat: '⚠️ last known price — currently sold out',
    kargoDahilToplamDetay: (ara, kar) => `<b>Total incl. shipping</b> (item ${ara} + shipping ${kar})`,
    kargoDahilToplamBedava: '<b>Total incl. shipping</b> (free shipping)',
    gercekOdenecek: 'estimated checkout total (shipping calculated at checkout)',
    fiyatHesaplanamadi: 'price unavailable',
    kargoSatirEtiket: '🚚 Shipping',
    kargoBedava: 'Free',
    kargoEsikSepette: (u) => `Added at checkout (free over ${u})`,
    kargoSepetteBelli: 'At checkout',
    kargoBilinmiyor: 'Unknown',
    kosulluBaslik: 'Conditional promos (excluded from price)',
    alarmBtnTitle: 'Get an alert on this device when price drops — no email or password needed',
    alarmBtn: '🔔 Price Alert',
    sepetBtnTitle: 'Add to Smart Basket to minimize total across shipping and coupons',
    sepetBtn: '🧺 Add to Basket',
    embedBtnTitle: 'Embed this product’s live price badge on your website',
    embedBtn: '🔌 Embed Widget',
    magazadaGorTukendi: 'View at Store (Sold Out)',
    magazadaGor: 'View at Store',
    tabloStokYok: '<span class="stok-hucre-yok">🔴 Out</span>',
    tabloStokVar: '<span class="stok-hucre-var">🟢 In</span>',
    tabloRenkFarkli: ' (other)',
    trendVeriBirikiyor: '📉 Collecting data',
    trendHenuzYetersiz: 'Not enough price history yet',
    trendHicYokMesaj: 'No price history recorded for this product yet. Each scan and alert check adds an observation.',
    trendAzGunMesaj: (g) => `Only ${g} day(s) of data recorded; at least 2 days are needed for a trend chart.`,
    trendDusukEtiket: (g) => `🟢 ${g}-Day Low`,
    trendOrtEtiket: (g) => `📊 ${g}-Day Average`,
    trendYuksekEtiket: (g) => `🔴 ${g}-Day High`,
    trendAvantajli: (y) => `${y} cheaper`,
    trendPahali: (y) => `${y} higher`,
    trendOrtalamada: 'At average',
    trendOzetAlt: (g, k, m) => `Last ${g} day${g === 1 ? '' : 's'} · ${k} price observation${k === 1 ? '' : 's'}${m ? ` · ${m} store${m === 1 ? '' : 's'}` : ''}`,
    grafikEnDusuk: 'Lowest Price',
    grafikOrt30: '30-Day Average',
  },
  fr: {
    erkenSonucBtn: (n) => `⚡ Afficher les résultats déjà trouvés (${n} boutique${n === 1 ? '' : 's'} prête${n === 1 ? '' : 's'})`,
    erkenSonucHazirlaniyor: '⏳ Préparation des résultats…',
    cipAraniyor: 'Recherche',
    cipHata: 'Erreur',
    cipIptal: 'Annulé',
    cipYok: 'Introuvable',
    iptalKalan: (k) => 'Comparaison annulée' + (k > 0 ? ` — ${k} boutique(s) ignorée(s).` : '.') + ' Résultats trouvés jusque-là ci-dessous.',
    tazeSrw: (yas, sayac) => `⚡ En cache ${yas || 'précédemment'} (aperçu) · Actualisation en direct${sayac}...`,
    tazeHata: (m) => `⚠️ Actualisation impossible (${m}) — affichage du dernier relevé.`,
    tazeGuncellendi: (n, ornek, yeni, kayb) => `✅ Prix mis à jour sur ${n} boutique(s) ✓${ornek ? ` (${ornek})` : ''}${yeni ? ` · ${yeni} nouvelle(s)` : ''}${kayb ? ` · ${kayb} retirée(s)` : ''}.`,
    tazeKaybolan: (k) => `⚠️ ${k} boutique(s) ne répond(ent) plus ; les autres prix sont vérifiés.`,
    tazeDogrulandi: '✅ Tous les prix sont à jour et vérifiés ✓',
    tazeAnlik: (yas) => `⚡ Relevé ${yas || 'précédemment'} (aperçu en cache).`,
    kaynakEtiketi: 'Source',
    belirtilmedi: 'Non précisé',
    markaEtiketi: 'Marque',
    modelKoduEtiketi: 'Référence',
    barkodEtiketi: 'Code-barres',
    tumundeTukendi: '⚠️ Rupture partout',
    stokYokKisa: 'Rupture',
    hepsiTukenmis: (n) => `En rupture sur l’ensemble des ${n} boutique(s)`,
    ozetEnUcuzDahil: '🏷️ Moins cher (livraison incluse)',
    ozetEnUcuzKargo: '🏷️ Moins cher (+livraison au panier)',
    kargoDahilUcret: (u) => `📦 Livraison ${u} incluse`,
    kargoDahilBedava: '📦 Livraison gratuite incluse',
    kargoSepetteEklenir: '⚠️ +Livraison ajoutée au panier',
    stoktaMagazaSayi: (n) => ` · en stock chez ${n} boutique(s)`,
    sonucEtiketi: 'Résultat',
    stoktaUrunYok: 'Aucune offre en stock',
    tasarrufTutar: (u) => `Vous économisez <b>${u} net</b> !`,
    tasarrufDetay: (u, us, p, y) => `Moins cher : ${u} (${us}) · ${y} moins cher que l’offre la plus élevée (${p}).`,
    ayniDipFiyat: (u) => `Même prix plancher partout : ${u}`,
    ayniDipDetay: (n) => `Aucun écart entre ${n} boutiques — vous êtes déjà au prix le plus bas.`,
    kismiTarama: (yas, t, top) => `⚠️ ${yas ? yas + ' · ' : ''}Analyse partielle (${t}/${top} boutiques)`,
    dogrulandiSaat: (yas, top) => yas ? `🕒 Vérifié ${yas} sur ${top} boutiques` : `🕒 Vérifié en direct sur ${top} boutiques`,
    tukendiAltBaslik: '⚠️ Ce produit semble épuisé sur toutes les boutiques analysées.',
    bulunamadiAltBaslik: '🔍 Aucune offre correspondante trouvée sur les boutiques.',
    benzerAlternatifler: (baslik) => `${baslik} Alternatives similaires en stock :`,
    muadilAra: 'Chercher des alternatives',
    muadilAraniyor: 'Recherche…',
    muadilStokYokBaslik: 'Ce produit est en rupture de stock',
    muadilHicYokBaslik: 'Introuvable sur les boutiques',
    muadilStokYokAciklama: (n) => `Les ${n} boutique(s) semblent en rupture. Voyons des alternatives équivalentes.`,
    muadilHicYokAciklama: 'Découvrez des produits équivalents répondant au même besoin.',
    muadilVarMi: 'Une alternative moins chère ?',
    muadilKesifAciklama: 'Recherchez des modèles équivalents à meilleur prix.',
    muadilYukleniyor: 'Recherche d’alternatives en cours… (quelques secondes)',
    muadilHataBaslatilamadi: 'Impossible de lancer la recherche d’alternatives',
    bentoEnUcuzUst: '🏷️ LE MOINS CHER',
    bentoMagazayaGit: 'Aller à la boutique',
    bentoFiyatTrendi: '📈 Tendance des prix',
    bentoFiyatDagilimi: '📊 Écart de prix',
    bentoDip: 'Min',
    bentoOrt: 'Moy.',
    bentoTepe: 'Max',
    bentoTrendAria: (g) => `Tendance des prix sur ${g} jours`,
    bentoSonGunGecmis: (g) => `${g} derniers jours · historique`,
    bentoYetersizTrend: '📈 Pas encore assez d’historique.',
    bentoYetersizTrendAlt: 'Chaque comparaison ajoute un relevé ; la tendance apparaît en quelques jours.',
    bentoEnUcuz: 'Moins cher',
    bentoEnPahali: 'Plus cher',
    bentoFarkMetni: (f) => `${f} d’écart`,
    bentoTumAyniFiyat: 'Même prix partout',
    bentoDahaAzOde: (y) => `Payez ${y} de moins`,
    bentoFarkYok: 'Aucun écart',
    bentoMagazaStok: (m, s) => `${m} boutique(s) · ${s} en stock`,
    bentoKargoUcretsiz: '<span class="bento-rozet yesil">📦 Livraison gratuite incluse</span>',
    bentoKargoUcretli: (u) => `<span class="bento-rozet yesil">📦 Livraison incluse (${u} ajoutés)</span>`,
    bentoKargoEsikli: (t, esik) => `<span class="bento-rozet uyari" title="${t}">⚠️ +Livraison au panier (gratuite dès ${esik})</span>`,
    bentoKargoEsikliVarsayilanAciklama: 'Frais de port calculés au panier',
    bentoKargoBilinmiyorTitle: 'Frais de port non précisés sur la fiche produit ; le total peut augmenter au panier.',
    bentoKargoBilinmiyor: '⚠️ +Livraison au panier',
    bentoStokTukendi: '<span class="bento-rozet kirmizi">🔴 Épuisé</span>',
    bentoStokta: '<span class="bento-rozet yesil">🟢 En stock</span>',
    zekaSimdiAl: 'Acheter maintenant',
    zekaBekle: 'Attendre / Cher',
    zekaFiyatNormal: 'Prix normal',
    zekaVeriAz: 'Peu de données',
    zekaGecmisAlt: (g, n) => `Historique sur ${g} j · ${n} relevé(s)`,
    zekaFarkUcuz: (y) => `${y} sous la moyenne 30J`,
    zekaFarkPahali: (y) => `${y} au-dessus de la moyenne 30J`,
    zekaEnDusuk: (v) => `Min : <b>${v}</b>`,
    zekaOrt30: (v) => `Moy. 30J : <b>${v}</b>`,
    zekaEnYuksek: (v) => `Max : <b>${v}</b>`,
    birimSahteBaslik: '⚠️ Prix d’appel trompeur',
    birimSahteAciklama: 'L’article le moins cher à l’unité revient plus cher au kilo.',
    birimNormalBaslik: '⚖️ Prix au kilogramme',
    birimNormalAciklama: 'Poids différents convertis dans la même unité.',
    birimSupheliTitle: 'Prix à vérifier',
    birimSupheli: 'suspect',
    birimTahminTitle: 'Estimé selon la densité nominale',
    birimDogrulanmali: (n, nedeni) => `<b>⚠️ ${n} prix à vérifier.</b> ${nedeni} Exclu du meilleur prix au kg.`,
    birimSupheliVarsayilan: 'Prix unitaire anormalement bas.',
    birimAltReferans: (g) => `Comparaison sur base ${g}. Prix/kg = total réel ÷ poids net.`,
    birimAltDuz: 'Prix/kg = total réel ÷ poids net.',
    birimThMagaza: 'Boutique',
    birimThMiktar: 'Quantité',
    birimThFiyat: 'Prix',
    birimThBirim: 'Prix unitaire',
    filtreStoktaVar: (n) => `🟢 En stock (${n})`,
    filtreStoktaYok: (n) => `🔴 Rupture (${n})`,
    filtreCapEtiket: 'Diamètre :',
    filtreCap175: (n) => `Diamètre : 1,75 mm (${n})`,
    filtreCap285: (n) => `⚠️ Diamètre : 2,85 mm (${n})`,
    filtreHammaddeEtiket: 'Matière :',
    filtreYuksekBirim: (n) => `⚠️ Coût unitaire élevé (${n})`,
    okunamadiOnEk: '⚠️ Illisible : ',
    bulunamadiVarsayilan: 'Produit introuvable',
    eslesme: { model_kodu: 'référence identique', barkod: 'code-barres identique', benzerlik: 'titre similaire', kaynak: 'produit source' },
    rozetUcretsizKargo: '📦 Livraison Gratuite',
    rozetUcretliKargo: (u) => `🚚 +${u} Livraison`,
    rozetResmiSatici: '🏢 Boutique Officielle',
    rozetVadeFarksiz: '💳 Paiement sans frais',
    capOkTitle: 'Compatible imprimantes FDM 1,75 mm standard',
    birimTahminiEk: (u) => `≈ ${u}/kg (est.)`,
    birimIpucuHacim: 'Calculé d’après le volume (densité nominale)',
    birimIpucuTahmini: 'Estimé d’après le volume et la densité nominale',
    birimIpucuNet: 'Calculé d’après le poids net',
    kdvTitle: 'Boutique affichant hors TVA ; le total affiché inclut la TVA.',
    kdvDahil: (oran, haric) => `🧾 TTC${oran ? ` (${oran})` : ''} — HT ${haric}`,
    taksitBaslik: 'Paiement en plusieurs fois',
    fiyataDahilBaslik: 'Inclus dans le prix',
    hesapEtiketi: 'Détail :',
    cashbackSatir: (p, e) => `🪙 ${p} cashback — coût net <b>${e}</b>`,
    kuponSatir: (f, i, kod, kosul) => `🎟️ Avec coupon <b>${f}</b> (−${i})${kod ? ` — code : <b>${kod}</b>` : ''}${kosul ? `<span class="kupon-kosul"> · ${kosul}</span>` : ''}`,
    kampanyaOnizlemeSatir: (f, kosul) => `🏷️ Avec promo <b>~${f}</b>${kosul ? `<span class="kampanya-kosul"> · ${kosul}</span>` : ''}`,
    kargoEsikTitle: 'Complétez votre panier pour éviter les frais de port.',
    kargoEsikMetin: (e, u) => `💡 Ajoutez <b>${e}</b> au panier pour profiter de <b>${u}</b> de port GRATUIT !`,
    seritEnUcuz: '🏷️ MOINS CHER',
    seritTukendi: '🔴 ÉPUISÉ',
    seritFarkliRenk: (c) => `AUTRE COULEUR : ${c}`,
    kartStokYok: '🔴 Rupture',
    kartStokVar: '🟢 En stock',
    kartSonStokTitle: 'Alerte de stock faible sur la page boutique',
    kartSonStok: (n) => `⏳ Plus que ${n}`,
    dipRozetTitle: (s) => `Badge prix bas indiqué sur ${s}`,
    tukendiRozetTitle: 'Actuellement épuisé ; le prix affiché est le dernier connu.',
    tukendiRozet: 'Épuisé',
    sahteIndirimRozet: (id, g) => `⚠️ Prix barré gonflé<small>annoncé ${id} · réel ${g}</small>`,
    gercekFirsatTitle: 'Prix le plus bas des 90 derniers jours',
    gercekFirsatHtml: '🔥 VRAIE AFFAIRE<small>Plancher sur 90 jours</small>',
    ozelIndirimDusuldu: (u) => `Remise immédiate déduite : −${u} · `,
    sonBilinenFiyat: '⚠️ dernier prix connu — actuellement épuisé',
    kargoDahilToplamDetay: (ara, kar) => `<b>Total livraison incluse</b> (article ${ara} + port ${kar})`,
    kargoDahilToplamBedava: '<b>Total livraison incluse</b> (livraison gratuite)',
    gercekOdenecek: 'total estimé (frais de port calculés au panier)',
    fiyatHesaplanamadi: 'prix indisponible',
    kargoSatirEtiket: '🚚 Livraison',
    kargoBedava: 'Gratuite',
    kargoEsikSepette: (u) => `Ajoutée au panier (gratuite dès ${u})`,
    kargoSepetteBelli: 'Au panier',
    kargoBilinmiyor: 'Inconnue',
    kosulluBaslik: 'Promos conditionnelles (hors prix)',
    alarmBtnTitle: 'Recevez une alerte locale en cas de baisse — sans e-mail ni mot de passe',
    alarmBtn: '🔔 Alerte Prix',
    sepetBtnTitle: 'Ajouter au Panier Malin pour optimiser frais de port et coupons',
    sepetBtn: '🧺 Ajouter au panier',
    embedBtnTitle: 'Intégrer ce prix en direct sur votre site',
    embedBtn: '🔌 Intégrer',
    magazadaGorTukendi: 'Voir en boutique (Épuisé)',
    magazadaGor: 'Voir en boutique',
    tabloStokYok: '<span class="stok-hucre-yok">🔴 Non</span>',
    tabloStokVar: '<span class="stok-hucre-var">🟢 Oui</span>',
    tabloRenkFarkli: ' (autre)',
    trendVeriBirikiyor: '📉 Collecte en cours',
    trendHenuzYetersiz: 'Historique insuffisant',
    trendHicYokMesaj: 'Aucun historique de prix pour ce produit. Chaque comparaison ajoute un relevé.',
    trendAzGunMesaj: (g) => `Seulement ${g} jour(s) d’historique ; au moins 2 jours sont requis pour le graphique.`,
    trendDusukEtiket: (g) => `🟢 Min sur ${g} j`,
    trendOrtEtiket: (g) => `📊 Moy. sur ${g} j`,
    trendYuksekEtiket: (g) => `🔴 Max sur ${g} j`,
    trendAvantajli: (y) => `${y} moins cher`,
    trendPahali: (y) => `${y} plus cher`,
    trendOrtalamada: 'Dans la moyenne',
    trendOzetAlt: (g, k, m) => `${g} dernier(s) jour(s) · ${k} relevé(s)${m ? ` · ${m} boutique(s)` : ''}`,
    grafikEnDusuk: 'Prix le plus bas',
    grafikOrt30: 'Moyenne sur 30 jours',
  },
  ja: {
    erkenSonucBtn: (n) => `⚡ 取得済みの結果を表示 (${n}件見つかりました)`,
    erkenSonucHazirlaniyor: '⏳ 結果を準備中…',
    cipAraniyor: '検索中',
    cipHata: 'エラー',
    cipIptal: '中止',
    cipYok: '見つかりません',
    iptalKalan: (k) => '比較を中止しました' + (k > 0 ? ` — 残り${k}サイトをスキップ。` : '。') + ' これまでに取得した結果を表示しています。',
    tazeSrw: (yas, sayac) => `⚡ ${yas || '以前'}の取得データを表示中 · 最新価格を再確認しています${sayac}...`,
    tazeHata: (m) => `⚠️ 価格更新に失敗しました (${m}) — 前回の結果を表示しています。`,
    tazeGuncellendi: (n, ornek, yeni, kayb) => `✅ ${n}ストアの価格を更新しました ✓${ornek ? ` (${ornek})` : ''}${yeni ? ` · 新規 ${yeni}件` : ''}${kayb ? ` · 終了 ${kayb}件` : ''}。`,
    tazeKaybolan: (k) => `⚠️ ${k}ストアは掲載終了となりました（他の価格は確認済み）。`,
    tazeDogrulandi: '✅ すべての価格が最新であることを確認済み ✓',
    tazeAnlik: (yas) => `⚡ ${yas || '以前'}に取得（キャッシュ表示）。`,
    kaynakEtiketi: '検索元',
    belirtilmedi: '未指定',
    markaEtiketi: 'ブランド',
    modelKoduEtiketi: '型番',
    barkodEtiketi: 'JAN/EAN',
    tumundeTukendi: '⚠️ 全ストア在庫切れ',
    stokYokKisa: '在庫切れ',
    hepsiTukenmis: (n) => `検出された全${n}ストアで在庫切れ`,
    ozetEnUcuzDahil: '🏷️ 最安値（送料込み）',
    ozetEnUcuzKargo: '🏷️ 最安値（送料別途）',
    kargoDahilUcret: (u) => `📦 送料 ${u} 込み`,
    kargoDahilBedava: '📦 送料無料（送料込み）',
    kargoSepetteEklenir: '⚠️ +送料はカートで確定',
    stoktaMagazaSayi: (n) => ` · ${n}ストアで在庫あり`,
    sonucEtiketi: '結果',
    stoktaUrunYok: '在庫ありの商品が見つかりません',
    tasarrufTutar: (u) => `実質 <b>${u}</b> お得になります！`,
    tasarrufDetay: (u, us, p, y) => `最安: ${u} (${us}) · 最高値 (${p}) より ${y} お得。`,
    ayniDipFiyat: (u) => `全ストア同額の最安値: ${u}`,
    ayniDipDetay: (n) => `${n}ストア間で価格差はなく、すでに最安値です。`,
    kismiTarama: (yas, t, top) => `⚠️ ${yas ? yas + ' · ' : ''}部分スキャン (${t}/${top} ストア)`,
    dogrulandiSaat: (yas, top) => yas ? `🕒 ${yas}に ${top} ストアで確認済み` : `🕒 先ほど ${top} ストアでリアルタイム確認済み`,
    tukendiAltBaslik: '⚠️ この商品は現在全ストアで在庫切れのようです。',
    bulunamadiAltBaslik: '🔍 該当する販売ストアが見つかりませんでした。',
    benzerAlternatifler: (baslik) => `${baslik} 在庫のある類似人気商品:`,
    muadilAra: '代替品を検索',
    muadilAraniyor: '検索中…',
    muadilStokYokBaslik: '現在在庫切れです',
    muadilHicYokBaslik: '該当するストアが見つかりません',
    muadilStokYokAciklama: (n) => `${n}ストアすべてで在庫切れです。用途に合う代替モデルを探しましょう。`,
    muadilHicYokAciklama: '同じ用途に使える代替製品を確認できます。',
    muadilVarMi: '代替製品はありますか？',
    muadilKesifAciklama: 'より手頃な代替モデルを検索できます。',
    muadilYukleniyor: '代替製品を検索中…（数秒かかる場合があります）',
    muadilHataBaslatilamadi: '代替検索を開始できませんでした',
    bentoEnUcuzUst: '🏷️ 最安値',
    bentoMagazayaGit: 'ショップへ',
    bentoFiyatTrendi: '📈 価格推移',
    bentoFiyatDagilimi: '📊 価格分布',
    bentoDip: '最安',
    bentoOrt: '平均',
    bentoTepe: '最高',
    bentoTrendAria: (g) => `過去${g}日間の価格推移`,
    bentoSonGunGecmis: (g) => `過去${g}日間 · 価格履歴`,
    bentoYetersizTrend: '📈 価格履歴がまだ不足しています。',
    bentoYetersizTrendAlt: '比較するたびに記録が追加され、数日で推移が表示されます。',
    bentoEnUcuz: '最安',
    bentoEnPahali: '最高',
    bentoFarkMetni: (f) => `${f} 差`,
    bentoTumAyniFiyat: '全ストア同一価格',
    bentoDahaAzOde: (y) => `${y} お得`,
    bentoFarkYok: '価格差なし',
    bentoMagazaStok: (m, s) => `${m} ストア · ${s} 在庫あり`,
    bentoKargoUcretsiz: '<span class="bento-rozet yesil">📦 送料無料込み</span>',
    bentoKargoUcretli: (u) => `<span class="bento-rozet yesil">📦 送料込み（${u} 加算済）</span>`,
    bentoKargoEsikli: (t, esik) => `<span class="bento-rozet uyari" title="${t}">⚠️ +送料別（${esik}以上で無料）</span>`,
    bentoKargoEsikliVarsayilanAciklama: '送料はカートで確定します',
    bentoKargoBilinmiyorTitle: '商品ページに送料記載なし。チェックアウト時に加算される場合があります。',
    bentoKargoBilinmiyor: '⚠️ +送料はカートで確定',
    bentoStokTukendi: '<span class="bento-rozet kirmizi">🔴 在庫切れ</span>',
    bentoStokta: '<span class="bento-rozet yesil">🟢 在庫あり</span>',
    zekaSimdiAl: '今が買い時',
    zekaBekle: '様子見 / 高値',
    zekaFiyatNormal: '適正価格',
    zekaVeriAz: 'データ不足',
    zekaGecmisAlt: (g, n) => `${g}日間の履歴 · ${n}件の価格データ`,
    zekaFarkUcuz: (y) => `30日平均より ${y} 安い`,
    zekaFarkPahali: (y) => `30日平均より ${y} 高い`,
    zekaEnDusuk: (v) => `最安: <b>${v}</b>`,
    zekaOrt30: (v) => `30日平均: <b>${v}</b>`,
    zekaEnYuksek: (v) => `最高: <b>${v}</b>`,
    birimSahteBaslik: '⚠️ 見かけ最安に注意',
    birimSahteAciklama: '本体価格が安く見えても、1kg単価では割高になる商品があります。',
    birimNormalBaslik: '⚖️ 1kgあたりの単価',
    birimNormalAciklama: '異なる内容量を同一単位に換算しました。',
    birimSupheliTitle: '価格要確認',
    birimSupheli: '要確認',
    birimTahminTitle: '標準密度から推定',
    birimDogrulanmali: (n, nedeni) => `<b>⚠️ ${n}件の価格は要確認です。</b> ${nedeni} 最安単価ランキングからは除外されています。`,
    birimSupheliVarsayilan: '平均と比べて不自然に安価です。',
    birimAltReferans: (g) => `${g}基準で比較。単価 = 実質合計 ÷ 正味量。`,
    birimAltDuz: '単価 = 実質合計 ÷ 正味量。',
    birimThMagaza: 'ストア',
    birimThMiktar: '容量',
    birimThFiyat: '価格',
    birimThBirim: '単価',
    filtreStoktaVar: (n) => `🟢 在庫あり (${n})`,
    filtreStoktaYok: (n) => `🔴 在庫切れ (${n})`,
    filtreCapEtiket: '径:',
    filtreCap175: (n) => `径: 1.75mm (${n})`,
    filtreCap285: (n) => `⚠️ 径: 2.85mm (${n})`,
    filtreHammaddeEtiket: '素材:',
    filtreYuksekBirim: (n) => `⚠️ 高単価 (${n})`,
    okunamadiOnEk: '⚠️ 取得不可: ',
    bulunamadiVarsayilan: '商品が見つかりません',
    eslesme: { model_kodu: '型番一致', barkod: 'JAN一致', benzerlik: '名称類似', kaynak: '検索元商品' },
    rozetUcretsizKargo: '📦 送料無料',
    rozetUcretliKargo: (u) => `🚚 +送料 ${u}`,
    rozetResmiSatici: '🏢 公式ストア',
    rozetVadeFarksiz: '💳 分割手数料無料',
    capOkTitle: '標準1.75mm FDMプリンター対応',
    birimTahminiEk: (u) => `≈ ${u}/kg (推定)`,
    birimIpucuHacim: '体積と標準密度から算出',
    birimIpucuTahmini: '体積・標準密度からの推定値',
    birimIpucuNet: '正味重量から算出',
    kdvTitle: '税抜表記ストアですが、比較合計は税込で計算されています。',
    kdvDahil: (oran, haric) => `🧾 税込${oran ? ` (${oran})` : ''} — 税抜 ${haric}`,
    taksitBaslik: '分割払い',
    fiyataDahilBaslik: '価格に含まれます',
    hesapEtiketi: '内訳:',
    cashbackSatir: (p, e) => `🪙 ${p} ポイント還元 — 実質 <b>${e}</b>`,
    kuponSatir: (f, i, kod, kosul) => `🎟️ クーポン適用 <b>${f}</b> (−${i})${kod ? ` — コード: <b>${kod}</b>` : ''}${kosul ? `<span class="kupon-kosul"> · ${kosul}</span>` : ''}`,
    kampanyaOnizlemeSatir: (f, kosul) => `🏷️ キャンペーン適用 <b>~${f}</b>${kosul ? `<span class="kampanya-kosul"> · ${kosul}</span>` : ''}`,
    kargoEsikTitle: 'まとめ買いで送料無料ラインに到達できます。',
    kargoEsikMetin: (e, u) => `💡 あと <b>${e}</b> 追加すると送料 <b>${u}</b> が無料になります！`,
    seritEnUcuz: '🏷️ 最安値',
    seritTukendi: '🔴 在庫切れ',
    seritFarkliRenk: (c) => `別カラー: ${c}`,
    kartStokYok: '🔴 在庫切れ',
    kartStokVar: '🟢 在庫あり',
    kartSonStokTitle: 'ストア上の残りわずか表示',
    kartSonStok: (n) => `⏳ 残り${n}点`,
    dipRozetTitle: (s) => `${s} 商品ページ記載の最安バッジ`,
    tukendiRozetTitle: '現在在庫切れのため、最後に確認された価格を表示しています。',
    tukendiRozet: '在庫切れ',
    sahteIndirimRozet: (id, g) => `⚠️ 割高な元値表示<small>表示 ${id} · 実質 ${g}</small>`,
    gercekFirsatTitle: '過去90日間の最安値',
    gercekFirsatHtml: '🔥 本物のセール<small>90日間の最安値</small>',
    ozelIndirimDusuldu: (u) => `即時割引適用: −${u} · `,
    sonBilinenFiyat: '⚠️ 最終確認価格 — 現在在庫切れ',
    kargoDahilToplamDetay: (ara, kar) => `<b>送料込み合計</b> (本体 ${ara} + 送料 ${kar})`,
    kargoDahilToplamBedava: '<b>送料込み合計</b> (送料無料)',
    gercekOdenecek: 'お支払い予定額 (送料はカートで確定)',
    fiyatHesaplanamadi: '価格算出不可',
    kargoSatirEtiket: '🚚 送料',
    kargoBedava: '無料',
    kargoEsikSepette: (u) => `カート計算 (${u}以上で無料)`,
    kargoSepetteBelli: 'カートで確定',
    kargoBilinmiyor: '不明',
    kosulluBaslik: '条件付き特典 (合計に含みません)',
    alarmBtnTitle: '値下がり時にこの端末へ通知（メール・登録不要）',
    alarmBtn: '🔔 価格アラート',
    sepetBtnTitle: 'スマートカートに追加して送料・クーポン込みで最適化',
    sepetBtn: '🧺 カートに追加',
    embedBtnTitle: 'この商品の最新価格バッジをサイトに埋め込む',
    embedBtn: '🔌 埋め込み',
    magazadaGorTukendi: 'ショップで見る (在庫切れ)',
    magazadaGor: 'ショップで見る',
    tabloStokYok: '<span class="stok-hucre-yok">🔴 なし</span>',
    tabloStokVar: '<span class="stok-hucre-var">🟢 あり</span>',
    tabloRenkFarkli: ' (別色)',
    trendVeriBirikiyor: '📉 データ収集中',
    trendHenuzYetersiz: '価格履歴がまだありません',
    trendHicYokMesaj: 'この商品の価格履歴はまだありません。検索や監視を行うたびにデータが記録されます。',
    trendAzGunMesaj: (g) => `${g}日分のデータのみです。推移グラフの表示には最低2日分のデータが必要です。`,
    trendDusukEtiket: (g) => `🟢 過去${g}日 最安`,
    trendOrtEtiket: (g) => `📊 過去${g}日 平均`,
    trendYuksekEtiket: (g) => `🔴 過去${g}日 最高`,
    trendAvantajli: (y) => `${y} お得`,
    trendPahali: (y) => `${y} 割高`,
    trendOrtalamada: '平均並み',
    trendOzetAlt: (g, k, m) => `過去${g}日間 · ${k}件の価格データ${m ? ` · ${m}ストア` : ''}`,
    grafikEnDusuk: '最安値',
    grafikOrt30: '30日間平均',
  },
};
const CANLI_YEREL = CANLI_SOZLUK[BASKI_ORTAM.dil] || CANLI_SOZLUK.tr;

function cY() {
  return CANLI_YEREL;
}

function sonucLocale() {
  const d = BASKI_ORTAM.dil || 'tr';
  return d === 'ja' ? 'ja-JP' : (d === 'fr' ? 'fr-FR' : (d === 'en' ? 'en-US' : 'tr-TR'));
}

function yuzdeStr(deger, virgulOndalik = false) {
  const d = BASKI_ORTAM.dil || 'tr';
  let s = String(deger ?? '0');
  if (d === 'tr' || d === 'fr') {
    if (virgulOndalik) s = s.replace('.', ',');
  } else {
    s = s.replace(',', '.');
  }
  if (d === 'tr') return '%' + s;
  if (d === 'fr') return s + ' %';
  return s + '%';
}

function imzaliYuzde(diff) {
  if (diff > 0) return '-' + yuzdeStr(diff);
  if (diff < 0) return '+' + yuzdeStr(Math.abs(diff));
  return yuzdeStr(0);
}

function hammaddeEtiketiYerellestir(tur, varsayilan) {
  const d = BASKI_ORTAM.dil || 'tr';
  if (tur === 'standart_recine') {
    return d === 'fr' ? '🧴 Résine standard' : (d === 'ja' ? '🧴 標準レジン' : (d === 'en' ? '🧴 Standard Resin' : varsayilan));
  }
  if (tur === 'suda_yikanabilir') {
    return d === 'fr' ? '🚿 Lavable à l’eau' : (d === 'ja' ? '🚿 水洗いレジン' : (d === 'en' ? '🚿 Water Washable' : varsayilan));
  }
  return varsayilan;
}

function baskiNedenYerellestir(raw) {
  const s = String(raw || '').trim();
  const d = BASKI_ORTAM.dil || 'tr';
  if (!s || d === 'tr') return s;
  if (/Ürün fiyatı okunamadı/i.test(s)) {
    return d === 'fr' ? 'Prix du produit illisible.' : (d === 'ja' ? '商品価格を取得できませんでした。' : 'Could not read product price.');
  }
  if (/Makara gramajı başlıktan okunamadı/i.test(s)) {
    return d === 'fr'
      ? 'Poids de bobine non détecté dans le titre (aucune estimation inventée).'
      : (d === 'ja'
        ? '商品名からスプール重量を読み取れませんでした（推測計算は行いません）。'
        : 'Spool weight not found in title (no guessed calculation shown).');
  }
  if (/Geçerli bir model gramajı girin/i.test(s)) {
    return d === 'fr'
      ? 'Entrez un poids de modèle valide (1–100000 g).'
      : (d === 'ja' ? '有効なモデル重量 (1–100000 g) を入力してください。' : 'Enter a valid model weight (1–100000 g).');
  }
  return s;
}

function baskiRozetYerellestir(raw) {
  const s = String(raw || '').trim();
  const d = BASKI_ORTAM.dil || 'tr';
  if (!s || d === 'tr') return s;
  if (/2\.85 mm Kalınlık|1\.75mm yazıcılara uymaz/i.test(s)) {
    return d === 'fr'
      ? '⚠️ ATTENTION : Fil 2,85 mm (incompatible imprimantes 1,75 mm)'
      : (d === 'ja' ? '⚠️ 注意: 2.85mm径（標準1.75mmプリンター非対応）' : '⚠️ WARNING: 2.85 mm filament (does not fit 1.75 mm printers!)');
  }
  const yuksekM = s.match(/medyanına göre\s*%?([\d.,]+)\s*daha pahalı/i);
  if (yuksekM) {
    const pct = yuzdeStr(yuksekM[1], true);
    return d === 'fr'
      ? `⚠️ Coût unitaire élevé — ${pct} au-dessus de la médiane`
      : (d === 'ja' ? `⚠️ 高単価 — 中央値より ${pct} 割高` : `⚠️ High Unit Cost — ${pct} above peer median`);
  }
  const nitMap = {
    '💎 Silk İpeksi': { en: '💎 Silk', fr: '💎 Soyeux Silk', ja: '💎 シルク調' },
    '🎨 Mat Yüzey': { en: '🎨 Matte', fr: '🎨 Mat', ja: '🎨 マット仕上げ' },
    '🌱 Biyo-Uyumlu': { en: '🌱 Bio-Compatible', fr: '🌱 Biocompatible', ja: '🌱 生体適合' },
    '☀️ UV Dayanımlı': { en: '☀️ UV Resistant', fr: '☀️ Résistant UV', ja: '☀️ 耐UV' },
    '🤸 Esnek': { en: '🤸 Flexible', fr: '🤸 Flexible', ja: '🤸 フレキシブル' },
    '🚿 Suda Yıkanabilir': { en: '🚿 Water Washable', fr: '🚿 Lavable à l’eau', ja: '🚿 水洗い可' },
    '🧴 Standart Reçine': { en: '🧴 Standard Resin', fr: '🧴 Résine standard', ja: '🧴 標準レジン' },
  };
  if (nitMap[s]?.[d]) return nitMap[s][d];
  return s;
}

function magazaDurumNedeniYerellestir(raw) {
  const s = String(raw || '').trim();
  const d = BASKI_ORTAM.dil || 'tr';
  if (!s || d === 'tr') return s;
  const yokM = s.match(/^Aramada hiç sonuç bulunamadı\s*(?:\((.+)\))?$/i);
  if (yokM) {
    const qPart = yokM[1] ? ` (${yokM[1]})` : '';
    return d === 'fr'
      ? `Aucun résultat trouvé${qPart}`
      : (d === 'ja' ? `検索結果が見つかりませんでした${qPart}` : `No search results found${qPart}`);
  }
  if (/^Aday ürünler incelendi ancak aynı ürün bulunamadı$/i.test(s)) {
    return d === 'fr'
      ? 'Annonces vérifiées, aucune correspondance exacte'
      : (d === 'ja' ? '候補を確認しましたが一致する商品がありません' : 'Checked candidates, no exact product match');
  }
  const okuM = s.match(/^Arama sayfası okunamadı:\s*(.+)$/i);
  if (okuM) {
    return d === 'fr'
      ? `Impossible de charger la page de recherche : ${okuM[1]}`
      : (d === 'ja' ? `検索ページを読み込めませんでした: ${okuM[1]}` : `Failed to load search page: ${okuM[1]}`);
  }
  if (/^Ürün bulunamadı$/i.test(s)) {
    return d === 'fr' ? 'Produit introuvable' : (d === 'ja' ? '商品が見つかりません' : 'Product not found');
  }
  return s;
}

function trendTavsiyeYerellestir(s, fallbackRaw) {
  const raw = String(fallbackRaw || s?.recommendationText || '').trim();
  const d = BASKI_ORTAM.dil || 'tr';
  if (d === 'tr') return raw;
  const g = Number(s?.gunSayisi) || 0;
  const f = Number(s?.diffFromAvg);
  if ((s && g > 0 && g < 3) || /Yalnızca\s+\d+\s+günlük fiyat geçmişi/i.test(raw)) {
    const gunN = g || Number((raw.match(/Yalnızca\s+(\d+)\s+günlük/i) || [])[1]) || 1;
    return d === 'fr'
      ? `📉 Seulement ${gunN} jour(s) d’historique. Quelques jours de plus sont nécessaires pour une tendance fiable.`
      : (d === 'ja'
        ? `📉 ${gunN}日分の履歴しかありません。信頼できる傾向分析にはあと数日分必要です。`
        : `📉 Only ${gunN} day${gunN === 1 ? '' : 's'} of price history so far. A few more days are needed for a reliable trend.`);
  }
  if (/en düşük seviyesinde/i.test(raw)) {
    return d === 'fr'
      ? `🔥 Au plus bas des ${g} derniers jours !`
      : (d === 'ja' ? `🔥 過去${g}日間の最安値水準です！` : `🔥 At the lowest level in the last ${g} days!`);
  }
  if (/ortalamasından.*daha ucuz/i.test(raw) || (Number.isFinite(f) && f >= 5)) {
    const y = yuzdeStr(Number.isFinite(f) ? f : (raw.match(/%(\d+)/)?.[1] || 0));
    return d === 'fr'
      ? `✅ ${y} sous la moyenne des ${g} derniers jours.`
      : (d === 'ja' ? `✅ 過去${g}日平均より ${y} 安値です。` : `✅ ${y} below the ${g}-day average.`);
  }
  if (/ortalamasının.*üzerinde/i.test(raw) || (Number.isFinite(f) && f <= -5)) {
    const y = yuzdeStr(Number.isFinite(f) ? Math.abs(f) : (raw.match(/%(\d+)/)?.[1] || 0));
    return d === 'fr'
      ? `⚠️ ${y} au-dessus de la moyenne des ${g} derniers jours.`
      : (d === 'ja' ? `⚠️ 過去${g}日平均より ${y} 割高です。` : `⚠️ ${y} above the ${g}-day average.`);
  }
  if (/ortalama fiyat seviyesinde/i.test(raw)) {
    return d === 'fr'
      ? `⚖️ Au niveau moyen des ${g} derniers jours.`
      : (d === 'ja' ? `⚖️ 過去${g}日間の平均水準です。` : `⚖️ Near the ${g}-day average price level.`);
  }
  return raw;
}

function zekaMesajYerellestir(raw, z) {
  const s = String(raw || '').trim();
  const d = BASKI_ORTAM.dil || 'tr';
  if (!s || d === 'tr') return s;
  const g = z?.gunSayisi || 0;
  const n = z?.veriNoktasi || 0;
  if (/Kayıtlı fiyat geçmişinin en düşüğünde/i.test(s)) {
    return d === 'fr'
      ? `🔥 Au plus bas de l’historique enregistré (${g} j, ${n} relevés).`
      : (d === 'ja' ? `🔥 記録上の最安値 (${g}日・${n}件)。` : `🔥 At the lowest recorded price (${g} day(s), ${n} observation(s)).`);
  }
  if (/en az 3 günlük|Yorum için yeterli/i.test(s)) {
    return d === 'fr'
      ? 'Pas assez d’historique pour une recommandation fiable.'
      : (d === 'ja' ? '傾向を判定するための十分な履歴がまだありません。' : 'Not enough price history yet for a reliable recommendation.');
  }
  if (/Bu ürün için henüz fiyat geçmişi yok/i.test(s)) {
    return CANLI_YEREL.trendHicYokMesaj;
  }
  if (/Son 90 günün en dip fiyatında/i.test(s)) {
    return d === 'fr' ? '🔥 Plancher sur 90 jours ! Offre exceptionnelle.' : (d === 'ja' ? '🔥 過去90日間の最安値！買い時です。' : '🔥 90-day floor price! Strong buying opportunity.');
  }
  if (/Şişirilmiş İndirim/i.test(s)) {
    return d === 'fr'
      ? '⚠️ Remise gonflée : le prix dépasse la moyenne récente sur 30 jours.'
      : (d === 'ja' ? '⚠️ 割高な割引表示：過去30日平均を上回っています。' : '⚠️ Inflated discount claim: recent 30-day average is lower than this price.');
  }
  if (/Ortalamadan .* daha ucuz/i.test(s)) {
    const pct = yuzdeStr(Math.abs(z?.ortalamaFarkYuzde ?? Number((s.match(/%([\d.,]+)/) || [])[1] || 0)));
    return d === 'fr' ? `🟢 ${pct} sous la moyenne — bon moment pour acheter.` : (d === 'ja' ? `🟢 平均より ${pct} 安値 — 買い時です。` : `🟢 ${pct} below average — good time to buy.`);
  }
  if (/Ortalamanın .* üzerinde/i.test(s)) {
    const pct = yuzdeStr(Math.abs(z?.ortalamaFarkYuzde ?? Number((s.match(/%([\d.,]+)/) || [])[1] || 0)));
    return d === 'fr' ? `🔴 ${pct} au-dessus de la moyenne — attendre peut être judicieux.` : (d === 'ja' ? `🔴 平均より ${pct} 高値 — 様子見がおすすめです。` : `🔴 ${pct} above average — worth waiting for a drop.`);
  }
  if (/Piyasa ortalamasında/i.test(s)) {
    return d === 'fr' ? '🟡 Dans la moyenne du marché (±5 %) — prix normal.' : (d === 'ja' ? '🟡 市場平均並み (±5%) — 通常価格です。' : '🟡 Around market average (±5%) — normal price level.');
  }
  return s;
}

const MOD_PLACEHOLDER = DIL_KOPYA_YEREL.placeholder;
const MOD_BUTON = DIL_KOPYA_YEREL.buton;

/** Metin link olarak yorumlanabilir mi? (şemasız alan adları da kabul) */
function dogalDilTavsiyeMi(metin) {
  if (!metin || typeof metin !== 'string') return false;
  const s = metin.trim().toLocaleLowerCase('tr-TR');
  const tavsiyeKelimeleri = /\b(bütçe|bütçem|bütçeli|öneri|önerir|öner|tavsiye|tavsiyesi|almak istiyorum|hangisi|hangisini|en iyi|ne alabilirim|kararsızım|fikir ver|hangisini almalıyım)\b/i;
  if (tavsiyeKelimeleri.test(s)) return true;
  const kelimeler = s.split(/\s+/).filter(Boolean);
  if (s.includes('?') && kelimeler.length >= 4) return true;
  if (kelimeler.length >= 9) return true;
  return false;
}

/**
 * 🔎 Mod geri bildirimi (2026-11-13).
 *
 * Kullanıcı hangi akışta olduğunu tek satırda görsün: "⚡ Ürün karşılaştırma
 * başlatıldı" veya "🤖 YZ Danışmanı öneri arıyor". Yeni bir DOM öğesi eklemek
 * yerine mevcut `#sonAramaNotu` şeridi kullanılır (geriye dönük uyumlu).
 * @param {string} metin
 */
function modBilgisiGoster(metin) {
  const not = $('#sonAramaNotu');
  if (!not || !metin) return;
  try {
    if (typeof notMetniAyarla === 'function') notMetniAyarla(metin);
  } catch {
    const el = $('#sonAramaNotuMetin');
    if (el) el.textContent = metin;
  }
  not.hidden = false;
}

function linkGibiMi(metin) {
  const s = String(metin || '').trim();
  if (!s || /\s/.test(s)) return false;
  return /^(https?:\/\/|www\.)/i.test(s)
    || /^[\p{L}\d.-]+\.[a-z]{2,}(?:[/:?#]|$)/iu.test(s);
}

function modButonunuGuncelle() {
  const btn = $('#araBtn');
  if (!btn) return;
  btn.dataset.mod = aramaModu;
  if (!btn.disabled) btn.textContent = MOD_BUTON[aramaModu] || MOD_BUTON.oto;
}

/** Arama modunu değiştirir (çipler + placeholder + buton metni). */
function modAyarla(mod, { inputDegeri = null } = {}) {
  aramaModu = ['oto', 'link', 'ad'].includes(mod) ? mod : 'oto';
  document.querySelectorAll('.mod-secim').forEach(b => {
    const secili = b.dataset.mod === aramaModu;
    b.classList.toggle('aktif', secili);
    b.setAttribute('aria-selected', secili ? 'true' : 'false');
  });
  const input = $('#urunUrl');
  if (input) {
    input.placeholder = MOD_PLACEHOLDER[aramaModu];
    input.inputMode = aramaModu === 'link' ? 'url' : 'text';
    if (inputDegeri != null) input.value = inputDegeri;
  }
  modButonunuGuncelle();
  if (aramaModu === 'ad') linkOnizlemeyiTemizle();
}

/** Link önizleme panelini gizler ve durumu sıfırlar. */
function linkOnizlemeyiTemizle() {
  linkCozum = null;
  const kutu = $('#linkOnizleme');
  if (kutu) kutu.hidden = true;
  $('#linkteAraBtn')?.setAttribute('hidden', '');
  $('#linkAdiylaAraBtn')?.setAttribute('hidden', '');
}

/** /api/link-coz çağrısı. Hata durumunda null döner (akış çökmez). */
async function linkCozApi(metin) {
  try {
    const res = await fetch('/api/link-coz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: metin }),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok && !veri?.mesaj) return null;
    return veri;
  } catch {
    return null;
  }
}

/** Önizleme panelini çözüm sonucuna göre doldurur. */
function linkOnizlemeGoster(cozum) {
  const kutu = $('#linkOnizleme');
  if (!kutu) return;
  if (!cozum) { linkOnizlemeyiTemizle(); return; }

  const ikon = $('#linkOnizlemeIkon');
  const baslik = $('#linkOnizlemeBaslik');
  const alt = $('#linkOnizlemeAlt');
  const linkBtn = $('#linkteAraBtn');
  const adBtn = $('#linkAdiylaAraBtn');

  const destekli = cozum.ok === true && !!cozum.site;
  const urunAdi = cozum.urunAdi || null;

  if (ikon) ikon.textContent = destekli ? '✅' : (cozum.neden === 'desteklenmiyor' ? '⚠️' : '🔗');
  if (baslik) {
    baslik.textContent = destekli
      ? `${cozum.site.name} linki algılandı`
      : (cozum.neden === 'desteklenmiyor'
        ? `${cozum.host || 'Bu site'} desteklenmiyor`
        : 'Geçerli bir ürün linki değil');
  }
  if (alt) {
    const parcalar = [];
    if (destekli) {
      parcalar.push(urunAdi
        ? `Ürün: “${urunAdi}”`
        : 'Ürün adı linkten okunamadı; karşılaştırma yine de yapılabilir.');
      parcalar.push('Aynı ürün 60+ mağazada aranacak.');
    } else if (cozum.mesaj) {
      parcalar.push(cozum.mesaj);
    }
    alt.textContent = parcalar.join(' ');
  }

  if (linkBtn) {
    linkBtn.hidden = !destekli;
    linkBtn.textContent = urunAdi ? '🔗 Bu linkteki ürünü ara' : '🔗 Linkte Ara';
  }
  // Ürün adı çıkarılabildiyse her durumda "ürün adıyla ara" sunulur.
  if (adBtn) adBtn.hidden = !urunAdi;

  kutu.hidden = false;
  kutu.classList.toggle('link-onizleme-hata', !destekli);
}

/** Girdi değiştikçe (debounce) link çözümlemesi yapar. */
function linkCozGecikmeli() {
  clearTimeout(linkCozTimer);
  const metin = $('#urunUrl')?.value.trim() || '';
  if (!linkGibiMi(metin)) { linkOnizlemeyiTemizle(); return; }
  linkCozTimer = setTimeout(async () => {
    const benim = ++linkCozSayaci;
    const cozum = await linkCozApi(metin);
    if (benim !== linkCozSayaci) return; // daha yeni bir istek var
    linkCozum = cozum;
    linkOnizlemeGoster(cozum);
  }, 320);
}

/** "Linkte ara" düğmesi: linki normalize edip karşılaştırmayı başlatır. */
async function linkteAra() {
  const metin = $('#urunUrl')?.value.trim() || '';
  const cozum = await linkCozApi(metin);
  linkCozum = cozum;
  linkOnizlemeGoster(cozum);
  if (!cozum?.ok) {
    $('#hata').textContent = cozum?.mesaj || 'Bu link ile arama yapılamıyor.';
    $('#hata').hidden = false;
    return;
  }
  $('#urunUrl').value = cozum.url;
  modAyarla('link');
  const form = $('#karsilastirForm');
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

/** "Ürün adıyla ara": linkten çıkarılan adı doğal dil moduna taşır. */
function linkAdiylaAra() {
  const metin = linkCozum?.urunAdi || $('#linkOnizlemeAlt')?.textContent || '';
  if (!metin) return;
  modAyarla('ad', { inputDegeri: metin });
  const form = $('#karsilastirForm');
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

document.querySelectorAll('.mod-secim').forEach(btn => {
  btn.addEventListener('click', () => {
    modAyarla(btn.dataset.mod || 'oto');
    const metin = $('#urunUrl')?.value.trim() || '';
    if (linkGibiMi(metin)) linkCozGecikmeli();
    else if (aramaModu === 'ad') linkOnizlemeyiTemizle();
    $('#urunUrl')?.focus();
  });
});
// İlk yüklemede yalnızca tek bir sekmenin aria-selected="true" olmasını garanti et.
modAyarla(aramaModu);

$('#linkteAraBtn')?.addEventListener('click', linkteAra);
$('#linkAdiylaAraBtn')?.addEventListener('click', linkAdiylaAra);

// Yazarken ve yapıştırınca canlı önizleme.
$('#urunUrl')?.addEventListener('input', () => {
  const metin = $('#urunUrl').value.trim();
  // Otomatik modda link yapıştırıldıysa "linkte ara" görünümüne geç.
  if (aramaModu === 'oto' && linkGibiMi(metin)) {
    const btn = $('#araBtn');
    if (btn && !btn.disabled) btn.textContent = MOD_BUTON.link;
  } else if (aramaModu === 'oto') {
    modButonunuGuncelle();
  }
  linkCozGecikmeli();
});
$('#urunUrl')?.addEventListener('paste', () => {
  // Yapıştırılan içerik input'a düştükten sonra çözümle.
  setTimeout(linkCozGecikmeli, 0);
});

// ⚡ Popüler hızlı arama çipleri: ürün adı moduna geçip arar.
document.addEventListener('click', (e) => {
  const cip = e.target.closest?.('.hizli-cip');
  if (!cip) return;
  const sorgu = cip.dataset.hizli || cip.textContent.trim();
  modAyarla('ad', { inputDegeri: sorgu });
  $('#urunUrl')?.focus();
  const form = $('#karsilastirForm');
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

$('#karsilastirForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearTimeout(oneriTimer);
  oneriIstegeSayaci++;
  onerileriKapat();
  let url = $('#urunUrl').value.trim();
  $('#hata').hidden = true;
  $('#sonAramaNotu').hidden = true;
  sifirdanTaraButonunuGoster(false);
  // Önceki aramaların açık SSE bağlantılarını kapat (2026-10-29)
  tumAkislariKapat();
  if (!url) return;

  /* ---- 🔗 Akıllı Niyet Yönlendirici (2026-11-13) ----
   * Önceden: "ürün adı" modunda HER sorgu /api/oneri (YZ danışmanı) akışına
   * gidiyordu — "eSun PLA+" gibi net model adları bile LLM beklemesine takılıyordu.
   * Artık `dogalDilTavsiyeMi()` gerçekten çağrılıyor:
   *   • Net ürün/model adı  → hızlı ürün karşılaştırma hattı (LLM YOK)
   *   • Bütçe/tavsiye cümlesi → YZ danışmanı (/api/oneri)
   */
  const linkGirdi = linkGibiMi(url);
  const danismaCumlesi = !linkGirdi && dogalDilTavsiyeMi(url);

  // "Ürün adıyla ara" modunda: yalnızca GERÇEKTEN danışma cümlesi ise öneri akışı.
  if (danismaCumlesi) {
    const ihtiyacAlani = $('#ihtiyacMetni');
    const oneriFormu = $('#oneriForm');
    if (ihtiyacAlani && oneriFormu) {
      ihtiyacAlani.value = url;
      // Doğal dil aramasında önceki link sonucu ekranda kalmasın.
      $('#sonucAlani').hidden = true;
      $('#durumAlani').hidden = true;
      $('#oneriSonuc').hidden = true;
      // 🔎 Mod geri bildirimi: kullanıcı hangi akışta olduğunu bilsin.
      modBilgisiGoster(DIL_KOPYA_YEREL.modDanisman);
      if (oneriFormu.requestSubmit) oneriFormu.requestSubmit();
      else $('#oneriBtn').click();
      setTimeout(() => {
        document.querySelector('#oneriDurum')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return;
    }
  }

  // Net ürün/model adı: doğrudan karşılaştırma (link akışı metin adını da kabul eder).
  if (!linkGirdi && aramaModu === 'ad') {
    modBilgisiGoster(DIL_KOPYA_YEREL.modBasladi);
  }

  // "Linkte ara" (veya otomatik modda link): önce bağlantıyı sunucuda çöz.
  if (linkGirdi || aramaModu === 'link') {
    if (!linkGirdi) {
      linkOnizlemeyiTemizle();
      $('#hata').textContent = 'Linkte arama için geçerli bir ürün linki yapıştırın. '
        + 'Örnek: https://www.trendyol.com/urun-adi-p-123';
      $('#hata').hidden = false;
      return;
    }
    const cozum = await linkCozApi(url);
    if (!cozum?.ok) {
      linkCozum = cozum;
      linkOnizlemeGoster(cozum);
      $('#hata').textContent = cozum?.mesaj || 'Bu link desteklenmiyor.';
      $('#hata').hidden = false;
      return;
    }
    // Kanonik adres + mağaza bilgisi (önizleme paneli güncel kalsın).
    linkCozum = cozum;
    linkOnizlemeGoster(cozum);
    url = cozum.url || url;
    $('#urunUrl').value = url;
  }

  // Yeni aramada 3D filtreleri ve gramaj varsayılana döner (2026-10-30).
  seciliFiltre = 'hepsi';
  baskiGramaj = 100;

  $('#araBtn').disabled = true;
  $('#araBtn').textContent = DIL_KOPYA_YEREL.araniyor;
  $('#sonucAlani').hidden = true;
  $('#durumAlani').hidden = false;
  // 📍 Link araması başladı: kullanıcıyı anında tarama durumuna ve mağaza
  // çiplerine kaydır. 60 ms gecikme, tarayıcının `hidden = false` sonrası
  // yerleşimi tamamlaması için — aksi halde hedefin yüksekliği henüz 0 olur.
  setTimeout(() => {
    const hedef = document.getElementById('durumAlani');
    if (hedef && !hedef.hidden) {
      hedef.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 60);
  // Yeni aramada eski bento/trend verisi kalmasın (yanlış ürünle eşleşmesin).
  const bento = $('#bentoOzet');
  if (bento) { bento.hidden = true; bento.innerHTML = ''; }
  sonBentoSeri = null;
  sonBentoVerisi = null;
  // Skeleton: sonuç gelene kadar iskelet kartlar görünür.
  const iskelet = document.querySelector('.skeleton-izgara');
  if (iskelet) {
    // 6 kart: ilk 100 ms'de boş ekran yerine yapı gösterilir.
    if (!iskelet.dataset.dolduruldu) {
      iskelet.innerHTML = iskeletKartHtml().repeat(6);
      iskelet.dataset.dolduruldu = '1';
    }
    iskelet.hidden = false;
  }
  iptalDurumunuSifirla();
  // ⚡ Yavaş bağlantı: 10 sn sonra (en az 1 mağaza hazırsa) erken sonuç butonu.
  erkenSonucZamanlayicisiniKur();
  // Site listesi henüz gelmediyse bekle → çipler 61 site ile çizilsin.
  await sitelerHazir;
  $('#siteCipleri').innerHTML = SITE_SIRASI.map(s =>
    `<span class="cip" id="cip-${s}"><span class="nokta"></span>${SITE_ADLARI[s]}</span>`).join('');

  try {
    // "Fiyatları Bul" / form araması her zaman güncel tarama başlatır; geçmiş önbellek
    // sonucunu kullanıcıya tekrar sunmaz. (SWR akışı API katmanında korunur.)
    const govde = BASKI_ORTAM.market && BASKI_ORTAM.market !== 'tr'
      ? { url, taze: true, market: BASKI_ORTAM.market }
      : { url, taze: true };
    zorlaTaze = false;
    const res = await fetch('/api/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    });
    const data = await guvenliJson(res);
    if (!res.ok) throw new Error(data.hata || 'İstek başarısız');
    aktifIs = data.isId;
    try {
      if (window.gtag) {
        window.gtag('event', 'urun_arama', {
          tur: /^https?:/i.test(url) ? 'link' : 'metin',
          sorgu: String(url || '').slice(0, 100),
        });
      }
    } catch { }
    // F5 / sayfa yenilemede eski aramaya otomatik dönülmez (geçmiş listesi ayrıca tutulur).
    try { localStorage.removeItem('son_arama'); } catch { }

    // ⚡ SWR / ANLIK SONUÇ (2026-10-29, 24 saate çıkarıldı 2026-10-30): ürün önbellekte
    // varsa sonuç POST yanıtıyla HEMEN gelir (≈0,2 sn) → poll beklemeden çizilir.
    // `onbellekSonuc` yeni sözleşme; `sonuc` geriye dönük uyumluluk için korunur.
    const onbellekSonuc = data.onbellekSonuc || data.sonuc;
    if ((data.anlik || data.stale) && onbellekSonuc) {
      anlikMod = true;
      anlikSurum = data.surum || 1;
      sonSonuc = onbellekSonuc;
      $('#durumAlani').hidden = true;
      zamanlaCiz(() => {
        // 2026-11-12: önbellekten gelen sonuçta mührün "X dk önce" demesi için
        // sunucunun yaş metni iletilir (bayat veri şüphesini kapatır).
        sonucGoster(onbellekSonuc, { kaydir: true, yasMetni: data.yasMetni || null });
        anlikNotuGuncelle({
          tazeleniyor: true,
          yasMetni: data.yasMetni,
          tazelemeHatasi: null,
          tazelemeBitti: false,
        });
      });
    }

    karsilastirmaIzle(data.isId);
  } catch (err) {
    hataGoster(err.message);
  }
});

/* ================= 🛡️ Rehberlik eden hata & boş durum (2026-11-12) =================
 *
 * Eski davranış: düz kırmızı kutu + ham hata metni. Kullanıcı ne yapacağını
 * bilmiyordu ve siteden ayrılıyordu.
 * Yeni davranış: ikon + başlık + "ne yapmalı" açıklaması + TEK TIKLA çalışan
 * gerçek ürün linkleri. Örnek linkler canlı doğrulanmış ürünlere gider.
 */
const REHBER_ORNEK_URUNLER = [
  { ad: 'Porima PETG Filament', url: 'https://porima3d.com/products/porima-petg-filament' },
  { ad: 'Anycubic UV Reçine', url: 'https://porima3d.com/products/anycubic-standart-recine' },
  { ad: 'Bambu Lab P1S 3D Yazıcı', url: 'https://3dcim.com/bambu-lab-p1s-719' },
  { ad: 'eSun PLA+ (Ürün Adıyla Ara)', url: 'eSun PLA+ Siyah 1kg' },
];

/**
 * Kullanıcıyı azarlamayan, ne yapacağını anlatan ve örnek link sunan rehber hata.
 * @param {string} mesaj sunucudan/istemciden gelen ham mesaj
 * @param {'kategori'|'gecersiz'|'ag'|'genel'} [tur='genel'] açık tür ipucu
 */
function hataGoster(mesaj, tur = 'genel') {
  $('#araBtn').disabled = false;
  $('#araBtn').textContent = MOD_BUTON[aramaModu] || 'Fiyatları Bul';
  $('#durumAlani').hidden = true;
  // İskeletleri temizle (hata durumunda boş iskelet kalmasın).
  const iskelet = document.querySelector('.skeleton-izgara');
  if (iskelet) iskelet.hidden = true;
  document.querySelectorAll('#kartlar > .skeleton-canli').forEach(el => el.remove());
  sifirdanTaraButonunuGoster(false);
  iptalDurumunuSifirla();
  erkenSonucButonunuKaldir();

  const kutu = $('#hata');
  if (!kutu) return;

  // Tür sezimi: açık tür verilmediyse mesaj metninden çıkar.
  // ÖNEMLİ: Ürün adıyla aramada ("eSun PLA+") mesaj "ürün linki" sözcüğünü
  // içerse bile kategori linki hatası GÖSTERİLMEZ; yalnızca girdi gerçekten URL ise
  // `kategori` rehberi açılır.
  const kucuk = String(mesaj || '').toLocaleLowerCase('tr-TR');
  const girdiLinkMi = linkGibiMi($('#urunUrl')?.value || '');
  let tip = tur;
  if (tip === 'genel') {
    if (girdiLinkMi && /kategori|desteklenmiyor|ürün linki|urun linki|ürün sayfas|koleksiyon/.test(kucuk)) tip = 'kategori';
    else if (!girdiLinkMi && /bulunamadı|bulunamadi/.test(kucuk)) tip = 'urun_bulunamadi';
    else if (/bağlantı|baglanti|network|fetch|internet|zaman aşımı|ulaşılamadı/.test(kucuk)) tip = 'ag';
  }

  const REHBER = {
    kategori: {
      ikon: '🔍',
      baslik: 'Doğrudan Ürün Linki Gerekiyor',
      aciklama: 'Bu bir kategori, anasayfa veya arama sayfası bağlantısı gibi görünüyor. '
        + '61 mağazada anlık fiyat karşılaştırabilmemiz için lütfen ürünün kendi detay '
        + 'sayfasının linkini yapıştırın. Aşağıdaki örneklerden biriyle hemen deneyebilirsiniz.',
    },
    urun_bulunamadi: {
      ikon: '🔎',
      baslik: 'Ürün Adıyla Eşleşme Bulunamadı',
      aciklama: mesaj || 'Bu ürün adıyla eşleşen mağaza kaydı bulunamadı. Marka ve modeli biraz '
        + 'daha net yazarak (ör. "Porima PLA", "eSun PLA+ Siyah 1kg") tekrar deneyin.',
    },
    gecersiz: {
      ikon: '🔍',
      baslik: 'Ürün Bağlantısı Doğrulanamadı',
      aciklama: 'Bu bağlantıyı çözümleyemedik. Linkin ürün sayfasına ait olduğundan emin olun '
        + 'ya da ürün adını yazarak arama yapın.',
    },
    ag: {
      ikon: '📡',
      baslik: 'İnternet Bağlantısı Hatası',
      aciklama: 'Mağazalarla bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar '
        + 'deneyin. Bağlantı düzelince arama kaldığı yerden devam eder.',
    },
    genel: {
      ikon: '🧭',
      baslik: 'Arama Tamamlanamadı',
      aciklama: mesaj || 'Beklenmeyen bir durum oluştu. Tekrar deneyebilir veya örnek '
        + 'linklerden biriyle devam edebilirsiniz.',
    },
  };
  const r = REHBER[tip] || REHBER.genel;

  const orneklerHtml = REHBER_ORNEK_URUNLER.map(o => `
    <button type="button" class="rehber-ornek-btn" data-ornek-url="${esc(o.url)}">
      💡 ${esc(o.ad)} ➔
    </button>
  `).join('');

  kutu.innerHTML = `
    <div class="rehber-hata-icerik">
      <div class="rehber-hata-ikon" aria-hidden="true">${r.ikon}</div>
      <div class="rehber-hata-metinler">
        <div class="rehber-hata-baslik">${esc(r.baslik)}</div>
        <div class="rehber-hata-aciklama">${esc(r.aciklama)}</div>
        <div class="rehber-ornekler">
          <span class="rehber-ornek-etiket">Örnek linkle dene:</span>
          ${orneklerHtml}
        </div>
      </div>
    </div>`;
  kutu.hidden = false;

  // Örnek linke tıklayınca input'u doldur ve aramayı başlat (tek tık).
  kutu.querySelectorAll('.rehber-ornek-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = btn.dataset.ornekUrl;
      if (!u) return;
      const input = $('#urunUrl');
      if (input) input.value = u;
      kutu.hidden = true;
      const form = $('#karsilastirForm');
      if (form) {
        if (form.requestSubmit) form.requestSubmit();
        else $('#araBtn')?.click();
      }
    });
  });
}

// ---- İptal (2026-10-27) ----
// Sunucu kalan siteleri atlar; o ana kadar bulunan ürünler korunur ve gösterilir.
let iptalEdiliyor = false;

function iptalDurumunuSifirla() {
  iptalEdiliyor = false;
  const btn = $('#iptalBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = DIL_KOPYA_YEREL.iptal;
}

async function karsilastirmayiIptalEt() {
  if (!aktifIs || iptalEdiliyor) return;
  iptalEdiliyor = true;
  const btn = $('#iptalBtn');
  if (btn) { btn.disabled = true; btn.textContent = DIL_KOPYA_YEREL.iptalEdiliyor; }
  try {
    await fetch('/api/compare/' + aktifIs + '/iptal', { method: 'POST' });
  } catch { /* poll zaten durumu yakalar */ }
  // Çiplerde "çalışıyor" görünenleri hemen iptal göster
  document.querySelectorAll('#siteCipleri .cip.calisiyor').forEach(el => {
    el.classList.remove('calisiyor');
    el.classList.add('iptal');
  });
  // Ekranda kısmi sonuç varsa kullanıcıya bilgi ver
  const not = $('#sonAramaNotu');
  if (not) {
    notMetniAyarla(DIL_KOPYA_YEREL.iptalNotu);
    not.hidden = false;
    sifirdanTaraButonunuGoster(false);
  }
}

let lastAppFingerprint = '';
let appRenderFrame = null;

/* ================= ⚡ Yavaş bağlantı kurtarması (2026-11-12) =================
 *
 * Sorun: tek bir mağaza adaptörü takıldığında tarama dakikalarca sürebiliyor,
 * kullanıcı ekranda kilitleniyordu.
 * Çözüm: tarama 10 sn'yi geçtiğinde ve en az 1 mağaza teklif döndürdüğünde
 * "Kalanı beklemeden bulunan sonuçları göster (N Mağaza Hazır)" butonu.
 * Buton `karsilastirmayiIptalEt()` çağırır → sunucu kalan siteleri atlar,
 * mevcut teklifler sonuç alanına dökülür (mevcut iptal akışı, yeni uç yok).
 */
const ERKEN_SONUC_MS = 10000;
let erkenSonucTimer = null;

/** Oluşturulmuş erken sonuç butonunu kaldırır ve zamanlayıcıyı temizler. */
function erkenSonucButonunuKaldir() {
  if (erkenSonucTimer) { clearTimeout(erkenSonucTimer); erkenSonucTimer = null; }
  const mevcut = document.getElementById('erkenSonucBtn');
  if (mevcut) mevcut.remove();
}

/** 10 sn sonra butonu (koşullar oluştuysa) yerleştirir. */
function erkenSonucZamanlayicisiniKur() {
  erkenSonucButonunuKaldir();
  erkenSonucTimer = setTimeout(() => {
    erkenSonucTimer = null;
    const durumAlani = $('#durumAlani');
    if (!durumAlani || durumAlani.hidden) return;
    if (document.getElementById('erkenSonucBtn')) return;

    // "Mağaza hazır" = teklif döndürmüş mağaza sayısı (çip sınıfı: bulundu).
    const hazir = document.querySelectorAll('#siteCipleri .cip.bulundu').length;
    if (hazir < 1) return;

    const buton = document.createElement('button');
    buton.type = 'button';
    buton.id = 'erkenSonucBtn';
    buton.className = 'erken-sonuc-btn';
    buton.textContent = CANLI_YEREL.erkenSonucBtn(hazir);
    buton.addEventListener('click', () => {
      buton.disabled = true;
      buton.textContent = CANLI_YEREL.erkenSonucHazirlaniyor;
      karsilastirmayiIptalEt();
    });
    const baslikSatiri = durumAlani.querySelector('.durum-baslik-satiri');
    (baslikSatiri || durumAlani).appendChild(buton);
  }, ERKEN_SONUC_MS);
}

/* ---- 📡 Ağ durumu bildirimleri (offline / online) ---- */
window.addEventListener('offline', () => {
  toastGoster('📡 İnternet bağlantınız koptu. Bağlantı bekleniyor…', 'hata');
});
window.addEventListener('online', () => {
  toastGoster('✓ İnternet bağlantısı yeniden sağlandı.', 'basarili');
});

/* ================= 📱 Mobil klavye & odak ergonomisi (2026-11-12) =================
 *
 * Sorun: mobilde arama kutusuna dokununca sanal klavye açılıyor; form ekranın
 * üstünde kalıyor ve "Fiyatları Bul" butonu klavyenin ARKASINDA kalıyordu.
 *
 * Çözüm:
 *  - `interactive-widget=resizes-content` (index.html) görünür alanı klavyeye
 *    göre küçültür → buton klavyenin üstünde kalır.
 *  - Odaklanınca formu görünür alanın ortasına kaydırırız (klavye animasyonu
 *    ~250 ms sürdüğü için gecikmeli).
 *  - `visualViewport.resize` klavye açılıp kapandıkça butonun görünür kalmasını
 *    garanti eder (iOS Safari `innerHeight`'ı güncellemez).
 *  - Masaüstünde hiç çalışmaz; reduced-motion tercihinde animasyonsuz kaydırır.
 */
function mobilKlavyeErgonomisiAyarla() {
  const urunInput = document.getElementById('urunUrl');
  const form = document.getElementById('karsilastirForm');
  if (!urunInput || !form) return;

  const mobilMi = () => window.innerWidth <= 768;
  const kaydirmaDavranisi = () => (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  );

  urunInput.addEventListener('focus', () => {
    if (!mobilMi()) return;
    // Klavye açılma animasyonu bitmeden ölçüm yanlış olur → kısa gecikme.
    setTimeout(() => {
      if (document.activeElement !== urunInput) return;
      form.scrollIntoView({ behavior: kaydirmaDavranisi(), block: 'center' });
    }, 250);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (!mobilMi()) return;
      if (document.activeElement !== urunInput) return;
      // Klavye açıkken buton görünür alanın dışına taştıysa nazikçe getir.
      const btn = document.getElementById('araBtn');
      if (!btn) return;
      const kutu = btn.getBoundingClientRect();
      const gorunurAlt = window.visualViewport.height;
      if (kutu.bottom > gorunurAlt || kutu.top < 0) {
        form.scrollIntoView({ behavior: kaydirmaDavranisi(), block: 'nearest' });
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mobilKlavyeErgonomisiAyarla);
} else {
  mobilKlavyeErgonomisiAyarla();
}


/* ---- Anlık sonuç durumu (2026-10-29) ---- */
let anlikMod = false;      // mevcut iş bir snapshot tazelemesi mi
let anlikSurum = 0;        // sunucudaki sürüm sayacı (her yeni fiyatta artar)

/**
 * Durum çubuğu metnini (butonu silmeden) günceller.
 * Varsayılan olarak textContent kullanır: hata mesajları uzak sitelerden
 * gelebilir, HTML olarak yorumlanmamalıdır (XSS savunması).
 */
function notMetniAyarla(metin) {
  const el = $('#sonAramaNotuMetin');
  if (el) el.textContent = metin;
  else {
    const not = $('#sonAramaNotu');
    if (not) not.textContent = metin;
  }
}

/** Yalnızca kod içinde üretilen güvenli HTML için (ör. geri yükleme notu). */
function notMetniHtmlAyarla(html) {
  const el = $('#sonAramaNotuMetin');
  if (el) el.innerHTML = html;
  else {
    const not = $('#sonAramaNotu');
    if (not) not.innerHTML = html;
  }
}

/** "↻ Sıfırdan Tara" butonunu göster/gizle. */
function sifirdanTaraButonunuGoster(goster) {
  const btn = $('#sifirdanTaraBtn');
  if (btn) btn.hidden = !goster;
}

/**
 * "12 dk önce tarandı · güncelleniyor…" bilgi satırını yönetir.
 *
 * Dürüstlük: eski sonuç gösterilirken bunun ESKİ olduğu ve tazelendiği açıkça yazar.
 * Tazeleme başarısız olursa "güncellenemedi" denir; bayat veri "güncel" gibi sunulmaz.
 */
function anlikNotuGuncelle(durum = {}) {
  const not = $('#sonAramaNotu');
  if (!not) return;
  const parcalar = [];

  if (durum.tazeleniyor) {
    const sayacNot = Number(durum.bitenSite) > 0 && SITE_SIRASI.length > 0
      ? ` (${Math.min(Number(durum.bitenSite), SITE_SIRASI.length)}/${SITE_SIRASI.length})`
      : '';
    parcalar.push(CANLI_YEREL.tazeSrw(durum.yasMetni, sayacNot));
  } else if (durum.tazelemeHatasi) {
    parcalar.push(CANLI_YEREL.tazeHata(String(durum.tazelemeHatasi).slice(0, 70)));
  } else if (durum.tazelemeBitti && durum.fark) {
    const d = durum.fark;
    const degisen = (d.degisen || []).length;
    const yeniSite = (d.yeni || []).length;
    const kaybolan = (d.kaybolan || []).length;
    if (degisen || yeniSite) {
      const ornek = (d.degisen || []).slice(0, 2)
        .map(x => `${x.siteName} ${tl(x.eski)} → ${tl(x.yeni)}`).join(', ');
      parcalar.push(CANLI_YEREL.tazeGuncellendi(degisen + yeniSite, ornek, yeniSite, kaybolan));
      // Fiyatı düşen kartlar yeşil parlar (SWR canlı güncelleme görünürlüğü).
      fiyatDegisenKartlariParlat(d.degisen || []);
    } else if (kaybolan) {
      parcalar.push(CANLI_YEREL.tazeKaybolan(kaybolan));
    } else {
      // Hiçbir fiyat değişmediyse bunu AÇIKÇA söyle: kullanıcı "güncel mi?" diye düşünmesin.
      parcalar.push(CANLI_YEREL.tazeDogrulandi);
    }
  } else if (durum.anlik) {
    parcalar.push(CANLI_YEREL.tazeAnlik(durum.yasMetni));
  }

  if (!parcalar.length) {
    not.hidden = true;
    notMetniAyarla('');
    sifirdanTaraButonunuGoster(false);
    return;
  }
  notMetniAyarla(parcalar.join(' '));
  not.hidden = false;
  not.classList.toggle('anlik-not', !!durum.tazeleniyor);
  // Snapshot kaynaklı her durumda kullanıcı önbelleği atlayıp tam tarama isteyebilir.
  sifirdanTaraButonunuGoster(!!(durum.tazeleniyor || durum.tazelemeBitti
    || durum.tazelemeHatasi || durum.anlik));
}

/** "↻ Sıfırdan Tara": önbelleği yok sayarak canlı tam tarama başlatır. */
function sifirdanTara() {
  if (!$('#urunUrl').value.trim()) return;
  zorlaTaze = true;
  const form = $('#karsilastirForm');
  if (form.requestSubmit) form.requestSubmit();
  else $('#araBtn').click();
}

$('#sifirdanTaraBtn')?.addEventListener('click', sifirdanTara);

/**
 * SWR canlı güncelleme: fiyatı değişen mağaza kartlarına kısa süreli parlama sınıfı ekler.
 * Kart DOM'u `data-site` ile eşleşir (2026-10-30).
 */
function fiyatDegisenKartlariParlat(degisenler) {
  if (!Array.isArray(degisenler) || !degisenler.length) return;
  const fiyatlar = new Map(degisenler.map(d => [d.site, Number(d.fark)]));
  document.querySelectorAll('#kartlar .urun-karti').forEach(kart => {
    const fark = fiyatlar.get(kart.dataset.site);
    if (fark === undefined) return;
    kart.classList.remove('fiyat-guncellendi', 'fiyat-dustu');
    // Yeniden eklemek için reflow (animasyon tekrar oynasın)
    void kart.offsetWidth;
    kart.classList.add('fiyat-guncellendi');
    // Yalnızca fiyatı DÜŞEN kart yeşil parlar; artışta nötr vurgu kalır.
    if (fark < 0) kart.classList.add('fiyat-dustu');
    setTimeout(() => kart.classList.remove('fiyat-guncellendi', 'fiyat-dustu'), 3600);
  });
}

/**
 * Snapshot sonucu ile tazeleme sırasında gelen KISMİ sonuçları birleştirir.
 *
 * Amaç: tazeleme sürerken kartlar canlı güncellensin ama HİÇBİR kart kaybolmasın.
 * Yalnızca yeniden okunan siteler değiştirilir; okunmayanlar eski (snapshot) hâliyle
 * kalır. `en ucuz` etiketi birleşik liste üzerinden yeniden hesaplanır.
 */
function anlikBirlestir(eskiSonuc, partialResults, kaynak) {
  if (!eskiSonuc || !Array.isArray(eskiSonuc.sonuclar)) return null;
  const guncel = new Map();
  for (const r of partialResults || []) {
    if (r && r.site) guncel.set(r.site, r);
  }
  const sonuclar = eskiSonuc.sonuclar.map(r => guncel.get(r.site) || r);
  const mevcutSiteler = new Set(sonuclar.map(r => r.site));
  for (const [site, r] of guncel) if (!mevcutSiteler.has(site)) sonuclar.push(r);

  // En ucuz etiketini birleşik listede yeniden hesapla (fiyat/sıralama mantığı aynı)
  const uygun = sonuclar.filter(r => r.status === 'found' && r.product && r.renkAyni !== false
    && r.product.inStock !== false && r.product.pricing?.toplam != null);
  let enUcuz = null;
  for (const r of sonuclar) if (r.product) r.enUcuz = false;
  for (const r of uygun) {
    if (!enUcuz || r.product.pricing.toplam < enUcuz.product.pricing.toplam) enUcuz = r;
  }
  if (enUcuz) enUcuz.enUcuz = true;

  return {
    ...eskiSonuc,
    kaynak: kaynak || eskiSonuc.kaynak,
    sonuclar,
    ozet: {
      ...(eskiSonuc.ozet || {}),
      enUcuzSite: enUcuz?.siteName || eskiSonuc.ozet?.enUcuzSite || null,
      enUcuzFiyat: enUcuz?.product?.pricing?.toplam ?? eskiSonuc.ozet?.enUcuzFiyat ?? null,
    },
    isLive: true,
    anlik: true,
  };
}

/**
 * Sonucu bir sonraki karede çizer. requestAnimationFrame arka plan sekmesinde
 * HİÇ tetiklenmez (2026-10-27: kullanıcı başka sekmeye geçince sonuç ekrana
 * gelmiyordu) — bu yüzden kısa bir setTimeout yedeğiyle yarıştırılır.
 */
function zamanlaCiz(fn) {
  let calisti = false;
  const calistir = () => {
    if (calisti) return;
    calisti = true;
    try { fn(); } catch (e) { console.error('[render]', e); }
  };
  if (appRenderFrame) cancelAnimationFrame(appRenderFrame);
  appRenderFrame = requestAnimationFrame(calistir);
  setTimeout(() => { if (!calisti) calistir(); }, 120);
}

/**
 * Tek bir karşılaştırma işi verisini ekrana uygular (SSE ve polling ORTAK kullanır).
 * @returns {'devam'|'bitti'} 'devam' → izlemeye devam, 'bitti' → akışı kapat
 */
function karsilastirmaIsle(job) {
  // 🗂️ Ürün adı araması: kaynağın katalogdan mı canlı aramadan mı geldiğini göster.
  const fazEl = $('#katalogFazNotu');
  if (fazEl) {
    let metin = '';
    if (job.faz === 'cozum') {
      metin = job.kaynakKatmani === 'katalog'
        ? DIL_KOPYA_YEREL.fazKatalog
        : DIL_KOPYA_YEREL.fazAra;
    } else if (job.faz === 'tarama') {
      metin = DIL_KOPYA_YEREL.fazTara;
    }
    fazEl.textContent = metin;
    fazEl.hidden = !metin;
  }
  // ---- Anlık sonuç tazelemesi (2026-10-29) ----
  // İş "done" olsa da `tazeleniyor: true` ise izlemeye devam: sürüm değiştikçe
  // kartlar canlı güncellenir.
  if (job.mod === 'tazeleme') {
    anlikMod = true;
    // Eski sonuç ZATEN ekranda; arka plan tazelemesi kullanıcıyı kilitlememeli.
    // (Önceden buton tüm tazeleme boyunca "Aranıyor…" kapalı kalıyordu — 2026-10-29)
    $('#araBtn').disabled = false;
    $('#araBtn').textContent = MOD_BUTON[aramaModu] || 'Fiyatları Bul';

    // 1) Tazeleme sürüyor: kısmi sonuçları snapshot ile BİRLEŞTİRİP canlı göster.
    // Not: Ürün adıyla aramada POST aşamasında `#durumAlani` açılmış olabilir;
    // eski sonuç ekrana basılırken `keepDurum: false` ile tarama kutusu gizlenir,
    // canlı ilerleme `#sonAramaNotu` üzerinden gösterilir (`68/68` kutusu takılı kalmaz).
    if (job.tazeleniyor) {
      const durumEl = $('#durumAlani');
      if (durumEl && !durumEl.hidden && job.result) durumEl.hidden = true;
      const bitenSite = Object.values(job.progress || {})
        .filter(p => p && p.status && p.status !== 'running').length;
      anlikNotuGuncelle({ tazeleniyor: true, yasMetni: job.yasMetni, bitenSite });
      const surum = job.surum || 0;
      if (surum !== anlikSurum) {
        anlikSurum = surum;
        const birlestirilmis = anlikBirlestir(job.result, job.partialResults, job.kaynak);
        if (birlestirilmis) {
          sonSonuc = birlestirilmis;
          zamanlaCiz(() => {
            sonucGoster(birlestirilmis, { keepDurum: true, kaydir: false, canli: true, yasMetni: job.yasMetni || null });
            appRenderFrame = null;
            anlikNotuGuncelle({ tazeleniyor: true, yasMetni: job.yasMetni, bitenSite });
          });
        }
      }
      return 'devam';
    }

    // 2) Tazeleme bitti (ya da durduruldu/hata verdi): son hâli çiz ve dur.
    $('#araBtn').disabled = false;
    $('#araBtn').textContent = MOD_BUTON[aramaModu] || 'Fiyatları Bul';
    iptalDurumunuSifirla();
    anlikMod = false;

    if (job.result && job.result.kaynak) {
      const durumEl = $('#durumAlani');
      if (durumEl && !durumEl.hidden) durumEl.hidden = true;
      sonSonuc = job.result;
      zamanlaCiz(() => {
        // Tazeleme bittiyse veri CANLI → mühür "az önce"; bitmediyse (hata/
        // durduruldu) bayat yaş korunur (2026-11-12).
        sonucGoster(job.result, {
          keepDurum: true,
          kaydir: false,
          taze: !!job.tazelemeBitti,
          yasMetni: job.tazelemeBitti ? null : (job.yasMetni || null),
        });
        appRenderFrame = null;
        anlikNotuGuncelle({
          tazelemeBitti: !!job.tazelemeBitti,
          tazelemeHatasi: job.tazelemeHatasi,
          fark: job.tazelemeFarki,
          anlik: true,
          yasMetni: job.tazelemeBitti ? null : job.yasMetni,
        });
      });
      cipleriGuncelle(isProgressFromResult(job.result));
      gecmisiYukle();
    } else if (job.tazelemeHatasi) {
      anlikNotuGuncelle({ tazelemeHatasi: job.tazelemeHatasi, anlik: true, yasMetni: job.yasMetni });
    } else {
      hataGoster(job.error || 'Karşılaştırma sonucu alınamadı.');
    }
    return 'bitti';
  }

  if (job.status === 'running') {
    cipleriGuncelle(job.progress || {});

    // ⚡ Fast-Path: yalnızca yeni mağaza/fiyat geldiğinde, kaydırmayı kilitlemeden
    const currentFingerprint = (job.partialResults || []).map(x => `${x.site}:${x.product?.pricing?.toplam}`).join('|');
    const hasNewData = currentFingerprint && currentFingerprint !== lastAppFingerprint;

    if (Array.isArray(job.partialResults) && job.partialResults.length > 0 && job.kaynak && hasNewData) {
      lastAppFingerprint = currentFingerprint;
      const liveResult = {
        kaynak: job.kaynak,
        sonuclar: job.partialResults,
        ozet: {
          toplamSureMs: job.sureMs,
          harcananIstek: job.partialResults.length,
          bulunanSiteSayisi: job.partialResults.length,
          enUcuzSite: job.partialResults.find(x => x.enUcuz)?.siteName || '',
          enUcuzFiyat: job.partialResults.find(x => x.enUcuz)?.product?.pricing?.toplam || 0,
        },
        isLive: true,
      };
      sonSonuc = liveResult;

      // Kalan siteler: iskelet kart sayısı (bulunan ürün sayısı değil, ilerleme).
      const islenen = Object.values(job.progress || {})
        .filter(p => p && p.status && p.status !== 'running').length;
      const kalanSite = Math.max(0, SITE_SIRASI.length - islenen);

      zamanlaCiz(() => {
        sonucGoster(liveResult, { keepDurum: true, kaydir: false, canli: true, kalanSite });
        appRenderFrame = null;
      });
    }
    return 'devam';
  }

  $('#araBtn').disabled = false;
  $('#araBtn').textContent = MOD_BUTON[aramaModu] || 'Fiyatları Bul';
  iptalDurumunuSifirla();
  if (job.status === 'error') { hataGoster(job.error || 'Tarama hatası'); return 'bitti'; }
  if (job.status === 'interrupted') {
    hataGoster(job.error || 'Sunucu yeniden başlatıldı; iş yarıda kaldı. Lütfen tekrar deneyin.');
    return 'bitti';
  }
  if (!job.result || !job.result.kaynak) {
    hataGoster(job.error || 'Karşılaştırma sonucu alınamadı veya eksik geldi. Lütfen tekrar deneyin.');
    return 'bitti';
  }
  cipleriGuncelle(isProgressFromResult(job.result));
  sonSonuc = job.result;
  if (fazEl) { fazEl.hidden = true; fazEl.textContent = ''; }
  // 🗂️ Kaynak katalogdan geldiyse ne zaman çekildiğini AÇIKÇA yaz (bayat veri şüphesi kalmasın).
  if (job.kaynakKatmani === 'katalog' && job.katalogYasMs != null) {
    const dk = Math.max(0, Math.round(Number(job.katalogYasMs) / 60000));
    notMetniAyarla(`🗂️ Ürün kaynağı ${dk < 1 ? 'az önce' : dk + ' dk önce'} yenilenen katalog indeksinden bulundu. `
      + 'Aşağıdaki mağaza fiyatları canlı tarandı.');
    const bilgi = $('#sonAramaNotu');
    if (bilgi) bilgi.hidden = false;
  }
  zamanlaCiz(() => {
    // Canlı tarama tamamlandı: mühür "az önce ... canlı doğrulandı" (2026-11-12).
    sonucGoster(job.result, { kaydir: true, taze: true });
    appRenderFrame = null;
    // İptal sonrası kısmi sonuç gösteriliyorsa bunu açıkça belirt
    const iptal = job.iptalEdildi || job.result?.ozet?.iptalEdildi;
    const kalan = job.result?.ozet?.taranmayanSiteSayisi || 0;
    const bilgiNotu = $('#sonAramaNotu');
    if (iptal && bilgiNotu) {
      notMetniAyarla(CANLI_YEREL.iptalKalan(kalan));
      bilgiNotu.hidden = false;
      sifirdanTaraButonunuGoster(false);
    }
  });
  gecmisiYukle();
  return 'bitti';
}

/** Karşılaştırmayı SSE ile canlı izler; akış koparsa polling'e düşer (2026-10-29). */
function karsilastirmaIzle(id) {
  lastAppFingerprint = '';
  if (appRenderFrame) {
    cancelAnimationFrame(appRenderFrame);
    appRenderFrame = null;
  }
  // Aynı anda yalnızca TEK karşılaştırma akışı açık olsun: sayfa yenilenince
  // "son aramayı sürdür" yolu eski işi de açabiliyordu → iki akış, çift çizim.
  for (const kimlik of [...CANLI_AKIS.keys()]) {
    if (kimlik.startsWith('compare_')) canliAkisKapat(kimlik);
  }
  canliIzle(id, { etiket: 'compare', isle: karsilastirmaIsle, yedekPoll: pollIs });
}

/** HTTP polling (SSE yedeği). 750 ms. */
function pollIs(id) {
  lastAppFingerprint = '';
  if (appRenderFrame) {
    cancelAnimationFrame(appRenderFrame);
    appRenderFrame = null;
  }

  const timer = setInterval(async () => {
    try {
      const res = await fetch('/api/compare/' + id);
      const job = await guvenliJson(res);
      if (karsilastirmaIsle(job) === 'bitti') clearInterval(timer);
    } catch (e) {
      clearInterval(timer);
      hataGoster(e.message);
    }
  }, 750);
}


function isProgressFromResult(sonuc) {
  const p = {};
  for (const r of (sonuc?.sonuclar || [])) {
    p[r.site] = {
      site: r.site,
      status: r.status,
      fiyat: r.product?.pricing?.toplam ?? null,
      note: r.reason || '',
    };
  }
  return p;
}

function cipleriGuncelle(progress) {
  let bitti = 0, bulundu = 0;
  for (const s of SITE_SIRASI) {
    const el = document.getElementById('cip-' + s);
    const p = progress[s];
    if (p && p.status && p.status !== 'running') bitti++;
    if (p && p.status === 'found') bulundu++;
    if (!el) continue;
    el.className = 'cip';
    if (!p) continue;
    if (p.status === 'running') { el.classList.add('calisiyor'); el.title = p.note ? magazaDurumNedeniYerellestir(p.note) : CANLI_YEREL.cipAraniyor; }
    else if (p.status === 'found') {
      el.classList.add('bulundu');
      el.title = p.note ? magazaDurumNedeniYerellestir(p.note) : '';
      // Fiyat yoksa "—" yazmayız: farklı renk/model eşleşmelerinde fiyat bilinmez.
      // (Aksi hâlde çip "Bulundu · —" gibi anlamsız görünüyordu — 2026-10-29)
      el.innerHTML = `<span class="nokta"></span>${SITE_ADLARI[s]}`
        + (p.fiyat != null ? ' · ' + tl(p.fiyat) : '');
    } else if (p.status === 'error') { el.classList.add('hata'); el.title = p.note ? magazaDurumNedeniYerellestir(p.note) : CANLI_YEREL.cipHata; }
    else if (p.status === 'iptal') { el.classList.add('iptal'); el.title = p.note ? magazaDurumNedeniYerellestir(p.note) : CANLI_YEREL.cipIptal; }
    else if (p.status === 'not_found') { el.classList.add('bulunamadi'); el.title = p.note ? magazaDurumNedeniYerellestir(p.note) : CANLI_YEREL.cipYok; }
  }
  // İlerleme çubuğu ve sayaç
  const dolgu = document.querySelector('.tarama-dolgu');
  const sayac = document.getElementById('taramaSayac');
  if (dolgu) dolgu.style.width = Math.round(bitti / Math.max(SITE_SIRASI.length, 1) * 100) + '%';
  if (sayac) sayac.textContent = DIL_KOPYA_YEREL.taramaSayac(bitti, SITE_SIRASI.length, bulundu);
}

// ---- Filtreleme Mantığı ----
let seciliFiltre = 'hepsi';

/** Hammadde türü görünen adları (sunucudaki src/baskiMaliyet.js ile aynı). */
const BASKI_HAMMADDE_ADLARI = {
  pla: '🌱 PLA', 'pla+': '💪 PLA+', hyper: '🚀 Hyper',
  petg: '🧪 PETG', abs: '🔥 ABS/ASA', tpu: '🪢 TPU', pva: '💧 PVA', cf: '🖤 CF',
  standart_recine: '🧴 Standart Reçine', suda_yikanabilir: '🚿 Water Washable',
  abs_like: '🧱 ABS-Like', tough: '🛡️ Tough',
};

/**
 * Sonuçtaki 3D ürünlere göre çap ve hammadde filtre çiplerini üretir.
 * Hiç 3D ürün yoksa gruplar boş kalır (filtre barı şişmez).
 */
function baskiFiltreleriniDoldur(sonuc) {
  const capEl = $('#capFiltreleri');
  const hmEl = $('#hammaddeFiltreleri');
  if (!capEl && !hmEl) return;
  const ozet = sonuc?.ozet?.baskiOzet || null;
  const capS = ozet?.capSayac || {};
  const hmS = ozet?.hammaddeSayac || {};
  const secili = seciliFiltre;

  if (capEl) {
    const parcalar = [];
    if ((capS['1.75'] || 0) > 0) {
      parcalar.push(`<button type="button" class="filtre-chip cap-chip" data-filtre="cap:1.75">${esc(CANLI_YEREL.filtreCap175(capS['1.75']))}</button>`);
    }
    if ((capS['2.85'] || 0) > 0) {
      parcalar.push(`<button type="button" class="filtre-chip cap-chip cap-tehlike" data-filtre="cap:2.85">${esc(CANLI_YEREL.filtreCap285(capS['2.85']))}</button>`);
    }
    capEl.innerHTML = parcalar.length
      ? `<span class="filtre-alt-etiket">${esc(CANLI_YEREL.filtreCapEtiket)}</span>${parcalar.join('')}` : '';
  }

  if (hmEl) {
    const parcalar = Object.entries(hmS)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tur, n]) => `<button type="button" class="filtre-chip hm-chip" data-filtre="hm:${esc(tur)}">${esc(hammaddeEtiketiYerellestir(tur, BASKI_HAMMADDE_ADLARI[tur] || tur))} (${n})</button>`);
    if (ozet?.yuksekBirimSayisi > 0) {
      parcalar.push(`<button type="button" class="filtre-chip hm-chip birim-chip" data-filtre="birim_uyari">${esc(CANLI_YEREL.filtreYuksekBirim(ozet.yuksekBirimSayisi))}</button>`);
    }
    hmEl.innerHTML = parcalar.length
      ? `<span class="filtre-alt-etiket">${esc(CANLI_YEREL.filtreHammaddeEtiket)}</span>${parcalar.join('')}` : '';
  }

  // Seçili filtre korunur (canlı güncellemede sıfırlanmasın).
  document.querySelectorAll('.filtre-chip').forEach(c => {
    c.classList.toggle('aktif', c.dataset.filtre === secili);
  });
}

/* ================= 🟢 FOMO — "ŞİMDİ AL" aciliyet kartı (2026-11-08) =================
 *
 * DÜRÜSTLÜK: kart YALNIZCA sunucunun deterministik motoru `SIMDI_AL` dediğinde
 * ve `fomo.aktif === true` ise basılır. Sosyal kanıt satırı yalnızca gerçek
 * `price_history` gözlemlerinden gelir; veri yoksa satır hiç çıkmaz.
 */

/** Sonuçtan zamanlama nesnesini çıkarır (yeni `zamanlama`, eski `ozet.zamanlamaTavsiyesi`). */
function fomoZamanlamasi(sonuc) {
  return sonuc?.zamanlama || sonuc?.ozet?.zamanlamaTavsiyesi || null;
}

/** En ucuz, stokta, aynı renk teklifi (yoksa enUcuz işaretli ilk bulunan). */
function fomoEnUcuzTeklif(sonuc) {
  const liste = (sonuc?.sonuclar || []).filter(r => r.status === 'found' && r.product);
  return liste.find(r => r.enUcuz) || null;
}

/**
 * @param {object} zamanlama sunucu kararı (SIMDI_AL + fomo)
 * @param {object} enUcuzTeklif en ucuz mağaza sonucu
 * @returns {string} HTML (kart basılmayacaksa boş string)
 */
function renderFomoUyarisi(zamanlama, enUcuzTeklif) {
  const f = zamanlama?.fomo;
  if (!f || f.aktif !== true || zamanlama?.karar !== 'SIMDI_AL') return '';

  // Kartta gösterilen fiyat = KULLANICININ ÖDEYECEĞİ güncel fiyat (uydurma yok).
  // Tarihi dip ayrı alanda; ikisi karıştırılmaz.
  const guncel = Number(zamanlama?.metrikler?.guncelFiyat);
  const fiyat = Number.isFinite(guncel) && guncel > 0 ? guncel : Number(f.dipFiyatTL);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return '';
  const tarihiDip = Number(f.dipFiyatTL);
  const dipNotu = Number.isFinite(tarihiDip) && tarihiDip < fiyat - 0.5
    ? ` · tarihi dip ${tl(tarihiDip)}`
    : '';
  const p = enUcuzTeklif?.product;
  const hedef = p?.afiliyeUrl || p?.url || '';
  if (!hedef) return '';

  // Canlı tazelemede en ucuz fiyat değişmişse zamanlama verisi bayatlamıştır:
  // çelişkili iki fiyat göstermemek için kart basılmaz (dürüstlük).
  const teklifFiyat = Number(p?.pricing?.toplam);
  if (Number.isFinite(teklifFiyat) && teklifFiyat > 0 && Math.abs(teklifFiyat - fiyat) / fiyat > 0.005) {
    return '';
  }

  const siteAdi = SITE_ADLARI[enUcuzTeklif.site] || enUcuzTeklif.siteName || enUcuzTeklif.site || '';
  const risk = Number(f.tukenmeRiskiYuzde) || 0;
  const tasarruf = Number(f.tasarrufTL) || 0;
  const gun = Number(zamanlama?.metrikler?.gunSayisi) || 60;
  const sosyal = f.sosyalKanitMetni
    ? `<div class="fomo-sosyal">👥 ${esc(f.sosyalKanitMetni)}</div>`
    : '';

  return `<section class="fomo-kart" role="region" aria-label="Şimdi al fırsatı" data-fomo-risk="${risk}">
    <div class="fomo-ust">
      <span class="fomo-beacon" aria-hidden="true"></span>
      <span class="fomo-canli">CANLI RADAR</span>
      <span class="fomo-rozet">🟢 ŞİMDİ AL — TARİHİ DİP FİYAT SEVİYESİ</span>
    </div>
    <p class="fomo-baslik">🔥 %${risk} İhtimalle: Bu ürün son ${gun} günün en dip seviyesinde (<b>${tl(fiyat)}</b>)${dipNotu}!</p>
    <p class="fomo-detay">Piyasa ortalamasından <b>${tl(tasarruf)}</b> daha ucuz. ${esc(f.sureTahminiMetni || `24 saat içinde fiyat artışı veya tükenme riski %${risk}.`)}</p>
    ${sosyal}
    <a class="fomo-cta" href="${esc(hedef)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(enUcuzTeklif.site || '')}">
      <span class="fomo-cta-metin">${esc(f.ctaMetni || '⚡ Bu Fiyatla Stoklar Bitmeden Al')}</span>
      <span class="fomo-cta-site">${esc(siteAdi)} ➔</span>
    </a>
    <div class="fomo-dipnot">Gerçek fiyat geçmişi (${gun} gün, ${Number(zamanlama?.metrikler?.veriNoktasi) || 0} gözlem) temel alınmıştır.</div>
  </section>`;
}

/** Sonuç HTML'ine FOMO kartını (varsa) en üste ekler. Filtreli görünümde basılmaz. */
function fomoIleBasla(sonuc, htmlGovde, filtre = 'hepsi') {
  if (filtre && filtre !== 'hepsi') return htmlGovde;
  const kart = renderFomoUyarisi(fomoZamanlamasi(sonuc), fomoEnUcuzTeklif(sonuc));
  return kart ? kart + htmlGovde : htmlGovde;
}

function kartlariFiltreleVeCiz(filtre = 'hepsi') {
  seciliFiltre = filtre;
  if (!sonSonuc || !Array.isArray(sonSonuc.sonuclar)) return;

  let liste = [...sonSonuc.sonuclar];

  if (filtre === 'stokta_var') {
    liste = liste.filter(r => r.status === 'found' && r.product?.inStock !== false);
  } else if (filtre === 'stokta_yok') {
    liste = liste.filter(r => r.status === 'found' && r.product?.inStock === false);
  } else if (filtre === 'kargo') {
    liste = liste.filter(r => r.status === 'found' && (
      r.product?.pricing?.kargo?.uygulanir === false
      || r.product?.shipping?.applies === false
      || (r.kargoBedava === true && r.product?.pricing?.kargo?.uygulanir == null)
    ));
  } else if (filtre === 'resmi') {
    liste = liste.filter(r => r.status === 'found' && (r.resmiSatici || ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'teknosa', 'itopya', 'robitshop', 'robotistan', 'direnc', 'samm'].includes(r.site)));
  } else if (filtre === 'taksit') {
    liste = liste.filter(r => r.status === 'found' && (r.vadeFarksizTaksit || (r.product?.pricing?.kampanyaTaksit || []).length > 0));
  } else if (filtre === 'birim_kg') {
    // Sıralama modu: filtre uygulanmaz, kartlar ₺/kg artan sıralanır (2026-11-01).
    // Birim fiyatı hesaplanamayanlar (yazıcı/aksesuar) listenin sonunda kalır.
  } else if (filtre.startsWith('cap:')) {
    // 🖨️ Çap filtresi: '1.75' | '2.85' | 'bilinmiyor'
    const v = filtre.slice(4);
    liste = liste.filter(r => {
      const mm = r.baski?.capMm;
      if (mm == null) return v === 'bilinmiyor';
      return v === '1.75' ? mm < 2 : mm >= 2;
    });
  } else if (filtre.startsWith('hm:')) {
    // 🧪 Hammadde türü filtresi (pla, petg, standart_recine…)
    const tur = filtre.slice(3);
    liste = liste.filter(r => r.baski?.hammadde?.tur === tur);
  } else if (filtre === 'birim_uyari') {
    liste = liste.filter(r => !!r.birimUyari);
  }

  // Sıralama tek kuraldan gelir: stokta olanlar her zaman önce (bkz. stokSirala).
  let sirali = stokSirala(liste);
  // 🧵 "Birim Fiyata Göre (₺/kg En Ucuz)" — gramajdan bağımsız sıralama (2026-11-01).
  if (filtre === 'birim_kg') {
    sirali = [...sirali].sort((a, b) => {
      const av = a.product?.birim?.tlKg;
      const bv = b.product?.birim?.tlKg;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    });
  }

  if (sirali.length === 0) {
    document.getElementById('kartlar').innerHTML = '<div class=\"bulunamadi-karti\" style=\"grid-column: 1 / -1; text-align: center; padding: 24px;\">🔍 Seçilen filtreye uygun ürün bulunamadı.</div>';
  } else {
    document.getElementById('kartlar').innerHTML = fomoIleBasla(
      sonSonuc,
      sirali.map(kartHtml).join(''),
      filtre,
    );
  }
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.filtre-chip');
  if (!chip) return;
  document.querySelectorAll('.filtre-chip').forEach(c => c.classList.remove('aktif'));
  chip.classList.add('aktif');
  kartlariFiltreleVeCiz(chip.dataset.filtre || 'hepsi');
});
// ---- Sonuç gösterimi ----

/* ================= 🧱 Bento özet kartı (2026-11-01) =================
 *
 * Sonuçların en üstünde üç blok:
 *  1) Spotlight: en ucuz mağaza + büyük fiyat + kargo/stok rozetleri + CTA
 *  2) Trend: son 30 günün min/ort/max + mini sparkline (gerçek geçmişten)
 *  3) Dağılım: en ucuz ↔ en pahalı farkı ve kazanç yüzdesi
 *
 * Dürüstlük: geçmiş yoksa trend bloğu "veri birikiyor" der, uydurma çizgi çizmez.
 */

let sonBentoVerisi = null; // sparkline için son hesaplanan bento
let sonBentoSeri = null;   // fiyat geçmişi timeline (varsa)

/** Ürün URL'sinden favicon adresi (yoksa null). */
function faviconUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (!h) return null;
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=64';
  } catch {
    return null;
  }
}

/** Mağaza adı + favicon (+ varsa doğrulanmış partner rozeti). */
function siteAdiHtml(site, siteAdi, url) {
  const fav = faviconUrl(url);
  const harf = String(siteAdi || site || '?').trim().charAt(0).toUpperCase();
  return `<span class="site-favicon" aria-hidden="true">${fav
    ? `<img src="${esc(fav)}" alt="" width="14" height="14" loading="lazy" decoding="async" onerror="this.onerror=null; this.replaceWith(document.createTextNode('${esc(harf)}'))">`
    : esc(harf)}</span><span class="site-adi-metin">${esc(siteAdi || site || '')}</span>${dogrulanmisRozetHtml(site)}`;
}

/** Fiyat dağılımı ve trend verisini sonuçtan çıkarır. */
function bentoVerisiHesapla(sonuc) {
  const bulunan = (sonuc.sonuclar || []).filter(r =>
    r.status === 'found' && r.product && r.renkAyni !== false
    && Number.isFinite(Number(r.product.pricing?.toplam ?? r.product.sellingPrice)));

  const fiyatli = bulunan.map(r => ({
    r,
    fiyat: Number(r.product.pricing?.toplam ?? r.product.sellingPrice),
    stokta: r.product.inStock !== false,
  }));

  const uygun = fiyatli.filter(x => x.stokta);
  const havuz = uygun.length ? uygun : fiyatli;
  const enUcuz = havuz.length ? havuz.reduce((a, b) => (b.fiyat < a.fiyat ? b : a)) : null;
  const enPahali = havuz.length ? havuz.reduce((a, b) => (b.fiyat > a.fiyat ? b : a)) : null;

  const fark = enUcuz && enPahali ? Math.max(0, enPahali.fiyat - enUcuz.fiyat) : 0;
  const yuzde = enPahali && enPahali.fiyat > 0 ? Math.round((fark / enPahali.fiyat) * 1000) / 10 : null;

  const fa = sonuc.ozet?.fiyatAnalizi || sonuc.ozet?.fiyatZekasi || null;
  const gecmisVar = fa?.bulundu === true || Number(fa?.veriNoktasi) > 0;

  return {
    enUcuz,
    enPahali,
    fark,
    yuzde,
    magazaSayisi: fiyatli.length,
    stoktaSayisi: uygun.length,
    min: Number.isFinite(Number(fa?.minFiyat)) ? Number(fa.minFiyat) : (enUcuz?.fiyat ?? null),
    ort: Number.isFinite(Number(fa?.ortFiyat)) ? Number(fa.ortFiyat) : null,
    max: Number.isFinite(Number(fa?.maxFiyat)) ? Number(fa.maxFiyat) : (enPahali?.fiyat ?? null),
    gecmisVar,
    gun: Number(fa?.ortPencereGun) || 30,
  };
}

/** Bento kartını çizer. Canlı (kısmi) sonuçlarda da çalışır. */
function bentoOzetCiz(sonuc) {
  const alan = $('#bentoOzet');
  if (!alan) return;
  if (!sonuc || !Array.isArray(sonuc.sonuclar) || !sonuc.sonuclar.length) {
    alan.hidden = true;
    return;
  }

  const v = bentoVerisiHesapla(sonuc);
  sonBentoVerisi = v;
  if (!v.enUcuz) { alan.hidden = true; return; }
  alan.hidden = false;

  const { enUcuz, enPahali, fark, yuzde, min, ort, max, gecmisVar, gun } = v;
  const p = enUcuz.r.product;
  const pr = p.pricing || {};
  const kargoBedava = pr.kargo?.uygulanir === false
    || p.shipping?.applies === false
    || (enUcuz.r.kargoBedava === true && pr.kargo?.uygulanir == null);
  const kargoNotu = kargoBedava
    ? CANLI_YEREL.bentoKargoUcretsiz
    : (pr.kargo?.uygulanir === true && Number(pr.kargo?.ucret) > 0
      ? CANLI_YEREL.bentoKargoUcretli(tl(pr.kargo.ucret))
      : (Number(pr.kargo?.freeOver) > 0
        ? CANLI_YEREL.bentoKargoEsikli(esc(pr.kargo?.aciklama || CANLI_YEREL.bentoKargoEsikliVarsayilanAciklama), tl(pr.kargo.freeOver))
        : `<span class="bento-rozet uyari" title="${esc(CANLI_YEREL.bentoKargoBilinmiyorTitle)}">${CANLI_YEREL.bentoKargoBilinmiyor}</span>`));
  const stokNotu = p.inStock === false
    ? CANLI_YEREL.bentoStokTukendi
    : CANLI_YEREL.bentoStokta;
  const link = p.afiliyeUrl || p.url || '#';
  const siteAdi = enUcuz.r.siteName || SITE_ADLARI[enUcuz.r.site] || enUcuz.r.site;

  const trendBlok = gecmisVar
    ? `<div class="bento-istatistik">
         <div><span class="bento-mini-etiket">${esc(CANLI_YEREL.bentoDip)}</span><b>${tl(min)}</b></div>
         <div><span class="bento-mini-etiket">${esc(CANLI_YEREL.bentoOrt)}</span><b>${tl(ort)}</b></div>
         <div><span class="bento-mini-etiket">${esc(CANLI_YEREL.bentoTepe)}</span><b>${tl(max)}</b></div>
       </div>
       <div class="bento-sparkline-sarmal"><svg id="bentoSparkline" class="bento-sparkline" viewBox="0 0 200 44"
         preserveAspectRatio="none" role="img" aria-label="${esc(CANLI_YEREL.bentoTrendAria(gun))}"></svg></div>
       <div class="bento-alt-metin">${esc(CANLI_YEREL.bentoSonGunGecmis(gun))}</div>`
    : `<div class="bento-bos">${esc(CANLI_YEREL.bentoYetersizTrend)}<br>
         <span class="bento-alt-metin">${esc(CANLI_YEREL.bentoYetersizTrendAlt)}</span></div>`;

  const enUcuzPara = enUcuz?.r?.product?.currency || sonuc?.ozet?.currency || 'TRY';
  const alan_fiyat = tl(enUcuz.fiyat, enUcuzPara);
  alan.innerHTML = `
    <article class="bento-blok bento-spot">
      <div class="bento-etiket">${CANLI_YEREL.bentoEnUcuzUst}</div>
      <div class="bento-site">${siteAdiHtml(enUcuz.r.site, siteAdi, p.url)}</div>
      <div class="bento-fiyat">${alan_fiyat}</div>
      <div class="bento-rozetler">${kargoNotu}${stokNotu}</div>
      <a class="bento-cta" href="${esc(link)}" target="_blank" rel="noopener sponsored"
         data-afiliye-site="${esc(enUcuz.r.site || '')}">${esc(CANLI_YEREL.bentoMagazayaGit)} <span aria-hidden="true">↗</span></a>
    </article>

    <article class="bento-blok bento-trend">
      <div class="bento-etiket">${CANLI_YEREL.bentoFiyatTrendi}</div>
      ${trendBlok}
    </article>

    <article class="bento-blok bento-dagilim">
      <div class="bento-etiket">${CANLI_YEREL.bentoFiyatDagilimi}</div>
      <div class="bento-dagilim-ust">
        <span class="bento-dagilim-etiket">${esc(CANLI_YEREL.bentoEnUcuz)}</span>
        <b class="bento-dagilim-fiyat yesil">${tl(enUcuz.fiyat)}</b>
      </div>
      <div class="bento-dagilim-ust">
        <span class="bento-dagilim-etiket">${esc(CANLI_YEREL.bentoEnPahali)}</span>
        <b class="bento-dagilim-fiyat">${tl(enPahali?.fiyat)}</b>
      </div>
      <div class="bento-bar" aria-hidden="true"><span style="width:${Math.max(6, Math.min(100, 100 - (yuzde || 0)))}%"></span></div>
      <div class="bento-fark">${fark > 0 ? esc(CANLI_YEREL.bentoFarkMetni(tl(fark))) : esc(CANLI_YEREL.bentoTumAyniFiyat)}</div>
      <div class="bento-kazanc">${yuzde != null && yuzde > 0 ? esc(CANLI_YEREL.bentoDahaAzOde(yuzdeStr(yuzde, true))) : esc(CANLI_YEREL.bentoFarkYok)}</div>
      <div class="bento-alt-metin">${esc(CANLI_YEREL.bentoMagazaStok(v.magazaSayisi, v.stoktaSayisi))}</div>
    </article>`;

  if (sonBentoSeri && gecmisVar) {
    try { bentoSparklineCiz(sonBentoSeri); } catch { /* yoksay */ }
  }
}


/** Mini sparkline: gerçek fiyat geçmişi timeline'ından SVG çizgi. */
function bentoSparklineCiz(timeline) {
  const svg = document.getElementById('bentoSparkline');
  if (!svg || !Array.isArray(timeline) || timeline.length < 2) return;
  const degerler = timeline.map(t => Number(t.lowest)).filter(n => Number.isFinite(n));
  if (degerler.length < 2) return;
  const min = Math.min(...degerler);
  const max = Math.max(...degerler);
  const W = 200, H = 44, PAD = 3;
  const n = degerler.length;
  const x = (i) => PAD + (i * (W - PAD * 2)) / (n - 1);
  const y = (v) => (max === min ? H / 2 : PAD + ((max - v) * (H - PAD * 2)) / (max - min));
  const noktalar = degerler.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const cizgi = 'M' + noktalar.join(' L');
  const alan = `${cizgi} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="bentoGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--yesil-parlak)" stop-opacity=".32"/>
        <stop offset="100%" stop-color="var(--yesil-parlak)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${alan}" fill="url(#bentoGrad)"></path>
    <path d="${cizgi}" fill="none" stroke="var(--yesil)" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
    <circle cx="${x(n - 1).toFixed(1)}" cy="${y(degerler[n - 1]).toFixed(1)}" r="2.6" fill="var(--yesil)"></circle>`;
}

/** İskelet kart HTML'i (shimmer).
 *  2026-11-12: gerçek `.urun-karti` ile aynı kutu modeli (resim + 3 metin
 *  çizgisi + fiyat çizgisi) → içerik gelince sayfa zıplamaz (CLS = 0). */
function iskeletKartHtml() {
  return `<div class="skeleton-kart skeleton-canli" aria-hidden="true">
    <div class="skeleton-ust">
      <span class="skeleton-kutu skeleton-resim"></span>
      <div class="skeleton-metin">
        <span class="skeleton-cizgi w-40"></span>
        <span class="skeleton-cizgi w-90"></span>
        <span class="skeleton-cizgi w-60"></span>
      </div>
    </div>
    <span class="skeleton-cizgi fiyat-cizgisi"></span>
    <span class="skeleton-cizgi w-50"></span>
  </div>`;
}

/** Kartlara sıralı (staggered) giriş animasyonu uygular. */
function kartGirisAnimasyonu() {
  const kartlar = document.querySelectorAll('#kartlar > .urun-karti');
  kartlar.forEach((el, i) => {
    el.classList.remove('kart-girisi');
    el.style.animationDelay = Math.min(i * 24, 320) + 'ms';
    // Reflow → animasyon yeniden oynasın.
    void el.offsetWidth;
    el.classList.add('kart-girisi');
  });
}

/** Tarama sürerken kalan siteler için iskelet kartları ekler. */
function canliIskeletleriGuncelle(kalan) {
  const fazla = document.querySelectorAll('#kartlar > .skeleton-canli');
  fazla.forEach(el => el.remove());
  const n = Math.max(0, Math.min(Number(kalan) || 0, 8));
  if (!n) return;
  document.getElementById('kartlar')?.insertAdjacentHTML('beforeend',
    iskeletKartHtml().repeat(n));
}

/* ================= 📦 Tükendi → akıllı alternatifler (2026-11-12) =================
 *
 * Bir ürün tüm mağazalarda tükenmişse veya hiçbir teklif bulunamadıysa ekran
 * ölü kalmasın: canlı borsa vitrininden (vitrinUrunleri) stokta olan en iyi 3
 * ürün kart olarak gösterilir. Veri gerçek vitrinden gelir; uydurma ürün yok.
 *
 * Vitrin henüz yüklenmemişse sessizce atlanır (vitrinYukle zaten çalışıyor).
 */
function tukendiAlternatifleriniEkle({ tamamiTukendi, hicBulunamadi }) {
  const alan = $('#kartlar');
  if (!alan || (!tamamiTukendi && !hicBulunamadi)) return;
  // Aynı sonuç iki kez çizilirse blok tekrar eklenmesin.
  alan.querySelectorAll('.tukendi-alternatif-blok').forEach(el => el.remove());

  const kaynak = (Array.isArray(vitrinUrunleri) ? vitrinUrunleri : [])
    .filter(u => u && u.stokta && Number(u.fiyat) > 0);
  if (!kaynak.length) return;

  const secilen = kaynak.slice(0, 3);
  const baslikMetni = tamamiTukendi
    ? CANLI_YEREL.tukendiAltBaslik
    : CANLI_YEREL.bulunamadiAltBaslik;

  const blok = document.createElement('div');
  blok.className = 'tukendi-alternatif-blok';
  blok.innerHTML = `
    <div class="tukendi-alternatif-baslik">
      <span aria-hidden="true">📦</span>
      <span>${esc(CANLI_YEREL.benzerAlternatifler(baslikMetni))}</span>
    </div>
    <div class="vitrin-grid">${secilen.map(vitrinKartHtml).join('')}</div>`;
  alan.insertAdjacentElement('afterbegin', blok);
}

/* ================= 🎯 Net tasarruf bandı & güvenilirlik mührü (2026-11-12) =================
 *
 * Kullanıcının ilk 0.2 sn'de görmesi gereken üç şey:
 *   1) Kaç TL net tasarruf ettiği (en pahalı vs en ucuz KARŞILAŞTIRILABİLİR teklif),
 *   2) Hangi mağaza en ucuz,
 *   3) Verinin ne kadar önce doğrulandığı (bayat veri şüphesini kapatır).
 *
 * Dürüstlük kuralları:
 *  - Yalnızca stokta + aynı renk + geçerli fiyatlı teklifler karşılaştırılır
 *    (`inStock !== false`, `renkAyni !== false`). Farklı renk "tasarruf" sayılmaz.
 *  - Karşılaştırılabilir en az 2 teklif yoksa bant GİZLİ kalır (uydurma tasarruf yok).
 *  - "Mağazalar arası fark" dili kullanılır: bu bir etiket indirimi değildir.
 *
 * @param {object} sonuc karşılaştırma sonucu
 * @param {{yasMetni?:string|null}} [opts]
 */
/**
 * Mührün göstereceği "veri yaşı" (2026-11-12).
 *
 * SWR/önbellek akışında sunucu `yasMetni` ("1 sa 6 dk önce") gönderir; canlı
 * taramada değer yoktur → mühür "az önce" der. Bu değer modül düzeyinde
 * tutulur çünkü aynı sonuç birden çok kez çizilebiliyor (SWR → tazeleme →
 * final). Her çizimde `null`'a düşüp yanlışlıkla "az önce" demesin.
 */
let muhurYasi = null;

function tasarrufBandiCiz(sonuc, opts = {}) {
  const bant = document.getElementById('tasarrufVurguBanti');
  if (!bant) return;
  const tutarEl = document.getElementById('tasarrufVurguTutar');
  const detayEl = document.getElementById('tasarrufVurguDetay');
  const dogrulamaMetin = document.getElementById('dogrulamaMetin');

  const stokluTeklifler = (sonuc?.sonuclar || [])
    .filter(r => r && r.status === 'found' && r.product
      && r.product.inStock !== false && r.renkAyni !== false)
    .map(r => ({
      fiyat: Number(r.product.pricing?.toplam ?? r.product.sellingPrice),
      site: r.siteName || r.site || 'Mağaza',
    }))
    .filter(x => Number.isFinite(x.fiyat) && x.fiyat > 0)
    .sort((a, b) => a.fiyat - b.fiyat);

  if (stokluTeklifler.length < 2) {
    // Tek teklif varsa "tasarruf" iddiası kurulamaz → bant gizli.
    bant.hidden = true;
    return;
  }

  const enUcuz = stokluTeklifler[0];
  const enPahali = stokluTeklifler[stokluTeklifler.length - 1];
  const netFark = enPahali.fiyat - enUcuz.fiyat;

  if (netFark > 0.009) {
    const yuzdeKazanc = Math.round((netFark / enPahali.fiyat) * 100);
    if (tutarEl) {
      tutarEl.innerHTML = CANLI_YEREL.tasarrufTutar(tl(netFark));
    }
    if (detayEl) {
      detayEl.textContent = CANLI_YEREL.tasarrufDetay(tl(enUcuz.fiyat), enUcuz.site, tl(enPahali.fiyat), yuzdeStr(yuzdeKazanc));
    }
  } else {
    if (tutarEl) tutarEl.textContent = CANLI_YEREL.ayniDipFiyat(tl(enUcuz.fiyat));
    if (detayEl) {
      detayEl.textContent = CANLI_YEREL.ayniDipDetay(stokluTeklifler.length);
    }
  }
  bant.hidden = false;

  // 🕒 Güvenilirlik mührü: önbellekten gelen aramada "X dk önce", canlıda "az önce".
  // İptal/kısmi taramada "69 mağazadan canlı doğrulandı" yerine gerçek taranan sayıyı göster.
  if (dogrulamaMetin) {
    if (opts.yasMetni) muhurYasi = opts.yasMetni;
    else if (opts.taze === true) muhurYasi = null;
    const ozet = sonuc?.ozet || {};
    const toplamSite = Math.max(
      (Array.isArray(SITE_SIRASI) && SITE_SIRASI.length) ? SITE_SIRASI.length : 0,
      Array.isArray(sonuc?.sonuclar) ? sonuc.sonuclar.length : 0,
    ) || 62;
    const taranmayan = Number(ozet.taranmayanSiteSayisi) || 0;
    const kismi = ozet.iptalEdildi === true || taranmayan > 0;
    const taranan = Math.max(0, toplamSite - taranmayan);
    const yas = muhurYasi
      || (Number.isFinite(Number(sonuc?.ts)) ? vitrinYas(new Date(Number(sonuc.ts)).toISOString()) : null);
    if (kismi) {
      dogrulamaMetin.textContent = CANLI_YEREL.kismiTarama(yas, taranan, toplamSite);
    } else {
      dogrulamaMetin.textContent = CANLI_YEREL.dogrulandiSaat(yas, toplamSite);
    }
  }
}

function sonucGoster(sonuc, opts = {}) {
  if (!sonuc) return;
  // ⚡ Erken sonuç butonu yalnızca KESİN sonuçta kaldırılır. Canlı/kısmi
  // akış sürerken kullanıcı butonu hâlâ kullanabilmeli.
  if (opts.canli !== true && opts.keepDurum !== true) erkenSonucButonunuKaldir();
  // İlk sonuç çizildiğinde iskelet kartlar gizlenir (canlı güncellemede de).
  const iskelet = document.querySelector('.skeleton-izgara');
  if (iskelet) iskelet.hidden = true;
  if (!opts.keepDurum) {
    $('#durumAlani').hidden = true;
  }
  $('#sonucAlani').hidden = false;
  $('#takipMesaj').textContent = '';

  const k = sonuc.kaynak || { site: 'kaynak', urun: CANLI_YEREL.bulunamadiVarsayilan };
  $('#kaynakBaslik').textContent = k.urun || CANLI_YEREL.sonucEtiketi;
  $('#kaynakBilgi').innerHTML = [
    `${CANLI_YEREL.kaynakEtiketi}: <b>${SITE_ADLARI[k.site] || k.site || CANLI_YEREL.belirtilmedi}</b>`,
    k.marka ? `${CANLI_YEREL.markaEtiketi}: <b>${esc(k.marka)}</b>` : '',
    k.modelKodu ? `${CANLI_YEREL.modelKoduEtiketi}: <span class="rozet">${esc(k.modelKodu)}</span>` : '',
    k.barkod ? `${CANLI_YEREL.barkodEtiketi}: <b>${esc(k.barkod)}</b>` : '',
    k.renk ? `${DIL_KOPYA_YEREL.renkEtiket}: <span class="rozet renk">${esc(renkYerellestir(k.renk))}</span>` : '',
  ].filter(Boolean).join(' · ');

  const o = sonuc.ozet || {};
  const bulunanlar = (sonuc.sonuclar || []).filter(r => r.status === 'found' && r.product);
  const stoktaVarSayisi = o.stoktaVarSayisi ?? bulunanlar.filter(r => r.product.inStock !== false).length;
  const stoktaYokSayisi = o.stoktaYokSayisi ?? bulunanlar.filter(r => r.product.inStock === false).length;
  const tamamiTukendi = o.tamamiTukendi ?? (bulunanlar.length > 0 && stoktaVarSayisi === 0);

  if (tamamiTukendi) {
    $('#ozetKutu').innerHTML = `<div class="etiket" style="color:#dc2626">${CANLI_YEREL.tumundeTukendi}</div><div class="fiyat" style="color:#dc2626">${CANLI_YEREL.stokYokKisa}</div><div class="yer">${CANLI_YEREL.hepsiTukenmis(bulunanlar.length)}</div>`;
  } else if (o.enUcuzSite) {
    const enUcuzTeklif = bulunanlar.find(r =>
      r.enUcuz || ((r.siteName === o.enUcuzSite || SITE_ADLARI[r.site] === o.enUcuzSite) && r.product?.inStock !== false));
    const ekKargo = enUcuzTeklif?.product?.pricing?.kargo;
    const ucretsizKargo = ekKargo?.uygulanir === false
      || enUcuzTeklif?.product?.shipping?.applies === false
      || (enUcuzTeklif?.kargoBedava === true && ekKargo?.uygulanir == null);
    const kargoBilindi = ekKargo?.uygulanir === true || ucretsizKargo;
    const kargoOzeti = (ekKargo?.uygulanir === true && Number(ekKargo.ucret) > 0)
      ? CANLI_YEREL.kargoDahilUcret(tl(ekKargo.ucret))
      : (ucretsizKargo ? CANLI_YEREL.kargoDahilBedava : CANLI_YEREL.kargoSepetteEklenir);
    const stokEkNot = stoktaYokSayisi > 0 ? CANLI_YEREL.stoktaMagazaSayi(stoktaVarSayisi) : '';
    $('#ozetKutu').innerHTML = `<div class="etiket">${kargoBilindi ? CANLI_YEREL.ozetEnUcuzDahil : CANLI_YEREL.ozetEnUcuzKargo}</div><div class="fiyat">${tl(o.enUcuzFiyat)}</div><div class="yer">${esc(o.enUcuzSite)} · ${kargoOzeti}${stokEkNot}</div>`;
  } else {
    $('#ozetKutu').innerHTML = `<div class="etiket">${CANLI_YEREL.sonucEtiketi}</div><div class="fiyat">—</div><div class="yer">${CANLI_YEREL.stoktaUrunYok}</div>`;
  }

  // 🎯 Net tasarruf bandı + güvenilirlik mührü (2026-11-12).
  // Özet kutusunun hemen altında, ilk bakışta görünür konumda.
  tasarrufBandiCiz(sonuc, { yasMetni: opts.yasMetni || null });

  // 🧠 Alışveriş Zekası Karar Paneli (2026-10-30)
  fiyatZekasiPaneli(sonuc);

  // Kartlar: stokta olanlar üstte, sonra tükenenler, sonra farklı renkler, sonra bulunamayanlar
  const sirali = stokSirala(sonuc.sonuclar || []);
  // Neden Daha Ucuz açıklaması
  const nedenEl = $('#nedenUcuzAlani');
  const nedenMetin = $('#nedenUcuzMetin');
  if (o.nedenDahaUcuz && nedenEl && nedenMetin) {
    nedenMetin.textContent = o.nedenDahaUcuz;
    nedenEl.hidden = false;
  } else if (nedenEl) {
    nedenEl.hidden = true;
  }

  // Filtre barını göster ve sayı rozetleriyle güncelle
  const fBar = $('#filtreBar');
  if (fBar) {
    fBar.hidden = false;
    document.querySelectorAll('.filtre-chip').forEach(c => c.classList.toggle('aktif', c.dataset.filtre === 'hepsi'));
    const chipVar = document.querySelector('.filtre-chip[data-filtre="stokta_var"]');
    if (chipVar) chipVar.textContent = CANLI_YEREL.filtreStoktaVar(stoktaVarSayisi);
    const chipYok = document.querySelector('.filtre-chip[data-filtre="stokta_yok"]');
    if (chipYok) chipYok.textContent = CANLI_YEREL.filtreStoktaYok(stoktaYokSayisi);
    // 🖨️ Çap ve hammadde filtreleri (2026-10-30)
    baskiFiltreleriniDoldur(sonuc);
  }

  $('#kartlar').innerHTML = fomoIleBasla(sonuc, sirali.map(kartHtml).join(''));

  // 📦 Tüm mağazalarda tükendi / hiç teklif yok → ölü ekran yerine stoklu
  // alternatifler (2026-11-12). Kartlar canlı vitrinden gelir; uydurma ürün yok.
  tukendiAlternatifleriniEkle({ tamamiTukendi, hicBulunamadi: bulunanlar.length === 0 });
  // 🧱 Bento özet (2026-11-01)
  bentoOzetCiz(sonuc);
  // Kartlar sıralı giriş animasyonuyla belirsin (staggered fade/scale-in).
  kartGirisAnimasyonu();
  // Canlı taramada kalan siteler için iskelet kartları korunur.
  if (opts.canli && opts.kalanSite > 0) canliIskeletleriGuncelle(opts.kalanSite);
  tabloDoldur(sonuc);

  // Birim fiyat / "sahte ucuz" paneli (2026-10-29)
  birimFiyatPaneli(sonuc);

  // 30 günlük fiyat trendi panelini doldur (2026-10-28: bu çağrı hiç yapılmıyordu,
  // bu yüzden #fiyatGecmisiAlani/Chart.js grafiği kullanıcıya hiç görünmüyordu).
  // `await` edilmez: grafik yüklenirken sayfa/ sonuç kartları bloke olmasın.
  //
  // Canlı (tazeleme sırasındaki kısmi) çizimlerde bu paneller ATLANIR (2026-10-29):
  // her fiyat güncellemesinde grafik isteği + muadil araması yeniden başlatılmasın.
  if (!opts.canli) {
    fiyatGrafiginiYukle(sonuc).catch(err => console.warn('Fiyat grafiği:', err));

    // Muadil önerileri (2026-10-28): stok yok / bütçe aşımı / fiyat geçmişe göre yüksek
    // / hiç bulunamadı. Kural tutmuyorsa panel gizli kalır, butonla elle açılabilir.
    muadilPaneliHazirla(sonuc, opts);
  }

  // 📍 Sonuç alanına yumuşak kaydırma (2026-11-11).
  //
  // ANTI-JITTER: canlı/akış güncellemelerinde (`canli`, `keepDurum`) sayfa
  // defalarca kez zıplamasın. Bu bayraklar zaten kısmi SSE tazelemelerinde
  // gönderiliyor; kaydırma yalnızca İLK/kesin sonuçta çalışır.
  if (opts.kaydir === true && opts.canli !== true && opts.keepDurum !== true) {
    setTimeout(() => {
      const hedef = document.getElementById('sonucAlani');
      if (hedef && !hedef.hidden) {
        hedef.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= SSE canlı akış + otomatik polling yedeği (2026-10-29) =================
 *
 * Neden: istemci 750–1000 ms'de bir HTTP isteği atıyordu; ilerleme gecikmeli
 * görünüyordu. SSE ile her olay ANINDA (milisaniye) ekrana düşer.
 *
 * Savunmacı fallback: EventSource kurulamazsa, hata verirse ya da 20 saniye
 * boyunca hiç olay gelmezse otomatik olarak HTTP polling'e dönülür. Kullanıcı
 * hiçbir durumda boş ekranda kalmaz.
 *
 * Erişim anahtarı: EventSource başlık gönderemez → `?anahtar=` sorgu parametresi
 * kullanılır (sunucunun erişim middleware'i ikisini de kabul eder).
 */
const CANLI_AKIS = new Map(); // id → {es, sessizTimer, kapandi}

/** Aktif akışı kapatır (sekme/başka arama geçişi). */
function canliAkisKapat(id) {
  const k = CANLI_AKIS.get(id);
  if (!k) return;
  try { k.es?.close(); } catch { /* zaten kapalı */ }
  if (k.sessizTimer) clearTimeout(k.sessizTimer);
  CANLI_AKIS.delete(id);
}

/** Tüm açık akışları kapatır (yeni arama başlarken). */
function tumAkislariKapat() {
  for (const id of [...CANLI_AKIS.keys()]) canliAkisKapat(id);
}

/** Erişim anahtarını SSE URL'ine ekler. */
function anahtarliUrl(yol) {
  let anahtar = '';
  try { anahtar = localStorage.getItem('erisim_anahtari') || ''; } catch { /* yok */ }
  if (!anahtar) return yol;
  return yol + (yol.includes('?') ? '&' : '?') + 'anahtar=' + encodeURIComponent(anahtar);
}

/**
 * Bir işi SSE ile izler; akış koparsa polling'e düşer.
 *
 * @param {string} id iş kimliği
 * @param {{
 *   isle: (job:object) => 'devam'|'bitti',   // her olayda UI güncelle
 *   yedekPoll: (id:string) => void,          // SSE başarısızsa çağrılacak polling
 *   etiket?: string                          // log/teşhis
 * }} opts
 */
function canliIzle(id, opts = {}) {
  const isle = typeof opts.isle === 'function' ? opts.isle : () => 'bitti';
  const yedekPoll = typeof opts.yedekPoll === 'function' ? opts.yedekPoll : null;
  const etiket = opts.etiket || id;

  canliAkisKapat(id);

  // EventSource yoksa (eski tarayıcı) doğrudan polling
  if (typeof EventSource === 'undefined') {
    if (yedekPoll) { console.info(`[canli:${etiket}] EventSource yok → polling`); yedekPoll(id); }
    return;
  }

  let bitti = false;
  let yedegeGecildi = false;

  const kayit = { es: null, sessizTimer: null, kapandi: false };
  CANLI_AKIS.set(id, kayit);

  /** SSE'yi bırakıp polling'e geç (tek sefer). */
  const yedegeGec = (neden) => {
    if (yedegeGecildi || bitti) return;
    yedegeGecildi = true;
    try { kayit.es?.close(); } catch { /* kapalı */ }
    if (kayit.sessizTimer) clearTimeout(kayit.sessizTimer);
    if (CANLI_AKIS.get(id) === kayit) CANLI_AKIS.delete(id);
    console.warn(`[canli:${etiket}] SSE koptu (${neden}) → HTTP polling yedeğine geçildi`);
    if (yedekPoll) yedekPoll(id);
  };

  /** 20 sn olay gelmezse akış ölü sayılır (proxy/uyku). */
  const sessizligiIzle = () => {
    if (kayit.sessizTimer) clearTimeout(kayit.sessizTimer);
    kayit.sessizTimer = setTimeout(() => yedegeGec('20 sn olay yok'), 20000);
  };

  let es;
  try {
    es = new EventSource(anahtarliUrl('/api/stream/' + encodeURIComponent(id)));
  } catch (e) {
    yedegeGec('EventSource kurulamadı');
    return;
  }
  kayit.es = es;

  const olayGeldi = () => { sessizligiIzle(); };

  const bitir = () => {
    bitti = true;
    if (kayit.sessizTimer) clearTimeout(kayit.sessizTimer);
    try { es.close(); } catch { /* kapalı */ }
    if (CANLI_AKIS.get(id) === kayit) CANLI_AKIS.delete(id);
  };

  es.addEventListener('progress', (ev) => {
    olayGeldi();
    let job;
    try { job = JSON.parse(ev.data); } catch { return; }
    if (!job) return;
    let durum = 'devam';
    try { durum = isle(job); } catch (e) { console.error('[canli:isle]', e); }
    if (durum === 'bitti') bitir();
  });

  es.addEventListener('done', (ev) => {
    olayGeldi();
    let job = null;
    try { job = JSON.parse(ev.data); } catch { /* yoksay */ }
    if (job) { try { isle(job); } catch (e) { console.error('[canli:isle]', e); } }
    bitir();
  });

  es.addEventListener('error', (ev) => {
    olayGeldi();
    // Sunucudan gelen 'error' OLAYI (iş hatası) ile bağlantı hatası farklıdır:
    // EventSource bağlantı hatasında da 'error' tetikler ama `ev.data` boştur.
    let job = null;
    try { if (ev && ev.data) job = JSON.parse(ev.data); } catch { job = null; }
    if (job) {
      try { isle(job); } catch (e) { console.error('[canli:isle]', e); }
      bitir();
      return;
    }
    // Bağlantı hatası: EventSource kendi kendine yeniden dener (readyState=CONNECTING).
    // Kısa bir süre tanı; toparlanmazsa polling'e geç.
    if (es.readyState === EventSource.CLOSED) {
      yedegeGec('bağlantı kapandı');
    } else {
      // Yeniden bağlanıyor: 4 sn içinde olay gelmezse yedeğe geç
      if (kayit.sessizTimer) clearTimeout(kayit.sessizTimer);
      kayit.sessizTimer = setTimeout(() => yedegeGec('yeniden bağlanamadı'), 4000);
    }
  });

  sessizligiIzle();
}


/* ---- Birim fiyat biçimlendirme (2026-10-29) ---- */
// Sunucu ₺/kg ve ₺/L değerlerini SAYI olarak gönderir; biçim burada yapılır
// (Türkçe ondalık virgül, binlik nokta).

function birimKgMetni(deger, paraBirimi = null) {
  if (deger == null || !isFinite(deger)) return null;
  const kod = paraBirimi || BASKI_ORTAM.currency || 'TRY';
  if (String(kod).toUpperCase() !== 'TRY') return tl(deger, kod) + '/kg';
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/kg';
}

function birimLMetni(deger, paraBirimi = null) {
  if (deger == null || !isFinite(deger)) return null;
  const kod = paraBirimi || BASKI_ORTAM.currency || 'TRY';
  if (String(kod).toUpperCase() !== 'TRY') return tl(deger, kod) + '/L';
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/L';
}

/** 800 → "800 g", 3000 → "3 kg" */
function gramMetni(gram) {
  if (gram == null || !isFinite(gram)) return null;
  const g = Number(gram);
  const loc = sonucLocale();
  if (g >= 1000 && g % 100 === 0) {
    return (g / 1000).toLocaleString(loc, { maximumFractionDigits: 2 }) + ' kg';
  }
  return g.toLocaleString(loc, { maximumFractionDigits: 0 }) + ' g';
}

/* ================= 🧠 Alışveriş Zekası Karar Paneli (2026-10-30) =================
 * Sunucu `ozet.fiyatZekasi` gönderir (src/pricing.js → fiyatDegerlendir):
 *   tavsiye: simdi_al | piyasa | bekle | veri_yok
 *   durum  : dip_fiyat | sahte_indirim | null
 * Panel YALNIZCA yeterli geçmiş varsa yorum yapar; yoksa dürüstçe
 * "yeterli fiyat geçmişi yok" der (uydurma tavsiye basmaz).
 */
function fiyatZekasiPaneli(sonuc) {
  const alan = $('#fiyatZekaAlani');
  if (!alan) return;
  const z = sonuc?.ozet?.fiyatZekasi;
  // 2026-11-11 DÜZELTME: `zt` (zamanlama tavsiyesi) hiçbir yerde tanımlı
  // değildi → `ReferenceError: zt is not defined` fırlıyor, `sonucGoster`
  // yarıda kesiliyordu: fiyat kartları HİÇ çizilmiyor, otomatik kaydırma da
  // çalışmıyordu. Sunucu bu nesneyi `sonuc.zamanlama` ve
  // `sonuc.ozet.zamanlamaTavsiyesi` altında gönderiyor.
  const zt = sonuc?.zamanlama || sonuc?.ozet?.zamanlamaTavsiyesi || null;
  const rozet = $('#fiyatZekaRozet');
  const alt = $('#fiyatZekaAlt');
  const farkEl = $('#fiyatZekaFark');
  const bar = $('#fiyatZekaBarDolgu');
  const ist = $('#fiyatZekaIstatistik');
  const mesajEl = $('#fiyatZekaMesaj');

  // Geçmiş yoksa panel gizli kalır; "neden yok" bilgisi özet kutusunu kirletmez.
  if (!z || z.tavsiye === 'veri_yok' && !z.durum) {
    alan.hidden = true;
    return;
  }

  const renk = z.tavsiye === 'simdi_al' ? 'yesil'
    : z.tavsiye === 'bekle' ? 'kirmizi'
      : z.tavsiye === 'piyasa' ? 'sari' : 'gri';

  alan.hidden = false;
  alan.className = 'fiyat-zeka-kart fiyat-zeka-' + renk;

  const tavsiyeMetni = z.tavsiye === 'simdi_al' ? CANLI_YEREL.zekaSimdiAl
    : z.tavsiye === 'bekle' ? CANLI_YEREL.zekaBekle
      : z.tavsiye === 'piyasa' ? CANLI_YEREL.zekaFiyatNormal : CANLI_YEREL.zekaVeriAz;
  rozet.textContent = (z.tavsiye === 'simdi_al' ? '🟢 ' : z.tavsiye === 'bekle' ? '🔴 ' : z.tavsiye === 'piyasa' ? '🟡 ' : '⚪ ') + tavsiyeMetni;

  const gun = z.gunSayisi || 0;
  const nokta = z.veriNoktasi || 0;
  alt.textContent = CANLI_YEREL.zekaGecmisAlt(gun, nokta);

  if (z.ortalamaFarkYuzde == null) {
    farkEl.textContent = '—';
    farkEl.className = 'fiyat-zeka-fark';
  } else {
    const f = z.ortalamaFarkYuzde;
    farkEl.textContent = f >= 0
      ? CANLI_YEREL.zekaFarkUcuz(yuzdeStr(Math.abs(f)))
      : CANLI_YEREL.zekaFarkPahali(yuzdeStr(Math.abs(f)));
    farkEl.className = 'fiyat-zeka-fark ' + (f > 0 ? 'iyi' : f < 0 ? 'kotu' : '');
  }

  // Görsel bar: güncel fiyatın 90 günlük banttaki yeri (min → max).
  if (bar && z.minFiyat > 0 && z.maxFiyat > z.minFiyat && z.guncelFiyat > 0) {
    const oran = Math.min(1, Math.max(0, (z.guncelFiyat - z.minFiyat) / (z.maxFiyat - z.minFiyat)));
    bar.style.width = Math.round(oran * 100) + '%';
  } else if (bar) {
    bar.style.width = '0%';
  }

  const parcalar = [];
  if (z.minFiyat != null) parcalar.push(CANLI_YEREL.zekaEnDusuk(tl(z.minFiyat)));
  if (z.ortFiyat != null) parcalar.push(CANLI_YEREL.zekaOrt30(tl(z.ortFiyat)));
  if (z.maxFiyat != null) parcalar.push(CANLI_YEREL.zekaEnYuksek(tl(z.maxFiyat)));
  ist.innerHTML = parcalar.join(' · ');

  const aktifMesaj = zt?.aciklama || z?.mesaj || null;
  if (aktifMesaj) {
    mesajEl.textContent = zekaMesajYerellestir(aktifMesaj, z);
    mesajEl.hidden = false;
    const stil = (zt?.karar === 'SIMDI_AL' || z?.durum === 'dip_fiyat') ? 'firsat' : (zt?.karar === 'BEKLE' || z?.durum === 'sahte_indirim') ? 'uyari' : '';
    mesajEl.className = 'fiyat-zeka-mesaj ' + stil;
  } else {
    mesajEl.hidden = true;
  }
}

/* ================= Birim fiyat / "sahte ucuz" paneli ================= */
//
// Sunucu (pipeline) her ürün için `birim` alanı ve `ozet.birimFiyat` özeti gönderir.
// Panel YALNIZCA anlamlı bir şey söyleyebiliyorsa açılır:
//  - aynı ürünün farklı gramajları varsa (tuzak riski) → uyarı + ₺/kg karşılaştırması
//  - tek gramaj varsa ve tüm fiyatlar aynı birimdeyse → sessiz kalır (gürültü yok)

function birimFiyatPaneli(sonuc) {
  const alan = $('#birimAlani');
  if (!alan) return;

  const b = sonuc?.ozet?.birimFiyat;
  const tuzaklar = Array.isArray(b?.tuzaklar) ? b.tuzaklar : [];
  const supheliler = Array.isArray(b?.supheliler) ? b.supheliler : [];
  const referans = b?.referansGram || null;

  // Aynı gramajdaki ürünlerin birim fiyatları da farklı olabilir (kargo/kampanya).
  // Bunu göstermek faydalı ama yalnızca anlamlı fark varsa.
  const teklifler = (sonuc?.sonuclar || [])
    .filter(s => s.status === 'found' && s.product && s.renkAyni !== false)
    .filter(s => s.product.birim && s.product.birim.tlKg != null);

  if (!tuzaklar.length && teklifler.length < 2) {
    alan.hidden = true;
    return;
  }
  alan.hidden = false;

  // --- Başlık ---
  const baslik = $('#birimBaslik');
  const aciklama = $('#birimAciklama');
  if (tuzaklar.length) {
    baslik.textContent = CANLI_YEREL.birimSahteBaslik;
    aciklama.textContent = CANLI_YEREL.birimSahteAciklama;
  } else {
    baslik.textContent = CANLI_YEREL.birimNormalBaslik;
    aciklama.textContent = CANLI_YEREL.birimNormalAciklama;
  }

  // --- Tuzak kartları ---
  const tuzakHtml = tuzaklar.map(t => `
    <div class="birim-tuzak">
      <div class="birim-tuzak-ust">
        <b>${esc(t.siteName || t.site)}</b>
        <span class="birim-tuzak-miktar">${esc(gramMetni(t.gram))}</span>
        <span class="birim-tuzak-fiyat">${tl(t.fiyat)}</span>
      </div>
      <div class="birim-tuzak-not">${esc(t.neden)}</div>
    </div>`).join('');

  // --- Sıralama tablosu (aynı renkteki teklifler, ₺/kg artan; şüpheliler sonda) ---
  const supheliSet = new Set(supheliler.map(x => `${x.site}|${x.title}`));
  const sirali = [...teklifler].sort((a, c) => {
    const sa = a.product.birim.supheli ? 1 : 0;
    const sc = c.product.birim.supheli ? 1 : 0;
    if (sa !== sc) return sa - sc;
    return a.product.birim.tlKg - c.product.birim.tlKg;
  });
  const satirlar = sirali.map((s, i) => {
    const bi = s.product.birim;
    const supheli = bi.supheli === true;
    return `<tr class="${i === 0 && !supheli ? 'birim-en-iyi' : ''} ${supheli ? 'birim-supheli' : ''}">
      <td>${esc(SITE_ADLARI[s.site] || s.siteName || s.site)}${supheli ? ` <span class="birim-supheli-rozet" title="${esc(CANLI_YEREL.birimSupheliTitle)}">${esc(CANLI_YEREL.birimSupheli)}</span>` : ''}</td>
      <td>${bi.gram != null ? esc(gramMetni(bi.gram)) : '—'}</td>
      <td>${tl(bi.fiyat)}</td>
      <td class="birim-kg-hucre">${esc(birimKgMetni(bi.tlKg))}${bi.tlKgTahmini ? ` <span class="birim-tahmini" title="${esc(CANLI_YEREL.birimTahminTitle)}">~</span>` : ''}</td>
    </tr>`;
  }).join('');

  // Şüpheli fiyat uyarısı (dürüstlük: "en iyi" diye sunmuyoruz)
  const supheliHtml = supheliler.length
    ? `<div class="birim-supheli-uyari">
        ${CANLI_YEREL.birimDogrulanmali(supheliler.length, esc(supheliler[0].birim?.supheliNeden || CANLI_YEREL.birimSupheliVarsayilan))}
      </div>`
    : '';

  const referansNotu = referans
    ? `<p class="birim-alt">${esc(CANLI_YEREL.birimAltReferans(gramMetni(referans)))}</p>`
    : `<p class="birim-alt">${esc(CANLI_YEREL.birimAltDuz)}</p>`;

  $('#birimIcerik').innerHTML = `
    ${tuzakHtml}
    ${supheliHtml}
    ${satirlar ? `<table class="birim-tablo">
      <thead><tr><th>${esc(CANLI_YEREL.birimThMagaza)}</th><th>${esc(CANLI_YEREL.birimThMiktar)}</th><th>${esc(CANLI_YEREL.birimThFiyat)}</th><th>${esc(CANLI_YEREL.birimThBirim)}</th></tr></thead>
      <tbody>${satirlar}</tbody>
    </table>` : ''}
    ${referansNotu}`;
}


//
// Kural: panel yalnızca ölçülebilir bir tetik varsa kendiliğinden açılır
// (stok yok / hiç bulunamadı). Diğer durumlarda "Muadili ara" düğmesi bekler.
// YZ önerileri sunucuda gerçek arama sonuçlarıyla doğrulanır; burada yalnız
// gösterilir. "Daha ucuz" yüzdesi sunucudan GERÇEK fiyatlarla gelir.

let muadilSonuc = null;      // son karşılaştırma (yeniden arama için)
let muadilAktifIs = null;
let muadilPollTimer = null;

function muadilPaneliHazirla(sonuc, opts = {}) {
  const alan = $('#muadilAlani');
  if (!alan) return;
  muadilSonuc = sonuc;
  muadilIptalEt();

  // Yerel ön değerlendirme: sunucuya gitmeden "gerekli mi" kararını ver.
  const teklifler = (sonuc?.sonuclar || [])
    .filter(s => s.status === 'found' && s.product && s.renkAyni !== false)
    .filter(s => (s.product.pricing?.toplam ?? s.product.sellingPrice) != null);
  const stokta = teklifler.filter(s => s.product.inStock !== false);
  const hicYok = teklifler.length === 0;
  const stokYok = !hicYok && stokta.length === 0;

  $('#muadilIcerik').innerHTML = '';
  $('#muadilYenileBtn').textContent = CANLI_YEREL.muadilAra;
  $('#muadilYenileBtn').hidden = false;

  if (stokYok || hicYok) {
    $('#muadilIkon').textContent = stokYok ? '🚫' : '🔎';
    $('#muadilBaslik').textContent = stokYok
      ? CANLI_YEREL.muadilStokYokBaslik
      : CANLI_YEREL.muadilHicYokBaslik;
    $('#muadilAciklama').textContent = stokYok
      ? CANLI_YEREL.muadilStokYokAciklama(teklifler.length)
      : CANLI_YEREL.muadilHicYokAciklama;
    alan.hidden = false;
    muadilAra(false);
  } else {
    // Kendiliğinden ARAMA yapılmaz (boşa istek/kredi harcamayalım), ama kullanıcı
    // "fiyat yüksek mi, muadili var mı?" diye elle sorabilsin (2026-10-28).
    $('#muadilIkon').textContent = '🔄';
    $('#muadilBaslik').textContent = CANLI_YEREL.muadilVarMi;
    $('#muadilAciklama').textContent = CANLI_YEREL.muadilKesifAciklama;
    $('#muadilYenileBtn').textContent = CANLI_YEREL.muadilAra;
    alan.hidden = false;
  }
}

function muadilIptalEt() {
  if (muadilPollTimer) { clearTimeout(muadilPollTimer); muadilPollTimer = null; }
  if (muadilAktifIs) {
    try {
      fetch('/api/muadil/' + muadilAktifIs + '/iptal', { method: 'POST' }).catch(() => {});
    } catch { /* yok say */ }
    muadilAktifIs = null;
  }
}

async function muadilAra(elle = true) {
  if (!muadilSonuc) return;
  muadilIptalEt();
  const icerik = $('#muadilIcerik');
  const btn = $('#muadilYenileBtn');
  $('#muadilAlani').hidden = false;
  icerik.innerHTML = `<div class="muadil-yukleniyor">${esc(CANLI_YEREL.muadilYukleniyor)}</div>`;
  btn.disabled = true;
  btn.textContent = CANLI_YEREL.muadilAraniyor;

  try {
    const res = await fetch('/api/muadil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sonuc: muadilSonuc, elle }),
    });
    const d = await guvenliJson(res);
    if (!res.ok) throw new Error(d.hata || CANLI_YEREL.muadilHataBaslatilamadi);
    muadilAktifIs = d.isId || d.id;
    muadilPoll(muadilAktifIs);
  } catch (e) {
    icerik.innerHTML = `<p class="muadil-uyari">${esc(e.message)}</p>`;
    btn.disabled = false;
    btn.textContent = CANLI_YEREL.muadilAra;
  }
}

function muadilPoll(id) {
  const bekle = (ms) => new Promise(r => { muadilPollTimer = setTimeout(r, ms); });
  (async () => {
    const basladi = Date.now();
    while (Date.now() - basladi < 240000) {
      await bekle(1500);
      if (muadilAktifIs !== id) return; // iptal edildi / yeni arama
      let j;
      try {
        j = await guvenliJson(await fetch('/api/muadil/' + id));
      } catch { continue; }
      const icerik = $('#muadilIcerik');
      if (j.status === 'running') {
        const p = j.progress || {};
        if (p.not) icerik.innerHTML = `<div class="muadil-yukleniyor">${esc(String(p.not))}</div>`;
        continue;
      }
      muadilAktifIs = null;
      const btn = $('#muadilYenileBtn');
      btn.disabled = false;
      btn.textContent = 'Yeniden ara';
      if (j.status === 'error') {
        icerik.innerHTML = `<p class="muadil-uyari">Muadil bulunamadı: ${esc(j.error || 'bilinmeyen hata')}</p>`;
        return;
      }
      muadilCiz(j.result);
      return;
    }
    $('#muadilIcerik').innerHTML = '<p class="muadil-uyari">Muadil araması zaman aşımına uğradı.</p>';
    const btn = $('#muadilYenileBtn');
    btn.disabled = false;
    btn.textContent = 'Yeniden ara';
  })();
}

function muadilCiz(r) {
  const icerik = $('#muadilIcerik');
  if (!r) { icerik.innerHTML = ''; return; }

  if (r.baslik) $('#muadilBaslik').textContent = r.baslik;
  if (r.aciklama) $('#muadilAciklama').textContent = r.aciklama;

  const liste = Array.isArray(r.alternatifler) ? r.alternatifler : [];
  if (!liste.length) {
    const neden = (r.uyarilar || [])[0] || 'Uygun bir muadil bulunamadı.';
    icerik.innerHTML = `<p class="muadil-uyari">${esc(neden)}</p>`;
    return;
  }

  const mevcutMetni = r.mevcut?.fiyat != null
    ? `Şu anki en ucuz: ${tl(r.mevcut.fiyat)}${r.mevcut.siteName ? ' · ' + esc(r.mevcut.siteName) : ''}`
    : '';
  const ozellik = r.ortakOzellik ? `Aranan: <b>${esc(r.ortakOzellik)}</b>` : '';

  icerik.innerHTML = `
    <p class="muadil-altmetin" style="margin:10px 0 0">
      ${[mevcutMetni, ozellik].filter(Boolean).join(' · ')}
      ${r.sureMs ? ` · ${(r.sureMs / 1000).toFixed(1)} sn` : ''}
    </p>
    <div class="muadil-liste">
      ${liste.map(a => `<div class="muadil-satir">
        <div class="muadil-satir-bilgi">
          <a class="muadil-satir-baslik" href="${esc(a.afiliyeUrl || a.url)}" target="_blank"
             rel="noopener sponsored" data-afiliye-site="${esc(a.site || '')}">${esc(a.title)}</a>
          <div class="muadil-satir-site">${esc(a.siteName || a.site)}</div>
          ${a.neden ? `<div class="muadil-satir-neden">${esc(a.neden)}</div>` : ''}
        </div>
        <div class="muadil-satir-fiyat">
          <span class="muadil-fiyat">${tl(a.fiyat)}</span>
          ${a.mevcutFiyat != null ? `<span class="muadil-eski">${tl(a.mevcutFiyat)}</span>` : ''}
          ${a.yuzdeDahaUcuz != null && a.yuzdeDahaUcuz > 0
            ? `<span class="muadil-yuzde">%${String(a.yuzdeDahaUcuz).replace('.', ',')} daha ucuz</span>` : ''}
        </div>
      </div>`).join('')}
    </div>
    <p class="muadil-altmetin" style="margin:10px 0 0;font-size:12px">
      Muadiller gerçek arama sonuçlarından seçildi; teknik özellikler başlıktan okunur,
      uydurulmaz. Satın almadan önce özellikleri mağazada doğrulayın.
    </p>`;
}

const muadilBtn = document.getElementById('muadilYenileBtn');
if (muadilBtn) muadilBtn.addEventListener('click', () => muadilAra(true));

function kampanyaEtiketi(kosul) {
  const d = BASKI_ORTAM.dil || 'tr';
  const tablolar = {
    tr: { uygulama: 'Uygulamaya özel', uyelik: 'Üyelere özel', karti: 'Karta özel', sepet_tutari: 'Sepet tutarına bağlı', diger: 'Koşullu' },
    en: { uygulama: 'App-only', uyelik: 'Members-only', karti: 'Card-only', sepet_tutari: 'Basket minimum', diger: 'Conditional' },
    fr: { uygulama: 'Appli uniq.', uyelik: 'Membres', karti: 'Carte bancaire', sepet_tutari: 'Minimum panier', diger: 'Conditionnel' },
    ja: { uygulama: 'アプリ限定', uyelik: '会員限定', karti: 'カード限定', sepet_tutari: '合計条件', diger: '条件付き' },
  };
  const map = tablolar[d] || tablolar.tr;
  return map[kosul] || map.diger;
}

/* ================= 🖨️ 3D Baskı Maliyet Widget'ı (2026-10-30) =================
 * Gramaj TEK bir global değerdir: bir kartta değiştirilince tüm kartlar anında
 * yeniden hesaplanır. Böylece kullanıcı "bu makarayla 42 TL / diğerindeki 2.5 kg
 * ile 34 TL" farkını aynı ekranda görür. Sunucudan gelen birim değerler kullanılır;
 * ek istek atılmaz.
 */
let baskiGramaj = 100;

function baskiTl(n, paraBirimi = null) {
  if (n == null || !isFinite(n)) return '—';
  return tl(n, paraBirimi);
}

function baskiHesapla(bk, gramaj) {
  const g = Number(gramaj);
  if (!bk || !bk.hesaplanabilir || !bk.tlGram || !(g > 0)) return null;
  const v = bk.varsayimlar || {};
  const gucW = Number(v.gucW) || 150;
  const kwhTl = Number(v.kwhTl) || 2.9;
  const gramSaat = Number(v.gramSaat) || 12.5;
  const hammadde = bk.tlGram * g;
  const elektrik = (g / gramSaat) * (gucW / 1000) * kwhTl;
  const makaraGram = Number(bk.makaraGram) || 0;
  return {
    gramaj: g,
    hammadde,
    elektrik,
    parca: hammadde + elektrik,
    adet: makaraGram > 0 ? Math.floor(makaraGram / g) : null,
  };
}

function baskiWidgetHtml(bk, paraBirimi = null) {
  if (!bk) return '';
  const f = (n) => baskiTl(n, paraBirimi);
  const h = baskiHesapla(bk, baskiGramaj);
  const icerik = h
    ? DIL_KOPYA_YEREL.baskiSonuc(h, bk, f)
    : `<span class="baski-yok">${esc(bk.neden ? baskiNedenYerellestir(bk.neden) : DIL_KOPYA_YEREL.baskiYok)}</span>`;
  return `<div class="baski-widget" data-makara-gram="${esc(String(bk.makaraGram ?? ''))}" data-currency="${esc(String(paraBirimi || ''))}">
    <div class="baski-baslik">
      <span class="baski-baslik-metin">${DIL_KOPYA_YEREL.baskiBaslik}</span>
      <label class="baski-gramaj-etiket">${DIL_KOPYA_YEREL.baskiGramajLbl}
        <input type="number" class="baski-gramaj" min="1" max="50000" step="1"
          value="${esc(String(baskiGramaj))}" inputmode="decimal" aria-label="${esc(DIL_KOPYA_YEREL.baskiAria)}" />
        <span class="baski-birim">g</span>
      </label>
    </div>
    <div class="baski-sonuc">${icerik}</div>
  </div>`;
}

/** Kartlardaki tüm widget'ları mevcut `baskiGramaj` ile yeniden hesaplar. */
function baskiWidgetlariniGuncelle() {
  const kartlar = document.querySelectorAll('#kartlar .baski-widget');
  for (const w of kartlar) {
    const kart = w.closest('.urun-karti');
    const site = kart?.dataset.site;
    const r = (sonSonuc?.sonuclar || []).find(x => x.site === site);
    const paraBirimi = w.dataset.currency || r?.product?.currency || null;
    const h = baskiHesapla(r?.baski, baskiGramaj);
    const hedef = w.querySelector('.baski-sonuc');
    if (!hedef) continue;
    if (h) {
      hedef.innerHTML = DIL_KOPYA_YEREL.baskiSonuc(h, r?.baski || {}, (n) => baskiTl(n, paraBirimi));
    }
  }
}

/** Gramaj değişimi: tüm kartlarda senkron (delegasyon ile). */
document.addEventListener('input', (e) => {
  const input = e.target.closest?.('.baski-gramaj');
  if (!input) return;
  const deger = Number(input.value);
  if (!isFinite(deger) || deger <= 0) return;
  baskiGramaj = Math.min(50000, Math.max(1, deger));
  // Diğer kartlardaki kutucukları da aynı değere getir (odak/İmleç korunur).
  document.querySelectorAll('#kartlar .baski-gramaj').forEach(el => {
    if (el !== input && el.value !== String(baskiGramaj)) el.value = String(baskiGramaj);
  });
  baskiWidgetlariniGuncelle();
});

/* ================================================================== */
/* 🔌 "Sitene Ekle" — gömülebilir canlı fiyat widget'ı (2026-11-05)     */
/* ================================================================== */

/** Widget iframe kodu üretir (tema + ürün sorgusu). */
function embedKodu(q, tema) {
  const taban = location.origin;
  const src = taban + '/widget?q=' + encodeURIComponent(q) + '&tema=' + tema;
  return '<iframe src="' + src + '" width="320" height="180" '
    + 'frameborder="0" loading="lazy" '
    + 'title="Canlı fiyat — Baskı Hesap" '
    + 'style="border:0;border-radius:12px;overflow:hidden"></iframe>';
}

/** Önizleme iframe adresi (tema + önbellek kırıcı). */
function embedOnizlemeUrl(q, tema) {
  return location.origin + '/widget?q=' + encodeURIComponent(q) + '&tema=' + tema
    + '&_t=' + Date.now();
}

/** Modal içeriğini (önizleme + tema + kod) üretir. */
function embedModalHtml(q, tema) {
  return ''
    + '<div class="embed-modal">'
    + '  <div class="embed-onizleme">'
    // 🐞 2026-11-15: `src` BURADA verilmez. Modal henüz `display:none` iken
    // kaynak atanan `loading="lazy"` iframe Chromium'da hiç yüklenmiyordu
    // (önizleme sonsuza kadar boş kalıyordu). Adres, modal görünür olduktan
    // SONRA embedModalAc içinde atanır.
    + '    <iframe id="embedOnizleme" width="320" height="180" frameborder="0" '
    + 'title="Widget önizleme"></iframe>'
    + '  </div>'
    + '  <div class="embed-ayar">'
    + '    <span class="embed-etiket">Tema</span>'
    + '    <div class="embed-tema" role="group" aria-label="Widget teması">'
    + '      <button type="button" data-embed-tema="dark" class="' + (tema === 'dark' ? 'aktif' : '') + '">🌙 Koyu</button>'
    + '      <button type="button" data-embed-tema="light" class="' + (tema === 'light' ? 'aktif' : '') + '">☀️ Açık</button>'
    + '    </div>'
    + '  </div>'
    + '  <p class="embed-galeri"><a href="/widget-demo.html" target="_blank" rel="noopener">🔍 Tüm widget\'ları galeride önizle</a></p>'
    + '  <p class="embed-not">Widget, radar kataloğundaki <b>canlı en ucuz stoklu fiyatı</b> gösterir '
    + '(5 dakika önbellek). Fiyat değiştikçe blogunuzda kendiliğinden güncellenir.</p>'
    + '  <textarea class="embed-kod" id="embedKod" readonly rows="3" aria-label="Gömme kodu"></textarea>'
    + '  <div class="embed-alt">'
    + '    <button type="button" class="embed-kopyala" id="embedKopyala">📋 Kodu Kopyala</button>'
    + '    <span class="embed-durum" id="embedDurum" role="status" aria-live="polite"></span>'
    + '  </div>'
    + '</div>';
}

/** Modalı açar ve etkileşimleri bağlar. */
function embedModalAc(q) {
  let tema = 'dark';
  const acildi = altModalAc('🔌 Sitene Ekle', embedModalHtml(q, tema));
  if (!acildi) {
    // Modal hiç görünemiyorsa kullanıcıya sessiz kalmak yerine durumu söyle.
    toastGoster('Gömme kodu penceresi açılamadı. Sayfayı yenileyip tekrar deneyin.', 'hata');
    return;
  }

  const kodAlani = document.getElementById('embedKod');
  const durumEl = document.getElementById('embedDurum');
  const onizleme = document.getElementById('embedOnizleme');
  const yaz = () => {
    if (kodAlani) kodAlani.value = embedKodu(q, tema);
  };
  yaz();
  // Önizleme yalnızca modal GÖRÜNÜR olduktan sonra yüklenir (yukarıdaki not).
  if (onizleme) onizleme.src = embedOnizlemeUrl(q, tema);

  document.querySelectorAll('[data-embed-tema]').forEach((b) => {
    b.addEventListener('click', () => {
      tema = b.dataset.embedTema === 'light' ? 'light' : 'dark';
      document.querySelectorAll('[data-embed-tema]').forEach((x) => {
        x.classList.toggle('aktif', x === b);
      });
      yaz();
      const cerceve = document.getElementById('embedOnizleme');
      if (cerceve) cerceve.src = embedOnizlemeUrl(q, tema);
    });
  });

  const kopyala = document.getElementById('embedKopyala');
  if (kopyala) {
    kopyala.addEventListener('click', async () => {
      const metin = kodAlani ? kodAlani.value : embedKodu(q, tema);
      // 2026-11-12: gömme kodu da mikro toast + buton onayıyla kopyalanır.
      const ok = await panoyaKopyalaVeGeriBildirim(metin, kopyala, 'Gömme kodu kopyalandı!');
      if (!ok && kodAlani) {
        kodAlani.removeAttribute('readonly');
        kodAlani.select();
        kodAlani.setSelectionRange(0, metin.length);
        kodAlani.setAttribute('readonly', 'readonly');
      }
      if (durumEl) {
        durumEl.textContent = ok ? '✅ Kod kopyalandı' : '⚠️ Kopyalanamadı — kodu seçip elle kopyalayın';
        durumEl.style.color = ok ? 'var(--yesil)' : 'var(--kirmizi)';
        setTimeout(() => { durumEl.textContent = ''; }, 3200);
      }
    });
  }
}

// Kartlardaki butonlar için tek delege dinleyici (kartlar sık yeniden çizilir).
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-embed-q]');
  if (!b) return;
  e.preventDefault();
  embedModalAc(b.getAttribute('data-embed-q') || '');
});

function kartHtml(r) {
  if (r.status !== 'found' || !r.product) {
    const nedenMetni = magazaDurumNedeniYerellestir(r.reason || '');
    return `<div class="bulunamadi-karti">
      <div class="site-adi">${SITE_ADLARI[r.site]}</div>
      <div>${r.status === 'error' ? CANLI_YEREL.okunamadiOnEk + esc(nedenMetni) : '🔍 ' + esc(nedenMetni || CANLI_YEREL.bulunamadiVarsayilan)}</div>
    </div>`;
  }
  const p = r.product;
  const pr = p.pricing || {};
  const eslesme = CANLI_YEREL.eslesme;

  const rozetler = [];
  const kargoFree = pr.kargo?.uygulanir === false
    || p.shipping?.applies === false
    || (r.kargoBedava === true && pr.kargo?.uygulanir == null);
  if (kargoFree) rozetler.push(`<span class="etiket-rozeti rozet-kargo">${CANLI_YEREL.rozetUcretsizKargo}</span>`);
  else if (Number(p.pricing?.kargo?.ucret) > 0 && p.pricing?.kargo?.uygulanir !== false) {
    rozetler.push(`<span class="etiket-rozeti rozet-kargo-ucretli">${esc(CANLI_YEREL.rozetUcretliKargo(tl(p.pricing.kargo.ucret)))}</span>`);
  }
  if (r.resmiSatici) rozetler.push(`<span class="etiket-rozeti rozet-resmi">${CANLI_YEREL.rozetResmiSatici}</span>`);
  if (r.vadeFarksizTaksit) rozetler.push(`<span class="etiket-rozeti rozet-taksit">${CANLI_YEREL.rozetVadeFarksiz}</span>`);
  const rozetlerHtml = rozetler.length ? `<div class="kart-rozetler">${rozetler.join('')}</div>` : '';

  // 🖨️ 3D Baskı Uzmanlık rozetleri (2026-10-30)
  const bk = r.baski || null;
  const baskiRozetleri = [];
  if (bk?.capUyari) {
    const capMetin = baskiRozetYerellestir(bk.capUyari.metin);
    baskiRozetleri.push(`<span class="baski-rozet cap-uyari" title="${esc(capMetin)}">${esc(capMetin)}</span>`);
  } else if (bk?.capMm != null) {
    const capStr = DIL_KOPYA_YEREL.baskiOndalikVirgul ? String(bk.capMm).replace('.', ',') : String(bk.capMm);
    baskiRozetleri.push(`<span class="baski-rozet cap-ok" title="${esc(CANLI_YEREL.capOkTitle)}">✅ ${esc(capStr)} mm</span>`);
  }
  if (bk?.hammadde?.rozet) {
    const hmRozet = baskiRozetYerellestir(bk.hammadde.rozet);
    baskiRozetleri.push(`<span class="baski-rozet ${esc(bk.hammadde.sinif || '')}">${esc(hmRozet)}</span>`);
  }
  for (const n of (bk?.hammadde?.nitelikler || [])) {
    baskiRozetleri.push(`<span class="baski-rozet ${esc(n.sinif || '')}">${esc(baskiRozetYerellestir(n.rozet))}</span>`);
  }
  if (r.birimUyari) {
    const bwMetin = baskiRozetYerellestir(r.birimUyari.metin);
    baskiRozetleri.push(`<span class="baski-rozet birim-uyari" title="${esc(bwMetin)}">${esc(bwMetin)}</span>`);
  }
  const baskiRozetHtml = baskiRozetleri.length
    ? `<div class="baski-rozetler">${baskiRozetleri.join('')}</div>` : '';

  // 🧵 Birim fiyat rozeti (2026-11-01): filament → 🏷️ ₺/kg, reçine → 🧪 ₺/L
  const b = p.birim || null;
  const birimHtml = (() => {
    if (!b) return '';
    const kgVar = b.tlKg != null;
    const lVar = b.tlL != null;
    if (!kgVar && !lVar) return '';

    const paraKod = p.currency || BASKI_ORTAM.currency || 'TRY';
    const recine = b.ml != null && lVar;
    const ana = String(paraKod).toUpperCase() !== 'TRY'
      ? (recine ? `🧪 ${tl(b.tlL, paraKod)} / L` : `🏷️ ${tl(b.tlKg, paraKod)} / kg`)
      : (recine
        ? `🧪 ${Number(b.tlL).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL / L`
        : `🏷️ ${Number(b.tlKg).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL / kg`);
    const ikincil = recine && kgVar
      ? CANLI_YEREL.birimTahminiEk(tl(b.tlKg, paraKod))
      : '';
    const miktar = b.gram != null ? gramMetni(b.gram) : (b.ml != null ? (b.ml / 1000).toLocaleString(sonucLocale(), { maximumFractionDigits: 2 }) + ' L' : '');
    const ipucu = recine
      ? CANLI_YEREL.birimIpucuHacim
      : (b.tlKgTahmini ? CANLI_YEREL.birimIpucuTahmini : CANLI_YEREL.birimIpucuNet);

    return `<div class="birim-rozet-satiri" title="${esc(ipucu)}">
        <span class="birim-rozet ${recine ? 'birim-rozet-resin' : 'birim-rozet-filament'}">${esc(ana)}</span>
        ${miktar ? `<span class="birim-miktar-rozet">${esc(miktar)}</span>` : ''}
        ${ikincil ? `<span class="birim-rozet-alt">${esc(ikincil)}</span>` : ''}
      </div>`;
  })();

  // 🧾 KDV şeffaflığı (2026-10-31): KDV hariç yayımlayan sitede gösterilen
  // tutar KDV dahildir; hariç tutar da açıkça yazılır.
  const kdvHtml = p.vatIncluded && p.priceExVat != null
    ? `<div class="kdv-not" title="${esc(CANLI_YEREL.kdvTitle)}">${CANLI_YEREL.kdvDahil(p.vatRate ? esc(yuzdeStr(p.vatRate)) : '', tl(p.priceExVat))}</div>`
    : '';

  const kosulluHtml = (pr.kampanyaKosullu || []).map(k =>
    `<div class="kosullu-kampanya"><span class="kosul-etiket">${kampanyaEtiketi(k.kosul)}</span>${esc(k.metin)}${k.kosul_aciklamasi ? ' — ' + esc(k.kosul_aciklamasi) : ''}</div>`).join('');
  const taksitHtml = (pr.kampanyaTaksit || []).length
    ? `<h4>${CANLI_YEREL.taksitBaslik}</h4>${(pr.kampanyaTaksit || []).map(k => `<div class="taksit-notu">• ${esc(k.metin)}</div>`).join('')}` : '';
  const dahilHtml = (pr.kampanyaDahil || []).length
    ? `<h4>${CANLI_YEREL.fiyataDahilBaslik}</h4>${(pr.kampanyaDahil || []).map(k => `<div class="dahil-notu">✓ ${esc(k.metin)}</div>`).join('')}` : '';

  // Ürün görseli (yoksa ya da yüklenemezse gizlenir).
  // 2026-11-12: sabit 76×76 kutu (CLS yok), lazy + async decode, düşük öncelik.
  // `this.onerror = null` → kırık resim tekrar tekrar denenmez (bellek sızıntısı
  // ve sonsuz hata döngüsü önlenir).
  const resimHtml = p.image
    ? `<div class="kart-resim"><img src="${esc(p.image)}"
            alt="${esc(p.title || 'Ürün')}"
            width="76"
            height="76"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            onerror="this.onerror=null; this.parentElement.innerHTML='🏷️'" /></div>`
    : `<div class="kart-resim">🏷️</div>`;

  // Net Etkin Fiyat dökümü: satış fiyatından net tutara adım adım formül
  const dokumAdimlar = (pr.dokuem || []).filter(d =>
    ['cart_discount', 'coupon', 'bank_discount', 'shipping', 'fee', 'installment_surcharge'].includes(d.step) && d.amount !== 0);
  const dokumHtml = dokumAdimlar.length
    ? `<div class="fiyat-dokumu" title="${esc(dokumAdimlar.map(d => `${d.label}: ${tl(d.amount)}`).join(' | '))}">${CANLI_YEREL.hesapEtiketi} ${tl(pr.taban)}${dokumAdimlar.map(d => ` ${d.amount < 0 ? '−' : '+'}${tl(Math.abs(d.amount))}`).join('')}</div>`
    : '';
  const cashbackHtml = (pr.cashback || 0) > 0
    ? `<div class="fiyat-cashback">${CANLI_YEREL.cashbackSatir(tl(pr.cashback), tl(pr.etkinMaliyet))}</div>`
    : '';
  const kuponHtml = pr.kupon
    ? `<div class="fiyat-kupon" title="${esc(pr.kupon.metin)}">${CANLI_YEREL.kuponSatir(tl(pr.kupon.fiyat), tl(pr.kupon.indirimTutari), pr.kupon.kodu ? esc(pr.kupon.kodu) : '', pr.kupon.kosul ? esc(pr.kupon.kosul) : '')}</div>`
    : '';
  const kampanyaHtml = pr.kampanyaOnizleme
    ? `<div class="fiyat-kampanya" title="${esc(pr.kampanyaOnizleme.metin)}">${CANLI_YEREL.kampanyaOnizlemeSatir(tl(pr.kampanyaOnizleme.fiyat), pr.kampanyaOnizleme.kosul ? esc(pr.kampanyaOnizleme.kosul) : '')}</div>`
    : '';

  // 💡 Akıllı kargo eşiği ipucu (2026-11-12): ürün, mağazanın ücretsiz kargo
  // eşiğinin hemen altındaysa "sepete X ekle, kargo bedava" tavsiyesi.
  // Dürüstlük: eşik bilinmeli, kargo gerçekten ücretli olmalı, fark ≤ 80 TL
  // olmalı, ürün tükenmiş olmamalı. Aksi hâlde ipucu gösterilmez.
  const stoktaYok = p.inStock === false;
  const urunFiyati = Number(pr.toplam ?? pr.araToplam ?? p.sellingPrice ?? 0);
  const kargoUcreti = Number(pr.kargo?.ucret ?? 0);
  const ucretsizKargoEsigi = Number(
    pr.kargo?.freeOver
    ?? p.shippingInfo?.freeOver
    ?? p.shipping?.freeOver
    ?? 0,
  );
  const kargoEksik = ucretsizKargoEsigi - urunFiyati;
  const kargoEsikIpucuHtml = (!stoktaYok
    && Number.isFinite(ucretsizKargoEsigi) && ucretsizKargoEsigi > 0
    && kargoEksik > 0 && kargoEksik <= 80
    && kargoUcreti > 0)
    ? `<div class="kargo-esik-ipucu" title="${esc(CANLI_YEREL.kargoEsikTitle)}">${CANLI_YEREL.kargoEsikMetin(tl(kargoEksik), tl(kargoUcreti))}</div>`
    : '';

  return `<div class="urun-karti ${r.enUcuz ? 'en-ucuz' : ''} ${r.renkAyni === false ? 'farkli-renk' : ''} ${stoktaYok ? 'stok-yok' : ''}" data-site="${esc(r.site || '')}">
    ${r.enUcuz ? `<span class="ucuz-serit">${CANLI_YEREL.seritEnUcuz}</span>` : ''}
    ${stoktaYok ? `<span class="stok-yok-serit">${CANLI_YEREL.seritTukendi}</span>` : ''}
    ${!stoktaYok && r.renkAyni === false ? `<span class="farkli-renk-serit">${esc(CANLI_YEREL.seritFarkliRenk(renkYerellestir(p.color) || '?'))}</span>` : ''}
    <div class="kart-ust">
      ${resimHtml}
      <div class="kart-ust-sag">
        <div class="kart-site">
          <span class="site-adi">${siteAdiHtml(r.site, SITE_ADLARI[r.site] || r.siteName, p.url)}</span>
          <span class="eslesme-notu">${r.matchBasis && r.matchBasis.startsWith('semantik_yz') ? '🧠 DeepSeek YZ ' + r.matchBasis.replace('semantik_yz', '').trim() : (eslesme[r.matchBasis] || esc(r.matchBasis || ''))}</span>
        </div>
        <div class="kart-baslik"><a href="${esc(p.afiliyeUrl || p.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(r.site || '')}">${esc(p.title)}</a></div>
        <div class="kart-ozellikler">
          ${p.brand ? `<span class="rozet">${esc(p.brand)}</span>` : ''}
          ${p.color ? `<span class="rozet renk">${DIL_KOPYA_YEREL.renkEtiket}: ${esc(renkYerellestir(p.color))}</span>` : ''}
          ${p.modelCode ? `<span class="rozet">Model: ${esc(p.modelCode)}</span>` : ''}
          ${stoktaYok ? `<span class="rozet stok-yok">${CANLI_YEREL.kartStokYok}</span>` : `<span class="rozet stok-var">${CANLI_YEREL.kartStokVar}</span>`}
          ${!stoktaYok && Number(p.kalanStok) > 0 ? `<span class="rozet stok-az" title="${esc(CANLI_YEREL.kartSonStokTitle)}">${esc(CANLI_YEREL.kartSonStok(Number(p.kalanStok)))}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="kart-fiyat">
      ${p.enDusukFiyatNotu ? `<div class="magaza-dip-rozet" title="${esc(CANLI_YEREL.dipRozetTitle(SITE_ADLARI[r.site] || r.siteName || CANLI_YEREL.birimThMagaza))}">📉 ${esc(p.enDusukFiyatNotu)}</div>` : ''}
      ${pr.etiket && pr.etiket > (pr.araToplam ?? pr.taban) ? `<div class="etiket-fiyat ${r.sahteIndirim?.sahteIndirim ? 'supheli' : ''}"${r.sahteIndirim?.sahteIndirim ? ` tabindex="0" role="note" aria-label="${esc(r.sahteIndirim.tooltip)}"` : ''}>${tl(pr.etiket)}</div>` : ''}
      <div class="gercek-fiyat ${r.enUcuz ? 'ek' : ''}">${tl(pr.toplam ?? pr.araToplam ?? p.sellingPrice, p.currency)}</div>
      ${stoktaYok ? `<span class="stok-fiyat-rozet" title="${esc(CANLI_YEREL.tukendiRozetTitle)}">${esc(CANLI_YEREL.tukendiRozet)}</span>` : ''}
      ${r.sahteIndirim?.sahteIndirim ? `<span class="sahte-indirim-rozet" tabindex="0" role="note" aria-label="${esc(r.sahteIndirim.tooltip)}" data-ipucu="${esc(r.sahteIndirim.tooltip)}">${CANLI_YEREL.sahteIndirimRozet(esc(r.sahteIndirim.iddiaEdilenIndirim != null ? yuzdeStr(r.sahteIndirim.iddiaEdilenIndirim) : '—'), esc(yuzdeStr(r.sahteIndirim.gercekTasarruf ?? '0')))}</span>` : ''}
      ${r.sahteIndirim?.gercekFirsat ? `<span class="gercek-firsat-rozet" title="${esc(BASKI_ORTAM.dil && BASKI_ORTAM.dil !== 'tr' ? CANLI_YEREL.gercekFirsatTitle : (r.sahteIndirim.tooltip || CANLI_YEREL.gercekFirsatTitle))}">${CANLI_YEREL.gercekFirsatHtml}</span>` : ''}
      <div class="fiyat-at-not">
        ${pr.ekIndirim > 0 ? CANLI_YEREL.ozelIndirimDusuldu(tl(pr.ekIndirim)) : ''}
        ${pr.toplam != null
          ? (stoktaYok
            ? CANLI_YEREL.sonBilinenFiyat
            : (pr.kargo?.uygulanir === true && Number(pr.kargo?.ucret) > 0
              ? CANLI_YEREL.kargoDahilToplamDetay(tl(pr.araToplam ?? pr.taban), tl(pr.kargo.ucret))
              : (pr.kargo?.uygulanir === false
                ? CANLI_YEREL.kargoDahilToplamBedava
                : CANLI_YEREL.gercekOdenecek)))
          : CANLI_YEREL.fiyatHesaplanamadi}
      </div>
      ${dokumHtml}
      ${cashbackHtml}
      ${kuponHtml}
      ${kampanyaHtml}
      ${birimHtml}
      ${kdvHtml}
      ${baskiRozetHtml}
    </div>
    ${baskiWidgetHtml(bk, p.currency)}
    <div class="kart-kargo-alani">
      <div class="kart-kargo" title="${esc(pr.kargo?.aciklama || '')}">
        <span>${CANLI_YEREL.kargoSatirEtiket}</span>
        <span class="ucret">${pr.kargo?.uygulanir === true ? tl(pr.kargo.ucret) : (pr.kargo?.uygulanir === false ? CANLI_YEREL.kargoBedava : (pr.kargo?.freeOver ? CANLI_YEREL.kargoEsikSepette(tl(pr.kargo.freeOver)) : CANLI_YEREL.kargoSepetteBelli))}</span>
      </div>
      ${kargoEsikIpucuHtml}
      ${tamamlayiciButonu(pr, r)}
      <div class="tamamlayici-alan" hidden></div>
    </div>
    ${(kosulluHtml || taksitHtml || dahilHtml) ? `<div class="kampanya-bolumu">
      ${kosulluHtml ? `<h4>${CANLI_YEREL.kosulluBaslik}</h4>${kosulluHtml}` : ''}
      ${dahilHtml}${taksitHtml}
    </div>` : ''}
    <div class="kart-alt">
      ${Number(pr.toplam ?? pr.araToplam ?? p.sellingPrice) > 0 ? `<button type="button" class="alarm-btn" data-alarm-fiyat="${esc(String(pr.toplam ?? pr.araToplam ?? p.sellingPrice))}" data-alarm-site="${esc(r.site || '')}" title="${esc(CANLI_YEREL.alarmBtnTitle)}">${CANLI_YEREL.alarmBtn}</button>` : ''}
      ${p.url ? `<button type="button" class="sepete-ekle-btn" data-sepet-url="${esc(p.url)}" data-sepet-ad="${esc(p.title || '')}" data-sepet-site="${esc(SITE_ADLARI[r.site] || r.siteName || '')}" data-sepet-fiyat="${esc(String(pr.toplam ?? pr.araToplam ?? p.sellingPrice ?? ''))}" title="${esc(CANLI_YEREL.sepetBtnTitle)}">${CANLI_YEREL.sepetBtn}</button>` : ''}
      <button type="button" class="embed-btn" data-embed-q="${esc(p.title || '')}" title="${esc(CANLI_YEREL.embedBtnTitle)}">${CANLI_YEREL.embedBtn}</button>
      <span class="istek-notu">${kac(r.requestsSpent)} ${DIL_KOPYA_YEREL.istekBirimi}${(r.queriesTried || []).length ? ` · ${DIL_KOPYA_YEREL.sorguBirimi}: ` + esc((r.queriesTried || []).join(' / ')) : ''}${r.katalog ? ` · 🗂️ ${BASKI_ORTAM.dil === 'fr' ? 'catalogue' : (BASKI_ORTAM.dil === 'ja' ? 'カタログ' : (BASKI_ORTAM.dil === 'en' ? 'catalog' : 'katalog'))} (${Math.max(0, Math.round((Number(r.katalog.yasMs) || 0) / 60000))} ${DIL_KOPYA_YEREL.dkOnce})` : ''}</span>
      <a class="urun-link ${stoktaYok ? 'tukendi' : ''}" href="${esc(p.afiliyeUrl || p.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(r.site || '')}">${stoktaYok ? CANLI_YEREL.magazadaGorTukendi : CANLI_YEREL.magazadaGor}</a>
    </div>
  </div>`;
}

function tabloDoldur(sonuc) {
  const tbody = $('#ozetTablo tbody');
  // Tablo sırası kartlarla AYNI hiyerarşide (stokta olanlar önce).
  const siraliTablo = stokSirala(sonuc.sonuclar || []);

  tbody.innerHTML = siraliTablo.map(r => {
    if (r.status !== 'found' || !r.product) {
      const nedenMetni = magazaDurumNedeniYerellestir(r.reason || '');
      return `<tr>
        <td><b>${SITE_ADLARI[r.site] || r.site}</b></td><td colspan="5">${r.status === 'error' ? '⚠️ ' + esc(nedenMetni) : esc(nedenMetni || CANLI_YEREL.bulunamadiVarsayilan)}</td>
        <td>—</td><td>${kac(r.requestsSpent)}</td></tr>`;
    }
    const p = r.product, pr = p.pricing || {};
    const stoktaYok = p.inStock === false;
    const stokBadge = stoktaYok
      ? CANLI_YEREL.tabloStokYok
      : CANLI_YEREL.tabloStokVar;
    const kosullu = (pr.kampanyaKosullu || []).map(k => esc(k.metin)).join('<br>') || '—';
    const kargo = pr.kargo?.uygulanir === true ? tl(pr.kargo.ucret) : (pr.kargo?.uygulanir === false ? CANLI_YEREL.kargoBedava : (pr.kargo?.freeOver ? CANLI_YEREL.kargoSepetteBelli : (pr.kargo?.aciklama || CANLI_YEREL.kargoBilinmiyor)));
    return `<tr class="${stoktaYok ? 'stok-yok' : ''}">
      <td><b>${SITE_ADLARI[r.site] || r.site}</b>${r.enUcuz ? ' 🏷️' : ''}${dogrulanmisRozetHtml(r.site)}</td>
      <td><a href="${esc(p.afiliyeUrl || p.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(r.site || '')}" style="color:#3450D1">${esc(p.title.slice(0, 90))}</a></td>
      <td>${esc(p.color ? renkYerellestir(p.color) : '—')}${r.renkAyni === false ? CANLI_YEREL.tabloRenkFarkli : ''}</td>
      <td style="text-align:center">${stokBadge}</td>
      <td class="fiyat-hucre">${tl(pr.toplam ?? p.sellingPrice, p.currency)}</td>
      <td>${kosullu}</td>
      <td>${esc(kargo)}</td>
      <td>${kac(r.requestsSpent)}</td>
    </tr>`;
  }).join('');
}

// ---- Takip ----

$('#takipBtn').addEventListener('click', async () => {
  if (!sonSonuc) return;
  const hedef = parseFloat($('#hedefFiyat').value);
  if (!hedef || hedef <= 0) {
    $('#takipMesaj').className = 'takip-mesaj hata';
    $('#takipMesaj').textContent = 'Lütfen geçerli bir hedef fiyat girin.';
    return;
  }
  try {
    const res = await fetch('/api/tracked', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sonuc: sonSonuc, hedefFiyat: hedef }),
    });
    if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
    $('#takipMesaj').className = 'takip-mesaj ok';
    $('#takipMesaj').textContent = 'Ürün takibe alındı! Fiyat hedefin altına düşerse Ayarlar\'daki e-postaya bildirim gönderilir.';
  } catch (e) {
    $('#takipMesaj').className = 'takip-mesaj hata';
    $('#takipMesaj').textContent = e.message;
  }
});

// ---- Geçmiş ----

/** Host + kısa yol: "trendyol.com › logitech-g102-p-123" */
function linkEtiketi(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const yol = decodeURIComponent(u.pathname || '/').replace(/\/+$/, '');
    const kisa = yol.length > 42 ? yol.slice(0, 42) + '…' : yol;
    return host + (kisa && kisa !== '/' ? ' › ' + kisa.replace(/^\//, '') : '');
  } catch {
    return String(url || '').slice(0, 60);
  }
}

/**
 * Son aramalar listesi (2026-10-31): her satırda
 *  - ürün başlığı (kaynak linke gider),
 *  - kaynak ürün linki (host + yol),
 *  - en ucuz mağaza linki (varsa),
 *  - "Tekrar ara" düğmesi.
 */
async function gecmisiYukle() {
  try {
    const dil = window.BASKI_HESAP_ORTAM?.dil || 'tr';
    const pazar = window.BASKI_HESAP_ORTAM?.market || 'tr';
    const locale = dil === 'ja' ? 'ja-JP' : (dil === 'fr' ? 'fr-FR' : (dil === 'en' ? 'en-US' : 'tr-TR'));
    const txt = dil === 'en'
      ? { noLink: 'no link', cheapest: 'cheapest', shop: 'store', cheapestBadge: 'Cheapest', times: 'searches', again: '↻ Search again' }
      : (dil === 'fr'
        ? { noLink: 'aucun lien', cheapest: 'moins cher', shop: 'boutique', cheapestBadge: 'Moins cher', times: 'recherches', again: '↻ Rechercher' }
        : (dil === 'ja'
          ? { noLink: 'リンクなし', cheapest: '最安値', shop: 'ショップ', cheapestBadge: '最安値', times: '回検索', again: '↻ 再検索' }
          : { noLink: 'link yok', cheapest: 'en ucuz', shop: 'mağaza', cheapestBadge: 'En ucuz', times: 'kez arandı', again: '↻ Tekrar ara' }));
    const res = await fetch('/api/history?market=' + encodeURIComponent(pazar));
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return;

    // Aynı ürünün tekrar tekrar aranması listeyi doldurmasın: URL'ye göre
    // tekilleştir, en son aramayı göster ve kaç kez arandığını say.
    const gorulen = new Map();
    for (const h of list) {
      const anahtar = String(h.url || '').trim().toLowerCase();
      if (!anahtar) continue;
      if (gorulen.has(anahtar)) {
        gorulen.get(anahtar).adet += 1;
        continue;
      }
      gorulen.set(anahtar, { ...h, adet: 1 });
    }
    const benzersiz = [...gorulen.values()];

    $('#gecmisAlani').hidden = false;
    $('#gecmisListe').innerHTML = benzersiz.map(h => {
      const urunLinki = h.url
        ? `<a class="gecmis-link" href="${esc(h.url)}" target="_blank" rel="noopener"
             title="${esc(h.url)}">🔗 ${esc(linkEtiketi(h.url))}</a>`
        : `<span class="gecmis-link yok">${txt.noLink}</span>`;
      const enUcuzLinki = h.enUcuzUrl
        ? `<a class="gecmis-link en-ucuz-link" href="${esc(h.enUcuzUrl)}" target="_blank"
             rel="noopener sponsored" title="${esc(h.enUcuzUrl)}">🏪 ${txt.cheapestBadge}: ${esc(h.enUcuzSite || txt.shop)} ↗</a>`
        : '';
      return `<li class="gecmis-oge">
        <div class="gecmis-sol">
          <div class="gecmis-baslik">
            ${h.url
              ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.urun || h.url)}</a>`
              : `<b>${esc(h.urun || '?')}</b>`}
            ${h.adet > 1 ? `<span class="gecmis-adet" title="${h.adet} ${txt.times}">×${h.adet}</span>` : ''}
          </div>
          <div class="gecmis-meta">
            ${txt.cheapest}: <b>${esc(h.enUcuzSite || '—')}</b> (${tl(h.enUcuzFiyat)})
            <span class="gecmis-nokta">·</span> ${new Date(h.ts).toLocaleString(locale)}
          </div>
          <div class="gecmis-linkler">${urunLinki}${enUcuzLinki}</div>
        </div>
        <div class="gecmis-sag">
          ${h.url ? `<button type="button" class="gecmis-tekrar" data-url="${esc(h.url)}">${txt.again}</button>` : ''}
        </div>
      </li>`;
    }).join('');
  } catch { /* sessizce geç */ }
}

// "Tekrar ara": linki hibrit kutuya koyup aramayı başlatır.
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('.gecmis-tekrar');
  if (!btn) return;
  const url = btn.dataset.url;
  if (!url) return;
  const input = $('#urunUrl');
  if (!input) return;
  input.value = url;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const form = $('#karsilastirForm');
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

gecmisiYukle();

// ---- Sayfa yenilendiğinde (F5) temiz başla; çalışan tarama varsa sunucuda iptal et ----
window.addEventListener('pagehide', () => {
  try { tumAkislariKapat(); } catch { }
  if (aktifIs && $('#araBtn')?.disabled && typeof navigator.sendBeacon === 'function') {
    try { navigator.sendBeacon('/api/compare/' + encodeURIComponent(aktifIs) + '/iptal'); } catch { }
  }
});

(() => {
  try { localStorage.removeItem('son_arama'); } catch { }
  const aramaParams = new URLSearchParams(window.location.search);
  const urlParam = aramaParams.get('url') || aramaParams.get('q');
  const otomatikHayir = aramaParams.get('otomatik') === '0';
  if (!urlParam) return;

  const input = document.getElementById('urunUrl');
  if (input) input.value = urlParam;
  if (otomatikHayir) {
    if (!linkGibiMi(urlParam)) modAyarla('ad');
    return;
  }
  setTimeout(() => {
    const form = document.getElementById('karsilastirForm');
    if (form) {
      if (form.requestSubmit) form.requestSubmit();
      else document.getElementById('araBtn')?.click();
    }
  }, 150);
})();

// ================== "Ne almak istiyorsun?" öneri akışı ==================

const ONERI_SITE_ADLARI = SITE_ADLARI;

$('#oneriForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ihtiyac = $('#ihtiyacMetni').value.trim();
  $('#oneriHata').hidden = true;
  if (!ihtiyac) return;

  $('#oneriBtn').disabled = true;
  $('#oneriBtn').textContent = 'Çalışıyor…';
  $('#oneriSonuc').hidden = true;
  $('#oneriDurum').hidden = false;
  $('#oneriCipleri').innerHTML = '';
  $('#oneriFazNotu').textContent = 'İhtiyaç analiz ediliyor…';
  // ⏱️ Sayaç + iptal butonu sıfırdan başlar.
  oneriKismiSonuclar = [];
  const kismiKap = $('#oneriKismiKartlar');
  if (kismiKap) { kismiKap.hidden = true; kismiKap.innerHTML = ''; }
  oneriAsamaGuncelle('sorgu');
  oneriSayaciBaslat();
  const durdurBtn = $('#oneriDurdurBtn');
  if (durdurBtn) { durdurBtn.hidden = false; durdurBtn.disabled = false; durdurBtn.textContent = '⏹️ Durdur & Bulunanları Göster'; }

  try {
    const res = await fetch('/api/oneri', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ihtiyac }),
    });
    const data = await guvenliJson(res);
    if (!res.ok) throw new Error(data.hata || 'İstek başarısız');
    try {
      if (window.gtag) window.gtag('event', 'urun_oneri', { sorgu: String(ihtiyac || '').slice(0, 100) });
    } catch { }
    oneriIzle(data.id ?? data.isId);
  } catch (err) {
    oneriHataGoster(err.message);
  }
});

// ⏹️ "Durdur & Bulunanları Göster" — akışı iptal eder, o ana kadarki kartları basar.
const oneriDurdurBtnEl = $('#oneriDurdurBtn');
if (oneriDurdurBtnEl) {
  oneriDurdurBtnEl.addEventListener('click', () => { oneriDurdur(); });
}

function oneriHataGoster(mesaj) {
  oneriSayaciDurdur();
  oneriAktifId = null;
  const durdurBtn = $('#oneriDurdurBtn');
  if (durdurBtn) durdurBtn.hidden = true;
  $('#oneriBtn').disabled = false;
  $('#oneriBtn').textContent = 'Öneri al';
  $('#oneriDurum').hidden = true;
  $('#oneriHata').textContent = mesaj;
  $('#oneriHata').hidden = false;
}

/** Öneri butonunu başlangıç durumuna alır. */
function oneriBtnSifirla() {
  oneriSayaciDurdur();
  oneriAktifId = null;
  const durdurBtn = $('#oneriDurdurBtn');
  if (durdurBtn) durdurBtn.hidden = true;
  $('#oneriBtn').disabled = false;
  $('#oneriBtn').textContent = 'Öneri al';
}

/**
 * Tek bir öneri işi verisini ekrana uygular (SSE + polling ORTAK).
 * @returns {'devam'|'bitti'}
 */
function oneriIsle(job) {
  if (!job || typeof job !== 'object') {
    oneriBtnSifirla();
    oneriHataGoster('Sunucu yanıtı geçersiz.');
    return 'bitti';
  }
  if (job.status === 'running' || job.status === 'pending') {
    oneriProgressGoster(job.progress);
    return 'devam';
  }
  if (job.status === 'interrupted') {
    oneriBtnSifirla();
    oneriHataGoster(job.error || 'Sunucu yeniden başlatıldı; iş yarıda kaldı. Lütfen tekrar deneyin.');
    return 'bitti';
  }
  if (job.status === 'error') {
    oneriBtnSifirla();
    oneriHataGoster(job.error || 'Bilinmeyen hata');
    return 'bitti';
  }
  if (job.status !== 'done') {
    oneriBtnSifirla();
    oneriHataGoster(`Beklenmeyen durum: ${job.status}`);
    return 'bitti';
  }
  if (!job.result || typeof job.result !== 'object') {
    oneriBtnSifirla();
    oneriHataGoster('Öneri sonucu bulunamadı.');
    return 'bitti';
  }

  // 🛑 Kullanıcı akışı durdurduysa sunucudan gelen boş "iptal" sonucu, ekrandaki
  // kısmi kartların ÜZERİNE yazmamalı.
  if (job.result.iptalEdildi && !Array.isArray(job.result.oneriler)) {
    oneriBtnSifirla();
    return 'bitti';
  }
  if (job.result.iptalEdildi && job.result.oneriler.length === 0 && oneriKismiSonuclar.length) {
    oneriBtnSifirla();
    return 'bitti';
  }

  oneriBtnSifirla();
  oneriProgressGoster(job.progress);
  oneriSonucGoster(job.result);
  return 'bitti';
}

/** Öneri işini SSE ile canlı izler; koparsa polling'e düşer (2026-10-29). */
function oneriIzle(id) {
  if (!id) {
    oneriHataGoster('İş kimliği alınamadı.');
    return;
  }
  oneriAktifId = id;
  const durdurBtn = $('#oneriDurdurBtn');
  if (durdurBtn) durdurBtn.hidden = false;
  canliIzle(id, { etiket: 'oneri', isle: oneriIsle, yedekPoll: oneriPoll });
}

/** HTTP polling (SSE yedeği). 1000 ms. */
function oneriPoll(id) {
  if (!id) {
    oneriHataGoster('İş kimliği alınamadı.');
    return;
  }
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/api/oneri/' + encodeURIComponent(id));
      const job = await guvenliJson(res);
      if (!res.ok) {
        clearInterval(timer);
        oneriBtnSifirla();
        oneriHataGoster(job?.hata || `Sunucu hatası (${res.status})`);
        return;
      }
      if (oneriIsle(job) === 'bitti') clearInterval(timer);
    } catch (e) {
      clearInterval(timer);
      oneriBtnSifirla();
      oneriHataGoster(e.message || String(e));
    }
  }, 1000);
}


/* ================= ⏱️ Öneri akışı: sayaç, aşama, iptal (2026-11-14) =================
 *
 * SORUN: Danışman akışında geçen süre, hangi aşamada olduğumuz ve "durdur"
 * imkânı yoktu; kullanıcı dakikalarca statik çiplere bakıyordu.
 *
 * ÇÖZÜM: Sayaç + aşama şeridi + "Durdur & Bulunanları Göster" butonu. Ayrıca
 * sunucudan gelen `modelTamamlandi` olayı kart ANINDA ekrana basılır (kısmi
 * akış) — tüm modellerin bitmesini beklemeyiz.
 */
let oneriSayacTimer = null;
let oneriBasladiTs = 0;
let oneriAktifId = null;
let oneriKismiSonuclar = [];

const ONERI_ASAMALAR = [
  { anahtar: 'sorgu', etiket: 'İhtiyaç' },
  { anahtar: 'arama', etiket: 'Mağaza Taraması' },
  { anahtar: 'secim', etiket: 'Model Seçimi' },
  { anahtar: 'karsilastirma', etiket: 'Fiyat Karşılaştırması' },
];

function oneriSayaciBaslat() {
  oneriSayaciDurdur();
  oneriBasladiTs = Date.now();
  const guncelle = () => {
    const el = $('#oneriSayac');
    if (!el) return;
    const sn = Math.max(0, Math.floor((Date.now() - oneriBasladiTs) / 1000));
    el.textContent = `⏱️ ${sn} sn`;
  };
  guncelle();
  oneriSayacTimer = setInterval(guncelle, 1000);
}

function oneriSayaciDurdur() {
  if (oneriSayacTimer) { clearInterval(oneriSayacTimer); oneriSayacTimer = null; }
}

/** Aşama şeridi: geçmiş ✓, aktif ●, gelecek ○ */
function oneriAsamaGuncelle(faz) {
  const el = $('#oneriAsama');
  if (!el) return;
  const aktifIdx = Math.max(0, ONERI_ASAMALAR.findIndex(a => a.anahtar === faz));
  el.innerHTML = ONERI_ASAMALAR.map((a, i) => {
    const durum = faz === 'bitti' ? 'tamam'
      : i < aktifIdx ? 'tamam' : i === aktifIdx ? 'aktif' : 'bekliyor';
    const isaret = durum === 'tamam' ? '✓' : durum === 'aktif' ? '●' : '○';
    return `<span class="asama ${durum}">${isaret} ${esc(a.etiket)}</span>`;
  }).join('<span class="asama-ok" aria-hidden="true">→</span>');
}

function oneriKismiKartEkle(oneriler) {
  const kap = $('#oneriKismiKartlar');
  if (!kap) return;
  oneriKismiSonuclar = oneriler;
  kap.hidden = false;
  kap.innerHTML = oneriler.map((o) => {
    // İki şekil desteklenir: ham öneri nesnesi (karsilastirma.ozet) veya
    // SSE'den gelen hafif özet (fiyat/site düz alanlar).
    const oz = o?.karsilastirma?.ozet;
    let fiyatDegeri = oz?.enUcuzFiyat ?? o?.fiyat ?? null;
    let tukendi = false;
    let site = oz?.enUcuzSite || o?.site || '';
    // 🧭 Dürüstlük: en ucuz fiyat yalnızca STOKTAKİ tekliflerden hesaplanır.
    // Tamamı tükenmişse enUcuzFiyat null gelir; o zaman bulunan en düşük fiyatı
    // "tükendi" etiketiyle gösteririz (fiyatı gizlemek bilgi saklamak olurdu).
    if (fiyatDegeri == null && Array.isArray(o?.karsilastirma?.sonuclar)) {
      const bulunanlar = o.karsilastirma.sonuclar
        .filter(s => s.status === 'found' && s.product)
        .map(s => ({
          site: s.siteName || s.site,
          fiyat: s.product.pricing?.toplam ?? s.product.sellingPrice ?? null,
          stoktaYok: s.product.inStock === false,
        }))
        .filter(s => s.fiyat != null)
        .sort((a, b) => a.fiyat - b.fiyat);
      if (bulunanlar.length) {
        fiyatDegeri = bulunanlar[0].fiyat;
        site = bulunanlar[0].site;
        tukendi = bulunanlar.every(b => b.stoktaYok);
      }
    }
    const fiyat = fiyatDegeri != null ? tl(fiyatDegeri) : '—';
    return `<article class="oneri-kismi-kart${tukendi ? ' tukendi' : ''}">
      <div class="oneri-kismi-baslik">${esc(String(o?.model || '').slice(0, 70))}</div>
      <div class="oneri-kismi-fiyat">${fiyat}${site ? ` <small>· ${esc(site)}</small>` : ''}</div>
      <div class="oneri-kismi-not">${tukendi ? '🔴 Tüm mağazalarda tükendi' : '✅ Karşılaştırma tamamlandı'}</div>
    </article>`;
  }).join('');
}

/** Durdur: iş iptali + o ana kadar bulunanları göster. */
async function oneriDurdur() {
  const btn = $('#oneriDurdurBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Durduruluyor…'; }
  try {
    if (oneriAktifId) {
      await fetch('/api/oneri/' + encodeURIComponent(oneriAktifId) + '/iptal', { method: 'POST' })
        .catch(() => null);
    }
  } finally {
    tumAkislariKapat();
    oneriSayaciDurdur();
    if (btn) { btn.disabled = false; btn.textContent = '⏹️ Durdur & Bulunanları Göster'; btn.hidden = true; }
    if (oneriKismiSonuclar.length) {
      oneriSonucGoster({ oneriler: oneriKismiSonuclar, kismi: true, butce: null, istenenRenk: null });
    } else {
      oneriHataGoster('Tarama durduruldu. Henüz tamamlanmış model yok — tekrar deneyebilirsin.');
    }
  }
}

function oneriProgressGoster(p) {
  if (!p) return;
  // Aşama şeridi: her ilerleme olayında güncel fazı işaretle.
  oneriAsamaGuncelle(p.faz);
  if (p.watchdog) {
    const uy = $('#oneriFazNotu');
    if (uy) uy.textContent = 'Süre sınırı doldu — tamamlanan sonuçlar gösteriliyor…';
  }
  // ⚡ Kısmi akış: bir model biter bitmez kartı bas (tümünü beklemeyiz).
  if (p.modelTamamlandi && p.modelSonuc) {
    const varOlan = oneriKismiSonuclar.filter(o => o.model !== p.modelSonuc.model);
    oneriKismiKartEkle([...varOlan, p.modelSonuc]);
  }
  const fazNotlari = {
    sorgu: 'İhtiyaç analiz ediliyor…',
    arama: 'Sitelerde arama yapılıyor…',
    secim: 'Adaylar arasından sana uygun 3 model seçiliyor…',
    karsilastirma: 'Seçilen modellerin fiyatları karşılaştırılıyor…',
  };
  let not = fazNotlari[p.faz] || 'Çalışılıyor…';
  if (p.faz === 'arama' && p.aramaSorgusu) not = `“${esc(p.aramaSorgusu)}” sorgusuyla sitelerde aranıyor…`;
  if (p.faz === 'arama' && p.renk) not = `“${esc(p.aramaSorgusu)}” + renk “${esc(p.renk)}” ile aranıyor (farklı renkler elenecek)…`;
  if (p.faz === 'sorgu' && p.renk) not = `Renk isteği algılandı: “${esc(p.renk)}” — uygun tonlar aranacak…`;
  if (p.faz === 'karsilastirma') {
    const biten = p.biten != null ? p.biten : null;
    not = biten != null
      ? `${biten}/${p.modelToplam} model tamamlandı · ${esc(String(p.model).slice(0, 60))} karşılaştırılıyor…`
      : `${p.modelNo + 1}/${p.modelToplam} · ${esc(String(p.model).slice(0, 70))} karşılaştırılıyor…`;
  }
  $('#oneriFazNotu').textContent = not;

  if (p.faz === 'arama' && p.siteler) {
    $('#oneriCipleri').innerHTML = Object.entries(p.siteler).map(([s, v]) =>
      `<span class="cip ${v.status === 'ok' ? 'bulundu' : v.status === 'hata' ? 'hata' : 'calisiyor'}">
        <span class="nokta"></span>${ONERI_SITE_ADLARI[s] || s}${v.adaySayisi != null ? ' · ' + v.adaySayisi + ' aday' : ''}</span>`).join('');
  } else if (p.faz === 'karsilastirma') {
    // Modeller paralel karşılaştırılır; "biten" sayısı tamamlananları işaretler
    const biten = p.biten != null ? p.biten : p.modelNo;
    const toplam = p.modelToplam || 5;
    $('#oneriCipleri').innerHTML = Array.from({ length: toplam }, (_, i) =>
      `<span class="cip ${i < biten ? 'bulundu' : i === biten ? 'calisiyor' : ''}">
        <span class="nokta"></span>Model ${i + 1}</span>`).join('');
  }
}

function oneriSonucGoster(sonuc) {
  if (!sonuc || typeof sonuc !== 'object') {
    oneriHataGoster('Sunucudan geçerli bir öneri sonucu alınamadı.');
    return;
  }
  $('#oneriDurum').hidden = true;
  $('#oneriSonuc').hidden = false;
  const b = sonuc?.butce ? ` (bütçe: ${tl(sonuc.butce)})` : '';
  const r = sonuc?.istenenRenk ? ` · renk: ${sonuc.istenenRenk.metin}` : '';
  const oneriler = Array.isArray(sonuc?.oneriler) ? sonuc.oneriler : [];
  // 🛑 İptal edildi ve hiçbir model tamamlanmadıysa "0 model" demek yanıltıcı.
  if (sonuc?.iptalEdildi && !oneriler.length) {
    $('#oneriDurum').hidden = true;
    $('#oneriSonuc').hidden = true;
    oneriHataGoster('Tarama durduruldu. Henüz tamamlanmış model yok — tekrar deneyebilirsin.');
    return;
  }
  $('#oneriBaslik').textContent = `Sana uygun ${oneriler.length} model${b}${r}`
    + (sonuc?.kismi ? ' · kısmi sonuç' : '');

  // Kart sırası: en düşük fiyatlı model önce (bulunamayanlar sona).
  // Orijinal dizin korunur ki takip butonu doğru ürünü kaydetsin.
  const enDusukFiyat = o => o.karsilastirma?.ozet?.enUcuzFiyat ?? Infinity;
  const sirali = oneriler
    .map((o, i) => ({ o, i }))
    .sort((a, x) => enDusukFiyat(a.o) - enDusukFiyat(x.o));
  $('#oneriKartlar').innerHTML = sirali.map(({ o, i }, sira) => oneriKartHtml(o, i, sonuc, sira)).join('');

  // Takip butonlari
  document.querySelectorAll('.oneri-takip-btn').forEach(btn => {    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const o = sonuc.oneriler[idx];
      if (!o?.karsilastirma) return;
      const hedef = parseFloat(btn.closest('.takip-satir').querySelector('input').value);
      const mesajEl = btn.closest('.onerilen-kart').querySelector('.takip-mesaj');
      if (!hedef || hedef <= 0) {
        mesajEl.className = 'takip-mesaj hata';
        mesajEl.textContent = 'Geçerli bir hedef fiyat gir.';
        return;
      }
      try {
        const res = await fetch('/api/tracked', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sonuc: o.karsilastirma, hedefFiyat: hedef }),
        });
        if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
        mesajEl.className = 'takip-mesaj ok';
        mesajEl.textContent = 'Takip listesine eklendi!';
      } catch (e) {
        mesajEl.className = 'takip-mesaj hata';
        mesajEl.textContent = e.message;
      }
    });
  });

  // "Devamını göster": tablonun gizli satırlarını açar
  document.querySelectorAll('.tablo-devami-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const kart = btn.closest('.onerilen-kart');
      kart.querySelectorAll('tr.gizli-satir').forEach(tr => tr.classList.remove('gizli-satir'));
      btn.remove();
    });
  });

  // 🔎 "N mağazada tam tara": aynı ürünün linkini ana forma koyup tam taramayı başlatır.
  document.querySelectorAll('.tam-tara-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hedef = btn.dataset.url;
      const girdi = $('#urunUrl');
      if (!hedef || !girdi) return;
      btn.disabled = true;
      btn.textContent = 'Tam tarama başlatılıyor…';
      girdi.value = hedef;
      const form = $('#karsilastirForm');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });

  $('#oneriSonuc').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const ONERI_GORUNEN_SITE = 5; // her modelin tablosunda başlangıçta gösterilen site sayısı

function oneriKartHtml(o, i, sonuc, sira) {
  const k = o.karsilastirma;
  let tabloHtml = '';
  if (o.hata || !k) {
    tabloHtml = `<div class="bulunamadi-karti">${o.hata ? '⚠️ ' + esc(o.hata) : 'Karşılaştırma yapılamadı'}</div>`;
  } else {
    // Satır sırası: kartlarla AYNI stok hiyerarşisi (stokta olanlar önce).
    const siraliSatirlar = stokSirala(k.sonuclar || []);
    const rows = siraliSatirlar.map((r, idx) => {
      const ekSinif = idx >= ONERI_GORUNEN_SITE ? ' gizli-satir' : '';
      if (r.status !== 'found' || !r.product) {
        return `<tr class="bulunamadi${ekSinif}"><td>${ONERI_SITE_ADLARI[r.site] || r.siteName}</td><td colspan="2">${esc(r.reason || 'Bulunamadı')}</td></tr>`;
      }
      const pr = r.product.pricing || {};
      const stoktaYok = r.product.inStock === false;
      return `<tr class="${r.enUcuz ? 'en-ucuz' : ''}${stoktaYok ? ' stok-yok' : ''}${ekSinif}">
        <td>${ONERI_SITE_ADLARI[r.site] || r.siteName}${r.enUcuz ? ' 🏷️' : ''}${r.renkAyni === false ? ' <span class="rozet renk">farklı renk</span>' : ''}${stoktaYok ? ' <span class="stok-hucre-yok" style="font-size:10.5px;padding:1px 5px;">🔴 Tükendi</span>' : ''}</td>
        <td>${esc(r.product.color || '—')}</td>
        <td class="fiyat">${tl(pr.toplam ?? r.product.sellingPrice)}</td>
      </tr>`;
    }).join('');
    const kalan = Math.max(0, siraliSatirlar.length - ONERI_GORUNEN_SITE);
    tabloHtml = `<table class="mini-tablo">
      <thead><tr><th>Site</th><th>Renk</th><th>Gerçek fiyat</th></tr></thead>
      <tbody>${rows}</tbody></table>`
      + (kalan > 0 ? `<button type="button" class="tablo-devami-btn">Devamını göster (${kalan} site)</button>` : '');
  }
  const enUcuz = k?.ozet?.enUcuzSite ? `<div class="kaynak">En ucuz: <b>${esc(k.ozet.enUcuzSite)}</b> · ${tl(k.ozet.enUcuzFiyat)}</div>` : '';
  // Renk bilgisi: kullanıcı renk istediyse okunan gerçek renk gösterilir; uyuşmazsa dürüst uyarı.
  let renkSatiri = '';
  if (o.istenenRenk) {
    const okunan = o.okunanRenk;
    if (o.renkUyusmuyor) {
      renkSatiri = `<div class="renk-notu hata">⚠️ İstenen renk: <b>${esc(o.istenenRenk)}</b> — bu üründe${okunan ? ' okunan renk <b>' + esc(okunan) + '</b>' : ' renk doğrulanamadı'}; uygun renkte başka aday bulunamadı.</div>`;
    } else {
      renkSatiri = `<div class="renk-notu">🎨 İstenen renk: <b>${esc(o.istenenRenk)}</b>${okunan ? ' · okunan renk: <b>' + esc(okunan) + '</b>' : ' · ürün sayfasında renk bilgisi yok'}${o.degistirildi ? ' · <i>renk doğrulaması sonrası bu aday seçildi</i>' : ''}</div>`;
    }
  }
  const varsayilanHedef = (sonuc && sonuc.butce) || (k?.ozet?.enUcuzFiyat ? Math.floor(k.ozet.enUcuzFiyat * 0.9) : '');
  // 🔎 Kapsam dürüstlüğü: hızlı turda kaç mağaza tarandığı yazar; tam tarama sunulur.
  const kapsam = sonuc?.kapsam;
  const kapsamSatiri = kapsam && !o.hata
    ? `<div class="kapsam-satiri">🔎 ${kapsam.tarananSite} mağaza tarandı${
      kapsam.toplamSite > kapsam.tarananSite
        ? ` · <button type="button" class="tam-tara-btn" data-url="${esc(o.url || '')}">${kapsam.toplamSite} mağazada tam tara</button>`
        : ''
    }</div>`
    : '';
  return `<div class="onerilen-kart">
    <div class="ust">
      <span class="sira">${(sira ?? i) + 1}</span>
      <div>
        <div class="model-adi"><a href="${esc(o.afiliyeUrl || o.karsilastirma?.kaynak?.afiliyeUrl || o.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(o.kaynakSiteId || '')}">${esc(o.model)}</a></div>
        <div class="kaynak">Öneri kaynağı: ${esc(o.kaynakSite)}${o.adayFiyat != null ? ' · liste fiyatı ' + tl(o.adayFiyat) : ''}</div>
        ${enUcuz}
        ${renkSatiri}
      </div>
    </div>
    <div class="neden"><b>Neden bu model?</b> ${esc(o.neden)}</div>
    ${tabloHtml}
    ${kapsamSatiri}
    <div class="takip-satir">
      <input type="number" min="1" step="0.01" placeholder="Hedef fiyat" value="${varsayilanHedef}" />
      <button class="oneri-takip-btn" data-idx="${i}">Takibe al</button>
      <span class="takip-mesaj"></span>
    </div>
  </div>`;
}






// ============ 30 Günlük Fiyat Trendi & Grafik Sistemi ============
let chartInstance = null;
let sonTimeline = null; // tema değişince grafiği yeniden çizmek için

// 🌓 Tema değişince grafik renkleri de yenilenir (2026-10-30).
window.addEventListener('tema:degisti', () => {
  if (!sonTimeline || typeof Chart === 'undefined') return;
  try { cizFiyatGrafigi(sonTimeline); } catch { /* grafik yoksa yoksay */ }
});

async function fiyatGrafiginiYukle(sonuc) {
  const panel = $("#fiyatGecmisiAlani");
  if (!panel || !sonuc) return;

  const k = sonuc.kaynak || {};
  const found = (sonuc.sonuclar || []).filter(r => r.status === "found" && r.product?.pricing);

  // Panelin alt bölümleri: veri yetersizse uydurma grafik yerine açıklama gösterilir.
  const istGrid = panel.querySelector(".fiyat-istatistik-izgarasi");
  const grafikKap = panel.querySelector(".grafik-kapsayici");
  const notEl = $("#fiyatGecmisNotu");
  const rozet = $("#fiyatTavsiyeRozeti");

  const yetersizGoster = (metin) => {
    panel.hidden = false;
    sonBentoSeri = null;
    if (istGrid) istGrid.hidden = true;
    if (grafikKap) grafikKap.hidden = true;
    if (rozet) {
      rozet.textContent = CANLI_YEREL.trendVeriBirikiyor;
      rozet.className = "fiyat-tavsiye-rozet badge-turuncu";
    }
    if (notEl) {
      notEl.hidden = false;
      notEl.textContent = metin;
    }
    const ozet = $("#fiyatTrendOzetMetin");
    if (ozet) ozet.textContent = CANLI_YEREL.trendHenuzYetersiz;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  };

  const pid = k.modelKodu || k.barkod || k.urun;
  if (!pid) {
    panel.hidden = true;
    return;
  }

  const currentPrices = found
    .map(r => r.product.pricing.toplam ?? r.product.pricing.netFiyat)
    .filter(p => p != null && !isNaN(p));
  const curMin = currentPrices.length ? Math.min(...currentPrices) : null;

  try {
    const res = await fetch("/api/price-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: pid,
        currentPrice: curMin,
        currentItems: found
      })
    });
    if (!res.ok) { panel.hidden = true; return; }
    const data = await res.json();
    if (!data) { panel.hidden = true; return; }

    // Geçmiş yok: UYDURMA GRAFİK ÇİZİLMEZ, dürüst açıklama gösterilir.
    if (!data.summary || !Array.isArray(data.timeline) || data.timeline.length === 0) {
      yetersizGoster((BASKI_ORTAM.dil && BASKI_ORTAM.dil !== 'tr') ? CANLI_YEREL.trendHicYokMesaj : (data.neden || CANLI_YEREL.trendHicYokMesaj));
      return;
    }
    // Tek nokta "trend" değildir: çizgi yerine açıklama gösterilir.
    if (data.timeline.length < 2) {
      yetersizGoster((BASKI_ORTAM.dil && BASKI_ORTAM.dil !== 'tr')
        ? CANLI_YEREL.trendAzGunMesaj(data.gunSayisi ?? data.timeline.length)
        : (data.neden || CANLI_YEREL.trendAzGunMesaj(data.gunSayisi)));
      return;
    }

    panel.hidden = false;
    if (istGrid) istGrid.hidden = false;
    if (grafikKap) grafikKap.hidden = false;
    if (notEl) notEl.hidden = true;

    const s = data.summary;
    const gun = s.gunSayisi || data.timeline.length;

    // Etiketler gerçek pencereyi söyler ("30 Günün" değil "Son N Günün")
    const etDusuk = $("#istatistikEtiketDusuk");
    const etOrta = $("#istatistikEtiketOrtalama");
    const etYuksek = $("#istatistikEtiketYuksek");
    if (etDusuk) etDusuk.textContent = CANLI_YEREL.trendDusukEtiket(gun);
    if (etOrta) etOrta.textContent = CANLI_YEREL.trendOrtEtiket(gun);
    if (etYuksek) etYuksek.textContent = CANLI_YEREL.trendYuksekEtiket(gun);

    $("#istatistikEnDusuk").textContent = tl(s.lowestPrice);
    $("#istatistikOrtalama").textContent = tl(s.avgPrice);
    $("#istatistikEnYuksek").textContent = tl(s.highestPrice);

    const farkEl = $("#istatistikFark");
    if (farkEl) {
      if (s.diffFromAvg > 0) {
        farkEl.textContent = CANLI_YEREL.trendAvantajli(yuzdeStr(s.diffFromAvg));
        farkEl.style.color = "#0d9f4e";
      } else if (s.diffFromAvg < 0) {
        farkEl.textContent = CANLI_YEREL.trendPahali(yuzdeStr(Math.abs(s.diffFromAvg)));
        farkEl.style.color = "#d43c3c";
      } else {
        farkEl.textContent = CANLI_YEREL.trendOrtalamada;
        farkEl.style.color = "var(--gri-metin)";
      }
    }

    const indirimOraniEl = $("#istatistikIndirimOrani");
    if (indirimOraniEl) {
      indirimOraniEl.textContent = imzaliYuzde(s.diffFromAvg);
      indirimOraniEl.className = "istatistik-deger " + (s.diffFromAvg > 0 ? "font-yesil" : (s.diffFromAvg < 0 ? "font-kirmizi" : ""));
    }

    if (rozet) {
      rozet.textContent = trendTavsiyeYerellestir(s, s.recommendationText);
      rozet.className = "fiyat-tavsiye-rozet " + (s.badgeClass || "badge-turuncu");
    }

    // Alt metin: gerçek gün sayısı + bu sonuçta okunan mağaza sayısı + gözlem sayısı
    const ozetMetin = $("#fiyatTrendOzetMetin");
    if (ozetMetin) {
      ozetMetin.textContent = CANLI_YEREL.trendOzetAlt(gun, s.toplamKayit, found.length);
    }

    sonBentoSeri = data.timeline;
    try { bentoSparklineCiz(data.timeline); } catch { /* yoksay */ }
    cizFiyatGrafigi(data.timeline);
  } catch (err) {
    console.warn("Fiyat grafiği yüklenemedi:", err);
    panel.hidden = true;
  }
}

function cizFiyatGrafigi(timeline) {
  const canvas = document.getElementById("fiyatGrafigiCanvas");
  if (!canvas) return;
  canvas.setAttribute('aria-label', CANLI_YEREL.bentoTrendAria(timeline.length || 30));

  if (typeof Chart === "undefined") {
    console.warn("Chart.js kütüphanesi hazır değil.");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = timeline.map(t => t.label);
  const lowestData = timeline.map(t => t.lowest);
  const avgData = timeline.map(t => t.average);

  // Tema değişince grafik yeniden çizilebilsin.
  sonTimeline = timeline;
  const stil = getComputedStyle(document.documentElement);
  const metinRengi = (stil.getPropertyValue('--gri-metin-hafif') || '#64748B').trim();
  const izgaraRengi = document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.9)';

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, "rgba(16, 185, 129, 0.24)");
  gradient.addColorStop(0.65, "rgba(99, 102, 241, 0.06)");
  gradient.addColorStop(1, "rgba(16, 185, 129, 0.01)");

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: CANLI_YEREL.grafikEnDusuk,
          data: lowestData,
          borderColor: "#10B981",
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointBackgroundColor: "#10B981",
        },
        {
          label: CANLI_YEREL.grafikOrt30,
          data: avgData,
          borderColor: "#94a3b8",
          borderWidth: 1.8,
          borderDash: [5, 5],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 12,
            font: { size: 12, weight: "600", family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" },
            color: metinRengi
          }
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.94)",
          titleFont: { size: 12, weight: "bold", family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" },
          bodyFont: { size: 12, family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" },
          padding: 11,
          cornerRadius: 12,
          displayColors: true,
          callbacks: {
            label: function(context) {
              return " " + context.dataset.label + ": " + tl(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: metinRengi,
            font: { size: 11, family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: izgaraRengi, drawTicks: false },
          border: { display: false },
          ticks: {
            color: metinRengi,
            font: { size: 11, family: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" },
            padding: 8,
            callback: function(val) {
              return BASKI_ORTAM.currency && BASKI_ORTAM.currency !== 'TRY' ? tl(val) : (val.toLocaleString("tr-TR") + " TL");
            }
          }
        }
      }
    }
  });
}

/* ============================================================================
 * SEPET OPTİMİZASYONU (2026-10-27)
 * 2-10 ürün linki → sitelerde ara → kargo eşikleriyle 3 senaryo.
 * ========================================================================== */

let sepetAktifIs = null;
let sepetTimer = null;

/* 2026-11-12: sepet kıyas barı + kargo paket kutuları için ortak hesap modülü.
 * app.js klasik script olduğu için dinamik import edilir ve `window` üzerinde
 * bir kez tutulur. Modül gelmeden çizim yapılırsa kutular sade görünür
 * (boş ekran yok); modül gelince sonuç yeniden çizilir. */
async function sepetHesapModulunuYukle() {
  if (window.sepetHesapModul) return window.sepetHesapModul;
  try {
    window.sepetHesapModul = await import('/sepetHesap.js');
    // Modül geç geldiyse son sonucu yeni görselle yeniden çiz.
    if (sonSepetSonuc) sepetSonucGoster(sonSepetSonuc);
  } catch { /* modül yoksa kutular hesapsız çizilir */ }
  return window.sepetHesapModul || null;
}
sepetHesapModulunuYukle();

/** Textarea'dan geçerli URL listesi çıkarır (tekilleştirir, 10 ile sınırlar). */
function sepetUrlListesi() {
  const metin = ($('#sepetUrls')?.value || '');
  const satirlar = metin.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
  const gorulen = new Set();
  const urls = [];
  for (const s of satirlar) {
    if (s.length < 2) continue;
    const anahtar = s.toLowerCase();
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    urls.push(s);
  }
  return urls.slice(0, 10);
}

function sepetSayacGuncelle() {
  const n = sepetUrlListesi().length;
  const el = $('#sepetSayac');
  if (el) {
    el.textContent = `${n}/10 ürün`;
    el.style.color = n === 0 || n > 10 ? '#c0392b' : '';
  }
}

if ($('#sepetUrls')) {
  $('#sepetUrls').addEventListener('input', sepetSayacGuncelle);
  sepetSayacGuncelle();
}

function sepetHataGoster(mesaj) {
  const el = $('#sepetHata');
  if (!el) return;
  el.textContent = mesaj;
  el.hidden = false;
  $('#sepetBtn').disabled = false;
  $('#sepetBtn').textContent = 'Sepeti optimize et';
  $('#sepetDurumAlani').hidden = true;
  const iptal = $('#sepetIptalBtn');
  if (iptal) iptal.hidden = true;
}

if ($('#sepetBtn')) {
  $('#sepetBtn').addEventListener('click', async () => {
    const urls = sepetUrlListesi();
    $('#sepetHata').hidden = true;
    $('#sepetSonuc').hidden = true;

    if (urls.length < 2) return sepetHataGoster('Sepet için en az 2 ürün linki veya ürün adı gerekli.');
    if (urls.length > 10) return sepetHataGoster('Sepet en fazla 10 ürün alabilir.');

    $('#sepetBtn').disabled = true;
    $('#sepetBtn').textContent = 'Hesaplanıyor…';
    $('#sepetDurumAlani').hidden = false;
    $('#sepetDurumNotu').textContent = 'Ürünler sitelerde aranıyor…';
    sepetDurumSatirlari = [];
    $('#sepetIlerleme').innerHTML = '';
    const iptalBtn = $('#sepetIptalBtn');
    if (iptalBtn) iptalBtn.hidden = false;

    try {
      let onbellekMap = {};
      try { onbellekMap = JSON.parse(localStorage.getItem('eun_sepet_onbellek_v1') || '{}') || {}; } catch { onbellekMap = {}; }
      const simdi = Date.now();
      const urunlerGovde = urls.map(u => {
        const kayit = onbellekMap[u.toLowerCase()];
        const hazir = kayit && (simdi - (kayit.ts || 0) < 15 * 60 * 1000) && Array.isArray(kayit.teklifler) && kayit.teklifler.length
          ? kayit.teklifler
          : undefined;
        return /^https?:\/\//i.test(u)
          ? { url: u, ...(hazir ? { teklifler: hazir } : {}) }
          : { url: u, ad: u, tur: 'ad', ...(hazir ? { teklifler: hazir } : {}) };
      });
      const res = await fetch('/api/sepet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urunler: urunlerGovde,
          hizliMod: hizliModAcik(),
          market: BASKI_ORTAM.market || 'tr',
        }),
      });
      const data = await guvenliJson(res);
      if (!res.ok) throw new Error(data.hata || 'Sepet isteği başarısız');
      sepetAktifIs = data.isId;
      // Sayfa yenilenirse/bağlantı koparsa taramaya dönülebilsin diye kaydet.
      try {
        localStorage.setItem('son_sepet', JSON.stringify({ isId: data.isId, urls, ts: Date.now() }));
      } catch { /* depolama kapalıysa sorun değil */ }
      sepetIzle(data.isId);
    } catch (e) {
      sepetHataGoster(e.message);
    }
  });
}

if ($('#sepetIptalBtn')) {
  $('#sepetIptalBtn').addEventListener('click', async () => {
    if (!sepetAktifIs) return;
    const btn = $('#sepetIptalBtn');
    btn.disabled = true;
    btn.textContent = DIL_KOPYA_YEREL.iptalEdiliyor;
    try { await fetch('/api/sepet/' + sepetAktifIs + '/iptal', { method: 'POST' }); } catch { }
  });
}

/**
 * Sepet işini izler.
 *
 * ÖNEMLİ (2026-10-28 hatası): önceden TEK bir başarısız fetch tüm arayüzü
 * "Failed to fetch" ile öldürüyordu. 5 ürünlük tarama 10+ dakika sürebiliyor;
 * bu süre içinde tek bir ağ tıkanıklığı / sekme arka plana alınması / kısa
 * sunucu kesintisi işi çöpe atıyordu. Artık:
 *   - hata sayılır ama iş DURDURULMAZ (artan bekleme ile yeniden denenir),
 *   - 10 üst üste hatadan sonra "bağlantı kurulamadı" denir ve durulur,
 *   - sonuç geldiğinde otomatik gösterilir.
 */
/**
 * Sepet işini izler.
 *
 * Notlar (2026-10-28, iki gerçek hata düzeltildi):
 *  1) Önceden TEK bir başarısız fetch tüm arayüzü "Failed to fetch" ile öldürüyordu.
 *     5 ürünlük tarama dakikalar sürebiliyor; tek bir ağ tıkanıklığı işi çöpe atıyordu.
 *     Artık hata sayılır ve artan beklemeyle yeniden denenir (10 üst üste hatada durur).
 *  2) İlk sürümde "çalışıyor" dalında erken return vardı ve bir sonraki deneme
 *     ZAMANLANMIYORDU → arayüz ilk yoklamadan sonra donuyordu ("0/5 ürün" kalıyordu).
 *     Artık bir sonraki yoklama her durumda finally bloğunda zamanlanır.
 */
/**
 * Tek bir sepet işi verisini ekrana uygular (SSE + polling ORTAK).
 * @returns {'devam'|'bitti'}
 */
function sepetIsle(job) {
  if (!job || typeof job !== 'object') {
    sepetBtnDurumunuSifirla();
    sepetHataGoster('Sunucu yanıtı geçersiz.');
    return 'bitti';
  }
  const p = job.progress || {};

  if (job.status === 'running') {
    const toplam = p.toplam || 0;
    if (p.faz === 'optimizasyon') {
      $('#sepetDurumNotu').textContent = 'Senaryolar hesaplanıyor…';
    } else if (p.faz === 'urun') {
      const biten = p.biten || 0;
      $('#sepetDurumNotu').textContent =
        `${biten}/${toplam} ürün tamamlandı · ${p.not || 'taranıyor…'}`;
    }
    // İlerleme satırları SUNUCUDAN gelen tam dizi ile çizilir.
    if (Array.isArray(p.urunler)) {
      sepetDurumSatirlari = p.urunler.map(u => ({
        ad: sepetAdKisalt(u.ad),
        durum: u.durum || 'bekliyor',
        siteSayisi: u.siteSayisi,
        enUcuz: u.enUcuz || null,
      }));
      sepetIlerlemeCiz();
    }
    return 'devam';
  }

  // İş bitti
  sepetBtnDurumunuSifirla();
  localStorage.removeItem('son_sepet');

  if (job.status === 'error') { sepetHataGoster(job.error || 'Sepet hesaplanamadı'); return 'bitti'; }
  if (job.status === 'interrupted') {
    sepetHataGoster(job.error || 'Sunucu yeniden başlatıldı; sepet yarıda kaldı. Lütfen tekrar deneyin.');
    return 'bitti';
  }
  if (!job.result) { sepetHataGoster('Sepet sonucu alınamadı.'); return 'bitti'; }

  $('#sepetDurumAlani').hidden = true;
  if (job.result.iptalEdildi) {
    const tamam = job.result.ozet?.tamamlanan ?? 0;
    const toplamUrun = job.result.ozet?.urunSayisi ?? (job.result.urunler || []).length;
    sepetHataGoster(`Sepet iptal edildi — ${toplamUrun} ürünün ${tamam} tanesi tamamlanmıştı. `
      + 'Senaryoları görmek için sepeti baştan çalıştırın.');
    return 'bitti';
  }
  sepetSonucGoster(job.result);
  return 'bitti';
}

/** Sepet işini SSE ile canlı izler; akış koparsa polling'e düşer (2026-10-29). */
function sepetIzle(id) {
  sepetPollDurdur();
  canliIzle(id, { etiket: 'sepet', isle: sepetIsle, yedekPoll: sepetPoll });
}

function sepetPoll(id) {
  sepetPollDurdur();
  let hataSayisi = 0;
  const baslangicDurum = $('#sepetDurumNotu')?.textContent || '';

  const zamanla = (ms) => { sepetTimer = setTimeout(calistir, ms); };

  const calistir = async () => {
    let devam = false;
    try {
      const res = await fetch('/api/sepet/' + id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const job = await res.json();
      hataSayisi = 0; // bağlantı geri geldi
      devam = sepetIsle(job) === 'devam';
    } catch (e) {
      hataSayisi++;
      if (hataSayisi >= 10) {
        sepetPollDurdur();
        sepetBtnDurumunuSifirla();
        sepetHataGoster('Sunucuya ulaşılamadı (bağlantı 10 kez koptu). Tarama sunucuda devam ediyor olabilir; '
          + 'sayfayı yenileyip tekrar deneyin.');
        return;
      }
      $('#sepetDurumNotu').textContent =
        `Bağlantı koptu, yeniden deneniyor… (${hataSayisi}/10) · ${baslangicDurum}`;
      zamanla(Math.min(1000 * hataSayisi, 5000));
      return;
    } finally {
      // "çalışıyor" dalında erken return edildiği için bir sonraki yoklama
      // burada zamanlanır (önceki sürüm burada zamanlamıyordu → arayüz donuyordu).
      if (devam) zamanla(1500);
    }
  };

  zamanla(600);
}

/** Çalışan sepet izleyicisini durdurur. */
function sepetPollDurdur() {
  if (sepetTimer) { clearTimeout(sepetTimer); sepetTimer = null; }
}

/** Sepet butonunu/iptal düğmesini başlangıç durumuna alır. */
function sepetBtnDurumunuSifirla() {
  const b = $('#sepetBtn');
  if (b) { b.disabled = false; b.textContent = DIL_KOPYA_YEREL.sepetOptimize; }
  const i = $('#sepetIptalBtn');
  if (i) { i.hidden = true; i.disabled = false; i.textContent = DIL_KOPYA_YEREL.iptal; }
}

/** Sayfa yenilenirse yarım kalan sepet taramasına geri döner (2026-10-28). */
async function sepetDevamEt() {
  let kayit = null;
  try { kayit = JSON.parse(localStorage.getItem('son_sepet') || 'null'); } catch { }
  if (!kayit || !kayit.isId) return;
  // 30 dakikadan eski kayıt yok sayılır (iş bellekte tutuluyor, süresi dolmuş olur)
  if (Date.now() - (kayit.ts || 0) > 30 * 60 * 1000) { localStorage.removeItem('son_sepet'); return; }

  try {
    const res = await fetch('/api/sepet/' + kayit.isId);
    if (!res.ok) { localStorage.removeItem('son_sepet'); return; }
    const job = await res.json();
    if (job.status === 'running') {
      if (kayit.urls?.length && $('#sepetUrls')) $('#sepetUrls').value = kayit.urls.join('\n');
      sepetSayacGuncelle();
      $('#sepetBtn').disabled = true;
      $('#sepetBtn').textContent = 'Hesaplanıyor…';
      $('#sepetDurumAlani').hidden = false;
      $('#sepetIptalBtn').hidden = false;
      $('#sepetDurumNotu').textContent = 'Yarım kalan sepet taramasına dönüldü…';
      sepetAktifIs = kayit.isId;
      sepetIzle(kayit.isId);
    } else if (job.status === 'done' && job.result) {
      if (kayit.urls?.length && $('#sepetUrls')) $('#sepetUrls').value = kayit.urls.join('\n');
      sepetSayacGuncelle();
      sepetSonucGoster(job.result);
      localStorage.removeItem('son_sepet');
    } else {
      localStorage.removeItem('son_sepet');
    }
  } catch { /* sessizce geç: sunucu kapalı olabilir */ }
}

/* ================= 🛒 Sepet: görsel kıyas barı + kargo paketleri (2026-11-12) =================
 *
 * Matematik `public/sepetHesap.js` içinde (tek kaynak, testli):
 *   kiyasVerisi()       → tek mağaza vs bölünmüş sepet, bar oranı
 *   paketKargoDurumu()  → kargo bedava mı + eşik ipucu
 *
 * Buradaki fonksiyonlar yalnızca HTML üretir; afiliye linkleri ve esc()
 * korunur (XSS + sponsor rel dokunulmadı).
 */

/** 📊 Tek mağaza ↔ bölünmüş sepet kıyas barı. */
function sepetKiyasKarti(sonuc) {
  const hesap = window.sepetHesapModul;
  if (!hesap) return '';
  const k = hesap.kiyasVerisi(sonuc);
  if (!k.var) return '';

  // Tek mağaza zaten en ucuz → kıyas barı yerine tebrik kartı.
  if (k.tekMagazaEnIyi) {
    return `<div class="sepet-tebrik-kart">
      <span class="sepet-tebrik-ikon" aria-hidden="true">🎯</span>
      <div class="sepet-tebrik-metin">
        <b>Tek mağaza seçimi zaten en avantajlı seçenek!</b><br>
        Ekstra kargo ödemeden <b>${tl(k.tekMagaza)}</b> tutarla alabilirsiniz.
      </div>
    </div>`;
  }

  const yuzdeMetni = k.tasarrufYuzde != null
    ? ` <span aria-hidden="true">·</span> %${String(k.tasarrufYuzde).replace('.', ',')} tasarruf`
    : '';
  return `<div class="sepet-kiyas-kapsayici">
    <div class="sepet-kiyas-baslik-satiri">
      <span class="sepet-kiyas-baslik">📊 Sepet kıyaslaması</span>
      <span class="sepet-kiyas-rozet">🎉 ${tl(k.tasarruf)} net kazanç${yuzdeMetni}</span>
    </div>
    <div class="sepet-kiyas-satir">
      <span class="sepet-kiyas-etiket">
        <span>🏪 Tek mağazadan alsaydınız</span>
        <span class="sepet-kiyas-tutar">${tl(k.tekMagaza)}</span>
      </span>
      <span class="sepet-kiyas-bar" role="img"
            aria-label="Tek mağaza toplamı ${tl(k.tekMagaza)}, referans %100">
        <span class="sepet-kiyas-dolgu tek" style="width:100%"></span>
      </span>
    </div>
    <div class="sepet-kiyas-satir kazanan">
      <span class="sepet-kiyas-etiket">
        <span>🧺 Bölünmüş akıllı sepet</span>
        <span class="sepet-kiyas-tutar">${tl(k.enIyi)}</span>
      </span>
      <span class="sepet-kiyas-bar" role="img"
            aria-label="Bölünmüş sepet toplamı ${tl(k.enIyi)}, tek mağazanın %${String(k.oran).replace('.', ',')}'i">
        <span class="sepet-kiyas-dolgu bolunmus" data-oran="${k.oran}" style="width:0%"></span>
      </span>
    </div>
  </div>`;
}

/** Barı 0 → hedef genişliğe animasyonla açar (CSS transition 0.7s). */
function sepetKiyasAnimasyonu() {
  const uygula = () => {
    document.querySelectorAll('.sepet-kiyas-dolgu.bolunmus[data-oran]').forEach((el) => {
      const hedef = `${Number(el.dataset.oran) || 0}%`;
      // Aynı değer tekrar yazılmasın (gereksiz reflow).
      if (el.style.width !== hedef) el.style.width = hedef;
    });
  };
  // rAF ideal; ama arka plan sekmesinde rAF hiç çalışmayabilir → setTimeout
  // yedeği şart, aksi hâlde bar %0'da donup kalır (ölçüldü).
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(uygula);
  setTimeout(uygula, 40);
}

/** 📦 Tek mağaza grubunu "kargo paket kutusu" olarak çizer. */
function sepetKargoPaketi(g, sira, toplamPaket) {
  const hesap = window.sepetHesapModul;
  const durum = hesap ? hesap.paketKargoDurumu(g) : { bedava: Number(g.kargo) <= 0, kargo: Number(g.kargo) || 0 };
  const urunSayisi = (g.urunler || []).length;
  const cip = toplamPaket > 1
    ? `<span class="kargo-paket-cip">📦 Paket ${sira} / ${toplamPaket}</span>` : '';

  const kargoEtiket = durum.bedava
    ? '<span class="kargo-paket-etiket bedava">✅ Kargo Bedava</span>'
    : (durum.belirsiz
      ? '<span class="kargo-paket-etiket belirsiz">⚠️ +Kargo sepette</span>'
      : `<span class="kargo-paket-etiket ucretli">🚚 +${tl(durum.kargo)} Kargo</span>`);

  // 💡 Eşik ipucu (yalnızca eklenen tutar kargodan küçükse) veya nötr eşik notu.
  let ipucu = '';
  if (durum.esikIpucu != null) {
    ipucu = `<div class="kargo-paket-ipucu">💡 Bu pakete <b>${tl(durum.esikIpucu)}</b> tutarında `
      + 'ürün daha eklerseniz kargo BEDAVA olur!</div>';
  } else if (durum.esikFarki != null) {
    ipucu = `<div class="kargo-paket-ipucu">🎯 Ücretsiz kargo eşiği <b>${tl(durum.esik)}</b> `
      + `(<b>${tl(durum.esikFarki)}</b> uzakta)</div>`;
  }

  const kuponSatir = Number(g.kuponIndirim) > 0
    ? `<div class="kargo-paket-kupon">🎟️ Kupon: −${tl(g.kuponIndirim)}${g.uygulananKupon?.kodu ? ` (${esc(g.uygulananKupon.kodu)})` : ''}</div>`
    : '';

  const urunler = (g.urunler || []).map(u => {
    const adHam = String(u.ad || '').slice(0, 62);
    const ad = (Number(u.adet) > 1 ? `${Number(u.adet)}× ` : '') + adHam;
    const link = u.url && /^https?:\/\//i.test(u.url)
      ? `<a href="${esc(u.afiliyeUrl || u.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(u.site || g.site || '')}" title="${esc(ad)}">${esc(ad)}</a>`
      : `<span title="${esc(ad)}">${esc(ad)}</span>`;
    return `<li>${link}<span class="kargo-paket-urun-fiyat">${tl(u.fiyat)}</span></li>`;
  }).join('');

  return `<div class="kargo-paket-kutusu">
    <div class="kargo-paket-ust">
      <div class="kargo-paket-sol">
        ${cip}
        <span class="kargo-paket-magaza">🏪 ${esc(g.siteName || g.site || 'Mağaza')}</span>
      </div>
      <span class="kargo-paket-tutar">${tl(g.toplam)}</span>
    </div>
    <div class="kargo-paket-sayi">🏷️ ${(g.urunler || []).reduce((s, u) => s + Math.max(1, Number(u.adet) || 1), 0)} ürün</div>
    <ul class="kargo-paket-urunler">${urunler}</ul>
    <div class="kargo-paket-alt-satir">
      <span class="kargo-paket-ara">Ürünler ${tl(g.araToplam)}</span>
      ${kargoEtiket}
    </div>
    ${kuponSatir}
    ${ipucu}
  </div>`;
}

/** Senaryo kartını HTML'e çevirir. */
function sepetSenaryoKart(senaryo, enIyiMi) {
  if (!senaryo) {
    return `<div class="sepet-senaryo-bos">
      <div class="sepet-senaryo-baslik">Bu senaryo oluşturulamadı</div>
      <p class="ipucu">Ürünlerin tamamını birlikte satan mağaza bulunamadı.</p></div>`;
  }
  const grupListesi = senaryo.gruplar || [];
  const gruplar = grupListesi
    .map((g, i) => sepetKargoPaketi(g, i + 1, grupListesi.length))
    .join('');

  return `<div class="sepet-senaryo ${enIyiMi ? 'sepet-senaryo-eniyi' : ''}">
    <div class="sepet-senaryo-ust">
      <div>
        <div class="sepet-senaryo-baslik">${enIyiMi ? '🏆 ' : ''}${esc(senaryo.etiket)}</div>
        <div class="ipucu">${esc(senaryo.aciklama)} · ${senaryo.magazaSayisi} mağaza</div>
      </div>
      <div class="sepet-senaryo-fiyat">${tl(senaryo.toplam)}</div>
    </div>
    ${enIyiMi ? '<div class="sepet-rozet">En düşük toplam</div>' : ''}
    ${senaryo.uyari ? `<div class="sepet-uyari">⚠️ ${esc(senaryo.uyari)}</div>` : ''}
    ${gruplar}
    <div class="sepet-senaryo-alt">Ürünler ${tl(senaryo.araToplam)}${Number(senaryo.kuponIndirim) > 0 ? ` − Kupon ${tl(senaryo.kuponIndirim)}` : ''} + ${senaryo.kargoBelirsiz && Number(senaryo.kargo) === 0 ? 'Kargo sepette' : 'Kargo ' + tl(senaryo.kargo)}</div>
  </div>`;
}

function sepetSonucGoster(sonuc) {
  $('#sepetSonuc').hidden = false;
  sonSepetSonuc = sonuc;
  sepetPaylasSifirla();
  const s = sonuc.senaryolar || {};
  const kazanc = $('#sepetKazanc');

  // 2026-11-12: salt metin yerine görsel kıyas barı / tebrik kartı.
  if (kazanc) {
    const kiyasHtml = sepetKiyasKarti(sonuc);
    kazanc.innerHTML = kiyasHtml || '';
  }

  const enIyi = sonuc.enIyiAnahtar;
  $('#sepetSenaryolar').innerHTML = [
    sepetSenaryoKart(s.tekMagaza, enIyi === 'tekMagaza'),
    sepetSenaryoKart(s.akilliBolunmus, enIyi === 'akilliBolunmus'),
    sepetSenaryoKart(s.maksimumTasarruf, enIyi === 'maksimumTasarruf'),
  ].join('');
  sepetKiyasAnimasyonu();

  if (Array.isArray(sonuc.uyarilar) && sonuc.uyarilar.length) {
    kazanc.innerHTML += sonuc.uyarilar.map(u =>
      `<div class="sepet-uyari" style="margin-top:8px">⚠️ ${esc(u)}</div>`).join('');
  }

  // Okunamayan ürünler için açıklama + "tekrar dene" (2026-10-28).
  // Bu ürünlerin site sayfası geçici olarak fiyatsız döndü (site hız sınırı).
  // Kullanıcı sepeti yeniden çalıştırınca genelde toparlanır.
  if (Array.isArray(sonuc.bulunamayanlar) && sonuc.bulunamayanlar.length) {
    kazanc.innerHTML += `<div class="sepet-uyari" style="margin-top:8px">
      ⚠️ <b>${sonuc.bulunamayanlar.length} ürün okunamadı</b> (site geçici olarak fiyat vermedi):
      <ul style="margin:6px 0 0 18px;padding:0">
        ${sonuc.bulunamayanlar.map(u => `<li>${esc(String(u).slice(0, 90))}</li>`).join('')}
      </ul>
      <button type="button" class="sepet-tekrar-btn" style="margin-top:8px">Bu ürünlerle tekrar dene</button>
    </div>`;
    const btn = kazanc.querySelector('.sepet-tekrar-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        // Sepet alanına yalnızca okunamayan ürünleri koy ve yeniden çalıştır
        const alan = $('#sepetUrls');
        if (!alan) return;
        alan.value = sonuc.bulunamayanlar.join('\n');
        alan.dispatchEvent(new Event('input', { bubbles: true }));
        alan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alan.focus();
        $('#sepetBtn')?.click();
      });
    }
  }

  $('#sepetSonuc').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Kupon otomasyonu (2026-10-28): en iyi senaryonun mağaza grupları üzerinden
  // koşulları karşılayan kuponları + kopyalanabilir kodları getir.
  sepetKuponPaneli(sonuc);
}

/* ================= 📤 Sepet paylaşımı (2026-11-01) =================
 *
 * İki çıktı:
 *  1) WhatsApp metni — sepet özeti + kalıcı paylaşım linki.
 *  2) Kalıcı salt okunur sayfa (/sepet/paylas/:id) — linki bilen herkes açar.
 *
 * Paylaşım linki YALNIZCA kullanıcı istediğinde oluşturulur (gereksiz kayıt yok).
 */

let sonSepetSonuc = null;      // son başarılı sepet optimizasyonu
let sepetPaylasLinki = null;   // oluşturulmuş paylaşım adresi

function sepetPaylasSifirla() {
  sepetPaylasLinki = null;
  const alan = $('#sepetPaylasSonuc');
  if (alan) alan.innerHTML = '';
  const kopya = $('#sepetKopyaBtn');
  if (kopya) kopya.hidden = true;
}

/** En iyi senaryodan paylaşım verisini çıkarır. */
function sepetPaylasOzeti(sonuc) {
  const anahtar = sonuc?.enIyiAnahtar;
  const senaryo = anahtar ? (sonuc?.senaryolar || {})[anahtar] : null;
  const gruplar = Array.isArray(senaryo?.gruplar) ? senaryo.gruplar : [];
  return {
    toplam: Number(sonuc?.enIyiToplam ?? senaryo?.toplam ?? 0),
    tasarruf: Number(sonuc?.kazanc || 0),
    tekMagaza: Number(sonuc?.tekMagazaToplam || 0),
    senaryoEtiket: senaryo?.etiket || 'En iyi sepet',
    gruplar: gruplar.map(g => ({
      site: g.site,
      siteName: g.siteName,
      toplam: Number(g.toplam || 0),
      urunler: (g.urunler || []).map(u => u.ad).filter(Boolean),
    })),
  };
}

/** WhatsApp paylaşım metnini istenen biçimde üretir. */
function sepetWhatsappMetni(sonuc, link) {
  const o = sepetPaylasOzeti(sonuc);
  const satirlar = [];
  satirlar.push('*Baskı Hesap — Sepet Özeti*');
  satirlar.push(`📦 Toplam Tutar: ${tl(o.toplam)}${o.tasarruf > 0 ? ` (${tl(o.tasarruf)} Tasarruf!)` : ''}`);
  satirlar.push('Mağazalar:');
  for (const g of o.gruplar) {
    const adlar = g.urunler.slice(0, 3).join(', ') + (g.urunler.length > 3 ? ` +${g.urunler.length - 3} ürün` : '');
    satirlar.push(`• ${g.siteName}: ${adlar} (${tl(g.toplam)})`);
  }
  if (link) satirlar.push(`🔗 Listeyi İncele: ${link}`);
  return satirlar.join('\n');
}

/** Paylaşım linkini oluşturur (varsa yeniden kullanır). */
async function sepetPaylasLinkiOlustur() {
  if (!sonSepetSonuc) throw new Error('Önce sepeti optimize edin.');
  if (sepetPaylasLinki) return sepetPaylasLinki;
  const res = await fetch('/api/sepet/paylas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sepet: sonSepetSonuc }),
  });
  const veri = await res.json().catch(() => ({}));
  if (!res.ok || !veri.url) throw new Error(veri.hata || 'Paylaşım linki oluşturulamadı');
  sepetPaylasLinki = veri.url;
  const kopya = $('#sepetKopyaBtn');
  if (kopya) kopya.hidden = false;
  return sepetPaylasLinki;
}

$('#sepetWhatsappBtn')?.addEventListener('click', async () => {
  const el = $('#sepetPaylasSonuc');
  if (!sonSepetSonuc) return;
  if (el) el.textContent = 'Paylaşım hazırlanıyor…';
  try {
    const link = await sepetPaylasLinkiOlustur();
    const metin = sepetWhatsappMetni(sonSepetSonuc, link);
    const url = 'https://wa.me/?text=' + encodeURIComponent(metin);
    window.open(url, '_blank', 'noopener');
    // 2026-11-12: paylaşım da sessiz kalmıyor — anlık mikro onay.
    toastGoster('Paylaşım hazır — WhatsApp açıldı', 'basarili');
    if (el) {
      el.innerHTML = `✅ WhatsApp açıldı. Link: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>`;
    }
  } catch (e) {
    toastGoster('Paylaşım hazırlanamadı', 'hata');
    if (el) el.textContent = '❌ ' + e.message;
  }
});

$('#sepetLinkBtn')?.addEventListener('click', async () => {
  const el = $('#sepetPaylasSonuc');
  if (!sonSepetSonuc) return;
  if (el) el.textContent = 'Link oluşturuluyor…';
  try {
    const link = await sepetPaylasLinkiOlustur();
    if (el) {
      el.innerHTML = `🔗 Bu bağlantıyı paylaşabilirsin (salt okunur):<br>`
        + `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a> `
        + `<span class="ipucu">· 30 gün geçerli</span>`;
    }
  } catch (e) {
    if (el) el.textContent = '❌ ' + e.message;
  }
});

$('#sepetKopyaBtn')?.addEventListener('click', async (e) => {
  if (!sepetPaylasLinki) return;
  const el = $('#sepetPaylasSonuc');
  const btn = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
  // 2026-11-12: buton anlık yeşil onaya döner + 1.5 sn mikro toast.
  const ok = await panoyaKopyalaVeGeriBildirim(
    sepetPaylasLinki,
    btn,
    'Sepet bağlantısı panoya kopyalandı!',
  );
  if (el) {
    el.textContent = ok
      ? '✅ Link panoya kopyalandı.'
      : 'Kopyalanamadı — linki elle seçip kopyalayın: ' + sepetPaylasLinki;
  }
});

/* ================= 🔔 Web Push aboneliği (2026-11-01) =================
 *
 * Akış: izin iste → service worker hazır ol → VAPID public anahtarını al →
 * pushManager.subscribe → aboneliği sunucuya kaydet → test bildirimi gönder.
 * Desteklenmeyen tarayıcıda açıkça söylenir (sessiz başarısızlık yok).
 */

let pushKayitli = false;

function pushDurumYaz(metin, tur = '') {
  const el = $('#pushDurum');
  if (!el) return;
  el.textContent = metin;
  el.className = 'push-durum' + (tur ? ' ' + tur : '');
}

function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const cikti = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) cikti[i] = raw.charCodeAt(i);
  return cikti;
}

async function pushAboneligiBaslat() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    pushDurumYaz('⚠️ Bu tarayıcı web bildirimlerini desteklemiyor. iOS’ta siteyi ana ekrana ekleyin.', 'hata');
    return false;
  }
  if (Notification.permission === 'denied') {
    pushDurumYaz('⚠️ Bildirim izni reddedilmiş. Tarayıcı ayarlarından izin verin.', 'hata');
    return false;
  }
  if (Notification.permission === 'default') {
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') {
      pushDurumYaz('Bildirim izni verilmedi.', 'hata');
      return false;
    }
  }

  const kayit = await navigator.serviceWorker.ready;
  const anahtarRes = await fetch('/api/push/vapid-key');
  const anahtarVeri = await anahtarRes.json().catch(() => ({}));
  if (!anahtarRes.ok || !anahtarVeri.publicKey) {
    throw new Error(anahtarVeri.hata || 'VAPID anahtarı alınamadı');
  }

  let abonelik = await kayit.pushManager.getSubscription();
  if (!abonelik) {
    abonelik = await kayit.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(anahtarVeri.publicKey),
    });
  }

  const kaydetRes = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: abonelik.toJSON() }),
  });
  const kaydetVeri = await kaydetRes.json().catch(() => ({}));
  if (!kaydetRes.ok) throw new Error(kaydetVeri.hata || 'Abonelik kaydedilemedi');

  pushKayitli = true;
  pushDurumYaz(`✅ Bu cihaz kayıtlı (${kaydetVeri.abone || 1} cihaz).`, 'ok');
  return true;
}

$('#pushBtn')?.addEventListener('click', async () => {
  const btn = $('#pushBtn');
  if (!btn) return;
  btn.disabled = true;
  const eski = btn.textContent;
  btn.textContent = '⏳ Bildirim hazırlanıyor…';
  try {
    const hazir = await pushAboneligiBaslat();
    if (!hazir) return;
    // İzin + abonelik tamam: gerçek bir test bildirimi gönder (uçtan uca kanıt).
    const r = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baslik: '🔔 Bildirimler açık',
        govde: 'Fiyat düştüğünde bu cihazdan haber vereceğiz.',
        url: '/',
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.hata || 'Test bildirimi gönderilemedi');
    pushDurumYaz(`✅ Test bildirimi gönderildi (${d.basarili}/${d.abone} cihaz).`, 'ok');
    btn.textContent = '🔔 Test Bildirimi Gönder';
    btn.dataset.kayitli = '1';
  } catch (e) {
    pushDurumYaz('❌ ' + (e.message || 'Bildirim kurulamadı'), 'hata');
    btn.textContent = eski;
  } finally {
    btn.disabled = false;
  }
});

/* ================= 🔔 Sıfır sürtünmeli fiyat alarmı (2026-11-06) =================
 *
 * Kullanıcıdan e-posta/telefon/şifre İSTENMEZ. Karttaki "🔔 Fiyat Alarmı"
 * düğmesi bir popover açar; akıllı hedef fiyat önerilir ve tek tıkla
 * pushManager.subscribe → POST /api/takip akışı çalışır.
 */

let alarmAktif = null;

function alarmHtmlHazirla() {
  if ($('#alarmPopover')) return;
  const el = document.createElement('div');
  el.id = 'alarmPopover';
  el.className = 'alarm-popover';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', 'alarmBaslik');
  el.innerHTML = `
    <div class="alarm-popover-ust">
      <strong id="alarmBaslik">🔔 Fiyat Alarmı</strong>
      <button type="button" class="alarm-kapat" data-alarm-kapat aria-label="Kapat">✕</button>
    </div>
    <div class="alarm-urun" id="alarmUrun"></div>
    <div class="alarm-mevcut-satir">Şu anki en ucuz fiyat: <b id="alarmMevcut">—</b></div>
    <label class="alarm-etiket" for="alarmHedef">Hedef fiyatım (₺)</label>
    <div class="alarm-input-sar">
      <span>₺</span>
      <input id="alarmHedef" type="number" min="1" step="1" inputmode="decimal" autocomplete="off" />
    </div>
    <div class="alarm-oneriler">
      <button type="button" class="alarm-oneri" data-oran="0.95">−%5 öner</button>
      <button type="button" class="alarm-oneri" data-oran="0.90">−%10 öner</button>
    </div>
    <button type="button" class="alarm-kur-btn" id="alarmKurBtn">🔔 Bu Cihaza Bildir</button>
    <div class="alarm-durum" id="alarmDurum" role="status" aria-live="polite"></div>
    <div class="alarm-dipnot">E-posta, telefon veya şifre gerekmez. Yalnızca bu cihaz bildirim alır.</div>
  `;
  document.body.appendChild(el);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-alarm-kapat]')) { alarmKapat(); return; }
    const oneri = e.target.closest('.alarm-oneri');
    if (oneri && alarmAktif) {
      const input = $('#alarmHedef');
      const oran = Number(oneri.dataset.oran) || 0.95;
      input.value = String(alarmOneriFiyat(alarmAktif.fiyat, oran));
      input.focus();
    }
  });
  $('#alarmKurBtn').addEventListener('click', alarmKur);
}

/** Akıllı hedef: %5/%10 altı, 9 ile biten psikolojik fiyata yuvarlanır. */
function alarmOneriFiyat(base, oran) {
  const fiyat = Number(base);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return 1;
  const ham = fiyat * (Number(oran) || 0.95);
  const yuvarlak = Math.floor(ham / 10) * 10 - 1;
  return Math.max(1, yuvarlak > 0 ? yuvarlak : Math.round(ham));
}

function alarmKapat() {
  const el = $('#alarmPopover');
  if (el) el.hidden = true;
}

function alarmPopoverAc(btn) {
  alarmHtmlHazirla();
  const fiyat = Number(btn.dataset.alarmFiyat) || 0;
  if (!sonSonuc || !fiyat) return;
  alarmAktif = {
    site: btn.dataset.alarmSite || '',
    fiyat,
    urun: sonSonuc?.kaynak?.urun || 'Ürün',
  };
  const pop = $('#alarmPopover');
  $('#alarmUrun').textContent = alarmAktif.urun + (sonSonuc?.kaynak?.renk ? ` (${sonSonuc.kaynak.renk})` : '');
  $('#alarmMevcut').textContent = tl(fiyat);
  const input = $('#alarmHedef');
  input.value = String(alarmOneriFiyat(fiyat, 0.95));
  const durum = $('#alarmDurum');
  durum.textContent = '';
  durum.className = 'alarm-durum';

  // Düğmenin hemen altında aç (masaüstü); mobilde CSS alt çekmeceye çevirir.
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const genislik = Math.min(340, window.innerWidth - 24);
  let sol = Math.min(Math.max(12, r.left), window.innerWidth - genislik - 12);
  let ust = r.bottom + 8;
  const yukseklik = pop.offsetHeight || 320;
  if (ust + yukseklik > window.innerHeight - 12) ust = Math.max(12, r.top - yukseklik - 8);
  pop.style.width = genislik + 'px';
  pop.style.left = sol + 'px';
  pop.style.top = ust + 'px';
  setTimeout(() => input.focus({ preventScroll: true }), 30);
}

/** VAPID public anahtarını Uint8Array'e çevirir (pushManager için). */
function alarmVapidCevir(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const cikti = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) cikti[i] = raw.charCodeAt(i);
  return cikti;
}

function alarmDurumYaz(metin, tur = '') {
  const el = $('#alarmDurum');
  if (!el) return;
  el.textContent = metin;
  el.className = 'alarm-durum' + (tur ? ' ' + tur : '');
}

async function alarmKur() {
  const btn = $('#alarmKurBtn');
  const hedef = parseFloat($('#alarmHedef')?.value);
  if (!hedef || hedef <= 0) {
    alarmDurumYaz('Lütfen geçerli bir hedef fiyat girin.', 'hata');
    $('#alarmHedef')?.focus();
    return;
  }
  if (!sonSonuc) { alarmDurumYaz('Karşılaştırma bulunamadı; sayfayı yenileyin.', 'hata'); return; }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    alarmDurumYaz('⚠️ Bu tarayıcı web bildirimlerini desteklemiyor. iPhone/iPad’de siteyi önce Ana Ekrana Ekleyin.', 'hata');
    return;
  }
  if (Notification.permission === 'denied') {
    alarmDurumYaz('⚠️ Bildirim izni reddedilmiş. Tarayıcı ayarlarından izin verin.', 'hata');
    return;
  }

  const eski = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Alarm kuruluyor…';
  try {
    if (Notification.permission === 'default') {
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') {
        alarmDurumYaz('Bildirim izni verilmedi. Alarm kurulmadı.', 'hata');
        return;
      }
    }

    const kayit = await navigator.serviceWorker.ready;
    const anahtarRes = await fetch('/api/push/vapid-key');
    const anahtarVeri = await anahtarRes.json().catch(() => ({}));
    if (!anahtarRes.ok || !anahtarVeri.publicKey) {
      throw new Error(anahtarVeri.hata || 'VAPID anahtarı alınamadı');
    }

    let abonelik = await kayit.pushManager.getSubscription();
    if (!abonelik) {
      abonelik = await kayit.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: alarmVapidCevir(anahtarVeri.publicKey),
      });
    }

    // /api/tracked (takma ad: /api/takip) — aynı uç nokta.
    const res = await fetch('/api/takip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sonuc: sonSonuc,
        hedefFiyat: hedef,
        pushSubscription: abonelik.toJSON(),
      }),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(veri.hata || 'Alarm kaydedilemedi');

    alarmDurumYaz(`✅ Alarm kuruldu! Ürün ${tl(hedef)} altına düştüğünde telefonunuza/masaüstünüze anında bildirim gelecektir.`, 'ok');
    btn.textContent = '✅ Alarm Kuruldu';
  } catch (e) {
    alarmDurumYaz('❌ ' + (e.message || 'Alarm kurulamadı'), 'hata');
    btn.textContent = eski;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.alarm-btn');
  if (btn) { e.preventDefault(); alarmPopoverAc(btn); return; }
  if (e.target.closest('#alarmPopover')) return;
  if (!e.target.closest('.alarm-btn')) alarmKapat();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') alarmKapat();
});
window.addEventListener('resize', alarmKapat);

/* ================= Sepet kupon otomasyonu ================= */
//
// Sunucu, her mağaza grubunun ARA TOPLAMI ile o mağazanın kampanyalarını karşılaştırır.
// Kod UYDURULMAZ: kampanya verisinde kod yoksa "kod gerekmiyor" denir.
// "Kuponlu toplam" yalnızca ÜRÜN toplamıdır; kargo ayrı hesaplanır (uyarıda yazar).

let sepetKuponSon = null;

async function sepetKuponPaneli(sonuc) {
  const alan = $('#sepetKuponAlani');
  if (!alan) return;
  sepetKuponSon = null;

  // En iyi senaryonun gruplarını kullan
  const anahtar = sonuc?.enIyiAnahtar;
  const senaryo = anahtar ? (sonuc?.senaryolar || {})[anahtar] : null;
  const gruplar = Array.isArray(senaryo?.gruplar) ? senaryo.gruplar : [];
  if (!gruplar.length) { alan.hidden = true; return; }

  alan.hidden = false;
  $('#sepetKuponIcerik').innerHTML = '<p class="kupon-yukleniyor">Kuponlar sepetine göre değerlendiriliyor…</p>';

  try {
    const res = await fetch('/api/sepet-kupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gruplar: gruplar.map(g => ({
          site: g.site,
          siteName: g.siteName,
          araToplam: g.araToplam,
          urunler: (g.urunler || []).map(u => ({ ad: u.ad, fiyat: u.fiyat })),
        })),
      }),
    });
    const d = await guvenliJson(res);
    if (!res.ok) throw new Error(d.hata || 'Kupon analizi alınamadı');
    sepetKuponSon = d;
    sepetKuponCiz(d, senaryo);
  } catch (e) {
    $('#sepetKuponIcerik').innerHTML = `<p class="kupon-uyari">${esc(e.message)}</p>`;
  }
}

function sepetKuponCiz(d, senaryo) {
  const icerik = $('#sepetKuponIcerik');
  const alan = $('#sepetKuponAlani');
  if (alan) alan.hidden = false;
  const siteler = (d.siteler || []).filter(s => (s.kuponlar || []).length);
  const kodlar = d.kodlar || [];

  if (!siteler.length) {
    icerik.innerHTML = `<p class="kupon-uyari">${esc((d.uyarilar || [])[0] || 'Bu sepet için kupon bulunamadı.')}</p>`;
    return;
  }

  const kazancSatiri = d.toplamKazanc > 0
    ? `<div class="kupon-ozet">
        💰 Bu sepet için <b>${tl(d.toplamKazanc)}</b> kupon indirimi bulundu
        · ürün toplamı ${tl(d.toplamAra)} → <b>${tl(d.kuponluToplam)}</b>
       </div>`
    : `<div class="kupon-ozet kupon-ozet-bos">
        Koşulları karşılayan kupon yok. Aşağıdaki kampanyalar şu an sepete uymuyor.
       </div>`;

  const blok = siteler.map(s => `
    <div class="kupon-grup">
      <div class="kupon-grup-ust">
        <b>${esc(s.siteName)}</b>
        <span class="kupon-grup-toplam">${tl(s.araToplam)}</span>
        ${s.enIyi ? `<span class="kupon-rozet">−${tl(s.enIyi.indirim)}</span>` : ''}
      </div>
      <div class="kupon-satirlar">
        ${(s.kuponlar || []).map((k, i) => `
          <div class="kupon-satir ${k.uygulanabilir ? 'uygulanabilir' : 'uygulanamaz'}">
            <div class="kupon-satir-bilgi">
              <span class="kupon-metin">${esc(k.metin)}</span>
              ${k.kosullar ? `<span class="kupon-kosul">${esc(k.kosullar)}</span>` : ''}
            </div>
            <div class="kupon-satir-sag">
              ${k.kodGerekli
                ? `<button type="button" class="kupon-kod-btn" data-kod="${esc(k.kodu)}"
                     title="Kupon kodunu kopyala">${esc(k.kodu)} <span class="kopya-ikon">⧉</span></button>`
                : (k.uygulanabilir
                    ? '<span class="kupon-otomatik">sepette otomatik</span>'
                    : '<span class="kupon-pasif">uygulanamaz</span>')}
              ${k.yeniToplam != null ? `<span class="kupon-yeni">${tl(k.yeniToplam)}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  icerik.innerHTML = `${kazancSatiri}${blok}
    ${kodlar.length > 1 ? `<div class="kupon-kodlari">
      <b>Tüm kodlar:</b>
      ${kodlar.map(k => `<button type="button" class="kupon-kod-btn" data-kod="${esc(k.kod)}"
        title="${esc(k.siteName)} — ${tl(k.kazanc)} kazanç">${esc(k.kod)} <span class="kopya-ikon">⧉</span></button>`).join(' ')}
      <button type="button" class="kupon-kod-btn kupon-hepsi" id="kuponHepsiBtn">Tümünü kopyala</button>
    </div>` : ''}
    ${(d.uyarilar || []).map(u => `<p class="kupon-uyari">⚠️ ${esc(u)}</p>`).join('')}
    <p class="kupon-uyari kupon-uyari-notr">
      İndirim tutarları mağazanın kampanya metninden hesaplanır. Kesin tutar ödeme adımında görünür.
    </p>`;

  // Kod kopyalama (tek tık) — 2026-11-12: mikro toast + buton onay durumu.
  icerik.querySelectorAll('.kupon-kod-btn[data-kod]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kod = btn.dataset.kod;
      if (!kod) return;
      await panoyaKopyalaVeGeriBildirim(kod, btn, `${kod} kopyalandı!`);
    });
  });
  // Tüm kodları kopyala
  const hepsi = $('#kuponHepsiBtn');
  if (hepsi) {
    hepsi.addEventListener('click', async () => {
      const metin = kodlar.map(k => `${k.siteName}: ${k.kod}`).join('\n');
      await panoyaKopyalaVeGeriBildirim(metin, hepsi, `${kodlar.length} kupon kodu kopyalandı!`);
    });
  }
}

/** Panoya kopyalar; güvenli bağlam yoksa sessiz yedek kullanır. */
async function kopyala(metin) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(metin);
      return true;
    }
  } catch { /* yedek yola düş */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = metin;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* ---------------- Kargo bedava tamamlayıcı (ürün kartlarında) ---------------- */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tamamlayici-btn');
  if (!btn || btn.disabled) return;
  const alan = btn.closest('.kart-kargo-alani')?.querySelector('.tamamlayici-alan');
  if (!alan) return;

  btn.disabled = true;
  const eskiMetin = btn.textContent;
  btn.textContent = 'Aranıyor…';
  alan.hidden = false;
  alan.innerHTML = '<span class="ipucu">Tamamlayıcı ürünler aranıyor…</span>';

  try {
    const res = await fetch('/api/tamamlayici', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site: btn.dataset.site,
        sepetToplam: Number(btn.dataset.toplam),
        kargo: {
          fee: Number(btn.dataset.fee),
          freeOver: Number(btn.dataset.freeover),
          freeOverExclusive: btn.dataset.exclusive === '1',
          applies: true,
        },
      }),
    });
    const d = await guvenliJson(res);
    if (!res.ok) throw new Error(d.hata || 'Öneri alınamadı');

    if (!d.oneriler || !d.oneriler.length) {
      alan.innerHTML = `<span class="ipucu">${esc(d.neden || 'Bu sitede aralığa uyan tamamlayıcı ürün bulunamadı.')}</span>`;
    } else {
      alan.innerHTML = `<div class="tamamlayici-baslik">🚚 ${tl(d.kargoUcreti)} kargo yerine:</div>`
        + d.oneriler.map(o => `<div class="tamamlayici-satir">
            <a href="${esc(o.afiliyeUrl || o.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(btn.dataset.site || '')}">${esc(o.title)}</a>
            <span class="tamamlayici-fiyat">${tl(o.fiyat)}</span>
            <span class="tamamlayici-kazanc">+${tl(o.kazanc)} kâr</span>
          </div>`).join('')
        + `<div class="ipucu">${tl(d.eksik)} eksik vardı; bu ürünle eşik aşılıyor ve kargo bedava oluyor.</div>`;
    }
  } catch (err) {
    alan.innerHTML = `<span class="ipucu">${esc(err.message)}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = eskiMetin;
  }
});

/**
 * Kargo bedava eşiği için "tamamlayıcı ürün bul" düğmesi üretir (2026-10-27).
 * Yalnızca şu durumda gösterilir: kargo ücreti uygulanıyor, eşik var ve
 * eksik tutar kargo ücretinden KÜÇÜK (aksi halde tamamlayıcı kargodan pahalı
 * olur; kâr mümkün değildir — boşuna öneri göstermiyoruz).
 */
function tamamlayiciButonu(pr, r) {
  const k = pr?.kargo || {};
  if (k.uygulanir !== true) return '';
  const esik = k.freeOver;
  const ucret = k.ucret;
  const ara = pr?.araToplam;
  if (esik == null || ucret == null || ara == null) return '';

  const kurusa = (x) => Math.round(Number(x) * 100);
  const eksikKurus = kurusa(esik) - kurusa(ara);
  if (eksikKurus <= 0) return '';
  if (eksikKurus > kurusa(ucret)) return ''; // kâr matematiksel olarak imkânsız

  const exclusive = r?.product?.shipping?.freeOverExclusive === true ? '1' : '0';
  const d = BASKI_ORTAM.dil || 'tr';
  const kalanStr = tl(eksikKurus / 100);
  const btnMetin = d === 'fr' ? 'Ajouter un article pour port gratuit' : (d === 'ja' ? '送料無料になる追加商品を探す' : (d === 'en' ? 'Find add-on for free shipping' : 'Kargo bedava için tamamlayıcı bul'));
  const titleMetin = d === 'fr'
    ? `Il manque ${kalanStr} pour le port gratuit ; suggestions adaptées.`
    : (d === 'ja'
      ? `送料無料ラインまであと ${kalanStr} です。追加候補を表示します。`
      : (d === 'en'
        ? `${kalanStr} away from free shipping; suggests an add-on cheaper than the shipping fee.`
        : `Eşiğe ${kalanStr} kaldı; bu tutar ile kargo ücreti arasında bir ürün önerilir`));
  return `<button type="button" class="tamamlayici-btn"
    data-site="${esc(r.site)}"
    data-toplam="${(kurusa(ara) / 100).toFixed(2)}"
    data-fee="${(kurusa(ucret) / 100).toFixed(2)}"
    data-freeover="${(kurusa(esik) / 100).toFixed(2)}"
    data-exclusive="${exclusive}"
    title="${esc(titleMetin)}">${esc(btnMetin)}</button>`;
}

/** Hızlı mod açık mı? (varsayılan: açık) */
function hizliModAcik() {
  const el = $('#sepetHizli');
  return el ? !!el.checked : true;
}

/* Sepet ilerleme satırlarının durumu (her ürün için tek satır) */
let sepetDurumSatirlari = [];

/** URL'yi okunur biçime kısaltır: "site.com · urun-slug" */
function sepetAdKisalt(ad) {
  const s = String(ad || '');
  if (!/^https?:\/\//i.test(s)) return s.slice(0, 80);
  try {
    const u = new URL(s);
    const parcalar = u.pathname.split('/').filter(Boolean);
    const son = parcalar.length ? decodeURIComponent(parcalar[parcalar.length - 1]) : '';
    return u.hostname.replace(/^www\./, '') + (son ? ' · ' + son.slice(0, 48) : '');
  } catch {
    return s.slice(0, 80);
  }
}

function sepetIlerlemeCiz() {
  const el = $('#sepetIlerleme');
  if (!el) return;
  el.innerHTML = sepetDurumSatirlari.map((u, i) => {
    if (!u) return '';
    let bilgi;
    if (u.durum === 'ok') {
      bilgi = `${u.siteSayisi ?? 0} sitede bulundu`;
      if (u.enUcuz?.fiyat != null) bilgi += ` · en ucuz ${tl(u.enUcuz.fiyat)} (${u.enUcuz.site})`;
    } else if (u.durum === 'hata' || u.durum === 'bulunamadi') {
      bilgi = 'bulunamadı';
    } else if (u.durum === 'bekliyor') {
      bilgi = 'sırada…';
    } else {
      bilgi = 'taranıyor…';
    }
    return `<div class="sepet-urun-durum ${u.durum}">
      <span class="sepet-urun-no">${i + 1}</span>
      <span class="sepet-urun-ad">${esc(u.ad)}</span>
      <span class="sepet-urun-bilgi">${esc(bilgi)}</span></div>`;
  }).join('');
}

// 🧺 Ana arama kartından tek tıkla "Akıllı Sepete Ekle" (2026-11-21)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.sepete-ekle-btn');
  if (!btn) return;
  if (btn.classList.contains('eklendi')) {
    window.location.href = '/sepet.html';
    return;
  }
  const url = btn.dataset.sepetUrl || '';
  const ad = btn.dataset.sepetAd || url;
  if (!url) return;

  const hesap = await sepetHesapModulunuYukle();
  let mevcut = [];
  try {
    mevcut = hesap
      ? hesap.sepetNormalize(localStorage.getItem('eun_sepet_v1'))
      : JSON.parse(localStorage.getItem('eun_sepet_v1') || '[]');
  } catch { mevcut = []; }
  if (!Array.isArray(mevcut)) mevcut = [];

  const ayni = mevcut.find(x => String(x.url || '').toLowerCase() === url.toLowerCase());
  const fiyat = Number(btn.dataset.sepetFiyat);
  if (ayni) {
    ayni.adet = Math.min(9, (Number(ayni.adet) || 1) + 1);
  } else if (mevcut.length < 10) {
    mevcut.push({
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ad: ad.slice(0, 200),
      url,
      adet: 1,
      site: btn.dataset.sepetSite || null,
      fiyat: Number.isFinite(fiyat) && fiyat > 0 ? Math.round(fiyat * 100) / 100 : null,
      kaynak: 'arama',
    });
  }
  try { localStorage.setItem('eun_sepet_v1', JSON.stringify(mevcut)); } catch { }

  // Bu aramanın hazır tekliflerini önbellekle → sepette yeniden tarama gerekmez
  if (sonSonuc && Array.isArray(sonSonuc.sonuclar)) {
    const teklifler = sonSonuc.sonuclar
      .filter(s => s.status === 'found' && s.product && s.product.inStock !== false)
      .map(s => ({
        site: s.site,
        siteName: s.siteName,
        urunFiyati: s.product.pricing?.araToplam ?? s.product.sellingPrice ?? null,
        kargo: s.product.shipping || s.product.pricing?.kargo || null,
        url: s.product.url || null,
        afiliyeUrl: s.product.afiliyeUrl || s.product.url || null,
        renkAyni: s.renkAyni !== false,
      }))
      .filter(t => t.urunFiyati != null && t.urunFiyati > 0);
    if (teklifler.length) {
      try {
        const depo = JSON.parse(localStorage.getItem('eun_sepet_onbellek_v1') || '{}') || {};
        depo[url.toLowerCase()] = { ts: Date.now(), teklifler };
        localStorage.setItem('eun_sepet_onbellek_v1', JSON.stringify(depo));
      } catch { }
    }
  }

  // Ana sayfadaki #sepetUrls alanını da güncelle
  const ta = $('#sepetUrls');
  if (ta) {
    const satirlar = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!satirlar.some(s => s.toLowerCase() === url.toLowerCase()) && satirlar.length < 10) {
      ta.value = [...satirlar, url].join('\n');
      sepetSayacGuncelle();
    }
  }

  btn.classList.add('eklendi');
  btn.textContent = `✅ Sepette (${mevcut.length}) · Sepete Git →`;
});
