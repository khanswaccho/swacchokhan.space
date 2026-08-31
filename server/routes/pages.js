import { Router } from 'express';
import { getRepos } from '../lib/github.js';
import profile from '../lib/profile.js';
import { NAV } from '../lib/nav.js';

const router = Router();

function base(page, extra = {}) {
  return {
    profile,
    nav: NAV,
    page,
    year: new Date().getFullYear(),
    ...extra,
  };
}

router.get('/', async (req, res, next) => {
  try {
    // If no local portrait has been dropped in yet, the GitHub avatar is his own
    // photo and already allowed by the CSP — a better placeholder than a monogram.
    const github = await getRepos(profile.githubUser);
    const avatar = github.profile?.avatar ? `${github.profile.avatar}&s=600` : null;

    res.render(
      'pages/home',
      base('home', {
        title: `${profile.identity.name} — ${profile.identity.headline}`,
        description: profile.seo.description,
        avatarFallback: avatar,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/journey', (req, res) => {
  res.render(
    'pages/journey',
    base('journey', {
      title: `Journey — ${profile.identity.name}`,
      description:
        'The chapters of Swaccho Khan: from a first computer in Sirajganj to AI and machine learning at UCSI, by way of video editing, teaching, e-commerce and Websthan.',
    })
  );
});

router.get('/portfolio', async (req, res, next) => {
  try {
    const github = await getRepos(profile.githubUser);
    res.render(
      'pages/portfolio',
      base('portfolio', {
        title: `Portfolio — ${profile.identity.name}`,
        description:
          'Open-source repositories, Websthan client work, written articles and the archived video editing portfolio of Swaccho Khan.',
        github,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/contact', (req, res) => {
  res.render(
    'pages/contact',
    base('contact', {
      title: `Contact — ${profile.identity.name}`,
      description: `Get in touch with Swaccho Khan — ${profile.identity.email}. Available for internships, freelance builds and collaboration.`,
      form: { values: {}, errors: {}, status: null },
    })
  );
});

export default router;
