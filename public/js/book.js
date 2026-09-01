/* ============================================================================
   The Book — a real, turnable 3D book of Swaccho Khan's chapters.

   Each sheet is a bendable plane hinged at the spine. Page faces are drawn to
   2D canvases and uploaded as textures, so the typography stays crisp and the
   content stays authored in one place (data/profile.json).

   If WebGL is unavailable the canvas stays empty and the HTML chapter reader
   underneath remains visible — that fallback is also what search engines read.
   ========================================================================== */

import * as THREE from '/vendor/three.module.min.js';
import { reduceMotion, clamp, lerp } from '/js/main.js';

const stage = document.getElementById('book-stage');
const canvas = document.getElementById('book-canvas');
const loadingEl = document.getElementById('book-loading');
const hintEl = document.getElementById('book-hint');
const prevBtn = document.getElementById('book-prev');
const nextBtn = document.getElementById('book-next');
const counterEl = document.getElementById('book-counter');
const indexEl = document.getElementById('book-index');
const dataEl = document.getElementById('chapters-data');
const metaEl = document.getElementById('book-meta');

if (stage && canvas && dataEl) {
  let chapters = [];
  let meta = {};
  try {
    chapters = JSON.parse(dataEl.textContent || '[]');
    meta = JSON.parse(metaEl?.textContent || '{}');
  } catch {
    chapters = [];
  }
  if (chapters.length) start(chapters, meta);
}

/* ══════════════════════════════════════════════════ page texture painting ══ */

// 3:4 — matches the page mesh exactly, so nothing is stretched. Sized for how
// large a page actually renders (~300-500 CSS px), not for print.
const PAGE_W = 1200;
const PAGE_H = 1600;

// Painted at 0.75 of the design size. A page renders at roughly 300-500 CSS px,
// so this is still oversampled on a 2x display, at 44% of the texture memory.
const TEXTURE_SCALE = 0.75;

const COLORS = {
  paper: '#0d1120',
  paperEdge: '#080b15',
  ink: '#eef1fa',
  inkSoft: '#a9b2ca',
  inkFaint: '#6a7391',
  cyan: '#5fdcf0',
  violet: '#a58cff',
};

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = Math.round(PAGE_W * TEXTURE_SCALE);
  c.height = Math.round(PAGE_H * TEXTURE_SCALE);
  c.getContext('2d').scale(TEXTURE_SCALE, TEXTURE_SCALE);
  return c;
}

