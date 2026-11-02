// Құрастыру тексерісі: service worker кэштейтін барлық файл бар ма
import { readFileSync, existsSync } from 'node:fs';
const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const list = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
const missing = list.filter(p => !existsSync(new URL('../' + p, import.meta.url)));
if (missing.length) { console.error('Жоқ файлдар:', missing); process.exit(1); }
console.log(`OK: ${list.length} файл тексерілді`);
