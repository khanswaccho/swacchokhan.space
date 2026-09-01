/* ============================================================================
   Swaccho Khan — shared interaction layer
   Cursor, navigation, scroll reveal, tilt, spotlight, magnetics, filters.
   ========================================================================== */

// Flag the document before first paint. The reveal styles key off this, so
// content stays visible for crawlers and no-JS visitors.
document.documentElement.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------- preloader -- */
function initPreloader() {
  const el = document.getElementById('preloader');
  if (!el) return;
  const done = () => {
    el.classList.add('is-done');
    document.body.classList.add('is-loaded');
    window.setTimeout(() => el.remove(), 700);
  };
  if (document.readyState === 'complete') window.setTimeout(done, 220);
  else window.addEventListener('load', () => window.setTimeout(done, 220), { once: true });
  // Never let a stalled asset trap the page behind the overlay.
  window.setTimeout(done, 3200);
}

/* ---------------------------------------------------------------- cursor -- */
function initCursor() {
  if (!finePointer || reduceMotion) return;
  const dot = document.getElementById('cursor');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  document.body.classList.add('has-custom-cursor');

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;
  let visible = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!visible) {
        visible = true;
        dot.classList.add('is-active');
        ring.classList.add('is-active');
      }
    },
    { passive: true }
  );

  window.addEventListener('pointerdown', () => document.body.classList.add('cursor-down'));
  window.addEventListener('pointerup', () => document.body.classList.remove('cursor-down'));
  document.addEventListener('pointerleave', () => {
    dot.classList.remove('is-active');
    ring.classList.remove('is-active');
    visible = false;
  });

  // Grow the ring over anything interactive.
  const hoverSelector = 'a, button, input, textarea, select, [data-cursor="hover"], [role="button"]';
  document.addEventListener('pointerover', (e) => {
    if (e.target instanceof Element && e.target.closest(hoverSelector)) {
      document.body.classList.add('cursor-hover');
    }
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target instanceof Element && e.target.closest(hoverSelector)) {
      document.body.classList.remove('cursor-hover');
    }
  });

  const frame = () => {
    // The dot is exact; the ring trails it, which is what reads as "weight".
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    rx = lerp(rx, mx, 0.17);
    ry = lerp(ry, my, 0.17);
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------- nav -- */
function initNav() {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  const progress = document.getElementById('nav-progress');
  const pill = document.getElementById('nav-pill');

  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('is-stuck', window.scrollY > 24);
      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('a')) {
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // Slide the highlight pill under whichever link is active/hovered.
  if (pill && links) {
    const active = links.querySelector('.nav__link.is-active');
    const moveTo = (el) => {
      if (!el || window.innerWidth <= 900) return;
      pill.style.width = `${el.offsetWidth}px`;
      pill.style.transform = `translateX(${el.offsetLeft}px)`;
      pill.classList.add('is-ready');
    };
    const settle = () => moveTo(active);

    links.querySelectorAll('.nav__link').forEach((link) => {
      link.addEventListener('pointerenter', () => moveTo(link));
    });
    links.addEventListener('pointerleave', settle);
    window.addEventListener('resize', settle);
    // Wait for webfonts so the measurement isn't taken against a fallback face.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    window.setTimeout(settle, 120);
  }
}

/* --------------------------------------------------------- scroll reveal -- */
function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  items.forEach((el) => io.observe(el));
}

/* --------------------------------------------------- character-split text -- */
function initSplitText() {
  if (reduceMotion) return;
  document.querySelectorAll('[data-split]').forEach((el) => {
    const offset = Number(el.dataset.splitOffset || 0);
    const text = el.textContent || '';
    el.setAttribute('aria-label', text);
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'split-char';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--ci', String(i + offset));
      span.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(span);
    });
  });
}

/* ------------------------------------------------------------- spotlight -- */
function initSpotlight() {
  if (!finePointer) return;
  document.querySelectorAll('[data-spotlight]').forEach((card) => {
    card.addEventListener(
      'pointermove',
      (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      },
      { passive: true }
    );
  });
}