/** Paper base: a deep indigo stock with a vignette and a gutter shadow. */
function paintBase(ctx, { gutter = 'left' } = {}) {
  const g = ctx.createLinearGradient(0, 0, PAGE_W, PAGE_H);
  g.addColorStop(0, COLORS.paper);
  g.addColorStop(1, COLORS.paperEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Fibre speckle so the paper isn't a dead flat fill.
  ctx.save();
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(Math.random() * PAGE_W, Math.random() * PAGE_H, 1.4, 1.4);
  }
  ctx.restore();

  // The shadow the spine casts into the page.
  const gx = gutter === 'left' ? 0 : PAGE_W;
  const shade = ctx.createLinearGradient(gx, 0, gutter === 'left' ? 210 : PAGE_W - 210, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Outer edge highlight.
  const ex = gutter === 'left' ? PAGE_W : 0;
  const edge = ctx.createLinearGradient(ex, 0, gutter === 'left' ? PAGE_W - 90 : 90, 0);
  edge.addColorStop(0, 'rgba(255,255,255,0.05)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
}

/**
 * Greedy word-wrap. With `draw: false` it measures without painting, which is
 * what lets the body copy pick a type size that actually fits the page.
 * Returns the y position after the last line.
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, { draw = true } = {}) {
  const words = String(text).split(/\s+/);
  let line = '';
  let cursorY = y;

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (draw) ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) {
    if (draw) ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function paintCover(meta) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, PAGE_W, PAGE_H);
  g.addColorStop(0, '#151b36');
  g.addColorStop(0.5, '#0d1024');
  g.addColorStop(1, '#1b1033');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Aurora wash — the same two accents the rest of the site runs on.
  const glow = ctx.createRadialGradient(PAGE_W * 0.68, PAGE_H * 0.26, 40, PAGE_W * 0.68, PAGE_H * 0.26, 760);
  glow.addColorStop(0, 'rgba(124,92,255,0.44)');
  glow.addColorStop(1, 'rgba(124,92,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const glow2 = ctx.createRadialGradient(PAGE_W * 0.18, PAGE_H * 0.8, 30, PAGE_W * 0.18, PAGE_H * 0.8, 640);
  glow2.addColorStop(0, 'rgba(34,211,238,0.26)');
  glow2.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Constellation motif — the hero's neural field, pressed into the board.
  ctx.save();
  const pts = [];
  for (let i = 0; i < 36; i++) {
    pts.push({ x: 110 + Math.random() * (PAGE_W - 220), y: 380 + Math.random() * (PAGE_H - 780) });
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < 200) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = 'rgba(165,140,255,0.45)';
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(62, 62, PAGE_W - 124, PAGE_H - 124);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  ctx.fillStyle = COLORS.cyan;
  ctx.font = '500 32px "JetBrains Mono", monospace';
  ctx.letterSpacing = '11px';
  ctx.fillText(meta.coverEyebrow, PAGE_W / 2, 250);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = COLORS.ink;
  ctx.font = '400 168px "Instrument Serif", Georgia, serif';
  meta.nameLines.forEach((line, i) => ctx.fillText(line, PAGE_W / 2, 590 + i * 160));

  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAGE_W / 2 - 165, 830);
  ctx.lineTo(PAGE_W / 2 + 165, 830);
  ctx.stroke();

  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = '400 43px "Sora", sans-serif';
  meta.coverLines.forEach((line, i) => ctx.fillText(line, PAGE_W / 2, 910 + i * 65));

  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = '400 28px "JetBrains Mono", monospace';
  ctx.letterSpacing = '6px';
  ctx.fillText(meta.coverHint, PAGE_W / 2, PAGE_H - 175);
  ctx.letterSpacing = '0px';

  return c;
}

/** Left page of a chapter spread: numeral, era, title, subtitle, tags. */
function paintChapterLeft(chapter, index) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  paintBase(ctx, { gutter: 'right' });

  const M = 135;
  const maxW = PAGE_W - M * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COLORS.cyan;
  ctx.font = '500 31px "JetBrains Mono", monospace';
  ctx.letterSpacing = '9px';
  ctx.fillText(chapter.numeral.toUpperCase(), M, 235);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = '400 31px "JetBrains Mono", monospace';
  ctx.fillText(chapter.era, M, 296);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, 360);
  ctx.lineTo(M + 165, 360);
  ctx.stroke();

  // Title: step the display size down if it would run past the tag block.
  ctx.fillStyle = COLORS.ink;
  let titleSize = 124;
  let titleEnd = 0;
  for (const size of [124, 110, 96, 84]) {
    titleSize = size;
    ctx.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
    titleEnd = wrapText(ctx, chapter.title, M, 520, maxW, size * 1.06, { draw: false });
    if (titleEnd < 1010) break;
  }
  ctx.font = `400 ${titleSize}px "Instrument Serif", Georgia, serif`;
  const afterTitle = wrapText(ctx, chapter.title, M, 520, maxW, titleSize * 1.06);

  ctx.fillStyle = COLORS.violet;
  ctx.font = '400 40px "Sora", sans-serif';
  wrapText(ctx, chapter.subtitle, M, afterTitle + 46, maxW, 58);

  // Tags, laid out from the bottom up.
  ctx.font = '400 29px "JetBrains Mono", monospace';
  const rows = [[]];
  let rowWidth = 0;
  (chapter.tags || []).forEach((tag) => {
    const w = ctx.measureText(tag).width + 52;
    if (rowWidth + w > maxW && rows[rows.length - 1].length) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push({ tag, w });
    rowWidth += w + 16;
  });

  let ty = PAGE_H - 235 - (rows.length - 1) * 72;
  rows.forEach((row) => {
    let tx = M;
    row.forEach(({ tag, w }) => {
      ctx.fillStyle = 'rgba(124,92,255,0.14)';
      ctx.strokeStyle = 'rgba(124,92,255,0.36)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, tx, ty - 41, w, 58, 29);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.inkSoft;
      ctx.fillText(tag, tx + 26, ty);
      tx += w + 16;
    });
    ty += 72;
  });

  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = '400 27px "JetBrains Mono", monospace';
  ctx.fillText(String(index * 2 + 1).padStart(2, '0'), M, PAGE_H - 105);

  return c;
}

