/**
 * CSRF protection — signed double-submit cookie pattern (OWASP recommended).
 *
 * How it works
 * ------------
 * 1. On every page render we mint a token:  nonce.expiry.HMAC-SHA256(nonce.expiry)
 * 2. The token is stored in an HttpOnly, SameSite=Strict cookie AND embedded in
 *    the page (meta tag + hidden form field).
 * 3. On a state-changing request we require both, and they must match byte for
 *    byte under a timing-safe comparison, carry a valid signature, and not be
 *    expired.
 *
 * An attacker on another origin can forge a request but cannot read our page to
 * learn the token, and cannot read or set the cookie (HttpOnly + SameSite), so
 * the two halves can never be made to agree.
 */
import crypto from 'node:crypto';

const COOKIE_NAME = '__Host-csrf';
const COOKIE_NAME_INSECURE = 'csrf'; // __Host- prefix requires HTTPS
const FIELD_NAME = '_csrf';
const HEADER_NAME = 'x-csrf-token';
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const SECRET = (() => {
  const fromEnv = process.env.CSRF_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[security] CSRF_SECRET is missing or shorter than 32 chars. ' +
        'A random secret was generated — tokens will be invalidated on every restart. ' +
        'Set CSRF_SECRET in your environment.'
    );
  }
  return crypto.randomBytes(48).toString('hex');
})();

const isSecureEnv = () => process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === '1';
const cookieName = () => (isSecureEnv() ? COOKIE_NAME : COOKIE_NAME_INSECURE);

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function mint() {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const expiry = String(Date.now() + TTL_MS);
  const payload = `${nonce}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

function isWellFormed(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 400) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiry, mac] = parts;
  if (!nonce || !expiry || !mac) return false;
  if (!/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = sign(`${nonce}.${expiry}`);
  return timingSafeEqual(mac, expected);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length doesn't leak through timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Minimal, allocation-light cookie header parser — avoids an extra dependency. */
export function parseCookies(header) {
  const out = Object.create(null);
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function setTokenCookie(res, token) {
  const secure = isSecureEnv();
  const attrs = [
    `${cookieName()}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const cookie = attrs.join('; ');
  res.setHeader('Set-Cookie', existing ? [].concat(existing, cookie) : cookie);
}

/**
 * Issues a token for the current request and exposes it as `res.locals.csrfToken`
 * so templates can embed it. Reuses a still-valid cookie token so that opening
 * several tabs doesn't invalidate the others.
 */
export function csrfIssue(req, res, next) {
  req.cookies = req.cookies || parseCookies(req.headers.cookie);
  const existing = req.cookies[cookieName()];
  let token = isWellFormed(existing) ? existing : null;
  if (!token) {
    token = mint();
    setTokenCookie(res, token);
  }
  res.locals.csrfToken = token;
  req.csrfToken = token;
  next();
}

/** Rejects any state-changing request whose token is missing, stale or mismatched. */
export function csrfVerify(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  req.cookies = req.cookies || parseCookies(req.headers.cookie);
  const cookieToken = req.cookies[cookieName()];
  const sentToken =
    req.get(HEADER_NAME) ||
    (req.body && typeof req.body === 'object' ? req.body[FIELD_NAME] : undefined);

  const fail = (reason) => {
    res.status(403);
    const payload = {
      ok: false,
      error: 'csrf_failed',
      message: 'Your session token expired or could not be verified. Please refresh the page and try again.',
    };
    if (process.env.NODE_ENV !== 'production') payload.reason = reason;
    if (req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) {
      return res.json(payload);
    }
    return res.render('pages/error', {
      status: 403,
      title: 'Verification failed',
      message: payload.message,
    });
  };

  if (!cookieToken) return fail('no_cookie');
  if (!sentToken) return fail('no_token_submitted');
  if (!isWellFormed(cookieToken)) return fail('cookie_invalid_or_expired');
  if (!timingSafeEqual(cookieToken, sentToken)) return fail('mismatch');

  next();
}

/** Issues a fresh token after a successful mutation, so a token is never replayed. */
export function csrfRotate(req, res) {
  const token = mint();
  setTokenCookie(res, token);
  res.locals.csrfToken = token;
  return token;
}

export const csrfConfig = { FIELD_NAME, HEADER_NAME, cookieName };
