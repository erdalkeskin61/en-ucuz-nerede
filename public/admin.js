/* Yönetici Kontrol Merkezi (/admin.html) — Baskı Hesap */

const $ = (s) => document.querySelector(s);

function tl(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tarih(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sayi(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR');
}

let tumSiteler = [];
let yoneticiYetkili = false;

/* ======================================================================
   🔐 Yönetici Oturumu ve Sekme Gezinmesi
   ====================================================================== */

function girisEkraniGoster(goster, anahtarTanimli = true) {
  const girisEl = $('#adminGirisAlani');
  const icerikEl = $('#adminIcerik');
  const cikisBtn = $('#adminCikisBtn');
  if (girisEl) girisEl.hidden = !goster;
  if (icerikEl) icerikEl.hidden = goster;
  if (cikisBtn) cikisBtn.hidden = goster || !anahtarTanimli;
}

function sekmeSec(ad) {
  document.querySelectorAll('[data-admin-sekme]').forEach(btn => {
    const aktif = btn.dataset.adminSekme === ad;
    btn.classList.toggle('aktif', aktif);
    btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
  document.querySelectorAll('[data-admin-panel]').forEach(panel => {
    panel.hidden = panel.dataset.adminPanel !== ad;
  });
  try { sessionStorage.setItem('eun_admin_sekme', ad); } catch { /* kapalı */ }
}

document.querySelectorAll('[data-admin-sekme]').forEach(btn => {
  btn.addEventListener('click', () => sekmeSec(btn.dataset.adminSekme));
});

try {
  const kayitliSekme = sessionStorage.getItem('eun_admin_sekme');
  if (kayitliSekme && document.querySelector(`[data-admin-panel="${kayitliSekme}"]`)) {
    sekmeSec(kayitliSekme);
  }
} catch { /* kapalı */ }

async function adminPaneliBaslat() {
  if (yoneticiYetkili) return;
  yoneticiYetkili = true;
  document.dispatchEvent(new CustomEvent('admin:yetkili'));
  await Promise.all([
    siteleriYukle(),
    ozetYukle(),
    ayarlariYukle(),
    gorevDurumuYukle(),
    kredileriYukle(false),
    kuponlariYukle(),
    firsatDurumuYukle(),
    dbBakimDurumYukle(),
    radarDurumuYukle(),
    katalogSyncYukle(),
    sponsorYukle(),
    dogrulanmisYukle(),
    saglikYukle(),
  ]);
}

async function oturumKontrol() {
  try {
    const res = await fetch('/api/admin/oturum', { cache: 'no-store' });
    const d = await res.json();
    const uyari = $('#adminYerelUyari');
    if (uyari) uyari.hidden = Boolean(d.anahtarTanimli);
    if (d.yetkili) {
      girisEkraniGoster(false, Boolean(d.anahtarTanimli));
      await adminPaneliBaslat();
    } else {
      girisEkraniGoster(true, Boolean(d.anahtarTanimli));
      if (!d.anahtarTanimli && !d.yerel) {
        const hataEl = $('#adminGirisHata');
        if (hataEl) hataEl.textContent = 'ADMIN_ANAHTARI tanımlanmadığı için dış ağdan erişim kapalı.';
      }
      setTimeout(() => $('#adminAnahtarInput')?.focus(), 50);
    }
  } catch (e) {
    const hataEl = $('#adminGirisHata');
    if (hataEl) hataEl.textContent = 'Oturum kontrol edilemedi: ' + e.message;
  }
}

$('#adminGirisForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const hataEl = $('#adminGirisHata');
  const btn = $('#adminGirisBtn');
  const anahtar = $('#adminAnahtarInput')?.value || '';
  if (hataEl) hataEl.textContent = '';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/admin/giris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anahtar }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Giriş başarısız');
    if ($('#adminAnahtarInput')) $('#adminAnahtarInput').value = '';
    girisEkraniGoster(false, Boolean(d.anahtarTanimli));
    await adminPaneliBaslat();
  } catch (err) {
    if (hataEl) hataEl.textContent = '❌ ' + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#adminCikisBtn')?.addEventListener('click', async () => {
  try { await fetch('/api/admin/cikis', { method: 'POST' }); } catch { /* yoksay */ }
  yoneticiYetkili = false;
  girisEkraniGoster(true, true);
  setTimeout(() => $('#adminAnahtarInput')?.focus(), 50);
});

async function siteleriYukle() {
  try {
    const res = await fetch('/api/durum');
    if (!res.ok) return;
    const d = await res.json();
    tumSiteler = Array.isArray(d.siteler) ? d.siteler : [];
    const dl = $('#adminSitelerDatalist');
    if (dl) {
      dl.innerHTML = tumSiteler.map(s => `<option value="${esc(s.id)}">${esc(s.ad)}</option>`).join('');
    }
  } catch { /* yoksay */ }
}

async function ozetYukle() {
  try {
    const res = await fetch('/api/admin/ozet', { cache: 'no-store' });
    if (!res.ok) return;
    const d = await res.json();
    const s = d.saglikOzet || {};
    if ($('#kpiSaglik')) $('#kpiSaglik').textContent = `${s.ok ?? 0}/${s.toplam ?? 0}`;
    if ($('#kpiSaglikAlt')) $('#kpiSaglikAlt').textContent = s.hata ? `${s.hata} hatalı · ${s.bos || 0} boş` : 'Tüm mağazalar sağlıklı';
    const af = d.afiliye || {};
    if ($('#kpiAfiliye')) $('#kpiAfiliye').textContent = af.durum === 'aktif' ? 'Aktif' : (af.etkin ? 'Eksik' : 'Kapalı');
    if ($('#kpiAfiliyeAlt')) $('#kpiAfiliyeAlt').textContent = `Son 30g: ${sayi(af.tiklama30g)} tıklama`;
    const sp = d.sponsor || {};
    if ($('#kpiSponsor')) $('#kpiSponsor').textContent = `${sp.aktif ?? 0} aktif · ${d.dogrulanmisSayisi ?? 0} tik`;
    if ($('#kpiSponsorAlt')) $('#kpiSponsorAlt').textContent = `${sayi(sp.gosterim)} göst. · ${sayi(sp.tiklama)} tık`;
    if ($('#kpiOtonom')) $('#kpiOtonom').textContent = `${d.radar?.etkin ? 'Radar ON' : 'Radar OFF'} · ${d.firsat?.etkin ? 'Fırsat ON' : 'Fırsat OFF'}`;
    if ($('#kpiOtonomAlt')) $('#kpiOtonomAlt').textContent = `${d.radar?.katalogSayisi ?? 0} katalog · bugün ${d.firsat?.bugun ?? 0} fırsat`;
    if ($('#kpiDb')) $('#kpiDb').textContent = `${d.dbMb ?? '—'} MB`;
    if ($('#kpiDbAlt')) $('#kpiDbAlt').textContent = `WAL: ${d.walMb ?? '—'} MB · ${d.takipSayisi ?? 0} takip`;
  } catch { /* yoksay */ }
}

/* ======================================================================
   ⭐ Sponsorlu Vitrin & ☑️ Doğrulanmış Mağazalar Yönetimi
   ====================================================================== */

function spMesaji(metin, ok = true) {
  const el = $('#spMesaj');
  if (!el) return;
  el.className = 'durum-mesaji ' + (ok ? 'ok' : 'hata');
  el.textContent = metin;
}

async function sponsorYukle() {
  const alan = $('#sponsorTabloAlani');
  if (!alan) return;
  try {
    const res = await fetch('/api/admin/sponsor-rapor', { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.hata || 'Okunamadı');
    const liste = d.kampanyalar || [];
    if (!liste.length) {
      alan.innerHTML = '<p class="alt-not" style="padding:12px">Henüz sponsor kampanya yok.</p>';
      return;
    }
    alan.innerHTML = `<table class="admin-tablo">
      <thead>
        <tr>
          <th>Marka / Kampanya</th>
          <th>Fiyat</th>
          <th>Gösterim</th>
          <th>Tıklama</th>
          <th>CTR</th>
          <th>Durum</th>
          <th>İşlem</th>
        </tr>
      </thead>
      <tbody>
        ${liste.map(k => {
          const durumHap = k.yayinda
            ? '<span class="admin-durum-hap yesil">Yayında</span>'
            : '<span class="admin-durum-hap gri">Pasif / Süresi doldu</span>';
          const ctr = k.ctr != null ? '%' + String(k.ctr).replace('.', ',') : '—';
          return `<tr>
            <td><b>${esc(k.marka)}</b><br><small>${esc(k.baslik)}</small></td>
            <td><b>${tl(k.kampanyaFiyat)}</b>${k.eskiFiyat ? `<br><small><s>${tl(k.eskiFiyat)}</s></small>` : ''}</td>
            <td>${sayi(k.gosterimSayisi)}</td>
            <td>${sayi(k.tiklamaSayisi)}</td>
            <td>${ctr}</td>
            <td>${durumHap}</td>
            <td><button type="button" class="admin-mini-btn tehlike" data-sp-sil="${esc(k.id)}">Sil</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  } catch (e) {
    alan.innerHTML = `<p class="alt-not" style="padding:12px">Yüklenemedi: ${esc(e.message)}</p>`;
  }
}

$('#sponsorTabloAlani')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-sp-sil]');
  if (!btn) return;
  const id = btn.dataset.spSil;
  if (!confirm('Bu sponsor kampanyayı silmek istiyor musunuz?')) return;
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/sponsor-vitrin/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Silinemedi');
    spMesaji('✅ Kampanya silindi.');
    await Promise.all([sponsorYukle(), ozetYukle()]);
  } catch (err) {
    spMesaji('❌ ' + err.message, false);
    btn.disabled = false;
  }
});

