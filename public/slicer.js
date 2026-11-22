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
  const jsonBar = $('slJsonBar');
  const jsonToggle = $('slJsonToggle');
  const dropAlani = $('slDropAlani');
  const gcodeInput = $('slGcodeInput');
  const gcodeOzet = $('slGcodeOzet');
  if (!malzeme || !sonuc) return;

  let aktifSureDk = null;

  const tl = (n) => Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const kac = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const RENK_ADLARI = {
    '000000': 'Siyah', ffffff: 'Beyaz', ff0000: 'Kırmızı', '00ff00': 'Yeşil',
    '0000ff': 'Mavi', ffff00: 'Sarı', ffa500: 'Turuncu', '800080': 'Mor',
    ffc0cb: 'Pembe', '808080': 'Gri', c0c0c0: 'Gümüş', a52a2a: 'Kahverengi',
  };

  function gcodeHexRenk(hex) {
    const k = String(hex || '').replace('#', '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(k)) return '';
    if (RENK_ADLARI[k]) return RENK_ADLARI[k];
    const h = [parseInt(k.slice(0, 2), 16), parseInt(k.slice(2, 4), 16), parseInt(k.slice(4, 6), 16)];
    let en = '';
    let minD = 1e9;
    for (const [kod, ad] of Object.entries(RENK_ADLARI)) {
      const r = [parseInt(kod.slice(0, 2), 16), parseInt(kod.slice(2, 4), 16), parseInt(kod.slice(4, 6), 16)];
      const d = (h[0] - r[0]) ** 2 + (h[1] - r[1]) ** 2 + (h[2] - r[2]) ** 2;
      if (d < minD) { minD = d; en = ad; }
    }
    return minD <= 3 * (45 ** 2) ? en : '';
  }

  function gcodeMetinAyr(metin) {
    const sayiTopla = (str) => {
      const nums = (String(str || '').match(/\d+(?:[.,]\d+)?/g) || [])
        .map((x) => parseFloat(x.replace(',', '.')))
        .filter((n) => Number.isFinite(n) && n > 0);
      return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    };
    let g = null;
    for (const re of [
      /;\s*total filament (?:used|weight) \[g\]\s*[:=]\s*([^\r\n]+)/gi,
      /;\s*filament used \[g\]\s*[:=]\s*([^\r\n]+)/gi,
      /;\s*filament_used_g\s*[:=]\s*([^\r\n]+)/gi,
    ]) {
      for (const m of metin.matchAll(re)) {
        const v = sayiTopla(m[1]);
        if (v && (g == null || v > g)) g = v;
      }
    }
    if (g == null) {
      for (const m of metin.matchAll(/;\s*filament used \[mm\]\s*[:=]\s*([^\r\n]+)/gi)) {
        const mm = sayiTopla(m[1]);
        if (mm) {
          const calc = Math.round((mm / 1000) * 2.98 * 100) / 100;
          if (g == null || calc > g) g = calc;
        }
      }
    }
    // Cura ;Filament used: 12.34m (başta bulunur)
    if (g == null) {
      const cm = metin.match(/;\s*Filament used:\s*([\d.,]+)\s*m\b/i);
      if (cm) {
        const mtr = parseFloat(cm[1].replace(',', '.'));
        if (Number.isFinite(mtr) && mtr > 0) g = Math.round(mtr * 2.98 * 100) / 100;
      }
    }

    let mat = '';
    const mm = metin.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
    if (mm) {
      const ilk = mm[1].trim().split(/[;,\s]+/)[0].replace(/[^A-Za-z0-9+\-]/g, '').toUpperCase();
      if (ilk) mat = ilk;
    }

    let clr = '';
    const rm = metin.match(/;\s*filament_colou?r\s*=\s*(#[0-9a-f]{6})/i);
    if (rm) clr = gcodeHexRenk(rm[1]);

    let sureDk = null;
    const tm = metin.match(/;\s*estimated printing time[^:=\r\n]*[:=]\s*([^\r\n]+)/i);
    if (tm) {
      const s = tm[1];
      const d = s.match(/(\d+)\s*d/i);
      const h = s.match(/(\d+)\s*h/i);
      const m = s.match(/(\d+)\s*m\b/i);
      const top = (d ? +d[1] * 1440 : 0) + (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
      if (top > 0) sureDk = top;
    } else {
      const ct = metin.match(/;\s*TIME:\s*(\d+)/i);
      if (ct && Number(ct[1]) > 0) sureDk = Math.round(Number(ct[1]) / 60);
    }

    return { gramaj: g, malzeme: mat, renk: clr, sureDk };
  }

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
    if (aktifSureDk) qs.set('sureDk', String(aktifSureDk));

    try {
      const t0 = performance.now();
      const res = await fetch('/api/embed/oner?' + qs.toString());
      const ms = Math.round(performance.now() - t0);
      const v = await res.json();
      if (benim !== istekNo) return; // daha yeni bir istek var

      if (v.status === 'success' && v.enUcuz) {
        const u = v.enUcuz;
        const altlar = Array.isArray(v.enIyiAlternatifler) ? v.enIyiAlternatifler.slice(1, 4) : [];
        const altHtml = altlar.length ? `
          <div class="sl-alt-kutu">
            <div class="sl-alt-baslik">📦 Diğer en ucuz stoklu seçenekler</div>
            <div class="sl-alt-liste">
              ${altlar.map((a) => `
                <div class="sl-alt-satir">
                  <span class="sl-alt-ad"><b>${kac(a.magaza || 'Mağaza')}</b> · ${kac(a.urunAdi)}</span>
                  <span class="sl-alt-fiyat">₺${tl(a.fiyat)} <small>(parça ₺${tl(a.parcaBasiMaliyet)})</small></span>
                  <a class="sl-alt-link" href="${kac(a.yonlendirmeLinki || a.hamLink)}" target="_blank" rel="noopener sponsored">Git ↗</a>
                </div>
              `).join('')}
            </div>
          </div>` : '';

        sonuc.innerHTML = `
          <div class="sl-sonuc-kart">
            <div class="sl-sonuc-sol">
              <span class="sl-sonuc-rozet">✅ En ucuz stokta</span>
              <span class="sl-sonuc-site">${kac(u.magaza)}</span>
              <span class="sl-sonuc-fiyat">₺${tl(u.fiyat)} <small style="font-size:13px;font-weight:600">(₺${tl(u.tlKg)}/kg)</small></span>
              <span class="sl-sonuc-urun">${kac(u.urunAdi)}</span>
              <span class="sl-sonuc-detay">
                Parça başı hammadde: <b>₺${tl(u.parcaBasiMaliyet)}</b>
                · ${u.makaraGram || 1000} g makaradan <b>${u.makaradanCikanAdet}</b> adet
                · ${u.stok ? '🟢 stokta' : '🔴 tükendi'}
              </span>
            </div>
            <div class="sl-sonuc-aksiyonlar">
              <a class="sl-sonuc-btn" href="${kac(u.yonlendirmeLinki || u.hamLink)}"
                 target="_blank" rel="noopener sponsored">🛒 Mağazaya Git</a>
              <div class="sl-sonuc-alt-btnler">
                ${u.karsilastirmaUrl ? `<a class="sl-mini-link" href="${kac(u.karsilastirmaUrl)}">📊 Tüm mağazalar</a>` : ''}
                ${v.maliyetUrl ? `<a class="sl-mini-link" href="${kac(v.maliyetUrl)}">🧮 Maliyet + kâr hesapla</a>` : ''}
              </div>
            </div>
          </div>
          <p class="sl-sonuc-not">${kac(v.bildirimMetni)}</p>
          ${altHtml}
          <p class="sl-sonuc-sure">⚡ ${ms} ms · ${Number(v.alternatifSayisi) || 0} alternatif mağaza</p>`;
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
      }
      if (jsonKutu) jsonKutu.textContent = JSON.stringify(v, null, 2);
      if (jsonBar) jsonBar.hidden = false;
    } catch (e) {
      if (benim !== istekNo) return;
      sonuc.innerHTML = `<span class="sl-hata">⚠️ Sorgu başarısız: ${kac(String(e?.message || e))}</span>`;
    }
  }

  async function gcodeDosyaOku(file) {
    if (!file) return;
    try {
      // Büyük G-Code dosyalarında bile tüm dosyayı değil yalnızca ilk 8 KB + son 32 KB okunur
      const bas = await file.slice(0, 8192).text();
      const son = file.size > 8192 ? await file.slice(Math.max(0, file.size - 32768)).text() : '';
      const meta = gcodeMetinAyr(bas + '\n' + son);
      if (!meta.gramaj) {
        if (gcodeOzet) {
          gcodeOzet.hidden = false;
          gcodeOzet.className = 'sl-gcode-ozet uyari';
          gcodeOzet.textContent = `⚠️ "${file.name}" içinde filament gramajı bulunamadı; lütfen dilimleyici ayarlarından G-Code yorumlarını etkinleştirin.`;
        }
        return;
      }
      if (gramaj) gramaj.value = String(Math.round(meta.gramaj));
      if (meta.malzeme && malzeme) {
        const eslesen = [...malzeme.options].find((o) => o.value.toUpperCase() === meta.malzeme
          || (meta.malzeme.startsWith('PLA') && !meta.malzeme.includes('CF') && o.value === 'PLA'));
        if (eslesen) malzeme.value = eslesen.value;
      }
      if (renk) renk.value = meta.renk || '';
      aktifSureDk = meta.sureDk || null;
      if (gcodeOzet) {
        gcodeOzet.hidden = false;
        gcodeOzet.className = 'sl-gcode-ozet';
        const sureTxt = meta.sureDk
          ? ` · ⏱️ ${Math.floor(meta.sureDk / 60)} sa ${meta.sureDk % 60} dk`
          : '';
        gcodeOzet.textContent = `✅ "${file.name}" okundu: ${meta.gramaj} g ${meta.renk ? meta.renk + ' ' : ''}${meta.malzeme || 'PLA'}${sureTxt} (cihazınızdan yüklenmedi)`;
      }
      sorgula();
    } catch {
      if (gcodeOzet) {
        gcodeOzet.hidden = false;
        gcodeOzet.className = 'sl-gcode-ozet uyari';
        gcodeOzet.textContent = '⚠️ G-Code dosyası okunamadı.';
      }
    }
  }

  if (dropAlani && gcodeInput) {
    dropAlani.addEventListener('click', () => gcodeInput.click());
    dropAlani.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gcodeInput.click(); }
    });
    dropAlani.addEventListener('dragover', (e) => { e.preventDefault(); dropAlani.classList.add('uzerinde'); });
    dropAlani.addEventListener('dragleave', () => dropAlani.classList.remove('uzerinde'));
    dropAlani.addEventListener('drop', (e) => {
      e.preventDefault();
      dropAlani.classList.remove('uzerinde');
      const f = e.dataTransfer?.files?.[0];
      if (f) gcodeDosyaOku(f);
    });
    gcodeInput.addEventListener('change', () => {
      const f = gcodeInput.files?.[0];
      if (f) gcodeDosyaOku(f);
    });
  }

  if (jsonToggle && jsonKutu) {
    jsonToggle.addEventListener('click', () => {
      jsonKutu.hidden = !jsonKutu.hidden;
      jsonToggle.textContent = jsonKutu.hidden ? '{ } API JSON çıktısını göster' : '{ } JSON çıktısını gizle';
    });
  }

  // Tüm kod bloklarına tek tıkla "Kopyala" düğmesi ekle
  document.querySelectorAll('pre.sl-kod').forEach((pre) => {
    const sar = document.createElement('div');
    sar.className = 'sl-kod-sar';
    pre.parentNode.insertBefore(sar, pre);
    sar.appendChild(pre);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sl-kopyala-btn';
    btn.textContent = '📋 Kopyala';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent || '');
        btn.textContent = '✅ Kopyalandı';
        setTimeout(() => { btn.textContent = '📋 Kopyala'; }, 1500);
      } catch { /* yoksay */ }
    });
    sar.appendChild(btn);
  });

  malzeme.addEventListener('change', sorgula);
  gramaj.addEventListener('change', sorgula);
  renk.addEventListener('change', sorgula);

  // İlk yüklemede gerçek veriyi göster
  sorgula();
})();
