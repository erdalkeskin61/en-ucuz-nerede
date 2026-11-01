/* En Ucuz Nerede — ana sayfa mantığı */

/* ================= 📱 Alt navigasyon (2026-11-01) =================
 *
 * Mobilde (<768px) sabit alt bar; masaüstünde CSS ile gizlenir.
 *  - Karşılaştır: arama kutusuna odaklanır
 *  - Takiplerim / Fırsatlar: modal (veri sunucudan)
 *  - Sepetim: sepet bölümüne kaydırır
 *  - Ayarlar: /ayarlar.html
 */

function altModalKapat() {
  const m = document.getElementById('altModal');
  if (!m) return;
  m.hidden = true;
  document.body.style.overflow = '';
}

function altModalAc(baslik, html) {
  const m = document.getElementById('altModal');
  if (!m) return;
  document.getElementById('altModalBaslik').textContent = baslik;
  document.getElementById('altModalIcerik').innerHTML = html;
  m.hidden = false;
  document.body.style.overflow = 'hidden';
}

document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-modal-kapat]')) altModalKapat();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') altModalKapat();
});

/** Takiplerim: kayıtlı ürünler + hedef fiyat + son fiyat. */
async function altNavTakipler() {
  altModalAc('🔔 Takiplerim', '<div class="alt-modal-bos">Yükleniyor…</div>');
  try {
    const res = await fetch('/api/tracked');
    const liste = await res.json();
    if (!Array.isArray(liste) || !liste.length) {
      altModalAc('🔔 Takiplerim', '<div class="alt-modal-bos">Henüz takip ettiğin ürün yok.<br>'
        + 'Bir ürünü karşılaştırdıktan sonra "Bu ürünü takibe al" ile ekleyebilirsin.</div>');
      return;
    }
    altModalAc('🔔 Takiplerim', liste.map(t => {
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
    altModalAc('🔔 Takiplerim', '<div class="alt-modal-bos">Takipler yüklenemedi.</div>');
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

// Site listesi sunucudan (/api/durum) dinamik olarak yüklenir; yüklenene kadar
// bilinen temel siteler gösterilir.
let SITE_SIRASI = ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'itopya', 'pazarama', 'incehesap'];
let SITE_ADLARI = {
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
    const res = await fetch('/api/durum');
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

function tl(n) {
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

function oneriIkonu(tur) {
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
      <span class="oneri-ikon" aria-hidden="true">${oneriIkonu(o.tur)}</span>
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
    const res = await fetch('/api/search-suggestions?q=' + encodeURIComponent(q) + '&limit=8');
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

const MOD_PLACEHOLDER = {
  oto: 'Ürün linki yapıştır ya da ürün adı yaz…  ör. "eSun PLA+", "iPhone 15"',
  link: 'Ürün linkini yapıştır…  ör. https://www.trendyol.com/urun-adi-p-123',
  ad: 'Ürün adı veya model yaz…  ör. "eSun PLA+", "iPhone 15", "Bambu Lab P1S"',
};
const MOD_BUTON = { oto: 'Fiyatları Bul', link: 'Linkte Ara', ad: 'Fiyatları Bul' };

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
  let url = $('#urunUrl').value.trim();
  $('#hata').hidden = true;
  $('#sonAramaNotu').hidden = true;
  sifirdanTaraButonunuGoster(false);
  // Önceki aramaların açık SSE bağlantılarını kapat (2026-10-29)
  tumAkislariKapat();
  if (!url) return;

  /* ---- 🔗 Moda göre doğru akışı seç (2026-10-31) ---- */
  const linkGirdi = linkGibiMi(url);

  // "Ürün adıyla ara": link olsa bile doğal dil akışına gider.
  if (aramaModu === 'ad' || (aramaModu === 'oto' && !linkGirdi)) {
    const ihtiyacAlani = $('#ihtiyacMetni');
    const oneriFormu = $('#oneriForm');
    if (ihtiyacAlani && oneriFormu) {
      ihtiyacAlani.value = url;
      // Doğal dil aramasında önceki link sonucu ekranda kalmasın.
      $('#sonucAlani').hidden = true;
      $('#durumAlani').hidden = true;
      $('#oneriSonuc').hidden = true;
      if (oneriFormu.requestSubmit) oneriFormu.requestSubmit();
      else $('#oneriBtn').click();
      setTimeout(() => {
        document.querySelector('#oneriDurum')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return;
    }
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
  $('#araBtn').textContent = 'Aranıyor…';
  $('#sonucAlani').hidden = true;
  $('#durumAlani').hidden = false;
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
  // Site listesi henüz gelmediyse bekle → çipler 61 site ile çizilsin.
  await sitelerHazir;
  $('#siteCipleri').innerHTML = SITE_SIRASI.map(s =>
    `<span class="cip" id="cip-${s}"><span class="nokta"></span>${SITE_ADLARI[s]}</span>`).join('');

  try {
    const govde = zorlaTaze ? { url, taze: true } : { url };
    zorlaTaze = false;
    const res = await fetch('/api/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    });
    const data = await guvenliJson(res);
    if (!res.ok) throw new Error(data.hata || 'İstek başarısız');
    aktifIs = data.isId;
    // Son aramayı yerelde sakla: Ayarlar'a gidip dönünce input ve sonuç geri yüklensin.
    try { localStorage.setItem('son_arama', JSON.stringify({ url, isId: data.isId, ts: Date.now() })); } catch { }

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
        sonucGoster(onbellekSonuc, { kaydir: false });
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

function hataGoster(mesaj) {
  $('#araBtn').disabled = false;
  $('#araBtn').textContent = MOD_BUTON[aramaModu] || 'Fiyatları Bul';
  $('#durumAlani').hidden = true;
  // İskeletleri temizle (hata durumunda boş iskelet kalmasın).
  const iskelet = document.querySelector('.skeleton-izgara');
  if (iskelet) iskelet.hidden = true;
  document.querySelectorAll('#kartlar > .skeleton-canli').forEach(el => el.remove());
  sifirdanTaraButonunuGoster(false);
  iptalDurumunuSifirla();
  $('#hata').textContent = mesaj;
  $('#hata').hidden = false;
}

// ---- İptal (2026-10-27) ----
// Sunucu kalan siteleri atlar; o ana kadar bulunan ürünler korunur ve gösterilir.
let iptalEdiliyor = false;

function iptalDurumunuSifirla() {
  iptalEdiliyor = false;
  const btn = $('#iptalBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '✕ İptal';
}

async function karsilastirmayiIptalEt() {
  if (!aktifIs || iptalEdiliyor) return;
  iptalEdiliyor = true;
  const btn = $('#iptalBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'İptal ediliyor…'; }
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
    notMetniAyarla('Karşılaştırma iptal edildi — o ana kadar bulunan sonuçlar gösteriliyor.');
    not.hidden = false;
    sifirdanTaraButonunuGoster(false);
  }
}

let lastAppFingerprint = '';
let appRenderFrame = null;

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
    parcalar.push(`⚡ Bu ürün ${durum.yasMetni || 'daha önce'} tarandı (Hafızadan gösteriliyor)`
      + ' · Mağazalar canlı kontrol ediliyor...');
  } else if (durum.tazelemeHatasi) {
    parcalar.push(`⚠️ Fiyatlar güncellenemedi (${String(durum.tazelemeHatasi).slice(0, 70)}) — `
      + 'aşağıdaki sonuç son taramaya ait.');
  } else if (durum.tazelemeBitti && durum.fark) {
    const d = durum.fark;
    const degisen = (d.degisen || []).length;
    const yeniSite = (d.yeni || []).length;
    const kaybolan = (d.kaybolan || []).length;
    if (degisen || yeniSite) {
      const ornek = (d.degisen || []).slice(0, 2)
        .map(x => `${x.siteName} ${tl(x.eski)} → ${tl(x.yeni)}`).join(', ');
      parcalar.push(`✅ ${degisen + yeniSite} mağazada fiyat güncellendi ✓`
        + (ornek ? ` (${ornek})` : '')
        + (yeniSite ? ` · ${yeniSite} yeni mağaza` : '')
        + (kaybolan ? ` · ${kaybolan} mağaza sonuçtan çıktı` : '') + '.');
      // Fiyatı düşen kartlar yeşil parlar (SWR canlı güncelleme görünürlüğü).
      fiyatDegisenKartlariParlat(d.degisen || []);
    } else if (kaybolan) {
      parcalar.push(`⚠️ ${kaybolan} mağaza artık sonuç vermiyor; diğer fiyatlar doğrulandı.`);
    } else {
      // Hiçbir fiyat değişmediyse bunu AÇIKÇA söyle: kullanıcı "güncel mi?" diye düşünmesin.
      parcalar.push('✅ Tüm fiyatlar güncel ve doğrulandı ✓');
    }
  } else if (durum.anlik) {
    parcalar.push(`⚡ Bu ürün ${durum.yasMetni || 'daha önce'} tarandı (Hafızadan gösteriliyor).`);
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
    if (job.tazeleniyor) {
      anlikNotuGuncelle({ tazeleniyor: true, yasMetni: job.yasMetni });
      const surum = job.surum || 0;
      if (surum !== anlikSurum) {
        anlikSurum = surum;
        const birlestirilmis = anlikBirlestir(job.result, job.partialResults, job.kaynak);
        if (birlestirilmis) {
          sonSonuc = birlestirilmis;
          zamanlaCiz(() => {
            sonucGoster(birlestirilmis, { keepDurum: true, kaydir: false, canli: true });
            appRenderFrame = null;
            anlikNotuGuncelle({ tazeleniyor: true, yasMetni: job.yasMetni });
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
      sonSonuc = job.result;
      zamanlaCiz(() => {
        sonucGoster(job.result, { keepDurum: true, kaydir: false });
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
  zamanlaCiz(() => {
    sonucGoster(job.result, { kaydir: false });
    appRenderFrame = null;
    // İptal sonrası kısmi sonuç gösteriliyorsa bunu açıkça belirt
    const iptal = job.iptalEdildi || job.result?.ozet?.iptalEdildi;
    const kalan = job.result?.ozet?.taranmayanSiteSayisi || 0;
    const bilgiNotu = $('#sonAramaNotu');
    if (iptal && bilgiNotu) {
      notMetniAyarla('Karşılaştırma iptal edildi'
        + (kalan > 0 ? ` — ${kalan} site taranmadı.` : '.')
        + ' Aşağıda o ana kadar bulunan sonuçlar var.');
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
    if (p.status === 'running') { el.classList.add('calisiyor'); el.title = p.note || 'Aranıyor'; }
    else if (p.status === 'found') {
      el.classList.add('bulundu');
      el.title = p.note || '';
      // Fiyat yoksa "—" yazmayız: farklı renk/model eşleşmelerinde fiyat bilinmez.
      // (Aksi hâlde çip "Bulundu · —" gibi anlamsız görünüyordu — 2026-10-29)
      el.innerHTML = `<span class="nokta"></span>${SITE_ADLARI[s]}`
        + (p.fiyat != null ? ' · ' + tl(p.fiyat) : '');
    } else if (p.status === 'error') { el.classList.add('hata'); el.title = p.note || 'Hata'; }
    else if (p.status === 'iptal') { el.classList.add('iptal'); el.title = p.note || 'İptal edildi'; }
    else if (p.status === 'not_found') { el.classList.add('bulunamadi'); el.title = p.note || 'Bulunamadı'; }
  }
  // İlerleme çubuğu ve sayaç
  const dolgu = document.querySelector('.tarama-dolgu');
  const sayac = document.getElementById('taramaSayac');
  if (dolgu) dolgu.style.width = Math.round(bitti / Math.max(SITE_SIRASI.length, 1) * 100) + '%';
  if (sayac) sayac.textContent = `${bitti}/${SITE_SIRASI.length} site tarandı · ${bulundu} sitede bulundu`;
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
      parcalar.push(`<button type="button" class="filtre-chip cap-chip" data-filtre="cap:1.75">Çap: 1.75mm (${capS['1.75']})</button>`);
    }
    if ((capS['2.85'] || 0) > 0) {
      parcalar.push(`<button type="button" class="filtre-chip cap-chip cap-tehlike" data-filtre="cap:2.85">⚠️ Çap: 2.85mm (${capS['2.85']})</button>`);
    }
    capEl.innerHTML = parcalar.length
      ? `<span class="filtre-alt-etiket">Çap:</span>${parcalar.join('')}` : '';
  }

  if (hmEl) {
    const parcalar = Object.entries(hmS)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tur, n]) => `<button type="button" class="filtre-chip hm-chip" data-filtre="hm:${esc(tur)}">${esc(BASKI_HAMMADDE_ADLARI[tur] || tur)} (${n})</button>`);
    if (ozet?.yuksekBirimSayisi > 0) {
      parcalar.push(`<button type="button" class="filtre-chip hm-chip birim-chip" data-filtre="birim_uyari">⚠️ Yüksek Birim Maliyet (${ozet.yuksekBirimSayisi})</button>`);
    }
    hmEl.innerHTML = parcalar.length
      ? `<span class="filtre-alt-etiket">Hammadde:</span>${parcalar.join('')}` : '';
  }

  // Seçili filtre korunur (canlı güncellemede sıfırlanmasın).
  document.querySelectorAll('.filtre-chip').forEach(c => {
    c.classList.toggle('aktif', c.dataset.filtre === secili);
  });
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
    liste = liste.filter(r => r.status === 'found' && (r.kargoBedava || r.product?.pricing?.kargo?.ucret === 0 || r.product?.pricing?.kargo?.uygulanir === false || /ücretsiz|bedava/i.test(String(r.product?.shipping || ''))));
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
    document.getElementById('kartlar').innerHTML = sirali.map(kartHtml).join('');
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

/** Mağaza adı + favicon (kart ve bento için ortak). */
function siteAdiHtml(site, siteAdi, url) {
  const fav = faviconUrl(url);
  const harf = String(siteAdi || site || '?').trim().charAt(0).toUpperCase();
  return `<span class="site-favicon" aria-hidden="true">${fav
    ? `<img src="${esc(fav)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(harf)}'))">`
    : esc(harf)}</span><span class="site-adi-metin">${esc(siteAdi || site || '')}</span>`;
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
  const kargoBedava = enUcuz.r.kargoBedava
    || pr.kargo?.uygulanir === false
    || pr.kargo?.ucret === 0;
  const kargoNotu = kargoBedava
    ? '<span class="bento-rozet yesil">📦 Kargo dahil</span>'
    : (Number(pr.kargo?.ucret) > 0
      ? `<span class="bento-rozet">📦 +${tl(pr.kargo.ucret)} kargo</span>`
      : '<span class="bento-rozet">📦 Kargo sepette</span>');
  const stokNotu = p.inStock === false
    ? '<span class="bento-rozet kirmizi">🔴 Tükendi</span>'
    : '<span class="bento-rozet yesil">🟢 Stokta</span>';
  const link = p.afiliyeUrl || p.url || '#';
  const siteAdi = enUcuz.r.siteName || SITE_ADLARI[enUcuz.r.site] || enUcuz.r.site;

  const trendBlok = gecmisVar
    ? `<div class="bento-istatistik">
         <div><span class="bento-mini-etiket">Dip</span><b>${tl(min)}</b></div>
         <div><span class="bento-mini-etiket">Ort.</span><b>${tl(ort)}</b></div>
         <div><span class="bento-mini-etiket">Tepe</span><b>${tl(max)}</b></div>
       </div>
       <div class="bento-sparkline-sarmal"><svg id="bentoSparkline" class="bento-sparkline" viewBox="0 0 200 44"
         preserveAspectRatio="none" role="img" aria-label="Son ${gun} gün fiyat trendi"></svg></div>
       <div class="bento-alt-metin">Son ${gun} gün · fiyat geçmişi</div>`
    : `<div class="bento-bos">📈 Henüz yeterli fiyat geçmişi yok.<br>
         <span class="bento-alt-metin">Her karşılaştırma bir kayıt ekler; trend birkaç günde oluşur.</span></div>`;

  alan.innerHTML = `
    <article class="bento-blok bento-spot">
      <div class="bento-etiket">🏷️ EN UCUZ</div>
      <div class="bento-site">${siteAdiHtml(enUcuz.r.site, siteAdi, p.url)}</div>
      <div class="bento-fiyat">${tl(enUcuz.fiyat)}</div>
      <div class="bento-rozetler">${kargoNotu}${stokNotu}</div>
      <a class="bento-cta" href="${esc(link)}" target="_blank" rel="noopener sponsored"
         data-afiliye-site="${esc(enUcuz.r.site || '')}">Mağazaya Git <span aria-hidden="true">↗</span></a>
    </article>

    <article class="bento-blok bento-trend">
      <div class="bento-etiket">📈 Fiyat trendi</div>
      ${trendBlok}
    </article>

    <article class="bento-blok bento-dagilim">
      <div class="bento-etiket">📊 Fiyat dağılımı</div>
      <div class="bento-dagilim-ust">
        <span class="bento-dagilim-etiket">En ucuz</span>
        <b class="bento-dagilim-fiyat yesil">${tl(enUcuz.fiyat)}</b>
      </div>
      <div class="bento-dagilim-ust">
        <span class="bento-dagilim-etiket">En pahalı</span>
        <b class="bento-dagilim-fiyat">${tl(enPahali?.fiyat)}</b>
      </div>
      <div class="bento-bar" aria-hidden="true"><span style="width:${Math.max(6, Math.min(100, 100 - (yuzde || 0)))}%"></span></div>
      <div class="bento-fark">${fark > 0 ? `${tl(fark)} fark` : 'Tüm mağazalarda aynı fiyat'}</div>
      <div class="bento-kazanc">${yuzde != null && yuzde > 0 ? `%${String(yuzde).replace('.', ',')} daha az öde` : 'Fark yok'}</div>
      <div class="bento-alt-metin">${v.magazaSayisi} mağaza · ${v.stoktaSayisi} stokta</div>
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

/** İskelet kart HTML'i (shimmer). */
function iskeletKartHtml() {
  return `<div class="skeleton-kart skeleton-canli" aria-hidden="true">
    <div class="skeleton-ust"><span class="skeleton-kutu skeleton-resim"></span>
      <div class="skeleton-metin">
        <span class="skeleton-cizgi w-70"></span>
        <span class="skeleton-cizgi w-90"></span>
        <span class="skeleton-cizgi w-40"></span>
      </div>
    </div>
    <span class="skeleton-cizgi w-50"></span>
    <span class="skeleton-cizgi w-100"></span>
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

function sonucGoster(sonuc, opts = {}) {
  if (!sonuc) return;
  // İlk sonuç çizildiğinde iskelet kartlar gizlenir (canlı güncellemede de).
  const iskelet = document.querySelector('.skeleton-izgara');
  if (iskelet) iskelet.hidden = true;
  if (!opts.keepDurum) {
    $('#durumAlani').hidden = true;
  }
  $('#sonucAlani').hidden = false;
  $('#takipMesaj').textContent = '';

  const k = sonuc.kaynak || { site: 'kaynak', urun: 'Ürün' };
  $('#kaynakBaslik').textContent = k.urun || 'Ürün';
  $('#kaynakBilgi').innerHTML = [
    `Kaynak: <b>${SITE_ADLARI[k.site] || k.site || 'Belirtilmedi'}</b>`,
    k.marka ? `Marka: <b>${k.marka}</b>` : '',
    k.modelKodu ? `Model kodu: <span class="rozet">${esc(k.modelKodu)}</span>` : '',
    k.barkod ? `Barkod: <b>${esc(k.barkod)}</b>` : '',
    k.renk ? `Renk: <span class="rozet renk">${esc(k.renk)}</span>` : '',
  ].filter(Boolean).join(' · ');

  const o = sonuc.ozet || {};
  const bulunanlar = (sonuc.sonuclar || []).filter(r => r.status === 'found' && r.product);
  const stoktaVarSayisi = o.stoktaVarSayisi ?? bulunanlar.filter(r => r.product.inStock !== false).length;
  const stoktaYokSayisi = o.stoktaYokSayisi ?? bulunanlar.filter(r => r.product.inStock === false).length;
  const tamamiTukendi = o.tamamiTukendi ?? (bulunanlar.length > 0 && stoktaVarSayisi === 0);

  if (tamamiTukendi) {
    $('#ozetKutu').innerHTML = `<div class="etiket" style="color:#dc2626">⚠️ Tüm Mağazalarda Tükendi</div><div class="fiyat" style="color:#dc2626">Stok Yok</div><div class="yer">${bulunanlar.length} mağazanın tamamında stok tükenmiş</div>`;
  } else if (o.enUcuzSite) {
    const stokEkNot = stoktaYokSayisi > 0 ? ` · ${stoktaVarSayisi} mağazada stokta` : '';
    $('#ozetKutu').innerHTML = `<div class="etiket">🏷️ En ucuz (stokta var)</div><div class="fiyat">${tl(o.enUcuzFiyat)}</div><div class="yer">${esc(o.enUcuzSite)}${stokEkNot}</div>`;
  } else {
    $('#ozetKutu').innerHTML = `<div class="etiket">Sonuç</div><div class="fiyat">—</div><div class="yer">Stokta ürün bulunamadı</div>`;
  }

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
    if (chipVar) chipVar.textContent = `🟢 Stokta Var (${stoktaVarSayisi})`;
    const chipYok = document.querySelector('.filtre-chip[data-filtre="stokta_yok"]');
    if (chipYok) chipYok.textContent = `🔴 Stokta Yok (${stoktaYokSayisi})`;
    // 🖨️ Çap ve hammadde filtreleri (2026-10-30)
    baskiFiltreleriniDoldur(sonuc);
  }

  $('#kartlar').innerHTML = sirali.map(kartHtml).join('');
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

  if (opts.kaydir === true) $('#sonucAlani').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function birimKgMetni(deger) {
  if (deger == null || !isFinite(deger)) return null;
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/kg';
}

function birimLMetni(deger) {
  if (deger == null || !isFinite(deger)) return null;
  return Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺/L';
}

/** 800 → "800 g", 3000 → "3 kg" */
function gramMetni(gram) {
  if (gram == null || !isFinite(gram)) return null;
  const g = Number(gram);
  if (g >= 1000 && g % 100 === 0) {
    return (g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' kg';
  }
  return g.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' g';
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

  const tavsiyeMetni = z.tavsiye === 'simdi_al' ? 'Şimdi Al'
    : z.tavsiye === 'bekle' ? 'Bekle / Pahalı'
      : z.tavsiye === 'piyasa' ? 'Fiyat Normal' : 'Veri Az';
  rozet.textContent = (z.tavsiye === 'simdi_al' ? '🟢 ' : z.tavsiye === 'bekle' ? '🔴 ' : z.tavsiye === 'piyasa' ? '🟡 ' : '⚪ ') + tavsiyeMetni;

  const gun = z.gunSayisi || 0;
  const nokta = z.veriNoktasi || 0;
  alt.textContent = `${gun} günlük geçmiş · ${nokta} fiyat gözlemi`;

  if (z.ortalamaFarkYuzde == null) {
    farkEl.textContent = '—';
    farkEl.className = 'fiyat-zeka-fark';
  } else {
    const f = z.ortalamaFarkYuzde;
    farkEl.textContent = f >= 0
      ? `30G ortalamadan %${Math.abs(f)} daha ucuz`
      : `30G ortalamadan %${Math.abs(f)} daha pahalı`;
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
  if (z.minFiyat != null) parcalar.push(`En düşük: <b>${tl(z.minFiyat)}</b>`);
  if (z.ortFiyat != null) parcalar.push(`30G ort.: <b>${tl(z.ortFiyat)}</b>`);
  if (z.maxFiyat != null) parcalar.push(`En yüksek: <b>${tl(z.maxFiyat)}</b>`);
  ist.innerHTML = parcalar.join(' · ');

  if (z.mesaj) {
    mesajEl.textContent = z.mesaj;
    mesajEl.hidden = false;
    mesajEl.className = 'fiyat-zeka-mesaj ' + (z.durum === 'sahte_indirim' ? 'uyari' : z.durum === 'dip_fiyat' ? 'firsat' : '');
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
    baslik.textContent = '⚠️ Sahte ucuz uyarısı';
    aciklama.textContent = 'Başlık fiyatı düşük görünen ürün, kilogram başına daha pahalı.';
  } else {
    baslik.textContent = '⚖️ Kilogram başına fiyat';
    aciklama.textContent = 'Farklı gramajlar aynı birime çevrildi.';
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
      <td>${esc(SITE_ADLARI[s.site] || s.siteName || s.site)}${supheli ? ' <span class="birim-supheli-rozet" title="Fiyat doğrulanmalı">şüpheli</span>' : ''}</td>
      <td>${bi.gram != null ? esc(gramMetni(bi.gram)) : '—'}</td>
      <td>${tl(bi.fiyat)}</td>
      <td class="birim-kg-hucre">${esc(birimKgMetni(bi.tlKg))}${bi.tlKgTahmini ? ' <span class="birim-tahmini" title="Nominal yoğunlukla tahmin">~</span>' : ''}</td>
    </tr>`;
  }).join('');

  // Şüpheli fiyat uyarısı (dürüstlük: "en iyi" diye sunmuyoruz)
  const supheliHtml = supheliler.length
    ? `<div class="birim-supheli-uyari">
        <b>⚠️ ${supheliler.length} fiyat doğrulanmalı.</b>
        ${esc(supheliler[0].birim?.supheliNeden || 'Birim fiyat diğerlerinin çok altında.')}
        Bu yüzden "en iyi birim fiyat" seçimine dahil edilmedi.
      </div>`
    : '';

  const referansNotu = referans
    ? `<p class="birim-alt">Karşılaştırma ${esc(gramMetni(referans))} üzerinden yapıldı. `
      + '₺/kg = gerçekte ödenecek tutar ÷ net miktar.</p>'
    : '<p class="birim-alt">₺/kg = gerçekte ödenecek tutar ÷ net miktar.</p>';

  $('#birimIcerik').innerHTML = `
    ${tuzakHtml}
    ${supheliHtml}
    ${satirlar ? `<table class="birim-tablo">
      <thead><tr><th>Mağaza</th><th>Miktar</th><th>Fiyat</th><th>Birim fiyat</th></tr></thead>
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
  $('#muadilYenileBtn').textContent = 'Muadili ara';
  $('#muadilYenileBtn').hidden = false;

  if (stokYok || hicYok) {
    $('#muadilIkon').textContent = stokYok ? '🚫' : '🔎';
    $('#muadilBaslik').textContent = stokYok
      ? 'Bu ürün stokta yok'
      : 'Bu ürün hiçbir sitede bulunamadı';
    $('#muadilAciklama').textContent = stokYok
      ? `${teklifler.length} mağazanın tamamı stokta yok görünüyor. Aynı ihtiyacı karşılayan muadillere bakalım.`
      : 'Aynı ihtiyacı karşılayabilecek muadil ürünlere bakabilirsin.';
    alan.hidden = false;
    muadilAra(false);
  } else {
    // Kendiliğinden ARAMA yapılmaz (boşa istek/kredi harcamayalım), ama kullanıcı
    // "fiyat yüksek mi, muadili var mı?" diye elle sorabilsin (2026-10-28).
    $('#muadilIkon').textContent = '🔄';
    $('#muadilBaslik').textContent = 'Muadil ürün var mı?';
    $('#muadilAciklama').textContent = 'Aynı ihtiyacı karşılayan daha uygun fiyatlı modelleri arayabilirsin.';
    $('#muadilYenileBtn').textContent = 'Muadili ara';
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
  icerik.innerHTML = '<div class="muadil-yukleniyor">Muadil ürünler aranıyor… (bu birkaç saniye sürebilir)</div>';
  btn.disabled = true;
  btn.textContent = 'Aranıyor…';

  try {
    const res = await fetch('/api/muadil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sonuc: muadilSonuc, elle }),
    });
    const d = await guvenliJson(res);
    if (!res.ok) throw new Error(d.hata || 'Muadil araması başlatılamadı');
    muadilAktifIs = d.isId || d.id;
    muadilPoll(muadilAktifIs);
  } catch (e) {
    icerik.innerHTML = `<p class="muadil-uyari">${esc(e.message)}</p>`;
    btn.disabled = false;
    btn.textContent = 'Muadili ara';
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
  const map = {
    uygulama: 'Uygulamaya özel', uyelik: 'Üyelere özel', karti: 'Karta özel',
    sepet_tutari: 'Sepet tutarına bağlı', diger: 'Koşullu',
  };
  return map[kosul] || 'Koşullu';
}

/* ================= 🖨️ 3D Baskı Maliyet Widget'ı (2026-10-30) =================
 * Gramaj TEK bir global değerdir: bir kartta değiştirilince tüm kartlar anında
 * yeniden hesaplanır. Böylece kullanıcı "bu makarayla 42 TL / diğerindeki 2.5 kg
 * ile 34 TL" farkını aynı ekranda görür. Sunucudan gelen birim değerler kullanılır;
 * ek istek atılmaz.
 */
let baskiGramaj = 100;

function baskiTl(n) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
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

function baskiWidgetHtml(bk) {
  if (!bk) return '';
  const h = baskiHesapla(bk, baskiGramaj);
  const icerik = h
    ? `Bu makarayla parça başı maliyetiniz: <b>${esc(baskiTl(h.parca))}</b>`
      + ` · Bir makaradan <b>${h.adet ?? '—'} adet</b> basabilirsiniz.`
      + `<span class="baski-alt">Hammadde ${esc(baskiTl(h.hammadde))} + elektrik ~${esc(baskiTl(h.elektrik))}`
      + ` · ${esc(String(h.gramaj).replace('.', ','))} g · ${esc(String(bk.capMm ?? '1,75').replace('.', ','))} mm`
      + ` · ${esc(baskiTl(bk.metreMaliyeti))}/m</span>`
    : `<span class="baski-yok">${esc(bk.neden || 'Bu ürün için baskı maliyeti hesaplanamıyor (miktar okunamadı).')}</span>`;
  return `<div class="baski-widget" data-makara-gram="${esc(String(bk.makaraGram ?? ''))}">
    <div class="baski-baslik">
      <span class="baski-baslik-metin">🖨️ Parça Baskı Maliyeti Hesapla</span>
      <label class="baski-gramaj-etiket">Model gramajı
        <input type="number" class="baski-gramaj" min="1" max="50000" step="1"
          value="${esc(String(baskiGramaj))}" inputmode="decimal" aria-label="Dilimleyicide okunan model gramajı" />
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
    const h = baskiHesapla(r?.baski, baskiGramaj);
    const hedef = w.querySelector('.baski-sonuc');
    if (!hedef) continue;
    if (h) {
      hedef.innerHTML = `Bu makarayla parça başı maliyetiniz: <b>${esc(baskiTl(h.parca))}</b>`
        + ` · Bir makaradan <b>${h.adet ?? '—'} adet</b> basabilirsiniz.`
        + `<span class="baski-alt">Hammadde ${esc(baskiTl(h.hammadde))} + elektrik ~${esc(baskiTl(h.elektrik))}`
        + ` · ${esc(String(h.gramaj).replace('.', ','))} g · ${esc(String(r?.baski?.capMm ?? '1,75').replace('.', ','))} mm`
        + ` · ${esc(baskiTl(r?.baski?.metreMaliyeti))}/m</span>`;
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

function kartHtml(r) {
  if (r.status !== 'found' || !r.product) {
    return `<div class="bulunamadi-karti">
      <div class="site-adi">${SITE_ADLARI[r.site]}</div>
      <div>${r.status === 'error' ? '⚠️ Okunamadı: ' + esc(r.reason) : '🔍 ' + esc(r.reason || 'Ürün bulunamadı')}</div>
    </div>`;
  }
  const p = r.product;
  const pr = p.pricing || {};
  const eslesme = { model_kodu: 'model kodu eşleşmesi', barkod: 'barkod eşleşmesi', benzerlik: 'başlık benzerliği', kaynak: 'kaynak ürün' };

  const rozetler = [];
  if (r.kargoBedava) rozetler.push('<span class="etiket-rozeti rozet-kargo">📦 Ücretsiz Kargo</span>');
  else if (Number(p.pricing?.kargo?.ucret) > 0 && p.pricing?.kargo?.uygulanir !== false) {
    rozetler.push(`<span class="etiket-rozeti rozet-kargo-ucretli">🚚 +${tl(p.pricing.kargo.ucret)} Kargo</span>`);
  }
  if (r.resmiSatici) rozetler.push('<span class="etiket-rozeti rozet-resmi">🏢 Resmi Satıcı</span>');
  if (r.vadeFarksizTaksit) rozetler.push('<span class="etiket-rozeti rozet-taksit">💳 Vade Farksız Taksit</span>');
  const rozetlerHtml = rozetler.length ? `<div class="kart-rozetler">${rozetler.join('')}</div>` : '';

  // 🖨️ 3D Baskı Uzmanlık rozetleri (2026-10-30)
  const bk = r.baski || null;
  const baskiRozetleri = [];
  if (bk?.capUyari) {
    baskiRozetleri.push(`<span class="baski-rozet cap-uyari" title="${esc(bk.capUyari.metin)}">${esc(bk.capUyari.metin)}</span>`);
  } else if (bk?.capMm != null) {
    baskiRozetleri.push(`<span class="baski-rozet cap-ok" title="Standart FDM yazıcılarla uyumlu">✅ ${esc(String(bk.capMm).replace('.', ','))} mm</span>`);
  }
  if (bk?.hammadde?.rozet) {
    baskiRozetleri.push(`<span class="baski-rozet ${esc(bk.hammadde.sinif || '')}">${esc(bk.hammadde.rozet)}</span>`);
  }
  for (const n of (bk?.hammadde?.nitelikler || [])) {
    baskiRozetleri.push(`<span class="baski-rozet ${esc(n.sinif || '')}">${esc(n.rozet)}</span>`);
  }
  if (r.birimUyari) {
    baskiRozetleri.push(`<span class="baski-rozet birim-uyari" title="${esc(r.birimUyari.metin)}">${esc(r.birimUyari.metin)}</span>`);
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

    const bicim = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const recine = b.ml != null && lVar;
    const ana = recine
      ? `🧪 ${bicim(b.tlL)} TL / L`
      : `🏷️ ${bicim(b.tlKg)} TL / kg`;
    const ikincil = recine && kgVar
      ? `≈ ${bicim(b.tlKg)} TL/kg (tahmini)`
      : '';
    const miktar = b.gram != null ? gramMetni(b.gram) : (b.ml != null ? (b.ml / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' L' : '');
    const ipucu = recine
      ? 'Hacimden hesaplandı (nominal yoğunluk)'
      : (b.tlKgTahmini ? 'Hacimden nominal yoğunlukla hesaplandı (tahmini)' : 'Net miktara göre hesaplandı');

    return `<div class="birim-rozet-satiri" title="${esc(ipucu)}">
        <span class="birim-rozet ${recine ? 'birim-rozet-resin' : 'birim-rozet-filament'}">${esc(ana)}</span>
        ${miktar ? `<span class="birim-miktar-rozet">${esc(miktar)}</span>` : ''}
        ${ikincil ? `<span class="birim-rozet-alt">${esc(ikincil)}</span>` : ''}
      </div>`;
  })();

  // 🧾 KDV şeffaflığı (2026-10-31): KDV hariç yayımlayan sitede gösterilen
  // tutar KDV dahildir; hariç tutar da açıkça yazılır.
  const kdvHtml = p.vatIncluded && p.priceExVat != null
    ? `<div class="kdv-not" title="Mağaza bu ürünü KDV hariç yayımlıyor. Karşılaştırmada KDV dahil tutar kullanılır.">🧾 KDV Dahil${p.vatRate ? ` (%${esc(String(p.vatRate))})` : ''} — KDV hariç ${tl(p.priceExVat)}</div>`
    : '';

  const kosulluHtml = (pr.kampanyaKosullu || []).map(k =>
    `<div class="kosullu-kampanya"><span class="kosul-etiket">${kampanyaEtiketi(k.kosul)}</span>${esc(k.metin)}${k.kosul_aciklamasi ? ' — ' + esc(k.kosul_aciklamasi) : ''}</div>`).join('');
  const taksitHtml = (pr.kampanyaTaksit || []).length
    ? `<h4>Taksit</h4>${(pr.kampanyaTaksit || []).map(k => `<div class="taksit-notu">• ${esc(k.metin)}</div>`).join('')}` : '';
  const dahilHtml = (pr.kampanyaDahil || []).length
    ? `<h4>Fiyata dahil</h4>${(pr.kampanyaDahil || []).map(k => `<div class="dahil-notu">✓ ${esc(k.metin)}</div>`).join('')}` : '';

  // Ürün görseli (yoksa ya da yüklenemezse gizlenir)
  const resimHtml = p.image
    ? `<div class="kart-resim"><img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='🏷️'" /></div>`
    : `<div class="kart-resim">🏷️</div>`;

  // Net Etkin Fiyat dökümü: satış fiyatından net tutara adım adım formül
  const dokumAdimlar = (pr.dokuem || []).filter(d =>
    ['cart_discount', 'coupon', 'bank_discount', 'shipping', 'fee', 'installment_surcharge'].includes(d.step) && d.amount !== 0);
  const dokumHtml = dokumAdimlar.length
    ? `<div class="fiyat-dokumu" title="${esc(dokumAdimlar.map(d => `${d.label}: ${tl(d.amount)}`).join(' | '))}">Hesap: ${tl(pr.taban)}${dokumAdimlar.map(d => ` ${d.amount < 0 ? '−' : '+'}${tl(Math.abs(d.amount))}`).join('')}</div>`
    : '';
  const cashbackHtml = (pr.cashback || 0) > 0
    ? `<div class="fiyat-cashback">🪙 ${tl(pr.cashback)} değerinde puan/cashback — etkin maliyet <b>${tl(pr.etkinMaliyet)}</b></div>`
    : '';
  const kuponHtml = pr.kupon
    ? `<div class="fiyat-kupon" title="${esc(pr.kupon.metin)}">🎟️ Kuponla <b>${tl(pr.kupon.fiyat)}</b> (−${tl(pr.kupon.indirimTutari)})${pr.kupon.kodu ? ` — kod: <b>${esc(pr.kupon.kodu)}</b>` : ''}${pr.kupon.kosul ? `<span class="kupon-kosul"> · ${esc(pr.kupon.kosul)}</span>` : ''}</div>`
    : '';
  const kampanyaHtml = pr.kampanyaOnizleme
    ? `<div class="fiyat-kampanya" title="${esc(pr.kampanyaOnizleme.metin)}">🏷️ Kampanyayla <b>~${tl(pr.kampanyaOnizleme.fiyat)}</b>${pr.kampanyaOnizleme.kosul ? `<span class="kampanya-kosul"> · ${esc(pr.kampanyaOnizleme.kosul)}</span>` : ''}</div>`
    : '';

  const stoktaYok = p.inStock === false;
  return `<div class="urun-karti ${r.enUcuz ? 'en-ucuz' : ''} ${r.renkAyni === false ? 'farkli-renk' : ''} ${stoktaYok ? 'stok-yok' : ''}" data-site="${esc(r.site || '')}">
    ${r.enUcuz ? '<span class="ucuz-serit">🏷️ EN UCUZ</span>' : ''}
    ${stoktaYok ? '<span class="stok-yok-serit">🔴 TÜKENDİ</span>' : ''}
    ${!stoktaYok && r.renkAyni === false ? `<span class="farkli-renk-serit">FARKLI RENK: ${esc(p.color || '?')}</span>` : ''}
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
          ${p.color ? `<span class="rozet renk">Renk: ${esc(p.color)}</span>` : ''}
          ${p.modelCode ? `<span class="rozet">Model: ${esc(p.modelCode)}</span>` : ''}
          ${stoktaYok ? '<span class="rozet stok-yok">🔴 Stokta Yok</span>' : '<span class="rozet stok-var">🟢 Stokta Var</span>'}
        </div>
      </div>
    </div>
    <div class="kart-fiyat">
      ${pr.etiket && pr.etiket > (pr.araToplam ?? pr.taban) ? `<div class="etiket-fiyat">${tl(pr.etiket)}</div>` : ''}
      <div class="gercek-fiyat ${r.enUcuz ? 'ek' : ''}">${tl(pr.toplam ?? pr.araToplam ?? p.sellingPrice)}</div>
      ${stoktaYok ? '<span class="stok-fiyat-rozet" title="Ürün şu anda tükendi; gösterilen fiyat son bilinen fiyattır.">Tükendi</span>' : ''}
      ${r.sisirilmisEtiket ? '<span class="sisirilmis-etiket" title="Bu mağazanın üstü çizili liste fiyatı, son 30 günün piyasa ortalamasının %20\'den fazla üzerinde.">⚠️ Şişirilmiş Etiket</span>' : ''}
      <div class="fiyat-at-not">
        ${pr.ekIndirim > 0 ? `Ürüne özel indirim düşüldü: −${tl(pr.ekIndirim)}` : ''}
        ${pr.kargo?.uygulanir ? `+ kargo ${tl(pr.kargo.ucret)}` : ''}
        ${pr.toplam != null ? (stoktaYok ? '⚠️ son bilinen fiyat — ürün şu anda tükendi' : 'gerçekte ödenecek tutar') : 'fiyat hesaplanamadı'}
      </div>
      ${dokumHtml}
      ${cashbackHtml}
      ${kuponHtml}
      ${kampanyaHtml}
  // 🖨️ 3D baskı için "Yüksek Birim Maliyet" uyarısı bu satırın altında kalır.
      ${birimHtml}
      ${kdvHtml}
      ${baskiRozetHtml}
    </div>
    ${baskiWidgetHtml(bk)}
    <div class="kart-kargo-alani">
      <div class="kart-kargo" title="${esc(pr.kargo?.aciklama || '')}">
        <span>🚚 Kargo</span>
        <span class="ucret">${pr.kargo?.uygulanir === true ? tl(pr.kargo.ucret) : (pr.kargo?.uygulanir === false ? 'Bedava' : (pr.kargo?.freeOver ? 'Sepette belli' : 'Bilinmiyor'))}</span>
      </div>
      ${tamamlayiciButonu(pr, r)}
      <div class="tamamlayici-alan" hidden></div>
    </div>
    ${(kosulluHtml || taksitHtml || dahilHtml) ? `<div class="kampanya-bolumu">
      ${kosulluHtml ? `<h4>Koşullu kampanyalar (fiyata dahil değil)</h4>${kosulluHtml}` : ''}
      ${dahilHtml}${taksitHtml}
    </div>` : ''}
    <div class="kart-alt">
      <span class="istek-notu">${kac(r.requestsSpent)} istek${(r.queriesTried || []).length ? ' · sorgu: ' + esc((r.queriesTried || []).join(' / ')) : ''}</span>
      <a class="urun-link ${stoktaYok ? 'tukendi' : ''}" href="${esc(p.afiliyeUrl || p.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(r.site || '')}">${stoktaYok ? 'Mağazada Gör (Tükendi)' : 'Mağazada Gör'}</a>
    </div>
  </div>`;
}

function tabloDoldur(sonuc) {
  const tbody = $('#ozetTablo tbody');
  // Tablo sırası kartlarla AYNI hiyerarşide (stokta olanlar önce).
  const siraliTablo = stokSirala(sonuc.sonuclar || []);

  tbody.innerHTML = siraliTablo.map(r => {
    if (r.status !== 'found' || !r.product) {
      return `<tr>
        <td><b>${SITE_ADLARI[r.site] || r.site}</b></td><td colspan="5">${r.status === 'error' ? '⚠️ ' + esc(r.reason) : esc(r.reason || 'Bulunamadı')}</td>
        <td>—</td><td>${kac(r.requestsSpent)}</td></tr>`;
    }
    const p = r.product, pr = p.pricing || {};
    const stoktaYok = p.inStock === false;
    const stokBadge = stoktaYok
      ? '<span class="stok-hucre-yok">🔴 Yok</span>'
      : '<span class="stok-hucre-var">🟢 Var</span>';
    const kosullu = (pr.kampanyaKosullu || []).map(k => esc(k.metin)).join('<br>') || '—';
    const kargo = pr.kargo?.uygulanir === true ? tl(pr.kargo.ucret) : (pr.kargo?.uygulanir === false ? 'Bedava' : (pr.kargo?.freeOver ? 'Sepette belli' : (pr.kargo?.aciklama || 'Bilinmiyor')));
    return `<tr class="${stoktaYok ? 'stok-yok' : ''}">
      <td><b>${SITE_ADLARI[r.site] || r.site}</b>${r.enUcuz ? ' 🏷️' : ''}</td>
      <td><a href="${esc(p.afiliyeUrl || p.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(r.site || '')}" style="color:#3450D1">${esc(p.title.slice(0, 90))}</a></td>
      <td>${esc(p.color || '—')}${r.renkAyni === false ? ' (farklı)' : ''}</td>
      <td style="text-align:center">${stokBadge}</td>
      <td class="fiyat-hucre">${tl(pr.toplam ?? p.sellingPrice)}</td>
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
    const res = await fetch('/api/history');
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
        : '<span class="gecmis-link yok">link yok</span>';
      const enUcuzLinki = h.enUcuzUrl
        ? `<a class="gecmis-link en-ucuz-link" href="${esc(h.enUcuzUrl)}" target="_blank"
             rel="noopener sponsored" title="${esc(h.enUcuzUrl)}">🏪 En ucuz: ${esc(h.enUcuzSite || 'mağaza')} ↗</a>`
        : '';
      return `<li class="gecmis-oge">
        <div class="gecmis-sol">
          <div class="gecmis-baslik">
            ${h.url
              ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.urun || h.url)}</a>`
              : `<b>${esc(h.urun || '?')}</b>`}
            ${h.adet > 1 ? `<span class="gecmis-adet" title="${h.adet} kez arandı">×${h.adet}</span>` : ''}
          </div>
          <div class="gecmis-meta">
            en ucuz: <b>${esc(h.enUcuzSite || '—')}</b> (${tl(h.enUcuzFiyat)})
            <span class="gecmis-nokta">·</span> ${new Date(h.ts).toLocaleString('tr-TR')}
          </div>
          <div class="gecmis-linkler">${urunLinki}${enUcuzLinki}</div>
        </div>
        <div class="gecmis-sag">
          ${h.url ? `<button type="button" class="gecmis-tekrar" data-url="${esc(h.url)}">↻ Tekrar ara</button>` : ''}
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

// ---- Sayfa tekrar açıldığında son aramayı geri yükle ----
// Ayarlar'a gidip Karşılaştır'a dönünce sayfa tam yeniden yüklenir; son aramanın
// URL'si ve (sunucu hafızasında hâlâ duruyorsa) sonuçları ücretsiz geri getirilir.
(async () => {
  const urlParam = new URLSearchParams(window.location.search).get('url');
  if (urlParam) {
    const input = document.getElementById('urunUrl');
    if (input) input.value = urlParam;
    setTimeout(() => {
      const form = document.getElementById('karsilastirForm');
      if (form) {
        if (form.requestSubmit) form.requestSubmit();
        else document.getElementById('araBtn')?.click();
      }
    }, 150);
    return;
  }

  let kayit = null;
  try { kayit = JSON.parse(localStorage.getItem('son_arama') || 'null'); } catch { /* bozuk kayıt */ }
  if (!kayit || !kayit.url) return;
  $('#urunUrl').value = kayit.url;
  if (!kayit.isId) return;
  try {
    const res = await fetch('/api/compare/' + kayit.isId);
    if (!res.ok) return; // iş artık yok (sunucu yeniden başlamış olabilir) — sessiz geç
    // Kullanıcı bu arada yeni bir arama başlattıysa eski işe dönme.
    if (aktifIs && aktifIs !== kayit.isId) return;
    const job = await guvenliJson(res);
    if (job.status === 'done' && job.result) {
      cipleriGuncelle(isProgressFromResult(job.result));
      sonucGoster(job.result, { kaydir: false });
      sonSonuc = job.result;
      const saat = new Date(kayit.ts || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const not = $('#sonAramaNotu');
      if (not) {
        not.hidden = false;
        notMetniHtmlAyarla(`↩️ Bu, ${saat} tarihli son aramanın sonucu. Güncel fiyatlar için <b>Karşılaştır</b>'a tekrar bas.`);
        sifirdanTaraButonunuGoster(true);
      }
    } else if (job.status === 'running') {
      // Arama hâlâ sürüyor — kaldığı yerden izlemeye devam et
      $('#araBtn').disabled = true;
      $('#araBtn').textContent = 'Aranıyor…';
      $('#sonucAlani').hidden = true;
      $('#durumAlani').hidden = false;
      await sitelerHazir; // çipler tam site listesiyle çizilsin (2026-10-29)
      $('#siteCipleri').innerHTML = SITE_SIRASI.map(s =>
        `<span class="cip" id="cip-${s}"><span class="nokta"></span>${SITE_ADLARI[s]}</span>`).join('');
      karsilastirmaIzle(kayit.isId);
    }
  } catch { /* sessizce geç */ }
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

  try {
    const res = await fetch('/api/oneri', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ihtiyac }),
    });
    const data = await guvenliJson(res);
    if (!res.ok) throw new Error(data.hata || 'İstek başarısız');
    oneriIzle(data.id ?? data.isId);
  } catch (err) {
    oneriHataGoster(err.message);
  }
});

function oneriHataGoster(mesaj) {
  $('#oneriBtn').disabled = false;
  $('#oneriBtn').textContent = 'Öneri al';
  $('#oneriDurum').hidden = true;
  $('#oneriHata').textContent = mesaj;
  $('#oneriHata').hidden = false;
}

/** Öneri butonunu başlangıç durumuna alır. */
function oneriBtnSifirla() {
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


function oneriProgressGoster(p) {
  if (!p) return;
  const fazNotlari = {
    sorgu: 'İhtiyaç analiz ediliyor…',
    arama: 'Sitelerde arama yapılıyor…',
    secim: 'Adaylar arasından sana uygun 5 model seçiliyor…',
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
  $('#oneriBaslik').textContent = `Sana uygun ${oneriler.length} model${b}${r}`;

  // Kart sırası: en düşük fiyatlı model önce (bulunamayanlar sona).
  // Orijinal dizin korunur ki takip butonu doğru ürünü kaydetsin.
  const enDusukFiyat = o => o.karsilastirma?.ozet?.enUcuzFiyat ?? Infinity;
  const sirali = oneriler
    .map((o, i) => ({ o, i }))
    .sort((a, x) => enDusukFiyat(a.o) - enDusukFiyat(x.o));
  $('#oneriKartlar').innerHTML = sirali.map(({ o, i }, sira) => oneriKartHtml(o, i, sonuc, sira)).join('');

  // Takip butonlari
  document.querySelectorAll('.oneri-takip-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
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
      rozet.textContent = "📉 Veri birikiyor";
      rozet.className = "fiyat-tavsiye-rozet badge-turuncu";
    }
    if (notEl) {
      notEl.hidden = false;
      notEl.textContent = metin;
    }
    const ozet = $("#fiyatTrendOzetMetin");
    if (ozet) ozet.textContent = "Henüz yeterli fiyat geçmişi yok";
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
      yetersizGoster(data.neden || "Bu ürün için henüz fiyat geçmişi yok. Her karşılaştırma ve takip kontrolü bir kayıt ekler.");
      return;
    }
    // Tek nokta "trend" değildir: çizgi yerine açıklama gösterilir.
    if (data.timeline.length < 2) {
      yetersizGoster(data.neden || `Yalnızca ${data.gunSayisi} günlük veri var; trend çizgisi için en az 2 gün gerekiyor.`);
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
    if (etDusuk) etDusuk.textContent = `🟢 Son ${gun} Günün En Düşüğü`;
    if (etOrta) etOrta.textContent = `📊 Son ${gun} Günün Ortalaması`;
    if (etYuksek) etYuksek.textContent = `🔴 Son ${gun} Günün En Yükseği`;

    $("#istatistikEnDusuk").textContent = tl(s.lowestPrice);
    $("#istatistikOrtalama").textContent = tl(s.avgPrice);
    $("#istatistikEnYuksek").textContent = tl(s.highestPrice);

    const farkEl = $("#istatistikFark");
    if (farkEl) {
      if (s.diffFromAvg > 0) {
        farkEl.textContent = "%" + s.diffFromAvg + " daha avantajlı";
        farkEl.style.color = "#0d9f4e";
      } else if (s.diffFromAvg < 0) {
        farkEl.textContent = "%" + Math.abs(s.diffFromAvg) + " daha pahalı";
        farkEl.style.color = "#d43c3c";
      } else {
        farkEl.textContent = "Ortalamada";
        farkEl.style.color = "var(--gri-metin)";
      }
    }

    const indirimOraniEl = $("#istatistikIndirimOrani");
    if (indirimOraniEl) {
      indirimOraniEl.textContent = s.diffFromAvg > 0 ? "-%" + s.diffFromAvg : (s.diffFromAvg < 0 ? "+%" + Math.abs(s.diffFromAvg) : "%0");
      indirimOraniEl.className = "istatistik-deger " + (s.diffFromAvg > 0 ? "font-yesil" : (s.diffFromAvg < 0 ? "font-kirmizi" : ""));
    }

    if (rozet) {
      rozet.textContent = s.recommendationText;
      rozet.className = "fiyat-tavsiye-rozet " + (s.badgeClass || "badge-turuncu");
    }

    // Alt metin: gerçek gün sayısı + bu sonuçta okunan mağaza sayısı + gözlem sayısı
    const ozetMetin = $("#fiyatTrendOzetMetin");
    if (ozetMetin) {
      ozetMetin.textContent = `Son ${gun} gün · ${s.toplamKayit} fiyat gözlemi` +
        (found.length ? ` · ${found.length} mağaza` : '');
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
          label: "En Düşük Fiyat",
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
          label: "30 Günlük Ortalama",
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
              return " " + context.dataset.label + ": " + Number(context.parsed.y).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
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
              return val.toLocaleString("tr-TR") + " TL";
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

/** Textarea'dan geçerli URL listesi çıkarır (tekilleştirir, 10 ile sınırlar). */
function sepetUrlListesi() {
  const metin = ($('#sepetUrls')?.value || '');
  const satirlar = metin.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
  const gorulen = new Set();
  const urls = [];
  for (const s of satirlar) {
    if (!/^https?:\/\//i.test(s)) continue;
    if (gorulen.has(s)) continue;
    gorulen.add(s);
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

    if (urls.length < 2) return sepetHataGoster('Sepet için en az 2 ürün linki gerekli.');
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
      const res = await fetch('/api/sepet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urunler: urls.map(u => ({ url: u })), hizliMod: hizliModAcik() }),
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
    btn.textContent = 'İptal ediliyor…';
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
  if (b) { b.disabled = false; b.textContent = 'Sepeti optimize et'; }
  const i = $('#sepetIptalBtn');
  if (i) { i.hidden = true; i.disabled = false; i.textContent = '✕ İptal'; }
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

/** Senaryo kartını HTML'e çevirir. */
function sepetSenaryoKart(senaryo, enIyiMi) {
  if (!senaryo) {
    return `<div class="sepet-senaryo-bos">
      <div class="sepet-senaryo-baslik">Bu senaryo oluşturulamadı</div>
      <p class="ipucu">Ürünlerin tamamını birlikte satan mağaza bulunamadı.</p></div>`;
  }
  const gruplar = senaryo.gruplar.map(g => `
    <div class="sepet-grup">
      <div class="sepet-grup-ust">
        <b>${esc(g.siteName)}</b>
        <span class="sepet-grup-toplam">${tl(g.toplam)}</span>
      </div>
      <ul class="sepet-grup-urunler">
        ${g.urunler.map(u => `<li>
          ${u.url ? `<a href="${esc(u.afiliyeUrl || u.url)}" target="_blank" rel="noopener sponsored" data-afiliye-site="${esc(u.site || g.site || '')}">${esc(String(u.ad).slice(0, 62))}</a>` : esc(String(u.ad).slice(0, 62))}
          <span>${tl(u.fiyat)}</span></li>`).join('')}
      </ul>
      <div class="sepet-grup-kargo">
        Ürünler ${tl(g.araToplam)} · Kargo ${g.kargo > 0 ? tl(g.kargo) : 'bedava'}
        ${g.kargo === 0 && g.kargoKurali?.freeOver ? ` <span class="rozet-kucuk">eşik aşıldı</span>` : ''}
      </div>
    </div>`).join('');

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
    <div class="sepet-senaryo-alt">Ürünler ${tl(senaryo.araToplam)} + Kargo ${tl(senaryo.kargo)}</div>
  </div>`;
}

function sepetSonucGoster(sonuc) {
  $('#sepetSonuc').hidden = false;
  sonSepetSonuc = sonuc;
  sepetPaylasSifirla();
  const s = sonuc.senaryolar || {};
  const kazanc = $('#sepetKazanc');

  if (sonuc.kazanc != null && sonuc.kazanc > 0) {
    kazanc.innerHTML = `💡 <b>${tl(sonuc.kazanc)} net kazanç</b> (${sonuc.kazancYuzde}%) — `
      + `tek mağaza ${tl(sonuc.tekMagazaToplam)} yerine <b>${tl(sonuc.enIyiToplam)}</b>`;
  } else if (sonuc.kazanc != null) {
    kazanc.innerHTML = `Tek mağaza alımı zaten en iyi seçenek: <b>${tl(sonuc.tekMagazaToplam)}</b>`;
  } else {
    kazanc.innerHTML = '';
  }

  const enIyi = sonuc.enIyiAnahtar;
  $('#sepetSenaryolar').innerHTML = [
    sepetSenaryoKart(s.tekMagaza, enIyi === 'tekMagaza'),
    sepetSenaryoKart(s.akilliBolunmus, enIyi === 'akilliBolunmus'),
    sepetSenaryoKart(s.maksimumTasarruf, enIyi === 'maksimumTasarruf'),
  ].join('');

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
  satirlar.push('*En Ucuz Nerede? — Sepet Özeti*');
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
    if (el) {
      el.innerHTML = `✅ WhatsApp açıldı. Link: <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>`;
    }
  } catch (e) {
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

$('#sepetKopyaBtn')?.addEventListener('click', async () => {
  if (!sepetPaylasLinki) return;
  const el = $('#sepetPaylasSonuc');
  try {
    await navigator.clipboard.writeText(sepetPaylasLinki);
    if (el) el.textContent = '✅ Link panoya kopyalandı.';
  } catch {
    if (el) el.textContent = 'Kopyalanamadı — linki elle seçip kopyalayın: ' + sepetPaylasLinki;
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
    <p class="kupon-uyari" style="border-left-color:#cfd6e4;background:#f7f9fc;color:#6b7280">
      İndirim tutarları mağazanın kampanya metninden hesaplanır. Kesin tutar ödeme adımında görünür.
    </p>`;

  // Kod kopyalama (tek tık)
  icerik.querySelectorAll('.kupon-kod-btn[data-kod]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kod = btn.dataset.kod;
      if (!kod) return;
      const ok = await kopyala(kod);
      const eski = btn.innerHTML;
      btn.innerHTML = ok ? '✓ kopyalandı' : esc(kod);
      btn.classList.add('kopyalandi');
      setTimeout(() => { btn.innerHTML = eski; btn.classList.remove('kopyalandi'); }, 1600);
    });
  });
  // Tüm kodları kopyala
  const hepsi = $('#kuponHepsiBtn');
  if (hepsi) {
    hepsi.addEventListener('click', async () => {
      const metin = kodlar.map(k => `${k.siteName}: ${k.kod}`).join('\n');
      const ok = await kopyala(metin);
      const eski = hepsi.textContent;
      hepsi.textContent = ok ? '✓ kopyalandı' : 'Kopyalanamadı';
      setTimeout(() => { hepsi.textContent = eski; }, 1600);
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
  return `<button type="button" class="tamamlayici-btn"
    data-site="${esc(r.site)}"
    data-toplam="${(kurusa(ara) / 100).toFixed(2)}"
    data-fee="${(kurusa(ucret) / 100).toFixed(2)}"
    data-freeover="${(kurusa(esik) / 100).toFixed(2)}"
    data-exclusive="${exclusive}"
    title="Eşiğe ${(eksikKurus / 100).toFixed(2)} TL kaldı; bu tutar ile kargo ücreti arasında bir ürün önerilir">Kargo bedava için tamamlayıcı bul</button>`;
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