$('#spKaydetBtn')?.addEventListener('click', async () => {
  const btn = $('#spKaydetBtn');
  const marka = $('#spMarka')?.value.trim() || '';
  const baslik = $('#spBaslik')?.value.trim() || '';
  const kampanyaFiyat = Number($('#spKampanyaFiyat')?.value);
  const eskiFiyatVal = $('#spEskiFiyat')?.value;
  const eskiFiyat = eskiFiyatVal ? Number(eskiFiyatVal) : null;
  const yonlendirmeUrl = $('#spYonlendirmeUrl')?.value.trim() || '';
  const gorselUrl = $('#spGorselUrl')?.value.trim() || null;
  const rozetMetni = $('#spRozetMetni')?.value.trim() || 'HAFTANIN SPONSORLU FIRSATI';
  const aciklama = $('#spAciklama')?.value.trim() || '';
  const gun = Math.max(1, parseInt($('#spBitisGun')?.value, 10) || 14);

  if (!marka || !baslik || !(kampanyaFiyat > 0) || !yonlendirmeUrl) {
    spMesaji('❌ Marka, başlık, kampanya fiyatı ve hedef URL zorunludur.', false);
    return;
  }
  const simdi = Date.now();
  const payload = {
    marka,
    baslik,
    aciklama,
    kampanyaFiyat,
    eskiFiyat,
    yonlendirmeUrl,
    gorselUrl,
    rozetMetni,
    baslangicTarihi: new Date(simdi - 60000).toISOString(),
    bitisTarihi: new Date(simdi + gun * 24 * 3600 * 1000).toISOString(),
    aktif: true,
  };
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/admin/sponsor-vitrin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Kaydedilemedi');
    for (const id of ['#spMarka', '#spBaslik', '#spKampanyaFiyat', '#spEskiFiyat', '#spYonlendirmeUrl', '#spGorselUrl', '#spAciklama']) {
      if ($(id)) $(id).value = '';
    }
    spMesaji('✅ Sponsor kampanya yayınlandı.');
    await Promise.all([sponsorYukle(), ozetYukle()]);
  } catch (err) {
    spMesaji('❌ ' + err.message, false);
  } finally {
    if (btn) btn.disabled = false;
  }
});

function dmMesaji(metin, ok = true) {
  const el = $('#dmMesaj');
  if (!el) return;
  el.className = 'durum-mesaji ' + (ok ? 'ok' : 'hata');
  el.textContent = metin;
}

async function dogrulanmisYukle() {
  const alan = $('#dogrulanmisListe');
  if (!alan) return;
  try {
    const res = await fetch('/api/dogrulanmis-magazalar', { cache: 'no-store' });
    const d = await res.json();
    const liste = d.magazalar || [];
    if (!liste.length) {
      alan.innerHTML = '<p class="alt-not" style="padding:12px">Henüz doğrulanmış mağaza yok.</p>';
      return;
    }
    alan.innerHTML = `<table class="admin-tablo">
      <thead><tr><th>Mağaza (Site ID)</th><th>Rozet Metni</th><th>İşlem</th></tr></thead>
      <tbody>
        ${liste.map(m => `<tr>
          <td><b>${esc(m.siteId)}</b></td>
          <td>☑️ ${esc(m.rozetMetni)}</td>
          <td><button type="button" class="admin-mini-btn tehlike" data-dm-sil="${esc(m.siteId)}">Kaldır</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) {
    alan.innerHTML = `<p class="alt-not" style="padding:12px">Yüklenemedi: ${esc(e.message)}</p>`;
  }
}

$('#dogrulanmisListe')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-dm-sil]');
  if (!btn) return;
  const siteId = btn.dataset.dmSil;
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/dogrulanmis-magaza/' + encodeURIComponent(siteId), { method: 'DELETE' });
    if (!res.ok) throw new Error('Kaldırılamadı');
    dmMesaji('✅ Rozet kaldırıldı.');
    await Promise.all([dogrulanmisYukle(), ozetYukle()]);
  } catch (err) {
    dmMesaji('❌ ' + err.message, false);
    btn.disabled = false;
  }
});

$('#dmEkleBtn')?.addEventListener('click', async () => {
  const siteId = ($('#dmSiteId')?.value || '').trim().toLowerCase();
  const rozetMetni = ($('#dmRozetMetni')?.value || '').trim() || 'Resmi Yetkili Satıcı';
  if (!siteId) return dmMesaji('❌ Site ID seçin veya yazın.', false);
  try {
    const res = await fetch('/api/admin/dogrulanmis-magaza', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, rozetMetni, aktif: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Kaydedilemedi');
    if ($('#dmSiteId')) $('#dmSiteId').value = '';
    dmMesaji('✅ Mavi tik kaydedildi.');
    await Promise.all([dogrulanmisYukle(), ozetYukle()]);
  } catch (err) {
    dmMesaji('❌ ' + err.message, false);
  }
});

/* ======================================================================
   🏥 Mağaza Adaptör Sağlığı
   ====================================================================== */

let saglikVeri = null;
let saglikSadeceHatali = false;

function saglikCiz() {
  const izgara = $('#saglikIzgara');
  const ozetEl = $('#saglikOzetSatiri');
  if (!izgara || !saglikVeri) return;
  const durumlar = saglikVeri.siteDurumlari || {};
  const liste = tumSiteler.length
    ? tumSiteler.map(s => ({ id: s.id, ad: s.ad, d: durumlar[s.id] || null }))
    : Object.entries(durumlar).map(([id, d]) => ({ id, ad: id, d }));
  const okSay = liste.filter(x => x.d?.status === 'ok').length;
  const hataSay = liste.filter(x => x.d?.status && x.d.status !== 'ok' && x.d.status !== 'empty').length;
  const bosSay = liste.filter(x => x.d?.status === 'empty').length;
  if (ozetEl) {
    ozetEl.innerHTML =
      `Toplam <b>${liste.length}</b> mağaza · ` +
      `<span style="color:#047857;font-weight:700">🟢 ${okSay} sağlıklı</span> · ` +
      `<span style="color:#be123c;font-weight:700">🔴 ${hataSay} hatalı</span> · ` +
      `⚪ ${bosSay} boş` +
      (saglikVeri.sonKontrol ? ` · Son kontrol: <b>${tarih(saglikVeri.sonKontrol)}</b>` : '');
  }
  const gosterilen = saglikSadeceHatali
    ? liste.filter(x => !x.d || x.d.status !== 'ok')
    : liste;
  if (!gosterilen.length) {
    izgara.innerHTML = '<p class="alt-not">Gösterilecek hatalı mağaza yok — tümü sağlıklı!</p>';
    return;
  }
  izgara.innerHTML = gosterilen.map(({ id, ad, d }) => {
    const st = d?.status || 'bilinmiyor';
    const sinif = st === 'ok' ? 'yesil' : (st === 'empty' || st === 'bilinmiyor' ? 'gri' : 'kirmizi');
    const ms = d?.durationMs != null ? `${d.durationMs} ms` : '—';
    return `<div class="admin-saglik-oge" title="${esc(d?.error || d?.reason || st)}">
      <span><b>${esc(ad)}</b><br><small>${esc(id)} · ${ms}</small></span>
      <span class="admin-durum-hap ${sinif}">${esc(st)}</span>
    </div>`;
  }).join('');
}

async function saglikYukle() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    saglikVeri = await res.json();
    saglikCiz();
  } catch { /* yoksay */ }
}

$('#saglikHataFiltreBtn')?.addEventListener('click', () => {
  saglikSadeceHatali = !saglikSadeceHatali;
  const btn = $('#saglikHataFiltreBtn');
  if (btn) btn.textContent = saglikSadeceHatali ? '📋 Tüm mağazaları göster' : '⚠️ Sadece hatalıları göster';
  saglikCiz();
});

$('#saglikKontrolBtn')?.addEventListener('click', async () => {
  const btn = $('#saglikKontrolBtn');
  const el = $('#saglikMesaj');
  if (btn) btn.disabled = true;
  if (el) { el.className = 'durum-mesaji'; el.textContent = 'Sağlık kontrolü çalışıyor (1-2 dk sürebilir)…'; }
  try {
    const res = await fetch('/api/health/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bildir: false }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Sağlık kontrolü başarısız');
    if (el) {
      el.className = 'durum-mesaji ok';
      el.textContent = `✅ Kontrol tamamlandı (${Math.round((d.sureMs || 0) / 1000)} sn).`;
    }
    await Promise.all([saglikYukle(), ozetYukle()]);
  } catch (err) {
    if (el) { el.className = 'durum-mesaji hata'; el.textContent = '❌ ' + err.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
});

/* ======================================================================
   📢 WhatsApp Fırsat Kanalı (2026-11-05)
   ====================================================================== */

function waKanalMetaGorunumu() {
  const saglayici = $('#waKanalProvider')?.value || 'webhook';
  const metaAlan = $('#waKanalMetaAlan');
  if (metaAlan) metaAlan.hidden = saglayici !== 'meta';
  const etiket = $('#waKanalApiUrlEtiket');
  if (etiket) {
    etiket.textContent = saglayici === 'meta'
      ? 'Phone Number ID (alternatif alan)'
      : 'API / Instance URL';
  }
}

let waKanalTimer = null;
let waKanalKaydediliyor = false;

function waKanalMesaji(metin, tur = '') {
  const el = $('#waKanalMesaj');
  if (!el) return;
  el.textContent = metin;
  el.className = 'durum-mesaji' + (tur ? ' ' + tur : '');
  if (tur === 'ok') setTimeout(() => { if (el.textContent === metin) el.textContent = ''; }, 3500);
}

function waKanalFormDegeri() {
  return {
    firsatKanalEnabled: $('#waKanalEnabled')?.checked === true,
    provider: $('#waKanalProvider')?.value || 'webhook',
    channelId: $('#waKanalChannelId')?.value.trim() || '',
    apiUrl: $('#waKanalApiUrl')?.value.trim() || '',
    phoneNumberId: $('#waKanalPhoneId')?.value.trim() || '',
    apiVersion: $('#waKanalApiVersion')?.value.trim() || 'v21.0',
    resimliGonder: $('#waKanalResimli')?.checked !== false,
    token: $('#waKanalToken')?.value.trim() || undefined,
  };
}

async function waKanalAyarlariniKaydet() {
  if (waKanalKaydediliyor) return;
  waKanalKaydediliyor = true;
  try {
    const govde = waKanalFormDegeri();
    if (!govde.token) delete govde.token;
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsapp: govde }),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(veri.hata || 'Kaydedilemedi');
    const w = veri.whatsapp || {};
    if ($('#waKanalEnabled')) $('#waKanalEnabled').checked = !!w.firsatKanalEnabled;
    if ($('#waKanalProvider') && w.provider) $('#waKanalProvider').value = w.provider;
    if ($('#waKanalToken')) $('#waKanalToken').value = '';
    waKanalMetaGorunumu();
    waKanalMesaji(w.firsatKanalEnabled ? '✅ Kaydedildi — WhatsApp kanalı AÇIK' : '✅ Kaydedildi — kapalı', 'ok');
  } catch (e) {
    waKanalMesaji('⚠️ ' + String(e.message || e).slice(0, 120), 'hata');
  } finally {
    waKanalKaydediliyor = false;
  }
}