/* ------------------------------------------------------------------ tilt -- */
function initTilt() {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    el.classList.add('tilt');
    const max = Number(el.dataset.tilt) || 7;

    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.classList.add('is-tilting');
        el.style.setProperty('--ry', `${px * max * 2}deg`);
        el.style.setProperty('--rx', `${-py * max * 2}deg`);
      },
      { passive: true }
    );

    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
}

/* -------------------------------------------------------------- magnetic -- */
function initMagnetic() {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.28;

    el.addEventListener(
      'pointermove',
      (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      },
      { passive: true }
    );

    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}

/* ------------------------------------------------------- rotating role --- */
function initRoleRotator() {
  const el = document.getElementById('role-word');
  if (!el) return;

  // Authored in data/profile.json and handed over on the element, so this list
  // can't drift from the rest of the site.
  let roles = [];
  try {
    roles = JSON.parse(el.dataset.roles || '[]');
  } catch {
    roles = [];
  }
  if (!roles.length) roles = [el.textContent.trim()];

  if (reduceMotion) {
    el.textContent = roles[0];
    return;
  }

  let index = 0;
  let chars = roles[0].length;
  let deleting = false;

  const tick = () => {
    const word = roles[index];
    chars += deleting ? -1 : 1;
    el.textContent = word.slice(0, chars);

    let delay = deleting ? 34 : 62;

    if (!deleting && chars === word.length) {
      delay = 2100;
      deleting = true;
    } else if (deleting && chars === 0) {
      deleting = false;
      index = (index + 1) % roles.length;
      delay = 340;
    }

    window.setTimeout(tick, delay);
  };

  window.setTimeout(() => {
    deleting = true;
    tick();
  }, 2600);
}

/* ------------------------------------------------------ timeline filter --- */
function initTimelineFilter() {
  const buttons = document.querySelectorAll('[data-tl-filter]');
  const list = document.getElementById('timeline-list');
  if (!buttons.length || !list) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.tlFilter;
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));

      list.querySelectorAll('.tl-item').forEach((item, i) => {
        const show = kind === 'all' || item.dataset.kind === kind;
        item.style.display = show ? '' : 'none';
        if (show) {
          item.classList.remove('is-visible');
          item.style.setProperty('--i', String(Math.min(i, 6)));
          requestAnimationFrame(() => item.classList.add('is-visible'));
        }
      });
    });
  });
}

/* ------------------------------------------------------------ portrait --- */
function initPortrait() {
  const img = document.getElementById('portrait');
  const fallback = document.getElementById('portrait-fallback');
  if (!img) return;

  // Keep the gradient monogram visible until a real photo actually decodes, so a
  // missing or failed image never shows a broken-image glyph. If the local
  // portrait isn't there yet, fall back to the GitHub avatar once before giving
  // up and leaving the monogram in place.
  img.style.opacity = '0';
  img.style.transition = 'opacity 620ms cubic-bezier(0.22,1,0.36,1)';

  let triedFallback = false;

  const reveal = () => {
    img.style.opacity = '1';
    if (fallback) fallback.style.opacity = '0';
  };

  const fail = () => {
    const next = img.dataset.fallbackSrc;
    if (next && !triedFallback) {
      triedFallback = true;
      img.src = next;
      return;
    }
    img.style.display = 'none';
  };

  img.addEventListener('load', reveal);
  img.addEventListener('error', fail);

  if (img.complete) {
    if (img.naturalWidth > 0) reveal();
    else fail();
  }
}

/* ----------------------------------------------------------- copy email --- */
function initCopyEmail() {
  const btn = document.getElementById('copy-email');
  if (!btn) return;

  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const email = btn.closest('a')?.getAttribute('href')?.replace('mailto:', '') || '';
    try {
      await navigator.clipboard.writeText(email);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.style.color = 'var(--cyan)';
      window.setTimeout(() => {
        btn.textContent = original;
        btn.style.color = '';
      }, 1800);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };

  btn.addEventListener('click', copy);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') copy(e);
  });
}

/* ------------------------------------------------------------------ boot -- */
function boot() {
  initPreloader();
  initCursor();
  initNav();
  initSplitText();
  initReveal();
  initSpotlight();
  initTilt();
  initMagnetic();
  initRoleRotator();
  initTimelineFilter();
  initPortrait();
  initCopyEmail();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

export { reduceMotion, finePointer, lerp, clamp };
