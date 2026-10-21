// Plays meet the crew and the tutorial end to end, as a player would.
// node scripts/test-onboarding.mjs [base] [w] [h]
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const tag = w < 700 ? 'phone' : 'desk';
mkdirSync('screenshots/onboarding', { recursive: true });
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 700 ? 2 : 1, hasTouch: w < 700 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = (name) => p.screenshot({ path: `screenshots/onboarding/${tag}-${name}.png`, timeout: 120000 });
const coach = () => p.evaluate(() => `${document.querySelector('.co').hidden ? '[hidden] ' : ''}${document.querySelector('.co-text').textContent} | ${document.querySelector('.sh-place').textContent} | ${document.getElementById('app').className}`);
await p.goto(`${base}?station&snap&tutorial`);
await p.waitForSelector('.sh-card-next:not([hidden])', { timeout: 240000 });
await p.waitForTimeout(3000);
await shot('meet-1');
for (let i = 2; i <= 5; i++) {
  await p.locator('.sh-card-next').click();
  await p.waitForTimeout(i === 3 ? 3000 : 800);
  if (i === 3) await shot('meet-3');
}
console.log('meet last', await p.locator('.sh-card-name').textContent());
await p.locator('.sh-card-next').click();
await p.waitForSelector('.co:not([hidden])', { timeout: 60000 });
await p.waitForTimeout(2500);
await shot('tut-1');
console.log('1:', await coach());
// The software renderer in CI is slow, so a tap can land before the new
// view has drawn. Retry an action until the tutorial moves on.
const until = async (label, act, done) => {
  for (let i = 0; i < 4; i++) {
    await act();
    for (let k = 0; k < 16; k++) {
      await p.waitForTimeout(500);
      if (await done()) return;
    }
  }
  throw new Error(`stuck at ${label}`);
};
const stepIs = (text) => async () => (await p.locator('.co-text').textContent()).startsWith(text);
const tapRoom = async (id) => {
  const pt = await p.evaluate((r) => window.__station.screenPoint(r), id);
  await p.mouse.click(pt.x, pt.y);
};
await until('room', () => tapRoom('power'), stepIs('Tap Back'));
console.log('2:', await coach());
await shot('tut-2');
await until('back', () => p.locator('.sh-back').click(), stepIs('This is your crew'));
console.log('3:', await coach());
await shot('tut-3');
await until('roster', async () => {
  if (w < 700) await p.locator('.ro-toggle').click();
  await p.locator('.ro-row').nth(1).click();
}, stepIs('Command is'));
await p.waitForTimeout(2000);
console.log('4:', await coach());
await shot('tut-4');
await p.locator('.sh-back').click();
await p.waitForTimeout(1500);
if (w < 700) {
  // Portrait: drag the station sideways until Command is on screen.
  await p.mouse.move(80, h * 0.55);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(80 + i * 35, h * 0.55);
  await p.mouse.up();
  await p.waitForTimeout(3000);
  await shot('tut-4-drag');
}
await until('command room', () => tapRoom('command'), async () => (await p.locator('.sh-place').textContent()) === 'C1 Command');
await until('desk', () => tapRoom('command'), stepIs('Tap a screen'));
await p.waitForTimeout(3000);
console.log('5:', await coach());
await shot('tut-5');
await until('read', () => p.mouse.click(w / 2, h * 0.5), async () => !(await p.locator('.co-next').isHidden()));
console.log('6:', await coach());
await shot('tut-6');
await p.locator('.co-next').click();
await p.waitForTimeout(500);
console.log('coach hidden', await p.locator('.co').isHidden(), 'stored', await p.evaluate(() => localStorage.getItem('helios.onboarded')));
await b.close();
