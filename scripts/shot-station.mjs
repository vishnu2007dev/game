// Station view checks: overview and a few rooms. node scripts/shot-station.mjs [base] [w] [h] [rooms]
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const rooms = (process.argv[5] ?? 'ballast,lab').split(',').filter(Boolean);
const tag = w < 700 ? 'phone' : 'desk';
mkdirSync('screenshots/station', { recursive: true });
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto(`${base}?station`);
await p.waitForSelector('.sh:not([hidden])', { timeout: 240000 });
await p.waitForTimeout(6000);
await p.screenshot({ path: `screenshots/station/${tag}-overview.png`, timeout: 120000 });
console.log('overview');
for (const r of rooms) {
  await p.evaluate((id) => window.__station.showStation(id), r);
  await p.waitForTimeout(7000);
  await p.screenshot({ path: `screenshots/station/${tag}-${r}.png`, timeout: 120000 });
  console.log(r);
}
await b.close();
