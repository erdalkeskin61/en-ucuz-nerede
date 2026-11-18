/**
 * 📱 PWA "Ana Ekrana Ekle" akıllı çekmecesi — 2026-11-06
 *
 * Amaç: mobilde siteyi native uygulama gibi hissettirmek. Kullanıcıyı hemen
 * bunaltmadan, 10 saniye geçince VEYA 2. aramada nazik bir alt çekmece açılır.
 *
 *  - Android/Chromium: `beforeinstallprompt` yakalanır ve [Ana Ekrana Ekle]
 *    düğmesi tarayıcının GERÇEK kurulum penceresini açar.
 *  - iOS Safari: `beforeinstallprompt` yoktur; Paylaş → "Ana Ekrana Ekle"
 *    adımları gösterilir (uydurma bir kurulum düğmesi gösterilmez).
 *  - Kapatma hafızası localStorage'da 30 gün tutulur; kullanıcı bir daha
 *    rahatsız edilmez. Zaten standalone (kurulu) modda hiç açılmaz.
 */
(() => {
  'use strict';

  const KAPATMA_ANAHTARI = 'eun_pwa_kurulum_kapatma';
  const KAPATMA_GUN = 30;
  const GECIKME_MS = 10000;

  const standalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const iosMu = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const dokunmatikMi = () => window.matchMedia?.('(pointer: coarse)').matches;

  function kapaliMi() {
    try {
      const ts = Number(localStorage.getItem(KAPATMA_ANAHTARI) || 0);
      return ts > 0 && Date.now() - ts < KAPATMA_GUN * 24 * 3600 * 1000;
    } catch {
      return false;
    }
  }

  function kapat() {
    try { localStorage.setItem(KAPATMA_ANAHTARI, String(Date.now())); } catch { /* yoksay */ }
    const el = document.getElementById('pwaKurulum');
    if (!el) return;
    el.classList.remove('acik');
    setTimeout(() => { el.hidden = true; }, 220);
  }

  function htmlHazirla() {
    if (document.getElementById('pwaKurulum')) return document.getElementById('pwaKurulum');
    const el = document.createElement('div');
    el.id = 'pwaKurulum';
    el.className = 'pwa-kurulum';
    el.hidden = true;
    el.innerHTML = `
      <div class="pwa-kurulum-perde" data-pwa-kapat></div>
      <div class="pwa-kurulum-kutu" role="dialog" aria-modal="true" aria-labelledby="pwaKurulumBaslik">
        <button type="button" class="pwa-kurulum-kapat" data-pwa-kapat aria-label="Kapat">✕</button>
        <div class="pwa-kurulum-ikon" aria-hidden="true">📱</div>
        <div class="pwa-kurulum-metin">
          <h2 id="pwaKurulumBaslik">En Ucuz Nerede'yi ana ekranınıza ekleyin</h2>
          <p>Tek dokunuşla barkod okutun, fotoğraftan arayın ve fiyat alarmlarını anında alın.</p>
          <div class="pwa-kurulum-ios" hidden>
            <div class="pwa-ios-adim">
              <span class="pwa-ios-simge" aria-hidden="true">⬆️</span>
              <span>Safari'de alttaki <b>Paylaş</b> düğmesine dokunun.</span>
            </div>
            <div class="pwa-ios-adim">
              <span class="pwa-ios-simge" aria-hidden="true">➕</span>
              <span>Ardından <b>"Ana Ekrana Ekle"</b>yi seçin.</span>
            </div>
          </div>
        </div>
        <div class="pwa-kurulum-butonlar">
          <button type="button" class="pwa-kurulum-ekle" id="pwaKurulumEkle">Ana Ekrana Ekle</button>
          <button type="button" class="pwa-kurulum-sonra" data-pwa-kapat>Şimdi değil</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-pwa-kapat]')) kapat();
    });
    return el;
  }

  let kurulumOlayi = null;
  let gosterildi = false;
  let aramaSayisi = 0;

  function goster() {
    if (gosterildi || standalone() || kapaliMi()) return;
    // Android'de henüz beforeinstallprompt gelmediyse bekle.
    if (!iosMu() && !kurulumOlayi) return;
    if (!iosMu() && !dokunmatikMi()) return; // masaüstünde can sıkma

    gosterildi = true;
    const el = htmlHazirla();
    const ios = el.querySelector('.pwa-kurulum-ios');
    const ekle = el.querySelector('#pwaKurulumEkle');
    if (ios) ios.hidden = !iosMu();
    if (ekle) {
      ekle.hidden = iosMu();
      ekle.onclick = async () => {
        if (!kurulumOlayi) { kapat(); return; }
        try {
          kurulumOlayi.prompt();
          const secim = await kurulumOlayi.userChoice;
          if (secim?.outcome === 'accepted') kapat();
        } catch { /* kullanıcı vazgeçti */ }
        kurulumOlayi = null;
      };
    }
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('acik'));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    kurulumOlayi = e;
    // Olay geldiyse 10 sn beklemek yerine kısa bir nefes payı bırak.
    setTimeout(goster, 2500);
  });

  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(KAPATMA_ANAHTARI, String(Date.now())); } catch { /* yoksay */ }
    const el = document.getElementById('pwaKurulum');
    if (el) el.hidden = true;
  });

  // 2. arama tetikleyicisi (aramayı başlatan düğme her tıklamada sayılır).
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#araBtn')) return;
    aramaSayisi++;
    if (aramaSayisi >= 2) goster();
  }, true);

  // 10 saniyelik inceleme süresi.
  setTimeout(goster, GECIKME_MS);

  // iOS'ta masaüstü kontrolü olmadığından dokunmatik şartı aranmaz.
})();
