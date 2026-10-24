// The Power room and the generator sync panel. node scripts/shot-sync.mjs [base] [w] [h]
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const tag = w < 700 ? 'phone' : 'desk';
mkdirSync('screenshots/day1', { recursive: true });
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: w < 700 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.addInitScript(() => localStorage.setItem('helios.onboarded', '1'));
await p.goto(`${base}?station&snap&q=low`);
await p.waitForSelector('.ob:not([hidden])', { timeout: 300000 });
await p.evaluate(() => window.__station.showStation('power'));
await p.waitForTimeout(5000);
await p.screenshot({ path: `screenshots/day1/${tag}-power-room.png`, timeout: 300000 });
for (let i = 0; i < 5 && !(await p.locator('.tk').count()); i++) {
  const pt = await p.evaluate(() => window.__station.hotspotPoint('sync'));
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(6000);
}
await p.waitForSelector('.tk-canvas', { timeout: 120000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: `screenshots/day1/${tag}-sync.png`, timeout: 300000 });
console.log('ok');
await b.close();
