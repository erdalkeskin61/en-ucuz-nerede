/* ============================================================================
 * Barkod tarayıcı + görsel ürün arama (2026-10-28, PWA)
 * ========================================================================== */

/* ------------------------- sayı okuma (Türkçe biçim) ------------------------ */

/**
 * Kullanıcının yazdığı fiyatı TL'ye çevirir (2026-10-28).
 *
 * NEDEN GEREKLİ: alan `type="number"` iken tarayıcı Türkçe yazımı bozuyordu:
 *   "4.500"    → 4,5 TL  (binlik nokta ondalık sanılıyordu — sessizce yanlış fiyat)
 *   "4500,50"  → alan BOŞALIYOR → raf fiyatı kayboluyor → tasarruf kartı çıkmıyor
 * Bu yüzden alanlar `type="text"` + `inputmode="decimal"` oldu ve ayrıştırma burada.
 *
 * Kabul edilen biçimler: "4299", "4.299", "4.299,90", "4299,90", "4299.90",
 * "4,299.90", "4299 TL", "₺4299", " 4.299,90 ".
 *
 * Belirsizlik kuralı: yalnızca nokta varsa ve nokta sonrası TAM 3 hane ise binlik
 * ayırıcı sayılır ("4.500" → 4500). "4299.90" (2 hane) ondalıktır.
 *
 * @param {string|number|null|undefined} deger
 * @returns {number|null} geçerli pozitif fiyat ya da null
 */
function rafFiyatOku(deger) {
  if (deger == null) return null;
  let s = String(deger).trim();
  if (!s) return null;
  // Para birimi ve boşlukları at
  s = s.replace(/(?:tl|try|₺)/gi, '').replace(/\s+/g, '');
  // Yalnızca rakam, nokta, virgül ve eksi kalsın
  s = s.replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;

  const noktaVar = s.includes('.');
  const virgulVar = s.includes(',');

  if (noktaVar && virgulVar) {
    // Son görülen ayırıcı ondalıktır; diğeri binliktir.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // 4.299,90
    } else {
      s = s.replace(/,/g, '');                     // 4,299.90
    }
  } else if (virgulVar) {
    // Virgül: birden fazla ise binlik, tek ise ondalık
    const parca = s.split(',');
    s = parca.length > 2 ? s.replace(/,/g, '') : parca.join('.');
  } else if (noktaVar) {
    const parca = s.split('.');
    if (parca.length > 2) {
      s = s.replace(/\./g, '');                     // 1.500.000
    } else if (parca[1].length === 3 && parca[0].length <= 3 && parca[0].length >= 1) {
      s = parca.join('');                           // 4.500 → 4500 (binlik)
    }
    // aksi hâlde nokta ondalıktır: 4299.90
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100000000) return null;
  return Math.round(n * 100) / 100;
}

/** Input alanından raf fiyatını okur (Türkçe biçim destekli). */
function rafFiyatAl(id) {
  const el = document.getElementById(id);
  return el ? rafFiyatOku(el.value) : null;
}

/* ------------------------------ sekme geçişi -------------------------------- */

function tarayiciSekmeSec(ad) {
  document.querySelectorAll('.tarayici-sekme').forEach(b => {
    b.classList.toggle('aktif', b.dataset.tarayiciSekme === ad);
  });
  const paneller = {
    barkod: document.getElementById('barkodKameraAlani'),
    gorsel: document.getElementById('gorselPanel'),
    elle: document.getElementById('ellePanel'),
  };
  for (const [k, el] of Object.entries(paneller)) {
    if (el) el.hidden = k !== ad;
  }
  if (ad !== 'barkod') barkodKameraDurdur();
}

document.querySelectorAll('.tarayici-sekme').forEach(btn => {
  btn.addEventListener('click', () => tarayiciSekmeSec(btn.dataset.tarayiciSekme));
});

/* ---------------------------- barkod: kamera -------------------------------- */

let barkodTarayici = null;
let barkodKameraAcik = false;

function barkodHataGoster(mesaj) {
  const el = document.getElementById('tarayiciHata');
  if (!el) return;
  el.textContent = mesaj;
  el.hidden = !mesaj;
}

