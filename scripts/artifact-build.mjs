// Builds the game with relative asset paths and lays it out in a folder
// ready to publish as a private claude.ai artifact. Prints the published
// path map, with null for files that are no longer used.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/artifact-build.mjs <out-dir>');
const before = existsSync(join(out, 'assets')) ? readdirSync(join(out, 'assets')) : [];
execSync('npx vite build --base ./', { stdio: 'ignore', env: { ...process.env, VITE_PACKED_MODELS: '1' } });
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
<p class="sr-only" role="status">Helios Deep command console. Five crew, six rooms, five days until rescue.</p>
<script type="module" src="./assets/${js}"></script>
`,
);
const map = {};
// The host does not serve .glb, so each model goes up as base64 in a .json
// file. Models never change name, so they are only sent the first time.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
if (existsSync('dist/models')) {
  for (const src of walk('dist/models').filter((f) => f.endsWith('.glb'))) {
    const rel = src.slice('dist/'.length).replace(/\.glb$/, '.json');
    if (!existsSync(join(out, rel))) map[rel] = join(out, rel);
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), JSON.stringify({ glb: readFileSync(src).toString('base64') }));
  }
}
for (const f of after) if (!before.includes(f)) map[`assets/${f}`] = join(out, 'assets', f);
for (const f of before) if (!after.includes(f)) map[`assets/${f}`] = null;
console.log(JSON.stringify(map));