function waKanalKaydetGecikmeli() {
  clearTimeout(waKanalTimer);
  waKanalTimer = setTimeout(waKanalAyarlariniKaydet, 500);
}

(function waKanalOlaylari() {
  const alanlar = ['#waKanalEnabled', '#waKanalProvider', '#waKanalChannelId',
    '#waKanalApiUrl', '#waKanalToken', '#waKanalPhoneId',
    '#waKanalApiVersion', '#waKanalResimli'];
  for (const sel of alanlar) {
    const el = $(sel);
    if (!el) continue;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') {
      el.addEventListener('change', () => {
        waKanalMetaGorunumu();
        waKanalAyarlariniKaydet();
      });
    } else {
      el.addEventListener('input', waKanalKaydetGecikmeli);
    }
  }

  $('#waKanalKaydetBtn')?.addEventListener('click', waKanalAyarlariniKaydet);

  $('#waKanalTestBtn')?.addEventListener('click', async () => {
    const btn = $('#waKanalTestBtn');
    if (btn) btn.disabled = true;
    waKanalMesaji('Kaydedilip test mesajı gönderiliyor…');
    try {
      await waKanalAyarlariniKaydet();
      const res = await fetch('/api/alarm/test-whatsapp-kanal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kuru: false }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.hata || 'Gönderilemedi');
      waKanalMesaji(`✅ Test gönderildi (${d.saglayici} · ${d.yontem})`, 'ok');
      const onizle = $('#waKanalOnizleme');
      if (onizle && d.kart?.metin) {
        onizle.textContent = d.kart.metin;
        onizle.hidden = false;
      }
    } catch (e) {
      waKanalMesaji('❌ ' + String(e.message || e).slice(0, 180), 'hata');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  $('#waKanalOnizleBtn')?.addEventListener('click', async () => {
    const onizle = $('#waKanalOnizleme');
    try {
      await waKanalAyarlariniKaydet();
      const res = await fetch('/api/alarm/test-whatsapp-kanal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kuru: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (onizle && d.kart?.metin) {
        onizle.textContent = d.kart.metin;
        onizle.hidden = false;
      }
      if (!res.ok) throw new Error(d.hata || 'Ayarları kontrol edin');
      waKanalMesaji('👁️ Mesaj önizlemesi hazır (gönderilmedi).', 'ok');
    } catch (e) {
      waKanalMesaji('⚠️ ' + String(e.message || e).slice(0, 160), 'hata');
    }
  });
})();

/* ======================================================================
   ⚙️ Genel Ayarlar (SMTP / Botlar / Fırsat / Radar)
   ====================================================================== */

async function ayarlariYukle() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Ayarlar okunamadı');
    const s = await res.json();
    if ($('#alarmEmail')) $('#alarmEmail').value = s.alarmEmail || '';
    if ($('#smtpHost')) $('#smtpHost').value = s.smtp?.host || '';
    if ($('#smtpPort')) $('#smtpPort').value = s.smtp?.port || 587;
    if ($('#smtpUser')) $('#smtpUser').value = s.smtp?.user || '';
    if ($('#smtpFrom')) $('#smtpFrom').value = s.smtp?.from || '';
    if ($('#smtpSecure')) $('#smtpSecure').checked = !!s.smtp?.secure;
    if ($('#telegramEnabled')) $('#telegramEnabled').checked = !!s.telegram?.enabled;
    if ($('#telegramBotToken')) $('#telegramBotToken').value = s.telegram?.botToken || '';
    if ($('#telegramChatId')) $('#telegramChatId').value = s.telegram?.chatId || '';
    if ($('#whatsappEnabled')) $('#whatsappEnabled').checked = !!s.whatsapp?.enabled;
    if ($('#whatsappWebhookUrl')) $('#whatsappWebhookUrl').value = s.whatsapp?.webhookUrl || '';
    if ($('#whatsappPhone')) $('#whatsappPhone').value = s.whatsapp?.phone || '';
    if ($('#waKanalEnabled')) $('#waKanalEnabled').checked = !!s.whatsapp?.firsatKanalEnabled;
    if ($('#waKanalProvider')) $('#waKanalProvider').value = s.whatsapp?.provider || 'webhook';
    if ($('#waKanalChannelId')) $('#waKanalChannelId').value = s.whatsapp?.channelId || '';
    if ($('#waKanalApiUrl')) $('#waKanalApiUrl').value = s.whatsapp?.apiUrl || '';
    if ($('#waKanalToken')) $('#waKanalToken').value = '';
    if ($('#waKanalPhoneId')) $('#waKanalPhoneId').value = s.whatsapp?.phoneNumberId || '';
    if ($('#waKanalApiVersion')) $('#waKanalApiVersion').value = s.whatsapp?.apiVersion || 'v21.0';
    if ($('#waKanalResimli')) $('#waKanalResimli').checked = s.whatsapp?.resimliGonder !== false;
    waKanalMetaGorunumu();
    if ($('#firsatEnabled')) $('#firsatEnabled').checked = !!s.firsat?.enabled;
    if ($('#firsatKanal')) $('#firsatKanal').value = s.firsat?.kanal || '';
    if ($('#firsatMinIndirim')) $('#firsatMinIndirim').value = s.firsat?.minIndirim ?? 15;
    if ($('#firsatGunlukMax')) $('#firsatGunlukMax').value = s.firsat?.gunlukMax ?? 12;
    if ($('#firsatSaatAraligi')) $('#firsatSaatAraligi').value = s.firsat?.saatAraligi ?? 2;
    if ($('#radarEnabled')) $('#radarEnabled').checked = !!s.radar?.enabled;
    if ($('#radarSaatAraligi')) $('#radarSaatAraligi').value = s.radar?.saatAraligi ?? 4;
    if ($('#radarChatId')) $('#radarChatId').value = s.radar?.chatId || '';
  } catch (e) {
    mesaj('Ayarlar yüklenemedi: ' + e.message, false);
  }
}

function mesaj(text, ok = true) {
  const el = $('#kaydetMesaj');
  if (!el) return;
  el.className = 'durum-mesaji ' + (ok ? 'ok' : 'hata');
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 6000);
}

$('#kaydetBtn')?.addEventListener('click', async () => {
  const body = {
    alarmEmail: $('#alarmEmail')?.value.trim() || '',
    smtp: {
      host: $('#smtpHost')?.value.trim() || '',
      port: parseInt($('#smtpPort')?.value, 10) || 587,
      user: $('#smtpUser')?.value.trim() || '',
      from: $('#smtpFrom')?.value.trim() || '',
      secure: $('#smtpSecure')?.checked || false,
      pass: $('#smtpPass')?.value || undefined,
    },
    telegram: {
      enabled: $('#telegramEnabled')?.checked || false,
      botToken: $('#telegramBotToken')?.value.trim() || '',
      chatId: $('#telegramChatId')?.value.trim() || '',
    },
    whatsapp: {
      enabled: $('#whatsappEnabled')?.checked || false,
      webhookUrl: $('#whatsappWebhookUrl')?.value.trim() || '',
      phone: $('#whatsappPhone')?.value.trim() || '',
      firsatKanalEnabled: $('#waKanalEnabled')?.checked || false,
      provider: $('#waKanalProvider')?.value || 'webhook',
      channelId: $('#waKanalChannelId')?.value.trim() || '',
      apiUrl: $('#waKanalApiUrl')?.value.trim() || '',
      phoneNumberId: $('#waKanalPhoneId')?.value.trim() || '',
      apiVersion: $('#waKanalApiVersion')?.value.trim() || 'v21.0',
      resimliGonder: $('#waKanalResimli')?.checked !== false,
      token: $('#waKanalToken')?.value.trim() || undefined,
    },
    firsat: {
      enabled: $('#firsatEnabled')?.checked || false,
      kanal: $('#firsatKanal')?.value.trim() || '',
      minIndirim: parseInt($('#firsatMinIndirim')?.value, 10) || 15,
      gunlukMax: parseInt($('#firsatGunlukMax')?.value, 10) || 12,
      saatAraligi: parseInt($('#firsatSaatAraligi')?.value, 10) || 2,
    },
    radar: {
      enabled: $('#radarEnabled')?.checked || false,
      saatAraligi: parseInt($('#radarSaatAraligi')?.value, 10) || 4,
      chatId: $('#radarChatId')?.value.trim() || '',
    },
  };
  if (!body.smtp.pass) delete body.smtp.pass;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
    if ($('#smtpPass')) $('#smtpPass').value = '';
    mesaj('Ayarlar kaydedildi.');
    firsatDurumuYukle();
    ozetYukle();
  } catch (e) {
    mesaj(e.message, false);
  }
});