function barkodKameraDurdur() {
  if (barkodTarayici && barkodKameraAcik) {
    try { barkodTarayici.stop().catch(() => {}); } catch { }
  }
  barkodKameraAcik = false;
  const durdur = document.getElementById('kameraDurdurBtn');
  const baslat = document.getElementById('kameraBaslatBtn');
  if (durdur) durdur.hidden = true;
  if (baslat) baslat.hidden = false;
}

async function barkodKameraBaslat() {
  barkodHataGoster('');
  const not = document.getElementById('barkodKameraNot');

  if (typeof Html5Qrcode === 'undefined') {
    barkodHataGoster('Barkod okuyucu kütüphanesi yüklenemedi. Barkodu elle yazabilirsin.');
    return;
  }
  // Kamera yalnızca güvenli bağlamda açılır (https / localhost). LAN IP + http → çalışmaz.
  const guvenli = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!guvenli) {
    barkodHataGoster('Kamera yalnızca HTTPS ya da localhost üzerinden açılabilir. '
      + 'Aynı ağdan telefonda kullanmak için HTTPS gerekir; şimdilik barkodu elle yazabilirsin.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    barkodHataGoster('Bu tarayıcı kamera erişimini desteklemiyor. Barkodu elle yazabilirsin.');
    return;
  }

  const baslat = document.getElementById('kameraBaslatBtn');
  const durdur = document.getElementById('kameraDurdurBtn');
  baslat.disabled = true;
  if (not) not.textContent = 'Kamera açılıyor…';

  try {
    if (!barkodTarayici) {
      barkodTarayici = new Html5Qrcode('barkodOkuyucu', { verbose: false });
    }
    await barkodTarayici.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.7 },
      (kodMetni) => {
        // Okundu → kamerayı kapat, aramayı başlat
        barkodKameraDurdur();
        const temiz = String(kodMetni || '').replace(/\D/g, '');
        if (temiz.length >= 8) {
          // Raf fiyatı AÇIKÇA geçirilir (2026-10-28): daha önce yalnızca fonksiyon
          // içindeki yedek okumaya güveniliyordu. Açık parametre, alan kimliği
          // değişse ya da değer bu arada temizlense bile tasarruf hesabını korur.
          barkodAraBaslat(temiz, rafFiyatAl('rafFiyatBarkod'));
        }
      },
      () => { /* kare hatası: sessizce devam (normal) */ },
    );
    barkodKameraAcik = true;
    baslat.hidden = true;
    durdur.hidden = false;
    if (not) not.textContent = 'Barkodu çerçeveye hizala…';
  } catch (e) {
    barkodHataGoster('Kamera açılamadı: ' + (e?.message || e) + ' — barkodu elle yazabilirsin.');
    if (not) not.textContent = '';
  } finally {
    baslat.disabled = false;
  }
}

const kameraBaslat = document.getElementById('kameraBaslatBtn');
if (kameraBaslat) kameraBaslat.addEventListener('click', barkodKameraBaslat);
const kameraDurdur = document.getElementById('kameraDurdurBtn');
if (kameraDurdur) kameraDurdur.addEventListener('click', barkodKameraDurdur);

/* ------------------------- barkod: elle giriş ------------------------------- */

const barkodAraBtn = document.getElementById('barkodAraBtn');
if (barkodAraBtn) {
  barkodAraBtn.addEventListener('click', () => {
    const kod = (document.getElementById('barkodElle').value || '').replace(/\D/g, '');
    if (kod.length < 8) return barkodHataGoster('Barkod en az 8 haneli olmalı.');
    // Raf fiyatı yazıldı ama okunamadıysa sessizce yutma (2026-10-28).
    const rafHam = (document.getElementById('rafFiyatElle')?.value || '').trim();
    const raf = rafFiyatOku(rafHam);
    if (rafHam && raf == null) {
      return barkodHataGoster('Raf fiyatı okunamadı. "4299" ya da "4.299,90" gibi yaz.');
    }
    barkodHataGoster('');
    barkodAraBaslat(kod, raf);
  });
}
const barkodElle = document.getElementById('barkodElle');
if (barkodElle) {
  barkodElle.addEventListener('keydown', (e) => { if (e.key === 'Enter') barkodAraBtn?.click(); });
}

/* --------------------------- barkod: arama akışı ---------------------------- */

