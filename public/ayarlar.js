/* Son kullanıcı Ayarlar / Alarmlarım sayfası (/ayarlar.html)
 * Sadece takip edilen ürünler, hedef fiyat mesafe çubuğu, fiyat grafiği,
 * tarayıcı Web Push bildirimleri ve tema tercihlerini yönetir.
 */

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

// ---- Site adları & altbar ----

let SITE_ADLARI_AYARLAR = {
  trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', amazon: 'Amazon.tr',
  vatan: 'Vatan', mediamarkt: 'MediaMarkt', itopya: 'İtopya',
  pazarama: 'Pazarama', incehesap: 'İncehesap',
};
let SITE_SIRASI_AYARLAR = Object.keys(SITE_ADLARI_AYARLAR);

function SITE_ADI(id) {
  return SITE_ADLARI_AYARLAR[id] || id;
}

(async () => {
  try {
    const res = await fetch('/api/durum');
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.siteler) && d.siteler.length) {
        SITE_ADLARI_AYARLAR = Object.fromEntries(d.siteler.map(s => [s.id, s.ad]));
        SITE_SIRASI_AYARLAR = d.siteler.map(s => s.id);
      }
    }
  } catch { /* sessizce geç */ }
  const liste = document.getElementById('footerSiteler');
  const sayiEl = document.getElementById('footerSiteSayisi');
  if (liste) {
    liste.innerHTML = SITE_SIRASI_AYARLAR.map(s => `<li>${esc(SITE_ADLARI_AYARLAR[s] || s)}</li>`).join('');
    if (sayiEl) sayiEl.textContent = SITE_SIRASI_AYARLAR.length;
  }
})();

// ---- Fiyat grafiği (SVG) ----

