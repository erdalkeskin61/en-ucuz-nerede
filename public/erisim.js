/**
 * Erişim anahtarı yönetimi (yayın modu koruması).
 *
 * Neden var: daha önce anahtar `prompt()` ile soruluyordu. `window.prompt()`
 * sandboxed iframe'lerde, gömülü önizlemelerde ve bazı tarayıcı ayarlarında
 * "prompt() is not supported" hatası verip hiç çalışmıyor; ayrıca mobilde
 * kullanıcı deneyimi kötü. Bu modül aynı işi sayfa içi bir modal ile yapar.
 *
 * Kullanım: index.html / ayarlar.html içinde app.js ve ayarlar.js'ten ÖNCE yüklenir.
 * Tüm `fetch` çağrılarına anahtarı ekler; 401 gelirse modal açıp bir kez yeniden dener.
 */
(() => {
  const DEPO = 'erisim_anahtari';
  const _fetch = window.fetch.bind(window);

  /** Aynı anda birden çok 401 gelirse tek modal açılsın. */
  let acikModal = null;
  /** Kullanıcı "Vazgeç" derse kısa süre modal tekrar açılmasın (istek fırtınası koruması). */
  let sonVazgecme = 0;
  const VAZGEC_SURE = 3000;

  /** Stil bir kez enjekte edilir. */
  function stilEkle() {
    if (document.getElementById('erisim-stil')) return;
    const s = document.createElement('style');
    s.id = 'erisim-stil';
    s.textContent = `
      .erisim-perde{position:fixed;inset:0;background:rgba(15,20,35,.55);backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .erisim-kutu{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:22px 22px 18px;
        box-shadow:0 24px 60px rgba(15,20,35,.28);font-family:inherit}
      .erisim-kutu h2{margin:0 0 6px;font-size:17px;color:#1c2333}
      .erisim-kutu p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:#4b5566}
      .erisim-kutu input{width:100%;box-sizing:border-box;font-size:15px;padding:11px 12px;
        border:1.5px solid #d8dcea;border-radius:11px;outline:none;font-family:inherit}
      .erisim-kutu input:focus{border-color:#3450D1;box-shadow:0 0 0 4px rgba(52,80,209,.12)}
      .erisim-hata{color:#c0392b;font-size:12.5px;margin-top:8px;min-height:16px}
      .erisim-dugme{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
      .erisim-dugme button{font-family:inherit;font-size:14px;font-weight:700;padding:10px 18px;
        border-radius:11px;cursor:pointer;border:1.5px solid transparent}
      .erisim-vazgec{background:#f2f4f9;color:#4b5566;border-color:#e2e6f0}
      .erisim-tamam{background:#3450D1;color:#fff}
      .erisim-tamam:hover{filter:brightness(1.07)}
    `;
    document.head.appendChild(s);
  }

  /**
   * Modal açar, kullanıcı anahtarı girerse döner. İptal ederse null.
   * @param {{hata?: string}} opts
   * @returns {Promise<string|null>}
   */
  function anahtarSor(opts = {}) {
    if (acikModal) return acikModal; // zaten açık → aynı sonucu paylaş
    stilEkle();

    acikModal = new Promise((cozum) => {
      const perde = document.createElement('div');
      perde.className = 'erisim-perde';
      perde.innerHTML = `
        <div class="erisim-kutu" role="dialog" aria-modal="true" aria-labelledby="erisim-baslik">
          <h2 id="erisim-baslik">Erişim anahtarı</h2>
          <p>Bu uygulama erişim anahtarıyla korunuyor. Anahtarı bir kez girmen yeterli —
             bu cihazda saklanır.</p>
          <input type="password" id="erisim-girdi" autocomplete="current-password"
                 placeholder="Erişim anahtarını yapıştır" />
          <div class="erisim-hata" id="erisim-hata"></div>
          <div class="erisim-dugme">
            <button type="button" class="erisim-vazgec" id="erisim-vazgec">Vazgeç</button>
            <button type="button" class="erisim-tamam" id="erisim-tamam">Devam</button>
          </div>
        </div>`;

      const girdi = perde.querySelector('#erisim-girdi');
      const hataEl = perde.querySelector('#erisim-hata');
      if (opts.hata) hataEl.textContent = opts.hata;
      // Kayıtlı (yanlış) anahtar varsa alanı dolu getir: kullanıcı düzeltebilsin
      const kayitli = localStorage.getItem(DEPO);
      if (kayitli) girdi.value = kayitli;

      const kapat = (deger) => {
        document.removeEventListener('keydown', tusla, true);
        perde.remove();
        acikModal = null;
        // Vazgeçildiyse kısa bir "sessizlik" penceresi bırak: aynı sayfa yüklemesinde
        // paralel giden diğer istekler modalı arka arkaya açmasın.
        if (!deger) sonVazgecme = Date.now();
        cozum(deger);
      };

      function tusla(e) {
        if (e.key === 'Escape') { e.preventDefault(); kapat(null); }
        if (e.key === 'Enter' && document.activeElement === girdi) { e.preventDefault(); gonder(); }
      }

      function gonder() {
        const deger = girdi.value.trim();
        if (!deger) { hataEl.textContent = 'Anahtar boş olamaz.'; girdi.focus(); return; }
        kapat(deger);
      }

      perde.querySelector('#erisim-tamam').addEventListener('click', gonder);
      perde.querySelector('#erisim-vazgec').addEventListener('click', () => kapat(null));
      perde.addEventListener('click', (e) => { if (e.target === perde) kapat(null); });
      document.addEventListener('keydown', tusla, true);

      document.body.appendChild(perde);
      setTimeout(() => girdi.focus(), 30);
    });

    return acikModal;
  }

  /**
   * Anahtarı başlıklara ekler; 401 gelirse modal ile bir kez yeniden dener.
   */
  window.fetch = async (url, options = {}) => {
    const basliklar = () => {
      const a = localStorage.getItem(DEPO);
      return a ? { ...(options.headers || {}), 'x-erisim-anahtari': a } : (options.headers || {});
    };

    let res = await _fetch(url, { ...options, headers: basliklar() });
    if (res.status !== 401) return res;

    // Kullanıcı az önce vazgeçtiyse modalı yeniden açıp taciz etme; 401'i olduğu gibi dön.
    if (!acikModal && Date.now() - sonVazgecme < VAZGEC_SURE) return res;

    // 401: anahtar yok ya da yanlış. Kayıtlı yanlış anahtarı temizleyip sor.
    const eski = localStorage.getItem(DEPO);
    localStorage.removeItem(DEPO);
    const yeni = await anahtarSor({
      hata: eski ? 'Anahtar kabul edilmedi. Doğru anahtarı gir.' : '',
    });
    if (!yeni) return res; // kullanıcı vazgeçti → 401 yanıtı çağırana döner

    localStorage.setItem(DEPO, yeni);
    return _fetch(url, { ...options, headers: { ...(options.headers || {}), 'x-erisim-anahtari': yeni } });
  };

  // Diğer betiklerden elle tetiklemek için (ör. Ayarlar'da "anahtarı değiştir")
  window.erisimAnahtariSor = anahtarSor;
})();
