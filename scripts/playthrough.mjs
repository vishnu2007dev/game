// Plays the whole preview automatically and screenshots each phase.
// Usage: node scripts/playthrough.mjs [url] [width] [height]
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?seed=7';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const tag = width < 700 ? 'phone' : 'desk';
mkdirSync('screenshots/play', { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 700 ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
await page.goto(url);
await page.waitForSelector('#gate-start', { timeout: 120000 });
const shots = new Set();
const shot = async (name) => {
  if (shots.has(name)) return;
  shots.add(name);
  await page.screenshot({ path: `screenshots/play/${tag}-${name}.png` });
  console.log('shot', name);
};
await page.waitForTimeout(3000);
await shot('01-gate');
await page.click('#gate-start');

const deadline = Date.now() + 25 * 60 * 1000;
let calls = 0;
let emergencies = 0;
let scanned = false;
let lastKey = '';
let lastChange = Date.now();
let stalls = 0;
while (Date.now() < deadline) {
  await page.waitForTimeout(700);
  // Skip any typing in progress.
  await page.keyboard.press('Shift');
  const state = await page.evaluate(() => {
    const vis = (sel) => {
      const e = document.querySelector(sel);
      return !!e && e.getClientRects().length > 0;
    };
    const btn = [...document.querySelectorAll('.ov button')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim());
    return {
      emergency: vis('.ov-emergency') && !document.querySelector('.ov-emergency.is-done, .ov-emergency.is-missed'),
      choices: document.querySelectorAll('.ov-call .ov-choice').length,
      end: vis('.ov-end'),
      night: vis('.ov-night'),
      report: vis('.ov-report-wrap'),
      buttons: btn,
      scan: !!document.querySelector('.ov-btn-scan:not(:disabled)'),
    };
  });
  const key = JSON.stringify(state);
  if (key !== lastKey) {
    lastKey = key;
    lastChange = Date.now();
  } else if (Date.now() - lastChange > 60000) {
    stalls++;
    lastChange = Date.now();
    await page.screenshot({ path: `screenshots/play/${tag}-stall-${stalls}.png` });
    console.log('STALL', key);
    if (stalls > 3) break;
  }
  if (state.emergency) {
    await shot(`0${2 + emergencies}-emergency`);
    await page.waitForTimeout(800);
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    emergencies++;
    await page.waitForTimeout(2500);
    continue;
  }
  if (state.end) {
    if (state.buttons.includes('Start a new shift')) {
      await shot('09-end-note');
      break;
    }
    await shot('08-end');
    await page.locator('.ov-end .ov-choice').nth(1).click();
    continue;
  }
  if (state.report && state.buttons.includes('Tear off')) {
    await shot('04-report');
    await page.getByRole('button', { name: 'Tear off', exact: true }).click();
    continue;
  }
  if (state.buttons.includes('Answer')) {
    await shot('05-incoming');
    await page.getByRole('button', { name: 'Answer', exact: true }).click();
    continue;
  }
  if (state.choices) {
    if (state.scan && !scanned) {
      scanned = true;
      await page.click('.ov-btn-scan');
      await page.waitForTimeout(2500);
      await shot('06-call-scan');
    }
    await shot('06-call');
    await page.locator('.ov-call .ov-choice').nth(calls % 2).click();
    calls++;
    continue;
  }
  if (state.buttons.includes('Hang up')) {
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    continue;
  }
  if (state.night && state.buttons.includes('Sleep')) {
    await shot('07-night');
    await page.getByRole('button', { name: 'Sleep', exact: true }).click();
    continue;
  }
}
console.log(`calls ${calls}, emergencies ${emergencies}`);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
