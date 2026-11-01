// eSun PLA Basic Gri kaynak adayı arama (kullanıcı senaryosu)
import { adapters } from '../src/sites/index.js';
for (const siteId of ['3dortgen', 'samm', 'domirobot', 'matersan', 'direnc', 'robotistan', 'filamentmarketim', 'teknikfilament3d', '3dultra', 'robotizmo', '3dcim']) {
  const a = adapters.find(x => x.id === siteId);
  if (!a) continue;
  const ctx = { spend: 0 };
  try {
    const r = await a.searchProducts('esun pla basic gri', ctx);
    const gri = r.filter(u => /esun/i.test(u.title || '') && /gri/i.test(u.title || ''));
    if (gri.length) {
      console.log(`${siteId}:`);
      for (const u of gri.slice(0, 4)) console.log('   ', (u.title || '').slice(0, 65), '|', (u.url || '').slice(0, 80));
    }
  } catch (e) { /* sessiz */ }
}
