const $ = (s) => document.querySelector(s);

const KNOWN_SITES = [
  { match: 'trendyol.com', name: 'Trendyol' },
  { match: 'hepsiburada.com', name: 'Hepsiburada' },
  { match: 'amazon.com.tr', name: 'Amazon TR' },
  { match: 'vatanbilgisayar.com', name: 'Vatan Bilgisayar' },
  { match: 'mediamarkt.com.tr', name: 'MediaMarkt' },
  { match: 'n11.com', name: 'N11' },
  { match: 'itopya.com', name: 'İtopya' },
  { match: 'pazarama.com', name: 'Pazarama' },
  { match: 'ciceksepeti.com', name: 'ÇiçekSepeti' },
  { match: 'teknosa.com', name: 'Teknosa' },
  { match: 'incehesap.com', name: 'İncehesap' },
  { match: 'sinerji.gen.tr', name: 'Sinerji' },
  { match: 'tebilon.com', name: 'Tebilon' },
  { match: 'gaming.gen.tr', name: 'Gaming.Gen.TR' },
  { match: 'robitshop.com', name: 'Robitshop' },
  { match: 'robotistan.com', name: 'Robotistan' }
];

async function checkServerHealth(serverUrl) {
  const badge = $('#appStatus');
  try {
    const res = await fetch(serverUrl.replace(/\/+$/, '') + '/api/ping', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    const count = data.siteler ? data.siteler.length : 55;
    badge.className = 'status-badge online';
    badge.textContent = `🟢 ${count} Site Aktif`;
  } catch (err) {
    badge.className = 'status-badge offline';
    badge.textContent = '🔴 Bağlantı Yok';
    badge.title = 'Sunucu kapalı veya ulaşılamıyor: ' + serverUrl;
  }
}

async function init() {
  chrome.storage.local.get(['serverUrl'], async (res) => {
    let serverUrl = res.serverUrl || 'http://localhost:3000';
    $('#serverUrlInput').value = serverUrl;
    $('#serverInfoLabel').textContent = 'Sunucu: ' + serverUrl;
    checkServerHealth(serverUrl);
  });

  // Aktif sekmeyi analiz et
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      $('#productUrl').value = tab.url;
      $('#pageTitle').textContent = tab.title || tab.url;

      const urlLower = tab.url.toLowerCase();
      const detected = KNOWN_SITES.find(s => urlLower.includes(s.match));
      if (detected) {
        $('#siteTag').textContent = detected.name;
        $('#siteTag').style.display = 'inline-block';
        $('#productDetectedBadge').style.display = 'inline';
        $('#compareBtnText').textContent = `${detected.name} Harici 54 Sitede Karşılaştır`;
      }
    }
  } catch (e) {
    $('#pageTitle').textContent = 'Sekme bilgisi alınamadı.';
  }

  // Karşılaştır butonu
  $('#compareBtn').addEventListener('click', () => {
    const url = $('#productUrl').value.trim();
    if (!url) return;

    chrome.storage.local.get(['serverUrl'], (res) => {
      const serverUrl = (res.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
      const targetUrl = `${serverUrl}/?url=${encodeURIComponent(url)}`;
      chrome.tabs.create({ url: targetUrl });
      window.close();
    });
  });

  // Hızlı bağlantılar
  $('#openAppBtn').addEventListener('click', () => {
    chrome.storage.local.get(['serverUrl'], (res) => {
      const serverUrl = res.serverUrl || 'http://localhost:3000';
      chrome.tabs.create({ url: serverUrl });
    });
  });

  $('#openSettingsBtn').addEventListener('click', () => {
    chrome.storage.local.get(['serverUrl'], (res) => {
      const serverUrl = (res.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
      chrome.tabs.create({ url: `${serverUrl}/ayarlar.html` });
    });
  });

  // Sunucu paneli aç/kapat
  $('#toggleServerPanel').addEventListener('click', () => {
    $('#serverPanel').classList.toggle('open');
  });

  // Sunucu kaydet
  $('#saveServerBtn').addEventListener('click', () => {
    let newUrl = $('#serverUrlInput').value.trim();
    if (!newUrl) newUrl = 'http://localhost:3000';
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      newUrl = 'http://' + newUrl;
    }
    chrome.storage.local.set({ serverUrl: newUrl }, () => {
      $('#serverInfoLabel').textContent = 'Sunucu: ' + newUrl;
      $('#serverPanel').classList.remove('open');
      checkServerHealth(newUrl);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);