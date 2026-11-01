/** ciceksepeti + urhanshop önbellek hazırlığı ve adaptör testi. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = 'data/cache';
function hashKey(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 40); }
function onbellegeYaz(url, body, render = false) {
  fs.writeFileSync(path.join(CACHE_DIR, hashKey('GET ' + url) + '.json'), JSON.stringify({ url, status: 200, body, renderUsed: render, ts: Date.now() }));
  console.log('  +', url.slice(0, 90), '(' + body.length + ' bayt)');
}

// ciceksepeti: arama (query=orşide — kayitli render) + urun sayfasi (kayitli render)
console.log('=== ciceksepeti ===');
onbellegeYaz('https://www.ciceksepeti.com/arama?query=' + encodeURIComponent('orşide'), fs.readFileSync('data/explore/yeni/arama-ciceksepeti.html', 'utf8'), true);
onbellegeYaz('https://www.ciceksepeti.com/mor-buketli-sakisida-beyaz-cift-orkide-ve-fenix-at6126', fs.readFileSync('data/explore/yeni/urun-ciceksepeti.html', 'utf8'), true);

// urhanshop: urun sayfasi (kayitli, dogrudan cekilmisti)
console.log('=== urhanshop ===');
onbellegeYaz('https://www.urhanshop.com/kingroon-petg-basic-beyaz-filament-1,75-mm-1-kg-u127806', fs.readFileSync('data/explore/yeni/urun-urhanshop.html', 'utf8'));

console.log('\nHazir.');
