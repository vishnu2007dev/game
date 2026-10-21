// Station interaction check: tap a crew member, then fly into Command and sit at the desk.
import { chromium } from 'playwright-core';
import { globSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`${base}?station&snap`);
await p.waitForSelector('.sh:not([hidden])', { timeout: 240000 });
await p.waitForTimeout(5000);
await p.mouse.click(1130, 370); // Ilya in quarters
await p.waitForTimeout(5000);
await p.screenshot({ path: 'screenshots/station/test-crew.png', timeout: 120000 });
console.log('card', await p.locator('.sh-card-name').textContent());
await p.getByRole('button', { name: 'Back to station', exact: true }).click();
await p.waitForTimeout(1000);
console.log('after back', await p.locator('.sh').innerText().then((t) => t.split('\n').slice(0, 4).join(' | ')));
// The software renderer is slow, so the camera is moved directly rather than waiting on it.
await p.evaluate(() => window.__station.showStation('command'));
await p.waitForTimeout(9000);
console.log('room', await p.locator('.sh').innerText().then((t) => t.split('\n').slice(0, 4).join(' | ')));
await p.evaluate(() => window.__station.onStation({ type: 'control' })); // same as a second tap on Command
await p.waitForTimeout(9000);
await p.screenshot({ path: 'screenshots/station/test-control.png', timeout: 120000 });
console.log('cinematic', await p.evaluate(() => document.documentElement.className + ' ' + document.body.className));
await b.close();
