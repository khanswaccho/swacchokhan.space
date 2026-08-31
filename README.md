# Swaccho Khan — personal branding & portfolio site

A 3D, glassmorphic portfolio for **Swaccho Khan** (KM Tariful Islam Shoccho) — AI
programmer, and founder of [Websthan](https://websthan.online), a web design and
digital marketing agency in Dhaka, Bangladesh.

Built as a small hardened Node/Express app rather than a static site, because the
contact form and the site assistant needed real CSRF protection, rate limiting and
a strict CSP.

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Then open <http://localhost:3000>. `npm start` runs it without the file watcher.

---

## What's on it

| Page | What it does |
|---|---|
| `/` | Hero with a WebGL neural field, a cursor glow + trail, the positioning statement, the two focus areas (AI/ML and Websthan), skills, hobbies |
| `/journey` | **The book** — a real 3D book you can turn, one spread per chapter, with a written bridge carrying each chapter into the next. Plus the academic / work / volunteering timeline |
| `/portfolio` | Websthan, live GitHub repositories, Medium writing, and the archived video-editing portfolio |
| `/contact` | CSRF-protected contact form, direct email, and every social link |

A **site assistant** floats on every page — a scripted chatbot answering contact,
location, skills, Websthan, leadership, education and availability questions. Every
reply is composed server-side from `data/profile.json`, so it cannot invent a
qualification, a client or a contact detail. Add an intent in
[`server/lib/assistant.js`](server/lib/assistant.js).

`/robots.txt` and `/sitemap.xml` are generated at request time.

---

## Editing the content

**Almost everything lives in [`data/profile.json`](data/profile.json).** Change it
and refresh — in development the file is re-read on every request, so there's no
build step and no restart.

That one file holds the identity and positioning copy, the location and geo data,
the social links, the four focus areas, the skill groups, the nine book chapters,
the timeline, the hobbies and the assistant's greeting. Adding a chapter to
`chapters` adds a spread to the 3D book *and* a card to the accessible reader
underneath it, automatically — including its `bridge` line.

### The one thing left to add

**A portrait.** Drop a square photo at `public/img/swaccho.jpg` (800×800 or larger)
and the hero picks it up automatically. Until then it falls back to the GitHub
avatar, and to a designed gradient monogram if that's unavailable too — nothing
ever renders broken.

### Regenerating the social card

```bash
npm run og
```

Node has no canvas, so this serves a one-off local page that paints the 1200×630
card with the real webfonts and posts it back to `public/img/og.jpg`. Re-run it
whenever the name, role or location in `data/profile.json` changes.

---

## Configuration

Everything is environment variables — see [`.env.example`](.env.example) for the
annotated list. The ones that matter:

| Variable | Why |
|---|---|
| `CSRF_SECRET` | **Required in production.** ≥32 chars. Without it a random secret is generated at boot and every existing form token is invalidated on restart. |
| `SITE_ORIGIN` | Canonical public origin, no trailing slash (e.g. `https://swacchokhan.com`). Drives canonical URLs, the sitemap and absolute social-preview links. Set it in production. |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Contact-form delivery. Leave empty and messages are appended to `data/messages.log.jsonl` instead — the form still works and nothing is lost. |
| `CONTACT_TO` | Where messages are sent. Defaults to `khanswaccho@gmail.com`. |
| `GITHUB_TOKEN` | Optional. A token with **no scopes** raises the GitHub API limit from 60/hr to 5000/hr. Server-side only — it never reaches the browser. |
| `PINNED_REPOS` | Comma-separated repo names to force to the front of the portfolio grid. |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the app. `1` for Render/Railway/Fly. |

### Gmail SMTP

Gmail rejects your normal password. Turn on 2-Step Verification, create an
[App Password](https://myaccount.google.com/apppasswords), and use that as
`SMTP_PASS` with `SMTP_USER=khanswaccho@gmail.com`.

---

## SEO

Targeted at Bangladesh, since that's where he and the agency are:

- Title, description and keywords lead with Dhaka and Bangladesh.
- `geo.region` (`BD-C`, Dhaka Division), `geo.placename`, `geo.position` and `ICBM`
  meta tags; `hreflang="en-bd"` with an `x-default`; `og:locale` `en_BD` with a
  `bn_BD` alternate; `<html lang="en-BD">`.
- JSON-LD `@graph` on every page tying together a `Person` (with a Bangladeshi
  `PostalAddress` and `GeoCoordinates`), a `ProfessionalService` for Websthan with
  `areaServed: Bangladesh`, a `WebSite` and a `WebPage`.
- Absolute canonical, `og:image` and `twitter:image` URLs built from `SITE_ORIGIN`.
- `robots.txt` allows everything except `/api/` and points at the sitemap.

After deploying, submit the sitemap in
[Google Search Console](https://search.google.com/search-console) and set the
Websthan site as a linked property — that's what actually moves local rankings.

---

## Security

The contact form and the assistant are the only state-changing endpoints, and both
are defended in depth:

- **CSRF** — a signed double-submit token: `nonce.expiry.HMAC-SHA256(...)`, held
  in an `HttpOnly; SameSite=Strict` cookie *and* embedded in the page. Both halves
  must match under a timing-safe comparison. The token is rotated after every
  successful send, so it can never be replayed. See [`server/lib/csrf.js`](server/lib/csrf.js).
- **Origin guard** — cross-origin `POST`s are rejected outright before the token is
  even checked, as an independent second layer.
- **Content-Security-Policy** — strict, with a fresh per-request nonce. No inline
  scripts run unless the server minted them; `script-src-attr` is `'none'`;
  `object-src`, `base-uri` and `frame-ancestors` are all locked down. three.js is
  vendored to `public/vendor/` so no CDN is ever contacted — the only third party
  the policy allows is Google Fonts, and only for stylesheets and font files.
- **Rate limiting** — 5 contact submissions per 15 minutes per IP, 60 assistant
  messages per 5 minutes, 300 requests/minute globally.
- **Bot filtering** — an off-screen honeypot field plus a minimum time-on-form.
  Both return a normal success response so scripted submitters learn nothing.
- **Input validation** — everything length-capped and stripped of control
  characters before use; email header fields are separately sanitised against
  CRLF injection; output is escaped where it's rendered.
- **Headers** — HSTS (production), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, a restrictive `Permissions-Policy`, COOP/CORP, and
  `Cache-Control: no-store` on any HTML carrying a token.
- HTTPS is enforced with a 308 redirect when `NODE_ENV=production`, and the CSRF
  cookie takes the `__Host-` prefix there.

---

## Accessibility & performance notes

- The 3D book has a full HTML chapter reader underneath it. It's what screen
  readers and search engines get, it's what renders if WebGL is unavailable, and
  below 720px it's shown alongside the book because a two-page spread is
  unreadable at phone width.
- `prefers-reduced-motion` is honoured throughout — the cursor effects, scroll
  reveals, the auto-opening book and the ambient animation all stand down.
- Both WebGL scenes pause when scrolled out of view or when the tab is hidden.
- The GitHub feed is fetched server-side and cached in memory (30 min by
  default), so the API limit is spent once per window rather than once per visitor,
  and a stale cache is always preferred over an error.

---

## Project layout

```
data/profile.json      ← all site content
server/
  index.js             app, middleware order, error handling
  lib/csrf.js          signed double-submit CSRF
  lib/security.js      CSP + headers + origin guard
  lib/validate.js      input validation & sanitisation
  lib/mailer.js        SMTP with local-file fallback
  lib/github.js        cached, normalised repo feed
  lib/assistant.js     the site assistant's intent table
  routes/              pages.js, api.js
views/                 EJS templates (partials/ + pages/)
public/
  css/                 base.css, components.css, pages.css, chat.css
  js/                  main.js, hero.js, book.js, repos.js, contact.js, chat.js
  vendor/              three.js, copied from node_modules on install
scripts/
  vendor-three.js      postinstall copy step
  make-og.mjs          social card generator (npm run og)
```

---

## Deploying

Any Node host works. The repo ships a `Procfile`, an `.nvmrc` and a
[`render.yaml`](render.yaml) blueprint.

**Render** — import the repo; it reads `render.yaml`, generates `CSRF_SECRET`
itself, and asks you for `SITE_ORIGIN`, `SMTP_USER` and `SMTP_PASS`.

**Anywhere else** — set `NODE_ENV=production`, `CSRF_SECRET`, `SITE_ORIGIN` and the
SMTP variables, then run:

```bash
npm install && npm start
```

`public/vendor/` is git-ignored and regenerated by the `postinstall` script, so the
host must run install **with scripts enabled** (plain `npm install`, not
`npm ci --ignore-scripts`). Health check endpoint: `/api/health`.
