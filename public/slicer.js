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

  const ORTAM = (typeof window !== 'undefined' && window.BASKI_HESAP_ORTAM) || {};
  const ORTAM_DIL = ORTAM.dil || 'tr';
  const ORTAM_MARKET = ORTAM.market || 'tr';
  const ORTAM_PARA = ORTAM.currency || 'TRY';
  const ORTAM_YEREL = ORTAM.yerel || 'tr-TR';

  const SL_SZ = {
    tr: {
      gecersizGramaj: 'Geçerli bir gramaj girin.',
      sorguBekle: '⏳ Sorgulanıyor…',
      altBaslik: '📦 Diğer en ucuz stoklu seçenekler',
      parcaEtiket: 'parça', git: 'Git ↗', magazaFallback: 'Mağaza',
      enUcuzRozet: '✅ En ucuz stokta',
      parcaBasi: 'Parça başı hammadde:',
      makaradan: (gr, adet) => `${gr} g makaradan <b>${adet}</b> adet`,
      stokVar: '🟢 stokta', stokYok: '🔴 tükendi',
      magazayaGit: '🛒 Mağazaya Git', tumMagazalar: '📊 Tüm mağazalar', maliyetHesap: '🧮 Maliyet + kâr hesapla',
      altMagazaSayi: (ms, n) => `⚡ ${ms} ms · ${n} alternatif mağaza`,
      bulunamadi: '⚠️ Bulunamadı', uygunYok: 'Uygun filament yok.',
      durustYok: 'Stokta bu malzeme yoksa fiyat <b>uydurulmaz</b> — dürüst davranış.',
      sorguHata: (e) => `⚠️ Sorgu başarısız: ${e}`,
      gcodeGramajYok: (fn) => `⚠️ "${fn}" içinde filament gramajı bulunamadı; lütfen dilimleyici ayarlarından G-Code yorumlarını etkinleştirin.`,
      gcodeOkundu: (fn, gr, clr, mat, sr) => `✅ "${fn}" okundu: ${gr} g ${clr}${mat}${sr} (cihazınızdan yüklenmedi)`,
      gcodeHata: '⚠️ G-Code dosyası okunamadı.',
      jsonGoster: '{ } API JSON çıktısını göster', jsonGizle: '{ } JSON çıktısını gizle',
      kopyala: '📋 Kopyala', kopyalandi: '✅ Kopyalandı',
    },
    en: {
      gecersizGramaj: 'Enter a valid filament weight.',
      sorguBekle: '⏳ Querying…',
      altBaslik: '📦 Other lowest in-stock options',
      parcaEtiket: 'part', git: 'Go ↗', magazaFallback: 'Store',
      enUcuzRozet: '✅ Cheapest in stock',
      parcaBasi: 'Material cost per part:',
      makaradan: (gr, adet) => `<b>${adet}</b> parts per ${gr} g spool`,
      stokVar: '🟢 in stock', stokYok: '🔴 out of stock',
      magazayaGit: '🛒 Visit Store', tumMagazalar: '📊 All stores', maliyetHesap: '🧮 Cost & profit calc',
      altMagazaSayi: (ms, n) => `⚡ ${ms} ms · ${n} alternative stores`,
      bulunamadi: '⚠️ Not Found', uygunYok: 'No matching filament in stock.',
      durustYok: 'No synthetic price is shown when this material is out of stock.',
      sorguHata: (e) => `⚠️ Request failed: ${e}`,
      gcodeGramajYok: (fn) => `⚠️ No filament weight found in "${fn}"; enable slicer G-Code comments.`,
      gcodeOkundu: (fn, gr, clr, mat, sr) => `✅ "${fn}" parsed: ${gr} g ${clr}${mat}${sr} (processed locally)`,
      gcodeHata: '⚠️ Could not read G-Code file.',
      jsonGoster: '{ } Show API JSON output', jsonGizle: '{ } Hide API JSON output',
      kopyala: '📋 Copy', kopyalandi: '✅ Copied',
    },
    fr: {
      gecersizGramaj: 'Veuillez saisir un poids valide.',
      sorguBekle: '⏳ Recherche en cours…',
      altBaslik: '📦 Autres options en stock les moins chères',
      parcaEtiket: 'pièce', git: 'Voir ↗', magazaFallback: 'Boutique',
      enUcuzRozet: '✅ Moins cher en stock',
      parcaBasi: 'Coût matière par pièce :',
      makaradan: (gr, adet) => `<b>${adet}</b> pièces par bobine de ${gr} g`,
      stokVar: '🟢 en stock', stokYok: '🔴 rupture',
      magazayaGit: '🛒 Voir l’offre', tumMagazalar: '📊 Toutes les boutiques', maliyetHesap: '🧮 Calculateur coût + marge',
      altMagazaSayi: (ms, n) => `⚡ ${ms} ms · ${n} boutiques alternatives`,
      bulunamadi: '⚠️ Introuvable', uygunYok: 'Aucun filament en stock correspondant.',
      durustYok: 'Aucun prix fictif n’est affiché si le matériau est en rupture.',
      sorguHata: (e) => `⚠️ Échec de la requête : ${e}`,
      gcodeGramajYok: (fn) => `⚠️ Poids introuvable dans « ${fn} » ; activez les commentaires G-Code dans votre slicer.`,
      gcodeOkundu: (fn, gr, clr, mat, sr) => `✅ « ${fn} » analysé : ${gr} g ${clr}${mat}${sr} (traitement local)`,
      gcodeHata: '⚠️ Impossible de lire le fichier G-Code.',
      jsonGoster: '{ } Afficher la réponse JSON', jsonGizle: '{ } Masquer la réponse JSON',
      kopyala: '📋 Copier', kopyalandi: '✅ Copié',
    },
    ja: {
      gecersizGramaj: '有効な重量(g)を入力してください。',
      sorguBekle: '⏳ 照会中…',
      altBaslik: '📦 その他の在庫あり最安候補',
      parcaEtiket: '1個あたり', git: '開く ↗', magazaFallback: 'ストア',
      enUcuzRozet: '✅ 在庫あり最安値',
      parcaBasi: '1個あたりの材料費:',
      makaradan: (gr, adet) => `${gr} g スプールから <b>${adet}</b> 個出力可能`,
      stokVar: '🟢 在庫あり', stokYok: '🔴 在庫切れ',
      magazayaGit: '🛒 ショップへ', tumMagazalar: '📊 全ストアを見る', maliyetHesap: '🧮 原価＋利益を計算',
      altMagazaSayi: (ms, n) => `⚡ ${ms} ms · 他 ${n} 店舗`,
      bulunamadi: '⚠️ 見つかりません', uygunYok: '在庫のある該当フィラメントがありません。',
      durustYok: '在庫がない場合は架空の価格を表示しません。',
      sorguHata: (e) => `⚠️ 照会エラー: ${e}`,
      gcodeGramajYok: (fn) => `⚠️「${fn}」内にフィラメント重量が見つかりません。スライサーでG-Codeコメント出力を有効にしてください。`,
      gcodeOkundu: (fn, gr, clr, mat, sr) => `✅「${fn}」解析完了: ${gr} g ${clr}${mat}${sr}（ローカル処理）`,
      gcodeHata: '⚠️ G-Codeファイルを読み込めませんでした。',
      jsonGoster: '{ } API JSON出力を表示', jsonGizle: '{ } API JSON出力を隠す',
      kopyala: '📋 コピー', kopyalandi: '✅ コピー済み',
    },
  }[ORTAM_DIL] || {};

  let aktifSureDk = null;

  const tl = (n) => Number(n || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const fPara = (n) => (ORTAM_DIL === 'tr'
    ? ('₺' + tl(n))
    : (typeof window.formatPara === 'function'
      ? window.formatPara(n, ORTAM_PARA, ORTAM_YEREL)
      : Number(n || 0).toLocaleString(ORTAM_YEREL, { style: 'currency', currency: ORTAM_PARA })));

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
      sonuc.innerHTML = `<span class="sl-hata">${kac(SL_SZ.gecersizGramaj)}</span>`;
      return;
    }

    const benim = ++istekNo;
    sonuc.innerHTML = `<span class="sl-bekle">${kac(SL_SZ.sorguBekle)}</span>`;

    const qs = new URLSearchParams({
      malzeme: malzeme.value || 'PLA',
      gramaj: String(g),
      kaynak: 'web-demo',
    });
    const r = String(renk?.value || '').trim();
    if (r) qs.set('renk', r);
    if (aktifSureDk) qs.set('sureDk', String(aktifSureDk));
    if (ORTAM_MARKET !== 'tr') qs.set('market', ORTAM_MARKET);

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
            <div class="sl-alt-baslik">${SL_SZ.altBaslik}</div>
            <div class="sl-alt-liste">
              ${altlar.map((a) => `
                <div class="sl-alt-satir">
                  <span class="sl-alt-ad"><b>${kac(a.magaza || SL_SZ.magazaFallback)}</b> · ${kac(a.urunAdi)}</span>
                  <span class="sl-alt-fiyat">${kac(fPara(a.fiyat))} <small>(${SL_SZ.parcaEtiket} ${kac(fPara(a.parcaBasiMaliyet))})</small></span>
                  <a class="sl-alt-link" href="${kac(a.yonlendirmeLinki || a.hamLink)}" target="_blank" rel="noopener sponsored">${SL_SZ.git}</a>
                </div>
              `).join('')}
            </div>
          </div>` : '';

        sonuc.innerHTML = `
          <div class="sl-sonuc-kart">
            <div class="sl-sonuc-sol">
              <span class="sl-sonuc-rozet">${SL_SZ.enUcuzRozet}</span>
              <span class="sl-sonuc-site">${kac(u.magaza)}</span>
              <span class="sl-sonuc-fiyat">${kac(fPara(u.fiyat))} <small style="font-size:13px;font-weight:600">(${kac(fPara(u.tlKg))}/kg)</small></span>
              <span class="sl-sonuc-urun">${kac(u.urunAdi)}</span>
              <span class="sl-sonuc-detay">
                ${SL_SZ.parcaBasi} <b>${kac(fPara(u.parcaBasiMaliyet))}</b>
                · ${SL_SZ.makaradan(u.makaraGram || 1000, u.makaradanCikanAdet)}
                · ${u.stok ? SL_SZ.stokVar : SL_SZ.stokYok}
              </span>
            </div>
            <div class="sl-sonuc-aksiyonlar">
              <a class="sl-sonuc-btn" href="${kac(u.yonlendirmeLinki || u.hamLink)}"
                 target="_blank" rel="noopener sponsored">${SL_SZ.magazayaGit}</a>
              <div class="sl-sonuc-alt-btnler">
                ${u.karsilastirmaUrl ? `<a class="sl-mini-link" href="${kac(u.karsilastirmaUrl)}">${SL_SZ.tumMagazalar}</a>` : ''}
                ${v.maliyetUrl ? `<a class="sl-mini-link" href="${kac(v.maliyetUrl)}">${SL_SZ.maliyetHesap}</a>` : ''}
              </div>
            </div>
          </div>
          <p class="sl-sonuc-not">${kac(v.bildirimMetni)}</p>
          ${altHtml}
          <p class="sl-sonuc-sure">${SL_SZ.altMagazaSayi(ms, Number(v.alternatifSayisi) || 0)}</p>`;
      } else {
        sonuc.innerHTML = `
          <div class="sl-sonuc-kart sl-bos-kart">
            <div class="sl-sonuc-sol">
              <span class="sl-sonuc-rozet sl-rozet-uyari">${SL_SZ.bulunamadi}</span>
              <span class="sl-sonuc-detay">${kac(v.bildirimMetni || v.hata || SL_SZ.uygunYok)}</span>
              <span class="sl-sonuc-detay">${SL_SZ.durustYok}</span>
            </div>
          </div>
          <p class="sl-sonuc-sure">⚡ ${ms} ms</p>`;
      }
      if (jsonKutu) jsonKutu.textContent = JSON.stringify(v, null, 2);
      if (jsonBar) jsonBar.hidden = false;
    } catch (e) {
      if (benim !== istekNo) return;
      sonuc.innerHTML = `<span class="sl-hata">${SL_SZ.sorguHata(kac(String(e?.message || e)))}</span>`;
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
          gcodeOzet.textContent = SL_SZ.gcodeGramajYok(file.name);
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
        gcodeOzet.textContent = SL_SZ.gcodeOkundu(file.name, meta.gramaj, meta.renk ? meta.renk + ' ' : '', meta.malzeme || 'PLA', sureTxt);
      }
      sorgula();
    } catch {
      if (gcodeOzet) {
        gcodeOzet.hidden = false;
        gcodeOzet.className = 'sl-gcode-ozet uyari';
        gcodeOzet.textContent = SL_SZ.gcodeHata;
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
      jsonToggle.textContent = jsonKutu.hidden ? SL_SZ.jsonGoster : SL_SZ.jsonGizle;
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
    btn.textContent = SL_SZ.kopyala;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent || '');
        btn.textContent = SL_SZ.kopyalandi;
        setTimeout(() => { btn.textContent = SL_SZ.kopyala; }, 1500);
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
