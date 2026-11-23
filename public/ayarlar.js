/* Son kullanıcı Ayarlar / Alarmlarım sayfası (/ayarlar.html)
 * Sadece takip edilen ürünler, hedef fiyat mesafe çubuğu, fiyat grafiği,
 * tarayıcı Web Push bildirimleri ve tema tercihlerini yönetir.
 */

const $ = (s) => document.querySelector(s);
const ORTAM = (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM) || {};
const ORTAM_DIL = ORTAM.dil || 'tr';
const ORTAM_MARKET = ORTAM.market || 'tr';
const ORTAM_PARA = ORTAM.currency || 'TRY';
const ORTAM_YEREL = ORTAM.yerel || 'tr-TR';
const TABAN_YOL = ORTAM.tabanYol || '/';

const AY_SZ = {
  tr: {
    grafikAz: 'Grafik için en az iki kontrol gerekiyor',
    tekKayit: (f) => ` (şu an tek kayıt var: ${f})`,
    grafikAria: 'Fiyat geçmişi grafiği',
    hedefBelirle: '🎯 Hedef fiyat alarmı kurmak için yukarıdan hedef fiyat belirleyin.',
    dogrulanmisYok: '⏳ Henüz doğrulanmış fiyat yok — ilk fiyat kontrolünden sonra mesafe görünecek.',
    ulasildi: (m, h) => `🎉 <b>HEDEFE ULAŞILDI!</b> Şu an ${m} (hedef: ${h})`,
    alimFirsati: '✓ Alım Fırsatı',
    mevcut: 'Mevcut:', hedef: 'Hedef:',
    kalan: (k, o) => `Hedefe <b>${k}</b> kaldı · <b>%${o} tamamlandı</b>`,
    cokYakin: ' · <b class="hedef-yakin-etiket">🔥 Çok yakın!</b>',
    bosTakip: (url) => `Henüz takip edilen ürün yok. <a href="${esc(url)}">Karşılaştır</a> sayfasında bir ürün arayıp <b>🔔 Takibe al</b> ile ekleyebilirsiniz.`,
    kuponla: ' → kuponla ', kontrolEdilemedi: 'kontrol edilemedi → son bilinen ',
    henuzKontrolYok: 'Henüz kontrol edilmedi',
    sonKontrol: (t, s, f) => `Son kontrol: ${t} · En ucuz: <b>${esc(s)}</b> ${f}`,
    takiptenCikar: 'Takipten çıkar', hedefFiyatLbl: 'Hedef fiyat:', paraPlaceholder: 'TL', kaydet: 'Kaydet',
    gecerliFiyat: 'Geçerli bir fiyat gir', kaydedilemedi: 'Kaydedilemedi', kaydedildi: 'Kaydedildi',
    listeYuklenemedi: 'Takip listesi şu an yüklenemedi.',
    pushDestekYok: 'ℹ️ Bu tarayıcı anlık Web Push bildirimlerini desteklemiyor.',
    pushAcik: '🟢 <b>Tarayıcı bildirimleri açık</b> — fiyat alarmları bu cihaza anında iletilir.',
    pushEngelli: '🔴 <b>Bildirim izni engellenmiş</b> — tarayıcı adres çubuğundaki kilit simgesinden izin verebilirsiniz.',
    pushKapali: '⚪ <b>Bildirimler henüz etkinleştirilmedi</b> — aşağıdaki düğmeden açabilirsiniz.',
    izinIsteniyor: 'Bildirim izni isteniyor…', izinVerilmedi: 'Bildirim izni verilmedi.',
    vapidAlinamadi: 'VAPID anahtarı alınamadı', abonelikKayitHata: 'Abonelik kaydedilemedi',
    aboneOk: '✅ Cihaz bildirimlere abone edildi!', testGonderiliyor: 'Test bildirimi gönderiliyor…',
    testOk: '✅ Örnek bildirim gönderildi!', gonderilemedi: 'Gönderilemedi',
  },
  en: {
    grafikAz: 'At least two price checks are required to render the chart',
    tekKayit: (f) => ` (currently 1 record: ${f})`,
    grafikAria: 'Price history chart',
    hedefBelirle: '🎯 Set a target price above to enable a target-price drop alert.',
    dogrulanmisYok: '⏳ No verified price yet — progress will appear after the first scan.',
    ulasildi: (m, h) => `🎉 <b>TARGET REACHED!</b> Now ${m} (target: ${h})`,
    alimFirsati: '✓ Buy Signal',
    mevcut: 'Current:', hedef: 'Target:',
    kalan: (k, o) => `<b>${k}</b> away · <b>${o}% reached</b>`,
    cokYakin: ' · <b class="hedef-yakin-etiket">🔥 Almost there!</b>',
    bosTakip: (url) => `No tracked products yet. Search for a product on <a href="${esc(url)}">Compare</a> and click <b>🔔 Track this product</b>.`,
    kuponla: ' → with coupon ', kontrolEdilemedi: 'check failed → last known ',
    henuzKontrolYok: 'Not checked yet',
    sonKontrol: (t, s, f) => `Last check: ${t} · Cheapest: <b>${esc(s)}</b> ${f}`,
    takiptenCikar: 'Remove alert', hedefFiyatLbl: 'Target price:', paraPlaceholder: 'USD', kaydet: 'Save',
    gecerliFiyat: 'Enter a valid price', kaydedilemedi: 'Failed to save', kaydedildi: 'Saved',
    listeYuklenemedi: 'Could not load tracked alerts right now.',
    pushDestekYok: 'ℹ️ This browser does not support Web Push notifications.',
    pushAcik: '🟢 <b>Browser notifications enabled</b> — price alerts are delivered straight to this device.',
    pushEngelli: '🔴 <b>Notifications blocked</b> — allow notifications from the lock icon in your address bar.',
    pushKapali: '⚪ <b>Notifications not enabled yet</b> — click the button below to turn them on.',
    izinIsteniyor: 'Requesting notification permission…', izinVerilmedi: 'Notification permission denied.',
    vapidAlinamadi: 'Could not fetch VAPID key', abonelikKayitHata: 'Could not save subscription',
    aboneOk: '✅ Device subscribed to price alerts!', testGonderiliyor: 'Sending test notification…',
    testOk: '✅ Sample notification sent!', gonderilemedi: 'Failed to send',
  },
  fr: {
    grafikAz: 'Au moins deux relevés sont nécessaires pour afficher le graphique',
    tekKayit: (f) => ` (1 seul relevé actuellement : ${f})`,
    grafikAria: 'Graphique d’historique des prix',
    hedefBelirle: '🎯 Définissez un prix cible ci-dessus pour activer l’alerte de baisse.',
    dogrulanmisYok: '⏳ Aucun prix vérifié — la progression apparaîtra après la première analyse.',
    ulasildi: (m, h) => `🎉 <b>OBJECTIF ATTEINT !</b> Actuellement ${m} (cible : ${h})`,
    alimFirsati: '✓ Bon moment d’achat',
    mevcut: 'Actuel :', hedef: 'Cible :',
    kalan: (k, o) => `Encore <b>${k}</b> · <b>${o}% atteint</b>`,
    cokYakin: ' · <b class="hedef-yakin-etiket">🔥 Tout proche !</b>',
    bosTakip: (url) => `Aucun produit suivi pour l’instant. Recherchez un article sur <a href="${esc(url)}">Comparer</a> et cliquez sur <b>🔔 Suivre ce produit</b>.`,
    kuponla: ' → avec code ', kontrolEdilemedi: 'échec vérif. → dernier connu ',
    henuzKontrolYok: 'Pas encore vérifié',
    sonKontrol: (t, s, f) => `Dernière vérif. : ${t} · Moins cher : <b>${esc(s)}</b> ${f}`,
    takiptenCikar: 'Supprimer l’alerte', hedefFiyatLbl: 'Prix cible :', paraPlaceholder: 'EUR', kaydet: 'Enregistrer',
    gecerliFiyat: 'Saisissez un prix valide', kaydedilemedi: 'Échec de l’enregistrement', kaydedildi: 'Enregistré',
    listeYuklenemedi: 'Impossible de charger vos alertes actuellement.',
    pushDestekYok: 'ℹ️ Ce navigateur ne prend pas en charge les notifications Web Push.',
    pushAcik: '🟢 <b>Notifications activées</b> — les alertes sont envoyées directement sur cet appareil.',
    pushEngelli: '🔴 <b>Notifications bloquées</b> — autorisez-les depuis le cadenas dans la barre d’adresse.',
    pushKapali: '⚪ <b>Notifications désactivées</b> — cliquez sur le bouton ci-dessous pour les activer.',
    izinIsteniyor: 'Demande d’autorisation…', izinVerilmedi: 'Autorisation refusée.',
    vapidAlinamadi: 'Clé VAPID introuvable', abonelikKayitHata: 'Impossible d’enregistrer l’abonnement',
    aboneOk: '✅ Appareil abonné aux alertes prix !', testGonderiliyor: 'Envoi de la notification test…',
    testOk: '✅ Notification d’exemple envoyée !', gonderilemedi: 'Échec de l’envoi',
  },
  ja: {
    grafikAz: 'グラフを表示するには2回以上の価格チェックが必要です',
    tekKayit: (f) => `（現在の記録は1件: ${f}）`,
    grafikAria: '価格推移グラフ',
    hedefBelirle: '🎯 上の欄に目標価格を設定すると値下がり通知が届きます。',
    dogrulanmisYok: '⏳ 確認済み価格がまだありません。初回スキャン後に達成度が表示されます。',
    ulasildi: (m, h) => `🎉 <b>目標価格に到達しました！</b> 現在 ${m}（目標: ${h}）`,
    alimFirsati: '✓ 買い時サイン',
    mevcut: '現在:', hedef: '目標:',
    kalan: (k, o) => `あと <b>${k}</b> · <b>${o}% 達成</b>`,
    cokYakin: ' · <b class="hedef-yakin-etiket">🔥 もうすぐ到達！</b>',
    bosTakip: (url) => `追跡中の商品がありません。<a href="${esc(url)}">価格比較</a> ページから商品を検索し <b>🔔 この商品を追跡</b> で追加できます。`,
    kuponla: ' → クーポン適用 ', kontrolEdilemedi: '取得失敗 → 前回値 ',
    henuzKontrolYok: '未チェック',
    sonKontrol: (t, s, f) => `最終確認: ${t} · 最安値: <b>${esc(s)}</b> ${f}`,
    takiptenCikar: '追跡を解除', hedefFiyatLbl: '目標価格:', paraPlaceholder: 'JPY', kaydet: '保存',
    gecerliFiyat: '有効な価格を入力してください', kaydedilemedi: '保存できませんでした', kaydedildi: '保存しました',
    listeYuklenemedi: 'アラート一覧を読み込めませんでした。',
    pushDestekYok: 'ℹ️ このブラウザは Web Push 通知に対応していません。',
    pushAcik: '🟢 <b>ブラウザ通知が有効です</b> — 価格アラートがこの端末へ即時通知されます。',
    pushEngelli: '🔴 <b>通知がブロックされています</b> — アドレスバーの鍵アイコンから通知を許可してください。',
    pushKapali: '⚪ <b>通知はまだ有効ではありません</b> — 下のボタンから有効化できます。',
    izinIsteniyor: '通知の許可をリクエスト中…', izinVerilmedi: '通知が許可されませんでした。',
    vapidAlinamadi: 'VAPIDキーを取得できません', abonelikKayitHata: '登録を保存できませんでした',
    aboneOk: '✅ この端末への通知登録が完了しました！', testGonderiliyor: 'テスト通知を送信中…',
    testOk: '✅ サンプル通知を送信しました！', gonderilemedi: '送信に失敗しました',
  },
}[ORTAM_DIL] || {};

