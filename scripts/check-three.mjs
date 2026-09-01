/**
 * Guards the tree-shaken three.js bundle.
 *
 *   npm run check:three
 *
 * Tree-shaking means anything not named in scripts/three-entry.js is dropped
 * from the build. Referencing a new THREE.* export without adding it there
 * fails only at runtime, in the browser, as `undefined is not a constructor`.
 * This compares what public/js actually uses against what the entry exports and
 * exits non-zero on a mismatch.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const entry = await readFile(resolve(root, 'scripts/three-entry.js'), 'utf8');
const exported = new Set(
  entry
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(/export\s*{/)[1]
    ?.split('}')[0]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) || []
);

const files = (await readdir(resolve(root, 'public/js'))).filter((f) => f.endsWith('.js'));
const used = new Map();

for (const file of files) {
  const src = await readFile(resolve(root, 'public/js', file), 'utf8');
  for (const m of src.matchAll(/THREE\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(file);
  }
}

const missing = [...used.keys()].filter((n) => !exported.has(n)).sort();
const unused = [...exported].filter((n) => !used.has(n)).sort();

console.log(`  three-entry.js exports : ${exported.size}`);
console.log(`  public/js references   : ${used.size}`);

if (unused.length) {
  console.log(`\n  exported but unused (safe to drop for a smaller bundle):`);
  unused.forEach((n) => console.log(`    - ${n}`));
}

if (missing.length) {
  console.error(`\n  ✖ used but NOT exported — these will be undefined at runtime:`);
  missing.forEach((n) => console.error(`    - THREE.${n}  (${[...used.get(n)].join(', ')})`));
  console.error(`\n  Add them to scripts/three-entry.js and re-run npm run build:three\n`);
  process.exit(1);
}

console.log('\n  ✔ every THREE.* reference is present in the bundle\n');
