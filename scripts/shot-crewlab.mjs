// Screenshots of the crew lab page. node scripts/shot-crewlab.mjs <name> "<query>"
import { chromium } from 'playwright-core';
import { mkdirSync, globSync } from 'node:fs';
const name = process.argv[2] ?? 'lineup';
const query = process.argv[3] ?? '';
mkdirSync('screenshots/crew', { recursive: true });
const b = await chromium.launch({ executablePath: globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto(`http://localhost:5174/crewlab.html?freeze&${query}`);
await p.waitForFunction(() => window.__ready, null, { timeout: 240000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: `screenshots/crew/${name}.png`, timeout: 120000 });
await b.close();
