// YZ API bağlantısını doğrular ( ScraperAPI kredisi harcamaz ).
import { config } from '../src/config.js';

const key = config.ai.apiKey;
if (!key) {
  console.log('HAZIR DEĞİL: EVREN_LLM_API_KEY tanımlı değil.');
  process.exit(1);
}

try {
  const res = await fetch(config.ai.baseURL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: config.ai.model,
      messages: [{ role: 'user', content: 'Sadece "hazir" yaz.' }],
      max_tokens: 20,
      temperature: 0,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log('HAZIR DEĞİL: HTTP ' + res.status + ' — ' + text.slice(0, 300));
    process.exit(1);
  }
  const data = JSON.parse(text);
  const reply = data.choices?.[0]?.message?.content ?? '';
  console.log('OK: model yanıt verdi ->', JSON.stringify(String(reply).trim().slice(0, 80)));
} catch (e) {
  console.log('HAZIR DEĞİL: ' + (e.message || e));
  process.exit(1);
}