/** Right page of a chapter spread: the body copy. */
function paintChapterRight(chapter, index, total) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  paintBase(ctx, { gutter: 'left' });

  const M = 150;
  const maxW = PAGE_W - M - 140;
  const top = 250;
  // Reserve room at the foot of the page for whatever follows the body copy.
  const bottom = PAGE_H - (chapter.isFinal ? 340 : 190);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const paras = chapter.body || [];

  // Pick the largest body size whose wrapped height still clears the folio.
  let bodySize = 46;
  let leading = 76;
  for (const size of [46, 43, 40, 37, 34]) {
    bodySize = size;
    leading = Math.round(size * 1.66);
    ctx.font = `400 ${size}px "Sora", sans-serif`;
    let probe = top;
    paras.forEach((para) => {
      probe = wrapText(ctx, para, M, probe, maxW, leading, { draw: false }) + leading * 0.55;
    });
    if (probe < bottom) break;
  }

  let y = top;
  paras.forEach((para, pi) => {
    ctx.fillStyle = pi === 0 ? COLORS.ink : COLORS.inkSoft;
    ctx.font = `400 ${bodySize}px "Sora", sans-serif`;
    y = wrapText(ctx, para, M, y, maxW, leading);
    y += leading * 0.55;
  });

  if (chapter.isFinal) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, y + 24);
    ctx.lineTo(M + 150, y + 24);
    ctx.stroke();

    ctx.fillStyle = COLORS.cyan;
    ctx.font = '500 29px "JetBrains Mono", monospace';
    ctx.letterSpacing = '4px';
    ctx.fillText('KHANSWACCHO@GMAIL.COM', M, y + 110);
    ctx.letterSpacing = '0px';
  }

  // Progress rail down the outer edge — where you are in the book.
  const railX = PAGE_W - 78;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(railX, 250);
  ctx.lineTo(railX, PAGE_H - 250);
  ctx.stroke();

  const railH = PAGE_H - 500;
  const segment = railH / total;
  ctx.strokeStyle = COLORS.violet;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(railX, 250 + segment * index);
  ctx.lineTo(railX, 250 + segment * (index + 1));
  ctx.stroke();

  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = '400 27px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(String(index * 2 + 2).padStart(2, '0'), PAGE_W - M, PAGE_H - 105);

  return c;
}

/** Bare stock, shown on a sheet whose face hasn't been painted yet. */
function paintBlank() {
  const c = makeCanvas();
  paintBase(c.getContext('2d'), { gutter: 'left' });
  return c;
}