let barkodAktifIs = null;

async function barkodAraBaslat(barkod, rafFiyat = null) {
  const raf = rafFiyat ?? rafFiyatAl('rafFiyatBarkod');
  barkodHataGoster('');
  document.getElementById('barkodSonuc').hidden = true;
  document.getElementById('barkodDurum').hidden = false;
  document.getElementById('barkodDurumBaslik').textContent = `Barkod ${barkod} aranıyor…`;
  document.getElementById('barkodDurumNotu').textContent = 'Sitelerde aranıyor…';
  document.getElementById('barkodIptalBtn').hidden = false;

  try {
    const res = await fetch('/api/barkod', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barkod, rafFiyat: raf }),
    });
    const data = await guvenliJson(res);
    if (!res.ok) throw new Error(data.hata || 'Barkod araması başlatılamadı');
    barkodAktifIs = data.isId;
    barkodPoll(data.isId, barkod, raf);
  } catch (e) {
    document.getElementById('barkodDurum').hidden = true;
    barkodHataGoster(e.message);
  }
}

function barkodPoll(id, barkod, rafFiyat) {
  const timer = setInterval(async () => {
    try {
      const j = await guvenliJson(await fetch('/api/barkod/' + id));
      const p = j.progress || {};
      if (j.status === 'running') {
        document.getElementById('barkodDurumNotu').textContent =
          `${p.biten || 0}/${p.toplam || 0} site · ${p.not || 'aranıyor…'}`;
        return;
      }
      clearInterval(timer);
      document.getElementById('barkodDurum').hidden = true;
      document.getElementById('barkodIptalBtn').hidden = true;
      if (j.status === 'error') return barkodHataGoster(j.error || 'Barkod araması başarısız');
      if (!j.result) return barkodHataGoster('Barkod sonucu alınamadı.');
      barkodSonucGoster(j.result, rafFiyat);
    } catch (e) {
      clearInterval(timer);
      document.getElementById('barkodDurum').hidden = true;
      barkodHataGoster(e.message);
    }
  }, 900);
}

const barkodIptalBtn = document.getElementById('barkodIptalBtn');
if (barkodIptalBtn) {
  barkodIptalBtn.addEventListener('click', async () => {
    if (!barkodAktifIs) return;
    try { await fetch('/api/barkod/' + barkodAktifIs + '/iptal', { method: 'POST' }); } catch { }
  });
}

/** Raf fiyatıyla karşılaştırma metni (istemci tarafı, sunucuya gitmeden). */
function tasarrufMetni(internetFiyat, rafFiyat) {
  const i = Number(internetFiyat);
  const r = Number(rafFiyat);
  if (!isFinite(i) || !isFinite(r) || i <= 0 || r <= 0) return null;
  const fark = Math.round((r - i) * 100) / 100;
  const yuzde = (Math.round((fark / r) * 1000) / 10).toFixed(1).replace('.', ',');
  if (fark > 0) return { tur: 'iyi', metin: `${tl(fark)} (%${yuzde} daha ucuz)` };
  if (fark === 0) return { tur: 'notr', metin: 'Fiyatlar aynı' };
  return { tur: 'kotu', metin: `Raf fiyatı ${tl(Math.abs(fark))} daha ucuz` };
}