/* ======================================================================
   🤖 İndirim Botu Görevi
   ====================================================================== */

async function gorevDurumuYukle() {
  const el = $('#gorevDurumu');
  if (!el) return;
  try {
    const res = await fetch('/api/gorev');
    const g = await res.json();
    const saatler = (g.saatler || ['09:00', '12:00', '15:00', '18:00', '21:00']).join(', ');
    el.innerHTML =
      `Kontrol saatleri (günde ${(g.saatler || []).length || 5} kez): <b>${esc(saatler)}</b> · ` +
      `Sonraki kontrol: <b>${g.sonrakiCalisma ? new Date(g.sonrakiCalisma).toLocaleString('tr-TR') : '—'}</b> · ` +
      `Son çalışma: <b>${g.sonCalisma ? new Date(g.sonCalisma).toLocaleString('tr-TR') : 'henüz yapılmadı'}</b>` +
      (g.calisiyor ? ' · <b>şu an çalışıyor…</b>' : '');
  } catch { /* sessizce geç */ }
}

$('#calistirBtn')?.addEventListener('click', async () => {
  const el = $('#calismaSonuc');
  const btn = $('#calistirBtn');
  if (!btn || !el) return;
  btn.disabled = true;
  btn.textContent = 'Kontroller çalışıyor…';
  el.className = 'durum-mesaji';
  el.textContent = 'Siteler kontrol ediliyor (aynı anda en fazla 3 istek)…';
  try {
    const res = await fetch('/api/alarm/calistir', { method: 'POST' });
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Kontrol başarısız');
    const satirlar = (r.sonuclar || []).map(s => {
      const kontroller = (s.kontroller || []).map(k =>
        `${esc(k.site)}: ${k.durum === 'ok' ? tl(k.fiyat) : 'kontrol edilemedi' + (k.fiyat != null ? ' (son bilinen: ' + tl(k.fiyat) + ')' : '')}`
      ).join(' · ');
      const bildirim = (s.bildirimler || []).length
        ? ' | ' + s.bildirimler.map(b => `${b.tur === 'hedef' ? 'hedef alarmı' : 'en ucuz değişti'} → ${b.gonderildi ? 'e-posta gönderildi' : 'gönderilemedi (' + esc(b.hata || '') + ')'}`).join(', ')
        : '';
      return `• ${esc(s.urun.slice(0, 70))} → ${kontroller}${bildirim}`;
    }).join('<br>');
    el.className = 'durum-mesaji ok';
    el.innerHTML = `Kontrol tamam (${((r.sureMs || 0) / 1000).toFixed(0)} sn, ${r.urunSayisi} ürün):<br>${satirlar}`;
    gorevDurumuYukle();
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kontrolleri şimdi çalıştır';
  }
});

$('#testEmailBtn')?.addEventListener('click', async () => {
  const el = $('#calismaSonuc');
  const btn = $('#testEmailBtn');
  if (!btn || !el) return;
  btn.disabled = true;
  try {
    const res = await fetch('/api/alarm/test-email', { method: 'POST' });
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Gönderilemedi');
    el.className = 'durum-mesaji ok';
    el.textContent = 'Test e-postası gönderildi: ' + r.konu;
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = 'Test e-postası gönderilemedi: ' + e.message;
  } finally {
    btn.disabled = false;
  }
});

/* ======================================================================
   💳 Kazıma Sağlayıcı Kredileri & 🎟️ Kupon Toplayıcı
   ====================================================================== */

const KREDI_DURUM_METNI = {
  hazir: ['Hazır', 'iyi'],
  tukendi: ['Kredi tükendi', 'kotu'],
  anahtar_yok: ['Anahtar yok', 'notr'],
  sorgulanamadi: ['Sorgulanamadı', 'notr'],
};

