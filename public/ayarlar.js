/* Ayarlar sayfası mantığı: indirim botu + takip listesi + fiyat grafiği */

// Erişim anahtarı yönetimi /erisim.js içinde (modal tabanlı; native prompt() kullanmaz).

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

// ---- Ayarlar formu ----

async function ayarlariYukle() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    $('#alarmEmail').value = s.alarmEmail || '';
    $('#smtpHost').value = s.smtp?.host || '';
    $('#smtpPort').value = s.smtp?.port || 587;
    $('#smtpUser').value = s.smtp?.user || '';
    $('#smtpFrom').value = s.smtp?.from || '';
    $('#smtpSecure').checked = !!s.smtp?.secure;
    if ($('#telegramEnabled')) $('#telegramEnabled').checked = !!s.telegram?.enabled;
    if ($('#telegramBotToken')) $('#telegramBotToken').value = s.telegram?.botToken || '';
    if ($('#telegramChatId')) $('#telegramChatId').value = s.telegram?.chatId || '';
    if ($('#whatsappEnabled')) $('#whatsappEnabled').checked = !!s.whatsapp?.enabled;
    if ($('#whatsappWebhookUrl')) $('#whatsappWebhookUrl').value = s.whatsapp?.webhookUrl || '';
    if ($('#whatsappPhone')) $('#whatsappPhone').value = s.whatsapp?.phone || '';
    // 📢 Otonom Fırsat Kanalı (2026-10-30)
    if ($('#firsatEnabled')) $('#firsatEnabled').checked = !!s.firsat?.enabled;
    if ($('#firsatKanal')) $('#firsatKanal').value = s.firsat?.kanal || '';
    if ($('#firsatMinIndirim')) $('#firsatMinIndirim').value = s.firsat?.minIndirim ?? 15;
    if ($('#firsatGunlukMax')) $('#firsatGunlukMax').value = s.firsat?.gunlukMax ?? 12;
    if ($('#firsatSaatAraligi')) $('#firsatSaatAraligi').value = s.firsat?.saatAraligi ?? 2;
  } catch (e) {
    mesaj('Ayarlar yüklenemedi: ' + e.message, false);
  }
}

function mesaj(text, ok = true) {
  const el = $('#kaydetMesaj');
  el.className = 'durum-mesaji ' + (ok ? 'ok' : 'hata');
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 6000);
}

$('#kaydetBtn').addEventListener('click', async () => {
  const body = {
    alarmEmail: $('#alarmEmail').value.trim(),
    smtp: {
      host: $('#smtpHost').value.trim(),
      port: parseInt($('#smtpPort').value, 10) || 587,
      user: $('#smtpUser').value.trim(),
      from: $('#smtpFrom').value.trim(),
      secure: $('#smtpSecure').checked,
      // Şifre SMTP nesnesinin içinde olmalı (2026-10-28 düzeltmesi: yanlışlıkla
      // whatsapp nesnesine yazılıyordu, bu yüzden sunucuya hiç ulaşmıyordu).
      // Boş bırakılırsa undefined olur ve aşağıdaki satır tarafından silinir;
      // böylece kayıtlı şifre korunur (Ayarlar formu şifreyi asla geri yazmaz).
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
    },
    // 📢 Otonom Fırsat Kanalı (2026-10-30)
    firsat: {
      enabled: $('#firsatEnabled')?.checked || false,
      kanal: $('#firsatKanal')?.value.trim() || '',
      minIndirim: parseInt($('#firsatMinIndirim')?.value, 10) || 15,
      gunlukMax: parseInt($('#firsatGunlukMax')?.value, 10) || 12,
      saatAraligi: parseInt($('#firsatSaatAraligi')?.value, 10) || 2,
    },
  };
  if (!body.smtp.pass) delete body.smtp.pass;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
    $('#smtpPass').value = '';
    mesaj('Ayarlar kaydedildi.');
    // Fırsat zamanlayıcısı yeni aralık/kanal ayarlarıyla yeniden kurulur.
    firsatDurumuYukle();
  } catch (e) {
    mesaj(e.message, false);
  }
});

// ---- Görev durumu ----