function tl(n) {
  if (n == null || isNaN(n)) return '—';
  if (ORTAM_DIL !== 'tr') {
    if (typeof window.formatPara === 'function') return window.formatPara(n, ORTAM_PARA, ORTAM_YEREL);
    return Number(n).toLocaleString(ORTAM_YEREL, { style: 'currency', currency: ORTAM_PARA });
  }
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tarih(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(ORTAM_YEREL, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    const res = await fetch('/api/durum?market=' + encodeURIComponent(ORTAM_MARKET));
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
    return '<div class="grafik-bos">' + AY_SZ.grafikAz
      + (noktalar.length === 1 ? AY_SZ.tekKayit(tl(noktalar[0].enUcuzFiyat)) : '') + '.</div>';
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
  return `<div class="grafik-sarma"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(AY_SZ.grafikAria)}">
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
      return `<div class="hedef-mesafe-not">${AY_SZ.hedefBelirle}</div>`;
    }
    if (hesap.durum === 'fiyat_yok') {
      return `<div class="hedef-mesafe-not">${AY_SZ.dogrulanmisYok}</div>`;
    }
    if (hesap.durum === 'ulasildi') {
      return `<div class="hedef-ulasildi">
        <span>${AY_SZ.ulasildi(tl(hesap.mevcut), tl(hesap.hedef))}</span>
        <span class="hedef-ulasildi-rozet">${AY_SZ.alimFirsati}</span>
      </div>
      <div class="hedef-mesafe-ray"><div class="hedef-mesafe-dolgu tamamlandi yesil" style="width:100%"></div></div>`;
    }
    return `<div class="hedef-mesafe-ust">
      <span>${AY_SZ.mevcut} <b>${tl(hesap.mevcut)}</b> → ${AY_SZ.hedef} <b>${tl(hesap.hedef)}</b></span>
      <span>${ORTAM_DIL === 'tr' ? `Hedefe <b>${tl(hesap.kalanTL)}</b> kaldı · <b>%${hesap.oran} tamamlandı</b>` : AY_SZ.kalan(tl(hesap.kalanTL), hesap.oran)}${hesap.yakin ? AY_SZ.cokYakin : ''}</span>
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
      alan.innerHTML = `<p class="alt-not">${AY_SZ.bosTakip(TABAN_YOL)}</p>`;
      return;
    }
    alan.innerHTML = list.map(t => {
      const gecmis = t.fiyatGecmisi || [];
      const sonKayit = gecmis.length ? gecmis[gecmis.length - 1] : null;
      const fiyatSatiri = (t.sonFiyatlar || []).map(f => {
        const durumKotu = f.durum && f.durum !== 'ok';
        const kuponEki = f.kuponFiyati != null ? AY_SZ.kuponla + tl(f.kuponFiyati) : '';
        return `<span class="${durumKotu ? 'kotu' : 'iyi'}">${esc(SITE_ADI(f.site))}: ${durumKotu ? AY_SZ.kontrolEdilemedi : ''}${tl(f.fiyat)}${kuponEki}</span>`;
      }).join(' · ') || AY_SZ.henuzKontrolYok;
      const sonKontrolSatiri = sonKayit
        ? AY_SZ.sonKontrol(tarih(sonKayit.ts), sonKayit.enUcuzSite || '—', tl(sonKayit.enUcuzFiyat))
        : AY_SZ.henuzKontrolYok;
      return `<div class="takip-ogesi" data-id="${esc(t.id)}">
        <div class="ust-satir">
          <div>
            <div class="baslik">${esc(t.urun || '?')}${t.renk ? ' <span class="rozet renk">' + esc(t.renk) + '</span>' : ''}</div>
            <div class="bilgi">${fiyatSatiri}</div>
            <div class="bilgi">${sonKontrolSatiri}</div>
          </div>
          <button class="sil-btn" data-sil="${esc(t.id)}">${AY_SZ.takiptenCikar}</button>
        </div>
        <div class="hedef-form">
          <label>${AY_SZ.hedefFiyatLbl}</label>
          <input type="number" min="1" step="0.01" value="${t.hedefFiyat ?? ''}" placeholder="${esc(AY_SZ.paraPlaceholder)}" data-hedef="${esc(t.id)}" />
          <button data-kaydet="${esc(t.id)}">${AY_SZ.kaydet}</button>
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
          msgEl.textContent = AY_SZ.gecerliFiyat;
          return;
        }
        try {
          const res = await fetch(`/api/tracked/${encodeURIComponent(id)}/hedef`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hedefFiyat: hedef }),
          });
          if (!res.ok) throw new Error((await res.json()).hata || AY_SZ.kaydedilemedi);
          msgEl.className = 'takip-mesaj ok';
          msgEl.textContent = AY_SZ.kaydedildi;
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
    alan.innerHTML = `<p class="alt-not">${AY_SZ.listeYuklenemedi}</p>`;
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
    kutu.textContent = AY_SZ.pushDestekYok;
    if (aboneBtn) aboneBtn.disabled = true;
    return;
  }
  const izin = Notification.permission;
  if (izin === 'granted') {
    kutu.innerHTML = AY_SZ.pushAcik;
  } else if (izin === 'denied') {
    kutu.innerHTML = AY_SZ.pushEngelli;
  } else {
    kutu.innerHTML = AY_SZ.pushKapali;
  }
}

$('#pushAboneBtn')?.addEventListener('click', async () => {
  const msg = $('#pushDurumMesaj');
  const btn = $('#pushAboneBtn');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (btn) btn.disabled = true;
  if (msg) { msg.className = 'durum-mesaji'; msg.textContent = AY_SZ.izinIsteniyor; }
  try {
    const izin = await Notification.requestPermission();
    pushDurumunuGuncelle();
    if (izin !== 'granted') throw new Error(AY_SZ.izinVerilmedi);
    const reg = await navigator.serviceWorker.register('/sw.js?v=12');
    await navigator.serviceWorker.ready;
    const keyRes = await fetch('/api/push/vapid-key');
    const keyData = await keyRes.json();
    if (!keyRes.ok || !keyData.publicKey) throw new Error(keyData.hata || AY_SZ.vapidAlinamadi);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    });
    if (!subRes.ok) throw new Error(AY_SZ.abonelikKayitHata);
    if (msg) { msg.className = 'durum-mesaji ok'; msg.textContent = AY_SZ.aboneOk; }
  } catch (e) {
    if (msg) { msg.className = 'durum-mesaji hata'; msg.textContent = '❌ ' + e.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
});

$('#pushTestBtn')?.addEventListener('click', async () => {
  const msg = $('#pushDurumMesaj');
  if (msg) { msg.className = 'durum-mesaji'; msg.textContent = AY_SZ.testGonderiliyor; }
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.hata || AY_SZ.gonderilemedi);
    if (msg) { msg.className = 'durum-mesaji ok'; msg.textContent = AY_SZ.testOk; }
  } catch (e) {
    if (msg) { msg.className = 'durum-mesaji hata'; msg.textContent = '⚠️ ' + e.message; }
  }
});

$('#temaTercihBtn')?.addEventListener('click', () => {
  $('#temaDegistir')?.click();
});

takipleriYukle();
pushDurumunuGuncelle();