async function kredileriYukle(taze = false) {
  const alan = $('#krediPanosu');
  const btn = $('#krediYenileBtn');
  if (!alan) return;
  if (taze && btn) { btn.disabled = true; btn.textContent = 'Sorgulanıyor…'; }
  try {
    const res = await fetch('/api/kredi' + (taze ? '?taze=1' : ''));
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Sorgulanamadı');
    if ($('#krediSonGuncelleme')) $('#krediSonGuncelleme').textContent = 'Son güncelleme: ' + tarih(r.sonGuncelleme);
    alan.innerHTML = (r.saglayicilar || []).map(s => {
      const [durumMetni, durumSinif] = KREDI_DURUM_METNI[s.durum] || [s.durum, 'notr'];
      const rolSinif = s.yerel || s.rol === 'Birincil' ? 'iyi' : (s.rol === 'Pasif yedek' ? 'notr' : 'mavi');
      const bar = !s.yerel && s.yuzde != null
        ? `<div class="kredi-cubuk-dis" role="img" aria-label="kullanım %${s.yuzde}">
             <div class="kredi-cubuk ${s.yuzde >= 95 || s.durum === 'tukendi' ? 'kotu' : (s.yuzde >= 70 ? 'uyari' : '')}" style="width:${Math.max(s.yuzde, 2)}%"></div>
           </div>`
        : '';
      const kullanim = s.yerel
        ? 'Ücretsiz — kredi harcamaz'
        : s.limit != null
        ? `${sayi(s.kullanilan)} / ${sayi(s.limit)} kredi (${s.yuzde}%)`
        : `Bu ay ${sayi(s.kullanilan)} başarılı istek${s.limit == null && s.kalan == null ? ' (plan sınırı bildirilmiyor)' : ''}`;
      const kalanSatiri = !s.yerel && s.kalan != null ? `<b>${sayi(s.kalan)}</b> kredi kaldı` : '';
      const yenilenmeSatiri = !s.yerel && s.yenilenme
        ? `Yenilenme: <b>${tarih(s.yenilenme)}</b>` : '';
      const ayrinti = [kalanSatiri, yenilenmeSatiri].filter(Boolean).join(' · ') || '&nbsp;';
      return `<div class="kredi-ogesi">
        <div class="kredi-ust">
          <div class="kredi-baslik">
            <b>${esc(s.ad)}</b>
            <span class="rozet ${rolSinif}">${esc(s.rol)}</span>
            <span class="rozet ${durumSinif}">${esc(durumMetni)}</span>
          </div>
          <div class="kredi-metin">${kullanim}</div>
        </div>
        ${bar}
        <div class="kredi-alt">${ayrinti}</div>
        ${s.aciklama ? `<div class="kredi-not">${esc(s.aciklama)}</div>` : ''}
        ${s.not ? `<div class="kredi-not">${esc(s.not)}</div>` : ''}
        ${s.geciciNot ? `<div class="kredi-not">${esc(s.geciciNot)}</div>` : ''}
        ${s.hata ? `<div class="kredi-not kotu">${esc(s.hata)}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    alan.innerHTML = '<p class="alt-not">Kredi bilgisi alınamadı: ' + esc(e.message) + '</p>';
  } finally {
    if (taze && btn) { btn.disabled = false; btn.textContent = 'Kredileri yenile'; }
  }
}

$('#krediYenileBtn')?.addEventListener('click', () => kredileriYukle(true));

const KAPSAM_ADI = {
  site: 'site geneli', kategori: 'kategori', uyelik: 'üyelere özel',
  uygulama: 'uygulamaya özel', kart: 'karta özel', belirsiz: 'kapsam belirsiz',
};

async function kuponlariYukle() {
  const alan = $('#kuponPanosu');
  if (!alan) return;
  try {
    const res = await fetch('/api/kuponlar');
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Alınamadı');
    const toplam = (r.siteler || []).reduce((s, x) => s + x.kampanyalar.length, 0);
    if ($('#kuponSonGuncelleme')) {
      $('#kuponSonGuncelleme').textContent = r.sonGuncelleme
        ? 'Son toplama: ' + tarih(r.sonGuncelleme) + ' · ' + toplam + ' kampanya'
        : 'Henüz toplanmadı';
    }
    if (!toplam) {
      alan.innerHTML = '<p class="alt-not">Henüz kampanya toplanmadı. "Kuponları şimdi topla" ile başlatabilirsin.</p>';
      return;
    }
    alan.innerHTML = (r.siteler || []).filter(s => s.kampanyalar.length).map(s => {
      const satirlar = s.kampanyalar.map(k => {
        const ind = k.indirim.tip === 'yuzde' ? '%' + k.indirim.deger : sayi(k.indirim.deger) + ' TL';
        const etiketler = [KAPSAM_ADI[k.kapsam] || k.kapsam];
        if (k.kategori) etiketler.push(k.kategori);
        if (k.minSepet) etiketler.push(sayi(k.minSepet) + ' TL üzeri');
        if (k.kodu) etiketler.push('kod: ' + k.kodu);
        const uygulanir = k.kapsam === 'site' && !k.kodu;
        return `<li class="${uygulanir ? 'iyi' : ''}"><b>${esc(ind)}</b> — ${esc(k.metin)}
          <span class="kupon-etiket">${esc(etiketler.join(' · '))}</span></li>`;
      }).join('');
      return `<div class="kredi-ogesi">
        <div class="kredi-ust"><div class="kredi-baslik"><b>${esc(s.ad)}</b>
          <span class="rozet mavi">${s.kampanyalar.length} kampanya</span></div>
          <div class="kredi-metin">${s.sonGuncelleme ? tarih(s.sonGuncelleme) : '—'}</div></div>
        <ul class="kupon-liste">${satirlar}</ul>
        ${s.hata ? `<div class="kredi-not">${esc(s.hata)}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    alan.innerHTML = '<p class="alt-not">Kuponlar alınamadı: ' + esc(e.message) + '</p>';
  }
}

$('#kuponToplaBtn')?.addEventListener('click', async () => {
  const btn = $('#kuponToplaBtn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Toplanıyor… (1-2 dakika)';
  try {
    const res = await fetch('/api/kuponlar/topla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const r = await res.json();
    if (!res.ok || r.ok === false) throw new Error(r.hata || 'Toplama başarısız');
    await kuponlariYukle();
  } catch (e) {
    if ($('#kuponSonGuncelleme')) $('#kuponSonGuncelleme').textContent = 'Toplama hatası: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kuponları şimdi topla';
  }
});

/* ======================================================================
   📢 Otonom Fırsat Kanalı & Telegram/WhatsApp Testleri
   ====================================================================== */

async function firsatDurumuYukle() {
  const el = $('#firsatDurum');
  if (!el) return;
  try {
    const res = await fetch('/api/firsat/durum');
    const d = await res.json();
    const a = d.ayar || {};
    const son = (d.son || []).find(x => x.durum === 'gonderildi');
    el.innerHTML =
      `Bugün paylaşılan: <b>${d.bugun ?? 0}</b> / ${a.gunlukMax ?? 12} · ` +
      `Toplam: <b>${d.toplam ?? 0}</b> · ` +
      `Durum: ${a.enabled ? '<span style="color:#10b981;font-weight:700">🟢 Açık (Aktif)</span>' : '<span style="color:#64748b;font-weight:700">⚪ Kapalı</span>'}` +
      (d.sonCalisma ? ` · Son çalışma: ${new Date(d.sonCalisma).toLocaleString('tr-TR')}` : '') +
      (son ? `<br>Son paylaşım: ${esc(son.urun || '')} — %${esc(String(son.indirim ?? ''))} (${esc(son.site || '')})` : '');
  } catch (e) {
    el.textContent = 'Fırsat durumu okunamadı: ' + e.message;
  }
}

let firsatKaydetTimer = null;
let firsatKaydediliyor = false;

function firsatKaydetMesaji(metin, tur = '') {
  const el = $('#firsatKaydetMesaj');
  if (!el) return;
  el.textContent = metin;
  el.className = 'durum-mesaji' + (tur ? ' ' + tur : '');
  if (tur === 'ok') setTimeout(() => { if (el.textContent === metin) el.textContent = ''; }, 3500);
}

function firsatFormDegeri() {
  const sinirla = (sel, varsayilan, min, max) => {
    const n = parseInt($(sel)?.value, 10);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: $('#firsatEnabled')?.checked === true,
    kanal: $('#firsatKanal')?.value.trim() || '',
    minIndirim: sinirla('#firsatMinIndirim', 15, 1, 95),
    gunlukMax: sinirla('#firsatGunlukMax', 12, 1, 100),
    saatAraligi: sinirla('#firsatSaatAraligi', 2, 1, 24),
  };
}

async function firsatAyarlariniKaydet() {
  if (firsatKaydediliyor) return;
  firsatKaydediliyor = true;
  firsatKaydetMesaji('Kaydediliyor…');
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firsat: firsatFormDegeri() }),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(veri.hata || 'Kaydedilemedi');
    const f = veri.firsat || {};
    if ($('#firsatEnabled')) $('#firsatEnabled').checked = !!f.enabled;
    if ($('#firsatMinIndirim') && f.minIndirim != null) $('#firsatMinIndirim').value = f.minIndirim;
    if ($('#firsatGunlukMax') && f.gunlukMax != null) $('#firsatGunlukMax').value = f.gunlukMax;
    if ($('#firsatSaatAraligi') && f.saatAraligi != null) $('#firsatSaatAraligi').value = f.saatAraligi;
    firsatKaydetMesaji(f.enabled ? '✅ Kaydedildi — kanal paylaşımı AÇIK' : '✅ Kaydedildi — kanal paylaşımı kapalı', 'ok');
    firsatDurumuYukle();
    ozetYukle();
  } catch (e) {
    firsatKaydetMesaji('❌ ' + e.message, 'hata');
  } finally {
    firsatKaydediliyor = false;
  }
}

function firsatKaydetGecikmeli() {
  clearTimeout(firsatKaydetTimer);
  firsatKaydetMesaji('Kaydediliyor…');
  firsatKaydetTimer = setTimeout(firsatAyarlariniKaydet, 500);
}

$('#firsatEnabled')?.addEventListener('change', () => {
  clearTimeout(firsatKaydetTimer);
  firsatAyarlariniKaydet();
});
for (const sel of ['#firsatKanal', '#firsatMinIndirim', '#firsatGunlukMax', '#firsatSaatAraligi']) {
  $(sel)?.addEventListener('input', firsatKaydetGecikmeli);
  $(sel)?.addEventListener('change', firsatKaydetGecikmeli);
}
window.addEventListener('pagehide', () => {
  if (!firsatKaydetTimer) return;
  clearTimeout(firsatKaydetTimer);
  firsatKaydetTimer = null;
  try {
    const veri = JSON.stringify({ firsat: firsatFormDegeri() });
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: veri,
      keepalive: true,
    });
  } catch { /* yoksay */ }
});

$('#firsatKaydetBtn')?.addEventListener('click', firsatAyarlariniKaydet);

$('#firsatTestBtn')?.addEventListener('click', async () => {
  const el = $('#firsatTestMesaj');
  if (!el) return;
  el.className = 'durum-mesaji';
  el.textContent = 'Önce ayarlar kaydediliyor…';
  const btn = $('#firsatTestBtn');
  if (btn) btn.disabled = true;
  try {
    await firsatAyarlariniKaydet();
    el.textContent = 'Test paylaşımı Telegram kanalına iletiliyor…';
    const res = await fetch('/api/firsat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kanal: $('#firsatKanal')?.value.trim() || '',
        botToken: $('#telegramBotToken')?.value.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.hata || 'Test paylaşımı gönderilemedi');
    el.className = 'durum-mesaji ok';
    el.textContent = `✅ Test paylaşımı iletildi (${data.yontem}${data.gercekFirsat ? ', gerçek fırsat' : ', bağlantı testi'}).`;
    firsatDurumuYukle();
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#firsatCalistirBtn')?.addEventListener('click', async () => {
  const el = $('#firsatTestMesaj');
  const btn = $('#firsatCalistirBtn');
  if (btn) btn.disabled = true;
  if (el) { el.className = 'durum-mesaji'; el.textContent = 'Fırsatlar taranıyor…'; }
  try {
    await firsatAyarlariniKaydet();
    const res = await fetch('/api/firsat/calistir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gonder: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Tarama hatası');
    if (el) {
      el.className = 'durum-mesaji ok';
      el.textContent = `✅ Fırsat taraması tamam: ${d.gonderilen ?? 0} paylaşım gönderildi.`;
    }
    firsatDurumuYukle();
    ozetYukle();
  } catch (e) {
    if (el) { el.className = 'durum-mesaji hata'; el.textContent = '❌ ' + e.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#telegramTestBtn')?.addEventListener('click', async () => {
  const btn = $('#telegramTestBtn');
  const el = $('#telegramTestMesaj');
  const eskiMetin = btn ? btn.textContent : '';
  const eskiSinif = btn ? btn.className : '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Gönderiliyor...';
  }
  el.className = 'durum-mesaji';
  el.textContent = '';

  const botToken = $('#telegramBotToken')?.value.trim();
  const chatId = $('#telegramChatId')?.value.trim();

  try {
    const res = await fetch('/api/alarm/test-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error('Sunucu yanıtı: ' + text.slice(0, 120));
    }
    if (!res.ok) throw new Error(data.hata || 'Telegram hatası');

    if (btn) {
      btn.textContent = '✓ Test İletildi!';
      btn.classList.add('btn-kopyalandi');
    }
    const botEki = data?.bot?.username ? ` · 🤖 @${data.bot.username}` : '';
    el.className = 'durum-mesaji';
    el.innerHTML = `<span class="telegram-test-basarili">`
      + `✅ <b>Telegram botunuz başarıyla doğrulandı!</b><br>`
      + `Test mesajı uygulamanıza iletildi${esc(botEki)}.`
      + (data?.tarih ? `<br><span class="ipucu">🕒 ${esc(data.tarih)}</span>` : '')
      + '</span>';
  } catch (e) {
    el.className = 'durum-mesaji';
    el.innerHTML = `<span class="telegram-test-hata">`
      + `❌ <b>Telegram Hatası:</b> ${esc(String(e.message || e).slice(0, 220))}`
      + '</span>';
  } finally {
    if (btn) {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = eskiMetin;
        btn.className = eskiSinif;
      }, 3000);
    }
  }
});

$('#whatsappTestBtn')?.addEventListener('click', async () => {
  const el = $('#whatsappTestMesaj');
  el.className = 'durum-mesaji';
  el.textContent = 'Gönderiliyor...';

  const webhookUrl = $('#whatsappWebhookUrl')?.value.trim();
  const phone = $('#whatsappPhone')?.value.trim();

  try {
    const res = await fetch('/api/alarm/test-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, phone }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error('Sunucu yanıtı: ' + text.slice(0, 120));
    }
    if (!res.ok) throw new Error(data.hata || 'WhatsApp hatası');
    el.className = 'durum-mesaji ok';
    el.textContent = '✅ WhatsApp test mesajı başarıyla iletildi!';
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  }
});

/* ======================================================================
   🧹 Veritabanı / Önbellek / Log Bakımı (2026-11-01)
   ====================================================================== */

function bakimTarih(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('tr-TR'); } catch { return '—'; }
}