function grafikSvg(gecmis) {
  const noktalar = (gecmis || []).filter(g => g.enUcuzFiyat != null);
  if (noktalar.length < 2) {
    return '<div class="grafik-bos">Grafik için en az iki kontrol gerekiyor' +
      (noktalar.length === 1 ? ' (şu an tek kayıt var: ' + tl(noktalar[0].enUcuzFiyat) + ')' : '') + '.</div>';
  }
  const W = 640, H = 160, PAD = 34;
  const fiyats = noktalar.map(n => n.enUcuzFiyat);
  const minF = Math.min(...fiyats), maxF = Math.max(...fiyats);
  const yAralik = maxF - minF || 1;
  const x = (i) => PAD + (i / (noktalar.length - 1)) * (W - PAD * 2);
  const y = (f) => PAD + (1 - (f - minF) / yAralik) * (H - PAD * 2);
  const cizgi = noktalar.map((n, i) => `${x(i).toFixed(1)},${y(n.enUcuzFiyat).toFixed(1)}`).join(' ');
  const etiketIlk = `<text x="${PAD}" y="${H - 8}" font-size="10" fill="#9aa1ad">${tarih(noktalar[0].ts)}</text>`;
  const etiketSon = `<text x="${W - PAD}" y="${H - 8}" font-size="10" fill="#9aa1ad" text-anchor="end">${tarih(noktalar[noktalar.length - 1].ts)}</text>`;
  const etiketMax = `<text x="${W - PAD + 4}" y="${y(maxF) + 3}" font-size="10" fill="#9aa1ad">${Math.round(maxF)}</text>`;
  const etiketMin = `<text x="${W - PAD + 4}" y="${y(minF) + 3}" font-size="10" fill="#9aa1ad">${Math.round(minF)}</text>`;
  return `<div class="grafik-sarma"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fiyat geçmişi grafiği">
    <line x1="${PAD}" y1="${y(maxF)}" x2="${W - PAD}" y2="${y(maxF)}" stroke="#e4e7ee" stroke-dasharray="4 4"/>
    <line x1="${PAD}" y1="${y(minF)}" x2="${W - PAD}" y2="${y(minF)}" stroke="#e4e7ee" stroke-dasharray="4 4"/>
    <polyline points="${cizgi}" fill="none" stroke="#3450D1" stroke-width="2.5" stroke-linejoin="round"/>
    ${noktalar.map((n, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(n.enUcuzFiyat).toFixed(1)}" r="3.5" fill="#3450D1"><title>${tarih(n.ts)} — ${tl(n.enUcuzFiyat)} (${esc(n.enUcuzSite || '?')})</title></circle>`).join('')}
    ${etiketIlk}${etiketSon}${etiketMax}${etiketMin}
  </svg></div>`;
}

// ---- Hedefe kalan mesafe + Takip listesi ----

async function hedefMesafeModulunuYukle() {
  try {
    return await import('/hedefMesafe.js');
  } catch {
    return null;
  }
}

function hedefMesafeCubugu(takip, modül) {
  if (!modül) return '';
  const mevcut = modül.mevcutEnUcuzFiyat(takip);
  const hesap = modül.hedefMesafeHesapla(mevcut, takip.hedefFiyat);
  const pid = esc(takip.id);
  const icerik = (() => {
    if (hesap.durum === 'hedef_yok') {
      return '<div class="hedef-mesafe-not">🎯 Hedef fiyat alarmı kurmak için yukarıdan hedef fiyat belirleyin.</div>';
    }
    if (hesap.durum === 'fiyat_yok') {
      return '<div class="hedef-mesafe-not">⏳ Henüz doğrulanmış fiyat yok — ilk fiyat kontrolünden sonra mesafe görünecek.</div>';
    }
    if (hesap.durum === 'ulasildi') {
      return `<div class="hedef-ulasildi">
        <span>🎉 <b>HEDEFE ULAŞILDI!</b> Şu an ${tl(hesap.mevcut)} (hedef: ${tl(hesap.hedef)})</span>
        <span class="hedef-ulasildi-rozet">✓ Alım Fırsatı</span>
      </div>
      <div class="hedef-mesafe-ray"><div class="hedef-mesafe-dolgu tamamlandi yesil" style="width:100%"></div></div>`;
    }
    return `<div class="hedef-mesafe-ust">
      <span>Mevcut: <b>${tl(hesap.mevcut)}</b> → Hedef: <b>${tl(hesap.hedef)}</b></span>
      <span>Hedefe <b>${tl(hesap.kalanTL)}</b> kaldı · <b>%${hesap.oran} tamamlandı</b>${hesap.yakin ? ' · <b class="hedef-yakin-etiket">🔥 Çok yakın!</b>' : ''}</span>
    </div>
    <div class="hedef-mesafe-ray"><div class="hedef-mesafe-dolgu ${hesap.renk}" style="width:${hesap.oran}%"></div></div>`;
  })();
  return `<div class="hedef-mesafe-kapsayici" data-hedef-kapsayici="${pid}">${icerik}</div>`;
}

function hedefMesafeGuncelle(takip, modül) {
  if (!modül || !takip) return;
  const kutu = document.querySelector(`[data-hedef-kapsayici="${CSS.escape(String(takip.id))}"]`);
  if (!kutu) return;
  const html = hedefMesafeCubugu(takip, modül);
  const gecici = document.createElement('div');
  gecici.innerHTML = html;
  const yeni = gecici.firstElementChild;
  if (yeni) {
    kutu.replaceWith(yeni);
    const hesap = modül.hedefMesafeHesapla(modül.mevcutEnUcuzFiyat(takip), takip.hedefFiyat);
    const dolgu = yeni.querySelector('.hedef-mesafe-dolgu');
    if (dolgu && hesap.oran != null) {
      requestAnimationFrame(() => { dolgu.style.width = `${hesap.oran}%`; });
    }
  }
}

async function takipleriYukle() {
  const alan = $('#takipListesi');
  if (!alan) return;
  try {
    const [res, modül] = await Promise.all([
      fetch('/api/tracked'),
      hedefMesafeModulunuYukle(),
    ]);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      alan.innerHTML = '<p class="alt-not">Henüz takip edilen ürün yok. <a href="/">Karşılaştır</a> sayfasında bir ürün arayıp <b>🔔 Takibe al</b> ile ekleyebilirsiniz.</p>';
      return;
    }
    alan.innerHTML = list.map(t => {
      const gecmis = t.fiyatGecmisi || [];
      const sonKayit = gecmis.length ? gecmis[gecmis.length - 1] : null;
      const fiyatSatiri = (t.sonFiyatlar || []).map(f => {
        const durumKotu = f.durum && f.durum !== 'ok';
        const kuponEki = f.kuponFiyati != null ? ' → kuponla ' + tl(f.kuponFiyati) : '';
        return `<span class="${durumKotu ? 'kotu' : 'iyi'}">${esc(SITE_ADI(f.site))}: ${durumKotu ? 'kontrol edilemedi → son bilinen ' : ''}${tl(f.fiyat)}${kuponEki}</span>`;
      }).join(' · ') || 'Henüz kontrol edilmedi';
      const sonKontrolSatiri = sonKayit
        ? `Son kontrol: ${tarih(sonKayit.ts)} · En ucuz: <b>${esc(sonKayit.enUcuzSite || '—')}</b> ${tl(sonKayit.enUcuzFiyat)}`
        : 'Henüz kontrol edilmedi';
      return `<div class="takip-ogesi" data-id="${esc(t.id)}">
        <div class="ust-satir">
          <div>
            <div class="baslik">${esc(t.urun || '?')}${t.renk ? ' <span class="rozet renk">' + esc(t.renk) + '</span>' : ''}</div>
            <div class="bilgi">${fiyatSatiri}</div>
            <div class="bilgi">${sonKontrolSatiri}</div>
          </div>
          <button class="sil-btn" data-sil="${esc(t.id)}">Takipten çıkar</button>
        </div>
        <div class="hedef-form">
          <label>Hedef fiyat:</label>
          <input type="number" min="1" step="0.01" value="${t.hedefFiyat ?? ''}" placeholder="TL" data-hedef="${esc(t.id)}" />
          <button data-kaydet="${esc(t.id)}">Kaydet</button>
          <span class="takip-mesaj" data-mesaj="${esc(t.id)}"></span>
        </div>
        ${hedefMesafeCubugu(t, modül)}
        ${grafikSvg(gecmis)}
      </div>`;
    }).join('');

    alan.querySelectorAll('[data-sil]').forEach(b => {
      b.addEventListener('click', async () => {
        await fetch('/api/tracked/' + encodeURIComponent(b.dataset.sil), { method: 'DELETE' });
        takipleriYukle();
      });
    });
    alan.querySelectorAll('[data-kaydet]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.kaydet;
        const input = alan.querySelector(`[data-hedef="${CSS.escape(id)}"]`);
        const msgEl = alan.querySelector(`[data-mesaj="${CSS.escape(id)}"]`);
        const hedef = parseFloat(input.value);
        if (!hedef || hedef <= 0) {
          msgEl.className = 'takip-mesaj hata';
          msgEl.textContent = 'Geçerli bir fiyat gir';
          return;
        }
        try {
          const res = await fetch(`/api/tracked/${encodeURIComponent(id)}/hedef`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hedefFiyat: hedef }),
          });
          if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
          msgEl.className = 'takip-mesaj ok';
          msgEl.textContent = 'Kaydedildi';
          if (modül) {
            const takip = list.find(x => String(x.id) === String(id));
            if (takip) {
              takip.hedefFiyat = hedef;
              hedefMesafeGuncelle(takip, modül);
            } else {
              takipleriYukle();
            }
          }
        } catch (e) {
          msgEl.className = 'takip-mesaj hata';
          msgEl.textContent = e.message;
        }
      });
    });
  } catch {
    alan.innerHTML = '<p class="alt-not">Takip listesi şu an yüklenemedi.</p>';
  }
}

// ---- Tarayıcı Bildirimleri (Web Push) & Tema Tercihleri ----

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushDurumunuGuncelle() {
  const kutu = $('#pushDurumKutusu');
  const aboneBtn = $('#pushAboneBtn');
  if (!kutu) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    kutu.textContent = 'ℹ️ Bu tarayıcı anlık Web Push bildirimlerini desteklemiyor.';
    if (aboneBtn) aboneBtn.disabled = true;
    return;
  }
  const izin = Notification.permission;
  if (izin === 'granted') {
    kutu.innerHTML = '🟢 <b>Tarayıcı bildirimleri açık</b> — fiyat alarmları bu cihaza anında iletilir.';
  } else if (izin === 'denied') {
    kutu.innerHTML = '🔴 <b>Bildirim izni engellenmiş</b> — tarayıcı adres çubuğundaki kilit simgesinden izin verebilirsiniz.';
  } else {
    kutu.innerHTML = '⚪ <b>Bildirimler henüz etkinleştirilmedi</b> — aşağıdaki düğmeden açabilirsiniz.';
  }
}

$('#pushAboneBtn')?.addEventListener('click', async () => {
  const msg = $('#pushDurumMesaj');
  const btn = $('#pushAboneBtn');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (btn) btn.disabled = true;
  if (msg) { msg.className = 'durum-mesaji'; msg.textContent = 'Bildirim izni isteniyor…'; }
  try {
    const izin = await Notification.requestPermission();
    pushDurumunuGuncelle();
    if (izin !== 'granted') throw new Error('Bildirim izni verilmedi.');
    const reg = await navigator.serviceWorker.register('/sw.js?v=12');
    await navigator.serviceWorker.ready;
    const keyRes = await fetch('/api/push/vapid-key');
    const keyData = await keyRes.json();
    if (!keyRes.ok || !keyData.publicKey) throw new Error(keyData.hata || 'VAPID anahtarı alınamadı');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    });
    if (!subRes.ok) throw new Error('Abonelik kaydedilemedi');
    if (msg) { msg.className = 'durum-mesaji ok'; msg.textContent = '✅ Cihaz bildirimlere abone edildi!'; }
  } catch (e) {
    if (msg) { msg.className = 'durum-mesaji hata'; msg.textContent = '❌ ' + e.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#pushTestBtn')?.addEventListener('click', async () => {
  const msg = $('#pushDurumMesaj');
  if (msg) { msg.className = 'durum-mesaji'; msg.textContent = 'Test bildirimi gönderiliyor…'; }
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || 'Gönderilemedi');
    if (msg) { msg.className = 'durum-mesaji ok'; msg.textContent = '✅ Örnek bildirim gönderildi!'; }
  } catch (e) {
    if (msg) { msg.className = 'durum-mesaji hata'; msg.textContent = '⚠️ ' + e.message; }
  }
});

$('#temaTercihBtn')?.addEventListener('click', () => {
  $('#temaDegistir')?.click();
});

takipleriYukle();
pushDurumunuGuncelle();