function paintEndPaper(label) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  paintBase(ctx, { gutter: 'right' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = '400 36px "JetBrains Mono", monospace';
  ctx.letterSpacing = '10px';
  ctx.fillText(label, PAGE_W / 2, PAGE_H / 2);
  ctx.letterSpacing = '0px';
  return c;
}


function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ═════════════════════════════════════════════════════════════ the scene ══ */

async function start(chapters, meta = {}) {
  // Canvas text needs the real webfonts, or the cover renders in Times.
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* proceed with fallback faces */
    }
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    if (loadingEl) loadingEl.remove();
    if (hintEl) hintEl.remove();
    stage.style.display = 'none';
    return; // HTML chapter reader stays visible
  }

  stage.dataset.webgl = 'on';

  const W = 1.62; // page width
  const H = 2.16; // page height

  const size = () => canvas.getBoundingClientRect();
  const initial = size();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initial.width, initial.height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, initial.width / initial.height, 0.1, 100);

  const root = new THREE.Group();
  root.rotation.x = -0.34;
  scene.add(root);

  /* -- textures ---------------------------------------------------------- */
  const toTexture = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    return t;
  };

  const SHEETS = chapters.length + 1;
  const FACE_COUNT = SHEETS * 2;

  /**
   * Faces are painted on demand rather than all at once.
   *
   * Face 0 is the cover; after that each chapter contributes [left, right].
   * Painting all twenty up front cost a visible stall and held twenty
   * full-page canvases in GPU memory before the reader had turned anything.
   * Now only the spread you can see is guaranteed; the rest arrive in idle
   * time, and every sheet shows blank paper until its own face is ready.
   */
  const paintFace = (f) => {
    if (f === 0) return paintCover(meta);
    const chapterIndex = Math.floor((f - 1) / 2);
    if (chapterIndex >= chapters.length) return paintEndPaper('THE END · FOR NOW');
    return (f - 1) % 2 === 0
      ? paintChapterLeft(chapters[chapterIndex], chapterIndex)
      : paintChapterRight(chapters[chapterIndex], chapterIndex, chapters.length);
  };

  const blankTexture = toTexture(paintBlank());
  const faces = new Array(FACE_COUNT).fill(null);

  /** Paints face `f` if it isn't already, and swaps it onto its sheet. */
  function ensureFace(f) {
    if (f < 0 || f >= FACE_COUNT || faces[f]) return;
    faces[f] = toTexture(paintFace(f));
    const sheet = sheets[Math.floor(f / 2)];
    if (!sheet) return;
    const mat = f % 2 === 0 ? sheet.frontMat : sheet.backMat;
    mat.uniforms.uMap.value = faces[f];
    mat.needsUpdate = true;
  }

  /** Both faces of the spread shown at turn state `t`, plus its neighbours. */
  function ensureSpread(t) {
    [t * 2 - 1, t * 2, t * 2 + 1, t * 2 + 2, t * 2 - 2].forEach(ensureFace);
  }

  /* -- geometry & material ----------------------------------------------- */
  // Hinged at x = 0 so the group can rotate about the spine.
  const geo = new THREE.PlaneGeometry(W, H, 26, 1);
  geo.translate(W / 2, 0, 0);

  const vertexShader = /* glsl */ `
    uniform float uBend;
    uniform float uWidth;
    varying vec2 vUv;
    varying float vT;

    void main() {
      vUv = uv;
      vec3 p = position;
      float t = clamp(p.x / uWidth, 0.0, 1.0);
      vT = t;

      // Curl: a sine hump that peaks at the outer edge, plus a slight
      // shortening so the sheet doesn't stretch as it bows.
      p.z += sin(t * 3.14159265) * uBend;
      p.x -= (1.0 - cos(t * 1.5707963)) * abs(uBend) * 0.28;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform sampler2D uMap;
    uniform float uFlip;
    uniform float uBend;
    varying vec2 vUv;
    varying float vT;

    void main() {
      vec2 uv = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
      vec4 tex = texture2D(uMap, uv);

      // Fake lighting: darken toward the spine, and shade the curl as it turns.
      float gutter = smoothstep(0.0, 0.22, vT);
      float curl = 1.0 - abs(uBend) * (1.0 - vT) * 0.55;
      float shade = mix(0.62, 1.0, gutter) * curl;

      gl_FragColor = vec4(tex.rgb * shade, 1.0);
      #include <colorspace_fragment>
    }
  `;

  const makeFace = (texture, side, flip) =>
    new THREE.ShaderMaterial({
      side,
      uniforms: {
        uMap: { value: texture },
        uFlip: { value: flip ? 1 : 0 },
        uBend: { value: 0 },
        uWidth: { value: W },
      },
      vertexShader,
      fragmentShader,
    });

  const sheets = [];

  for (let i = 0; i < SHEETS; i++) {
    const group = new THREE.Group();

    // Blank paper until ensureFace() swaps the painted texture in.
    const frontTex = faces[i * 2] || blankTexture;
    const backTex = faces[i * 2 + 1] || blankTexture;

    // Two materials sharing one geometry — face culling means only one of the
    // pair is ever rasterised, so there is no z-fighting between them.
    const frontMat = makeFace(frontTex, THREE.FrontSide, false);
    const backMat = makeFace(backTex, THREE.BackSide, true);

    const front = new THREE.Mesh(geo, frontMat);
    const back = new THREE.Mesh(geo, backMat);
    group.add(front, back);

    root.add(group);
    sheets.push({ group, frontMat, backMat, value: 0, target: 0, delay: 0 });
  }

  /* -- spine & shadow ---------------------------------------------------- */
  const spine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, H * 1.01),
    new THREE.MeshBasicMaterial({ color: 0x05060c, transparent: true, opacity: 0.9 })
  );
  spine.position.z = -SHEETS * 0.0035 - 0.02;
  root.add(spine);

  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 3.1, H * 1.5),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 })
  );
  shadow.position.set(0, -H * 0.52, -0.12);
  shadow.rotation.x = -0.2;
  root.add(shadow);

  /* -- framing ----------------------------------------------------------- */
  function fit() {
    const r = size();
    if (!r.width || !r.height) return;

    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    renderer.setSize(r.width, r.height, false);

    // Frame the open spread (2 pages wide) with enough margin that the tilt,
    // the page lift mid-turn and the drop shadow all stay inside the stage.
    const openW = W * 2 * 1.1;
    const openH = H * 1.24;
    const vFov = (camera.fov * Math.PI) / 180;
    const distH = openH / 2 / Math.tan(vFov / 2);
    const distW = openW / 2 / Math.tan(vFov / 2) / camera.aspect;
    camera.position.set(0, 0.06, Math.max(distH, distW));
    camera.lookAt(0, 0, 0);
  }
  fit();
  window.addEventListener('resize', fit);

  /* -- state ------------------------------------------------------------- */
  const MAX_TURN = chapters.length; // 0 = cover, 1..n = chapter spreads
  let turned = 0;

  const dots = indexEl ? [...indexEl.querySelectorAll('[data-chapter]')] : [];

  function syncUI() {
    const chapterIndex = turned - 1;

    if (counterEl) {
      counterEl.innerHTML =
        turned === 0
          ? `<b>Cover</b>`
          : `<b>${turned}</b> / ${chapters.length}`;
    }

    if (prevBtn) prevBtn.disabled = turned <= 0;
    if (nextBtn) nextBtn.disabled = turned >= MAX_TURN;

    dots.forEach((dot, i) => {
      const on = i === chapterIndex;
      dot.classList.toggle('is-current', on);
      dot.setAttribute('aria-selected', String(on));
    });
  }

  function goTo(next, { immediate = false } = {}) {
    const target = clamp(Math.round(next), 0, MAX_TURN);
    if (target === turned) return;

    const from = turned;
    turned = target;

    sheets.forEach((sheet, i) => {
      const want = i < turned ? 1 : 0;
      if (sheet.target === want) return;
      sheet.target = want;
      // Stagger multi-page jumps so they cascade rather than snap together.
      sheet.delay = immediate ? 0 : Math.abs(i - Math.min(from, turned)) * 0.075;
      sheet.elapsed = 0;
    });

    // Paint what's about to be on screen before the turn finishes.
    ensureSpread(turned);

    if (hintEl) hintEl.classList.add('is-hidden');
    syncUI();
  }

  // The cover and the first spread are needed straight away; everything else
  // is painted in idle time so the book appears without a stall.
  ensureSpread(0);
  ensureSpread(1);

  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 120));
  let nextFace = 0;
  const paintRest = () => {
    while (nextFace < FACE_COUNT && faces[nextFace]) nextFace++;
    if (nextFace >= FACE_COUNT) return;
    ensureFace(nextFace);
    idle(paintRest);
  };
  idle(paintRest);

  syncUI();

  /* -- controls ---------------------------------------------------------- */
  prevBtn?.addEventListener('click', () => goTo(turned - 1));
  nextBtn?.addEventListener('click', () => goTo(turned + 1));

  dots.forEach((dot) => {
    dot.addEventListener('click', () => goTo(Number(dot.dataset.chapter) + 1));
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') {
      goTo(turned + 1);
    } else if (e.key === 'ArrowLeft') {
      goTo(turned - 1);
    }
  });

  // Drag to turn, plus a light orbit on the vertical axis.
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let orbitTargetY = 0;
  let orbitTargetX = -0.34;
  let consumed = false;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    consumed = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = size();
    if (!dragging) {
      // Hover parallax.
      orbitTargetY = (((e.clientX - r.left) / r.width) * 2 - 1) * 0.22;
      orbitTargetX = -0.34 + (((e.clientY - r.top) / r.height) * 2 - 1) * -0.12;
      return;
    }

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!consumed && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
      goTo(turned + (dx < 0 ? 1 : -1));
      consumed = true;
    }
    orbitTargetY = clamp(dx / r.width, -0.5, 0.5) * 0.5;
  });

  const endDrag = () => {
    dragging = false;
    orbitTargetY = 0;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (!dragging) {
      orbitTargetY = 0;
      orbitTargetX = -0.34;
    }
  });

  // Wheel zooms the book rather than the page, but only when it would do
  // something — otherwise the page keeps scrolling as the reader expects.
  let zoom = 1;
  canvas.addEventListener(
    'wheel',
    (e) => {
      const next = clamp(zoom - e.deltaY * 0.0009, 0.72, 1.5);
      if (next !== zoom) {
        e.preventDefault();
        zoom = next;
      }
    },
    { passive: false }
  );

  /* -- animation loop ---------------------------------------------------- */
  const clock = new THREE.Clock();
  let running = true;

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = Math.min(clock.getDelta(), 0.05);

    sheets.forEach((sheet, i) => {
      if (sheet.value !== sheet.target) {
        sheet.elapsed = (sheet.elapsed || 0) + dt;
        if (sheet.elapsed >= sheet.delay) {
          const rate = reduceMotion ? 30 : 4.4;
          sheet.value = lerp(sheet.value, sheet.target, 1 - Math.exp(-rate * dt));
          if (Math.abs(sheet.value - sheet.target) < 0.001) sheet.value = sheet.target;
        }
      }

      const eased = easeInOut(sheet.value);

      // Each sheet fans very slightly so the stack has thickness. The fan
      // direction has to agree with the z-offset: a sheet's outer edge swings
      // through ±W·sin(angle), which is an order of magnitude larger than any
      // sane z step, so if the two disagree the bottom sheet punches through
      // the top one. Both therefore push deeper as `i` grows on the right, and
      // shallower as `i` grows on the left (last turned = top of the pile).
      const FAN = 0.0028;
      const LIFT = 0.0035;

      const angleClosed = i * FAN;
      const angleOpen = -Math.PI + i * FAN;
      sheet.group.rotation.y = lerp(angleClosed, angleOpen, eased);

      const zClosed = -i * LIFT;
      const zOpen = -(SHEETS - i) * LIFT;

      // Bend peaks mid-turn and vanishes at both ends.
      const flight = Math.sin(sheet.value * Math.PI);
      const bend = flight * 0.34;
      sheet.frontMat.uniforms.uBend.value = bend;
      sheet.backMat.uniforms.uBend.value = bend;

      // Lift the sheet in flight so it clears both stacks.
      sheet.group.position.z = lerp(zClosed, zOpen, eased) + flight * 0.1;
    });

    // A closed book is one page wide, so slide the spine to the right of centre
    // until it opens. Sheet 0's own progress is exactly the right signal.
    const openness = easeInOut(sheets[0].value);
    root.position.x = lerp(-W / 2, 0, openness);

    root.rotation.y = lerp(root.rotation.y, orbitTargetY, 0.07);
    root.rotation.x = lerp(root.rotation.x, orbitTargetX, 0.07);
    root.scale.setScalar(lerp(root.scale.x, zoom, 0.1));

    renderer.render(scene, camera);
  }

  // Pause when off-screen or the tab is hidden.
  const io = new IntersectionObserver(
    ([entry]) => {
      const shouldRun = entry.isIntersecting && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        clock.getDelta();
        frame();
      } else if (!shouldRun) {
        running = false;
      }
    },
    { threshold: 0 }
  );
  io.observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      clock.getDelta();
      frame();
    }
  });

  frame();

  // Reveal the stage once the first frame is on screen.
  requestAnimationFrame(() => {
    if (loadingEl) loadingEl.classList.add('is-done');
  });

  // A nudge, so it's obvious the thing opens.
  if (!reduceMotion) {
    window.setTimeout(() => {
      if (turned === 0) goTo(1);
    }, 1400);
  }
}