async function dbBakimDurumYukle() {
  const el = $('#dbBakimDurum');
  if (!el) return;
  try {
    const res = await fetch('/api/db/bakim');
    const d = await res.json();
    if (!res.ok) throw new Error(d.hata || 'Okunamadı');
    const b = d.boyutlar || {};
    el.innerHTML =
      `Veritabanı: <b>${b.dbMb ?? '—'} MB</b> · WAL: <b>${b.walMb ?? '—'} MB</b>`
      + ` · Önbellek: <b>${Number(d.saklama?.onbellekGun ?? 30)} gün</b> saklanır<br>`
      + `Son bakım: <b>${bakimTarih(d.sonCalisma)}</b>`
      + (d.sureMs ? ` · ${d.sureMs} ms` : '')
      + (d.temizlenenDosya ? ` · ${d.temizlenenDosya} dosya / ${d.kazanilanMb} MB` : '')
      + (d.calisiyor ? ' · <i>şu anda çalışıyor…</i>' : '');
  } catch (e) {
    el.textContent = 'Bakım durumu okunamadı: ' + e.message;
  }
}

async function dbBakimCalistirVeGoster(kuru) {
  const el = $('#dbBakimSonuc');
  const btn = kuru ? $('#dbBakimKuruBtn') : $('#dbBakimBtn');
  if (!el || !btn) return;
  el.className = 'durum-mesaji';
  el.textContent = kuru ? 'Taranıyor (silme yapılmaz)…' : 'Bakım çalışıyor… (büyük önbellekte birkaç saniye)';
  btn.disabled = true;
  try {
    const res = await fetch('/api/db/bakim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuru: !!kuru }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Bakım başarısız');
    const cp = d.walCheckpoint || {};
    el.className = 'durum-mesaji ' + (d.hatalar?.length ? 'hata' : 'ok');
    el.innerHTML =
      `${d.ok ? '✅' : '⚠️'} <b>${d.kuru ? 'Tarama' : 'Bakım'} tamamlandı</b> (${d.sureMs} ms)<br>`
      + `WAL: ${d.db?.once?.walMb ?? '—'} → <b>${d.db?.sonra?.walMb ?? '—'} MB</b>`
      + ` (busy=${cp.busy ?? 0}, checkpointed=${cp.checkpointed ?? 0})<br>`
      + `Önbellek: <b>${d.temizlenenOnbellekDosyaSayisi}</b> dosya silindi, `
      + `<b>${d.kazanilanDiskMb} MB</b> kazanıldı`
      + (d.onbellek ? ` · ${d.onbellek.tarandi} tarandı, ${d.onbellek.atlanan} korundu` : '') + '<br>'
      + `Snapshot: ${d.silinenSnapshotSayisi} · Fırsat: ${d.silinenFirsatSayisi} · `
      + `İş: ${d.silinenJobSayisi} · Sağlık: ${d.silinenSaglikSayisi} kayıt silindi`
      + (d.log?.rotasyon?.dondu ? `<br>Log rotasyonu: ${d.log.rotasyon.dosya}` : '')
      + (d.hatalar?.length ? `<br>⚠️ ${d.hatalar.map(esc).join(' · ')}` : '');
    dbBakimDurumYukle();
    ozetYukle();
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

$('#dbBakimBtn')?.addEventListener('click', () => dbBakimCalistirVeGoster(false));
$('#dbBakimKuruBtn')?.addEventListener('click', () => dbBakimCalistirVeGoster(true));

$('#logRotateBtn')?.addEventListener('click', async () => {
  const el = $('#dbBakimSonuc');
  try {
    const res = await fetch('/api/log/rotate', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Log döndürülemedi');
    if (el) { el.className = 'durum-mesaji ok'; el.textContent = d.dondu ? `✅ Log döndürüldü: ${d.dosya}` : 'ℹ️ Log boyutu henüz eşik altında.'; }
  } catch (e) {
    if (el) { el.className = 'durum-mesaji hata'; el.textContent = '❌ ' + e.message; }
  }
});

$('#logCleanupBtn')?.addEventListener('click', async () => {
  const el = $('#dbBakimSonuc');
  try {
    const res = await fetch('/api/log/cleanup', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Log temizlenemedi');
    if (el) { el.className = 'durum-mesaji ok'; el.textContent = `✅ Eski log arşivleri temizlendi (${d.silinen ?? 0} dosya).`; }
  } catch (e) {
    if (el) { el.className = 'durum-mesaji hata'; el.textContent = '❌ ' + e.message; }
  }
});

/* ======================================================================
   🎯 Otonom Fiyat Radarı (2026-11-02)
   ====================================================================== */

let radarKaydetTimer = null;
let radarKaydediliyor = false;
let radarPollTimer = null;
let radarKatalog = [];

function radarMesaj(secici, metin, tur = '') {
  const el = $(secici);
  if (!el) return;
  el.textContent = metin;
  el.className = 'durum-mesaji' + (tur ? ' ' + tur : '');
}

function radarFormDegeri() {
  const n = parseInt($('#radarSaatAraligi')?.value, 10);
  let chat = $('#radarChatId')?.value.trim() || '';
  if (chat && !/^[-0-9]/.test(chat) && !chat.startsWith('@')) {
    chat = '@' + chat;
  }
  return {
    enabled: $('#radarEnabled')?.checked === true,
    saatAraligi: Number.isFinite(n) ? Math.min(24, Math.max(1, n)) : 4,
    chatId: chat,
  };
}

async function radarAyarlariniKaydet() {
  if (radarKaydediliyor) return;
  radarKaydediliyor = true;
  radarMesaj('#radarKaydetMesaj', 'Kaydediliyor…');
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radar: radarFormDegeri() }),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(veri.hata || 'Kaydedilemedi');
    const r = veri.radar || {};
    if ($('#radarEnabled')) $('#radarEnabled').checked = !!r.enabled;
    if ($('#radarSaatAraligi') && r.saatAraligi != null) $('#radarSaatAraligi').value = r.saatAraligi;
    if ($('#radarChatId') && typeof r.chatId === 'string') $('#radarChatId').value = r.chatId;
    radarMesaj('#radarKaydetMesaj',
      r.enabled ? '✅ Kaydedildi — otonom radar AÇIK' : '✅ Kaydedildi — radar kapalı', 'ok');
    setTimeout(() => {
      const el = $('#radarKaydetMesaj');
      if (el && el.textContent.startsWith('✅')) el.textContent = '';
    }, 3500);
    radarDurumuYukle();
    ozetYukle();
  } catch (e) {
    radarMesaj('#radarKaydetMesaj', '❌ ' + e.message, 'hata');
  } finally {
    radarKaydediliyor = false;
  }
}

function radarKaydetGecikmeli() {
  clearTimeout(radarKaydetTimer);
  radarMesaj('#radarKaydetMesaj', 'Kaydediliyor…');
  radarKaydetTimer = setTimeout(radarAyarlariniKaydet, 500);
}

$('#radarKaydetBtn')?.addEventListener('click', radarAyarlariniKaydet);
$('#radarEnabled')?.addEventListener('change', () => {
  clearTimeout(radarKaydetTimer);
  radarAyarlariniKaydet();
});
for (const sel of ['#radarSaatAraligi', '#radarChatId']) {
  $(sel)?.addEventListener('input', radarKaydetGecikmeli);
  $(sel)?.addEventListener('change', radarKaydetGecikmeli);
}
window.addEventListener('pagehide', () => {
  if (!radarKaydetTimer) return;
  clearTimeout(radarKaydetTimer);
  radarKaydetTimer = null;
  try {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radar: radarFormDegeri() }),
      keepalive: true,
    });
  } catch { /* yoksay */ }
});

function radarKategoriEtiket(k) {
  if (k === 'filament') return '🧵 Filament';
  if (k === 'yazici') return '🖨️ Yazıcı';
  return '📦 Diğer';
}

function radarKatalogCiz() {
  const liste = $('#radarKatalogListe');
  const sayiEl = $('#radarKatalogSayisi');
  if (!liste) return;
  if (sayiEl) sayiEl.textContent = `(${radarKatalog.length} ürün)`;
  if (!radarKatalog.length) {
    liste.innerHTML = '<li><span class="radar-urun-sorgu">Katalog boş — aşağıdan ürün ekleyin.</span></li>';
    return;
  }
  liste.innerHTML = radarKatalog.map(k => `
    <li>
      <span>
        <span class="radar-urun-ad">${esc(k.ad)}</span>
        <span class="radar-kategori-rozet">${radarKategoriEtiket(k.kategori)}</span>
        ${k.sorgu && k.sorgu !== k.ad ? `<span class="radar-urun-sorgu">Arama: ${esc(k.sorgu)}</span>` : ''}
        ${k.url ? `<span class="radar-urun-sorgu">Sabit link: ${esc(k.url)}</span>` : ''}
      </span>
      <button type="button" data-radar-sil="${Number(k.id)}" aria-label="${esc(k.ad)} ürününü katalogdan çıkar">Çıkar</button>
    </li>
  `).join('');
}

