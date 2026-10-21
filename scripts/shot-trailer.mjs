// Captures frames across the intro trailer and the title card.
import { chromium } from 'playwright-core';
import { mkdirSync, globSync, rmSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const dir = 'screenshots/trailer';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0],
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url);
await page.waitForSelector('#start-intro', { timeout: 120000 });
await page.waitForTimeout(2000);
await page.click('#start-intro');
const start = Date.now();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1200);
  const s = ((Date.now() - start) / 1000).toFixed(0).padStart(2, '0');
  await page.screenshot({ path: `${dir}/t${s}.png` });
  if (await page.$('#title-begin')) {
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${dir}/title.png` });
    break;
  }
}
console.log('done in', ((Date.now() - start) / 1000).toFixed(0), 's');
await browser.close();
