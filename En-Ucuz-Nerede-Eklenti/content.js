// En Ucuz Nerede? — Content Script

(function () {
  'use strict';

  function isProductPage() {
    const url = window.location.href.toLowerCase();
    if (url.includes('trendyol.com') && (url.includes('-p-') || url.includes('/p/'))) return true;
    if (url.includes('hepsiburada.com') && (url.includes('-p-') || url.includes('-pm-') || url.includes('/urun/'))) return true;
    if (url.includes('amazon.com.tr') && (url.includes('/dp/') || url.includes('/gp/product/'))) return true;
    if (url.includes('vatanbilgisayar.com') && url.includes('.html') && !url.includes('/kategori/')) return true;
    if (url.includes('mediamarkt.com.tr') && (url.includes('/product/') || url.includes('.html'))) return true;
    if (url.includes('n11.com') && url.includes('/urun/')) return true;
    if (url.includes('itopya.com') && !url.includes('/kategori/')) return true;
    if (url.includes('pazarama.com') && (url.includes('/urun/') || url.includes('-p-'))) return true;
    if (url.includes('ciceksepeti.com') && (url.includes('/urun/') || url.includes('-kcm-'))) return true;
    if (url.includes('teknosa.com') && (url.includes('-p-') || url.includes('/urun/'))) return true;
    if (url.includes('incehesap.com') && url.includes('/urun/')) return true;
    if (url.includes('sinerji.gen.tr') && url.includes('/urun/')) return true;
    if (url.includes('tebilon.com') && url.includes('/urun/')) return true;
    if (url.includes('gaming.gen.tr') && url.includes('/urun/')) return true;
    if (url.includes('robitshop.com') && url.includes('/urun/')) return true;
    if (url.includes('robotistan.com') && (url.includes('/urun/') || url.includes('.html'))) return true;
    return false;
  }

  function getProductTitle() {
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) return ogTitle.content.trim();
    return document.title.replace(/\s*[-|–].*$/, '').trim();
  }

  function injectFloatingPill() {
    if (sessionStorage.getItem('eun_dismissed') === '1') return;
    if (document.getElementById('en-ucuz-nerede-pill')) return;
    if (!isProductPage()) return;

    const title = getProductTitle();
    const shortTitle = title.length > 32 ? title.slice(0, 32) + '…' : title;

    const pill = document.createElement('div');
    pill.id = 'en-ucuz-nerede-pill';
    pill.innerHTML = `
      <div class="eun-floating-badge" id="eunTrigger" title="Bu ürünü Türkiye'deki diğer 54 sitede karşılaştır">
        <div class="eun-icon-box">
          <span class="eun-icon">🏷️</span>
          <span class="eun-pulse"></span>
        </div>
        <div class="eun-content">
          <div class="eun-title-row">
            <span class="eun-brand">En Ucuz Nerede?</span>
            <span class="eun-action-hint">54 Sitede Tara ➔</span>
          </div>
          <span class="eun-product-name">${shortTitle || 'Bu ürünün en ucuz fiyatını bul'}</span>
        </div>
        <button class="eun-close" id="eunClose" title="Bu oturumda kapat" aria-label="Kapat">✕</button>
      </div>
    `;

    document.body.appendChild(pill);

    const closeBtn = document.getElementById('eunClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sessionStorage.setItem('eun_dismissed', '1');
        pill.remove();
      });
    }

    const trigger = document.getElementById('eunTrigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        chrome.storage.local.get(['serverUrl'], (res) => {
          const serverUrl = res.serverUrl || 'http://localhost:3000';
          const targetUrl = serverUrl.replace(/\/+$/, '') + '/?url=' + encodeURIComponent(window.location.href);
          window.open(targetUrl, '_blank');
        });
      });
    }
  }

  // İlk yükleme
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingPill);
  } else {
    injectFloatingPill();
  }

  // SPA yönlendirmeleri için (Trendyol, Hepsiburada vs. sayfayı yenilemeden URL değiştirir)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      sessionStorage.removeItem('eun_dismissed');
      setTimeout(injectFloatingPill, 600);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', injectFloatingPill);
})();