function barkodSonucGoster(r, rafFiyat) {
  const alan = document.getElementById('barkodSonuc');
  const ozet = document.getElementById('barkodOzet');
  const kartlar = document.getElementById('barkodKartlar');
  alan.hidden = false;

  const bulunanlar = (r.sonuclar || []).filter(s => s.status === 'found' && s.product);
  const o = r.ozet || {};

  if (!bulunanlar.length) {
    ozet.innerHTML = `<div class="barkod-bos">
      <div class="barkod-bos-baslik">Bu barkod hiçbir sitede bulunamadı</div>
      <p class="ipucu">Barkod: <b>${esc(r.barkod)}</b> · ${o.tarananSite || 0} site tarandı.
      Barkodun doğru okunduğundan emin ol (kutunun arkasındaki 13 haneli numara).</p></div>`;
    kartlar.innerHTML = '';
    return;
  }

  const tasarruf = rafFiyat ? tasarrufMetni(o.enUcuzFiyat, rafFiyat) : null;

  ozet.innerHTML = `
    ${r.urun ? `<div class="barkod-urun">${esc(r.urun)}${r.marka ? ` <span class="rozet-kucuk">${esc(r.marka)}</span>` : ''}</div>` : ''}
    <div class="barkod-kutu-izgara">
      ${rafFiyat ? `<div class="barkod-kutu">
        <div class="barkod-kutu-etiket">📱 Mağaza raf fiyatı</div>
        <div class="barkod-kutu-fiyat">${tl(rafFiyat)}</div>
      </div>` : ''}
      <div class="barkod-kutu vurgulu">
        <div class="barkod-kutu-etiket">🌐 İnternette en ucuz</div>
        <div class="barkod-kutu-fiyat">${tl(o.enUcuzFiyat)}</div>
        <div class="barkod-kutu-alt">${esc(o.enUcuzSite || '')}${o.enUcuzSatici ? ' · ' + esc(o.enUcuzSatici) : ''}</div>
      </div>
      ${tasarruf ? `<div class="barkod-kutu ${tasarruf.tur}">
        <div class="barkod-kutu-etiket">${tasarruf.tur === 'iyi' ? '💰 Tasarruf' : tasarruf.tur === 'kotu' ? '📱 Raf avantajı' : '⚖️ Sonuç'}</div>
        <div class="barkod-kutu-fiyat">${esc(tasarruf.metin)}</div>
      </div>` : ''}
    </div>
    <div class="ipucu">${bulunanlar.length} sitede bulundu · ${o.tarananSite} site tarandı · ${((o.toplamSureMs || 0) / 1000).toFixed(1)} sn
    ${r.barkodGecerli === false ? ' · ⚠️ barkod kontrol hanesi geçersiz (elle yanlış girilmiş olabilir)' : ''}</div>`;

  kartlar.innerHTML = bulunanlar
    .sort((a, b) => (a.product.pricing?.toplam ?? Infinity) - (b.product.pricing?.toplam ?? Infinity))
    .map(s => {
      const pr = s.product.pricing || {};
      const kargo = pr.kargo || {};
      return `<div class="barkod-kart ${s.enUcuz ? 'en-ucuz' : ''}">
        <div class="barkod-kart-ust">
          <b>${esc(s.siteName)}</b>
          ${s.enUcuz ? '<span class="rozet-kucuk">en ucuz</span>' : ''}
          ${s.barkodDogrulandi ? '<span class="rozet-kucuk dogrulandi">✓ barkod doğrulandı</span>' : ''}
        </div>
        <a class="barkod-kart-baslik" href="${esc(s.product.url)}" target="_blank" rel="noopener">${esc(String(s.product.title).slice(0, 90))}</a>
        <div class="barkod-kart-fiyat">${tl(pr.toplam ?? s.product.sellingPrice)}</div>
        <div class="barkod-kart-alt">
          ${kargo.uygulanir === true ? `+ kargo ${tl(kargo.ucret)}` : kargo.uygulanir === false ? 'kargo bedava' : 'kargo sepette'}
          ${s.product.seller ? ' · ' + esc(s.product.seller) : ''}
          ${s.product.inStock === false ? ' · <b>stokta yok</b>' : ''}
        </div>
      </div>`;
    }).join('');

  alan.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --------------------------- görsel arama ---------------------------------- */

let gorselAktifIs = null;
let gorselBase64 = null;

/** Görseli tarayıcıda küçültür (uzun kenar 1024 px, JPEG %82) → 4 MB sınırı rahat geçilir. */
async function gorselKucult(dosya) {
  const bitmap = await createImageBitmap(dosya);
  const maxKenar = 1024;
  const olcek = Math.min(1, maxKenar / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * olcek));
  const h = Math.max(1, Math.round(bitmap.height * olcek));
  const tuval = document.createElement('canvas');
  tuval.width = w;
  tuval.height = h;
  tuval.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return tuval.toDataURL('image/jpeg', 0.82);
}

