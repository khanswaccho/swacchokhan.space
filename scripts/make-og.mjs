/**
 * Generates public/img/og.jpg — the 1200×630 card that LinkedIn, X, Facebook and
 * WhatsApp show when someone shares a link to the site.
 *
 *   npm run og
 *
 * Node has no canvas, so this spins up a throwaway local server, serves a page
 * that paints the card with the real webfonts, posts the PNG back, writes it to
 * disk and exits. Re-run it whenever the name, role or colours change.
 *
 * Pass --no-open to skip launching a browser (then open the printed URL yourself).
 */
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = JSON.parse(readFileSync(resolve(root, 'data', 'profile.json'), 'utf8'));
const OUT = resolve(root, 'public', 'img', 'og.jpg');
const PORT = 4321;

const id = profile.identity;

const page = `<!doctype html>
<meta charset="utf-8">
<title>Generating OG image…</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  body { margin:0; background:#06070e; color:#b7bfd6; font-family:system-ui,sans-serif;
         display:grid; place-items:center; min-height:100vh; gap:1.5rem; }
  canvas { width:600px; height:315px; border-radius:12px; box-shadow:0 20px 60px -20px #000; }
  p { font-size:14px; letter-spacing:.08em; text-transform:uppercase; }
</style>
<canvas id="c" width="1200" height="630"></canvas>
<p id="status">painting…</p>
<script>
const NAME    = ${JSON.stringify(id.name)};
const ROLE    = ${JSON.stringify(id.headline)};
const PLACE   = ${JSON.stringify(id.location)};
const STUDIO  = ${JSON.stringify('Founder of Websthan · ' + profile.links.websthan.replace(/^https?:\/\//, ''))};
const INITIAL = ${JSON.stringify(id.initials)};

const W = 1200, H = 630;
const c = document.getElementById('c');
const x = c.getContext('2d');

function roundRect(ctx, rx, ry, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
  ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
  ctx.arcTo(rx, ry + h, rx, ry, r);
  ctx.arcTo(rx, ry, rx + w, ry, r);
  ctx.closePath();
}

async function paint() {
  await document.fonts.ready;

  // Base
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0d1c');
  bg.addColorStop(0.55, '#06070e');
  bg.addColorStop(1, '#120a26');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);

  // Aurora
  const g1 = x.createRadialGradient(W * 0.78, -60, 20, W * 0.78, -60, 620);
  g1.addColorStop(0, 'rgba(124,92,255,0.46)'); g1.addColorStop(1, 'rgba(124,92,255,0)');
  x.fillStyle = g1; x.fillRect(0, 0, W, H);
  const g2 = x.createRadialGradient(W * 0.08, H + 60, 20, W * 0.08, H + 60, 560);
  g2.addColorStop(0, 'rgba(34,211,238,0.30)'); g2.addColorStop(1, 'rgba(34,211,238,0)');
  x.fillStyle = g2; x.fillRect(0, 0, W, H);

  // Grid
  x.strokeStyle = 'rgba(255,255,255,0.035)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 48) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let j = 0; j < H; j += 48) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }

  // Neural constellation, right side
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push({ px: 700 + Math.random() * 460, py: 60 + Math.random() * 510 });
  x.strokeStyle = 'rgba(255,255,255,0.09)';
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].px - pts[j].px, pts[i].py - pts[j].py);
      if (d < 150) { x.beginPath(); x.moveTo(pts[i].px, pts[i].py); x.lineTo(pts[j].px, pts[j].py); x.stroke(); }
    }
  pts.forEach(p => { x.fillStyle = 'rgba(165,140,255,0.55)'; x.beginPath(); x.arc(p.px, p.py, 3.4, 0, 7); x.fill(); });

  // Accent bar
  const bar = x.createLinearGradient(0, 0, 0, H);
  bar.addColorStop(0, '#22d3ee'); bar.addColorStop(0.5, '#7c5cff'); bar.addColorStop(1, '#ff5ea8');
  x.fillStyle = bar; x.fillRect(0, 0, 10, H);

  // Monogram
  const M = 78;
  x.fillStyle = bar; roundRect(x, M, 84, 84, 84, 24); x.fill();
  x.fillStyle = '#06070e';
  x.font = '700 38px Sora, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(INITIAL, M + 42, 128);

  // Text block
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';

  x.fillStyle = '#5fdcf0';
  x.font = '500 22px "JetBrains Mono", monospace';
  x.letterSpacing = '7px';
  x.fillText(PLACE.toUpperCase(), M, 258);
  x.letterSpacing = '0px';

  x.fillStyle = '#f4f6fd';
  x.font = '700 96px Sora, sans-serif';
  x.fillText(NAME, M - 4, 366);

  x.fillStyle = '#b7bfd6';
  x.font = '400 36px Sora, sans-serif';
  x.fillText(ROLE, M, 428);

  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(M, 478); x.lineTo(M + 200, 478); x.stroke();

  x.fillStyle = '#7b849d';
  x.font = '400 26px "JetBrains Mono", monospace';
  x.fillText(STUDIO, M, 528);

  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  const buf = await blob.arrayBuffer();
  await fetch('/save', { method: 'POST', body: buf });
  document.getElementById('status').textContent = 'saved — you can close this tab';
}
paint();
</script>`;

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, buffer);
    res.writeHead(204).end();
    console.log(`\n  ✔ wrote ${OUT} (${(buffer.length / 1024).toFixed(1)} KB)\n`);
    server.close();
    setTimeout(() => process.exit(0), 150);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  Painting the social card at ${url}`);
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  }
  console.log('  Waiting for the browser to post it back…');
});

setTimeout(() => {
  console.error('\n  ✖ Timed out. Open the URL above manually, then re-run.\n');
  process.exit(1);
}, 90_000);
