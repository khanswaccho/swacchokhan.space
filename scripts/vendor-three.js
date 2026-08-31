/**
 * Copies the three.js ES module build out of node_modules into public/vendor/
 * so the browser loads it from our own origin. Keeps the Content-Security-Policy
 * strict (script-src 'self') — no third-party CDN is ever contacted.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const jobs = [
  ['node_modules/three/build/three.module.min.js', 'public/vendor/three.module.min.js'],
];

for (const [from, to] of jobs) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  if (!existsSync(src)) {
    console.warn(`[vendor-three] skipped, not found: ${from}`);
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[vendor-three] ${from} -> ${to}`);
}
