// Screenshots of the desk after leaning in to a screen with a number key.
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
async function capture(name, key, context) {
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 90000 }).catch(() => {});
  await page.keyboard.press(key);
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`saved screenshots/${name}.png`);
  await ctx.close();
}
await capture('focus-overview', '1', { viewport: { width: 1440, height: 900 } });
await capture('focus-trends', '2', { viewport: { width: 1440, height: 900 } });
await capture('focus-phone-landscape', '1', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await browser.close();
