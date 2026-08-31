/* ============================================================================
   Hero — WebGL neural field, cursor glow and cursor trail.

   A drifting point cloud whose nodes wire themselves to their neighbours,
   which is both an honest picture of what he studies and a surface the cursor
   can push around. Degrades to nothing (no error, no gap) without WebGL.
   ========================================================================== */

import * as THREE from '/vendor/three.module.min.js';
import { reduceMotion, finePointer, lerp, clamp } from '/js/main.js';

const canvas = document.getElementById('hero-canvas');
const trailCanvas = document.getElementById('trail-canvas');
const glow = document.getElementById('hero-glow');
const hero = document.getElementById('hero');

/* ============================================================ cursor glow == */
function initGlow() {
  if (!glow || !hero || !finePointer || reduceMotion) return;

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let x = tx;
  let y = ty;
  let active = false;

  hero.addEventListener(
    'pointermove',
    (e) => {
      const r = hero.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!active) {
        active = true;
        x = tx;
        y = ty;
        glow.classList.add('is-active');
      }
    },
    { passive: true }
  );

  hero.addEventListener('pointerleave', () => {
    active = false;
    glow.classList.remove('is-active');
  });

  const frame = () => {
    x = lerp(x, tx, 0.085);
    y = lerp(y, ty, 0.085);
    glow.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* =========================================================== cursor trail == */
function initTrail() {
  if (!trailCanvas || !hero || !finePointer || reduceMotion) return;

  const ctx = trailCanvas.getContext('2d');
  if (!ctx) return;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;

  const resize = () => {
    const r = hero.getBoundingClientRect();
    w = r.width;
    h = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailCanvas.width = Math.floor(w * dpr);
    trailCanvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const MAX = 26;
  const points = [];
  let pointer = null;

  hero.addEventListener(
    'pointermove',
    (e) => {
      const r = hero.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    { passive: true }
  );

  hero.addEventListener('pointerleave', () => {
    pointer = null;
  });

  const frame = () => {
    ctx.clearRect(0, 0, w, h);

    if (pointer) {
      const head = points[0];
      // Ease the head toward the pointer so the ribbon has inertia.
      points.unshift(
        head
          ? { x: lerp(head.x, pointer.x, 0.55), y: lerp(head.y, pointer.y, 0.55) }
          : { x: pointer.x, y: pointer.y }
      );
    } else if (points.length) {
      points.shift();
    }

    while (points.length > MAX) points.pop();

    if (points.length > 2) {
      for (let i = 1; i < points.length - 1; i++) {
        const t = 1 - i / points.length;
        const a = points[i];
        const b = points[i + 1];

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = t * 5.5;
        ctx.lineCap = 'round';

        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(34, 211, 238, ${t * 0.55})`);
        grad.addColorStop(1, `rgba(124, 92, 255, ${t * 0.4})`);
        ctx.strokeStyle = grad;
        ctx.stroke();
      }

      // Sparks scattered along the ribbon.
      for (let i = 2; i < points.length; i += 5) {
        const t = 1 - i / points.length;
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, t * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 200, 255, ${t * 0.5})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ========================================================== neural field == */
function initField() {
  if (!canvas || !hero) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return; // no WebGL — the hero simply renders without it
  }

  const rect = () => hero.getBoundingClientRect();
  const size = rect();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(size.width, size.height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, size.width / size.height, 0.1, 200);
  camera.position.set(0, 0, 34);

  // Fewer nodes on small screens — the link pass is O(n²).
  const narrow = window.innerWidth < 760;
  const COUNT = reduceMotion ? 42 : narrow ? 62 : 118;
  const SPREAD = { x: 46, y: 26, z: 18 };
  const LINK_DIST = narrow ? 9.5 : 8.6;

  const positions = new Float32Array(COUNT * 3);
  const velocities = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * SPREAD.x;
    positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD.z;
    velocities[i * 3] = (Math.random() - 0.5) * 0.016;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.016;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    sizes[i] = 1.4 + Math.random() * 2.6;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  /* -- nodes ------------------------------------------------------------- */
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  nodeGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  nodeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const nodeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uColorA: { value: new THREE.Color('#22d3ee') },
      uColorB: { value: new THREE.Color('#7c5cff') },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vMix;
      varying float vPulse;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;

        // Nodes breathe slightly out of phase with each other.
        vPulse = 0.65 + 0.35 * sin(uTime * 1.6 + aSeed);
        vMix = clamp((position.x + 23.0) / 46.0, 0.0, 1.0);

        gl_PointSize = aSize * vPulse * uPixelRatio * (170.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vMix;
      varying float vPulse;

      void main() {
        // Soft radial falloff — a round glow rather than a square sprite.
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = pow(1.0 - d * 2.0, 2.4);

        vec3 color = mix(uColorA, uColorB, vMix);
        gl_FragColor = vec4(color, alpha * 0.85 * vPulse);
      }
    `,
  });

  const nodes = new THREE.Points(nodeGeo, nodeMat);
  scene.add(nodes);

  /* -- links ------------------------------------------------------------- */
  const MAX_LINKS = COUNT * 7;
  const linkPositions = new Float32Array(MAX_LINKS * 6);
  const linkColors = new Float32Array(MAX_LINKS * 6);

  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkColors, 3));

  const links = new THREE.LineSegments(
    linkGeo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(links);

  /* -- pointer ----------------------------------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, inside: false };

  hero.addEventListener(
    'pointermove',
    (e) => {
      const r = rect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointer.inside = true;
    },
    { passive: true }
  );

  hero.addEventListener('pointerleave', () => {
    pointer.inside = false;
    pointer.tx = 0;
    pointer.ty = 0;
  });

  /* -- loop -------------------------------------------------------------- */
  const clock = new THREE.Clock();
  let running = true;
  let linkCount = 0;

  // Where the pointer lands in world space, so nodes can be pushed by it.
  const pointerWorld = new THREE.Vector3();

  const step = () => {
    if (!running) return;
    requestAnimationFrame(step);

    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    nodeMat.uniforms.uTime.value = time;

    pointer.x = lerp(pointer.x, pointer.tx, 0.055);
    pointer.y = lerp(pointer.y, pointer.ty, 0.055);

    pointerWorld.set(pointer.x * 23, pointer.y * 13, 0);

    const pos = nodeGeo.attributes.position.array;
    const speed = reduceMotion ? 0.15 : 1;

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;

      pos[ix] += velocities[ix] * speed * dt * 60;
      pos[ix + 1] += velocities[ix + 1] * speed * dt * 60;
      pos[ix + 2] += velocities[ix + 2] * speed * dt * 60;

      // Soft-bounce inside the slab.
      if (Math.abs(pos[ix]) > SPREAD.x / 2) velocities[ix] *= -1;
      if (Math.abs(pos[ix + 1]) > SPREAD.y / 2) velocities[ix + 1] *= -1;
      if (Math.abs(pos[ix + 2]) > SPREAD.z / 2) velocities[ix + 2] *= -1;

      // Gentle repulsion from the cursor.
      if (pointer.inside && !reduceMotion) {
        const dx = pos[ix] - pointerWorld.x;
        const dy = pos[ix + 1] - pointerWorld.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 90 && d2 > 0.001) {
          const push = (1 - d2 / 90) * 0.045;
          const inv = 1 / Math.sqrt(d2);
          pos[ix] += dx * inv * push * 12 * dt * 60;
          pos[ix + 1] += dy * inv * push * 12 * dt * 60;
        }
      }
    }
    nodeGeo.attributes.position.needsUpdate = true;

    // Rebuild the neighbour links.
    linkCount = 0;
    for (let i = 0; i < COUNT && linkCount < MAX_LINKS; i++) {
      const ix = i * 3;
      for (let j = i + 1; j < COUNT && linkCount < MAX_LINKS; j++) {
        const jx = j * 3;
        const dx = pos[ix] - pos[jx];
        const dy = pos[ix + 1] - pos[jx + 1];
        const dz = pos[ix + 2] - pos[jx + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > LINK_DIST) continue;

        const strength = 1 - dist / LINK_DIST;
        const o = linkCount * 6;

        linkPositions[o] = pos[ix];
        linkPositions[o + 1] = pos[ix + 1];
        linkPositions[o + 2] = pos[ix + 2];
        linkPositions[o + 3] = pos[jx];
        linkPositions[o + 4] = pos[jx + 1];
        linkPositions[o + 5] = pos[jx + 2];

        // Cyan on the left of the field, violet on the right.
        const mix = clamp((pos[ix] + 23) / 46, 0, 1);
        const r = 0.13 + mix * 0.36;
        const g = 0.82 - mix * 0.46;
        const b = 0.93;
        const a = strength * 0.85;

        for (let k = 0; k < 2; k++) {
          linkColors[o + k * 3] = r * a;
          linkColors[o + k * 3 + 1] = g * a;
          linkColors[o + k * 3 + 2] = b * a;
        }

        linkCount++;
      }
    }

    linkGeo.setDrawRange(0, linkCount * 2);
    linkGeo.attributes.position.needsUpdate = true;
    linkGeo.attributes.color.needsUpdate = true;

    // Parallax: the whole field leans toward the pointer.
    const targetRotY = pointer.x * 0.16;
    const targetRotX = -pointer.y * 0.1;
    nodes.rotation.y = lerp(nodes.rotation.y, targetRotY, 0.05);
    nodes.rotation.x = lerp(nodes.rotation.x, targetRotX, 0.05);
    links.rotation.copy(nodes.rotation);

    camera.position.x = lerp(camera.position.x, pointer.x * 2.4, 0.04);
    camera.position.y = lerp(camera.position.y, pointer.y * 1.6, 0.04);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };

  const onResize = () => {
    const r = rect();
    if (r.width === 0 || r.height === 0) return;
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    renderer.setSize(r.width, r.height, false);
    nodeMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  };
  window.addEventListener('resize', onResize);

  // Stop rendering when the hero scrolls away or the tab is hidden.
  const visibility = new IntersectionObserver(
    ([entry]) => {
      const shouldRun = entry.isIntersecting && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        clock.getDelta();
        step();
      } else if (!shouldRun) {
        running = false;
      }
    },
    { threshold: 0 }
  );
  visibility.observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      clock.getDelta();
      step();
    }
  });

  step();
}

initGlow();
initTrail();
initField();
