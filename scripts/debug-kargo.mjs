/** "—" çıkan sitelerin önbellekli sayfalarındaki kargo metinlerini yakından incele. */
import fs from 'node:fs';
import path from 'node:path';
import { decodeEntities } from '../src/util.js';

const CACHE_DIR = 'data/cache';
const HEDEFLER = ['motorobit.com', 'vatanbilgisayar.com', 'urhanshop.com', 'sivasrobotik.com.tr', '3dteknomarket.com', 'domirobot.com', 'deneystore.com', 'trendruum.com', 'shop.3dortgen.com', 'hepsivar.com', 'teknikfilament3d.com', 'filamentmarketim.com', 'koctas.com.tr', 'itopya.com'];

const dosyalar = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
const siteSayfa = new Map();
for (const f of dosyalar) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const host = (j.url || '').split('/')[2]?.replace(/^www\./, '');
    if (!host) continue;
    if (!siteSayfa.has(host) || (j.body || '').length > siteSayfa.get(host).body.length) {
      siteSayfa.set(host, j);
    }
  } catch {}
}

for (const hedef of HEDEFLER) {
  const j = siteSayfa.get(hedef);
  if (!j) { console.log('\n### ' + hedef + ': önbellekte sayfa yok'); continue; }
  const metin = decodeEntities(String(j.body).replace(/<!--[\s\S]*?-->/g, ' ')).toLowerCase();
  console.log('\n### ' + hedef + ' (' + j.url.slice(0, 60) + ')');
  // "kargo" geçen tüm eşsiz kısa bağlamlar
  const baglamlar = new Set();
  let idx = -1;
  while ((idx = metin.indexOf('kargo', idx + 1)) >= 0 && baglamlar.size < 14) {
    const cevre = metin.slice(Math.max(0, idx - 70), idx + 90).replace(/\s+/g, ' ').trim();
    // Anlamlı görünenleri al (harf içeriyor, çok kısa değil)
    if (/[a-zçğıöşü]/.test(cevre) && cevre.length > 15) baglamlar.add(cevre.slice(0, 155));
  }
  for (const b of baglamlar) console.log('  ·', b);
}
