/**
 * Tema degistirici (2026-10-30)
 *
 * AyDinlik / karanlik tema arasinda gecis yapar, tercihi localStorage'da tutar.
 * Ilk boyamadan once <head> icindeki kucuk betik ayni anahtari okuyarak beyaz
 * parlama (FOUC) olusmasini engeller.
 *
 * Not: Bazi WebView/gomulu motorlar `data-theme` degisince devralinan CSS
 * degiskenlerini aninda yeniden hesaplamaz. Bu yuzden stil dosyasi yeniden
 * baglanarak zorunlu restyle yapilir (yalnizca tema degisiminde, maliyeti yok).
 */
(function temaBaslat() {
  const kok = document.documentElement;
  const dugme = document.getElementById('temaDegistir');
  if (!dugme) return;

  const simdiki = () => (kok.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  /**
   * Zorunlu yeniden hesaplama.
   *
   * Bazı gömülü motorlarda `data-theme` değişince devralınan CSS değişkenleri
   * aynı görev içinde yeniden çözülmüyor. Senkron görünürlük değişimi tam bir
   * restyle tetikler; aynı görevde geri alındığı için ekranda titreme olmaz.
   */
  const restyle = () => {
    const govde = document.body;
    if (!govde) return;
    const onceki = govde.style.display;
    govde.style.display = 'none';
    void govde.offsetHeight; // reflow
    govde.style.display = onceki;
  };

  const uygula = (tema) => {
    kok.setAttribute('data-theme', tema);
    kok.style.colorScheme = tema === 'dark' ? 'dark' : 'light';
    // Mobil tarayıcı çubuğu rengi de temaya uysun.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#0F172A' : '#4338CA');
    dugme.textContent = tema === 'dark' ? '☀️' : '🌓';
    dugme.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');
    dugme.title = tema === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç';
    try { localStorage.setItem('tema', tema); } catch { /* kapali */ }
    restyle();
    window.dispatchEvent(new CustomEvent('tema:degisti', { detail: { tema } }));
  };

  uygula(simdiki());
  dugme.addEventListener('click', () => {
    uygula(simdiki() === 'dark' ? 'light' : 'dark');
  });

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('tema')) return;
      uygula(e.matches ? 'dark' : 'light');
    });
  } catch { /* eski tarayici */ }
})();