$('#radarKatalogListe')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-radar-sil]');
  if (!btn) return;
  const id = Number(btn.dataset.radarSil);
  if (!Number.isFinite(id)) return;
  btn.disabled = true;
  try {
    const res = await fetch('/api/radar/katalog/' + id, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Silinemedi');
    radarMesaj('#radarKatalogMesaj', '✅ Ürün katalogdan çıkarıldı.', 'ok');
    radarDurumuYukle();
    ozetYukle();
  } catch (err) {
    radarMesaj('#radarKatalogMesaj', '❌ ' + err.message, 'hata');
    btn.disabled = false;
  }
});

$('#radarEkleBtn')?.addEventListener('click', async () => {
  const ad = $('#radarYeniAd')?.value.trim() || '';
  const sorgu = $('#radarYeniSorgu')?.value.trim() || '';
  const kategori = $('#radarYeniKategori')?.value || 'genel';
  const url = String($('#radarYeniUrl')?.value || '').trim();
  if (ad.length < 2) {
    radarMesaj('#radarKatalogMesaj', '❌ Ürün adı en az 2 karakter olmalı.', 'hata');
    return;
  }
  const btn = $('#radarEkleBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/radar/katalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, sorgu: sorgu || ad, kategori, url: url || null }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Eklenemedi');
    if ($('#radarYeniAd')) $('#radarYeniAd').value = '';
    if ($('#radarYeniSorgu')) $('#radarYeniSorgu').value = '';
    if ($('#radarYeniUrl')) $('#radarYeniUrl').value = '';
    if ($('#radarYeniKategori')) $('#radarYeniKategori').value = 'filament';
    if (d.aktif === false) {
      radarMesaj('#radarKatalogMesaj',
        `⚠️ "${d.ad}" pasif eklendi — kanonik URL girilmedi. Ürün taranmaz, borsada görünmez.`, 'hata');
    } else {
      radarMesaj('#radarKatalogMesaj', `✅ "${d.ad}" kataloğa eklendi.`, 'ok');
    }
    radarDurumuYukle();
    ozetYukle();
  } catch (err) {
    radarMesaj('#radarKatalogMesaj', '❌ ' + err.message, 'hata');
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#radarSifirlaBtn')?.addEventListener('click', async () => {
  if (!confirm('Katalog varsayılan ürünlere dönecek. Eklediğiniz ürünler ve kayıtlı radar durumları silinir. Devam?')) return;
  const btn = $('#radarSifirlaBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/radar/katalog/sifirla', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Sıfırlanamadı');
    radarMesaj('#radarKatalogMesaj', '✅ Varsayılan katalog yüklendi.', 'ok');
    radarDurumuYukle();
    ozetYukle();
  } catch (err) {
    radarMesaj('#radarKatalogMesaj', '❌ ' + err.message, 'hata');
  } finally {
    if (btn) btn.disabled = false;
  }
});

function radarDurumCiz(d) {
  const el = $('#radarDurum');
  if (!el) return;
  const ayar = d.ayar || {};
  const rapor = d.sonRapor || {};
  const durumlar = Array.isArray(d.durumlar) ? d.durumlar.filter(x => x.stokta).slice(0, 3) : [];
  el.innerHTML =
    `${ayar.enabled
      ? '<span style="color:#10b981;font-weight:700">🟢 Açık (otomatik tarama aktif)</span>'
      : '<span style="color:#64748b;font-weight:700">⚪ Kapalı (yalnızca elle çalışır)</span>'}`
    + ` · Her <b>${ayar.saatAraligi ?? 4} saatte</b> bir tarama`
    + (d.sonCalisma ? ` · Son tur: <b>${new Date(d.sonCalisma).toLocaleString('tr-TR')}</b>` : ' · Henüz tur çalışmadı')
    + (rapor.taranan != null
      ? `<br>Son tur: ${rapor.taranan} ürün tarandı, ${rapor.stoktaBulunan ?? 0} stokta, ${rapor.gonderilen ?? 0} bildirim`
        + (rapor.hataSayisi ? ` · ⚠️ ${rapor.hataSayisi} hata` : '')
        + (rapor.sureMs ? ` · ${Math.round(rapor.sureMs / 1000)} sn` : '')
      : '')
    + (durumlar.length
      ? '<br>Stoktaki en ucuz: ' + durumlar.map(x =>
        `${esc(x.ad)} → <b>${tl(x.fiyat)}</b> (${esc(x.site || '—')})`).join(' · ')
      : '');
}

async function radarDurumuYukle() {
  try {
    const res = await fetch('/api/radar/durum');
    const d = await res.json();
    radarKatalog = Array.isArray(d.katalog) ? d.katalog : [];
    radarKatalogCiz();
    radarDurumCiz(d);
    seoTerfiAdaylariYukle();
    return d;
  } catch (e) {
    const el = $('#radarDurum');
    if (el) el.textContent = 'Radar durumu okunamadı: ' + e.message;
    return null;
  }
}

/* ======================================================================
   🗂️ Mağaza katalog indeksi (2026-11-17)
   ====================================================================== */

let katalogPollTimer = null;

function katalogDurumCiz(d) {
  if (!d) return;
  const db = d.db || {};
  if ($('#katalogToplam')) $('#katalogToplam').textContent = sayi(db.toplam || 0);
  if ($('#katalogFiyatli')) $('#katalogFiyatli').textContent = sayi(db.fiyatli || 0);
  if ($('#katalogStokta')) $('#katalogStokta').textContent = sayi(db.stokta || 0);
  if ($('#katalogHedef')) $('#katalogHedef').textContent = sayi(d.hedefSayisi || 0);
  if ($('#katalogSonBitis')) {
    $('#katalogSonBitis').textContent = d.sonBitis ? tarih(new Date(d.sonBitis).toISOString()) : '—';
  }

  const durumEl = $('#katalogSyncDurum');
  if (durumEl) {
    if (d.calisiyor) {
      durumEl.textContent = '⏳ Senkron sürüyor… (başlangıç: '
        + (d.sonBaslangic ? tarih(new Date(d.sonBaslangic).toISOString()) : '—') + ')';
    } else if (d.sonRapor) {
      const r = d.sonRapor;
      durumEl.textContent = `Son tur: ${sayi(r.toplamYazilan)} ürün yazıldı · `
        + `${sayi(r.toplamCekilen)} kayıt çekildi · `
        + `${(r.hatalar || []).length} hata · ${Math.round((d.sonSureMs || 0) / 1000)} sn`
        + (d.hata ? ` — ${d.hata}` : '');
    } else {
      durumEl.textContent = d.hata ? ('⚠️ ' + d.hata) : 'Henüz senkron çalışmadı.';
    }
  }

  const listeEl = $('#katalogSiteListe');
  if (listeEl) {
    const siteler = Array.isArray(db.siteler) ? db.siteler : [];
    listeEl.innerHTML = siteler.length
      ? siteler.map(s => `<li class="radar-katalog-oge">
          <span class="radar-katalog-ad">${esc(s.siteId)}</span>
          <span class="alt-not">${sayi(s.adet)} ürün · ${sayi(s.fiyatli)} fiyatlı
            ${s.enSonTs ? '· ' + tarih(new Date(s.enSonTs).toISOString()) : ''}</span>
        </li>`).join('')
      : '<li class="alt-not">İndekste henüz ürün yok.</li>';
  }

  const btn = $('#katalogSyncBtn');
  if (btn) {
    btn.disabled = !!d.calisiyor;
    btn.textContent = d.calisiyor ? '⏳ Senkron sürüyor…' : '🔄 Şimdi Senkronize Et';
  }
}

