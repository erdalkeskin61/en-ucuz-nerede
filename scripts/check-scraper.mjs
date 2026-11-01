// ScraperAPI anahtarını ve kalan krediyi kontrol eder ( scrape kredisi harcamaz ).
import { config } from '../src/config.js';

const key = config.scraperApiKey;
if (!key) {
  console.log('HAZIR DEĞİL: SCRAPERAPI_KEY tanımlı değil.');
  process.exit(1);
}

try {
  const res = await fetch('https://api.scraperapi.com/account/?api_key=' + encodeURIComponent(key));
  const text = await res.text();
  if (!res.ok) {
    console.log('HAZIR DEĞİL: HTTP ' + res.status + ' — ' + text.slice(0, 300));
    process.exit(1);
  }
  const data = JSON.parse(text);
  // Anahtarı asla yazdırmıyoruz; sadece hesap bilgilerini gösteriyoruz.
  console.log('OK: hesap bilgisi ->', JSON.stringify(data));
} catch (e) {
  console.log('HAZIR DEĞİL: ' + (e.message || e));
  process.exit(1);
}
