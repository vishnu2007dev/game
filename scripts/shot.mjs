// Usage: node scripts/shot.mjs [url]
// Captures desktop and mobile screenshots of the app once window.__READY is true.
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';


mkdirSync('screenshots', { recursive: true });
const browser = await launchBrowser();

async function capture(name, opts) {
  const context = await browser.newContext(opts.context);
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[${name}] console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[${name}] page error: ${err.message}`));
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__READY === true, null, { timeout: 60000 });
  } catch {
    console.log(`[${name}] __READY not set within 60s, capturing anyway`);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`saved screenshots/${name}.png`);
  await context.close();
}

try {
  await capture('desktop', {
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  });
  await capture('mobile', {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  });
} finally {
  await browser.close();
}
