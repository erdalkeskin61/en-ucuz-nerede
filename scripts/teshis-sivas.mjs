/** Sivas Robotik ürün sayfası — Crawlbase ne döndürüyor? */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();

const u = 'https://sivasrobotik.com.tr/3d/929-creality-hyper-pla-mavi.html';
const r = await fetch('https://api.crawlbase.com/?' + new URLSearchParams({ token: cb, url: u }), { signal: AbortSignal.timeout(90000) });
const b = await r.arrayBuffer();
let txt;
try { txt = zlib.gunzipSync(Buffer.from(b)).toString(); } catch { txt = new TextDecoder().decode(b); }
console.log('durum:', r.status, '| cb:', r.headers.get('cb_status'), '| orijinal:', r.headers.get('original_status'), '| son url:', (r.headers.get('url') || '').slice(0, 80));
console.log('boyut:', txt.length, '| JSON-LD Product:', /"@type"\s*:\s*"Product"/.test(txt), '| title:', (txt.match(/<title>([^<]{3,60})</i)?.[1] || 'yok').trim().slice(0, 50));
console.log('ilk 300:', txt.slice(0, 300).replace(/\s+/g, ' '));
