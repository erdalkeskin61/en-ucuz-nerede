/** IdeaSoft smart: tutarli User-Agent ile akis testi. */
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
process.env.SCRAPERAPI_KEY = env.match(/SCRAPERAPI_KEY=([^\r\n]+)/)?.[1]?.trim();
const { fetchPage } = await import('../src/scraper.js');

const base = 'https://www.filamentmarketim.com';
const oturum = 'vrf' + Date.now().toString(36);
const SORGU = 'petg filament';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// token: sabit UA ile
const r0 = await fetchPage(base + '/', { site: 'debug', purpose: 'token', session: oturum, fresh: true, headers: { 'User-Agent': UA } });
const token = r0.body.match(/SITE_CONFIG\s*=\s*\{[\s\S]{0,800}?token:\s*['"]([^'"]+)['"]/)?.[1];
console.log('token:', token ? 'OK' : 'YOK');

// POST: ayni UA ile
const body = new URLSearchParams({ dataType: 'json', phrase: SORGU }).toString();
const r = await fetchPage(base + '/client/Visitor/search?length=20', {
  site: 'debug', purpose: 'arama', method: 'POST',
  headers: {
    'User-Agent': UA,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept-Content-Token': token,
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': base + '/',
  },
  body, session: oturum,
});
console.log('POST:', r.status, '| boyut:', r.body.length);
let j = null;
try { j = JSON.parse(r.body); } catch { }
console.log('sonuc:', Array.isArray(j) ? j.length + ' urun | ilk: ' + (j[0]?.name || '?') : r.body.slice(0, 120));
