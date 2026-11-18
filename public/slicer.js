/**
 * 🧩 Slicer eklentisi tanıtım sayfası — canlı API örneği (2026-11-06)
 *
 * Sayfa tamamen statiktir; yalnızca "canlı örnek" kutusu
 * `/api/embed/oner` ucunu çağırır (gerçek veri, uydurma fiyat yok).
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const malzeme = $('slMalzeme');
  const gramaj = $('slGramaj');
  const renk = $('slRenk');
  const sonuc = $('slSonuc');
  const jsonKutu = $('slJson');
  if (!malzeme || !sonuc) return;

  const tl = (n) => Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const kac = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  let istekNo = 0;

  async function sorgula() {
    const g = Number(gramaj?.value);
    if (!Number.isFinite(g) || g <= 0) {
      sonuc.innerHTML = '<span class="sl-hata">Geçerli bir gramaj girin.</span>';
      return;
    }

    const benim = ++istekNo;
    sonuc.innerHTML = '<span class="sl-bekle">⏳ Sorgulanıyor…</span>';

    const qs = new URLSearchParams({
      malzeme: malzeme.value || 'PLA',
      gramaj: String(g),
      kaynak: 'web-demo',
    });
    const r = String(renk?.value || '').trim();
    if (r) qs.set('renk', r);

    try {
      const t0 = performance.now();
      const res = await fetch('/api/embed/oner?' + qs.toString());
      const ms = Math.round(performance.now() - t0);
      const v = await res.json();
      if (benim !== istekNo) return; // daha yeni bir istek var

      if (v.status === 'success' && v.enUcuz) {
        const u = v.enUcuz;
        sonuc.innerHTML = `
          <div class="sl-sonuc-kart">
            <div class="sl-sonuc-sol">
              <span class="sl-sonuc-rozet">✅ En ucuz stokta</span>
              <span class="sl-sonuc-site">${kac(u.magaza)}</span>
              <span class="sl-sonuc-fiyat">₺${tl(u.fiyat)}</span>
              <span class="sl-sonuc-urun">${kac(u.urunAdi)}</span>
              <span class="sl-sonuc-detay">
                Parça başı hammadde: <b>₺${tl(u.parcaBasiMaliyet)}</b>
                · 1 makara ile <b>${u.makaradanCikanAdet}</b> adet
                · ${u.stok ? '🟢 stokta' : '🔴 tükendi'}
              </span>
            </div>
            <a class="sl-sonuc-btn" href="${kac(u.yonlendirmeLinki || u.hamLink)}"
               target="_blank" rel="noopener sponsored">🛒 Mağazaya Git</a>
          </div>
          <p class="sl-sonuc-not">${kac(v.bildirimMetni)}</p>
          <p class="sl-sonuc-sure">⚡ ${ms} ms · ${Number(v.alternatifSayisi) || 0} alternatif mağaza</p>`;
        if (jsonKutu) {
          jsonKutu.textContent = JSON.stringify(v, null, 2);
          jsonKutu.hidden = false;
        }
      } else {
        sonuc.innerHTML = `
          <div class="sl-sonuc-kart sl-bos-kart">
            <div class="sl-sonuc-sol">
              <span class="sl-sonuc-rozet sl-rozet-uyari">⚠️ Bulunamadı</span>
              <span class="sl-sonuc-detay">${kac(v.bildirimMetni || v.hata || 'Uygun filament yok.')}</span>
              <span class="sl-sonuc-detay">Stokta bu malzeme yoksa fiyat <b>uydurulmaz</b> — dürüst davranış.</span>
            </div>
          </div>
          <p class="sl-sonuc-sure">⚡ ${ms} ms</p>`;
        if (jsonKutu) {
          jsonKutu.textContent = JSON.stringify(v, null, 2);
          jsonKutu.hidden = false;
        }
      }
    } catch (e) {
      if (benim !== istekNo) return;
      sonuc.innerHTML = `<span class="sl-hata">⚠️ Sorgu başarısız: ${kac(String(e?.message || e))}</span>`;
    }
  }

  malzeme.addEventListener('change', sorgula);
  gramaj.addEventListener('change', sorgula);
  renk.addEventListener('change', sorgula);

  // İlk yüklemede gerçek veriyi göster
  sorgula();
})();
