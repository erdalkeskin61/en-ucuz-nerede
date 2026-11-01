// En Ucuz Nerede? — In-Page Smart Comparison Panel & Live Floating Pill

(function () {
  'use strict';

  let currentJobId = null;
  let pollInterval = null;
  let lastResult = null;
  let sortOrder = 'desc'; // 'desc' (yüksekten düşüğe) veya 'asc' (düşükten yükseğe)
  let activeFilter = 'all'; // 'all', 'kargo', 'resmi', 'taksit'

  const NON_PRODUCT_PATHS = /\/(cart|sepet|checkout|odeme|hesabim|account|login|giris|register|uye|kategori|category|categories|search|arama|blog|haber|iletisim|contact|about|hakkimizda|sss|faq|kvkk|gizlilik|iade|kargo)($|\/|\?)/i;

  function isProductPage() {
    const href = window.location.href.toLowerCase();
    let pathname = window.location.pathname.toLowerCase();

    // Ana sayfa veya alışveriş harici sayfaları doğrudan ele
    if (!pathname || pathname === '/' || pathname === '/index.html' || pathname === '/index.php') return false;
    if (NON_PRODUCT_PATHS.test(pathname)) return false;

    // Büyük pazaryerleri için net desenler
    if (href.includes('trendyol.com')) return href.includes('-p-') || href.includes('/p/');
    if (href.includes('hepsiburada.com')) return href.includes('-p-') || href.includes('-pm-') || href.includes('/urun/');
    if (href.includes('amazon.com.tr')) return href.includes('/dp/') || href.includes('/gp/product/');
    if (href.includes('n11.com')) return href.includes('/urun/');
    if (href.includes('pazarama.com')) return href.includes('/urun/') || href.includes('-p-');
    if (href.includes('ciceksepeti.com')) return href.includes('/urun/') || href.includes('-kcm-');
    if (href.includes('teknosa.com')) return href.includes('-p-') || href.includes('/urun/');
    if (href.includes('vatanbilgisayar.com') || href.includes('mediamarkt.com.tr')) return (href.includes('.html') || href.includes('/product/')) && !href.includes('/kategori/');

    // Özel mağazalar (Shopify, Ticimax, İkas, T-Soft, IdeaSoft vb.)
    if (pathname.includes('/products/') || pathname.includes('/urun/') || pathname.includes('/prd-') || pathname.endsWith('.html')) return true;

    // Sayfada h1 başlığı veya sepete ekle butonu varsa ürün sayfasıdır
    const hasH1 = Boolean(document.querySelector('h1'));
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 1 && hasH1 && pathname.length > 5) return true;

    return false;
  }

  function getProductTitle() {
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) return ogTitle.content.trim();
    return document.title.replace(/\s*[-|–].*$/, '').trim();
  }

  function tl(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initUI() {
    if (!isProductPage()) return;
    if (document.getElementById('eun-root')) return;

    const root = document.createElement('div');
    root.id = 'eun-root';
    root.innerHTML = `
      <!-- Floating Pill (Sağ Alttaki Canlı Rozet) -->
      <div class="eun-pill" id="eunPill" title="Tıkla: Fiyat karşılaştırma panelini aç/kapat">
        <div class="eun-pill-icon" id="eunPillIcon">🏷️<span class="eun-pulse" id="eunPulse"></span></div>
        <div class="eun-pill-body">
          <div class="eun-pill-top">
            <span class="eun-pill-brand">En Ucuz Nerede?</span>
            <span class="eun-pill-action" id="eunPillAction">Fiyatları Gör ➔</span>
          </div>
          <div class="eun-pill-sub" id="eunPillSub">54 Sitede Fiyat Ara</div>
        </div>
        <button class="eun-pill-close" id="eunPillClose" title="Kapat">✕</button>
      </div>

      <!-- In-Page Sliding Comparison Panel (Rozetin Hemen Üstünde Açılır) -->
      <div class="eun-panel" id="eunPanel">
        <!-- Panel Header -->
        <div class="eun-panel-header">
          <div class="eun-panel-title-box">
            <span class="eun-header-icon">🏷️</span>
            <div>
              <div class="eun-panel-title">En Ucuz Nerede?</div>
              <div class="eun-panel-subtitle" id="eunPanelSub">54 Sitede Canlı Fiyat Analizi</div>
            </div>
          </div>
          <div class="eun-panel-actions">
            <button class="eun-btn-icon" id="eunOpenTab" title="Yeni sekmede tam sayfa aç">↗</button>
            <button class="eun-btn-icon" id="eunMinimize" title="Küçült">─</button>
            <button class="eun-btn-icon" id="eunPanelClose" title="Kapat">✕</button>
          </div>
        </div>

        <!-- Baz Ürün Kartı -->
        <div class="eun-current-item" id="eunCurrentItem">
          <div class="eun-current-tag">BU SAYFADAKİ ÜRÜN</div>
          <div class="eun-current-name" id="eunCurrentName">${esc(getProductTitle())}</div>
          <div class="eun-current-price-row">
            <span class="eun-current-label">Mevcut Fiyat:</span>
            <span class="eun-current-price" id="eunCurrentPrice">Algılanıyor…</span>
          </div>
        </div>

        <!-- Canlı İlerleme Çubuğu -->
        <div class="eun-progress-box" id="eunProgressBox">
          <div class="eun-progress-header">
            <span id="eunProgressStatus">🚀 Siteler taranıyor...</span>
            <span id="eunProgressPercent">0%</span>
          </div>
          <div class="eun-progress-bar-bg">
            <div class="eun-progress-bar-fill" id="eunProgressFill"></div>
          </div>
          <div class="eun-chip-container" id="eunChipContainer"></div>
        </div>

        <!-- Özet & "Neden Daha Ucuz?" Kartı -->
        <div class="eun-summary-card" id="eunSummaryCard" style="display:none;">
          <div class="eun-summary-badge" id="eunCheapestBadge">🎉 En Ucuz: —</div>
          <div class="eun-trend-box" id="eunTrendBox" style="display:none;">
            <div class="eun-trend-header">
              <span id="eunTrendBadge" class="eun-trend-badge badge-yesil">🔥 Fiyat Analizi</span>
              <span id="eunTrendStats" class="eun-trend-stats">30G Ort: —</span>
            </div>
            <div class="eun-sparkline-container" id="eunSparklineContainer"></div>
          </div>
          <div class="eun-explain-box" id="eunExplainBox" style="display:none;">
            <b>💡 Neden Daha Ucuz?</b>
            <span id="eunExplainText"></span>
          </div>
        </div>

        <!-- Sıralama ve Filtre Barı -->
        <div class="eun-controls-bar" id="eunControlsBar" style="display:none;">
          <div class="eun-sort-buttons">
            <button class="eun-filter-btn" id="eunSortToggle" title="Sıralamayı Değiştir">
              <span id="eunSortIcon">🔽</span>
              <span id="eunSortLabel">Yüksekten Düşüğe</span>
            </button>
          </div>
          <div class="eun-filter-chips">
            <span class="eun-chip-filter active" data-filter="all">Tümü</span>
            <span class="eun-chip-filter" data-filter="stokta_var">🟢 Stokta Var</span>
            <span class="eun-chip-filter" data-filter="stokta_yok">🔴 Stokta Yok</span>
            <span class="eun-chip-filter" data-filter="kargo">📦 Kargo Bedava</span>
            <span class="eun-chip-filter" data-filter="resmi">🏢 Resmi Satıcı</span>
            <span class="eun-chip-filter" data-filter="taksit">💳 Taksit</span>
          </div>
        </div>

        <!-- Sonuç Listesi -->
        <div class="eun-results-list" id="eunResultsList">
          <div class="eun-empty-state" id="eunEmptyState">
            Fiyat analizi başlatılıyor...
          </div>
        </div>

        <!-- Fiyat Alarmı Kur Kartı -->
        <div class="eun-alarm-card" id="eunAlarmCard" style="display:none;">
          <div class="eun-alarm-header">
            <span class="eun-alarm-icon">🔔</span>
            <div class="eun-alarm-texts">
              <span class="eun-alarm-title">Fiyat Alarmı Kur</span>
              <span class="eun-alarm-desc">Fiyat düşünce Telegram'dan anında haber ver</span>
            </div>
          </div>
          <div class="eun-alarm-form">
            <div class="eun-alarm-input-wrap">
              <input type="number" id="eunTargetPrice" class="eun-alarm-input" placeholder="Hedef Fiyat" min="1" step="1" />
              <span class="eun-alarm-currency">₺</span>
            </div>
            <button class="eun-alarm-btn" id="eunSetAlarmBtn">
              <span>🔔</span>
              <span id="eunSetAlarmBtnText">Takibe Al</span>
            </button>
          </div>
          <div class="eun-alarm-feedback" id="eunAlarmFeedback" style="display:none;"></div>
        </div>

        <!-- Panel Footer -->
        <div class="eun-panel-footer">
          <button class="eun-footer-btn secondary" id="eunRefreshBtn">🔄 Tekrar Tara</button>
          <button class="eun-footer-btn primary" id="eunFullAppBtn">Tam Sayfada İncele ↗</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    setupEvents();
  }

  function setupEvents() {
    const pill = document.getElementById('eunPill');
    const panel = document.getElementById('eunPanel');

    // Rozete tıklandığında paneli aç/kapat ve gerekirse taramayı başlat
    pill.addEventListener('click', (e) => {
      if (e.target.closest('#eunPillClose')) return;
      if (panel.classList.contains('open')) {
        closePanel();
      } else {
        openPanel();
        if (!currentJobId) {
          startComparison();
        }
      }
    });

    // Rozeti kapat
    document.getElementById('eunPillClose').addEventListener('click', (e) => {
      e.stopPropagation();
      pill.style.display = 'none';
      closePanel();
    });

    // Paneli küçült
    document.getElementById('eunMinimize').addEventListener('click', () => {
      closePanel();
    });

    // Paneli kapat
    document.getElementById('eunPanelClose').addEventListener('click', () => {
      closePanel();
    });

    // Yeni sekmede aç butonları
    const openInNewTab = () => {
      chrome.storage.local.get(['serverUrl'], (res) => {
        const serverUrl = (res.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
        window.open(`${serverUrl}/?url=${encodeURIComponent(window.location.href)}`, '_blank');
      });
    };
    document.getElementById('eunOpenTab').addEventListener('click', openInNewTab);
    document.getElementById('eunFullAppBtn').addEventListener('click', openInNewTab);

    // Tekrar tara
    document.getElementById('eunRefreshBtn').addEventListener('click', () => {
      startComparison();
    });

    // Fiyat Alarmı Kur Butonu
    const alarmBtn = document.getElementById('eunSetAlarmBtn');
    if (alarmBtn) {
      alarmBtn.addEventListener('click', () => {
        const input = document.getElementById('eunTargetPrice');
        const feedback = document.getElementById('eunAlarmFeedback');
        const btnText = document.getElementById('eunSetAlarmBtnText');
        const val = parseFloat(input?.value);

        if (!val || isNaN(val) || val <= 0) {
          feedback.className = 'eun-alarm-feedback error';
          feedback.textContent = 'Lütfen geçerli bir hedef fiyat girin.';
          feedback.style.display = 'block';
          return;
        }

        if (!lastResult) {
          feedback.className = 'eun-alarm-feedback error';
          feedback.textContent = 'Önce karşılaştırma sonucunun gelmesi bekleniyor.';
          feedback.style.display = 'block';
          return;
        }

        alarmBtn.disabled = true;
        btnText.textContent = 'Kaydediliyor...';
        feedback.style.display = 'none';

        chrome.runtime.sendMessage({ type: 'ADD_TRACKED', sonuc: lastResult, hedefFiyat: val }, (resp) => {
          alarmBtn.disabled = false;
          if (resp && resp.ok) {
            btnText.textContent = '✔ Takipte';
            feedback.className = 'eun-alarm-feedback success';
            feedback.innerHTML = '✔ <b>' + tl(val) + '</b> hedefiyle takibe alındı! Telegram onay mesajınız iletildi. 🚀';
            feedback.style.display = 'block';
          } else {
            btnText.textContent = 'Takibe Al';
            feedback.className = 'eun-alarm-feedback error';
            feedback.textContent = resp?.error || 'Alarm kaydedilemedi.';
            feedback.style.display = 'block';
          }
        });
      });
    }

    // Sıralama toggle (Yüksekten Düşüğe <-> Düşükten Yükseğe)
    document.getElementById('eunSortToggle').addEventListener('click', () => {
      sortOrder = (sortOrder === 'desc') ? 'asc' : 'desc';
      const label = document.getElementById('eunSortLabel');
      const icon = document.getElementById('eunSortIcon');
      if (sortOrder === 'desc') {
        label.textContent = 'Yüksekten Düşüğe';
        icon.textContent = '🔽';
      } else {
        label.textContent = 'Düşükten Yükseğe';
        icon.textContent = '🔼';
      }
      if (lastResult) renderResults(lastResult);
    });

    // Filtre çipleri
    document.querySelectorAll('.eun-chip-filter').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.eun-chip-filter').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.filter;
        if (lastResult) renderResults(lastResult);
      });
    });
  }

  function openPanel() {
    const panel = document.getElementById('eunPanel');
    panel.style.display = 'flex';
    // Zorunlu reflow ile animasyon tetikle
    panel.offsetHeight;
    panel.classList.add('open');
    const action = document.getElementById('eunPillAction');
    if (action && !currentJobId) action.textContent = 'Açık ▾';
  }

  function closePanel() {
    const panel = document.getElementById('eunPanel');
    panel.classList.remove('open');
    setTimeout(() => {
      if (!panel.classList.contains('open')) panel.style.display = 'none';
    }, 250);
    const action = document.getElementById('eunPillAction');
    if (action) action.textContent = lastResult ? 'Fiyatları Gör ➔' : 'Tara ➔';
  }

  function startComparison() {
    if (pollInterval) clearInterval(pollInterval);
    const progressBox = document.getElementById('eunProgressBox');
    const summaryCard = document.getElementById('eunSummaryCard');
    const controlsBar = document.getElementById('eunControlsBar');
    const resultsList = document.getElementById('eunResultsList');
    const statusText = document.getElementById('eunProgressStatus');
    const fillBar = document.getElementById('eunProgressFill');
    const percentText = document.getElementById('eunProgressPercent');

    // Rozet üzerinde ANINDA canlı görsel durum bildirimi!
    const pillIcon = document.getElementById('eunPillIcon');
    const pillAction = document.getElementById('eunPillAction');
    const pillSub = document.getElementById('eunPillSub');
    if (pillIcon) pillIcon.innerHTML = '<span class="eun-spinning">🔄</span>';
    if (pillAction) pillAction.textContent = 'Taranıyor...';
    if (pillSub) pillSub.textContent = '🚀 0/60 site taranıyor...';

    progressBox.style.display = 'block';
    summaryCard.style.display = 'none';
    controlsBar.style.display = 'none';
    statusText.textContent = '🚀 60 site taranıyor, fiyatlar toplanıyor...';
    fillBar.style.width = '10%';
    percentText.textContent = '10%';
    resultsList.innerHTML = '<div class="eun-loading-spinner-box"><div class="eun-spinner"></div><div>E-ticaret siteleri taranıyor...</div></div>';

    // Background service worker ile güvenli çağrı
    try {
      chrome.runtime.sendMessage({ type: 'START_COMPARE', url: window.location.href }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          progressBox.style.display = 'none';
          if (pillIcon) pillIcon.innerHTML = '⚠️';
          const errMsg = chrome.runtime.lastError?.message || resp?.error || 'Sunucuya bağlanılamadı. Eklentiyi güncellediyseniz lütfen sayfayı yenileyin (F5).';
          if (pillSub) pillSub.textContent = 'Hata (Sayfayı F5 yapın)';
          resultsList.innerHTML = `<div class="eun-error-box">⚠️ Bağlantı uyarısı: ${esc(errMsg)}<br><small style="color:#64748b;margin-top:4px;display:block;">Eklenti güncellendiğinde açık sayfayı bir kez yenilemeniz (F5) gerekir.</small></div>`;
          return;
        }

        currentJobId = resp.isId;
        pollJob(currentJobId);
      });
    } catch (e) {
      progressBox.style.display = 'none';
      if (pillIcon) pillIcon.innerHTML = '⚠️';
      if (pillSub) pillSub.textContent = 'Sayfayı F5 yapın';
      resultsList.innerHTML = `<div class="eun-error-box">⚠️ Eklenti güncellendi. Lütfen alışveriş sayfasını yenileyin (F5).</div>`;
    }
  }

  function pollJob(jobId) {
    let tickCount = 0;
    const pillIcon = document.getElementById('eunPillIcon');
    const pillAction = document.getElementById('eunPillAction');
    const pillSub = document.getElementById('eunPillSub');

    pollInterval = setInterval(() => {
      tickCount++;

      // Güvenlik zaman aşımı (60 saniye boyunca takılı kalmayı önler)
      if (tickCount > 130) {
        clearInterval(pollInterval);
        if (pillIcon) pillIcon.innerHTML = '⚠️';
        if (pillSub) pillSub.textContent = 'Zaman aşımı';
        document.getElementById('eunProgressBox').style.display = 'none';
        document.getElementById('eunResultsList').innerHTML = `<div class="eun-error-box">⏱️ Tarama zaman aşımına uğradı. Sunucu yanıt vermedi.</div>`;
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: 'CHECK_JOB', isId: jobId }, (resp) => {
          if (chrome.runtime.lastError) {
            clearInterval(pollInterval);
            if (pillIcon) pillIcon.innerHTML = '⚠️';
            if (pillSub) pillSub.textContent = 'Sayfayı F5 yapın';
            return;
          }
          if (!resp || !resp.ok) return;
        const job = resp.job;
        if (!job) return;

        // İlerleme güncelle
        const progress = job.progress || {};
        const total = job.progress?.toplam || 60;
        const doneCount = Object.keys(progress).length;
        const pct = Math.min(95, Math.max(15, Math.round((doneCount / total) * 100)));
        document.getElementById('eunProgressFill').style.width = pct + '%';
        document.getElementById('eunProgressPercent').textContent = pct + '%';
        document.getElementById('eunProgressStatus').textContent = `🔍 ${doneCount}/${total} site kontrol edildi...`;

        // Rozet üzerindeki canlı durumu da anlık güncelle!
        if (pillSub) pillSub.textContent = `🔍 ${doneCount}/${total} site kontrol edildi...`;

        if (job.status === 'done') {
          clearInterval(pollInterval);
          document.getElementById('eunProgressFill').style.width = '100%';
          document.getElementById('eunProgressPercent').textContent = '100%';
          setTimeout(() => {
            document.getElementById('eunProgressBox').style.display = 'none';
          }, 600);

          if (!job.result || !job.result.kaynak) {
            document.getElementById('eunProgressBox').style.display = 'none';
            document.getElementById('eunResultsList').innerHTML = '<div class=\"eun-error-box\">⚠️ Karşılaştırma sonucu eksik geldi. Lütfen tekrar deneyin.</div>';
            return;
          }

          lastResult = job.result;
          renderResults(job.result);

          // Rozeti tamamlandı durumuna güncelle
          if (pillIcon) pillIcon.innerHTML = '🎉';
          if (pillAction) pillAction.textContent = 'Sonuçlar Hazır';
          if (pillSub) {
            const oz = job.result.ozet;
            pillSub.textContent = oz?.enUcuzFiyat ? `En Ucuz: ${tl(oz.enUcuzFiyat)} (${oz.enUcuzSite})` : '54 site tarandı';
          }
        } else if (job.status === 'error') {
          clearInterval(pollInterval);
          if (pillIcon) pillIcon.innerHTML = '❌';
          if (pillSub) pillSub.textContent = 'Hata oluştu';
          document.getElementById('eunProgressBox').style.display = 'none';
          document.getElementById('eunResultsList').innerHTML = `<div class="eun-error-box">❌ Hata: ${esc(job.error || 'Tarama tamamlanamadı')}</div>`;
        }
      });
      } catch (err) {
        clearInterval(pollInterval);
        if (pillIcon) pillIcon.innerHTML = '⚠️';
        if (pillSub) pillSub.textContent = 'Sayfayı F5 yapın';
      }
    }, 450);
  }

  function renderResults(result) {
    if (!result) return;
    if (!result.kaynak) {
      result.kaynak = {
        site: result.sonuclar?.[0]?.site || 'kaynak',
        siteName: result.sonuclar?.[0]?.siteName || 'Mevcut Mağaza',
        urun: document.title || 'Ürün'
      };
    }
    const summaryCard = document.getElementById('eunSummaryCard');
    const controlsBar = document.getElementById('eunControlsBar');
    const resultsList = document.getElementById('eunResultsList');
    const currentPriceEl = document.getElementById('eunCurrentPrice');
    const cheapestBadge = document.getElementById('eunCheapestBadge');
    const explainBox = document.getElementById('eunExplainBox');
    const explainText = document.getElementById('eunExplainText');

    summaryCard.style.display = 'block';
    controlsBar.style.display = 'flex';

    // Baz ürün bilgisi ve fiyatı
    const baseItem = (result.sonuclar || []).find(r => r.matchBasis === 'kaynak') || (result.sonuclar || [])[0];
    const basePrice = baseItem?.product?.pricing?.toplam ?? baseItem?.product?.sellingPrice ?? null;
    if (result.kaynak?.urun) {
      const curNameEl = document.getElementById('eunCurrentName');
      if (curNameEl) curNameEl.textContent = result.kaynak.urun;
    }
    if (basePrice) {
      currentPriceEl.textContent = tl(basePrice);
    } else {
      currentPriceEl.textContent = '—';
    }

    // Özet rozeti
    const ozet = result.ozet || {};
    if (ozet.enUcuzFiyat != null) {
      const fark = basePrice ? (basePrice - ozet.enUcuzFiyat) : null;
      let diffMsg = '';
      if (fark && fark > 0) {
        diffMsg = ` (${tl(fark)} daha ucuz!)`;
      }
      cheapestBadge.innerHTML = `🎉 En Ucuz: <b>${esc(ozet.enUcuzSite)}</b> · <b>${tl(ozet.enUcuzFiyat)}</b>${diffMsg}`;
    }

    // Neden daha ucuz kartı
    if (ozet.nedenDahaUcuz) {
      explainBox.style.display = 'block';
      explainText.textContent = ozet.nedenDahaUcuz;
    } else {
      explainBox.style.display = 'none';
    }

    // Fiyat Alarmı Kur Bölümünü Göster ve Öneri Fiyat Ata
    const alarmCard = document.getElementById('eunAlarmCard');
    const targetInput = document.getElementById('eunTargetPrice');
    const feedback = document.getElementById('eunAlarmFeedback');
    if (alarmCard) {
      alarmCard.style.display = 'block';
      if (feedback) feedback.style.display = 'none';
      const bestFiyat = ozet.enUcuzFiyat || basePrice;
      if (bestFiyat && targetInput && !targetInput.value) {
        targetInput.value = Math.floor(bestFiyat * 0.95);
      }
    }

        try {
      const pFound = (result.sonuclar || []).filter(r => r.status === 'found' && r.product?.pricing);
      const pid = result.kaynak?.modelKodu || result.kaynak?.barkod || result.kaynak?.urun;
      const curPrices = pFound.map(r => r.product.pricing.toplam || r.product.pricing.netFiyat);
      const cMin = curPrices.length ? Math.min(...curPrices) : basePrice;
      const cMax = curPrices.length ? Math.max(...curPrices) : basePrice;
      const cAvg = curPrices.length ? curPrices.reduce((a, b) => a + b, 0) / curPrices.length : basePrice;

      chrome.runtime.sendMessage({
        type: 'GET_PRICE_HISTORY',
        payload: { productId: pid, currentPrice: cMin, currentAvg: cAvg, currentMax: cMax, currentItems: pFound }
      }, (resp) => {
        if (resp && resp.ok && resp.data && resp.data.summary) {
          const sm = resp.data.summary;
          const badgeEl = document.getElementById('eunTrendBadge');
          const statsEl = document.getElementById('eunTrendStats');
          if (badgeEl) {
            badgeEl.textContent = sm.recommendationText;
            badgeEl.className = 'eun-trend-badge ' + (sm.badgeClass || 'badge-yesil');
          }
          if (statsEl) {
            statsEl.textContent = '30G Ort: ' + tl(sm.avgPrice);
          }
          renderSparkline(resp.data.timeline);
        }
      });
    } catch (e) {}

    // Bulunan ürünleri topla ve filtrele
    let items = (result.sonuclar || []).filter(r => r.status === 'found' && r.product);

    if (activeFilter === 'stokta_var') {
      items = items.filter(r => r.product?.inStock !== false);
    } else if (activeFilter === 'stokta_yok') {
      items = items.filter(r => r.product?.inStock === false);
    } else if (activeFilter === 'kargo') {
      items = items.filter(r => r.kargoBedava || r.product?.pricing?.kargo?.ucret === 0 || r.product?.pricing?.kargo?.uygulanir === false || /ücretsiz|bedava/i.test(String(r.product?.shipping || '')));
    } else if (activeFilter === 'resmi') {
      items = items.filter(r => r.resmiSatici || r.product?.officialSeller || ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'teknosa', 'itopya', 'robitshop', 'robotistan', 'direnc', 'samm'].includes(r.site));
    } else if (activeFilter === 'taksit') {
      items = items.filter(r => r.vadeFarksizTaksit || (r.product?.pricing?.kampanyaTaksit || []).length > 0);
    }

    // Fiyat alma yardımcısı
    const getPrice = (r) => {
      const pr = r.product.pricing;
      return pr?.toplam ?? r.product.sellingPrice ?? 9999999;
    };

    // Stok sıralama hiyerarşisi (2026-10-30) — web arayüzü ve API ile BİREBİR aynı:
    //   0 🟢 stokta + aynı renk   1 🔴 tükendi + aynı renk
    //   2 🎨 stokta + farklı      3 🎨 tükendi + farklı      4 ⚪ bulunamadı
    // Fiyat ne kadar ucuz olursa olsun tükenmiş ürün stokta olanın önüne GEÇMEZ.
    const stokGrubu = (r) => {
      if (!r || r.status !== 'found' || !r.product) return 4;
      const ayniRenk = r.renkAyni !== false;
      const stokta = r.product.inStock !== false;
      if (ayniRenk) return stokta ? 0 : 1;
      return stokta ? 2 : 3;
    };
    items.sort((a, b) => {
      const fark = stokGrubu(a) - stokGrubu(b);
      if (fark !== 0) return fark;
      const pA = getPrice(a);
      const pB = getPrice(b);
      return sortOrder === 'desc' ? (pB - pA) : (pA - pB);
    });

    if (items.length === 0) {
      resultsList.innerHTML = '<div class="eun-empty-state">Bu filtreye uygun sonuç bulunamadı.</div>';
      return;
    }

    const liveHeader = result.isLive
      ? `<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;font-weight:600;margin-bottom:8px;">
          <span style="display:inline-block;animation:eunSpin 1s linear infinite;">⚡</span> Canlı Akış: <b>${items.length} mağaza</b> bulundu, kalan siteler arka planda taranıyor...
        </div>`
      : '';

    resultsList.innerHTML = liveHeader + items.map(r => {
      const p = r.product;
      const price = getPrice(r);
      const isCheapest = r.enUcuz;
      const url = p.url || '#';

      // Mevcut site ile fark hesapla
      let diffHtml = '';
      if (basePrice && price) {
        const diff = price - basePrice;
        if (Math.abs(diff) < 1) {
          diffHtml = '<span class="eun-diff same">Aynı Fiyat</span>';
        } else if (diff < 0) {
          diffHtml = `<span class="eun-diff cheap">🟢 ${tl(Math.abs(diff))} Daha Ucuz</span>`;
        } else {
          diffHtml = `<span class="eun-diff exp">🔴 +${tl(diff)}</span>`;
        }
      }

      // Rozetler
      let tagsHtml = '';
      if (p.inStock === false) {
        tagsHtml += '<span class="eun-tag" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;">🔴 Stokta Yok</span>';
      }
      if (r.kargoBedava || p.pricing?.kargo?.ucret === 0 || p.pricing?.kargo?.uygulanir === false || /ücretsiz|bedava/i.test(String(p.shipping || ''))) {
        tagsHtml += '<span class="eun-tag kargo">📦 Kargo Bedava</span>';
      }
      if (r.resmiSatici || p.officialSeller || ['trendyol', 'hepsiburada', 'amazon', 'vatan', 'mediamarkt', 'teknosa', 'itopya', 'robitshop', 'robotistan', 'direnc', 'samm'].includes(r.site)) {
        tagsHtml += '<span class="eun-tag resmi">🏢 Resmi Satıcı</span>';
      }
      if (r.birebirModel) {
        tagsHtml += '<span class="eun-tag match">✔ Birebir Eşleşti</span>';
      }

      const stoktaYok = p.inStock === false;
      return `
        <div class="eun-item-card ${isCheapest ? 'is-cheapest' : ''} ${stoktaYok ? 'is-out-of-stock' : ''}">
          <div class="eun-item-header">
            <span class="eun-item-site">${esc(r.siteName || r.site)}</span>
            ${isCheapest ? '<span class="eun-badge-best">🏷️ EN UCUZ</span>' : ''}
            ${stoktaYok ? '<span class="eun-tag" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;font-weight:700;">🔴 TÜKENDİ</span>' : ''}
            <div class="eun-item-tags">${tagsHtml}</div>
          </div>
          <div class="eun-item-title">${esc(p.title || 'Ürün')}</div>
          <div class="eun-item-price-row">
            <div class="eun-price-group">
              <span class="eun-price-val" style="${stoktaYok ? 'color:#64748b;' : ''}">${tl(price)}</span>
              ${stoktaYok ? '<span style="font-size:11px;color:#dc2626;font-weight:700;margin-left:4px;">(Stokta Yok)</span>' : diffHtml}
            </div>
            <a href="${esc(url)}" target="_blank" rel="noopener" class="eun-go-btn" style="${stoktaYok ? 'background:#94a3b8;' : ''}">${stoktaYok ? 'İncele ➔' : 'Siteye Git ➔'}</a>
          </div>
        </div>
      `;
    }).join('');
  }

  // İlk yükleme
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // SPA geçişleri
  let lastUrl = window.location.href;
  const obs = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(initUI, 800);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });









  

function renderSparkline(timeline) {
    const box = document.getElementById('eunTrendBox');
    const container = document.getElementById('eunSparklineContainer');
    if (!box || !container || !timeline || timeline.length < 2) return;
    box.style.display = 'block';
    const values = timeline.map(t => t.lowest);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) || 1;
    const w = 300, h = 42, pad = 4;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * (w - 2 * pad) + pad,
      y: h - pad - ((v - minVal) / range) * (h - 2 * pad)
    }));
    const dPath = 'M ' + pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L ');
    const dArea = dPath + ' L ' + (w - pad) + ' ' + h + ' L ' + pad + ' ' + h + ' Z';
    const lastPt = pts[pts.length - 1];
    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="eunSpark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/><stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/></linearGradient></defs><path d="' + dArea + '" fill="url(#eunSpark)"/><path d="' + dPath + '" fill="none" stroke="#10b981" stroke-width="2"/><circle cx="' + lastPt.x.toFixed(1) + '" cy="' + lastPt.y.toFixed(1) + '" r="3.5" fill="#10b981" stroke="#fff" stroke-width="1.5"/></svg>';
  }
})();
