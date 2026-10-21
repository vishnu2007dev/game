// Clicks through the intro: start, skip, title, begin, replay. Fails on page errors.
import { chromium } from 'playwright-core';
import { globSync } from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:4173/';
const full = process.argv[3] === 'full';
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url);
await p.click('#start-intro', { timeout: 180000 });
console.log('started');
if (!full) {
  await p.waitForTimeout(4000);
  await p.getByRole('button', { name: 'Skip intro', exact: true }).click();
  console.log('skipped');
}
await p.waitForSelector('#title-begin', { timeout: full ? 1500000 : 300000 });
await p.waitForTimeout(2000);
await p.screenshot({ path: 'screenshots/intro-title.png' });
console.log('title shown');
await p.click('#title-begin');
await p.waitForSelector('#next-replay', { timeout: 60000 });
console.log('coming next shown');
await p.click('#next-replay');
await p.waitForSelector('.ov-skip', { timeout: 60000 });
console.log('replay started');
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await b.close();
process.exit(errors.length ? 1 : 0);
