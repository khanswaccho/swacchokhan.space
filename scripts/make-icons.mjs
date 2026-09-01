/**
 * Generates the raster app icons: public/img/icon-{32,180,192,512}.png
 *
 *   npm run icons
 *
 * An SVG favicon is fine for browser tabs, but iOS ignores SVG for
 * apple-touch-icon and Android's manifest wants PNGs at fixed sizes — so
 * "add to home screen" produces a blank tile without these.
 *
 * Node has no canvas, so this borrows the same trick as make-og.mjs: serve a
 * throwaway page, let the browser paint, post the PNGs back.
 *
 * Pass --no-open to skip launching a browser (then open the printed URL).
 */
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = JSON.parse(readFileSync(resolve(root, 'data', 'profile.json'), 'utf8'));
const OUT_DIR = resolve(root, 'public', 'img');
const PORT = 4322;
const SIZES = [32, 180, 192, 512];

const page = `<!doctype html>
<meta charset="utf-8">
<title>Generating icons…</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@700&display=swap">
<style>
  body { margin:0; background:#06070e; color:#b7bfd6; font-family:system-ui,sans-serif;
         display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:center;
         min-height:100vh; }
  canvas { border-radius:12px; box-shadow:0 12px 40px -12px #000; }
  p { width:100%; text-align:center; font-size:14px; letter-spacing:.08em; text-transform:uppercase; }
</style>
<div id="host"></div>
<p id="status">painting…</p>
<script>
const SIZES = ${JSON.stringify(SIZES)};
const INITIALS = ${JSON.stringify(profile.identity.initials)};

function draw(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const r = size * 0.22;              // matches the squircle in favicon.svg

  // Rounded-square plate with the site's accent gradient.
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#22d3ee');
  g.addColorStop(0.5, '#7c5cff');
  g.addColorStop(1, '#ff5ea8');
  x.beginPath();
  x.moveTo(r, 0);
  x.arcTo(size, 0, size, size, r);
  x.arcTo(size, size, 0, size, r);
  x.arcTo(0, size, 0, 0, r);
  x.arcTo(0, 0, size, 0, r);
  x.closePath();
  x.fillStyle = g;
  x.fill();

  // Monogram, optically centred.
  x.fillStyle = '#06070e';
  x.font = '700 ' + Math.round(size * 0.42) + 'px Sora, system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(INITIALS, size / 2, size * 0.54);

  return c;
}

async function run() {
  await document.fonts.ready;
  const host = document.getElementById('host');
  for (const size of SIZES) {
    const c = draw(size);
    c.style.width = Math.min(size, 160) + 'px';
    c.style.height = Math.min(size, 160) + 'px';
    host.appendChild(c);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    await fetch('/save?size=' + size, { method: 'POST', body: await blob.arrayBuffer() });
  }
  await fetch('/done', { method: 'POST' });
  document.getElementById('status').textContent = 'saved — you can close this tab';
}
run();
</script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/save') {
    const size = url.searchParams.get('size');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    await mkdir(OUT_DIR, { recursive: true });
    const file = resolve(OUT_DIR, `icon-${size}.png`);
    await writeFile(file, buffer);
    console.log(`  ✔ icon-${size}.png  ${(buffer.length / 1024).toFixed(1)} KB`);
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/done') {
    res.writeHead(204).end();
    console.log('\n  All icons written.\n');
    server.close();
    setTimeout(() => process.exit(0), 150);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  Painting app icons at ${url}`);
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  }
});

setTimeout(() => {
  console.error('\n  ✖ Timed out. Open the URL above manually, then re-run.\n');
  process.exit(1);
}, 90_000);