async function gorevDurumuYukle() {
  try {
    const res = await fetch('/api/gorev');
    const g = await res.json();
    const saatler = (g.saatler || ['09:00', '12:00', '15:00', '18:00', '21:00']).join(', ');
    $('#gorevDurumu').innerHTML =
      `Kontrol saatleri (günde ${(g.saatler || []).length || 5} kez): <b>${esc(saatler)}</b> · ` +
      `Sonraki kontrol: <b>${g.sonrakiCalisma ? new Date(g.sonrakiCalisma).toLocaleString('tr-TR') : '—'}</b> · ` +
      `Son çalışma: <b>${g.sonCalisma ? new Date(g.sonCalisma).toLocaleString('tr-TR') : 'henüz yapılmadı'}</b>` +
      (g.calisiyor ? ' · <b>şu an çalışıyor…</b>' : '');
  } catch { /* sessizce geç */ }
}

$('#calistirBtn').addEventListener('click', async () => {
  const el = $('#calismaSonuc');
  $('#calistirBtn').disabled = true;
  $('#calistirBtn').textContent = 'Kontroller çalışıyor…';
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
    takipleriYukle();
    gorevDurumuYukle();
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = e.message;
  } finally {
    $('#calistirBtn').disabled = false;
    $('#calistirBtn').textContent = 'Kontrolleri şimdi çalıştır';
  }
});

$('#testEmailBtn').addEventListener('click', async () => {
  const el = $('#calismaSonuc');
  $('#testEmailBtn').disabled = true;
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
    $('#testEmailBtn').disabled = false;
  }
});

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
  const hedef = null; // hedef çizgisi istenirse eklenebilir
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

// ---- Kazıma sağlayıcı kredi panosu ----

const KREDI_DURUM_METNI = {
  hazir: ['Hazır', 'iyi'],
  tukendi: ['Kredi tükendi', 'kotu'],
  anahtar_yok: ['Anahtar yok', 'notr'],
  sorgulanamadi: ['Sorgulanamadı', 'notr'],
};

function sayi(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('tr-TR');
}

async function kredileriYukle(taze = false) {
  const alan = $('#krediPanosu');
  const btn = $('#krediYenileBtn');
  if (taze) { btn.disabled = true; btn.textContent = 'Sorgulanıyor…'; }
  try {
    const res = await fetch('/api/kredi' + (taze ? '?taze=1' : ''));
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Sorgulanamadı');
    $('#krediSonGuncelleme').textContent = 'Son güncelleme: ' + tarih(r.sonGuncelleme);
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
    if (taze) { btn.disabled = false; btn.textContent = 'Kredileri yenile'; }
  }
}

$('#krediYenileBtn').addEventListener('click', () => kredileriYukle(true));

// ---- Kupon / kampanya toplayıcı panosu ----

const KAPSAM_ADI = {
  site: 'site geneli', kategori: 'kategori', uyelik: 'üyelere özel',
  uygulama: 'uygulamaya özel', kart: 'karta özel', belirsiz: 'kapsam belirsiz',
};

