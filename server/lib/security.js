/**
 * Security headers.
 *
 * A per-request nonce drives a strict Content-Security-Policy, so no inline
 * <script> can execute unless we minted it. Everything else (three.js included)
 * is served from our own origin — the only third party the policy permits is
 * Google Fonts, and only for stylesheets and font files.
 */
import crypto from 'node:crypto';
import helmet from 'helmet';

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

/** Attaches a fresh CSP nonce to every response. */
export function nonceMiddleware(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

export function securityHeaders() {
  const isProd = process.env.NODE_ENV === 'production';

  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'none'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'script-src': ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
          'script-src-attr': ["'none'"],
          'style-src': ["'self'", GOOGLE_FONTS_CSS, (req, res) => `'nonce-${res.locals.cspNonce}'`],
          // JS-driven style properties are CSSOM and unaffected by CSP; this only
          // permits the handful of static `style="--i:2"` custom-property hooks
          // used for staggering animations in the templates.
          'style-src-attr': ["'unsafe-inline'"],
          'font-src': ["'self'", GOOGLE_FONTS_FILES, 'data:'],
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://avatars.githubusercontent.com',
            'https://opengraph.githubassets.com',
          ],
          'connect-src': ["'self'"],
          'media-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'manifest-src': ["'self'"],
          ...(isProd ? { 'upgrade-insecure-requests': [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false, // would block the Google Fonts files
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProd
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      frameguard: { action: 'deny' },
      noSniff: true,
      originAgentCluster: true,
      dnsPrefetchControl: { allow: false },
      ieNoOpen: true,
      hidePoweredBy: true,
      xssFilter: true,
    }),

    // Headers helmet doesn't cover.
    (req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        [
          'accelerometer=()',
          'autoplay=()',
          'camera=()',
          'display-capture=()',
          'encrypted-media=()',
          'geolocation=()',
          'gyroscope=()',
          'interest-cohort=()',
          'magnetometer=()',
          'microphone=()',
          'payment=()',
          'usb=()',
        ].join(', ')
      );
      next();
    },
  ];
}

/**
 * Blocks cross-origin state-changing requests outright by checking Origin /
 * Referer against the host. A second, independent layer behind the CSRF token.
 */
export function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const host = req.get('host');
  const source = req.get('origin') || req.get('referer');
  if (!source) {
    return res.status(403).json({
      ok: false,
      error: 'origin_missing',
      message: 'Request rejected: missing origin.',
    });
  }

  let sourceHost;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return res.status(403).json({ ok: false, error: 'origin_malformed', message: 'Request rejected.' });
  }

  const allowed = new Set([host, ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  if (!allowed.has(sourceHost)) {
    return res.status(403).json({
      ok: false,
      error: 'origin_rejected',
      message: 'Request rejected: cross-origin submissions are not accepted.',
    });
  }
  next();
}

/** HTML carrying a CSRF token must never be cached by a shared proxy. */
export function noStoreHtml(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
}
