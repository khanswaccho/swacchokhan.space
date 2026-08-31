/**
 * Input validation and normalisation for the contact form.
 *
 * Everything is treated as hostile: length-capped before any work is done,
 * stripped of control characters, and escaped at the point it is rendered
 * (HTML e-mail body) rather than at the point it is received.
 */

const LIMITS = {
  name: { min: 2, max: 80 },
  email: { min: 5, max: 254 },
  subject: { min: 0, max: 120 },
  message: { min: 12, max: 4000 },
};

// Deliberately conservative: one @, a dot in the domain, no whitespace, no
// angle brackets or commas that could be used for header smuggling.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

const CONTROL_CHARS = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', 'g');

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips anything that could break out of a MIME header line. */
export function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(CONTROL_CHARS, '').trim().slice(0, 200);
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

/**
 * @returns {{ ok: boolean, data?: object, errors?: Record<string,string> }}
 */
export function validateContact(body = {}) {
  const errors = {};

  const name = clean(body.name, LIMITS.name.max);
  const email = clean(body.email, LIMITS.email.max).toLowerCase();
  const subject = clean(body.subject, LIMITS.subject.max);
  const message = clean(body.message, LIMITS.message.max);

  if (name.length < LIMITS.name.min) {
    errors.name = `Please give me a name of at least ${LIMITS.name.min} characters.`;
  } else if (/https?:\/\//i.test(name)) {
    errors.name = 'That name does not look like a name.';
  }

  if (!email) {
    errors.email = 'An email address is required so I can reply.';
  } else if (email.length < LIMITS.email.min || !EMAIL_RE.test(email)) {
    errors.email = 'That email address does not look valid.';
  }

  if (subject.length > LIMITS.subject.max) {
    errors.subject = 'Subject is too long.';
  }

  if (message.length < LIMITS.message.min) {
    errors.message = `Tell me a little more — at least ${LIMITS.message.min} characters.`;
  }

  // Cheap spam signal: link-stuffed messages.
  const linkCount = (message.match(/https?:\/\//gi) || []).length;
  if (linkCount > 4) {
    errors.message = 'That message contains too many links to accept.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      email,
      subject: subject || 'New message from swacchokhan.com',
      message,
    },
  };
}

/**
 * Bot heuristics that do not inconvenience a human:
 *  - a honeypot field no real user can see or fill
 *  - a minimum time-on-form (scripts submit instantly)
 */
export function detectBot(body = {}, { minSeconds = 3, maxSeconds = 60 * 60 * 6 } = {}) {
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { bot: true, reason: 'honeypot' };
  }
  const started = Number(body.renderedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed < minSeconds) return { bot: true, reason: 'too_fast' };
    if (elapsed > maxSeconds) return { bot: true, reason: 'stale_form' };
  }
  return { bot: false };
}

export { LIMITS };
