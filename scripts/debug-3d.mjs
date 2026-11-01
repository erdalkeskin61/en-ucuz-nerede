/** buildQueries + regresyon hızlı kontrol. */
import { buildQueries } from '../src/pipeline.js';

const vakalar = [
  { ad: 'G102', src: { title: 'Logitech G102 Lightsync Oyuncu Mouse Siyah', brand: 'Logitech', modelCode: 'G102' } },
  { ad: 'Beta (SKU)', src: { title: 'Beta Filament Beta PLA+ Filament White', brand: 'Beta Filament', modelCode: 'BPLABYZ' } },
  { ad: 'Bambu', src: { title: 'Bambu Lab PLA Basic Filament Beyaz 1kg', brand: 'Bambu Lab', modelCode: null } },
];
for (const v of vakalar) console.log(v.ad + ':', JSON.stringify(buildQueries(v.src)));
