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

  const TEMA_METNI = {
    tr: {
      dark: 'Aydınlık temaya geç',
      light: 'Karanlık temaya geç',
      aria: 'Karanlık / aydınlık temayı değiştir',
    },
    en: {
      dark: 'Switch to light theme',
      light: 'Switch to dark theme',
      aria: 'Toggle dark / light theme',
    },
    fr: {
      dark: 'Passer au thème clair',
      light: 'Passer au thème sombre',
      aria: 'Changer de thème clair / sombre',
    },
    ja: {
      dark: 'ライトテーマに切替',
      light: 'ダークテーマに切替',
      aria: 'ライト／ダークテーマ切替',
    },
  };

  const sayfaDili = () => {
    const d = (kok.getAttribute('lang') || window.BASKI_HESAP_ORTAM?.dil || 'tr').toLowerCase().slice(0, 2);
    return TEMA_METNI[d] ? d : 'tr';
  };

  const uygula = (tema) => {
    kok.setAttribute('data-theme', tema);
    kok.style.colorScheme = tema === 'dark' ? 'dark' : 'light';
    // Mobil tarayıcı çubuğu rengi de temaya uysun.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#0B0F17' : '#1E40AF');
    dugme.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');
    const metin = TEMA_METNI[sayfaDili()];
    dugme.title = tema === 'dark' ? metin.dark : metin.light;
    dugme.setAttribute('aria-label', metin.aria);
    try { localStorage.setItem('tema', tema); } catch { /* kapali */ }
    restyle();
    window.dispatchEvent(new CustomEvent('tema:degisti', { detail: { tema } }));
  };

  uygula(simdiki());
  dugme.addEventListener('click', () => {
    uygula(simdiki() === 'dark' ? 'light' : 'dark');
  });

  // Mobil (<=860px) tek satır üst bar için menü çekmece düğmesi
  try {
    const ustKap = document.querySelector?.('.ustbar .kap');
    const anaMenu = ustKap?.querySelector?.('.menu');
    if (ustKap && anaMenu && !document.getElementById('menuAcBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'menuAcBtn';
      btn.className = 'menu-ac';
      const menuLbl = { tr: 'Gezinme menüsü', en: 'Navigation menu', fr: 'Menu de navigation', ja: 'ナビゲーション' }[sayfaDili()] || 'Menü';
      btn.setAttribute('aria-label', menuLbl);
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<svg class="svg-ik" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>';
      const dilSecici = ustKap.querySelector('.dil-secici');
      ustKap.insertBefore(btn, dilSecici || dugme);
      const toggle = (acik) => {
        const durum = typeof acik === 'boolean' ? acik : !anaMenu.classList.contains('acik');
        anaMenu.classList.toggle('acik', durum);
        btn.setAttribute('aria-expanded', durum ? 'true' : 'false');
      };
      btn.addEventListener('click', () => toggle());
      document.addEventListener('click', (e) => {
        if (anaMenu.classList.contains('acik') && !ustKap.contains(e.target)) toggle(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && anaMenu.classList.contains('acik')) toggle(false);
      });
    }
  } catch { /* eski tarayici */ }

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('tema')) return;
      uygula(e.matches ? 'dark' : 'light');
    });
  } catch { /* eski tarayici */ }

  document.addEventListener('click', (e) => {
    const dilLink = e.target.closest?.('details.dil-secici a[hreflang]');
    if (dilLink) {
      const secilen = (dilLink.getAttribute('hreflang') || '').toLowerCase().slice(0, 2);
      if (/^(tr|en|fr|ja)$/.test(secilen)) {
        document.cookie = `bh_lang=${secilen}; path=/; max-age=31536000; SameSite=Lax`;
      }
    }
    document.querySelectorAll('details.dil-secici[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('details.dil-secici[open]').forEach((d) => d.removeAttribute('open'));
    }
  });
})();
