/** domirobot sayfalarını doğru kodlamayla çekip önbelleğe yaz. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CACHE_DIR = 'data/cache';

function hashKey(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
}

async function cekKodlamali(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    const buf = await res.arrayBuffer();
    clearTimeout(t);
    const onizleme = new TextDecoder('utf-8').decode(buf.slice(0, 4096));
    const cs = (onizleme.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
    console.log('  kodlama:', cs);
    const destekli = ['utf-8', 'windows-1254', 'iso-8859-9', 'iso-8859-1', 'windows-1252'];
    const text = new TextDecoder(destekli.includes(cs) ? cs : 'utf-8').decode(buf);
    return { durum: res.status, text };
  } catch (e) { clearTimeout(t); return { durum: 0, text: '' }; }
}

function onbellegeYaz(url, body) {
  const key = hashKey('GET ' + url);
  fs.writeFileSync(path.join(CACHE_DIR, key + '.json'), JSON.stringify({ url, status: 200, body, renderUsed: false, ts: Date.now() }));
}

const q = encodeURIComponent('pla filament');
const sayfalar = [
  ['https://www.domirobot.com/arama?q=' + q, 'arama'],
  ['https://www.domirobot.com/anycubic-ace-2-pro-cok-renkli-filament-sistemi-kobra-x-kobra-s1-pmu7877', 'urun'],
];
for (const [url, tur] of sayfalar) {
  console.log(tur + ':', url.slice(0, 80));
  const r = await cekKodlamali(url);
  console.log('  durum:', r.durum, '| boyut:', r.text.length, '| ornek:', r.text.includes('Yazıcı') ? 'Türkçe OK' : 'hala bozuk?');
  if (r.durum === 200) {
    onbellegeYaz(url, r.text);
    fs.writeFileSync('data/explore/3d/' + (tur === 'arama' ? 'arama-domirobot.html' : 'urun-domirobot.html'), r.text);
  }
}
