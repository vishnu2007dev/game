// Fails the build if an en dash or em dash appears in any source or
// content file. The game's writing style uses commas, colons, full stops
// and "to" for ranges instead.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'index.html'];
const banned = /[–—]/;
const hits = [];

function walk(p) {
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f));
    return;
  }
  readFileSync(p, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (banned.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`);
    });
}

roots.forEach(walk);
if (hits.length) {
  console.error('Long dashes are not allowed:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('check-dashes: ok');
