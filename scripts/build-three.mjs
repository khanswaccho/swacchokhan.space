/**
 * Builds public/vendor/three.min.js — a tree-shaken three.js containing only
 * the exports listed in scripts/three-entry.js.
 *
 *   npm run build:three
 *
 * The output is committed to the repo on purpose. Deploy hosts then need no
 * build step at all: `npm install && npm start` is enough, and a missing or
 * skipped install script can't break production. Re-run this after upgrading
 * three, or after adding an export to three-entry.js.
 */
import { build } from 'esbuild';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(root, 'scripts/three-entry.js');
const OUT = resolve(root, 'public/vendor/three.min.js');
const FULL = resolve(root, 'node_modules/three/build/three.module.min.js');

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';

await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  treeShaking: true,
  legalComments: 'none',
});

const built = await readFile(OUT);
const builtGz = gzipSync(built).length;

let line = '';
try {
  const fullSize = (await stat(FULL)).size;
  const fullGz = gzipSync(await readFile(FULL)).length;
  const saved = (((fullGz - builtGz) / fullGz) * 100).toFixed(0);
  line =
    `\n  full three.module.min.js ${kb(fullSize)}   gzip ${kb(fullGz)}` +
    `\n  tree-shaken bundle       ${kb(built.length)}   gzip ${kb(builtGz)}` +
    `\n  saved                                       ${saved}% over the wire\n`;
} catch {
  line = `\n  wrote ${kb(built.length)} (gzip ${kb(builtGz)})\n`;
}

console.log(line);