const gorselDosya = document.getElementById('gorselDosya');
const gorselSecBtn = document.getElementById('gorselSecBtn');
if (gorselSecBtn && gorselDosya) {
  gorselSecBtn.addEventListener('click', () => gorselDosya.click());
  gorselDosya.addEventListener('change', async () => {
    const dosya = gorselDosya.files?.[0];
    if (!dosya) return;
    const not = document.getElementById('gorselNot');
    not.textContent = 'Görsel hazırlanıyor…';
    try {
      gorselBase64 = await gorselKucult(dosya);
      const onizleme = document.getElementById('gorselOnizleme');
      onizleme.src = gorselBase64;
      onizleme.hidden = false;
      document.getElementById('gorselAraBtn').disabled = false;
      const kb = Math.round((gorselBase64.length * 3) / 4 / 1024);
      not.textContent = `Görsel hazır (${kb} KB). "Fotoğraftan ara"ya bas.`;
    } catch (e) {
      gorselBase64 = null;
      document.getElementById('gorselAraBtn').disabled = true;
      not.textContent = 'Görsel okunamadı: ' + e.message;
    }
  });
}

const gorselAraBtn = document.getElementById('gorselAraBtn');
if (gorselAraBtn) {
  gorselAraBtn.addEventListener('click', async () => {
    if (!gorselBase64) return;
    const ipucu = document.getElementById('gorselIpucu')?.value || '';
    document.getElementById('gorselSonuc').hidden = true;
    document.getElementById('gorselDurum').hidden = false;
    document.getElementById('gorselDurumBaslik').textContent = 'Görsel inceleniyor…';
    document.getElementById('gorselDurumNotu').textContent = 'Ürün tanınıyor…';
    document.getElementById('gorselIptalBtn').hidden = false;
    gorselAraBtn.disabled = true;

    try {
      const res = await fetch('/api/gorsel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gorsel: gorselBase64, ipucu }),
      });
      const data = await guvenliJson(res);
      if (!res.ok) throw new Error(data.hata || 'Görsel araması başlatılamadı');
      gorselAktifIs = data.isId;
      gorselPoll(data.isId);
    } catch (e) {
      document.getElementById('gorselDurum').hidden = true;
      gorselAraBtn.disabled = false;
      document.getElementById('gorselNot').textContent = e.message;
    }
  });
}

function gorselPoll(id) {
  const timer = setInterval(async () => {
    try {
      const j = await guvenliJson(await fetch('/api/gorsel/' + id));
      const p = j.progress || {};
      if (j.status === 'running') {
        if (p.faz === 'analiz') {
          document.getElementById('gorselDurumBaslik').textContent = 'Görsel inceleniyor…';
          document.getElementById('gorselDurumNotu').textContent = p.not || 'Ürün tanınıyor…';
        } else {
          document.getElementById('gorselDurumBaslik').textContent = 'Benzer ürünler aranıyor…';
          document.getElementById('gorselDurumNotu').textContent =
            `${p.biten || 0}/${p.toplam || 0} site · ${p.not || ''}`;
        }
        return;
      }
      clearInterval(timer);
      document.getElementById('gorselDurum').hidden = true;
      document.getElementById('gorselIptalBtn').hidden = true;
      document.getElementById('gorselAraBtn').disabled = false;
      if (j.status === 'error') return (document.getElementById('gorselNot').textContent = j.error || 'Görsel araması başarısız');
      if (!j.result) return (document.getElementById('gorselNot').textContent = 'Sonuç alınamadı.');
      gorselSonucGoster(j.result);
    } catch (e) {
      clearInterval(timer);
      document.getElementById('gorselDurum').hidden = true;
      document.getElementById('gorselAraBtn').disabled = false;
      document.getElementById('gorselNot').textContent = e.message;
    }
  }, 900);
}

const gorselIptalBtn = document.getElementById('gorselIptalBtn');
if (gorselIptalBtn) {
  gorselIptalBtn.addEventListener('click', async () => {
    if (!gorselAktifIs) return;
    try { await fetch('/api/gorsel/' + gorselAktifIs + '/iptal', { method: 'POST' }); } catch { }
  });
}
const gorselDurumIptalBtn = document.getElementById('gorselDurumIptalBtn');
if (gorselDurumIptalBtn) {
  gorselDurumIptalBtn.addEventListener('click', async () => {
    if (!gorselAktifIs) return;
    try { await fetch('/api/gorsel/' + gorselAktifIs + '/iptal', { method: 'POST' }); } catch { }
  });
}

