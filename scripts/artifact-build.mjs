// Builds the game with relative asset paths and lays it out in a folder
// ready to publish as a private claude.ai artifact. Prints the published
// path map, with null for files that are no longer used.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/artifact-build.mjs <out-dir>');
const before = existsSync(join(out, 'assets')) ? readdirSync(join(out, 'assets')) : [];
execSync('npx vite build --base ./', { stdio: 'ignore' });
rmSync(join(out, 'assets'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist/assets', join(out, 'assets'), { recursive: true });
const after = readdirSync(join(out, 'assets'));
const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/assets\/(index-[^"]+\.js)/)[1];
const css = html.match(/assets\/(index-[^"]+\.css)/)[1];
writeFileSync(
  join(out, 'index.html'),
  `<title>Helios Deep</title>
<style>
  :root { color-scheme: dark; --abyss: #000000; }
  html, body { height: 100%; background: var(--abyss); overflow: hidden; }
</style>
<link rel="stylesheet" href="./assets/${css}">
<div id="app"></div>
<p class="sr-only" role="status">Helios Deep command console. Flood alarm in compartment C2. Rescue vessel arrives in 13 days.</p>
<script type="module" src="./assets/${js}"></script>
`,
);
const map = {};
for (const f of after) if (!before.includes(f)) map[`assets/${f}`] = join(out, 'assets', f);
for (const f of before) if (!after.includes(f)) map[`assets/${f}`] = null;
console.log(JSON.stringify(map));
