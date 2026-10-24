// Plays Day 1 the way a player would: every check, two calls, the night.
// node scripts/test-day1.mjs [base] [w] [h]
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const w = Number(process.argv[3] ?? 1440);
const h = Number(process.argv[4] ?? 900);
const tag = w < 700 ? 'phone' : 'desk';
mkdirSync('screenshots/day1', { recursive: true });
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const shot = (name) => p.screenshot({ path: `screenshots/day1/${tag}-${name}.png`, timeout: 300000 });
await p.addInitScript(() => localStorage.setItem('helios.onboarded', '1'));
await p.goto(`${base}?station&snap&q=low`);
await p.waitForSelector('.ob:not([hidden])', { timeout: 300000 });
await p.waitForTimeout(3000);
await shot('start');

// The software renderer is slow: retry a tap until something opens.
const until = async (label, act, done, tries = 5) => {
  for (let i = 0; i < tries; i++) {
    await act();
    for (let k = 0; k < 16; k++) {
      await p.waitForTimeout(500);
      if (await done()) return;
    }
  }
  throw new Error(`stuck at ${label}`);
};
const tapSpot = async (id) => {
  const pt = await p.evaluate((s) => window.__station.hotspotPoint(s), id);
  await p.mouse.click(pt.x, pt.y);
};
const status = () => p.locator('.tk-status').textContent();
const canvasBox = () => p.locator('.tk-canvas').boundingBox();
const toPage = (box, x, y) => ({ x: box.x + (x / 520) * box.width, y: box.y + (y / 300) * box.height });

// 1. Valve in Ballast.
await until('valve', () => tapSpot('valve'), () => p.locator('.tk').isVisible());
let box = await canvasBox();
const c = toPage(box, 380, 150);
const r = (92 / 520) * box.width;
await p.mouse.move(c.x + r, c.y);
await p.mouse.down();
let a = 0;
for (let i = 0; i < 600; i++) {
  a += 0.1;
  await p.mouse.move(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
  await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  if ((await status()).startsWith('In the band')) break;
}
await shot('valve');
await p.mouse.up();
await p.waitForSelector('.tk', { state: 'detached', timeout: 30000 });
console.log('valve done', await p.locator('.ob-count').textContent());

// 2. Generator sync in Power: trim the governor, then close in phase.
await until('sync', () => tapSpot('sync'), () => p.locator('.tk').isVisible());
box = await canvasBox();
const knob = toPage(box, 400, 112);
const read = (k) => p.locator('.tk-canvas').getAttribute(`data-${k}`).then(Number);
const frame = () => p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
let shotTaken = false;
for (let tries = 0; tries < 60 && (await p.locator('.tk-canvas').count()); tries++) {
  const slip = await read('slip');
  if (Math.abs(slip) >= 0.1) {
    // Drag down to slow the generator: 80 canvas px per hertz.
    const dy = (slip * 80 * box.height) / 300;
    await p.mouse.move(knob.x, knob.y);
    await p.mouse.down();
    await p.mouse.move(knob.x, knob.y + dy, { steps: 4 });
    await p.mouse.up();
    await frame();
    continue;
  }
  if (!shotTaken) {
    await shot('sync');
    shotTaken = true;
  }
  const angle = await read('angle');
  console.log('sync try', tries, 'slip', slip, 'angle', angle);
  if (Math.abs(angle) < 12) {
    await p.locator('.tk-breaker').click();
    await p.waitForTimeout(1500);
  } else await frame();
}
await p.waitForSelector('.tk', { state: 'detached', timeout: 60000 });
console.log('sync done', await p.locator('.ob-count').textContent());

// 3. Call Teo for the gate code, then the keypad.
const callRow = async (i) => {
  if (w < 700) await p.locator('.ro-toggle').click();
  await p.locator('.ro-call').nth(i).click();
};
await callRow(3);
await p.waitForSelector('.ch-choice', { timeout: 60000 });
await p.waitForTimeout(2500);
await shot('chat');
await p.locator('.ch-choice').nth(1).click();
await p.waitForSelector('.ch-hang', { timeout: 60000 });
console.log('teo said:', (await p.locator('.ch-body').textContent()).slice(-160));
await p.locator('.ch-hang').click();
await p.waitForTimeout(800);
const code = await p.evaluate(() => window.__ctx.state.hatchCode);
await until('keypad', () => tapSpot('keypad'), () => p.locator('.tk').isVisible());
for (const d of code) await p.locator('.tk-key', { hasText: new RegExp(`^${d}$`) }).click();
await shot('keypad');
await p.locator('.tk-key.is-ok').click();
await p.waitForSelector('.tk', { state: 'detached', timeout: 30000 });
console.log('keypad done', await p.locator('.ob-count').textContent());

// 4. Call Hana.
await callRow(4);
await p.waitForSelector('.ch-choice', { timeout: 60000 });
await p.locator('.ch-choice').nth(1).click();
await p.waitForSelector('.ch-hang', { timeout: 60000 });
await p.locator('.ch-hang').click();

// Night.
await p.waitForSelector('.ov-night button', { timeout: 120000 });
await p.waitForTimeout(1500);
await shot('night');
await p.locator('.ov-night button').click();
await p.waitForSelector('#next-replay', { timeout: 60000 });
const s = await p.evaluate(() => window.__ctx.state);
console.log('end flags', s.flags.join(','), 'trust', JSON.stringify(Object.fromEntries(Object.entries(s.crew).map(([k, v]) => [k, v.trust]))));
await b.close();