async function kuponlariYukle() {
  const alan = $('#kuponPanosu');
  try {
    const res = await fetch('/api/kuponlar');
    const r = await res.json();
    if (!res.ok) throw new Error(r.hata || 'Alınamadı');
    const toplam = (r.siteler || []).reduce((s, x) => s + x.kampanyalar.length, 0);
    $('#kuponSonGuncelleme').textContent = r.sonGuncelleme
      ? 'Son toplama: ' + tarih(r.sonGuncelleme) + ' · ' + toplam + ' kampanya'
      : 'Henüz toplanmadı';
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

$('#kuponToplaBtn').addEventListener('click', async () => {
  const btn = $('#kuponToplaBtn');
  btn.disabled = true;
  btn.textContent = 'Toplanıyor… (1-2 dakika)';
  try {
    const res = await fetch('/api/kuponlar/topla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const r = await res.json();
    if (!res.ok || r.ok === false) throw new Error(r.hata || 'Toplama başarısız');
    await kuponlariYukle();
  } catch (e) {
    $('#kuponSonGuncelleme').textContent = 'Toplama hatası: ' + e.message;  } finally {
    btn.disabled = false;
    btn.textContent = 'Kuponları şimdi topla';
  }
});

// ---- Takip listesi ----

async function takipleriYukle() {
  try {
    const res = await fetch('/api/tracked');
    const list = await res.json();
    const alan = $('#takipListesi');
    if (!list.length) {
      alan.innerHTML = '<p class="alt-not">Henüz takip edilen ürün yok. Karşılaştırma ya da öneri sonrası "Takibe al" ile ekleyin.</p>';
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
            ${t.sonBildirimDurumu ? `<div class="bilgi">Son bildirim: ${esc(t.sonBildirimDurumu)}</div>` : ''}
          </div>
          <button class="sil-btn" data-sil="${esc(t.id)}">Takipten çıkar</button>
        </div>
        <div class="hedef-form">
          <label>Hedef fiyat:</label>
          <input type="number" min="1" step="0.01" value="${t.hedefFiyat ?? ''}" placeholder="TL" data-hedef="${esc(t.id)}" />
          <button data-kaydet="${esc(t.id)}">Kaydet</button>
          <span class="takip-mesaj" data-mesaj="${esc(t.id)}"></span>
        </div>
        ${grafikSvg(gecmis)}
      </div>`;
    }).join('');

    alan.querySelectorAll('[data-sil]').forEach(b => {
      b.addEventListener('click', async () => {
        await fetch('/api/tracked/' + b.dataset.sil, { method: 'DELETE' });
        takipleriYukle();
      });
    });
    alan.querySelectorAll('[data-kaydet]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.kaydet;
        const input = alan.querySelector(`[data-hedef="${id}"]`);
        const msgEl = alan.querySelector(`[data-mesaj="${id}"]`);
        const hedef = parseFloat(input.value);
        if (!hedef || hedef <= 0) {
          msgEl.className = 'takip-mesaj hata';
          msgEl.textContent = 'Geçerli bir fiyat gir';
          return;
        }
        try {
          const res = await fetch(`/api/tracked/${id}/hedef`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hedefFiyat: hedef }),
          });
          if (!res.ok) throw new Error((await res.json()).hata || 'Kaydedilemedi');
          msgEl.className = 'takip-mesaj ok';
          msgEl.textContent = 'Kaydedildi';
        } catch (e) {
          msgEl.className = 'takip-mesaj hata';
          msgEl.textContent = e.message;
        }
      });
    });
  } catch { /* sessizce geç */ }
}

let SITE_ADLARI_AYARLAR = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', amazon: 'Amazon.tr', vatan: 'Vatan', mediamarkt: 'MediaMarkt', itopya: 'İtopya', pazarama: 'Pazarama', incehesap: 'İncehesap' };
let SITE_SIRASI_AYARLAR = Object.keys(SITE_ADLARI_AYARLAR);
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
  // Footer: karşılaştırılan sitelerin listesi
  const liste = document.getElementById('footerSiteler');
  const sayi = document.getElementById('footerSiteSayisi');
  if (liste) {
    liste.innerHTML = SITE_SIRASI_AYARLAR.map(s => `<li>${SITE_ADLARI_AYARLAR[s] || s}</li>`).join('');
    if (sayi) sayi.textContent = SITE_SIRASI_AYARLAR.length;
  }
})();

function SITE_ADI(id) {
  return SITE_ADLARI_AYARLAR[id] || id;
}

// 📢 Otonom Fırsat Kanalı durumu (2026-10-30)
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

ayarlariYukle();
takipleriYukle();
gorevDurumuYukle();
kredileriYukle();
kuponlariYukle();
firsatDurumuYukle();

/* ================= 📢 Fırsat kanalı otomatik kayıt (2026-11-01) =================
 *
 * SORUN: Onay kutusu yalnızca sayfanın üstündeki "Ayarları kaydet" düğmesiyle
 * kaydediliyordu; kullanıcı yalnızca tikleyip sayfayı yenileyince (F5) değişiklik
 * kayboluyordu. Artık bu karttaki HER değişiklik anında sunucuya yazılır:
 *  - onay kutusu anında (debounce yok),
 *  - sayısal/metin alanları 500 ms debounce ile.
 *
 * Kısmi güncelleme gönderilir ({ firsat: {...} }) → diğer ayarlar (SMTP, Telegram,
 * WhatsApp, afiliye) yanlışlıkla ezilmez.
 */

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
  const sayi = (sel, varsayilan, min, max) => {
    const n = parseInt($(sel)?.value, 10);
    if (!Number.isFinite(n)) return varsayilan;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: $('#firsatEnabled')?.checked === true,
    kanal: $('#firsatKanal')?.value.trim() || '',
    minIndirim: sayi('#firsatMinIndirim', 15, 1, 95),
    gunlukMax: sayi('#firsatGunlukMax', 12, 1, 100),
    saatAraligi: sayi('#firsatSaatAraligi', 2, 1, 24),
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
    // Sunucudan dönen doğrulanmış değerleri forma yansıt.
    if ($('#firsatEnabled')) $('#firsatEnabled').checked = !!f.enabled;
    if ($('#firsatMinIndirim') && f.minIndirim != null) $('#firsatMinIndirim').value = f.minIndirim;
    if ($('#firsatGunlukMax') && f.gunlukMax != null) $('#firsatGunlukMax').value = f.gunlukMax;
    if ($('#firsatSaatAraligi') && f.saatAraligi != null) $('#firsatSaatAraligi').value = f.saatAraligi;
    firsatKaydetMesaji(f.enabled ? '✅ Kaydedildi — kanal paylaşımı AÇIK' : '✅ Kaydedildi — kanal paylaşımı kapalı', 'ok');
    firsatDurumuYukle();
  } catch (e) {
    firsatKaydetMesaji('❌ ' + e.message, 'hata');
  } finally {
    firsatKaydediliyor = false;
  }
}

/** Alan değişikliklerini debounce ile kaydeder. */
function firsatKaydetGecikmeli() {
  clearTimeout(firsatKaydetTimer);
  firsatKaydetMesaji('Kaydediliyor…');
  firsatKaydetTimer = setTimeout(firsatAyarlariniKaydet, 500);
}

// Onay kutusu: ANINDA kaydet (kullanıcı tikleyip hemen F5 yapsa da kaybolmaz).
$('#firsatEnabled')?.addEventListener('change', () => {
  clearTimeout(firsatKaydetTimer);
  firsatAyarlariniKaydet();
});
for (const sel of ['#firsatKanal', '#firsatMinIndirim', '#firsatGunlukMax', '#firsatSaatAraligi']) {
  $(sel)?.addEventListener('input', firsatKaydetGecikmeli);
  $(sel)?.addEventListener('change', firsatKaydetGecikmeli);
}
// Sekme kapanırken bekleyen debounce kaybolmasın.
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

// 📢 Kanala test paylaşımı (2026-10-30)
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
    el.textContent = `✅ Test paylaşımı iletildi (${data.yontem}${data.gercekFirsat ? ', gerçek fırsat' : ', bağlantı testi'}). Telegram kanalınızı kontrol edebilirsiniz.`;
    firsatDurumuYukle();
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Telegram test butonu
$('#telegramTestBtn')?.addEventListener('click', async () => {
  const el = $('#telegramTestMesaj');
  el.className = 'durum-mesaji';
  el.textContent = 'Gönderiliyor...';

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
    el.className = 'durum-mesaji ok';
    el.textContent = '✅ Telegram test mesajı başarıyla iletildi!';
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  }
});

// WhatsApp test butonu
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

/* ================= 🧹 Veritabanı / Önbellek Bakımı (2026-11-01) =================
 *
 * GET /api/db/bakim → son çalışma + dosya boyutları
 * POST /api/db/bakim { kuru } → elle çalıştır
 *
 * Dürüstlük: WAL checkpoint `busy` dönerse (açık okuyucu) panelde uyarı olarak
 * gösterilir; "tamamen temizlendi" denmez.
 */

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
  } catch (e) {
    el.className = 'durum-mesaji hata';
    el.textContent = '❌ ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

$('#dbBakimBtn')?.addEventListener('click', () => dbBakimCalistirVeGoster(false));
$('#dbBakimKuruBtn')?.addEventListener('click', () => dbBakimCalistirVeGoster(true));
dbBakimDurumYukle();