function gorselSonucGoster(r) {
  const alan = document.getElementById('gorselSonuc');
  alan.hidden = false;
  const a = r.analiz || {};
  const o = r.ozet || {};
  const adaylar = r.adaylar || [];

  document.getElementById('gorselOzet').innerHTML = `
    <div class="gorsel-analiz">
      ${gorselBase64 ? `<img class="gorsel-analiz-resim" src="${gorselBase64}" alt="Aranan ürün" />` : ''}
      <div class="gorsel-analiz-bilgi">
        <div class="gorsel-analiz-urun">${esc(a.urun || a.aramaSorgusu || 'Ürün')}</div>
        <div class="gorsel-etiketler">
          ${a.marka ? `<span class="rozet-kucuk">marka: ${esc(a.marka)}</span>` : ''}
          ${a.model ? `<span class="rozet-kucuk">model: ${esc(a.model)}</span>` : ''}
          ${a.renk ? `<span class="rozet-kucuk">renk: ${esc(a.renk)}</span>` : ''}
          <span class="rozet-kucuk guven-${esc(a.guven || 'orta')}">güven: ${esc(a.guven || 'orta')}</span>
        </div>
        ${(a.ozellikler || []).length ? `<div class="ipucu">${a.ozellikler.map(esc).join(' · ')}</div>` : ''}
        <div class="ipucu">Sorgular: ${(r.sorgular || []).map(s => '"' + esc(s) + '"').join(' · ')}</div>
        <div class="ipucu">${adaylar.length} aday · ${o.tarananSite || 0} site tarandı · ${((o.toplamSureMs || 0) / 1000).toFixed(1)} sn</div>
      </div>
    </div>`;

  if (!adaylar.length) {
    document.getElementById('gorselKartlar').innerHTML = `<div class="barkod-bos">
      <div class="barkod-bos-baslik">Benzer ürün bulunamadı</div>
      <p class="ipucu">Ürün daha net görünen bir fotoğrafla ya da "İpucu" alanına ürün türünü yazarak tekrar deneyin.</p></div>`;
  } else {
    document.getElementById('gorselKartlar').innerHTML = adaylar.map(c => {
      // Benzerlik yüzdesi jenerik başlıklarda yanıltıcı olabiliyor (%0 gibi).
      // Anlamlıysa göster; değilse marka/renk uyumunu rozetle anlat.
      const benzerlikRozeti = c.benzerlik >= 0.10
        ? `<span class="rozet-kucuk benzerlik">benzerlik %${Math.round(c.benzerlik * 100)}</span>`
        : '';
      const uyumRozetleri = [
        c.markaUyum === true ? '<span class="rozet-kucuk dogrulandi">marka ✓</span>' : '',
        c.markaUyum === false ? '<span class="rozet-kucuk">marka farklı</span>' : '',
        c.renkUyum === true ? '<span class="rozet-kucuk dogrulandi">renk ✓</span>' : '',
        (c.renkCeliski || c.renkUyum === false) ? '<span class="rozet-kucuk">renk farklı</span>' : '',
      ].filter(Boolean).join('');

      return `<div class="gorsel-kart ${c.enUcuz ? 'en-ucuz' : ''}">
        <div class="gorsel-kart-ust">
          <b>${esc(c.siteName)}</b>
          ${c.enUcuz ? '<span class="rozet-kucuk">en ucuz</span>' : ''}
          ${benzerlikRozeti}
          ${uyumRozetleri}
        </div>
        <a class="gorsel-kart-baslik" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(String(c.title).slice(0, 100))}</a>
        <div class="gorsel-kart-fiyat">${c.price != null ? tl(c.price) : 'fiyat bilinmiyor'}</div>
        <div class="gorsel-kart-alt">${c.brand ? esc(c.brand) : ''}${c.color ? ' · ' + esc(c.color) : ''}</div>
      </div>`;
    }).join('');
  }

  alan.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --------------------- PWA kısayolu: ?arac=barkod --------------------------- */

(function pwaKisayol() {
  const p = new URLSearchParams(location.search);
  const arac = p.get('arac');
  if (arac === 'barkod') tarayiciSekmeSec('barkod');
  else if (arac === 'gorsel') tarayiciSekmeSec('gorsel');
})();
