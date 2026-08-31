import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { csrfIssue, csrfVerify, csrfConfig } from './lib/csrf.js';
import { securityHeaders, nonceMiddleware, originGuard, noStoreHtml } from './lib/security.js';
import pageRoutes from './routes/pages.js';
import apiRoutes from './routes/api.js';
import profile from './lib/profile.js';
import { NAV } from './lib/nav.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Behind a reverse proxy (Render, Railway, Nginx…) so req.ip and req.protocol
// reflect the real client rather than the proxy. Kept narrow on purpose.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', resolve(ROOT, 'views'));

// ── Security ──────────────────────────────────────────────────────────────
app.use(nonceMiddleware);
app.use(securityHeaders());

// ── Baseline hardening ────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: 'rate_limited', message: 'Too many requests. Slow down a moment.' },
  })
);
app.use(compression());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// Force HTTPS in production.
app.use((req, res, next) => {
  if (isProd && req.protocol !== 'https' && process.env.DISABLE_HTTPS_REDIRECT !== '1') {
    return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

// ── Static assets ─────────────────────────────────────────────────────────
app.use(
  express.static(resolve(ROOT, 'public'), {
    maxAge: isProd ? '30d' : 0,
    etag: true,
    index: false,
    dotfiles: 'ignore',
    setHeaders(res, path) {
      if (path.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    },
  })
);

// ── CSRF ──────────────────────────────────────────────────────────────────
app.use(csrfIssue);

// Values every template needs. Registered *before* csrfVerify so that the
// rejection page it renders has the same locals as any other view.
app.use((req, res, next) => {
  res.locals.profile = profile;
  res.locals.nav = NAV;
  res.locals.year = new Date().getFullYear();
  res.locals.page = null;
  res.locals.csrfField = csrfConfig.FIELD_NAME;
  res.locals.csrfHeader = csrfConfig.HEADER_NAME;
  res.locals.origin = process.env.SITE_ORIGIN || `${req.protocol}://${req.get('host')}`;
  res.locals.canonical = res.locals.origin + req.path;
  next();
});

app.use('/api', originGuard);
app.use(csrfVerify);

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use(noStoreHtml, pageRoutes);

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      `Sitemap: ${res.locals.origin}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

app.get('/sitemap.xml', (req, res) => {
  const origin = res.locals.origin;
  const urls = ['/', '/journey', '/portfolio', '/contact'];
  const today = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${origin}${u}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${u === '/' ? '1.0' : '0.8'}</priority></url>`
        )
        .join('\n') +
      `\n</urlset>\n`
  );
});

// ── Errors ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404);
  if (req.path.startsWith('/api/')) {
    return res.json({ ok: false, error: 'not_found', message: 'No such endpoint.' });
  }
  res.render('pages/error', {
    profile,
    status: 404,
    title: 'Page not found',
    message: "That page doesn't exist. It may have been a chapter I never wrote.",
  });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status);
  if (req.path.startsWith('/api/')) {
    return res.json({ ok: false, error: 'server_error', message: 'Something went wrong on my side.' });
  }
  res.render('pages/error', {
    profile,
    status,
    title: 'Something broke',
    message: isProd
      ? 'Something went wrong on my side. Try again in a moment.'
      : String(err.message || err),
  });
});

app.listen(PORT, () => {
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  console.log(`\n  ${profile.identity.name} — portfolio`);
  console.log(`  ▸ http://localhost:${PORT}`);
  console.log(`  ▸ env: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  ▸ mail: ${smtpReady ? 'SMTP configured' : 'local file fallback (data/messages.log.jsonl)'}`);
  console.log(`  ▸ origin: ${process.env.SITE_ORIGIN || '(derived from the Host header)'}\n`);

  // Loud, because these are the two ways a live deploy fails quietly.
  if (isProd) {
    if (!smtpReady) {
      console.warn(
        '  ⚠  SMTP is not configured and NODE_ENV=production.\n' +
          '     Most hosts (Render, Fly, Railway free tiers) have an ephemeral disk, so\n' +
          '     contact messages written to data/messages.log.jsonl are LOST on restart.\n' +
          '     Set SMTP_HOST / SMTP_USER / SMTP_PASS or the contact form is a black hole.\n'
      );
    }
    if (!process.env.SITE_ORIGIN) {
      console.warn(
        '  ⚠  SITE_ORIGIN is not set. Canonical URLs, the sitemap and social preview\n' +
          '     images will follow whatever Host header a request arrives with, which\n' +
          '     splits your SEO across the platform subdomain and your real domain.\n'
      );
    }
  }
});

export default app;
