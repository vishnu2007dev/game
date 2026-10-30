// Renders each trailer moment as a still: node scripts/shot-stills.mjs [base] [w] [h] [names]
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const names = (process.argv[5] ?? 'calm,alarm,panel,screens,pipe,porthole,blast,wreck').split(',');
mkdirSync('screenshots/stills', { recursive: true });
const browser = await launchBrowser();
for (const n of names) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => console.log(n, 'PAGEERROR', e.message));
  await page.goto(`${base}?still=${n}`);
  await page.waitForFunction(() => window.__STILL === true, null, { timeout: 180000 });
  await page.waitForTimeout(n === 'wreck' ? 2500 : 300);
  await page.screenshot({ path: `screenshots/stills/${width < 700 ? 'phone-' : ''}${n}.png`, timeout: 120000 });
  console.log('saved', n);
  await page.close();
}
await browser.close();
