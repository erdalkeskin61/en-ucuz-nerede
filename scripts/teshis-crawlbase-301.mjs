/** Crawlbase 301 davranışı: nmosphere araması — gövde ve URL başlıkları ne diyor? */
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = fs.readFileSync('.env', 'utf8');
const cb = env.match(/CRAWLBASE_TOKEN=([^\r\n]+)/)?.[1]?.trim();

for (const hedef of [
  'https://nmosphere.com.tr/?q=pla+filament',
  'https://robo90.com/?q=pla+filament',
]) {
  const res = await fetch('https://api.crawlbase.com/?' + new URLSearchParams({ token: cb, url: hedef }), { signal: AbortSignal.timeout(90000) });
  const buf = await res.arrayBuffer();
  let text;
  try { text = zlib.gunzipSync(Buffer.from(buf)).toString(); } catch { text = new TextDecoder().decode(buf); }
  console.log('\n' + hedef);
  console.log('  cb:', res.headers.get('cb_status'), '| orijinal:', res.headers.get('original_status'), '| son url:', (res.headers.get('url') || '').slice(0, 80));
  console.log('  gövde boyutu:', text.length, '| title:', (text.match(/<title>([^<]{3,60})</i)?.[1] || 'yok').trim().slice(0, 50));
  console.log('  JSON-LD ItemList:', text.includes('ItemList'), '| ürünBaşlığı geçiyor:', /pla|filament/i.test(text));
}
