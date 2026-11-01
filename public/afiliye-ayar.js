/* Satış ortaklığı (affiliate) ayar paneli — 2026-10-28
 *
 * Fiyat tarafsızlığı: bu panel yalnızca dışa giden bağlantı referansını yönetir.
 * Fiyat, sıralama ve "en ucuz" hesabı buradan etkilenmez.
 *
 * Dürüstlük: parametre adı + değer (token) girilmedikçe bağlantıya HİÇBİR ŞEY eklenmez.
 * Panel bunu "yapılandırma bekliyor" olarak açıkça gösterir.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Panelin yerel durumu (site şablonları kaydetmede tam gönderilmeli). */
  const durum = { etkin: true, aglar: {}, siteSablon: {}, siteSablonlari: [], tiklamalar: null };

  function mesajla(el, metin, ok = true) {
    if (!el) return;
    el.className = 'durum-mesaji ' + (ok ? 'ok' : 'hata');
    el.textContent = metin;
  }

  function rozet(ag) {
    if (!ag.etkin) return '<span class="rozet" style="background:#f1f3f7;color:#7a8291">kapalı</span>';
    if (ag.hazir) return '<span class="rozet" style="background:#e8f7ee;color:#1f7a45">hazır</span>';
    return '<span class="rozet" style="background:#fff5e5;color:#a86a12">yapılandırma bekliyor</span>';
  }

  function agSatiri(ag) {
    return `<div class="afiliye-ag" data-ag="${esc(ag.id)}" style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <label style="font-weight:600;display:flex;align-items:center;gap:8px;margin:0">
          <input type="checkbox" class="af-etkin" style="width:auto" ${ag.etkin ? 'checked' : ''} />
          ${esc(ag.ad)}
        </label>
        ${rozet(ag)}
        <span class="alt-not" style="margin-left:auto">komisyon: ${esc(ag.komisyon)}</span>
      </div>
      <div class="form-satir">
        <div class="ikili">
          <div>
            <label>Parametre adı</label>
            <input type="text" class="af-parametre" value="${esc(ag.parametre || '')}"
              placeholder="${esc(ag.parametreIpucu || 'panelden alınan parametre adı')}" autocomplete="off" />
          </div>
          <div>
            <label>Değer / token</label>
            <input type="text" class="af-token" value=""
              placeholder="${ag.tokenVar ? esc(ag.tokenMaskeli) + ' (kayıtlı — değiştirmek için yazın)' : 'panelden alınan değer'}" autocomplete="off" />
          </div>
        </div>
      </div>
      <div style="margin-top:8px">
        <label>Yönlendirme şablonu (isteğe bağlı — aracı ağlar için)</label>
        <input type="text" class="af-sablon" value="" placeholder="${ag.sablonVar ? 'kayıtlı şablon var — değiştirmek için yazın' : 'https://ag.example.com/git?u={url}&ref={token}'}" autocomplete="off" />
      </div>
      <div style="margin-top:8px">
        <label>Hedef parametresi (isteğe bağlı — şablonda <code>{url}</code> yoksa)</label>
        <input type="text" class="af-hedef" value="${esc(ag.hedefParametre || '')}"
          placeholder="ör. url — boş bırakılabilir" autocomplete="off" />
      </div>
      <p class="alt-not" style="margin:8px 0 0;font-size:12px">
        ${ag.id === 'amazon' ? 'Amazon Associates: parametre adı <code>tag</code>, değer ör. <code>siteadi-21</code>.' :
          ag.id === 'gelirortaklari' || ag.id === 'reklamaction'
            ? 'Aracı ağ: size verilen yönlendirme adresini şablon alanına yapıştırın; ayrıca aşağıdan mağaza bazlı şablon ekleyebilirsiniz.'
            : 'Parametre adını ve değerini kendi ortaklık panelinizden kopyalayın (uydurulmuş değer yazılmaz).'}
      </p>
    </div>`;
  }

  function sablonlariCiz() {
    const kutu = $('#afiliyeSablonListesi');
    if (!kutu) return;
    const girisler = Object.entries(durum.siteSablon || {});
    if (!girisler.length) {
      kutu.innerHTML = '<p class="alt-not" style="margin:0">Mağaza bazlı şablon yok.</p>';
      return;
    }
    // Dürüst etiket: {url} yoksa bağlantı ağın TEKLİF sayfasına gider (ürün sayfasına değil).
    const tipEtiketi = (v) => {
      const sablon = typeof v === 'string' ? v : (v?.sablon || '');
      const hedef = typeof v === 'object' && v ? (v.hedefParametre || '') : '';
      if (sablon.includes('{url}')) return '<span class="rozet" style="background:#e8f7ee;color:#1f7a45">ürün bazlı</span>';
      if (hedef) return `<span class="rozet" style="background:#eef2ff;color:#3b4a8f">${esc(hedef)} parametresi</span>`;
      return '<span class="rozet" style="background:#fff5e5;color:#a86a12">teklif linki</span>';
    };
    kutu.innerHTML = girisler.map(([site, v]) => {
      const sablon = typeof v === 'string' ? v : (v?.sablon || '');
      const bilgi = (durum.siteSablonlari || []).find(x => x.site === site);
      // Adaptör yoksa şablon hiç uygulanmaz — sessiz kalmasın (2026-10-29).
      const kayitsiz = bilgi && bilgi.siteKayitli === false;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eef1f6;flex-wrap:wrap">
        <b style="min-width:130px">${esc(site)}</b>
        ${tipEtiketi(v)}
        ${kayitsiz ? '<span class="rozet" style="background:#fdecec;color:#c0392b" title="Bu kimlikle kayıtlı site yok; site eklendiğinde şablon çalışır">site kayıtlı değil</span>' : ''}
        <code style="flex:1;min-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc(sablon)}</code>
        <button type="button" class="ikincil-btn af-sablon-sil" data-site="${esc(site)}" style="padding:2px 10px">sil</button>
      </div>`;
    }).join('');
    kutu.querySelectorAll('.af-sablon-sil').forEach((b) => {
      b.addEventListener('click', () => { delete durum.siteSablon[b.dataset.site]; sablonlariCiz(); });
    });
  }

  function tiklamalariCiz(t) {
    const el = $('#afiliyeTiklamalar');
    if (!el || !t) return;
    const satirlar = Object.entries(t.siteler || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    el.innerHTML = t.toplamTiklama
      ? `📊 Son ${t.gunSayisi} günde <b>${t.toplamTiklama}</b> mağaza tıklaması: ` +
        satirlar.map(([s, n]) => `${esc(s)} <b>${n}</b>`).join(' · ')
      : '📊 Henüz mağaza tıklaması kaydedilmedi (sayaç yalnızca yerel tutulur, kişisel veri yok).';
  }

  async function yukle() {
    const panel = $('#afiliyePaneli');
    try {
      const res = await fetch('/api/afiliye');
      const d = await res.json();
      if (!res.ok) throw new Error(d.hata || 'Durum okunamadı');

      durum.etkin = d.etkin !== false;
      durum.siteSablon = { ...(d.siteSablon || {}) };
      durum.siteSablonlari = d.siteSablonlari || [];
      const etkin = $('#afiliyeEtkin');
      if (etkin) etkin.checked = durum.etkin;

      durum.aglar = {};
      for (const ag of d.aglar || []) durum.aglar[ag.id] = ag;

      panel.innerHTML = (d.aglar || []).map(agSatiri).join('') +
        `<p class="alt-not" style="margin:6px 0 0;font-size:12px">
          Durum: <b>${esc(d.durum)}</b>${d.eksikYapilandirma?.length
            ? ' — eksik: ' + d.eksikYapilandirma.map(esc).join(', ')
            : ''}. ${esc(d.bilgi || '')}
        </p>`;

      tiklamalariCiz(d.tiklamalar);
      sablonlariCiz();
    } catch (e) {
      panel.innerHTML = `<p class="alt-not">Ayarlar yüklenemedi: ${esc(e.message)}</p>`;
    }
  }

  function formuTopla() {
    const aglar = {};
    document.querySelectorAll('.afiliye-ag').forEach((kutu) => {
      const id = kutu.dataset.ag;
      const token = kutu.querySelector('.af-token')?.value.trim() || '';
      const sablon = kutu.querySelector('.af-sablon')?.value.trim() || '';
      const hedefParametre = kutu.querySelector('.af-hedef')?.value.trim() || '';
      aglar[id] = {
        etkin: !!kutu.querySelector('.af-etkin')?.checked,
        parametre: kutu.querySelector('.af-parametre')?.value.trim() || '',
        // Boş bırakılan token = mevcut kayıt korunur (sunucu birleştirir)
        ...(token ? { token } : {}),
        ...(sablon ? { sablon } : {}),
        ...(hedefParametre ? { hedefParametre } : {}),
      };
    });
    // Site şablonları: nesne biçiminde gönderilir ({sablon, hedefParametre, token})
    return { etkin: !!$('#afiliyeEtkin')?.checked, aglar, siteSablon: durum.siteSablon };
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('#afiliyePaneli')) return;
    yukle();

    $('#afiliyeKaydetBtn')?.addEventListener('click', async () => {
      const el = $('#afiliyeMesaj');
      mesajla(el, 'Kaydediliyor…');
      try {
        const res = await fetch('/api/afiliye', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formuTopla()),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.hata || 'Kaydedilemedi');
        mesajla(el, `Kaydedildi · durum: ${d.durum}` +
          (d.eksikYapilandirma?.length ? ` (eksik: ${d.eksikYapilandirma.join(', ')})` : ''));
        await yukle();
      } catch (e) {
        mesajla(el, 'Hata: ' + e.message, false);
      }
    });

    $('#afiliyeSablonEkleBtn')?.addEventListener('click', () => {
      const el = $('#afiliyeSablonMesaj');
      const site = ($('#afiliyeSite')?.value || '').trim().toLowerCase();
      const sablon = ($('#afiliyeSablon')?.value || '').trim();
      const hedefParametre = ($('#afiliyeHedefParametre')?.value || '').trim();

      if (!/^[a-z0-9_-]{2,40}$/.test(site)) {
        return mesajla(el, 'Site kimliği geçersiz (ör. 3dmarketim, flo).', false);
      }
      // Şablon geçerli bir adres olmalı; {url} ZORUNLU DEĞİL (2026-10-29).
      // Ağların "teklif" (offer) linkleri ürün adresi almaz — bu geçerli bir kullanımdır.
      let gecerliUrl = false;
      try { gecerliUrl = /^https?:\/\//i.test(new URL(sablon.replace(/\{token\}/g, 'x')).href) && /^https?:\/\//i.test(sablon); } catch { gecerliUrl = false; }
      if (!gecerliUrl) {
        return mesajla(el, 'Şablon https:// ile başlayan geçerli bir adres olmalı.', false);
      }

      durum.siteSablon[site] = { sablon, hedefParametre, token: '' };
      $('#afiliyeSite').value = '';
      $('#afiliyeSablon').value = '';
      if ($('#afiliyeHedefParametre')) $('#afiliyeHedefParametre').value = '';
      sablonlariCiz();

      const ipucu = sablon.includes('{url}')
        ? 'Ürün bazlı bağlantı kuruldu.'
        : (hedefParametre
          ? `Ürün adresi "${hedefParametre}" parametresine eklenecek.`
          : 'Şablon {url} içermiyor: bağlantı ağın TEKLİF sayfasına gider (tüm mağaza için tek teklif).');
      mesajla(el, `Eklendi — ${ipucu} Kaydetmeyi unutmayın.`);
    });
  });
})();
