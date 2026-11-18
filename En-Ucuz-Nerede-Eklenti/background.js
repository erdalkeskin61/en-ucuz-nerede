// En Ucuz Nerede? — Background Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'START_COMPARE') {
    handleStartCompare(request.url)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (request.type === 'CHECK_JOB') {
    handleCheckJob(request.isId)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (request.type === 'PING_SERVER') {
    handlePing()
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (request.type === 'GET_PRICE_HISTORY') {
    handlePriceHistory(request.payload).then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (request.type === 'ADD_TRACKED') {
    handleAddTracked(request.sonuc, request.hedefFiyat)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function getServerUrl() {
  try {
    const res = await chrome.storage.local.get(['serverUrl']);
    return (res.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  } catch {
    return 'http://localhost:3000';
  }
}

async function handleStartCompare(url) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.hata || `Sunucu hatası: HTTP ${res.status}`);
  }
  const data = await res.json();
  return { ok: true, isId: data.isId };
}

async function handleCheckJob(isId) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/compare/${isId}`);
  if (!res.ok) {
    throw new Error(`İş sorgulanamadı: HTTP ${res.status}`);
  }
  const job = await res.json();
  return { ok: true, job };
}

async function handlePing() {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/ping`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { ok: true, data };
}

async function handleAddTracked(sonuc, hedefFiyat) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/tracked`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sonuc, hedefFiyat }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.hata || `Hata: HTTP ${res.status}`);
  }
  const item = await res.json();
  return { ok: true, item };
}

async function handlePriceHistory(payload) {
  const server = await getServerUrl();
  const res = await fetch(`${server}/api/price-history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  if (!res.ok) throw new Error(HTTP );
  const data = await res.json();
  return { ok: true, data };
}
