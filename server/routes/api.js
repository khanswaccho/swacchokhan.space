import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { csrfRotate } from '../lib/csrf.js';
import { getRepos } from '../lib/github.js';
import { sendContactMessage, mailerStatus } from '../lib/mailer.js';
import { validateContact, detectBot } from '../lib/validate.js';
import { ask } from '../lib/assistant.js';
import profile from '../lib/profile.js';

const router = Router();

/** Contact submissions: deliberately tight. */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'rate_limited',
    message: 'That is a lot of messages in a short time. Please try again in a few minutes.',
  },
});

const readLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.post('/contact', contactLimiter, async (req, res) => {
  const bot = detectBot(req.body);
  if (bot.bot) {
    // Answer exactly like a success so scripted submitters learn nothing.
    console.warn(`[contact] discarded submission (${bot.reason})`);
    return res.status(200).json({ ok: true, message: 'Thanks — your message has been sent.' });
  }

  const result = validateContact(req.body);
  if (!result.ok) {
    return res.status(422).json({
      ok: false,
      error: 'validation_failed',
      message: 'Some fields need another look.',
      errors: result.errors,
    });
  }

  try {
    const outcome = await sendContactMessage(result.data, {
      userAgent: String(req.get('user-agent') || '').slice(0, 200),
      ip: req.ip,
    });
    const token = csrfRotate(req, res);
    return res.status(200).json({
      ok: true,
      message: "Message sent. I'll get back to you soon.",
      mode: outcome.mode,
      csrfToken: token,
    });
  } catch {
    return res.status(502).json({
      ok: false,
      error: 'delivery_failed',
      message: `The message could not be delivered right now. Please email me directly at ${profile.identity.email}.`,
    });
  }
});

/** Site assistant. Answers only from data/profile.json — see lib/assistant.js. */
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'rate_limited',
    message: 'That is a lot of questions at once — give it a minute.',
  },
});

router.post('/chat', chatLimiter, (req, res) => {
  const message = req.body && typeof req.body.message === 'string' ? req.body.message : '';

  if (message.length > 500) {
    return res.status(422).json({
      ok: false,
      error: 'too_long',
      message: 'That question is a bit long — try trimming it down.',
    });
  }

  const result = ask(message);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ...result });
});

router.get('/repos', readLimiter, async (req, res) => {
  const data = await getRepos(profile.githubUser);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: !data.error, ...data });
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    mailer: mailerStatus(),
    env: process.env.NODE_ENV || 'development',
  });
});

export default router;