async function katalogSyncYukle() {
  try {
    const res = await fetch('/api/admin/katalog-sync', { cache: 'no-store' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.hata || `Sunucu hatası (${res.status})`);
    katalogDurumCiz(d);
    // Çalışıyorsa bitene kadar izle.
    if (d.calisiyor) katalogPollBaslat();
    return d;
  } catch (e) {
    const el = $('#katalogSyncDurum');
    if (el) el.textContent = 'Katalog durumu okunamadı: ' + e.message;
    return null;
  }
}

function katalogPollDurdur() {
  if (katalogPollTimer) clearInterval(katalogPollTimer);
  katalogPollTimer = null;
}

function katalogPollBaslat() {
  katalogPollDurdur();
  katalogPollTimer = setInterval(async () => {
    let d = null;
    try {
      const res = await fetch('/api/admin/katalog-sync', { cache: 'no-store' });
      d = await res.json();
    } catch { return; }
    katalogDurumCiz(d);
    if (!d || !d.calisiyor) {
      katalogPollDurdur();
      const mesaj = $('#katalogSyncMesaj');
      if (mesaj && d?.sonRapor) {
        mesaj.className = 'durum-mesaji ok';
        mesaj.textContent = `✅ Bitti — ${sayi(d.sonRapor.toplamYazilan)} ürün indekslendi.`;
        setTimeout(() => { mesaj.textContent = ''; }, 6000);
      }
    }
  }, 2500);
}

document.addEventListener('admin:yetkili', () => {
  const btn = $('#katalogSyncBtn');
  if (btn && !btn.dataset.bagli) {
    btn.dataset.bagli = '1';
    btn.addEventListener('click', async () => {
      const mesaj = $('#katalogSyncMesaj');
      btn.disabled = true;
      btn.textContent = '⏳ Başlatılıyor…';
      try {
        const res = await fetch('/api/admin/katalog-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.hata || `Sunucu hatası (${res.status})`);
        if (mesaj) {
          mesaj.className = 'durum-mesaji';
          mesaj.textContent = d.zatenCalisiyor
            ? '⏳ Zaten bir senkron çalışıyor.'
            : `⏳ Senkron başlatıldı (${sayi(d.hedefSayisi)} hedef).`;
        }
        katalogPollBaslat();
      } catch (e) {
        if (mesaj) { mesaj.className = 'durum-mesaji hata'; mesaj.textContent = 'Başlatılamadı: ' + e.message; }
        btn.disabled = false;
        btn.textContent = '🔄 Şimdi Senkronize Et';
      }
    });
  }

  const araBtn = $('#katalogAramaBtn');
  if (araBtn && !araBtn.dataset.bagli) {
    araBtn.dataset.bagli = '1';
    araBtn.addEventListener('click', async () => {
      const q = String($('#katalogAramaQ')?.value || '').trim();
      const sonucEl = $('#katalogAramaSonuc');
      if (!q) { if (sonucEl) sonucEl.textContent = 'Bir kelime yazın.'; return; }
      const ttl = Number($('#katalogAramaTtl')?.value);
      if (sonucEl) sonucEl.textContent = 'Aranıyor…';
      try {
        const url = '/api/admin/katalog-ara?q=' + encodeURIComponent(q)
          + (Number.isFinite(ttl) ? '&ttlDk=' + ttl : '');
        const res = await fetch(url, { cache: 'no-store' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.hata || `Sunucu hatası (${res.status})`);
        if (!d.adet) { if (sonucEl) sonucEl.textContent = 'Eşleşme yok.'; return; }
        if (sonucEl) {
          sonucEl.innerHTML = `<b>${d.adet}</b> sonuç: ` + d.sonuclar.slice(0, 5).map(s =>
            `${esc(s.siteId)} — ${esc(String(s.baslik).slice(0, 40))} (${s.fiyat != null ? tl(s.fiyat) : 'fiyat yok'})`
          ).join(' · ');
        }
      } catch (e) {
        if (sonucEl) sonucEl.textContent = 'Arama başarısız: ' + e.message;
      }
    });
  }
});

function radarPollDurdur() {
  if (radarPollTimer) clearInterval(radarPollTimer);
  radarPollTimer = null;
}

function radarPollBaslat() {
  radarPollDurdur();
  const el = $('#radarCalistirMesaj');
  const btn = $('#radarCalistirBtn');
  let bitenTur = 0;
  radarPollTimer = setInterval(async () => {
    let d = null;
    try {
      const res = await fetch('/api/radar/durum');
      d = await res.json();
    } catch { return; }

    radarKatalog = Array.isArray(d.katalog) ? d.katalog : radarKatalog;
    radarKatalogCiz();
    radarDurumCiz(d);

    const il = d.ilerleme || {};
    if (il.calisiyor) {
      const oran = il.toplam ? Math.round((il.tamamlanan / il.toplam) * 100) : 0;
      if (el) {
        el.className = 'durum-mesaji';
        el.innerHTML = `⏳ Taranıyor: <b>${il.tamamlanan}/${il.toplam}</b>`
          + (il.sonUrun ? ` — ${esc(il.sonUrun)}` : '')
          + `<div class="radar-ilerleme" aria-hidden="true"><span style="width:${oran}%"></span></div>`;
      }
      return;
    }

    bitenTur++;
    if (bitenTur > 1) return;
    radarPollDurdur();
    if (btn) btn.disabled = false;
    const r = d.sonRapor || {};
    if (el) {
      el.className = 'durum-mesaji ok';
      el.innerHTML = `✅ Tarama tamamlandı — <b>${r.taranan ?? 0}</b> ürün tarandı, `
        + `<b>${r.stoktaBulunan ?? 0}</b> ürün stokta bulundu, `
        + `<b>${r.gonderilen ?? 0}</b> Telegram bildirimi gönderildi`
        + (r.hataSayisi ? ` · ⚠️ ${r.hataSayisi} hata` : '') + '.';
    }
    radarDurumuYukle();
  }, 3000);
}

$('#radarCalistirBtn')?.addEventListener('click', async () => {
  const btn = $('#radarCalistirBtn');
  const el = $('#radarCalistirMesaj');
  if (!el) return;

  const sohbet = $('#radarChatId')?.value.trim()
    || $('#telegramChatId')?.value.trim()
    || $('#firsatKanal')?.value.trim()
    || '';
  const gonder = !!sohbet;

  if (!radarKatalog.length) {
    radarMesaj('#radarCalistirMesaj', '❌ Katalog boş — önce ürün ekleyin.', 'hata');
    return;
  }

  try { await radarAyarlariniKaydet(); } catch { /* hata mesajı yazıldı */ }

  if (btn) btn.disabled = true;
  el.className = 'durum-mesaji';
  el.innerHTML = gonder
    ? `⏳ ${radarKatalog.length} ürün sırayla taranıyor (ürünler arası 2 sn). Bu işlem birkaç dakika sürebilir…`
    : `⏳ ${radarKatalog.length} ürün taranıyor. <b>Bildirim sohbeti tanımlı olmadığı için Telegram'a mesaj gönderilmeyecek</b> — sonuçlar yalnızca burada gösterilir.`;
  try {
    const res = await fetch('/api/radar/calistir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gonder, zorla: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Tarama başlatılamadı');
    if (d.basladi === false) {
      if (btn) btn.disabled = false;
      radarMesaj('#radarCalistirMesaj', '⚠️ ' + (d.neden || 'Tarama zaten çalışıyor.'), 'hata');
      radarPollBaslat();
      return;
    }
    radarPollBaslat();
  } catch (e) {
    if (btn) btn.disabled = false;
    radarMesaj('#radarCalistirMesaj', '❌ ' + e.message, 'hata');
  }
});

/* ======================================================================
   ✨ Kullanıcı aramalarından SEO / Radar kataloğu terfisi
   ====================================================================== */
let seoTerfiAdaylar = [];

function seoTerfiListeCiz() {
  const ul = $('#seoTerfiListe');
  const sayi = $('#seoTerfiSayisi');
  if (!ul) return;
  if (sayi) sayi.textContent = `(${seoTerfiAdaylar.length} aday)`;
  if (!seoTerfiAdaylar.length) {
    ul.innerHTML = '<li><span class="radar-urun-sorgu">Şu an eşiği (≥3 stoklu mağaza) geçen yeni terfi adayı yok.</span></li>';
    return;
  }
  ul.innerHTML = seoTerfiAdaylar.map((a, idx) => `
    <li>
      <span>
        <span class="radar-urun-ad">${esc(a.ad)}</span>
        <span class="radar-kategori-rozet">${radarKategoriEtiket(a.kategori)}</span>
        <span class="radar-urun-sorgu">
          🟢 <b>${a.stokluSayi}</b> mağazada stoklu · En ucuz: <b>${tl(a.enUcuzFiyat)}</b> (${esc(a.enUcuzSite || '—')})
          · <a href="${esc(a.url)}" target="_blank" rel="noopener">Kaynak ↗</a>
        </span>
      </span>
      <span style="display:flex; gap:6px; flex-wrap:wrap">
        <button type="button" class="ikincil-btn" data-terfi-onayla="${idx}">➕ Kataloğa Terfi Et</button>
        <button type="button" data-terfi-reddet="${idx}">Gizle</button>
      </span>
    </li>
  `).join('');
}

async function seoTerfiAdaylariYukle() {
  const ul = $('#seoTerfiListe');
  if (!ul) return;
  try {
    const res = await fetch('/api/admin/seo-adaylar');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return;
    seoTerfiAdaylar = Array.isArray(d.adaylar) ? d.adaylar : [];
    seoTerfiListeCiz();
  } catch { /* sessiz geç */ }
}

$('#seoTerfiYenileBtn')?.addEventListener('click', () => { seoTerfiAdaylariYukle(); });

$('#seoTerfiListe')?.addEventListener('click', async (e) => {
  const terfiBtn = e.target.closest('[data-terfi-onayla]');
  const redBtn = e.target.closest('[data-terfi-reddet]');
  if (!terfiBtn && !redBtn) return;

  const idx = Number((terfiBtn || redBtn).dataset[terfiBtn ? 'terfiOnayla' : 'terfiReddet']);
  const aday = seoTerfiAdaylar[idx];
  if (!aday) return;

  const mesajEl = $('#seoTerfiMesaj');
  if (terfiBtn) terfiBtn.disabled = true;
  if (redBtn) redBtn.disabled = true;

  try {
    if (terfiBtn) {
      const res = await fetch('/api/admin/seo-adaylar/terfi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad: aday.ad,
          sorgu: aday.sorgu,
          url: aday.url,
          kategori: aday.kategori,
          anahtar: aday.anahtar,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.hata || 'Terfi başarısız');
      seoTerfiAdaylar.splice(idx, 1);
      seoTerfiListeCiz();
      if (mesajEl) {
        mesajEl.className = 'durum-mesaji ok';
        mesajEl.innerHTML = `✅ "<b>${esc(aday.ad)}</b>" kataloğa terfi ettirildi → <a href="${esc(d.urunYolu)}" target="_blank" rel="noopener">${esc(d.urunYolu)} ↗</a>`;
      }
      radarDurumuYukle();
      ozetYukle();
    } else {
      const res = await fetch('/api/admin/seo-adaylar/reddet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: aday.ad, anahtar: aday.anahtar }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.hata || 'Gizlenemedi');
      seoTerfiAdaylar.splice(idx, 1);
      seoTerfiListeCiz();
      if (mesajEl) {
        mesajEl.className = 'durum-mesaji';
        mesajEl.textContent = `ℹ️ "${aday.ad}" listeden gizlendi.`;
      }
    }
  } catch (err) {
    if (mesajEl) {
      mesajEl.className = 'durum-mesaji hata';
      mesajEl.textContent = '❌ ' + err.message;
    }
    if (terfiBtn) terfiBtn.disabled = false;
    if (redBtn) redBtn.disabled = false;
  }
});

oturumKontrol();
